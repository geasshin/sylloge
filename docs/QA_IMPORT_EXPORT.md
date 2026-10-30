# Recette du bloc 2 — imports, exports et guides

État vérifié localement le **22 octobre 2026**. Modifications non committées et non publiées. Aucune donnée personnelle réelle n’a été ouverte ou modifiée.

## Comportement livré dans le code local

- Sept entrées d’import réellement isolées : chaque JSON/CSV est dirigé vers sa section et sa table, notamment Anime et Mangas.
- Guide d’origine avec liens officiels, étapes, données reprises, limites et date de consultation ; sélection native du fichier.
- Aperçu avant toute écriture. La fusion passe par les choix de doublons, puis un résumé des ajouts, mises à jour et suppressions.
- Remplacement limité à la bibliothèque ouverte, avec case de consentement et confirmation finale distinctes.
- Choix « Conserver les deux fiches » pour les homonymes entre l’import et l’existant ; les inserts reçoivent de nouvelles identités au moment de l’écriture.
- Aucun appel d’écriture avant confirmation ; garde contre le double déclenchement. Le bilan reste ouvert jusqu’à sa fermeture, avant de recharger le parent.
- Export unitaire JSON/CSV ou export JSON des sept bibliothèques du profil. Les noms de fichiers distinguent la portée. Succès, annulation et erreur restent visibles.
- Écriture native des fichiers par temporaire voisin, synchronisation puis renommage ; un échec ne tronque plus un export existant ni une cible atteinte par un lien.
- Lectures natives bornées, y compris après le contrôle initial des métadonnées ; protections ZIP exercées sur les deux lecteurs.
- Conservation des textes exacts dans le CSV Sylloge strict, sans purge par les formulaires. Conservation des champs libres d’Art à la frontière SQLite, sur import global et unitaire.

## Services et portée réelle

| Origine | Support local | Réserves |
|---|---|---|
| Sylloge | JSON historique/v3 et CSV par bibliothèque | L’import depuis une bibliothèque ne restaure que cette bibliothèque. La restauration globale existante reste dans les réglages. |
| Letterboxd | CSV dédiés et regroupement d’un ZIP entier | Les cinq tables reconnues sont réunies ; historique et tags du journal deviennent une note personnelle, sans faux historique natif. Une identité contradictoire ou plusieurs œuvres indiscernables bloque l’import. |
| Goodreads | CSV vers Livres | Pas Mangas. Les dates de fin/ajout ne deviennent pas des débuts de lecture ; les notes moyennes et compteurs de relecture ne deviennent pas des données personnelles au sens différent. |
| Notion | CSV/ZIP avec correspondances et choix de table | Notes Markdown associables dans Films seulement, pas restauration complète d’un espace Notion. |
| BetaSeries / TV Time | Guide prudent et CSV générique compatible | Aucun adaptateur dédié ni nouvel export actuellement garanti. |
| MyAnimeList | Guide pour conserver l’export XML | XML/gzip non importable directement, clairement signalé dans le sélecteur d’origine. |

Les noms des services n’imposent jamais un parseur à partir du seul bouton sélectionné : la reconnaissance porte sur le contenu. Un service reconnu dans une mauvaise bibliothèque est bloqué, sans repli silencieux.

## Exports vers les services (30 octobre 2026)

Le dialogue d’export est recomposé en deux groupes : **Sauvegarde complète** (JSON Sylloge, CSV) et
**Exporter vers un service**, avec un fichier au format d’import exact de chaque service proposé pour
la bibliothèque ouverte. Formats, correspondances et limites : [EXPORTS_SERVICES.md](EXPORTS_SERVICES.md).

| Bibliothèque | Services | Fichier produit |
|---|---|---|
| Films | Letterboxd (vus, à voir), SensCritique, Simkl | `sylloge-letterboxd-*.csv`, `sylloge-senscritique-films-*.csv`, `sylloge-simkl-films-*.csv` |
| Séries | SensCritique, Simkl | `sylloge-senscritique-series-*.csv`, `sylloge-simkl-series-*.csv` |
| Animation japonaise | Simkl | `sylloge-simkl-anime-*.csv` |
| Livres | The StoryGraph (format Goodreads), Hardcover | `sylloge-storygraph-livres-*.csv`, `sylloge-hardcover-livres-*.csv` |
| Mangas | The StoryGraph (format Goodreads) | `sylloge-storygraph-mangas-*.csv` |
| Jeux, Art | Aucun | sauvegarde complète seulement |

- **En-têtes** : tirés de la documentation officielle du service ; `universe,title,release_date,rating,is_wishlisted,is_recommended,is_done`
  pour SensCritique, les treize colonnes du modèle Simkl, les 31 colonnes Goodreads pour The
  StoryGraph, les 28 colonnes du schéma custom Hardcover.
- **Bilan** : chaque export affiche le fichier écrit, le nombre d’œuvres et ce qui n’est pas parti
  (séries sans année, progression non transmise, notes arrondies, favoris ou citations sans colonne,
  ISBN manquant).
- **Preuve** : 26 tests Node (`scripts/service-exports.test.mjs`) et la recette
  `scripts/qa-exports-services.js` (**79 points de contrôle**), qui relit chaque ligne du fichier
  contre la fiche dont elle vient, vérifie qu’un lien fournisseur ajouté remplit la colonne `TMDB`
  du fichier Simkl suivant, et couvre les quatre bibliothèques en français et en anglais.

## Vérifications exécutées

### TypeScript et fichiers

- `npm run typecheck` : réussi.
- `npm run verify` : vérifications historiques réussies, puis **57 tests de portabilité** réussis. Cette commande inclut désormais les suites dédiées.
- `npm run build` : réussi. Avertissement Vite conservé sur le chunk JavaScript supérieur à 500 kB ; aucun découpage architectural hors périmètre entrepris.
- `git diff --check` : réussi.
- Détecteur Impeccable sur les cinq composants principaux de transfert : sortie 0, aucune observation.

Les 57 tests couvrent les allers-retours des champs représentables, les sept bibliothèques JSON v3, textes Unicode/multilignes/guillemets/formules, métadonnées de profil CSV cohérentes, cas invalides, règles Letterboxd/Goodreads et conservation séparée d’homonymes.

### Rust natif

Dans `src-tauri`, avec `TMPDIR` pointant vers le scratch du profil actif :

- `cargo fmt --check` : réussi.
- `rustfmt --check --edition 2021 src/portability_io_tests.rs` : réussi.
- `cargo check` : réussi.
- `cargo test --lib` : **97 tests réussis**.
- `cargo clippy --all-targets -- -D warnings` : réussi.

Ces tests exercent les écritures SQLite réelles en mémoire avec les migrations, les champs des sept tables, les citations et les champs libres d’Art. Des échecs tardifs et des remplacements sont injectés pour comparer l’état avant/après et prouver le rollback, liens fournisseurs et citations compris. Les essais de fichiers utilisent des fichiers temporaires synthétiques : bornes, encodage, ZIP, liens, conservation d’une cible existante et nettoyage du temporaire en échec.

### Navigateur sur la vraie application QA

Route `qa-app.html?scenario=full` : vraie UI React, SQLite mémoire ; sélecteurs, sauvegardes et commandes d’écriture natives interceptés.

| Script | Assertions réussies |
|---|---:|
| `scripts/qa-transfers.js` | 70 |
| `scripts/qa-third-party-transfers.js` | 17 |
| `scripts/qa-transfer-failures.js` | 11 |
| `scripts/qa-csv-transfers.js` | 28 |
| `scripts/qa-transfer-visual.js` | 25 |
| **Total** | **151** |

Exécution avec une session Playwright nommée et un Vite sur 127.0.0.1:5173. Lancer le script visuel depuis un dossier scratch : ses captures sont écrites relativement à ce dossier. Lire le résultat JSON explicite, pas seulement le code de sortie du CLI.

Les contrôles vérifient la section/table cible, la portée des JSON exportés, les sept chemins CSV, l’absence d’écriture avant confirmation, le retour sans écriture, le consentement de remplacement, la conservation des deux homonymes, le double clic, les annulations et les erreurs natives/disque. Le guide et l’export ont été capturés et inspectés en clair/sombre à 1440×900 et 1000×760 ; focus, Échap et retour à l’action d’origine ont été exercés. L’aperçu Letterboxd et le résumé destructif ont aussi été inspectés.

### Site séparé `sylloge-web`

Hero « Gratuite et open source », code public/licence MIT dans « Privée, ouverte, durable » et pied de page. La mention réseau explique le proxy TMDB/IGDB. Diff limité à `index.html` et `README.md`, sans nouvelle composition ni dépendance.

Le rapport navigateur produit pendant le travail délégué a été relu : **81 assertions sur 81**, aucune assertion en échec. Captures desktop et de la section MIT inspectées. Tests proxy relancés : **18/18 réussis**. Aucun déploiement effectué.

## Limites de preuve et travail différé

- Les fixtures tiers sont **synthétiques**. Aucun corpus d’exports réels anonymisés n’a été fourni et aucun téléchargement authentifié depuis un service n’a été exécuté. Voir `tests/fixtures/third-party-import/README.md`.
- Les tests navigateur prouvent l’interface et les payloads natifs ; les tests Rust prouvent séparément les fichiers/transactions. Ils ne remplacent pas le parcours complet d’une application macOS ou Windows avec ses sélecteurs OS réels.
- Le CSV v1 ne transporte pas les champs libres d’Art ni les identifiants/dates des citations. JSON est recommandé pour préserver les données personnelles représentées ; ce JSON ne sauvegarde pas tous les réglages, caches ou vues de l’application.
- Les adaptateurs MyAnimeList XML/gzip, AniList, StoryGraph et les archives propriétaires TV Time/BetaSeries ne sont pas livrés. Glisser-déposer natif et plan d’import multi-services restent différés.
- Les fichiers et formats non reconnus passent seulement par les parcours génériques effectivement compatibles ; aucun document arbitraire, PDF, image ou XLSX n’est converti automatiquement.

## Publication

Aucun commit, push, tag, migration de la base personnelle ni déploiement dans ce lot. Un push sur `main` publierait une mise à jour et reste soumis au feu vert explicite d’Aurélien. Les serveurs de recette de la session sont arrêtés après les captures.
