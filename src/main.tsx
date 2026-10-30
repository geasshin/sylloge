import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import { createRoot } from 'react-dom/client'
import { t, tc, translateMessage, getLocale, formatNumber } from './i18n/core.ts'
import { useLanguage } from './i18n/react.ts'
import { FloatingSidebarFrame, readSidebarPinned, saveSidebarPinned } from './components/FloatingSidebarFrame.tsx'
import { useIncrementalList } from './components/useIncrementalList.ts'
import { AccessibleDialog } from './components/AccessibleDialog.tsx'
import { FocusDialog } from './components/FocusDialog.tsx'
import { ImportHint } from './components/ImportHint.tsx'
import { ArtworkDetail } from './components/ArtworkDetail.tsx'
import { ArtworkForm } from './components/ArtworkForm.tsx'
import { ArtworkVisual, useArtworkFrame } from './components/ArtworkVisual.tsx'
import { FilmDetail } from './components/FilmDetail.tsx'
import { FilmForm } from './components/FilmForm.tsx'
import { BookDetail } from './components/BookDetail.tsx'
import { BookForm } from './components/BookForm.tsx'
import { GameDetail } from './components/GameDetail.tsx'
import { GameForm } from './components/GameForm.tsx'
import { Poster } from './components/Poster.tsx'
import { WorkCardFacts } from './components/WorkCardFacts.tsx'
import { Home } from './components/AtriumHome.tsx'
import { Portability, SETTINGS_SECTIONS, type PortabilitySection } from './components/Portability.tsx'
import { SeriesDetail } from './components/SeriesDetail.tsx'
import { SeriesForm } from './components/SeriesForm.tsx'
import { SeriesTmdbSearchFlow } from './components/SeriesTmdbSearchFlow.tsx'
import { BookOpenLibrarySearchFlow } from './components/BookOpenLibrarySearchFlow.tsx'
import { GameIgdbSearchFlow } from './components/GameIgdbSearchFlow.tsx'
import { TmdbSearchFlow } from './components/TmdbSearchFlow.tsx'
import { LibraryExportFlow } from './components/LibraryExportFlow.tsx'
import { ShareCardLink } from './components/ShareCardDialog.tsx'
import { type AvailableUpdate } from './data/updaterService.ts'
import { useAppUpdate } from './data/appUpdate.ts'
import { UpdateNotice } from './components/UpdateNotice.tsx'
import { YearRecapOffer } from './components/YearRecapOffer.tsx'
import { backupService, type BackupNotice } from './data/backupService.ts'
import { openDataFolder } from './data/appData.ts'
import { RestoreProfileDialog } from './components/RestoreProfileButton.tsx'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import { collectProfileExperience } from './data/profileExperienceService.ts'
import { filmsRepository, type FilmLibrary } from './data/filmsRepository.ts'
import { libraryRepository } from './data/libraryRepository.ts'
import { profilesRepository, type ProfileSummary } from './data/profilesRepository.ts'
import {
  mediaRepository,
  type ArtworkSearchCriteria,
  type BookSearchCriteria,
  type GameSearchCriteria,
  type MediaProviderReference,
  type SeriesSearchCriteria,
} from './data/mediaRepository.ts'
import { LibraryImportButton } from './components/LibraryImportButton.tsx'
import { ProfileAvatar } from './components/ProfileAvatar.tsx'
import { Onboarding } from './components/Onboarding.tsx'
import { LibraryViewBar, type LibraryFilterConfig } from './components/LibraryViewBar.tsx'
import { MobileAppShell } from './components/MobileAppShell.tsx'
import { AddLibraryDialog } from './components/AddLibraryDialog.tsx'
import { CustomLibraryIcon } from './components/CustomLibraryIcon.tsx'
import { CustomLibraryScreen } from './components/CustomLibraryScreen.tsx'
import { customLibraryRepository } from './data/customLibraryRepository.ts'
import { CUSTOM_LIBRARY_TEMPLATES, type CustomLibraryId, type EnabledCustomLibrary } from './domain/customLibraries.ts'


import type { TmdbSearchCandidate, TmdbFilmPresentation } from './data/tmdbService.ts'
import { associateFilmWithTmdb, getFilmTmdbCache, resolveFilmDisplayPoster, resolveFilmDisplayDirector, previewTmdbFilm, previewTmdbSeries, searchTmdbSeries } from './data/tmdbService.ts'
import { previewOpenLibraryBook, searchOpenLibraryBooks, type OpenLibraryBookCandidate } from './data/openLibraryService.ts'
import { previewIgdbGame, searchIgdbGames, type IgdbGameCandidate } from './data/igdbService.ts'
import { autoAssociateFilms } from './domain/autoAssociate.ts'
import { MATCH_THRESHOLD, REQUEST_DELAY_MS, delay, scoreNamedCandidate, seriesWithPresentation, bookWithPresentation, gameWithPresentation } from './domain/autoAssociateMedia.ts'
import { useTheme, type ThemePreference } from './domain/theme.ts'
import {
  FILM_STATUS_LABELS,
  FILM_STATUSES,
  type Film,
} from './domain/film.ts'
import type { FilmFormValues, FilmWriteInput } from './domain/filmForm.ts'
import type { FilmMetadataProvenance } from './domain/filmMetadataAssistance.ts'
import {
  filmMetadataResultToFormInitialValues,
  tmdbPresentationToFilmMetadataResult,
} from './domain/filmMetadataAssistance.ts'
import { filmToFormValues } from './domain/filmForm.ts'
import { seriesToFormValues } from './domain/seriesForm.ts'
import { bookToFormValues } from './domain/bookForm.ts'
import { gameToFormValues } from './domain/gameForm.ts'
import { artworkToFormValues } from './domain/artworkForm.ts'
import {
  RATED_BUILTIN_VIEWS,
  UNRATED_BUILTIN_VIEWS,
  PROGRESS_BUILTIN_VIEWS,
  ALL_VIEW,
  WATCHLIST_DEFAULT_VIEW_ID,
  ARTWORKS_DEFAULT_VIEW_ID,
  defaultBuiltinViewForMedium,
  builtinViewById,
  titledBuiltinViews,
  resolveLibraryQuery,
  type LibrarySort,
  type LibraryViewDefinition,
} from './domain/libraryViews.ts'
import {
  EMPTY_LIBRARY_FILTERS,
  hasActiveFilters,
  type LibraryFilters,
} from './domain/libraryFilters.ts'
import {

  SERIES_STATUS_LABELS,
  SERIES_STATUSES,
  type Series,
  type SeriesCategory,
} from './domain/series.ts'
import type { SeriesFormValues, SeriesWriteInput } from './domain/seriesForm.ts'
import { seriesLibraryForCategory, seriesLibraryCategories, seriesLibraryStoredFilter, seriesForLibrary, type SeriesLibraryKey } from './domain/seriesLibraries.ts'
import { seriesPresentationToInitialValues } from './domain/seriesMetadataAssistance.ts'
import {
  BOOK_STATUS_LABELS,
  BOOK_STATUSES,
  type Book,
  type BookCategory,
} from './domain/book.ts'
import type { BookFormValues, BookWriteInput } from './domain/bookForm.ts'
import { bookLibraryForCategory, bookLibraryCategories, bookLibraryStoredFilter, booksForLibrary, type BookLibraryKey } from './domain/bookLibraries.ts'
import { bookPresentationToInitialValues } from './domain/bookMetadataAssistance.ts'
import {
  buildGamePlatformFilters,
  buildGamePlatformSuggestions,
  GAME_STATUS_LABELS,
  GAME_STATUSES,
  type Game,
} from './domain/game.ts'
import type { GameFormValues, GameWriteInput } from './domain/gameForm.ts'
import { igdbPresentationToInitialValues } from './domain/gameIgdbAssistance.ts'
import {
  ARTWORK_FORMS,
  ARTWORK_FORM_LABELS,
  ARTWORK_STATUS_LABELS,
  ARTWORK_STATUSES,
  type Artwork,
} from './domain/artwork.ts'
import type { ArtworkWriteInput } from './domain/artworkForm.ts'
import {
  SearchIcon,
  HomeIcon,
  FilmIcon,
  SeriesIcon,
  AnimeIcon,
  BookIcon,
  MangaIcon,
  GameIcon,
  ArtIcon,
  SettingsIcon,
  RefreshIcon,
  WandIcon,
  PencilIcon,
  TrashIcon,
  PanelIcon,
  UnlinkIcon,
  ArrowLeftIcon,
  PlusIcon,
  PinIcon,
} from './components/icons.tsx'
import './styles.css'
import { installExternalLinks } from './data/externalLinks.ts'

type IconName = 'art' | 'book' | 'manga' | 'anime' | 'film' | 'game' | 'home' | 'refresh' | 'search' | 'series' | 'settings' | 'wand' | 'pencil' | 'trash' | 'panel' | 'unlink' | 'arrow-left'
export type { IconName }
type SettingsSection = PortabilitySection

/** Fabrique d'icônes SVG partagée par tous les composants de l'app. */
export function icon(name: IconName, filled = false) {
  switch (name) {
    case 'home':
      return <HomeIcon filled={filled} />
    case 'arrow-left':
      return <ArrowLeftIcon />
    case 'film':
      return <FilmIcon filled={filled} />
    case 'series':
      return <SeriesIcon filled={filled} />
    case 'anime':
      return <AnimeIcon filled={filled} />
    case 'book':
      return <BookIcon filled={filled} />
    case 'manga':
      return <MangaIcon filled={filled} />
    case 'game':
      return <GameIcon filled={filled} />
    case 'art':
      return <ArtIcon filled={filled} />
    case 'settings':
      return <SettingsIcon filled={filled} />
    case 'refresh':
      return <RefreshIcon />
    case 'wand':
      return <WandIcon />
    case 'pencil':
      return <PencilIcon />
    case 'trash':
      return <TrashIcon />
    case 'panel':
      return <PanelIcon filled={filled} />
    case 'unlink':
      return <UnlinkIcon />
    case 'search':
      return <SearchIcon />
    default:
      return null
  }
}

const SETTINGS_NAVIGATION: Array<{ id: SettingsSection; label: string }> = SETTINGS_SECTIONS.map(({ id, label }) => ({ id, label }))

type SidebarProps = {
  expanded: boolean
  onToggleExpanded: () => void
  count: number | null
  seriesCount: number | null
  animeCount: number | null
  bookCount: number | null
  mangaCount: number | null
  gameCount: number | null
  artworkCount: number | null
  /** Bibliothèques personnalisées ajoutées au profil, dans leur ordre. */
  customLibraries: EnabledCustomLibrary[]
  activeCustomLibrary: CustomLibraryId | null
  onCustomLibrary: (libraryId: CustomLibraryId) => void
  onAddLibrary: (() => void) | null
  currentProfileName: string | null
  currentProfileAvatar: string | null
  activeItem: 'artworks' | 'books' | 'mangas' | 'games' | 'home' | 'library' | 'series' | 'anime' | 'settings' | 'custom'
  onHome: () => void
  onLibrary: () => void
  onSeries: () => void
  onAnime: () => void
  onBooks: () => void
  onMangas: () => void
  onGames: () => void
  onArtworks: () => void
  onSettings: () => void
  settingsSection: SettingsSection
  onSettingsSection: (section: SettingsSection) => void
  onReturnToLibrary: () => void
}

function Sidebar({
  expanded,
  onToggleExpanded,
  count,
  seriesCount,
  animeCount,
  bookCount,
  mangaCount,
  gameCount,
  artworkCount,
  customLibraries,
  activeCustomLibrary,
  onCustomLibrary,
  onAddLibrary,
  currentProfileName,
  currentProfileAvatar,
  activeItem,
  onHome,
  onLibrary,
  onSeries,
  onAnime,
  onBooks,
  onMangas,
  onGames,
  onArtworks,
  onSettings,
  settingsSection,
  onSettingsSection,
  onReturnToLibrary,
}: SidebarProps) {
  const settingsOpen = activeItem === 'settings'
  // Le nom accessible reste présent en rail ; le survol ou le focus dévoile les noms.

  return (
    <FloatingSidebarFrame pinned={expanded} settings={settingsOpen}>
      {settingsOpen ? (
        <nav aria-label={t("Navigation des paramètres")}>
          <p className="nav-label">{t("Paramètres")}</p>
          {SETTINGS_NAVIGATION.map((item) => (
            <button
              className={`nav-item ${settingsSection === item.id ? 'active' : ''}`}
              type="button"
              key={item.id}
              onClick={() => onSettingsSection(item.id)}
              aria-current={settingsSection === item.id ? 'location' : undefined}
            >
              {t(item.label)}
            </button>
          ))}
        </nav>
      ) : (
        <nav aria-label={t("Navigation principale")}>
          <button
            className={`nav-item sidebar-home-item ${activeItem === 'home' ? 'active' : ''}`}
            type="button"
            onClick={onHome}
            aria-label={t("Accueil")}
            aria-current={activeItem === 'home' ? 'page' : undefined}
          >
            <span className="nav-item-text">{icon('home', activeItem === 'home')}<span className="nav-item-label">{t("Accueil")}</span></span>
            <span className="nav-item-peek" aria-hidden="true">{icon('home', activeItem === 'home')}</span>
          </button>
          <span className="nav-group" aria-hidden="true"><span>{t("Bibliothèques")}</span></span>
          <button
            className={`nav-item ${activeItem === 'library' ? 'active' : ''}`}
            type="button"
            onClick={onLibrary}
            aria-label={t("Films")}
            aria-current={activeItem === 'library' ? 'page' : undefined}
          >
            <span className="nav-item-text">{icon('film', activeItem === 'library')}<span className="nav-item-label">{t("Films")}</span></span>
            {count !== null && <span className="nav-count">{count}</span>}
            <span className="nav-item-peek" aria-hidden="true">{icon('film', activeItem === 'library')}</span>
          </button>
          <button
            className={`nav-item ${activeItem === 'series' ? 'active' : ''}`}
            type="button"
            onClick={onSeries}
            aria-label={t("Séries")}
            aria-current={activeItem === 'series' ? 'page' : undefined}
          >
            <span className="nav-item-text">{icon('series', activeItem === 'series')}<span className="nav-item-label">{t("Séries")}</span></span>
            {seriesCount !== null && <span className="nav-count">{seriesCount}</span>}
            <span className="nav-item-peek" aria-hidden="true">{icon('series', activeItem === 'series')}</span>
          </button>
          <button
            className={`nav-item ${activeItem === 'anime' ? 'active' : ''}`}
            type="button"
            onClick={onAnime}
            aria-label={t("Animation japonaise")}
            aria-current={activeItem === 'anime' ? 'page' : undefined}
          >
            <span className="nav-item-text">{icon('anime', activeItem === 'anime')}<span className="nav-item-label">{t("Animation japonaise")}</span></span>
            {animeCount !== null && <span className="nav-count">{animeCount}</span>}
            <span className="nav-item-peek" aria-hidden="true">{icon('anime', activeItem === 'anime')}</span>
          </button>
          <button
            className={`nav-item ${activeItem === 'books' ? 'active' : ''}`}
            type="button"
            onClick={onBooks}
            aria-label={t("Livres")}
            aria-current={activeItem === 'books' ? 'page' : undefined}
          >
            <span className="nav-item-text">{icon('book', activeItem === 'books')}<span className="nav-item-label">{t("Livres")}</span></span>
            {bookCount !== null && <span className="nav-count">{bookCount}</span>}
            <span className="nav-item-peek" aria-hidden="true">{icon('book', activeItem === 'books')}</span>
          </button>
          <button
            className={`nav-item ${activeItem === 'mangas' ? 'active' : ''}`}
            type="button"
            onClick={onMangas}
            aria-label={t("Mangas")}
            aria-current={activeItem === 'mangas' ? 'page' : undefined}
          >
            <span className="nav-item-text">{icon('manga', activeItem === 'mangas')}<span className="nav-item-label">{t("Mangas")}</span></span>
            {mangaCount !== null && <span className="nav-count">{mangaCount}</span>}
            <span className="nav-item-peek" aria-hidden="true">{icon('manga', activeItem === 'mangas')}</span>
          </button>
          <button
            className={`nav-item ${activeItem === 'games' ? 'active' : ''}`}
            type="button"
            onClick={onGames}
            aria-label={t("Jeux")}
            aria-current={activeItem === 'games' ? 'page' : undefined}
          >
            <span className="nav-item-text">{icon('game', activeItem === 'games')}<span className="nav-item-label">{t("Jeux")}</span></span>
            {gameCount !== null && <span className="nav-count">{gameCount}</span>}
            <span className="nav-item-peek" aria-hidden="true">{icon('game', activeItem === 'games')}</span>
          </button>
          <button
            className={`nav-item ${activeItem === 'artworks' ? 'active' : ''}`}
            type="button"
            onClick={onArtworks}
            aria-label={t("Art")}
            aria-current={activeItem === 'artworks' ? 'page' : undefined}
          >
            <span className="nav-item-text">{icon('art', activeItem === 'artworks')}<span className="nav-item-label">{t("Art")}</span></span>
            {artworkCount !== null && <span className="nav-count">{artworkCount}</span>}
            <span className="nav-item-peek" aria-hidden="true">{icon('art', activeItem === 'artworks')}</span>
          </button>
          {customLibraries.map(({ libraryId, count: entryCount }) => {
            const label = t(CUSTOM_LIBRARY_TEMPLATES[libraryId].label)
            const active = activeItem === 'custom' && activeCustomLibrary === libraryId
            return (
              <button
                className={`nav-item ${active ? 'active' : ''}`}
                type="button"
                key={libraryId}
                onClick={() => onCustomLibrary(libraryId)}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
              >
                <span className="nav-item-text"><CustomLibraryIcon libraryId={libraryId} filled={active} /><span className="nav-item-label">{label}</span></span>
                <span className="nav-count">{entryCount}</span>
                <span className="nav-item-peek" aria-hidden="true"><CustomLibraryIcon libraryId={libraryId} filled={active} /></span>
              </button>
            )
          })}
          {onAddLibrary && (
            <button
              className="nav-item nav-item-add"
              type="button"
              onClick={onAddLibrary}
              aria-label={t("Ajouter une bibliothèque")}
            >
              <span className="nav-item-text"><PlusIcon /><span className="nav-item-label">{t("Ajouter une bibliothèque")}</span></span>
              <span className="nav-item-peek" aria-hidden="true"><PlusIcon /></span>
            </button>
          )}
        </nav>
      )}
      <div className="sidebar-bottom">
        {currentProfileName && (
          <div className="sidebar-profile" title={currentProfileName}>
            <ProfileAvatar name={currentProfileName} avatarDataUrl={currentProfileAvatar} className="sidebar-avatar" />
            <span>{currentProfileName}</span>
          </div>
        )}
        {settingsOpen ? (
          <button className="nav-item muted" type="button" onClick={onReturnToLibrary}>
            {icon('film')} {t('Retour à la bibliothèque')}
          </button>
        ) : (
          <>
            <button
              className="sidebar-toggle"
              type="button"
              onClick={onToggleExpanded}
              aria-label={expanded ? t('Détacher la barre latérale') : t('Garder la barre latérale ouverte')}
              aria-pressed={expanded}
            >
              <span className="nav-item-text"><PinIcon filled={expanded} /><span className="nav-item-label">{expanded ? t('Détacher la barre') : t('Garder ouverte')}</span></span>
              <span className="nav-item-peek" aria-hidden="true"><PinIcon filled={expanded} /></span>
            </button>
            <button
              className="nav-item"
              type="button"
              onClick={onSettings}
              aria-label={t("Paramètres")}
            >
              <span className="nav-item-text">{icon('settings')}<span className="nav-item-label">{t("Paramètres")}</span></span>
              <span className="nav-item-peek" aria-hidden="true">{icon('settings')}</span>
            </button>
          </>
        )}
      </div>
    </FloatingSidebarFrame>
  )
}

/**
 * Singulier ou pluriel selon la règle de la langue active : le français range
 * 0 et 1 au singulier, l'anglais seulement 1. Deux clés explicites, jamais de
 * suffixe collé au mot.
 */
function isSingular(count: number): boolean {
  return new Intl.PluralRules(getLocale()).select(count) === 'one'
}

/**
 * Sous-titre éditorial d'une bibliothèque : compte réel, coups de cœur quand la note existe.
 * `singular` et `plural` sont les mots français du catalogue ; `context` les
 * désambiguïse quand le même mot a un autre sens ailleurs (« œuvre » : artwork dans Art).
 */
function librarySubtitle(
  items: { isFavorite: boolean }[],
  singular: string,
  plural: string,
  context?: string,
): string {
  const total = items.length
  const word = total === 1 ? singular : plural
  const count = t('{count} {medium}', { count: formatNumber(total), medium: context ? tc(context, word) : t(word) })
  const hearts = items.filter((item) => item.isFavorite).length
  if (hearts === 0) return count
  return hearts === 1
    ? t('{count} dont {hearts} coup de cœur', { count, hearts: formatNumber(hearts) })
    : t('{count} dont {hearts} coups de cœur', { count, hearts: formatNumber(hearts) })
}

function FilmCard({ film, onOpen }: { film: Film; onOpen: () => void }) {
  const [displayPosterUrl, setDisplayPosterUrl] = useState<string | null>(film.posterUrl)

  useEffect(() => {
    let cancelled = false
    setDisplayPosterUrl(film.posterUrl)
    resolveFilmDisplayPoster(film.id, film.posterUrl).then((url) => {
      if (!cancelled) setDisplayPosterUrl(url)
    })
    return () => { cancelled = true }
  }, [film.id, film.posterUrl])

  return (
    <button className="film-card" type="button" onClick={onOpen} aria-label={t`Ouvrir la fiche de ${film.title}`}>
      <Poster title={film.title} src={displayPosterUrl} />
      <WorkCardFacts
        title={film.title}
        isFavorite={film.isFavorite}
        creator={film.director}
        rating={film.rating}
        year={film.year}
        status={film.status}
        statusLabel={t(FILM_STATUS_LABELS[film.status])}
      />
    </button>
  )
}

function LoadingState() {
  return (
    <div className="library-state" role="status" aria-live="polite">
      <p className="state-kicker">{t("Bibliothèque locale")}</p>
      <h2>{t("Chargement des films")}</h2>
      <p>{t("Lecture de la collection enregistrée sur cet appareil.")}</p>
    </div>
  )
}

function ErrorState({
  onRetry,
  recoveryProfile,
  onRestored,
}: {
  onRetry: () => void
  recoveryProfile: ProfileSummary | null
  onRestored: () => void
}) {
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)

  const revealDataFolder = () => {
    setFolderError(null)
    void openDataFolder().catch((error: unknown) => {
      console.error('Impossible d’ouvrir le dossier des données.', error)
      setFolderError(t('Le dossier des données n’a pas pu être ouvert.'))
    })
  }

  return (
    <>
      <div className="library-state error-state" role="alert">
        <p className="state-kicker">{t("Lecture impossible")}</p>
        <h2>{t("La bibliothèque locale ne peut pas être ouverte.")}</h2>
        <p>{t("Vérifiez que l’application dispose toujours de son accès SQLite, puis réessayez.")}</p>
        <div className="state-actions">
          <button className="state-action" type="button" onClick={onRetry}>{t("Réessayer")}</button>
          {recoveryProfile && (
            <button className="state-action" type="button" onClick={() => setRestoreOpen(true)}>
              {t('Restaurer une sauvegarde')}
            </button>
          )}
          <button className="state-action" type="button" onClick={revealDataFolder}>
            {t('Ouvrir le dossier des données')}
          </button>
        </div>
        {folderError && <p className="inline-report error" role="alert">{folderError}</p>}
      </div>
      {restoreOpen && recoveryProfile && (
        <RestoreProfileDialog
          profile={recoveryProfile}
          onClose={(restored) => {
            setRestoreOpen(false)
            if (restored) onRestored()
          }}
        />
      )}
    </>
  )
}

function EmptyLibrary({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="library-state empty-library">
      <h2>{t("Votre bibliothèque Films est vide.")}</h2>
      <p>{t("Ajoutez un premier film, avec un titre seulement si vous le souhaitez.")}</p>
      <button className="primary-button empty-action" type="button" onClick={onCreate}>{t("Ajouter un film")}</button>
    </div>
  )
}

function compareTitles(first: Film, second: Film): number {
  return first.title.localeCompare(second.title, getLocale(), { sensitivity: 'base' }) || first.id.localeCompare(second.id)
}

function compareByCreatedAt(first: Film, second: Film): number {
  return second.createdAt.localeCompare(first.createdAt) || compareTitles(first, second)
}

function compareByWatchedAt(first: Film, second: Film): number {
  return (second.watchedAt ?? '').localeCompare(first.watchedAt ?? '') || compareByCreatedAt(first, second)
}

type LibraryContext = {
  query: string
  view: LibraryViewDefinition
  extraFilters: LibraryFilters
  sortOverride: LibrarySort | null
}


type SeriesLibraryContext = {
  query: string
  view: LibraryViewDefinition
  extraFilters: LibraryFilters
  sortOverride: LibrarySort | null
  /** Catégories affichées ; liste vide = toutes (équivalent « all »). */
  category: SeriesCategory[]
}

type BookLibraryContext = {
  query: string
  view: LibraryViewDefinition
  extraFilters: LibraryFilters
  sortOverride: LibrarySort | null
  /** Catégories affichées ; liste vide = toutes (équivalent « all »). */
  category: BookCategory[]
}

type GameLibraryContext = {
  query: string
  view: LibraryViewDefinition
  extraFilters: LibraryFilters
  sortOverride: LibrarySort | null
  platform: string
}

type ArtworkLibraryContext = {
  query: string
  view: LibraryViewDefinition
  extraFilters: LibraryFilters
  sortOverride: LibrarySort | null
  form: ArtworkSearchCriteria['form']
}

type SearchState =
  | { status: 'loading' }
  | { status: 'ready'; films: Film[] }
  | { status: 'error' }

type FilmsLibraryProps = {
  library: FilmLibrary
  context: LibraryContext
  searchState: SearchState
  onContextChange: Dispatch<SetStateAction<LibraryContext>>
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
  // L'ordre visible commence par Tous ; la vue d'ouverture reste la watchlist.
  const openingView = defaultBuiltinViewForMedium(RATED_BUILTIN_VIEWS, 'films')
  const isUnfiltered = context.query.trim() === '' && context.view.id === openingView.id && !hasActiveFilters(context.extraFilters) && context.sortOverride === null
  const resolved = resolveLibraryQuery(context.view, context.extraFilters, context.sortOverride)
  const { visibleItems: visibleFilms, sentinelRef: filmsSentinelRef } = useIncrementalList(
    searchState.status === 'ready' ? searchState.films : [],
    `films|${context.query}|${context.view.id}|${context.sortOverride ?? ''}|${JSON.stringify(context.extraFilters)}`,
  )
  const [autoAssociateOpen, setAutoAssociateOpen] = useState(false)

  return (
    <main className="main library-main" aria-label={t`Bibliothèque Films du profil ${library.profile.name}`}>
      <header className="library-header">
        <div>
          <h1 className="display-title">{t("Films")}</h1>
          <p className="library-subtitle">
            {librarySubtitle(library.films, 'film', 'films')}
            <span className="subtitle-sep" aria-hidden="true">·</span>
            <ShareCardLink profileId={library.profile.id} library="films" />
          </p>
        </div>
        <div className="library-header-actions">
          <button
            className="auto-associate-button"
            type="button"
            onClick={() => setAutoAssociateOpen(true)}
            title={t("Associer automatiquement les fiches non associées via TMDB")}
          >
            {icon('wand')}
            <span>{t("Tout associer")}</span>
          </button>
          <LibraryImportButton
            kind="films"
            buttonLabel={t("Importer")}
            mediumLabel={t("film")}
            profileId={library.profile.id}
            profileName={library.profile.name}
            existing={library.films}
            onDone={onLibraryChanged}
          />
          <LibraryExportFlow kind="films" profileId={library.profile.id} />
          <button className="primary-button" type="button" onClick={onCreate}>{t("Ajouter un film")}</button>
        </div>
      </header>

      {/* 0.6.27 : la barre d'outils reste affichée même bibliothèque vide —
          les six bibliothèques partagent exactement le même gabarit. */}
      <div className="library-tools">
        <label className="search">
          {icon('search')}
          <span className="visually-hidden">{t("Rechercher par titre, titre original ou réalisation")}</span>
          <input
            type="search"
            value={context.query}
            placeholder={t("Titre, titre original ou réalisation")}
            onChange={(event) => onContextChange({ ...context, query: event.target.value })}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <LibraryViewBar
          profileId={library.profile.id}
          medium="films"
          builtinViews={titledBuiltinViews(RATED_BUILTIN_VIEWS, 'films')}
          activeView={context.view}
          onViewChange={(view) => onContextChange((current) => ({ ...current, view }))}
          filterConfig={FILM_FILTER_PANEL_CONFIG}
          mediumFilterValue="all"
          onMediumFilterChange={() => {}}
          extraFilters={context.extraFilters}
          onExtraFiltersChange={(extraFilters) => onContextChange((current) => ({ ...current, extraFilters }))}
          sortCapabilities={{ rating: true, year: true }}
          sortOverride={context.sortOverride}
          onSortOverrideChange={(sortOverride) => onContextChange((current) => ({ ...current, sortOverride }))}
          currentCriteria={{ sort: resolved.sort, mediumFilter: 'all', filters: resolved.filters }}
        />
      </div>

      {library.films.length === 0 && isUnfiltered ? (
        <EmptyLibrary onCreate={onCreate} />
      ) : (
        <>
          {searchState.status === 'loading' ? (
            <div className="results-state" role="status">{t("Recherche dans SQLite…")}</div>
          ) : searchState.status === 'error' ? (
            <div className="results-state error-state" role="alert">
              <h2>{t("La recherche locale a échoué.")}</h2>
              <p>{t("Vos films restent enregistrés. Réessayez pour relire les résultats depuis SQLite.")}</p>
              <button className="state-action" type="button" onClick={onRetrySearch}>{t("Réessayer")}</button>
            </div>
          ) : searchState.films.length === 0 ? (
            <div className="results-state empty-results">
              <h2>{isUnfiltered ? t('Aucun film dans la vue « {view} ».', { view: openingView.builtin ? t(openingView.name) : openingView.name }) : t("Aucun film ne correspond.")}</h2>
              <p>{isUnfiltered ? t("La vue « Tous » affiche toute votre bibliothèque.") : t("Modifiez la recherche ou revenez à tous les films.")}</p>
              <button
                className="state-action"
                type="button"
                onClick={() => onContextChange({ query: '', view: builtinViewById(RATED_BUILTIN_VIEWS, isUnfiltered ? ALL_VIEW.id : WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}
              >{t("Afficher tous les films")}</button>
            </div>
          ) : (
            <>
              <div className="film-grid" aria-busy="false">
                {visibleFilms.map((film) => (
                  <FilmCard film={film} key={film.id} onOpen={() => onOpen(film)} />
                ))}
              </div>
              <div ref={filmsSentinelRef} className="incremental-sentinel" aria-hidden="true" />
            </>
          )}
        </>
      )}
      <AutoAssociateDialog
        open={autoAssociateOpen}
        onClose={() => setAutoAssociateOpen(false)}
        films={library.films}
        onDone={onLibraryChanged}
      />
    </main>
  )
}

/** Part du travail déjà faite, en pourcentage entier (0 tant que le total est inconnu). */
function progressPercent({ processed, total }: { processed: number; total: number }): number {
  return total > 0 ? Math.round((processed / total) * 100) : 0
}

/** Baguette magique (0.6.6) : confirmation, progression puis résumé. */
function AutoAssociateDialog({
  open,
  onClose,
  films,
  onDone,
}: {
  open: boolean
  onClose: () => void
  films: Film[]
  onDone: () => void
}) {
  const [phase, setPhase] = useState<'confirm' | 'running' | 'done'>('confirm')
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [summary, setSummary] = useState<{ associated: number; noMatch: number; cancelled: boolean } | null>(null)
  const cancelRef = useRef(false)

  if (!open) return null

  const pendingCount = films.filter((film) => !film.providerId || !film.providerName).length

  const start = async () => {
    setPhase('running')
    setProgress({ processed: 0, total: pendingCount })
    cancelRef.current = false
    const result = await autoAssociateFilms(
      films,
      getLocale(),
      (processed, total) => setProgress({ processed, total }),
      () => cancelRef.current,
    )
    setSummary({ associated: result.associatedCount, noMatch: result.noMatchCount, cancelled: cancelRef.current })
    setPhase('done')
    onDone()
  }

  return (
    <AccessibleDialog
      title={t('Tout associer')}
      description={t('Recherche automatique des fiches sur TMDB')}
      closeDisabled={phase === 'running'}
      onClose={() => { if (phase !== 'running') { onClose(); setPhase('confirm'); setSummary(null) } }}
      size="md"
    >
      <div className="assistant-content">
        {phase === 'confirm' && (
          <section className="assistant-stage">
            <h3>{t('Associer toutes les fiches non associées via TMDB ?')}</h3>
            <p className="films-import-details">
              {isSingular(pendingCount)
                ? t('{count} fiche n’est pas encore associée.', { count: formatNumber(pendingCount) })
                : t('{count} fiches ne sont pas encore associées.', { count: formatNumber(pendingCount) })}{' '}
              {t('Sylloge recherchera chaque titre et gardera la meilleure correspondance (titre et année).')}{' '}
              {t('Tes notes, avis et statuts ne sont jamais modifiés.')}
            </p>
            <ImportHint>
              {t('Les fiches déjà associées ne sont pas retouchées, et tu pourras corriger une association fiche par fiche si le résultat n’est pas le bon.')}
            </ImportHint>
            <div className="assistant-actions">
              <button className="secondary-button" type="button" onClick={onClose}>{t('Non')}</button>
              <button className="primary-button" type="button" disabled={pendingCount === 0} onClick={() => void start()}>{t('Oui, lancer')}</button>
            </div>
          </section>
        )}
        {phase === 'running' && (
          <section className="assistant-stage">
            <h3>{t('Association en cours…')}</h3>
            <p className="films-import-details">
              <b>{formatNumber(progress.processed)}</b>{' '}
              {isSingular(progress.total)
                ? t('sur {total} fiche traitée.', { total: formatNumber(progress.total) })
                : t('sur {total} fiches traitées.', { total: formatNumber(progress.total) })}
            </p>
            <div
              className="auto-associate-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.processed}
              aria-label={t('Progression de l’association')}
            >
              <div className="auto-associate-progress-fill" style={{ width: `${progressPercent(progress)}%` }} />
            </div>
            <p className="auto-associate-percent">{formatNumber(progressPercent(progress) / 100, { style: 'percent' })}</p>
            <div className="assistant-actions">
              <button className="secondary-button" type="button" onClick={() => { cancelRef.current = true }}>{t('Arrêter')}</button>
            </div>
          </section>
        )}
        {phase === 'done' && summary !== null && (
          <section className="assistant-stage">
            <h3>{t('Association terminée')}</h3>
            <ul className="import-report auto-associate-summary">
              <li>
                {isSingular(summary.associated)
                  ? t('{count} fiche associée', { count: formatNumber(summary.associated) })
                  : t('{count} fiches associées', { count: formatNumber(summary.associated) })}
              </li>
              <li>{t('{count} sans correspondance assez sûre', { count: formatNumber(summary.noMatch) })}</li>
              {summary.cancelled && <li>{t('Opération arrêtée avant la fin — relance « {action} » pour continuer.', { action: t('Tout associer') })}</li>}
            </ul>
            <p className="films-import-details">{t('Chaque fiche reste modifiable individuellement via le bouton Associer.')}</p>
            <div className="assistant-actions assistant-actions-single">
              <button className="primary-button" type="button" onClick={() => { onClose(); setPhase('confirm'); setSummary(null) }}>{t('Fermer')}</button>
            </div>
          </section>
        )}
      </div>
    </AccessibleDialog>
  )
}

/** Baguette magique générique (Séries, Livres, Jeux) : éditeur de champs éditoriaux. */
function AutoAssociateEditsDialog({
  open,
  onClose,
  providerLabel,
  pendingCount,
  confirmText,
  run,
  onDone,
}: {
  open: boolean
  onClose: () => void
  providerLabel: string
  pendingCount: number
  confirmText: string
  run: (options: {
    onProgress: (processed: number, total: number) => void
    isCancelled: () => boolean
  }) => Promise<{ associatedCount: number; noMatchCount: number }>
  onDone: () => void
}) {
  const [phase, setPhase] = useState<'confirm' | 'running' | 'done'>('confirm')
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [summary, setSummary] = useState<{ associated: number; noMatch: number; cancelled: boolean } | null>(null)
  const cancelRef = useRef(false)

  if (!open) return null

  const start = async () => {
    setPhase('running')
    setProgress({ processed: 0, total: pendingCount })
    cancelRef.current = false
    const result = await run({
      onProgress: (processed, total) => setProgress({ processed, total }),
      isCancelled: () => cancelRef.current,
    })
    setSummary({ associated: result.associatedCount, noMatch: result.noMatchCount, cancelled: cancelRef.current })
    setPhase('done')
    onDone()
  }

  return (
    <AccessibleDialog
      title={t('Tout associer')}
      description={t('Recherche automatique sur {provider}', { provider: providerLabel })}
      closeDisabled={phase === 'running'}
      onClose={() => { if (phase !== 'running') { onClose(); setPhase('confirm'); setSummary(null) } }}
      size="md"
    >
      <div className="assistant-content">
        {phase === 'confirm' && (
          <section className="assistant-stage">
            <h3>{confirmText}</h3>
            <p className="films-import-details">
              {t('Sylloge recherchera chaque titre sur {provider} et gardera la meilleure correspondance.', { provider: providerLabel })}{' '}
              {t('Seuls les champs éditoriaux sont mis à jour (visuel, résumé, année, créateur) : tes statuts, notes, coups de cœur et avis restent exactement tels quels.')}
            </p>
            <ImportHint>
              {t('Les visuels viendront du fournisseur officiel : même format, même rendu, sur toute la bibliothèque.')}{' '}
              {t('Une fiche sans correspondance sûre reste inchangée.')}
            </ImportHint>
            <div className="assistant-actions">
              <button className="secondary-button" type="button" onClick={onClose}>{t('Non')}</button>
              <button className="primary-button" type="button" disabled={pendingCount === 0} onClick={() => void start()}>{t('Oui, lancer')}</button>
            </div>
          </section>
        )}
        {phase === 'running' && (
          <section className="assistant-stage">
            <h3>{t('Association en cours…')}</h3>
            <p className="films-import-details">
              <b>{formatNumber(progress.processed)}</b>{' '}
              {isSingular(progress.total)
                ? t('sur {total} fiche traitée.', { total: formatNumber(progress.total) })
                : t('sur {total} fiches traitées.', { total: formatNumber(progress.total) })}
            </p>
            <div
              className="auto-associate-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.processed}
              aria-label={t('Progression de l’association')}
            >
              <div className="auto-associate-progress-fill" style={{ width: `${progressPercent(progress)}%` }} />
            </div>
            <p className="auto-associate-percent">{formatNumber(progressPercent(progress) / 100, { style: 'percent' })}</p>
            <div className="assistant-actions">
              <button className="secondary-button" type="button" onClick={() => { cancelRef.current = true }}>{t('Arrêter')}</button>
            </div>
          </section>
        )}
        {phase === 'done' && summary !== null && (
          <section className="assistant-stage">
            <h3>{t('Association terminée')}</h3>
            <ul className="import-report auto-associate-summary">
              <li>
                {isSingular(summary.associated)
                  ? t('{count} fiche enrichie', { count: formatNumber(summary.associated) })
                  : t('{count} fiches enrichies', { count: formatNumber(summary.associated) })}
              </li>
              <li>
                {isSingular(summary.noMatch)
                  ? t('{count} sans correspondance assez sûre — inchangée', { count: formatNumber(summary.noMatch) })
                  : t('{count} sans correspondance assez sûre — inchangées', { count: formatNumber(summary.noMatch) })}
              </li>
              {summary.cancelled && <li>{t('Opération arrêtée avant la fin — relance « {action} » pour continuer.', { action: t('Tout associer') })}</li>}
            </ul>
            <div className="assistant-actions assistant-actions-single">
              <button className="primary-button" type="button" onClick={() => { onClose(); setPhase('confirm'); setSummary(null) }}>{t('Fermer')}</button>
            </div>
          </section>
        )}
      </div>
    </AccessibleDialog>
  )
}

type LibraryState =
  | { status: 'loading' }
  | { status: 'ready'; library: FilmLibrary }
  | { status: 'no-profile' }
  | { status: 'error' }


const FILM_FILTER_PANEL_CONFIG: LibraryFilterConfig = {
  mediumFilter: null,
  statusOptions: FILM_STATUSES.map((status) => ({ value: status, label: FILM_STATUS_LABELS[status] })),
  showRating: true,
  showYear: true,
  personalDateLabel: 'Visionnage',
  specificTextField: { label: 'Réalisation', placeholder: 'Nom du réalisateur ou de la réalisatrice' },
  showLocation: false,
  showExhibition: false,
}

const SERIES_FILTER_PANEL_CONFIG: LibraryFilterConfig = {
  mediumFilter: null,
  statusOptions: SERIES_STATUSES.map((status) => ({ value: status, label: SERIES_STATUS_LABELS[status] })),
  showRating: true,
  showYear: false,
  personalDateLabel: 'Début de visionnage',
  specificTextField: null,
  showLocation: false,
  showExhibition: false,
}

const BOOK_FILTER_PANEL_CONFIG: LibraryFilterConfig = {
  mediumFilter: null,
  statusOptions: BOOK_STATUSES.map((status) => ({ value: status, label: BOOK_STATUS_LABELS[status] })),
  showRating: true,
  showYear: true,
  personalDateLabel: 'Début de lecture',
  specificTextField: { label: 'Auteur', placeholder: 'Nom de l’auteur ou de l’autrice' },
  showLocation: false,
  showExhibition: false,
}

const GAME_FILTER_PANEL_CONFIG: LibraryFilterConfig = {
  mediumFilter: null,
  statusOptions: GAME_STATUSES.map((status) => ({ value: status, label: GAME_STATUS_LABELS[status] })),
  showRating: true,
  showYear: true,
  personalDateLabel: 'Partie',
  specificTextField: null,
  showLocation: false,
  showExhibition: false,
}

const ARTWORK_FILTER_PANEL_CONFIG: LibraryFilterConfig = {
  mediumFilter: {
    label: 'Forme',
    options: [
      { value: 'all', label: 'Toutes' },
      ...ARTWORK_FORMS.map((form) => ({ value: form as string, label: ARTWORK_FORM_LABELS[form] })),
    ],
  },
  statusOptions: ARTWORK_STATUSES.map((status) => ({ value: status, label: ARTWORK_STATUS_LABELS[status] })),
  showRating: false,
  showYear: true,
  personalDateLabel: 'Découverte',
  specificTextField: { label: 'Artiste', placeholder: 'Nom de l’artiste' },
  showLocation: true,
  showExhibition: true,
}

function SeriesCard({ series, onOpen }: { series: Series; onOpen: () => void }) {
  const progress = series.seasonsSeen !== null && series.seasonsTotal !== null
    ? t('{seen} / {total} saisons', { seen: formatNumber(series.seasonsSeen), total: formatNumber(series.seasonsTotal) })
    : null

  return (
    <button className="film-card" type="button" onClick={onOpen} aria-label={t`Ouvrir la fiche de ${series.title}`}>
      <Poster title={series.title} src={series.posterUrl} />
      <WorkCardFacts
        title={series.title}
        isFavorite={series.isFavorite}
        creator={series.showrunner}
        rating={series.rating}
        year={null}
        status={series.status}
        statusLabel={t(SERIES_STATUS_LABELS[series.status])}
        progress={progress}
      />
    </button>
  )
}

type SeriesLibraryProps = {
  library: SeriesLibraryKey
  allSeries: Series[]
  profileName: string
  collection: Series[]
  context: SeriesLibraryContext
  searchState: SeriesSearchState
  onContextChange: Dispatch<SetStateAction<SeriesLibraryContext>>
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
  library,
  allSeries,
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
  const anime = library === 'anime'
  // Mots français du catalogue ; chaque phrase d'état a sa propre clé complète
  // (article et accord diffèrent d'une langue à l'autre : jamais de nom collé).
  const label = anime ? 'Animation japonaise' : 'Séries'
  const singular = anime ? 'animation japonaise' : 'série'
  const plural = anime ? 'animations japonaises' : 'séries'
  // L'ordre visible commence par Tous ; la vue d'ouverture reste la watchlist.
  const openingView = defaultBuiltinViewForMedium(PROGRESS_BUILTIN_VIEWS, 'series')
  const isUnfiltered = context.query.trim() === '' && context.view.id === openingView.id && !hasActiveFilters(context.extraFilters) && context.sortOverride === null
  const resolved = resolveLibraryQuery(context.view, context.extraFilters, context.sortOverride)
  const { visibleItems: visibleSeries, sentinelRef: seriesSentinelRef } = useIncrementalList(
    searchState.status === 'ready' ? searchState.series : [],
    `${library}|${context.query}|${context.view.id}|${context.sortOverride ?? ''}|${JSON.stringify(context.extraFilters)}`,
  )
  const [autoAssociateOpen, setAutoAssociateOpen] = useState(false)

  const runSeriesAssociation = async ({ onProgress, isCancelled }: {
    onProgress: (processed: number, total: number) => void
    isCancelled: () => boolean
  }) => {
    let associatedCount = 0
    let noMatchCount = 0
    const pending = collection.slice()
    for (let index = 0; index < pending.length; index += 1) {
      if (isCancelled()) break
      const series = pending[index]
      try {
        const candidates = await searchTmdbSeries(series.title, getLocale())
        const scored = candidates
          .map((candidate) => ({
            candidate,
            score: scoreNamedCandidate(series.title, series.startedAt ? Number(series.startedAt.slice(0, 4)) : null, candidate.title, candidate.releaseYear),
          }))
          .sort((a, b) => b.score - a.score)
        if (scored.length > 0 && scored[0].score >= MATCH_THRESHOLD) {
          const presentation = await previewTmdbSeries(scored[0].candidate.tmdbId, getLocale())
          await mediaRepository.updateSeries(profileId, series.id, seriesWithPresentation(series, presentation), seriesLibraryForCategory(series.category))
          await mediaRepository.setMediaProviderLink({ profileId, medium: seriesLibraryForCategory(series.category), mediaId: series.id, providerName: 'TMDB', providerId: String(presentation.tmdbId) })
          associatedCount += 1
        } else {
          noMatchCount += 1
        }
      } catch {
        noMatchCount += 1
      }
      onProgress(index + 1, pending.length)
      await delay(REQUEST_DELAY_MS)
    }
    return { associatedCount, noMatchCount }
  }

  return (
    <main className="main library-main" aria-label={t`Bibliothèque ${t(label)} du profil ${profileName}`}>
      <header className="library-header">
        <div>
          <h1 className="display-title">{t(label)}</h1>
          <p className="library-subtitle">
            {librarySubtitle(collection, singular, plural)}
            <span className="subtitle-sep" aria-hidden="true">·</span>
            <ShareCardLink profileId={profileId} library={library} />
          </p>
        </div>
        <div className="library-header-actions">
          <button
            className="auto-associate-button"
            type="button"
            onClick={() => setAutoAssociateOpen(true)}
            title={t("Normaliser les visuels et fiches via TMDB")}
          >
            {icon('wand')}
            <span>{t("Tout associer")}</span>
          </button>
          <LibraryImportButton
            kind="series"
            buttonLabel={t("Importer")}
            mediumLabel={t(singular)}
            seriesLibrary={library}
            profileId={profileId}
            profileName={profileName}
            existing={collection}
            onDone={onLibraryChanged}
          />
          <LibraryExportFlow kind="series" profileId={profileId} seriesLibrary={library} />
          <button className="primary-button" type="button" onClick={onCreate}>{anime ? t('Ajouter un animé') : t('Ajouter une série')}</button>
        </div>
      </header>
      {/* 0.6.27 : barre d'outils toujours affichée, même bibliothèque vide. */}
      <div className="library-tools">
        <label className="search">
          {icon('search')}
          <span className="visually-hidden">{t("Rechercher par titre, showrunner ou casting")}</span>
          <input
            type="search"
            value={context.query}
            placeholder={t("Titre, showrunner ou casting")}
            onChange={(event) => onContextChange({ ...context, query: event.target.value })}
          />
        </label>
        <LibraryViewBar
          profileId={profileId}
          medium="series"
          seriesLibrary={library}
          builtinViews={titledBuiltinViews(PROGRESS_BUILTIN_VIEWS, 'series')}
          activeView={context.view}
          onViewChange={(view) => onContextChange((current) => ({ ...current, view }))}
          filterConfig={SERIES_FILTER_PANEL_CONFIG}
          mediumFilterValue="all"
          onMediumFilterChange={(stored) => {
            onContextChange((current) => ({ ...current, category: seriesLibraryCategories(library, stored) }))
          }}
          extraFilters={context.extraFilters}
          onExtraFiltersChange={(extraFilters) => onContextChange((current) => ({ ...current, extraFilters }))}
          sortCapabilities={{ rating: true, year: false }}
          sortOverride={context.sortOverride}
          onSortOverrideChange={(sortOverride) => onContextChange((current) => ({ ...current, sortOverride }))}
          currentCriteria={{ sort: resolved.sort, mediumFilter: seriesLibraryStoredFilter(library, context.category), filters: resolved.filters }}
        />
      </div>
      {collection.length === 0 && isUnfiltered ? (
        <div className="library-state empty-library">
          <h2>{t('La bibliothèque {library} est vide.', { library: t(label) })}</h2>
          <p>{anime ? t('Ajouter une première animation japonaise, avec un titre seulement si nécessaire.') : t('Ajouter une première {medium}, avec un titre seulement si nécessaire.', { medium: t(singular) })}</p>
          <button className="primary-button empty-action" type="button" onClick={onCreate}>{anime ? t('Ajouter un animé') : t('Ajouter une {medium}', { medium: t(singular) })}</button>
        </div>
      ) : (
        <>
          {searchState.status === 'loading' ? (
            <div className="results-state" role="status">{t("Recherche dans SQLite…")}</div>
          ) : searchState.status === 'error' ? (
            <div className="results-state error-state" role="alert">
              <h2>{t("La recherche locale a échoué.")}</h2>
              <p>{t("Les fiches restent enregistrées. Réessayer pour relire les résultats depuis SQLite.")}</p>
              <button className="state-action" type="button" onClick={onRetrySearch}>{t("Réessayer")}</button>
            </div>
          ) : searchState.series.length === 0 ? (
            <div className="results-state empty-results">
              <h2>{isUnfiltered ? t('Aucune {medium} dans la vue « {view} ».', { medium: t(singular), view: openingView.builtin ? t(openingView.name) : openingView.name }) : t('Aucune {medium} ne correspond.', { medium: t(singular) })}</h2>
              <p>{isUnfiltered ? t("La vue « Tous » affiche toute la bibliothèque.") : t("Modifier la recherche ou revenir à toutes les fiches.")}</p>
              <button
                className="state-action"
                type="button"
                onClick={() => onContextChange({ query: '', category: seriesLibraryCategories(library), view: builtinViewById(PROGRESS_BUILTIN_VIEWS, isUnfiltered ? ALL_VIEW.id : WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}
              >
                {t('Afficher toutes les {medium}', { medium: t(plural) })}
              </button>
            </div>
          ) : (
            <>
              <div className="film-grid" aria-busy="false">
                {visibleSeries.map((series) => (
                  <SeriesCard series={series} key={series.id} onOpen={() => onOpen(series)} />
                ))}
              </div>
              <div ref={seriesSentinelRef} className="incremental-sentinel" aria-hidden="true" />
            </>
          )}
        </>
      )}
      <AutoAssociateEditsDialog
        open={autoAssociateOpen}
        onClose={() => setAutoAssociateOpen(false)}
        providerLabel="TMDB"
        pendingCount={collection.length}
        confirmText={t('Normaliser toutes les fiches {library} via TMDB ?', { library: t(label) })}
        run={runSeriesAssociation}
        onDone={onLibraryChanged}
      />
    </main>
  )
}

function BookCard({ book, onOpen }: { book: Book; onOpen: () => void }) {
  const progress = book.volumesRead !== null && book.volumesTotal !== null
    ? t('{read} / {total} tomes', { read: formatNumber(book.volumesRead), total: formatNumber(book.volumesTotal) })
    : null

  return (
    <button className="film-card" type="button" onClick={onOpen} aria-label={t`Ouvrir la fiche de ${book.title}`}>
      <Poster title={book.title} src={book.coverUrl} label="Couverture" />
      <WorkCardFacts
        title={book.title}
        isFavorite={book.isFavorite}
        creator={book.author}
        rating={book.rating}
        year={book.year}
        status={book.status}
        statusLabel={t(BOOK_STATUS_LABELS[book.status])}
        progress={progress}
      />
    </button>
  )
}

function GameCard({ game, onOpen }: { game: Game; onOpen: () => void }) {
  const creator = [game.platform, game.developer].filter(Boolean).join(' · ')

  return (
    <button className="film-card" type="button" onClick={onOpen} aria-label={t`Ouvrir la fiche de ${game.title}`}>
      <Poster title={game.title} src={game.coverUrl} label="Couverture" />
      <WorkCardFacts
        title={game.title}
        isFavorite={game.isFavorite}
        creator={creator === '' ? null : creator}
        rating={game.rating}
        year={game.year}
        status={game.status}
        statusLabel={t(GAME_STATUS_LABELS[game.status])}
      />
    </button>
  )
}

type GamesLibraryProps = {
  profileName: string
  collection: Game[]
  context: GameLibraryContext
  searchState: GameSearchState
  onContextChange: Dispatch<SetStateAction<GameLibraryContext>>
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
  // L'ordre visible commence par Tous ; la vue d'ouverture reste la watchlist.
  const openingView = defaultBuiltinViewForMedium(RATED_BUILTIN_VIEWS, 'games')
  const isUnfiltered = context.query.trim() === '' && context.platform === 'all' && context.view.id === openingView.id && !hasActiveFilters(context.extraFilters) && context.sortOverride === null
  const resolved = resolveLibraryQuery(context.view, context.extraFilters, context.sortOverride)
  const platforms = buildGamePlatformFilters(collection)
  const { visibleItems: visibleGames, sentinelRef: gamesSentinelRef } = useIncrementalList(
    searchState.status === 'ready' ? searchState.games : [],
    `games|${context.query}|${context.platform}|${context.view.id}|${context.sortOverride ?? ''}|${JSON.stringify(context.extraFilters)}`,
  )
  const [autoAssociateOpen, setAutoAssociateOpen] = useState(false)

  const runGamesAssociation = async ({ onProgress, isCancelled }: {
    onProgress: (processed: number, total: number) => void
    isCancelled: () => boolean
  }) => {
    let associatedCount = 0
    let noMatchCount = 0
    for (let index = 0; index < collection.length; index += 1) {
      if (isCancelled()) break
      const game = collection[index]
      try {
        const candidates = await searchIgdbGames(game.title)
        const scored = candidates
          .map((candidate) => ({
            candidate,
            score: scoreNamedCandidate(game.title, game.year ?? null, candidate.title, candidate.releaseYear),
          }))
          .sort((a, b) => b.score - a.score)
        if (scored.length > 0 && scored[0].score >= MATCH_THRESHOLD) {
          const presentation = await previewIgdbGame(scored[0].candidate.gameId, scored[0].candidate.title, scored[0].candidate.releaseYear, scored[0].candidate.coverUrl)
          await mediaRepository.updateGame(
            profileId,
            game.id,
            gameWithPresentation(game, {
              developer: presentation.developer,
              releaseYear: presentation.releaseYear,
              coverUrl: presentation.coverUrl,
            }),
          )
          await mediaRepository.setMediaProviderLink({ profileId, medium: 'games', mediaId: game.id, providerName: 'IGDB', providerId: String(presentation.gameId) })
          associatedCount += 1
        } else {
          noMatchCount += 1
        }
      } catch {
        noMatchCount += 1
      }
      onProgress(index + 1, collection.length)
      await delay(REQUEST_DELAY_MS)
    }
    return { associatedCount, noMatchCount }
  }

  return (
    <main className="main library-main" aria-label={t`Bibliothèque Jeux du profil ${profileName}`}>
      <header className="library-header">
        <div>
          <h1 className="display-title">{t("Jeux")}</h1>
          <p className="library-subtitle">
            {librarySubtitle(collection, 'jeu', 'jeux')}
            <span className="subtitle-sep" aria-hidden="true">·</span>
            <ShareCardLink profileId={profileId} library="games" />
          </p>
        </div>
        <div className="library-header-actions">
          <button
            className="auto-associate-button"
            type="button"
            onClick={() => setAutoAssociateOpen(true)}
            title={t("Normaliser les couvertures et fiches via IGDB")}
          >
            {icon('wand')}
            <span>{t("Tout associer")}</span>
          </button>
          <LibraryImportButton
            kind="games"
            buttonLabel={t("Importer")}
            mediumLabel={t("jeu")}
            profileId={profileId}
            profileName={profileName}
            existing={collection}
            onDone={onLibraryChanged}
          />
          <LibraryExportFlow kind="games" profileId={profileId} />
          <button className="primary-button" type="button" onClick={onCreate}>{t("Ajouter un jeu")}</button>
        </div>
      </header>
      {/* 0.6.27 : barre d'outils toujours affichée, même bibliothèque vide. */}
      <div className="library-tools">
        <label className="search">
          {icon('search')}
          <span className="visually-hidden">{t("Rechercher par titre, studio ou plateforme")}</span>
          <input
            type="search"
            value={context.query}
            placeholder={t("Titre, studio ou plateforme")}
            onChange={(event) => onContextChange({ ...context, query: event.target.value })}
          />
        </label>
        <LibraryViewBar
          profileId={profileId}
          medium="games"
          builtinViews={titledBuiltinViews(RATED_BUILTIN_VIEWS, 'games')}
          activeView={context.view}
          onViewChange={(view) => onContextChange((current) => ({ ...current, view }))}
          filterConfig={{
            ...GAME_FILTER_PANEL_CONFIG,
            mediumFilter: {
              label: 'Plateforme',
              options: [{ value: 'all', label: 'Toutes' }, ...platforms.map((platform) => ({ value: platform, label: platform }))],
            },
          }}
          mediumFilterValue={context.platform}
          onMediumFilterChange={(platform) => onContextChange((current) => ({ ...current, platform }))}
          extraFilters={context.extraFilters}
          onExtraFiltersChange={(extraFilters) => onContextChange((current) => ({ ...current, extraFilters }))}
          sortCapabilities={{ rating: true, year: true }}
          sortOverride={context.sortOverride}
          onSortOverrideChange={(sortOverride) => onContextChange((current) => ({ ...current, sortOverride }))}
          currentCriteria={{ sort: resolved.sort, mediumFilter: context.platform, filters: resolved.filters }}
        />
      </div>
      {collection.length === 0 && isUnfiltered ? (
        <div className="library-state empty-library">
          <h2>{t("Votre bibliothèque Jeux est vide.")}</h2>
          <p>{t("Ajoutez un premier jeu, avec un titre seulement si vous le souhaitez.")}</p>
          <button className="primary-button empty-action" type="button" onClick={onCreate}>{t("Ajouter un jeu")}</button>
        </div>
      ) : (
        <>
          {searchState.status === 'loading' ? (
            <div className="results-state" role="status">{t("Recherche dans SQLite…")}</div>
          ) : searchState.status === 'error' ? (
            <div className="results-state error-state" role="alert">
              <h2>{t("La recherche locale a échoué.")}</h2>
              <p>{t("Vos jeux restent enregistrés. Réessayez pour relire les résultats depuis SQLite.")}</p>
              <button className="state-action" type="button" onClick={onRetrySearch}>{t("Réessayer")}</button>
            </div>
          ) : searchState.games.length === 0 ? (
            <div className="results-state empty-results">
              <h2>{isUnfiltered ? t('Aucun jeu dans la vue « {view} ».', { view: openingView.builtin ? t(openingView.name) : openingView.name }) : t("Aucun jeu ne correspond.")}</h2>
              <p>{isUnfiltered ? t("La vue « Tous » affiche toute votre bibliothèque.") : t("Modifiez la recherche ou revenez à tous les jeux.")}</p>
              <button className="state-action" type="button" onClick={() => onContextChange({ query: '', platform: 'all', view: builtinViewById(RATED_BUILTIN_VIEWS, isUnfiltered ? ALL_VIEW.id : WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}>{t("Afficher tous les jeux")}</button>
            </div>
          ) : (
            <>
              <div className="film-grid" aria-busy="false">
                {visibleGames.map((game) => (
                  <GameCard game={game} key={game.id} onOpen={() => onOpen(game)} />
                ))}
              </div>
              <div ref={gamesSentinelRef} className="incremental-sentinel" aria-hidden="true" />
            </>
          )}
        </>
      )}
      <AutoAssociateEditsDialog
        open={autoAssociateOpen}
        onClose={() => setAutoAssociateOpen(false)}
        providerLabel="IGDB"
        pendingCount={collection.length}
        confirmText={t("Normaliser tous les jeux via IGDB ?")}
        run={runGamesAssociation}
        onDone={onLibraryChanged}
      />
    </main>
  )
}

function ArtworkCard({ artwork, onOpen }: { artwork: Artwork; onOpen: () => void }) {
  // L'Art n'a pas de note : la forme reste devant l'artiste, l'année occupe la
  // place que les autres médiums donnent à la note.
  const creator = [t(ARTWORK_FORM_LABELS[artwork.form]), artwork.artist].filter(Boolean).join(' · ')
  // Grille éditoriale (27 octobre 2026) : la carte prend la largeur que lui
  // donne le format de son image dans la rangée (`--ar`).
  const frame = useArtworkFrame(artwork)

  return (
    <button className="film-card artwork-card" type="button" onClick={onOpen} aria-label={t`Ouvrir la fiche de ${artwork.title}`} style={{ '--ar': frame.ratio } as CSSProperties}>
      <ArtworkVisual artwork={artwork} frame={frame} />
      <WorkCardFacts
        title={artwork.title}
        isFavorite={artwork.isFavorite}
        creator={creator === '' ? null : creator}
        rating={null}
        year={artwork.year}
        status={artwork.status}
        statusLabel={t(ARTWORK_STATUS_LABELS[artwork.status])}
      />
    </button>
  )
}

type ArtworksLibraryProps = {
  profileName: string
  collection: Artwork[]
  context: ArtworkLibraryContext
  searchState: ArtworkSearchState
  onContextChange: Dispatch<SetStateAction<ArtworkLibraryContext>>
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
  // Tous ouvre la rangée et, depuis le 18 octobre 2026, la bibliothèque Art
  // elle-même : « Favori » n'en montrait qu'une petite partie.
  const openingView = defaultBuiltinViewForMedium(UNRATED_BUILTIN_VIEWS, 'artworks')
  const isUnfiltered = context.query.trim() === '' && context.form === 'all' && context.view.id === openingView.id && !hasActiveFilters(context.extraFilters) && context.sortOverride === null
  const resolved = resolveLibraryQuery(context.view, context.extraFilters, context.sortOverride)
  const { visibleItems: visibleArtworks, sentinelRef: artworksSentinelRef } = useIncrementalList(
    searchState.status === 'ready' ? searchState.artworks : [],
    `artworks|${context.query}|${context.form}|${context.view.id}|${context.sortOverride ?? ''}|${JSON.stringify(context.extraFilters)}`,
  )

  return (
    <main className="main library-main artwork-library-main" aria-label={t`Bibliothèque Art du profil ${profileName}`}>
      <header className="library-header">
        <div>
          <h1 className="display-title">{t("Art")}</h1>
          <p className="library-subtitle">
            {librarySubtitle(collection, 'œuvre', 'œuvres')}
            <span className="subtitle-sep" aria-hidden="true">·</span>
            <ShareCardLink profileId={profileId} library="artworks" />
          </p>
        </div>
        <div className="library-header-actions">
          <LibraryImportButton
            kind="artworks"
            buttonLabel={t("Importer")}
            mediumLabel={t("œuvre")}
            profileId={profileId}
            profileName={profileName}
            existing={collection}
            onDone={onLibraryChanged}
          />
          <LibraryExportFlow kind="artworks" profileId={profileId} />
          <button className="primary-button" type="button" onClick={onCreate}>{t("Ajouter une œuvre")}</button>
        </div>
      </header>
      {/* 0.6.27 : barre d'outils toujours affichée, même bibliothèque vide. */}
      <div className="library-tools">
        <label className="search">
          {icon('search')}
          <span className="visually-hidden">{t("Rechercher par titre, artiste, lieu ou exposition")}</span>
          <input
            type="search"
            value={context.query}
            placeholder={t("Titre, artiste, lieu ou exposition")}
            onChange={(event) => onContextChange({ ...context, query: event.target.value })}
          />
        </label>
        <LibraryViewBar
          profileId={profileId}
          medium="artworks"
          builtinViews={titledBuiltinViews(UNRATED_BUILTIN_VIEWS, 'artworks')}
          activeView={context.view}
          onViewChange={(view) => onContextChange((current) => ({ ...current, view }))}
          filterConfig={ARTWORK_FILTER_PANEL_CONFIG}
          mediumFilterValue={context.form}
          onMediumFilterChange={(form) => onContextChange((current) => ({ ...current, form: form as ArtworkSearchCriteria['form'] }))}
          extraFilters={context.extraFilters}
          onExtraFiltersChange={(extraFilters) => onContextChange((current) => ({ ...current, extraFilters }))}
          sortCapabilities={{ rating: false, year: true }}
          sortOverride={context.sortOverride}
          onSortOverrideChange={(sortOverride) => onContextChange((current) => ({ ...current, sortOverride }))}
          currentCriteria={{ sort: resolved.sort, mediumFilter: context.form, filters: resolved.filters }}
        />
      </div>
      {collection.length === 0 && isUnfiltered ? (
        <div className="library-state empty-library">
          <h2>{t("Votre bibliothèque Art est vide.")}</h2>
          <p>{t("Ajoutez une première œuvre, avec un titre seulement si vous le souhaitez.")}</p>
          <button className="primary-button empty-action" type="button" onClick={onCreate}>{t("Ajouter une œuvre")}</button>
        </div>
      ) : (
        <>
          {searchState.status === 'loading' ? (
            <div className="results-state" role="status">{t("Recherche dans SQLite…")}</div>
          ) : searchState.status === 'error' ? (
            <div className="results-state error-state" role="alert">
              <h2>{t("La recherche locale a échoué.")}</h2>
              <p>{t("Vos œuvres restent enregistrées. Réessayez pour relire les résultats depuis SQLite.")}</p>
              <button className="state-action" type="button" onClick={onRetrySearch}>{t("Réessayer")}</button>
            </div>
          ) : searchState.artworks.length === 0 ? (
            <div className="results-state empty-results">
              <h2>{isUnfiltered ? t('Aucune œuvre dans la vue « {view} ».', { view: openingView.builtin ? t(openingView.name) : openingView.name }) : t("Aucune œuvre ne correspond.")}</h2>
              <p>{isUnfiltered ? t("La vue « Tous » affiche toute votre bibliothèque.") : t("Modifiez la recherche ou revenez à toutes les œuvres.")}</p>
              <button className="state-action" type="button" onClick={() => onContextChange({ query: '', form: 'all', view: builtinViewById(UNRATED_BUILTIN_VIEWS, isUnfiltered ? ALL_VIEW.id : ARTWORKS_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}>{t("Afficher toutes les œuvres")}</button>
            </div>
          ) : (
            <>
              <div className="artwork-grid" aria-busy="false">
                {visibleArtworks.map((artwork) => (
                  <ArtworkCard artwork={artwork} key={artwork.id} onOpen={() => onOpen(artwork)} />
                ))}
              </div>
              <div ref={artworksSentinelRef} className="incremental-sentinel" aria-hidden="true" />
            </>
          )}
        </>
      )}
    </main>
  )
}

type BooksLibraryProps = {
  library: BookLibraryKey
  allBooks: Book[]
  profileName: string
  collection: Book[]
  context: BookLibraryContext
  searchState: BookSearchState
  onContextChange: Dispatch<SetStateAction<BookLibraryContext>>
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
  library,
  allBooks,
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
  // L'ordre visible commence par Tous ; la vue d'ouverture reste la watchlist.
  const openingView = defaultBuiltinViewForMedium(PROGRESS_BUILTIN_VIEWS, 'books')
  const categories = bookLibraryCategories(library)
  const label = library === 'mangas' ? 'Mangas' : 'Livres'
  const singular = library === 'mangas' ? 'manga' : 'livre'
  const plural = library === 'mangas' ? 'mangas' : 'livres'
  const isUnfiltered = context.query.trim() === '' && context.category.length === categories.length && context.view.id === openingView.id && !hasActiveFilters(context.extraFilters) && context.sortOverride === null
  const resolved = resolveLibraryQuery(context.view, context.extraFilters, context.sortOverride)
  const storedCategory = bookLibraryStoredFilter(library, context.category)
  const { visibleItems: visibleBooks, sentinelRef: booksSentinelRef } = useIncrementalList(
    searchState.status === 'ready' ? searchState.books : [],
    `${library}|${context.query}|${context.category.join(',')}|${context.view.id}|${context.sortOverride ?? ''}|${JSON.stringify(context.extraFilters)}`,
  )
  const [autoAssociateOpen, setAutoAssociateOpen] = useState(false)

  const runBooksAssociation = async ({ onProgress, isCancelled }: {
    onProgress: (processed: number, total: number) => void
    isCancelled: () => boolean
  }) => {
    let associatedCount = 0
    let noMatchCount = 0
    for (let index = 0; index < collection.length; index += 1) {
      if (isCancelled()) break
      const book = collection[index]
      try {
        const candidates = await searchOpenLibraryBooks(book.title)
        const scored = candidates
          .map((candidate) => ({
            candidate,
            score: scoreNamedCandidate(book.title, book.year ?? null, candidate.title, candidate.firstPublishYear),
          }))
          .sort((a, b) => b.score - a.score)
        if (scored.length > 0 && scored[0].score >= MATCH_THRESHOLD) {
          const presentation = await previewOpenLibraryBook(scored[0].candidate)
          await mediaRepository.updateBook(
            profileId,
            book.id,
            bookWithPresentation(book, {
              author: presentation.author,
              firstPublishYear: presentation.firstPublishYear,
              synopsis: presentation.synopsis,
              coverUrl: presentation.coverUrl,
            }),
            undefined,
            bookLibraryForCategory(book.category),
          )
          await mediaRepository.setMediaProviderLink({ profileId, medium: bookLibraryForCategory(book.category), mediaId: book.id, providerName: 'Open Library', providerId: presentation.workKey })
          associatedCount += 1
        } else {
          noMatchCount += 1
        }
      } catch {
        noMatchCount += 1
      }
      onProgress(index + 1, collection.length)
      await delay(REQUEST_DELAY_MS)
    }
    return { associatedCount, noMatchCount }
  }

  return (
    <main className="main library-main" aria-label={t`Bibliothèque ${t(label)} du profil ${profileName}`}>
      <header className="library-header">
        <div>
          <h1 className="display-title">{t(label)}</h1>
          <p className="library-subtitle">
            {librarySubtitle(collection, singular, plural)}
            <span className="subtitle-sep" aria-hidden="true">·</span>
            <ShareCardLink profileId={profileId} library={library} />
          </p>
        </div>
        <div className="library-header-actions">
          <button
            className="auto-associate-button"
            type="button"
            onClick={() => setAutoAssociateOpen(true)}
            title={t("Normaliser les couvertures et fiches via Open Library")}
          >
            {icon('wand')}
            <span>{t("Tout associer")}</span>
          </button>
          <LibraryImportButton
            kind="books"
            buttonLabel={t("Importer")}
            mediumLabel={singular}
            bookLibrary={library}
            profileId={profileId}
            profileName={profileName}
            existing={collection}
            onDone={onLibraryChanged}
          />
          <LibraryExportFlow kind="books" profileId={profileId} bookLibrary={library} />
          <button className="primary-button" type="button" onClick={onCreate}>{t('Ajouter un {medium}', { medium: t(singular) })}</button>
        </div>
      </header>
      {/* 0.6.27 : barre d'outils toujours affichée, même bibliothèque vide. */}
      <div className="library-tools">
        <label className="search">
          {icon('search')}
          <span className="visually-hidden">{t("Rechercher par titre, auteur ou résumé")}</span>
          <input
            type="search"
            value={context.query}
            placeholder={t("Titre, auteur ou résumé")}
            onChange={(event) => onContextChange({ ...context, query: event.target.value })}
          />
        </label>
        <LibraryViewBar
          profileId={profileId}
          medium="books"
          bookLibrary={library}
          builtinViews={titledBuiltinViews(PROGRESS_BUILTIN_VIEWS, 'books')}
          activeView={context.view}
          onViewChange={(view) => onContextChange((current) => ({ ...current, view }))}
          filterConfig={BOOK_FILTER_PANEL_CONFIG}
          mediumFilterValue={library === 'books' ? storedCategory : 'all'}
          onMediumFilterChange={(stored) => {
            onContextChange((current) => ({ ...current, category: bookLibraryCategories(library, stored) }))
          }}
          extraFilters={context.extraFilters}
          onExtraFiltersChange={(extraFilters) => onContextChange((current) => ({ ...current, extraFilters }))}
          sortCapabilities={{ rating: true, year: true }}
          sortOverride={context.sortOverride}
          onSortOverrideChange={(sortOverride) => onContextChange((current) => ({ ...current, sortOverride }))}
          currentCriteria={{ sort: resolved.sort, mediumFilter: storedCategory, filters: resolved.filters }}
        />
      </div>
      {collection.length === 0 && isUnfiltered ? (
        <div className="library-state empty-library">
          <h2>{t('La bibliothèque {library} est vide.', { library: t(label) })}</h2>
          <p>{t('Ajouter un premier {medium}, avec un titre seulement si nécessaire.', { medium: t(singular) })}</p>
          <button className="primary-button empty-action" type="button" onClick={onCreate}>{t('Ajouter un {medium}', { medium: t(singular) })}</button>
        </div>
      ) : (
        <>
          {searchState.status === 'loading' ? (
            <div className="results-state" role="status">{t("Recherche dans SQLite…")}</div>
          ) : searchState.status === 'error' ? (
            <div className="results-state error-state" role="alert">
              <h2>{t("La recherche locale a échoué.")}</h2>
              <p>{t('Les {medium} restent enregistrés. Réessayer pour relire les résultats depuis SQLite.', { medium: t(plural) })}</p>
              <button className="state-action" type="button" onClick={onRetrySearch}>{t("Réessayer")}</button>
            </div>
          ) : searchState.books.length === 0 ? (
            <div className="results-state empty-results">
              <h2>{isUnfiltered ? t('Aucun {medium} dans la vue « {view} ».', { medium: t(singular), view: openingView.builtin ? t(openingView.name) : openingView.name }) : t('Aucun {medium} ne correspond.', { medium: t(singular) })}</h2>
              <p>{isUnfiltered ? t("La vue « Tous » affiche toute la bibliothèque.") : t('Modifier la recherche ou revenir à tous les {medium}.', { medium: t(plural) })}</p>
              <button
                className="state-action"
                type="button"
                onClick={() => onContextChange({ query: '', category: [...categories], view: builtinViewById(PROGRESS_BUILTIN_VIEWS, isUnfiltered ? ALL_VIEW.id : WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}
              >
                {t('Afficher tous les {medium}', { medium: t(plural) })}
              </button>
            </div>
          ) : (
            <>
              <div className="film-grid" aria-busy="false">
                {visibleBooks.map((book) => (
                  <BookCard book={book} key={book.id} onOpen={() => onOpen(book)} />
                ))}
              </div>
              <div ref={booksSentinelRef} className="incremental-sentinel" aria-hidden="true" />
            </>
          )}
        </>
      )}
      <AutoAssociateEditsDialog
        open={autoAssociateOpen}
        onClose={() => setAutoAssociateOpen(false)}
        providerLabel="Open Library"
        pendingCount={collection.length}
        confirmText={t('Normaliser tous les {medium} via Open Library ?', { medium: t(plural) })}
        run={runBooksAssociation}
        onDone={onLibraryChanged}
      />
    </main>
  )
}

/**
 * Écran d'où une fiche a été ouverte. C'est à la fois la cible du bouton
 * retour et la clé sous laquelle la position de défilement est mémorisée.
 */
type ReturnKey = 'home' | 'library' | 'series' | 'anime' | 'books' | 'mangas' | 'games' | 'artworks'

type View =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'series' }
  | { name: 'anime' }
  | { name: 'settings' }
  | { name: 'create'; initialValues?: FilmFormValues; provenance?: FilmMetadataProvenance | null }
  | { name: 'tmdb-search' }
  | { name: 'tmdb-associate'; filmId: string }
  | { name: 'detail'; filmId: string; returnTo: ReturnKey }
  | { name: 'series-detail'; seriesId: string; returnTo: ReturnKey }
  | { name: 'books' }
  | { name: 'mangas' }
  | { name: 'book-detail'; bookId: string; returnTo: ReturnKey }
  | { name: 'games' }
  | { name: 'game-detail'; gameId: string; returnTo: ReturnKey }
  | { name: 'artworks' }
  | { name: 'artwork-detail'; artworkId: string; returnTo: ReturnKey }
  | { name: 'custom'; libraryId: CustomLibraryId; entryId: string | null }

/** Vue de destination d'un retour : l'écran d'où la fiche a été ouverte. */
function returnView(key: ReturnKey): View {
  switch (key) {
    case 'home':
      return { name: 'home' }
    case 'library':
      return { name: 'library' }
    case 'series':
      return { name: 'series' }
    case 'anime':
      return { name: 'anime' }
    case 'books':
      return { name: 'books' }
    case 'mangas':
      return { name: 'mangas' }
    case 'games':
      return { name: 'games' }
    default:
      return { name: 'artworks' }
  }
}

/** Retour d'une fiche Livres ou Mangas : il nomme l'écran d'origine réel. */
function bookBackLabel(returnTo: ReturnKey): string {
  return returnTo === 'home' ? t('Retour à l’accueil') : returnTo === 'mangas' ? t('Retour aux mangas') : t('Retour aux livres')
}

function seriesBackLabel(returnTo: ReturnKey): string {
  return returnTo === 'home' ? t('Retour à l’accueil') : returnTo === 'anime' ? t('Retour à l’animation japonaise') : t('Retour aux séries')
}

function sortFilms(films: Film[]): Film[] {
  return [...films].sort((first, second) => first.title.localeCompare(second.title, getLocale(), { sensitivity: 'base' }))
}

function sortBooks(books: Book[]): Book[] {
  return [...books].sort((first, second) => first.title.localeCompare(second.title, getLocale(), { sensitivity: 'base' }))
}

function sortGames(games: Game[]): Game[] {
  return [...games].sort((first, second) => first.title.localeCompare(second.title, getLocale(), { sensitivity: 'base' }))
}

function sortArtworks(artworks: Artwork[]): Artwork[] {
  return [...artworks].sort((first, second) => first.title.localeCompare(second.title, getLocale(), { sensitivity: 'base' }))
}

type SqliteFilmDetailProps = {
  profileId: string
  filmId: string
  detailRevision: string
  onBack: () => void
  backLabel: string
  onEdit: () => void
  onDelete: () => Promise<void>
  onAssociateTmdb: () => void
  /** Enregistre (ou retire, avec null) l'adresse de l'affiche dans la colonne locale de la fiche. */
  onPosterChange: (url: string | null) => Promise<void>
  tmdbNotice?: string | null
}

function SqliteFilmDetail({ profileId, filmId, detailRevision, onBack, backLabel, onEdit, onDelete, onAssociateTmdb, onPosterChange, tmdbNotice }: SqliteFilmDetailProps) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; film: Film } | { status: 'error' }>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Une relecture de la même fiche (affiche enregistrée depuis la fiche) garde l'écran en place :
    // repasser par « Chargement » fermerait la galerie d'affiches ouverte.
    setState((current) => (current.status === 'ready' && current.film.id === filmId ? current : { status: 'loading' }))

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
  }, [attempt, detailRevision, filmId, profileId])

  if (state.status === 'ready') {
    return <FilmDetail film={state.film} onBack={onBack} backLabel={backLabel} onEdit={onEdit} onDelete={onDelete} onAssociateTmdb={onAssociateTmdb} onPosterChange={onPosterChange} tmdbNotice={tmdbNotice} />
  }

  return (
    <main className="main detail-page-main">
      <header className="page-action-bar detail-action-bar">
        <button className="back-button back-button-icon" type="button" onClick={onBack} aria-label={backLabel}>{icon('arrow-left')}</button>
      </header>
      {state.status === 'loading' ? (
        <div className="library-state" role="status">
          <p className="state-kicker">{t('Fiche locale')}</p>
          <h2>{t('Chargement du film')}</h2>
          <p>{t('Lecture de la fiche enregistrée dans SQLite.')}</p>
        </div>
      ) : (
        <div className="library-state error-state" role="alert">
          <p className="state-kicker">{t('Fiche indisponible')}</p>
          <h2>{t('Ce film ne peut pas être ouvert.')}</h2>
          <p>{t('La fiche est absente ou SQLite n’a pas pu la relire.')}</p>
          <button className="state-action" type="button" onClick={() => setAttempt((value) => value + 1)}>{t('Réessayer')}</button>
        </div>
      )}
    </main>
  )
}

/** Cible d'association directe depuis une fiche : même parcours que les films, en pop-up. */
type AssociateTarget =
  | { medium: 'série'; id: string }
  | { medium: 'livre'; id: string }
  | { medium: 'jeu'; id: string }

function App() {
  // Abonne l'arbre entier au changement de langue : aucun remontage, brouillons conservés.
  useLanguage()
  const { preference: themePreference, setPreference: setThemePreference } = useTheme()
  // Barre latérale : « rail » (icônes seules) ou « étendue » (icônes + libellés).
  const [sidebarExpanded, setSidebarExpanded] = useState(readSidebarPinned)
  useEffect(() => saveSidebarPinned(sidebarExpanded), [sidebarExpanded])
  const [libraryState, setLibraryState] = useState<LibraryState>({ status: 'loading' })
  const [profiles, setProfiles] = useState<ProfileSummary[]>([])
  const [searchState, setSearchState] = useState<SearchState>({ status: 'loading' })
  const [libraryContext, setLibraryContext] = useState<LibraryContext>({ query: '', view: builtinViewById(RATED_BUILTIN_VIEWS, WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
  const [seriesCollection, setSeriesCollection] = useState<Series[]>([])
  const [seriesSearchState, setSeriesSearchState] = useState<SeriesSearchState>({ status: 'loading' })
  const [seriesContext, setSeriesContext] = useState<SeriesLibraryContext>({ query: '', category: seriesLibraryCategories('series'), view: builtinViewById(PROGRESS_BUILTIN_VIEWS, WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
  const [animeContext, setAnimeContext] = useState<SeriesLibraryContext>({ query: '', category: seriesLibraryCategories('anime'), view: builtinViewById(PROGRESS_BUILTIN_VIEWS, WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
  const [animeSearchState, setAnimeSearchState] = useState<SeriesSearchState>({ status: 'loading' })
  const [seriesSearchAttempt, setSeriesSearchAttempt] = useState(0)
  const [bookCollection, setBookCollection] = useState<Book[]>([])
  const [bookSearchState, setBookSearchState] = useState<BookSearchState>({ status: 'loading' })
  const [bookContext, setBookContext] = useState<BookLibraryContext>({ query: '', category: bookLibraryCategories('books'), view: builtinViewById(PROGRESS_BUILTIN_VIEWS, WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
  const [mangaContext, setMangaContext] = useState<BookLibraryContext>({ query: '', category: bookLibraryCategories('mangas'), view: builtinViewById(PROGRESS_BUILTIN_VIEWS, WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
  const [mangaSearchState, setMangaSearchState] = useState<BookSearchState>({ status: 'loading' })
  const [bookSearchAttempt, setBookSearchAttempt] = useState(0)
  const [gameCollection, setGameCollection] = useState<Game[]>([])
  const [gameSearchState, setGameSearchState] = useState<GameSearchState>({ status: 'loading' })
  const [gameContext, setGameContext] = useState<GameLibraryContext>({ query: '', platform: 'all', view: builtinViewById(RATED_BUILTIN_VIEWS, WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
  const [gameSearchAttempt, setGameSearchAttempt] = useState(0)
  const [artworkCollection, setArtworkCollection] = useState<Artwork[]>([])
  const [artworkSearchState, setArtworkSearchState] = useState<ArtworkSearchState>({ status: 'loading' })
  const [artworkContext, setArtworkContext] = useState<ArtworkLibraryContext>({ query: '', form: 'all', view: builtinViewById(UNRATED_BUILTIN_VIEWS, ARTWORKS_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
  const [artworkSearchAttempt, setArtworkSearchAttempt] = useState(0)
  const [customLibraries, setCustomLibraries] = useState<EnabledCustomLibrary[]>([])
  const [customLibrariesRevision, setCustomLibrariesRevision] = useState(0)
  const [addLibraryOpen, setAddLibraryOpen] = useState(false)
  const [view, setView] = useState<View>({ name: 'home' })
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('profiles')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [backupNotice, setBackupNotice] = useState<BackupNotice | null>(null)
  /** Vérification automatique, annonce et installation : voir src/data/appUpdate.ts. */
  const appUpdate = useAppUpdate()
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null)
  const [associatingFilm, setAssociatingFilm] = useState<Film | null>(null)
  /** Pop-up d'association directe depuis une fiche Série/Livre/Jeu (parcours des films). */
  const [associateTarget, setAssociateTarget] = useState<AssociateTarget | null>(null)
  /** Pop-up d'ajout : étapes recherche → formulaire, au-dessus de la bibliothèque.
      Cinq médiums, même parcours (0.6.10) ; l'Art, sans fournisseur, entre
      directement au stade formulaire. */
  type AddFlow =
    | { medium: 'film'; step: 'search'; initialValues?: FilmFormValues; provenance?: FilmMetadataProvenance | null; tmdbPresentation?: TmdbFilmPresentation; editFilmId?: string }
    | { medium: 'série'; step: 'search'; initialValues?: SeriesFormValues; providerLink?: MediaProviderReference | null; editSeriesId?: string; seriesLibrary?: SeriesLibraryKey }
    | { medium: 'livre'; step: 'search'; initialValues?: BookFormValues; providerLink?: MediaProviderReference | null; editBookId?: string; bookLibrary?: BookLibraryKey; quoteDraft?: boolean }
    | { medium: 'jeu'; step: 'search'; initialValues?: GameFormValues; providerLink?: MediaProviderReference | null; editGameId?: string }
    | { medium: 'artwork'; step: 'form'; editArtworkId?: string }
  const [addFlow, setAddFlow] = useState<AddFlow | null>(null)
  const [candidateSelection, setCandidateSelection] = useState<{ pendingId: number | null; error: string | null }>({ pendingId: null, error: null })
  const [bookSelection, setBookSelection] = useState<{ pendingKey: string | null; error: string | null }>({ pendingKey: null, error: null })
  const [tmdbNotice, setTmdbNotice] = useState<{ filmId: string; message: string } | null>(null)
  /** Position de défilement mémorisée par écran (accueil et bibliothèques). */
  const scrollMemory = useRef(new Map<string, number>())
  const pendingScrollRestore = useRef<{ key: string; top: number; restoreBookFocus?: boolean } | null>(null)
  const bookOpenerRef = useRef<{ key: ReturnKey; label: string; index: number } | null>(null)
  /** L'accueil défile dans sa propre colonne, les bibliothèques dans la fenêtre. */
  const homeScrollRef = useRef<HTMLElement | null>(null)

  /**
   * Une écriture faite depuis une fiche — visuel remplacé, fiche associée à un
   * fournisseur — laissait la grille de sa bibliothèque en arrière : la grille
   * affiche le résultat de sa propre requête SQL, distinct de la collection
   * maître tenue en mémoire. On relance donc cette requête après l'écriture.
   * Films n'en a pas besoin : sa grille lit directement la collection maître.
   */
  const refreshLibraryQuery = (medium: 'série' | 'livre' | 'jeu' | 'artwork') => {
    if (medium === 'série') setSeriesSearchAttempt((attempt) => attempt + 1)
    else if (medium === 'livre') setBookSearchAttempt((attempt) => attempt + 1)
    else if (medium === 'jeu') setGameSearchAttempt((attempt) => attempt + 1)
    else setArtworkSearchAttempt((attempt) => attempt + 1)
  }

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

    Promise.all([
      mediaRepository.listSeries(libraryState.library.profile.id, 'series'),
      mediaRepository.listSeries(libraryState.library.profile.id, 'anime'),
    ]).then(
      ([series, anime]) => { if (!cancelled) setSeriesCollection([...series, ...anime]) },
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

    Promise.all([
      mediaRepository.listBooks(libraryState.library.profile.id, 'books'),
      mediaRepository.listBooks(libraryState.library.profile.id, 'mangas'),
    ]).then(
      ([books, mangas]) => { if (!cancelled) setBookCollection([...books, ...mangas]) },
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

  // Bibliothèques personnalisées du profil : barre latérale et comptes. Une
  // bibliothèque ouverte qui n’existe pas dans le profil chargé ramène à
  // l’accueil (changement de profil, restauration).
  useEffect(() => {
    if (libraryState.status !== 'ready') return
    let cancelled = false

    customLibraryRepository.listEnabled(libraryState.library.profile.id).then(
      (enabled) => {
        if (cancelled) return
        setCustomLibraries(enabled)
        setView((current) => current.name === 'custom' && !enabled.some((library) => library.libraryId === current.libraryId) ? { name: 'home' } : current)
      },
      (error: unknown) => {
        console.error('Impossible de charger les bibliothèques personnalisées depuis SQLite.', error)
        if (!cancelled) setCustomLibraries([])
      },
    )

    return () => {
      cancelled = true
    }
  }, [libraryState, customLibrariesRevision])

  useEffect(() => {
    if (libraryState.status !== 'ready') return
    let cancelled = false
    setGameSearchState({ status: 'loading' })
    const timeout = window.setTimeout(() => {
      const resolved = resolveLibraryQuery(gameContext.view, gameContext.extraFilters, gameContext.sortOverride)
      mediaRepository.searchGames(libraryState.library.profile.id, { query: gameContext.query, platform: gameContext.platform, filters: resolved.filters, sort: resolved.sort }).then(
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
      const resolved = resolveLibraryQuery(artworkContext.view, artworkContext.extraFilters, artworkContext.sortOverride)
      mediaRepository.searchArtworks(libraryState.library.profile.id, { query: artworkContext.query, form: artworkContext.form, filters: resolved.filters, sort: resolved.sort }).then(
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
      const resolved = resolveLibraryQuery(seriesContext.view, seriesContext.extraFilters, seriesContext.sortOverride)
      mediaRepository.searchSeries(libraryState.library.profile.id, { query: seriesContext.query, category: seriesContext.category, filters: resolved.filters, sort: resolved.sort }, 'series').then(
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
    setAnimeSearchState({ status: 'loading' })
    const timeout = window.setTimeout(() => {
      const resolved = resolveLibraryQuery(animeContext.view, animeContext.extraFilters, animeContext.sortOverride)
      mediaRepository.searchSeries(libraryState.library.profile.id, { query: animeContext.query, category: animeContext.category, filters: resolved.filters, sort: resolved.sort }, 'anime').then(
        (series) => {
          if (!cancelled) setAnimeSearchState({ status: 'ready', series })
        },
        (error: unknown) => {
          console.error('Impossible de rechercher l’animation japonaise dans SQLite.', error)
          if (!cancelled) setAnimeSearchState({ status: 'error' })
        },
      )
    }, animeContext.query ? 140 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [animeContext, libraryState, seriesSearchAttempt])

  useEffect(() => {
    if (libraryState.status !== 'ready') return
    let cancelled = false
    setBookSearchState({ status: 'loading' })
    const timeout = window.setTimeout(() => {
      const resolved = resolveLibraryQuery(bookContext.view, bookContext.extraFilters, bookContext.sortOverride)
      mediaRepository.searchBooks(libraryState.library.profile.id, { query: bookContext.query, category: bookContext.category, filters: resolved.filters, sort: resolved.sort }, 'books').then(
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
    if (libraryState.status !== 'ready') return
    let cancelled = false
    setMangaSearchState({ status: 'loading' })
    const timeout = window.setTimeout(() => {
      const resolved = resolveLibraryQuery(mangaContext.view, mangaContext.extraFilters, mangaContext.sortOverride)
      mediaRepository.searchBooks(libraryState.library.profile.id, { query: mangaContext.query, category: mangaContext.category, filters: resolved.filters, sort: resolved.sort }, 'mangas').then(
        (books) => {
          if (!cancelled) setMangaSearchState({ status: 'ready', books })
        },
        (error: unknown) => {
          console.error('Impossible de rechercher les mangas dans SQLite.', error)
          if (!cancelled) setMangaSearchState({ status: 'error' })
        },
      )
    }, mangaContext.query ? 140 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [mangaContext, libraryState, bookSearchAttempt])

  useEffect(() => {
    if (libraryState.status !== 'ready') return

    let cancelled = false
    setSearchState({ status: 'loading' })
    const timeout = window.setTimeout(() => {
      const resolved = resolveLibraryQuery(libraryContext.view, libraryContext.extraFilters, libraryContext.sortOverride)
      filmsRepository.searchFilms(libraryState.library.profile.id, { query: libraryContext.query, filters: resolved.filters, sort: resolved.sort }).then(
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
    const pending = pendingScrollRestore.current
    if (pending === null || view.name !== pending.key) return
    if (pending.restoreBookFocus && ((pending.key === 'books' && bookSearchState.status === 'loading')
      || (pending.key === 'mangas' && mangaSearchState.status === 'loading'))) return

    const frame = window.requestAnimationFrame(() => {
      pendingScrollRestore.current = null
      // L'accueil défile dans sa colonne sur grand écran, dans la fenêtre
      // ensuite : on écrit aux deux endroits, seul le vrai conteneur répond.
      const home = homeScrollRef.current
      if (home) home.scrollTop = pending.top
      window.scrollTo({ top: pending.top })
      if (pending.restoreBookFocus) {
        const opener = bookOpenerRef.current
        const matching = opener?.key === pending.key
          ? [...document.querySelectorAll<HTMLElement>('main button[aria-label]')].filter((button) => button.getAttribute('aria-label') === opener.label)
          : []
        // Après une suppression ou un changement de bibliothèque, la carte
        // peut avoir disparu : le repère de navigation reste une cible utile.
        const label = t(pending.key === 'home' ? 'Accueil' : pending.key === 'mangas' ? 'Mangas' : 'Livres')
        const fallback = document.querySelector<HTMLElement>(`.sidebar nav button[aria-label="${label}"]`)
        ;(matching[opener?.index ?? 0] ?? fallback)?.focus({ preventScroll: true })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [view, bookSearchState, mangaSearchState])

  /** Position de défilement de l'écran affiché, quel que soit son conteneur. */
  const currentScroll = () => {
    const home = homeScrollRef.current
    return home ? Math.max(home.scrollTop, window.scrollY) : window.scrollY
  }

  const leaveLibrary = (nextView: View) => {
    scrollMemory.current.set(view.name, currentScroll())
    if (nextView.name === 'book-detail' && view.name === nextView.returnTo) {
      const active = document.activeElement
      const label = active?.getAttribute('aria-label')
      const matching = [...document.querySelectorAll('main button[aria-label]')].filter((button) => button.getAttribute('aria-label') === label)
      bookOpenerRef.current = label ? { key: nextView.returnTo, label, index: Math.max(0, matching.indexOf(active as Element)) } : null
    }
    setView(nextView)
    if (homeScrollRef.current) homeScrollRef.current.scrollTop = 0
    window.scrollTo({ top: 0 })
  }

  /** Retour depuis une fiche : l'écran d'origine retrouve sa place exacte. */
  const goBackTo = (key: ReturnKey) => {
    pendingScrollRestore.current = { key, top: scrollMemory.current.get(key) ?? 0, restoreBookFocus: view.name === 'book-detail' }
    setView(returnView(key))
    if (homeScrollRef.current) homeScrollRef.current.scrollTop = 0
    window.scrollTo({ top: 0 })
  }

  const returnToLibrary = () => {
    if (view.name === 'library') return
    pendingScrollRestore.current = { key: 'library', top: scrollMemory.current.get('library') ?? 0 }
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
    // Le réglage et le jour sont vérifiés avant de charger ou de sérialiser
    // quoi que ce soit : sans dossier, ou si la copie du jour existe déjà,
    // cette écriture ne coûte rien.
    void backupService.tryAutomaticSnapshotIfDue(library, () =>
      collectProfileExperience(library.profile.id).catch((error) => {
        console.warn('Expérience du profil illisible pour la sauvegarde.', error)
        return undefined
      }),
    ).then((notice) => {
      if (notice) setBackupNotice(notice)
    })
  }

  const activeBookLibrary: BookLibraryKey = view.name === 'mangas' || (view.name === 'book-detail' && bookCollection.find((book) => book.id === view.bookId)?.category === 'manga') ? 'mangas' : 'books'
  const activeSeriesLibrary: SeriesLibraryKey = view.name === 'anime' || (view.name === 'series-detail' && seriesCollection.find((series) => series.id === view.seriesId)?.category === 'animation') ? 'anime' : 'series'
  const count = libraryState.status === 'ready' ? libraryState.library.films.length : null
  const seriesCount = libraryState.status === 'ready' ? seriesForLibrary(seriesCollection, 'series').length : null
  const animeCount = libraryState.status === 'ready' ? seriesForLibrary(seriesCollection, 'anime').length : null
  const bookCount = libraryState.status === 'ready' ? booksForLibrary(bookCollection, 'books').length : null
  const mangaCount = libraryState.status === 'ready' ? booksForLibrary(bookCollection, 'mangas').length : null
  const gameCount = libraryState.status === 'ready' ? gameCollection.length : null
  const artworkCount = libraryState.status === 'ready' ? artworkCollection.length : null
  let content

  // Jalon 0.4.25 : un clic sur un résultat TMDB agit directement, sans écran
  // intermédiaire — préremplissage du formulaire en création, association
  // immédiate à une fiche existante.
  const selectTmdbCandidate = async (candidate: TmdbSearchCandidate) => {
    const film = associatingFilm
    setCandidateSelection({ pendingId: candidate.tmdbId, error: null })
    try {
      if (film) {
        await associateFilmWithTmdb(film.id, candidate.tmdbId)
        setAssociatingFilm(null)
        setCandidateSelection({ pendingId: null, error: null })
        setView({ name: 'detail', filmId: film.id, returnTo: 'library' })
        return
      }
      const presentation = await previewTmdbFilm(candidate.tmdbId)
      const initialValues = filmMetadataResultToFormInitialValues(
        tmdbPresentationToFilmMetadataResult(presentation),
      )
      setCandidateSelection({ pendingId: null, error: null })
      if (addFlow?.medium === 'film') {
        setAddFlow({
          medium: 'film',
          step: 'search',
          initialValues: initialValues.values,
          provenance: initialValues.provenance ?? null,
          tmdbPresentation: presentation,
        })
        return
      }
      setView({
        name: 'create',
        initialValues: initialValues.values,
        provenance: initialValues.provenance ?? null,
      })
    } catch (error) {
      console.error('La sélection TMDB a échoué.', error)
      setCandidateSelection({
        pendingId: null,
        error: 'La sélection a échoué. Vérifiez votre connexion puis réessayez ; la saisie manuelle reste possible.',
      })
    }
  }

  // Même parcours direct pour les Livres via Open Library (jalon 0.4.27),
  // sans clé ni compte.
  const selectOpenLibraryBookCandidate = async (candidate: OpenLibraryBookCandidate) => {
    setBookSelection({ pendingKey: candidate.workKey, error: null })
    try {
      const presentation = await previewOpenLibraryBook(candidate)
      setBookSelection({ pendingKey: null, error: null })
      if (addFlow?.medium === 'livre') {
        setAddFlow({
          medium: 'livre',
          step: 'search',
          bookLibrary: addFlow.bookLibrary,
          initialValues: { ...bookPresentationToInitialValues(presentation), category: addFlow.bookLibrary === 'mangas' ? 'manga' : 'livre' },
          providerLink: { providerName: 'Open Library', providerId: presentation.workKey },
        })
        return
      }
    } catch (error) {
      console.error('La sélection Open Library a échoué.', error)
      setBookSelection({
        pendingKey: null,
        error: 'La sélection a échoué. Vérifiez votre connexion puis réessayez ; la saisie manuelle reste possible.',
      })
    }
  }

  // Même parcours direct pour les Jeux via IGDB, identifiants
  // embarqués côté backend, jamais exposés au frontend.
  const selectIgdbGameCandidate = async (candidate: IgdbGameCandidate) => {
    setCandidateSelection({ pendingId: candidate.gameId, error: null })
    try {
      const presentation = await previewIgdbGame(candidate.gameId, candidate.title, candidate.releaseYear, candidate.coverUrl)
      setCandidateSelection({ pendingId: null, error: null })
      if (addFlow?.medium === 'jeu') {
        setAddFlow({
          medium: 'jeu',
          step: 'search',
          initialValues: igdbPresentationToInitialValues(presentation),
          providerLink: { providerName: 'IGDB', providerId: String(presentation.gameId) },
        })
        return
      }
    } catch (error) {
      console.error('La sélection IGDB a échoué.', error)
      setCandidateSelection({
        pendingId: null,
        error: 'La sélection a échoué. Vérifiez votre connexion puis réessayez ; la saisie manuelle reste possible.',
      })
    }
  }

  const selectTmdbSeriesCandidate = async (candidate: TmdbSearchCandidate) => {
    setCandidateSelection({ pendingId: candidate.tmdbId, error: null })
    try {
      const presentation = await previewTmdbSeries(candidate.tmdbId)
      setCandidateSelection({ pendingId: null, error: null })
      if (addFlow?.medium === 'série') {
        setAddFlow({
          medium: 'série',
          step: 'search',
          seriesLibrary: addFlow.seriesLibrary,
          initialValues: { ...seriesPresentationToInitialValues(presentation), category: addFlow.seriesLibrary === 'anime' ? 'animation' : 'série télé' },
          providerLink: { providerName: 'TMDB', providerId: String(presentation.tmdbId) },
        })
        return
      }
    } catch (error) {
      console.error('La sélection TMDB Séries a échoué.', error)
      setCandidateSelection({
        pendingId: null,
        error: 'La sélection a échoué. Vérifiez votre connexion puis réessayez ; la saisie manuelle reste possible.',
      })
    }
  }

  // Association directe depuis une fiche Série/Livre/Jeu : un clic sur un
  // résultat met à jour les champs éditoriaux de la fiche ouverte, sans
  // écran intermédiaire — même parcours que les films. Les données
  // personnelles (statut, note, coup de cœur, progression, avis, dates,
  // citations) ne sont jamais modifiées.
  const selectAssociateSeries = async (candidate: TmdbSearchCandidate) => {
    const target = associateTarget
    if (!target || target.medium !== 'série') return
    if (libraryState.status !== 'ready') return
    const profileId = libraryState.library.profile.id
    const series = seriesCollection.find((entry) => entry.id === target.id)
    if (!series) return
    setCandidateSelection({ pendingId: candidate.tmdbId, error: null })
    try {
      const presentation = await previewTmdbSeries(candidate.tmdbId)
      await mediaRepository.updateSeries(profileId, series.id, seriesWithPresentation(series, presentation), seriesLibraryForCategory(series.category))
      await mediaRepository.setMediaProviderLink({ profileId, medium: seriesLibraryForCategory(series.category), mediaId: series.id, providerName: 'TMDB', providerId: String(presentation.tmdbId) })
      const refreshed = await mediaRepository.getSeries(profileId, series.id, seriesLibraryForCategory(series.category))
      setSeriesCollection((current) => current.map((entry) => entry.id === series.id
        ? (refreshed ?? seriesWithPresentation(series, presentation))
        : entry))
      refreshLibraryQuery('série')
      setCandidateSelection({ pendingId: null, error: null })
      setAssociateTarget(null)
    } catch (error) {
      console.error('La sélection TMDB Séries a échoué.', error)
      setCandidateSelection({
        pendingId: null,
        error: 'La mise à jour a échoué. Vérifiez votre connexion puis réessayez.',
      })
    }
  }

  const selectAssociateBook = async (candidate: OpenLibraryBookCandidate) => {
    const target = associateTarget
    if (!target || target.medium !== 'livre') return
    if (libraryState.status !== 'ready') return
    const profileId = libraryState.library.profile.id
    const book = bookCollection.find((entry) => entry.id === target.id)
    if (!book) return
    setBookSelection({ pendingKey: candidate.workKey, error: null })
    try {
      const presentation = await previewOpenLibraryBook(candidate)
      await mediaRepository.updateBook(
        profileId,
        book.id,
        bookWithPresentation(book, {
          author: presentation.author,
          firstPublishYear: presentation.firstPublishYear,
          synopsis: presentation.synopsis,
          coverUrl: presentation.coverUrl,
        }),
        undefined,
        bookLibraryForCategory(book.category),
      )
      await mediaRepository.setMediaProviderLink({ profileId, medium: bookLibraryForCategory(book.category), mediaId: book.id, providerName: 'Open Library', providerId: presentation.workKey })
      const refreshed = await mediaRepository.getBook(profileId, book.id, bookLibraryForCategory(book.category))
      setBookCollection((current) => sortBooks(current.map((entry) => entry.id === book.id
        ? (refreshed ?? bookWithPresentation(book, presentation))
        : entry)))
      refreshLibraryQuery('livre')
      setBookSelection({ pendingKey: null, error: null })
      setAssociateTarget(null)
    } catch (error) {
      console.error('La sélection Open Library a échoué.', error)
      setBookSelection({
        pendingKey: null,
        error: 'La mise à jour a échoué. Vérifiez votre connexion puis réessayez.',
      })
    }
  }

  const selectAssociateGame = async (candidate: IgdbGameCandidate) => {
    const target = associateTarget
    if (!target || target.medium !== 'jeu') return
    if (libraryState.status !== 'ready') return
    const profileId = libraryState.library.profile.id
    const game = gameCollection.find((entry) => entry.id === target.id)
    if (!game) return
    setCandidateSelection({ pendingId: candidate.gameId, error: null })
    try {
      const presentation = await previewIgdbGame(candidate.gameId, candidate.title, candidate.releaseYear, candidate.coverUrl)
      await mediaRepository.updateGame(
        profileId,
        game.id,
        gameWithPresentation(game, {
          developer: presentation.developer,
          releaseYear: presentation.releaseYear,
          coverUrl: presentation.coverUrl,
        }),
      )
      await mediaRepository.setMediaProviderLink({ profileId, medium: 'games', mediaId: game.id, providerName: 'IGDB', providerId: String(presentation.gameId) })
      const refreshed = await mediaRepository.getGame(profileId, game.id)
      setGameCollection((current) => sortGames(current.map((entry) => entry.id === game.id
        ? (refreshed ?? gameWithPresentation(game, presentation))
        : entry)))
      refreshLibraryQuery('jeu')
      setCandidateSelection({ pendingId: null, error: null })
      setAssociateTarget(null)
    } catch (error) {
      console.error('La sélection IGDB a échoué.', error)
      setCandidateSelection({
        pendingId: null,
        error: 'La mise à jour a échoué. Vérifiez votre connexion puis réessayez.',
      })
    }
  }

  // Pop-up d'ajout : le fond ne défile plus tant que la fenêtre est ouverte.
  useEffect(() => {
    if (!addFlow) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [addFlow])

  // Pop-up d'association Série/Livre/Jeu : même verrou de défilement que l'ajout.
  useEffect(() => {
    if (!associateTarget) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [associateTarget])

  // Fiche disparue derrière la pop-up : on referme au lieu d'afficher un cadre vide.
  useEffect(() => {
    if (!associateTarget) return
    const exists =
      (associateTarget.medium === 'série' && seriesCollection.some((entry) => entry.id === associateTarget.id)) ||
      (associateTarget.medium === 'livre' && bookCollection.some((entry) => entry.id === associateTarget.id)) ||
      (associateTarget.medium === 'jeu' && gameCollection.some((entry) => entry.id === associateTarget.id))
    if (!exists) setAssociateTarget(null)
  }, [associateTarget, seriesCollection, bookCollection, gameCollection])

  if (libraryState.status === 'loading') {
    content = (
      <main className="main home-main">
        <header className="home-heading">
          <div><h1 className="display-title">{t('Accueil')}</h1></div>
        </header>
        <LoadingState />
      </main>
    )
  } else if (libraryState.status === 'error') {
    content = (
      <main className="main home-main">
        <header className="home-heading">
          <div><h1 className="display-title">{t('Accueil')}</h1></div>
        </header>
        <ErrorState
          onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
          recoveryProfile={profiles[0] ?? null}
          onRestored={() => setLoadAttempt((attempt) => attempt + 1)}
        />
      </main>
    )
  } else if (libraryState.status === 'no-profile') {
    content = (
      <main className="main home-main">
        <header className="home-heading">
          <div><h1 className="display-title">{t('Accueil')}</h1></div>
        </header>
      </main>
    )
  } else if (view.name === 'home') {
    content = (
      <Home
        library={libraryState.library}
        seriesCollection={seriesCollection}
        bookCollection={bookCollection}
        gameCollection={gameCollection}
        artworkCollection={artworkCollection}
        onOpen={(film) => leaveLibrary({ name: 'detail', filmId: film.id, returnTo: 'home' })}
        onOpenSeries={(series) => leaveLibrary({ name: 'series-detail', seriesId: series.id, returnTo: 'home' })}
        onOpenBook={(book) => leaveLibrary({ name: 'book-detail', bookId: book.id, returnTo: 'home' })}
        onOpenGame={(game) => leaveLibrary({ name: 'game-detail', gameId: game.id, returnTo: 'home' })}
        onOpenArtwork={(artwork) => leaveLibrary({ name: 'artwork-detail', artworkId: artwork.id, returnTo: 'home' })}
        resolveFilmPoster={resolveFilmDisplayPoster}
        resolveFilmContributor={resolveFilmDisplayDirector}
        scrollRef={homeScrollRef}
      />
    )
  } else if (view.name === 'tmdb-search') {
    content = (
      <TmdbSearchFlow
        film={associatingFilm}
        pendingCandidateId={candidateSelection.pendingId}
        selectionError={candidateSelection.error}
        onSelectCandidate={selectTmdbCandidate}
        onManual={() => setView({ name: 'create' })}
        onCancel={returnToLibrary}
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
              {t('← Retour aux films')}
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>{t('Ce film ne peut pas être associé.')}</h2>
            <p>{t("La fiche n'est plus présente dans la bibliothèque locale.")}</p>
          </div>
        </main>
      )
    } else {
      content = (
        <TmdbSearchFlow
          film={film}
          pendingCandidateId={candidateSelection.pendingId}
          selectionError={candidateSelection.error}
          onSelectCandidate={selectTmdbCandidate}
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
                message: t('Le film a bien été créé, mais TMDB n’a pas pu être associé. La fiche reste intacte ; tu peux relancer l’association depuis cette page.'),
              })
            }
          }
          setView({ name: 'detail', filmId: film.id, returnTo: 'library' })
          window.scrollTo({ top: 0 })
        }}
        asDialog
      />
    )
  } else if (view.name === 'settings') {
    const { library } = libraryState
    content = (
      <Portability
        section={settingsSection}
        library={library}
        profiles={profiles}
        themePreference={themePreference}
        onThemePreferenceChange={setThemePreference}
        onSwitchProfile={async (profileId) => {
          const selectedLibrary = await filmsRepository.selectProfile(profileId)
          setLibraryContext({ query: '', view: builtinViewById(RATED_BUILTIN_VIEWS, WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setSeriesContext({ query: '', category: seriesLibraryCategories('series'), view: builtinViewById(PROGRESS_BUILTIN_VIEWS, WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setAnimeContext({ query: '', category: seriesLibraryCategories('anime'), view: builtinViewById(PROGRESS_BUILTIN_VIEWS, WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setBookContext({ query: '', category: bookLibraryCategories('books'), view: builtinViewById(PROGRESS_BUILTIN_VIEWS, WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setMangaContext({ query: '', category: bookLibraryCategories('mangas'), view: builtinViewById(PROGRESS_BUILTIN_VIEWS, WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setGameContext({ query: '', platform: 'all', view: builtinViewById(RATED_BUILTIN_VIEWS, WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setArtworkContext({ query: '', form: 'all', view: builtinViewById(UNRATED_BUILTIN_VIEWS, ARTWORKS_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setLibraryState({ status: 'ready', library: selectedLibrary })
        }}
        onImported={(importedLibrary) => {
          setLibraryContext({ query: '', view: builtinViewById(RATED_BUILTIN_VIEWS, WATCHLIST_DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setLibraryState({ status: 'ready', library: importedLibrary })
          requestAutomaticBackup(importedLibrary)
          profilesRepository.list().then(setProfiles, (error: unknown) => {
            console.error('Impossible de rafraîchir la liste des profils.', error)
          })
        }}
        onBackupNotice={setBackupNotice}
        availableUpdate={availableUpdate}
        lastCheckedAt={appUpdate.lastCheckedAt}
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
        detailRevision={library.films.find((entry) => entry.id === view.filmId)?.updatedAt ?? ''}
        onBack={() => goBackTo(view.returnTo)}
        backLabel={view.returnTo === 'home' ? t('Retour à l’accueil') : t('Retour aux films')}
        onEdit={() => {
          const film = libraryState.library.films.find((entry) => entry.id === view.filmId)
          if (film) {
            // 0.6.18 : Modifier rouvre la pop-up du parcours d'ajout,
            // préremplie — plus de page pleine page.
            setAddFlow({ medium: 'film', step: 'search', initialValues: filmToFormValues(film), editFilmId: film.id })
          }
        }}
        onAssociateTmdb={() => {
          const film = libraryState.library.films.find((entry) => entry.id === view.filmId)
          if (film) {
            setTmdbNotice(null)
            setAssociatingFilm(film)
            setView({ name: 'tmdb-associate', filmId: view.filmId })
          }
        }}
        tmdbNotice={tmdbNotice?.filmId === view.filmId ? tmdbNotice.message : null}
        onPosterChange={async (url) => {
          const updatedAt = await filmsRepository.updateFilmPoster(library.profile.id, view.filmId, url)
          const updatedLibrary: FilmLibrary = {
            ...library,
            films: library.films.map((entry) => (entry.id === view.filmId ? { ...entry, posterUrl: url, updatedAt } : entry)),
          }
          setLibraryState({ status: 'ready', library: updatedLibrary })
          requestAutomaticBackup(updatedLibrary)
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
          goBackTo(view.returnTo)
        }}
      />
    )
  } else if (view.name === 'series' || view.name === 'anime') {
    const scope = view.name
    content = (
      <SeriesLibrary
        key={scope}
        library={scope}
        allSeries={seriesCollection}
        profileName={libraryState.library.profile.name}
        collection={seriesForLibrary(seriesCollection, scope)}
        context={scope === 'anime' ? animeContext : seriesContext}
        searchState={scope === 'anime' ? animeSearchState : seriesSearchState}
        onContextChange={scope === 'anime' ? setAnimeContext : setSeriesContext}
        onRetrySearch={() => setSeriesSearchAttempt((attempt) => attempt + 1)}
        onCreate={() => {
          setCandidateSelection({ pendingId: null, error: null })
          setAddFlow({ medium: 'série', step: 'search', seriesLibrary: scope })
        }}
        onOpen={(series) => leaveLibrary({ name: 'series-detail', seriesId: series.id, returnTo: scope })}
        profileId={libraryState.library.profile.id}
        onLibraryChanged={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    )
  } else if (view.name === 'series-detail') {
    const { library } = libraryState
    const series = seriesCollection.find((entry) => entry.id === view.seriesId)
    if (!series) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button back-button-icon" type="button" onClick={() => goBackTo(view.returnTo)} aria-label={seriesBackLabel(view.returnTo)}>
              {icon('arrow-left')}
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>{t('Cette série ne peut pas être ouverte.')}</h2>
            <p>{t('La fiche est absente ou SQLite n’a pas pu la relire.')}</p>
          </div>
        </main>
      )
    } else {
      content = (
        <SeriesDetail
          series={series}
          onBack={() => goBackTo(view.returnTo)}
          backLabel={seriesBackLabel(view.returnTo)}
          onEdit={async () => {
            const series = seriesCollection.find((entry) => entry.id === view.seriesId)
            if (series) {
              // 0.6.18 : Modifier rouvre la pop-up, préremplie.
              const providerLink = await mediaRepository.getMediaProviderLink(library.profile.id, seriesLibraryForCategory(series.category), series.id)
              setAddFlow({ medium: 'série', step: 'search', initialValues: seriesToFormValues(series), providerLink, editSeriesId: series.id, seriesLibrary: seriesLibraryForCategory(series.category) })
            }
          }}
          onAssociate={() => {
            setCandidateSelection({ pendingId: null, error: null })
            setAssociateTarget({ medium: 'série', id: view.seriesId })
          }}
          onPosterEdit={async (url: string | null) => {
            await mediaRepository.updateSeries(library.profile.id, series.id, { ...series, posterUrl: url }, seriesLibraryForCategory(series.category))
            setSeriesCollection((current) => current.map((entry) => (entry.id === series.id ? { ...series, posterUrl: url } : entry)))
            refreshLibraryQuery('série')
          }}
          onDelete={async () => {
            await mediaRepository.deleteSeries(library.profile.id, view.seriesId, seriesLibraryForCategory(series.category))
            setSeriesCollection((current) => current.filter((entry) => entry.id !== view.seriesId))
            setSeriesSearchAttempt((attempt) => attempt + 1)
            requestAutomaticBackup(library)
            goBackTo(view.returnTo)
          }}
        />
      )
    }
  } else if (view.name === 'books' || view.name === 'mangas') {
    const scope = view.name
    content = (
      <BooksLibrary
        key={scope}
        library={scope}
        allBooks={bookCollection}
        profileName={libraryState.library.profile.name}
        collection={booksForLibrary(bookCollection, scope)}
        context={scope === 'mangas' ? mangaContext : bookContext}
        searchState={scope === 'mangas' ? mangaSearchState : bookSearchState}
        onContextChange={scope === 'mangas' ? setMangaContext : setBookContext}
        onRetrySearch={() => setBookSearchAttempt((attempt) => attempt + 1)}
        onCreate={() => {
          setBookSelection({ pendingKey: null, error: null })
          setAddFlow({ medium: 'livre', step: 'search', bookLibrary: scope })
        }}
        onOpen={(book) => leaveLibrary({ name: 'book-detail', bookId: book.id, returnTo: scope })}
        profileId={libraryState.library.profile.id}
        onLibraryChanged={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    )
  } else if (view.name === 'book-detail') {
    const { library } = libraryState
    const book = bookCollection.find((entry) => entry.id === view.bookId)
    if (!book) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button back-button-icon" type="button" onClick={() => goBackTo(view.returnTo)} aria-label={bookBackLabel(view.returnTo)}>
              {icon('arrow-left')}
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>{t('Ce livre ne peut pas être ouvert.')}</h2>
            <p>{t('La fiche est absente ou SQLite n’a pas pu la relire.')}</p>
          </div>
        </main>
      )
    } else {
      content = (
        <BookDetail
          book={book}
          onBack={() => goBackTo(view.returnTo)}
          backLabel={bookBackLabel(view.returnTo)}
          onEdit={async (options) => {
            const book = bookCollection.find((entry) => entry.id === view.bookId)
            if (book) {
              // 0.6.18 : Modifier rouvre la pop-up, préremplie.
              const providerLink = await mediaRepository.getMediaProviderLink(library.profile.id, bookLibraryForCategory(book.category), book.id)
              setAddFlow({ medium: 'livre', step: 'search', initialValues: bookToFormValues(book), providerLink, editBookId: book.id, bookLibrary: bookLibraryForCategory(book.category), quoteDraft: options?.addQuote === true })
            }
          }}
          onAssociate={() => {
            setBookSelection({ pendingKey: null, error: null })
            setAssociateTarget({ medium: 'livre', id: view.bookId })
          }}
          onCoverEdit={async (url: string | null) => {
            await mediaRepository.updateBook(library.profile.id, book.id, { ...book, coverUrl: url }, undefined, bookLibraryForCategory(book.category))
            setBookCollection((current) => current.map((entry) => (entry.id === book.id ? { ...book, coverUrl: url } : entry)))
            refreshLibraryQuery('livre')
          }}
          onDelete={async () => {
            await mediaRepository.deleteBook(library.profile.id, view.bookId, bookLibraryForCategory(book.category))
            setBookCollection((current) => current.filter((entry) => entry.id !== view.bookId))
            setBookSearchAttempt((attempt) => attempt + 1)
            requestAutomaticBackup(library)
            goBackTo(view.returnTo)
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
        onCreate={() => {
          setCandidateSelection({ pendingId: null, error: null })
          setAddFlow({ medium: 'jeu', step: 'search' })
        }}
        onOpen={(game) => leaveLibrary({ name: 'game-detail', gameId: game.id, returnTo: 'games' })}
        profileId={libraryState.library.profile.id}
        onLibraryChanged={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    )
  } else if (view.name === 'game-detail') {
    const { library } = libraryState
    const game = gameCollection.find((entry) => entry.id === view.gameId)
    if (!game) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button back-button-icon" type="button" onClick={() => goBackTo(view.returnTo)} aria-label={t('Retour aux jeux')}>
              {icon('arrow-left')}
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>{t('Ce jeu ne peut pas être ouvert.')}</h2>
            <p>{t('La fiche est absente ou SQLite n’a pas pu la relire.')}</p>
          </div>
        </main>
      )
    } else {
      content = (
        <GameDetail
          game={game}
          onBack={() => goBackTo(view.returnTo)}
          backLabel={t('Retour aux jeux')}
          onEdit={async () => {
            const game = gameCollection.find((entry) => entry.id === view.gameId)
            if (game) {
              // 0.6.18 : Modifier rouvre la pop-up, préremplie.
              const providerLink = await mediaRepository.getMediaProviderLink(library.profile.id, 'games', game.id)
              setAddFlow({ medium: 'jeu', step: 'search', initialValues: gameToFormValues(game), providerLink, editGameId: game.id })
            }
          }}
          onAssociate={() => {
            setCandidateSelection({ pendingId: null, error: null })
            setAssociateTarget({ medium: 'jeu', id: view.gameId })
          }}
          onCoverEdit={async (url: string | null) => {
            await mediaRepository.updateGame(library.profile.id, game.id, { ...game, coverUrl: url })
            setGameCollection((current) => current.map((entry) => (entry.id === game.id ? { ...game, coverUrl: url } : entry)))
            refreshLibraryQuery('jeu')
          }}
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
  } else if (view.name === 'custom' && libraryState.status === 'ready') {
    const library = libraryState.library
    const libraryId = view.libraryId
    content = (
      <CustomLibraryScreen
        key={`${library.profile.id}-${libraryId}`}
        libraryId={libraryId}
        profileId={library.profile.id}
        profileName={library.profile.name}
        entryId={view.entryId}
        onOpenEntry={(entryId) => leaveLibrary({ name: 'custom', libraryId, entryId })}
        onChanged={() => {
          setCustomLibrariesRevision((revision) => revision + 1)
          requestAutomaticBackup(library)
        }}
        onRemoved={() => {
          setCustomLibrariesRevision((revision) => revision + 1)
          requestAutomaticBackup(library)
          leaveLibrary({ name: 'home' })
        }}
      />
    )
  } else if (view.name === 'artworks') {
    content = (
      <ArtworksLibrary
        profileName={libraryState.library.profile.name}
        collection={artworkCollection}
        context={artworkContext}
        searchState={artworkSearchState}
        onContextChange={setArtworkContext}
        onRetrySearch={() => setArtworkSearchAttempt((attempt) => attempt + 1)}
        onCreate={() => setAddFlow({ medium: 'artwork', step: 'form' })}
        onOpen={(artwork) => leaveLibrary({ name: 'artwork-detail', artworkId: artwork.id, returnTo: 'artworks' })}
        profileId={libraryState.library.profile.id}
        onLibraryChanged={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    )
  } else if (view.name === 'artwork-detail') {
    const { library } = libraryState
    const artwork = artworkCollection.find((entry) => entry.id === view.artworkId)
    if (!artwork) {
      content = (
        <main className="main detail-page-main">
          <header className="page-action-bar">
            <button className="back-button back-button-icon" type="button" onClick={() => goBackTo(view.returnTo)} aria-label={t('Retour aux œuvres d’art')}>
              {icon('arrow-left')}
            </button>
          </header>
          <div className="library-state error-state" role="alert">
            <h2>{t('Cette œuvre ne peut pas être ouverte.')}</h2>
            <p>{t('La fiche est absente ou SQLite n’a pas pu la relire.')}</p>
          </div>
        </main>
      )
    } else {
      content = (
        <ArtworkDetail
          artwork={artwork}
          onBack={() => goBackTo(view.returnTo)}
          backLabel={t('Retour aux œuvres d’art')}
          onEdit={() => {
            const artwork = artworkCollection.find((entry) => entry.id === view.artworkId)
            if (artwork) {
              // 0.6.18 : Modifier rouvre la pop-up, préremplie.
              setAddFlow({ medium: 'artwork', step: 'form', editArtworkId: artwork.id })
            }
          }}
          onImageEdit={async (url: string | null) => {
            await mediaRepository.updateArtwork(library.profile.id, artwork.id, { ...artwork, imageUrl: url })
            setArtworkCollection((current) => current.map((entry) => (entry.id === artwork.id ? { ...artwork, imageUrl: url } : entry)))
            refreshLibraryQuery('artwork')
          }}
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
  } else {
    content = (
      <FilmsLibrary
        library={libraryState.library}
        context={libraryContext}
        searchState={searchState}
        onContextChange={setLibraryContext}
        onRetrySearch={() => setSearchAttempt((attempt) => attempt + 1)}
        onCreate={() => setAddFlow({ medium: 'film', step: 'search' })}
        onOpen={(film) => leaveLibrary({ name: 'detail', filmId: film.id, returnTo: 'library' })}
        onLibraryChanged={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    )
  }

  return (
    <div className={`app ${view.name === 'settings' ? 'app-settings' : ''}`}>
        <MobileAppShell
          activeItem={
            libraryState.status !== 'ready' || view.name === 'home' || view.name === 'custom'
              ? 'home'
              : view.name === 'settings'
                ? 'settings'
                : view.name === 'series' || view.name === 'anime' || view.name === 'series-detail'
                  ? activeSeriesLibrary
                  : view.name === 'books' || view.name === 'mangas' || view.name === 'book-detail'
                    ? activeBookLibrary
                    : view.name === 'games' || view.name === 'game-detail'
                      ? 'games'
                      : view.name === 'artworks' || view.name === 'artwork-detail'
                        ? 'artworks'
                        : 'library'
          }
          onHome={() => leaveLibrary({ name: 'home' })}
          onLibrary={returnToLibrary}
          onSeries={() => leaveLibrary({ name: 'series' })}
          onAnime={() => leaveLibrary({ name: 'anime' })}
          onBooks={() => leaveLibrary({ name: 'books' })}
          onMangas={() => leaveLibrary({ name: 'mangas' })}
          onGames={() => leaveLibrary({ name: 'games' })}
          onArtworks={() => leaveLibrary({ name: 'artworks' })}
          onSettings={() => showSettingsSection('profiles')}
          currentProfileName={libraryState.status === 'ready' ? libraryState.library.profile.name : null}
          currentProfileAvatar={libraryState.status === 'ready'
            ? profiles.find((profile) => profile.id === libraryState.library.profile.id)?.avatarDataUrl ?? null
            : null}
        />
        <Sidebar
        expanded={sidebarExpanded}
        onToggleExpanded={() => setSidebarExpanded((value) => !value)}
        count={count}
        seriesCount={seriesCount}
        animeCount={animeCount}
        bookCount={bookCount}
        mangaCount={mangaCount}
        gameCount={gameCount}
        artworkCount={artworkCount}
        customLibraries={libraryState.status === 'ready' ? customLibraries : []}
        activeCustomLibrary={view.name === 'custom' ? view.libraryId : null}
        onCustomLibrary={(libraryId) => leaveLibrary({ name: 'custom', libraryId, entryId: null })}
        onAddLibrary={libraryState.status === 'ready' ? () => setAddLibraryOpen(true) : null}
        currentProfileName={libraryState.status === 'ready' ? libraryState.library.profile.name : null}
        currentProfileAvatar={libraryState.status === 'ready'
          ? profiles.find((profile) => profile.id === libraryState.library.profile.id)?.avatarDataUrl ?? null
          : null}
        activeItem={
          libraryState.status !== 'ready' || view.name === 'home'
            ? 'home'
            : view.name === 'settings'
              ? 'settings'
              : view.name === 'custom'
                ? 'custom'
                : view.name === 'series' || view.name === 'anime' || view.name === 'series-detail'
                ? activeSeriesLibrary
                : view.name === 'books' || view.name === 'mangas' || view.name === 'book-detail'
                  ? activeBookLibrary
                  : view.name === 'games' || view.name === 'game-detail'
                    ? 'games'
                    : view.name === 'artworks' || view.name === 'artwork-detail'
                      ? 'artworks'
                      : 'library'
        }
        onHome={() => leaveLibrary({ name: 'home' })}
        onLibrary={returnToLibrary}
        onSeries={() => leaveLibrary({ name: 'series' })}
        onAnime={() => leaveLibrary({ name: 'anime' })}
        onBooks={() => leaveLibrary({ name: 'books' })}
        onMangas={() => leaveLibrary({ name: 'mangas' })}
        onGames={() => leaveLibrary({ name: 'games' })}
        onArtworks={() => leaveLibrary({ name: 'artworks' })}
        onSettings={() => showSettingsSection('profiles')}
        settingsSection={settingsSection}
        onSettingsSection={showSettingsSection}
        onReturnToLibrary={returnToLibrary}
      />
      {content}
      {addLibraryOpen && libraryState.status === 'ready' && (
        <AddLibraryDialog
          enabled={customLibraries.map((library) => library.libraryId)}
          onClose={() => setAddLibraryOpen(false)}
          onAdd={async (libraryId) => {
            const library = libraryState.library
            await customLibraryRepository.enable(library.profile.id, libraryId)
            setAddLibraryOpen(false)
            setCustomLibrariesRevision((revision) => revision + 1)
            requestAutomaticBackup(library)
            leaveLibrary({ name: 'custom', libraryId, entryId: null })
          }}
        />
      )}
      {libraryState.status === 'no-profile' && (
        <div className="onboarding-backdrop" role="presentation">
          <Onboarding
            themePreference={themePreference}
            onThemePreferenceChange={setThemePreference}
            onProfileReady={(destination = 'home') => {
              if (destination === 'transfer') {
                setSettingsSection('transfer')
                setView({ name: 'settings' })
              } else {
                setView({ name: 'home' })
              }
              setLoadAttempt((attempt) => attempt + 1)
            }}
          />
        </div>
      )}
      {addFlow && libraryState.status === 'ready' && (
        <div className="dialog-backdrop-blur" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setAddFlow(null) }}>
          <FocusDialog
            className="editor-dialog dialog-add-flow"
            onClose={() => setAddFlow(null)}
            role="dialog"
            aria-modal="true"
            aria-label={{
              film: t('Ajouter un film'),
              série: addFlow.medium === 'série' && addFlow.editSeriesId ? t('Modifier la fiche') : addFlow.medium === 'série' && addFlow.seriesLibrary === 'anime' ? t('Ajouter un animé') : t('Ajouter une série'),
              livre: addFlow.medium === 'livre' && addFlow.editBookId ? t('Modifier la fiche') : addFlow.medium === 'livre' && addFlow.bookLibrary === 'mangas' ? t('Ajouter un manga') : t('Ajouter un livre'),
              jeu: t('Ajouter un jeu'),
              artwork: t('Ajouter une œuvre'),
            }[addFlow.medium]}
          >
            <button className="poster-dialog-close editor-dialog-close" type="button" onClick={() => setAddFlow(null)} aria-label={t('Fermer')}>×</button>
            {addFlow.medium === 'film' && !addFlow.initialValues && (
              <TmdbSearchFlow
                compact
                film={null}
                pendingCandidateId={candidateSelection.pendingId}
                selectionError={candidateSelection.error}
                onSelectCandidate={selectTmdbCandidate}
                onManual={() => setAddFlow({ medium: 'film', step: 'search', initialValues: {} as never })}
                onCancel={() => setAddFlow(null)}
              />
            )}
            {addFlow.medium === 'film' && addFlow.initialValues && (() => {
              const editFilmId = addFlow.editFilmId
              return (
                <FilmForm
                  embeddedInDialog
                  film={editFilmId ? libraryState.library.films.find((entry) => entry.id === editFilmId) : undefined}
                  fetchTmdbCache={editFilmId ? getFilmTmdbCache : undefined}
                  initialValues={addFlow.initialValues}
                  provenance={addFlow.provenance ?? null}
                  tmdbPresentation={addFlow.tmdbPresentation ?? null}
                  asDialog={false}
                  onCancel={() => setAddFlow(null)}
                  onSave={async (input, provenance) => {
                    const library = libraryState.library
                    if (editFilmId) {
                      await filmsRepository.updateFilm(library.profile.id, editFilmId, input)
                      const refreshedFilm = await filmsRepository.getFilm(library.profile.id, editFilmId)
                      if (!refreshedFilm) throw new Error('Le film modifié n’a pas pu être relu depuis SQLite.')
                      const updatedLibrary: FilmLibrary = { ...library, films: sortFilms(library.films.map((entry) => entry.id === editFilmId ? refreshedFilm : entry)) }
                      setLibraryState({ status: 'ready', library: updatedLibrary })
                      requestAutomaticBackup(updatedLibrary)
                      setAddFlow(null)
                      leaveLibrary({ name: 'detail', filmId: editFilmId, returnTo: 'library' })
                      window.scrollTo({ top: 0 })
                      return
                    }
                    const film = await filmsRepository.createFilm(library.profile.id, input, provenance)
                    const updatedLibrary: FilmLibrary = { ...library, films: sortFilms([...library.films, film]) }
                    setLibraryState({ status: 'ready', library: updatedLibrary })
                    requestAutomaticBackup(updatedLibrary)
                    setTmdbNotice(null)
                    if (provenance) {
                      try {
                        await associateFilmWithTmdb(film.id, Number(provenance.providerId))
                      } catch (error) {
                        console.error('Le film a été créé mais son association TMDB a échoué.', error)
                      }
                    }
                    setAddFlow(null)
                    leaveLibrary({ name: 'detail', filmId: film.id, returnTo: 'library' })
                    window.scrollTo({ top: 0 })
                  }}
                />
              )
            })()}
            {addFlow.medium === 'série' && !addFlow.initialValues && (
              <SeriesTmdbSearchFlow
                compact
                mediumLabel={addFlow.seriesLibrary === 'anime' ? 'animation japonaise' : 'série'}
                pendingCandidateId={candidateSelection.pendingId}
                selectionError={candidateSelection.error}
                onSelectCandidate={selectTmdbSeriesCandidate}
                onManual={() => setAddFlow({ ...addFlow, initialValues: {} as never })}
                onCancel={() => setAddFlow(null)}
              />
            )}
            {addFlow.medium === 'série' && addFlow.initialValues && (() => {
              // Saisie assistée (préremplie TMDB) ou manuelle (objet vide),
              // ou édition d'une fiche existante (editSeriesId présent).
              const initialValues = addFlow.initialValues as SeriesFormValues
              const editSeriesId = addFlow.editSeriesId
              return (
                <SeriesForm
                  embeddedInDialog
                  series={editSeriesId ? seriesCollection.find((entry) => entry.id === editSeriesId) : undefined}
                  creationCategory={editSeriesId ? undefined : addFlow.seriesLibrary === 'anime' ? 'animation' : 'série télé'}
                  initialValues={initialValues}
                  providerLink={addFlow.providerLink ?? null}
                  onCancel={() => setAddFlow(null)}
                  onSave={async (input: SeriesWriteInput) => {
                    const library = libraryState.library
                    const seriesLibrary = addFlow.seriesLibrary ?? 'series'
                    let targetId = editSeriesId
                    if (editSeriesId) {
                      // La fiche peut changer de bibliothèque : le repository la
                      // déplace alors de table, et on la relit dans la table cible.
                      const targetLibrary = seriesLibraryForCategory(input.category)
                      await mediaRepository.updateSeries(library.profile.id, editSeriesId, input, seriesLibrary)
                      const refreshed = await mediaRepository.getSeries(library.profile.id, editSeriesId, targetLibrary)
                      if (!refreshed) throw new Error('La série enregistrée ne peut pas être relue depuis SQLite.')
                      setSeriesCollection((current) => current.map((entry) => entry.id === editSeriesId ? refreshed : entry))
                    } else {
                      const series = await mediaRepository.createSeries(library.profile.id, input, seriesLibrary)
                      targetId = series.id
                      if (addFlow.providerLink) {
                        await mediaRepository.setMediaProviderLink({
                          profileId: library.profile.id,
                          medium: seriesLibrary,
                          mediaId: series.id,
                          ...addFlow.providerLink,
                        })
                      }
                      setSeriesCollection((current) => [...current, series])
                    }
                    setSeriesSearchAttempt((attempt) => attempt + 1)
                    requestAutomaticBackup(library)
                    setAddFlow(null)
                    const returnTo = editSeriesId && view.name === 'series-detail' && view.returnTo === 'home'
                      ? 'home' : seriesLibraryForCategory(input.category)
                    leaveLibrary({ name: 'series-detail', seriesId: targetId!, returnTo })
                    window.scrollTo({ top: 0 })
                  }}
                />
              )
            })()}
            {addFlow.medium === 'livre' && !addFlow.initialValues && (
              <BookOpenLibrarySearchFlow
                compact
                mediumLabel={addFlow.bookLibrary === 'mangas' ? 'manga' : 'livre'}
                pendingCandidateKey={bookSelection.pendingKey}
                selectionError={bookSelection.error}
                onSelectCandidate={selectOpenLibraryBookCandidate}
                onManual={() => setAddFlow({ ...addFlow, initialValues: {} as never })}
                onCancel={() => setAddFlow(null)}
              />
            )}
            {addFlow.medium === 'livre' && addFlow.initialValues && (() => {
              const initialValues = addFlow.initialValues as BookFormValues
              const editBookId = addFlow.editBookId
              return (
                <BookForm
                  embeddedInDialog
                  book={editBookId ? bookCollection.find((entry) => entry.id === editBookId) : undefined}
                  creationCategory={editBookId ? undefined : addFlow.bookLibrary === 'mangas' ? 'manga' : 'livre'}
                  initialValues={initialValues}
                  providerLink={addFlow.providerLink ?? null}
                  initialQuoteDraft={addFlow.quoteDraft === true}
                  onCancel={() => setAddFlow(null)}
                  onSave={async (input: BookWriteInput) => {
                    const library = libraryState.library
                    const { quotes, ...bookInput } = input
                    let targetId = editBookId
                    if (editBookId) {
                      await mediaRepository.updateBook(library.profile.id, editBookId, bookInput, quotes, addFlow.bookLibrary ?? 'books')
                      const refreshed = await mediaRepository.getBook(library.profile.id, editBookId, bookLibraryForCategory(input.category))
                      if (!refreshed) throw new Error('Le livre enregistré ne peut pas être relu depuis SQLite.')
                      setBookCollection((current) => sortBooks(current.map((entry) => entry.id === editBookId ? refreshed : entry)))
                    } else {
                      const book = await mediaRepository.createBook(library.profile.id, bookInput, quotes, addFlow.bookLibrary ?? 'books')
                      targetId = book.id
                      if (addFlow.providerLink) {
                        await mediaRepository.setMediaProviderLink({
                          profileId: library.profile.id,
                          medium: bookLibraryForCategory(input.category),
                          mediaId: book.id,
                          ...addFlow.providerLink,
                        })
                      }
                      setBookCollection((current) => sortBooks([...current, book]))
                    }
                    setBookSearchAttempt((attempt) => attempt + 1)
                    requestAutomaticBackup(library)
                    setAddFlow(null)
                    const returnTo = editBookId && view.name === 'book-detail' && view.returnTo === 'home'
                      ? 'home' : bookLibraryForCategory(input.category)
                    leaveLibrary({ name: 'book-detail', bookId: targetId!, returnTo })
                    window.scrollTo({ top: 0 })
                  }}
                />
              )
            })()}
            {addFlow.medium === 'jeu' && !addFlow.initialValues && (
              <GameIgdbSearchFlow
                compact
                pendingCandidateId={candidateSelection.pendingId}
                selectionError={candidateSelection.error}
                onSelectCandidate={selectIgdbGameCandidate}
                onManual={() => setAddFlow({ medium: 'jeu', step: 'search', initialValues: {} as never })}
                onCancel={() => setAddFlow(null)}
              />
            )}
            {addFlow.medium === 'jeu' && addFlow.initialValues && (() => {
              const initialValues = addFlow.initialValues as GameFormValues
              const editGameId = addFlow.editGameId
              return (
                <GameForm
                  embeddedInDialog
                  game={editGameId ? gameCollection.find((entry) => entry.id === editGameId) : undefined}
                  initialValues={initialValues}
                  providerLink={addFlow.providerLink ?? null}
                  platformSuggestions={buildGamePlatformSuggestions(gameCollection)}
                  onCancel={() => setAddFlow(null)}
                  onSave={async (input: GameWriteInput) => {
                    const library = libraryState.library
                    let targetId = editGameId
                    if (editGameId) {
                      await mediaRepository.updateGame(library.profile.id, editGameId, input)
                      const refreshed = await mediaRepository.getGame(library.profile.id, editGameId)
                      if (!refreshed) throw new Error('Le jeu enregistré ne peut pas être relu depuis SQLite.')
                      setGameCollection((current) => sortGames(current.map((entry) => entry.id === editGameId ? refreshed : entry)))
                    } else {
                      const game = await mediaRepository.createGame(library.profile.id, input)
                      targetId = game.id
                      if (addFlow.providerLink) {
                        await mediaRepository.setMediaProviderLink({
                          profileId: library.profile.id,
                          medium: 'games',
                          mediaId: game.id,
                          ...addFlow.providerLink,
                        })
                      }
                      setGameCollection((current) => sortGames([...current, game]))
                    }
                    setGameSearchAttempt((attempt) => attempt + 1)
                    requestAutomaticBackup(library)
                    setAddFlow(null)
                    leaveLibrary({ name: 'game-detail', gameId: targetId!, returnTo: 'games' })
                    window.scrollTo({ top: 0 })
                  }}
                />
              )
            })()}
            {/* L'Art n'a aucun fournisseur par règle du domaine : la pop-up
                s'ouvre directement sur le formulaire, même gabarit. */}
            {addFlow.medium === 'artwork' && (() => {
              const editArtworkId = addFlow.editArtworkId
              return (
                <ArtworkForm
                  embeddedInDialog
                  artwork={editArtworkId ? artworkCollection.find((entry) => entry.id === editArtworkId) : undefined}
                  onCancel={() => setAddFlow(null)}
                  onSave={async (input: ArtworkWriteInput) => {
                    const library = libraryState.library
                    // La fiche ouverte après l’enregistrement est celle de l’œuvre
                    // modifiée ou tout juste créée, comme pour les autres médiums.
                    let targetId: string
                    if (editArtworkId) {
                      await mediaRepository.updateArtwork(library.profile.id, editArtworkId, input)
                      const refreshed = await mediaRepository.getArtwork(library.profile.id, editArtworkId)
                      if (!refreshed) throw new Error('L’œuvre enregistrée ne peut pas être relue depuis SQLite.')
                      setArtworkCollection((current) => sortArtworks(current.map((entry) => entry.id === editArtworkId ? refreshed : entry)))
                      targetId = editArtworkId
                    } else {
                      const artwork = await mediaRepository.createArtwork(library.profile.id, input)
                      setArtworkCollection((current) => sortArtworks([...current, artwork]))
                      targetId = artwork.id
                    }
                    setArtworkSearchAttempt((attempt) => attempt + 1)
                    requestAutomaticBackup(library)
                    setAddFlow(null)
                    leaveLibrary({ name: 'artwork-detail', artworkId: targetId, returnTo: 'artworks' })
                    window.scrollTo({ top: 0 })
                  }}
                />
              )
            })()}
          </FocusDialog>
        </div>
      )}
      {associateTarget && libraryState.status === 'ready' && (
        <div className="dialog-backdrop-blur" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setAssociateTarget(null) }}>
          <FocusDialog
            className="editor-dialog dialog-associate"
            onClose={() => setAssociateTarget(null)}
            role="dialog"
            aria-modal="true"
            aria-label={t('Modifier l’association')}
          >
            <button className="poster-dialog-close editor-dialog-close" type="button" onClick={() => setAssociateTarget(null)} aria-label={t('Fermer')}>×</button>
            {(() => {
              const target = associateTarget
              const series = target.medium === 'série' ? seriesCollection.find((entry) => entry.id === target.id) : undefined
              const book = target.medium === 'livre' ? bookCollection.find((entry) => entry.id === target.id) : undefined
              const game = target.medium === 'jeu' ? gameCollection.find((entry) => entry.id === target.id) : undefined
              if (target.medium === 'série' && series) {
                return (
                  <SeriesTmdbSearchFlow
                    compact
                    existing={{ title: series.title, posterUrl: series.posterUrl }}
                    pendingCandidateId={candidateSelection.pendingId}
                    selectionError={candidateSelection.error}
                    onSelectCandidate={selectAssociateSeries}
                    onManual={() => setAssociateTarget(null)}
                    onCancel={() => setAssociateTarget(null)}
                  />
                )
              }
              if (target.medium === 'livre' && book) {
                return (
                  <BookOpenLibrarySearchFlow
                    compact
                    existing={{ title: book.title, coverUrl: book.coverUrl }}
                    pendingCandidateKey={bookSelection.pendingKey}
                    selectionError={bookSelection.error}
                    onSelectCandidate={selectAssociateBook}
                    onManual={() => setAssociateTarget(null)}
                    onCancel={() => setAssociateTarget(null)}
                  />
                )
              }
              if (target.medium === 'jeu' && game) {
                return (
                  <GameIgdbSearchFlow
                    compact
                    existing={{ title: game.title, coverUrl: game.coverUrl }}
                    pendingCandidateId={candidateSelection.pendingId}
                    selectionError={candidateSelection.error}
                    onSelectCandidate={selectAssociateGame}
                    onManual={() => setAssociateTarget(null)}
                    onCancel={() => setAssociateTarget(null)}
                  />
                )
              }
              return null
            })()}
          </FocusDialog>
        </div>
      )}
      {/* Proposition du récapitulatif : une seule fois par année, après la première peinture, et
          seulement pour un profil chargé. La fenêtre s'ouvre par-dessus l'accueil ; les annonces de
          la pile gardent leur coin. */}
      {libraryState.status === 'ready' && (
        <YearRecapOffer key={libraryState.library.profile.id} profileId={libraryState.library.profile.id} />
      )}
      <div className="notice-stack">
        {appUpdate.update && (
          <UpdateNotice
            update={appUpdate.update}
            installing={appUpdate.installing}
            ignoring={appUpdate.ignoring}
            error={appUpdate.error}
            onInstall={appUpdate.install}
            onLater={appUpdate.later}
            onIgnore={appUpdate.ignore}
          />
        )}
        {backupNotice && (
          <div className={`backup-notice ${backupNotice.kind}`} role={backupNotice.kind === 'error' ? 'alert' : 'status'} aria-atomic="true">
            <p>{backupNotice.message}</p>
            <button type="button" onClick={() => setBackupNotice(null)} aria-label={t('Fermer le message de sauvegarde')}>{t('Fermer')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

// Garde anti-double-montage (bug « boutons dupliqués ») : un HMR invalidé
// ré-exécute ce module sur le conteneur déjà monté. On réutilise la racine
// React existante au lieu d'en créer une deuxième par-dessus.
const rootElement = document.getElementById('root')!
const existingRoot = (rootElement as unknown as { __reactRoot?: ReturnType<typeof createRoot> }).__reactRoot
const root = existingRoot ?? createRoot(rootElement)
;(rootElement as unknown as { __reactRoot?: ReturnType<typeof createRoot> }).__reactRoot = root
// Les liens https s'ouvrent dans le navigateur du système (rien ne se passait en natif).
installExternalLinks()
root.render(<AppErrorBoundary><App /></AppErrorBoundary>)
