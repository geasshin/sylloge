# Sylloge - préparation d’une release Tauri signée

Ce guide prépare une chaîne de mises à jour Tauri depuis les GitHub Releases publiques de `geasshin/sylloge`. Il ne publie rien et ne contient aucune clé privée ni passphrase.

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

Le manifeste fournit une archive et la signature lue dans son fichier `.sig`. L’application vérifie cette signature avec la clé publique embarquée. Une branche Git, un commit ou un artefact non signé ne peut pas devenir une mise à jour installable.

La première installation d’une version qui contient cet updater reste manuelle. Une installation existante ne pourra rechercher une mise à jour qu’après ce premier bundle installé localement.

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

Ne copiez pas ce bloc dans une conversation ou un fichier qui ajouterait la passphrase à l’historique. La version distribuée doit correspondre aux manifestes de la release. La version `0.3.0` est la première installation manuelle publiée contenant l’updater ; la prochaine release publique signée devra servir à exercer une mise à jour réelle depuis elle.

Sur macOS, les artefacts attendus sont :

- un fichier `.dmg` dans `src-tauri/target/release/bundle/dmg/`, destiné à la première installation manuelle ;
- `Sylloge.app.tar.gz` : archive d’update
- `Sylloge.app.tar.gz.sig` : signature Tauri de cette archive

Le bundle `.app` peut aussi être présent pour inspection locale. La configuration macOS utilise actuellement la signature ad hoc `-`. Sans Developer ID et notarisation, Gatekeeper peut donc demander un contournement explicite lors d’une première installation de test ou d’une diffusion restreinte.

## Créer `latest.json`

Le manifeste statique doit contenir une version Semantic Versioning, les notes, une URL HTTPS d’archive et le contenu exact du fichier `.sig`. La signature est une chaîne, jamais un chemin ou une URL.

Pour éviter toute copie manuelle, le script sans dépendance `scripts/create-tauri-latest-json.mjs` lit les notes et le fichier `.sig`, puis écrit un JSON stable. Il ne lit jamais de clé privée.

Préparez un fichier de notes local, puis utilisez les chemins de votre artefact réel :

```bash
node scripts/create-tauri-latest-json.mjs \
  --version 0.4.0 \
  --notes-file /chemin/prive/notes-0.4.0.md \
  --url https://github.com/geasshin/sylloge/releases/download/v0.4.0/Sylloge.app.tar.gz \
  --signature-file /chemin/prive/Sylloge.app.tar.gz.sig \
  --target darwin-aarch64 \
  --output /chemin/prive/latest.json
```

Choisissez `darwin-aarch64` pour une archive Apple Silicon ou `darwin-x86_64` pour une archive Intel. La clé `platforms` doit correspondre à l’architecture réelle de l’archive. Tauri valide tout le manifeste avant toute comparaison de version.

Le fichier obtenu suit cette forme :

```json
{
  "version": "0.4.0",
  "notes": "Notes de release",
  "platforms": {
    "darwin-aarch64": {
      "signature": "contenu exact de Sylloge.app.tar.gz.sig",
      "url": "https://github.com/geasshin/sylloge/releases/download/v0.4.0/Sylloge.app.tar.gz"
    }
  }
}
```

Le script est vérifié par `npm run verify` sur une fixture temporaire. Il refuse une URL non HTTPS, une cible Tauri invalide, des notes ou une signature vides, et tout écrasement des fichiers source de notes ou de signature.

## Publier manuellement la release

Après le build signé et la vérification des noms de fichiers :

1. Créez une GitHub Release versionnée correspondant au bundle.
2. Ajoutez l’archive `Sylloge.app.tar.gz`.
3. Ajoutez son fichier `Sylloge.app.tar.gz.sig` sans le modifier.
4. Ajoutez le `latest.json` généré, avec l’URL exacte de l’archive uploadée.
5. Vérifiez publiquement que `https://github.com/geasshin/sylloge/releases/latest/download/latest.json` télécharge bien le manifeste attendu.

Ne publiez pas une release qui pointe vers une archive non signée, une archive différente de celle décrite par la signature, une URL HTTP ou une version incohérente.

## Test réel obligatoire

Le test de chaîne complète exige deux versions réellement signées avec la même clé :

1. Installez manuellement sur une machine de test une version inférieure contenant l’updater.
2. Publiez une release supérieure avec l’archive, le `.sig` et le `latest.json` correspondants.
3. Vérifiez la détection, les notes, « Plus tard », l’ignorance puis le rétablissement de la version.
4. Lancez « Télécharger et installer » et vérifiez le redémarrage ainsi que la conservation de la bibliothèque SQLite locale.

Ce test ne peut pas être simulé avant la publication d’un vrai artefact signé. Un `404` du manifeste signifie seulement qu’aucune release n’est disponible : il ne constitue jamais un succès d’installation.

## Conservation de la clé

Après la première release distribuée, les installations existantes n’accepteront que les mises à jour signées par la même clé privée. Conservez donc la clé maître dans un emplacement privé hors Git, gardez une seconde sauvegarde chiffrée hors ligne et stockez la passphrase séparément. Ne perdez pas la clé et ne la faites pas tourner régulièrement : une rotation casserait les mises à jour des installations existantes sans migration explicitement conçue et testée.
