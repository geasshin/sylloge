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
    ]
}
