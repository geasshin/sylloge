import { t } from './core.ts'
import { useLanguage } from './react.ts'

/** Un choix d’appareil, disponible avant même la création du premier profil. */
export function LanguageSelect() {
  const [language, setLanguage] = useLanguage()
  return <select
    className="mapping-select"
    aria-label={t('Langue de l’application')}
    value={language}
    onChange={event => {
      const value = event.target.value
      if (value === 'fr' || value === 'en') setLanguage(value)
    }}
  >
    <option value="fr" lang="fr">Français</option>
    <option value="en" lang="en">English</option>
  </select>
}
