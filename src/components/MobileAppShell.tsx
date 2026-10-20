import { useCallback, useEffect, useRef, useState } from 'react'
import logoSylloge from '../assets/logo-sylloge.png'
import { HomeIcon, FilmIcon, SeriesIcon, BookIcon, MangaIcon, GameIcon, ArtIcon, SettingsIcon } from './icons.tsx'
import { ProfileAvatar } from './ProfileAvatar.tsx'

type MobileShellProps = {
  activeItem: 'artworks' | 'books' | 'mangas' | 'games' | 'home' | 'library' | 'series' | 'settings'
  onHome: () => void
  onLibrary: () => void
  onSeries: () => void
  onBooks: () => void
  onMangas: () => void
  onGames: () => void
  onArtworks: () => void
  onSettings: () => void
  currentProfileName: string | null
  currentProfileAvatar: string | null
}

const ITEMS = [
  { id: 'home', label: 'Accueil', icon: <HomeIcon /> },
  { id: 'library', label: 'Films', icon: <FilmIcon /> },
  { id: 'series', label: 'Séries', icon: <SeriesIcon /> },
  { id: 'books', label: 'Livres', icon: <BookIcon /> },
  { id: 'mangas', label: 'Mangas', icon: <MangaIcon /> },
  { id: 'games', label: 'Jeux', icon: <GameIcon /> },
  { id: 'artworks', label: 'Art', icon: <ArtIcon /> },
] as const

/**
 * Shell mobile explicite : la navigation devient un tiroir accessible et un
 * bandeau de destinations compactes au lieu d'une barre latérale qui mange la
 * largeur utile. Le composant est rendu dans les deux branches : le CSS le
 * masque au-dessus du breakpoint mobile.
 */
export function MobileAppShell({
  activeItem,
  onHome,
  onLibrary,
  onSeries,
  onBooks,
  onMangas,
  onGames,
  onArtworks,
  onSettings,
  currentProfileName,
  currentProfileAvatar,
}: MobileShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)
  const drawerFocus = useRef<HTMLButtonElement | null>(null)

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    window.requestAnimationFrame(() => drawerFocus.current?.focus())
  }, [])

  useEffect(() => {
    if (!drawerOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDrawer()
        return
      }
      if (event.key !== 'Tab') return
      const drawer = drawerRef.current
      if (!drawer) return
      const focusable = [...drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )]
      if (focusable.length === 0) {
        event.preventDefault()
        drawer.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (!drawer.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    window.requestAnimationFrame(() => document.getElementById('mobile-drawer-close')?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [closeDrawer, drawerOpen])

  const navigate = (action: () => void) => {
    setDrawerOpen(false)
    action()
  }

  return (
    <div className="mobile-app-shell">
      <header className="mobile-app-bar" aria-label="En-tête mobile">
        <button
          className="mobile-menu-button"
          type="button"
          aria-label="Ouvrir le menu"
          aria-expanded={drawerOpen}
          aria-controls="mobile-navigation-drawer"
          onClick={(event) => {
            drawerFocus.current = event.currentTarget
            setDrawerOpen(true)
          }}
        >
          <span className="mobile-menu-lines" aria-hidden="true"><i /><i /><i /></span>
          <span>Menu</span>
        </button>
        <button className="mobile-home-mark" type="button" onClick={onHome} aria-label="Revenir à l’accueil">
          <img src={logoSylloge} alt="" width={30} height={30} />
          <span>Sylloge</span>
        </button>
        <button className="mobile-settings-button" type="button" onClick={onSettings} aria-label="Ouvrir les paramètres">
          <SettingsIcon />
        </button>
      </header>

      {drawerOpen && (
        <div className="mobile-drawer-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) closeDrawer() }}>
          <aside
            id="mobile-navigation-drawer"
            ref={drawerRef}
            className="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation principale"
            tabIndex={-1}
          >
            <div className="mobile-drawer-head">
              <img src={logoSylloge} alt="" width={38} height={38} />
              <div><b>Sylloge</b><span>Bibliothèque locale</span></div>
              <button id="mobile-drawer-close" className="mobile-drawer-close" type="button" onClick={closeDrawer} aria-label="Fermer le menu">×</button>
            </div>
            {currentProfileName && (
              <div className="mobile-drawer-profile">
                <ProfileAvatar name={currentProfileName} avatarDataUrl={currentProfileAvatar} className="sidebar-avatar" />
                <span>{currentProfileName}</span>
              </div>
            )}
            <nav className="mobile-drawer-nav" aria-label="Destinations">
              {ITEMS.map((item) => (
                <button
                  key={item.id}
                  className={`mobile-drawer-item ${activeItem === item.id ? 'active' : ''}`}
                  type="button"
                  aria-current={activeItem === item.id ? 'page' : undefined}
                  onClick={() => navigate(item.id === 'home' ? onHome : item.id === 'library' ? onLibrary : item.id === 'series' ? onSeries : item.id === 'books' ? onBooks : item.id === 'mangas' ? onMangas : item.id === 'games' ? onGames : onArtworks)}
                >
                  {item.icon}<span>{item.label}</span>
                </button>
              ))}
            </nav>
            <button className="mobile-drawer-settings" type="button" onClick={() => navigate(onSettings)}>
              <SettingsIcon /><span>Paramètres</span>
            </button>
          </aside>
        </div>
      )}

      <nav className="mobile-bottom-nav" aria-label="Navigation rapide">
        {ITEMS.slice(0, 5).map((item) => (
          <button
            key={item.id}
            className={`mobile-bottom-item ${activeItem === item.id ? 'active' : ''}`}
            type="button"
            aria-current={activeItem === item.id ? 'page' : undefined}
            onClick={item.id === 'home' ? onHome : item.id === 'library' ? onLibrary : item.id === 'series' ? onSeries : item.id === 'books' ? onBooks : item.id === 'mangas' ? onMangas : onGames}
          >
            {item.icon}<span>{item.label}</span>
          </button>
        ))}
        <button
          className={`mobile-bottom-item ${activeItem === 'artworks' ? 'active' : ''}`}
          type="button"
          onClick={onArtworks}
          aria-label="Art"
          aria-current={activeItem === 'artworks' ? 'page' : undefined}
        >
          {ITEMS[5].icon}<span>Art</span>
        </button>
      </nav>
    </div>
  )
}
