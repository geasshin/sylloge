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

## Vérifications

- `npm run test:covers` : la règle d'affichage, huit cas (fiche associée sans affiche locale, choix de la
  galerie, lien personnel, adresse TMDB oubliée par le cache, valeur invalide).
- `scripts/qa-covers.js` : parcours film complet (associé, non associé, galerie, annulation, adresse invalide,
  aperçu) puis le même geste dans les sept autres bibliothèques.
- Le simulateur du harnais (`src/qa/appBridge.ts`) applique le contrat de la commande native ; un simulateur
  plus souple avait masqué le troisième défaut.
- Non couvert : un lien réellement distant. Le harnais sert des images `picsum.photos` ; l'application native
  n'a pas été lancée pour ce lot.
