import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  detailHash,
  filmFilters,
  films,
  filterFilms,
  filterSeries,
  libraryHash,
  routeFromHash,
  series,
  seriesFilters,
  type Film,
  type FilmFilter,
  type Page,
  type Series,
  type SeriesFilter,
} from './catalog'
import './styles.css'

const recentFilms = films.filter((film) => film.watchedAt).slice(0, 4)
const icon = (name: string) => <span className={`icon icon-${name}`} aria-hidden="true" />

function FilmCover({ film, large = false }: { film: Film; large?: boolean }) {
  return (
    <div className={`cover film-cover cover-${film.palette} ${large ? 'cover-large' : ''} ${film.cover ? 'cover-text' : ''}`}>
      <span className="cover-grain" />
      <span className="cover-mark">{film.mark}</span>
      <span className="cover-title">{film.title}</span>
      <span className="cover-year">{film.year}</span>
    </div>
  )
}

function SeriesCover({ show, large = false }: { show: Series; large?: boolean }) {
  return (
    <div className={`cover series-cover series-${show.palette} ${large ? 'cover-large' : ''}`}>
      <span className="series-frame" />
      <span className="series-kind">Série</span>
      <span className="series-mark">{show.mark}</span>
      <span className="cover-title">{show.title}</span>
      <span className="cover-year">{show.years}</span>
    </div>
  )
}

type SidebarProps = {
  page: Page
  goHome: () => void
  goFilms: () => void
  goSeries: () => void
}

function Sidebar({ page, goHome, goFilms, goSeries }: SidebarProps) {
  return (
    <aside className="sidebar">
      <button className="wordmark" onClick={goHome} aria-label="Retour à l’accueil">
        <span className="wordmark-mark">B</span>
        <span>Bibliothèque</span>
      </button>
      <nav aria-label="Navigation principale">
        <button className={page === 'home' ? 'nav-item active' : 'nav-item'} onClick={goHome} aria-current={page === 'home' ? 'page' : undefined}>{icon('home')} Accueil</button>
        <p className="nav-label">Collection</p>
        <button className={page === 'films' ? 'nav-item active' : 'nav-item'} onClick={goFilms} aria-current={page === 'films' ? 'page' : undefined}>{icon('film')} Films <span className="nav-count">{films.length}</span></button>
        <button className={page === 'series' ? 'nav-item active' : 'nav-item'} onClick={goSeries} aria-current={page === 'series' ? 'page' : undefined}>{icon('tv')} Séries <span className="nav-count">{series.length}</span></button>
        <button className="nav-item muted" type="button" disabled>{icon('book')} Livres</button>
        <button className="nav-item muted" type="button" disabled>{icon('game')} Jeux</button>
        <button className="nav-item muted" type="button" disabled>{icon('art')} Art</button>
      </nav>
      <div className="sidebar-bottom">
        <button className="nav-item muted" type="button" disabled>{icon('search')} Rechercher</button>
        <button className="nav-item muted" type="button" disabled>{icon('more')} Plus</button>
      </div>
    </aside>
  )
}

function MiniFilmCard({ film, onOpen }: { film: Film; onOpen: () => void }) {
  return (
    <button className="mini-card" onClick={onOpen} aria-label={`Ouvrir la fiche de ${film.title}`}>
      <FilmCover film={film} />
      <span className="mini-info"><b>{film.title}</b><small>{film.watchedAt}</small></span>
    </button>
  )
}

type HomeProps = {
  onOpenFilm: (film: Film) => void
  onOpenSeries: (show: Series) => void
  goFilms: () => void
}

function Home({ onOpenFilm, onOpenSeries, goFilms }: HomeProps) {
  const ongoing = series.find((show) => show.id === 'the-bear')!
  return (
    <main className="main home-main">
      <header className="home-header">
        <p className="eyebrow">Vendredi 17 juillet</p>
        <h1 className="display-title">Quelques traces,<br /><em>pour y revenir.</em></h1>
        <p className="lede">Une bibliothèque personnelle de ce qui a compté, de ce qui attend encore.</p>
      </header>

      <section className="home-section">
        <div className="section-heading">
          <div><p className="eyebrow">Ces dernières semaines</p><h2 className="display-title">Récemment vécu</h2></div>
          <button className="quiet-button" onClick={goFilms}>Voir les films <span>↗</span></button>
        </div>
        <div className="recent-grid">
          {recentFilms.map((film) => <MiniFilmCard key={film.id} film={film} onOpen={() => onOpenFilm(film)} />)}
        </div>
      </section>

      <section className="in-progress">
        <div className="in-progress-copy">
          <p className="eyebrow">À poursuivre · Série</p>
          <h2>{ongoing.title}</h2>
          <p>{ongoing.creator} · {ongoing.seasonsSeen} saisons vues</p>
          <p className="note-preview">{ongoing.summary}</p>
          <button className="text-link" onClick={() => onOpenSeries(ongoing)}>Ouvrir la fiche <span>→</span></button>
        </div>
        <button className="featured-cover" onClick={() => onOpenSeries(ongoing)} aria-label={`Ouvrir la fiche de ${ongoing.title}`}>
          <SeriesCover show={ongoing} />
        </button>
      </section>
    </main>
  )
}

type LibraryToolsProps<T extends string> = {
  query: string
  setQuery: (query: string) => void
  filter: T
  setFilter: (filter: T) => void
  filters: readonly T[]
  placeholder: string
  label: string
}

function LibraryTools<T extends string>({ query, setQuery, filter, setFilter, filters, placeholder, label }: LibraryToolsProps<T>) {
  return (
    <div className="library-tools">
      <label className="search">
        <span aria-hidden="true">⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} aria-label={label} />
      </label>
      <div className="filters" aria-label="Filtres">
        {filters.map((name) => <button key={name} className={filter === name ? 'filter active' : 'filter'} onClick={() => setFilter(name)} aria-pressed={filter === name}>{name}</button>)}
      </div>
    </div>
  )
}

function CollectionMeta({ count, singular, plural, filter }: { count: number; singular: string; plural: string; filter: string }) {
  return (
    <div className="collection-meta">
      <p aria-live="polite">{count} {count > 1 ? plural : singular} {filter !== 'Tout' ? `· ${filter.toLocaleLowerCase('fr')}` : ''}</p>
      <button type="button">Trier par ajout <span>⌄</span></button>
    </div>
  )
}

function FilmsLibrary({ onOpen }: { onOpen: (film: Film) => void }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilmFilter>('Tout')
  const results = useMemo(() => filterFilms(films, query, filter), [query, filter])
  return (
    <main className="main library-main">
      <header className="library-header">
        <div><p className="eyebrow">Collection personnelle</p><h1 className="display-title">Films</h1></div>
        <button className="add-button" type="button">Ajouter un film <span>+</span></button>
      </header>
      <LibraryTools query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} filters={filmFilters} placeholder="Rechercher un titre, un réalisateur…" label="Rechercher un film" />
      <CollectionMeta count={results.length} singular="film" plural="films" filter={filter} />
      {results.length ? (
        <div className="film-grid">
          {results.map((film) => (
            <button className="film-card" key={film.id} onClick={() => onOpen(film)} aria-label={`Ouvrir la fiche de ${film.title}`}>
              <FilmCover film={film} />
              <span className="film-card-info">
                <span className="film-card-top"><b>{film.title}</b>{film.favorite && <i aria-label="Favori">♥</i>}</span>
                <small>{film.director} · {film.year}</small>
                {film.status === 'Terminé' && <span className="seen">Vu {film.watchedAt?.replace(' 2026', '')}</span>}
              </span>
            </button>
          ))}
        </div>
      ) : <EmptyState label="Aucun film ne correspond à cette recherche." onReset={() => { setQuery(''); setFilter('Tout') }} />}
    </main>
  )
}

function seriesProgress(show: Series) {
  if (show.status === 'À découvrir') return 'À découvrir'
  const noun = show.seasonsSeen > 1 ? 'saisons vues' : 'saison vue'
  return `${show.seasonsSeen} ${noun}`
}

function SeriesLibrary({ onOpen }: { onOpen: (show: Series) => void }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SeriesFilter>('Tout')
  const results = useMemo(() => filterSeries(series, query, filter), [query, filter])
  return (
    <main className="main library-main series-main">
      <header className="library-header">
        <div><p className="eyebrow">Collection personnelle</p><h1 className="display-title">Séries</h1></div>
        <button className="add-button" type="button">Ajouter une série <span>+</span></button>
      </header>
      <LibraryTools query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} filters={seriesFilters} placeholder="Rechercher un titre, une création…" label="Rechercher une série" />
      <CollectionMeta count={results.length} singular="série" plural="séries" filter={filter} />
      {results.length ? (
        <div className="film-grid series-grid">
          {results.map((show) => (
            <button className="film-card series-card" key={show.id} onClick={() => onOpen(show)} aria-label={`Ouvrir la fiche de ${show.title}`}>
              <SeriesCover show={show} />
              <span className="film-card-info">
                <span className="film-card-top"><b>{show.title}</b>{show.favorite && <i aria-label="Favori">♥</i>}</span>
                <small>{show.creator} · {show.years}</small>
                <span className={`seen series-progress ${show.status === 'À découvrir' ? 'to-discover' : ''}`}>{seriesProgress(show)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : <EmptyState label="Aucune série ne correspond à cette recherche." onReset={() => { setQuery(''); setFilter('Tout') }} />}
    </main>
  )
}

function EmptyState({ label, onReset }: { label: string; onReset: () => void }) {
  return <div className="empty"><p>{label}</p><button onClick={onReset}>Réinitialiser</button></div>
}

type DetailShellProps = {
  title: string
  closeLabel: string
  onClose: () => void
  visual: ReactNode
  children: ReactNode
}

function DetailShell({ title, closeLabel, onClose, visual, children }: DetailShellProps) {
  const dialog = useRef<HTMLElement>(null)
  useEffect(() => {
    dialog.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    addEventListener('keydown', onKeyDown)
    return () => removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return (
    <div className="detail-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <article className="detail" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Fiche de ${title}`}>
        <button className="close" onClick={onClose} aria-label={closeLabel}>← <span>{closeLabel}</span></button>
        <div className="detail-layout"><div className="detail-visual">{visual}</div>{children}</div>
      </article>
    </div>
  )
}

function FilmDetail({ film, onClose }: { film: Film; onClose: () => void }) {
  return (
    <DetailShell title={film.title} closeLabel="Retour aux films" onClose={onClose} visual={<FilmCover film={film} large />}>
      <div className="detail-content">
        <p className="eyebrow">Film · {film.country}</p>
        <h1 className="display-title">{film.title}</h1>
        <p className="detail-creator">{film.director}</p>
        <p className="detail-meta">{film.year} <i /> {film.duration}</p>
        <div className="detail-state"><span>{film.status}</span>{film.rating && <span>{film.rating.toString().replace('.', ',')} / 5</span>}{film.favorite && <span>Favori</span>}</div>
        {film.watchedAt && <p className="watched">Vu le {film.watchedAt}</p>}
        <div className="detail-divider" />
        <section className="personal-note"><p className="eyebrow">Note personnelle</p><p>{film.note || 'Une œuvre conservée ici, à revoir ou à découvrir quand le moment sera juste.'}</p></section>
        <section className="details-list"><div><span>Réalisé par</span><b>{film.director}</b></div><div><span>Année</span><b>{film.year}</b></div><div><span>Durée</span><b>{film.duration}</b></div></section>
      </div>
    </DetailShell>
  )
}

function SeriesDetail({ show, onClose }: { show: Series; onClose: () => void }) {
  const total = show.seasonsTotal ? ` sur ${show.seasonsTotal}` : ''
  const seasonsLabel = show.seasonsSeen === 1 ? 'saison vue' : 'saisons vues'
  const noteLabel = show.status === 'Terminée' ? 'Note personnelle' : 'À garder en tête'
  return (
    <DetailShell title={show.title} closeLabel="Retour aux séries" onClose={onClose} visual={<SeriesCover show={show} large />}>
      <div className="detail-content series-detail-content">
        <p className="eyebrow">Série · {show.country}</p>
        <h1 className="display-title">{show.title}</h1>
        <p className="detail-creator">{show.creator}</p>
        <p className="detail-meta">{show.years} <i /> {show.seasonsSeen}{total} {seasonsLabel}</p>
        <div className="detail-state"><span>{show.status}</span>{show.rating && <span>{show.rating.toString().replace('.', ',')} / 5</span>}{show.favorite && <span>Favori</span>}</div>
        {show.lastWatchedAt && <p className="watched">Dernière saison vue le {show.lastWatchedAt}</p>}
        <div className="detail-divider" />
        <section className="personal-note"><p className="eyebrow">{noteLabel}</p><p>{show.personalNote || show.summary}</p></section>
        <section className="details-list"><div><span>Création</span><b>{show.creator}</b></div><div><span>Années</span><b>{show.years}</b></div><div><span>Saisons vues</span><b>{show.seasonsSeen}{show.seasonsTotal ? ` / ${show.seasonsTotal}` : ''}</b></div></section>
      </div>
    </DetailShell>
  )
}

function App() {
  const [route, setRoute] = useState(() => routeFromHash(location.hash))
  const navigate = (hash: string) => {
    history.pushState({}, '', hash)
    setRoute(routeFromHash(hash))
  }
  const goHome = () => navigate('#accueil')
  const goFilms = () => navigate(libraryHash('films'))
  const goSeries = () => navigate(libraryHash('series'))
  const openFilm = (film: Film) => navigate(detailHash('films', film.id))
  const openSeries = (show: Series) => navigate(detailHash('series', show.id))
  const closeDetail = () => navigate(route.page === 'series' ? libraryHash('series') : libraryHash('films'))

  useEffect(() => {
    const onLocationChange = () => setRoute(routeFromHash(location.hash))
    addEventListener('popstate', onLocationChange)
    addEventListener('hashchange', onLocationChange)
    return () => {
      removeEventListener('popstate', onLocationChange)
      removeEventListener('hashchange', onLocationChange)
    }
  }, [])

  const selectedFilm = route.page === 'films' ? films.find((film) => film.id === route.selectedId) : undefined
  const selectedSeries = route.page === 'series' ? series.find((show) => show.id === route.selectedId) : undefined

  return (
    <div className="app">
      <Sidebar page={route.page} goHome={goHome} goFilms={goFilms} goSeries={goSeries} />
      {route.page === 'home' && <Home onOpenFilm={openFilm} onOpenSeries={openSeries} goFilms={goFilms} />}
      {route.page === 'films' && <FilmsLibrary onOpen={openFilm} />}
      {route.page === 'series' && <SeriesLibrary onOpen={openSeries} />}
      {selectedFilm && <FilmDetail film={selectedFilm} onClose={closeDetail} />}
      {selectedSeries && <SeriesDetail show={selectedSeries} onClose={closeDetail} />}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
