import { useState, type FormEvent } from 'react'
import {
  searchTmdbFilms,
  type TmdbSearchCandidate,
} from '../data/tmdbService.ts'
import { Poster } from './Poster.tsx'

type TmdbSearchFlowProps = {
  onSelectCandidate: (candidate: TmdbSearchCandidate) => void
  onManual: () => void
  onCancel: () => void
}

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'results'; candidates: TmdbSearchCandidate[] }
  | { status: 'error'; message: string }

export function TmdbSearchFlow({ onSelectCandidate, onManual, onCancel }: TmdbSearchFlowProps) {
  const [query, setQuery] = useState('')
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' })

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length === 0) return

    setSearchState({ status: 'searching' })
    try {
      const candidates = await searchTmdbFilms(trimmed)
      setSearchState({ status: 'results', candidates })
    } catch (error) {
      console.error('La recherche TMDB a échoué.', error)
      setSearchState({
        status: 'error',
        message: 'La recherche a échoué. Vérifiez votre clé TMDB dans les paramètres puis réessayez.',
      })
    }
  }

  return (
    <main className="main editor-main" aria-label="Recherche TMDB">
      <header className="page-action-bar">
        <button className="back-button" type="button" onClick={onCancel}>← Annuler</button>
      </header>

      <div className="editor-heading">
        <p className="eyebrow">Film</p>
        <h1 className="display-title">Enrichissement assisté</h1>
        <p>Recherchez un film dans TMDB, choisissez la bonne correspondance, puis confirmez avant tout enregistrement.</p>
      </div>

      <form className="tmdb-search-form" onSubmit={handleSearch}>
        <div className="field">
          <label htmlFor="tmdb-search-query">Titre du film</label>
          <input
            id="tmdb-search-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher dans TMDB…"
            autoFocus
            disabled={searchState.status === 'searching'}
          />
        </div>
        <div className="form-actions">
          <button
            className="primary-button"
            type="submit"
            disabled={searchState.status === 'searching' || query.trim().length === 0}
          >
            {searchState.status === 'searching' ? 'Recherche…' : 'Rechercher'}
          </button>
          <button className="secondary-button" type="button" onClick={onManual}>
            Passer à la saisie manuelle
          </button>
        </div>
      </form>

      {searchState.status === 'error' && (
        <div className="results-state error-state" role="alert">
          <h2>La recherche a échoué.</h2>
          <p>{searchState.message}</p>
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
    </main>
  )
}
