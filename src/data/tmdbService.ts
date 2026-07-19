import { invoke } from '@tauri-apps/api/core'

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

export function searchTmdbFilms(query: string, language?: string): Promise<TmdbSearchCandidate[]> {
  return invoke('search_tmdb_films', { query, language })
}

export function associateFilmWithTmdb(
  filmId: string,
  tmdbId: number,
  language?: string,
): Promise<CachedFilmTmdbPresentation> {
  return invoke('associate_film_with_tmdb', { filmId, tmdbId, language })
}

export function refreshFilmTmdbCache(
  filmId: string,
  language?: string,
): Promise<CachedFilmTmdbPresentation> {
  return invoke('refresh_film_tmdb_cache', { filmId, language })
}

export function removeTmdbAssociation(filmId: string): Promise<void> {
  return invoke('remove_tmdb_association', { filmId })
}

export function getFilmTmdbCache(filmId: string): Promise<CachedFilmTmdbPresentation | null> {
  return invoke('get_film_tmdb_cache', { filmId })
}

export function setFilmTmdbPoster(
  filmId: string,
  posterUrl: string | null,
): Promise<CachedFilmTmdbPresentation> {
  return invoke('set_film_tmdb_poster', { filmId, posterUrl })
}
