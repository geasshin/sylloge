import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AccessibleDialog } from './components/AccessibleDialog.tsx'
import { ImportHint } from './components/ImportHint.tsx'
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
import { SeriesTmdbSearchFlow } from './components/SeriesTmdbSearchFlow.tsx'
import { BookOpenLibrarySearchFlow } from './components/BookOpenLibrarySearchFlow.tsx'
import { GameIgdbSearchFlow } from './components/GameIgdbSearchFlow.tsx'
import { TmdbSearchFlow } from './components/TmdbSearchFlow.tsx'
import { LibraryExportFlow } from './components/LibraryExportFlow.tsx'
import { updaterPreferencesService } from './data/updaterPreferences.ts'
import { tauriUpdaterService, type AvailableUpdate } from './data/updaterService.ts'
import { backupService, type BackupNotice } from './data/backupService.ts'
import { filmsRepository, type FilmLibrary } from './data/filmsRepository.ts'
import { libraryRepository } from './data/libraryRepository.ts'
import { profilesRepository, type ProfileSummary } from './data/profilesRepository.ts'
import { pickImportJson } from './data/nativePortability.ts'
import {
  mediaRepository,
  type ArtworkSearchCriteria,
  type BookSearchCriteria,
  type GameSearchCriteria,
  type MediaProviderReference,
  type SeriesSearchCriteria,
} from './data/mediaRepository.ts'
import { LibraryImportButton } from './components/LibraryImportButton.tsx'
import { ProfileAvatar, ProfileAvatarPicker } from './components/ProfileAvatar.tsx'
import { LibraryViewBar, type LibraryFilterConfig } from './components/LibraryViewBar.tsx'
import { BookCategorySwitch, SeriesCategorySwitch } from './components/CategorySwitch.tsx'

import type { TmdbSearchCandidate, CachedFilmTmdbPresentation, TmdbFilmPresentation } from './data/tmdbService.ts'
import { setFilmTmdbPoster, associateFilmWithTmdb, getFilmTmdbCache, previewTmdbFilm, previewTmdbSeries, searchTmdbSeries } from './data/tmdbService.ts'
import { previewOpenLibraryBook, searchOpenLibraryBooks, type OpenLibraryBookCandidate } from './data/openLibraryService.ts'
import { previewIgdbGame, searchIgdbGames, type IgdbGameCandidate } from './data/igdbService.ts'
import { autoAssociateFilms } from './domain/autoAssociate.ts'
import { MATCH_THRESHOLD, REQUEST_DELAY_MS, delay, scoreNamedCandidate, seriesWithPresentation, bookWithPresentation, gameWithPresentation } from './domain/autoAssociateMedia.ts'
import { useTheme, type ThemePreference } from './domain/theme.ts'
import { validateLibraryDocument, type SyllogeLibraryDocument } from './domain/libraryDocument.ts'
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
  DEFAULT_VIEW_ID,
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
  SERIES_CATEGORIES,
  SERIES_CATEGORY_LABELS,
  SERIES_STATUS_LABELS,
  SERIES_STATUSES,
  type Series,
  type SeriesCategory,
} from './domain/series.ts'
import type { SeriesFormValues, SeriesWriteInput } from './domain/seriesForm.ts'
import { seriesPresentationToInitialValues } from './domain/seriesMetadataAssistance.ts'
import {
  BOOK_CATEGORIES,
  BOOK_CATEGORY_LABELS,
  BOOK_STATUS_LABELS,
  BOOK_STATUSES,
  type Book,
  type BookCategory,
} from './domain/book.ts'
import type { BookFormValues, BookWriteInput } from './domain/bookForm.ts'
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
import logoSylloge from './assets/logo-sylloge.png'
import {
  SearchIcon,
  HomeIcon,
  FilmIcon,
  SeriesIcon,
  BookIcon,
  GameIcon,
  ArtIcon,
  SettingsIcon,
  RefreshIcon,
  WandIcon,
  PencilIcon,
  TrashIcon,
  PanelIcon,
  UnlinkIcon,
} from './components/icons.tsx'
import './styles.css'

type IconName = 'art' | 'book' | 'film' | 'game' | 'home' | 'refresh' | 'search' | 'series' | 'settings' | 'wand' | 'pencil' | 'trash' | 'panel' | 'unlink'
export type { IconName }
type SettingsSection = PortabilitySection

/** Fabrique d'icônes SVG partagée par tous les composants de l'app. */
export function icon(name: IconName) {
  switch (name) {
    case 'home':
      return <HomeIcon />
    case 'film':
      return <FilmIcon />
    case 'series':
      return <SeriesIcon />
    case 'book':
      return <BookIcon />
    case 'game':
      return <GameIcon />
    case 'art':
      return <ArtIcon />
    case 'settings':
      return <SettingsIcon />
    case 'refresh':
      return <RefreshIcon />
    case 'wand':
      return <WandIcon />
    case 'pencil':
      return <PencilIcon />
    case 'trash':
      return <TrashIcon />
    case 'panel':
      return <PanelIcon />
    case 'unlink':
      return <UnlinkIcon />
    case 'search':
      return <SearchIcon />
    default:
      return null
  }
}

const SETTINGS_NAVIGATION: Array<{ id: SettingsSection; label: string }> = [
  { id: 'profiles', label: 'Profils' },
  { id: 'transfer', label: 'Importer et exporter' },
  { id: 'backups', label: 'Sauvegardes' },
  { id: 'application', label: 'Application' },
  { id: 'about', label: 'À propos' },
]

type SidebarProps = {
  expanded: boolean
  onToggleExpanded: () => void
  count: number | null
  seriesCount: number | null
  bookCount: number | null
  gameCount: number | null
  artworkCount: number | null
  currentProfileName: string | null
  currentProfileAvatar: string | null
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
  expanded,
  onToggleExpanded,
  count,
  seriesCount,
  bookCount,
  gameCount,
  artworkCount,
  currentProfileName,
  currentProfileAvatar,
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
  const effectiveExpanded = settingsOpen || expanded
  // En rail, les libellés sont masqués : l'infobulle maison prend le relais.
  const labelFor = (label: string) => (effectiveExpanded ? undefined : label)

  return (
    <aside className={`sidebar ${settingsOpen ? 'sidebar-settings' : ''} ${effectiveExpanded ? 'sidebar-expanded' : 'sidebar-rail'}`}>
      <div className="sidebar-top">
        <button className="wordmark" onClick={onHome} aria-label="Ouvrir l’accueil">
          <img className="wordmark-logo" src={logoSylloge} alt="" width={34} height={34} />
          <span className="wordmark-text">
            <span>Sylloge</span>
          </span>
        </button>
      </div>
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
          <button
            className={`nav-item ${activeItem === 'library' ? 'active' : ''}`}
            type="button"
            onClick={onLibrary}
            data-tooltip={labelFor('Films')}
            aria-current={activeItem === 'library' ? 'page' : undefined}
          >
            <span className="nav-item-text">{icon('film')} Films</span>
            {count !== null && <span className="nav-count">{count}</span>}
            <span className="nav-item-peek" aria-hidden="true">{icon('film')}</span>
          </button>
          <button
            className={`nav-item ${activeItem === 'series' ? 'active' : ''}`}
            type="button"
            onClick={onSeries}
            data-tooltip={labelFor('Séries')}
            aria-current={activeItem === 'series' ? 'page' : undefined}
          >
            <span className="nav-item-text">{icon('series')} Séries</span>
            {seriesCount !== null && <span className="nav-count">{seriesCount}</span>}
            <span className="nav-item-peek" aria-hidden="true">{icon('series')}</span>
          </button>
          <button
            className={`nav-item ${activeItem === 'books' ? 'active' : ''}`}
            type="button"
            onClick={onBooks}
            data-tooltip={labelFor('Livres')}
            aria-current={activeItem === 'books' ? 'page' : undefined}
          >
            <span className="nav-item-text">{icon('book')} Livres</span>
            {bookCount !== null && <span className="nav-count">{bookCount}</span>}
            <span className="nav-item-peek" aria-hidden="true">{icon('book')}</span>
          </button>
          <button
            className={`nav-item ${activeItem === 'games' ? 'active' : ''}`}
            type="button"
            onClick={onGames}
            data-tooltip={labelFor('Jeux')}
            aria-current={activeItem === 'games' ? 'page' : undefined}
          >
            <span className="nav-item-text">{icon('game')} Jeux</span>
            {gameCount !== null && <span className="nav-count">{gameCount}</span>}
            <span className="nav-item-peek" aria-hidden="true">{icon('game')}</span>
          </button>
          <button
            className={`nav-item ${activeItem === 'artworks' ? 'active' : ''}`}
            type="button"
            onClick={onArtworks}
            data-tooltip={labelFor('Art')}
            aria-current={activeItem === 'artworks' ? 'page' : undefined}
          >
            <span className="nav-item-text">{icon('art')} Art</span>
            {artworkCount !== null && <span className="nav-count">{artworkCount}</span>}
            <span className="nav-item-peek" aria-hidden="true">{icon('art')}</span>
          </button>
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
            {icon('film')} Retour à la bibliothèque
          </button>
        ) : (
          <>
            <button
              className={`sidebar-toggle ${expanded ? '' : 'is-floating'}`}
              type="button"
              onClick={onToggleExpanded}
              aria-label={expanded ? 'Réduire la barre latérale' : 'Développer la barre latérale'}
              aria-pressed={expanded}
              data-tooltip={expanded ? undefined : 'Barre latérale'}
            >
              {/* Icône conservée dans les deux modes (0.6.11) : elle ne doit
                  pas disparaître au profit du seul texte. */}
              <span className="nav-item-text">{icon('panel')} Barre latérale</span>
              <span className="nav-item-peek" aria-hidden="true">{icon('panel')}</span>
            </button>
            <button
              className="nav-item"
              type="button"
              onClick={onSettings}
              data-tooltip={labelFor('Paramètres')}
            >
              <span className="nav-item-text">{icon('settings')} Paramètres</span>
              <span className="nav-item-peek" aria-hidden="true">{icon('settings')}</span>
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

/** Sous-titre éditorial d'une bibliothèque : compte réel, coups de cœur quand la note existe. */
function librarySubtitle(
  items: { isFavorite: boolean }[],
  singular: string,
  plural: string,
): string {
  const total = items.length
  const count = total === 1 ? `1 ${singular}` : `${total} ${plural}`
  const hearts = items.filter((item) => item.isFavorite).length
  return hearts > 0
    ? `${count} dont ${hearts} coup${hearts > 1 ? 's' : ''} de cœur`
    : count
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
  themePreference: ThemePreference
  onThemePreferenceChange: (preference: ThemePreference) => void
  onProfileReady: (destination?: 'home' | 'transfer') => void
}

type OnboardingStep = 'identity' | 'appearance' | 'library'
type OnboardingStart = 'empty' | 'backup' | 'collection'

type OnboardingBackup = {
  fileName: string
  document: SyllogeLibraryDocument
}

const ONBOARDING_STEPS: Array<{ id: OnboardingStep; label: string }> = [
  { id: 'identity', label: 'Profil' },
  { id: 'appearance', label: 'Apparence' },
  { id: 'library', label: 'Bibliothèque' },
]

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string; detail: string }> = [
  { id: 'system', label: 'Système', detail: 'Suit automatiquement le réglage de cet appareil.' },
  { id: 'light', label: 'Clair', detail: 'Papier chaud et contrastes doux.' },
  { id: 'dark', label: 'Sombre', detail: 'Surfaces profondes pour une lumière réduite.' },
]

/** Premier lancement réel : identité, apparence et stratégie d’import. */
function Onboarding({ themePreference, onThemePreferenceChange, onProfileReady }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>('identity')
  const [name, setName] = useState('')
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null)
  const [start, setStart] = useState<OnboardingStart>('empty')
  const [backup, setBackup] = useState<OnboardingBackup | null>(null)
  const [choosingBackup, setChoosingBackup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentStepIndex = ONBOARDING_STEPS.findIndex((item) => item.id === step)

  const chooseBackup = async () => {
    if (choosingBackup || busy) return
    setChoosingBackup(true)
    setError(null)
    try {
      const picked = await pickImportJson()
      if (!picked) return
      const preview = validateLibraryDocument(picked.contents)
      if (preview.document === null) {
        const firstError = preview.errors[0]
        setError(firstError
          ? `Ce fichier n’est pas une sauvegarde Sylloge complète valide. ${firstError.path} : ${firstError.message}`
          : 'Ce fichier n’est pas une sauvegarde Sylloge complète valide.')
        return
      }
      setBackup({ fileName: picked.name, document: preview.document })
      setStart('backup')
    } catch (cause) {
      console.error('Impossible de préparer la sauvegarde du premier lancement.', cause)
      setError(cause instanceof Error ? cause.message : 'La sauvegarde n’a pas pu être vérifiée.')
    } finally {
      setChoosingBackup(false)
    }
  }

  const finish = async (requestedStart = start) => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    if (requestedStart === 'backup' && backup === null) {
      setError('Choisis d’abord une sauvegarde Sylloge complète à restaurer.')
      return
    }
    setBusy(true)
    setError(null)
    let createdProfileId: string | null = null
    try {
      const createdAt = new Date().toISOString()
      createdProfileId = await profilesRepository.create(trimmed, {
        avatarDataUrl,
        selectAfterCreation: true,
      })

      if (requestedStart === 'backup' && backup) {
        await libraryRepository.importLibraryDocumentIntoEmptyProfile({
          id: createdProfileId,
          name: trimmed,
          createdAt,
          updatedAt: createdAt,
        }, backup.document)
      }

      onProfileReady(requestedStart === 'collection' ? 'transfer' : 'home')
    } catch (cause) {
      console.error('Impossible de créer le profil de premier lancement.', cause)
      if (createdProfileId) {
        try {
          await profilesRepository.delete(createdProfileId)
        } catch (cleanupCause) {
          console.error('Le profil vide de premier lancement n’a pas pu être nettoyé.', cleanupCause)
        }
      }
      setError(cause instanceof Error ? cause.message : 'Le premier lancement n’a pas pu être finalisé.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="onboarding-shell">
        <aside className="onboarding-aside" aria-label="Progression du premier lancement">
          <div>
            <img className="onboarding-logo" src={logoSylloge} alt="" width={46} height={46} />
            <p className="eyebrow">Bienvenue dans</p>
            <h1 className="display-title">Sylloge</h1>
            <p>Votre bibliothèque culturelle personnelle, locale et durable.</p>
          </div>
          <ol className="onboarding-progress">
            {ONBOARDING_STEPS.map((item, index) => (
              <li key={item.id} className={item.id === step ? 'active' : index < currentStepIndex ? 'complete' : ''}>
                <span>{index < currentStepIndex ? '✓' : index + 1}</span>
                {item.label}
              </li>
            ))}
          </ol>
          <p className="onboarding-local-note">Aucun compte, aucun cloud. Vos données restent sur cet appareil.</p>
        </aside>

        <section className="onboarding-panel" aria-live="polite">
          {step === 'identity' && (
            <div className="onboarding-step">
              <p className="card-kicker">Étape 1 sur 3</p>
              <h2>Créer votre profil</h2>
              <p className="onboarding-step-intro">Ce nom identifiera votre bibliothèque sur cet appareil. La photo reste facultative et locale.</p>
              <div className="onboarding-identity-row">
                <ProfileAvatarPicker
                  compact
                  name={name || 'Sylloge'}
                  avatarDataUrl={avatarDataUrl}
                  disabled={busy}
                  onChange={setAvatarDataUrl}
                  onError={setError}
                />
                <label className="onboarding-name-field">
                  <span>Pseudo ou prénom</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Par exemple Camille"
                    maxLength={60}
                  />
                </label>
              </div>
              <div className="onboarding-actions end">
                <button className="primary-button" type="button" disabled={!name.trim()} onClick={() => { setError(null); setStep('appearance') }}>Continuer</button>
              </div>
            </div>
          )}

          {step === 'appearance' && (
            <div className="onboarding-step">
              <p className="card-kicker">Étape 2 sur 3</p>
              <h2>Choisir l’apparence</h2>
              <p className="onboarding-step-intro">Le choix s’applique immédiatement et pourra être modifié plus tard dans Paramètres.</p>
              <div className="onboarding-theme-grid" role="radiogroup" aria-label="Thème de l’application">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={`onboarding-theme-choice ${themePreference === option.id ? 'active' : ''}`}
                    type="button"
                    role="radio"
                    aria-checked={themePreference === option.id}
                    onClick={() => onThemePreferenceChange(option.id)}
                  >
                    <span className={`theme-preview theme-preview-${option.id}`} aria-hidden="true"><i /><i /><i /></span>
                    <b>{option.label}</b>
                    <small>{option.detail}</small>
                  </button>
                ))}
              </div>
              <div className="onboarding-actions">
                <button className="secondary-button" type="button" onClick={() => setStep('identity')}>Retour</button>
                <button className="primary-button" type="button" onClick={() => { setError(null); setStep('library') }}>Continuer</button>
              </div>
            </div>
          )}

          {step === 'library' && (
            <div className="onboarding-step">
              <p className="card-kicker">Étape 3 sur 3</p>
              <h2>Préparer votre bibliothèque</h2>
              <p className="onboarding-step-intro">Commencez à vide ou réutilisez un fichier existant. Aucune donnée n’est écrite avant la validation finale.</p>
              <div className="onboarding-start-grid" role="radiogroup" aria-label="Point de départ">
                <button className={`onboarding-start-choice ${start === 'empty' ? 'active' : ''}`} type="button" role="radio" aria-checked={start === 'empty'} onClick={() => { setStart('empty'); setError(null) }}>
                  <span className="onboarding-choice-mark" aria-hidden="true">＋</span>
                  <span><b>Commencer à vide</b><small>Ajoutez vos premières œuvres à votre rythme.</small></span>
                </button>
                <button className={`onboarding-start-choice ${start === 'backup' ? 'active' : ''}`} type="button" role="radio" aria-checked={start === 'backup'} disabled={choosingBackup} onClick={() => void chooseBackup()}>
                  <span className="onboarding-choice-mark" aria-hidden="true">↥</span>
                  <span><b>Restaurer Sylloge</b><small>{backup ? `${backup.fileName} est prêt à être restauré.` : 'Choisissez une sauvegarde JSON réunissant les cinq collections.'}</small></span>
                </button>
                <button className={`onboarding-start-choice ${start === 'collection' ? 'active' : ''}`} type="button" role="radio" aria-checked={start === 'collection'} onClick={() => { setStart('collection'); setError(null) }}>
                  <span className="onboarding-choice-mark" aria-hidden="true">⇢</span>
                  <span><b>Importer une collection</b><small>Créez le profil puis choisissez l’assistant Films, Séries, Livres, Jeux ou Art.</small></span>
                </button>
              </div>
              {backup && start === 'backup' && (
                <dl className="onboarding-import-summary">
                  <div><dt>Films</dt><dd>{backup.document.films.length}</dd></div>
                  <div><dt>Séries</dt><dd>{backup.document.series.length}</dd></div>
                  <div><dt>Livres</dt><dd>{backup.document.books.length}</dd></div>
                  <div><dt>Jeux</dt><dd>{backup.document.games.length}</dd></div>
                  <div><dt>Art</dt><dd>{backup.document.artworks.length}</dd></div>
                </dl>
              )}
              <div className="onboarding-actions">
                <button className="secondary-button" type="button" disabled={busy} onClick={() => setStep('appearance')}>Retour</button>
                <span className="onboarding-final-actions">
                  <button className="text-button" type="button" disabled={busy} onClick={() => void finish('empty')}>Plus tard</button>
                  <button className="primary-button" type="button" disabled={busy || choosingBackup || (start === 'backup' && backup === null)} onClick={() => void finish()}>
                    {busy ? 'Préparation…' : start === 'backup' ? 'Créer et restaurer' : start === 'collection' ? 'Créer et voir les imports' : 'Ouvrir ma bibliothèque'}
                  </button>
                </span>
              </div>
            </div>
          )}

          {error && <p className="inline-report error onboarding-error" role="alert">{error}</p>}
        </section>
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

type MediumFilterKey = 'film' | 'série' | 'livre' | 'jeu' | 'art'

const MEDIUM_CHIP_LABELS: Record<MediumFilterKey, string> = {
  film: 'Films',
  'série': 'Séries',
  livre: 'Livres',
  jeu: 'Jeux',
  art: 'Art',
}

const MEDIUM_CARD_LABELS: Record<MediumFilterKey, string> = {
  film: 'Film',
  'série': 'Série',
  livre: 'Livre',
  jeu: 'Jeu',
  art: 'Art',
}

/** Couleur du point de calendrier par médium — palette désaturée,
 * cohérente avec la direction anthracite (lisibles sur clair et sombre). */
// Constante interne (jamais exportée : un export non-composant désactive le
// Fast Refresh de tout main.tsx et provoque des doubles montages au HMR).
const MEDIUM_DOT_COLORS: Record<MediumFilterKey, string> = {
  film: '#A8645C',
  'série': '#7D729B',
  livre: '#B39A55',
  jeu: '#64809B',
  art: '#AD7288',
}

type HomeEntry = {
  key: string
  medium: MediumFilterKey
  title: string
  subtitle: string
  poster: string | null
  createdAt: string
  rating: number | null
  isFavorite: boolean
  /** Statut du médium (libellé brut du domaine) pour les modules par statut. */
  status?: string
  /** Date de consommation réelle (visionnage, lecture, partie, découverte). */
  consumedAt: string | null
  personalNote: string | null
  onOpen: () => void
}

/** Cartes d'activité par jour : chaque médium marque sa couleur. */
function buildActivityMap(
  films: Film[],
  series: Series[],
  books: Book[],
  games: Game[],
  artworks: Artwork[],
): Map<string, MediumFilterKey[]> {
  const map = new Map<string, MediumFilterKey[]>()
  const add = (key: string | null | undefined, medium: MediumFilterKey) => {
    if (!key) return
    const day = key.slice(0, 10)
    const list = map.get(day) ?? []
    if (!list.includes(medium)) list.push(medium)
    map.set(day, list)
  }
  films.forEach((film) => {
    if (film.status === 'terminé') add(film.watchedAt, 'film')
  })
  series.forEach((entry) => {
    if (entry.status === 'vue') add(entry.progressUpdatedAt?.slice(0, 10), 'série')
  })
  books.forEach((entry) => {
    if (entry.status === 'lu') add(entry.startedAt, 'livre')
  })
  games.forEach((entry) => {
    if (entry.status === 'joué') add(entry.playedAt, 'jeu')
  })
  artworks.forEach((entry) => {
    if (entry.status === 'découverte') add(entry.discoveredAt, 'art')
  })
  return map
}

function formatWatchedDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
}


type HomeProps = {
  library: FilmLibrary
  seriesCollection: Series[]
  bookCollection: Book[]
  gameCollection: Game[]
  artworkCollection: Artwork[]
  onOpen: (film: Film) => void
  onOpenSeries: (series: Series) => void
  onOpenBook: (book: Book) => void
  onOpenGame: (game: Game) => void
  onOpenArtwork: (artwork: Artwork) => void
}

function Home({
  library,
  seriesCollection,
  bookCollection,
  gameCollection,
  artworkCollection,
  onOpen,
  onOpenSeries,
  onOpenBook,
  onOpenGame,
  onOpenArtwork,
}: HomeProps) {
  // Toutes les œuvres, normalisées en entrées communes pour les modules.
  const allEntries: HomeEntry[] = [
    ...library.films.map((film) => ({
      key: `film-${film.id}`,
      medium: 'film' as const,
      title: film.title,
      subtitle: [film.director, film.year].filter((value) => value !== null).join(' · '),
      poster: film.posterUrl,
      createdAt: film.createdAt,
      rating: film.rating,
      isFavorite: film.isFavorite,
      status: film.status,
      consumedAt: film.status === 'terminé' ? film.watchedAt : null,
      personalNote: film.personalNote,
      onOpen: () => onOpen(film),
    })),
    ...seriesCollection.map((entry) => ({
      key: `series-${entry.id}`,
      medium: 'série' as const,
      title: entry.title,
      subtitle: entry.showrunner ?? '',
      poster: entry.posterUrl,
      createdAt: entry.createdAt,
      rating: entry.rating,
      isFavorite: entry.isFavorite,
      status: entry.status,
      consumedAt: entry.status === 'vue' ? entry.progressUpdatedAt?.slice(0, 10) ?? null : null,
      personalNote: entry.personalNote,
      onOpen: () => onOpenSeries(entry),
    })),
    ...bookCollection.map((entry) => ({
      key: `book-${entry.id}`,
      medium: 'livre' as const,
      title: entry.title,
      subtitle: entry.author ?? '',
      poster: entry.coverUrl,
      createdAt: entry.createdAt,
      rating: entry.rating,
      isFavorite: entry.isFavorite,
      status: entry.status,
      consumedAt: entry.status === 'lu' && entry.startedAt ? entry.startedAt : null,
      personalNote: entry.personalNote,
      onOpen: () => onOpenBook(entry),
    })),
    ...gameCollection.map((entry) => ({
      key: `game-${entry.id}`,
      medium: 'jeu' as const,
      title: entry.title,
      subtitle: [entry.developer, entry.year].filter((value) => value !== null).join(' · '),
      poster: entry.coverUrl,
      createdAt: entry.createdAt,
      rating: entry.rating,
      isFavorite: entry.isFavorite,
      status: entry.status,
      consumedAt:
        entry.status === 'joué' && entry.playedAt
          ? entry.playedAt
          : null,
      personalNote: entry.personalNote,
      onOpen: () => onOpenGame(entry),
    })),
    ...artworkCollection.map((entry) => ({
      key: `artwork-${entry.id}`,
      medium: 'art' as const,
      title: entry.title,
      subtitle: entry.artist ?? '',
      poster: entry.imageUrl,
      createdAt: entry.createdAt,
      rating: null,
      isFavorite: entry.isFavorite,
      status: entry.status,
      consumedAt: entry.status === 'découverte' ? entry.discoveredAt : null,
      personalNote: entry.personalNote,
      onOpen: () => onOpenArtwork(entry),
    })),
  ]

  const activityMap = buildActivityMap(library.films, seriesCollection, bookCollection, gameCollection, artworkCollection)
  return <HomeDashboard entries={allEntries} activityMap={activityMap} />
}

/** Puces de filtrage par médium d'un module. */
function MediumChips({
  active,
  onChange,
}: {
  active: MediumFilterKey | 'tout'
  onChange: (next: MediumFilterKey | 'tout') => void
}) {
  const options: Array<MediumFilterKey | 'tout'> = ['tout', 'film', 'série', 'livre', 'jeu', 'art']
  return (
    <div className="medium-chips" role="group" aria-label="Filtrer par médium">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`medium-chip ${active === option ? 'on' : ''}`}
          aria-pressed={active === option}
          onClick={() => onChange(option)}
        >
          {option === 'tout' ? 'Tout' : MEDIUM_CHIP_LABELS[option]}
        </button>
      ))}
    </div>
  )
}

/** Carte d'une œuvre dans un module. */
function EntryCard({ entry }: { entry: HomeEntry }) {
  return (
    <button type="button" className="home-entry-card" onClick={entry.onOpen} aria-label={`Ouvrir la fiche de ${entry.title}`}>
      <Poster title={entry.title} src={entry.poster} className="home-entry-poster" />
      <span className="home-entry-info">
        <span className="home-entry-medium" style={{ color: MEDIUM_DOT_COLORS[entry.medium] }}>
          {MEDIUM_CARD_LABELS[entry.medium]}
        </span>
        <b>{entry.title}</b>
        {entry.subtitle && <small>{entry.subtitle}</small>}
      </span>
    </button>
  )
}

/** Module générique : titre + puces de médium + grille filtrée, teinté par médium. */
function FilterableModule({
  title,
  entries,
  emptyMessage,
  className,
}: {
  title: string
  entries: HomeEntry[]
  emptyMessage: string
  className: string
}) {
  const [filter, setFilter] = useState<MediumFilterKey | 'tout'>('tout')
  const visible = filter === 'tout' ? entries : entries.filter((entry) => entry.medium === filter)
  // Teinte pastel du module dans la couleur du médium actif.
  const tintStyle = filter === 'tout'
    ? undefined
    : ({
        '--module-tint': MEDIUM_DOT_COLORS[filter],
      } as React.CSSProperties)

  return (
    <section
      className={`home-module ${className} ${filter !== 'tout' ? 'module-tinted' : ''}`}
      style={tintStyle}
      aria-labelledby={`${className}-title`}
    >
      <header className="home-module-heading">
        <h2 id={`${className}-title`}>{title}</h2>
        <MediumChips active={filter} onChange={setFilter} />
      </header>
      {visible.length > 0 ? (
        <div className="home-entry-grid">
          {visible.map((entry) => <EntryCard key={entry.key} entry={entry} />)}
        </div>
      ) : (
        <p className="home-module-empty">{emptyMessage}</p>
      )}
    </section>
  )
}

/** Calendrier mensuel à points colorés, navigable mois par mois. */
function dayLabel(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
}

/** Étoiles statiques (lecture seule) pour les aperçus de note. */
function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="stars-none">Pas encore noté</span>
  return (
    <span className="stars-display stars-display-compact" aria-label={`${value.toLocaleString('fr-FR')} sur 5`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, value - star + 1))
        return (
          <span key={star} className={`star-slot ${fill > 0 ? 'filled' : ''}`}>
            <span className="star-glyph" aria-hidden="true">★</span>
            <span className="star-fill" aria-hidden="true" style={{ width: `${fill * 100}%` }}>★</span>
          </span>
        )
      })}
    </span>
  )
}

/** Anniversaires : œuvres consommées exactement il y a X ans, jour pour jour. */
function collectAnniversaries(entries: HomeEntry[]): HomeEntry[] {
  const today = new Date()
  const todayKey = formatCalendarDate(today)
  const mmdd = todayKey.slice(5)
  return entries
    .filter((entry) => {
      const consumed = entry.consumedAt
      if (!consumed || !/^\d{4}-\d{2}-\d{2}/.test(consumed)) return false
      const day = consumed.slice(5, 10)
      const years = today.getFullYear() - Number(consumed.slice(0, 4))
      return day === mmdd && years >= 1
    })
    .sort((a, b) => a.consumedAt!.localeCompare(b.consumedAt!))
}

function AnniversariesModule({ anniversaries }: { anniversaries: HomeEntry[] }) {
  // Interface modulable : le module disparaît quand aucun anniversaire n'existe.
  if (anniversaries.length === 0) return null

  return (
    <section className="home-module home-module-anniversaries" aria-labelledby="anniversaries-title">
      <header className="home-module-heading">
        <h2 id="anniversaries-title">Jour pour jour</h2>
        <p className="module-hint">Regarde ce que tu en pensais à l’époque</p>
      </header>
      <div className="home-entry-grid">
        {anniversaries.map((entry) => {
          const years = new Date().getFullYear() - Number(entry.consumedAt!.slice(0, 4))
          const yearLabel = years.toLocaleString('fr-FR')
          return (
            <button type="button" className="home-entry-card" onClick={entry.onOpen} key={entry.key} aria-label={`Ouvrir la fiche de ${entry.title}`}>
              <Poster title={entry.title} src={entry.poster} className="home-entry-poster" />
              <span className="home-entry-info">
                <span className="home-entry-years">Il y a {yearLabel} an{years > 1 ? 's' : ''}</span>
                <b>{entry.title}</b>
                <Stars value={entry.rating} />
                {entry.personalNote && <small>{truncateNote(entry.personalNote)}</small>}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function truncateNote(note: string): string {
  const clean = note.replace(/\s+/g, ' ').trim()
  return clean.length > 120 ? `${clean.slice(0, 117)}…` : clean
}

/** File d'attente : tout ce qui attend d'être vu, lu, joué ou découvert. */
const QUEUE_STATUSES: Record<MediumFilterKey, string> = {
  film: 'à découvrir',
  'série': 'à voir',
  livre: 'à lire',
  jeu: 'à jouer',
  art: 'à découvrir',
}

function DiscoverQueueModule({ entries }: { entries: HomeEntry[] }) {
  const [filter, setFilter] = useState<MediumFilterKey | 'tout'>('tout')
  const [seed, setSeed] = useState(0)
  const queue = entries.filter((entry) => entry.status === QUEUE_STATUSES[entry.medium])
  const options: Array<MediumFilterKey | 'tout'> = ['tout', 'film', 'série', 'livre', 'jeu', 'art']
  const visibleQueue = filter === 'tout' ? queue : queue.filter((entry) => entry.medium === filter)
  const tintStyle = filter === 'tout'
    ? undefined
    : ({
        '--module-tint': MEDIUM_DOT_COLORS[filter],
      } as React.CSSProperties)

  // Tirage déterministe par graine : trois œuvres stables jusqu'au prochain clic.
  const picked = useMemo(() => {
    if (visibleQueue.length <= 3) return visibleQueue
    let current = (seed + 1) * 2654435761 % 4294967296
    const pool = [...visibleQueue]
    for (let i = pool.length - 1; i > 0; i -= 1) {
      current = (current * 1664525 + 1013904223) % 4294967296
      const j = Math.floor((current / 4294967296) * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return pool.slice(0, 3)
  }, [visibleQueue, seed])

  return (
    <section
      className={`home-module home-module-discover ${filter !== 'tout' ? 'module-tinted' : ''}`}
      style={tintStyle}
      aria-labelledby="discover-title"
    >
      <header className="home-module-heading">
        <h2 id="discover-title">À découvrir</h2>
        <div className="medium-chips discover-chips" role="group" aria-label="Filtrer la file d'attente par médium">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={`medium-chip ${filter === option ? 'on' : ''}`}
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
            >
              {option === 'tout' ? 'Tout' : MEDIUM_CHIP_LABELS[option]}
            </button>
          ))}
          <span className="discover-shuffle-slot">
            <button
              type="button"
              className="shuffle-button"
              onClick={() => setSeed((value) => value + 1)}
              disabled={visibleQueue.length <= 3}
              aria-label="Proposer trois autres œuvres au hasard"
              title="Trois autres propositions"
            >
              {icon('refresh')}
            </button>
          </span>
        </div>
      </header>
      {picked.length > 0 ? (
        <div className="home-entry-grid">
          {picked.map((entry) => <EntryCard key={entry.key} entry={entry} />)}
        </div>
      ) : (
        <p className="home-module-empty">
          {queue.length === 0
            ? 'Aucune œuvre en attente : ajoute des statuts « à voir », « à lire » ou « à jouer ».'
            : 'Rien dans cette file pour l’instant.'}
        </p>
      )}
    </section>
  )
}

/** Tableau de bord d'accueil : modules multi-bibliothèques à puces. */
function HomeDashboard({ entries, activityMap }: { entries: HomeEntry[]; activityMap: Map<string, MediumFilterKey[]> }) {
  const recent = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3)
  const consumed = entries
    .filter((entry) => entry.consumedAt !== null)
    .sort((a, b) => b.consumedAt!.localeCompare(a.consumedAt!))
    .slice(0, 3)
  const favorites = entries
    .filter((entry) => entry.isFavorite || entry.rating !== null)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || Number(b.isFavorite) - Number(a.isFavorite))
    .slice(0, 3)
  const anniversaries = collectAnniversaries(entries)

  return (
    <main className="main home-main" aria-label="Accueil">
      <div className="home-content">
        <div className="dashboard-grid">
          <YearHero entries={entries} activityMap={activityMap} />
          <FilterableModule
            title="Derniers ajouts"
            entries={recent}
            emptyMessage="Aucune œuvre n’a encore été ajoutée."
            className="module-additions"
          />
          <FilterableModule
            title="Vus, lus et joués"
            entries={consumed}
            emptyMessage="Aucune œuvre terminée et datée pour l’instant."
            className="module-consumed"
          />
          <FilterableModule
            title="Favoris et mieux notés"
            entries={favorites}
            emptyMessage="Ajoute des favoris ou des notes pour remplir ce module."
            className="module-favorites"
          />
          <AnniversariesModule anniversaries={anniversaries} />
          <DiscoverQueueModule entries={entries} />
        </div>
      </div>
    </main>
  )
}

const HERO_LABELS: Record<MediumFilterKey, [string, string]> = {
  film: ['film vu', 'films vus'],
  'série': ['série vue', 'séries vues'],
  livre: ['livre lu', 'livres lus'],
  jeu: ['jeu ajouté', 'jeux ajoutés'],
  art: ['œuvre découverte', 'œuvres découvertes'],
}

/** Bandeau hero d'en-tête : l'année en cours et le calendrier, monochrome. */
function YearHero({ entries, activityMap }: { entries: HomeEntry[]; activityMap: Map<string, MediumFilterKey[]> }) {
  const year = new Date().getFullYear()
  const prefix = String(year)
  const countByMedium = (medium: MediumFilterKey) =>
    entries.filter((entry) => entry.medium === medium && entry.createdAt.startsWith(prefix)).length
  const counts: Array<[MediumFilterKey, number]> = [
    ('film'),
    ('série'),
    ('livre'),
    ('jeu'),
    ('art'),
  ].map((medium) => [medium as MediumFilterKey, countByMedium(medium as MediumFilterKey)])
  const total = counts.reduce((sum, [, value]) => sum + value, 0)

  return (
    <section className="home-hero" aria-label={`Votre année ${year}`}>
      <div className="hero-left">
        <p className="hero-kicker">Votre année</p>
        <p className="hero-year">{year}</p>
      </div>
      <div className="hero-stats">
        {counts.map(([medium, value]) => (
          <div key={medium} className="hero-stat">
            <b>{value}</b>
            <small>{HERO_LABELS[medium][value > 1 ? 1 : 0]}</small>
          </div>
        ))}
      </div>
      {total === 0 && (
        <p className="hero-empty">Ajoutez votre première œuvre pour voir l’année se remplir.</p>
      )}
      <div className="hero-calendar">
        <ActivityCalendarCompact activityMap={activityMap} />
      </div>
    </section>
  )
}

/** Calendrier compact du hero : mêmes données, habillage sombre. */
function ActivityCalendarCompact({ activityMap }: { activityMap: Map<string, MediumFilterKey[]> }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [monthOffset, setMonthOffset] = useState(0)
  const cursor = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstWeekday = (new Date(year, month, 1).getDay() || 7) - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const canGoForward = monthOffset < 0

  return (
    <>
      <header className="calendar-nav hero-calendar-nav">
        <button
          type="button"
          className="calendar-nav-button hero-calendar-button"
          onClick={() => setMonthOffset((value) => value - 1)}
          aria-label="Mois précédent"
        >
          ‹
        </button>
        <h2>{new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(cursor)}</h2>
        <button
          type="button"
          className="calendar-nav-button hero-calendar-button"
          onClick={() => setMonthOffset((value) => Math.min(0, value + 1))}
          disabled={!canGoForward}
          aria-label="Mois suivant"
        >
          ›
        </button>
      </header>
      <div className="calendar-weekdays hero-calendar-weekdays" aria-hidden="true">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
      </div>
      <ol className="calendar-days hero-calendar-days">
        {Array.from({ length: firstWeekday }, (_, index) => <li key={`pad-${index}`} className="pad" />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const mediums = activityMap.get(key) ?? []
          const isToday = key === formatCalendarDate(today)
          return (
            <li key={key} className={`calendar-day ${mediums.length > 0 ? 'active' : ''} ${isToday ? 'today' : ''}`}>
              <time dateTime={key}>{day}</time>
              {mediums.length > 0 && (
                <span className="calendar-dots" aria-hidden="true">
                  {mediums.map((medium) => (
                    <i key={medium} style={{ background: MEDIUM_DOT_COLORS[medium] }} />
                  ))}
                </span>
              )}
              {mediums.length > 0 && <span className="visually-hidden">{`${dayLabel(key)} : ${mediums.map((m) => MEDIUM_CARD_LABELS[m]).join(', ')}`}</span>}
            </li>
          )
        })}
      </ol>
    </>
  )
}

type LibraryContext = {
  query: string
  view: LibraryViewDefinition
  extraFilters: LibraryFilters
  sortOverride: LibrarySort | null
}

const ALL_SERIES_CATEGORIES = SERIES_CATEGORIES as readonly SeriesCategory[]
const ALL_BOOK_CATEGORIES = BOOK_CATEGORIES as readonly BookCategory[]

/**
 * Sélection de catégories → valeur stockée dans une vue enregistrée.
 * Liste vide ou complète = « all » ; sinon les catégories jointes par « | »,
 * sans perte pour une sélection partielle multiple.
 */
function categoriesToStored(categories: readonly string[], complete: readonly string[]): string {
  if (categories.length === 0 || categories.length === complete.length) return 'all'
  return categories.join('|')
}

/** Valeur stockée (« all », catégorie, ou « a|b ») → liste pour l'interrupteur. */
function storedToCategories(value: string): string[] {
  if (value === 'all' || value.trim() === '') return []
  return value.split('|').map((entry) => entry.trim()).filter(Boolean)
}

/** Libellé lisible des catégories actives d'une bibliothèque, null si toutes. */
function categoriesLabel(categories: readonly string[], labels: Record<string, string>): string | null {
  if (categories.length === 0) return null
  const names = categories.map((category) => labels[category] ?? category)
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
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
  const isUnfiltered = context.query.trim() === '' && context.view.id === RATED_BUILTIN_VIEWS[0].id && !hasActiveFilters(context.extraFilters) && context.sortOverride === null
  const resolved = resolveLibraryQuery(context.view, context.extraFilters, context.sortOverride)
  const [autoAssociateOpen, setAutoAssociateOpen] = useState(false)

  return (
    <main className="main library-main" aria-label={`Bibliothèque Films du profil ${library.profile.name}`}>
      <header className="library-header">
        <div>
          <p className="eyebrow">Collection personnelle</p>
          <h1 className="display-title">Films</h1>
          <p className="library-subtitle">{librarySubtitle(library.films, 'film', 'films')}</p>
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
          <LibraryExportFlow kind="films" profileId={library.profile.id} />
          <button className="primary-button" type="button" onClick={onCreate}>Ajouter un film</button>
        </div>
      </header>

      {/* 0.6.27 : la barre d'outils reste affichée même bibliothèque vide —
          les cinq médiums partagent exactement le même gabarit. */}
      <div className="library-tools">
        <button
          className="auto-associate-button"
          type="button"
          onClick={() => setAutoAssociateOpen(true)}
          title="Associer automatiquement les fiches non associées via TMDB"
        >
          {icon('wand')}
          <span>Tout associer</span>
        </button>
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
        <LibraryViewBar
          profileId={library.profile.id}
          medium="films"
          builtinViews={titledBuiltinViews(RATED_BUILTIN_VIEWS, 'films')}
          activeView={context.view}
          onViewChange={(view) => onContextChange({ ...context, view })}
          filterConfig={FILM_FILTER_PANEL_CONFIG}
          mediumFilterValue="all"
          onMediumFilterChange={() => {}}
          extraFilters={context.extraFilters}
          onExtraFiltersChange={(extraFilters) => onContextChange({ ...context, extraFilters })}
          sortCapabilities={{ rating: true, year: true }}
          sortOverride={context.sortOverride}
          onSortOverrideChange={(sortOverride) => onContextChange({ ...context, sortOverride })}
          currentCriteria={{ sort: resolved.sort, mediumFilter: 'all', filters: resolved.filters }}
        />
      </div>

      {library.films.length === 0 && isUnfiltered ? (
        <EmptyLibrary onCreate={onCreate} />
      ) : (
        <>
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
                onClick={() => onContextChange({ query: '', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}
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
      <AutoAssociateDialog
        open={autoAssociateOpen}
        onClose={() => setAutoAssociateOpen(false)}
        films={library.films}
        onDone={onLibraryChanged}
      />
    </main>
  )
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
      'fr-FR',
      (processed, total) => setProgress({ processed, total }),
      () => cancelRef.current,
    )
    setSummary({ associated: result.associatedCount, noMatch: result.noMatchCount, cancelled: cancelRef.current })
    setPhase('done')
    onDone()
  }

  return (
    <AccessibleDialog
      title="Tout associer"
      description="Recherche automatique des fiches sur TMDB"
      closeDisabled={phase === 'running'}
      onClose={() => { if (phase !== 'running') { onClose(); setPhase('confirm'); setSummary(null) } }}
    >
      <div className="assistant-content">
        {phase === 'confirm' && (
          <section className="assistant-stage">
            <h3>Associer toutes les fiches non associées via TMDB ?</h3>
            <p className="films-import-details">
              {pendingCount} fiche{pendingCount > 1 ? 's ne sont' : ' n’est'} pas encore associée{pendingCount > 1 ? 's' : ''}.
              Sylloge recherchera chaque titre et gardera la meilleure correspondance (titre et année).
              Tes notes, avis et statuts ne sont jamais modifiés.
            </p>
            <ImportHint>
              Les fiches déjà associées ne sont pas retouchées, et tu pourras corriger une association
              fiche par fiche si le résultat n’est pas le bon.
            </ImportHint>
            <div className="assistant-actions">
              <button className="secondary-button" type="button" onClick={onClose}>Non</button>
              <button className="primary-button" type="button" disabled={pendingCount === 0} onClick={() => void start()}>Oui, lancer</button>
            </div>
          </section>
        )}
        {phase === 'running' && (
          <section className="assistant-stage">
            <h3>Association en cours…</h3>
            <p className="films-import-details">
              <b>{progress.processed}</b> sur {progress.total} fiches traitées.
            </p>
            <div
              className="auto-associate-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.processed}
              aria-label="Progression de l’association"
            >
              <div className="auto-associate-progress-fill" style={{ width: `${progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0}%` }} />
            </div>
            <p className="auto-associate-percent">{progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0} %</p>
            <div className="assistant-actions">
              <button className="secondary-button" type="button" onClick={() => { cancelRef.current = true }}>Arrêter</button>
            </div>
          </section>
        )}
        {phase === 'done' && summary !== null && (
          <section className="assistant-stage">
            <h3>Association terminée</h3>
            <ul className="import-report auto-associate-summary">
              <li>{summary.associated} fiche{summary.associated > 1 ? 's associée' : ' associée'}{summary.associated > 1 ? 's' : ''}</li>
              <li>{summary.noMatch} sans correspondance assez sûre</li>
              {summary.cancelled && <li>Opération arrêtée avant la fin — relance « Tout associer » pour continuer.</li>}
            </ul>
            <p className="films-import-details">Chaque fiche reste modifiable individuellement via le bouton Associer.</p>
            <div className="assistant-actions assistant-actions-single">
              <button className="primary-button" type="button" onClick={() => { onClose(); setPhase('confirm'); setSummary(null) }}>Fermer</button>
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
      title="Tout associer"
      description={`Recherche automatique sur ${providerLabel}`}
      closeDisabled={phase === 'running'}
      onClose={() => { if (phase !== 'running') { onClose(); setPhase('confirm'); setSummary(null) } }}
    >
      <div className="assistant-content">
        {phase === 'confirm' && (
          <section className="assistant-stage">
            <h3>{confirmText}</h3>
            <p className="films-import-details">
              Sylloge recherchera chaque titre sur {providerLabel} et gardera la meilleure correspondance.
              Seuls les champs éditoriaux sont mis à jour (visuel, résumé, année, créateur) :
              tes statuts, notes, coups de cœur et avis restent exactement tels quels.
            </p>
            <ImportHint>
              Les visuels viendront du fournisseur officiel : même format, même rendu, sur toute la bibliothèque.
              Une fiche sans correspondance sûre reste inchangée.
            </ImportHint>
            <div className="assistant-actions">
              <button className="secondary-button" type="button" onClick={onClose}>Non</button>
              <button className="primary-button" type="button" disabled={pendingCount === 0} onClick={() => void start()}>Oui, lancer</button>
            </div>
          </section>
        )}
        {phase === 'running' && (
          <section className="assistant-stage">
            <h3>Association en cours…</h3>
            <p className="films-import-details">
              <b>{progress.processed}</b> sur {progress.total} fiches traitées.
            </p>
            <div
              className="auto-associate-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.processed}
              aria-label="Progression de l’association"
            >
              <div className="auto-associate-progress-fill" style={{ width: `${progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0}%` }} />
            </div>
            <p className="auto-associate-percent">{progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0} %</p>
            <div className="assistant-actions">
              <button className="secondary-button" type="button" onClick={() => { cancelRef.current = true }}>Arrêter</button>
            </div>
          </section>
        )}
        {phase === 'done' && summary !== null && (
          <section className="assistant-stage">
            <h3>Association terminée</h3>
            <ul className="import-report auto-associate-summary">
              <li>{summary.associated} fiche{summary.associated > 1 ? 's enrichie' : ' enrichie'}{summary.associated > 1 ? 's' : ''}</li>
              <li>{summary.noMatch} sans correspondance assez sûre — inchangée{summary.noMatch > 1 ? 's' : ''}</li>
              {summary.cancelled && <li>Opération arrêtée avant la fin — relance « Tout associer » pour continuer.</li>}
            </ul>
            <div className="assistant-actions assistant-actions-single">
              <button className="primary-button" type="button" onClick={() => { onClose(); setPhase('confirm'); setSummary(null) }}>Fermer</button>
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
  mediumFilter: {
    label: 'Catégorie',
    options: [
      { value: 'all', label: 'Toutes' },
      ...SERIES_CATEGORIES.map((category) => ({ value: category as string, label: SERIES_CATEGORY_LABELS[category] })),
    ],
  },
  statusOptions: SERIES_STATUSES.map((status) => ({ value: status, label: SERIES_STATUS_LABELS[status] })),
  showRating: true,
  showYear: false,
  personalDateLabel: 'Début de visionnage',
  specificTextField: null,
  showLocation: false,
  showExhibition: false,
}

const BOOK_FILTER_PANEL_CONFIG: LibraryFilterConfig = {
  mediumFilter: {
    label: 'Catégorie',
    options: [
      { value: 'all', label: 'Tous' },
      ...BOOK_CATEGORIES.map((category) => ({ value: category as string, label: BOOK_CATEGORY_LABELS[category] })),
    ],
  },
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
  personalDateLabel: 'Jeu',
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
  context: SeriesLibraryContext
  searchState: SeriesSearchState
  onContextChange: (context: SeriesLibraryContext) => void
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
  const isUnfiltered = context.query.trim() === '' && context.category.length === ALL_SERIES_CATEGORIES.length && context.view.id === PROGRESS_BUILTIN_VIEWS[0].id && !hasActiveFilters(context.extraFilters) && context.sortOverride === null
  const resolved = resolveLibraryQuery(context.view, context.extraFilters, context.sortOverride)
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
        const candidates = await searchTmdbSeries(series.title, 'fr-FR')
        const scored = candidates
          .map((candidate) => ({
            candidate,
            score: scoreNamedCandidate(series.title, series.startedAt ? Number(series.startedAt.slice(0, 4)) : null, candidate.title, candidate.releaseYear),
          }))
          .sort((a, b) => b.score - a.score)
        if (scored.length > 0 && scored[0].score >= MATCH_THRESHOLD) {
          const presentation = await previewTmdbSeries(scored[0].candidate.tmdbId, 'fr-FR')
          await mediaRepository.updateSeries(profileId, series.id, seriesWithPresentation(series, presentation))
          await mediaRepository.setMediaProviderLink({ profileId, medium: 'series', mediaId: series.id, providerName: 'TMDB', providerId: String(presentation.tmdbId) })
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
    <main className="main library-main" aria-label={`Bibliothèque Séries du profil ${profileName}`}>
      <header className="library-header">
        <div>
          <p className="eyebrow">Collection personnelle</p>
          <h1 className="display-title">Séries</h1>
          <p className="library-subtitle">{librarySubtitle(collection, 'série', 'séries')}</p>
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
          <LibraryExportFlow kind="series" profileId={profileId} />
          <button className="primary-button" type="button" onClick={onCreate}>Ajouter une série</button>
        </div>
      </header>
      {/* 0.6.27 : barre d'outils toujours affichée, même bibliothèque vide. */}
      <div className="library-tools">
        <button
          className="auto-associate-button"
          type="button"
          onClick={() => setAutoAssociateOpen(true)}
          title="Normaliser les visuels et fiches via TMDB"
        >
          {icon('wand')}
          <span>Tout associer</span>
        </button>
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
        <SeriesCategorySwitch
          selected={context.category.length > 0 ? context.category : [...ALL_SERIES_CATEGORIES]}
          onSelectionChange={(selected) => onContextChange({ ...context, category: selected as SeriesCategory[] })}
        />
        <LibraryViewBar
          profileId={profileId}
          medium="series"
          builtinViews={titledBuiltinViews(PROGRESS_BUILTIN_VIEWS, 'series')}
          activeView={context.view}
          onViewChange={(view) => onContextChange({ ...context, view })}
          filterConfig={{ ...SERIES_FILTER_PANEL_CONFIG, mediumFilter: null }}
          mediumFilterValue="all"
          onMediumFilterChange={(stored) => {
            const selected = storedToCategories(stored)
            onContextChange({ ...context, category: (selected.length > 0 ? selected : [...ALL_SERIES_CATEGORIES]) as SeriesCategory[] })
          }}
          extraFilters={context.extraFilters}
          onExtraFiltersChange={(extraFilters) => onContextChange({ ...context, extraFilters })}
          sortCapabilities={{ rating: true, year: false }}
          sortOverride={context.sortOverride}
          onSortOverrideChange={(sortOverride) => onContextChange({ ...context, sortOverride })}
          currentCriteria={{ sort: resolved.sort, mediumFilter: categoriesToStored(context.category, ALL_SERIES_CATEGORIES), filters: resolved.filters }}
        />
      </div>
      {collection.length === 0 && isUnfiltered ? (
        <div className="library-state empty-library">
          <p className="state-kicker">Collection personnelle</p>
          <h2>Votre bibliothèque Séries est vide.</h2>
          <p>Ajoutez une première série, avec un titre seulement si vous le souhaitez.</p>
          <button className="primary-button empty-action" type="button" onClick={onCreate}>Ajouter une série</button>
        </div>
      ) : (
        <>
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
                onClick={() => onContextChange({ query: '', category: [...ALL_SERIES_CATEGORIES], view: builtinViewById(PROGRESS_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}
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
      <AutoAssociateEditsDialog
        open={autoAssociateOpen}
        onClose={() => setAutoAssociateOpen(false)}
        providerLabel="TMDB"
        pendingCount={collection.length}
        confirmText="Normaliser toutes les séries via TMDB ?"
        run={runSeriesAssociation}
        onDone={onLibraryChanged}
      />
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
  context: GameLibraryContext
  searchState: GameSearchState
  onContextChange: (context: GameLibraryContext) => void
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
  const isUnfiltered = context.query.trim() === '' && context.platform === 'all' && context.view.id === RATED_BUILTIN_VIEWS[0].id && !hasActiveFilters(context.extraFilters) && context.sortOverride === null
  const resolved = resolveLibraryQuery(context.view, context.extraFilters, context.sortOverride)
  const platforms = buildGamePlatformFilters(collection)
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
    <main className="main library-main" aria-label={`Bibliothèque Jeux du profil ${profileName}`}>
      <header className="library-header">
        <div>
          <p className="eyebrow">Collection personnelle</p>
          <h1 className="display-title">Jeux</h1>
          <p className="library-subtitle">{librarySubtitle(collection, 'jeu', 'jeux')}</p>
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
          <LibraryExportFlow kind="games" profileId={profileId} />
          <button className="primary-button" type="button" onClick={onCreate}>Ajouter un jeu</button>
        </div>
      </header>
      {/* 0.6.27 : barre d'outils toujours affichée, même bibliothèque vide. */}
      <div className="library-tools">
        <button
          className="auto-associate-button"
          type="button"
          onClick={() => setAutoAssociateOpen(true)}
          title="Normaliser les couvertures et fiches via IGDB"
        >
          {icon('wand')}
          <span>Tout associer</span>
        </button>
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
        <LibraryViewBar
          profileId={profileId}
          medium="games"
          builtinViews={titledBuiltinViews(RATED_BUILTIN_VIEWS, 'games')}
          activeView={context.view}
          onViewChange={(view) => onContextChange({ ...context, view })}
          filterConfig={{
            ...GAME_FILTER_PANEL_CONFIG,
            mediumFilter: {
              label: 'Plateforme',
              options: [{ value: 'all', label: 'Toutes' }, ...platforms.map((platform) => ({ value: platform, label: platform }))],
            },
          }}
          mediumFilterValue={context.platform}
          onMediumFilterChange={(platform) => onContextChange({ ...context, platform })}
          extraFilters={context.extraFilters}
          onExtraFiltersChange={(extraFilters) => onContextChange({ ...context, extraFilters })}
          sortCapabilities={{ rating: true, year: true }}
          sortOverride={context.sortOverride}
          onSortOverrideChange={(sortOverride) => onContextChange({ ...context, sortOverride })}
          currentCriteria={{ sort: resolved.sort, mediumFilter: context.platform, filters: resolved.filters }}
        />
      </div>
      {collection.length === 0 && isUnfiltered ? (
        <div className="library-state empty-library">
          <p className="state-kicker">Collection personnelle</p>
          <h2>Votre bibliothèque Jeux est vide.</h2>
          <p>Ajoutez un premier jeu, avec un titre seulement si vous le souhaitez.</p>
          <button className="primary-button empty-action" type="button" onClick={onCreate}>Ajouter un jeu</button>
        </div>
      ) : (
        <>
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
              <button className="state-action" type="button" onClick={() => onContextChange({ query: '', platform: 'all', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}>
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
      <AutoAssociateEditsDialog
        open={autoAssociateOpen}
        onClose={() => setAutoAssociateOpen(false)}
        providerLabel="IGDB"
        pendingCount={collection.length}
        confirmText="Normaliser tous les jeux via IGDB ?"
        run={runGamesAssociation}
        onDone={onLibraryChanged}
      />
    </main>
  )
}

function ArtworkCard({ artwork, onOpen }: { artwork: Artwork; onOpen: () => void }) {
  const attribution = [ARTWORK_FORM_LABELS[artwork.form], artwork.artist, artwork.year]
    .filter((value) => value !== null)
    .join(' · ')

  return (
    <button className="film-card artwork-card" type="button" onClick={onOpen} aria-label={`Ouvrir la fiche de ${artwork.title}`}>
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
  context: ArtworkLibraryContext
  searchState: ArtworkSearchState
  onContextChange: (context: ArtworkLibraryContext) => void
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
  const isUnfiltered = context.query.trim() === '' && context.form === 'all' && context.view.id === UNRATED_BUILTIN_VIEWS[0].id && !hasActiveFilters(context.extraFilters) && context.sortOverride === null
  const resolved = resolveLibraryQuery(context.view, context.extraFilters, context.sortOverride)

  return (
    <main className="main library-main artwork-library-main" aria-label={`Bibliothèque Art du profil ${profileName}`}>
      <header className="library-header">
        <div>
          <p className="eyebrow">Collection personnelle</p>
          <h1 className="display-title">Art</h1>
          <p className="library-subtitle">{librarySubtitle(collection, 'œuvre', 'œuvres')}</p>
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
          <LibraryExportFlow kind="artworks" profileId={profileId} />
          <button className="primary-button" type="button" onClick={onCreate}>Ajouter une œuvre</button>
        </div>
      </header>
      {/* 0.6.27 : barre d'outils toujours affichée, même bibliothèque vide. */}
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
        <LibraryViewBar
          profileId={profileId}
          medium="artworks"
          builtinViews={titledBuiltinViews(UNRATED_BUILTIN_VIEWS, 'artworks')}
          activeView={context.view}
          onViewChange={(view) => onContextChange({ ...context, view })}
          filterConfig={ARTWORK_FILTER_PANEL_CONFIG}
          mediumFilterValue={context.form}
          onMediumFilterChange={(form) => onContextChange({ ...context, form: form as ArtworkSearchCriteria['form'] })}
          extraFilters={context.extraFilters}
          onExtraFiltersChange={(extraFilters) => onContextChange({ ...context, extraFilters })}
          sortCapabilities={{ rating: false, year: true }}
          sortOverride={context.sortOverride}
          onSortOverrideChange={(sortOverride) => onContextChange({ ...context, sortOverride })}
          currentCriteria={{ sort: resolved.sort, mediumFilter: context.form, filters: resolved.filters }}
        />
      </div>
      {collection.length === 0 && isUnfiltered ? (
        <div className="library-state empty-library">
          <p className="state-kicker">Collection personnelle</p>
          <h2>Votre bibliothèque Art est vide.</h2>
          <p>Ajoutez une première œuvre, avec un titre seulement si vous le souhaitez.</p>
          <button className="primary-button empty-action" type="button" onClick={onCreate}>Ajouter une œuvre</button>
        </div>
      ) : (
        <>
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
              <button className="state-action" type="button" onClick={() => onContextChange({ query: '', form: 'all', view: builtinViewById(UNRATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}>
                Afficher toutes les œuvres
              </button>
            </div>
          ) : (
            <div className="artwork-grid" aria-busy="false">
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
  context: BookLibraryContext
  searchState: BookSearchState
  onContextChange: (context: BookLibraryContext) => void
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
  const isUnfiltered = context.query.trim() === '' && context.category.length === ALL_BOOK_CATEGORIES.length && context.view.id === PROGRESS_BUILTIN_VIEWS[0].id && !hasActiveFilters(context.extraFilters) && context.sortOverride === null
  const resolved = resolveLibraryQuery(context.view, context.extraFilters, context.sortOverride)
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
          )
          await mediaRepository.setMediaProviderLink({ profileId, medium: 'books', mediaId: book.id, providerName: 'Open Library', providerId: presentation.workKey })
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
    <main className="main library-main" aria-label={`Bibliothèque Livres du profil ${profileName}`}>
      <header className="library-header">
        <div>
          <p className="eyebrow">Collection personnelle</p>
          <h1 className="display-title">Livres</h1>
          <p className="library-subtitle">{librarySubtitle(collection, 'livre', 'livres')}</p>
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
          <LibraryExportFlow kind="books" profileId={profileId} />
          <button className="primary-button" type="button" onClick={onCreate}>Ajouter un livre</button>
        </div>
      </header>
      {/* 0.6.27 : barre d'outils toujours affichée, même bibliothèque vide. */}
      <div className="library-tools">
        <button
          className="auto-associate-button"
          type="button"
          onClick={() => setAutoAssociateOpen(true)}
          title="Normaliser les couvertures et fiches via Open Library"
        >
          {icon('wand')}
          <span>Tout associer</span>
        </button>
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
        <BookCategorySwitch
          selected={context.category.length > 0 ? context.category : [...ALL_BOOK_CATEGORIES]}
          onSelectionChange={(selected) => onContextChange({ ...context, category: selected as BookCategory[] })}
        />
        <LibraryViewBar
          profileId={profileId}
          medium="books"
          builtinViews={titledBuiltinViews(PROGRESS_BUILTIN_VIEWS, 'books')}
          activeView={context.view}
          onViewChange={(view) => onContextChange({ ...context, view })}
          filterConfig={{ ...BOOK_FILTER_PANEL_CONFIG, mediumFilter: null }}
          mediumFilterValue="all"
          onMediumFilterChange={(stored) => {
            const selected = storedToCategories(stored)
            onContextChange({ ...context, category: (selected.length > 0 ? selected : [...ALL_BOOK_CATEGORIES]) as BookCategory[] })
          }}
          extraFilters={context.extraFilters}
          onExtraFiltersChange={(extraFilters) => onContextChange({ ...context, extraFilters })}
          sortCapabilities={{ rating: true, year: true }}
          sortOverride={context.sortOverride}
          onSortOverrideChange={(sortOverride) => onContextChange({ ...context, sortOverride })}
          currentCriteria={{ sort: resolved.sort, mediumFilter: categoriesToStored(context.category, ALL_BOOK_CATEGORIES), filters: resolved.filters }}
        />
      </div>
      {collection.length === 0 && isUnfiltered ? (
        <div className="library-state empty-library">
          <p className="state-kicker">Collection personnelle</p>
          <h2>Votre bibliothèque Livres est vide.</h2>
          <p>Ajoutez un premier livre, manga ou comics, avec un titre seulement si vous le souhaitez.</p>
          <button className="primary-button empty-action" type="button" onClick={onCreate}>Ajouter un livre</button>
        </div>
      ) : (
        <>
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
                onClick={() => onContextChange({ query: '', category: [...ALL_BOOK_CATEGORIES], view: builtinViewById(PROGRESS_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}
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
      <AutoAssociateEditsDialog
        open={autoAssociateOpen}
        onClose={() => setAutoAssociateOpen(false)}
        providerLabel="Open Library"
        pendingCount={collection.length}
        confirmText="Normaliser tous les livres via Open Library ?"
        run={runBooksAssociation}
        onDone={onLibraryChanged}
      />
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
  | { name: 'tmdb-associate'; filmId: string }
  | { name: 'detail'; filmId: string; returnTo: 'home' | 'library' }
  | { name: 'series-detail'; seriesId: string }
  | { name: 'books' }
  | { name: 'book-detail'; bookId: string }
  | { name: 'games' }
  | { name: 'game-detail'; gameId: string }
  | { name: 'artworks' }
  | { name: 'artwork-detail'; artworkId: string }

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
  detailRevision: string
  onBack: () => void
  backLabel: string
  onEdit: () => void
  onDelete: () => Promise<void>
  onAssociateTmdb: () => void
  tmdbNotice?: string | null
}

function SqliteFilmDetail({ profileId, filmId, detailRevision, onBack, backLabel, onEdit, onDelete, onAssociateTmdb, tmdbNotice }: SqliteFilmDetailProps) {
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
  }, [attempt, detailRevision, filmId, profileId])

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

/** Cible d'association directe depuis une fiche : même parcours que les films, en pop-up. */
type AssociateTarget =
  | { medium: 'série'; id: string }
  | { medium: 'livre'; id: string }
  | { medium: 'jeu'; id: string }

function App() {
  const { preference: themePreference, setPreference: setThemePreference } = useTheme()
  // Barre latérale : « rail » (icônes seules) ou « étendue » (icônes + libellés).
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [libraryState, setLibraryState] = useState<LibraryState>({ status: 'loading' })
  const [profiles, setProfiles] = useState<ProfileSummary[]>([])
  const [searchState, setSearchState] = useState<SearchState>({ status: 'loading' })
  const [libraryContext, setLibraryContext] = useState<LibraryContext>({ query: '', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
  const [seriesCollection, setSeriesCollection] = useState<Series[]>([])
  const [seriesSearchState, setSeriesSearchState] = useState<SeriesSearchState>({ status: 'loading' })
  const [seriesContext, setSeriesContext] = useState<SeriesLibraryContext>({ query: '', category: [...ALL_SERIES_CATEGORIES], view: builtinViewById(PROGRESS_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
  const [seriesSearchAttempt, setSeriesSearchAttempt] = useState(0)
  const [bookCollection, setBookCollection] = useState<Book[]>([])
  const [bookSearchState, setBookSearchState] = useState<BookSearchState>({ status: 'loading' })
  const [bookContext, setBookContext] = useState<BookLibraryContext>({ query: '', category: [...ALL_BOOK_CATEGORIES], view: builtinViewById(PROGRESS_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
  const [bookSearchAttempt, setBookSearchAttempt] = useState(0)
  const [gameCollection, setGameCollection] = useState<Game[]>([])
  const [gameSearchState, setGameSearchState] = useState<GameSearchState>({ status: 'loading' })
  const [gameContext, setGameContext] = useState<GameLibraryContext>({ query: '', platform: 'all', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
  const [gameSearchAttempt, setGameSearchAttempt] = useState(0)
  const [artworkCollection, setArtworkCollection] = useState<Artwork[]>([])
  const [artworkSearchState, setArtworkSearchState] = useState<ArtworkSearchState>({ status: 'loading' })
  const [artworkContext, setArtworkContext] = useState<ArtworkLibraryContext>({ query: '', form: 'all', view: builtinViewById(UNRATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
  const [artworkSearchAttempt, setArtworkSearchAttempt] = useState(0)
  const [view, setView] = useState<View>({ name: 'home' })
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('profiles')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [backupNotice, setBackupNotice] = useState<BackupNotice | null>(null)
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null)
  const [associatingFilm, setAssociatingFilm] = useState<Film | null>(null)
  /** Pop-up d'association directe depuis une fiche Série/Livre/Jeu (parcours des films). */
  const [associateTarget, setAssociateTarget] = useState<AssociateTarget | null>(null)
  /** Pop-up d'ajout : étapes recherche → formulaire, au-dessus de la bibliothèque.
      Cinq médiums, même parcours (0.6.10) ; l'Art, sans fournisseur, entre
      directement au stade formulaire. */
  type AddFlow =
    | { medium: 'film'; step: 'search'; initialValues?: FilmFormValues; provenance?: FilmMetadataProvenance | null; tmdbPresentation?: TmdbFilmPresentation; editFilmId?: string }
    | { medium: 'série'; step: 'search'; initialValues?: SeriesFormValues; providerLink?: MediaProviderReference | null; editSeriesId?: string }
    | { medium: 'livre'; step: 'search'; initialValues?: BookFormValues; providerLink?: MediaProviderReference | null; editBookId?: string }
    | { medium: 'jeu'; step: 'search'; initialValues?: GameFormValues; providerLink?: MediaProviderReference | null; editGameId?: string }
    | { medium: 'artwork'; step: 'form'; editArtworkId?: string }
  const [addFlow, setAddFlow] = useState<AddFlow | null>(null)
  const [candidateSelection, setCandidateSelection] = useState<{ pendingId: number | null; error: string | null }>({ pendingId: null, error: null })
  const [bookSelection, setBookSelection] = useState<{ pendingKey: string | null; error: string | null }>({ pendingKey: null, error: null })
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
      mediaRepository.searchSeries(libraryState.library.profile.id, { query: seriesContext.query, category: seriesContext.category, filters: resolved.filters, sort: resolved.sort }).then(
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
      const resolved = resolveLibraryQuery(bookContext.view, bookContext.extraFilters, bookContext.sortOverride)
      mediaRepository.searchBooks(libraryState.library.profile.id, { query: bookContext.query, category: bookContext.category, filters: resolved.filters, sort: resolved.sort }).then(
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
          initialValues: bookPresentationToInitialValues(presentation),
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

  // Même parcours direct pour les Jeux via RAWG (jalon 0.4.28), clé
  // embarquée côté backend, jamais exposée au frontend.
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
          initialValues: seriesPresentationToInitialValues(presentation),
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
      await mediaRepository.updateSeries(profileId, series.id, seriesWithPresentation(series, presentation))
      await mediaRepository.setMediaProviderLink({ profileId, medium: 'series', mediaId: series.id, providerName: 'TMDB', providerId: String(presentation.tmdbId) })
      const refreshed = await mediaRepository.getSeries(profileId, series.id)
      setSeriesCollection((current) => current.map((entry) => entry.id === series.id
        ? (refreshed ?? seriesWithPresentation(series, presentation))
        : entry))
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
      )
      await mediaRepository.setMediaProviderLink({ profileId, medium: 'books', mediaId: book.id, providerName: 'Open Library', providerId: presentation.workKey })
      const refreshed = await mediaRepository.getBook(profileId, book.id)
      setBookCollection((current) => sortBooks(current.map((entry) => entry.id === book.id
        ? (refreshed ?? bookWithPresentation(book, presentation))
        : entry)))
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
    content = (
      <main className="main home-main">
        <header className="home-heading">
          <div><p className="eyebrow">Bibliothèque locale</p><h1 className="display-title">Accueil</h1></div>
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
        onOpenSeries={(series) => leaveLibrary({ name: 'series-detail', seriesId: series.id })}
        onOpenBook={(book) => leaveLibrary({ name: 'book-detail', bookId: book.id })}
        onOpenGame={(game) => leaveLibrary({ name: 'game-detail', gameId: game.id })}
        onOpenArtwork={(artwork) => leaveLibrary({ name: 'artwork-detail', artworkId: artwork.id })}
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
                message: 'Le film a bien été créé, mais TMDB n’a pas pu être associé. La fiche reste intacte ; tu peux relancer l’association depuis cette page.',
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
          setLibraryContext({ query: '', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setSeriesContext({ query: '', category: [...ALL_SERIES_CATEGORIES], view: builtinViewById(PROGRESS_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setBookContext({ query: '', category: [...ALL_BOOK_CATEGORIES], view: builtinViewById(PROGRESS_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setGameContext({ query: '', platform: 'all', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setArtworkContext({ query: '', form: 'all', view: builtinViewById(UNRATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setLibraryState({ status: 'ready', library: selectedLibrary })
        }}
        onImported={(importedLibrary) => {
          setLibraryContext({ query: '', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
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
        detailRevision={library.films.find((entry) => entry.id === view.filmId)?.updatedAt ?? ''}
        onBack={() => view.returnTo === 'home' ? leaveLibrary({ name: 'home' }) : returnToLibrary()}
        backLabel={view.returnTo === 'home' ? '← Retour à l’accueil' : '← Retour aux films'}
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
  } else if (view.name === 'series') {
    content = (
      <SeriesLibrary
        profileName={libraryState.library.profile.name}
        collection={seriesCollection}
        context={seriesContext}
        searchState={seriesSearchState}
        onContextChange={setSeriesContext}
        onRetrySearch={() => setSeriesSearchAttempt((attempt) => attempt + 1)}
        onCreate={() => {
          setCandidateSelection({ pendingId: null, error: null })
          setAddFlow({ medium: 'série', step: 'search' })
        }}
        onOpen={(series) => leaveLibrary({ name: 'series-detail', seriesId: series.id })}
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
          onEdit={async () => {
            const series = seriesCollection.find((entry) => entry.id === view.seriesId)
            if (series) {
              // 0.6.18 : Modifier rouvre la pop-up, préremplie.
              const providerLink = await mediaRepository.getMediaProviderLink(library.profile.id, 'series', series.id)
              setAddFlow({ medium: 'série', step: 'search', initialValues: seriesToFormValues(series), providerLink, editSeriesId: series.id })
            }
          }}
          onAssociate={() => {
            setCandidateSelection({ pendingId: null, error: null })
            setAssociateTarget({ medium: 'série', id: view.seriesId })
          }}
          onPosterEdit={async (url: string | null) => {
            await mediaRepository.updateSeries(library.profile.id, series.id, { ...series, posterUrl: url })
            setSeriesCollection((current) => current.map((entry) => (entry.id === series.id ? { ...series, posterUrl: url } : entry)))
          }}
          onDelete={async () => {
            await mediaRepository.deleteSeries(library.profile.id, view.seriesId)
            setSeriesCollection((current) => current.filter((entry) => entry.id !== view.seriesId))
            requestAutomaticBackup(library)
            setView({ name: 'series' })
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
        onCreate={() => {
          setBookSelection({ pendingKey: null, error: null })
          setAddFlow({ medium: 'livre', step: 'search' })
        }}
        onOpen={(book) => leaveLibrary({ name: 'book-detail', bookId: book.id })}
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
          backLabel="← Retour aux livres"
          onEdit={async () => {
            const book = bookCollection.find((entry) => entry.id === view.bookId)
            if (book) {
              // 0.6.18 : Modifier rouvre la pop-up, préremplie.
              const providerLink = await mediaRepository.getMediaProviderLink(library.profile.id, 'books', book.id)
              setAddFlow({ medium: 'livre', step: 'search', initialValues: bookToFormValues(book), providerLink, editBookId: book.id })
            }
          }}
          onAssociate={() => {
            setBookSelection({ pendingKey: null, error: null })
            setAssociateTarget({ medium: 'livre', id: view.bookId })
          }}
          onCoverEdit={async (url: string | null) => {
            await mediaRepository.updateBook(library.profile.id, book.id, { ...book, coverUrl: url })
            setBookCollection((current) => current.map((entry) => (entry.id === book.id ? { ...book, coverUrl: url } : entry)))
          }}
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
        onOpen={(game) => leaveLibrary({ name: 'game-detail', gameId: game.id })}
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
          backLabel="← Retour aux jeux"
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
        onOpen={(artwork) => leaveLibrary({ name: 'artwork-detail', artworkId: artwork.id })}
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
          backLabel="← Retour aux œuvres"
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
      <Sidebar
        expanded={sidebarExpanded}
        onToggleExpanded={() => setSidebarExpanded((value) => !value)}
        count={count}
        seriesCount={seriesCount}
        bookCount={bookCount}
        gameCount={gameCount}
        artworkCount={artworkCount}
        currentProfileName={libraryState.status === 'ready' ? libraryState.library.profile.name : null}
        currentProfileAvatar={libraryState.status === 'ready'
          ? profiles.find((profile) => profile.id === libraryState.library.profile.id)?.avatarDataUrl ?? null
          : null}
        activeItem={
          libraryState.status !== 'ready' || view.name === 'home'
            ? 'home'
            : view.name === 'settings'
              ? 'settings'
              : view.name === 'series' || view.name === 'series-detail'
                ? 'series'
                : view.name === 'books' || view.name === 'book-detail'
                  ? 'books'
                  : view.name === 'games' || view.name === 'game-detail'
                    ? 'games'
                    : view.name === 'artworks' || view.name === 'artwork-detail'
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
          <div
            className="editor-dialog dialog-add-flow"
            role="dialog"
            aria-modal="true"
            aria-label={{
              film: 'Ajouter un film',
              série: 'Ajouter une série',
              livre: 'Ajouter un livre',
              jeu: 'Ajouter un jeu',
              artwork: 'Ajouter une œuvre',
            }[addFlow.medium]}
          >
            <button className="poster-dialog-close editor-dialog-close" type="button" onClick={() => setAddFlow(null)} aria-label="Fermer">×</button>
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
                  onPosterEdit={async (url) => {
                    if (!editFilmId) return
                    const updated = await setFilmTmdbPoster(editFilmId, url)
                    const library = libraryState.library
                    const updatedLibrary: FilmLibrary = {
                      ...library,
                      films: sortFilms(library.films.map((entry) => entry.id === editFilmId ? { ...entry, posterUrl: updated.selectedPosterUrl ?? updated.presentation.posterUrl ?? entry.posterUrl } : entry)),
                    }
                    setLibraryState({ status: 'ready', library: updatedLibrary })
                  }}
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
                pendingCandidateId={candidateSelection.pendingId}
                selectionError={candidateSelection.error}
                onSelectCandidate={selectTmdbSeriesCandidate}
                onManual={() => setAddFlow({ medium: 'série', step: 'search', initialValues: {} as never })}
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
                  initialValues={initialValues}
                  providerLink={addFlow.providerLink ?? null}
                  onCancel={() => setAddFlow(null)}
                  onSave={async (input: SeriesWriteInput) => {
                    const library = libraryState.library
                    let targetId = editSeriesId
                    if (editSeriesId) {
                      await mediaRepository.updateSeries(library.profile.id, editSeriesId, input)
                      const refreshed = await mediaRepository.getSeries(library.profile.id, editSeriesId)
                      if (!refreshed) throw new Error('La série enregistrée ne peut pas être relue depuis SQLite.')
                      setSeriesCollection((current) => current.map((entry) => entry.id === editSeriesId ? refreshed : entry))
                    } else {
                      const series = await mediaRepository.createSeries(library.profile.id, input)
                      targetId = series.id
                      if (addFlow.providerLink) {
                        await mediaRepository.setMediaProviderLink({
                          profileId: library.profile.id,
                          medium: 'series',
                          mediaId: series.id,
                          ...addFlow.providerLink,
                        })
                      }
                      setSeriesCollection((current) => [...current, series])
                    }
                    requestAutomaticBackup(library)
                    setAddFlow(null)
                    leaveLibrary({ name: 'series-detail', seriesId: targetId! })
                    window.scrollTo({ top: 0 })
                  }}
                />
              )
            })()}
            {addFlow.medium === 'livre' && !addFlow.initialValues && (
              <BookOpenLibrarySearchFlow
                compact
                pendingCandidateKey={bookSelection.pendingKey}
                selectionError={bookSelection.error}
                onSelectCandidate={selectOpenLibraryBookCandidate}
                onManual={() => setAddFlow({ medium: 'livre', step: 'search', initialValues: {} as never })}
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
                  initialValues={initialValues}
                  providerLink={addFlow.providerLink ?? null}
                  onCancel={() => setAddFlow(null)}
                  onSave={async (input: BookWriteInput) => {
                    const library = libraryState.library
                    const { quotes, ...bookInput } = input
                    let targetId = editBookId
                    if (editBookId) {
                      await mediaRepository.updateBook(library.profile.id, editBookId, bookInput, quotes)
                      const refreshed = await mediaRepository.getBook(library.profile.id, editBookId)
                      if (!refreshed) throw new Error('Le livre enregistré ne peut pas être relu depuis SQLite.')
                      setBookCollection((current) => sortBooks(current.map((entry) => entry.id === editBookId ? refreshed : entry)))
                    } else {
                      const book = await mediaRepository.createBook(library.profile.id, bookInput, quotes)
                      targetId = book.id
                      if (addFlow.providerLink) {
                        await mediaRepository.setMediaProviderLink({
                          profileId: library.profile.id,
                          medium: 'books',
                          mediaId: book.id,
                          ...addFlow.providerLink,
                        })
                      }
                      setBookCollection((current) => sortBooks([...current, book]))
                    }
                    setBookSearchAttempt((attempt) => attempt + 1)
                    requestAutomaticBackup(library)
                    setAddFlow(null)
                    leaveLibrary({ name: 'book-detail', bookId: targetId! })
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
                    leaveLibrary({ name: 'game-detail', gameId: targetId! })
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
                    if (editArtworkId) {
                      await mediaRepository.updateArtwork(library.profile.id, editArtworkId, input)
                      const refreshed = await mediaRepository.getArtwork(library.profile.id, editArtworkId)
                      if (!refreshed) throw new Error('L’œuvre enregistrée ne peut pas être relue depuis SQLite.')
                      setArtworkCollection((current) => sortArtworks(current.map((entry) => entry.id === editArtworkId ? refreshed : entry)))
                    } else {
                      const artwork = await mediaRepository.createArtwork(library.profile.id, input)
                      setArtworkCollection((current) => sortArtworks([...current, artwork]))
                    }
                    setArtworkSearchAttempt((attempt) => attempt + 1)
                    requestAutomaticBackup(library)
                    setAddFlow(null)
                    leaveLibrary({ name: 'artwork-detail', artworkId: editArtworkId ?? '' })
                    window.scrollTo({ top: 0 })
                  }}
                />
              )
            })()}
          </div>
        </div>
      )}
      {associateTarget && libraryState.status === 'ready' && (
        <div className="dialog-backdrop-blur" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setAssociateTarget(null) }}>
          <div
            className="editor-dialog dialog-associate"
            role="dialog"
            aria-modal="true"
            aria-label="Modifier l’association"
          >
            <button className="poster-dialog-close editor-dialog-close" type="button" onClick={() => setAssociateTarget(null)} aria-label="Fermer">×</button>
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
          </div>
        </div>
      )}
      {backupNotice && (
        <div className={`backup-notice ${backupNotice.kind}`} role={backupNotice.kind === 'error' ? 'alert' : 'status'} aria-atomic="true">
          <p>{backupNotice.message}</p>
          <button type="button" onClick={() => setBackupNotice(null)} aria-label="Fermer le message de sauvegarde">Fermer</button>
        </div>
      )}
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
root.render(<App />)
