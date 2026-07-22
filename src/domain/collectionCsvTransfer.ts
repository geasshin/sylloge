import type { CulturalLibrary } from '../data/libraryRepository.ts'
import { filmsCsvExportFileName, serializeFilmsCsvExport } from './csvFilmExport.ts'
import { createLibraryExport } from './libraryTransfer.ts'

export type CsvCollectionMedium = 'films' | 'series' | 'books' | 'games' | 'artworks'

export type CsvCollectionExport = {
  contents: string
  fileName: string
  count: number
  mediumLabel: string
}

type CsvCell = string | number | boolean | null

type CsvExportDefinition = {
  format: string
  fileNamePrefix: string
  mediumLabel: string
  entityHeaders: readonly string[]
  rows: (library: CulturalLibrary) => CsvCell[][]
}

const COMMON_HEADERS = [
  'format',
  'version',
  'exported_at',
  'profile_id',
  'profile_name',
  'profile_created_at',
  'profile_updated_at',
] as const

const CSV_VERSION = 1

const DEFINITIONS: Record<Exclude<CsvCollectionMedium, 'films'>, CsvExportDefinition> = {
  series: {
    format: 'sylloge-series-csv',
    fileNamePrefix: 'sylloge-series',
    mediumLabel: 'série',
    entityHeaders: [
      'series_id', 'series_profile_id', 'series_title', 'series_showrunner', 'series_casting',
      'series_summary', 'series_category', 'series_status', 'series_rating', 'series_is_favorite',
      'series_seasons_seen', 'series_seasons_total', 'series_progress_updated_at', 'series_started_at',
      'series_poster_url', 'series_personal_note', 'series_created_at', 'series_updated_at',
    ],
    rows: (library) => library.series.map((series) => [
      series.id, series.profileId, series.title, series.showrunner, series.casting, series.summary,
      series.category, series.status, series.rating, series.isFavorite, series.seasonsSeen,
      series.seasonsTotal, series.progressUpdatedAt, series.startedAt, series.posterUrl,
      series.personalNote, series.createdAt, series.updatedAt,
    ]),
  },
  books: {
    format: 'sylloge-books-csv',
    fileNamePrefix: 'sylloge-books',
    mediumLabel: 'livre',
    entityHeaders: [
      'book_id', 'book_profile_id', 'book_title', 'book_author', 'book_year', 'book_summary',
      'book_category', 'book_status', 'book_rating', 'book_is_favorite', 'book_volumes_read',
      'book_volumes_total', 'book_progress_updated_at', 'book_started_at', 'book_cover_url',
      'book_personal_note', 'book_quotes_json', 'book_created_at', 'book_updated_at',
    ],
    rows: (library) => library.books.map((book) => [
      book.id, book.profileId, book.title, book.author, book.year, book.summary, book.category,
      book.status, book.rating, book.isFavorite, book.volumesRead, book.volumesTotal,
      book.progressUpdatedAt, book.startedAt, book.coverUrl, book.personalNote,
      JSON.stringify(book.quotes
        .slice()
        .sort((left, right) => left.position - right.position)
        .map((quote) => quote.body)),
      book.createdAt, book.updatedAt,
    ]),
  },
  games: {
    format: 'sylloge-games-csv',
    fileNamePrefix: 'sylloge-games',
    mediumLabel: 'jeu',
    entityHeaders: [
      'game_id', 'game_profile_id', 'game_title', 'game_developer', 'game_platform', 'game_year',
      'game_status', 'game_rating', 'game_is_favorite', 'game_played_at', 'game_cover_url',
      'game_personal_note', 'game_created_at', 'game_updated_at',
    ],
    rows: (library) => library.games.map((game) => [
      game.id, game.profileId, game.title, game.developer, game.platform, game.year, game.status,
      game.rating, game.isFavorite, game.playedAt, game.coverUrl, game.personalNote,
      game.createdAt, game.updatedAt,
    ]),
  },
  artworks: {
    format: 'sylloge-artworks-csv',
    fileNamePrefix: 'sylloge-artworks',
    mediumLabel: 'œuvre',
    entityHeaders: [
      'artwork_id', 'artwork_profile_id', 'artwork_title', 'artwork_artist', 'artwork_year',
      'artwork_form', 'artwork_location', 'artwork_exhibition', 'artwork_status',
      'artwork_is_favorite', 'artwork_discovered_at', 'artwork_image_url',
      'artwork_personal_note', 'artwork_created_at', 'artwork_updated_at',
    ],
    rows: (library) => library.artworks.map((artwork) => [
      artwork.id, artwork.profileId, artwork.title, artwork.artist, artwork.year, artwork.form,
      artwork.location, artwork.exhibition, artwork.status, artwork.isFavorite,
      artwork.discoveredAt, artwork.imageUrl, artwork.personalNote, artwork.createdAt,
      artwork.updatedAt,
    ]),
  },
}

/**
 * Exporte une seule collection dans un CSV v1 stable. Films garde son contrat
 * historique propre afin de ne pas rompre sa réimportation déjà publiée.
 */
export function createCollectionCsvExport(
  library: CulturalLibrary,
  kind: CsvCollectionMedium,
  exportedAt = new Date().toISOString(),
): CsvCollectionExport {
  if (kind === 'films') {
    const document = createLibraryExport({ profile: library.profile, films: library.films }, exportedAt)
    return {
      contents: serializeFilmsCsvExport(document),
      fileName: filmsCsvExportFileName(exportedAt),
      count: library.films.length,
      mediumLabel: 'film',
    }
  }

  const definition = DEFINITIONS[kind]
  const rows = definition.rows(library)
  const metadata: CsvCell[] = [
    definition.format,
    CSV_VERSION,
    exportedAt,
    library.profile.id,
    library.profile.name,
    library.profile.createdAt,
    library.profile.updatedAt,
  ]
  const contents = [
    [...COMMON_HEADERS, ...definition.entityHeaders],
    ...(rows.length === 0
      ? [[...metadata, ...Array<string>(definition.entityHeaders.length).fill('')]]
      : rows.map((row) => [...metadata, ...row])),
  ].map(serializeCsvRow)

  return {
    contents: `${contents.join('\r\n')}\r\n`,
    fileName: `${definition.fileNamePrefix}-${exportedAt.slice(0, 10) || 'export'}.csv`,
    count: rows.length,
    mediumLabel: definition.mediumLabel,
  }
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
