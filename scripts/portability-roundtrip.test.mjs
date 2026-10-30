import assert from 'node:assert/strict'
import test from 'node:test'
import { createCollectionCsvExport } from '../src/domain/collectionCsvTransfer.ts'
import { prepareCollectionCsvImport, previewCollectionCsvImport } from '../src/domain/collectionCsvImport.ts'
import { createLibraryDocument, serializeLibraryDocument, validateLibraryDocument } from '../src/domain/libraryDocument.ts'
import { prepareFilmCsvImport, previewFilmCsvImport } from '../src/domain/filmCsvImport.ts'
import { parseCsv } from '../src/domain/csv.ts'

const timestamp = '2026-10-22T08:00:00.000Z'
const text = '\t=Texte,\r\n"accentué 日本語"  '
const profile = { id: 'profile-fixture', name: "'Profil", createdAt: timestamp, updatedAt: timestamp }
const identity = (id) => ({ id, profileId: profile.id, title: text, createdAt: timestamp, updatedAt: timestamp })
const series = (id, category = 'série télé') => ({
  ...identity(id), showrunner: text, casting: text, summary: text, category,
  status: 'à voir', rating: 0.5, isFavorite: true, seasonsSeen: 0, seasonsTotal: 12,
  progressUpdatedAt: timestamp, startedAt: '2026-10-01', posterUrl: 'https://example.test/image.jpg',
  bannerUrl: 'https://example.test/banner.jpg', firstAirYear: 2017, lastAirYear: 2020, personalNote: text,
})
const book = (id, category = 'livre') => ({
  ...identity(id), author: text, year: 2024, summary: text, category, status: 'à lire',
  rating: 4.5, isFavorite: true, volumesRead: 0, volumesTotal: 12, progressUpdatedAt: timestamp,
  startedAt: '2026-10-01', coverUrl: 'https://example.test/cover.jpg', personalNote: text,
  quotes: [{ id: `${id}-quote`, bookId: id, body: text, position: 0, createdAt: timestamp }],
})
const library = {
  profile,
  films: [{ ...identity('film'), originalTitle: text, year: 2024, status: 'en attente', isFavorite: true,
    rating: 4.5, watchedAt: '2026-10-01', personalNote: text, director: text, summary: text,
    providerName: text, providerId: text, posterUrl: 'https://example.test/film.jpg',
    bannerUrl: 'https://example.test/film-banner.jpg' }],
  series: [series('series')], anime: [series('anime', 'animation')],
  books: [book('book')], mangas: [book('manga', 'manga')],
  games: [{ ...identity('game'), developer: text, platform: text, year: 2024, status: 'à jouer',
    rating: 0.5, isFavorite: true, playedAt: '2026-10-01', coverUrl: 'https://example.test/game.jpg',
    bannerUrl: 'https://example.test/game-banner.jpg', personalNote: text }],
  artworks: [{ ...identity('artwork'), artist: text, year: 2024, form: 'peinture', location: text,
    exhibition: text, status: 'à découvrir', isFavorite: true, discoveredAt: '2026-10-01',
    imageUrl: 'https://example.test/art.jpg', personalNote: text, customFields: [{ name: 'Technique', value: text }], details: { text: 'Vers un\n\n    Vers deux', collection: 'Recueil 日本語' } }],
}

function importCsv(kind, contents) {
  if (kind === 'films') {
    const session = prepareFilmCsvImport({ name: 'fixture.csv', kind: 'csv', markdownPages: [], csvCandidates: [{ id: 'csv-0', name: 'fixture.csv', contents }] })
    const result = previewFilmCsvImport(session, null)
    assert.deepEqual(result.errors, [])
    return result.document?.films
  }
  const result = previewCollectionCsvImport(prepareCollectionCsvImport(kind, contents), {})
  assert.deepEqual(result.errors, [])
  return result.items
}

function represented(item, kind) {
  const result = { ...item }
  // Les identités locales sont recréées à l’écriture ; le CSV ne promet que
  // le texte et l’ordre des citations, pas leurs identifiants/horodatages.
  delete result.id
  delete result.profileId
  if (kind === 'books' || kind === 'mangas') result.quotes = result.quotes.map((quote) => quote.body)
  // Art CSV v1 ne possède ni colonne de champs libres ni champs de forme ;
  // JSON les conserve.
  if (kind === 'artworks') {
    delete result.customFields
    delete result.details
  }
  // Le CSV ne porte ni la bannière 16:9 (v7) ni la période de diffusion (v8) :
  // elles ne voyagent que par la sauvegarde JSON.
  if ('bannerUrl' in result) delete result.bannerUrl
  if ('firstAirYear' in result) delete result.firstAirYear
  if ('lastAirYear' in result) delete result.lastAirYear
  return result
}

test('le CSV Sylloge strict restitue les textes et données personnelles d’une série sans passer par la purge du formulaire', () => {
  const csv = createCollectionCsvExport(library, 'series', timestamp)
  const items = importCsv('series', csv.contents)
  assert.deepEqual(items?.map((item) => represented(item, 'series')), library.series.map((item) => represented(item, 'series')))
})

for (const kind of Object.keys(library).filter((key) => key !== 'profile')) {
  test(`roundtrip CSV ${kind} : tous les champs représentables, Unicode, CRLF, guillemets et apostrophes`, () => {
    const csv = createCollectionCsvExport(library, kind, timestamp)
    assert.equal(csv.count, 1)
    assert.ok(csv.contents.endsWith('\r\n'))
    assert.deepEqual(importCsv(kind, csv.contents)?.map((item) => represented(item, kind)), library[kind].map((item) => represented(item, kind)))
  })
  test(`CSV ${kind} vide : aucune fiche inventée`, () => {
    const empty = { ...library, [kind]: [] }
    const csv = createCollectionCsvExport(empty, kind, timestamp)
    assert.equal(csv.count, 0)
    assert.deepEqual(importCsv(kind, csv.contents), [])
  })
  test(`formules tableur ${kind} : protection réversible y compris préfixes de contrôle`, () => {
    const unsafe = ['=1+1', '+SUM(A1:A2)', '-1+1', '@SUM(A1:A2)', "'=1+1", '\t=1+1', '\u0000=1+1', ' \r\n@SUM(A1:A2)']
    const prefix = { films: 'film', series: 'series', anime: 'anime', books: 'book', mangas: 'manga', games: 'game', artworks: 'artwork' }[kind]
    for (const title of unsafe) {
      const source = { ...library, [kind]: [{ ...library[kind][0], title }] }
      const csv = createCollectionCsvExport(source, kind, timestamp)
      const table = parseCsv(csv.contents)
      assert.equal(table.rows[0].cells[table.headers.indexOf(`${prefix}_title`)], `'${title}`)
      assert.equal(importCsv(kind, csv.contents)?.[0].title, title)
    }
  })
}

function rewriteCsv(contents, mutate) {
  const table = parseCsv(contents)
  const rows = table.rows.map((row) => [...row.cells])
  mutate(table.headers, rows)
  return [table.headers, ...rows].map((row) => row.map((value) => /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join(',')).join('\r\n') + '\r\n'
}

test('un CSV Sylloge vide doit encore valider les métadonnées avant d’autoriser Remplacer', () => {
  const csv = createCollectionCsvExport({ ...library, series: [] }, 'series', timestamp)
  const contents = rewriteCsv(csv.contents, (headers, rows) => { rows[0][headers.indexOf('profile_name')] = '' })
  const result = previewCollectionCsvImport(prepareCollectionCsvImport('series', contents), {})
  assert.equal(result.items, null)
  assert.ok(result.errors.length > 0)
})

test('un CSV Sylloge ne mélange pas les métadonnées de plusieurs profils', () => {
  const source = { ...library, series: [series('series-1'), series('series-2')] }
  const csv = createCollectionCsvExport(source, 'series', timestamp)
  const contents = rewriteCsv(csv.contents, (headers, rows) => { rows[1][headers.indexOf('profile_name')] = 'Autre profil' })
  const result = previewCollectionCsvImport(prepareCollectionCsvImport('series', contents), {})
  assert.equal(result.items, null)
  assert.ok(result.errors.some((error) => error.path.startsWith('Ligne ')))
})

for (const [kind, column, category] of [['series', 'series_category', 'animation'], ['books', 'book_category', 'manga']]) {
  test(`CSV ${kind} historique : la catégorie séparée reste lisible sans perte`, () => {
    const csv = createCollectionCsvExport(library, kind, timestamp)
    const contents = rewriteCsv(csv.contents, (headers, rows) => { rows[0][headers.indexOf(column)] = category })
    const items = importCsv(kind, contents)
    assert.equal(items?.[0].category, category)
    assert.equal(items?.[0].personalNote, text)
  })
}

for (const [kind, column, invalid] of [
  ['series', 'series_status', 'inconnu'], ['anime', 'anime_is_favorite', 'peut-être'],
  ['books', 'book_quotes_json', 'pas du JSON'], ['mangas', 'manga_volumes_read', '12.5'],
  ['games', 'game_rating', '6'], ['artworks', 'artwork_discovered_at', '2026-02-30'],
]) {
  test(`CSV strict ${kind} : une ligne invalide bloque le fichier entier`, () => {
    const source = { ...library, [kind]: [library[kind][0], { ...library[kind][0], id: `${kind}-second` }] }
    const csv = createCollectionCsvExport(source, kind, timestamp)
    const contents = rewriteCsv(csv.contents, (headers, rows) => { rows[1][headers.indexOf(column)] = invalid })
    const result = previewCollectionCsvImport(prepareCollectionCsvImport(kind, contents), {})
    assert.equal(result.items, null)
    assert.equal(result.validItemCount, 1)
    assert.ok(result.errors.length > 0)
  })
}

const customEntry = (id, details, quotes = []) => ({
  ...identity(id), creator: text, year: 2024, status: 'en cours', rating: 3.5, isFavorite: true,
  progressCurrent: 3, progressTotal: 11, progressUpdatedAt: timestamp, startedAt: '2026-10-01', finishedAt: '2026-10-20',
  coverUrl: 'https://example.test/custom.jpg', summary: text, personalNote: text, details, quotes,
})
const customLibraries = [
  { libraryId: 'comics', position: 0, addedAt: timestamp, entries: [customEntry('comic', { format: 'Comics', artist: text, 'Champ importé': text }, [
    { id: 'comic-quote-0', entryId: 'comic', body: text, position: 0, createdAt: timestamp },
    { id: 'comic-quote-1', entryId: 'comic', body: `${text}2`, position: 1, createdAt: timestamp },
  ])] },
  { libraryId: 'board_games', position: 1, addedAt: timestamp, entries: [customEntry('board', { players: '2 à 4' })] },
  // Une bibliothèque ajoutée mais vide survit aussi à la sauvegarde.
  { libraryId: 'shows', position: 2, addedAt: timestamp, entries: [] },
]

test('JSON v5 : les sept bibliothèques, les bibliothèques personnalisées et chaque champ personnel restent identiques', () => {
  const document = createLibraryDocument({ ...library, customLibraries }, timestamp)
  assert.equal(document.version, 8)
  const result = validateLibraryDocument(serializeLibraryDocument(document))
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.document, document)
  assert.deepEqual(result.document.customLibraries, customLibraries)
  assert.deepEqual(result.counts, { films: 1, series: 1, anime: 1, books: 1, mangas: 1, games: 1, artworks: 1, custom: 2 })
})

test('JSON v8 : la bannière 16:9 et la période de diffusion survivent à l’aller-retour, et les livres n’en portent pas', () => {
  const document = createLibraryDocument(library, timestamp)
  assert.equal(document.version, 8)
  const result = validateLibraryDocument(serializeLibraryDocument(document))
  assert.deepEqual(result.errors, [])
  assert.equal(result.document?.films[0].bannerUrl, 'https://example.test/film-banner.jpg')
  assert.equal(result.document?.series[0].bannerUrl, 'https://example.test/banner.jpg')
  assert.equal(result.document?.anime[0].bannerUrl, 'https://example.test/banner.jpg')
  assert.equal(result.document?.games[0].bannerUrl, 'https://example.test/game-banner.jpg')
  assert.equal(result.document?.series[0].firstAirYear, 2017)
  assert.equal(result.document?.series[0].lastAirYear, 2020)
  assert.equal(result.document?.anime[0].firstAirYear, 2017)
  assert.equal(result.document?.anime[0].lastAirYear, 2020)
  assert.equal('bannerUrl' in (result.document?.books[0] ?? {}), false, 'un livre ne porte pas de bannière')
  assert.equal('bannerUrl' in (result.document?.artworks[0] ?? {}), false, 'une œuvre ne porte pas de bannière')
  assert.equal('firstAirYear' in (result.document?.films[0] ?? {}), false, 'un film ne porte pas de période de diffusion')
  assert.equal('lastAirYear' in (result.document?.books[0] ?? {}), false, 'un livre ne porte pas de période de diffusion')
})

test('JSON v7 : un document sans période de diffusion reste lisible, chaque série reçoit null', () => {
  const current = createLibraryDocument(library, timestamp)
  const legacy = { ...current, version: 7 }
  for (const section of ['series', 'anime']) {
    legacy[section] = legacy[section].map(({ firstAirYear: _first, lastAirYear: _last, ...entry }) => entry)
  }
  const result = validateLibraryDocument(JSON.stringify(legacy))
  assert.deepEqual(result.errors, [])
  assert.equal(result.document?.series[0].firstAirYear, null)
  assert.equal(result.document?.series[0].lastAirYear, null)
  assert.equal(result.document?.anime[0].firstAirYear, null)
  // La bannière, elle, reste portée : elle est née en v7.
  assert.equal(result.document?.series[0].bannerUrl, 'https://example.test/banner.jpg')
  const reexported = validateLibraryDocument(serializeLibraryDocument(result.document))
  assert.deepEqual(reexported.errors, [])
  assert.equal(reexported.document?.series[0].firstAirYear, null)
})

test('JSON v8 : une année hors bornes, une fin avant le début ou une clé manquante sont refusées', () => {
  const base = createLibraryDocument(library, timestamp)
  const cases = [
    ['année trop ancienne', { ...base, series: [{ ...base.series[0], firstAirYear: 1899 }] }, '$.series[0].firstAirYear'],
    ['année trop lointaine', { ...base, anime: [{ ...base.anime[0], lastAirYear: 2101 }] }, '$.anime[0].lastAirYear'],
    ['année décimale', { ...base, series: [{ ...base.series[0], firstAirYear: 2017.5 }] }, '$.series[0].firstAirYear'],
    ['fin avant le début', { ...base, series: [{ ...base.series[0], firstAirYear: 2020, lastAirYear: 2017 }] }, '$.series[0].lastAirYear'],
    ['période absente', { ...base, series: [{ ...base.series[0], firstAirYear: undefined }] }, '$.series[0].firstAirYear'],
  ]
  for (const [label, document, path] of cases) {
    const result = validateLibraryDocument(JSON.stringify(document))
    assert.equal(result.document, null, label)
    assert.ok(result.errors.some((error) => error.path === path), `${label} : ${JSON.stringify(result.errors)}`)
  }
})

test('JSON v6 : un document sans bannière reste lisible, chaque fiche reçoit null', () => {
  const current = createLibraryDocument(library, timestamp)
  const legacy = { ...current, version: 6 }
  for (const section of ['films', 'series', 'anime', 'games']) {
    legacy[section] = legacy[section].map(({ bannerUrl: _banner, ...entry }) => entry)
  }
  // Une période de diffusion est apparue en v8 : un document v6 ne la connaît pas.
  for (const section of ['series', 'anime']) {
    legacy[section] = legacy[section].map(({ firstAirYear: _first, lastAirYear: _last, ...entry }) => entry)
  }
  const result = validateLibraryDocument(JSON.stringify(legacy))
  assert.deepEqual(result.errors, [])
  assert.equal(result.document?.films[0].bannerUrl, null)
  assert.equal(result.document?.series[0].bannerUrl, null)
  assert.equal(result.document?.anime[0].bannerUrl, null)
  assert.equal(result.document?.games[0].bannerUrl, null)
  assert.equal(result.document?.series[0].firstAirYear, null)
  assert.equal(result.document?.anime[0].lastAirYear, null)
  // Réexporté en v8, le document porte la clé avec null : il reste valide.
  const reexported = validateLibraryDocument(serializeLibraryDocument(result.document))
  assert.deepEqual(reexported.errors, [])
  assert.equal(reexported.document?.films[0].bannerUrl, null)
})

test('JSON v7 : une bannière non https, trop longue ou une clé manquante sont refusées', () => {
  const base = createLibraryDocument(library, timestamp)
  const cases = [
    ['adresse http', { ...base, films: [{ ...base.films[0], bannerUrl: 'http://example.test/fond.jpg' }] }, '$.films[0].bannerUrl'],
    ['fichier local', { ...base, series: [{ ...base.series[0], bannerUrl: 'file:///Users/moi/fond.jpg' }] }, '$.series[0].bannerUrl'],
    ['adresse démesurée', { ...base, games: [{ ...base.games[0], bannerUrl: `https://example.test/${'a'.repeat(2100)}.jpg` }] }, '$.games[0].bannerUrl'],
    ['bannière absente', { ...base, anime: [{ ...base.anime[0], bannerUrl: undefined }] }, '$.anime[0].bannerUrl'],
  ]
  for (const [label, document, path] of cases) {
    const result = validateLibraryDocument(JSON.stringify(document))
    assert.equal(result.document, null, label)
    assert.ok(result.errors.some((error) => error.path === path), `${label} : ${JSON.stringify(result.errors)}`)
  }
})

test('JSON v6 : une clé de bannière dans un document v6 est refusée, comme les détails d’une œuvre en v5', () => {
  const base = createLibraryDocument(library, timestamp)
  const legacy = { ...base, version: 6 }
  const result = validateLibraryDocument(JSON.stringify(legacy))
  assert.equal(result.document, null)
  assert.ok(result.errors.some((error) => error.path === '$.films[0].bannerUrl'), JSON.stringify(result.errors))
})

test('JSON v3 : des comics rangés dans Livres rejoignent la bibliothèque Comics, citations comprises', () => {
  const legacy = { ...createLibraryDocument(library, timestamp), version: 3, books: [book('book'), { ...book('old-comic', 'comics'), status: 'lu', volumesRead: 4 }] }
  delete legacy.customLibraries
  // Un document v3 ne connaît ni les bibliothèques personnalisées ni l'expérience : le fixtures
  // doit retirer les deux, sinon la clé en trop est — à juste titre — refusée.
  delete legacy.experience
  // Ni les champs de forme des œuvres, apparus en v6.
  legacy.artworks = legacy.artworks.map(({ details: _details, ...artwork }) => artwork)
  // Ni la bannière 16:9, apparue en v7 : le validateur v3 refuse une clé inconnue.
  for (const section of ['films', 'series', 'anime', 'games']) {
    legacy[section] = legacy[section].map(({ bannerUrl: _banner, ...entry }) => entry)
  }
  // Ni la période de diffusion, apparue en v8.
  for (const section of ['series', 'anime']) {
    legacy[section] = legacy[section].map(({ firstAirYear: _first, lastAirYear: _last, ...entry }) => entry)
  }
  const result = validateLibraryDocument(JSON.stringify(legacy))
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.document.books.map((entry) => entry.id), ['book'])
  const [comics] = result.document.customLibraries
  assert.equal(comics.libraryId, 'comics')
  assert.equal(comics.entries.length, 1)
  const [entry] = comics.entries
  assert.equal(entry.id, 'old-comic')
  assert.equal(entry.status, 'terminé')
  assert.equal(entry.creator, text)
  assert.equal(entry.progressCurrent, 4)
  assert.equal(entry.progressTotal, 12)
  assert.equal(entry.personalNote, text)
  assert.deepEqual(entry.quotes, [{ id: 'old-comic-quote', entryId: 'old-comic', body: text, position: 0, createdAt: timestamp }])
  assert.equal(result.counts.books, 1)
  assert.equal(result.counts.custom, 1)
})

test('JSON v4 : comics dans Livres, citations hors Comics, bibliothèque inconnue ou en double sont refusés', () => {
  const base = createLibraryDocument({ ...library, customLibraries }, timestamp)
  const cases = [
    ['comics dans Livres', { ...base, books: [book('stray', 'comics')] }, '$.books[0].category'],
    ['citation sur un jeu de société', { ...base, customLibraries: [{ ...customLibraries[1], entries: [customEntry('board', {}, [{ id: 'q', entryId: 'board', body: 'x', position: 0, createdAt: timestamp }])] }] }, '$.customLibraries[0].entries[0].quotes'],
    ['bibliothèque inconnue', { ...base, customLibraries: [{ ...customLibraries[2], libraryId: 'vinyles' }] }, '$.customLibraries[0].libraryId'],
    ['bibliothèque en double', { ...base, customLibraries: [customLibraries[2], { ...customLibraries[2], position: 3 }] }, '$.customLibraries[1].libraryId'],
    ['champ propre non textuel', { ...base, customLibraries: [{ ...customLibraries[1], entries: [customEntry('board', { players: 4 })] }] }, '$.customLibraries[0].entries[0].details.players'],
    ['statut inconnu', { ...base, customLibraries: [{ ...customLibraries[1], entries: [{ ...customEntry('board', {}), status: 'joué' }] }] }, '$.customLibraries[0].entries[0].status'],
  ]
  for (const [label, document, path] of cases) {
    const result = validateLibraryDocument(JSON.stringify(document))
    assert.equal(result.document, null, label)
    assert.ok(result.errors.some((error) => error.path === path), `${label} : ${JSON.stringify(result.errors)}`)
  }
})
