// Exports au format d'import exact de quatre services : SensCritique, Simkl,
// The StoryGraph (format Goodreads) et Hardcover. Chaque en-tête vient de la
// documentation officielle du service (relevé du 30 octobre 2026, voir
// docs/EXPORTS_SERVICES.md). Ces tests fixent d'abord le contrat : colonnes,
// valeurs, règles d'arrondi et bilan de ce qui n'est pas parti.
import assert from 'node:assert/strict'
import test from 'node:test'
import { planSensCritiqueExport, SENSCRITIQUE_HEADER } from '../src/domain/sensCritiqueExport.ts'
import { planSimklExport, SIMKL_HEADER } from '../src/domain/simklExport.ts'
import { GOODREADS_HEADER, planStoryGraphExport } from '../src/domain/storyGraphExport.ts'
import { HARDCOVER_HEADER, planHardcoverExport } from '../src/domain/hardcoverExport.ts'

const AT = '2026-10-30T09:00:00.000Z'

const film = (id, over = {}) => ({
  id, profileId: 'p', title: `Film ${id}`, originalTitle: null, year: 2020, status: 'terminé', isFavorite: false,
  rating: null, watchedAt: null, personalNote: null, director: null, summary: null, providerName: null, providerId: null,
  posterUrl: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
})

const series = (id, over = {}) => ({
  id, profileId: 'p', title: `Série ${id}`, showrunner: null, casting: null, summary: null, category: 'série télé',
  status: 'vue', rating: null, isFavorite: false, seasonsSeen: null, seasonsTotal: null, progressUpdatedAt: null,
  startedAt: null, posterUrl: null, personalNote: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
})

const book = (id, over = {}) => ({
  id, profileId: 'p', title: `Livre ${id}`, author: 'Autrice', year: 2000, summary: null, category: 'livre',
  status: 'lu', rating: null, isFavorite: false, volumesRead: null, volumesTotal: null, progressUpdatedAt: null,
  startedAt: null, coverUrl: null, personalNote: null, quotes: [],
  createdAt: '2026-03-04T00:00:00.000Z', updatedAt: '2026-03-05T00:00:00.000Z', ...over,
})

/** Lecture CSV complète : guillemets, virgules et retours à la ligne dans une cellule. */
function parseCsv(text) {
  const out = []
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { cell += '"'; index += 1 } else quoted = false
      } else cell += character
    } else if (character === '"') quoted = true
    else if (character === ',') { row.push(cell); cell = '' }
    else if (character === '\r') { /* fin de ligne CRLF */ }
    else if (character === '\n') { row.push(cell); out.push(row); row = []; cell = '' }
    else cell += character
  }
  if (cell !== '' || row.length > 0) { row.push(cell); out.push(row) }
  return out
}

const table = contents => parseCsv(contents)
const headerOf = contents => table(contents)[0]
const recordAt = (contents, index) => {
  const rows = table(contents)
  return Object.fromEntries(rows[0].map((key, position) => [key, rows[index + 1]?.[position] ?? null]))
}

// ─── SensCritique ───────────────────────────────────────────────────────────

test('SensCritique : les sept colonnes officielles, dans l’ordre, une ligne par œuvre, sans BOM', () => {
  assert.deepEqual([...SENSCRITIQUE_HEADER], ['universe', 'title', 'release_date', 'rating', 'is_wishlisted', 'is_recommended', 'is_done'])
  const plan = planSensCritiqueExport({ universe: 'movie', films: [film('a', { title: 'Parasite', year: 2019, rating: 4.5 })] }, AT)
  assert.equal(plan.fileName, 'sylloge-senscritique-films-2026-10-30.csv')
  assert.ok(!plan.contents.startsWith('\uFEFF'))
  assert.ok(plan.contents.endsWith('\r\n'))
  assert.deepEqual(table(plan.contents), [
    ['universe', 'title', 'release_date', 'rating', 'is_wishlisted', 'is_recommended', 'is_done'],
    ['movie', 'Parasite', '2019', '9', 'false', 'false', 'true'],
  ])
})

test('SensCritique : univers film ou série, année en clair, séries sans année laissées vides et comptées', () => {
  const films = planSensCritiqueExport({ universe: 'movie', films: [film('a', { title: 'Aftersun', year: 2022 })] }, AT)
  assert.equal(recordAt(films.contents, 0).universe, 'movie')
  assert.equal(recordAt(films.contents, 0).release_date, '2022')

  const shows = planSensCritiqueExport({ universe: 'tvshow', series: [series('a', { title: 'Severance' }), series('b', { title: 'Fleabag' })] }, AT)
  assert.equal(shows.fileName, 'sylloge-senscritique-series-2026-10-30.csv')
  assert.equal(recordAt(shows.contents, 0).universe, 'tvshow')
  assert.equal(recordAt(shows.contents, 0).release_date, '', 'une série n’a pas d’année dans Sylloge : aucune année inventée')
  assert.equal(shows.report.withoutYear, 2, 'le bilan dit combien de séries partent sans année')
})

test('SensCritique : envie de voir, coup de cœur et vu, trois drapeaux distincts du statut Sylloge', () => {
  const films = planSensCritiqueExport({
    universe: 'movie',
    films: [
      film('a', { status: 'terminé', isFavorite: true }),
      film('b', { status: 'à découvrir' }),
      film('c', { status: 'en attente' }),
      film('d', { status: 'abandonné' }),
    ],
  }, AT)
  const row = index => recordAt(films.contents, index)
  assert.equal(row(0).is_done, 'true')
  assert.equal(row(0).is_recommended, 'true')
  assert.equal(row(1).is_wishlisted, 'true')
  assert.equal(row(1).is_done, 'false')
  assert.equal(row(2).is_wishlisted, 'false', '« en attente » n’est pas la liste d’envies')
  assert.equal(row(2).is_done, 'false')
  assert.equal(row(3).is_done, 'false', 'un film abandonné n’est pas vu')
  assert.equal(films.report.wishlisted, 1)
  assert.equal(films.report.recommended, 1)
  assert.equal(films.report.done, 1)
  assert.equal(films.report.statusNotExpressed, 2, 'en attente et abandonné n’ont pas d’équivalent : comptés')
})

test('SensCritique : statuts de série, dont « en cours » que le schéma ne sait pas dire', () => {
  const plan = planSensCritiqueExport({
    universe: 'tvshow',
    series: [
      series('a', { status: 'vue' }),
      series('b', { status: 'à voir' }),
      series('c', { status: 'en cours' }),
      series('d', { status: 'abandonnée' }),
    ],
  }, AT)
  const row = index => recordAt(plan.contents, index)
  assert.equal(row(0).is_done, 'true')
  assert.equal(row(1).is_wishlisted, 'true')
  assert.equal(row(2).is_done, 'false')
  assert.equal(row(2).is_wishlisted, 'false')
  assert.equal(row(3).is_done, 'false')
  assert.equal(plan.report.statusNotExpressed, 2)
})

test('SensCritique : note entière sur 10, demi-étoile = un point, arrondi documenté au demi-point le plus proche', () => {
  const rating = value => recordAt(planSensCritiqueExport({ universe: 'movie', films: [film('a', { rating: value })] }, AT).contents, 0).rating
  assert.equal(rating(0.5), '1')
  assert.equal(rating(1), '2')
  assert.equal(rating(4.5), '9')
  assert.equal(rating(5), '10')
  assert.equal(rating(null), '')
  assert.equal(rating(0), '')
  assert.equal(rating(5.5), '')
  assert.equal(rating(3.7), '7', '3,7 → 3,5 demi-étoiles → 7')
  assert.equal(rating(3.8), '8', '3,8 → 4 demi-étoiles → 8')

  const { report } = planSensCritiqueExport({
    universe: 'movie',
    films: [film('a', { rating: 4.5 }), film('b', { rating: 3.7 }), film('c', { rating: null })],
  }, AT)
  assert.equal(report.ratingsRounded, 1, 'une seule note a changé à l’arrondi')
  assert.equal(report.withoutRating, 1, 'une note absente reste vide, jamais 0')
})

test('SensCritique : virgules et guillemets protégés, aucun préfixe de protection de tableur', () => {
  const plan = planSensCritiqueExport({
    universe: 'movie',
    films: [
      film('a', { title: 'Paris, Texas' }),
      film('b', { title: "'71" }),
      film('c', { title: '+1' }),
      film('d', { title: 'Un "grand" film' }),
      film('e', { title: 'Ligne\nsuivante' }),
    ],
  }, AT)
  const titles = table(plan.contents).slice(1).map(row => row[1])
  assert.deepEqual([...titles].sort(), ['+1', "'71", 'Ligne\nsuivante', 'Paris, Texas', 'Un "grand" film'].sort(),
    'chaque titre traverse intact, y compris virgule, guillemet et retour à la ligne')
  assert.ok(plan.contents.includes('"Paris, Texas"'))
  assert.ok(plan.contents.includes("'71"), 'une apocalypse de tableur ne doit pas être ajoutée')
  assert.ok(plan.contents.includes('"Un ""grand"" film"'))
})

test('SensCritique : ordre alphabétique stable, et aucun fichier pour une bibliothèque vide', () => {
  const plan = planSensCritiqueExport({
    universe: 'movie',
    films: [film('z', { title: 'Zorro' }), film('a', { title: 'Alien' }), film('m', { title: 'Amélie' })],
  }, AT)
  assert.deepEqual(table(plan.contents).slice(1).map(row => row[1]), ['Alien', 'Amélie', 'Zorro'])
  const empty = planSensCritiqueExport({ universe: 'movie', films: [] }, AT)
  assert.equal(empty.report.exported, 0)
  assert.equal(empty.contents, '', 'aucun fichier à écrire quand il n’y a rien')
})

// ─── Simkl ──────────────────────────────────────────────────────────────────

test('Simkl : en-tête d’import officiel, treize colonnes dans l’ordre', () => {
  assert.deepEqual([...SIMKL_HEADER], [
    'simkl_id', 'TVDB_ID', 'TMDB', 'IMDB_ID', 'MAL_ID', 'Type', 'Title', 'Year',
    'LastEpWatched', 'Watchlist', 'WatchedDate', 'Rating', 'Memo',
  ])
  const plan = planSimklExport({ medium: 'films', films: [film('a', { title: 'Parasite', year: 2019 })] }, AT)
  assert.equal(plan.fileName, 'sylloge-simkl-films-2026-10-30.csv')
  assert.deepEqual(headerOf(plan.contents), [...SIMKL_HEADER])
  assert.ok(plan.contents.endsWith('\r\n'))
})

test('Simkl : un film, Type movie, TMDB transmis, date DD-MM-YYYY, note ×2, avis en Memo', () => {
  const plan = planSimklExport({
    medium: 'films',
    films: [film('a', {
      title: 'Parasite', year: 2019, rating: 4.5, watchedAt: '2026-03-01', status: 'terminé',
      providerName: 'tmdb', providerId: '496243', personalNote: 'Vertigineux',
    })],
  }, AT)
  assert.deepEqual(table(plan.contents)[1], [
    '', '', '496243', '', '', 'movie', 'Parasite', '2019', '', 'completed', '01-03-2026', '9', 'Vertigineux',
  ])
  assert.equal(plan.report.withTmdbId, 1)
})

test('Simkl : les quatre statuts de film et de série seuls mappés, sans invention', () => {
  const films = planSimklExport({
    medium: 'films',
    films: [
      film('a', { status: 'terminé' }),
      film('b', { status: 'à découvrir' }),
      film('c', { status: 'en attente' }),
      film('d', { status: 'abandonné' }),
    ],
  }, AT)
  assert.deepEqual(table(films.contents).slice(1).map(row => row[9]), ['completed', 'plan to watch', 'on hold', 'dropped'])

  const shows = planSimklExport({
    medium: 'series',
    series: [
      series('a', { status: 'vue' }),
      series('b', { status: 'à voir' }),
      series('c', { status: 'en cours' }),
      series('d', { status: 'abandonnée' }),
    ],
  }, AT)
  assert.deepEqual(table(shows.contents).slice(1).map(row => row[9]), ['completed', 'plan to watch', 'watching', 'dropped'])
})

test('Simkl : séries et animés — Type, année vide, identifiant TMDB du lien fournisseur', () => {
  const links = new Map([
    ['s1', { providerName: 'TMDB', providerId: '95396' }],
    ['s2', { providerName: 'TMDB', providerId: 'abc' }],
  ])
  const plan = planSimklExport({
    medium: 'series',
    series: [
      series('s1', { title: 'Severance', status: 'en cours', rating: 4.5 }),
      series('s2', { title: 'The Bear' }),
      series('s3', { title: 'Fleabag' }),
    ],
    providerLinks: links,
  }, AT)
  const rows = table(plan.contents).slice(1)
  assert.deepEqual(rows.map(row => row[5]), ['tv', 'tv', 'tv'])
  assert.deepEqual(rows.map(row => row[6]), ['Fleabag', 'Severance', 'The Bear'])
  assert.deepEqual(rows.map(row => row[2]), ['', '95396', ''], 'un identifiant non numérique n’est pas écrit')
  assert.deepEqual(rows.map(row => row[7]), ['', '', ''], 'Sylloge ne date pas les séries : aucune année inventée')
  assert.deepEqual(rows.map(row => row[10]), ['', '', ''], 'aucune date de visionnage par épisode n’est connue')
  assert.equal(plan.report.withTmdbId, 1)
  assert.equal(plan.report.withoutYear, 3)

  const anime = planSimklExport({
    medium: 'anime',
    anime: [series('a1', { title: 'Cowboy Bebop', category: 'animation', status: 'vue' })],
    providerLinks: new Map([['a1', { providerName: 'TMDB', providerId: '30991' }]]),
  }, AT)
  assert.equal(recordAt(anime.contents, 0).Type, 'anime')
  assert.equal(anime.fileName, 'sylloge-simkl-anime-2026-10-30.csv')
})

test('Simkl : progression jamais écrite en dernier épisode, et le bilan le dit', () => {
  const plan = planSimklExport({
    medium: 'series',
    series: [series('a', { seasonsSeen: 3, seasonsTotal: 4 }), series('b', { seasonsSeen: 1, seasonsTotal: 2 })],
  }, AT)
  const rows = table(plan.contents).slice(1)
  assert.deepEqual(rows.map(row => row[8]), ['', ''], 'LastEpWatched reste vide : Sylloge compte des saisons, pas des épisodes')
  assert.equal(plan.report.progressNotWritten, 2)
})

test('Simkl : note 1 à 10, vide hors barème ; le point décimal n’apparaît jamais', () => {
  const rating = value => recordAt(planSimklExport({ medium: 'films', films: [film('a', { rating: value })] }, AT).contents, 0).Rating
  assert.equal(rating(0.5), '1')
  assert.equal(rating(4.5), '9')
  assert.equal(rating(5), '10')
  assert.equal(rating(null), '')
  assert.equal(rating(0), '')
  assert.equal(rating(7), '')
  assert.equal(rating(4.25), '9', '4,25 → 8,5 → 9 (arrondi au demi-point, puis ×2)')
})

test('Simkl : un avis multiligne reste une seule cellule, protégée', () => {
  const plan = planSimklExport({
    medium: 'films',
    films: [film('a', { title: 'Film, le retour', personalNote: 'Ligne 1\nLigne 2 "citée"' })],
  }, AT)
  const row = table(plan.contents)[1]
  assert.equal(row[6], 'Film, le retour')
  assert.equal(row[12], 'Ligne 1\nLigne 2 "citée"')
  assert.ok(plan.contents.includes('"Ligne 1\nLigne 2 ""citée"""'))
})

// ─── The StoryGraph (format Goodreads) ──────────────────────────────────────

const REQUIRED_STORYGRAPH = ['Title', 'Author', 'My Rating', 'Date Added', 'Exclusive Shelf', 'Read Count']

test('The StoryGraph : en-tête Goodreads complet de 31 colonnes, celles que StoryGraph exige comprises', () => {
  assert.equal(GOODREADS_HEADER.length, 31)
  assert.deepEqual([...GOODREADS_HEADER], [
    'Book Id', 'Title', 'Author', 'Author l-f', 'Additional Authors', 'ISBN', 'ISBN13', 'My Rating', 'Average Rating',
    'Publisher', 'Binding', 'Number of Pages', 'Year Published', 'Original Publication Year', 'Date Read', 'Date Added',
    'Bookshelves', 'Bookshelves with positions', 'Exclusive Shelf', 'My Review', 'Spoiler', 'Private Notes',
    'Read Count', 'Recommended For', 'Recommended By', 'Owned Copies', 'Original Purchase Date',
    'Original Purchase Location', 'Condition', 'Condition Description', 'BCID',
  ])
  for (const column of REQUIRED_STORYGRAPH) assert.ok(GOODREADS_HEADER.includes(column), `colonne obligatoire StoryGraph : ${column}`)
  const plan = planStoryGraphExport({ library: 'books', books: [book('a')] }, AT)
  assert.equal(plan.fileName, 'sylloge-storygraph-livres-2026-10-30.csv')
  assert.deepEqual(headerOf(plan.contents), [...GOODREADS_HEADER])
  assert.ok(plan.contents.endsWith('\r\n'))
})

test('The StoryGraph : étagères read, currently-reading, to-read et did-not-finish', () => {
  const plan = planStoryGraphExport({
    library: 'books',
    books: [
      book('a', { status: 'lu' }),
      book('b', { status: 'en cours' }),
      book('c', { status: 'à lire' }),
      book('d', { status: 'abandonné' }),
    ],
  }, AT)
  assert.deepEqual(table(plan.contents).slice(1).map(row => row[18]), ['read', 'currently-reading', 'to-read', 'did-not-finish'])
  assert.deepEqual(table(plan.contents).slice(1).map(row => row[22]), ['1', '0', '0', '0'], 'Read Count : 1 pour un livre lu, 0 sinon')
})

test('The StoryGraph : date d’ajout au format AAAA/MM/JJ, date de lecture jamais inventée', () => {
  const plan = planStoryGraphExport({ library: 'books', books: [book('a')] }, AT)
  const row = recordAt(plan.contents, 0)
  assert.equal(row['Date Added'], '2026/03/04')
  assert.equal(row['Date Read'], '', 'Sylloge ne date pas la fin de lecture : rien n’est écrit')
})

test('The StoryGraph : note entière 0 à 5, 0 obligatoire quand rien n’est noté, arrondi compté', () => {
  const rating = value => recordAt(planStoryGraphExport({ library: 'books', books: [book('a', { rating: value })] }, AT).contents, 0)['My Rating']
  assert.equal(rating(4.5), '5')
  assert.equal(rating(3.5), '4', 'les demi-points montent')
  assert.equal(rating(0.5), '1')
  assert.equal(rating(5), '5')
  assert.equal(rating(null), '0')
  assert.equal(rating(0), '0')
  assert.equal(rating(8), '0')
  const plan = planStoryGraphExport({ library: 'books', books: [book('a', { rating: 4.5 }), book('b', { rating: 4 }), book('c')] }, AT)
  assert.equal(plan.report.ratingsRounded, 1)
  assert.equal(plan.report.unrated, 1)
})

test('The StoryGraph : ISBN, note moyenne et nom inversé restent vides ; avis conservé', () => {
  const plan = planStoryGraphExport({ library: 'books', books: [book('a', { author: 'Annie Ernaux', personalNote: 'Une mémoire en mouvement.' })] }, AT)
  const row = recordAt(plan.contents, 0)
  for (const column of ['Book Id', 'ISBN', 'ISBN13', 'Author l-f', 'Additional Authors', 'Average Rating']) {
    assert.equal(row[column], '', `${column} n’a pas de source dans Sylloge`)
  }
  assert.equal(row.Author, 'Annie Ernaux')
  assert.equal(row['My Review'], 'Une mémoire en mouvement.')
  assert.equal(row.ISBN, '', 'aucun ISBN : Goodreads refusera ce fichier, StoryGraph non')
})

test('The StoryGraph : favoris et citations comptés comme non transmis', () => {
  const plan = planStoryGraphExport({
    library: 'books',
    books: [book('a', { isFavorite: true, quotes: [{ id: 'q', bookId: 'a', body: 'Passage', position: 0, createdAt: AT }] }), book('b')],
  }, AT)
  assert.equal(plan.report.favoritesNotCarried, 1)
  assert.equal(plan.report.quotesNotCarried, 1)
})

test('The StoryGraph : bibliothèque Mangas, même format, nom de fichier distinct', () => {
  const plan = planStoryGraphExport({ library: 'mangas', books: [book('a', { category: 'manga', title: 'Monster', author: 'Naoki Urasawa' })] }, AT)
  assert.equal(plan.fileName, 'sylloge-storygraph-mangas-2026-10-30.csv')
  assert.deepEqual(headerOf(plan.contents), [...GOODREADS_HEADER])
  assert.equal(recordAt(plan.contents, 0).Title, 'Monster')
})

// ─── Hardcover ──────────────────────────────────────────────────────────────

test('Hardcover : en-tête custom documenté, ordre officiel', () => {
  assert.deepEqual([...HARDCOVER_HEADER], [
    'Title', 'Author', 'Status', 'Privacy', 'Hardcover Book ID', 'Hardcover Edition ID', 'ISBN 10', 'ISBN 13', 'ASIN',
    'Media', 'Country Code', 'Language Code', 'Binding', 'Pages', 'Duration in Seconds', 'Publish Date', 'Publisher',
    'Genres', 'Moods', 'Tags', 'Content Warnings', 'Lists', 'Date Added', 'Date Started', 'Date Finished', 'Rating',
    'Review', 'Review Contains Spoilers',
  ])
  const plan = planHardcoverExport([book('a')], AT)
  assert.equal(plan.fileName, 'sylloge-hardcover-livres-2026-10-30.csv')
  assert.deepEqual(headerOf(plan.contents), [...HARDCOVER_HEADER])
})

test('Hardcover : les quatre états officiels, titre et auteur suffisants sans ISBN', () => {
  const plan = planHardcoverExport([
    book('a', { status: 'lu' }),
    book('b', { status: 'en cours' }),
    book('c', { status: 'à lire' }),
    book('d', { status: 'abandonné' }),
  ], AT)
  assert.deepEqual(table(plan.contents).slice(1).map(row => row[2]), ['Read', 'Currently Reading', 'Want to Read', 'Did Not Finish Read'])
  const row = recordAt(plan.contents, 0)
  assert.equal(row['ISBN 10'], '')
  assert.equal(row['ISBN 13'], '')
  assert.equal(row.Media, 'Book')
  assert.equal(plan.report.withoutIsbn, 4, 'le bilan dit que rien ne porte d’ISBN')
})

test('Hardcover : note 0,5 à 5 par demi-point sans arrondi, vide si non noté', () => {
  const rating = value => recordAt(planHardcoverExport([book('a', { rating: value })], AT).contents, 0).Rating
  assert.equal(rating(0.5), '0.5')
  assert.equal(rating(4.5), '4.5')
  assert.equal(rating(5), '5')
  assert.equal(rating(null), '')
  assert.equal(rating(0), '')
  assert.equal(rating(6), '')
  const plan = planHardcoverExport([book('a', { rating: 4.5 })], AT)
  assert.equal(plan.report.withoutRating, 0)
})

test('Hardcover : dates ISO au jour, début transmis, fin jamais inventée, avis Markdown conservé', () => {
  const plan = planHardcoverExport([book('a', { startedAt: '2026-03-02T18:00:00.000Z', personalNote: 'Un **texte** libre, avec une virgule.' })], AT)
  const row = recordAt(plan.contents, 0)
  assert.equal(row['Date Added'], '2026-03-04')
  assert.equal(row['Date Started'], '2026-03-02')
  assert.equal(row['Date Finished'], '', 'Sylloge ne date pas la fin de lecture')
  assert.equal(row.Review, 'Un **texte** libre, avec une virgule.')
  assert.equal(row['Review Contains Spoilers'], '')
})

test('Hardcover : favoris sans colonne, comptés dans le bilan', () => {
  const plan = planHardcoverExport([book('a', { isFavorite: true }), book('b', { isFavorite: true })], AT)
  assert.equal(plan.report.favoritesNotCarried, 2)
})
