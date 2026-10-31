import { useState } from 'react'
import {
  formatAirPeriod,
  SERIES_STATUS_LABELS,
  type Series,
} from '../domain/series.ts'
import { t, formatDate, formatNumber, translateMessage } from '../i18n/core.ts'
import { Poster } from './Poster.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { DetailVerdict } from './VerdictControls.tsx'
import { DetailLayout } from './DetailLayout.tsx'
import { verdictLine } from '../domain/verdictLine.ts'
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

  // Toutes les informations dans la grille, sous le même filet : qui et quand
  // d'abord, puis le casting et l'avancement (31 octobre 2026).
  const airPeriod = formatAirPeriod(series.firstAirYear, series.lastAirYear)

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
          <DetailVerdict
            rating={series.rating}
            favorite={series.isFavorite}
            status={series.status}
            line={verdictLine({
              status: t(SERIES_STATUS_LABELS[series.status]),
              date: series.startedAt ? formatDate(series.startedAt, { dateStyle: 'long' }) : null,
              mode: 'started-f',
              matches: series.status === 'en cours',
              dateLabel: t("Début du visionnage"),
            })}
          />
        )}
        heading={(
          <>
            <p className="eyebrow">{t(series.category === 'animation' ? "Animation japonaise" : "Série télé")}</p>
            <h1 className="display-title">{series.title}</h1>
          </>
        )}
        facts={(
          <dl className="detail-facts">
            {series.showrunner && (
              <div><dt>{t("Création")}</dt><dd>{series.showrunner}</dd></div>
            )}
            {airPeriod && (
              <div><dt>{t("Diffusion")}</dt><dd>{airPeriod}</dd></div>
            )}
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
