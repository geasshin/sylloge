# Moteur des imports tiers — contrat d’intégration

## API pure

Module : `src/domain/thirdPartyImport.ts`. Il ne lit aucun fichier, ne contacte aucun fournisseur, ne décompresse aucune archive et n’écrit aucune donnée.

```ts
recognizeThirdPartyImport(input): ThirdPartyImportRecognition | null
previewThirdPartyImport(input, targetLibrary, importedAt?, options?): ThirdPartyImportPreview | null
```

`input` accepte directement un `PickedAnyImportFile` du sélecteur natif, ou `{ name: string, contents: string }`. Les types sont structurels pour ne pas faire dépendre le domaine du pont Tauri. `targetLibrary` est l’une des sept bibliothèques (`films`, `series`, `anime`, `books`, `mangas`, `games`, `artworks`).

- `null` signifie **aucune signature de service prise en charge** : poursuivre vers le parcours JSON/CSV générique existant, sans prétendre reconnaître le service.
- Une reconnaissance n’est **pas** une validation. Un service reconnu dans la mauvaise bibliothèque renvoie un aperçu bloqué, pas un CSV générique.
- `items === null` ou `errors.length > 0` interdit d’alimenter un plan d’écriture. Aucune sélection partielle des lignes valides n’est faite.
- `mapping` décrit le préréglage proposé ; `ignoredColumns`, `warnings` et `duplicateTitles` doivent être visibles avant le choix final. Le préréglage ne vaut ni consentement à fusionner, ni consentement à remplacer.
- Les `items` sont des `Film[]` ou `Book[]` compatibles avec les fonctions existantes `prepareFilmsImport` / `prepareBooksImport`. Le profil et les identifiants sont ceux de l’aperçu ; l’écriture existante les régénère.
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

## Bornes et limites

Le moteur texte refuse les NUL et les sources reconnues dépassant 16 Mio avant conversion des lignes. La lecture des octets UTF-8 et les protections ZIP (taille compressée, volume décompressé, entrées, chemins, chiffrement, liens, profondeur) restent celles du sélecteur Rust et de `CONTRAT_CONTENEURS_IMPORT_V1.md` ; aucune nouvelle décompression JavaScript n’est introduite.

MyAnimeList XML/XML.gz, AniList, StoryGraph, TV Time et BetaSeries n’ont pas d’adaptateur spécifique dans ce module. Les CSV compatibles peuvent utiliser le mapping générique, sans garantie de reconnaissance du service. Aucun parseur XML n’étant ajouté, aucune expansion d’entité externe n’est exécutée ; ne pas annoncer un import MyAnimeList fonctionnel.

## Vérification et provenance

Commande dédiée, indépendante de `scripts/verify.mjs` :

```sh
node --test scripts/third-party-import.test.mjs
```

Fixtures dans `tests/fixtures/third-party-import/`. Elles sont **synthétiques**, construites à partir de colonnes et sémantiques publiques ; aucun export personnel réel ou anonymisé n’a été fourni. Voir leur README pour les sources et la limite de preuve. Ces tests prouvent les comportements exercés, pas la compatibilité exhaustive avec tous les exports actuels des services ni le parcours natif macOS de bout en bout.
