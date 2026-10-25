# Audit de sécurité et de performance — Sylloge

**Date** 25 octobre 2026  
**Branche** `security-perf`, commit `d8ca84c`  
**Périmètre** application desktop Tauri (frontend React/TypeScript, backend Rust, migrations SQLite, configuration Tauri, workflow de release). Le site `sylloge.vercel.app` et le proxy Vercel ne sont pas dans ce dépôt : ils ont été observés de l'extérieur, pas audités dans leur code.  
**Méthode** lecture des chemins d'attaque, scanners de dépendances, exécution des tests, mesures reproductibles, vérification des artefacts réellement publiés (DMG et EXE de la v0.6.16).

---

## 1. Verdict

Le code de l'application est globalement bien durci. Les protections essentielles sont réelles et vérifiées : CSP stricte, permissions Tauri limitées, imports ZIP bornés et sans traversée de chemin, sauvegardes relues avec contrôle du propriétaire et des liens symboliques, SQL paramétré, aucune clé d'API embarquée, mises à jour signées et vérifiées avant installation.

**La signature n'est pas un blocage : c'est une décision assumée.** Décision d'Aurélien du 25 octobre 2026 : l'application reste non notariée et non signée pour l'instant. Le rapport conserve les constats mesurés (Gatekeeper rejette le DMG, SmartScreen signale l'EXE, le site explique le contournement) comme conséquences documentées et propose des mesures de réduction du risque, sans en faire une tâche bloquante.

**Le rendu des grilles est corrigé** : chargement progressif de 200 cartes, 2 066 nœuds DOM au premier écran contre 70 550 et environ 5 secondes avant (voir 4.3).

**Les P1 sont corrigés, avec une réserve sur la clé de signature** : la sauvegarde automatique vérifie le réglage avant de sérialiser (4.4), une seule instance ouvre la base (4.6), la release exécute maintenant les tests et limite les permissions (4.7), l'écran d'erreur propose une restauration et l'ouverture du dossier (4.8), et les liens `http://` ne naviguent plus dans la fenêtre (4.9). La clé de signature updater reste toutefois dans les jobs de build : une dépendance compromise pendant `tauri build` pourrait encore la lire.

Le défaut d'intégrité Séries ↔ Animés est corrigé (4.5). Les P2 de sécurité réseau et de robustesse sont traités : lecture d'image plafonnée et redirections revalidées (4.10, DNS rebinding excepté), réponses fournisseurs plafonnées (4.11), barrière d'erreur React (4.12). **Il reste des P2 et des P3** : copie avant action destructive, chargement initial dédupliqué, client HTTP partagé, mémoïsation de l'accueil, `freezePrototype`, résolution DNS des images, puis WAL, profil release, licences et isolation du développement.

### Ce qui est solide

- **CSP** : politique complète en production, zéro violation mesurée sur le bundle construit.
- **Permissions Tauri** : pas d'accès générique au système de fichiers, pas de shell, pas de HTTP côté fenêtre, ouverture de liens limitée à `https://`.
- **Imports** : limites de taille, profondeur ZIP, nombre d'entrées, refus des liens symboliques et des chemins `..`, transactions SQLite.
- **Sauvegardes** : registre par profil, noms de fichiers vérifiés, contrôle des liens symboliques, contrôle d'identité du fichier avant et après lecture.
- **Secrets** : aucune clé dans le dépôt ni dans l'historique. Les clés TMDB et IGDB vivent dans l'environnement Vercel ; le binaire ne les contient pas.
- **Updater** : URL fixe, signature minisign vérifiée avant extraction, version revérifiée avant installation, transport non sécurisé interdit.
- **SQL** : valeurs toujours liées, identifiants de tables issus de constantes, pas de colonne contrôlée par l'utilisateur.
- **Tests** : 191 tests Rust, 449 tests Node via `npm run verify`, `cargo clippy -D warnings`, `cargo fmt --check` et `npm run build` verts.

---

## 2. Tableau des constats

Sévérités utilisées :

- **Décision** : choix assumé par le propriétaire, documenté, non planifié.
- **Corrigé** : corrigé dans la branche `security-perf`, à confirmer au build.
- **P1** : à corriger avant la prochaine release destinée à des personnes extérieures.
- **P2** : à planifier, risque réel mais conditionnel ou limité.
- **P3** : durcissement, hygiène, dette.

| # | Sévérité | Domaine | Constat | Preuve | Action |
|---|---|---|---|---|---|
| 1 | **Décision** | Distribution | macOS signé ad hoc, non notarié, rejeté par Gatekeeper ; Windows sans signature Authenticode ; le site demande de contourner les protections | `codesign`, `spctl`, `stapler`, analyse PE, texte du site | Décision d'Aurélien : ne pas signer pour l'instant ; protéger le compte GitHub et documenter le contournement |
| 2 | **Corrigé** | Distribution | Le site annonce macOS 10.13, le binaire exige macOS 11.0 ; `Info.plist` disait 10.13 | `vtool -show-build`, `PlistBuddy`, `tauri.conf.json` | `minimumSystemVersion` fixé à 11.0 ; reste la page de téléchargement, hors dépôt |
| 3 | **Corrigé** | Performance | Les grilles montaient toutes les fiches : 5 000 = ~5 s et 70 000 nœuds DOM | Mesure avant/après dans le harnais, 1 024 et 5 024 fiches | Chargement progressif de 200 cartes, hook et tests |
| 4 | **Corrigé** | Performance | Export complet de la bibliothèque à chaque écriture, même sans dossier de sauvegarde configuré et même si la copie du jour existe déjà | `main.tsx:2449`, `backupService.ts:101-104`, `portability.rs:2070` | `tryAutomaticSnapshotIfDue` vérifie le réglage et le jour avant tout chargement ; tests dédiés |
| 5 | **Corrigé** | Intégrité | Le déplacement Séries ↔ Animés se faisait en trois écritures non transactionnelles : insertion, mise à jour du lien, suppression | `mediaRepository.ts:711-741` (avant correction), `SeriesForm.tsx:165` | Champ Type retiré, `updateSeries` ne déplace plus, migration 0024 de normalisation |
| 6 | **Corrigé** | Intégrité | Aucune instance unique : deux processus peuvent ouvrir la même base SQLite | `lib.rs:17`, absence de `tauri-plugin-single-instance` | Plugin ajouté en premier, focus sur la fenêtre existante ; build et tests verts |
| 7 | **Partiel** | Chaîne de livraison | La release ne lançait ni tests, ni typecheck, ni audit ; `contents: write` pour tous les jobs ; actions épinglées par tag | `.github/workflows/release.yml:33` | Job `verify`, permissions réduites, actions par SHA ; la clé de signature reste dans les builds |
| 8 | **Corrigé** | Récupération | L'écran d'erreur de base ne propose que « Réessayer », sans restauration ni accès aux sauvegardes | `main.tsx:517-526` | Restauration existante et commande native `open_data_folder` ajoutées |
| 9 | **Corrigé** | Sécurité webview | Un lien `http://` d'une fiche personnalisée navigue dans la fenêtre de l'application, sans garde de navigation | `CustomLibraryScreen.tsx:75-80,570`, `externalLinks.ts:11-15` | Liens `https` seulement ; greffon `navigation` natif et tests |
| 10 | **P2** | Performance | Chargement initial des collections en double : `loadCurrentLibrary` puis cinq effets qui requêtent les mêmes tables | `main.tsx:2069-2290` | Dériver les collections de la bibliothèque déjà chargée |
| 11 | **P2** | Performance | Nouveau client `reqwest` à chaque recherche ou aperçu : pas de réutilisation de connexion TLS | `tmdb/mod.rs:93`, `igdb/mod.rs:246`, `openlibrary.rs:256` | Client partagé dans l'état Tauri |
| 12 | **P2** | Performance | L'accueil recalcule statistiques et favoris à chaque rendu, et reconstruit `allEntries` à chaque rendu parent | `AtriumHome.tsx:1051,1190-1194` | `useMemo` sur les agrégats et les entrées |
| 13 | **Partiel** | Sécurité réseau | `fetch_remote_image` lit tout le corps avant de vérifier la limite de 12 Mo ; les redirections ne sont pas revalidées ; le contrôle d'hôte ne résiste pas au DNS rebinding | `share_images.rs:23-72,104-107` | Lecture par morceaux, `Content-Length`, redirections revalidées ; DNS rebinding encore ouvert |
| 14 | **Corrigé** | Sécurité réseau | Les réponses TMDB, IGDB et Open Library sont désérialisées sans limite de taille | `tmdb/client.rs:237`, `igdb/mod.rs:185`, `openlibrary.rs:177` | `read_body_capped` à 8 Mo dans les trois clients |
| 15 | **Corrigé** | Robustesse | Aucune barrière d'erreur React : une exception de rendu laisse une fenêtre blanche | `main.tsx:3728` | `AppErrorBoundary` avec écran de secours et rechargement |
| 16 | **P2** | Intégrité | Les actions destructrices (remplacement d'import, suppression de profil ou de bibliothèque) n'écrivent pas de copie de sécurité avant l'action | Flux `Remplacer`, `ProfilesSettings.tsx:220-238` | Copie locale automatique avant l'écriture destructive |
| 17 | **Partiel** | Durcissement | `freezePrototype` désactivé ; aucune garde de navigation externe ; `devCsp` permissif en développement seulement | `tauri.conf.json`, schéma Tauri | Navigation native bloquée et testée ; `freezePrototype` reste à essayer |
| 18 | **P2** | Dépendances | 13 avis Rust subsistent, tous non atteignables ou limités à `extract()` sur archive signée ; 12 paquets npm ont une version plus récente | `cargo audit`, `npm outdated`, `cargo tree` | Mises à jour planifiées et Dependabot |
| 19 | **Corrigé** | Hygiène | Pas de CI de tests, pas de Dependabot, pas de `SECURITY.md`, `.gitignore` sans `.env*` ni fichiers de clés | Dépôt | Job `verify`, Dependabot, `SECURITY.md` et motifs de secrets ajoutés |
| 20 | **P3** | Base de données | Journal SQLite en mode `DELETE`, pas de WAL ; `busy_timeout` à 5 s ; deux pools distincts | `tauri-plugin-sql`, options sqlx | WAL + `busy_timeout` explicites, test à deux processus |
| 21 | **P3** | Build | Pas de profil `release` (LTO, strip), un seul chunk JS de 1,08 Mo, police TTF de 145 Ko | `Cargo.toml`, sortie Vite | Profil release, découpage, WOFF2 |
| 22 | **P3** | Conformité | Notices de licences tierces incomplètes (seul Phosphor est documenté) | `docs/licenses` | Générer les notices tierces |

---

## 3. Sécurité : ce qui est vérifié et solide

### 3.1 CSP de la fenêtre

Politique en production (`src-tauri/tauri.conf.json`) :

```text
default-src 'self'; script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https: http:;
font-src 'self' data:;
connect-src 'self' ipc: http://ipc.localhost;
object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'
```

La politique a été appliquée au bundle construit dans un serveur local avec l'en-tête exact, puis chargée dans un Chromium avec un écouteur `securitypolicyviolation` installé avant l'exécution des scripts. Résultat : **zéro violation**, feuille de style appliquée, aucune erreur de page, aucun débordement horizontal. L'erreur SQLite visible est attendue : le navigateur n'a pas le pont Tauri.

La construction native n'a pas été lancée pour cet audit. La politique est standard et Tauri injecte ses propres nonces et hachages, mais la preuve reste faite sur Chromium, pas sur WKWebView ou WebView2. C'est une limite à conserver, pas un feu vert définitif.

### 3.2 Permissions Tauri

`src-tauri/capabilities/default.json` accorde :

- `core:default`
- `core:window:allow-set-theme`
- `process:default`
- `opener:allow-open-url` limité à `https://*`
- `sql:allow-load`, `sql:allow-select`, `sql:allow-execute`

Il n'y a ni `fs`, ni `shell`, ni `http`, ni accès arbitraire au système. Les 62 commandes natives sont callables par la fenêtre, indépendamment de cette liste : elles ont donc été relues comme surface d'attaque à part entière.

### 3.3 Commandes natives et fichiers

Les points sensibles sont bien traités :

- Les imports ZIP utilisent `enclosed_name`, refusent `..`, les chemins absolus, les préfixes de volume Windows, les liens symboliques, les archives chiffrées, les entrées de plus de 4 Mio, plus de 512 entrées, plus de 4 niveaux d'imbrication et plus de 32 Mio décompressés.
- Les fichiers importés sont limités à 16 Mio, les snapshots à 64 Mio, les images de carte à 12 Mio.
- Les sauvegardes relues doivent être enregistrées pour le profil, porter un nom au format attendu et être des fichiers ordinaires, sans lien symbolique ; l'identité du fichier est contrôlée avant et après lecture.
- Les noms de fichiers d'export sont réduits à leur composant final.
- Les lectures de fichiers passent par des limites `take`, pas par une lecture intégrale non bornée.

### 3.4 SQL

Les valeurs sont liées par paramètres. Les identifiants de tables et de colonnes viennent de constantes (`CUSTOM_LIBRARIES`, `FILM_QUERY_COLUMNS`, etc.), jamais d'une chaîne reçue de la fenêtre. Les recherches `LIKE` échappent `\`, `%` et `_`. Les tris sont résolus par une liste fermée de colonnes.

Le plugin SQL expose `execute` à la fenêtre, ce qui est le choix d'architecture de l'application. Une XSS dans la fenêtre pourrait donc écrire ou supprimer des données SQLite. Ce risque est compensé par l'absence d'injection HTML (React échappe tout), une CSP sans `unsafe-eval` en production et aucun `innerHTML`. Il reste un risque résiduel à documenter, pas une faille ouverte.

Le plugin expose aussi `load`, qui accepte un chemin SQLite fourni par la fenêtre. `path_mapper` joint ce chemin au dossier de configuration, mais un chemin absolu ou `..` peut en sortir. Une compromission de la fenêtre pourrait donc ouvrir ou créer un autre fichier SQLite. Ce n'est pas un accès direct aux fichiers texte, mais c'est une capacité supplémentaire à garder consciente. Si le chargement peut être préconfiguré autrement, retirer `sql:allow-load` serait plus étroit ; sinon, valider le chemin côté plugin.

### 3.5 Secrets

Aucune clé n'est présente dans les fichiers suivis ni dans l'historique. Les anciens modules de secrets utilisaient le Trousseau macOS, et le générateur de clé écrivait dans `~/.sylloge-secrets`, jamais dans le dépôt. Les clés TMDB et IGDB sont côté Vercel. Le binaire ne contient donc pas de secret extractible.

À noter : les anciennes entrées de Trousseau créées par les versions précédentes peuvent subsister sur une machine. Elles ne sont plus lues par l'application. Si la clé TMDB correspondante n'a pas été révoquée lors du passage au proxy, il vaut mieux la révoquer et supprimer l'entrée.

### 3.6 Mises à jour

- Endpoint fixe : `https://github.com/geasshin/sylloge/releases/latest/download/latest.json`.
- Signature minisign vérifiée avant `install_inner`.
- La version est revérifiée entre la demande d'installation et l'installation.
- `dangerousInsecureTransportProtocol` est à `false`.
- Le manifeste publié contient bien les trois cibles (`darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`) avec des signatures.

C'est un point fort. Même si GitHub ou le dépôt de release est compromis, un update non signé par la clé du projet est refusé.

Limite résiduelle : la signature authentifie l'archive, pas le numéro de version. Une personne qui peut réécrire `latest.json` (compte GitHub compromis) peut rejouer une ancienne archive signée en la présentant comme la dernière version. La parade est de protéger le compte GitHub (2FA, clés matérielles, règles de protection), d'utiliser des releases immuables, ou de signer le manifeste lui-même. À défaut, cette limite doit être acceptée explicitement.

### 3.7 Réseau

Les appels partent de Rust, pas de la fenêtre. Les adresses des fournisseurs sont fixes. Les timeouts sont de 10 à 20 secondes. TLS est assuré par rustls. Les réponses TMDB sont validées en longueur et en schéma, les URL d'affiches doivent être `https`. Les recherches Open Library bornent la clé de travail et la longueur du synopsis. Les recherches IGDB retirent les guillemets et bornent les résultats.

Deux limites sont détaillées plus bas : `fetch_remote_image` bufferise tout avant de vérifier la taille et suit les redirections sans les revalider ; les réponses des fournisseurs ne sont pas plafonnées à la lecture.

---

## 4. Constats détaillés

### 4.1 Décision assumée — pas de signature Developer ID ni Authenticode

**Constat macOS.** Le DMG de la v0.6.16 a été téléchargé et monté. Résultats :

```text
Signature=adhoc
TeamIdentifier=not set
spctl -a -vv -t exec /Volumes/Sylloge/Sylloge.app
  /Volumes/Sylloge/Sylloge.app: rejected
stapler validate /Volumes/Sylloge/Sylloge.app
  Sylloge.app does not have a ticket stapled to it.
```

La signature ad hoc est « valide sur le disque » mais elle n'est pas reconnue par Gatekeeper. Sans Developer ID et sans notarisation, macOS refuse la première ouverture.

**Constat Windows.** L'installeur `Sylloge-Windows-setup.exe` a été téléchargé et analysé. Le répertoire de sécurité PE (index 4 du data directory) a une taille de 0 : aucune signature Authenticode. Le site le dit lui-même et demande de cliquer sur « Run anyway ».

**Constat site.** La page de téléchargement affiche, mot pour mot :

- macOS : « macOS blocks the first launch: the application is not notarized by Apple. » puis « System Settings → Privacy & Security → Open Anyway ».
- Windows : « The installer is unsigned: Windows displays Windows protected your PC. » puis « More info → Run anyway ».

**Décision.** Décision d'Aurélien du 25 octobre 2026 : ne pas signer pour l'instant. Ce constat reste documenté parce qu'il décrit ce que voient les personnes qui téléchargent, et parce qu'il fixe les mesures à prendre si la signature reste écartée. Ce n'est plus un blocage de l'audit.

Conséquences à garder en tête, sans en faire une tâche : une personne habituée à cliquer sur « Open Anyway » et « Run anyway » n'a plus de repère pour distinguer Sylloge d'un binaire malveillant ; et si le compte GitHub est compromis, un faux DMG peut être publié, alors que les mises à jour, elles, restent protégées par la signature minisign.

Mesures de réduction si la signature reste écartée :

- protéger le compte GitHub et l'organisation (2FA, clés matérielles, règles de protection de `main`, revue des workflows) ;
- publier les empreintes SHA-256 des DMG et EXE sur la page de téléchargement, pour détecter un fichier remplacé ;
- vérifier les artefacts en release même sans signature, pour détecter une corruption.

Si la décision change : Apple Developer Program à 99 USD par an pour un certificat Developer ID et la notarisation ; Authenticode via Azure Artifact Signing à 9,99 USD par mois pour 5 000 signatures, sous réserve d'éligibilité, ou un certificat OV. Vérifier ensuite avec `codesign`, `spctl`, `stapler` et `signtool`.

Le mécanisme d'update, lui, est déjà signé et vérifié. Le maillon faible est l'installation initiale.

### 4.2 Corrigé — macOS 10.13 annoncé, macOS 11.0 exigé

Le site annonce « macOS 10.13 or later ». Le `Info.plist` du bundle disait `LSMinimumSystemVersion = 10.13`, mais le binaire Mach-O contient `minos 11.0` pour les deux architectures :

```text
lipo -archs .../Sylloge
  x86_64 arm64
vtool -show-build .../Sylloge
  platform MACOS
  minos 11.0
  ...
  platform MACOS
  minos 11.0
```

C'est le `minos` du binaire qui décide, pas le `Info.plist`. Une personne sous macOS 10.13, 10.14 ou 10.15 téléchargeait donc une application qui ne peut pas démarrer, alors que la page affirmait le contraire.

**Corrigé dans cette branche et vérifié au build.** `src-tauri/tauri.conf.json` fixe désormais `bundle.macOS.minimumSystemVersion` à `11.0`. Un build debug (`npx tauri build --debug --bundles app`) produit un `Info.plist` à `LSMinimumSystemVersion = 11.0` et un binaire `minos 11.0` : les deux valeurs concordent. Le build s'arrête ensuite sur l'absence de clé privée d'updater, ce qui est attendu en local. La page de téléchargement (`sylloge-web`, hors dépôt) doit encore passer à « macOS 11 or later ». Un contrôle de release qui lit `vtool` et compare à la valeur annoncée reste recommandé pour éviter une nouvelle dérive.

### 4.3 Corrigé — Les grilles se chargent par paquets de 200

**Ce qui se passait.** Le rendu affichait tous les résultats d'une requête, sans fenêtrage ni pagination :

- Films : `src/main.tsx:717`
- Séries et animés : `src/main.tsx:1237`
- Jeux : `src/main.tsx:1470`
- Art : `src/main.tsx:1625`
- Livres et mangas : `src/main.tsx:1823`
- Bibliothèques personnalisées : `src/components/CustomLibraryScreen.tsx:424`

Mesures avant correction dans le harnais de recette (Chromium, SQLite en mémoire via sql.js, donc pas un benchmark natif, mais le rendu React et le DOM sont les vrais) :

| Fiches affichées | Première carte | Rendu complet | Nœuds DOM | Tas JS |
|---|---:|---:|---:|---:|
| 1 024 | 770 ms | 1 595 ms | 14 550 | 59 Mo |
| 5 024 | 4 248 ms | 5 082 ms | 70 550 | 87 à 106 Mo |

À 5 000 fiches, changer de bibliothèque ou vider une recherche prenait plusieurs secondes. Le coût était linéaire et devenait plus douloureux avec les années.

**Correctif appliqué.** Un hook unique, `src/components/useIncrementalList.ts`, rend 200 cartes au premier écran, puis 200 de plus quand un sentinel approche du bas (`rootMargin` de 800 px). Les listes de 200 fiches ou moins sont rendues d'un coup, sans observateur. La profondeur est mémorisée par vue et par recherche, ce qui permet de retrouver la même position au retour d'une fiche. Le comptage est une fonction pure testée (`src/domain/incrementalList.ts`), et les affiches passent en `loading="lazy"`. Le mécanisme est branché sur les six grilles et sur les bibliothèques personnalisées.

**Mesures après correction, à 5 000 résultats :** 200 cartes montées et 2 066 nœuds DOM au premier écran, contre 70 550 nœuds et environ 5 secondes avant. Dans le harnais, la recherche à chaud prend encore environ 1,9 seconde, dominée par la requête sql.js et le mapping des 5 000 lignes ; la base native mesure 22 ms sur 20 000 films. Le chargement suivant passe à 400, puis 500 cartes ; le retour depuis une fiche restaure 500 cartes et la position de défilement.

**Limite.** Si une personne fait défiler les 5 000 fiches jusqu'au bout, le DOM finit par grossir à nouveau. Seule une virtualisation vraie garde un DOM borné en permanence. Pour des bibliothèques de 5 000 qui restent rares, le chargement progressif est le compromis retenu : aucun bouton, aucun changement visible sur les petites listes.

### 4.4 Corrigé — La sauvegarde automatique vérifie le réglage avant de sérialiser

`requestAutomaticBackup` est appelé après presque chaque écriture. Il construisait auparavant le document complet (rechargement des huit collections, sérialisation JSON, IPC) avant que Rust ne découvre qu'aucun dossier n'était configuré ou que la copie du jour existait déjà.

**Correctif.** `BackupService.tryAutomaticSnapshotIfDue` lit d'abord `getBackupSettings` et s'arrête sans charger la bibliothèque si le dossier est absent, indisponible, ou si `lastAutomaticSnapshotDay` est déjà aujourd'hui. L'expérience du profil n'est chargée qu'après ce contrôle, par un chargeur paresseux. Le garde-fou Rust reste en place pour la course entre deux écritures.

**Preuves.** Quatre tests ajoutés dans `scripts/backup-service.test.mjs` : sans dossier, dossier indisponible et copie du jour ne déclenchent ni chargement ni écriture ; une copie due charge l'expérience puis écrit. `npm run verify` passe 449 tests. La sauvegarde manuelle garde son chemin complet.

**Limite.** Deux écritures simultanées peuvent encore préparer le document toutes les deux ; la seconde reçoit `AlreadySaved` de Rust. Le coût est alors celui d'une course rare, pas celui de chaque enregistrement.

### 4.5 Corrigé — Le déplacement Séries ↔ Animés n'existe plus

**Ce qui se passait.** `updateSeries` déplaçait une fiche d'une table à l'autre avec trois écritures séparées : `INSERT` dans la table cible, `UPDATE media_provider_links`, `DELETE` de la source. Un arrêt entre l'INSERT et le DELETE laissait la fiche dans les deux tables, avec un lien fournisseur déplacé et une édition qui ne touchait qu'une copie.

**Décision et correctif.** Décision d'Aurélien du 25 octobre 2026 : la bibliothèque Séries n'a plus de catégorie, et une fiche ne change plus de bibliothèque depuis le formulaire. Le champ Type a été retiré de `SeriesForm.tsx` ; `updateSeries` ne fait plus qu'un `UPDATE` dans la table de la bibliothèque courante ; la migration `0024_series_single_library.sql` remet à `série télé` toute fiche `series` encore marquée `animation`. Le chemin à trois écritures est supprimé, donc le risque de doublon disparaît à la source, sans transaction à ajouter.

**Preuves.** Le formulaire d'édition ne contient plus le champ Type (vérifié dans le harnais), `npm run verify` passe 449 tests, `cargo test` passe 191 tests dont `series_single_library_migration_normalizes_animation_rows`, et typecheck, build, clippy et fmt sont verts.

**Limite.** La colonne `category` reste un marqueur interne à une seule valeur (`série télé`) : elle n'est plus exposée ni modifiable, mais sa suppression physique demanderait une reconstruction de table et une version du document de portabilité. C'est un lot séparé, sans effet sur le risque actuel.

### 4.6 Corrigé — Une seule instance ouvre la base

`tauri-plugin-single-instance` est maintenant déclaré dans `Cargo.toml` et enregistré en premier dans `lib.rs`, avant les greffons SQL et de migration. Une deuxième ouverture appelle la fenêtre existante (`unminimize`, `show`, `set_focus`) et quitte le nouveau processus avant qu'il n'ouvre SQLite.

**Preuves.** `cargo check`, `cargo clippy -D warnings`, `cargo test` (191 tests) et le build passent avec le greffon. Le comportement de double lancement n'a pas été scénarisé dans un runner graphique ; c'est la limite de cette vérification.

### 4.7 Corrigé, avec une réserve — La release vérifie le code et limite les droits

Le workflow `release.yml` ne lançait aucun contrôle de code et donnait `contents: write` à tous les jobs, avec des actions épinglées par tag.

**Correctifs appliqués.**

- Un job `verify` sur macOS exécute `npm ci`, `npm run typecheck`, `npm run verify`, `npm run build`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` et `cargo test`. Les deux builds en dépendent ; une régression ne part plus en release.
- `npm audit --omit=dev --audit-level=high` bloque sur une vulnérabilité de production. `cargo audit` est exécuté en informatif : les 13 avis restants sont documentés comme non atteignables, et un audit bloquant empêcherait toute release sans apporter de correctif.
- `permissions: contents: read` au niveau global ; `contents: write` uniquement sur `publish`.
- Toutes les actions du workflow sont épinglées par SHA de commit, pas par tag.

**Réserve.** `TAURI_SIGNING_PRIVATE_KEY` reste dans les deux jobs de build, sur l'étape de construction. Une dépendance compromise exécutée pendant `tauri build` pourrait encore lire la clé et signer une fausse mise à jour. La sortir demanderait une signature dans un job séparé, sans exécuter de dépendances, ou un service de signature. Ce n'est pas fait ici.

### 4.8 Corrigé — L'écran d'erreur propose une récupération

`ErrorState` n'affichait qu'un bouton « Réessayer ». Il propose maintenant :

- « Réessayer », inchangé ;
- « Restaurer une sauvegarde », qui ouvre le parcours de restauration existant quand un profil est connu ;
- « Ouvrir le dossier des données », via la nouvelle commande native `open_data_folder` (Finder sur macOS, Explorateur sur Windows).

**Preuves.** `cargo check`, `npm run typecheck`, `npm run verify` et le build passent. La restauration reste une écriture SQLite : si la base est réellement inaccessible, elle échouera avec son message ; l'ouverture du dossier, elle, fonctionne sans base.

### 4.9 Corrigé — Les liens http ne naviguent plus dans la fenêtre

`CustomLibraryScreen` n'affiche plus comme lien qu'une source `https://` (`isHttpsSource`) ; une adresse `http://` reste du texte. Côté natif, un greffon `navigation` refuse toute navigation hors des protocoles de l'application (`tauri`, `asset`, `ipc`, `http(s)://tauri.localhost`) et, en debug seulement, du serveur Vite local. Un lien externe qui échapperait à l'interception du frontend est bloqué au lieu de remplacer l'interface.

**Preuves.** Trois tests Rust couvrent les protocoles acceptés, les adresses externes refusées et le serveur de développement limité aux builds debug. `cargo test` passe 191 tests.

### 4.10 Corrigé, avec une limite — `fetch_remote_image` lit et redirige sous contrôle

La commande vérifiait la taille après `.bytes()`, suivait les redirections sans les revalider et ne vérifiait que la chaîne de l'hôte.

**Correctif.** `Content-Length` est refusé au-delà de 12 Mo, puis le corps est lu par `response.chunk()` avec un plafond cumulé ; une réponse vide est refusée. La politique de redirection revalide chaque saut avec `validate_image_url` et s'arrête après cinq redirections ou dès qu'une destination est locale ou non web.

**Limite.** Le DNS rebinding n'est pas traité : un nom public qui résout vers `127.0.0.1` passe encore le contrôle de chaîne. Il faudrait résoudre l'hôte et vérifier l'adresse avant la connexion, ce qui n'est pas fait dans ce lot.

### 4.11 Corrigé — Les réponses des fournisseurs sont plafonnées

`tmdb/client.rs`, `igdb/mod.rs` et `openlibrary.rs` utilisaient `.json::<T>()`, qui lit tout le corps. Ils passent maintenant par `http::read_body_capped`, qui refuse `Content-Length` au-delà de 8 Mo et plafonne aussi la lecture par morceaux, avant `serde_json::from_slice`.

**Preuves.** `cargo check`, `cargo clippy -D warnings` et `cargo test` (191 tests) passent. Aucun test réseau n'a été ajouté : la limite est dans le chemin commun des trois clients.

### 4.12 Corrigé — Une barrière d'erreur React

`AppErrorBoundary` enveloppe la racine. Une exception de rendu affiche un écran de secours avec « Recharger l'application » au lieu d'une fenêtre blanche ; l'erreur et la pile de composants sont journalisées, sans donnée de bibliothèque. Les données restent dans SQLite.

**Preuves.** `npm run typecheck`, `npm run verify` (449 tests), `npm run build` et `cargo test` (191 tests) passent.

### 4.13 P2 — Pas de copie avant une action destructive

Le remplacement d'une bibliothèque, la suppression d'un profil ou la suppression d'une bibliothèque personnalisée sont confirmés explicitement, mais aucune copie de sécurité n'est écrite avant l'action. La sauvegarde automatique est déclenchée après l'écriture et capture donc le nouvel état, pas l'ancien. Une confirmation mal comprise reste irréversible.

**Correctif.** Avant ces actions, écrire un snapshot local dans le dossier de données de l'application, même si aucun dossier de sauvegarde n'est configuré. Le mentionner dans la confirmation et permettre de le restaurer depuis l'écran d'erreur ou les réglages.

### 4.14 Partiel — Durcissement Tauri

- `app.security.freezePrototype` n'est pas activé. Le schéma Tauri 2 installé ne l'expose pas directement : le blocage de la pollution de prototype reste à traiter côté webview ou à vérifier sur la version cible.
- La garde `on_navigation` est maintenant en place (voir 4.9) : seuls les protocoles de l'application et le serveur Vite de debug passent.
- `assetProtocol` est désactivé, `dangerousDisableAssetCspModification` est absent, `withGlobalTauri` est à sa valeur par défaut : ces points sont corrects.
- `process:default` permet `exit` et `restart`. C'est nécessaire à l'updater, mais c'est une capacité à garder consciente.

### 4.15 Dépendances

`npm audit` : **0 vulnérabilité**, en production comme en développement.

`cargo audit` avant correction : **20 vulnérabilités**, 14 avertissements. Après mise à jour de rustls, rustls-webpki, tokio, webpki-roots et webpki-root-certs : **13 vulnérabilités**, 13 avertissements. Les cinq mises à jour appliquées :

```text
rustls            0.23.42 -> 0.23.46
rustls-webpki     0.103.13 -> 0.103.16
tokio             1.53.0  -> 1.54.1
webpki-roots      1.0.9   -> 1.0.11
webpki-root-certs 1.0.8   -> 1.0.11
```

Les 13 avis restants :

| Crate | Avis | Atteignable dans le binaire ? |
|---|---|---|
| quinn-proto 0.11.16 | 5 avis (DATAGRAM, STREAM, ACK, mémoire) | Non : `cargo tree -i quinn-proto` ne trouve rien sur macOS ni Windows |
| rkyv 0.7.46 | validation d'archive | Non : absent de l'arbre compilé |
| rsa 0.9.10 | Marvin Attack | Non : absent de l'arbre compilé (sqlx-mysql non activé) |
| zip 2.4.2 | 3 avis sur `extract()` | Non : le code lit les entrées avec `by_index` et `take`, n'appelle jamais `extract()` |
| zip 4.6.1 | 3 avis sur `extract()` | Uniquement dans l'updater Windows, après vérification de la signature minisign |

Les avis `zip` ne sont donc pas exploitables par un attaquant sans la clé de signature du projet. Les avis `quinn`, `rkyv` et `rsa` sont des entrées de lockfile non compilées ; ils ne doivent pas être comptés comme des risques du binaire. Ils restent une dette de mise à jour.

`npm outdated` signale 12 paquets avec une version plus récente, notamment `@tauri-apps/api` 2.11.1 → 2.12.4, `@tauri-apps/cli` 2.11.4 → 2.12.4, `@tauri-apps/plugin-updater` 2.10.1 → 2.14.0, `@tauri-apps/plugin-sql` 2.4.0 → 2.6.0, `react` 19.2.7 → 19.3.1. Ces montées ne sont pas des correctifs de sécurité identifiés ; elles doivent être testées, pas appliquées en masse.

`tauri` 2.11.5 est installé ; la dernière 2.x est 2.12.5. `tauri-plugin-updater` 2.10.1 dépend de `zip ^4`, donc le passage à 2.14.0 ne suffit pas à lui seul à sortir de l'avis zip. Une montée de Tauri 2.12 est à planifier avec les tests de release.

---

## 5. Intégrité et durabilité des données

### 5.1 Ce qui est déjà solide

- Copie `VACUUM INTO` avant chaque migration en attente, trois copies conservées.
- Migrations SQLx transactionnelles, tests sur les schémas 0020, 0021, 0023.
- Imports et déplacements de livres transactionnels côté Rust, avec tests de rollback sur échec tardif.
- Suppression de profil transactionnelle, nettoyage des citations, des liens fournisseurs et des bibliothèques personnalisées.
- Registre de sauvegardes par profil, noms vérifiés, contrôle des liens symboliques.
- Restauration d'un document plus récent refusée avec un message clair.

### 5.2 Points à corriger

- **Déplacement Séries ↔ Animés** : corrigé, voir 4.5.
- **Instance unique** : voir 4.6.
- **Copie avant action destructive** : voir 4.13.
- **Récupération après erreur de base** : voir 4.8.

### 5.3 Journal SQLite et concurrence

Le plugin SQL ouvre la base avec les options par défaut de sqlx : pas de `journal_mode` imposé, donc le mode par défaut de SQLite (`DELETE`) pour une base créée par l'application, et un `busy_timeout` de 5 secondes. Les commandes Rust ouvrent leurs propres pools, souvent avec `max_connections(1)`. Pour un usage à un seul processus, cela fonctionne. Pour deux instances, ou pour une lecture pendant un import long, les verrous peuvent se faire sentir.

**Recommandation.** Passer la base en WAL au premier démarrage (une fois, hors transaction), fixer un `busy_timeout` explicite et tester deux processus. Le WAL améliore la lecture concurrente et la résistance à une fermeture brutale. Il ne remplace pas l'instance unique.

### 5.4 Windows et dossier de données

Le plugin SQL stocke `sylloge.db` dans `app_config_dir`. Sous Windows, Tauri le place dans `%APPDATA%` (Roaming). Un profil d'entreprise avec redirection ou synchronisation de `Roaming` peut déplacer ou verrouiller une base SQLite, ce qui est déconseillé. Le cas est rare chez un particulier, mais il faut le vérifier sur une vraie machine Windows avant diffusion large. Si le sujet se confirme, prévoir une migration vers `%LOCALAPPDATA%` avec reprise de la base existante, pas un simple changement de chemin.

### 5.5 Compatibilité descendante

Les migrations sont uniquement montantes. Une version plus ancienne qui ouvrirait une base plus récente lirait des colonnes qu'elle ne connaît pas et pourrait échouer sur un statut inconnu. L'updater n'installe que des versions plus récentes, donc le cas normal est couvert. Une réinstallation manuelle d'une ancienne version reste possible : l'écran d'erreur doit alors proposer une restauration, pas seulement « Réessayer ».

---

## 6. Performance

### 6.1 Bundle et démarrage

Sortie de `npm run build` :

```text
dist/assets/index-BPIB29WA.js   1 084,85 kB (gzip 292,88 kB)
dist/assets/index-D9qXXSm8.css    172,89 kB (gzip  26,46 kB)
dist/assets/Syne-Variable...ttf   145,26 kB
dist total                        1,4 Mo
```

Le bundle JavaScript est un seul chunk de 1,08 Mo. Le chargement initial mesuré sur le serveur local est rapide : `DOMContentLoaded` à 39 ms, `load` à 40 ms. Ce n'est pas un problème en soi pour une application de bureau, mais le chunk unique empêche de différer les écrans rarement utilisés et le build affiche un avertissement au-delà de 500 Ko.

La police Syne est livrée en TTF de 145 Ko. Un WOFF2 ferait gagner environ 100 Ko et accélérerait légèrement le premier rendu. Les deux points sont du polish, pas des blocages.

### 6.2 Chargement initial en double

Le premier effet charge `filmsRepository.loadCurrentLibrary()`, qui lit déjà les huit collections : films, séries, animés, livres, mangas, jeux, arts et bibliothèques personnalisées. Cinq effets séparés relisent ensuite séries et animés, livres et mangas, jeux, arts et bibliothèques personnalisées pour alimenter leurs collections locales. Au démarrage, les mêmes tables sont donc lues deux fois.

À 20 000 films, une lecture complète pèse environ 22 ms côté SQLite natif, sans compter l'IPC et le mapping JavaScript. Le doublement n'est pas dramatique, mais il est gratuit à corriger : dériver les collections de la bibliothèque déjà chargée, et ne relire que la collection concernée après une écriture.

### 6.3 Base de données

Banc d'essai sur une base créée avec les vraies migrations, 20 000 films, requêtes reproduites depuis `filmsRepository` :

| Opération | Temps moyen | Lignes |
|---|---:|---:|
| Chargement complet du profil | 21,7 ms | 20 000 |
| Tri par titre | 41,5 ms | 20 000 |
| Tri par note | 42,8 ms | 20 000 |
| Recherche `LIKE` sur titre, titre original, réalisateur | 5,8 ms | 1 942 |
| Filtre statut + favori | 2,9 ms | 544 |
| Comptage | 0,26 ms | 1 |

Les plans montrent un `SEARCH ... USING INDEX films_profile_id_idx` puis un `USE TEMP B-TREE FOR ORDER BY`. Il n'y a pas d'index sur `(profile_id, title)`, `(profile_id, status)` ou `(profile_id, updated_at)`. À l'échelle d'une bibliothèque personnelle, les temps restent bons. Si les bibliothèques grossissent, un index composite sur `(profile_id, status, updated_at)` et un index sur `(profile_id, title COLLATE NOCASE)` supprimeraient les tris temporaires, au prix d'écritures un peu plus lentes.

Le Document JSON équivalent à 20 000 films pèse 14,83 Mo et sa sérialisation Python prend 58 ms. C'est la mesure qui donne l'ordre de grandeur du gaspillage de la sauvegarde automatique (voir 4.4).

### 6.4 Rendu des grilles

Voir 4.3. Le premier écran ne monte plus que 200 cartes (2 066 nœuds) au lieu de la collection entière (70 550 nœuds à 5 000 fiches), puis charge 200 cartes à l'approche du bas. Le coût restant dans le harnais vient de la requête sql.js et du mapping des 5 000 lignes (environ 1,9 seconde), pas du DOM ; la base native mesure 22 ms sur 20 000 films. Si une personne défile jusqu'au bout, le DOM grandit à nouveau : seule une virtualisation vraie le bornerait en permanence.

### 6.5 Accueil

`AtriumHome` construit `allEntries` à chaque rendu du composant `Home` (`AtriumHome.tsx:1051`) et le passe à `HomeDashboard`. Chaque rendu du parent produit donc un nouveau tableau, ce qui invalide le `useMemo` de `entries`. Dans `HomeDashboard`, `stats`, `favorites`, `inProgress` et `queue` sont recalculés à chaque rendu du tableau de bord (`:1190-1194`), par exemple au changement d'onglet. Le carrousel a son propre minuteur de 8 secondes (`FEATURED_DELAY = 8000`), mais il ne re-rend que `FeaturedCarousel`, pas tout `HomeDashboard`.

À 5 000 entrées, chaque rendu du tableau de bord refait des filtres et des tris sur toute la collection. Ce n'est pas visible aujourd'hui sur une petite bibliothèque, mais cela grandit mal.

**Correctif.** Mémoïser `entries`, `stats`, `favorites`, `inProgress` et `queue` sur `allEntries` et l'onglet courant, et stabiliser `allEntries` avec un `useMemo` dans le composant qui le construit.

### 6.6 Clients HTTP recréés

Chaque commande de recherche ou d'aperçu crée un nouveau `reqwest::Client` :

- `src-tauri/src/tmdb/mod.rs:93` et les commandes suivantes ;
- `src-tauri/src/igdb/mod.rs:246` ;
- `src-tauri/src/openlibrary.rs:256`.

Un client neuf signifie un nouveau pool de connexions et une nouvelle poignée de main TLS pour chaque recherche. Sur une connexion à 50 ms de latence, cela ajoute facilement 100 à 200 ms à chaque requête, alors que les recherches sont déjà débouncées à 140 ms. Le cache de bord Vercel masque une partie du coût TMDB, pas la poignée de main.

**Correctif.** Un client partagé, créé une fois et stocké dans l'état Tauri, avec les mêmes timeouts. Les commandes n'ont plus qu'à l'emprunter. Cela réduit la latence et la charge réseau sans changer le comportement.

### 6.7 Autres points

- Pas de profil `release` dans `Cargo.toml` : pas de LTO, pas de `strip`. Le binaire est plus gros et le démarrage peut être légèrement plus lent. Ajouter `lto = true`, `codegen-units = 1`, `strip = true` et mesurer le temps de build avant de garder.
- Le CSS de 173 Ko est correct pour l'application, mais il contient probablement des règles de tous les écrans. Un découpage par écran n'est utile que si le bundle JS l'est aussi.
- Les images de cartes sont chargées depuis les CDN distants. À 5 000 cartes, 5 000 requêtes d'images partent en même temps. La virtualisation réglera aussi ce point.

---

## 7. Chaîne de distribution et supply chain

### 7.1 Signature et notarisation

Voir 4.1. Décision assumée : la signature n'est pas planifiée. Les conséquences et les mesures de réduction restent documentées.

### 7.2 Workflow de release

Points corrects :

- Un seul workflow, lancement manuel uniquement.
- Build macOS et Windows en parallèle, job `publish` qui assemble `latest.json` et vérifie les trois cibles.
- Refus de réécrire une release déjà publiée.
- Vérification du proxy avant publication.
- Artefacts à nom fixe pour le site.

Points à corriger :

- Pas de tests, typecheck ni audit avant publication.
- `permissions: contents: write` global.
- Actions épinglées par tag, pas par SHA.
- Clé de signature exposée aux deux jobs de build.
- Pas de vérification `codesign`/`spctl`/`signtool` des artefacts finaux.
- Pas de contrôle que le `minos` du binaire correspond au minimum annoncé.

### 7.3 Dépendances et automatisation

- Pas de Dependabot ni de Renovate.
- Pas de CI sur les pull requests.
- Pas de `SECURITY.md`.
- `.gitignore` ne couvre pas `.env`, `.env.*`, `*.pem`, `*.p12`, `*.key`. Le dépôt est public ; un fichier de secret ajouté par erreur au mauvais endroit serait suivi. Ajouter ces motifs est immédiat.
- Les paquets de build (`vite`, `typescript`, `@vitejs/plugin-react`) sont dans `dependencies` et non `devDependencies`. Ils ne sont pas embarqués dans le bundle, mais cela élargit inutilement une installation de production.

### 7.4 Site et proxy

Le site et le proxy ne sont pas dans ce dépôt. Observations extérieures :

- `/api/health` répond 200 avec `tmdb: true`, `igdb: true`, `rateLimit: {tmdb: 120, igdb: 60}`.
- En-têtes HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` corrects.
- Une recherche TMDB est servie depuis le cache de bord (`x-vercel-cache: HIT`).
- Le manifeste `latest.json` de la v0.6.16 contient les trois plateformes et des signatures.

Le code du proxy, la gestion des clés Vercel, la limitation de débit réelle et la protection contre l'abus de quota n'ont pas été audités ici. C'est une limite explicite. Le proxy reste un point de confiance : s'il est compromis, il peut servir des métadonnées arbitraires, mais pas exécuter du code dans l'application.

---

## 8. Vérifications exécutées

| Commande | Résultat |
|---|---|
| `npm ci` | OK, 38 paquets |
| `npm run typecheck` | OK |
| `npm run verify` | OK, 449 tests |
| `npm run build` | OK, avertissement chunk > 500 Ko |
| `cargo fmt --check` | OK |
| `cargo clippy --all-targets -- -D warnings` | OK |
| `cargo test` | 191 tests réussis, 0 échec |
| `npm audit` | 0 vulnérabilité |
| `cargo audit` avant | 20 vulnérabilités, 14 avertissements |
| `cargo audit` après | 13 vulnérabilités, 13 avertissements |
| `cargo tree -i` sur quinn-proto, rkyv, rsa | Absents de l'arbre compilé macOS et Windows |
| CSP sur bundle construit | 0 violation, styles appliqués |
| `codesign -dv` sur le DMG v0.6.16 | `Signature=adhoc`, `TeamIdentifier=not set` |
| `spctl -a -vv -t exec` | **rejected** |
| `stapler validate` | Aucun ticket de notarisation |
| Analyse PE de l'EXE Windows | Répertoire Authenticode vide, non signé |
| `vtool -show-build` | `minos 11.0` pour les deux architectures |
| `lipo -archs` | `x86_64 arm64` |
| `latest.json` | v0.6.16, 3 cibles, signatures présentes |
| Banc SQLite 20 000 films | Voir 6.3 |
| Harnais de rendu 1 024 / 5 024 fiches | Voir 4.3 |

Les commandes ont été exécutées dans la worktree `security-perf`. Aucune donnée personnelle n'a été ouverte, copiée ou modifiée. Les fichiers téléchargés pour vérifier les signatures ont été supprimés après usage.

---

## 9. Limites de l'audit

- **Pas de lancement natif macOS ou Windows** dans cet audit. La CSP a été vérifiée sur le bundle dans Chromium, pas dans WKWebView ou WebView2. La différence est réelle : WebKit et Chromium n'appliquent pas tous les détails de la même façon.
- **Pas de machine Windows** disponible. La signature de l'EXE a été vérifiée par analyse PE, pas par SmartScreen.
- **Pas de machine macOS 10.13 à 11.0** pour constater le refus de démarrage. La conclusion vient du `minos` Mach-O, qui est la valeur qui fait foi.
- **Le site et le proxy ne sont pas dans le dépôt.** Leur code, leur configuration Vercel et leur limitation de débit réelle n'ont pas été audités.
- **Le harnais de recette utilise sql.js**, une SQLite en WebAssembly. Les temps de rendu sont représentatifs du DOM et de React, pas du moteur natif. Les temps SQL du banc d'essai viennent de sqlite3 natif sur la machine d'audit.
- **Pas de test d'intrusion, pas de fuzzing, pas de revue ligne par ligne des 62 000 lignes.** L'audit a ciblé les chemins d'attaque, les surfaces réseau, les écritures de fichiers, les transactions et les points de performance connus.
- **Pas de SBOM ni d'attestation de provenance.** Les dépendances ont été auditées par version, pas par reproductibilité de build.

---

## 10. Plan d'action

### Décision assumée (pas de P0)

1. **Signature** : décision d'Aurélien, non planifiée. Si elle reste écartée : protéger le compte GitHub et les secrets, publier les empreintes SHA-256 des fichiers, vérifier les artefacts en release. Si elle revient : Developer ID + notarisation, Authenticode.

### Avant la prochaine release (P1)

Les cinq P1 sont corrigés. La seule réserve est la clé de signature : elle reste dans les jobs de build, sur l'étape `tauri build`. Une dépendance compromise pendant cette étape pourrait la lire.

**Déjà corrigé (second lot)** : `tryAutomaticSnapshotIfDue` vérifie le réglage et le jour avant de charger la bibliothèque ; `tauri-plugin-single-instance` ramène la fenêtre existante ; la release exécute `typecheck`, `verify`, `build`, `fmt`, `clippy` et `cargo test`, avec `contents: read` par défaut et `contents: write` sur `publish`, actions épinglées par SHA ; l'écran d'erreur propose la restauration et l'ouverture du dossier des données ; les liens `http://` sont du texte et une garde `on_navigation` bloque les navigations externes.

**Déjà corrigé (premier lot)** : `minimumSystemVersion` à 11.0 dans `tauri.conf.json` (reste la page de téléchargement, hors dépôt) ; champ Type retiré, déplacement Séries ↔ Animés supprimé et migration 0024 de normalisation ; chargement progressif de 200 cartes sur les six grilles et les bibliothèques personnalisées.

### Ensuite (P2)

1. Isoler la clé de signature updater dans un job qui n'exécute pas de dépendances, ou adopter un service de signature.
2. Copie de sécurité avant action destructive.
3. Dédupliquer le chargement initial des collections.
4. Client HTTP partagé.
5. Mémoïser l'accueil.
6. `freezePrototype`.
7. Résolution DNS vérifiée pour `fetch_remote_image` (DNS rebinding).

### Plus tard (P3)

1. WAL et `busy_timeout` explicites.
2. Profil `release`, WOFF2, découpage du bundle.
3. Notices de licences tierces.
4. Isolation du développement (`tauri:dev` avec identifiant distinct).
5. Vérification du dossier de données sous Windows Roaming.

---

## 11. Annexe — Détail des avis Rust restants

| Avis | Crate | Version | Pourquoi il n'est pas atteignable |
|---|---|---|---|
| RUSTSEC-2026-0342, 0339, 0338, 0340, 0341 | quinn-proto | 0.11.16 | `cargo tree -i quinn-proto` ne trouve rien sur macOS ni Windows ; QUIC/HTTP3 n'est pas dans le graphe compilé |
| RUSTSEC-2026-0235 | rkyv | 0.7.46 | Absent de l'arbre compilé ; dépendance optionnelle de `rust_decimal` non activée |
| RUSTSEC-2023-0071 | rsa | 0.9.10 | Absent de l'arbre compilé ; `sqlx-mysql` n'est pas activé |
| RUSTSEC-2026-0367, 0368, 0369 | zip | 2.4.2 | Le code lit les entrées avec `by_index` et `take`, n'appelle jamais `extract()` |
| RUSTSEC-2026-0367, 0368, 0369 | zip | 4.6.1 | Utilisé par l'updater Windows après vérification de la signature minisign |

Les avertissements restants sont des crates non maintenues (`unic-*`, `zbus`, `zvariant`, `proc-macro-error`, `rustls-pemfile`) ou une unsoundness de `event-listener` via sqlx, sans chemin contrôlé par un attaquant dans cette application. `glib` est Linux uniquement et n'est pas embarqué dans les cibles macOS ou Windows.

---

## 12. Fichiers modifiés par cet audit

- `src-tauri/Cargo.lock` : mise à jour de rustls, rustls-webpki, tokio, webpki-roots et webpki-root-certs. Aucun changement de code.
- `src-tauri/tauri.conf.json` : `bundle.macOS.minimumSystemVersion` fixé à `11.0`, pour aligner le manifeste sur le `minos` réel du binaire.
- `src/components/SeriesForm.tsx` : retrait du champ Type ; une série ne change plus de bibliothèque depuis le formulaire.
- `src/data/mediaRepository.ts` : `updateSeries` ne fait plus de déplacement inter-tables ; la catégorie interne est forcée par la bibliothèque.
- `src/main.tsx` : l'édition et la création utilisent la bibliothèque du contexte, sans dépendre d'une catégorie modifiable.
- `src-tauri/migrations/0024_series_single_library.sql` : normalise en `série télé` les fiches `series` encore marquées `animation`.
- `src-tauri/src/database.rs` : migration 24 enregistrée, test `series_single_library_migration_normalizes_animation_rows`.
- `src-tauri/src/migration_backup.rs` : version attendue portée à 24.
- `scripts/verify.mjs` : contrôles mis à jour (absence du champ Type, absence du déplacement).
- `src/domain/incrementalList.ts` : comptage pur des paquets de 200, testé.
- `src/components/useIncrementalList.ts` : hook sentinel, mémoire de profondeur par vue, repli sans IntersectionObserver.
- `src/main.tsx` : les six grilles utilisent le hook et un sentinel après la grille.
- `src/components/CustomLibraryScreen.tsx` : même chargement progressif pour les bibliothèques personnalisées.
- `src/components/Poster.tsx` : affiches en `loading="lazy"` et `decoding="async"`.
- `src/styles.css` : style du sentinel.
- `scripts/incremental-list.test.mjs` et `package.json` : quatre tests et script `test:incremental` intégré à `verify`.
- `src/data/backupService.ts` : `tryAutomaticSnapshotIfDue` contrôle le dossier et le jour avant tout chargement ; `scripts/backup-service.test.mjs` couvre les cas sans dossier, dossier indisponible, copie déjà faite et copie due.
- `src-tauri/Cargo.toml` et `src-tauri/src/lib.rs` : `tauri-plugin-single-instance`, garde de navigation et commande `open_data_folder`.
- `src-tauri/src/app_data.rs` : ouverture du dossier de la base et des sauvegardes.
- `src-tauri/src/navigation.rs` : liste blanche des protocoles de l'application et trois tests.
- `src-tauri/src/http.rs` : lecture des réponses fournisseurs plafonnée à 8 Mo.
- `src-tauri/src/share_images.rs` : lecture d'image par morceaux, `Content-Length`, redirections revalidées.
- `src-tauri/src/tmdb/client.rs`, `src-tauri/src/igdb/mod.rs`, `src-tauri/src/openlibrary.rs` : désérialisation depuis le corps plafonné.
- `src/data/appData.ts` : pont vers `open_data_folder`.
- `src/components/AppErrorBoundary.tsx` : écran de secours React.
- `src/components/CustomLibraryScreen.tsx` : sources `https` seulement.
- `src/main.tsx` : écran d'erreur avec restauration et dossier, barrière racine.
- `.github/workflows/release.yml` : job `verify`, permissions réduites, actions épinglées par SHA.
- `.github/dependabot.yml`, `SECURITY.md`, `.gitignore` : veille des dépendances, canal de signalement, motifs de secrets.
- `scripts/update-notice.test.mjs` : nettoyage temporaire robuste à la course de l'optimiseur Vite.
- `src/i18n/catalogs/shell.ts` : traductions des nouveaux écrans.
- `docs/audits/2026-10-25-audit-securite-performance.md` : ce rapport.

Les tests finaux : **191 tests Rust**, **449 tests Node**, `cargo fmt`, `cargo clippy -D warnings`, `npm run typecheck`, `npm run build` et `npm run verify` verts. `npm audit --omit=dev` : 0 vulnérabilité. `cargo audit` : 13 avis restants, documentés comme non atteignables ou limités à `extract()` sur archive signée, plus le DNS rebinding des images et la clé de signature dans les jobs de build. Le changement de configuration macOS a été vérifié par un build debug : `Info.plist` à `11.0`, binaire `minos 11.0`.
