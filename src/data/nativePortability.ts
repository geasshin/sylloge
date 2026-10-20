import { invoke } from '@tauri-apps/api/core'
import type { SyllogeLibraryDocument } from '../domain/libraryDocument.ts'
import type { SyllogeExportDocument } from '../domain/libraryTransfer.ts'

export type PickedJsonFile = {
  name: string
  contents: string
}

export type PickedFilmsImportFile = {
  name: string
  kind: 'csv' | 'notion' | 'container'
  csvCandidates: Array<{
    id: string
    name: string
    contents: string
  }>
  markdownPages: Array<{
    name: string
    contents: string
  }>
}

export type ImportContainerCandidate = {
  id: string
  name: string
  kind: 'json' | 'csv'
  contents: string
}

export type PickedAnyImportFile =
  | {
      name: string
      kind: 'json'
      contents: string
      csvCandidates: []
      markdownPages: []
      containerCandidates: []
    }
  | {
      name: string
      kind: 'csv' | 'notion'
      contents: null
      csvCandidates: PickedFilmsImportFile['csvCandidates']
      markdownPages: PickedFilmsImportFile['markdownPages']
      containerCandidates: []
    }
  | {
      name: string
      kind: 'container'
      contents: null
      csvCandidates: []
      markdownPages: PickedFilmsImportFile['markdownPages']
      containerCandidates: ImportContainerCandidate[]
    }

export type ImportLibraryResult = {
  profileId: string
  filmCount: number
}

export type BackupSettings = {
  backupDirectory: string
  lastAutomaticSnapshotDay: string | null
  directoryAvailable: boolean
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

export type NativeImportLibraryDocumentPayload = {
  profile: NativeImportProfile
  films: SyllogeLibraryDocument['films']
  series: SyllogeLibraryDocument['series']
  anime: SyllogeLibraryDocument['anime']
  books: SyllogeLibraryDocument['books']
  mangas: SyllogeLibraryDocument['mangas']
  games: SyllogeLibraryDocument['games']
  artworks: SyllogeLibraryDocument['artworks']
}

export type ImportLibraryDocumentResult = {
  profileId: string
  filmCount: number
  seriesCount: number
  animeCount: number
  bookCount: number
  mangaCount: number
  gameCount: number
  artworkCount: number
}

export function pickImportJson(): Promise<PickedJsonFile | null> {
  return invoke('pick_import_json')
}

export function pickImportAny(): Promise<PickedAnyImportFile | null> {
  return invoke('pick_import_any')
}

export function pickImportContainer(): Promise<PickedAnyImportFile | null> {
  return invoke('pick_import_container')
}

export function pickImportFilmsCsvOrNotion(): Promise<PickedFilmsImportFile | null> {
  return invoke('pick_import_films_csv_or_notion')
}

export function saveExportJson(suggestedName: string, contents: string): Promise<string | null> {
  return invoke('save_export_json', { suggestedName, contents })
}

export function saveExportCsv(suggestedName: string, contents: string): Promise<string | null> {
  return invoke('save_export_csv', { suggestedName, contents })
}

export function getBackupSettings(profileId: string): Promise<BackupSettings | null> {
  return invoke('get_backup_settings', { profileId })
}

export function pickBackupDirectory(profileId: string): Promise<BackupSettings | null> {
  return invoke('pick_backup_directory', { profileId })
}

export function clearBackupSettings(profileId: string): Promise<void> {
  return invoke('clear_backup_settings', { profileId })
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

export function importLibraryDocumentAtomically(
  payload: NativeImportLibraryDocumentPayload,
): Promise<ImportLibraryDocumentResult> {
  return invoke('import_library_document_atomically', { payload })
}

export function importLibraryDocumentIntoEmptyProfile(
  payload: NativeImportLibraryDocumentPayload,
): Promise<ImportLibraryDocumentResult> {
  return invoke('import_library_document_into_empty_profile', { payload })
}

// ---------------------------------------------------------------------------
// Jalon 0.4.4 — profils et imports unitaires dans le profil courant
// ---------------------------------------------------------------------------

export type ProfileSummary = {
  id: string
  name: string
  avatarDataUrl: string | null
  createdAt: string
  updatedAt: string
  filmCount: number
  seriesCount: number
  bookCount: number
  gameCount: number
  artworkCount: number
}

export type CollectionImportPlan<F> = {
  profileId: string
  replaceExisting: boolean
  inserts: F[]
  updates: F[]
}

export type CollectionImportResult = {
  inserted: number
  updated: number
  removed: number
}

export function listProfiles(): Promise<ProfileSummary[]> {
  return invoke('list_profiles')
}

export type CreateProfileInput = {
  id: string
  name: string
  avatarDataUrl: string | null
  selectAfterCreation: boolean
}

export type UpdateProfileInput = {
  profileId: string
  name: string
  avatarDataUrl: string | null
}

export function createProfile(input: CreateProfileInput): Promise<void> {
  return invoke('create_profile', { input })
}

export function updateProfile(input: UpdateProfileInput): Promise<void> {
  return invoke('update_profile', { input })
}

export function renameProfile(input: { profileId: string; name: string }): Promise<void> {
  return invoke('rename_profile', { input })
}

export function deleteProfile(profileId: string): Promise<void> {
  return invoke('delete_profile', { profileId })
}

export function selectProfile(profileId: string): Promise<void> {
  return invoke('select_profile', { profileId })
}

export function importFilmsIntoProfile(
  plan: CollectionImportPlan<SyllogeLibraryDocument['films'][number]>,
): Promise<CollectionImportResult> {
  return invoke('import_films_into_profile', { plan })
}

export function importSeriesIntoProfile(
  plan: CollectionImportPlan<SyllogeLibraryDocument['series'][number]>,
): Promise<CollectionImportResult> {
  return invoke('import_series_into_profile', { plan })
}

export function importAnimeIntoProfile(
  plan: CollectionImportPlan<SyllogeLibraryDocument['anime'][number]>,
): Promise<CollectionImportResult> {
  return invoke('import_anime_into_profile', { plan })
}

export function importMangasIntoProfile(
  plan: CollectionImportPlan<SyllogeLibraryDocument['mangas'][number]>,
): Promise<CollectionImportResult> {
  return invoke('import_mangas_into_profile', { plan })
}

export function importBooksIntoProfile(
  plan: CollectionImportPlan<SyllogeLibraryDocument['books'][number]>,
): Promise<CollectionImportResult> {
  return invoke('import_books_into_profile', { plan })
}

export function importGamesIntoProfile(
  plan: CollectionImportPlan<SyllogeLibraryDocument['games'][number]>,
): Promise<CollectionImportResult> {
  return invoke('import_games_into_profile', { plan })
}

export function importArtworksIntoProfile(
  plan: CollectionImportPlan<SyllogeLibraryDocument['artworks'][number]>,
): Promise<CollectionImportResult> {
  return invoke('import_artworks_into_profile', { plan })
}
