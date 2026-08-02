import { useState } from 'react'
import {
  SERIES_CATEGORY_LABELS,
  SERIES_STATUS_LABELS,
  type Series,
} from '../domain/series.ts'
import { Poster } from './Poster.tsx'

function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
}

type SeriesDetailProps = {
  series: Series
  onBack: () => void
  backLabel: string
  onEdit: () => void
  onDelete: () => Promise<void>
}

export function SeriesDetail({ series, onBack, backLabel, onEdit, onDelete }: SeriesDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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
        <button className="secondary-button" type="button" onClick={onEdit}>Modifier</button>
      </header>

      <article className="film-detail">
        <div className="film-detail-visual">
          <div className="poster-container">
            <Poster title={series.title} src={series.posterUrl} className="detail-poster" />
          </div>
        </div>

        <div className="film-detail-content">
          <p className="eyebrow">{SERIES_CATEGORY_LABELS[series.category]}</p>
          <h1 className="display-title">{series.title}</h1>
          {series.showrunner && <p className="detail-attribution">{series.showrunner}</p>}

          <dl className="film-facts">
            <div>
              <dt>Statut</dt>
              <dd>{SERIES_STATUS_LABELS[series.status]}</dd>
            </div>
            {progress && (
              <div>
                <dt>Avancement</dt>
                <dd>{progress}</dd>
              </div>
            )}
            {series.isFavorite && (
              <div>
                <dt>Collection</dt>
                <dd>Favori</dd>
              </div>
            )}
            {series.rating !== null && (
              <div>
                <dt>Note</dt>
                <dd>{series.rating.toLocaleString('fr-FR')} / 5</dd>
              </div>
            )}
            {series.startedAt && (
              <div>
                <dt>Début du visionnage</dt>
                <dd>{formatCalendarDate(series.startedAt)}</dd>
              </div>
            )}
          </dl>

          {series.casting && (
            <section className="reading-section">
              <h2>Casting</h2>
              <p>{series.casting}</p>
            </section>
          )}

          {series.summary && (
            <section className="reading-section">
              <h2>Résumé</h2>
              <p>{series.summary}</p>
            </section>
          )}

          {series.personalNote && (
            <section className="reading-section personal-reading">
              <h2>Avis personnel</h2>
              <p>{series.personalNote}</p>
            </section>
          )}

          <section className="delete-section">
            {!confirmingDelete ? (
              <button className="delete-link" type="button" onClick={() => setConfirmingDelete(true)}>Supprimer cette série</button>
            ) : (
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
            )}
          </section>
        </div>
      </article>
    </main>
  )
}
