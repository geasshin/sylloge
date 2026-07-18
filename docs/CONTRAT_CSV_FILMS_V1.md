# Contrat CSV Films v1

**Statut :** normatif pour l’export CSV du jalon interne `0.3.1` et pour la réimportation contrôlée du CSV Sylloge Films v1 livrée au jalon `0.3.2`. Le format reste une représentation portable et lisible des données Films V1. La décision par source et par champ est dans [CONTRAT_FILMS_V1.md](CONTRAT_FILMS_V1.md).

## Encodage et structure

- Le fichier est encodé en UTF-8, sans BOM, avec une fin de ligne `CRLF` après chaque enregistrement, y compris le dernier.
- L'en-tête est unique, stable et ordonné exactement ainsi :

```text
format,version,exported_at,profile_id,profile_name,profile_created_at,profile_updated_at,film_id,film_profile_id,film_title,film_original_title,film_year,film_status,film_is_favorite,film_rating,film_watched_at,film_personal_note,film_director,film_summary,film_provider_name,film_provider_id,film_poster_url,film_created_at,film_updated_at
```

- Les cellules contenant une virgule, un guillemet double, `CR` ou `LF` sont entre guillemets doubles. Chaque guillemet double interne est doublé. Les autres cellules restent non entourées pour préserver la lecture directe.
- Les retours à la ligne présents dans un texte Film sont conservés à l'intérieur de leur cellule citée. Ils ne créent pas de Film supplémentaire.

## Protection contre les formules tableur

Avant l'échappement CSV, toute valeur texte de profil ou de Film dont le premier caractère significatif après des espaces ou caractères de contrôle ASCII est `=`, `+`, `-`, `@` ou une apostrophe reçoit exactement une apostrophe ASCII (`'`) en tête. Cette apostrophe force une lecture textuelle dans Excel et LibreOffice, y compris lorsque la cellule doit aussi être citée pour une virgule, un guillemet ou un retour à la ligne. Les nombres, booléens, cellules vides et métadonnées de format ne sont pas modifiés.

Cette convention v1 est réversible : une valeur source `=1+1` devient la cellule CSV `'=1+1`, tandis qu'une valeur source `'=1+1` devient `''=1+1`. Avec une tabulation source, `\t=1+1` devient `'<TAB>=1+1` : l'apostrophe est toujours ajoutée avant les caractères conservés. Après lecture de l’échappement CSV, l’import contrôlé retire exactement une seule apostrophe initiale de toute cellule texte qui en possède une. Ce retrait unique reconstitue exactement les valeurs source, y compris leurs espaces et caractères de contrôle initiaux.

## Métadonnées d'export et profil

Chaque ligne porte `format=sylloge-films-csv` et `version=1`. `exported_at` est l'horodatage UTC ISO 8601 de l'export. Les colonnes `profile_*` reprennent intégralement le profil source JSON v1, notamment `profile_name`, pour permettre la création explicitement nommée d'un nouveau profil lors de l’import contrôlé.

Un export sans Film contient malgré tout l'en-tête puis une ligne avec ses métadonnées et ses champs `profile_*`. Ses colonnes `film_*` sont toutes vides. Cette ligne représente un profil vide, non un Film incomplet.

## Champs Film et valeurs

Les colonnes `film_*` reprennent les champs Films JSON v1 sans les renommer sémantiquement :

| Colonnes | Type CSV | Règle JSON v1 |
| --- | --- | --- |
| `film_id`, `film_profile_id`, `film_title` | texte non vide | `id`, `profileId`, `title` |
| `film_original_title`, `film_personal_note`, `film_director`, `film_summary`, `film_provider_name`, `film_provider_id`, `film_poster_url` | texte ou cellule vide | `string` ou `null` |
| `film_year` | entier positif ou vide | `number` entier ou `null` |
| `film_status` | texte | une valeur Films v1 : `à découvrir`, `en attente`, `terminé`, `abandonné` |
| `film_is_favorite` | `true` ou `false` | booléen JSON v1 |
| `film_rating` | nombre décimal avec point ou vide | demi-points de `0.5` à `5`, ou `null` |
| `film_watched_at` | `AAAA-MM-JJ` ou vide | date calendrier ou `null` |
| `film_created_at`, `film_updated_at` | UTC ISO 8601 | horodatages Films v1 |

Une cellule vide pour un champ Film nullable représente `null`. Les chaînes facultatives vides exactes d'un export historique restent acceptées puis deviennent `null`, sans retirer de caractère à un texte non vide. `film_provider_name` et `film_provider_id` sont une paire atomique : une paire complète est conservée, une moitié absente ou vide devient `null` dans les deux cellules. Les champs obligatoires vides ou les colonnes inconnues ne seront jamais rendus valides implicitement.

`film_profile_id` est conservé pour refléter explicitement Films V1. Dans chaque ligne Film, il est égal à `profile_id`. Les identifiants source sont portables pour le contrôle, mais l’import contrôlé recrée les identifiants locaux comme l'import JSON v1 actuel.

## Compatibilité et limites

- JSON `sylloge-films` v1, ses snapshots et son import strict restent inchangés. La réimportation v1 préserve tous les champs à l'exception de la canonisation non destructive des chaînes facultatives vides et des provenances partielles historiques, documentée dans le contrat Films.
- Les lignes suivent l'ordre stable du profil courant fourni par le dépôt Films : titre SQLite `NOCASE`, puis date de création. Avec les mêmes données et le même horodatage, le CSV est déterministe.
- Toutes les valeurs exportées proviennent du profil et des Films courants. Le fichier ne contient pas de secret, de donnée téléchargée, de fichier image ni de nouvelle métadonnée externe. `film_poster_url` peut être vide et, lorsqu'il est renseigné, reste seulement l'URL déjà enregistrée : aucune affiche n'est téléchargée.
- L’import contrôlé reconnaît seulement l’en-tête exact et ordonné de ce contrat. Il valide toutes les lignes avant écriture, reconstitue le document Films JSON v1, crée un nouveau profil avec de nouveaux identifiants locaux et n’écrase jamais le profil ouvert.
- Le mapping CSV générique et l’archive ZIP Notion sont des parcours d’import séparés. Ils ne modifient pas cet en-tête, n’ajoutent aucun champ exporté, ne téléchargent aucune affiche et ne constituent pas une API ou une synchronisation.
