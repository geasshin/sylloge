import { useEffect, useState } from 'react'
import {
  searchOpenLibraryBooks,
  type OpenLibraryBookCandidate,
} from '../data/openLibraryService.ts'
import { Poster } from './Poster.tsx'

type BookOpenLibrarySearchFlowProps = {
  /** Candidat en cours de traitement : la liste se fige pendant la préparation. */
  pendingCandidateKey?: string | null
  /** Échec de la sélection directe, annoncé sans quitter la recherche. */
  selectionError?: string | null
  onSelectCandidate: (candidate: OpenLibraryBookCandidate) => void
  onManual: () => void
  onCancel: () => void
}

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'results'; candidates: OpenLibraryBookCandidate[] }
  | { status: 'error'; message: string }

/**
 * Recherche Livres Open Library (jalon 0.4.27), même structure que le
 * parcours Films : suggestions temporisées pendant la saisie, clic direct
 * sur un résultat, issue manuelle toujours accessible. Aucune clé requise.
 */
export function BookOpenLibrarySearchFlow({ pendingCandidateKey = null, selectionError = null, onSelectCandidate, onManual, onCancel }: BookOpenLibrarySearchFlowProps) {
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
      searchOpenLibraryBooks(trimmed).then(
        (candidates) => {
          if (!cancelled) setSearchState({ status: 'results', candidates })
        },
        (error: unknown) => {
          console.error('La recherche Open Library a échoué.', error)
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
    <main className="main editor-main" aria-label="Recherche Open Library">
      <header className="page-action-bar">
        <button className="back-button" type="button" onClick={onCancel}>← Annuler</button>
      </header>

      <div className="editor-heading">
        <p className="eyebrow">Livre</p>
        <h1 className="display-title">Rechercher un livre</h1>
        <p>Recherchez un livre dans Open Library et choisissez la bonne correspondance : le formulaire s’ouvre directement prérempli.</p>
      </div>

      <form className="tmdb-search-form" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label htmlFor="book-ol-search-query">Titre du livre</label>
          <input
            id="book-ol-search-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher dans Open Library…"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-busy={searchState.status === 'searching'}
          />
          <p className="field-help">
            {searchState.status === 'searching' ? 'Recherche dans Open Library…' : 'Les suggestions se mettent à jour pendant la saisie.'}
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

      {pendingCandidateKey !== null && (
        <div className="results-state" role="status">Préparation de la fiche…</div>
      )}

      {selectionError !== null && pendingCandidateKey === null && (
        <div className="results-state error-state" role="alert">
          <p>{selectionError}</p>
        </div>
      )}

      {searchState.status === 'results' && (
        <section className="tmdb-search-results" aria-labelledby="book-ol-results-title">
          <h2 id="book-ol-results-title">
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
                  key={candidate.workKey}
                  className="tmdb-candidate-card"
                  type="button"
                  disabled={pendingCandidateKey !== null}
                  aria-busy={pendingCandidateKey === candidate.workKey}
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
                    {candidate.author && <small>{candidate.author}</small>}
                    {candidate.firstPublishYear && <small>{candidate.firstPublishYear}</small>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  )
}
