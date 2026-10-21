# Sylloge

Sylloge est une application de bibliothèque culturelle personnelle, conçue pour un usage local sur macOS et Windows. Sept bibliothèques : Films, Séries, Animation japonaise, Livres, Mangas, Jeux et Art. Une seule base `sylloge.db`, une table par bibliothèque. Aucune bibliothèque n’emprunte la table d’une autre.

## État du projet

Chaque push sur `main` publie une version corrective ; le numéro des manifestes source reste `0.6.0`, la CI applique le numéro au moment de construire. La dernière version publiée est visible sur la page des releases. Le projet est gratuit et open source sous licence MIT.

Les décisions et l’ordre des prochains lots figurent dans [la feuille de route](docs/ROADMAP.md). Les faits de l’audit et ses limites sont dans [l’état de base](docs/ETAT_DE_BASE.md).

## Publication

Chaque push sur `main` déclenche le build macOS et la publication automatique d’une GitHub Release : DMG, archive `.app.tar.gz` signée, signature et manifeste de l’updater. L’application installée propose ensuite cette version. Un push sur `main` est donc une mise en production. Les branches de travail ne publient rien. Le dépôt est public depuis le 21 octobre 2026 : la mise à jour automatique sans jeton GitHub est le prochain lot, en attendant l’application accepte encore un jeton dans ses réglages. Les artefacts sont vérifiés par la signature de la clé du projet : remplacer le manifeste ne suffit pas à installer une archive non signée.

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

## Licence

MIT, voir [LICENSE](LICENSE). Les noms et logos des services cités appartiennent à leurs éditeurs. Les métadonnées proviennent de TMDB, Open Library et IGDB ; la mention TMDB obligatoire pour un usage public est à rétablir dans l’application et sur le site avant une diffusion large.

## Données locales

La base personnelle est stockée par Tauri dans le dossier de données de l’application. Ne pas copier ni modifier cette base, ou ses fichiers SQLite -wal et -shm, pendant que Sylloge est ouvert. Les contrôles et essais doivent utiliser un profil temporaire isolé.
