mod books;
mod database;
mod igdb;
mod openlibrary;
mod portability;
mod profiles;
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
            portability::pick_import_any,
            portability::pick_import_container,
            portability::pick_import_json,
            portability::pick_import_films_csv_or_notion,
            portability::save_export_json,
            portability::save_export_csv,
            portability::get_backup_settings,
            portability::pick_backup_directory,
            portability::clear_backup_settings,
            portability::save_manual_backup_snapshot,
            portability::save_automatic_backup_snapshot,
            portability::import_library_atomically,
            portability::import_library_document_atomically,
            portability::import_library_document_into_empty_profile,
            portability::import_films_into_profile,
            portability::import_series_into_profile,
            portability::import_books_into_profile,
            portability::import_games_into_profile,
            portability::import_artworks_into_profile,
            profiles::list_profiles,
            profiles::create_profile,
            profiles::rename_profile,
            profiles::delete_profile,
            profiles::select_profile,
            books::create_book_atomically,
            books::update_book_atomically,
            books::delete_book_atomically,
            updater_preferences::get_updater_preferences,
            updater_preferences::set_updater_automatic_checks_enabled,
            updater_preferences::set_ignored_updater_version,
            tmdb::get_film_tmdb_cache,
            tmdb::purge_expired_tmdb_cache,
            tmdb::search_tmdb_films,
            tmdb::preview_tmdb_film,
            tmdb::search_tmdb_series,
            tmdb::preview_tmdb_series,
            openlibrary::search_openlibrary_books,
            openlibrary::preview_openlibrary_book,
            igdb::search_igdb_games,
            igdb::preview_igdb_game,
            tmdb::associate_film_with_tmdb,
            tmdb::refresh_film_tmdb_cache,
            tmdb::remove_tmdb_association,
            tmdb::set_film_tmdb_poster,
        ])
        .setup(|app| {
            // En mode dev, pas de bundle .app : le dock garde l'icône générique.
            // On applique donc explicitement l'icône de la marque via Cocoa
            // (sans effet sur les bundles signés, qui embarquent déjà icon.icns).
            #[cfg(all(debug_assertions, target_os = "macos"))]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(image) = tauri::image::Image::from_bytes(include_bytes!("../icons/128x128@2x.png")) {
                        let _ = window.set_icon(image);
                    }
                }
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            tmdb::schedule_expired_cache_purge(app.handle().clone());
            tmdb::schedule_due_cache_refresh(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
