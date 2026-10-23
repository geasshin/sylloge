import { t } from '../../i18n/core.ts'
import { useLanguage } from '../../i18n/react.ts'
import { LanguageSelect } from '../../i18n/LanguageSelect.tsx'
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
  useLanguage()
  const [autoplay, setAutoplay] = useHomeAutoplay()
  return (
    <>
      <SettingsGroup id="language-title" title={t('Langue')} description={t('Mémorisée sur cet appareil, pour tous les profils.')}>
        <SettingsRow label={t('Langue de l’application')}><LanguageSelect /></SettingsRow>
      </SettingsGroup>
      <SettingsGroup id="appearance-title" title={t('Apparence')} description={t('S’applique à tous les profils de ce Mac.')}>
        <div className="settings-row settings-row-stacked">
          <div className="settings-row-copy"><b>{t('Thème')}</b></div>
          <div className="theme-picker" role="radiogroup" aria-label={t('Thème de l’application')}>
            {THEME_OPTIONS.map(([value, label, description]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={themePreference === value}
                className={`theme-option ${themePreference === value ? 'selected' : ''}`}
                onClick={() => onThemePreferenceChange(value)}
              >
                <b>{t(label)}</b>
                <small>{t(description)}</small>
              </button>
            ))}
          </div>
        </div>
        <SettingsRow label={t('Défilement automatique de « À la une »')} detail={t('Change d’œuvre toutes les huit secondes sur l’accueil. Désactivé, la une reste sur la même œuvre ; les flèches restent disponibles.')}>
          <label className="settings-switch">
            <input type="checkbox" role="switch" checked={autoplay} onChange={(event) => setAutoplay(event.target.checked)} />
            <span className="visually-hidden">{t('Défilement automatique de « À la une »')}</span>
          </label>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup id="updates-title" title={t('Mises à jour')} description={t('Sylloge installe uniquement les versions publiées et signées de l’application.')}>
        <UpdaterSettings availableUpdate={availableUpdate} onUpdateAvailable={onUpdateAvailable} onUpdateHandled={onUpdateHandled} />
      </SettingsGroup>
    </>
  )
}
