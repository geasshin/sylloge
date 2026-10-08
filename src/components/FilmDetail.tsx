import { useEffect, useState } from 'react'
import { FILM_STATUS_LABELS, type Film } from '../domain/film.ts'
import {
  getFilmTmdbCache,
  removeTmdbAssociation,
  setFilmTmdbPoster,
  type CachedFilmTmdbPresentation,
} from '../data/tmdbService.ts'
import { Poster } from './Poster.tsx'
import { TmdbPosterDialog } from './TmdbPosterDialog.tsx'
import { StatusBadge } from './VerdictControls.tsx'
import { icon } from '../main.tsx'

function formatWatchedDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
}

type FilmDetailProps = {
  film: Film
  onBack: () => void
  backLabel: string
  onEdit: () => void
  onDelete: () => Promise<void>
  onAssociateTmdb: () => void
  tmdbNotice?: string | null
}

export function FilmDetail({ film, onBack, backLabel, onEdit, onDelete, onAssociateTmdb, tmdbNotice = null }: FilmDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [tmdbCache, setTmdbCache] = useState<CachedFilmTmdbPresentation | null>(null)
  const [tmdbLoading, setTmdbLoading] = useState(true)
  const [removingAssociation, setRemovingAssociation] = useState(false)
  const [showPosterGallery, setShowPosterGallery] = useState(false)
  const [savingPoster, setSavingPoster] = useState(false)

  const displayPosterUrl = tmdbCache?.selectedPosterUrl ?? tmdbCache?.presentation.posterUrl ?? film.posterUrl
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
          <button className="icon-action-button" type="button" onClick={onEdit} title="Modifier la fiche">
            {icon('pencil')}
            <span>Modifier</span>
          </button>
          {tmdbCache ? (
            // 0.6.11 : plus de « Rafraîchir » — un film associé expose
            // Dissocier ; le bouton baguette reste l'entrée d'association.
            <button className="icon-action-button" type="button" onClick={() => void handleRemoveAssociation()} disabled={removingAssociation} title="Dissocier TMDB">
              {removingAssociation ? 'Dissociation…' : null}
              {!removingAssociation && icon('unlink')}
              <span>Dissocier</span>
            </button>
          ) : (
            <button className="icon-action-button" type="button" onClick={onAssociateTmdb} title="Associer à TMDB (recherche assistée)">
              {icon('wand')}
              <span>Associer</span>
            </button>
          )}
          <button
            className="icon-action-button icon-action-danger"
            type="button"
            onClick={() => setConfirmingDelete(true)}
            title="Supprimer ce film"
          >
            {icon('trash')}
          </button>
        </div>
      </header>

      <article className="detail-layout">
        {/* Colonne gauche : l'œuvre objet + ton verdict dessous */}
        <div className="detail-side">
          <div className="poster-container detail-poster-wrap">
            <Poster title={displayTitle} src={displayPosterUrl} className="detail-poster" />
            {allPosters.length > 1 && (
              <button
                className="poster-edit-button"
                type="button"
                onClick={() => setShowPosterGallery(true)}
                aria-label="Choisir une autre affiche"
              >
                ✎
              </button>
            )}
          </div>
          <div className="detail-status">
            <StatusBadge status={film.status} labels={FILM_STATUS_LABELS} />
          </div>
          {(film.rating !== null || film.isFavorite) && (
            <div className="detail-rate">
              {film.rating !== null && (
                <>
                  <span className="stars-display" aria-label={`Note ${film.rating} sur 5`}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      const fill = Math.max(0, Math.min(1, film.rating! - star + 1))
                      return (
                        <span key={star} className={`star-slot ${fill > 0 ? 'filled' : ''}`}>
                          <span className="star-glyph" aria-hidden="true">★</span>
                          <span className="star-fill" style={{ width: `${fill * 100}%` }} aria-hidden="true">★</span>
                        </span>
                      )
                    })}
                  </span>
                  <span className="rate-value">{film.rating.toLocaleString('fr-FR')}/5</span>
                </>
              )}
              {film.isFavorite && <span className="heart-display on" aria-label="Coup de cœur">♥</span>}
            </div>
          )}
        </div>

        {showPosterGallery && (
          <TmdbPosterDialog
            title={displayTitle}
            posters={allPosters}
            selectedUrl={tmdbCache?.selectedPosterUrl ?? null}
            saving={savingPoster}
            onSelect={handleSelectPoster}
            onClose={() => setShowPosterGallery(false)}
          />
        )}

        {/* Bloc œuvre puis partie personnelle, dans la même respiration */}
        <div className="detail-body">
          <p className="eyebrow">Film</p>
          <h1 className="display-title">{displayTitle}</h1>
          {displayOriginalTitle && displayOriginalTitle !== displayTitle && (
            <p className="original-title">{displayOriginalTitle}</p>
          )}
          {(displayYear || displayRuntime) && (
            <p className="detail-factline">
              {[displayYear, displayRuntime].filter(Boolean).join(' · ')}
            </p>
          )}

          <dl className="detail-facts">
            {displayDirector && (
              <div><dt>Réalisation</dt><dd>{displayDirector}</dd></div>
            )}
            {displayCast && (
              <div><dt>Distribution</dt><dd>{displayCast}</dd></div>
            )}
            {displayYear && (
              <div><dt>Sortie</dt><dd>{displayYear}</dd></div>
            )}
            {displayRuntime && (
              <div><dt>Durée</dt><dd>{displayRuntime}</dd></div>
            )}
          </dl>

          {tmdbNotice && <p className="inline-report error" role="alert">{tmdbNotice}</p>}
          {tmdbLoading && <p className="detail-loading" role="status">Lecture de l’association…</p>}

          {!tmdbLoading && synopsis && (
            <div className="synopsis-block">
              <p>{synopsis}</p>
            </div>
          )}

          {!tmdbLoading && (
            <p className="detail-attribution-line">
              {tmdbCache ? (
                <>
                  Présentation enrichie par{' '}
                  <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>
                  {/* 0.6.11 : plus de « Rafraîchir », la gestion passe
                      exclusivement par Associer/Dissocier. */}
                  <button className="link-subtle" type="button" onClick={handleRemoveAssociation} disabled={removingAssociation}>
                    {removingAssociation ? 'Dissociation…' : 'Dissocier'}
                  </button>
                </>
              ) : (
                <>
                  Aucune métadonnée TMDB associée
                  <button className="link-subtle" type="button" onClick={onAssociateTmdb}>Associer</button>
                </>
              )}
            </p>
          )}

          <section className="mine-block">
            {film.watchedAt && (
              <p className="mine-date">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                Vu le <b>{formatWatchedDate(film.watchedAt)}</b>
              </p>
            )}
            {film.personalNote ? (
              <>
                <blockquote className="review-personal">{film.personalNote}</blockquote>
                <button className="link-accent review-edit-link" type="button" onClick={onEdit}>Modifier</button>
              </>
            ) : (
              <p className="mine-empty">Ta critique s’écrira ici après visionnage.</p>
            )}
          </section>
        </div>
      </article>

      {confirmingDelete && (
        <div className="confirm-backdrop">
          <div className="delete-confirmation" role="alertdialog" aria-labelledby="delete-title" aria-describedby="delete-description">
            <h2 id="delete-title">Supprimer définitivement ce film ?</h2>
            <p id="delete-description">« {film.title} » sera retiré de la collection sans possibilité de restauration.</p>
            {deleteError && <p className="field-error" role="alert">{deleteError}</p>}
            <div>
              <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Annuler</button>
              <button className="danger-button" type="button" onClick={deleteFilm} disabled={deleting}>
                {deleting ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
