# Mises à jour de Sylloge

## Ce que voit la personne

La recherche est lancée ~1,5 s après l’ouverture, puis toutes les six heures tant que l’application reste
ouverte. Elle est active par défaut et se coupe dans Paramètres › Application (« Rechercher automatiquement »).

Quand une version publiée, signée, plus récente et non ignorée existe, une carte discrète apparaît en bas à
droite (voir « Annonces en coin » dans [DESIGN.md](../DESIGN.md)). Elle propose :

- **Installer maintenant** : téléchargement, vérification de signature, installation, redémarrage ;
- **Plus tard** : masquée pour la session, elle revient à la prochaine ouverture ;
- **Ne plus proposer cette version** : enregistrée en base, réversible dans les réglages ;
- **×** : ferme l’annonce comme « Plus tard ».

Aucune installation n’a lieu sans action explicite. Un échec réseau ou un dépôt indisponible reste silencieux :
c’est l’état normal d’un usage hors ligne.

## Le manifeste, et pourquoi il casse une plateforme à la fois

Le point d’entrée (`src-tauri/tauri.conf.json`) est
`https://github.com/geasshin/sylloge/releases/latest/download/latest.json`. Ce fichier est **statique et
partagé** par toutes les plateformes : il contient une entrée par cible.

```json
{
  "version": "0.6.11",
  "notes": "…",
  "pub_date": "2026-10-23T12:00:00.000Z",
  "platforms": {
    "darwin-aarch64": { "signature": "…", "url": "…/Sylloge.app.tar.gz" },
    "darwin-x86_64":  { "signature": "…", "url": "…/Sylloge.app.tar.gz" },
    "windows-x86_64": { "signature": "…", "url": "…/Sylloge_0.6.11_x64-setup.exe" }
  }
}
```

`tauri-plugin-updater` cherche la cible de la machine dans `platforms` et renvoie `TargetNotFound` si elle
manque. Conséquence vécue jusqu’au 23 octobre 2026 : le manifeste ne publiait que `darwin-*`, donc **aucun
client Windows ne pouvait se mettre à jour**, et l’erreur s’affichait comme « vérifiez votre connexion ».

## Qui écrit quoi

| Workflow | Écrit |
| --- | --- |
| `macos-release.yml` | crée la release (brouillon), attache dmg + `Sylloge.app.tar.gz` + `.sig`, écrit `latest.json` avec `darwin-aarch64` et `darwin-x86_64`, vérifie, publie la release |
| `windows-release.yml` | attend la release, attache l’installeur NSIS + `.sig`, **fusionne** `windows-x86_64` dans le `latest.json` existant, vérifie que les trois cibles sont présentes |

Le workflow Windows ne crée jamais la release et ne fabrique jamais un manifeste sans `darwin` : un manifeste
partiel casserait l’autre plateforme. Si la release ou le manifeste n’arrive pas dans les dix minutes, il
échoue explicitement plutôt que de publier un installeur incapable de se mettre à jour.

## Outils

```bash
# Ajouter ou remplacer une plateforme dans un manifeste existant
node scripts/merge-tauri-latest-json.mjs \
  --manifest latest.json --version 0.6.11 --platform windows-x86_64 \
  --url https://github.com/geasshin/sylloge/releases/download/v0.6.11/Sylloge_0.6.11_x64-setup.exe \
  --signature-file Sylloge_0.6.11_x64-setup.exe.sig --output latest.json

# Vérifier ce que la release publie réellement
node scripts/merge-tauri-latest-json.mjs --check latest.json --version 0.6.11 \
  --require darwin-aarch64 --require darwin-x86_64 --require windows-x86_64
```

Le script refuse une signature vide ou trop courte, une URL non HTTPS, une URL qui ne pointe pas la version
annoncée, et le mélange de deux versions dans un même manifeste. Il complète `pub_date` s’il manque.
`scripts/create-tauri-latest-json.mjs` produit l’entrée macOS initiale et date le manifeste.

Contrôles : `npm run test:release` (sept cas, dont la séquence réelle des deux workflows et le refus d’un
manifeste sans `windows-x86_64`), `cargo test --lib updater` (trois cas, dont la distinction entre manifeste
absent et plateforme absente).

## Ce qui reste à éprouver

Le manifeste, les signatures et la fusion sont vérifiables sans Windows ; l’installation réelle d’un `.exe`
NSIS par-dessus une version antérieure ne l’est pas. À faire sur une machine Windows : installer une version
antérieure, attendre l’annonce, installer la nouvelle, vérifier que la base et les profils sont intacts.
