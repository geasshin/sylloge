import { useEffect, useState } from 'react'

type PosterProps = {
  title: string
  src: string | null
  className?: string
  label?: 'Affiche' | 'Couverture' | 'Visuel'
  /** Présent → un bouton crayon apparaît au survol de l'affiche. */
  onEdit?: () => void
}

export function Poster({ title, src, className = '', label = 'Affiche', onEdit }: PosterProps) {
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setMissing(false)
  }, [src])

  const showFallback = !src || missing

  return (
    <div className={`poster ${className}`.trim()}>
      {showFallback ? (
        <div className="poster-fallback" role="img" aria-label={`${label} indisponible pour ${title}`}>
          <span>Sans {label.toLocaleLowerCase('fr')}</span>
          <b>{title}</b>
        </div>
      ) : (
        <img src={src} alt={`${label} de « ${title} »`} onError={() => setMissing(true)} />
      )}
      {onEdit && (
        <button type="button" className="poster-edit-overlay" onClick={onEdit} aria-label={`Modifier la ${label.toLocaleLowerCase('fr')} de « ${title} »`} title={`Modifier la ${label.toLocaleLowerCase('fr')}`}>
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
