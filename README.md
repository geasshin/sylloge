# Sylloge

Sylloge est une application de bibliothèque culturelle personnelle, conçue pour un usage local sur macOS et Windows. Sept bibliothèques : Films, Séries, Animation japonaise, Livres, Mangas, Jeux et Art. Une seule base `sylloge.db`, une table par bibliothèque. Aucune bibliothèque n’emprunte la table d’une autre.

L’interface existe en français et en anglais : la langue est détectée au premier lancement, puis se choisit dans Paramètres › Général et reste mémorisée sur l’appareil. Les titres, avis, notes et citations ne sont jamais traduits. Fonctionnement et contrôles : [docs/I18N.md](docs/I18N.md).

## État du projet

Une release se lance à la main depuis l’onglet Actions ; le numéro des manifestes source reste `0.6.0`, la CI applique le numéro au moment de construire. La dernière version publiée est visible sur la page des releases. Le projet est gratuit et open source sous licence MIT.

Les décisions et l’ordre des prochains lots figurent dans [la feuille de route](docs/ROADMAP.md). Les faits de l’audit et ses limites sont dans [l’état de base](docs/ETAT_DE_BASE.md).

## Publication

Une release lancée à la main construit macOS **et** Windows puis publie une GitHub Release : DMG, archive `.app.tar.gz` signée, installeur NSIS signé, et un manifeste d’updater qui publie les trois cibles (darwin arm64 et Intel, Windows x64). Une seule release : si une plateforme ne construit pas, rien n’est publié. L’application installée propose ensuite cette version. Un push sur `main` ne publie donc rien : la mise en production reste un geste explicite. Les branches de travail ne publient rien. Le dépôt est public depuis le 21 octobre 2026 : l’application lit `releases/latest/download/latest.json` sans authentification, donc sans clé ni jeton à saisir. Les artefacts sont vérifiés par la signature de la clé du projet : remplacer le manifeste ne suffit pas à installer une archive non signée.

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

Un clone propre se lance et se construit sans aucune clé : TMDB et IGDB passent par le proxy du projet, qui détient les secrets dans l’environnement Vercel. Aucun fichier de secret n’est requis, ni pour le développement, ni pour un build. Les métadonnées restent facultatives dans l’application, et une clé compromise se remplace dans Vercel sans republier de version.

## Importer et exporter

Une sauvegarde Sylloge est un fichier JSON unique du profil entier : sept bibliothèques de base et bibliothèques personnalisées ajoutées (format `sylloge-library` version 4 ; les versions 1 à 3 restent lisibles). Paramètres > Importer et exporter la crée et la restaure ; le premier lancement propose la même restauration, ainsi que le choix du dossier des futures sauvegardes : un dossier local, ou iCloud Drive ou Google Drive lorsque ce dossier est présent sur l’ordinateur.

Depuis chaque bibliothèque, **Importer** propose les guides d’export, l’analyse locale et un aperçu, puis une fusion ou un remplacement explicitement confirmé. Le JSON Sylloge et le CSV de chaque bibliothèque restent reconnus. Les adaptateurs Letterboxd (CSV/ZIP complet) et Goodreads (CSV, Livres uniquement) exposent les champs repris et exclus ; Notion et les CSV externes disposent de correspondances vérifiables. Un même titre peut être conservé dans deux fiches distinctes.

**Exporter** permet de choisir la bibliothèque ouverte (JSON ou CSV) ou les sept bibliothèques du profil (JSON). Privilégier le JSON pour une copie fidèle : le CSV v1 ne contient pas les champs libres d’Art ni les identifiants et dates des citations. Les caches des fournisseurs, réglages et vues enregistrées restent hors de ce format de données personnelles.

Les limites des formats tiers sont visibles dans les guides : MyAnimeList XML/gzip n’est pas directement importable, et aucun nouvel export TV Time ou BetaSeries n’est garanti. Aucun compte tiers ni identifiant n’est connecté dans Sylloge.

- [Formats tiers et règles de conversion](docs/IMPORTS_TIERS_MOTEUR.md)
- [Sources et vérification des tutoriels](docs/IMPORT_GUIDES_SOURCES.md)
- [Recette import/export et limites de preuve](docs/QA_IMPORT_EXPORT.md)

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
