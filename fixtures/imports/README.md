# Fixtures d’exports tiers par service

Ces fichiers sont **entièrement synthétiques**. Les œuvres, personnes, identifiants, notes et avis sont inventés ; ils ne proviennent d’aucun compte utilisateur et ne constituent pas un corpus d’exports réels anonymisés. Les en-têtes sont construits à partir de la documentation ou d’exemples publics cités dans `docs/IMPORT_GUIDES_SOURCES.md` et la matrice de recherche du 30 octobre 2026 ; les noms de fichiers et de colonnes ne sont pas une garantie de stabilité des services.

| Fichier | Service | Sémantique exercée |
|---|---|---|
| `imdb-ratings.csv` | IMDb | En-tête réel `const`/`You rated`/`Title type`, mélange films, série, épisode et téléfilm. |
| `imdb-watchlist.csv` | IMDb | Même en-tête sans note, nom `watchlist.csv` reconnu comme liste à voir. |
| `storygraph-export.csv` | The StoryGraph | Colonnes Goodreads sans `Book Id`, étagères read, did-not-finish, currently-reading et to-read. |
| `simkl-export.csv` | Simkl | En-tête officiel, trois médiums, cinq statuts, deux ordres de date, mémo avec guillemets. |
| `hardcover-export.csv` | Hardcover | Format d’import personnalisé documenté, quatre statuts, note par demi-points, dates et avis. |
| `myanimelist-anime.xml` | MyAnimeList | Racine `<myanimelist>`, CDATA avec `&`, cinq statuts anime, score 0 et dates `0000-00-00`. |
| `myanimelist-manga.xml` | MyAnimeList | Variante manga (`manga_mangadb_id`, `my_read_volumes`), statuts Completed/Reading. |

Exécution : `npm run test:portability`, qui inclut `scripts/third-party-import-services.test.mjs`. Les tests n’ouvrent aucune donnée personnelle, ne se connectent à aucun compte et n’appellent aucune API fournisseur.
