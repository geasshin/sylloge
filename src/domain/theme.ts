import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

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

/**
 * Thème à demander à la fenêtre native : « system » rend la main au système (null), sinon le thème choisi.
 * La barre de titre appartient au système : sans cela elle suit le thème de macOS ou de Windows, pas celui de l'app.
 */
export function nativeWindowTheme(preference: ThemePreference): 'light' | 'dark' | null {
  return preference === 'system' ? null : preference
}

/** Aligne la barre de titre sur le thème choisi. Hors application native (navigateur), il n'y a rien à faire ; un échec ne bloque jamais l'interface. */
async function applyWindowTheme(preference: ThemePreference) {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
  try {
    await getCurrentWindow().setTheme(nativeWindowTheme(preference))
  } catch (error) {
    console.warn('Impossible de changer le thème de la fenêtre.', error)
  }
}

function applyTheme(preference: ThemePreference) {
  document.documentElement.dataset.theme = resolveTheme(preference)
  void applyWindowTheme(preference)
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
