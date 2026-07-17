# V0.1 — Bibliothèque culturelle, socle calme + titres Syne

## Mission

Fais évoluer ce workspace à partir de la **première V0 existante**, dont le code vient d’être copié ici. Cette V0.1 est le candidat pour devenir la base de travail, donc améliore-la avec retenue : aucune refonte générale, pas de changement de produit.

Le parti à conserver est celui de la première V0 : interface claire, calme, légèrement chaleureuse, sidebar compacte, cartes et boutons sobres avec des angles modérément arrondis, fiche immersive accueillante. Ne reprend pas le langage très anguleux, la grille froide ni les composants de la V0 Syne alternative.

## Décision artistique à appliquer

Aurélien préfère le caractère de **Syne**, mais veut le conserver dans le cadre plus calme de la première V0.

1. Copier la fonte locale `/Users/aurelientrouble/Documents/Vibecoding/fonts/Syne/Syne-VariableFont_wght.ttf` sous `src/assets/fonts/` et la déclarer avec `@font-face`. Aucun CDN.
2. Appliquer Syne aux **grands titres éditoriaux et titres de page** uniquement : accueil, titres de sections majeures, Films, Séries, titre de fiche.
3. Pour ces grands titres, utiliser des **capitales** (`text-transform: uppercase`) avec une taille, interlettrage et interlignage réellement ajustés pour Syne. La présence doit être affirmée sans devenir criarde.
4. Ne pas appliquer Syne ni les capitales à l’interface courante, aux métadonnées, aux notes, aux filtres, aux titres de film dans les cartes ou aux textes longs. Ils doivent rester très lisibles et plus discrets.
5. Garder la palette claire, l’accent violet sourd et les visuels au premier plan.
6. Garder les boutons et menus de la première V0 : petites surfaces calmes, légèrement arrondies, sans carrés stricts. Conserver en particulier le style doux de la sidebar et de l’action « Ajouter un film » ; ne pas en faire une pastille massive ou un bouton SaaS bleu.

La V0.1 doit donc se lire comme : **la V0 calme, mais avec une colonne typographique plus forte et plus contemporaine**.

## Périmètre à conserver

Les trois parcours originels restent fonctionnels :

- Accueil
- Bibliothèque Films avec recherche et filtres
- Fiche Film immersive avec retour

Ne casse ni l’état de recherche/filtre au retour, ni le fonctionnement existant.

## Extension mesurée demandée : Séries seulement

N’ajoute pas directement Livres, Jeux et Art. Nous ne voulons pas produire quatre écrans clonés avec du faux contenu avant d’avoir validé le comportement de l’interface sur un second médium.

Ajoute seulement :

### Page Séries

- Le bouton Séries de la sidebar devient vraiment interactif.
- Page de bibliothèque Séries construite sur la même base que Films, sans être un copier-coller brutal.
- 8 à 10 séries de démonstration cohérentes, statiques et locales. Chaque série doit avoir titre, créateur·rice ou showrunner, années, statut, note éventuelle, favori éventuel, date de visionnage ou de dernière saison, et une note personnelle lorsqu’elle est terminée.
- Recherche et filtres : Tout, À découvrir, En cours, Terminées, Favoris. Ils doivent être réellement fonctionnels.
- Chaque série ouvre une fiche immersive, distincte d’une fiche film par des libellés justes : années, saisons vues, statut, date de dernière saison / dernière séance, note personnelle.
- Les autres rayons de la sidebar restent visibles mais désactivés avec sobriété. Ne leur invente pas de pages vides ni de faux chiffres.

### Accueil

- Conserver la structure et l’esprit de l’accueil d’origine.
- Ajouter au maximum un module discret lié aux séries, par exemple une œuvre « À poursuivre » ou « Dernière saison ». Il doit être fonctionnel et ouvrir la page ou la fiche Série correspondante.
- Ne surcharge pas l’accueil et ne crée ni dashboard ni statistiques.

## Visuels de démonstration

- Données locales seulement, aucune API, aucun compte ni appel réseau à l’exécution.
- Les couvertures existantes peuvent rester des compositions locales pour ce test. Elles ne doivent pas être désaturées ni recevoir un overlay UI uniforme.
- Les variantes Série doivent garder leur identité graphique et ne pas être de simples recolorations des affiches Film.

## Hors périmètre ferme

- Pas de Tauri, SQLite, sync, import Notion, API, authentification, recommandations ou social.
- Pas de thème sombre.
- Pas de nouvelles pages Livres, Jeux ou Art.
- Pas de refonte de la sidebar, de la structure de la page Films ou de l’esthétique des boutons de la V0 calme.
- Pas de tokens/DESIGN.md définitifs.

## Livraison et vérification

- Maintenir React + TypeScript + Vite, données statiques locales.
- Ajouter ou adapter des vérifications minimales automatisées couvrant à la fois Films et Séries : recherche, filtres, ouverture et retour.
- Lancer `npm run build` et le script de vérification.
- Vérifier visuellement si possible.
- Ne modifier ni la V0 originale `/Users/aurelientrouble/Documents/Codex/bibliotheque-culturelle-v0` ni la V0 Syne alternative.
- Faire un commit Git clair après validation.

## Livrable attendu

Une V0.1 autonome : la première V0 visuellement préservée, avec Syne en capitales uniquement là où les titres doivent porter la direction, et une première extension Série qui permet de tester sereinement l’élargissement de la collection.