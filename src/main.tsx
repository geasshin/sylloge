import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { FilmDetail } from './components/FilmDetail.tsx'
import { FilmForm } from './components/FilmForm.tsx'
import { Poster } from './components/Poster.tsx'
import { Portability } from './components/Portability.tsx'
import { filmsRepository, type FilmLibrary, type ProfileSummary } from './data/filmsRepository.ts'
import type { Film, FilmFilter, FilmStatus } from './domain/film.ts'
import type { FilmWriteInput } from './domain/filmForm.ts'
import './styles.css'

const icon = (name: string) => <span className={`icon icon-${name}`} aria-hidden="true" />

type SidebarProps = {
  count: number | null
  currentProfileName: string | null
  portabilityActive: boolean
  onReturn: () => void
  onPortability: () => void
}

function Sidebar({ count, currentProfileName, portabilityActive, onReturn, onPortability }: SidebarProps) {
  return (
    <aside className="sidebar">
      <button className="wordmark" onClick={onReturn} aria-label="Retour à la bibliothèque Films">
        <span className="wordmark-mark">S</span>
        <span>Sylloge</span>
      </button>
      <nav aria-label="Navigation principale">
        <p className="nav-label">Collection</p>
        <button
          className={`nav-item ${portabilityActive ? '' : 'active'}`}
          onClick={onReturn}
          aria-current={portabilityActive ? undefined : 'page'}
        >
          {icon('film')} Films
          {count !== null && <span className="nav-count">{count}</span>}
        </button>
      </nav>
      <div className="sidebar-bottom">
        {currentProfileName && <p className="sidebar-profile" title={currentProfileName}>{currentProfileName}</p>}
        <button
          className={`nav-item ${portabilityActive ? 'active' : ''}`}
          type="button"
          onClick={onPortability}
          aria-current={portabilityActive ? 'page' : undefined}
        >
          {icon('archive')} Profils et JSON
        </button>
      </div>
    </aside>
  )
}

const STATUS_LABELS: Record<FilmStatus, string> = {
  'à découvrir': 'À découvrir',
  'en attente': 'En attente',
  'terminé': 'Terminé',
  'abandonné': 'Abandonné',
}

const FILTER_LABELS: Record<FilmFilter, string> = {
  all: 'Tous',
  'to-discover': 'À découvrir',
  completed: 'Terminés',
  favorites: 'Favoris',
}

const FILTERS = Object.keys(FILTER_LABELS) as FilmFilter[]

function FilmCard({ film, onOpen }: { film: Film; onOpen: () => void }) {
  const attribution = [film.director, film.year].filter((value) => value !== null).join(' · ')

  return (
    <button className="film-card" type="button" onClick={onOpen} aria-label={`Ouvrir la fiche de ${film.title}`}>
      <Poster title={film.title} src={film.posterUrl} />
      <span className="film-card-info">
        <span className="film-card-top">
          <b>{film.title}</b>
          {film.isFavorite && <i aria-label="Favori">♥</i>}
        </span>
        {attribution && <small>{attribution}</small>}
        <span className={`status-line ${film.status === 'à découvrir' ? 'to-discover' : ''}`}>
          {STATUS_LABELS[film.status]}
        </span>
      </span>
    </button>
  )
}

function LoadingState() {
  return (
    <div className="library-state" role="status" aria-live="polite">
      <p className="state-kicker">Bibliothèque locale</p>
      <h2>Chargement des films</h2>
      <p>Lecture de la collection enregistrée sur cet appareil.</p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="library-state error-state" role="alert">
      <p className="state-kicker">Lecture impossible</p>
      <h2>La bibliothèque locale ne peut pas être ouverte.</h2>
      <p>Vérifiez que l’application dispose toujours de son accès SQLite, puis réessayez.</p>
      <button className="state-action" type="button" onClick={onRetry}>Réessayer</button>
    </div>
  )
}

function EmptyLibrary({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="library-state empty-library">
      <p className="state-kicker">Collection personnelle</p>
      <h2>Votre bibliothèque Films est vide.</h2>
      <p>Ajoutez un premier film, avec un titre seulement si vous le souhaitez.</p>
      <button className="primary-button empty-action" type="button" onClick={onCreate}>Ajouter un film</button>
    </div>
  )
}

type LibraryContext = {
  query: string
  filter: FilmFilter
}

type SearchState =
  | { status: 'loading' }
  | { status: 'ready'; films: Film[] }
  | { status: 'error' }

type FilmsLibraryProps = {
  library: FilmLibrary
  context: LibraryContext
  searchState: SearchState
  onContextChange: (context: LibraryContext) => void
  onRetrySearch: () => void
  onCreate: () => void
  onOpen: (film: Film) => void
}

function FilmsLibrary({
  library,
  context,
  searchState,
  onContextChange,
  onRetrySearch,
  onCreate,
  onOpen,
}: FilmsLibraryProps) {
  const isUnfiltered = context.query.trim() === '' && context.filter === 'all'
  const resultCount = searchState.status === 'ready' ? searchState.films.length : null

  return (
    <main className="main library-main" aria-label={`Bibliothèque Films du profil ${library.profile.name}`}>
      <header className="library-header">
        <div>
          <p className="eyebrow">Collection personnelle</p>
          <h1 className="display-title">Films</h1>
        </div>
        <button className="primary-button" type="button" onClick={onCreate}>Ajouter un film</button>
      </header>

      {library.films.length === 0 && isUnfiltered ? (
        <EmptyLibrary onCreate={onCreate} />
      ) : (
        <>
          <div className="library-tools">
            <label className="search">
              {icon('search')}
              <span className="visually-hidden">Rechercher par titre, titre original ou réalisation</span>
              <input
                type="search"
                value={context.query}
                placeholder="Titre, titre original ou réalisation"
                onChange={(event) => onContextChange({ ...context, query: event.target.value })}
              />
            </label>
            <div className="filters" role="group" aria-label="Filtrer les films">
              {FILTERS.map((filter) => (
                <button
                  className={`filter ${context.filter === filter ? 'active' : ''}`}
                  type="button"
                  aria-pressed={context.filter === filter}
                  key={filter}
                  onClick={() => onContextChange({ ...context, filter })}
                >
                  {FILTER_LABELS[filter]}
                </button>
              ))}
            </div>
          </div>

          <div className="collection-meta" aria-live="polite">
            {resultCount === null ? <p>Recherche dans la bibliothèque locale…</p> : (
              <p>{resultCount} {resultCount === 1 ? 'film affiché' : 'films affichés'}</p>
            )}
          </div>

          {searchState.status === 'loading' ? (
            <div className="results-state" role="status">Recherche dans SQLite…</div>
          ) : searchState.status === 'error' ? (
            <div className="results-state error-state" role="alert">
              <h2>La recherche locale a échoué.</h2>
              <p>Vos films restent enregistrés. Réessayez pour relire les résultats depuis SQLite.</p>
              <button className="state-action" type="button" onClick={onRetrySearch}>Réessayer</button>
            </div>
          ) : searchState.films.length === 0 ? (
            <div className="results-state empty-results">
              <h2>Aucun film ne correspond.</h2>
              <p>Modifiez la recherche ou revenez à tous les films.</p>
              <button
                className="state-action"
                type="button"
                onClick={() => onContextChange({ query: '', filter: 'all' })}
              >
                Afficher tous les films
              </button>
            </div>
          ) : (
            <div className="film-grid" aria-busy="false">
              {searchState.films.map((film) => (
                <FilmCard film={film} key={film.id} onOpen={() => onOpen(film)} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}

type LibraryState =
  | { status: 'loading' }
  | { status: 'ready'; library: FilmLibrary }
  | { status: 'error' }

type View =
  | { name: 'library' }
  | { name: 'portability' }
  | { name: 'create' }
  | { name: 'detail'; filmId: string }
  | { name: 'edit'; filmId: string }

function sortFilms(films: Film[]): Film[] {
  return [...films].sort((first, second) => first.title.localeCompare(second.title, 'fr', { sensitivity: 'base' }))
}

type SqliteFilmDetailProps = {
  profileId: string
  filmId: string
  onBack: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
}

function SqliteFilmDetail({ profileId, filmId, onBack, onEdit, onDelete }: SqliteFilmDetailProps) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; film: Film } | { status: 'error' }>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    filmsRepository.getFilm(profileId, filmId).then(
      (film) => {
        if (cancelled) return
        if (film) setState({ status: 'ready', film })
        else setState({ status: 'error' })
      },
      (error: unknown) => {
        console.error('Impossible de charger la fiche Film depuis SQLite.', error)
        if (!cancelled) setState({ status: 'error' })
      },
    )

    return () => {
      cancelled = true
    }
  }, [attempt, filmId, profileId])

  if (state.status === 'ready') {
    return <FilmDetail film={state.film} onBack={onBack} onEdit={onEdit} onDelete={onDelete} />
  }

  return (
    <main className="main detail-page-main">
      <header className="page-action-bar detail-action-bar">
        <button className="back-button" type="button" onClick={onBack}>← Retour aux films</button>
      </header>
      {state.status === 'loading' ? (
        <div className="library-state" role="status">
          <p className="state-kicker">Fiche locale</p>
          <h2>Chargement du film</h2>
          <p>Lecture de la fiche enregistrée dans SQLite.</p>
        </div>
      ) : (
        <div className="library-state error-state" role="alert">
          <p className="state-kicker">Fiche indisponible</p>
          <h2>Ce film ne peut pas être ouvert.</h2>
          <p>La fiche est absente ou SQLite n’a pas pu la relire.</p>
          <button className="state-action" type="button" onClick={() => setAttempt((value) => value + 1)}>Réessayer</button>
        </div>
      )}
    </main>
  )
}

function App() {
  const [libraryState, setLibraryState] = useState<LibraryState>({ status: 'loading' })
  const [profiles, setProfiles] = useState<ProfileSummary[]>([])
  const [searchState, setSearchState] = useState<SearchState>({ status: 'loading' })
  const [libraryContext, setLibraryContext] = useState<LibraryContext>({ query: '', filter: 'all' })
  const [view, setView] = useState<View>({ name: 'library' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const libraryScrollPosition = useRef(0)
  const restoreLibraryScroll = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLibraryState({ status: 'loading' })

    Promise.all([filmsRepository.loadCurrentLibrary(), filmsRepository.listProfiles()]).then(
      ([library, availableProfiles]) => {
        if (!cancelled) {
          setLibraryState({ status: 'ready', library })
          setProfiles(availableProfiles)
        }
      },
      (error: unknown) => {
        console.error('Impossible de charger la bibliothèque Films depuis SQLite.', error)
        if (!cancelled) setLibraryState({ status: 'error' })
      },
    )

    return () => {
      cancelled = true
    }
  }, [loadAttempt])

  useEffect(() => {
    if (libraryState.status !== 'ready') return

    let cancelled = false
    setSearchState({ status: 'loading' })
    const timeout = window.setTimeout(() => {
      filmsRepository.searchFilms(libraryState.library.profile.id, libraryContext).then(
        (films) => {
          if (!cancelled) setSearchState({ status: 'ready', films })
        },
        (error: unknown) => {
          console.error('Impossible de rechercher les films dans SQLite.', error)
          if (!cancelled) setSearchState({ status: 'error' })
        },
      )
    }, libraryContext.query ? 140 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [libraryContext, libraryState, searchAttempt])

  useEffect(() => {
    if (libraryState.status !== 'ready') return
    const { profile, films } = libraryState.library
    setProfiles((current) => current.map((entry) => (
      entry.id === profile.id && entry.filmCount !== films.length
        ? { ...entry, filmCount: films.length }
        : entry
    )))
  }, [libraryState])

  useEffect(() => {
    if (view.name !== 'library' || !restoreLibraryScroll.current) return

    restoreLibraryScroll.current = false
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: libraryScrollPosition.current })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [view])

  const leaveLibrary = (nextView: View) => {
    libraryScrollPosition.current = window.scrollY
    setView(nextView)
    window.scrollTo({ top: 0 })
  }

  const returnToLibrary = () => {
    if (view.name === 'library') return
    restoreLibraryScroll.current = true
    setView({ name: 'library' })
  }

  const count = libraryState.status === 'ready' ? libraryState.library.films.length : null
  let content

  if (libraryState.status === 'loading') {
    content = (
      <main className="main library-main">
        <header className="library-header">
          <div><p className="eyebrow">Collection personnelle</p><h1 className="display-title">Films</h1></div>
        </header>
        <LoadingState />
      </main>
    )
  } else if (libraryState.status === 'error') {
    content = (
      <main className="main library-main">
        <header className="library-header">
          <div><p className="eyebrow">Collection personnelle</p><h1 className="display-title">Films</h1></div>
        </header>
        <ErrorState onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
      </main>
    )
  } else if (view.name === 'create') {
    const { library } = libraryState
    content = (
      <FilmForm
        onCancel={returnToLibrary}
        onSave={async (input) => {
          const film = await filmsRepository.createFilm(library.profile.id, input)
          setLibraryState({
            status: 'ready',
            library: { ...library, films: sortFilms([...library.films, film]) },
          })
          setView({ name: 'detail', filmId: film.id })
          window.scrollTo({ top: 0 })
        }}
      />
    )
  } else if (view.name === 'portability') {
    const { library } = libraryState
    content = (
      <Portability
        library={library}
        profiles={profiles}
        onBack={returnToLibrary}
        onSwitchProfile={async (profileId) => {
          const selectedLibrary = await filmsRepository.selectProfile(profileId)
          setLibraryContext({ query: '', filter: 'all' })
          setLibraryState({ status: 'ready', library: selectedLibrary })
        }}
        onImported={(importedLibrary) => {
          setLibraryContext({ query: '', filter: 'all' })
          setLibraryState({ status: 'ready', library: importedLibrary })
          filmsRepository.listProfiles().then(setProfiles, (error: unknown) => {
            console.error('Impossible de rafraîchir la liste des profils.', error)
          })
        }}
      />
    )
  } else if (view.name === 'detail') {
    const { library } = libraryState
    content = (
      <SqliteFilmDetail
        profileId={library.profile.id}
        filmId={view.filmId}
        onBack={returnToLibrary}
        onEdit={() => setView({ name: 'edit', filmId: view.filmId })}
        onDelete={async () => {
          await filmsRepository.deleteFilm(library.profile.id, view.filmId)
          setLibraryState({
            status: 'ready',
            library: { ...library, films: library.films.filter((entry) => entry.id !== view.filmId) },
          })
          returnToLibrary()
        }}
      />
    )
  } else if (view.name === 'edit') {
    const { library } = libraryState
    const film = library.films.find((entry) => entry.id === view.filmId)

    if (!film) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button" type="button" onClick={returnToLibrary}>← Retour aux films</button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>Ce film ne peut pas être modifié.</h2>
            <p>La fiche n’est plus présente dans la bibliothèque locale.</p>
          </div>
        </main>
      )
    } else {
      content = (
        <FilmForm
          film={film}
          onCancel={() => setView({ name: 'detail', filmId: film.id })}
          onSave={async (input: FilmWriteInput) => {
            const updatedAt = await filmsRepository.updateFilm(library.profile.id, film.id, input)
            const updatedFilm: Film = { ...film, ...input, updatedAt }
            setLibraryState({
              status: 'ready',
              library: {
                ...library,
                films: sortFilms(library.films.map((entry) => entry.id === film.id ? updatedFilm : entry)),
              },
            })
            setView({ name: 'detail', filmId: film.id })
            window.scrollTo({ top: 0 })
          }}
        />
      )
    }
  } else {
    content = (
      <FilmsLibrary
        library={libraryState.library}
        context={libraryContext}
        searchState={searchState}
        onContextChange={setLibraryContext}
        onRetrySearch={() => setSearchAttempt((attempt) => attempt + 1)}
        onCreate={() => leaveLibrary({ name: 'create' })}
        onOpen={(film) => leaveLibrary({ name: 'detail', filmId: film.id })}
      />
    )
  }

  return (
    <div className="app">
      <Sidebar
        count={count}
        currentProfileName={libraryState.status === 'ready' ? libraryState.library.profile.name : null}
        portabilityActive={view.name === 'portability'}
        onReturn={returnToLibrary}
        onPortability={() => {
          setView({ name: 'portability' })
          window.scrollTo({ top: 0 })
        }}
      />
      {content}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
