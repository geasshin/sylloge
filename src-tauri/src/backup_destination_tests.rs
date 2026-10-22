// Destination d’onboarding : SQLite mémoire et dossiers temporaires uniquement.
mod backup_destination {
    use super::*;

    async fn destination_db_state(pool: &sqlx::SqlitePool) -> DbInstances {
        let instances = DbInstances::default();
        instances
            .0
            .write()
            .await
            .insert(DATABASE_URL.to_string(), DbPool::Sqlite(pool.clone()));
        instances
    }

    #[test]
    fn configuration_targets_only_the_confirmed_profile_and_resets_its_daily_guard() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_profile(&pool, "onboarding-profile").await;
            let original = IoTemporaryDirectory(temporary_directory("destination-original"));
            let chosen = IoTemporaryDirectory(temporary_directory("destination-confirmed"));
            for profile_id in ["default", "onboarding-profile"] {
                configure_backup_directory(&pool, profile_id, &original.0)
                    .await
                    .unwrap();
                assert!(matches!(
                    save_automatic_snapshot(&pool, profile_id, "{}", "2026-10-22")
                        .await
                        .unwrap(),
                    AutomaticSnapshotOutcome::Saved(_)
                ));
            }
            let untouched = read_backup_settings(&pool, "default").await.unwrap();
            let registered = registered_backup_snapshots(&pool, "onboarding-profile")
                .await
                .unwrap();
            let preview = inspect_backup_destination(Some(&chosen.0))
                .unwrap()
                .unwrap();
            let instances = destination_db_state(&pool).await;
            let lock = BackupSnapshotLock::default();

            let configured = configure_backup_destination_with_state(
                &instances,
                &lock,
                "onboarding-profile",
                &preview.backup_directory,
            )
            .await
            .expect("configuration après confirmation");

            assert_eq!(configured, preview);
            assert_eq!(
                read_backup_settings(&pool, "onboarding-profile")
                    .await
                    .unwrap(),
                Some(configured)
            );
            assert_eq!(
                read_backup_settings(&pool, "default").await.unwrap(),
                untouched
            );
            assert_eq!(
                registered_backup_snapshots(&pool, "onboarding-profile")
                    .await
                    .unwrap(),
                registered,
                "configurer ne doit pas modifier les sauvegardes enregistrées"
            );
            assert_eq!(fs::read_dir(&original.0).unwrap().count(), 2);
            assert_eq!(fs::read_dir(&chosen.0).unwrap().count(), 0);
            let selected: String =
                sqlx::query_scalar("SELECT profile_id FROM current_profile WHERE singleton = 1")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(selected, "default");
            assert!(matches!(
                save_automatic_snapshot(&pool, "onboarding-profile", "{}", "2026-10-22")
                    .await
                    .unwrap(),
                AutomaticSnapshotOutcome::Saved(_)
            ));
            assert_eq!(fs::read_dir(&chosen.0).unwrap().count(), 1);
            assert_eq!(fs::read_dir(&original.0).unwrap().count(), 2);
        });
    }

    #[test]
    fn cancellation_keeps_the_existing_configuration() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let directory = IoTemporaryDirectory(temporary_directory("destination-cancel"));
            configure_backup_directory(&pool, "default", &directory.0)
                .await
                .unwrap();
            let before = read_backup_settings(&pool, "default").await.unwrap();

            assert_eq!(inspect_backup_destination(None).unwrap(), None);

            assert_eq!(
                read_backup_settings(&pool, "default").await.unwrap(),
                before
            );
            assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 0);
        });
    }

    #[test]
    fn preselection_rejects_empty_missing_or_regular_file_paths() {
        let directory = IoTemporaryDirectory(temporary_directory("destination-invalid"));
        let file = directory.0.join("not-a-directory.json");
        fs::write(&file, "copie à préserver").unwrap();

        for path in [PathBuf::new(), directory.0.join("missing"), file.clone()] {
            assert!(inspect_backup_destination(Some(&path)).is_err(), "{path:?}");
        }

        assert_eq!(fs::read_to_string(file).unwrap(), "copie à préserver");
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 1);
    }

    #[test]
    fn configuration_rejects_missing_or_empty_profiles_without_creating_them() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let directory = IoTemporaryDirectory(temporary_directory("destination-no-profile"));
            let instances = destination_db_state(&pool).await;
            let lock = BackupSnapshotLock::default();
            let preview = inspect_backup_destination(Some(&directory.0))
                .unwrap()
                .unwrap();

            for (profile_id, expected) in [
                ("missing-profile", "introuvable"),
                ("", "invalide"),
                ("   ", "invalide"),
            ] {
                let error = configure_backup_destination_with_state(
                    &instances,
                    &lock,
                    profile_id,
                    &preview.backup_directory,
                )
                .await
                .expect_err("un profil existant est obligatoire");
                assert!(error.contains(expected), "{error}");
            }

            let profiles: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM profiles")
                .fetch_one(&pool)
                .await
                .unwrap();
            let settings: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM backup_settings")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(profiles, 1);
            assert_eq!(settings, 0);
            assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 0);
        });
    }

    #[test]
    fn configuration_revalidates_a_destination_removed_or_replaced_after_preselection() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let original = IoTemporaryDirectory(temporary_directory("destination-stable"));
            let changed = IoTemporaryDirectory(temporary_directory("destination-changed"));
            configure_backup_directory(&pool, "default", &original.0)
                .await
                .unwrap();
            save_automatic_snapshot(&pool, "default", "{}", "2026-10-22")
                .await
                .unwrap();
            let before = read_backup_settings(&pool, "default").await.unwrap();
            let registered = registered_backup_snapshots(&pool, "default").await.unwrap();
            let instances = destination_db_state(&pool).await;
            let lock = BackupSnapshotLock::default();

            for replace_with_file in [false, true] {
                let path = changed.0.join("chosen");
                fs::create_dir(&path).unwrap();
                let preview = inspect_backup_destination(Some(&path)).unwrap().unwrap();
                fs::remove_dir(&path).unwrap();
                if replace_with_file {
                    fs::write(&path, "fichier non choisi").unwrap();
                }

                assert!(configure_backup_destination_with_state(
                    &instances,
                    &lock,
                    "default",
                    &preview.backup_directory,
                )
                .await
                .is_err());

                assert_eq!(
                    read_backup_settings(&pool, "default").await.unwrap(),
                    before
                );
                assert_eq!(
                    registered_backup_snapshots(&pool, "default").await.unwrap(),
                    registered
                );
                assert_eq!(fs::read_dir(&original.0).unwrap().count(), 1);
                if replace_with_file {
                    assert_eq!(fs::read_to_string(&path).unwrap(), "fichier non choisi");
                }
            }
        });
    }

    #[cfg(unix)]
    #[test]
    fn configuration_probes_write_access_again_after_preselection() {
        use std::os::unix::fs::PermissionsExt;

        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let original = IoTemporaryDirectory(temporary_directory("destination-write-original"));
            let changed = IoTemporaryDirectory(temporary_directory("destination-write-changed"));
            configure_backup_directory(&pool, "default", &original.0)
                .await
                .unwrap();
            save_automatic_snapshot(&pool, "default", "{}", "2026-10-22")
                .await
                .unwrap();
            let before = read_backup_settings(&pool, "default").await.unwrap();
            let preview = inspect_backup_destination(Some(&changed.0))
                .unwrap()
                .unwrap();
            let instances = destination_db_state(&pool).await;
            let lock = BackupSnapshotLock::default();
            let permissions = fs::metadata(&changed.0).unwrap().permissions();
            fs::set_permissions(&changed.0, fs::Permissions::from_mode(0o500)).unwrap();

            let result = configure_backup_destination_with_state(
                &instances,
                &lock,
                "default",
                &preview.backup_directory,
            )
            .await;
            fs::set_permissions(&changed.0, permissions).unwrap();

            assert!(matches!(result, Err(message) if message.contains("inscriptible")));
            assert_eq!(
                read_backup_settings(&pool, "default").await.unwrap(),
                before
            );
            assert_eq!(fs::read_dir(&changed.0).unwrap().count(), 0);
            assert_eq!(fs::read_dir(&original.0).unwrap().count(), 1);
        });
    }

    #[test]
    fn configuration_waits_for_the_shared_snapshot_lock() {
        use std::{
            future::Future,
            sync::Arc,
            task::{Context, Poll, Wake, Waker},
        };

        struct TestWake;
        impl Wake for TestWake {
            fn wake(self: Arc<Self>) {}
        }

        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let directory = IoTemporaryDirectory(temporary_directory("destination-locked"));
            // Sans verrou, l’absence de base ferait terminer l’appel immédiatement.
            let instances = DbInstances::default();
            let lock = BackupSnapshotLock::default();
            let guard = lock.0.lock().await;
            let path = directory.0.to_string_lossy();
            let mut configuring = Box::pin(configure_backup_destination_with_state(
                &instances, &lock, "default", &path,
            ));
            let waker = Waker::from(Arc::new(TestWake));

            assert!(matches!(
                configuring.as_mut().poll(&mut Context::from_waker(&waker)),
                Poll::Pending
            ));
            assert_eq!(read_backup_settings(&pool, "default").await.unwrap(), None);
            assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 0);

            instances
                .0
                .write()
                .await
                .insert(DATABASE_URL.to_string(), DbPool::Sqlite(pool.clone()));
            drop(guard);
            configuring
                .await
                .expect("configuration après libération du verrou");
            assert!(read_backup_settings(&pool, "default")
                .await
                .unwrap()
                .is_some());
        });
    }

    #[cfg(unix)]
    #[test]
    fn preselection_rejects_a_readable_but_non_writable_directory() {
        use std::os::unix::fs::PermissionsExt;

        let directory = IoTemporaryDirectory(temporary_directory("destination-read-only"));
        let original = fs::metadata(&directory.0).unwrap().permissions();
        fs::set_permissions(&directory.0, fs::Permissions::from_mode(0o500)).unwrap();
        let readable = fs::read_dir(&directory.0).is_ok();
        let result = inspect_backup_destination(Some(&directory.0));
        fs::set_permissions(&directory.0, original).unwrap();

        assert!(readable, "la lecture doit rester possible");
        assert!(
            matches!(result, Err(message) if message.contains("inscriptible")),
            "la présélection doit vraiment sonder l’écriture, pas seulement la lecture"
        );
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 0);
    }

    #[test]
    fn preselection_before_profile_creation_does_not_persist_anything() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_tmdb_migrations().await;
            sqlx::raw_sql(include_str!(
                "../migrations/0019_profile_identity_and_first_run.sql"
            ))
            .execute(&pool)
            .await
            .expect("base vierge sans profil technique");
            let directory = IoTemporaryDirectory(temporary_directory("destination-preview"));
            let existing_file = directory.0.join("existing-backup.json");
            fs::write(&existing_file, "copie existante").unwrap();

            let settings = inspect_backup_destination(Some(&directory.0))
                .expect("destination inscriptible")
                .expect("destination choisie");

            assert_eq!(
                serde_json::to_value(&settings).unwrap(),
                serde_json::json!({
                    "backupDirectory": fs::canonicalize(&directory.0).unwrap().to_string_lossy(),
                    "lastAutomaticSnapshotDay": null,
                    "directoryAvailable": true
                })
            );
            for table in ["profiles", "backup_settings", "backup_snapshots"] {
                let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
                    .fetch_one(&pool)
                    .await
                    .unwrap();
                assert_eq!(count, 0, "aucune écriture dans {table} avant confirmation");
            }
            let selected: Option<String> =
                sqlx::query_scalar("SELECT profile_id FROM current_profile WHERE singleton = 1")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(selected, None);
            assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 1);
            assert_eq!(
                fs::read_to_string(existing_file).unwrap(),
                "copie existante"
            );
        });
    }
}
