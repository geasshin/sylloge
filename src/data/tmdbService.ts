import { invoke } from '@tauri-apps/api/core'
import { resolveFilmPoster } from '../domain/filmPoster.ts'
import { getLocale } from '../i18n/core.ts'

export type TmdbSearchCandidate = {
  tmdbId: number
  title: string
  originalTitle: string | null
  releaseYear: number | null
  synopsis: string | null
  posterUrl: string | null
}

export type TmdbCastMember = {
  name: string
  character: string | null
  portraitUrl: string | null
}

export type TmdbFilmPresentation = {
  tmdbId: number
  title: string
  originalTitle: string | null
  releaseDate: string | null
  runtimeMinutes: number | null
  synopsis: string | null
  directors: string[]
  posterUrl: string | null
  alternativePosterUrls: string[]
  cast: TmdbCastMember[]
}

export type CachedFilmTmdbPresentation = {
  filmId: string
  language: string
  fetchedAt: string
  refreshAfter: string
  expiresAt: string
  refreshDue: boolean
  selectedPosterUrl: string | null
  presentation: TmdbFilmPresentation
}

/** Sans langue explicite, les métadonnées suivent la langue de l’interface (fr-FR ou en-GB). */
export function searchTmdbFilms(query: string, language: string = getLocale()): Promise<TmdbSearchCandidate[]> {
  return invoke('search_tmdb_films', { query, language })
}

export function previewTmdbFilm(tmdbId: number, language: string = getLocale()): Promise<TmdbFilmPresentation> {
  return invoke('preview_tmdb_film', { tmdbId, language })
}

/** Présentation TV bornée pour le préremplissage Séries (jalon 0.4.26). */
export type TmdbSeriesPresentation = {
  tmdbId: number
  title: string
  originalTitle: string | null
  firstAirYear: number | null
  synopsis: string | null
  showrunners: string[]
  cast: string[]
  seasonsTotal: number | null
  posterUrl: string | null
}

export function searchTmdbSeries(query: string, language: string = getLocale()): Promise<TmdbSearchCandidate[]> {
  return invoke('search_tmdb_series', { query, language })
}

export function previewTmdbSeries(tmdbId: number, language: string = getLocale()): Promise<TmdbSeriesPresentation> {
  return invoke('preview_tmdb_series', { tmdbId, language })
}

export function associateFilmWithTmdb(
  filmId: string,
  tmdbId: number,
  language: string = getLocale(),
): Promise<CachedFilmTmdbPresentation> {
  return invoke('associate_film_with_tmdb', { filmId, tmdbId, language })
}

export function refreshFilmTmdbCache(
  filmId: string,
  language: string = getLocale(),
): Promise<CachedFilmTmdbPresentation> {
  return invoke('refresh_film_tmdb_cache', { filmId, language })
}

export function removeTmdbAssociation(filmId: string): Promise<void> {
  return invoke('remove_tmdb_association', { filmId })
}

export function getFilmTmdbCache(filmId: string): Promise<CachedFilmTmdbPresentation | null> {
  return invoke('get_film_tmdb_cache', { filmId })
}

/** Réalisateur issu de l'association locale TMDB, sans nouvel appel réseau. */
export async function resolveFilmDisplayDirector(filmId: string): Promise<string | null> {
  const cached = await getFilmTmdbCache(filmId)
  const directors = cached?.presentation.directors.map((name) => name.trim()).filter(Boolean) ?? []
  return directors.length > 0 ? directors.join(', ') : null
}

/**
 * Affiche montrée pour un film, dans l'ordre : la sélection du cache TMDB,
 * l'affiche TMDB courante, puis l'affiche enregistrée sur la fiche. Une
 * lecture impossible (hors coquille native, par exemple le harnais de
 * recette) rend simplement la valeur de repli.
 */
export async function resolveFilmDisplayPoster(
  filmId: string,
  fallback: string | null = null,
): Promise<string | null> {
  try {
    return resolveFilmPoster(fallback, await getFilmTmdbCache(filmId))
  } catch {
    return fallback
  }
}

export function setFilmTmdbPoster(
  filmId: string,
  posterUrl: string | null,
): Promise<CachedFilmTmdbPresentation> {
  return invoke('set_film_tmdb_poster', { filmId, posterUrl })
}
