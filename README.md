# Sylloge

Sylloge est une bibliothèque culturelle personnelle, locale et durable. La première version couvre les Films. SQLite est la source de vérité : aucun compte, API ou accès réseau n’est nécessaire pour créer, consulter ou modifier une fiche.

## Structure

- src/domain : modèle Film, validation et format JSON versionné.
- src/data : accès SQLite et pont vers les commandes Tauri.
- src/components : fiche, formulaire, affiche et portabilité.
- src-tauri : application Rust, migrations SQLite et dialogues natifs.
- DESIGN.md : direction visuelle validée.
- docs : feuille de route et mode de travail versionnés.

## Lancer

Prérequis : Node.js avec npm, Rust avec Cargo et les Xcode Command Line Tools.

~~~bash
npm install
npm run tauri:dev
~~~

Pour créer un bundle macOS local non publiable :

~~~bash
npm run tauri:build -- --no-sign
open src-tauri/target/release/bundle/macos/Sylloge.app
~~~

Pour un bundle signé distribuable et la publication GitHub, suivre `docs/TAURI_UPDATER_SETUP.md`. Le build release produit un DMG pour l’installation initiale et une archive `.app.tar.gz` signée pour l’updater.

## Données et sauvegarde

Les données macOS sont dans ~/Library/Application Support/com.aurelientrouble.sylloge/. La base est sylloge.db, accompagnée si nécessaire de sylloge.db-wal et sylloge.db-shm. Ne pas les copier pendant que l’application est ouverte.

Dans Paramètres, l’export JSON `sylloge-films` v1 reste lisible et ne contient ni secret ni image. Un export CSV Films v1 UTF-8 est aussi disponible pour le profil courant ; son contrat, ses champs et ses règles de compatibilité sont dans [docs/CONTRAT_CSV_FILMS_V1.md](docs/CONTRAT_CSV_FILMS_V1.md). Le même CSV Sylloge v1 peut être réimporté exactement. Un CSV générique ou un export ZIP Notion est d’abord lu localement, prévisualisé avec un mapping modifiable, puis validé avant création explicite d’un nouveau profil. Ces imports externes ne récupèrent que le suivi personnel : titre, statut, évaluation, date de visionnage, note personnelle et coup de cœur. Les métadonnées éditoriales, ainsi que cinéma et revisionnage, restent hors import et seront complétés plus tard. L’archive Notion est lue uniquement en mémoire avec des limites de taille, de profondeur et de nombre d’entrées. Les imports JSON, CSV et Notion créent toujours un nouveau profil : le profil existant n’est jamais écrasé ni fusionné. Un dossier de sauvegarde explicite peut aussi créer des snapshots JSON atomiques après le premier changement du jour par profil ou à la demande ; seuls les 30 snapshots enregistrés par Sylloge les plus récents sont conservés. Ne jamais copier la SQLite active, son WAL ou son SHM pendant que l’application est ouverte.

## Vérifier

~~~bash
npm run typecheck
npm run verify
npm run build
cd src-tauri && cargo fmt --check && cargo check && cargo test && cargo clippy --all-targets -- -D warnings
~~~

## Périmètre actuel

Films uniquement : saisie manuelle, recherche, filtres, favoris, notes, profils locaux, import/export JSON, sauvegardes portables, Accueil éditorial et Paramètres. La release macOS `0.3.0` est publiée et signée ; la première preuve complète de mise à jour nécessitera encore l’installation de la prochaine release signée depuis une installation `0.3.0`. Les Séries, Livres, Jeux, Art et la synchronisation restent des évolutions futures.
