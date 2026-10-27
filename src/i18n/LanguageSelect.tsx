import { useId } from 'react'
import { t } from './core.ts'
import { useLanguage } from './react.ts'
import { Select } from '../components/Select.tsx'

/**
 * Un choix d’appareil, disponible avant même la création du premier profil.
 * Liste déroulante Sylloge (27 octobre 2026), comme toutes les autres :
 * chaque langue reste écrite dans sa propre langue.
 */
export function LanguageSelect() {
  const [language, setLanguage] = useLanguage()
  const id = useId()
  return <Select
    id={`language-${id}`}
    className="language-select"
    ariaLabel={t('Langue de l’application')}
    value={language}
    options={[
      { value: 'fr', label: 'Français', lang: 'fr' },
      { value: 'en', label: 'English', lang: 'en' },
    ]}
    onChange={value => {
      if (value === 'fr' || value === 'en') setLanguage(value)
    }}
  />
}
