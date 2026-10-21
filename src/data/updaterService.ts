import { invoke } from '@tauri-apps/api/core'
import { relaunch } from '@tauri-apps/plugin-process'

export type AvailableUpdate = {
  version: string
  notes: string | null
}

type NativeUpdate = {
  version: string
  notes: string | null
}

type UpdateNativeBridge = {
  check: () => Promise<NativeUpdate | null>
  install: (version: string) => Promise<void>
}

const nativeBridge: UpdateNativeBridge = {
  check: () => invoke('check_for_app_update'),
  install: (version) => invoke('install_app_update', { version }),
}

export class TauriUpdaterService {
  private readonly native: UpdateNativeBridge
  private readonly relaunchApplication: () => Promise<void>

  constructor(
    native: UpdateNativeBridge = nativeBridge,
    relaunchApplication: () => Promise<void> = relaunch,
  ) {
    this.native = native
    this.relaunchApplication = relaunchApplication
  }

  check(): Promise<AvailableUpdate | null> {
    return this.native.check()
  }

  async downloadAndInstall(update: AvailableUpdate): Promise<void> {
    await this.native.install(update.version)
    await this.relaunchApplication()
  }
}

const UPDATER_ERROR_MESSAGES: Record<string, string> = {
  UPDATER_MANIFEST_MISSING: 'La dernière release ne contient pas latest.json. La publication de cette version est incomplète.',
  UPDATER_MANIFEST_INVALID: 'GitHub répond, mais Sylloge ne trouve pas de version exploitable dans latest.json. Le manifeste de la release doit être vérifié.',
  UPDATER_REQUEST_SETUP_FAILED: 'La requête de mise à jour n’a pas pu être préparée. Vérifiez la configuration du dépôt.',
  UPDATER_CHECK_FAILED: 'La vérification a échoué. Vérifiez la connexion puis réessayez.',
  UPDATER_INSTALL_FAILED: 'Le téléchargement ou l’installation a échoué. Votre version actuelle reste ouverte.',
  UPDATER_UPDATE_EXPIRED: 'Cette mise à jour n’est plus disponible. Recherchez-la de nouveau.',
  UPDATER_UPDATE_CHANGED: 'La release a changé depuis la vérification. Recherchez de nouveau les mises à jour.',
  UPDATER_STATE_UNAVAILABLE: 'L’état de la mise à jour est indisponible. Relancez Sylloge puis réessayez.',
}

export function updaterErrorMessage(error: unknown): string {
  const code = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : ''
  return UPDATER_ERROR_MESSAGES[code]
    ?? (code.startsWith('Impossible de ')
      ? code
      : 'La mise à jour a échoué. Vérifiez la connexion et réessayez.')
}

export const tauriUpdaterService = new TauriUpdaterService()
