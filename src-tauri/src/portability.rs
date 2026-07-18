use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Write,
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

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupSettings {
    backup_directory: String,
    last_automatic_snapshot_day: Option<String>,
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
struct ImportProfile {
    id: String,
    name: String,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportFilm {
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLibraryResult {
    profile_id: String,
    film_count: usize,
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

async fn sqlite_pool(db_instances: &DbInstances) -> Result<sqlx::SqlitePool, String> {
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
            backup_directory,
            last_automatic_snapshot_day,
        },
    ))
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
        .bind(&film.original_title)
        .bind(film.year)
        .bind(&film.status)
        .bind(if film.is_favorite { 1 } else { 0 })
        .bind(film.rating)
        .bind(&film.watched_at)
        .bind(&film.personal_note)
        .bind(&film.director)
        .bind(&film.summary)
        .bind(&film.provider_name)
        .bind(&film.provider_id)
        .bind(&film.poster_url)
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

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> sqlx::SqlitePool {
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

            fs::remove_dir_all(directory).expect("nettoyage du dossier temporaire");
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
}
