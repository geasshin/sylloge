# Bibliothèques personnalisées : rapport de recette

**22 octobre 2026. Implémenté localement, non commité, non publié.**

## Décisions appliquées (Aurélien, 22 octobre)

- Uniquement des modèles prêts, ajoutés par un « + » sous les bibliothèques de la barre latérale, dans une fenêtre de choix.
- Huit modèles : Comics (bandes dessinées comprises), Magazines, Livres audio, Musique (albums), Podcasts, Documentaires et reportages, Spectacles (théâtre compris), Jeux de société.
- Comics est une bibliothèque à part : Livres n’a plus de catégorie Comics.
- Supprimer une bibliothèque supprime ses fiches, sans copie.
- Les bibliothèques ajoutées entrent dans la sauvegarde JSON.

## Ce qui a changé

| Couche | Fichiers | Contenu |
|---|---|---|
| Schéma | `src-tauri/migrations/0021_custom_libraries.sql`, `database.rs` | Huit tables de même structure (`comics`, `magazines`, `audiobooks`, `music`, `podcasts`, `documentaries`, `shows`, `board_games`), `comic_quotes`, `profile_libraries` (liste et ordre par profil). Déplacement des anciens comics de `books` vers `comics` (même identifiant, citations comprises, statut traduit), activation de Comics pour les profils concernés. Copie de la base avant migration (greffon du bloc 3). |
| Catalogue | `src/domain/customLibraries.ts` | Un modèle = libellés, famille, statuts proposés et leurs libellés, progression, date de fin, champs propres (`details`), filtre principal, citations, forme du visuel. |
| Données | `src/data/customLibraryRepository.ts` | Liste, ajout, suppression d’une bibliothèque ; lecture, création, modification, suppression des fiches. Nom de table pris dans la liste fermée. |
| Interface | `CustomLibraryScreen.tsx`, `CustomEntryForm.tsx`, `AddLibraryDialog.tsx`, `CustomLibraryIcon.tsx`, `icons.tsx`, `main.tsx`, `styles.css` | Barre latérale, catalogue, bibliothèque (recherche, statuts, filtre principal, tri), fiche, formulaire, confirmation de suppression. |
| Sauvegarde | `libraryDocument.ts`, `libraryRepository.ts`, `backupService.ts`, `nativePortability.ts`, `portability.rs` | Format `sylloge-library` version 4 : liste `customLibraries`. Les versions 1 à 3 restent lisibles ; leurs comics rangés dans Livres rejoignent Comics. Restauration atomique côté Rust. |
| Profils | `profiles.rs`, `ProfilesSettings.tsx`, `backupRestore.ts`, `BackupRestorePicker.tsx`, `Onboarding.tsx` | Suppression d’un profil étendue aux huit tables ; compteurs et aperçus de restauration incluant les bibliothèques personnalisées. |
| Livres | `book.ts`, `bookLibraries.ts`, `BookForm.tsx`, `bookForm.ts`, `CategorySwitch.tsx`, `books.rs`, `collectionCsvImport.ts`, `collectionJsonImport.ts` | Catégorie Comics retirée. Le formulaire et Rust la refusent ; un CSV Sylloge de Livres contenant des comics le signale ligne par ligne ; un CSV tiers typé « comics » est importé comme livre avec un avertissement. |
| Export d’une bibliothèque | `LibraryExportFlow.tsx` | L’export d’une seule bibliothèque de base n’emporte plus aucune bibliothèque personnalisée (défaut trouvé par `qa-transfers.js`). |

## Vérifications exécutées

- `npm run typecheck`, `npm run build` : réussis.
- `npm run verify` : vérifications statiques réussies, 94 tests Node réussis (dont aller-retour JSON v4 avec citations, champ propre importé et bibliothèque vide ; conversion des comics d’un document v3 ; refus de six documents v4 invalides ; sauvegarde automatique v4).
- Rust (`src-tauri`) : `cargo test` 148 réussis, `cargo fmt --check` et `cargo clippy --all-targets -- -D warnings` sans remarque. Tests ajoutés : migration 0021 sur une base v20 (comics, citations, liens, intégrité), import complet de bibliothèques personnalisées champ par champ, retour arrière complet sur échec tardif, refus des documents invalides, refus des comics dans Livres (document et import par bibliothèque), profil ne contenant que des fiches personnalisées, bibliothèque déjà ajoutée, liste fermée alignée sur le schéma, suppression de profil avec les quinze tables.
- Recette navigateur (`qa-app.html?scenario=full`, base en mémoire) : `scripts/qa-custom-libraries.js`, 24 contrôles réussis (barre latérale, catalogue, ajout, création d’une fiche, filtres, recherche dans les champs propres, citations conservées, sauvegarde v4 relue puis restaurée à l’identique dans un profil neuf, suppression d’une bibliothèque). Scripts existants relancés et réussis : `qa-csv-transfers`, `qa-library-toolbar`, `qa-onboarding-flows`, `qa-onboarding-visual`, `qa-profile-restoration`, `qa-settings`, `qa-third-party-transfers`, `qa-transfer-failures`, `qa-transfer-visual`, `qa-transfers`.
- Rendu examiné en clair et en sombre, 1440 × 900 et 1000 × 760 : bibliothèque Musique (visuels carrés) et Comics, fiche, formulaire, catalogue, barre latérale étendue, barre latérale avec les quinze bibliothèques. Aucun débordement horizontal.

## Limites et points non exercés

- Application native lancée sur une copie synthétique d’une base v20 (identifiant de recette isolé, aucune donnée réelle) : migration 0021 appliquée au démarrage, copie de sauvegarde pré-migration écrite, comics déplacés de `books` vers `comics` avec leurs citations, `PRAGMA integrity_check` et `foreign_key_check` sans erreur, données toujours présentes après redémarrage.
- Écritures des fiches et de leurs citations : une seule transaction SQLite côté Rust (`create_custom_entry_atomically`, `update_custom_entry_atomically`, `delete_custom_entry_atomically`, `remove_custom_library_atomically`). Un échec tardif sur une citation annule la fiche et toutes ses citations. Vérifié en recette native : une citation modifiée garde son identifiant et sa date, une citation ajoutée est écrite à sa position.
- Automatisation graphique native partielle : les clics et saisies dans la fenêtre passent par l’accessibilité macOS. Après bascule d’espace ou activation d’une autre application, la fenêtre accepte l’observation mais refuse l’entrée tant qu’elle n’est pas ramenée au premier plan. Les parcours vérifiés en natif sont donc la migration, la sauvegarde pré-migration, l’intégrité, l’édition de citations et la persistance après redémarrage ; le reste est couvert par les recettes navigateur et les tests Rust.
- Pas encore dans ce lot : vues enregistrées, présence sur l’accueil, import et export propres à une bibliothèque personnalisée, recherche de métadonnées en ligne.
- Un JSON par bibliothèque Livres issu d’un ancien export n’importe pas ses comics : le message renvoie vers la restauration complète.
- `scripts/qa-book-libraries.js` réécrit sur le modèle réel : une table par bibliothèque (Livres, Mangas, Comics séparés), recherche mémorisée par bibliothèque, vues cloisonnées, création manuelle dans la bonne table, import au périmètre explicite et retour de focus. `scripts/qa-book-libraries-extended.js` est supprimé : son sujet — une seule ligne `books` qui passait de Livre à Manga puis à Comics — n’existe plus. Il est remplacé par `scripts/qa-book-type-move.js`, qui vérifie le déplacement entre bibliothèques dans les deux sens : même identifiant, notes, progression et date de création conservés, citation écrite une seule fois et déplacée avec la fiche, aucune copie résiduelle.

---

## Mise à jour du 23 octobre 2026 : neuvième modèle, Recettes de cuisine

**Implémenté localement, non publié.** Décision d’Aurélien : une base pour stocker ses recettes (ingrédients et préparation), avec une photo.

### Ce qui a changé

| Couche | Fichiers | Contenu |
|---|---|---|
| Schéma | `src-tauri/migrations/0022_recipes_library.sql`, `database.rs` | Table `recipes` de même structure que les huit autres. `profile_libraries` est **reconstruite** (SQLite ne modifie pas une contrainte CHECK) : lignes copiées colonne par colonne, ancienne table supprimée en dernier. Ni déclencheur, ni clé étrangère entrante, ni index nommé ne dépendaient d’elle. |
| Moteur | `portability.rs` (`CUSTOM_LIBRARIES` à neuf entrées) | Import, export, décompte et suppression de profil dérivent de cette liste. |
| Catalogue | `customLibraries.ts` | Modèle `recipes`, famille « Cuisine », nouveau type de champ `textarea`. Statuts À essayer, Testée, Écartée (pas de « En cours »). |
| Interface | `CustomEntryForm.tsx`, `CustomLibraryScreen.tsx`, `CustomLibraryIcon.tsx`, `icons.tsx`, `navigationIconPaths.ts`, `styles.css` | Champs longs en zones de texte sur toute la largeur ; fiche avec ingrédients et étapes côte à côte ; pictogramme Phosphor « chef-hat » (même famille et licence que les autres). |
| Traductions | `catalogs/home.ts`, `entries.ts`, `shared.ts` | Français et anglais ; les mots ambigus (« Plat », « Entrée », « Préparation », « Cuisson », « Étapes ») en contexte `recipes`. |

### Vérifications exécutées

- **Migration** : test Rust sur une base v21 construite par le vrai migrateur (trois lignes de `profile_libraries`, un comic) — lignes identiques après 0022, version 22, recettes acceptées, bibliothèque inconnue et doublon refusés, clé étrangère et cascade conservées, `integrity_check` et `foreign_key_check` propres. Rejeu du fichier octet pour octet avec `sqlite3` sur une base v21 fabriquée avec les migrations 0001 à 0021 : même résultat, saut de ligne `\r\n` d’une recette relu intact. Empreinte du fichier rejoué : `1a200b5c…`.
- **Import d’un profil avec une recette** : ingrédients et étapes avec `\r\n`, lignes vides, espaces de tête et de fin, tabulation, caractères non latins — chaque colonne relue et comparée.
- Rust : `cargo test` 162 réussis, `clippy --all-targets -- -D warnings` sans alerte, `rustfmt` sans écart sur les fichiers modifiés.
- `npm run verify` vert (dont 9 tests du catalogue et des textes longs), `typecheck`, `build`.
- Navigateur : `scripts/qa-recipes.js` (28 contrôles : catalogue à neuf modèles, création, relecture exacte de chaque ligne, modification, filtres, suppression). Preuve que la recette détecte : retour à la ligne désactivé dans le CSS → échec sur ce contrôle précis, puis rétabli.
- Rendu examiné en français et en anglais, 1440 × 900 : catalogue, formulaire, fiche. Libellés de faits sur une seule ligne.

### Limites et points non exercés

- **Application native non lancée sur ce lot**, ni migration 0022 rejouée sur une copie de la vraie base : la copie de sécurité de la base avant migration (3 dernières) est faite par l’application, mais cette migration n’a été exercée que sur des bases synthétiques.
- Une sauvegarde contenant des recettes **n’est pas lisible par une version antérieure** de l’application (bibliothèque inconnue). Le format reste en v5.
- Ingrédients en texte libre : pas de quantité/unité structurées, donc pas de recalcul des portions ni de liste de courses.
- Pas de lien cliquable ni de recherche de métadonnées en ligne pour les recettes.
- Recette navigateur : `qa-custom-libraries.js` attendait « Animation » (le formulaire dit « Animation du podcast » depuis l’interface bilingue) et « v4 » (le document est en v5) ; elle était déjà périmée avant ce lot et est corrigée.

---

## Mise à jour du 24 octobre 2026 : les recettes prennent leur forme d’usage

**Implémenté localement dans un worktree (`recettes-notion`), non commité, non publié.**

Décisions d’Aurélien : trois états seulement (À tester, Testée, Maîtrisée — ni « Écartée », ni année, ni résumé) ; ingrédients et étapes saisis en listes, une ligne par élément, Entrée ouvrant la ligne suivante ; des vues par état **et** par type de plat, avec le tri comme dans les autres bibliothèques ; les recettes Notion (« Meal Tracker ») importées pour juger sur pièces.

### Ce qui a changé

| Couche | Fichiers | Contenu |
|---|---|---|
| Schéma | `migrations/0023_recipes_statuses.sql`, `database.rs` | Table `recipes` reconstruite (SQLite ne modifie pas un CHECK) : `maîtrisée` entre, `en cours` et `abandonné` sortent. Les lignes existantes sont copiées colonne par colonne ; un état hors contrat revient à `à découvrir`. Index recréé, clé étrangère vers `profiles` conservée. |
| Statuts | `customLibraries.ts`, `libraryDocument.ts`, `statusTone.ts`, `custom_entries.rs` | `RECIPE_STATUSES` et `isStatusAllowedFor()` : `maîtrisée` n’existe que dans `recipes`, côté TS comme côté écriture native. Le document de sauvegarde refuse `maîtrisée` pour les huit autres tables. Famille visuelle « accompli ». |
| Catalogue | `customLibraries.ts` | Recettes : trois statuts, libellés À tester / Testée / Maîtrisée ; `showsYear` et `showsSummary` à `false` ; `Préparation` et `Cuisson` comme seuls temps ; type de plat « Pain » ; ingrédients et étapes en champs `list` ; texte libre renommé « Notes » et visible dès la création (`noteLabel`). |
| Formulaire | `CustomEntryForm.tsx`, `styles.css` | Éditeur en liste : puce ou numéro, Entrée ouvre la ligne suivante, Retour arrière sur une ligne vide la retire, un collage multiligne se répartit. Le stockage reste le texte multiligne existant : ni le schéma ni les sauvegardes ne changent. Année et résumé disparaissent quand le modèle les exclut. |
| Bibliothèque | `CustomLibraryScreen.tsx`, `styles.css` | Une rangée de vues qui défile, avec fondu et flèches : « Tous », les statuts, puis les valeurs du filtre principal présentes dans la bibliothèque. État et type de plat se combinent ; « Tous » remet les deux à zéro ; un second clic sur un type de plat le referme. Tri par titre, ajout récent, note, et — sans millésime — date de test. La source s’affiche en lien cliquable dans la fiche et en nom de domaine sur la carte. |
| Fiche | `CustomLibraryScreen.tsx` | Ingrédients en liste à puces, étapes en liste numérotée ; les textes libres restent tels quels. |
| Traductions | `catalogs/home.ts`, `shared.ts` | À tester, Maîtrisée, Date de test, Pain, Notes et l’invite des notes (contexte `recipes`). |
| Import Notion | `scripts/import-notion-recipes.mjs`, `fixtures/recettes-notion.json`, `qa/appBridge.ts` | Lecture seule de la base Notion (52 recettes) par `NOTION_API_KEY` (environnement ou `.env` du profil, jamais affichée) : propriétés, corps en sections, blocs imbriqués, tableaux. Le script écrit un document Sylloge v5 d’une seule bibliothèque `recipes`, restaurable dans un profil neuf. `?scenario=recettes` charge ce document dans la base en mémoire pour la recette visuelle. |
| Recettes navigateur | `scripts/qa-recipes.js`, `scripts/qa-custom-libraries.js` | 42 contrôles pour les recettes (édition en liste, Entrée et Retour arrière, vues d’état et de type, fiche, base, suppression) ; le filtre de format des comics passe des listes déroulantes aux pastilles. |

### Vérifications exécutées

- `npm run typecheck`, `npm run build` : réussis. Le document importé **n’entre pas** dans le bundle de l’application (aucune chaîne des recettes dans `dist/`).
- `npm run verify` : vert (catalogue, formulaire, document v5, portabilité, i18n).
- Rust : `cargo test` 177 réussis — dont la nouvelle migration 0023 (lignes conservées colonne par colonne, états hors contrat ramenés à `à découvrir`, `maîtrisée` accepté dans `recipes` et refusé dans `comics`) et les écritures par modèle avec les trois états de recette.
- Navigateur, `qa-app.html` sur le serveur du worktree : `qa-recipes.js` 42/42, `qa-custom-libraries.js` 29/29, aucune erreur de page.
- Rendu examiné en clair et en sombre, en français et en anglais, 1440 × 900 : rangée de vues, grille, fiche, formulaire. Aucun débordement horizontal ; puces et numéros centrés sur leur champ (centres mesurés identiques).
- Import réel exercé sur la base Notion d’Aurélien : 52 recettes, 24 « maîtrisée », 28 « à découvrir » ; ingrédients et étapes relus sur plusieurs fiches (Goulash 21/8, Manakish 8/9).

### Limites et points non exercés

- **La migration 0023 n’a pas été rejouée sur une copie de la vraie base** : elle est exercée sur des bases synthétiques construites par le vrai migrateur. L’application prend sa copie de sécurité habituelle avant migration.
- **Application native non lancée** : toute la preuve vient du navigateur (base SQLite en mémoire, vraies migrations) et des tests Rust.
- Notion ne porte qu’un champ « Durée », un temps total : il remplit `Préparation` (38 recettes sur 52) ; `Cuisson` reste vide et se complète à la main.
- Les états Notion « Pain » et « Brioches & beignets » tenaient lieu de rayon : ces 20 recettes arrivent **À tester**, avec leur type de plat correct — leur vrai état n’est pas connu.
- 16 recettes n’ont aucun visuel, 20 aucune source ; 4 photos Notion sont hébergées par Notion (liens signés qui expirent) et ne sont donc pas reprises.
- Les paragraphes Notion hors sections (« Pour 2 portions », conservation, quantités) atterrissent dans le bloc **Notes**, faute d’un champ dédié.
- `fixtures/recettes-notion.json` contient les vraies recettes d’Aurélien : à garder hors Git ou à assumer dans l’historique.
- 15 recettes ont une préparation vide **dans Notion** (blocs vides, méthode restée dans la vidéo source) : l’import ne peut pas inventer ce qui n’y est pas.
