// Régressions d'import/export : fixtures isolées, jamais de base personnelle.

struct IoTemporaryDirectory(PathBuf);
impl Drop for IoTemporaryDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn portability_io_import_reader_is_bounded_even_when_the_file_grows_after_metadata() {
    let mut reader = Cursor::new(vec![b'x'; 128]);
    assert!(read_import_bytes(&mut reader, 8).is_err());
    assert_eq!(
        reader.position(),
        9,
        "ne jamais allouer ou lire tout un fichier qui a grossi après le contrôle de taille"
    );
    assert_eq!(
        read_import_bytes(Cursor::new(b"exact"), 5).unwrap(),
        b"exact"
    );
}

#[test]
fn portability_io_direct_file_limits_and_encoding_are_checked_without_modifying_the_source() {
    let directory = IoTemporaryDirectory(temporary_directory("bounded-import"));
    let path = directory.0.join("fixture.json");
    fs::write(&path, "日本語").unwrap();
    assert_eq!(read_utf8_file_with_limit(&path, 9).unwrap(), "日本語");
    assert!(read_utf8_file_with_limit(&path, 8).is_err());
    fs::write(&path, [0xff, 0xfe]).unwrap();
    assert!(read_utf8_file_with_limit(&path, 2)
        .unwrap_err()
        .contains("UTF-8"));
    assert_eq!(fs::read(&path).unwrap(), vec![0xff, 0xfe]);
    assert!(read_file_with_limit(&directory.0, 16).is_err());
}

#[cfg(unix)]
#[test]
fn portability_io_export_never_follows_a_symbolic_link_to_an_unselected_file() {
    let directory = IoTemporaryDirectory(temporary_directory("export-symlink"));
    let selected = directory.0.join("selected.csv");
    let other = directory.0.join("other.csv");
    fs::write(&other, "export non choisi").unwrap();
    std::os::unix::fs::symlink(&other, &selected).unwrap();
    write_export_file(&selected, "nouvel export", "export.csv").unwrap();
    assert_eq!(fs::read_to_string(&other).unwrap(), "export non choisi");
    assert_eq!(fs::read_to_string(&selected).unwrap(), "nouvel export");
    assert!(!fs::symlink_metadata(&selected)
        .unwrap()
        .file_type()
        .is_symlink());
}

#[test]
fn portability_io_failed_export_preserves_the_previous_target_and_cleans_its_temporary_file() {
    let directory = IoTemporaryDirectory(temporary_directory("export-failure"));
    let target = directory.0.join("non-remplacable.json");
    fs::create_dir(&target).unwrap();
    fs::write(target.join("original.json"), "sauvegarde initiale").unwrap();
    assert!(write_export_file(&target, "nouvel export", "export.json").is_err());
    assert_eq!(
        fs::read_to_string(target.join("original.json")).unwrap(),
        "sauvegarde initiale"
    );
    assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 1);
}

#[test]
fn portability_io_zip_security_guards_apply_to_both_readers() {
    for unsafe_name in [
        "../fixture.csv",
        "/fixture.csv",
        "C:/fixture.csv",
        "a/../fixture.csv",
        "a\\fixture.csv",
    ] {
        let bytes = notion_zip(&[(unsafe_name, "title\nFixture\n")]);
        assert!(
            matches!(extract_notion_zip("unsafe.zip", &bytes), Err(message) if message.contains("non sûr")),
            "{unsafe_name}"
        );
        assert!(
            matches!(inspect_zip_container("unsafe.zip", &bytes), Err(message) if message.contains("non sûr")),
            "{unsafe_name}"
        );
    }
    let encrypted =
        mark_first_zip_entry_as_encrypted(notion_zip(&[("fixture.csv", "title\nFixture\n")]));
    assert!(
        matches!(inspect_zip_container("encrypted.zip", &encrypted), Err(message) if message.contains("chiffrées"))
    );
    let invalid = notion_zip_bytes(&[("fixture.csv", &[0xff])]);
    assert!(
        matches!(inspect_zip_container("encoding.zip", &invalid), Err(message) if message.contains("UTF-8"))
    );
    let ignored = notion_zip_bytes(&[("image.png", &[0xff]), ("fixture.csv", b"title\nFixture\n")]);
    assert_eq!(
        inspect_zip_container("ignore.zip", &ignored)
            .unwrap()
            .container_candidates
            .len(),
        1
    );

    let large = vec![b'x'; MAX_ZIP_ENTRY_BYTES as usize];
    let exact = notion_zip_bytes(&[("fixture.csv", &large)]);
    assert!(inspect_zip_container("exact.zip", &exact).is_ok());
    let over = vec![b'x'; MAX_ZIP_ENTRY_BYTES as usize + 1];
    let oversized = notion_zip_bytes(&[("fixture.csv", &over)]);
    assert!(
        matches!(inspect_zip_container("large.zip", &oversized), Err(message) if message.contains("4 Mio"))
    );
    assert!(
        matches!(extract_notion_zip("large.zip", &oversized), Err(message) if message.contains("4 Mio"))
    );
    let names = (0..9)
        .map(|index| format!("{index}.csv"))
        .collect::<Vec<_>>();
    let entries = names
        .iter()
        .map(|name| (name.as_str(), large.as_slice()))
        .collect::<Vec<_>>();
    let cumulative = notion_zip_bytes(&entries);
    assert!(cumulative.len() < MAX_IMPORT_FILE_BYTES as usize);
    assert!(
        matches!(inspect_zip_container("cumulative.zip", &cumulative), Err(message) if message.contains("32 Mio"))
    );
    assert!(
        matches!(extract_notion_zip("cumulative.zip", &cumulative), Err(message) if message.contains("32 Mio"))
    );
}

fn io_complete_document_value(profile_id: &str) -> serde_json::Value {
    let timestamp = "2026-10-01T08:00:00.000Z";
    let note = "\t=Texte,\r\n\"日本語\"  ";
    let identity = |id: &str| {
        serde_json::json!({
            "id": id, "profileId": profile_id, "title": format!("{note}{id}"),
            "createdAt": timestamp, "updatedAt": timestamp
        })
    };
    let mut film = identity("film-io");
    film.as_object_mut().unwrap().extend(
        serde_json::json!({
            "originalTitle": note, "year": 2024, "status": "en attente", "isFavorite": true,
            "rating": 4.5, "watchedAt": "2026-10-01", "personalNote": note,
            "director": note, "summary": note, "providerName": "Source", "providerId": "123",
            "posterUrl": "https://example.test/film.jpg"
        })
        .as_object()
        .unwrap()
        .clone(),
    );
    let serial = |id: &str, category: &str| {
        let mut item = identity(id);
        item.as_object_mut().unwrap().extend(
            serde_json::json!({
                "showrunner": note, "casting": note, "summary": note, "category": category,
                "status": "à voir", "rating": 0.5, "isFavorite": true, "seasonsSeen": 0,
                "seasonsTotal": 12, "progressUpdatedAt": timestamp, "startedAt": "2026-10-01",
                "posterUrl": "https://example.test/series.jpg", "personalNote": note
            })
            .as_object()
            .unwrap()
            .clone(),
        );
        item
    };
    let book = |id: &str, category: &str| {
        let mut item = identity(id);
        item.as_object_mut().unwrap().extend(serde_json::json!({
            "author": note, "year": 2024, "summary": note, "category": category,
            "status": "à lire", "rating": 4.5, "isFavorite": true, "volumesRead": 0,
            "volumesTotal": 12, "progressUpdatedAt": timestamp, "startedAt": "2026-10-01",
            "coverUrl": "https://example.test/book.jpg", "personalNote": note,
            "quotes": [{"id": format!("{id}-quote"), "bookId": id, "body": note, "position": 0, "createdAt": timestamp}]
        }).as_object().unwrap().clone());
        item
    };
    let mut game = identity("game-io");
    game.as_object_mut().unwrap().extend(serde_json::json!({
        "developer": note, "platform": note, "year": 2024, "status": "à jouer", "rating": 0.5,
        "isFavorite": true, "playedAt": "2026-10-01", "coverUrl": "https://example.test/game.jpg", "personalNote": note
    }).as_object().unwrap().clone());
    serde_json::json!({
        "profile": {"id": profile_id, "name": "Profil de contrôle", "createdAt": timestamp, "updatedAt": timestamp},
        "films": [film], "series": [serial("series-io", "série télé")], "anime": [serial("anime-io", "animation")],
        "books": [book("book-io", "livre")], "mangas": [book("manga-io", "manga")],
        "games": [game], "artworks": [io_artwork_value("artwork-io", profile_id)]
    })
}

fn io_sql_key(key: &str) -> String {
    key.chars()
        .flat_map(|character| {
            if character.is_ascii_uppercase() {
                vec!['_', character.to_ascii_lowercase()]
            } else {
                vec![character]
            }
        })
        .collect()
}

async fn io_assert_stored_item(pool: &sqlx::SqlitePool, table: &str, expected: &serde_json::Value) {
    use sqlx::Row;
    let row = sqlx::query(&format!("SELECT * FROM {table} WHERE id = $1"))
        .bind(expected["id"].as_str().unwrap())
        .fetch_one(pool)
        .await
        .unwrap();
    for (key, value) in expected.as_object().unwrap() {
        if key == "quotes" || (key == "category" && ["anime", "mangas"].contains(&table)) {
            continue;
        }
        let column = if table == "manga_quotes" && key == "bookId" {
            "manga_id".to_string()
        } else {
            io_sql_key(key)
        };
        match value {
            serde_json::Value::Null => assert_eq!(
                row.try_get::<Option<String>, _>(column.as_str()).unwrap(),
                None,
                "{table}.{column}"
            ),
            serde_json::Value::String(value) => assert_eq!(
                row.try_get::<String, _>(column.as_str()).unwrap(),
                *value,
                "{table}.{column}"
            ),
            serde_json::Value::Bool(value) => assert_eq!(
                row.try_get::<i64, _>(column.as_str()).unwrap(),
                i64::from(*value),
                "{table}.{column}"
            ),
            serde_json::Value::Number(value) if value.is_i64() => assert_eq!(
                row.try_get::<i64, _>(column.as_str()).unwrap(),
                value.as_i64().unwrap(),
                "{table}.{column}"
            ),
            serde_json::Value::Number(value) => assert_eq!(
                row.try_get::<f64, _>(column.as_str()).unwrap(),
                value.as_f64().unwrap(),
                "{table}.{column}"
            ),
            _ => assert_eq!(
                serde_json::from_str::<serde_json::Value>(
                    &row.try_get::<String, _>(column.as_str()).unwrap()
                )
                .unwrap(),
                *value,
                "{table}.{column}"
            ),
        }
    }
}

async fn io_database_snapshot(pool: &sqlx::SqlitePool) -> Vec<(String, Vec<String>)> {
    let mut result = Vec::new();
    for table in [
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
    ] {
        let columns: Vec<String> =
            sqlx::query_scalar(&format!("SELECT name FROM pragma_table_info('{table}')"))
                .fetch_all(pool)
                .await
                .unwrap();
        let arguments = columns
            .iter()
            .map(|column| format!("'{column}',\"{column}\""))
            .collect::<Vec<_>>()
            .join(",");
        let rows: Vec<String> = sqlx::query_scalar(&format!(
            "SELECT json_object({arguments}) AS row_json FROM {table} ORDER BY row_json"
        ))
        .fetch_all(pool)
        .await
        .unwrap();
        result.push((table.to_string(), rows));
    }
    result
}

#[test]
fn portability_io_native_import_preserves_every_field_of_all_seven_libraries() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool_with_tmdb_migrations().await;
        let expected = io_complete_document_value("all-fields-io");
        let payload = serde_json::from_value(expected.clone()).unwrap();
        write_library_document_import(&pool, &payload, true)
            .await
            .unwrap();
        for table in [
            "films", "series", "anime", "books", "mangas", "games", "artworks",
        ] {
            io_assert_stored_item(&pool, table, &expected[table][0]).await;
        }
        for (table, section) in [("book_quotes", "books"), ("manga_quotes", "mangas")] {
            io_assert_stored_item(&pool, table, &expected[section][0]["quotes"][0]).await;
        }
        assert_eq!(
            sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "ok"
        );
        assert!(sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&pool)
            .await
            .unwrap()
            .is_empty());
    });
}

#[test]
fn portability_io_failure_in_last_global_section_rolls_back_all_tables_and_profile() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool_with_tmdb_migrations().await;
        let before = io_database_snapshot(&pool).await;
        let mut value = io_complete_document_value("failed-global-io");
        value["artworks"][0]["form"] = serde_json::json!("forme invalide");
        let payload = serde_json::from_value(value).unwrap();
        let error = write_library_document_import(&pool, &payload, true)
            .await
            .unwrap_err();
        assert!(
            error.contains("œuvre"),
            "l’échec doit survenir après les six premières sections : {error}"
        );
        assert_eq!(io_database_snapshot(&pool).await, before);
    });
}

#[test]
fn portability_io_failed_replacement_restores_every_library_quotes_and_provider_links() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool_with_tmdb_migrations().await;
        let value = io_complete_document_value("default");
        write_library_document_import(
            &pool,
            &serde_json::from_value(value.clone()).unwrap(),
            false,
        )
        .await
        .unwrap();
        for (medium, id) in [
            ("series", "series-io"),
            ("anime", "anime-io"),
            ("books", "book-io"),
            ("mangas", "manga-io"),
            ("games", "game-io"),
        ] {
            sqlx::query("INSERT INTO media_provider_links (profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at) VALUES ('default', $1, $2, 'fixture', '123', '2026-10-01T08:00:00.000Z', '2026-10-01T08:00:00.000Z')")
                .bind(medium).bind(id).execute(&pool).await.unwrap();
        }
        let before = io_database_snapshot(&pool).await;
        macro_rules! failed_replace {
            ($section:literal, $writer:ident, $item:ty) => {{
                let mut invalid = value[$section][0].clone();
                invalid["status"] = serde_json::json!("statut invalide");
                let plan = CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: true,
                    inserts: vec![serde_json::from_value::<$item>(invalid).unwrap()],
                    updates: Vec::new(),
                };
                assert!(
                    $writer(&pool, &plan).await.is_err(),
                    "{} doit échouer dans SQLite",
                    $section
                );
                assert_eq!(
                    io_database_snapshot(&pool).await,
                    before,
                    "rollback {} : fiches, citations et liens doivent revenir ensemble",
                    $section
                );
            }};
        }
        failed_replace!("films", write_films_import_plan, ImportFilm);
        failed_replace!("series", write_series_import_plan, ImportSeries);
        failed_replace!("anime", write_anime_import_plan, ImportAnime);
        failed_replace!("books", write_books_import_plan, ImportBook);
        failed_replace!("mangas", write_mangas_import_plan, ImportManga);
        failed_replace!("games", write_games_import_plan, ImportGame);
        failed_replace!("artworks", write_artworks_import_plan, ImportArtwork);
    });
}

#[test]
fn portability_io_export_replaces_only_the_selected_file_not_hard_link_aliases() {
    let guard = IoTemporaryDirectory(temporary_directory("export-hardlink"));
    let directory = &guard.0;
    let selected = directory.join("selected.json");
    let previous = directory.join("previous.json");
    fs::write(&previous, "ancienne sauvegarde complète").unwrap();
    fs::hard_link(&previous, &selected).unwrap();

    write_export_file(&selected, "nouvelle sauvegarde complète", "export.json").unwrap();

    assert_eq!(
        fs::read_to_string(&selected).unwrap(),
        "nouvelle sauvegarde complète"
    );
    assert_eq!(
        fs::read_to_string(&previous).unwrap(),
        "ancienne sauvegarde complète",
        "l’export ne doit pas tronquer l’inode partagé avec un autre fichier"
    );
    assert_eq!(
        fs::read_dir(directory).unwrap().count(),
        2,
        "aucun fichier temporaire résiduel"
    );
    fs::remove_dir_all(directory).unwrap();
}

fn io_artwork_value(id: &str, profile_id: &str) -> serde_json::Value {
    serde_json::json!({
        "id": id, "profileId": profile_id, "title": "Œuvre de contrôle",
        "artist": "Artiste", "year": 2024, "form": "peinture",
        "location": "Lieu", "exhibition": "Exposition", "status": "découverte",
        "isFavorite": true, "discoveredAt": "2026-10-01",
        "imageUrl": "https://example.test/art.jpg", "personalNote": "\t=Avis,\n\"conservé\"  ",
        "customFields": [{"name": "Technique", "value": "\t=Huile,\n\"sur toile\"  "}],
        "details": {"text": "Sous le pont Mirabeau\n\n    Et nos amours", "collection": "Alcools 日本語"},
        "createdAt": "2026-10-01T08:00:00.000Z", "updatedAt": "2026-10-02T08:00:00.000Z"
    })
}

async fn stored_artwork_details(pool: &sqlx::SqlitePool, id: &str) -> serde_json::Value {
    let stored: String = sqlx::query_scalar("SELECT details FROM artworks WHERE id = $1")
        .bind(id)
        .fetch_one(pool)
        .await
        .expect("relecture des champs de forme");
    serde_json::from_str(&stored).expect("objet JSON stocké")
}

#[test]
fn portability_io_global_json_import_preserves_artwork_custom_fields() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool_with_tmdb_migrations().await;
        let value = io_artwork_value("art-io", "profile-io");
        let mut payload = empty_document("profile-io");
        payload
            .artworks
            .push(serde_json::from_value(value.clone()).expect("art JSON valide"));

        write_library_document_import(&pool, &payload, true)
            .await
            .expect("import global");

        let stored: Option<String> =
            sqlx::query_scalar("SELECT custom_fields FROM artworks WHERE id = 'art-io'")
                .fetch_one(&pool)
                .await
                .expect("relecture des champs libres");
        let fields: serde_json::Value =
            serde_json::from_str(stored.as_deref().unwrap_or("null")).expect("JSON stocké");
        assert_eq!(
            fields, value["customFields"],
            "aucun champ personnel du JSON ne doit disparaître à la frontière native"
        );
        assert_eq!(
            stored_artwork_details(&pool, "art-io").await,
            value["details"],
            "le poème et son recueil doivent passer la frontière native intacts"
        );
    });
}

#[test]
fn portability_io_artwork_without_details_gets_an_empty_object_and_the_column_refuses_other_json() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool_with_tmdb_migrations().await;
        let mut value = io_artwork_value("art-v5", "profile-v5");
        value.as_object_mut().unwrap().remove("details");
        let mut payload = empty_document("profile-v5");
        payload
            .artworks
            .push(serde_json::from_value(value).expect("œuvre v5 sans détails"));
        write_library_document_import(&pool, &payload, true)
            .await
            .expect("import d’un document v5");
        assert_eq!(
            stored_artwork_details(&pool, "art-v5").await,
            serde_json::json!({}),
            "une œuvre venue d’un document v5 reçoit un objet vide"
        );
        for invalid in ["[]", "\"texte\"", "pas du JSON"] {
            let refused = sqlx::query("UPDATE artworks SET details = $1 WHERE id = 'art-v5'")
                .bind(invalid)
                .execute(&pool)
                .await;
            assert!(refused.is_err(), "la colonne doit refuser {invalid}");
        }
    });
}

#[test]
fn portability_io_collection_import_preserves_artwork_custom_fields_on_insert_and_update() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool_with_tmdb_migrations().await;
        let mut value = io_artwork_value("art-unit-io", "default");
        for is_update in [false, true] {
            value["customFields"][0]["value"] = serde_json::json!(if is_update {
                "Valeur mise à jour"
            } else {
                "Valeur initiale"
            });
            value["details"]["collection"] =
                serde_json::json!(if is_update { "Calligrammes" } else { "Alcools" });
            let artwork = serde_json::from_value(value.clone()).expect("art JSON valide");
            let (inserts, updates) = if is_update {
                (Vec::new(), vec![artwork])
            } else {
                (vec![artwork], Vec::new())
            };
            write_artworks_import_plan(
                &pool,
                &CollectionImportPlan {
                    profile_id: "default".to_string(),
                    replace_existing: false,
                    inserts,
                    updates,
                },
            )
            .await
            .expect("import unitaire");
            let stored: Option<String> =
                sqlx::query_scalar("SELECT custom_fields FROM artworks WHERE id = 'art-unit-io'")
                    .fetch_one(&pool)
                    .await
                    .expect("relecture native");
            assert_eq!(
                serde_json::from_str::<serde_json::Value>(stored.as_deref().unwrap_or("null"))
                    .unwrap(),
                value["customFields"],
                "les champs libres doivent suivre insert et update"
            );
            assert_eq!(
                stored_artwork_details(&pool, "art-unit-io").await,
                value["details"],
                "les champs de forme doivent suivre insert et update"
            );
        }
    });
}
