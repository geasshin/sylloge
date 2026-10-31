import { FILM_STATUSES, normalizeFilm, type Film, type FilmStatus } from '../domain/film.ts'
import { isHttpUrl } from '../domain/customLibraries.ts'
import { isBannerUrl, normalizeBannerUrl, parseBannerPosition } from '../domain/bannerImages.ts'
import type { FilmWriteInput } from '../domain/filmForm.ts'
import type { FilmMetadataProvenance } from '../domain/filmMetadataAssistance.ts'
import type { LibrarySort } from '../domain/libraryViews.ts'
import type { LibraryFilters } from '../domain/libraryFilters.ts'
import type { SyllogeExportDocument } from '../domain/libraryTransfer.ts'
import type { Profile } from '../domain/profile.ts'
import { DEFAULT_PROFILE_ID, loadSyllogeDatabase } from './database.ts'
import { appendLibraryFilterClauses, librarySortOrderBy, type LibraryQueryColumns } from './libraryViewQuery.ts'
import {
  importLibraryAtomically,
  type ImportLibraryResult,
  type NativeImportPayload,
} from './nativePortability.ts'

export type FilmLibrary = {
  profile: Profile
  films: Film[]
}

export type ProfileSummary = Profile & {
  filmCount: number
}

type ProfileRow = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

type FilmRow = {
  id: string
  profile_id: string
  title: string
  original_title: string | null
  year: number | null
  status: string
  is_favorite: number
  rating: number | null
  watched_at: string | null
  personal_note: string | null
  director: string | null
  summary: string | null
  provider_name: string | null
  provider_id: string | null
  poster_url: string | null
  banner_url: string | null
  banner_position: number | null
  created_at: string
  updated_at: string
}

type ProfileSummaryRow = ProfileRow & {
  film_count: number
}

export type FilmSearchCriteria = {
  query: string
  filters?: LibraryFilters
  sort: LibrarySort
}

/** Colonnes Films réellement filtrables et triables (jalons 0.4.20 et 0.4.23). */
const FILM_QUERY_COLUMNS: LibraryQueryColumns = {
  rating: true,
  year: true,
  personalDateColumn: 'watched_at',
  specificTextColumn: 'director',
  locationColumn: null,
  exhibitionColumn: null,
  progressColumn: null,
}

export type SqliteQueryResult = {
  rowsAffected: number
  lastInsertId?: number
}

export interface SqliteDatabase {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>
  execute(query: string, bindValues?: unknown[]): Promise<SqliteQueryResult>
}

export type DatabaseLoader = () => Promise<SqliteDatabase>
export type IdFactory = () => string
export type NowFactory = () => string
export type NativeImporter = (payload: NativeImportPayload) => Promise<ImportLibraryResult>

function toFilmStatus(value: string): FilmStatus {
  if ((FILM_STATUSES as readonly string[]).includes(value)) {
    return value as FilmStatus
  }

  throw new Error(`Statut Film inconnu dans SQLite : ${value}`)
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toFilm(row: FilmRow): Film {
  return normalizeFilm({
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    originalTitle: row.original_title,
    year: row.year,
    status: toFilmStatus(row.status),
    isFavorite: row.is_favorite === 1,
    rating: row.rating,
    watchedAt: row.watched_at,
    personalNote: row.personal_note,
    director: row.director,
    summary: row.summary,
    providerName: row.provider_name,
    providerId: row.provider_id,
    posterUrl: row.poster_url,
    bannerUrl: row.banner_url,
    bannerPosition: row.banner_position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export class SqliteFilmsRepository {
  private readonly loadDatabase: DatabaseLoader
  private readonly createId: IdFactory
  private readonly now: NowFactory
  private readonly importNative: NativeImporter

  constructor(
    loadDatabase: DatabaseLoader = loadSyllogeDatabase,
    createId: IdFactory = () => crypto.randomUUID(),
    now: NowFactory = () => new Date().toISOString(),
    importNative: NativeImporter = importLibraryAtomically,
  ) {
    this.loadDatabase = loadDatabase
    this.createId = createId
    this.now = now
    this.importNative = importNative
  }

  async loadDefaultLibrary(): Promise<FilmLibrary> {
    return this.loadLibrary(DEFAULT_PROFILE_ID)
  }

  async loadCurrentLibrary(): Promise<FilmLibrary> {
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

  async loadLibrary(profileId: string): Promise<FilmLibrary> {
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

    const rows = await database.select<FilmRow[]>(
      `SELECT
         id,
         profile_id,
         title,
         original_title,
         year,
         status,
         is_favorite,
         rating,
         watched_at,
         personal_note,
         director,
         summary,
         provider_name,
         provider_id,
         poster_url,
         banner_url,
         banner_position,
         created_at,
         updated_at
       FROM films
       WHERE profile_id = $1
       ORDER BY title COLLATE NOCASE ASC, created_at ASC`,
      [profileRow.id],
    )

    return {
      profile: toProfile(profileRow),
      films: rows.map(toFilm),
    }
  }

  async listProfiles(): Promise<ProfileSummary[]> {
    const database = await this.loadDatabase()
    const rows = await database.select<ProfileSummaryRow[]>(
      `SELECT
         profiles.id,
         profiles.name,
         profiles.created_at,
         profiles.updated_at,
         COUNT(films.id) AS film_count
       FROM profiles
       LEFT JOIN films ON films.profile_id = profiles.id
       GROUP BY profiles.id
       ORDER BY
         CASE WHEN profiles.id = $1 THEN 0 ELSE 1 END,
         profiles.created_at ASC,
         profiles.name COLLATE NOCASE ASC`,
      [DEFAULT_PROFILE_ID],
    )

    return rows.map((row) => ({
      ...toProfile(row),
      filmCount: row.film_count,
    }))
  }

  async selectProfile(profileId: string): Promise<FilmLibrary> {
    const database = await this.loadDatabase()
    const result = await database.execute(
      `UPDATE current_profile
       SET profile_id = $1, updated_at = $2
       WHERE singleton = 1
         AND EXISTS (SELECT 1 FROM profiles WHERE id = $1)`,
      [profileId, this.now()],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('Le profil à ouvrir est introuvable.')
    }

    return this.loadLibrary(profileId)
  }

  async importLibrary(document: SyllogeExportDocument): Promise<FilmLibrary> {
    const importedAt = this.now()
    const profileId = this.createId()
    const payload: NativeImportPayload = {
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
    }
    const result = await this.importNative(payload)

    if (result.profileId !== profileId || result.filmCount !== payload.films.length) {
      throw new Error('Le rapport SQLite de l’import ne correspond pas au document validé.')
    }

    return this.loadLibrary(profileId)
  }

  async searchFilms(profileId: string, criteria: FilmSearchCriteria): Promise<Film[]> {
    const database = await this.loadDatabase()
    const clauses = ['profile_id = $1']
    const bindValues: unknown[] = [profileId]
    const query = criteria.query.trim()

    if (query) {
      bindValues.push(`%${escapeLikePattern(query)}%`)
      const searchParameter = `$${bindValues.length}`
      clauses.push(`(
        title COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
        OR original_title COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
        OR director COLLATE NOCASE LIKE ${searchParameter} ESCAPE '\\'
      )`)
    }

    appendLibraryFilterClauses(criteria.filters, FILM_QUERY_COLUMNS, clauses, bindValues, escapeLikePattern)

    const rows = await database.select<FilmRow[]>(
      `SELECT
         id,
         profile_id,
         title,
         original_title,
         year,
         status,
         is_favorite,
         rating,
         watched_at,
         personal_note,
         director,
         summary,
         provider_name,
         provider_id,
         poster_url,
         banner_url,
         banner_position,
         created_at,
         updated_at
       FROM films
       WHERE ${clauses.join('\n         AND ')}
       ORDER BY ${librarySortOrderBy(criteria.sort, FILM_QUERY_COLUMNS)}`,
      bindValues,
    )

    return rows.map(toFilm)
  }

  async getFilm(profileId: string, id: string): Promise<Film | null> {
    const database = await this.loadDatabase()
    const rows = await database.select<FilmRow[]>(
      `SELECT
         id,
         profile_id,
         title,
         original_title,
         year,
         status,
         is_favorite,
         rating,
         watched_at,
         personal_note,
         director,
         summary,
         provider_name,
         provider_id,
         poster_url,
         banner_url,
         banner_position,
         created_at,
         updated_at
       FROM films
       WHERE id = $1 AND profile_id = $2
       LIMIT 1`,
      [id, profileId],
    )

    return rows[0] ? toFilm(rows[0]) : null
  }

  async createFilm(
    profileId: string,
    input: FilmWriteInput,
    provenance: FilmMetadataProvenance | null = null,
  ): Promise<Film> {
    const database = await this.loadDatabase()
    const id = this.createId()
    const now = this.now()
    // Une fiche créée par un formulaire ou un import de collection n'a pas de
    // bannière : elle se choisit depuis la fiche (colonne laissée à NULL).
    const film = normalizeFilm({
      id,
      profileId,
      ...input,
      providerName: provenance?.providerName ?? null,
      providerId: provenance?.providerId ?? null,
      bannerUrl: null,
      bannerPosition: null,
      createdAt: now,
      updatedAt: now,
    })
    const result = await database.execute(
      `INSERT INTO films (
         id,
         profile_id,
         title,
         original_title,
         year,
         status,
         is_favorite,
         rating,
         watched_at,
         personal_note,
         director,
         summary,
         provider_name,
         provider_id,
         poster_url,
         created_at,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        film.id,
        film.profileId,
        film.title,
        film.originalTitle,
        film.year,
        film.status,
        film.isFavorite ? 1 : 0,
        film.rating,
        film.watchedAt,
        film.personalNote,
        film.director,
        film.summary,
        film.providerName,
        film.providerId,
        film.posterUrl,
        film.createdAt,
        film.updatedAt,
      ],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('La création du film n’a modifié aucune ligne SQLite.')
    }

    return film
  }

  async updateFilm(profileId: string, id: string, input: FilmWriteInput): Promise<string> {
    const database = await this.loadDatabase()
    const updatedAt = this.now()
    // `banner_url` reste hors de cet UPDATE : modifier une fiche au formulaire
    // ne doit jamais effacer une bannière choisie depuis la fiche.
    const film = normalizeFilm({
      id,
      profileId,
      ...input,
      providerName: null,
      providerId: null,
      bannerUrl: null,
      bannerPosition: null,
      createdAt: updatedAt,
      updatedAt,
    })
    const result = await database.execute(
      `UPDATE films
       SET
         title = $1,
         original_title = $2,
         year = $3,
         status = $4,
         is_favorite = $5,
         rating = $6,
         watched_at = $7,
         personal_note = $8,
         director = $9,
         summary = $10,
         poster_url = $11,
         updated_at = $12
       WHERE id = $13 AND profile_id = $14`,
      [
        film.title,
        film.originalTitle,
        film.year,
        film.status,
        film.isFavorite ? 1 : 0,
        film.rating,
        film.watchedAt,
        film.personalNote,
        film.director,
        film.summary,
        film.posterUrl,
        updatedAt,
        id,
        profileId,
      ],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('Le film à modifier est introuvable dans le profil courant.')
    }

    return updatedAt
  }

  /**
   * Enregistre seulement l'adresse de l'affiche : depuis la fiche, le lien personnel ne doit pas
   * passer par une réécriture complète qui reprendrait les champs d'une lecture périmée.
   * `null` retire le lien et rend la main à l'affiche du fournisseur.
   */
  async updateFilmPoster(profileId: string, id: string, posterUrl: string | null): Promise<string> {
    const stored = posterUrl === null || posterUrl.trim() === '' ? null : posterUrl.trim()
    if (stored !== null && !isHttpUrl(stored)) {
      throw new Error('L’adresse de l’affiche doit commencer par http:// ou https://.')
    }
    const database = await this.loadDatabase()
    const updatedAt = this.now()
    const result = await database.execute(
      `UPDATE films
       SET poster_url = $1, updated_at = $2
       WHERE id = $3 AND profile_id = $4`,
      [stored, updatedAt, id, profileId],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('Le film à modifier est introuvable dans le profil courant.')
    }

    return updatedAt
  }

  /**
   * Enregistre seulement la bannière 16:9 (v7). Elle ne passe pas par l'UPDATE
   * du formulaire, qui ne la connaît pas : une adresse collée ou choisie dans
   * la galerie est écrite ici, sans toucher aux autres champs.
   * `null` retire la bannière ; aucune bannière par défaut n'est réintroduite.
   * Une nouvelle image repart centrée : la position revient à `null` (v9).
   */
  async updateFilmBanner(profileId: string, id: string, bannerUrl: string | null): Promise<string> {
    const stored = normalizeBannerUrl(bannerUrl)
    if (stored !== null && !isBannerUrl(stored)) {
      throw new Error('Une bannière doit être l’adresse https d’une image.')
    }
    const database = await this.loadDatabase()
    const updatedAt = this.now()
    const result = await database.execute(
      `UPDATE films
       SET banner_url = $1, banner_position = NULL, updated_at = $2
       WHERE id = $3 AND profile_id = $4`,
      [stored, updatedAt, id, profileId],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('Le film à modifier est introuvable dans le profil courant.')
    }

    return updatedAt
  }

  /**
   * Recadrage vertical de la bannière (v9, migration 0028) : un pourcentage
   * d'`object-position`, `null` pour revenir au centre. La valeur est arrondie
   * et bornée ici comme en base ; une position hors bornes est refusée plutôt
   * que silencieusement corrigée à l'écriture.
   */
  async setFilmBannerPosition(profileId: string, id: string, position: number | null): Promise<string> {
    const stored = parseBannerPosition(position)
    const database = await this.loadDatabase()
    const updatedAt = this.now()
    const result = await database.execute(
      `UPDATE films
       SET banner_position = $1, updated_at = $2
       WHERE id = $3 AND profile_id = $4`,
      [stored, updatedAt, id, profileId],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('Le film à modifier est introuvable dans le profil courant.')
    }

    return updatedAt
  }

  async deleteFilm(profileId: string, id: string): Promise<void> {
    const database = await this.loadDatabase()
    const result = await database.execute(
      `DELETE FROM films
       WHERE id = $1 AND profile_id = $2`,
      [id, profileId],
    )

    if (result.rowsAffected !== 1) {
      throw new Error('Le film à supprimer est introuvable dans le profil courant.')
    }
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

export const filmsRepository = new SqliteFilmsRepository()
