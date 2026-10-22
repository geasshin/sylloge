# Vers Sylloge 1.0 — proposition

**Brouillon du 21 octobre 2026, à arbitrer par Aurélien.** Ce document propose un chemin jusqu'à une version distribuable largement. Il ne remplace pas `ROADMAP.md`, qui reste la feuille de route des lots en cours ; il en prépare la suite et sera fusionné dedans après arbitrage.

## Décisions acquises le 21 octobre 2026

- **L'application est gratuite et open source.** Le dépôt `geasshin/sylloge` devient public, et la communication du site s'appuie dessus.
- **Un service cloud payant reste possible plus tard** (multi-appareil), sans changer de licence.
- **Le proxy de clés est en production**, porté par des fonctions Vercel ; les clients TMDB/IGDB n’embarquent plus de clés.
- **Les imports passent par des tutoriels guidés** : lien vers la page d'export du service, étapes numérotées, puis le fichier déposé dans Sylloge.

## Bloc 1 — Ouvrir le projet (bloquant pour distribuer)

### 1.1 Rendre le dépôt public

Vérifications du 21 octobre 2026 : 169 commits, aucun jeton ni clé privée dans l'historique, aucun `.env` jamais commité, les clés d'API générées sont ignorées par Git, historique de 20 Mo dont le plus gros objet fait 1,4 Mo. Le dépôt peut être publié tel quel.

### 1.2 Licence et présentation

- Licence **MIT** : courte, lisible, et elle autorise le service commercial futur. Apache-2.0 conviendrait aussi, avec une clause de brevets en plus.
- README refait : ce qu'est Sylloge, captures, installation, compilation, où vivent les décisions. L'actuel décrit encore six bibliothèques et la 0.6.4.
- `LICENSE`, `CONTRIBUTING.md`, et la phrase qui compte : la bibliothèque reste sur la machine.

### 1.3 Mise à jour sans jeton — **fait le 21 octobre 2026**

Le dépôt devenant public, l'application interroge l'URL statique de sa dernière release :

```text
https://github.com/geasshin/sylloge/releases/latest/download/latest.json
```

Aucun jeton, aucune limite d'API. Le code du jeton a été retiré : module natif, dépendance `security-framework`, lecture du Trousseau, trois commandes, écran de réglages, styles et messages d'erreur. Le manifeste pointe désormais l'archive par son URL de release publique. La vérification de signature ne bouge pas ; remplacer `latest.json` ne suffit pas à installer une archive non signée par la clé du projet.

Bénéfice annexe : les minutes GitHub Actions sont gratuites sur un dépôt public, runner macOS compris.

### 1.4 Vérifier que les clés fonctionnent pour un inconnu

Dans le workflow de release, avant publication : un appel à `/api/health` du proxy, puis une recherche TMDB et une recherche IGDB sur un titre connu. Le build ne publie pas si l'une des trois échoue. Cela protège d'un proxy hors ligne ou d'une clé révoquée dans Vercel, sans ouvrir la bibliothèque de personne. Depuis que les clés vivent dans Vercel, ce test ne dépend plus d'un secret du dépôt.

### 1.5 Conséquence à assumer

Un dépôt public rend la reconstruction de l'application triviale, donc l'extraction des clés d'API aussi. Le risque ne change pas, il devient visible. Raison de plus pour passer au proxy avant une diffusion large.

## Bloc 2 — Imports et exports guidés

**Implémenté et vérifié localement le 22 octobre 2026 ; pas encore publié.** Rapport et commandes : [QA_IMPORT_EXPORT.md](QA_IMPORT_EXPORT.md).

Le parcours commun aux sept bibliothèques propose l’origine du fichier, un tutoriel avec liens officiels et réserves, puis l’analyse locale. Aperçu, comparaison des doublons, résumé des ajouts/mises à jour/suppressions et confirmation finale précèdent toute écriture. Un remplacement demande une case de consentement supplémentaire ; il ne touche que la bibliothèque ouverte.

### Sources réellement prises en charge

| Service | Entrée | Reprise et limites |
|---|---|---|
| Letterboxd | CSV ou ZIP complet | Regroupement des cinq tables reconnues ; notes, statuts, dernière date explicite, avis et historique dans la note personnelle. Les contradictions bloquent. |
| Goodreads | CSV de bibliothèque | Livres uniquement ; auteurs, année, note personnelle /5, statut, avis et notes privées. Les dates de fin ne deviennent pas des débuts de lecture. |
| Notion | CSV ou ZIP Markdown/CSV | Correspondances explicites ; sélection de la table. Certaines notes Markdown sont associables dans Films seulement. |
| BetaSeries / TV Time | CSV compatible ou archive existante | Guides avec réserves ; correspondances génériques, aucun connecteur dédié ni export actuel garanti. |
| MyAnimeList | Guide de sauvegarde XML | Import direct XML/gzip non pris en charge ; cette limite est visible dès le choix de la source. |

Les exports Sylloge JSON/CSV restent réimportables selon leurs contrats. Le JSON peut porter sur la bibliothèque ouverte ou les sept bibliothèques du profil ; il reste la copie fidèle recommandée. Le CSV est limité à une bibliothèque et ne transporte pas les champs libres d’Art ni l’identité complète des citations.

### Preuves et travail différé

- Reconnaissance par contenu, avec tests synthétiques et limites décrites dans [IMPORTS_TIERS_MOTEUR.md](IMPORTS_TIERS_MOTEUR.md).
- Sources publiques et dates des tutoriels dans [IMPORT_GUIDES_SOURCES.md](IMPORT_GUIDES_SOURCES.md). Aucun téléchargement depuis un compte connecté n’a été exécuté.
- Choix « Conserver les deux fiches » pour les homonymes face à la bibliothèque existante ; aucune obligation de fusionner deux œuvres seulement parce que leurs titres sont identiques.
- Les mélanges de services dans une archive reconnue sont bloqués ; aucun plan multi-bibliothèque implicite n’est exécuté.
- Restent différés : glisser-déposer natif, adaptateurs XML/gzip MyAnimeList et autres services, corpus d’exports réels anonymisés. Leur présence dans la proposition initiale ne constitue pas un support livré.
- Les sélecteurs macOS réels et un parcours complet dans une application native isolée restent à exercer avant une déclaration de validation native exhaustive.

## Bloc 3 — Premier lancement, sauvegardes et réglages

**Implémenté localement le 22 octobre 2026 ; non committé, non publié.** Rapport et limites : [QA_ONBOARDING_SAUVEGARDES.md](QA_ONBOARDING_SAUVEGARDES.md).

### 3.1 Onboarding : démarrer et protéger la bibliothèque

- Conserver un parcours court avec identité et thème, puis trois départs explicites : **partir de zéro**, **restaurer une sauvegarde Sylloge**, **importer depuis un autre service**.
- **Restaurer une sauvegarde existante** : sélectionner un fichier ; prévoir aussi la sélection d’un dossier de sauvegardes, avec liste des copies valides, dates et contenu, puis choix de la version et aperçu avant confirmation. Ne jamais restaurer automatiquement le fichier le plus récent sans consentement.
- **Importer un service tiers dès l’onboarding** : ouvrir directement les guides, liens d’export et aperçus du bloc 2 ; réutiliser ses adaptateurs et confirmations, sans second moteur ni détour obligatoire par les réglages. Annoncer les formats non pris en charge.
- **Choisir le dossier des futures sauvegardes**, quelle que soit l’origine de la bibliothèque : dossier local ou dossier iCloud Drive / Google Drive présent sur l’ordinateur et inscriptible. Ce choix est distinct de la source de restauration ; choisir une ancienne sauvegarde ne configure pas implicitement sa destination future.
- Vérifier l’accès au dossier, expliquer la politique de conservation et créer une première sauvegarde après finalisation réussie du profil et des imports. Une annulation ou un dossier inaccessible ne doit jamais être présenté comme une protection active.
- Expliquer que le fournisseur synchronise les fichiers de sauvegarde choisis. Ne pas déplacer la base SQLite active dans un dossier cloud ; ne pas présenter ce mécanisme comme une synchronisation multi-appareil de Sylloge.

### 3.2 Un parcours unique de sauvegarde et restauration

- Présenter les actions par intention : **Sauvegarder Sylloge**, **Restaurer Sylloge**, **Importer d’un service**, **Exporter vers un tableur**. Réutiliser le même parcours dans l’onboarding et les réglages.
- **Décision confirmée par Aurélien** : un **fichier JSON unique, versionné**, sert à exporter une sauvegarde Sylloge et à réimporter le profil entier. Les sauvegardes manuelles, automatiques et leur restauration utilisent ce même contrat ; aucun choix DB/JSON à imposer dans le parcours ordinaire. Le CSV reste un export tabulaire secondaire.
- **Portée confirmée pour la restauration** : le profil entier et ses sept bibliothèques. Définir et afficher les champs effectivement sauvegardés ; préserver notes, avis, favoris, dates, progression, citations, champs personnalisés et relations. Les profils non concernés ne doivent pas être remplacés. L’extension à tous les profils de l’installation n’est pas implicite.
- La base `.db` reste le stockage de travail interne. Une éventuelle récupération exceptionnelle d’une ancienne base est hors du parcours standard et hors de ce lot ; elle ne constitue pas un second format de sauvegarde promis.
- Conserver la lecture des anciennes sauvegardes JSON ; clarifier les noms historiques de snapshots et retirer les libellés et compteurs restés à cinq collections. Aperçu des sept bibliothèques et confirmation explicite pour toute restauration globale.

### 3.3 Réglages et critères de validation

- **Profils** : créer, renommer, supprimer, avec la conséquence écrite sur les données.
- **Réglages** : une page par sujet (apparence, bibliothèque et sauvegardes, imports, mises à jour, à propos), chaque réglage avec sa conséquence écrite.
- **Sauvegardes** : rendre lisibles dossier actif, dernière réussite, absence de protection et restauration ; sauvegarder automatiquement avant toute migration de schéma.
- Vérifier chaque départ de l’onboarding, retour/annulation/erreur, mauvaise sauvegarde, ancienne version et dossier inaccessible avec des fixtures isolées. Aucune écriture avant confirmation ; aucune perte des autres bibliothèques ou profils ; aucune sauvegarde annoncée réussie avant son écriture réelle.
- Exercer le parcours natif de sélection des fichiers et dossiers avant publication. La compatibilité iCloud Drive / Google Drive doit être distinguée d’un essai effectif sur ces fournisseurs.

## Bloc 4 — Bibliothèques personnalisées

**Implémenté localement le 22 octobre 2026, non publié.** Rapport : [QA_BIBLIOTHEQUES_PERSONNALISEES.md](QA_BIBLIOTHEQUES_PERSONNALISEES.md).

- Décision d’Aurélien : uniquement des modèles prêts, ajoutés par un « + » sous les bibliothèques de la barre latérale, dans une fenêtre de choix. Huit modèles validés : Comics (bandes dessinées comprises), Magazines, Livres audio, Musique (albums), Podcasts, Documentaires et reportages, Spectacles (théâtre compris), Jeux de société.
- Comics devient une bibliothèque personnalisée ; Livres n’a plus de catégorie Comics. La migration 0021 déplace d’éventuels anciens comics de `books` vers `comics`, citations comprises.
- Une table par modèle (migration 0021), créée d’avance et vide tant que la bibliothèque n’est pas ajoutée ; `profile_libraries` garde la liste et l’ordre par profil. Un modèle définit libellé, icône, statuts proposés, progression, champs propres et filtre principal (`src/domain/customLibraries.ts`).
- Supprimer une bibliothèque supprime ses fiches sans copie, après confirmation qui annonce leur nombre.
- Le JSON de sauvegarde passe en version 4 (`customLibraries`) ; restauration, changement d’ordinateur et premier lancement les reprennent. Les versions 1 à 3 restent lisibles.
- Hors de ce premier lot : vues enregistrées, accueil, import/export par bibliothèque et recherche de métadonnées pour les bibliothèques personnalisées.

## Bloc 5 — Solidité et finitions

- **Portabilité intégrale de l’expérience — objectif futur confirmé** : permettre de récupérer dans un JSON documenté toutes les informations personnelles conservées par Sylloge, au-delà des seules fiches : organisation du profil, vues enregistrées, préférences pertinentes, bibliothèques et champs personnalisés, liens et historique réellement stocké. Établir un inventaire explicite des inclusions/exclusions ; ne jamais inventer des événements qui n’ont pas été enregistrés. Exclure les secrets et données techniques non nécessaires à la portabilité.
- **Liberté de quitter Sylloge** : garder ce JSON lisible et exploitable sans l’application, avec schéma/version documentés et compatibilité de lecture des anciennes sauvegardes. Prévoir ultérieurement des conversions vers les formats acceptés par d’autres services, avec aperçu des champs perdus ou transformés. Un JSON Sylloge ne devient pas automatiquement importable chez un tiers ; ces conversions ne sont pas encore implémentées.
- **Performance** : virtualiser les grilles au-delà de quelques centaines de fiches, mesurer avec une bibliothèque de 5 000 entrées.
- **Accessibilité** : navigation clavier complète, contrastes vérifiés sur les deux thèmes, libellés de commande lisibles.
- **Diagnostic** : un export de diagnostic (version, système, dernières erreurs) sans aucune donnée de bibliothèque, pour aider un utilisateur à distance.
- **Windows** : parcours complet sur une machine réelle, raccourcis, dialogues de fichier, polices.
- **Site** : automatiser la copie du DMG et de l'EXE et la mise à jour de la version dans la page à chaque release.
- **Crédits TMDB** : rétablir la mention avant une diffusion large, ou documenter le risque assumé.

## Plus tard — proxy et service cloud

- **Proxy de clés en Vercel Functions** : la fonction détient les clés TMDB et IGDB en variables d'environnement, l'application l'appelle, la fonction ajoute la clé, limite le débit et met les réponses en cache. Les clés ne quittent jamais le serveur. Elle absorbe aussi l'OAuth Twitch d'IGDB, donc l'application n'a plus de jeton à gérer. C'est la réponse propre au problème d'extraction, et elle n'envoie aucune donnée de bibliothèque.
  **Fait le 21 octobre 2026.** Proxy déployé sur `https://sylloge.vercel.app/api/{tmdb,igdb}`, clés dans l'environnement Vercel, vérifié en production (TMDB, IGDB, refus de méthode, traversée de chemin, cache de bord). L'application appelle désormais le proxy : les trois fichiers de clés embarquées, le jeton Twitch et son cache, la dépendance `zeroize` et le générateur `generate_embedded_key.py` sont supprimés. Une clé compromise se remplace dans Vercel, sans republier l'application. Détail : `sylloge-web/docs/PROXY_VERCEL.md`.
- **Service payant multi-appareil** : synchronisation entre machines, sauvegarde hébergée, partage de bibliothèque. La licence MIT ne l'empêche pas. Il suppose une authentification, donc un vrai changement de modèle, à traiter comme un produit séparé.

## Ordre proposé

1. Ouvrir le projet : dépôt public, licence et README faits ; reste le test des clés en CI. **Sans la mise à jour sans jeton — faite —, chaque nouvelle version devait être réinstallée à la main.**
2. Imports guidés : tutoriels et reconnaissance, parce que c'est ce qui fait basculer un utilisateur.
3. Premier lancement et réglages.
4. Bibliothèques personnalisées, quand le socle est stable.
5. Finitions, performance, puis proxy.

## Ce qu'il manque encore dans la liste initiale

- **Mise à jour du site à chaque release** : aujourd'hui manuelle, donc oubliable.
- **Sauvegarde avant migration** : une migration ratée est la seule façon de perdre une bibliothèque.
- **Retour d'erreur utile** : un signalement « ça ne marche pas » sans capture ne donne rien d'exploitable.
- **Notes de version visibles** avant d'installer.
- **Test sur une bibliothèque volumineuse** : les performances se dégradent sans qu'on le voie avec dix fiches.
