# Feuille de route de Sylloge

**État au 6 octobre 2026.** Cette feuille de route remplace les anciens trains et versions décrits dans les archives. Aucun numéro de version n’est attribué aux prochains lots.

## Cible confirmée

Sylloge est une application personnelle utilisée localement sur Mac. Elle conserve les cinq bibliothèques présentes : Films, Séries, Livres, Jeux et Art. L’allure actuelle reste la base visuelle. Le but des prochains changements est de rendre l’application plus claire, cohérente, fiable et agréable à utiliser.

Aucun chantier de distribution Windows ou de bêta publique n’est actif.

## Ordre des prochains travaux

### Lot livré : imports de fichiers Films et Séries

**Code implémenté, vérifications factices réussies.** Le parcours natif macOS avec sélecteur réel et écritures SQLite reste à vérifier dans un profil temporaire isolé.

Le code présentait déjà un aperçu avec mapping pour les CSV. Les JSON valides allaient directement au choix Remplacer ou Fusionner, avec un compteur mais sans résumé visible du fichier ou de ses fiches. Le lot ajoute un aperçu compact des imports JSON Films et Séries, corrige des défauts CSV reproductibles, conserve le titre d’origine dans le résolveur de doublons et harmonise les accords des libellés communs. Le parcours a été exercé avec des fixtures dans un navigateur local isolé et un pont Tauri simulé. L’ajout assisté par TMDB n’en faisait pas partie.

Critères de résultat :

- les fichiers valides sont reconnus et leur contenu est présenté clairement avant écriture ;
- un format invalide ou un problème de doublon donne une explication et une action compréhensibles ;
- aucune bibliothèque n’est remplacée ou fusionnée sans choix explicite ;
- les contrats de données existants sont préservés ;
- le parcours est vérifié avec des fixtures, sans ouvrir la bibliothèque personnelle.

Le brief détaillé est dans [le brief du lot 1](plans/brief-imports-films-series.md).

### Suite : à définir après validation de la base

L’axe général reste la cohérence et la finition de l’interface, en conservant la base visuelle actuelle. Aucun écran ni lot suivant n’est encore sélectionné. Le prochain travail sera défini à partir d’un défaut d’usage concret et vérifiable, pas à partir d’une liste spéculative.

### Travail continu : qualité d’usage

Corriger les défauts reproductibles rencontrés dans l’application, améliorer la cohérence du langage visuel et augmenter la flexibilité des vues lorsque le besoin est identifié. Ne pas transformer ces axes en backlog de fonctionnalités spéculatives.

## Garde-fous

- Garder les données personnelles locales et utiliser des fichiers factices pour les vérifications.
- Préserver les formats d’import/export et les migrations sauf besoin démontré.
- Ne pas ajouter de nouvelle bibliothèque ou de service distant dans le cadre d’une correction locale.
- Les idées d’anciennes feuilles de route sont archivées. Elles ne sont ni promises ni planifiées par défaut.
