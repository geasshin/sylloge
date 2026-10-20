# Recette Livres / Mangas et barre des bibliothèques

Recette isolée du 20 octobre 2026, branche `design/harmonisation`, depuis `17b8e0f`. Exécution par un seul agent, sans délégation. Aucune bibliothèque personnelle, aucun fournisseur, aucune clé réelle ni base installée utilisés. Aucun build natif ni publication.

## Résultat

- Six destinations d’interface, cinq collections SQLite : `books` reste partagé entre Livres (livres et anciens comics) et Mangas (manga seulement). Aucune migration ni modification de schéma ou de format JSON/CSV.
- « Tout associer » est dans l’en-tête ; la recherche prend la pilule ; les vues défilent et « Nouvelle vue » reste hors du scroller.
- Recherche, filtres, tri et vues sont indépendants entre Livres et Mangas. L’accueil filtre aussi ses rangées, sa une, son activité et son bilan. Les vues v1/v2 sont consultées sans réécriture ; les noms restent uniques pour le médium `books` partagé.
- L’ajout manuel et l’ajout Open Library simulé conservent la bibliothèque ouverte, sans choix du type à la création. L’édition peut corriger le type sur la même ligne, sans perdre avis, note, favoris, dates, citations ni avancement.
- L’export prépare seulement le périmètre ouvert. L’import reste commun et annonce avant toute écriture que Remplacer inclut Livres, Mangas et les comics. Préparation et annulation testées sans écrire un fichier ou importer sur disque.

## Défauts reproduits et corrigés

1. Manga → Livre effaçait les compteurs dans la validation de formulaire, puis les null étaient persistés. La validation conserve maintenant les valeurs renseignées et les champs restent visibles. Le cycle Manga → Livre → Comics → Manga a été vérifié sur SQLite en mémoire, toutes les colonnes comparées hors catégorie/horodatage de modification, et textes/ordre des citations conservés.
2. Retour de fiche : le focus restait sur le document. La carte d’origine est refocalisée, avec repli sur la navigation si elle a disparu. L’édition depuis l’accueil conserve ce retour ; la suppression retrouve son contexte.
3. La confirmation de suppression des livres ignorait Échap et ne retenait pas le focus. Elle utilise maintenant le gestionnaire commun de fenêtres.
4. En mouvement réduit, `transition-duration: .01ms` sur `*` activait aussi les transitions de position des listes mesurées. Les transitions sont maintenant à zéro : les listes restent ancrées au champ et dans la fenêtre.
5. L’annonce masquée d’une vue modifiée pouvait créer un débordement horizontal. Elle est ancrée à sa pastille, dans le scroller.
6. La largeur intrinsèque des champs numériques faisait déborder les compteurs. Le composant partagé peut maintenant rétrécir dans sa colonne sans couper ses boutons.

## Vérifications exécutées

- `npm run typecheck` : sortie 0.
- `npm run build` : sortie 0. Avertissement informatif conservé : bundle JS minifié de 638,56 kB, au-dessus de 500 kB.
- `node scripts/verify-book-libraries.mjs` : sortie 0 ; partitions, requêtes SQLite paramétrées, catégories étrangères, neuf corrections de type, validation des compteurs, vues v1/v2, citations et aller-retour JSON/CSV.
- `npm run verify` : sortie 0 via le helper de clé factice. Module TMDB absent avant génération ; module et fichier source factices supprimés ensuite. Aucune clé existante ouverte.
- `scripts/qa-book-libraries.js` : réussi ; navigation, recherche distincte, vues anciennes sans réécriture de ligne, ajout manuel, correction du type, exports et annulation d’import.
- `scripts/qa-book-libraries-extended.js` : réussi ; filtrage de l’accueil/bilan, cycle de catégories et persistance, Open Library simulé, filtres/tri séparés, noms uniques, transferts complets, clavier et suppression.
- `scripts/qa-library-toolbar.js` : 96 configurations, 738 assertions, aucune assertion échouée. Six bibliothèques × deux thèmes × deux fenêtres × rail/menu × propre/modifiée. Quatre vues réellement créées par bibliothèque ; état modifié avec Réinitialiser, Mettre à jour, badge et tri au libellé mesuré le plus long. Largeur minimale du scroller : 193,78125 px ; débordements horizontaux page/outils : 0 ; actions primaires entières. Une ligne à 1440 × 900 en rail ; repli groupé dans les états étroits.
- Captures : 92 images de l’application réelle, clair/sombre, 1440 × 900 et 1000 × 760, rail/menu ; bibliothèques, accueil haut/bas, ajout, édition, couverture imbriquée, import et état vide Mangas. 43 assertions supplémentaires de géométrie et d’interaction, aucune échouée. Planches et captures ciblées inspectées visuellement. Les couvertures sont des SVG factices, pas les affiches réelles.
- Fenêtres : Tab/Shift+Tab, Échap, propriété des fenêtres imbriquées et retour du focus vérifiés. Vues : Début/Fin, menu, focus et état désactivé de la création sans nom vérifiés.
- Erreurs console/page : 0 ; commandes natives non simulées : 0 ; requêtes externes non simulées : 0.
- Détecteur Impeccable sur les cibles modifiées : sortie 0, résultat `[]`.
- `git diff --check` : propre.

Les scripts navigateur sont des fonctions pour `playwright-cli -s=<session-isolée> run-code --filename=<chemin-absolu>`. Ils ouvrent uniquement `http://127.0.0.1:5173/qa-app.html?scenario=full`, interceptent les images externes et bloquent tout autre accès externe. Préparer un Vite local possédé sur le port 5173 et une session Chrome headless isolée. Ne pas naviguer vers la base installée ni les services réels. La matrice renvoie un champ `passed` calculé depuis toutes les assertions nommées ; il doit être vrai, même si le transport de `run-code` sort avec 0.

## Preuves et limites

Galerie locale de cette exécution : `/Users/aurelientrouble/.hermes/profiles/promethee/cache/scratch/sylloge-sol-final/captures.html`. Les résultats JSON, scripts de capture et planches sont à côté ; ce dossier de travail temporaire peut être purgé. Les scripts de régression ci-dessus sont suivis dans le dépôt.

Le parcours natif Tauri/WebKit macOS, les vrais sélecteurs de fichiers et l’écriture SQLite native ne sont pas exercés. Aucun push, déploiement, migration ou nouvelle dépendance. `PRODUCT.md` et `.impeccable/` restent hors des commits. `AGENTS.md` est volontairement inchangé : sa modification protégée n’a pas été autorisée ; README, ROADMAP et DESIGN portent la distinction actuelle entre six bibliothèques d’interface et cinq collections.
