mod database;
mod portability;

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
        .invoke_handler(tauri::generate_handler![
            portability::pick_import_json,
            portability::save_export_json,
            portability::get_backup_settings,
            portability::pick_backup_directory,
            portability::save_manual_backup_snapshot,
            portability::save_automatic_backup_snapshot,
            portability::import_library_atomically,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
