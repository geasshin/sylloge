import { t } from '../i18n/core.ts'
import { useEffect, useState } from 'react'

export type PosterLabel = 'Affiche' | 'Couverture' | 'Visuel'

/** Source copy stays untranslated until render, so a language change is immediate. */
const POSTER_COPY: Record<PosterLabel, { unavailable: string; empty: string; alt: string; edit: string; editFor: string; hint: string }> = {
  "Affiche": {
    "unavailable": "Affiche indisponible pour {title}",
    "empty": "Sans affiche",
    "alt": "Affiche de « {title} »",
    "edit": "Modifier l’affiche",
    "editFor": "Modifier l’affiche de « {title} »",
    "hint": "Le lien d’une image trouvée sur le web suffit. Laisser vide pour revenir à l’affiche par défaut."
  },
  "Couverture": {
    "unavailable": "Couverture indisponible pour {title}",
    "empty": "Sans couverture",
    "alt": "Couverture de « {title} »",
    "edit": "Modifier la couverture",
    "editFor": "Modifier la couverture de « {title} »",
    "hint": "Le lien d’une image trouvée sur le web suffit. Laisser vide pour revenir à la couverture par défaut."
  },
  "Visuel": {
    "unavailable": "Visuel indisponible pour {title}",
    "empty": "Sans visuel",
    "alt": "Visuel de « {title} »",
    "edit": "Modifier le visuel",
    "editFor": "Modifier le visuel de « {title} »",
    "hint": "Le lien d’une image trouvée sur le web suffit. Laisser vide pour revenir au visuel par défaut."
  }
}

export function posterEditTitle(label: PosterLabel): string {
  return t(POSTER_COPY[label].edit)
}

export function posterResetHint(label: PosterLabel): string {
  return t(POSTER_COPY[label].hint)
}

type PosterProps = {
  title: string
  src: string | null
  className?: string
  label?: PosterLabel
  /** Présent → un bouton crayon apparaît au survol de l'affiche. */
  onEdit?: () => void
}

export function Poster({ title, src, className = '', label = 'Affiche', onEdit }: PosterProps) {
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setMissing(false)
  }, [src])

  const showFallback = !src || missing
  const copy = POSTER_COPY[label]

  // Le crayon est positionné par le visuel lui-même (poster-editable) : il ne
  // dépend plus d'un conteneur ajouté ou oublié par chaque écran.
  return (
    <div className={`poster ${onEdit ? 'poster-editable' : ''} ${className}`.replace(/\s+/g, ' ').trim()}>
      {showFallback ? (
        <div className="poster-fallback" role="img" aria-label={t(copy.unavailable, { title })}>
          <span>{t(copy.empty)}</span>
          <b>{title}</b>
        </div>
      ) : (
        <img src={src} alt={t(copy.alt, { title })} loading="lazy" decoding="async" onError={() => setMissing(true)} />
      )}
      {onEdit && (
        <button type="button" className="poster-edit-overlay" onClick={onEdit} aria-label={t(copy.editFor, { title })} title={posterEditTitle(label)}>
          <PencilGlyph />
        </button>
      )}
    </div>
  )
}

/** Petit crayon inline (évite une dépendance circulaire vers la fabrique d'icônes). */
function PencilGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}
