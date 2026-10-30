import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const fixture = (name) => readFileSync(new URL(`../fixtures/imports/${name}`, import.meta.url), 'utf8')
const importedAt = '2026-01-02T03:04:05.000Z'

async function engine() {
  return import('../src/domain/thirdPartyImport.ts')
}

test('IMDb: recognition by const, rating and title-type columns, never by a filename', async () => {
  const { recognizeThirdPartyImport } = await engine()
  const source = { name: 'export-renamed.txt', contents: fixture('imdb-ratings.csv') }
  const recognized = recognizeThirdPartyImport(source)
  assert.equal(recognized?.service, 'imdb')
  assert.equal(recognized.variant, 'ratings')
  assert.equal(recognized.library, 'films')
  assert.deepEqual(recognized.libraries, ['films', 'series'])
  assert.ok(recognized.mapping.some((entry) => entry.field === 'title' && entry.column === 'Title'))
  assert.ok(recognized.mapping.some((entry) => entry.field === 'rating' && entry.column === 'You rated'))
  for (const contents of [
    'const,Title,Title type\n"tt9900001",Film,Feature Film\n',
    'const,You rated,Title type\n"tt9900001",8,Feature Film\n',
    'Title,Rating\nFilm,4\n',
    'const,Title,Year\n"tt9900001",Film,2014\n',
  ]) {
    assert.equal(recognizeThirdPartyImport({ name: 'ratings.csv', contents }), null, contents)
  }
})

test('IMDb: films are prepared on /5 while series and episodes are counted and named', async () => {
  const { previewThirdPartyImport } = await engine()
  const preview = previewThirdPartyImport({ name: 'ratings.csv', contents: fixture('imdb-ratings.csv') }, 'films', importedAt)
  assert.deepEqual(preview.errors, [])
  assert.equal(preview.totalItemCount, 2)
  assert.equal(preview.validItemCount, 2)
  assert.deepEqual(preview.items.map((item) => item.title), ['Film fictif IMDb, l’aube', 'Téléfilm fictif IMDb'])
  assert.deepEqual(preview.items.map((item) => item.rating), [4, 3])
  assert.deepEqual(preview.items.map((item) => item.status), ['terminé', 'terminé'])
  assert.equal(preview.items[0].watchedAt, null, 'The IMDb created date is a rating date, not a viewing date')
  assert.equal(preview.items[0].year, null, 'Films metadata stays out of the existing Films import contract')
  assert.equal(preview.items[0].director, null)
  assert.ok(preview.warnings.some((warning) => warning.code === 'rating-date-not-watched'))
  assert.ok(preview.warnings.some((warning) => warning.code === 'skipped-other-medium' && /1 série ignorée/u.test(warning.message) && /Séries/u.test(warning.message)))
  assert.ok(preview.warnings.some((warning) => warning.code === 'skipped-episodes' && /1 épisode ignoré/u.test(warning.message)))
  assert.ok(preview.ignoredColumns.includes('created'))
  assert.ok(preview.ignoredColumns.includes('Year'))

  const series = previewThirdPartyImport({ name: 'ratings.csv', contents: fixture('imdb-ratings.csv') }, 'series', importedAt)
  assert.deepEqual(series.errors, [])
  assert.equal(series.items.length, 1)
  assert.equal(series.items[0].title, 'Série fictive IMDb')
  assert.equal(series.items[0].rating, 3.5)
  assert.equal(series.items[0].status, 'vue')
  assert.equal(series.items[0].category, 'série télé')
  assert.equal(series.items[0].seasonsSeen, null)
  assert.ok(series.warnings.some((warning) => warning.code === 'skipped-other-medium' && /2 films ignorés/u.test(warning.message)))

  const watchlist = previewThirdPartyImport({ name: 'watchlist.csv', contents: fixture('imdb-watchlist.csv') }, 'films', importedAt)
  assert.equal(watchlist.variant, 'watchlist')
  assert.deepEqual(watchlist.items.map((item) => item.status), ['à découvrir'])
  assert.deepEqual(watchlist.items.map((item) => item.rating), [null])
  assert.ok(watchlist.warnings.some((warning) => warning.code === 'skipped-other-medium' && /1 série ignorée/u.test(warning.message)))

  const camelCaseType = previewThirdPartyImport({
    name: 'ratings.csv',
    contents: 'Const,Title,Title Type,Your Rating\n"tt9900099",Série fictive camelCase,tvSeries,8\n',
  }, 'series', importedAt)
  assert.equal(camelCaseType.items[0].title, 'Série fictive camelCase')
  assert.equal(camelCaseType.items[0].rating, 4)
})

test('IMDb: a recognized export blocks in an unrelated library and invalid ratings block the whole file', async () => {
  const { previewThirdPartyImport } = await engine()
  const wrong = previewThirdPartyImport({ name: 'ratings.csv', contents: fixture('imdb-ratings.csv') }, 'anime', importedAt)
  assert.equal(wrong.items, null)
  assert.match(wrong.errors[0].message, /IMDb.*Films et des Séries/u)

  for (const invalid of ['11', '0', '4.5', 'garbage']) {
    const contents = fixture('imdb-ratings.csv').replace(',"8","7.9"', `,"${invalid}","7.9"`)
    const preview = previewThirdPartyImport({ name: 'ratings.csv', contents }, 'films', importedAt)
    assert.equal(preview.items, null, `Invalid IMDb rating ${invalid} must block the file`)
    assert.ok(preview.errors.some((error) => /note/iu.test(error.message)))
  }
})

test('The StoryGraph: Goodreads columns without Book Id, did-not-finish becomes abandoned', async () => {
  const { recognizeThirdPartyImport, previewThirdPartyImport } = await engine()
  const source = { name: 'storygraph-export.csv', contents: fixture('storygraph-export.csv') }
  const recognized = recognizeThirdPartyImport(source)
  assert.equal(recognized?.service, 'storygraph')
  assert.equal(recognized.library, 'books')
  const preview = previewThirdPartyImport(source, 'books', importedAt)
  assert.deepEqual(preview.errors, [])
  assert.deepEqual(preview.items.map((item) => item.title), [
    'Livre fictif StoryGraph, le départ',
    'Livre fictif abandonné',
    'Livre fictif en cours',
    'Livre fictif à lire',
  ])
  assert.deepEqual(preview.items.map((item) => item.status), ['lu', 'abandonné', 'en cours', 'à lire'])
  assert.deepEqual(preview.items.map((item) => item.rating), [4, null, null, null])
  assert.equal(preview.items[0].personalNote, '  Avis fictif StoryGraph, avec "guillemets".  ')
  assert.equal(preview.items[0].startedAt, null)

  const goodreads = { name: 'goodreads_library_export.csv', contents: 'Book Id,Title,Author,My Rating,Exclusive Shelf\n900009,Livre,Auteur,4,read\n' }
  assert.equal(recognizeThirdPartyImport(goodreads)?.service, 'goodreads', 'Book Id keeps a Goodreads export distinct')
  const wrong = previewThirdPartyImport(source, 'mangas', importedAt)
  assert.equal(wrong.items, null)
  assert.match(wrong.errors[0].message, /StoryGraph.*Livres/u)
})

test('Simkl: merges only the target medium and maps statuses, ratings and memo', async () => {
  const { recognizeThirdPartyImport, previewThirdPartyImport } = await engine()
  const source = { name: 'import-data.csv', contents: fixture('simkl-export.csv') }
  assert.equal(recognizeThirdPartyImport(source)?.service, 'simkl')
  assert.deepEqual(recognizeThirdPartyImport(source).libraries, ['films', 'series', 'anime'])

  const films = previewThirdPartyImport(source, 'films', importedAt)
  assert.deepEqual(films.errors, [])
  assert.deepEqual(films.items.map((item) => item.title), ['Film fictif Simkl', 'Film fictif à voir Simkl'])
  assert.deepEqual(films.items.map((item) => item.status), ['terminé', 'à découvrir'])
  assert.deepEqual(films.items.map((item) => item.rating), [4, null])
  assert.equal(films.items[0].watchedAt, '2024-03-06', 'DD-MM-YYYY is the documented Simkl date order')
  assert.equal(films.items[0].personalNote, '  Avis fictif Simkl, avec "guillemets".  ')
  assert.ok(films.warnings.some((warning) => /2 séries ignorées/u.test(warning.message)))
  assert.ok(films.warnings.some((warning) => /1 animation japonaise ignorée/u.test(warning.message)))

  const series = previewThirdPartyImport(source, 'series', importedAt)
  assert.deepEqual(series.items.map((item) => item.status), ['en cours', 'abandonnée'])
  assert.deepEqual(series.items.map((item) => item.rating), [3.5, null])
  assert.ok(series.warnings.some((warning) => warning.code === 'progress-not-imported'))
  assert.ok(series.warnings.some((warning) => warning.code === 'watched-date-not-started'))

  const anime = previewThirdPartyImport(source, 'anime', importedAt)
  assert.equal(anime.items.length, 1)
  assert.equal(anime.items[0].status, 'en cours')
  assert.equal(anime.items[0].rating, 4.5)
  assert.equal(anime.items[0].category, 'animation')
  assert.ok(anime.warnings.some((warning) => warning.code === 'on-hold-as-in-progress'))

  const wrong = previewThirdPartyImport(source, 'books', importedAt)
  assert.equal(wrong.items, null)
  assert.match(wrong.errors[0].message, /Simkl.*Films.*Séries.*Animation japonaise/u)

  const invalid = previewThirdPartyImport({ name: 'import-data.csv', contents: fixture('simkl-export.csv').replace('watching', 'finished') }, 'series', importedAt)
  assert.equal(invalid.items, null)
  assert.ok(invalid.errors.some((error) => /statut/iu.test(error.message)))
})

test('Hardcover: the documented custom CSV maps books, ratings, start date and review', async () => {
  const { recognizeThirdPartyImport, previewThirdPartyImport } = await engine()
  const source = { name: 'hardcover.csv', contents: fixture('hardcover-export.csv') }
  const recognized = recognizeThirdPartyImport(source)
  assert.equal(recognized?.service, 'hardcover')
  assert.equal(recognized.library, 'books')
  const preview = previewThirdPartyImport(source, 'books', importedAt)
  assert.deepEqual(preview.errors, [])
  assert.deepEqual(preview.items.map((item) => item.status), ['lu', 'en cours', 'abandonné', 'à lire'])
  assert.deepEqual(preview.items.map((item) => item.rating), [4.5, null, 2, null])
  assert.equal(preview.items[0].startedAt, '2024-01-02')
  assert.equal(preview.items[0].year, 2019)
  assert.equal(preview.items[0].personalNote, '  Avis fictif Hardcover.  ')
  assert.ok(preview.ignoredColumns.includes('Date Finished'))
  assert.ok(preview.ignoredColumns.includes('Date Added'))

  const none = previewThirdPartyImport({
    name: 'hardcover.csv',
    contents: 'Title,Author,Status,Rating,Hardcover Book ID\nLivre fictif,Auteur fictif,None,,42\n',
  }, 'books', importedAt)
  assert.equal(none.items, null)
  assert.ok(none.errors.some((error) => /Statut|None/u.test(error.message)))

  const wrong = previewThirdPartyImport(source, 'films', importedAt)
  assert.equal(wrong.items, null)
  assert.match(wrong.errors[0].message, /Hardcover.*Livres/u)
  assert.equal(recognizeThirdPartyImport({ name: 'x.csv', contents: 'Title,Author,Rating\nLivre,Auteur,4\n' }), null)
})

test('MyAnimeList XML: anime statuses, half-point scores, start dates and comments', async () => {
  const { recognizeThirdPartyImport, previewThirdPartyImport } = await engine()
  const source = { name: 'fiction-2026-10-30.xml', contents: fixture('myanimelist-anime.xml') }
  const recognized = recognizeThirdPartyImport(source)
  assert.equal(recognized?.service, 'myanimelist')
  assert.equal(recognized.variant, 'xml-anime')
  assert.equal(recognized.library, 'anime')
  const preview = previewThirdPartyImport(source, 'anime', importedAt)
  assert.deepEqual(preview.errors, [])
  assert.equal(preview.items.length, 5)
  assert.deepEqual(preview.items.map((item) => item.status), ['vue', 'en cours', 'en cours', 'abandonnée', 'à voir'])
  assert.deepEqual(preview.items.map((item) => item.rating), [4, null, 3.5, 3, null])
  assert.deepEqual(preview.items.map((item) => item.startedAt), ['2024-01-05', '2024-04-01', null, '2023-09-01', null])
  assert.equal(preview.items[0].title, 'Animé fictif & compagnie')
  assert.equal(preview.items[0].personalNote, '  Avis fictif, avec "guillemets".  ')
  assert.equal(preview.items[0].category, 'animation')
  assert.equal(preview.items[0].seasonsSeen, null)
  assert.ok(preview.warnings.some((warning) => warning.code === 'progress-not-imported'))
  assert.ok(preview.warnings.some((warning) => warning.code === 'finish-date-not-stored'))

  const manga = previewThirdPartyImport({ name: 'manga.xml', contents: fixture('myanimelist-manga.xml') }, 'mangas', importedAt)
  assert.deepEqual(manga.errors, [])
  assert.deepEqual(manga.items.map((item) => item.status), ['lu', 'en cours'])
  assert.deepEqual(manga.items.map((item) => item.rating), [4.5, null])
  assert.equal(manga.items[0].category, 'manga')
  assert.equal(manga.items[0].volumesRead, null, 'A completed manga has no stored total: no invented total')
  assert.equal(manga.items[1].volumesRead, 3)
  assert.equal(manga.items[1].startedAt, '2024-05-06')

  const wrong = previewThirdPartyImport(source, 'mangas', importedAt)
  assert.equal(wrong.items, null)
  assert.match(wrong.errors[0].message, /MyAnimeList.*Animation japonaise/u)
})

test('MyAnimeList XML: malformed, external-entity and unknown-status files are blocked', async () => {
  const { recognizeThirdPartyImport, previewThirdPartyImport } = await engine()
  assert.equal(recognizeThirdPartyImport({ name: 'rss.xml', contents: '<?xml version="1.0"?><rss><channel/></rss>' }), null)
  const doctype = '<?xml version="1.0"?><!DOCTYPE myanimelist [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><myanimelist><anime><series_title>&xxe;</series_title><my_status>Completed</my_status></anime></myanimelist>'
  const doctypePreview = previewThirdPartyImport({ name: 'list.xml', contents: doctype }, 'anime', importedAt)
  assert.equal(doctypePreview.items, null)
  assert.ok(doctypePreview.errors.some((error) => /DOCTYPE|entités/u.test(error.message)))

  for (const contents of [
    '<myanimelist><anime><series_title>Animé fictif</anime></myanimelist>',
    '<myanimelist><anime><series_title>Animé fictif</series_title><my_status>Unknown</my_status></anime></myanimelist>',
    '<myanimelist><anime><series_title></series_title><my_status>Completed</my_status></anime></myanimelist>',
    '<myanimelist><anime><series_title>&#x110000;</series_title><my_status>Completed</my_status></anime></myanimelist>',
    '<myanimelist></myanimelist>',
  ]) {
    const preview = previewThirdPartyImport({ name: 'list.xml', contents }, 'anime', importedAt)
    assert.equal(preview.items, null, contents)
    assert.ok(preview.errors.length > 0, contents)
  }
})
