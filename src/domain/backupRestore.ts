import { validateLibraryDocument, type SyllogeLibraryDocument } from './libraryDocument.ts'
import { CUSTOM_LIBRARY_TEMPLATES, type CustomLibrary } from './customLibraries.ts'

export const PROFILE_LIBRARIES = ['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks'] as const
export type ProfileLibrary = typeof PROFILE_LIBRARIES[number]
export const PROFILE_LIBRARY_LABELS: Record<ProfileLibrary, string> = {
  films: 'Films', series: 'Séries', anime: 'Animation japonaise', books: 'Livres', mangas: 'Mangas', games: 'Jeux', artworks: 'Art',
}
export type ProfileSections = Pick<SyllogeLibraryDocument, ProfileLibrary>
export type PreparedBackup = { fileName: string; document: SyllogeLibraryDocument; location?: string }
export type PreparedCollection = { library: ProfileLibrary; fileName: string; items: ProfileSections[ProfileLibrary] }

/** Fiches d'un profil : sept bibliothèques de base et bibliothèques personnalisées. */
export function profileWorkCount(sections: Record<ProfileLibrary, readonly unknown[]> & { customLibraries?: readonly CustomLibrary[] }): number {
  return PROFILE_LIBRARIES.reduce((sum, library) => sum + sections[library].length, 0)
    + (sections.customLibraries ?? []).reduce((sum, library) => sum + library.entries.length, 0)
}

/** Lignes de résumé des bibliothèques personnalisées d'une sauvegarde. */
export function customLibrarySummary(document: { customLibraries?: readonly CustomLibrary[] }): Array<{ key: string; label: string; count: number }> {
  return (document.customLibraries ?? []).map((library) => ({
    key: library.libraryId,
    label: CUSTOM_LIBRARY_TEMPLATES[library.libraryId].label,
    count: library.entries.length,
  }))
}

/** Validate every candidate. Source filenames do not establish date or validity. */
export function catalogBackupFiles(files: Array<{ name: string; contents: string; location?: string }>): {
  valid: PreparedBackup[]
  invalid: Array<{ fileName: string; message: string }>
} {
  const valid: PreparedBackup[] = []
  const invalid: Array<{ fileName: string; message: string }> = []
  for (const file of files) {
    const preview = validateLibraryDocument(file.contents)
    if (preview.document === null || preview.errors.length > 0) {
      invalid.push({ fileName: file.name, message: preview.errors[0]?.message ?? 'Sauvegarde Sylloge invalide.' })
    } else valid.push(file.location ? { fileName: file.name, document: preview.document, location: file.location } : { fileName: file.name, document: preview.document })
  }
  valid.sort((left, right) => right.document.exportedAt.localeCompare(left.document.exportedAt) || left.fileName.localeCompare(right.fileName))
  return { valid, invalid }
}

/** Conservation des copies automatiques et manuelles (moteur natif). */
export const BACKUP_RETENTION = { recent: 3, weekly: 4, monthly: 6 } as const
export const BACKUP_RETENTION_SUMMARY = `${BACKUP_RETENTION.recent} copies récentes, puis une par semaine sur ${BACKUP_RETENTION.weekly} semaines et une par mois sur ${BACKUP_RETENTION.monthly} mois`

export function emptyProfileSections(): ProfileSections {
  return { films: [], series: [], anime: [], books: [], mangas: [], games: [], artworks: [] }
}

/** A staged import does not write and only replaces its own staged section. */
export function withPreparedCollection(sections: ProfileSections, prepared: PreparedCollection): ProfileSections {
  // Each items array has already been validated by the existing library parser.
  return { ...sections, [prepared.library]: prepared.items }
}
