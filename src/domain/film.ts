import { normalizeBannerPosition } from './bannerImages.ts'

export const FILM_STATUSES = ['à découvrir', 'en attente', 'terminé', 'abandonné'] as const

export type FilmStatus = (typeof FILM_STATUSES)[number]

export const FILM_STATUS_LABELS: Record<FilmStatus, string> = {
  'à découvrir': 'À découvrir',
  'en attente': 'En attente',
  'terminé': 'Terminé',
  'abandonné': 'Abandonné',
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
  /** Bannière 16:9 (v7) : une adresse d'image, `null` quand aucune n'est choisie. */
  bannerUrl: string | null
  /**
   * Recadrage vertical (v9, migration 0028) : pourcentage d'`object-position`,
   * 0 pour le haut de l'image, 100 pour le bas. `null` = centré.
   */
  bannerPosition: number | null
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
    bannerUrl: emptyOptionalTextToNull(film.bannerUrl),
    bannerPosition: normalizeBannerPosition(film.bannerPosition),
  }
}

function emptyOptionalTextToNull(value: string | null | undefined): string | null {
  return value === '' || value === undefined ? null : value
}
