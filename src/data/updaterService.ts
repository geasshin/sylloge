import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

export type AvailableUpdate = {
  version: string
  notes: string | null
  downloadAndInstall: () => Promise<void>
}

type NativeUpdate = {
  version: string
  body?: string
  downloadAndInstall: () => Promise<void>
}

type UpdateChecker = () => Promise<NativeUpdate | null>
type AppRelauncher = () => Promise<void>

export class TauriUpdaterService {
  private readonly checkForUpdate: UpdateChecker
  private readonly relaunchApplication: AppRelauncher

  constructor(
    checkForUpdate: UpdateChecker = check,
    relaunchApplication: AppRelauncher = relaunch,
  ) {
    this.checkForUpdate = checkForUpdate
    this.relaunchApplication = relaunchApplication
  }

  async check(): Promise<AvailableUpdate | null> {
    const update = await this.checkForUpdate()
    if (!update) return null

    const notes = update.body?.trim()
    return {
      version: update.version,
      notes: notes || null,
      downloadAndInstall: update.downloadAndInstall.bind(update),
    }
  }

  async downloadAndInstall(update: AvailableUpdate): Promise<void> {
    await update.downloadAndInstall()
    await this.relaunchApplication()
  }
}

export function isMissingReleaseManifestError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Could not fetch a valid release JSON from the remote')
}

export const tauriUpdaterService = new TauriUpdaterService()
