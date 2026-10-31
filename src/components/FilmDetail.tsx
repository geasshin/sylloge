import { useEffect, useState } from 'react'
import { FILM_STATUS_LABELS, type Film } from '../domain/film.ts'
import { isCustomFilmPoster, resolveFilmPoster } from '../domain/filmPoster.ts'
import {
  getFilmTmdbCache,
  removeTmdbAssociation,
  setFilmTmdbPoster,
  type CachedFilmTmdbPresentation,
} from '../data/tmdbService.ts'
import { t, formatDate, translateMessage } from '../i18n/core.ts'
import { Poster } from './Poster.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { TmdbPosterDialog } from './TmdbPosterDialog.tsx'
import { DetailVerdict } from './VerdictControls.tsx'
import { DetailLayout } from './DetailLayout.tsx'
import { verdictLine } from '../domain/verdictLine.ts'
import { BannerAddButton, DetailBanner } from './DetailBanner.tsx'
import { useBannerEditor } from './useBannerEditor.tsx'
import { icon } from '../main.tsx'

type FilmDetailProps = {
  film: Film
  onBack: () => void
  backLabel: string
  onEdit: () => void
  onDelete: () => Promise<void>
  onAssociateTmdb: () => void
  /** Enregistre (ou retire, avec null) l'adresse de l'affiche dans la colonne locale de la fiche. */
  onPosterChange: (url: string | null) => Promise<void>
  /** Enregistre (ou retire, avec null) la bannière 16:9 de la fiche. */
  onBannerChange?: (url: string | null) => Promise<void> | void
  /** Enregistre le recadrage vertical de la bannière (v9). */
  onBannerPositionChange?: (position: number) => Promise<void> | void
  tmdbNotice?: string | null
}

export function FilmDetail({ film, onBack, backLabel, onEdit, onDelete, onAssociateTmdb, onPosterChange, onBannerChange, onBannerPositionChange, tmdbNotice = null }: FilmDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [tmdbCache, setTmdbCache] = useState<CachedFilmTmdbPresentation | null>(null)
  const [tmdbLoading, setTmdbLoading] = useState(true)
  const [removingAssociation, setRemovingAssociation] = useState(false)
  const [showPosterGallery, setShowPosterGallery] = useState(false)
  const [savingPoster, setSavingPoster] = useState(false)
  const [posterUrlOpen, setPosterUrlOpen] = useState(false)

  // Même règle que le formulaire, l'accueil et les cartes : domain/filmPoster.ts.
  const displayPosterUrl = resolveFilmPoster(film.posterUrl, tmdbCache)
  const customPosterUrl = isCustomFilmPoster(film.posterUrl, tmdbCache) ? film.posterUrl : null
  const displayTitle = tmdbCache?.presentation.title ?? film.title
  const displayOriginalTitle = tmdbCache?.presentation.originalTitle ?? film.originalTitle
  const displayDirector = tmdbCache?.presentation.directors.join(', ') || film.director
  const displayYear = tmdbCache?.presentation.releaseDate?.split('-')[0] ?? film.year
  const displayRuntime = tmdbCache?.presentation.runtimeMinutes
    ? `${Math.floor(tmdbCache.presentation.runtimeMinutes / 60)} h ${String(tmdbCache.presentation.runtimeMinutes % 60).padStart(2, '0')}`
    : null
  const displayCast = tmdbCache?.presentation.cast.length
    ? tmdbCache.presentation.cast.slice(0, 3).map((member) => member.name).join(', ')
    : null
  const synopsis = tmdbCache?.presentation.synopsis ?? film.summary
  const allPosters = tmdbCache
    ? [tmdbCache.presentation.posterUrl, ...tmdbCache.presentation.alternativePosterUrls].filter(Boolean) as string[]
    : []
  // Le film porte lui-même son identifiant TMDB ; le cache le confirme quand il
  // existe. Sans association, la fenêtre ne proposera que l'adresse collée.
  const bannerProviderId = tmdbCache
    ? String(tmdbCache.presentation.tmdbId)
    : film.providerName?.toLowerCase() === 'tmdb' ? film.providerId : null
  const bannerEditor = useBannerEditor({
    title: displayTitle,
    medium: 'film',
    providerId: bannerProviderId,
    currentUrl: film.bannerUrl,
    onSave: (url) => onBannerChange?.(url),
  })

  useEffect(() => {
    let cancelled = false
    setTmdbLoading(true)

    getFilmTmdbCache(film.id).then(
      (cache) => {
        if (!cancelled) setTmdbCache(cache)
      },
      (error: unknown) => {
        console.error('Impossible de lire le cache TMDB.', error)
        if (!cancelled) setTmdbCache(null)
      },
    ).finally(() => {
      if (!cancelled) setTmdbLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [film.id])

  const handleSelectPoster = async (url: string | null) => {
    setSavingPoster(true)
    try {
      const updated = await setFilmTmdbPoster(film.id, url)
      setTmdbCache(updated)
      // L'adresse de la fiche suit le choix : un lien personnel resté en colonne locale
      // masquerait sinon l'affiche que l'on vient de choisir, et la galerie n'est pas dans la
      // sauvegarde JSON alors que l'adresse locale y est.
      await onPosterChange(url)
    } catch (error) {
      console.error('Impossible d\'enregistrer le choix d\'affiche.', error)
    } finally {
      setSavingPoster(false)
    }
  }

  const handleRemoveAssociation = async () => {
    setRemovingAssociation(true)
    try {
      await removeTmdbAssociation(film.id)
      setTmdbCache(null)
    } catch (error) {
      console.error('Impossible de supprimer l\'association TMDB.', error)
    } finally {
      setRemovingAssociation(false)
    }
  }

  const deleteFilm = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch (error) {
      console.error('Impossible de supprimer le film.', error)
      setDeleteError('La suppression a échoué. Le film est toujours dans la collection.')
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
          {tmdbCache ? (
            // 0.6.11 : plus de « Rafraîchir » — un film associé expose
            // Dissocier ; le bouton baguette reste l'entrée d'association.
            <button className="icon-action-button" type="button" onClick={() => void handleRemoveAssociation()} disabled={removingAssociation} title={t("Dissocier TMDB")}>
              {removingAssociation ? t('Dissociation…') : null}
              {!removingAssociation && icon('unlink')}
              <span>{t("Dissocier")}</span>
            </button>
          ) : (
            <button className="icon-action-button" type="button" onClick={onAssociateTmdb} title={t("Associer à TMDB (recherche assistée)")}>
              {icon('wand')}
              <span>{t("Associer")}</span>
            </button>
          )}
          {!film.bannerUrl && onBannerChange && <BannerAddButton {...bannerEditor.addProps} />}
          <button
            className="icon-action-button icon-action-danger"
            type="button"
            onClick={() => setConfirmingDelete(true)}
            title={t("Supprimer ce film")}
          >
            {icon('trash')}
          </button>
        </div>
      </header>

      <DetailLayout
        banner={film.bannerUrl ? (
          <DetailBanner
            title={displayTitle}
            bannerUrl={film.bannerUrl}
            bannerPosition={film.bannerPosition}
            {...(onBannerChange ? bannerEditor.bannerProps : {})}
            {...(onBannerPositionChange ? { onReposition: onBannerPositionChange } : {})}
          />
        ) : undefined}
        visual={(
          <div className="poster-container detail-poster-wrap">
            <Poster
              title={displayTitle}
              src={displayPosterUrl}
              className="detail-poster"
              sharp
              onEdit={() => (allPosters.length > 1 ? setShowPosterGallery(true) : setPosterUrlOpen(true))}
            />
          </div>
        )}
        verdict={(
          <DetailVerdict
            rating={film.rating}
            favorite={film.isFavorite}
            status={film.status}
            line={verdictLine({
              status: t(FILM_STATUS_LABELS[film.status]),
              date: film.watchedAt ? formatDate(film.watchedAt, { dateStyle: 'long' }) : null,
              mode: 'reached',
              matches: film.status === 'terminé' || film.status === 'abandonné',
              dateLabel: t("Vu le"),
            })}
          />
        )}
        heading={(
          <>
            <h1 className="display-title">{displayTitle}</h1>
            {displayOriginalTitle && displayOriginalTitle !== displayTitle && (
              <p className="original-title">{displayOriginalTitle}</p>
            )}
          </>
        )}
        facts={(
          <>
            {/* Toutes les informations dans la grille, sous le même filet :
                qui et quand d'abord, puis le reste (31 octobre 2026). */}
            <dl className="detail-facts">
              {displayDirector && (
                <div><dt>{t("Réalisation")}</dt><dd>{displayDirector}</dd></div>
              )}
              {displayYear && (
                <div><dt>{t("Année")}</dt><dd>{displayYear}</dd></div>
              )}
              {displayCast && (
                <div><dt>{t("Casting")}</dt><dd>{displayCast}</dd></div>
              )}
              {displayRuntime && (
                <div><dt>{t("Durée")}</dt><dd>{displayRuntime}</dd></div>
              )}
            </dl>

            {tmdbNotice && <p className="inline-report error" role="alert">{tmdbNotice}</p>}
            {tmdbLoading && <p className="detail-loading" role="status">{t("Lecture de l’association…")}</p>}
          </>
        )}
        synopsis={!tmdbLoading && synopsis && (
          <div className="synopsis-block">
            <p>{synopsis}</p>
          </div>
        )}
        /* Associer / Dissocier restent dans la barre d'actions ; l'attribution
           TMDB vit dans Paramètres › À propos (30 octobre 2026). */
        review={film.personalNote ? (
          <>
            <blockquote className="review-personal">{film.personalNote}</blockquote>
            <button className="link-accent review-edit-link" type="button" onClick={onEdit}>{t("Modifier")}</button>
          </>
        ) : (
          <p className="mine-empty">{t("Ta critique s’écrira ici après visionnage.")}</p>
        )}
      />

      {showPosterGallery && (
        <TmdbPosterDialog
          title={displayTitle}
          posters={allPosters}
          selectedUrl={customPosterUrl ?? tmdbCache?.selectedPosterUrl ?? null}
          saving={savingPoster}
          onSelect={handleSelectPoster}
          onCustom={onPosterChange}
          onClose={() => setShowPosterGallery(false)}
        />
      )}
      <PosterUrlDialog
        open={posterUrlOpen}
        title={displayTitle}
        label="Affiche"
        currentUrl={film.posterUrl}
        onClose={() => setPosterUrlOpen(false)}
        onSave={onPosterChange}
      />
      {bannerEditor.bannerDialog}

      {confirmingDelete && (
        <div className="confirm-backdrop">
          <div className="delete-confirmation" role="alertdialog" aria-labelledby="delete-title" aria-describedby="delete-description">
            <h2 id="delete-title">{t("Supprimer définitivement ce film ?")}</h2>
            <p id="delete-description">{t('« {title} » sera retiré de la collection sans possibilité de restauration.', { title: film.title })}</p>
            {deleteError && <p className="field-error" role="alert">{translateMessage(deleteError)}</p>}
            <div>
              <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>{t("Annuler")}</button>
              <button className="danger-button" type="button" onClick={deleteFilm} disabled={deleting}>
                {deleting ? t('Suppression…') : t("Supprimer définitivement")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
