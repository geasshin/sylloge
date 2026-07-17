import { invoke } from '@tauri-apps/api/core'
import type { SyllogeExportDocument } from '../domain/libraryTransfer.ts'

export type PickedJsonFile = {
  name: string
  contents: string
}

export type ImportLibraryResult = {
  profileId: string
  filmCount: number
}

type NativeImportProfile = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

type NativeImportFilm = Omit<SyllogeExportDocument['films'][number], 'id' | 'profileId'> & {
  id: string
  profileId: string
}

export type NativeImportPayload = {
  profile: NativeImportProfile
  films: NativeImportFilm[]
}

export function pickImportJson(): Promise<PickedJsonFile | null> {
  return invoke('pick_import_json')
}

export function saveExportJson(suggestedName: string, contents: string): Promise<string | null> {
  return invoke('save_export_json', { suggestedName, contents })
}

export function importLibraryAtomically(payload: NativeImportPayload): Promise<ImportLibraryResult> {
  return invoke('import_library_atomically', { payload })
}
