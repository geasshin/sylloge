# Recette accueil élargi — Sylloge

Date : 24 septembre 2026
Worktree : `Sylloge-worktrees/mobile`
Périmètre : page d’accueil `AtriumHome`, navigation desktop, shell mobile, cinq bibliothèques, thèmes et interactions de file.

## Verdict

Implémentation locale vérifiée. Le nouvel accueil est plus simple en tête et ajoute des rangées horizontales conditionnelles, sans créer de section vide. La navigation desktop affiche une maison compacte dans l’item Accueil ; le branding Sylloge reste dans le shell mobile, le tiroir et l’onboarding.

La preuve navigateur est un harnais Vite/CDP avec données de démonstration. Elle ne remplace pas une recette native Tauri/SQLite sur le profil réel.

## Modifications observées

- `src/main.tsx` : l’ancien bouton de marque de la sidebar est remplacé par un item `Accueil` avec `HomeIcon`, au même niveau que Films, Séries, Livres, Jeux et Art. La sidebar peut rester en rail ou s’étendre.
- `src/components/AtriumHome.tsx` : l’accueil est extrait dans un module dédié ; le hero réduit son titre à `Ma bibliothèque`; les files existantes restent horizontales ; `En cours` et les files par médium sont montées seulement si leurs données sont non vides.
- `src/components/AtriumHome.tsx` : chaque file reste focusable, possède un `aria-label`, un état de débordement et des boutons de défilement accessibles. Les portes `Tout voir` ouvrent la bibliothèque du médium.
- `src/styles.css` : styles de l’accueil recentrés, tête réduite, files pleine largeur, densité mobile et scroll horizontal borné conservés.
- `src/qa/integrationHarness.tsx` : le harness fournit assez de films pour éprouver le scroll horizontal et aligne son item Accueil sur le pictogramme réel.
- `scripts/verify.mjs` : invariants structurels de l’accueil, du pictogramme, des files conditionnelles, des ancres et des attributs de scroll ajoutés.

## Contrat de surface et hypothèses

- Le titre `Ma bibliothèque` est conservé comme repère clair ; la date longue et la phrase de service du hero sont supprimées.
- `En cours` est filtré sur le statut réel `en cours` des modèles Série/Livre. Les statuts propres aux autres médiums ne sont pas forcés dans cette rangée.
- Une file par médium est une vue de découverte et une porte vers la bibliothèque complète ; elle n’est pas présentée comme une sélection éditoriale ou une recommandation algorithmique.
- `À découvrir` conserve la file d’attente réelle par médium et son rotation déterministe `Six autres` lorsqu’il y a plus de six éléments.
- Les images absentes restent des fallbacks neutres ; aucune image ou donnée n’est fabriquée.
- Les destinations `Tout voir` ouvrent la vue complète du médium via `libraryViewForMedium`.

## Contrôles automatisés

Dans le worktree, après les modifications :

- `npm run typecheck` : succès, code 0.
- `npm run verify` : succès, `Vérification réussie`, code 0.
- `npm run build` : succès, code 0 ; bundle Vite produit ; avertissement persistant sur la taille du chunk JavaScript.
- `git diff --check` : succès, code 0.

Le build ne prouve pas le rendu ; la sonde Chrome/CDP ci-dessous est la preuve visuelle et structurelle.

## QA Chrome/CDP réelle

Harnais : `qa-integration.html` servi par Vite sur `http://127.0.0.1:5193/qa-integration.html`.
Chrome headless : port CDP `9229`, profil jetable.

Tailles et thèmes :

- desktop `1440×1000`, clair ;
- desktop `1440×1000`, sombre ;
- mobile `390×844`, clair ;
- mobile `390×844`, sombre.

Résultats observés dans `docs/qa/sylloge-home-expanded-qa-2026-09-24.json` :

- identité de page correcte : `Sylloge — recette intégration`, `h1 = Ma bibliothèque`, hôte `127.0.0.1:5193` ;
- `document.documentElement.scrollWidth === clientWidth` dans les quatre scénarios ;
- aucune erreur, exception ou warning console capturé ;
- aucune anomalie de texte tronqué hors des conteneurs de scroll intentionnel ;
- 10 files horizontales visibles : `Derniers ajouts`, `À découvrir`, `En cours`, `Favoris et mieux notés`, `Vus, lus et joués`, puis `Films`, `Séries`, `Livres`, `Jeux`, `Art` ;
- item Accueil actif, avec SVG présent et géométrie `18×18` sur desktop ; sur mobile, le SVG est correctement masqué par le rail mobile ;
- shell mobile visible (`mobile-app-bar` et `mobile-bottom-nav`) à 390 px ; la sidebar desktop est masquée ;
- les anchors de file sont focusables et les débordements sont internes aux `.at-lane`, pas à la page ;
- les positions mesurées placent la première rangée à `top=87.2` et la deuxième à `top=526.0` sur desktop, puis à `top=132.1` et `top=592.6` sur mobile.

Captures :

- `docs/qa/sylloge-home-expanded-desktop-home.png`
- `docs/qa/sylloge-home-expanded-desktop-home-dark.png`
- `docs/qa/sylloge-home-expanded-mobile-home.png`
- `docs/qa/sylloge-home-expanded-mobile-home-dark.png`

## Limites et suites

- Le harness utilise des données de démonstration sans affiches ; les fallbacks sont donc visibles dans les captures. La disponibilité des affiches réelles n’est pas prouvée ici.
- La sonde couvre le rendu et la structure ; elle ne mesure pas la molette physique, le trackpad ni le PWA standalone.
- La recette Tauri/SQLite sur données réelles, l’audit WCAG exhaustif et la validation humaine du rediff restent hors de ce lot.
- Aucun commit, push, merge, publication, déploiement ou migration n’a été exécuté.
