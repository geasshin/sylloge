import { t } from '../i18n/core.ts'
import { useLanguage } from '../i18n/react.ts'
import type { BackupNotice } from '../data/backupService.ts'
import type { FilmLibrary } from '../data/filmsRepository.ts'
import type { ProfileSummary } from '../data/profilesRepository.ts'
import type { AvailableUpdate } from '../data/updaterService.ts'
import type { ThemePreference } from '../domain/theme.ts'
import { ProfileAvatar } from './ProfileAvatar.tsx'
import { AboutSettings } from './settings/AboutSettings.tsx'
import { BackupSettings } from './settings/BackupSettings.tsx'
import { GeneralSettings } from './settings/GeneralSettings.tsx'
import { ProfilesSettings } from './settings/ProfilesSettings.tsx'
import { TransferSettings } from './settings/TransferSettings.tsx'

export type PortabilitySection = 'profiles' | 'backups' | 'transfer' | 'application' | 'about'

/** Ordre et libellés de la navigation des Paramètres. */
export const SETTINGS_SECTIONS: Array<{ id: PortabilitySection; label: string; description: string; profileScoped: boolean }> = [
  { id: 'profiles', label: 'Profils', description: 'Les personnes et leurs bibliothèques sur ce Mac.', profileScoped: false },
  { id: 'backups', label: 'Sauvegarde', description: 'Copies automatiques du profil, restauration et changement d’ordinateur.', profileScoped: true },
  { id: 'transfer', label: 'Importer et exporter', description: 'Reprendre des données d’un autre service ou les emporter, bibliothèque par bibliothèque.', profileScoped: true },
  { id: 'application', label: 'Général', description: 'Apparence, accueil et mises à jour.', profileScoped: false },
  { id: 'about', label: 'À propos', description: 'Version, licence, données et sources.', profileScoped: false },
]

type PortabilityProps = {
  section: PortabilitySection
  library: FilmLibrary
  profiles: ProfileSummary[]
  themePreference: ThemePreference
  onThemePreferenceChange: (preference: ThemePreference) => void
  onSwitchProfile: (profileId: string) => Promise<void>
  onImported: (library: FilmLibrary) => void
  onBackupNotice: (notice: BackupNotice) => void
  availableUpdate: AvailableUpdate | null
  lastCheckedAt: Date | null
  onUpdateAvailable: (update: AvailableUpdate) => void
  onUpdateHandled: () => void
  onProfilesChanged: () => void
  onProfileDeleted: (deletedProfileId: string) => void
  onLibraryChanged: () => void
  onSectionChange?: (section: PortabilitySection) => void
}

export function Portability({
  section,
  library,
  profiles,
  themePreference,
  onThemePreferenceChange,
  onSwitchProfile,
  onImported,
  onBackupNotice,
  availableUpdate,
  lastCheckedAt,
  onUpdateAvailable,
  onUpdateHandled,
  onProfilesChanged,
  onProfileDeleted,
  onLibraryChanged,
  onSectionChange,
}: PortabilityProps) {
  useLanguage()
  const page = SETTINGS_SECTIONS.find((entry) => entry.id === section) ?? SETTINGS_SECTIONS[0]
  const activeProfile = profiles.find((profile) => profile.id === library.profile.id)

  return (
    <main className="main portability-main">
      <header className="settings-hero">
        <div className="settings-hero-copy">
          <h1 className="display-title">{t(page.label)}</h1>
          <p>{t(page.description)}</p>
        </div>
        {page.profileScoped && (
          <div className="settings-active-profile" aria-label={t('Profil concerné')}>
            <ProfileAvatar name={library.profile.name} avatarDataUrl={activeProfile?.avatarDataUrl ?? null} className="settings-avatar" />
            <span><small>{t('Profil')}</small><b>{library.profile.name}</b></span>
          </div>
        )}
      </header>

      <div className="settings-page">
        {section === 'profiles' && (
          <ProfilesSettings
            library={library}
            profiles={profiles}
            onSwitchProfile={onSwitchProfile}
            onProfilesChanged={onProfilesChanged}
            onProfileDeleted={onProfileDeleted}
          />
        )}
        {section === 'backups' && (
          <BackupSettings
            library={library}
            onRestored={(restored) => {
              onProfilesChanged()
              onImported({ profile: restored.profile, films: restored.films })
            }}
          />
        )}
        {section === 'transfer' && (
          <TransferSettings
            library={library}
            onLibraryChanged={onLibraryChanged}
            onOpenBackups={onSectionChange ? () => onSectionChange('backups') : undefined}
          />
        )}
        {section === 'application' && (
          <GeneralSettings
            themePreference={themePreference}
            onThemePreferenceChange={onThemePreferenceChange}
            availableUpdate={availableUpdate}
            lastCheckedAt={lastCheckedAt}
            onUpdateAvailable={onUpdateAvailable}
            onUpdateHandled={onUpdateHandled}
          />
        )}
        {section === 'about' && <AboutSettings />}
      </div>
    </main>
  )
}
