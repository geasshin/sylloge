import { t } from '../i18n/core.ts'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { detailImageUrl } from '../domain/imageQuality.ts'

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
  /** Image chargée : permet de lire son format réel (grille Art). */
  onImageLoad?: (image: HTMLImageElement) => void
  /** Style du cadre (format d'un visuel d'Art). */
  style?: CSSProperties
  /** Contenu de l'état « sans visuel » à la place du libellé et du titre. */
  fallback?: ReactNode
  /** Fiche : demander la grande taille au service (TMDB w780, IGDB 720p). */
  sharp?: boolean
}

export function Poster({ title, src, className = '', label = 'Affiche', onEdit, onImageLoad, style, fallback, sharp = false }: PosterProps) {
  const [missing, setMissing] = useState(false)
  // La grande taille peut manquer chez le service : on retombe alors sur
  // l'adresse enregistrée avant de déclarer le visuel indisponible.
  const [sharpFailed, setSharpFailed] = useState(false)

  useEffect(() => {
    setMissing(false)
    setSharpFailed(false)
  }, [src])

  const sharpSrc = sharp && !sharpFailed ? detailImageUrl(src) : src
  const showFallback = !src || missing
  const copy = POSTER_COPY[label]

  // Le crayon est positionné par le visuel lui-même (poster-editable) : il ne
  // dépend plus d'un conteneur ajouté ou oublié par chaque écran.
  return (
    <div className={`poster ${onEdit ? 'poster-editable' : ''} ${className}`.replace(/\s+/g, ' ').trim()} style={style}>
      {showFallback ? (
        <div className={fallback ? 'poster-fallback poster-fallback-custom' : 'poster-fallback'} role="img" aria-label={t(copy.unavailable, { title })}>
          {fallback ?? (
            <>
              <span>{t(copy.empty)}</span>
              <b>{title}</b>
            </>
          )}
        </div>
      ) : (
        <img
          src={sharpSrc ?? undefined}
          alt={t(copy.alt, { title })}
          loading="lazy"
          decoding="async"
          onError={() => (sharpSrc !== src ? setSharpFailed(true) : setMissing(true))}
          onLoad={onImageLoad ? (event) => onImageLoad(event.currentTarget) : undefined}
        />
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
