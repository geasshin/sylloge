# Vers Sylloge 1.0 — proposition

**Brouillon du 21 octobre 2026, à arbitrer par Aurélien.** Ce document propose un chemin jusqu'à une version distribuable largement. Il ne remplace pas `ROADMAP.md`, qui reste la feuille de route des lots en cours ; il en prépare la suite et sera fusionné dedans après arbitrage.

## Décisions acquises le 21 octobre 2026

- **L'application est gratuite et open source.** Le dépôt `geasshin/sylloge` devient public, et la communication du site s'appuie dessus.
- **Un service cloud payant reste possible plus tard** (multi-appareil), sans changer de licence.
- **Le proxy de clés viendra plus tard**, porté par des fonctions Vercel.
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

Dans le workflow, après génération des clés embarquées : une recherche TMDB et une recherche IGDB réelles sur un titre connu, qui échouent si la réponse est vide ou 401. Le build ne publie pas si le test échoue. Cela protège d'une clé expirée ou d'un secret mal recopié, sans ouvrir la bibliothèque de personne.

### 1.5 Conséquence à assumer

Un dépôt public rend la reconstruction de l'application triviale, donc l'extraction des clés d'API aussi. Le risque ne change pas, il devient visible. Raison de plus pour passer au proxy avant une diffusion large.

## Bloc 2 — Imports guidés

Le principe : Sylloge ne se connecte jamais à la place de la personne. Elle l'accompagne jusqu'au fichier, puis reconnaît ce fichier sans lui demander de choisir un format. Rien n'est écrit sans confirmation.

### 2.1 Un tutoriel par service

Pour chaque service, un écran qui contient : un lien direct vers la page d'export, trois à cinq étapes numérotées avec le nom exact du menu, le nom du fichier attendu, et une zone qui accepte aussi le glisser-déposer.

| Service | Page d'export | Fichier attendu |
|---|---|---|
| Letterboxd | Settings, Import and Export | `ratings.csv`, `watched.csv`, `watchlist.csv`, `diary.csv` |
| Goodreads | My Books, Import and export | `goodreads_library_export.csv` |
| StoryGraph | Manage account, export | CSV d'export |
| MyAnimeList | Export de la liste | XML |
| AniList | Settings, export des données | JSON |
| TV Time | Demande d'export RGPD | archive de JSON et CSV |
| BetaSeries | Compte, export | CSV |
| Notion | Base exportée | ZIP |

Les URL et les libellés changent avec le temps : chaque tutoriel porte une date de vérification, et un lien mort est un défaut à corriger.

### 2.2 Reconnaissance automatique

Le fichier déposé est identifié seul : nom, en-tête de colonnes, signature du contenu. Le mapping est proposé, jamais imposé. Un même ZIP peut contenir plusieurs exports et donner un plan : « 842 films Letterboxd, 310 livres Goodreads, 96 séries TV Time ».

Un corpus de fichiers réels anonymisés sert de base de test : chaque format reconnu a sa fixture, et la reconnaissance est vérifiée à chaque build. Sans ce corpus, elle se dégrade sans qu'on le voie.

### 2.3 Ce qu'on ne fera pas

Se connecter aux services à la place de la personne. Aucun n'expose d'API d'historique complet, et stocker leurs identifiants contredirait le modèle local. Le tutoriel est la bonne réponse, pas un contournement.

## Bloc 3 — Premier lancement et réglages

- **Onboarding** : proposer d'importer tout de suite ou de partir d'une bibliothèque vide ; choix du thème ; une phrase sur le fichier local. Trois écrans au maximum.
- **Profils** : créer, renommer, supprimer, avec la conséquence écrite sur les données.
- **Réglages** : une page par sujet (apparence, bibliothèque et sauvegardes, imports, mises à jour, à propos), chaque réglage avec sa conséquence écrite. Les réglages de mise à jour se réduisent à « rechercher automatiquement » une fois le jeton supprimé.
- **Sauvegardes** : rendre lisible la sauvegarde automatique existante, proposer une restauration, et sauvegarder automatiquement avant toute migration de schéma.

## Bloc 4 — Bibliothèques personnalisées

- Un « + » sous la barre des bibliothèques propose des modèles prêts : Comics, Recettes, Vinyles, Photos, Podcasts, Jeux de société.
- Un modèle définit : libellé, icône, unité de progression, champs propres, vues par défaut, statuts.
- Contrainte technique : chaque bibliothèque devient une table créée à la demande, avec les mêmes garanties que les sept actuelles. C'est une migration, pas un ajout d'écran. À faire après le bloc 2.

## Bloc 5 — Solidité et finitions

- **Performance** : virtualiser les grilles au-delà de quelques centaines de fiches, mesurer avec une bibliothèque de 5 000 entrées.
- **Accessibilité** : navigation clavier complète, contrastes vérifiés sur les deux thèmes, libellés de commande lisibles.
- **Diagnostic** : un export de diagnostic (version, système, dernières erreurs) sans aucune donnée de bibliothèque, pour aider un utilisateur à distance.
- **Windows** : parcours complet sur une machine réelle, raccourcis, dialogues de fichier, polices.
- **Site** : automatiser la copie du DMG et de l'EXE et la mise à jour de la version dans la page à chaque release.
- **Crédits TMDB** : rétablir la mention avant une diffusion large, ou documenter le risque assumé.

## Plus tard — proxy et service cloud

- **Proxy de clés en Vercel Functions** : la fonction détient les clés TMDB et IGDB en variables d'environnement, l'application l'appelle, la fonction ajoute la clé, limite le débit par installation et met les réponses en cache. Les clés ne quittent jamais le serveur. Elle peut aussi absorber l'OAuth Twitch d'IGDB. C'est la réponse propre au problème d'extraction, et elle n'envoie aucune donnée de bibliothèque.
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
