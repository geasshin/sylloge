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

Une seule release, `.github/workflows/release.yml`, déclenchée à la main uniquement
(`workflow_dispatch` ; depuis le 25 octobre 2026, plus aucune release sur push ; mode `build` pour construire sans publier).

| Job | Rôle |
| --- | --- |
| `prepare` | calcule la prochaine version depuis les tags, vérifie que le proxy TMDB/IGDB répond — une version livrée avec une recherche morte est pire qu’une version retardée |
| `macos` | construit l’archive universelle, produit `Sylloge.app.tar.gz` + `.sig` et le dmg, vérifie ses artefacts |
| `windows` | construit l’installeur NSIS, produit `Sylloge_x.y.z_x64-setup.exe` + `.sig`, vérifie ses artefacts |
| `publish` | attache les artefacts et **deux copies à nom fixe** (`Sylloge-macOS-universal.dmg`, `Sylloge-Windows-setup.exe`), assemble `latest.json` pour les trois cibles, l’envoie, **relit ce qui est publié**, vérifie les trois cibles et la présence des deux copies, puis ouvre la release |

Les deux copies à nom fixe servent le site de téléchargement : ses boutons visent
`releases/latest/download/<nom fixe>`, que GitHub redirige vers la dernière release publiée. Le site n’a donc
rien à mettre à jour à chaque version. Si l’une des copies manque, la release reste en brouillon et le
workflow échoue : mieux vaut une version retardée qu’un bouton de téléchargement mort. `scripts/verify.mjs`
refuse un `release.yml` qui ne les copie, ne les attache ou ne les vérifie plus.

Le manifeste est assemblé une seule fois, à partir des deux compilations, avant que la release ne quitte
l’état de brouillon : aucun client ne peut donc lire un manifeste incomplet. Un build Windows en échec
bloque la publication de la version — c’est le prix assumé pour qu’aucune release ne parte avec une
plateforme muette.

### Pourquoi pas deux workflows enchaînés

C’était le montage précédent : macOS sur push, Windows sur un push de tag `v*`. Or le tag est créé par
`gh release create` avec le jeton du workflow, et **cet événement ne déclenche aucun workflow**. Mesure au
23 octobre 2026 : les trois derniers lancements de « Release Windows » étaient tous des lancements manuels,
et le `latest.json` de `v0.6.10` ne publiait que `darwin-aarch64` et `darwin-x86_64` — alors que
`Sylloge_0.6.10_x64-setup.exe` et sa signature étaient bien dans la release. L’installeur existait, le
manifeste l’ignorait.

## Outils

```bash
# Déclarer darwin-x86_64 comme alias de l’archive universelle déjà présente
node scripts/merge-tauri-latest-json.mjs --manifest latest.json --version 0.6.11 \
  --alias darwin-aarch64:darwin-x86_64 --output latest.json

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

Contrôles : `npm run test:release` (huit cas, dont la séquence réelle du job `publish` — création, alias
macOS, ajout Windows, vérification des trois cibles — et le refus d’un manifeste sans `windows-x86_64`),
`cargo test --lib updater` (trois cas, dont la distinction entre manifeste absent et plateforme absente).

## Ce qui reste à éprouver

Le manifeste, les signatures et la fusion sont vérifiables sans Windows ; l’installation réelle d’un `.exe`
NSIS par-dessus une version antérieure ne l’est pas. À faire sur une machine Windows : installer une version
antérieure, attendre l’annonce, installer la nouvelle, vérifier que la base et les profils sont intacts.

Premier passage, contrôlé le 23 octobre 2026 (v0.6.11) : le job `publish` a réussi, `latest.json` publiquement
servi contient les trois entrées, leurs trois adresses répondent. Pour chaque release suivante, le job `publish` doit afficher `Manifeste valide : x.y.z pour darwin-aarch64, darwin-x86_64,
windows-x86_64`, et `releases/latest/download/latest.json` doit contenir les trois entrées.
