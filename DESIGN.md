# Base visuelle de Sylloge

**Décision produit :** conserver l’allure actuelle comme point de départ et l’améliorer. Cette direction a été confirmée pendant la reprise du 6 octobre 2026.

## État observé

Le code combine une présentation neutre pour les bibliothèques, avec des thèmes clair et sombre, et un traitement propre à l’accueil. Les écrans et fiches ne sont pas tous composés ou alignés de la même façon. Cette différence correspond aux défauts de finition décrits par Aurélien.

La source de référence des détails visuels reste l’interface actuelle dans src/styles.css et les composants concernés. L’ancien contrat visuel uniforme est conservé dans [les archives](docs/archive/DESIGN-contrat-visuel-2026-08-22.md) comme trace historique, pas comme spécification à appliquer à l’aveugle.

## Règles pour les prochains lots

- Garder le caractère visuel général de Sylloge et ses cinq bibliothèques.
- Corriger les incohérences de hiérarchie, d’espacement, d’alignement, d’actions et de composition au niveau des écrans concernés.
- Préserver l’identité particulière de l’accueil quand une correction locale suffit. Ne pas forcer toutes les surfaces dans un gabarit uniforme.
- Garder les thèmes clair et sombre lisibles, les contrôles accessibles au clavier et les libellés explicites.
- Éviter d’ajouter une nouvelle palette ou un nouveau langage graphique pour résoudre un défaut isolé.
- Vérifier les vues concernées à une taille desktop et, si le changement touche une mise en page adaptative, à une taille étroite.

Un changement visuel important doit être rattaché à un problème d’usage identifié, montré sur un écran précis, puis vérifié sur le rendu réel. Les détails du contrat évolueront à partir de corrections observées, sans redémarrer par un redesign général.
