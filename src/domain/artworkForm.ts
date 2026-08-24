import {
  ARTWORK_FORMS,
  ARTWORK_STATUSES,
  type Artwork,
  type ArtworkCustomField,
  type ArtworkForm,
  type ArtworkStatus,
} from './artwork.ts'

export type ArtworkFormValues = {
  title: string
  artist: string
  year: string
  form: ArtworkForm
  location: string
  exhibition: string
  status: ArtworkStatus
  isFavorite: boolean
  discoveredAt: string
  imageUrl: string
  personalNote: string
  customFields: ArtworkCustomField[]
}

export type ArtworkWriteInput = {
  title: string
  artist: string | null
  year: number | null
  form: ArtworkForm
  location: string | null
  exhibition: string | null
  status: ArtworkStatus
  isFavorite: boolean
  discoveredAt: string | null
  imageUrl: string | null
  personalNote: string | null
  customFields: ArtworkCustomField[]
}

export type ArtworkFormErrors = Partial<Record<keyof ArtworkFormValues, string>>

export type ArtworkValidationResult =
  | { success: true; data: ArtworkWriteInput }
  | { success: false; errors: ArtworkFormErrors }

export const EMPTY_ARTWORK_FORM: ArtworkFormValues = {
  title: '',
  artist: '',
  year: '',
  form: 'autre',
  location: '',
  exhibition: '',
  status: 'à découvrir',
  isFavorite: false,
  discoveredAt: '',
  imageUrl: '',
  personalNote: '',
  customFields: [],
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

export function artworkToFormValues(artwork: Artwork): ArtworkFormValues {
  return {
    title: artwork.title,
    artist: artwork.artist ?? '',
    year: artwork.year?.toString() ?? '',
    form: artwork.form,
    location: artwork.location ?? '',
    exhibition: artwork.exhibition ?? '',
    status: artwork.status,
    isFavorite: artwork.isFavorite,
    discoveredAt: artwork.discoveredAt ?? '',
    imageUrl: artwork.imageUrl ?? '',
    personalNote: artwork.personalNote ?? '',
    customFields: artwork.customFields.map((field) => ({ ...field })),
  }
}

export function validateArtworkForm(values: ArtworkFormValues): ArtworkValidationResult {
  const errors: ArtworkFormErrors = {}
  const title = values.title.trim()
  const yearText = values.year.trim()
  const imageUrl = optionalText(values.imageUrl)

  if (!title) {
    errors.title = 'Le titre est obligatoire.'
  }

  if (!(ARTWORK_FORMS as readonly string[]).includes(values.form)) {
    errors.form = 'Choisissez une forme d’art disponible.'
  }

  if (!(ARTWORK_STATUSES as readonly string[]).includes(values.status)) {
    errors.status = 'Choisissez un statut disponible.'
  }

  let year: number | null = null
  if (yearText) {
    year = Number(yearText)
    if (!Number.isInteger(year) || year < 1) {
      errors.year = 'Saisissez une année entière positive.'
    }
  }

  if (values.discoveredAt && !isCalendarDate(values.discoveredAt)) {
    errors.discoveredAt = 'Saisissez une date valide.'
  }

  if (imageUrl && !isHttpUrl(imageUrl)) {
    errors.imageUrl = 'Utilisez une URL complète commençant par http:// ou https://.'
  }

  // Champs personnalisés (0.6.12) : une ligne sans nom est ignorée ; un nom
  // sans valeur reste valide. Bornes généreuses mais réelles.
  const customFields: ArtworkCustomField[] = []
  for (const field of values.customFields) {
    const name = field.name.trim()
    if (!name) continue
    customFields.push({ name: name.slice(0, 120), value: field.value.trim().slice(0, 500) })
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors }
  }

  return {
    success: true,
    data: {
      title,
      artist: optionalText(values.artist),
      year,
      form: values.form,
      location: optionalText(values.location),
      exhibition: optionalText(values.exhibition),
      status: values.status,
      isFavorite: values.isFavorite,
      discoveredAt: optionalText(values.discoveredAt),
      imageUrl,
      personalNote: optionalText(values.personalNote),
      customFields,
    },
  }
}
