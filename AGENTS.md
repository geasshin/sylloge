# Consignes pour travailler sur Sylloge

## Références du projet

Avant un changement qui touche au produit, consulter :

1. docs/ROADMAP.md pour le périmètre confirmé et le prochain lot ;
2. docs/WORKFLOW.md pour les pratiques de travail ;
3. DESIGN.md pour la base visuelle ;
4. README.md et les contrats de données concernés.

Les documents sous docs/archive et les anciens plans sous docs/plans sont historiques. Ils ne créent pas de tâche active ni de règle actuelle.

## Base produit

- Application personnelle locale sur Mac.
- Cinq bibliothèques : Films, Séries, Livres, Jeux et Art.
- Une seule direction visuelle pour toute l’application, accueil compris : monochrome neutre et froid (décision du 16 octobre 2026). Les écrans peuvent être recomposés quand l’usage le justifie ; les fonctions, les données et les cinq bibliothèques sont préservées. DESIGN.md décrit le système en vigueur.
- Cible desktop macOS uniquement. La présentation mobile n’est plus maintenue comme cible.
- Ne pas élargir le périmètre vers de nouveaux médias, comptes, synchronisation, cloud ou distribution publique sans décision explicite.

## Données et sécurité

- Ne pas ouvrir, modifier, copier ou utiliser les données personnelles réelles pour les essais.
- Garder les essais dans un dossier et un profil temporaires isolés.
- Les clés fournisseur sont locales et ignorées par Git. Ne pas les afficher, les demander dans le chat, les copier dans des fichiers suivis ou envoyer des requêtes réelles pour une validation ordinaire.
- Préserver les formats existants. Examiner le contrat concerné avant de changer un import, un export ou une migration SQLite.
- Ne jamais remplacer ou fusionner une bibliothèque sans choix explicite de la personne.

## Changements et vérification

- Explorer seulement les fichiers utiles au lot et suivre les outils déjà utilisés par le dépôt.
- Pour une modification d’interface, vérifier les parcours visés avec des données factices et examiner le rendu quand l’environnement le permet.
- Pour du code, lancer les contrôles pertinents : npm run typecheck, npm run verify, npm run build et les commandes Cargo concernées. Un clone propre peut manquer les modules locaux ignorés contenant des secrets. Rapporter cette limite clairement, ne pas la masquer.
- Ne pas commit, fusionner, taguer ou pousser sans demande explicite. Un push sur `main` publie automatiquement une mise à jour installable.
- Pour une vérification visuelle, ouvrir `qa-app.html` avec `npm run dev` : la vraie application y tourne avec une base SQLite en mémoire et des données factices (`?scenario=full`, `empty` ou `onboarding`). Arrêter le serveur après usage.
- À la fin, indiquer les fichiers modifiés, les vérifications réellement exécutées et les limites restantes.
