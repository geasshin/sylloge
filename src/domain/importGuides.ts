/**
 * Guides d’export tiers pour le parcours d’import.
 *
 * `verification` qualifie les sources du guide, pas un export réalisé depuis
 * un compte connecté ni la compatibilité de tous les champs avec Sylloge.
 * `preserved` décrit la reprise possible, à confirmer dans l’aperçu d’import.
 * Les étapes sont indépendantes de l’UI et peuvent être rendues dans une <ol>.
 * Aucun identifiant, mot de passe, cookie ou jeton de service tiers n’est stocké.
 * Sources, contrôles d’accès et réserves : docs/IMPORT_GUIDES_SOURCES.md.
 */
export type ImportGuide = {
  id: string
  name: string
  libraries: Array<'films' | 'series' | 'anime' | 'books' | 'mangas' | 'games' | 'artworks'>
  format: string
  exportUrl: string
  steps: string[]
  preserved: string
  limitations: string
  verification: 'official' | 'partial'
  verifiedAt: string
  sourceUrl: string
}

export const IMPORT_GUIDES: ImportGuide[] = [
  {
    id: 'letterboxd',
    name: 'Letterboxd',
    libraries: ['films'],
    format: 'Archive ZIP contenant des fichiers CSV',
    exportUrl: 'https://letterboxd.com/settings/data/',
    steps: [
      'Ouvrir les réglages Letterboxd dans un navigateur et se connecter sur letterboxd.com.',
      'Ouvrir l’option d’export des données du compte, puis sélectionner « Export Data ».',
      'Enregistrer l’archive ZIP générée sur l’ordinateur et conserver l’original.',
      'Dans Sylloge, ouvrir Films et choisir de préférence le ZIP entier : les fichiers de notes, journal, films vus, liste à voir et avis sont regroupés. Un CSV isolé reste accepté.',
      'Vérifier les titres, les colonnes associées et les données ignorées dans l’aperçu avant de confirmer.',
    ],
    preserved: 'Titres, notes sur 5, statut vu ou à voir et, si les colonnes sont présentes, dates de visionnage et avis. Dans un ZIP, les avis et l’historique de visionnage sont conservés dans la note personnelle, avec la dernière date de visionnage explicite.',
    limitations: 'Sylloge regroupe ratings.csv, watched.csv, diary.csv, watchlist.csv et reviews.csv dans un ZIP, sans rétablir les fichiers supprimés. Les contradictions d’identité ou de notes bloquent l’archive. Conserver les noms watched.csv et watchlist.csv pour distinguer ces deux listes. La colonne Date n’est pas une date de visionnage : seule Watched Date remplit ce champ. Un CSV isolé avec des titres répétés est bloqué ; préférer le ZIP pour conserver les revisionnages et tags dans la note personnelle. Les listes personnalisées et données sociales ne sont pas reprises. Aucun téléchargement connecté n’a été testé.',
    verification: 'official',
    verifiedAt: '2026-10-22',
    sourceUrl: 'https://support.letterboxd.com/hc/en-us/articles/15179196880911-Can-I-get-a-copy-of-my-account-data',
  },
  {
    id: 'imdb',
    name: 'IMDb',
    libraries: ['films', 'series'],
    format: 'Fichier CSV de notes ou de liste à voir',
    exportUrl: 'https://www.imdb.com/ratings/',
    steps: [
      'Ouvrir IMDb dans un navigateur et se connecter sur imdb.com.',
      'Ouvrir « Your Ratings » depuis le menu du compte, puis choisir l’icône d’export et télécharger le fichier ratings.csv.',
      'Pour la liste à voir, ouvrir la watchlist IMDb et utiliser son propre export CSV, nommé watchlist.csv.',
      'Dans Sylloge, ouvrir Films pour importer les films, puis répéter l’opération dans Séries pour les séries : un même fichier ne remplit qu’une bibliothèque à la fois.',
      'Vérifier les notes converties sur 5 et les lignes ignorées dans l’aperçu avant de confirmer.',
    ],
    preserved: 'Titres, notes sur 10 converties sur 5 par demi-points, statut terminé pour une note et à découvrir pour la liste à voir. Les films et les séries d’un même fichier sont répartis selon leur type ; les lignes de l’autre médium sont comptées dans l’aperçu.',
    limitations: 'Les épisodes, jeux vidéo et autres types IMDb sont ignorés et comptés. La date « created » est une date de notation, pas une date de visionnage : elle n’est pas importée. L’année, les réalisateurs et l’identifiant IMDb ne sont pas repris, car Sylloge ne stocke pas d’identifiant IMDb et son contrat Films n’importe pas ces métadonnées. IMDb n’accepte aucun import de fichier en retour. Aucun export connecté n’a été testé.',
    verification: 'official',
    verifiedAt: '2026-10-30',
    sourceUrl: 'https://help.imdb.com/article/imdb/track-movies-tv/ratings-faq/G67Y87TFYYP6TWAV',
  },
  {
    id: 'simkl',
    name: 'Simkl',
    libraries: ['films', 'series', 'anime'],
    format: 'Fichier CSV de suivi',
    exportUrl: 'https://simkl.com/settings/',
    steps: [
      'Ouvrir Simkl dans un navigateur et se connecter sur simkl.com.',
      'Ouvrir les réglages du compte, section des données ou de l’export, et télécharger l’export CSV. Selon l’offre, le CSV peut être réservé à Simkl Pro.',
      'Conserver le fichier original. Le CSV ne décrit que le dernier épisode vu, sans historique par épisode.',
      'Dans Sylloge, ouvrir Films, Séries ou Animation japonaise et déposer le même fichier : seules les lignes du médium ouvert sont importées, les autres sont comptées.',
      'Vérifier les statuts traduits, les notes sur 5 et les dates dans l’aperçu avant de confirmer.',
    ],
    preserved: 'Titres, statuts (watching, plan to watch, completed, dropped, on hold), notes sur 10 converties sur 5, mémo personnel et, pour les films, date de visionnage WatchedDate.',
    limitations: 'L’export CSV est présenté comme réservé à l’offre Pro ; le ZIP JSON est plus complet mais son schéma n’est pas publié. Le CSV ne porte que le dernier épisode vu : la progression en épisodes et la date du dernier épisode ne sont pas importées pour les séries et animés. « on hold » devient « en cours » pour les séries et l’animation, « en attente » pour les films. Les identifiants Simkl, TMDB, TVDB, IMDb et MAL ne sont pas stockés. Aucun export connecté n’a été testé.',
    verification: 'official',
    verifiedAt: '2026-10-30',
    sourceUrl: 'https://docs.simkl.org/how-to-use-simkl/advanced-usage/import-export-data/exporting-from-simkl/export-data-formats',
  },
  {
    id: 'goodreads',
    name: 'Goodreads',
    libraries: ['books'],
    format: 'Fichier CSV de bibliothèque',
    exportUrl: 'https://www.goodreads.com/review/import',
    steps: [
      'Ouvrir Goodreads sur ordinateur et se connecter sur goodreads.com. L’export n’est pas proposé dans les applications mobiles.',
      'Dans « My Books », ouvrir « Import and export » sous « Tools », dans la colonne de gauche.',
      'Sous « Export », sélectionner « Export Library » et attendre la génération du fichier.',
      'Quand le lien « Your export from [date] - [time] » apparaît, le sélectionner pour télécharger le fichier CSV.',
      'Dans Sylloge, ouvrir Livres, choisir ce CSV et vérifier les associations de colonnes dans l’aperçu avant de confirmer.',
    ],
    preserved: 'Titres, auteurs, année de publication, notes personnelles sur 5, statut de lecture et avis lorsque les colonnes existent. Les avis et notes privées sont réunis avec un avertissement explicite ; une note de 0 reste une absence de note.',
    limitations: 'Import dédié au CSV de bibliothèque Goodreads dans Livres, pas à Mangas, au HTML, au XLS ou à une synchronisation de compte. Les statuts read, currently-reading et to-read sont reconnus. Date Read et Date Added ne deviennent pas un début de lecture ; Read Count ne devient pas un nombre de tomes. ISBN, couvertures, étagères personnalisées et relectures ne sont pas repris. Les titres répétés doivent être résolus avant import. Aucun export connecté n’a été exécuté.',
    verification: 'official',
    verifiedAt: '2026-10-22',
    sourceUrl: 'https://help.goodreads.com/s/article/000001100',
  },
  {
    id: 'storygraph',
    name: 'The StoryGraph',
    libraries: ['books'],
    format: 'Fichier CSV compatible avec les colonnes Goodreads',
    exportUrl: 'https://app.thestorygraph.com/user-export',
    steps: [
      'Ouvrir The StoryGraph dans un navigateur et se connecter sur app.thestorygraph.com.',
      'Ouvrir la page d’export du compte et télécharger le fichier CSV proposé.',
      'Conserver le fichier original. The StoryGraph n’impose pas d’ISBN à l’export, contrairement à Goodreads.',
      'Dans Sylloge, ouvrir Livres, choisir ce CSV et vérifier les colonnes reconnues dans l’aperçu avant de confirmer.',
      'Corriger dans une copie du fichier toute étagère exclusive inconnue : Sylloge ne devine pas un statut.',
    ],
    preserved: 'Titres, auteurs, année de publication, notes personnelles sur 5, statuts read, currently-reading, to-read et did-not-finish (abandonné), avis et notes privées lorsque les colonnes existent.',
    limitations: 'L’export The StoryGraph reprend le schéma Goodreads sans Book Id ; Sylloge le reconnaît à cette absence et aux colonnes Read Count et Exclusive Shelf. Les colonnes exactes de l’export ne sont pas publiées : un fichier dont l’en-tête diffère retombe sur le mapping CSV générique. Date Read et Date Added ne deviennent pas un début de lecture. ISBN, étagères personnalisées et relectures ne sont pas repris. Les titres répétés bloquent l’aperçu. Aucun export connecté n’a été testé.',
    verification: 'partial',
    verifiedAt: '2026-10-30',
    sourceUrl: 'https://thestorygraph.freshdesk.com/support/solutions/articles/79000146300-bulk-import-template',
  },
  {
    id: 'hardcover',
    name: 'Hardcover',
    libraries: ['books'],
    format: 'Fichier CSV (format d’import personnalisé documenté)',
    exportUrl: 'https://hardcover.app/account',
    steps: [
      'Ouvrir Hardcover dans un navigateur et se connecter sur hardcover.app.',
      'Chercher l’export CSV dans les réglages du compte : la fonction existe depuis 2025, mais son emplacement et ses colonnes ne sont pas documentés publiquement.',
      'Comparer l’en-tête obtenu au format CSV personnalisé publié par Hardcover (Title, Author, Status, Rating, Date Started, Review…).',
      'Dans Sylloge, ouvrir Livres et choisir le CSV. Si l’en-tête n’est pas reconnu, passer par le mapping CSV générique sans renommer le fichier.',
      'Vérifier les statuts, les notes et les dates dans l’aperçu avant de confirmer.',
    ],
    preserved: 'Titres, auteurs, statuts (Want to Read, Currently Reading, Read, Did Not Finish Read), notes sur 5 par demi-points, date de début de lecture, avis et année extraite de Publish Date lorsque l’en-tête correspond au format documenté.',
    limitations: 'Seul le format d’import personnalisé est publié ; le format exact de l’export CSV Hardcover ne l’est pas. Sylloge reconnaît les colonnes de ce format documenté et laisse tout autre CSV au mapping générique. Date Finished et Date Added ne sont pas importées, faute de champ de fin ou de création dans Sylloge. ISBN, ASIN, identifiants Hardcover, pages, genres et listes ne sont pas repris. Le statut None est bloqué plutôt que traduit au hasard. Aucun export connecté n’a été testé.',
    verification: 'partial',
    verifiedAt: '2026-10-30',
    sourceUrl: 'https://hardcover.app/pages/custom-csv-import-format',
  },
  {
    id: 'myanimelist',
    name: 'MyAnimeList',
    libraries: ['anime', 'mangas'],
    format: 'Fichier XML (décompresser un .xml.gz avant l’import)',
    exportUrl: 'https://myanimelist.net/panel.php?go=export',
    steps: [
      'Ouvrir la page d’export MyAnimeList et se connecter uniquement sur myanimelist.net.',
      'Choisir la liste Anime ou Manga à sauvegarder. Les deux listes s’exportent séparément.',
      'Sélectionner « Export My List », puis utiliser le lien de téléchargement affiché après la génération.',
      'Si le fichier est un .xml.gz, le décompresser d’abord : Sylloge lit le XML, pas le gzip.',
      'Dans Sylloge, ouvrir Animation japonaise ou Mangas, choisir le fichier .xml et vérifier les statuts et les notes dans l’aperçu.',
    ],
    preserved: 'Titres, statuts MAL (Watching/Reading, Completed, On-Hold, Dropped, Plan to Watch/Read), notes sur 10 converties sur 5, date de début, commentaires personnels et, pour les mangas en cours, tomes lus.',
    limitations: 'Seul le XML non compressé est accepté ; un .xml.gz ou .gz doit être décompressé avant l’import. Les épisodes vus ne deviennent pas des saisons : la progression animé n’est pas reprise. Les chapitres lus ne sont pas repris. La date de fin n’a pas de champ dans Sylloge. Les identifiants MAL ne sont pas stockés. Les entités externes et les DOCTYPE sont refusés. Les titres répétés bloquent l’aperçu. La page d’export demande une connexion ; aucun export connecté n’a été testé.',
    verification: 'partial',
    verifiedAt: '2026-10-30',
    sourceUrl: 'https://myanimelist.net/forum/?topicid=5105',
  },
  {
    id: 'notion',
    name: 'Notion',
    libraries: ['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks'],
    format: 'ZIP « Markdown et CSV », ou CSV de base de données',
    exportUrl: 'https://www.notion.so/login',
    steps: [
      'Ouvrir Notion dans un navigateur, se connecter et ouvrir la base de données contenant les œuvres, de préférence en pleine page.',
      'Dans le menu « ••• » en haut à droite, choisir « Exporter ».',
      'Choisir le format « Markdown et CSV » (« Markdown & CSV » en anglais), pas PDF ou HTML.',
      'Activer « Inclure les sous-pages » si les pages associées doivent être conservées, puis sélectionner « Exporter » et enregistrer le ZIP.',
      'Dans la bibliothèque Sylloge correspondante, choisir le ZIP ou le CSV de la base. Sélectionner la table utile si plusieurs sont proposées, puis vérifier les colonnes et l’aperçu.',
    ],
    preserved: 'Les valeurs des colonnes CSV associées aux champs de la bibliothèque choisie. Pour les films, certaines sections « Notes » des pages Markdown peuvent aussi être reprises lorsque leur association est unique.',
    limitations: 'Sylloge importe les tables CSV contenues dans le ZIP, pas un espace Notion complet. Un Markdown seul, un PDF ou un export HTML n’est pas un import de bibliothèque pris en charge. La reprise des notes Markdown est limitée au parcours Films existant ; les relations, formules, commentaires et pièces jointes ne sont pas reconstitués comme dans Notion. Les droits d’accès et les réglages de l’espace peuvent empêcher l’export. Aucun export connecté n’a été exécuté.',
    verification: 'official',
    verifiedAt: '2026-10-22',
    sourceUrl: 'https://www.notion.com/fr/help/export-your-content',
  },
  {
    id: 'betaseries',
    name: 'BetaSeries',
    libraries: ['films', 'series'],
    format: 'Copie des données ; format à confirmer auprès de BetaSeries',
    exportUrl: 'https://www.betaseries.com/compte/',
    steps: [
      'Ouvrir le compte BetaSeries dans un navigateur et se connecter sur betaseries.com.',
      'Vérifier si les réglages du compte proposent un export. Aucun libellé de bouton ni export CSV actuel n’a pu être confirmé sans connexion.',
      'En l’absence d’option, consulter la politique « Données personnelles », rubrique « Droits des utilisateurs et modalités d’exercice », pour demander une copie ou la portabilité auprès de BetaSeries.',
      'Conserver le fichier fourni et vérifier son format. Une réponse, un délai ou un fichier CSV ne sont pas garantis par ce guide.',
      'Si un CSV est disponible, le proposer à Sylloge et vérifier chaque colonne dans l’aperçu. Conserver les autres formats sans les renommer en CSV.',
    ],
    preserved: 'Uniquement les valeurs présentes dans un éventuel CSV et associées aux champs Sylloge. Aucun inventaire complet des données exportées n’a été validé.',
    limitations: 'Pas de connecteur BetaSeries validé : seul un CSV compatible, éventuellement contenu dans un ZIP, peut passer par le mapping générique. Les statuts numériques, identifiants internes, épisodes vus et notes ne doivent pas être interprétés sans vérification. La politique officielle décrit le droit d’accès et de portabilité, mais ne confirme ni le format CSV ni la disponibilité immédiate d’un export.',
    verification: 'partial',
    verifiedAt: '2026-10-22',
    sourceUrl: 'https://www.betaseries.com/legal/privacy',
  },
  {
    id: 'tv-time',
    name: 'TV Time',
    libraries: ['films', 'series'],
    format: 'Service arrêté le 15 juillet 2026',
    exportUrl: 'https://www.serializd.com/tvtime',
    steps: [
      'Ne compter sur aucun nouvel export : TV Time a cessé son activité le 15 juillet 2026 et le portail de demande d’archive ne répond plus.',
      'Chercher uniquement une archive déjà téléchargée dans les Téléchargements, les sauvegardes personnelles et les anciens messages TV Time.',
      'Conserver une copie de l’original. L’existence d’un ancien lien dans un e-mail ne garantit pas qu’il fonctionne encore.',
      'Si une archive existe, vérifier localement son contenu. Seuls des CSV compatibles peuvent être proposés au mapping générique Sylloge ; un ZIP TV Time n’est pas un import dédié validé.',
    ],
    preserved: 'Aucune reprise automatique d’un historique TV Time n’est garantie. Seuls les champs effectivement reconnus dans un CSV peuvent être repris après contrôle de l’aperçu.',
    limitations: 'Service arrêté le 15 juillet 2026 : aucun nouvel export, aucune archive à demander, aucun import dédié. Seule une archive déjà possédée reste exploitable, sans schéma documenté. Les JSON tiers, archives chiffrées, commentaires et historiques par épisode ne sont pas couverts par un connecteur validé.',
    verification: 'partial',
    verifiedAt: '2026-10-30',
    sourceUrl: 'https://www.serializd.com/tvtime',
  },
]
