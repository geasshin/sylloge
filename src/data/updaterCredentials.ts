import { invoke } from '@tauri-apps/api/core'

export type PrivateUpdaterCredentialStatus = {
  supported: boolean
  configured: boolean
}

type UpdaterCredentialNativeBridge = {
  getStatus: () => Promise<PrivateUpdaterCredentialStatus>
  setToken: (token: string) => Promise<PrivateUpdaterCredentialStatus>
  removeToken: () => Promise<PrivateUpdaterCredentialStatus>
}

const nativeBridge: UpdaterCredentialNativeBridge = {
  getStatus: () => invoke('get_private_updater_credential_status'),
  setToken: (token) => invoke('set_private_updater_token', { token }),
  removeToken: () => invoke('remove_private_updater_token'),
}

export class UpdaterCredentialService {
  private readonly native: UpdaterCredentialNativeBridge

  constructor(native: UpdaterCredentialNativeBridge = nativeBridge) {
    this.native = native
  }

  getStatus(): Promise<PrivateUpdaterCredentialStatus> {
    return this.native.getStatus()
  }

  save(token: string): Promise<PrivateUpdaterCredentialStatus> {
    return this.native.setToken(token)
  }

  remove(): Promise<PrivateUpdaterCredentialStatus> {
    return this.native.removeToken()
  }
}

export const updaterCredentialService = new UpdaterCredentialService()
