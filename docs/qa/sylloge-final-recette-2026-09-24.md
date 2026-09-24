# Recette finale avant publication — Sylloge

Date : 24 septembre 2026
Worktree : `Sylloge-worktrees/mobile`
Périmètre : accueil, cinq bibliothèques, vues, responsive, thèmes, accessibilité, régressions et contrôles de livraison. Aucun push, tag, publication, déploiement, commit ou migration exécuté.

## Verdict

La surface visuelle est cohérente et ne présente aucun défaut bloquant démontré dans le harnais navigateur : 23 scénarios réels (accueil + cinq bibliothèques à 390, 768 et 1440 px, tiroir mobile et thème sombre) n'ont produit ni débordement horizontal, ni texte tronqué, ni contrôle visible sans nom accessible, ni erreur console, ni exception React.

La publication reste néanmoins bloquée par la gate technique complète : `cargo fmt --check` et `cargo clippy --all-targets -- -D warnings` échouent dans les modules de clés embarquées locales ignorés par Git. La recette native sur données réelles et la validation humaine de ce nouveau rediff restent aussi requises avant publication.

## Preuves exécutées

### Contrôles front et build

- `npm run typecheck` : succès.
- `npm run verify` : succès.
- `npm run build` : succès ; avertissement Vite persistant sur le chunk JavaScript de 603,77 kB (> 500 kB).
- `git diff --check` : succès.
- `npm run tauri:build -- --no-sign` : succès ; `.app`, `.dmg` et archive updater non signés produits localement.

### Contrôles Rust

- `cargo check` : succès.
- `cargo test` : succès, 76 tests passés, 0 échec.
- `cargo fmt --check` : échec sur `src/igdb/embedded_client_id.rs`, `src/igdb/embedded_client_secret.rs` et `src/tmdb/embedded_key.rs`.
- `cargo clippy --all-targets -- -D warnings` : échec sur trois `clippy::identity_op` dans ces mêmes modules.

Ces trois fichiers sont générés, ignorés par Git et hors diff. `src-tauri/src/rawg/embedded_key.rs` est absent, mais le backend est désormais IGDB ; les deux fichiers IGDB locaux sont présents. Aucun secret n'a été lu, affiché, copié ou modifié.

### QA navigateur réelle

Harnais local `qa-integration.html`, rendu Vite réel et composants de production, servi sur `http://127.0.0.1:5192/qa-integration.html`. Chrome 154 headless via CDP.

- 23 scénarios, 0 échec structurel.
- Tailles : 390×844, 768×1024, 1440×1000.
- Écrans : accueil, Films, Séries, Livres, Jeux, Art ; tiroir mobile ; thème sombre ; changement de vue ; Filtres ; Tri.
- `document.documentElement.scrollWidth === clientWidth` sur tous les scénarios.
- Aucun texte détecté comme tronqué par la sonde DOM.
- Accueil : les quatre lanes restent dans leur conteneur horizontal intentionnel, sont focusables et débordent uniquement en interne lorsque nécessaire.
- Tiroir mobile : ouverture, focus initial sur « Fermer le menu », blocage du scroll de fond et fermeture par Échap confirmés.
- Bibliothèque : changement `À voir` → `Récent`, ouverture des dialogues `Filtres` et `Tri`, fermeture du dialogue Filtres par Échap confirmés.
- Thème sombre : aucun débordement, texte tronqué ou erreur console.
- Contrôle des libellés accessibles des contrôles visibles : 0 contrôle non nommé.

Rapport machine : `docs/qa/sylloge-final-recette-qa-2026-09-24.json`.

Captures finales :

- `docs/qa/sylloge-final-mobile-home-390x844.png`
- `docs/qa/sylloge-final-mobile-drawer-390x844.png`
- `docs/qa/sylloge-final-desktop-home-1440x1000.png`
- `docs/qa/sylloge-final-desktop-films-1440x1000.png`
- `docs/qa/sylloge-final-desktop-dark-1440x1000.png`

## Cohérence fonctionnelle observée

- Accueil et cinq bibliothèques partagent le même shell et les mêmes destinations.
- Vues d'ouverture : Films `À voir`, Séries `À voir`, Livres `À lire`, Jeux `À jouer`, Art `Favori`.
- Thème clair/sombre et navigation mobile sont présents sur le shell de production.
- Les données du harnais sont représentatives et limitées aux composants ciblés par la recette. Elles ne prouvent pas la lecture de la base SQLite de l'utilisateur.
- Le compteur « 1 œuvre · 1 coup de cœur » du harnais est volontairement fixe et ne décrit pas les 15 cartes de démonstration. Ce n'est pas un défaut du composant de production, mais la preuve doit être lue comme un harness, pas comme une bibliothèque réelle.

## Accessibilité

Preuves obtenues :

- structure `main`, titres de sections et libellés de vues présents ;
- tiroir `role="dialog"`, `aria-modal="true"`, focus initial et piège de Tab implémentés ; Échap vérifié ;
- fichiers focusables, popovers de vues, navigation rapide et contrôles de navigation nommés ;
- thèmes clair et sombre sans erreur console ;
- mouvement réduit couvert par la règle globale `prefers-reduced-motion` ; un test navigateur spécifique reste souhaitable.

Limites :

- aucun audit WCAG automatisé complet ( Axe ou équivalent ) n'est installé ou exécuté ;
- le focus de retour après fermeture du tiroir et le cycle complet de Tab dans le tiroir n'ont pas été rejoués événement par événement dans ce rapport ; le focus initial et la fermeture Échap le sont ;
- les contrastes sont jugés par inspection des captures et tokens, sans mesure exhaustive de chaque paire texte/fond ;
- la navigation au trackpad et la molette physique ne sont pas reproductibles dans Chrome headless.

## Blockers avant publication

### B1 — Gate Rust complète rouge

**Blocant.** `cargo fmt --check` et `cargo clippy --all-targets -- -D warnings` échouent dans les générateurs locaux de secrets. Corriger la sortie du générateur ou ses templates, régénérer les fichiers locaux sans les exposer, puis rejouer les quatre commandes Rust. Ce défaut n'est pas dans le diff suivi, mais il empêche honnêtement de déclarer la gate technique verte.

### B2 — Recette native sur données réelles non reprise

**Blocant.** Le harnais ne remplace ni Tauri, ni SQLite, ni les fournisseurs. Rejouer au minimum sur un profil de test : ouverture des cinq bibliothèques, création/modification/suppression d'une fiche par médium, import/export et sauvegarde, vues enregistrées persistées, thème sombre et navigation mobile réelle. Ne pas toucher à la bibliothèque réelle.

### B3 — Validation humaine du rediff actuel obligatoire

**Blocant.** Le GO desktop précédent et la QA mobile parent sont des jalons, pas une validation de tout le rediff final après recette. Les captures finales montrent une base cohérente, mais la publication exige le GO humain explicite sur l'état exact à committer.

### B4 — Publication et traçabilité non préparées

**Blocant.** Le tag `v0.6.0` existe déjà sur le commit de base `2290571`, tandis que le travail actuel est non commité sur `experiment/sylloge-mobile`. Avant publication : réconcilier le statut réel de `0.6.0`, choisir la stratégie de version/tag sans écraser l'historique, puis produire la release signée et ses artefacts. Aucun tag ni push n'a été touché.

## Non-bloquants à traiter ou assumer

- Chunk JavaScript de 603,77 kB : avertissement build, pas une régression ni un blocker fonctionnel.
- Le harnais dépend de données de démonstration ; il ne constitue pas une preuve de production.
- Audit WCAG automatisé, contraste exhaustif et mouvement réduit restent des couches de couverture, pas des défauts observés.
- Les cinq bibliothèques et le shell natif sont compilés dans le bundle, mais le cycle complet avec données réelles n'a pas été exercé dans cette recette automatisée.

## Verdict de sortie

**NE PAS PUBLIER EN L'ÉTAT.** L'interface passe les preuves navigateur disponibles, mais la publication reste conditionnée à B1, B2, B3 et B4. Aucun correctif produit n'a été nécessaire pendant cette recette.
