//! Déplacement atomique d’une fiche entre Séries et Animation japonaise.
//!
//! Une bibliothèque = une table : `series` (séries, avec une colonne `category`
//! qui vaut `série télé`) et `anime` (animation japonaise, sans colonne de
//! catégorie). Les écritures ordinaires des séries passent par le greffon SQL
//! côté interface ; le déplacement, lui, doit changer de table, déplacer le lien
//! fournisseur et retirer la ligne d’origine dans une seule transaction : il
//! passe donc par cette commande native.
//!
//! Le contrat venu du front :
//! - `move_series_library` reçoit la fiche entière (valeurs déjà validées par le
//!   formulaire), la table *actuelle* dans `library` et déduit la table cible de
//!   `series.category` (`animation` → `anime`, `série télé` → `series`) ;
//! - le lien fournisseur (`media_provider_links`, médium `series` ou `anime`) est
//!   déplacé avant la suppression de la ligne source, sinon le déclencheur
//!   `AFTER DELETE` de l’ancienne table l’effacerait ;
//! - une fiche absente du profil, une source égale à la cible ou une catégorie
//!   inconnue sont refusées ; en cas d’échec, rien n’est conservé.

use serde::Deserialize;
use sqlx::{Sqlite, SqlitePool, Transaction};
use tauri::State;
use tauri_plugin_sql::DbInstances;

use crate::portability::sqlite_pool;

/// Catégorie interne des fiches de la table `series` (seule valeur acceptée).
const SERIES_CATEGORY: &str = "série télé";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesMovePayload {
    series: SeriesWriteInput,
    /// Table qui contient la fiche au moment de l’appel : `series` ou `anime`.
    library: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeriesWriteInput {
    id: String,
    profile_id: String,
    title: String,
    showrunner: Option<String>,
    casting: Option<String>,
    summary: Option<String>,
    category: String,
    status: String,
    rating: Option<f64>,
    is_favorite: bool,
    seasons_seen: Option<i64>,
    seasons_total: Option<i64>,
    progress_updated_at: Option<String>,
    started_at: Option<String>,
    poster_url: Option<String>,
    /// Bannière 16:9 (migration 0026) : une adresse d'image, jamais un fichier.
    banner_url: Option<String>,
    /// Recadrage vertical (migration 0028) : un pourcentage d'object-position,
    /// `null` pour le centrage par défaut.
    banner_position: Option<i64>,
    personal_note: Option<String>,
    created_at: String,
    updated_at: String,
    /// Période de diffusion (migration 0027) : deux années, `null` si inconnues.
    first_air_year: Option<i64>,
    last_air_year: Option<i64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SeriesLibrary {
    Series,
    Anime,
}

impl SeriesLibrary {
    fn parse(raw: &str) -> Result<Self, String> {
        match raw.trim() {
            "series" => Ok(Self::Series),
            "anime" => Ok(Self::Anime),
            other => Err(format!("Bibliothèque de séries inconnue : « {other} ».")),
        }
    }

    /// `series` porte une catégorie réelle (`série télé`) ; `anime` la synthétise
    /// côté lecture. C’est la catégorie de la fiche qui désigne la table cible.
    fn from_category(category: &str) -> Result<Self, String> {
        match category.trim() {
            "animation" => Ok(Self::Anime),
            SERIES_CATEGORY => Ok(Self::Series),
            other => Err(format!("Catégorie de série inconnue : « {other} ».")),
        }
    }

    fn table(self) -> &'static str {
        match self {
            Self::Series => "series",
            Self::Anime => "anime",
        }
    }

    /// Médium des liens fournisseurs : identique au nom de la table.
    fn medium(self) -> &'static str {
        self.table()
    }

    fn label(self) -> &'static str {
        match self {
            Self::Series => "Séries",
            Self::Anime => "Animation japonaise",
        }
    }
}

fn validate_payload(payload: &SeriesMovePayload) -> Result<(), String> {
    if payload.series.id.trim().is_empty() || payload.series.profile_id.trim().is_empty() {
        return Err("La fiche ou son profil possède un identifiant invalide.".to_string());
    }
    if payload.series.title.trim().is_empty() {
        return Err("Le titre est obligatoire.".to_string());
    }
    Ok(())
}

async fn ensure_series_present(
    transaction: &mut Transaction<'_, Sqlite>,
    library: SeriesLibrary,
    profile_id: &str,
    series_id: &str,
) -> Result<(), String> {
    let count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {} WHERE id = $1 AND profile_id = $2",
        library.table()
    ))
    .bind(series_id)
    .bind(profile_id)
    .fetch_one(&mut **transaction)
    .await
    .map_err(|error| format!("Impossible de relire la fiche à déplacer : {error}"))?;

    if count != 1 {
        return Err("La fiche à déplacer est introuvable dans le profil courant.".to_string());
    }

    Ok(())
}

async fn insert_series_row(
    transaction: &mut Transaction<'_, Sqlite>,
    library: SeriesLibrary,
    series: &SeriesWriteInput,
) -> Result<u64, String> {
    let result = match library {
        // La colonne `category` de `series` ne reçoit jamais `animation` : la
        // table est la partition, et la valeur est forcée ici.
        SeriesLibrary::Series => {
            sqlx::query(
                "INSERT INTO series (
               id, profile_id, title, showrunner, casting, summary, category,
               status, rating, is_favorite, seasons_seen, seasons_total,
               progress_updated_at, started_at, poster_url, banner_url,
               banner_position, personal_note, created_at, updated_at,
               first_air_year, last_air_year
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15, $16, $17, $18, $19, $20, $21, $22
             )",
            )
            .bind(&series.id)
            .bind(&series.profile_id)
            .bind(&series.title)
            .bind(&series.showrunner)
            .bind(&series.casting)
            .bind(&series.summary)
            .bind(SERIES_CATEGORY)
            .bind(&series.status)
            .bind(series.rating)
            .bind(if series.is_favorite { 1_i64 } else { 0_i64 })
            .bind(series.seasons_seen)
            .bind(series.seasons_total)
            .bind(&series.progress_updated_at)
            .bind(&series.started_at)
            .bind(&series.poster_url)
            .bind(&series.banner_url)
            .bind(series.banner_position)
            .bind(&series.personal_note)
            .bind(&series.created_at)
            .bind(&series.updated_at)
            .bind(series.first_air_year)
            .bind(series.last_air_year)
            .execute(&mut **transaction)
            .await
        }
        // `anime` n’a pas de colonne de catégorie.
        SeriesLibrary::Anime => {
            sqlx::query(
                "INSERT INTO anime (
               id, profile_id, title, showrunner, casting, summary, status,
               rating, is_favorite, seasons_seen, seasons_total,
               progress_updated_at, started_at, poster_url, banner_url,
               banner_position, personal_note, created_at, updated_at,
               first_air_year, last_air_year
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15, $16, $17, $18, $19, $20, $21
             )",
            )
            .bind(&series.id)
            .bind(&series.profile_id)
            .bind(&series.title)
            .bind(&series.showrunner)
            .bind(&series.casting)
            .bind(&series.summary)
            .bind(&series.status)
            .bind(series.rating)
            .bind(if series.is_favorite { 1_i64 } else { 0_i64 })
            .bind(series.seasons_seen)
            .bind(series.seasons_total)
            .bind(&series.progress_updated_at)
            .bind(&series.started_at)
            .bind(&series.poster_url)
            .bind(&series.banner_url)
            .bind(series.banner_position)
            .bind(&series.personal_note)
            .bind(&series.created_at)
            .bind(&series.updated_at)
            .bind(series.first_air_year)
            .bind(series.last_air_year)
            .execute(&mut **transaction)
            .await
        }
    };

    result
        .map(|outcome| outcome.rows_affected())
        .map_err(|error| {
            format!(
                "Impossible d’enregistrer la fiche dans la bibliothèque {} : {error}",
                library.label()
            )
        })
}

async fn move_series_in_pool(pool: &SqlitePool, payload: SeriesMovePayload) -> Result<(), String> {
    validate_payload(&payload)?;
    let source = SeriesLibrary::parse(&payload.library)?;
    let target = SeriesLibrary::from_category(&payload.series.category)?;

    if source == target {
        return Err(format!(
            "La fiche est déjà dans la bibliothèque {} : aucun déplacement à faire.",
            target.label()
        ));
    }

    let series = &payload.series;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer le déplacement de la fiche : {error}"))?;

    ensure_series_present(&mut transaction, source, &series.profile_id, &series.id).await?;

    let inserted = insert_series_row(&mut transaction, target, series).await?;
    if inserted != 1 {
        return Err("Le déplacement de la fiche n’a écrit aucune ligne SQLite.".to_string());
    }

    // Le lien fournisseur suit la fiche avant la suppression : le déclencheur
    // `AFTER DELETE` de la table d’origine ne doit pas l’effacer.
    sqlx::query(
        "UPDATE media_provider_links
         SET medium = $1, updated_at = $2
         WHERE profile_id = $3 AND medium = $4 AND media_id = $5",
    )
    .bind(target.medium())
    .bind(&series.updated_at)
    .bind(&series.profile_id)
    .bind(source.medium())
    .bind(&series.id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible de déplacer le lien fournisseur de la fiche : {error}"))?;

    let deleted = sqlx::query(&format!(
        "DELETE FROM {} WHERE id = $1 AND profile_id = $2",
        source.table()
    ))
    .bind(&series.id)
    .bind(&series.profile_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| {
        format!(
            "Impossible de retirer la fiche de la bibliothèque {} : {error}",
            source.label()
        )
    })?
    .rows_affected();

    if deleted != 1 {
        return Err("La fiche à déplacer est introuvable dans le profil courant.".to_string());
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser le déplacement de la fiche : {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn move_series_library(
    db_instances: State<'_, DbInstances>,
    payload: SeriesMovePayload,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    move_series_in_pool(&pool, payload).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::Row;

    /// Schéma fidèle aux migrations 0010 et 0020 : `series` garde sa colonne
    /// `category`, `anime` n’en a pas, et chaque table porte son déclencheur de
    /// lien fournisseur.
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
             CREATE TABLE series (
               id TEXT PRIMARY KEY NOT NULL,
               profile_id TEXT NOT NULL,
               title TEXT NOT NULL CHECK (length(trim(title)) > 0),
               showrunner TEXT,
               casting TEXT,
               summary TEXT,
               category TEXT NOT NULL DEFAULT 'série télé'
                 CHECK (category IN ('série télé', 'animation')),
               status TEXT NOT NULL CHECK (status IN ('à voir', 'en cours', 'abandonnée', 'vue')),
               rating REAL CHECK (rating IS NULL OR (rating BETWEEN 0.5 AND 5.0 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
               is_favorite INTEGER NOT NULL CHECK (is_favorite IN (0, 1)),
               seasons_seen INTEGER CHECK (seasons_seen IS NULL OR seasons_seen >= 0),
               seasons_total INTEGER CHECK (seasons_total IS NULL OR seasons_total >= 0),
               progress_updated_at TEXT,
               started_at TEXT,
               poster_url TEXT,
               banner_url TEXT,
               banner_position INTEGER CHECK (banner_position IS NULL OR banner_position BETWEEN 0 AND 100),
               personal_note TEXT,
               created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL,
               first_air_year INTEGER CHECK (first_air_year IS NULL OR first_air_year BETWEEN 1900 AND 2100),
               last_air_year INTEGER CHECK (last_air_year IS NULL OR last_air_year BETWEEN 1900 AND 2100),
               CHECK (seasons_seen IS NULL OR seasons_total IS NULL OR seasons_seen <= seasons_total),
               FOREIGN KEY (profile_id) REFERENCES profiles(id)
             );
             CREATE TABLE anime (
               id TEXT PRIMARY KEY NOT NULL,
               profile_id TEXT NOT NULL,
               title TEXT NOT NULL CHECK (length(trim(title)) > 0),
               showrunner TEXT,
               casting TEXT,
               summary TEXT,
               status TEXT NOT NULL CHECK (status IN ('à voir', 'en cours', 'abandonnée', 'vue')),
               rating REAL CHECK (rating IS NULL OR (rating BETWEEN 0.5 AND 5.0 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
               is_favorite INTEGER NOT NULL CHECK (is_favorite IN (0, 1)),
               seasons_seen INTEGER CHECK (seasons_seen IS NULL OR seasons_seen >= 0),
               seasons_total INTEGER CHECK (seasons_total IS NULL OR seasons_total >= 0),
               progress_updated_at TEXT,
               started_at TEXT,
               poster_url TEXT,
               banner_url TEXT,
               banner_position INTEGER CHECK (banner_position IS NULL OR banner_position BETWEEN 0 AND 100),
               personal_note TEXT,
               created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL,
               first_air_year INTEGER CHECK (first_air_year IS NULL OR first_air_year BETWEEN 1900 AND 2100),
               last_air_year INTEGER CHECK (last_air_year IS NULL OR last_air_year BETWEEN 1900 AND 2100),
               CHECK (seasons_seen IS NULL OR seasons_total IS NULL OR seasons_seen <= seasons_total),
               FOREIGN KEY (profile_id) REFERENCES profiles(id)
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
             CREATE TRIGGER delete_series_provider_link
             AFTER DELETE ON series
             BEGIN
               DELETE FROM media_provider_links
               WHERE profile_id = OLD.profile_id AND medium = 'series' AND media_id = OLD.id;
             END;
             CREATE TRIGGER delete_anime_provider_link
             AFTER DELETE ON anime
             BEGIN
               DELETE FROM media_provider_links
               WHERE profile_id = OLD.profile_id AND medium = 'anime' AND media_id = OLD.id;
             END;",
        )
        .execute(&pool)
        .await
        .expect("schéma Séries/Animation de test");
        pool
    }

    fn series_input(category: &str) -> SeriesWriteInput {
        SeriesWriteInput {
            id: "series-1".to_string(),
            profile_id: "default".to_string(),
            title: "Fiche initiale".to_string(),
            showrunner: Some("Autrice".to_string()),
            casting: Some("Interprète A, Interprète B".to_string()),
            summary: Some("Résumé conservé.".to_string()),
            category: category.to_string(),
            status: "en cours".to_string(),
            rating: Some(4.5),
            is_favorite: true,
            seasons_seen: Some(2),
            seasons_total: Some(4),
            progress_updated_at: Some("2026-07-22T10:00:00.000Z".to_string()),
            started_at: Some("2026-07-01".to_string()),
            poster_url: Some("https://image.tmdb.org/t/p/w500/affiche.jpg".to_string()),
            banner_url: Some("https://image.tmdb.org/t/p/w1280/fond.jpg".to_string()),
            banner_position: Some(20),
            personal_note: Some("Avis personnel conservé.".to_string()),
            created_at: "2026-07-22T10:00:00.000Z".to_string(),
            updated_at: "2026-07-23T09:00:00.000Z".to_string(),
            first_air_year: Some(2017),
            last_air_year: Some(2020),
        }
    }

    fn payload(library: SeriesLibrary, category: &str) -> SeriesMovePayload {
        SeriesMovePayload {
            series: series_input(category),
            library: library.table().to_string(),
        }
    }

    /// Insère directement une ligne pour préparer la fixture, sans passer par la
    /// commande testée.
    async fn seed_row(pool: &SqlitePool, library: SeriesLibrary, series: &SeriesWriteInput) {
        let mut transaction = pool.begin().await.expect("transaction de fixture");
        insert_series_row(&mut transaction, library, series)
            .await
            .expect("écrire la fiche de départ");
        transaction.commit().await.expect("valider la fixture");
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
             ) VALUES ('default', $1, 'series-1', 'TMDB', '95396', $2, $2)",
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
             WHERE profile_id = 'default' AND media_id = 'series-1'",
        )
        .fetch_all(pool)
        .await
        .expect("relire les liens fournisseurs");

        assert_eq!(rows.len(), 1, "un seul lien fournisseur doit subsister");
        assert_eq!(rows[0].get::<String, _>("medium"), medium);
        assert_eq!(rows[0].get::<String, _>("provider_name"), "TMDB");
        assert_eq!(rows[0].get::<String, _>("provider_id"), "95396");
    }

    #[test]
    fn move_series_to_anime_keeps_every_field_and_the_provider_link() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            seed_row(&pool, SeriesLibrary::Series, &series_input(SERIES_CATEGORY)).await;
            add_provider_link(&pool, "series").await;

            move_series_in_pool(&pool, payload(SeriesLibrary::Series, "animation"))
                .await
                .expect("déplacer la série vers Animation japonaise");

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM series").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM anime").await, 1);

            let row = sqlx::query(
                "SELECT title, showrunner, casting, summary, status, rating, is_favorite,
                        seasons_seen, seasons_total, progress_updated_at, started_at,
                        poster_url, banner_url, banner_position, personal_note, created_at, updated_at,
                        first_air_year, last_air_year
                 FROM anime WHERE id = 'series-1' AND profile_id = 'default'",
            )
            .fetch_one(&pool)
            .await
            .expect("relire la fiche déplacée");

            assert_eq!(row.get::<String, _>("title"), "Fiche initiale");
            assert_eq!(row.get::<String, _>("showrunner"), "Autrice");
            assert_eq!(
                row.get::<String, _>("casting"),
                "Interprète A, Interprète B"
            );
            assert_eq!(row.get::<String, _>("summary"), "Résumé conservé.");
            assert_eq!(row.get::<String, _>("status"), "en cours");
            assert_eq!(row.get::<f64, _>("rating"), 4.5);
            assert_eq!(row.get::<i64, _>("is_favorite"), 1);
            assert_eq!(row.get::<i64, _>("seasons_seen"), 2);
            assert_eq!(row.get::<i64, _>("seasons_total"), 4);
            assert_eq!(
                row.get::<String, _>("progress_updated_at"),
                "2026-07-22T10:00:00.000Z"
            );
            assert_eq!(row.get::<String, _>("started_at"), "2026-07-01");
            assert_eq!(
                row.get::<String, _>("poster_url"),
                "https://image.tmdb.org/t/p/w500/affiche.jpg"
            );
            assert_eq!(
                row.get::<String, _>("banner_url"),
                "https://image.tmdb.org/t/p/w1280/fond.jpg",
                "la bannière suit la fiche déplacée"
            );
            assert_eq!(
                row.get::<String, _>("personal_note"),
                "Avis personnel conservé."
            );
            assert_eq!(
                row.get::<i64, _>("first_air_year"),
                2017,
                "le début de diffusion suit la fiche déplacée"
            );
            assert_eq!(
                row.get::<i64, _>("last_air_year"),
                2020,
                "la fin de diffusion suit la fiche déplacée"
            );
            assert_eq!(
                row.get::<String, _>("created_at"),
                "2026-07-22T10:00:00.000Z",
                "la date de création d’origine est conservée"
            );
            assert_eq!(
                row.get::<String, _>("updated_at"),
                "2026-07-23T09:00:00.000Z"
            );

            let columns = count(
                &pool,
                "SELECT COUNT(*) FROM pragma_table_info('anime') WHERE name = 'category'",
            )
            .await;
            assert_eq!(columns, 0, "la table anime ne porte pas de catégorie");

            assert_provider_link(&pool, "anime").await;
        });
    }

    #[test]
    fn move_anime_to_series_sets_the_series_category_and_keeps_the_link() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            seed_row(&pool, SeriesLibrary::Anime, &series_input("animation")).await;
            add_provider_link(&pool, "anime").await;

            move_series_in_pool(&pool, payload(SeriesLibrary::Anime, SERIES_CATEGORY))
                .await
                .expect("déplacer l’animation vers Séries");

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM anime").await, 0);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM series").await, 1);

            let row = sqlx::query(
                "SELECT category, title, rating, is_favorite, seasons_seen, poster_url,
                        banner_url, banner_position, personal_note, created_at,
                        first_air_year, last_air_year
                 FROM series WHERE id = 'series-1' AND profile_id = 'default'",
            )
            .fetch_one(&pool)
            .await
            .expect("relire la fiche déplacée");
            assert_eq!(row.get::<String, _>("category"), "série télé");
            assert_eq!(row.get::<String, _>("title"), "Fiche initiale");
            assert_eq!(row.get::<f64, _>("rating"), 4.5);
            assert_eq!(row.get::<i64, _>("is_favorite"), 1);
            assert_eq!(row.get::<i64, _>("seasons_seen"), 2);
            assert_eq!(row.get::<i64, _>("first_air_year"), 2017);
            assert_eq!(row.get::<i64, _>("last_air_year"), 2020);
            assert_eq!(
                row.get::<String, _>("banner_url"),
                "https://image.tmdb.org/t/p/w1280/fond.jpg",
                "la bannière suit la fiche déplacée dans les deux sens"
            );
            assert_eq!(
                row.get::<i64, _>("banner_position"),
                20,
                "le recadrage de la bannière suit la fiche déplacée"
            );
            assert_eq!(
                row.get::<String, _>("created_at"),
                "2026-07-22T10:00:00.000Z"
            );

            assert_provider_link(&pool, "series").await;
        });
    }

    #[test]
    fn move_refuses_a_sheet_missing_from_the_profile() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            add_provider_link(&pool, "series").await;

            let error = move_series_in_pool(&pool, payload(SeriesLibrary::Series, "animation"))
                .await
                .expect_err("une fiche absente doit être refusée");
            assert!(error.contains("introuvable"), "{error}");

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM anime").await, 0);
            assert_provider_link(&pool, "series").await;
        });
    }

    #[test]
    fn move_refuses_the_same_library_as_source_and_target() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            seed_row(&pool, SeriesLibrary::Series, &series_input(SERIES_CATEGORY)).await;
            add_provider_link(&pool, "series").await;

            let error = move_series_in_pool(&pool, payload(SeriesLibrary::Series, SERIES_CATEGORY))
                .await
                .expect_err("déplacer une fiche vers sa propre bibliothèque doit échouer");
            assert!(error.contains("déjà"), "{error}");

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM series").await, 1);
            assert_provider_link(&pool, "series").await;
        });
    }

    #[test]
    fn move_refuses_unknown_libraries_and_categories() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            seed_row(&pool, SeriesLibrary::Series, &series_input(SERIES_CATEGORY)).await;

            let mut unknown_library = payload(SeriesLibrary::Series, "animation");
            unknown_library.library = "films".to_string();
            let error = move_series_in_pool(&pool, unknown_library)
                .await
                .expect_err("une bibliothèque inconnue doit être refusée");
            assert!(error.contains("Bibliothèque de séries inconnue"), "{error}");

            let error = move_series_in_pool(&pool, payload(SeriesLibrary::Series, "documentaire"))
                .await
                .expect_err("une catégorie inconnue doit être refusée");
            assert!(error.contains("Catégorie de série inconnue"), "{error}");

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM series").await, 1);
            assert_eq!(count(&pool, "SELECT COUNT(*) FROM anime").await, 0);
        });
    }

    #[test]
    fn move_refuses_a_sheet_without_title() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            seed_row(&pool, SeriesLibrary::Series, &series_input(SERIES_CATEGORY)).await;

            let mut empty_title = payload(SeriesLibrary::Series, "animation");
            empty_title.series.title = "   ".to_string();
            let error = move_series_in_pool(&pool, empty_title)
                .await
                .expect_err("un titre vide doit être refusé");
            assert!(error.contains("titre"), "{error}");

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM series").await, 1);
        });
    }

    #[test]
    fn move_rolls_back_when_the_target_rejects_the_row() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            seed_row(&pool, SeriesLibrary::Series, &series_input(SERIES_CATEGORY)).await;
            add_provider_link(&pool, "series").await;
            // Une fiche de même identifiant occupe déjà la cible : l’insertion
            // échoue et la transaction entière doit être annulée.
            seed_row(&pool, SeriesLibrary::Anime, &series_input("animation")).await;

            assert!(
                move_series_in_pool(&pool, payload(SeriesLibrary::Series, "animation"))
                    .await
                    .is_err(),
                "un identifiant déjà présent dans la cible doit annuler le déplacement"
            );

            assert_eq!(count(&pool, "SELECT COUNT(*) FROM series").await, 1);
            let title: String =
                sqlx::query_scalar("SELECT title FROM series WHERE id = 'series-1'")
                    .fetch_one(&pool)
                    .await
                    .expect("relire la fiche d’origine");
            assert_eq!(title, "Fiche initiale");
            assert_provider_link(&pool, "series").await;
        });
    }

    /// Colonnes que `insert_series_row` recopie, dans l'ordre du schéma.
    const MOVED_COLUMNS: [&str; 21] = [
        "id",
        "profile_id",
        "title",
        "showrunner",
        "casting",
        "summary",
        "status",
        "rating",
        "is_favorite",
        "seasons_seen",
        "seasons_total",
        "progress_updated_at",
        "started_at",
        "poster_url",
        "banner_url",
        "banner_position",
        "personal_note",
        "created_at",
        "updated_at",
        "first_air_year",
        "last_air_year",
    ];

    /// Garde de maintenance : le schéma de test ci-dessus est recopié à la main.
    /// Ce test monte les vraies migrations de l'application et échoue dès qu'une
    /// migration ajoute ou retire une colonne de `series` ou `anime` sans que le
    /// déplacement (et son schéma de test) ait été mis à jour : sans lui, la
    /// nouvelle donnée serait perdue en silence au changement de bibliothèque.
    #[test]
    fn move_covers_every_column_of_the_real_schema() {
        tauri::async_runtime::block_on(async {
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .expect("base SQLite de test");
            for migration in crate::database::migrations() {
                sqlx::raw_sql(migration.sql)
                    .execute(&pool)
                    .await
                    .unwrap_or_else(|error| panic!("migration {} : {error}", migration.version));
            }

            for (table, extra) in [("series", Some("category")), ("anime", None)] {
                let rows = sqlx::query(&format!("SELECT name FROM pragma_table_info('{table}')"))
                    .fetch_all(&pool)
                    .await
                    .expect("colonnes de la table");
                let mut actual: Vec<String> = rows
                    .iter()
                    .map(|row| row.get::<String, _>("name"))
                    .collect();
                actual.sort();
                let mut expected: Vec<String> = MOVED_COLUMNS
                    .iter()
                    .map(|column| column.to_string())
                    .chain(extra.map(str::to_string))
                    .collect();
                expected.sort();
                assert_eq!(
                    actual, expected,
                    "la table `{table}` a changé : mettre à jour move_series_library \
                     (insert_series_row, SeriesWriteInput, test_pool) avant de livrer"
                );
            }
        });
    }
}
