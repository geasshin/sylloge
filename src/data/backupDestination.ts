import { invoke } from '@tauri-apps/api/core'
import { getLanguage } from '../i18n/core.ts'
import type { BackupSettings } from './nativePortability.ts'

// Vérifie une destination avant la création du profil, sans la configurer.
export function pickBackupDestination(): Promise<BackupSettings | null> {
  return invoke('pick_backup_destination', { language: getLanguage() })
}

// À appeler seulement après confirmation du parcours et création du profil.
export function configureBackupDestination(
  profileId: string,
  backupDirectory: string,
): Promise<BackupSettings> {
  return invoke('configure_backup_destination', { profileId, backupDirectory })
}
