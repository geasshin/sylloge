// Export au format d'import de SensCritique (CSV).
//
// Format officiel : https://www.senscritique.com/l-edito/post/comment_importer_ses_notes_sur_senscritique
// (billet du 25 mars 2025, section « importation de collection » des paramètres du compte). Sept
// colonnes, films et séries seulement :
//   universe       movie | tvshow
//   title          1 à 255 caractères
//   release_date   année sur quatre chiffres
//   rating         nombre entier de 1 à 10
//   is_wishlisted  true | false  (envie de voir)
//   is_recommended true | false  (coup de cœur)
//   is_done        true | false  (vu)
//
// Deux limites assumées, dites dans le bilan :
// - une note Sylloge vaut une demi-étoile : elle est multipliée par deux (4,5 → 9). Un pas plus fin
//   est arrondi au demi-point le plus proche avant conversion, jamais tronqué ;
// - SensCritique ne connaît ni « en attente », ni « abandonné », ni « en cours » : ces fiches
//   partent avec les trois drapeaux à false, et le bilan les compte.
// Les séries n'ont pas d'année dans Sylloge : `release_date` reste vide plutôt que d'inventer.

import type { Film } from './film.ts'
import type { Series } from './series.ts'
import { csvDocument, csvRow, exportDay, ratingOutOfTen } from './serviceCsv.ts'

export const SENSCRITIQUE_HEADER = ['universe', 'title', 'release_date', 'rating', 'is_wishlisted', 'is_recommended', 'is_done'] as const

export type SensCritiqueUniverse = 'movie' | 'tvshow'

export type SensCritiqueReport = {
  universe: SensCritiqueUniverse
  /** Fiches écrites dans le fichier. */
  exported: number
  /** `is_wishlisted` vrai. */
  wishlisted: number
  /** `is_recommended` vrai (coup de cœur Sylloge). */
  recommended: number
  /** `is_done` vrai. */
  done: number
  /** Aucune note : cellule vide, jamais 0 (le barème SensCritique commence à 1). */
  withoutRating: number
  /** Séries sans année : `release_date` vide, l'appariement se fait sur le titre. */
  withoutYear: number
  /** États que le schéma ne sait pas exprimer (en attente, abandonné, en cours, abandonnée). */
  statusNotExpressed: number
  /** Notes qui ont changé en passant au demi-point le plus proche. */
  ratingsRounded: number
}

export type SensCritiquePlan = {
  fileName: string
  /** Chaîne vide quand il n'y a aucune fiche : aucun fichier n'est alors écrit. */
  contents: string
  report: SensCritiqueReport
}

export type SensCritiqueSource =
  | { universe: 'movie'; films: readonly Film[] }
  | { universe: 'tvshow'; series: readonly Series[] }

type Entry = {
  title: string
  year: number | null
  status: string
  rating: number | null
  isFavorite: boolean
}

const WISH_STATUSES = new Set(['à découvrir', 'à voir'])
const DONE_STATUSES = new Set(['terminé', 'vue'])

function entriesOf(source: SensCritiqueSource): Entry[] {
  const raw = source.universe === 'movie'
    ? source.films.map(film => ({ title: film.title, year: film.year, status: film.status, rating: film.rating, isFavorite: film.isFavorite }))
    : source.series.map(series => ({ title: series.title, year: null, status: series.status, rating: series.rating, isFavorite: series.isFavorite }))
  return raw.sort((a, b) => a.title.localeCompare(b.title, 'fr'))
}

export function planSensCritiqueExport(source: SensCritiqueSource, exportedAt: string): SensCritiquePlan {
  const entries = entriesOf(source)
  const report: SensCritiqueReport = {
    universe: source.universe,
    exported: entries.length,
    wishlisted: 0,
    recommended: 0,
    done: 0,
    withoutRating: 0,
    withoutYear: 0,
    statusNotExpressed: 0,
    ratingsRounded: 0,
  }

  const rows = entries.map(entry => {
    const wishlisted = WISH_STATUSES.has(entry.status)
    const done = DONE_STATUSES.has(entry.status)
    const rating = ratingOutOfTen(entry.rating)
    if (wishlisted) report.wishlisted += 1
    if (entry.isFavorite) report.recommended += 1
    if (done) report.done += 1
    if (!wishlisted && !done) report.statusNotExpressed += 1
    if (rating.text === '') report.withoutRating += 1
    if (rating.rounded) report.ratingsRounded += 1
    if (entry.year === null) report.withoutYear += 1
    return csvRow([
      source.universe,
      entry.title,
      entry.year,
      rating.text,
      wishlisted ? 'true' : 'false',
      entry.isFavorite ? 'true' : 'false',
      done ? 'true' : 'false',
    ])
  })

  return {
    fileName: `sylloge-senscritique-${source.universe === 'movie' ? 'films' : 'series'}-${exportDay(exportedAt)}.csv`,
    contents: csvDocument(SENSCRITIQUE_HEADER, rows),
    report,
  }
}
