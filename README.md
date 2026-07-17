# Bibliothèque culturelle, V0.1

Prototype personnel desktop construit avec React, TypeScript et Vite. Il rassemble pour le moment les parcours Accueil, Films et Séries dans une interface locale suivant la direction visuelle Archive calme.

L'échantillon actuel contient huit films et huit séries ou animations japonaises issus des trackers Notion personnels. Les données et les affiches sont copiées localement pour ce prototype : il ne s'agit ni d'un import complet ni d'une synchronisation avec Notion.

Pour installer les dépendances et lancer le prototype :

```bash
npm install
npm run dev
```

Pour exécuter tous les contrôles disponibles :

```bash
npm run typecheck
npm run verify
npm run build
```

Le périmètre et les règles visuelles stabilisées sont décrits dans `DESIGN.md`. La provenance et les limites du contenu sont détaillées dans `CONTENT_SNAPSHOT.md`.
