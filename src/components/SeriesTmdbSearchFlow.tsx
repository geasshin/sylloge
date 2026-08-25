import { useEffect, useState } from 'react'
import {
  searchTmdbSeries,
  type TmdbSearchCandidate,
} from '../data/tmdbService.ts'
import { Poster } from './Poster.tsx'

type SeriesTmdbSearchFlowProps = {
  /** Fiche ouverte derrière la pop-up : contexte d'association, titre prérempli. */
  existing?: { title: string; posterUrl: string | null } | null
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

/**
 * Recherche Séries TMDB (jalon 0.4.26), même structure que le parcours Films :
 * suggestions temporisées pendant la saisie, clic direct sur un résultat,
 * issue manuelle toujours accessible. Le mode « fiche existante » reprend
 * le parcours d'association des films : titre prérempli, encart contexte,
 * rendu compact dans la même pop-up floutée.
 */
export function SeriesTmdbSearchFlow({ existing = null, pendingCandidateId = null, selectionError = null, onSelectCandidate, onManual, onCancel, compact = false }: SeriesTmdbSearchFlowProps) {
  const [query, setQuery] = useState(() => existing?.title ?? '')
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' })

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
      searchTmdbSeries(trimmed).then(
        (candidates) => {
          if (!cancelled) setSearchState({ status: 'results', candidates })
        },
        (error: unknown) => {
          console.error('La recherche TMDB Séries a échoué.', error)
          if (!cancelled) {
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
            {existing ? '← Retour à la fiche' : '← Annuler'}
          </button>
        </header>
      )}

      <div className="editor-heading">
        <p className="eyebrow">Série</p>
        <h1 className="display-title">{existing ? 'Modifier l’association' : 'Rechercher une série'}</h1>
        <p>
          {existing
            ? `Recherchez une autre correspondance TMDB pour « ${existing.title} ».`
            : 'Recherchez une série dans TMDB et choisissez la bonne correspondance : le formulaire s’ouvre directement prérempli.'}
        </p>
      </div>

      {existing && (
        <section className="tmdb-film-context" aria-labelledby="series-tmdb-context-title">
          <Poster title={existing.title} src={existing.posterUrl} className="tmdb-film-context-poster" />
          <div className="tmdb-film-context-info">
            <p className="card-kicker">Fiche actuelle</p>
            <h2 id="series-tmdb-context-title">{existing.title}</h2>
            <p>Cette fiche reste le contexte de l’association. Seuls ses champs éditoriaux seront mis à jour ; tes données personnelles ne bougent pas.</p>
          </div>
        </section>
      )}

      <form className="tmdb-search-form" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label htmlFor="series-tmdb-search-query">Titre de la série</label>
          <input
            id="series-tmdb-search-query"
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
          <button className="secondary-button" type="button" onClick={onManual}>
            {existing ? 'Retour à la fiche' : 'Saisir manuellement'}
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
        <div className="results-state" role="status">Préparation de la mise à jour…</div>
      )}

      {selectionError !== null && pendingCandidateId === null && (
        <div className="results-state error-state" role="alert">
          <p>{selectionError}</p>
        </div>
      )}

      {searchState.status === 'results' && (
        <section className="tmdb-search-results" aria-labelledby="series-tmdb-results-title">
          <h2 id="series-tmdb-results-title">
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
    <main className="main editor-main" aria-label="Recherche TMDB Séries">
      {body}
    </main>
  )
}
