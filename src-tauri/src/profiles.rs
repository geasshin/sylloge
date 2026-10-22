use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::State;
use tauri_plugin_sql::DbInstances;

use crate::portability::{custom_entry_count_sql, sqlite_pool, CUSTOM_LIBRARIES};

/// Nombre maximal de profils locaux (limite interne, non affichée dans
/// l'interface ; signalée seulement si elle est atteinte). Contrat 0.4.4.
pub const MAX_PROFILES: i64 = 5;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    id: String,
    name: String,
    avatar_data_url: Option<String>,
    created_at: String,
    updated_at: String,
    film_count: i64,
    series_count: i64,
    anime_count: i64,
    book_count: i64,
    manga_count: i64,
    game_count: i64,
    artwork_count: i64,
    /// Fiches des bibliothèques personnalisées (modèles prêts), toutes
    /// bibliothèques confondues.
    custom_count: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProfileInput {
    id: String,
    name: String,
    avatar_data_url: Option<String>,
    #[serde(default)]
    select_after_creation: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameProfileInput {
    profile_id: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileInput {
    profile_id: String,
    name: String,
    avatar_data_url: Option<String>,
}

fn validate_profile_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Le nom du profil ne peut pas être vide.".to_string());
    }
    if trimmed.chars().count() > 60 {
        return Err("Le nom du profil ne peut pas dépasser 60 caractères.".to_string());
    }
    Ok(trimmed.to_string())
}

fn validate_avatar_data_url(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    if value.len() > 400_000 {
        return Err("La photo de profil dépasse la taille locale autorisée.".to_string());
    }
    let body = [
        "data:image/jpeg;base64,",
        "data:image/png;base64,",
        "data:image/webp;base64,",
    ]
    .iter()
    .find_map(|prefix| value.strip_prefix(prefix))
    .ok_or_else(|| "La photo de profil doit être une image JPEG, PNG ou WebP.".to_string())?;
    if body.is_empty()
        || !body
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/' | b'='))
    {
        return Err("La photo de profil locale est invalide.".to_string());
    }
    Ok(Some(value.to_string()))
}

#[tauri::command]
pub async fn list_profiles(
    db_instances: State<'_, DbInstances>,
) -> Result<Vec<ProfileSummary>, String> {
    let pool = sqlite_pool(&db_instances).await?;
    list_profiles_in(&pool).await
}

async fn list_profiles_in(pool: &sqlx::SqlitePool) -> Result<Vec<ProfileSummary>, String> {
    let query = format!(
        "SELECT
            p.id,
            p.name,
            p.avatar_data_url,
            p.created_at,
            p.updated_at,
            (SELECT COUNT(*) FROM films WHERE profile_id = p.id) AS film_count,
            (SELECT COUNT(*) FROM series WHERE profile_id = p.id) AS series_count,
            (SELECT COUNT(*) FROM anime WHERE profile_id = p.id) AS anime_count,
            (SELECT COUNT(*) FROM books WHERE profile_id = p.id) AS book_count,
            (SELECT COUNT(*) FROM mangas WHERE profile_id = p.id) AS manga_count,
            (SELECT COUNT(*) FROM games WHERE profile_id = p.id) AS game_count,
            (SELECT COUNT(*) FROM artworks WHERE profile_id = p.id) AS artwork_count,
            ({custom_count}) AS custom_count
         FROM profiles p
         ORDER BY p.created_at ASC, p.name COLLATE NOCASE ASC",
        custom_count = custom_entry_count_sql("p.id")
    );
    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|error| format!("Impossible de lister les profils : {error}"))?;

    Ok(rows
        .iter()
        .map(|row| ProfileSummary {
            id: row.get("id"),
            name: row.get("name"),
            avatar_data_url: row.get("avatar_data_url"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
            film_count: row.get("film_count"),
            series_count: row.get("series_count"),
            anime_count: row.get("anime_count"),
            book_count: row.get("book_count"),
            manga_count: row.get("manga_count"),
            game_count: row.get("game_count"),
            artwork_count: row.get("artwork_count"),
            custom_count: row.get("custom_count"),
        })
        .collect())
}

#[tauri::command]
pub async fn create_profile(
    db_instances: State<'_, DbInstances>,
    input: CreateProfileInput,
) -> Result<(), String> {
    let name = validate_profile_name(&input.name)?;
    let avatar_data_url = validate_avatar_data_url(input.avatar_data_url.as_deref())?;
    if input.id.trim().is_empty() {
        return Err("L'identifiant du profil est invalide.".to_string());
    }
    let pool = sqlite_pool(&db_instances).await?;

    let profile_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM profiles")
        .fetch_one(&pool)
        .await
        .map_err(|error| format!("Impossible de compter les profils : {error}"))?;

    if profile_count >= MAX_PROFILES {
        return Err(format!(
            "Le nombre maximal de {MAX_PROFILES} profils est atteint. Supprimez un profil avant d'en créer un autre."
        ));
    }

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer la création du profil : {error}"))?;

    sqlx::query(
        "INSERT INTO profiles (id, name, avatar_data_url, created_at, updated_at)
         VALUES ($1, $2, $3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&input.id)
    .bind(&name)
    .bind(avatar_data_url)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible de créer le profil : {error}"))?;

    if input.select_after_creation {
        sqlx::query(
            "UPDATE current_profile
             SET profile_id = $1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE singleton = 1",
        )
        .bind(&input.id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible d’ouvrir le nouveau profil : {error}"))?;
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser la création du profil : {error}"))?;

    Ok(())
}

#[tauri::command]
pub async fn rename_profile(
    db_instances: State<'_, DbInstances>,
    input: RenameProfileInput,
) -> Result<(), String> {
    let name = validate_profile_name(&input.name)?;
    let pool = sqlite_pool(&db_instances).await?;

    let result = sqlx::query(
        "UPDATE profiles SET name = $1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $2",
    )
    .bind(&name)
    .bind(&input.profile_id)
    .execute(&pool)
    .await
    .map_err(|error| format!("Impossible de renommer le profil : {error}"))?;

    if result.rows_affected() != 1 {
        return Err("Le profil à renommer est introuvable.".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn update_profile(
    db_instances: State<'_, DbInstances>,
    input: UpdateProfileInput,
) -> Result<(), String> {
    let name = validate_profile_name(&input.name)?;
    let avatar_data_url = validate_avatar_data_url(input.avatar_data_url.as_deref())?;
    let pool = sqlite_pool(&db_instances).await?;

    let result = sqlx::query(
        "UPDATE profiles
         SET name = $1,
             avatar_data_url = $2,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = $3",
    )
    .bind(name)
    .bind(avatar_data_url)
    .bind(&input.profile_id)
    .execute(&pool)
    .await
    .map_err(|error| format!("Impossible de modifier le profil : {error}"))?;

    if result.rows_affected() != 1 {
        return Err("Le profil à modifier est introuvable.".to_string());
    }

    Ok(())
}

/// Supprime un profil, ses sept bibliothèques de base et ses bibliothèques
/// personnalisées. Tout profil peut être supprimé, y compris le dernier et
/// le profil actuellement ouvert : la ligne `current_profile` est alors vidée
/// et l'application retombe sur l'onboarding de premier lancement (contrat
/// 0.4.4).
#[tauri::command]
pub async fn delete_profile(
    db_instances: State<'_, DbInstances>,
    profile_id: String,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    delete_profile_in(&pool, &profile_id).await
}

async fn delete_profile_in(pool: &sqlx::SqlitePool, profile_id: &str) -> Result<(), String> {
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer la suppression : {error}"))?;

    let exists: i64 = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM profiles WHERE id = $1)")
        .bind(profile_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de vérifier le profil : {error}"))?;

    if exists != 1 {
        return Err("Le profil à supprimer est introuvable.".to_string());
    }

    // Citations d'abord (clés étrangères vers books, mangas et comics), puis
    // les sept bibliothèques de base, les huit bibliothèques personnalisées,
    // la liste des bibliothèques ajoutées et les réglages rattachés au profil.
    // Les tables personnalisées n'ont pas de suppression en cascade : elles
    // doivent être vidées avant la ligne `profiles`.
    let quote_tables = [
        ("book_quotes", "books", "book_id"),
        ("manga_quotes", "mangas", "manga_id"),
    ]
    .into_iter()
    .chain(CUSTOM_LIBRARIES.iter().filter_map(|library| {
        library
            .quotes
            .as_ref()
            .map(|quotes| (quotes.table, library.table, quotes.parent_column))
    }));
    for (quotes, parent, parent_key) in quote_tables {
        sqlx::query(&format!(
            "DELETE FROM {quotes} WHERE {parent_key} IN (SELECT id FROM {parent} WHERE profile_id = $1)"
        ))
        .bind(profile_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de supprimer les citations du profil : {error}"))?;
    }

    let owned_tables = [
        "films", "series", "anime", "books", "mangas", "games", "artworks",
    ]
    .into_iter()
    .chain(CUSTOM_LIBRARIES.iter().map(|library| library.table))
    .chain(["profile_libraries", "backup_snapshots", "backup_settings"]);
    for table in owned_tables {
        sqlx::query(&format!("DELETE FROM {table} WHERE profile_id = $1"))
            .bind(profile_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| {
                format!("Impossible de supprimer les données du profil ({table}) : {error}")
            })?;
    }

    sqlx::query("DELETE FROM profiles WHERE id = $1")
        .bind(profile_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de supprimer le profil : {error}"))?;

    // Si le profil supprimé était le profil ouvert, on vide la sélection :
    // l'application retombera sur l'onboarding.
    sqlx::query(
        "UPDATE current_profile
         SET profile_id = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE singleton = 1 AND profile_id = $1",
    )
    .bind(profile_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible de réinitialiser le profil courant : {error}"))?;

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser la suppression : {error}"))?;

    Ok(())
}

/// Sélectionne le profil ouvert. Refuse un profil inexistant.
#[tauri::command]
pub async fn select_profile(
    db_instances: State<'_, DbInstances>,
    profile_id: String,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;

    let result = sqlx::query(
        "UPDATE current_profile
         SET profile_id = $1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE singleton = 1
           AND EXISTS (SELECT 1 FROM profiles WHERE id = $1)",
    )
    .bind(&profile_id)
    .execute(&pool)
    .await
    .map_err(|error| format!("Impossible d'ouvrir le profil : {error}"))?;

    if result.rows_affected() != 1 {
        return Err("Le profil à ouvrir est introuvable.".to_string());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn schema_pool() -> sqlx::SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("base SQLite de test");
        for migration in [
            include_str!("../migrations/0001_create_profiles_and_films.sql"),
            include_str!("../migrations/0002_create_default_profile.sql"),
            include_str!("../migrations/0003_track_current_profile.sql"),
            include_str!("../migrations/0004_create_backup_settings.sql"),
            include_str!("../migrations/0005_create_backup_snapshots.sql"),
            include_str!("../migrations/0006_create_updater_preferences.sql"),
            include_str!("../migrations/0007_normalize_film_optional_data.sql"),
            include_str!("../migrations/0008_create_film_tmdb_cache.sql"),
            include_str!("../migrations/0009_add_selected_poster_url.sql"),
            include_str!("../migrations/0010_create_cultural_media.sql"),
            include_str!("../migrations/0011_nullable_current_profile.sql"),
            include_str!("../migrations/0012_create_saved_views.sql"),
            include_str!("../migrations/0013_saved_views_unified_criteria.sql"),
            include_str!("../migrations/0014_normalize_game_statuses.sql"),
            include_str!("../migrations/0015_artwork_custom_fields.sql"),
            include_str!("../migrations/0016_artwork_discovered.sql"),
            include_str!("../migrations/0017_media_provider_links.sql"),
            include_str!("../migrations/0018_backfill_media_provider_links.sql"),
            include_str!("../migrations/0019_profile_identity_and_first_run.sql"),
            include_str!("../migrations/0020_split_anime_and_mangas.sql"),
            include_str!("../migrations/0021_custom_libraries.sql"),
        ] {
            sqlx::raw_sql(migration)
                .execute(&pool)
                .await
                .expect("migration de test");
        }
        let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            foreign_keys, 1,
            "les clés étrangères doivent être actives comme en production"
        );
        pool
    }

    async fn seed_profile_with_every_library(pool: &sqlx::SqlitePool, id: &str) {
        let now = "2026-10-22T10:00:00.000Z";
        sqlx::query(
            "INSERT INTO profiles (id, name, created_at, updated_at) VALUES ($1, $1, $2, $2)",
        )
        .bind(id)
        .bind(now)
        .execute(pool)
        .await
        .unwrap();
        for (table, extra_columns, extra_values) in [
            ("films", "", ""),
            ("series", "", ""),
            ("anime", "", ""),
            ("books", "", ""),
            ("mangas", "", ""),
            ("games", "", ""),
            ("artworks", "", ""),
        ] {
            let _ = (extra_columns, extra_values);
            sqlx::query(&format!(
                "INSERT INTO {table} (id, profile_id, title, created_at, updated_at) VALUES ($1, $2, 'Titre', $3, $3)"
            ))
            .bind(format!("{id}-{table}"))
            .bind(id)
            .bind(now)
            .execute(pool)
            .await
            .unwrap_or_else(|error| panic!("fixture {table} : {error}"));
        }
        sqlx::query(
            "INSERT INTO book_quotes (id, book_id, body, position) VALUES ($1, $2, 'Citation', 0)",
        )
        .bind(format!("{id}-book-quote"))
        .bind(format!("{id}-books"))
        .execute(pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO manga_quotes (id, manga_id, body, position) VALUES ($1, $2, 'Citation', 0)")
            .bind(format!("{id}-manga-quote"))
            .bind(format!("{id}-mangas"))
            .execute(pool)
            .await
            .unwrap();
        seed_custom_entries(pool, id, &CUSTOM_TABLES).await;
        for (position, library_id) in CUSTOM_TABLES.iter().enumerate() {
            sqlx::query(
                "INSERT INTO profile_libraries (profile_id, library_id, position, added_at)
                 VALUES ($1, $2, $3, $4)",
            )
            .bind(id)
            .bind(*library_id)
            .bind(position as i64)
            .bind(now)
            .execute(pool)
            .await
            .unwrap_or_else(|error| panic!("bibliothèque ajoutée {library_id} : {error}"));
        }
        sqlx::query(
            "INSERT INTO comic_quotes (id, comic_id, body, position) VALUES ($1, $2, 'Citation', 0)",
        )
        .bind(format!("{id}-comic-quote"))
        .bind(format!("{id}-comics"))
        .execute(pool)
        .await
        .unwrap();
    }

    /// Les huit tables des modèles prêts, écrites en dur pour vérifier la liste
    /// utilisée par le code de production.
    const CUSTOM_TABLES: [&str; 8] = [
        "comics",
        "magazines",
        "audiobooks",
        "music",
        "podcasts",
        "documentaries",
        "shows",
        "board_games",
    ];

    async fn seed_custom_entries(pool: &sqlx::SqlitePool, id: &str, tables: &[&str]) {
        for table in tables {
            sqlx::query(&format!(
                "INSERT INTO {table} (id, profile_id, title, created_at, updated_at)
                 VALUES ($1, $2, 'Titre', '2026-10-22T10:00:00.000Z', '2026-10-22T10:00:00.000Z')"
            ))
            .bind(format!("{id}-{table}"))
            .bind(id)
            .execute(pool)
            .await
            .unwrap_or_else(|error| panic!("fixture {table} : {error}"));
        }
    }

    async fn count(pool: &sqlx::SqlitePool, table: &str, profile_id: &str) -> i64 {
        sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM {table} WHERE profile_id = $1"
        ))
        .bind(profile_id)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    #[test]
    fn summary_counts_the_seven_libraries_and_custom_entries() {
        tauri::async_runtime::block_on(async {
            let pool = schema_pool().await;
            seed_profile_with_every_library(&pool, "complet").await;
            sqlx::query(
                "INSERT INTO profiles (id, name, created_at, updated_at)
                 VALUES ('partiel', 'Partiel', '2026-10-22T11:00:00.000Z', '2026-10-22T11:00:00.000Z')",
            )
            .execute(&pool)
            .await
            .unwrap();
            seed_custom_entries(&pool, "partiel", &["music", "shows"]).await;

            let profiles = list_profiles_in(&pool).await.unwrap();
            let summary = profiles
                .iter()
                .find(|profile| profile.id == "complet")
                .unwrap();
            assert_eq!(
                (
                    summary.film_count,
                    summary.series_count,
                    summary.anime_count,
                    summary.book_count,
                    summary.manga_count,
                    summary.game_count,
                    summary.artwork_count
                ),
                (1, 1, 1, 1, 1, 1, 1)
            );
            let complete = serde_json::to_value(summary).unwrap();
            assert_eq!(
                complete["customCount"], 8,
                "les fiches des huit bibliothèques personnalisées sont comptées ensemble : {complete}"
            );
            assert_eq!(complete["bookCount"], 1);

            let partial = profiles
                .iter()
                .find(|profile| profile.id == "partiel")
                .unwrap();
            let partial = serde_json::to_value(partial).unwrap();
            assert_eq!(partial["customCount"], 2, "{partial}");
            assert_eq!(partial["filmCount"], 0);
        });
    }

    #[test]
    fn deleting_a_profile_removes_every_library_and_keeps_other_profiles() {
        tauri::async_runtime::block_on(async {
            let pool = schema_pool().await;
            seed_profile_with_every_library(&pool, "supprime").await;
            seed_profile_with_every_library(&pool, "conserve").await;

            delete_profile_in(&pool, "supprime")
                .await
                .expect("un profil avec ses quinze bibliothèques doit pouvoir être supprimé");

            for table in [
                "films", "series", "anime", "books", "mangas", "games", "artworks",
            ]
            .iter()
            .chain(CUSTOM_TABLES.iter())
            .chain(["profile_libraries"].iter())
            {
                let kept = if *table == "profile_libraries" { 8 } else { 1 };
                assert_eq!(count(&pool, table, "supprime").await, 0, "{table} supprimé");
                assert_eq!(
                    count(&pool, table, "conserve").await,
                    kept,
                    "{table} conservé"
                );
            }
            let orphan_quotes: i64 = sqlx::query_scalar(
                "SELECT (SELECT COUNT(*) FROM book_quotes WHERE book_id LIKE 'supprime-%')
                      + (SELECT COUNT(*) FROM manga_quotes WHERE manga_id LIKE 'supprime-%')
                      + (SELECT COUNT(*) FROM comic_quotes WHERE comic_id LIKE 'supprime-%')",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(orphan_quotes, 0);
            let kept_quotes: i64 = sqlx::query_scalar(
                "SELECT (SELECT COUNT(*) FROM book_quotes)
                      + (SELECT COUNT(*) FROM manga_quotes)
                      + (SELECT COUNT(*) FROM comic_quotes)",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(kept_quotes, 3);
            let profiles: Vec<String> = sqlx::query_scalar("SELECT id FROM profiles ORDER BY id")
                .fetch_all(&pool)
                .await
                .unwrap();
            assert_eq!(profiles, vec!["conserve".to_string()]);
            let violations: Vec<(String,)> =
                sqlx::query_as("SELECT \"table\" FROM pragma_foreign_key_check")
                    .fetch_all(&pool)
                    .await
                    .unwrap();
            assert!(violations.is_empty(), "{violations:?}");

            let summaries = list_profiles_in(&pool).await.unwrap();
            assert_eq!(summaries.len(), 1);
            assert_eq!(
                serde_json::to_value(&summaries[0]).unwrap()["customCount"],
                8,
                "le profil conservé garde ses huit fiches personnalisées"
            );
        });
    }
}
