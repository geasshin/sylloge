/** Identité visuelle : signe Sylloge et iconographie des médiums (SVG inline). */

import { navigationIconPaths } from './navigationIconPaths.ts'

type IconProps = { size?: number }
type NavigationIconProps = IconProps & { filled?: boolean }

/** Les deux poids gardent le dessin approuvé et héritent de l’encre du contrôle. */
function NavigationIcon({
  name,
  size,
  filled,
}: NavigationIconProps & { name: keyof typeof navigationIconPaths }) {
  const paths = navigationIconPaths[name]
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d={filled ? paths.fill : paths.regular} />
    </svg>
  )
}

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Flèche de retour : seule la direction est visible, le sens reste nommé. */
export function ArrowLeftIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path {...strokeProps} strokeWidth={1.8} d="M15.4 10H5.1" />
      <path {...strokeProps} strokeWidth={1.8} d="M9.9 4.8 4.7 10l5.2 5.2" />
    </svg>
  )
}

export function HomeIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="home" size={size} filled={filled} />
}

export function FilmIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="film" size={size} filled={filled} />
}

export function SeriesIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="series" size={size} filled={filled} />
}

/** Animation : deux cellulos décalés et un signe de lecture, sans motif culturel. */
export function AnimeIcon({ size = 17, filled = false }: NavigationIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path {...strokeProps} strokeWidth={1.25} d="M6 3.5h9.5A1.5 1.5 0 0 1 17 5v8" />
      {filled ? (
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M4.5 5.875h8A2.125 2.125 0 0 1 14.625 8v7A2.125 2.125 0 0 1 12.5 17.125h-8A2.125 2.125 0 0 1 2.375 15V8A2.125 2.125 0 0 1 4.5 5.875ZM7 9.125v4.75l4-2.375Z"
        />
      ) : (
        <>
          <rect {...strokeProps} strokeWidth={1.25} x="3" y="6.5" width="11" height="10" rx="1.5" />
          <path fill="currentColor" d="M7 9.125v4.75l4-2.375Z" />
        </>
      )}
    </svg>
  )
}

export function BookIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="book" size={size} filled={filled} />
}

/** Mangas : une série de tomes sur l'étagère, distincte du livre ouvert dans le rail. */
export function MangaIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="manga" size={size} filled={filled} />
}

export function GameIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="game" size={size} filled={filled} />
}

export function ArtIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="art" size={size} filled={filled} />
}

export function SettingsIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="settings" size={size} filled={filled} />
}

export function SearchIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle {...strokeProps} cx="8.5" cy="8.5" r="5" />
      <path {...strokeProps} d="m12.4 12.4 4 4" />
    </svg>
  )
}

/** Tirage aléatoire (flèches circulaires, d'après Feather Icons, MIT). */
export function RefreshIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polyline {...strokeProps} points="23 4 23 10 17 10" />
      <path {...strokeProps} d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

/** Baguette magique : association automatique des métadonnées. */
export function WandIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path {...strokeProps} d="M15 4V2M15 10V8M11.5 6.5h-2M20.5 6.5h-2M17.8 3.7l-1.4 1.4M17.8 9.3l-1.4-1.4M12.2 3.7l1.4 1.4" />
      <path {...strokeProps} d="M3 21 12.7 11.3a1.6 1.6 0 0 1 2.26 0l.34.34a1.6 1.6 0 0 1 0 2.26L5.6 23" transform="translate(-1 -1) scale(.92)" />
    </svg>
  )
}

/** Crayon : édition d'une fiche (d'après Feather Icons, MIT). */
export function PencilIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path {...strokeProps} d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

/** Corbeille : suppression d'une fiche (d'après Feather Icons, MIT). */
export function TrashIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polyline {...strokeProps} points="3 6 5 6 21 6" />
      <path {...strokeProps} d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line {...strokeProps} x1="10" y1="11" x2="10" y2="17" />
      <line {...strokeProps} x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

/** Panneau latéral : bascule rail / étendue de la barre de navigation. */
export function PanelIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="panel" size={size} filled={filled} />
}

/** Épingler la barre latérale, plein lorsque son maintien est actif. */
export function PinIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="pin" size={size} filled={filled} />
}

/** Maillon brisé : dissociation d'une fiche et de son fournisseur. */
export function UnlinkIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path {...strokeProps} d="M8.5 15.5 5.7 18.3a3.6 3.6 0 0 1-5-5l2.8-2.8" transform="translate(4 -1)" />
      <path {...strokeProps} d="M13 8.5l3.5-3.5a3.54 3.54 0 1 1 5 5L18 13.5" transform="translate(1 3)" />
      <line {...strokeProps} x1="5.5" y1="19" x2="19" y2="5.5" />
    </svg>
  )
}

/** Icônes des vues de l'accueil et des sections. */
export function CalendarIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect {...strokeProps} x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path {...strokeProps} d="M3 8.5h14M7 2.8v3M13 2.8v3" />
    </svg>
  )
}

// ─── Bibliothèques personnalisées (0021) ───────────────────────────────────

export function ComicIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="comic" size={size} filled={filled} />
}

export function MagazineIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="magazine" size={size} filled={filled} />
}

export function AudiobookIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="audiobook" size={size} filled={filled} />
}

export function MusicIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="music" size={size} filled={filled} />
}

export function PodcastIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="podcast" size={size} filled={filled} />
}

export function DocumentaryIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="documentary" size={size} filled={filled} />
}

export function ShowIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="show" size={size} filled={filled} />
}

export function BoardGameIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="boardGame" size={size} filled={filled} />
}

export function RecipeIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="recipe" size={size} filled={filled} />
}

export function PlusIcon({ size = 17, filled = false }: NavigationIconProps) {
  return <NavigationIcon name="plus" size={size} filled={filled} />
}

/** Partager : une flèche qui sort d'un plateau — l'image quitte l'application, sans rien publier. */
export function ShareIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path {...strokeProps} d="M10 2.9v9.2" />
      <path {...strokeProps} d="M6.7 6.1 10 2.9l3.3 3.2" />
      <path {...strokeProps} d="M4.2 11.4v3.9a1.8 1.8 0 0 0 1.8 1.8h8a1.8 1.8 0 0 0 1.8-1.8v-3.9" />
    </svg>
  )
}
