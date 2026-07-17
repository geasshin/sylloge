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

Pour créer le bundle macOS release :

~~~bash
npm run tauri:build
open src-tauri/target/release/bundle/macos/Sylloge.app
~~~

## Données et sauvegarde

Les données macOS sont dans ~/Library/Application Support/com.aurelientrouble.sylloge/. La base est sylloge.db, accompagnée si nécessaire de sylloge.db-wal et sylloge.db-shm. Ne pas les copier pendant que l’application est ouverte.

Dans l’écran « Profils et JSON » actuel, l’export `sylloge-films` v1 reste lisible et ne contient ni secret ni image. Un import est d’abord validé, puis crée toujours un nouveau profil : le profil existant n’est jamais écrasé. Un dossier de sauvegarde explicite peut aussi créer des snapshots JSON atomiques après le premier changement du jour par profil ou à la demande ; seuls les 30 snapshots enregistrés par Sylloge les plus récents sont conservés. Ne jamais copier la SQLite active, son WAL ou son SHM pendant que l’application est ouverte.

## Vérifier

~~~bash
npm run typecheck
npm run verify
npm run build
cd src-tauri && cargo fmt --check && cargo check && cargo test && cargo clippy --all-targets -- -D warnings
~~~

## Périmètre actuel

Films uniquement : saisie manuelle, recherche, filtres, favoris, notes, profils locaux, import/export JSON et sauvegardes portables. Les Séries, Livres, Jeux, Art, la synchronisation et la distribution signée avec mise à jour intégrée restent des évolutions futures.
