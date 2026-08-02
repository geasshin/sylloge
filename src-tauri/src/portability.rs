use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{async_runtime::Mutex, AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::database::DATABASE_URL;

const SNAPSHOT_RETENTION_COUNT: usize = 30;
const SNAPSHOT_PREFIX: &str = "sylloge-films-v1-";
const MAX_IMPORT_FILE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_ZIP_CONTAINER_ENTRIES: usize = 512;
const MAX_ZIP_PATH_COMPONENTS: usize = 8;
const MAX_ZIP_NESTING_DEPTH: usize = 4;
const MAX_ZIP_UNCOMPRESSED_BYTES: u128 = 32 * 1024 * 1024;
const MAX_ZIP_ENTRY_BYTES: u64 = 4 * 1024 * 1024;
static SNAPSHOT_NONCE: AtomicU64 = AtomicU64::new(0);

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
}

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
    books: Vec<ImportBook>,
    games: Vec<ImportGame>,
    artworks: Vec<ImportArtwork>,
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
    created_at: String,
    updated_at: String,
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
    book_count: usize,
    game_count: usize,
    artwork_count: usize,
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
pub async fn pick_import_any(app: AppHandle) -> Result<Option<PickedAnyImportFile>, String> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("Import Sylloge (JSON, CSV, ZIP)", &["json", "csv", "zip"])
        .set_title("Choisir un fichier à importer")
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
pub async fn pick_import_container(app: AppHandle) -> Result<Option<PickedAnyImportFile>, String> {
    let Some(folder_path) = app
        .dialog()
        .file()
        .set_title("Choisir un dossier à analyser")
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
pub async fn pick_import_json(app: AppHandle) -> Result<Option<PickedJsonFile>, String> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("Export JSON Sylloge", &["json"])
        .set_title("Choisir un export Sylloge")
        .blocking_pick_file()
    else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|error| format!("Chemin de fichier illisible : {error}"))?;
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Impossible de lire le fichier choisi : {error}"))?;
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
) -> Result<Option<PickedFilmsImportFile>, String> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("CSV ou ZIP compatible", &["csv", "zip"])
        .set_title("Choisir un CSV Films ou un ZIP compatible")
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
    let metadata = fs::metadata(path)
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
    fs::read(path).map_err(|error| format!("Impossible de lire le fichier choisi : {error}"))
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
            let bytes = fs::read(&path).map_err(|error| {
                format!("Impossible de lire un fichier du dossier choisi : {error}")
            })?;
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
) -> Result<Option<String>, String> {
    save_export_file(
        &app,
        &suggested_name,
        &contents,
        "Export JSON Sylloge",
        &["json"],
        "sylloge-films.json",
    )
}

#[tauri::command]
pub async fn save_export_csv(
    app: AppHandle,
    suggested_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    save_export_file(
        &app,
        &suggested_name,
        &contents,
        "Export CSV Sylloge",
        &["csv"],
        "sylloge-films.csv",
    )
}

fn save_export_file(
    app: &AppHandle,
    suggested_name: &str,
    contents: &str,
    filter_name: &str,
    extensions: &[&str],
    fallback_name: &str,
) -> Result<Option<String>, String> {
    let safe_name = safe_export_file_name(suggested_name, fallback_name);
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter(filter_name, extensions)
        .set_file_name(&safe_name)
        .set_title("Exporter le profil Sylloge")
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
    fs::write(path, contents)
        .map_err(|error| format!("Impossible d’écrire l’export choisi : {error}"))?;
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
pub async fn pick_backup_directory(
    app: AppHandle,
    db_instances: State<'_, DbInstances>,
    backup_snapshot_lock: State<'_, BackupSnapshotLock>,
    profile_id: String,
) -> Result<Option<BackupSettings>, String> {
    let Some(folder_path) = app
        .dialog()
        .file()
        .set_title("Choisir le dossier de sauvegarde Sylloge")
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

    Ok(ImportLibraryDocumentResult {
        profile_id: payload.profile.id.clone(),
        film_count: payload.films.len(),
        series_count: payload.series.len(),
        book_count: payload.books.len(),
        game_count: payload.games.len(),
        artwork_count: payload.artworks.len(),
    })
}

#[tauri::command]
pub async fn import_library_document_into_empty_profile(
    db_instances: State<'_, DbInstances>,
    payload: ImportLibraryDocumentPayload,
) -> Result<ImportLibraryDocumentResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    write_library_document_import(&pool, &payload, false).await?;

    Ok(ImportLibraryDocumentResult {
        profile_id: payload.profile.id.clone(),
        film_count: payload.films.len(),
        series_count: payload.series.len(),
        book_count: payload.books.len(),
        game_count: payload.games.len(),
        artwork_count: payload.artworks.len(),
    })
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

fn snapshot_prefix(profile_id: &str) -> String {
    let mut token = String::new();
    for byte in profile_id.as_bytes() {
        if byte.is_ascii_alphanumeric() || *byte == b'-' {
            token.push(char::from(*byte));
        } else {
            use std::fmt::Write as _;
            write!(&mut token, "{byte:02x}").expect("écriture dans une chaîne");
        }
    }
    format!("{SNAPSHOT_PREFIX}{token}-")
}

fn snapshot_file_name(profile_id: &str, sequence: u128) -> String {
    let nonce = SNAPSHOT_NONCE.fetch_add(1, Ordering::Relaxed);
    format!(
        "{}{:020}-{nonce:020}.json",
        snapshot_prefix(profile_id),
        sequence
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
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT file_name
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
        .map(|(file_name,)| RegisteredBackupSnapshot { file_name })
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
    for snapshot in snapshots.iter().skip(SNAPSHOT_RETENTION_COUNT) {
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

fn registered_snapshot_path(
    directory: &Path,
    profile_id: &str,
    file_name: &str,
) -> Option<PathBuf> {
    let path = Path::new(file_name);
    let is_single_file_name = path.file_name().and_then(|name| name.to_str()) == Some(file_name);
    (is_single_file_name && is_owned_snapshot_name(file_name, &snapshot_prefix(profile_id)))
        .then(|| directory.join(file_name))
}

fn is_owned_snapshot_name(file_name: &str, prefix: &str) -> bool {
    let Some(sequence_and_nonce) = file_name
        .strip_prefix(prefix)
        .and_then(|name| name.strip_suffix(".json"))
    else {
        return false;
    };
    let bytes = sequence_and_nonce.as_bytes();

    bytes.len() == 41
        && bytes[20] == b'-'
        && bytes[..20].iter().all(|byte| byte.is_ascii_digit())
        && bytes[21..].iter().all(|byte| byte.is_ascii_digit())
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
            .books
            .iter()
            .any(|book| !targets_import_profile(&book.profile_id))
        || payload
            .games
            .iter()
            .any(|game| !targets_import_profile(&game.profile_id))
        || payload
            .artworks
            .iter()
            .any(|artwork| !targets_import_profile(&artwork.profile_id))
    {
        return Err("Un élément ne cible pas le profil d’import.".to_string());
    }

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

        let existing_works: i64 = sqlx::query_scalar(
            "SELECT
                (SELECT COUNT(*) FROM films WHERE profile_id = $1)
              + (SELECT COUNT(*) FROM series WHERE profile_id = $1)
              + (SELECT COUNT(*) FROM books WHERE profile_id = $1)
              + (SELECT COUNT(*) FROM games WHERE profile_id = $1)
              + (SELECT COUNT(*) FROM artworks WHERE profile_id = $1)",
        )
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
        .bind(&series.category)
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
        .execute(&mut *transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible d’importer la série « {} » : {error}",
                series.title
            )
        })?;
    }

    for book in &payload.books {
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
        .execute(&mut *transaction)
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
            .execute(&mut *transaction)
            .await
            .map_err(|error| {
                format!(
                    "Impossible d’importer une citation du livre « {} » : {error}",
                    book.title
                )
            })?;
        }
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
        sqlx::query(
            "INSERT INTO artworks (
                id, profile_id, title, artist, year, form, location, exhibition, status,
                is_favorite, discovered_at, image_url, personal_note, created_at, updated_at
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
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
        .execute(&mut *transaction)
        .await
        .map_err(|error| {
            format!(
                "Impossible d’importer l’œuvre « {} » : {error}",
                artwork.title
            )
        })?;
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

#[derive(Serialize)]
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
        upsert_series(&mut transaction, series, true).await?;
    }
    for series in &plan.inserts {
        upsert_series(&mut transaction, series, false).await?;
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
        upsert_book(&mut transaction, book, true).await?;
    }
    for book in &plan.inserts {
        upsert_book(&mut transaction, book, false).await?;
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
        .bind(&series.category)
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
        .bind(&series.category)
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
    let result = if is_update {
        sqlx::query(
            "UPDATE artworks SET
                title = $3, artist = $4, year = $5, form = $6, location = $7,
                exhibition = $8, status = $9, is_favorite = $10, discovered_at = $11,
                image_url = $12, personal_note = $13, updated_at = $14
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
                is_favorite, discovered_at, image_url, personal_note, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
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
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

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
                retained, 30,
                "la conservation doit garder 30 entrées suivies"
            );
            assert!(
                !directory.join(&default_files[0]).exists(),
                "le snapshot suivi le plus ancien doit être retiré"
            );
            assert!(
                directory.join(&default_files[30]).exists(),
                "le snapshot suivi le plus récent doit rester"
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
                .filter(|name| is_owned_snapshot_name(name, &snapshot_prefix("default")))
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
                .filter(|name| is_owned_snapshot_name(name, &snapshot_prefix("default")))
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
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                }],
            };

            write_library_document_import(&pool, &payload, true)
                .await
                .expect("import du document v2 complet");

            let counts: (i64, i64, i64, i64, i64, i64) = sqlx::query_as(
                "SELECT
                   (SELECT COUNT(*) FROM films WHERE profile_id = 'profil-complet'),
                   (SELECT COUNT(*) FROM series WHERE profile_id = 'profil-complet'),
                   (SELECT COUNT(*) FROM books WHERE profile_id = 'profil-complet'),
                   (SELECT COUNT(*) FROM book_quotes),
                   (SELECT COUNT(*) FROM games WHERE profile_id = 'profil-complet'),
                   (SELECT COUNT(*) FROM artworks WHERE profile_id = 'profil-complet')",
            )
            .fetch_one(&pool)
            .await
            .expect("comptes des collections importées");
            assert_eq!(
                counts,
                (1, 1, 1, 1, 1, 1),
                "l'import v2 doit écrire chaque collection et ses citations"
            );

            let series_row: (String, String, i64, i64, Option<String>) = sqlx::query_as(
                "SELECT category, status, seasons_seen, seasons_total, progress_updated_at
                 FROM series WHERE id = 'series-v2'",
            )
            .fetch_one(&pool)
            .await
            .expect("relecture de la série importée");
            assert_eq!(
                series_row.0, "animation",
                "la catégorie Série doit être conservée"
            );
            assert_eq!(series_row.1, "en cours");
            assert_eq!(series_row.2, 3);
            assert_eq!(series_row.3, 8);
            assert_eq!(
                series_row.4.as_deref(),
                Some("2026-07-19T10:00:00.000Z"),
                "l'horodatage interne de progression doit être conservé"
            );

            let quote_row: (String, i64) =
                sqlx::query_as("SELECT body, position FROM book_quotes WHERE book_id = 'book-v2'")
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
                books: Vec::new(),
                games: Vec::new(),
                artworks: Vec::new(),
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
                books: Vec::new(),
                games: Vec::new(),
                artworks: Vec::new(),
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
                games: Vec::new(),
                artworks: Vec::new(),
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
}
