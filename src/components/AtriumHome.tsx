/**
 * Accueil v2 — « L'atrium » — porté de `design-lab/home-v1/a/` dans l'app
 * (design validé par Aurélien le 22/09/2026), avec les files horizontales de
 * la proposition C pour « Derniers ajouts », « À découvrir », « Favoris et
 * mieux notés » et « Vus, lus et joués ».
 *
 * Composition du 24/09/2026 : l'accueil ouvre directement sur des lignes de
 * découverte. Les œuvres en cours ne sont plus un module focal ; les quatre
 * files restent empilées en pleine largeur et « Jour pour jour » referme le
 * parcours sans tableau de bord.
 *
 * Module séparé de `main.tsx` pour que le rendu de l'accueil reste montable
 * hors de la coquille native : `design-lab/home-v1/implementation/harnais/`
 * le rend avec un jeu étiqueté pour la QA visuelle et les mesures.
 * L'application, elle, ne rend que les entrées réelles du profil.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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

/** Clé de médium partagée par l'accueil et la navigation de l'application. */
export type MediumFilterKey = 'film' | 'série' | 'livre' | 'jeu' | 'art'

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

/** Verbe de consommation par médium, pour dater une œuvre terminée. */
const CONSUMED_VERBS: Record<MediumFilterKey, string> = {
  film: 'Vu',
  'série': 'Terminée',
  livre: 'Lu',
  jeu: 'Joué',
  art: 'Découvert',
}

/** Statut d'attente par médium : la file d'attente réelle de l'accueil. */
const QUEUE_STATUSES: Record<MediumFilterKey, string> = {
  film: 'à découvrir',
  'série': 'à voir',
  livre: 'à lire',
  jeu: 'à jouer',
  art: 'à découvrir',
}

/**
 * Longueur d'une file horizontale : assez pour remplir plusieurs écrans de
 * défilement sans transformer l'accueil en bibliothèque (les portes de sortie
 * mènent à l'ensemble). Les données viennent des entrées réelles du profil.
 */
const ADDITIONS_SHOWN = 12
const FAVORITES_SHOWN = 12
const CONSUMED_SHOWN = 12

/** Taille du groupe déterministe de la file d'attente (« À découvrir »). */
const QUEUE_DRAWN = 6

export type HomeEntry = {
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

/** Cartes d'activité par jour : les médiums consommés ce jour-là. */
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

// ————————————————————————————————————————————————————————————————
// Accueil v2 — « L'atrium » (design-lab/home-v1/a, validé le 22/09).
// Les files « Derniers ajouts », « Favoris et mieux notés » et « Vus, lus et
// joués » reprennent la rangée horizontale de la proposition C : en-tête sur
// une ligne, voie défilante, flèches seulement en cas de débordement.
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

/** Note d'avis abrégée à 120 caractères, comme la fiche. */
function truncateNote(note: string): string {
  const clean = note.replace(/\s+/g, ' ').trim()
  return clean.length > 120 ? `${clean.slice(0, 117)}…` : clean
}

/** Anniversaires du jour : même jour et même mois, au moins un an plus tôt. */
function collectAnniversaries(entries: HomeEntry[]): Array<{ entry: HomeEntry; years: number }> {
  const now = new Date()
  const mmdd = formatCalendarDate(now).slice(5)
  return entries
    .filter((entry) => {
      const consumed = entry.consumedAt
      if (!consumed || !/^\d{4}-\d{2}-\d{2}/.test(consumed)) return false
      return consumed.slice(5, 10) === mmdd && now.getFullYear() - Number(consumed.slice(0, 4)) >= 1
    })
    .map((entry) => ({ entry, years: now.getFullYear() - Number(entry.consumedAt!.slice(0, 4)) }))
    .sort((first, second) => second.years - first.years)
}

/** Compteurs de l'année en cours, dérivés des seules entrées réelles. */
function yearlyCounts(entries: HomeEntry[]) {
  const year = new Date().getFullYear()
  const prefix = String(year)
  const addedByMedium = new Map<MediumFilterKey, number>()
  let added = 0
  let consumed = 0
  for (const entry of entries) {
    if (entry.createdAt.startsWith(prefix)) {
      added += 1
      addedByMedium.set(entry.medium, (addedByMedium.get(entry.medium) ?? 0) + 1)
    }
    if (entry.consumedAt?.startsWith(prefix)) consumed += 1
  }
  return { year, added, consumed, addedByMedium }
}

/** Médiums présents dans une liste, dans l'ordre de lecture de la maison. */
function uniqueMediums(entries: HomeEntry[]): MediumFilterKey[] {
  return MEDIUM_ORDER.filter((medium) => entries.some((entry) => entry.medium === medium))
}

// ————————————————————————————————————————————————————————————————
// Glyphes (aucune dépendance ajoutée)
// ————————————————————————————————————————————————————————————————

function HeartGlyph() {
  return (
    <svg className="at-heart-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 20.5c-.4 0-.8-.15-1.1-.42C7.3 16.9 3 13.2 3 9.1 3 6.3 5.1 4 7.8 4c1.6 0 3.1.8 4.2 2.2C13.1 4.8 14.6 4 16.2 4 18.9 4 21 6.3 21 9.1c0 4.1-4.3 7.8-7.9 11-.3.26-.7.4-1.1.4z" />
    </svg>
  )
}

function RefreshGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <path d="M20.5 3.5V9H15" />
    </svg>
  )
}

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

/** Portes de sortie : un module qui montre des œuvres en porte toujours une. */
function Doors({
  mediums,
  scope,
  onBrowse,
}: {
  mediums: MediumFilterKey[]
  scope: string
  onBrowse: (medium: MediumFilterKey) => void
}) {
  if (mediums.length === 0) return null
  return (
    <p className="at-doors">
      <span className="at-doors-label">Tout voir&nbsp;:</span>
      {mediums.map((medium, index) => (
        <span key={medium} className="at-door-slot">
          {index > 0 && <span className="at-door-sep" aria-hidden="true">·</span>}
          <button
            type="button"
            className="at-door"
            onClick={() => onBrowse(medium)}
            aria-label={`Tout voir dans ${MEDIUM_LIBRARY_LABELS[medium]} (${scope})`}
          >
            {MEDIUM_LIBRARY_LABELS[medium]}
          </button>
        </span>
      ))}
    </p>
  )
}

/**
 * Carte d'une œuvre « posée » : le titre reste visible sous le visuel ; les
 * détails de la rangée sont portés par son nom accessible complet.
 */
function WorkCard({
  entry,
  meta,
  showRating = false,
  showHeart = false,
}: {
  entry: HomeEntry
  meta: string
  showRating?: boolean
  showHeart?: boolean
}) {
  const medium = MEDIUM_CARD_LABELS[entry.medium]
  const rating = showRating && entry.rating !== null ? `Noté ${entry.rating} sur 5` : null
  const favorite = entry.isFavorite ? 'Coup de cœur' : null
  const facts = [medium, meta, rating, favorite].filter((value): value is string => value !== null).join(' · ')
  const accessibleLabel = `Ouvrir la fiche de ${entry.title}${facts ? ` — ${facts}` : ''}`

  return (
    <button type="button" className="at-work" onClick={entry.onOpen} aria-label={accessibleLabel}>
      <Poster title={entry.title} src={entry.poster} label={posterLabel(entry.medium)} />
      <span className="at-work-cap">
        <span className="at-work-title">{entry.title}</span>
        {showRating && entry.rating !== null && <Stars value={entry.rating} />}
        {showHeart && entry.isFavorite && (
          <span className="at-work-heart" role="img" aria-label="Coup de cœur">
            <HeartGlyph />
          </span>
        )}
      </span>
    </button>
  )
}

/**
 * File horizontale de la maison : en-tête sur une ligne (libellé, repère,
 * flèches) puis une voie défilante. Les flèches n'apparaissent qu'en cas de
 * débordement réel et sont désactivées aux extrémités ; la voie se parcourt au
 * trackpad, à la molette, au clavier (flèches) et par ses cartes (tabulation).
 */
function FileRow({
  id,
  label,
  hint,
  entries,
  scope,
  emptyMessage,
  onBrowse,
  renderCard,
  action,
}: {
  id: string
  label: string
  hint?: string
  entries: HomeEntry[]
  scope: string
  emptyMessage: string
  onBrowse: (medium: MediumFilterKey) => void
  renderCard: (entry: HomeEntry) => ReactNode
  /** Commande propre au module (p. ex. « Trois autres »), posée dans l'en-tête. */
  action?: ReactNode
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
    <section id={id} className="at-section" aria-labelledby={`${id}-titre`}>
      <div className="at-file-head">
        <h2 className="at-label" id={`${id}-titre`}>{label}</h2>
        {hint !== undefined && <p className="at-hint">{hint}</p>}
        {(action !== undefined || (entries.length > 0 && overflow)) && (
          <div className="at-row-nav">
            {action}
            {entries.length > 0 && overflow && (
              <>
                <button type="button" className="at-row-btn" onClick={() => step(-1)} disabled={atStart} aria-label={`Faire défiler ${label} vers la gauche`}>
                  <ChevronLeft />
                </button>
                <button type="button" className="at-row-btn" onClick={() => step(1)} disabled={atEnd} aria-label={`Faire défiler ${label} vers la droite`}>
                  <ChevronRight />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {entries.length > 0 ? (
        <div
          className="at-lane"
          ref={laneRef}
          tabIndex={0}
          role="group"
          aria-label={`${label} — file horizontale, défilement aux flèches gauche et droite`}
        >
          {entries.map(renderCard)}
        </div>
      ) : (
        <p className="at-empty">{emptyMessage}</p>
      )}
      <Doors mediums={uniqueMediums(entries)} scope={scope} onBrowse={onBrowse} />
    </section>
  )
}

/** Calendrier d'activité : module « mémoire », monochrome, mois par mois. */
function ActivityCalendar({ activityMap }: { activityMap: Map<string, MediumFilterKey[]> }) {
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
          const mediums = activityMap.get(key) ?? []
          return (
            <li key={key} className={`at-cal-day${mediums.length > 0 ? ' on' : ''}${key === todayKey ? ' today' : ''}`}>
              <time dateTime={key}>{day}</time>
              {mediums.length > 0 && (
                <span className="at-cal-dots" aria-hidden="true">
                  {mediums.slice(0, 3).map((medium) => (
                    <i key={medium} />
                  ))}
                </span>
              )}
              {mediums.length > 0 && (
                <span className="visually-hidden">{`${dayLabel(key)} : ${mediums.map((medium) => MEDIUM_CARD_LABELS[medium]).join(', ')}`}</span>
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
  /** Portes de sortie : ouvre la bibliothèque d'un médium. */
  onBrowse: (medium: MediumFilterKey) => void
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
  onBrowse,
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
  return <HomeDashboard entries={allEntries} activityMap={activityMap} onBrowse={onBrowse} />
}

/** Accueil « L'atrium » : composition validée le 22/09 (design-lab/home-v1/a). */
function HomeDashboard({
  entries,
  activityMap,
  onBrowse,
}: {
  entries: HomeEntry[]
  activityMap: Map<string, MediumFilterKey[]>
  onBrowse: (medium: MediumFilterKey) => void
}) {
  const [seed, setSeed] = useState(0)

  const recent = [...entries].sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, ADDITIONS_SHOWN)
  const consumed = entries
    .filter((entry) => entry.consumedAt !== null)
    .sort((first, second) => second.consumedAt!.localeCompare(first.consumedAt!))
    .slice(0, CONSUMED_SHOWN)
  const favorites = entries
    .filter((entry) => entry.isFavorite || entry.rating !== null)
    .sort((first, second) => (second.rating ?? 0) - (first.rating ?? 0) || Number(second.isFavorite) - Number(first.isFavorite))
    .slice(0, FAVORITES_SHOWN)
  const queue = entries
    .filter((entry) => entry.status === QUEUE_STATUSES[entry.medium])
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
  const inProgress = entries
    .filter((entry) => entry.status === 'en cours')
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .slice(0, CONSUMED_SHOWN)
  const byMedium = MEDIUM_ORDER.map((medium) => ({
    medium,
    entries: entries
      .filter((entry) => entry.medium === medium)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
      .slice(0, ADDITIONS_SHOWN),
  })).filter(({ entries }) => entries.length > 0)
  const anniversaries = useMemo(() => collectAnniversaries(entries), [entries])
  const year = useMemo(() => yearlyCounts(entries), [entries])
  const totalWorks = entries.length

  // La voie reste un conteneur horizontal natif : aucun listener wheel/touch
  // ne transforme le geste vertical en scrollLeft ni ne bloque le parent.
  const addedLabel = year.added === 1 ? 'œuvre ajoutée' : 'œuvres ajoutées'
  const consumedLabel = year.consumed === 1 ? 'consommation datée' : 'consommations datées'

  // Tirage déterministe : la file d'attente devient une vraie voie de
  // découverte. Le premier rendu montre six propositions ; « Six autres »
  // permute ensuite le groupe sans ajouter de recommandation algorithmique.
  const drawn = useMemo(() => {
    if (queue.length <= QUEUE_DRAWN) return queue
    if (seed === 0) return queue.slice(0, QUEUE_DRAWN)
    let current = (seed * 2654435761) % 4294967296
    const pool = [...queue]
    for (let i = pool.length - 1; i > 0; i -= 1) {
      current = (current * 1664525 + 1013904223) % 4294967296
      const j = Math.floor((current / 4294967296) * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return pool.slice(0, QUEUE_DRAWN)
  }, [queue, seed])

  return (
    <main className="main home-main atrium-home" aria-label="Accueil">
      <div className="at-inner">
        {totalWorks > 0 ? (
          <header className="at-head">
            <h1 className="at-title">Ma bibliothèque</h1>
          </header>
        ) : (
          <header className="at-head at-head-empty">
            <h1 className="at-title">Ma bibliothèque</h1>
            <p className="at-empty-home">Ajoutez une première œuvre pour commencer votre bibliothèque.</p>
          </header>
        )}

        {totalWorks === 0 ? null : (
          <>

        {/* Les quatre files de l'atrium : même grammaire, pleine largeur sur le
            bureau. La répétition verticale est le rythme de Netflix/Plex ; les
            portes de sortie restent discrètes sous chaque voie. */}
        <div className="at-files">
          {/* Derniers ajouts : ce qui vient d'entrer dans la maison. */}
          <FileRow
            id="at-additions"
            label="Derniers ajouts"
            hint="Ce qui vient d'entrer dans la maison."
            entries={recent}
            scope="Derniers ajouts"
            emptyMessage="Aucune œuvre n'a encore été ajoutée."
            onBrowse={onBrowse}
            renderCard={(entry) => (
              <WorkCard key={entry.key} entry={entry} meta={`Ajouté ${relativeDayLabel(entry.createdAt)}`} />
            )}
          />

          {/* À découvrir : la file d'attente réelle, sans algorithme. Le
              tirage garde sa commande de rotation dans l'en-tête de la file. */}
          <FileRow
            id="at-discover"
            label="À découvrir"
            entries={drawn}
            scope="File d'attente"
            emptyMessage="Aucune œuvre en attente : donnez un statut « à découvrir », « à voir », « à lire » ou « à jouer » à une œuvre."
            onBrowse={onBrowse}
            action={
              queue.length > QUEUE_DRAWN ? (
                <button type="button" className="at-door at-door-refresh" onClick={() => setSeed((value) => value + 1)}>
                  <RefreshGlyph />
                  Six autres
                </button>
              ) : undefined
            }
            renderCard={(entry) => (
              <WorkCard key={entry.key} entry={entry} meta={`En attente · ${entry.status}`} />
            )}
          />

          {/* La progression n'existe plus pour les Films ni les Jeux dans le
              modèle courant. Cette file ne vit donc que si une Série ou un Livre
              est réellement « en cours ». */}
          {inProgress.length > 0 && (
            <FileRow
              id="at-in-progress"
              label="En cours"
              entries={inProgress}
              scope="Œuvres en cours"
              emptyMessage="Aucune série ni aucun livre en cours."
              onBrowse={onBrowse}
              renderCard={(entry) => (
                <WorkCard key={entry.key} entry={entry} meta="En cours" />
              )}
            />
          )}

          {/* Favoris et mieux notés : coups de cœur et étoiles. */}
          <FileRow
            id="at-favorites"
            label="Favoris et mieux notés"
            hint="Ce que vous gardez près de vous."
            entries={favorites}
            scope="Favoris et mieux notés"
            emptyMessage="Aucun favori ni note pour l'instant."
            onBrowse={onBrowse}
            renderCard={(entry) => (
              <WorkCard
                key={entry.key}
                entry={entry}
                meta={entry.rating !== null ? `Noté ${entry.rating} sur 5` : 'Coup de cœur'}
                showRating
                showHeart
              />
            )}
          />

          {/* Vus, lus et joués : les consommations datées, de la plus récente. */}
          <FileRow
            id="at-consumed"
            label="Vus, lus et joués"
            hint="Vos dernières consommations datées."
            entries={consumed}
            scope="Consommations datées"
            emptyMessage="Aucune œuvre terminée et datée pour l'instant."
            onBrowse={onBrowse}
            renderCard={(entry) => (
              <WorkCard
                key={entry.key}
                entry={entry}
                meta={`${CONSUMED_VERBS[entry.medium]} ${relativeDayLabel(entry.consumedAt as string)}`}
                showRating
              />
            )}
          />

          {/* Une découverte par médium : les files ne sont montées que si la
              collection correspondante contient réellement des œuvres. */}
          {byMedium.map(({ medium, entries: mediumEntries }) => (
            <FileRow
              key={`at-medium-${medium}`}
              id={`at-medium-${medium}`}
              label={MEDIUM_LIBRARY_LABELS[medium]}
              entries={mediumEntries}
              scope={MEDIUM_LIBRARY_LABELS[medium]}
              emptyMessage={`Aucun élément dans ${MEDIUM_LIBRARY_LABELS[medium]}.`}
              onBrowse={onBrowse}
              renderCard={(entry) => (
                <WorkCard key={entry.key} entry={entry} meta={`Ajouté ${relativeDayLabel(entry.createdAt)}`} />
              )}
            />
          ))}
        </div>

        {/* Jour pour jour : le seul actif éditorial propriétaire de l'accueil.
            Il ferme le parcours de découverte : c'est un souvenir, pas le
            premier écran d'un tableau de bord. */}
        {anniversaries.length > 0 && (
          <section className="at-jour" aria-labelledby="at-jour-title">
            <div className="at-jour-head">
              <h2 className="at-label" id="at-jour-title">Jour pour jour</h2>
              <p className="at-hint">Ce que vous en pensiez, à l'époque.</p>
            </div>
            <div className="at-jour-grid">
              {anniversaries.map(({ entry, years }) => (
                <article className="at-jour-item" key={entry.key}>
                  <p className="at-jour-years">{years > 1 ? `Il y a ${years} ans` : 'Il y a 1 an'}</p>
                  <h3 className="at-jour-title">{entry.title}</h3>
                  <p className="at-jour-facts">
                    {MEDIUM_CARD_LABELS[entry.medium]}
                    {entry.subtitle ? ` · ${entry.subtitle}` : ''}
                  </p>
                  {entry.rating !== null && <Stars value={entry.rating} />}
                  {entry.personalNote && <p className="at-jour-note">« {truncateNote(entry.personalNote)} »</p>}
                  <div className="at-jour-link">
                    <button
                      type="button"
                      className="at-quiet"
                      onClick={entry.onOpen}
                      aria-label={`Ouvrir la fiche de ${entry.title}`}
                    >
                      Ouvrir la fiche
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <Doors mediums={uniqueMediums(anniversaries.map((item) => item.entry))} scope="Anniversaires du jour" onBrowse={onBrowse} />
          </section>
        )}

        {/* Cette année : les chiffres réels de l'année et le calendrier. */}
        <section className="at-section" aria-labelledby="at-year-title">
          <div className="at-section-head">
            <h2 className="at-label" id="at-year-title">Cette année</h2>
          </div>
          <div className="at-year-grid">
            <div className="at-year">
              <p className="at-year-figures">
                <b>{year.added}</b> {addedLabel} · <b>{year.consumed}</b> {consumedLabel}
              </p>
              <p className="at-year-detail">
                {year.addedByMedium.size > 0
                  ? MEDIUM_ORDER.filter((medium) => year.addedByMedium.has(medium))
                      .map((medium) => `${MEDIUM_LIBRARY_LABELS[medium]} ${year.addedByMedium.get(medium)}`)
                      .join(' · ')
                  : 'Aucune activité enregistrée cette année.'}
              </p>
            </div>
            <ActivityCalendar activityMap={activityMap} />
          </div>
        </section>
          </>
        )}
      </div>
    </main>
  )
}
