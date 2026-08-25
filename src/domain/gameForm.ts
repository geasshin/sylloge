import { GAME_STATUSES, type Game, type GameStatus } from './game.ts'

export type GameFormValues = {
  title: string
  developer: string
  platform: string
  year: string
  status: GameStatus
  rating: string
  isFavorite: boolean
  playedAt: string
  coverUrl: string
  personalNote: string
}

export type GameWriteInput = {
  title: string
  developer: string | null
  platform: string | null
  year: number | null
  status: GameStatus
  rating: number | null
  isFavorite: boolean
  playedAt: string | null
  coverUrl: string | null
  personalNote: string | null
}

export type GameFormErrors = Partial<Record<keyof GameFormValues, string>>

export type GameValidationResult =
  | { success: true; data: GameWriteInput }
  | { success: false; errors: GameFormErrors }

export const EMPTY_GAME_FORM: GameFormValues = {
  title: '',
  developer: '',
  platform: '',
  year: '',
  status: 'à jouer',
  rating: '',
  isFavorite: false,
  playedAt: '',
  coverUrl: '',
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

export function gameToFormValues(game: Game): GameFormValues {
  return {
    title: game.title,
    developer: game.developer ?? '',
    platform: game.platform ?? '',
    year: game.year?.toString() ?? '',
    status: game.status,
    rating: game.rating?.toString() ?? '',
    isFavorite: game.isFavorite,
    playedAt: game.playedAt ?? '',
    coverUrl: game.coverUrl ?? '',
    personalNote: game.personalNote ?? '',
  }
}

/**
 * 0.6.13 — un jeu « à jouer » n'a pas encore été lancé : note, coup de cœur,
 * date de partie et avis sont purgés au retour en watchlist.
 */
export function purgeGameVerdict(values: GameFormValues): GameFormValues {
  if (values.status !== 'à jouer') return values
  return { ...values, rating: '', isFavorite: false, playedAt: '', personalNote: '' }
}

export function validateGameForm(rawValues: GameFormValues): GameValidationResult {
  const values = purgeGameVerdict(rawValues)
  const errors: GameFormErrors = {}
  const title = values.title.trim()
  const yearText = values.year.trim()
  const ratingText = values.rating.trim()
  const coverUrl = optionalText(values.coverUrl)

  if (!title) {
    errors.title = 'Le titre est obligatoire.'
  }

  if (!(GAME_STATUSES as readonly string[]).includes(values.status)) {
    errors.status = 'Choisissez un statut disponible.'
  }

  let year: number | null = null
  if (yearText) {
    year = Number(yearText)
    if (!Number.isInteger(year) || year < 1) {
      errors.year = 'Saisissez une année entière positive.'
    }
  }

  let rating: number | null = null
  if (ratingText) {
    rating = Number(ratingText)
    if (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2)) {
      errors.rating = 'La note doit aller de 0,5 à 5 par demi-points.'
    }
  }

  if (values.playedAt && !isCalendarDate(values.playedAt)) {
    errors.playedAt = 'Saisissez une date valide.'
  }

  if (coverUrl && !isHttpUrl(coverUrl)) {
    errors.coverUrl = 'Utilisez une URL complète commençant par http:// ou https://.'
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors }
  }

  return {
    success: true,
    data: {
      title,
      developer: optionalText(values.developer),
      platform: optionalText(values.platform),
      year,
      status: values.status,
      rating,
      isFavorite: values.isFavorite,
      playedAt: optionalText(values.playedAt),
      coverUrl,
      personalNote: optionalText(values.personalNote),
    },
  }
}
