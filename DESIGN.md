# Base visuelle de Sylloge

**Décision produit du 16 octobre 2026 :** une seule direction pour toute l’application, accueil compris. Monochrome neutre et froid, dérivé de l’anthracite des bibliothèques. Le papier chaud et l’accent violet propres à l’accueil sont abandonnés. Les écrans peuvent être recomposés quand l’usage le justifie. Cible desktop macOS uniquement.

Ce document est en cours de réécriture pendant le lot d’harmonisation (branche `design/harmonisation`). À la fin du lot, il décrira les jetons et composants réellement livrés : espacements, typographie, couleurs, arrondis, boutons, champs, fenêtres, cartes et rangées.

## Règles pendant le lot

- Toute valeur d’espacement, de taille de texte, d’arrondi ou de couleur passe par un jeton commun de `src/styles.css`. Pas de valeur isolée pour corriger un écran.
- Un même rôle garde la même apparence partout : bouton principal, bouton secondaire, bouton icône, champ, onglet de vue, fenêtre modale, carte d’œuvre.
- Garder les thèmes clair et sombre lisibles, les contrôles accessibles au clavier et les libellés explicites.
- Vérifier chaque écran modifié dans `qa-app.html`, en clair et en sombre, en français et en anglais (`?lang=fr`, `?lang=en`), à 1440 × 900 et à la plus petite fenêtre desktop prise en charge.

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
- Champs et recherche : bordure, rayon `8px`, focus et hauteur `34px` communs ; les zones de texte restent extensibles. Les variantes de titre et de critique ont leur échelle dédiée. La recherche des bibliothèques prend la pilule (`--radius-pill`) des boutons de sa ligne.
- Fenêtres : largeurs `440 / 640 / 880px`, au plus `92vw`, rayon `20px`, marge intérieure `24px`, voile/flou/ombre et fermeture partagés. La galerie d’affiches défile sans comprimer son pied ; l’éditeur garde sa grille et ses actions fixes.
- Le clavier des fenêtres d’ajout, d’association, de transfert et d’affiches est commun : Tab reste dans la fenêtre supérieure, Échap respecte les écritures en cours et le focus revient au déclencheur à la fermeture.
- Les surtitres « Collection personnelle » sont retirés. Les catégories de livres/séries et les formes d’Art restent visibles : elles apportent une information, pas une décoration.
- Partage : dans une bibliothèque, l’entrée est un **lien sous le titre**, dans la ligne du décompte (« 24 films dont 7 coups de cœur · ⤴ Partager mes coups de cœur ») — 13 px, encre pleine, icône de partage, soulignement au survol, anneau de focus. Ce n’est jamais un bouton de plus dans la rangée des actions ; sur l’accueil « Tout » et dans Paramètres › Partage, c’est un bouton « Partager mon profil ». La fenêtre s’intitule « Partager mes coups de cœur » ou « Partager mon profil » selon ce qu’elle montre.
- Visuels : le crayon de modification appartient au visuel lui-même (`poster-editable`) et reste dans son angle bas droit, en fiche comme dans la fenêtre d’ajout. Les visuels d’Art, de tous formats, s’affichent entiers (`object-fit: contain`) sur `--color-surface-muted` dans la carte 16:10, la fiche 3:4 et l’aperçu d’ajout 2:3 ; affiches et couvertures des autres médiums restent plein cadre.

La recette navigateur utilise uniquement `qa-app.html`, SQLite mémoire et les fixtures. Elle ne remplace pas une validation native macOS ni une vérification exhaustive des parcours métier.

## Langue de l’interface

Décision du 23 octobre 2026 : français et anglais, voir [docs/I18N.md](docs/I18N.md). Le choix est une liste déroulante au gabarit des champs (`mapping-select`), nommée « Langue de l’application » : groupe « Langue » de Paramètres › Général (avant « Apparence »), et premier écran du premier lancement. Elle propose « Français » et « English », chacun écrit dans sa propre langue quelle que soit la langue active.

- Un libellé anglais ne renvoie jamais à la ligne et ne s’abrège pas par une ellipse là où le français tient sur une ligne : barres d’outils, onglets et boutons sont dimensionnés pour la plus longue des deux langues, quitte à raccourcir la traduction.
- Dates, nombres, accords et pluriels suivent la langue active ; aucun pluriel n’est construit par suffixe.
- Les données de la personne ne sont jamais traduites (titres, avis, notes, citations, noms de profils et de vues).

## Annonces en coin

Un message qui n’appelle pas de décision immédiate — sauvegarde, mise à jour disponible — se pose dans la pile `.notice-stack`, en bas à droite : une carte de la surface, bordée, ombre `--shadow-popover`, largeur bornée (380 px pour l’annonce de mise à jour, 460 px pour le message de sauvegarde). Jamais de voile, jamais de fenêtre modale, jamais de vol de focus : la personne continue de travailler, l’annonce attend.

- Une annonce de mise à jour propose trois issues explicites — installer, plus tard, ne plus proposer cette version — et une fermeture immédiate (×) équivalente à « plus tard ». « Plus tard » ne vaut que pour la session ; « ne plus proposer » est enregistré en base et réversible dans Paramètres › Application.
- Une annonce n’est jamais la seule voie d’accès à son action : la même opération reste disponible dans les réglages.
- L’état passe par `role="status"` ; un échec par `role="alert"`. Aucune annonce n’interrompt une saisie ni ne déplace le curseur.

## Accueil

Composition « à la une avec onglets », une seule colonne : onglets, une, rangées et activité partagent les mêmes bords, avec la gouttière commune `64px`.

- **Onglets** Tout · Films · Séries · Animation japonaise · Livres · Mangas · Jeux · Art : contrôle segmenté commun (`seg-group-form` / `seg-pill-btn`), motif ARIA tablist (flèches, Début, Fin). L’onglet filtre toute la page, bilan compris, et le dernier est mémorisé (`sylloge-home-tab`). Une bibliothèque vide garde son onglet et une phrase d’état vide.
- **Bilan** à droite, sur la même ligne : œuvres terminées et terminées ce mois-ci (chiffres `--text-xl` 700, libellés accordés à l’onglet en `--text-sm`), puis douze barres mensuelles de `6 × 24px` (mois courant à l’encre, autres en `--color-text-subtle`, barres décoratives titrées au survol). Quand la ligne est trop étroite (barre latérale étendue sur une petite fenêtre), l’histogramme s’efface plutôt que de replier le bilan.
- **À la une** : hauteur fixe `420px`, rayon `20px`. Fond tiré de la même affiche, flouté, sous `--color-scrim` ; sans visuel, le même voile sur `--color-surface-muted`. Le voile est sombre dans les deux thèmes : la une remappe localement l’encre, le focus, les étoiles et le bouton principal sur `--color-on-scrim`. Titre en police UI `--text-4xl`, casse naturelle ; extrait de critique en serif, trois lignes au plus. Coups de cœur de l’onglet (huit au plus), sinon dernières œuvres terminées, en cours, puis derniers ajouts. Défilement toutes les huit secondes, en pause au survol, sous le focus clavier, page cachée ou en mouvement réduit ; fondu enchaîné `--duration-base`.
- **Rangées** : coups de cœur, en cours, file d’attente, récemment terminés, derniers ajouts, pioche du jour. Titres Syne en capitales `--text-2xl`, en-têtes de hauteur `--control-md`, six cartes de largeur égale sur le bureau ; une rangée vide n’est pas affichée. Sous « Tout », le médium suit le titre de la carte.
- **Activité** : le calendrier mensuel et la liste des œuvres terminées du mois, dans un panneau de la largeur des rangées. Pastilles à l’encre, aucune couleur par médium.

## Barre de vues des bibliothèques

Décisions du 18 octobre 2026 : vues nettement distinctes et toutes visibles, actions libellées, tri en un clic, listes déroulantes Sylloge. Allègement du 19 octobre 2026 : « Tout associer » rejoint l’en-tête, recherche en pilule, vues défilantes.

- **En-tête** : titre et sous-titre à gauche ; à droite « Tout associer » (Films, Séries, Livres, Mangas, Jeux ; icône conservée, gabarit des boutons secondaires), Importer, Exporter puis le bouton principal d’ajout. Si la fenêtre est trop étroite, ce groupe passe sous le titre d’un seul bloc. Le compte rendu d’un export s’affiche sous le groupe, hors du flux : il ne l’élargit pas.
- **Ligne d’outils** : recherche en pilule (`344px`, `288px` à côté des catégories), catégories (Séries) puis barre de vues, sur une ligne à 1440 px. C’est une requête de conteneur (`library-tools`, barre latérale comprise) dont les seuils sont mesurés dans l’état le plus chargé (vue enregistrée modifiée, compteur de filtres, tri au libellé le plus long) : la barre garde au moins `180px` de vues sur la ligne de la recherche, sinon elle prend la ligne suivante d’un seul bloc ; sur une ligne très étroite, les actions d’une vue modifiée passent sous les vues, d’un seul bloc. Aucun bouton n’est renvoyé seul à la ligne, aucun libellé n’est coupé. `scripts/qa-library-toolbar.js` vérifie ces règles dans `qa-app.html` (six bibliothèques, 1440 × 900 et 1000 × 760, barre latérale en rail et étendue, état propre et état le plus chargé).
- **Vues** : pastilles du contrôle segmenté de l’accueil (`seg-group-form` / `seg-pill-btn`), vue active à l’encre pleine. Vues intégrées, filet, vues enregistrées, puis « Nouvelle vue », hors de la zone qui défile et toujours entière ; une vue modifiée sur une ligne étroite la réduit à son « + », nommé par son infobulle. Aucune vue dans un menu : la rangée défile (molette, trackpad, flèches) avec fondu et flèche seulement du côté où des vues sont cachées, et la vue active est toujours ramenée dans le champ, y compris quand la rangée rétrécit. Un seul arrêt de tabulation, flèches, Début et Fin. Une vue modifiée porte un point ; la vue enregistrée active porte son menu « … » (renommer, mettre à jour, supprimer).
- **Vues intégrées** : Tous, watchlist du médium, En cours (Séries, Livres, Mangas), Récent, Cette année (terminé au sens strict depuis le 1er janvier, année calculée à l’exécution), Favori, Classement (médiums notés). Art s’ouvre sur Tous.
- **Actions** : boutons secondaires libellés de `--control-md` : « Filtrer » et son compteur accordé, « Trier » qui affiche le tri effectif. Quand filtres, tri, forme, catégorie ou plateforme s’écartent de la vue active, « Réinitialiser » et « Enregistrer » (vue intégrée) ou « Mettre à jour » (vue enregistrée) apparaissent devant elles, séparés par un filet.
- **Panneaux** : rayon `--radius-md`, ombre `--shadow-popover`, apparition `--duration-base` neutralisée en mouvement réduit. Filtres sur deux colonnes alignées (un champ resté seul et le texte libre prennent la ligne), case commune, « Réinitialiser » et « Fermer ». Tri : liste des colonnes à cocher, application immédiate, second clic qui inverse le sens, « Tri de la vue ». La date personnelle porte le nom du médium dans le filtre comme dans le tri : Visionnage, Début de visionnage, Début de lecture, Partie, Découverte.
- **Liste déroulante** (`Select.tsx`) : bouton au gabarit des champs (`aria-haspopup="listbox"`), liste flottante qui reste dans la fenêtre, option cochée à l’encre, option active sur `--color-surface-muted`. Flèches, Début, Fin, Page, Entrée ou Espace, Échap qui rend le focus, saisie de lettres, clic extérieur. Elle reste dans le DOM de son panneau : focus et clic extérieur des fenêtres qui la contiennent sont préservés. Les formulaires d’ajout et de modification gardent encore leurs menus système.

## Livres et Mangas

Décision du 19 octobre 2026 : Mangas devient une bibliothèque distincte. Depuis le 20 octobre 2026, chaque bibliothèque possède sa propre table dans l’unique base `sylloge.db` (`books` pour Livres, `mangas` pour Mangas). Depuis le 22 octobre 2026, Comics est une bibliothèque personnalisée : Livres n’a plus de catégorie Comics.

- **Navigation** : Mangas a sa propre entrée dans la barre latérale (pictogramme d’une série de tomes, distinct du livre ouvert de Livres, le seul repère visible en rail), son compteur, son onglet d’accueil et son bilan. Recherche, vue, filtres et tri sont mémorisés séparément pour chacune.
- **Barre** : aucune bascule de catégorie ni champ Type dans Livres.
- **Création** : le bouton d’ajout et la recherche Open Library portent le nom de la bibliothèque ouverte ; le type n’est pas demandé, il découle de la bibliothèque. En modification, le champ Type reste disponible : le corriger déplace la même fiche dans l’autre bibliothèque, sans doublon ni perte d’avancement. Les compteurs déjà renseignés restent visibles et modifiables, même après un passage en Livre.
- **Fiche** : le retour et la suppression ramènent à l’écran d’origine (accueil, Livres ou Mangas).
- **Vues enregistrées** : distinctes par bibliothèque (une vue Mangas est une vue Livres de catégorie manga, au schéma v2 existant) ; les anciennes vues v1 et v2 sont lues sans réécriture. Les noms restent uniques entre Livres et Mangas, ce que l’aide de création et le message d’erreur disent.
- **Transferts** : l’export unitaire JSON/CSV et l’import ciblent uniquement la bibliothèque ouverte. Un JSON de profil complet peut être exporté explicitement. « Remplacer » ne touche jamais l’autre bibliothèque ; aperçu, bilan et consentement précèdent toute écriture.

## Séries et Animation japonaise

Décision du 20 octobre 2026 : sept bibliothèques, sept tables dans l’unique base `sylloge.db` : `films`, `series`, `anime`, `books`, `mangas`, `games`, `artworks`. La migration 0020 recopie les fiches historiques avec leur identifiant et tous leurs champs, déplace citations et liens fournisseurs, puis les retire de leur ancienne table. Aucune bibliothèque ne partage plus la table d’une autre.

- **Reprise de l’existant** : toutes les fiches `animation` sont incluses, sans détection du pays ni requête fournisseur. Ce classement global est confirmé ; les exceptions peuvent être corrigées dans le champ Type de la fiche, qui déplace la même fiche vers l’autre table sans perte.
- **Navigation et accueil** : entrée, icône, compteur, onglet, bilan et rangées distincts. « Tout » reste l’union sans doublons. Recherche, vues, filtres, tri et position de retour indépendants ; retour depuis l’accueil préservé.
- **Création et modification** : pas de bascule de catégorie dans les bibliothèques ; la création manuelle ou TMDB hérite de la bibliothèque ouverte. Type reste modifiable sur une fiche existante, pour déplacer cette même fiche sans recréation.
- **Vues** : schéma v2 inchangé ; les anciennes vues `animation` deviennent des vues du médium `anime`, les vues manga du médium `mangas`. Les noms redeviennent propres à chaque bibliothèque.
- **Transferts et association** : document JSON en version 4, avec une section par bibliothèque de base et une liste `customLibraries`. Export, import, « Tout associer » et « Remplacer » portent sur la bibliothèque ouverte. Les fichiers v1 à v3 restent lisibles.

## Bibliothèques personnalisées

Décision du 22 octobre 2026 : des modèles prêts s’ajoutent aux sept bibliothèques de base. Huit modèles : Comics, Magazines, Livres audio, Musique, Podcasts, Documentaires et reportages, Spectacles, Jeux de société.

- **Barre latérale** : les bibliothèques ajoutées suivent Art dans le groupe « Ajoutées », dans l’ordre d’ajout, avec icône et compteur. Le dernier item, « Ajouter une bibliothèque » (« + » en rail), ouvre le catalogue. Au premier lancement, seuls les sept modèles de base sont présents ; les autres restent dans le catalogue tant qu’ils ne sont pas ajoutés.
- **Catalogue** : fenêtre commune (`AccessibleDialog`, grande), modèles rangés par famille (Lecture, Écoute, Écran, Scène, Jeu) en cartes sur deux colonnes : icône, nom, description d’une ligne ou deux, état « Ajouter » ou « Ajoutée ». Un clic ajoute la bibliothèque et l’ouvre.
- **Bibliothèque** : même en-tête et même grille que les autres. Barre d’outils : recherche en pilule (titre, créateur et champs propres), pastilles de statut aux libellés du modèle, puis à droite le filtre principal du modèle (format, type, périodicité) et le tri. Pas de vues enregistrées dans ce premier lot. La suppression de la bibliothèque est une icône discrète de l’en-tête ; sa confirmation annonce le nombre de fiches supprimées.
- **Visuels** : affiche 2:3 pour Comics, Magazines, Documentaires et Spectacles ; carré pour Musique, Livres audio, Podcasts et Jeux de société, en grille, en fiche et dans le formulaire.
- **Fiche et formulaire** : même gabarit que les autres médiums. Statuts propres au modèle (Spectacles : « À voir » et « Vu » seulement), progression quand le modèle en a une, date de fin, champs propres sur deux colonnes, résumé ; citations pour Comics seulement.

## Barre latérale Îlot

Direction validée par Aurélien le 22 octobre 2026 : panneau flottant monochrome, détaché du bord de 10px, rayon 20px et ombre thémée. Rail de 62px (40px utiles), panneau ouvert de 236px. Accueil, groupe Bibliothèques (les sept de base), groupe Ajoutées, « + », profil, épingle et Paramètres.

- **Ouverture temporaire** : survol après 140ms ; fermeture 220ms après la sortie. Le panneau s’ouvre par-dessus la page, sans déplacer son contenu. Le focus clavier affiche également les noms ; Échap referme l’ouverture temporaire.
- **Épingle** : « Garder ouverte » réserve la largeur du panneau. « Détacher la barre » rend le rail. Choix mémorisé sur cet appareil (`sylloge-sidebar-pinned`), hors sauvegarde de profil. Paramètres conserve sa navigation dédiée, toujours déployée.
- **Alignement** : les icônes occupent un emplacement fixe de 40px ; SVG en bloc, 20px, centrés dans le même emplacement dans les deux modes. Les noms et compteurs apparaissent en fondu. Indicateur actif carré arrondi en rail, rangée arrondie en mode ouvert.
- **Mouvement** : 260ms, courbe `cubic-bezier(.23,1,.32,1)`, neutralisé en mouvement réduit. La liste centrale peut défiler si toutes les bibliothèques sont ajoutées ; profil et commandes restent accessibles en pied.
- **Pictogrammes** : tracés Phosphor sous licence MIT (copiés localement, aucune dépendance), versions régulière et pleine pour la destination active. Animation japonaise utilise un dessin original de cellulos superposés et un signe de lecture, sans étoile. Attribution dans `docs/licenses/phosphor-icons.txt`.
