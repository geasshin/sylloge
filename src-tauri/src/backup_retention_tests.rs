// Conservation par paliers, noms explicites, lecture des copies et recherche
// bornée : SQLite mémoire et dossiers temporaires uniquement, jamais le vrai HOME.
mod backup_retention {
    use super::*;

    type CivilDate = (i64, u32, u32);

    // Calendrier de test indépendant de l’arithmétique civile de production.
    fn test_days_in_month(year: i64, month: u32) -> u32 {
        match month {
            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
            4 | 6 | 9 | 11 => 30,
            _ if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) => 29,
            _ => 28,
        }
    }

    fn previous_day((year, month, day): CivilDate) -> CivilDate {
        if day > 1 {
            (year, month, day - 1)
        } else if month > 1 {
            (year, month - 1, test_days_in_month(year, month - 1))
        } else {
            (year - 1, 12, 31)
        }
    }

    /// `count` jours consécutifs, de `today` vers le passé.
    fn daily_dates(today: CivilDate, count: usize) -> Vec<CivilDate> {
        let mut dates = Vec::with_capacity(count);
        let mut date = today;
        for _ in 0..count {
            dates.push(date);
            date = previous_day(date);
        }
        dates
    }

    fn day_label((year, month, day): CivilDate) -> String {
        format!("{year:04}-{month:02}-{day:02}")
    }

    fn creation(date: CivilDate, time: &str) -> String {
        format!("{}T{time}.000Z", day_label(date))
    }

    fn entries(values: &[(&str, &str)]) -> Vec<(String, String)> {
        values
            .iter()
            .map(|(file_name, created_at)| (file_name.to_string(), created_at.to_string()))
            .collect()
    }

    fn names(values: &[&str]) -> HashSet<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    async fn register_created(
        pool: &sqlx::SqlitePool,
        profile_id: &str,
        file_name: &str,
        created_at: &str,
    ) {
        sqlx::query(
            "INSERT INTO backup_snapshots (profile_id, file_name, created_at)
             VALUES ($1, $2, $3)",
        )
        .bind(profile_id)
        .bind(file_name)
        .bind(created_at)
        .execute(pool)
        .await
        .expect("registre de test");
    }

    async fn registered_names(pool: &sqlx::SqlitePool, profile_id: &str) -> HashSet<String> {
        registered_backup_snapshots(pool, profile_id)
            .await
            .expect("lecture du registre")
            .into_iter()
            .map(|snapshot| snapshot.file_name)
            .collect()
    }

    /// Copies quotidiennes du 2025-09-18 au 2026-10-22 (jeudi) : résultat
    /// attendu calculé à la main, semaines du lundi au dimanche.
    const EXPECTED_DAILY_TIERS: [&str; 13] = [
        // Les trois plus récentes.
        "2026-10-22",
        "2026-10-21",
        "2026-10-20",
        // Une par semaine précédente non représentée, au plus quatre.
        "2026-10-18",
        "2026-10-11",
        "2026-10-04",
        "2026-09-27",
        // Une par mois précédent non représenté, au plus six.
        "2026-08-31",
        "2026-07-31",
        "2026-06-30",
        "2026-05-31",
        "2026-04-30",
        "2026-03-31",
    ];

    #[test]
    fn tiers_keep_exactly_thirteen_daily_copies_over_four_hundred_days() {
        let dates = daily_dates((2026, 10, 22), 400);
        assert_eq!(day_label(dates[399]), "2025-09-18");
        let snapshots = dates
            .iter()
            .map(|date| {
                (
                    format!("copie-{}.json", day_label(*date)),
                    creation(*date, "21:00:00"),
                )
            })
            .collect::<Vec<_>>();
        let expected = EXPECTED_DAILY_TIERS
            .iter()
            .map(|day| format!("copie-{day}.json"))
            .collect::<HashSet<_>>();

        assert_eq!(
            RECENT_BACKUP_COPIES + WEEKLY_BACKUP_ARCHIVES + MONTHLY_BACKUP_ARCHIVES,
            13
        );
        assert_eq!(retained_snapshot_names(&snapshots), expected);
        let mut oldest_first = snapshots.clone();
        oldest_first.reverse();
        assert_eq!(
            retained_snapshot_names(&oldest_first),
            expected,
            "le résultat ne doit pas dépendre de l’ordre fourni"
        );
    }

    #[test]
    fn tiers_keep_only_the_three_latest_copies_of_a_busy_day() {
        let snapshots = entries(&[
            ("aube.json", "2026-10-22T05:00:00.000Z"),
            ("matin.json", "2026-10-22T08:00:00.000Z"),
            ("midi.json", "2026-10-22T12:00:00.000Z"),
            ("soir.json", "2026-10-22T20:00:00.000Z"),
            ("nuit.json", "2026-10-22T23:59:59.999Z"),
            ("semaine-avant-tot.json", "2026-10-15T08:00:00.000Z"),
            ("semaine-avant-tard.json", "2026-10-15T18:00:00.000Z"),
        ]);

        assert_eq!(
            retained_snapshot_names(&snapshots),
            names(&[
                "nuit.json",
                "soir.json",
                "midi.json",
                "semaine-avant-tard.json"
            ])
        );
    }

    #[test]
    fn tiers_break_identical_creation_times_by_descending_file_name() {
        let created_at = "2026-10-22T12:00:00.000Z";
        let snapshots = entries(&[
            ("copie-a.json", created_at),
            ("copie-c.json", created_at),
            ("copie-d.json", created_at),
            ("copie-b.json", created_at),
        ]);

        assert_eq!(
            retained_snapshot_names(&snapshots),
            names(&["copie-d.json", "copie-c.json", "copie-b.json"])
        );
    }

    #[test]
    fn tiers_group_weeks_from_monday_to_sunday_in_utc() {
        let snapshots = entries(&[
            ("jeudi.json", "2026-10-22T10:00:00.000Z"),
            ("mercredi.json", "2026-10-21T10:00:00.000Z"),
            ("mardi.json", "2026-10-20T10:00:00.000Z"),
            ("lundi.json", "2026-10-19T10:00:00.000Z"),
            // Lundi 1 h 30 à Paris, mais encore dimanche en UTC.
            ("dimanche-utc.json", "2026-10-18T23:30:00.000Z"),
            ("lundi-precedent.json", "2026-10-12T10:00:00.000Z"),
            ("dimanche-precedent.json", "2026-10-11T10:00:00.000Z"),
        ]);

        assert_eq!(
            retained_snapshot_names(&snapshots),
            names(&[
                "jeudi.json",
                "mercredi.json",
                "mardi.json",
                "dimanche-utc.json",
                "dimanche-precedent.json",
            ])
        );
    }

    #[test]
    fn tiers_keep_every_copy_whose_creation_date_is_unreadable() {
        let unreadable = [
            "pas une date",
            "",
            "2026-02-30T10:00:00.000Z",
            "2026-13-01T10:00:00.000Z",
            "2026-10-22T24:00:00.000Z",
            // Trié avant toutes les dates : ne doit pas occuper un palier.
            "zzzz-10-22T10:00:00.000Z",
        ];
        let mut snapshots = entries(&[
            ("recente-1.json", "2026-10-22T10:00:00.000Z"),
            ("recente-2.json", "2026-10-22T09:00:00.000Z"),
            ("recente-3.json", "2026-10-22T08:00:00.000Z"),
            ("doublon-du-jour.json", "2026-10-22T07:00:00.000Z"),
        ]);
        for (index, created_at) in unreadable.iter().enumerate() {
            snapshots.push((format!("illisible-{index}.json"), created_at.to_string()));
        }
        let mut expected = names(&["recente-1.json", "recente-2.json", "recente-3.json"]);
        expected.extend((0..unreadable.len()).map(|index| format!("illisible-{index}.json")));

        assert_eq!(
            retained_snapshot_names(&snapshots),
            expected,
            "une date incomprise garde la copie sans évincer une copie datée"
        );
    }

    #[test]
    fn retention_deletes_only_registered_owned_copies_outside_the_tiers() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_profile(&pool, "second-profile").await;
            let directory = IoTemporaryDirectory(temporary_directory("tiers"));
            let mut daily = Vec::new();
            for (index, date) in daily_dates((2026, 10, 22), 400).into_iter().enumerate() {
                let file_name = snapshot_file_name("default", index as u128 + 1);
                fs::write(directory.0.join(&file_name), day_label(date)).unwrap();
                register_created(&pool, "default", &file_name, &creation(date, "21:00:00")).await;
                daily.push((day_label(date), file_name));
            }
            // Un nom possédé mais jamais enregistré n’est jamais supprimé.
            let unregistered = snapshot_file_name("default", 10_000);
            fs::write(directory.0.join(&unregistered), "hors registre").unwrap();
            let undated = snapshot_file_name("default", 10_001);
            fs::write(directory.0.join(&undated), "date illisible").unwrap();
            register_created(&pool, "default", &undated, "date illisible").await;
            let mut foreign = Vec::new();
            for index in 0..20_u128 {
                let file_name = snapshot_file_name("second-profile", index + 1);
                fs::write(directory.0.join(&file_name), "autre profil").unwrap();
                let created_at = format!("2024-01-{:02}T10:00:00.000Z", index + 1);
                register_created(&pool, "second-profile", &file_name, &created_at).await;
                foreign.push(file_name);
            }

            let retained = apply_snapshot_retention(&pool, &directory.0, "default")
                .await
                .expect("conservation par paliers");

            let mut expected = daily
                .iter()
                .filter(|(day, _)| EXPECTED_DAILY_TIERS.contains(&day.as_str()))
                .map(|(_, file_name)| file_name.clone())
                .collect::<HashSet<_>>();
            expected.insert(undated.clone());
            assert_eq!(retained, 14, "13 copies datées et une date illisible");
            assert_eq!(registered_names(&pool, "default").await, expected);
            for (day, file_name) in &daily {
                assert_eq!(
                    directory.0.join(file_name).exists(),
                    EXPECTED_DAILY_TIERS.contains(&day.as_str()),
                    "copie du {day}"
                );
            }
            assert!(directory.0.join(&unregistered).exists());
            assert!(directory.0.join(&undated).exists());
            assert_eq!(registered_names(&pool, "second-profile").await.len(), 20);
            assert!(foreign.iter().all(|name| directory.0.join(name).exists()));
        });
    }

    fn next_day((year, month, day): CivilDate) -> CivilDate {
        if day < test_days_in_month(year, month) {
            (year, month, day + 1)
        } else if month < 12 {
            (year, month + 1, 1)
        } else {
            (year + 1, 1, 1)
        }
    }

    /// Jours depuis le 1970-01-01, comptés année par année puis mois par mois.
    fn test_day_number((year, month, day): CivilDate) -> i64 {
        let year_days = (1970..year)
            .map(|year| {
                if test_days_in_month(year, 2) == 29 {
                    366
                } else {
                    365
                }
            })
            .sum::<i64>();
        let month_days = (1..month)
            .map(|month| i64::from(test_days_in_month(year, month)))
            .sum::<i64>();
        year_days + month_days + i64::from(day) - 1
    }

    fn legacy_name(token: &str, sequence: u128, nonce: u64) -> String {
        format!("sylloge-films-v1-{token}-{sequence:020}-{nonce:020}.json")
    }

    #[test]
    fn civil_arithmetic_matches_an_independent_calendar() {
        let mut date = (1970, 1, 1);
        for day_number in 0..40_000 {
            assert_eq!(days_from_civil(date.0, date.1, date.2), day_number);
            assert_eq!(civil_from_days(day_number), date);
            date = next_day(date);
        }
        let mut date = (1970, 1, 1);
        for day_number in (-1_000..0).rev() {
            date = previous_day(date);
            assert_eq!(civil_from_days(day_number), date);
            assert_eq!(days_from_civil(date.0, date.1, date.2), day_number);
        }
    }

    #[test]
    fn new_snapshot_names_carry_the_utc_write_minute_profile_token_and_a_nonce() {
        for (sequence, stamp) in [
            (1_792_677_909_123_456_789_u128, "2026-10-22-14h05"),
            (1_709_251_199_999_999_999, "2024-02-29-23h59"),
            (0, "1970-01-01-00h00"),
        ] {
            let file_name = snapshot_file_name("default", sequence);
            let nonce = file_name
                .strip_prefix(&format!("sylloge-sauvegarde-{stamp}-default-"))
                .and_then(|rest| rest.strip_suffix(".json"))
                .unwrap_or_else(|| panic!("nom inattendu : {file_name}"));
            assert_eq!(nonce.len(), 20, "{file_name}");
            assert!(
                nonce.bytes().all(|byte| byte.is_ascii_digit()),
                "{file_name}"
            );
        }

        let first = snapshot_file_name("default", 1_792_677_909_000_000_000);
        let second = snapshot_file_name("default", 1_792_677_909_000_000_000);
        assert_ne!(
            first, second,
            "deux écritures de la même minute restent distinctes"
        );
        // Une horloge qui recule dans la même minute ne doit pas recréer un nom.
        let backwards = (0..50_u128)
            .rev()
            .map(|sequence| snapshot_file_name("default", 1_792_677_900_000_000_000 + sequence))
            .collect::<HashSet<_>>();
        assert_eq!(backwards.len(), 50);
        let encoded = snapshot_file_name("profil é/x", 1_792_677_909_000_000_000);
        assert!(
            encoded.starts_with("sylloge-sauvegarde-2026-10-22-14h05-profil20c3a92fx-"),
            "{encoded}"
        );
        assert_eq!(Path::new(&encoded).file_name().unwrap(), encoded.as_str());
    }

    #[test]
    fn snapshot_ownership_accepts_current_and_legacy_names_only_for_their_profile() {
        // Chaque identifiant est un préfixe du suivant.
        let profiles = ["profil", "profil-2", "profil-00000000000000000001"];
        for owner in profiles {
            let current = snapshot_file_name(owner, 1_792_677_909_000_000_000);
            let legacy = legacy_name(&snapshot_profile_token(owner), 1, 2);
            assert!(is_owned_snapshot_name(&current, owner), "{current}");
            assert!(is_owned_snapshot_name(&legacy, owner), "{legacy}");
            for other in profiles.iter().filter(|other| **other != owner) {
                assert!(
                    !is_owned_snapshot_name(&current, other),
                    "{current} ≠ {other}"
                );
                assert!(
                    !is_owned_snapshot_name(&legacy, other),
                    "{legacy} ≠ {other}"
                );
            }
        }

        let current = snapshot_file_name("profil", 1_792_677_909_000_000_000);
        let nonce = &current[current.len() - 25..current.len() - 5];
        let rejected = [
            String::new(),
            "sylloge-sauvegarde-".to_string(),
            format!("dossier/{current}"),
            format!("../{current}"),
            format!("/{current}"),
            format!("{current}.tmp"),
            format!(".{current}.tmp"),
            format!("{current}~"),
            current.replace(".json", ".JSON"),
            current.replace(".json", ".json.bak"),
            current.replace("-profil-", "-autre-"),
            current.replace(nonce, &nonce[1..]),
            current.replace(nonce, &format!("{nonce}0")),
            current.replace(nonce, &format!("{}x", &nonce[1..])),
            format!("sylloge-sauvegarde-2026-13-22-14h05-profil-{nonce}.json"),
            format!("sylloge-sauvegarde-2026-02-30-14h05-profil-{nonce}.json"),
            format!("sylloge-sauvegarde-2026-10-22-24h05-profil-{nonce}.json"),
            format!("sylloge-sauvegarde-2026-10-22-14h60-profil-{nonce}.json"),
            format!("sylloge-sauvegarde-2026-10-22-14:05-profil-{nonce}.json"),
            format!("sylloge-sauvegarde-2026-10-22-profil-{nonce}.json"),
            format!("sylloge-films-v1-profil-{nonce}.json"),
            format!("sylloge-films-v2-profil-{nonce}-{nonce}.json"),
            format!("sylloge-films-v1-profil-{nonce}-{nonce}-{nonce}.json"),
            format!("Sylloge-films-v1-profil-{nonce}-{nonce}.json"),
        ];
        for file_name in &rejected {
            assert!(!is_owned_snapshot_name(file_name, "profil"), "{file_name}");
            assert!(
                registered_snapshot_path(Path::new("/tmp"), "profil", file_name).is_none(),
                "{file_name}"
            );
        }
    }

    #[test]
    fn written_snapshots_use_the_explicit_name_and_legacy_copies_stay_managed() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_profile(&pool, "second-profile").await;
            let directory = IoTemporaryDirectory(temporary_directory("explicit-name"));
            configure_backup_directory(&pool, "default", &directory.0)
                .await
                .unwrap();
            let directory_path = PathBuf::from(
                read_backup_settings(&pool, "default")
                    .await
                    .unwrap()
                    .unwrap()
                    .backup_directory,
            );
            let token = snapshot_profile_token("default");
            let mut fixtures = Vec::new();
            for (index, created_at) in [
                "2020-01-08T10:00:00.000Z",
                "2020-01-08T11:00:00.000Z",
                "2020-01-08T12:00:00.000Z",
            ]
            .into_iter()
            .enumerate()
            {
                let file_name = snapshot_file_name("default", index as u128 + 1);
                fixtures.push((file_name, created_at));
            }
            let legacy_same_week = legacy_name(&token, 5, 5);
            let legacy_previous_week = legacy_name(&token, 6, 6);
            fixtures.push((legacy_same_week.clone(), "2020-01-08T09:00:00.000Z"));
            fixtures.push((legacy_previous_week.clone(), "2020-01-01T10:00:00.000Z"));
            for (file_name, created_at) in &fixtures {
                fs::write(directory_path.join(file_name), "copie existante").unwrap();
                register_created(&pool, "default", file_name, created_at).await;
            }
            let before = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();

            let AutomaticSnapshotOutcome::Saved(saved) =
                save_automatic_snapshot(&pool, "default", "{\"copie\":1}", "2026-10-22")
                    .await
                    .unwrap()
            else {
                panic!("la copie automatique doit être écrite");
            };

            let after = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            let stamp = saved
                .file_name
                .strip_prefix("sylloge-sauvegarde-")
                .and_then(|rest| rest.get(..16))
                .expect("horodatage explicite");
            let part = |range: std::ops::Range<usize>| stamp[range].parse::<u32>().unwrap();
            let date = (i64::from(part(0..4)), part(5..7), part(8..10));
            let stamp_seconds = test_day_number(date) * 86_400
                + i64::from(part(11..13)) * 3_600
                + i64::from(part(14..16)) * 60;
            assert_eq!(&stamp[10..11], "-");
            assert_eq!(&stamp[13..14], "h");
            assert!(
                (before as i64 - 60..=after as i64).contains(&stamp_seconds),
                "{} doit porter la minute UTC de l’écriture",
                saved.file_name
            );
            assert!(saved.file_name.contains(&format!("-{token}-")));
            assert!(is_owned_snapshot_name(&saved.file_name, "default"));
            assert!(!is_owned_snapshot_name(&saved.file_name, "second-profile"));
            assert_eq!(
                fs::read_to_string(directory_path.join(&saved.file_name)).unwrap(),
                "{\"copie\":1}"
            );

            // Nouvelle copie + deux copies du 2020-01-08 + l’ancienne semaine.
            assert_eq!(saved.retained_snapshot_count, 4);
            let expected = names(&[
                saved.file_name.as_str(),
                fixtures[2].0.as_str(),
                fixtures[1].0.as_str(),
                legacy_previous_week.as_str(),
            ]);
            assert_eq!(registered_names(&pool, "default").await, expected);
            assert!(!directory_path.join(&fixtures[0].0).exists());
            assert!(
                !directory_path.join(&legacy_same_week).exists(),
                "une ancienne copie au nom historique reste nettoyée"
            );
            assert!(
                directory_path.join(&legacy_previous_week).exists(),
                "une ancienne copie au nom historique reste conservée par palier"
            );
        });
    }

    /// Une copie que Sylloge ne saurait pas relire ne doit jamais être écrite,
    /// enregistrée, ni évincer des copies restaurables : l’admission à
    /// l’écriture refuse le document avant tout effet de bord.
    #[test]
    fn oversized_document_is_refused_before_any_write_and_keeps_readable_copies() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let guard = IoTemporaryDirectory(temporary_directory("oversized-admission"));
            let directory = configured_default(&pool, &guard.0).await;
            let mut existing = Vec::new();
            for (index, created_at) in [
                "2026-10-22T08:00:00.000Z",
                "2026-10-22T09:00:00.000Z",
                "2026-10-22T10:00:00.000Z",
            ]
            .into_iter()
            .enumerate()
            {
                let file_name = snapshot_file_name("default", index as u128 + 1);
                fs::write(directory.join(&file_name), format!("{{\"copie\":{index}}}")).unwrap();
                register_created(&pool, "default", &file_name, created_at).await;
                existing.push(file_name);
            }
            // Trois copies lisibles : une quatrième écrite puis conservée
            // évincerait la plus ancienne.
            let before = directory_state(&directory);
            let settings = read_backup_settings(&pool, "default")
                .await
                .unwrap()
                .expect("dossier de sauvegarde configuré");
            let oversized = "x".repeat(MAX_SNAPSHOT_FILE_BYTES as usize + 1);

            let error = write_snapshot_for_settings(&pool, &settings, "default", &oversized)
                .await
                .expect_err("un document trop volumineux doit être refusé");
            assert!(error.contains("dépasse la limite sûre"), "{error}");
            assert_eq!(directory_state(&directory), before, "aucun fichier écrit");
            let expected_names = names(&existing.iter().map(String::as_str).collect::<Vec<_>>());
            assert_eq!(registered_names(&pool, "default").await, expected_names);
            for file_name in &existing {
                assert!(
                    read_registered_backup_snapshot(&pool, "default", file_name)
                        .await
                        .is_ok(),
                    "les copies lisibles restent restaurables"
                );
            }

            let automatic = save_automatic_snapshot(&pool, "default", &oversized, "2026-10-22").await;
            match automatic {
                Err(error) => assert!(error.contains("dépasse la limite sûre"), "{error}"),
                Ok(_) => panic!("la copie automatique doit refuser le document"),
            }
            assert_eq!(
                read_backup_settings(&pool, "default")
                    .await
                    .unwrap()
                    .unwrap()
                    .last_automatic_snapshot_day,
                None,
                "le garde-fou quotidien n’avance pas sans copie écrite"
            );
            assert_eq!(directory_state(&directory), before, "aucun fichier écrit");
        });
    }

    async fn registry_rows(pool: &sqlx::SqlitePool) -> Vec<(String, String, String)> {
        sqlx::query_as(
            "SELECT profile_id, file_name, created_at
             FROM backup_snapshots
             ORDER BY profile_id, file_name",
        )
        .fetch_all(pool)
        .await
        .expect("lecture complète du registre")
    }

    /// Nom, type et contenu de chaque entrée, sans suivre les liens.
    fn directory_state(directory: &Path) -> Vec<(String, String, Vec<u8>)> {
        let mut state = fs::read_dir(directory)
            .expect("lecture du dossier de test")
            .map(|entry| {
                let entry = entry.expect("entrée du dossier de test");
                let path = entry.path();
                let metadata = fs::symlink_metadata(&path).expect("métadonnées de test");
                let name = entry.file_name().to_string_lossy().into_owned();
                if metadata.file_type().is_symlink() {
                    let target = fs::read_link(&path).unwrap().display().to_string();
                    (name, format!("lien:{target}"), Vec::new())
                } else if metadata.is_dir() {
                    (name, "dossier".to_string(), Vec::new())
                } else {
                    (name, "fichier".to_string(), fs::read(&path).unwrap())
                }
            })
            .collect::<Vec<_>>();
        state.sort();
        state
    }

    /// Profil `default` configuré sur un dossier temporaire ; renvoie le
    /// chemin canonique enregistré.
    async fn configured_default(pool: &sqlx::SqlitePool, directory: &Path) -> PathBuf {
        PathBuf::from(
            configure_backup_directory(pool, "default", directory)
                .await
                .expect("réglage de test")
                .backup_directory,
        )
    }

    #[test]
    fn listing_reports_registered_copies_newest_first_without_modifying_anything() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_profile(&pool, "second-profile").await;
            let guard = IoTemporaryDirectory(temporary_directory("list"));
            let directory = configured_default(&pool, &guard.0).await;
            let newest = snapshot_file_name("default", 3);
            let missing = snapshot_file_name("default", 2);
            let older = snapshot_file_name("default", 1);
            let legacy = legacy_name(&snapshot_profile_token("default"), 7, 7);
            let foreign_name = "notes-personnelles.json";
            let owned_directory = snapshot_file_name("default", 4);
            let other_profile = snapshot_file_name("second-profile", 5);
            for file_name in [&newest, &older, &legacy, &other_profile] {
                fs::write(directory.join(file_name), "{}").unwrap();
            }
            fs::write(directory.join(foreign_name), "{}").unwrap();
            fs::create_dir(directory.join(&owned_directory)).unwrap();
            for (file_name, created_at) in [
                (newest.as_str(), "2026-10-22T10:00:00.000Z"),
                (missing.as_str(), "2026-10-21T10:00:00.000Z"),
                (older.as_str(), "2026-10-20T10:00:00.000Z"),
                (legacy.as_str(), "2026-10-19T10:00:00.000Z"),
                (foreign_name, "2026-10-18T10:00:00.000Z"),
                (owned_directory.as_str(), "2026-10-17T10:00:00.000Z"),
            ] {
                register_created(&pool, "default", file_name, created_at).await;
            }
            register_created(
                &pool,
                "second-profile",
                &other_profile,
                "2026-10-23T10:00:00.000Z",
            )
            .await;
            let registry_before = registry_rows(&pool).await;
            let directory_before = directory_state(&directory);

            let entries = list_registered_backup_snapshots(&pool, "default")
                .await
                .expect("liste des copies");

            assert_eq!(
                entries
                    .iter()
                    .map(|entry| (entry.file_name.as_str(), entry.available))
                    .collect::<Vec<_>>(),
                vec![
                    (newest.as_str(), true),
                    (missing.as_str(), false),
                    (older.as_str(), true),
                    (legacy.as_str(), true),
                    (foreign_name, false),
                    (owned_directory.as_str(), false),
                ]
            );
            assert_eq!(
                serde_json::to_value(&entries[0]).unwrap(),
                serde_json::json!({
                    "fileName": newest,
                    "createdAt": "2026-10-22T10:00:00.000Z",
                    "available": true
                })
            );
            assert_eq!(registry_rows(&pool).await, registry_before);
            assert_eq!(directory_state(&directory), directory_before);

            fs::remove_dir_all(&directory).unwrap();
            let unavailable = list_registered_backup_snapshots(&pool, "default")
                .await
                .expect("liste avec un dossier disparu");
            assert_eq!(unavailable.len(), 6);
            assert!(unavailable.iter().all(|entry| !entry.available));
            assert_eq!(registry_rows(&pool).await, registry_before);
        });
    }

    #[test]
    fn listing_is_empty_without_settings_and_refused_for_a_missing_profile() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_profile(&pool, "second-profile").await;
            register_created(
                &pool,
                "second-profile",
                &snapshot_file_name("second-profile", 1),
                "2026-10-22T10:00:00.000Z",
            )
            .await;

            assert_eq!(
                list_registered_backup_snapshots(&pool, "second-profile")
                    .await
                    .unwrap(),
                Vec::new()
            );
            for (profile_id, expected) in [("profil-absent", "introuvable"), ("", "invalide")] {
                let error = list_registered_backup_snapshots(&pool, profile_id)
                    .await
                    .expect_err("profil obligatoire");
                assert!(error.contains(expected), "{error}");
            }
            assert_eq!(registry_rows(&pool).await.len(), 1);
        });
    }

    #[test]
    fn reading_returns_only_a_registered_owned_regular_copy() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            insert_profile(&pool, "second-profile").await;
            let guard = IoTemporaryDirectory(temporary_directory("read"));
            let directory = configured_default(&pool, &guard.0).await;
            let current = snapshot_file_name("default", 1);
            let legacy = legacy_name(&snapshot_profile_token("default"), 2, 2);
            let unregistered = snapshot_file_name("default", 3);
            let other_profile = snapshot_file_name("second-profile", 4);
            let other_token = snapshot_file_name("autre", 5);
            let missing = snapshot_file_name("default", 6);
            let as_directory = snapshot_file_name("default", 7);
            let oversized = snapshot_file_name("default", 8);
            let not_utf8 = snapshot_file_name("default", 9);
            let document = "{\"format\":\"sylloge-library\",\"note\":\"Café\"}";
            for file_name in [
                &current,
                &legacy,
                &unregistered,
                &other_profile,
                &other_token,
            ] {
                fs::write(directory.join(file_name), document).unwrap();
            }
            fs::create_dir(directory.join(&as_directory)).unwrap();
            fs::File::create(directory.join(&oversized))
                .unwrap()
                .set_len(MAX_SNAPSHOT_FILE_BYTES + 1)
                .unwrap();
            fs::write(directory.join(&not_utf8), [0xff, 0xfe]).unwrap();
            for file_name in [
                &current,
                &legacy,
                &other_token,
                &missing,
                &as_directory,
                &oversized,
                &not_utf8,
            ] {
                register_created(&pool, "default", file_name, "2026-10-22T10:00:00.000Z").await;
            }
            for traversal in [format!("../{current}"), format!("sous-dossier/{current}")] {
                register_created(&pool, "default", &traversal, "2026-10-22T10:00:00.000Z").await;
            }
            register_created(
                &pool,
                "second-profile",
                &other_profile,
                "2026-10-22T10:00:00.000Z",
            )
            .await;
            let registry_before = registry_rows(&pool).await;
            let directory_before = directory_state(&directory);

            for file_name in [&current, &legacy] {
                assert_eq!(
                    read_registered_backup_snapshot(&pool, "default", file_name)
                        .await
                        .expect("copie lisible"),
                    document
                );
            }
            let refusals = [
                ("default", unregistered.clone(), "enregistrée"),
                ("default", other_profile.clone(), "enregistrée"),
                ("default", other_token, "correspond"),
                ("default", format!("../{current}"), "correspond"),
                ("default", format!("sous-dossier/{current}"), "correspond"),
                ("default", missing, "introuvable"),
                ("default", as_directory, "fichier ordinaire"),
                ("default", oversized, "64 Mio"),
                ("default", not_utf8, "UTF-8"),
                ("second-profile", other_profile, "Aucun dossier"),
                ("profil-absent", current.clone(), "introuvable"),
                ("", current.clone(), "invalide"),
            ];
            for (profile_id, file_name, expected) in refusals {
                let error = read_registered_backup_snapshot(&pool, profile_id, &file_name)
                    .await
                    .expect_err("lecture refusée");
                assert!(error.contains(expected), "{file_name} : {error}");
            }
            assert_eq!(registry_rows(&pool).await, registry_before);
            assert_eq!(directory_state(&directory), directory_before);
        });
    }

    #[cfg(unix)]
    #[test]
    fn reading_and_listing_never_follow_a_symbolic_link() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let guard = IoTemporaryDirectory(temporary_directory("read-symlink"));
            let outside = IoTemporaryDirectory(temporary_directory("read-symlink-outside"));
            let directory = configured_default(&pool, &guard.0).await;
            let target = outside.0.join("hors-dossier.json");
            fs::write(&target, "{\"secret\":\"hors dossier\"}").unwrap();
            let linked = snapshot_file_name("default", 1);
            std::os::unix::fs::symlink(&target, directory.join(&linked)).unwrap();
            register_created(&pool, "default", &linked, "2026-10-22T10:00:00.000Z").await;
            let registry_before = registry_rows(&pool).await;

            let entries = list_registered_backup_snapshots(&pool, "default")
                .await
                .unwrap();
            let error = read_registered_backup_snapshot(&pool, "default", &linked)
                .await
                .expect_err("un lien symbolique n’est jamais lu");

            assert_eq!(entries.len(), 1);
            assert!(!entries[0].available);
            assert!(error.contains("lien symbolique"), "{error}");
            assert!(fs::symlink_metadata(directory.join(&linked))
                .unwrap()
                .file_type()
                .is_symlink());
            assert_eq!(
                fs::read_to_string(&target).unwrap(),
                "{\"secret\":\"hors dossier\"}"
            );
            assert_eq!(registry_rows(&pool).await, registry_before);
        });
    }

    const SEARCH_EPOCH_SECONDS: u64 = 1_792_600_000;

    /// Fichier de recherche daté de `SEARCH_EPOCH_SECONDS + minutes` minutes.
    fn search_file(path: &Path, contents: &[u8], minutes: u64) -> i64 {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
        let modified =
            UNIX_EPOCH + std::time::Duration::from_secs(SEARCH_EPOCH_SECONDS + minutes * 60);
        fs::File::options()
            .write(true)
            .open(path)
            .unwrap()
            .set_modified(modified)
            .unwrap();
        ((SEARCH_EPOCH_SECONDS + minutes * 60) * 1_000) as i64
    }

    /// Arborescence complète (chemin, type, taille, date), sans suivre de lien.
    fn tree_state(root: &Path) -> Vec<(PathBuf, bool, u64, SystemTime)> {
        let mut state = Vec::new();
        let mut pending = vec![root.to_path_buf()];
        while let Some(directory) = pending.pop() {
            for entry in fs::read_dir(&directory).unwrap() {
                let path = entry.unwrap().path();
                let metadata = fs::symlink_metadata(&path).unwrap();
                if metadata.is_dir() {
                    pending.push(path.clone());
                }
                state.push((
                    path,
                    metadata.is_dir(),
                    metadata.len(),
                    metadata.modified().unwrap(),
                ));
            }
        }
        state.sort();
        state
    }

    fn found_summary(found: &FoundBackups) -> Vec<(&str, &str, i64)> {
        found
            .candidates
            .iter()
            .map(|candidate| {
                (
                    candidate.file_name.as_str(),
                    candidate.location.as_str(),
                    candidate.modified_at,
                )
            })
            .collect()
    }

    #[test]
    fn backup_search_without_any_root_finds_nothing() {
        let home = IoTemporaryDirectory(temporary_directory("search-empty"));
        assert_eq!(find_backup_candidates_in(&home.0), FoundBackups::default());
        fs::create_dir_all(home.0.join("Library/Mobile Documents")).unwrap();
        fs::create_dir_all(home.0.join("Library/CloudStorage")).unwrap();
        assert_eq!(find_backup_candidates_in(&home.0), FoundBackups::default());
        assert_eq!(
            serde_json::to_value(FoundBackups::default()).unwrap(),
            serde_json::json!({ "candidates": [], "unreadableLocations": [] })
        );
    }

    #[test]
    fn backup_search_labels_each_location_and_sorts_newest_first() {
        let home = IoTemporaryDirectory(temporary_directory("search-roots"));
        let root = &home.0;
        let cloud = root.join("Library/CloudStorage");
        let files = [
            (
                root.join("Desktop/SYLLOGE-Bureau.JSON"),
                7,
                "SYLLOGE-Bureau.JSON",
                "Bureau",
            ),
            (
                root.join(
                    "Library/Mobile Documents/com~apple~CloudDocs/Sylloge/sylloge-icloud.json",
                ),
                6,
                "sylloge-icloud.json",
                "iCloud Drive › Sylloge",
            ),
            (
                cloud.join("GoogleDrive-test@example.com/Mon Drive/sylloge-google.json"),
                5,
                "sylloge-google.json",
                "Google Drive › Mon Drive",
            ),
            (
                cloud.join("Dropbox/sylloge-dropbox.json"),
                4,
                "sylloge-dropbox.json",
                "Dropbox",
            ),
            (
                cloud.join("OneDrive-Personnel/Sauvegardes/sylloge-onedrive.json"),
                3,
                "sylloge-onedrive.json",
                "OneDrive › Sauvegardes",
            ),
            (
                cloud.join("Box-Box/sylloge-box.json"),
                2,
                "sylloge-box.json",
                "Box-Box",
            ),
            (
                root.join("Documents/sylloge-documents.json"),
                1,
                "sylloge-documents.json",
                "Documents",
            ),
            (
                root.join("Downloads/Sylloge/Archives/2026/sylloge-profondeur-3.json"),
                0,
                "sylloge-profondeur-3.json",
                "Téléchargements › Sylloge › Archives › 2026",
            ),
        ];
        let mut expected = Vec::new();
        for (path, minutes, file_name, location) in &files {
            let modified_at = search_file(
                path,
                format!("{{\"copie\":\"{file_name}\"}}").as_bytes(),
                *minutes,
            );
            expected.push((*file_name, *location, modified_at));
        }
        let before = tree_state(root);

        let found = find_backup_candidates_in(root);

        assert_eq!(found_summary(&found), expected);
        assert!(found.unreadable_locations.is_empty());
        for candidate in &found.candidates {
            assert_eq!(
                candidate.contents,
                format!("{{\"copie\":\"{}\"}}", candidate.file_name)
            );
        }
        assert_eq!(
            serde_json::to_value(&found.candidates[0]).unwrap(),
            serde_json::json!({
                "fileName": "SYLLOGE-Bureau.JSON",
                "location": "Bureau",
                "modifiedAt": expected[0].2,
                "contents": "{\"copie\":\"SYLLOGE-Bureau.JSON\"}"
            })
        );
        assert_eq!(tree_state(root), before, "la recherche n’écrit rien");
    }

    #[test]
    fn backup_search_skips_deep_hidden_package_and_non_matching_entries() {
        let home = IoTemporaryDirectory(temporary_directory("search-skips"));
        let documents = home.0.join("Documents");
        let kept = search_file(&documents.join("a/b/c/sylloge-niveau-3.json"), b"{}", 1);
        for ignored in [
            "a/b/c/d/sylloge-niveau-4.json",
            ".cache/sylloge-cache.json",
            "Archive.app/sylloge-paquet.json",
            "Photos.photoslibrary/sylloge-photos.json",
            "Sylloge v1.0/sylloge-point.json",
            "backup.json",
            "sylloge-note.txt",
            "syllogefilms.json",
            "copie-sylloge-ancienne.json",
        ] {
            search_file(&documents.join(ignored), b"{}", 2);
        }
        fs::create_dir_all(documents.join("sylloge-dossier.json")).unwrap();
        fs::File::create(documents.join("sylloge-trop-gros.json"))
            .unwrap()
            .set_len(MAX_IMPORT_FILE_BYTES + 1)
            .unwrap();

        let found = find_backup_candidates_in(&home.0);

        assert_eq!(
            found_summary(&found),
            vec![("sylloge-niveau-3.json", "Documents › a › b › c", kept)]
        );
    }

    #[cfg(unix)]
    #[test]
    fn backup_search_never_follows_symbolic_links() {
        use std::os::unix::fs::symlink;

        let home = IoTemporaryDirectory(temporary_directory("search-links"));
        let outside = IoTemporaryDirectory(temporary_directory("search-links-outside"));
        search_file(&outside.0.join("sylloge-hors-dossier.json"), b"{}", 9);
        let documents = home.0.join("Documents");
        let kept = search_file(&documents.join("sylloge-reel.json"), b"{}", 1);
        symlink(&outside.0, documents.join("Lien vers dossier")).unwrap();
        symlink(
            outside.0.join("sylloge-hors-dossier.json"),
            documents.join("sylloge-lien.json"),
        )
        .unwrap();
        symlink(&outside.0, home.0.join("Desktop")).unwrap();

        let found = find_backup_candidates_in(&home.0);

        assert_eq!(
            found_summary(&found),
            vec![("sylloge-reel.json", "Documents", kept)]
        );
        assert!(found.unreadable_locations.is_empty());
    }

    #[test]
    fn backup_search_reads_only_the_twelve_most_recent_eligible_files() {
        let home = IoTemporaryDirectory(temporary_directory("search-twelve"));
        let mut expected = Vec::new();
        for index in 0..14_u64 {
            let file_name = format!("sylloge-{index:02}.json");
            let modified_at = search_file(&home.0.join("Documents").join(&file_name), b"{}", index);
            expected.push((file_name, modified_at));
        }
        let oversized = home.0.join("Documents/sylloge-trop-gros.json");
        fs::File::create(&oversized)
            .unwrap()
            .set_len(MAX_IMPORT_FILE_BYTES + 1)
            .unwrap();
        fs::File::options()
            .write(true)
            .open(&oversized)
            .unwrap()
            .set_modified(UNIX_EPOCH + std::time::Duration::from_secs(SEARCH_EPOCH_SECONDS + 6_000))
            .unwrap();
        expected.reverse();
        expected.truncate(12);

        let found = find_backup_candidates_in(&home.0);

        assert_eq!(
            found
                .candidates
                .iter()
                .map(|candidate| (candidate.file_name.clone(), candidate.modified_at))
                .collect::<Vec<_>>(),
            expected
        );
    }

    #[test]
    fn backup_search_limits_are_the_documented_bounds() {
        assert_eq!(
            BACKUP_SEARCH_LIMITS,
            BackupSearchLimits {
                max_depth: 3,
                max_directories: 3_000,
                max_candidates: 12,
                max_file_bytes: MAX_IMPORT_FILE_BYTES,
                max_total_bytes: 64 * 1024 * 1024,
            }
        );
    }

    #[test]
    fn backup_search_stops_reading_at_the_cumulative_byte_cap() {
        let home = IoTemporaryDirectory(temporary_directory("search-bytes"));
        let documents = home.0.join("Documents");
        let hundred = vec![b'7'; 100];
        let a = search_file(&documents.join("sylloge-a.json"), &hundred, 5);
        let b = search_file(&documents.join("sylloge-b.json"), &hundred, 4);
        search_file(&documents.join("sylloge-c.json"), &hundred, 3);
        let d = search_file(&documents.join("sylloge-d.json"), &[b'7'; 40], 2);
        search_file(&documents.join("sylloge-e.json"), &[b'7'; 101], 6);
        let limits = BackupSearchLimits {
            max_file_bytes: 100,
            max_total_bytes: 250,
            ..BACKUP_SEARCH_LIMITS
        };

        let found = find_backup_candidates_with_limits(&home.0, &limits);

        assert_eq!(
            found_summary(&found),
            vec![
                ("sylloge-a.json", "Documents", a),
                ("sylloge-b.json", "Documents", b),
                ("sylloge-d.json", "Documents", d),
            ]
        );
    }

    #[test]
    fn backup_search_visits_roots_before_their_subfolders_under_the_directory_cap() {
        let home = IoTemporaryDirectory(temporary_directory("search-directories"));
        let documents = search_file(&home.0.join("Documents/sylloge-racine.json"), b"{}", 3);
        search_file(
            &home.0.join("Documents/Sous-dossier/sylloge-sous.json"),
            b"{}",
            4,
        );
        let downloads = search_file(&home.0.join("Downloads/sylloge-telechargee.json"), b"{}", 2);
        let limits = BackupSearchLimits {
            max_directories: 2,
            ..BACKUP_SEARCH_LIMITS
        };

        let found = find_backup_candidates_with_limits(&home.0, &limits);

        assert_eq!(
            found_summary(&found),
            vec![
                ("sylloge-racine.json", "Documents", documents),
                ("sylloge-telechargee.json", "Téléchargements", downloads),
            ]
        );
    }

    #[cfg(unix)]
    struct RestorePermissions(Vec<(PathBuf, fs::Permissions)>);

    #[cfg(unix)]
    impl RestorePermissions {
        fn lock(&mut self, path: &Path) {
            use std::os::unix::fs::PermissionsExt;
            self.0.push((
                path.to_path_buf(),
                fs::metadata(path).unwrap().permissions(),
            ));
            fs::set_permissions(path, fs::Permissions::from_mode(0o000)).unwrap();
        }

        fn restore(&mut self) {
            for (path, permissions) in self.0.drain(..).rev() {
                let _ = fs::set_permissions(&path, permissions);
            }
        }
    }

    #[cfg(unix)]
    impl Drop for RestorePermissions {
        fn drop(&mut self) {
            self.restore();
        }
    }

    #[cfg(unix)]
    #[test]
    fn backup_search_reports_unreadable_roots_and_skips_unreadable_files() {
        let home = IoTemporaryDirectory(temporary_directory("search-unreadable"));
        let mut permissions = RestorePermissions(Vec::new());
        let google = home
            .0
            .join("Library/CloudStorage/GoogleDrive-test@example.com");
        search_file(&google.join("Mon Drive/sylloge-google.json"), b"{}", 8);
        search_file(&home.0.join("Documents/sylloge-documents.json"), b"{}", 7);
        let desktop = home.0.join("Desktop");
        search_file(&desktop.join("sylloge-verrouillee.json"), b"{}", 6);
        search_file(&desktop.join("sylloge-binaire.json"), &[0xff, 0xfe], 5);
        let readable = search_file(&desktop.join("sylloge-lisible.json"), b"{}", 4);
        search_file(&home.0.join("Downloads/Prive/sylloge-prive.json"), b"{}", 3);
        for path in [
            google.clone(),
            home.0.join("Documents"),
            desktop.join("sylloge-verrouillee.json"),
            home.0.join("Downloads/Prive"),
        ] {
            permissions.lock(&path);
        }
        if fs::read_dir(home.0.join("Documents")).is_ok() {
            // Un compte administrateur ignore les permissions : rien à prouver.
            return;
        }

        let found = find_backup_candidates_in(&home.0);
        permissions.restore();

        assert_eq!(
            found_summary(&found),
            vec![("sylloge-lisible.json", "Bureau", readable)]
        );
        assert_eq!(
            found.unreadable_locations,
            vec!["Google Drive".to_string(), "Documents".to_string()]
        );
        assert!(fs::read_dir(home.0.join("Documents")).is_ok());
        assert!(fs::read(desktop.join("sylloge-verrouillee.json")).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn backup_search_reports_an_unreadable_cloud_storage_folder() {
        let home = IoTemporaryDirectory(temporary_directory("search-cloud-locked"));
        let mut permissions = RestorePermissions(Vec::new());
        let cloud = home.0.join("Library/CloudStorage");
        search_file(&cloud.join("Dropbox/sylloge-dropbox.json"), b"{}", 2);
        let documents = search_file(&home.0.join("Documents/sylloge-documents.json"), b"{}", 1);
        permissions.lock(&cloud);
        if fs::read_dir(&cloud).is_ok() {
            return;
        }

        let found = find_backup_candidates_in(&home.0);
        permissions.restore();

        assert_eq!(
            found_summary(&found),
            vec![("sylloge-documents.json", "Documents", documents)]
        );
        assert_eq!(
            found.unreadable_locations,
            vec!["Stockage en ligne".to_string()]
        );
        assert!(fs::read_dir(&cloud).is_ok());
    }
}
