# Exports vers les services

État vérifié le **30 octobre 2026**. Aucun compte n’a été créé, aucun fichier n’a été envoyé à un
service, aucun appel réseau n’a été fait depuis Sylloge. Les formats ci-dessous viennent de la
documentation officielle de chaque service, relevée dans la matrice d’échanges
(`matrix.md`, contrôle du 30 octobre 2026) ; les niveaux de preuve sont ceux de cette matrice.

## Où l’export se trouve

Le bouton **Exporter** d’une bibliothèque ouvre une fenêtre en deux groupes :

1. **Sauvegarde complète** — JSON Sylloge (copie réimportable) et CSV Sylloge (tableur). Toujours
   disponibles, pour les sept bibliothèques.
2. **Exporter vers un service** — un fichier au format d’import exact de chaque service proposé pour
   la bibliothèque ouverte, avec une ligne d’aide (ce que le fichier contient) et un lien vers la
   page d’import officielle du service.

Le second groupe n’apparaît que pour la bibliothèque ouverte, jamais pour « Tout le profil » : un
fichier de service ne contient qu’un médium. **Jeux** et **Art** n’ont aucun service : ils gardent la
sauvegarde complète seule.

| Bibliothèque | Services proposés, dans l’ordre |
|---|---|
| Films | Letterboxd · films vus, Letterboxd · liste à voir, SensCritique · films, Simkl · films |
| Séries | SensCritique · séries, Simkl · séries |
| Animation japonaise | Simkl · animés |
| Livres | Pour The StoryGraph (format Goodreads), Hardcover |
| Mangas | Pour The StoryGraph (format Goodreads) |
| Jeux, Art | Aucun |

## Formats livrés

### SensCritique — films et séries

- **Source** : billet officiel du 25 mars 2025,
  <https://www.senscritique.com/l-edito/post/comment_importer_ses_notes_sur_senscritique> ; la page
  d’import est <https://www.senscritique.com/parametres/compte> (section « importation de
  collection »). Preuve : **officiel**.
- **En-tête exact**, sept colonnes, dans cet ordre :
  `universe,title,release_date,rating,is_wishlisted,is_recommended,is_done`.
- `universe` : `movie` pour Films, `tvshow` pour Séries. `release_date` : année sur quatre chiffres.
  `rating` : entier de 1 à 10. Les trois derniers drapeaux valent `true` ou `false`.
- **Correspondances** : `is_done` ← statut « terminé » / « vue » ; `is_wishlisted` ← « à découvrir »
  / « à voir » ; `is_recommended` ← coup de cœur. Aucun identifiant : SensCritique apparie sur le
  titre et l’année.
- **Écart assumé** : « en attente », « abandonné », « en cours » et « abandonnée » n’existent pas
  dans ce schéma. Ces fiches partent avec les trois drapeaux à `false`, et le bilan les compte.
- **Séries sans année** : Sylloge ne stocke pas d’année pour une série ; `release_date` reste vide au
  lieu d’être inventée, et le bilan l’annonce (« Sans année : n séries »).

### Simkl — films, séries, animés

- **Source** : modèle officiel <https://simkl.com/ajax/apps/import-data.csv>, décrit sur
  <https://simkl.com/apps/import/csv> (5 Mo maximum, colonnes facultatives). Preuve : **officiel**.
- **En-tête exact**, treize colonnes :
  `simkl_id,TVDB_ID,TMDB,IMDB_ID,MAL_ID,Type,Title,Year,LastEpWatched,Watchlist,WatchedDate,Rating,Memo`.
- `Type` : `movie`, `tv`, `anime`. `Watchlist` : `completed`, `plan to watch`, `on hold`, `dropped`,
  `watching`. `WatchedDate` : `JJ-MM-AAAA`. `Rating` : 1 à 10. `Memo` : l’avis.
- **TMDB** : identifiant du film quand il est associé à TMDB ; pour une série ou un animé, le lien
  fournisseur (`media_provider_links`) est relu au moment de l’export. Un identifiant non numérique
  n’est jamais écrit.
- **Ce qui reste vide, volontairement** :
  - `LastEpWatched` : Sylloge compte des saisons, jamais des épisodes. Écrire un numéro d’épisode
    inventé ferait croire à une progression fausse chez Simkl ; le bilan dit combien de fiches ont
    une progression non transmise.
  - `WatchedDate` pour les séries et les animés : aucune date de visionnage par épisode n’est
    stockée.
  - `Year` pour les séries et les animés : pas d’année dans le modèle.
  - `TVDB_ID`, `IMDB_ID`, `MAL_ID`, `simkl_id` : aucun n’est stocké.

### The StoryGraph — livres et mangas, au format Goodreads

- **Source** : <https://thestorygraph.freshdesk.com/support/solutions/articles/79000146300-bulk-import-template>,
  import sur <https://app.thestorygraph.com/import-goodreads>. Preuve : **officiel**. C’est le seul
  format d’import en masse accepté par The StoryGraph ; BookWyrm lit le même fichier.
- **En-tête Goodreads complet**, 31 colonnes dans l’ordre officiel (voir
  `GOODREADS_HEADER` dans `src/domain/storyGraphExport.ts`).
- **Colonnes obligatoires pour The StoryGraph, garanties sur chaque ligne** : `Title`, `Author`,
  `My Rating` (`0` quand le livre n’est pas noté), `Date Added` (`AAAA/MM/JJ`), `Exclusive Shelf`,
  `Read Count`.
- **Étagères** : `read` (lu), `currently-reading` (en cours), `to-read` (à lire), `did-not-finish`
  (abandonné, accepté par The StoryGraph).
- **Ce qui reste vide** : `Book Id`, `ISBN`, `ISBN13` (Sylloge n’en stocke aucun), `Author l-f`
  (inversion des noms peu fiable), `Additional Authors`, `Average Rating` (moyenne communautaire,
  jamais la note personnelle), `Date Read` (aucune date de fin de lecture), `Bookshelves` (pas
  d’étiquette), `Owned Copies`, `Private Notes`.
- **Goodreads lui-même est exclu** : son import exige un ISBN par livre (« Files with only titles and
  authors can’t be imported »). Le libellé du bouton et le bilan le disent ; le fichier n’est jamais
  présenté comme importable dans Goodreads.

### Hardcover — livres

- **Source** : schéma d’import personnalisé <https://hardcover.app/pages/custom-csv-import-format>,
  page d’import <https://hardcover.app/account/imports>. Preuve : **officiel**.
- **En-tête exact**, 28 colonnes :
  `Title,Author,Status,Privacy,Hardcover Book ID,Hardcover Edition ID,ISBN 10,ISBN 13,ASIN,Media,Country Code,Language Code,Binding,Pages,Duration in Seconds,Publish Date,Publisher,Genres,Moods,Tags,Content Warnings,Lists,Date Added,Date Started,Date Finished,Rating,Review,Review Contains Spoilers`.
- `Status` : `Want to Read`, `Currently Reading`, `Read`, `Did Not Finish Read`. `Media` : `Book`.
  `Rating` : 0,5 à 5 par demi-point, **sans arrondi** (l’échelle de Sylloge est la même).
  `Date Added` et `Date Started` : `AAAA-MM-JJ`.
- **Ce qui reste vide** : les cinq colonnes d’identifiants (ISBN 10/13, ASIN, Hardcover Book ID,
  Hardcover Edition ID) — aucun ISBN n’est stocké et Hardcover ne l’exige pas ; `Date Finished`
  (Sylloge ne date pas la fin de lecture) ; `Tags`, `Lists`, `Genres`, `Moods`, `Publisher`, `Pages`.
- La colonne `Series` figure dans la liste de champs publiée mais **pas** dans la ligne d’en-tête du
  modèle : elle n’est pas écrite, et Sylloge n’a de toute façon pas de nom de série pour un livre.

### Letterboxd — films (existant, vérifié)

- Format inchangé (`src/domain/letterboxdExport.ts`) : `tmdbID,Title,Year,Directors,Rating,WatchedDate,Review`
  pour les films vus, `tmdbID,Title,Year,Directors` pour la liste à voir.
- **Limite 1 Mo** : le fichier est coupé en parties sous 950 000 octets, en-tête répété dans chaque
  partie ; aucun nom de fichier ne dépasse la limite. Vérifié par
  `scripts/letterboxd-export.test.mjs` et par le test navigateur.
- **Trakt** : l’annonce officielle du 1er novembre 2024 (« Import from IMDB, Letterboxd, TV Time, CSV,
  or JSON files », forum Trakt) fait du fichier Letterboxd un format que Trakt accepte. L’aide du
  bouton le dit ; aucun fichier Trakt propre n’est produit.

## Règles d’arrondi des notes

| Service | Échelle | Règle appliquée | Perte |
|---|---|---|---|
| SensCritique | entier 1–10 | note × 2, arrondie au demi-point le plus proche puis bornée à 1–10 (4,5 → 9) | une demi-étoile devient un point : rien ne se perd sur une note par demi-point |
| Simkl | 1–10 | même règle | aucune sur une note par demi-point |
| The StoryGraph / Goodreads | entier 0–5 | arrondi à l’entier le plus proche, **demi-points vers le haut** (4,5 → 5, 3,5 → 4) ; 0 = non noté | une demi-étoile est perdue ; le bilan compte les notes arrondies |
| Hardcover | 0,5–5 par 0,5 | aucune conversion | aucune |

Une note absente n’est **jamais** écrite `0` là où le barème commence à 1 (SensCritique, Simkl) : la
cellule reste vide. Dans le format Goodreads, `0` est au contraire obligatoire et signifie « non
noté ».

## Ce qui ne part pas, et pourquoi

- **Favoris** : Letterboxd, The StoryGraph et Hardcover n’ont pas de colonne favori. Seul
  SensCritique les transporte (`is_recommended`). Le bilan compte les coups de cœur non transmis.
- **Citations** (Livres, Mangas) : aucun de ces formats n’a de colonne citation.
- **Dates de fin de lecture** : Sylloge ne les stocke pas (`Date Read`, `Date Finished` restent vides).
- **Progression** : Simkl attend un dernier épisode, Sylloge compte des saisons ; The StoryGraph ne
  porte aucune progression pour un manga.
- **Identifiants absents du modèle** : pas d’ISBN, pas d’IMDb, pas d’ID MyAnimeList. Conséquence
  directe : Goodreads, Babelio et MyAnimeList ne sont pas proposés.

## Services écartés

| Service | Raison |
|---|---|
| Goodreads | Import exige un ISBN par livre ; Sylloge n’en stocke aucun. Le fichier produit est celui de The StoryGraph, et l’aide le dit. |
| Trakt | Format d’import non publié (JSON expérimental) ; l’export Letterboxd, explicitement accepté par Trakt, couvre le besoin. |
| MyAnimeList, AniList, Kitsu, Anime-Planet | Import par identifiants MAL/AniDB ou XML MAL ; Sylloge n’a pas d’ID MAL. |
| Babelio, Gleeph, LibraryThing | Import par ISBN ou EAN. |
| TV Time, Serializd, JustWatch, Plex, Jellyfin | Service arrêté ou aucun échange de fichier de suivi. |
| Backloggd, Grouvee, HowLongToBeat, Infinite Backlog, Steam, GG, RAWG, BoardGameGeek | Jeux : aucun import de fichier documenté chez ces services (ou format non publié). |
| BetaSeries | CSV d’export réel mais schéma non publié, et aucun import de fichier côté service. |
| Last.fm, RateYourMusic | Aucun import de fichier. |

## Vérifications

- `npm run test:services` : 37 tests Node (`letterboxd-export.test.mjs`, `service-exports.test.mjs`),
  dont 26 pour les quatre nouveaux formats : en-tête exact, une ligne par œuvre, correspondances de
  statut, notes converties, échappement CSV, ordre, bilan.
- `npm run verify` inclut ces tests.
- Recette navigateur `scripts/qa-exports-services.js` (harnais `qa-app.html`, SQLite en mémoire) :
  79 points de contrôle — services proposés par bibliothèque, liens officiels, fichiers relus ligne
  par ligne contre la bibliothèque, bilan affiché, Jeux et Art sans service, anglais, et preuve de
  mutation (un lien fournisseur ajouté remplit la colonne `TMDB` du fichier Simkl suivant).
- Aucun de ces fichiers n’a été importé chez un service : la preuve s’arrête aux colonnes et aux
  valeurs, jamais à l’acceptation par le service.
