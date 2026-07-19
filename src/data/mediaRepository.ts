import { ARTWORK_FORMS, ARTWORK_STATUSES, normalizeArtwork, type Artwork, type ArtworkForm, type ArtworkStatus } from '../domain/artwork.ts'
import { BOOK_CATEGORIES, BOOK_STATUSES, normalizeBook, type Book, type BookCategory, type BookQuote, type BookStatus } from '../domain/book.ts'
import { GAME_STATUSES, normalizeGame, type Game, type GameStatus } from '../domain/game.ts'
import { SERIES_CATEGORIES, SERIES_STATUSES, normalizeSeries, type Series, type SeriesCategory, type SeriesStatus } from '../domain/series.ts'
import { DEFAULT_PROFILE_ID, loadSyllogeDatabase } from './database.ts'
import type { DatabaseLoader, IdFactory, NowFactory } from './filmsRepository.ts'

type SeriesRow = {
  id: string
  profile_id: string
  title: string
  showrunner: string | null
  casting: string | null
  summary: string | null
  category: string
  status: string
  rating: number | null
  is_favorite: number
  seasons_seen: number | null
  seasons_total: number | null
  progress_updated_at: string | null
  started_at: string | null
  poster_url: string | null
  personal_note: string | null
  created_at: string
  updated_at: string
}

type BookRow = {
  id: string
  profile_id: string
  title: string
  author: string | null
  year: number | null
  summary: string | null
  category: string
  status: string
  rating: number | null
  is_favorite: number
  volumes_read: number | null
  volumes_total: number | null
  progress_updated_at: string | null
  started_at: string | null
  cover_url: string | null
  personal_note: string | null
  created_at: string
  updated_at: string
}

type BookQuoteRow = {
  id: string
  book_id: string
  body: string
  position: number
  created_at: string
}

type GameRow = {
  id: string
  profile_id: string
  title: string
  developer: string | null
  platform: string | null
  year: number | null
  status: string
  rating: number | null
  is_favorite: number
  played_at: string | null
  cover_url: string | null
  personal_note: string | null
  created_at: string
  updated_at: string
}

type ArtworkRow = {
  id: string
  profile_id: string
  title: string
  artist: string | null
  year: number | null
  form: string
  location: string | null
  exhibition: string | null
  status: string
  is_favorite: number
  discovered_at: string | null
  image_url: string | null
  personal_note: string | null
  created_at: string
  updated_at: string
}

const SERIES_COLUMNS = `
  id,
  profile_id,
  title,
  showrunner,
  casting,
  summary,
  category,
  status,
  rating,
  is_favorite,
  seasons_seen,
  seasons_total,
  progress_updated_at,
  started_at,
  poster_url,
  personal_note,
  created_at,
  updated_at`

const BOOK_COLUMNS = `
  id,
  profile_id,
  title,
  author,
  year,
  summary,
  category,
  status,
  rating,
  is_favorite,
  volumes_read,
  volumes_total,
  progress_updated_at,
  started_at,
  cover_url,
  personal_note,
  created_at,
  updated_at`

const GAME_COLUMNS = `
  id,
  profile_id,
  title,
  developer,
  platform,
  year,
  status,
  rating,
  is_favorite,
  played_at,
  cover_url,
  personal_note,
  created_at,
  updated_at`

const ARTWORK_COLUMNS = `
  id,
  profile_id,
  title,
  artist,
  year,
  form,
  location,
  exhibition,
  status,
  is_favorite,
  discovered_at,
  image_url,
  personal_note,
  created_at,
  updated_at`

function toEnumValue<const T extends readonly string[]>(values: T, value: string, label: string): T[number] {
  if (values.includes(value)) {
    return value as T[number]
  }

  throw new Error(`${label} inconnu dans SQLite : ${value}`)
}

function toSeriesCategory(value: string): SeriesCategory {
  return toEnumValue(SERIES_CATEGORIES, value, 'Catégorie Série')
}

function toSeriesStatus(value: string): SeriesStatus {
  return toEnumValue(SERIES_STATUSES, value, 'Statut Série')
}

function toBookCategory(value: string): BookCategory {
  return toEnumValue(BOOK_CATEGORIES, value, 'Catégorie Livre')
}

function toBookStatus(value: string): BookStatus {
  return toEnumValue(BOOK_STATUSES, value, 'Statut Livre')
}

function toGameStatus(value: string): GameStatus {
  return toEnumValue(GAME_STATUSES, value, 'Statut Jeu')
}

function toArtworkForm(value: string): ArtworkForm {
  return toEnumValue(ARTWORK_FORMS, value, 'Forme d’art')
}

function toArtworkStatus(value: string): ArtworkStatus {
  return toEnumValue(ARTWORK_STATUSES, value, 'Statut Œuvre d’art')
}

export function toSeries(row: SeriesRow): Series {
  return normalizeSeries({
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    showrunner: row.showrunner,
    casting: row.casting,
    summary: row.summary,
    category: toSeriesCategory(row.category),
    status: toSeriesStatus(row.status),
    rating: row.rating,
    isFavorite: row.is_favorite === 1,
    seasonsSeen: row.seasons_seen,
    seasonsTotal: row.seasons_total,
    progressUpdatedAt: row.progress_updated_at,
    startedAt: row.started_at,
    posterUrl: row.poster_url,
    personalNote: row.personal_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function toBookQuote(row: BookQuoteRow): BookQuote {
  return {
    id: row.id,
    bookId: row.book_id,
    body: row.body,
    position: row.position,
    createdAt: row.created_at,
  }
}

export function toBook(row: BookRow, quotes: BookQuote[] = []): Book {
  return normalizeBook({
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    author: row.author,
    year: row.year,
    summary: row.summary,
    category: toBookCategory(row.category),
    status: toBookStatus(row.status),
    rating: row.rating,
    isFavorite: row.is_favorite === 1,
    volumesRead: row.volumes_read,
    volumesTotal: row.volumes_total,
    progressUpdatedAt: row.progress_updated_at,
    startedAt: row.started_at,
    coverUrl: row.cover_url,
    personalNote: row.personal_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    quotes,
  })
}

export function toGame(row: GameRow): Game {
  return normalizeGame({
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    developer: row.developer,
    platform: row.platform,
    year: row.year,
    status: toGameStatus(row.status),
    rating: row.rating,
    isFavorite: row.is_favorite === 1,
    playedAt: row.played_at,
    coverUrl: row.cover_url,
    personalNote: row.personal_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function toArtwork(row: ArtworkRow): Artwork {
  return normalizeArtwork({
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    artist: row.artist,
    year: row.year,
    form: toArtworkForm(row.form),
    location: row.location,
    exhibition: row.exhibition,
    status: toArtworkStatus(row.status),
    isFavorite: row.is_favorite === 1,
    discoveredAt: row.discovered_at,
    imageUrl: row.image_url,
    personalNote: row.personal_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export type SeriesSearchCriteria = {
  query: string
  category: SeriesCategory | 'all'
}

export class SqliteMediaRepository {
  private readonly loadDatabase: DatabaseLoader
  private readonly createId: IdFactory
  private readonly now: NowFactory

  constructor(
    loadDatabase: DatabaseLoader = loadSyllogeDatabase,
    createId: IdFactory = () => crypto.randomUUID(),
    now: NowFactory = () => new Date().toISOString(),
  ) {
    this.loadDatabase = loadDatabase
    this.createId = createId
    this.now = now
  }

  async listSeries(profileId: string): Promise<Series[]> {
    const database = await this.loadDatabase()
    const rows = await database.select<SeriesRow[]>(
      `SELECT ${SERIES_COLUMNS}
       FROM series
       WHERE profile_id = $1
       ORDER BY title COLLATE NOCASE ASC, created_at ASC`,
      [profileId],
    )

    return rows.map(toSeries)
  }

  async searchSeries(profileId: string, criteria: SeriesSearchCriteria): Promise<Series[]> {
    const database = await this.loadDatabase()
    const clauses = ['profile_id = $1']
    const bindValues: unknown[] = [profileId]
    const query = criteria.query.trim()

    if (query) {
      bindValues.push(`%${escapeLikePattern(query)}%`)
      const searchParameter = `$${bindValues.length}`
      clauses.push(`(
        title COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
        OR showrunner COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
        OR casting COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
      )`)
    }

    if (criteria.category !== 'all') {
      bindValues.push(criteria.category)
      clauses.push(`category = $${bindValues.length}`)
    }

    const rows = await database.select<SeriesRow[]>(
      `SELECT ${SERIES_COLUMNS}
       FROM series
       WHERE ${clauses.join('\n         AND ')}
       ORDER BY
         COALESCE(progress_updated_at, updated_at) DESC,
         title COLLATE NOCASE ASC`,
      bindValues,
    )

    return rows.map(toSeries)
  }

  async getSeries(profileId: string, id: string): Promise<Series | null> {
    const database = await this.loadDatabase()
    const rows = await database.select<SeriesRow[]>(
      `SELECT ${SERIES_COLUMNS}
       FROM series
       WHERE id = $1 AND profile_id = $2
       LIMIT 1`,
      [id, profileId],
    )

    return rows[0] ? toSeries(rows[0]) : null
  }

  async createSeries(
    profileId: string,
    input: Omit<Series, 'id' | 'profileId' | 'createdAt' | 'updatedAt' | 'progressUpdatedAt'>,
  ): Promise<Series> {
    const database = await this.loadDatabase()
    const id = this.createId()
    const now = this.now()
    const series = normalizeSeries({
      id,
      profileId,
      ...input,
      progressUpdatedAt: resolveInitialProgress(input.seasonsSeen, now),
      createdAt: now,
      updatedAt: now,
    })
    const result = await database.execute(
      `INSERT INTO series (
         id,
         profile_id,
         title,
         showrunner,
         casting,
         summary,
         category,
         status,
         rating,
         is_favorite,
         seasons_seen,
         seasons_total,
         progress_updated_at,
         started_at,
         poster_url,
         personal_note,
         created_at,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        series.id,
        series.profileId,
        series.title,
        series.showrunner,
        series.casting,
        series.summary,
        series.category,
        series.status,
        series.rating,
        series.isFavorite ? 1 : 0,
        series.seasonsSeen,
        series.seasonsTotal,
        series.progressUpdatedAt,
        series.startedAt,
        series.posterUrl,
        series.personalNote,
        series.createdAt,
        series.updatedAt,
      ],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('La création de la série n’a modifié aucune ligne SQLite.')
    }

    return series
  }

  async updateSeries(
    profileId: string,
    id: string,
    input: Omit<Series, 'id' | 'profileId' | 'createdAt' | 'updatedAt' | 'progressUpdatedAt'>,
  ): Promise<string> {
    const database = await this.loadDatabase()
    const existing = await this.getSeries(profileId, id)
    if (!existing) {
      throw new Error('La série à modifier est introuvable dans le profil courant.')
    }

    const updatedAt = this.now()
    const series = normalizeSeries({
      ...input,
      id,
      profileId,
      progressUpdatedAt: resolveProgressTimestamp(existing.seasonsSeen, input.seasonsSeen, existing.progressUpdatedAt, updatedAt),
      createdAt: updatedAt,
      updatedAt,
    })
    const result = await database.execute(
      `UPDATE series
       SET
         title = $1,
         showrunner = $2,
         casting = $3,
         summary = $4,
         category = $5,
         status = $6,
         rating = $7,
         is_favorite = $8,
         seasons_seen = $9,
         seasons_total = $10,
         progress_updated_at = $11,
         started_at = $12,
         poster_url = $13,
         personal_note = $14,
         updated_at = $15
       WHERE id = $16 AND profile_id = $17`,
      [
        series.title,
        series.showrunner,
        series.casting,
        series.summary,
        series.category,
        series.status,
        series.rating,
        series.isFavorite ? 1 : 0,
        series.seasonsSeen,
        series.seasonsTotal,
        series.progressUpdatedAt,
        series.startedAt,
        series.posterUrl,
        series.personalNote,
        series.updatedAt,
        id,
        profileId,
      ],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('La série à modifier est introuvable dans le profil courant.')
    }

    return updatedAt
  }

  async deleteSeries(profileId: string, id: string): Promise<void> {
    const database = await this.loadDatabase()
    const result = await database.execute(
      `DELETE FROM series
       WHERE id = $1 AND profile_id = $2`,
      [id, profileId],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('La série à supprimer est introuvable dans le profil courant.')
    }
  }

  async listBooks(profileId: string): Promise<Book[]> {
    const database = await this.loadDatabase()
    const rows = await database.select<BookRow[]>(
      `SELECT ${BOOK_COLUMNS}
       FROM books
       WHERE profile_id = $1
       ORDER BY title COLLATE NOCASE ASC, created_at ASC`,
      [profileId],
    )
    const quotes = await database.select<BookQuoteRow[]>(
      `SELECT id, book_id, body, position, created_at
       FROM book_quotes
       WHERE book_id IN (SELECT id FROM books WHERE profile_id = $1)
       ORDER BY position ASC, created_at ASC`,
      [profileId],
    )
    const quotesByBook = new Map<string, BookQuote[]>()
    for (const quote of quotes.map(toBookQuote)) {
      const list = quotesByBook.get(quote.bookId) ?? []
      list.push(quote)
      quotesByBook.set(quote.bookId, list)
    }

    return rows.map((row) => toBook(row, quotesByBook.get(row.id) ?? []))
  }

  async getBook(profileId: string, id: string): Promise<Book | null> {
    const database = await this.loadDatabase()
    const rows = await database.select<BookRow[]>(
      `SELECT ${BOOK_COLUMNS}
       FROM books
       WHERE id = $1 AND profile_id = $2
       LIMIT 1`,
      [id, profileId],
    )
    const row = rows[0]
    if (!row) return null

    const quotes = await database.select<BookQuoteRow[]>(
      `SELECT id, book_id, body, position, created_at
       FROM book_quotes
       WHERE book_id = $1
       ORDER BY position ASC, created_at ASC`,
      [id],
    )

    return toBook(row, quotes.map(toBookQuote))
  }

  async createBook(
    profileId: string,
    input: Omit<Book, 'id' | 'profileId' | 'createdAt' | 'updatedAt' | 'progressUpdatedAt' | 'quotes'>,
    quotes: string[] = [],
  ): Promise<Book> {
    const database = await this.loadDatabase()
    const id = this.createId()
    const now = this.now()
    const book = normalizeBook({
      id,
      profileId,
      ...input,
      progressUpdatedAt: resolveInitialProgress(input.volumesRead, now),
      createdAt: now,
      updatedAt: now,
      quotes: [],
    })
    const result = await database.execute(
      `INSERT INTO books (
         id,
         profile_id,
         title,
         author,
         year,
         summary,
         category,
         status,
         rating,
         is_favorite,
         volumes_read,
         volumes_total,
         progress_updated_at,
         started_at,
         cover_url,
         personal_note,
         created_at,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        book.id,
        book.profileId,
        book.title,
        book.author,
        book.year,
        book.summary,
        book.category,
        book.status,
        book.rating,
        book.isFavorite ? 1 : 0,
        book.volumesRead,
        book.volumesTotal,
        book.progressUpdatedAt,
        book.startedAt,
        book.coverUrl,
        book.personalNote,
        book.createdAt,
        book.updatedAt,
      ],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('La création du livre n’a modifié aucune ligne SQLite.')
    }

    const createdQuotes = await this.replaceQuotes(database, id, quotes, now)
    return { ...book, quotes: createdQuotes }
  }

  async updateBook(
    profileId: string,
    id: string,
    input: Omit<Book, 'id' | 'profileId' | 'createdAt' | 'updatedAt' | 'progressUpdatedAt' | 'quotes'>,
    quotes?: string[],
  ): Promise<string> {
    const database = await this.loadDatabase()
    const existing = await this.getBook(profileId, id)
    if (!existing) {
      throw new Error('Le livre à modifier est introuvable dans le profil courant.')
    }

    const updatedAt = this.now()
    const book = normalizeBook({
      ...input,
      id,
      profileId,
      progressUpdatedAt: resolveProgressTimestamp(existing.volumesRead, input.volumesRead, existing.progressUpdatedAt, updatedAt),
      createdAt: updatedAt,
      updatedAt,
      quotes: [],
    })
    const result = await database.execute(
      `UPDATE books
       SET
         title = $1,
         author = $2,
         year = $3,
         summary = $4,
         category = $5,
         status = $6,
         rating = $7,
         is_favorite = $8,
         volumes_read = $9,
         volumes_total = $10,
         progress_updated_at = $11,
         started_at = $12,
         cover_url = $13,
         personal_note = $14,
         updated_at = $15
       WHERE id = $16 AND profile_id = $17`,
      [
        book.title,
        book.author,
        book.year,
        book.summary,
        book.category,
        book.status,
        book.rating,
        book.isFavorite ? 1 : 0,
        book.volumesRead,
        book.volumesTotal,
        book.progressUpdatedAt,
        book.startedAt,
        book.coverUrl,
        book.personalNote,
        book.updatedAt,
        id,
        profileId,
      ],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('Le livre à modifier est introuvable dans le profil courant.')
    }

    if (quotes !== undefined) {
      await this.replaceQuotes(database, id, quotes, updatedAt)
    }

    return updatedAt
  }

  async deleteBook(profileId: string, id: string): Promise<void> {
    const database = await this.loadDatabase()
    const result = await database.execute(
      `DELETE FROM books
       WHERE id = $1 AND profile_id = $2`,
      [id, profileId],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('Le livre à supprimer est introuvable dans le profil courant.')
    }
  }

  private async replaceQuotes(
    database: Awaited<ReturnType<DatabaseLoader>>,
    bookId: string,
    quotes: string[],
    now: string,
  ): Promise<BookQuote[]> {
    await database.execute(
      `DELETE FROM book_quotes
       WHERE book_id = $1`,
      [bookId],
    )

    const created: BookQuote[] = []
    for (const [position, body] of quotes.entries()) {
      const trimmed = body.trim()
      if (!trimmed) continue
      const quote: BookQuote = {
        id: this.createId(),
        bookId,
        body: trimmed,
        position,
        createdAt: now,
      }
      const result = await database.execute(
        `INSERT INTO book_quotes (id, book_id, body, position, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [quote.id, quote.bookId, quote.body, quote.position, quote.createdAt],
      )
      if (result.rowsAffected !== 1) {
        throw new Error('L’enregistrement d’une citation n’a modifié aucune ligne SQLite.')
      }
      created.push(quote)
    }

    return created
  }

  async listGames(profileId: string): Promise<Game[]> {
    const database = await this.loadDatabase()
    const rows = await database.select<GameRow[]>(
      `SELECT ${GAME_COLUMNS}
       FROM games
       WHERE profile_id = $1
       ORDER BY title COLLATE NOCASE ASC, created_at ASC`,
      [profileId],
    )

    return rows.map(toGame)
  }

  async getGame(profileId: string, id: string): Promise<Game | null> {
    const database = await this.loadDatabase()
    const rows = await database.select<GameRow[]>(
      `SELECT ${GAME_COLUMNS}
       FROM games
       WHERE id = $1 AND profile_id = $2
       LIMIT 1`,
      [id, profileId],
    )

    return rows[0] ? toGame(rows[0]) : null
  }

  async createGame(
    profileId: string,
    input: Omit<Game, 'id' | 'profileId' | 'createdAt' | 'updatedAt'>,
  ): Promise<Game> {
    const database = await this.loadDatabase()
    const id = this.createId()
    const now = this.now()
    const game = normalizeGame({
      id,
      profileId,
      ...input,
      createdAt: now,
      updatedAt: now,
    })
    const result = await database.execute(
      `INSERT INTO games (
         id,
         profile_id,
         title,
         developer,
         platform,
         year,
         status,
         rating,
         is_favorite,
         played_at,
         cover_url,
         personal_note,
         created_at,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        game.id,
        game.profileId,
        game.title,
        game.developer,
        game.platform,
        game.year,
        game.status,
        game.rating,
        game.isFavorite ? 1 : 0,
        game.playedAt,
        game.coverUrl,
        game.personalNote,
        game.createdAt,
        game.updatedAt,
      ],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('La création du jeu n’a modifié aucune ligne SQLite.')
    }

    return game
  }

  async updateGame(
    profileId: string,
    id: string,
    input: Omit<Game, 'id' | 'profileId' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> {
    const database = await this.loadDatabase()
    const updatedAt = this.now()
    const game = normalizeGame({
      ...input,
      id,
      profileId,
      createdAt: updatedAt,
      updatedAt,
    })
    const result = await database.execute(
      `UPDATE games
       SET
         title = $1,
         developer = $2,
         platform = $3,
         year = $4,
         status = $5,
         rating = $6,
         is_favorite = $7,
         played_at = $8,
         cover_url = $9,
         personal_note = $10,
         updated_at = $11
       WHERE id = $12 AND profile_id = $13`,
      [
        game.title,
        game.developer,
        game.platform,
        game.year,
        game.status,
        game.rating,
        game.isFavorite ? 1 : 0,
        game.playedAt,
        game.coverUrl,
        game.personalNote,
        game.updatedAt,
        id,
        profileId,
      ],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('Le jeu à modifier est introuvable dans le profil courant.')
    }

    return updatedAt
  }

  async deleteGame(profileId: string, id: string): Promise<void> {
    const database = await this.loadDatabase()
    const result = await database.execute(
      `DELETE FROM games
       WHERE id = $1 AND profile_id = $2`,
      [id, profileId],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('Le jeu à supprimer est introuvable dans le profil courant.')
    }
  }

  async listArtworks(profileId: string): Promise<Artwork[]> {
    const database = await this.loadDatabase()
    const rows = await database.select<ArtworkRow[]>(
      `SELECT ${ARTWORK_COLUMNS}
       FROM artworks
       WHERE profile_id = $1
       ORDER BY title COLLATE NOCASE ASC, created_at ASC`,
      [profileId],
    )

    return rows.map(toArtwork)
  }

  async getArtwork(profileId: string, id: string): Promise<Artwork | null> {
    const database = await this.loadDatabase()
    const rows = await database.select<ArtworkRow[]>(
      `SELECT ${ARTWORK_COLUMNS}
       FROM artworks
       WHERE id = $1 AND profile_id = $2
       LIMIT 1`,
      [id, profileId],
    )

    return rows[0] ? toArtwork(rows[0]) : null
  }

  async createArtwork(
    profileId: string,
    input: Omit<Artwork, 'id' | 'profileId' | 'createdAt' | 'updatedAt'>,
  ): Promise<Artwork> {
    const database = await this.loadDatabase()
    const id = this.createId()
    const now = this.now()
    const artwork = normalizeArtwork({
      id,
      profileId,
      ...input,
      createdAt: now,
      updatedAt: now,
    })
    const result = await database.execute(
      `INSERT INTO artworks (
         id,
         profile_id,
         title,
         artist,
         year,
         form,
         location,
         exhibition,
         status,
         is_favorite,
         discovered_at,
         image_url,
         personal_note,
         created_at,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        artwork.id,
        artwork.profileId,
        artwork.title,
        artwork.artist,
        artwork.year,
        artwork.form,
        artwork.location,
        artwork.exhibition,
        artwork.status,
        artwork.isFavorite ? 1 : 0,
        artwork.discoveredAt,
        artwork.imageUrl,
        artwork.personalNote,
        artwork.createdAt,
        artwork.updatedAt,
      ],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('La création de l’œuvre n’a modifié aucune ligne SQLite.')
    }

    return artwork
  }

  async updateArtwork(
    profileId: string,
    id: string,
    input: Omit<Artwork, 'id' | 'profileId' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> {
    const database = await this.loadDatabase()
    const updatedAt = this.now()
    const artwork = normalizeArtwork({
      ...input,
      id,
      profileId,
      createdAt: updatedAt,
      updatedAt,
    })
    const result = await database.execute(
      `UPDATE artworks
       SET
         title = $1,
         artist = $2,
         year = $3,
         form = $4,
         location = $5,
         exhibition = $6,
         status = $7,
         is_favorite = $8,
         discovered_at = $9,
         image_url = $10,
         personal_note = $11,
         updated_at = $12
       WHERE id = $13 AND profile_id = $14`,
      [
        artwork.title,
        artwork.artist,
        artwork.year,
        artwork.form,
        artwork.location,
        artwork.exhibition,
        artwork.status,
        artwork.isFavorite ? 1 : 0,
        artwork.discoveredAt,
        artwork.imageUrl,
        artwork.personalNote,
        artwork.updatedAt,
        id,
        profileId,
      ],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('L’œuvre à modifier est introuvable dans le profil courant.')
    }

    return updatedAt
  }

  async deleteArtwork(profileId: string, id: string): Promise<void> {
    const database = await this.loadDatabase()
    const result = await database.execute(
      `DELETE FROM artworks
       WHERE id = $1 AND profile_id = $2`,
      [id, profileId],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('L’œuvre à supprimer est introuvable dans le profil courant.')
    }
  }
}

function resolveInitialProgress(progress: number | null, now: string): string | null {
  return progress !== null && progress > 0 ? now : null
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

function resolveProgressTimestamp(
  previousProgress: number | null,
  nextProgress: number | null,
  previousTimestamp: string | null,
  now: string,
): string | null {
  if (nextProgress === null || nextProgress === 0) {
    return nextProgress === previousProgress ? previousTimestamp : null
  }
  if (nextProgress !== previousProgress) {
    return now
  }
  return previousTimestamp ?? (nextProgress > 0 ? now : null)
}

export const mediaRepository = new SqliteMediaRepository()
