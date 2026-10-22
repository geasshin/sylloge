use tauri_plugin_sql::{Migration, MigrationKind};

pub const DATABASE_URL: &str = "sqlite:sylloge.db";

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_profiles_and_films",
            sql: include_str!("../migrations/0001_create_profiles_and_films.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_default_profile",
            sql: include_str!("../migrations/0002_create_default_profile.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "track_current_profile",
            sql: include_str!("../migrations/0003_track_current_profile.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_backup_settings",
            sql: include_str!("../migrations/0004_create_backup_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_backup_snapshots",
            sql: include_str!("../migrations/0005_create_backup_snapshots.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_updater_preferences",
            sql: include_str!("../migrations/0006_create_updater_preferences.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "normalize_film_optional_data",
            sql: include_str!("../migrations/0007_normalize_film_optional_data.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create_film_tmdb_cache",
            sql: include_str!("../migrations/0008_create_film_tmdb_cache.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add_selected_poster_url",
            sql: include_str!("../migrations/0009_add_selected_poster_url.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "create_cultural_media",
            sql: include_str!("../migrations/0010_create_cultural_media.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "nullable_current_profile",
            sql: include_str!("../migrations/0011_nullable_current_profile.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "create_saved_views",
            sql: include_str!("../migrations/0012_create_saved_views.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "saved_views_unified_criteria",
            sql: include_str!("../migrations/0013_saved_views_unified_criteria.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "normalize_game_statuses",
            sql: include_str!("../migrations/0014_normalize_game_statuses.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "artwork_custom_fields",
            sql: include_str!("../migrations/0015_artwork_custom_fields.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "artwork_discovered",
            sql: include_str!("../migrations/0016_artwork_discovered.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "media_provider_links",
            sql: include_str!("../migrations/0017_media_provider_links.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "backfill_media_provider_links",
            sql: include_str!("../migrations/0018_backfill_media_provider_links.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "profile_identity_and_first_run",
            sql: include_str!("../migrations/0019_profile_identity_and_first_run.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "split_anime_and_mangas",
            sql: include_str!("../migrations/0020_split_anime_and_mangas.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "custom_libraries",
            sql: include_str!("../migrations/0021_custom_libraries.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use sqlx::{Connection, SqliteConnection};

    #[test]
    fn media_provider_links_migration_applies_after_the_complete_schema() {
        tauri::async_runtime::block_on(async {
            let mut connection = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("create in-memory SQLite database");

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
            ] {
                sqlx::raw_sql(migration)
                    .execute(&mut connection)
                    .await
                    .expect("apply Sylloge migration");
            }

            for statement in [
                "INSERT INTO series (id, profile_id, title, poster_url) VALUES ('legacy-series', 'default', 'Série', 'https://image.tmdb.org/t/p/w500/test.jpg')",
                "INSERT INTO books (id, profile_id, title, cover_url) VALUES ('legacy-book', 'default', 'Livre', 'https://covers.openlibrary.org/b/id/1-L.jpg')",
                "INSERT INTO games (id, profile_id, title, cover_url) VALUES ('legacy-game', 'default', 'Jeu', 'https://images.igdb.com/igdb/image/upload/t_cover_big/test.jpg')",
            ] {
                sqlx::query(statement)
                    .execute(&mut connection)
                    .await
                    .expect("seed a legacy provider-backed item");
            }

            sqlx::raw_sql(include_str!("../migrations/0017_media_provider_links.sql"))
                .execute(&mut connection)
                .await
                .expect("apply media-provider-link migration");

            sqlx::raw_sql(include_str!(
                "../migrations/0018_backfill_media_provider_links.sql"
            ))
            .execute(&mut connection)
            .await
            .expect("apply legacy provider-link backfill migration");

            let table_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'media_provider_links'",
            )
            .fetch_one(&mut connection)
            .await
            .expect("read provider-link table");
            assert_eq!(table_count, 1);

            let trigger_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name IN ('delete_series_provider_link', 'delete_book_provider_link', 'delete_game_provider_link')",
            )
            .fetch_one(&mut connection)
            .await
            .expect("read provider-link triggers");
            assert_eq!(trigger_count, 3);

            let legacy_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM media_provider_links WHERE provider_id LIKE 'legacy:%'",
            )
            .fetch_one(&mut connection)
            .await
            .expect("read migrated legacy provider links");
            assert_eq!(legacy_count, 3);
        });
    }

    #[test]
    fn profile_identity_migration_only_removes_the_untouched_default_profile() {
        tauri::async_runtime::block_on(async {
            async fn apply_schema(connection: &mut SqliteConnection) {
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
                ] {
                    sqlx::raw_sql(migration)
                        .execute(&mut *connection)
                        .await
                        .expect("apply Sylloge schema before profile identity");
                }
            }

            let mut empty_connection = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("create empty-profile database");
            apply_schema(&mut empty_connection).await;
            sqlx::raw_sql(include_str!(
                "../migrations/0019_profile_identity_and_first_run.sql"
            ))
            .execute(&mut empty_connection)
            .await
            .expect("apply first-run migration to untouched profile");

            let empty_profile_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM profiles")
                .fetch_one(&mut empty_connection)
                .await
                .expect("count profiles after first-run migration");
            let current_profile: Option<String> =
                sqlx::query_scalar("SELECT profile_id FROM current_profile WHERE singleton = 1")
                    .fetch_one(&mut empty_connection)
                    .await
                    .expect("read current profile after first-run migration");
            assert_eq!(empty_profile_count, 0);
            assert_eq!(current_profile, None);

            let avatar_column_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM pragma_table_info('profiles') WHERE name = 'avatar_data_url'",
            )
            .fetch_one(&mut empty_connection)
            .await
            .expect("read avatar column");
            assert_eq!(avatar_column_count, 1);

            let mut used_connection = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("create used-profile database");
            apply_schema(&mut used_connection).await;
            sqlx::query("INSERT INTO films (id, profile_id, title) VALUES ('kept-film', 'default', 'Film conservé')")
                .execute(&mut used_connection)
                .await
                .expect("seed used default profile");
            sqlx::raw_sql(include_str!(
                "../migrations/0019_profile_identity_and_first_run.sql"
            ))
            .execute(&mut used_connection)
            .await
            .expect("apply first-run migration to used profile");

            let used_profile_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM profiles")
                .fetch_one(&mut used_connection)
                .await
                .expect("count preserved profiles");
            let used_current_profile: Option<String> =
                sqlx::query_scalar("SELECT profile_id FROM current_profile WHERE singleton = 1")
                    .fetch_one(&mut used_connection)
                    .await
                    .expect("read preserved current profile");
            assert_eq!(used_profile_count, 1);
            assert_eq!(used_current_profile.as_deref(), Some("default"));
        });
    }
}
