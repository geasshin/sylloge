import type { ThemePreference } from '../../domain/theme.ts'
import { useHomeAutoplay } from '../../domain/preferences.ts'
import type { AvailableUpdate } from '../../data/updaterService.ts'
import { UpdaterSettings } from '../UpdaterSettings.tsx'
import { SettingsGroup, SettingsRow } from './SettingsLayout.tsx'

const THEME_OPTIONS: Array<[ThemePreference, string, string]> = [
  ['system', 'Système', 'Suit le réglage du Mac'],
  ['light', 'Clair', 'Interface claire'],
  ['dark', 'Sombre', 'Interface sombre'],
]

type Props = {
  themePreference: ThemePreference
  onThemePreferenceChange: (preference: ThemePreference) => void
  availableUpdate: AvailableUpdate | null
  onUpdateAvailable: (update: AvailableUpdate) => void
  onUpdateHandled: () => void
}

export function GeneralSettings({ themePreference, onThemePreferenceChange, availableUpdate, onUpdateAvailable, onUpdateHandled }: Props) {
  const [autoplay, setAutoplay] = useHomeAutoplay()
  return (
    <>
      <SettingsGroup id="appearance-title" title="Apparence" description="S’applique à tous les profils de ce Mac.">
        <div className="settings-row settings-row-stacked">
          <div className="settings-row-copy"><b>Thème</b></div>
          <div className="theme-picker" role="radiogroup" aria-label="Thème de l’application">
            {THEME_OPTIONS.map(([value, label, description]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={themePreference === value}
                className={`theme-option ${themePreference === value ? 'selected' : ''}`}
                onClick={() => onThemePreferenceChange(value)}
              >
                <b>{label}</b>
                <small>{description}</small>
              </button>
            ))}
          </div>
        </div>
        <SettingsRow label="Défilement automatique de « À la une »" detail="Change d’œuvre toutes les huit secondes sur l’accueil. Désactivé, la une reste sur la même œuvre ; les flèches restent disponibles.">
          <label className="settings-switch">
            <input type="checkbox" role="switch" checked={autoplay} onChange={(event) => setAutoplay(event.target.checked)} />
            <span className="visually-hidden">Défilement automatique de « À la une »</span>
          </label>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup id="updates-title" title="Mises à jour" description="Sylloge installe uniquement les versions publiées et signées de l’application.">
        <UpdaterSettings availableUpdate={availableUpdate} onUpdateAvailable={onUpdateAvailable} onUpdateHandled={onUpdateHandled} />
      </SettingsGroup>
    </>
  )
}
