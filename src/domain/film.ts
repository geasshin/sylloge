export const FILM_STATUSES = ['à découvrir', 'en attente', 'terminé', 'abandonné'] as const

export type FilmStatus = (typeof FILM_STATUSES)[number]

export const FILM_FILTERS = ['all', 'to-discover', 'completed', 'favorites'] as const

export type FilmFilter = (typeof FILM_FILTERS)[number]

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
