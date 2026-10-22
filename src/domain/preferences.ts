import { useEffect, useState } from 'react'

/**
 * Préférences d’interface propres à cet appareil (stockage local, comme le
 * thème). Elles ne font pas partie des données de profil exportées.
 */
const HOME_AUTOPLAY_KEY = 'sylloge-home-autoplay'
const CHANGE_EVENT = 'sylloge-preferences-change'

function readHomeAutoplay(): boolean {
  try {
    return localStorage.getItem(HOME_AUTOPLAY_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setHomeAutoplay(enabled: boolean): void {
  try {
    localStorage.setItem(HOME_AUTOPLAY_KEY, enabled ? 'on' : 'off')
  } catch {
    // Stockage indisponible : la préférence reste celle de la session.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Défilement automatique de « À la une » (activé par défaut). */
export function useHomeAutoplay(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(readHomeAutoplay)
  useEffect(() => {
    const sync = () => setEnabled(readHomeAutoplay())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return [enabled, setHomeAutoplay]
}
