/**
 * L'accueil met une œuvre à la une, puis range la collection en files par
 * catégorie. Des onglets filtrent toute la page par bibliothèque.
 * Il reste montable dans l'application et dans le harnais de recette.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { Poster } from './Poster.tsx'
import { formatDate, formatNumber, getLocale, t } from '../i18n/core.ts'
import { useHomeAutoplay } from '../domain/preferences.ts'
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

/**
 * Jour local « AAAA-MM-JJ » d'une date personnelle. Une date seule est déjà
 * locale ; un horodatage ISO (progression d'une série ou d'un livre) est
 * ramené au fuseau de la machine, jamais lu en UTC.
 */
function localDayKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : formatCalendarDate(date)
}

/** Clé de médium interne aux modules de l'accueil. */
type MediumFilterKey = 'film' | 'série' | 'animation' | 'livre' | 'manga' | 'jeu' | 'art'

const MEDIUM_CARD_LABELS: Record<MediumFilterKey, string> = {
  film: 'Film',
  'série': 'Série',
  animation: 'Animation japonaise',
  livre: 'Livre',
  manga: 'Manga',
  jeu: 'Jeu',
  art: 'Art',
}

/** Ordre de lecture des sept bibliothèques, partagé par tous les modules. */
const MEDIUM_ORDER: MediumFilterKey[] = ['film', 'série', 'animation', 'livre', 'manga', 'jeu', 'art']

/** Statut d'attente par médium : la file d'attente réelle de l'accueil. */
const QUEUE_STATUSES: Record<MediumFilterKey, readonly string[]> = {
  film: ['à découvrir', 'en attente'],
  'série': ['à voir'],
  animation: ['à voir'],
  livre: ['à lire'],
  manga: ['à lire'],
  jeu: ['à jouer'],
  art: ['à découvrir'],
}

/** Statut « arrivé au bout » par médium : la seule consommation comptée. */
const FINISHED_STATUSES: Record<MediumFilterKey, string> = {
  film: 'terminé',
  'série': 'vue',
  animation: 'vue',
  livre: 'lu',
  manga: 'lu',
  jeu: 'joué',
  art: 'découverte',
}

/** Verbe de la une pour une œuvre terminée : « Vu hier », « Lu le 12 août ». */
const FINISHED_VERBS: Record<MediumFilterKey, string> = {
  film: 'Vu',
  'série': 'Vue',
  animation: 'Vue',
  livre: 'Lu',
  manga: 'Lu',
  jeu: 'Joué',
  art: 'Découverte',
}

const CONTRIBUTOR_LABELS: Record<MediumFilterKey, string> = {
  film: 'Réalisation',
  'série': 'Showrunner',
  animation: 'Showrunner',
  livre: 'Auteur',
  manga: 'Auteur',
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

/** Nombre de cartes gardées dans chaque rangée. */
const RAIL_SHOWN = 12
/** La pioche du jour remplit une rangée de bureau. */
const MEDIUM_DRAWN = 6
/** À la une : coups de cœur de l'onglet, sinon dernières œuvres terminées. */
const FEATURED_FAVORITES = 8
const FEATURED_FALLBACK = 5
/** Défilement automatique de la une, en millisecondes. */
const FEATURED_DELAY = 8000

export type HomeEntry = {
  key: string
  medium: MediumFilterKey
  title: string
  poster: string | null
  contributor: string | null
  /** Identifiant du film : sert à relire son affiche et son réalisateur du cache TMDB. */
  filmId?: string
  /** Année de l'œuvre quand le médium la connaît (les séries n'en ont pas). */
  year: number | null
  createdAt: string
  rating: number | null
  isFavorite: boolean
  /** Statut du médium (libellé brut du domaine) pour les modules par statut. */
  status?: string
  /** Date personnelle la plus récente pour un statut en cours ou terminé. */
  recentAt: string | null
  recentLabel: string | null
  /** Critique personnelle, citée en extrait par la une. */
  personalNote: string | null
  /** « Saison 2 sur 4 », « Tome 11 sur 18 » : progression connue, sinon rien. */
  progressLabel: string | null
  onOpen: () => void
}

function isFinished(entry: HomeEntry): boolean {
  return entry.status === FINISHED_STATUSES[entry.medium]
}

/** « Saison 2 sur 4 » : rien tant que la progression ou le total est inconnu. */
function progressOf(unit: 'Saison' | 'Tome', seen: number | null, total: number | null): string | null {
  if (seen === null || total === null || seen < 1 || total < seen) return null
  return t('{unit} {seen} sur {total}', { unit: t(unit), seen: formatNumber(seen), total: formatNumber(total) })
}

// ————————————————————————————————————————————————————————————————
// Onglets : tout, ou une seule bibliothèque. Chaque onglet porte ses
// libellés accordés pour le bilan, les rangées et l'état vide.
// ————————————————————————————————————————————————————————————————

type HomeTabKey = 'tout' | MediumFilterKey

type HomeTab = {
  key: HomeTabKey
  /** Valeur mémorisée et identifiant DOM, sans accent. */
  slug: string
  label: string
  /** Compteur accordé : singulier, puis pluriel. */
  finished: readonly [string, string]
  /** Mois sans œuvre terminée. */
  none: string
  queue: string
  recent: string
  /** État vide : une phrase, le constat puis ce qui remplira la page. */
  empty: string
}

const HOME_TABS: readonly HomeTab[] = [
  {
    key: 'tout', slug: 'tout', label: 'Tout',
    finished: ['œuvre terminée', 'œuvres terminées'], none: 'Aucune œuvre terminée',
    queue: 'File d’attente', recent: 'Récemment terminés',
    empty: 'Aucune œuvre pour le moment : celles des sept bibliothèques apparaîtront ici.',
  },
  {
    key: 'film', slug: 'films', label: 'Films',
    finished: ['film vu', 'films vus'], none: 'Aucun film vu',
    queue: 'À voir', recent: 'Récemment vus',
    empty: 'Aucun film pour le moment : ceux de la bibliothèque Films apparaîtront ici.',
  },
  {
    key: 'série', slug: 'series', label: 'Séries',
    finished: ['série vue', 'séries vues'], none: 'Aucune série vue',
    queue: 'À voir', recent: 'Récemment vues',
    empty: 'Aucune série pour le moment : celles de la bibliothèque Séries apparaîtront ici.',
  },
  {
    key: 'animation', slug: 'anime', label: 'Animation japonaise',
    finished: ['animation vue', 'animations vues'], none: 'Aucune animation vue',
    queue: 'À voir', recent: 'Récemment vues',
    empty: 'Aucune animation pour le moment : celles de la bibliothèque Animation japonaise apparaîtront ici.',
  },
  {
    key: 'livre', slug: 'livres', label: 'Livres',
    finished: ['livre lu', 'livres lus'], none: 'Aucun livre lu',
    queue: 'À lire', recent: 'Récemment lus',
    empty: 'Aucun livre pour le moment : ceux de la bibliothèque Livres apparaîtront ici.',
  },
  {
    key: 'manga', slug: 'mangas', label: 'Mangas',
    finished: ['manga lu', 'mangas lus'], none: 'Aucun manga lu',
    queue: 'À lire', recent: 'Récemment lus',
    empty: 'Aucun manga pour le moment : ceux de la bibliothèque Mangas apparaîtront ici.',
  },
  {
    key: 'jeu', slug: 'jeux', label: 'Jeux',
    finished: ['jeu joué', 'jeux joués'], none: 'Aucun jeu joué',
    queue: 'À jouer', recent: 'Récemment joués',
    empty: 'Aucun jeu pour le moment : ceux de la bibliothèque Jeux apparaîtront ici.',
  },
  {
    key: 'art', slug: 'art', label: 'Art',
    finished: ['œuvre découverte', 'œuvres découvertes'], none: 'Aucune œuvre découverte',
    queue: 'À découvrir', recent: 'Récemment découvertes',
    empty: 'Aucune œuvre d’art pour le moment : celles de la bibliothèque Art apparaîtront ici.',
  },
]

/** Dernier onglet ouvert, retrouvé d'une session à l'autre. */
const HOME_TAB_STORAGE_KEY = 'sylloge-home-tab'

function readStoredTab(): HomeTabKey {
  try {
    const stored = window.localStorage.getItem(HOME_TAB_STORAGE_KEY)
    return HOME_TABS.find((tab) => tab.slug === stored)?.key ?? 'tout'
  } catch {
    return 'tout'
  }
}

function storeTab(tab: HomeTab) {
  try {
    window.localStorage.setItem(HOME_TAB_STORAGE_KEY, tab.slug)
  } catch {
    // Stockage indisponible : l'onglet reste valable pour la session.
  }
}

/**
 * Cartes d'activité par jour : les œuvres arrivées au bout ce jour-là, dans
 * l'ordre de lecture de la maison. Le jour porte ses œuvres et pas seulement
 * ses médiums, pour que le survol puisse les nommer.
 */
function buildActivityMap(entries: HomeEntry[]): Map<string, HomeEntry[]> {
  const map = new Map<string, HomeEntry[]>()
  for (const entry of entries) {
    if (!isFinished(entry) || entry.recentAt === null) continue
    const day = localDayKey(entry.recentAt)
    const list = map.get(day)
    if (list) list.push(entry)
    else map.set(day, [entry])
  }
  for (const list of map.values()) {
    list.sort((first, second) => MEDIUM_ORDER.indexOf(first.medium) - MEDIUM_ORDER.indexOf(second.medium))
  }
  return map
}

type TabMonth = { key: string; label: string; count: number; current: boolean }
type TabStats = { finished: number; thisMonth: number; months: TabMonth[]; lastTwelveMonths: number }

/**
 * Bilan de l'onglet, calculé à chaque affichage depuis les dates réelles :
 * œuvres terminées, mois civil en cours et douze derniers mois.
 */
function buildTabStats(entries: HomeEntry[], now: Date): TabStats {
  const finished = entries.filter(isFinished)
  const perMonth = new Map<string, number>()
  for (const entry of finished) {
    if (entry.recentAt === null) continue
    const month = localDayKey(entry.recentAt).slice(0, 7)
    perMonth.set(month, (perMonth.get(month) ?? 0) + 1)
  }
  const months = Array.from({ length: 12 }, (_, index): TabMonth => {
    const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1)
    const key = formatCalendarDate(date).slice(0, 7)
    return { key, label: formatDate(date, { month: 'short', year: 'numeric' }), count: perMonth.get(key) ?? 0, current: index === 11 }
  })
  return {
    finished: finished.length,
    thisMonth: months[11].count,
    months,
    lastTwelveMonths: months.reduce((total, month) => total + month.count, 0),
  }
}

/** Activité la plus récente d'abord ; sans date, l'ajout le plus récent. */
function byRecentActivity(first: HomeEntry, second: HomeEntry): number {
  if (first.recentAt !== second.recentAt) {
    if (first.recentAt === null) return 1
    if (second.recentAt === null) return -1
    const delta = second.recentAt.localeCompare(first.recentAt)
    if (delta !== 0) return delta
  }
  return second.createdAt.localeCompare(first.createdAt)
}

/** Œuvres terminées, de la plus récente à la plus ancienne ; à jour égal, celles qui ont une critique. */
function byFinishedDateThenNote(first: HomeEntry, second: HomeEntry): number {
  const firstDay = first.recentAt ? localDayKey(first.recentAt) : ''
  const secondDay = second.recentAt ? localDayKey(second.recentAt) : ''
  return secondDay.localeCompare(firstDay)
    || Number(Boolean(second.personalNote)) - Number(Boolean(first.personalNote))
    || second.createdAt.localeCompare(first.createdAt)
}

/**
 * Œuvres à la une : les coups de cœur de l'onglet. Sans coup de cœur, les
 * dernières œuvres terminées, puis celles en cours, puis les derniers ajouts.
 */
function pickFeatured(entries: HomeEntry[]): HomeEntry[] {
  const featuredFavorites = entries.filter((entry) => entry.isFavorite).sort(byRecentActivity).slice(0, FEATURED_FAVORITES)
  if (featuredFavorites.length > 0) return featuredFavorites
  const finished = entries.filter(isFinished).sort(byFinishedDateThenNote)
  if (finished.length > 0) return finished.slice(0, FEATURED_FALLBACK)
  const inProgress = entries.filter((entry) => entry.status === 'en cours').sort(byRecentActivity)
  if (inProgress.length > 0) return inProgress.slice(0, FEATURED_FALLBACK)
  return [...entries].sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, FEATURED_FALLBACK)
}

// Les formats et traductions sont calculés au rendu pour suivre la langue.
function finishedLabel(count: number, labels: readonly [string, string]): string {
  return t(labels[new Intl.PluralRules(getLocale()).select(count) === 'one' ? 0 : 1])
}

/** Date locale d'une date personnelle, sans passage par UTC. */
function parseLocalDay(value: string): Date {
  const [year, month, day] = localDayKey(value).split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** « aujourd'hui », « hier », « il y a 5 jours », « le 12 août »… */
function relativeDayLabel(value: string): string {
  const date = parseLocalDay(value)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today.getTime() - date.getTime()) / 86_400_000)
  if (days <= 0) return t("aujourd'hui")
  if (days === 1) return t('hier')
  if (days < 7) return t('il y a {count} jours', { count: formatNumber(days) })
  if (days < 14) return t('il y a une semaine')
  if (days < 45) return t('il y a {count} semaines', { count: formatNumber(Math.round(days / 7)) })
  if (date.getFullYear() === today.getFullYear()) return t('le {date}', { date: formatDate(date, { day: 'numeric', month: 'long' }) })
  return t('le {date}', { date: formatDate(date, { dateStyle: 'long' }) })
}

/** Jour lisible d'une clé « AAAA-MM-JJ » (libellé accessible du calendrier). */
function dayLabel(value: string): string {
  return formatDate(parseLocalDay(value), { dateStyle: 'long' })
}

/** Statut et date de la une : « Vu hier », « En cours · Saison 1 sur 2 »… */
function featuredStatus(entry: HomeEntry): string {
  const when = entry.recentAt ? relativeDayLabel(entry.recentAt) : null
  if (isFinished(entry)) return when ? `${t(FINISHED_VERBS[entry.medium])} ${when}` : t(FINISHED_VERBS[entry.medium])
  if (entry.status === 'en cours') return entry.progressLabel ? t('En cours · {progress}', { progress: entry.progressLabel }) : t('En cours')
  const status = entry.status ? t(`${entry.status.charAt(0).toLocaleUpperCase('fr-FR')}${entry.status.slice(1)}`) : ''
  return status && when ? `${status} ${when}` : status
}

/** Nom du visuel attendu pour un médium (fallback compris). */
function posterLabel(medium: MediumFilterKey): 'Affiche' | 'Couverture' | 'Visuel' {
  if (medium === 'film' || medium === 'série' || medium === 'animation') return 'Affiche'
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

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 5.5v13l10-6.5z" />
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
    <span className="at-stars" role="img" aria-label={t('{rating} sur 5', { rating: formatNumber(value) })}>
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
  const src = usePosterSource(entry, resolveFilmPoster)
  return <Poster title={entry.title} src={src} label={posterLabel(entry.medium)} />
}

/**
 * Carte d'une œuvre « posée » : le titre reste visible sous le visuel ; les
 * détails de la rangée sont portés par son nom accessible complet. Sous
 * l'onglet Tout, le médium s'ajoute après le titre, jamais au-dessus.
 */
function WorkCard({
  entry,
  meta,
  showRating = false,
  showContributor = false,
  showMedium = false,
  resolveFilmPoster,
  resolveFilmContributor,
}: {
  entry: HomeEntry
  meta?: string
  showRating?: boolean
  showContributor?: boolean
  showMedium?: boolean
  resolveFilmPoster?: FilmPosterResolver
  resolveFilmContributor?: FilmContributorResolver
}) {
  const cachedContributor = useCachedContributor(entry, showContributor, resolveFilmContributor)

  const medium = t(MEDIUM_CARD_LABELS[entry.medium])
  const rating = showRating && entry.rating !== null ? t('Noté {rating} sur 5', { rating: formatNumber(entry.rating) }) : null
  const favorite = entry.isFavorite ? t('Coup de cœur') : null
  const contributor = showContributor ? usableContributor(entry.contributor) ?? cachedContributor : null
  const contributorFact = contributor ? `${t(CONTRIBUTOR_LABELS[entry.medium])} ${contributor}` : null
  const facts = [medium, contributorFact, meta ?? null, rating, favorite].filter((value): value is string => value !== null).join(' · ')
  const accessibleLabel = `${t('Ouvrir la fiche de {title}', { title: entry.title })}${facts ? `, ${facts}` : ''}`

  return (
    <button type="button" className="at-work" data-medium={entry.medium} onClick={entry.onOpen} aria-label={accessibleLabel}>
      <WorkPoster entry={entry} resolveFilmPoster={resolveFilmPoster} />
      <span className="at-work-cap">
        <span className="at-work-title">{entry.title}</span>
        {(showMedium || contributor) && (
          <span className="at-work-byline" title={contributor ?? undefined}>
            {showMedium && <span className="at-work-medium">{medium}</span>}
            {showMedium && contributor ? ' · ' : null}
            {contributor}
          </span>
        )}
        {meta && <span className="at-work-meta">{meta}</span>}
        {showRating && entry.rating !== null && <Stars value={entry.rating} />}
      </span>
    </button>
  )
}

// ————————————————————————————————————————————————————————————————
// Visuels et crédits du cache local, partagés par les cartes et la une
// ————————————————————————————————————————————————————————————————

/** Affiche affichée : celle du cache TMDB pour un film associé, sinon l'enregistrée. */
function usePosterSource(entry: HomeEntry, resolveFilmPoster?: FilmPosterResolver): string | null {
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

  return src
}

/** Réalisateur lu dans le cache TMDB local quand le crédit enregistré est vide ou factice. */
function useCachedContributor(entry: HomeEntry, enabled: boolean, resolveFilmContributor?: FilmContributorResolver): string | null {
  const [cachedContributor, setCachedContributor] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setCachedContributor(null)
    if (!enabled || usableContributor(entry.contributor) || entry.filmId === undefined || resolveFilmContributor === undefined) {
      return () => { cancelled = true }
    }
    Promise.resolve()
      .then(() => resolveFilmContributor(entry.filmId as string))
      .then((value) => { if (!cancelled) setCachedContributor(usableContributor(value)) }, () => undefined)
    return () => { cancelled = true }
  }, [enabled, entry.contributor, entry.filmId, resolveFilmContributor])

  return cachedContributor
}

/** Préférence système de mouvement réduit, suivie en direct. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return reduced
}

/** Fenêtre ou onglet visible : rien ne défile tant que la page est cachée. */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden)

  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  return visible
}

// ————————————————————————————————————————————————————————————————
// À la une : une œuvre à la fois, défilement automatique accessible
// ————————————————————————————————————————————————————————————————

/**
 * Carrousel de la une. Il avance seul toutes les huit secondes, sauf au
 * survol, pendant le focus clavier, en pause demandée, en mouvement réduit ou
 * quand la page est cachée. Une seule œuvre : ni minuterie ni points.
 */
function FeaturedCarousel({
  entries,
  resolveFilmPoster,
  resolveFilmContributor,
}: {
  entries: HomeEntry[]
  resolveFilmPoster?: FilmPosterResolver
  resolveFilmContributor?: FilmContributorResolver
}) {
  const count = entries.length
  const [index, setIndex] = useState(0)
  /** Chaque navigation manuelle relance le compte à rebours. */
  const [cycle, setCycle] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [keyboardInside, setKeyboardInside] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const pageVisible = usePageVisible()
  const [autoplay] = useHomeAutoplay()
  const current = count > 0 ? index % count : 0
  const canRotate = count > 1 && !reducedMotion && autoplay
  const rotating = canRotate && !paused && !hovered && !keyboardInside && pageVisible

  useEffect(() => {
    if (!rotating) return
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % count), FEATURED_DELAY)
    return () => window.clearTimeout(timer)
  }, [rotating, current, count, cycle])

  const show = (target: number) => {
    setIndex(((target % count) + count) % count)
    setCycle((value) => value + 1)
  }

  // Seul le focus clavier suspend le défilement : un clic de souris dans la
  // une est déjà couvert par le survol.
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    setKeyboardInside(event.target instanceof HTMLElement && event.target.matches(':focus-visible'))
  }
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setKeyboardInside(false)
  }

  if (count === 0) return null

  return (
    <section
      className="at-hero"
      aria-roledescription={t('carrousel')}
      aria-labelledby="at-hero-titre"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <h2 className="visually-hidden" id="at-hero-titre">{t('À la une')}</h2>
      {count > 1 && (
        <div className="at-hero-controls">
          {canRotate && (
            <button
              type="button"
              className="at-hero-btn"
              onClick={() => setPaused((value) => !value)}
              aria-label={t(paused ? 'Reprendre le défilement' : 'Mettre en pause le défilement')}
              title={t(paused ? 'Reprendre le défilement' : 'Mettre en pause le défilement')}
            >
              {paused ? <PlayIcon /> : <PauseIcon />}
            </button>
          )}
          <button type="button" className="at-hero-btn" onClick={() => show(current - 1)} aria-label={t('Œuvre précédente')} title={t('Œuvre précédente')}>
            <ChevronLeft />
          </button>
          <button type="button" className="at-hero-btn" onClick={() => show(current + 1)} aria-label={t('Œuvre suivante')} title={t('Œuvre suivante')}>
            <ChevronRight />
          </button>
          {/* Les points servent au pointeur ; au clavier, les flèches suffisent
              et évitent huit arrêts de tabulation de plus. */}
          <div className="at-hero-dots">
            {entries.map((entry, position) => (
              <button
                key={entry.key}
                type="button"
                className="at-hero-dot"
                tabIndex={-1}
                aria-label={t('Afficher {title} ({position} sur {count})', { title: entry.title, position: formatNumber(position + 1), count: formatNumber(count) })}
                aria-current={position === current ? 'true' : undefined}
                onClick={() => show(position)}
              />
            ))}
          </div>
        </div>
      )}
      <div className="at-hero-slides" aria-live={rotating ? 'off' : 'polite'}>
        {entries.map((entry, position) => (
          <FeaturedSlide
            key={entry.key}
            entry={entry}
            active={position === current}
            label={t('{position} sur {count}', { position: formatNumber(position + 1), count: formatNumber(count) })}
            resolveFilmPoster={resolveFilmPoster}
            resolveFilmContributor={resolveFilmContributor}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * Diapositive de la une : affiche, fond flouté tiré de la même affiche sous un
 * voile, médium et crédit, titre, note et statut, extrait de la critique.
 */
function FeaturedSlide({
  entry,
  active,
  label,
  resolveFilmPoster,
  resolveFilmContributor,
}: {
  entry: HomeEntry
  active: boolean
  label: string
  resolveFilmPoster?: FilmPosterResolver
  resolveFilmContributor?: FilmContributorResolver
}) {
  const src = usePosterSource(entry, resolveFilmPoster)
  const [backdropMissing, setBackdropMissing] = useState(false)
  useEffect(() => { setBackdropMissing(false) }, [src])
  const cachedContributor = useCachedContributor(entry, true, resolveFilmContributor)
  const contributor = usableContributor(entry.contributor) ?? cachedContributor
  const facts = [t(MEDIUM_CARD_LABELS[entry.medium]), entry.year !== null ? formatNumber(entry.year, { useGrouping: false }) : null, contributor]
    .filter((value): value is string => value !== null)
    .join(' · ')
  const note = entry.personalNote?.trim()

  return (
    <div
      className={`at-slide${active ? ' is-active' : ''}`}
      role="group"
      aria-roledescription={t('diapositive')}
      aria-label={label}
      aria-hidden={active ? undefined : true}
      inert={!active}
    >
      {src && !backdropMissing && (
        <div className="at-slide-backdrop" aria-hidden="true">
          <img src={src} alt="" onError={() => setBackdropMissing(true)} />
        </div>
      )}
      <div className="at-slide-body">
        <div className="at-slide-poster">
          <Poster title={entry.title} src={src} label={posterLabel(entry.medium)} />
        </div>
        <div className="at-slide-text">
          <p className="at-slide-meta">{facts}</p>
          <h3 className="at-slide-title">{entry.title}</h3>
          <p className="at-slide-status">
            {entry.rating !== null && <Stars value={entry.rating} />}
            <span>{featuredStatus(entry)}</span>
          </p>
          {note && <p className="at-slide-note">{`« ${note} »`}</p>}
          <div className="at-slide-actions">
            <button type="button" className="primary-button" onClick={entry.onOpen} aria-label={t('Ouvrir la fiche de {title}', { title: entry.title })}>
              {t('Ouvrir la fiche')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Bilan de l'onglet : deux compteurs et douze mois en barres, sur une ligne. */
function TabStatistics({ tab, stats }: { tab: HomeTab; stats: TabStats }) {
  const noun = (count: number) => finishedLabel(count, tab.finished)
  const peak = Math.max(1, ...stats.months.map((month) => month.count))

  return (
    <div className="at-stats" role="group" aria-label={t('Bilan de l’onglet {tab}', { tab: t(tab.label) })}>
      <p className="at-stat"><b>{formatNumber(stats.finished)}</b> <span>{noun(stats.finished)}</span></p>
      <span className="at-stats-rule" aria-hidden="true" />
      <p className="at-stat"><b>{formatNumber(stats.thisMonth)}</b> <span>{t('ce mois-ci')}</span></p>
      <span className="at-stats-rule" aria-hidden="true" />
      <div className="at-spark" aria-hidden="true">
        {stats.months.map((month) => (
          <span key={month.key} className={`at-spark-col${month.current ? ' is-current' : ''}`} title={t('{month} : {count}', { month: month.label, count: formatNumber(month.count) })}>
            <i style={{ height: `${Math.round((month.count / peak) * 100)}%` }} />
          </span>
        ))}
      </div>
      <span className="visually-hidden">{t('{count} {finished} sur 12 mois', { count: formatNumber(stats.lastTwelveMonths), finished: noun(stats.lastTwelveMonths) })}</span>
    </div>
  )
}

/**
 * File horizontale : les flèches restent dans l'en-tête et n'apparaissent que
 * lorsqu'il y a réellement des cartes hors champ. Une file vide est masquée.
 */
function FileRow({
  id,
  label,
  entries,
  renderCard,
  showMeta = false,
  action,
}: {
  id: string
  label: string
  entries: HomeEntry[]
  renderCard: (entry: HomeEntry) => ReactNode
  /** Rangee dont les cartes portent une ligne de contexte sous le titre. */
  showMeta?: boolean
  /** Action propre à la rangée (rafraîchir la pioche), à côté des flèches. */
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

  if (entries.length === 0) return null

  return (
    <section id={id} className={`at-section${showMeta ? ' at-file-meta' : ''}`} aria-labelledby={`${id}-titre`}>
      <div className="at-file-head">
        <h2 className="at-section-title" id={`${id}-titre`}>{label}</h2>
        {(action || overflow) && (
          <div className="at-row-nav">
            {action}
            {overflow && (
              <>
                <button type="button" className="at-row-btn" onClick={() => step(-1)} disabled={atStart} aria-label={t('Faire défiler {label} vers la gauche', { label })}>
                  <ChevronLeft />
                </button>
                <button type="button" className="at-row-btn" onClick={() => step(1)} disabled={atEnd} aria-label={t('Faire défiler {label} vers la droite', { label })}>
                  <ChevronRight />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div
        className="at-lane"
        id={`${id}-voie`}
        ref={laneRef}
        tabIndex={0}
        role="group"
        aria-label={t('{label}, {count} {works}, utilisez les flèches gauche et droite pour faire défiler', { label, count: formatNumber(entries.length), works: finishedLabel(entries.length, ['œuvre', 'œuvres']) })}
      >
        {entries.map(renderCard)}
      </div>
    </section>
  )
}

/** Libellés du journal d'activité, accordés à l'onglet. */
type ActivityJournalCopy = { finished: readonly [string, string]; none: string; showMedium: boolean }

/**
 * Calendrier d'activité : module « mémoire », monochrome, mois par mois. Le
 * journal du mois affiché nomme les œuvres terminées, date par date.
 */
function ActivityCalendar({ activityMap, journal }: { activityMap: Map<string, HomeEntry[]>; journal: ActivityJournalCopy }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const today = new Date()
  const cursor = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstWeekday = (new Date(year, month, 1).getDay() || 7) - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const canGoForward = monthOffset < 0
  const todayKey = formatCalendarDate(today)
  const monthName = formatDate(cursor, { month: 'long', year: 'numeric' })
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`
  const monthEntries = Array.from(activityMap.entries())
    .filter(([key]) => key.startsWith(monthPrefix))
    .sort(([first], [second]) => second.localeCompare(first))
    .flatMap(([key, list]) => list.map((entry) => ({ key, entry })))

  return (
    <div className="at-activity-body">
      <div className="at-calendar">
        <header className="at-cal-nav">
          <button type="button" className="at-cal-button" onClick={() => setMonthOffset((value) => value - 1)} aria-label={t('Mois précédent')}>
            ‹
          </button>
          <h3>{monthName}</h3>
          <button
            type="button"
            className="at-cal-button"
            onClick={() => setMonthOffset((value) => Math.min(0, value + 1))}
            disabled={!canGoForward}
            aria-label={t('Mois suivant')}
          >
            ›
          </button>
        </header>
        <div className="at-cal-weekdays" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index}>{formatDate(new Date(2024, 0, 1 + index), { weekday: 'narrow' })}</span>
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
                <time dateTime={key}>{formatNumber(day)}</time>
                {mediums.length > 0 && (
                  <span className="at-cal-dots" aria-hidden="true">
                    {mediums.map((medium) => (
                      <i key={medium} data-medium={medium} />
                    ))}
                  </span>
                )}
                {dayEntries.length > 0 && (
                  <span className="visually-hidden">
                    {`${dayLabel(key)} : ${dayEntries.map((entry) => `${t(MEDIUM_CARD_LABELS[entry.medium])} « ${entry.title} »`).join(', ')}`}
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
      <div className="at-month">
        <p className="at-month-summary">
          {monthEntries.length > 0
            ? t('{count} {finished} en {month}', { count: formatNumber(monthEntries.length), finished: finishedLabel(monthEntries.length, journal.finished), month: monthName })
            : t('{none} en {month}.', { none: t(journal.none), month: monthName })}
        </p>
        {monthEntries.length > 0 && (
          <ol className="at-month-list">
            {monthEntries.map(({ key, entry }) => (
              <li className="at-month-item" key={`${key}-${entry.key}`}>
                <time dateTime={key}>{formatNumber(Number(key.slice(8, 10)))}</time>
                <button type="button" className="at-month-link" onClick={entry.onOpen} aria-label={t('Ouvrir la fiche de {title}, {date}', { title: entry.title, date: dayLabel(key) })}>
                  {entry.title}
                </button>
                {journal.showMedium && <span className="at-month-medium">{t(MEDIUM_CARD_LABELS[entry.medium])}</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
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
      year: film.year,
      createdAt: film.createdAt,
      rating: film.rating,
      isFavorite: film.isFavorite,
      status: film.status,
      recentAt: film.status === 'terminé' || film.status === 'abandonné' ? film.watchedAt : null,
      recentLabel: film.status === 'terminé' ? 'Vu' : film.status === 'abandonné' ? 'Abandonné' : null,
      personalNote: film.personalNote,
      progressLabel: null,
      onOpen: () => onOpen(film),
    })),
    ...seriesCollection.map((entry) => ({
      key: `series-${entry.id}`,
      medium: entry.category === 'animation' ? 'animation' as const : 'série' as const,
      title: entry.title,
      poster: entry.posterUrl,
      contributor: entry.showrunner,
      year: null,
      createdAt: entry.createdAt,
      rating: entry.rating,
      isFavorite: entry.isFavorite,
      status: entry.status,
      recentAt: entry.status === 'à voir' ? null : entry.progressUpdatedAt ?? entry.startedAt,
      recentLabel: entry.status === 'vue' ? 'Vue' : entry.status === 'abandonnée' ? 'Arrêtée' : entry.status === 'en cours' ? 'En cours' : null,
      personalNote: entry.personalNote,
      progressLabel: progressOf('Saison', entry.seasonsSeen, entry.seasonsTotal),
      onOpen: () => onOpenSeries(entry),
    })),
    ...bookCollection.map((entry) => ({
      key: `book-${entry.id}`,
      medium: entry.category === 'manga' ? 'manga' as const : 'livre' as const,
      title: entry.title,
      poster: entry.coverUrl,
      contributor: entry.author,
      year: entry.year,
      createdAt: entry.createdAt,
      rating: entry.rating,
      isFavorite: entry.isFavorite,
      status: entry.status,
      recentAt: entry.status === 'à lire' ? null : entry.progressUpdatedAt ?? entry.startedAt,
      recentLabel: entry.status === 'lu' ? 'Lu' : entry.status === 'abandonné' ? 'Abandonné' : entry.status === 'en cours' ? 'En cours' : null,
      personalNote: entry.personalNote,
      progressLabel: progressOf('Tome', entry.volumesRead, entry.volumesTotal),
      onOpen: () => onOpenBook(entry),
    })),
    ...gameCollection.map((entry) => ({
      key: `game-${entry.id}`,
      medium: 'jeu' as const,
      title: entry.title,
      poster: entry.coverUrl,
      contributor: entry.developer,
      year: entry.year,
      createdAt: entry.createdAt,
      rating: entry.rating,
      isFavorite: entry.isFavorite,
      status: entry.status,
      recentAt: entry.status === 'à jouer' ? null : entry.playedAt,
      recentLabel: entry.status === 'joué' ? 'Joué' : entry.status === 'abandonné' ? 'Abandonné' : null,
      personalNote: entry.personalNote,
      progressLabel: null,
      onOpen: () => onOpenGame(entry),
    })),
    ...artworkCollection.map((entry) => ({
      key: `artwork-${entry.id}`,
      medium: 'art' as const,
      title: entry.title,
      poster: entry.imageUrl,
      contributor: entry.artist,
      year: entry.year,
      createdAt: entry.createdAt,
      rating: null,
      isFavorite: entry.isFavorite,
      status: entry.status,
      recentAt: entry.status === 'découverte' ? entry.discoveredAt : null,
      recentLabel: entry.status === 'découverte' ? 'Découverte' : null,
      personalNote: entry.personalNote,
      progressLabel: null,
      onOpen: () => onOpenArtwork(entry),
    })),
  ]

  return <HomeDashboard allEntries={allEntries} resolveFilmPoster={resolveFilmPoster} resolveFilmContributor={resolveFilmContributor} scrollRef={scrollRef} />
}

/**
 * Accueil Sylloge : onglets et bilan, œuvre à la une, files par catégorie,
 * puis calendrier d'activité. L'onglet filtre toute la page.
 */
function HomeDashboard({
  allEntries,
  resolveFilmPoster,
  resolveFilmContributor,
  scrollRef,
}: {
  allEntries: HomeEntry[]
  resolveFilmPoster?: FilmPosterResolver
  resolveFilmContributor?: FilmContributorResolver
  scrollRef?: RefObject<HTMLElement | null>
}) {
  const [tab, setTab] = useState<HomeTabKey>(readStoredTab)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const current = HOME_TABS.find((item) => item.key === tab) ?? HOME_TABS[0]
  const isAll = current.key === 'tout'
  const entries = useMemo(
    () => (current.key === 'tout' ? allEntries : allEntries.filter((entry) => entry.medium === current.key)),
    [allEntries, current.key],
  )

  const selectTab = (next: HomeTab) => {
    setTab(next.key)
    storeTab(next)
  }

  // Onglets au clavier : flèches gauche et droite en boucle, Début et Fin.
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const position = HOME_TABS.indexOf(current)
    let next: number
    switch (event.key) {
      case 'ArrowRight': next = (position + 1) % HOME_TABS.length; break
      case 'ArrowLeft': next = (position - 1 + HOME_TABS.length) % HOME_TABS.length; break
      case 'Home': next = 0; break
      case 'End': next = HOME_TABS.length - 1; break
      default: return
    }
    event.preventDefault()
    selectTab(HOME_TABS[next])
    tabRefs.current[next]?.focus()
  }

  const stats = buildTabStats(entries, new Date())
  const featured = useMemo(() => pickFeatured(entries), [entries])
  const favorites = entries
    .filter((entry) => entry.isFavorite)
    .sort((first, second) => (second.rating ?? -1) - (first.rating ?? -1) || (second.recentAt ?? second.createdAt).localeCompare(first.recentAt ?? first.createdAt))
    .slice(0, RAIL_SHOWN)
  const inProgress = entries
    .filter((entry) => entry.status === 'en cours' && (entry.medium === 'série' || entry.medium === 'animation' || entry.medium === 'livre' || entry.medium === 'manga'))
    .sort(byRecentActivity)
    .slice(0, RAIL_SHOWN)
  const queue = entries
    .filter((entry) => QUEUE_STATUSES[entry.medium].includes(entry.status ?? ''))
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .slice(0, RAIL_SHOWN)
  const recent = entries
    .filter((entry) => isFinished(entry) && entry.recentAt !== null)
    .sort((first, second) => second.recentAt!.localeCompare(first.recentAt!))
    .slice(0, RAIL_SHOWN)
  const additions = [...entries].sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, RAIL_SHOWN)
  const activityMap = useMemo(() => buildActivityMap(entries), [entries])

  // Pioche du jour : tirage reproductible par jour et par onglet, renouvelé
  // à la demande pour le seul onglet affiché.
  const selectionDay = formatCalendarDate(new Date())
  const [pickState, setPickState] = useState<Partial<Record<HomeTabKey, { revision: number; previousKeys: string[] }>>>({})
  const pick = useMemo(
    () => drawForMedium(entries, `${selectionDay}-${current.key}-${pickState[current.key]?.revision ?? 0}`, pickState[current.key]?.previousKeys),
    [entries, selectionDay, current.key, pickState],
  )
  const refreshPick = () => {
    setPickState((previous) => ({
      ...previous,
      [tab]: {
        revision: (previous[tab]?.revision ?? 0) + 1,
        previousKeys: pick.map((entry) => entry.key),
      },
    }))
  }

  const cardProps = { showMedium: isAll, resolveFilmPoster, resolveFilmContributor }

  return (
    <main ref={scrollRef} className="main home-main atrium-home" aria-label={t('Accueil')}>
      <div className="at-inner">
        <h1 className="visually-hidden">{t('Accueil')}</h1>
        <div className="at-topbar">
          <div className="seg-group-form at-tabs" role="tablist" aria-label={t('Bibliothèques de l’accueil')} onKeyDown={onTabKeyDown}>
            {HOME_TABS.map((item, position) => (
              <button
                key={item.slug}
                ref={(element) => { tabRefs.current[position] = element }}
                type="button"
                role="tab"
                id={`at-tab-${item.slug}`}
                className={`seg-pill-btn${item.key === tab ? ' on' : ''}`}
                aria-selected={item.key === tab}
                aria-controls="at-tab-panel"
                tabIndex={item.key === tab ? 0 : -1}
                onClick={() => selectTab(item)}
              >
                {t(item.label)}
              </button>
            ))}
          </div>
          <TabStatistics tab={current} stats={stats} />
        </div>

        <div key={current.slug} className="at-tab-panel" role="tabpanel" id="at-tab-panel" aria-labelledby={`at-tab-${current.slug}`}>
          {entries.length === 0 ? (
            <p className="at-empty-tab">{t(current.empty)}</p>
          ) : (
            <>
              <FeaturedCarousel entries={featured} resolveFilmPoster={resolveFilmPoster} resolveFilmContributor={resolveFilmContributor} />

              <div className="at-files">
                <FileRow
                  id="at-favorites"
                  label={t('Coups de cœur')}
                  entries={favorites}
                  renderCard={(entry) => <WorkCard key={entry.key} entry={entry} showRating showContributor {...cardProps} />}
                />
                <FileRow
                  id="at-progress"
                  label={t('En cours')}
                  entries={inProgress}
                  showMeta
                  renderCard={(entry) => <WorkCard key={entry.key} entry={entry} meta={entry.progressLabel ?? undefined} showContributor {...cardProps} />}
                />
                <FileRow
                  id="at-queue"
                  label={t(current.queue)}
                  entries={queue}
                  renderCard={(entry) => <WorkCard key={entry.key} entry={entry} showContributor {...cardProps} />}
                />
                <FileRow
                  id="at-recent"
                  label={t(current.recent)}
                  entries={recent}
                  showMeta
                  renderCard={(entry) => (
                    <WorkCard
                      key={entry.key}
                      entry={entry}
                      meta={`${t(entry.recentLabel ?? 'Activité')} · ${relativeDayLabel(entry.recentAt as string)}`}
                      showRating
                      showContributor
                      {...cardProps}
                    />
                  )}
                />
                <FileRow
                  id="at-additions"
                  label={t('Derniers ajouts')}
                  entries={additions}
                  renderCard={(entry) => <WorkCard key={entry.key} entry={entry} showContributor {...cardProps} />}
                />
                <FileRow
                  id="at-pick"
                  label={t('Pioche du jour')}
                  entries={pick}
                  action={(
                    <button
                      type="button"
                      className="at-refresh-button"
                      onClick={refreshPick}
                      aria-controls="at-pick-voie"
                      aria-label={t('Tirer une autre pioche du jour')}
                      title={t('Tirer une autre pioche')}
                    >
                      <RefreshIcon />
                    </button>
                  )}
                  renderCard={(entry) => <WorkCard key={entry.key} entry={entry} showContributor {...cardProps} />}
                />
              </div>

              <section className="at-section at-activity" aria-labelledby="at-activity-titre">
                <div className="at-file-head">
                  <h2 className="at-section-title" id="at-activity-titre">{t('Activité')}</h2>
                </div>
                <div className="at-activity-panel">
                  <ActivityCalendar activityMap={activityMap} journal={{ finished: current.finished, none: current.none, showMedium: isAll }} />
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
