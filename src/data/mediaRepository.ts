import { ARTWORK_FORMS, ARTWORK_STATUSES, normalizeArtwork, type Artwork, type ArtworkCustomField, type ArtworkForm, type ArtworkStatus } from '../domain/artwork.ts'
import { parseArtworkDetails, serializeArtworkDetails } from '../domain/artworkDetails.ts'
import { BOOK_CATEGORIES, BOOK_STATUSES, normalizeBook, reconcileBookQuotes, type Book, type BookCategory, type BookQuote, type BookStatus } from '../domain/book.ts'
import { GAME_STATUSES, normalizeGame, type Game, type GameStatus } from '../domain/game.ts'
import { SERIES_CATEGORIES, SERIES_STATUSES, normalizeSeries, type Series, type SeriesCategory, type SeriesStatus } from '../domain/series.ts'
import type { LibrarySort } from '../domain/libraryViews.ts'
import type { LibraryFilters } from '../domain/libraryFilters.ts'
import { DEFAULT_PROFILE_ID, loadSyllogeDatabase } from './database.ts'
import type { DatabaseLoader, IdFactory, NowFactory } from './filmsRepository.ts'
import { appendLibraryFilterClauses, librarySortOrderBy, type LibraryQueryColumns } from './libraryViewQuery.ts'
import {
  createBookAtomically,
  deleteBookAtomically,
  updateBookAtomically,
  type NativeBookDeleter,
  type NativeBookWriter,
} from './nativeBooks.ts'
import { moveSeriesLibraryAtomically, type NativeSeriesMover } from './nativeSeries.ts'
import { seriesLibraryForCategory } from '../domain/seriesLibraries.ts'
import { isBannerUrl, normalizeBannerUrl } from '../domain/bannerImages.ts'

export type MediaProviderMedium = 'series' | 'anime' | 'books' | 'mangas' | 'games'

export type MediaProviderReference = {
  providerName: 'TMDB' | 'Open Library' | 'IGDB'
  providerId: string
}

export type MediaProviderLink = MediaProviderReference & {
  profileId: string
  medium: MediaProviderMedium
  mediaId: string
  createdAt: string
  updatedAt: string
}

type MediaProviderLinkRow = {
  profile_id: string
  medium: MediaProviderMedium
  media_id: string
  provider_name: MediaProviderLink['providerName']
  provider_id: string
  created_at: string
  updated_at: string
}

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
  banner_url: string | null
  first_air_year: number | null
  last_air_year: number | null
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
  banner_url: string | null
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
  custom_fields?: string | null
  details?: string | null
  created_at: string
  updated_at: string
}

/** Une bibliothèque = une table : Séries et Animation japonaise ne partagent plus rien. */
export type SeriesTableLibrary = 'series' | 'anime'
export type BookTableLibrary = 'books' | 'mangas'

const seriesTable = (library: SeriesTableLibrary): string => library === 'anime' ? 'anime' : 'series'
const bookTable = (library: BookTableLibrary): string => library === 'mangas' ? 'mangas' : 'books'
const quoteTable = (library: BookTableLibrary): string => library === 'mangas' ? 'manga_quotes' : 'book_quotes'
const quoteOwnerColumn = (library: BookTableLibrary): string => library === 'mangas' ? 'manga_id' : 'book_id'

/**
 * `anime` n'a pas de colonne de catégorie : la valeur est synthétisée pour
 * conserver le type `Series` unique côté domaine.
 */
const seriesColumns = (library: SeriesTableLibrary): string => library === 'anime'
  ? `
  id,
  profile_id,
  title,
  showrunner,
  casting,
  summary,
  'animation' AS category,
  status,
  rating,
  is_favorite,
  seasons_seen,
  seasons_total,
  progress_updated_at,
  started_at,
  poster_url,
  banner_url,
  first_air_year,
  last_air_year,
  personal_note,
  created_at,
  updated_at`
  : SERIES_COLUMNS

/** `mangas` n'a pas de colonne de catégorie : valeur synthétisée de la même façon. */
const bookColumns = (library: BookTableLibrary): string => library === 'mangas'
  ? `
  id,
  profile_id,
  title,
  author,
  year,
  summary,
  'manga' AS category,
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
  : BOOK_COLUMNS

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
  banner_url,
  first_air_year,
  last_air_year,
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
  banner_url,
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
  custom_fields,
  details,
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
  // 0.6.11 : « en cours » et « regardé » sont remappés par la migration 14,
  // mais une sauvegarde JSON/ZIP antérieure peut en contenir encore. Repli
  // conservateur au lieu d'une exception : ces fiches deviennent « joué ».
  if (value === 'en cours' || value === 'regardé') return 'joué'
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
    bannerUrl: row.banner_url,
    firstAirYear: row.first_air_year,
    lastAirYear: row.last_air_year,
    personalNote: row.personal_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

/** Colonnes et valeurs d'une fiche Série pour la table de sa bibliothèque. */
function seriesRowPayload(series: Series, library: SeriesTableLibrary): Array<[string, unknown]> {
  return [
    ['id', series.id],
    ['profile_id', series.profileId],
    ['title', series.title],
    ['showrunner', series.showrunner],
    ['casting', series.casting],
    ['summary', series.summary],
    ...(library === 'series' ? [['category', series.category] as [string, unknown]] : []),
    ['status', series.status],
    ['rating', series.rating],
    ['is_favorite', series.isFavorite ? 1 : 0],
    ['seasons_seen', series.seasonsSeen],
    ['seasons_total', series.seasonsTotal],
    ['progress_updated_at', series.progressUpdatedAt],
    ['started_at', series.startedAt],
    ['poster_url', series.posterUrl],
    ['first_air_year', series.firstAirYear],
    ['last_air_year', series.lastAirYear],
    ['personal_note', series.personalNote],
    ['created_at', series.createdAt],
    ['updated_at', series.updatedAt],
  ]
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
    bannerUrl: row.banner_url,
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
    customFields: parseArtworkCustomFields(row.custom_fields),
    details: parseArtworkDetails(row.details),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

/**
 * Champs personnalisés stockés en JSON texte (0.6.12). Toute valeur illisible
 * ou hors contrat est jetée silencieusement : ces métadonnées sont
 * facultatives et ne doivent jamais empêcher l'ouverture d'une fiche.
 */
function parseArtworkCustomFields(raw: string | null | undefined): ArtworkCustomField[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const fields: ArtworkCustomField[] = []
    for (const entry of parsed) {
      if (typeof entry === 'object' && entry !== null) {
        const candidate = entry as { name?: unknown; value?: unknown }
        if (typeof candidate.name === 'string' && typeof candidate.value === 'string') {
          fields.push({ name: candidate.name, value: candidate.value })
        }
      }
    }
    return fields
  } catch {
    return []
  }
}

/** Sérialise les champs personnalisés ; une liste vide (ou absente) reste NULL. */
function serializeArtworkCustomFields(fields: ArtworkCustomField[] | null | undefined): string | null {
  if (!fields || fields.length === 0) return null
  return JSON.stringify(fields)
}

export type SeriesSearchCriteria = {
  query: string
  /** Une catégorie, plusieurs (interrupteur 0.6.8), ou 'all'. */
  category: SeriesCategory | readonly SeriesCategory[] | 'all'
  filters?: LibraryFilters
  sort: LibrarySort
}

export type BookSearchCriteria = {
  query: string
  /** Une catégorie, plusieurs (interrupteur 0.6.8), ou 'all'. */
  category: BookCategory | readonly BookCategory[] | 'all'
  filters?: LibraryFilters
  sort: LibrarySort
}

export type GameSearchCriteria = {
  query: string
  platform: string | 'all'
  filters?: LibraryFilters
  sort: LibrarySort
}

export type ArtworkSearchCriteria = {
  query: string
  form: ArtworkForm | 'all'
  filters?: LibraryFilters
  sort: LibrarySort
}

/** Colonnes réellement filtrables et triables par médium (jalons 0.4.20 et 0.4.23). */
const SERIES_QUERY_COLUMNS: LibraryQueryColumns = {
  rating: true,
  year: false,
  personalDateColumn: 'started_at',
  specificTextColumn: null,
  locationColumn: null,
  exhibitionColumn: null,
  progressColumn: 'progress_updated_at',
}

const BOOK_QUERY_COLUMNS: LibraryQueryColumns = {
  rating: true,
  year: true,
  personalDateColumn: 'started_at',
  specificTextColumn: 'author',
  locationColumn: null,
  exhibitionColumn: null,
  progressColumn: 'progress_updated_at',
}

const GAME_QUERY_COLUMNS: LibraryQueryColumns = {
  rating: true,
  year: true,
  personalDateColumn: 'played_at',
  specificTextColumn: null,
  locationColumn: null,
  exhibitionColumn: null,
  progressColumn: null,
}

const ARTWORK_QUERY_COLUMNS: LibraryQueryColumns = {
  rating: false,
  year: true,
  personalDateColumn: 'discovered_at',
  specificTextColumn: 'artist',
  locationColumn: 'location',
  exhibitionColumn: 'exhibition',
  progressColumn: null,
}

export class SqliteMediaRepository {
  private readonly loadDatabase: DatabaseLoader
  private readonly createId: IdFactory
  private readonly now: NowFactory
  private readonly createBookNative: NativeBookWriter
  private readonly updateBookNative: NativeBookWriter
  private readonly deleteBookNative: NativeBookDeleter
  private readonly moveSeriesNative: NativeSeriesMover

  constructor(
    loadDatabase: DatabaseLoader = loadSyllogeDatabase,
    createId: IdFactory = () => crypto.randomUUID(),
    now: NowFactory = () => new Date().toISOString(),
    createBookNative: NativeBookWriter = createBookAtomically,
    updateBookNative: NativeBookWriter = updateBookAtomically,
    deleteBookNative: NativeBookDeleter = deleteBookAtomically,
    moveSeriesNative: NativeSeriesMover = moveSeriesLibraryAtomically,
  ) {
    this.loadDatabase = loadDatabase
    this.createId = createId
    this.now = now
    this.createBookNative = createBookNative
    this.updateBookNative = updateBookNative
    this.deleteBookNative = deleteBookNative
    this.moveSeriesNative = moveSeriesNative
  }

  async getMediaProviderLink(
    profileId: string,
    medium: MediaProviderMedium,
    mediaId: string,
  ): Promise<MediaProviderLink | null> {
    const database = await this.loadDatabase()
    const rows = await database.select<MediaProviderLinkRow[]>(
      `SELECT profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at
       FROM media_provider_links
       WHERE profile_id = $1 AND medium = $2 AND media_id = $3
       LIMIT 1`,
      [profileId, medium, mediaId],
    )
    const row = rows[0]
    if (!row) return null
    return {
      profileId: row.profile_id,
      medium: row.medium,
      mediaId: row.media_id,
      providerName: row.provider_name,
      providerId: row.provider_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  /**
   * Tous les liens fournisseurs d'un médium, pour un export qui a besoin de l'identifiant TMDB de
   * chaque fiche (séries, animés) sans une requête par œuvre.
   */
  async listMediaProviderLinks(profileId: string, medium: MediaProviderMedium): Promise<MediaProviderLink[]> {
    const database = await this.loadDatabase()
    const rows = await database.select<MediaProviderLinkRow[]>(
      `SELECT profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at
       FROM media_provider_links
       WHERE profile_id = $1 AND medium = $2
       ORDER BY media_id ASC`,
      [profileId, medium],
    )
    return rows.map(row => ({
      profileId: row.profile_id,
      medium: row.medium,
      mediaId: row.media_id,
      providerName: row.provider_name,
      providerId: row.provider_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async setMediaProviderLink(input: {
    profileId: string
    medium: MediaProviderMedium
    mediaId: string
    providerName: MediaProviderLink['providerName']
    providerId: string
  }): Promise<MediaProviderLink> {
    const database = await this.loadDatabase()
    const timestamp = this.now()
    await database.execute(
      `INSERT INTO media_provider_links (
         profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT(profile_id, medium, media_id) DO UPDATE SET
         provider_name = excluded.provider_name,
         provider_id = excluded.provider_id,
         updated_at = excluded.updated_at`,
      [input.profileId, input.medium, input.mediaId, input.providerName, input.providerId, timestamp],
    )
    const saved = await this.getMediaProviderLink(input.profileId, input.medium, input.mediaId)
    if (!saved) throw new Error('L’association fournisseur n’a pas pu être relue après son enregistrement.')
    return saved
  }

  async listSeries(profileId: string, library: SeriesTableLibrary = 'series'): Promise<Series[]> {
    const database = await this.loadDatabase()
    const rows = await database.select<SeriesRow[]>(
      `SELECT ${seriesColumns(library)}
       FROM ${seriesTable(library)}
       WHERE profile_id = $1
       ORDER BY title COLLATE NOCASE ASC, created_at ASC`,
      [profileId],
    )

    return rows.map(toSeries)
  }

  async searchSeries(profileId: string, criteria: SeriesSearchCriteria, library: SeriesTableLibrary = 'series'): Promise<Series[]> {
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

    // `anime` n'a plus de colonne de catégorie : sa table est déjà la partition.
    if (library === 'series' && criteria.category !== 'all') {
      // Interrupteur 0.6.8 : la sélection peut compter plusieurs catégories.
      const selected = Array.isArray(criteria.category) ? criteria.category : [criteria.category]
      if (selected.length === 1) {
        bindValues.push(selected[0])
        clauses.push(`category = $${bindValues.length}`)
      } else if (selected.length > 1) {
        const placeholders = selected.map((value) => {
          bindValues.push(value)
          return `$${bindValues.length}`
        })
        clauses.push(`category IN (${placeholders.join(', ')})`)
      }
    }

    appendLibraryFilterClauses(criteria.filters, SERIES_QUERY_COLUMNS, clauses, bindValues, escapeLikePattern)

    const rows = await database.select<SeriesRow[]>(
      `SELECT ${seriesColumns(library)}
       FROM ${seriesTable(library)}
       WHERE ${clauses.join('\n         AND ')}
       ORDER BY ${librarySortOrderBy(criteria.sort, SERIES_QUERY_COLUMNS)}`,
      bindValues,
    )

    return rows.map(toSeries)
  }

  async getSeries(profileId: string, id: string, library: SeriesTableLibrary = 'series'): Promise<Series | null> {
    const database = await this.loadDatabase()
    const rows = await database.select<SeriesRow[]>(
      `SELECT ${seriesColumns(library)}
       FROM ${seriesTable(library)}
       WHERE id = $1 AND profile_id = $2
       LIMIT 1`,
      [id, profileId],
    )

    return rows[0] ? toSeries(rows[0]) : null
  }

  async createSeries(
    profileId: string,
    input: Omit<Series, 'id' | 'profileId' | 'createdAt' | 'updatedAt' | 'progressUpdatedAt' | 'bannerUrl'>,
    library: SeriesTableLibrary = 'series',
  ): Promise<Series> {
    const database = await this.loadDatabase()
    const id = this.createId()
    const now = this.now()
    const series = normalizeSeries({
      id,
      profileId,
      ...input,
      category: library === 'anime' ? 'animation' : 'série télé',
      progressUpdatedAt: resolveInitialProgress(input.seasonsSeen, now),
      // La bannière se choisit depuis la fiche : une création n'en porte pas.
      bannerUrl: null,
      createdAt: now,
      updatedAt: now,
    })
    // `anime` ne porte pas de colonne de catégorie : la table est la partition.
    const row = seriesRowPayload(series, library)
    const result = await database.execute(
      `INSERT INTO ${seriesTable(library)} (${row.map(([column]) => column).join(', ')})
       VALUES (${row.map((_, index) => `$${index + 1}`).join(', ')})`,
      row.map(([, value]) => value),
    )

    if (result.rowsAffected !== 1) {
      throw new Error('La création de la série n’a modifié aucune ligne SQLite.')
    }

    return series
  }

  /**
   * Une fiche change de bibliothèque en changeant de table : l'écriture
   * ordinaire reste un UPDATE, le déplacement passe par la commande native
   * transactionnelle (même identifiant, lien fournisseur déplacé, source
   * retirée). `library` désigne la table qui contient la fiche avant l'appel.
   */
  async updateSeries(
    profileId: string,
    id: string,
    input: Omit<Series, 'id' | 'profileId' | 'createdAt' | 'updatedAt' | 'progressUpdatedAt' | 'bannerUrl'>,
    library: SeriesTableLibrary = 'series',
  ): Promise<string> {
    const database = await this.loadDatabase()
    const existing = await this.getSeries(profileId, id, library)
    if (!existing) {
      throw new Error('La série à modifier est introuvable dans le profil courant.')
    }

    const updatedAt = this.now()
    const targetLibrary = seriesLibraryForCategory(input.category)
    const series = normalizeSeries({
      ...input,
      category: targetLibrary === 'anime' ? 'animation' : 'série télé',
      id,
      profileId,
      progressUpdatedAt: resolveProgressTimestamp(existing.seasonsSeen, input.seasonsSeen, existing.progressUpdatedAt, updatedAt),
      // La bannière n'est ni dans le formulaire ni dans l'UPDATE : elle suit la
      // fiche telle qu'elle est enregistrée, y compris lors d'un déplacement.
      bannerUrl: existing.bannerUrl,
      // La date de création d'origine est conservée.
      createdAt: existing.createdAt,
      updatedAt,
    })

    if (targetLibrary !== library) {
      await this.moveSeriesNative({ series, library })
      return updatedAt
    }

    const entries = seriesRowPayload(series, library).filter(([column]) => column !== 'id' && column !== 'profile_id' && column !== 'created_at')
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`)
    const values = entries.map(([, value]) => value)
    values.push(id, profileId)
    const result = await database.execute(
      `UPDATE ${seriesTable(library)}
       SET ${assignments.join(',\n           ')}
       WHERE id = $${values.length - 1} AND profile_id = $${values.length}`,
      values,
    )

    if (result.rowsAffected !== 1) {
      throw new Error('La série à modifier est introuvable dans le profil courant.')
    }

    return updatedAt
  }

  /**
   * Enregistre seulement la bannière 16:9 (document v7). Le formulaire ne la
   * porte pas : elle s'écrit depuis la fiche, sans réécrire les autres champs.
   * `null` retire la bannière ; aucune bannière par défaut n'est réintroduite.
   */
  async setSeriesBanner(
    profileId: string,
    id: string,
    bannerUrl: string | null,
    library: SeriesTableLibrary = 'series',
  ): Promise<string> {
    const stored = normalizeBannerUrl(bannerUrl)
    if (stored !== null && !isBannerUrl(stored)) {
      throw new Error('Une bannière doit être l’adresse https d’une image.')
    }
    const database = await this.loadDatabase()
    const updatedAt = this.now()
    const result = await database.execute(
      `UPDATE ${seriesTable(library)}
       SET banner_url = $1, updated_at = $2
       WHERE id = $3 AND profile_id = $4`,
      [stored, updatedAt, id, profileId],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('La série à modifier est introuvable dans le profil courant.')
    }

    return updatedAt
  }

  async deleteSeries(profileId: string, id: string, library: SeriesTableLibrary = 'series'): Promise<void> {
    const database = await this.loadDatabase()
    const result = await database.execute(
      `DELETE FROM ${seriesTable(library)}
       WHERE id = $1 AND profile_id = $2`,
      [id, profileId],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('La série à supprimer est introuvable dans le profil courant.')
    }
  }

  async listBooks(profileId: string, library: BookTableLibrary = 'books'): Promise<Book[]> {
    const database = await this.loadDatabase()
    const rows = await database.select<BookRow[]>(
      `SELECT ${bookColumns(library)}
       FROM ${bookTable(library)}
       WHERE profile_id = $1
       ORDER BY title COLLATE NOCASE ASC, created_at ASC`,
      [profileId],
    )
    const quotes = await database.select<BookQuoteRow[]>(
      `SELECT id, ${quoteOwnerColumn(library)} AS book_id, body, position, created_at
       FROM ${quoteTable(library)}
       WHERE ${quoteOwnerColumn(library)} IN (SELECT id FROM ${bookTable(library)} WHERE profile_id = $1)
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

  async searchBooks(profileId: string, criteria: BookSearchCriteria, library: BookTableLibrary = 'books'): Promise<Book[]> {
    const database = await this.loadDatabase()
    const clauses = ['profile_id = $1']
    const bindValues: unknown[] = [profileId]
    const query = criteria.query.trim()

    if (query) {
      bindValues.push(`%${escapeLikePattern(query)}%`)
      const searchParameter = `$${bindValues.length}`
      clauses.push(`(
        title COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
        OR author COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
        OR summary COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
      )`)
    }

    // `mangas` n'a plus de colonne de catégorie : sa table est déjà la partition.
    if (library === 'books' && criteria.category !== 'all') {
      // Interrupteur 0.6.8 : la sélection peut compter plusieurs catégories.
      const selected = Array.isArray(criteria.category) ? criteria.category : [criteria.category]
      if (selected.length === 1) {
        bindValues.push(selected[0])
        clauses.push(`category = $${bindValues.length}`)
      } else if (selected.length > 1) {
        const placeholders = selected.map((value) => {
          bindValues.push(value)
          return `$${bindValues.length}`
        })
        clauses.push(`category IN (${placeholders.join(', ')})`)
      }
    }

    appendLibraryFilterClauses(criteria.filters, BOOK_QUERY_COLUMNS, clauses, bindValues, escapeLikePattern)

    const rows = await database.select<BookRow[]>(
      `SELECT ${bookColumns(library)}
       FROM ${bookTable(library)}
       WHERE ${clauses.join('\n         AND ')}
       ORDER BY ${librarySortOrderBy(criteria.sort, BOOK_QUERY_COLUMNS)}`,
      bindValues,
    )
    if (rows.length === 0) return []

    const quotes = await database.select<BookQuoteRow[]>(
      `SELECT id, ${quoteOwnerColumn(library)} AS book_id, body, position, created_at
       FROM ${quoteTable(library)}
       WHERE ${quoteOwnerColumn(library)} IN (SELECT id FROM ${bookTable(library)} WHERE profile_id = $1)
       ORDER BY position ASC, created_at ASC`,
      [profileId],
    )
    const resultIds = new Set(rows.map((row) => row.id))
    const quotesByBook = new Map<string, BookQuote[]>()
    for (const quote of quotes.map(toBookQuote)) {
      if (!resultIds.has(quote.bookId)) continue
      const list = quotesByBook.get(quote.bookId) ?? []
      list.push(quote)
      quotesByBook.set(quote.bookId, list)
    }

    return rows.map((row) => toBook(row, quotesByBook.get(row.id) ?? []))
  }

  async getBook(profileId: string, id: string, library: BookTableLibrary = 'books'): Promise<Book | null> {
    const database = await this.loadDatabase()
    const rows = await database.select<BookRow[]>(
      `SELECT ${bookColumns(library)}
       FROM ${bookTable(library)}
       WHERE id = $1 AND profile_id = $2
       LIMIT 1`,
      [id, profileId],
    )
    const row = rows[0]
    if (!row) return null

    const quotes = await database.select<BookQuoteRow[]>(
      `SELECT id, ${quoteOwnerColumn(library)} AS book_id, body, position, created_at
       FROM ${quoteTable(library)}
       WHERE ${quoteOwnerColumn(library)} = $1
       ORDER BY position ASC, created_at ASC`,
      [id],
    )

    return toBook(row, quotes.map(toBookQuote))
  }

  async createBook(
    profileId: string,
    input: Omit<Book, 'id' | 'profileId' | 'createdAt' | 'updatedAt' | 'progressUpdatedAt' | 'quotes'>,
    quotes: string[] = [],
    library: BookTableLibrary = 'books',
  ): Promise<Book> {
    const id = this.createId()
    const now = this.now()
    const book = normalizeBook({
      id,
      profileId,
      ...input,
      progressUpdatedAt: resolveInitialProgress(input.volumesRead, now),
      createdAt: now,
      updatedAt: now,
      quotes: createBookQuotes(id, quotes, now, this.createId),
    })
    const { quotes: createdQuotes, ...nativeBook } = book
    await this.createBookNative({ book: nativeBook, quotes: createdQuotes, library })
    return book
  }

  async updateBook(
    profileId: string,
    id: string,
    input: Omit<Book, 'id' | 'profileId' | 'createdAt' | 'updatedAt' | 'progressUpdatedAt' | 'quotes'>,
    quotes?: string[],
    library: BookTableLibrary = 'books',
  ): Promise<string> {
    const existing = await this.getBook(profileId, id, library)
    if (!existing) {
      throw new Error('Le livre à modifier est introuvable dans le profil courant.')
    }

    const updatedAt = this.now()
    const book = normalizeBook({
      ...input,
      id,
      profileId,
      progressUpdatedAt: resolveProgressTimestamp(existing.volumesRead, input.volumesRead, existing.progressUpdatedAt, updatedAt),
      createdAt: existing.createdAt,
      updatedAt,
      quotes: quotes === undefined
        ? existing.quotes
        : createBookQuotes(id, quotes, updatedAt, this.createId, existing.quotes),
    })
    const { quotes: updatedQuotes, ...nativeBook } = book
    await this.updateBookNative({ book: nativeBook, quotes: updatedQuotes, library })
    return updatedAt
  }

  async deleteBook(profileId: string, id: string, library: BookTableLibrary = 'books'): Promise<void> {
    await this.deleteBookNative(profileId, id, library)
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

  async searchGames(profileId: string, criteria: GameSearchCriteria): Promise<Game[]> {
    const database = await this.loadDatabase()
    const clauses = ['profile_id = $1']
    const bindValues: unknown[] = [profileId]
    const query = criteria.query.trim()

    if (query) {
      bindValues.push(`%${escapeLikePattern(query)}%`)
      const searchParameter = `$${bindValues.length}`
      clauses.push(`(
        title COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
        OR developer COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
        OR platform COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
      )`)
    }

    if (criteria.platform !== 'all') {
      bindValues.push(criteria.platform)
      clauses.push(`platform = $${bindValues.length} COLLATE NOCASE`)
    }

    appendLibraryFilterClauses(criteria.filters, GAME_QUERY_COLUMNS, clauses, bindValues, escapeLikePattern)

    const rows = await database.select<GameRow[]>(
      `SELECT ${GAME_COLUMNS}
       FROM games
       WHERE ${clauses.join('\n         AND ')}
       ORDER BY ${librarySortOrderBy(criteria.sort, GAME_QUERY_COLUMNS)}`,
      bindValues,
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
    input: Omit<Game, 'id' | 'profileId' | 'createdAt' | 'updatedAt' | 'bannerUrl'>,
  ): Promise<Game> {
    const database = await this.loadDatabase()
    const id = this.createId()
    const now = this.now()
    const game = normalizeGame({
      id,
      profileId,
      ...input,
      // La bannière se choisit depuis la fiche : une création n'en porte pas.
      bannerUrl: null,
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
    input: Omit<Game, 'id' | 'profileId' | 'createdAt' | 'updatedAt' | 'bannerUrl'>,
  ): Promise<string> {
    const database = await this.loadDatabase()
    const updatedAt = this.now()
    // `banner_url` reste hors de cet UPDATE : le formulaire ne la porte pas et
    // modifier une fiche ne doit pas effacer la bannière choisie.
    const game = normalizeGame({
      ...input,
      id,
      profileId,
      bannerUrl: null,
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

  /** Bannière 16:9 d'un jeu : même contrat que `setSeriesBanner`. */
  async setGameBanner(profileId: string, id: string, bannerUrl: string | null): Promise<string> {
    const stored = normalizeBannerUrl(bannerUrl)
    if (stored !== null && !isBannerUrl(stored)) {
      throw new Error('Une bannière doit être l’adresse https d’une image.')
    }
    const database = await this.loadDatabase()
    const updatedAt = this.now()
    const result = await database.execute(
      `UPDATE games
       SET banner_url = $1, updated_at = $2
       WHERE id = $3 AND profile_id = $4`,
      [stored, updatedAt, id, profileId],
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

  async searchArtworks(profileId: string, criteria: ArtworkSearchCriteria): Promise<Artwork[]> {
    const database = await this.loadDatabase()
    const clauses = ['profile_id = $1']
    const bindValues: unknown[] = [profileId]
    const query = criteria.query.trim()

    if (query) {
      bindValues.push(`%${escapeLikePattern(query)}%`)
      const searchParameter = `$${bindValues.length}`
      clauses.push(`(
        title COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
        OR artist COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
        OR location COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
        OR exhibition COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM json_each(artworks.details)
          WHERE CAST(json_each.value AS TEXT) COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
        )
      )`)
    }

    if (criteria.form !== 'all') {
      bindValues.push(criteria.form)
      clauses.push(`form = $${bindValues.length}`)
    }

    appendLibraryFilterClauses(criteria.filters, ARTWORK_QUERY_COLUMNS, clauses, bindValues, escapeLikePattern)

    const rows = await database.select<ArtworkRow[]>(
      `SELECT ${ARTWORK_COLUMNS}
       FROM artworks
       WHERE ${clauses.join('\n         AND ')}
       ORDER BY ${librarySortOrderBy(criteria.sort, ARTWORK_QUERY_COLUMNS)}`,
      bindValues,
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
         custom_fields,
         created_at,
         updated_at,
         details
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
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
        serializeArtworkCustomFields(artwork.customFields),
        artwork.createdAt,
        artwork.updatedAt,
        serializeArtworkDetails(artwork.details),
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
         custom_fields = $12,
         updated_at = $13,
         details = $16
       WHERE id = $14 AND profile_id = $15`,
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
        serializeArtworkCustomFields(artwork.customFields),
        artwork.updatedAt,
        id,
        profileId,
        serializeArtworkDetails(artwork.details),
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

function createBookQuotes(
  bookId: string,
  bodies: string[],
  createdAt: string,
  createId: IdFactory,
  previous: BookQuote[] = [],
): BookQuote[] {
  return reconcileBookQuotes(bookId, bodies, createdAt, createId, previous)
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
