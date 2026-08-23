# Sylloge — feuille de route vers la V1 publique

> **Statut :** feuille de route active. Les releases `0.2.0`, `0.3.0`, `0.4.0` et `0.5.0` sont livrées. `0.3.0` est la première release macOS signée publiée sur GitHub ; l’installation manuelle a été validée. Le train actif prépare la release publique `0.6.0` (front-end définitif) ; sa spécification détaillée vit dans [`plans/roadmap-future.md`](plans/roadmap-future.md), consultée à l'ouverture du train, et les jalons concernés sont réintégrés ici au fur et à mesure.
>
> Les releases publiques sont des hypothèses de séquencement, pas des promesses de calendrier. Elles sont construites par plusieurs jalons d’intégration étroits, chacun validé et commité avant le suivant.

## 1. Promesse de la V1 publique

La V1 doit être une application culturelle personnelle **téléchargeable sur macOS et Windows**, locale par défaut, durable et soignée. Elle doit permettre de constituer, retrouver, enrichir et sauvegarder sa bibliothèque sans compte obligatoire, publicité, recommandation algorithmique ni dépendance à un fournisseur externe.

La V1 comprend obligatoirement les cinq médiums **Films, Séries, Livres, Jeux et Art**. Elle ne comprend pas la synchronisation gérée par Sylloge, le freemium, les comptes, la web app connectée ni les applications mobiles natives. Ces chantiers relèvent de la V2 ou de la V3.

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

## 3. Rythme de livraison

Sylloge sépare volontairement le **jalon d’intégration** de la **release publique** : une release `X.Y.0` doit livrer un sujet complet et cohérent, plutôt qu’une seule fonctionnalité isolée.

- Les jalons tels que `0.3.1`, `0.3.2` ou `0.3.5` sont des repères de travail de la branche qui prépare `0.4.0`. Ils ont un périmètre unique, leurs propres critères d’acceptation, tests, QA manuelle et commits.
- Ils ne sont **ni** des tags, **ni** des versions de manifeste, **ni** des GitHub Releases. Sans cette règle, `0.3.1` serait une vraie patch release SemVer publique et brouillerait l’état réellement installable.
- Seule la clôture du train met à jour les manifestes, est fusionnée dans `main`, reçoit un tag et devient une GitHub Release signée.
- Le même mécanisme s’applique ensuite : les jalons `0.4.1…` préparent `0.5.0`, les `0.5.1…` préparent `0.6.0`, et ainsi de suite.

## 4. Jalon historique et release actuelle

### `0.1.1` — Stabilisation native Films

**Statut : objectif absorbé par les jalons livrés suivants.**

Le parcours Films, les corrections de persistance et les contrôles d’accessibilité révélés par l’usage ont été traités au fil de `0.2.0` et `0.3.0`. Ce libellé est conservé pour l’historique et ne désigne plus un futur lot.

### `0.1.2` — Finition de l’expérience quotidienne

**Statut : objectif absorbé par les jalons livrés suivants.**

Les améliorations nécessaires à l’usage quotidien ont été intégrées avant les releases `0.2.0` et `0.3.0`. Le front-end définitif reste un chantier distinct, préparé plus loin dans cette feuille de route.

### `0.2.0` — Sauvegardes portables dans un dossier choisi

**Statut : livré et validé localement sur macOS.**

- Dossier choisi explicitement par profil, snapshots JSON v1 atomiques après le premier changement quotidien ou à la demande, conservation de 30 snapshots suivis et restauration par l’import contrôlé existant.
- Le registre local des snapshots garantit que la rétention ne supprime jamais un fichier seulement ressemblant à une sauvegarde Sylloge.
- La base SQLite vivante, son WAL et son SHM ne sont ni copiés ni synchronisés.

### `0.3.0` — Paramètres et mises à jour distribuées

**But :** rendre les réglages locaux compréhensibles et préparer un vrai cycle de mise à jour, sans confondre une branche Git avec une application distribuée.

**État : livré.** La première release macOS signée est publiée sur GitHub avec son DMG, son archive d’updater, sa signature et son manifeste. L’installation manuelle est validée. La première preuve complète de mise à jour reste à exercer lors de la prochaine release publique signée ; la distribution macOS reste sans Developer ID.

- Ajouter une page Accueil calme, distincte de la grille Films et non conçue comme un dashboard : composition éditoriale pleine page fondée exclusivement sur les Films locaux réels, avec Vus récemment, Favoris, Films vus et un module contextuel. Les actions d’ajout et de parcours restent dans Films.
- Remplacer l’entrée « Profils et JSON » de la navigation par une icône Paramètres claire et accessible ; y organiser des sections sobres : **Profils**, **Données et sauvegardes**, **Application** et **À propos**.
- Dans Profils : ouvrir, créer, renommer et supprimer un profil local. La suppression doit être explicitement confirmée, annoncer le nombre de films concernés, ne jamais supprimer le dernier profil utilisable ni le profil actuellement ouvert : il faut d’abord ouvrir un autre profil. Un import ne doit jamais déclencher une suppression.
- Dans Données et sauvegardes : regrouper snapshots portables, export JSON et import dans un nouveau profil. Sylloge utilise SQLite locale ; aucun serveur MySQL ou administration de base distante n’entre dans le produit.
- Ajouter un onboarding obligatoire de premier lancement : choisir un nom de profil puis démarrer une bibliothèque vide ou importer un JSON existant. Il reste accessible plus tard depuis les Paramètres, ne force ni import ni compte et ne réapparaît pas après une configuration réussie.
- À propos affiche le nom, la version installée, les informations locales utiles et l’état de recherche de mise à jour.
- Mettre en place un mécanisme de mise à jour Tauri qui consulte uniquement des **releases publiées et signées** ; l’application ne doit jamais traiter une nouvelle révision de `main` comme une mise à jour téléchargeable.
- Lorsqu’une release plus récente existe : alerte accessible avec version et notes ; choix « Télécharger et installer », « Plus tard » et « Ignorer cette version » ; réglage explicite pour désactiver la recherche automatique tout en gardant une vérification manuelle dans À propos.
- Valider les migrations et l’ouverture d’une bibliothèque existante après installation d’un nouveau bundle ; une mise à jour ne doit jamais effacer, déplacer ni synchroniser la SQLite vivante.
- Définir une publication de jalon : version cohérente dans les manifestes, artefact macOS, signature de l’updater, tag Git et release GitHub. La source de mise à jour est cette release, non le dépôt de travail.

## 5. Train `0.4.0` — Import, export et métadonnées Films

**But de la release :** rendre la bibliothèque Films interopérable et plus rapide à enrichir, sans sacrifier la maîtrise locale, les imports contrôlés ou la saisie manuelle.

### `0.3.1` — Contrat d’export CSV et inventaire des données

- Définir les champs Films stables, leurs types, formats, valeurs vides et règles de compatibilité JSON v1 / CSV.
- Produire un export CSV UTF-8 lisible et documenté depuis une bibliothèque réelle.
- Créer les fixtures anonymisées nécessaires : accents, notes longues, dates, valeurs manquantes et affiches absentes.

### `0.3.2` — Imports CSV et Notion contrôlés

- Importer un CSV avec aperçu, mapping explicite, validation des valeurs et rapport d’erreurs avant écriture.
- Lire un export Notion réel : CSV pour les propriétés et Markdown pour les sous-pages / notes longues.
- Convertir visiblement les notations `/10` vers `/5`, traiter les colonnes absentes et créer toujours un nouveau profil, sans fusion implicite.
- Ne jamais conserver une URL Notion temporaire comme affiche permanente.

### `0.3.3` — Parcours de métadonnées assistées sans dépendance imposée

**État : livré.** Le parcours de création sépare la saisie manuelle et l’enrichissement assisté. En l’absence de fournisseur configuré, il n’invente ni résultat ni connexion réseau et renvoie explicitement vers la saisie manuelle. Le contrat local prépare la recherche, la sélection humaine, le préremplissage modifiable et la provenance atomique `providerName` / `providerId`, sans migration ni changement des formats JSON / CSV v1.

- Définir le parcours de recherche, sélection humaine et préremplissage éditable d’une fiche Film.
- Préparer les champs de provenance et d’identifiant fournisseur uniquement s’ils sont justifiés par le contrat de données ; l’ajout manuel reste toujours intégralement possible hors ligne.
- Tester les états réseau indisponible, résultat incomplet et abandon sans écriture accidentelle.

### `0.3.4` — Normalisation et preuve de compatibilité des données

- Comparer le modèle Films courant aux données réellement récupérées depuis JSON, CSV et Notion Markdown + CSV.
- Décider, documenter et tester ce qui est conservé, ajouté, transformé ou explicitement non importé ; aucune donnée ne doit être inventée pour combler une absence.
- Écrire les migrations et tests de réimport nécessaires avant de figer le contrat de `0.4.0`.

### `0.3.5` — Intégration TMDB avec clé embarquée

**État : livré côté code et preuves automatisées ; reste la QA native macOS avec la vraie clé avant clôture du train.** La recherche, l'association explicite, la présentation enrichie, le choix d'affiche persisté et le renouvellement automatique sont implémentés. Les tests d'intégration prouvent que le cache TMDB ne fuite ni dans les exports JSON/CSV ni dans les snapshots, et qu'un export v1 historique se réimporte sur une base migrée.

- Vérifier avant tout code les conditions actuelles de TMDB, l’attribution, la langue, les limites et les obligations de distribution publique.
- Clé API **embarquée par le développeur** dans le binaire (`embedded_key.rs`, ignorée par Git), sans secret dans le dépôt, les exports, les snapshots ni les logs. Modèle réservé à un usage gratuit et non commercial, diffusé à des personnes de confiance.
- Connecter la recherche et le préremplissage à TMDB ; conserver provenance, identifiant fournisseur et modification humaine des données reçues. Cache renouvelable J+80/J+180, purge et renouvellement automatique au démarrage.

**Gate d’escalade :** si les conditions de TMDB, la confidentialité de la clé ou l’attribution ne sont pas satisfaisantes, `0.3.5` s’arrête et `0.4.0` est redéfini sans intégration réseau plutôt que de contourner la contrainte. Toute distribution publique ou commerciale impose de revoir le modèle de clé et la licence TMDB.

### `0.4.0` — Release publique Import, export et métadonnées Films

- Revoir l’ensemble des commits `0.3.1…0.3.5`, les fusionner uniquement après validation humaine de chaque parcours et mettre à jour manifestes, documentation et notes de release.
- Exercer les parcours complets export CSV, import CSV, import Notion, import JSON, restauration, enrichissement assisté et ajout manuel hors ligne.
- Publier une release signée après feu vert explicite. Elle sert aussi de seconde version réelle pour éprouver l’updater depuis une installation `0.3.0`, sans modifier ou déplacer la SQLite vivante.

**Exclusions :** import opaque de plateformes sans export réel, fusion implicite, synchronisation cloud, compte, remplacement de la saisie manuelle ou récupération d’images depuis des URLs temporaires.

## 6. Extension culturelle — périmètre V1 obligatoire

La V1 de Sylloge est une bibliothèque multi-médiums : **Films, Séries, Livres, Jeux et Art**. La baseline et la release `0.3.0` ne couvrent aujourd’hui que Films ; le train `0.5.0` doit donc livrer les quatre verticales restantes sans compromettre les données Films existantes.

Les cinq médiums sont un contrat produit, pas une option. Les décisions encore nécessaires concernent uniquement le niveau de détail utile à chaque verticale :

- Séries : le suivi par saison / épisode est-il requis dès la V1 ?
- Livres : pagination, édition, traduction et relecture sont-elles utiles au premier parcours ?
- Jeux : plateforme, temps de jeu ou sessions apportent-ils une valeur réelle sans transformer Sylloge en tracker ?
- Art : artiste, exposition et lieu servent-ils effectivement la recherche et la mémoire personnelle ?

## 7. Train `0.5.0` — Extension culturelle

**But de la release :** étendre Sylloge à ses médiums explicitement retenus, chacun avec une verticale utile, sans les réduire artificiellement au modèle Films.

### `0.4.1` — Contrat public et inventaire des modèles

**État : décisions produit actées avec Aurélien le 19 juillet 2026. Ce contrat est la référence des jalons `0.4.2` à `0.4.9`.**

Objectifs initiaux du jalon :

- Confirmer les cinq médiums de V1 et trancher les décisions de granularité propres à chacun avant toute migration.
- Écrire les critères d’acceptation de chaque verticale : saisie manuelle, fiche, recherche, statut, import/export, affiches et fallbacks.
- Distinguer les champs réellement communs des champs spécifiques ; refuser une abstraction générique qui gomme les différences de pratique.
- Arrêter explicitement les sujets qui ne sont pas de V1, notamment le suivi détaillé d’épisodes, les sessions de jeu ou la granularité d’un catalogue d’exposition.

#### Principes transversaux actés

- Une œuvre = une entrée ; une seule note /5 et un seul avis par œuvre, quelle que soit sa longueur (saisons, tomes). Si la qualité d'une œuvre longue se dégrade, c'est l'utilisateur qui ajuste sa note globale.
- Coup de cœur sur les cinq médiums ; note /5 sur Films, Séries, Livres et Jeux — **pas de note pour l'Art**.
- Le statut **Abandonné** est ajouté à tous les médiums, Films compris (migration prévue au jalon `0.4.2`).
- Le tri « récent » s'appuie sur un horodatage interne de dernière progression (saison ou tome ajouté, avancement modifié), distinct des dates saisies par l'utilisateur ; une saison ou un tome supplémentaire fait remonter l'œuvre dans la vue récente.
- Les libellés de statut sont adaptés à chaque médium ; aucun libellé unique n'est imposé.
- L'affiche reste facultative partout, avec le fallback neutre existant.

#### Séries

- Granularité : la série entière, jamais l'épisode ni le détail saison par saison.
- Statuts : **À voir, En cours, Abandonnée, Vue**. « En cours » couvre le visionnage actif, l'attente d'une nouvelle saison et la mise de côté temporaire ; il n'y a pas de statut « en pause » distinct.
- Compteur de **saisons vues**, visible dès que la série est commencée (En cours, Abandonnée).
- Passer à « Vue » renseigne le compteur au total de saisons connu ; si le total augmente ensuite, la série repasse en « En cours ». Saisons vues et total sont saisis manuellement via un compteur dédié (boutons +/−, interaction fluide, pas de champ numérique brut) ; aucune mise à jour automatique par fournisseur n'est prévue dans ce train.
- Champs : affiche, titre, showrunner, casting, résumé, catégorie (**Série télé / Animation**), note, avis, coup de cœur, date de début de visionnage (début de la saison 1).
- Vues : globale, Séries télé, Animation ; chacune triable par récent, note et favoris. La présentation exacte relève du train `0.6.0`.

#### Livres

- Catégories : **Livre, Manga, Comics**, avec vues dédiées.
- Statuts : **À lire, En cours, Abandonné, Lu**.
- Compteur de **tomes** pour Manga et Comics, même mécanique que les saisons des Séries.
- Champs : couverture, titre, auteur, année de parution, résumé, note, avis, coup de cœur, date de début de lecture (premier tome ou début de l'ouvrage).
- **Citations** : liste de citations personnelles par fiche, affichées une par une dans un espace escamotable ; ni tableur ni base imbriquée.
- Exclus : pagination, édition, traduction, relecture.

#### Jeux

- Statuts : **À jouer, En cours, Joué, Abandonné, Regardé** (let's play, YouTube/Twitch).
- Champs : cover, titre, développeur, plateforme, année de sortie, note, avis, coup de cœur, date de jeu.
- **Plateforme** : suggestions initiales sobres (PC et principales consoles récentes ou anciennes) complétées par saisie libre ; toute valeur saisie devient une suggestion pour les fiches suivantes et reste filtrable.
- Exclus : temps de jeu, sessions, toute mécanique de tracker.

#### Art

- **Pas de note** ; coup de cœur et avis uniquement.
- Statuts : **À découvrir, Découverte**.
- Formes : **Peinture, Sculpture, Photographie, Dessin, Poésie, Gravure, Performance, Art conceptuel, Autre**.
- Champs : visuel facultatif, titre, artiste, année, forme, **lieu** et **exposition** (texte libre facultatif, sans relation modélisée), date de découverte, avis.

#### Exclusions arrêtées pour la V1

- Suivi par épisode, détail saison par saison, pagination et avancement de lecture chiffré.
- Sessions et temps de jeu, mécaniques de tracker.
- Catalogue d'expositions ou relations modélisées lieu / exposition.
- Intégration de fournisseurs de métadonnées pour les nouveaux médiums dans ce train (TMDB reste propre aux Films ; toute extension sera arbitrée séparément).
- Codes couleur par catégorie et composition précise des vues filtrantes : intentions notées, tranchées au train `0.6.0`.

### `0.4.2` — Socle de données et compatibilité Films

**État : livré côté code et preuves automatisées, en attente de validation d'Aurélien.** La migration 10 crée les tables `series`, `books`, `book_quotes`, `games` et `artworks` conformément au contrat `0.4.1`. Le format JSON v2 `sylloge-library` étend le v1 de façon additive ; l'import v1 historique reste réimportable sur base migrée à 10 migrations (test d'intégration étendu). L'import v2 est atomique, crée un nouveau profil et régénère tous les identifiants. Aucune interface utilisateur dans ce jalon : les formulaires et vues arrivent avec chaque verticale `0.4.3+`.

- Faire évoluer les fondations SQLite, les types, la recherche, les profils, exports et sauvegardes sans casser les données Films ni les formats déjà publiés.
- Écrire les migrations et tests de compatibilité avec les bibliothèques `0.1.x–0.4.x` avant de créer une nouvelle verticale.
- Définir les erreurs d’import, de migration et de contenu incomplet qui doivent rester récupérables et explicites.

### `0.4.3` — Séries : données et saisie manuelle

**État : livré côté code et preuves automatisées, en attente de validation d'usage d'Aurélien.** La verticale Séries est utilisable de bout en bout : entrée « Séries » dans la sidebar, bibliothèque avec vues globale / série télé / animation, recherche (titre, showrunner, casting), formulaire complet et fiche. Le compteur de saisons utilise des boutons +/− accessibles ; marquer « vue » aligne les saisons vues sur le total, et augmenter le total fait repasser une série vue en cours. La vue est triée par l'horodatage interne de progression. La bascule automatique « Vue ↔ En cours » est décidée : le total est manuel (aucune API série dans ce train), conformément au contrat `0.4.1`.

- Créer le modèle Série, sa migration, ses statuts, son formulaire et sa fiche minimale.
- Décider explicitement si le suivi par saison/épisode est nécessaire à la V1 ; ne pas le livrer à moitié.

### `0.4.4` — Profils et imports/exports par médium

**Redéfinition actée avec Aurélien le 20 juillet 2026.** Le périmètre initial (« Séries : bibliothèque et portabilité ») est absorbé par ce jalon, qui corrige un défaut de conception du modèle « un import = un nouveau profil », inadapté au multi-médiums.

**État : livré côté code et preuves automatisées, en attente de validation d’usage d’Aurélien.** Les profils sont une couche d’identité contenant cinq collections ; les imports n’en créent plus. Films dispose d’un assistant unique JSON / CSV / ZIP Notion avec explication des formats avant le sélecteur, aperçu et mapping avant Remplacer ou Fusionner dans le profil courant. Séries accepte le document Sylloge JSON v2. La restauration globale v1/v2 remplit atomiquement le profil courant uniquement s’il est vide, avec une seconde vérification native dans la transaction. Les tests couvrent la compatibilité JSON Films v1, le document v2, la fusion, la limite de profils et le refus d’une restauration globale dans un profil non vide.

**Abrogation :** l'invariant « un import crée toujours un nouveau profil » disparaît. Les imports écrivent désormais dans le **profil courant**, avec consentement explicite.

- **Profils — couche identité pure.** Un profil = une personne = une base SQLite propre contenant ses cinq collections (Films, Séries, Livres, Jeux, Art). Création et suppression libres dans les Paramètres ; limite interne de cinq profils (non affichée, signalée seulement si atteinte). Tout profil peut être supprimé, y compris le dernier et le profil ouvert : l'application retombe alors sur l'onboarding de premier lancement. Aucun import ne crée de profil.
- **Import unitaire par médium, depuis chaque bibliothèque.** Un seul bouton Importer apparaît dans chaque verticale effectivement livrée. L’application détecte les formats définis par son contrat : Films accepte JSON Sylloge, CSV et export Notion ZIP (table CSV + pages Markdown) ; Séries accepte actuellement le document Sylloge JSON v2. Les mappings CSV/Notion des prochains médiums seront ajoutés avec leur verticale, jamais inventés à l’avance. L’aperçu, le mapping explicite lorsqu’il existe, la validation et le rapport d’erreurs avant écriture restent obligatoires.
- **Au moment de valider, choix explicite :** **Remplacer** (vider la collection courante puis installer l'import) ou **Fusionner** (conserver l'existant et ajouter l'import).
- **Fusion intelligente :** doublons détectés au **titre normalisé** (casse/accents/diacritiques insensibles). Récapitulatif des doublons détectés avant validation ; pour chaque doublon, l'utilisateur choisit individuellement la fiche à conserver (existante ou importée). Pour les fiches conservées des deux côtés et les nouvelles fiches, les données personnelles de l'existant (note, avis, coup de cœur, progression) sont préservées ; l'importé ne comble que les champs vides.
- **Paramètres → Données et sauvegardes — niveau global.** Export global « format Sylloge » des cinq collections du profil courant, conçu pour une réinstallation complète et fidèle ; variantes d'export lisibles (JSON/CSV). Réglages généraux (dossier de snapshots, rétention). **Import global** réservé à un profil vide ; sur un profil non vide, l'application propose un parcours guidé (créer un profil vierge ou vider le courant), jamais de refus sec.
- **Portabilité Séries :** export, import, sauvegardes et fallback d'affiche étendus aux Séries ; conservation d'une série au changement de profil, à l'export/import et à la restauration testée.
- Rétrocompatibilité : un export JSON v1/v2 existant reste importable. Les anciens exports « nouveau profil » s'importent comme un import global sur profil vide.

**Critères d'acceptation :** parcours complets exercés pour Films et Séries (import unitaire remplacer/fusionner, doublons, export unitaire, export/import global, snapshots, suppression de profil jusqu'à l'onboarding) ; tests d'intégration sur la fusion (préservation des données personnelles, champs vides comblés, choix par doublon respecté) et sur la limite de cinq profils.

### `0.4.5` — Livres : données et saisie manuelle

**État : livré côté code et preuves automatisées, en attente de validation d’usage d’Aurélien.** La verticale Livres est accessible depuis la sidebar avec une collection minimale, la création, la modification, la fiche et la suppression. Livre, Manga et Comics disposent de leurs statuts ; Manga et Comics utilisent un compteur de tomes +/− avec bascule Lu ↔ En cours lorsqu’un nouveau tome apparaît. Les citations personnelles sont ordonnées, modifiables et affichées dans un espace escamotable. La création, la modification et la suppression d’un livre avec ses citations passent par des transactions SQLite natives ; les tests prouvent le rollback sans écriture partielle. Recherche, vues filtrées et portabilité dédiée restent volontairement au jalon `0.4.6`.

- Créer le modèle Livre, sa migration, ses statuts, son formulaire, sa fiche et ses notes personnelles.
- Décider avant le code si pagination, édition, traduction et relecture sont nécessaires au premier parcours.

### `0.4.6` — Livres : bibliothèque et portabilité

**État : livré côté code et preuves automatisées, en attente de validation d’usage d’Aurélien.** La bibliothèque Livres recherche dans le titre, l’auteur et le résumé, propose les vues Tous / Livre / Manga / Comics et trie par progression interne récente. L’import et l’export dédiés utilisent le document Sylloge JSON v2, citations comprises, avec Remplacer ou Fusionner et résolution individuelle des doublons au titre normalisé. La fusion préserve les données personnelles et citations locales lorsque la fiche existante est conservée ; le backend écrit livres et citations dans une transaction unique. Les snapshots globaux incluent fidèlement les Livres. Le fallback visuel annonce désormais explicitement une couverture pour cette verticale.

- Étendre recherche, filtres, bibliothèque, export, import, sauvegardes et fallback de couverture aux Livres.
- Vérifier la préservation des caractères, notes longues et données éditoriales dans les formats locaux.

### `0.4.7` — Jeux : verticale bornée

**État : livré côté code et preuves automatisées, en attente de validation d’usage consolidée au jalon `0.4.9`.** La verticale Jeux est accessible depuis la sidebar avec une collection minimale, la création, la modification, la fiche et la suppression. Les statuts À jouer / En cours / Joué / Abandonné / Regardé, la note, le coup de cœur, le studio, l’année, la date et la couverture facultative suivent le contrat `0.4.1`. La plateforme reste une saisie libre : une liste initiale sobre aide la saisie et toute valeur déjà enregistrée devient une suggestion, sans catalogue fermé ni nouvelle table. Aucun temps de jeu, session ou mécanisme de tracker n’est introduit. Recherche, filtres et portabilité dédiée restent volontairement au jalon `0.4.9`.

- Créer un modèle, une saisie manuelle, une fiche et les statuts réellement utiles pour les Jeux.
- N’ajouter plateforme, temps de jeu ou sessions qu’après décision documentée ; aucune mécanique de tracker ne doit apparaître par défaut.

### `0.4.8` — Art : verticale bornée

**État : livré côté code et preuves automatisées, en attente de validation d’usage consolidée au jalon `0.4.9`.** La verticale Art est accessible depuis la sidebar avec une collection minimale, la création, la modification, la fiche et la suppression. Les formes Peinture / Sculpture / Photographie / Dessin / Poésie / Gravure / Performance / Art conceptuel / Autre, les statuts À découvrir / Découverte, le coup de cœur, l’artiste, l’année, la date et le visuel facultatif suivent le contrat `0.4.1`. Lieu et exposition restent des textes libres facultatifs, sans relation ni catalogue modélisé. Aucune note n’est introduite. Recherche, filtres et portabilité dédiée restent volontairement au jalon `0.4.9`.

- Créer un modèle, une saisie manuelle et une fiche adaptés aux œuvres d’Art.
- Ajouter artiste, exposition et lieu seulement lorsque ces relations servent une recherche ou une mémoire personnelle concrète.

### `0.4.9` — Cohérence multi-médiums

**État : livré côté code et preuves automatisées, mais non validé en usage.** La première recette native d’Aurélien a été interrompue le 22 juillet 2026 après avoir révélé des blocages, des défauts de flux et plusieurs nouvelles décisions produit. Jeux recherche désormais par titre, studio ou plateforme et filtre sur les plateformes réellement présentes ; Art recherche par titre, artiste, lieu ou exposition et filtre par forme. Les deux verticales disposent de l’import et de l’export JSON v2 avec Remplacer ou Fusionner, résolution individuelle des doublons au titre normalisé et transactions SQLite atomiques. Ces preuves ne suffisent pas à fermer le jalon : la stabilisation est répartie dans les jalons `0.4.10+` ci-dessous.

- Étendre aux Jeux et à l’Art les parcours communs validés : recherche, filtres, export, import, sauvegardes et fallbacks visuels.
- Exercer les bibliothèques mixtes, les contenus incomplets et les migrations depuis une installation Films existante.
- Réorganiser les réglages de données autour des médiums effectivement disponibles : chaque collection dispose de son import et de son export explicites, sans écran ou destination factice pour un médium absent. Les formats et mappings restent propres à leur type de bibliothèque ; aucun fichier mixte n’est imposé.
- Décider et tester, après stabilisation du modèle multi-médiums, si une même session d’import peut préparer plusieurs collections d’un nouveau profil. Cette décision ne doit pas être anticipée par cinq colonnes figées dans les réglages Films-only.

### Amendement post-QA du train

La première recette manuelle promeut dans le train actif plusieurs sujets auparavant différés ou limités : création et association TMDB réellement assistées, imports et exports JSON/CSV multi-médiums, détection de ces formats dans des ZIP ou dossiers, architecture claire des données, filtres et tris combinables, puis vues enregistrées. Le plan canonique est [`plans/0.5.0-stabilisation-post-qa.md`](plans/0.5.0-stabilisation-post-qa.md).

Les libellés `0.4.10`, `0.4.11`, etc. sont des **jalons internes** du train vers `0.5.0`, sans tag ni changement de manifeste. Les formes `0.4.9.1` et `0.4.91` ne sont pas retenues : elles rendraient le versionnement ambigu.

### `0.4.10` — Déblocage QA et réglages sûrs

**État : livré côté code et preuves automatisées, en attente de validation visible d’Aurélien.** Le bouton de création de profil est séparé de la liste, le focus des recherches est redessiné sans supprimer le repère clavier, et le dossier de snapshots peut être oublié sans supprimer les fichiers existants. La disponibilité du chemin est vérifiée à la lecture : un dossier supprimé hors de l’application est signalé et ne peut plus recevoir de snapshot manuel. La désactivation est sérialisée avec les écritures de snapshots et oublie atomiquement le réglage et son registre de rétention. L’accès natif aux cinq bibliothèques et le rendu des corrections restent à reprendre dans l’application pendant la prochaine passe QA.

- Reproduire et lever tout blocage réel d’accès aux cinq bibliothèques.
- Corriger le chevauchement du bouton de création de profil et redessiner le focus de recherche sans supprimer l’accessibilité clavier.
- Permettre d’oublier ou désactiver le dossier de snapshots et détecter un dossier supprimé hors de l’application.

### `0.4.11` — Résolution de doublons à grande échelle

**État : livré côté code et preuves automatisées, en attente de validation visible d’Aurélien.** Le résolveur affiche désormais une recherche locale, les compteurs total/visible/décisions modifiées et une barre d’actions persistante en haut de l’assistant. Les choix restent conservés lorsqu’une recherche masque temporairement des doublons ; la confirmation est protégée contre la double soumission. Une fixture de 401 doublons couvre le filtrage et la conservation du plan de décisions.

- Ajouter une recherche locale, des compteurs et une barre d’actions persistante au résolveur de doublons.
- Prouver qu’une fusion d’au moins 400 doublons conserve toutes les décisions et ne déclenche qu’une seule écriture.

### `0.4.12` — Fiabilité de la création et de l’association TMDB

**État : livré côté code et preuves automatisées, en attente de validation d’usage d’Aurélien.** La prévisualisation détaillée TMDB est désormais indépendante d’un `film_id` local et alimente réellement les champs éditoriaux du formulaire (titre, titre original, année, réalisation, résumé, affiche), sans toucher aux données personnelles. La création locale précède l’écriture du cache ; si l’association réseau échoue, la fiche reste créée et intacte, l’erreur est annoncée et l’association peut être relancée depuis le détail. L’association native relit le cache après écriture.

- Corriger le défaut actuel où le candidat TMDB sélectionné ne préremplit pas réellement le formulaire et n’est pas associé après création.
- Séparer les métadonnées éditoriales TMDB des données personnelles et définir une reprise sûre en cas d’échec réseau.
- La QA native doit encore exercer une création assistée complète, une association existante, une dissociation, un rafraîchissement et un changement d’affiche.

### `0.4.13` — Parcours Film unifié et recherche TMDB contextuelle

**État : livré côté code et preuves automatisées, en attente de validation d’usage d’Aurélien.** La création Film ouvre directement une recherche TMDB avec suggestions temporisées pendant la saisie et une issue immédiate vers la saisie manuelle, sans écran intermédiaire. Une association depuis une fiche existante reprend son titre, conserve son affiche et son identité visuelle comme contexte, puis revient proprement à la fiche si le parcours est abandonné. Les recherches de titres désactivent autocorrection, capitalisation automatique et correction orthographique.

- Supprimer l’écran intermédiaire « manuel ou assisté » au profit d’une recherche directe avec suggestions temporisées et issue manuelle.
- Depuis une fiche existante, préremplir la recherche avec son titre et conserver la fiche comme contexte visuel.
- Désactiver autocorrection et correction orthographique dans les champs de recherche de titres.

### `0.4.14` — Architecture claire des imports, exports et sauvegardes

- Réduire le vocabulaire de l’interface à Importer, Exporter, JSON, CSV et Snapshots ; les précisions de portée apparaissent seulement au moment utile.
- Faire des Paramètres un hub d’actions réelles et réutiliser les mêmes capacités depuis chaque bibliothèque.
- Conserver en interne un schéma JSON identifié et versionné pour la rétrocompatibilité.

### `0.4.15` — Contrats et exports CSV des cinq médiums

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation native visible à exercer.** Les cinq bibliothèques et les Paramètres exposent désormais le même export CSV unitaire. Les formats Séries, Livres, Jeux et Art sont versionnés en v1 ; le contrat Films v1 reste inchangé. Les citations Livres sont représentées par une cellule `book_quotes_json` ordonnée, qui conserve leurs textes mais non leurs identifiants techniques ni horodatages.

- Définir des colonnes propres à Films, Séries, Livres, Jeux et Art, y compris une décision explicite pour les citations de Livres.
- Exposer les mêmes exports CSV unitaires dans les bibliothèques et les Paramètres.

### `0.4.16` — Imports CSV multi-médiums

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation native visible à exercer.** Séries, Livres, Jeux et Art acceptent désormais le CSV direct depuis leur bibliothèque et les Paramètres. Les exports CSV Sylloge v1 se réimportent avec les champs représentables ; un fichier externe passe par un mapping explicite, puis un aperçu bloquant au moindre défaut. Les imports réutilisent Remplacer/Fusionner, la résolution de doublons et les transactions SQLite unitaires existantes.

- Généraliser le pipeline aperçu, mapping, validation, Remplacer/Fusionner et doublons aux quatre médiums non-Films.
- Refuser toute ligne invalide avant écriture et préserver l’atomicité SQLite.

### `0.4.17` — Contrat d’inspection des ZIP et dossiers

**État : implémenté dans le code et documenté ; validation native visible reportée au sélecteur ZIP/dossier du jalon `0.4.18`.** Le contrat V1 fixe les limites de taille, de profondeur, de volume et de décompression ; l’adaptateur ZIP Film historique refuse désormais explicitement les chemins non sûrs, les archives chiffrées et les liens symboliques. Il n’extrait aucun fichier sur disque. La sélection générique de candidat JSON/CSV et le sélecteur de dossier restent volontairement au jalon suivant.

- Définir une détection bornée et sûre des JSON/CSV compatibles dans un ZIP ou un dossier explicitement choisi.
- Préserver la lecture Film historique de certaines notes Markdown sans promouvoir Markdown ou Notion comme format public.

### `0.4.18` — Imports depuis ZIP ou dossier

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation native visible à exercer.** Les cinq bibliothèques peuvent choisir un fichier JSON/CSV, un ZIP ou un dossier local. Un conteneur ne fait que présenter les candidats JSON/CSV détectés, avec leur chemin relatif ; un candidat unique part directement dans le pipeline existant, plusieurs demandent un choix explicite. L’inspection reste en mémoire, bornée, sans extraction, surveillance ni synchronisation ; les pages Markdown restent réservées à l’association déterministe du flux Films historique.

- Présenter les candidats JSON/CSV détectés et envoyer le fichier choisi vers le pipeline d’import correspondant.
- Ne créer ni extraction persistante, ni surveillance, ni synchronisation du dossier choisi.

### `0.4.19` — Vues intégrées et tris essentiels

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation native visible à exercer.** Les cinq bibliothèques partagent la même rangée de vues Tous, Récents, Favoris et Classement (absent de l'Art, sans note). Les ordres sont résolus en colonnes SQL documentées : Tous suit le titre, Récents la progression horodatée (saisons, tomes) ou la dernière modification, Classement la note décroissante avec les absences en fin. Les anciens filtres Films par statut disparaissent de la vue principale : les statuts terminaux deviendront des critères du panneau de filtres au jalon `0.4.20`. Les catégories Série/Livre, plateformes Jeux et formes Art restent des filtres propres à leur médium.

- Installer des vues cohérentes Tous, Récents, Favoris et Classement lorsque la note existe.
- Déplacer les statuts terminaux dans les critères de filtre plutôt que d’imposer une vue « Terminé ».

### `0.4.20` — Filtres avancés et tri combinable

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation native visible à exercer.** Les cinq bibliothèques partagent un panneau de filtres borné par médium : statut, favori, note minimale (jamais l'Art), année quand la colonne existe, date personnelle, et texte spécifique (réalisation, auteur, artiste, lieu, exposition). Les critères se combinent avec la recherche textuelle et la vue active, qui porte l'ordre de tri — aucun second sélecteur de tri redondant n'est introduit. Les paramètres SQL sont tous liés ; les critères actifs sont récapitulés en puces retirables, avec une action Réinitialiser ramenant à un état défini. Les critères survivent à l'aller-retour vers une fiche, l'état restant porté par le contexte de la bibliothèque.

- Combiner recherche textuelle, critères communs, critères propres au médium et ordre de tri.
- Afficher les critères actifs, le nombre de résultats et une remise à zéro explicite.

### `0.4.21` — Vues personnalisées enregistrées

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation native visible à exercer.** **Décision de portabilité actée : les vues enregistrées restent locales à la base SQLite — elles n'entrent ni dans les snapshots ni dans l'export complet de restauration.** La migration 12 crée `saved_views` (nom unique par profil et médium, schéma de critères JSON versionné, jamais de SQL persisté). Chaque bibliothèque peut nommer la vue courante (tri + filtre du médium + critères avancés, sans la recherche textuelle libre), la rappeler, la renommer et la supprimer après confirmation. Les critères relus sont réparés par le domaine : statut ou catégorie inconnus, note hors borne et JSON corrompu retombent sur les valeurs neutres, et l'Art ne peut jamais détenir une vue Classement.

- Nommer, rappeler, renommer et supprimer un couple filtres + tri, isolé par profil et médium.
- Décider avant migration si ces vues appartiennent seulement à SQLite locale, aux snapshots ou à l'export complet.

### `0.4.23` — Modèle unifié des vues

**Redéfinition actée avec Aurélien le 1er août 2026.** Une vue est un seul concept : un préset **filtres + tri**. Les vues intégrées (Tous, Récents, Favoris, Classement) et les vues enregistrées relèvent du même modèle ; les filtres et le tri choisis à la volée s'appliquent par-dessus la vue active (dans Favoris, un filtre « avant 2019 » agit à l'intérieur des favoris). Le tri devient explicite (colonne + direction) au lieu d'être implicite dans la vue.

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation native visible à exercer.** Le modèle unifié est en place : présets intégrés et enregistrés partagent la même structure, le tri est borné par médium (titre, récence, note, année, date personnelle, ajout — jamais de note pour l'Art ni d'année pour les Séries) et résolu en colonnes SQL documentées. La migration 13 retire la colonne `view` de `saved_views` en préservant les données ; les critères écrits au schéma v1 (`0.4.21`) sont convertis à la lecture, la restriction Favoris comprise. L'interface de la rangée unifiée et les popovers Filtre/Tri arrivent au jalon `0.4.24`.

- Unifier vues intégrées et enregistrées dans un modèle préset { filtres, tri } ; migrer les vues enregistrées au nouveau schéma de critères.
- Définir un modèle de tri borné (titre, récence, note, année, date personnelle, ajout) avec colonnes disponibles par médium ; l'Art n'a jamais de tri par note.

### `0.4.24` — Rangée de vues unifiée et popovers Filtre / Tri

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation native visible à exercer.** Chaque bibliothèque n'a plus qu'une seule ligne d'outils : recherche, vues intégrées et vues enregistrées dans la même rangée (débordement borné « +n » au-delà de trois vues personnelles), puis trois icônes — Filtre, Tri, Enregistrer comme vue — ouvrant chacune un popover sobre refermable au clic extérieur ou à Échap. Le filtre propre au médium (catégorie, plateforme, forme) vit dans le popover Filtre ; les critères actifs sont comptés sur l'icône. Le tri explicite remplace celui du préset actif et retombe au tri de la vue sur demande. Le panneau de filtres et la barre de vues enregistrées de `0.4.20`–`0.4.21` sont supprimés ; appliquer une vue enregistrée absorbe les réglages à la volée, changer de vue intégrée les conserve.

- Présenter vues intégrées et vues enregistrées dans une même rangée, avec débordement discret quand la ligne est pleine (inspiration Notion), sans pousser les boutons hors de l'écran.
- Deux icônes en bout de ligne, Filtre et Tri, ouvrant chacune un popover sobre ; « Enregistrer comme vue » capture le combo effectif dans la rangée.
- Supprimer le panneau de filtres et la barre de vues enregistrées introduits en `0.4.20`–`0.4.21`.

### `0.4.25` — Création assistée directe, même structure partout

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation native visible à exercer.** Un clic sur un résultat TMDB ouvre directement le formulaire prérempli en création, et associe immédiatement une fiche existante en mode association — l'écran de confirmation intermédiaire (Préremplir / Choisir / Annuler) est supprimé. Pendant la préparation, la liste des résultats se fige avec un état « Préparation de la fiche… » ; un échec est annoncé sur place, sans perdre la recherche ni la fiche. La saisie manuelle reste toujours accessible. Ce parcours direct est la structure de référence pour les fournisseurs des autres médiums (`0.4.26` à `0.4.28`).

- Un clic sur un résultat de recherche fournisseur ouvre directement le formulaire prérempli, sans écran intermédiaire de confirmation, pour toutes les bibliothèques disposant d'un fournisseur.
- Conserver une issue de retour propre vers la recherche et la saisie manuelle toujours possible.

### `0.4.26` — Séries assistées TMDB

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation native visible à exercer.** « Ajouter une série » ouvre la recherche TMDB TV avec suggestions temporisées ; le clic sur un résultat préremplit directement le formulaire (titre, showrunner, casting, résumé, total de saisons connu, affiche), éditable avant validation. Le statut, la note, le coup de cœur et les saisons vues ne sont jamais préremplis. Périmètre délibérément borné : pas de cache ni d'association persistée pour les Séries dans ce train — la clé embarquée et le client existants suffisent, aucune migration.

- Réutiliser la clé TMDB embarquée, le client et le cache pour la recherche TV : suggestions temporisées, préremplissage éditable, données personnelles séparées, même parcours que Films.

### `0.4.27` — Livres assistés Open Library

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation native visible à exercer.** « Ajouter un livre » ouvre la recherche Open Library (sans clé ni compte, `User-Agent` identifié, préférence `lang=fr`) avec suggestions temporisées ; le clic sur un résultat préremplit directement le formulaire (titre, auteur, année, couverture, résumé quand Open Library en a un), éditable avant validation. Catégorie, statut, note, favori, tomes et citations restent des choix personnels jamais préremplis. Les requêtes passent par le backend Rust (timeouts, réponses bornées, clé d'œuvre validée avant l'appel de détail).

- Recherche Open Library sans clé, `User-Agent` identifié et cache respectueux : titre, auteur, année, couverture ; le résumé n'est prérempli que lorsqu'il existe. Même parcours que Films.

### `0.4.28` — Jeux assistés RAWG

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation native visible à exercer. La clé RAWG d'Aurélien est embarquée obfusquée dans `embedded_key.rs`, ignoré par Git, et validée par un appel réel (HTTP 200).** « Ajouter un jeu » ouvre la recherche RAWG avec suggestions temporisées ; le clic sur un résultat préremplit directement le formulaire (titre, développeur, année, cover), éditable avant validation. La plateforme, le statut, la note et le favori restent des choix personnels jamais préremplis ; la recherche exclut les DLC. L'attribution « Données : RAWG » avec lien est visible dans le parcours, comme l'exigent leurs conditions du plan gratuit.

- Clé RAWG fournie par Aurélien, embarquée hors dépôt selon le modèle TMDB ; recherche, préremplissage (titre, développeur, plateforme, année, cover) et attribution « Données : RAWG » exigée par leurs conditions.
- Si les conditions RAWG ou la garde de la clé ne sont pas satisfaites, le jalon s'arrête et les Jeux restent manuels pour `0.5.0`.

### `0.4.29` — Import / Export à deux boutons et Sauvegarde Sylloge

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation native visible à exercer.** Chaque bibliothèque n'expose plus que deux actions : **Importer** et **Exporter**. Exporter ouvre un dialogue accessible listant les formats — JSON Sylloge (document versionné réimportable) ou CSV (tableur) — et aucune écriture n'a lieu avant le choix explicite. Dans les Paramètres, l'export global des cinq collections devient la **Sauvegarde Sylloge** : « Exporter la sauvegarde » / « Restaurer une sauvegarde » (JSON complet, restauration atomique dans un profil vide, inchangée). Les cartes par médium du hub réutilisent le même flux unifié ; les anciens boutons Exporter / Exporter CSV séparés sont supprimés.

- Chaque bibliothèque expose exactement deux boutons, Importer et Exporter ; Exporter ouvre un dialogue listant les formats proposés (JSON Sylloge, CSV) avant toute écriture.
- L'export global des cinq collections devient la Sauvegarde Sylloge (JSON complet, réimportable pour restauration), nommée comme telle dans les Paramètres.

### `0.4.22` — Reprise complète de la recette et corrections de clôture

**Corrections déjà intégrées depuis la recette (commit `fix(recette)`) :** le compteur de résultats entre les deux séparateurs (« 2 films affichés ») est retiré des cinq bibliothèques — un seul séparateur sous la barre d'outils, la collection suit directement. Les parcours assistés affichent désormais le message d'erreur réel du fournisseur au lieu d'un « vérifiez votre connexion » systématique : la panne RAWG constatée en recette (HTTP 522 sur tout le service, site inclus) n'était pas un défaut de l'app, mais le message induisait en erreur. User-Agent des clients Open Library et RAWG passés en ASCII par hygiène.

- Reprendre la recette manuelle consolidée de `docs/QA_MANUELLE_0.5.0.md` sur un build natif frais, sur les cinq médiums et sur la machine de référence d'Aurélien.
- Tout nouveau lot non trivial découvert devient `0.4.23`, puis `0.4.24`, etc. Aucun plafond artificiel n’est fixé avant `0.5.0`.

### `0.5.0` — Release publique Extension culturelle

**État : publiée le 2 août 2026 — tag `v0.5.0`, artefacts signés et `latest.json` sur GitHub Releases.** Les corrections remontées par la première passe de recette (interrompue le 22 juillet 2026) sont intégrées (jalons `0.4.23` à `0.4.29` + fix recette) et couvertes par les contrôles automatisés. La recette complète n'a pas été rejouée de bout en bout après la stabilisation : la preuve consolidée reste à consigner. Une recette courte de remise en état, sur profil de test, est prévue avant l'ouverture du jalon `0.5.1` ; protocole et verdict dans [`RECETTE_COURTE_REPRISE.md`](RECETTE_COURTE_REPRISE.md). La checklist consolidée reste dans [`QA_MANUELLE_0.5.0.md`](QA_MANUELLE_0.5.0.md) pour la suite.

- Revoir, intégrer et valider les cinq verticales du contrat V1 ; ne publier que des médiums complets, documentés et migrables.
- Vérifier que recherche, filtres, profils, exports, imports, sauvegardes et fallbacks visuels se comportent pour Films, Séries, Livres, Jeux et Art.
- Ne changer manifestes, tag et artefacts qu’après fermeture de tous les jalons internes et validation humaine de la recette.

## 8. Train `0.6.0` — Design desktop de V1 (train actif)

**But de la release :** appliquer partout le langage visuel validé (voir [`../DESIGN.md`](../DESIGN.md)) sans ajouter aucune capacité produit. La direction a été arbitrée par Aurélien le 22 août 2026 sur les maquettes `sylloge-design-051` : structure sobre de la bibliothèque, habillage chaleureux papier/violet, fiche réinventée autour de deux voix (encyclopédie / personnel).

**Mode de livraison acté avec Aurélien :** un jalon = une page ou une famille de surfaces = un commit ; point GO explicite d'Aurélien après chaque jalon avant de relancer ; pas de recette intermédiaire, les vérifications automatisées doivent rester vertes à chaque fois. Les maquettes HTML restent la référence visuelle (`~/Documents/Hermes/sylloge-design-051/`).

### `0.5.1` — Direction visuelle et contrat DESIGN.md

**État : livré.** Trois variantes comparées (Encre sobre, Galerie lumineuse, Index dense), arbitrage « structure V1 × habillage V2 », puis fiche film co-conçue en cinq itérations jusqu'à validation finale (statut et verdict sous l'affiche, métadonnées techniques masquées, critique en serif prune). Le contrat complet est écrit dans [`../DESIGN.md`](../DESIGN.md) : tokens papier/violet/prune, deux typographies de voix, formes pilules, composition de fiche, sidebar, bibliothèques, accessibilité et anti-directions. Écrans de référence : bibliothèque (`04-direction-validee`) et fiche film (`09-fiche-v5`).

### `0.5.2` — Fondations du langage visuel

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation visible à exercer.** Les tokens papier/violet/prune remplacent l'ancien système (police Syne supprimée, `--font-personal` serif ajouté, ombres douces tokenisées), les boutons et la recherche passent en pilules, la sidebar perd sa bordure au profit du fond papier avec marque Sylloge + surtitre et items actifs en encre pleine, les affiches gagnent ombre et soulèvement au survol. Les assertions de style de `verify.mjs` restent vertes.

- Remplacer les tokens actuels par le système validé : papier `#FAF9F6`, cartes blanches, bordures chaudes, violet encre `#5B3A68`, prune personnel `#473952`, rayons pilule et cartes.
- Refondre `src/styles.css` : boutons principal/secondaire/tertiaire, segmented control, champ de recherche pilule, libellés de section en capitales espacées, ombres douces sous visuels uniquement.
- Redessiner la sidebar : même fond que le contenu, marque Sylloge + surtitre, items pilules avec compteurs, actif en encre pleine, Paramètres ancré en bas.
- Vérifier typecheck, verify, build, Cargo : verts sans exception.

### `0.5.3` — Bibliothèques des cinq médiums

- Appliquer la rangée d'outils validée aux cinq bibliothèques : vues intégrées et enregistrées en onglets soulignés violets, recherche pilule, actions filtre/tri, séparateur vertical.
- Unifier les cartes : affiche arrondie avec ombre douce, titre, sous-titre, étoiles et pastille de statut dessous, survol par soulèvement ; fallback neutre inchangé.
- Ajouter le sous-titre éditorial sous chaque titre de page (compte réel de la collection, coups de cœur quand la note existe, jamais pour l'Art).
- Soigner les états vides : sobres, honnêtes, avec issue claire vers la création.

### `0.5.4` — Fiches Films et Séries

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation visible à exercer.** FilmDetail et SeriesDetail adoptent la composition validée : colonne gauche collante (visuel avec ombre, statut en segmented control statique, note étoilée et coup de cœur dessous), bloc œuvre (surtitre du médium ou de la catégorie, titre, ligne de faits, grille d'informations à filets fins adaptée au médium, résumé en voix encyclopédie avec « Lire la suite » quand il est long, attribution TMDB en subtil avec actions Rafraîchir/Dissocier), puis partie personnelle immédiate après un simple filet (date de visionnage seule, critique en serif prune à filet violet, issue Modifier). La suppression déménage dans le menu ⋯ avec confirmation en dialogue centré ; les comportements TMDB existants sont conservés et les assertions de `verify.mjs` restent vertes.

- Reconstruire FilmDetail et SeriesDetail selon la composition de référence : colonne gauche collante (visuel, statut, note/coup de cœur, action d'affiche), bloc œuvre (titre, faits, grille d'informations adaptée au médium, résumé avec Lire la suite, attribution TMDB), partie personnelle immédiate (date de visionnage seule, critique en serif prune, édition en place).
- Séries : showrunner, casting, catégories Série télé/Animation et compteur de saisons intégrés à la grille d'informations, jamais mélangés aux données personnelles.
- Conserver tous les comportements existants : association TMDB, rafraîchissement, dissociation, choix d'affiche.

### `0.5.5` — Fiches Livres, Jeux et Art

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation visible à exercer.** Les trois fiches adoptent la composition validée des fiches Films et Séries : colonne gauche collante (visuel, statut segmenté propre au médium, note/coup de cœur — le cœur seul pour l'Art, jamais de note), bloc œuvre avec ligne de faits et grille d'informations adaptée (auteur/parution/avancement pour les Livres, développeur/plateforme/jeu ou visionnage pour les Jeux, artiste/année/lieu/exposition/découverte pour l'Art), partie personnelle en serif prune avec citations des Livres dans leur espace escamotable conservé. Menus ⋯ et dialogues de suppression alignés sur les autres fiches.

- Décliner la composition validée : Livres avec auteur, année, catégorie et citations personnelles en voix serif-prune ; Jeux avec développeur, plateforme et statuts étendus (Regardé compris) ; Art sans aucune note, avec lieu, exposition et formes.
- Vérifier que la voix personnelle reste unique : citations et avis en prune serif, données éditoriales en sans-serif neutre, sur les cinq médiums.

### `0.5.6` — Formulaires et création assistée

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation visible à exercer.** Les cinq formulaires gagnent le langage pilule : champs sur carte blanche, focus violet en anneau doux, survols chauds, textarea héritant de la police. Les quatre recherches fournisseur affichent leur champ de saisie en pilule et leurs candidats en cartes arrondies à ombre douce au survol ; attribution RAWG et issues manuelles inchangées. Le blanc brut est remplacé par `--color-surface` sur toutes les surfaces restantes (imports, résolution de doublons, profils). Aucune logique modifiée : préremplissage éditorial uniquement, données personnelles jamais touchées.

- Reprendre les cinq formulaires dans le langage pilule : champs blancs arrondis, labels sobres, sections éditoriales/personnelles distinguées, bouton principal violet.
- Habiller les quatre flows de recherche fournisseur (TMDB films, TMDB TV, Open Library, RAWG) : suggestions, préparation, erreur sur place avec message réel, attribution visible.
- Ne rien changer au contrat : données personnelles jamais préremplies, saisie manuelle toujours accessible.

### `0.5.7` — Page Accueil éditoriale

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation visible à exercer.** Les quatre modules de l'accueil (Vus récemment, Favoris, module contextuel En attente ou Ajoutés récemment, calendrier Films vus) adoptent le langage validé : cartes blanches arrondies à ombre discrète sur papier, libellés de section en capitales espacées sans-serif, titres en graisse 700 sans capitales forcées, affiches arrondies qui se soulèvent au survol avec leur ombre, calendrier aux cases adoucies et chiffres tabulaires. Les données restent exclusivement les films locaux réels ; aucune métrique ni widget ajouté.

- Recomposer l'accueil selon la direction validée : rythme éditorial fondé sur les œuvres locales réelles, reprise des modules existants (vus récemment, favoris, module contextuel) sans dashboard ni métriques.
- Détacher visuellement chaque section avec les libellés capitales du langage ; aucune donnée inventée.

### `0.5.8` — Paramètres, portabilité et dialogues

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation visible à exercer.** Les quatre sections de Paramètres passent aux filets hairline, kickers en capitales espacées et titres en graisse 700 ; les cartes de portabilité gagnent une ombre discrète, les choix de transfert se soulèvent au survol avec l'état actif en teinte violette, les étapes de l'assistant d'import deviennent des pastules arrondies, la notice de sauvegarde est tokenisée (bordure chaude, rayon carte). L'onboarding reste centré sur son fond papier. Tous les libellés contractuels (Sauvegarde Sylloge, Importer et exporter, Oublier ce dossier) sont inchangés, assertions vertes.

- Refonder les Paramètres (Profils, Données et sauvegardes, Application, À propos) en pages calmes du même langage.
- Habiller les parcours Importer/Exporter, dialogues de formats, aperçus d'import, résolution de doublons et confirmations destructrices (danger prune).
- Onboarding de premier lancement aligné sur la marque.

### `0.5.9` — Mouvement, clavier et QA visuelle

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation visible à exercer.** Le focus clavier est unifié dans tout le langage : anneau violet `--color-accent` de 3 px accompagné d'un halo `accent-soft`, appliqué au global comme aux contrôles import/doublons/updater (l'ancien violet grisâtre `#8c64a0` disparaît). Les transitions sont harmonisées en 0,12-0,16 s sur élévation et couleurs uniquement, et le rideau `prefers-reduced-motion` existant neutralise le tout. Cibles interactives vérifiées ≥ 34 px.

- Transitions courtes (élévation, couleurs) avec respect strict de `prefers-reduced-motion`.
- Parcours clavier complets : focus visible partout (anneau violet doux), ordre de tabulation, dialogues piégés correctement.
- Captures de référence avant/après des surfaces principales ; vérification des contrastes documentée dans DESIGN.md.

### `0.6.0` — Release publique Design desktop de V1

- Revoir l'ensemble des jalons `0.5.1…0.5.9`, exercer les parcours principaux sur build natif, corriger les frictions remontées par Aurélien.
- Mettre à jour manifestes, notes de release et tag après feu vert explicite ; publication signée via le processus existant.

**Exclusions du train :** aucun nouveau médium, fournisseur, format, champ produit ni changement de modèle de données. Le design ne touche jamais aux règles : Art sans note, données personnelles jamais préremplies, fallback neutre obligatoire.

### `0.5.10` — Accueil vivant et corrections de composition

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation visible en cours avec Aurélien.** La page d'accueil passe à une composition modulaire validée par Aurélien : deux rangées de modules demi-largeur (Derniers ajouts, Vus lus et joués, Favoris et mieux notés, calendrier discret), affiches côte à côte par trois, puis trois ajouts : **Jour pour jour** (œuvres consommées exactement il y a X ans, avec note en étoiles et aperçu de l'avis personnel ; le module disparaît quand aucun anniversaire n'existe), **À découvrir** (file d'attente réelle par statuts « à voir/à lire/à jouer/à découvrir », puces par médium, tirage aléatoire re-lançable de trois propositions), et un **bandeau de fin de page** comptant l'année en cours par médium (masqué si zéro). Corrections structurelles livrées dans la même passe : réservation de deux lignes de titre sous chaque carte des cinq bibliothèques (les sommets d'affiches ne bougent plus quel que soit le contenu), hauteur de calendrier stable entre mois de cinq et six semaines, espace restauré entre la barre d'outils et la grille, focus unique sur la pilule de recherche (l'anneau global clavier ne s'y applique plus en double), rail de navigation compact avec réapparition au survol, logo agrandi, et accent provisoirement déplacé du violet vers l'émeraude encre `#2E7D5B` (arbitrage définitif attendu avant mise à jour de DESIGN.md).

**Différés actés avec Aurélien pendant ce lot :**

- **Imports, exports et bibliothèques** : refonte à mener APRÈS la stabilisation de l'accueil et la clôture du train design. Ne pas ouvrir avant.
- **Second avis / journal de décisions** : possibilité de re-noter une œuvre lors d'un anniversaire (« contre-avis » consigné dans un journal). Idée issue du module Jour pour jour, à spécifier plus tard.
- **Indicateur de médium sur les cartes d'accueil** : conservé pour l'instant, suppression envisagée par Aurélien à terme.


## 9. Trains suivants — document dédié

### Train `0.7.0` — Importer depuis partout (refonte du processus d'import)

**Décision de priorisation actée par Aurélien le 23 août 2026 :** ce train devient le suivant après la clôture de `0.6.0`, avant la thématique fiabilité/confidentialité jusqu'ici associée à `0.7.0` dans `roadmap-future.md`. Les anciens contenus glissent : fiabilité et confidentialité passent en `0.8.0`, la distribution macOS et Windows en `0.9.0`. Le document `roadmap-future.md` sera révisé à l'ouverture effective du train.

**Constat issu de l'audit du code existant (23 août 2026) et du premier import réel d'Aurélien (401 films via export Notion ZIP) :**

1. L'import Films fonctionne de bout en bout ; les quatre autres médiums échouent sur un export Notion réel non calibré sur le contrat Sylloge.
2. Le dialogue d'import propose trois boutons (« Annuler », « Choisir un dossier », « Chooser un fichier ou ZIP ») et un texte long ; la compréhension repose sur l'utilisateur, pas sur l'interface. Le filtre natif Rust accepte pourtant déjà JSON, CSV et ZIP en une seule boîte.
3. Le mapping est orienté « colonnes détectées » (une ligne par colonne du fichier, sélecteur de destination à droite). La bonne grille mentale est l'inverse : une ligne par champ Sylloge que l'on souhaite remplir, avec sélecteur « quelle colonne de mon fichier l'alimente », défaut « Ne pas importer ».
4. La validation est tout-ou-rien : une seule valeur hors contrat (« statut indisponible », note hors bornes) bloque 100 % de l'import, sans explication exploitable ni issue.
5. Les métadonnées éditoriales sont déjà couvrables par les fournisseurs assistés (TMDB, Open Library, IGDB) ; l'import ne devrait se concentrer que sur ce qui est personnel : statut, notes, coup de cœur, progression, dates, avis, citations.

**Invariants conservés :** aperçu bloquant avant toute écriture, écriture atomique en une transaction, jamais d'écrasement silencieux, formats publiés JSON v1/v2 et CSV v1 inchangés, aucune donnée inventée. Ce train modifie la tolérance de lecture et l'interface, pas les contrats de données.

#### `0.6.1` — Un seul bouton, un dialogue compréhensible

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation visible à exercer.** Le dialogue d'import de chaque bibliothèque n'expose plus qu'un seul bouton principal « Choisir un fichier » (le sélecteur natif filtre déjà JSON, CSV et ZIP côté Rust) ; « Annuler » et « Choisir un dossier » disparaissent au profit de la croix × du dialogue. La croix de fermeture des assistants devient un bouton rond à filet, cohérent avec le langage pilule. Le texte d'accueil tient en une phrase de formats et une ligne d'engagement (« rien n'est modifié sans ton choix final »). Aucun changement de pipeline.

- Remplacer les trois boutons du dialogue par **un unique bouton principal « Choisir un fichier »** ouvrant le sélecteur natif filtré JSON/CSV/ZIP (le filtre existe déjà côté Rust) ; supprimer le bouton dédié « dossier » de l'écran principal.
- Supprimer le bouton « Annuler » ; fermeture par **croix × en haut à droite** du dialogue (plus Échap), désactivée pendant une écriture.
- Réécrire le texte d'accueil sur une phrase de formats et une ligne d'engagement.
- Critères : un utilisateur nouveau comprend en moins de dix secondes quoi cliquer ; aucun changement de pipeline derrière ; tests existants verts. ✓ (typecheck, verify, build, cargo check)

#### `0.6.2` — Mapping inversé : les champs Sylloge d'abord

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation visible à exercer.** L'écran de mapping des quatre médiums non-Films est inversé : une ligne par champ Sylloge, groupés en « Éditorial » puis « Personnel », chaque champ portant un sélecteur pilule listant les colonnes réellement détectées (auto-sélection par aliasing conservée, colonnes déjà utilisées désactivées) avec « Ne pas importer » par défaut pour tout champ non reconnu. Le titre porte la mention Obligatoire. Les colonnes non mappées sont regroupées dans une zone repliable expliquant qu'elles ne sont pas importées et que l'éditorial reste récupérable via la recherche assistée. Moteur de mapping inchangé (`CollectionCsvMapping`, auto-détection, unicité des colonnes).

- Refondre l'écran de mapping : **une ligne par champ Sylloge**, groupés « Éditorial » / « Personnel ». ✓
- Chaque champ porte un sélecteur des colonnes détectées + **« Ne pas importer »** par défaut. ✓
- Redessiner les sélecteurs dans le langage actuel (pilules, focus accent). ✓
- Zone secondaire des colonnes non mappées avec mention recherche assistée. ✓
- Appliquer la même grille au flux Films existant — reporté au jalon 0.6.5 (le moteur Films garde ses spécificités Notion/Markdown).
- Critères : sur l'export Notion réel d'Aurélien, chaque champ personnel trouvable et mappable en trois clics ; zéro colonne mystérieuse non expliquée ; tests domaine verts. ✓

#### `0.6.3` — Validation tolérante : normaliser d'abord, bloquer rarement

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation visible à exercer.** Nouveau module domaine `importNormalization.ts` : statuts résolus par synonymes (casse, accents, pluriels, anglais courant « completed/watching/dropped »), notes multi-formats (« 4 », « 4,5 », « 4/5 », « 8/10 » converti, « 80 % », « ★★★★ »), coups de cœur étendus (✓, x, oui…), compteurs tolérants, dates ISO/FR/textuelles FR et EN (formats Notion compris). Toute valeur non résolue laisse le champ vide avec un avertissement `.info` non bloquant ; seule une ligne sans titre ne produit pas de fiche, sans empêcher les autres. L'aperçu affiche « N fiches prêtes · Blocages » séparément des avertissements regroupés dans une zone repliable expliquant que ces fiches partent sans ces champs.

- **Statuts** : correspondance souple multilingue → champ vide + mention si non résolu. ✓
- **Notes** : toutes écritures courantes acceptées, /10 → /5 automatique. ✓
- **Coup de cœur**, **compteurs**, **dates** : tolérants. ✓
- Seule situation bloquante pour UNE fiche : titre absent — le reste continue. ✓
- Critères : fixtures sales passent en avertissements ; assertion `verify.mjs` mise à jour vers le nouveau contrat (fiche valide importée, ligne sans titre ignorée). ✓

#### `0.6.4` — Aperçu honnête, import complet, résumé final lisible

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation visible à exercer.** L'aperçu des quatre médiums non-Films affiche désormais « N fiches prêtes · Blocages » et regroupe les champs laissés vides dans une zone jaune repliable (mécanisme 0.6.3). Après écriture, le **Rapport final** devient le résumé complet du parcours : lignes ignorées sans titre, puis liste repliable « Champs laissés vides sur N fiches — à compléter quand tu veux » nommant chaque œuvre et ses champs manquants (note, avis, affiche, couverture, visuel selon le médium), ou la mention « toutes les données reconnues ont été importées ». Les avertissements de mapping transitent maintenant du flow CSV vers le bouton d'import via `onReady(items, warnings)`.

- Aperçu tout-ou-rien remplacé : fiches prêtes comptées séparément des blocages. ✓
- Tout ce qui peut être importé entre, même incomplet ; champs introuvables laissés vides. ✓
- **Résumé final lisible** : lignes ignorées + œuvres impactées avec leurs champs non remplis. ✓
- Écriture atomique unique inchangée, doublons toujours via le résolveur. ✓
- Critères : un CSV à 30 % de défauts produit ses 70 % de fiches avec le détail de ce qui manque ; tests verts. ✓

#### `0.6.5` — Prendre la main : assistant d'import et documentation

**État : implémenté dans le code et couvert par les contrôles automatisés ; validation visible à exercer.** Chaque étape du dialogue d'import embarque désormais son encart contextuel court (composant `ImportHint`, fond accent doux) : au choix du fichier (export Notion/Excel reconnu, vérification avant écriture), au mapping (pré-sélection automatique des colonnes reconnues), à l'aperçu (ce que fait l'étape suivante, rien n'est encore écrit), et au choix Remplacer/Fusionner (recommandation Fusionner en cas de doute). La documentation du dépôt reste à compléter avec la recette dédiée lors de la validation.

- Parcours guidé : **encarts contextuels dans le dialogue**, jamais une page séparée. ✓
- Textes d'erreur pédagogiques : livrés avec 0.6.3/0.6.4. ✓
- Documentation README + recette dédiée sur les cinq médiums avec l'export Notion réel d'Aurélien : à faire pendant la recette de fin de train.
- Critères : Aurélien réimporte ses séries/livres/jeux/art depuis son export Notion sans aide extérieure ; verdict consigné dans le dépôt.

#### `0.6.6` — Baguette magique : association automatique des métadonnées

**Besoin acté par Aurélien le 23 août 2026 :** après un import massif, associer chaque fiche à son fournisseur une par une est interminable. Un seul geste doit tout associer.

- **Bouton baguette magique « Tout associer »** dans chaque bibliothèque disposant d'un fournisseur (Films et Séries via TMDB, Livres via Open Library, Jeux via IGDB) — pas pour l'Art, qui n'en a pas.
- **Emplacement** : à gauche de la barre d'outils, à côté du champ de recherche (la recherche et les onglets de vues se décalent légèrement à droite pour lui laisser la place).
- **Parcours** : clic → mini-pop-up de confirmation (« Associer toutes les fiches non associées via TMDB ? » avec Oui / Non) → commande de fond qui, pour chaque fiche non associée, recherche le titre et retient le meilleur candidat (score de correspondance sur titre, année, créateur/auteur/développeur), puis applique l'association existante (cache, affiche, provenance) sans toucher aux données personnelles.
- **Transparence totale** : progression visible (n/total), résumé final (associées / déjà associées / non trouvées), et chaque fiche reste modifiable individuellement — l'association automatique n'est jamais une autorité, conformément aux invariants.
- **Bornes** : requêtes séquencées et limitées (respect des fournisseurs), annulable en cours, aucune écriture avant confirmation, les fiches déjà associées ne sont jamais retouchées.
- **Fiche — trois boutons explicites** : remplacer le menu ⋯ des fiches par trois boutons à icône en haut à droite : **Modifier** (crayon), **Associer** (baguette magique, ouvre le parcours d'association existant), **Supprimer** (corbeille, confirmation existante conservée). Même structure sur les cinq médiums.
- Critères : sur une bibliothèque de 400 films non associés, « Tout associer » traite le lot avec progression et résumé ; les données personnelles restent intactes ; tests domaine sur le score de correspondance et les bornes réseau ; recette manuelle sur les quatre médiums à fournisseur.

#### `0.7.0` — Release publique Importer depuis partout

- Revoir les jalons `0.6.1…0.6.6`, recette complète sur les cinq médiums, publication signée après feu vert.

**Arbitrages actés par Aurélien le 23 août 2026 :**

1. **Import partiel** : tout ce qui peut entrer entre, même incomplet ; les champs non trouvés restent vides dans la fiche créée. Seule fiche bloquée : titre absent (elle n'est pas créée, signalée, le reste continue). Un **résumé final** liste les œuvres impactées et leurs champs non remplis.
2. **Notes /10** : conversion automatique systématique dès qu'une échelle /10 est détectée, sans demande.
3. **Statuts synonymes** : normalisation silencieuse ; valeur non résolue → champ vide + mention au résumé final.
4. **Onboarding** : encarts contextuels dans le dialogue, étape par étape, jamais une page d'aide séparée.



## 10. Backlog non priorisé

Les éléments suivants peuvent être utiles, mais n’entrent dans une version que lorsqu’un besoin concret les justifie :

- thème sombre ;
- tags, collections éditoriales ou listes personnelles ;
- localisation anglaise et autres langues ;
- statistiques personnelles sobres ;
- traitement de doublons entre imports ;
- améliorations de performances pour des bibliothèques très volumineuses.

Aucun de ces items ne doit être ajouté « pour préparer l’avenir » sans un brief, des critères d’acceptation et une place dans une version.