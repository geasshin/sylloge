import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const engineUrl = new URL('../src/domain/thirdPartyImport.ts', import.meta.url)
const fixture = (name) => readFileSync(new URL(`../tests/fixtures/third-party-import/${name}`, import.meta.url), 'utf8')
const importedAt = '2026-01-02T03:04:05.000Z'

async function engine() {
  try {
    return await import(engineUrl.href)
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === engineUrl.href) return {}
    throw error
  }
}

test('recognizes Letterboxd by its header, not a guessed extension or filename', async () => {
  const { recognizeThirdPartyImport } = await engine()
  assert.equal(typeof recognizeThirdPartyImport, 'function', 'The pure recognition API must exist')
  const source = { name: 'renamed-export.txt', contents: fixture('letterboxd-ratings.csv') }
  const recognized = recognizeThirdPartyImport(source)
  assert.equal(recognized.service, 'letterboxd')
  assert.equal(recognized.variant, 'ratings')
  assert.equal(recognized.library, 'films')
  assert.deepEqual(recognized.mapping, [
    { field: 'title', column: 'Name' },
    { field: 'rating', column: 'Rating' },
  ])
  assert.equal(recognizeThirdPartyImport({ name: 'ratings.csv', contents: 'Title,Rating\nNot an export,4\n' }), null)
})

test('previews Letterboxd ratings on /5 without inventing a viewing date or fetching metadata', async () => {
  const { previewThirdPartyImport } = await engine()
  assert.equal(typeof previewThirdPartyImport, 'function', 'The pure preview API must exist')
  const source = { name: 'ratings.csv', contents: fixture('letterboxd-ratings.csv') }
  const snapshot = structuredClone(source)
  const preview = previewThirdPartyImport(source, 'films', importedAt)
  assert.deepEqual(source, snapshot, 'The input is immutable')
  assert.deepEqual(preview.errors, [])
  assert.equal(preview.totalItemCount, 2)
  assert.equal(preview.validItemCount, 2)
  assert.equal(preview.items[0].title, 'Film fictif, l’aube')
  assert.equal(preview.items[0].rating, 4.5)
  assert.equal(preview.items[0].status, 'terminé')
  assert.equal(preview.items[0].watchedAt, null, 'Date is the Letterboxd activity date, not Watched Date')
  assert.equal(preview.items[0].providerName, null)
  assert.equal(preview.items[0].providerId, null)
  assert.equal(preview.items[0].createdAt, importedAt, 'The source did not supply a Sylloge creation date')
  assert.equal(preview.items[1].rating, null)
  assert.deepEqual(preview.ignoredColumns, ['Date', 'Year', 'Letterboxd URI'])
  assert.ok(preview.warnings.some((warning) => warning.code === 'activity-date-not-watched'))
})

test('distinguishes watched and watchlist only with a known basename or an explicit interpretation', async () => {
  const { recognizeThirdPartyImport, previewThirdPartyImport } = await engine()
  const contents = fixture('letterboxd-list.csv')
  for (const [name, variant, status] of [
    ['export/watched.csv', 'watched', 'terminé'],
    ['export\\watchlist.CSV', 'watchlist', 'à découvrir'],
  ]) {
    assert.equal(recognizeThirdPartyImport({ name, contents })?.variant, variant)
    assert.equal(previewThirdPartyImport({ name, contents }, 'films', importedAt).items[0].status, status)
  }
  const renamed = { name: 'renamed.csv', contents }
  assert.equal(recognizeThirdPartyImport(renamed).variant, 'ambiguous')
  const ambiguous = previewThirdPartyImport(renamed, 'films', importedAt)
  assert.equal(ambiguous.items, null)
  assert.match(ambiguous.errors[0].message, /watched\.csv.*watchlist\.csv/u)
  const chosen = previewThirdPartyImport(renamed, 'films', importedAt, { letterboxdList: 'watchlist' })
  assert.equal(chosen.variant, 'watchlist')
  assert.equal(chosen.items[0].status, 'à découvrir')
})

test('previews diary dates and quoted multiline reviews without turning tags or rewatches into favorites', async () => {
  const { recognizeThirdPartyImport, previewThirdPartyImport } = await engine()
  const source = { name: 'export/diary.csv', contents: fixture('letterboxd-diary.csv') }
  assert.equal(recognizeThirdPartyImport(source).variant, 'diary')
  const preview = previewThirdPartyImport(source, 'films', importedAt)
  assert.deepEqual(preview.errors, [])
  assert.equal(preview.items[0].watchedAt, '2024-02-29')
  assert.equal(preview.items[0].personalNote, '  Une critique fictive, avec "guillemets".\nDeuxième ligne conservée.  ')
  assert.equal(preview.items[0].rating, 3.5)
  assert.equal(preview.items[0].isFavorite, false)
  assert.ok(preview.warnings.some((warning) => warning.code === 'unmapped-columns' && /Rewatch.*Tags/u.test(warning.message)))
})

test('recognized exports never fall back to another library or expose partial write-ready items on error', async () => {
  const { previewThirdPartyImport } = await engine()
  const source = { name: 'ratings.csv', contents: fixture('letterboxd-ratings.csv') }
  const wrongLibrary = previewThirdPartyImport(source, 'books', importedAt)
  assert.equal(wrongLibrary.items, null)
  assert.match(wrongLibrary.errors[0].message, /Films/u)
  for (const invalid of ['0', '6', '4.7', 'garbage', '-1']) {
    const preview = previewThirdPartyImport({ ...source, contents: source.contents.replace(',4.5\n', `,${invalid}\n`) }, 'films', importedAt)
    assert.equal(preview.items, null, `Invalid rating ${invalid} must block the entire import`)
    assert.ok(preview.errors.length > 0)
    assert.equal(preview.totalItemCount, 2)
  }
  const diary = { name: 'diary.csv', contents: fixture('letterboxd-diary.csv').replace('2024-02-29', '2025-02-29') }
  assert.equal(previewThirdPartyImport(diary, 'films', importedAt).items, null)
  const badSyntax = { ...source, contents: `${source.contents}2026-01-01,"missing closing quote\n` }
  assert.equal(previewThirdPartyImport(badSyntax, 'films', importedAt).items, null)
})

test('reports repeated source titles as conflicts instead of silently collapsing diary history', async () => {
  const { previewThirdPartyImport } = await engine()
  const contents = fixture('letterboxd-ratings.csv').replace('Film fictif sans note', 'Film fictif, l’aube').replace('2025-12-31,Film fictif, l’aube,', '2025-12-31,"Film fictif, l’aube",')
  const preview = previewThirdPartyImport({ name: 'ratings.csv', contents }, 'films', importedAt)
  assert.deepEqual(preview.duplicateTitles, [{ title: 'Film fictif, l’aube', lines: [2, 3] }])
  assert.equal(preview.items, null, 'An unresolvable source duplicate must not be write-ready')
  assert.equal(preview.totalItemCount, 2)
  assert.equal(preview.validItemCount, 2, 'Valid source rows are still counted, never silently removed')
  assert.match(preview.errors.at(-1).message, /doublon|plusieurs/u)
})

test('recognizes Goodreads by the full service signature and preserves personal ratings including unrated zero', async () => {
  const { recognizeThirdPartyImport, previewThirdPartyImport } = await engine()
  const source = { name: 'renamed-books.csv', contents: fixture('goodreads-library.csv') }
  const recognized = recognizeThirdPartyImport(source)
  assert.equal(recognized?.service, 'goodreads')
  assert.equal(recognized.library, 'books')
  assert.equal(recognized.variant, 'library')
  const preview = previewThirdPartyImport(source, 'books', importedAt)
  assert.deepEqual(preview.errors, [])
  assert.deepEqual(preview.items.map((item) => item.status), ['lu', 'en cours', 'à lire'])
  assert.deepEqual(preview.items.map((item) => item.rating), [4, null, null], 'Average Rating is never imported as My Rating')
  assert.equal(preview.items[0].author, 'Auteur fictif A')
  assert.equal(preview.items[0].year, 2020)
  assert.equal(preview.items[0].startedAt, null, 'Date Read and Date Added are not a start date')
  assert.equal(preview.items[0].createdAt, importedAt)
  assert.equal(preview.items[0].volumesRead, null, 'Read Count is not a volume count')
  assert.equal(preview.items[0].isFavorite, false, 'A custom shelf is not a Sylloge favorite')
  assert.equal(preview.items[0].personalNote, '  Avis fictif, avec "guillemets".\nDeuxième ligne.  ')
  assert.equal(preview.items[1].personalNote, '  Notes privées synthétiques.  ')
  assert.ok(preview.warnings.some((warning) => warning.code === 'completion-date-not-started'))
  assert.ok(preview.ignoredColumns.includes('Read Count'))
  assert.ok(preview.ignoredColumns.includes('Average Rating'))
  assert.equal(previewThirdPartyImport(source, 'mangas', importedAt).items, null, 'No guessed book-to-manga classification')
})

test('keeps both Goodreads review and private notes with an explicit combination warning', async () => {
  const { previewThirdPartyImport } = await engine()
  const source = {
    name: 'goodreads_library_export.csv',
    contents: 'Book Id,Title,Author,My Rating,Exclusive Shelf,My Review,Private Notes\n900009,Livre fictif,Auteur fictif,5,read,"  Avis public fictif.  ","  Notes privées fictives.  "\n',
  }
  const preview = previewThirdPartyImport(source, 'books', importedAt)
  assert.deepEqual(preview.errors, [])
  assert.equal(preview.items[0].personalNote, '  Avis public fictif.  \n\n[Notes privées Goodreads]\n  Notes privées fictives.  ')
  assert.ok(preview.warnings.some((warning) => warning.code === 'combined-notes'))
})

test('rejects unknown Goodreads shelves, non-integer personal ratings and verdicts that a to-read status would purge', async () => {
  const { previewThirdPartyImport } = await engine()
  const header = 'Book Id,Title,Author,My Rating,Exclusive Shelf,My Review\n'
  for (const row of [
    '900009,Livre fictif,Auteur fictif,4.5,read,',
    '900009,Livre fictif,Auteur fictif,6,read,',
    '900009,Livre fictif,Auteur fictif,-1,read,',
    '900009,Livre fictif,Auteur fictif,garbage,to-read,',
    '900009,Livre fictif,Auteur fictif,4,custom-shelf,',
    '900009,Livre fictif,Auteur fictif,4,,',
    '900009,Livre fictif,Auteur fictif,4,to-read,',
    '900009,Livre fictif,Auteur fictif,0,to-read,Note avant lecture',
    '900009,,Auteur fictif,4,read,',
  ]) {
    const preview = previewThirdPartyImport({ name: 'books.csv', contents: header + row + '\n' }, 'books', importedAt)
    assert.equal(preview.items, null, `The entire file must be blocked: ${row}`)
    assert.ok(preview.errors.length > 0)
    assert.equal(preview.totalItemCount, 1)
  }
})

test('does not reinterpret a contradictory Letterboxd watchlist or diary filename as a ratings snapshot', async () => {
  const { previewThirdPartyImport } = await engine()
  for (const name of ['watchlist.csv', 'archive.zip!/diary.csv']) {
    const preview = previewThirdPartyImport({ name, contents: fixture('letterboxd-ratings.csv') }, 'films', importedAt)
    assert.equal(preview.items, null)
    assert.ok(preview.errors.some((error) => /nom|colonnes|contradictoire/u.test(error.message)))
  }
})

test('supports BOM, Unicode and reordered case-insensitive headers while preserving source column names', async () => {
  const { recognizeThirdPartyImport, previewThirdPartyImport } = await engine()
  const source = {
    name: 'renamed.csv',
    contents: '\uFEFFrating,letterboxd uri,year,name,date\r\n0.5,https://boxd.it/syntheticUnicode,2004,"映画 fictif 🌙",2025-12-31\r\n',
  }
  const recognized = recognizeThirdPartyImport(source)
  assert.equal(recognized?.service, 'letterboxd')
  assert.deepEqual(recognized.mapping, [{ field: 'title', column: 'name' }, { field: 'rating', column: 'rating' }])
  const preview = previewThirdPartyImport(source, 'films', importedAt)
  assert.deepEqual(preview.errors, [])
  assert.equal(preview.items[0].title, '映画 fictif 🌙')
  assert.equal(preview.items[0].rating, 0.5)
  const goodreads = { name: 'books.csv', contents: 'EXCLUSIVE SHELF,BookID,MY RATING,AUTHOR,TITLE\nread,900009,1,Auteur fictif,Livre fictif\n' }
  assert.equal(recognizeThirdPartyImport(goodreads)?.service, 'goodreads')
  assert.equal(previewThirdPartyImport(goodreads, 'books', importedAt).items[0].rating, 1)
})

test('blocks empty supported exports and invalid import timestamps rather than producing an empty replacement plan', async () => {
  const { previewThirdPartyImport } = await engine()
  for (const [name, contents, library] of [
    ['ratings.csv', 'Date,Name,Year,Letterboxd URI,Rating\n', 'films'],
    ['books.csv', 'Book Id,Title,Author,My Rating,Exclusive Shelf\n', 'books'],
  ]) {
    const preview = previewThirdPartyImport({ name, contents }, library, importedAt)
    assert.equal(preview.items, null)
    assert.equal(preview.totalItemCount, 0)
    assert.ok(preview.errors.some((error) => /aucune|vide/u.test(error.message)))
  }
  const preview = previewThirdPartyImport({ name: 'books.csv', contents: fixture('goodreads-library.csv') }, 'books', 'not-an-ISO-timestamp')
  assert.equal(preview.items, null)
  assert.ok(preview.errors.some((error) => /horodatage|ISO/u.test(error.message)))
})

test('coalesces a picked Letterboxd archive across watched, ratings, diary, watchlist and reviews without losing history', async () => {
  const { recognizeThirdPartyImport, previewThirdPartyImport } = await engine()
  const csv = (id, name, contents) => ({ id, name, kind: 'csv', contents })
  const picked = {
    name: 'letterboxd-synthetic.zip', kind: 'container', contents: null, csvCandidates: [], markdownPages: [],
    containerCandidates: [
      csv('ratings', 'ratings.csv', fixture('letterboxd-ratings.csv')),
      csv('watched', 'watched.csv', 'Date,Name,Year,Letterboxd URI\n2025-12-31,"Film fictif, l’aube",2001,https://boxd.it/syntheticA\n'),
      csv('diary', 'diary.csv', fixture('letterboxd-diary.csv')),
      csv('watchlist', 'watchlist.csv', fixture('letterboxd-list.csv')),
      csv('reviews', 'reviews.csv', 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n2025-12-31,"Film fictif, l’aube",2001,https://boxd.it/syntheticReview,4,,Autre avis fictif.,,2025-12-30\n'),
    ],
  }
  const snapshot = structuredClone(picked)
  let recognized
  assert.doesNotThrow(() => { recognized = recognizeThirdPartyImport(picked) }, 'A picked archive is a supported input shape')
  assert.equal(recognized?.variant, 'archive')
  const preview = previewThirdPartyImport(picked, 'films', importedAt)
  assert.deepEqual(picked, snapshot)
  assert.deepEqual(preview.errors, [])
  assert.equal(preview.variant, 'archive')
  assert.equal(preview.sourceRowCount, 6)
  assert.equal(preview.totalItemCount, 3)
  assert.equal(preview.validItemCount, 3)
  assert.equal(preview.sourceFiles.length, 5)
  assert.deepEqual(preview.duplicateTitles, [])
  const film = preview.items.find((item) => item.title === 'Film fictif, l’aube')
  assert.equal(film.rating, 4.5, 'The current ratings snapshot beats historical diary and review ratings')
  assert.equal(film.watchedAt, '2025-12-30', 'Only explicit watched dates establish the latest viewing')
  assert.equal(film.status, 'terminé')
  assert.ok(film.personalNote.includes('2024-02-29'), 'The earlier viewing date is retained in the personal note')
  assert.ok(film.personalNote.includes('Deuxième ligne conservée.  '))
  assert.ok(film.personalNote.includes('Autre avis fictif.'))
  assert.ok(film.personalNote.includes('synthétique, favori'), 'Unmodeled diary tags are retained in the archive history')
  assert.equal(preview.items.find((item) => item.title === 'Film fictif à découvrir').status, 'à découvrir')
  assert.ok(preview.warnings.some((warning) => warning.code === 'archive-history-preserved'))
})

test('does not resurrect deleted Letterboxd rows or silently drop unsupported archive files', async () => {
  const { previewThirdPartyImport } = await engine()
  const picked = {
    name: 'letterboxd-synthetic.zip', kind: 'container', contents: null, csvCandidates: [], markdownPages: [],
    containerCandidates: [
      { kind: 'csv', name: 'export/watchlist.csv', contents: fixture('letterboxd-list.csv') },
      { kind: 'csv', name: 'export/deleted/ratings.csv', contents: fixture('letterboxd-ratings.csv') },
      { kind: 'csv', name: 'export/liked/films.csv', contents: fixture('letterboxd-list.csv') },
      { kind: 'csv', name: 'export/profile.csv', contents: 'Username,Email\nsynthetic,synthetic@example.invalid\n' },
    ],
  }
  const preview = previewThirdPartyImport(picked, 'films', importedAt)
  assert.deepEqual(preview.errors, [])
  assert.equal(preview.items.length, 1)
  assert.equal(preview.items[0].status, 'à découvrir')
  assert.equal(preview.sourceRowCount, 1)
  assert.ok(preview.warnings.some((warning) => warning.code === 'excluded-deleted-file' && /deleted/u.test(warning.path)))
  assert.ok(preview.warnings.some((warning) => warning.code === 'unsupported-archive-file' && /liked/u.test(warning.path)))
  assert.ok(preview.warnings.some((warning) => warning.code === 'unsupported-archive-file' && /profile/u.test(warning.path)))
})

test('blocks mixed services, malformed required CSVs and multiple exports rather than importing an incomplete archive', async () => {
  const { previewThirdPartyImport } = await engine()
  const csv = (name, contents) => ({ name, contents, kind: 'csv' })
  const ratings = csv('ratings.csv', fixture('letterboxd-ratings.csv'))
  for (const extra of [
    csv('goodreads_library_export.csv', fixture('goodreads-library.csv')),
    csv('watched.csv', 'Title,Unknown\nNot an export,value\n'),
    csv('second-account/ratings.csv', fixture('letterboxd-ratings.csv')),
  ]) {
    const preview = previewThirdPartyImport({
      name: 'synthetic.zip', kind: 'container', contents: null, csvCandidates: [], containerCandidates: [ratings, extra],
    }, 'films', importedAt)
    assert.equal(preview.items, null, extra.name)
    assert.ok(preview.errors.length > 0, extra.name)
  }
})

test('refuses conflicting snapshots and uncertain film identities instead of choosing a row by iteration order', async () => {
  const { previewThirdPartyImport } = await engine()
  const csv = (name, contents) => ({ name, contents, kind: 'csv' })
  const ratings = csv('ratings.csv', 'Date,Name,Year,Letterboxd URI,Rating\n2025-12-31,Film fictif,2001,https://boxd.it/syntheticA,4\n')
  const cases = [
    [{ ...ratings, contents: ratings.contents + '2025-12-31,Film fictif,2001,https://boxd.it/syntheticA,5\n' }],
    [ratings, csv('watched.csv', 'Date,Name,Year,Letterboxd URI\n2025-12-31,Film fictif,2001,https://boxd.it/differentFilm\n')],
    [csv('diary.csv', 'Date,Name,Year,Letterboxd URI,Rating,Watched Date\n2025-12-31,Film fictif,2001,https://boxd.it/entryA,3,2024-02-29\n2025-12-31,Film fictif,2001,https://boxd.it/entryB,4,2024-02-29\n')],
    [csv('diary.csv', 'Date,Name,Year,Letterboxd URI,Rating,Watched Date\n2025-12-31,Film fictif,2001,https://boxd.it/entryA,3,\n2025-12-31,Film fictif,2001,https://boxd.it/entryB,4,\n')],
  ]
  for (const containerCandidates of cases) {
    const preview = previewThirdPartyImport({ name: 'synthetic.zip', kind: 'container', contents: null, csvCandidates: [], containerCandidates }, 'films', importedAt)
    assert.equal(preview.items, null)
    assert.ok(preview.errors.length > 0)
  }
})

test('retains repeated dated diary entries and a current unrated snapshot without inventing a rating', async () => {
  const { previewThirdPartyImport } = await engine()
  const picked = {
    name: 'synthetic.zip', kind: 'container', contents: null, csvCandidates: [],
    containerCandidates: [
      { kind: 'csv', name: 'ratings.csv', contents: 'Date,Name,Year,Letterboxd URI,Rating\n2025-12-31,Film fictif,2001,https://boxd.it/filmA,\n' },
      { kind: 'csv', name: 'diary.csv', contents: 'Date,Name,Year,Letterboxd URI,Rating,Watched Date,Review\n2025-12-31,Film fictif,2001,https://boxd.it/entryA,3,2024-02-29,Premier avis fictif\n2025-12-31,Film fictif,2001,https://boxd.it/entryB,4,2025-01-02,Second avis fictif\n' },
    ],
  }
  const preview = previewThirdPartyImport(picked, 'films', importedAt)
  assert.deepEqual(preview.errors, [])
  assert.equal(preview.items.length, 1)
  assert.equal(preview.items[0].rating, null)
  assert.equal(preview.items[0].watchedAt, '2025-01-02')
  assert.match(preview.items[0].personalNote, /2024-02-29/u)
  assert.match(preview.items[0].personalNote, /Premier avis fictif/u)
  assert.match(preview.items[0].personalNote, /Second avis fictif/u)
  assert.match(preview.items[0].personalNote, /3\/5/u)
  assert.match(preview.items[0].personalNote, /4\/5/u)
})

test('blocks distinct same-title films instead of losing their year distinction in the imported model', async () => {
  const { previewThirdPartyImport } = await engine()
  const preview = previewThirdPartyImport({
    name: 'synthetic.zip', kind: 'container', contents: null, csvCandidates: [],
    containerCandidates: [{ kind: 'csv', name: 'ratings.csv', contents: 'Date,Name,Year,Letterboxd URI,Rating\n2025-12-31,Film fictif,2001,https://boxd.it/filmA,3\n2025-12-31,Film fictif,2020,https://boxd.it/filmB,4\n' }],
  }, 'films', importedAt)
  assert.equal(preview.items, null)
  assert.equal(preview.totalItemCount, 2)
  assert.equal(preview.duplicateTitles.length, 1)
})

test('rejects NUL-encoded and oversized service text before row conversion', async () => {
  const { previewThirdPartyImport } = await engine()
  const nulSource = { name: 'ratings.csv', contents: fixture('letterboxd-ratings.csv').replace('Film fictif sans note', 'Film\u0000 fictif') }
  const nulPreview = previewThirdPartyImport(nulSource, 'films', importedAt)
  assert.equal(nulPreview.items, null)
  assert.ok(nulPreview.errors.some((error) => /encodage|NUL|UTF/u.test(error.message)))
  const oversized = { name: 'ratings.csv', contents: fixture('letterboxd-ratings.csv') + ' '.repeat(16 * 1024 * 1024) }
  const sizePreview = previewThirdPartyImport(oversized, 'films', importedAt)
  assert.equal(sizePreview.items, null)
  assert.ok(sizePreview.errors.some((error) => /16 Mio/u.test(error.message)))
})
