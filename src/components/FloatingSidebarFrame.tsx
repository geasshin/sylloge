import { useEffect, useRef, useState, type ReactNode } from 'react'

const PINNED_KEY = 'sylloge-sidebar-pinned'

/** Préférence d'appareil, indépendante des profils et de leurs sauvegardes. */
export function readSidebarPinned(): boolean {
  try {
    return localStorage.getItem(PINNED_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveSidebarPinned(pinned: boolean): void {
  try {
    localStorage.setItem(PINNED_KEY, String(pinned))
  } catch {
    // Stockage indisponible : le choix reste valable pour la session.
  }
}

/**
 * Îlot : le rail réserve sa place ; son ouverture temporaire recouvre la page.
 * Épingler réserve la largeur complète. Les paramètres gardent leur navigation.
 * Les délais évitent une ouverture au simple passage de la souris.
 */
export function FloatingSidebarFrame({ pinned, settings, children }: {
  pinned: boolean
  settings: boolean
  children: ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  const [keyboardWithin, setKeyboardWithin] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }
  const schedule = (value: boolean, delay: number) => {
    clearTimer()
    timer.current = setTimeout(() => { setHovered(value); timer.current = null }, delay)
  }
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current)
  }, [])

  if (settings) return <aside className="sidebar sidebar-settings sidebar-expanded">{children}</aside>

  const open = pinned || hovered || keyboardWithin
  return (
    <aside className={`sidebar sidebar-island ${pinned ? 'sidebar-pinned' : 'sidebar-unpinned'} ${open ? 'sidebar-expanded' : 'sidebar-rail'}`}>
      <div
        className="sidebar-surface"
        onPointerEnter={(event) => { if (event.pointerType !== 'touch') schedule(true, 140) }}
        onPointerLeave={() => schedule(false, 220)}
        onPointerDown={() => {
          // Garder la surface ouverte entre pointerdown et click : quitter le
          // focus clavier ne doit pas retirer le bouton sous le pointeur.
          clearTimer()
          setHovered(true)
          setKeyboardWithin(false)
        }}
        onFocus={(event) => {
          if (event.target.matches(':focus-visible')) setKeyboardWithin(true)
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setKeyboardWithin(false)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          // Laisser Échap aux fenêtres qui possèdent le focus (elles sont hors de l'îlot).
          clearTimer()
          setHovered(false)
          setKeyboardWithin(false)
        }}
      >
        {children}
      </div>
    </aside>
  )
}
