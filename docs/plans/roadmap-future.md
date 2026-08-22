# Sylloge — feuille de route future (trains `0.6.0` → `1.0.0` et au-delà)

> **Statut :** train actif depuis le 22 août 2026. La release `0.5.0` (Extension culturelle) est publiée ; ce document porte la spécification du train `0.6.0` (front-end définitif) et des trains suivants, extraite de `docs/ROADMAP.md`. Les jalons sont promus dans la feuille de route active à mesure qu'ils deviennent actifs.
>
> Les jalons `0.6.1…` prépareront `0.7.0`, et ainsi de suite, selon le rythme de livraison décrit dans `docs/ROADMAP.md` §3.

## 8. Train `0.6.0` — Front-end définitif et langage visuel de V1

**But de la release :** faire de Sylloge une application desktop visuellement cohérente, agréable et pleinement maîtrisée, sans ajouter de capacité produit.

### `0.5.1` — Inventaire des surfaces et direction visuelle

- Inventorier les surfaces réellement présentes après `0.4.0` / `0.5.0`, choisir une direction unique et compléter le contrat visuel dans `DESIGN.md`.
- Produire des écrans de référence natifs pour la bibliothèque, la fiche, le formulaire, les Paramètres, l’onboarding et les états vides / erreur.

### `0.5.2` — Tokens, typographie et iconographie

- Finaliser palette par rôles, hiérarchie typographique, échelles d’espacement, rayons, bordures et règles d’icônes.
- Vérifier les contrastes, le focus clavier et les états interactifs avant de modifier les écrans entiers.

### `0.5.3` — Fenêtre native et compositions desktop

- Fixer les tailles minimale, de référence et maximale après essai natif ; définir sidebar, bibliothèque, recherche, fiches, formulaires, Paramètres et dialogues dans cette plage.
- Documenter le comportement en plein écran et les limites explicites du responsive desktop, sans dériver vers une interface mobile improvisée.

### `0.5.4` — Navigation, recherche et collections

- Revoir la sidebar, la navigation entre médias, la recherche et les filtres afin que les collections restent orientées œuvres plutôt que dashboard.
- Définir les états vides, résultats nuls, chargement local et erreurs de façon sobre et accessible.

### `0.5.5` — Cartes, affiches et bibliothèques

- Unifier les cartes, grilles et listes de tous les médias, sans recadrage destructeur ni faux visuels.
- Vérifier les titres longs, les métadonnées incomplètes, les posters / couvertures absents et les bibliothèques denses.

### `0.5.6` — Fiches, formulaires et dialogues

- Recomposer les fiches immersives, formulaires, confirmations et retours d’action autour des données réellement disponibles.
- Valider les libellés, l’ordre de tabulation, les erreurs de formulaire et les actions destructrices.

### `0.5.7` — Système de composants et états accessibles

- Unifier boutons, champs, sélecteurs, filtres, navigation, cartes, panneaux, alertes et confirmations, y compris focus, erreur et état désactivé.

### `0.5.8` — Mouvement utile et QA visuelle

- Appliquer un mouvement sobre compatible `prefers-reduced-motion` et valider au clavier les contenus courts, longs, incomplets et les affiches absentes ou cassées.
- Capturer les régressions visuelles des écrans de référence avant la clôture du train.

### `0.6.0` — Release publique Design desktop de V1

- Établir le contrat visuel définitif dans `DESIGN.md` : palette par rôles, hiérarchie typographique, échelles d’espacement, rayons, bordures, icônes, états et règles de composition. La direction « Archive calme » reste le socle ; il ne s’agit ni d’un look SaaS ni d’un dashboard.
- Définir puis implémenter les tailles **minimale**, de référence et **maximale** de la fenêtre native, avec un comportement explicite en plein écran. L’application ne doit plus pouvoir être réduite à une largeur ou hauteur qui rend ses flux inutilisables.
- Concevoir les compositions desktop dans la plage de tailles retenue : sidebar, page Accueil, bibliothèque, recherche et filtres, fiches, formulaires, Paramètres, onboarding, dialogues et états vides / erreur / chargement. Le responsive ne doit pas dériver vers une interface mobile improvisée.
- Reprendre les composants communs de manière systématique : boutons, champs, sélecteurs, filtres, navigation, cartes, panneaux, alertes et confirmations ; chaque état normal, survolé, actif, désactivé, focus clavier et erreur doit être défini et cohérent.
- Donner une identité éditoriale à la page Accueil et aux vues de collection : rythme, densité, surfaces, images et espaces négatifs au service des œuvres, plutôt qu’une accumulation de widgets ou de métriques.
- Définir un langage de mouvement utile et sobre pour les changements de vue, ouverture de fiche, dialogues et retours d’action ; respecter `prefers-reduced-motion` et ne jamais faire dépendre la compréhension d’une animation.
- Valider visuellement et au clavier les parcours principaux sur les tailles de fenêtre cibles, avec contenus courts, longs, incomplets et affiches absentes ou cassées.

**Gates avant implémentation :** inventorier toutes les surfaces V1 réellement présentes ; valider une direction visuelle unique et ses écrans de référence ; fixer les valeurs de fenêtre minimale, de référence et maximale après essai natif ; documenter les critères d’acceptation accessibles et les règles de mouvement. Aucun nouveau médium ni flux fonctionnel ne doit être ajouté au prétexte du redesign.

**Exclusions :** thème sombre, données de démonstration inventées, nouveau médium, API, cloud, compte, synchronisation, modification du modèle de données ou des formats d’import/export.

## 9. Train `0.7.0` — Fiabilité, qualité et confidentialité

### `0.6.1` — Migrations, imports et restaurations

- Étendre les tests de migrations, import/export, compatibilité de formats et scénarios de restauration avec des données réelles anonymisées.

### `0.6.2` — Validation, transactions et erreurs récupérables

- Vérifier les contraintes métier à toutes les frontières : formulaire, commandes Tauri, SQLite, import et restauration.
- Tester l’atomicité des opérations et la qualité des messages d’erreur lorsque l’action est refusée avant écriture.

### `0.6.3` — Régression d’interface et accessibilité

- Mettre en place les scénarios de régression visuelle et clavier sur les parcours principaux de tous les médiums retenus.

### `0.6.4` — Robustesse des sauvegardes et récupération

- Exercer les snapshots portables, l’export, l’import dans un nouveau profil et la récupération après un fichier invalide ou incomplet.
- Confirmer qu’aucun chemin ne copie ni ne synchronise la SQLite vivante, son WAL ou son SHM.

### `0.6.5` — Performance et bibliothèques réalistes

- Mesurer les parcours de consultation, recherche et import avec des bibliothèques de taille réaliste ; optimiser seulement un goulot réellement observé.
- Conserver une interface fluide sans introduire de cache, backend ou mécanisme de synchronisation prématuré.

### `0.6.6` — Confidentialité, licences et dépendances

- Auditer journalisation locale, dépendances, permissions Tauri et licences des contenus / fournisseurs externes ; documenter les limites d’usage et de récupération.

### `0.6.7` — Documentation de récupération et support local

- Rédiger et tester les procédures d’usage, de sauvegarde, de restauration, de récupération et de diagnostic sans collecte de données personnelles.

### `0.7.0` — Release publique Fiabilité, qualité et confidentialité

- Tests de migration, import/export, compatibilité de formats et scénarios de restauration.
- Régression visuelle et d’accessibilité sur les flux principaux.
- Journalisation locale utile, sans données personnelles envoyées à un tiers.
- Documentation d’usage, sauvegarde, récupération, limites et politique de confidentialité locale.
- Audit des dépendances, permissions Tauri et licences des contenus / fournisseurs externes.

## 10. Train `0.8.0` — Distribution macOS et Windows

### `0.7.1` — Builds reproductibles et installation macOS

- Rejouer un build reproductible, l’installation manuelle et la mise à jour sur macOS depuis une version antérieure signée.

### `0.7.2` — Signature macOS et stratégie de confiance

- Évaluer coût, bénéfice et faisabilité d’un Developer ID et de la notarisation ; ne promettre une installation sans alerte qu’après preuve réelle.
- Documenter l’expérience d’installation réellement disponible tant qu’aucun certificat n’est retenu.

### `0.7.3` — Build et installateur Windows

- Produire et tester les installateurs Windows sur une machine réelle ; chiffrer la stratégie de signature avant engagement.

### `0.7.4` — Mise à jour et migration Windows

- Vérifier le mécanisme de mise à jour, les migrations et la conservation des données locales sur Windows ; ne pas déduire ce comportement de la seule QA macOS.

### `0.7.5` — Support de publication

- Préparer notes de version, documentation d’installation, captures, landing page légère et procédure de support réaliste pour une bêta publique.

### `0.8.0` — Release publique Distribution macOS et Windows

- Build reproductible et test réel sur macOS et Windows.
- Installateurs appropriés, icônes, nom, version, documentation d’installation et mécanisme de mise à jour à décider.
- Signature et notarisation macOS ; stratégie de signature Windows à chiffrer avant engagement.
- Éviter de promettre une installation « sans alerte » sans certificats et validation sur les deux OS.
- Préparer le dépôt, les notes de version, les captures et une landing page légère.

## 11. Train `0.9.0` — Bêta publique contrôlée

**But de la release :** confronter une application déjà distribuable à des usages réels sans élargir son contrat produit au fil des retours.

### `0.8.1` — Protocole de bêta et parcours de remontée

- Définir les profils de test, les parcours à exercer, les informations à demander et un canal de retour sans tracking intégré à l’application.
- Préparer des données de test et une procédure de sauvegarde / récupération avant toute installation de bêta.

### `0.8.2` — Triage des retours et reproduction

- Classer chaque retour entre défaut bloquant, régression, amélioration cohérente, demande hors périmètre et besoin de documentation.
- Ne retenir pour le train que les problèmes reproductibles ou explicitement arbitrés ; le backlog n’est pas une liste de promesses.

### `0.8.3` — Corrections de stabilisation

- Corriger en priorité les pertes de données potentielles, les défauts d’installation / mise à jour, les blocages d’accessibilité et les régressions de parcours principal.
- Rejouer les scénarios de la bêta après chaque correction sans profiter du train pour ajouter une capacité produit.

### `0.9.0` — Release publique Bêta consolidée

- Publier seulement après fermeture ou documentation explicite des défauts connus, avec notes de version, limites, procédure de sauvegarde et support réaliste.
- Utiliser cette release comme dernière gate avant `1.0.0`, non comme prétexte à lancer V2 ou mobile.

### `1.0.0` — Première V1 publique

**Conditions de sortie :**

- les cinq médiums Films, Séries, Livres, Jeux et Art sont complets, explicitement assumés et vérifiés ;
- parcours principaux vérifiés sur macOS et Windows ;
- migration, export, import et restauration testés avec des données réelles ;
- esthétique et accessibilité validées sur les surfaces clés ;
- documentation claire, aucune fausse promesse de synchronisation ;
- bêta publique contrôlée menée, défauts connus fermés ou explicitement documentés ;
- distribution et support réalistes sur macOS et Windows ;
- version taguée, notes de version publiées et landing page cohérente.

## 12. Après la V1 — à ne pas anticiper prématurément

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
