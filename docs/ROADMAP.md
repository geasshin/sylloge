# Feuille de route de Sylloge

**État au 16 octobre 2026.** Cette feuille de route remplace les anciens trains et versions décrits dans les archives. Aucun numéro de version n’est attribué aux prochains lots : chaque push sur `main` publie automatiquement une release corrective.

## Cible confirmée

Sylloge est une application personnelle utilisée localement sur Mac. Elle compte sept bibliothèques, une seule base `sylloge.db` et une table par bibliothèque : `films`, `series`, `anime`, `books`, `mangas`, `games`, `artworks`. Décision du 20 octobre 2026 : la séparation n’est pas seulement visuelle, chaque bibliothèque possède sa table et ses fiches. Le but des prochains changements est de rendre l’application plus claire, cohérente, fiable et agréable à utiliser.

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

### Lot en cours : harmonisation visuelle et recomposition des écrans

**Décidé le 16 octobre 2026 avec Aurélien, sur la branche `design/harmonisation`.** L’application garde ses fonctions et ses bibliothèques, mais son langage visuel est unifié et plusieurs écrans sont recomposés :

- une seule direction pour toute l’application, accueil compris : monochrome neutre et froid, dérivé de l’anthracite des bibliothèques ; le papier chaud et l’accent violet de l’accueil disparaissent ;
- un système commun d’espacements, de tailles de texte, d’arrondis, de boutons, de champs et de fenêtres, appliqué à tous les écrans ;
- un accueil plus visuel, organisé en rangées par catégorie comme une médiathèque de streaming, avec un en-tête et des modules par bibliothèque repensés ;
- des vues de bibliothèque plus nombreuses et plus rapides à trier et à enregistrer ;
- des fiches qui mettent en avant le visuel, la note et le statut sans vide inutile ;
- la correction de la bibliothèque Art : vues visibles et visuel ajoutable dès la création ;
- décidé le 19 octobre 2026 : une barre des bibliothèques allégée (« Tout associer » dans l’en-tête, recherche en pilule, vues défilantes, « Nouvelle vue » toujours visible) et une bibliothèque Mangas distincte de Livres dans la barre latérale, l’accueil et son bilan, sans bibliothèque Comics : les anciens comics restent dans Livres, l’import reste commun aux deux ;
- décidé le 20 octobre 2026 : Animation japonaise et Mangas deviennent des bibliothèques à part entière, avec leur propre table (`anime`, `mangas`) dans la même base `sylloge.db`. La migration 0020 recopie les fiches historiques avec leur identifiant et tous leurs champs, déplace citations et liens fournisseurs, puis les retire de `series` / `books`. Aucune bibliothèque ne partage plus la table d’une autre. La catégorie ne distingue pas les pays : Aurélien confirme le transfert global des fiches `animation` et corrigera les exceptions par le type de la fiche ;
- desktop uniquement : la présentation mobile n’est plus une cible.

Les vérifications visuelles passent par `qa-app.html`, qui monte la vraie application dans un navigateur avec une base SQLite en mémoire construite par les migrations du projet et des données factices. Aucune donnée personnelle n’est ouverte.

### Travail continu : qualité d’usage

Corriger les défauts reproductibles rencontrés dans l’application, améliorer la cohérence du langage visuel et augmenter la flexibilité des vues lorsque le besoin est identifié. Ne pas transformer ces axes en backlog de fonctionnalités spéculatives.

## Garde-fous

- Garder les données personnelles locales et utiliser des fichiers factices pour les vérifications.
- Préserver les formats d’import/export et les migrations sauf besoin démontré.
- Ne pas ajouter de nouvelle bibliothèque ou de service distant dans le cadre d’une correction locale.
- Les idées d’anciennes feuilles de route sont archivées. Elles ne sont ni promises ni planifiées par défaut.
- Un push sur `main` publie une mise à jour installable : il exige le feu vert explicite d’Aurélien.
