import { FILM_STATUSES, type Film, type FilmStatus } from './film.ts'

export type FilmFormValues = {
  title: string
  originalTitle: string
  year: string
  status: FilmStatus
  isFavorite: boolean
  rating: string
  watchedAt: string
  personalNote: string
  director: string
  summary: string
  posterUrl: string
}

export type FilmWriteInput = {
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
  posterUrl: string | null
}

export type FilmFormErrors = Partial<Record<keyof FilmFormValues, string>>

export type FilmValidationResult =
  | { success: true; data: FilmWriteInput }
  | { success: false; errors: FilmFormErrors }

export const EMPTY_FILM_FORM: FilmFormValues = {
  title: '',
  originalTitle: '',
  year: '',
  status: 'à découvrir',
  isFavorite: false,
  rating: '',
  watchedAt: '',
  personalNote: '',
  director: '',
  summary: '',
  posterUrl: '',
}

function optionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 0.6.13 — un film « à découvrir » n'a pas encore été vu : note, coup de
 * cœur, date de visionnage et avis n'ont pas de sens et sont purgés, quel
 * que soit ce que le formulaire contient encore.
 */
export function purgeFilmVerdict(values: FilmFormValues): FilmFormValues {
  if (values.status !== 'à découvrir') return values
  return { ...values, rating: '', isFavorite: false, watchedAt: '', personalNote: '' }
}

export function filmToFormValues(film: Film): FilmFormValues {
  return {
    title: film.title,
    originalTitle: film.originalTitle ?? '',
    year: film.year?.toString() ?? '',
    status: film.status,
    isFavorite: film.isFavorite,
    rating: film.rating?.toString() ?? '',
    watchedAt: film.watchedAt ?? '',
    personalNote: film.personalNote ?? '',
    director: film.director ?? '',
    summary: film.summary ?? '',
    posterUrl: film.posterUrl ?? '',
  }
}

export function validateFilmForm(rawValues: FilmFormValues): FilmValidationResult {
  const values = purgeFilmVerdict(rawValues)
  const errors: FilmFormErrors = {}
  const title = values.title.trim()
  const yearText = values.year.trim()
  const ratingText = values.rating.trim()
  const posterUrl = optionalText(values.posterUrl)

  if (!title) {
    errors.title = 'Le titre est obligatoire.'
  }

  if (!(FILM_STATUSES as readonly string[]).includes(values.status)) {
    errors.status = 'Choisissez un statut disponible.'
  }

  let year: number | null = null
  if (yearText) {
    year = Number(yearText)
    if (!Number.isInteger(year) || year < 1) {
      errors.year = 'Saisissez une année entière.'
    }
  }

  let rating: number | null = null
  if (ratingText) {
    rating = Number(ratingText)
    if (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2)) {
      errors.rating = 'La note doit aller de 0,5 à 5 par demi-points.'
    }
  }

  if (values.watchedAt && !isCalendarDate(values.watchedAt)) {
    errors.watchedAt = 'Saisissez une date valide.'
  }

  if (posterUrl && !isHttpUrl(posterUrl)) {
    errors.posterUrl = 'Utilisez une URL complète commençant par http:// ou https://.'
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors }
  }

  return {
    success: true,
    data: {
      title,
      originalTitle: optionalText(values.originalTitle),
      year,
      status: values.status,
      isFavorite: values.isFavorite,
      rating,
      watchedAt: optionalText(values.watchedAt),
      personalNote: optionalText(values.personalNote),
      director: optionalText(values.director),
      summary: optionalText(values.summary),
      posterUrl,
    },
  }
}

export function localToday(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
