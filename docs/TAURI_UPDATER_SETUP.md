# Sylloge - publication automatique d’une release Tauri

Ce guide décrit la publication macOS automatisée de Sylloge depuis les GitHub Releases privées de `geasshin/sylloge`, et leur accès depuis l’application avec un jeton conservé dans le Trousseau macOS. Il ne contient aucune clé privée, passphrase ni jeton.

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

Sylloge lit uniquement le manifeste HTTPS suivant :

```text
https://github.com/geasshin/sylloge/releases/latest/download/latest.json
```

Le dépôt étant privé, GitHub exige une authentification pour lire le manifeste et télécharger l’archive. Dans les réglages, la personne fournit un jeton d’accès personnel GitHub à granularité fine, limité au dépôt `geasshin/sylloge`, avec l’autorisation **Contents: Read-only**. Sylloge le conserve dans le Trousseau macOS. Le jeton n’est pas renvoyé à l’interface, enregistré dans les préférences ou écrit dans les journaux. Le manifeste fournit une archive et la signature lue dans son fichier `.sig`. L’application vérifie cette signature avec la clé publique embarquée. Une branche Git, un commit ou un artefact non signé ne peut pas devenir une mise à jour installable.

La première installation reste manuelle depuis un DMG. De même, une installation de Sylloge 0.6.0 doit d’abord être remplacée manuellement par un DMG contenant l’authentification privée, car cette ancienne version ne peut pas accéder au dépôt privé. Après cette installation unique, enregistrez le jeton dans les réglages de l’application. Les mises à jour suivantes peuvent alors être recherchées depuis Sylloge.

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
5. Génère `latest.json` avec l’URL HTTPS et la signature exacte, puis publie les fichiers dans une GitHub Release versionnée.

Les artefacts du build automatisé se trouvent sous `src-tauri/target/universal-apple-darwin/release/bundle/` dans le runner CI.

Le manifeste associe la même archive universelle aux cibles `darwin-aarch64` et `darwin-x86_64`. Les commits sur les branches de travail ne publient rien. Un échec de build, de signature ou de manifeste arrête le flux avant la création de la release.

Le dépôt doit avoir ces secrets GitHub Actions configurés :

- `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PASSWORD`, correspondant à la paire Tauri conservée par le projet ;
- `SYLLOGE_TMDB_API_KEY` ;
- `SYLLOGE_IGDB_CLIENT_ID` et `SYLLOGE_IGDB_CLIENT_SECRET`.

La clé privée Tauri est transmise au build pour signer l’archive updater. Elle n’est ni affichée ni écrite dans le dépôt. Les clés API sont écrites uniquement dans les fichiers temporaires ignorés par Git du runner, puis embarquées dans l’application.

Pour récupérer une mise à jour sur une installation existante, ouvrez Sylloge, enregistrez le jeton dans les paramètres si nécessaire, puis utilisez la vérification de mise à jour. Si la recherche automatique est activée et qu’un jeton est présent, l’application peut aussi la proposer au démarrage. Le téléchargement et l’installation restent soumis au choix de la personne.

## Test réel obligatoire

Le test de chaîne complète exige deux versions réellement signées avec la même clé :

1. Installez manuellement le DMG initial sur une machine de test.
2. Poussez un changement validé sur `main` et vérifiez la réussite du workflow dans GitHub Actions.
3. Vérifiez la nouvelle GitHub Release, le DMG, l’archive, son `.sig` et `latest.json`.
4. Dans l’application installée, vérifiez la détection, les notes, « Plus tard », l’ignorance puis le rétablissement de la version.
5. Lancez « Télécharger et installer » et vérifiez le redémarrage ainsi que la conservation de la bibliothèque SQLite locale.

Cette vérification nécessite une vraie release signée et un jeton autorisé. Un `404` peut indiquer une release absente ou un accès refusé au dépôt privé : il ne constitue jamais un succès d’installation.

## Conservation de la clé

Après la première release distribuée, les installations existantes n’accepteront que les mises à jour signées par la même clé privée. Conservez donc la clé maître dans un emplacement privé hors Git, gardez une seconde sauvegarde chiffrée hors ligne et stockez la passphrase séparément. Ne perdez pas la clé et ne la faites pas tourner régulièrement : une rotation casserait les mises à jour des installations existantes sans migration explicitement conçue et testée.
