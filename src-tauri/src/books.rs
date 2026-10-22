//! Écritures atomiques des livres et des mangas.
//!
//! Une bibliothèque = une table : `books` (livres, avec une colonne `category`
//! valant `livre`) et `mangas` (mangas, sans colonne `category`). Les comics
//! ont leur propre bibliothèque depuis la migration 0021 : une fiche de
//! catégorie `comics` est refusée ici. Les citations suivent la fiche :
//! `book_quotes.book_id` ou `manga_quotes.manga_id`.
//!
//! Le contrat venu du front :
//! - `create_book_atomically` écrit dans la table annoncée par `library` ;
//! - `update_book_atomically` reçoit la table *actuelle* dans `library` et
//!   déduit la table cible de `book.category` (`manga` → `mangas`, sinon
//!   `books`). Si les deux diffèrent, la fiche est déplacée avec le même
//!   identifiant, ses citations et son lien fournisseur, dans une transaction
//!   unique ;
//! - `delete_book_atomically` supprime dans la table annoncée par `library`.
//!
//! Toutes les écritures restent dans une seule transaction : en cas d’échec,
//! rien n’est conservé, y compris lors d’un déplacement entre bibliothèques.

use serde::Deserialize;
use sqlx::{Sqlite, SqlitePool, Transaction};
use tauri::State;
use tauri_plugin_sql::DbInstances;

use crate::portability::sqlite_pool;

/// Refus de toute écriture d’un comic dans Livres ou Mangas : depuis la
/// migration 0021, les comics vivent dans leur propre table `comics`.
pub(crate) const COMICS_HAVE_THEIR_OWN_LIBRARY: &str =
    "Les comics ont leur propre bibliothèque : enregistrez-les dans la bibliothèque Comics.";

/// Catégorie historique des comics dans `books`, quelle que soit sa casse.
pub(crate) fn is_comics_category(category: &str) -> bool {
    category.trim().eq_ignore_ascii_case("comics")
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookWritePayload {
    book: BookWriteInput,
    quotes: Vec<BookQuoteWriteInput>,
    /// Table qui contient la fiche au moment de l’appel : `books` ou `mangas`.
    library: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BookWriteInput {
    id: String,
    profile_id: String,
    title: String,
    author: Option<String>,
    year: Option<i64>,
    summary: Option<String>,
    category: String,
    status: String,
    rating: Option<f64>,
    is_favorite: bool,
    volumes_read: Option<i64>,
    volumes_total: Option<i64>,
    progress_updated_at: Option<String>,
    started_at: Option<String>,
    cover_url: Option<String>,
    personal_note: Option<String>,
    created_at: String,
    updated_at: String,
}

/// Le champ `bookId` du domaine reste unique côté TypeScript : pour un manga il
/// alimente la colonne `manga_id` de `manga_quotes`.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BookQuoteWriteInput {
    id: String,
    book_id: String,
    body: String,
    position: i64,
    created_at: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BookLibrary {
    Books,
    Mangas,
}

impl BookLibrary {
    fn parse(raw: &str) -> Result<Self, String> {
        match raw.trim() {
            "books" => Ok(Self::Books),
            "mangas" => Ok(Self::Mangas),
            other => Err(format!("Bibliothèque de livres inconnue : « {other} ».")),
        }
    }

    /// `books` porte une catégorie réelle (`livre`) ; `mangas` la synthétise
    /// côté lecture. Une fiche `comics` n’a plus sa place dans ces tables.
    fn from_category(category: &str) -> Result<Self, String> {
        match category.trim() {
            "manga" => Ok(Self::Mangas),
            "livre" => Ok(Self::Books),
            other if is_comics_category(other) => Err(COMICS_HAVE_THEIR_OWN_LIBRARY.to_string()),
            other => Err(format!("Catégorie de livre inconnue : « {other} ».")),
        }
    }

    fn table(self) -> &'static str {
        match self {
            Self::Books => "books",
            Self::Mangas => "mangas",
        }
    }

    fn quotes_table(self) -> &'static str {
        match self {
            Self::Books => "book_quotes",
            Self::Mangas => "manga_quotes",
        }
    }

    fn quote_owner_column(self) -> &'static str {
        match self {
            Self::Books => "book_id",
            Self::Mangas => "manga_id",
        }
    }

    /// Médium des liens fournisseurs : identique au nom de la table.
    fn medium(self) -> &'static str {
        self.table()
    }

    fn label(self) -> &'static str {
        match self {
            Self::Books => "Livres",
            Self::Mangas => "Mangas",
        }
    }
}

fn validate_payload(payload: &BookWritePayload) -> Result<(), String> {
    if payload.book.id.trim().is_empty() || payload.book.profile_id.trim().is_empty() {
        return Err("Le livre ou son profil possède un identifiant invalide.".to_string());
    }
    if payload.book.title.trim().is_empty() {
        return Err("Le titre du livre est obligatoire.".to_string());
    }

    for (index, quote) in payload.quotes.iter().enumerate() {
        if quote.id.trim().is_empty() || quote.book_id != payload.book.id {
            return Err("Une citation ne correspond pas au livre à enregistrer.".to_string());
        }
        if quote.body.trim().is_empty() || quote.position != index as i64 {
            return Err("Les citations doivent être non vides et ordonnées.".to_string());
        }
    }

    Ok(())
}

/// À la création, la table est imposée par le client ; on refuse seulement une
/// fiche contradictoire (un manga ne s’écrit jamais dans `books`).
fn create_target(payload: &BookWritePayload) -> Result<BookLibrary, String> {
    let library = BookLibrary::parse(&payload.library)?;
    let category_library = BookLibrary::from_category(&payload.book.category)?;
    if library == BookLibrary::Books && category_library == BookLibrary::Mangas {
        return Err("Un manga doit être enregistré dans la bibliothèque Mangas.".to_string());
    }
    Ok(library)
}

fn update_target(book: &BookWriteInput) -> Result<BookLibrary, String> {
    BookLibrary::from_category(&book.category)
}

async fn insert_book_row(
    transaction: &mut Transaction<'_, Sqlite>,
    library: BookLibrary,
    book: &BookWriteInput,
) -> Result<u64, String> {
    let result = match library {
        BookLibrary::Books => {
            sqlx::query(
                "INSERT INTO books (
               id, profile_id, title, author, year, summary, category, status,
               rating, is_favorite, volumes_read, volumes_total, progress_updated_at,
               started_at, cover_url, personal_note, created_at, updated_at
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15, $16, $17, $18
             )",
            )
            .bind(&book.id)
            .bind(&book.profile_id)
            .bind(&book.title)
            .bind(&book.author)
            .bind(book.year)
            .bind(&book.summary)
            .bind(&book.category)
            .bind(&book.status)
            .bind(book.rating)
            .bind(if book.is_favorite { 1_i64 } else { 0_i64 })
            .bind(book.volumes_read)
            .bind(book.volumes_total)
            .bind(&book.progress_updated_at)
            .bind(&book.started_at)
            .bind(&book.cover_url)
            .bind(&book.personal_note)
            .bind(&book.created_at)
            .bind(&book.updated_at)
            .execute(&mut **transaction)
            .await
        }
        BookLibrary::Mangas => {
            sqlx::query(
                "INSERT INTO mangas (
               id, profile_id, title, author, year, summary, status,
               rating, is_favorite, volumes_read, volumes_total, progress_updated_at,
               started_at, cover_url, personal_note, created_at, updated_at
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15, $16, $17
             )",
            )
            .bind(&book.id)
            .bind(&book.profile_id)
            .bind(&book.title)
            .bind(&book.author)
            .bind(book.year)
            .bind(&book.summary)
            .bind(&book.status)
            .bind(book.rating)
            .bind(if book.is_favorite { 1_i64 } else { 0_i64 })
            .bind(book.volumes_read)
            .bind(book.volumes_total)
            .bind(&book.progress_updated_at)
            .bind(&book.started_at)
            .bind(&book.cover_url)
            .bind(&book.personal_note)
            .bind(&book.created_at)
            .bind(&book.updated_at)
            .execute(&mut **transaction)
            .await
        }
    };

    result
        .map(|outcome| outcome.rows_affected())
        .map_err(|error| {
            format!(
                "Impossible d’enregistrer le livre dans la bibliothèque {} : {error}",
                library.label()
            )
        })
}

async fn update_book_row(
    transaction: &mut Transaction<'_, Sqlite>,
    library: BookLibrary,
    book: &BookWriteInput,
) -> Result<u64, String> {
    let result = match library {
        BookLibrary::Books => {
            sqlx::query(
                "UPDATE books
             SET title = $1,
                 author = $2,
                 year = $3,
                 summary = $4,
                 category = $5,
                 status = $6,
                 rating = $7,
                 is_favorite = $8,
                 volumes_read = $9,
                 volumes_total = $10,
                 progress_updated_at = $11,
                 started_at = $12,
                 cover_url = $13,
                 personal_note = $14,
                 updated_at = $15
             WHERE id = $16 AND profile_id = $17",
            )
            .bind(&book.title)
            .bind(&book.author)
            .bind(book.year)
            .bind(&book.summary)
            .bind(&book.category)
            .bind(&book.status)
            .bind(book.rating)
            .bind(if book.is_favorite { 1_i64 } else { 0_i64 })
            .bind(book.volumes_read)
            .bind(book.volumes_total)
            .bind(&book.progress_updated_at)
            .bind(&book.started_at)
            .bind(&book.cover_url)
            .bind(&book.personal_note)
            .bind(&book.updated_at)
            .bind(&book.id)
            .bind(&book.profile_id)
            .execute(&mut **transaction)
            .await
        }
        BookLibrary::Mangas => {
            sqlx::query(
                "UPDATE mangas
             SET title = $1,
                 author = $2,
                 year = $3,
                 summary = $4,
                 status = $5,
                 rating = $6,
                 is_favorite = $7,
                 volumes_read = $8,
                 volumes_total = $9,
                 progress_updated_at = $10,
                 started_at = $11,
                 cover_url = $12,
                 personal_note = $13,
                 updated_at = $14
             WHERE id = $15 AND profile_id = $16",
            )
            .bind(&book.title)
            .bind(&book.author)
            .bind(book.year)
            .bind(&book.summary)
            .bind(&book.status)
            .bind(book.rating)
            .bind(if book.is_favorite { 1_i64 } else { 0_i64 })
            .bind(book.volumes_read)
            .bind(book.volumes_total)
            .bind(&book.progress_updated_at)
            .bind(&book.started_at)
            .bind(&book.cover_url)
            .bind(&book.personal_note)
            .bind(&book.updated_at)
            .bind(&book.id)
            .bind(&book.profile_id)
            .execute(&mut **transaction)
            .await
        }
    };

    result
        .map(|outcome| outcome.rows_affected())
        .map_err(|error| {
            format!(
                "Impossible de modifier le livre dans la bibliothèque {} : {error}",
                library.label()
            )
        })
}

async fn insert_quotes(
    transaction: &mut Transaction<'_, Sqlite>,
    library: BookLibrary,
    quotes: &[BookQuoteWriteInput],
) -> Result<(), String> {
    let statement = format!(
        "INSERT INTO {} (id, {}, body, position, created_at)
         VALUES ($1, $2, $3, $4, $5)",
        library.quotes_table(),
        library.quote_owner_column()
    );

    for quote in quotes {
        sqlx::query(&statement)
            .bind(&quote.id)
            .bind(&quote.book_id)
            .bind(&quote.body)
            .bind(quote.position)
            .bind(&quote.created_at)
            .execute(&mut **transaction)
            .await
            .map_err(|error| format!("Impossible d’enregistrer une citation : {error}"))?;
    }

    Ok(())
}

async fn replace_quotes(
    transaction: &mut Transaction<'_, Sqlite>,
    library: BookLibrary,
    book_id: &str,
    quotes: &[BookQuoteWriteInput],
) -> Result<(), String> {
    sqlx::query(&format!(
        "DELETE FROM {} WHERE {} = $1",
        library.quotes_table(),
        library.quote_owner_column()
    ))
    .bind(book_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| format!("Impossible de remplacer les citations : {error}"))?;

    insert_quotes(transaction, library, quotes).await
}

async fn ensure_book_present(
    transaction: &mut Transaction<'_, Sqlite>,
    library: BookLibrary,
    profile_id: &str,
    book_id: &str,
) -> Result<(), String> {
    let count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {} WHERE id = $1 AND profile_id = $2",
        library.table()
    ))
    .bind(book_id)
    .bind(profile_id)
    .fetch_one(&mut **transaction)
    .await
    .map_err(|error| format!("Impossible de relire le livre à modifier : {error}"))?;

    if count != 1 {
        return Err("Le livre à modifier est introuvable dans le profil courant.".to_string());
    }

    Ok(())
}

/// Déplace la fiche entière vers l’autre table : mêmes identifiants, mêmes
/// données, citations et lien fournisseur compris. Le lien est déplacé avant la
/// suppression de la ligne source pour que le déclencheur `AFTER DELETE` de
/// l’ancienne table ne l’efface pas.
async fn move_book(
    transaction: &mut Transaction<'_, Sqlite>,
    source: BookLibrary,
    target: BookLibrary,
    book: &BookWriteInput,
    quotes: &[BookQuoteWriteInput],
) -> Result<(), String> {
    ensure_book_present(transaction, source, &book.profile_id, &book.id).await?;

    let inserted = insert_book_row(transaction, target, book).await?;
    if inserted != 1 {
        return Err("Le déplacement du livre n’a écrit aucune ligne SQLite.".to_string());
    }

    insert_quotes(transaction, target, quotes)
        .await
        .map_err(|error| {
            format!(
                "Impossible de déplacer les citations vers la bibliothèque {} : {error}",
                target.label()
            )
        })?;

    sqlx::query(&format!(
        "DELETE FROM {} WHERE {} = $1",
        source.quotes_table(),
        source.quote_owner_column()
    ))
    .bind(&book.id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| format!("Impossible de retirer les citations d’origine : {error}"))?;

    sqlx::query(
        "UPDATE media_provider_links
         SET medium = $1, updated_at = $2
         WHERE profile_id = $3 AND medium = $4 AND media_id = $5",
    )
    .bind(target.medium())
    .bind(&book.updated_at)
    .bind(&book.profile_id)
    .bind(source.medium())
    .bind(&book.id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| format!("Impossible de déplacer le lien fournisseur du livre : {error}"))?;

    let deleted = sqlx::query(&format!(
        "DELETE FROM {} WHERE id = $1 AND profile_id = $2",
        source.table()
    ))
    .bind(&book.id)
    .bind(&book.profile_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| {
        format!(
            "Impossible de retirer le livre de la bibliothèque {} : {error}",
            source.label()
        )
    })?
    .rows_affected();

    if deleted != 1 {
        return Err("Le livre à déplacer est introuvable dans le profil courant.".to_string());
    }

    Ok(())
}

async fn create_book_in_pool(pool: &SqlitePool, payload: BookWritePayload) -> Result<(), String> {
    validate_payload(&payload)?;
    let library = create_target(&payload)?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer l’enregistrement du livre : {error}"))?;

    let inserted = insert_book_row(&mut transaction, library, &payload.book).await?;
    if inserted != 1 {
        return Err("La création du livre n’a modifié aucune ligne SQLite.".to_string());
    }

    insert_quotes(&mut transaction, library, &payload.quotes).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser la création du livre : {error}"))?;
    Ok(())
}

async fn update_book_in_pool(pool: &SqlitePool, payload: BookWritePayload) -> Result<(), String> {
    validate_payload(&payload)?;
    let source = BookLibrary::parse(&payload.library)?;
    let target = update_target(&payload.book)?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer la modification du livre : {error}"))?;

    if source == target {
        let updated = update_book_row(&mut transaction, target, &payload.book).await?;
        if updated != 1 {
            return Err("Le livre à modifier est introuvable dans le profil courant.".to_string());
        }
        replace_quotes(&mut transaction, target, &payload.book.id, &payload.quotes).await?;
    } else {
        move_book(
            &mut transaction,
            source,
            target,
            &payload.book,
            &payload.quotes,
        )
        .await?;
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser la modification du livre : {error}"))?;
    Ok(())
}

async fn delete_book_in_pool(
    pool: &SqlitePool,
    profile_id: &str,
    book_id: &str,
    library: BookLibrary,
) -> Result<(), String> {
    if profile_id.trim().is_empty() || book_id.trim().is_empty() {
        return Err("Le livre ou son profil possède un identifiant invalide.".to_string());
    }

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer la suppression du livre : {error}"))?;

    sqlx::query(&format!(
        "DELETE FROM {} WHERE {} = $1",
        library.quotes_table(),
        library.quote_owner_column()
    ))
    .bind(book_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible de supprimer les citations du livre : {error}"))?;

    let result = sqlx::query(&format!(
        "DELETE FROM {} WHERE id = $1 AND profile_id = $2",
        library.table()
    ))
    .bind(book_id)
    .bind(profile_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible de supprimer le livre : {error}"))?;

    if result.rows_affected() != 1 {
        return Err("Le livre à supprimer est introuvable dans le profil courant.".to_string());
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser la suppression du livre : {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn create_book_atomically(
    db_instances: State<'_, DbInstances>,
    payload: BookWritePayload,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    create_book_in_pool(&pool, payload).await
}

#[tauri::command]
pub async fn update_book_atomically(
    db_instances: State<'_, DbInstances>,
    payload: BookWritePayload,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    update_book_in_pool(&pool, payload).await
}

#[tauri::command]
pub async fn delete_book_atomically(
    db_instances: State<'_, DbInstances>,
    profile_id: String,
    book_id: String,
    library: String,
) -> Result<(), String> {
    let library = BookLibrary::parse(&library)?;
    let pool = sqlite_pool(&db_instances).await?;
    delete_book_in_pool(&pool, &profile_id, &book_id, library).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::Row;

    /// Schéma fidèle à celui produit par les migrations 0010 et 0020 : `books`
    /// garde sa colonne `category`, `mangas` n’en a pas, chaque table a ses
    /// citations et les déclencheurs de liens fournisseurs existent.
    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("base SQLite de test");

        sqlx::raw_sql(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE profiles (id TEXT PRIMARY KEY NOT NULL);
             INSERT INTO profiles (id) VALUES ('default');
             CREATE TABLE books (
               id TEXT PRIMARY KEY NOT NULL,
               profile_id TEXT NOT NULL,
               title TEXT NOT NULL CHECK (length(trim(title)) > 0),
               author TEXT,
               year INTEGER,
               summary TEXT,
               category TEXT NOT NULL CHECK (category IN ('livre', 'manga', 'comics')),
               status TEXT NOT NULL CHECK (status IN ('à lire', 'en cours', 'abandonné', 'lu')),
               rating REAL CHECK (rating IS NULL OR (rating BETWEEN 0.5 AND 5.0 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
               is_favorite INTEGER NOT NULL CHECK (is_favorite IN (0, 1)),
               volumes_read INTEGER CHECK (volumes_read IS NULL OR volumes_read >= 0),
               volumes_total INTEGER CHECK (volumes_total IS NULL OR volumes_total >= 0),
               progress_updated_at TEXT,
               started_at TEXT,
               cover_url TEXT,
               personal_note TEXT,
               created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL,
               CHECK (volumes_read IS NULL OR volumes_total IS NULL OR volumes_read <= volumes_total),
               FOREIGN KEY (profile_id) REFERENCES profiles(id)
             );
             CREATE TABLE book_quotes (
               id TEXT PRIMARY KEY NOT NULL,
               book_id TEXT NOT NULL,
               body TEXT NOT NULL CHECK (length(trim(body)) > 0),
               position INTEGER NOT NULL CHECK (position >= 0),
               created_at TEXT NOT NULL,
               FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
             );
             CREATE TABLE mangas (
               id TEXT PRIMARY KEY NOT NULL,
               profile_id TEXT NOT NULL,
               title TEXT NOT NULL CHECK (length(trim(title)) > 0),
               author TEXT,
               year INTEGER,
               summary TEXT,
               status TEXT NOT NULL CHECK (status IN ('à lire', 'en cours', 'abandonné', 'lu')),
               rating REAL CHECK (rating IS NULL OR (rating BETWEEN 0.5 AND 5.0 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
               is_favorite INTEGER NOT NULL CHECK (is_favorite IN (0, 1)),
               volumes_read INTEGER CHECK (volumes_read IS NULL OR volumes_read >= 0),
               volumes_total INTEGER CHECK (volumes_total IS NULL OR volumes_total >= 0),
               progress_updated_at TEXT,
               started_at TEXT,
               cover_url TEXT,
               personal_note TEXT,
               created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL,
               CHECK (volumes_read IS NULL OR volumes_total IS NULL OR volumes_read <= volumes_total),
               FOREIGN KEY (profile_id) REFERENCES profiles(id)
             );
             CREATE TABLE manga_quotes (
               id TEXT PRIMARY KEY NOT NULL,
               manga_id TEXT NOT NULL,
               body TEXT NOT NULL CHECK (length(trim(body)) > 0),
               position INTEGER NOT NULL CHECK (position >= 0),
               created_at TEXT NOT NULL,
               FOREIGN KEY (manga_id) REFERENCES mangas(id) ON DELETE CASCADE
             );
             CREATE TABLE media_provider_links (
               profile_id TEXT NOT NULL,
               medium TEXT NOT NULL CHECK (medium IN ('series', 'anime', 'books', 'mangas', 'games')),
               media_id TEXT NOT NULL,
               provider_name TEXT NOT NULL,
               provider_id TEXT NOT NULL,
               created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL,
               PRIMARY KEY (profile_id, medium, media_id),
               FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
             );
             CREATE TRIGGER delete_book_provider_link
             AFTER DELETE ON books
             BEGIN
               DELETE FROM media_provider_links
               WHERE profile_id = OLD.profile_id AND medium = 'books' AND media_id = OLD.id;
             END;
             CREATE TRIGGER delete_manga_provider_link
             AFTER DELETE ON mangas
             BEGIN
               DELETE FROM media_provider_links
               WHERE profile_id = OLD.profile_id AND medium = 'mangas' AND media_id = OLD.id;
             END;",
        )
        .execute(&pool)
        .await
        .expect("schéma Livres/Mangas de test");
        pool
    }

    fn payload(library: BookLibrary, category: &str) -> BookWritePayload {
        BookWritePayload {
            book: BookWriteInput {
                id: "book-1".to_string(),
                profile_id: "default".to_string(),
                title: "Livre initial".to_string(),
                author: Some("Autrice".to_string()),
                year: Some(2026),
                summary: None,
                category: category.to_string(),
                status: "en cours".to_string(),
                rating: Some(4.5),
                is_favorite: true,
                volumes_read: Some(2),
                volumes_total: Some(4),
                progress_updated_at: Some("2026-07-22T10:00:00.000Z".to_string()),
                started_at: Some("2026-07-01".to_string()),
                cover_url: None,
                personal_note: None,
                created_at: "2026-07-22T10:00:00.000Z".to_string(),
                updated_at: "2026-07-22T10:00:00.000Z".to_string(),
            },
            quotes: vec![
                BookQuoteWriteInput {
                    id: "quote-1".to_string(),
                    book_id: "book-1".to_string(),
                    body: "Première citation".to_string(),
                    position: 0,
                    created_at: "2026-07-22T10:00:00.000Z".to_string(),
                },
                BookQuoteWriteInput {
                    id: "quote-2".to_string(),
                    book_id: "book-1".to_string(),
                    body: "Seconde citation".to_string(),
                    position: 1,
                    created_at: "2026-07-22T10:00:00.000Z".to_string(),
                },
            ],
            library: library.table().to_string(),
        }
    }

    fn book_payload() -> BookWritePayload {
        payload(BookLibrary::Books, "livre")
    }

    fn manga_payload() -> BookWritePayload {
        payload(BookLibrary::Mangas, "manga")
    }

    async fn count(pool: &SqlitePool, statement: &str) -> i64 {
        sqlx::query_scalar(statement)
            .fetch_one(pool)
            .await
            .unwrap_or_else(|error| panic!("compter avec « {statement} » : {error}"))
    }

    async fn add_provider_link(pool: &SqlitePool, medium: &str) {
        sqlx::query(
            "INSERT INTO media_provider_links (
               profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at
             ) VALUES ('default', $1, 'book-1', 'openlibrary', 'OL123W', $2, $2)",
        )
        .bind(medium)
        .bind("2026-07-22T10:00:00.000Z")
        .execute(pool)
        .await
        .expect("poser le lien fournisseur de test");
    }

    async fn assert_provider_link(pool: &SqlitePool, medium: &str) {
        let rows = sqlx::query(
            "SELECT medium, provider_name, provider_id FROM media_provider_links
             WHERE profile_id = 'default' AND media_id = 'book-1'",
        )
        .fetch_all(pool)
        .await
        .expect("relire les liens fournisseurs");

        assert_eq!(rows.len(), 1, "un seul lien fournisseur doit subsister");
        assert_eq!(rows[0].get::<String, _>("medium"), medium);
        assert_eq!(rows[0].get::<String, _>("provider_name"), "openlibrary");
        assert_eq!(rows[0].get::<String, _>("provider_id"), "OL123W");
    }

    #[test]
    fn create_book_and_quotes_is_atomic() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let mut invalid = book_payload();
            invalid.quotes[1].id = invalid.quotes[0].id.clone();

            let result = create_book_in_pool(&pool, invalid).await;
            assert!(
                result.is_err(),
                "la collision de citation doit refuser le lot"
            );

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM books").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM book_quotes").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM mangas").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM manga_quotes").await, 0);
        });
    }

    #[test]
    fn create_manga_writes_mangas_without_category() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            create_book_in_pool(&pool, manga_payload())
                .await
                .expect("créer le manga");

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM mangas").await, 1);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM manga_quotes").await, 2);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM books").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM book_quotes").await, 0);

            let title: String = sqlx::query_scalar("SELECT title FROM mangas WHERE id = 'book-1'")
                .fetch_one(&pool)
                .await
                .expect("relire le manga");
            assert_eq!(title, "Livre initial");

            let columns: i64 = count(
                &pool,
                "SELECT COUNT(*) FROM pragma_table_info('mangas') WHERE name = 'category'",
            )
            .await;
            assert_eq!(columns, 0, "la table mangas ne porte pas de catégorie");
        });
    }

    #[test]
    fn create_manga_inside_books_is_rejected() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let mut contradictory = manga_payload();
            contradictory.library = "books".to_string();

            assert!(
                create_book_in_pool(&pool, contradictory).await.is_err(),
                "un manga ne doit jamais être écrit dans books"
            );
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM books").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM mangas").await, 0);
        });
    }

    #[test]
    fn create_comics_book_is_rejected_because_comics_have_their_own_library() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            for (library, category) in [
                (BookLibrary::Books, "comics"),
                (BookLibrary::Books, " Comics "),
                (BookLibrary::Mangas, "comics"),
            ] {
                let error = create_book_in_pool(&pool, payload(library, category))
                    .await
                    .expect_err("un comic ne doit plus être écrit dans Livres ni Mangas");
                assert!(
                    error.contains("propre bibliothèque") && error.contains("Comics"),
                    "message explicite attendu pour « {category} » : {error}"
                );
            }
            for table in ["books", "book_quotes", "mangas", "manga_quotes"] {
                assert_eq!(
                    count(&pool, &format!("SELECT COUNT(*) FROM {table}")).await,
                    0,
                    "aucune écriture dans {table}"
                );
            }
        });
    }

    #[test]
    fn update_to_comics_category_is_rejected_and_keeps_the_book() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            create_book_in_pool(&pool, book_payload())
                .await
                .expect("créer le livre");

            let mut comic = payload(BookLibrary::Books, "comics");
            comic.book.title = "Devenu comic".to_string();
            comic.quotes.truncate(1);
            let error = update_book_in_pool(&pool, comic)
                .await
                .expect_err("un livre ne peut pas devenir un comic dans Livres");
            assert!(error.contains("propre bibliothèque"), "{error}");

            let row: (String, String) =
                sqlx::query_as("SELECT category, title FROM books WHERE id = 'book-1'")
                    .fetch_one(&pool)
                    .await
                    .expect("relire le livre conservé");
            assert_eq!(row, ("livre".to_string(), "Livre initial".to_string()));
            assert_eq!(
                count(
                    &pool,
                    "SELECT COUNT(*) FROM book_quotes WHERE book_id = 'book-1'"
                )
                .await,
                2
            );
        });
    }

    #[test]
    fn book_categories_route_livre_and_manga_and_refuse_comics() {
        assert_eq!(BookLibrary::from_category("livre"), Ok(BookLibrary::Books));
        assert_eq!(BookLibrary::from_category("manga"), Ok(BookLibrary::Mangas));
        assert!(BookLibrary::from_category("comics")
            .unwrap_err()
            .contains("Comics"));
        assert!(BookLibrary::from_category("roman-photo").is_err());
    }

    #[test]
    fn update_book_and_quotes_is_atomic() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            create_book_in_pool(&pool, book_payload())
                .await
                .expect("créer la fixture Livres");

            let mut invalid = book_payload();
            invalid.book.title = "Titre modifié".to_string();
            invalid.book.updated_at = "2026-07-22T11:00:00.000Z".to_string();
            invalid.quotes[1].id = invalid.quotes[0].id.clone();

            let result = update_book_in_pool(&pool, invalid).await;
            assert!(
                result.is_err(),
                "la collision de citation doit annuler la modification"
            );

            let title: String = sqlx::query_scalar("SELECT title FROM books WHERE id = 'book-1'")
                .fetch_one(&pool)
                .await
                .expect("relire le livre");
            let quote_count = count(
                &pool,
                "SELECT COUNT(*) FROM book_quotes WHERE book_id = 'book-1'",
            )
            .await;
            assert_eq!(
                title, "Livre initial",
                "le titre antérieur doit être restauré"
            );
            assert_eq!(
                quote_count, 2,
                "les citations antérieures doivent être restaurées"
            );
        });
    }

    #[test]
    fn update_moves_manga_to_books_with_quotes_and_provider_link() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            create_book_in_pool(&pool, manga_payload())
                .await
                .expect("créer le manga");
            add_provider_link(&pool, "mangas").await;

            let mut moved = payload(BookLibrary::Mangas, "livre");
            moved.book.title = "Manga devenu livre".to_string();
            moved.book.updated_at = "2026-07-23T09:00:00.000Z".to_string();
            moved.quotes[0].body = "Citation révisée".to_string();

            update_book_in_pool(&pool, moved)
                .await
                .expect("déplacer le manga vers Livres");

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM mangas").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM manga_quotes").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM books").await, 1);

            let row = sqlx::query(
                "SELECT category, title, author, year, status, rating, is_favorite,
                        volumes_read, volumes_total, created_at, updated_at
                 FROM books WHERE id = 'book-1' AND profile_id = 'default'",
            )
            .fetch_one(&pool)
            .await
            .expect("relire la fiche déplacée");
            assert_eq!(row.get::<String, _>("category"), "livre");
            assert_eq!(row.get::<String, _>("title"), "Manga devenu livre");
            assert_eq!(row.get::<String, _>("author"), "Autrice");
            assert_eq!(row.get::<i64, _>("year"), 2026);
            assert_eq!(row.get::<String, _>("status"), "en cours");
            assert_eq!(row.get::<f64, _>("rating"), 4.5);
            assert_eq!(row.get::<i64, _>("is_favorite"), 1);
            assert_eq!(row.get::<i64, _>("volumes_read"), 2);
            assert_eq!(row.get::<i64, _>("volumes_total"), 4);
            assert_eq!(
                row.get::<String, _>("created_at"),
                "2026-07-22T10:00:00.000Z",
                "la date de création d’origine est conservée"
            );
            assert_eq!(
                row.get::<String, _>("updated_at"),
                "2026-07-23T09:00:00.000Z"
            );

            let quotes = sqlx::query(
                "SELECT id, body FROM book_quotes WHERE book_id = 'book-1' ORDER BY position ASC",
            )
            .fetch_all(&pool)
            .await
            .expect("relire les citations déplacées");
            assert_eq!(quotes.len(), 2, "les deux citations suivent la fiche");
            assert_eq!(quotes[0].get::<String, _>("id"), "quote-1");
            assert_eq!(quotes[0].get::<String, _>("body"), "Citation révisée");
            assert_eq!(quotes[1].get::<String, _>("id"), "quote-2");

            assert_provider_link(&pool, "books").await;
        });
    }

    #[test]
    fn update_moves_book_to_mangas_with_quotes_and_provider_link() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let cover = "https://covers.openlibrary.org/b/id/1-L.jpg".to_string();
            let mut book = payload(BookLibrary::Books, "livre");
            book.book.cover_url = Some(cover.clone());
            create_book_in_pool(&pool, book)
                .await
                .expect("créer le livre");
            add_provider_link(&pool, "books").await;

            // `library` désigne la table actuelle : la fiche est encore dans
            // `books`, et `category = manga` impose la cible `mangas`.
            let mut moved = payload(BookLibrary::Books, "manga");
            moved.book.cover_url = Some(cover);

            update_book_in_pool(&pool, moved)
                .await
                .expect("déplacer le livre vers Mangas");

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM books").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM book_quotes").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM mangas").await, 1);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM manga_quotes").await, 2);

            let row = sqlx::query(
                "SELECT title, author, year, cover_url, volumes_read, volumes_total
                 FROM mangas WHERE id = 'book-1' AND profile_id = 'default'",
            )
            .fetch_one(&pool)
            .await
            .expect("relire la fiche déplacée");
            assert_eq!(row.get::<String, _>("title"), "Livre initial");
            assert_eq!(row.get::<String, _>("author"), "Autrice");
            assert_eq!(
                row.get::<String, _>("cover_url"),
                "https://covers.openlibrary.org/b/id/1-L.jpg"
            );
            assert_eq!(row.get::<i64, _>("volumes_read"), 2);

            assert_provider_link(&pool, "mangas").await;
        });
    }

    #[test]
    fn update_move_rolls_back_when_quotes_are_invalid() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            create_book_in_pool(&pool, manga_payload())
                .await
                .expect("créer le manga");
            add_provider_link(&pool, "mangas").await;

            let mut broken = payload(BookLibrary::Mangas, "livre");
            broken.book.title = "Déplacement avorté".to_string();
            broken.quotes[1].id = broken.quotes[0].id.clone();

            assert!(
                update_book_in_pool(&pool, broken).await.is_err(),
                "la collision de citation doit annuler le déplacement"
            );

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM mangas").await, 1);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM manga_quotes").await, 2);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM books").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM book_quotes").await, 0);

            let title: String = sqlx::query_scalar("SELECT title FROM mangas WHERE id = 'book-1'")
                .fetch_one(&pool)
                .await
                .expect("relire le manga d’origine");
            assert_eq!(title, "Livre initial");

            assert_provider_link(&pool, "mangas").await;
        });
    }

    #[test]
    fn delete_book_removes_quotes_and_provider_link() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            create_book_in_pool(&pool, book_payload())
                .await
                .expect("créer le livre");
            add_provider_link(&pool, "books").await;

            delete_book_in_pool(&pool, "default", "book-1", BookLibrary::Books)
                .await
                .expect("supprimer le livre");

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM books").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM book_quotes").await, 0);
            assert_eq!(
                count(&pool, "SELECT COUNT(*) FROM media_provider_links").await,
                0,
                "le déclencheur doit retirer le lien fournisseur"
            );
        });
    }

    #[test]
    fn delete_book_targets_only_the_requested_library() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            create_book_in_pool(&pool, manga_payload())
                .await
                .expect("créer le manga");
            add_provider_link(&pool, "mangas").await;

            assert!(
                delete_book_in_pool(&pool, "default", "book-1", BookLibrary::Books)
                    .await
                    .is_err(),
                "supprimer depuis la mauvaise table doit échouer"
            );
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM mangas").await, 1);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM manga_quotes").await, 2);
            assert_eq!(
                count(&pool, "SELECT COUNT(*) FROM media_provider_links").await,
                1
            );

            delete_book_in_pool(&pool, "default", "book-1", BookLibrary::Mangas)
                .await
                .expect("supprimer le manga");

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM mangas").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM manga_quotes").await, 0);
            assert_eq!(
                count(&pool, "SELECT COUNT(*) FROM media_provider_links").await,
                0
            );
        });
    }
}
