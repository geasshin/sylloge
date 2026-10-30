import { useState } from 'react'
import {
  formatAirPeriod,
  SERIES_STATUS_LABELS,
  type Series,
} from '../domain/series.ts'
import { t, formatDate, formatNumber, translateMessage } from '../i18n/core.ts'
import { Poster } from './Poster.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { StatusBadge } from './VerdictControls.tsx'
import { DetailDate, DetailLayout } from './DetailLayout.tsx'
import { BannerAddButton, DetailBanner } from './DetailBanner.tsx'
import { useBannerEditor, useBannerProviderId } from './useBannerEditor.tsx'
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
  /** Enregistre (ou retire, avec null) la bannière 16:9 de la fiche. */
  onBannerChange?: (url: string | null) => Promise<void> | void
  onDelete: () => Promise<void>
}

export function SeriesDetail({ series, onBack, backLabel, onEdit, onPosterEdit, onAssociate, onBannerChange, onDelete }: SeriesDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [posterDialogOpen, setPosterDialogOpen] = useState(false)
  const bannerMedium = series.category === 'animation' ? 'anime' : 'series'
  const bannerProviderId = useBannerProviderId(series.profileId, bannerMedium, series.id)
  const bannerEditor = useBannerEditor({
    title: series.title,
    medium: bannerMedium,
    providerId: bannerProviderId,
    currentUrl: series.bannerUrl,
    onSave: (url) => onBannerChange?.(url),
  })

  const progress = series.seasonsSeen !== null
    ? series.seasonsTotal !== null
      ? t(series.seasonsSeen === 1 ? '{count} saison sur {total}' : '{count} saisons sur {total}', { count: series.seasonsSeen, total: series.seasonsTotal })
      : t(series.seasonsSeen === 1 ? '{count} saison vue' : '{count} saisons vues', { count: series.seasonsSeen })
    : null

  // Sous le titre : qui, et quand la série a été diffusée. L'avancement et le
  // casting vivent dans la grille juste en dessous, sans rien y répéter.
  const airPeriod = formatAirPeriod(series.firstAirYear, series.lastAirYear)
  const factline = [series.showrunner, airPeriod].filter(Boolean).join(' · ')

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
          {!series.bannerUrl && onBannerChange && <BannerAddButton {...bannerEditor.addProps} />}
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

      <DetailLayout
        banner={series.bannerUrl ? (
          <DetailBanner
            title={series.title}
            bannerUrl={series.bannerUrl}
            {...(onBannerChange ? bannerEditor.bannerProps : {})}
          />
        ) : undefined}
        visual={(
          <div className="poster-container detail-poster-wrap">
            <Poster title={series.title} src={series.posterUrl} className="detail-poster" sharp onEdit={onPosterEdit ? () => setPosterDialogOpen(true) : undefined} />
          </div>
        )}
        verdict={(
          <>
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
          </>
        )}
        heading={(
          <>
            <p className="eyebrow">{t(series.category === 'animation' ? "Animation japonaise" : "Série télé")}</p>
            <h1 className="display-title">{series.title}</h1>
            {/* Sous le titre : qui et quand. L'avancement vit dans la grille. */}
            {factline !== '' && <p className="detail-factline">{factline}</p>}
          </>
        )}
        facts={(
          <dl className="detail-facts">
            {series.casting && (
              <div><dt>{t("Casting")}</dt><dd>{series.casting}</dd></div>
            )}
            {progress && (
              <div><dt>{t("Avancement")}</dt><dd>{progress}</dd></div>
            )}
          </dl>
        )}
        synopsis={series.summary && (
          <div className="synopsis-block">
            <p>{series.summary}</p>
          </div>
        )}
        notebook={series.startedAt && (
          <DetailDate label={t("Début du visionnage")} value={formatDate(series.startedAt, { dateStyle: 'long' })} />
        )}
        review={series.personalNote ? (
          <>
            <blockquote className="review-personal">{series.personalNote}</blockquote>
            <button className="link-accent review-edit-link" type="button" onClick={onEdit}>{t("Modifier")}</button>
          </>
        ) : (
          <p className="mine-empty">{t("Ton avis s’écrira ici.")}</p>
        )}
      />

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
      {bannerEditor.bannerDialog}
    </main>
  )
}
