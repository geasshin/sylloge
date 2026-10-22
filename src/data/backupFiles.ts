import { invoke } from '@tauri-apps/api/core'

// Copie enregistrée pour un profil, de la plus récente à la plus ancienne.
// `available` : fichier ordinaire présent dans le dossier configuré.
export type BackupSnapshotEntry = {
  fileName: string
  createdAt: string
  available: boolean
}

// Copie Sylloge trouvée sur le Mac, déjà lue (UTF-8, bornée).
export type FoundBackup = {
  fileName: string
  // Libellé lisible, par exemple « iCloud Drive › Sylloge ».
  location: string
  // Millisecondes depuis l’époque Unix.
  modifiedAt: number
  contents: string
}

export type FoundBackups = {
  candidates: FoundBackup[]
  // Emplacements présents mais illisibles (permission refusée).
  unreadableLocations: string[]
}

// Liste le registre du profil sans rien modifier ; vide sans dossier configuré.
export function listBackupSnapshots(profileId: string): Promise<BackupSnapshotEntry[]> {
  return invoke('list_backup_snapshots', { profileId })
}

// Lit une copie enregistrée et possédée par le profil, sans écriture.
export function readBackupSnapshot(profileId: string, fileName: string): Promise<string> {
  return invoke('read_backup_snapshot', { profileId, fileName })
}

// Recherche bornée dans iCloud Drive, les services de stockage, Documents,
// Bureau et Téléchargements ; utilisable avant la création d’un profil.
export function findBackupCandidates(): Promise<FoundBackups> {
  return invoke('find_backup_candidates')
}
