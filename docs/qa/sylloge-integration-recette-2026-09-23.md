# Recette d’intégration — accueil et vues Bibliothèques

Date : 23 septembre 2026
Worktree : `Sylloge-worktrees/integration`
Perimètre : intégration des lanes `t_b084716d` (accueil), `t_8cc1c0f9` (vues Bibliothèques) et `t_4613da93` (audit/contrat visuel), sans lancement de la version mobile.

## Parents intégrés

Les trois parents requis sont reçus et explicitement pris en compte :

- `t_b084716d` : composition d’accueil, rangées horizontales, compteurs/calendrier et garde-fous de rendu.
- `t_8cc1c0f9` : ordre des vues, vue d’ouverture sémantique, overflow `+n` et navigation clavier.
- `t_4613da93` : audit visuel et contrat de composition ; son rapport source est conservé à titre de référence dans `visual-audit/docs/qa/sylloge-visual-contract-2026-09-23.md`.

L’audit n’a produit aucun changement de code à fusionner ; ses contraintes ont néanmoins été confrontées au rendu final (boutons/acccents, ordre `Tous`/ouverture, états vides, fallback, thèmes et responsive).

## Résultat observé

- Accueils fusionnés dans le shell réel : `Home`, `AtriumHome` et les styles associés.
- Contrat des vues Bibliothèques fusionné : `RATED_BUILTIN_VIEWS`, `PROGRESS_BUILTIN_VIEWS`, `UNRATED_BUILTIN_VIEWS`, `defaultBuiltinViewForMedium` et `titledBuiltinViews` sont partagés par `main.tsx` et `LibraryViewBar.tsx`.
- Ouverture confirmée dans le DOM : Films → `À voir` ; Séries → `À voir` ; Livres → `À lire` ; Jeux → `À jouer` ; Art → `Favori`.
- Réordonancement confirmé : `Tous` reste en première position ; les autres intégrées apparaissent dans l’ordre défini par la lane. Les vues enregistrées restent après les intégrées.
- Débordement de la rangée : le bouton `+n` et le menu `role="menu"` sont présents ; les éléments supplémentaires deviennent des `menuitem` et la navigation clavier les atteint.
- Filtres et tri : les popovers `Filtres` et `Tri` s’ouvrent.
- Repli visuel : le composant réel `Poster` affiche « Sans affiche » et un libellé accessible quand l’URL est absente.
- Thèmes clair et sombre : l’accueil reste sans débordement horizontal ; le texte du bouton principal est lisible dans les deux thèmes après remplacement de sa couleur fixe par le token sémantique.

## Preuves automatisées

Contrôles finaux dans le worktree d’intégration :

- `npm run typecheck` : succès.
- `npm run build` : succès ; avertissement Vite préexistant sur un chunk supérieur à 500 kB.
- `git diff --check` : succès.
- `npm run verify` : échec avant les assertions, à la première lecture de `src-tauri/src/tmdb/embedded_key.rs`. Ce fichier manque déjà dans la baseline du worktree d’intégration et n’est produit par aucune des trois lanes. L’échec est donc une limite de baseline, pas une régression accueil/vues.

Diagnostic reproductible : `embedded_key.rs` est listé par `.gitignore`, `git ls-files` ne le suit pas et `git log --all -- src-tauri/src/tmdb/embedded_key.rs` ne retourne aucun commit. Le fichier n’a pas été créé, lu ou reconstitué ; aucun secret n’a été manipulé. Les assertions de `verify.mjs` ne sont donc pas accessibles dans cet environnement, et leur statut ne doit pas être présenté comme vert.

## Recette navigateur réelle

Harnais temporaire de recette monté sur les composants de production, avec données de domaine représentatives et dépôt de vues enregistrées simulé dans le navigateur :

- Chrome 153 headless via CDP.
- Accueil : 1440×900, 1180×900 et 390×844.
- Bibliothèques : Films, Séries, Livres, Jeux et Art à 1440×900.
- Mesures : `document.documentElement.scrollWidth === clientWidth` sur les trois largeurs après correction ; pas d’overflow horizontal final.
- Console : 0 erreur, 0 avertissement, 0 exception React.
- Interaction : ouverture de vue, menu `+n`, filtres et tri vérifiés.
- Les captures sont dans le dossier d’artefacts de la tâche.

Deux défauts trouvés par la recette puis corrigés :

1. Le shell conservait 208 px de navigation à 390 px et produisait 96 px de débordement global. Sous 620 px, la navigation passe en rail de 64 px ; la mesure finale est 0 px.
2. Le bouton principal gardait un texte blanc fixe en thème sombre. Il utilise maintenant `var(--color-on-accent)` ; la capture sombre confirme la lisibilité.

## Limites explicites

- Le harnais navigateur ne remplace pas le runtime Tauri/SQLite : aucune lecture ni écriture de la base utilisateur réelle n’a été effectuée.
- Les vues enregistrées ont été chargées depuis un dépôt mémoire simulé. La persistance SQLite et le cycle renommer/supprimer restent couverts par les tests du dépôt, pas par cette QA navigateur.
- Les données de recette sont représentatives. Les interactions d’ouverture métier n’ont pas été reliées à une base réelle.
- Aucun problème mobile : aucun build ni lancement Tauri mobile.
- Le chunk >500 kB et le fichier `embedded_key.rs` absent sont hors périmètre de cette intégration ; ils restent à traiter dans leur lane dédiée.
