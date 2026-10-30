mod app_data;
mod art_images;
mod books;
mod custom_entries;
mod database;
mod http;
mod igdb;
mod installation;
mod migration_backup;
mod navigation;
mod openlibrary;
mod portability;
mod profiles;
mod series;
mod share_images;
mod tmdb;
mod updater;
mod updater_preferences;
mod user_agent;

use tauri::Manager;

use crate::navigation::navigation_guard;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // En premier : une seconde instance doit rendre la main à la première
        // avant d'ouvrir la base ou d'initialiser les autres greffons.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(navigation_guard())
        .manage(portability::BackupSnapshotLock::default())
        .manage(updater::PendingUpdate::default())
        .plugin(tauri_plugin_dialog::init())
        // Avant le greffon SQL : il copie la base si une migration est en attente.
        .plugin(migration_backup::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(database::DATABASE_URL, database::migrations())
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_data::open_data_folder,
            portability::pick_import_any,
            portability::pick_import_container,
            portability::pick_import_json,
            portability::pick_import_films_csv_or_notion,
            portability::save_export_json,
            portability::save_export_csv,
            portability::save_share_image,
            share_images::fetch_remote_image,
            art_images::fetch_commons_search,
            portability::get_backup_settings,
            portability::pick_backup_destination,
            portability::configure_backup_destination,
            portability::pick_backup_directory,
            portability::clear_backup_settings,
            portability::save_manual_backup_snapshot,
            portability::save_automatic_backup_snapshot,
            portability::list_backup_snapshots,
            portability::read_backup_snapshot,
            portability::find_backup_candidates,
            portability::import_library_atomically,
            portability::import_library_document_atomically,
            portability::import_library_document_into_empty_profile,
            portability::import_films_into_profile,
            portability::import_series_into_profile,
            portability::import_anime_into_profile,
            portability::import_books_into_profile,
            portability::import_mangas_into_profile,
            portability::import_games_into_profile,
            portability::import_artworks_into_profile,
            profiles::list_profiles,
            profiles::create_profile,
            profiles::update_profile,
            profiles::rename_profile,
            profiles::delete_profile,
            profiles::select_profile,
            books::create_book_atomically,
            books::update_book_atomically,
            books::delete_book_atomically,
            series::move_series_library,
            custom_entries::create_custom_entry_atomically,
            custom_entries::update_custom_entry_atomically,
            custom_entries::delete_custom_entry_atomically,
            custom_entries::remove_custom_library_atomically,
            updater_preferences::get_updater_preferences,
            updater_preferences::set_updater_automatic_checks_enabled,
            updater_preferences::set_ignored_updater_version,
            updater::check_for_app_update,
            updater::install_app_update,
            tmdb::get_film_tmdb_cache,
            tmdb::purge_expired_tmdb_cache,
            tmdb::search_tmdb_films,
            tmdb::preview_tmdb_film,
            tmdb::fetch_tmdb_director_portrait,
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
            // Identifiant anonyme de l’installation : il sert au relais à compter
            // les requêtes par appareil. Absent, le relais compte par adresse IP.
            if let Ok(directory) = app.path().app_data_dir() {
                installation::initialize(&directory);
            }
            // En mode dev, pas de bundle .app : le dock garde l'icône générique.
            // On applique donc explicitement l'icône de la marque via Cocoa
            // (sans effet sur les bundles signés, qui embarquent déjà icon.icns).
            #[cfg(all(debug_assertions, target_os = "macos"))]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(image) =
                        tauri::image::Image::from_bytes(include_bytes!("../icons/128x128@2x.png"))
                    {
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
