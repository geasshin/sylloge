import { EMPTY_FILM_FORM, type FilmFormValues } from './filmForm.ts'

export type FilmMetadataQuery = {
  text: string
}

export type FilmMetadataResult = {
  title: string | null
  originalTitle: string | null
  year: number | null
  director: string | null
  summary: string | null
  posterUrl: string | null
  providerName: string | null
  providerId: string | null
}

export type FilmMetadataPresentation = {
  tmdbId: number
  title: string
  originalTitle: string | null
  releaseDate: string | null
  synopsis: string | null
  directors: string[]
  posterUrl: string | null
}

export type FilmMetadataProvenance = {
  providerName: string
  providerId: string
}

export type FilmMetadataSearchResponse =
  | { kind: 'results'; results: FilmMetadataResult[] }
  | { kind: 'unavailable'; reason: 'not-configured' | 'network-unavailable' }

export type FilmMetadataSource = {
  search(query: FilmMetadataQuery): Promise<FilmMetadataSearchResponse>
}

export type AssistedFilmFormInitialValues = {
  values: FilmFormValues
  provenance: FilmMetadataProvenance | null
}

function optionalText(value: string | null): string {
  return value?.trim() ?? ''
}

export function filmMetadataProvenance(result: FilmMetadataResult): FilmMetadataProvenance | null {
  const providerName = optionalText(result.providerName)
  const providerId = optionalText(result.providerId)

  return providerName && providerId ? { providerName, providerId } : null
}

export function filmMetadataResultToFormInitialValues(result: FilmMetadataResult): AssistedFilmFormInitialValues {
  return {
    values: {
      ...EMPTY_FILM_FORM,
      title: optionalText(result.title),
      originalTitle: optionalText(result.originalTitle),
      year: result.year === null ? '' : String(result.year),
      director: optionalText(result.director),
      summary: optionalText(result.summary),
      posterUrl: optionalText(result.posterUrl),
    },
    provenance: filmMetadataProvenance(result),
  }
}

export function tmdbPresentationToFilmMetadataResult(
  presentation: FilmMetadataPresentation,
): FilmMetadataResult {
  const releaseYear = presentation.releaseDate?.match(/^\d{4}/)?.[0]

  return {
    title: presentation.title,
    originalTitle: presentation.originalTitle,
    year: releaseYear ? Number(releaseYear) : null,
    director: presentation.directors.join(', ') || null,
    summary: presentation.synopsis,
    posterUrl: presentation.posterUrl,
    providerName: 'TMDB',
    providerId: String(presentation.tmdbId),
  }
}

export const unconfiguredFilmMetadataSource: FilmMetadataSource = {
  async search() {
    return { kind: 'unavailable', reason: 'not-configured' }
  },
}

export async function searchFilmMetadata(
  source: FilmMetadataSource,
  query: FilmMetadataQuery,
): Promise<FilmMetadataSearchResponse> {
  try {
    return await source.search(query)
  } catch {
    return { kind: 'unavailable', reason: 'network-unavailable' }
  }
}
