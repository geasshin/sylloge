# Sylloge - publication automatique d’une release Tauri

Ce guide décrit la publication macOS automatisée de Sylloge depuis les GitHub Releases publiques de `geasshin/sylloge`, et leur lecture par l’application sans authentification. Il ne contient aucune clé privée ni passphrase.

## Générer et conserver la clé une seule fois

Si la paire de clés n’existe pas encore, créez-la depuis le dossier du projet :

```bash
mkdir -p "$HOME/.tauri"
npm run tauri -- signer generate --write-keys "$HOME/.tauri/sylloge-updater.key"
chmod 600 "$HOME/.tauri/sylloge-updater.key"
```

Tauri demande alors une passphrase : elle ne s’affiche pas pendant la saisie, ce qui est normal. Le résultat contient deux fichiers :

- `~/.tauri/sylloge-updater.key` : clé privée, strictement secrète ;
- `~/.tauri/sylloge-updater.key.pub` : clé publique, intégrable dans la configuration de l’application.

Ne générez pas une nouvelle paire par routine. Après une première release distribuée, les installations existantes n’accepteront que les artefacts signés avec la même clé privée.

## Ce que vérifie Sylloge

Le dépôt est public depuis le 21 octobre 2026. L’application lit une seule adresse, déclarée dans `src-tauri/tauri.conf.json` :

```text
https://github.com/geasshin/sylloge/releases/latest/download/latest.json
```

GitHub redirige cette adresse vers le stockage du dernier fichier publié. Aucune authentification, aucun jeton, aucune limite d’API : n’importe quelle installation peut vérifier les mises à jour. Le manifeste donne l’URL publique de l’archive et sa signature. L’application vérifie cette signature avec la clé publique embarquée, puis remplace le bundle. Une branche Git, un commit ou une archive non signée ne peut pas devenir une mise à jour installable.

Le manifeste pointe l’archive par son URL de release publique (`releases/download/<tag>/Sylloge.app.tar.gz`). Il ne faut pas revenir à l’URL d’asset de l’API GitHub : celle-ci exige l’en-tête `Accept: application/octet-stream`, et un jeton tant que le dépôt est privé.

Les versions antérieures à la 0.6.8 embarquent l’ancienne adresse et un jeton dans le Trousseau. Elles doivent être remplacées une seule fois par un DMG récent ; ensuite, la mise à jour intégrée suffit. Le code du jeton a été supprimé : lecture du Trousseau, commandes natives et écran de réglages.

## Préparer le build local

La clé privée maître reste hors du dépôt, avec des permissions limitées à son propriétaire. Sa passphrase reste séparée de la clé. Ne copiez jamais leur contenu dans Git, un fichier `.env`, GitHub, un chat, un script, une commande enregistrée ou ce document.

Dans Terminal macOS (zsh), exécutez ce bloc depuis le dossier du projet. Il transmet à Tauri le chemin de la clé privée, demande la passphrase sans l’afficher, puis l’oublie automatiquement à la sortie du sous-shell :

```bash
(
  export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/sylloge-updater.key"
  read -rs "TAURI_SIGNING_PRIVATE_KEY_PASSWORD?Passphrase de la clé Tauri : "
  printf '\n'
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  npm run tauri:build
)
```

Ne copiez pas ce bloc dans une conversation ou un fichier qui ajouterait la passphrase à l’historique. Le build local ne publie rien. Les versions distribuées sont créées par le workflow GitHub décrit ci-dessous.

Sur macOS, les artefacts attendus sont :

- un fichier `.dmg` dans `src-tauri/target/release/bundle/dmg/`, destiné à la première installation manuelle ;
- `Sylloge.app.tar.gz` : archive d’update
- `Sylloge.app.tar.gz.sig` : signature Tauri de cette archive

Le bundle `.app` peut aussi être présent pour inspection locale. La configuration macOS utilise actuellement la signature ad hoc `-`. Sans Developer ID et notarisation, Gatekeeper peut donc demander un contournement explicite lors d’une première installation de test ou d’une diffusion restreinte.

## Publication automatique depuis `main`

Le fichier `.github/workflows/macos-release.yml` lance une publication après chaque push sur `main`. Le flux :

1. Lit la version de base du projet et les tags stables `vX.Y.Z`, puis calcule le prochain numéro correctif.
2. Applique cette version au build seulement, dans le runner GitHub Actions. Aucun fichier de version n’est commité automatiquement.
3. Régénère les clés embarquées et construit un bundle macOS universel avec `npm run tauri:build -- --target universal-apple-darwin`.
4. Produit le DMG, l’archive `Sylloge.app.tar.gz` et sa signature Tauri.
5. Retrouve un éventuel brouillon dans la liste des releases ou en crée un, puis téléverse l’archive signée. Il lit l’asset par identifiant de release, génère `latest.json` avec l’URL d’asset API et la signature exacte, téléverse le manifeste puis publie la release par son identifiant en ciblant le commit exact du build.

Les artefacts du build automatisé se trouvent sous `src-tauri/target/universal-apple-darwin/release/bundle/` dans le runner CI.

Le manifeste associe la même archive universelle aux cibles `darwin-aarch64` et `darwin-x86_64`. Les commits sur les branches de travail ne publient rien. Un échec de build, de signature ou de génération du manifeste arrête le flux avant la publication. Un brouillon incomplet peut rester dans GitHub et sera réutilisé lors d’une nouvelle exécution, sans consommer le numéro de version. Une release brouillon ne doit pas être recherchée par son tag tant qu’il n’est pas publié : le workflow la retrouve dans la liste des releases, puis utilise son identifiant pour lire ses assets et la publier.

Le dépôt doit avoir ces secrets GitHub Actions configurés :

- `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PASSWORD`, correspondant à la paire Tauri conservée par le projet ;
- `SYLLOGE_TMDB_API_KEY` ;
- `SYLLOGE_IGDB_CLIENT_ID` et `SYLLOGE_IGDB_CLIENT_SECRET`.

La clé privée Tauri est transmise au build pour signer l’archive updater. Elle n’est ni affichée ni écrite dans le dépôt. Les clés API sont écrites uniquement dans les fichiers temporaires ignorés par Git du runner, puis embarquées dans l’application.

Pour récupérer une mise à jour sur une installation existante, ouvrez Sylloge puis utilisez la vérification de mise à jour. Si la recherche automatique est activée, l’application peut aussi la proposer au démarrage. Le téléchargement et l’installation restent soumis au choix de la personne.

## Test réel obligatoire

Le test de chaîne complète exige deux versions réellement signées avec la même clé :

1. Installez manuellement le DMG de la première version qui utilise les endpoints d’assets de l’API GitHub.
2. Vérifiez que la recherche de mise à jour aboutit sans aucun jeton enregistré, sur une installation neuve.
3. Poussez un changement validé sur `main` et vérifiez la réussite du workflow dans GitHub Actions.
4. Vérifiez la nouvelle GitHub Release, le DMG, l’archive, son `.sig` et `latest.json`. L’URL de l’archive dans le manifeste doit viser `api.github.com/repos/geasshin/sylloge/releases/assets/{asset_id}`.
5. Dans l’application installée, vérifiez la détection, les notes, « Plus tard », l’ignorance puis le rétablissement de la version.
6. Lancez « Télécharger et installer » et vérifiez le redémarrage ainsi que la conservation de la bibliothèque SQLite locale.

Cette vérification nécessite une vraie release signée. Un `404` indique une release absente ou un `latest.json` manquant : il ne constitue jamais un succès d’installation.

## Conservation de la clé

Après la première release distribuée, les installations existantes n’accepteront que les mises à jour signées par la même clé privée. Conservez donc la clé maître dans un emplacement privé hors Git, gardez une seconde sauvegarde chiffrée hors ligne et stockez la passphrase séparément. Ne perdez pas la clé et ne la faites pas tourner régulièrement : une rotation casserait les mises à jour des installations existantes sans migration explicitement conçue et testée.
