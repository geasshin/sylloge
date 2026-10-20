import type { ImportPreview, SyllogeExportDocument } from '../domain/libraryTransfer.ts'
import type { Artwork } from '../domain/artwork.ts'
import type { Book } from '../domain/book.ts'
import type { Film } from '../domain/film.ts'
import type { Game } from '../domain/game.ts'
import type { Series } from '../domain/series.ts'
import {
  planArtworkMerge,
  planBookMerge,
  planFilmMerge,
  planGameMerge,
  planSeriesMerge,
  resolveArtworkMerge,
  resolveBookMerge,
  resolveFilmMerge,
  resolveGameMerge,
  resolveSeriesMerge,
  type ArtworkMergePlan,
  type BookMergePlan,
  type DuplicateResolution,
  type FilmMergePlan,
  type GameMergePlan,
  type SeriesMergePlan,
} from '../domain/importMerge.ts'
import {
  importAnimeIntoProfile,
  importArtworksIntoProfile,
  importBooksIntoProfile,
  importFilmsIntoProfile,
  importGamesIntoProfile,
  importMangasIntoProfile,
  importSeriesIntoProfile,
  type CollectionImportResult,
} from './nativePortability.ts'

export type ConfirmedImporter<Result> = (document: SyllogeExportDocument) => Promise<Result>

export function confirmValidatedImport<Result>(
  preview: ImportPreview,
  importer: ConfirmedImporter<Result>,
): Promise<Result> {
  if (preview.document === null || preview.errors.length > 0) {
    return Promise.reject(new Error('Un import invalide ne peut déclencher aucune écriture.'))
  }

  return importer(preview.document)
}

// ---------------------------------------------------------------------------
// Jalon 0.4.4 — imports unitaires dans le profil courant (remplacer/fusionner)
// ---------------------------------------------------------------------------

export type ImportMode = 'replace' | 'merge'

export type PreparedFilmsImport = {
  mode: ImportMode
  imported: Film[]
  mergePlan: FilmMergePlan | null
}

export type PreparedSeriesImport = {
  mode: ImportMode
  imported: Series[]
  mergePlan: SeriesMergePlan | null
}

export type PreparedBooksImport = {
  mode: ImportMode
  imported: Book[]
  mergePlan: BookMergePlan | null
}

export type PreparedGamesImport = {
  mode: ImportMode
  imported: Game[]
  mergePlan: GameMergePlan | null
}

export type PreparedArtworksImport = {
  mode: ImportMode
  imported: Artwork[]
  mergePlan: ArtworkMergePlan | null
}

/** Prépare un import Films : en mode fusion, détecte les doublons au titre. */
export function prepareFilmsImport(mode: ImportMode, existing: Film[], imported: Film[]): PreparedFilmsImport {
  return {
    mode,
    imported,
    mergePlan: mode === 'merge' ? planFilmMerge(existing, imported) : null,
  }
}

/** Prépare un import Séries. */
export function prepareSeriesImport(mode: ImportMode, existing: Series[], imported: Series[]): PreparedSeriesImport {
  return {
    mode,
    imported,
    mergePlan: mode === 'merge' ? planSeriesMerge(existing, imported) : null,
  }
}

/** Prépare un import Livres, citations comprises. */
export function prepareBooksImport(mode: ImportMode, existing: Book[], imported: Book[]): PreparedBooksImport {
  return {
    mode,
    imported,
    mergePlan: mode === 'merge' ? planBookMerge(existing, imported) : null,
  }
}

export function prepareGamesImport(mode: ImportMode, existing: Game[], imported: Game[]): PreparedGamesImport {
  return { mode, imported, mergePlan: mode === 'merge' ? planGameMerge(existing, imported) : null }
}

export function prepareArtworksImport(mode: ImportMode, existing: Artwork[], imported: Artwork[]): PreparedArtworksImport {
  return { mode, imported, mergePlan: mode === 'merge' ? planArtworkMerge(existing, imported) : null }
}

/**
 * Écrit un import Films dans le profil courant. En mode « Remplacer », la
 * collection est vidée puis l'import installé. En mode « Fusionner », les
 * choix de l'utilisateur sur chaque doublon sont appliqués.
 */
export async function writeFilmsImport(
  profileId: string,
  prepared: PreparedFilmsImport,
  resolutions: Map<string, DuplicateResolution>,
  regenerateId: () => string = () => crypto.randomUUID(),
  now: () => string = () => new Date().toISOString(),
): Promise<CollectionImportResult> {
  const timestamp = now()

  if (prepared.mode === 'replace' || prepared.mergePlan === null) {
    return importFilmsIntoProfile({
      profileId,
      replaceExisting: prepared.mode === 'replace',
      inserts: prepared.imported.map((film) => ({
        ...film,
        id: regenerateId(),
        profileId,
        updatedAt: timestamp,
      })),
      updates: [],
    })
  }

  const writePlan = resolveFilmMerge([], prepared.mergePlan, resolutions, timestamp)
  return importFilmsIntoProfile({
    profileId,
    replaceExisting: false,
    inserts: writePlan.inserts.map((film) => ({ ...film, id: regenerateId(), profileId })),
    updates: writePlan.updates.map((film) => ({ ...film, profileId })),
  })
}

/** Écrit un import Séries dans le profil courant, mêmes règles que Films. */
export async function writeSeriesImport(
  profileId: string,
  prepared: PreparedSeriesImport,
  resolutions: Map<string, DuplicateResolution>,
  regenerateId: () => string = () => crypto.randomUUID(),
  now: () => string = () => new Date().toISOString(),
  library: 'series' | 'anime' = 'series',
): Promise<CollectionImportResult> {
  const timestamp = now()
  // Une bibliothèque = une table : l'import écrit dans celle qui est ouverte.
  const importIntoProfile = library === 'anime' ? importAnimeIntoProfile : importSeriesIntoProfile

  if (prepared.mode === 'replace' || prepared.mergePlan === null) {
    return importIntoProfile({
      profileId,
      replaceExisting: prepared.mode === 'replace',
      inserts: prepared.imported.map((series) => ({
        ...series,
        id: regenerateId(),
        profileId,
        updatedAt: timestamp,
      })),
      updates: [],
    })
  }

  const writePlan = resolveSeriesMerge([], prepared.mergePlan, resolutions, timestamp)
  return importIntoProfile({
    profileId,
    replaceExisting: false,
    inserts: writePlan.inserts.map((series) => ({ ...series, id: regenerateId(), profileId })),
    updates: writePlan.updates.map((series) => ({ ...series, profileId })),
  })
}

/** Écrit un import Livres atomique dans le profil courant. */
export async function writeBooksImport(
  profileId: string,
  prepared: PreparedBooksImport,
  resolutions: Map<string, DuplicateResolution>,
  regenerateId: () => string = () => crypto.randomUUID(),
  now: () => string = () => new Date().toISOString(),
  library: 'books' | 'mangas' = 'books',
): Promise<CollectionImportResult> {
  const timestamp = now()
  const importIntoProfile = library === 'mangas' ? importMangasIntoProfile : importBooksIntoProfile
  const remapBook = (book: Book, id: string): Book => ({
    ...book,
    id,
    profileId,
    updatedAt: timestamp,
    quotes: book.quotes.map((quote) => ({
      ...quote,
      id: regenerateId(),
      bookId: id,
    })),
  })

  if (prepared.mode === 'replace' || prepared.mergePlan === null) {
    return importIntoProfile({
      profileId,
      replaceExisting: prepared.mode === 'replace',
      inserts: prepared.imported.map((book) => remapBook(book, regenerateId())),
      updates: [],
    })
  }

  const writePlan = resolveBookMerge([], prepared.mergePlan, resolutions, timestamp)
  return importIntoProfile({
    profileId,
    replaceExisting: false,
    inserts: writePlan.inserts.map((book) => remapBook(book, regenerateId())),
    updates: writePlan.updates.map((book) => remapBook(book, book.id)),
  })
}

export async function writeGamesImport(
  profileId: string,
  prepared: PreparedGamesImport,
  resolutions: Map<string, DuplicateResolution>,
  regenerateId: () => string = () => crypto.randomUUID(),
  now: () => string = () => new Date().toISOString(),
): Promise<CollectionImportResult> {
  const timestamp = now()
  if (prepared.mode === 'replace' || prepared.mergePlan === null) {
    return importGamesIntoProfile({
      profileId,
      replaceExisting: prepared.mode === 'replace',
      inserts: prepared.imported.map((game) => ({ ...game, id: regenerateId(), profileId, updatedAt: timestamp })),
      updates: [],
    })
  }

  const writePlan = resolveGameMerge([], prepared.mergePlan, resolutions, timestamp)
  return importGamesIntoProfile({
    profileId,
    replaceExisting: false,
    inserts: writePlan.inserts.map((game) => ({ ...game, id: regenerateId(), profileId })),
    updates: writePlan.updates.map((game) => ({ ...game, profileId })),
  })
}

export async function writeArtworksImport(
  profileId: string,
  prepared: PreparedArtworksImport,
  resolutions: Map<string, DuplicateResolution>,
  regenerateId: () => string = () => crypto.randomUUID(),
  now: () => string = () => new Date().toISOString(),
): Promise<CollectionImportResult> {
  const timestamp = now()
  if (prepared.mode === 'replace' || prepared.mergePlan === null) {
    return importArtworksIntoProfile({
      profileId,
      replaceExisting: prepared.mode === 'replace',
      inserts: prepared.imported.map((artwork) => ({ ...artwork, id: regenerateId(), profileId, updatedAt: timestamp })),
      updates: [],
    })
  }

  const writePlan = resolveArtworkMerge([], prepared.mergePlan, resolutions, timestamp)
  return importArtworksIntoProfile({
    profileId,
    replaceExisting: false,
    inserts: writePlan.inserts.map((artwork) => ({ ...artwork, id: regenerateId(), profileId })),
    updates: writePlan.updates.map((artwork) => ({ ...artwork, profileId })),
  })
}
