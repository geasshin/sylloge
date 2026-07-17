use serde::Serialize;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::database::DATABASE_URL;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterPreferences {
    automatic_checks_enabled: bool,
    ignored_version: Option<String>,
    updated_at: String,
}

#[tauri::command]
pub async fn get_updater_preferences(
    db_instances: State<'_, DbInstances>,
) -> Result<UpdaterPreferences, String> {
    let pool = sqlite_pool(&db_instances).await?;
    read_updater_preferences(&pool).await
}

#[tauri::command]
pub async fn set_updater_automatic_checks_enabled(
    db_instances: State<'_, DbInstances>,
    automatic_checks_enabled: bool,
) -> Result<UpdaterPreferences, String> {
    let pool = sqlite_pool(&db_instances).await?;
    let update = sqlx::query(
        "UPDATE updater_preferences
         SET automatic_checks_enabled = $1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE singleton = 1",
    )
    .bind(if automatic_checks_enabled { 1 } else { 0 })
    .execute(&pool)
    .await
    .map_err(|error| format!("Impossible d’enregistrer la recherche automatique : {error}"))?;

    if update.rows_affected() != 1 {
        return Err("Les préférences de mise à jour sont introuvables.".to_string());
    }

    read_updater_preferences(&pool).await
}

#[tauri::command]
pub async fn set_ignored_updater_version(
    db_instances: State<'_, DbInstances>,
    ignored_version: Option<String>,
) -> Result<UpdaterPreferences, String> {
    if ignored_version
        .as_deref()
        .is_some_and(|version| version.trim().is_empty())
    {
        return Err("La version ignorée ne peut pas être vide.".to_string());
    }

    let pool = sqlite_pool(&db_instances).await?;
    let update = sqlx::query(
        "UPDATE updater_preferences
         SET ignored_version = $1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE singleton = 1",
    )
    .bind(ignored_version.as_deref())
    .execute(&pool)
    .await
    .map_err(|error| format!("Impossible d’enregistrer la version ignorée : {error}"))?;

    if update.rows_affected() != 1 {
        return Err("Les préférences de mise à jour sont introuvables.".to_string());
    }

    read_updater_preferences(&pool).await
}

async fn sqlite_pool(db_instances: &DbInstances) -> Result<sqlx::SqlitePool, String> {
    let instances = db_instances.0.read().await;
    let database = instances
        .get(DATABASE_URL)
        .ok_or_else(|| "La base SQLite Sylloge n’est pas chargée.".to_string())?;

    match database {
        DbPool::Sqlite(pool) => Ok(pool.clone()),
        #[allow(unreachable_patterns)]
        _ => Err("La base Sylloge chargée n’est pas SQLite.".to_string()),
    }
}

async fn read_updater_preferences(pool: &sqlx::SqlitePool) -> Result<UpdaterPreferences, String> {
    let row: Option<(i64, Option<String>, String)> = sqlx::query_as(
        "SELECT automatic_checks_enabled, ignored_version, updated_at
         FROM updater_preferences
         WHERE singleton = 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Impossible de lire les préférences de mise à jour : {error}"))?;

    let Some((automatic_checks_enabled, ignored_version, updated_at)) = row else {
        return Err("Les préférences de mise à jour sont introuvables.".to_string());
    };

    Ok(UpdaterPreferences {
        automatic_checks_enabled: automatic_checks_enabled == 1,
        ignored_version,
        updated_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> sqlx::SqlitePool {
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
        ] {
            sqlx::raw_sql(migration)
                .execute(&pool)
                .await
                .expect("migration de test");
        }
        pool
    }

    #[test]
    fn updater_preferences_are_singleton_and_independent_from_profiles() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;

            let initial = read_updater_preferences(&pool)
                .await
                .expect("préférences initiales");
            assert!(initial.automatic_checks_enabled);
            assert_eq!(initial.ignored_version, None);

            sqlx::query(
                "INSERT INTO profiles (id, name, created_at, updated_at)
                 VALUES ('secondary', 'Second profil', '2026-07-18T10:00:00.000Z', '2026-07-18T10:00:00.000Z')",
            )
            .execute(&pool)
            .await
            .expect("profil indépendant");

            sqlx::query(
                "UPDATE updater_preferences
                 SET automatic_checks_enabled = 0,
                     ignored_version = '0.3.1'
                 WHERE singleton = 1",
            )
            .execute(&pool)
            .await
            .expect("mise à jour des préférences");

            let updated = read_updater_preferences(&pool)
                .await
                .expect("préférences mises à jour");
            assert!(!updated.automatic_checks_enabled);
            assert_eq!(updated.ignored_version.as_deref(), Some("0.3.1"));

            let singleton_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM updater_preferences WHERE singleton = 1")
                    .fetch_one(&pool)
                    .await
                    .expect("ligne singleton");
            assert_eq!(singleton_count, 1);
        });
    }
}
