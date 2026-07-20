import type { ImportPreview, SyllogeExportDocument } from '../domain/libraryTransfer.ts'
import type { Film } from '../domain/film.ts'
import type { Series } from '../domain/series.ts'
import {
  planFilmMerge,
  planSeriesMerge,
  resolveFilmMerge,
  resolveSeriesMerge,
  type DuplicateResolution,
  type FilmMergePlan,
  type SeriesMergePlan,
} from '../domain/importMerge.ts'
import {
  importFilmsIntoProfile,
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
): Promise<CollectionImportResult> {
  const timestamp = now()

  if (prepared.mode === 'replace' || prepared.mergePlan === null) {
    return importSeriesIntoProfile({
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
  return importSeriesIntoProfile({
    profileId,
    replaceExisting: false,
    inserts: writePlan.inserts.map((series) => ({ ...series, id: regenerateId(), profileId })),
    updates: writePlan.updates.map((series) => ({ ...series, profileId })),
  })
}
