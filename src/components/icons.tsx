/** Identité visuelle : signe Sylloge et iconographie des médiums (SVG inline). */

type IconProps = { size?: number }

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function HomeIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path {...strokeProps} d="M3.5 9.5 10 3.5l6.5 6v6.2a1.3 1.3 0 0 1-1.3 1.3H4.8a1.3 1.3 0 0 1-1.3-1.3V9.5Z" />
      <path {...strokeProps} d="M8 16.5v-4.3h4v4.3" />
    </svg>
  )
}

export function FilmIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect {...strokeProps} x="2.75" y="4" width="14.5" height="12" rx="2" />
      <path {...strokeProps} d="M6.2 4v12M13.8 4v12" />
      <path {...strokeProps} d="M2.75 8h3.45M13.8 8h3.45M2.75 12h3.45M13.8 12h3.45" strokeOpacity=".65" />
    </svg>
  )
}

export function SeriesIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect {...strokeProps} x="2.75" y="6" width="14.5" height="10" rx="2" />
      <path {...strokeProps} d="m7 3 3 3 3-3" />
    </svg>
  )
}

export function BookIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path {...strokeProps} d="M10 5.6C8.8 4.4 6.9 3.9 4 4v11.4c2.9-.1 4.8.4 6 1.6 1.2-1.2 3.1-1.7 6-1.6V4c-2.9-.1-4.8.4-6 1.6Z" />
      <path {...strokeProps} d="M10 5.6v11.4" />
    </svg>
  )
}

export function GameIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path {...strokeProps} d="M6.2 5.5h7.6a4.3 4.3 0 0 1 4.2 3.6l.6 3.8c.2 1.4-.9 2.6-2.2 2.6-.8 0-1.5-.4-1.9-1l-.9-1.2H6.4L5.5 14.5c-.4.6-1.1 1-1.9 1-1.3 0-2.4-1.2-2.2-2.6l.6-3.8a4.3 4.3 0 0 1 4.2-3.6Z" />
      <path {...strokeProps} d="M6.3 8.6v3M4.8 10.1h3" />
      <circle cx="13.6" cy="9" r=".95" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="11" r=".95" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ArtIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path {...strokeProps} d="M10 3a7 7 0 0 0-7 7c0 3.4 2.6 5 4.6 5 1.2 0 1.9-.8 2.4-1.6.4-.6.9-.9 1.6-.7l3 .8A3.4 3.4 0 0 0 17 10a7 7 0 0 0-7-7Z" />
      <circle cx="7.2" cy="8" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="10" cy="6.2" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="12.8" cy="8" r="1.05" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SettingsIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {/* Engrenage d'après Feather Icons (MIT) */}
      <circle {...strokeProps} cx="12" cy="12" r="3" />
      <path
        {...strokeProps}
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
      />
    </svg>
  )
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

/** Icônes des vues de l'accueil et des sections. */
export function CalendarIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect {...strokeProps} x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path {...strokeProps} d="M3 8.5h14M7 2.8v3M13 2.8v3" />
    </svg>
  )
}
