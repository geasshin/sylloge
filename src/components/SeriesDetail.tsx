import { useState } from 'react'
import {
  SERIES_CATEGORY_LABELS,
  SERIES_STATUS_LABELS,
  type Series,
} from '../domain/series.ts'
import { Poster } from './Poster.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { StatusBadge } from './VerdictControls.tsx'
import { icon } from '../main.tsx'

function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
}

type SeriesDetailProps = {
  series: Series
  onBack: () => void
  backLabel: string
  onEdit: () => void
  /** Modification du visuel par URL depuis le crayon sur l'affiche. */
  onPosterEdit?: (url: string | null) => Promise<void> | void
  /** Ouverture de la pop-up d'association TMDB (même parcours que les films). */
  onAssociate?: () => void
  onDelete: () => Promise<void>
}

export function SeriesDetail({ series, onBack, backLabel, onEdit, onPosterEdit, onAssociate, onDelete }: SeriesDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [posterDialogOpen, setPosterDialogOpen] = useState(false)

  const progress = series.seasonsSeen !== null
    ? series.seasonsTotal !== null
      ? `${series.seasonsSeen} saison${series.seasonsSeen > 1 ? 's' : ''} sur ${series.seasonsTotal}`
      : `${series.seasonsSeen} saison${series.seasonsSeen > 1 ? 's' : ''} vue${series.seasonsSeen > 1 ? 's' : ''}`
    : null

  const deleteSeries = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch (error) {
      console.error('Impossible de supprimer la série.', error)
      setDeleteError('La suppression a échoué. La série est toujours dans la collection.')
      setDeleting(false)
    }
  }

  return (
    <main className="main detail-page-main">
      <header className="page-action-bar detail-action-bar">
        <button className="back-button" type="button" onClick={onBack}>{backLabel}</button>
        <div className="detail-actions">
          <button className="icon-action-button" type="button" onClick={onEdit} title="Modifier la fiche">
            {icon('pencil')}
            <span>Modifier</span>
          </button>
          {onAssociate && (
            <button className="icon-action-button" type="button" onClick={onAssociate} title="Associer à TMDB (recherche assistée)">
              {icon('wand')}
              <span>Associer</span>
            </button>
          )}
          <button
            className="icon-action-button icon-action-danger"
            type="button"
            onClick={() => setConfirmingDelete(true)}
            title="Supprimer cette série"
          >
            {icon('trash')}
            <span>Supprimer</span>
          </button>
        </div>
      </header>

      <article className="detail-layout">
        <div className="detail-side">
          <div className="poster-container detail-poster-wrap">
            <Poster title={series.title} src={series.posterUrl} className="detail-poster" onEdit={onPosterEdit ? () => setPosterDialogOpen(true) : undefined} />
          </div>
          <div className="detail-status">
            <StatusBadge status={series.status} labels={SERIES_STATUS_LABELS} />
          </div>
          {(series.rating !== null || series.isFavorite) && (
            <div className="detail-rate">
              {series.rating !== null && (
                <>
                  <span className="stars-display" aria-label={`Note ${series.rating} sur 5`}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      const fill = Math.max(0, Math.min(1, series.rating! - star + 1))
                      return (
                        <span key={star} className={`star-slot ${fill > 0 ? 'filled' : ''}`}>
                          <span className="star-glyph" aria-hidden="true">★</span>
                          <span className="star-fill" style={{ width: `${fill * 100}%` }} aria-hidden="true">★</span>
                        </span>
                      )
                    })}
                  </span>
                  <span className="rate-value">{series.rating.toLocaleString('fr-FR')}/5</span>
                </>
              )}
              {series.isFavorite && <span className="heart-display on" aria-label="Coup de cœur">♥</span>}
            </div>
          )}
        </div>

        <div className="detail-body">
          <p className="eyebrow">{SERIES_CATEGORY_LABELS[series.category]}</p>
          <h1 className="display-title">{series.title}</h1>
          {(series.showrunner || progress || series.startedAt) && (
            <p className="detail-factline">
              {[series.showrunner, progress, series.startedAt ? `débutée le ${formatCalendarDate(series.startedAt)}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          <dl className="detail-facts">
            {series.showrunner && (
              <div><dt>Showrunner</dt><dd>{series.showrunner}</dd></div>
            )}
            {series.casting && (
              <div><dt>Casting</dt><dd>{series.casting}</dd></div>
            )}
            {progress && (
              <div><dt>Avancement</dt><dd>{progress}</dd></div>
            )}
            {series.startedAt && (
              <div><dt>Début du visionnage</dt><dd>{formatCalendarDate(series.startedAt)}</dd></div>
            )}
          </dl>

          {series.summary && (
            <div className="synopsis-block">
              <p>{series.summary}</p>
            </div>
          )}

          <section className="mine-block">
            {series.personalNote ? (
              <>
                <blockquote className="review-personal">{series.personalNote}</blockquote>
                <button className="link-accent review-edit-link" type="button" onClick={onEdit}>Modifier</button>
              </>
            ) : (
              <p className="mine-empty">Ton avis s’écrira ici.</p>
            )}
          </section>
        </div>
      </article>

      {confirmingDelete && (
        <div className="confirm-backdrop">
          <div className="delete-confirmation" role="alertdialog" aria-labelledby="series-delete-title" aria-describedby="series-delete-description">
            <h2 id="series-delete-title">Supprimer définitivement cette série ?</h2>
            <p id="series-delete-description">« {series.title} » sera retirée de la collection sans possibilité de restauration.</p>
            {deleteError && <p className="field-error" role="alert">{deleteError}</p>}
            <div>
              <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Annuler</button>
              <button className="danger-button" type="button" onClick={deleteSeries} disabled={deleting}>
                {deleting ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
      <PosterUrlDialog
        open={posterDialogOpen}
        title={series.title}
        label="Affiche"
        currentUrl={series.posterUrl}
        onClose={() => setPosterDialogOpen(false)}
        onSave={(url) => onPosterEdit?.(url)}
      />
    </main>
  )
}
