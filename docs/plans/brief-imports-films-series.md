# Lot 1 : imports de fichiers Films et Séries

**Statut :** implémentation et vérifications sur données factices terminées. L’interface native avec SQLite n’a pas été lancée pendant ce contrôle.

## Objectif

Rendre les imports de fichiers JSON et CSV Films et Séries plus clairs et plus fiables, sans ouvrir ni modifier la bibliothèque personnelle.

## Périmètre

- Parcours d’import de fichiers Films et Séries.
- Sélection, détection du format, aperçu, choix Remplacer ou Fusionner, résolution des doublons et rapport final.
- Messages d’erreur et défauts reproductibles directement liés à ces étapes.

## Hors périmètre

- Recherche et ajout assisté par TMDB.
- Changement des formats documentés, des règles de fusion ou des migrations SQLite sans défaut démontré.
- Import des autres bibliothèques, refonte globale, export et sauvegarde.
- Essais sur la bibliothèque personnelle.

## Changements livrés

- Un import JSON valide de Films ou Séries affiche le nom du fichier, le nombre de fiches et jusqu’à cinq titres avant de proposer Remplacer ou Fusionner. Les erreurs JSON et les collections vides s’arrêtent avant le choix d’import. Aucune écriture n’a lieu dans l’aperçu.
- L’aperçu reste compact : ses deux actions sont visibles dans le rendu bureau de 720 px et le rendu mobile de 390 px, les titres longs se replient sans débordement horizontal.
- Le mapping CSV Films reconnaît les statuts français « Vu », « Vue », « Vus » et « Vues » comme terminés. Un statut inconnu bloque l’aperçu avant toute écriture.
- Le résolveur de doublons montre le titre d’origine avec sa casse et ses accents plutôt que la clé normalisée.
- Les textes Remplacer ou Fusionner accordent correctement le genre et le pluriel pour les cinq bibliothèques.

## Vérification

Les vrais composants React d’import sont rendus dans un navigateur local isolé. Le pont Tauri est remplacé par un mock qui n’ouvre aucune base SQLite et n’écrit aucun fichier. Des fixtures vérifient notamment :

- Films JSON : aperçu, doublon, choix de fiche, Fusionner et rapport final.
- Films JSON invalide : erreur claire, sans commande d’écriture.
- Films CSV : mapping, aperçu et Fusionner ; un statut inconnu bloque l’import.
- Séries JSON : aperçu, accord grammatical, doublon, choix de fiche, Fusionner et rapport final.
- Séries CSV : mapping, aperçu, Fusionner et rapport final ; une ligne invalide bloque la suite.
- Tests métier : alias de statuts français, erreurs JSON, collection vide et règles de fusion qui préservent les données personnelles de la fiche locale.

Les suites automatiques utilisent un module TMDB factice temporaire, supprimé après le contrôle. Aucun appel fournisseur n’est envoyé. Aucun fichier de la bibliothèque personnelle n’est lu ou modifié.

## Limite connue

Le parcours natif macOS et ses commandes SQLite ne sont pas exercés par le navigateur isolé. Les écritures UI ont été vérifiées au niveau du vrai composant avec des réponses Tauri factices. Aucun code Rust n’a été modifié, et les tests Rust du backend n’ont pas été relancés pour ce lot.

Le build existant signale un bundle JavaScript supérieur au seuil Vite de 500 kB ; ce sujet ne bloque pas les imports et reste hors de ce lot.
