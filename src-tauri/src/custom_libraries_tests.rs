//! Bibliothèques personnalisées (modèles prêts) : migration 0021, import de
//! profil complet et frontière Livres/Comics.
//!
//! Bases SQLite en mémoire construites avec les migrations réellement
//! enregistrées dans `database.rs`, clés étrangères actives comme dans
//! l’application. Fixtures synthétiques uniquement, jamais la base personnelle.

use super::*;
use serde_json::{json, Value};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

/// Les neuf tables des modèles prêts, écrites en dur : les tests vérifient la
/// liste de production au lieu de la recopier.
const CUSTOM_TABLES: [&str; 9] = [
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

fn migrator_up_to(version: i64) -> sqlx::migrate::Migrator {
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
    sqlx::migrate::Migrator {
        migrations: migrations.into(),
        ..sqlx::migrate::Migrator::DEFAULT
    }
}

/// Base en mémoire migrée par le vrai migrateur sqlx jusqu’à `version`.
async fn pool_at(version: i64) -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("base SQLite de test");
    migrator_up_to(version)
        .run(&pool)
        .await
        .expect("migrations Sylloge enregistrées");
    let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
        .fetch_one(&pool)
        .await
        .expect("état des clés étrangères");
    assert_eq!(
        foreign_keys, 1,
        "les clés étrangères doivent être actives comme en production"
    );
    pool
}

/// Lignes d’une table en objets JSON (toutes les colonnes), triées.
async fn rows_json(pool: &SqlitePool, table: &str, filter: &str) -> Vec<Value> {
    let columns: Vec<String> =
        sqlx::query_scalar(&format!("SELECT name FROM pragma_table_info('{table}')"))
            .fetch_all(pool)
            .await
            .expect("colonnes de la table");
    assert!(!columns.is_empty(), "la table {table} doit exister");
    let arguments = columns
        .iter()
        .map(|column| format!("'{column}', \"{column}\""))
        .collect::<Vec<_>>()
        .join(", ");
    let rows: Vec<String> = sqlx::query_scalar(&format!(
        "SELECT json_object({arguments}) AS row_json FROM {table} WHERE {filter} ORDER BY row_json"
    ))
    .fetch_all(pool)
    .await
    .unwrap_or_else(|error| panic!("relecture de {table} : {error}"));
    rows.iter()
        .map(|row| serde_json::from_str(row).expect("ligne JSON"))
        .collect()
}

async fn assert_database_is_consistent(pool: &SqlitePool) {
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(pool)
        .await
        .expect("contrôle d’intégrité");
    assert_eq!(integrity, "ok");
    let violations = sqlx::query("PRAGMA foreign_key_check")
        .fetch_all(pool)
        .await
        .expect("contrôle des clés étrangères");
    assert!(
        violations.is_empty(),
        "{} violation(s) de clé étrangère",
        violations.len()
    );
}

async fn execute_all(pool: &SqlitePool, statements: &[&str]) {
    for statement in statements {
        sqlx::query(statement)
            .execute(pool)
            .await
            .unwrap_or_else(|error| panic!("fixture « {statement} » : {error}"));
    }
}

// ---------------------------------------------------------------------------
// Migration 0021 : les comics quittent Livres
// ---------------------------------------------------------------------------

/// Base v20 : un lecteur avec un comic par statut de lecture (le premier
/// porte tous les champs, deux citations et un lien fournisseur), un livre
/// avec citation et lien ; un second profil sans comic.
async fn seed_legacy_books(pool: &SqlitePool) {
    execute_all(
        pool,
        &[
            "INSERT INTO profiles (id, name, created_at, updated_at) VALUES
               ('lecteur', 'Lecteur', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
               ('voisin', 'Voisin', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
            "INSERT INTO books (
               id, profile_id, title, author, year, summary, category, status, rating,
               is_favorite, volumes_read, volumes_total, progress_updated_at, started_at,
               cover_url, personal_note, created_at, updated_at
             ) VALUES (
               'comic-lu', 'lecteur', 'Comic de contrôle', 'Scénariste « fictive »', 1986,
               'Résumé' || char(13, 10) || 'sur deux lignes', 'comics', 'lu', 4.5, 1, 3, 10,
               '2026-10-01T10:00:00.000Z', '2026-09-01', 'https://example.test/comic.jpg',
               char(9) || '=Avis, \"cité\" 日本語  ', '2026-01-02T00:00:00.000Z',
               '2026-10-01T10:00:00.000Z'
             )",
            "INSERT INTO books (id, profile_id, title, category, status, is_favorite, created_at, updated_at) VALUES
               ('comic-a-lire', 'lecteur', 'Comic à lire', 'comics', 'à lire', 0, '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z'),
               ('comic-en-cours', 'lecteur', 'Comic en cours', 'comics', 'en cours', 0, '2026-01-04T00:00:00.000Z', '2026-01-04T00:00:00.000Z'),
               ('comic-abandonne', 'lecteur', 'Comic abandonné', 'comics', 'abandonné', 0, '2026-01-05T00:00:00.000Z', '2026-01-05T00:00:00.000Z')",
            "INSERT INTO books (
               id, profile_id, title, author, category, status, rating, is_favorite,
               volumes_read, volumes_total, personal_note, created_at, updated_at
             ) VALUES
               ('livre-1', 'lecteur', 'Roman conservé', 'Autrice', 'livre', 'en cours', 3.5, 1, 1, 2,
                'Note du roman', '2026-01-06T00:00:00.000Z', '2026-01-07T00:00:00.000Z'),
               ('livre-voisin', 'voisin', 'Roman du voisin', NULL, 'livre', 'lu', NULL, 0, NULL, NULL,
                NULL, '2026-01-08T00:00:00.000Z', '2026-01-08T00:00:00.000Z')",
            "INSERT INTO book_quotes (id, book_id, body, position, created_at) VALUES
               ('comic-quote-1', 'comic-lu', 'Première citation du comic', 0, '2026-02-01T00:00:00.000Z'),
               ('comic-quote-2', 'comic-lu', char(9) || '=Seconde, \"citée\"  ', 1, '2026-02-02T00:00:00.000Z'),
               ('livre-quote-1', 'livre-1', 'Citation du roman', 0, '2026-02-03T00:00:00.000Z')",
            "INSERT INTO media_provider_links (
               profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at
             ) VALUES
               ('lecteur', 'books', 'comic-lu', 'openlibrary', 'OL1W', '2026-02-04T00:00:00.000Z', '2026-02-04T00:00:00.000Z'),
               ('lecteur', 'books', 'livre-1', 'openlibrary', 'OL2W', '2026-02-05T00:00:00.000Z', '2026-02-05T00:00:00.000Z')",
        ],
    )
    .await;
}

#[test]
fn migration_0021_moves_legacy_comics_with_their_quotes_and_activates_the_library() {
    tauri::async_runtime::block_on(async {
        let pool = pool_at(20).await;
        seed_legacy_books(&pool).await;
        let kept_books = rows_json(&pool, "books", "category = 'livre'").await;
        let kept_quotes = rows_json(&pool, "book_quotes", "book_id = 'livre-1'").await;
        assert_eq!(kept_books.len(), 2);

        migrator_up_to(21)
            .run(&pool)
            .await
            .expect("la migration 0021 s’applique sur une base v20");

        let version: i64 =
            sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations WHERE success = 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(version, 21);

        assert_eq!(
            rows_json(&pool, "comics", "id = 'comic-lu'").await,
            vec![json!({
                "id": "comic-lu",
                "profile_id": "lecteur",
                "title": "Comic de contrôle",
                "creator": "Scénariste « fictive »",
                "year": 1986,
                "status": "terminé",
                "rating": 4.5,
                "is_favorite": 1,
                "progress_current": 3,
                "progress_total": 10,
                "progress_updated_at": "2026-10-01T10:00:00.000Z",
                "started_at": "2026-09-01",
                "finished_at": null,
                "cover_url": "https://example.test/comic.jpg",
                "summary": "Résumé\r\nsur deux lignes",
                "personal_note": "\t=Avis, \"cité\" 日本語  ",
                "details": "{}",
                "created_at": "2026-01-02T00:00:00.000Z",
                "updated_at": "2026-10-01T10:00:00.000Z"
            })],
            "le comic garde son identifiant et chacun de ses champs"
        );
        let statuses: Vec<(String, String, Option<i64>, i64)> = sqlx::query_as(
            "SELECT id, status, progress_current, is_favorite FROM comics ORDER BY created_at",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(
            statuses,
            vec![
                ("comic-lu".to_string(), "terminé".to_string(), Some(3), 1),
                (
                    "comic-a-lire".to_string(),
                    "à découvrir".to_string(),
                    None,
                    0
                ),
                (
                    "comic-en-cours".to_string(),
                    "en cours".to_string(),
                    None,
                    0
                ),
                (
                    "comic-abandonne".to_string(),
                    "abandonné".to_string(),
                    None,
                    0
                ),
            ],
            "chaque statut de lecture est traduit vers le vocabulaire commun"
        );

        assert_eq!(
            rows_json(&pool, "comic_quotes", "1").await,
            vec![
                json!({
                    "id": "comic-quote-1",
                    "comic_id": "comic-lu",
                    "body": "Première citation du comic",
                    "position": 0,
                    "created_at": "2026-02-01T00:00:00.000Z"
                }),
                json!({
                    "id": "comic-quote-2",
                    "comic_id": "comic-lu",
                    "body": "\t=Seconde, \"citée\"  ",
                    "position": 1,
                    "created_at": "2026-02-02T00:00:00.000Z"
                }),
            ],
            "les citations suivent le comic avec leurs identifiants et leur ordre"
        );

        assert!(
            rows_json(&pool, "books", "category = 'comics'")
                .await
                .is_empty(),
            "Livres ne contient plus aucun comic"
        );
        assert_eq!(rows_json(&pool, "books", "1").await, kept_books);
        assert_eq!(rows_json(&pool, "book_quotes", "1").await, kept_quotes);

        let activated: Vec<(String, String, i64)> = sqlx::query_as(
            "SELECT profile_id, library_id, position FROM profile_libraries ORDER BY profile_id",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(
            activated,
            vec![("lecteur".to_string(), "comics".to_string(), 0)],
            "Comics est ajoutée au seul profil qui avait des comics"
        );

        let links: Vec<(String, String)> =
            sqlx::query_as("SELECT medium, media_id FROM media_provider_links ORDER BY media_id")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(
            links,
            vec![("books".to_string(), "livre-1".to_string())],
            "le lien fournisseur du comic déplacé disparaît, celui du roman reste"
        );

        assert_database_is_consistent(&pool).await;
    });
}

// ---------------------------------------------------------------------------
// Import de profil complet : section `customLibraries`
// ---------------------------------------------------------------------------

/// Tables comparées avant/après un import refusé : profils, sélection, les
/// quinze bibliothèques, les trois tables de citations, la liste des
/// bibliothèques ajoutées et les liens fournisseurs.
const SNAPSHOT_TABLES: [&str; 23] = [
    "profiles",
    "current_profile",
    "films",
    "series",
    "anime",
    "books",
    "mangas",
    "games",
    "artworks",
    "comics",
    "magazines",
    "audiobooks",
    "music",
    "podcasts",
    "documentaries",
    "shows",
    "board_games",
    "recipes",
    "book_quotes",
    "manga_quotes",
    "comic_quotes",
    "profile_libraries",
    "media_provider_links",
];

const IMPORT_TIMESTAMP: &str = "2026-10-22T08:00:00.000Z";

async fn latest_pool() -> SqlitePool {
    pool_at(crate::migration_backup::latest_migration_version()).await
}

async fn database_snapshot(pool: &SqlitePool) -> Vec<(&'static str, Vec<Value>)> {
    let mut snapshot = Vec::new();
    for table in SNAPSHOT_TABLES {
        snapshot.push((table, rows_json(pool, table, "1").await));
    }
    snapshot
}

async fn insert_profile(pool: &SqlitePool, profile_id: &str) {
    sqlx::query("INSERT INTO profiles (id, name, created_at, updated_at) VALUES ($1, $1, $2, $2)")
        .bind(profile_id)
        .bind(IMPORT_TIMESTAMP)
        .execute(pool)
        .await
        .expect("profil de test");
}

async fn insert_minimal_row(pool: &SqlitePool, table: &str, id: &str, profile_id: &str) {
    sqlx::query(&format!(
        "INSERT INTO {table} (id, profile_id, title, created_at, updated_at)
         VALUES ($1, $2, 'Fiche existante', $3, $3)"
    ))
    .bind(id)
    .bind(profile_id)
    .bind(IMPORT_TIMESTAMP)
    .execute(pool)
    .await
    .unwrap_or_else(|error| panic!("fixture {table} : {error}"));
}

/// Profil ouvert qui possède une fiche dans chacune des quinze bibliothèques,
/// des citations, ses bibliothèques ajoutées et un lien fournisseur, plus un
/// second profil vide : l’état que tout import refusé doit laisser intact.
async fn seed_existing_profiles(pool: &SqlitePool) {
    insert_profile(pool, "existant").await;
    insert_profile(pool, "vide").await;
    for table in [
        "films", "series", "anime", "books", "mangas", "games", "artworks",
    ]
    .iter()
    .chain(CUSTOM_TABLES.iter())
    {
        insert_minimal_row(pool, table, &format!("existant-{table}"), "existant").await;
    }
    execute_all(
        pool,
        &[
            "INSERT INTO book_quotes (id, book_id, body, position, created_at)
             VALUES ('existant-book-quote', 'existant-books', 'Citation existante', 0, '2026-10-22T08:00:00.000Z')",
            "INSERT INTO manga_quotes (id, manga_id, body, position, created_at)
             VALUES ('existant-manga-quote', 'existant-mangas', 'Citation existante', 0, '2026-10-22T08:00:00.000Z')",
            "INSERT INTO comic_quotes (id, comic_id, body, position, created_at)
             VALUES ('existant-comic-quote', 'existant-comics', 'Citation existante', 0, '2026-10-22T08:00:00.000Z')",
            "INSERT INTO profile_libraries (profile_id, library_id, position, added_at) VALUES
               ('existant', 'comics', 0, '2026-10-22T08:00:00.000Z'),
               ('existant', 'music', 1, '2026-10-22T08:00:00.000Z')",
            "INSERT INTO media_provider_links (
               profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at
             ) VALUES ('existant', 'books', 'existant-books', 'openlibrary', 'OL9W',
               '2026-10-22T08:00:00.000Z', '2026-10-22T08:00:00.000Z')",
            "UPDATE current_profile SET profile_id = 'existant' WHERE singleton = 1",
        ],
    )
    .await;
}

fn custom_entry(profile_id: &str, id: &str, title: &str) -> Value {
    json!({
        "id": id,
        "profileId": profile_id,
        "title": title,
        "creator": "\t=Créatrice, \"citée\"  ",
        "year": 1986,
        "status": "en cours",
        "rating": 4.5,
        "isFavorite": true,
        "progressCurrent": 0,
        "progressTotal": 12,
        "progressUpdatedAt": "2026-10-21T09:30:00.000Z",
        "startedAt": "2026-10-01",
        "finishedAt": "2026-10-20",
        "coverUrl": "https://example.test/couverture.jpg",
        "summary": "Résumé\r\nsur deux lignes",
        "personalNote": "日本語 — avis personnel  ",
        "details": {},
        "createdAt": "2026-10-02T08:00:00.000Z",
        "updatedAt": "2026-10-21T09:30:00.000Z",
        "quotes": []
    })
}

/// Document de profil complet : Comics (une fiche citée, une fiche sans
/// valeur facultative) en position 2, Musique (un album détaillé, un album
/// aux textes vides) en position 5.
fn custom_document(profile_id: &str) -> Value {
    let mut comic = custom_entry(profile_id, "comic-import", "Comic importé");
    comic["details"] = json!({ "éditeur": "Éditions de contrôle", "numéro": "#1" });
    comic["quotes"] = json!([
        {
            "id": "comic-import-quote-1",
            "entryId": "comic-import",
            "body": "Première citation",
            "position": 0,
            "createdAt": "2026-10-03T08:00:00.000Z"
        },
        {
            "id": "comic-import-quote-2",
            "entryId": "comic-import",
            "body": "\t=Seconde, \"citée\"  ",
            "position": 1,
            "createdAt": "2026-10-04T08:00:00.000Z"
        }
    ]);
    let mut sparse = custom_entry(profile_id, "comic-sparse", "Comic sans détail");
    for key in [
        "creator",
        "year",
        "rating",
        "progressCurrent",
        "progressTotal",
        "progressUpdatedAt",
        "startedAt",
        "finishedAt",
        "coverUrl",
        "summary",
        "personalNote",
    ] {
        sparse[key] = Value::Null;
    }
    sparse["status"] = json!("à découvrir");
    sparse["isFavorite"] = json!(false);

    let mut album = custom_entry(profile_id, "album-import", "Album de contrôle");
    album["details"] = json!({ "label": "Blue Note", "format": "Album" });
    album["status"] = json!("terminé");
    album["rating"] = json!(0.5);
    album["isFavorite"] = json!(false);
    album
        .as_object_mut()
        .unwrap()
        .remove("quotes")
        .expect("champ quotes facultatif");
    let mut blank = custom_entry(profile_id, "album-blank", "Album aux textes vides");
    for key in [
        "creator",
        "coverUrl",
        "summary",
        "personalNote",
        "finishedAt",
    ] {
        blank[key] = json!("");
    }

    json!({
        "profile": {
            "id": profile_id,
            "name": "Profil importé",
            "createdAt": "2026-10-01T08:00:00.000Z",
            "updatedAt": "2026-10-01T08:00:00.000Z"
        },
        "films": [],
        "series": [],
        "anime": [],
        "books": [],
        "mangas": [],
        "games": [],
        "artworks": [],
        "customLibraries": [
            {
                "libraryId": "comics",
                "position": 2,
                "addedAt": "2026-10-20T08:00:00.000Z",
                "entries": [comic, sparse]
            },
            {
                "libraryId": "music",
                "position": 5,
                "addedAt": "2026-10-21T08:00:00.000Z",
                "entries": [album, blank]
            }
        ]
    })
}

fn payload_from(document: Value) -> ImportLibraryDocumentPayload {
    serde_json::from_value(document).expect("document JSON conforme au contrat")
}

fn snake_to_camel(column: &str) -> String {
    let mut camel = String::new();
    let mut upper = false;
    for character in column.chars() {
        if character == '_' {
            upper = true;
        } else if upper {
            camel.extend(character.to_uppercase());
            upper = false;
        } else {
            camel.push(character);
        }
    }
    camel
}

/// Relit toutes les colonnes de la fiche et les compare au JSON importé : les
/// dix-neuf colonnes correspondent exactement aux champs du document.
async fn assert_custom_entry_stored(pool: &SqlitePool, table: &str, expected: &Value) {
    let id = expected["id"].as_str().unwrap();
    let rows = rows_json(pool, table, &format!("id = '{id}'")).await;
    assert_eq!(rows.len(), 1, "{table} doit contenir la fiche {id}");
    let stored = rows[0].as_object().unwrap();
    let expected_fields = expected.as_object().unwrap();
    assert_eq!(
        stored.len(),
        expected_fields
            .keys()
            .filter(|key| *key != "quotes")
            .count(),
        "chaque colonne de {table} correspond à un champ du document"
    );
    for (column, value) in stored {
        let key = snake_to_camel(column);
        let payload_value = expected_fields
            .get(&key)
            .unwrap_or_else(|| panic!("colonne {table}.{column} absente du document"));
        match (column.as_str(), payload_value) {
            ("details", _) => assert_eq!(
                serde_json::from_str::<Value>(value.as_str().unwrap()).unwrap(),
                *payload_value,
                "{table}.details"
            ),
            ("is_favorite", Value::Bool(flag)) => {
                assert_eq!(*value, json!(i64::from(*flag)), "{table}.is_favorite")
            }
            _ => assert_eq!(value, payload_value, "{table}.{column}"),
        }
    }
}

fn film_value(profile_id: &str) -> Value {
    json!({
        "id": format!("{profile_id}-film"),
        "profileId": profile_id,
        "title": "Film importé",
        "status": "terminé",
        "isFavorite": false,
        "createdAt": IMPORT_TIMESTAMP,
        "updatedAt": IMPORT_TIMESTAMP
    })
}

fn book_value(profile_id: &str, category: &str) -> Value {
    let id = format!("{profile_id}-livre");
    json!({
        "id": id,
        "profileId": profile_id,
        "title": "Livre importé",
        "category": category,
        "status": "lu",
        "isFavorite": false,
        "createdAt": IMPORT_TIMESTAMP,
        "updatedAt": IMPORT_TIMESTAMP,
        "quotes": [{
            "id": format!("{id}-quote"),
            "bookId": id,
            "body": "Citation du livre",
            "position": 0,
            "createdAt": IMPORT_TIMESTAMP
        }]
    })
}

#[test]
fn whole_profile_import_writes_every_field_of_custom_libraries() {
    tauri::async_runtime::block_on(async {
        let pool = latest_pool().await;
        insert_profile(&pool, "vide").await;
        let document = custom_document("vide");
        let payload = payload_from(document.clone());

        write_library_document_import(&pool, &payload, false)
            .await
            .expect("import de profil complet avec bibliothèques personnalisées");

        let comics = &document["customLibraries"][0]["entries"];
        assert_custom_entry_stored(&pool, "comics", &comics[0]).await;
        assert_custom_entry_stored(&pool, "comics", &comics[1]).await;
        let music = &document["customLibraries"][1]["entries"];
        assert_custom_entry_stored(&pool, "music", &music[0]).await;

        let blank = rows_json(&pool, "music", "id = 'album-blank'").await;
        for column in [
            "creator",
            "cover_url",
            "summary",
            "personal_note",
            "finished_at",
        ] {
            assert_eq!(
                blank[0][column],
                Value::Null,
                "un texte facultatif vide devient NULL comme dans les autres sections ({column})"
            );
        }

        let quotes = rows_json(&pool, "comic_quotes", "1").await;
        let expected_quotes: Vec<Value> = comics[0]["quotes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|quote| {
                json!({
                    "id": quote["id"],
                    "comic_id": quote["entryId"],
                    "body": quote["body"],
                    "position": quote["position"],
                    "created_at": quote["createdAt"]
                })
            })
            .collect();
        assert_eq!(
            quotes, expected_quotes,
            "citations, ordre et dates conservés"
        );

        let added: Vec<(String, String, i64, String)> = sqlx::query_as(
            "SELECT profile_id, library_id, position, added_at FROM profile_libraries ORDER BY position",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(
            added,
            vec![
                (
                    "vide".to_string(),
                    "comics".to_string(),
                    2,
                    "2026-10-20T08:00:00.000Z".to_string()
                ),
                (
                    "vide".to_string(),
                    "music".to_string(),
                    5,
                    "2026-10-21T08:00:00.000Z".to_string()
                ),
            ],
            "les bibliothèques ajoutées gardent leur position et leur date"
        );
        for table in CUSTOM_TABLES {
            let expected = match table {
                "comics" | "music" => 2,
                _ => 0,
            };
            assert_eq!(
                rows_json(&pool, table, "1").await.len(),
                expected,
                "{table}"
            );
        }

        let result = serde_json::to_value(library_document_result(&payload)).unwrap();
        assert_eq!(result["profileId"], "vide");
        assert_eq!(result["customLibraryCount"], 2, "{result}");
        assert_eq!(result["customEntryCount"], 4, "{result}");
        assert_eq!(result["bookCount"], 0);

        assert_database_is_consistent(&pool).await;
    });
}

#[test]
fn whole_profile_import_rolls_back_everything_when_a_custom_entry_fails_late() {
    tauri::async_runtime::block_on(async {
        let pool = latest_pool().await;
        seed_existing_profiles(&pool).await;
        let before = database_snapshot(&pool).await;

        for (profile_id, create_profile) in [("nouveau", true), ("vide", false)] {
            let mut document = custom_document(profile_id);
            document["films"] = json!([film_value(profile_id)]);
            document["books"] = json!([book_value(profile_id, "livre")]);
            let mut invalid = custom_entry(profile_id, "album-invalide", "Album invalide");
            invalid["rating"] = json!(7);
            document["customLibraries"][1]["entries"]
                .as_array_mut()
                .unwrap()
                .push(invalid);

            let error =
                write_library_document_import(&pool, &payload_from(document), create_profile)
                    .await
                    .expect_err("une note hors bornes doit faire échouer SQLite");
            assert!(
                error.contains("Album invalide"),
                "l’échec doit survenir sur la dernière fiche, après toutes les autres écritures : {error}"
            );
            assert_eq!(
                database_snapshot(&pool).await,
                before,
                "rollback complet (profil créé : {create_profile})"
            );
        }
        assert_database_is_consistent(&pool).await;
    });
}

/// Cas refusé avant écriture : libellé, altération du document valide et
/// fragment attendu dans le message d’erreur.
type RejectedDocumentCase = (&'static str, fn(&mut Value), &'static str);

#[test]
fn whole_profile_import_rejects_invalid_custom_libraries_before_writing() {
    tauri::async_runtime::block_on(async {
        let pool = latest_pool().await;
        seed_existing_profiles(&pool).await;
        let before = database_snapshot(&pool).await;
        let cases: [RejectedDocumentCase; 7] = [
            (
                "bibliothèque inconnue",
                |document| document["customLibraries"][1]["libraryId"] = json!("vinyles"),
                "« vinyles »",
            ),
            (
                "bibliothèque en double",
                |document| document["customLibraries"][1]["libraryId"] = json!("comics"),
                "deux fois",
            ),
            (
                "citation sur Musique",
                |document| {
                    document["customLibraries"][1]["entries"][0]["quotes"] = json!([{
                        "id": "music-quote",
                        "entryId": "album-import",
                        "body": "Citation interdite",
                        "position": 0,
                        "createdAt": IMPORT_TIMESTAMP
                    }])
                },
                "citations",
            ),
            (
                "citation d’une autre fiche",
                |document| {
                    document["customLibraries"][0]["entries"][0]["quotes"][1]["entryId"] =
                        json!("comic-sparse")
                },
                "citation ne correspond",
            ),
            (
                "détail non textuel",
                |document| {
                    document["customLibraries"][1]["entries"][0]["details"]["pistes"] = json!(9)
                },
                "« pistes »",
            ),
            (
                "statut inconnu",
                |document| document["customLibraries"][1]["entries"][0]["status"] = json!("écouté"),
                "statut",
            ),
            (
                "fiche d’un autre profil",
                |document| {
                    document["customLibraries"][1]["entries"][1]["profileId"] = json!("existant")
                },
                "ne cible pas le profil",
            ),
        ];

        for (label, mutate, expected_fragment) in cases {
            let mut document = custom_document("nouveau");
            document["films"] = json!([film_value("nouveau")]);
            mutate(&mut document);
            let error = write_library_document_import(&pool, &payload_from(document), true)
                .await
                .expect_err(label);
            assert!(
                error.contains(expected_fragment),
                "{label} : message inattendu « {error} »"
            );
            assert_eq!(
                database_snapshot(&pool).await,
                before,
                "{label} : rien ne doit être écrit"
            );
        }

        let mut not_an_object = custom_document("nouveau");
        not_an_object["customLibraries"][1]["entries"][0]["details"] = json!("label: Blue Note");
        assert!(
            serde_json::from_value::<ImportLibraryDocumentPayload>(not_an_object).is_err(),
            "les détails doivent être un objet JSON"
        );
    });
}

#[test]
fn whole_profile_import_rejects_comics_left_in_the_books_section() {
    tauri::async_runtime::block_on(async {
        let pool = latest_pool().await;
        seed_existing_profiles(&pool).await;
        let before = database_snapshot(&pool).await;

        for category in ["comics", " Comics "] {
            let mut document = custom_document("nouveau");
            document["books"] = json!([book_value("nouveau", category)]);
            let error = write_library_document_import(&pool, &payload_from(document), true)
                .await
                .expect_err("un comic ne doit plus entrer dans Livres");
            assert_eq!(
                error,
                "Les comics ont leur propre bibliothèque : ce document doit les placer dans la section Comics."
            );
            assert_eq!(database_snapshot(&pool).await, before);
        }
    });
}

#[test]
fn books_collection_import_rejects_comics_entries() {
    tauri::async_runtime::block_on(async {
        let pool = latest_pool().await;
        seed_existing_profiles(&pool).await;
        let before = database_snapshot(&pool).await;
        let livre = book_value("existant", "livre");
        let mut comic = book_value("existant", "comics");
        comic["id"] = json!("existant-comic");
        comic["quotes"] = json!([]);

        for (inserts, updates) in [
            (json!([livre, comic]), json!([])),
            (json!([]), json!([comic])),
        ] {
            let plan: CollectionImportPlan<ImportBook> = serde_json::from_value(json!({
                "profileId": "existant",
                "replaceExisting": true,
                "inserts": inserts,
                "updates": updates
            }))
            .expect("plan d’import Livres");
            let error = write_books_import_plan(&pool, &plan)
                .await
                .expect_err("un comic ne doit plus être fusionné dans Livres");
            assert_eq!(error, crate::books::COMICS_HAVE_THEIR_OWN_LIBRARY);
            assert_eq!(
                database_snapshot(&pool).await,
                before,
                "le remplacement refusé ne vide pas Livres"
            );
        }
    });
}

#[test]
fn whole_profile_import_refuses_a_profile_holding_only_custom_entries() {
    tauri::async_runtime::block_on(async {
        for table in CUSTOM_TABLES {
            let pool = latest_pool().await;
            insert_profile(&pool, "vide").await;
            insert_minimal_row(&pool, table, "fiche-existante", "vide").await;
            let before = database_snapshot(&pool).await;

            let mut document = custom_document("vide");
            document["films"] = json!([film_value("vide")]);
            let error = write_library_document_import(&pool, &payload_from(document), false)
                .await
                .expect_err("un profil qui a une fiche personnalisée n’est pas vide");
            assert!(
                error.contains("réservé à un profil vide"),
                "{table} : {error}"
            );
            assert_eq!(database_snapshot(&pool).await, before, "{table}");
        }
    });
}

#[test]
fn whole_profile_import_keeps_an_already_added_library_without_duplicating_it() {
    tauri::async_runtime::block_on(async {
        let pool = latest_pool().await;
        insert_profile(&pool, "vide").await;
        execute_all(
            &pool,
            &[
                "INSERT INTO profile_libraries (profile_id, library_id, position, added_at)
               VALUES ('vide', 'music', 0, '2026-01-01T00:00:00.000Z')",
            ],
        )
        .await;

        write_library_document_import(&pool, &payload_from(custom_document("vide")), false)
            .await
            .expect("une bibliothèque ajoutée mais vide laisse le profil vide");

        let added: Vec<(String, i64, String)> = sqlx::query_as(
            "SELECT library_id, position, added_at FROM profile_libraries
             WHERE profile_id = 'vide' ORDER BY library_id",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(
            added,
            vec![
                (
                    "comics".to_string(),
                    2,
                    "2026-10-20T08:00:00.000Z".to_string()
                ),
                (
                    "music".to_string(),
                    0,
                    "2026-01-01T00:00:00.000Z".to_string()
                ),
            ],
            "la bibliothèque déjà ajoutée garde sa place ; ses fiches sont importées"
        );
        assert_eq!(rows_json(&pool, "music", "1").await.len(), 2);
    });
}

#[test]
fn custom_library_whitelist_matches_the_migration_schema() {
    tauri::async_runtime::block_on(async {
        let pool = latest_pool().await;
        insert_profile(&pool, "vide").await;
        let ids: Vec<&str> = CUSTOM_LIBRARIES.iter().map(|library| library.id).collect();
        assert_eq!(ids, CUSTOM_TABLES.to_vec());

        let expected_columns = [
            "id",
            "profile_id",
            "title",
            "creator",
            "year",
            "status",
            "rating",
            "is_favorite",
            "progress_current",
            "progress_total",
            "progress_updated_at",
            "started_at",
            "finished_at",
            "cover_url",
            "summary",
            "personal_note",
            "details",
            "created_at",
            "updated_at",
        ];
        for (position, library) in CUSTOM_LIBRARIES.iter().enumerate() {
            assert_eq!(library.table, library.id, "identifiant = nom de table");
            assert!(!library.label.trim().is_empty());
            let columns: Vec<String> = sqlx::query_scalar(&format!(
                "SELECT name FROM pragma_table_info('{}') ORDER BY cid",
                library.table
            ))
            .fetch_all(&pool)
            .await
            .unwrap();
            assert_eq!(columns, expected_columns, "{}", library.table);
            sqlx::query(
                "INSERT INTO profile_libraries (profile_id, library_id, position) VALUES ('vide', $1, $2)",
            )
            .bind(library.id)
            .bind(position as i64)
            .execute(&pool)
            .await
            .unwrap_or_else(|error| panic!("{} accepté par profile_libraries : {error}", library.id));

            match &library.quotes {
                Some(quotes) => {
                    assert_eq!(
                        (library.id, quotes.table, quotes.parent_column),
                        ("comics", "comic_quotes", "comic_id")
                    );
                    let foreign_key: (String, String, String) = sqlx::query_as(
                        "SELECT \"table\", \"from\", on_delete FROM pragma_foreign_key_list('comic_quotes')",
                    )
                    .fetch_one(&pool)
                    .await
                    .unwrap();
                    assert_eq!(
                        foreign_key,
                        (
                            "comics".to_string(),
                            "comic_id".to_string(),
                            "CASCADE".to_string()
                        )
                    );
                }
                None => assert_ne!(library.id, "comics"),
            }
        }
        assert!(
            sqlx::query(
                "INSERT INTO profile_libraries (profile_id, library_id, position) VALUES ('vide', 'vinyles', 9)",
            )
            .execute(&pool)
            .await
            .is_err(),
            "une bibliothèque inconnue est refusée par le schéma"
        );
    });
}

// ---------------------------------------------------------------------------
// Migration 0022 : Recettes de cuisine (neuvième modèle)
// ---------------------------------------------------------------------------

/// SQLite ne modifie pas une contrainte CHECK : la migration reconstruit
/// `profile_libraries`. Les bibliothèques déjà ajoutées doivent en sortir
/// identiques, colonne par colonne, avec leur position et leur date.
#[test]
fn migration_0022_rebuilds_profile_libraries_without_touching_added_libraries() {
    tauri::async_runtime::block_on(async {
        let pool = pool_at(21).await;
        execute_all(
            &pool,
            &[
                "INSERT INTO profiles (id, name, created_at, updated_at) VALUES
                   ('lecteur', 'Lecteur', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
                   ('voisin', 'Voisin', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
                "INSERT INTO profile_libraries (profile_id, library_id, position, added_at) VALUES
                   ('lecteur', 'comics', 0, '2026-10-20T08:00:00.000Z'),
                   ('lecteur', 'board_games', 1, '2026-10-21T08:00:00.000Z'),
                   ('voisin', 'music', 0, '2026-10-22T08:00:00.000Z')",
                "INSERT INTO comics (id, profile_id, title, details, created_at, updated_at) VALUES
                   ('comic-controle', 'lecteur', 'Comic de contrôle', '{\"éditeur\":\"Éditions\"}',
                    '2026-10-20T08:00:00.000Z', '2026-10-20T08:00:00.000Z')",
            ],
        )
        .await;
        let libraries_before = rows_json(&pool, "profile_libraries", "1").await;
        let comics_before = rows_json(&pool, "comics", "1").await;
        assert_eq!(libraries_before.len(), 3);
        assert!(
            sqlx::query(
                "INSERT INTO profile_libraries (profile_id, library_id, position) VALUES ('lecteur', 'recipes', 2)"
            )
            .execute(&pool)
            .await
            .is_err(),
            "avant 0022, le schéma ne connaît pas les recettes"
        );

        migrator_up_to(22)
            .run(&pool)
            .await
            .expect("la migration 0022 s’applique sur une base v21");
        let version: i64 =
            sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations WHERE success = 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(version, 22);

        assert_eq!(
            rows_json(&pool, "profile_libraries", "1").await,
            libraries_before,
            "les bibliothèques ajoutées gardent profil, identifiant, position et date"
        );
        assert_eq!(
            rows_json(&pool, "comics", "1").await,
            comics_before,
            "les fiches des autres bibliothèques ne bougent pas"
        );

        sqlx::query(
            "INSERT INTO profile_libraries (profile_id, library_id, position) VALUES ('lecteur', 'recipes', 2)",
        )
        .execute(&pool)
        .await
        .expect("les recettes sont acceptées après 0022");
        assert!(
            sqlx::query(
                "INSERT INTO profile_libraries (profile_id, library_id, position) VALUES ('lecteur', 'vinyles', 3)"
            )
            .execute(&pool)
            .await
            .is_err(),
            "une bibliothèque inconnue reste refusée"
        );
        assert!(
            sqlx::query(
                "INSERT INTO profile_libraries (profile_id, library_id, position) VALUES ('lecteur', 'recipes', 4)"
            )
            .execute(&pool)
            .await
            .is_err(),
            "la clé primaire (profil, bibliothèque) est conservée"
        );
        assert!(
            sqlx::query(
                "INSERT INTO profile_libraries (profile_id, library_id, position) VALUES ('fantome', 'recipes', 0)"
            )
            .execute(&pool)
            .await
            .is_err(),
            "la clé étrangère vers profiles est conservée"
        );

        sqlx::query("DELETE FROM profiles WHERE id = 'voisin'")
            .execute(&pool)
            .await
            .unwrap();
        let remaining: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM profile_libraries WHERE profile_id = 'voisin'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            remaining, 0,
            "la suppression d’un profil emporte encore ses bibliothèques ajoutées"
        );

        assert_database_is_consistent(&pool).await;
    });
}

/// Une recette porte des textes longs : ingrédients et préparation arrivent
/// en plusieurs lignes, avec retours chariot, lignes vides, espaces de tête et
/// de fin, tabulations et caractères non latins. Rien ne doit être normalisé.
#[test]
fn whole_profile_import_keeps_every_line_of_a_recipe() {
    tauri::async_runtime::block_on(async {
        let pool = latest_pool().await;
        insert_profile(&pool, "vide").await;
        let mut recipe = custom_entry("vide", "recette-import", "Tarte de contrôle");
        recipe["status"] = json!("terminé");
        recipe["details"] = json!({
            "dish": "Dessert",
            "servings": "6 personnes",
            "ingredients": "200 g de farine\r\n100 g de beurre\n\n  3 œufs  \n\t=1 pincée de sel",
            "steps": "1. Mélanger.\n2. Cuire 35 min à 180 °C.\n\n日本語 — dernier paragraphe  "
        });
        recipe
            .as_object_mut()
            .unwrap()
            .remove("quotes")
            .expect("champ quotes facultatif");
        let mut document = custom_document("vide");
        document["customLibraries"] = json!([{
            "libraryId": "recipes",
            "position": 0,
            "addedAt": "2026-10-23T08:00:00.000Z",
            "entries": [recipe]
        }]);
        let payload = payload_from(document.clone());

        write_library_document_import(&pool, &payload, false)
            .await
            .expect("import d’un profil avec une bibliothèque Recettes");

        assert_custom_entry_stored(
            &pool,
            "recipes",
            &document["customLibraries"][0]["entries"][0],
        )
        .await;
        let activated: Vec<(String, i64)> =
            sqlx::query_as("SELECT library_id, position FROM profile_libraries ORDER BY position")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(activated, vec![("recipes".to_string(), 0)]);
        assert_database_is_consistent(&pool).await;
    });
}
