/**
 * Harnais « app complète » pour la recette visuelle (qa-app.html).
 *
 * Monte la vraie application (src/main.tsx) dans un navigateur ordinaire :
 * - le pont Tauri est remplacé par `mockIPC` ;
 * - le plugin SQL s'exécute sur une SQLite en mémoire (sql.js, WebAssembly)
 *   construite avec les vraies migrations de src-tauri/migrations ;
 * - les commandes Rust qui touchent la base (profils, livres, cache TMDB,
 *   préférences) sont reproduites en SQL ; les autres renvoient une réponse
 *   neutre et sont journalisées.
 *
 * Aucune base réelle n'est ouverte, aucun fichier n'est écrit, aucun
 * fournisseur (TMDB, IGDB, OpenLibrary) n'est contacté.
 *
 * Scénarios, via ?scenario= :
 *   full (défaut)  sept bibliothèques remplies
 *   empty          profil ouvert mais bibliothèques vides
 *   onboarding     aucun profil : premier lancement
 *
 * Langue, via ?lang= : fr (défaut), en, auto (détection réelle) — voir qaLanguage.ts.
 */
import './qaLanguage.ts'
import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks'
import type { NativeCustomEntryWritePayload } from '../data/nativeCustomEntries.ts'
import type { CustomLibraryId } from '../domain/customLibraries.ts'
import {
  QA_PROFILE_ID,
  QA_PROFILE_NAME,
  QA_RECETTE_NOW,
  seedArtworks,
  seedBooks,
  seedCustomLibraries,
  seedFilms,
  seedGames,
  seedSeries,
} from './appSeed.ts'

type Scenario = 'full' | 'empty' | 'onboarding'

/** Tables des bibliothèques personnalisées (migration 0021). */
const CUSTOM_TABLES = ['comics', 'magazines', 'audiobooks', 'music', 'podcasts', 'documentaries', 'shows', 'board_games', 'recipes'] as const
type Args = Record<string, unknown>
type Row = Record<string, unknown>

const scenario: Scenario = (() => {
  const value = new URLSearchParams(window.location.search).get('scenario')
  return value === 'empty' || value === 'onboarding' ? value : 'full'
})()

const migrations = import.meta.glob('../../src-tauri/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl })
const db: Database = new SQL.Database()
db.exec('PRAGMA foreign_keys = ON')
for (const path of Object.keys(migrations).sort()) {
  db.exec(migrations[path])
}

// ─── Accès SQL ──────────────────────────────────────────────────────────────

/** Le plugin SQL lie des valeurs JSON ; SQLite attend des scalaires. */
function toSqlValue(value: unknown): SqlValue {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number' || typeof value === 'string') return value
  return JSON.stringify(value)
}

/** sqlx et le plugin utilisent `$1, $2…` : sql.js les lie comme paramètres nommés. */
function bindings(query: string, values: unknown[] = []): Record<string, SqlValue> | SqlValue[] {
  if (/\$\d+/.test(query)) {
    return Object.fromEntries(values.map((value, index) => [`$${index + 1}`, toSqlValue(value)]))
  }
  return values.map(toSqlValue)
}

function select(query: string, values: unknown[] = []): Row[] {
  const statement = db.prepare(query)
  try {
    statement.bind(bindings(query, values))
    const rows: Row[] = []
    while (statement.step()) rows.push(statement.getAsObject())
    return rows
  } finally {
    statement.free()
  }
}

function execute(query: string, values: unknown[] = []): [number, number] {
  db.run(query, bindings(query, values))
  const rowsAffected = db.getRowsModified()
  const lastInsertId = Number(db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0)
  return [rowsAffected, lastInsertId]
}

function insert(table: string, row: Row) {
  const columns = Object.keys(row)
  const placeholders = columns.map((_, index) => `$${index + 1}`)
  execute(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`, columns.map((column) => row[column]))
}

const now = () => new Date().toISOString()

// ─── Données de départ ──────────────────────────────────────────────────────

if (scenario !== 'onboarding') {
  insert('profiles', { id: QA_PROFILE_ID, name: QA_PROFILE_NAME, avatar_data_url: null, created_at: '2025-03-02T09:00:00.000Z', updated_at: QA_RECETTE_NOW })
  execute('UPDATE current_profile SET profile_id = $1 WHERE singleton = 1', [QA_PROFILE_ID])
}

if (scenario === 'full') {
  const { films, tmdbCache } = seedFilms()
  films.forEach((row) => insert('films', row))
  tmdbCache.forEach((row) => insert('film_tmdb_cache', row))
  const { series, anime } = seedSeries()
  series.forEach((row) => insert('series', row))
  anime.forEach((row) => insert('anime', row))
  const { books, mangas, quotes, mangaQuotes } = seedBooks()
  books.forEach((row) => insert('books', row))
  mangas.forEach((row) => insert('mangas', row))
  quotes.forEach((row) => insert('book_quotes', row))
  mangaQuotes.forEach((row) => insert('manga_quotes', row))
  seedGames().forEach((row) => insert('games', row))
  seedArtworks().forEach((row) => insert('artworks', row))
  const custom = seedCustomLibraries()
  custom.libraries.forEach((row) => insert('profile_libraries', row))
  custom.entries.forEach(([table, row]) => insert(table, row))
  custom.quotes.forEach((row) => insert('comic_quotes', row))
}

// ─── Commandes Rust reproduites ─────────────────────────────────────────────

function fail(message: string): never {
  throw message
}

/** Native whole-profile commands are reproduced only in the in-memory QA DB.
 * They remain separate evidence from the real Rust transaction tests. */
function importPortableProfile(payload: Row, create: boolean) {
  const profile = payload.profile as Row
  const sections = ['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks'] as const
  db.exec('BEGIN')
  try {
    if (create) insert('profiles', { id: profile.id, name: profile.name, created_at: profile.createdAt, updated_at: profile.updatedAt })
    else {
      if (select('SELECT id FROM profiles WHERE id = $1', [profile.id]).length !== 1) fail('Profil cible introuvable.')
      for (const table of [...sections, ...CUSTOM_TABLES]) if (Number(select(`SELECT COUNT(*) AS n FROM ${table} WHERE profile_id = $1`, [profile.id])[0].n) > 0) fail('Le profil cible doit être vide.')
    }
    for (const table of sections) {
      for (const entry of (payload[table] ?? []) as Row[]) {
        const row: Row = {}
        for (const [key, value] of Object.entries(entry)) {
          if (key === 'quotes' || ((table === 'anime' || table === 'mangas') && key === 'category')) continue
          const column = key.replace(/[A-Z]/gu, character => `_${character.toLowerCase()}`)
          row[column] = key === 'customFields' ? JSON.stringify(value ?? []) : value
        }
        insert(table, row)
        if (table === 'books' || table === 'mangas') for (const quote of (entry.quotes ?? []) as Row[]) {
          insert(table === 'books' ? 'book_quotes' : 'manga_quotes', { id: quote.id, [table === 'books' ? 'book_id' : 'manga_id']: entry.id, body: quote.body, position: quote.position, created_at: quote.createdAt })
        }
      }
    }
    let customEntryCount = 0
    const customLibraries = (payload.customLibraries ?? []) as Row[]
    for (const library of customLibraries) {
      const table = String(library.libraryId)
      if (!(CUSTOM_TABLES as readonly string[]).includes(table)) fail(`Bibliothèque inconnue : ${table}.`)
      execute('INSERT INTO profile_libraries (profile_id, library_id, position, added_at) VALUES ($1, $2, $3, $4) ON CONFLICT(profile_id, library_id) DO NOTHING', [profile.id, table, library.position, library.addedAt])
      for (const entry of (library.entries ?? []) as Row[]) {
        const row: Row = {}
        for (const [key, value] of Object.entries(entry)) {
          if (key === 'quotes') continue
          row[key.replace(/[A-Z]/gu, character => `_${character.toLowerCase()}`)] = key === 'details' ? JSON.stringify(value ?? {}) : value
        }
        insert(table, row)
        customEntryCount += 1
        const quotes = (entry.quotes ?? []) as Row[]
        if (quotes.length > 0 && table !== 'comics') fail('Seuls les comics portent des citations.')
        for (const quote of quotes) insert('comic_quotes', { id: quote.id, comic_id: entry.id, body: quote.body, position: quote.position, created_at: quote.createdAt })
      }
    }
    db.exec('COMMIT')
    return { profileId: profile.id, filmCount: (payload.films as Row[]).length, seriesCount: (payload.series as Row[]).length,
      animeCount: ((payload.anime ?? []) as Row[]).length, bookCount: (payload.books as Row[]).length,
      mangaCount: ((payload.mangas ?? []) as Row[]).length, gameCount: (payload.games as Row[]).length, artworkCount: (payload.artworks as Row[]).length,
      customLibraryCount: customLibraries.length, customEntryCount }
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

/** Copies JSON simulées : contenu en mémoire, registre dans la table backup_snapshots. */
const backupFiles = new Map<string, string>()
let backupSequence = 0

function writeBackupCopy(profileId: unknown, contents: unknown) {
  if (!backupSettings(profileId)) fail('Aucun dossier de sauvegarde configuré.')
  backupSequence += 1
  const stamp = new Date(Date.now() + backupSequence).toISOString()
  const fileName = `sylloge-sauvegarde-${stamp.slice(0, 10)}-${stamp.slice(11, 13)}h${stamp.slice(14, 16)}-recette-${String(backupSequence).padStart(20, '0')}.json`
  backupFiles.set(fileName, String(contents))
  execute('INSERT INTO backup_snapshots (profile_id, file_name, created_at) VALUES ($1, $2, $3)', [profileId, fileName, stamp])
  const retained = Number(select('SELECT COUNT(*) AS n FROM backup_snapshots WHERE profile_id = $1', [profileId])[0].n)
  return { fileName, retainedSnapshotCount: retained }
}

function listBackupCopies(profileId: unknown) {
  if (!backupSettings(profileId)) return []
  return select('SELECT file_name, created_at FROM backup_snapshots WHERE profile_id = $1 ORDER BY created_at DESC, file_name DESC', [profileId])
    .map((row) => ({ fileName: row.file_name, createdAt: row.created_at, available: backupFiles.has(String(row.file_name)) }))
}

function readBackupCopy(profileId: unknown, fileName: unknown) {
  const registered = select('SELECT 1 FROM backup_snapshots WHERE profile_id = $1 AND file_name = $2', [profileId, fileName]).length === 1
  const contents = backupFiles.get(String(fileName))
  if (!registered || contents === undefined) fail('Cette copie n’appartient pas à ce profil ou n’existe plus.')
  return contents
}

function backupSettings(profileId: unknown) {
  const row = select('SELECT backup_directory, last_automatic_snapshot_day FROM backup_settings WHERE profile_id = $1', [profileId])[0]
  return row ? { backupDirectory: row.backup_directory, lastAutomaticSnapshotDay: row.last_automatic_snapshot_day, directoryAvailable: true } : null
}
function configureBackup(profileId: unknown, directory: unknown) {
  if (!select('SELECT id FROM profiles WHERE id = $1', [profileId]).length) fail('Profil introuvable.')
  execute('INSERT INTO backup_settings (profile_id, backup_directory, last_automatic_snapshot_day, updated_at) VALUES ($1, $2, NULL, $3) ON CONFLICT(profile_id) DO UPDATE SET backup_directory = excluded.backup_directory, last_automatic_snapshot_day = NULL, updated_at = excluded.updated_at', [profileId, directory, now()])
  return backupSettings(profileId)
}

function listProfiles() {
  return select(`SELECT p.id, p.name, p.avatar_data_url, p.created_at, p.updated_at,
      (SELECT COUNT(*) FROM films WHERE profile_id = p.id) AS film_count,
      (SELECT COUNT(*) FROM series WHERE profile_id = p.id) AS series_count,
      (SELECT COUNT(*) FROM anime WHERE profile_id = p.id) AS anime_count,
      (SELECT COUNT(*) FROM books WHERE profile_id = p.id) AS book_count,
      (SELECT COUNT(*) FROM mangas WHERE profile_id = p.id) AS manga_count,
      (SELECT COUNT(*) FROM games WHERE profile_id = p.id) AS game_count,
      (SELECT COUNT(*) FROM artworks WHERE profile_id = p.id) AS artwork_count,
      (${CUSTOM_TABLES.map((table) => `(SELECT COUNT(*) FROM ${table} WHERE profile_id = p.id)`).join(' + ')}) AS custom_count
    FROM profiles p ORDER BY p.created_at ASC, p.name COLLATE NOCASE ASC`).map((row) => ({
    id: row.id,
    name: row.name,
    avatarDataUrl: row.avatar_data_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    filmCount: row.film_count,
    seriesCount: row.series_count,
    animeCount: row.anime_count,
    bookCount: row.book_count,
    mangaCount: row.manga_count,
    gameCount: row.game_count,
    artworkCount: row.artwork_count,
    customCount: row.custom_count,
  }))
}

function profileName(name: unknown): string {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) fail('Le nom du profil ne peut pas être vide.')
  if ([...trimmed].length > 60) fail('Le nom du profil ne peut pas dépasser 60 caractères.')
  return trimmed
}

type BookPayload = { library: string; book: Row; quotes: Array<{ id: string; bookId: string; body: string; position: number; createdAt: string }> }

type BookTable = 'books' | 'mangas'
function bookTable(value: unknown): BookTable {
  const table = typeof value === 'string' ? value.trim() : ''
  if (table !== 'books' && table !== 'mangas') fail(`Bibliothèque de livres inconnue : « ${String(value)} ».`)
  return table as BookTable
}
function bookCategoryTable(value: unknown): BookTable {
  const category = String(value).trim()
  if (category.toLowerCase() === 'comics') fail('Les comics ont leur propre bibliothèque : enregistrez-les dans la bibliothèque Comics.')
  if (category === 'manga') return 'mangas'
  if (category === 'livre') return 'books'
  return fail(`Catégorie de livre inconnue : « ${category} ».`)
}
function bookQuotes(table: BookTable) {
  return table === 'mangas' ? { table: 'manga_quotes', owner: 'manga_id' } : { table: 'book_quotes', owner: 'book_id' }
}

function writeBook(payload: BookPayload, mode: 'create' | 'update'): void {
  const book = payload.book
  const source = bookTable(payload.library)
  const categoryTable = bookCategoryTable(book.category)
  const target = mode === 'create' ? source : categoryTable
  if (mode === 'create' && source === 'books' && categoryTable === 'mangas') fail('Un manga doit être enregistré dans la bibliothèque Mangas.')
  if (!String(book.id ?? '').trim() || !String(book.profileId ?? '').trim()) fail('Le livre ou son profil possède un identifiant invalide.')
  if (!String(book.title ?? '').trim()) fail('Le titre du livre est obligatoire.')
  payload.quotes.forEach((quote, index) => {
    if (!quote.id.trim() || quote.bookId !== book.id) fail('Une citation ne correspond pas au livre à enregistrer.')
    if (!quote.body.trim() || quote.position !== index) fail('Les citations doivent être non vides et ordonnées.')
  })
  const columns: Row = {
    title: book.title, author: book.author, year: book.year, summary: book.summary,
    ...(target === 'books' ? { category: book.category } : {}),
    status: book.status, rating: book.rating, is_favorite: book.isFavorite,
    volumes_read: book.volumesRead, volumes_total: book.volumesTotal,
    progress_updated_at: book.progressUpdatedAt, started_at: book.startedAt,
    cover_url: book.coverUrl, personal_note: book.personalNote, updated_at: book.updatedAt,
  }
  db.exec('BEGIN')
  try {
    if (mode === 'update' && select(`SELECT id FROM ${source} WHERE id = $1 AND profile_id = $2`, [book.id, book.profileId]).length !== 1) fail('Le livre à modifier est introuvable dans le profil courant.')
    if (mode === 'create' || source !== target) {
      insert(target, { id: book.id, profile_id: book.profileId, ...columns, created_at: book.createdAt })
    } else {
      const entries = Object.entries(columns)
      const [affected] = execute(
        `UPDATE ${target} SET ${entries.map(([column], index) => `${column} = $${index + 1}`).join(', ')} WHERE id = $${entries.length + 1} AND profile_id = $${entries.length + 2}`,
        [...entries.map(([, value]) => value), book.id, book.profileId],
      )
      if (affected !== 1) fail('Le livre à modifier est introuvable dans le profil courant.')
      const quotes = bookQuotes(target)
      execute(`DELETE FROM ${quotes.table} WHERE ${quotes.owner} = $1`, [book.id])
    }
    const quotes = bookQuotes(target)
    payload.quotes.forEach((quote) => insert(quotes.table, {
      id: quote.id, [quotes.owner]: quote.bookId, body: quote.body, position: quote.position, created_at: quote.createdAt,
    }))
    if (source !== target) {
      // Move links before deleting the source: its AFTER DELETE trigger must
      // not delete the moved link. The source quote cascade stays in this tx.
      execute('UPDATE media_provider_links SET medium = $1, updated_at = $2 WHERE profile_id = $3 AND medium = $4 AND media_id = $5', [target, book.updatedAt, book.profileId, source, book.id])
      execute(`DELETE FROM ${source} WHERE id = $1 AND profile_id = $2`, [book.id, book.profileId])
    }
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

function deleteBook(profileId: unknown, bookId: unknown, library: unknown): void {
  const table = bookTable(library)
  if (!String(profileId ?? '').trim() || !String(bookId ?? '').trim()) fail('Le livre ou son profil possède un identifiant invalide.')
  db.exec('BEGIN')
  try {
    const [affected] = execute(`DELETE FROM ${table} WHERE id = $1 AND profile_id = $2`, [bookId, profileId])
    if (affected !== 1) fail('Le livre à supprimer est introuvable dans le profil courant.')
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

// ─── Custom-entry native command mocks ─────────────────────────────────────

function customTable(libraryId: unknown): CustomLibraryId {
  if (typeof libraryId !== 'string' || !(CUSTOM_TABLES as readonly string[]).includes(libraryId)) fail(`Bibliothèque inconnue : ${String(libraryId)}.`)
  return libraryId as CustomLibraryId
}

function writeCustomEntry(payload: NativeCustomEntryWritePayload, mode: 'create' | 'update'): void {
  const table = customTable(payload.libraryId)
  const entry = payload.entry
  if (!entry.id.trim() || !entry.profileId.trim()) fail('La fiche ou son profil possède un identifiant invalide.')
  if (!entry.title.trim()) fail('Le titre est obligatoire.')
  if (!['à découvrir', 'en cours', 'terminé', 'abandonné'].includes(entry.status)) fail('Le statut de la fiche est invalide.')
  if (table !== 'comics' && entry.quotes.length) fail('Seuls les comics portent des citations.')
  entry.quotes.forEach((quote, index) => {
    if (!quote.id.trim() || quote.entryId !== entry.id) fail('Une citation ne correspond pas à la fiche à enregistrer.')
    if (!quote.body.trim() || quote.position !== index) fail('Les citations doivent être non vides et ordonnées.')
  })
  const columns: Row = {
    title: entry.title, creator: entry.creator, year: entry.year, status: entry.status,
    rating: entry.rating, is_favorite: entry.isFavorite, progress_current: entry.progressCurrent,
    progress_total: entry.progressTotal, progress_updated_at: entry.progressUpdatedAt,
    started_at: entry.startedAt, finished_at: entry.finishedAt, cover_url: entry.coverUrl,
    summary: entry.summary, personal_note: entry.personalNote, details: JSON.stringify(entry.details), updated_at: entry.updatedAt,
  }
  db.exec('BEGIN')
  try {
    if (mode === 'create') insert(table, { id: entry.id, profile_id: entry.profileId, ...columns, created_at: entry.createdAt })
    else {
      const fields = Object.entries(columns)
      const [affected] = execute(
        `UPDATE ${table} SET ${fields.map(([column], index) => `${column} = $${index + 1}`).join(', ')} WHERE id = $${fields.length + 1} AND profile_id = $${fields.length + 2}`,
        [...fields.map(([, value]) => value), entry.id, entry.profileId],
      )
      if (affected !== 1) fail('La fiche à modifier est introuvable dans le profil courant.')
    }
    if (table === 'comics') {
      const previous = mode === 'update' ? select('SELECT id, body, created_at FROM comic_quotes WHERE comic_id = $1 ORDER BY position ASC, id ASC', [entry.id]) : []
      if (mode === 'update') execute('DELETE FROM comic_quotes WHERE comic_id = $1', [entry.id])
      for (const quote of entry.quotes) {
        const reusedIndex = previous.findIndex(old => old.body === quote.body)
        const reused = reusedIndex >= 0 ? previous.splice(reusedIndex, 1)[0] : null
        insert('comic_quotes', { id: reused?.id ?? quote.id, comic_id: quote.entryId, body: quote.body, position: quote.position, created_at: reused?.created_at ?? quote.createdAt })
      }
    }
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

function deleteCustomEntry(profileId: string, libraryId: CustomLibraryId, entryId: string): void {
  const table = customTable(libraryId)
  if (!profileId.trim() || !entryId.trim()) fail('La fiche ou son profil possède un identifiant invalide.')
  db.exec('BEGIN')
  try {
    const [affected] = execute(`DELETE FROM ${table} WHERE id = $1 AND profile_id = $2`, [entryId, profileId])
    if (affected !== 1) fail('La fiche à supprimer est introuvable dans le profil courant.')
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

function removeCustomLibrary(profileId: string, libraryId: CustomLibraryId): void {
  const table = customTable(libraryId)
  if (!profileId.trim()) fail('Le profil possède un identifiant invalide.')
  db.exec('BEGIN')
  try {
    execute(`DELETE FROM ${table} WHERE profile_id = $1`, [profileId])
    execute('DELETE FROM profile_libraries WHERE profile_id = $1 AND library_id = $2', [profileId, table])
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

// ─── End custom-entry native command mocks ─────────────────────────────────

function updaterPreferences() {
  const [row] = select('SELECT automatic_checks_enabled, ignored_version, updated_at FROM updater_preferences WHERE singleton = 1')
  return { automaticChecksEnabled: row.automatic_checks_enabled === 1, ignoredVersion: row.ignored_version, updatedAt: row.updated_at }
}

function cachedFilm(filmId: unknown) {
  const [row] = select('SELECT * FROM film_tmdb_cache WHERE film_id = $1', [filmId])
  if (!row) return null
  return {
    filmId: row.film_id,
    language: row.language,
    fetchedAt: row.fetched_at,
    refreshAfter: row.refresh_after,
    expiresAt: row.expires_at,
    refreshDue: false,
    selectedPosterUrl: row.selected_poster_url,
    presentation: JSON.parse(String(row.payload_json)),
  }
}

const fakePoster = (seed: string) => `https://picsum.photos/seed/sylloge-search-${encodeURIComponent(seed)}/400/600`

function fakeCandidates(query: unknown) {
  const base = String(query ?? '').trim() || 'Recherche'
  return [0, 1, 2, 3, 4].map((index) => ({
    id: index,
    title: index === 0 ? base : `${base} ${['II', '— le retour', 'origines', '(version restaurée)'][index - 1]}`,
    year: 2023 - index * 6,
    poster: index === 3 ? null : fakePoster(`${base}-${index}`),
  }))
}

function filmPresentation(tmdbId: number, title: string) {
  return {
    tmdbId,
    title,
    originalTitle: null,
    releaseDate: '2021-09-01',
    runtimeMinutes: 112,
    synopsis: 'Synopsis factice de recette : aucun fournisseur n’a été contacté.',
    directors: ['Réalisatrice de recette'],
    posterUrl: fakePoster(`${title}-preview`),
    alternativePosterUrls: [1, 2, 3, 4, 5].map((index) => fakePoster(`${title}-alt-${index}`)),
    cast: [['Interprète A', 'Rôle principal'], ['Interprète B', 'Second rôle'], ['Interprète C', null]].map(([name, character]) => ({
      name, character, portraitUrl: `https://picsum.photos/seed/sylloge-cast-${encodeURIComponent(String(name))}/200/260`,
    })),
  }
}

function associateFilm(filmId: unknown, tmdbId: number) {
  const [film] = select('SELECT title FROM films WHERE id = $1', [filmId])
  if (!film) fail('Le film à associer est introuvable.')
  const presentation = filmPresentation(tmdbId, String(film.title))
  execute('DELETE FROM film_tmdb_cache WHERE film_id = $1', [filmId])
  insert('film_tmdb_cache', {
    film_id: filmId as string, tmdb_id: tmdbId, language: 'fr-FR', payload_json: JSON.stringify(presentation),
    fetched_at: now().slice(0, 19) + 'Z', refresh_after: '2026-11-15T10:00:00Z', expires_at: '2027-04-16T10:00:00Z', selected_poster_url: null,
  })
  execute("UPDATE films SET provider_name = 'tmdb', provider_id = $1, updated_at = $2 WHERE id = $3", [String(tmdbId), now(), filmId])
  return cachedFilm(filmId)
}

const unmocked = new Set<string>()
// Adresses confiées au système par le plugin d'ouverture (aucun navigateur n'est réellement lancé).
const opened: string[] = []
// Thèmes demandés à la barre de titre native (null = suivre le système).
const windowThemes: Array<string | null> = []
// Cartes à partager enregistrées (octets du PNG), pour que la recette les relise.
const savedImages: number[][] = []
/** Les adresses d'images demandées à la commande native : la recette vérifie que la carte passe par elle. */
const fetchedImages: string[] = []

function handle(cmd: string, args: Args): unknown {
  switch (cmd) {
    // Plugin SQL
    case 'plugin:sql|load': return args.db
    case 'plugin:sql|execute': return execute(String(args.query), (args.values as unknown[]) ?? [])
    case 'plugin:sql|select': return select(String(args.query), (args.values as unknown[]) ?? [])
    case 'plugin:sql|close': return true

    // Plugins natifs sans effet en recette
    case 'plugin:app|version': return '0.6.0-recette'
    case 'plugin:app|name': return 'Sylloge (recette)'
    case 'plugin:updater|check': return null
    case 'plugin:process|restart':
    case 'plugin:process|exit': return null
    // Thème de la barre de titre : le dernier demandé est lisible par la recette (null = suivre le système).
    case 'plugin:window|set_theme': windowThemes.push((args.value as string | null) ?? null); return null
    case 'plugin:opener|open_url': opened.push(String(args.url)); return null
    case 'save_share_image': {
      const bytes = args instanceof ArrayBuffer ? new Uint8Array(args) : (args as unknown as Uint8Array)
      savedImages.push(Array.from(bytes))
      // Le vrai pont propose un nom et rend celui du fichier choisi ; la recette ne choisit rien.
      return 'sylloge-carte-recette.png'
    }
    // Octets d'une affiche pour la carte : le vrai pont les demande à Rust (le canevas n'a alors besoin
    // d'aucune autorisation inter-sites) ; la recette les prend au serveur simulé, et échoue comme lui.
    case 'fetch_remote_image': {
      const url = String(args.url ?? '')
      if (!/^https?:\/\//.test(url)) throw new Error('Adresse d’image invalide.')
      fetchedImages.push(url)
      return fetch(url).then(async response => {
        if (!response.ok) throw new Error(`Le serveur a refusé l’image (${response.status}).`)
        return await response.arrayBuffer()
      })
    }

    // Profils
    case 'list_profiles': return listProfiles()
    case 'select_profile': {
      const [affected] = execute(
        'UPDATE current_profile SET profile_id = $1, updated_at = $2 WHERE singleton = 1 AND EXISTS (SELECT 1 FROM profiles WHERE id = $1)',
        [args.profileId, now()],
      )
      if (affected !== 1) fail('Le profil à ouvrir est introuvable.')
      return null
    }
    case 'create_profile': {
      const input = args.input as Row
      const name = profileName(input.name)
      const [{ count }] = select('SELECT COUNT(*) AS count FROM profiles')
      if (Number(count) >= 5) fail('Le nombre maximal de 5 profils est atteint. Supprimez un profil avant d’en créer un autre.')
      insert('profiles', { id: input.id as string, name, avatar_data_url: (input.avatarDataUrl as string) ?? null, created_at: now(), updated_at: now() })
      if (input.selectAfterCreation) execute('UPDATE current_profile SET profile_id = $1, updated_at = $2 WHERE singleton = 1', [input.id, now()])
      return null
    }
    case 'rename_profile':
    case 'update_profile': {
      const input = args.input as Row
      const name = profileName(input.name)
      const query = cmd === 'rename_profile'
        ? ['UPDATE profiles SET name = $1, updated_at = $2 WHERE id = $3', [name, now(), input.profileId]]
        : ['UPDATE profiles SET name = $1, avatar_data_url = $2, updated_at = $3 WHERE id = $4', [name, input.avatarDataUrl ?? null, now(), input.profileId]]
      const [affected] = execute(query[0] as string, query[1] as unknown[])
      if (affected !== 1) fail('Le profil à modifier est introuvable.')
      return null
    }
    case 'delete_profile': {
      const profileId = args.profileId
      db.exec('BEGIN')
      execute('DELETE FROM book_quotes WHERE book_id IN (SELECT id FROM books WHERE profile_id = $1)', [profileId])
      execute('DELETE FROM manga_quotes WHERE manga_id IN (SELECT id FROM mangas WHERE profile_id = $1)', [profileId])
      execute('DELETE FROM comic_quotes WHERE comic_id IN (SELECT id FROM comics WHERE profile_id = $1)', [profileId])
      for (const table of ['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks', ...CUSTOM_TABLES, 'profile_libraries', 'backup_snapshots', 'backup_settings', 'saved_views']) {
        execute(`DELETE FROM ${table} WHERE profile_id = $1`, [profileId])
      }
      execute('DELETE FROM profiles WHERE id = $1', [profileId])
      execute('UPDATE current_profile SET profile_id = NULL WHERE singleton = 1 AND profile_id = $1', [profileId])
      db.exec('COMMIT')
      return null
    }

    // Livres (écriture atomique côté Rust)
    case 'create_book_atomically': writeBook(args.payload as BookPayload, 'create'); return null
    case 'update_book_atomically': writeBook(args.payload as BookPayload, 'update'); return null
    case 'delete_book_atomically': deleteBook(args.profileId, args.bookId, args.library); return null

    // Bibliothèques personnalisées : mêmes transactions et contrats void que Rust.
    case 'create_custom_entry_atomically': writeCustomEntry(args.payload as NativeCustomEntryWritePayload, 'create'); return null
    case 'update_custom_entry_atomically': writeCustomEntry(args.payload as NativeCustomEntryWritePayload, 'update'); return null
    case 'delete_custom_entry_atomically': deleteCustomEntry(args.profileId as string, args.libraryId as CustomLibraryId, args.entryId as string); return null
    case 'remove_custom_library_atomically': removeCustomLibrary(args.profileId as string, args.libraryId as CustomLibraryId); return null

    // Préférences de mise à jour
    // `?update=0.6.11` simule une version publiée : l'annonce, « Plus tard » et « Ne plus proposer » s'exercent
    // sans réseau ni release réelle. Sans le paramètre, aucune mise à jour n'est proposée.
    case 'check_for_app_update': {
      const simulated = new URLSearchParams(window.location.search).get('update')
      return simulated ? { version: simulated, notes: 'Recette : notes de version simulées.' } : null
    }
    case 'install_app_update': return null // le redémarrage n'existe pas dans le harnais navigateur
    case 'get_updater_preferences': return updaterPreferences()
    case 'set_updater_automatic_checks_enabled':
      execute('UPDATE updater_preferences SET automatic_checks_enabled = $1, updated_at = $2 WHERE singleton = 1', [args.automaticChecksEnabled, now()])
      return updaterPreferences()
    case 'set_ignored_updater_version':
      execute('UPDATE updater_preferences SET ignored_version = $1, updated_at = $2 WHERE singleton = 1', [args.ignoredVersion ?? null, now()])
      return updaterPreferences()

    // Sauvegardes : aucun fichier réel, réglages dans SQLite mémoire seulement.
    case 'get_backup_settings': return backupSettings(args.profileId)
    case 'pick_backup_destination': return { backupDirectory: '/recette/Sauvegardes Sylloge', lastAutomaticSnapshotDay: null, directoryAvailable: true }
    case 'configure_backup_destination': return configureBackup(args.profileId, args.backupDirectory)
    case 'pick_backup_directory': return configureBackup(args.profileId, '/recette/Sauvegardes Sylloge')
    case 'clear_backup_settings': execute('DELETE FROM backup_settings WHERE profile_id = $1', [args.profileId]); return null
    case 'save_manual_backup_snapshot': return writeBackupCopy(args.profileId, args.contents)
    case 'save_automatic_backup_snapshot': {
      const settings = backupSettings(args.profileId)
      if (!settings) return { outcome: 'notConfigured', fileName: null }
      if (settings.lastAutomaticSnapshotDay === args.automaticDay) return { outcome: 'alreadySaved', fileName: null }
      const saved = writeBackupCopy(args.profileId, args.contents)
      execute('UPDATE backup_settings SET last_automatic_snapshot_day = $1 WHERE profile_id = $2', [args.automaticDay, args.profileId])
      return { outcome: 'saved', fileName: saved.fileName }
    }
    case 'list_backup_snapshots': return listBackupCopies(args.profileId)
    case 'read_backup_snapshot': return readBackupCopy(args.profileId, args.fileName)
    // Recherche bornée : aucune sauvegarde sur la machine de recette par défaut.
    case 'find_backup_candidates': return { candidates: [], unreadableLocations: [] }
    case 'import_library_document_into_empty_profile': return importPortableProfile(args.payload as Row, false)
    case 'import_library_document_atomically': return importPortableProfile(args.payload as Row, true)

    // Sélecteurs et exports : l'utilisateur « annule »
    case 'pick_import_any':
    case 'pick_import_container':
    case 'pick_import_json':
    case 'pick_import_films_csv_or_notion':
    case 'save_export_json':
    case 'save_export_csv': return null

    // TMDB / IGDB / OpenLibrary : réponses factices, aucun appel réseau
    case 'purge_expired_tmdb_cache': return 0
    case 'get_film_tmdb_cache': return cachedFilm(args.filmId)
    case 'search_tmdb_films':
    case 'search_tmdb_series':
      return fakeCandidates(args.query).map((candidate) => ({
        tmdbId: 800_000 + candidate.id, title: candidate.title, originalTitle: null,
        releaseYear: candidate.year, synopsis: 'Résultat factice de recette.', posterUrl: candidate.poster,
      }))
    case 'preview_tmdb_film': return filmPresentation(Number(args.tmdbId), `Œuvre ${args.tmdbId}`)
    // Photo d'un réalisateur : comme le vrai service, une personne sans photo publiée rend `null`.
    case 'fetch_tmdb_director_portrait': {
      const name = String(args.name ?? '').trim()
      if (name === '' || typeof args.tmdbId !== 'number') throw new Error('Appel de portrait invalide.')
      return /sans photo/i.test(name) ? null : `https://picsum.photos/seed/sylloge-director-${encodeURIComponent(name)}/200/260`
    }
    case 'preview_tmdb_series':
      return { tmdbId: args.tmdbId, title: `Série ${args.tmdbId}`, originalTitle: null, firstAirYear: 2019, synopsis: 'Synopsis factice de recette.', showrunners: ['Showrunner de recette'], cast: ['Interprète A', 'Interprète B'], seasonsTotal: 3, posterUrl: fakePoster(`series-${args.tmdbId}`) }
    case 'associate_film_with_tmdb': return associateFilm(args.filmId, Number(args.tmdbId))
    case 'refresh_film_tmdb_cache': return cachedFilm(args.filmId)
    case 'remove_tmdb_association':
      execute('DELETE FROM film_tmdb_cache WHERE film_id = $1', [args.filmId])
      execute('UPDATE films SET provider_name = NULL, provider_id = NULL WHERE id = $1', [args.filmId])
      return null
    case 'set_film_tmdb_poster': {
      // Même contrat que la commande native (tmdb/mod.rs) : pas d'association, pas de choix ; et
      // seule une affiche connue du cache est acceptée. Un simulateur plus souple masquerait qu'un
      // lien personnel ne peut pas passer par ici.
      const current = cachedFilm(args.filmId)
      if (!current) fail('Aucune association TMDB pour ce film.')
      if (args.posterUrl != null) {
        const known = [current.presentation.posterUrl, ...(current.presentation.alternativePosterUrls ?? [])]
        if (!known.includes(args.posterUrl)) fail("L'affiche choisie ne fait pas partie des affiches TMDB du cache.")
      }
      execute('UPDATE film_tmdb_cache SET selected_poster_url = $1 WHERE film_id = $2', [args.posterUrl ?? null, args.filmId])
      return cachedFilm(args.filmId)
    }
    case 'search_igdb_games':
      return fakeCandidates(args.query).map((candidate) => ({ gameId: 700_000 + candidate.id, title: candidate.title, releaseYear: candidate.year, coverUrl: candidate.poster }))
    case 'preview_igdb_game':
      return { gameId: args.gameId, title: args.title, developer: 'Studio de recette', releaseYear: args.releaseYear ?? null, coverUrl: args.coverUrl ?? null }
    case 'search_openlibrary_books':
      return fakeCandidates(args.query).map((candidate) => ({ workKey: `/works/OLQA${candidate.id}W`, title: candidate.title, author: 'Autrice de recette', firstPublishYear: candidate.year, coverUrl: candidate.poster }))
    case 'preview_openlibrary_book':
      return { workKey: args.workKey, title: args.title, author: args.author ?? null, firstPublishYear: args.firstPublishYear ?? null, synopsis: 'Résumé factice de recette.', coverUrl: args.coverUrl ?? null }

    default:
      if (!unmocked.has(cmd)) {
        unmocked.add(cmd)
        console.warn('[recette] commande non simulée :', cmd, args)
      }
      return null
  }
}

mockWindows('main')
mockIPC((cmd, args) => handle(cmd, (args ?? {}) as Args), { shouldMockEvents: true })

// Accès de débogage pour la recette (console, Playwright).
Object.assign(window, {
  __syllogeRecette: {
    scenario,
    select: (query: string, values: unknown[] = []) => select(query, values),
    execute: (query: string, values: unknown[] = []) => execute(query, values),
    unmocked: () => [...unmocked],
    opened: () => [...opened],
    windowThemes: () => [...windowThemes],
    savedImages: () => savedImages.map(bytes => [...bytes]),
    fetchedImages: () => [...fetchedImages],
  },
})

await import('../main.tsx')
