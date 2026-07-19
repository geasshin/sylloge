import type { Artwork } from '../domain/artwork.ts'
import type { Book } from '../domain/book.ts'
import type { Film } from '../domain/film.ts'
import type { Game } from '../domain/game.ts'
import {
  normalizeBook,
} from '../domain/book.ts'
import {
  createLibraryDocument,
  type SyllogeLibraryDocument,
} from '../domain/libraryDocument.ts'
import type { Profile } from '../domain/profile.ts'
import type { Series } from '../domain/series.ts'
import { normalizeFilm } from '../domain/film.ts'
import { normalizeGame } from '../domain/game.ts'
import { normalizeSeries } from '../domain/series.ts'
import { normalizeArtwork } from '../domain/artwork.ts'
import { loadSyllogeDatabase } from './database.ts'
import {
  filmsRepository,
  type DatabaseLoader,
  type IdFactory,
  type NowFactory,
} from './filmsRepository.ts'
import { mediaRepository, SqliteMediaRepository } from './mediaRepository.ts'
import {
  importLibraryDocumentAtomically,
  type ImportLibraryDocumentResult,
  type NativeImportLibraryDocumentPayload,
} from './nativePortability.ts'

export type CulturalLibrary = {
  profile: Profile
  films: Film[]
  series: Series[]
  books: Book[]
  games: Game[]
  artworks: Artwork[]
}

type ProfileRow = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export type NativeLibraryDocumentImporter = (
  payload: NativeImportLibraryDocumentPayload,
) => Promise<ImportLibraryDocumentResult>

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Agrège les cinq collections d'un profil et orchestre l'import atomique d'un
 * document sylloge-library v2 dans un nouveau profil. L'import crée toujours
 * un profil neuf avec des identifiants régénérés : il n'écrase ni ne fusionne
 * jamais une bibliothèque existante.
 */
export class SqliteLibraryRepository {
  private readonly loadDatabase: DatabaseLoader
  private readonly createId: IdFactory
  private readonly now: NowFactory
  private readonly importNative: NativeLibraryDocumentImporter
  private readonly media: SqliteMediaRepository

  constructor(
    loadDatabase: DatabaseLoader = loadSyllogeDatabase,
    createId: IdFactory = () => crypto.randomUUID(),
    now: NowFactory = () => new Date().toISOString(),
    importNative: NativeLibraryDocumentImporter = importLibraryDocumentAtomically,
    media: SqliteMediaRepository = mediaRepository,
  ) {
    this.loadDatabase = loadDatabase
    this.createId = createId
    this.now = now
    this.importNative = importNative
    this.media = media
  }

  async loadLibrary(profileId: string): Promise<CulturalLibrary> {
    const database = await this.loadDatabase()
    const profiles = await database.select<ProfileRow[]>(
      `SELECT id, name, created_at, updated_at
       FROM profiles
       WHERE id = $1
       LIMIT 1`,
      [profileId],
    )
    const profileRow = profiles[0]

    if (!profileRow) {
      throw new Error(`Le profil local ${profileId} est introuvable.`)
    }

    const [filmLibrary, series, books, games, artworks] = await Promise.all([
      filmsRepository.loadLibrary(profileId),
      this.media.listSeries(profileId),
      this.media.listBooks(profileId),
      this.media.listGames(profileId),
      this.media.listArtworks(profileId),
    ])

    return {
      profile: toProfile(profileRow),
      films: filmLibrary.films,
      series,
      books,
      games,
      artworks,
    }
  }

  async loadCurrentLibrary(): Promise<CulturalLibrary> {
    const database = await this.loadDatabase()
    const currentProfiles = await database.select<{ profile_id: string }[]>(
      `SELECT profile_id
       FROM current_profile
       WHERE singleton = 1
       LIMIT 1`,
    )
    const profileId = currentProfiles[0]?.profile_id

    if (!profileId) {
      throw new Error('Le profil courant est introuvable.')
    }

    return this.loadLibrary(profileId)
  }

  createExportDocument(library: CulturalLibrary, exportedAt = this.now()): SyllogeLibraryDocument {
    return createLibraryDocument(library, exportedAt)
  }

  async importLibraryDocument(document: SyllogeLibraryDocument): Promise<CulturalLibrary> {
    const importedAt = this.now()
    const profileId = this.createId()

    const books = document.books.map((book) => {
      const id = this.createId()
      return normalizeBook({
        ...book,
        id,
        profileId,
        quotes: [],
      })
    })

    const payload: NativeImportLibraryDocumentPayload = {
      profile: {
        id: profileId,
        name: document.profile.name,
        createdAt: importedAt,
        updatedAt: importedAt,
      },
      films: document.films.map((film) => ({
        ...normalizeFilm(film),
        id: this.createId(),
        profileId,
      })),
      series: document.series.map((series) => ({
        ...normalizeSeries(series),
        id: this.createId(),
        profileId,
      })),
      books: books.map((book, index) => ({
        ...book,
        quotes: document.books[index].quotes.map((quote) => ({
          ...quote,
          id: this.createId(),
          bookId: book.id,
        })),
      })),
      games: document.games.map((game) => ({
        ...normalizeGame(game),
        id: this.createId(),
        profileId,
      })),
      artworks: document.artworks.map((artwork) => ({
        ...normalizeArtwork(artwork),
        id: this.createId(),
        profileId,
      })),
    }

    for (const book of payload.books) {
      for (const quote of book.quotes) {
        if (quote.bookId !== book.id) {
          throw new Error('Le remapping des citations du livre est incohérent.')
        }
      }
    }

    const result = await this.importNative(payload)

    if (
      result.profileId !== profileId
      || result.filmCount !== payload.films.length
      || result.seriesCount !== payload.series.length
      || result.bookCount !== payload.books.length
      || result.gameCount !== payload.games.length
      || result.artworkCount !== payload.artworks.length
    ) {
      throw new Error('Le rapport SQLite de l’import ne correspond pas au document validé.')
    }

    return this.loadLibrary(profileId)
  }
}

export const libraryRepository = new SqliteLibraryRepository()
