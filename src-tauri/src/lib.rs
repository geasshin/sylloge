mod database;
mod portability;
mod tmdb;
mod updater_preferences;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(portability::BackupSnapshotLock::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(database::DATABASE_URL, database::migrations())
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            portability::pick_import_json,
            portability::pick_import_films_csv_or_notion,
            portability::save_export_json,
            portability::save_export_csv,
            portability::get_backup_settings,
            portability::pick_backup_directory,
            portability::save_manual_backup_snapshot,
            portability::save_automatic_backup_snapshot,
            portability::import_library_atomically,
            updater_preferences::get_updater_preferences,
            updater_preferences::set_updater_automatic_checks_enabled,
            updater_preferences::set_ignored_updater_version,
            tmdb::get_film_tmdb_cache,
            tmdb::purge_expired_tmdb_cache,
            tmdb::search_tmdb_films,
            tmdb::associate_film_with_tmdb,
            tmdb::refresh_film_tmdb_cache,
            tmdb::remove_tmdb_association,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            tmdb::schedule_expired_cache_purge(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
