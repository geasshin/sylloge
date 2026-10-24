// Export au format d'import de Letterboxd (CSV). Colonnes officielles :
// https://letterboxd.com/about/importing-data/ — tmdbID, Title, Year, Directors, Rating (0,5 à 5),
// WatchedDate (AAAA-MM-JJ), Review. Deux fichiers distincts côté Letterboxd : les films vus (journal) et
// la liste « à voir » (watchlist). Un film associé à TMDB est reconnu à coup sûr ; les autres par titre.
import assert from 'node:assert/strict'
import test from 'node:test'
import { LETTERBOXD_MAX_BYTES, planLetterboxdExport } from '../src/domain/letterboxdExport.ts'

const film = (id, over = {}) => ({
  id, profileId: 'p', title: `Film ${id}`, originalTitle: null, year: 2020, status: 'terminé', isFavorite: false,
  rating: null, watchedAt: null, personalNote: null, director: null, summary: null, providerName: null, providerId: null,
  posterUrl: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
})
const AT = '2026-10-24T09:00:00.000Z'
const lines = contents => contents.split('\r\n').filter(Boolean)

test('Films vus : en-tête officiel, un film terminé par ligne, fin de ligne CRLF, sans BOM', () => {
  const plan = planLetterboxdExport([film('a', { title: 'Parasite', year: 2019, rating: 4.5, watchedAt: '2026-03-01', director: 'Bong Joon-ho', providerName: 'tmdb', providerId: '496243' })], 'watched', AT)
  assert.equal(plan.parts.length, 1)
  const [part] = plan.parts
  assert.equal(part.fileName, 'sylloge-letterboxd-vus-2026-10-24.csv')
  assert.ok(!part.contents.startsWith('\uFEFF'))
  assert.deepEqual(lines(part.contents), [
    'tmdbID,Title,Year,Directors,Rating,WatchedDate,Review',
    '496243,Parasite,2019,Bong Joon-ho,4.5,2026-03-01,',
  ])
  assert.ok(part.contents.endsWith('\r\n'))
})

test('Seul un film « terminé » est un film vu ; « à découvrir » va à la liste à voir ; les autres sont signalés', () => {
  const films = [film('a'), film('b', { status: 'à découvrir' }), film('c', { status: 'en attente' }), film('d', { status: 'abandonné' })]
  const watched = planLetterboxdExport(films, 'watched', AT)
  assert.equal(watched.report.exported, 1)
  assert.equal(watched.report.skippedOtherStatus, 3, 'à découvrir, en attente et abandonné ne sont pas des films vus')
  const watchlist = planLetterboxdExport(films, 'watchlist', AT)
  assert.equal(watchlist.report.exported, 1)
  assert.equal(watchlist.report.skippedOtherStatus, 3)
  assert.equal(watchlist.parts[0].fileName, 'sylloge-letterboxd-a-voir-2026-10-24.csv')
  assert.equal(lines(watchlist.parts[0].contents)[0], 'tmdbID,Title,Year,Directors', 'la liste à voir n’a ni note, ni date, ni avis')
})

test('Seul un identifiant TMDB numérique est transmis ; sinon la colonne reste vide (reconnaissance par titre)', () => {
  const rows = lines(planLetterboxdExport([
    film('a', { providerName: 'tmdb', providerId: '860' }),
    film('b', { providerName: 'imdb', providerId: 'tt0086567' }),
    film('c', { providerName: 'tmdb', providerId: 'abc' }),
    film('d'),
  ], 'watched', AT).parts[0].contents).slice(1)
  assert.deepEqual(rows.map(row => row.split(',')[0]), ['860', '', '', ''])
  const { report } = planLetterboxdExport([film('a', { providerName: 'tmdb', providerId: '860' }), film('b')], 'watched', AT)
  assert.equal(report.withTmdbId, 1)
  assert.equal(report.matchedByTitleOnly, 1)
})

test('La note n’est transmise que si elle est valide (0,5 à 5 par demi-point) ; le point décimal est un point', () => {
  const rating = value => lines(planLetterboxdExport([film('a', { rating: value })], 'watched', AT).parts[0].contents)[1].split(',')[4]
  assert.equal(rating(0.5), '0.5')
  assert.equal(rating(3), '3')
  assert.equal(rating(5), '5')
  assert.equal(rating(null), '')
  assert.equal(rating(0), '', '0 n’est pas une note Letterboxd')
  assert.equal(rating(5.5), '')
  assert.equal(rating(3.3), '')
})

test('La date de visionnage est tronquée au jour ; une date illisible est omise et comptée', () => {
  const date = value => lines(planLetterboxdExport([film('a', { watchedAt: value })], 'watched', AT).parts[0].contents)[1].split(',')[5]
  assert.equal(date('2026-03-01'), '2026-03-01')
  assert.equal(date('2026-03-01T22:30:00.000Z'), '2026-03-01')
  assert.equal(date(null), '')
  assert.equal(date('hier'), '')
  assert.equal(date('2026-13-45'), '')
  const { report } = planLetterboxdExport([film('a', { watchedAt: '2026-03-01' }), film('b'), film('c', { watchedAt: 'hier' })], 'watched', AT)
  assert.equal(report.withoutDate, 2, 'vus sans date exploitable : marqués vus, sans entrée de journal')
})

test('Les virgules, guillemets et retours à la ligne sont protégés ; aucun préfixe de protection de tableur', () => {
  const contents = planLetterboxdExport([
    film('a', { title: 'Paris, Texas', year: 1984, director: 'Wim Wenders, Sam Shepard', watchedAt: '2026-01-02' }),
    film('b', { title: '\'71', year: 2014 }),
    film('c', { title: '+1', year: 2013 }),
    film('d', { title: '=Test', year: 2000 }),
    film('e', { title: 'Un "grand" film', year: 2001 }),
  ], 'watched', AT).parts[0].contents
  const body = lines(contents).slice(1)
  assert.ok(body.includes(',"Paris, Texas",1984,"Wim Wenders, Sam Shepard",,2026-01-02,'))
  assert.ok(body.includes(",'71,2014,,,,"), 'le titre commençant par une apostrophe n’est pas modifié')
  assert.ok(body.includes(',+1,2013,,,,'))
  assert.ok(body.includes(',=Test,2000,,,,'))
  assert.ok(body.includes(',"Un ""grand"" film",2001,,,,'))
})

test('L’avis : texte HTML échappé, retours à la ligne conservés dans la cellule', () => {
  const review = note => {
    const contents = planLetterboxdExport([film('a', { personalNote: note, watchedAt: '2026-02-02' })], 'watched', AT).parts[0].contents
    return contents.slice(contents.indexOf('\r\n') + 2).replace(/\r\n$/, '')
  }
  assert.equal(review('Superbe'), ',Film a,2020,,,2026-02-02,Superbe')
  assert.equal(review('A & B <3'), ',Film a,2020,,,2026-02-02,A &amp; B &lt;3')
  assert.equal(review('Ligne 1\n\nLigne 2'), ',Film a,2020,,,2026-02-02,"Ligne 1\n\nLigne 2"')
  assert.equal(review('  '), ',Film a,2020,,,2026-02-02,', 'un avis vide est omis')
})

test('Les favoris et les titres sans année sont comptés dans le bilan', () => {
  const { report } = planLetterboxdExport([film('a', { isFavorite: true }), film('b', { year: null }), film('c')], 'watched', AT)
  assert.equal(report.favoritesNotCarried, 1, 'Letterboxd n’a pas de colonne « favori » dans son import')
  assert.equal(report.withoutYear, 1)
  assert.equal(lines(planLetterboxdExport([film('b', { year: null })], 'watched', AT).parts[0].contents)[1], ',Film b,,,,,')
})

test('Ordre : par date de visionnage puis par titre, sans date en dernier', () => {
  const titles = planLetterboxdExport([
    film('z', { title: 'Zorro' }), film('a', { title: 'Alien', watchedAt: '2026-05-01' }), film('b', { title: 'Brazil', watchedAt: '2026-01-01' }), film('c', { title: 'Amélie', watchedAt: '2026-05-01' }),
  ], 'watched', AT).parts[0].contents
  assert.deepEqual(lines(titles).slice(1).map(row => row.split(',')[1]), ['Brazil', 'Alien', 'Amélie', 'Zorro'])
})

test('Au-delà de 1 Mo, le fichier est coupé en parties qui répètent toutes l’en-tête ; aucune ligne n’est perdue', () => {
  const films = Array.from({ length: 6000 }, (_, i) => film(`f${i}`, { title: `Film numéro ${String(i).padStart(5, '0')} ${'x'.repeat(120)}`, personalNote: 'avis '.repeat(20), watchedAt: '2026-01-01' }))
  const plan = planLetterboxdExport(films, 'watched', AT)
  assert.ok(plan.parts.length >= 2, `plusieurs parties (${plan.parts.length})`)
  let rows = 0
  plan.parts.forEach((part, index) => {
    assert.ok(new TextEncoder().encode(part.contents).length <= LETTERBOXD_MAX_BYTES, `partie ${index + 1} sous la limite`)
    assert.ok(part.contents.startsWith('tmdbID,Title,Year,Directors,Rating,WatchedDate,Review\r\n'), 'en-tête répété')
    assert.match(part.fileName, new RegExp(`-${index + 1}\\.csv$`))
    rows += lines(part.contents).length - 1
  })
  assert.equal(rows, 6000)
  assert.equal(plan.report.exported, 6000)
})

test('Aucun film exportable : une seule partie réduite à l’en-tête, et le bilan le dit', () => {
  const plan = planLetterboxdExport([film('a', { status: 'à découvrir' })], 'watched', AT)
  assert.equal(plan.report.exported, 0)
  assert.equal(plan.parts.length, 0, 'aucun fichier à écrire')
})
