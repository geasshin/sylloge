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

type LibraryLoader = (profileId: string) => Promise<{
  profile: FilmLibrary['profile']
  films: FilmLibrary['films']
  series: import('../domain/series.ts').Series[]
  books: import('../domain/book.ts').Book[]
  games: import('../domain/game.ts').Game[]
  artworks: import('../domain/artwork.ts').Artwork[]
}>

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
    const now = this.now()
    const { contents, worksCount } = await this.createSnapshot(library, now)

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
        message: `La sauvegarde JSON manuelle a échoué. Les ${worksCount === 1 ? 'donnée déjà enregistrée reste' : 'données déjà enregistrées restent'} dans SQLite.`,
      }
    }
  }

  async tryAutomaticSnapshot(library: FilmLibrary): Promise<BackupNotice | null> {
    const now = this.now()
    const { contents, worksCount } = await this.createSnapshot(library, now)

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
        message: `La sauvegarde automatique JSON a échoué. Les ${worksCount === 1 ? 'donnée déjà enregistrée reste' : 'données déjà enregistrées restent'} dans SQLite.`,
      }
    }
  }

  /**
   * Snapshot au format sylloge-library v2 : les cinq collections du profil,
   * pour une restauration fidèle (jalon 0.4.4).
   */
  private async createSnapshot(library: FilmLibrary, now: Date): Promise<{ contents: string; worksCount: number }> {
    const full = await this.loadLibrary(library.profile.id)
    const document = createLibraryDocument(full, now.toISOString())
    return {
      contents: serializeLibraryDocument(document),
      worksCount:
        document.films.length
        + document.series.length
        + document.books.length
        + document.games.length
        + document.artworks.length,
    }
  }
}

export const backupService = new BackupService()
