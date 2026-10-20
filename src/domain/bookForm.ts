import {
  BOOK_CATEGORIES,
  BOOK_STATUSES,
  type Book,
  type BookCategory,
  type BookStatus,
} from './book.ts'

export type BookFormValues = {
  title: string
  author: string
  year: string
  summary: string
  category: BookCategory
  status: BookStatus
  rating: string
  isFavorite: boolean
  volumesRead: string
  volumesTotal: string
  startedAt: string
  coverUrl: string
  personalNote: string
  quotes: string[]
}

export type BookWriteInput = {
  title: string
  author: string | null
  year: number | null
  summary: string | null
  category: BookCategory
  status: BookStatus
  rating: number | null
  isFavorite: boolean
  volumesRead: number | null
  volumesTotal: number | null
  startedAt: string | null
  coverUrl: string | null
  personalNote: string | null
  quotes: string[]
}

export type BookFormErrors = Partial<Record<Exclude<keyof BookFormValues, 'quotes'> | 'quotes', string>>

export type BookValidationResult =
  | { success: true; data: BookWriteInput }
  | { success: false; errors: BookFormErrors }

export const EMPTY_BOOK_FORM: BookFormValues = {
  title: '',
  author: '',
  year: '',
  summary: '',
  category: 'livre',
  status: 'à lire',
  rating: '',
  isFavorite: false,
  volumesRead: '',
  volumesTotal: '',
  startedAt: '',
  coverUrl: '',
  personalNote: '',
  quotes: [],
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
 * Une œuvre longue marquée « lue » est considérée à jour. Si son total de
 * tomes augmente ensuite, elle repasse « en cours ».
 */
export function resolveBookStatusForTotalChange(
  status: BookStatus,
  volumesRead: number | null,
  volumesTotal: number | null,
): BookStatus {
  if (
    status === 'lu'
    && volumesRead !== null
    && volumesTotal !== null
    && volumesRead < volumesTotal
  ) {
    return 'en cours'
  }
  return status
}

export function bookToFormValues(book: Book): BookFormValues {
  return {
    title: book.title,
    author: book.author ?? '',
    year: book.year?.toString() ?? '',
    summary: book.summary ?? '',
    category: book.category,
    status: book.status,
    rating: book.rating?.toString() ?? '',
    isFavorite: book.isFavorite,
    volumesRead: book.volumesRead?.toString() ?? '',
    volumesTotal: book.volumesTotal?.toString() ?? '',
    startedAt: book.startedAt ?? '',
    coverUrl: book.coverUrl ?? '',
    personalNote: book.personalNote ?? '',
    quotes: book.quotes.map((quote) => quote.body),
  }
}

/**
 * 0.6.13 — un livre « à lire » n'a pas encore été ouvert : note, coup de
 * cœur, progression, dates et avis sont purgés au retour en watchlist.
 */
export function purgeBookVerdict(values: BookFormValues): BookFormValues {
  if (values.status !== 'à lire') return values
  return { ...values, rating: '', isFavorite: false, volumesRead: '', startedAt: '', personalNote: '' }
}

export function validateBookForm(rawValues: BookFormValues): BookValidationResult {
  const values = purgeBookVerdict(rawValues)
  const errors: BookFormErrors = {}
  const title = values.title.trim()
  const ratingText = values.rating.trim()
  const yearText = values.year.trim()
  const coverUrl = optionalText(values.coverUrl)
  // Corriger le type ne supprime pas un avancement déjà saisi ou importé.
  // Les mêmes colonnes existent pour toutes les catégories ; le formulaire
  // laisse les compteurs visibles tant qu'ils portent une valeur.
  const hasVolumes = values.category === 'manga' || values.category === 'comics'
    || values.volumesRead.trim() !== '' || values.volumesTotal.trim() !== ''

  if (!title) {
    errors.title = 'Le titre est obligatoire.'
  }

  if (!(BOOK_CATEGORIES as readonly string[]).includes(values.category)) {
    errors.category = 'Choisissez une catégorie disponible.'
  }

  if (!(BOOK_STATUSES as readonly string[]).includes(values.status)) {
    errors.status = 'Choisissez un statut disponible.'
  }

  let year: number | null = null
  if (yearText) {
    year = Number(yearText)
    if (!Number.isInteger(year)) {
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

  let volumesRead: number | null = null
  let volumesTotal: number | null = null
  if (hasVolumes) {
    const volumesReadText = values.volumesRead.trim()
    if (volumesReadText) {
      volumesRead = Number(volumesReadText)
      if (!Number.isInteger(volumesRead) || volumesRead < 0) {
        errors.volumesRead = 'Saisissez un nombre de tomes entier, positif ou nul.'
      }
    }

    const volumesTotalText = values.volumesTotal.trim()
    if (volumesTotalText) {
      volumesTotal = Number(volumesTotalText)
      if (!Number.isInteger(volumesTotal) || volumesTotal < 0) {
        errors.volumesTotal = 'Saisissez un nombre de tomes entier, positif ou nul.'
      }
    }

    if (volumesRead !== null && volumesTotal !== null && volumesRead > volumesTotal) {
      errors.volumesRead = 'Les tomes lus ne peuvent pas dépasser le total.'
    }

    if (values.status === 'lu' && volumesTotal === null && volumesRead !== null) {
      errors.volumesTotal = 'Indiquez le total de tomes pour marquer l’œuvre comme lue.'
    }
  }

  if (values.startedAt && !isCalendarDate(values.startedAt)) {
    errors.startedAt = 'Saisissez une date valide.'
  }

  if (coverUrl && !isHttpUrl(coverUrl)) {
    errors.coverUrl = 'Utilisez une URL complète commençant par http:// ou https://.'
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors }
  }

  const resolvedVolumesRead = hasVolumes && values.status === 'lu' && volumesTotal !== null
    ? volumesTotal
    : volumesRead

  return {
    success: true,
    data: {
      title,
      author: optionalText(values.author),
      year,
      summary: optionalText(values.summary),
      category: values.category,
      status: values.status,
      rating,
      isFavorite: values.isFavorite,
      volumesRead: hasVolumes ? resolvedVolumesRead : null,
      volumesTotal: hasVolumes ? volumesTotal : null,
      startedAt: optionalText(values.startedAt),
      coverUrl,
      personalNote: optionalText(values.personalNote),
      quotes: values.quotes.map((quote) => quote.trim()).filter(Boolean),
    },
  }
}
