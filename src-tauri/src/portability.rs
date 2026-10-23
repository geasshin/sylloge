use serde::{Deserialize, Serialize};
use std::{
    collections::{HashSet, VecDeque},
    fs::{self, OpenOptions},
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{async_runtime::Mutex, AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::books::{is_comics_category, COMICS_HAVE_THEIR_OWN_LIBRARY};
use crate::database::DATABASE_URL;

const RECENT_BACKUP_COPIES: usize = 3;
const WEEKLY_BACKUP_ARCHIVES: usize = 4;
const MONTHLY_BACKUP_ARCHIVES: usize = 6;
const SNAPSHOT_PREFIX: &str = "sylloge-sauvegarde-";
// Copies écrites avant les noms explicites : toujours reconnues et nettoyées.
const LEGACY_SNAPSHOT_PREFIX: &str = "sylloge-films-v1-";
const SNAPSHOT_NANOS_PER_MINUTE: u128 = 60_000_000_000;
const SNAPSHOT_COUNTER_MODULUS: u128 = 1_000_000_000;
const MAX_IMPORT_FILE_BYTES: u64 = 16 * 1024 * 1024;
// Toute copie écrite par Sylloge doit rester relisible et restaurable : cette
// borne sert à la fois à l’admission à l’écriture et à la lecture des copies
// enregistrées. Elle est plus large que l’import de fichiers tiers, pour qu’un
// profil volumineux garde des copies utilisables au lieu d’en produire
// d’illisibles qui évinceraient les bonnes.
const MAX_SNAPSHOT_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ZIP_CONTAINER_ENTRIES: usize = 512;
const MAX_ZIP_PATH_COMPONENTS: usize = 8;
const MAX_ZIP_NESTING_DEPTH: usize = 4;
const MAX_ZIP_UNCOMPRESSED_BYTES: u128 = 32 * 1024 * 1024;
const MAX_ZIP_ENTRY_BYTES: u64 = 4 * 1024 * 1024;
static SNAPSHOT_NONCE: AtomicU64 = AtomicU64::new(0);

struct NativeDialogLabels {
    import_any_title: &'static str,
    import_any_filter: &'static str,
    import_container_title: &'static str,
    import_json_title: &'static str,
    json_filter: &'static str,
    import_films_title: &'static str,
    import_films_filter: &'static str,
    export_title: &'static str,
    csv_filter: &'static str,
    backup_destination_title: &'static str,
    backup_directory_title: &'static str,
}

// Only application-owned copy is localized; native controls follow the OS.
// Old callers (no language) and unsupported values keep the French default.
fn native_dialog_labels(language: Option<&str>) -> NativeDialogLabels {
    let text = |french: &'static str, english: &'static str| {
        if language == Some("en") {
            english
        } else {
            french
        }
    };
    NativeDialogLabels {
        import_any_title: text("Choisir un fichier à importer", "Choose a file to import"),
        import_any_filter: text(
            "Import Sylloge (JSON, CSV, ZIP)",
            "Sylloge import (JSON, CSV, ZIP)",
        ),
        import_container_title: text("Choisir un dossier à analyser", "Choose a folder to scan"),
        import_json_title: text("Choisir un export Sylloge", "Choose a Sylloge export"),
        json_filter: text("Export JSON Sylloge", "Sylloge JSON export"),
        import_films_title: text(
            "Choisir un CSV Films ou un ZIP compatible",
            "Choose a Films CSV or a compatible ZIP",
        ),
        import_films_filter: text("CSV ou ZIP compatible", "Compatible CSV or ZIP"),
        export_title: text("Exporter le profil Sylloge", "Export the Sylloge profile"),
        csv_filter: text("Export CSV Sylloge", "Sylloge CSV export"),
        backup_destination_title: text(
            "Choisir le dossier des futures sauvegardes Sylloge",
            "Choose the folder for future Sylloge backups",
        ),
        backup_directory_title: text(
            "Choisir le dossier de sauvegarde Sylloge",
            "Choose the Sylloge backup folder",
        ),
    }
}

pub struct BackupSnapshotLock(Mutex<()>);

impl Default for BackupSnapshotLock {
    fn default() -> Self {
        Self(Mutex::new(()))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedJsonFile {
    name: String,
    contents: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedFilmsImportFile {
    name: String,
    kind: &'static str,
    csv_candidates: Vec<CsvImportCandidate>,
    markdown_pages: Vec<MarkdownPage>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvImportCandidate {
    id: String,
    name: String,
    contents: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportContainerCandidate {
    id: String,
    name: String,
    kind: &'static str,
    contents: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownPage {
    name: String,
    contents: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupSettings {
    backup_directory: String,
    last_automatic_snapshot_day: Option<String>,
    directory_available: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupSnapshotResult {
    file_name: String,
    retained_snapshot_count: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct RegisteredBackupSnapshot {
    file_name: String,
    created_at: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupSnapshotEntry {
    file_name: String,
    created_at: String,
    available: bool,
}

/// Copie Sylloge trouvée sur le Mac : `location` est un libellé lisible
/// (« iCloud Drive › Sylloge »), `modified_at` en millisecondes Unix.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FoundBackup {
    file_name: String,
    location: String,
    modified_at: i64,
    contents: String,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FoundBackups {
    candidates: Vec<FoundBackup>,
    unreadable_locations: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct BackupSearchLimits {
    /// Dossiers imbriqués sous une racine : 0 pour un fichier posé à la racine.
    max_depth: usize,
    /// Dossiers lus au total, racines comprises.
    max_directories: usize,
    /// Fichiers les plus récents réellement lus.
    max_candidates: usize,
    max_file_bytes: u64,
    max_total_bytes: u64,
}

const BACKUP_SEARCH_LIMITS: BackupSearchLimits = BackupSearchLimits {
    max_depth: 3,
    max_directories: 3_000,
    max_candidates: 12,
    max_file_bytes: MAX_IMPORT_FILE_BYTES,
    max_total_bytes: 64 * 1024 * 1024,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomaticBackupSnapshotResult {
    outcome: &'static str,
    file_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLibraryPayload {
    profile: ImportProfile,
    films: Vec<ImportFilm>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLibraryDocumentPayload {
    profile: ImportProfile,
    films: Vec<ImportFilm>,
    series: Vec<ImportSeries>,
    /// Section Animation japonaise (v3). Absente d'un document v1/v2 : les
    /// fiches `series` de catégorie `animation` y sont alors routées.
    #[serde(default)]
    anime: Vec<ImportAnime>,
    books: Vec<ImportBook>,
    /// Section Mangas (v3). Absente d'un document v1/v2 : les fiches `books`
    /// de catégorie `manga` y sont alors routées.
    #[serde(default)]
    mangas: Vec<ImportManga>,
    games: Vec<ImportGame>,
    artworks: Vec<ImportArtwork>,
    /// Bibliothèques personnalisées (modèles prêts) ajoutées au profil, avec
    /// leurs fiches. Absente d’un document antérieur : aucune n’est créée.
    #[serde(default)]
    custom_libraries: Vec<ImportCustomLibrary>,
}

/// Bibliothèque personnalisée d’un document : `libraryId` doit être l’un des
/// huit modèles prêts ; `position` et `addedAt` alimentent `profile_libraries`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportCustomLibrary {
    library_id: String,
    position: i64,
    added_at: String,
    entries: Vec<ImportCustomEntry>,
}

/// Fiche d’une bibliothèque personnalisée : mêmes colonnes pour les huit
/// tables. `details` est un objet JSON dont chaque valeur est un texte.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportCustomEntry {
    id: String,
    profile_id: String,
    title: String,
    creator: Option<String>,
    year: Option<i64>,
    status: String,
    rating: Option<f64>,
    is_favorite: bool,
    progress_current: Option<i64>,
    progress_total: Option<i64>,
    progress_updated_at: Option<String>,
    started_at: Option<String>,
    finished_at: Option<String>,
    cover_url: Option<String>,
    summary: Option<String>,
    personal_note: Option<String>,
    details: serde_json::Map<String, serde_json::Value>,
    created_at: String,
    updated_at: String,
    /// Citations : acceptées pour Comics seulement.
    #[serde(default)]
    quotes: Vec<ImportCustomQuote>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportCustomQuote {
    id: String,
    entry_id: String,
    body: String,
    position: i64,
    created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportProfile {
    id: String,
    name: String,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFilm {
    id: String,
    profile_id: String,
    title: String,
    original_title: Option<String>,
    year: Option<i64>,
    status: String,
    is_favorite: bool,
    rating: Option<f64>,
    watched_at: Option<String>,
    personal_note: Option<String>,
    director: Option<String>,
    summary: Option<String>,
    provider_name: Option<String>,
    provider_id: Option<String>,
    poster_url: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSeries {
    id: String,
    profile_id: String,
    title: String,
    showrunner: Option<String>,
    casting: Option<String>,
    summary: Option<String>,
    category: String,
    status: String,
    rating: Option<f64>,
    is_favorite: bool,
    seasons_seen: Option<i64>,
    seasons_total: Option<i64>,
    progress_updated_at: Option<String>,
    started_at: Option<String>,
    poster_url: Option<String>,
    personal_note: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportAnime {
    id: String,
    profile_id: String,
    title: String,
    showrunner: Option<String>,
    casting: Option<String>,
    summary: Option<String>,
    /// Facultative : la table `anime` n'a pas de colonne de catégorie. Le
    /// document v3 peut néanmoins conserver la catégorie du type `Series`
    /// exporté ; elle doit alors valoir « animation ».
    #[serde(default)]
    category: Option<String>,
    status: String,
    rating: Option<f64>,
    is_favorite: bool,
    seasons_seen: Option<i64>,
    seasons_total: Option<i64>,
    progress_updated_at: Option<String>,
    started_at: Option<String>,
    poster_url: Option<String>,
    personal_note: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBook {
    id: String,
    profile_id: String,
    title: String,
    author: Option<String>,
    year: Option<i64>,
    summary: Option<String>,
    category: String,
    status: String,
    rating: Option<f64>,
    is_favorite: bool,
    volumes_read: Option<i64>,
    volumes_total: Option<i64>,
    progress_updated_at: Option<String>,
    started_at: Option<String>,
    cover_url: Option<String>,
    personal_note: Option<String>,
    created_at: String,
    updated_at: String,
    quotes: Vec<ImportBookQuote>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportBookQuote {
    id: String,
    book_id: String,
    body: String,
    position: i64,
    created_at: String,
}

/// Fiche Mangas (v3). Même forme qu'une fiche Livres ; `bookId` d'une citation
/// alimente la colonne `manga_id` de `manga_quotes`, et la catégorie — absente
/// en base — doit valoir « manga » si le document la conserve.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportManga {
    id: String,
    profile_id: String,
    title: String,
    author: Option<String>,
    year: Option<i64>,
    summary: Option<String>,
    #[serde(default)]
    category: Option<String>,
    status: String,
    rating: Option<f64>,
    is_favorite: bool,
    volumes_read: Option<i64>,
    volumes_total: Option<i64>,
    progress_updated_at: Option<String>,
    started_at: Option<String>,
    cover_url: Option<String>,
    personal_note: Option<String>,
    created_at: String,
    updated_at: String,
    quotes: Vec<ImportBookQuote>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportGame {
    id: String,
    profile_id: String,
    title: String,
    developer: Option<String>,
    platform: Option<String>,
    year: Option<i64>,
    status: String,
    rating: Option<f64>,
    is_favorite: bool,
    played_at: Option<String>,
    cover_url: Option<String>,
    personal_note: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportArtwork {
    id: String,
    profile_id: String,
    title: String,
    artist: Option<String>,
    year: Option<i64>,
    form: String,
    location: Option<String>,
    exhibition: Option<String>,
    status: String,
    is_favorite: bool,
    discovered_at: Option<String>,
    image_url: Option<String>,
    personal_note: Option<String>,
    #[serde(default)]
    custom_fields: Vec<ImportArtworkCustomField>,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize, Serialize)]
struct ImportArtworkCustomField {
    name: String,
    value: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLibraryResult {
    profile_id: String,
    film_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLibraryDocumentResult {
    profile_id: String,
    film_count: usize,
    series_count: usize,
    anime_count: usize,
    book_count: usize,
    manga_count: usize,
    game_count: usize,
    artwork_count: usize,
    /// Bibliothèques personnalisées présentes dans le document.
    custom_library_count: usize,
    /// Fiches de ces bibliothèques, toutes confondues.
    custom_entry_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedAnyImportFile {
    name: String,
    /// Type détecté côté natif : "json" | "csv" | "notion" (adaptateur Film historique)
    /// | "container" (ZIP ou dossier à choisir côté interface).
    kind: String,
    /// Contenu texte pour JSON/CSV ; None pour un ZIP binaire.
    contents: Option<String>,
    /// Pour l’adaptateur ZIP Film historique : candidats CSV et pages Markdown extraits.
    csv_candidates: Vec<CsvImportCandidate>,
    markdown_pages: Vec<MarkdownPage>,
    /// Pour un ZIP ou dossier : candidats JSON/CSV relus en mémoire et bornés.
    container_candidates: Vec<ImportContainerCandidate>,
}

/// Sélecteur d'import unifié : accepte JSON, CSV et ZIP, puis détecte le type
/// afin que l'interface réutilise le pipeline d’import approprié.
#[tauri::command]
pub async fn pick_import_any(
    app: AppHandle,
    language: Option<String>,
) -> Result<Option<PickedAnyImportFile>, String> {
    let labels = native_dialog_labels(language.as_deref());
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter(labels.import_any_filter, &["json", "csv", "zip"])
        .set_title(labels.import_any_title)
        .blocking_pick_file()
    else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|error| format!("Chemin de fichier illisible : {error}"))?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("import")
        .to_string();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    match extension.as_str() {
        "json" => {
            let contents = read_utf8_file_with_limit(&path, MAX_IMPORT_FILE_BYTES)?;
            Ok(Some(PickedAnyImportFile {
                name,
                kind: "json".to_string(),
                contents: Some(contents),
                csv_candidates: Vec::new(),
                markdown_pages: Vec::new(),
                container_candidates: Vec::new(),
            }))
        }
        "csv" => {
            let contents = read_utf8_file_with_limit(&path, MAX_IMPORT_FILE_BYTES)?;
            Ok(Some(PickedAnyImportFile {
                csv_candidates: vec![CsvImportCandidate {
                    id: "csv-0".to_string(),
                    name: name.clone(),
                    contents,
                }],
                name,
                kind: "csv".to_string(),
                contents: None,
                markdown_pages: Vec::new(),
                container_candidates: Vec::new(),
            }))
        }
        "zip" => inspect_zip_container(&name, &read_file_with_limit(&path, MAX_IMPORT_FILE_BYTES)?)
            .map(Some),
        _ => Err("Choisissez un fichier JSON, CSV ou ZIP compatible.".to_string()),
    }
}

#[tauri::command]
pub async fn pick_import_container(
    app: AppHandle,
    language: Option<String>,
) -> Result<Option<PickedAnyImportFile>, String> {
    let labels = native_dialog_labels(language.as_deref());
    let Some(folder_path) = app
        .dialog()
        .file()
        .set_title(labels.import_container_title)
        .blocking_pick_folder()
    else {
        return Ok(None);
    };

    let path = folder_path
        .into_path()
        .map_err(|error| format!("Chemin de dossier illisible : {error}"))?;
    inspect_directory_container(&path).map(Some)
}

#[tauri::command]
pub async fn pick_import_json(
    app: AppHandle,
    language: Option<String>,
) -> Result<Option<PickedJsonFile>, String> {
    let labels = native_dialog_labels(language.as_deref());
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter(labels.json_filter, &["json"])
        .set_title(labels.import_json_title)
        .blocking_pick_file()
    else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|error| format!("Chemin de fichier illisible : {error}"))?;
    let contents = read_utf8_file_with_limit(&path, MAX_SNAPSHOT_FILE_BYTES)?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("export.json")
        .to_string();

    Ok(Some(PickedJsonFile { name, contents }))
}

#[tauri::command]
pub async fn pick_import_films_csv_or_notion(
    app: AppHandle,
    language: Option<String>,
) -> Result<Option<PickedFilmsImportFile>, String> {
    let labels = native_dialog_labels(language.as_deref());
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter(labels.import_films_filter, &["csv", "zip"])
        .set_title(labels.import_films_title)
        .blocking_pick_file()
    else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|error| format!("Chemin de fichier illisible : {error}"))?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("import-films")
        .to_string();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    match extension.as_str() {
        "csv" => Ok(Some(PickedFilmsImportFile {
            csv_candidates: vec![CsvImportCandidate {
                id: "csv-0".to_string(),
                name: name.clone(),
                contents: read_utf8_file_with_limit(&path, MAX_IMPORT_FILE_BYTES)?,
            }],
            name,
            kind: "csv",
            markdown_pages: Vec::new(),
        })),
        "zip" => extract_notion_zip(&name, &read_file_with_limit(&path, MAX_IMPORT_FILE_BYTES)?)
            .map(Some),
        _ => Err("Choisissez un fichier CSV ou ZIP compatible.".to_string()),
    }
}

fn read_file_with_limit(path: &Path, maximum_bytes: u64) -> Result<Vec<u8>, String> {
    if !fs::metadata(path)
        .map_err(|error| format!("Impossible de lire le fichier choisi : {error}"))?
        .is_file()
    {
        return Err("Le chemin choisi n’est pas un fichier.".to_string());
    }
    let file = fs::File::open(path)
        .map_err(|error| format!("Impossible de lire le fichier choisi : {error}"))?;
    let metadata = file
        .metadata()
        .map_err(|error| format!("Impossible de lire le fichier choisi : {error}"))?;
    if !metadata.is_file() {
        return Err("Le chemin choisi n’est pas un fichier.".to_string());
    }
    if metadata.len() > maximum_bytes {
        return Err(format!(
            "Le fichier choisi dépasse la limite sûre de {} Mio.",
            maximum_bytes / (1024 * 1024)
        ));
    }
    read_import_bytes(file, maximum_bytes)
}

fn read_import_bytes(reader: impl Read, maximum_bytes: u64) -> Result<Vec<u8>, String> {
    let mut contents = Vec::new();
    reader
        .take(maximum_bytes.saturating_add(1))
        .read_to_end(&mut contents)
        .map_err(|error| format!("Impossible de lire le fichier choisi : {error}"))?;
    if contents.len() as u64 > maximum_bytes {
        return Err(format!(
            "Le fichier choisi dépasse la limite sûre de {} Mio.",
            maximum_bytes / (1024 * 1024)
        ));
    }
    Ok(contents)
}

fn read_utf8_file_with_limit(path: &Path, maximum_bytes: u64) -> Result<String, String> {
    String::from_utf8(read_file_with_limit(path, maximum_bytes)?)
        .map_err(|_| "Le CSV choisi doit être encodé en UTF-8.".to_string())
}

fn extract_notion_zip(name: &str, contents: &[u8]) -> Result<PickedFilmsImportFile, String> {
    if contents.len() as u64 > MAX_IMPORT_FILE_BYTES {
        return Err("L’archive ZIP dépasse la limite sûre de 16 Mio.".to_string());
    }
    let mut extraction = NotionZipExtraction::default();
    extraction.read_archive(contents, 0, "")?;

    if extraction.csv_files.is_empty() {
        return Err(
            "L’archive ZIP ne contient aucun CSV compatible avec l’import Films historique."
                .to_string(),
        );
    }
    Ok(PickedFilmsImportFile {
        name: name.to_string(),
        kind: "notion",
        csv_candidates: extraction.csv_files,
        markdown_pages: extraction.markdown_pages,
    })
}

#[derive(Default)]
struct NotionZipExtraction {
    entry_count: usize,
    decompressed_bytes: u128,
    next_csv_candidate_id: usize,
    csv_files: Vec<CsvImportCandidate>,
    markdown_pages: Vec<MarkdownPage>,
}

impl NotionZipExtraction {
    fn read_archive(
        &mut self,
        contents: &[u8],
        nesting_depth: usize,
        entry_prefix: &str,
    ) -> Result<(), String> {
        let mut archive = zip::ZipArchive::new(Cursor::new(contents))
            .map_err(|error| format!("L’archive ZIP est invalide : {error}"))?;

        for index in 0..archive.len() {
            let mut file = archive.by_index(index).map_err(|error| {
                let message = error.to_string();
                if message.to_ascii_lowercase().contains("password required")
                    || message.to_ascii_lowercase().contains("encrypt")
                {
                    "Les archives ZIP chiffrées ne sont pas prises en charge.".to_string()
                } else {
                    format!("Une entrée de l’archive ZIP est illisible : {message}")
                }
            })?;
            let raw_name = file.name();
            let raw_path = Path::new(raw_name);
            let has_windows_volume_prefix = raw_name
                .as_bytes()
                .get(..2)
                .is_some_and(|prefix| prefix[0].is_ascii_alphabetic() && prefix[1] == b':');
            if raw_name.contains('\\')
                || has_windows_volume_prefix
                || raw_path.components().any(|component| {
                    matches!(
                        component,
                        std::path::Component::ParentDir
                            | std::path::Component::RootDir
                            | std::path::Component::Prefix(_)
                    )
                })
            {
                return Err("L’archive ZIP contient un chemin de fichier non sûr.".to_string());
            }
            let safe_path = file.enclosed_name().ok_or_else(|| {
                "L’archive ZIP contient un chemin de fichier non sûr.".to_string()
            })?;
            let component_count = safe_path.components().count();
            if component_count > MAX_ZIP_PATH_COMPONENTS {
                return Err(format!(
                    "L’archive ZIP dépasse la limite de {MAX_ZIP_PATH_COMPONENTS} segments de chemin."
                ));
            }
            self.count_entry()?;
            if file.encrypted() {
                return Err("Les archives ZIP chiffrées ne sont pas prises en charge.".to_string());
            }
            if file.is_symlink() {
                return Err(
                    "L’archive ZIP contient un lien symbolique non pris en charge.".to_string(),
                );
            }
            if file.is_dir() {
                continue;
            }

            let entry_name = safe_path.to_string_lossy().into_owned();
            let lower_name = entry_name.to_ascii_lowercase();
            let is_nested_zip = lower_name.ends_with(".zip");
            let is_legacy_film_payload =
                lower_name.ends_with(".csv") || lower_name.ends_with(".md");
            if !is_nested_zip && !is_legacy_film_payload {
                continue;
            }
            if file.size() > MAX_ZIP_ENTRY_BYTES {
                return Err(
                    "Une entrée de l’archive ZIP dépasse la limite sûre de 4 Mio.".to_string(),
                );
            }
            if is_nested_zip && nesting_depth >= MAX_ZIP_NESTING_DEPTH {
                return Err(format!(
                    "L’archive ZIP dépasse la limite de {MAX_ZIP_NESTING_DEPTH} archives ZIP imbriquées."
                ));
            }

            let entry_contents = read_zip_entry(&mut file)?;
            self.count_decompressed_bytes(entry_contents.len())?;

            if is_nested_zip {
                let nested_prefix = format!("{entry_prefix}{entry_name}!/");
                self.read_archive(&entry_contents, nesting_depth + 1, &nested_prefix)?;
                continue;
            }

            let entry_contents = String::from_utf8(entry_contents)
                .map_err(|_| format!("L’entrée « {entry_name} » doit être encodée en UTF-8."))?;
            let display_name = format!("{entry_prefix}{entry_name}");
            if lower_name.ends_with(".csv") {
                self.csv_files.push(CsvImportCandidate {
                    id: format!("csv-{}", self.next_csv_candidate_id),
                    name: display_name,
                    contents: entry_contents,
                });
                self.next_csv_candidate_id += 1;
            } else {
                self.markdown_pages.push(MarkdownPage {
                    name: display_name,
                    contents: entry_contents,
                });
            }
        }

        Ok(())
    }

    fn count_entry(&mut self) -> Result<(), String> {
        self.entry_count += 1;
        if self.entry_count > MAX_ZIP_CONTAINER_ENTRIES {
            return Err(format!(
                "L’archive ZIP contient plus de {MAX_ZIP_CONTAINER_ENTRIES} entrées."
            ));
        }
        Ok(())
    }

    fn count_decompressed_bytes(&mut self, byte_count: usize) -> Result<(), String> {
        self.decompressed_bytes += byte_count as u128;
        if self.decompressed_bytes > MAX_ZIP_UNCOMPRESSED_BYTES {
            return Err(
                "L’archive ZIP dépasse la limite de contenu décompressé de 32 Mio.".to_string(),
            );
        }
        Ok(())
    }
}

#[derive(Default)]
struct ContainerExtraction {
    entry_count: usize,
    decompressed_bytes: u128,
    next_candidate_id: usize,
    candidates: Vec<ImportContainerCandidate>,
    markdown_pages: Vec<MarkdownPage>,
}

impl ContainerExtraction {
    fn read_zip_archive(
        &mut self,
        contents: &[u8],
        nesting_depth: usize,
        entry_prefix: &str,
    ) -> Result<(), String> {
        let mut archive = zip::ZipArchive::new(Cursor::new(contents))
            .map_err(|error| format!("L’archive ZIP est invalide : {error}"))?;

        for index in 0..archive.len() {
            let mut file = archive.by_index(index).map_err(zip_entry_error)?;
            let raw_name = file.name();
            let safe_path = checked_zip_path(raw_name)?;
            self.count_entry("L’archive ZIP")?;
            if file.encrypted() {
                return Err("Les archives ZIP chiffrées ne sont pas prises en charge.".to_string());
            }
            if file.is_symlink() {
                return Err(
                    "L’archive ZIP contient un lien symbolique non pris en charge.".to_string(),
                );
            }
            if file.is_dir() {
                continue;
            }

            let entry_name = safe_path.to_string_lossy().into_owned();
            let lower_name = entry_name.to_ascii_lowercase();
            let is_nested_zip = lower_name.ends_with(".zip");
            let is_candidate = lower_name.ends_with(".json") || lower_name.ends_with(".csv");
            let is_legacy_markdown = lower_name.ends_with(".md");
            if !is_nested_zip && !is_candidate && !is_legacy_markdown {
                continue;
            }
            if file.size() > MAX_ZIP_ENTRY_BYTES {
                return Err(
                    "Une entrée de l’archive ZIP dépasse la limite sûre de 4 Mio.".to_string(),
                );
            }
            if is_nested_zip && nesting_depth >= MAX_ZIP_NESTING_DEPTH {
                return Err(format!(
                    "L’archive ZIP dépasse la limite de {MAX_ZIP_NESTING_DEPTH} archives ZIP imbriquées."
                ));
            }

            let entry_contents = read_zip_entry(&mut file)?;
            self.count_decompressed_bytes(entry_contents.len(), "L’archive ZIP")?;
            if is_nested_zip {
                self.read_zip_archive(
                    &entry_contents,
                    nesting_depth + 1,
                    &format!("{entry_prefix}{entry_name}!/"),
                )?;
                continue;
            }

            let text = String::from_utf8(entry_contents)
                .map_err(|_| format!("L’entrée « {entry_name} » doit être encodée en UTF-8."))?;
            let display_name = format!("{entry_prefix}{entry_name}");
            if is_candidate {
                self.push_candidate(
                    display_name,
                    if lower_name.ends_with(".json") {
                        "json"
                    } else {
                        "csv"
                    },
                    text,
                );
            } else {
                self.markdown_pages.push(MarkdownPage {
                    name: display_name,
                    contents: text,
                });
            }
        }

        Ok(())
    }

    fn read_directory(
        &mut self,
        root: &Path,
        directory: &Path,
        depth: usize,
    ) -> Result<(), String> {
        let mut entries = fs::read_dir(directory)
            .map_err(|error| format!("Impossible de lire le dossier choisi : {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| {
                format!("Impossible de lire une entrée du dossier choisi : {error}")
            })?;
        entries.sort_by_key(|entry| entry.file_name());

        for entry in entries {
            let path = entry.path();
            let relative = path.strip_prefix(root).map_err(|_| {
                "Le dossier choisi contient un chemin qui ne peut pas être inspecté.".to_string()
            })?;
            let component_count = relative.components().count();
            if component_count == 0
                || component_count > MAX_ZIP_PATH_COMPONENTS
                || depth + 1 != component_count
            {
                return Err(format!(
                    "Le dossier choisi dépasse la limite de {MAX_ZIP_PATH_COMPONENTS} segments de chemin."
                ));
            }
            self.count_entry("Le dossier choisi")?;
            let metadata = fs::symlink_metadata(&path).map_err(|error| {
                format!("Impossible de lire une entrée du dossier choisi : {error}")
            })?;
            if metadata.file_type().is_symlink() {
                return Err(
                    "Le dossier choisi contient un lien symbolique non pris en charge.".to_string(),
                );
            }
            if metadata.is_dir() {
                self.read_directory(root, &path, depth + 1)?;
                continue;
            }
            if !metadata.is_file() {
                continue;
            }

            let display_name = relative.to_string_lossy().replace('\\', "/");
            let lower_name = display_name.to_ascii_lowercase();
            let kind = if lower_name.ends_with(".json") {
                Some("json")
            } else if lower_name.ends_with(".csv") {
                Some("csv")
            } else {
                None
            };
            let Some(kind) = kind else {
                continue;
            };
            if metadata.len() > MAX_IMPORT_FILE_BYTES {
                return Err(
                    "Un fichier du dossier choisi dépasse la limite sûre de 16 Mio.".to_string(),
                );
            }
            let bytes = read_file_with_limit(&path, MAX_IMPORT_FILE_BYTES)?;
            self.count_decompressed_bytes(bytes.len(), "Le dossier choisi")?;
            let contents = String::from_utf8(bytes)
                .map_err(|_| format!("Le fichier « {display_name} » doit être encodé en UTF-8."))?;
            self.push_candidate(display_name, kind, contents);
        }

        Ok(())
    }

    fn push_candidate(&mut self, name: String, kind: &'static str, contents: String) {
        let id = format!("candidate-{}", self.next_candidate_id);
        self.next_candidate_id += 1;
        self.candidates.push(ImportContainerCandidate {
            id,
            name,
            kind,
            contents,
        });
    }

    fn count_entry(&mut self, container_label: &str) -> Result<(), String> {
        self.entry_count += 1;
        if self.entry_count > MAX_ZIP_CONTAINER_ENTRIES {
            return Err(format!(
                "{container_label} contient plus de {MAX_ZIP_CONTAINER_ENTRIES} entrées."
            ));
        }
        Ok(())
    }

    fn count_decompressed_bytes(
        &mut self,
        byte_count: usize,
        container_label: &str,
    ) -> Result<(), String> {
        self.decompressed_bytes += byte_count as u128;
        if self.decompressed_bytes > MAX_ZIP_UNCOMPRESSED_BYTES {
            return Err(format!(
                "{container_label} dépasse la limite de contenu cumulé de 32 Mio."
            ));
        }
        Ok(())
    }

    fn into_picked(self, name: String) -> Result<PickedAnyImportFile, String> {
        if self.candidates.is_empty() {
            return Err(
                "Le conteneur choisi ne contient aucun fichier JSON ou CSV à importer.".to_string(),
            );
        }
        Ok(PickedAnyImportFile {
            name,
            kind: "container".to_string(),
            contents: None,
            csv_candidates: Vec::new(),
            markdown_pages: self.markdown_pages,
            container_candidates: self.candidates,
        })
    }
}

fn inspect_zip_container(name: &str, contents: &[u8]) -> Result<PickedAnyImportFile, String> {
    if contents.len() as u64 > MAX_IMPORT_FILE_BYTES {
        return Err("L’archive ZIP dépasse la limite sûre de 16 Mio.".to_string());
    }
    let mut extraction = ContainerExtraction::default();
    extraction.read_zip_archive(contents, 0, "")?;
    extraction.into_picked(name.to_string())
}

fn inspect_directory_container(path: &Path) -> Result<PickedAnyImportFile, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Impossible de lire le dossier choisi : {error}"))?;
    if metadata.file_type().is_symlink() {
        return Err("Le dossier choisi ne peut pas être un lien symbolique.".to_string());
    }
    if !metadata.is_dir() {
        return Err("Le chemin choisi n’est pas un dossier.".to_string());
    }
    let mut extraction = ContainerExtraction::default();
    extraction.read_directory(path, path, 0)?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("dossier-import")
        .to_string();
    extraction.into_picked(name)
}

fn zip_entry_error(error: zip::result::ZipError) -> String {
    let message = error.to_string();
    if message.to_ascii_lowercase().contains("password required")
        || message.to_ascii_lowercase().contains("encrypt")
    {
        "Les archives ZIP chiffrées ne sont pas prises en charge.".to_string()
    } else {
        format!("Une entrée de l’archive ZIP est illisible : {message}")
    }
}

fn checked_zip_path(raw_name: &str) -> Result<PathBuf, String> {
    let raw_path = Path::new(raw_name);
    let has_windows_volume_prefix = raw_name
        .as_bytes()
        .get(..2)
        .is_some_and(|prefix| prefix[0].is_ascii_alphabetic() && prefix[1] == b':');
    if raw_name.contains('\\')
        || has_windows_volume_prefix
        || raw_path.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return Err("L’archive ZIP contient un chemin de fichier non sûr.".to_string());
    }
    let safe_path = raw_path.to_path_buf();
    if safe_path.components().count() > MAX_ZIP_PATH_COMPONENTS {
        return Err(format!(
            "L’archive ZIP dépasse la limite de {MAX_ZIP_PATH_COMPONENTS} segments de chemin."
        ));
    }
    Ok(safe_path)
}

fn read_zip_entry(file: &mut zip::read::ZipFile<'_>) -> Result<Vec<u8>, String> {
    let mut contents = Vec::new();
    let bytes_read = file
        .take(MAX_ZIP_ENTRY_BYTES + 1)
        .read_to_end(&mut contents)
        .map_err(|error| format!("Impossible de lire une entrée de l’archive ZIP : {error}"))?;
    if bytes_read as u64 > MAX_ZIP_ENTRY_BYTES {
        return Err("Une entrée de l’archive ZIP dépasse la limite sûre de 4 Mio.".to_string());
    }
    Ok(contents)
}

#[tauri::command]
pub async fn save_export_json(
    app: AppHandle,
    suggested_name: String,
    contents: String,
    language: Option<String>,
) -> Result<Option<String>, String> {
    let labels = native_dialog_labels(language.as_deref());
    save_export_file(
        &app,
        &suggested_name,
        &contents,
        labels.json_filter,
        labels.export_title,
        &["json"],
        "sylloge-films.json",
    )
}

#[tauri::command]
pub async fn save_export_csv(
    app: AppHandle,
    suggested_name: String,
    contents: String,
    language: Option<String>,
) -> Result<Option<String>, String> {
    let labels = native_dialog_labels(language.as_deref());
    save_export_file(
        &app,
        &suggested_name,
        &contents,
        labels.csv_filter,
        labels.export_title,
        &["csv"],
        "sylloge-films.csv",
    )
}

fn save_export_file(
    app: &AppHandle,
    suggested_name: &str,
    contents: &str,
    filter_name: &str,
    title: &str,
    extensions: &[&str],
    fallback_name: &str,
) -> Result<Option<String>, String> {
    let safe_name = safe_export_file_name(suggested_name, fallback_name);
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter(filter_name, extensions)
        .set_file_name(&safe_name)
        .set_title(title)
        .blocking_save_file()
    else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|error| format!("Chemin de fichier illisible : {error}"))?;
    write_export_file(&path, contents, fallback_name).map(Some)
}

fn safe_export_file_name(suggested_name: &str, fallback_name: &str) -> String {
    Path::new(suggested_name)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(fallback_name)
        .to_string()
}

fn write_export_file(path: &Path, contents: &str, fallback_name: &str) -> Result<String, String> {
    // Écrire à côté puis renommer : un échec ne doit pas tronquer un export
    // existant, ni modifier une autre cible via un lien symbolique ou physique.
    let directory = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let nonce = SNAPSHOT_NONCE.fetch_add(1, Ordering::Relaxed);
    let temporary = directory.join(format!(
        ".sylloge-export-{}-{nonce}.tmp",
        std::process::id()
    ));
    let mut created = false;
    let result = (|| -> Result<(), std::io::Error> {
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary)?;
        created = true;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, path)
    })();
    if let Err(error) = result {
        if created {
            let _ = fs::remove_file(&temporary);
        }
        return Err(format!("Impossible d’écrire l’export choisi : {error}"));
    }
    Ok(path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(fallback_name)
        .to_string())
}

#[tauri::command]
pub async fn get_backup_settings(
    db_instances: State<'_, DbInstances>,
    profile_id: String,
) -> Result<Option<BackupSettings>, String> {
    let pool = sqlite_pool(&db_instances).await?;
    ensure_profile_exists(&pool, &profile_id).await?;
    read_backup_settings(&pool, &profile_id).await
}

#[tauri::command]
pub async fn pick_backup_destination(
    app: AppHandle,
    language: Option<String>,
) -> Result<Option<BackupSettings>, String> {
    let labels = native_dialog_labels(language.as_deref());
    let selected_path = app
        .dialog()
        .file()
        .set_title(labels.backup_destination_title)
        .blocking_pick_folder()
        .map(|folder_path| {
            folder_path
                .into_path()
                .map_err(|error| format!("Chemin de dossier illisible : {error}"))
        })
        .transpose()?;

    inspect_backup_destination(selected_path.as_deref())
}

// Une présélection vérifiée, sans accès à SQLite ni création de profil.
fn inspect_backup_destination(
    selected_path: Option<&Path>,
) -> Result<Option<BackupSettings>, String> {
    let Some(selected_path) = selected_path else {
        return Ok(None);
    };
    let directory = validate_backup_directory_writable(selected_path)?;
    Ok(Some(BackupSettings {
        backup_directory: directory.to_string_lossy().into_owned(),
        last_automatic_snapshot_day: None,
        directory_available: true,
    }))
}

#[tauri::command]
pub async fn configure_backup_destination(
    db_instances: State<'_, DbInstances>,
    backup_snapshot_lock: State<'_, BackupSnapshotLock>,
    profile_id: String,
    backup_directory: String,
) -> Result<BackupSettings, String> {
    configure_backup_destination_with_state(
        &db_instances,
        &backup_snapshot_lock,
        &profile_id,
        &backup_directory,
    )
    .await
}

async fn configure_backup_destination_with_state(
    db_instances: &DbInstances,
    backup_snapshot_lock: &BackupSnapshotLock,
    profile_id: &str,
    backup_directory: &str,
) -> Result<BackupSettings, String> {
    let _lock = backup_snapshot_lock.0.lock().await;
    let pool = sqlite_pool(db_instances).await?;
    // La destination peut avoir changé depuis sa présélection : sonder à nouveau.
    configure_backup_directory(&pool, profile_id, Path::new(backup_directory)).await
}

#[tauri::command]
pub async fn pick_backup_directory(
    app: AppHandle,
    db_instances: State<'_, DbInstances>,
    backup_snapshot_lock: State<'_, BackupSnapshotLock>,
    profile_id: String,
    language: Option<String>,
) -> Result<Option<BackupSettings>, String> {
    let labels = native_dialog_labels(language.as_deref());
    let Some(folder_path) = app
        .dialog()
        .file()
        .set_title(labels.backup_directory_title)
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let selected_path = folder_path
        .into_path()
        .map_err(|error| format!("Chemin de dossier illisible : {error}"))?;
    let _lock = backup_snapshot_lock.0.lock().await;
    let pool = sqlite_pool(&db_instances).await?;

    configure_backup_directory(&pool, &profile_id, &selected_path)
        .await
        .map(Some)
}

#[tauri::command]
pub async fn clear_backup_settings(
    db_instances: State<'_, DbInstances>,
    backup_snapshot_lock: State<'_, BackupSnapshotLock>,
    profile_id: String,
) -> Result<(), String> {
    let _lock = backup_snapshot_lock.0.lock().await;
    let pool = sqlite_pool(&db_instances).await?;
    clear_backup_configuration(&pool, &profile_id).await
}

#[tauri::command]
pub async fn save_manual_backup_snapshot(
    db_instances: State<'_, DbInstances>,
    backup_snapshot_lock: State<'_, BackupSnapshotLock>,
    profile_id: String,
    contents: String,
) -> Result<BackupSnapshotResult, String> {
    let _lock = backup_snapshot_lock.0.lock().await;
    let pool = sqlite_pool(&db_instances).await?;
    ensure_profile_exists(&pool, &profile_id).await?;
    let settings = read_backup_settings(&pool, &profile_id)
        .await?
        .ok_or_else(|| "Aucun dossier de sauvegarde n’est configuré pour ce profil.".to_string())?;

    write_snapshot_for_settings(&pool, &settings, &profile_id, &contents).await
}

#[tauri::command]
pub async fn save_automatic_backup_snapshot(
    db_instances: State<'_, DbInstances>,
    backup_snapshot_lock: State<'_, BackupSnapshotLock>,
    profile_id: String,
    contents: String,
    automatic_day: String,
) -> Result<AutomaticBackupSnapshotResult, String> {
    let _lock = backup_snapshot_lock.0.lock().await;
    let pool = sqlite_pool(&db_instances).await?;
    let outcome = save_automatic_snapshot(&pool, &profile_id, &contents, &automatic_day).await?;

    Ok(match outcome {
        AutomaticSnapshotOutcome::Saved(snapshot) => AutomaticBackupSnapshotResult {
            outcome: "saved",
            file_name: Some(snapshot.file_name),
        },
        AutomaticSnapshotOutcome::AlreadySaved => AutomaticBackupSnapshotResult {
            outcome: "alreadySaved",
            file_name: None,
        },
        AutomaticSnapshotOutcome::NotConfigured => AutomaticBackupSnapshotResult {
            outcome: "notConfigured",
            file_name: None,
        },
    })
}

/// Copies enregistrées du profil, de la plus récente à la plus ancienne.
/// `available` : fichier ordinaire (jamais un lien) présent dans le dossier
/// configuré. Ne modifie ni le registre ni les fichiers.
#[tauri::command]
pub async fn list_backup_snapshots(
    db_instances: State<'_, DbInstances>,
    backup_snapshot_lock: State<'_, BackupSnapshotLock>,
    profile_id: String,
) -> Result<Vec<BackupSnapshotEntry>, String> {
    let _lock = backup_snapshot_lock.0.lock().await;
    let pool = sqlite_pool(&db_instances).await?;
    list_registered_backup_snapshots(&pool, &profile_id).await
}

/// Contenu d’une copie enregistrée et possédée par le profil, lue sans
/// écriture dans le dossier configuré.
#[tauri::command]
pub async fn read_backup_snapshot(
    db_instances: State<'_, DbInstances>,
    backup_snapshot_lock: State<'_, BackupSnapshotLock>,
    profile_id: String,
    file_name: String,
) -> Result<String, String> {
    let _lock = backup_snapshot_lock.0.lock().await;
    let pool = sqlite_pool(&db_instances).await?;
    read_registered_backup_snapshot(&pool, &profile_id, &file_name).await
}

async fn list_registered_backup_snapshots(
    pool: &sqlx::SqlitePool,
    profile_id: &str,
) -> Result<Vec<BackupSnapshotEntry>, String> {
    ensure_profile_exists(pool, profile_id).await?;
    let Some(settings) = read_backup_settings(pool, profile_id).await? else {
        return Ok(Vec::new());
    };
    let directory = validate_backup_directory(Path::new(&settings.backup_directory)).ok();

    Ok(registered_backup_snapshots(pool, profile_id)
        .await?
        .into_iter()
        .map(|snapshot| BackupSnapshotEntry {
            available: directory
                .as_deref()
                .and_then(|directory| {
                    registered_snapshot_path(directory, profile_id, &snapshot.file_name)
                })
                .is_some_and(|path| regular_file_metadata(&path).is_ok()),
            file_name: snapshot.file_name,
            created_at: snapshot.created_at,
        })
        .collect())
}

async fn read_registered_backup_snapshot(
    pool: &sqlx::SqlitePool,
    profile_id: &str,
    file_name: &str,
) -> Result<String, String> {
    ensure_profile_exists(pool, profile_id).await?;
    let settings = read_backup_settings(pool, profile_id)
        .await?
        .ok_or_else(|| "Aucun dossier de sauvegarde n’est configuré pour ce profil.".to_string())?;
    let registered: i64 = sqlx::query_scalar(
        "SELECT EXISTS(
           SELECT 1 FROM backup_snapshots WHERE profile_id = $1 AND file_name = $2
         )",
    )
    .bind(profile_id)
    .bind(file_name)
    .fetch_one(pool)
    .await
    .map_err(|error| format!("Impossible de lire le registre des snapshots : {error}"))?;
    if registered != 1 {
        return Err("Cette copie n’est pas enregistrée pour ce profil.".to_string());
    }
    let directory = validate_backup_directory(Path::new(&settings.backup_directory))?;
    let path = registered_snapshot_path(&directory, profile_id, file_name)
        .ok_or_else(|| "Le nom de cette copie ne correspond pas à ce profil.".to_string())?;

    read_regular_utf8_file(&path, MAX_SNAPSHOT_FILE_BYTES)
        .map_err(|error| format!("La copie « {file_name} » ne peut pas être lue : {error}"))
}

/// Lecture bornée d’un fichier ordinaire, sans suivre de lien symbolique : le
/// chemin est contrôlé avant et après la lecture et doit rester le même fichier.
fn read_regular_utf8_file(path: &Path, maximum_bytes: u64) -> Result<String, String> {
    let before = regular_file_metadata(path)?;
    let contents = read_utf8_file_with_limit(path, maximum_bytes)?;
    let after = regular_file_metadata(path)?;
    if !is_same_file(&before, &after) {
        return Err("le fichier a été remplacé pendant sa lecture.".to_string());
    }
    Ok(contents)
}

fn regular_file_metadata(path: &Path) -> Result<fs::Metadata, String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "le fichier est introuvable.".to_string()
        } else {
            format!("le fichier est illisible : {error}")
        }
    })?;
    if metadata.file_type().is_symlink() {
        return Err("le chemin est un lien symbolique, qui n’est jamais suivi.".to_string());
    }
    if !metadata.is_file() {
        return Err("le chemin ne désigne pas un fichier ordinaire.".to_string());
    }
    Ok(metadata)
}

#[cfg(unix)]
fn is_same_file(before: &fs::Metadata, after: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    before.dev() == after.dev() && before.ino() == after.ino()
}

#[cfg(not(unix))]
fn is_same_file(_before: &fs::Metadata, _after: &fs::Metadata) -> bool {
    true
}

/// Recherche bornée de copies Sylloge dans les dossiers usuels du Mac, sans
/// profil, sans écriture et sans suivre de lien.
#[tauri::command]
pub async fn find_backup_candidates() -> Result<FoundBackups, String> {
    let home = std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(PathBuf::from)
        .ok_or_else(|| {
            "Le dossier personnel est introuvable : aucune recherche n’a été lancée.".to_string()
        })?;
    tauri::async_runtime::spawn_blocking(move || find_backup_candidates_in(&home))
        .await
        .map_err(|error| format!("La recherche de sauvegardes a été interrompue : {error}"))
}

fn find_backup_candidates_in(home: &Path) -> FoundBackups {
    find_backup_candidates_with_limits(home, &BACKUP_SEARCH_LIMITS)
}

struct BackupSearchFile {
    path: PathBuf,
    file_name: String,
    location: String,
    modified_at: i64,
    size: u64,
}

fn find_backup_candidates_with_limits(home: &Path, limits: &BackupSearchLimits) -> FoundBackups {
    let mut unreadable_locations = Vec::new();
    let mut pending = backup_search_roots(home, &mut unreadable_locations)
        .into_iter()
        .map(|(location, path)| (path, location, 0))
        .collect::<VecDeque<_>>();
    let mut visited_directories = 0;
    let mut files = Vec::new();

    // En largeur, toutes racines confondues : le plafond de dossiers coupe les
    // niveaux profonds avant de priver une racine de sa visite.
    while let Some((directory, location, depth)) = pending.pop_front() {
        if visited_directories == limits.max_directories {
            break;
        }
        visited_directories += 1;
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) => {
                // Seule une racine illisible est signalée ; un sous-dossier
                // illisible est simplement sauté.
                if depth == 0 && error.kind() != std::io::ErrorKind::NotFound {
                    push_unique(&mut unreadable_locations, location);
                }
                continue;
            }
        };
        let mut entries = entries.filter_map(Result::ok).collect::<Vec<_>>();
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            // Le type d’une entrée ne suit pas les liens symboliques.
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if name.starts_with('.') || file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                // Un point dans le nom écarte aussi les paquets (.app, .photoslibrary…).
                if depth < limits.max_depth && !name.contains('.') {
                    pending.push_back((entry.path(), format!("{location} › {name}"), depth + 1));
                }
                continue;
            }
            if !file_type.is_file() || !is_backup_candidate_name(&name) {
                continue;
            }
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if !metadata.is_file() || metadata.len() > limits.max_file_bytes {
                continue;
            }
            files.push(BackupSearchFile {
                path: entry.path(),
                modified_at: metadata.modified().map(epoch_milliseconds).unwrap_or(0),
                size: metadata.len(),
                file_name: name,
                location: location.clone(),
            });
        }
    }

    files.sort_by(|left, right| {
        right
            .modified_at
            .cmp(&left.modified_at)
            .then_with(|| left.location.cmp(&right.location))
            .then_with(|| left.file_name.cmp(&right.file_name))
    });
    let mut total_bytes = 0_u64;
    let mut candidates = Vec::new();
    for file in files.into_iter().take(limits.max_candidates) {
        if total_bytes.saturating_add(file.size) > limits.max_total_bytes {
            continue;
        }
        // Illisible, non UTF-8 ou remplacé entre-temps : la copie est sautée.
        let Ok(contents) = read_regular_utf8_file(&file.path, limits.max_file_bytes) else {
            continue;
        };
        let length = contents.len() as u64;
        if total_bytes.saturating_add(length) > limits.max_total_bytes {
            continue;
        }
        total_bytes += length;
        candidates.push(FoundBackup {
            file_name: file.file_name,
            location: file.location,
            modified_at: file.modified_at,
            contents,
        });
    }

    FoundBackups {
        candidates,
        unreadable_locations,
    }
}

/// Racines de recherche et leur libellé. Une racine absente, qui n’est pas un
/// dossier ou qui est un lien symbolique est ignorée sans message.
fn backup_search_roots(
    home: &Path,
    unreadable_locations: &mut Vec<String>,
) -> Vec<(String, PathBuf)> {
    let mut roots = vec![(
        "iCloud Drive".to_string(),
        home.join("Library/Mobile Documents/com~apple~CloudDocs"),
    )];
    let cloud_storage = home.join("Library/CloudStorage");
    if is_real_directory(&cloud_storage) {
        match fs::read_dir(&cloud_storage) {
            Ok(entries) => {
                let mut providers = entries
                    .filter_map(Result::ok)
                    .filter_map(|entry| entry.file_name().into_string().ok())
                    .filter(|name| !name.starts_with('.'))
                    .collect::<Vec<_>>();
                providers.sort();
                roots.extend(
                    providers
                        .into_iter()
                        .map(|name| (cloud_storage_label(&name), cloud_storage.join(name))),
                );
            }
            Err(_) => push_unique(unreadable_locations, "Stockage en ligne".to_string()),
        }
    }
    roots.push(("Documents".to_string(), home.join("Documents")));
    roots.push(("Bureau".to_string(), home.join("Desktop")));
    roots.push(("Téléchargements".to_string(), home.join("Downloads")));
    roots.retain(|(_, path)| is_real_directory(path));
    roots
}

fn cloud_storage_label(folder_name: &str) -> String {
    if folder_name.starts_with("GoogleDrive-") {
        "Google Drive".to_string()
    } else if folder_name.starts_with("Dropbox") {
        "Dropbox".to_string()
    } else if folder_name.starts_with("OneDrive") {
        "OneDrive".to_string()
    } else {
        folder_name.to_string()
    }
}

fn is_real_directory(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|metadata| metadata.is_dir())
}

fn is_backup_candidate_name(file_name: &str) -> bool {
    let lower = file_name.to_ascii_lowercase();
    lower.starts_with("sylloge-") && lower.ends_with(".json")
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.contains(&value) {
        values.push(value);
    }
}

fn epoch_milliseconds(time: SystemTime) -> i64 {
    match time.duration_since(UNIX_EPOCH) {
        Ok(elapsed) => i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX),
        Err(error) => {
            i64::try_from(error.duration().as_millis()).map_or(i64::MIN, |millis| -millis)
        }
    }
}

#[tauri::command]
pub async fn import_library_atomically(
    db_instances: State<'_, DbInstances>,
    payload: ImportLibraryPayload,
) -> Result<ImportLibraryResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    write_import(&pool, &payload).await?;

    Ok(ImportLibraryResult {
        profile_id: payload.profile.id,
        film_count: payload.films.len(),
    })
}

#[tauri::command]
pub async fn import_library_document_atomically(
    db_instances: State<'_, DbInstances>,
    payload: ImportLibraryDocumentPayload,
) -> Result<ImportLibraryDocumentResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    write_library_document_import(&pool, &payload, true).await?;

    Ok(library_document_result(&payload))
}

#[tauri::command]
pub async fn import_library_document_into_empty_profile(
    db_instances: State<'_, DbInstances>,
    payload: ImportLibraryDocumentPayload,
) -> Result<ImportLibraryDocumentResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    write_library_document_import(&pool, &payload, false).await?;

    Ok(library_document_result(&payload))
}

pub async fn sqlite_pool(db_instances: &DbInstances) -> Result<sqlx::SqlitePool, String> {
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

async fn ensure_profile_exists(pool: &sqlx::SqlitePool, profile_id: &str) -> Result<(), String> {
    if profile_id.trim().is_empty() {
        return Err("Le profil de sauvegarde est invalide.".to_string());
    }

    let exists: i64 = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM profiles WHERE id = $1)")
        .bind(profile_id)
        .fetch_one(pool)
        .await
        .map_err(|error| format!("Impossible de vérifier le profil de sauvegarde : {error}"))?;

    if exists == 1 {
        Ok(())
    } else {
        Err("Le profil de sauvegarde est introuvable.".to_string())
    }
}

async fn read_backup_settings(
    pool: &sqlx::SqlitePool,
    profile_id: &str,
) -> Result<Option<BackupSettings>, String> {
    let row: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT backup_directory, last_automatic_snapshot_day
         FROM backup_settings
         WHERE profile_id = $1",
    )
    .bind(profile_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Impossible de lire le réglage de sauvegarde : {error}"))?;

    Ok(row.map(
        |(backup_directory, last_automatic_snapshot_day)| BackupSettings {
            directory_available: validate_backup_directory(Path::new(&backup_directory)).is_ok(),
            backup_directory,
            last_automatic_snapshot_day,
        },
    ))
}

async fn clear_backup_configuration(
    pool: &sqlx::SqlitePool,
    profile_id: &str,
) -> Result<(), String> {
    ensure_profile_exists(pool, profile_id).await?;
    let mut transaction = pool.begin().await.map_err(|error| {
        format!("Impossible de démarrer la désactivation des snapshots : {error}")
    })?;

    sqlx::query("DELETE FROM backup_snapshots WHERE profile_id = $1")
        .bind(profile_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible d’oublier le registre des snapshots : {error}"))?;
    sqlx::query("DELETE FROM backup_settings WHERE profile_id = $1")
        .bind(profile_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de désactiver les snapshots : {error}"))?;

    transaction.commit().await.map_err(|error| {
        format!("Impossible de confirmer la désactivation des snapshots : {error}")
    })
}

async fn upsert_backup_directory(
    pool: &sqlx::SqlitePool,
    profile_id: &str,
    backup_directory: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO backup_settings (profile_id, backup_directory, last_automatic_snapshot_day, updated_at)
         VALUES ($1, $2, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(profile_id) DO UPDATE SET
           backup_directory = excluded.backup_directory,
           last_automatic_snapshot_day = NULL,
           updated_at = excluded.updated_at",
    )
    .bind(profile_id)
    .bind(backup_directory)
    .execute(pool)
    .await
    .map_err(|error| format!("Impossible d’enregistrer le dossier de sauvegarde : {error}"))?;

    Ok(())
}

async fn configure_backup_directory(
    pool: &sqlx::SqlitePool,
    profile_id: &str,
    selected_path: &Path,
) -> Result<BackupSettings, String> {
    ensure_profile_exists(pool, profile_id).await?;
    let directory = validate_backup_directory_writable(selected_path)?;
    let directory = directory.to_string_lossy().into_owned();

    upsert_backup_directory(pool, profile_id, &directory).await?;
    read_backup_settings(pool, profile_id)
        .await?
        .ok_or_else(|| "Le dossier de sauvegarde n’a pas pu être enregistré.".to_string())
}

enum AutomaticSnapshotOutcome {
    Saved(BackupSnapshotResult),
    AlreadySaved,
    NotConfigured,
}

async fn save_automatic_snapshot(
    pool: &sqlx::SqlitePool,
    profile_id: &str,
    contents: &str,
    automatic_day: &str,
) -> Result<AutomaticSnapshotOutcome, String> {
    ensure_profile_exists(pool, profile_id).await?;
    validate_calendar_day(automatic_day)?;

    let Some(settings) = read_backup_settings(pool, profile_id).await? else {
        return Ok(AutomaticSnapshotOutcome::NotConfigured);
    };
    if settings.last_automatic_snapshot_day.as_deref() == Some(automatic_day) {
        return Ok(AutomaticSnapshotOutcome::AlreadySaved);
    }

    let snapshot = write_snapshot_for_settings(pool, &settings, profile_id, contents).await?;
    let update = sqlx::query(
        "UPDATE backup_settings
         SET last_automatic_snapshot_day = $1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE profile_id = $2",
    )
    .bind(automatic_day)
    .bind(profile_id)
    .execute(pool)
    .await
    .map_err(|error| {
        format!("Impossible d’enregistrer la date de sauvegarde automatique : {error}")
    })?;

    if update.rows_affected() != 1 {
        return Err("Le réglage de sauvegarde a disparu avant sa mise à jour.".to_string());
    }

    Ok(AutomaticSnapshotOutcome::Saved(snapshot))
}

fn validate_backup_directory(path: &Path) -> Result<PathBuf, String> {
    if path.as_os_str().is_empty() {
        return Err("Le dossier de sauvegarde est vide.".to_string());
    }

    let canonical = fs::canonicalize(path)
        .map_err(|error| format!("Le dossier de sauvegarde est inaccessible : {error}"))?;
    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("Le dossier de sauvegarde est illisible : {error}"))?;
    if !metadata.is_dir() {
        return Err("Le chemin choisi n’est pas un dossier de sauvegarde.".to_string());
    }
    fs::read_dir(&canonical)
        .map_err(|error| format!("Le dossier de sauvegarde ne peut pas être lu : {error}"))?;

    Ok(canonical)
}

fn validate_backup_directory_writable(path: &Path) -> Result<PathBuf, String> {
    let directory = validate_backup_directory(path)?;
    probe_backup_directory_writable(&directory)?;
    Ok(directory)
}

fn probe_backup_directory_writable(directory: &Path) -> Result<(), String> {
    let sequence = snapshot_sequence()?;
    let nonce = SNAPSHOT_NONCE.fetch_add(1, Ordering::Relaxed);
    let probe_path = directory.join(format!(
        ".sylloge-backup-write-probe-{sequence:020}-{nonce:020}.tmp"
    ));
    let mut probe = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&probe_path)
        .map_err(|error| format!("Le dossier de sauvegarde n’est pas inscriptible : {error}"))?;
    let write_result = probe.write_all(b"sylloge").and_then(|_| probe.sync_all());
    drop(probe);
    let cleanup_result = fs::remove_file(&probe_path);

    if let Err(error) = write_result {
        return Err(format!(
            "Le dossier de sauvegarde n’est pas inscriptible : {error}"
        ));
    }
    cleanup_result.map_err(|error| {
        format!("La sonde du dossier de sauvegarde n’a pas pu être nettoyée : {error}")
    })
}

async fn write_snapshot_for_settings(
    pool: &sqlx::SqlitePool,
    settings: &BackupSettings,
    profile_id: &str,
    contents: &str,
) -> Result<BackupSnapshotResult, String> {
    if contents.trim().is_empty() {
        return Err("Le document JSON de sauvegarde est vide.".to_string());
    }
    // Admission avant écriture, enregistrement et conservation : une copie
    // qu’on ne saurait pas relire ne doit jamais remplacer une copie lisible.
    if contents.len() as u64 > MAX_SNAPSHOT_FILE_BYTES {
        return Err(format!(
            "Le document de sauvegarde dépasse la limite sûre de {} Mio : aucune copie n’a été écrite, les copies existantes sont intactes.",
            MAX_SNAPSHOT_FILE_BYTES / (1024 * 1024)
        ));
    }

    let directory = validate_backup_directory(Path::new(&settings.backup_directory))?;
    let sequence = snapshot_sequence()?;
    let file_name = snapshot_file_name(profile_id, sequence);
    write_snapshot_atomically(&directory, &file_name, contents)?;
    register_backup_snapshot(pool, profile_id, &file_name).await?;
    let retained_snapshot_count = apply_snapshot_retention(pool, &directory, profile_id).await?;

    Ok(BackupSnapshotResult {
        file_name,
        retained_snapshot_count,
    })
}

fn snapshot_sequence() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .map_err(|error| format!("Horloge système indisponible pour la sauvegarde : {error}"))
}

fn snapshot_profile_token(profile_id: &str) -> String {
    let mut token = String::new();
    for byte in profile_id.as_bytes() {
        if byte.is_ascii_alphanumeric() || *byte == b'-' {
            token.push(char::from(*byte));
        } else {
            use std::fmt::Write as _;
            write!(&mut token, "{byte:02x}").expect("écriture dans une chaîne");
        }
    }
    token
}

/// Nom explicite d’une nouvelle copie, à la minute UTC de l’écriture
/// (`sequence` : nanosecondes depuis l’époque Unix) :
/// `sylloge-sauvegarde-AAAA-MM-JJ-HHhMM-<profil>-<nonce>.json`. Le nonce de 20
/// chiffres juxtapose les nanosecondes écoulées dans cette minute (11 chiffres)
/// et un compteur du processus (9 chiffres) : deux écritures de la même minute,
/// même après un relancement ou un recul d’horloge, gardent des noms distincts.
fn snapshot_file_name(profile_id: &str, sequence: u128) -> String {
    let counter = SNAPSHOT_NONCE.fetch_add(1, Ordering::Relaxed);
    let nonce = (sequence % SNAPSHOT_NANOS_PER_MINUTE) * SNAPSHOT_COUNTER_MODULUS
        + u128::from(counter) % SNAPSHOT_COUNTER_MODULUS;
    format!(
        "{SNAPSHOT_PREFIX}{}-{}-{nonce:020}.json",
        snapshot_minute_stamp(sequence),
        snapshot_profile_token(profile_id)
    )
}

fn snapshot_minute_stamp(sequence: u128) -> String {
    let seconds = i64::try_from(sequence / 1_000_000_000).unwrap_or(i64::MAX);
    let (year, month, day) = civil_from_days(seconds.div_euclid(86_400));
    let second_of_day = seconds.rem_euclid(86_400);
    format!(
        "{year:04}-{month:02}-{day:02}-{:02}h{:02}",
        second_of_day / 3_600,
        second_of_day % 3_600 / 60
    )
}

fn write_snapshot_atomically(
    directory: &Path,
    file_name: &str,
    contents: &str,
) -> Result<(), String> {
    let target = directory.join(file_name);
    if target.exists() {
        return Err("Un snapshot porte déjà ce nom dans le dossier choisi.".to_string());
    }
    let temporary = directory.join(format!(".{file_name}.tmp"));

    let write_result = (|| -> Result<(), std::io::Error> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temporary, &target)?;
        Ok(())
    })();

    if let Err(error) = write_result {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "Impossible d’écrire le snapshot de sauvegarde : {error}"
        ));
    }

    Ok(())
}

async fn register_backup_snapshot(
    pool: &sqlx::SqlitePool,
    profile_id: &str,
    file_name: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO backup_snapshots (profile_id, file_name)
         VALUES ($1, $2)",
    )
    .bind(profile_id)
    .bind(file_name)
    .execute(pool)
    .await
    .map_err(|error| format!("Impossible d’enregistrer le snapshot de sauvegarde : {error}"))?;

    Ok(())
}

async fn registered_backup_snapshots(
    pool: &sqlx::SqlitePool,
    profile_id: &str,
) -> Result<Vec<RegisteredBackupSnapshot>, String> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT file_name, created_at
         FROM backup_snapshots
         WHERE profile_id = $1
         ORDER BY created_at DESC, file_name DESC",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Impossible de lire le registre des snapshots : {error}"))?;

    Ok(rows
        .into_iter()
        .map(|(file_name, created_at)| RegisteredBackupSnapshot {
            file_name,
            created_at,
        })
        .collect())
}

async fn remove_registered_backup_snapshot(
    pool: &sqlx::SqlitePool,
    profile_id: &str,
    file_name: &str,
) -> Result<(), String> {
    sqlx::query(
        "DELETE FROM backup_snapshots
         WHERE profile_id = $1 AND file_name = $2",
    )
    .bind(profile_id)
    .bind(file_name)
    .execute(pool)
    .await
    .map_err(|error| format!("Impossible de nettoyer le registre des snapshots : {error}"))?;

    Ok(())
}

async fn apply_snapshot_retention(
    pool: &sqlx::SqlitePool,
    directory: &Path,
    profile_id: &str,
) -> Result<usize, String> {
    for snapshot in registered_backup_snapshots(pool, profile_id).await? {
        let Some(path) = registered_snapshot_path(directory, profile_id, &snapshot.file_name)
        else {
            remove_registered_backup_snapshot(pool, profile_id, &snapshot.file_name).await?;
            continue;
        };

        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_file() => {}
            Ok(_) => {
                remove_registered_backup_snapshot(pool, profile_id, &snapshot.file_name).await?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                remove_registered_backup_snapshot(pool, profile_id, &snapshot.file_name).await?;
            }
            Err(error) => {
                return Err(format!(
                    "Impossible de relire le snapshot enregistré pour la conservation : {error}"
                ));
            }
        }
    }

    let snapshots = registered_backup_snapshots(pool, profile_id).await?;
    let retained = retained_snapshot_names(
        &snapshots
            .iter()
            .map(|snapshot| (snapshot.file_name.clone(), snapshot.created_at.clone()))
            .collect::<Vec<_>>(),
    );
    for snapshot in snapshots
        .iter()
        .filter(|snapshot| !retained.contains(&snapshot.file_name))
    {
        let Some(path) = registered_snapshot_path(directory, profile_id, &snapshot.file_name)
        else {
            remove_registered_backup_snapshot(pool, profile_id, &snapshot.file_name).await?;
            continue;
        };

        match fs::remove_file(&path) {
            Ok(()) => {
                remove_registered_backup_snapshot(pool, profile_id, &snapshot.file_name).await?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                remove_registered_backup_snapshot(pool, profile_id, &snapshot.file_name).await?;
            }
            Err(error) => {
                return Err(format!(
                    "Impossible d’appliquer la conservation des snapshots : {error}"
                ));
            }
        }
    }

    Ok(registered_backup_snapshots(pool, profile_id).await?.len())
}

/// Conservation par paliers d’un profil : les trois copies les plus récentes,
/// puis, de la plus récente à la plus ancienne, une copie par semaine (lundi →
/// dimanche, date UTC) qu’aucune copie gardée ne représente encore, au plus
/// quatre, puis de même une par mois civil, au plus six : 13 copies datées au
/// maximum. Une date de création illisible garde toujours sa copie, hors
/// paliers : on ne supprime jamais sur une date incomprise, et une telle copie
/// n’évince aucune copie datée.
fn retained_snapshot_names(snapshots: &[(String, String)]) -> HashSet<String> {
    let mut selection = TierSelection::default();
    let mut dated = Vec::new();
    for (file_name, created_at) in snapshots {
        match snapshot_creation_day(created_at) {
            Some(day) => dated.push((file_name, created_at, day)),
            None => {
                selection.retained.insert(file_name.clone());
            }
        }
    }
    // Même ordre que le registre : created_at DESC, puis file_name DESC.
    dated.sort_by(|left, right| right.1.cmp(left.1).then_with(|| right.0.cmp(left.0)));

    let (recent, older) = dated.split_at(dated.len().min(RECENT_BACKUP_COPIES));
    for (file_name, _, day) in recent {
        selection.keep(file_name, *day);
    }
    let mut weekly_archives = 0;
    let mut not_kept_weekly = Vec::new();
    for entry in older {
        let (file_name, _, day) = entry;
        if weekly_archives < WEEKLY_BACKUP_ARCHIVES && !selection.weeks.contains(&day.week) {
            selection.keep(file_name, *day);
            weekly_archives += 1;
        } else {
            not_kept_weekly.push(entry);
        }
    }
    let mut monthly_archives = 0;
    for (file_name, _, day) in not_kept_weekly {
        if monthly_archives == MONTHLY_BACKUP_ARCHIVES {
            break;
        }
        if !selection.months.contains(&day.month) {
            selection.keep(file_name, *day);
            monthly_archives += 1;
        }
    }

    selection.retained
}

#[derive(Default)]
struct TierSelection {
    retained: HashSet<String>,
    weeks: HashSet<i64>,
    months: HashSet<(i64, u32)>,
}

impl TierSelection {
    fn keep(&mut self, file_name: &str, day: SnapshotDay) {
        self.retained.insert(file_name.to_string());
        self.weeks.insert(day.week);
        self.months.insert(day.month);
    }
}

#[derive(Clone, Copy)]
struct SnapshotDay {
    /// Lundi de la semaine, en jours depuis le 1970-01-01.
    week: i64,
    month: (i64, u32),
}

/// Lit une date du registre au seul format qu’il écrit,
/// `AAAA-MM-JJTHH:MM:SS.fffZ` (UTC). Toute autre forme, ou une date
/// impossible, est illisible : `None`.
fn snapshot_creation_day(created_at: &str) -> Option<SnapshotDay> {
    let bytes = created_at.as_bytes();
    let separators = [
        (4, b'-'),
        (7, b'-'),
        (10, b'T'),
        (13, b':'),
        (16, b':'),
        (19, b'.'),
        (23, b'Z'),
    ];
    if !has_separators(bytes, 24, &separators) {
        return None;
    }
    let field = |range: std::ops::Range<usize>| ascii_number(&bytes[range]);
    let (year, month, day) = (field(0..4)?, field(5..7)?, field(8..10)?);
    let (hour, minute, second) = (field(11..13)?, field(14..16)?, field(17..19)?);
    field(20..23)?;
    if hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    let day_number = civil_day_number(i64::from(year), month, day)?;
    Some(SnapshotDay {
        // Le 1970-01-01 est un jeudi : (jour + 3) mod 7 compte depuis lundi.
        week: day_number - (day_number + 3).rem_euclid(7),
        month: (i64::from(year), month),
    })
}

/// Jours depuis le 1970-01-01 d’une date civile valide.
fn civil_day_number(year: i64, month: u32, day: u32) -> Option<i64> {
    if !(1..=12).contains(&month) || day == 0 || day > days_in_month(year, month) {
        return None;
    }
    Some(days_from_civil(year, month, day))
}

fn days_in_month(year: i64, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) => 29,
        _ => 28,
    }
}

/// Calendrier grégorien proleptique sans dépendance (algorithme
/// `days_from_civil` de Howard Hinnant).
fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year.rem_euclid(400);
    let month = i64::from(month);
    let shifted_month = if month > 2 { month - 3 } else { month + 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + i64::from(day) - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// Inverse de `days_from_civil` : (année, mois, jour) d’un nombre de jours
/// depuis le 1970-01-01.
pub(crate) fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let days = days + 719_468;
    let era = days.div_euclid(146_097);
    let day_of_era = days.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
    let month = if shifted_month < 10 {
        shifted_month + 3
    } else {
        shifted_month - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    // Bornés par construction : mois 1..=12, jour 1..=31.
    (year, month as u32, day as u32)
}

fn registered_snapshot_path(
    directory: &Path,
    profile_id: &str,
    file_name: &str,
) -> Option<PathBuf> {
    let path = Path::new(file_name);
    let is_single_file_name = path.file_name().and_then(|name| name.to_str()) == Some(file_name);
    (is_single_file_name && is_owned_snapshot_name(file_name, profile_id))
        .then(|| directory.join(file_name))
}

/// Une copie appartient au profil seulement si son nom suit exactement l’un
/// des deux formats que Sylloge écrit pour lui : l’actuel
/// `sylloge-sauvegarde-AAAA-MM-JJ-HHhMM-<profil>-<20 chiffres>.json` ou
/// l’historique `sylloge-films-v1-<profil>-<20 chiffres>-<20 chiffres>.json`.
/// Les longueurs fixes empêchent un profil dont l’identifiant prolonge celui
/// d’un autre de revendiquer ses copies.
fn is_owned_snapshot_name(file_name: &str, profile_id: &str) -> bool {
    let token = snapshot_profile_token(profile_id);
    let Some(name) = file_name.strip_suffix(".json") else {
        return false;
    };
    if let Some(rest) = name.strip_prefix(SNAPSHOT_PREFIX) {
        let (Some(stamp), Some(rest)) = (rest.get(..16), rest.get(16..)) else {
            return false;
        };
        return is_snapshot_minute_stamp(stamp.as_bytes())
            && rest
                .strip_prefix('-')
                .and_then(|rest| rest.strip_prefix(token.as_str()))
                .and_then(|rest| rest.strip_prefix('-'))
                .is_some_and(|nonce| is_digit_run(nonce, 20));
    }
    name.strip_prefix(LEGACY_SNAPSHOT_PREFIX)
        .and_then(|rest| rest.strip_prefix(token.as_str()))
        .and_then(|rest| rest.strip_prefix('-'))
        .and_then(|rest| rest.split_once('-'))
        .is_some_and(|(sequence, nonce)| is_digit_run(sequence, 20) && is_digit_run(nonce, 20))
}

fn is_digit_run(value: &str, length: usize) -> bool {
    value.len() == length && value.bytes().all(|byte| byte.is_ascii_digit())
}

/// `AAAA-MM-JJ-HHhMM` désignant une minute qui existe.
fn is_snapshot_minute_stamp(stamp: &[u8]) -> bool {
    if !has_separators(stamp, 16, &[(4, b'-'), (7, b'-'), (10, b'-'), (13, b'h')]) {
        return false;
    }
    let field = |range: std::ops::Range<usize>| ascii_number(&stamp[range]);
    match (
        field(0..4),
        field(5..7),
        field(8..10),
        field(11..13),
        field(14..16),
    ) {
        (Some(year), Some(month), Some(day), Some(hour), Some(minute)) => {
            hour <= 23 && minute <= 59 && civil_day_number(i64::from(year), month, day).is_some()
        }
        _ => false,
    }
}

fn has_separators(bytes: &[u8], length: usize, separators: &[(usize, u8)]) -> bool {
    bytes.len() == length
        && separators
            .iter()
            .all(|(index, separator)| bytes[*index] == *separator)
}

/// Valeur d’un champ de chiffres ASCII (quatre au plus), `None` sinon.
fn ascii_number(digits: &[u8]) -> Option<u32> {
    digits.iter().try_fold(0_u32, |value, digit| {
        digit
            .is_ascii_digit()
            .then(|| value * 10 + u32::from(digit - b'0'))
    })
}

fn validate_calendar_day(day: &str) -> Result<(), String> {
    let bytes = day.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return Err(
            "Le jour de sauvegarde automatique doit être au format AAAA-MM-JJ.".to_string(),
        );
    }
    let parse = |range: std::ops::Range<usize>| {
        std::str::from_utf8(&bytes[range])
            .ok()
            .and_then(|value| value.parse::<u32>().ok())
    };
    let Some(year) = parse(0..4) else {
        return Err("Le jour de sauvegarde automatique est invalide.".to_string());
    };
    let Some(month) = parse(5..7) else {
        return Err("Le jour de sauvegarde automatique est invalide.".to_string());
    };
    let Some(day_of_month) = parse(8..10) else {
        return Err("Le jour de sauvegarde automatique est invalide.".to_string());
    };
    if year == 0 || month == 0 || month > 12 || day_of_month == 0 {
        return Err("Le jour de sauvegarde automatique est invalide.".to_string());
    }
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) => 29,
        2 => 28,
        _ => unreachable!(),
    };
    if day_of_month > days_in_month {
        return Err("Le jour de sauvegarde automatique est invalide.".to_string());
    }

    Ok(())
}

async fn write_import(
    pool: &sqlx::SqlitePool,
    payload: &ImportLibraryPayload,
) -> Result<(), String> {
    if payload
        .films
        .iter()
        .any(|film| film.profile_id != payload.profile.id)
    {
        return Err("Un film ne cible pas le nouveau profil d’import.".to_string());
    }

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer l’import SQLite : {error}"))?;

    sqlx::query("INSERT INTO profiles (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)")
        .bind(&payload.profile.id)
        .bind(&payload.profile.name)
        .bind(&payload.profile.created_at)
        .bind(&payload.profile.updated_at)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de créer le nouveau profil : {error}"))?;

    for film in &payload.films {
        let original_title = canonical_optional_text(&film.original_title);
        let watched_at = canonical_optional_text(&film.watched_at);
        let personal_note = canonical_optional_text(&film.personal_note);
        let director = canonical_optional_text(&film.director);
        let summary = canonical_optional_text(&film.summary);
        let poster_url = canonical_optional_text(&film.poster_url);
        let (provider_name, provider_id) =
            canonical_provenance(&film.provider_name, &film.provider_id);

        sqlx::query(
            "INSERT INTO films (
                id, profile_id, title, original_title, year, status, is_favorite, rating,
                watched_at, personal_note, director, summary, provider_name, provider_id,
                poster_url, created_at, updated_at
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
             )",
        )
        .bind(&film.id)
        .bind(&film.profile_id)
        .bind(&film.title)
        .bind(original_title)
        .bind(film.year)
        .bind(&film.status)
        .bind(if film.is_favorite { 1 } else { 0 })
        .bind(film.rating)
        .bind(watched_at)
        .bind(personal_note)
        .bind(director)
        .bind(summary)
        .bind(provider_name)
        .bind(provider_id)
        .bind(poster_url)
        .bind(&film.created_at)
        .bind(&film.updated_at)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible d’importer le film « {} » : {error}", film.title))?;
    }

    sqlx::query(
        "UPDATE current_profile
         SET profile_id = $1, updated_at = $2
         WHERE singleton = 1",
    )
    .bind(&payload.profile.id)
    .bind(&payload.profile.updated_at)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Impossible d’activer le nouveau profil : {error}"))?;

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser l’import SQLite : {error}"))?;

    Ok(())
}

/// Catégories de bibliothèque. Une table par bibliothèque : `series.category`
/// ne vaut plus que « série télé » à l'écriture, et `mangas` n'a pas de colonne
/// de catégorie.
const TELEVISION_SERIES_CATEGORY: &str = "série télé";
const ANIMATION_SERIES_CATEGORY: &str = "animation";
const MANGA_BOOK_CATEGORY: &str = "manga";

fn is_animation_category(category: &str) -> bool {
    category
        .trim()
        .eq_ignore_ascii_case(ANIMATION_SERIES_CATEGORY)
}

fn is_manga_category(category: &str) -> bool {
    category.trim().eq_ignore_ascii_case(MANGA_BOOK_CATEGORY)
}

/// Vue normalisée d'une fiche Séries/Animation : les deux sections partagent
/// les mêmes colonnes, seule la table d'accueil diffère.
struct AnimeRecord<'a> {
    id: &'a str,
    profile_id: &'a str,
    title: &'a str,
    showrunner: Option<&'a str>,
    casting: Option<&'a str>,
    summary: Option<&'a str>,
    status: &'a str,
    rating: Option<f64>,
    is_favorite: bool,
    seasons_seen: Option<i64>,
    seasons_total: Option<i64>,
    progress_updated_at: Option<&'a str>,
    started_at: Option<&'a str>,
    poster_url: Option<&'a str>,
    personal_note: Option<&'a str>,
    created_at: &'a str,
    updated_at: &'a str,
}

impl<'a> From<&'a ImportSeries> for AnimeRecord<'a> {
    fn from(series: &'a ImportSeries) -> Self {
        Self {
            id: &series.id,
            profile_id: &series.profile_id,
            title: &series.title,
            showrunner: canonical_optional_text(&series.showrunner),
            casting: canonical_optional_text(&series.casting),
            summary: canonical_optional_text(&series.summary),
            status: &series.status,
            rating: series.rating,
            is_favorite: series.is_favorite,
            seasons_seen: series.seasons_seen,
            seasons_total: series.seasons_total,
            progress_updated_at: canonical_optional_text(&series.progress_updated_at),
            started_at: canonical_optional_text(&series.started_at),
            poster_url: canonical_optional_text(&series.poster_url),
            personal_note: canonical_optional_text(&series.personal_note),
            created_at: &series.created_at,
            updated_at: &series.updated_at,
        }
    }
}

impl<'a> From<&'a ImportAnime> for AnimeRecord<'a> {
    fn from(anime: &'a ImportAnime) -> Self {
        Self {
            id: &anime.id,
            profile_id: &anime.profile_id,
            title: &anime.title,
            showrunner: canonical_optional_text(&anime.showrunner),
            casting: canonical_optional_text(&anime.casting),
            summary: canonical_optional_text(&anime.summary),
            status: &anime.status,
            rating: anime.rating,
            is_favorite: anime.is_favorite,
            seasons_seen: anime.seasons_seen,
            seasons_total: anime.seasons_total,
            progress_updated_at: canonical_optional_text(&anime.progress_updated_at),
            started_at: canonical_optional_text(&anime.started_at),
            poster_url: canonical_optional_text(&anime.poster_url),
            personal_note: canonical_optional_text(&anime.personal_note),
            created_at: &anime.created_at,
            updated_at: &anime.updated_at,
        }
    }
}

/// Vue normalisée d'une fiche Livres/Mangas. `quotes` garde la forme du
/// domaine (`bookId`) et sera écrite dans la table de citations de la
/// bibliothèque cible.
struct MangaRecord<'a> {
    id: &'a str,
    profile_id: &'a str,
    title: &'a str,
    author: Option<&'a str>,
    year: Option<i64>,
    summary: Option<&'a str>,
    status: &'a str,
    rating: Option<f64>,
    is_favorite: bool,
    volumes_read: Option<i64>,
    volumes_total: Option<i64>,
    progress_updated_at: Option<&'a str>,
    started_at: Option<&'a str>,
    cover_url: Option<&'a str>,
    personal_note: Option<&'a str>,
    created_at: &'a str,
    updated_at: &'a str,
    quotes: &'a [ImportBookQuote],
}

impl<'a> From<&'a ImportBook> for MangaRecord<'a> {
    fn from(book: &'a ImportBook) -> Self {
        Self {
            id: &book.id,
            profile_id: &book.profile_id,
            title: &book.title,
            author: canonical_optional_text(&book.author),
            year: book.year,
            summary: canonical_optional_text(&book.summary),
            status: &book.status,
            rating: book.rating,
            is_favorite: book.is_favorite,
            volumes_read: book.volumes_read,
            volumes_total: book.volumes_total,
            progress_updated_at: canonical_optional_text(&book.progress_updated_at),
            started_at: canonical_optional_text(&book.started_at),
            cover_url: canonical_optional_text(&book.cover_url),
            personal_note: canonical_optional_text(&book.personal_note),
            created_at: &book.created_at,
            updated_at: &book.updated_at,
            quotes: &book.quotes,
        }
    }
}

impl<'a> From<&'a ImportManga> for MangaRecord<'a> {
    fn from(manga: &'a ImportManga) -> Self {
        Self {
            id: &manga.id,
            profile_id: &manga.profile_id,
            title: &manga.title,
            author: canonical_optional_text(&manga.author),
            year: manga.year,
            summary: canonical_optional_text(&manga.summary),
            status: &manga.status,
            rating: manga.rating,
            is_favorite: manga.is_favorite,
            volumes_read: manga.volumes_read,
            volumes_total: manga.volumes_total,
            progress_updated_at: canonical_optional_text(&manga.progress_updated_at),
            started_at: canonical_optional_text(&manga.started_at),
            cover_url: canonical_optional_text(&manga.cover_url),
            personal_note: canonical_optional_text(&manga.personal_note),
            created_at: &manga.created_at,
            updated_at: &manga.updated_at,
            quotes: &manga.quotes,
        }
    }
}

// ---------------------------------------------------------------------------
// Bibliothèques personnalisées (modèles prêts, migration 0021)
// ---------------------------------------------------------------------------

/// Table de citations d’une bibliothèque personnalisée et colonne qui désigne
/// la fiche parente.
pub(crate) struct CustomQuotesTable {
    pub(crate) table: &'static str,
    pub(crate) parent_column: &'static str,
}

/// Bibliothèque personnalisée connue du moteur. `id` est la valeur stockée
/// dans `profile_libraries` ; il vaut le nom de la table. Seules ces chaînes
/// statiques entrent dans une requête SQL : un identifiant lu dans un document
/// n’y est jamais interpolé.
pub(crate) struct CustomLibrary {
    pub(crate) id: &'static str,
    pub(crate) table: &'static str,
    pub(crate) label: &'static str,
    pub(crate) quotes: Option<CustomQuotesTable>,
}

/// Les huit modèles prêts, dans l’ordre de la migration 0021. Les huit tables
/// partagent les mêmes colonnes ; seule Comics a une table de citations.
pub(crate) static CUSTOM_LIBRARIES: [CustomLibrary; 8] = [
    CustomLibrary {
        id: "comics",
        table: "comics",
        label: "Comics",
        quotes: Some(CustomQuotesTable {
            table: "comic_quotes",
            parent_column: "comic_id",
        }),
    },
    CustomLibrary {
        id: "magazines",
        table: "magazines",
        label: "Magazines",
        quotes: None,
    },
    CustomLibrary {
        id: "audiobooks",
        table: "audiobooks",
        label: "Livres audio",
        quotes: None,
    },
    CustomLibrary {
        id: "music",
        table: "music",
        label: "Musique",
        quotes: None,
    },
    CustomLibrary {
        id: "podcasts",
        table: "podcasts",
        label: "Podcasts",
        quotes: None,
    },
    CustomLibrary {
        id: "documentaries",
        table: "documentaries",
        label: "Documentaires et reportages",
        quotes: None,
    },
    CustomLibrary {
        id: "shows",
        table: "shows",
        label: "Spectacles",
        quotes: None,
    },
    CustomLibrary {
        id: "board_games",
        table: "board_games",
        label: "Jeux de société",
        quotes: None,
    },
];

/// Somme SQL des fiches personnalisées d’un profil, toutes tables confondues.
/// `profile` est une expression SQL écrite dans le code (`p.id`, `$1`),
/// jamais une valeur reçue.
pub(crate) fn custom_entry_count_sql(profile: &str) -> String {
    CUSTOM_LIBRARIES
        .iter()
        .map(|library| {
            format!(
                "(SELECT COUNT(*) FROM {} WHERE profile_id = {profile})",
                library.table
            )
        })
        .collect::<Vec<_>>()
        .join(" + ")
}

/// Statuts stockés, communs aux huit tables (contrainte CHECK de 0021).
const CUSTOM_ENTRY_STATUSES: [&str; 4] = ["à découvrir", "en cours", "terminé", "abandonné"];

/// Refus d’un document qui garde des comics dans sa section Livres.
const COMICS_IN_BOOKS_SECTION_ERROR: &str =
    "Les comics ont leur propre bibliothèque : ce document doit les placer dans la section Comics.";

fn custom_library(library_id: &str) -> Option<&'static CustomLibrary> {
    CUSTOM_LIBRARIES
        .iter()
        .find(|library| library.id == library_id)
}

/// Contrôles des bibliothèques personnalisées d’un document, avant toute
/// écriture. Renvoie, dans l’ordre du document, la bibliothèque reconnue de
/// chaque section : l’écriture n’utilise que ces tables.
fn validate_custom_libraries(
    payload: &ImportLibraryDocumentPayload,
) -> Result<Vec<&'static CustomLibrary>, String> {
    let mut libraries: Vec<&'static CustomLibrary> =
        Vec::with_capacity(payload.custom_libraries.len());
    for section in &payload.custom_libraries {
        let library = custom_library(&section.library_id).ok_or_else(|| {
            format!(
                "Bibliothèque personnalisée inconnue : « {} ».",
                section.library_id
            )
        })?;
        if libraries.iter().any(|known| known.id == library.id) {
            return Err(format!(
                "La bibliothèque {} apparaît deux fois dans le document.",
                library.label
            ));
        }
        for entry in &section.entries {
            if !CUSTOM_ENTRY_STATUSES.contains(&entry.status.as_str()) {
                return Err(format!(
                    "La fiche {} « {} » porte un statut inconnu : « {} ».",
                    library.label, entry.title, entry.status
                ));
            }
            if let Some((key, _)) = entry.details.iter().find(|(_, value)| !value.is_string()) {
                return Err(format!(
                    "Le détail « {key} » de la fiche {} « {} » doit être un texte.",
                    library.label, entry.title
                ));
            }
            if library.quotes.is_none() && !entry.quotes.is_empty() {
                return Err(format!(
                    "La bibliothèque {} n’accepte pas de citations : la fiche « {} » en contient.",
                    library.label, entry.title
                ));
            }
            if entry.quotes.iter().any(|quote| quote.entry_id != entry.id) {
                return Err(format!(
                    "Une citation ne correspond pas à la fiche {} « {} ».",
                    library.label, entry.title
                ));
            }
        }
        libraries.push(library);
    }
    Ok(libraries)
}

async fn insert_custom_entry(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    library: &CustomLibrary,
    entry: &ImportCustomEntry,
) -> Result<(), String> {
    let details = serde_json::to_string(&entry.details).map_err(|error| {
        format!(
            "Impossible de conserver les détails de la fiche {} « {} » : {error}",
            library.label, entry.title
        )
    })?;
    sqlx::query(&format!(
        "INSERT INTO {} (
            id, profile_id, title, creator, year, status, rating, is_favorite,
            progress_current, progress_total, progress_updated_at, started_at,
            finished_at, cover_url, summary, personal_note, details, created_at, updated_at
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
         )",
        library.table
    ))
    .bind(&entry.id)
    .bind(&entry.profile_id)
    .bind(&entry.title)
    .bind(canonical_optional_text(&entry.creator))
    .bind(entry.year)
    .bind(&entry.status)
    .bind(entry.rating)
    .bind(if entry.is_favorite { 1 } else { 0 })
    .bind(entry.progress_current)
    .bind(entry.progress_total)
    .bind(canonical_optional_text(&entry.progress_updated_at))
    .bind(canonical_optional_text(&entry.started_at))
    .bind(canonical_optional_text(&entry.finished_at))
    .bind(canonical_optional_text(&entry.cover_url))
    .bind(canonical_optional_text(&entry.summary))
    .bind(canonical_optional_text(&entry.personal_note))
    .bind(details)
    .bind(&entry.created_at)
    .bind(&entry.updated_at)
    .execute(&mut **transaction)
    .await
    .map_err(|error| {
        format!(
            "Impossible d’importer la fiche {} « {} » : {error}",
            library.label, entry.title
        )
    })?;

    if let Some(quotes) = &library.quotes {
        let statement = format!(
            "INSERT INTO {} (id, {}, body, position, created_at) VALUES ($1, $2, $3, $4, $5)",
            quotes.table, quotes.parent_column
        );
        for quote in &entry.quotes {
            sqlx::query(&statement)
                .bind(&quote.id)
                .bind(&entry.id)
                .bind(&quote.body)
                .bind(quote.position)
                .bind(&quote.created_at)
                .execute(&mut **transaction)
                .await
                .map_err(|error| {
                    format!(
                        "Impossible d’importer une citation de la fiche {} « {} » : {error}",
                        library.label, entry.title
                    )
                })?;
        }
    }

    Ok(())
}

fn validate_library_categories(payload: &ImportLibraryDocumentPayload) -> Result<(), String> {
    if payload
        .books
        .iter()
        .any(|book| is_comics_category(&book.category))
    {
        return Err(COMICS_IN_BOOKS_SECTION_ERROR.to_string());
    }
    for anime in &payload.anime {
        if let Some(category) = &anime.category {
            if !is_animation_category(category) {
                return Err(format!(
                    "La fiche Animation « {} » porte une catégorie incompatible.",
                    anime.title
                ));
            }
        }
    }
    for manga in &payload.mangas {
        if let Some(category) = &manga.category {
            if !is_manga_category(category) {
                return Err(format!(
                    "La fiche Mangas « {} » porte une catégorie incompatible.",
                    manga.title
                ));
            }
        }
    }
    Ok(())
}

async fn insert_anime_row(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    anime: &AnimeRecord<'_>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO anime (
            id, profile_id, title, showrunner, casting, summary, status, rating,
            is_favorite, seasons_seen, seasons_total, progress_updated_at, started_at,
            poster_url, personal_note, created_at, updated_at
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
         )",
    )
    .bind(anime.id)
    .bind(anime.profile_id)
    .bind(anime.title)
    .bind(anime.showrunner)
    .bind(anime.casting)
    .bind(anime.summary)
    .bind(anime.status)
    .bind(anime.rating)
    .bind(if anime.is_favorite { 1 } else { 0 })
    .bind(anime.seasons_seen)
    .bind(anime.seasons_total)
    .bind(anime.progress_updated_at)
    .bind(anime.started_at)
    .bind(anime.poster_url)
    .bind(anime.personal_note)
    .bind(anime.created_at)
    .bind(anime.updated_at)
    .execute(&mut **transaction)
    .await
    .map_err(|error| {
        format!(
            "Impossible d’importer l’animation « {} » : {error}",
            anime.title
        )
    })?;

    Ok(())
}

async fn insert_series_row(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    series: &ImportSeries,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO series (
            id, profile_id, title, showrunner, casting, summary, category, status, rating,
            is_favorite, seasons_seen, seasons_total, progress_updated_at, started_at,
            poster_url, personal_note, created_at, updated_at
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
         )",
    )
    .bind(&series.id)
    .bind(&series.profile_id)
    .bind(&series.title)
    .bind(canonical_optional_text(&series.showrunner))
    .bind(canonical_optional_text(&series.casting))
    .bind(canonical_optional_text(&series.summary))
    .bind(TELEVISION_SERIES_CATEGORY)
    .bind(&series.status)
    .bind(series.rating)
    .bind(if series.is_favorite { 1 } else { 0 })
    .bind(series.seasons_seen)
    .bind(series.seasons_total)
    .bind(canonical_optional_text(&series.progress_updated_at))
    .bind(canonical_optional_text(&series.started_at))
    .bind(canonical_optional_text(&series.poster_url))
    .bind(canonical_optional_text(&series.personal_note))
    .bind(&series.created_at)
    .bind(&series.updated_at)
    .execute(&mut **transaction)
    .await
    .map_err(|error| {
        format!(
            "Impossible d’importer la série « {} » : {error}",
            series.title
        )
    })?;

    Ok(())
}

async fn insert_manga_quotes(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    manga_id: &str,
    manga_title: &str,
    quotes: &[ImportBookQuote],
) -> Result<(), String> {
    for quote in quotes {
        sqlx::query(
            "INSERT INTO manga_quotes (id, manga_id, body, position, created_at)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(&quote.id)
        .bind(manga_id)
        .bind(&quote.body)
        .bind(quote.position)
        .bind(&quote.created_at)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            format!("Impossible d’importer une citation du manga « {manga_title} » : {error}")
        })?;
    }

    Ok(())
}

async fn insert_manga_row(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    manga: &MangaRecord<'_>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO mangas (
            id, profile_id, title, author, year, summary, status, rating,
            is_favorite, volumes_read, volumes_total, progress_updated_at, started_at,
            cover_url, personal_note, created_at, updated_at
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
         )",
    )
    .bind(manga.id)
    .bind(manga.profile_id)
    .bind(manga.title)
    .bind(manga.author)
    .bind(manga.year)
    .bind(manga.summary)
    .bind(manga.status)
    .bind(manga.rating)
    .bind(if manga.is_favorite { 1 } else { 0 })
    .bind(manga.volumes_read)
    .bind(manga.volumes_total)
    .bind(manga.progress_updated_at)
    .bind(manga.started_at)
    .bind(manga.cover_url)
    .bind(manga.personal_note)
    .bind(manga.created_at)
    .bind(manga.updated_at)
    .execute(&mut **transaction)
    .await
    .map_err(|error| {
        format!(
            "Impossible d’importer le manga « {} » : {error}",
            manga.title
        )
    })?;

    insert_manga_quotes(transaction, manga.id, manga.title, manga.quotes).await?;

    Ok(())
}

async fn insert_book_row(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    book: &ImportBook,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO books (
            id, profile_id, title, author, year, summary, category, status, rating,
            is_favorite, volumes_read, volumes_total, progress_updated_at, started_at,
            cover_url, personal_note, created_at, updated_at
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
         )",
    )
    .bind(&book.id)
    .bind(&book.profile_id)
    .bind(&book.title)
    .bind(canonical_optional_text(&book.author))
    .bind(book.year)
    .bind(canonical_optional_text(&book.summary))
    .bind(&book.category)
    .bind(&book.status)
    .bind(book.rating)
    .bind(if book.is_favorite { 1 } else { 0 })
    .bind(book.volumes_read)
    .bind(book.volumes_total)
    .bind(canonical_optional_text(&book.progress_updated_at))
    .bind(canonical_optional_text(&book.started_at))
    .bind(canonical_optional_text(&book.cover_url))
    .bind(canonical_optional_text(&book.personal_note))
    .bind(&book.created_at)
    .bind(&book.updated_at)
    .execute(&mut **transaction)
    .await
    .map_err(|error| {
        format!(
            "Impossible d’importer le livre « {} » : {error}",
            book.title
        )
    })?;

    for quote in &book.quotes {
        sqlx::query(
            "INSERT INTO book_quotes (id, book_id, body, position, created_at)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(&quote.id)
        .bind(&quote.book_id)
        .bind(&quote.body)
        .bind(quote.position)
        .bind(&quote.created_at)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible d’importer une citation du livre « {} » : {error}",
                book.title
            )
        })?;
    }

    Ok(())
}

async fn write_library_document_import(
    pool: &sqlx::SqlitePool,
    payload: &ImportLibraryDocumentPayload,
    create_profile: bool,
) -> Result<(), String> {
    let targets_import_profile = |profile_id: &str| profile_id == payload.profile.id;

    if payload
        .films
        .iter()
        .any(|film| !targets_import_profile(&film.profile_id))
        || payload
            .series
            .iter()
            .any(|series| !targets_import_profile(&series.profile_id))
        || payload
            .anime
            .iter()
            .any(|anime| !targets_import_profile(&anime.profile_id))
        || payload
            .books
            .iter()
            .any(|book| !targets_import_profile(&book.profile_id))
        || payload
            .mangas
            .iter()
            .any(|manga| !targets_import_profile(&manga.profile_id))
        || payload
            .games
            .iter()
            .any(|game| !targets_import_profile(&game.profile_id))
        || payload
            .artworks
            .iter()
            .any(|artwork| !targets_import_profile(&artwork.profile_id))
        || payload
            .custom_libraries
            .iter()
            .flat_map(|library| &library.entries)
            .any(|entry| !targets_import_profile(&entry.profile_id))
    {
        return Err("Un élément ne cible pas le profil d’import.".to_string());
    }

    validate_library_categories(payload)?;

    let book_ids: std::collections::HashSet<&str> =
        payload.books.iter().map(|book| book.id.as_str()).collect();
    for book in &payload.books {
        if book
            .quotes
            .iter()
            .any(|quote| quote.book_id != book.id || !book_ids.contains(quote.book_id.as_str()))
        {
            return Err(format!(
                "Une citation ne correspond pas au livre « {} ».",
                book.title
            ));
        }
    }

    for manga in &payload.mangas {
        if manga.quotes.iter().any(|quote| quote.book_id != manga.id) {
            return Err(format!(
                "Une citation ne correspond pas au manga « {} ».",
                manga.title
            ));
        }
    }

    let custom_libraries = validate_custom_libraries(payload)?;

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer l’import SQLite : {error}"))?;

    if create_profile {
        sqlx::query(
            "INSERT INTO profiles (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)",
        )
        .bind(&payload.profile.id)
        .bind(&payload.profile.name)
        .bind(&payload.profile.created_at)
        .bind(&payload.profile.updated_at)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de créer le nouveau profil : {error}"))?;
    } else {
        let profile_exists: i64 =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM profiles WHERE id = $1)")
                .bind(&payload.profile.id)
                .fetch_one(&mut *transaction)
                .await
                .map_err(|error| format!("Impossible de vérifier le profil courant : {error}"))?;
        if profile_exists != 1 {
            return Err("Le profil courant est introuvable.".to_string());
        }

        // Profil vide : aucune fiche dans les sept bibliothèques de base ni
        // dans les huit bibliothèques personnalisées. Une bibliothèque ajoutée
        // sans fiche ne compte pas.
        let existing_works: i64 = sqlx::query_scalar(&format!(
            "SELECT
                (SELECT COUNT(*) FROM films WHERE profile_id = $1)
              + (SELECT COUNT(*) FROM series WHERE profile_id = $1)
              + (SELECT COUNT(*) FROM anime WHERE profile_id = $1)
              + (SELECT COUNT(*) FROM books WHERE profile_id = $1)
              + (SELECT COUNT(*) FROM mangas WHERE profile_id = $1)
              + (SELECT COUNT(*) FROM games WHERE profile_id = $1)
              + (SELECT COUNT(*) FROM artworks WHERE profile_id = $1)
              + {}",
            custom_entry_count_sql("$1")
        ))
        .bind(&payload.profile.id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| {
            format!("Impossible de vérifier que le profil courant est vide : {error}")
        })?;
        if existing_works != 0 {
            return Err("L’import global est réservé à un profil vide.".to_string());
        }
    }

    for film in &payload.films {
        let original_title = canonical_optional_text(&film.original_title);
        let watched_at = canonical_optional_text(&film.watched_at);
        let personal_note = canonical_optional_text(&film.personal_note);
        let director = canonical_optional_text(&film.director);
        let summary = canonical_optional_text(&film.summary);
        let poster_url = canonical_optional_text(&film.poster_url);
        let (provider_name, provider_id) =
            canonical_provenance(&film.provider_name, &film.provider_id);

        sqlx::query(
            "INSERT INTO films (
                id, profile_id, title, original_title, year, status, is_favorite, rating,
                watched_at, personal_note, director, summary, provider_name, provider_id,
                poster_url, created_at, updated_at
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
             )",
        )
        .bind(&film.id)
        .bind(&film.profile_id)
        .bind(&film.title)
        .bind(original_title)
        .bind(film.year)
        .bind(&film.status)
        .bind(if film.is_favorite { 1 } else { 0 })
        .bind(film.rating)
        .bind(watched_at)
        .bind(personal_note)
        .bind(director)
        .bind(summary)
        .bind(provider_name)
        .bind(provider_id)
        .bind(poster_url)
        .bind(&film.created_at)
        .bind(&film.updated_at)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible d’importer le film « {} » : {error}", film.title))?;
    }

    for series in &payload.series {
        if is_animation_category(&series.category) {
            insert_anime_row(&mut transaction, &AnimeRecord::from(series)).await?;
        } else {
            insert_series_row(&mut transaction, series).await?;
        }
    }

    for anime in &payload.anime {
        insert_anime_row(&mut transaction, &AnimeRecord::from(anime)).await?;
    }

    for book in &payload.books {
        if is_manga_category(&book.category) {
            insert_manga_row(&mut transaction, &MangaRecord::from(book)).await?;
        } else {
            insert_book_row(&mut transaction, book).await?;
        }
    }

    for manga in &payload.mangas {
        insert_manga_row(&mut transaction, &MangaRecord::from(manga)).await?;
    }

    for game in &payload.games {
        sqlx::query(
            "INSERT INTO games (
                id, profile_id, title, developer, platform, year, status, rating, is_favorite,
                played_at, cover_url, personal_note, created_at, updated_at
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
             )",
        )
        .bind(&game.id)
        .bind(&game.profile_id)
        .bind(&game.title)
        .bind(canonical_optional_text(&game.developer))
        .bind(canonical_optional_text(&game.platform))
        .bind(game.year)
        .bind(&game.status)
        .bind(game.rating)
        .bind(if game.is_favorite { 1 } else { 0 })
        .bind(canonical_optional_text(&game.played_at))
        .bind(canonical_optional_text(&game.cover_url))
        .bind(canonical_optional_text(&game.personal_note))
        .bind(&game.created_at)
        .bind(&game.updated_at)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible d’importer le jeu « {} » : {error}", game.title))?;
    }

    for artwork in &payload.artworks {
        let custom_fields = serde_json::to_string(&artwork.custom_fields)
            .map_err(|error| format!("Impossible de conserver les champs de l’œuvre : {error}"))?;
        sqlx::query(
            "INSERT INTO artworks (
                id, profile_id, title, artist, year, form, location, exhibition, status,
                is_favorite, discovered_at, image_url, personal_note, created_at, updated_at, custom_fields
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
             )",
        )
        .bind(&artwork.id)
        .bind(&artwork.profile_id)
        .bind(&artwork.title)
        .bind(canonical_optional_text(&artwork.artist))
        .bind(artwork.year)
        .bind(&artwork.form)
        .bind(canonical_optional_text(&artwork.location))
        .bind(canonical_optional_text(&artwork.exhibition))
        .bind(&artwork.status)
        .bind(if artwork.is_favorite { 1 } else { 0 })
        .bind(canonical_optional_text(&artwork.discovered_at))
        .bind(canonical_optional_text(&artwork.image_url))
        .bind(canonical_optional_text(&artwork.personal_note))
        .bind(&artwork.created_at)
        .bind(&artwork.updated_at)
        .bind(custom_fields)
        .execute(&mut *transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible d’importer l’œuvre « {} » : {error}",
                artwork.title
            )
        })?;
    }

    // Bibliothèques personnalisées : uniquement les tables reconnues par
    // `validate_custom_libraries`. Une bibliothèque déjà ajoutée au profil
    // garde sa place ; ses fiches sont importées.
    for (library, section) in custom_libraries.iter().zip(&payload.custom_libraries) {
        sqlx::query(
            "INSERT INTO profile_libraries (profile_id, library_id, position, added_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT(profile_id, library_id) DO NOTHING",
        )
        .bind(&payload.profile.id)
        .bind(library.id)
        .bind(section.position)
        .bind(&section.added_at)
        .execute(&mut *transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible d’ajouter la bibliothèque {} au profil : {error}",
                library.label
            )
        })?;

        for entry in &section.entries {
            insert_custom_entry(&mut transaction, library, entry).await?;
        }
    }

    if create_profile {
        sqlx::query(
            "UPDATE current_profile
             SET profile_id = $1, updated_at = $2
             WHERE singleton = 1",
        )
        .bind(&payload.profile.id)
        .bind(&payload.profile.updated_at)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible d’activer le nouveau profil : {error}"))?;
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser l’import SQLite : {error}"))?;

    Ok(())
}

/// Comptes d'un document : Séries et Livres sont répartis d'après la table
/// réellement écrite, routage des documents v1/v2 inclus.
fn library_document_result(payload: &ImportLibraryDocumentPayload) -> ImportLibraryDocumentResult {
    let series_count = payload
        .series
        .iter()
        .filter(|series| !is_animation_category(&series.category))
        .count();
    let anime_count = payload
        .series
        .iter()
        .filter(|series| is_animation_category(&series.category))
        .count()
        + payload.anime.len();
    let book_count = payload
        .books
        .iter()
        .filter(|book| !is_manga_category(&book.category))
        .count();
    let manga_count = payload
        .books
        .iter()
        .filter(|book| is_manga_category(&book.category))
        .count()
        + payload.mangas.len();

    ImportLibraryDocumentResult {
        profile_id: payload.profile.id.clone(),
        film_count: payload.films.len(),
        series_count,
        anime_count,
        book_count,
        manga_count,
        game_count: payload.games.len(),
        artwork_count: payload.artworks.len(),
        custom_library_count: payload.custom_libraries.len(),
        custom_entry_count: payload
            .custom_libraries
            .iter()
            .map(|library| library.entries.len())
            .sum(),
    }
}

fn canonical_optional_text(value: &Option<String>) -> Option<&str> {
    value.as_deref().filter(|value| !value.is_empty())
}

fn canonical_provenance<'a>(
    provider_name: &'a Option<String>,
    provider_id: &'a Option<String>,
) -> (Option<&'a str>, Option<&'a str>) {
    let provider_name = canonical_optional_text(provider_name);
    let provider_id = canonical_optional_text(provider_id);

    if provider_name.is_some() && provider_id.is_some() {
        (provider_name, provider_id)
    } else {
        (None, None)
    }
}

// ---------------------------------------------------------------------------
// Jalon 0.4.4 — imports unitaires dans le profil courant (remplacer/fusionner)
// ---------------------------------------------------------------------------

/// Plan d'écriture d'un import unitaire préparé côté interface : insertions,
/// mises à jour (fusion ou remplacement d'un doublon) et — en mode
/// « Remplacer » — vidage préalable de la collection du profil courant.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionImportPlan<F> {
    pub profile_id: String,
    /// Vider la collection du profil avant d'écrire (mode « Remplacer »).
    pub replace_existing: bool,
    pub inserts: Vec<F>,
    pub updates: Vec<F>,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CollectionImportResult {
    pub inserted: usize,
    pub updated: usize,
    pub removed: usize,
}

#[tauri::command]
pub async fn import_films_into_profile(
    db_instances: State<'_, DbInstances>,
    plan: CollectionImportPlan<ImportFilm>,
) -> Result<CollectionImportResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    write_films_import_plan(&pool, &plan).await
}

#[tauri::command]
pub async fn import_series_into_profile(
    db_instances: State<'_, DbInstances>,
    plan: CollectionImportPlan<ImportSeries>,
) -> Result<CollectionImportResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    write_series_import_plan(&pool, &plan).await
}

#[tauri::command]
pub async fn import_books_into_profile(
    db_instances: State<'_, DbInstances>,
    plan: CollectionImportPlan<ImportBook>,
) -> Result<CollectionImportResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    write_books_import_plan(&pool, &plan).await
}

#[tauri::command]
pub async fn import_anime_into_profile(
    db_instances: State<'_, DbInstances>,
    plan: CollectionImportPlan<ImportAnime>,
) -> Result<CollectionImportResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    write_anime_import_plan(&pool, &plan).await
}

#[tauri::command]
pub async fn import_mangas_into_profile(
    db_instances: State<'_, DbInstances>,
    plan: CollectionImportPlan<ImportManga>,
) -> Result<CollectionImportResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    write_mangas_import_plan(&pool, &plan).await
}

#[tauri::command]
pub async fn import_games_into_profile(
    db_instances: State<'_, DbInstances>,
    plan: CollectionImportPlan<ImportGame>,
) -> Result<CollectionImportResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    write_games_import_plan(&pool, &plan).await
}

#[tauri::command]
pub async fn import_artworks_into_profile(
    db_instances: State<'_, DbInstances>,
    plan: CollectionImportPlan<ImportArtwork>,
) -> Result<CollectionImportResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    write_artworks_import_plan(&pool, &plan).await
}

async fn write_films_import_plan(
    pool: &sqlx::SqlitePool,
    plan: &CollectionImportPlan<ImportFilm>,
) -> Result<CollectionImportResult, String> {
    validate_plan_profile(
        &plan.profile_id,
        plan.inserts
            .iter()
            .map(|f| f.profile_id.as_str())
            .chain(plan.updates.iter().map(|f| f.profile_id.as_str())),
    )?;

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer l’import Films : {error}"))?;

    let mut removed = 0usize;
    if plan.replace_existing {
        let result = sqlx::query("DELETE FROM films WHERE profile_id = $1")
            .bind(&plan.profile_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("Impossible de vider la collection Films : {error}"))?;
        removed = result.rows_affected() as usize;
    }

    for film in &plan.updates {
        upsert_film(&mut transaction, film, true).await?;
    }
    for film in &plan.inserts {
        upsert_film(&mut transaction, film, false).await?;
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser l’import Films : {error}"))?;

    Ok(CollectionImportResult {
        inserted: plan.inserts.len(),
        updated: plan.updates.len(),
        removed,
    })
}

async fn write_series_import_plan(
    pool: &sqlx::SqlitePool,
    plan: &CollectionImportPlan<ImportSeries>,
) -> Result<CollectionImportResult, String> {
    validate_plan_profile(
        &plan.profile_id,
        plan.inserts
            .iter()
            .map(|s| s.profile_id.as_str())
            .chain(plan.updates.iter().map(|s| s.profile_id.as_str())),
    )?;

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer l’import Séries : {error}"))?;

    let mut removed = 0usize;
    if plan.replace_existing {
        let result = sqlx::query("DELETE FROM series WHERE profile_id = $1")
            .bind(&plan.profile_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("Impossible de vider la collection Séries : {error}"))?;
        removed = result.rows_affected() as usize;
    }

    for series in &plan.updates {
        if is_animation_category(&series.category) {
            upsert_anime(&mut transaction, &AnimeRecord::from(series), true).await?;
        } else {
            upsert_series(&mut transaction, series, true).await?;
        }
    }
    for series in &plan.inserts {
        if is_animation_category(&series.category) {
            upsert_anime(&mut transaction, &AnimeRecord::from(series), false).await?;
        } else {
            upsert_series(&mut transaction, series, false).await?;
        }
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser l’import Séries : {error}"))?;

    Ok(CollectionImportResult {
        inserted: plan.inserts.len(),
        updated: plan.updates.len(),
        removed,
    })
}

async fn write_books_import_plan(
    pool: &sqlx::SqlitePool,
    plan: &CollectionImportPlan<ImportBook>,
) -> Result<CollectionImportResult, String> {
    validate_plan_profile(
        &plan.profile_id,
        plan.inserts
            .iter()
            .map(|book| book.profile_id.as_str())
            .chain(plan.updates.iter().map(|book| book.profile_id.as_str())),
    )?;
    for book in plan.inserts.iter().chain(plan.updates.iter()) {
        if is_comics_category(&book.category) {
            return Err(COMICS_HAVE_THEIR_OWN_LIBRARY.to_string());
        }
        validate_import_book_quotes(book)?;
    }

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer l’import Livres : {error}"))?;

    let mut removed = 0usize;
    if plan.replace_existing {
        let result = sqlx::query("DELETE FROM books WHERE profile_id = $1")
            .bind(&plan.profile_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("Impossible de vider la collection Livres : {error}"))?;
        removed = result.rows_affected() as usize;
    }

    for book in &plan.updates {
        if is_manga_category(&book.category) {
            upsert_manga(&mut transaction, &MangaRecord::from(book), true).await?;
        } else {
            upsert_book(&mut transaction, book, true).await?;
        }
    }
    for book in &plan.inserts {
        if is_manga_category(&book.category) {
            upsert_manga(&mut transaction, &MangaRecord::from(book), false).await?;
        } else {
            upsert_book(&mut transaction, book, false).await?;
        }
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser l’import Livres : {error}"))?;

    Ok(CollectionImportResult {
        inserted: plan.inserts.len(),
        updated: plan.updates.len(),
        removed,
    })
}

/// Import de la bibliothèque Animation japonaise (table `anime`). Le
/// remplacement ne vide que `anime` : Séries reste intacte.
async fn write_anime_import_plan(
    pool: &sqlx::SqlitePool,
    plan: &CollectionImportPlan<ImportAnime>,
) -> Result<CollectionImportResult, String> {
    validate_plan_profile(
        &plan.profile_id,
        plan.inserts
            .iter()
            .map(|anime| anime.profile_id.as_str())
            .chain(plan.updates.iter().map(|anime| anime.profile_id.as_str())),
    )?;
    for anime in plan.inserts.iter().chain(plan.updates.iter()) {
        if let Some(category) = &anime.category {
            if !is_animation_category(category) {
                return Err(format!(
                    "La fiche Animation « {} » porte une catégorie incompatible.",
                    anime.title
                ));
            }
        }
    }

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer l’import Animation : {error}"))?;

    let mut removed = 0usize;
    if plan.replace_existing {
        let result = sqlx::query("DELETE FROM anime WHERE profile_id = $1")
            .bind(&plan.profile_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("Impossible de vider la collection Animation : {error}"))?;
        removed = result.rows_affected() as usize;
    }

    for anime in &plan.updates {
        upsert_anime(&mut transaction, &AnimeRecord::from(anime), true).await?;
    }
    for anime in &plan.inserts {
        upsert_anime(&mut transaction, &AnimeRecord::from(anime), false).await?;
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser l’import Animation : {error}"))?;

    Ok(CollectionImportResult {
        inserted: plan.inserts.len(),
        updated: plan.updates.len(),
        removed,
    })
}

/// Import de la bibliothèque Mangas. Les citations sont écrites dans
/// `manga_quotes` et supprimées avec leur fiche ; le remplacement ne vide que
/// `mangas` et ses citations.
async fn write_mangas_import_plan(
    pool: &sqlx::SqlitePool,
    plan: &CollectionImportPlan<ImportManga>,
) -> Result<CollectionImportResult, String> {
    validate_plan_profile(
        &plan.profile_id,
        plan.inserts
            .iter()
            .map(|manga| manga.profile_id.as_str())
            .chain(plan.updates.iter().map(|manga| manga.profile_id.as_str())),
    )?;
    for manga in plan.inserts.iter().chain(plan.updates.iter()) {
        if let Some(category) = &manga.category {
            if !is_manga_category(category) {
                return Err(format!(
                    "La fiche Mangas « {} » porte une catégorie incompatible.",
                    manga.title
                ));
            }
        }
        if manga.quotes.iter().any(|quote| quote.book_id != manga.id) {
            return Err(format!(
                "Une citation ne correspond pas au manga « {} ».",
                manga.title
            ));
        }
    }

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer l’import Mangas : {error}"))?;

    let mut removed = 0usize;
    if plan.replace_existing {
        // Suppression explicite des citations : le cascade SQLite dépend du
        // PRAGMA foreign_keys de la connexion.
        sqlx::query(
            "DELETE FROM manga_quotes
             WHERE manga_id IN (SELECT id FROM mangas WHERE profile_id = $1)",
        )
        .bind(&plan.profile_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Impossible de vider les citations Mangas : {error}"))?;
        let result = sqlx::query("DELETE FROM mangas WHERE profile_id = $1")
            .bind(&plan.profile_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("Impossible de vider la collection Mangas : {error}"))?;
        removed = result.rows_affected() as usize;
    }

    for manga in &plan.updates {
        upsert_manga(&mut transaction, &MangaRecord::from(manga), true).await?;
    }
    for manga in &plan.inserts {
        upsert_manga(&mut transaction, &MangaRecord::from(manga), false).await?;
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser l’import Mangas : {error}"))?;

    Ok(CollectionImportResult {
        inserted: plan.inserts.len(),
        updated: plan.updates.len(),
        removed,
    })
}

async fn write_games_import_plan(
    pool: &sqlx::SqlitePool,
    plan: &CollectionImportPlan<ImportGame>,
) -> Result<CollectionImportResult, String> {
    validate_plan_profile(
        &plan.profile_id,
        plan.inserts
            .iter()
            .map(|game| game.profile_id.as_str())
            .chain(plan.updates.iter().map(|game| game.profile_id.as_str())),
    )?;

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer l’import Jeux : {error}"))?;
    let mut removed = 0usize;
    if plan.replace_existing {
        removed = sqlx::query("DELETE FROM games WHERE profile_id = $1")
            .bind(&plan.profile_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("Impossible de vider la collection Jeux : {error}"))?
            .rows_affected() as usize;
    }

    for game in &plan.updates {
        upsert_game(&mut transaction, game, true).await?;
    }
    for game in &plan.inserts {
        upsert_game(&mut transaction, game, false).await?;
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser l’import Jeux : {error}"))?;
    Ok(CollectionImportResult {
        inserted: plan.inserts.len(),
        updated: plan.updates.len(),
        removed,
    })
}

async fn write_artworks_import_plan(
    pool: &sqlx::SqlitePool,
    plan: &CollectionImportPlan<ImportArtwork>,
) -> Result<CollectionImportResult, String> {
    validate_plan_profile(
        &plan.profile_id,
        plan.inserts
            .iter()
            .map(|artwork| artwork.profile_id.as_str())
            .chain(
                plan.updates
                    .iter()
                    .map(|artwork| artwork.profile_id.as_str()),
            ),
    )?;

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Impossible de démarrer l’import Art : {error}"))?;
    let mut removed = 0usize;
    if plan.replace_existing {
        removed = sqlx::query("DELETE FROM artworks WHERE profile_id = $1")
            .bind(&plan.profile_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("Impossible de vider la collection Art : {error}"))?
            .rows_affected() as usize;
    }

    for artwork in &plan.updates {
        upsert_artwork(&mut transaction, artwork, true).await?;
    }
    for artwork in &plan.inserts {
        upsert_artwork(&mut transaction, artwork, false).await?;
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossible de finaliser l’import Art : {error}"))?;
    Ok(CollectionImportResult {
        inserted: plan.inserts.len(),
        updated: plan.updates.len(),
        removed,
    })
}

fn validate_import_book_quotes(book: &ImportBook) -> Result<(), String> {
    if book.quotes.iter().any(|quote| quote.book_id != book.id) {
        return Err(format!(
            "Une citation ne correspond pas au livre « {} ».",
            book.title
        ));
    }
    Ok(())
}

fn validate_plan_profile<'a>(
    profile_id: &str,
    mut item_profiles: impl Iterator<Item = &'a str>,
) -> Result<(), String> {
    if profile_id.trim().is_empty() {
        return Err("Le profil cible de l’import est invalide.".to_string());
    }
    if item_profiles.any(|id| id != profile_id) {
        return Err("Un élément de l’import ne cible pas le profil courant.".to_string());
    }
    Ok(())
}

async fn upsert_film(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    film: &ImportFilm,
    is_update: bool,
) -> Result<(), String> {
    let original_title = canonical_optional_text(&film.original_title);
    let watched_at = canonical_optional_text(&film.watched_at);
    let personal_note = canonical_optional_text(&film.personal_note);
    let director = canonical_optional_text(&film.director);
    let summary = canonical_optional_text(&film.summary);
    let poster_url = canonical_optional_text(&film.poster_url);
    let (provider_name, provider_id) = canonical_provenance(&film.provider_name, &film.provider_id);

    let result = if is_update {
        sqlx::query(
            "UPDATE films SET
                title = $3, original_title = $4, year = $5, status = $6, is_favorite = $7,
                rating = $8, watched_at = $9, personal_note = $10, director = $11, summary = $12,
                provider_name = $13, provider_id = $14, poster_url = $15, updated_at = $16
             WHERE id = $1 AND profile_id = $2",
        )
        .bind(&film.id)
        .bind(&film.profile_id)
        .bind(&film.title)
        .bind(original_title)
        .bind(film.year)
        .bind(&film.status)
        .bind(if film.is_favorite { 1 } else { 0 })
        .bind(film.rating)
        .bind(watched_at)
        .bind(personal_note)
        .bind(director)
        .bind(summary)
        .bind(provider_name)
        .bind(provider_id)
        .bind(poster_url)
        .bind(&film.updated_at)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible de mettre à jour le film « {} » : {error}",
                film.title
            )
        })?
    } else {
        sqlx::query(
            "INSERT INTO films (
                id, profile_id, title, original_title, year, status, is_favorite, rating,
                watched_at, personal_note, director, summary, provider_name, provider_id,
                poster_url, created_at, updated_at
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
             )",
        )
        .bind(&film.id)
        .bind(&film.profile_id)
        .bind(&film.title)
        .bind(original_title)
        .bind(film.year)
        .bind(&film.status)
        .bind(if film.is_favorite { 1 } else { 0 })
        .bind(film.rating)
        .bind(watched_at)
        .bind(personal_note)
        .bind(director)
        .bind(summary)
        .bind(provider_name)
        .bind(provider_id)
        .bind(poster_url)
        .bind(&film.created_at)
        .bind(&film.updated_at)
        .execute(&mut **transaction)
        .await
        .map_err(|error| format!("Impossible d’importer le film « {} » : {error}", film.title))?
    };

    if result.rows_affected() != 1 {
        return Err(format!(
            "L’écriture du film « {} » n’a modifié aucune ligne SQLite.",
            film.title
        ));
    }

    Ok(())
}

async fn upsert_series(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    series: &ImportSeries,
    is_update: bool,
) -> Result<(), String> {
    let showrunner = canonical_optional_text(&series.showrunner);
    let casting = canonical_optional_text(&series.casting);
    let summary = canonical_optional_text(&series.summary);
    let progress_updated_at = canonical_optional_text(&series.progress_updated_at);
    let started_at = canonical_optional_text(&series.started_at);
    let poster_url = canonical_optional_text(&series.poster_url);
    let personal_note = canonical_optional_text(&series.personal_note);

    let result = if is_update {
        sqlx::query(
            "UPDATE series SET
                title = $3, showrunner = $4, casting = $5, summary = $6, category = $7,
                status = $8, rating = $9, is_favorite = $10, seasons_seen = $11,
                seasons_total = $12, progress_updated_at = $13, started_at = $14,
                poster_url = $15, personal_note = $16, updated_at = $17
             WHERE id = $1 AND profile_id = $2",
        )
        .bind(&series.id)
        .bind(&series.profile_id)
        .bind(&series.title)
        .bind(showrunner)
        .bind(casting)
        .bind(summary)
        .bind(TELEVISION_SERIES_CATEGORY)
        .bind(&series.status)
        .bind(series.rating)
        .bind(if series.is_favorite { 1 } else { 0 })
        .bind(series.seasons_seen)
        .bind(series.seasons_total)
        .bind(progress_updated_at)
        .bind(started_at)
        .bind(poster_url)
        .bind(personal_note)
        .bind(&series.updated_at)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible de mettre à jour la série « {} » : {error}",
                series.title
            )
        })?
    } else {
        sqlx::query(
            "INSERT INTO series (
                id, profile_id, title, showrunner, casting, summary, category, status, rating,
                is_favorite, seasons_seen, seasons_total, progress_updated_at, started_at,
                poster_url, personal_note, created_at, updated_at
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
             )",
        )
        .bind(&series.id)
        .bind(&series.profile_id)
        .bind(&series.title)
        .bind(showrunner)
        .bind(casting)
        .bind(summary)
        .bind(TELEVISION_SERIES_CATEGORY)
        .bind(&series.status)
        .bind(series.rating)
        .bind(if series.is_favorite { 1 } else { 0 })
        .bind(series.seasons_seen)
        .bind(series.seasons_total)
        .bind(progress_updated_at)
        .bind(started_at)
        .bind(poster_url)
        .bind(personal_note)
        .bind(&series.created_at)
        .bind(&series.updated_at)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible d’importer la série « {} » : {error}",
                series.title
            )
        })?
    };

    if result.rows_affected() != 1 {
        return Err(format!(
            "L’écriture de la série « {} » n’a modifié aucune ligne SQLite.",
            series.title
        ));
    }

    Ok(())
}

async fn upsert_anime(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    anime: &AnimeRecord<'_>,
    is_update: bool,
) -> Result<(), String> {
    if !is_update {
        return insert_anime_row(transaction, anime).await;
    }

    let result = sqlx::query(
        "UPDATE anime SET
            title = $3, showrunner = $4, casting = $5, summary = $6, status = $7,
            rating = $8, is_favorite = $9, seasons_seen = $10, seasons_total = $11,
            progress_updated_at = $12, started_at = $13, poster_url = $14,
            personal_note = $15, updated_at = $16
         WHERE id = $1 AND profile_id = $2",
    )
    .bind(anime.id)
    .bind(anime.profile_id)
    .bind(anime.title)
    .bind(anime.showrunner)
    .bind(anime.casting)
    .bind(anime.summary)
    .bind(anime.status)
    .bind(anime.rating)
    .bind(if anime.is_favorite { 1 } else { 0 })
    .bind(anime.seasons_seen)
    .bind(anime.seasons_total)
    .bind(anime.progress_updated_at)
    .bind(anime.started_at)
    .bind(anime.poster_url)
    .bind(anime.personal_note)
    .bind(anime.updated_at)
    .execute(&mut **transaction)
    .await
    .map_err(|error| {
        format!(
            "Impossible de mettre à jour l’animation « {} » : {error}",
            anime.title
        )
    })?;

    if result.rows_affected() != 1 {
        return Err(format!(
            "L’écriture de l’animation « {} » n’a modifié aucune ligne SQLite.",
            anime.title
        ));
    }

    Ok(())
}

async fn upsert_book(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    book: &ImportBook,
    is_update: bool,
) -> Result<(), String> {
    let author = canonical_optional_text(&book.author);
    let summary = canonical_optional_text(&book.summary);
    let progress_updated_at = canonical_optional_text(&book.progress_updated_at);
    let started_at = canonical_optional_text(&book.started_at);
    let cover_url = canonical_optional_text(&book.cover_url);
    let personal_note = canonical_optional_text(&book.personal_note);

    let result = if is_update {
        sqlx::query(
            "UPDATE books SET
                title = $3, author = $4, year = $5, summary = $6, category = $7,
                status = $8, rating = $9, is_favorite = $10, volumes_read = $11,
                volumes_total = $12, progress_updated_at = $13, started_at = $14,
                cover_url = $15, personal_note = $16, updated_at = $17
             WHERE id = $1 AND profile_id = $2",
        )
        .bind(&book.id)
        .bind(&book.profile_id)
        .bind(&book.title)
        .bind(author)
        .bind(book.year)
        .bind(summary)
        .bind(&book.category)
        .bind(&book.status)
        .bind(book.rating)
        .bind(if book.is_favorite { 1 } else { 0 })
        .bind(book.volumes_read)
        .bind(book.volumes_total)
        .bind(progress_updated_at)
        .bind(started_at)
        .bind(cover_url)
        .bind(personal_note)
        .bind(&book.updated_at)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible de mettre à jour le livre « {} » : {error}",
                book.title
            )
        })?
    } else {
        sqlx::query(
            "INSERT INTO books (
                id, profile_id, title, author, year, summary, category, status, rating,
                is_favorite, volumes_read, volumes_total, progress_updated_at, started_at,
                cover_url, personal_note, created_at, updated_at
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
             )",
        )
        .bind(&book.id)
        .bind(&book.profile_id)
        .bind(&book.title)
        .bind(author)
        .bind(book.year)
        .bind(summary)
        .bind(&book.category)
        .bind(&book.status)
        .bind(book.rating)
        .bind(if book.is_favorite { 1 } else { 0 })
        .bind(book.volumes_read)
        .bind(book.volumes_total)
        .bind(progress_updated_at)
        .bind(started_at)
        .bind(cover_url)
        .bind(personal_note)
        .bind(&book.created_at)
        .bind(&book.updated_at)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible d’importer le livre « {} » : {error}",
                book.title
            )
        })?
    };

    if result.rows_affected() != 1 {
        return Err(format!(
            "L’écriture du livre « {} » n’a modifié aucune ligne SQLite.",
            book.title
        ));
    }

    if is_update {
        sqlx::query("DELETE FROM book_quotes WHERE book_id = $1")
            .bind(&book.id)
            .execute(&mut **transaction)
            .await
            .map_err(|error| {
                format!(
                    "Impossible de remplacer les citations du livre « {} » : {error}",
                    book.title
                )
            })?;
    }

    for quote in &book.quotes {
        sqlx::query(
            "INSERT INTO book_quotes (id, book_id, body, position, created_at)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(&quote.id)
        .bind(&quote.book_id)
        .bind(&quote.body)
        .bind(quote.position)
        .bind(&quote.created_at)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible d’importer une citation du livre « {} » : {error}",
                book.title
            )
        })?;
    }

    Ok(())
}

async fn upsert_manga(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    manga: &MangaRecord<'_>,
    is_update: bool,
) -> Result<(), String> {
    if !is_update {
        return insert_manga_row(transaction, manga).await;
    }

    let result = sqlx::query(
        "UPDATE mangas SET
            title = $3, author = $4, year = $5, summary = $6, status = $7,
            rating = $8, is_favorite = $9, volumes_read = $10, volumes_total = $11,
            progress_updated_at = $12, started_at = $13, cover_url = $14,
            personal_note = $15, updated_at = $16
         WHERE id = $1 AND profile_id = $2",
    )
    .bind(manga.id)
    .bind(manga.profile_id)
    .bind(manga.title)
    .bind(manga.author)
    .bind(manga.year)
    .bind(manga.summary)
    .bind(manga.status)
    .bind(manga.rating)
    .bind(if manga.is_favorite { 1 } else { 0 })
    .bind(manga.volumes_read)
    .bind(manga.volumes_total)
    .bind(manga.progress_updated_at)
    .bind(manga.started_at)
    .bind(manga.cover_url)
    .bind(manga.personal_note)
    .bind(manga.updated_at)
    .execute(&mut **transaction)
    .await
    .map_err(|error| {
        format!(
            "Impossible de mettre à jour le manga « {} » : {error}",
            manga.title
        )
    })?;

    if result.rows_affected() != 1 {
        return Err(format!(
            "L’écriture du manga « {} » n’a modifié aucune ligne SQLite.",
            manga.title
        ));
    }

    sqlx::query("DELETE FROM manga_quotes WHERE manga_id = $1")
        .bind(manga.id)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible de remplacer les citations du manga « {} » : {error}",
                manga.title
            )
        })?;

    insert_manga_quotes(transaction, manga.id, manga.title, manga.quotes).await
}

async fn upsert_game(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    game: &ImportGame,
    is_update: bool,
) -> Result<(), String> {
    let developer = canonical_optional_text(&game.developer);
    let platform = canonical_optional_text(&game.platform);
    let played_at = canonical_optional_text(&game.played_at);
    let cover_url = canonical_optional_text(&game.cover_url);
    let personal_note = canonical_optional_text(&game.personal_note);
    let result = if is_update {
        sqlx::query(
            "UPDATE games SET
                title = $3, developer = $4, platform = $5, year = $6, status = $7,
                rating = $8, is_favorite = $9, played_at = $10, cover_url = $11,
                personal_note = $12, updated_at = $13
             WHERE id = $1 AND profile_id = $2",
        )
        .bind(&game.id)
        .bind(&game.profile_id)
        .bind(&game.title)
        .bind(developer)
        .bind(platform)
        .bind(game.year)
        .bind(&game.status)
        .bind(game.rating)
        .bind(if game.is_favorite { 1 } else { 0 })
        .bind(played_at)
        .bind(cover_url)
        .bind(personal_note)
        .bind(&game.updated_at)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible de mettre à jour le jeu « {} » : {error}",
                game.title
            )
        })?
    } else {
        sqlx::query(
            "INSERT INTO games (
                id, profile_id, title, developer, platform, year, status, rating, is_favorite,
                played_at, cover_url, personal_note, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
        )
        .bind(&game.id)
        .bind(&game.profile_id)
        .bind(&game.title)
        .bind(developer)
        .bind(platform)
        .bind(game.year)
        .bind(&game.status)
        .bind(game.rating)
        .bind(if game.is_favorite { 1 } else { 0 })
        .bind(played_at)
        .bind(cover_url)
        .bind(personal_note)
        .bind(&game.created_at)
        .bind(&game.updated_at)
        .execute(&mut **transaction)
        .await
        .map_err(|error| format!("Impossible d’importer le jeu « {} » : {error}", game.title))?
    };

    if result.rows_affected() != 1 {
        return Err(format!(
            "L’écriture du jeu « {} » n’a modifié aucune ligne SQLite.",
            game.title
        ));
    }
    Ok(())
}

async fn upsert_artwork(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    artwork: &ImportArtwork,
    is_update: bool,
) -> Result<(), String> {
    let artist = canonical_optional_text(&artwork.artist);
    let location = canonical_optional_text(&artwork.location);
    let exhibition = canonical_optional_text(&artwork.exhibition);
    let discovered_at = canonical_optional_text(&artwork.discovered_at);
    let image_url = canonical_optional_text(&artwork.image_url);
    let personal_note = canonical_optional_text(&artwork.personal_note);
    let custom_fields = serde_json::to_string(&artwork.custom_fields)
        .map_err(|error| format!("Impossible de conserver les champs de l’œuvre : {error}"))?;
    let result = if is_update {
        sqlx::query(
            "UPDATE artworks SET
                title = $3, artist = $4, year = $5, form = $6, location = $7,
                exhibition = $8, status = $9, is_favorite = $10, discovered_at = $11,
                image_url = $12, personal_note = $13, updated_at = $14, custom_fields = $15
             WHERE id = $1 AND profile_id = $2",
        )
        .bind(&artwork.id)
        .bind(&artwork.profile_id)
        .bind(&artwork.title)
        .bind(artist)
        .bind(artwork.year)
        .bind(&artwork.form)
        .bind(location)
        .bind(exhibition)
        .bind(&artwork.status)
        .bind(if artwork.is_favorite { 1 } else { 0 })
        .bind(discovered_at)
        .bind(image_url)
        .bind(personal_note)
        .bind(&artwork.updated_at)
        .bind(&custom_fields)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible de mettre à jour l’œuvre « {} » : {error}",
                artwork.title
            )
        })?
    } else {
        sqlx::query(
            "INSERT INTO artworks (
                id, profile_id, title, artist, year, form, location, exhibition, status,
                is_favorite, discovered_at, image_url, personal_note, created_at, updated_at, custom_fields
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
        )
        .bind(&artwork.id)
        .bind(&artwork.profile_id)
        .bind(&artwork.title)
        .bind(artist)
        .bind(artwork.year)
        .bind(&artwork.form)
        .bind(location)
        .bind(exhibition)
        .bind(&artwork.status)
        .bind(if artwork.is_favorite { 1 } else { 0 })
        .bind(discovered_at)
        .bind(image_url)
        .bind(personal_note)
        .bind(&artwork.created_at)
        .bind(&artwork.updated_at)
        .bind(&custom_fields)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible d’importer l’œuvre « {} » : {error}",
                artwork.title
            )
        })?
    };

    if result.rows_affected() != 1 {
        return Err(format!(
            "L’écriture de l’œuvre « {} » n’a modifié aucune ligne SQLite.",
            artwork.title
        ));
    }
    Ok(())
}

#[cfg(test)]
#[path = "localization_tests.rs"]
mod localization_tests;

#[cfg(test)]
#[path = "custom_libraries_tests.rs"]
mod custom_libraries_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    include!("portability_io_tests.rs");
    include!("backup_destination_tests.rs");
    include!("backup_retention_tests.rs");

    type CanonicalFilmRow = (
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        i64,
        f64,
    );

    async fn test_pool() -> sqlx::SqlitePool {
        let pool = legacy_test_pool().await;
        sqlx::raw_sql(include_str!(
            "../migrations/0007_normalize_film_optional_data.sql"
        ))
        .execute(&pool)
        .await
        .expect("migration de normalisation de test");
        pool
    }

    async fn legacy_test_pool() -> sqlx::SqlitePool {
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

    async fn insert_profile(pool: &sqlx::SqlitePool, id: &str) {
        sqlx::query(
            "INSERT INTO profiles (id, name, created_at, updated_at)
             VALUES ($1, $2, '2026-07-17T10:00:00.000Z', '2026-07-17T10:00:00.000Z')",
        )
        .bind(id)
        .bind(format!("Profil {id}"))
        .execute(pool)
        .await
        .expect("profil de test");
    }

    fn temporary_directory(label: &str) -> PathBuf {
        let sequence = snapshot_sequence().expect("horloge de test");
        let directory = std::env::temp_dir().join(format!(
            "sylloge-backup-{label}-{}-{sequence}",
            std::process::id()
        ));
        fs::create_dir(&directory).expect("dossier temporaire de test");
        directory
    }

    #[test]
    fn backup_settings_migration_persists_configuration_per_profile() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let directory = temporary_directory("migration");
            let directory_text = fs::canonicalize(&directory)
                .expect("chemin canonique du dossier")
                .to_string_lossy()
                .into_owned();

            assert_eq!(
                read_backup_settings(&pool, "default")
                    .await
                    .expect("lecture initiale"),
                None,
                "aucun réglage ne doit exister avant le choix explicite d’un dossier"
            );
            configure_backup_directory(&pool, "default", &directory)
                .await
                .expect("enregistrement du dossier");
            let settings = read_backup_settings(&pool, "default")
                .await
                .expect("lecture du réglage")
                .expect("réglage enregistré");
            assert_eq!(settings.backup_directory, directory_text);
            assert_eq!(settings.last_automatic_snapshot_day, None);
            assert!(settings.directory_available);

            fs::remove_dir_all(&directory).expect("suppression externe du dossier temporaire");
            let stale_settings = read_backup_settings(&pool, "default")
                .await
                .expect("lecture du réglage devenu inaccessible")
                .expect("le chemin reste mémorisé tant que l’utilisateur ne le désactive pas");
            assert!(
                !stale_settings.directory_available,
                "un dossier supprimé hors de Sylloge ne doit pas rester annoncé comme disponible"
            );
        });
    }

    #[test]
    fn clearing_backup_configuration_forgets_the_path_but_keeps_existing_files() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let directory = temporary_directory("clear-setting");
            configure_backup_directory(&pool, "default", &directory)
                .await
                .expect("réglage initial");
            let file_name = "sylloge-snapshot-existing.json";
            fs::write(directory.join(file_name), "{}\n").expect("snapshot existant");
            sqlx::query(
                "INSERT INTO backup_snapshots (profile_id, file_name, created_at)
                 VALUES ('default', $1, '2026-07-22T10:00:00.000Z')",
            )
            .bind(file_name)
            .execute(&pool)
            .await
            .expect("registre de snapshot");

            clear_backup_configuration(&pool, "default")
                .await
                .expect("désactivation des snapshots");

            assert_eq!(
                read_backup_settings(&pool, "default")
                    .await
                    .expect("lecture après désactivation"),
                None
            );
            let registered_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM backup_snapshots WHERE profile_id = 'default'",
            )
            .fetch_one(&pool)
            .await
            .expect("comptage du registre");
            assert_eq!(
                registered_count, 0,
                "le registre lié à l’ancien dossier doit être oublié"
            );
            assert!(
                directory.join(file_name).exists(),
                "désactiver les snapshots ne doit jamais supprimer les fichiers existants"
            );

            clear_backup_configuration(&pool, "default")
                .await
                .expect("désactivation idempotente");
            fs::remove_dir_all(directory).expect("nettoyage du dossier temporaire");
        });
    }

    #[test]
    fn normalization_migration_canonicalizes_historical_films_only() {
        tauri::async_runtime::block_on(async {
            let pool = legacy_test_pool().await;
            insert_profile(&pool, "legacy-profile").await;
            sqlx::query(
                "INSERT INTO backup_settings (profile_id, backup_directory)
                 VALUES ('legacy-profile', '/tmp/legacy-backup')",
            )
            .execute(&pool)
            .await
            .expect("réglage hors Films de test");
            sqlx::query(
                "INSERT INTO films (
                    id, profile_id, title, original_title, year, status, is_favorite, rating,
                    watched_at, personal_note, director, summary, provider_name, provider_id,
                    poster_url, created_at, updated_at
                 ) VALUES (
                    'legacy-partial', 'legacy-profile', 'Film historique', '', 1999, 'terminé', 0, 0.5,
                    '', 'Texte  historique  préservé.', '', '', 'Source partielle', '', '',
                    '2026-07-17T10:00:00.000Z', '2026-07-17T10:00:00.000Z'
                 )",
            )
            .execute(&pool)
            .await
            .expect("film historique partiel");
            sqlx::query(
                "INSERT INTO films (
                    id, profile_id, title, status, is_favorite, provider_name, provider_id, created_at, updated_at
                 ) VALUES (
                    'legacy-complete', 'legacy-profile', 'Film complet', 'à découvrir', 1,
                    'Source complète', 'id-complet', '2026-07-17T10:00:00.000Z', '2026-07-17T10:00:00.000Z'
                 )",
            )
            .execute(&pool)
            .await
            .expect("film historique complet");

            sqlx::raw_sql(include_str!(
                "../migrations/0007_normalize_film_optional_data.sql"
            ))
            .execute(&pool)
            .await
            .expect("exécution de la migration historique");

            let normalized: CanonicalFilmRow = sqlx::query_as(
                "SELECT original_title, watched_at, personal_note, director, summary, poster_url,
                        provider_name, provider_id, is_favorite, rating
                 FROM films WHERE id = 'legacy-partial'",
            )
            .fetch_one(&pool)
            .await
            .expect("relecture du Film historique normalisé");
            assert_eq!(
                normalized,
                (
                    None,
                    None,
                    Some("Texte  historique  préservé.".to_string()),
                    None,
                    None,
                    None,
                    None,
                    None,
                    0,
                    0.5,
                ),
                "la migration doit vider seulement les chaînes facultatives vides et une provenance partielle"
            );

            let complete_provenance: (Option<String>, Option<String>) = sqlx::query_as(
                "SELECT provider_name, provider_id FROM films WHERE id = 'legacy-complete'",
            )
            .fetch_one(&pool)
            .await
            .expect("relecture de la provenance complète");
            assert_eq!(
                complete_provenance,
                (
                    Some("Source complète".to_string()),
                    Some("id-complet".to_string())
                ),
                "une provenance complète doit rester intacte"
            );

            let profile_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM profiles")
                .fetch_one(&pool)
                .await
                .expect("compte profils après migration");
            let backup_directory: (String,) = sqlx::query_as(
                "SELECT backup_directory FROM backup_settings WHERE profile_id = 'legacy-profile'",
            )
            .fetch_one(&pool)
            .await
            .expect("relecture du réglage hors Films");
            assert_eq!(
                profile_count.0, 2,
                "la migration ne doit ni créer ni modifier de profil"
            );
            assert_eq!(
                backup_directory.0, "/tmp/legacy-backup",
                "la migration ne doit toucher aucune donnée hors Films"
            );
        });
    }

    #[test]
    fn write_import_canonicalizes_optional_values_before_sqlite_write() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let timestamp = "2026-07-17T13:00:00.000Z".to_string();
            let payload = ImportLibraryPayload {
                profile: ImportProfile {
                    id: "normalized-import".to_string(),
                    name: "Import normalisé".to_string(),
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                },
                films: vec![ImportFilm {
                    id: "normalized-film".to_string(),
                    profile_id: "normalized-import".to_string(),
                    title: "Film importé".to_string(),
                    original_title: Some(String::new()),
                    year: Some(2001),
                    status: "terminé".to_string(),
                    is_favorite: false,
                    rating: Some(0.5),
                    watched_at: Some(String::new()),
                    personal_note: Some("Texte  importé  préservé.".to_string()),
                    director: Some(String::new()),
                    summary: Some(String::new()),
                    provider_name: Some("Source incomplète".to_string()),
                    provider_id: Some(String::new()),
                    poster_url: Some(String::new()),
                    created_at: timestamp.clone(),
                    updated_at: timestamp,
                }],
            };

            write_import(&pool, &payload)
                .await
                .expect("import canonique");
            let stored: CanonicalFilmRow = sqlx::query_as(
                "SELECT original_title, watched_at, personal_note, director, summary, poster_url,
                        provider_name, provider_id, is_favorite, rating
                 FROM films WHERE id = 'normalized-film'",
            )
            .fetch_one(&pool)
            .await
            .expect("relecture de l’import canonique");
            assert_eq!(
                stored,
                (
                    None,
                    None,
                    Some("Texte  importé  préservé.".to_string()),
                    None,
                    None,
                    None,
                    None,
                    None,
                    0,
                    0.5,
                ),
                "le pont atomique doit écrire la forme canonique sans modifier false, 0.5 ou les espaces internes"
            );
        });
    }

    #[test]
    fn writable_directory_probe_is_cleaned_after_validation() {
        let directory = temporary_directory("write-probe");

        let validated = validate_backup_directory_writable(&directory)
            .expect("sonde d’écriture dans le dossier temporaire");
        assert_eq!(
            validated,
            fs::canonicalize(&directory).expect("chemin canonique du dossier sondé")
        );
        assert!(
            fs::read_dir(&directory)
                .expect("lecture du dossier sondé")
                .next()
                .is_none(),
            "la sonde d’écriture doit être supprimée après validation"
        );

        fs::remove_dir_all(directory).expect("nettoyage du dossier temporaire");
    }

    #[cfg(unix)]
    #[test]
    fn readable_non_writable_directory_does_not_replace_existing_setting() {
        use std::os::unix::fs::PermissionsExt;

        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let existing_directory = temporary_directory("existing-setting");
            let restricted_directory = temporary_directory("readable-non-writable");
            let existing_directory_text = fs::canonicalize(&existing_directory)
                .expect("chemin canonique du dossier initial")
                .to_string_lossy()
                .into_owned();
            configure_backup_directory(&pool, "default", &existing_directory)
                .await
                .expect("réglage initial");

            let original_permissions = fs::metadata(&restricted_directory)
                .expect("métadonnées du dossier restreint")
                .permissions();
            let mut read_only_permissions = original_permissions.clone();
            read_only_permissions.set_mode(0o500);
            fs::set_permissions(&restricted_directory, read_only_permissions)
                .expect("retrait réel du droit d’écriture");
            assert!(
                fs::read_dir(&restricted_directory).is_ok(),
                "le dossier de test doit rester lisible"
            );

            if probe_backup_directory_writable(&restricted_directory).is_err() {
                let result =
                    configure_backup_directory(&pool, "default", &restricted_directory).await;
                let settings = read_backup_settings(&pool, "default")
                    .await
                    .expect("lecture après refus")
                    .expect("réglage initial conservé");
                fs::set_permissions(&restricted_directory, original_permissions)
                    .expect("restauration des permissions");

                assert!(
                    result.is_err(),
                    "un dossier non inscriptible doit être refusé"
                );
                assert_eq!(
                    settings.backup_directory, existing_directory_text,
                    "un refus ne doit jamais modifier le réglage précédent"
                );
            } else {
                fs::set_permissions(&restricted_directory, original_permissions)
                    .expect("restauration des permissions");
            }

            fs::remove_dir_all(existing_directory).expect("nettoyage du dossier initial");
            fs::remove_dir_all(restricted_directory).expect("nettoyage du dossier restreint");
        });
    }

    #[test]
    fn snapshot_write_is_atomic_and_leaves_no_temporary_file() {
        let directory = temporary_directory("atomic");
        let file_name = snapshot_file_name("default", 1);
        let contents = "{\n  \"format\": \"sylloge-films\"\n}\n";

        write_snapshot_atomically(&directory, &file_name, contents).expect("écriture atomique");

        assert_eq!(
            fs::read_to_string(directory.join(&file_name)).expect("lecture du snapshot"),
            contents,
            "le fichier final doit contenir le document complet"
        );
        let temporary_files = fs::read_dir(&directory)
            .expect("lecture du dossier")
            .filter_map(Result::ok)
            .filter_map(|entry| entry.file_name().into_string().ok())
            .filter(|name| name.ends_with(".tmp"))
            .collect::<Vec<_>>();
        assert!(
            temporary_files.is_empty(),
            "un snapshot final ne doit laisser aucun fichier temporaire visible"
        );

        fs::remove_dir_all(directory).expect("nettoyage du dossier temporaire");
    }

    #[test]
    fn csv_export_writer_preserves_utf8_contents() {
        let directory = temporary_directory("csv-export");
        let path = directory.join("sylloge-films-2026-07-18.csv");
        let contents = "format,film_title\r\nsylloge-films-csv,Café\r\n";

        let saved_name = write_export_file(&path, contents, "sylloge-films.csv")
            .expect("écriture de l’export CSV");

        assert_eq!(saved_name, "sylloge-films-2026-07-18.csv");
        assert_eq!(
            fs::read_to_string(&path).expect("lecture de l’export CSV"),
            contents,
            "le pont natif doit écrire les octets UTF-8 fournis sans les transformer"
        );

        fs::remove_dir_all(directory).expect("nettoyage du dossier temporaire");
    }

    fn notion_zip_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut cursor);
            for (name, contents) in entries {
                writer
                    .start_file(name, zip::write::SimpleFileOptions::default())
                    .expect("entrée ZIP de test");
                writer.write_all(contents).expect("contenu ZIP de test");
            }
            writer.finish().expect("finalisation ZIP de test");
        }
        cursor.into_inner()
    }

    fn notion_zip(entries: &[(&str, &str)]) -> Vec<u8> {
        let byte_entries = entries
            .iter()
            .map(|(name, contents)| (*name, contents.as_bytes()))
            .collect::<Vec<_>>();
        notion_zip_bytes(&byte_entries)
    }

    fn mark_first_zip_entry_as_encrypted(mut archive: Vec<u8>) -> Vec<u8> {
        let mut marked_headers = 0;
        for index in 0..archive.len().saturating_sub(4) {
            let flag_offset = match &archive[index..index + 4] {
                b"PK\x03\x04" => Some(index + 6),
                b"PK\x01\x02" => Some(index + 8),
                _ => None,
            };
            if let Some(flag_offset) = flag_offset {
                let flags =
                    u16::from_le_bytes([archive[flag_offset], archive[flag_offset + 1]]) | 1;
                archive[flag_offset..flag_offset + 2].copy_from_slice(&flags.to_le_bytes());
                marked_headers += 1;
            }
        }
        assert_eq!(
            marked_headers, 2,
            "la fixture doit contenir une seule entrée ZIP"
        );
        archive
    }

    #[test]
    fn notion_zip_reader_reads_nested_csv_and_markdown_in_memory() {
        let archive = notion_zip(&[
            (
                "Export Notion/Films/Films.csv",
                "Name,Rating\nLe Passage,4/5\n",
            ),
            (
                "Export Notion/Films/Le Passage.md",
                "# Le Passage\n\n### Notes :\n\nNote liée.\n",
            ),
        ]);

        let picked = extract_notion_zip("export-notion.zip", &archive)
            .expect("lecture ZIP Notion imbriquée");

        assert_eq!(picked.name, "export-notion.zip");
        assert_eq!(picked.kind, "notion");
        assert_eq!(picked.csv_candidates.len(), 1);
        assert_eq!(
            picked.csv_candidates[0].name,
            "Export Notion/Films/Films.csv"
        );
        assert_eq!(
            picked.csv_candidates[0].contents,
            "Name,Rating\nLe Passage,4/5\n"
        );
        assert_eq!(picked.markdown_pages.len(), 1);
        assert_eq!(
            picked.markdown_pages[0].name,
            "Export Notion/Films/Le Passage.md"
        );
        assert_eq!(
            picked.markdown_pages[0].contents,
            "# Le Passage\n\n### Notes :\n\nNote liée.\n"
        );
    }

    #[test]
    fn notion_zip_reader_reads_csv_and_markdown_from_a_nested_zip_part() {
        let zip_part = notion_zip(&[
            ("Films/Films.csv", "Name,Rating\nLe Passage,4/5\n"),
            (
                "Films/Le Passage.md",
                "# Le Passage\n\n### Notes :\n\nNote liée.\n",
            ),
        ]);
        let outer_archive = notion_zip_bytes(&[("Export Notion part 1.zip", zip_part.as_slice())]);

        let picked = extract_notion_zip("export-notion.zip", &outer_archive)
            .expect("lecture d’un ZIP Notion contenant une archive part");

        assert_eq!(picked.csv_candidates.len(), 1);
        assert_eq!(picked.csv_candidates[0].id, "csv-0");
        assert_eq!(
            picked.csv_candidates[0].name,
            "Export Notion part 1.zip!/Films/Films.csv"
        );
        assert_eq!(
            picked.csv_candidates[0].contents,
            "Name,Rating\nLe Passage,4/5\n"
        );
        assert_eq!(picked.markdown_pages.len(), 1);
        assert_eq!(
            picked.markdown_pages[0].name,
            "Export Notion part 1.zip!/Films/Le Passage.md"
        );
        assert_eq!(
            picked.markdown_pages[0].contents,
            "# Le Passage\n\n### Notes :\n\nNote liée.\n"
        );
    }

    #[test]
    fn notion_zip_reader_counts_entries_across_nested_zip_parts() {
        let entry_names = (0..MAX_ZIP_CONTAINER_ENTRIES / 2)
            .map(|index| format!("pages/{index}.md"))
            .collect::<Vec<_>>();
        let zip_part_entries = entry_names
            .iter()
            .map(|name| (name.as_str(), b"".as_slice()))
            .collect::<Vec<_>>();
        let zip_part = notion_zip_bytes(&zip_part_entries);
        let outer_archive = notion_zip_bytes(&[
            ("Export Notion part 1.zip", zip_part.as_slice()),
            ("Export Notion part 2.zip", zip_part.as_slice()),
        ]);

        let result = extract_notion_zip("trop-d-entrees.zip", &outer_archive);

        assert!(
            matches!(result, Err(message) if message.contains("512 entrées")),
            "le nombre d’entrées doit être limité sur l’ensemble des archives imbriquées"
        );
    }

    #[test]
    fn notion_zip_reader_rejects_excessive_zip_nesting() {
        let mut archive = notion_zip(&[("Films.csv", "Name\nLe Passage\n")]);
        for _ in 0..=MAX_ZIP_NESTING_DEPTH {
            archive = notion_zip_bytes(&[("Export Notion part.zip", archive.as_slice())]);
        }

        let result = extract_notion_zip("trop-imbrique.zip", &archive);

        assert!(
            matches!(result, Err(message) if message.contains("4 archives ZIP imbriquées")),
            "la profondeur des archives ZIP imbriquées doit être explicitement limitée"
        );
    }

    #[test]
    fn notion_zip_reader_keeps_multiple_csv_candidates() {
        let archive = notion_zip(&[
            (
                "Export Notion/Films/Films.csv",
                "Name,Status\nLe Passage,Watched\n",
            ),
            (
                "Export Notion/Films/Films_all.csv",
                "Name,Status,Rating,Vu le\nLe Passage,Watched,8 (Excellent),18 juillet 2024\n",
            ),
        ]);

        let picked = extract_notion_zip("export-notion.zip", &archive)
            .expect("lecture d’un ZIP Notion avec plusieurs tables CSV");

        assert_eq!(picked.csv_candidates.len(), 2);
        assert_eq!(
            picked.csv_candidates[0].name,
            "Export Notion/Films/Films.csv"
        );
        assert_eq!(
            picked.csv_candidates[1].name,
            "Export Notion/Films/Films_all.csv"
        );
        assert_eq!(
            picked.csv_candidates[1].contents,
            "Name,Status,Rating,Vu le\nLe Passage,Watched,8 (Excellent),18 juillet 2024\n"
        );
    }

    #[test]
    fn generic_zip_container_lists_json_and_csv_candidates_without_extraction() {
        let archive = notion_zip(&[
            ("exports/films.json", "{\"format\":\"sylloge-library\"}"),
            ("exports/livres.csv", "title,author\nLe Nom,Autrice\n"),
            ("assets/cover.png", "fichier étranger ignoré"),
            (
                "exports/Films/Le Nom.md",
                "# Le Nom\n\n### Notes :\n\nNote liée.\n",
            ),
        ]);

        let picked = inspect_zip_container("bibliotheque.zip", &archive)
            .expect("inspection générique du ZIP");

        assert_eq!(picked.kind, "container");
        assert_eq!(picked.container_candidates.len(), 2);
        assert_eq!(picked.container_candidates[0].name, "exports/films.json");
        assert_eq!(picked.container_candidates[0].kind, "json");
        assert_eq!(picked.container_candidates[1].name, "exports/livres.csv");
        assert_eq!(picked.container_candidates[1].kind, "csv");
        assert_eq!(picked.markdown_pages.len(), 1);
        assert_eq!(
            picked.markdown_pages[0].name, "exports/Films/Le Nom.md",
            "les pages Markdown historiques restent disponibles seulement pour le flux Film"
        );
    }

    #[test]
    fn generic_zip_container_keeps_candidates_from_nested_zip_parts() {
        let nested = notion_zip(&[("exports/art.csv", "title,form\nAube,peinture\n")]);
        let archive = notion_zip_bytes(&[("partie-1.zip", nested.as_slice())]);

        let picked = inspect_zip_container("bibliotheque.zip", &archive)
            .expect("inspection du ZIP imbriqué");

        assert_eq!(picked.container_candidates.len(), 1);
        assert_eq!(
            picked.container_candidates[0].name,
            "partie-1.zip!/exports/art.csv"
        );
        assert_eq!(
            picked.container_candidates[0].contents,
            "title,form\nAube,peinture\n"
        );
    }

    #[test]
    fn generic_container_without_json_or_csv_is_refused_before_import() {
        let archive = notion_zip(&[("assets/cover.png", "fichier étranger")]);

        let result = inspect_zip_container("sans-donnees.zip", &archive);

        assert!(
            matches!(result, Err(message) if message.contains("aucun fichier JSON ou CSV")),
            "un conteneur sans candidat ne doit pas ouvrir de parcours d’import"
        );
    }

    #[test]
    fn directory_container_lists_nested_json_and_csv_candidates() {
        let directory = temporary_directory("container-directory");
        let nested = directory.join("exports/2026");
        fs::create_dir_all(&nested).expect("création du dossier imbriqué");
        fs::write(
            nested.join("series.json"),
            "{\"format\":\"sylloge-library\"}",
        )
        .expect("fixture JSON");
        fs::write(nested.join("games.csv"), "title,platform\nJeu,PC\n").expect("fixture CSV");
        fs::write(directory.join("ignore.txt"), "fichier étranger").expect("fixture étrangère");

        let picked = inspect_directory_container(&directory).expect("inspection du dossier");

        assert_eq!(picked.kind, "container");
        assert_eq!(picked.container_candidates.len(), 2);
        assert_eq!(
            picked.container_candidates[0].name,
            "exports/2026/games.csv"
        );
        assert_eq!(
            picked.container_candidates[1].name,
            "exports/2026/series.json"
        );
        fs::remove_dir_all(directory).expect("nettoyage du dossier temporaire");
    }

    #[cfg(unix)]
    #[test]
    fn directory_container_rejects_symbolic_links_without_following_them() {
        use std::os::unix::fs::symlink;

        let directory = temporary_directory("container-symlink");
        let external_file = temporary_directory("container-external").join("films.csv");
        fs::write(&external_file, "title\nHors périmètre\n").expect("fixture externe");
        symlink(&external_file, directory.join("films.csv")).expect("lien symbolique de test");

        let result = inspect_directory_container(&directory);

        assert!(
            matches!(result, Err(message) if message.contains("lien symbolique")),
            "un dossier ne doit jamais suivre un lien symbolique"
        );
        let external_directory = external_file
            .parent()
            .expect("dossier externe")
            .to_path_buf();
        fs::remove_dir_all(directory).expect("nettoyage du dossier temporaire");
        fs::remove_dir_all(external_directory).expect("nettoyage de la fixture externe");
    }

    #[test]
    fn notion_zip_reader_rejects_invalid_and_oversized_archives() {
        let invalid = extract_notion_zip("invalide.zip", b"ce fichier n'est pas une archive ZIP");
        assert!(
            invalid.is_err(),
            "une archive invalide doit produire une erreur récupérable"
        );

        let oversized = vec![0_u8; MAX_IMPORT_FILE_BYTES as usize + 1];
        let too_large = extract_notion_zip("trop-grand.zip", &oversized);
        assert!(
            too_large.is_err(),
            "une archive hors limite doit être refusée avant analyse"
        );

        let without_csv = extract_notion_zip(
            "sans-csv.zip",
            &notion_zip(&[("Export Notion/Films/Une page.md", "# Une page\n")]),
        );
        assert!(
            matches!(without_csv, Err(message) if message.contains("aucun CSV")),
            "le refus d’une archive sans CSV doit expliquer la cause"
        );
    }

    #[test]
    fn notion_zip_reader_rejects_excessive_path_depth() {
        let archive = notion_zip(&[("a/b/c/d/e/f/g/h/i/Films.csv", "Name\nTrop profond\n")]);
        let result = extract_notion_zip("profondeur.zip", &archive);

        assert!(
            result.is_err(),
            "une archive avec trop de niveaux doit être refusée"
        );
    }

    #[test]
    fn notion_zip_reader_rejects_unsafe_encrypted_and_symbolic_link_entries() {
        let unsafe_path = extract_notion_zip(
            "chemin-non-sur.zip",
            &notion_zip(&[("../hors-scope.csv", "Name\nHors scope\n")]),
        );
        assert!(
            matches!(unsafe_path, Err(message) if message.contains("chemin de fichier non sûr")),
            "une traversée de répertoire doit être refusée avant lecture"
        );
        let windows_path = extract_notion_zip(
            "volume-windows.zip",
            &notion_zip(&[("C:\\imports\\Films.csv", "Name\nHors scope\n")]),
        );
        assert!(
            matches!(windows_path, Err(message) if message.contains("chemin de fichier non sûr")),
            "un préfixe de volume Windows doit être refusé avant lecture"
        );

        let encrypted_error = match extract_notion_zip(
            "chiffre.zip",
            &mark_first_zip_entry_as_encrypted(notion_zip(&[("Films.csv", "Name\nChiffré\n")])),
        ) {
            Err(error) => error,
            Ok(_) => panic!("une entrée chiffrée doit être refusée"),
        };
        assert!(
            encrypted_error.contains("chiffrées"),
            "une entrée ZIP marquée comme chiffrée doit être refusée explicitement : {encrypted_error}"
        );

        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut cursor);
            writer
                .add_symlink(
                    "Films.csv",
                    "../hors-scope.csv",
                    zip::write::SimpleFileOptions::default(),
                )
                .expect("lien symbolique ZIP de test");
            writer
                .finish()
                .expect("finalisation du lien symbolique ZIP de test");
        }
        let symbolic_link = extract_notion_zip("lien-symbolique.zip", &cursor.into_inner());
        assert!(
            matches!(symbolic_link, Err(message) if message.contains("lien symbolique")),
            "un lien symbolique ZIP doit être refusé sans suivre sa cible"
        );
    }

    #[test]
    fn retention_uses_registered_ownership_and_isolates_profiles() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_profile(&pool, "second-profile").await;
            let directory = temporary_directory("retention");

            let foreign_file_name = snapshot_file_name("default", 99);
            let foreign_file = directory.join(&foreign_file_name);
            fs::write(&foreign_file, "ne pas supprimer")
                .expect("fichier étranger au nom strictement identique");

            let mut default_files = Vec::new();
            for sequence in 0..31 {
                let file_name = snapshot_file_name("default", sequence);
                write_snapshot_atomically(&directory, &file_name, "{}").expect("snapshot default");
                register_backup_snapshot(&pool, "default", &file_name)
                    .await
                    .expect("registre default");
                default_files.push(file_name);
            }
            let missing_file_name = snapshot_file_name("default", 100);
            register_backup_snapshot(&pool, "default", &missing_file_name)
                .await
                .expect("registre de fichier absent");

            let mut second_profile_files = Vec::new();
            for sequence in 0..31 {
                let file_name = snapshot_file_name("second-profile", sequence);
                write_snapshot_atomically(&directory, &file_name, "{}")
                    .expect("snapshot second profil");
                register_backup_snapshot(&pool, "second-profile", &file_name)
                    .await
                    .expect("registre second profil");
                second_profile_files.push(file_name);
            }

            let retained = apply_snapshot_retention(&pool, &directory, "default")
                .await
                .expect("rétention enregistrée");

            assert_eq!(
                retained, 3,
                "des copies du même jour ne gardent que les trois plus récentes"
            );
            assert!(
                default_files[..28]
                    .iter()
                    .all(|file_name| !directory.join(file_name).exists()),
                "les copies suivies hors paliers doivent être retirées"
            );
            assert!(
                default_files[28..]
                    .iter()
                    .all(|file_name| directory.join(file_name).exists()),
                "les trois copies suivies les plus récentes doivent rester"
            );
            assert!(
                foreign_file.exists(),
                "un fichier étranger au même format de nom ne doit jamais être supprimé"
            );
            assert!(
                !registered_backup_snapshots(&pool, "default")
                    .await
                    .expect("registre default après rétention")
                    .iter()
                    .any(|snapshot| snapshot.file_name == missing_file_name),
                "un fichier suivi mais absent doit être retiré du registre sans bloquer"
            );
            assert_eq!(
                registered_backup_snapshots(&pool, "second-profile")
                    .await
                    .expect("registre second profil")
                    .len(),
                31,
                "le registre d’un autre profil doit rester isolé"
            );
            assert!(
                second_profile_files
                    .iter()
                    .all(|file_name| directory.join(file_name).exists()),
                "aucun snapshot suivi d’un autre profil ne doit être supprimé"
            );

            fs::remove_dir_all(directory).expect("nettoyage du dossier temporaire");
        });
    }

    #[test]
    fn failed_automatic_snapshot_does_not_mark_the_day_as_saved() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let directory = temporary_directory("failure");
            let directory_text = directory.to_string_lossy().into_owned();
            upsert_backup_directory(&pool, "default", &directory_text)
                .await
                .expect("réglage initial");
            fs::remove_dir_all(&directory).expect("rendre le dossier indisponible");

            let result = save_automatic_snapshot(&pool, "default", "{}", "2026-07-17").await;
            assert!(
                result.is_err(),
                "une écriture impossible doit remonter une erreur de sauvegarde"
            );
            let settings = read_backup_settings(&pool, "default")
                .await
                .expect("relecture du réglage")
                .expect("réglage existant");
            assert_eq!(
                settings.last_automatic_snapshot_day, None,
                "un échec ne doit jamais marquer le jour comme sauvegardé"
            );
        });
    }

    #[test]
    fn automatic_snapshot_runs_once_per_profile_and_local_day() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let directory = temporary_directory("daily");
            let directory_text = directory.to_string_lossy().into_owned();
            upsert_backup_directory(&pool, "default", &directory_text)
                .await
                .expect("réglage initial");

            let first = save_automatic_snapshot(&pool, "default", "{}", "2026-07-17")
                .await
                .expect("premier snapshot automatique");
            assert!(matches!(first, AutomaticSnapshotOutcome::Saved(_)));
            let second = save_automatic_snapshot(&pool, "default", "{}", "2026-07-17")
                .await
                .expect("second contrôle automatique");
            assert!(
                matches!(second, AutomaticSnapshotOutcome::AlreadySaved),
                "un second déclenchement le même jour doit être ignoré"
            );
            let current_files = fs::read_dir(&directory)
                .expect("lecture du dossier")
                .filter_map(Result::ok)
                .filter_map(|entry| entry.file_name().into_string().ok())
                .filter(|name| is_owned_snapshot_name(name, "default"))
                .count();
            assert_eq!(
                current_files, 1,
                "un seul fichier automatique doit être créé pour la journée"
            );
            assert_eq!(
                registered_backup_snapshots(&pool, "default")
                    .await
                    .expect("registre après snapshot automatique")
                    .len(),
                1,
                "un snapshot écrit doit être enregistré comme appartenant à ce profil"
            );

            fs::remove_dir_all(directory).expect("nettoyage du dossier temporaire");
        });
    }

    #[test]
    fn changing_backup_directory_resets_daily_snapshot_and_saves_there_same_day() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let first_directory = temporary_directory("daily-first-directory");
            let second_directory = temporary_directory("daily-second-directory");
            let second_directory_text = fs::canonicalize(&second_directory)
                .expect("chemin canonique du second dossier")
                .to_string_lossy()
                .into_owned();

            configure_backup_directory(&pool, "default", &first_directory)
                .await
                .expect("premier dossier");
            let first = save_automatic_snapshot(&pool, "default", "{}", "2026-07-17")
                .await
                .expect("premier snapshot automatique");
            assert!(matches!(first, AutomaticSnapshotOutcome::Saved(_)));

            configure_backup_directory(&pool, "default", &second_directory)
                .await
                .expect("changement de dossier");
            let settings = read_backup_settings(&pool, "default")
                .await
                .expect("lecture après changement")
                .expect("réglage existant");
            assert_eq!(settings.backup_directory, second_directory_text);
            assert_eq!(
                settings.last_automatic_snapshot_day, None,
                "un changement de dossier doit autoriser un premier snapshot le même jour"
            );

            let second = save_automatic_snapshot(&pool, "default", "{}", "2026-07-17")
                .await
                .expect("snapshot automatique dans le nouveau dossier");
            assert!(
                matches!(second, AutomaticSnapshotOutcome::Saved(_)),
                "le nouveau dossier doit recevoir un snapshot le même jour"
            );
            let snapshots_in_second_directory = fs::read_dir(&second_directory)
                .expect("lecture du second dossier")
                .filter_map(Result::ok)
                .filter_map(|entry| entry.file_name().into_string().ok())
                .filter(|name| is_owned_snapshot_name(name, "default"))
                .count();
            assert_eq!(
                snapshots_in_second_directory, 1,
                "le snapshot suivant doit être écrit dans le nouveau dossier"
            );

            fs::remove_dir_all(first_directory).expect("nettoyage du premier dossier temporaire");
            fs::remove_dir_all(second_directory).expect("nettoyage du second dossier temporaire");
        });
    }

    #[test]
    fn failed_film_insert_rolls_back_the_new_profile() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;

            let timestamp = "2026-07-17T13:00:00.000Z".to_string();
            let payload = ImportLibraryPayload {
                profile: ImportProfile {
                    id: "new-profile".to_string(),
                    name: "Import de test".to_string(),
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                },
                films: vec![ImportFilm {
                    id: "new-film".to_string(),
                    profile_id: "new-profile".to_string(),
                    title: "Film refusé".to_string(),
                    original_title: None,
                    year: None,
                    status: "statut invalide".to_string(),
                    is_favorite: false,
                    rating: None,
                    watched_at: None,
                    personal_note: None,
                    director: None,
                    summary: None,
                    provider_name: None,
                    provider_id: None,
                    poster_url: None,
                    created_at: timestamp.clone(),
                    updated_at: timestamp,
                }],
            };

            let result = write_import(&pool, &payload).await;
            assert!(
                result.is_err(),
                "la contrainte de statut doit refuser le film"
            );

            let profile_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM profiles")
                .fetch_one(&pool)
                .await
                .expect("compte profils");
            let film_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM films")
                .fetch_one(&pool)
                .await
                .expect("compte films");
            let current_profile: (String,) =
                sqlx::query_as("SELECT profile_id FROM current_profile WHERE singleton = 1")
                    .fetch_one(&pool)
                    .await
                    .expect("profil courant");

            assert_eq!(profile_count.0, 1, "le profil d’import doit être annulé");
            assert_eq!(film_count.0, 0, "aucun film ne doit subsister");
            assert_eq!(
                current_profile.0, "default",
                "le profil courant doit rester intact"
            );
        });
    }

    #[test]
    fn backup_settings_are_isolated_between_profiles() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_profile(&pool, "second-profile").await;
            upsert_backup_directory(&pool, "default", "/tmp/default")
                .await
                .expect("réglage default");
            upsert_backup_directory(&pool, "second-profile", "/tmp/second")
                .await
                .expect("réglage second");

            assert_eq!(
                read_backup_settings(&pool, "default")
                    .await
                    .expect("lecture default")
                    .expect("default configuré")
                    .backup_directory,
                "/tmp/default"
            );
            assert_eq!(
                read_backup_settings(&pool, "second-profile")
                    .await
                    .expect("lecture second")
                    .expect("second configuré")
                    .backup_directory,
                "/tmp/second"
            );
        });
    }

    async fn test_pool_with_tmdb_migrations() -> sqlx::SqlitePool {
        let pool = test_pool().await;
        for migration in [
            include_str!("../migrations/0008_create_film_tmdb_cache.sql"),
            include_str!("../migrations/0009_add_selected_poster_url.sql"),
            include_str!("../migrations/0010_create_cultural_media.sql"),
            // 0011 à 0018 puis 0020 et 0021 : schéma courant des tests de portabilité.
            // 0019 est volontairement omise : sur une base vierge elle supprime
            // le profil technique « default » dont ces fixtures ont besoin.
            include_str!("../migrations/0011_nullable_current_profile.sql"),
            include_str!("../migrations/0012_create_saved_views.sql"),
            include_str!("../migrations/0013_saved_views_unified_criteria.sql"),
            include_str!("../migrations/0014_normalize_game_statuses.sql"),
            include_str!("../migrations/0015_artwork_custom_fields.sql"),
            include_str!("../migrations/0016_artwork_discovered.sql"),
            include_str!("../migrations/0017_media_provider_links.sql"),
            include_str!("../migrations/0018_backfill_media_provider_links.sql"),
            include_str!("../migrations/0020_split_anime_and_mangas.sql"),
            include_str!("../migrations/0021_custom_libraries.sql"),
        ] {
            sqlx::raw_sql(migration)
                .execute(&pool)
                .await
                .expect("migration TMDB de test");
        }
        pool
    }

    #[test]
    fn export_query_never_surfaces_tmdb_cache_data() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            let timestamp = "2026-07-19T10:00:00.000Z".to_string();
            let payload = ImportLibraryPayload {
                profile: ImportProfile {
                    id: "export-profile".to_string(),
                    name: "Profil export".to_string(),
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                },
                films: vec![ImportFilm {
                    id: "export-film".to_string(),
                    profile_id: "export-profile".to_string(),
                    title: "Film associé TMDB".to_string(),
                    original_title: None,
                    year: Some(2024),
                    status: "terminé".to_string(),
                    is_favorite: false,
                    rating: Some(4.0),
                    watched_at: Some("2026-07-18".to_string()),
                    personal_note: Some("Note personnelle.".to_string()),
                    director: Some("Réalisatrice".to_string()),
                    summary: None,
                    provider_name: None,
                    provider_id: None,
                    poster_url: None,
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                }],
            };
            write_import(&pool, &payload).await.expect("import du film");

            // Une ligne de cache TMDB existe pour ce film, avec une affiche choisie.
            sqlx::query(
                "INSERT INTO film_tmdb_cache
                 (film_id, tmdb_id, language, payload_json, fetched_at, refresh_after, expires_at, selected_poster_url)
                 VALUES ($1, 550, 'fr-FR', $2, '2026-07-19T10:00:00Z', '2026-10-07T10:00:00Z', '2027-01-15T10:00:00Z', 'https://image.tmdb.org/t/p/w500/choisie.jpg')",
            )
            .bind("export-film")
            .bind("{\"title\":\"Fight Club\",\"posterUrl\":\"https://image.tmdb.org/t/p/w500/principale.jpg\"}")
            .execute(&pool)
            .await
            .expect("insertion du cache TMDB");

            // La requête d'export relit exclusivement les colonnes de la table films.
            #[derive(sqlx::FromRow)]
            struct ExportedFilmRow {
                id: String,
                original_title: Option<String>,
                provider_name: Option<String>,
                provider_id: Option<String>,
                poster_url: Option<String>,
            }
            let exported: Vec<ExportedFilmRow> = sqlx::query_as(
                "SELECT id, original_title, provider_name, provider_id, poster_url
                     FROM films WHERE profile_id = $1",
            )
            .bind("export-profile")
            .fetch_all(&pool)
            .await
            .expect("relecture export");

            assert_eq!(exported.len(), 1);
            let exported = &exported[0];
            assert_eq!(exported.id, "export-film");
            assert_eq!(exported.original_title, None);
            assert_eq!(exported.provider_name, None);
            assert_eq!(exported.provider_id, None);
            assert_eq!(
                exported.poster_url, None,
                "l'affiche choisie dans le cache TMDB ne doit jamais fuiter dans l'export"
            );

            // Aucun champ issu du cache n'existe dans le modèle exporté.
            let column_names: Vec<(String,)> =
                sqlx::query_as("SELECT name FROM pragma_table_info('films')")
                    .fetch_all(&pool)
                    .await
                    .expect("colonnes films");
            for (name,) in column_names {
                assert!(
                    !name.contains("tmdb"),
                    "la table films ne doit contenir aucune colonne TMDB : {name}"
                );
            }
        });
    }

    #[test]
    fn historical_v1_export_reimports_on_migrated_database() {
        tauri::async_runtime::block_on(async {
            // Base complète, y compris les migrations TMDB 8 et 9.
            let pool = test_pool_with_tmdb_migrations().await;
            let timestamp = "2026-07-01T08:00:00.000Z".to_string();
            // Export v1 historique : provenance partielle (provider_id seul),
            // chaînes facultatives vides — la canonisation non destructive doit s'appliquer.
            let payload = ImportLibraryPayload {
                profile: ImportProfile {
                    id: "profil-lys".to_string(),
                    name: "=Carnet, \"été\"".to_string(),
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                },
                films: vec![ImportFilm {
                    id: "film-cafe".to_string(),
                    profile_id: "profil-lys".to_string(),
                    title: "+Café, \"matin\"".to_string(),
                    original_title: Some(String::new()),
                    year: Some(2024),
                    status: "terminé".to_string(),
                    is_favorite: true,
                    rating: Some(4.5),
                    watched_at: Some("2026-07-17".to_string()),
                    personal_note: Some(
                        "-Première note.\nDeuxième ligne, avec \"guillemets\".".to_string(),
                    ),
                    director: Some("Anaïs Vert".to_string()),
                    summary: Some(String::new()),
                    provider_name: Some(String::new()),
                    provider_id: Some("source-ete-42".to_string()),
                    poster_url: None,
                    created_at: timestamp.clone(),
                    updated_at: timestamp,
                }],
            };

            write_import(&pool, &payload)
                .await
                .expect("réimport de l'export v1 historique");

            let stored: (Option<String>, Option<String>, Option<String>, i64, f64) =
                sqlx::query_as(
                    "SELECT original_title, provider_name, provider_id, is_favorite, rating
                     FROM films WHERE id = 'film-cafe'",
                )
                .fetch_one(&pool)
                .await
                .expect("relecture du film réimporté");
            assert_eq!(
                stored,
                (None, None, None, 1, 4.5),
                "la canonisation v1 doit vider les chaînes vides et la provenance partielle, sans toucher aux autres valeurs"
            );

            let cache_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM film_tmdb_cache")
                .fetch_one(&pool)
                .await
                .expect("compte du cache TMDB");
            assert_eq!(
                cache_count.0, 0,
                "l'import d'un export v1 ne doit créer aucune ligne de cache TMDB"
            );
        });
    }

    #[test]
    fn library_document_v2_import_writes_all_media_atomically() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            let timestamp = "2026-07-19T10:00:00.000Z".to_string();
            let payload = ImportLibraryDocumentPayload {
                profile: ImportProfile {
                    id: "profil-complet".to_string(),
                    name: "Bibliothèque complète".to_string(),
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                },
                films: vec![ImportFilm {
                    id: "film-v2".to_string(),
                    profile_id: "profil-complet".to_string(),
                    title: "Film v2".to_string(),
                    original_title: None,
                    year: Some(2024),
                    status: "terminé".to_string(),
                    is_favorite: false,
                    rating: Some(4.0),
                    watched_at: Some("2026-07-01".to_string()),
                    personal_note: None,
                    director: None,
                    summary: None,
                    provider_name: None,
                    provider_id: None,
                    poster_url: None,
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                }],
                series: vec![ImportSeries {
                    id: "series-v2".to_string(),
                    profile_id: "profil-complet".to_string(),
                    title: "Série v2".to_string(),
                    showrunner: Some("Showrunner".to_string()),
                    casting: Some(String::new()),
                    summary: None,
                    category: "animation".to_string(),
                    status: "en cours".to_string(),
                    rating: Some(4.5),
                    is_favorite: true,
                    seasons_seen: Some(3),
                    seasons_total: Some(8),
                    progress_updated_at: Some(timestamp.clone()),
                    started_at: Some("2024-05-01".to_string()),
                    poster_url: None,
                    personal_note: None,
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                }],
                anime: Vec::new(),
                books: vec![ImportBook {
                    id: "book-v2".to_string(),
                    profile_id: "profil-complet".to_string(),
                    title: "Manga v2".to_string(),
                    author: Some("Mangaka".to_string()),
                    year: Some(2020),
                    summary: None,
                    category: "manga".to_string(),
                    status: "en cours".to_string(),
                    rating: None,
                    is_favorite: true,
                    volumes_read: Some(10),
                    volumes_total: Some(30),
                    progress_updated_at: Some(timestamp.clone()),
                    started_at: Some("2023-01-01".to_string()),
                    cover_url: None,
                    personal_note: None,
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                    quotes: vec![ImportBookQuote {
                        id: "quote-v2".to_string(),
                        book_id: "book-v2".to_string(),
                        body: "Citation mémorable".to_string(),
                        position: 0,
                        created_at: timestamp.clone(),
                    }],
                }],
                mangas: Vec::new(),
                games: vec![ImportGame {
                    id: "game-v2".to_string(),
                    profile_id: "profil-complet".to_string(),
                    title: "Jeu v2".to_string(),
                    developer: Some("Studio".to_string()),
                    platform: Some("Dreamcast".to_string()),
                    year: Some(2001),
                    status: "regardé".to_string(),
                    rating: Some(3.5),
                    is_favorite: false,
                    played_at: Some("2026-02-01".to_string()),
                    cover_url: None,
                    personal_note: None,
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                }],
                artworks: vec![ImportArtwork {
                    id: "artwork-v2".to_string(),
                    profile_id: "profil-complet".to_string(),
                    title: "Œuvre v2".to_string(),
                    artist: Some("Artiste".to_string()),
                    year: Some(1889),
                    form: "peinture".to_string(),
                    location: Some("Musée d’Orsay".to_string()),
                    exhibition: None,
                    status: "découverte".to_string(),
                    is_favorite: true,
                    discovered_at: Some("2026-06-15".to_string()),
                    image_url: None,
                    personal_note: None,
                    custom_fields: Vec::new(),
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                }],
                custom_libraries: Vec::new(),
            };

            write_library_document_import(&pool, &payload, true)
                .await
                .expect("import du document v2 complet");

            let counts: (i64, i64, i64, i64, i64, i64, i64, i64, i64) = sqlx::query_as(
                "SELECT
                   (SELECT COUNT(*) FROM films WHERE profile_id = 'profil-complet'),
                   (SELECT COUNT(*) FROM series WHERE profile_id = 'profil-complet'),
                   (SELECT COUNT(*) FROM anime WHERE profile_id = 'profil-complet'),
                   (SELECT COUNT(*) FROM books WHERE profile_id = 'profil-complet'),
                   (SELECT COUNT(*) FROM mangas WHERE profile_id = 'profil-complet'),
                   (SELECT COUNT(*) FROM book_quotes),
                   (SELECT COUNT(*) FROM manga_quotes),
                   (SELECT COUNT(*) FROM games WHERE profile_id = 'profil-complet'),
                   (SELECT COUNT(*) FROM artworks WHERE profile_id = 'profil-complet')",
            )
            .fetch_one(&pool)
            .await
            .expect("comptes des collections importées");
            assert_eq!(
                counts,
                (1, 0, 1, 0, 1, 0, 1, 1, 1),
                "l'import d'un document v2 doit router animation → anime et manga → mangas, avec les citations"
            );

            let anime_row: (String, i64, i64, Option<String>) = sqlx::query_as(
                "SELECT status, seasons_seen, seasons_total, progress_updated_at
                 FROM anime WHERE id = 'series-v2'",
            )
            .fetch_one(&pool)
            .await
            .expect("relecture de l'animation importée");
            assert_eq!(anime_row.0, "en cours");
            assert_eq!(anime_row.1, 3);
            assert_eq!(anime_row.2, 8);
            assert_eq!(
                anime_row.3.as_deref(),
                Some("2026-07-19T10:00:00.000Z"),
                "l'horodatage interne de progression doit être conservé"
            );

            let quote_row: (String, i64) = sqlx::query_as(
                "SELECT body, position FROM manga_quotes WHERE manga_id = 'book-v2'",
            )
            .fetch_one(&pool)
            .await
            .expect("relecture de la citation importée");
            assert_eq!(quote_row, ("Citation mémorable".to_string(), 0));

            let game_row: (String, String) =
                sqlx::query_as("SELECT platform, status FROM games WHERE id = 'game-v2'")
                    .fetch_one(&pool)
                    .await
                    .expect("relecture du jeu importé");
            assert_eq!(
                game_row,
                ("Dreamcast".to_string(), "regardé".to_string()),
                "la plateforme libre et le statut regardé doivent être conservés"
            );

            let active_profile: (String,) =
                sqlx::query_as("SELECT profile_id FROM current_profile WHERE singleton = 1")
                    .fetch_one(&pool)
                    .await
                    .expect("profil actif après import");
            assert_eq!(
                active_profile.0, "profil-complet",
                "l'import v2 doit activer le nouveau profil"
            );
        });
    }

    #[test]
    fn library_document_v2_import_targets_only_an_existing_empty_profile() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            let timestamp = "2026-07-20T10:00:00.000Z".to_string();
            let film = |id: &str, title: &str| ImportFilm {
                id: id.to_string(),
                profile_id: "default".to_string(),
                title: title.to_string(),
                original_title: None,
                year: None,
                status: "à découvrir".to_string(),
                is_favorite: false,
                rating: None,
                watched_at: None,
                personal_note: None,
                director: None,
                summary: None,
                provider_name: None,
                provider_id: None,
                poster_url: None,
                created_at: timestamp.clone(),
                updated_at: timestamp.clone(),
            };
            let payload = ImportLibraryDocumentPayload {
                profile: ImportProfile {
                    id: "default".to_string(),
                    name: "Profil courant".to_string(),
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                },
                films: vec![film("film-empty-profile", "Premier import")],
                series: Vec::new(),
                anime: Vec::new(),
                books: Vec::new(),
                mangas: Vec::new(),
                games: Vec::new(),
                artworks: Vec::new(),
                custom_libraries: Vec::new(),
            };

            write_library_document_import(&pool, &payload, false)
                .await
                .expect("import global dans le profil courant vide");

            let profile_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM profiles")
                .fetch_one(&pool)
                .await
                .expect("compte des profils");
            let film_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM films WHERE profile_id = 'default'")
                    .fetch_one(&pool)
                    .await
                    .expect("compte des films importés");
            assert_eq!(profile_count, 1, "l’import ne doit créer aucun profil");
            assert_eq!(
                film_count, 1,
                "le document doit remplir le profil courant vide"
            );

            let second_payload = ImportLibraryDocumentPayload {
                profile: ImportProfile {
                    id: "default".to_string(),
                    name: "Profil courant".to_string(),
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                },
                films: vec![film("film-refused", "Import refusé")],
                series: Vec::new(),
                anime: Vec::new(),
                books: Vec::new(),
                mangas: Vec::new(),
                games: Vec::new(),
                artworks: Vec::new(),
                custom_libraries: Vec::new(),
            };
            let result = write_library_document_import(&pool, &second_payload, false).await;
            assert!(
                result.is_err(),
                "un profil non vide doit bloquer l’import global"
            );

            let final_film_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM films WHERE profile_id = 'default'")
                    .fetch_one(&pool)
                    .await
                    .expect("compte final des films");
            assert_eq!(
                final_film_count, 1,
                "un import global refusé ne doit écrire aucune fiche supplémentaire"
            );
        });
    }

    #[test]
    fn library_document_v2_import_rejects_quote_from_another_book() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            let timestamp = "2026-07-19T10:00:00.000Z".to_string();
            let payload = ImportLibraryDocumentPayload {
                profile: ImportProfile {
                    id: "profil-invalide".to_string(),
                    name: "Invalide".to_string(),
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                },
                films: Vec::new(),
                series: Vec::new(),
                anime: Vec::new(),
                books: vec![ImportBook {
                    id: "book-a".to_string(),
                    profile_id: "profil-invalide".to_string(),
                    title: "Livre A".to_string(),
                    author: None,
                    year: None,
                    summary: None,
                    category: "livre".to_string(),
                    status: "lu".to_string(),
                    rating: None,
                    is_favorite: false,
                    volumes_read: None,
                    volumes_total: None,
                    progress_updated_at: None,
                    started_at: None,
                    cover_url: None,
                    personal_note: None,
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                    quotes: vec![ImportBookQuote {
                        id: "quote-orpheline".to_string(),
                        book_id: "book-b".to_string(),
                        body: "Citation rattachée à un autre livre".to_string(),
                        position: 0,
                        created_at: timestamp.clone(),
                    }],
                }],
                mangas: Vec::new(),
                games: Vec::new(),
                artworks: Vec::new(),
                custom_libraries: Vec::new(),
            };

            let result = write_library_document_import(&pool, &payload, true).await;
            assert!(
                result.is_err(),
                "une citation rattachée à un autre livre doit bloquer l'import"
            );

            let profile_count: (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM profiles WHERE id = 'profil-invalide'")
                    .fetch_one(&pool)
                    .await
                    .expect("compte du profil refusé");
            assert_eq!(
                profile_count.0, 0,
                "un import refusé avant écriture ne doit créer aucun profil"
            );
        });
    }

    #[test]
    fn books_collection_import_is_atomic_with_quotes() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            let timestamp = "2026-07-22T10:00:00.000Z";
            let book = |id: &str, title: &str, quote_id: &str, quote_body: &str| ImportBook {
                id: id.to_string(),
                profile_id: "default".to_string(),
                title: title.to_string(),
                author: Some("Autrice avec accents — Élodie".to_string()),
                year: Some(2026),
                summary: Some("Résumé long\nconservé sans transformation.".to_string()),
                category: "livre".to_string(),
                status: "lu".to_string(),
                rating: Some(4.5),
                is_favorite: true,
                volumes_read: None,
                volumes_total: None,
                progress_updated_at: None,
                started_at: Some("2026-07-01".to_string()),
                cover_url: None,
                personal_note: Some("Avis personnel\nmultiligne.".to_string()),
                created_at: timestamp.to_string(),
                updated_at: timestamp.to_string(),
                quotes: vec![ImportBookQuote {
                    id: quote_id.to_string(),
                    book_id: id.to_string(),
                    body: quote_body.to_string(),
                    position: 0,
                    created_at: timestamp.to_string(),
                }],
            };

            write_books_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: vec![book(
                        "book-existing",
                        "Livre conservé",
                        "quote-existing",
                        "Citation conservée",
                    )],
                    updates: Vec::new(),
                },
            )
            .await
            .expect("installation de la collection initiale");

            let failing_plan = CollectionImportPlan {
                profile_id: "default".to_string(),
                replace_existing: true,
                inserts: vec![
                    book("book-new-a", "Nouveau A", "quote-duplicate", "Citation A"),
                    book("book-new-b", "Nouveau B", "quote-duplicate", "Citation B"),
                ],
                updates: Vec::new(),
            };
            assert!(
                write_books_import_plan(&pool, &failing_plan).await.is_err(),
                "un conflit de citation doit annuler tout le remplacement"
            );

            let books: Vec<(String, String)> = sqlx::query_as(
                "SELECT id, title FROM books WHERE profile_id = 'default' ORDER BY id",
            )
            .fetch_all(&pool)
            .await
            .expect("relecture des livres après rollback");
            let quotes: Vec<(String, String, String)> =
                sqlx::query_as("SELECT id, book_id, body FROM book_quotes ORDER BY id")
                    .fetch_all(&pool)
                    .await
                    .expect("relecture des citations après rollback");
            assert_eq!(
                books,
                vec![("book-existing".to_string(), "Livre conservé".to_string())],
                "le livre initial doit survivre au remplacement échoué"
            );
            assert_eq!(
                quotes,
                vec![(
                    "quote-existing".to_string(),
                    "book-existing".to_string(),
                    "Citation conservée".to_string(),
                )],
                "la citation initiale doit survivre au remplacement échoué"
            );
        });
    }

    #[test]
    fn games_and_artworks_collection_imports_are_atomic() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            let timestamp = "2026-07-22T16:00:00.000Z";
            let game = |id: &str, title: &str, status: &str| ImportGame {
                id: id.to_string(),
                profile_id: "default".to_string(),
                title: title.to_string(),
                developer: Some("Studio local".to_string()),
                platform: Some("Steam Deck".to_string()),
                year: Some(2026),
                status: status.to_string(),
                rating: Some(4.5),
                is_favorite: true,
                played_at: Some("2026-07-22".to_string()),
                cover_url: None,
                personal_note: Some("Avis local".to_string()),
                created_at: timestamp.to_string(),
                updated_at: timestamp.to_string(),
            };
            let artwork = |id: &str, title: &str, form: &str| ImportArtwork {
                id: id.to_string(),
                profile_id: "default".to_string(),
                title: title.to_string(),
                artist: Some("Artiste locale".to_string()),
                year: Some(2026),
                form: form.to_string(),
                location: Some("Galerie".to_string()),
                exhibition: Some("Exposition locale".to_string()),
                status: "découverte".to_string(),
                is_favorite: true,
                discovered_at: Some("2026-07-22".to_string()),
                image_url: None,
                personal_note: Some("Avis local".to_string()),
                custom_fields: Vec::new(),
                created_at: timestamp.to_string(),
                updated_at: timestamp.to_string(),
            };

            write_games_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: vec![game("game-existing", "Jeu conservé", "joué")],
                    updates: Vec::new(),
                },
            )
            .await
            .expect("installation du jeu initial");
            write_artworks_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: vec![artwork("artwork-existing", "Œuvre conservée", "poésie")],
                    updates: Vec::new(),
                },
            )
            .await
            .expect("installation de l’œuvre initiale");

            assert!(
                write_games_import_plan(
                    &pool,
                    &CollectionImportPlan {
                        profile_id: "default".to_string(),
                        replace_existing: true,
                        inserts: vec![
                            game("game-new", "Nouveau jeu", "joué"),
                            game("game-invalid", "Jeu invalide", "terminé"),
                        ],
                        updates: Vec::new(),
                    },
                )
                .await
                .is_err(),
                "un statut Jeu invalide doit annuler tout le remplacement"
            );
            assert!(
                write_artworks_import_plan(
                    &pool,
                    &CollectionImportPlan {
                        profile_id: "default".to_string(),
                        replace_existing: true,
                        inserts: vec![
                            artwork("artwork-new", "Nouvelle œuvre", "peinture"),
                            artwork("artwork-invalid", "Œuvre invalide", "installation"),
                        ],
                        updates: Vec::new(),
                    },
                )
                .await
                .is_err(),
                "une forme d’Art invalide doit annuler tout le remplacement"
            );

            let games: Vec<(String,)> =
                sqlx::query_as("SELECT id FROM games WHERE profile_id = 'default' ORDER BY id")
                    .fetch_all(&pool)
                    .await
                    .expect("relecture des jeux après rollback");
            let artworks: Vec<(String,)> =
                sqlx::query_as("SELECT id FROM artworks WHERE profile_id = 'default' ORDER BY id")
                    .fetch_all(&pool)
                    .await
                    .expect("relecture des œuvres après rollback");
            assert_eq!(games, vec![("game-existing".to_string(),)]);
            assert_eq!(artworks, vec![("artwork-existing".to_string(),)]);

            write_games_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: Vec::new(),
                    updates: vec![game("game-existing", "Jeu enrichi", "en cours")],
                },
            )
            .await
            .expect("mise à jour fusionnée du jeu");
            write_artworks_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: Vec::new(),
                    updates: vec![artwork("artwork-existing", "Œuvre enrichie", "peinture")],
                },
            )
            .await
            .expect("mise à jour fusionnée de l’œuvre");

            let updated_game: (String, String) =
                sqlx::query_as("SELECT title, status FROM games WHERE id = 'game-existing'")
                    .fetch_one(&pool)
                    .await
                    .expect("relecture du jeu fusionné");
            let updated_artwork: (String, String) =
                sqlx::query_as("SELECT title, form FROM artworks WHERE id = 'artwork-existing'")
                    .fetch_one(&pool)
                    .await
                    .expect("relecture de l’œuvre fusionnée");
            assert_eq!(
                updated_game,
                ("Jeu enrichi".to_string(), "en cours".to_string())
            );
            assert_eq!(
                updated_artwork,
                ("Œuvre enrichie".to_string(), "peinture".to_string())
            );
        });
    }

    // -----------------------------------------------------------------------
    // Une table par bibliothèque : documents v3, héritage v1/v2, collections.
    // -----------------------------------------------------------------------

    fn portable_profile(id: &str) -> ImportProfile {
        ImportProfile {
            id: id.to_string(),
            name: format!("Profil {id}"),
            created_at: "2026-07-01T08:00:00.000Z".to_string(),
            updated_at: "2026-07-01T08:00:00.000Z".to_string(),
        }
    }

    fn portable_series(profile_id: &str, id: &str, title: &str, category: &str) -> ImportSeries {
        ImportSeries {
            id: id.to_string(),
            profile_id: profile_id.to_string(),
            title: title.to_string(),
            showrunner: Some("Autrice".to_string()),
            casting: Some("Distribution".to_string()),
            summary: Some("Résumé conservé.".to_string()),
            category: category.to_string(),
            status: "en cours".to_string(),
            rating: Some(4.5),
            is_favorite: true,
            seasons_seen: Some(2),
            seasons_total: Some(6),
            progress_updated_at: Some("2026-07-20T10:00:00.000Z".to_string()),
            started_at: Some("2026-05-01".to_string()),
            poster_url: None,
            personal_note: Some("Note de série.".to_string()),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-07-20T10:00:00.000Z".to_string(),
        }
    }

    fn portable_anime(
        profile_id: &str,
        id: &str,
        title: &str,
        category: Option<&str>,
    ) -> ImportAnime {
        ImportAnime {
            id: id.to_string(),
            profile_id: profile_id.to_string(),
            title: title.to_string(),
            showrunner: Some("Studio".to_string()),
            casting: Some("Seiyuu".to_string()),
            summary: Some("Résumé animé.".to_string()),
            category: category.map(str::to_string),
            status: "vue".to_string(),
            rating: Some(5.0),
            is_favorite: true,
            seasons_seen: Some(1),
            seasons_total: Some(1),
            progress_updated_at: Some("2026-07-21T10:00:00.000Z".to_string()),
            started_at: Some("2026-04-01".to_string()),
            poster_url: Some("https://example.test/anime.jpg".to_string()),
            personal_note: Some("Note animé.".to_string()),
            created_at: "2026-01-02T00:00:00.000Z".to_string(),
            updated_at: "2026-07-21T10:00:00.000Z".to_string(),
        }
    }

    fn portable_book(profile_id: &str, id: &str, title: &str, category: &str) -> ImportBook {
        ImportBook {
            id: id.to_string(),
            profile_id: profile_id.to_string(),
            title: title.to_string(),
            author: Some("Autrice".to_string()),
            year: Some(2021),
            summary: Some("Résumé conservé.".to_string()),
            category: category.to_string(),
            status: "lu".to_string(),
            rating: Some(4.0),
            is_favorite: false,
            volumes_read: Some(3),
            volumes_total: Some(3),
            progress_updated_at: Some("2026-07-22T10:00:00.000Z".to_string()),
            started_at: Some("2026-06-01".to_string()),
            cover_url: None,
            personal_note: Some("Note de livre.".to_string()),
            created_at: "2026-02-01T00:00:00.000Z".to_string(),
            updated_at: "2026-07-22T10:00:00.000Z".to_string(),
            quotes: Vec::new(),
        }
    }

    fn portable_manga(
        profile_id: &str,
        id: &str,
        title: &str,
        quote_id: &str,
        quote_body: &str,
    ) -> ImportManga {
        ImportManga {
            id: id.to_string(),
            profile_id: profile_id.to_string(),
            title: title.to_string(),
            author: Some("Mangaka".to_string()),
            year: Some(2019),
            summary: Some("Résumé manga.".to_string()),
            category: Some("manga".to_string()),
            status: "en cours".to_string(),
            rating: Some(4.5),
            is_favorite: true,
            volumes_read: Some(4),
            volumes_total: Some(12),
            progress_updated_at: Some("2026-07-23T10:00:00.000Z".to_string()),
            started_at: Some("2026-03-01".to_string()),
            cover_url: Some("https://example.test/manga.jpg".to_string()),
            personal_note: Some("Note manga.".to_string()),
            created_at: "2026-02-02T00:00:00.000Z".to_string(),
            updated_at: "2026-07-23T10:00:00.000Z".to_string(),
            quotes: vec![ImportBookQuote {
                id: quote_id.to_string(),
                book_id: id.to_string(),
                body: quote_body.to_string(),
                position: 0,
                created_at: "2026-07-23T10:00:00.000Z".to_string(),
            }],
        }
    }

    fn empty_document(profile_id: &str) -> ImportLibraryDocumentPayload {
        ImportLibraryDocumentPayload {
            profile: portable_profile(profile_id),
            films: Vec::new(),
            series: Vec::new(),
            anime: Vec::new(),
            books: Vec::new(),
            mangas: Vec::new(),
            games: Vec::new(),
            artworks: Vec::new(),
            custom_libraries: Vec::new(),
        }
    }

    #[test]
    fn library_document_v3_import_writes_the_seven_sections_in_their_own_tables() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            let mut payload = empty_document("profil-v3");
            payload.series = vec![
                portable_series("profil-v3", "serie-tele", "Série télé", "série télé"),
                portable_series("profil-v3", "serie-heritee", "Animée héritée", "animation"),
            ];
            payload.anime = vec![portable_anime(
                "profil-v3",
                "anime-explicite",
                "Animé explicite",
                Some("animation"),
            )];
            payload.books = vec![portable_book("profil-v3", "livre-v3", "Livre v3", "livre")];
            payload.mangas = vec![portable_manga(
                "profil-v3",
                "manga-v3",
                "Manga v3",
                "citation-manga-v3",
                "Citation manga v3",
            )];

            write_library_document_import(&pool, &payload, true)
                .await
                .expect("import du document v3 complet");

            let counts: (i64, i64, i64, i64, i64, i64, i64) = sqlx::query_as(
                "SELECT
                   (SELECT COUNT(*) FROM films WHERE profile_id = 'profil-v3'),
                   (SELECT COUNT(*) FROM series WHERE profile_id = 'profil-v3'),
                   (SELECT COUNT(*) FROM anime WHERE profile_id = 'profil-v3'),
                   (SELECT COUNT(*) FROM books WHERE profile_id = 'profil-v3'),
                   (SELECT COUNT(*) FROM mangas WHERE profile_id = 'profil-v3'),
                   (SELECT COUNT(*) FROM book_quotes),
                   (SELECT COUNT(*) FROM manga_quotes)",
            )
            .fetch_one(&pool)
            .await
            .expect("comptes des sept sections");
            assert_eq!(
                counts,
                (0, 1, 2, 1, 1, 0, 1),
                "chaque section v3 doit atterrir dans sa propre table, y compris une fiche animation héritée de « series »"
            );

            let series_category: String =
                sqlx::query_scalar("SELECT category FROM series WHERE id = 'serie-tele'")
                    .fetch_one(&pool)
                    .await
                    .expect("catégorie de la série télé");
            assert_eq!(
                series_category, "série télé",
                "une fiche Séries s'écrit toujours avec la catégorie « série télé »"
            );

            let anime_row: (Option<String>, String, i64, i64, String) = sqlx::query_as(
                "SELECT showrunner, status, seasons_seen, seasons_total, progress_updated_at
                 FROM anime WHERE id = 'anime-explicite'",
            )
            .fetch_one(&pool)
            .await
            .expect("relecture de la fiche Animation explicite");
            assert_eq!(
                anime_row,
                (
                    Some("Studio".to_string()),
                    "vue".to_string(),
                    1,
                    1,
                    "2026-07-21T10:00:00.000Z".to_string()
                ),
                "la fiche Animation doit conserver tous ses champs"
            );

            let inherited: (String, String) =
                sqlx::query_as("SELECT title, personal_note FROM anime WHERE id = 'serie-heritee'")
                    .fetch_one(&pool)
                    .await
                    .expect("relecture de l'Animation héritée");
            assert_eq!(
                inherited,
                ("Animée héritée".to_string(), "Note de série.".to_string()),
                "une fiche animation lue dans « series » conserve ses données"
            );

            let manga_row: (String, i64, i64, String) = sqlx::query_as(
                "SELECT personal_note, volumes_read, volumes_total, updated_at
                 FROM mangas WHERE id = 'manga-v3'",
            )
            .fetch_one(&pool)
            .await
            .expect("relecture de la fiche Manga");
            assert_eq!(
                manga_row,
                (
                    "Note manga.".to_string(),
                    4,
                    12,
                    "2026-07-23T10:00:00.000Z".to_string()
                ),
                "la fiche Manga doit conserver progression, note et horodatage"
            );

            let quote: (String, String, i64) = sqlx::query_as(
                "SELECT manga_id, body, position FROM manga_quotes WHERE id = 'citation-manga-v3'",
            )
            .fetch_one(&pool)
            .await
            .expect("relecture de la citation Manga");
            assert_eq!(
                quote,
                ("manga-v3".to_string(), "Citation manga v3".to_string(), 0),
                "la citation d'un manga doit vivre dans manga_quotes"
            );

            let result = library_document_result(&payload);
            assert_eq!(
                (
                    result.film_count,
                    result.series_count,
                    result.anime_count,
                    result.book_count,
                    result.manga_count,
                    result.game_count,
                    result.artwork_count,
                ),
                (0, 1, 2, 1, 1, 0, 0),
                "les comptes d'import doivent suivre la table réellement écrite"
            );

            let active_profile: String =
                sqlx::query_scalar("SELECT profile_id FROM current_profile WHERE singleton = 1")
                    .fetch_one(&pool)
                    .await
                    .expect("profil actif");
            assert_eq!(active_profile, "profil-v3");

            let tmdb_columns: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM pragma_table_info('anime') WHERE name LIKE '%tmdb%'",
            )
            .fetch_one(&pool)
            .await
            .expect("colonnes anime");
            let cache_rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM film_tmdb_cache")
                .fetch_one(&pool)
                .await
                .expect("cache TMDB après import");
            assert_eq!(tmdb_columns, 0, "aucune colonne TMDB dans anime");
            assert_eq!(
                cache_rows, 0,
                "un import de document ne doit jamais écrire dans le cache TMDB"
            );
        });
    }

    #[test]
    fn library_document_v2_still_loads_and_routes_animation_and_manga() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            // Document v2 réel : ni section anime ni section mangas.
            let document = serde_json::json!({
                "format": "sylloge-library",
                "version": 2,
                "exportedAt": "2026-07-24T10:00:00.000Z",
                "profile": {
                    "id": "profil-v2",
                    "name": "Profil v2",
                    "createdAt": "2026-07-01T08:00:00.000Z",
                    "updatedAt": "2026-07-01T08:00:00.000Z"
                },
                "films": [],
                "series": [{
                    "id": "serie-v2-anime",
                    "profileId": "profil-v2",
                    "title": "Animation v2",
                    "showrunner": "Studio v2",
                    "casting": null,
                    "summary": "Résumé v2",
                    "category": "animation",
                    "status": "en cours",
                    "rating": 4.5,
                    "isFavorite": true,
                    "seasonsSeen": 3,
                    "seasonsTotal": 8,
                    "progressUpdatedAt": "2026-07-24T09:00:00.000Z",
                    "startedAt": "2026-05-02",
                    "posterUrl": null,
                    "personalNote": "Note animation v2",
                    "createdAt": "2026-03-01T00:00:00.000Z",
                    "updatedAt": "2026-07-24T09:00:00.000Z"
                }],
                "books": [{
                    "id": "livre-v2-manga",
                    "profileId": "profil-v2",
                    "title": "Manga v2",
                    "author": "Mangaka v2",
                    "year": 2018,
                    "summary": "Résumé manga v2",
                    "category": "manga",
                    "status": "en cours",
                    "rating": 5.0,
                    "isFavorite": false,
                    "volumesRead": 7,
                    "volumesTotal": 20,
                    "progressUpdatedAt": "2026-07-24T09:30:00.000Z",
                    "startedAt": "2026-04-02",
                    "coverUrl": null,
                    "personalNote": "Note manga v2",
                    "createdAt": "2026-03-02T00:00:00.000Z",
                    "updatedAt": "2026-07-24T09:30:00.000Z",
                    "quotes": [{
                        "id": "citation-v2",
                        "bookId": "livre-v2-manga",
                        "body": "Citation v2",
                        "position": 0,
                        "createdAt": "2026-07-24T09:30:00.000Z"
                    }]
                }],
                "games": [],
                "artworks": []
            });
            let payload: ImportLibraryDocumentPayload =
                serde_json::from_value(document).expect("document v2 sans sections anime/mangas");

            write_library_document_import(&pool, &payload, true)
                .await
                .expect("réimport d'un document v2");

            let counts: (i64, i64, i64, i64, i64, i64) = sqlx::query_as(
                "SELECT
                   (SELECT COUNT(*) FROM series WHERE profile_id = 'profil-v2'),
                   (SELECT COUNT(*) FROM anime WHERE profile_id = 'profil-v2'),
                   (SELECT COUNT(*) FROM books WHERE profile_id = 'profil-v2'),
                   (SELECT COUNT(*) FROM mangas WHERE profile_id = 'profil-v2'),
                   (SELECT COUNT(*) FROM book_quotes),
                   (SELECT COUNT(*) FROM manga_quotes)",
            )
            .fetch_one(&pool)
            .await
            .expect("comptes après routage v2");
            assert_eq!(
                counts,
                (0, 1, 0, 1, 0, 1),
                "animation → anime et manga → mangas, sans laisser de ligne dans les anciennes tables"
            );

            let preserved: (i64, i64, String) = sqlx::query_as(
                "SELECT seasons_seen, seasons_total, progress_updated_at
                 FROM anime WHERE id = 'serie-v2-anime'",
            )
            .fetch_one(&pool)
            .await
            .expect("progression de l'animation v2");
            assert_eq!(
                preserved,
                (3, 8, "2026-07-24T09:00:00.000Z".to_string()),
                "toutes les données de la fiche animation doivent survivre au routage"
            );

            let manga_preserved: (i64, i64, String) = sqlx::query_as(
                "SELECT volumes_read, volumes_total, personal_note FROM mangas WHERE id = 'livre-v2-manga'",
            )
            .fetch_one(&pool)
            .await
            .expect("progression du manga v2");
            assert_eq!(
                manga_preserved,
                (7, 20, "Note manga v2".to_string()),
                "toutes les données de la fiche manga doivent survivre au routage"
            );

            let result = library_document_result(&payload);
            assert_eq!(
                (
                    result.series_count,
                    result.anime_count,
                    result.book_count,
                    result.manga_count
                ),
                (0, 1, 0, 1),
                "les comptes d'un document v2 doivent être ceux des tables cibles"
            );
        });
    }

    #[test]
    fn library_document_v3_rejects_a_manga_quote_from_another_manga() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            let mut payload = empty_document("profil-refuse");
            let mut manga = portable_manga(
                "profil-refuse",
                "manga-a",
                "Manga A",
                "citation-a",
                "Citation A",
            );
            manga.quotes[0].book_id = "manga-b".to_string();
            payload.mangas = vec![manga];

            let result = write_library_document_import(&pool, &payload, true).await;
            assert!(
                result.is_err(),
                "une citation rattachée à un autre manga doit bloquer l'import"
            );

            let counts: (i64, i64, i64) = sqlx::query_as(
                "SELECT
                   (SELECT COUNT(*) FROM profiles WHERE id = 'profil-refuse'),
                   (SELECT COUNT(*) FROM mangas),
                   (SELECT COUNT(*) FROM manga_quotes)",
            )
            .fetch_one(&pool)
            .await
            .expect("état après refus");
            assert_eq!(
                counts,
                (0, 0, 0),
                "un document refusé ne doit écrire ni profil, ni manga, ni citation"
            );
        });
    }

    #[test]
    fn library_document_v3_rejects_an_anime_entry_with_a_television_category() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            let mut payload = empty_document("profil-incoherent");
            payload.anime = vec![portable_anime(
                "profil-incoherent",
                "anime-incoherent",
                "Animation incohérente",
                Some("série télé"),
            )];

            let result = write_library_document_import(&pool, &payload, true).await;
            assert!(
                result.is_err(),
                "la section Animation ne peut pas porter une catégorie de série télé"
            );

            let anime_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM anime")
                .fetch_one(&pool)
                .await
                .expect("compte animation");
            assert_eq!(anime_count, 0, "aucune fiche ne doit être écrite");
        });
    }

    #[test]
    fn library_document_import_refuses_a_profile_holding_only_anime_or_mangas() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            write_anime_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: vec![portable_anime(
                        "default",
                        "anime-existant",
                        "Animé existant",
                        None,
                    )],
                    updates: Vec::new(),
                },
            )
            .await
            .expect("fiche Animation préexistante");

            let mut payload = empty_document("default");
            payload.books = vec![portable_book(
                "default",
                "livre-refuse",
                "Livre refusé",
                "livre",
            )];
            let result = write_library_document_import(&pool, &payload, false).await;
            assert!(
                result.is_err(),
                "un profil qui ne contient qu'une Animation n'est pas vide"
            );

            let book_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM books WHERE profile_id = 'default'")
                    .fetch_one(&pool)
                    .await
                    .expect("compte livres");
            assert_eq!(book_count, 0, "l'import refusé ne doit rien écrire");

            write_mangas_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: vec![portable_manga(
                        "default",
                        "manga-existant",
                        "Manga existant",
                        "citation-existante",
                        "Citation existante",
                    )],
                    updates: Vec::new(),
                },
            )
            .await
            .expect("fiche Manga préexistante");

            let result = write_library_document_import(&pool, &payload, false).await;
            assert!(
                result.is_err(),
                "un profil qui ne contient que des Mangas n'est pas vide"
            );
        });
    }

    #[test]
    fn anime_collection_import_replaces_only_the_anime_library() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            write_series_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: vec![portable_series(
                        "default",
                        "serie-conservee",
                        "Série conservée",
                        "série télé",
                    )],
                    updates: Vec::new(),
                },
            )
            .await
            .expect("série télé conservée");
            write_anime_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: vec![portable_anime(
                        "default",
                        "anime-ancien",
                        "Ancien animé",
                        None,
                    )],
                    updates: Vec::new(),
                },
            )
            .await
            .expect("animation initiale");

            let replacement = write_anime_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: true,
                    inserts: vec![portable_anime(
                        "default",
                        "anime-nouveau",
                        "Nouvel animé",
                        Some("animation"),
                    )],
                    updates: Vec::new(),
                },
            )
            .await
            .expect("remplacement de la bibliothèque Animation");
            assert_eq!(
                replacement,
                CollectionImportResult {
                    inserted: 1,
                    updated: 0,
                    removed: 1
                }
            );

            let anime_ids: Vec<(String,)> =
                sqlx::query_as("SELECT id FROM anime WHERE profile_id = 'default' ORDER BY id")
                    .fetch_all(&pool)
                    .await
                    .expect("animations après remplacement");
            let series_ids: Vec<(String,)> =
                sqlx::query_as("SELECT id FROM series WHERE profile_id = 'default' ORDER BY id")
                    .fetch_all(&pool)
                    .await
                    .expect("séries après remplacement");
            assert_eq!(anime_ids, vec![("anime-nouveau".to_string(),)]);
            assert_eq!(
                series_ids,
                vec![("serie-conservee".to_string(),)],
                "remplacer la bibliothèque Animation ne doit jamais toucher Séries"
            );

            let mut enriched = portable_anime("default", "anime-nouveau", "Animé enrichi", None);
            enriched.status = "abandonnée".to_string();
            enriched.seasons_seen = Some(4);
            enriched.seasons_total = Some(6);
            enriched.personal_note = Some("Note mise à jour.".to_string());
            let merge = write_anime_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: Vec::new(),
                    updates: vec![enriched],
                },
            )
            .await
            .expect("mise à jour fusionnée de l'animation");
            assert_eq!(
                merge,
                CollectionImportResult {
                    inserted: 0,
                    updated: 1,
                    removed: 0
                }
            );

            let merged: (String, String, i64, i64, String) = sqlx::query_as(
                "SELECT title, status, seasons_seen, seasons_total, personal_note FROM anime WHERE id = 'anime-nouveau'",
            )
            .fetch_one(&pool)
            .await
            .expect("animation fusionnée");
            assert_eq!(
                merged,
                (
                    "Animé enrichi".to_string(),
                    "abandonnée".to_string(),
                    4,
                    6,
                    "Note mise à jour.".to_string()
                ),
                "la fusion doit mettre à jour tous les champs de la fiche Animation"
            );
        });
    }

    #[test]
    fn mangas_collection_import_is_atomic_with_quotes() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            let manga = |id: &str, title: &str, quote_id: &str, body: &str| ImportManga {
                id: id.to_string(),
                profile_id: "default".to_string(),
                title: title.to_string(),
                author: Some("Mangaka".to_string()),
                year: Some(2020),
                summary: None,
                category: Some("manga".to_string()),
                status: "en cours".to_string(),
                rating: Some(4.0),
                is_favorite: true,
                volumes_read: Some(1),
                volumes_total: Some(10),
                progress_updated_at: None,
                started_at: None,
                cover_url: None,
                personal_note: None,
                created_at: "2026-07-25T10:00:00.000Z".to_string(),
                updated_at: "2026-07-25T10:00:00.000Z".to_string(),
                quotes: vec![ImportBookQuote {
                    id: quote_id.to_string(),
                    book_id: id.to_string(),
                    body: body.to_string(),
                    position: 0,
                    created_at: "2026-07-25T10:00:00.000Z".to_string(),
                }],
            };

            write_mangas_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: vec![manga(
                        "manga-existing",
                        "Manga conservé",
                        "quote-existing",
                        "Citation conservée",
                    )],
                    updates: Vec::new(),
                },
            )
            .await
            .expect("manga initial");

            let failing = CollectionImportPlan {
                profile_id: "default".to_string(),
                replace_existing: true,
                inserts: vec![
                    manga("manga-new-a", "Nouveau A", "quote-duplicate", "Citation A"),
                    manga("manga-new-b", "Nouveau B", "quote-duplicate", "Citation B"),
                ],
                updates: Vec::new(),
            };
            assert!(
                write_mangas_import_plan(&pool, &failing).await.is_err(),
                "un conflit de citation doit annuler tout le remplacement"
            );

            let mangas: Vec<(String, String)> = sqlx::query_as(
                "SELECT id, title FROM mangas WHERE profile_id = 'default' ORDER BY id",
            )
            .fetch_all(&pool)
            .await
            .expect("mangas après rollback");
            let quotes: Vec<(String, String, String)> =
                sqlx::query_as("SELECT id, manga_id, body FROM manga_quotes ORDER BY id")
                    .fetch_all(&pool)
                    .await
                    .expect("citations après rollback");
            assert_eq!(
                mangas,
                vec![("manga-existing".to_string(), "Manga conservé".to_string())],
                "le manga initial doit survivre au remplacement échoué"
            );
            assert_eq!(
                quotes,
                vec![(
                    "quote-existing".to_string(),
                    "manga-existing".to_string(),
                    "Citation conservée".to_string(),
                )],
                "la citation initiale doit survivre au remplacement échoué"
            );

            write_mangas_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: Vec::new(),
                    updates: vec![manga(
                        "manga-existing",
                        "Manga enrichi",
                        "quote-remplacee",
                        "Citation remplacée",
                    )],
                },
            )
            .await
            .expect("mise à jour fusionnée du manga");

            let updated: (String, String) =
                sqlx::query_as("SELECT title, (SELECT body FROM manga_quotes WHERE manga_id = 'manga-existing') FROM mangas WHERE id = 'manga-existing'")
                    .fetch_one(&pool)
                    .await
                    .expect("manga fusionné");
            assert_eq!(
                updated,
                (
                    "Manga enrichi".to_string(),
                    "Citation remplacée".to_string()
                ),
                "la fusion doit remplacer le manga et ses citations"
            );
        });
    }

    #[test]
    fn series_collection_import_routes_animation_without_mixing_libraries() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            write_series_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: vec![
                        portable_series("default", "serie-tele-importee", "Télé", "série télé"),
                        portable_series("default", "anime-importe", "Animé", "animation"),
                    ],
                    updates: Vec::new(),
                },
            )
            .await
            .expect("import Séries mixte");

            let series_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM series WHERE profile_id = 'default'")
                    .fetch_one(&pool)
                    .await
                    .expect("compte séries");
            let anime_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM anime WHERE profile_id = 'default'")
                    .fetch_one(&pool)
                    .await
                    .expect("compte animations");
            assert_eq!(series_count, 1, "seule la fiche télé reste dans series");
            assert_eq!(anime_count, 1, "la fiche animation est routée vers anime");
        });
    }

    #[test]
    fn provider_links_accept_anime_and_mangas_and_follow_their_sheet() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            write_anime_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts: vec![portable_anime("default", "anime-lie", "Animé lié", None)],
                    updates: Vec::new(),
                },
            )
            .await
            .expect("animation à lier");

            for medium in ["anime", "mangas"] {
                sqlx::query(
                    "INSERT INTO media_provider_links
                     (profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at)
                     VALUES ('default', $1, $2, 'tmdb', '42', '2026-07-26T10:00:00.000Z', '2026-07-26T10:00:00.000Z')",
                )
                .bind(medium)
                .bind(if medium == "anime" {
                    "anime-lie".to_string()
                } else {
                    format!("{medium}-id")
                })
                .execute(&pool)
                .await
                .unwrap_or_else(|error| panic!("le médium {medium} doit être accepté : {error}"));
            }

            let invalid = sqlx::query(
                "INSERT INTO media_provider_links
                 (profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at)
                 VALUES ('default', 'film', 'film-id', 'tmdb', '42', '2026-07-26T10:00:00.000Z', '2026-07-26T10:00:00.000Z')",
            )
            .execute(&pool)
            .await;
            assert!(invalid.is_err(), "un médium inconnu doit être refusé");

            sqlx::query("DELETE FROM anime WHERE id = 'anime-lie'")
                .execute(&pool)
                .await
                .expect("suppression de l'animation");
            let remaining: Vec<(String,)> =
                sqlx::query_as("SELECT medium FROM media_provider_links ORDER BY medium")
                    .fetch_all(&pool)
                    .await
                    .expect("liens restants");
            assert_eq!(
                remaining,
                vec![("mangas".to_string(),)],
                "le déclencheur doit retirer le lien Animation avec sa fiche"
            );
        });
    }
}
