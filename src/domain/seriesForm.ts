import { SERIES_CATEGORIES, SERIES_STATUSES, type Series, type SeriesCategory, type SeriesStatus } from './series.ts'

export type SeriesFormValues = {
  title: string
  showrunner: string
  casting: string
  summary: string
  category: SeriesCategory
  status: SeriesStatus
  rating: string
  isFavorite: boolean
  seasonsSeen: string
  seasonsTotal: string
  startedAt: string
  posterUrl: string
  personalNote: string
}

export type SeriesWriteInput = {
  title: string
  showrunner: string | null
  casting: string | null
  summary: string | null
  category: SeriesCategory
  status: SeriesStatus
  rating: number | null
  isFavorite: boolean
  seasonsSeen: number | null
  seasonsTotal: number | null
  startedAt: string | null
  posterUrl: string | null
  personalNote: string | null
}

export type SeriesFormErrors = Partial<Record<keyof SeriesFormValues, string>>

export type SeriesValidationResult =
  | { success: true; data: SeriesWriteInput }
  | { success: false; errors: SeriesFormErrors }

export const EMPTY_SERIES_FORM: SeriesFormValues = {
  title: '',
  showrunner: '',
  casting: '',
  summary: '',
  category: 'série télé',
  status: 'à voir',
  rating: '',
  isFavorite: false,
  seasonsSeen: '',
  seasonsTotal: '',
  startedAt: '',
  posterUrl: '',
  personalNote: '',
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
 * Une série « vue » est considérée à jour : son compteur de saisons vues
 * rejoint le total connu. Si le total augmente ensuite (nouvelle saison), la
 * série repasse « en cours ».
 */
export function resolveSeriesStatusForTotalChange(
  status: SeriesStatus,
  seasonsSeen: number | null,
  seasonsTotal: number | null,
): SeriesStatus {
  if (
    status === 'vue'
    && seasonsSeen !== null
    && seasonsTotal !== null
    && seasonsSeen < seasonsTotal
  ) {
    return 'en cours'
  }
  return status
}

export function seriesToFormValues(series: Series): SeriesFormValues {
  return {
    title: series.title,
    showrunner: series.showrunner ?? '',
    casting: series.casting ?? '',
    summary: series.summary ?? '',
    category: series.category,
    status: series.status,
    rating: series.rating?.toString() ?? '',
    isFavorite: series.isFavorite,
    seasonsSeen: series.seasonsSeen?.toString() ?? '',
    seasonsTotal: series.seasonsTotal?.toString() ?? '',
    startedAt: series.startedAt ?? '',
    posterUrl: series.posterUrl ?? '',
    personalNote: series.personalNote ?? '',
  }
}

export function validateSeriesForm(values: SeriesFormValues): SeriesValidationResult {
  const errors: SeriesFormErrors = {}
  const title = values.title.trim()
  const ratingText = values.rating.trim()
  const posterUrl = optionalText(values.posterUrl)

  if (!title) {
    errors.title = 'Le titre est obligatoire.'
  }

  if (!(SERIES_CATEGORIES as readonly string[]).includes(values.category)) {
    errors.category = 'Choisissez une catégorie disponible.'
  }

  if (!(SERIES_STATUSES as readonly string[]).includes(values.status)) {
    errors.status = 'Choisissez un statut disponible.'
  }

  let rating: number | null = null
  if (ratingText) {
    rating = Number(ratingText)
    if (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2)) {
      errors.rating = 'La note doit aller de 0,5 à 5 par demi-points.'
    }
  }

  let seasonsSeen: number | null = null
  const seasonsSeenText = values.seasonsSeen.trim()
  if (seasonsSeenText) {
    seasonsSeen = Number(seasonsSeenText)
    if (!Number.isInteger(seasonsSeen) || seasonsSeen < 0) {
      errors.seasonsSeen = 'Saisissez un nombre de saisons entier, positif ou nul.'
    }
  }

  let seasonsTotal: number | null = null
  const seasonsTotalText = values.seasonsTotal.trim()
  if (seasonsTotalText) {
    seasonsTotal = Number(seasonsTotalText)
    if (!Number.isInteger(seasonsTotal) || seasonsTotal < 0) {
      errors.seasonsTotal = 'Saisissez un nombre de saisons entier, positif ou nul.'
    }
  }

  if (seasonsSeen !== null && seasonsTotal !== null && seasonsSeen > seasonsTotal) {
    errors.seasonsSeen = 'Les saisons vues ne peuvent pas dépasser le total.'
  }

  if (values.status === 'vue' && seasonsTotal === null && seasonsSeen !== null) {
    errors.seasonsTotal = 'Indiquez le total de saisons pour marquer la série comme vue.'
  }

  if (values.startedAt && !isCalendarDate(values.startedAt)) {
    errors.startedAt = 'Saisissez une date valide.'
  }

  if (posterUrl && !isHttpUrl(posterUrl)) {
    errors.posterUrl = 'Utilisez une URL complète commençant par http:// ou https://.'
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors }
  }

  // Une série marquée « vue » est à jour : les saisons vues épousent le total.
  const resolvedSeasonsSeen = values.status === 'vue' && seasonsTotal !== null
    ? seasonsTotal
    : seasonsSeen

  return {
    success: true,
    data: {
      title,
      showrunner: optionalText(values.showrunner),
      casting: optionalText(values.casting),
      summary: optionalText(values.summary),
      category: values.category,
      status: values.status,
      rating,
      isFavorite: values.isFavorite,
      seasonsSeen: resolvedSeasonsSeen,
      seasonsTotal,
      startedAt: optionalText(values.startedAt),
      posterUrl,
      personalNote: optionalText(values.personalNote),
    },
  }
}
