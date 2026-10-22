import {
  CUSTOM_LIBRARY_TEMPLATES,
  isCustomLibraryId,
  isCustomStatus,
  normalizeCustomEntry,
  type CustomEntry,
  type CustomEntryWriteInput,
  type CustomLibrary,
  type CustomLibraryId,
  type CustomQuote,
  type EnabledCustomLibrary,
} from '../domain/customLibraries.ts'
import { loadSyllogeDatabase } from './database.ts'
import type { DatabaseLoader, IdFactory, NowFactory } from './filmsRepository.ts'
import {
  createCustomEntryAtomically,
  updateCustomEntryAtomically,
  deleteCustomEntryAtomically,
  removeCustomLibraryAtomically,
  type NativeCustomEntryWriter,
  type NativeCustomEntryDeleter,
  type NativeCustomLibraryRemover,
} from './nativeCustomEntries.ts'

/**
 * Accès SQLite des bibliothèques personnalisées. Le nom de table vient
 * toujours de la liste fermée CUSTOM_LIBRARY_IDS (identifiant = table) :
 * aucune chaîne extérieure n’est interpolée dans une requête.
 */

type EntryRow = {
  id: string
  profile_id: string
  title: string
  creator: string | null
  year: number | null
  status: string
  rating: number | null
  is_favorite: number
  progress_current: number | null
  progress_total: number | null
  progress_updated_at: string | null
  started_at: string | null
  finished_at: string | null
  cover_url: string | null
  summary: string | null
  personal_note: string | null
  details: string | null
  created_at: string
  updated_at: string
}

type QuoteRow = {
  id: string
  comic_id: string
  body: string
  position: number
  created_at: string
}

const ENTRY_COLUMNS = `id, profile_id, title, creator, year, status, rating, is_favorite,
  progress_current, progress_total, progress_updated_at, started_at, finished_at,
  cover_url, summary, personal_note, details, created_at, updated_at`

function tableFor(libraryId: CustomLibraryId): string {
  if (!isCustomLibraryId(libraryId)) throw new Error(`Bibliothèque inconnue : ${String(libraryId)}.`)
  return libraryId
}

function parseDetails(raw: string | null): Record<string, string> {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === 'string'))
  } catch {
    return {}
  }
}

function toEntry(row: EntryRow, quotes: CustomQuote[]): CustomEntry {
  return normalizeCustomEntry({
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    creator: row.creator,
    year: row.year,
    status: isCustomStatus(row.status) ? row.status : 'à découvrir',
    rating: row.rating,
    isFavorite: row.is_favorite === 1,
    progressCurrent: row.progress_current,
    progressTotal: row.progress_total,
    progressUpdatedAt: row.progress_updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    coverUrl: row.cover_url,
    summary: row.summary,
    personalNote: row.personal_note,
    details: parseDetails(row.details),
    quotes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function byTitle(first: CustomEntry, second: CustomEntry): number {
  return first.title.localeCompare(second.title, 'fr', { sensitivity: 'base' }) || first.createdAt.localeCompare(second.createdAt)
}

export class SqliteCustomLibraryRepository {
  private readonly loadDatabase: DatabaseLoader
  private readonly createId: IdFactory
  private readonly now: NowFactory
  private readonly createNative: NativeCustomEntryWriter
  private readonly updateNative: NativeCustomEntryWriter
  private readonly deleteNative: NativeCustomEntryDeleter
  private readonly removeNative: NativeCustomLibraryRemover

  constructor(
    loadDatabase: DatabaseLoader = loadSyllogeDatabase,
    createId: IdFactory = () => crypto.randomUUID(),
    now: NowFactory = () => new Date().toISOString(),
    createNative: NativeCustomEntryWriter = createCustomEntryAtomically,
    updateNative: NativeCustomEntryWriter = updateCustomEntryAtomically,
    deleteNative: NativeCustomEntryDeleter = deleteCustomEntryAtomically,
    removeNative: NativeCustomLibraryRemover = removeCustomLibraryAtomically,
  ) {
    this.loadDatabase = loadDatabase
    this.createId = createId
    this.now = now
    this.createNative = createNative
    this.updateNative = updateNative
    this.deleteNative = deleteNative
    this.removeNative = removeNative
  }

  /** Bibliothèques ajoutées au profil, dans l’ordre d’ajout, avec leur compte. */
  async listEnabled(profileId: string): Promise<EnabledCustomLibrary[]> {
    const database = await this.loadDatabase()
    const rows = await database.select<Array<{ library_id: string; position: number; added_at: string }>>(
      `SELECT library_id, position, added_at
       FROM profile_libraries
       WHERE profile_id = $1
       ORDER BY position ASC, added_at ASC`,
      [profileId],
    )
    const enabled: EnabledCustomLibrary[] = []
    for (const row of rows) {
      if (!isCustomLibraryId(row.library_id)) continue
      const [count] = await database.select<Array<{ n: number }>>(
        `SELECT COUNT(*) AS n FROM ${tableFor(row.library_id)} WHERE profile_id = $1`,
        [profileId],
      )
      enabled.push({ libraryId: row.library_id, position: row.position, addedAt: row.added_at, count: Number(count?.n ?? 0) })
    }
    return enabled
  }

  async enable(profileId: string, libraryId: CustomLibraryId): Promise<void> {
    const database = await this.loadDatabase()
    const [next] = await database.select<Array<{ position: number | null }>>(
      'SELECT MAX(position) + 1 AS position FROM profile_libraries WHERE profile_id = $1',
      [profileId],
    )
    await database.execute(
      `INSERT INTO profile_libraries (profile_id, library_id, position, added_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(profile_id, library_id) DO NOTHING`,
      [profileId, tableFor(libraryId), next?.position ?? 0, this.now()],
    )
  }

  /** Suppression des fiches, citations et activation dans une transaction native. */
  async remove(profileId: string, libraryId: CustomLibraryId): Promise<void> {
    tableFor(libraryId)
    await this.removeNative(profileId, libraryId)
  }

  async list(profileId: string, libraryId: CustomLibraryId): Promise<CustomEntry[]> {
    const database = await this.loadDatabase()
    const table = tableFor(libraryId)
    const rows = await database.select<EntryRow[]>(
      `SELECT ${ENTRY_COLUMNS} FROM ${table} WHERE profile_id = $1`,
      [profileId],
    )
    const quotes = libraryId === 'comics' ? await this.quotesFor(profileId) : new Map<string, CustomQuote[]>()
    return rows.map((row) => toEntry(row, quotes.get(row.id) ?? [])).sort(byTitle)
  }

  async get(profileId: string, libraryId: CustomLibraryId, id: string): Promise<CustomEntry | null> {
    const database = await this.loadDatabase()
    const rows = await database.select<EntryRow[]>(
      `SELECT ${ENTRY_COLUMNS} FROM ${tableFor(libraryId)} WHERE id = $1 AND profile_id = $2 LIMIT 1`,
      [id, profileId],
    )
    if (!rows[0]) return null
    const quotes = libraryId === 'comics' ? (await this.quotesFor(profileId)).get(id) ?? [] : []
    return toEntry(rows[0], quotes)
  }

  /** Toutes les bibliothèques ajoutées, fiches comprises (sauvegarde JSON). */
  async loadAll(profileId: string): Promise<CustomLibrary[]> {
    const enabled = await this.listEnabled(profileId)
    const libraries: CustomLibrary[] = []
    for (const library of enabled) {
      libraries.push({
        libraryId: library.libraryId,
        position: library.position,
        addedAt: library.addedAt,
        entries: await this.list(profileId, library.libraryId),
      })
    }
    return libraries
  }

  async create(profileId: string, libraryId: CustomLibraryId, input: CustomEntryWriteInput): Promise<CustomEntry> {
    tableFor(libraryId)
    const now = this.now()
    const id = this.createId()
    const progressTouched = input.progressCurrent !== null || input.progressTotal !== null
    const entry: CustomEntry = {
      ...input,
      id,
      profileId,
      progressUpdatedAt: progressTouched ? now : null,
      startedAt: input.status === 'en cours' ? now.slice(0, 10) : null,
      quotes: CUSTOM_LIBRARY_TEMPLATES[libraryId].quotes ? this.prepareQuotes(id, input.quotes, now) : [],
      createdAt: now,
      updatedAt: now,
    }
    await this.createNative({ libraryId, entry })
    const created = await this.get(profileId, libraryId, id)
    if (!created) throw new Error('La fiche créée n’a pas pu être relue depuis SQLite.')
    return created
  }

  async update(profileId: string, libraryId: CustomLibraryId, id: string, input: CustomEntryWriteInput): Promise<CustomEntry> {
    tableFor(libraryId)
    const current = await this.get(profileId, libraryId, id)
    if (!current) throw new Error('La fiche à modifier est introuvable dans le profil courant.')
    const now = this.now()
    const progressChanged = current.progressCurrent !== input.progressCurrent || current.progressTotal !== input.progressTotal
    const entry: CustomEntry = {
      ...current,
      ...input,
      id,
      profileId,
      progressUpdatedAt: progressChanged ? now : current.progressUpdatedAt,
      startedAt: current.startedAt ?? (input.status === 'en cours' ? now.slice(0, 10) : null),
      quotes: CUSTOM_LIBRARY_TEMPLATES[libraryId].quotes ? this.prepareQuotes(id, input.quotes, now, current.quotes) : [],
      createdAt: current.createdAt,
      updatedAt: now,
    }
    await this.updateNative({ libraryId, entry })
    const updated = await this.get(profileId, libraryId, id)
    if (!updated) throw new Error('La fiche modifiée n’a pas pu être relue depuis SQLite.')
    return updated
  }

  async setCover(profileId: string, libraryId: CustomLibraryId, id: string, coverUrl: string | null): Promise<void> {
    const database = await this.loadDatabase()
    const result = await database.execute(
      `UPDATE ${tableFor(libraryId)} SET cover_url = $1, updated_at = $2 WHERE id = $3 AND profile_id = $4`,
      [coverUrl, this.now(), id, profileId],
    )
    if (result.rowsAffected !== 1) throw new Error('La fiche à modifier est introuvable dans le profil courant.')
  }

  async delete(profileId: string, libraryId: CustomLibraryId, id: string): Promise<void> {
    tableFor(libraryId)
    await this.deleteNative(profileId, libraryId, id)
  }

  private async quotesFor(profileId: string): Promise<Map<string, CustomQuote[]>> {
    const database = await this.loadDatabase()
    const rows = await database.select<QuoteRow[]>(
      `SELECT q.id, q.comic_id, q.body, q.position, q.created_at
       FROM comic_quotes q
       JOIN comics c ON c.id = q.comic_id
       WHERE c.profile_id = $1
       ORDER BY q.comic_id, q.position ASC`,
      [profileId],
    )
    const quotes = new Map<string, CustomQuote[]>()
    for (const row of rows) {
      const list = quotes.get(row.comic_id) ?? []
      list.push({ id: row.id, entryId: row.comic_id, body: row.body, position: row.position, createdAt: row.created_at })
      quotes.set(row.comic_id, list)
    }
    return quotes
  }

  /** Prépare sans écrire ; les occurrences inchangées gardent chacune leur identité. */
  private prepareQuotes(entryId: string, bodies: string[], now: string, previous: CustomQuote[] = []): CustomQuote[] {
    const available = [...previous]
    return bodies.map((body, position) => {
      const reusedIndex = available.findIndex(quote => quote.body === body)
      const reused = reusedIndex >= 0 ? available.splice(reusedIndex, 1)[0] : null
      return { id: reused?.id ?? this.createId(), entryId, body, position, createdAt: reused?.createdAt ?? now }
    })
  }
}

export const customLibraryRepository = new SqliteCustomLibraryRepository()
