import type { FilmLibrary } from './filmsRepository.ts'
import {
  getBackupSettings,
  pickBackupDirectory,
  saveAutomaticBackupSnapshot,
  saveManualBackupSnapshot,
  type AutomaticBackupSnapshotResult,
  type BackupSettings,
  type BackupSnapshotResult,
} from './nativePortability.ts'
import { localToday } from '../domain/filmForm.ts'
import { createLibraryExport, serializeLibraryExport } from '../domain/libraryTransfer.ts'

export type BackupNotice = {
  kind: 'success' | 'error'
  message: string
}

export type BackupNativeBridge = {
  getBackupSettings: (profileId: string) => Promise<BackupSettings | null>
  pickBackupDirectory: (profileId: string) => Promise<BackupSettings | null>
  saveManualBackupSnapshot: (profileId: string, contents: string) => Promise<BackupSnapshotResult>
  saveAutomaticBackupSnapshot: (
    profileId: string,
    contents: string,
    automaticDay: string,
  ) => Promise<AutomaticBackupSnapshotResult>
}

const nativeBridge: BackupNativeBridge = {
  getBackupSettings,
  pickBackupDirectory,
  saveManualBackupSnapshot,
  saveAutomaticBackupSnapshot,
}

export class BackupService {
  private readonly native: BackupNativeBridge
  private readonly now: () => Date

  constructor(native: BackupNativeBridge = nativeBridge, now: () => Date = () => new Date()) {
    this.native = native
    this.now = now
  }

  getSettings(profileId: string): Promise<BackupSettings | null> {
    return this.native.getBackupSettings(profileId)
  }

  pickDirectory(profileId: string): Promise<BackupSettings | null> {
    return this.native.pickBackupDirectory(profileId)
  }

  async saveManualSnapshot(library: FilmLibrary): Promise<BackupNotice> {
    const now = this.now()
    const { contents, filmCount } = this.createSnapshot(library, now)

    try {
      const result = await this.native.saveManualBackupSnapshot(library.profile.id, contents)
      return {
        kind: 'success',
        message: `Snapshot JSON enregistré : ${result.fileName}. ${result.retainedSnapshotCount} snapshot${result.retainedSnapshotCount === 1 ? '' : 's'} conservé${result.retainedSnapshotCount === 1 ? '' : 's'} pour ce profil.`,
      }
    } catch (error) {
      console.error('Impossible de créer le snapshot JSON manuel.', error)
      return {
        kind: 'error',
        message: `La sauvegarde JSON manuelle a échoué. Les ${filmCount === 1 ? 'donnée déjà enregistrée reste' : 'données déjà enregistrées restent'} dans SQLite.`,
      }
    }
  }

  async tryAutomaticSnapshot(library: FilmLibrary): Promise<BackupNotice | null> {
    const now = this.now()
    const { contents, filmCount } = this.createSnapshot(library, now)

    try {
      const result = await this.native.saveAutomaticBackupSnapshot(
        library.profile.id,
        contents,
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
        message: `La sauvegarde automatique JSON a échoué. Les ${filmCount === 1 ? 'donnée déjà enregistrée reste' : 'données déjà enregistrées restent'} dans SQLite.`,
      }
    }
  }

  private createSnapshot(library: FilmLibrary, now: Date): { contents: string; filmCount: number } {
    const document = createLibraryExport(library, now.toISOString())
    return {
      contents: serializeLibraryExport(document),
      filmCount: document.films.length,
    }
  }
}

export const backupService = new BackupService()
