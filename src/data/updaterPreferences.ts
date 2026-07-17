import { invoke } from '@tauri-apps/api/core'

export type UpdaterPreferences = {
  automaticChecksEnabled: boolean
  ignoredVersion: string | null
  updatedAt: string
}

export type UpdaterPreferencesNativeBridge = {
  get: () => Promise<UpdaterPreferences>
  setAutomaticChecksEnabled: (automaticChecksEnabled: boolean) => Promise<UpdaterPreferences>
  setIgnoredVersion: (ignoredVersion: string | null) => Promise<UpdaterPreferences>
}

const nativeBridge: UpdaterPreferencesNativeBridge = {
  get: () => invoke('get_updater_preferences'),
  setAutomaticChecksEnabled: (automaticChecksEnabled) => invoke('set_updater_automatic_checks_enabled', { automaticChecksEnabled }),
  setIgnoredVersion: (ignoredVersion) => invoke('set_ignored_updater_version', { ignoredVersion }),
}

export class UpdaterPreferencesService {
  private readonly native: UpdaterPreferencesNativeBridge

  constructor(native: UpdaterPreferencesNativeBridge = nativeBridge) {
    this.native = native
  }

  get(): Promise<UpdaterPreferences> {
    return this.native.get()
  }

  setAutomaticChecksEnabled(automaticChecksEnabled: boolean): Promise<UpdaterPreferences> {
    return this.native.setAutomaticChecksEnabled(automaticChecksEnabled)
  }

  ignoreVersion(version: string): Promise<UpdaterPreferences> {
    return this.native.setIgnoredVersion(version)
  }

  restoreIgnoredVersion(): Promise<UpdaterPreferences> {
    return this.native.setIgnoredVersion(null)
  }
}

export const updaterPreferencesService = new UpdaterPreferencesService()
