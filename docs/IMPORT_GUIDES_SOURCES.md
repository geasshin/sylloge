# Sources des guides d’import tiers

Contrôle effectué le **22 octobre 2026**, date locale obtenue avec `date` : `2026-10-22 00:26:23 CEST` (Europe/Paris).

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

## MyAnimeList — confirmation partielle, pas de support XML promis

### Sources lues

1. [Page d’export](https://myanimelist.net/panel.php?go=export) : redirige en HTTP 200 vers une page de connexion avec le message **You must first login to see this page**. Le formulaire d’export et le fichier actuel ne sont pas accessibles sans compte.
2. [Export Manga List (Anime List too).](https://myanimelist.net/forum/?topicid=5105), rubrique **Updates & Announcements**, accessible dans le navigateur. Le premier message de **Xinil / Overlord**, daté du **19 septembre 2007**, annonce l’export XML et fournit le lien `panel.php?go=export`.
3. Dans le même fil, le message communautaire de **lycheejane**, daté du **25 mai 2016**, décrit le choix Anime/Manga, **Export My List**, puis le téléchargement `.xml.gz`. Ce n’est pas une documentation officielle actuelle. Les détails de cette réponse, masqués dans le texte visible du navigateur, sont présents dans le contenu extrait et indexé.
4. [Simple XML Exporter](https://myanimelist.net/forum/?topicid=1262165), message communautaire de **motoko**, daté du **1er septembre 2014**, accessible dans le navigateur : décrit explicitement un XML compressé en **gzip**.

### Conséquences pour le guide

- L’existence historique d’un export XML et l’accès actuel à la route protégée sont vérifiés. Le rendu authentifié actuel et la compression effectivement délivrée ne le sont pas.
- Le format est présenté comme **XML, généralement compressé en `.xml.gz`**, avec réserve explicite. Le bouton historique est formulé conditionnellement.
- La disponibilité de champs tels que commentaires, tags et détails par épisode varie dans les témoignages du fil ; aucune promesse actuelle n’est tirée de ces messages anciens.
- **Support direct Sylloge de `.xml`, `.xml.gz` ou `.gz` non confirmé.** Le guide conseille de conserver la sauvegarde et ne termine pas par une consigne d’import direct. Décompresser un gzip produit un XML, pas un CSV ; changer l’extension ne convertit pas le format.
- `verification` reste **partial** malgré l’annonce officielle, précisément parce qu’elle est ancienne et complétée par des témoignages communautaires.

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

## TV Time — aucune nouvelle procédure d’export fonctionnelle vérifiée

### Constats directs sur les domaines officiels

1. [TV Time](https://www.tvtime.com/), HTTP 200 dans le navigateur : page **Thank You — TV Time**, dont le texte remercie la communauté et parle du rôle passé de la plateforme. Aucun lien de connexion ou d’export n’est présent.
2. [Aide TV Time](https://help.tvtime.com/), HTTP 200 : même page de remerciement.
3. Ancien portail `https://gdpr.tvtime.com/gdpr/self-service` : échec navigateur **ERR_NAME_NOT_RESOLVED** pendant ce contrôle. Un résultat de recherche en conserve une ancienne page de connexion ; cet extrait n’est pas la preuve que le service fonctionne encore.

### Recoupement distinct, non attribué à TV Time

L’aide officielle **BetaSeries**, [Importer votre archive TV Time](https://support.betaseries.com/importer-tv-time), lue dans le navigateur, annonce une fermeture au **15 juillet** et l’indisponibilité des nouvelles demandes. Cette page documente la reprise d’une **archive déjà téléchargée dans BetaSeries**, pas dans Sylloge. Sa date de fermeture ne constitue pas une annonce primaire TV Time ; elle n’est donc pas répétée comme fait daté dans le catalogue.

Le guide Sylloge se limite à rechercher et conserver une archive existante. Il ne garantit **ni une nouvelle récupération**, ni le contenu exact d’un ZIP, ni un import natif TV Time. Seul un CSV compatible peut être présenté au mapping générique, après inspection. Le champ `exportUrl` ouvre exceptionnellement le site d’information officiel, **pas un export actif** ; cette exception est explicitée dans `limitations`.

## Contrat avec l’interface et le moteur

- Les `steps` sont des phrases autonomes à rendre dans une liste ordonnée ; elles n’intègrent pas de numérotation figée ni de tutoiement/vouvoiement.
- `libraries` indique la pertinence du guide pour une bibliothèque. Il ne s’agit pas d’une déclaration de support de tous les formats du service.
- Les liens d’export ouvrent le site tiers. Les opérations de connexion et de demande de données restent sur le service concerné ; Sylloge ne reçoit pas les identifiants.
- Les liens « officiels » ne doivent pas être étiquetés « export testé » ou « tout sera conservé » dans l’UI.
- Référence du support existant relu : `src/domain/filmCsvImport.ts`, `src/domain/collectionCsvImport.ts`, `src/data/nativePortability.ts`, puis le nouvel adaptateur `src/domain/thirdPartyImport.ts` apparu pendant cette intervention. CSV et conteneurs sont distincts des adaptateurs propres à un service. La présence d’une extension reconnue ne prouve pas la reprise d’un schéma externe.
- Priorités documentées : **Letterboxd CSV/ZIP** et **Goodreads CSV**. Le catalogue n’anticipe pas un parseur MyAnimeList non validé, un connecteur BetaSeries ou un connecteur TV Time.
- Si le moteur ajoute un adaptateur testé ou la fusion de plusieurs tables, mettre à jour `preserved` et `limitations` à partir de ses tests réels. Une évolution du moteur ne change pas à elle seule le niveau de vérification du parcours authentifié tiers.

## Vérification locale du catalogue

- Compilation TypeScript isolée de `src/domain/importGuides.ts` en mode strict : réussie.
- Chargement réel du module sous Node et assertions sur le schéma, les identifiants uniques, les URL HTTPS, les bibliothèques, les dates, les étapes et l’absence de tutoiement/vouvoiement : **6 guides conformes**.
- `node --experimental-strip-types --test scripts/third-party-import.test.mjs` : **9 tests réussis**, aucun échec. Ils exercent les adaptateurs purs Letterboxd et Goodreads avec des fixtures synthétiques, pas des exports de comptes authentifiés ni l’intégralité du parcours UI/natif.
- Pour Letterboxd, les tests confirment les variantes notes/journal/vus/à voir, `Watched Date` plutôt que `Date`, et le blocage des titres répétés sans fusion silencieuse des revisionnages. Les noms `watched.csv` et `watchlist.csv` sont donc cités comme une contrainte de l’adaptateur testé, non comme un schéma de nommage exhaustif promis par les sources publiques.
