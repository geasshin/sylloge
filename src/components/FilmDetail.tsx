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
}

export function FilmDetail({ film, onBack, backLabel, onEdit, onDelete, onAssociateTmdb }: FilmDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [tmdbCache, setTmdbCache] = useState<CachedFilmTmdbPresentation | null>(null)
  const [tmdbLoading, setTmdbLoading] = useState(true)
  const [removingAssociation, setRemovingAssociation] = useState(false)
  const [showPosterGallery, setShowPosterGallery] = useState(false)
  const [savingPoster, setSavingPoster] = useState(false)
  const attribution = [film.director, film.year].filter((value) => value !== null).join(' · ')
  const displayPosterUrl = tmdbCache?.selectedPosterUrl ?? tmdbCache?.presentation.posterUrl ?? film.posterUrl
  const displayTitle = tmdbCache?.presentation.title ?? film.title
  const displayOriginalTitle = tmdbCache?.presentation.originalTitle ?? film.originalTitle
  const displayDirector = tmdbCache?.presentation.directors.join(', ') || film.director
  const displayYear = tmdbCache?.presentation.releaseDate?.split('-')[0] ?? film.year
  const displayRuntime = tmdbCache?.presentation.runtimeMinutes
    ? `${Math.floor(tmdbCache.presentation.runtimeMinutes / 60)}h ${String(tmdbCache.presentation.runtimeMinutes % 60).padStart(2, '0')}min`
    : null

  const displayAttribution = [displayDirector, displayYear].filter((value) => value !== null).join(' · ')
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
        <button className="back-button" type="button" onClick={onBack}>{backLabel}</button>
        <button className="secondary-button" type="button" onClick={onEdit}>Modifier</button>
      </header>

      <article className="film-detail">
        <div className="film-detail-visual">
          <div className="poster-container">
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

        <div className="film-detail-content">
          <p className="eyebrow">Film</p>
          <h1 className="display-title">{displayTitle}</h1>
          {displayOriginalTitle && displayOriginalTitle !== displayTitle && (
            <p className="original-title">{displayOriginalTitle}</p>
          )}
          {displayAttribution && <p className="detail-attribution">{displayAttribution}</p>}
          {displayRuntime && <p className="detail-runtime">{displayRuntime}</p>}

          {/* Section TMDB */}
          <section className="tmdb-section" aria-labelledby="tmdb-section-title">
            <div className="tmdb-section-heading">
              <h2 id="tmdb-section-title">Métadonnées TMDB</h2>
              {tmdbCache && (
                <span className="tmdb-badge">Associé</span>
              )}
            </div>
            {tmdbLoading ? (
              <p role="status">Lecture de l'association…</p>
            ) : tmdbCache ? (
              <div className="tmdb-associated">
                {tmdbCache.presentation.synopsis && (
                  <div className="tmdb-synopsis">
                    <h3>Synopsis</h3>
                    <p>{tmdbCache.presentation.synopsis}</p>
                  </div>
                )}
                {tmdbCache.presentation.cast.length > 0 && (
                  <div className="tmdb-cast">
                    <h3>Casting principal</h3>
                    <ul>
                      {tmdbCache.presentation.cast.slice(0, 6).map((member, index) => (
                        <li key={index}>
                          {member.portraitUrl && (
                            <img
                              className="cast-portrait"
                              src={member.portraitUrl}
                              alt=""
                              loading="lazy"
                            />
                          )}
                          <span className="cast-info">
                            <b>{member.name}</b>
                            {member.character && <small>{member.character}</small>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="tmdb-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={onAssociateTmdb}
                  >
                    Modifier l'association
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={handleRemoveAssociation}
                    disabled={removingAssociation}
                  >
                    {removingAssociation ? 'Suppression…' : 'Retirer l\'association'}
                  </button>
                </div>
                <p className="tmdb-attribution">
                  Métadonnées et images fournies par{' '}
                  <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
                    TMDB
                  </a>
                  . Ce produit utilise l’API TMDB sans être approuvé ni certifié par TMDB.
                </p>
              </div>
            ) : (
              <div className="tmdb-not-associated">
                <p>Aucune métadonnée TMDB associée.</p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={onAssociateTmdb}
                >
                  Associer à TMDB
                </button>
              </div>
            )}
          </section>

          <dl className="film-facts">
            <div>
              <dt>Statut</dt>
              <dd>{FILM_STATUS_LABELS[film.status]}</dd>
            </div>
            {film.isFavorite && (
              <div>
                <dt>Collection</dt>
                <dd>Favori</dd>
              </div>
            )}
            {film.rating !== null && (
              <div>
                <dt>Note</dt>
                <dd>{film.rating.toLocaleString('fr-FR')} / 5</dd>
              </div>
            )}
            {film.watchedAt && (
              <div>
                <dt>Visionnage</dt>
                <dd>{formatWatchedDate(film.watchedAt)}</dd>
              </div>
            )}
          </dl>

          {film.summary && (
            <section className="reading-section">
              <h2>Résumé</h2>
              <p>{film.summary}</p>
            </section>
          )}

          {film.personalNote && (
            <section className="reading-section personal-reading">
              <h2>Texte personnel</h2>
              <p>{film.personalNote}</p>
            </section>
          )}

          <section className="delete-section">
            {!confirmingDelete ? (
              <button className="delete-link" type="button" onClick={() => setConfirmingDelete(true)}>Supprimer ce film</button>
            ) : (
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
            )}
          </section>
        </div>
      </article>
    </main>
  )
}
