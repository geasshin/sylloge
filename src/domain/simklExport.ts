// Export au format d'import CSV de Simkl.
//
// En-tête officiel du modèle : https://simkl.com/ajax/apps/import-data.csv, décrit sur
// https://simkl.com/apps/import/csv (5 Mo maximum, toutes les colonnes facultatives) :
//   simkl_id,TVDB_ID,TMDB,IMDB_ID,MAL_ID,Type,Title,Year,LastEpWatched,Watchlist,WatchedDate,Rating,Memo
// Type : movie | tv | anime. Watchlist : watching, plan to watch, completed, dropped, on hold.
// WatchedDate : JJ-MM-AAAA. Rating : 1 à 10. Memo : texte libre.
//
// Ce que Sylloge sait remplir : TMDB (identifiant stocké sur le film, lien fournisseur pour une
// série ou un animé), Type, Title, Year (films seulement), Watchlist, WatchedDate (films seulement),
// Rating et Memo. Ce qu'il ne remplit pas, volontairement :
// - LastEpWatched : Sylloge compte des saisons, jamais des épisodes. Écrire un numéro d'épisode
//   inventé ferait croire à une progression fausse chez Simkl ;
// - IMDB_ID, MAL_ID, TVDB_ID, simkl_id : aucun n'est stocké.

import type { Film, FilmStatus } from './film.ts'
import type { Series, SeriesStatus } from './series.ts'
import { csvDocument, csvRow, dayOf, exportDay, ratingOutOfTen } from './serviceCsv.ts'

export const SIMKL_HEADER = [
  'simkl_id', 'TVDB_ID', 'TMDB', 'IMDB_ID', 'MAL_ID', 'Type', 'Title', 'Year',
  'LastEpWatched', 'Watchlist', 'WatchedDate', 'Rating', 'Memo',
] as const

export type SimklMedium = 'films' | 'series' | 'anime'

export type SimklType = 'movie' | 'tv' | 'anime'

/** Lien fournisseur relu pour une série ou un animé (table `media_provider_links`). */
export type SimklProviderLink = { providerName: string; providerId: string }

export type SimklReport = {
  medium: SimklMedium
  exported: number
  movies: number
  shows: number
  anime: number
  /** Identifiant TMDB numérique écrit dans la colonne TMDB. */
  withTmdbId: number
  /** Séries et animés : Sylloge ne stocke pas d'année, la cellule reste vide. */
  withoutYear: number
  /** Aucune note : cellule vide, jamais 0. */
  withoutRating: number
  /** Films sans date de visionnage lisible. */
  withoutWatchedDate: number
  /** Séries et animés dont la progression n'est pas transmise (saisons, pas épisodes). */
  progressNotWritten: number
  /** Notes qui ont changé en passant au demi-point le plus proche. */
  ratingsRounded: number
}

export type SimklPlan = {
  fileName: string
  contents: string
  report: SimklReport
}

export type SimklInput = {
  medium: SimklMedium
  films?: readonly Film[]
  series?: readonly Series[]
  anime?: readonly Series[]
  providerLinks?: ReadonlyMap<string, SimklProviderLink>
}

const FILM_WATCHLIST: Record<FilmStatus, string> = {
  terminé: 'completed',
  'à découvrir': 'plan to watch',
  'en attente': 'on hold',
  abandonné: 'dropped',
}

const SERIES_WATCHLIST: Record<SeriesStatus, string> = {
  vue: 'completed',
  'à voir': 'plan to watch',
  'en cours': 'watching',
  abandonnée: 'dropped',
}

const FILE_LABEL: Record<SimklMedium, string> = { films: 'films', series: 'series', anime: 'anime' }

function isTmdb(link: SimklProviderLink | null | undefined): string | null {
  return link && link.providerName.toLowerCase() === 'tmdb' && /^\d+$/u.test(link.providerId) ? link.providerId : null
}

function filmTmdb(film: Film): string | null {
  return film.providerName === null || film.providerId === null ? null : isTmdb({ providerName: film.providerName, providerId: film.providerId })
}

/** JJ-MM-AAAA : premier format accepté par Simkl, sans ambiguïté avec le format américain. */
function simklDate(day: string): string {
  const [year, month, date] = day.split('-')
  return `${date}-${month}-${year}`
}

export function planSimklExport(input: SimklInput, exportedAt: string): SimklPlan {
  const report: SimklReport = {
    medium: input.medium,
    exported: 0,
    movies: 0,
    shows: 0,
    anime: 0,
    withTmdbId: 0,
    withoutYear: 0,
    withoutRating: 0,
    withoutWatchedDate: 0,
    progressNotWritten: 0,
    ratingsRounded: 0,
  }

  const rows: string[] = []
  const push = (values: readonly (string | number | null)[]) => {
    rows.push(csvRow(values))
    report.exported += 1
  }

  if (input.medium === 'films') {
    const films = [...(input.films ?? [])].sort((a, b) => a.title.localeCompare(b.title, 'fr'))
    for (const film of films) {
      const tmdb = filmTmdb(film)
      const rating = ratingOutOfTen(film.rating)
      const day = dayOf(film.watchedAt)
      if (tmdb) report.withTmdbId += 1
      if (rating.text === '') report.withoutRating += 1
      if (rating.rounded) report.ratingsRounded += 1
      if (day === null) report.withoutWatchedDate += 1
      report.movies += 1
      push([
        '', '', tmdb, '', '', 'movie', film.title, film.year, '',
        FILM_WATCHLIST[film.status] ?? 'plan to watch',
        day === null ? '' : simklDate(day),
        rating.text,
        film.personalNote,
      ])
    }
  } else {
    const shows = input.medium === 'series' ? [...(input.series ?? [])] : [...(input.anime ?? [])]
    shows.sort((a, b) => a.title.localeCompare(b.title, 'fr'))
    for (const show of shows) {
      const tmdb = isTmdb(input.providerLinks?.get(show.id))
      const rating = ratingOutOfTen(show.rating)
      if (tmdb) report.withTmdbId += 1
      if (rating.text === '') report.withoutRating += 1
      if (rating.rounded) report.ratingsRounded += 1
      report.withoutYear += 1
      if (show.seasonsSeen !== null) report.progressNotWritten += 1
      if (input.medium === 'series') report.shows += 1
      else report.anime += 1
      push([
        '', '', tmdb, '', '', input.medium === 'series' ? 'tv' : 'anime', show.title, null, '',
        SERIES_WATCHLIST[show.status] ?? 'plan to watch',
        '',
        rating.text,
        show.personalNote,
      ])
    }
  }

  return {
    fileName: `sylloge-simkl-${FILE_LABEL[input.medium]}-${exportDay(exportedAt)}.csv`,
    contents: csvDocument(SIMKL_HEADER, rows),
    report,
  }
}
