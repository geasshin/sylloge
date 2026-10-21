# Vers Sylloge 1.0 — proposition

**Brouillon du 21 octobre 2026, à arbitrer par Aurélien.** Ce document propose un chemin jusqu'à une version distribuable largement. Il ne remplace pas `ROADMAP.md`, qui reste la feuille de route des lots en cours ; il en prépare la suite et sera fusionné dedans après arbitrage.

## Le constat

Le site est en ligne, les deux installateurs existent, la 0.6.7 s'installe. Trois choses empêchent aujourd'hui de distribuer à des inconnus : la mise à jour exige un jeton GitHub, les clés d'API sont extractibles du binaire, et le premier lancement n'a jamais été parcouru de bout en bout. Le reste est du confort et de la solidité.

## Bloc 1 — Pouvoir distribuer (bloquant)

### 1.1 Mise à jour sans jeton

Aujourd'hui, le dépôt est privé : Sylloge lit un jeton GitHub dans le Trousseau pour interroger l'API. Sans jeton, les réglages affichent « Enregistrez un jeton GitHub pour accéder aux releases privées » et aucune mise à jour n'est possible.

Cible : un dépôt public dédié aux artefacts, `geasshin/sylloge-releases`. Le code reste privé. Le workflow macOS y publie le DMG, l'archive, sa signature et `latest.json`. L'application interroge l'URL statique :

```text
https://github.com/geasshin/sylloge-releases/releases/latest/download/latest.json
```

Aucun jeton, aucune authentification, aucune limite d'API. La vérification de signature ne bouge pas : remplacer `latest.json` ne suffit pas à installer une archive non signée par la clé du projet.

Conséquence : le code de jeton (Trousseau, commandes, réglages) devient inutile et disparaît, ou reste en secours si le dépôt redevient privé.

### 1.2 Vérifier que les clés fonctionnent pour un inconnu

Un test dans le workflow : après génération des clés embarquées, un binaire de test qui exécute une recherche TMDB et une recherche IGDB réelles, avec un titre connu, et échoue si la réponse est vide ou 401. Le build ne publie pas si le test échoue. Cela protège contre une clé expirée ou un secret GitHub mal recopié, sans ouvrir la bibliothèque de personne.

### 1.3 Décider du sort des clés

Les clés TMDB et IGDB sont compilées dans le binaire, obfusquées. Elles fonctionnent pour tout le monde, et elles sont récupérables par quelqu'un de motivé.

- **Option 1, garder en l'état.** Coût nul. Risque : usage de la clé TMDB par un tiers, quota partagé, révocation possible par TMDB.
- **Option 2, proxy.** Une fonction serveur (Cloudflare Worker ou fonction Vercel) détient les clés en variables d'environnement. L'application appelle `api.<domaine>/tmdb/...` et le proxy ajoute la clé, limite le débit et met en cache les réponses. Les clés ne quittent jamais le serveur. Coût : une fonction à écrire, un domaine, gratuit à faible volume. Le récit « pas de compte, pas de serveur pour ta bibliothèque » tient toujours : aucune donnée de bibliothèque ne part.
- **Option 3, clé par personne.** Écartée par choix produit.

Recommandation : option 2 avant une diffusion large, option 1 pendant la phase de test privée. Décider quand le premier inconnu installe l'application.

## Bloc 2 — Imports (priorité produit)

Le principe : la personne exporte depuis son ancien service, dépose le fichier, Sylloge reconnaît le format et propose un aperçu avant écriture. Rien n'est écrit sans confirmation.

### 2.1 Détection automatique des exports connus

| Service | Export réel | Ce qu'on en tire |
|---|---|---|
| Letterboxd | `ratings.csv`, `watched.csv`, `watchlist.csv`, `diary.csv` | films vus, notes, dates, envies |
| Goodreads | `goodreads_library_export.csv` | livres, statuts, notes, dates |
| StoryGraph | CSV d'export | livres, statuts, notes |
| MyAnimeList | XML (export de profil) | anime, mangas, épisodes/tomes, notes |
| AniList | JSON (export) | anime, mangas, progression |
| TV Time | archive RGPD (`seen_episode*.json`, `tracking-prod-records-v2.csv`) | séries, épisodes vus |
| BetaSeries | CSV | séries, progression |
| Notion | ZIP de base | déjà géré pour les films |
| Sylloge | JSON/ZIP | déjà géré |

Étapes : reconnaître le fichier seul (nom, en-tête, signature), proposer le mapping, montrer le résumé, laisser choisir la bibliothèque cible, gérer les doublons par identifiant externe puis par titre et année.

### 2.2 Le tout-en-un

Un seul bouton « Importer » qui accepte n'importe lequel de ces fichiers, ou un ZIP contenant plusieurs exports, et propose un plan : « 842 films Letterboxd, 310 livres Goodreads, 96 séries TV Time ». Chaque lot s'applique séparément, avec son propre aperçu.

### 2.3 Ce qu'on ne fera pas

Récupérer les données en se connectant au site à la place de la personne. Aucun de ces services n'expose d'API publique d'historique complet ; les contourner demanderait de stocker leurs identifiants, ce qui contredit le modèle local. Le parcours visé : un lien direct vers la page d'export du service, et le fichier attendu nommé explicitement.

## Bloc 3 — Premier lancement et réglages

- **Onboarding** : un accueil qui propose d'importer tout de suite, ou de partir d'une bibliothèque vide ; choix du thème ; explication en une phrase du fichier local. Jamais plus de trois écrans.
- **Profils** : le vocabulaire « compte » n'existe pas. Créer, renommer, supprimer un profil, avec la confirmation et le sort des données expliqués.
- **Réglages** : une page par sujet (apparence, bibliothèque et sauvegardes, imports, mises à jour, à propos), chaque réglage avec sa conséquence écrite. Les réglages de mise à jour se réduisent à « rechercher automatiquement » une fois le jeton supprimé.
- **Sauvegardes** : rendre lisible la sauvegarde automatique existante, proposer une restauration, et sauvegarder automatiquement avant toute migration de schéma.

## Bloc 4 — Bibliothèques personnalisées

- Un « + » sous la barre des bibliothèques propose des modèles prêts : Comics, Recettes, Vinyles, Photos, Podcasts, Jeux de société.
- Un modèle définit : libellé, icône, unité de progression (tome, saison, épisode), champs propres, vues par défaut, statuts.
- Contrainte technique : chaque bibliothèque devient une table créée à la demande, avec les mêmes garanties que les sept actuelles. C'est un chantier de migration, pas un ajout d'écran. À faire après le bloc 2.

## Bloc 5 — Solidité et finitions

- **Performance** : virtualiser les grilles au-delà de quelques centaines de fiches, mesurer avec une bibliothèque de 5 000 entrées.
- **Accessibilité** : navigation clavier complète, contrastes vérifiés sur les deux thèmes, libellés de commande lisibles.
- **Diagnostic** : un bouton « exporter un diagnostic » (version, système, dernières erreurs) sans aucune donnée de bibliothèque, pour aider un utilisateur à distance.
- **Windows** : parcours complet sur une machine Windows réelle, raccourcis, dialogues de fichier, polices.
- **Site** : automatiser la copie du DMG et de l'EXE et la mise à jour de la version dans la page à chaque release, plutôt que de les faire à la main.
- **Crédits TMDB** : rétablir la mention avant une diffusion large, ou documenter le risque assumé dans les crédits du site.

## Ordre proposé

1. Mise à jour publique sans jeton, test des clés en CI, décision sur le proxy. **Sans cela, chaque nouvelle version doit être réinstallée à la main.**
2. Onboarding et réglages, pour que le premier lancement tienne debout.
3. Imports multi-services, parce que c'est ce qui fait basculer un utilisateur.
4. Bibliothèques personnalisées, quand le socle est stable.
5. Finitions et performance, en continu.

## Ce qu'il manque encore dans la liste initiale

- **Mise à jour du site à chaque release** : aujourd'hui manuelle, donc oubliable.
- **Sauvegarde avant migration** : une migration ratée est la seule façon de perdre une bibliothèque.
- **Retour d'erreur utile** : un utilisateur qui signale « ça ne marche pas » sans capture ne donne rien d'exploitable.
- **Notes de version visibles** : elles existent dans `latest.json`, autant les afficher avant d'installer.
- **Test sur une bibliothèque volumineuse** : les perfs se dégradent sans qu'on le voie avec dix fiches.
