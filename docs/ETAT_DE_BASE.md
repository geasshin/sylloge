# État de base de Sylloge

Audit du 6 octobre 2026, avant l’implémentation du lot 1. Ce document conserve une photographie de la base de reprise, pas une description complète de l’état actuel ni une recette de la bibliothèque personnelle. Les changements livrés ensuite et leur état de vérification figurent dans [la roadmap](ROADMAP.md) et le [compte rendu du lot 1](plans/brief-imports-films-series.md).

## Base retenue et décisions confirmées

- Base de travail : commit 0854e2a de main, dans la branche locale codex/plan-remise-a-plat.
- La dernière release vérifiée est v0.6.0, tag 2290571 du 25 août 2026. Le commit de main est postérieur au tag, alors que le manifeste affiche toujours 0.6.0.
- L’application installée affiche aussi 0.6.0, mais son commit exact n’est pas identifié. À la demande d’Aurélien, elle est traitée comme la même étape générale que main, à quelques détails près.
- Cible confirmée : usage personnel local sur Mac. La distribution Windows et une bêta publique ne sont pas des objectifs actifs.
- Périmètre confirmé : Films, Séries, Livres, Jeux et Art.
- Direction visuelle confirmée : garder l’allure actuelle comme base, puis aligner les compositions et améliorer la finition.
- Priorité d’usage décrite : réduire le côté brouillon, corriger les bugs, mieux aligner les éléments et les compositions, et rendre l’expérience des imports de fichiers JSON/CSV plus fiable et lisible. Le premier lot portera sur les imports Films et Séries.

## Constat initial sur les imports, avant le lot 1

Le code sépare les imports JSON et CSV. Les imports CSV Films/Séries passent par des étapes de sélection ou de mapping et un aperçu. Un JSON valide passe directement au choix Remplacer ou Fusionner, qui n’affiche que le nombre de fiches et le nombre déjà présent. Il n’y a pas d’étape visible pour relire le nom du fichier ou un échantillon des fiches avant ce choix.

C’était une différence vérifiée dans le code de la base de reprise et le point de départ du lot 1. Le brief associé décrit les changements apportés depuis et les limites de leur vérification.

## Capacités et structure vérifiées

- Application Tauri, interface React, TypeScript et Vite, backend Rust, stockage SQLite local.
- Création manuelle, vues et fiches par bibliothèque, profils, thèmes clair et sombre, imports, exports, sauvegardes et mises à jour.
- Aide facultative aux métadonnées : TMDB pour Films et Séries, Open Library pour Livres, IGDB pour Jeux.
- RAWG subsiste comme étiquette historique dans le générateur de modules et dans les archives, mais n’est pas le fournisseur Jeux du code actuel.

## Vérifications exécutées

- npm ci : réussi.
- npm run typecheck : réussi.
- npm run build : réussi, avec un avertissement Vite sur un bundle JavaScript de 603,87 kB, au-dessus du seuil de 500 kB.
- npm run verify, cargo fmt --check, cargo check, cargo test et cargo clippy --all-targets -- -D warnings : réussis avec des modules Rust factices temporaires, ignorés par Git. Les fixtures ont été supprimées ensuite. Aucun appel à TMDB ou IGDB n’a été envoyé.
- Le lancement Tauri isolé a créé et migré une base SQLite temporaire. La base a été inspectée en lecture seule, puis les fichiers temporaires ont été supprimés.

## Limites de validation

- Un clone propre ne contient pas les modules locaux de clés attendus par TMDB et IGDB. Les contrôles Rust et npm run verify ne passent donc pas immédiatement sans prérequis local. Le générateur décrit maintenant les modules TMDB et IGDB utilisés par le code actuel.
- La fenêtre Tauri de test n’était pas accessible à l’outil de pilotage d’interface. Le lancement et les migrations ont été vérifiés, mais pas les parcours visuels ou les interactions dans une fenêtre native.
- Les captures et rapports du 23 et 24 septembre proviennent d’un harnais antérieur. Ils ne valident pas le rendu actuel.
- La base personnelle n’a pas été ouverte, copiée ou modifiée. L’application installée est restée fermée.
- Le build a tenté de contacter GitHub pour vérifier les mises à jour. La connexion réseau a échoué dans l’environnement de test sans empêcher le démarrage.

## Historique documentaire

Les anciennes feuilles de route, le contrat visuel précédent, le README antérieur et les anciennes règles de travail sont conservés dans archive/. Les briefs sous plans/ sont historiques. Leurs anciens jalons et tâches ne sont pas actifs.
