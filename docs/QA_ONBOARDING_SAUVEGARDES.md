# Recette : onboarding et sauvegardes (22 octobre 2026)

**État : implémenté localement, non committé, non publié.** Aucune release, aucun push. Aucune donnée personnelle n’a été ouverte, copiée ou restaurée : les essais utilisent `qa-app.html` (SQLite en mémoire, fixtures synthétiques), des dossiers temporaires et des tests unitaires.

## Périmètre livré

- **Premier lancement** : profil, puis trois départs explicites :
  - commencer à vide ;
  - restaurer Sylloge depuis un fichier JSON ou depuis un dossier de copies ;
  - importer depuis un autre service, avec les guides, aperçus et adaptateurs existants.
- **Copies valides** : listées avec date, profil et nombre de fiches. Aucune copie n’est sélectionnée d’office, même la plus récente.
- **Dossier des futures sauvegardes** : local, iCloud Drive ou Google Drive si le dossier est présent et inscriptible sur le Mac.
  - Le choix ne persiste rien avant la création du profil.
  - La première copie est créée seulement après la fin de la création et de l’import.
  - Si cette copie échoue, le profil reste conservé et « Réessayer la sauvegarde » ne recrée ni ne réimporte rien.
  - Démarrer sans sauvegarde automatique exige une case cochée explicitement.
- **Réglages** : « Sauvegarder Sylloge » exporte le profil entier ; « Restaurer une sauvegarde » utilise le même sélecteur que l’onboarding, avec un aperçu des sept bibliothèques et une confirmation explicite.
- **Libellés** : « snapshot » devient « copie JSON » dans les messages visibles ; « cinq collections » a disparu des textes utilisateur.

## Fichiers principaux

- Interface : `src/components/Onboarding.tsx`, `BackupRestorePicker.tsx`, `RestoreProfileButton.tsx`, `Portability.tsx`, `main.tsx`, `src/styles.css`.
- Domaine et données : `src/domain/backupRestore.ts`, `src/domain/onboarding.ts`, `src/data/backupDestination.ts`, `src/data/backupService.ts`.
- Rust : `src-tauri/src/portability.rs` (`pick_backup_destination`, `configure_backup_destination`), `src-tauri/src/backup_destination_tests.rs`, `src-tauri/src/lib.rs`.
- Contrôles : `scripts/backup-service.test.mjs`, `scripts/backup-restore.test.mjs`, `scripts/onboarding.test.mjs` (dans `npm run test:portability`), et les scripts navigateur `scripts/qa-onboarding-flows.js`, `scripts/qa-profile-restoration.js`, `scripts/qa-onboarding-visual.js`.

## Vérifications exécutées

| Contrôle | Résultat observé |
|---|---|
| `npm run typecheck` | réussi |
| `npm run verify` (inclut `test:portability`) | réussi ; 92 tests de portabilité |
| `backup-service.test.mjs` | 29 / 29 |
| `backup-restore.test.mjs` | 3 / 3 |
| `onboarding.test.mjs` | 3 / 3 |
| `npm run build` | réussi (avertissement de taille de fichier déjà connu) |
| `cargo fmt --check`, `rustfmt --check` (tests dédiés) | réussi |
| `cargo check` | réussi |
| `cargo test --lib` | 106 / 106, dont 9 tests `backup_destination` |
| `cargo clippy --all-targets -- -D warnings` | réussi |
| Suites navigateur sur `qa-app.html` (8 scripts) | 186 assertions réussies, aucune exception JavaScript |
| Captures onboarding et réglages | 20 captures : clair et sombre, 1440×900 et 1000×760 |

Contrôles automatiques sur les captures : thème réel vérifié, aucun débordement horizontal, bouton principal entièrement visible.

Captures inspectées visuellement : « Protéger le profil » (sombre, 1440), « Importer d’un autre service » (clair, 1000), « Démarrer la bibliothèque » (clair, 1440), réglages « Importer et exporter » (sombre, 1440). Les captures sont conservées hors dépôt, dans `~/Documents/ChatGPT/sylloge-recette/2026-10-22-onboarding-sauvegardes/`.

Note de méthode : une capture prise pendant la transition de couleur (120 ms) montre un bouton désactivé dans sa couleur d’origine. L’état désactivé a été vérifié après 600 ms.

## Non vérifié

- Sélecteurs natifs macOS pour fichier et dossier, comportement réel d’iCloud Drive et de Google Drive : non exercés. Les tests passent par un pont simulé et des dossiers temporaires.
- Application native (`tauri dev`) : non lancée. Une recette native sur les données réelles est interdite par `AGENTS.md`. Une recette sur un profil synthétique reste à décider.
- Windows : hors cible actuelle.

## Décisions à valider

1. Choisir un dossier dans les réglages n’écrit pas de copie. La première copie se crée avec « Sauvegarder maintenant » ou à la prochaine modification.
2. Démarrer sans sauvegarde automatique reste possible, mais doit être choisi explicitement.
3. Restaurer dans un profil existant n’est autorisé que si ce profil est vide. Sinon, la restauration crée un nouveau profil.
4. Conservation : 3 copies récentes, puis une par semaine sur 4 semaines et une par mois sur 6 mois (13 fichiers au plus). À la première copie après mise à jour, les anciennes copies au-delà de ces paliers sont supprimées (par exemple 30 copies quotidiennes deviennent 7).
5. Restauration depuis une base `.db` : non implémentée, hors parcours standard.

## Limites connues

- Le JSON couvre les sept bibliothèques du profil. Les réglages, vues enregistrées, caches et profils non concernés ne sont pas inclus.
- Les nouvelles copies se nomment `sylloge-sauvegarde-AAAA-MM-JJ-HHhMM-…json` (heure UTC). Les anciennes `sylloge-films-v1-…` restent reconnues et gérées ; le contenu versionné détermine le format.
- Le CSV reste un export par bibliothèque et ne remplace pas la sauvegarde JSON.

## Lot suivant (22 octobre 2026) : sauvegardes et Paramètres

**État : implémenté localement, non committé, non publié.**

- **Conservation par paliers** dans le moteur natif (`RECENT_BACKUP_COPIES`, `WEEKLY_BACKUP_ARCHIVES`, `MONTHLY_BACKUP_ARCHIVES`). Une date de registre illisible conserve la copie.
- **Noms explicites** `sylloge-sauvegarde-…` pour les copies et `sylloge-sauvegarde-AAAA-MM-JJ.json` pour l’export manuel du profil.
- **Copies du profil** : liste et restauration d’une copie depuis Paramètres › Sauvegarde. Lecture limitée aux copies enregistrées du profil, dans son dossier, sans lien symbolique.
- **Recherche sur le Mac** : fichiers `sylloge-*.json` dans iCloud Drive, `~/Library/CloudStorage` (Google Drive, Dropbox, OneDrive), Documents, Bureau et Téléchargements. Profondeur 3, 3 000 dossiers, 12 fichiers lus au plus, 64 Mio en tout. La plus récente selon la date interne est proposée, jamais sélectionnée d’office ; les emplacements refusés par macOS sont signalés. Au premier lancement, la recherche démarre quand on choisit « Restaurer Sylloge ».
- **Paramètres recomposés** : Profils, Sauvegarde, Importer et exporter, Général, À propos ; groupes et rangées libellé / commande. Nouvelle option : défilement automatique de « À la une » (préférence de l’appareil). Ancien code mort de `Portability.tsx` retiré (assistants d’import/export inutilisés depuis le bloc 2).
- **Correctif hors lot** : supprimer un profil contenant de l’animation ou des mangas échouait (`FOREIGN KEY constraint failed`) depuis la séparation des tables ; la suppression et les compteurs de profils couvrent désormais les sept bibliothèques. Ce défaut existe dans la version installée.

Vérifications : typecheck, `npm run verify` (92 tests de portabilité), build ; Rust `fmt`, `check`, 132 tests, `clippy -D warnings` ; navigateur : `scripts/qa-settings.js` (36 assertions) et les huit suites précédentes, 222 assertions au total, sans exception JavaScript. Captures Paramètres clair/sombre, 1440 et 1000 px, dans le dossier de recette hors dépôt.

Non vérifié : invites macOS d’accès aux dossiers, fichiers iCloud non téléchargés localement, application native.

## Copie avant migration (22 octobre 2026)

**État : implémenté localement, non publié.** Critère du bloc 3 : « sauvegarder automatiquement avant toute migration de schéma ».

- Greffon `src-tauri/src/migration_backup.rs`, enregistré juste avant `tauri_plugin_sql`. Tauri initialise les greffons dans leur ordre d’enregistrement ; le greffon SQL applique les migrations à son initialisation.
- Si la base existe et que sa version (`_sqlx_migrations`) est inférieure à la dernière migration embarquée : `VACUUM INTO` vers `<dossier de l’application>/sauvegardes-avant-migration/sylloge-avant-migration-vA-vers-vB-<date UTC>.db`, contrôle `integrity_check`, conservation des 3 plus récentes. La base source n’est jamais modifiée.
- Premier lancement, base non gérée par Sylloge ou schéma à jour : aucune copie.
- En cas d’échec de la copie, la migration suit et l’erreur est journalisée. Bloquer la migration empêcherait l’application de démarrer.
- Copie interne de secours, sans parcours de restauration dans l’interface ; la sauvegarde ordinaire reste le JSON.

Tests : 4 tests Rust (copie d’une base en retard avec des lignes encore dans le WAL, base source intacte ; aucun effet si absente, non gérée ou à jour ; conservation des 3 dernières sans toucher aux autres fichiers ; version cible). Garde `verify.mjs` sur l’ordre des greffons. Lancement natif réel non exercé.
