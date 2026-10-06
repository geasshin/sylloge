# Mode de travail

## Rôles

| Rôle | Responsabilité |
|---|---|
| Aurélien | Fixe les choix produit et décrit les problèmes d’usage. |
| Codex | Explore le périmètre utile, propose une étape concrète, réalise les changements autorisés et rapporte les preuves. |
| Git | Conserve l’historique du code et des documents. |

## Références actives

- ROADMAP.md : décisions produit confirmées et ordre des lots.
- ../DESIGN.md : base visuelle actuelle et règles de finition.
- ETAT_DE_BASE.md : faits techniques vérifiés et limites du clone.
- Les contrats de formats : comportement à préserver pour les imports et exports concernés.
- Les archives et anciens plans sont des traces historiques, pas des tâches ouvertes.

Le code et ses contrôles décrivent le comportement réellement livré. Une ancienne note ou capture prouve seulement ce qu’elle indique à sa date.

## Déroulement d’un lot

1. Vérifier la branche, l’état de travail et le comportement décrit.
2. Lire uniquement les documents et fichiers nécessaires.
3. Définir un périmètre étroit avec un résultat observable.
4. Reproduire le problème avec des données factices avant de modifier le comportement, quand il s’agit d’un bug.
5. Modifier le code et les documents réellement concernés.
6. Exécuter les contrôles adaptés et examiner l’interface si le lot la modifie.
7. Rapporter le résultat, les vérifications et les limites avant de prendre un autre sujet majeur.

Une question est nécessaire seulement quand une décision produit change réellement le comportement ou le périmètre. Les choix d’implémentation réversibles restent du ressort de Codex.

## Git et livraison

Un commit est une photo du projet à un instant donné. Une branche est une piste de travail isolée. Ne pas commit, fusionner, créer un tag, pousser sur GitHub ou publier sans demande explicite.

Les versions, tags et notes anciennes ne déterminent pas la taille ou l’ordre des prochains lots. Aucun numéro de version n’est attribué au lot de reprise en cours.

## Données de test

Ne pas exécuter les contrôles sur la base personnelle. Créer les fixtures dans un dossier temporaire et supprimer les artefacts après usage. Le lancement natif doit utiliser un identifiant Tauri et un dossier de données distincts de l’application installée.

Les clés TMDB et IGDB absentes d’un clone propre sont un prérequis technique à documenter, pas une raison pour afficher ou réutiliser un secret réel. Les tests de logique ne doivent pas contacter ces fournisseurs.

## Rapport

Pour chaque lot, préciser :

- le comportement modifié ;
- les fichiers importants ;
- les commandes exécutées et leurs résultats ;
- les essais manuels restant à exercer ;
- les limites encore présentes.
