import { normalizeFilm, type Film } from './film.ts'
import type { SyllogeExportDocument } from './libraryTransfer.ts'

export const SYLLOGE_FILMS_CSV_FORMAT = 'sylloge-films-csv' as const
export const SYLLOGE_FILMS_CSV_VERSION = 1 as const

const EXPORT_CSV_HEADERS = [
  'format',
  'version',
  'exported_at',
  'profile_id',
  'profile_name',
  'profile_created_at',
  'profile_updated_at',
] as const

const FILM_CSV_HEADERS = [
  'film_id',
  'film_profile_id',
  'film_title',
  'film_original_title',
  'film_year',
  'film_status',
  'film_is_favorite',
  'film_rating',
  'film_watched_at',
  'film_personal_note',
  'film_director',
  'film_summary',
  'film_provider_name',
  'film_provider_id',
  'film_poster_url',
  'film_created_at',
  'film_updated_at',
] as const

export const SYLLOGE_FILMS_CSV_HEADER = [...EXPORT_CSV_HEADERS, ...FILM_CSV_HEADERS] as const

type CsvCell = string | number | boolean | null

export function serializeFilmsCsvExport(document: SyllogeExportDocument): string {
  const rows = document.films.length === 0 ? [null] : document.films
  const contents = [
    SYLLOGE_FILMS_CSV_HEADER,
    ...rows.map((film) => exportRow(document, film)),
  ].map(serializeCsvRow)

  return `${contents.join('\r\n')}\r\n`
}

export function filmsCsvExportFileName(exportedAt: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(exportedAt)?.[0] ?? 'export'
  return `sylloge-films-${day}.csv`
}

function exportRow(document: SyllogeExportDocument, film: Film | null): CsvCell[] {
  const exportValues: CsvCell[] = [
    SYLLOGE_FILMS_CSV_FORMAT,
    SYLLOGE_FILMS_CSV_VERSION,
    document.exportedAt,
    document.profile.id,
    document.profile.name,
    document.profile.createdAt,
    document.profile.updatedAt,
  ]

  if (film === null) {
    return [...exportValues, ...Array<string>(FILM_CSV_HEADERS.length).fill('')]
  }

  const canonicalFilm = normalizeFilm(film)

  return [
    ...exportValues,
    canonicalFilm.id,
    canonicalFilm.profileId,
    canonicalFilm.title,
    canonicalFilm.originalTitle,
    canonicalFilm.year,
    canonicalFilm.status,
    canonicalFilm.isFavorite,
    canonicalFilm.rating,
    canonicalFilm.watchedAt,
    canonicalFilm.personalNote,
    canonicalFilm.director,
    canonicalFilm.summary,
    canonicalFilm.providerName,
    canonicalFilm.providerId,
    canonicalFilm.posterUrl,
    canonicalFilm.createdAt,
    canonicalFilm.updatedAt,
  ]
}

function serializeCsvRow(row: readonly CsvCell[]): string {
  return row.map(serializeCsvCell).join(',')
}

function serializeCsvCell(value: CsvCell): string {
  const text = protectSpreadsheetFormula(value)
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function protectSpreadsheetFormula(value: CsvCell): string {
  if (value === null) return ''
  if (typeof value === 'string' && /^[\s\u0000-\u001F\u007F]*[=+\-@']/u.test(value)) return `'${value}`
  return String(value)
}
