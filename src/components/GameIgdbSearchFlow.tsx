import { useEffect, useState } from 'react'
import {
  searchIgdbGames,
  type IgdbGameCandidate,
} from '../data/igdbService.ts'
import { Poster } from './Poster.tsx'
import { formatNumber, t, translateMessage } from '../i18n/core.ts'

type GameIgdbSearchFlowProps = {
  /** Fiche ouverte derrière la pop-up : contexte d'association, titre prérempli. */
  existing?: { title: string; coverUrl: string | null } | null
  /** Candidat en cours de traitement : la liste se fige pendant la préparation. */
  pendingCandidateId?: number | null
  /** Échec de la sélection directe, annoncé sans quitter la recherche. */
  selectionError?: string | null
  onSelectCandidate: (candidate: IgdbGameCandidate) => void
  onManual: () => void
  onCancel: () => void
  /** Rendu compact dans une pop-up : sans <main>, ni barre d'action, ni titre répété. */
  compact?: boolean
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
 * couvertures sont verticales (3:4). Le mode « fiche existante » reprend le
 * parcours d'association des films : titre prérempli, encart contexte,
 * rendu compact dans la même pop-up floutée.
 */
export function GameIgdbSearchFlow({ existing = null, pendingCandidateId = null, selectionError = null, onSelectCandidate, onManual, onCancel, compact = false }: GameIgdbSearchFlowProps) {
  const [query, setQuery] = useState(() => existing?.title ?? '')
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

  const body = (
    <>
      {!compact && (
        <header className="page-action-bar">
          <button className="back-button" type="button" onClick={onCancel}>
            {existing ? t('← Retour à la fiche') : t('← Annuler')}
          </button>
        </header>
      )}

      <div className="editor-heading">
        <h1 className="display-title">{existing ? t('Modifier l’association') : t('Rechercher un jeu')}</h1>
        <p>
          {existing
            ? t`Recherchez une autre correspondance IGDB pour « ${existing.title} ».`
            : t('Recherchez un jeu dans IGDB et choisissez la bonne correspondance : le formulaire s’ouvre directement prérempli.')}
        </p>
      </div>

      {existing && (
        <section className="tmdb-film-context" aria-labelledby="game-igdb-context-title">
          <Poster label="Couverture" title={existing.title} src={existing.coverUrl} className="tmdb-film-context-poster" />
          <div className="tmdb-film-context-info">
            <p className="card-kicker">{t('Fiche actuelle')}</p>
            <h2 id="game-igdb-context-title">{existing.title}</h2>
            <p>{t('Cette fiche reste le contexte de l’association. Seuls ses champs éditoriaux seront mis à jour ; tes données personnelles ne bougent pas.')}</p>
          </div>
        </section>
      )}

      <form className="tmdb-search-form" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label htmlFor="game-igdb-search-query">{t('Titre du jeu')}</label>
          <input
            id="game-igdb-search-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Rechercher dans IGDB…')}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-busy={searchState.status === 'searching'}
          />
          <p className="field-help">
            {searchState.status === 'searching' ? t('Recherche dans IGDB…') : t('Les suggestions se mettent à jour pendant la saisie.')}
          </p>
        </div>
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onManual}>
            {existing ? t('Retour à la fiche') : t('Saisir manuellement')}
          </button>
        </div>
      </form>

      {searchState.status === 'error' && (
        <div className="results-state error-state" role="alert">
          <h2>{t('La recherche a échoué.')}</h2>
          <p>{translateMessage(searchState.message)}</p>
        </div>
      )}

      {pendingCandidateId !== null && (
        <div className="results-state" role="status">{t('Préparation de la mise à jour…')}</div>
      )}

      {selectionError !== null && pendingCandidateId === null && (
        <div className="results-state error-state" role="alert">
          <p>{translateMessage(selectionError)}</p>
        </div>
      )}

      {searchState.status === 'results' && (
        <section className="tmdb-search-results" aria-labelledby="game-igdb-results-title">
          <h2 id="game-igdb-results-title">
            {searchState.candidates.length === 0
              ? t('Aucun résultat')
              : t(searchState.candidates.length === 1 ? '{count} résultat' : '{count} résultats', { count: formatNumber(searchState.candidates.length) })}
          </h2>
          {searchState.candidates.length === 0 ? (
            <p>{t('Essayez un titre différent ou passez à la saisie manuelle.')}</p>
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
            {t('Données :')} <a href="https://www.igdb.com" target="_blank" rel="noreferrer">IGDB</a> {t('(opéré par Twitch)')}
          </p>
        </section>
      )}
    </>
  )

  if (compact) {
    return <div className="tmdb-search-compact">{body}</div>
  }

  return (
    <main className="main editor-main" aria-label={t('Recherche IGDB')}>
      {body}
    </main>
  )
}
