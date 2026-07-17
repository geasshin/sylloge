# Sylloge — version 0.1.0

Sylloge est une première baseline privée d’une bibliothèque culturelle personnelle, locale et actuellement centrée sur les Films. La base SQLite locale est la source de vérité. Aucune API, aucun compte et aucune connexion ne sont nécessaires pour créer, consulter ou modifier une fiche.

La documentation active de pilotage et la feuille de route sont dans [`docs/`](docs/README.md).

## Lancer l'application

Prérequis de développement : Node.js avec npm, Rust avec Cargo et les Xcode Command Line Tools.

Après récupération du dépôt, installer les dépendances une fois :

```bash
npm install
```

Pour lancer Sylloge en développement dans une fenêtre Tauri :

```bash
npm run tauri:dev
```

Pour produire le bundle macOS release :

```bash
npm run tauri:build
```

Le bundle local canonique est alors :

```text
src-tauri/target/release/bundle/macos/Sylloge.app
```

Il peut être ouvert depuis le Finder ou depuis la racine du dépôt :

```bash
open src-tauri/target/release/bundle/macos/Sylloge.app
```

Le bundle `release` est celui à utiliser. Un éventuel bundle sous `src-tauri/target/debug/` est un artefact de développement et ne doit pas être présenté comme l'application finale. Le build ne copie rien dans `/Applications` ni dans `~/Applications`.

## Données locales AppConfig

L'identifiant macOS est `com.aurelientrouble.sylloge`. Tauri place les données AppConfig de cette application dans :

```text
~/Library/Application Support/com.aurelientrouble.sylloge/
```

La base principale est :

```text
~/Library/Application Support/com.aurelientrouble.sylloge/sylloge.db
```

SQLite peut aussi créer `sylloge.db-wal` et `sylloge.db-shm`. Ces fichiers font partie de son fonctionnement normal. Ne pas déplacer, modifier ou copier la base pendant que Sylloge est ouverte. Pour une sauvegarde portable et cohérente, utiliser l'export JSON intégré.

## Export manuel et restauration

Pour sauvegarder le profil courant :

1. Ouvrir `Profils et JSON` dans la barre latérale.
2. Vérifier le profil courant et le nombre de films.
3. Choisir `Exporter en JSON`.
4. Choisir le dossier et le nom du fichier dans la fenêtre macOS, puis enregistrer.

Le fichier est un JSON lisible au format `sylloge-films`, version 1. Il contient le profil et tous les champs Films V1. Il ne contient ni image téléchargée ni secret.

Pour vérifier ou restaurer cet export sans écraser un profil existant :

1. Dans `Profils et JSON`, choisir `Choisir un JSON Sylloge`.
2. Sélectionner le fichier exporté.
3. Lire l'aperçu de validation et le nombre d'erreurs.
4. Si le document est valide, choisir `Créer le nouveau profil et importer`.
5. Vérifier le rapport final et le nouveau profil courant.

L'import crée toujours un nouveau profil. Un document invalide est bloqué avant écriture.

## Contrôles du dépôt

```bash
npm run typecheck
npm run verify
npm run build
cd src-tauri && cargo fmt --check && cargo check && cargo test && cargo clippy --all-targets -- -D warnings
```

Le bundle release complet se construit séparément avec `npm run tauri:build` depuis la racine.

## Limites de la version 0.1.0

Cette baseline couvre uniquement les films, la saisie manuelle, la recherche, les filtres, les profils locaux minimaux et la portabilité JSON Sylloge v1. Elle n'inclut pas l'import Notion ou CSV, Letterboxd, TMDB, les autres médiums, la synchronisation, les sauvegardes automatiques, le thème sombre ni une distribution signée Developer ID et notarisée.
