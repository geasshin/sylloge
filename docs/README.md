# Documentation Sylloge

Ce dossier contient les documents **versionnés avec le code** : ce sont les références opérationnelles pour une version, une revue et un futur agent de développement.

## Lecture rapide

1. [Feuille de route vers la V1 publique](ROADMAP.md) — périmètre, versions, décisions encore ouvertes.
2. [Mode de travail](WORKFLOW.md) — responsabilités Hermes / Codex / Git et critères de passage.
3. [Contrat CSV Films v1](CONTRAT_CSV_FILMS_V1.md) — format, compatibilité et limites de l’export CSV.
4. [`../README.md`](../README.md) — lancement, données locales, exports et limites actuelles.

## Source de vérité et archives

- Le dépôt Git local est la source de vérité pour le **code, les versions livrables et les documents d’exécution**. Le dépôt distant GitHub héberge les releases publiées signées.
- Le dossier `~/Documents/Hermes/bibliotheque-culturelle/` reste l’atelier de **cadrage produit, recherche, moodboards et archives**. Il n’est pas une seconde copie à maintenir ligne par ligne.
- Lorsqu’une décision modifie le produit ou la feuille de route, Hermes met à jour le document pertinent ici et, seulement si nécessaire, le cadrage de l’atelier Hermes.
- Les explorations, prompts et hypothèses historiques ne sont jamais traités comme une spécification active sans être intégrés explicitement à ces documents.

## Version actuelle

- **Dernière release publique : `0.5.0`**, macOS signée et publiée (extension culturelle aux cinq médiums).
- **Train ouvert : `0.6.0`, design desktop définitif de la V1** ; ses jalons internes `0.5.1…` sont décrits dans [ROADMAP.md](ROADMAP.md) et [plans/roadmap-future.md](plans/roadmap-future.md). Ils ne deviennent ni un tag ni une version installable.
- **Portée actuelle :** Films, Séries, Livres, Jeux et Art sur Tauri macOS, SQLite locale, création manuelle et assistée (TMDB, Open Library, RAWG), recherche, vues unifiées enregistrables, filtres et tris combinables, import/export JSON v2 et CSV par médium, Sauvegarde Sylloge, profils multiples, snapshots automatiques et manuels, mises à jour signées via l’updater.

Le README principal décrit le lancement, les données et les limites d’usage ; `ROADMAP.md` décrit l’ordre des jalons à venir.
