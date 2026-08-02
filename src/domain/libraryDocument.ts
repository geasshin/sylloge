import { normalizeArtwork, ARTWORK_FORMS, ARTWORK_STATUSES, type Artwork } from './artwork.ts'
import { normalizeBook, BOOK_CATEGORIES, BOOK_STATUSES, type Book, type BookQuote } from './book.ts'
import { FILM_STATUSES, normalizeFilm, type Film } from './film.ts'
import { normalizeGame, GAME_STATUSES, type Game } from './game.ts'
import type { Profile } from './profile.ts'
import { normalizeSeries, SERIES_CATEGORIES, SERIES_STATUSES, type Series } from './series.ts'

export const SYLLOGE_LIBRARY_FORMAT = 'sylloge-library' as const
export const SYLLOGE_LIBRARY_VERSION = 2 as const

export type SyllogeLibraryDocument = {
  format: typeof SYLLOGE_LIBRARY_FORMAT
  version: typeof SYLLOGE_LIBRARY_VERSION
  exportedAt: string
  profile: Profile
  films: Film[]
  series: Series[]
  books: Book[]
  games: Game[]
  artworks: Artwork[]
}

export type LibraryImportValidationError = {
  path: string
  message: string
}

export type LibraryImportPreview = {
  document: SyllogeLibraryDocument | null
  counts: LibraryCollectionCounts
  errors: LibraryImportValidationError[]
}

export type LibraryCollectionCounts = {
  films: number
  series: number
  books: number
  games: number
  artworks: number
}

export type ExportableLibrary = {
  profile: Profile
  films: Film[]
  series: Series[]
  books: Book[]
  games: Game[]
  artworks: Artwork[]
}

const ROOT_KEYS = ['format', 'version', 'exportedAt', 'profile', 'films', 'series', 'books', 'games', 'artworks'] as const
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
const SERIES_KEYS = [
  'id',
  'profileId',
  'title',
  'showrunner',
  'casting',
  'summary',
  'category',
  'status',
  'rating',
  'isFavorite',
  'seasonsSeen',
  'seasonsTotal',
  'progressUpdatedAt',
  'startedAt',
  'posterUrl',
  'personalNote',
  'createdAt',
  'updatedAt',
] as const
const BOOK_KEYS = [
  'id',
  'profileId',
  'title',
  'author',
  'year',
  'summary',
  'category',
  'status',
  'rating',
  'isFavorite',
  'volumesRead',
  'volumesTotal',
  'progressUpdatedAt',
  'startedAt',
  'coverUrl',
  'personalNote',
  'createdAt',
  'updatedAt',
  'quotes',
] as const
const QUOTE_KEYS = ['id', 'bookId', 'body', 'position', 'createdAt'] as const
const GAME_KEYS = [
  'id',
  'profileId',
  'title',
  'developer',
  'platform',
  'year',
  'status',
  'rating',
  'isFavorite',
  'playedAt',
  'coverUrl',
  'personalNote',
  'createdAt',
  'updatedAt',
] as const
const ARTWORK_KEYS = [
  'id',
  'profileId',
  'title',
  'artist',
  'year',
  'form',
  'location',
  'exhibition',
  'status',
  'isFavorite',
  'discoveredAt',
  'imageUrl',
  'personalNote',
  'createdAt',
  'updatedAt',
] as const

export function createLibraryDocument(
  library: ExportableLibrary,
  exportedAt = new Date().toISOString(),
): SyllogeLibraryDocument {
  return {
    format: SYLLOGE_LIBRARY_FORMAT,
    version: SYLLOGE_LIBRARY_VERSION,
    exportedAt,
    profile: { ...library.profile },
    films: library.films.map(normalizeFilm),
    series: library.series.map(normalizeSeries),
    books: library.books.map(normalizeBook),
    games: library.games.map(normalizeGame),
    artworks: library.artworks.map(normalizeArtwork),
  }
}

export function serializeLibraryDocument(document: SyllogeLibraryDocument): string {
  return `${JSON.stringify(createLibraryDocument(document, document.exportedAt), null, 2)}\n`
}

export function libraryExportFileName(exportedAt: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(exportedAt)?.[0] ?? 'export'
  return `sylloge-library-${day}.json`
}

export function validateLibraryDocument(contents: string): LibraryImportPreview {
  const emptyCounts: LibraryCollectionCounts = { films: 0, series: 0, books: 0, games: 0, artworks: 0 }
  let value: unknown

  try {
    value = JSON.parse(contents)
  } catch {
    return invalidDocument('$', 'Le fichier ne contient pas un JSON valide.', emptyCounts)
  }

  if (!isRecord(value)) {
    return invalidDocument('$', 'La racine du fichier doit être un objet JSON.', emptyCounts)
  }

  const errors: LibraryImportValidationError[] = []
  validateExactKeys(value, ROOT_KEYS, '$', errors)

  if (value.format !== SYLLOGE_LIBRARY_FORMAT) {
    addError(errors, '$.format', `Le format attendu est « ${SYLLOGE_LIBRARY_FORMAT} ».`)
  }

  if (value.version !== SYLLOGE_LIBRARY_VERSION) {
    addError(errors, '$.version', `Seule la version ${SYLLOGE_LIBRARY_VERSION} est prise en charge.`)
  }

  validateIsoDate(value.exportedAt, '$.exportedAt', errors)

  const profile = validateProfile(value.profile, errors)
  const ids = new Set<string>()
  const films = validateCollection(value.films, '$.films', (filmValue, index) =>
    validateFilm(filmValue, index, profile?.id ?? null, ids, errors),
  )
  const series = validateCollection(value.series, '$.series', (seriesValue, index) =>
    validateSeries(seriesValue, index, profile?.id ?? null, ids, errors),
  )
  const books = validateCollection(value.books, '$.books', (bookValue, index) =>
    validateBook(bookValue, index, profile?.id ?? null, ids, errors),
  )
  const games = validateCollection(value.games, '$.games', (gameValue, index) =>
    validateGame(gameValue, index, profile?.id ?? null, ids, errors),
  )
  const artworks = validateCollection(value.artworks, '$.artworks', (artworkValue, index) =>
    validateArtwork(artworkValue, index, profile?.id ?? null, ids, errors),
  )

  const counts: LibraryCollectionCounts = {
    films: films?.length ?? 0,
    series: series?.length ?? 0,
    books: books?.length ?? 0,
    games: games?.length ?? 0,
    artworks: artworks?.length ?? 0,
  }

  if (
    errors.length > 0
    || !profile
    || typeof value.exportedAt !== 'string'
    || !films
    || !series
    || !books
    || !games
    || !artworks
  ) {
    return { document: null, counts, errors }
  }

  return {
    document: {
      format: SYLLOGE_LIBRARY_FORMAT,
      version: SYLLOGE_LIBRARY_VERSION,
      exportedAt: value.exportedAt,
      profile,
      films,
      series,
      books,
      games,
      artworks,
    },
    counts,
    errors: [],
  }
}

function validateCollection<T>(
  value: unknown,
  path: string,
  validateItem: (item: unknown, index: number) => T | null,
): T[] | null {
  const items: T[] = []
  if (!Array.isArray(value)) {
    return null
  }
  value.forEach((item, index) => {
    const validated = validateItem(item, index)
    if (validated) items.push(validated)
  })
  return items
}

function validateProfile(value: unknown, errors: LibraryImportValidationError[]): Profile | null {
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

function validateSharedIdentity(
  value: Record<string, unknown>,
  path: string,
  expectedKeys: readonly string[],
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
  itemLabel: string,
): boolean {
  validateExactKeys(value, expectedKeys, path, errors)
  const errorCount = errors.length
  validateNonEmptyString(value.id, `${path}.id`, errors)
  if (typeof value.id === 'string' && value.id.trim()) {
    if (ids.has(value.id)) {
      addError(errors, `${path}.id`, `Cet identifiant ${itemLabel} est présent plusieurs fois.`)
    }
    ids.add(value.id)
  }
  validateNonEmptyString(value.profileId, `${path}.profileId`, errors)
  if (profileId !== null && value.profileId !== profileId) {
    addError(errors, `${path}.profileId`, `Cet élément ${itemLabel} ne correspond pas au profil exporté.`)
  }
  validateNonEmptyString(value.title, `${path}.title`, errors)
  validateIsoDate(value.createdAt, `${path}.createdAt`, errors)
  validateIsoDate(value.updatedAt, `${path}.updatedAt`, errors)
  return errors.length === errorCount
}

function validateRating(value: unknown, path: string, errors: LibraryImportValidationError[]) {
  if (value !== null && (
    typeof value !== 'number'
    || value < 0.5
    || value > 5
    || !Number.isInteger(value * 2)
  )) {
    addError(errors, path, 'La note doit être nulle ou aller de 0,5 à 5 par demi-points.')
  }
}

function validateOptionalYear(value: unknown, path: string, errors: LibraryImportValidationError[]) {
  if (value !== null && (!Number.isInteger(value) || (value as number) < 1)) {
    addError(errors, path, 'L’année doit être nulle ou un entier positif.')
  }
}

function validateOptionalProgress(
  value: unknown,
  path: string,
  errors: LibraryImportValidationError[],
) {
  if (value !== null && (!Number.isInteger(value) || (value as number) < 0)) {
    addError(errors, path, 'La progression doit être nulle ou un entier positif ou nul.')
  }
}

function validateOptionalCalendarDate(
  value: string | null,
  path: string,
  errors: LibraryImportValidationError[],
  label: string,
) {
  if (value !== null && !isCalendarDate(value)) {
    addError(errors, path, `${label} doit être nulle ou au format AAAA-MM-JJ.`)
  }
}

function validateOptionalHttpUrl(
  value: string | null,
  path: string,
  errors: LibraryImportValidationError[],
  label: string,
) {
  if (value !== null && !isHttpUrl(value)) {
    addError(errors, path, `${label} doit être nulle ou commencer par http:// ou https://.`)
  }
}

function validateFilm(
  value: unknown,
  index: number,
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
): Film | null {
  const path = `$.films[${index}]`
  if (!isRecord(value)) {
    addError(errors, path, 'Cette entrée doit être un objet Film.')
    return null
  }

  const identityValid = validateSharedIdentity(value, path, FILM_KEYS, profileId, ids, errors, 'Film')
  validateOptionalString(value.originalTitle, `${path}.originalTitle`, errors)
  validateOptionalYear(value.year, `${path}.year`, errors)
  if (!(FILM_STATUSES as readonly unknown[]).includes(value.status)) {
    addError(errors, `${path}.status`, 'Le statut Film est inconnu.')
  }
  if (typeof value.isFavorite !== 'boolean') {
    addError(errors, `${path}.isFavorite`, 'La valeur favori doit être un booléen.')
  }
  validateRating(value.rating, `${path}.rating`, errors)
  validateOptionalString(value.personalNote, `${path}.personalNote`, errors)
  validateOptionalString(value.director, `${path}.director`, errors)
  validateOptionalString(value.summary, `${path}.summary`, errors)
  validateOptionalString(value.providerName, `${path}.providerName`, errors)
  validateOptionalString(value.providerId, `${path}.providerId`, errors)
  validateOptionalString(value.posterUrl, `${path}.posterUrl`, errors)

  const film = normalizeFilm(value as Film)
  validateOptionalCalendarDate(film.watchedAt, `${path}.watchedAt`, errors, 'La date de visionnage')
  validateOptionalHttpUrl(film.posterUrl, `${path}.posterUrl`, errors, 'L’URL d’affiche')

  if (!identityValid || hasPathError(errors, path)) return null

  return film
}

function validateSeries(
  value: unknown,
  index: number,
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
): Series | null {
  const path = `$.series[${index}]`
  if (!isRecord(value)) {
    addError(errors, path, 'Cette entrée doit être un objet Série.')
    return null
  }

  const identityValid = validateSharedIdentity(value, path, SERIES_KEYS, profileId, ids, errors, 'Série')
  validateOptionalString(value.showrunner, `${path}.showrunner`, errors)
  validateOptionalString(value.casting, `${path}.casting`, errors)
  validateOptionalString(value.summary, `${path}.summary`, errors)
  if (!(SERIES_CATEGORIES as readonly unknown[]).includes(value.category)) {
    addError(errors, `${path}.category`, 'La catégorie Série est inconnue.')
  }
  if (!(SERIES_STATUSES as readonly unknown[]).includes(value.status)) {
    addError(errors, `${path}.status`, 'Le statut Série est inconnu.')
  }
  validateRating(value.rating, `${path}.rating`, errors)
  if (typeof value.isFavorite !== 'boolean') {
    addError(errors, `${path}.isFavorite`, 'La valeur favori doit être un booléen.')
  }
  validateOptionalProgress(value.seasonsSeen, `${path}.seasonsSeen`, errors)
  validateOptionalProgress(value.seasonsTotal, `${path}.seasonsTotal`, errors)
  if (
    typeof value.seasonsSeen === 'number'
    && typeof value.seasonsTotal === 'number'
    && value.seasonsSeen > value.seasonsTotal
  ) {
    addError(errors, `${path}.seasonsSeen`, 'Les saisons vues ne peuvent pas dépasser le total de saisons.')
  }
  validateOptionalString(value.posterUrl, `${path}.posterUrl`, errors)
  validateOptionalString(value.personalNote, `${path}.personalNote`, errors)

  const series = normalizeSeries(value as Series)
  validateOptionalCalendarDate(series.startedAt, `${path}.startedAt`, errors, 'La date de début de visionnage')
  validateOptionalHttpUrl(series.posterUrl, `${path}.posterUrl`, errors, 'L’URL d’affiche')

  if (!identityValid || hasPathError(errors, path)) return null

  return series
}

function validateBook(
  value: unknown,
  index: number,
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
): Book | null {
  const path = `$.books[${index}]`
  if (!isRecord(value)) {
    addError(errors, path, 'Cette entrée doit être un objet Livre.')
    return null
  }

  const identityValid = validateSharedIdentity(value, path, BOOK_KEYS, profileId, ids, errors, 'Livre')
  validateOptionalString(value.author, `${path}.author`, errors)
  validateOptionalYear(value.year, `${path}.year`, errors)
  validateOptionalString(value.summary, `${path}.summary`, errors)
  if (!(BOOK_CATEGORIES as readonly unknown[]).includes(value.category)) {
    addError(errors, `${path}.category`, 'La catégorie Livre est inconnue.')
  }
  if (!(BOOK_STATUSES as readonly unknown[]).includes(value.status)) {
    addError(errors, `${path}.status`, 'Le statut Livre est inconnu.')
  }
  validateRating(value.rating, `${path}.rating`, errors)
  if (typeof value.isFavorite !== 'boolean') {
    addError(errors, `${path}.isFavorite`, 'La valeur favori doit être un booléen.')
  }
  validateOptionalProgress(value.volumesRead, `${path}.volumesRead`, errors)
  validateOptionalProgress(value.volumesTotal, `${path}.volumesTotal`, errors)
  if (
    typeof value.volumesRead === 'number'
    && typeof value.volumesTotal === 'number'
    && value.volumesRead > value.volumesTotal
  ) {
    addError(errors, `${path}.volumesRead`, 'Les tomes lus ne peuvent pas dépasser le total de tomes.')
  }
  validateOptionalString(value.coverUrl, `${path}.coverUrl`, errors)
  validateOptionalString(value.personalNote, `${path}.personalNote`, errors)

  const book = normalizeBook(value as Book)
  validateOptionalCalendarDate(book.startedAt, `${path}.startedAt`, errors, 'La date de début de lecture')
  validateOptionalHttpUrl(book.coverUrl, `${path}.coverUrl`, errors, 'L’URL de couverture')

  const quoteIds = new Set<string>()
  if (!Array.isArray(book.quotes)) {
    addError(errors, `${path}.quotes`, 'Les citations doivent être un tableau.')
  } else {
    book.quotes.forEach((quote, quoteIndex) => {
      validateQuote(quote, book.id, `${path}.quotes[${quoteIndex}]`, quoteIds, errors)
    })
  }

  if (!identityValid || hasPathError(errors, path)) return null

  return book
}

function validateQuote(
  value: unknown,
  bookId: string,
  path: string,
  quoteIds: Set<string>,
  errors: LibraryImportValidationError[],
) {
  if (!isRecord(value)) {
    addError(errors, path, 'Cette citation doit être un objet.')
    return
  }
  validateExactKeys(value, QUOTE_KEYS, path, errors)
  validateNonEmptyString(value.id, `${path}.id`, errors)
  if (typeof value.id === 'string' && value.id.trim()) {
    if (quoteIds.has(value.id)) addError(errors, `${path}.id`, 'Cet identifiant de citation est présent plusieurs fois.')
    quoteIds.add(value.id)
  }
  if (value.bookId !== bookId) {
    addError(errors, `${path}.bookId`, 'La citation ne correspond pas à son livre.')
  }
  validateNonEmptyString(value.body, `${path}.body`, errors)
  if (!Number.isInteger(value.position) || (value.position as number) < 0) {
    addError(errors, `${path}.position`, 'La position doit être un entier positif ou nul.')
  }
  validateIsoDate(value.createdAt, `${path}.createdAt`, errors)
}

function validateGame(
  value: unknown,
  index: number,
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
): Game | null {
  const path = `$.games[${index}]`
  if (!isRecord(value)) {
    addError(errors, path, 'Cette entrée doit être un objet Jeu.')
    return null
  }

  const identityValid = validateSharedIdentity(value, path, GAME_KEYS, profileId, ids, errors, 'Jeu')
  validateOptionalString(value.developer, `${path}.developer`, errors)
  validateOptionalString(value.platform, `${path}.platform`, errors)
  validateOptionalYear(value.year, `${path}.year`, errors)
  if (!(GAME_STATUSES as readonly unknown[]).includes(value.status)) {
    addError(errors, `${path}.status`, 'Le statut Jeu est inconnu.')
  }
  validateRating(value.rating, `${path}.rating`, errors)
  if (typeof value.isFavorite !== 'boolean') {
    addError(errors, `${path}.isFavorite`, 'La valeur favori doit être un booléen.')
  }
  validateOptionalString(value.coverUrl, `${path}.coverUrl`, errors)
  validateOptionalString(value.personalNote, `${path}.personalNote`, errors)

  const game = normalizeGame(value as Game)
  validateOptionalCalendarDate(game.playedAt, `${path}.playedAt`, errors, 'La date de jeu')
  validateOptionalHttpUrl(game.coverUrl, `${path}.coverUrl`, errors, 'L’URL de couverture')

  if (!identityValid || hasPathError(errors, path)) return null

  return game
}

function validateArtwork(
  value: unknown,
  index: number,
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
): Artwork | null {
  const path = `$.artworks[${index}]`
  if (!isRecord(value)) {
    addError(errors, path, 'Cette entrée doit être un objet Œuvre d’art.')
    return null
  }

  const identityValid = validateSharedIdentity(value, path, ARTWORK_KEYS, profileId, ids, errors, 'Œuvre d’art')
  validateOptionalString(value.artist, `${path}.artist`, errors)
  validateOptionalYear(value.year, `${path}.year`, errors)
  if (!(ARTWORK_FORMS as readonly unknown[]).includes(value.form)) {
    addError(errors, `${path}.form`, 'La forme d’art est inconnue.')
  }
  validateOptionalString(value.location, `${path}.location`, errors)
  validateOptionalString(value.exhibition, `${path}.exhibition`, errors)
  if (!(ARTWORK_STATUSES as readonly unknown[]).includes(value.status)) {
    addError(errors, `${path}.status`, 'Le statut Œuvre d’art est inconnu.')
  }
  if (typeof value.isFavorite !== 'boolean') {
    addError(errors, `${path}.isFavorite`, 'La valeur favori doit être un booléen.')
  }
  validateOptionalString(value.imageUrl, `${path}.imageUrl`, errors)
  validateOptionalString(value.personalNote, `${path}.personalNote`, errors)

  const artwork = normalizeArtwork(value as Artwork)
  validateOptionalCalendarDate(artwork.discoveredAt, `${path}.discoveredAt`, errors, 'La date de découverte')
  validateOptionalHttpUrl(artwork.imageUrl, `${path}.imageUrl`, errors, 'L’URL du visuel')

  if (!identityValid || hasPathError(errors, path)) return null

  return artwork
}

function hasPathError(errors: LibraryImportValidationError[], path: string): boolean {
  return errors.some((error) => error.path.startsWith(path))
}

function validateExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  path: string,
  errors: LibraryImportValidationError[],
) {
  const expected = new Set(expectedKeys)
  for (const key of expectedKeys) {
    if (!(key in value)) addError(errors, `${path}.${key}`, 'Ce champ est obligatoire dans la version 2.')
  }
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) addError(errors, `${path}.${key}`, 'Ce champ n’appartient pas au format version 2.')
  }
}

function validateNonEmptyString(value: unknown, path: string, errors: LibraryImportValidationError[]) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    addError(errors, path, 'Une chaîne de caractères non vide est attendue.')
  }
}

function validateOptionalString(value: unknown, path: string, errors: LibraryImportValidationError[]) {
  if (value !== null && typeof value !== 'string') {
    addError(errors, path, 'Une chaîne de caractères ou null est attendue.')
  }
}

function validateIsoDate(value: unknown, path: string, errors: LibraryImportValidationError[]) {
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

function addError(errors: LibraryImportValidationError[], path: string, message: string) {
  errors.push({ path, message })
}

function invalidDocument(
  path: string,
  message: string,
  counts: LibraryCollectionCounts,
): LibraryImportPreview {
  return {
    document: null,
    counts,
    errors: [{ path, message }],
  }
}
