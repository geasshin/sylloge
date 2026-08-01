import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArtworkDetail } from './components/ArtworkDetail.tsx'
import { ArtworkForm } from './components/ArtworkForm.tsx'
import { FilmDetail } from './components/FilmDetail.tsx'
import { FilmForm } from './components/FilmForm.tsx'
import { BookDetail } from './components/BookDetail.tsx'
import { BookForm } from './components/BookForm.tsx'
import { GameDetail } from './components/GameDetail.tsx'
import { GameForm } from './components/GameForm.tsx'
import { Poster } from './components/Poster.tsx'
import { Portability, type PortabilitySection } from './components/Portability.tsx'
import { SeriesDetail } from './components/SeriesDetail.tsx'
import { SeriesForm } from './components/SeriesForm.tsx'
import { TmdbSearchFlow } from './components/TmdbSearchFlow.tsx'
import { TmdbAssociationConfirm } from './components/TmdbAssociationConfirm.tsx'
import { LibraryExportButton } from './components/LibraryExportButton.tsx'
import { LibraryCsvExportButton } from './components/LibraryCsvExportButton.tsx'
import { updaterPreferencesService } from './data/updaterPreferences.ts'
import { tauriUpdaterService, type AvailableUpdate } from './data/updaterService.ts'
import { backupService, type BackupNotice } from './data/backupService.ts'
import { filmsRepository, type FilmLibrary } from './data/filmsRepository.ts'
import { profilesRepository, type ProfileSummary } from './data/profilesRepository.ts'
import {
  mediaRepository,
  type ArtworkSearchCriteria,
  type BookSearchCriteria,
  type GameSearchCriteria,
  type SeriesSearchCriteria,
} from './data/mediaRepository.ts'
import { LibraryImportButton } from './components/LibraryImportButton.tsx'
import { LibraryFilterPanel, type LibraryFilterPanelConfig } from './components/LibraryFilterPanel.tsx'
import { SavedViewsBar } from './components/SavedViewsBar.tsx'

import type { TmdbSearchCandidate, CachedFilmTmdbPresentation } from './data/tmdbService.ts'
import { associateFilmWithTmdb, getFilmTmdbCache } from './data/tmdbService.ts'
import {
  FILM_STATUS_LABELS,
  FILM_STATUSES,
  type Film,
} from './domain/film.ts'
import type { FilmFormValues, FilmWriteInput } from './domain/filmForm.ts'
import type { FilmMetadataProvenance } from './domain/filmMetadataAssistance.ts'
import {
  LIBRARY_VIEW_LABELS,
  RATED_LIBRARY_VIEWS,
  UNRATED_LIBRARY_VIEWS,
  type LibraryView,
} from './domain/libraryViews.ts'
import {
  EMPTY_LIBRARY_FILTERS,
  hasActiveFilters,
  normalizeLibraryFilters,
  type LibraryFilters,
} from './domain/libraryFilters.ts'
import {
  SERIES_CATEGORY_LABELS,
  SERIES_STATUS_LABELS,
  SERIES_STATUSES,
  type Series,
  type SeriesCategory,
} from './domain/series.ts'
import type { SeriesWriteInput } from './domain/seriesForm.ts'
import {
  BOOK_CATEGORY_LABELS,
  BOOK_STATUS_LABELS,
  BOOK_STATUSES,
  type Book,
  type BookCategory,
} from './domain/book.ts'
import type { BookWriteInput } from './domain/bookForm.ts'
import {
  buildGamePlatformFilters,
  buildGamePlatformSuggestions,
  GAME_STATUS_LABELS,
  GAME_STATUSES,
  type Game,
} from './domain/game.ts'
import type { GameWriteInput } from './domain/gameForm.ts'
import {
  ARTWORK_FORMS,
  ARTWORK_FORM_LABELS,
  ARTWORK_STATUS_LABELS,
  ARTWORK_STATUSES,
  type Artwork,
} from './domain/artwork.ts'
import type { ArtworkWriteInput } from './domain/artworkForm.ts'
import './styles.css'

type IconName = 'art' | 'book' | 'film' | 'game' | 'home' | 'search' | 'series' | 'settings'
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
  seriesCount: number | null
  bookCount: number | null
  gameCount: number | null
  artworkCount: number | null
  currentProfileName: string | null
  activeItem: 'artworks' | 'books' | 'games' | 'home' | 'library' | 'series' | 'settings'
  onHome: () => void
  onLibrary: () => void
  onSeries: () => void
  onBooks: () => void
  onGames: () => void
  onArtworks: () => void
  onSettings: () => void
  settingsSection: SettingsSection
  onSettingsSection: (section: SettingsSection) => void
  onReturnToLibrary: () => void
}

function Sidebar({
  count,
  seriesCount,
  bookCount,
  gameCount,
  artworkCount,
  currentProfileName,
  activeItem,
  onHome,
  onLibrary,
  onSeries,
  onBooks,
  onGames,
  onArtworks,
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
          <button
            className={`nav-item ${activeItem === 'series' ? 'active' : ''}`}
            type="button"
            onClick={onSeries}
            aria-current={activeItem === 'series' ? 'page' : undefined}
          >
            {icon('series')} Séries
            {seriesCount !== null && <span className="nav-count">{seriesCount}</span>}
          </button>
          <button
            className={`nav-item ${activeItem === 'books' ? 'active' : ''}`}
            type="button"
            onClick={onBooks}
            aria-current={activeItem === 'books' ? 'page' : undefined}
          >
            {icon('book')} Livres
            {bookCount !== null && <span className="nav-count">{bookCount}</span>}
          </button>
          <button
            className={`nav-item ${activeItem === 'games' ? 'active' : ''}`}
            type="button"
            onClick={onGames}
            aria-current={activeItem === 'games' ? 'page' : undefined}
          >
            {icon('game')} Jeux
            {gameCount !== null && <span className="nav-count">{gameCount}</span>}
          </button>
          <button
            className={`nav-item ${activeItem === 'artworks' ? 'active' : ''}`}
            type="button"
            onClick={onArtworks}
            aria-current={activeItem === 'artworks' ? 'page' : undefined}
          >
            {icon('art')} Art
            {artworkCount !== null && <span className="nav-count">{artworkCount}</span>}
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
  const displayPosterUrl = tmdbCache?.selectedPosterUrl ?? tmdbCache?.presentation.posterUrl ?? film.posterUrl

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

type OnboardingProps = {
  onProfileReady: () => void
}

/** Écran de premier lancement : créer un profil ou importer une bibliothèque. */
function Onboarding({ onProfileReady }: OnboardingProps) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await profilesRepository.create(trimmed)
      onProfileReady()
    } catch (cause) {
      console.error('Impossible de créer le profil de premier lancement.', cause)
      setError(cause instanceof Error ? cause.message : 'Le profil n’a pas pu être créé.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="main onboarding-main" aria-label="Premier lancement">
      <div className="onboarding-content">
        <p className="eyebrow">Bienvenue</p>
        <h1 className="display-title">Sylloge</h1>
        <p className="onboarding-intro">
          Votre bibliothèque culturelle personnelle, locale et durable. Commencez par créer un profil :
          il regroupera vos cinq collections (Films, Séries, Livres, Jeux et Art) sur cet appareil.
        </p>
        <form className="onboarding-form" onSubmit={createProfile}>
          <label>
            <span>Nom du profil</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Par exemple votre prénom"
              maxLength={60}
              autoFocus
            />
          </label>
          <button className="primary-button" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Création…' : 'Créer mon profil'}
          </button>
        </form>
        {error && <p className="inline-report error" role="alert">{error}</p>}
        <p className="onboarding-hint">
          Vous pourrez ensuite importer une bibliothèque existante depuis les Paramètres, ou ajouter vos œuvres à la main.
        </p>
      </div>
    </main>
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

type LibraryViewTabsProps = {
  views: readonly LibraryView[]
  current: LibraryView
  ariaLabel: string
  onChange: (view: LibraryView) => void
}

/** Rangée de vues partagée par les cinq bibliothèques (jalon 0.4.19). */
function LibraryViewTabs({ views, current, ariaLabel, onChange }: LibraryViewTabsProps) {
  return (
    <div className="filters library-views" role="group" aria-label={ariaLabel}>
      {views.map((view) => (
        <button
          className={`filter ${current === view ? 'active' : ''}`}
          type="button"
          aria-pressed={current === view}
          key={view}
          onClick={() => onChange(view)}
        >
          {LIBRARY_VIEW_LABELS[view]}
        </button>
      ))}
    </div>
  )
}

type LibraryContext = {
  query: string
  view: LibraryView
  filters?: LibraryFilters
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
  onLibraryChanged: () => void
}

function FilmsLibrary({
  library,
  context,
  searchState,
  onContextChange,
  onRetrySearch,
  onCreate,
  onOpen,
  onLibraryChanged,
}: FilmsLibraryProps) {
  const isUnfiltered = context.query.trim() === '' && context.view === 'all' && !hasActiveFilters(normalizeLibraryFilters(context.filters))
  const resultCount = searchState.status === 'ready' ? searchState.films.length : null

  return (
    <main className="main library-main" aria-label={`Bibliothèque Films du profil ${library.profile.name}`}>
      <header className="library-header">
        <div>
          <p className="eyebrow">Collection personnelle</p>
          <h1 className="display-title">Films</h1>
        </div>
        <div className="library-header-actions">
          <LibraryImportButton
            kind="films"
            buttonLabel="Importer"
            mediumLabel="film"
            profileId={library.profile.id}
            profileName={library.profile.name}
            existing={library.films}
            onDone={onLibraryChanged}
          />
          <LibraryExportButton kind="films" profileId={library.profile.id} />
          <LibraryCsvExportButton kind="films" profileId={library.profile.id} />
          <button className="primary-button" type="button" onClick={onCreate}>Ajouter un film</button>
        </div>
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
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <LibraryViewTabs
              views={RATED_LIBRARY_VIEWS}
              current={context.view}
              ariaLabel="Choisir la vue des films"
              onChange={(view) => onContextChange({ ...context, view })}
            />
          </div>

          <LibraryFilterPanel
            filters={context.filters}
            config={FILM_FILTER_PANEL_CONFIG}
            idPrefix="films-filters"
            onChange={(filters) => onContextChange({ ...context, filters })}
          />

          <SavedViewsBar
            profileId={library.profile.id}
            medium="films"
            current={{ view: context.view, mediumFilter: 'all', filters: normalizeLibraryFilters(context.filters) }}
            onApply={(criteria) => onContextChange({ ...context, view: criteria.view, filters: criteria.filters })}
          />

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
                onClick={() => onContextChange({ query: '', view: 'all', filters: EMPTY_LIBRARY_FILTERS })}
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
  | { status: 'no-profile' }
  | { status: 'error' }

type SeriesCategoryFilter = SeriesCategory | 'all'
type BookCategoryFilter = BookCategory | 'all'

const FILM_FILTER_PANEL_CONFIG: LibraryFilterPanelConfig = {
  statusOptions: FILM_STATUSES.map((status) => ({ value: status, label: FILM_STATUS_LABELS[status] })),
  showRating: true,
  showYear: true,
  personalDateLabel: 'Visionnage',
  specificTextField: { label: 'Réalisation', placeholder: 'Nom du réalisateur ou de la réalisatrice' },
  showLocation: false,
  showExhibition: false,
}

const SERIES_FILTER_PANEL_CONFIG: LibraryFilterPanelConfig = {
  statusOptions: SERIES_STATUSES.map((status) => ({ value: status, label: SERIES_STATUS_LABELS[status] })),
  showRating: true,
  showYear: false,
  personalDateLabel: 'Début de visionnage',
  specificTextField: null,
  showLocation: false,
  showExhibition: false,
}

const BOOK_FILTER_PANEL_CONFIG: LibraryFilterPanelConfig = {
  statusOptions: BOOK_STATUSES.map((status) => ({ value: status, label: BOOK_STATUS_LABELS[status] })),
  showRating: true,
  showYear: true,
  personalDateLabel: 'Début de lecture',
  specificTextField: { label: 'Auteur', placeholder: 'Nom de l’auteur ou de l’autrice' },
  showLocation: false,
  showExhibition: false,
}

const GAME_FILTER_PANEL_CONFIG: LibraryFilterPanelConfig = {
  statusOptions: GAME_STATUSES.map((status) => ({ value: status, label: GAME_STATUS_LABELS[status] })),
  showRating: true,
  showYear: true,
  personalDateLabel: 'Jeu',
  specificTextField: null,
  showLocation: false,
  showExhibition: false,
}

const ARTWORK_FILTER_PANEL_CONFIG: LibraryFilterPanelConfig = {
  statusOptions: ARTWORK_STATUSES.map((status) => ({ value: status, label: ARTWORK_STATUS_LABELS[status] })),
  showRating: false,
  showYear: true,
  personalDateLabel: 'Découverte',
  specificTextField: { label: 'Artiste', placeholder: 'Nom de l’artiste' },
  showLocation: true,
  showExhibition: true,
}

const SERIES_CATEGORY_FILTERS: Array<{ id: SeriesCategoryFilter; label: string }> = [
  { id: 'all', label: 'Toutes' },
  { id: 'série télé', label: SERIES_CATEGORY_LABELS['série télé'] },
  { id: 'animation', label: SERIES_CATEGORY_LABELS.animation },
]

const BOOK_CATEGORY_FILTERS: Array<{ id: BookCategoryFilter; label: string }> = [
  { id: 'all', label: 'Tous' },
  { id: 'livre', label: BOOK_CATEGORY_LABELS.livre },
  { id: 'manga', label: BOOK_CATEGORY_LABELS.manga },
  { id: 'comics', label: BOOK_CATEGORY_LABELS.comics },
]

function SeriesCard({ series, onOpen }: { series: Series; onOpen: () => void }) {
  const progress = series.seasonsSeen !== null && series.seasonsTotal !== null
    ? `${series.seasonsSeen} / ${series.seasonsTotal} saisons`
    : null

  return (
    <button className="film-card" type="button" onClick={onOpen} aria-label={`Ouvrir la fiche de ${series.title}`}>
      <Poster title={series.title} src={series.posterUrl} />
      <span className="film-card-info">
        <span className="film-card-top">
          <b>{series.title}</b>
          {series.isFavorite && <i aria-label="Favori">♥</i>}
        </span>
        {series.showrunner && <small>{series.showrunner}</small>}
        <span className={`status-line ${series.status === 'à voir' ? 'to-discover' : ''}`}>
          {SERIES_STATUS_LABELS[series.status]}
          {progress ? ` · ${progress}` : ''}
        </span>
      </span>
    </button>
  )
}

type SeriesLibraryProps = {
  profileName: string
  collection: Series[]
  context: SeriesSearchCriteria
  searchState: SeriesSearchState
  onContextChange: (context: SeriesSearchCriteria) => void
  onRetrySearch: () => void
  onCreate: () => void
  onOpen: (series: Series) => void
  profileId: string
  onLibraryChanged: () => void
}

type SeriesSearchState =
  | { status: 'loading' }
  | { status: 'ready'; series: Series[] }
  | { status: 'error' }

function SeriesLibrary({
  profileName,
  collection,
  context,
  searchState,
  onContextChange,
  onRetrySearch,
  onCreate,
  onOpen,
  profileId,
  onLibraryChanged,
}: SeriesLibraryProps) {
  const isUnfiltered = context.query.trim() === '' && context.category === 'all' && context.view === 'all' && !hasActiveFilters(normalizeLibraryFilters(context.filters))
  const resultCount = searchState.status === 'ready' ? searchState.series.length : null

  return (
    <main className="main library-main" aria-label={`Bibliothèque Séries du profil ${profileName}`}>
      <header className="library-header">
        <div>
          <p className="eyebrow">Collection personnelle</p>
          <h1 className="display-title">Séries</h1>
        </div>
        <div className="library-header-actions">
          <LibraryImportButton
            kind="series"
            buttonLabel="Importer"
            mediumLabel="série"
            profileId={profileId}
            profileName={profileName}
            existing={collection}
            onDone={onLibraryChanged}
          />
          <LibraryExportButton kind="series" profileId={profileId} />
          <LibraryCsvExportButton kind="series" profileId={profileId} />
          <button className="primary-button" type="button" onClick={onCreate}>Ajouter une série</button>
        </div>
      </header>
      {collection.length === 0 && isUnfiltered ? (
        <div className="library-state empty-library">
          <p className="state-kicker">Collection personnelle</p>
          <h2>Votre bibliothèque Séries est vide.</h2>
          <p>Ajoutez une première série, avec un titre seulement si vous le souhaitez.</p>
          <button className="primary-button empty-action" type="button" onClick={onCreate}>Ajouter une série</button>
        </div>
      ) : (
        <>
          <div className="library-tools">
            <label className="search">
              {icon('search')}
              <span className="visually-hidden">Rechercher par titre, showrunner ou casting</span>
              <input
                type="search"
                value={context.query}
                placeholder="Titre, showrunner ou casting"
                onChange={(event) => onContextChange({ ...context, query: event.target.value })}
              />
            </label>
            <LibraryViewTabs
              views={RATED_LIBRARY_VIEWS}
              current={context.view}
              ariaLabel="Choisir la vue des séries"
              onChange={(view) => onContextChange({ ...context, view })}
            />
            <div className="filters" role="group" aria-label="Filtrer les séries">
              {SERIES_CATEGORY_FILTERS.map((filter) => (
                <button
                  className={`filter ${context.category === filter.id ? 'active' : ''}`}
                  type="button"
                  aria-pressed={context.category === filter.id}
                  key={filter.id}
                  onClick={() => onContextChange({ ...context, category: filter.id })}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <LibraryFilterPanel
            filters={context.filters}
            config={SERIES_FILTER_PANEL_CONFIG}
            idPrefix="series-filters"
            onChange={(filters) => onContextChange({ ...context, filters })}
          />

          <SavedViewsBar
            profileId={profileId}
            medium="series"
            current={{ view: context.view, mediumFilter: context.category, filters: normalizeLibraryFilters(context.filters) }}
            onApply={(criteria) => onContextChange({ ...context, view: criteria.view, category: criteria.mediumFilter as SeriesCategory | 'all', filters: criteria.filters })}
          />

          <div className="collection-meta" aria-live="polite">
            {resultCount === null ? <p>Recherche dans la bibliothèque locale…</p> : (
              <p>{resultCount} {resultCount === 1 ? 'série affichée' : 'séries affichées'}</p>
            )}
          </div>

          {searchState.status === 'loading' ? (
            <div className="results-state" role="status">Recherche dans SQLite…</div>
          ) : searchState.status === 'error' ? (
            <div className="results-state error-state" role="alert">
              <h2>La recherche locale a échoué.</h2>
              <p>Vos séries restent enregistrées. Réessayez pour relire les résultats depuis SQLite.</p>
              <button className="state-action" type="button" onClick={onRetrySearch}>Réessayer</button>
            </div>
          ) : searchState.series.length === 0 ? (
            <div className="results-state empty-results">
              <h2>Aucune série ne correspond.</h2>
              <p>Modifiez la recherche ou revenez à toutes les séries.</p>
              <button
                className="state-action"
                type="button"
                onClick={() => onContextChange({ query: '', category: 'all', view: 'all', filters: EMPTY_LIBRARY_FILTERS })}
              >
                Afficher toutes les séries
              </button>
            </div>
          ) : (
            <div className="film-grid" aria-busy="false">
              {searchState.series.map((series) => (
                <SeriesCard series={series} key={series.id} onOpen={() => onOpen(series)} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}

function BookCard({ book, onOpen }: { book: Book; onOpen: () => void }) {
  const attribution = [BOOK_CATEGORY_LABELS[book.category], book.author, book.year]
    .filter((value) => value !== null)
    .join(' · ')
  const progress = book.volumesRead !== null && book.volumesTotal !== null
    ? `${book.volumesRead} / ${book.volumesTotal} tomes`
    : null

  return (
    <button className="film-card" type="button" onClick={onOpen} aria-label={`Ouvrir la fiche de ${book.title}`}>
      <Poster title={book.title} src={book.coverUrl} label="Couverture" />
      <span className="film-card-info">
        <span className="film-card-top">
          <b>{book.title}</b>
          {book.isFavorite && <i aria-label="Favori">♥</i>}
        </span>
        {attribution && <small>{attribution}</small>}
        <span className={`status-line ${book.status === 'à lire' ? 'to-discover' : ''}`}>
          {BOOK_STATUS_LABELS[book.status]}
          {progress ? ` · ${progress}` : ''}
        </span>
      </span>
    </button>
  )
}

function GameCard({ game, onOpen }: { game: Game; onOpen: () => void }) {
  const attribution = [game.platform, game.developer, game.year]
    .filter((value) => value !== null)
    .join(' · ')

  return (
    <button className="film-card" type="button" onClick={onOpen} aria-label={`Ouvrir la fiche de ${game.title}`}>
      <Poster title={game.title} src={game.coverUrl} label="Couverture" />
      <span className="film-card-info">
        <span className="film-card-top">
          <b>{game.title}</b>
          {game.isFavorite && <i aria-label="Favori">♥</i>}
        </span>
        {attribution && <small>{attribution}</small>}
        <span className={`status-line ${game.status === 'à jouer' ? 'to-discover' : ''}`}>
          {GAME_STATUS_LABELS[game.status]}
        </span>
      </span>
    </button>
  )
}

type GamesLibraryProps = {
  profileName: string
  collection: Game[]
  context: GameSearchCriteria
  searchState: GameSearchState
  onContextChange: (context: GameSearchCriteria) => void
  onRetrySearch: () => void
  onCreate: () => void
  onOpen: (game: Game) => void
  profileId: string
  onLibraryChanged: () => void
}

type GameSearchState =
  | { status: 'loading' }
  | { status: 'ready'; games: Game[] }
  | { status: 'error' }

function GamesLibrary({
  profileName,
  collection,
  context,
  searchState,
  onContextChange,
  onRetrySearch,
  onCreate,
  onOpen,
  profileId,
  onLibraryChanged,
}: GamesLibraryProps) {
  const isUnfiltered = context.query.trim() === '' && context.platform === 'all' && context.view === 'all' && !hasActiveFilters(normalizeLibraryFilters(context.filters))
  const resultCount = searchState.status === 'ready' ? searchState.games.length : null
  const platforms = buildGamePlatformFilters(collection)

  return (
    <main className="main library-main" aria-label={`Bibliothèque Jeux du profil ${profileName}`}>
      <header className="library-header">
        <div>
          <p className="eyebrow">Collection personnelle</p>
          <h1 className="display-title">Jeux</h1>
        </div>
        <div className="library-header-actions">
          <LibraryImportButton
            kind="games"
            buttonLabel="Importer"
            mediumLabel="jeu"
            profileId={profileId}
            profileName={profileName}
            existing={collection}
            onDone={onLibraryChanged}
          />
          <LibraryExportButton kind="games" profileId={profileId} />
          <LibraryCsvExportButton kind="games" profileId={profileId} />
          <button className="primary-button" type="button" onClick={onCreate}>Ajouter un jeu</button>
        </div>
      </header>
      {collection.length === 0 && isUnfiltered ? (
        <div className="library-state empty-library">
          <p className="state-kicker">Collection personnelle</p>
          <h2>Votre bibliothèque Jeux est vide.</h2>
          <p>Ajoutez un premier jeu, avec un titre seulement si vous le souhaitez.</p>
          <button className="primary-button empty-action" type="button" onClick={onCreate}>Ajouter un jeu</button>
        </div>
      ) : (
        <>
          <div className="library-tools">
            <label className="search">
              {icon('search')}
              <span className="visually-hidden">Rechercher par titre, studio ou plateforme</span>
              <input
                type="search"
                value={context.query}
                placeholder="Titre, studio ou plateforme"
                onChange={(event) => onContextChange({ ...context, query: event.target.value })}
              />
            </label>
            <LibraryViewTabs
              views={RATED_LIBRARY_VIEWS}
              current={context.view}
              ariaLabel="Choisir la vue des jeux"
              onChange={(view) => onContextChange({ ...context, view })}
            />
            <div className="filters collection-filters" role="group" aria-label="Filtrer les jeux par plateforme">
              {['all', ...platforms].map((platform) => (
                <button
                  className={`filter ${context.platform === platform ? 'active' : ''}`}
                  type="button"
                  aria-pressed={context.platform === platform}
                  key={platform}
                  onClick={() => onContextChange({ ...context, platform })}
                >
                  {platform === 'all' ? 'Toutes' : platform}
                </button>
              ))}
            </div>
          </div>

          <LibraryFilterPanel
            filters={context.filters}
            config={GAME_FILTER_PANEL_CONFIG}
            idPrefix="games-filters"
            onChange={(filters) => onContextChange({ ...context, filters })}
          />

          <SavedViewsBar
            profileId={profileId}
            medium="games"
            current={{ view: context.view, mediumFilter: context.platform, filters: normalizeLibraryFilters(context.filters) }}
            onApply={(criteria) => onContextChange({ ...context, view: criteria.view, platform: criteria.mediumFilter, filters: criteria.filters })}
          />

          <div className="collection-meta" aria-live="polite">
            {resultCount === null ? <p>Recherche dans la bibliothèque locale…</p> : (
              <p>{resultCount} {resultCount === 1 ? 'jeu affiché' : 'jeux affichés'}</p>
            )}
          </div>

          {searchState.status === 'loading' ? (
            <div className="results-state" role="status">Recherche dans SQLite…</div>
          ) : searchState.status === 'error' ? (
            <div className="results-state error-state" role="alert">
              <h2>La recherche locale a échoué.</h2>
              <p>Vos jeux restent enregistrés. Réessayez pour relire les résultats depuis SQLite.</p>
              <button className="state-action" type="button" onClick={onRetrySearch}>Réessayer</button>
            </div>
          ) : searchState.games.length === 0 ? (
            <div className="results-state empty-results">
              <h2>Aucun jeu ne correspond.</h2>
              <p>Modifiez la recherche ou revenez à tous les jeux.</p>
              <button className="state-action" type="button" onClick={() => onContextChange({ query: '', platform: 'all', view: 'all', filters: EMPTY_LIBRARY_FILTERS })}>
                Afficher tous les jeux
              </button>
            </div>
          ) : (
            <div className="film-grid" aria-busy="false">
            {searchState.games.map((game) => (
              <GameCard game={game} key={game.id} onOpen={() => onOpen(game)} />
            ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}

function ArtworkCard({ artwork, onOpen }: { artwork: Artwork; onOpen: () => void }) {
  const attribution = [ARTWORK_FORM_LABELS[artwork.form], artwork.artist, artwork.year]
    .filter((value) => value !== null)
    .join(' · ')

  return (
    <button className="film-card" type="button" onClick={onOpen} aria-label={`Ouvrir la fiche de ${artwork.title}`}>
      <Poster title={artwork.title} src={artwork.imageUrl} label="Visuel" />
      <span className="film-card-info">
        <span className="film-card-top">
          <b>{artwork.title}</b>
          {artwork.isFavorite && <i aria-label="Favori">♥</i>}
        </span>
        {attribution && <small>{attribution}</small>}
        <span className={`status-line ${artwork.status === 'à découvrir' ? 'to-discover' : ''}`}>
          {ARTWORK_STATUS_LABELS[artwork.status]}
        </span>
      </span>
    </button>
  )
}

type ArtworksLibraryProps = {
  profileName: string
  collection: Artwork[]
  context: ArtworkSearchCriteria
  searchState: ArtworkSearchState
  onContextChange: (context: ArtworkSearchCriteria) => void
  onRetrySearch: () => void
  onCreate: () => void
  onOpen: (artwork: Artwork) => void
  profileId: string
  onLibraryChanged: () => void
}

type ArtworkSearchState =
  | { status: 'loading' }
  | { status: 'ready'; artworks: Artwork[] }
  | { status: 'error' }

function ArtworksLibrary({
  profileName,
  collection,
  context,
  searchState,
  onContextChange,
  onRetrySearch,
  onCreate,
  onOpen,
  profileId,
  onLibraryChanged,
}: ArtworksLibraryProps) {
  const isUnfiltered = context.query.trim() === '' && context.form === 'all' && context.view === 'all' && !hasActiveFilters(normalizeLibraryFilters(context.filters))
  const resultCount = searchState.status === 'ready' ? searchState.artworks.length : null

  return (
    <main className="main library-main" aria-label={`Bibliothèque Art du profil ${profileName}`}>
      <header className="library-header">
        <div>
          <p className="eyebrow">Collection personnelle</p>
          <h1 className="display-title">Art</h1>
        </div>
        <div className="library-header-actions">
          <LibraryImportButton
            kind="artworks"
            buttonLabel="Importer"
            mediumLabel="œuvre"
            profileId={profileId}
            profileName={profileName}
            existing={collection}
            onDone={onLibraryChanged}
          />
          <LibraryExportButton kind="artworks" profileId={profileId} />
          <LibraryCsvExportButton kind="artworks" profileId={profileId} />
          <button className="primary-button" type="button" onClick={onCreate}>Ajouter une œuvre</button>
        </div>
      </header>
      {collection.length === 0 && isUnfiltered ? (
        <div className="library-state empty-library">
          <p className="state-kicker">Collection personnelle</p>
          <h2>Votre bibliothèque Art est vide.</h2>
          <p>Ajoutez une première œuvre, avec un titre seulement si vous le souhaitez.</p>
          <button className="primary-button empty-action" type="button" onClick={onCreate}>Ajouter une œuvre</button>
        </div>
      ) : (
        <>
          <div className="library-tools">
            <label className="search">
              {icon('search')}
              <span className="visually-hidden">Rechercher par titre, artiste, lieu ou exposition</span>
              <input
                type="search"
                value={context.query}
                placeholder="Titre, artiste, lieu ou exposition"
                onChange={(event) => onContextChange({ ...context, query: event.target.value })}
              />
            </label>
            <LibraryViewTabs
              views={UNRATED_LIBRARY_VIEWS}
              current={context.view}
              ariaLabel="Choisir la vue des œuvres"
              onChange={(view) => onContextChange({ ...context, view })}
            />
            <div className="filters collection-filters" role="group" aria-label="Filtrer les œuvres par forme">
              {(['all', ...ARTWORK_FORMS] as const).map((form) => (
                <button
                  className={`filter ${context.form === form ? 'active' : ''}`}
                  type="button"
                  aria-pressed={context.form === form}
                  key={form}
                  onClick={() => onContextChange({ ...context, form })}
                >
                  {form === 'all' ? 'Toutes' : ARTWORK_FORM_LABELS[form]}
                </button>
              ))}
            </div>
          </div>

          <LibraryFilterPanel
            filters={context.filters}
            config={ARTWORK_FILTER_PANEL_CONFIG}
            idPrefix="artworks-filters"
            onChange={(filters) => onContextChange({ ...context, filters })}
          />

          <SavedViewsBar
            profileId={profileId}
            medium="artworks"
            current={{ view: context.view, mediumFilter: context.form, filters: normalizeLibraryFilters(context.filters) }}
            onApply={(criteria) => onContextChange({ ...context, view: criteria.view, form: criteria.mediumFilter as ArtworkSearchCriteria['form'], filters: criteria.filters })}
          />

          <div className="collection-meta" aria-live="polite">
            {resultCount === null ? <p>Recherche dans la bibliothèque locale…</p> : (
              <p>{resultCount} {resultCount === 1 ? 'œuvre affichée' : 'œuvres affichées'}</p>
            )}
          </div>

          {searchState.status === 'loading' ? (
            <div className="results-state" role="status">Recherche dans SQLite…</div>
          ) : searchState.status === 'error' ? (
            <div className="results-state error-state" role="alert">
              <h2>La recherche locale a échoué.</h2>
              <p>Vos œuvres restent enregistrées. Réessayez pour relire les résultats depuis SQLite.</p>
              <button className="state-action" type="button" onClick={onRetrySearch}>Réessayer</button>
            </div>
          ) : searchState.artworks.length === 0 ? (
            <div className="results-state empty-results">
              <h2>Aucune œuvre ne correspond.</h2>
              <p>Modifiez la recherche ou revenez à toutes les œuvres.</p>
              <button className="state-action" type="button" onClick={() => onContextChange({ query: '', form: 'all', view: 'all', filters: EMPTY_LIBRARY_FILTERS })}>
                Afficher toutes les œuvres
              </button>
            </div>
          ) : (
            <div className="film-grid" aria-busy="false">
            {searchState.artworks.map((artwork) => (
              <ArtworkCard artwork={artwork} key={artwork.id} onOpen={() => onOpen(artwork)} />
            ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}

type BooksLibraryProps = {
  profileName: string
  collection: Book[]
  context: BookSearchCriteria
  searchState: BookSearchState
  onContextChange: (context: BookSearchCriteria) => void
  onRetrySearch: () => void
  onCreate: () => void
  onOpen: (book: Book) => void
  profileId: string
  onLibraryChanged: () => void
}

type BookSearchState =
  | { status: 'loading' }
  | { status: 'ready'; books: Book[] }
  | { status: 'error' }

function BooksLibrary({
  profileName,
  collection,
  context,
  searchState,
  onContextChange,
  onRetrySearch,
  onCreate,
  onOpen,
  profileId,
  onLibraryChanged,
}: BooksLibraryProps) {
  const isUnfiltered = context.query.trim() === '' && context.category === 'all' && context.view === 'all' && !hasActiveFilters(normalizeLibraryFilters(context.filters))
  const resultCount = searchState.status === 'ready' ? searchState.books.length : null

  return (
    <main className="main library-main" aria-label={`Bibliothèque Livres du profil ${profileName}`}>
      <header className="library-header">
        <div>
          <p className="eyebrow">Collection personnelle</p>
          <h1 className="display-title">Livres</h1>
        </div>
        <div className="library-header-actions">
          <LibraryImportButton
            kind="books"
            buttonLabel="Importer"
            mediumLabel="livre"
            profileId={profileId}
            profileName={profileName}
            existing={collection}
            onDone={onLibraryChanged}
          />
          <LibraryExportButton kind="books" profileId={profileId} />
          <LibraryCsvExportButton kind="books" profileId={profileId} />
          <button className="primary-button" type="button" onClick={onCreate}>Ajouter un livre</button>
        </div>
      </header>
      {collection.length === 0 && isUnfiltered ? (
        <div className="library-state empty-library">
          <p className="state-kicker">Collection personnelle</p>
          <h2>Votre bibliothèque Livres est vide.</h2>
          <p>Ajoutez un premier livre, manga ou comics, avec un titre seulement si vous le souhaitez.</p>
          <button className="primary-button empty-action" type="button" onClick={onCreate}>Ajouter un livre</button>
        </div>
      ) : (
        <>
          <div className="library-tools">
            <label className="search">
              {icon('search')}
              <span className="visually-hidden">Rechercher par titre, auteur ou résumé</span>
              <input
                type="search"
                value={context.query}
                placeholder="Titre, auteur ou résumé"
                onChange={(event) => onContextChange({ ...context, query: event.target.value })}
              />
            </label>
            <LibraryViewTabs
              views={RATED_LIBRARY_VIEWS}
              current={context.view}
              ariaLabel="Choisir la vue des livres"
              onChange={(view) => onContextChange({ ...context, view })}
            />
            <div className="filters" role="group" aria-label="Filtrer les livres">
              {BOOK_CATEGORY_FILTERS.map((filter) => (
                <button
                  className={`filter ${context.category === filter.id ? 'active' : ''}`}
                  type="button"
                  aria-pressed={context.category === filter.id}
                  key={filter.id}
                  onClick={() => onContextChange({ ...context, category: filter.id })}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <LibraryFilterPanel
            filters={context.filters}
            config={BOOK_FILTER_PANEL_CONFIG}
            idPrefix="books-filters"
            onChange={(filters) => onContextChange({ ...context, filters })}
          />

          <SavedViewsBar
            profileId={profileId}
            medium="books"
            current={{ view: context.view, mediumFilter: context.category, filters: normalizeLibraryFilters(context.filters) }}
            onApply={(criteria) => onContextChange({ ...context, view: criteria.view, category: criteria.mediumFilter as BookCategory | 'all', filters: criteria.filters })}
          />

          <div className="collection-meta books-collection-meta" aria-live="polite">
            {resultCount === null ? <p>Recherche dans la bibliothèque locale…</p> : (
              <p>{resultCount} {resultCount === 1 ? 'livre affiché' : 'livres affichés'}</p>
            )}
          </div>

          {searchState.status === 'loading' ? (
            <div className="results-state" role="status">Recherche dans SQLite…</div>
          ) : searchState.status === 'error' ? (
            <div className="results-state error-state" role="alert">
              <h2>La recherche locale a échoué.</h2>
              <p>Vos livres restent enregistrés. Réessayez pour relire les résultats depuis SQLite.</p>
              <button className="state-action" type="button" onClick={onRetrySearch}>Réessayer</button>
            </div>
          ) : searchState.books.length === 0 ? (
            <div className="results-state empty-results">
              <h2>Aucun livre ne correspond.</h2>
              <p>Modifiez la recherche ou revenez à tous les livres.</p>
              <button
                className="state-action"
                type="button"
                onClick={() => onContextChange({ query: '', category: 'all', view: 'all', filters: EMPTY_LIBRARY_FILTERS })}
              >
                Afficher tous les livres
              </button>
            </div>
          ) : (
            <div className="film-grid" aria-busy="false">
              {searchState.books.map((book) => (
                <BookCard book={book} key={book.id} onOpen={() => onOpen(book)} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}

type View =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'series' }
  | { name: 'settings' }
  | { name: 'create'; initialValues?: FilmFormValues; provenance?: FilmMetadataProvenance | null }
  | { name: 'tmdb-search' }
  | { name: 'tmdb-confirm'; candidate: TmdbSearchCandidate }
  | { name: 'tmdb-associate'; filmId: string }
  | { name: 'detail'; filmId: string; returnTo: 'home' | 'library' }
  | { name: 'edit'; filmId: string; returnTo: 'home' | 'library' }
  | { name: 'series-create' }
  | { name: 'series-detail'; seriesId: string }
  | { name: 'series-edit'; seriesId: string }
  | { name: 'books' }
  | { name: 'book-create' }
  | { name: 'book-detail'; bookId: string }
  | { name: 'book-edit'; bookId: string }
  | { name: 'games' }
  | { name: 'game-create' }
  | { name: 'game-detail'; gameId: string }
  | { name: 'game-edit'; gameId: string }
  | { name: 'artworks' }
  | { name: 'artwork-create' }
  | { name: 'artwork-detail'; artworkId: string }
  | { name: 'artwork-edit'; artworkId: string }

function sortFilms(films: Film[]): Film[] {
  return [...films].sort((first, second) => first.title.localeCompare(second.title, 'fr', { sensitivity: 'base' }))
}

function sortBooks(books: Book[]): Book[] {
  return [...books].sort((first, second) => first.title.localeCompare(second.title, 'fr', { sensitivity: 'base' }))
}

function sortGames(games: Game[]): Game[] {
  return [...games].sort((first, second) => first.title.localeCompare(second.title, 'fr', { sensitivity: 'base' }))
}

function sortArtworks(artworks: Artwork[]): Artwork[] {
  return [...artworks].sort((first, second) => first.title.localeCompare(second.title, 'fr', { sensitivity: 'base' }))
}

type SqliteFilmDetailProps = {
  profileId: string
  filmId: string
  onBack: () => void
  backLabel: string
  onEdit: () => void
  onDelete: () => Promise<void>
  onAssociateTmdb: () => void
  tmdbNotice?: string | null
}

function SqliteFilmDetail({ profileId, filmId, onBack, backLabel, onEdit, onDelete, onAssociateTmdb, tmdbNotice }: SqliteFilmDetailProps) {
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
    return <FilmDetail film={state.film} onBack={onBack} backLabel={backLabel} onEdit={onEdit} onDelete={onDelete} onAssociateTmdb={onAssociateTmdb} tmdbNotice={tmdbNotice} />
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
  const [libraryContext, setLibraryContext] = useState<LibraryContext>({ query: '', view: 'all', filters: EMPTY_LIBRARY_FILTERS })
  const [seriesCollection, setSeriesCollection] = useState<Series[]>([])
  const [seriesSearchState, setSeriesSearchState] = useState<SeriesSearchState>({ status: 'loading' })
  const [seriesContext, setSeriesContext] = useState<SeriesSearchCriteria>({ query: '', category: 'all', view: 'all', filters: EMPTY_LIBRARY_FILTERS })
  const [seriesSearchAttempt, setSeriesSearchAttempt] = useState(0)
  const [bookCollection, setBookCollection] = useState<Book[]>([])
  const [bookSearchState, setBookSearchState] = useState<BookSearchState>({ status: 'loading' })
  const [bookContext, setBookContext] = useState<BookSearchCriteria>({ query: '', category: 'all', view: 'all', filters: EMPTY_LIBRARY_FILTERS })
  const [bookSearchAttempt, setBookSearchAttempt] = useState(0)
  const [gameCollection, setGameCollection] = useState<Game[]>([])
  const [gameSearchState, setGameSearchState] = useState<GameSearchState>({ status: 'loading' })
  const [gameContext, setGameContext] = useState<GameSearchCriteria>({ query: '', platform: 'all', view: 'all', filters: EMPTY_LIBRARY_FILTERS })
  const [gameSearchAttempt, setGameSearchAttempt] = useState(0)
  const [artworkCollection, setArtworkCollection] = useState<Artwork[]>([])
  const [artworkSearchState, setArtworkSearchState] = useState<ArtworkSearchState>({ status: 'loading' })
  const [artworkContext, setArtworkContext] = useState<ArtworkSearchCriteria>({ query: '', form: 'all', view: 'all', filters: EMPTY_LIBRARY_FILTERS })
  const [artworkSearchAttempt, setArtworkSearchAttempt] = useState(0)
  const [view, setView] = useState<View>({ name: 'home' })
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('profiles')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [backupNotice, setBackupNotice] = useState<BackupNotice | null>(null)
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null)
  const [associatingFilm, setAssociatingFilm] = useState<Film | null>(null)
  const [tmdbNotice, setTmdbNotice] = useState<{ filmId: string; message: string } | null>(null)
  const libraryScrollPosition = useRef(0)
  const restoreLibraryScroll = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLibraryState({ status: 'loading' })

    profilesRepository.list().then(
      async (availableProfiles) => {
        if (cancelled) return
        setProfiles(availableProfiles)

        if (availableProfiles.length === 0) {
          setLibraryState({ status: 'no-profile' })
          return
        }

        try {
          const library = await filmsRepository.loadCurrentLibrary()
          if (!cancelled) setLibraryState({ status: 'ready', library })
        } catch (error) {
          // Aucun profil courant valide : ouvrir le premier profil disponible.
          console.warn('Aucun profil courant valide, ouverture du premier profil.', error)
          try {
            await profilesRepository.open(availableProfiles[0].id)
            const library = await filmsRepository.loadCurrentLibrary()
            if (!cancelled) setLibraryState({ status: 'ready', library })
          } catch (secondError) {
            console.error('Impossible de charger la bibliothèque Films depuis SQLite.', secondError)
            if (!cancelled) setLibraryState({ status: 'error' })
          }
        }
      },
      (error: unknown) => {
        console.error('Impossible de charger les profils depuis SQLite.', error)
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

    mediaRepository.listSeries(libraryState.library.profile.id).then(
      (series) => { if (!cancelled) setSeriesCollection(series) },
      (error: unknown) => {
        console.error('Impossible de charger les séries depuis SQLite.', error)
        if (!cancelled) setSeriesCollection([])
      },
    )

    return () => {
      cancelled = true
    }
  }, [libraryState])

  useEffect(() => {
    if (libraryState.status !== 'ready') return
    let cancelled = false

    mediaRepository.listBooks(libraryState.library.profile.id).then(
      (books) => { if (!cancelled) setBookCollection(books) },
      (error: unknown) => {
        console.error('Impossible de charger les livres depuis SQLite.', error)
        if (!cancelled) setBookCollection([])
      },
    )

    return () => {
      cancelled = true
    }
  }, [libraryState])

  useEffect(() => {
    if (libraryState.status !== 'ready') return
    let cancelled = false

    mediaRepository.listGames(libraryState.library.profile.id).then(
      (games) => { if (!cancelled) setGameCollection(sortGames(games)) },
      (error: unknown) => {
        console.error('Impossible de charger les jeux depuis SQLite.', error)
        if (!cancelled) setGameCollection([])
      },
    )

    return () => {
      cancelled = true
    }
  }, [libraryState])

  useEffect(() => {
    if (libraryState.status !== 'ready') return
    let cancelled = false

    mediaRepository.listArtworks(libraryState.library.profile.id).then(
      (artworks) => { if (!cancelled) setArtworkCollection(sortArtworks(artworks)) },
      (error: unknown) => {
        console.error('Impossible de charger les œuvres depuis SQLite.', error)
        if (!cancelled) setArtworkCollection([])
      },
    )

    return () => {
      cancelled = true
    }
  }, [libraryState])

  useEffect(() => {
    if (libraryState.status !== 'ready') return
    let cancelled = false
    setGameSearchState({ status: 'loading' })
    const timeout = window.setTimeout(() => {
      mediaRepository.searchGames(libraryState.library.profile.id, gameContext).then(
        (games) => {
          if (!cancelled) setGameSearchState({ status: 'ready', games })
        },
        (error: unknown) => {
          console.error('Impossible de rechercher les jeux dans SQLite.', error)
          if (!cancelled) setGameSearchState({ status: 'error' })
        },
      )
    }, gameContext.query ? 140 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [gameContext, gameSearchAttempt, libraryState])

  useEffect(() => {
    if (libraryState.status !== 'ready') return
    let cancelled = false
    setArtworkSearchState({ status: 'loading' })
    const timeout = window.setTimeout(() => {
      mediaRepository.searchArtworks(libraryState.library.profile.id, artworkContext).then(
        (artworks) => {
          if (!cancelled) setArtworkSearchState({ status: 'ready', artworks })
        },
        (error: unknown) => {
          console.error('Impossible de rechercher les œuvres dans SQLite.', error)
          if (!cancelled) setArtworkSearchState({ status: 'error' })
        },
      )
    }, artworkContext.query ? 140 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [artworkContext, artworkSearchAttempt, libraryState])

  useEffect(() => {
    if (libraryState.status !== 'ready') return
    let cancelled = false
    setSeriesSearchState({ status: 'loading' })
    const timeout = window.setTimeout(() => {
      mediaRepository.searchSeries(libraryState.library.profile.id, seriesContext).then(
        (series) => {
          if (!cancelled) setSeriesSearchState({ status: 'ready', series })
        },
        (error: unknown) => {
          console.error('Impossible de rechercher les séries dans SQLite.', error)
          if (!cancelled) setSeriesSearchState({ status: 'error' })
        },
      )
    }, seriesContext.query ? 140 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [seriesContext, libraryState, seriesSearchAttempt])

  useEffect(() => {
    if (libraryState.status !== 'ready') return
    let cancelled = false
    setBookSearchState({ status: 'loading' })
    const timeout = window.setTimeout(() => {
      mediaRepository.searchBooks(libraryState.library.profile.id, bookContext).then(
        (books) => {
          if (!cancelled) setBookSearchState({ status: 'ready', books })
        },
        (error: unknown) => {
          console.error('Impossible de rechercher les livres dans SQLite.', error)
          if (!cancelled) setBookSearchState({ status: 'error' })
        },
      )
    }, bookContext.query ? 140 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [bookContext, libraryState, bookSearchAttempt])

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
  const seriesCount = libraryState.status === 'ready' ? seriesCollection.length : null
  const bookCount = libraryState.status === 'ready' ? bookCollection.length : null
  const gameCount = libraryState.status === 'ready' ? gameCollection.length : null
  const artworkCount = libraryState.status === 'ready' ? artworkCollection.length : null
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
  } else if (libraryState.status === 'no-profile') {
    content = <Onboarding onProfileReady={() => setLoadAttempt((attempt) => attempt + 1)} />
  } else if (view.name === 'home') {
    content = (
      <Home
        library={libraryState.library}
        onOpen={(film) => leaveLibrary({ name: 'detail', filmId: film.id, returnTo: 'home' })}
      />
    )
  } else if (view.name === 'tmdb-search') {
    content = (
      <TmdbSearchFlow
        film={associatingFilm}
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
        onConfirm={(result) => {
          setAssociatingFilm(null)
          if (associatingFilm) {
            setView({ name: 'detail', filmId: associatingFilm.id, returnTo: 'library' })
          } else {
            setView({
              name: 'create',
              initialValues: result.initialValues?.values,
              provenance: result.initialValues?.provenance ?? null,
            })
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
          film={film}
          onSelectCandidate={(candidate) => setView({ name: 'tmdb-confirm', candidate })}
          onManual={() => {
            setAssociatingFilm(null)
            setView({ name: 'detail', filmId: film.id, returnTo: 'library' })
          }}
          onCancel={() => {
            setAssociatingFilm(null)
            setView({ name: 'detail', filmId: film.id, returnTo: 'library' })
          }}
        />
      )
    }
  } else if (view.name === 'create') {
    const { library } = libraryState
    content = (
      <FilmForm
        initialValues={view.initialValues}
        provenance={view.provenance}
        onCancel={returnToLibrary}
        onSave={async (input, provenance) => {
          const film = await filmsRepository.createFilm(library.profile.id, input, provenance)
          const updatedLibrary: FilmLibrary = { ...library, films: sortFilms([...library.films, film]) }
          setLibraryState({
            status: 'ready',
            library: updatedLibrary,
          })
          requestAutomaticBackup(updatedLibrary)
          setTmdbNotice(null)
          if (provenance) {
            try {
              await associateFilmWithTmdb(film.id, Number(provenance.providerId))
            } catch (error) {
              console.error('Le film a été créé mais son association TMDB a échoué.', error)
              setTmdbNotice({
                filmId: film.id,
                message: 'Le film a bien été créé, mais TMDB n’a pas pu être associé. La fiche reste intacte ; tu peux relancer l’association depuis cette page.',
              })
            }
          }
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
          setLibraryContext({ query: '', view: 'all', filters: EMPTY_LIBRARY_FILTERS })
          setSeriesContext({ query: '', category: 'all', view: 'all', filters: EMPTY_LIBRARY_FILTERS })
          setBookContext({ query: '', category: 'all', view: 'all', filters: EMPTY_LIBRARY_FILTERS })
          setGameContext({ query: '', platform: 'all', view: 'all', filters: EMPTY_LIBRARY_FILTERS })
          setArtworkContext({ query: '', form: 'all', view: 'all', filters: EMPTY_LIBRARY_FILTERS })
          setLibraryState({ status: 'ready', library: selectedLibrary })
        }}
        onImported={(importedLibrary) => {
          setLibraryContext({ query: '', view: 'all', filters: EMPTY_LIBRARY_FILTERS })
          setLibraryState({ status: 'ready', library: importedLibrary })
          requestAutomaticBackup(importedLibrary)
          profilesRepository.list().then(setProfiles, (error: unknown) => {
            console.error('Impossible de rafraîchir la liste des profils.', error)
          })
        }}
        onBackupNotice={setBackupNotice}
        availableUpdate={availableUpdate}
        onUpdateAvailable={setAvailableUpdate}
        onUpdateHandled={() => setAvailableUpdate(null)}
        onProfilesChanged={() => {
          profilesRepository.list().then(setProfiles, (error: unknown) => {
            console.error('Impossible de rafraîchir la liste des profils.', error)
          })
        }}
        onProfileDeleted={(deletedProfileId) => {
          if (deletedProfileId === libraryState.library.profile.id) {
            setLoadAttempt((attempt) => attempt + 1)
          }
        }}
        onLibraryChanged={() => setLoadAttempt((attempt) => attempt + 1)}
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
            setTmdbNotice(null)
            setAssociatingFilm(film)
            setView({ name: 'tmdb-associate', filmId: view.filmId })
          }
        }}
        tmdbNotice={tmdbNotice?.filmId === view.filmId ? tmdbNotice.message : null}
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
  } else if (view.name === 'series') {
    content = (
      <SeriesLibrary
        profileName={libraryState.library.profile.name}
        collection={seriesCollection}
        context={seriesContext}
        searchState={seriesSearchState}
        onContextChange={setSeriesContext}
        onRetrySearch={() => setSeriesSearchAttempt((attempt) => attempt + 1)}
        onCreate={() => leaveLibrary({ name: 'series-create' })}
        onOpen={(series) => leaveLibrary({ name: 'series-detail', seriesId: series.id })}
        profileId={libraryState.library.profile.id}
        onLibraryChanged={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    )
  } else if (view.name === 'series-create') {
    const { library } = libraryState
    content = (
      <SeriesForm
        onCancel={returnToLibrary}
        onSave={async (input: SeriesWriteInput) => {
          const series = await mediaRepository.createSeries(library.profile.id, input)
          setSeriesCollection((current) => [...current, series])
          requestAutomaticBackup(library)
          setView({ name: 'series-detail', seriesId: series.id })
          window.scrollTo({ top: 0 })
        }}
      />
    )
  } else if (view.name === 'series-detail') {
    const { library } = libraryState
    const series = seriesCollection.find((entry) => entry.id === view.seriesId)
    if (!series) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button" type="button" onClick={() => setView({ name: 'series' })}>
              ← Retour aux séries
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>Cette série ne peut pas être ouverte.</h2>
            <p>La fiche est absente ou SQLite n’a pas pu la relire.</p>
          </div>
        </main>
      )
    } else {
      content = (
        <SeriesDetail
          series={series}
          onBack={() => setView({ name: 'series' })}
          backLabel="← Retour aux séries"
          onEdit={() => setView({ name: 'series-edit', seriesId: view.seriesId })}
          onDelete={async () => {
            await mediaRepository.deleteSeries(library.profile.id, view.seriesId)
            setSeriesCollection((current) => current.filter((entry) => entry.id !== view.seriesId))
            requestAutomaticBackup(library)
            setView({ name: 'series' })
          }}
        />
      )
    }
  } else if (view.name === 'series-edit') {
    const { library } = libraryState
    const series = seriesCollection.find((entry) => entry.id === view.seriesId)
    if (!series) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button" type="button" onClick={() => setView({ name: 'series' })}>
              ← Retour aux séries
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>Cette série ne peut pas être modifiée.</h2>
            <p>La fiche n’est plus présente dans la bibliothèque locale.</p>
          </div>
        </main>
      )
    } else {
      content = (
        <SeriesForm
          series={series}
          onCancel={() => setView({ name: 'series-detail', seriesId: view.seriesId })}
          onSave={async (input: SeriesWriteInput) => {
            const updatedAt = await mediaRepository.updateSeries(library.profile.id, view.seriesId, input)
            const refreshed = await mediaRepository.getSeries(library.profile.id, view.seriesId)
            setSeriesCollection((current) => current.map((entry) => entry.id === view.seriesId
              ? (refreshed ?? { ...entry, ...input, updatedAt })
              : entry))
            requestAutomaticBackup(library)
            setView({ name: 'series-detail', seriesId: view.seriesId })
            window.scrollTo({ top: 0 })
          }}
        />
      )
    }
  } else if (view.name === 'books') {
    content = (
      <BooksLibrary
        profileName={libraryState.library.profile.name}
        collection={bookCollection}
        context={bookContext}
        searchState={bookSearchState}
        onContextChange={setBookContext}
        onRetrySearch={() => setBookSearchAttempt((attempt) => attempt + 1)}
        onCreate={() => leaveLibrary({ name: 'book-create' })}
        onOpen={(book) => leaveLibrary({ name: 'book-detail', bookId: book.id })}
        profileId={libraryState.library.profile.id}
        onLibraryChanged={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    )
  } else if (view.name === 'book-create') {
    const { library } = libraryState
    content = (
      <BookForm
        onCancel={() => setView({ name: 'books' })}
        onSave={async (input: BookWriteInput) => {
          const { quotes, ...bookInput } = input
          const book = await mediaRepository.createBook(library.profile.id, bookInput, quotes)
          setBookCollection((current) => sortBooks([...current, book]))
          setBookSearchAttempt((attempt) => attempt + 1)
          requestAutomaticBackup(library)
          setView({ name: 'book-detail', bookId: book.id })
          window.scrollTo({ top: 0 })
        }}
      />
    )
  } else if (view.name === 'book-detail') {
    const { library } = libraryState
    const book = bookCollection.find((entry) => entry.id === view.bookId)
    if (!book) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button" type="button" onClick={() => setView({ name: 'books' })}>
              ← Retour aux livres
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>Ce livre ne peut pas être ouvert.</h2>
            <p>La fiche est absente ou SQLite n’a pas pu la relire.</p>
          </div>
        </main>
      )
    } else {
      content = (
        <BookDetail
          book={book}
          onBack={() => setView({ name: 'books' })}
          onEdit={() => setView({ name: 'book-edit', bookId: view.bookId })}
          onDelete={async () => {
            await mediaRepository.deleteBook(library.profile.id, view.bookId)
            setBookCollection((current) => current.filter((entry) => entry.id !== view.bookId))
            setBookSearchAttempt((attempt) => attempt + 1)
            requestAutomaticBackup(library)
            setView({ name: 'books' })
          }}
        />
      )
    }
  } else if (view.name === 'book-edit') {
    const { library } = libraryState
    const book = bookCollection.find((entry) => entry.id === view.bookId)
    if (!book) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button" type="button" onClick={() => setView({ name: 'books' })}>
              ← Retour aux livres
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>Ce livre ne peut pas être modifié.</h2>
            <p>La fiche n’est plus présente dans la bibliothèque locale.</p>
          </div>
        </main>
      )
    } else {
      content = (
        <BookForm
          book={book}
          onCancel={() => setView({ name: 'book-detail', bookId: view.bookId })}
          onSave={async (input: BookWriteInput) => {
            const { quotes, ...bookInput } = input
            await mediaRepository.updateBook(library.profile.id, view.bookId, bookInput, quotes)
            const refreshed = await mediaRepository.getBook(library.profile.id, view.bookId)
            if (!refreshed) {
              throw new Error('Le livre enregistré ne peut pas être relu depuis SQLite.')
            }
            setBookCollection((current) => sortBooks(current.map((entry) => (
              entry.id === view.bookId ? refreshed : entry
            ))))
            setBookSearchAttempt((attempt) => attempt + 1)
            requestAutomaticBackup(library)
            setView({ name: 'book-detail', bookId: view.bookId })
            window.scrollTo({ top: 0 })
          }}
        />
      )
    }
  } else if (view.name === 'games') {
    content = (
      <GamesLibrary
        profileName={libraryState.library.profile.name}
        collection={gameCollection}
        context={gameContext}
        searchState={gameSearchState}
        onContextChange={setGameContext}
        onRetrySearch={() => setGameSearchAttempt((attempt) => attempt + 1)}
        onCreate={() => leaveLibrary({ name: 'game-create' })}
        onOpen={(game) => leaveLibrary({ name: 'game-detail', gameId: game.id })}
        profileId={libraryState.library.profile.id}
        onLibraryChanged={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    )
  } else if (view.name === 'game-create') {
    const { library } = libraryState
    content = (
      <GameForm
        platformSuggestions={buildGamePlatformSuggestions(gameCollection)}
        onCancel={() => setView({ name: 'games' })}
        onSave={async (input: GameWriteInput) => {
          const game = await mediaRepository.createGame(library.profile.id, input)
          setGameCollection((current) => sortGames([...current, game]))
          setGameSearchAttempt((attempt) => attempt + 1)
          requestAutomaticBackup(library)
          setView({ name: 'game-detail', gameId: game.id })
          window.scrollTo({ top: 0 })
        }}
      />
    )
  } else if (view.name === 'game-detail') {
    const { library } = libraryState
    const game = gameCollection.find((entry) => entry.id === view.gameId)
    if (!game) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button" type="button" onClick={() => setView({ name: 'games' })}>
              ← Retour aux jeux
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>Ce jeu ne peut pas être ouvert.</h2>
            <p>La fiche est absente ou SQLite n’a pas pu la relire.</p>
          </div>
        </main>
      )
    } else {
      content = (
        <GameDetail
          game={game}
          onBack={() => setView({ name: 'games' })}
          onEdit={() => setView({ name: 'game-edit', gameId: view.gameId })}
          onDelete={async () => {
            await mediaRepository.deleteGame(library.profile.id, view.gameId)
            setGameCollection((current) => current.filter((entry) => entry.id !== view.gameId))
            setGameSearchAttempt((attempt) => attempt + 1)
            requestAutomaticBackup(library)
            setView({ name: 'games' })
          }}
        />
      )
    }
  } else if (view.name === 'game-edit') {
    const { library } = libraryState
    const game = gameCollection.find((entry) => entry.id === view.gameId)
    if (!game) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button" type="button" onClick={() => setView({ name: 'games' })}>
              ← Retour aux jeux
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>Ce jeu ne peut pas être modifié.</h2>
            <p>La fiche n’est plus présente dans la bibliothèque locale.</p>
          </div>
        </main>
      )
    } else {
      content = (
        <GameForm
          game={game}
          platformSuggestions={buildGamePlatformSuggestions(gameCollection)}
          onCancel={() => setView({ name: 'game-detail', gameId: view.gameId })}
          onSave={async (input: GameWriteInput) => {
            await mediaRepository.updateGame(library.profile.id, view.gameId, input)
            const refreshed = await mediaRepository.getGame(library.profile.id, view.gameId)
            if (!refreshed) {
              throw new Error('Le jeu enregistré ne peut pas être relu depuis SQLite.')
            }
            setGameCollection((current) => sortGames(current.map((entry) => (
              entry.id === view.gameId ? refreshed : entry
            ))))
            setGameSearchAttempt((attempt) => attempt + 1)
            requestAutomaticBackup(library)
            setView({ name: 'game-detail', gameId: view.gameId })
            window.scrollTo({ top: 0 })
          }}
        />
      )
    }
  } else if (view.name === 'artworks') {
    content = (
      <ArtworksLibrary
        profileName={libraryState.library.profile.name}
        collection={artworkCollection}
        context={artworkContext}
        searchState={artworkSearchState}
        onContextChange={setArtworkContext}
        onRetrySearch={() => setArtworkSearchAttempt((attempt) => attempt + 1)}
        onCreate={() => leaveLibrary({ name: 'artwork-create' })}
        onOpen={(artwork) => leaveLibrary({ name: 'artwork-detail', artworkId: artwork.id })}
        profileId={libraryState.library.profile.id}
        onLibraryChanged={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    )
  } else if (view.name === 'artwork-create') {
    const { library } = libraryState
    content = (
      <ArtworkForm
        onCancel={() => setView({ name: 'artworks' })}
        onSave={async (input: ArtworkWriteInput) => {
          const artwork = await mediaRepository.createArtwork(library.profile.id, input)
          setArtworkCollection((current) => sortArtworks([...current, artwork]))
          setArtworkSearchAttempt((attempt) => attempt + 1)
          requestAutomaticBackup(library)
          setView({ name: 'artwork-detail', artworkId: artwork.id })
          window.scrollTo({ top: 0 })
        }}
      />
    )
  } else if (view.name === 'artwork-detail') {
    const { library } = libraryState
    const artwork = artworkCollection.find((entry) => entry.id === view.artworkId)
    if (!artwork) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button" type="button" onClick={() => setView({ name: 'artworks' })}>
              ← Retour à l’Art
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>Cette œuvre ne peut pas être ouverte.</h2>
            <p>La fiche est absente ou SQLite n’a pas pu la relire.</p>
          </div>
        </main>
      )
    } else {
      content = (
        <ArtworkDetail
          artwork={artwork}
          onBack={() => setView({ name: 'artworks' })}
          onEdit={() => setView({ name: 'artwork-edit', artworkId: view.artworkId })}
          onDelete={async () => {
            await mediaRepository.deleteArtwork(library.profile.id, view.artworkId)
            setArtworkCollection((current) => current.filter((entry) => entry.id !== view.artworkId))
            setArtworkSearchAttempt((attempt) => attempt + 1)
            requestAutomaticBackup(library)
            setView({ name: 'artworks' })
          }}
        />
      )
    }
  } else if (view.name === 'artwork-edit') {
    const { library } = libraryState
    const artwork = artworkCollection.find((entry) => entry.id === view.artworkId)
    if (!artwork) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button" type="button" onClick={() => setView({ name: 'artworks' })}>
              ← Retour à l’Art
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>Cette œuvre ne peut pas être modifiée.</h2>
            <p>La fiche n’est plus présente dans la bibliothèque locale.</p>
          </div>
        </main>
      )
    } else {
      content = (
        <ArtworkForm
          artwork={artwork}
          onCancel={() => setView({ name: 'artwork-detail', artworkId: view.artworkId })}
          onSave={async (input: ArtworkWriteInput) => {
            await mediaRepository.updateArtwork(library.profile.id, view.artworkId, input)
            const refreshed = await mediaRepository.getArtwork(library.profile.id, view.artworkId)
            if (!refreshed) {
              throw new Error('L’œuvre enregistrée ne peut pas être relue depuis SQLite.')
            }
            setArtworkCollection((current) => sortArtworks(current.map((entry) => (
              entry.id === view.artworkId ? refreshed : entry
            ))))
            setArtworkSearchAttempt((attempt) => attempt + 1)
            requestAutomaticBackup(library)
            setView({ name: 'artwork-detail', artworkId: view.artworkId })
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
        onCreate={() => {
          setAssociatingFilm(null)
          leaveLibrary({ name: 'tmdb-search' })
        }}
        onOpen={(film) => leaveLibrary({ name: 'detail', filmId: film.id, returnTo: 'library' })}
        onLibraryChanged={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    )
  }

  return (
    <div className="app">
      <Sidebar
        count={count}
        seriesCount={seriesCount}
        bookCount={bookCount}
        gameCount={gameCount}
        artworkCount={artworkCount}
        currentProfileName={libraryState.status === 'ready' ? libraryState.library.profile.name : null}
        activeItem={
          libraryState.status !== 'ready' || view.name === 'home'
            ? 'home'
            : view.name === 'settings'
              ? 'settings'
              : view.name === 'series' || view.name === 'series-create' || view.name === 'series-detail' || view.name === 'series-edit'
                ? 'series'
                : view.name === 'books' || view.name === 'book-create' || view.name === 'book-detail' || view.name === 'book-edit'
                  ? 'books'
                  : view.name === 'games' || view.name === 'game-create' || view.name === 'game-detail' || view.name === 'game-edit'
                    ? 'games'
                    : view.name === 'artworks' || view.name === 'artwork-create' || view.name === 'artwork-detail' || view.name === 'artwork-edit'
                      ? 'artworks'
                      : 'library'
        }
        onHome={() => leaveLibrary({ name: 'home' })}
        onLibrary={returnToLibrary}
        onSeries={() => leaveLibrary({ name: 'series' })}
        onBooks={() => leaveLibrary({ name: 'books' })}
        onGames={() => leaveLibrary({ name: 'games' })}
        onArtworks={() => leaveLibrary({ name: 'artworks' })}
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
