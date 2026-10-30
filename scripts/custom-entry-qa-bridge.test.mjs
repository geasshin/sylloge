import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import initSqlJs from 'sql.js'

// Exercise the actual production QA SQL helpers and command dispatcher, not a
// second handwritten bridge. Only sql.js memory fixtures; never Tauri or disk DB.
const SQL = await initSqlJs()
const source = readFileSync(new URL('../src/qa/appBridge.ts', import.meta.url), 'utf8')
const sqlHelpers = source.slice(source.indexOf('function toSqlValue('), source.indexOf('const now ='))
const writers = source.slice(source.indexOf('type BookPayload ='), source.indexOf('function updaterPreferences('))
const dispatcher = source.slice(source.indexOf('const unmocked ='), source.indexOf("mockWindows('main')"))
const makeBridge = new Function('db', 'CUSTOM_TABLES', 'fail', `${stripTypeScriptTypes(`${sqlHelpers}\n${writers}\n${dispatcher}`)}\nreturn { handle, select, execute };`)
const tables = ['comics', 'magazines', 'audiobooks', 'music', 'podcasts', 'documentaries', 'shows', 'board_games']
const stamp = '2026-10-22T10:00:00.000Z'
const text = '\t=Exact \"日本語\"\r\n  '
function harness(t) {
  const db = new SQL.Database()
  t.after(() => db.close())
  db.exec('PRAGMA foreign_keys = ON')
  const migrationDirectory = new URL('../src-tauri/migrations/', import.meta.url)
  for (const name of readdirSync(migrationDirectory).filter(name => name.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(name, migrationDirectory), 'utf8'))
  db.run("INSERT INTO profiles (id, name) VALUES ('reader', 'Synthetic'), ('neighbor', 'Other fixture')")
  return { db, ...makeBridge(db, tables, message => { throw message }) }
}
const quote = (id, owner, body, position) => ({ id, [owner]: 'entry-1', body, position, createdAt: stamp })
function custom(libraryId = 'comics') {
  return { libraryId, entry: {
    id: 'entry-1', profileId: 'reader', title: 'Fixture', creator: text, year: 1986, status: 'à découvrir',
    rating: 4.5, isFavorite: true, progressCurrent: 0, progressTotal: 12, progressUpdatedAt: stamp,
    startedAt: null, finishedAt: null, coverUrl: null, summary: text, personalNote: text,
    details: { importedUnknown: text }, createdAt: stamp, updatedAt: stamp,
    quotes: libraryId === 'comics' ? [quote('q1', 'entryId', text, 0), quote('q2', 'entryId', text, 1)] : [],
  } }
}
const book = (library = 'mangas') => ({ library, book: {
  id: 'entry-1', profileId: 'reader', title: 'Fixture', author: text, year: 1986,
  summary: text, category: library === 'mangas' ? 'manga' : 'livre', status: 'à lire', rating: 4.5,
  isFavorite: true, volumesRead: 0, volumesTotal: 12, progressUpdatedAt: stamp, startedAt: null,
  coverUrl: null, personalNote: text, createdAt: stamp, updatedAt: stamp,
}, quotes: [quote('q1', 'bookId', text, 0), quote('q2', 'bookId', 'Second', 1)] })
const invokeWrite = (bridge, command, payload) => bridge.handle(command, { payload })

test('book QA commands create/delete a manga in mangas + manga_quotes, never books', t => {
  const bridge = harness(t)
  assert.equal(invokeWrite(bridge, 'create_book_atomically', book()), null)
  assert.equal(bridge.select('SELECT * FROM books').length, 0)
  assert.equal(bridge.select('SELECT * FROM mangas').length, 1)
  assert.equal(bridge.select('SELECT * FROM manga_quotes').length, 2)
  assert.equal(bridge.handle('delete_book_atomically', { library: 'mangas', profileId: 'reader', bookId: 'entry-1' }), null)
  assert.equal(bridge.select('SELECT * FROM mangas').length, 0)
  assert.equal(bridge.select('SELECT * FROM manga_quotes').length, 0)
})

test('book QA moves preserve quotes and provider link, with transaction rollback on late insert failure', t => {
  const bridge = harness(t)
  const original = book()
  invokeWrite(bridge, 'create_book_atomically', original)
  bridge.execute("INSERT INTO media_provider_links (profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at) VALUES ('reader', 'mangas', 'entry-1', 'openlibrary', 'OLTEST', $1, $1)", [stamp])
  const moved = structuredClone(original)
  moved.book.category = 'livre'
  moved.book.title = 'Moved'
  moved.quotes[1].id = moved.quotes[0].id
  assert.throws(() => invokeWrite(bridge, 'update_book_atomically', moved))
  assert.equal(bridge.select('SELECT * FROM books').length, 0)
  assert.equal(bridge.select('SELECT * FROM mangas')[0].title, 'Fixture')
  assert.equal(bridge.select('SELECT * FROM manga_quotes').length, 2)
  moved.quotes[1].id = 'q2'
  invokeWrite(bridge, 'update_book_atomically', moved)
  assert.equal(bridge.select('SELECT * FROM mangas').length, 0)
  assert.equal(bridge.select('SELECT * FROM manga_quotes').length, 0)
  assert.equal(bridge.select('SELECT * FROM books')[0].title, 'Moved')
  assert.equal(bridge.select('SELECT * FROM book_quotes').length, 2)
  assert.equal(bridge.select('SELECT * FROM media_provider_links')[0].medium, 'books')
})

for (const libraryId of tables) test(`custom QA ${libraryId}: create/update exact fields, void command and scoped delete`, t => {
  const bridge = harness(t)
  const value = custom(libraryId)
  assert.equal(invokeWrite(bridge, 'create_custom_entry_atomically', value), null)
  const [row] = bridge.select(`SELECT * FROM ${libraryId}`)
  assert.equal(row.personal_note, text)
  assert.equal(row.progress_current, 0)
  assert.deepEqual(JSON.parse(row.details), { importedUnknown: text })
  value.entry.title = 'Updated'
  invokeWrite(bridge, 'update_custom_entry_atomically', value)
  assert.equal(bridge.select(`SELECT * FROM ${libraryId}`)[0].title, 'Updated')
  assert.throws(() => bridge.handle('delete_custom_entry_atomically', { profileId: 'neighbor', libraryId, entryId: 'entry-1' }))
  bridge.handle('delete_custom_entry_atomically', { profileId: 'reader', libraryId, entryId: 'entry-1' })
  assert.equal(bridge.select(`SELECT * FROM ${libraryId}`).length, 0)
  assert.equal(bridge.select('SELECT * FROM comic_quotes').length, 0)
})

test('comic QA preserves duplicate identities and rolls back native create/update/remove late failures', t => {
  const bridge = harness(t)
  const value = custom()
  bridge.db.exec("CREATE TRIGGER fail_quote BEFORE INSERT ON comic_quotes WHEN NEW.body = 'FAIL LATE' BEGIN SELECT RAISE(ABORT, 'synthetic quote failure'); END")
  const broken = structuredClone(value)
  broken.entry.quotes[1].body = 'FAIL LATE'
  assert.throws(() => invokeWrite(bridge, 'create_custom_entry_atomically', broken), /synthetic quote failure/u)
  assert.equal(bridge.select('SELECT * FROM comics').length, 0)
  invokeWrite(bridge, 'create_custom_entry_atomically', value)
  const oldEntry = bridge.select('SELECT * FROM comics')
  const oldQuotes = bridge.select('SELECT * FROM comic_quotes ORDER BY position')
  broken.entry.title = 'Must roll back'
  assert.throws(() => invokeWrite(bridge, 'update_custom_entry_atomically', broken), /synthetic quote failure/u)
  assert.deepEqual(bridge.select('SELECT * FROM comics'), oldEntry)
  assert.deepEqual(bridge.select('SELECT * FROM comic_quotes ORDER BY position'), oldQuotes)
  value.entry.quotes.forEach((quote, index) => { quote.id = `regenerated-${index}`; quote.createdAt = 'wrong date' })
  invokeWrite(bridge, 'update_custom_entry_atomically', value)
  assert.deepEqual(bridge.select('SELECT * FROM comic_quotes ORDER BY position'), oldQuotes)
  bridge.execute("INSERT INTO profile_libraries (profile_id, library_id, position) VALUES ('reader', 'comics', 0)")
  bridge.db.exec("CREATE TRIGGER fail_remove BEFORE DELETE ON profile_libraries BEGIN SELECT RAISE(ABORT, 'synthetic removal failure'); END")
  assert.throws(() => bridge.handle('remove_custom_library_atomically', { profileId: 'reader', libraryId: 'comics' }), /synthetic removal failure/u)
  assert.deepEqual(bridge.select('SELECT * FROM comics'), oldEntry)
  assert.deepEqual(bridge.select('SELECT * FROM comic_quotes ORDER BY position'), oldQuotes)
  bridge.db.exec('DROP TRIGGER fail_remove')
  bridge.handle('remove_custom_library_atomically', { profileId: 'reader', libraryId: 'comics' })
  assert.equal(bridge.select('SELECT * FROM comics').length, 0)
  assert.equal(bridge.select('SELECT * FROM comic_quotes').length, 0)
  assert.equal(bridge.select('SELECT * FROM profile_libraries').length, 0)
})

// ─── Séries ↔ Animation japonaise : même contrat que la commande Rust ───────

const seriesValue = (library = 'series', category = library === 'series' ? 'série télé' : 'animation') => ({
  library,
  series: {
    id: 'entry-1', profileId: 'reader', title: 'Fixture', showrunner: text, casting: text, summary: text,
    category, status: 'en cours', rating: 4.5, isFavorite: true, seasonsSeen: 1, seasonsTotal: 3,
    progressUpdatedAt: stamp, startedAt: '2026-01-05', posterUrl: 'https://example.test/affiche.jpg',
    personalNote: text, createdAt: stamp, updatedAt: stamp,
  },
})

function seedSeries(bridge, library) {
  bridge.execute(
    `INSERT INTO ${library} (id, profile_id, title, showrunner, casting, summary, ${library === 'series' ? 'category, ' : ''}status, rating, is_favorite, seasons_seen, seasons_total, progress_updated_at, started_at, poster_url, personal_note, created_at, updated_at)
     VALUES ('entry-1', 'reader', 'Fixture', $1, $1, $1, ${library === 'series' ? "'série télé', " : ''}'en cours', 4.5, 1, 1, 3, $2, '2026-01-05', 'https://example.test/affiche.jpg', $1, $2, $2)`,
    [text, stamp],
  )
  bridge.execute(
    "INSERT INTO media_provider_links (profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at) VALUES ('reader', $1, 'entry-1', 'TMDB', '95396', $2, $2)",
    [library, stamp],
  )
}

test('series QA moves Séries → Animation japonaise with every field and the provider link', t => {
  const bridge = harness(t)
  seedSeries(bridge, 'series')
  assert.equal(invokeWrite(bridge, 'move_series_library', seriesValue('series', 'animation')), null)
  assert.equal(bridge.select('SELECT id FROM series').length, 0, 'aucune copie résiduelle dans series')
  const [moved] = bridge.select('SELECT * FROM anime')
  assert.equal(moved.title, 'Fixture')
  assert.equal(moved.showrunner, text)
  assert.equal(moved.rating, 4.5)
  assert.equal(moved.is_favorite, 1)
  assert.equal(moved.seasons_seen, 1)
  assert.equal(moved.poster_url, 'https://example.test/affiche.jpg')
  assert.equal(moved.personal_note, text)
  assert.equal(moved.created_at, stamp)
  assert.equal(bridge.select('SELECT medium FROM media_provider_links')[0].medium, 'anime')

  // Retour : la catégorie interne de series est forcée, le lien revient aussi.
  assert.equal(invokeWrite(bridge, 'move_series_library', seriesValue('anime', 'série télé')), null)
  assert.equal(bridge.select('SELECT id FROM anime').length, 0, 'aucune copie résiduelle dans anime')
  const [returned] = bridge.select('SELECT * FROM series')
  assert.equal(returned.category, 'série télé')
  assert.equal(returned.rating, 4.5)
  assert.equal(bridge.select('SELECT medium FROM media_provider_links')[0].medium, 'series')
})

test('series QA refuses a missing sheet, an identical library and an unknown category', t => {
  const bridge = harness(t)
  assert.throws(() => invokeWrite(bridge, 'move_series_library', seriesValue('series', 'animation')), /introuvable/u)
  seedSeries(bridge, 'series')
  assert.throws(() => invokeWrite(bridge, 'move_series_library', seriesValue('series', 'série télé')), /déjà dans la bibliothèque/u)
  assert.throws(() => invokeWrite(bridge, 'move_series_library', seriesValue('series', 'documentaire')), /Catégorie de série inconnue/u)
  assert.throws(() => invokeWrite(bridge, 'move_series_library', { library: 'films', series: seriesValue().series }), /Bibliothèque de séries inconnue/u)
  assert.equal(bridge.select('SELECT id FROM series').length, 1)
  assert.equal(bridge.select('SELECT id FROM anime').length, 0)
  assert.equal(bridge.select('SELECT medium FROM media_provider_links')[0].medium, 'series')
})

test('series QA rolls the move back when the target already holds the identifier', t => {
  const bridge = harness(t)
  seedSeries(bridge, 'series')
  seedSeries(bridge, 'anime')
  const before = bridge.select('SELECT * FROM series')
  assert.throws(() => invokeWrite(bridge, 'move_series_library', seriesValue('series', 'animation')))
  assert.deepEqual(bridge.select('SELECT * FROM series'), before)
  assert.equal(bridge.select('SELECT * FROM anime').length, 1)
  assert.equal(bridge.select('SELECT medium FROM media_provider_links WHERE medium = $1', ['series']).length, 1, 'le lien de la source reste en place')
})
