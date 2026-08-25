import { useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'sylloge-theme'

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

/** Résout la préférence en thème effectif (system suit le système). */
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(preference: ThemePreference) {
  document.documentElement.dataset.theme = resolveTheme(preference)
}

/**
 * Thème de l'application (0.6.0) : suit le système par défaut,
 * forçable en clair ou sombre. La préférence persiste localement.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference)

  useEffect(() => {
    applyTheme(preference)
    localStorage.setItem(STORAGE_KEY, preference)
    if (preference !== 'system') return
    // En mode système, on suit les changements en direct.
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference])

  return { preference, setPreference }
}
