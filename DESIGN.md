# Base visuelle de Sylloge

**Décision produit du 16 octobre 2026 :** une seule direction pour toute l’application, accueil compris. Monochrome neutre et froid, dérivé de l’anthracite des bibliothèques. Le papier chaud et l’accent violet propres à l’accueil sont abandonnés. Les écrans peuvent être recomposés quand l’usage le justifie. Cible desktop macOS uniquement.

Ce document est en cours de réécriture pendant le lot d’harmonisation (branche `design/harmonisation`). À la fin du lot, il décrira les jetons et composants réellement livrés : espacements, typographie, couleurs, arrondis, boutons, champs, fenêtres, cartes et rangées.

## Règles pendant le lot

- Toute valeur d’espacement, de taille de texte, d’arrondi ou de couleur passe par un jeton commun de `src/styles.css`. Pas de valeur isolée pour corriger un écran.
- Un même rôle garde la même apparence partout : bouton principal, bouton secondaire, bouton icône, champ, onglet de vue, fenêtre modale, carte d’œuvre.
- Garder les thèmes clair et sombre lisibles, les contrôles accessibles au clavier et les libellés explicites.
- Vérifier chaque écran modifié dans `qa-app.html`, en clair et en sombre, à 1440 × 900 et à la plus petite fenêtre desktop prise en charge.

L’ancien contrat visuel uniforme est conservé dans [les archives](docs/archive/DESIGN-contrat-visuel-2026-08-22.md) comme trace historique.
