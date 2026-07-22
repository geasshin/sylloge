# Contrat CSV des collections V1

**Statut :** normatif pour les exports CSV unitaires Séries, Livres, Jeux et Art introduits au jalon interne `0.4.15` du train `0.5.0`. Le [contrat CSV Films v1](CONTRAT_CSV_FILMS_V1.md) reste inchangé afin de préserver sa réimportation historique.

## Portée et limites

Un CSV représente **une collection d’un seul médium** du profil courant. Il sert à lire et échanger un tableau ; il ne remplace pas l’export JSON `sylloge-library` v2 pour une sauvegarde ou une restauration fidèle des cinq collections.

Les fichiers n’incluent jamais la SQLite brute, le cache TMDB, une clé, une image téléchargée ou une donnée réseau. Les URL d’affiche, de couverture ou de visuel ne sont exportées que lorsqu’elles existent déjà dans la fiche locale.

L’import CSV de ces quatre médiums n’est pas encore promis par ce contrat : il appartient au jalon `0.4.16`, qui devra réutiliser ces en-têtes sans inventer de champ.

## Encodage et protections communes

- UTF-8 sans BOM ; fin de ligne `CRLF` après chaque enregistrement, y compris le dernier.
- Virgules, guillemets et retours à la ligne sont échappés selon CSV : une cellule les contenant est entourée de guillemets doubles ; les guillemets internes sont doublés.
- Pour éviter l’exécution de formules dans les tableurs, toute valeur textuelle dont le premier caractère significatif est `=`, `+`, `-`, `@` ou `'` reçoit une apostrophe ASCII initiale. Les nombres, booléens et métadonnées de format ne sont pas modifiés.
- Une collection vide produit quand même une ligne de profil, avec toutes les colonnes propres au médium vides. Elle n’invente aucune œuvre.

## Colonnes communes

Chaque ligne commence exactement par :

```text
format,version,exported_at,profile_id,profile_name,profile_created_at,profile_updated_at
```

`version` vaut `1`. `exported_at`, les dates de profil et les dates `*_created_at` / `*_updated_at` sont des horodatages UTC ISO 8601. Les identifiants source rendent le fichier lisible et traçable ; un futur import devra régénérer les identifiants SQLite locaux.

## Séries

- `format=sylloge-series-csv`
- Colonnes propres :

```text
series_id,series_profile_id,series_title,series_showrunner,series_casting,series_summary,series_category,series_status,series_rating,series_is_favorite,series_seasons_seen,series_seasons_total,series_progress_updated_at,series_started_at,series_poster_url,series_personal_note,series_created_at,series_updated_at
```

Les compteurs de saisons restent deux colonnes distinctes, ce qui conserve clairement la progression et le total connu.

## Livres

- `format=sylloge-books-csv`
- Colonnes propres :

```text
book_id,book_profile_id,book_title,book_author,book_year,book_summary,book_category,book_status,book_rating,book_is_favorite,book_volumes_read,book_volumes_total,book_progress_updated_at,book_started_at,book_cover_url,book_personal_note,book_quotes_json,book_created_at,book_updated_at
```

### Décision explicite sur les citations

`book_quotes_json` contient un **tableau JSON de chaînes**, dans l’ordre de lecture des citations. Cette cellule unique conserve les retours à la ligne, les virgules et les guillemets grâce au double échappement JSON + CSV. Exemple lisible :

```json
["Première citation","Seconde citation\navec retour à la ligne"]
```

Le CSV ne préserve volontairement ni les identifiants techniques des citations, ni leurs horodatages de création. Une future réimportation devra recréer ces identifiants, mais peut restituer exactement les textes et leur ordre. Le JSON reste le format de restauration fidèle de référence.

## Jeux

- `format=sylloge-games-csv`
- Colonnes propres :

```text
game_id,game_profile_id,game_title,game_developer,game_platform,game_year,game_status,game_rating,game_is_favorite,game_played_at,game_cover_url,game_personal_note,game_created_at,game_updated_at
```

`game_platform` reste une valeur textuelle libre, sans la transformer en catalogue fermé.

## Art

- `format=sylloge-artworks-csv`
- Colonnes propres :

```text
artwork_id,artwork_profile_id,artwork_title,artwork_artist,artwork_year,artwork_form,artwork_location,artwork_exhibition,artwork_status,artwork_is_favorite,artwork_discovered_at,artwork_image_url,artwork_personal_note,artwork_created_at,artwork_updated_at
```

Il n’existe volontairement aucune colonne `artwork_rating` : l’Art ne possède pas de note chiffrée dans Sylloge.
