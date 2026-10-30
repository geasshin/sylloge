import { StrictMode, useMemo, useState } from 'react'
import './qaLanguage.ts'
import { createRoot } from 'react-dom/client'
import { Home } from '../components/AtriumHome.tsx'
import { MobileAppShell } from '../components/MobileAppShell.tsx'
import { LibraryViewBar } from '../components/LibraryViewBar.tsx'
import { savedViewsRepository } from './qaSavedViewsRepository.ts'
import type { LibraryFilterConfig } from '../components/LibraryViewBar.tsx'
import { Poster } from '../components/Poster.tsx'
import { HomeIcon } from '../components/icons.tsx'
import { EMPTY_LIBRARY_FILTERS, type LibraryFilters } from '../domain/libraryFilters.ts'
import {
  PROGRESS_BUILTIN_VIEWS,
  RATED_BUILTIN_VIEWS,
  UNRATED_BUILTIN_VIEWS,
  defaultBuiltinViewForMedium,
  titledBuiltinViews,
  type LibrarySort,
  type LibraryViewDefinition,
} from '../domain/libraryViews.ts'
import type { SavedViewCriteria, SavedViewMedium } from '../domain/savedViews.ts'
import type { FilmLibrary } from '../data/filmsRepository.ts'
import type { Film } from '../domain/film.ts'
import type { Series } from '../domain/series.ts'
import type { Book } from '../domain/book.ts'
import type { Game } from '../domain/game.ts'
import type { Artwork } from '../domain/artwork.ts'
import '../styles.css'

const qaScrollStyle = document.createElement('style')
qaScrollStyle.textContent = `
  .qa-library { height: 100vh; overflow-y: auto; overflow-x: hidden; padding: 40px; scrollbar-gutter: stable; }
  .integration-qa-scroll-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 34px 19px; margin-top: 30px; align-items: start; }
`
document.head.appendChild(qaScrollStyle)

const profileId = 'qa-profile'
const now = '2026-09-23T12:00:00.000Z'
const timestamp = (day: string) => `${day}T12:00:00.000Z`

/**
 * Recette : une seule fiche porte une affiche fournie par le résolveur, pour
 * prouver que la carte d'accueil relit la même source que la bibliothèque.
 * Toutes les autres gardent le fallback neutre.
 */
const qaResolvedPoster = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#3E4B70"/><text x="150" y="232" font-family="sans-serif" font-size="26" fill="#ffffff" text-anchor="middle">Affiche du cache</text></svg>',
)}`
const resolveQaFilmPoster = async (filmId: string) => (filmId === 'film-1' ? qaResolvedPoster : null)
const resolveQaFilmContributor = async (filmId: string) => (filmId === 'film-3' ? 'Réalisation depuis le cache local' : null)

const films: Film[] = [
  {
    id: 'film-1', profileId, title: 'Le.Extension, la plus longue', originalTitle: null, year: 2024,
    status: 'à découvrir', isFavorite: true, rating: 5, watchedAt: null, personalNote: 'Un avis assez long pour vérifier la respiration de la fiche et la composition éditoriale de l’accueil.',
    director: 'Ariane Rivière', summary: 'Un film de recette.', providerName: null, providerId: null,
    posterUrl: null, bannerUrl: null, createdAt: timestamp('2026-09-22'), updatedAt: timestamp('2026-09-22'),
  },
  {
    id: 'film-2', profileId, title: ' memories of a long afternoon ', originalTitle: null, year: 1999,
    status: 'terminé', isFavorite: false, rating: 4, watchedAt: '2025-09-23', personalNote: 'Une mémoire douce, conservée.',
    director: 'Mina Kore', summary: 'Un second film.', providerName: null, providerId: null,
    posterUrl: null, bannerUrl: null, createdAt: timestamp('2026-01-10'), updatedAt: timestamp('2026-09-23'),
  },
  {
    id: 'film-3', profileId, title: 'Les Heures', originalTitle: null, year: 1986,
    status: 'abandonné', isFavorite: false, rating: null, watchedAt: '2024-09-23', personalNote: null,
    director: null, summary: null, providerName: null, providerId: null,
    posterUrl: null, bannerUrl: null, createdAt: timestamp('2025-09-23'), updatedAt: timestamp('2026-02-01'),
  },
  {
    id: 'film-4', profileId, title: 'Rien à signaler', originalTitle: null, year: 2001,
    status: 'à découvrir', isFavorite: false, rating: null, watchedAt: null, personalNote: null,
    director: null, summary: null, providerName: null, providerId: null,
    posterUrl: null, bannerUrl: null, createdAt: timestamp('2026-09-20'), updatedAt: timestamp('2026-09-20'),
  },
  {
    id: 'film-5', profileId, title: 'Une œuvre en attente', originalTitle: null, year: 2012,
    status: 'en attente', isFavorite: false, rating: null, watchedAt: null, personalNote: null,
    director: null, summary: null, providerName: null, providerId: null,
    posterUrl: null, bannerUrl: null, createdAt: timestamp('2026-09-19'), updatedAt: timestamp('2026-09-19'),
  },
]

const filmsForScrollQa: Film[] = [
  ...films,
  ...Array.from({ length: 10 }, (_, index) => {
    const source = films[index % films.length]
    return { ...source, id: `${source.id}-scroll-${index + 1}`, title: `${source.title} ${index + 1}` }
  }),
]

const series: Series[] = [
  {
    id: 'series-1', profileId, title: 'Le Bureau des Légendes', showrunner: 'Eric Kandel', casting: 'Dagane, Caroline Proust',
    summary: 'Une série à reprendre.', category: 'série télé', status: 'en cours', rating: 5, isFavorite: true,
    seasonsSeen: 3, seasonsTotal: 5, progressUpdatedAt: timestamp('2026-09-23'), startedAt: '2024-01-10',
    posterUrl: null, bannerUrl: null, firstAirYear: 2015, lastAirYear: 2020, personalNote: 'Une saison à reprendre avec calme.', createdAt: timestamp('2024-01-10'), updatedAt: timestamp('2026-09-23'),
  },
  {
    id: 'series-2', profileId, title: 'Dark', showrunner: 'Baran bo Odar', casting: null, summary: null,
    category: 'série télé', status: 'à voir', rating: null, isFavorite: false,
    seasonsSeen: null, seasonsTotal: 3, progressUpdatedAt: null, startedAt: null,
    posterUrl: null, bannerUrl: null, firstAirYear: 2017, lastAirYear: 2020, personalNote: null, createdAt: timestamp('2026-10-03'), updatedAt: timestamp('2026-10-03'),
  },
]

const books: Book[] = [
  {
    id: 'book-1', profileId, title: 'A game of Thrones', author: 'George R. R. Martin', year: 1996, summary: 'Un livre en cours.',
    category: 'livre', status: 'en cours', rating: 4, isFavorite: true, volumesRead: 2, volumesTotal: 5,
    progressUpdatedAt: timestamp('2026-09-22'), startedAt: '2026-01-01', coverUrl: null,
    personalNote: 'La progression doit rester visible dans Reprendre.', createdAt: timestamp('2026-01-01'), updatedAt: timestamp('2026-09-22'), quotes: [],
  },
  {
    id: 'book-2', profileId, title: 'Dune', author: 'Frank Herbert', year: 1965, summary: null,
    category: 'livre', status: 'à lire', rating: null, isFavorite: false, volumesRead: null, volumesTotal: null,
    progressUpdatedAt: null, startedAt: null, coverUrl: null, personalNote: null,
    createdAt: timestamp('2026-10-05'), updatedAt: timestamp('2026-10-05'), quotes: [],
  },
]

const games: Game[] = [
  {
    id: 'game-1', profileId, title: 'Hades', developer: 'Supergiant Games', platform: 'PC', year: 2020, status: 'joué',
    rating: 5, isFavorite: true, playedAt: '2025-09-23', coverUrl: null, bannerUrl: null, personalNote: 'Toujours excellent.',
    createdAt: timestamp('2020-09-17'), updatedAt: timestamp('2025-09-23'),
  },
  {
    id: 'game-2', profileId, title: 'Celeste', developer: 'Non', platform: 'PC', year: 2018, status: 'à jouer',
    rating: null, isFavorite: false, playedAt: null, coverUrl: null, bannerUrl: null, personalNote: null,
    createdAt: timestamp('2026-10-06'), updatedAt: timestamp('2026-10-06'),
  },
]

const artworks: Artwork[] = [
  {
    id: 'art-1', profileId, title: 'Nuit vacation', artist: 'Anonyme', year: 1890, form: 'peinture', location: 'Paris',
    exhibition: null, status: 'découverte', isFavorite: true, discoveredAt: '2021-09-23', imageUrl: null,
    personalNote: 'Une œuvre sans visuel.', customFields: [], details: {}, createdAt: timestamp('2021-09-23'), updatedAt: timestamp('2021-09-23'),
  },
  {
    id: 'art-2', profileId, title: 'Le Jardin des délices', artist: 'Jérôme Bosch', year: 1490, form: 'peinture', location: null,
    exhibition: null, status: 'à découvrir', isFavorite: false, discoveredAt: null, imageUrl: null,
    personalNote: null, customFields: [], details: {}, createdAt: timestamp('2026-10-07'), updatedAt: timestamp('2026-10-07'),
  },
]

const library: FilmLibrary = {
  profile: { id: profileId, name: 'Profil de recette', createdAt: now, updatedAt: now },
  films,
}

type MediumCase = {
  key: SavedViewMedium
  label: string
  title: string
  views: readonly LibraryViewDefinition[]
  renderCards: () => React.ReactNode
}

const cardGridClass = 'film-grid'

const cases: MediumCase[] = [
  { key: 'films', label: 'Films', title: 'Films', views: titledBuiltinViews(RATED_BUILTIN_VIEWS, 'films'), renderCards: () => filmsForScrollQa.map((film) => <Poster key={film.id} title={film.title} src={film.posterUrl} />) },
  { key: 'series', label: 'Séries', title: 'Séries', views: titledBuiltinViews(PROGRESS_BUILTIN_VIEWS, 'series'), renderCards: () => series.map((entry) => <Poster key={entry.id} title={entry.title} src={entry.posterUrl} />) },
  { key: 'books', label: 'Livres', title: 'Livres', views: titledBuiltinViews(PROGRESS_BUILTIN_VIEWS, 'books'), renderCards: () => books.map((entry) => <Poster key={entry.id} title={entry.title} src={entry.coverUrl} label="Couverture" />) },
  { key: 'games', label: 'Jeux', title: 'Jeux', views: titledBuiltinViews(RATED_BUILTIN_VIEWS, 'games'), renderCards: () => games.map((entry) => <Poster key={entry.id} title={entry.title} src={entry.coverUrl} label="Couverture" />) },
  { key: 'artworks', label: 'Art', title: 'Art', views: titledBuiltinViews(UNRATED_BUILTIN_VIEWS, 'artworks'), renderCards: () => artworks.map((entry) => <Poster key={entry.id} title={entry.title} src={entry.imageUrl} label="Visuel" />) },
]

const filterConfigs: Record<SavedViewMedium, LibraryFilterConfig> = {
  films: { mediumFilter: null, statusOptions: [{ value: 'en attente', label: 'En attente' }], showRating: true, showYear: true, personalDateLabel: 'Visionnage', specificTextField: { label: 'Réalisation', placeholder: 'Nom' }, showLocation: false, showExhibition: false },
  series: { mediumFilter: { label: 'Catégorie', options: [{ value: 'all', label: 'Toutes' }] }, statusOptions: [{ value: 'en cours', label: 'En cours' }], showRating: true, showYear: false, personalDateLabel: 'Visionnage', specificTextField: { label: 'Showrunner', placeholder: 'Nom' }, showLocation: false, showExhibition: false },
  books: { mediumFilter: { label: 'Catégorie', options: [{ value: 'all', label: 'Tous' }] }, statusOptions: [{ value: 'en cours', label: 'En cours' }], showRating: true, showYear: true, personalDateLabel: 'Lecture', specificTextField: { label: 'Auteur', placeholder: 'Nom' }, showLocation: false, showExhibition: false },
  games: { mediumFilter: { label: 'Plateforme', options: [{ value: 'all', label: 'Toutes' }] }, statusOptions: [{ value: 'joué', label: 'Joué' }], showRating: true, showYear: true, personalDateLabel: 'Jeu', specificTextField: { label: 'Studio', placeholder: 'Nom' }, showLocation: false, showExhibition: false },
  artworks: { mediumFilter: { label: 'Forme', options: [{ value: 'all', label: 'Toutes' }] }, statusOptions: [], showRating: false, showYear: true, personalDateLabel: 'Découverte', specificTextField: { label: 'Artiste', placeholder: 'Nom' }, showLocation: true, showExhibition: true },
}

function MediumCaseView({ item }: { item: MediumCase }) {
  const opening = useMemo(() => defaultBuiltinViewForMedium(item.views, item.key), [item])
  const [view, setView] = useState(opening)
  const [filters, setFilters] = useState<LibraryFilters>({ ...EMPTY_LIBRARY_FILTERS })
  const [sort, setSort] = useState<LibrarySort | null>(null)
  const criteria: SavedViewCriteria = { filters, sort: sort ?? view.sort, mediumFilter: 'all' }

  return (
    <section className="qa-library" data-medium={item.key}>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Bibliothèque locale</p>
          <h1>{item.title}</h1>
          <p className="page-subtitle">1 œuvre · 1 coup de cœur</p>
        </div>
        <button className="primary-button" type="button">Ajouter</button>
      </header>
      <LibraryViewBar
        profileId={profileId}
        medium={item.key}
        savedViewsRepository={savedViewsRepository}
        builtinViews={item.views}
        activeView={view}
        onViewChange={setView}
        filterConfig={filterConfigs[item.key]}
        mediumFilterValue="all"
        onMediumFilterChange={() => undefined}
        extraFilters={filters}
        onExtraFiltersChange={setFilters}
        sortCapabilities={{ rating: item.key !== 'artworks', year: item.key !== 'series' }}
        sortOverride={sort}
        onSortOverrideChange={setSort}
        currentCriteria={criteria}
      />
      <div className={cardGridClass}>{item.renderCards()}</div>
    </section>
  )
}

function Harness() {
  const [screen, setScreen] = useState<'home' | 'empty' | SavedViewMedium>('home')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useMemo(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <StrictMode>
      <div className="app integration-qa-shell">
        <MobileAppShell
          activeItem={screen === 'home' ? 'home' : screen === 'empty' ? 'home' : screen === 'films' ? 'library' : screen}
          onHome={() => setScreen('home')}
          onLibrary={() => setScreen('films')}
          onSeries={() => setScreen('series')}
          onAnime={() => setScreen('series')}
          onBooks={() => setScreen('books')}
          onMangas={() => setScreen('books')}
          onGames={() => setScreen('games')}
          onArtworks={() => setScreen('artworks')}
          onSettings={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          currentProfileName={library.profile.name}
          currentProfileAvatar={null}
        />
        <aside className="sidebar sidebar-expanded">
          <nav aria-label="Navigation principale">
            {(['home', 'films', 'series', 'books', 'games', 'artworks'] as const).map((item) => (
              <button key={item} data-qa-screen={item} className={`nav-item sidebar-home-item ${screen === item ? 'active' : ''}`} type="button" aria-label={item === 'home' ? 'Accueil' : cases.find((entry) => entry.key === item)?.label} onClick={() => setScreen(item)}>
                <span className="nav-item-text">{item === 'home' ? <><HomeIcon size={18} /> Accueil</> : <>{cases.find((entry) => entry.key === item)?.label}</>}</span>
              </button>
            ))}
          </nav>
          <button className="sidebar-settings-link" type="button" aria-label={`Thème ${theme === 'light' ? 'clair' : 'sombre'}`} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}><span className="nav-item-text">Thème {theme === 'light' ? 'clair' : 'sombre'}</span></button>
        </aside>
        {screen === 'home' && (
        <Home
            library={{ ...library, films: filmsForScrollQa }}
            seriesCollection={series}
            bookCollection={books}
            gameCollection={games}
            artworkCollection={artworks}
            onOpen={() => undefined}
            onOpenSeries={() => undefined}
            onOpenBook={() => undefined}
            onOpenGame={() => undefined}
            onOpenArtwork={() => undefined}
            resolveFilmPoster={resolveQaFilmPoster}
            resolveFilmContributor={resolveQaFilmContributor}
          />
        )}
        {screen === 'empty' && <Home library={{ ...library, films: [] }} seriesCollection={[]} bookCollection={[]} gameCollection={[]} artworkCollection={[]} onOpen={() => undefined} onOpenSeries={() => undefined} onOpenBook={() => undefined} onOpenGame={() => undefined} onOpenArtwork={() => undefined} />}
        {cases.filter((item) => item.key === screen).map((item) => <MediumCaseView key={item.key} item={item} />)}
      </div>
    </StrictMode>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('RACINE_MANQUANTE')
createRoot(root).render(<Harness />)
