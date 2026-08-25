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
    ]
}
