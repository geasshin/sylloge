/**
 * Récapitulatif de l'année, façon « Wrapped » : ce que la personne a vu, lu et joué entre le
 * 1er janvier et le 31 décembre, calculé uniquement depuis ce qui est enregistré (date d'accomplissement,
 * note, coup de cœur, bibliothèque, année de sortie, auteur). Aucun événement n'est inventé : une œuvre
 * sans date ne compte pas.
 *
 * Décision d'Aurélien du 25 octobre 2026 : le récapitulatif s'ouvre à partir du 10 décembre, porte sur
 * l'année en cours (ou la précédente avant cette date), se lit étape par étape, se retrouve dans les
 * réglages et s'exporte en image, aux deux formats des cartes. Sa demande du même jour : « plus d'idées,
 * plus de visuels, plus de couleurs » — d'où huit étapes et une couleur par bibliothèque.
 *
 * Logique pure : aucune dépendance, testée en Node.
 */

import type { ShareItem, ShareLibraryKey } from './shareCard.ts'
import type { ShareFormatId } from './shareFormats.ts'

/** L'ordre des bibliothèques de base, celui de la barre latérale. */
export const RECAP_LIBRARIES: readonly ShareLibraryKey[] = ['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks']

/** Jour d'ouverture du récapitulatif (mois 12 = décembre, indexé à partir de 0). */
export const RECAP_OPENS_ON = { month: 11, day: 10 } as const

/**
 * Les étapes du récapitulatif, dans l'ordre de lecture : l'ouverture par les chiffres, l'année qui
 * s'écoule, le palmarès, les mieux notées, la façon de noter, le temps long, les habitudes, les découvertes.
 */
export type RecapStep = 'numbers' | 'rhythm' | 'palmares' | 'top' | 'notes' | 'span' | 'habits' | 'discoveries'

/** Les huit étapes, dans l'ordre. */
export const RECAP_STEPS: readonly RecapStep[] = ['numbers', 'rhythm', 'palmares', 'top', 'notes', 'span', 'habits', 'discoveries']

export type RecapMonth = { month: number; count: number }

export type RecapCreator = { name: string; library: ShareLibraryKey; count: number }

export type RecapSlice = { library: ShareLibraryKey; count: number }

/** Une note possible (0,5 à 5 par demi-étoile) et le nombre d'œuvres qui l'ont reçue. */
export type RecapBucket = { value: number; count: number }

/** Un jour de la semaine (1 = lundi … 7 = dimanche) et le nombre d'œuvres accomplies ce jour-là. */
export type RecapWeekday = { weekday: number; count: number }

export type RecapDay = { date: string; count: number }

/** La plus longue suite de jours consécutifs avec au moins une œuvre. */
export type RecapStreak = { length: number; from: string; to: string }

/** Une décennie et le nombre d'œuvres qui en sont sorties. */
export type RecapDecade = { decade: number; count: number }

/** L'étendue des années de sortie des œuvres de l'année. */
export type RecapSpan = {
  oldest: ShareItem
  newest: ShareItem
  /** Année médiane des œuvres datées, arrondie à l'unité. */
  medianYear: number
  minYear: number
  maxYear: number
  /** Nombre d'œuvres portant une année de sortie. */
  dated: number
  /** Un point par œuvre datée : la frise des années. */
  dots: Array<{ year: number; library: ShareLibraryKey }>
  /** Les décennies représentées, de la plus récente à la plus ancienne. */
  decades: RecapDecade[]
  /** La bibliothèque la plus représentée parmi les œuvres datées. */
  dominant: ShareLibraryKey
}

export type RecapModel = {
  year: number
  /** Œuvres accomplies dans l'année, toutes bibliothèques de base confondues. */
  total: number
  /** Le même compte pour l'année précédente : sert à dire « plus » ou « moins » qu'avant. */
  previousTotal: number
  /** Par bibliothèque, de la plus fournie à la moins fournie (les vides sont écartées). */
  perLibrary: RecapSlice[]
  /** La bibliothèque qui a le plus rythmé l'année. */
  leading: ShareLibraryKey | null
  /** Note moyenne des œuvres notées de l'année, au dixième près ; `null` si rien n'est noté. */
  averageRating: number | null
  /** Note médiane (celle qui coupe la série en deux) ; `null` si rien n'est noté. */
  medianRating: number | null
  ratedCount: number
  /** Dix cases, de 0,5 à 5 étoiles. */
  ratings: RecapBucket[]
  /** Nombre d'œuvres à cinq étoiles. */
  fiveStars: number
  /** Coups de cœur datés de l'année. */
  favorites: number
  /** La meilleure de chaque bibliothèque présente, dans l'ordre des bibliothèques. */
  palmares: Array<{ library: ShareLibraryKey; item: ShareItem }>
  /** Les mieux notées (4 étoiles et plus), de la meilleure à la moins bonne, six au plus. */
  topRated: ShareItem[]
  /** La première œuvre de chaque bibliothèque dans l'année, de la plus ancienne à la plus récente, cinq au plus. */
  discoveries: ShareItem[]
  /** Douze cases, janvier à décembre. */
  months: RecapMonth[]
  /** Le mois le plus fourni (le plus tôt en cas d'égalité) ; `null` si l'année est vide. */
  busiest: RecapMonth | null
  /** Sept cases, lundi à dimanche. */
  weekdays: RecapWeekday[]
  /** Le jour de la semaine le plus fourni (le plus tôt en cas d'égalité) ; `null` si l'année est vide. */
  bestWeekday: number | null
  /** La journée la plus fournie (la plus tôt en cas d'égalité) ; `null` si l'année est vide. */
  bestDay: RecapDay | null
  /** La plus longue suite de jours consécutifs ; `null` si l'année est vide. */
  streak: RecapStreak | null
  /** L'étendue des années de sortie ; `null` si aucune œuvre n'a d'année. */
  span: RecapSpan | null
  /** Les auteurs, réalisateurs ou studios les plus présents cette année, trois au plus. */
  creators: RecapCreator[]
  /** L'auteur ou le réalisateur le plus présent, s'il revient au moins deux fois. */
  topCreator: RecapCreator | null
  /** Œuvres sorties cette année et déjà vues, lues ou jouées (au plus cinq). */
  releasedThisYear: ShareItem[]
  /** Première et dernière œuvre de l'année, par leur date. */
  first: ShareItem | null
  last: ShareItem | null
  isEmpty: boolean
}

const MONTH_COUNT = 12
const WEEKDAY_COUNT = 7

/** La date qui compte : la date propre d'accomplissement, sinon celle de la mise à jour. */
function dateOf(item: ShareItem): string | null {
  return item.doneOn ?? item.doneAt ?? null
}

/** Une date ISO ramenée à `AAAA-MM-JJ`, ou `null`. */
function dayOf(value: string | null): string | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

/** L'année d'une date ISO (AAAA-MM-JJ ou AAAA-MM-JJTHH:mm:ssZ), ou `null`. */
export function yearOfDate(value: string | null): number | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return year
}

function monthOfDate(value: string | null): number | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const month = Number(match[2])
  return month >= 1 && month <= 12 ? month : null
}

/** Le jour de la semaine d'une date `AAAA-MM-JJ`, 1 = lundi … 7 = dimanche (calcul UTC, sans fuseau). */
export function weekdayOfDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(date.getTime())) return null
  const day = date.getUTCDay()
  return day === 0 ? 7 : day
}

/** Les œuvres accomplies dans l'année demandée, triées par date. */
export function recapItems(items: readonly ShareItem[], year: number): ShareItem[] {
  return items
    .filter(item => item.done && RECAP_LIBRARIES.includes(item.library) && yearOfDate(dateOf(item)) === year)
    .sort((a, b) => (dateOf(a) ?? '').localeCompare(dateOf(b) ?? '') || a.title.localeCompare(b.title))
}

/** Le rang d'une œuvre dans un palmarès : coup de cœur d'abord, puis la note, puis la date la plus récente. */
function palmaresRank(a: ShareItem, b: ShareItem): number {
  if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
  const rating = (b.rating ?? 0) - (a.rating ?? 0)
  if (rating !== 0) return rating
  return (dateOf(b) ?? '').localeCompare(dateOf(a) ?? '')
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/** La plus longue suite de jours consécutifs dans une liste de dates `AAAA-MM-JJ`. */
function longestStreak(days: readonly string[]): RecapStreak | null {
  const unique = [...new Set(days)].sort()
  if (unique.length === 0) return null
  let best: RecapStreak = { length: 1, from: unique[0], to: unique[0] }
  let start = unique[0]
  let previous = unique[0]
  let length = 1
  const nextDay = (value: string) => {
    const date = new Date(`${value}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + 1)
    return date.toISOString().slice(0, 10)
  }
  for (const day of unique.slice(1)) {
    if (day === nextDay(previous)) length += 1
    else {
      start = day
      length = 1
    }
    previous = day
    if (length > best.length) best = { length, from: start, to: day }
  }
  return best
}

/**
 * Le récapitulatif d'une année. Seules les sept bibliothèques de base comptent (une bibliothèque
 * ajoutée n'a pas encore sa place dans le récapitulatif).
 */
export function buildRecap(items: readonly ShareItem[], year: number): RecapModel {
  const ofYear = recapItems(items, year)
  const counts = new Map<ShareLibraryKey, number>()
  for (const item of ofYear) counts.set(item.library, (counts.get(item.library) ?? 0) + 1)
  const perLibrary = RECAP_LIBRARIES
    .map(library => ({ library, count: counts.get(library) ?? 0 }))
    .filter(slice => slice.count > 0)
    .sort((a, b) => b.count - a.count || RECAP_LIBRARIES.indexOf(a.library) - RECAP_LIBRARIES.indexOf(b.library))

  const rated = ofYear.filter(item => item.rating !== null)
  const averageRating = rated.length === 0
    ? null
    : Math.round((rated.reduce((sum, item) => sum + (item.rating ?? 0), 0) / rated.length) * 10) / 10
  const medianRating = median(rated.map(item => item.rating ?? 0))
  const buckets = Array.from({ length: 10 }, (_, index) => ({ value: (index + 1) / 2, count: 0 }))
  for (const item of rated) {
    const index = Math.round((item.rating ?? 0) * 2) - 1
    if (index >= 0 && index < buckets.length) buckets[index].count += 1
  }

  const palmares = RECAP_LIBRARIES
    .map(library => {
      const best = ofYear.filter(item => item.library === library).sort(palmaresRank)[0]
      return best ? { library, item: best } : null
    })
    .filter((entry): entry is { library: ShareLibraryKey; item: ShareItem } => entry !== null)

  const topRated = ofYear
    .filter(item => (item.rating ?? 0) >= 4)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (dateOf(b) ?? '').localeCompare(dateOf(a) ?? ''))
    .slice(0, 6)

  const seenLibraries = new Set<ShareLibraryKey>()
  const discoveries: ShareItem[] = []
  for (const item of ofYear) {
    if (seenLibraries.has(item.library)) continue
    seenLibraries.add(item.library)
    discoveries.push(item)
    if (discoveries.length === 5) break
  }

  const months: RecapMonth[] = Array.from({ length: MONTH_COUNT }, (_, index) => ({ month: index + 1, count: 0 }))
  for (const item of ofYear) {
    const month = monthOfDate(dateOf(item))
    if (month !== null) months[month - 1].count += 1
  }
  const busiest = months.reduce<RecapMonth | null>((best, entry) => (entry.count > (best?.count ?? 0) ? entry : best), null)

  // Les jours : la semaine, la journée record et la plus longue série.
  const days = ofYear.map(item => dayOf(dateOf(item))).filter((day): day is string => day !== null)
  const weekdays: RecapWeekday[] = Array.from({ length: WEEKDAY_COUNT }, (_, index) => ({ weekday: index + 1, count: 0 }))
  for (const day of days) {
    const weekday = weekdayOfDate(day)
    if (weekday !== null) weekdays[weekday - 1].count += 1
  }
  const bestWeekday = weekdays.reduce<number | null>((best, entry) => {
    const bestCount = best === null ? 0 : weekdays[best - 1].count
    return entry.count > bestCount ? entry.weekday : best
  }, null)
  const dayCounts = new Map<string, number>()
  for (const day of days) dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
  const bestDay = [...dayCounts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => b.count - a.count || a.date.localeCompare(b.date))[0] ?? null
  const streak = longestStreak(days)

  // L'étendue des années de sortie, quand l'œuvre en porte une.
  const dated = ofYear.filter((item): item is ShareItem & { year: number } => item.year !== null)
  const span: RecapSpan | null = dated.length === 0
    ? null
    : (() => {
        const sorted = [...dated].sort((a, b) => a.year - b.year || a.title.localeCompare(b.title))
        const years = sorted.map(item => item.year)
        const decadeCounts = new Map<number, number>()
        for (const year of years) {
          const decade = Math.floor(year / 10) * 10
          decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1)
        }
        const decades = [...decadeCounts.entries()]
          .map(([decade, count]) => ({ decade, count }))
          .sort((a, b) => b.decade - a.decade)
        const libraryCounts = new Map<ShareLibraryKey, number>()
        for (const item of sorted) libraryCounts.set(item.library, (libraryCounts.get(item.library) ?? 0) + 1)
        const dominant = [...libraryCounts.entries()].sort((a, b) => b[1] - a[1] || RECAP_LIBRARIES.indexOf(a[0]) - RECAP_LIBRARIES.indexOf(b[0]))[0][0]
        return {
          oldest: sorted[0],
          newest: sorted[sorted.length - 1],
          medianYear: Math.round(median(years) ?? sorted[0].year),
          minYear: sorted[0].year,
          maxYear: sorted[sorted.length - 1].year,
          dated: dated.length,
          dots: sorted.map(item => ({ year: item.year, library: item.library })),
          decades,
          dominant,
        }
      })()

  const creatorCounts = new Map<string, RecapCreator>()
  for (const item of ofYear) {
    if (!item.creator) continue
    const key = `${item.library}\u0004${item.creator}`
    const current = creatorCounts.get(key)
    creatorCounts.set(key, current
      ? { ...current, count: current.count + 1 }
      : { name: item.creator, library: item.library, count: 1 })
  }
  const creators = [...creatorCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 3)
  const repeated = [...creators].filter(entry => entry.count >= 2).sort((a, b) => b.count - a.count)

  const releasedThisYear = ofYear.filter(item => item.year === year).slice(0, 5)

  return {
    year,
    total: ofYear.length,
    previousTotal: recapItems(items, year - 1).length,
    perLibrary,
    leading: perLibrary[0]?.library ?? null,
    averageRating,
    medianRating,
    ratedCount: rated.length,
    ratings: buckets,
    fiveStars: rated.filter(item => item.rating === 5).length,
    favorites: ofYear.filter(item => item.isFavorite).length,
    palmares,
    topRated,
    discoveries,
    months,
    busiest,
    weekdays,
    bestWeekday,
    bestDay,
    streak,
    span,
    creators,
    topCreator: repeated[0] ?? null,
    releasedThisYear,
    first: ofYear[0] ?? null,
    last: ofYear[ofYear.length - 1] ?? null,
    isEmpty: ofYear.length === 0,
  }
}

/**
 * L'année proposée : celle en cours à partir du 10 décembre, la précédente avant. Le 9 décembre, la
 * personne peut encore revoir l'année qui s'achève, pas une année incomplète.
 */
export function recapYearFor(now: Date): number {
  const opens = now.getMonth() > RECAP_OPENS_ON.month || (now.getMonth() === RECAP_OPENS_ON.month && now.getDate() >= RECAP_OPENS_ON.day)
  return opens ? now.getFullYear() : now.getFullYear() - 1
}

/** L'année est-elle ouverte à la consultation pour cette date ? */
export function recapIsOpen(year: number, now: Date): boolean {
  return year <= recapYearFor(now)
}

/** Nom de fichier d'un visuel : ASCII seul, daté, sans accent ni espace. */
export function recapFileName(year: number, step: RecapStep, format: ShareFormatId, now: Date = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `sylloge-recap-${year}-${step}-${format}-${day}.png`
}

/** L'année suivante consultable (jamais au-delà de l'année ouverte), ou `null`. */
export function nextRecapYear(year: number, now: Date): number | null {
  return year < recapYearFor(now) ? year + 1 : null
}
