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
    id: 'myanimelist',
    name: 'MyAnimeList',
    libraries: ['anime', 'mangas'],
    format: 'XML, généralement compressé en .xml.gz',
    exportUrl: 'https://myanimelist.net/panel.php?go=export',
    steps: [
      'Ouvrir la page d’export MyAnimeList et se connecter uniquement sur myanimelist.net.',
      'Choisir la liste Anime ou Manga à sauvegarder. Les deux listes s’exportent séparément.',
      'Si le bouton « Export My List » est proposé, le sélectionner, puis utiliser le lien de téléchargement affiché après la génération.',
      'Conserver le fichier original, y compris son extension .gz si elle est présente. Une décompression donne un XML, pas un CSV.',
      'Conserver cet export comme sauvegarde : l’import direct XML ou gzip dans Sylloge n’est pas confirmé.',
    ],
    preserved: 'Le XML sert de sauvegarde des entrées de la liste. Aucun champ n’est annoncé comme repris dans Sylloge tant que le support de ce format n’est pas validé.',
    limitations: 'Support Sylloge non confirmé pour .xml, .xml.gz et .gz : ces fichiers ne doivent pas être présentés comme directement importables. Un XML renommé en .csv ne devient pas compatible. L’annonce officielle de l’export XML est ancienne ; les détails du bouton et de la compression proviennent de messages communautaires sur le forum MyAnimeList. La page actuelle demande une connexion et le téléchargement n’a pas été testé.',
    verification: 'partial',
    verifiedAt: '2026-10-22',
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
    format: 'Archive déjà téléchargée ; contenu à vérifier',
    exportUrl: 'https://www.tvtime.com/',
    steps: [
      'Vérifier les Téléchargements, les sauvegardes personnelles et les anciens messages TV Time pour retrouver une archive déjà obtenue.',
      'Conserver une copie de l’original. L’existence d’un ancien lien dans un e-mail ne garantit pas qu’il fonctionne encore.',
      'Consulter le site officiel pour les informations actuelles. Aucun nouveau parcours d’export fonctionnel n’a été vérifié.',
      'Si une archive existe, vérifier localement son contenu. Seuls des CSV compatibles peuvent être proposés au mapping générique Sylloge ; un ZIP TV Time n’est pas un import dédié validé.',
    ],
    preserved: 'Aucune reprise automatique d’un historique TV Time n’est garantie. Seuls les champs effectivement reconnus dans un CSV peuvent être repris après contrôle de l’aperçu.',
    limitations: 'Le site officiel affiche une page de remerciement et l’ancien portail d’export RGPD était inaccessible lors du contrôle. Le lien ouvre le site officiel, pas un export actif. Aucun délai, nouvel export, format d’archive ou import direct TV Time n’est promis. Les JSON tiers, archives chiffrées, commentaires et historiques par épisode ne sont pas couverts par un connecteur validé.',
    verification: 'partial',
    verifiedAt: '2026-10-22',
    sourceUrl: 'https://www.tvtime.com/',
  },
]
