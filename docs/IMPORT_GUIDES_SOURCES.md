# Sources des guides d’import tiers

Contrôle effectué le **30 octobre 2026** (Europe/Paris), complété par la matrice `services-matrix` du même jour pour les en-têtes IMDb, Simkl, Hardcover, StoryGraph et MyAnimeList. La première consultation des guides date du 22 octobre 2026.

Le catalogue destiné à l’interface est `src/domain/importGuides.ts`. Il contient des instructions d’export, pas des connexions aux comptes tiers.

## Portée du contrôle

- Première consultation dans un **navigateur Chromium headless**, avec une session Playwright isolée et sans compte connecté. Les sources officielles ont ensuite été recherchées et, lorsque nécessaire, lues par extraction web.
- Aucun compte créé, aucune connexion effectuée, aucun export personnel déclenché. Aucun identifiant, mot de passe, cookie de connexion ou jeton enregistré dans le projet.
- `verification: 'official'` signifie qu’une documentation officielle accessible confirme la procédure et le format. Cela ne signifie **pas** « téléchargement testé de bout en bout » ou « intégralité des données importable dans Sylloge ».
- `verification: 'partial'` signale une interface protégée par connexion, des précisions historiques ou communautaires, ou l’absence de procédure d’export actuellement vérifiable.
- `verifiedAt` est la date de cette consultation, pas celle de publication des documents.
- Les résultats de recherche sont des pistes : un extrait indexé n’a pas été retenu comme preuve d’un bouton actuellement disponible. Aucune copie d’archive web n’a été utilisée comme source actuelle.

## Letterboxd — documentation officielle

### Sources lues

1. [Can I get a copy of my account data?](https://support.letterboxd.com/hc/en-us/articles/15179196880911-Can-I-get-a-copy-of-my-account-data), aide officielle. Le navigateur a reçu un contrôle Cloudflare HTTP 403 ; l’extraction web a permis de lire l’article. Il confirme l’option dans **Settings** et une **archive ZIP de documents CSV**.
2. [Export your data](https://letterboxd.com/user/exportdata/), page officielle accessible en HTTP 200 dans le navigateur, sans connexion. Texte observé : « generate a zip file containing CSVs of your profile, films, reviews, lists and more ». Le lien visible **Export Data** pointe vers `https://letterboxd.com/data/export/`. Il n’a pas été activé.
3. [Settings → Data](https://letterboxd.com/settings/data/), lien du catalogue : affiche la page de connexion Letterboxd. Les réglages authentifiés et le téléchargement n’ont donc pas été inspectés.

### Conséquences pour le guide

- L’export ZIP/CSV est confirmé par Letterboxd ; la connexion se déroule sur le site tiers.
- Les noms usuels `ratings.csv`, `watched.csv`, `watchlist.csv`, `diary.csv` et `reviews.csv` ne sont **pas garantis par les deux pages publiques lues**. Le guide ne dépend donc pas d’une liste de noms de fichiers supposée stable.
- Forme exploitable dans Sylloge : CSV seul ou CSV contenu dans un ZIP. La lecture du conteneur ne prouve ni la fusion de toutes les tables ni la conservation de tous les revisionnages, listes ou interactions.
- Le guide reste prudent sur les champs : seuls les champs reconnus ou associés et visibles dans l’aperçu sont annoncés comme repris.

## Goodreads — documentation officielle actuelle

### Sources lues

1. [Import or export your books](https://help.goodreads.com/s/article/000001100), aide officielle, datée **Jul 14, 2026** dans la page. La page HTTP 200 est partiellement chargée dans le navigateur ; l’extraction web a restitué le texte complet, y compris **Export your books**.
2. L’ancien lien [How do I import or export my books?](https://help.goodreads.com/s/article/How-do-I-import-or-export-my-books-1553870934590), encore présent dans les résultats de recherche, renvoie une erreur. Il n’est pas utilisé comme source du catalogue.
3. [Import and export](https://www.goodreads.com/review/import), lien du catalogue : HTTP 403 dans le navigateur non connecté. Aucun bouton d’un compte connecté n’a été testé.

### Procédure confirmée par l’article actuel

1. **Desktop only** : ouvrir **My Books**, puis **Import and export** sous **Tools** à gauche.
2. Sous **Export**, choisir **Export Library** et attendre la génération.
3. Sélectionner le lien **Your export from [date] - [time]** pour télécharger le **CSV**.

L’article distingue bien les formats acceptés à l’import **dans Goodreads** (`.csv`, `.txt`, `.xls`) du format produit à l’export (**.csv**). Le guide Sylloge ne confond pas les deux. L’article ne donne pas de schéma exhaustif des colonnes ni de garantie de conservation des couvertures, relectures ou étagères dans une autre application.

Forme prévue pour Sylloge : CSV de bibliothèque, avec contrôle du mapping. Une date de fin de lecture ne doit pas devenir artificiellement un début de lecture ; une étagère personnalisée n’est pas nécessairement une catégorie Sylloge.

Le parseur dédié disponible pendant cette intervention a été relu et exercé par ses tests : il cible **Livres uniquement**, pas Mangas. Il reconnaît `Book Id`, `Title`, `Author`, `My Rating` et `Exclusive Shelf` ; les notes personnelles, l’année, l’avis et les notes privées sont repris selon leur présence. Les statuts `read`, `currently-reading` et `to-read` sont traduits, `My Rating = 0` reste une absence de note. `Date Read`, `Date Added`, `Read Count`, ISBN et étagères personnalisées ne sont pas transformés en champs au sens différent.

## MyAnimeList — export XML confirmé, import XML pris en charge

### Sources lues

1. [Page d’export](https://myanimelist.net/panel.php?go=export) : redirige en HTTP 200 vers une page de connexion avec le message **You must first login to see this page**. Le formulaire d’export et le fichier actuel ne sont pas accessibles sans compte.
2. [Export Manga List (Anime List too).](https://myanimelist.net/forum/?topicid=5105), rubrique **Updates & Announcements**, accessible dans le navigateur. Le premier message de **Xinil / Overlord**, daté du **19 septembre 2007**, annonce l’export XML et fournit le lien `panel.php?go=export`.
3. Dans le même fil, le message communautaire de **lycheejane**, daté du **25 mai 2016**, décrit le choix Anime/Manga, **Export My List**, puis le téléchargement `.xml.gz`. Ce n’est pas une documentation officielle actuelle. Les détails de cette réponse, masqués dans le texte visible du navigateur, sont présents dans le contenu extrait et indexé.
4. [Simple XML Exporter](https://myanimelist.net/forum/?topicid=1262165), message communautaire de **motoko**, daté du **1er septembre 2014**, accessible dans le navigateur : décrit explicitement un XML compressé en **gzip**.

### Conséquences pour le guide

- L’existence historique d’un export XML et l’accès actuel à la route protégée sont vérifiés. Le rendu authentifié actuel et la compression effectivement délivrée ne le sont pas.
- Le format est présenté comme **XML, généralement compressé en `.xml.gz`**, avec réserve explicite. Le bouton historique est formulé conditionnellement.
- **Support Sylloge de `.xml` : livré et testé** (fixtures synthétiques, racine `<myanimelist>`, entrées `<anime>`/`<manga>`). Le fichier `.xml.gz` n’est **pas** décompressé par Sylloge : le guide demande de le décompresser d’abord, et le sélecteur natif ne propose que `.xml`. Une extension changée ne convertit pas le format.
- La disponibilité de champs tels que commentaires, tags et détails par épisode varie dans les témoignages du fil ; aucune promesse actuelle n’est tirée de ces messages anciens. Le moteur lit les champs `my_status`, `my_score`, `my_start_date`, `my_finish_date`, `my_comments`, `my_watched_episodes`, `my_read_volumes` et `my_read_chapters` lorsqu’ils existent, et ignore silencieusement les autres.
- `verification` reste **partial** malgré l’annonce officielle, précisément parce qu’elle est ancienne et complétée par des témoignages communautaires, et parce qu’aucun export authentifié n’a été téléchargé.

## IMDb — en-tête réel, import seul

### Sources lues

1. [Ratings FAQ](https://help.imdb.com/article/imdb/track-movies-tv/ratings-faq/G67Y87TFYYP6TWAV), aide officielle mise à jour le 9 février 2026 : *Your Ratings* → icône **Export** → fichier `.csv`. La page ne publie pas les colonnes.
2. [Migrating from IMDb](https://letterboxd.com/about/migrating-from-imdb/), guide officiel de Letterboxd : décrit les quatre exports IMDb (`ratings.csv`, `checkins.csv`, `watchlist.csv`, listes) et confirme qu’IMDb n’exporte pas les critiques.
3. Export public de 503 notes, dépôt `sharkdp/imdb-ratings` : en-tête réel `position,const,created,modified,description,Title,Title type,Directors,You rated,IMDb Rating,Runtime (mins),Year,Genres,Num. Votes,Release Date (month/day/year),URL`. Preuve d’en-tête, pas de stabilité garantie.
4. Variante récente évoquée par un outil tiers (`Const`, `Your Rating`, `Title Type`) : non vérifiée. Le détecteur accepte les deux casses et les deux noms de note par normalisation.

### Conséquences pour le guide

- L’export `.csv` est confirmé ; la présence d’un bouton dans un compte connecté et le contenu exact de la watchlist ne sont pas testés.
- L’import Sylloge ne dépend pas du nom du fichier : `const`, une colonne de note et `Title type` suffisent à reconnaître IMDb. `watchlist.csv` sert seulement à choisir le statut à voir.
- IMDb n’a **aucun import de fichier** : le guide ne promet pas de retour vers IMDb.
- Les épisodes et types non film/série sont comptés et nommés ; la date de notation n’est pas une date de visionnage ; l’identifiant IMDb, l’année et les réalisateurs ne sont pas repris.

## The StoryGraph — export CSV, en-tête non publié

### Sources lues

1. [Bulk import template](https://thestorygraph.freshdesk.com/support/solutions/articles/79000146300-bulk-import-template), aide officielle modifiée le 2 avril 2025 : l’import en masse n’accepte qu’un **CSV au format Goodreads**, avec les colonnes obligatoires `Title`, `Author`, `My Rating`, `Date Added`, `Exclusive Shelf`, `Read Count`.
2. `https://app.thestorygraph.com/user-export`, URL d’export citée comme officielle par la FAQ Hardcover (`https://hardcover.app/pages/faq`). La page n’a pas été ouverte avec un compte.
3. Les colonnes exactes de l’export StoryGraph ne sont **pas trouvées**. Un guide tiers annonce 23 colonnes, non vérifié.

### Conséquences pour le guide

- Sylloge reconnaît un CSV Goodreads **sans `Book Id`** portant `Title`, `Author`, `My Rating`, `Exclusive Shelf` et `Read Count`. C’est un sous-ensemble documenté du schéma d’import, pas une preuve du schéma d’export.
- `did-not-finish` est traduit en abandonné. Les autres étagères exclusives inconnues bloquent, sans statut deviné.
- Un export dont l’en-tête diffère retombe sur le mapping CSV générique. Aucun export connecté n’a été testé ; `verification` reste **partial**.

## Simkl — en-tête officiel du modèle CSV

### Sources lues

1. [Export data formats](https://docs.simkl.org/how-to-use-simkl/advanced-usage/import-export-data/exporting-from-simkl/export-data-formats), documentation officielle : trois voies (CSV simple réservé Pro, ZIP JSON selon l’offre, API gratuite). Le CSV ne contient que le dernier épisode vu par série.
2. [Import CSV](https://simkl.com/apps/import/csv) et modèle officiel `https://simkl.com/ajax/apps/import-data.csv` : en-tête exact `simkl_id,TVDB_ID,TMDB,IMDB_ID,MAL_ID,Type,Title,Year,LastEpWatched,Watchlist,WatchedDate,Rating,Memo` ; `Type` ∈ `tv`, `anime`, `movie` ; `Watchlist` ∈ `watching`, `plan to watch`, `completed`, `dropped`, `on hold` ; `Rating` 1–10 ; `WatchedDate` `DD-MM-YYYY` ou `MM/DD/YYYY` ; limite 5 Mo.

### Conséquences pour le guide

- L’en-tête reconnu est celui du modèle d’import officiel, que Simkl utilise aussi pour son CSV d’export. Le guide signale que l’export CSV dépend de l’offre Pro et que le ZIP JSON n’a pas de schéma publié.
- Le moteur répartit les lignes par `Type` et n’importe que le médium ouvert ; les autres sont comptées. `on hold` devient « en cours » pour les séries et l’animation, « en attente » pour les films.
- Le CSV ne portant que le dernier épisode, la progression et la date du dernier épisode ne sont pas importées ; les identifiants ne sont pas stockés.

## Hardcover — format d’import documenté, export non publié

### Sources lues

1. [Custom CSV import format](https://hardcover.app/pages/custom-csv-import-format), documentation officielle : `Title` et `Author` requis, `Status` ∈ None, Want to Read, Currently Reading, Read, Did Not Finish Read ; `Rating` 0,5–5 par demi-points ; dates `AAAA-MM-JJ` ; ISBN/ASIN/identifiants Hardcover optionnels.
2. [FAQ Hardcover](https://hardcover.app/pages/faq) : import des CSV Goodreads/StoryGraph et du CSV personnalisé ; l’export CSV est annoncé comme livré (demande roadmap « csv export », statut **Released**, commentaire du 27 août 2025).
3. Format exact de l’**export** Hardcover : **non trouvé**. Un export différent du format d’import documenté n’est pas reconnu et passe par le mapping générique.

### Conséquences pour le guide

- Sylloge reconnaît l’en-tête du format d’import personnalisé, avec au moins une colonne propre à Hardcover pour éviter les faux positifs.
- `None` bloque : Sylloge n’invente pas de statut. `Date Finished` et `Date Added` ne sont pas importées ; `Date Started`, `Review` et l’année de `Publish Date` le sont.
- `verification` reste **partial** : le schéma d’import est officiel, mais le bouton et les colonnes de l’export ne le sont pas.

## Notion — documentation officielle

### Sources lues

1. [Export your Notion content](https://www.notion.com/help/export-your-content), aide officielle, accessible en HTTP 200 dans le navigateur.
2. [Exporter votre contenu Notion](https://www.notion.com/fr/help/export-your-content), version française lue par extraction web ; section **Exporter aux formats markdown et CSV**.
3. [Connexion Notion](https://www.notion.so/login), lien du catalogue : redirige vers `https://app.notion.com/login` en HTTP 200. Aucun espace de travail authentifié n’a été ouvert.

### Procédure et réserves confirmées

- Menu **••• → Exporter**, format **Markdown et CSV / Markdown & CSV** ; option **Inclure les sous-pages** pour conserver les pages associées ; téléchargement d’un **ZIP contenant les CSV et Markdown**.
- Une base pleine page est exportée en CSV ; une page hors base devient du Markdown. Un fichier Markdown seul n’est donc pas une table de bibliothèque.
- Le choix de vue est limité à la vue actuelle ou la vue par défaut ; l’export de toutes les vues en une fois n’est pas pris en charge.
- Les droits d’accès et les réglages Enterprise peuvent empêcher l’export ; certaines pages privées ou certains contenus d’espace d’équipe ne sont pas inclus.

Forme Sylloge : CSV seul ou ZIP contenant des tables CSV. Le code existant autorise, dans le parcours **Films** seulement, l’association de certaines sections Markdown « Notes » à un titre lorsque l’association est unique. Cela ne constitue pas une restauration générale de Notion. Relations, formules, commentaires et pièces jointes ne sont pas promis comme structures reconstituées.

## BetaSeries — droit de copie officiel, format CSV non confirmé

### Sources lues

1. [Politique de protection et de gestion des données personnelles](https://www.betaseries.com/legal/privacy), page officielle accessible dans le navigateur en HTTP 200. La page indique une entrée en vigueur au **21 juillet 2022** ; elle a été consultée le **22 octobre 2026**.
2. Section **Droits des utilisateurs et modalités d’exercice** : confirme une demande d’accès/copie sous une forme électronique d’usage courant et le droit à la portabilité dans un format structuré lisible par machine. Un contact est indiqué dans cette politique.
3. [Gestion du compte](https://support.betaseries.com/compte/), aide officielle actuelle : aucun tutoriel d’export CSV dans la liste de rubriques consultée. Cela ne prouve pas l’absence d’une option authentifiée.
4. [Compte BetaSeries](https://www.betaseries.com/compte/), lien du catalogue : redirige vers la page d’identification.

Des sujets communautaires sur le domaine BetaSeries mentionnent des exports CSV en 2015, 2017 et 2023. Ils ne suffisent pas à confirmer un libellé de bouton, un chemin de menu ou un format actuel. Ils ne servent pas de preuve pour promettre un export immédiat.

Le guide recommande donc de vérifier les options du compte, puis de consulter la procédure officielle d’accès/portabilité si nécessaire. **Aucune fermeture de BetaSeries n’est affirmée.** Aucun délai ni export CSV garanti n’est annoncé. Sylloge ne promet qu’un mapping générique pour un éventuel CSV compatible, pas une interprétation validée des statuts numériques, identifiants internes ou épisodes.

## TV Time — service arrêté le 15 juillet 2026

### Constats directs sur les domaines officiels

1. [TV Time](https://www.tvtime.com/), HTTP 200 dans le navigateur : page **Thank You — TV Time**, dont le texte remercie la communauté et parle du rôle passé de la plateforme. Aucun lien de connexion ou d’export n’est présent.
2. [Aide TV Time](https://help.tvtime.com/), HTTP 200 : même page de remerciement.
3. Ancien portail `https://gdpr.tvtime.com/gdpr/self-service` : échec navigateur **ERR_NAME_NOT_RESOLVED** pendant le contrôle. Un résultat de recherche en conserve une ancienne page de connexion ; cet extrait n’est pas la preuve que le service fonctionne encore.
4. [Serializd — TV Time](https://www.serializd.com/tvtime) et [BetaSeries — Importer votre archive TV Time](https://support.betaseries.com/importer-tv-time), recoupement du 30 octobre 2026 : arrêt annoncé au **15 juillet 2026**, données supprimées, plus aucune demande d’export possible.

## Contrat avec l’interface et le moteur

- Les `steps` sont des phrases autonomes à rendre dans une liste ordonnée ; elles n’intègrent pas de numérotation figée ni de tutoiement/vouvoiement.
- `libraries` indique la pertinence du guide pour une bibliothèque. Il ne s’agit pas d’une déclaration de support de tous les formats du service.
- Les liens d’export ouvrent le site tiers. Les opérations de connexion et de demande de données restent sur le service concerné ; Sylloge ne reçoit pas les identifiants.
- Les liens « officiels » ne doivent pas être étiquetés « export testé » ou « tout sera conservé » dans l’UI.
- Référence du support existant relu : `src/domain/filmCsvImport.ts`, `src/domain/collectionCsvImport.ts`, `src/data/nativePortability.ts`, puis le nouvel adaptateur `src/domain/thirdPartyImport.ts` apparu pendant cette intervention. CSV, XML et conteneurs sont distincts des adaptateurs propres à un service. La présence d’une extension reconnue ne prouve pas la reprise d’un schéma externe.
- Adaptateurs testés : **Letterboxd CSV/ZIP**, **Goodreads CSV**, **The StoryGraph CSV**, **IMDb CSV**, **Simkl CSV**, **Hardcover CSV (format d’import documenté)** et **MyAnimeList XML**. Grouvee, Trakt, AniList, SensCritique (CSV) et BoardGameGeek n’ont pas d’adaptateur ; aucun en-tête non vérifié n’a été supposé.
- Si le moteur ajoute un adaptateur testé ou la fusion de plusieurs tables, mettre à jour `preserved` et `limitations` à partir de ses tests réels. Une évolution du moteur ne change pas à elle seule le niveau de vérification du parcours authentifié tiers.

## Vérification locale du catalogue

- Compilation TypeScript isolée de `src/domain/importGuides.ts` en mode strict : réussie.
- Chargement réel du module sous Node et assertions sur le schéma, les identifiants uniques, les URL HTTPS, les bibliothèques, les dates, les étapes et l’absence de tutoiement/vouvoiement : **10 guides conformes**.
- `node --experimental-strip-types --test scripts/third-party-import.test.mjs scripts/third-party-import-services.test.mjs` : **27 tests réussis**, aucun échec. Ils exercent les adaptateurs purs avec des fixtures synthétiques, pas des exports de comptes authentifiés ni l’intégralité du parcours UI/natif.
- Pour Letterboxd, les tests confirment les variantes notes/journal/vus/à voir, `Watched Date` plutôt que `Date`, et le blocage des titres répétés sans fusion silencieuse des revisionnages. Les noms `watched.csv` et `watchlist.csv` sont donc cités comme une contrainte de l’adaptateur testé, non comme un schéma de nommage exhaustif promis par les sources publiques.
- Pour IMDb, les tests couvrent la reconnaissance par en-tête, le mélange films/séries compté, les épisodes ignorés, la conversion /10 → /5 et le refus d’une note invalide. Pour Simkl, les cinq statuts, les trois médiums et les deux ordres de date. Pour Hardcover, les quatre statuts et le blocage de `None`. Pour MyAnimeList, les statuts anime et manga, le score 0, les dates `0000-00-00`, les CDATA, le refus du DOCTYPE et le XML mal formé. Pour The StoryGraph, l’absence de `Book Id` et `did-not-finish`.
