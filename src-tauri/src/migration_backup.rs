//! Copie de sécurité de la base avant une migration de schéma.
//!
//! Le greffon SQL applique les migrations dès son initialisation. Ce greffon,
//! enregistré avant lui, copie d’abord `sylloge.db` quand une migration est en
//! attente : une migration ratée ne peut plus faire perdre une bibliothèque.
//! La copie passe par `VACUUM INTO`, cohérente même avec un journal WAL. Elle
//! reste interne à l’application : la sauvegarde ordinaire est le JSON.

use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteConnection},
    ConnectOptions, Connection,
};
use tauri::{plugin::TauriPlugin, Manager, Runtime};

use crate::portability::civil_from_days;

pub const DATABASE_FILE_NAME: &str = "sylloge.db";
pub const BACKUP_DIRECTORY_NAME: &str = "sauvegardes-avant-migration";
/// Copies avant migration conservées (les plus récentes).
pub const RETAINED_MIGRATION_BACKUPS: usize = 3;
const BACKUP_PREFIX: &str = "sylloge-avant-migration-";

#[derive(Debug, PartialEq, Eq)]
pub enum MigrationBackupOutcome {
    /// Pas de base existante : premier lancement.
    NoDatabase,
    /// Base jamais migrée par Sylloge : rien à protéger.
    NotManaged,
    /// Schéma déjà à jour.
    UpToDate,
    Saved(PathBuf),
}

pub fn latest_migration_version() -> i64 {
    crate::database::migrations()
        .iter()
        .map(|migration| migration.version)
        .max()
        .unwrap_or(0)
}

/// Copie `database` dans `backup_directory` si sa version de schéma est
/// inférieure à `target_version`. Ne modifie jamais la base source.
pub async fn backup_before_migration(
    database: &Path,
    backup_directory: &Path,
    target_version: i64,
    now: SystemTime,
) -> Result<MigrationBackupOutcome, String> {
    if !database.is_file() {
        return Ok(MigrationBackupOutcome::NoDatabase);
    }
    let mut connection = SqliteConnectOptions::new()
        .filename(database)
        .read_only(true)
        .connect()
        .await
        .map_err(|error| format!("Base illisible avant migration : {error}"))?;

    let managed: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_one(&mut connection)
    .await
    .map_err(|error| format!("Registre des migrations illisible : {error}"))?;
    if managed == 0 {
        connection.close().await.ok();
        return Ok(MigrationBackupOutcome::NotManaged);
    }
    let current: Option<i64> =
        sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations WHERE success = 1")
            .fetch_one(&mut connection)
            .await
            .map_err(|error| format!("Version du schéma illisible : {error}"))?;
    let current = current.unwrap_or(0);
    if current >= target_version {
        connection.close().await.ok();
        return Ok(MigrationBackupOutcome::UpToDate);
    }

    fs::create_dir_all(backup_directory).map_err(|error| {
        format!("Dossier des copies avant migration impossible à créer : {error}")
    })?;
    let target = unique_backup_path(backup_directory, current, target_version, now);
    let result = vacuum_into(&mut connection, &target).await;
    connection.close().await.ok();
    if let Err(error) = result {
        let _ = fs::remove_file(&target);
        return Err(error);
    }
    verify_copy(&target).await?;
    prune_migration_backups(backup_directory, RETAINED_MIGRATION_BACKUPS)?;
    Ok(MigrationBackupOutcome::Saved(target))
}

async fn vacuum_into(connection: &mut SqliteConnection, target: &Path) -> Result<(), String> {
    let target = target
        .to_str()
        .ok_or_else(|| "Chemin de copie avant migration illisible.".to_string())?;
    sqlx::query("VACUUM INTO $1")
        .bind(target)
        .execute(connection)
        .await
        .map(|_| ())
        .map_err(|error| format!("Copie de la base avant migration impossible : {error}"))
}

async fn verify_copy(target: &Path) -> Result<(), String> {
    let mut copy = SqliteConnectOptions::new()
        .filename(target)
        .read_only(true)
        .connect()
        .await
        .map_err(|error| format!("Copie avant migration illisible : {error}"))?;
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&mut copy)
        .await
        .map_err(|error| format!("Copie avant migration non vérifiable : {error}"))?;
    copy.close().await.ok();
    if integrity != "ok" {
        let _ = fs::remove_file(target);
        return Err(format!("Copie avant migration corrompue : {integrity}"));
    }
    Ok(())
}

fn unique_backup_path(directory: &Path, from: i64, to: i64, now: SystemTime) -> PathBuf {
    let seconds = now
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    let (year, month, day) = civil_from_days(seconds.div_euclid(86_400));
    let in_day = seconds.rem_euclid(86_400);
    let stamp = format!(
        "{year:04}-{month:02}-{day:02}-{:02}h{:02}m{:02}s",
        in_day / 3_600,
        in_day % 3_600 / 60,
        in_day % 60
    );
    let base = format!("{BACKUP_PREFIX}v{from}-vers-v{to}-{stamp}");
    let mut candidate = directory.join(format!("{base}.db"));
    let mut index = 2;
    while candidate.exists() {
        candidate = directory.join(format!("{base}-{index}.db"));
        index += 1;
    }
    candidate
}

/// Garde les `keep` copies les plus récentes ; ne touche qu’aux fichiers
/// réguliers nommés par ce module.
pub fn prune_migration_backups(directory: &Path, keep: usize) -> Result<(), String> {
    let mut owned: Vec<(SystemTime, PathBuf)> = fs::read_dir(directory)
        .map_err(|error| format!("Dossier des copies avant migration illisible : {error}"))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_str()?.to_string();
            let metadata = entry.path().symlink_metadata().ok()?;
            (name.starts_with(BACKUP_PREFIX) && name.ends_with(".db") && metadata.is_file())
                .then(|| (metadata.modified().unwrap_or(UNIX_EPOCH), entry.path()))
        })
        .collect();
    owned.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| right.1.cmp(&left.1)));
    for (_, path) in owned.into_iter().skip(keep) {
        fs::remove_file(&path)
            .map_err(|error| format!("Ancienne copie avant migration non supprimée : {error}"))?;
    }
    Ok(())
}

/// Greffon à enregistrer AVANT `tauri_plugin_sql` : son initialisation
/// s’exécute avant celle qui applique les migrations.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("sylloge-migration-backup")
        .setup(|app, _api| {
            let Ok(directory) = app.path().app_config_dir() else {
                log::warn!("Dossier de l’application introuvable : copie avant migration ignorée.");
                return Ok(());
            };
            let database = directory.join(DATABASE_FILE_NAME);
            let backups = directory.join(BACKUP_DIRECTORY_NAME);
            let outcome = tauri::async_runtime::block_on(backup_before_migration(
                &database,
                &backups,
                latest_migration_version(),
                SystemTime::now(),
            ));
            match outcome {
                Ok(MigrationBackupOutcome::Saved(path)) => {
                    log::info!("Copie avant migration : {}", path.display())
                }
                Ok(_) => {}
                // La migration suit quand même : la bloquer rendrait l’application
                // inutilisable. L’échec est journalisé pour le diagnostic.
                Err(error) => log::error!("{error}"),
            }
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqliteJournalMode;
    use std::time::Duration;

    struct TempDir(PathBuf);
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn temp_dir(label: &str) -> TempDir {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("sylloge-migration-{label}-{nanos}"));
        fs::create_dir_all(&path).unwrap();
        TempDir(path)
    }

    /// Base au schéma `version` via le vrai migrateur sqlx, en WAL comme
    /// l’application. La connexion reste ouverte : la ligne écrite vit
    /// encore dans le journal WAL au moment de la copie.
    async fn database_at(path: &Path, version: i64) -> SqliteConnection {
        let migrations: Vec<_> = crate::database::migrations()
            .into_iter()
            .filter(|migration| migration.version <= version)
            .map(|migration| {
                sqlx::migrate::Migration::new(
                    migration.version,
                    migration.description.into(),
                    sqlx::migrate::MigrationType::Simple,
                    migration.sql.into(),
                    false,
                )
            })
            .collect();
        let migrator = sqlx::migrate::Migrator {
            migrations: migrations.into(),
            ..sqlx::migrate::Migrator::DEFAULT
        };
        let mut connection = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .connect()
            .await
            .unwrap();
        migrator.run(&mut connection).await.unwrap();
        sqlx::query(
            "INSERT INTO profiles (id, name, created_at, updated_at) VALUES ('p', 'Profil', 'x', 'x')",
        )
        .execute(&mut connection)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO films (id, profile_id, title, created_at, updated_at) VALUES ('f', 'p', 'Film dans le WAL', 'x', 'x')",
        )
        .execute(&mut connection)
        .await
        .unwrap();
        connection
    }

    fn at(seconds: u64) -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(seconds)
    }

    #[test]
    fn copies_a_database_behind_the_latest_schema_with_its_wal_rows() {
        tauri::async_runtime::block_on(async {
            let dir = temp_dir("behind");
            let database = dir.0.join(DATABASE_FILE_NAME);
            let latest = latest_migration_version();
            let previous = latest - 1;
            let writer = database_at(&database, previous).await;
            let before = fs::read(&database).unwrap();

            let outcome = backup_before_migration(
                &database,
                &dir.0.join("copies"),
                latest,
                at(1_792_670_000),
            )
            .await
            .unwrap();
            let MigrationBackupOutcome::Saved(copy) = outcome else {
                panic!("{outcome:?}")
            };
            assert_eq!(
                copy.file_name().unwrap().to_str().unwrap(),
                format!(
                    "sylloge-avant-migration-v{previous}-vers-v{latest}-2026-10-22-11h53m20s.db"
                )
            );
            let mut connection = SqliteConnectOptions::new()
                .filename(&copy)
                .read_only(true)
                .connect()
                .await
                .unwrap();
            let title: String = sqlx::query_scalar("SELECT title FROM films WHERE id = 'f'")
                .fetch_one(&mut connection)
                .await
                .unwrap();
            assert_eq!(title, "Film dans le WAL");
            let version: i64 = sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
                .fetch_one(&mut connection)
                .await
                .unwrap();
            assert_eq!(version, previous);
            assert_eq!(
                fs::read(&database).unwrap(),
                before,
                "la base source ne doit pas changer"
            );
            writer.close().await.unwrap();
        });
    }

    #[test]
    fn does_nothing_when_up_to_date_absent_or_unmanaged() {
        tauri::async_runtime::block_on(async {
            let dir = temp_dir("noop");
            let copies = dir.0.join("copies");
            let database = dir.0.join(DATABASE_FILE_NAME);
            let latest = latest_migration_version();
            assert_eq!(
                backup_before_migration(&database, &copies, latest, at(0))
                    .await
                    .unwrap(),
                MigrationBackupOutcome::NoDatabase
            );

            let unmanaged = dir.0.join("autre.db");
            let mut connection = SqliteConnectOptions::new()
                .filename(&unmanaged)
                .create_if_missing(true)
                .connect()
                .await
                .unwrap();
            sqlx::query("CREATE TABLE t (x)")
                .execute(&mut connection)
                .await
                .unwrap();
            connection.close().await.unwrap();
            assert_eq!(
                backup_before_migration(&unmanaged, &copies, latest, at(0))
                    .await
                    .unwrap(),
                MigrationBackupOutcome::NotManaged
            );

            let writer = database_at(&database, latest).await;
            assert_eq!(
                backup_before_migration(&database, &copies, latest, at(0))
                    .await
                    .unwrap(),
                MigrationBackupOutcome::UpToDate
            );
            assert!(
                !copies.exists(),
                "aucun dossier créé sans migration en attente"
            );
            writer.close().await.unwrap();
        });
    }

    #[test]
    fn keeps_the_three_newest_copies_and_never_touches_other_files() {
        tauri::async_runtime::block_on(async {
            let dir = temp_dir("prune");
            let copies = dir.0.join("copies");
            let database = dir.0.join(DATABASE_FILE_NAME);
            let writer = database_at(&database, 18).await;
            fs::create_dir_all(&copies).unwrap();
            fs::write(copies.join("notes.db"), "à garder").unwrap();
            let mut saved = Vec::new();
            for step in 0..5u64 {
                let outcome = backup_before_migration(
                    &database,
                    &copies,
                    latest_migration_version(),
                    at(1_000 + step),
                )
                .await
                .unwrap();
                let MigrationBackupOutcome::Saved(path) = outcome else {
                    panic!("{outcome:?}")
                };
                saved.push(path);
                std::thread::sleep(Duration::from_millis(20));
            }
            let remaining: Vec<String> = fs::read_dir(&copies)
                .unwrap()
                .map(|entry| entry.unwrap().file_name().into_string().unwrap())
                .collect();
            assert_eq!(remaining.len(), 4, "{remaining:?}");
            assert!(remaining.contains(&"notes.db".to_string()));
            for kept in &saved[2..] {
                assert!(kept.exists(), "{kept:?}");
            }
            for removed in &saved[..2] {
                assert!(!removed.exists(), "{removed:?}");
            }
            writer.close().await.unwrap();
        });
    }

    #[test]
    fn latest_version_follows_the_registered_migrations() {
        assert_eq!(latest_migration_version(), 21);
    }
}
