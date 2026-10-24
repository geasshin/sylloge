import { t, formatNumber } from '../i18n/core.ts'
import type { ReactNode } from 'react'
import { statusTone } from '../domain/statusTone.ts'

type StatusLabels = { readonly [key: string]: string }

// La famille d'un statut vit dans le domaine (les cartes à partager la lisent aussi).
export { statusTone }
export type { StatusTone } from '../domain/statusTone.ts'

/** Badge de statut unique : un seul état visible, rendu monochrome par famille. */
export function StatusBadge({ status, labels }: { status: string; labels: StatusLabels }) {
  return (
    <span className={`status-badge tone-${statusTone(status)}`} role="status">
      {t(labels[status])}
    </span>
  )
}

/** Contrôle segmenté réutilisable pour les statuts comme pour les types. */
export function StatusSegmented({
  statuses,
  labels,
  value,
  onChange,
  ariaLabel = 'Statut',
}: {
  statuses: readonly string[]
  labels: StatusLabels
  value: string
  onChange: (next: string) => void
  ariaLabel?: string
}) {
  return (
    <div className="seg-group seg-group-form" role="radiogroup" aria-label={t(ariaLabel)}>
      {statuses.map((status) => (
        <button
          key={status}
          type="button"
          role="radio"
          aria-checked={value === status}
          className={`seg-pill-btn ${value === status ? 'on' : ''}`}
          onClick={() => onChange(status)}
        >
          {t(labels[status])}
        </button>
      ))}
    </div>
  )
}

/**
 * Note 0,5 à 5 par demi-étoile : clic sur la moitié gauche ou droite d'une
 * étoile. Pilotable au clavier (flèches par pas de 0,5).
 */
export function StarRating({
  value,
  onChange,
  label = 'Note sur 5',
}: {
  value: number | null
  onChange: (next: number | null) => void
  label?: string
}) {
  const handleClick = (event: React.MouseEvent<HTMLSpanElement>, star: number) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const half = event.clientX - bounds.left < bounds.width / 2
    const next = half ? star - 0.5 : star
    onChange(value === next ? null : next)
  }

  return (
    <div
      className="rate-input"
      role="slider"
      tabIndex={0}
      aria-label={t(label)}
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value ?? 0}
      aria-valuetext={value !== null ? t('{rating} sur 5', { rating: formatNumber(value) }) : t('Aucune note')}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault()
          onChange(Math.min(5, (value ?? 0) + 0.5))
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault()
          onChange(value === null ? null : Math.max(0.5, value - 0.5))
        } else if (event.key === 'Home') {
          event.preventDefault()
          onChange(0.5)
        } else if (event.key === 'End') {
          event.preventDefault()
          onChange(5)
        }
      }}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = value === null ? 0 : Math.max(0, Math.min(1, value - star + 1))
        return (
          <span
            key={star}
            className={`star-slot ${fill > 0 ? 'filled' : ''}`}
            onClick={(event) => handleClick(event, star)}
            title={t('{half} ou {whole}', { half: formatNumber(star - 0.5), whole: formatNumber(star) })}
          >
            <span className="star-glyph" aria-hidden="true">★</span>
            <span className="star-fill" aria-hidden="true" style={{ width: `${fill * 100}%` }}>★</span>
          </span>
        )
      })}
      <span className="rate-value">{value !== null ? `${formatNumber(value)}/5` : t('Aucune note')}</span>
    </div>
  )
}

/** Coup de cœur en pilule cœur. */
export function FavoriteHeart({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  children?: ReactNode
}) {
  return (
    <>
      <button
        type="button"
        className={`heart-input ${checked ? 'on' : ''}`}
        aria-pressed={checked}
        aria-label={t("Coup de cœur")}
        onClick={() => onChange(!checked)}
      >
        ♥
      </button>
      {children}
    </>
  )
}
