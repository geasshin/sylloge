use serde::Deserialize;
use sqlx::{Sqlite, SqlitePool, Transaction};
use tauri::State;
use tauri_plugin_sql::DbInstances;

use crate::portability::sqlite_pool;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookWritePayload {
    book: BookWriteInput,
    quotes: Vec<BookQuoteWriteInput>,
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

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BookQuoteWriteInput {
    id: String,
    book_id: String,
    body: String,
    position: i64,
    created_at: String,
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

async fn insert_quotes(
    transaction: &mut Transaction<'_, Sqlite>,
    quotes: &[BookQuoteWriteInput],
) -> Result<(), String> {
    for quote in quotes {
        sqlx::query(
            "INSERT INTO book_quotes (id, book_id, body, position, created_at)
             VALUES ($1, $2, $3, $4, $5)",
        )
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

async fn create_book_in_pool(pool: &SqlitePool, payload: BookWritePayload) -> Result<(), String> {
    validate_payload(&payload)?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer l’enregistrement du livre : {error}"))?;
    let book = &payload.book;

    let result = sqlx::query(
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
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible de créer le livre : {error}"))?;

    if result.rows_affected() != 1 {
        return Err("La création du livre n’a modifié aucune ligne SQLite.".to_string());
    }

    insert_quotes(&mut transaction, &payload.quotes).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser la création du livre : {error}"))?;
    Ok(())
}

async fn update_book_in_pool(pool: &SqlitePool, payload: BookWritePayload) -> Result<(), String> {
    validate_payload(&payload)?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer la modification du livre : {error}"))?;
    let book = &payload.book;

    let result = sqlx::query(
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
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible de modifier le livre : {error}"))?;

    if result.rows_affected() != 1 {
        return Err("Le livre à modifier est introuvable dans le profil courant.".to_string());
    }

    sqlx::query("DELETE FROM book_quotes WHERE book_id = $1")
        .bind(&book.id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de remplacer les citations : {error}"))?;
    insert_quotes(&mut transaction, &payload.quotes).await?;

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser la modification du livre : {error}"))?;
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
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer la suppression du livre : {error}"))?;

    sqlx::query("DELETE FROM book_quotes WHERE book_id = $1")
        .bind(&book_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de supprimer les citations du livre : {error}"))?;
    let result = sqlx::query("DELETE FROM books WHERE id = $1 AND profile_id = $2")
        .bind(&book_id)
        .bind(&profile_id)
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

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

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
               rating REAL,
               is_favorite INTEGER NOT NULL CHECK (is_favorite IN (0, 1)),
               volumes_read INTEGER,
               volumes_total INTEGER,
               progress_updated_at TEXT,
               started_at TEXT,
               cover_url TEXT,
               personal_note TEXT,
               created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL,
               FOREIGN KEY (profile_id) REFERENCES profiles(id)
             );
             CREATE TABLE book_quotes (
               id TEXT PRIMARY KEY NOT NULL,
               book_id TEXT NOT NULL,
               body TEXT NOT NULL CHECK (length(trim(body)) > 0),
               position INTEGER NOT NULL CHECK (position >= 0),
               created_at TEXT NOT NULL,
               FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
             );",
        )
        .execute(&pool)
        .await
        .expect("schéma Livres de test");
        pool
    }

    fn payload() -> BookWritePayload {
        BookWritePayload {
            book: BookWriteInput {
                id: "book-1".to_string(),
                profile_id: "default".to_string(),
                title: "Livre initial".to_string(),
                author: Some("Autrice".to_string()),
                year: Some(2026),
                summary: None,
                category: "manga".to_string(),
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
        }
    }

    #[test]
    fn create_book_and_quotes_is_atomic() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let mut invalid = payload();
            invalid.quotes[1].id = invalid.quotes[0].id.clone();

            let result = create_book_in_pool(&pool, invalid).await;
            assert!(
                result.is_err(),
                "la collision de citation doit refuser le lot"
            );

            let book_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM books")
                .fetch_one(&pool)
                .await
                .expect("compter les livres");
            let quote_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM book_quotes")
                .fetch_one(&pool)
                .await
                .expect("compter les citations");
            assert_eq!(
                book_count, 0,
                "le livre doit être annulé avec les citations"
            );
            assert_eq!(quote_count, 0, "aucune citation partielle ne doit rester");
        });
    }

    #[test]
    fn update_book_and_quotes_is_atomic() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            create_book_in_pool(&pool, payload())
                .await
                .expect("créer la fixture Livres");

            let mut invalid = payload();
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
            let quote_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM book_quotes WHERE book_id = 'book-1'")
                    .fetch_one(&pool)
                    .await
                    .expect("compter les citations");
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
}
