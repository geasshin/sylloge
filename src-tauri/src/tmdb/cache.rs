use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sqlx::SqlitePool;

use super::client::{validate_presentation, TmdbFilmPresentationDto};
use super::TmdbError;

#[allow(dead_code)]
const SECONDS_PER_DAY: i64 = 86_400;
#[allow(dead_code)]
pub const REFRESH_AFTER_DAYS: i64 = 80;
#[allow(dead_code)]
pub const EXPIRES_AFTER_DAYS: i64 = 180;
const INVALID_STORED_CACHE_REASON: &str = "contenu incohérent";

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CachedFilmTmdbPresentationDto {
    pub film_id: String,
    pub language: String,
    pub fetched_at: String,
    pub refresh_after: String,
    pub expires_at: String,
    pub refresh_due: bool,
    pub presentation: TmdbFilmPresentationDto,
}

pub trait Clock: Send + Sync {
    fn now_epoch_seconds(&self) -> Result<i64, TmdbError>;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_epoch_seconds(&self) -> Result<i64, TmdbError> {
        let seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| TmdbError::ClockUnavailable)?
            .as_secs();
        i64::try_from(seconds).map_err(|_| TmdbError::ClockUnavailable)
    }
}

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct CacheWrite {
    film_id: String,
    language: String,
    presentation: TmdbFilmPresentationDto,
    fetched_at_epoch_seconds: i64,
    refresh_after_epoch_seconds: i64,
    expires_at_epoch_seconds: i64,
}

#[allow(async_fn_in_trait)]
pub trait FilmTmdbCacheRepository: Send + Sync {
    #[allow(dead_code)]
    async fn replace_atomically(&self, write: &CacheWrite) -> Result<(), TmdbError>;
    async fn read_valid(
        &self,
        film_id: &str,
        now_epoch_seconds: i64,
    ) -> Result<Option<CachedFilmTmdbPresentationDto>, TmdbError>;
    async fn purge_expired(&self, now_epoch_seconds: i64) -> Result<u64, TmdbError>;
    #[allow(dead_code)]
    async fn delete_for_film(&self, film_id: &str) -> Result<u64, TmdbError>;
}

pub struct CacheService<Repository, TimeSource> {
    repository: Repository,
    clock: TimeSource,
}

impl<Repository, TimeSource> CacheService<Repository, TimeSource>
where
    Repository: FilmTmdbCacheRepository,
    TimeSource: Clock,
{
    pub fn new(repository: Repository, clock: TimeSource) -> Self {
        Self { repository, clock }
    }

    #[allow(dead_code)]
    pub async fn replace(
        &self,
        film_id: &str,
        language: &str,
        presentation: TmdbFilmPresentationDto,
    ) -> Result<(), TmdbError> {
        validate_film_id(film_id)?;
        validate_language(language)?;
        validate_presentation(&presentation)?;

        let fetched_at_epoch_seconds = self.clock.now_epoch_seconds()?;
        let refresh_after_epoch_seconds =
            checked_day_offset(fetched_at_epoch_seconds, REFRESH_AFTER_DAYS)?;
        let expires_at_epoch_seconds =
            checked_day_offset(fetched_at_epoch_seconds, EXPIRES_AFTER_DAYS)?;
        let write = CacheWrite {
            film_id: film_id.to_string(),
            language: language.to_string(),
            presentation,
            fetched_at_epoch_seconds,
            refresh_after_epoch_seconds,
            expires_at_epoch_seconds,
        };

        self.repository.replace_atomically(&write).await
    }

    pub async fn read(
        &self,
        film_id: &str,
    ) -> Result<Option<CachedFilmTmdbPresentationDto>, TmdbError> {
        validate_film_id(film_id)?;
        self.repository
            .read_valid(film_id, self.clock.now_epoch_seconds()?)
            .await
    }

    pub async fn purge_expired(&self) -> Result<u64, TmdbError> {
        self.repository
            .purge_expired(self.clock.now_epoch_seconds()?)
            .await
    }

    #[allow(dead_code)]
    pub async fn delete_for_film(&self, film_id: &str) -> Result<u64, TmdbError> {
        validate_film_id(film_id)?;
        self.repository.delete_for_film(film_id).await
    }
}

#[allow(dead_code)]
fn checked_day_offset(origin: i64, days: i64) -> Result<i64, TmdbError> {
    let offset = days
        .checked_mul(SECONDS_PER_DAY)
        .ok_or(TmdbError::ClockUnavailable)?;
    origin
        .checked_add(offset)
        .ok_or(TmdbError::ClockUnavailable)
}

fn validate_film_id(film_id: &str) -> Result<(), TmdbError> {
    if film_id.trim().is_empty() || film_id.len() > 512 || film_id.chars().any(char::is_control) {
        return Err(TmdbError::InvalidCache("identifiant Film incorrect"));
    }
    Ok(())
}

#[allow(dead_code)]
fn validate_language(language: &str) -> Result<(), TmdbError> {
    let bytes = language.as_bytes();
    if bytes.len() != 5
        || !bytes[0].is_ascii_lowercase()
        || !bytes[1].is_ascii_lowercase()
        || bytes[2] != b'-'
        || !bytes[3].is_ascii_uppercase()
        || !bytes[4].is_ascii_uppercase()
    {
        return Err(TmdbError::InvalidCache("langue incorrecte"));
    }
    Ok(())
}

#[derive(Clone, Copy, Debug)]
struct CacheTimestamps {
    refresh_after_epoch_seconds: i64,
    expires_at_epoch_seconds: i64,
}

fn validate_stored_cache_metadata(
    language: &str,
    fetched_at: &str,
    refresh_after: &str,
    expires_at: &str,
) -> Result<CacheTimestamps, TmdbError> {
    validate_language(language).map_err(|_| invalid_stored_cache())?;

    let fetched_at_epoch_seconds =
        parse_canonical_utc(fetched_at).ok_or_else(invalid_stored_cache)?;
    let refresh_after_epoch_seconds =
        parse_canonical_utc(refresh_after).ok_or_else(invalid_stored_cache)?;
    let expires_at_epoch_seconds =
        parse_canonical_utc(expires_at).ok_or_else(invalid_stored_cache)?;
    let latest_refresh = checked_day_offset(fetched_at_epoch_seconds, REFRESH_AFTER_DAYS)
        .map_err(|_| invalid_stored_cache())?;
    let latest_expiration = checked_day_offset(fetched_at_epoch_seconds, EXPIRES_AFTER_DAYS)
        .map_err(|_| invalid_stored_cache())?;

    if fetched_at_epoch_seconds > refresh_after_epoch_seconds
        || refresh_after_epoch_seconds > expires_at_epoch_seconds
        || refresh_after_epoch_seconds > latest_refresh
        || expires_at_epoch_seconds > latest_expiration
    {
        return Err(invalid_stored_cache());
    }

    Ok(CacheTimestamps {
        refresh_after_epoch_seconds,
        expires_at_epoch_seconds,
    })
}

fn parse_canonical_utc(value: &str) -> Option<i64> {
    let bytes = value.as_bytes();
    if bytes.len() != 20
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'Z'
    {
        return None;
    }

    let year = parse_decimal(&bytes[0..4])?;
    let month = parse_decimal(&bytes[5..7])?;
    let day = parse_decimal(&bytes[8..10])?;
    let hour = parse_decimal(&bytes[11..13])?;
    let minute = parse_decimal(&bytes[14..16])?;
    let second = parse_decimal(&bytes[17..19])?;

    if !(1..=12).contains(&month)
        || day < 1
        || day > days_in_month(year, month)
        || hour > 23
        || minute > 59
        || second > 59
    {
        return None;
    }

    let days_since_epoch = days_from_civil(year, month, day);
    days_since_epoch
        .checked_mul(SECONDS_PER_DAY)?
        .checked_add(hour.checked_mul(3_600)?)?
        .checked_add(minute.checked_mul(60)?)?
        .checked_add(second)
}

fn parse_decimal(bytes: &[u8]) -> Option<i64> {
    if !bytes.iter().all(|byte| byte.is_ascii_digit()) {
        return None;
    }

    bytes.iter().try_fold(0_i64, |value, byte| {
        value.checked_mul(10)?.checked_add(i64::from(byte - b'0'))
    })
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        _ => 0,
    }
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let adjusted_year = year - i64::from(month <= 2);
    let era = if adjusted_year >= 0 {
        adjusted_year
    } else {
        adjusted_year - 399
    } / 400;
    let year_of_era = adjusted_year - era * 400;
    let shifted_month = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

fn invalid_stored_cache() -> TmdbError {
    TmdbError::InvalidCache(INVALID_STORED_CACHE_REASON)
}

#[derive(Clone, Debug)]
pub struct SqliteFilmTmdbCacheRepository {
    pool: SqlitePool,
}

impl SqliteFilmTmdbCacheRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl FilmTmdbCacheRepository for SqliteFilmTmdbCacheRepository {
    async fn replace_atomically(&self, write: &CacheWrite) -> Result<(), TmdbError> {
        let payload_json = serde_json::to_string(&write.presentation)
            .map_err(|_| TmdbError::InvalidCache("présentation non sérialisable"))?;

        sqlx::query(
            "INSERT INTO film_tmdb_cache (
                film_id, tmdb_id, language, payload_json, fetched_at, refresh_after, expires_at
             ) VALUES (
                $1, $2, $3, $4,
                strftime('%Y-%m-%dT%H:%M:%SZ', $5, 'unixepoch'),
                strftime('%Y-%m-%dT%H:%M:%SZ', $6, 'unixepoch'),
                strftime('%Y-%m-%dT%H:%M:%SZ', $7, 'unixepoch')
             )
             ON CONFLICT(film_id) DO UPDATE SET
                tmdb_id = excluded.tmdb_id,
                language = excluded.language,
                payload_json = excluded.payload_json,
                fetched_at = excluded.fetched_at,
                refresh_after = excluded.refresh_after,
                expires_at = excluded.expires_at",
        )
        .bind(&write.film_id)
        .bind(write.presentation.tmdb_id)
        .bind(&write.language)
        .bind(payload_json)
        .bind(write.fetched_at_epoch_seconds)
        .bind(write.refresh_after_epoch_seconds)
        .bind(write.expires_at_epoch_seconds)
        .execute(&self.pool)
        .await
        .map_err(database_error)?;

        Ok(())
    }

    async fn read_valid(
        &self,
        film_id: &str,
        now_epoch_seconds: i64,
    ) -> Result<Option<CachedFilmTmdbPresentationDto>, TmdbError> {
        let mut transaction = self.pool.begin().await.map_err(database_error)?;

        let row: Option<(i64, String, String, String, String, String)> = sqlx::query_as(
            "SELECT tmdb_id, language, payload_json, fetched_at, refresh_after, expires_at
             FROM film_tmdb_cache
             WHERE film_id = $1",
        )
        .bind(film_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(database_error)?;

        let Some((tmdb_id, language, payload_json, fetched_at, refresh_after, expires_at)) = row
        else {
            transaction.commit().await.map_err(database_error)?;
            return Ok(None);
        };

        let timestamps = match validate_stored_cache_metadata(
            &language,
            &fetched_at,
            &refresh_after,
            &expires_at,
        ) {
            Ok(timestamps) => timestamps,
            Err(_) => {
                purge_invalid_row(&mut transaction, film_id).await?;
                transaction.commit().await.map_err(database_error)?;
                return Err(invalid_stored_cache());
            }
        };
        if timestamps.expires_at_epoch_seconds <= now_epoch_seconds {
            purge_invalid_row(&mut transaction, film_id).await?;
            transaction.commit().await.map_err(database_error)?;
            return Ok(None);
        }

        let presentation: TmdbFilmPresentationDto = match serde_json::from_str(&payload_json) {
            Ok(presentation) => presentation,
            Err(_) => {
                purge_invalid_row(&mut transaction, film_id).await?;
                transaction.commit().await.map_err(database_error)?;
                return Err(invalid_stored_cache());
            }
        };
        if presentation.tmdb_id != tmdb_id || validate_presentation(&presentation).is_err() {
            purge_invalid_row(&mut transaction, film_id).await?;
            transaction.commit().await.map_err(database_error)?;
            return Err(invalid_stored_cache());
        }

        transaction.commit().await.map_err(database_error)?;
        Ok(Some(CachedFilmTmdbPresentationDto {
            film_id: film_id.to_string(),
            language,
            fetched_at,
            refresh_after,
            expires_at,
            refresh_due: timestamps.refresh_after_epoch_seconds <= now_epoch_seconds,
            presentation,
        }))
    }

    async fn purge_expired(&self, now_epoch_seconds: i64) -> Result<u64, TmdbError> {
        let mut transaction = self.pool.begin().await.map_err(database_error)?;
        let stored_metadata: Vec<(String, String, String, String, String)> = sqlx::query_as(
            "SELECT film_id, language, fetched_at, refresh_after, expires_at
             FROM film_tmdb_cache",
        )
        .fetch_all(&mut *transaction)
        .await
        .map_err(database_error)?;
        let mut purged_count = 0;

        for (film_id, language, fetched_at, refresh_after, expires_at) in stored_metadata {
            if validate_stored_cache_metadata(&language, &fetched_at, &refresh_after, &expires_at)
                .is_err()
            {
                purged_count += purge_invalid_row(&mut transaction, &film_id).await?;
            }
        }

        let expired_result = sqlx::query(
            "DELETE FROM film_tmdb_cache
             WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%SZ', $1, 'unixepoch')",
        )
        .bind(now_epoch_seconds)
        .execute(&mut *transaction)
        .await
        .map_err(database_error)?;
        purged_count += expired_result.rows_affected();
        transaction.commit().await.map_err(database_error)?;

        Ok(purged_count)
    }

    async fn delete_for_film(&self, film_id: &str) -> Result<u64, TmdbError> {
        let result = sqlx::query("DELETE FROM film_tmdb_cache WHERE film_id = $1")
            .bind(film_id)
            .execute(&self.pool)
            .await
            .map_err(database_error)?;
        Ok(result.rows_affected())
    }
}

async fn purge_invalid_row(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    film_id: &str,
) -> Result<u64, TmdbError> {
    let result = sqlx::query("DELETE FROM film_tmdb_cache WHERE film_id = $1")
        .bind(film_id)
        .execute(&mut **transaction)
        .await
        .map_err(database_error)?;
    Ok(result.rows_affected())
}

fn database_error(error: sqlx::Error) -> TmdbError {
    TmdbError::Database(format!(
        "Impossible d’accéder au cache TMDB SQLite : {error}"
    ))
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;
    use crate::tmdb::client::{TmdbCastMemberDto, MAX_ALTERNATIVE_POSTERS};

    const BASE_TIME: i64 = 1_768_737_600;
    const FETCHED_AT: &str = "2026-01-18T12:00:00Z";
    const REFRESH_AFTER: &str = "2026-04-08T12:00:00Z";
    const EXPIRES_AT: &str = "2026-07-17T12:00:00Z";

    #[derive(Clone, Copy)]
    struct FakeClock {
        now: i64,
    }

    impl Clock for FakeClock {
        fn now_epoch_seconds(&self) -> Result<i64, TmdbError> {
            Ok(self.now)
        }
    }

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("base SQLite de test");

        for migration in [
            include_str!("../../migrations/0001_create_profiles_and_films.sql"),
            include_str!("../../migrations/0002_create_default_profile.sql"),
            include_str!("../../migrations/0003_track_current_profile.sql"),
            include_str!("../../migrations/0004_create_backup_settings.sql"),
            include_str!("../../migrations/0005_create_backup_snapshots.sql"),
            include_str!("../../migrations/0006_create_updater_preferences.sql"),
            include_str!("../../migrations/0007_normalize_film_optional_data.sql"),
            include_str!("../../migrations/0008_create_film_tmdb_cache.sql"),
        ] {
            sqlx::raw_sql(migration)
                .execute(&pool)
                .await
                .expect("migration SQLite de test");
        }

        pool
    }

    async fn insert_film(pool: &SqlitePool, film_id: &str, title: &str) {
        sqlx::query("INSERT INTO films (id, profile_id, title) VALUES ($1, 'default', $2)")
            .bind(film_id)
            .bind(title)
            .execute(pool)
            .await
            .expect("film de test");
    }

    fn sample_presentation(tmdb_id: i64, title: &str) -> TmdbFilmPresentationDto {
        TmdbFilmPresentationDto {
            tmdb_id,
            title: title.to_string(),
            original_title: Some(format!("{title} original")),
            release_date: Some("2026-01-18".to_string()),
            runtime_minutes: Some(102),
            synopsis: Some("Présentation factice et bornée.".to_string()),
            directors: vec!["Camille Test".to_string()],
            poster_url: Some("https://image.tmdb.org/t/p/w500/main.jpg".to_string()),
            alternative_poster_urls: vec![
                "https://image.tmdb.org/t/p/w500/alternative.jpg".to_string()
            ],
            cast: vec![TmdbCastMemberDto {
                name: "Lou Test".to_string(),
                character: Some("Rôle test".to_string()),
                portrait_url: None,
            }],
        }
    }

    fn service(
        pool: &SqlitePool,
        now: i64,
    ) -> CacheService<SqliteFilmTmdbCacheRepository, FakeClock> {
        CacheService::new(
            SqliteFilmTmdbCacheRepository::new(pool.clone()),
            FakeClock { now },
        )
    }

    async fn inject_corrupted_cache(
        pool: &SqlitePool,
        film_id: &str,
        language: &str,
        fetched_at: &str,
        refresh_after: &str,
        expires_at: &str,
    ) {
        insert_film(pool, film_id, "Film avec cache corrompu").await;
        let payload_json = serde_json::to_string(&sample_presentation(301, "Cache corrompu"))
            .expect("payload corrompu sérialisable");

        sqlx::query("PRAGMA ignore_check_constraints = ON")
            .execute(pool)
            .await
            .expect("contournement contrôlé des CHECK pour le test");
        sqlx::query(
            "INSERT INTO film_tmdb_cache (
                film_id, tmdb_id, language, payload_json,
                fetched_at, refresh_after, expires_at
             ) VALUES ($1, 301, $2, $3, $4, $5, $6)",
        )
        .bind(film_id)
        .bind(language)
        .bind(payload_json)
        .bind(fetched_at)
        .bind(refresh_after)
        .bind(expires_at)
        .execute(pool)
        .await
        .expect("cache corrompu injecté par accès SQL direct");
        sqlx::query("PRAGMA ignore_check_constraints = OFF")
            .execute(pool)
            .await
            .expect("réactivation des CHECK après injection");
    }

    async fn assert_invalid_metadata_is_purged(
        pool: &SqlitePool,
        film_id: &str,
        language: &str,
        fetched_at: &str,
        refresh_after: &str,
        expires_at: &str,
    ) {
        inject_corrupted_cache(
            pool,
            film_id,
            language,
            fetched_at,
            refresh_after,
            expires_at,
        )
        .await;

        let error = service(pool, BASE_TIME)
            .read(film_id)
            .await
            .expect_err("métadonnées SQLite corrompues refusées");
        let remaining: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM film_tmdb_cache WHERE film_id = $1")
                .bind(film_id)
                .fetch_one(pool)
                .await
                .expect("cache restant après rejet des métadonnées");

        assert_eq!(error, invalid_stored_cache());
        assert_eq!(remaining, 0);
    }

    #[test]
    fn migration_creates_an_isolated_cache_with_enforced_cascade() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
                .fetch_one(&pool)
                .await
                .expect("état des clés étrangères");
            assert_eq!(foreign_keys, 1);

            let table_exists: i64 = sqlx::query_scalar(
                "SELECT EXISTS(
                    SELECT 1 FROM sqlite_master
                    WHERE type = 'table' AND name = 'film_tmdb_cache'
                 )",
            )
            .fetch_one(&pool)
            .await
            .expect("table de cache");
            let index_exists: i64 = sqlx::query_scalar(
                "SELECT EXISTS(
                    SELECT 1 FROM sqlite_master
                    WHERE type = 'index' AND name = 'film_tmdb_cache_refresh_idx'
                 )",
            )
            .fetch_one(&pool)
            .await
            .expect("index de rafraîchissement");
            let on_delete: String = sqlx::query_scalar(
                "SELECT on_delete
                 FROM pragma_foreign_key_list('film_tmdb_cache')
                 WHERE \"table\" = 'films'",
            )
            .fetch_one(&pool)
            .await
            .expect("cascade de cache");

            assert_eq!(table_exists, 1);
            assert_eq!(index_exists, 1);
            assert_eq!(on_delete, "CASCADE");

            insert_film(&pool, "film-checks", "Contraintes de migration").await;
            let payload_json = serde_json::to_string(&sample_presentation(300, "Cache contrôlé"))
                .expect("payload de contrôle sérialisable");
            let malformed_date = sqlx::query(
                "INSERT INTO film_tmdb_cache (
                    film_id, tmdb_id, language, payload_json,
                    fetched_at, refresh_after, expires_at
                 ) VALUES (
                    'film-checks', 300, 'fr-FR', $1,
                    '2026-1-18T12:00:00Z', $2, $3
                 )",
            )
            .bind(&payload_json)
            .bind(REFRESH_AFTER)
            .bind(EXPIRES_AT)
            .execute(&pool)
            .await;
            let malformed_language = sqlx::query(
                "INSERT INTO film_tmdb_cache (
                    film_id, tmdb_id, language, payload_json,
                    fetched_at, refresh_after, expires_at
                 ) VALUES (
                    'film-checks', 300, 'FR-fr', $1, $2, $3, $4
                 )",
            )
            .bind(payload_json)
            .bind(FETCHED_AT)
            .bind(REFRESH_AFTER)
            .bind(EXPIRES_AT)
            .execute(&pool)
            .await;

            assert!(malformed_date.is_err());
            assert!(malformed_language.is_err());
        });
    }

    #[test]
    fn valid_cache_is_read_before_refresh_is_due() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_film(&pool, "film-valid", "Titre personnel").await;
            service(&pool, BASE_TIME)
                .replace(
                    "film-valid",
                    "fr-FR",
                    sample_presentation(101, "Titre de cache"),
                )
                .await
                .expect("cache valide");

            let cached = service(
                &pool,
                BASE_TIME + (REFRESH_AFTER_DAYS - 1) * SECONDS_PER_DAY,
            )
            .read("film-valid")
            .await
            .expect("lecture valide")
            .expect("cache présent");
            assert!(!cached.refresh_due);
            assert_eq!(cached.presentation.tmdb_id, 101);
            assert_eq!(cached.presentation.title, "Titre de cache");
            assert_eq!(cached.language, "fr-FR");
            assert_eq!(cached.fetched_at, FETCHED_AT);
            assert_eq!(cached.refresh_after, REFRESH_AFTER);
            assert_eq!(cached.expires_at, EXPIRES_AT);

            let payload_json: String = sqlx::query_scalar(
                "SELECT payload_json FROM film_tmdb_cache WHERE film_id = 'film-valid'",
            )
            .fetch_one(&pool)
            .await
            .expect("payload borné");
            assert!(!payload_json.contains("apiKey"));
            assert!(!payload_json.contains("authorization"));
        });
    }

    #[test]
    fn raw_provider_fields_are_rejected_and_the_invalid_row_is_purged() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_film(&pool, "film-raw", "Titre personnel").await;
            let mut raw_payload = serde_json::to_value(sample_presentation(113, "Cache brut"))
                .expect("payload JSON de test");
            raw_payload["popularity"] = json!(123.4);

            sqlx::query(
                "INSERT INTO film_tmdb_cache (
                    film_id, tmdb_id, language, payload_json,
                    fetched_at, refresh_after, expires_at
                 ) VALUES (
                    'film-raw', 113, 'fr-FR', $1,
                    strftime('%Y-%m-%dT%H:%M:%SZ', $2, 'unixepoch'),
                    strftime('%Y-%m-%dT%H:%M:%SZ', $3, 'unixepoch'),
                    strftime('%Y-%m-%dT%H:%M:%SZ', $4, 'unixepoch')
                 )",
            )
            .bind(raw_payload.to_string())
            .bind(BASE_TIME)
            .bind(BASE_TIME + REFRESH_AFTER_DAYS * SECONDS_PER_DAY)
            .bind(BASE_TIME + EXPIRES_AFTER_DAYS * SECONDS_PER_DAY)
            .execute(&pool)
            .await
            .expect("payload brut injecté dans la base de test");

            let error = service(&pool, BASE_TIME)
                .read("film-raw")
                .await
                .expect_err("champ fournisseur brut refusé");
            let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM film_tmdb_cache")
                .fetch_one(&pool)
                .await
                .expect("cache restant après rejet");

            assert_eq!(error, TmdbError::InvalidCache(INVALID_STORED_CACHE_REASON));
            assert_eq!(remaining, 0);
        });
    }

    #[test]
    fn malformed_stored_dates_are_rejected_and_purged() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            for (film_id, fetched_at, refresh_after, expires_at) in [
                (
                    "film-malformed-fetched",
                    "2026/01/18 12:00:00",
                    REFRESH_AFTER,
                    EXPIRES_AT,
                ),
                (
                    "film-malformed-refresh",
                    FETCHED_AT,
                    "2026-02-30T12:00:00Z",
                    EXPIRES_AT,
                ),
                (
                    "film-malformed-expiration",
                    FETCHED_AT,
                    REFRESH_AFTER,
                    "2026-07-17T12:00:00+00:00",
                ),
            ] {
                assert_invalid_metadata_is_purged(
                    &pool,
                    film_id,
                    "fr-FR",
                    fetched_at,
                    refresh_after,
                    expires_at,
                )
                .await;
            }
        });
    }

    #[test]
    fn invalid_stored_date_order_is_rejected_and_purged() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            for (film_id, refresh_after, expires_at) in [
                (
                    "film-refresh-before-fetch",
                    "2026-01-17T12:00:00Z",
                    EXPIRES_AT,
                ),
                (
                    "film-expiration-before-refresh",
                    REFRESH_AFTER,
                    "2026-04-07T12:00:00Z",
                ),
            ] {
                assert_invalid_metadata_is_purged(
                    &pool,
                    film_id,
                    "fr-FR",
                    FETCHED_AT,
                    refresh_after,
                    expires_at,
                )
                .await;
            }
        });
    }

    #[test]
    fn oversized_stored_cache_windows_are_rejected_and_purged() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            for (film_id, refresh_after, expires_at) in [
                ("film-refresh-too-late", "2026-04-09T12:00:00Z", EXPIRES_AT),
                (
                    "film-expiration-too-late",
                    REFRESH_AFTER,
                    "2026-07-18T12:00:00Z",
                ),
            ] {
                assert_invalid_metadata_is_purged(
                    &pool,
                    film_id,
                    "fr-FR",
                    FETCHED_AT,
                    refresh_after,
                    expires_at,
                )
                .await;
            }
        });
    }

    #[test]
    fn invalid_stored_language_is_rejected_and_purged() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            assert_invalid_metadata_is_purged(
                &pool,
                "film-invalid-language",
                "FR-fr",
                FETCHED_AT,
                REFRESH_AFTER,
                EXPIRES_AT,
            )
            .await;
        });
    }

    #[test]
    fn refresh_due_is_false_at_day_seventy_nine_and_true_at_day_eighty() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_film(&pool, "film-refresh", "Titre personnel").await;
            service(&pool, BASE_TIME)
                .replace(
                    "film-refresh",
                    "fr-FR",
                    sample_presentation(102, "Cache à renouveler"),
                )
                .await
                .expect("cache à renouveler");

            let cached_at_day_seventy_nine = service(&pool, BASE_TIME + 79 * SECONDS_PER_DAY)
                .read("film-refresh")
                .await
                .expect("lecture à 79 jours")
                .expect("cache encore lisible à 79 jours");
            let cached_at_day_eighty = service(&pool, BASE_TIME + 80 * SECONDS_PER_DAY)
                .read("film-refresh")
                .await
                .expect("lecture à 80 jours")
                .expect("cache encore lisible à 80 jours");

            assert!(!cached_at_day_seventy_nine.refresh_due);
            assert!(cached_at_day_eighty.refresh_due);
        });
    }

    #[test]
    fn read_purges_cache_at_exactly_one_hundred_eighty_days() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_film(&pool, "film-expired", "Titre personnel").await;
            service(&pool, BASE_TIME)
                .replace(
                    "film-expired",
                    "fr-FR",
                    sample_presentation(103, "Cache expiré"),
                )
                .await
                .expect("cache avant expiration");

            let cached = service(&pool, BASE_TIME + EXPIRES_AFTER_DAYS * SECONDS_PER_DAY)
                .read("film-expired")
                .await
                .expect("lecture à 180 jours");
            let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM film_tmdb_cache")
                .fetch_one(&pool)
                .await
                .expect("cache restant");

            assert_eq!(cached, None);
            assert_eq!(remaining, 0);
        });
    }

    #[test]
    fn global_purge_is_strict_at_one_hundred_eighty_days() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_film(&pool, "film-purge", "À purger").await;
            insert_film(&pool, "film-keep", "À conserver").await;
            service(&pool, BASE_TIME)
                .replace(
                    "film-purge",
                    "fr-FR",
                    sample_presentation(104, "Cache à purger"),
                )
                .await
                .expect("cache ancien");
            service(&pool, BASE_TIME + SECONDS_PER_DAY)
                .replace(
                    "film-keep",
                    "fr-FR",
                    sample_presentation(105, "Cache récent"),
                )
                .await
                .expect("cache récent");

            let purged = service(&pool, BASE_TIME + EXPIRES_AFTER_DAYS * SECONDS_PER_DAY)
                .purge_expired()
                .await
                .expect("purge globale");
            let remaining_film_id: String =
                sqlx::query_scalar("SELECT film_id FROM film_tmdb_cache")
                    .fetch_one(&pool)
                    .await
                    .expect("cache conservé");

            assert_eq!(purged, 1);
            assert_eq!(remaining_film_id, "film-keep");
        });
    }

    #[test]
    fn global_purge_removes_invalid_future_metadata_and_keeps_valid_future_cache() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_film(&pool, "film-valid-future", "Cache futur valide").await;
            service(&pool, BASE_TIME)
                .replace(
                    "film-valid-future",
                    "fr-FR",
                    sample_presentation(114, "Cache futur valide"),
                )
                .await
                .expect("cache futur valide");
            inject_corrupted_cache(
                &pool,
                "film-invalid-future",
                "fr-FR",
                FETCHED_AT,
                REFRESH_AFTER,
                "2099-12-31T23:59:59Z",
            )
            .await;

            let purged = service(&pool, BASE_TIME)
                .purge_expired()
                .await
                .expect("purge globale des métadonnées invalides");
            let remaining_film_ids: Vec<String> =
                sqlx::query_scalar("SELECT film_id FROM film_tmdb_cache ORDER BY film_id")
                    .fetch_all(&pool)
                    .await
                    .expect("caches restants après purge globale");

            assert_eq!(purged, 1);
            assert_eq!(remaining_film_ids, vec!["film-valid-future"]);
        });
    }

    #[test]
    fn replacement_is_atomic_and_invalid_payload_keeps_previous_cache() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_film(&pool, "film-replace", "Titre personnel").await;
            service(&pool, BASE_TIME)
                .replace(
                    "film-replace",
                    "fr-FR",
                    sample_presentation(106, "Ancien cache"),
                )
                .await
                .expect("ancien cache");

            let mut invalid = sample_presentation(107, "Cache refusé");
            invalid.alternative_poster_urls = (0..=MAX_ALTERNATIVE_POSTERS)
                .map(|index| format!("https://image.tmdb.org/t/p/w500/{index}.jpg"))
                .collect();
            let error = service(&pool, BASE_TIME + SECONDS_PER_DAY)
                .replace("film-replace", "fr-FR", invalid)
                .await
                .expect_err("payload trop large refusé");
            assert_eq!(
                error,
                TmdbError::InvalidCache("trop d’affiches alternatives")
            );

            let previous = service(&pool, BASE_TIME + SECONDS_PER_DAY)
                .read("film-replace")
                .await
                .expect("ancien cache lisible")
                .expect("ancien cache conservé");
            assert_eq!(previous.presentation.tmdb_id, 106);
            assert_eq!(previous.presentation.title, "Ancien cache");

            service(&pool, BASE_TIME + 2 * SECONDS_PER_DAY)
                .replace(
                    "film-replace",
                    "en-US",
                    sample_presentation(108, "Nouveau cache"),
                )
                .await
                .expect("remplacement valide");
            let replaced = service(&pool, BASE_TIME + 2 * SECONDS_PER_DAY)
                .read("film-replace")
                .await
                .expect("nouveau cache lisible")
                .expect("nouveau cache présent");
            assert_eq!(replaced.presentation.tmdb_id, 108);
            assert_eq!(replaced.presentation.title, "Nouveau cache");
            assert_eq!(replaced.language, "en-US");
            assert_ne!(replaced.fetched_at, previous.fetched_at);
            assert_ne!(replaced.expires_at, previous.expires_at);
        });
    }

    #[test]
    fn deleting_a_film_cascades_to_its_cache() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_film(&pool, "film-delete", "Titre personnel").await;
            service(&pool, BASE_TIME)
                .replace(
                    "film-delete",
                    "fr-FR",
                    sample_presentation(109, "Cache à supprimer"),
                )
                .await
                .expect("cache avant suppression");

            sqlx::query("DELETE FROM films WHERE id = 'film-delete'")
                .execute(&pool)
                .await
                .expect("suppression du Film");
            let cache_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM film_tmdb_cache")
                .fetch_one(&pool)
                .await
                .expect("compte du cache");
            assert_eq!(cache_count, 0);
        });
    }

    #[test]
    fn portable_film_payload_cannot_include_the_separate_cache_row() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_film(&pool, "film-portable", "Titre personnel").await;
            service(&pool, BASE_TIME)
                .replace(
                    "film-portable",
                    "fr-FR",
                    sample_presentation(110, "Titre réservé au cache"),
                )
                .await
                .expect("cache séparé");

            let film: (String, String, Option<String>, Option<String>) = sqlx::query_as(
                "SELECT id, title, provider_name, provider_id
                 FROM films WHERE id = 'film-portable'",
            )
            .fetch_one(&pool)
            .await
            .expect("Film personnel portable");
            let portable_payload = json!({
                "format": "sylloge-films",
                "version": 1,
                "films": [{
                    "id": film.0,
                    "title": film.1,
                    "providerName": film.2,
                    "providerId": film.3
                }]
            })
            .to_string();

            assert!(portable_payload.contains("Titre personnel"));
            assert!(!portable_payload.contains("Titre réservé au cache"));
            assert!(!portable_payload.contains("film_tmdb_cache"));
            assert!(!portable_payload.contains("tmdbId"));
            assert!(!portable_payload.contains("payloadJson"));
        });
    }

    #[test]
    fn explicit_repository_purge_removes_only_the_requested_association() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_film(&pool, "film-unlink", "À dissocier").await;
            insert_film(&pool, "film-linked", "À garder").await;
            service(&pool, BASE_TIME)
                .replace(
                    "film-unlink",
                    "fr-FR",
                    sample_presentation(111, "Cache dissocié"),
                )
                .await
                .expect("cache à dissocier");
            service(&pool, BASE_TIME)
                .replace(
                    "film-linked",
                    "fr-FR",
                    sample_presentation(112, "Cache conservé"),
                )
                .await
                .expect("cache à garder");

            let deleted = service(&pool, BASE_TIME)
                .delete_for_film("film-unlink")
                .await
                .expect("dissociation ciblée");
            let remaining: String = sqlx::query_scalar("SELECT film_id FROM film_tmdb_cache")
                .fetch_one(&pool)
                .await
                .expect("cache restant");

            assert_eq!(deleted, 1);
            assert_eq!(remaining, "film-linked");
        });
    }
}
