# Sylloge

Sylloge est une application de bibliothèque culturelle personnelle, conçue pour un usage local sur Mac. Le périmètre retenu comprend cinq bibliothèques : Films, Séries, Livres, Jeux et Art.

## État du projet

La base de reprise est la branche main au commit 0854e2a. Le tag publié v0.6.0 précède ce commit et le numéro affiché dans les manifestes est encore 0.6.0. L’application installée affiche aussi 0.6.0, mais son commit exact n’est pas connu. Pour la reprise, l’application installée est considérée comme la même étape générale du projet que main, sans affirmer une identité exacte des binaires.

Les décisions et l’ordre des prochains lots figurent dans [la feuille de route](docs/ROADMAP.md). Les faits de l’audit et ses limites sont dans [l’état de base](docs/ETAT_DE_BASE.md).

## Technologies

- Interface : React, TypeScript et Vite.
- Application de bureau : Tauri et Rust.
- Données personnelles : SQLite locale.
- Aide facultative aux métadonnées : TMDB pour Films et Séries, Open Library pour Livres, IGDB pour Jeux. Les bibliothèques restent utilisables sans ces services.

## Lancer le projet

Prérequis : Node.js avec npm, Rust avec Cargo et les outils de ligne de commande Xcode.

```bash
npm ci
npm run tauri:dev
```

Les modules Rust contenant les secrets de fournisseur sont ignorés par Git et ne sont pas inclus dans un clone. Le lancement natif et certaines validations ne passent pas tant qu’ils ne sont pas générés, même si l’usage des métadonnées reste facultatif dans l’application. Suivre les exemples du [générateur de modules locaux](scripts/generate_embedded_key.py) avec les secrets déjà conservés dans des fichiers locaux protégés. Ne jamais ajouter de clé réelle au dépôt ni la coller dans une commande ou dans le chat. L’audit de reprise a utilisé uniquement des valeurs factices temporaires.

## Contrôles du projet

```bash
npm run typecheck
npm run verify
npm run build
cd src-tauri
cargo fmt --check
cargo check
cargo test
cargo clippy --all-targets -- -D warnings
```

Voir [l’état de base](docs/ETAT_DE_BASE.md) pour savoir lesquels passent sur ce clone et dans quelles conditions.

## Données locales

La base personnelle est stockée par Tauri dans le dossier de données de l’application. Ne pas copier ni modifier cette base, ou ses fichiers SQLite -wal et -shm, pendant que Sylloge est ouvert. Les contrôles et essais doivent utiliser un profil temporaire isolé.
