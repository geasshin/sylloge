import { useEffect, useState } from 'react'

export type PosterLabel = 'Affiche' | 'Couverture' | 'Visuel'

/** Libellé précédé de son article défini : « l’affiche », « la couverture », « le visuel ». */
const POSTER_LABEL_WITH_ARTICLE: Record<PosterLabel, string> = {
  Affiche: 'l’affiche',
  Couverture: 'la couverture',
  Visuel: 'le visuel',
}

/** Même libellé après « à » : « à l’affiche », « à la couverture », « au visuel ». */
const POSTER_LABEL_AFTER_A: Record<PosterLabel, string> = {
  Affiche: 'à l’affiche',
  Couverture: 'à la couverture',
  Visuel: 'au visuel',
}

export function posterLabelWithArticle(label: PosterLabel): string {
  return POSTER_LABEL_WITH_ARTICLE[label]
}

export function posterLabelAfterA(label: PosterLabel): string {
  return POSTER_LABEL_AFTER_A[label]
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

  // Le crayon est positionné par le visuel lui-même (poster-editable) : il ne
  // dépend plus d'un conteneur ajouté ou oublié par chaque écran.
  return (
    <div className={`poster ${onEdit ? 'poster-editable' : ''} ${className}`.replace(/\s+/g, ' ').trim()}>
      {showFallback ? (
        <div className="poster-fallback" role="img" aria-label={`${label} indisponible pour ${title}`}>
          <span>Sans {label.toLocaleLowerCase('fr')}</span>
          <b>{title}</b>
        </div>
      ) : (
        <img src={src} alt={`${label} de « ${title} »`} onError={() => setMissing(true)} />
      )}
      {onEdit && (
        <button type="button" className="poster-edit-overlay" onClick={onEdit} aria-label={`Modifier ${posterLabelWithArticle(label)} de « ${title} »`} title={`Modifier ${posterLabelWithArticle(label)}`}>
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
