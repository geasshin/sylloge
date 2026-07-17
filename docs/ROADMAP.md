# Sylloge — feuille de route vers la V1 publique

> **Statut :** feuille de route active. Le jalon `0.2.0` est livré ; le prochain jalon proposé est `0.3.0`.
>
> Les versions sont des hypothèses de séquencement, pas des promesses de calendrier. Une version ne démarre qu’après la validation de la précédente et peut être découpée si l’audit technique montre qu’elle est trop large.

## 1. Promesse de la V1 publique

La V1 doit être une application culturelle personnelle **téléchargeable sur macOS et Windows**, locale par défaut, durable et soignée. Elle doit permettre de constituer, retrouver, enrichir et sauvegarder sa bibliothèque sans compte obligatoire, publicité, recommandation algorithmique ni dépendance à un fournisseur externe.

La V1 ne comprend pas la synchronisation gérée par Sylloge, le freemium, les comptes, la web app connectée ni les applications mobiles natives. Ces chantiers relèvent de la V2 ou de la V3.

### Invariants non négociables

- Les données restent localement contrôlées ; SQLite est la source de vérité sur l’appareil.
- Les exports sont lisibles, versionnés et jamais réservés à une offre payante.
- Les imports sont prévisualisés, validés et ne doivent jamais écraser silencieusement une bibliothèque.
- Une base SQLite active ne doit **jamais** être synchronisée directement par iCloud, Dropbox, Google Drive ou équivalent.
- Les sauvegardes cloud de V1 sont des **instantanés cohérents** (JSON et, si utile plus tard, snapshot fermé), déposés dans un dossier choisi par la personne.
- L’ajout manuel reste possible sans API ; les métadonnées externes restent une aide modifiable, jamais une autorité.
- Le produit reste une bibliothèque culturelle, pas un réseau social, un tracker de productivité ou une plateforme de streaming.

## 2. Baseline existante — `0.1.0`

**État : code construit et tests techniques verts ; validation manuelle native encore à formaliser.**

Déjà présent :

- application React / TypeScript / Vite emballée avec Tauri 2 pour macOS ;
- SQLite locale, migrations et profil `default` ;
- bibliothèque Films, création, modification, suppression confirmée et persistance ;
- recherche, filtres, fiche, affiches distantes facultatives et fallback ;
- profils locaux minimaux ;
- export et import JSON v1 dans un nouveau profil, avec validation et transaction atomique ;
- identité Archive calme, icône Sylloge et bundle macOS local.

La baseline ne doit pas être confondue avec une V1 publique : elle n’a pas encore la preuve d’usage, l’interopérabilité, la couverture multi-médiums ni la distribution Windows.

## 3. Versions de consolidation proches

### `0.1.1` — Stabilisation native Films

**But :** transformer la baseline technique en première version réellement utilisable au quotidien sur macOS.

- Exercer et documenter le parcours manuel complet : créer → fermer → relancer → modifier → rechercher/filtrer → tester une affiche absente/cassée → supprimer → exporter → refuser un JSON invalide → importer dans un nouveau profil → relancer.
- Corriger uniquement les défauts bloquants révélés par ce parcours.
- Renforcer les tests des règles métier et des opérations SQLite qui ont révélé un risque.
- Vérifier l’accessibilité pratique : clavier, focus, messages d’erreur, libellés et contenus incomplets.
- Mettre à jour le numéro de version, la documentation et le tag.

**Exclusions :** aucune nouvelle source de données, aucun nouveau médium, aucun redesign global.

### `0.1.2` — Finition de l’expérience quotidienne

**But :** rendre Films agréable à consulter et à alimenter longtemps, sans changer sa promesse.

- Stabilisation visuelle de l’application native à des tailles de fenêtre réalistes, sans préjuger du front-end définitif prévu avant la V1.
- Corrections ciblées de hiérarchie, densité, formulaires, fiches, états vides et retours de navigation.
- Mouvement discret seulement là où il clarifie une transition ; pas d’animation décorative.
- Stabilisation des comportements de fenêtre, de la sidebar et des longs titres / notes / accents.
- Contrôle de la lisibilité de l’icône, de l’identité Archive calme et des fallbacks de visuels.

**Exclusions :** refonte complète du front-end, thème sombre, nouvelles collections ou métriques d’activité.

### `0.2.0` — Sauvegardes portables dans un dossier choisi

**Statut : livré et validé localement sur macOS.**

- Dossier choisi explicitement par profil, snapshots JSON v1 atomiques après le premier changement quotidien ou à la demande, conservation de 30 snapshots suivis et restauration par l’import contrôlé existant.
- Le registre local des snapshots garantit que la rétention ne supprime jamais un fichier seulement ressemblant à une sauvegarde Sylloge.
- La base SQLite vivante, son WAL et son SHM ne sont ni copiés ni synchronisés.

### `0.3.0` — Paramètres et mises à jour distribuées

**But :** rendre les réglages locaux compréhensibles et préparer un vrai cycle de mise à jour, sans confondre une branche Git avec une application distribuée.

- Ajouter une page Accueil calme, distincte de la grille Films et non conçue comme un dashboard : profil courant, point d’entrée pour ajouter un film ou parcourir la collection, et repères minimaux sur la bibliothèque locale.
- Remplacer l’entrée « Profils et JSON » de la navigation par une icône Paramètres claire et accessible ; y organiser des sections sobres : **Profils**, **Données et sauvegardes**, **Application** et **À propos**.
- Dans Profils : ouvrir, créer, renommer et supprimer un profil local. La suppression doit être explicitement confirmée, annoncer le nombre de films concernés, ne jamais supprimer le dernier profil utilisable ni le profil actuellement ouvert : il faut d’abord ouvrir un autre profil. Un import ne doit jamais déclencher une suppression.
- Dans Données et sauvegardes : regrouper snapshots portables, export JSON et import dans un nouveau profil. Sylloge utilise SQLite locale ; aucun serveur MySQL ou administration de base distante n’entre dans le produit.
- Ajouter un onboarding obligatoire de premier lancement : choisir un nom de profil puis démarrer une bibliothèque vide ou importer un JSON existant. Il reste accessible plus tard depuis les Paramètres, ne force ni import ni compte et ne réapparaît pas après une configuration réussie.
- À propos affiche le nom, la version installée, les informations locales utiles et l’état de recherche de mise à jour.
- Mettre en place un mécanisme de mise à jour Tauri qui consulte uniquement des **releases publiées et signées** ; l’application ne doit jamais traiter une nouvelle révision de `main` comme une mise à jour téléchargeable.
- Lorsqu’une release plus récente existe : alerte accessible avec version et notes ; choix « Télécharger et installer », « Plus tard » et « Ignorer cette version » ; réglage explicite pour désactiver la recherche automatique tout en gardant une vérification manuelle dans À propos.
- Valider les migrations et l’ouverture d’une bibliothèque existante après installation d’un nouveau bundle ; une mise à jour ne doit jamais effacer, déplacer ni synchroniser la SQLite vivante.
- Définir une publication de jalon : version cohérente dans les manifestes, artefact macOS, signature de l’updater, tag Git et release GitHub. La source de mise à jour est cette release, non le dépôt de travail.

**Gates avant implémentation :** politiques produit validées : un autre profil doit être ouvert avant toute suppression du profil courant ; le premier lancement demande un nom et le choix entre bibliothèque vide ou import. Restent à choisir le mode de signature de l’updater, à vérifier l’accès des installations au canal de releases GitHub et à définir une politique de conservation/rotation des clés. Aucun faux bouton « Mettre à jour » ne doit être affiché avant l’existence d’un artefact réellement installable.

### `0.4.0` — Interopérabilité CSV

**But :** permettre une migration raisonnable depuis des tableaux personnels sans transformer l’import en boîte noire.

- Export CSV documenté des champs Films stables.
- Import CSV UTF-8 avec aperçu, mapping de colonnes, validation des valeurs et rapport d’erreurs.
- Création d’un nouveau profil pour l’import, jamais fusion implicite.
- Jeux de fichiers réels anonymisés pour tester accents, notes, dates et colonnes absentes.

**Exclusions :** automatisation opaque des correspondances, import de plateformes sans export réel.

### `0.5.0` — Import Notion Markdown + CSV

**But :** récupérer proprement les collections existantes d’Aurélien et préparer un import réutilisable par d’autres personnes.

- Lecture d’un export Notion réel : CSV pour les propriétés, Markdown pour les sous-pages et notes longues.
- Aperçu de correspondance, conversion visible des notes `/10` vers `/5`, rapport détaillé avant écriture.
- Gestion explicite des fichiers incomplets, doublons et liens d’images temporaires.
- Documentation de l’export Notion attendu et tests sur des fixtures contrôlées.

**Exclusions :** traitement d’URLs Notion temporaires comme affiches permanentes.

### `0.6.0` — Métadonnées Films assistées

**But :** accélérer l’ajout de films sans abandonner le contrôle éditorial local.

- Étude puis intégration d’un fournisseur adapté, probablement TMDB, après vérification actuelle de ses conditions, attribution, langue et limites.
- Recherche à partir d’un titre, liste de résultats, sélection humaine et préremplissage éditable.
- Conservation de la provenance et de l’identifiant fournisseur lorsque utilisés.
- Fonctionnement manuel intégral en cas d’absence de réseau ou de refus du fournisseur.

**Gate d’escalade :** aucune API n’est intégrée tant que ses conditions et obligations de distribution publique ne sont pas validées.

## 4. Extension culturelle — décision de périmètre indispensable

La promesse générale de Sylloge est multi-médiums : Films, Séries, Livres, Jeux et Art. La baseline ne couvre aujourd’hui que Films.

Avant de programmer les versions suivantes, Aurélien doit trancher l’un des deux contrats publics :

- **Option A — V1 Films assumée :** la V1 publique reste une excellente bibliothèque de Films ; les autres médiums arrivent en `1.x`.
- **Option B — V1 culturelle complète :** la V1 publique doit inclure les cinq médiums. C’est plus fidèle au nom et à la vision, mais repousse considérablement la date de sortie car chaque médium demande un modèle et des flux propres.

La feuille de route ci-dessous suppose par défaut l’**option B**, parce que le produit est présenté comme une bibliothèque culturelle globale. Elle sera ajustée après décision.

### `0.7.0` — Socle multi-médiums

- Faire évoluer les fondations de données sans casser les exports Films existants.
- Définir les champs communs et les champs strictement spécifiques ; aucune abstraction générique qui gommerait les différences réelles.
- Étendre recherche, filtres, collections, profils, exports et sauvegardes aux nouveaux types.
- Écrire des migrations et tests de compatibilité avec les bibliothèques `0.1.x–0.5.x`.

### Lot interne du jalon `0.7.0` — Séries

- Statuts, fiche, création manuelle et données propres aux séries.
- Décider explicitement si le suivi par saison/épisode est une fonction de V1 ou une amélioration ultérieure ; ne pas le faire à moitié.

### Lot interne du jalon `0.7.0` — Livres

- Fiche Livre, création manuelle, statut, notes personnelles, recherche, import/export et enrichissement ultérieur.
- Décider avant implémentation si pagination, édition, traduction et relecture sont nécessaires au premier parcours.

### Lot interne du jalon `0.7.0` — Jeux et Art

- Deux verticales séparées, avec modèles adaptés plutôt qu’une copie de Films.
- Jeux : plateforme, temps ou sessions seulement si leur utilité est validée.
- Art : œuvre, artiste, exposition / lieu seulement si ces distinctions servent réellement la mémoire personnelle.

## 5. Préparation de la V1 publique

### `0.8.0` — Front-end définitif et langage visuel de V1

**But :** faire de Sylloge une application desktop visuellement cohérente, agréable et pleinement maîtrisée avant la V1, sans ajouter de capacité produit.

- Établir le contrat visuel définitif dans `DESIGN.md` : palette par rôles, hiérarchie typographique, échelles d’espacement, rayons, bordures, icônes, états et règles de composition. La direction « Archive calme » reste le socle ; il ne s’agit ni d’un look SaaS ni d’un dashboard.
- Définir puis implémenter les tailles **minimale**, de référence et **maximale** de la fenêtre native, avec un comportement explicite en plein écran. L’application ne doit plus pouvoir être réduite à une largeur ou hauteur qui rend ses flux inutilisables.
- Concevoir les compositions desktop dans la plage de tailles retenue : sidebar, page Accueil, bibliothèque, recherche et filtres, fiches, formulaires, Paramètres, onboarding, dialogues et états vides / erreur / chargement. Le responsive ne doit pas dériver vers une interface mobile improvisée.
- Reprendre les composants communs de manière systématique : boutons, champs, sélecteurs, filtres, navigation, cartes, panneaux, alertes et confirmations ; chaque état normal, survolé, actif, désactivé, focus clavier et erreur doit être défini et cohérent.
- Donner une identité éditoriale à la page Accueil et aux vues de collection : rythme, densité, surfaces, images et espaces négatifs au service des œuvres, plutôt qu’une accumulation de widgets ou de métriques.
- Définir un langage de mouvement utile et sobre pour les changements de vue, ouverture de fiche, dialogues et retours d’action ; respecter `prefers-reduced-motion` et ne jamais faire dépendre la compréhension d’une animation.
- Valider visuellement et au clavier les parcours principaux sur les tailles de fenêtre cibles, avec contenus courts, longs, incomplets et affiches absentes ou cassées.

**Gates avant implémentation :** inventorier toutes les surfaces V1 réellement présentes ; valider une direction visuelle unique et ses écrans de référence ; fixer les valeurs de fenêtre minimale, de référence et maximale après essai natif ; documenter les critères d’acceptation accessibles et les règles de mouvement. Aucun nouveau médium ni flux fonctionnel ne doit être ajouté au prétexte du redesign.

**Exclusions :** thème sombre, données de démonstration inventées, nouveau médium, API, cloud, compte, synchronisation, modification du modèle de données ou des formats d’import/export.

### `0.9.0` — Fiabilité, qualité et confidentialité

- Tests de migration, import/export, compatibilité de formats et scénarios de restauration.
- Régression visuelle et d’accessibilité sur les flux principaux.
- Journalisation locale utile, sans données personnelles envoyées à un tiers.
- Documentation d’usage, sauvegarde, récupération, limites et politique de confidentialité locale.
- Audit des dépendances, permissions Tauri et licences des contenus / fournisseurs externes.

### `0.10.0` — Distribution macOS et Windows

- Build reproductible et test réel sur macOS et Windows.
- Installateurs appropriés, icônes, nom, version, documentation d’installation et mécanisme de mise à jour à décider.
- Signature et notarisation macOS ; stratégie de signature Windows à chiffrer avant engagement.
- Éviter de promettre une installation « sans alerte » sans certificats et validation sur les deux OS.
- Préparer le dépôt, les notes de version, les captures et une landing page légère.

### `1.0.0` — Première V1 publique

**Conditions de sortie :**

- périmètre multi-médiums ou Films-only explicitement assumé ;
- parcours principaux vérifiés sur macOS et Windows ;
- migration, export, import et restauration testés avec des données réelles ;
- esthétique et accessibilité validées sur les surfaces clés ;
- documentation claire, aucune fausse promesse de synchronisation ;
- distribution et support réalistes pour une bêta publique ;
- version taguée, notes de version publiées et landing page cohérente.

## 6. Après la V1 — à ne pas anticiper prématurément

### V2 — synchronisation et modèle économique optionnel

- comptes facultatifs ;
- synchronisation chiffrée et gestion de conflits ;
- backend et base synchronisée, éventuellement Supabase après étude des coûts, de la confidentialité et de la portabilité ;
- web app connectée ;
- freemium limité à ce qui génère réellement un coût d’infrastructure ou un confort de synchronisation.

Le local-first, l’export et les fonctions personnelles essentielles ne doivent pas être artificiellement dégradés pour forcer une offre payante.

### V3 — applications mobiles natives

- iOS et Android après validation de la V2 ;
- travail de synchronisation, navigation mobile, stockage local, offline et distribution stores ;
- ne pas présenter une version mobile comme une simple adaptation de la fenêtre desktop.

## 7. Backlog non priorisé

Les éléments suivants peuvent être utiles, mais n’entrent dans une version que lorsqu’un besoin concret les justifie :

- thème sombre ;
- tris supplémentaires et vues de collection ;
- tags, collections éditoriales ou listes personnelles ;
- localisation anglaise et autres langues ;
- statistiques personnelles sobres ;
- importateurs additionnels à partir d’exports réels ;
- traitement de doublons entre imports ;
- améliorations de performances pour des bibliothèques très volumineuses.

Aucun de ces items ne doit être ajouté « pour préparer l’avenir » sans un brief, des critères d’acceptation et une place dans une version.