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
