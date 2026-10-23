# Feuille de route de Sylloge

**État au 16 octobre 2026.** Cette feuille de route remplace les anciens trains et versions décrits dans les archives. Aucun numéro de version n’est attribué aux prochains lots : chaque push sur `main` publie automatiquement une release corrective.

## Actualisation du 23 octobre 2026

**Les lots du 22 octobre sont dans `main`.** Imports guidés, onboarding et sauvegardes, bibliothèques personnalisées et citations ont été livrés par `93d1348`, corrigés par `03a1945` et `240e7ed`, puis tagués `v0.6.10`. Les mentions « implémenté localement, non publié » des sections qui suivent et de [PLAN_VERS_1.0.md](PLAN_VERS_1.0.md) datent du 22 octobre et ne décrivent plus l’état du dépôt.

**Interface bilingue : décidée par Aurélien le 23 octobre 2026, committée localement (`9658f0e`), non poussée.** Français et anglais dans l’application et sur le site : langue détectée au premier lancement (première langue prise en charge de `navigator.languages`, anglais à défaut), choix dans Paramètres › Général et sur le premier écran, mémorisé sur l’appareil, changement sans rechargement. Le français reste la langue source. Fonctionnement, contrôles et limites : [I18N.md](I18N.md). Le site est poussé et en ligne.

État mesuré de cette implémentation (23 octobre 2026) : `npm run verify` vert — 131 tests de portabilité et **134 tests i18n** (garde des catalogues, détection, contexte, messages du domaine et du natif, rendu anglais des écrans, relecture `verify`) ; typecheck et build de production verts ; `scripts/qa-language.js` 33 assertions sur 33 dans le navigateur ; recettes françaises inchangées ; site en production 14 assertions sur 14. 1 954 clés en neuf catalogues. Limites assumées : les messages natifs et du domaine ne sont traduits que s’ils figurent au catalogue (sinon ils restent en français), les métadonnées TMDB déjà mises en cache gardent la langue de leur récupération, et les captures du site restent en interface française, annoncées comme telles.

### Livré localement : annonce de mise à jour sans ouvrir les réglages

**Constat d’origine (23 octobre 2026).** La recherche automatique existait déjà et fonctionnait : `src/main.tsx` la lançait à l’ouverture, `automatic_checks_enabled` valait vrai par défaut, la version ignorée était respectée, et Paramètres › Application proposait déjà « Rechercher les mises à jour », Installer / Plus tard / Ignorer et les notes de version. Le défaut était la restitution : `availableUpdate` n’était rendu que dans `Portability.tsx`, donc invisible tant qu’on n’ouvrait pas les réglages.

**Arbitrage d’Aurélien : une annonce discrète à l’ouverture, pas une fenêtre.** Une carte dans un coin, sans voile ni vol de focus, avec installer / plus tard / ne plus proposer cette version, plutôt qu’une modale. Le raisonnement retenu : une modale interrompt au pire moment et revient à chaque lancement ; une carte attend sans gêner, et l’action reste de toute façon disponible dans les réglages.

**Implémenté le 23 octobre 2026** (`src/components/UpdateNotice.tsx`, `src/data/appUpdate.ts`, `src/styles.css`, harnais `?update=`) :

- annonce posée après la première peinture, `role="status"`, sans dialogue, sans attrape-focus, refermable par × (équivalent à « plus tard ») ;
- trois issues : installer maintenant, plus tard (valable pour la session), ne plus proposer cette version (enregistrée en base, réversible dans les réglages) ;
- notes de version dépliables, version nommée, erreur d’installation traduite en `role="alert"` ;
- revérification toutes les six heures, en plus de celle de l’ouverture, pour une session qui reste ouverte ;
- « Dernière vérification » horodatée dans les réglages ;
- la règle d’annonce est une fonction pure (`shouldAnnounce`) : recherche active, version trouvée, non ignorée, pas déjà affichée. Sept cas prouvés par test.
- preuves : `npm run verify` vert (131 portabilité, 134 i18n, 7 annonce), typecheck et build verts, recette navigateur `?update=0.6.11` 14 assertions sur 14 (annonce, traduction, fermeture, version ignorée enregistrée, focus non volé).

**Ce qui reste** : la recette Windows de l’updater (artefacts NSIS signés) avant de promettre l’annonce sur les deux plateformes ; l’état « téléchargement en cours avec progression » reste un simple libellé « Installation… ». Hors périmètre, comme décidé : aucune installation silencieuse.

### Ce qui reste (état vérifié le 23 octobre 2026)

- **À exercer avant de dire « validé »** : les sélecteurs de fichiers et de dossiers macOS réels et un parcours complet import, export, restauration sur profil synthétique ; la compatibilité iCloud Drive et Google Drive effective. Voir [PLAN_VERS_1.0.md](PLAN_VERS_1.0.md) (bloc 3.3) et [QA_IMPORT_EXPORT.md](QA_IMPORT_EXPORT.md).
- **Objectif futur confirmé** : portabilité intégrale de l’expérience, dans un JSON documenté (vues enregistrées, préférences pertinentes, historique réellement stocké). Le JSON actuel porte les fiches, les bibliothèques et leurs champs, pas toute l’installation.
- **Proposé, à arbitrer** (PLAN_VERS_1.0.md, bloc 5) : performance sur 5 000 fiches, accessibilité clavier et contrastes, export de diagnostic, recette Windows complète, mise à jour automatique du site à chaque release (le site affiche 0.6.8, l’application est en 0.6.10), tests dans le workflow de publication (les deux workflows contrôlent le proxy mais n’exécutent ni `npm run verify` ni `cargo test`).
- **Hors premier lot des bibliothèques personnalisées, non planifié** : vues enregistrées, accueil, import et export unitaires, recherche de métadonnées.
- **Plus tard, hors périmètre actif** : service payant multi-appareil.
- **Écart à arbitrer** : AGENTS.md et ce document décrivent une cible macOS seule et aucun chantier Windows, alors que le README, le workflow `windows-release.yml` et le site proposent un installateur Windows.
- **Déjà fait, à ne pas rouvrir** : proxy de clés, contrôle du proxy dans les workflows de release, copie de la base avant migration, notes de version affichées avant l’installation, mention TMDB dans l’application.

## Actualisation du 22 octobre 2026

Le bloc d’ouverture publique (MIT, updater sans jeton, proxy serveur) est livré. Le **bloc 2 import/export est implémenté et vérifié localement**, avec guides tiers, confirmations, portée explicite des exports et protections de fichiers ; aucun push ni nouvelle publication dans ce lot. Les limites de formats, le corpus synthétique et les essais natifs restant à exercer figurent dans [QA_IMPORT_EXPORT.md](QA_IMPORT_EXPORT.md). Le périmètre courant des prochains blocs est détaillé dans [PLAN_VERS_1.0.md](PLAN_VERS_1.0.md) ; les sections datées du 16 octobre ci-dessous décrivent l’état antérieur.

### Lot onboarding et sauvegardes : implémenté localement, non publié

Livré dans l’arbre de travail le 22 octobre 2026 : premier lancement à trois départs (vide, restauration Sylloge, import d’un service), choix du dossier des futures sauvegardes avec première copie après finalisation, restauration du JSON de profil (sept bibliothèques) depuis l’onboarding et les réglages, libellés sans « cinq collections ». Rapport, limites et décisions à valider : [QA_ONBOARDING_SAUVEGARDES.md](QA_ONBOARDING_SAUVEGARDES.md).

Avant publication : arbitrer les décisions du rapport, exercer les sélecteurs macOS, décider du commit sur une branche de travail. Un push sur `main` publierait une release.

Lot suivant, implémenté localement le même jour : conservation par paliers (3 récentes, 4 hebdomadaires, 6 mensuelles), noms explicites, liste et restauration des copies, recherche bornée des sauvegardes sur le Mac, Paramètres recomposés, suppression de profil corrigée pour l’animation et les mangas. Détails dans le même rapport.

Bloc 4, implémenté localement le 22 octobre 2026, non publié : bibliothèques personnalisées à partir de huit modèles prêts (Comics, Magazines, Livres audio, Musique, Podcasts, Documentaires et reportages, Spectacles, Jeux de société), ajoutées par le « + » de la barre latérale. Une table par modèle (migration 0021), JSON de sauvegarde en version 4. Comics quitte Livres. Rapport : [QA_BIBLIOTHEQUES_PERSONNALISEES.md](QA_BIBLIOTHEQUES_PERSONNALISEES.md).

Planifié, non commencé : récupération de toute l’expérience Sylloge dans un JSON documenté, conversions vers d’autres services, restauration de base `.db` (hors parcours standard).

## Cible confirmée

Sylloge est une application personnelle utilisée localement sur Mac. Elle compte sept bibliothèques de base, une seule base `sylloge.db` et une table par bibliothèque : `films`, `series`, `anime`, `books`, `mangas`, `games`, `artworks`. Décision du 20 octobre 2026 : la séparation n’est pas seulement visuelle, chaque bibliothèque possède sa table et ses fiches. Depuis le 22 octobre 2026, un profil peut ajouter des bibliothèques personnalisées tirées de modèles prêts, chacune avec sa table (`comics`, `magazines`, `audiobooks`, `music`, `podcasts`, `documentaries`, `shows`, `board_games`). Le but des prochains changements est de rendre l’application plus claire, cohérente, fiable et agréable à utiliser.

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
