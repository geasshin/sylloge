# Sylloge

Sylloge est une bibliothèque culturelle personnelle, locale et durable. La release publique `0.5.0` couvre Films, Séries, Livres, Jeux et Art. SQLite est la source de vérité : aucun compte, API ou accès réseau n’est nécessaire pour créer, consulter ou modifier une fiche. L'enrichissement des métadonnées (TMDB, Open Library, RAWG), facultatif, est le seul appel réseau ; il ne sert qu'à préremplir une fiche après choix explicite de la personne.

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

Le format global `sylloge-library` v2 contient les cinq collections d’un profil et reste compatible avec les exports Films `sylloge-films` v1 historiques. Chaque bibliothèque et les Paramètres proposent désormais l’export JSON et l’export CSV de sa collection. Le CSV est un tableau lisible et versionné, adapté à un seul médium ; le JSON reste le format de restauration fidèle des cinq collections. Les [contrats CSV Films v1](docs/CONTRAT_CSV_FILMS_V1.md) et [Collections v1](docs/CONTRAT_CSV_COLLECTIONS_V1.md) fixent les colonnes et l’échappement. Les citations de Livres sont conservées dans une cellule JSON ordonnée ; leurs identifiants techniques et horodatages ne font pas partie du CSV. Chaque bibliothèque accepte un JSON Sylloge, un CSV UTF-8, un ZIP ou un dossier local contenant des JSON/CSV. Le conteneur est inspecté en mémoire, avec les limites documentées de taille, profondeur et volume, puis présente les chemins relatifs des candidats : un candidat unique part vers l’aperçu existant et plusieurs demandent un choix explicite. La fusion détecte les doublons au titre normalisé et préserve les données personnelles de l’existant. Un CSV Sylloge v1 est reconnu ; un tableau externe passe par un mapping explicite, et tout défaut bloque l’écriture avant les choix Remplacer ou Fusionner. Les pages Markdown restent réservées à l’association déterministe des notes longues du flux Films historique. La restauration globale v1/v2 est réservée au profil courant vide et ne crée aucun profil ; elle constitue l’unique parcours multi-collections, les imports partiels restant propres à chaque bibliothèque. Un dossier de sauvegarde explicite peut créer des snapshots JSON v2 atomiques après le premier changement du jour par profil ou à la demande ; seuls les 30 snapshots enregistrés par Sylloge les plus récents sont conservés. Le réglage peut être oublié sans supprimer les fichiers déjà créés ; un dossier effacé ou devenu inaccessible est signalé comme tel. Ne jamais copier la SQLite active, son WAL ou son SHM pendant que l’application est ouverte. Les détails Films restent définis par le [contrat de compatibilité Films v1](docs/CONTRAT_FILMS_V1.md).

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

La release publique `0.5.0` livre les cinq médiums de bout en bout : saisie et création assistée (TMDB pour Films et Séries, Open Library pour Livres, RAWG pour Jeux), fiche, recherche, vues unifiées (présets filtres + tri, vues enregistrées), filtres et tris combinables, import/export unifié à deux boutons, Sauvegarde Sylloge, profils et snapshots globaux. Livres conserve le suivi des tomes Manga/Comics et les citations personnelles. Jeux garde une plateforme libre assistée par des suggestions et filtrable, sans tracker ; Art n’a pas de note et garde lieu et exposition en textes libres facultatifs. La restauration globale remplit un profil vide ; les imports partiels restent propres à chaque bibliothèque. La synchronisation reste explicitement hors V1.
