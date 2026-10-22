import type { FilmLibrary } from './filmsRepository.ts'
import {
  clearBackupSettings,
  getBackupSettings,
  pickBackupDirectory,
  saveAutomaticBackupSnapshot,
  saveManualBackupSnapshot,
  type AutomaticBackupSnapshotResult,
  type BackupSettings,
  type BackupSnapshotResult,
} from './nativePortability.ts'
import { localToday } from '../domain/filmForm.ts'
import {
  createLibraryDocument,
  serializeLibraryDocument,
  SYLLOGE_LIBRARY_SECTIONS,
  type ExportableLibrary,
} from '../domain/libraryDocument.ts'
import { libraryRepository } from './libraryRepository.ts'

export type BackupNotice = {
  kind: 'success' | 'error'
  message: string
}

export type BackupNativeBridge = {
  getBackupSettings: (profileId: string) => Promise<BackupSettings | null>
  pickBackupDirectory: (profileId: string) => Promise<BackupSettings | null>
  clearBackupSettings: (profileId: string) => Promise<void>
  saveManualBackupSnapshot: (profileId: string, contents: string) => Promise<BackupSnapshotResult>
  saveAutomaticBackupSnapshot: (
    profileId: string,
    contents: string,
    automaticDay: string,
  ) => Promise<AutomaticBackupSnapshotResult>
}

const nativeBridge: BackupNativeBridge = {
  clearBackupSettings,
  getBackupSettings,
  pickBackupDirectory,
  saveManualBackupSnapshot,
  saveAutomaticBackupSnapshot,
}

type LibraryLoader = (profileId: string) => Promise<ExportableLibrary>

export class BackupService {
  private readonly native: BackupNativeBridge
  private readonly now: () => Date
  private readonly loadLibrary: LibraryLoader

  constructor(
    native: BackupNativeBridge = nativeBridge,
    now: () => Date = () => new Date(),
    loadLibrary: LibraryLoader = (profileId) => libraryRepository.loadLibrary(profileId),
  ) {
    this.native = native
    this.now = now
    this.loadLibrary = loadLibrary
  }

  getSettings(profileId: string): Promise<BackupSettings | null> {
    return this.native.getBackupSettings(profileId)
  }

  pickDirectory(profileId: string): Promise<BackupSettings | null> {
    return this.native.pickBackupDirectory(profileId)
  }

  clearSettings(profileId: string): Promise<void> {
    return this.native.clearBackupSettings(profileId)
  }

  async saveManualSnapshot(library: FilmLibrary): Promise<BackupNotice> {
    let worksCount: number | null = null

    try {
      const snapshot = await this.createSnapshot(library, this.now())
      worksCount = snapshot.worksCount
      const result = await this.native.saveManualBackupSnapshot(library.profile.id, snapshot.contents)
      return {
        kind: 'success',
        message: `Sauvegarde JSON enregistrée : ${result.fileName}. ${result.retainedSnapshotCount} copie${result.retainedSnapshotCount === 1 ? '' : 's'} conservée${result.retainedSnapshotCount === 1 ? '' : 's'} pour ce profil.`,
      }
    } catch (error) {
      console.error('Impossible de créer le snapshot JSON manuel.', error)
      return {
        kind: 'error',
        message: `La sauvegarde JSON manuelle a échoué. ${worksCount === 1 ? 'La donnée déjà enregistrée reste' : 'Les données déjà enregistrées restent'} dans SQLite.`,
      }
    }
  }

  async tryAutomaticSnapshot(library: FilmLibrary): Promise<BackupNotice | null> {
    let worksCount: number | null = null

    try {
      const now = this.now()
      const snapshot = await this.createSnapshot(library, now)
      worksCount = snapshot.worksCount
      const result = await this.native.saveAutomaticBackupSnapshot(
        library.profile.id,
        snapshot.contents,
        localToday(now),
      )
      if (result.outcome === 'saved') {
        return {
          kind: 'success',
          message: `Sauvegarde automatique JSON créée pour « ${library.profile.name} » : ${result.fileName}.`,
        }
      }
      return null
    } catch (error) {
      console.error('Impossible de créer le snapshot JSON automatique.', error)
      return {
        kind: 'error',
        message: `La sauvegarde automatique JSON a échoué. ${worksCount === 1 ? 'La donnée déjà enregistrée reste' : 'Les données déjà enregistrées restent'} dans SQLite.`,
      }
    }
  }

  /**
   * Snapshot au format sylloge-library v4 : les sept bibliothèques du profil
   * et ses bibliothèques personnalisées. Le chargeur historique à cinq listes
   * reste accepté par le sérialiseur.
   */
  private async createSnapshot(library: FilmLibrary, now: Date): Promise<{ contents: string; worksCount: number }> {
    const full = await this.loadLibrary(library.profile.id)
    const document = createLibraryDocument(full, now.toISOString())
    return {
      contents: serializeLibraryDocument(document),
      worksCount: SYLLOGE_LIBRARY_SECTIONS.reduce((total, section) => total + document[section].length, 0)
        + document.customLibraries.reduce((total, custom) => total + custom.entries.length, 0),
    }
  }
}

export const backupService = new BackupService()
