# Moteur des imports tiers — contrat d’intégration

## API pure

Module : `src/domain/thirdPartyImport.ts`. Il ne lit aucun fichier, ne contacte aucun fournisseur, ne décompresse aucune archive et n’écrit aucune donnée.

```ts
recognizeThirdPartyImport(input): ThirdPartyImportRecognition | null
previewThirdPartyImport(input, targetLibrary, importedAt?, options?): ThirdPartyImportPreview | null
```

`input` accepte directement un `PickedAnyImportFile` du sélecteur natif, ou `{ name: string, contents: string }`. Les types sont structurels pour ne pas faire dépendre le domaine du pont Tauri. `targetLibrary` est l’une des sept bibliothèques (`films`, `series`, `anime`, `books`, `mangas`, `games`, `artworks`).

Une reconnaissance porte `library` (destination principale) et `libraries` (toutes les bibliothèques que le service peut alimenter). IMDb accepte Films et Séries, Simkl Films, Séries et Animation japonaise ; les autres services n’alimentent qu’une bibliothèque. Un export reconnu déposé dans une bibliothèque hors de `libraries` renvoie un aperçu bloqué avec le conseil d’ouverture, jamais un repli générique.

- `null` signifie **aucune signature de service prise en charge** : poursuivre vers le parcours JSON/CSV générique existant, sans prétendre reconnaître le service.
- Une reconnaissance n’est **pas** une validation. Un service reconnu dans la mauvaise bibliothèque renvoie un aperçu bloqué, pas un CSV générique.
- `items === null` ou `errors.length > 0` interdit d’alimenter un plan d’écriture. Aucune sélection partielle des lignes valides n’est faite.
- `mapping` décrit le préréglage proposé ; `ignoredColumns`, `warnings` et `duplicateTitles` doivent être visibles avant le choix final. Le préréglage ne vaut ni consentement à fusionner, ni consentement à remplacer.
- Les `items` sont des `Film[]`, `Series[]` ou `Book[]` compatibles avec les fonctions existantes `prepareFilmsImport` / `prepareSeriesImport` / `prepareBooksImport`. Le profil et les identifiants sont ceux de l’aperçu ; l’écriture existante les régénère.
- `importedAt` est un horodatage UTC ISO, par défaut l’instant de préparation. Ce n’est jamais une date historique issue du service.

Exemple de branchement, **avant** de choisir un seul candidat de ZIP :

```ts
const recognition = recognizeThirdPartyImport(picked)
if (recognition !== null) {
  const preview = previewThirdPartyImport(picked, currentLibrary)
  // Afficher le service, les correspondances, fiches, avertissements et exclusions.
  // Bloquer si preview.items === null. Ne pas rétrograder silencieusement vers un autre parseur.
  // Sinon : choix explicite Fusionner / Remplacer, résolution des conflits,
  // puis confirmation finale avant les write*Import existants.
} else {
  // Parcours générique actuel, avec son mapping et son aperçu.
}
```

## Letterboxd

### CSV seuls

Signature : `Date`, `Name`, `Year`, `Letterboxd URI`, puis les colonnes de variante. Casse, ordre, BOM UTF-8 et fins de lignes CRLF sont acceptés.

- `ratings.csv` : `/5` par demi-points ; vide = sans note, **0 est invalide**, pas une note nulle déguisée. Le statut est terminé.
- `watched.csv` : terminé ; `watchlist.csv` : à découvrir. Leurs colonnes sont identiques : le nom est nécessaire pour les départager, **après** reconnaissance de la signature. Un CSV renommé est bloqué jusqu’au choix explicite `options.letterboxdList = 'watched' | 'watchlist'`.
- `diary.csv` et les colonnes `Watched Date` / `Review` : date de visionnage et avis exact, y compris espaces, guillemets et retours à la ligne.
- `Date` est une date d’activité, pas une date de visionnage. Elle ne devient jamais `watchedAt` ou une date de création locale.
- Les métadonnées Films externes (`Year`, URI, etc.) ne sont pas importées, conformément au contrat Films existant. Aucun lien Letterboxd n’est prétendu être un identifiant TMDB.
- Un doublon interne de titre bloque le CSV isolé plutôt que de jeter des lignes. Pour un journal avec plusieurs visionnages, importer le ZIP permet de conserver son historique dans la note personnelle.

### ZIP ou conteneur natif

Passer **l’objet entier** retourné par `pickImportAny`, pas un candidat sélectionné. Le moteur agrège `ratings.csv`, `watched.csv`, `diary.csv`, `watchlist.csv` et `reviews.csv` :

1. rapprochement par titre normalisé NFC/casse et année source, sans requête réseau ;
2. vérification des URI des instantanés Films (celles du journal ne sont pas des URI Films) ; un désaccord bloque au lieu de choisir arbitrairement ;
3. une fiche par film, statut terminé dès qu’un fichier atteste un visionnage ;
4. note courante de `ratings.csv` prioritaire, **y compris son absence de note** ; sinon, note du dernier visionnage explicite non contradictoire ;
5. date de visionnage la plus récente réellement présente ;
6. tous les avis distincts et un bloc `[Historique Letterboxd]` contenant les dates, notes, marqueurs de revisionnage et tags du journal, dans la note personnelle. Cela ne crée pas de faux historique natif dans Sylloge.

`sourceFiles` donne les fichiers traités et leur nombre de lignes ; `sourceRowCount` compte leurs lignes ; `totalItemCount` et `validItemCount` comptent les fiches agrégées. Une archive n’est donc pas présentée comme six films quand six lignes décrivent trois films.

Les fichiers sous `deleted/` sont exclus et signalés pour ne pas ressusciter des données supprimées. Profil, listes, likes et fichiers étrangers sont signalés comme non importés. Un fichier requis présent mais invalide, plusieurs instantanés du même nom, un export Goodreads mélangé, des notes contradictoires sans chronologie fiable ou plusieurs films différents de même titre bloquent tout l’aperçu. L’archive n’est pas une restauration complète du compte Letterboxd.

## Goodreads

Signature : `Book Id` (ou `BookID`), `Title`, `Author`, `My Rating`, `Exclusive Shelf` ; bibliothèque cible Livres, jamais Mangas par déduction d’une étagère.

- `read` → lu ; `currently-reading` → en cours ; `to-read` → à lire. Une étagère exclusive inconnue ou absente bloque, sans inventer de statut.
- `My Rating` : entier `/5`, 0 ou vide = sans note ; `Average Rating` n’est jamais une note personnelle.
- Titre, auteur et avis gardent leurs caractères exacts. `Year Published` devient l’année. `My Review` et `Private Notes` sont tous deux conservés, avec le séparateur explicite `[Notes privées Goodreads]` s’ils sont présents ensemble.
- Un livre `to-read` portant déjà une note ou un avis est bloqué : les formulaires Sylloge purgeraient ces champs avec ce statut. Le moteur ne choisit pas un autre statut à la place de la personne.
- `Date Read` n’est pas `startedAt`. `Date Added` n’est pas un début de lecture ni une création Sylloge. Ces dates restent dans le fichier source et sont signalées comme non importées.
- `Read Count` n’est pas un compteur de tomes ; les étagères ne deviennent pas des coups de cœur. ISBN, progression en pages, notes moyennes et autres colonnes sans correspondance sont annoncés comme non importés.

## Reconnaissance des services

| Service | Signature de contenu | Variante | Bibliothèques |
|---|---|---|---|
| Letterboxd | `Date`, `Name`, `Year`, `Letterboxd URI` | notes / journal / films vus / à voir / archive | Films |
| Goodreads | `Book Id`, `Title`, `Author`, `My Rating`, `Exclusive Shelf` | bibliothèque | Livres |
| The StoryGraph | `Title`, `Author`, `My Rating`, `Exclusive Shelf`, `Read Count`, **sans** `Book Id` | bibliothèque | Livres |
| IMDb | `const`, `You rated` ou `Your Rating`, `Title type`, `Title` | notes / liste à voir | Films, Séries |
| Simkl | `simkl_id`, `Watchlist`, `LastEpWatched`, `Type`, `Title` | CSV | Films, Séries, Animation japonaise |
| Hardcover | `Title`, `Author`, `Status`, `Rating` et au moins `Hardcover Book ID`, `Hardcover Edition ID` ou `Review Contains Spoilers` | bibliothèque | Livres |
| MyAnimeList | racine XML `<myanimelist>` | liste animé / liste manga | Animation japonaise, Mangas |

Le nom du fichier ne sert qu’à départager une variante ambiguë (Letterboxd `watched.csv`/`watchlist.csv`, IMDb `watchlist.csv`) ; il ne déclenche jamais une reconnaissance. Un en-tête proche mais incomplet retombe sur le parcours générique ou est rejeté : `const` sans colonne de note, `Title`/`Author`/`Rating` sans marqueur Hardcover, XML non MyAnimeList.

Règle de note commune aux sources /10 (IMDb, Simkl, MyAnimeList) : la note entière est divisée par deux, ce qui donne exactement un demi-point sur 5 ; une valeur décimale ou hors 1–10 bloque la ligne. Une note 0 signifie « non noté » chez Simkl et MyAnimeList ; chez IMDb, 0 est invalide.

## IMDb

Signature : `const` (`tt…`), une colonne `You rated` ou `Your Rating`, `Title type` et `Title`. Les en-têtes récents (`Const`, `Your Rating`, `Title Type`) sont acceptés par la normalisation de casse.

- `Title type` sépare les médiums : `Feature Film`, `Movie`, `TV Movie`, `Short`, `Video`, `TV Special` → Films ; `TV Series`, `TV Mini Series` → Séries ; `TV Episode` → ignoré et compté. Les autres types (`Video Game`, etc.) sont ignorés, groupés et nommés dans l’aperçu.
- Un fichier déposé dans Films importe les films et compte les séries ignorées (« 12 séries ignorées : importez-les depuis la bibliothèque Séries. ») ; dans Séries, l’inverse. Les épisodes sont toujours ignorés avec leur décompte.
- `You rated` / `Your Rating` : entier 1–10, converti sur 5 par demi-points. Une liste à voir (`watchlist.csv`) n’a aucune note et donne le statut à découvrir / à voir.
- `created` est la date de notation, **jamais** une date de visionnage : `watchedAt` reste vide et l’aperçu l’explique.
- Le contrat Films existant n’importe pas les métadonnées externes : `Year`, `Directors`, `URL` et l’identifiant IMDb ne sont pas repris (Sylloge ne stocke pas d’identifiant IMDb). Aucune donnée n’est inventée à leur place.

## The StoryGraph

Signature : en-tête Goodreads sans `Book Id`, avec `Title`, `Author`, `My Rating`, `Exclusive Shelf` et `Read Count`. Le parseur Goodreads est réutilisé, avec une étagère supplémentaire : `did-not-finish` → abandonné. `read` → lu, `currently-reading` → en cours, `to-read` → à lire. `My Rating` reste un entier 0–5 ; 0 ou vide = sans note. Les règles Goodreads sur les dates (`Date Read`, `Date Added` non importées), les notes privées, les doublons de titre et le blocage d’un « à lire » déjà noté s’appliquent à l’identique.

## Simkl

Signature : `simkl_id`, `Watchlist`, `LastEpWatched`, `Type`, `Title` (en-tête officiel du modèle CSV). `Type` répartit les lignes : `movie` → Films, `tv` → Séries, `anime` → Animation japonaise. Un fichier mixte est accepté ; seules les lignes du médium ouvert sont importées, les autres sont comptées et nommées. Un fichier sans ligne pour la bibliothèque ouverte est bloqué.

| Simkl `Watchlist` | Films | Séries / Animation |
|---|---|---|
| `completed` | terminé | vue |
| `plan to watch` | à découvrir | à voir |
| `dropped` | abandonné | abandonnée |
| `watching` | en attente (avertissement) | en cours |
| `on hold` | en attente (avertissement) | en cours (avertissement documenté) |

- `Rating` : entier 1–10 → /5 par demi-points ; 0 ou vide = sans note.
- `Memo` devient la note personnelle. `WatchedDate` remplit la date de visionnage d’un film : `JJ-MM-AAAA` avec tirets, `MM/JJ/AAAA` avec barres obliques, date calendaire validée.
- `LastEpWatched` n’est pas converti en saisons : Sylloge compte des saisons, pas des épisodes. La progression et la date du dernier épisode sont signalées comme non importées pour les séries et animés.
- `Year`, les identifiants Simkl/TMDB/TVDB/IMDb/MAL et `MAL_ID` ne sont pas repris.

## Hardcover

Signature : `Title`, `Author`, `Status`, `Rating` et au moins une colonne propre à Hardcover (`Hardcover Book ID`, `Hardcover Edition ID` ou `Review Contains Spoilers`). C’est le format d’import personnalisé **documenté** ; le format exact de l’export CSV Hardcover n’est pas publié, donc un export différent retombe sur le mapping générique.

- `Status` (insensible à la casse) : `Want to Read` → à lire, `Currently Reading` → en cours, `Read` → lu, `Did Not Finish Read` → abandonné. `None` ou une valeur inconnue bloque, sans statut inventé.
- `Rating` : 0,5 à 5 par demi-points. `Date Started` devient le début de lecture ; `Publish Date` fournit l’année après les quatre premiers chiffres. `Review` devient la note personnelle.
- `Date Finished` et `Date Added` ne sont pas importées (aucun champ de fin ou de création) ; ISBN, ASIN, pages, genres et listes sont annoncés comme non repris.

## MyAnimeList XML

Signature : racine `<myanimelist>` ; les entrées sont des enfants `<anime>` ou `<manga>`. `user_export_type` 1/2 et les balises d’entrée départagent la variante. Le sélecteur natif accepte désormais `.xml` ; un `.xml.gz` doit être décompressé avant l’import, car le projet ne décompresse pas gzip.

- Lecteur XML borné écrit dans le domaine : éléments et texte uniquement, attributs ignorés, CDATA conservé, entités prédéfinies et numériques décodées. `DOCTYPE` et toute entité externe sont refusés avant toute résolution ; profondeur limitée à 32 et 200 000 nœuds, en plus de la borne de 16 Mio du moteur.
- Statuts : `Watching`/`Reading` → en cours, `Completed` → vue (animé) ou lu (manga), `On-Hold` → en cours, `Dropped` → abandonnée/abandonné, `Plan to Watch`/`Plan to Read` → à voir/à lire. Un statut inconnu bloque.
- `my_score` : 0 ou vide = sans note ; 1–10 → /5 par demi-points.
- `my_start_date` devient le début (visionnage ou lecture) ; `0000-00-00` et vide restent vides. `my_finish_date` n’a pas de champ cible et n’est pas inventé.
- `my_comments` devient la note personnelle. `my_watched_episodes` n’est pas converti en saisons ; `my_read_chapters` n’est pas repris ; `my_read_volumes` remplit les tomes lus d’un manga **en cours**. Pour un manga terminé, le total de tomes n’est pas connu : les tomes lus ne sont pas repris plutôt que d’inventer un total.
- Les identifiants MAL ne sont pas stockés. Un fichier contenant à la fois des entrées anime et manga est bloqué (les deux listes s’exportent séparément).

## Bornes et limites

Le moteur texte refuse les NUL et les sources reconnues dépassant 16 Mio avant conversion des lignes. La lecture des octets UTF-8 et les protections ZIP (taille compressée, volume décompressé, entrées, chemins, chiffrement, liens, profondeur) restent celles du sélecteur Rust et de `CONTRAT_CONTENEURS_IMPORT_V1.md` ; aucune nouvelle décompression JavaScript n’est introduite.

Le XML MyAnimeList est lu par le petit lecteur décrit ci-dessus, sans DOMParser et sans expansion d’entité externe. Grouvee n’a pas d’adaptateur : aucun en-tête d’export exact n’a été vérifié, donc aucun format n’a été supposé. Trakt (ZIP JSON), AniList (JSON), SensCritique (CSV de support) et BoardGameGeek restent hors périmètre.

## Vérification et provenance

Commande dédiée, indépendante de `scripts/verify.mjs` :

```sh
node --test scripts/third-party-import.test.mjs
```

Fixtures dans `tests/fixtures/third-party-import/`. Elles sont **synthétiques**, construites à partir de colonnes et sémantiques publiques ; aucun export personnel réel ou anonymisé n’a été fourni. Voir leur README pour les sources et la limite de preuve. Ces tests prouvent les comportements exercés, pas la compatibilité exhaustive avec tous les exports actuels des services ni le parcours natif macOS de bout en bout.
