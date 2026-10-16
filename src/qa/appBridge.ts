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
 *   full (défaut)  profil rempli dans les cinq bibliothèques
 *   empty          profil ouvert mais bibliothèques vides
 *   onboarding     aucun profil : premier lancement
 */
import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks'
import {
  QA_PROFILE_ID,
  QA_PROFILE_NAME,
  QA_RECETTE_NOW,
  seedArtworks,
  seedBooks,
  seedFilms,
  seedGames,
  seedSeries,
} from './appSeed.ts'

type Scenario = 'full' | 'empty' | 'onboarding'
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
  seedSeries().forEach((row) => insert('series', row))
  const { books, quotes } = seedBooks()
  books.forEach((row) => insert('books', row))
  quotes.forEach((row) => insert('book_quotes', row))
  seedGames().forEach((row) => insert('games', row))
  seedArtworks().forEach((row) => insert('artworks', row))
}

// ─── Commandes Rust reproduites ─────────────────────────────────────────────

function fail(message: string): never {
  throw message
}

function listProfiles() {
  return select(`SELECT p.id, p.name, p.avatar_data_url, p.created_at, p.updated_at,
      (SELECT COUNT(*) FROM films WHERE profile_id = p.id) AS film_count,
      (SELECT COUNT(*) FROM series WHERE profile_id = p.id) AS series_count,
      (SELECT COUNT(*) FROM books WHERE profile_id = p.id) AS book_count,
      (SELECT COUNT(*) FROM games WHERE profile_id = p.id) AS game_count,
      (SELECT COUNT(*) FROM artworks WHERE profile_id = p.id) AS artwork_count
    FROM profiles p ORDER BY p.created_at ASC, p.name COLLATE NOCASE ASC`).map((row) => ({
    id: row.id,
    name: row.name,
    avatarDataUrl: row.avatar_data_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    filmCount: row.film_count,
    seriesCount: row.series_count,
    bookCount: row.book_count,
    gameCount: row.game_count,
    artworkCount: row.artwork_count,
  }))
}

function profileName(name: unknown): string {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) fail('Le nom du profil ne peut pas être vide.')
  if ([...trimmed].length > 60) fail('Le nom du profil ne peut pas dépasser 60 caractères.')
  return trimmed
}

type BookPayload = { book: Row; quotes: Array<{ id: string; bookId: string; body: string; position: number; createdAt: string }> }

function writeBook(payload: BookPayload, mode: 'create' | 'update') {
  const book = payload.book
  if (!String(book.title ?? '').trim()) fail('Le titre du livre est obligatoire.')
  const columns = {
    title: book.title, author: book.author, year: book.year, summary: book.summary,
    category: book.category, status: book.status, rating: book.rating, is_favorite: book.isFavorite,
    volumes_read: book.volumesRead, volumes_total: book.volumesTotal,
    progress_updated_at: book.progressUpdatedAt, started_at: book.startedAt,
    cover_url: book.coverUrl, personal_note: book.personalNote, updated_at: book.updatedAt,
  }
  db.exec('BEGIN')
  try {
    if (mode === 'create') {
      insert('books', { id: book.id, profile_id: book.profileId, ...columns, created_at: book.createdAt } as Row)
    } else {
      const entries = Object.entries(columns)
      const [affected] = execute(
        `UPDATE books SET ${entries.map(([column], index) => `${column} = $${index + 1}`).join(', ')} WHERE id = $${entries.length + 1} AND profile_id = $${entries.length + 2}`,
        [...entries.map(([, value]) => value), book.id, book.profileId],
      )
      if (affected !== 1) fail('Le livre à modifier est introuvable.')
      execute('DELETE FROM book_quotes WHERE book_id = $1', [book.id])
    }
    payload.quotes.forEach((quote) => insert('book_quotes', {
      id: quote.id, book_id: quote.bookId, body: quote.body, position: quote.position, created_at: quote.createdAt,
    }))
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

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
      for (const table of ['films', 'series', 'books', 'games', 'artworks', 'backup_snapshots', 'backup_settings', 'saved_views']) {
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
    case 'delete_book_atomically':
      execute('DELETE FROM book_quotes WHERE book_id = $1', [args.bookId])
      execute('DELETE FROM books WHERE id = $1 AND profile_id = $2', [args.bookId, args.profileId])
      return null

    // Préférences de mise à jour
    case 'get_private_updater_credential_status':
    case 'remove_private_updater_token': return { supported: true, configured: cmd === 'get_private_updater_credential_status' }
    case 'set_private_updater_token': return { supported: true, configured: true }
    case 'get_updater_preferences': return updaterPreferences()
    case 'set_updater_automatic_checks_enabled':
      execute('UPDATE updater_preferences SET automatic_checks_enabled = $1, updated_at = $2 WHERE singleton = 1', [args.automaticChecksEnabled, now()])
      return updaterPreferences()
    case 'set_ignored_updater_version':
      execute('UPDATE updater_preferences SET ignored_version = $1, updated_at = $2 WHERE singleton = 1', [args.ignoredVersion ?? null, now()])
      return updaterPreferences()

    // Sauvegardes : aucun dossier choisi, aucune écriture
    case 'get_backup_settings': return null
    case 'pick_backup_directory': return { backupDirectory: '/Users/recette/Sauvegardes Sylloge', lastAutomaticSnapshotDay: null, directoryAvailable: true }
    case 'clear_backup_settings': return null
    case 'save_manual_backup_snapshot':
    case 'save_automatic_backup_snapshot': return { fileName: `sylloge-recette-${now().slice(0, 10)}.json`, retainedSnapshotCount: 3 }

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
    case 'preview_tmdb_series':
      return { tmdbId: args.tmdbId, title: `Série ${args.tmdbId}`, originalTitle: null, firstAirYear: 2019, synopsis: 'Synopsis factice de recette.', showrunners: ['Showrunner de recette'], cast: ['Interprète A', 'Interprète B'], seasonsTotal: 3, posterUrl: fakePoster(`series-${args.tmdbId}`) }
    case 'associate_film_with_tmdb': return associateFilm(args.filmId, Number(args.tmdbId))
    case 'refresh_film_tmdb_cache': return cachedFilm(args.filmId)
    case 'remove_tmdb_association':
      execute('DELETE FROM film_tmdb_cache WHERE film_id = $1', [args.filmId])
      execute('UPDATE films SET provider_name = NULL, provider_id = NULL WHERE id = $1', [args.filmId])
      return null
    case 'set_film_tmdb_poster':
      execute('UPDATE film_tmdb_cache SET selected_poster_url = $1 WHERE film_id = $2', [args.posterUrl ?? null, args.filmId])
      return cachedFilm(args.filmId)
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
  },
})

await import('../main.tsx')
