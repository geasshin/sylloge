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
