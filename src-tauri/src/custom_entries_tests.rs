//! Synthetic, in-memory fixtures using every registered Sylloge migration.
use super::*;
use serde_json::{json, Value};
use sqlx::sqlite::SqlitePoolOptions;

async fn test_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("in-memory test database");
    let migrations: Vec<_> = crate::database::migrations()
        .into_iter()
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
    sqlx::migrate::Migrator {
        migrations: migrations.into(),
        ..sqlx::migrate::Migrator::DEFAULT
    }
    .run(&pool)
    .await
    .expect("registered Sylloge migrations");
    sqlx::query("INSERT INTO profiles (id, name) VALUES ('reader', 'Fixture'), ('neighbor', 'Other fixture')")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(scalar(&pool, "PRAGMA foreign_keys").await, 1);
    pool
}

fn payload(library: &str) -> CustomEntryWritePayload {
    // Les recettes n'ont pas d'état « en cours » : leur fiche de contrôle part de « terminé ».
    let status = if library == "recipes" {
        "terminé"
    } else {
        "en cours"
    };
    serde_json::from_value(json!({
        "libraryId": library,
        "entry": {
            "id": "entry-1", "profileId": "reader", "title": "Synthetic entry",
            "creator": "\t=Creator, \"日本語\"  ", "year": 1986, "status": status,
            "rating": 4.5, "isFavorite": true, "progressCurrent": 0, "progressTotal": 10,
            "progressUpdatedAt": "2026-10-01T10:00:00.000Z", "startedAt": "2026-09-01",
            "finishedAt": "2026-10-02", "coverUrl": "https://example.invalid/cover.png",
            "summary": "Summary\r\nsecond line", "personalNote": "\t=Note, \"日本語\"  ",
            "details": {"format": "Bande dessinée", "unknownImportedField": "\t=Exact  "},
            "quotes": if library == "comics" { json!([
                {"id": "quote-1", "entryId": "entry-1", "body": "\t=First, \"日本語\"  ", "position": 0, "createdAt": "2026-01-01T00:00:00.000Z"},
                {"id": "quote-2", "entryId": "entry-1", "body": "Second quote", "position": 1, "createdAt": "2026-02-01T00:00:00.000Z"}
            ]) } else { json!([]) },
            "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-10-01T10:00:00.000Z"
        }
    }))
    .expect("CustomEntry camelCase domain contract")
}

async fn scalar(pool: &SqlitePool, sql: &str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

async fn fail_late_quote(pool: &SqlitePool) {
    sqlx::raw_sql(
        "CREATE TRIGGER fail_late_quote BEFORE INSERT ON comic_quotes
         WHEN NEW.body = 'FAIL LATE'
         BEGIN SELECT RAISE(ABORT, 'synthetic late quote failure'); END;",
    )
    .execute(pool)
    .await
    .unwrap();
}

async fn snapshot(pool: &SqlitePool, table: &str) -> Vec<Value> {
    let columns: Vec<String> =
        sqlx::query_scalar(&format!("SELECT name FROM pragma_table_info('{table}')"))
            .fetch_all(pool)
            .await
            .unwrap();
    let fields = columns
        .iter()
        .map(|column| format!("'{column}', \"{column}\""))
        .collect::<Vec<_>>()
        .join(", ");
    let rows: Vec<String> = sqlx::query_scalar(&format!(
        "SELECT json_object({fields}) AS row_json FROM {table} ORDER BY row_json"
    ))
    .fetch_all(pool)
    .await
    .unwrap();
    rows.iter()
        .map(|row| serde_json::from_str(row).unwrap())
        .collect()
}

fn expected_entry_row(entry: &CustomEntryWriteInput) -> Value {
    json!({
        "id": entry.id, "profile_id": entry.profile_id, "title": entry.title,
        "creator": entry.creator, "year": entry.year, "status": entry.status, "rating": entry.rating,
        "is_favorite": i64::from(entry.is_favorite), "progress_current": entry.progress_current,
        "progress_total": entry.progress_total, "progress_updated_at": entry.progress_updated_at,
        "started_at": entry.started_at, "finished_at": entry.finished_at, "cover_url": entry.cover_url,
        "summary": entry.summary, "personal_note": entry.personal_note,
        "details": serde_json::to_string(&entry.details).unwrap(),
        "created_at": entry.created_at, "updated_at": entry.updated_at,
    })
}

#[test]
fn every_custom_model_preserves_all_fields_statuses_optional_nulls_and_unknown_details() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        let models = [
            "comics",
            "magazines",
            "audiobooks",
            "music",
            "podcasts",
            "documentaries",
            "shows",
            "board_games",
            "recipes",
        ];
        assert_eq!(
            CUSTOM_LIBRARIES
                .iter()
                .map(|library| library.id)
                .collect::<Vec<_>>(),
            models
        );
        for model in models {
            let mut value = payload(model);
            create_custom_entry_in_pool(&pool, value.clone())
                .await
                .unwrap();
            assert_eq!(
                snapshot(&pool, model).await,
                vec![expected_entry_row(&value.entry)],
                "all initial fields for {model}"
            );
            // Les recettes n'ont que trois états : « maîtrisée » remplace « en cours » et
            // « abandonné », que la contrainte CHECK de `recipes` refuse (migration 0023).
            let statuses: &[&str] = if model == "recipes" {
                &["à découvrir", "terminé", "maîtrisée"]
            } else {
                &["à découvrir", "en cours", "terminé", "abandonné"]
            };
            for status in statuses {
                value.entry.status = (*status).into();
                value.entry.title = format!("Changed {model}");
                value.entry.updated_at = "2026-10-22T11:00:00.000Z".into();
                update_custom_entry_in_pool(&pool, value.clone())
                    .await
                    .unwrap();
                assert_eq!(
                    snapshot(&pool, model).await,
                    vec![expected_entry_row(&value.entry)],
                    "all updated fields for {model}/{status}"
                );
            }
            value.entry.creator = None;
            value.entry.year = None;
            value.entry.rating = None;
            value.entry.is_favorite = false;
            value.entry.progress_current = None;
            value.entry.progress_total = None;
            value.entry.progress_updated_at = None;
            value.entry.started_at = None;
            value.entry.finished_at = None;
            value.entry.cover_url = None;
            value.entry.summary = None;
            value.entry.personal_note = None;
            value.entry.quotes.clear();
            update_custom_entry_in_pool(&pool, value.clone())
                .await
                .unwrap();
            assert_eq!(
                snapshot(&pool, model).await,
                vec![expected_entry_row(&value.entry)],
                "explicit nulls for {model}"
            );
        }
        assert_eq!(scalar(&pool, "SELECT COUNT(*) FROM comic_quotes").await, 0);
        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(integrity, "ok");
        assert!(sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&pool)
            .await
            .unwrap()
            .is_empty());
    });
}

#[test]
fn invalid_profile_library_quote_owner_and_order_cannot_change_existing_rows() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        create_custom_entry_in_pool(&pool, payload("comics"))
            .await
            .unwrap();
        let entries = snapshot(&pool, "comics").await;
        let quotes = snapshot(&pool, "comic_quotes").await;
        let mut foreign = payload("comics");
        foreign.entry.profile_id = "neighbor".into();
        foreign.entry.title = "Foreign write".into();
        let error = update_custom_entry_in_pool(&pool, foreign)
            .await
            .unwrap_err();
        assert!(error.contains("profil courant"), "{error}");
        for kind in ["owner", "position", "blank"] {
            let mut invalid = payload("comics");
            match kind {
                "owner" => invalid.entry.quotes[1].entry_id = "another-entry".into(),
                "position" => invalid.entry.quotes[1].position = 4,
                _ => invalid.entry.quotes[1].body = " \t\r\n ".into(),
            }
            assert!(update_custom_entry_in_pool(&pool, invalid).await.is_err());
        }
        for id in [
            "books",
            "comics; DROP TABLE profiles; --",
            "Comics",
            " comics ",
        ] {
            assert!(create_custom_entry_in_pool(&pool, payload(id))
                .await
                .unwrap_err()
                .contains("inconnue"));
            assert!(update_custom_entry_in_pool(&pool, payload(id))
                .await
                .unwrap_err()
                .contains("inconnue"));
            assert!(delete_custom_entry_in_pool(&pool, "reader", id, "entry-1")
                .await
                .unwrap_err()
                .contains("inconnue"));
            assert!(remove_custom_library_in_pool(&pool, "reader", id)
                .await
                .unwrap_err()
                .contains("inconnue"));
        }
        let mut music_with_quotes = payload("comics");
        music_with_quotes.library_id = "music".into();
        assert!(create_custom_entry_in_pool(&pool, music_with_quotes)
            .await
            .unwrap_err()
            .contains("Seuls les comics"));
        assert_eq!(snapshot(&pool, "comics").await, entries);
        assert_eq!(snapshot(&pool, "comic_quotes").await, quotes);
        assert_eq!(scalar(&pool, "SELECT COUNT(*) FROM music").await, 0);
    });
}

#[test]
fn removal_is_scoped_to_one_profile_and_model_and_keeps_other_quotes_and_activations() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        for model in ["comics", "music"] {
            create_custom_entry_in_pool(&pool, payload(model))
                .await
                .unwrap();
            sqlx::query("INSERT INTO profile_libraries (profile_id, library_id, position) VALUES ('reader', $1, 0), ('neighbor', $1, 0)")
                .bind(model).execute(&pool).await.unwrap();
        }
        let mut neighbor = payload("comics");
        neighbor.entry.id = "neighbor-entry".into();
        neighbor.entry.profile_id = "neighbor".into();
        for quote in &mut neighbor.entry.quotes {
            quote.id = format!("neighbor-{}", quote.id);
            quote.entry_id = neighbor.entry.id.clone();
        }
        create_custom_entry_in_pool(&pool, neighbor).await.unwrap();
        let music = snapshot(&pool, "music").await;
        remove_custom_library_in_pool(&pool, "reader", "comics")
            .await
            .unwrap();
        assert_eq!(snapshot(&pool, "music").await, music);
        let owners: Vec<String> = sqlx::query_scalar("SELECT profile_id FROM comics")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(owners, ["neighbor"]);
        assert_eq!(
            scalar(
                &pool,
                "SELECT COUNT(*) FROM comic_quotes WHERE comic_id = 'neighbor-entry'"
            )
            .await,
            2
        );
        assert_eq!(
            scalar(
                &pool,
                "SELECT COUNT(*) FROM comic_quotes WHERE comic_id = 'entry-1'"
            )
            .await,
            0
        );
        assert_eq!(
            scalar(&pool, "SELECT COUNT(*) FROM profile_libraries").await,
            3
        );
        remove_custom_library_in_pool(&pool, "reader", "comics")
            .await
            .unwrap(); // Idempotent, as before.
    });
}

#[test]
fn delete_custom_entry_is_profile_scoped_and_deletes_quotes_only_on_success() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        create_custom_entry_in_pool(&pool, payload("comics"))
            .await
            .unwrap();
        let entries = snapshot(&pool, "comics").await;
        let quotes = snapshot(&pool, "comic_quotes").await;
        let error = delete_custom_entry_in_pool(&pool, "neighbor", "comics", "entry-1")
            .await
            .unwrap_err();
        assert!(error.contains("profil courant"), "{error}");
        assert_eq!(snapshot(&pool, "comics").await, entries);
        assert_eq!(snapshot(&pool, "comic_quotes").await, quotes);
        delete_custom_entry_in_pool(&pool, "reader", "comics", "entry-1")
            .await
            .unwrap();
        assert_eq!(scalar(&pool, "SELECT COUNT(*) FROM comics").await, 0);
        assert_eq!(scalar(&pool, "SELECT COUNT(*) FROM comic_quotes").await, 0);
    });
}

#[test]
fn remove_custom_library_restores_entries_quotes_and_activation_on_late_failure() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        create_custom_entry_in_pool(&pool, payload("comics"))
            .await
            .unwrap();
        sqlx::raw_sql(
            "INSERT INTO profile_libraries (profile_id, library_id, position) VALUES ('reader', 'comics', 0);
             CREATE TRIGGER fail_remove_library BEFORE DELETE ON profile_libraries
             BEGIN SELECT RAISE(ABORT, 'synthetic late activation deletion failure'); END;"
        ).execute(&pool).await.unwrap();
        let entries = snapshot(&pool, "comics").await;
        let quotes = snapshot(&pool, "comic_quotes").await;
        let activation = snapshot(&pool, "profile_libraries").await;
        let error = remove_custom_library_in_pool(&pool, "reader", "comics")
            .await
            .unwrap_err();
        assert!(
            error.contains("synthetic late activation deletion failure"),
            "must reach activation deletion after entry/quote deletion: {error}"
        );
        assert_eq!(snapshot(&pool, "comics").await, entries);
        assert_eq!(snapshot(&pool, "comic_quotes").await, quotes);
        assert_eq!(snapshot(&pool, "profile_libraries").await, activation);
        sqlx::query("DROP TRIGGER fail_remove_library")
            .execute(&pool)
            .await
            .unwrap();
        remove_custom_library_in_pool(&pool, "reader", "comics")
            .await
            .unwrap();
        assert_eq!(scalar(&pool, "SELECT COUNT(*) FROM comics").await, 0);
        assert_eq!(scalar(&pool, "SELECT COUNT(*) FROM comic_quotes").await, 0);
        assert_eq!(
            scalar(&pool, "SELECT COUNT(*) FROM profile_libraries").await,
            0
        );
    });
}

#[test]
fn update_preserves_quote_identity_for_exact_bodies_including_reordered_duplicates() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        let mut original = payload("comics");
        let mut duplicate = original.entry.quotes[0].clone();
        duplicate.id = "quote-duplicate".into();
        duplicate.position = 2;
        duplicate.created_at = "2026-03-01T00:00:00.000Z".into();
        original.entry.quotes.push(duplicate);
        create_custom_entry_in_pool(&pool, original.clone())
            .await
            .unwrap();

        let mut changed = original.clone();
        changed.entry.created_at = "must not overwrite original entry creation".into();
        changed.entry.quotes = vec![
            original.entry.quotes[1].clone(),
            original.entry.quotes[0].clone(),
            original.entry.quotes[2].clone(),
            CustomQuoteWriteInput {
                id: "new-quote".into(),
                entry_id: "entry-1".into(),
                body: "  New body\r\n日本語  ".into(),
                position: 3,
                created_at: "2026-10-22T10:00:00.000Z".into(),
            },
        ];
        for (index, quote) in changed.entry.quotes.iter_mut().enumerate().take(3) {
            quote.id = format!("regenerated-{index}");
            quote.position = index as i64;
            quote.created_at = "must preserve actual stored date".into();
        }
        update_custom_entry_in_pool(&pool, changed).await.unwrap();
        let actual: Vec<(String, String, i64, String)> = sqlx::query_as(
            "SELECT id, body, position, created_at FROM comic_quotes ORDER BY position, id",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(
            actual,
            vec![
                (
                    "quote-2".into(),
                    original.entry.quotes[1].body.clone(),
                    0,
                    original.entry.quotes[1].created_at.clone()
                ),
                (
                    "quote-1".into(),
                    original.entry.quotes[0].body.clone(),
                    1,
                    original.entry.quotes[0].created_at.clone()
                ),
                (
                    "quote-duplicate".into(),
                    original.entry.quotes[2].body.clone(),
                    2,
                    original.entry.quotes[2].created_at.clone()
                ),
                (
                    "new-quote".into(),
                    "  New body\r\n日本語  ".into(),
                    3,
                    "2026-10-22T10:00:00.000Z".into()
                ),
            ]
        );
        let created: String = sqlx::query_scalar("SELECT created_at FROM comics")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(created, original.entry.created_at);
    });
}

#[test]
fn update_custom_entry_restores_every_entry_field_and_old_quotes_when_late_quote_insert_fails() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        create_custom_entry_in_pool(&pool, payload("comics"))
            .await
            .unwrap();
        let entries = snapshot(&pool, "comics").await;
        let quotes = snapshot(&pool, "comic_quotes").await;
        fail_late_quote(&pool).await;
        let mut broken = payload("comics");
        broken.entry.title = "Changed title".into();
        broken.entry.personal_note = None;
        broken.entry.progress_current = Some(9);
        broken.entry.updated_at = "2026-10-22T10:00:00.000Z".into();
        broken.entry.quotes[0].body = "First inserted replacement".into();
        broken.entry.quotes[1].body = "FAIL LATE".into();
        let error = update_custom_entry_in_pool(&pool, broken)
            .await
            .unwrap_err();
        assert!(
            error.contains("synthetic late quote failure"),
            "must fail after entry update and first quote insert: {error}"
        );
        assert_eq!(snapshot(&pool, "comics").await, entries);
        assert_eq!(snapshot(&pool, "comic_quotes").await, quotes);
    });
}

#[test]
fn create_custom_entry_rolls_back_entry_and_first_quote_when_late_quote_insert_fails() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        fail_late_quote(&pool).await;
        let mut broken = payload("comics");
        broken.entry.quotes[1].body = "FAIL LATE".into();
        let error = create_custom_entry_in_pool(&pool, broken)
            .await
            .unwrap_err();
        assert!(
            error.contains("synthetic late quote failure"),
            "must reach the late SQL insert: {error}"
        );
        assert_eq!(scalar(&pool, "SELECT COUNT(*) FROM comics").await, 0);
        assert_eq!(scalar(&pool, "SELECT COUNT(*) FROM comic_quotes").await, 0);
    });
}
