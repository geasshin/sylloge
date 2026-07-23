# Sylloge — feuille de route vers la V1 publique

> **Statut :** feuille de route active. Les releases `0.2.0`, `0.3.0` et `0.4.0` sont livrées. `0.3.0` est la première release macOS signée publiée sur GitHub ; l’installation manuelle a été validée. Le train actif prépare la release publique `0.5.0`.
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

- Installer des vues cohérentes Tous, Récents, Favoris et Classement lorsque la note existe.
- Déplacer les statuts terminaux dans les critères de filtre plutôt que d’imposer une vue « Terminé ».

### `0.4.20` — Filtres avancés et tri combinable

- Combiner recherche textuelle, critères communs, critères propres au médium et ordre de tri.
- Afficher les critères actifs, le nombre de résultats et une remise à zéro explicite.

### `0.4.21` — Vues personnalisées enregistrées

- Nommer, rappeler, renommer et supprimer un couple filtres + tri, isolé par profil et médium.
- Décider avant migration si ces vues appartiennent seulement à SQLite locale, aux snapshots ou à l’export complet.

### `0.4.22` — Reprise complète de la recette et corrections de clôture

- Rejouer la recette native consolidée sur les cinq médiums et mettre à jour sa checklist.
- Tout nouveau lot non trivial découvert devient `0.4.23`, puis `0.4.24`, etc. Aucun plafond artificiel n’est fixé avant `0.5.0`.

### `0.5.0` — Release publique Extension culturelle

La recette native consolidée du train est suivie dans [`QA_MANUELLE_0.5.0.md`](QA_MANUELLE_0.5.0.md).

- Revoir, intégrer et valider les cinq verticales du contrat V1 ; ne publier que des médiums complets, documentés et migrables.
- Vérifier que recherche, filtres, profils, exports, imports, sauvegardes et fallbacks visuels se comportent pour Films, Séries, Livres, Jeux et Art.
- Ne changer manifestes, tag et artefacts qu’après fermeture de tous les jalons internes et validation humaine de la recette.

## 8. Trains suivants — document dédié

Les trains `0.6.0` (front-end définitif), `0.7.0` (fiabilité et confidentialité), `0.8.0` (distribution macOS et Windows), `0.9.0` (bêta publique contrôlée), les conditions de sortie de la `1.0.0` et les perspectives V2 / V3 sont décrits dans `docs/plans/roadmap-future.md`. Ce document fait partie de la feuille de route : il est consulté à l'ouverture de chaque nouveau train, et les jalons concernés y sont réintégrés ici au moment où ils deviennent actifs.

## 9. Backlog non priorisé

Les éléments suivants peuvent être utiles, mais n’entrent dans une version que lorsqu’un besoin concret les justifie :

- thème sombre ;
- tags, collections éditoriales ou listes personnelles ;
- localisation anglaise et autres langues ;
- statistiques personnelles sobres ;
- traitement de doublons entre imports ;
- améliorations de performances pour des bibliothèques très volumineuses.

Aucun de ces items ne doit être ajouté « pour préparer l’avenir » sans un brief, des critères d’acceptation et une place dans une version.