# Fixtures d’exports tiers

Ces fichiers sont **entièrement synthétiques**. Les œuvres, personnes, identifiants et avis sont inventés ; ils ne proviennent d’aucun compte utilisateur. Ils ne constituent ni un corpus d’exports réels anonymisés, ni une preuve de compatibilité exhaustive avec les services actuels.

| Fichier | Sémantique exercée |
|---|---|
| `letterboxd-ratings.csv` | Note personnelle /5, demi-point, absence de note, titre contenant une virgule. |
| `letterboxd-diary.csv` | Date de visionnage explicite, avis multiligne, guillemets, marqueurs de revisionnage et tags. |
| `letterboxd-list.csv` | Colonnes communes aux films vus et à la liste à voir ; interprétation liée au nom reconnu ou au choix explicite. |
| `goodreads-library.csv` | Statuts exclusifs, note /5, zéro sans note, avis multiligne, notes privées et dates ne correspondant pas au début de lecture. |

Les tests dans `scripts/third-party-import.test.mjs` dérivent aussi des variantes en mémoire : ZIP déjà lu par le pont natif, fichiers contradictoires, historique répété, mauvais encodage et mauvaises destinations. Ils ne prétendent pas exercer le téléchargement authentifié d’un service.

Les fixtures des services ajoutés (IMDb, The StoryGraph, Simkl, Hardcover, MyAnimeList XML) sont dans `fixtures/imports/` avec leur propre README ; `scripts/third-party-import-services.test.mjs` les exerce. Elles sont également synthétiques et ne prouvent pas la stabilité des exports tiers.

Références officielles consultées et limites de vérification : `docs/IMPORT_GUIDES_SOURCES.md`. Le schéma reconnu par l’adaptateur est documenté dans `docs/IMPORTS_TIERS_MOTEUR.md` ; les noms de fichiers et colonnes testés ne sont pas une garantie de stabilité des exports tiers.

Exécution : `npm run test:portability`. Les tests n’ouvrent aucune donnée personnelle, ne se connectent à aucun compte et n’appellent aucune API fournisseur.
