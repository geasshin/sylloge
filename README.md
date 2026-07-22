# Sylloge

Sylloge est une bibliothèque culturelle personnelle, locale et durable. La release publique `0.4.0` couvre les Films ; le train de développement `0.5.0` ajoute progressivement Séries, Livres, Jeux et Art. SQLite est la source de vérité : aucun compte, API ou accès réseau n’est nécessaire pour créer, consulter ou modifier une fiche. L'enrichissement TMDB, facultatif, est le seul appel réseau de métadonnées ; il ne sert qu'à préremplir une fiche Film après choix explicite de la personne.

## Structure

- src/domain : modèles culturels, validation et formats JSON versionnés.
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

Le format global `sylloge-library` v2 contient les cinq collections d’un profil et reste compatible avec les exports Films `sylloge-films` v1 historiques. Depuis la bibliothèque Films, un assistant unique accepte JSON, CSV UTF-8 et export Notion ZIP contenant la table CSV et les pages Markdown ; il explique les formats avant d’ouvrir le sélecteur, prévisualise et mappe les données, puis demande explicitement de Remplacer ou Fusionner la collection du profil courant. La fusion détecte les doublons au titre normalisé et préserve les données personnelles de l’existant. Les bibliothèques Séries et Livres acceptent le JSON Sylloge v2 ; pour les Livres, les citations sont exportées, importées et sauvegardées avec leur fiche dans une transaction atomique. Aucun mapping CSV/Notion Série ou Livre n’est inventé sans contrat dédié. La restauration globale v1/v2 est réservée au profil courant vide et ne crée aucun profil. L’archive Notion est lue uniquement en mémoire avec des limites de taille, de profondeur et de nombre d’entrées. Un dossier de sauvegarde explicite peut créer des snapshots JSON v2 atomiques après le premier changement du jour par profil ou à la demande ; seuls les 30 snapshots enregistrés par Sylloge les plus récents sont conservés. Ne jamais copier la SQLite active, son WAL ou son SHM pendant que l’application est ouverte. Les détails Films restent définis par le [contrat de compatibilité Films v1](docs/CONTRAT_FILMS_V1.md) et le [contrat CSV Films v1](docs/CONTRAT_CSV_FILMS_V1.md).

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

La release publique `0.4.0` livre Films, les imports/exports et l’enrichissement TMDB. Sur la branche du train `0.5.0`, Séries et Livres sont utilisables de bout en bout : saisie, fiche, recherche, vues filtrées et portabilité JSON dédiée ; Livres conserve aussi le suivi des tomes Manga/Comics et les citations personnelles. Jeux et Art disposent chacun de leur collection, de la saisie, de la fiche et du CRUD local. Jeux conserve une plateforme libre assistée par des suggestions et n’introduit aucun tracker ; Art n’a pas de note et garde lieu et exposition en textes libres facultatifs. Leur recherche, leurs filtres et leur portabilité dédiée arrivent avec la cohérence multi-médiums du jalon `0.4.9`. Les fondations SQLite/JSON des cinq médiums sont en place, avec profils, snapshots et portabilité multi-médiums. La synchronisation reste explicitement hors V1.
