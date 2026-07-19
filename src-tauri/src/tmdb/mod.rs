mod cache;
mod client;
mod embedded_key;
mod secrets;

use std::fmt;

use cache::{CacheService, Clock, SqliteFilmTmdbCacheRepository, SystemClock};
use client::{ReqwestTmdbClient, TmdbClient};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::database::DATABASE_URL;

pub use cache::CachedFilmTmdbPresentationDto;
pub use client::TmdbSearchCandidateDto;
use secrets::SecretValue;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TmdbError {
    ClockUnavailable,
    Database(String),
    InvalidCache(&'static str),
    NetworkUnavailable,
    ProviderError(u16),
    InvalidProviderResponse,
}

impl fmt::Display for TmdbError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ClockUnavailable => formatter.write_str("L'horloge système est indisponible."),
            Self::Database(message) => formatter.write_str(message),
            Self::InvalidCache(reason) => {
                write!(formatter, "Le cache TMDB est invalide : {reason}.")
            }
            Self::NetworkUnavailable => {
                formatter.write_str("La connexion au service de métadonnées a échoué.")
            }
            Self::ProviderError(status) => {
                write!(
                    formatter,
                    "Le service de métadonnées a renvoyé une erreur ({status})."
                )
            }
            Self::InvalidProviderResponse => {
                formatter.write_str("La réponse du service de métadonnées est invalide.")
            }
        }
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PurgeTmdbCacheResult {
    purged_count: u64,
}

#[tauri::command]
pub async fn get_film_tmdb_cache(
    db_instances: State<'_, DbInstances>,
    film_id: String,
) -> Result<Option<CachedFilmTmdbPresentationDto>, String> {
    let pool = sqlite_pool(&db_instances).await.map_err(error_message)?;
    CacheService::new(SqliteFilmTmdbCacheRepository::new(pool), SystemClock)
        .read(&film_id)
        .await
        .map_err(error_message)
}

#[tauri::command]
pub async fn purge_expired_tmdb_cache(
    db_instances: State<'_, DbInstances>,
) -> Result<PurgeTmdbCacheResult, String> {
    let purged_count = purge_expired_cache_with_clock(&db_instances, SystemClock)
        .await
        .map_err(error_message)?;

    Ok(PurgeTmdbCacheResult { purged_count })
}

#[tauri::command]
pub async fn search_tmdb_films(
    query: String,
    language: Option<String>,
) -> Result<Vec<TmdbSearchCandidateDto>, String> {
    let secret = get_secret().await?;
    let client = ReqwestTmdbClient::new().map_err(error_message)?;
    let language = language.unwrap_or_else(|| "fr-FR".to_string());

    client
        .search_films(&secret, &query, &language)
        .await
        .map_err(error_message)
}

#[tauri::command]
pub async fn associate_film_with_tmdb(
    db_instances: State<'_, DbInstances>,
    film_id: String,
    tmdb_id: i64,
    language: Option<String>,
) -> Result<CachedFilmTmdbPresentationDto, String> {
    let secret = get_secret().await?;
    let client = ReqwestTmdbClient::new().map_err(error_message)?;
    let language = language.unwrap_or_else(|| "fr-FR".to_string());

    let presentation = client
        .fetch_film_presentation(&secret, tmdb_id, &language)
        .await
        .map_err(error_message)?;

    let pool = sqlite_pool(&db_instances).await.map_err(error_message)?;
    let service = CacheService::new(SqliteFilmTmdbCacheRepository::new(pool), SystemClock);
    service
        .replace(&film_id, &language, presentation)
        .await
        .map_err(error_message)?;

    service
        .read(&film_id)
        .await
        .map_err(error_message)?
        .ok_or_else(|| "Le cache TMDB n'a pas pu être relu après écriture.".to_string())
}

#[tauri::command]
pub async fn refresh_film_tmdb_cache(
    db_instances: State<'_, DbInstances>,
    film_id: String,
    language: Option<String>,
) -> Result<CachedFilmTmdbPresentationDto, String> {
    let secret = get_secret().await?;
    let client = ReqwestTmdbClient::new().map_err(error_message)?;
    let language = language.unwrap_or_else(|| "fr-FR".to_string());

    let pool = sqlite_pool(&db_instances).await.map_err(error_message)?;
    let service = CacheService::new(SqliteFilmTmdbCacheRepository::new(pool), SystemClock);

    // Lire le cache actuel pour récupérer le tmdb_id
    let current = service
        .read(&film_id)
        .await
        .map_err(error_message)?
        .ok_or_else(|| "Aucun cache TMDB à rafraîchir pour ce film.".to_string())?;

    let presentation = client
        .fetch_film_presentation(&secret, current.presentation.tmdb_id, &language)
        .await
        .map_err(error_message)?;

    service
        .replace(&film_id, &language, presentation)
        .await
        .map_err(error_message)?;

    service
        .read(&film_id)
        .await
        .map_err(error_message)?
        .ok_or_else(|| "Le cache TMDB n'a pas pu être relu après rafraîchissement.".to_string())
}

#[tauri::command]
pub async fn remove_tmdb_association(
    db_instances: State<'_, DbInstances>,
    film_id: String,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await.map_err(error_message)?;
    let service = CacheService::new(SqliteFilmTmdbCacheRepository::new(pool), SystemClock);
    service
        .delete_for_film(&film_id)
        .await
        .map_err(error_message)?;
    Ok(())
}

async fn get_secret() -> Result<SecretValue, String> {
    let key = embedded_key::embedded_api_key();
    if key == "PLACEHOLDER" {
        return Err("La clé TMDB n'est pas configurée. Contactez le développeur.".to_string());
    }
    Ok(SecretValue::new(key))
}

pub fn schedule_expired_cache_purge<R: Runtime>(app_handle: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let result = {
            let db_instances = app_handle.state::<DbInstances>();
            purge_expired_cache_with_clock(&db_instances, SystemClock).await
        };

        if let Err(error) = result {
            log::warn!("La purge du cache TMDB au démarrage a échoué : {error}");
        }
    });
}

async fn purge_expired_cache_with_clock<TimeSource>(
    db_instances: &DbInstances,
    clock: TimeSource,
) -> Result<u64, TmdbError>
where
    TimeSource: Clock,
{
    let pool = sqlite_pool(db_instances).await?;
    CacheService::new(SqliteFilmTmdbCacheRepository::new(pool), clock)
        .purge_expired()
        .await
}

async fn sqlite_pool(db_instances: &DbInstances) -> Result<sqlx::SqlitePool, TmdbError> {
    let instances = db_instances.0.read().await;
    let database = instances.get(DATABASE_URL).ok_or_else(|| {
        TmdbError::Database("La base SQLite Sylloge n’est pas chargée.".to_string())
    })?;

    match database {
        DbPool::Sqlite(pool) => Ok(pool.clone()),
        #[allow(unreachable_patterns)]
        _ => Err(TmdbError::Database(
            "La base Sylloge chargée n’est pas SQLite.".to_string(),
        )),
    }
}

fn error_message(error: TmdbError) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;

    const BASE_TIME: i64 = 1_768_737_600;
    const SECONDS_PER_DAY: i64 = 86_400;

    #[derive(Clone, Copy)]
    struct FakeClock {
        now: i64,
    }

    impl Clock for FakeClock {
        fn now_epoch_seconds(&self) -> Result<i64, TmdbError> {
            Ok(self.now)
        }
    }

    #[test]
    fn startup_purge_removes_an_unread_expired_row_and_keeps_a_future_row() {
        tauri::async_runtime::block_on(async {
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .expect("base SQLite de démarrage");

            for migration in crate::database::migrations() {
                sqlx::raw_sql(migration.sql)
                    .execute(&pool)
                    .await
                    .expect("migration SQLite de démarrage");
            }

            for (film_id, title) in [
                ("film-expired-unread", "Cache expiré jamais relu"),
                ("film-future-unread", "Cache non expiré jamais relu"),
            ] {
                sqlx::query("INSERT INTO films (id, profile_id, title) VALUES ($1, 'default', $2)")
                    .bind(film_id)
                    .bind(title)
                    .execute(&pool)
                    .await
                    .expect("Film de test au démarrage");
            }

            for (film_id, tmdb_id, fetched_at) in [
                (
                    "film-expired-unread",
                    201_i64,
                    BASE_TIME - 180 * SECONDS_PER_DAY,
                ),
                (
                    "film-future-unread",
                    202_i64,
                    BASE_TIME - 179 * SECONDS_PER_DAY,
                ),
            ] {
                sqlx::query(
                    "INSERT INTO film_tmdb_cache (
                        film_id, tmdb_id, language, payload_json,
                        fetched_at, refresh_after, expires_at
                     ) VALUES (
                        $1, $2, 'fr-FR', '{}',
                        strftime('%Y-%m-%dT%H:%M:%SZ', $3, 'unixepoch'),
                        strftime('%Y-%m-%dT%H:%M:%SZ', $4, 'unixepoch'),
                        strftime('%Y-%m-%dT%H:%M:%SZ', $5, 'unixepoch')
                     )",
                )
                .bind(film_id)
                .bind(tmdb_id)
                .bind(fetched_at)
                .bind(fetched_at + cache::REFRESH_AFTER_DAYS * SECONDS_PER_DAY)
                .bind(fetched_at + cache::EXPIRES_AFTER_DAYS * SECONDS_PER_DAY)
                .execute(&pool)
                .await
                .expect("cache jamais relu injecté");
            }

            let db_instances = DbInstances::default();
            db_instances
                .0
                .write()
                .await
                .insert(DATABASE_URL.to_string(), DbPool::Sqlite(pool.clone()));

            let purged =
                purge_expired_cache_with_clock(&db_instances, FakeClock { now: BASE_TIME })
                    .await
                    .expect("purge de démarrage");
            let remaining_film_id: String =
                sqlx::query_scalar("SELECT film_id FROM film_tmdb_cache")
                    .fetch_one(&pool)
                    .await
                    .expect("cache non expiré conservé");

            assert_eq!(purged, 1);
            assert_eq!(remaining_film_id, "film-future-unread");
        });
    }
}
