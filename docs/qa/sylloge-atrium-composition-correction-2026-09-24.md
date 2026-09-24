# QA de correction — scroll natif et composition discovery-first de l’Atrium

Date : 24 septembre 2026
Worktree : `Sylloge-worktrees/integration`
Portée : accueil desktop et rangées ; aucun changement de données, de runtime Tauri, de mobile ou de publication.

## Cause racine et correction

La cause racine du blocage vertical était localisée dans l’ancienne logique de `FileRow` de `src/components/AtriumHome.tsx` : une molette verticale pure était convertie en déplacement horizontal de la voie, puis `preventDefault()` était appelé dès que la voie pouvait défiler. La suppression de cette conversion est la seule correction de geste appliquée. La voie conserve `overflow-x: auto`, le scroll-snap, les flèches, le focus et le clavier natifs ; aucun handler `wheel`, `deltaX`, `deltaY` ou `preventDefault` ne subsiste dans le composant.

La preuve RED a été préparée sur la baseline avant le correctif, avec le même harnais et le même pointeur au-dessus d’une voie : la molette verticale était consommée par la voie et le conteneur vertical restait à `scrollTop = 0`. Le GREEN est rejoué après correction par le script reproductible `src/qa/runDesktopScrollQa.py` et conservé dans `docs/qa/atrium-scroll-regression-2026-09-24-final.json`.

## Composition desktop retenue

Le module focal `Reprendre` et la colonne `Aussi en cours` ont été retirés du premier écran. L’accueil ouvre désormais directement sur quatre lignes empilées pleine largeur :

- `Derniers ajouts` ;
- `À découvrir` ;
- `Favoris et mieux notés` ;
- `Vus, lus et joués`.

`Jour pour jour` reste le dernier contenu propriétaire lorsqu’il existe. Les données viennent des collections réelles reçues par `Home` ; le harnais injecte seulement un jeu représentatif pour la QA. Aucun artwork, compte ou statut fictif n’est créé par le composant. À 1440×900, Chrome mesure six cartes entièrement visibles sur la première rangée, trois cartes de `À découvrir` significativement visibles dans le viewport et aucun débordement horizontal global. La mesure machine compte deux rangées de cartes atteintes au premier écran ; la seconde est volontairement coupée par le bas, conformément à la densité demandée.

Les noms de sections restent ceux du vocabulaire produit existant. Aucun nouveau tableau de bord ni nom de section artificiel n’a été introduit.

## Mesures et scénarios Chrome réels

Harnais : `qa-integration.html`, servi par Vite sur `http://127.0.0.1:5191`, Chrome 153 headless, viewport 1440×900.

- Identité servie : titre `Sylloge — recette intégration`, h1 `Ma bibliothèque`.
- Document : `clientWidth = 1440`, `scrollWidth = 1440`, donc aucun débordement horizontal global.
- Accueil : `homeClientHeight = 900`, `homeScrollHeight = 2240`.
- Première voie : 6 cartes entièrement visibles, largeur mesurée `177.84375 px` ; la voie contient 9 entrées et `scrollWidth = 1745 > clientWidth = 1157`, donc le scroll horizontal reste disponible.
- Deuxième voie : `À découvrir`, 3 cartes, visible jusqu’à `987.65625 px` dans le viewport ; les 6 cartes de `Favoris et mieux notés` commencent plus bas.
- Texte du premier écran : aucun `Reprendre` ni `Aussi en cours` (mesure DOM et capture).
- Console : 0 erreur, 0 warning applicatif ; 0 exception React. Les messages Vite/React DevTools de développement sont hors diagnostic.

Scénarios joués dans le harnais :

1. Molette verticale pure au-dessus de la voie : `home-main.scrollTop: 0 → 420`, `lane.scrollLeft` inchangé.
2. Molette horizontale au-dessus de la voie : `home-main.scrollTop: 0 → 0`, `lane.scrollLeft: 0 → 196`.
3. Focus de la voie + molette horizontale : focus conservé sur la voie, `scrollLeft = 196`.
4. Touche `ArrowRight` après focus : focus conservé, `scrollLeft` augmente.
5. Bouton de navigation de voie : la voie avance au clic. Le focus revient au `body` après l’activation : ce comportement natif du bouton n’est pas traité comme une perte de focus ; la régression ciblée porte sur le focus de la voie après geste et après `ArrowRight`.
6. Films : le harnais construit volontairement un `.qa-library` avec `overflow-y` et quinze cartes pour garantir un débordement vertical déterministe. Le pointeur est au centre de la carte 2 ; `qa-library.scrollTop: 0 → 300`, sans débordement horizontal. Ce résultat prouve le conteneur de test et l’absence de handler `wheel` dans la page, pas le runtime natif de la vue Films.

## Captures

- Baseline avant composition : `docs/qa/atrium-before-scroll-composition-1440x900-2026-09-24.png`
- Après correction : `docs/qa/atrium-after-scroll-fix-1440x900-2026-09-24.png`
- Vue Films après contrôle : `docs/qa/films-after-scroll-fix-1440x900-2026-09-24.png`
- Rapport machine final : `docs/qa/atrium-scroll-regression-2026-09-24-final-handoff.json`

Les captures fallback montrent des aplats « sans affiche » : c’est une limite assumée des données du harnais et non un débordement ou une perte de mise en page. La perception du geste trackpad physique et le parcours natif Tauri restent à confirmer dans l’application native ; la QA navigateur couvre le DOM, les événements de souris, le clavier et le focus.

## Contrôles automatisés

- `npm run typecheck` : succès, code 0.
- `npm run verify` : succès, code 0.
- `npm run build` : succès, code 0 ; avertissement Vite connu sur le chunk JavaScript supérieur à 500 kB.
- `git diff --check` : succès, code 0.
- QA Chrome ciblée : succès, rapport JSON et captures ci-dessus.

## Portée et limites

Le worktree était volontairement sale avant cette correction ; les changements préexistants ont été conservés et aucun reset, stash, clean, commit, push ou déploiement n’a été effectué. Aucun travail mobile n’a été commencé. La vue Films a été contrôlée dans le harnais ; la persistance SQLite et le rendu natif Tauri ne sont pas simulés par cette preuve.
