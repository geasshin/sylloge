/**
 * Baguette magique (jalon 0.6.6) : association automatique des fiches non
 * associées à TMDB, film par film, avec score de correspondance sur le titre
 * et l'année. Les fiches déjà associées ne sont jamais retouchées et les
 * données personnelles restent intactes — seule la provenance/cache est créée.
 */
import { associateFilmWithTmdb, searchTmdbFilms, type TmdbSearchCandidate } from '../data/tmdbService.ts'
import type { Film } from '../domain/film.ts'

export type AutoAssociateOutcome = 'associated' | 'no-match'

export type AutoAssociateResult = {
  outcomes: Array<{ film: Film; outcome: AutoAssociateOutcome }>
  associatedCount: number
  noMatchCount: number
}

/** Score de correspondance titre + année entre une fiche locale et un candidat. */
export function scoreCandidate(filmTitle: string, filmYear: number | null, candidate: TmdbSearchCandidate): number {
  const localKey = normalizeTitle(filmTitle)
  const candidateKeys = [candidate.title, candidate.originalTitle].filter((value): value is string => value !== null).map(normalizeTitle)
  let best = 0
  for (const key of candidateKeys) {
    if (key === localKey) best = Math.max(best, 1)
    else if (key.startsWith(localKey) || localKey.startsWith(key)) best = Math.max(best, .85)
    else if (key.includes(localKey) || localKey.includes(key)) best = Math.max(best, .65)
  }
  if (filmYear !== null && candidate.releaseYear === filmYear && best > 0) best = Math.min(1, best + .25)
  else if (filmYear !== null && candidate.releaseYear !== null && Math.abs(candidate.releaseYear - filmYear) >= 2) best -= .2
  return best
}

const normalizeTitle = (title: string): string =>
  title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()

/** Seuil minimal pour accepter une association automatique. */
const MATCH_THRESHOLD = .8
/** Petite pause entre requêtes : on reste un client poli pour TMDB. */
const REQUEST_DELAY_MS = 250

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Associe séquentiellement les films non associés. `onProgress` reçoit
 * l'avancement (traité, total) au fil de l'eau ; `isCancelled` permet
 * d'interrompre proprement entre deux films.
 */
export async function autoAssociateFilms(
  films: Film[],
  language: string,
  onProgress: (processed: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<AutoAssociateResult> {
  const pending = films.filter((film) => !film.providerId || !film.providerName)
  const outcomes: AutoAssociateResult['outcomes'] = []
  let associatedCount = 0
  let processed = 0

  for (const film of pending) {
    if (isCancelled()) break
    try {
      const candidates = await searchTmdbFilms(film.title, language)
      const scored = candidates
        .map((candidate) => ({ candidate, score: scoreCandidate(film.title, film.year, candidate) }))
        .sort((a, b) => b.score - a.score)
      if (scored.length > 0 && scored[0].score >= MATCH_THRESHOLD) {
        await associateFilmWithTmdb(film.id, scored[0].candidate.tmdbId, language)
        outcomes.push({ film, outcome: 'associated' })
        associatedCount += 1
      } else {
        outcomes.push({ film, outcome: 'no-match' })
      }
    } catch {
      outcomes.push({ film, outcome: 'no-match' })
    }
    processed += 1
    onProgress(processed, pending.length)
    await delay(REQUEST_DELAY_MS)
  }

  return { outcomes, associatedCount, noMatchCount: outcomes.length - associatedCount }
}
