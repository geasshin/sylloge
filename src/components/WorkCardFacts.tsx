import { t, formatNumber } from '../i18n/core.ts'
import { statusTone } from '../domain/statusTone.ts'

type WorkCardFactsProps = {
  title: string
  isFavorite: boolean
  /**
   * Signature du médium : réalisateur, showrunner, auteur, développeur (avec la
   * plateforme) ou artiste (avec la forme). Null quand la fiche ne la porte pas.
   */
  creator: string | null
  /** Note sur 5 ; null quand l'œuvre n'est pas notée. */
  rating: number | null
  /** Année de sortie, de parution ou de création ; null quand le médium n'en a pas. */
  year: number | null
  /** État stocké, qui détermine le ton de la pastille. */
  status: string
  /** État déjà traduit. */
  statusLabel: string
  /** Avancement facultatif, déjà mis en forme (« 3 / 8 saisons »). */
  progress?: string | null
}

/**
 * Bloc de texte d'une carte d'œuvre (0.6.24) : titre, signature, puis note ou
 * année, et l'état. Les sept bibliothèques partagent ce bloc pour que l'ordre
 * des faits et la densité ne divergent plus d'un médium à l'autre.
 *
 * Règle de la note : une œuvre notée affiche sa note à droite ; sinon c'est
 * l'année qui occupe cette place (une œuvre pas encore vue n'a pas de note à
 * montrer). L'année reste visible une seule fois — dans la signature quand la
 * note occupe déjà la droite.
 */
export function WorkCardFacts({
  title,
  isFavorite,
  creator,
  rating,
  year,
  status,
  statusLabel,
  progress = null,
}: WorkCardFactsProps) {
  const yearText = year !== null ? String(year) : null
  const signature = [creator, rating !== null ? yearText : null].filter(Boolean).join(' · ')
  const signal = rating !== null ? 'rating' : yearText !== null ? 'year' : null

  return (
    <span className="film-card-info">
      <span className="film-card-top">
        <b>{title}</b>
        {isFavorite && <i aria-label={t('Favori')}>♥</i>}
      </span>
      {(signature !== '' || signal !== null) && (
        <span className="film-card-meta">
          {signature !== '' && <small>{signature}</small>}
          {signal === 'rating' && (
            <span className="card-rating" aria-label={t('{rating} sur 5', { rating: formatNumber(rating!) })}>
              <span className="card-rating-star" aria-hidden="true">★</span>
              <span aria-hidden="true">{formatNumber(rating!)}</span>
            </span>
          )}
          {signal === 'year' && <span className="card-year">{yearText}</span>}
        </span>
      )}
      <span className={`status-line tone-${statusTone(status)}`}>
        {statusLabel}
        {progress ? ` · ${progress}` : ''}
      </span>
    </span>
  )
}
