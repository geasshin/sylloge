import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { FilmDetail } from './components/FilmDetail.tsx'
import { FilmForm } from './components/FilmForm.tsx'
import { Poster } from './components/Poster.tsx'
import { Portability, type PortabilitySection } from './components/Portability.tsx'
import { TmdbSearchFlow } from './components/TmdbSearchFlow.tsx'
import { TmdbAssociationConfirm } from './components/TmdbAssociationConfirm.tsx'
import { updaterPreferencesService } from './data/updaterPreferences.ts'
import { tauriUpdaterService, type AvailableUpdate } from './data/updaterService.ts'
import { backupService, type BackupNotice } from './data/backupService.ts'
import { filmsRepository, type FilmLibrary, type ProfileSummary } from './data/filmsRepository.ts'
import type { TmdbSearchCandidate, CachedFilmTmdbPresentation } from './data/tmdbService.ts'
import { getFilmTmdbCache } from './data/tmdbService.ts'
import {
  FILM_FILTER_LABELS,
  FILM_FILTERS,
  FILM_STATUS_LABELS,
  type Film,
  type FilmFilter,
} from './domain/film.ts'
import type { FilmWriteInput } from './domain/filmForm.ts'
import './styles.css'

type IconName = 'film' | 'home' | 'search' | 'settings'
type SettingsSection = PortabilitySection

const icon = (name: IconName) => <span className={`icon icon-${name}`} aria-hidden="true" />

const SETTINGS_NAVIGATION: Array<{ id: SettingsSection; label: string }> = [
  { id: 'profiles', label: 'Profils' },
  { id: 'transfer', label: 'Importer et exporter' },
  { id: 'backups', label: 'Sauvegardes' },
  { id: 'application', label: 'Application' },
  { id: 'about', label: 'À propos' },
]

type SidebarProps = {
  count: number | null
  currentProfileName: string | null
  activeItem: 'home' | 'library' | 'settings'
  onHome: () => void
  onLibrary: () => void
  onSettings: () => void
  settingsSection: SettingsSection
  onSettingsSection: (section: SettingsSection) => void
  onReturnToLibrary: () => void
}

function Sidebar({
  count,
  currentProfileName,
  activeItem,
  onHome,
  onLibrary,
  onSettings,
  settingsSection,
  onSettingsSection,
  onReturnToLibrary,
}: SidebarProps) {
  const settingsOpen = activeItem === 'settings'

  return (
    <aside className="sidebar">
      <button className="wordmark" onClick={onHome} aria-label="Ouvrir l’accueil">
        <span className="wordmark-mark">S</span>
        <span>Sylloge</span>
      </button>
      {settingsOpen ? (
        <nav aria-label="Navigation des paramètres">
          <p className="nav-label">Paramètres</p>
          {SETTINGS_NAVIGATION.map((item) => (
            <button
              className={`nav-item ${settingsSection === item.id ? 'active' : ''}`}
              type="button"
              key={item.id}
              onClick={() => onSettingsSection(item.id)}
              aria-current={settingsSection === item.id ? 'location' : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : (
        <nav aria-label="Navigation principale">
          <p className="nav-label">Bibliothèque</p>
          <button
            className={`nav-item ${activeItem === 'home' ? 'active' : ''}`}
            type="button"
            onClick={onHome}
            aria-current={activeItem === 'home' ? 'page' : undefined}
          >
            {icon('home')} Accueil
          </button>
          <button
            className={`nav-item ${activeItem === 'library' ? 'active' : ''}`}
            type="button"
            onClick={onLibrary}
            aria-current={activeItem === 'library' ? 'page' : undefined}
          >
            {icon('film')} Films
            {count !== null && <span className="nav-count">{count}</span>}
          </button>
        </nav>
      )}
      <div className="sidebar-bottom">
        {currentProfileName && <p className="sidebar-profile" title={currentProfileName}>{currentProfileName}</p>}
        {settingsOpen ? (
          <button className="nav-item muted" type="button" onClick={onReturnToLibrary}>
            {icon('film')} Retour à la bibliothèque
          </button>
        ) : (
          <button
            className="nav-item"
            type="button"
            onClick={onSettings}
          >
            {icon('settings')} Paramètres
          </button>
        )}
      </div>
    </aside>
  )
}

function FilmCard({ film, onOpen }: { film: Film; onOpen: () => void }) {
  const [tmdbCache, setTmdbCache] = useState<CachedFilmTmdbPresentation | null>(null)
  const attribution = [film.director, film.year].filter((value) => value !== null).join(' · ')
  const displayPosterUrl = tmdbCache?.presentation.posterUrl ?? film.posterUrl

  useEffect(() => {
    let cancelled = false
    getFilmTmdbCache(film.id).then(
      (cache) => { if (!cancelled) setTmdbCache(cache) },
      () => { if (!cancelled) setTmdbCache(null) },
    )
    return () => { cancelled = true }
  }, [film.id])

  return (
    <button className="film-card" type="button" onClick={onOpen} aria-label={`Ouvrir la fiche de ${film.title}`}>
      <Poster title={film.title} src={displayPosterUrl} />
      <span className="film-card-info">
        <span className="film-card-top">
          <b>{film.title}</b>
          {film.isFavorite && <i aria-label="Favori">♥</i>}
        </span>
        {attribution && <small>{attribution}</small>}
        <span className={`status-line ${film.status === 'à découvrir' ? 'to-discover' : ''}`}>
          {FILM_STATUS_LABELS[film.status]}
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

type FilmCreationChoiceProps = {
  onManual: () => void
  onAssisted: () => void
  onCancel: () => void
}

function FilmCreationChoice({ onManual, onAssisted, onCancel }: FilmCreationChoiceProps) {
  return (
    <main className="main editor-main" aria-label="Ajouter un film">
      <header className="page-action-bar">
        <button className="back-button" type="button" onClick={onCancel}>← Annuler</button>
      </header>

      <div className="editor-heading creation-heading">
        <p className="eyebrow">Film</p>
        <h1 className="display-title">Ajouter un film</h1>
        <p>Choisissez un parcours. Aucune fiche n’est créée avant la validation finale du formulaire.</p>
      </div>

      <div className="film-creation-choices" role="group" aria-label="Choisir un parcours de création">
        <button className="film-creation-choice" type="button" onClick={onManual}>
          <span className="card-kicker">Hors ligne</span>
          <b>Saisie manuelle</b>
          <span>Renseignez librement les informations du film, même sans aucune source externe.</span>
        </button>
        <button className="film-creation-choice" type="button" onClick={onAssisted}>
          <span className="card-kicker">Métadonnées</span>
          <b>Enrichissement assisté</b>
          <span>Prépare une future recherche et un préremplissage, toujours modifiables avant l’enregistrement.</span>
        </button>
      </div>
    </main>
  )
}

function compareTitles(first: Film, second: Film): number {
  return first.title.localeCompare(second.title, 'fr', { sensitivity: 'base' }) || first.id.localeCompare(second.id)
}

function compareByCreatedAt(first: Film, second: Film): number {
  return second.createdAt.localeCompare(first.createdAt) || compareTitles(first, second)
}

function compareByWatchedAt(first: Film, second: Film): number {
  return (second.watchedAt ?? '').localeCompare(first.watchedAt ?? '') || compareByCreatedAt(first, second)
}

function formatCalendarDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatWatchedDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
}

type CalendarDay = {
  date: Date
  key: string
  filmCount: number
}

function buildCalendarDays(films: Film[]): CalendarDay[] {
  const filmCounts = new Map<string, number>()
  films.forEach((film) => {
    if (film.status === 'terminé' && film.watchedAt) {
      filmCounts.set(film.watchedAt, (filmCounts.get(film.watchedAt) ?? 0) + 1)
    }
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekday = today.getDay() || 7
  const firstDay = new Date(today)
  firstDay.setDate(today.getDate() - weekday + 1 - 28)

  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(firstDay)
    date.setDate(firstDay.getDate() + index)
    const key = formatCalendarDate(date)
    return { date, key, filmCount: filmCounts.get(key) ?? 0 }
  })
}

function HomeFilmCard({ film, onOpen }: { film: Film; onOpen: () => void }) {
  const attribution = [film.director, film.year].filter((value) => value !== null).join(' · ')

  return (
    <button className="home-film-card" type="button" onClick={onOpen} aria-label={`Ouvrir la fiche de ${film.title}`}>
      <Poster title={film.title} src={film.posterUrl} className="home-film-poster" />
      <span className="home-film-card-info">
        <b>{film.title}</b>
        {attribution && <small>{attribution}</small>}
      </span>
    </button>
  )
}

function HomeFilmModule({
  title,
  description,
  films,
  emptyMessage,
  className = '',
  onOpen,
}: {
  title: string
  description: string
  films: Film[]
  emptyMessage: string
  className?: string
  onOpen: (film: Film) => void
}) {
  const headingId = `${title.toLocaleLowerCase('fr').replaceAll(' ', '-')}-title`

  return (
    <section className={`home-module ${className}`.trim()} aria-labelledby={headingId}>
      <header className="home-module-heading">
        <div>
          <p className="card-kicker">Films</p>
          <h2 id={headingId}>{title}</h2>
        </div>
        <p>{description}</p>
      </header>
      {films.length > 0 ? (
        <div className="home-film-list">
          {films.map((film) => <HomeFilmCard key={film.id} film={film} onOpen={() => onOpen(film)} />)}
        </div>
      ) : (
        <p className="home-module-empty">{emptyMessage}</p>
      )}
    </section>
  )
}

type HomeProps = {
  library: FilmLibrary
  onOpen: (film: Film) => void
}

function Home({ library, onOpen }: HomeProps) {
  const recentlyWatched = library.films
    .filter((film) => film.status === 'terminé' && film.watchedAt)
    .sort(compareByWatchedAt)
    .slice(0, 4)
  const favorites = library.films
    .filter((film) => film.isFavorite)
    .sort(compareByCreatedAt)
    .slice(0, 4)
  const waiting = library.films
    .filter((film) => film.status === 'en attente')
    .sort(compareByCreatedAt)
    .slice(0, 4)
  const recentlyAdded = [...library.films].sort(compareByCreatedAt).slice(0, 4)
  const calendarDays = buildCalendarDays(library.films)
  const hasViewedFilm = calendarDays.some((day) => day.filmCount > 0)
  const contextualFilms = waiting.length > 0 ? waiting : recentlyAdded
  const contextualTitle = waiting.length > 0 ? 'En attente' : 'Ajoutés récemment'
  const contextualDescription = waiting.length > 0 ? 'Films marqués en attente' : 'Films ajoutés récemment à la bibliothèque'
  const contextualEmptyMessage = waiting.length > 0
    ? 'Aucun film en attente n’est disponible à afficher.'
    : 'Aucun film n’a encore été ajouté à la bibliothèque.'

  return (
    <main className="main home-main" aria-label="Accueil">
      <div className="home-content">
        <header className="home-heading">
          <p className="eyebrow">Bibliothèque locale</p>
          <h1 className="display-title">Accueil</h1>
        </header>

        <div className="home-grid">
          <HomeFilmModule
            title="Vus récemment"
            description="Films terminés avec une date de visionnage"
            films={recentlyWatched}
            emptyMessage="Aucun film terminé avec une date de visionnage."
            className="home-module-recent"
            onOpen={onOpen}
          />
          <HomeFilmModule
            title="Favoris"
            description="Films marqués comme favoris"
            films={favorites}
            emptyMessage="Aucun film n’est marqué comme favori."
            className="home-module-favorites"
            onOpen={onOpen}
          />
          <HomeFilmModule
            title={contextualTitle}
            description={contextualDescription}
            films={contextualFilms}
            emptyMessage={contextualEmptyMessage}
            className="home-module-context"
            onOpen={onOpen}
          />
          <section className="home-module home-module-calendar" aria-labelledby="watched-calendar-title">
            <header className="home-module-heading">
              <div>
                <p className="card-kicker">Films</p>
                <h2 id="watched-calendar-title">Films vus</h2>
              </div>
              <p>Les cinq dernières semaines</p>
            </header>
            <div className="home-calendar" aria-label="Calendrier des films vus pendant les cinq dernières semaines">
              <div className="home-calendar-weekdays" aria-hidden="true">
                {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
              </div>
              <ol className="home-calendar-days">
                {calendarDays.map(({ date, key, filmCount }) => {
                  const dayLabel = formatWatchedDay(key)
                  const countLabel = filmCount === 1 ? '1 film vu' : `${filmCount} films vus`
                  return (
                    <li
                      className={filmCount > 0 ? 'viewed' : ''}
                      key={key}
                      aria-label={filmCount > 0 ? `${dayLabel} : ${countLabel}` : dayLabel}
                    >
                      <time dateTime={key} aria-hidden="true">{date.getDate()}</time>
                    </li>
                  )
                })}
              </ol>
            </div>
            <p className={hasViewedFilm ? 'home-calendar-note' : 'home-module-empty'}>
              {hasViewedFilm
                ? 'Les jours marqués correspondent à au moins un film terminé et daté.'
                : 'Aucun film terminé daté au cours des cinq dernières semaines.'}
            </p>
          </section>
        </div>
      </div>
    </main>
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
              {FILM_FILTERS.map((filter) => (
                <button
                  className={`filter ${context.filter === filter ? 'active' : ''}`}
                  type="button"
                  aria-pressed={context.filter === filter}
                  key={filter}
                  onClick={() => onContextChange({ ...context, filter })}
                >
                  {FILM_FILTER_LABELS[filter]}
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
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'settings' }
  | { name: 'create-choice' }
  | { name: 'create' }
  | { name: 'tmdb-search' }
  | { name: 'tmdb-confirm'; candidate: TmdbSearchCandidate }
  | { name: 'tmdb-associate'; filmId: string }
  | { name: 'detail'; filmId: string; returnTo: 'home' | 'library' }
  | { name: 'edit'; filmId: string; returnTo: 'home' | 'library' }

function sortFilms(films: Film[]): Film[] {
  return [...films].sort((first, second) => first.title.localeCompare(second.title, 'fr', { sensitivity: 'base' }))
}

type SqliteFilmDetailProps = {
  profileId: string
  filmId: string
  onBack: () => void
  backLabel: string
  onEdit: () => void
  onDelete: () => Promise<void>
  onAssociateTmdb: () => void
}

function SqliteFilmDetail({ profileId, filmId, onBack, backLabel, onEdit, onDelete, onAssociateTmdb }: SqliteFilmDetailProps) {
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
    return <FilmDetail film={state.film} onBack={onBack} backLabel={backLabel} onEdit={onEdit} onDelete={onDelete} onAssociateTmdb={onAssociateTmdb} />
  }

  return (
    <main className="main detail-page-main">
      <header className="page-action-bar detail-action-bar">
        <button className="back-button" type="button" onClick={onBack}>{backLabel}</button>
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
  const [view, setView] = useState<View>({ name: 'home' })
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('profiles')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [backupNotice, setBackupNotice] = useState<BackupNotice | null>(null)
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null)
  const [associatingFilm, setAssociatingFilm] = useState<Film | null>(null)
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
    let cancelled = false

    void (async () => {
      try {
        const preferences = await updaterPreferencesService.get()
        if (cancelled || !preferences.automaticChecksEnabled) return

        const update = await tauriUpdaterService.check()
        if (!cancelled && update && preferences.ignoredVersion !== update.version) {
          setAvailableUpdate(update)
        }
      } catch (error) {
        console.error('La recherche automatique des mises à jour a échoué.', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

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
    if (view.name === 'library') libraryScrollPosition.current = window.scrollY
    setView(nextView)
    window.scrollTo({ top: 0 })
  }

  const returnToLibrary = () => {
    if (view.name === 'library') return
    restoreLibraryScroll.current = true
    setView({ name: 'library' })
  }

  const showSettingsSection = (section: SettingsSection) => {
    setSettingsSection(section)
    if (view.name === 'settings') {
      window.scrollTo({ top: 0 })
      return
    }
    leaveLibrary({ name: 'settings' })
  }

  const requestAutomaticBackup = (library: FilmLibrary) => {
    void backupService.tryAutomaticSnapshot(library).then((notice) => {
      if (notice) setBackupNotice(notice)
    })
  }

  const count = libraryState.status === 'ready' ? libraryState.library.films.length : null
  let content

  if (libraryState.status === 'loading') {
    content = (
      <main className="main home-main">
        <header className="home-heading">
          <div><p className="eyebrow">Bibliothèque locale</p><h1 className="display-title">Accueil</h1></div>
        </header>
        <LoadingState />
      </main>
    )
  } else if (libraryState.status === 'error') {
    content = (
      <main className="main home-main">
        <header className="home-heading">
          <div><p className="eyebrow">Bibliothèque locale</p><h1 className="display-title">Accueil</h1></div>
        </header>
        <ErrorState onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
      </main>
    )
  } else if (view.name === 'home') {
    content = (
      <Home
        library={libraryState.library}
        onOpen={(film) => leaveLibrary({ name: 'detail', filmId: film.id, returnTo: 'home' })}
      />
    )
  } else if (view.name === 'create-choice') {
    content = (
      <FilmCreationChoice
        onManual={() => setView({ name: 'create' })}
        onAssisted={() => setView({ name: 'tmdb-search' })}
        onCancel={returnToLibrary}
      />
    )
  } else if (view.name === 'tmdb-search') {
    content = (
      <TmdbSearchFlow
        onSelectCandidate={(candidate) => setView({ name: 'tmdb-confirm', candidate })}
        onManual={() => setView({ name: 'create' })}
        onCancel={returnToLibrary}
      />
    )
  } else if (view.name === 'tmdb-confirm') {
    content = (
      <TmdbAssociationConfirm
        film={associatingFilm}
        candidate={view.candidate}
        onConfirm={() => {
          setAssociatingFilm(null)
          if (associatingFilm) {
            setView({ name: 'detail', filmId: associatingFilm.id, returnTo: 'library' })
          } else {
            setView({ name: 'create' })
          }
        }}
        onBack={() => setView({ name: 'tmdb-search' })}
        onCancel={() => {
          setAssociatingFilm(null)
          returnToLibrary()
        }}
      />
    )
  } else if (view.name === 'tmdb-associate') {
    const { library } = libraryState
    const film = library.films.find((entry) => entry.id === view.filmId)
    if (!film) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button" type="button" onClick={returnToLibrary}>
              ← Retour aux films
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>Ce film ne peut pas être associé.</h2>
            <p>La fiche n'est plus présente dans la bibliothèque locale.</p>
          </div>
        </main>
      )
    } else {
      content = (
        <TmdbSearchFlow
          onSelectCandidate={(candidate) => setView({ name: 'tmdb-confirm', candidate })}
          onManual={() => setView({ name: 'detail', filmId: film.id, returnTo: 'library' })}
          onCancel={() => setView({ name: 'detail', filmId: film.id, returnTo: 'library' })}
        />
      )
    }
  } else if (view.name === 'create') {
    const { library } = libraryState
    content = (
      <FilmForm
        onCancel={returnToLibrary}
        onSave={async (input, provenance) => {
          const film = await filmsRepository.createFilm(library.profile.id, input, provenance)
          const updatedLibrary: FilmLibrary = { ...library, films: sortFilms([...library.films, film]) }
          setLibraryState({
            status: 'ready',
            library: updatedLibrary,
          })
          requestAutomaticBackup(updatedLibrary)
          setView({ name: 'detail', filmId: film.id, returnTo: 'library' })
          window.scrollTo({ top: 0 })
        }}
      />
    )
  } else if (view.name === 'settings') {
    const { library } = libraryState
    content = (
      <Portability
        section={settingsSection}
        library={library}
        profiles={profiles}
        onSwitchProfile={async (profileId) => {
          const selectedLibrary = await filmsRepository.selectProfile(profileId)
          setLibraryContext({ query: '', filter: 'all' })
          setLibraryState({ status: 'ready', library: selectedLibrary })
        }}
        onImported={(importedLibrary) => {
          setLibraryContext({ query: '', filter: 'all' })
          setLibraryState({ status: 'ready', library: importedLibrary })
          requestAutomaticBackup(importedLibrary)
          filmsRepository.listProfiles().then(setProfiles, (error: unknown) => {
            console.error('Impossible de rafraîchir la liste des profils.', error)
          })
        }}
        onBackupNotice={setBackupNotice}
        availableUpdate={availableUpdate}
        onUpdateAvailable={setAvailableUpdate}
        onUpdateHandled={() => setAvailableUpdate(null)}
      />
    )
  } else if (view.name === 'detail') {
    const { library } = libraryState
    content = (
      <SqliteFilmDetail
        profileId={library.profile.id}
        filmId={view.filmId}
        onBack={() => view.returnTo === 'home' ? leaveLibrary({ name: 'home' }) : returnToLibrary()}
        backLabel={view.returnTo === 'home' ? '← Retour à l’accueil' : '← Retour aux films'}
        onEdit={() => setView({ name: 'edit', filmId: view.filmId, returnTo: view.returnTo })}
        onAssociateTmdb={() => {
          const film = libraryState.library.films.find((entry) => entry.id === view.filmId)
          if (film) {
            setAssociatingFilm(film)
            setView({ name: 'tmdb-associate', filmId: view.filmId })
          }
        }}
        onDelete={async () => {
          await filmsRepository.deleteFilm(library.profile.id, view.filmId)
          const updatedLibrary: FilmLibrary = {
            ...library,
            films: library.films.filter((entry) => entry.id !== view.filmId),
          }
          setLibraryState({
            status: 'ready',
            library: updatedLibrary,
          })
          requestAutomaticBackup(updatedLibrary)
          if (view.returnTo === 'home') leaveLibrary({ name: 'home' })
          else returnToLibrary()
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
            <button className="back-button" type="button" onClick={() => view.returnTo === 'home' ? leaveLibrary({ name: 'home' }) : returnToLibrary()}>
              {view.returnTo === 'home' ? '← Retour à l’accueil' : '← Retour aux films'}
            </button>
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
          onCancel={() => setView({ name: 'detail', filmId: film.id, returnTo: view.returnTo })}
          onSave={async (input: FilmWriteInput) => {
            const updatedAt = await filmsRepository.updateFilm(library.profile.id, film.id, input)
            const updatedFilm: Film = { ...film, ...input, updatedAt }
            const updatedLibrary: FilmLibrary = {
              ...library,
              films: sortFilms(library.films.map((entry) => entry.id === film.id ? updatedFilm : entry)),
            }
            setLibraryState({
              status: 'ready',
              library: updatedLibrary,
            })
            requestAutomaticBackup(updatedLibrary)
            setView({ name: 'detail', filmId: film.id, returnTo: view.returnTo })
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
        onCreate={() => leaveLibrary({ name: 'create-choice' })}
        onOpen={(film) => leaveLibrary({ name: 'detail', filmId: film.id, returnTo: 'library' })}
      />
    )
  }

  return (
    <div className="app">
      <Sidebar
        count={count}
        currentProfileName={libraryState.status === 'ready' ? libraryState.library.profile.name : null}
        activeItem={libraryState.status !== 'ready' || view.name === 'home' ? 'home' : view.name === 'settings' ? 'settings' : 'library'}
        onHome={() => leaveLibrary({ name: 'home' })}
        onLibrary={returnToLibrary}
        onSettings={() => showSettingsSection('profiles')}
        settingsSection={settingsSection}
        onSettingsSection={showSettingsSection}
        onReturnToLibrary={returnToLibrary}
      />
      {content}
      {backupNotice && (
        <div className={`backup-notice ${backupNotice.kind}`} role={backupNotice.kind === 'error' ? 'alert' : 'status'} aria-atomic="true">
          <p>{backupNotice.message}</p>
          <button type="button" onClick={() => setBackupNotice(null)} aria-label="Fermer le message de sauvegarde">Fermer</button>
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
