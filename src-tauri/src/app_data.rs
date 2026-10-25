use std::fs;

use tauri::Manager;

/// Ouvre dans le Finder (macOS) ou l'Explorateur (Windows) le dossier où
/// Sylloge garde sa base et ses sauvegardes. Utile quand la base ne s'ouvre
/// plus : l'écran d'erreur propose ce chemin pour retrouver les fichiers.
#[tauri::command]
pub fn open_data_folder(app: tauri::AppHandle) -> Result<(), String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Impossible de localiser le dossier des données : {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Impossible de créer le dossier des données : {error}"))?;
    tauri_plugin_opener::open_path(&directory, None::<&str>)
        .map_err(|error| format!("Impossible d’ouvrir le dossier des données : {error}"))
}
