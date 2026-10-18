# Base visuelle de Sylloge

**Décision produit du 16 octobre 2026 :** une seule direction pour toute l’application, accueil compris. Monochrome neutre et froid, dérivé de l’anthracite des bibliothèques. Le papier chaud et l’accent violet propres à l’accueil sont abandonnés. Les écrans peuvent être recomposés quand l’usage le justifie. Cible desktop macOS uniquement.

Ce document est en cours de réécriture pendant le lot d’harmonisation (branche `design/harmonisation`). À la fin du lot, il décrira les jetons et composants réellement livrés : espacements, typographie, couleurs, arrondis, boutons, champs, fenêtres, cartes et rangées.

## Règles pendant le lot

- Toute valeur d’espacement, de taille de texte, d’arrondi ou de couleur passe par un jeton commun de `src/styles.css`. Pas de valeur isolée pour corriger un écran.
- Un même rôle garde la même apparence partout : bouton principal, bouton secondaire, bouton icône, champ, onglet de vue, fenêtre modale, carte d’œuvre.
- Garder les thèmes clair et sombre lisibles, les contrôles accessibles au clavier et les libellés explicites.
- Vérifier chaque écran modifié dans `qa-app.html`, en clair et en sombre, à 1440 × 900 et à la plus petite fenêtre desktop prise en charge.

L’ancien contrat visuel uniforme est conservé dans [les archives](docs/archive/DESIGN-contrat-visuel-2026-08-22.md) comme trace historique.

## Fondation transversale livrée

Ce socle ne recompose ni l’accueil, ni les fiches, ni les onglets de vues. Les choix de composition de ces surfaces restent un lot distinct.

### Jetons de `src/styles.css`

- Clair : canevas `#F6F6F7`, surface `#FFFFFF`, texte `#17171A`, action encre `#232327`.
- Sombre : canevas `#161618`, surface `#232326`, texte et action `#EDEDEF`.
- Les statuts, notes, cœurs, sélections et critiques utilisent l’encre monochrome. Rouge réservé au danger, jaune aux avertissements ; les visuels des œuvres gardent leurs couleurs.
- Les voiles, ombres, bordures, placeholders et chevrons de champs ont leurs jetons thémés. Les vignettes de choix du thème gardent des jetons fixes propres au thème représenté.
- Texte : `10 / 11 / 12 / 13 / 15 / 18 / 22 / 28 / 36 / 48px`, base `13px`. Graisses `400 / 500 / 600 / 700 / 800`.
- Syne locale en capitales pour pages et sections ; système sans-serif et casse naturelle pour les œuvres et l’UI ; serif pour la critique ; monospace pour les micro-libellés techniques.
- Espacements : `2 / 4 / 6 / 8 / 10 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80px`. Les filets de `1px`, le masquage accessible, les zéros et les unités de structure restent des exceptions intentionnelles. Gouttière desktop commune `64px` ; les petites media queries existantes sont conservées, sans nouvelle cible mobile.
- Arrondis : `4 / 8 / 12 / 16 / 20 / 999px`.
- Mouvement : `120 / 180ms`, courbe `cubic-bezier(.2,.8,.2,1)` ; les élévations et pressions sont neutralisées en mouvement réduit.

### Contrôles et fenêtres

- Boutons à libellé : police UI `13px / 600`, hauteur commune `34px`, variantes compactes `28px` et grandes `40px`. Les icônes et glyphes conservent une taille optique propre.
- Primaire : encre pleine. Secondaire : contour discret. Texte et retour : sans fond au repos. Danger : rouge sobre. Actions icône : rondes. Survol et pression exclus pour les contrôles désactivés ; focus clavier en encre, contrasté sur les visuels.
- Champs et recherche : bordure, rayon `8px`, focus et hauteur `34px` communs ; les zones de texte restent extensibles. Les variantes de titre et de critique ont leur échelle dédiée.
- Fenêtres : largeurs `440 / 640 / 880px`, au plus `92vw`, rayon `20px`, marge intérieure `24px`, voile/flou/ombre et fermeture partagés. La galerie d’affiches défile sans comprimer son pied ; l’éditeur garde sa grille et ses actions fixes.
- Le clavier des fenêtres d’ajout, d’association, de transfert et d’affiches est commun : Tab reste dans la fenêtre supérieure, Échap respecte les écritures en cours et le focus revient au déclencheur à la fermeture.
- Les surtitres « Collection personnelle » sont retirés. Les catégories de livres/séries et les formes d’Art restent visibles : elles apportent une information, pas une décoration.
- Visuels : le crayon de modification appartient au visuel lui-même (`poster-editable`) et reste dans son angle bas droit, en fiche comme dans la fenêtre d’ajout. Les visuels d’Art, de tous formats, s’affichent entiers (`object-fit: contain`) sur `--color-surface-muted` dans la carte 16:10, la fiche 3:4 et l’aperçu d’ajout 2:3 ; affiches et couvertures des autres médiums restent plein cadre.

La recette navigateur utilise uniquement `qa-app.html`, SQLite mémoire et les fixtures. Elle ne remplace pas une validation native macOS ni une vérification exhaustive des parcours métier.

## Accueil

Composition « à la une avec onglets », une seule colonne : onglets, une, rangées et activité partagent les mêmes bords, avec la gouttière commune `64px`.

- **Onglets** Tout · Films · Séries · Livres · Jeux · Art : contrôle segmenté commun (`seg-group-form` / `seg-pill-btn`), motif ARIA tablist (flèches, Début, Fin). L’onglet filtre toute la page et le dernier est mémorisé (`sylloge-home-tab`). Une bibliothèque vide garde son onglet et une phrase d’état vide.
- **Bilan** à droite, sur la même ligne : œuvres terminées et terminées ce mois-ci (chiffres `--text-xl` 700, libellés accordés à l’onglet en `--text-sm`), puis douze barres mensuelles de `6 × 24px` (mois courant à l’encre, autres en `--color-text-subtle`, barres décoratives titrées au survol). Quand la ligne est trop étroite (barre latérale étendue sur une petite fenêtre), l’histogramme s’efface plutôt que de replier le bilan.
- **À la une** : hauteur fixe `420px`, rayon `20px`. Fond tiré de la même affiche, flouté, sous `--color-scrim` ; sans visuel, le même voile sur `--color-surface-muted`. Le voile est sombre dans les deux thèmes : la une remappe localement l’encre, le focus, les étoiles et le bouton principal sur `--color-on-scrim`. Titre en police UI `--text-4xl`, casse naturelle ; extrait de critique en serif, trois lignes au plus. Coups de cœur de l’onglet (huit au plus), sinon dernières œuvres terminées, en cours, puis derniers ajouts. Défilement toutes les huit secondes, en pause au survol, sous le focus clavier, page cachée ou en mouvement réduit ; fondu enchaîné `--duration-base`.
- **Rangées** : coups de cœur, en cours, file d’attente, récemment terminés, derniers ajouts, pioche du jour. Titres Syne en capitales `--text-2xl`, en-têtes de hauteur `--control-md`, six cartes de largeur égale sur le bureau ; une rangée vide n’est pas affichée. Sous « Tout », le médium suit le titre de la carte.
- **Activité** : le calendrier mensuel et la liste des œuvres terminées du mois, dans un panneau de la largeur des rangées. Pastilles à l’encre, aucune couleur par médium.

## Barre de vues des bibliothèques

Décisions du 18 octobre 2026 : vues nettement distinctes et toutes visibles, actions libellées, tri en un clic, listes déroulantes Sylloge.

- **Ligne d’outils** : association, recherche (largeur de son texte d’aide), catégories puis barre de vues, sur une ligne. C’est une requête de conteneur (`library-tools`, barre latérale comprise) : quand la ligne ne peut plus porter la barre sans écraser les vues, la barre prend la ligne suivante d’un seul bloc. Aucun bouton n’est renvoyé seul à la ligne, aucun libellé n’est coupé.
- **Vues** : pastilles du contrôle segmenté de l’accueil (`seg-group-form` / `seg-pill-btn`), vue active à l’encre pleine. Vues intégrées, filet, vues enregistrées, puis « Nouvelle vue ». Aucune vue dans un menu : la rangée défile (molette, trackpad, flèches) avec fondu et flèche seulement du côté où des vues sont cachées, et la vue active est toujours ramenée dans le champ. Un seul arrêt de tabulation, flèches, Début et Fin. Une vue modifiée porte un point ; la vue enregistrée active porte son menu « … » (renommer, mettre à jour, supprimer).
- **Vues intégrées** : Tous, watchlist du médium, En cours (Séries, Livres), Récent, Cette année (terminé au sens strict depuis le 1er janvier, année calculée à l’exécution), Favori, Classement (médiums notés). Art s’ouvre sur Tous.
- **Actions** : boutons secondaires libellés de `--control-md` : « Filtrer » et son compteur accordé, « Trier » qui affiche le tri effectif. Quand filtres, tri, forme, catégorie ou plateforme s’écartent de la vue active, « Réinitialiser » et « Enregistrer » (vue intégrée) ou « Mettre à jour » (vue enregistrée) apparaissent devant elles, séparés par un filet.
- **Panneaux** : rayon `--radius-md`, ombre `--shadow-popover`, apparition `--duration-base` neutralisée en mouvement réduit. Filtres sur deux colonnes alignées (un champ resté seul et le texte libre prennent la ligne), case commune, « Réinitialiser » et « Fermer ». Tri : liste des colonnes à cocher, application immédiate, second clic qui inverse le sens, « Tri de la vue ». La date personnelle porte le nom du médium dans le filtre comme dans le tri : Visionnage, Début de visionnage, Début de lecture, Partie, Découverte.
- **Liste déroulante** (`Select.tsx`) : bouton au gabarit des champs (`aria-haspopup="listbox"`), liste flottante qui reste dans la fenêtre, option cochée à l’encre, option active sur `--color-surface-muted`. Flèches, Début, Fin, Page, Entrée ou Espace, Échap qui rend le focus, saisie de lettres, clic extérieur. Elle reste dans le DOM de son panneau : focus et clic extérieur des fenêtres qui la contiennent sont préservés. Les formulaires d’ajout et de modification gardent encore leurs menus système.
