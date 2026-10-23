import { useState } from 'react'
import {
  SERIES_STATUS_LABELS,
  type Series,
} from '../domain/series.ts'
import { t, formatDate, formatNumber, translateMessage } from '../i18n/core.ts'
import { Poster } from './Poster.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { StatusBadge } from './VerdictControls.tsx'
import { icon } from '../main.tsx'

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
      ? t(series.seasonsSeen === 1 ? '{count} saison sur {total}' : '{count} saisons sur {total}', { count: series.seasonsSeen, total: series.seasonsTotal })
      : t(series.seasonsSeen === 1 ? '{count} saison vue' : '{count} saisons vues', { count: series.seasonsSeen })
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
        <button className="back-button back-button-icon" type="button" onClick={onBack} aria-label={backLabel}>{icon('arrow-left')}</button>
        <div className="detail-actions">
          <button className="icon-action-button" type="button" onClick={onEdit} title={t("Modifier la fiche")}>
            {icon('pencil')}
            <span>{t("Modifier")}</span>
          </button>
          {onAssociate && (
            <button className="icon-action-button" type="button" onClick={onAssociate} title={t("Associer à TMDB (recherche assistée)")}>
              {icon('wand')}
              <span>{t("Associer")}</span>
            </button>
          )}
          <button
            className="icon-action-button icon-action-danger"
            type="button"
            onClick={() => setConfirmingDelete(true)}
            title={t("Supprimer cette série")}
          >
            {icon('trash')}
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
                  <span className="stars-display" aria-label={t('{rating} sur 5', { rating: formatNumber(series.rating) })}>
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
                  <span className="rate-value">{formatNumber(series.rating)}/5</span>
                </>
              )}
              {series.isFavorite && <span className="heart-display on" aria-label={t("Coup de cœur")}>♥</span>}
            </div>
          )}
        </div>

        <div className="detail-body">
          <p className="eyebrow">{t(series.category === 'animation' ? "Animation japonaise" : "Série télé")}</p>
          <h1 className="display-title">{series.title}</h1>
          {(series.showrunner || progress || series.startedAt) && (
            <p className="detail-factline">
              {[series.showrunner, progress, series.startedAt ? t('débutée le {date}', { date: formatDate(series.startedAt, { dateStyle: 'long' }) }) : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          <dl className="detail-facts">
            {series.showrunner && (
              <div><dt>{t("Showrunner")}</dt><dd>{series.showrunner}</dd></div>
            )}
            {series.casting && (
              <div><dt>{t("Casting")}</dt><dd>{series.casting}</dd></div>
            )}
            {progress && (
              <div><dt>{t("Avancement")}</dt><dd>{progress}</dd></div>
            )}
            {series.startedAt && (
              <div><dt>{t("Début du visionnage")}</dt><dd>{formatDate(series.startedAt, { dateStyle: 'long' })}</dd></div>
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
                <button className="link-accent review-edit-link" type="button" onClick={onEdit}>{t("Modifier")}</button>
              </>
            ) : (
              <p className="mine-empty">{t("Ton avis s’écrira ici.")}</p>
            )}
          </section>
        </div>
      </article>

      {confirmingDelete && (
        <div className="confirm-backdrop">
          <div className="delete-confirmation" role="alertdialog" aria-labelledby="series-delete-title" aria-describedby="series-delete-description">
            <h2 id="series-delete-title">{t("Supprimer définitivement cette série ?")}</h2>
            <p id="series-delete-description">{t('« {title} » sera retirée de la collection sans possibilité de restauration.', { title: series.title })}</p>
            {deleteError && <p className="field-error" role="alert">{translateMessage(deleteError)}</p>}
            <div>
              <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>{t("Annuler")}</button>
              <button className="danger-button" type="button" onClick={deleteSeries} disabled={deleting}>
                {deleting ? t('Suppression…') : t("Supprimer définitivement")}
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
