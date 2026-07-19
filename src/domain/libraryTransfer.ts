import { FILM_STATUSES, normalizeFilm, type Film } from './film.ts'
import type { Profile } from './profile.ts'

export const SYLLOGE_EXPORT_FORMAT = 'sylloge-films' as const
export const SYLLOGE_EXPORT_VERSION = 1 as const

export type SyllogeExportProfile = Profile

export type SyllogeExportFilm = Film

export type SyllogeExportDocument = {
  format: typeof SYLLOGE_EXPORT_FORMAT
  version: typeof SYLLOGE_EXPORT_VERSION
  exportedAt: string
  profile: SyllogeExportProfile
  films: SyllogeExportFilm[]
}

export type ImportValidationError = {
  path: string
  message: string
}

export type ImportPreview = {
  document: SyllogeExportDocument | null
  validFilmCount: number
  totalFilmCount: number
  errors: ImportValidationError[]
}

type ExportableLibrary = {
  profile: Profile
  films: Film[]
}

const ROOT_KEYS = ['format', 'version', 'exportedAt', 'profile', 'films'] as const
const PROFILE_KEYS = ['id', 'name', 'createdAt', 'updatedAt'] as const
const FILM_KEYS = [
  'id',
  'profileId',
  'title',
  'originalTitle',
  'year',
  'status',
  'isFavorite',
  'rating',
  'watchedAt',
  'personalNote',
  'director',
  'summary',
  'providerName',
  'providerId',
  'posterUrl',
  'createdAt',
  'updatedAt',
] as const

export function createLibraryExport(library: ExportableLibrary, exportedAt = new Date().toISOString()): SyllogeExportDocument {
  return {
    format: SYLLOGE_EXPORT_FORMAT,
    version: SYLLOGE_EXPORT_VERSION,
    exportedAt,
    profile: { ...library.profile },
    films: library.films.map(normalizeFilm),
  }
}

export function serializeLibraryExport(document: SyllogeExportDocument): string {
  return `${JSON.stringify({
    ...document,
    profile: { ...document.profile },
    films: document.films.map(normalizeFilm),
  }, null, 2)}\n`
}

export function exportFileName(exportedAt: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(exportedAt)?.[0] ?? 'export'
  return `sylloge-films-${day}.json`
}

export function validateLibraryImport(contents: string): ImportPreview {
  let value: unknown

  try {
    value = JSON.parse(contents)
  } catch {
    return invalidDocument('$', 'Le fichier ne contient pas un JSON valide.')
  }

  if (!isRecord(value)) {
    return invalidDocument('$', 'La racine du fichier doit être un objet JSON.')
  }

  const errors: ImportValidationError[] = []
  validateExactKeys(value, ROOT_KEYS, '$', errors)

  if (value.format !== SYLLOGE_EXPORT_FORMAT) {
    addError(errors, '$.format', `Le format attendu est « ${SYLLOGE_EXPORT_FORMAT} ».`)
  }

  if (value.version !== SYLLOGE_EXPORT_VERSION) {
    addError(errors, '$.version', `Seule la version ${SYLLOGE_EXPORT_VERSION} est prise en charge.`)
  }

  validateIsoDate(value.exportedAt, '$.exportedAt', errors)

  const profile = validateProfile(value.profile, errors)
  let totalFilmCount = 0
  let validFilmCount = 0
  const films: Film[] = []
  const filmIds = new Set<string>()

  if (!Array.isArray(value.films)) {
    addError(errors, '$.films', 'La liste des films doit être un tableau.')
  } else {
    totalFilmCount = value.films.length
    value.films.forEach((filmValue, index) => {
      const errorCountBeforeFilm = errors.length
      const film = validateFilm(filmValue, index, profile?.id ?? null, filmIds, errors)
      if (film && errors.length === errorCountBeforeFilm) {
        films.push(film)
        validFilmCount += 1
      }
    })
  }

  if (errors.length > 0 || !profile || typeof value.exportedAt !== 'string') {
    return { document: null, validFilmCount, totalFilmCount, errors }
  }

  return {
    document: {
      format: SYLLOGE_EXPORT_FORMAT,
      version: SYLLOGE_EXPORT_VERSION,
      exportedAt: value.exportedAt,
      profile,
      films,
    },
    validFilmCount,
    totalFilmCount,
    errors: [],
  }
}

function validateProfile(value: unknown, errors: ImportValidationError[]): Profile | null {
  if (!isRecord(value)) {
    addError(errors, '$.profile', 'Le profil doit être un objet.')
    return null
  }

  validateExactKeys(value, PROFILE_KEYS, '$.profile', errors)
  const errorCount = errors.length
  validateNonEmptyString(value.id, '$.profile.id', errors)
  validateNonEmptyString(value.name, '$.profile.name', errors)
  validateIsoDate(value.createdAt, '$.profile.createdAt', errors)
  validateIsoDate(value.updatedAt, '$.profile.updatedAt', errors)

  if (errors.length !== errorCount) return null

  return {
    id: value.id as string,
    name: value.name as string,
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  }
}

function validateFilm(
  value: unknown,
  index: number,
  profileId: string | null,
  filmIds: Set<string>,
  errors: ImportValidationError[],
): Film | null {
  const path = `$.films[${index}]`
  if (!isRecord(value)) {
    addError(errors, path, 'Cette entrée doit être un objet Film.')
    return null
  }

  validateExactKeys(value, FILM_KEYS, path, errors)
  const errorCount = errors.length
  validateNonEmptyString(value.id, `${path}.id`, errors)
  if (typeof value.id === 'string' && value.id.trim()) {
    if (filmIds.has(value.id)) addError(errors, `${path}.id`, 'Cet identifiant Film est présent plusieurs fois.')
    filmIds.add(value.id)
  }
  validateNonEmptyString(value.profileId, `${path}.profileId`, errors)
  if (profileId !== null && value.profileId !== profileId) {
    addError(errors, `${path}.profileId`, 'Le film ne correspond pas au profil exporté.')
  }
  validateNonEmptyString(value.title, `${path}.title`, errors)
  validateOptionalString(value.originalTitle, `${path}.originalTitle`, errors)
  if (value.year !== null && (!Number.isInteger(value.year) || (value.year as number) < 1)) {
    addError(errors, `${path}.year`, 'L’année doit être nulle ou un entier positif.')
  }
  if (!(FILM_STATUSES as readonly unknown[]).includes(value.status)) {
    addError(errors, `${path}.status`, 'Le statut Film est inconnu.')
  }
  if (typeof value.isFavorite !== 'boolean') {
    addError(errors, `${path}.isFavorite`, 'La valeur favori doit être un booléen.')
  }
  if (value.rating !== null && (
    typeof value.rating !== 'number'
    || value.rating < 0.5
    || value.rating > 5
    || !Number.isInteger(value.rating * 2)
  )) {
    addError(errors, `${path}.rating`, 'La note doit être nulle ou aller de 0,5 à 5 par demi-points.')
  }
  validateOptionalString(value.personalNote, `${path}.personalNote`, errors)
  validateOptionalString(value.director, `${path}.director`, errors)
  validateOptionalString(value.summary, `${path}.summary`, errors)
  validateOptionalString(value.providerName, `${path}.providerName`, errors)
  validateOptionalString(value.providerId, `${path}.providerId`, errors)
  validateOptionalString(value.posterUrl, `${path}.posterUrl`, errors)

  const film = normalizeFilm(value as Film)
  if (film.watchedAt !== null && !isCalendarDate(film.watchedAt)) {
    addError(errors, `${path}.watchedAt`, 'La date de visionnage doit être nulle ou au format AAAA-MM-JJ.')
  }
  if (film.posterUrl !== null && !isHttpUrl(film.posterUrl)) {
    addError(errors, `${path}.posterUrl`, 'L’URL d’affiche doit être nulle ou commencer par http:// ou https://.')
  }
  validateIsoDate(value.createdAt, `${path}.createdAt`, errors)
  validateIsoDate(value.updatedAt, `${path}.updatedAt`, errors)

  if (errors.length !== errorCount) return null

  return film
}

function validateExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  path: string,
  errors: ImportValidationError[],
) {
  const expected = new Set(expectedKeys)
  for (const key of expectedKeys) {
    if (!(key in value)) addError(errors, `${path}.${key}`, 'Ce champ est obligatoire dans la version 1.')
  }
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) addError(errors, `${path}.${key}`, 'Ce champ n’appartient pas au format version 1.')
  }
}

function validateNonEmptyString(value: unknown, path: string, errors: ImportValidationError[]) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    addError(errors, path, 'Une chaîne de caractères non vide est attendue.')
  }
}

function validateOptionalString(value: unknown, path: string, errors: ImportValidationError[]) {
  if (value !== null && typeof value !== 'string') {
    addError(errors, path, 'Une chaîne de caractères ou null est attendue.')
  }
}

function validateIsoDate(value: unknown, path: string, errors: ImportValidationError[]) {
  if (typeof value !== 'string' || !isIsoUtc(value)) {
    addError(errors, path, 'Un horodatage UTC ISO 8601 est attendu.')
  }
}

function isIsoUtc(value: string): boolean {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function addError(errors: ImportValidationError[], path: string, message: string) {
  errors.push({ path, message })
}

function invalidDocument(path: string, message: string): ImportPreview {
  return {
    document: null,
    validFilmCount: 0,
    totalFilmCount: 0,
    errors: [{ path, message }],
  }
}
