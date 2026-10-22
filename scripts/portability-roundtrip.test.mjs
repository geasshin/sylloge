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
  progressUpdatedAt: timestamp, startedAt: '2026-10-01', posterUrl: 'https://example.test/image.jpg', personalNote: text,
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
    providerName: text, providerId: text, posterUrl: 'https://example.test/film.jpg' }],
  series: [series('series')], anime: [series('anime', 'animation')],
  books: [book('book')], mangas: [book('manga', 'manga')],
  games: [{ ...identity('game'), developer: text, platform: text, year: 2024, status: 'à jouer',
    rating: 0.5, isFavorite: true, playedAt: '2026-10-01', coverUrl: 'https://example.test/game.jpg', personalNote: text }],
  artworks: [{ ...identity('artwork'), artist: text, year: 2024, form: 'peinture', location: text,
    exhibition: text, status: 'à découvrir', isFavorite: true, discoveredAt: '2026-10-01',
    imageUrl: 'https://example.test/art.jpg', personalNote: text, customFields: [{ name: 'Technique', value: text }] }],
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
  // Art CSV v1 ne possède pas de colonne de champs libres ; JSON les conserve.
  if (kind === 'artworks') delete result.customFields
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

test('JSON v4 : les sept bibliothèques, les bibliothèques personnalisées et chaque champ personnel restent identiques', () => {
  const document = createLibraryDocument({ ...library, customLibraries }, timestamp)
  assert.equal(document.version, 4)
  const result = validateLibraryDocument(serializeLibraryDocument(document))
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.document, document)
  assert.deepEqual(result.document.customLibraries, customLibraries)
  assert.deepEqual(result.counts, { films: 1, series: 1, anime: 1, books: 1, mangas: 1, games: 1, artworks: 1, custom: 2 })
})

test('JSON v3 : des comics rangés dans Livres rejoignent la bibliothèque Comics, citations comprises', () => {
  const legacy = { ...createLibraryDocument(library, timestamp), version: 3, books: [book('book'), { ...book('old-comic', 'comics'), status: 'lu', volumesRead: 4 }] }
  delete legacy.customLibraries
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
