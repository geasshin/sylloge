export const FILM_STATUSES = ['à découvrir', 'en attente', 'terminé', 'abandonné'] as const

export type FilmStatus = (typeof FILM_STATUSES)[number]

export const FILM_STATUS_LABELS: Record<FilmStatus, string> = {
  'à découvrir': 'À découvrir',
  'en attente': 'En attente',
  'terminé': 'Terminé',
  'abandonné': 'Abandonné',
}

export const FILM_FILTERS = ['all', 'to-discover', 'completed', 'favorites'] as const

export type FilmFilter = (typeof FILM_FILTERS)[number]

export const FILM_FILTER_LABELS: Record<FilmFilter, string> = {
  all: 'Tous',
  'to-discover': 'À découvrir',
  completed: 'Terminés',
  favorites: 'Favoris',
}

export type Film = {
  id: string
  profileId: string
  title: string
  originalTitle: string | null
  year: number | null
  status: FilmStatus
  isFavorite: boolean
  rating: number | null
  watchedAt: string | null
  personalNote: string | null
  director: string | null
  summary: string | null
  providerName: string | null
  providerId: string | null
  posterUrl: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Les formats Films v1 historiques peuvent contenir des chaînes facultatives
 * vides. La donnée locale canonique les représente par null. Cette fonction ne
 * retire aucun caractère d'une chaîne non vide.
 */
export function normalizeFilm(film: Film): Film {
  const providerName = emptyOptionalTextToNull(film.providerName)
  const providerId = emptyOptionalTextToNull(film.providerId)
  const hasCompleteProvenance = providerName !== null && providerId !== null

  return {
    ...film,
    originalTitle: emptyOptionalTextToNull(film.originalTitle),
    watchedAt: emptyOptionalTextToNull(film.watchedAt),
    personalNote: emptyOptionalTextToNull(film.personalNote),
    director: emptyOptionalTextToNull(film.director),
    summary: emptyOptionalTextToNull(film.summary),
    providerName: hasCompleteProvenance ? providerName : null,
    providerId: hasCompleteProvenance ? providerId : null,
    posterUrl: emptyOptionalTextToNull(film.posterUrl),
  }
}

function emptyOptionalTextToNull(value: string | null): string | null {
  return value === '' ? null : value
}
