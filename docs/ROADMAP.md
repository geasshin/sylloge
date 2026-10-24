# Feuille de route de Sylloge

**État au 24 octobre 2026.** Cette feuille de route remplace les anciens trains et versions décrits dans les archives. Aucun numéro de version n’est attribué aux prochains lots : chaque push sur `main` publie automatiquement une release corrective.

## Actualisation du 24 octobre 2026

**v0.6.11 est publiée** (23 octobre) : première release par la chaîne unique, manifeste `latest.json` à trois cibles (macOS Apple Silicon et Intel, Windows) vérifié, adresses répondant.

**v0.6.12 est publiée** (24 octobre), avec :

- **Défaut de la v0.6.11 corrigé** : restaurer un profil au premier lancement ou depuis la fenêtre « Restaurer » ne réappliquait pas les vues enregistrées ni les préférences d’un document v5. Un seul des deux chemins d’import appelait la restauration de l’expérience. Voir [PORTABILITE.md](PORTABILITE.md).
- **Bilan de restauration affiché** (vues restaurées, renommées, préférences appliquées), et aperçu qui annonce, avant d’écrire, ce que le document emporte.
- **Message pour une sauvegarde plus récente** que l’application : « Mettre l’application à jour pour la restaurer ».
- **Paramètres › Sauvegarde recomposée** : la ligne « Rythme » (sans réglage) disparaît, le rythme se lit dans « Sauvegarder maintenant » ; conseil de dossier synchronisé ; le sélecteur de dossier s’ouvre sur iCloud Drive (sinon Documents) et Sylloge crée lui-même un dossier « Sylloge » dans le dossier choisi, sauf si celui-ci porte déjà ce nom ; la restauration n’a plus qu’une action principale (« Rechercher sur ce Mac »), le fichier ou le dossier manuels sont regroupés sous une phrase.
- **Site de téléchargement toujours à jour** : ses boutons pointent vers `releases/latest/download/<nom fixe>` ; `release.yml` attache deux copies à nom fixe à chaque release et refuse de publier si l’une manque. Plus d’installateur dans le dépôt du site, plus de numéro de version à mettre à jour. Mention TMDB rétablie en pied de page.

Non exercé : le sélecteur de dossier macOS réel (ouverture sur iCloud Drive, création du dossier « Sylloge » depuis l’application native) ; seules les fonctions de résolution du dossier sont testées, par des tests Rust. Vu à l'usage par Aurélien le 24 octobre : le dossier « Sylloge » est bien créé dans le dossier choisi.

**Lot suivant (v0.6.13), implémenté et vérifié localement, non publié :**

- **Liens externes réparés en natif** : aucun des douze liens `https` de l'application ne s'ouvrait dans la fenêtre Tauri (bouton « Ouvrir le site de Letterboxd », aides d'import, À propos, crédits TMDB et IGDB). Un écouteur unique (`src/data/externalLinks.ts`) confie désormais tout lien `https://` au navigateur du système par le plugin officiel `tauri-plugin-opener` (permission limitée à `https://*`). Nouvelle dépendance : `tauri-plugin-opener` 2.5.5 et `@tauri-apps/plugin-opener` 2.5.5 (la ligne 3.x est en alpha, la 2.7 aurait changé `wry`). **Non exercé en natif** : le harnais enregistre l'appel d'ouverture, il ne lance pas de navigateur.
- **Contour des champs de formulaire** : l'anneau de focus débordait de 1 px à l'extérieur du champ et le conteneur défilant des fenêtres rognait ce débord (haut et gauche à 1 px, bas et droite à 2 px). Il est dessiné à l'intérieur de la boîte, sur les champs, la recherche et les listes. Le titre « en lecture » ne décale plus son texte au focus.
- **Restauration** : un seul geste principal « Rechercher sur ce Mac », et « Choisir un fichier JSON » en vrai bouton à côté ; le bouton « Parcourir un dossier de sauvegardes » est retiré (la recherche liste déjà toutes les copies, le sélecteur de fichier couvre une clé USB).
- **Réglages** : la rangée « Tout le profil › Ouvrir Sauvegarde » de « Importer et exporter », qui ne faisait que renvoyer, est supprimée.
- **Barre latérale** : plus de sous-titre « Ajouter » / « Ajoutées » ; les bibliothèques ajoutées suivent directement celles de base.

## Actualisation du 23 octobre 2026

**Les lots du 22 octobre sont dans `main`.** Imports guidés, onboarding et sauvegardes, bibliothèques personnalisées et citations ont été livrés par `93d1348`, corrigés par `03a1945` et `240e7ed`, puis tagués `v0.6.10`. Les mentions « implémenté localement, non publié » des sections qui suivent et de [PLAN_VERS_1.0.md](PLAN_VERS_1.0.md) datent du 22 octobre et ne décrivent plus l’état du dépôt.

**Interface bilingue : décidée par Aurélien le 23 octobre 2026, publiée dans la v0.6.11.** Français et anglais dans l’application et sur le site : langue détectée au premier lancement (première langue prise en charge de `navigator.languages`, anglais à défaut), choix dans Paramètres › Général et sur le premier écran, mémorisé sur l’appareil, changement sans rechargement. Le français reste la langue source. Fonctionnement, contrôles et limites : [I18N.md](I18N.md). Le site est en ligne.

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
- **Portabilité intégrale, publiée le 23 octobre 2026 (v0.6.11)** : le document de profil passe en **v5** et porte les vues enregistrées et les préférences d’affichage (thème, langue, lecture automatique, barre épinglée), en plus des fiches. Les versions 1 à 4 restent lisibles ; un document v5 sans expérience l’écrit explicitement. Restent dehors, volontairement : dossier de sauvegarde (chemin absolu de cette machine), liste des copies, caches, version ignorée des mises à jour. Détail : [PORTABILITE.md](PORTABILITE.md). Le bilan de restauration est affiché depuis la v0.6.12 (voir l’actualisation du 24 octobre) ; l’historique d’activité se recompose déjà depuis les dates des fiches, il n’a pas à voyager.
- **Proposé, à arbitrer** (PLAN_VERS_1.0.md, bloc 5) : accessibilité clavier et contrastes, export de diagnostic, tests dans le workflow de publication (il contrôle le proxy et vérifie les artefacts, mais n’exécute ni `npm run verify` ni `cargo test`).
- **Exports aux formats des services tiers, demandés par Aurélien le 24 octobre 2026** (à instruire, rien d’écrit). Objectif : que le fichier s’importe sans retouche ailleurs. Vérifié auprès des pages officielles :
  - **Letterboxd (CSV)** : faisable avec exactitude pour les films. Colonnes officielles `tmdbID`, `imdbID`, `Title`, `Year`, `Directors`, `Rating` (0,5 à 5 par demi-points) ou `Rating10`, `WatchedDate` (AAAA-MM-JJ), `Rewatch`, `Tags`, `Review`. Sylloge conserve l’identifiant TMDB des films associés : correspondance exacte pour eux, approximative (titre, année, réalisateur) pour les autres. À prévoir : la « liste à voir » est un import distinct côté Letterboxd, donc un second fichier ; limite de 1 Mo par fichier, donc découpage avec l’en-tête répété ; le champ « favori » n’existe pas dans leur format d’import ; l’échappement des guillemets est celui de Letterboxd (barre oblique inverse), à tester contre un vrai import.
  - **Goodreads (CSV)** : faisable, en reprenant l’en-tête complet d’un export réel (`Title`, `Author`, `ISBN13`, `My Rating`, `Date Read`, `Date Added`, `Bookshelves`, `Exclusive Shelf`, `My Review`, `Read Count`, etc., dates AAAA/MM/JJ). Sylloge ne stocke pas d’ISBN : la correspondance se fera par titre et auteur, sans garantie d’exactitude.
  - **MyAnimeList (XML)** : **bloqué en l’état.** Le format exige l’identifiant MyAnimeList de chaque œuvre (`series_animedb_id`, `manga_mangadb_id`) et `update_on_import` à 1 ; sans identifiant, rien ne peut être ajouté. Sylloge ne stocke ni cet identifiant, ni le nombre d’épisodes (il suit des saisons). Il faudrait résoudre les identifiants par un service tiers (AniList ou Jikan, avec confirmation des correspondances ambiguës) ou les saisir à l’ajout : décision produit et service externe à arbitrer. À vérifier aussi : MyAnimeList lui-même n’est pas sûr d’accepter l’import (des sources se contredisent) ; AniList et Kitsu, eux, lisent ce XML.
- **Cartes à partager, idée d’Aurélien le 24 octobre 2026** (à instruire) : un résumé visuel à envoyer à ses proches ou à publier : coups de cœur, mieux notés, classement, vus récemment ; pour une bibliothèque ou pour tout le profil. Format privilégié : **image PNG** (la seule qui se partage partout, réseaux sociaux compris), sans serveur ni compte, composée dans l’application. Le HTML partageable en ligne est écarté : une page à une adresse publique demande un hébergement, un compte et de la modération. Un fichier HTML autonome resterait possible mais lisible seulement une fois téléchargé, donc de peu d’intérêt pour partager. À vérifier avant de s’engager : le dessin de l’image avec les affiches distantes (autorisations d’affichage inter-sites des images TMDB, sinon l’image ne peut pas être exportée) et le choix entre une bibliothèque de rendu (nouvelle dépendance) ou un dessin direct sur canevas (aucune).
- **Performance à 5 000 fiches : non demandée pour l’instant** (23 octobre 2026). L’usage réel est déjà fluide avec plusieurs milliers de fiches ; ne pas ouvrir ce chantier sans gêne mesurée.
- **Windows, mise à jour automatique** : deux défauts, corrigés le 23 octobre 2026 (v0.6.11). Le manifeste `latest.json` ne publiait que les cibles macOS, donc `tauri-plugin-updater` répondait `TargetNotFound` et l’échec s’affichait comme une panne réseau. Et le workflow Windows ne partait jamais seul : le tag créé par `gh release create` ne déclenche aucun workflow. Les deux anciens workflows sont remplacés par `release.yml` : macOS et Windows construisent en parallèle, un troisième job assemble le manifeste des trois cibles, le relit, puis ouvre la release ; un build Windows en échec bloque la publication au lieu de livrer une release muette. Le diagnostic distingue « manifeste absent » de « plateforme absente ». La première publication par `release.yml` (v0.6.11) s’est déroulée sans accroc : trois cibles dans le manifeste, adresses vérifiées. Reste à éprouver, sur une vraie machine Windows : l’installation d’une version antérieure, l’annonce, l’installation de la nouvelle et l’intégrité de la base. Voir [UPDATER.md](UPDATER.md).
- **Recettes de cuisine, publiées le 23 octobre 2026 (v0.6.11)** : neuvième modèle de bibliothèque personnalisée, avec sa propre table `recipes` (migration 0022, qui reconstruit `profile_libraries` pour élargir sa contrainte). Champs : source, type de plat, portions, préparation, cuisson, **ingrédients** et **étapes** en textes longs enregistrés tels que saisis (lignes vides comprises), photo par lien, note, favori, avis. Statuts : À essayer, Testée, Écartée. Famille « Cuisine » dans le catalogue, pictogramme toque de chef, français et anglais. Les ingrédients sont un texte libre, pas une liste structurée : quantité, unité et nom séparés permettraient plus tard de recalculer les portions ou de faire une liste de courses, au prix d’un modèle de données plus lourd, à ne décider que si le besoin apparaît. Une sauvegarde contenant des recettes n’est pas lisible par une version antérieure de l’application. Rapport : [QA_BIBLIOTHEQUES_PERSONNALISEES.md](QA_BIBLIOTHEQUES_PERSONNALISEES.md).
- **Couvertures et affiches par lien, pour toutes les bibliothèques, publiées le 23 octobre 2026 (v0.6.11)** : le crayon sur le visuel d’un formulaire ou d’une fiche ouvre un dialogue d’adresse avec aperçu avant d’enregistrer ; seul le lien est conservé, aucune image n’est téléchargée. Trois défauts corrigés sur les films : une fiche associée à TMDB affichait « Sans affiche » dans le formulaire, le crayon du formulaire ne faisait rien, et la tuile « + » de la galerie était refusée par le cache TMDB. Règle d’affichage commune : [COUVERTURES.md](COUVERTURES.md).
- **Hors premier lot des bibliothèques personnalisées, non planifié** : accueil, import et export unitaires pour les bibliothèques ajoutées, recherche de métadonnées pour elles (les vues enregistrées, elles, sont livrées : document v5).
- **Plus tard, hors périmètre actif** : service payant multi-appareil.
- **Cible officielle : macOS et Windows** (arbitrage du 23 octobre 2026). AGENTS.md, README.md et ce document concordent : macOS publie une archive universelle, Windows un installeur NSIS, les deux par la même release.
- **Déjà fait, à ne pas rouvrir** : proxy de clés, contrôle du proxy dans le workflow de release, copie de la base avant migration, notes de version affichées avant l’installation, mention TMDB dans l’application, annonce de mise à jour dans l’application, entrée Windows dans le manifeste, chaîne de release unique macOS + Windows, document de profil v5, recettes de cuisine, couvertures par lien, site de téléchargement à liens fixes, bilan de restauration, message de sauvegarde plus récente, page Sauvegarde recomposée, composition des avertissements d’import CSV (« Note Note », « Saisons Compteur », « Début de visionnage Date »), débordement horizontal de l’accueil sous 820 px.

## Actualisation du 22 octobre 2026

Le bloc d’ouverture publique (MIT, updater sans jeton, proxy serveur) est livré. Le **bloc 2 import/export est implémenté et vérifié localement**, avec guides tiers, confirmations, portée explicite des exports et protections de fichiers ; aucun push ni nouvelle publication dans ce lot. Les limites de formats, le corpus synthétique et les essais natifs restant à exercer figurent dans [QA_IMPORT_EXPORT.md](QA_IMPORT_EXPORT.md). Le périmètre courant des prochains blocs est détaillé dans [PLAN_VERS_1.0.md](PLAN_VERS_1.0.md) ; les sections datées du 16 octobre ci-dessous décrivent l’état antérieur.

### Lot onboarding et sauvegardes : implémenté localement, non publié

Livré dans l’arbre de travail le 22 octobre 2026 : premier lancement à trois départs (vide, restauration Sylloge, import d’un service), choix du dossier des futures sauvegardes avec première copie après finalisation, restauration du JSON de profil (sept bibliothèques) depuis l’onboarding et les réglages, libellés sans « cinq collections ». Rapport, limites et décisions à valider : [QA_ONBOARDING_SAUVEGARDES.md](QA_ONBOARDING_SAUVEGARDES.md).

Avant publication : arbitrer les décisions du rapport, exercer les sélecteurs macOS, décider du commit sur une branche de travail. Un push sur `main` publierait une release.

Lot suivant, implémenté localement le même jour : conservation par paliers (3 récentes, 4 hebdomadaires, 6 mensuelles), noms explicites, liste et restauration des copies, recherche bornée des sauvegardes sur le Mac, Paramètres recomposés, suppression de profil corrigée pour l’animation et les mangas. Détails dans le même rapport.

Bloc 4, implémenté localement le 22 octobre 2026, non publié : bibliothèques personnalisées à partir de huit modèles prêts (Comics, Magazines, Livres audio, Musique, Podcasts, Documentaires et reportages, Spectacles, Jeux de société), ajoutées par le « + » de la barre latérale ; un neuvième, Recettes de cuisine, le 23 octobre (migration 0022). Une table par modèle (migration 0021), JSON de sauvegarde en version 4, puis 5 le 23 octobre. Comics quitte Livres. Rapport : [QA_BIBLIOTHEQUES_PERSONNALISEES.md](QA_BIBLIOTHEQUES_PERSONNALISEES.md).

Planifié, non commencé : récupération de toute l’expérience Sylloge dans un JSON documenté, conversions vers d’autres services, restauration de base `.db` (hors parcours standard).

## Cible confirmée

Sylloge est une application personnelle utilisée localement sur Mac. Elle compte sept bibliothèques de base, une seule base `sylloge.db` et une table par bibliothèque : `films`, `series`, `anime`, `books`, `mangas`, `games`, `artworks`. Décision du 20 octobre 2026 : la séparation n’est pas seulement visuelle, chaque bibliothèque possède sa table et ses fiches. Depuis le 22 octobre 2026, un profil peut ajouter des bibliothèques personnalisées tirées de modèles prêts, chacune avec sa table (`comics`, `magazines`, `audiobooks`, `music`, `podcasts`, `documentaries`, `shows`, `board_games`). Le but des prochains changements est de rendre l’application plus claire, cohérente, fiable et agréable à utiliser.

Windows est publié depuis la v0.6.11 (installeur NSIS, mise à jour automatique). Aucun chantier de bêta publique n’est actif.

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
