import {
  createProfile,
  deleteProfile,
  listProfiles,
  renameProfile,
  selectProfile,
  updateProfile,
  type ProfileSummary,
} from './nativePortability.ts'

export type { ProfileSummary }

/**
 * Couche d'accès aux profils locaux (jalon 0.4.4). Un profil est une
 * identité pure : il regroupe les cinq collections d'une même base SQLite.
 */
export class ProfilesRepository {
  list(): Promise<ProfileSummary[]> {
    return listProfiles()
  }

  async create(
    name: string,
    options: { avatarDataUrl?: string | null; selectAfterCreation?: boolean } = {},
  ): Promise<string> {
    const id = crypto.randomUUID()
    await createProfile({
      id,
      name,
      avatarDataUrl: options.avatarDataUrl ?? null,
      selectAfterCreation: options.selectAfterCreation ?? false,
    })
    return id
  }

  rename(profileId: string, name: string): Promise<void> {
    return renameProfile({ profileId, name })
  }

  update(profileId: string, name: string, avatarDataUrl: string | null): Promise<void> {
    return updateProfile({ profileId, name, avatarDataUrl })
  }

  delete(profileId: string): Promise<void> {
    return deleteProfile(profileId)
  }

  open(profileId: string): Promise<void> {
    return selectProfile(profileId)
  }
}

export const profilesRepository = new ProfilesRepository()
