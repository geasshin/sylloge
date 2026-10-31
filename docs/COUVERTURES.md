# Couvertures, affiches et visuels

Un visuel est **l'adresse d'une image**, jamais un fichier. Sylloge n'en télécharge, n'en copie et n'en
stocke aucun : l'application affiche l'image depuis son lien, et la base ne garde que ce lien. La base
reste légère, la sauvegarde JSON aussi.

## Où est le lien

| Bibliothèque | Colonne | Modifier |
| --- | --- | --- |
| Films | `films.poster_url` | crayon sur l'affiche, dans la fiche et dans le formulaire |
| Séries, Animation japonaise | `poster_url` | idem |
| Livres, Mangas | `cover_url` | idem |
| Jeux | `cover_url` | idem |
| Art | `image_url` | idem |
| Bibliothèques personnalisées (dont Recettes) | `cover_url` | idem |
| Films, Séries, Animation japonaise, Jeux | `banner_url` (bannière 16:9) | bouton crayon du bandeau |

Le crayon ouvre un dialogue d'adresse commun : champ, **aperçu de l'image avant d'enregistrer**, message
si l'adresse ne mène pas à une image. Un champ vidé retire le lien. Seules les adresses `http://` et
`https://` sont acceptées (contrôle dans le dialogue, dans le formulaire et dans le dépôt).

## Films : un lien personnel passe devant TMDB

Un film associé à TMDB a trois sources possibles : la colonne locale `films.poster_url` (ce que la
personne a collé), le choix fait dans la galerie TMDB (`selected_poster_url` du cache) et l'affiche
principale du fournisseur. Une seule règle, `src/domain/filmPoster.ts`, sert la fiche, le formulaire,
l'accueil et les cartes :

1. un **lien personnel** : une adresse http(s) ni hébergée par `image.tmdb.org`, ni connue du cache ;
2. sinon le choix de la galerie ;
3. sinon l'affiche principale du fournisseur ;
4. sinon la colonne locale.

Le critère « lien personnel » évite une colonne supplémentaire et laisse les fiches existantes se comporter
comme avant : leur adresse locale est une affiche TMDB recopiée à la création.

### Pourquoi le lien vit dans la fiche et pas dans le cache TMDB

- La commande native `set_film_tmdb_poster` **refuse** toute affiche absente du cache TMDB, et tout film
  sans association. Un lien collé par là échouait.
- Le cache expire et n'entre pas dans la sauvegarde JSON, alors que `films.poster_url` y entre.
- Choisir une affiche dans la galerie écrit aussi l'adresse de la fiche : ce que l'on voit est ce qui est
  enregistré, et un ancien lien personnel ne masque jamais un choix plus récent.

### Défauts corrigés le 23 octobre 2026

- Une fiche associée sans affiche locale affichait « Sans affiche » dans le formulaire alors que la fiche
  détail montrait l'affiche : le formulaire ne lisait que le choix explicite de la galerie.
- Le crayon du formulaire ne faisait rien : le dialogue d'adresse n'était pas monté en mode intégré, qui est
  celui de l'application.
- La tuile « + » de la galerie envoyait le lien à la commande TMDB, qui le refusait.

## Le visuel change sur la fiche, la grille suit (25 octobre 2026)

Signalé par Aurélien sur un livre : un visuel remplacé au crayon de la fiche s'affichait bien dans la fiche,
mais la carte de la bibliothèque gardait l'ancien — Séries, Animation japonaise, Livres, Mangas, Jeux et Art.

**Cause.** Chaque bibliothèque n'affiche pas la collection tenue en mémoire mais le résultat de sa propre
requête SQLite (`seriesSearchState`, `bookSearchState`, `gameSearchState`, `artworkSearchState`). Les
écritures faites depuis une fiche — crayon du visuel, association à un fournisseur — mettaient à jour la
base et la collection maître sans invalider cette requête : la grille gardait la ligne lue avant l'écriture.
Les formulaires d'ajout et de modification, eux, relançaient déjà la requête ; les fiches ne le faisaient
pas. Films n'était pas touché : sa grille lit directement la collection maître.

**Correctif.** `refreshLibraryQuery(médium)` dans `src/main.tsx` invalide la requête de la bibliothèque
concernée après l'écriture, aux sept endroits qui écrivaient depuis une fiche (visuel Séries, Livre, Jeu,
Art ; association TMDB Séries, Open Library Livre, IGDB Jeu).

## Le visuel dans la fiche (30 octobre 2026)

La fiche pose le visuel dans sa colonne gauche de 380 px : affiche 2:3 (Films, Séries, Livres, Mangas), carré pour un modèle à couverture carrée, 4:3 pour la photo d'une recette. Le crayon reste dans le visuel (`poster-edit-overlay`). L'affiche cède de la largeur quand la fenêtre manque de hauteur (`--detail-visual-height`, `62vh`) plutôt que de pousser le statut et la note sous la ligne de flottaison. Pour l'Art, le visuel garde le format réel de son image dans la scène de la fiche (voir `DESIGN.md`, « Art éditorial »).

La bannière 16:9 est un second visuel, distinct : elle vit au-dessus des deux colonnes, pleine largeur (`DetailLayout`, emplacement `banner`). Sans bannière, rien n'est rendu en haut et le bouton d'ajout prend place dans la barre d'actions ; avec une bannière, le crayon est dans le bandeau et la colonne gauche cesse d'être collante pour ne jamais passer sous l'image en défilant.

## Bannières 16:9 (30 octobre 2026)

Films, Séries, Animation japonaise et Jeux portent une image de fond, distincte de
l’affiche : `banner_url` (migration 0026), une adresse d’image paysage et jamais un
fichier. **Aucune bannière par défaut** : sans choix, la fiche n’affiche aucun bandeau.
Les livres, les mangas, l’Art et les bibliothèques personnalisées ne sont pas concernés.

- Le bouton du bandeau ouvre `BannerDialog` : les images officielles du fournisseur en
  vignettes 16:9, un champ « Adresse de l’image » avec aperçu recadré, et « Retirer la
  bannière ». Rien n’est retenu avant « Enregistrer » ; fermer abandonne.
- **Où vit la commande.** Une fiche qui a déjà une bannière montre `DetailBanner` en tête,
  pleine largeur, avec le crayon « Modifier la bannière » dans son coin. Une fiche qui n’en
  a pas n’affiche rien en haut : un bouton discret « Ajouter une bannière » (crayon et
  libellé, au gabarit des actions) se place dans sa barre d’actions, entre « Associer » et
  « Supprimer », pour rester découvrable sans casser la colonne. Les livres, les mangas,
  l’Art et les bibliothèques ajoutées n’ont ni bandeau ni bouton.
- Les images officielles viennent de la commande native `fetch_banner_candidates` :
  décors TMDB pour un film (`/movie/{id}/images`), une série ou un animé
  (`/tv/{id}/images`) ; illustrations puis captures IGDB pour un jeu (requête `games`
  sur `artworks` et `screenshots`). La fenêtre ne joint aucun service : tout passe par
  Rust et le relais du projet. Sans identifiant fournisseur, elle le dit et laisse
  seulement coller une adresse.
- Le tri et le filtrage sont purs (`src/domain/bannerImages.ts`, `npm run test:banners`) :
  paysage entre 1,6 et 2,0 de ratio, largeur ≥ 1 280, images sans texte d’abord puis la
  langue de l’interface, 24 candidats au plus. Une adresse collée est prévisualisée en
  16:9 ; un avertissement paraît si l’image est plus haute que large.
- `DetailBanner` affiche un bandeau de cinéma presque bord à bord (choix d’Aurélien,
  31 octobre 2026) : à 16 px de la barre latérale et du bord de la fenêtre, format 3:1, coins
  arrondis (16 px), 50 vh de haut au plus. L’image d’origine (16:9) est recadrée au centre — environ 40 % de sa
  hauteur ne se voient pas — sans perte de définition. Une image TMDB s’affiche toujours en définition
  d’origine (`original`, 1 920 px ou plus) : `bannerDisplayUrl()` relit aussi en `original`
  les bannières enregistrées en `w1280` avant le 30 octobre 2026, sans réécrire la base.
  Une image qui ne se charge plus laisse un bouton « Bannière introuvable · La remplacer ».
- Une bannière enregistrée est toujours `https://`, bornée à 2 048 caractères. Voir
  docs/PORTABILITE.md pour ce qu’elle devient dans une sauvegarde et dans un CSV.

## Vérifications

- `npm run test:covers` : la règle d'affichage, huit cas (fiche associée sans affiche locale, choix de la
  galerie, lien personnel, adresse TMDB oubliée par le cache, valeur invalide).
- `scripts/qa-covers.js` : parcours film complet (associé, non associé, galerie, annulation, adresse invalide,
  aperçu) puis le même geste dans les sept autres bibliothèques.
- `scripts/qa-detail-layout.js` : pour dix fiches (Films, Séries, Animation japonaise, Livres, Mangas, Jeux,
  Art paysage, Art portrait, poème, Recettes) à 1440 × 900, la colonne gauche (visuel, statut, note, carnet)
  tient sans défiler, l'Art est centré sous son mur, aucun débordement horizontal, les libellés de faits
  restent sur une ligne ; à 1000 × 760 une seule colonne ; thème sombre et anglais compris.
- `scripts/qa-work-cards.js` : pour les six bibliothèques qui lisent leur propre requête, le visuel changé
  depuis la fiche arrive dans la grille et la colonne est écrite ; puis la ligne de faits de chaque médium
  (signature, note ou année, coup de cœur, état, écart titre → faits ≤ 8 px, aucun débordement).
  La recette échoue bien sur l'ancien comportement : 22 px de vide sous un titre d'une ligne quand la
  hauteur de deux lignes est réservée.
- Le simulateur du harnais (`src/qa/appBridge.ts`) applique le contrat de la commande native ; un simulateur
  plus souple avait masqué le troisième défaut.
- `scripts/qa-banners.js` : la fenêtre de choix (candidats simulés filtrés et triés,
  sélection, adresse collée, avertissement image verticale, retrait), l’écriture dans
  `films.banner_url`, `series.banner_url`, `anime.banner_url` et `games.banner_url` relue
  en base, le bandeau rendu ou absent, l’état sans fournisseur, l’image en échec et
  l’anglais. La page `qa-app.html?demo=banners` monte le couple fenêtre + bandeau sur des
  lignes de fixtures, sans toucher aux fiches.
- `scripts/qa-banners-fiches.js` : dans de vraies fiches du harnais `scenario=full`,
  l’absence de bandeau et le bouton « Ajouter une bannière » dans la barre d’actions, la
  fenêtre et une image officielle simulée, l’écriture en base, le bandeau en tête, puis le
  retrait qui fait revenir le bouton — pour un Film, une Série, un Animé et un Jeu ; un
  Livre et une œuvre d’Art n’ont aucun bouton. Vérifie aussi qu’une fiche déjà pourvue
  (fixtures) affiche son crayon, et l’anglais.
- Non couvert : un lien réellement distant. Le harnais sert des images `picsum.photos` ; l'application native
  n'a pas été lancée pour ce lot.
