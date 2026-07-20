import {
  createProfile,
  deleteProfile,
  listProfiles,
  renameProfile,
  selectProfile,
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

  create(name: string): Promise<void> {
    return createProfile({ id: crypto.randomUUID(), name })
  }

  rename(profileId: string, name: string): Promise<void> {
    return renameProfile({ profileId, name })
  }

  delete(profileId: string): Promise<void> {
    return deleteProfile(profileId)
  }

  open(profileId: string): Promise<void> {
    return selectProfile(profileId)
  }
}

export const profilesRepository = new ProfilesRepository()
