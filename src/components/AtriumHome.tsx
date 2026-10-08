/**
 * L'accueil regroupe les files utiles et les cinq collections du profil.
 * Il reste montable dans l'application et dans le harnais de recette.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Poster } from './Poster.tsx'
import type { FilmLibrary } from '../data/filmsRepository.ts'
import type { Film } from '../domain/film.ts'
import type { Series } from '../domain/series.ts'
import type { Book } from '../domain/book.ts'
import type { Game } from '../domain/game.ts'
import type { Artwork } from '../domain/artwork.ts'

function formatCalendarDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Clé de médium interne aux modules de l'accueil. */
type MediumFilterKey = 'film' | 'série' | 'livre' | 'jeu' | 'art'

const MEDIUM_CARD_LABELS: Record<MediumFilterKey, string> = {
  film: 'Film',
  'série': 'Série',
  livre: 'Livre',
  jeu: 'Jeu',
  art: 'Art',
}

/** Libellés des bibliothèques : ils nomment les portes de sortie de l'accueil. */
const MEDIUM_LIBRARY_LABELS: Record<MediumFilterKey, string> = {
  film: 'Films',
  'série': 'Séries',
  livre: 'Livres',
  jeu: 'Jeux',
  art: 'Art',
}

/** Ordre de lecture des cinq médiums, partagé par tous les modules. */
const MEDIUM_ORDER: MediumFilterKey[] = ['film', 'série', 'livre', 'jeu', 'art']

/** Statut d'attente par médium : la file d'attente réelle de l'accueil. */
const QUEUE_STATUSES: Record<MediumFilterKey, readonly string[]> = {
  film: ['à découvrir', 'en attente'],
  'série': ['à voir'],
  livre: ['à lire'],
  jeu: ['à jouer'],
  art: ['à découvrir'],
}

/** Statut « arrivé au bout » par médium : la seule consommation comptée. */
const FINISHED_STATUSES: Record<MediumFilterKey, string> = {
  film: 'terminé',
  'série': 'vue',
  livre: 'lu',
  jeu: 'joué',
  art: 'découverte',
}

const CONTRIBUTOR_LABELS: Record<MediumFilterKey, string> = {
  film: 'Réalisation',
  'série': 'Showrunner',
  livre: 'Auteur',
  jeu: 'Studio',
  art: 'Artiste',
}

/**
 * Affiche d'un film associé : l'association TMDB écrit la sélection dans le
 * cache, pas dans `films.poster_url`. L'accueil lit donc la même source que la
 * bibliothèque et la fiche, fournie par l'application.
 */
type FilmPosterResolver = (filmId: string) => Promise<string | null>
type FilmContributorResolver = (filmId: string) => Promise<string | null>

/** Les valeurs de formulaire qui signifient « pas de crédit connu » restent
 * absentes de la carte, plutôt que d'apparaître comme un faux nom. */
function usableContributor(value: string | null | undefined): string | null {
  const contributor = value?.trim()
  if (!contributor || /^(?:non|none|n\/?a|aucun(?:e)?|inconnu(?:e)?|non renseigné(?:e)?)\.?$/i.test(contributor)) return null
  return contributor
}

/** Nombre de cartes gardées dans les files par médium. */
const RAIL_SHOWN = 12
const MEDIUM_DRAWN = 3

export type HomeEntry = {
  key: string
  medium: MediumFilterKey
  title: string
  poster: string | null
  contributor: string | null
  /** Identifiant du film : sert à relire son affiche et son réalisateur du cache TMDB. */
  filmId?: string
  createdAt: string
  rating: number | null
  isFavorite: boolean
  /** Statut du médium (libellé brut du domaine) pour les modules par statut. */
  status?: string
  /** Date personnelle la plus récente pour un statut en cours ou terminé. */
  recentAt: string | null
  recentLabel: string | null
  onOpen: () => void
}

/**
 * Cartes d'activité par jour : les œuvres arrivées au bout ce jour-là, dans
 * l'ordre de lecture de la maison. Le jour porte ses œuvres et pas seulement
 * ses médiums, pour que le survol puisse les nommer.
 */
function buildActivityMap(entries: HomeEntry[]): Map<string, HomeEntry[]> {
  const map = new Map<string, HomeEntry[]>()
  for (const entry of entries) {
    if (entry.status !== FINISHED_STATUSES[entry.medium] || entry.recentAt === null) continue
    const day = entry.recentAt.slice(0, 10)
    const list = map.get(day)
    if (list) list.push(entry)
    else map.set(day, [entry])
  }
  for (const list of map.values()) {
    list.sort((first, second) => MEDIUM_ORDER.indexOf(first.medium) - MEDIUM_ORDER.indexOf(second.medium))
  }
  return map
}

// ————————————————————————————————————————————————————————————————
// Accueil v2 — « L'atrium » (design-lab/home-v1/a, validé le 22/09).
// Les rangées « Derniers ajouts », « Récents » et « Favoris » reprennent la
// même voie horizontale, avec des flèches seulement en cas de débordement.
// ————————————————————————————————————————————————————————————————

/** Dates et libellés : jamais de date UTC, jamais de compteur inventé. */
const dateFull = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })
const dateDayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })

/** Date locale d'une valeur « AAAA-MM-JJ », sans passage par UTC. */
function parseLocalDay(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** « aujourd'hui », « hier », « il y a 5 jours », « le 12 août »… */
function relativeDayLabel(value: string): string {
  const date = parseLocalDay(value)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today.getTime() - date.getTime()) / 86_400_000)
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days} jours`
  if (days < 14) return 'il y a une semaine'
  if (days < 45) return `il y a ${Math.round(days / 7)} semaines`
  if (date.getFullYear() === today.getFullYear()) return `le ${dateDayMonth.format(date)}`
  return `le ${dateFull.format(date)}`
}

/** Jour lisible d'une clé « AAAA-MM-JJ » (libellé accessible du calendrier). */
function dayLabel(value: string): string {
  return dateFull.format(parseLocalDay(value))
}

/** Nom du visuel attendu pour un médium (fallback compris). */
function posterLabel(medium: MediumFilterKey): 'Affiche' | 'Couverture' | 'Visuel' {
  if (medium === 'film' || medium === 'série') return 'Affiche'
  if (medium === 'art') return 'Visuel'
  return 'Couverture'
}

/** Tirage reproductible entre deux rafraîchissements de la sélection. */
function drawForMedium(entries: HomeEntry[], seed: string, previousKeys: string[] = []): HomeEntry[] {
  const pool = [...entries]
  let state = 2166136261
  for (const character of seed) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0
  }
  for (let index = pool.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const target = state % (index + 1)
    ;[pool[index], pool[target]] = [pool[target], pool[index]]
  }
  const selection = pool.slice(0, MEDIUM_DRAWN)
  if (pool.length > MEDIUM_DRAWN && selection.every((entry) => previousKeys.includes(entry.key))) {
    const replacement = pool.find((entry) => !previousKeys.includes(entry.key))
    if (replacement) selection[selection.length - 1] = replacement
  }
  return selection
}

// ————————————————————————————————————————————————————————————————
// Glyphes (aucune dépendance ajoutée)
// ————————————————————————————————————————————————————————————————

function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15.3-6.3L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15.3 6.3L3 16" />
    </svg>
  )
}

/** Note /5 en étoiles, avec remplissage partiel (aucune note pour l'Art). */
function Stars({ value }: { value: number }) {
  return (
    <span className="at-stars" role="img" aria-label={`${value.toLocaleString('fr-FR')} sur 5`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, value - star + 1))
        return (
          <span key={star} className={`at-star${fill > 0 ? ' filled' : ''}`}>
            <span aria-hidden="true">★</span>
            <i className="at-star-fill" aria-hidden="true" style={{ width: `${fill * 100}%` }}>★</i>
          </span>
        )
      })}
    </span>
  )
}

/**
 * Visuel d'une carte : l'affiche enregistrée, remplacée par celle du cache
 * TMDB quand le film y est associé. Un échec de lecture laisse la valeur de
 * base, jamais un écran cassé.
 */
function WorkPoster({ entry, resolveFilmPoster }: { entry: HomeEntry; resolveFilmPoster?: FilmPosterResolver }) {
  const [src, setSrc] = useState(entry.poster)

  useEffect(() => {
    setSrc(entry.poster)
    if (entry.filmId === undefined || resolveFilmPoster === undefined) return
    let cancelled = false
    // `Promise.resolve()` absorbe une erreur synchrone du pont natif absent.
    Promise.resolve()
      .then(() => resolveFilmPoster(entry.filmId as string))
      .then(
        (resolved) => { if (!cancelled && resolved !== null) setSrc(resolved) },
        () => undefined,
      )
    return () => { cancelled = true }
  }, [entry.filmId, entry.poster, resolveFilmPoster])

  return <Poster title={entry.title} src={src} label={posterLabel(entry.medium)} />
}

/**
 * Carte d'une œuvre « posée » : le titre reste visible sous le visuel ; les
 * détails de la rangée sont portés par son nom accessible complet.
 */
function WorkCard({
  entry,
  meta,
  showRating = false,
  showContributor = false,
  resolveFilmPoster,
  resolveFilmContributor,
}: {
  entry: HomeEntry
  meta?: string
  showRating?: boolean
  showContributor?: boolean
  resolveFilmPoster?: FilmPosterResolver
  resolveFilmContributor?: FilmContributorResolver
}) {
  const [cachedContributor, setCachedContributor] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setCachedContributor(null)
    if (!showContributor || usableContributor(entry.contributor) || entry.filmId === undefined || resolveFilmContributor === undefined) {
      return () => { cancelled = true }
    }
    Promise.resolve()
      .then(() => resolveFilmContributor(entry.filmId as string))
      .then((value) => { if (!cancelled) setCachedContributor(usableContributor(value)) }, () => undefined)
    return () => { cancelled = true }
  }, [entry.contributor, entry.filmId, resolveFilmContributor, showContributor])

  const medium = MEDIUM_CARD_LABELS[entry.medium]
  const rating = showRating && entry.rating !== null ? `Noté ${entry.rating} sur 5` : null
  const favorite = entry.isFavorite ? 'Coup de cœur' : null
  const contributor = showContributor ? usableContributor(entry.contributor) ?? cachedContributor : null
  const contributorFact = contributor ? `${CONTRIBUTOR_LABELS[entry.medium]} ${contributor}` : null
  const facts = [medium, contributorFact, meta ?? null, rating, favorite].filter((value): value is string => value !== null).join(' · ')
  const accessibleLabel = `Ouvrir la fiche de ${entry.title}${facts ? `, ${facts}` : ''}`

  return (
    <button type="button" className="at-work" data-medium={entry.medium} onClick={entry.onOpen} aria-label={accessibleLabel}>
      <WorkPoster entry={entry} resolveFilmPoster={resolveFilmPoster} />
      <span className="at-work-cap">
        <span className="at-work-title">{entry.title}</span>
        {contributor && <span className="at-work-byline" title={contributor}>{contributor}</span>}
        {meta && <span className="at-work-meta">{meta}</span>}
        {showRating && entry.rating !== null && <Stars value={entry.rating} />}
      </span>
    </button>
  )
}

/**
 * File horizontale : les flèches restent dans l'en-tête et n'apparaissent que
 * lorsqu'il y a réellement des cartes hors champ.
 */
function FileRow({
  id,
  label,
  entries,
  emptyMessage,
  renderCard,
  showMeta = false,
}: {
  id: string
  label: string
  entries: HomeEntry[]
  emptyMessage: string
  renderCard: (entry: HomeEntry) => ReactNode
  /** Rangee dont les cartes portent une ligne de contexte sous le titre. */
  showMeta?: boolean
}) {
  const laneRef = useRef<HTMLDivElement | null>(null)
  const [overflow, setOverflow] = useState(false)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const measure = useCallback(() => {
    const lane = laneRef.current
    if (!lane) return
    const max = lane.scrollWidth - lane.clientWidth
    setOverflow(max > 2)
    setAtStart(lane.scrollLeft <= 2)
    setAtEnd(lane.scrollLeft >= max - 2)
  }, [])

  useEffect(() => {
    const lane = laneRef.current
    if (!lane) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(lane)
    Array.from(lane.children).forEach((child) => observer.observe(child))
    lane.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      lane.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [measure, entries.length])

  const step = (direction: 1 | -1) => {
    const lane = laneRef.current
    if (!lane) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const distance = Math.max(220, Math.round(lane.clientWidth * 0.78))
    lane.scrollBy({ left: direction * distance, behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <section id={id} className={`at-section${showMeta ? ' at-file-meta' : ''}`} aria-labelledby={`${id}-titre`}>
      <div className="at-file-head">
        <h2 className="at-section-title" id={`${id}-titre`}>{label}</h2>
        {entries.length > 0 && overflow && (
          <div className="at-row-nav">
            <button type="button" className="at-row-btn" onClick={() => step(-1)} disabled={atStart} aria-label={`Faire défiler ${label} vers la gauche`}>
              <ChevronLeft />
            </button>
            <button type="button" className="at-row-btn" onClick={() => step(1)} disabled={atEnd} aria-label={`Faire défiler ${label} vers la droite`}>
              <ChevronRight />
            </button>
          </div>
        )}
      </div>
      {entries.length > 0 ? (
        <div
          className="at-lane"
          ref={laneRef}
          tabIndex={0}
          role="group"
          aria-label={`${label}, ${entries.length} œuvres, utilisez les flèches gauche et droite pour faire défiler`}
        >
          {entries.map(renderCard)}
        </div>
      ) : (
        <p className="at-empty">{emptyMessage}</p>
      )}
    </section>
  )
}

/** Calendrier d'activité : module « mémoire », monochrome, mois par mois. */
function ActivityCalendar({ activityMap }: { activityMap: Map<string, HomeEntry[]> }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const today = new Date()
  const cursor = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstWeekday = (new Date(year, month, 1).getDay() || 7) - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const canGoForward = monthOffset < 0
  const todayKey = formatCalendarDate(today)

  return (
    <div className="at-calendar">
      <header className="at-cal-nav">
        <button type="button" className="at-cal-button" onClick={() => setMonthOffset((value) => value - 1)} aria-label="Mois précédent">
          ‹
        </button>
        <h3>{new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(cursor)}</h3>
        <button
          type="button"
          className="at-cal-button"
          onClick={() => setMonthOffset((value) => Math.min(0, value + 1))}
          disabled={!canGoForward}
          aria-label="Mois suivant"
        >
          ›
        </button>
      </header>
      <div className="at-cal-weekdays" aria-hidden="true">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <ol className="at-cal-days">
        {Array.from({ length: firstWeekday }, (_, index) => (
          <li key={`pad-${index}`} className="at-cal-pad" />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEntries = activityMap.get(key) ?? []
          const mediums = MEDIUM_ORDER.filter((medium) => dayEntries.some((entry) => entry.medium === medium))
          return (
            <li
              key={key}
              className={`at-cal-day${mediums.length > 0 ? ' on' : ''}${key === todayKey ? ' today' : ''}`}
              tabIndex={dayEntries.length > 0 ? 0 : undefined}
            >
              <time dateTime={key}>{day}</time>
              {mediums.length > 0 && (
                <span className="at-cal-dots" aria-hidden="true">
                  {mediums.map((medium) => (
                    <i key={medium} data-medium={medium} />
                  ))}
                </span>
              )}
              {dayEntries.length > 0 && (
                <span className="visually-hidden">
                  {`${dayLabel(key)} : ${dayEntries.map((entry) => `${MEDIUM_CARD_LABELS[entry.medium]} « ${entry.title} »`).join(', ')}`}
                </span>
              )}
              {/* Repère visuel au survol : la liste réelle des œuvres du jour. */}
              {dayEntries.length > 0 && (
                <span className="at-cal-tip" aria-hidden="true">
                  {dayEntries.map((entry) => (
                    <span className="at-cal-tip-item" key={entry.key}>
                      <span className="at-medium-dot" data-medium={entry.medium} />
                      <span className="at-cal-tip-title">{entry.title}</span>
                    </span>
                  ))}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ————————————————————————————————————————————————————————————————
// Composition de l'accueil
// ————————————————————————————————————————————————————————————————

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
  /** Relit l'affiche réelle d'un film associé, comme la bibliothèque. */
  resolveFilmPoster?: FilmPosterResolver
  /** Complète le réalisateur depuis le cache TMDB local si le champ est vide. */
  resolveFilmContributor?: FilmContributorResolver
  /** Colonne défilante de l'accueil : l'application y suit la position. */
  scrollRef?: RefObject<HTMLElement | null>
}

export function Home({
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
  resolveFilmPoster,
  resolveFilmContributor,
  scrollRef,
}: HomeProps) {
  // Toutes les œuvres, normalisées en entrées communes pour les modules.
  const allEntries: HomeEntry[] = [
    ...library.films.map((film) => ({
      key: `film-${film.id}`,
      medium: 'film' as const,
      title: film.title,
      poster: film.posterUrl,
      contributor: film.director,
      filmId: film.id,
      createdAt: film.createdAt,
      rating: film.rating,
      isFavorite: film.isFavorite,
      status: film.status,
      recentAt: film.status === 'terminé' || film.status === 'abandonné' ? film.watchedAt : null,
      recentLabel: film.status === 'terminé' ? 'Vu' : film.status === 'abandonné' ? 'Abandonné' : null,
      onOpen: () => onOpen(film),
    })),
    ...seriesCollection.map((entry) => ({
      key: `series-${entry.id}`,
      medium: 'série' as const,
      title: entry.title,
      poster: entry.posterUrl,
      contributor: entry.showrunner,
      createdAt: entry.createdAt,
      rating: entry.rating,
      isFavorite: entry.isFavorite,
      status: entry.status,
      recentAt: entry.status === 'à voir' ? null : entry.progressUpdatedAt ?? entry.startedAt,
      recentLabel: entry.status === 'vue' ? 'Vue' : entry.status === 'abandonnée' ? 'Arrêtée' : entry.status === 'en cours' ? 'En cours' : null,
      onOpen: () => onOpenSeries(entry),
    })),
    ...bookCollection.map((entry) => ({
      key: `book-${entry.id}`,
      medium: 'livre' as const,
      title: entry.title,
      poster: entry.coverUrl,
      contributor: entry.author,
      createdAt: entry.createdAt,
      rating: entry.rating,
      isFavorite: entry.isFavorite,
      status: entry.status,
      recentAt: entry.status === 'à lire' ? null : entry.progressUpdatedAt ?? entry.startedAt,
      recentLabel: entry.status === 'lu' ? 'Lu' : entry.status === 'abandonné' ? 'Abandonné' : entry.status === 'en cours' ? 'En cours' : null,
      onOpen: () => onOpenBook(entry),
    })),
    ...gameCollection.map((entry) => ({
      key: `game-${entry.id}`,
      medium: 'jeu' as const,
      title: entry.title,
      poster: entry.coverUrl,
      contributor: entry.developer,
      createdAt: entry.createdAt,
      rating: entry.rating,
      isFavorite: entry.isFavorite,
      status: entry.status,
      recentAt: entry.status === 'à jouer' ? null : entry.playedAt,
      recentLabel: entry.status === 'joué' ? 'Joué' : entry.status === 'abandonné' ? 'Abandonné' : null,
      onOpen: () => onOpenGame(entry),
    })),
    ...artworkCollection.map((entry) => ({
      key: `artwork-${entry.id}`,
      medium: 'art' as const,
      title: entry.title,
      poster: entry.imageUrl,
      contributor: entry.artist,
      createdAt: entry.createdAt,
      rating: null,
      isFavorite: entry.isFavorite,
      status: entry.status,
      recentAt: entry.status === 'découverte' ? entry.discoveredAt : null,
      recentLabel: entry.status === 'découverte' ? 'Découvert' : null,
      onOpen: () => onOpenArtwork(entry),
    })),
  ]

  const activityMap = buildActivityMap(allEntries)
  return <HomeDashboard entries={allEntries} activityMap={activityMap} resolveFilmPoster={resolveFilmPoster} resolveFilmContributor={resolveFilmContributor} scrollRef={scrollRef} />
}

/** Accueil Sylloge : activité personnelle, files récentes et sélections par médium. */
function HomeDashboard({
  entries,
  activityMap,
  resolveFilmPoster,
  resolveFilmContributor,
  scrollRef,
}: {
  entries: HomeEntry[]
  activityMap: Map<string, HomeEntry[]>
  resolveFilmPoster?: FilmPosterResolver
  resolveFilmContributor?: FilmContributorResolver
  scrollRef?: RefObject<HTMLElement | null>
}) {
  const additions = entries
    .filter((entry) => QUEUE_STATUSES[entry.medium].includes(entry.status ?? ''))
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .slice(0, RAIL_SHOWN)
  const recent = entries
    .filter((entry) => entry.recentAt !== null)
    .sort((first, second) => second.recentAt!.localeCompare(first.recentAt!))
    .slice(0, RAIL_SHOWN)
  const favorites = entries
    .filter((entry) => entry.isFavorite && ((entry.rating !== null && entry.rating >= 4.5) || entry.medium === 'art'))
    .sort((first, second) => (second.rating ?? -1) - (first.rating ?? -1) || second.createdAt.localeCompare(first.createdAt))
    .slice(0, RAIL_SHOWN)
  const year = new Date().getFullYear()
  const yearPrefix = String(year)
  const mediumStats = MEDIUM_ORDER.map((medium) => {
    const ofMedium = entries.filter((entry) => entry.medium === medium)
    const finished = ofMedium.filter((entry) => entry.status === FINISHED_STATUSES[medium])
    return {
      medium,
      finished: finished.length,
      pending: ofMedium.filter((entry) => QUEUE_STATUSES[medium].includes(entry.status ?? '')).length,
      thisYear: finished.filter((entry) => entry.recentAt?.startsWith(yearPrefix)).length,
    }
  })
  const totalWorks = entries.length
  const selectionDay = formatCalendarDate(new Date())
  const [selectionState, setSelectionState] = useState<Partial<Record<MediumFilterKey, { revision: number; previousKeys: string[] }>>>({})
  const byMedium = useMemo(
    () => MEDIUM_ORDER.map((medium) => ({
      medium,
      entries: drawForMedium(
        entries.filter((entry) => entry.medium === medium),
        `${selectionDay}-${medium}-${selectionState[medium]?.revision ?? 0}`,
        selectionState[medium]?.previousKeys,
      ),
    })).filter(({ entries }) => entries.length > 0),
    [entries, selectionDay, selectionState],
  )

  const refreshMediumSelection = (medium: MediumFilterKey) => {
    const currentSelection = byMedium.find((item) => item.medium === medium)?.entries
    if (!currentSelection) return
    setSelectionState((previous) => ({
      ...previous,
      [medium]: {
        revision: (previous[medium]?.revision ?? 0) + 1,
        previousKeys: currentSelection.map((entry) => entry.key),
      },
    }))
  }

  return (
    <main ref={scrollRef} className="main home-main atrium-home" aria-label="Accueil">
      <div className="at-inner">
        <h1 className="visually-hidden">Accueil</h1>
        {totalWorks === 0 ? (
          <p className="at-empty-home">Aucune œuvre pour le moment.</p>
        ) : (
          <>
            <section className="at-overview" aria-label="Activité et calendrier">
              <section className="at-overview-panel" aria-labelledby="at-stats-title">
                <h2 className="visually-hidden" id="at-stats-title">Activité par bibliothèque</h2>
                {/* Chaque médium garde la même pastille que les jours du
                    calendrier : la couleur relie les deux modules. */}
                <table className="at-medium-table">
                  <thead>
                    <tr>
                      <th scope="col"><span className="visually-hidden">Bibliothèque</span></th>
                      <th scope="col">Terminés</th>
                      <th scope="col">En attente</th>
                      <th scope="col">{year}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mediumStats.map(({ medium, finished, pending, thisYear }) => (
                    <tr key={medium} data-medium={medium}>
                        <th scope="row">
                          <span className="at-medium-name">
                            <span className="at-medium-dot" data-medium={medium} aria-hidden="true" />
                            {MEDIUM_LIBRARY_LABELS[medium]}
                          </span>
                        </th>
                        <td>{finished}</td>
                        <td>{pending}</td>
                        <td>{thisYear}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="at-overview-panel at-calendar-panel" aria-label="Calendrier d'activité">
                <ActivityCalendar activityMap={activityMap} />
              </section>
            </section>

            <div className="at-files">
              <FileRow
                id="at-additions"
                label="Derniers ajouts"
                entries={additions}
                emptyMessage="Aucune œuvre en attente."
                renderCard={(entry) => <WorkCard key={entry.key} entry={entry} showContributor resolveFilmPoster={resolveFilmPoster} resolveFilmContributor={resolveFilmContributor} />}
              />
              <FileRow
                id="at-recent"
                label="Récents"
                entries={recent}
                emptyMessage="Aucune activité récente."
                showMeta
                renderCard={(entry) => (
                  <WorkCard
                    key={entry.key}
                    entry={entry}
                    meta={`${entry.recentLabel ?? 'Activité'} · ${relativeDayLabel(entry.recentAt as string)}`}
                    showRating
                    showContributor
                    resolveFilmPoster={resolveFilmPoster}
                    resolveFilmContributor={resolveFilmContributor}
                  />
                )}
              />
              <FileRow
                id="at-favorites"
                label="Favoris"
                entries={favorites}
                emptyMessage="Aucun favori."
                renderCard={(entry) => <WorkCard key={entry.key} entry={entry} showRating showContributor resolveFilmPoster={resolveFilmPoster} resolveFilmContributor={resolveFilmContributor} />}
              />
            </div>

            <div className="at-medium-section">
              <div className="at-medium-grid" aria-label="Œuvres par médium">
                {byMedium.map(({ medium, entries: mediumEntries }) => (
                  <section className="at-medium-panel" key={medium} aria-labelledby={`at-medium-${medium}`}>
                    <div className="at-medium-head">
                      <h2 className="at-section-title" id={`at-medium-${medium}`}>{MEDIUM_LIBRARY_LABELS[medium]}</h2>
                      <button
                        type="button"
                        className="at-refresh-button"
                        onClick={() => refreshMediumSelection(medium)}
                        aria-controls={`at-medium-items-${medium}`}
                        aria-label={`Rafraîchir les suggestions ${MEDIUM_LIBRARY_LABELS[medium]}`}
                        title={`Rafraîchir ${MEDIUM_LIBRARY_LABELS[medium]}`}
                      >
                        <RefreshIcon />
                      </button>
                    </div>
                    <div className="at-medium-items" id={`at-medium-items-${medium}`}>
                      {mediumEntries.map((entry) => <WorkCard key={entry.key} entry={entry} resolveFilmPoster={resolveFilmPoster} />)}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
