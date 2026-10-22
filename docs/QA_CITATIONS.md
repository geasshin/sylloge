# Citations : système commun, atomicité et recette

## Ce qui est livré

- Un éditeur de citations commun à Livres, Mangas et Comics (`src/components/Quotes.tsx`) : ajout, retrait, déplacement vers le haut ou le bas, texte exact conservé (accents, guillemets, sauts de ligne).
- « Ajouter une citation » depuis une fiche vide ouvre le formulaire sur un passage déjà créé et focalisé : une seule action mène à la saisie, pour les livres comme pour les comics. Le titre de la fenêtre ne prend plus le focus dans ce cas.
- Au clavier, le déplacement garde le focus sur le geste : Entrée répète le déplacement au lieu d’insérer un saut de ligne dans un champ voisin.
- Une fiche sans citation affiche « Aucune citation », jamais « 0 citations personnelles ».
- Retirer la dernière citation rend le focus au bouton d’ajout : le focus ne sort jamais de la fenêtre modale, donc une validation de trop ne referme pas la fiche.
- Une section « Citations » en bas de fiche, sous les informations de l’œuvre, avec compteur et action « Modifier les citations ». Aucune citation n’est repliée dans un accordéon.
- Les citations restent indépendantes du statut de lecture : une œuvre « À lire » peut porter des citations.
- Une seule table de citations par bibliothèque (`book_quotes`, `manga_quotes`, `comic_quotes`), dans la même base SQLite que la bibliothèque.

## Identité et atomicité

- À l’enregistrement, une citation dont le texte n’a pas changé garde son identifiant et sa date de création, y compris lorsque l’ordre change ou que deux citations ont le même texte.
- Le rapprochement se fait sur le texte exact : corriger une citation produit une nouvelle citation (nouvel identifiant, nouvelle date). C’est un choix assumé — aucun défaut visible aujourd’hui, aucune identité affichée — mais il faudra transporter l’identifiant dans le formulaire avant toute synchronisation entre appareils, sinon une correction deviendra un doublon.
- Le champ de saisie neutralise la correction automatique et le correcteur (`autoCorrect="off"`, `spellCheck={false}`), comme l’ancien éditeur : un passage cité ne doit pas être réécrit par macOS.
- Les corps vides ne sont jamais enregistrés, sur les deux chemins de préparation (`reconcileBookQuotes` et `prepareQuotes`), et les positions restent contiguës.
- Les écritures passent par une transaction unique côté Rust : `create_custom_entry_atomically`, `update_custom_entry_atomically`, `delete_custom_entry_atomically`, `remove_custom_library_atomically`.
- Un échec tardif sur une citation annule la fiche entière et toutes ses anciennes citations ; aucun état intermédiaire ne reste en base.
- Le dépôt relit la base après le commit natif : l’interface n’affiche jamais un succès non écrit.

## Sauvegardes : une copie écrite doit être relisible

Défaut corrigé avant publication : une copie de sauvegarde plus grosse que la limite de lecture (16 Mio) était écrite, enregistrée et pouvait évincer toutes les copies restaurables du profil, alors qu’elle-même n’était pas relisible.

- `MAX_SNAPSHOT_FILE_BYTES` (64 Mio) borne désormais l’écriture **et** la lecture des copies Sylloge ; l’import de fichiers tiers garde sa limite de 16 Mio.
- L’admission se fait avant l’écriture, l’enregistrement, la conservation et l’avancement du garde-fou quotidien : un document trop gros échoue sans rien écrire et laisse les copies existantes intactes.
- Régression Rust : `oversized_document_is_refused_before_any_write_and_keeps_readable_copies`. Elle échoue sans le correctif (vérifié en le retirant), et prouve qu’un document trop gros n’évince aucune copie lisible.

## Preuves exécutées

- Rust (`src-tauri`) : `cargo test` 157 réussis ; `cargo clippy --all-targets -- -D warnings` et `cargo fmt --check` sans remarque.
- Node (`npm run verify`) : 131 tests réussis, dont `quotes.test.mjs`, `custom-library-persistence.test.mjs`, `native-custom-entries.test.mjs`, `custom-entry-qa-bridge.test.mjs`.
- TypeScript : `npm run typecheck` et `npm run build` réussis.
- Recettes navigateur (`qa-app.html`, base en mémoire, vraies migrations) : **16 scripts, 16 réussis**, environ 660 contrôles.

| Recette | Contrôles |
| --- | --- |
| `qa-quotes.js` | 101 |
| `qa-library-separation.js` | 154 assertions |
| `qa-library-toolbar.js` | 112 |
| `qa-transfers.js` | 70 |
| `qa-settings.js` | 36 |
| `qa-sidebar.js` | 34 |
| `qa-csv-transfers.js` | 28 |
| `qa-transfer-visual.js` | 25 |
| `qa-custom-libraries.js` | 24 |
| `qa-onboarding-flows.js` | 23 |
| `qa-third-party-transfers.js` | 17 |
| `qa-transfer-failures.js` | 11 |
| `qa-profile-restoration.js` | 9 |
| `qa-book-libraries.js` | 5 |
| `qa-book-type-move.js` | 3 |
| `qa-onboarding-visual.js` | 3 |

- Recette native (binaire `--debug` isolé, identifiant de recette dédié, base synthétique v20, aucune donnée réelle) : migration 0021 appliquée au démarrage, copie de sauvegarde pré-migration écrite, comic déplacé de `books` vers `comics` avec sa citation, `integrity_check` et `foreign_key_check` sans erreur, données toujours présentes après redémarrage. Édition d’une citation dans la fiche : la citation existante garde son identifiant et sa date, la nouvelle est écrite à sa position, accents, guillemets, caractère japonais et saut de ligne conservés.

## Déplacement entre bibliothèques

Changer le type d’une fiche (Livre ↔ Manga) la déplace de table : même identifiant, notes, progression, statut et date de création conservés, citations déplacées avec la fiche et aucune copie résiduelle dans l’ancienne table. Couvert dans les deux sens par `qa-book-type-move.js`.

## Limites

- L’automatisation graphique native passe par l’accessibilité macOS : après bascule d’espace ou activation d’une autre application, la fenêtre accepte l’observation mais refuse l’entrée tant qu’elle n’est pas ramenée au premier plan. Les parcours vérifiés en natif sont ceux listés ci-dessus ; le reste est couvert par les recettes navigateur et les tests Rust.
- Les recettes navigateur utilisent `sql.js` avec les vraies migrations, pas le moteur Rust : la parité est assurée par les tests Rust correspondants, pas par une exécution native de chaque parcours.
- La couture IPC des fiches personnalisées est vérifiée à la lecture, pas par un test : les clés TypeScript (`libraryId`, `entry`, `profileId`, `isFavorite`, `progressCurrent`…) correspondent une à une aux structures Rust (`#[serde(rename_all = "camelCase")]`) et les paramètres de commande aux noms snake_case attendus. Un test couvrant la couche `#[tauri::command]` elle-même reste à écrire.
- Créer ou modifier une fiche dont la bibliothèque n’est pas activée pour le profil n’est pas refusé par la commande native : le cas n’est pas atteignable depuis l’interface, qui n’expose que les bibliothèques actives.
- Le passage d’un profil très volumineux (> 64 Mio de JSON) fait échouer la sauvegarde avec un message explicite plutôt que de produire une copie inutilisable ; aucune copie n’est alors perdue.
