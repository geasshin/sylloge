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
import { customLibraryRepository, SqliteCustomLibraryRepository } from './customLibraryRepository.ts'
import type { CustomLibrary } from '../domain/customLibraries.ts'
import { restoreProfileExperience } from './profileExperienceService.ts'
import type { ExperienceOutcome, ExperienceRestoreReport } from '../domain/profileExperience.ts'
import {
  importLibraryDocumentAtomically,
  importLibraryDocumentIntoEmptyProfile,
  type ImportLibraryDocumentResult,
  type NativeImportLibraryDocumentPayload,
} from './nativePortability.ts'

export type CulturalLibrary = {
  profile: Profile
  films: Film[]
  series: Series[]
  anime: Series[]
  books: Book[]
  mangas: Book[]
  games: Game[]
  artworks: Artwork[]
  customLibraries: CustomLibrary[]
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

function prepareNativeLibraryImport(
  document: SyllogeLibraryDocument,
  profile: Profile,
  createId: IdFactory,
): NativeImportLibraryDocumentPayload {
  const books = document.books.map((book) => {
    const id = createId()
    return normalizeBook({
      ...book,
      id,
      profileId: profile.id,
      quotes: [],
    })
  })

  const mangas = (document.mangas ?? []).map((manga) => {
    const id = createId()
    return normalizeBook({
      ...manga,
      id,
      profileId: profile.id,
      quotes: manga.quotes.map((quote) => ({
        ...quote,
        id: createId(),
        bookId: id,
      })),
    })
  })

  const payload: NativeImportLibraryDocumentPayload = {
    profile,
    films: document.films.map((film) => ({
      ...normalizeFilm(film),
      id: createId(),
      profileId: profile.id,
    })),
    series: document.series.map((series) => ({
      ...normalizeSeries(series),
      id: createId(),
      profileId: profile.id,
    })),
    anime: (document.anime ?? []).map((series) => ({
      ...normalizeSeries(series),
      id: createId(),
      profileId: profile.id,
    })),
    books: books.map((book, index) => ({
      ...book,
      quotes: document.books[index].quotes.map((quote) => ({
        ...quote,
        id: createId(),
        bookId: book.id,
      })),
    })),
    mangas: mangas.map(({ quotes: mangaQuotes, ...manga }) => ({
      ...manga,
      quotes: mangaQuotes,
    })),
    games: document.games.map((game) => ({
      ...normalizeGame(game),
      id: createId(),
      profileId: profile.id,
    })),
    artworks: document.artworks.map((artwork) => ({
      ...normalizeArtwork(artwork),
      id: createId(),
      profileId: profile.id,
    })),
    customLibraries: (document.customLibraries ?? []).map((library) => ({
      ...library,
      entries: library.entries.map((entry) => {
        const id = createId()
        return {
          ...entry,
          id,
          profileId: profile.id,
          quotes: entry.quotes.map((quote) => ({ ...quote, id: createId(), entryId: id })),
        }
      }),
    })),
  }

  for (const book of [...payload.books, ...payload.mangas]) {
    for (const quote of book.quotes) {
      if (quote.bookId !== book.id) {
        throw new Error('Le remapping des citations du livre est incohérent.')
      }
    }
  }

  return payload
}

/**
 * Agrège les sept bibliothèques d'un profil et orchestre les imports atomiques
 * d'un document sylloge-library v2, avec régénération des identifiants locaux.
 */
export class SqliteLibraryRepository {
  private readonly loadDatabase: DatabaseLoader
  private readonly createId: IdFactory
  private readonly now: NowFactory
  private readonly importNative: NativeLibraryDocumentImporter
  private readonly importIntoEmptyNative: NativeLibraryDocumentImporter
  private readonly media: SqliteMediaRepository
  private readonly custom: SqliteCustomLibraryRepository
  private readonly restoreExperience: ExperienceRestorer | null

  constructor(
    loadDatabase: DatabaseLoader = loadSyllogeDatabase,
    createId: IdFactory = () => crypto.randomUUID(),
    now: NowFactory = () => new Date().toISOString(),
    importNative: NativeLibraryDocumentImporter = importLibraryDocumentAtomically,
    media: SqliteMediaRepository = mediaRepository,
    importIntoEmptyNative: NativeLibraryDocumentImporter = importLibraryDocumentIntoEmptyProfile,
    custom: SqliteCustomLibraryRepository | null = null,
    restoreExperience: ExperienceRestorer | null = null,
  ) {
    this.loadDatabase = loadDatabase
    this.createId = createId
    this.now = now
    this.importNative = importNative
    this.importIntoEmptyNative = importIntoEmptyNative
    this.restoreExperience = restoreExperience
    this.media = media
    // Même base que le dépôt : un chargeur injecté en test vaut pour les deux.
    this.custom = custom ?? (loadDatabase === loadSyllogeDatabase ? customLibraryRepository : new SqliteCustomLibraryRepository(loadDatabase, createId, now))
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

    const [filmLibrary, series, anime, books, mangas, games, artworks, customLibraries] = await Promise.all([
      filmsRepository.loadLibrary(profileId),
      this.media.listSeries(profileId, 'series'),
      this.media.listSeries(profileId, 'anime'),
      this.media.listBooks(profileId, 'books'),
      this.media.listBooks(profileId, 'mangas'),
      this.media.listGames(profileId),
      this.media.listArtworks(profileId),
      this.custom.loadAll(profileId),
    ])

    return {
      profile: toProfile(profileRow),
      films: filmLibrary.films,
      series,
      anime,
      books,
      mangas,
      games,
      artworks,
      customLibraries,
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
    const payload = prepareNativeLibraryImport(document, {
      id: profileId,
      name: document.profile.name,
      createdAt: importedAt,
      updatedAt: importedAt,
    }, this.createId)

    const result = await this.importNative(payload)

    if (
      result.profileId !== profileId
      || result.filmCount !== payload.films.length
      || result.seriesCount !== payload.series.length
      || (result.animeCount ?? 0) !== payload.anime.length
      || result.bookCount !== payload.books.length
      || (result.mangaCount ?? 0) !== payload.mangas.length
      || result.gameCount !== payload.games.length
      || result.artworkCount !== payload.artworks.length
      || (result.customLibraryCount ?? 0) !== payload.customLibraries.length
      || (result.customEntryCount ?? 0) !== payload.customLibraries.reduce((total, library) => total + library.entries.length, 0)
    ) {
      throw new Error('Le rapport SQLite de l’import ne correspond pas au document validé.')
    }

    await this.applyExperience(document, profileId)
    return this.loadLibrary(profileId)
  }

  /**
   * L'expérience n'est restaurée qu'après un import réussi. Un échec de cette étape laisse les
   * fiches intactes et se contente de le signaler : ce n'est pas une raison de perdre la
   * restauration des données.
   */
  private async applyExperience(document: SyllogeLibraryDocument, profileId: string): Promise<void> {
    this.experienceOutcome = null
    if (this.restoreExperience === null) return
    try {
      this.experienceOutcome = await this.restoreExperience(document.experience, profileId)
    } catch (error) {
      this.experienceOutcome = 'failed'
      console.warn('L’expérience du profil n’a pas pu être restaurée.', error)
    }
  }

  private experienceOutcome: ExperienceOutcome = null

  /**
   * Bilan de la dernière restauration des vues et préférences, rendu une seule fois : l'écran
   * qui vient d'importer un document le lit juste après. Le dépôt ne le garde pas au-delà.
   */
  takeExperienceOutcome(): ExperienceOutcome {
    const outcome = this.experienceOutcome
    this.experienceOutcome = null
    return outcome
  }

  async importLibraryDocumentIntoEmptyProfile(
    profile: Profile,
    document: SyllogeLibraryDocument,
  ): Promise<CulturalLibrary> {
    const payload = prepareNativeLibraryImport(document, {
      ...profile,
      updatedAt: this.now(),
    }, this.createId)
    const result = await this.importIntoEmptyNative(payload)

    if (
      result.profileId !== profile.id
      || result.filmCount !== payload.films.length
      || result.seriesCount !== payload.series.length
      || (result.animeCount ?? 0) !== payload.anime.length
      || result.bookCount !== payload.books.length
      || (result.mangaCount ?? 0) !== payload.mangas.length
      || result.gameCount !== payload.games.length
      || result.artworkCount !== payload.artworks.length
      || (result.customLibraryCount ?? 0) !== payload.customLibraries.length
      || (result.customEntryCount ?? 0) !== payload.customLibraries.reduce((total, library) => total + library.entries.length, 0)
    ) {
      throw new Error('Le rapport SQLite de l’import ne correspond pas au document validé.')
    }

    // Même règle que `importLibraryDocument` : les fiches sont écrites, puis les vues et les
    // préférences. Sans cette étape, restaurer au premier lancement ou depuis la fenêtre de
    // restauration perdait silencieusement ce que le document v5 emporte.
    await this.applyExperience(document, profile.id)
    return this.loadLibrary(profile.id)
  }
}

type ExperienceRestorer = (
  experience: SyllogeLibraryDocument['experience'],
  profileId: string,
) => Promise<ExperienceRestoreReport>

export const libraryRepository = new SqliteLibraryRepository(
  loadSyllogeDatabase,
  () => crypto.randomUUID(),
  () => new Date().toISOString(),
  importLibraryDocumentAtomically,
  mediaRepository,
  importLibraryDocumentIntoEmptyProfile,
  null,
  restoreProfileExperience,
)
