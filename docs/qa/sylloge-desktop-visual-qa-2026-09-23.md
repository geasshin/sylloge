# QA visuelle desktop post-intégration — Sylloge

Date : 23 septembre 2026
Worktree : `Sylloge-worktrees/integration`
Portée : contrôle indépendant du desktop uniquement ; aucun lancement mobile, commit, push ou déploiement.

## Verdict

La recette desktop est exploitable pour la gate humaine, avec deux réserves explicites :

1. le harnais monte les composants de production avec des données de démonstration et simule le dépôt des vues enregistrées ; il ne remplace pas le runtime Tauri/SQLite ;
2. `npm run verify` reste bloqué avant ses assertions par l’absence baseline de `src-tauri/src/tmdb/embedded_key.rs`, comme constaté sur le parent.

Aucun défaut bloquant nouveau n’a été trouvé dans les écrans contrôlés. Les mentions très pâles des fallbacks sont discrètes mais lisibles ; elles restent à confirmer dans la validation visuelle d’Aurélien.

## Preuves de rendu réel

Chrome 153 headless via CDP, sur `http://127.0.0.1:5187/qa-integration.html`. L’identité servie a été contrôlée à chaque scénario avec `document.title`, `location.host` et le `h1` attendu.

Captures horodatées :

- `accueil-1440x900-2026-09-23.png` et `accueil-1180x900-2026-09-23.png` ;
- `library-Films-1440x900.png` ;
- `library-Séries-1440x900.png` ;
- `library-Livres-1440x900.png` ;
- `library-Jeux-1440x900.png` ;
- `library-Art-1440x900.png` ;
- `serie-1180x900-2026-09-23.png` ;
- `state-vue-enregistree-1440x900.png` ;
- `state-filtre-popover-1440x900.png` et `state-tri-popover-1440x900.png` ;
- `state-vide-2026-09-23.png` ;
- `state-fallback-affiche-1440x900.png` ;
- `state-calendrier-1440x900.png` ;
- `state-theme-sombre-1440x900.png`.

Le rapport machine complet est `qa-report.json` dans le dossier d’artefacts de cette carte.

## Mesures et interactions observées

### Accueil

- 1440×900 et 1180×900 : `scrollWidth - clientWidth = 0` sur le document ; aucun texte tronqué détecté par la sonde DOM.
- Composition réelle visible : « Ma bibliothèque », compteurs `9 œuvres, 5 médiums`, reprise d’une série et d’un livre, rangées plein cadre, « Jour pour jour », compteurs annuels et calendrier.
- Calendrier : septembre 2026, 30 cases, jour courant encadré, compteurs `5 œuvres ajoutées` et `0 consommation datée`, détail `Films 4 · Livres 1`.
- Rangée « Derniers ajouts » : largeur visible 1120 px, contenu 1689 px, maximum de défilement 569 px.
- Clavier : la rangée reçoit le focus et `ArrowRight` la déplace de 0 à 190 px sans faire défiler la page.
- Trackpad horizontal : le geste `deltaX = 300` déplace la rangée à 379 px sans faire défiler la page.
- Molette verticale : le CDP n’a pas reproduit le geste vertical sur la rangée ; ce point reste à confirmer sur un trackpad réel.
- Bouton principal : un seul bouton violet visible, « Reprendre la saison 4 ». En thème sombre, il passe au fond clair et au texte encre ; la lisibilité est conservée.

### Bibliothèques

Les cinq pages sont servies et identifiées par leur `h1` attendu : Films, Séries, Livres, Jeux et Art.

- `Tous` est toujours le premier élément logique de la vue.
- Vue d’ouverture mesurée : Films `À voir`, Séries `À voir`, Livres `À lire`, Jeux `À jouer`, Art `Favori`.
- Le débordement est représenté par un bouton `+n` ; le menu a `role="menu"` et le premier élément reçoit le focus via `ArrowDown`.
- Navigation clavier de la rangée : `ArrowRight` depuis `Tous` déplace le focus vers `À voir`.
- Popover Filtres : `role="dialog"`, label `Filtres`, capture réelle fournie.
- Popover Tri : `role="dialog"`, label `Tri`, capture réelle fournie.
- Vue enregistrée appliquée : `Nuits au cinéma` devient active ; capture réelle fournie.
- Aucun bouton violet parasite n’est mesuré sur les cinq vues. Le seul accent principal observé est le bouton d’ajout en encre.
- Aucun débordement de document ni texte tronqué n’est mesuré à 1440×900 ; Séries a également été contrôlée à 1180×900.

### États demandés

- Vue enregistrée : présente et active (`Nuits au cinéma`).
- État vide : rendu réel de `Home` avec le message « La maison attend sa première œuvre. Les rangées apparaîtront ici au fur et à mesure de votre collection. » ; aucun défaut visible.
- Fallback d’affiche : présent, avec le libellé accessible `Affiche indisponible pour Le.Extension.la plus longue` ; aucun débordement ou texte tronqué dans la capture.
- Thèmes : clair et sombre exposés par le harnais. Le bouton principal sombre utilise un fond clair et un texte sombre ; le document reste sans overflow horizontal.

## Contrôles automatisés

- `npm run typecheck` : succès, code 0.
- `npm run build` : succès, code 0 ; avertissement Vite connu sur un chunk JavaScript de 602,94 kB (>500 kB).
- `git diff --check` : succès, code 0.
- Chrome/CDP, console : 0 erreur, 0 warning, 0 exception React après activation du dépôt simulé.
- `npm run verify` : échec avant assertions, `ENOENT` sur `src-tauri/src/tmdb/embedded_key.rs`. Le fichier est absent de la baseline suivie par Git ; aucun secret n’a été lu ou créé.

## Limites

- Les données sont représentatives et injectées par le harnais ; aucune base SQLite utilisateur réelle n’a été ouverte.
- La persistance, la création, le renommage et la suppression des vues enregistrées ne sont pas vérifiés dans un runtime Tauri.
- Le calendrier a été contrôlé en septembre 2026 sur la date courante ; les autres mois et les autres années n’ont pas été parcourus.
- La navigation trackpad a été simulée par CDP (`deltaX`), pas sur un trackpad physique ; la molette verticale reste à confirmer.
- Le contrôle est desktop uniquement. Aucun mobile n’a été lancé.
