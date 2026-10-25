import { invoke } from '@tauri-apps/api/core'

/** Ouvre le dossier de la base et des sauvegardes dans le gestionnaire de fichiers. */
export function openDataFolder(): Promise<void> {
  return invoke('open_data_folder')
}
