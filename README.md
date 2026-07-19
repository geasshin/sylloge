# Sylloge

Sylloge est une bibliothèque culturelle personnelle, locale et durable. La première version couvre les Films. SQLite est la source de vérité : aucun compte, API ou accès réseau n’est nécessaire pour créer, consulter ou modifier une fiche. L'enrichissement TMDB, facultatif, est le seul appel réseau de métadonnées ; il ne sert qu'à préremplir une fiche après choix explicite de la personne.

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

Dans Paramètres, l’export JSON `sylloge-films` v1 reste lisible et ne contient ni secret ni image. Le [contrat de compatibilité Films v1](docs/CONTRAT_FILMS_V1.md) décide les données conservées, transformées ou ignorées par JSON, CSV Sylloge, CSV générique et Notion. Un export CSV Films v1 UTF-8 est aussi disponible pour le profil courant ; son contrat de structure est dans [docs/CONTRAT_CSV_FILMS_V1.md](docs/CONTRAT_CSV_FILMS_V1.md). Le même CSV Sylloge v1 peut être réimporté exactement, à la canonisation non destructive documentée près pour les exports historiques. Un CSV générique ou un export ZIP Notion est d’abord lu localement, prévisualisé avec un mapping modifiable, puis validé avant création explicite d’un nouveau profil. Ces imports externes ne récupèrent que le suivi personnel : titre, statut, évaluation, date de visionnage, note personnelle et coup de cœur. Les métadonnées éditoriales, ainsi que cinéma et revisionnage, restent hors import et seront complétés plus tard. L’archive Notion est lue uniquement en mémoire avec des limites de taille, de profondeur et de nombre d’entrées. Les imports JSON, CSV et Notion créent toujours un nouveau profil : le profil existant n’est jamais écrasé ni fusionné. Un dossier de sauvegarde explicite peut aussi créer des snapshots JSON atomiques après le premier changement du jour par profil ou à la demande ; seuls les 30 snapshots enregistrés par Sylloge les plus récents sont conservés. Ne jamais copier la SQLite active, son WAL ou son SHM pendant que l’application est ouverte.

### Confidentialité et provenance des métadonnées

L'enrichissement TMDB est entièrement facultatif : la création, la consultation et la modification d'une fiche restent intégralement possibles hors ligne. Quand la personne l'utilise, Sylloge contacte l'API TMDB depuis le backend Rust pour rechercher une œuvre, puis préremplit la fiche seulement après un choix explicite et modifiable. La clé API est embarquée dans le binaire par le développeur (fichier ignoré par Git, obfusqué) ; elle n'apparaît ni dans le dépôt, ni dans l'interface, ni dans les exports, snapshots ou journaux. Ce modèle vaut pour un usage gratuit et non commercial, diffusé à des personnes de confiance.

Les données reçues de TMDB vivent dans une table de cache séparée (`film_tmdb_cache`), renouvelable pendant 80 jours puis expirant à 180 jours au plus tard, avec purge et renouvellement automatiques au démarrage. Ce cache — identifiant TMDB, résumé, crédits, adresses d'affiches et affiche choisie — n'est **jamais** inclus dans les exports JSON/CSV ni dans les snapshots : seules les données personnelles de la bibliothèque y figurent. Aucune image TMDB n'est téléchargée dans les données locales. L'attribution TMDB est affichée dans « À propos », dans les réglages et à proximité de la présentation enrichie d'une fiche. À l'expiration ou en l'absence de réseau, la fiche personnelle reste intacte avec son fallback neutre.

## Vérifier

~~~bash
npm run typecheck
npm run verify
npm run build
cd src-tauri && cargo fmt --check && cargo check && cargo test && cargo clippy --all-targets -- -D warnings
~~~

## Périmètre actuel

Films uniquement : saisie manuelle, recherche, filtres, favoris, notes, profils locaux, import/export JSON, sauvegardes portables, Accueil éditorial et Paramètres. La release macOS `0.3.0` est publiée et signée ; la première preuve complète de mise à jour nécessitera encore l’installation de la prochaine release signée depuis une installation `0.3.0`. Les Séries, Livres, Jeux, Art et la synchronisation restent des évolutions futures.
