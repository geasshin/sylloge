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

export type BackupSettings = {
  backupDirectory: string
  lastAutomaticSnapshotDay: string | null
}

export type BackupSnapshotResult = {
  fileName: string
  retainedSnapshotCount: number
}

export type AutomaticBackupSnapshotResult = {
  outcome: 'saved' | 'alreadySaved' | 'notConfigured'
  fileName: string | null
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

export function getBackupSettings(profileId: string): Promise<BackupSettings | null> {
  return invoke('get_backup_settings', { profileId })
}

export function pickBackupDirectory(profileId: string): Promise<BackupSettings | null> {
  return invoke('pick_backup_directory', { profileId })
}

export function saveManualBackupSnapshot(profileId: string, contents: string): Promise<BackupSnapshotResult> {
  return invoke('save_manual_backup_snapshot', { profileId, contents })
}

export function saveAutomaticBackupSnapshot(
  profileId: string,
  contents: string,
  automaticDay: string,
): Promise<AutomaticBackupSnapshotResult> {
  return invoke('save_automatic_backup_snapshot', { profileId, contents, automaticDay })
}

export function importLibraryAtomically(payload: NativeImportPayload): Promise<ImportLibraryResult> {
  return invoke('import_library_atomically', { payload })
}
