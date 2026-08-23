import { useEffect, useState } from 'react'
import {
  searchIgdbGames,
  type IgdbGameCandidate,
} from '../data/igdbService.ts'
import { Poster } from './Poster.tsx'

type GameIgdbSearchFlowProps = {
  /** Candidat en cours de traitement : la liste se fige pendant la préparation. */
  pendingCandidateId?: number | null
  /** Échec de la sélection directe, annoncé sans quitter la recherche. */
  selectionError?: string | null
  onSelectCandidate: (candidate: IgdbGameCandidate) => void
  onManual: () => void
  onCancel: () => void
}

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'results'; candidates: IgdbGameCandidate[] }
  | { status: 'error'; message: string }

/**
 * Recherche Jeux IGDB, même structure que le parcours Films : suggestions
 * temporisées pendant la saisie, clic direct sur un résultat, issue manuelle
 * toujours accessible. IGDB est gratuit pour un usage non commercial ; les
 * couvertures sont verticales (3:4).
 */
export function GameIgdbSearchFlow({ pendingCandidateId = null, selectionError = null, onSelectCandidate, onManual, onCancel }: GameIgdbSearchFlowProps) {
  const [query, setQuery] = useState('')
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' })

  useEffect(() => {
    let cancelled = false
    const trimmed = query.trim()

    if (trimmed.length < 2) {
      setSearchState({ status: 'idle' })
      return () => {
        cancelled = true
      }
    }

    setSearchState({ status: 'searching' })
    const timeout = window.setTimeout(() => {
      searchIgdbGames(trimmed).then(
        (candidates) => {
          if (!cancelled) setSearchState({ status: 'results', candidates })
        },
        (error: unknown) => {
          console.error('La recherche IGDB a échoué.', error)
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

  return (
    <main className="main editor-main" aria-label="Recherche IGDB">
      <header className="page-action-bar">
        <button className="back-button" type="button" onClick={onCancel}>← Annuler</button>
      </header>

      <div className="editor-heading">
        <p className="eyebrow">Jeu</p>
        <h1 className="display-title">Rechercher un jeu</h1>
        <p>Recherchez un jeu dans IGDB et choisissez la bonne correspondance : le formulaire s’ouvre directement prérempli.</p>
      </div>

      <form className="tmdb-search-form" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label htmlFor="game-igdb-search-query">Titre du jeu</label>
          <input
            id="game-igdb-search-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher dans IGDB…"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-busy={searchState.status === 'searching'}
          />
          <p className="field-help">
            {searchState.status === 'searching' ? 'Recherche dans IGDB…' : 'Les suggestions se mettent à jour pendant la saisie.'}
          </p>
        </div>
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onManual}>
            Saisir manuellement
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
        <section className="tmdb-search-results" aria-labelledby="game-igdb-results-title">
          <h2 id="game-igdb-results-title">
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
                  key={candidate.gameId}
                  className="tmdb-candidate-card"
                  type="button"
                  disabled={pendingCandidateId !== null}
                  aria-busy={pendingCandidateId === candidate.gameId}
                  onClick={() => onSelectCandidate(candidate)}
                >
                  <Poster
                    title={candidate.title}
                    src={candidate.coverUrl}
                    label="Couverture"
                    className="tmdb-candidate-poster"
                  />
                  <span className="tmdb-candidate-info">
                    <b>{candidate.title}</b>
                    {candidate.releaseYear && <small>{candidate.releaseYear}</small>}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="provider-attribution">
            Données : <a href="https://www.igdb.com" target="_blank" rel="noreferrer">IGDB</a> (opéré par Twitch)
          </p>
        </section>
      )}
    </main>
  )
}
