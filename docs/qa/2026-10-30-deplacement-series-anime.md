# Déplacement Séries ↔ Animation japonaise

Lot du 30 octobre 2026, branche `lot/move-series-anime`. Modèle exact du déplacement Livres ↔ Mangas livré le 20 octobre. Aucune base personnelle, aucun fournisseur, aucune clé réelle ; toutes les recettes tournent sur la base SQLite en mémoire du harnais (`qa-app.html?scenario=full`).

## Comportement

- À la **modification** d’une fiche Série ou Animation japonaise, le formulaire propose le choix **Séries / Animation japonaise**, au même emplacement et avec le même sélecteur segmenté que **Livre / Manga**. À la création, la bibliothèque reste celle de la page : aucun choix n’apparaît.
- « Enregistrer » applique le changement : la fiche change de table avec le **même identifiant**, tous ses champs (titre, showrunner, casting, résumé, statut, note, favori, saisons vues et total, `progress_updated_at`, `started_at`, affiche, avis, date de création), `updated_at` à l’instant de l’enregistrement, `category = 'série télé'` en entrant dans `series` et aucune colonne de catégorie dans `anime`.
- Le **lien fournisseur TMDB** (`media_provider_links`, médium `series` ou `anime`) suit la fiche. Il est déplacé avant la suppression de la ligne source, sinon le déclencheur `AFTER DELETE` de l’ancienne table l’effacerait.
- Après l’enregistrement, la fiche est ouverte dans sa nouvelle bibliothèque (retour « Retour à l’animation japonaise » ou « Retour aux séries ») et les deux grilles sont relues sans rechargement.

## Approche

Les écritures ordinaires des séries passent par le greffon SQL côté TypeScript, sans transaction multi-instructions. Le déplacement, lui, enchaîne insertion, mise à jour du lien et suppression : il passe donc par une commande native dédiée, `move_series_library` (`src-tauri/src/series.rs`), dans une transaction SQLite unique. Le repository ne fait plus d’UPDATE déguisé : `updateSeries` délègue à la commande dès que la catégorie désigne l’autre table.

Refus explicites : fiche absente du profil, source égale à la cible, bibliothèque ou catégorie inconnue, titre vide. Un échec en cours de route annule tout.

## Fichiers

- `src-tauri/src/series.rs` (nouveau) : commande `move_series_library`, 7 tests Rust.
- `src-tauri/src/lib.rs` : module et commande enregistrés.
- `src/data/nativeSeries.ts` (nouveau) : pont `invoke('move_series_library')`.
- `src/data/mediaRepository.ts` : `updateSeries` route le déplacement vers la commande native.
- `src/components/SeriesForm.tsx` : choix de bibliothèque (modification seulement) et phrase d’aide.
- `src/domain/seriesLibraries.ts` : `SERIES_LIBRARIES` et `SERIES_LIBRARY_LABELS`.
- `src/main.tsx` : relecture de la fiche dans sa nouvelle bibliothèque après enregistrement.
- `src/i18n/catalogs/entries.ts` : « Bibliothèque », « Bibliothèque de la fiche » et la phrase d’aide en anglais.
- `src/qa/appBridge.ts` : simulation de `move_series_library`, refus compris.
- `scripts/qa-series-anime-move.js` (nouveau) : recette navigateur des deux sens.
- `scripts/i18n-entries.test.mjs` : rendu anglais du nouveau choix.
- `scripts/custom-entry-qa-bridge.test.mjs` : trois preuves du pont (déplacement, refus, retour arrière).
- `scripts/verify.mjs` : contrats de source du lot ; l’ancien « une modification ne déplace pas » devient « le déplacement passe par la commande native ».

## Preuves exécutées

- `cd src-tauri && cargo test` : 200 réussis, 0 échec (dont les 7 du module `series`).
- `cargo clippy --all-targets -- -D warnings` et `cargo fmt --check` : sans remarque.
- `npm run typecheck`, `npm run verify`, `npm run build` : sortie 0.
- `scripts/qa-series-anime-move.js` sur un Vite local (5173 pour le dépôt, 5181 pour l’exécution isolée) : `passed: true`, 7 contrôles — Séries → Animation japonaise (14 champs, lien TMDB), grille de la nouvelle bibliothèque à jour, absence dans l’ancienne, retour Animation japonaise → Séries (14 champs, catégorie rétablie, lien revenu), aucune copie résiduelle, interface anglaise sans reste de français, zéro erreur de page ou de console, zéro commande non simulée.
- Mutation : en neutralisant le départ vers la commande native dans `updateSeries` (`if (false && …)`, une ligne), la recette échoue — l’enregistrement ne referme plus la fenêtre, la fiche reste dans sa table. La ligne restaurée, la recette repasse.
- Non-régression : `scripts/qa-book-type-move.js` rejoué sur le même serveur, `passed: true`, 3 contrôles.

## Limites

- Le parcours n’a pas été exercé dans l’application native Tauri : la transaction Rust est prouvée par `cargo test`, le parcours par la recette navigateur sur `sql.js` avec les vraies migrations.
- Aucune aide au tri n’est proposée : le repérage des animés rangés dans Séries reste à concevoir (voir ROADMAP).
- Une fiche déplacée ne réécrit pas les vues enregistrées : elles portent sur une bibliothèque, pas sur une fiche.
