import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  detailHash,
  filmFilters,
  films,
  filterFilms,
  filterSeries,
  formatDate,
  libraryHash,
  recentlyLived,
  routeFromHash,
  series,
  seriesFilters,
  type Film,
  type FilmFilter,
  type Page,
  type RecentItem,
  type Series,
  type SeriesFilter,
} from './catalog'
import './styles.css'

const icon = (name: string) => <span className={`icon icon-${name}`} aria-hidden="true" />

type PosterProps = {
  title: string
  src: string
  large?: boolean
}

function Poster({ title, src, large = false }: PosterProps) {
  const [missing, setMissing] = useState(false)

  return (
    <div className={`poster ${large ? 'poster-large' : ''}`}>
      {missing ? (
        <div className="poster-fallback" role="img" aria-label={`Affiche indisponible pour ${title}`}>
          <span>Affiche indisponible</span>
          <b>{title}</b>
        </div>
      ) : (
        <img src={src} alt={`Affiche de ${title}`} onError={() => setMissing(true)} />
      )}
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

function RecentCard({ entry, onOpen }: { entry: RecentItem; onOpen: () => void }) {
  const { item } = entry
  return (
    <button className="mini-card" onClick={onOpen} aria-label={`Ouvrir la fiche de ${item.title}`}>
      <Poster title={item.title} src={item.poster} />
      <span className="mini-info">
        <span className="mini-reference">{entry.medium}</span>
        <b>{item.title}</b>
        <small>{formatDate(entry.date)}</small>
      </span>
    </button>
  )
}

type HomeProps = {
  onOpenFilm: (film: Film) => void
  onOpenSeries: (show: Series) => void
}

function Home({ onOpenFilm, onOpenSeries }: HomeProps) {
  const paused = series.find((show) => show.id === 'severance')!
  const openRecent = (entry: RecentItem) => entry.medium === 'Film' ? onOpenFilm(entry.item) : onOpenSeries(entry.item)

  return (
    <main className="main home-main">
      <header className="home-header">
        <p className="eyebrow">Échantillon personnel</p>
        <h1 className="display-title">Quelques traces,<br /><em>pour y revenir.</em></h1>
        <p className="lede">Une bibliothèque personnelle de ce qui a compté, de ce qui attend encore.</p>
      </header>

      <section className="home-section">
        <div className="section-heading">
          <div><p className="eyebrow">Derniers éléments datés</p><h2 className="display-title">Récemment vécu</h2></div>
        </div>
        <div className="recent-grid">
          {recentlyLived.map((entry) => <RecentCard key={`${entry.medium}-${entry.item.id}`} entry={entry} onOpen={() => openRecent(entry)} />)}
        </div>
      </section>

      <section className="in-progress">
        <div className="in-progress-copy">
          <p className="eyebrow">À reprendre · {paused.kind}</p>
          <h2>{paused.title}</h2>
          <p>{[paused.creator, paused.status].filter(Boolean).join(' · ')}</p>
          {paused.summary && <p className="note-preview">{paused.summary}</p>}
          <button className="text-link" onClick={() => onOpenSeries(paused)}>Ouvrir la fiche <span>→</span></button>
        </div>
        <button className="featured-poster" onClick={() => onOpenSeries(paused)} aria-label={`Ouvrir la fiche de ${paused.title}`}>
          <Poster title={paused.title} src={paused.poster} />
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
    </div>
  )
}

function FilmCard({ film, onOpen }: { film: Film; onOpen: () => void }) {
  const creatorAndYear = [film.director, film.year].filter((value) => value !== undefined).join(' · ')
  return (
    <button className="film-card" onClick={onOpen} aria-label={`Ouvrir la fiche de ${film.title}`}>
      <Poster title={film.title} src={film.poster} />
      <span className="film-card-info">
        <span className="film-card-top"><b>{film.title}</b>{film.favorite && <i aria-label="Favori">♥</i>}</span>
        {creatorAndYear && <small>{creatorAndYear}</small>}
        <span className={`status-line ${film.status === 'À découvrir' ? 'to-discover' : ''}`}>
          {film.watchedAt ? `Vu le ${formatDate(film.watchedAt)}` : film.status}
        </span>
      </span>
    </button>
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
      </header>
      <LibraryTools query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} filters={filmFilters} placeholder="Rechercher un titre, un réalisateur…" label="Rechercher un film" />
      <CollectionMeta count={results.length} singular="film" plural="films" filter={filter} />
      {results.length ? (
        <div className="film-grid">
          {results.map((film) => <FilmCard film={film} key={film.id} onOpen={() => onOpen(film)} />)}
        </div>
      ) : <EmptyState label="Aucun film ne correspond à cette recherche." onReset={() => { setQuery(''); setFilter('Tout') }} />}
    </main>
  )
}

function SeriesCard({ show, onOpen }: { show: Series; onOpen: () => void }) {
  const attribution = [show.kind, show.creator].filter(Boolean).join(' · ')
  return (
    <button className="film-card series-card" onClick={onOpen} aria-label={`Ouvrir la fiche de ${show.title}`}>
      <Poster title={show.title} src={show.poster} />
      <span className="film-card-info">
        <span className="film-card-top"><b>{show.title}</b>{show.favorite && <i aria-label="Favori">♥</i>}</span>
        {attribution && <small>{attribution}</small>}
        <span className={`status-line ${show.status === 'À découvrir' ? 'to-discover' : ''} ${show.status === 'En pause' ? 'is-paused' : ''}`}>{show.status}</span>
      </span>
    </button>
  )
}

function SeriesLibrary({ onOpen }: { onOpen: (show: Series) => void }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SeriesFilter>('Tout')
  const results = useMemo(() => filterSeries(series, query, filter), [query, filter])
  return (
    <main className="main library-main series-main">
      <header className="library-header">
        <div><p className="eyebrow">Collection personnelle</p><h1 className="display-title">Séries</h1></div>
      </header>
      <LibraryTools query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} filters={seriesFilters} placeholder="Rechercher un titre, une création…" label="Rechercher une série" />
      <CollectionMeta count={results.length} singular="série" plural="séries" filter={filter} />
      {results.length ? (
        <div className="film-grid series-grid">
          {results.map((show) => <SeriesCard show={show} key={show.id} onOpen={() => onOpen(show)} />)}
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

function DetailStates({ status, rating, favorite }: { status: string; rating?: Film['rating']; favorite?: boolean }) {
  return (
    <div className="detail-state">
      <span>{status}</span>
      {rating && <span>{rating.score} / 10 · {rating.label}</span>}
      {favorite && <span>Favori</span>}
    </div>
  )
}

function FilmDetail({ film, onClose }: { film: Film; onClose: () => void }) {
  return (
    <DetailShell title={film.title} closeLabel="Retour aux films" onClose={onClose} visual={<Poster title={film.title} src={film.poster} large />}>
      <div className="detail-content">
        <p className="eyebrow">Film</p>
        <h1 className="display-title">{film.title}</h1>
        {film.director && <p className="detail-creator">{film.director}</p>}
        {film.year && <p className="detail-meta">{film.year}</p>}
        <DetailStates status={film.status} rating={film.rating} favorite={film.favorite} />
        {film.watchedAt && <p className="watched">Vu le {formatDate(film.watchedAt)}</p>}
        {film.summary && (
          <section className="summary">
            <h2 className="display-title">Résumé</h2>
            <p>{film.summary}</p>
          </section>
        )}
      </div>
    </DetailShell>
  )
}

function SeriesDetail({ show, onClose }: { show: Series; onClose: () => void }) {
  return (
    <DetailShell title={show.title} closeLabel="Retour aux séries" onClose={onClose} visual={<Poster title={show.title} src={show.poster} large />}>
      <div className="detail-content series-detail-content">
        <p className="eyebrow">{show.kind ?? 'Série'}</p>
        <h1 className="display-title">{show.title}</h1>
        {show.creator && <p className="detail-creator">{show.creator}</p>}
        <DetailStates status={show.status} rating={show.rating} favorite={show.favorite} />
        {show.completedAt && <p className="watched">Terminée le {formatDate(show.completedAt)}</p>}
        {show.summary && (
          <section className="summary">
            <h2 className="display-title">Résumé</h2>
            <p>{show.summary}</p>
          </section>
        )}
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
      {route.page === 'home' && <Home onOpenFilm={openFilm} onOpenSeries={openSeries} />}
      {route.page === 'films' && <FilmsLibrary onOpen={openFilm} />}
      {route.page === 'series' && <SeriesLibrary onOpen={openSeries} />}
      {selectedFilm && <FilmDetail film={selectedFilm} onClose={closeDetail} />}
      {selectedSeries && <SeriesDetail show={selectedSeries} onClose={closeDetail} />}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
