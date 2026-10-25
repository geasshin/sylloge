/**
 * Récapitulatif de l'année, façon « Wrapped » : ce que la personne a vu, lu et joué entre le
 * 1er janvier et le 31 décembre, calculé uniquement depuis ce qui est enregistré (date d'accomplissement,
 * note, coup de cœur, bibliothèque). Aucun événement n'est inventé : une œuvre sans date ne compte pas.
 *
 * Décision d'Aurélien du 25 octobre 2026 : le récapitulatif s'ouvre à partir du 10 décembre, porte sur
 * l'année en cours (ou la précédente avant cette date), se lit étape par étape, se retrouve dans les
 * réglages et s'exporte en image, aux deux formats des cartes.
 *
 * Logique pure : aucune dépendance, testée en Node.
 */

import type { ShareItem, ShareLibraryKey } from './shareCard.ts'
import type { ShareFormatId } from './shareFormats.ts'

/** L'ordre des bibliothèques de base, celui de la barre latérale. */
export const RECAP_LIBRARIES: readonly ShareLibraryKey[] = ['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks']

/** Jour d'ouverture du récapitulatif (mois 12 = décembre, indexé à partir de 0). */
export const RECAP_OPENS_ON = { month: 11, day: 10 } as const

/** Les étapes du récapitulatif, chacune avec son visuel exportable. */
export type RecapStep = 'numbers' | 'rhythm' | 'top' | 'discoveries'

export type RecapMonth = { month: number; count: number }

export type RecapCreator = { name: string; library: ShareLibraryKey; count: number }

export type RecapSlice = { library: ShareLibraryKey; count: number }

export type RecapModel = {
  year: number
  /** Œuvres accomplies dans l'année, toutes bibliothèques de base confondues. */
  total: number
  /** Par bibliothèque, de la plus fournie à la moins fournie (les vides sont écartées). */
  perLibrary: RecapSlice[]
  /** La bibliothèque qui a le plus rythmé l'année. */
  leading: ShareLibraryKey | null
  /** Note moyenne des œuvres notées de l'année, au dixième près ; `null` si rien n'est noté. */
  averageRating: number | null
  ratedCount: number
  /** Coups de cœur datés de l'année. */
  favorites: number
  /** Les mieux notées (4 étoiles et plus), de la meilleure à la moins bonne, cinq au plus. */
  topRated: ShareItem[]
  /** La première œuvre de chaque bibliothèque dans l'année, de la plus ancienne à la plus récente, cinq au plus. */
  discoveries: ShareItem[]
  /** Douze cases, janvier à décembre. */
  months: RecapMonth[]
  /** Le mois le plus fourni (le plus tôt en cas d'égalité) ; `null` si l'année est vide. */
  busiest: RecapMonth | null
  /** Les auteurs, réalisateurs ou studios les plus présents cette année, trois au plus. */
  creators: RecapCreator[]
  /** Œuvres sorties cette année et déjà vues, lues ou jouées (au plus cinq). */
  releasedThisYear: ShareItem[]
  /** Première et dernière œuvre de l'année, par leur date. */
  first: ShareItem | null
  last: ShareItem | null
  isEmpty: boolean
}

const MONTH_COUNT = 12

/** La date qui compte : la date propre d'accomplissement, sinon celle de la mise à jour. */
function dateOf(item: ShareItem): string | null {
  return item.doneOn ?? item.doneAt ?? null
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

/** Les œuvres accomplies dans l'année demandée, triées par date. */
export function recapItems(items: readonly ShareItem[], year: number): ShareItem[] {
  return items
    .filter(item => item.done && RECAP_LIBRARIES.includes(item.library) && yearOfDate(dateOf(item)) === year)
    .sort((a, b) => (dateOf(a) ?? '').localeCompare(dateOf(b) ?? '') || a.title.localeCompare(b.title))
}

/**
 * Le récapitulatif d'une année. `libraries` limite aux sept bibliothèques de base (une bibliothèque
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

  const topRated = ofYear
    .filter(item => (item.rating ?? 0) >= 4)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (dateOf(b) ?? '').localeCompare(dateOf(a) ?? ''))
    .slice(0, 5)

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

  const releasedThisYear = ofYear.filter(item => item.year === year).slice(0, 5)

  return {
    year,
    total: ofYear.length,
    perLibrary,
    leading: perLibrary[0]?.library ?? null,
    averageRating,
    ratedCount: rated.length,
    favorites: ofYear.filter(item => item.isFavorite).length,
    topRated,
    discoveries,
    months,
    busiest,
    creators,
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
