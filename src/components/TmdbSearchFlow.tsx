import { useEffect, useState } from 'react'
import {
  searchTmdbFilms,
  resolveFilmDisplayPoster,
  type TmdbSearchCandidate,
} from '../data/tmdbService.ts'
import type { Film } from '../domain/film.ts'
import { Poster } from './Poster.tsx'

type TmdbSearchFlowProps = {
  film?: Film | null
  /** Candidat en cours de traitement : la liste se fige pendant la préparation. */
  pendingCandidateId?: number | null
  /** Échec de la sélection directe, annoncé sans quitter la recherche. */
  selectionError?: string | null
  onSelectCandidate: (candidate: TmdbSearchCandidate) => void
  onManual: () => void
  onCancel: () => void
  /** Rendu compact dans une pop-up : sans <main>, ni barre d'action, ni titre répété. */
  compact?: boolean
}

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'results'; candidates: TmdbSearchCandidate[] }
  | { status: 'error'; message: string }

export function TmdbSearchFlow({ film = null, pendingCandidateId = null, selectionError = null, onSelectCandidate, onManual, onCancel, compact = false }: TmdbSearchFlowProps) {
  const [query, setQuery] = useState(() => film?.title ?? '')
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' })
  // Fiche de contexte : elle montre la même affiche que la bibliothèque, donc
  // la sélection TMDB quand elle existe plutôt que le seul champ manuel.
  const [contextPoster, setContextPoster] = useState<string | null>(film?.posterUrl ?? null)

  useEffect(() => {
    setContextPoster(film?.posterUrl ?? null)
    if (!film) return
    let cancelled = false
    resolveFilmDisplayPoster(film.id, film.posterUrl).then((url) => {
      if (!cancelled) setContextPoster(url)
    })
    return () => { cancelled = true }
  }, [film?.id, film?.posterUrl])

  useEffect(() => {
    let cancelled = false
    const trimmed = query.trim()

    if (trimmed.length === 0) {
      setSearchState({ status: 'idle' })
      return () => {
        cancelled = true
      }
    }

    setSearchState({ status: 'searching' })
    const timeout = window.setTimeout(() => {
      searchTmdbFilms(trimmed).then(
        (candidates) => {
          if (!cancelled) setSearchState({ status: 'results', candidates })
        },
        (error: unknown) => {
          console.error('La recherche TMDB a échoué.', error)
          if (!cancelled) {
            // Le backend décrit la cause réelle (réseau, panne du fournisseur,
            // erreur HTTP) : on l'affiche telle quelle au lieu de deviner.
            const providerMessage = typeof error === 'string' && error.trim().length > 0 ? error : null
            setSearchState({
              status: 'error',
              message: providerMessage ?? 'La recherche a échoué. Vérifiez votre connexion puis réessayez.',
            })
          }
        },
      )
    }, 320)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [query])

  const body = (
    <>
      {!compact && (
        <header className="page-action-bar">
          <button className="back-button" type="button" onClick={onCancel}>
            {film ? '← Retour à la fiche' : '← Annuler'}
          </button>
        </header>
      )}

      <div className="editor-heading">
        <p className="eyebrow">Film</p>
        <h1 className="display-title">{film ? 'Modifier l’association' : 'Rechercher un film'}</h1>
        <p>
          {film
            ? `Recherchez une autre correspondance TMDB pour « ${film.title} ».`
            : 'Recherchez un film dans TMDB et choisissez la bonne correspondance : le formulaire s’ouvre directement prérempli.'}
        </p>
      </div>

      {film && (
        <section className="tmdb-film-context" aria-labelledby="tmdb-film-context-title">
          <Poster title={film.title} src={contextPoster} className="tmdb-film-context-poster" />
          <div className="tmdb-film-context-info">
            <p className="card-kicker">Fiche actuelle</p>
            <h2 id="tmdb-film-context-title">{film.title}</h2>
            <p>Cette fiche reste le contexte de l’association. Ses données personnelles ne seront pas modifiées ici.</p>
          </div>
        </section>
      )}

      <form className="tmdb-search-form" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label htmlFor="tmdb-search-query">Titre du film</label>
          <input
            id="tmdb-search-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher dans TMDB…"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-busy={searchState.status === 'searching'}
          />
          <p className="field-help">
            {searchState.status === 'searching' ? 'Recherche dans TMDB…' : 'Les suggestions se mettent à jour pendant la saisie.'}
          </p>
        </div>
        <div className="form-actions">
          {/* Toujours visible, y compris en pop-up (0.6.11) : l'issue manuelle
              ne doit jamais dépendre d'un mode de rendu. */}
          <button className="secondary-button" type="button" onClick={onManual}>
            {film ? 'Retour à la fiche' : 'Saisir manuellement'}
          </button>
        </div>
      </form>

      {searchState.status === 'error' && (
        <div className="results-state error-state" role="alert">
          <h2>La recherche a échoué.</h2>
          <p>{searchState.message}</p>
        </div>
      )}

      {pendingCandidateId !== null && (
        <div className="results-state" role="status">Préparation de la fiche…</div>
      )}

      {selectionError !== null && pendingCandidateId === null && (
        <div className="results-state error-state" role="alert">
          <p>{selectionError}</p>
        </div>
      )}

      {searchState.status === 'results' && (
        <section className="tmdb-search-results" aria-labelledby="tmdb-results-title">
          <h2 id="tmdb-results-title">
            {searchState.candidates.length === 0
              ? 'Aucun résultat'
              : `${searchState.candidates.length} ${searchState.candidates.length === 1 ? 'résultat' : 'résultats'}`}
          </h2>
          {searchState.candidates.length === 0 ? (
            <p>Essayez un titre différent ou passez à la saisie manuelle.</p>
          ) : (
            <div className="tmdb-candidates-grid">
              {searchState.candidates.map((candidate) => (
                <button
                  key={candidate.tmdbId}
                  className="tmdb-candidate-card"
                  type="button"
                  disabled={pendingCandidateId !== null}
                  aria-busy={pendingCandidateId === candidate.tmdbId}
                  onClick={() => onSelectCandidate(candidate)}
                >
                  <Poster
                    title={candidate.title}
                    src={candidate.posterUrl}
                    className="tmdb-candidate-poster"
                  />
                  <span className="tmdb-candidate-info">
                    <b>{candidate.title}</b>
                    {candidate.originalTitle && candidate.originalTitle !== candidate.title && (
                      <small>{candidate.originalTitle}</small>
                    )}
                    {candidate.releaseYear && <small>{candidate.releaseYear}</small>}
                    {candidate.synopsis && (
                      <small className="tmdb-candidate-synopsis">
                        {candidate.synopsis.length > 120
                          ? `${candidate.synopsis.slice(0, 120)}…`
                          : candidate.synopsis}
                      </small>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )

  if (compact) {
    return <div className="tmdb-search-compact">{body}</div>
  }

  return (
    <main className="main editor-main" aria-label="Recherche TMDB">
      {body}
    </main>
  )
}
