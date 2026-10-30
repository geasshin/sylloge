import { normalizeCsvHeader, parseCsv, type CsvRow, type CsvTable } from './csv.ts'
import type { Film } from './film.ts'
import type { Book, BookStatus } from './book.ts'
import { EMPTY_BOOK_FORM, validateBookForm } from './bookForm.ts'
import type { Series, SeriesStatus } from './series.ts'
import { normalizeImportDate, normalizeLoose } from './importNormalization.ts'
import { previewFilmCsvImport, type FilmImportMapping } from './filmCsvImport.ts'
import type { ImportValidationError } from './libraryTransfer.ts'

export type ThirdPartyImportLibrary = 'films' | 'series' | 'anime' | 'books' | 'mangas' | 'games' | 'artworks'
export type ThirdPartyImportService = 'letterboxd' | 'goodreads' | 'imdb' | 'storygraph' | 'simkl' | 'hardcover' | 'myanimelist'
export type ThirdPartyImportVariant =
  | 'ratings' | 'diary' | 'watched' | 'watchlist' | 'ambiguous' | 'library' | 'archive'
  | 'xml-anime' | 'xml-manga'
export type ThirdPartyImportSource = { name: string; contents: string }
/** Structural subset of PickedAnyImportFile; domain code never invokes native I/O. */
export type ThirdPartyPickedImportSource = {
  name: string
  kind: 'json' | 'csv' | 'notion' | 'container'
  contents: string | null
  csvCandidates: ThirdPartyImportSource[]
  containerCandidates?: Array<ThirdPartyImportSource & { kind: 'json' | 'csv' }>
}
export type ThirdPartyImportInput = ThirdPartyImportSource | ThirdPartyPickedImportSource
export type ThirdPartyImportOptions = { letterboxdList?: 'watched' | 'watchlist' }
export type ThirdPartyImportRecognition = {
  service: ThirdPartyImportService
  variant: ThirdPartyImportVariant
  /** Primary library, kept for callers that show a single destination. */
  library: ThirdPartyImportLibrary
  /** Every library this service can feed; a recognized export accepts only these. */
  libraries: ThirdPartyImportLibrary[]
  label: string
  mapping: Array<{ field: string; column: string }>
}

/** Content signatures identify a service; a filename alone is never evidence. */
export function recognizeThirdPartyImport(input: ThirdPartyImportInput): ThirdPartyImportRecognition | null {
  const direct = directTextSource(input)
  if (direct !== null) return recognizeThirdPartyTextImport(direct)
  const sources = pickedCsvSources(input)
  if (sources.some((source) => recognizeThirdPartyTextImport(source)?.service === 'letterboxd')) {
    return { service: 'letterboxd', variant: 'archive', library: 'films', libraries: ['films'], label: 'Letterboxd · archive Films', mapping: [] }
  }
  return sources.length === 1 ? recognizeThirdPartyTextImport(sources[0]) : null
}

/** Accepts the native picker result as-is, including all CSV entries of a ZIP. */
export function previewThirdPartyImport(
  input: ThirdPartyImportInput,
  targetLibrary: ThirdPartyImportLibrary,
  importedAt = new Date().toISOString(),
  options: ThirdPartyImportOptions = {},
): ThirdPartyImportPreview | null {
  const direct = directTextSource(input)
  if (direct !== null) return previewThirdPartyTextImport(direct, targetLibrary, importedAt, options)
  const recognized = recognizeThirdPartyImport(input)
  if (recognized === null) return null
  const sources = pickedCsvSources(input)
  return recognized.variant === 'archive'
    ? previewLetterboxdArchive(sources, recognized, targetLibrary, importedAt)
    : previewThirdPartyTextImport(sources[0], targetLibrary, importedAt, options)
}

function directTextSource(input: ThirdPartyImportInput): ThirdPartyImportSource | null {
  if (typeof input.contents === 'string') return { name: input.name, contents: input.contents }
  if ('kind' in input && input.kind === 'csv' && input.csvCandidates.length === 1) return input.csvCandidates[0]
  return null
}

function pickedCsvSources(input: ThirdPartyImportInput): ThirdPartyImportSource[] {
  if (!('kind' in input)) return []
  return input.kind === 'container'
    ? (input.containerCandidates ?? []).filter((source) => source.kind === 'csv')
    : input.csvCandidates
}

/** Text recognition is deliberately separate from ZIP decompression and file I/O. */
function recognizeThirdPartyTextImport(source: ThirdPartyImportSource): ThirdPartyImportRecognition | null {
  const mal = recognizeMalXml(source.contents)
  if (mal !== null) return mal
  // Public service headers are one physical line; recognition must not parse
  // an entire untrusted document before size validation.
  const headerEnd = source.contents.search(/[\r\n]/u)
  const { headers } = parseCsv(headerEnd < 0 ? source.contents : source.contents.slice(0, headerEnd))
  const has = (column: string) => sourceColumn(headers, column) !== null
  const mapped = (definitions: Array<[string, string]>) => definitions.flatMap(([field, name]) => {
    const column = sourceColumn(headers, name)
    return column === null ? [] : [{ field, column }]
  })
  if (['Book Id', 'Title', 'Author', 'My Rating', 'Exclusive Shelf'].every(has)) {
    return {
      service: 'goodreads', variant: 'library', library: 'books', libraries: ['books'], label: 'Goodreads · bibliothèque',
      mapping: mapped([
        ['title', 'Title'], ['author', 'Author'], ['status', 'Exclusive Shelf'], ['rating', 'My Rating'],
        ['year', 'Year Published'], ['personalNote', 'My Review'], ['personalNote', 'Private Notes'],
      ]),
    }
  }
  // StoryGraph exports the Goodreads schema minus `Book Id`; the signature
  // requires the reading counters that distinguish it from a bare title list.
  if (['Title', 'Author', 'My Rating', 'Exclusive Shelf', 'Read Count'].every(has)
    && !has('Book Id') && !has('BookID')) {
    return {
      service: 'storygraph', variant: 'library', library: 'books', libraries: ['books'], label: 'The StoryGraph · bibliothèque',
      mapping: mapped([
        ['title', 'Title'], ['author', 'Author'], ['status', 'Exclusive Shelf'], ['rating', 'My Rating'],
        ['year', 'Year Published'], ['personalNote', 'My Review'], ['personalNote', 'Private Notes'],
      ]),
    }
  }
  if (['Date', 'Name', 'Year', 'Letterboxd URI'].every(has)) {
    const basename = source.name.replace(/\\/gu, '/').split('/').at(-1)?.toLowerCase()
    const variant = has('Watched Date') ? 'diary' : has('Rating') ? 'ratings'
      : basename === 'watched.csv' ? 'watched'
        : basename === 'watchlist.csv' ? 'watchlist' : 'ambiguous'
    return {
      service: 'letterboxd', variant, library: 'films', libraries: ['films'],
      label: variant === 'diary' ? 'Letterboxd · journal'
        : variant === 'ratings' ? 'Letterboxd · notes'
          : variant === 'watched' ? 'Letterboxd · films vus'
            : variant === 'watchlist' ? 'Letterboxd · à voir' : 'Letterboxd · liste à préciser',
      mapping: mapped([['title', 'Name'], ['rating', 'Rating'], ['watchedAt', 'Watched Date'], ['personalNote', 'Review']]),
    }
  }
  // IMDb ratings/watchlist: `const` alone is not enough, a rating column and
  // the title type are required (see priorites.md).
  if (has('const') && (has('You rated') || has('Your Rating')) && has('Title type') && has('Title')) {
    const ratingColumn = sourceColumn(headers, 'You rated') ?? sourceColumn(headers, 'Your Rating')!
    const basename = archiveBasename(source.name)
    const variant = basename === 'watchlist.csv' ? 'watchlist' : 'ratings'
    return {
      service: 'imdb', variant, library: 'films', libraries: ['films', 'series'],
      label: variant === 'watchlist' ? 'IMDb · liste à voir' : 'IMDb · notes',
      mapping: mapped([['title', 'Title'], ['rating', ratingColumn]]),
    }
  }
  if (['simkl_id', 'Watchlist', 'LastEpWatched', 'Type', 'Title'].every(has)) {
    return {
      service: 'simkl', variant: 'library', library: 'films', libraries: ['films', 'series', 'anime'], label: 'Simkl · CSV',
      mapping: mapped([
        ['title', 'Title'], ['year', 'Year'], ['status', 'Watchlist'], ['rating', 'Rating'],
        ['personalNote', 'Memo'], ['watchedAt', 'WatchedDate'],
      ]),
    }
  }
  // The documented Hardcover custom CSV; a generic Title/Author/Rating CSV is
  // not Hardcover, so at least one Hardcover-specific column is required.
  if (['Title', 'Author', 'Status', 'Rating'].every(has)
    && (has('Hardcover Book ID') || has('Hardcover Edition ID') || has('Review Contains Spoilers'))) {
    return {
      service: 'hardcover', variant: 'library', library: 'books', libraries: ['books'], label: 'Hardcover · bibliothèque',
      mapping: mapped([
        ['title', 'Title'], ['author', 'Author'], ['status', 'Status'], ['rating', 'Rating'],
        ['year', 'Publish Date'], ['startedAt', 'Date Started'], ['personalNote', 'Review'],
      ]),
    }
  }
  return null
}

export type ThirdPartyImportWarning = ImportValidationError & { code: string }
export type ThirdPartyDuplicateTitle = { title: string; lines: number[] }
export type ThirdPartyImportPreview = ThirdPartyImportRecognition & {
  duplicateTitles: ThirdPartyDuplicateTitle[]
  items: Film[] | Series[] | Book[] | null
  errors: ImportValidationError[]
  warnings: ThirdPartyImportWarning[]
  ignoredColumns: string[]
  totalItemCount: number
  validItemCount: number
  /** Present for an aggregated archive; totalItemCount is its unique film count. */
  sourceRowCount?: number
  sourceFiles?: Array<{ name: string; variant: ThirdPartyImportRecognition['variant']; rowCount: number }>
}

/** Pure preparation only: no database, provider lookup, or implicit merge. */
function previewThirdPartyTextImport(
  source: ThirdPartyImportSource,
  targetLibrary: ThirdPartyImportLibrary,
  importedAt = new Date().toISOString(),
  options: ThirdPartyImportOptions & { allowDuplicateHistory?: boolean } = {},
): ThirdPartyImportPreview | null {
  const detected = recognizeThirdPartyTextImport(source)
  if (detected === null) return null
  const recognized = detected.variant === 'ambiguous' && options.letterboxdList
    ? { ...detected, variant: options.letterboxdList }
    : detected
  const maxTextBytes = 16 * 1024 * 1024
  const sizeExceeded = source.contents.length > maxTextBytes || new TextEncoder().encode(source.contents).byteLength > maxTextBytes
  if (sizeExceeded || source.contents.includes('\0')) return {
    ...recognized, items: null, warnings: [], ignoredColumns: [], duplicateTitles: [], totalItemCount: 0, validItemCount: 0,
    errors: [{ path: source.name, message: sizeExceeded
      ? 'Ce fichier texte dépasse la limite sûre de 16 Mio.'
      : 'Le fichier contient un caractère NUL : vérifiez son encodage UTF-8 avant l’import.' }],
  }
  if (recognized.service === 'myanimelist') return previewMalXmlImport(source, recognized, targetLibrary, importedAt)
  const table = parseCsv(source.contents)
  const preparationErrors: ImportValidationError[] = []
  if (table.rows.length === 0) preparationErrors.push({ path: source.name, message: 'Cet export ne contient aucune fiche. Un fichier vide ne peut pas remplacer une bibliothèque.' })
  const timestamp = Date.parse(importedAt)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== importedAt) {
    preparationErrors.push({ path: 'importedAt', message: 'L’horodatage de préparation doit être UTC ISO 8601.' })
  }
  if (preparationErrors.length > 0) return {
    ...recognized, items: null, warnings: [], ignoredColumns: table.headers, duplicateTitles: [],
    totalItemCount: table.rows.length, validItemCount: 0, errors: [...table.errors, ...preparationErrors],
  }
  if (!recognized.libraries.includes(targetLibrary)) return wrongLibraryPreview(source, recognized, table)
  if (recognized.service === 'goodreads') return previewGoodreadsImport(source, table, recognized, importedAt)
  if (recognized.service === 'storygraph') return previewStoryGraphImport(source, table, recognized, importedAt)
  if (recognized.service === 'imdb') return previewImdbImport(source, table, recognized, targetLibrary, importedAt)
  if (recognized.service === 'simkl') return previewSimklImport(source, table, recognized, targetLibrary, importedAt)
  if (recognized.service === 'hardcover') return previewHardcoverImport(source, table, recognized, importedAt)
  if (recognized.variant === 'ambiguous') return {
    ...recognized, items: null, warnings: [], ignoredColumns: table.headers, duplicateTitles: [],
    totalItemCount: table.rows.length, validItemCount: 0,
    errors: [{ path: source.name, message: 'Les colonnes sont communes à watched.csv et watchlist.csv. Choisissez explicitement la liste de films vus ou la liste à voir.' }],
  }
  // A derived status column distinguishes service semantics from generic CSV
  // aliases. The ordinary Film parser remains the validation boundary.
  let statusHeader = '__sylloge_status__'
  while (table.headers.includes(statusHeader)) statusHeader += '_'
  const headers = [...table.headers, statusHeader]
  const status = recognized.variant === 'watchlist' ? 'à découvrir' : 'terminé'
  const mapping: FilmImportMapping = {
    title: sourceColumn(table.headers, 'Name'), status: statusHeader, rating: sourceColumn(table.headers, 'Rating'),
    watchedAt: sourceColumn(table.headers, 'Watched Date'),
    personalNote: sourceColumn(table.headers, 'Review'), isFavorite: null,
  }
  const result = previewFilmCsvImport({
    kind: 'generic', sourceKind: 'csv', sourceLabel: recognized.label,
    notionDatabaseRoots: [], headers,
    table: { ...table, headers, rows: table.rows.map((row) => ({ ...row, cells: [...row.cells, status] })) },
    suggestedProfileName: 'Import Letterboxd', initialMapping: mapping,
  }, {
    name: source.name, kind: 'csv', csvCandidates: [], markdownPages: [],
  }, {
    profileName: 'Import Letterboxd', mapping, markdownNotes: false, ratingScale: 5,
  }, importedAt)
  const ignoredColumns = table.headers.filter((header) => !recognized.mapping.some((entry) => entry.column === header))
  const duplicateTitles = options.allowDuplicateHistory ? [] : findDuplicateTitles(table, 'Name')
  const basename = source.name.replace(/\\/gu, '/').split('/').at(-1)?.toLowerCase()
  const reservedVariant = basename?.replace(/\.csv$/u, '')
  const filenameConflict = ['ratings', 'watched', 'watchlist', 'diary'].includes(reservedVariant ?? '')
    && reservedVariant !== recognized.variant
  const errors = [...result.errors,
    ...(filenameConflict ? [{ path: source.name, message: 'Le nom du fichier Letterboxd et ses colonnes sont contradictoires. Vérifiez le fichier ou son nom avant l’import.' }] : []),
    ...duplicateTitles.map((duplicate) => ({
    path: `Lignes ${duplicate.lines.join(', ')}`,
    message: `Le titre « ${duplicate.title} » apparaît plusieurs fois. Résolvez ce doublon dans le fichier source ; aucun historique de revisionnage ne peut être fusionné automatiquement.`,
  }))]
  return {
    ...recognized,
    duplicateTitles,
    items: errors.length === 0 ? result.document?.films ?? null : null,
    errors,
    warnings: [{
      code: 'activity-date-not-watched', path: 'Date',
      message: '« Date » est la date d’activité Letterboxd, pas la date de visionnage. Aucune date de visionnage n’est inventée.',
    }, {
      code: 'unmapped-columns', path: 'Colonnes',
      message: `Colonnes non importées : ${ignoredColumns.join(', ')}. Le fichier source reste inchangé.`,
    }],
    ignoredColumns,
    totalItemCount: result.totalFilmCount,
    validItemCount: result.validFilmCount,
  }
}

function previewGoodreadsImport(
  source: ThirdPartyImportSource,
  table: CsvTable,
  recognized: ThirdPartyImportRecognition,
  importedAt: string,
): ThirdPartyImportPreview {
  return previewBookShelfImport(source, table, recognized, importedAt, {
    serviceLabel: 'Goodreads',
    statuses: new Map<string, BookStatus>([['read', 'lu'], ['currently-reading', 'en cours'], ['to-read', 'à lire']]),
    statusRule: 'read, currently-reading ou to-read est attendu.',
  })
}

function previewStoryGraphImport(
  source: ThirdPartyImportSource,
  table: CsvTable,
  recognized: ThirdPartyImportRecognition,
  importedAt: string,
): ThirdPartyImportPreview {
  return previewBookShelfImport(source, table, recognized, importedAt, {
    serviceLabel: 'The StoryGraph',
    statuses: new Map<string, BookStatus>([
      ['read', 'lu'], ['currently-reading', 'en cours'], ['to-read', 'à lire'], ['did-not-finish', 'abandonné'],
    ]),
    statusRule: 'read, currently-reading, to-read ou did-not-finish est attendu.',
  })
}

function previewBookShelfImport(
  _source: ThirdPartyImportSource,
  table: CsvTable,
  recognized: ThirdPartyImportRecognition,
  importedAt: string,
  rules: { serviceLabel: string; statuses: Map<string, BookStatus>; statusRule: string },
): ThirdPartyImportPreview {
  const errors = [...table.errors]
  const items: Book[] = []
  const warnings: ThirdPartyImportWarning[] = []
  const indexByHeader = new Map(table.headers.map((header, index) => [sourceHeaderKey(header), index]))
  for (const row of table.rows) {
    const get = (column: string) => row.cells[indexByHeader.get(sourceHeaderKey(column)) ?? -1] ?? ''
    const status = rules.statuses.get(get('Exclusive Shelf').trim())
    const rating = get('My Rating').trim()
    const before = errors.length
    if (!status) errors.push({ path: `Ligne ${row.line}.Exclusive Shelf`, message: `Statut ${rules.serviceLabel} inconnu : ${rules.statusRule}` })
    const review = get('My Review')
    const privateNotes = get('Private Notes')
    const personalNote = review && privateNotes ? `${review}\n\n[Notes privées ${rules.serviceLabel}]\n${privateNotes}` : review || privateNotes
    if (rating !== '' && !/^[0-5]$/u.test(rating)) errors.push({
      path: `Ligne ${row.line}.My Rating`, message: `Une note personnelle ${rules.serviceLabel} doit être un entier de 1 à 5 ; 0 signifie sans note.`,
    })
    if (status === 'à lire' && ((rating !== '' && rating !== '0') || personalNote !== '')) errors.push({
      path: `Ligne ${row.line}.Exclusive Shelf`,
      message: 'Ce livre à lire contient déjà une note ou un avis. Ce statut effacerait ces champs dans Sylloge : conservez le fichier original et corrigez le statut dans une copie CSV avant l’import.',
    })
    if (review && privateNotes) warnings.push({
      code: 'combined-notes', path: `Ligne ${row.line}.My Review, Private Notes`,
      message: `L’avis et les notes privées sont conservés ensemble dans la note personnelle, séparés par « [Notes privées ${rules.serviceLabel}] ».`,
    })
    const result = validateBookForm({
      ...EMPTY_BOOK_FORM,
      title: get('Title'), author: get('Author'), year: get('Year Published'),
      status: status ?? 'à lire', rating: rating === '0' ? '' : rating, personalNote,
    })
    if (!result.success) {
      for (const [field, message] of Object.entries(result.errors)) {
        if (message) errors.push({ path: `Ligne ${row.line}.${field}`, message })
      }
    } else if (errors.length === before) {
      items.push({
        id: `import-preview-${row.line}`, profileId: 'import-preview-profile', ...result.data,
        title: get('Title'), author: get('Author') || null, personalNote: personalNote || null,
        progressUpdatedAt: null, createdAt: importedAt, updatedAt: importedAt, quotes: [],
      })
    }
  }
  const duplicateTitles = findDuplicateTitles(table, 'Title')
  errors.push(...duplicateTitles.map((duplicate) => ({
    path: `Lignes ${duplicate.lines.join(', ')}`,
    message: `Le titre « ${duplicate.title} » apparaît plusieurs fois. Résolvez ce doublon dans le fichier source avant l’import.`,
  })))
  const ignoredColumns = table.headers.filter((header) => !recognized.mapping.some((entry) => entry.column === header))
  return {
    ...recognized, duplicateTitles, items: errors.length === 0 ? items : null, errors,
    totalItemCount: table.rows.length, validItemCount: items.length, ignoredColumns,
    warnings: [{
      code: 'completion-date-not-started', path: 'Date Read, Date Added',
      message: 'Date Read est une fin de lecture, Date Added un ajout Goodreads. Sylloge ne possède qu’une date de début de lecture : ces dates ne sont pas importées et aucun début n’est inventé.',
    }, {
      code: 'unmapped-columns', path: 'Colonnes',
      message: `Colonnes non importées : ${ignoredColumns.join(', ')}. Read Count n’est pas un nombre de tomes. Le fichier source reste inchangé.`,
    }, ...warnings],
  }
}

type XmlNode = { name: string; children: XmlNode[]; text: string }

type ParsedRating = { value: number | null; error: string | null }

function wrongLibraryPreview(
  source: ThirdPartyImportSource,
  recognized: ThirdPartyImportRecognition,
  table?: CsvTable,
): ThirdPartyImportPreview {
  return {
    ...recognized, items: null, warnings: [], ignoredColumns: table?.headers ?? [], duplicateTitles: [],
    totalItemCount: table?.rows.length ?? 0, validItemCount: 0,
    errors: [{ path: source.name, message: wrongLibraryMessage(recognized) }],
  }
}

/** Static messages keep every captured value a real service or medium name. */
function wrongLibraryMessage(recognized: ThirdPartyImportRecognition): string {
  switch (recognized.service) {
    case 'letterboxd':
      return 'Cet export Letterboxd contient des Films. Ouvrez la bibliothèque Films pour l’importer.'
    case 'goodreads':
      return 'Cet export Goodreads contient des Livres. Ouvrez la bibliothèque Livres pour l’importer.'
    case 'storygraph':
      return 'Cet export The StoryGraph contient des Livres. Ouvrez la bibliothèque Livres pour l’importer.'
    case 'hardcover':
      return 'Cet export Hardcover contient des Livres. Ouvrez la bibliothèque Livres pour l’importer.'
    case 'imdb':
      return 'Cet export IMDb contient des Films et des Séries. Ouvrez la bibliothèque Films ou la bibliothèque Séries pour l’importer.'
    case 'simkl':
      return 'Cet export Simkl contient des Films, des Séries et de l’Animation japonaise. Ouvrez la bibliothèque correspondante pour l’importer.'
    case 'myanimelist':
      return recognized.variant === 'xml-manga'
        ? 'Cet export MyAnimeList contient des Mangas. Ouvrez la bibliothèque Mangas pour l’importer.'
        : 'Cet export MyAnimeList contient de l’Animation japonaise. Ouvrez la bibliothèque Animation japonaise pour l’importer.'
  }
}

function cellReader(table: CsvTable, row: CsvRow) {
  const indexByHeader = new Map(table.headers.map((header, index) => [sourceHeaderKey(header), index]))
  return (column: string) => row.cells[indexByHeader.get(sourceHeaderKey(column)) ?? -1] ?? ''
}

function parseTenPointRating(raw: string, service: string, allowZero = false): ParsedRating {
  const value = raw.trim()
  if (value === '' || (allowZero && value === '0')) return { value: null, error: null }
  if (!/^\d{1,2}$/u.test(value) || Number(value) < 1 || Number(value) > 10) {
    return { value: null, error: `Note ${service} « ${value} » invalide : un entier de 1 à 10 est attendu.` }
  }
  return { value: Number(value) / 2, error: null }
}

function parseHalfPointRating(raw: string, service: string): ParsedRating {
  const value = raw.trim().replace(',', '.')
  if (value === '') return { value: null, error: null }
  const rating = Number(value)
  if (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2)) {
    return { value: null, error: `Note ${service} « ${raw.trim()} » invalide : un nombre de 0,5 à 5 par demi-points est attendu.` }
  }
  return { value: rating, error: null }
}

function calendarIso(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Simkl documents DD-MM-YYYY with dashes and MM/DD/YYYY with slashes. */
function parseSimklDate(raw: string): { value: string | null; error: string | null } {
  const value = raw.trim()
  if (value === '') return { value: null, error: null }
  const dashed = /^(\d{2})-(\d{2})-(\d{4})$/u.exec(value)
  if (dashed) {
    const iso = calendarIso(Number(dashed[3]), Number(dashed[2]), Number(dashed[1]))
    return iso === null
      ? { value: null, error: `Date Simkl « ${value} » invalide : JJ-MM-AAAA ou MM/JJ/AAAA est attendu.` }
      : { value: iso, error: null }
  }
  const slashed = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value)
  if (slashed) {
    const iso = calendarIso(Number(slashed[3]), Number(slashed[1]), Number(slashed[2]))
    return iso === null
      ? { value: null, error: `Date Simkl « ${value} » invalide : JJ-MM-AAAA ou MM/JJ/AAAA est attendu.` }
      : { value: iso, error: null }
  }
  return { value: null, error: `Date Simkl « ${value} » invalide : JJ-MM-AAAA ou MM/JJ/AAAA est attendu.` }
}

function skippedMediumWarning(medium: 'films' | 'series' | 'anime' | 'mangas', count: number): ThirdPartyImportWarning {
  const labels = {
    films: ['1 film ignoré : importez-le depuis la bibliothèque Films.', '{0} films ignorés : importez-les depuis la bibliothèque Films.'],
    series: ['1 série ignorée : importez-la depuis la bibliothèque Séries.', '{0} séries ignorées : importez-les depuis la bibliothèque Séries.'],
    anime: ['1 animation japonaise ignorée : importez-la depuis la bibliothèque Animation japonaise.', '{0} animations japonaises ignorées : importez-les depuis la bibliothèque Animation japonaise.'],
    mangas: ['1 manga ignoré : importez-le depuis la bibliothèque Mangas.', '{0} mangas ignorés : importez-les depuis la bibliothèque Mangas.'],
  } as const
  const message = count === 1 ? labels[medium][0] : labels[medium][1].replace('{0}', String(count))
  return { code: 'skipped-other-medium', path: 'Type', message }
}

function skippedEpisodeWarning(count: number): ThirdPartyImportWarning {
  return {
    code: 'skipped-episodes', path: 'Title type',
    message: count === 1 ? '1 épisode ignoré : Sylloge n’importe pas les épisodes.' : `${count} épisodes ignorés : Sylloge n’importe pas les épisodes.`,
  }
}

function unsupportedTypesWarning(types: Map<string, number>): ThirdPartyImportWarning | null {
  if (types.size === 0) return null
  return {
    code: 'unsupported-title-type', path: 'Title type',
    message: `Types non pris en charge, lignes ignorées : ${[...types.entries()].map(([type, count]) => `${type} (${count})`).join(', ')}.`,
  }
}

function unmappedColumnsWarning(ignoredColumns: string[], extra = ''): ThirdPartyImportWarning {
  return {
    code: 'unmapped-columns', path: 'Colonnes',
    message: `Colonnes non importées : ${ignoredColumns.join(', ')}.${extra} Le fichier source reste inchangé.`,
  }
}

function duplicateTitlesForRows(rows: CsvRow[], titleIndex: number): ThirdPartyDuplicateTitle[] {
  const groups = new Map<string, ThirdPartyDuplicateTitle>()
  for (const row of rows) {
    const title = row.cells[titleIndex] ?? ''
    const key = normalizeCsvHeader(title)
    if (!key) continue
    const group = groups.get(key) ?? { title, lines: [] }
    group.lines.push(row.line)
    groups.set(key, group)
  }
  return [...groups.values()].filter((group) => group.lines.length > 1)
}

function duplicateTitleErrors(duplicates: ThirdPartyDuplicateTitle[]): ImportValidationError[] {
  return duplicates.map((duplicate) => ({
    path: `Lignes ${duplicate.lines.join(', ')}`,
    message: `Le titre « ${duplicate.title} » apparaît plusieurs fois. Résolvez ce doublon dans le fichier source avant l’import.`,
  }))
}

function makeFilm(
  title: string,
  status: Film['status'],
  rating: number | null,
  watchedAt: string | null,
  personalNote: string | null,
  importedAt: string,
): Film {
  return {
    id: 'import-preview', profileId: 'import-preview-profile', title, originalTitle: null, year: null,
    status, isFavorite: false, rating, watchedAt, personalNote, director: null, summary: null,
    providerName: null, providerId: null, posterUrl: null, bannerUrl: null, createdAt: importedAt, updatedAt: importedAt,
  }
}

function makeSeries(
  title: string,
  category: Series['category'],
  status: SeriesStatus,
  rating: number | null,
  startedAt: string | null,
  personalNote: string | null,
  importedAt: string,
): Series {
  return {
    id: 'import-preview', profileId: 'import-preview-profile', title, showrunner: null, casting: null,
    summary: null, category, status, rating, isFavorite: false, seasonsSeen: null, seasonsTotal: null,
    progressUpdatedAt: null, startedAt, posterUrl: null, bannerUrl: null,
    firstAirYear: null, lastAirYear: null, personalNote, createdAt: importedAt, updatedAt: importedAt,
  }
}

const IMDB_FILM_TYPES = new Set(['feature film', 'featurefilm', 'movie', 'tv movie', 'tvmovie', 'short', 'video', 'tv special', 'tvspecial'])
const IMDB_SERIES_TYPES = new Set(['tv series', 'tvseries', 'tv mini series', 'tv miniseries', 'tvminiseries', 'tv short', 'tvshort'])
const IMDB_EPISODE_TYPES = new Set(['tv episode', 'tvepisode'])

function previewImdbImport(
  source: ThirdPartyImportSource,
  table: CsvTable,
  recognized: ThirdPartyImportRecognition,
  targetLibrary: ThirdPartyImportLibrary,
  importedAt: string,
): ThirdPartyImportPreview {
  const errors = [...table.errors]
  const warnings: ThirdPartyImportWarning[] = []
  const indexes = new Map(table.headers.map((header, index) => [sourceHeaderKey(header), index]))
  const titleIndex = indexes.get('title') ?? -1
  const typeIndex = indexes.get('title type') ?? -1
  const ratingIndex = indexes.get(sourceHeaderKey(recognized.mapping.find((entry) => entry.field === 'rating')?.column ?? 'You rated')) ?? -1
  const films: Film[] = []
  const series: Series[] = []
  const skipped = { films: 0, series: 0, episodes: 0 }
  const otherTypes = new Map<string, number>()
  const targetRows: CsvRow[] = []
  let candidateCount = 0
  let sawRating = false

  for (const row of table.rows) {
    const title = row.cells[titleIndex] ?? ''
    const type = normalizeLoose(row.cells[typeIndex] ?? '')
    const rawRating = ratingIndex < 0 ? '' : row.cells[ratingIndex] ?? ''
    if (rawRating.trim() !== '') sawRating = true
    const isFilm = IMDB_FILM_TYPES.has(type)
    const isSeries = IMDB_SERIES_TYPES.has(type)
    const isEpisode = IMDB_EPISODE_TYPES.has(type)
    if (!isFilm && !isSeries && !isEpisode) {
      otherTypes.set((row.cells[typeIndex] ?? '').trim() || 'type vide', (otherTypes.get((row.cells[typeIndex] ?? '').trim() || 'type vide') ?? 0) + 1)
      continue
    }
    if (isEpisode) { skipped.episodes += 1; continue }
    if ((targetLibrary === 'films' && !isFilm) || (targetLibrary === 'series' && !isSeries)) {
      if (isFilm) skipped.films += 1
      else skipped.series += 1
      continue
    }
    candidateCount += 1
    targetRows.push(row)
    if (!title.trim()) {
      errors.push({ path: `Ligne ${row.line}.Title`, message: 'Le titre est obligatoire.' })
      continue
    }
    const rating = parseTenPointRating(rawRating, 'IMDb')
    if (rating.error !== null) {
      errors.push({ path: `Ligne ${row.line}.${recognized.mapping.find((entry) => entry.field === 'rating')?.column ?? 'You rated'}`, message: rating.error })
      continue
    }
    const status = recognized.variant === 'watchlist'
      ? (isFilm ? 'à découvrir' : 'à voir')
      : (isFilm ? 'terminé' : 'vue')
    const item = isFilm
      ? makeFilm(title, status as Film['status'], rating.value, null, null, importedAt)
      : makeSeries(title, 'série télé', status as SeriesStatus, rating.value, null, null, importedAt)
    if (isFilm) films.push(item as Film)
    else series.push(item as Series)
  }

  if (recognized.variant === 'watchlist' && sawRating) {
    errors.push({ path: 'You rated', message: 'Ce fichier s’appelle watchlist.csv mais contient des notes : une liste à voir IMDb ne porte pas de note. Vérifiez le fichier ou son nom avant l’import.' })
  }
  const duplicates = duplicateTitlesForRows(targetRows, titleIndex)
  errors.push(...duplicateTitleErrors(duplicates))
  const ignoredColumns = table.headers.filter((header) => !recognized.mapping.some((entry) => entry.column === header))
  if (recognized.variant === 'ratings') warnings.push({
    code: 'rating-date-not-watched', path: 'created',
    message: '« created » est la date de notation IMDb, pas la date de visionnage. Aucune date de visionnage n’est inventée.',
  })
  if (targetLibrary === 'films' && skipped.series > 0) warnings.push(skippedMediumWarning('series', skipped.series))
  if (targetLibrary === 'series' && skipped.films > 0) warnings.push(skippedMediumWarning('films', skipped.films))
  if (skipped.episodes > 0) warnings.push(skippedEpisodeWarning(skipped.episodes))
  const unsupported = unsupportedTypesWarning(otherTypes)
  if (unsupported !== null) warnings.push(unsupported)
  warnings.push(unmappedColumnsWarning(ignoredColumns))
  const items = targetLibrary === 'films' ? films : series
  return {
    ...recognized, duplicateTitles: duplicates, items: errors.length === 0 ? items : null, errors, warnings,
    ignoredColumns, totalItemCount: candidateCount, validItemCount: items.length,
  }
}

const SIMKL_STATUSES = new Map<string, { film: Film['status']; other: SeriesStatus }>([
  ['completed', { film: 'terminé', other: 'vue' }],
  ['plan to watch', { film: 'à découvrir', other: 'à voir' }],
  ['dropped', { film: 'abandonné', other: 'abandonnée' }],
  ['watching', { film: 'en attente', other: 'en cours' }],
  ['on hold', { film: 'en attente', other: 'en cours' }],
])

function previewSimklImport(
  source: ThirdPartyImportSource,
  table: CsvTable,
  recognized: ThirdPartyImportRecognition,
  targetLibrary: ThirdPartyImportLibrary,
  importedAt: string,
): ThirdPartyImportPreview {
  const errors = [...table.errors]
  const warnings: ThirdPartyImportWarning[] = []
  const films: Film[] = []
  const series: Series[] = []
  const skipped = { films: 0, series: 0, anime: 0 }
  const otherTypes = new Map<string, number>()
  const targetRows: CsvRow[] = []
  let candidateCount = 0
  let sawOnHold = false
  let sawFilmOnHold = false
  let sawProgress = false
  let sawWatchedDate = false
  for (const row of table.rows) {
    const get = cellReader(table, row)
    const title = get('Title')
    const type = normalizeLoose(get('Type'))
    if (type !== 'movie' && type !== 'tv' && type !== 'anime') {
      const raw = get('Type').trim() || 'type vide'
      otherTypes.set(raw, (otherTypes.get(raw) ?? 0) + 1)
      continue
    }
    if ((targetLibrary === 'films' && type !== 'movie') || (targetLibrary === 'series' && type !== 'tv') || (targetLibrary === 'anime' && type !== 'anime')) {
      if (type === 'movie') skipped.films += 1
      else if (type === 'tv') skipped.series += 1
      else skipped.anime += 1
      continue
    }
    candidateCount += 1
    targetRows.push(row)
    if (!title.trim()) {
      errors.push({ path: `Ligne ${row.line}.Title`, message: 'Le titre est obligatoire.' })
      continue
    }
    const status = SIMKL_STATUSES.get(normalizeLoose(get('Watchlist')))
    if (status === undefined) {
      errors.push({ path: `Ligne ${row.line}.Watchlist`, message: 'Statut Simkl inconnu : watching, plan to watch, completed, dropped ou on hold est attendu.' })
      continue
    }
    const rating = parseTenPointRating(get('Rating'), 'Simkl', true)
    if (rating.error !== null) {
      errors.push({ path: `Ligne ${row.line}.Rating`, message: rating.error })
      continue
    }
    const note = get('Memo') || null
    if (get('LastEpWatched').trim() !== '') sawProgress = true
    if (get('WatchedDate').trim() !== '') sawWatchedDate = true
    if (targetLibrary === 'films') {
      const watched = parseSimklDate(get('WatchedDate'))
      if (watched.error !== null) {
        errors.push({ path: `Ligne ${row.line}.WatchedDate`, message: watched.error })
        continue
      }
      if (normalizeLoose(get('Watchlist')) === 'on hold' || normalizeLoose(get('Watchlist')) === 'watching') sawFilmOnHold = true
      films.push(makeFilm(title, status.film, rating.value, watched.value, note, importedAt))
    } else {
      if (normalizeLoose(get('Watchlist')) === 'on hold') sawOnHold = true
      series.push(makeSeries(title, targetLibrary === 'anime' ? 'animation' : 'série télé', status.other, rating.value, null, note, importedAt))
    }
  }
  const duplicates = duplicateTitlesForRows(targetRows, table.headers.findIndex((header) => sourceHeaderKey(header) === 'title'))
  errors.push(...duplicateTitleErrors(duplicates))
  if (candidateCount === 0 && errors.length === 0) {
    errors.push({ path: source.name, message: 'Cet export Simkl ne contient aucune fiche pour cette bibliothèque.' })
  }
  const ignoredColumns = table.headers.filter((header) => !recognized.mapping.some((entry) => entry.column === header))
  if (targetLibrary === 'films' && skipped.series > 0) warnings.push(skippedMediumWarning('series', skipped.series))
  if (targetLibrary === 'films' && skipped.anime > 0) warnings.push(skippedMediumWarning('anime', skipped.anime))
  if (targetLibrary === 'series' && skipped.films > 0) warnings.push(skippedMediumWarning('films', skipped.films))
  if (targetLibrary === 'series' && skipped.anime > 0) warnings.push(skippedMediumWarning('anime', skipped.anime))
  if (targetLibrary === 'anime' && skipped.films > 0) warnings.push(skippedMediumWarning('films', skipped.films))
  if (targetLibrary === 'anime' && skipped.series > 0) warnings.push(skippedMediumWarning('series', skipped.series))
  if (sawOnHold) warnings.push({
    code: 'on-hold-as-in-progress', path: 'Watchlist',
    message: 'Le statut Simkl « on hold » devient « en cours » : Sylloge n’a pas de statut « en pause » pour les Séries et l’Animation japonaise.',
  })
  if (sawFilmOnHold) warnings.push({
    code: 'film-on-hold-as-pending', path: 'Watchlist',
    message: 'Le statut Simkl « watching » ou « on hold » devient « en attente » : Sylloge n’a pas de statut « en cours » pour les Films.',
  })
  if (targetLibrary !== 'films' && sawProgress) warnings.push({
    code: 'progress-not-imported', path: 'LastEpWatched',
    message: 'La progression Simkl (dernier épisode vu) n’est pas reprise : Sylloge compte des saisons, pas des épisodes. Aucune progression n’est inventée.',
  })
  if (targetLibrary !== 'films' && sawWatchedDate) warnings.push({
    code: 'watched-date-not-started', path: 'WatchedDate',
    message: '« WatchedDate » est la date du dernier épisode vu, pas un début de visionnage. Aucun début n’est inventé.',
  })
  const unsupported = unsupportedTypesWarning(otherTypes)
  if (unsupported !== null) warnings.push(unsupported)
  warnings.push(unmappedColumnsWarning(ignoredColumns))
  const items = targetLibrary === 'films' ? films : series
  return {
    ...recognized, duplicateTitles: duplicates, items: errors.length === 0 ? items : null, errors, warnings,
    ignoredColumns, totalItemCount: candidateCount, validItemCount: items.length,
  }
}

const HARDCOVER_STATUSES = new Map<string, BookStatus>([
  ['want to read', 'à lire'], ['currently reading', 'en cours'], ['read', 'lu'], ['did not finish read', 'abandonné'],
])

function previewHardcoverImport(
  source: ThirdPartyImportSource,
  table: CsvTable,
  recognized: ThirdPartyImportRecognition,
  importedAt: string,
): ThirdPartyImportPreview {
  const errors = [...table.errors]
  const warnings: ThirdPartyImportWarning[] = []
  const items: Book[] = []
  const titleIndex = table.headers.findIndex((header) => sourceHeaderKey(header) === 'title')
  for (const row of table.rows) {
    const get = cellReader(table, row)
    const status = HARDCOVER_STATUSES.get(normalizeLoose(get('Status')))
    if (status === undefined) {
      errors.push({ path: `Ligne ${row.line}.Status`, message: `Statut Hardcover inconnu « ${get('Status').trim() || 'vide'} » : Want to Read, Currently Reading, Read ou Did Not Finish Read est attendu.` })
      continue
    }
    const rating = parseHalfPointRating(get('Rating'), 'Hardcover')
    if (rating.error !== null) {
      errors.push({ path: `Ligne ${row.line}.Rating`, message: rating.error })
      continue
    }
    const started = normalizeImportDate(get('Date Started'), 'Début de lecture')
    if (started.warning !== null) warnings.push({ code: 'invalid-date', path: `Ligne ${row.line}.Date Started`, message: started.warning })
    const publishYear = /^(\d{4})/u.exec(get('Publish Date').trim())
    const result = validateBookForm({
      ...EMPTY_BOOK_FORM,
      title: get('Title'), author: get('Author'), year: publishYear?.[1] ?? '',
      status, rating: rating.value === null ? '' : String(rating.value), personalNote: get('Review'),
      category: 'livre', startedAt: started.value ?? '',
    })
    if (!result.success) {
      for (const [field, message] of Object.entries(result.errors)) {
        if (message) errors.push({ path: `Ligne ${row.line}.${field}`, message })
      }
      continue
    }
    items.push({
      id: `import-preview-${row.line}`, profileId: 'import-preview-profile', ...result.data,
      title: get('Title'), author: get('Author') || null, personalNote: get('Review') || null,
      progressUpdatedAt: null, createdAt: importedAt, updatedAt: importedAt, quotes: [],
    })
  }
  const duplicates = duplicateTitlesForRows(table.rows, titleIndex)
  errors.push(...duplicateTitleErrors(duplicates))
  const ignoredColumns = table.headers.filter((header) => !recognized.mapping.some((entry) => entry.column === header))
  warnings.push({
    code: 'finish-date-not-stored', path: 'Date Finished',
    message: 'Date Finished est une fin de lecture ; Sylloge ne stocke pas de date de fin pour les Livres. Aucune date n’est inventée.',
  })
  warnings.push(unmappedColumnsWarning(ignoredColumns))
  return {
    ...recognized, duplicateTitles: duplicates, items: errors.length === 0 ? items : null, errors, warnings,
    ignoredColumns, totalItemCount: table.rows.length, validItemCount: items.length,
  }
}

const MAL_STATUSES = new Map<string, { anime: SeriesStatus; manga: BookStatus }>([
  ['watching', { anime: 'en cours', manga: 'en cours' }],
  ['reading', { anime: 'en cours', manga: 'en cours' }],
  ['completed', { anime: 'vue', manga: 'lu' }],
  ['on-hold', { anime: 'en cours', manga: 'en cours' }],
  ['on hold', { anime: 'en cours', manga: 'en cours' }],
  ['dropped', { anime: 'abandonnée', manga: 'abandonné' }],
  ['plan to watch', { anime: 'à voir', manga: 'à lire' }],
  ['plan to read', { anime: 'à voir', manga: 'à lire' }],
])

function recognizeMalXml(contents: string): ThirdPartyImportRecognition | null {
  const head = contents.replace(/^\uFEFF/u, '').trimStart().slice(0, 8192)
  const body = head.startsWith('<?xml') ? head.replace(/^<\?xml[\s\S]*?\?>/u, '').trimStart() : head
  const isMalRoot = body.startsWith('<myanimelist')
    || (body.startsWith('<!DOCTYPE') && body.slice(0, 4096).includes('<myanimelist'))
  if (!isMalRoot) return null
  const kind = /<user_export_type>\s*2\s*</u.test(head) || /<manga(?:\s|>)/u.test(head) ? 'manga' : 'anime'
  return malRecognition(kind)
}

function malRecognition(kind: 'anime' | 'manga'): ThirdPartyImportRecognition {
  return kind === 'manga'
    ? {
      service: 'myanimelist', variant: 'xml-manga', library: 'mangas', libraries: ['mangas'],
      label: 'MyAnimeList · liste manga',
      mapping: [
        { field: 'title', column: 'manga_title' }, { field: 'status', column: 'my_status' },
        { field: 'rating', column: 'my_score' }, { field: 'startedAt', column: 'my_start_date' },
        { field: 'progress', column: 'my_read_volumes' }, { field: 'personalNote', column: 'my_comments' },
      ],
    }
    : {
      service: 'myanimelist', variant: 'xml-anime', library: 'anime', libraries: ['anime'],
      label: 'MyAnimeList · liste animé',
      mapping: [
        { field: 'title', column: 'series_title' }, { field: 'status', column: 'my_status' },
        { field: 'rating', column: 'my_score' }, { field: 'startedAt', column: 'my_start_date' },
        { field: 'progress', column: 'my_watched_episodes' }, { field: 'personalNote', column: 'my_comments' },
      ],
    }
}

/** Bounded flat XML reader: elements, attributes ignored, CDATA, predefined entities only. */
function parseMalXml(contents: string): { root: XmlNode | null; error: string | null } {
  const stack: XmlNode[] = []
  let root: XmlNode | null = null
  let index = 0
  let nodeCount = 0
  let failure: string | null = null
  const fail = (message: string) => { failure = message; return { root: null, error: message } }
  const appendText = (text: string) => {
    if (text === '') return
    if (stack.length === 0) {
      if (text.trim() !== '') failure = 'Le fichier XML MyAnimeList est mal formé.'
      return
    }
    stack.at(-1)!.text += text
  }
  const decode = (text: string): string | null => {
    let unknown: string | null = null
    const codePoint = (value: number): string | null => {
      try { return String.fromCodePoint(value) } catch { return null }
    }
    const decoded = text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/gu, (entity, name: string) => {
      if (name === 'amp') return '&'
      if (name === 'lt') return '<'
      if (name === 'gt') return '>'
      if (name === 'quot') return '"'
      if (name === 'apos') return "'"
      if (name.startsWith('#x')) {
        const decodedPoint = codePoint(Number.parseInt(name.slice(2), 16))
        if (decodedPoint === null) unknown = name
        return decodedPoint ?? entity
      }
      if (name.startsWith('#')) {
        const decodedPoint = codePoint(Number(name.slice(1)))
        if (decodedPoint === null) unknown = name
        return decodedPoint ?? entity
      }
      unknown = name
      return entity
    })
    return unknown === null ? decoded : null
  }
  while (index < contents.length && failure === null) {
    const lt = contents.indexOf('<', index)
    if (lt < 0) {
      const text = decode(contents.slice(index))
      if (text === null) return fail('Les entités externes ne sont pas prises en charge dans un import XML.')
      appendText(text)
      break
    }
    if (lt > index) {
      const text = decode(contents.slice(index, lt))
      if (text === null) return fail('Les entités externes ne sont pas prises en charge dans un import XML.')
      appendText(text)
    }
    if (contents.startsWith('<?', lt)) {
      const end = contents.indexOf('?>', lt + 2)
      if (end < 0) return fail('Le fichier XML MyAnimeList est mal formé.')
      index = end + 2
      continue
    }
    if (contents.startsWith('<!--', lt)) {
      const end = contents.indexOf('-->', lt + 4)
      if (end < 0) return fail('Le fichier XML MyAnimeList est mal formé.')
      index = end + 3
      continue
    }
    if (contents.startsWith('<![CDATA[', lt)) {
      const end = contents.indexOf(']]>', lt + 9)
      if (end < 0) return fail('Le fichier XML MyAnimeList est mal formé.')
      appendText(contents.slice(lt + 9, end))
      index = end + 3
      continue
    }
    if (contents.startsWith('<!', lt)) return fail('Les entités externes et DOCTYPE ne sont pas prises en charge dans un import XML.')
    if (contents.startsWith('</', lt)) {
      const end = contents.indexOf('>', lt + 2)
      if (end < 0) return fail('Le fichier XML MyAnimeList est mal formé.')
      const name = contents.slice(lt + 2, end).trim()
      const open = stack.at(-1)
      if (!open || open.name !== name) return fail('Le fichier XML MyAnimeList est mal formé.')
      stack.pop()
      index = end + 1
      continue
    }
    let quote: string | null = null
    let end = -1
    for (let cursor = lt + 1; cursor < contents.length; cursor += 1) {
      const character = contents[cursor]
      if (quote !== null) {
        if (character === quote) quote = null
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === '>') {
        end = cursor
        break
      }
    }
    if (end < 0) return fail('Le fichier XML MyAnimeList est mal formé.')
    const raw = contents.slice(lt + 1, end)
    const match = /^([A-Za-z_][\w.:-]*)/u.exec(raw)
    if (!match) return fail('Le fichier XML MyAnimeList est mal formé.')
    const selfClosing = raw.trimEnd().endsWith('/')
    const node: XmlNode = { name: match[1], children: [], text: '' }
    nodeCount += 1
    if (nodeCount > 200_000 || stack.length >= 32) return fail('Le fichier XML MyAnimeList dépasse les bornes sûres de lecture.')
    if (stack.length > 0) stack.at(-1)!.children.push(node)
    else if (root !== null) return fail('Le fichier XML MyAnimeList est mal formé.')
    else root = node
    if (!selfClosing) stack.push(node)
    index = end + 1
  }
  if (failure !== null) return { root: null, error: failure }
  if (stack.length > 0 || root === null) return fail('Le fichier XML MyAnimeList est mal formé.')
  return { root, error: null }
}

function xmlChild(node: XmlNode, name: string): string {
  return node.children.find((child) => child.name === name)?.text ?? ''
}

function previewMalXmlImport(
  source: ThirdPartyImportSource,
  recognized: ThirdPartyImportRecognition,
  targetLibrary: ThirdPartyImportLibrary,
  importedAt: string,
): ThirdPartyImportPreview {
  const timestamp = Date.parse(importedAt)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== importedAt) {
    return {
      ...recognized, items: null, warnings: [], ignoredColumns: [], duplicateTitles: [], totalItemCount: 0, validItemCount: 0,
      errors: [{ path: 'importedAt', message: 'L’horodatage de préparation doit être UTC ISO 8601.' }],
    }
  }
  const parsed = parseMalXml(source.contents)
  if (parsed.root === null || parsed.error !== null) return {
    ...recognized, items: null, warnings: [], ignoredColumns: [], duplicateTitles: [], totalItemCount: 0, validItemCount: 0,
    errors: [{ path: source.name, message: parsed.error ?? 'Le fichier XML MyAnimeList est mal formé.' }],
  }
  if (parsed.root.name !== 'myanimelist') return {
    ...recognized, items: null, warnings: [], ignoredColumns: [], duplicateTitles: [], totalItemCount: 0, validItemCount: 0,
    errors: [{ path: source.name, message: 'La racine XML doit être <myanimelist>.' }],
  }
  const animeNodes = parsed.root.children.filter((child) => child.name === 'anime')
  const mangaNodes = parsed.root.children.filter((child) => child.name === 'manga')
  if (animeNodes.length > 0 && mangaNodes.length > 0) return {
    ...recognized, items: null, warnings: [], ignoredColumns: [], duplicateTitles: [], totalItemCount: animeNodes.length + mangaNodes.length, validItemCount: 0,
    errors: [{ path: source.name, message: 'Cet export MyAnimeList contient à la fois des animés et des mangas. Exportez les deux listes séparément.' }],
  }
  const kind = mangaNodes.length > 0 ? 'manga' : 'anime'
  const effective = malRecognition(kind)
  const nodes = kind === 'manga' ? mangaNodes : animeNodes
  if (!effective.libraries.includes(targetLibrary)) {
    return { ...wrongLibraryPreview(source, effective), totalItemCount: nodes.length }
  }
  if (nodes.length === 0) return {
    ...effective, items: null, warnings: [], ignoredColumns: [], duplicateTitles: [], totalItemCount: 0, validItemCount: 0,
    errors: [{ path: source.name, message: 'Cet export MyAnimeList ne contient aucune fiche de cette liste.' }],
  }
  const errors: ImportValidationError[] = []
  const warnings: ThirdPartyImportWarning[] = []
  const items: Array<Series | Book> = []
  let sawProgress = false
  let sawFinishDate = false
  let sawCompletedMangaProgress = false
  nodes.forEach((node, position) => {
    const line = `Entrée ${position + 1}`
    const title = xmlChild(node, kind === 'manga' ? 'manga_title' : 'series_title')
    if (title.trim() === '') {
      errors.push({ path: `${line}.${kind === 'manga' ? 'manga_title' : 'series_title'}`, message: 'Le titre est obligatoire.' })
      return
    }
    const status = MAL_STATUSES.get(normalizeLoose(xmlChild(node, 'my_status')))
    if (status === undefined) {
      errors.push({ path: `${line}.my_status`, message: 'Statut MyAnimeList inconnu : Watching, Completed, On-Hold, Dropped ou Plan to Watch est attendu.' })
      return
    }
    const scoreRaw = xmlChild(node, 'my_score').trim()
    const score = scoreRaw === '' || scoreRaw === '0' ? { value: null, error: null } : parseTenPointRating(scoreRaw, 'MyAnimeList')
    if (score.error !== null) {
      errors.push({ path: `${line}.my_score`, message: score.error })
      return
    }
    const startRaw = xmlChild(node, 'my_start_date').trim()
    const start = startRaw === '' || startRaw === '0000-00-00' ? { value: null, warning: null } : normalizeImportDate(startRaw, 'Début MyAnimeList')
    if (start.warning !== null) warnings.push({ code: 'invalid-date', path: `${line}.my_start_date`, message: start.warning })
    if (xmlChild(node, 'my_finish_date').trim() !== '' && xmlChild(node, 'my_finish_date').trim() !== '0000-00-00') sawFinishDate = true
    if (kind === 'anime') {
      const episodes = Number(xmlChild(node, 'my_watched_episodes').trim())
      if (Number.isInteger(episodes) && episodes > 0) sawProgress = true
      items.push(makeSeries(title, 'animation', status.anime, score.value, start.value, xmlChild(node, 'my_comments') || null, importedAt))
    } else {
      const volumesRaw = xmlChild(node, 'my_read_volumes').trim()
      const volumes = /^\d+$/u.test(volumesRaw) ? Number(volumesRaw) : 0
      if (Number.isInteger(Number(xmlChild(node, 'my_read_chapters').trim())) && Number(xmlChild(node, 'my_read_chapters').trim()) > 0) sawProgress = true
      const volumesRead = status.manga === 'lu' ? null : (volumes > 0 ? volumes : null)
      if (status.manga === 'lu' && volumes > 0) sawCompletedMangaProgress = true
      const result = validateBookForm({
        ...EMPTY_BOOK_FORM,
        title, author: '', year: '', status: status.manga,
        rating: score.value === null ? '' : String(score.value),
        volumesRead: volumesRead === null ? '' : String(volumesRead),
        startedAt: start.value ?? '', personalNote: xmlChild(node, 'my_comments'),
        category: 'manga',
      })
      if (!result.success) {
        for (const [field, message] of Object.entries(result.errors)) {
          if (message) errors.push({ path: `${line}.${field}`, message })
        }
        return
      }
      items.push({
        id: `import-preview-${position + 1}`, profileId: 'import-preview-profile', ...result.data,
        title, author: null, personalNote: xmlChild(node, 'my_comments') || null,
        progressUpdatedAt: null, createdAt: importedAt, updatedAt: importedAt, quotes: [],
      })
    }
  })
  const duplicateTitles = duplicateTitlesForRows(
    nodes.map((node, index) => ({ line: index + 1, cells: [xmlChild(node, kind === 'manga' ? 'manga_title' : 'series_title')] })),
    0,
  )
  errors.push(...duplicateTitleErrors(duplicateTitles))
  if (sawFinishDate) warnings.push({
    code: 'finish-date-not-stored', path: 'my_finish_date',
    message: 'MyAnimeList fournit une date de fin ; Sylloge ne stocke pas de date de fin pour cette bibliothèque. Aucune date n’est inventée.',
  })
  if (sawProgress) warnings.push({
    code: 'progress-not-imported', path: kind === 'anime' ? 'my_watched_episodes' : 'my_read_chapters',
    message: kind === 'anime'
      ? 'La progression MyAnimeList (épisodes vus) n’est pas reprise : Sylloge compte des saisons, pas des épisodes. Aucune progression n’est inventée.'
      : 'La progression MyAnimeList (chapitres lus) n’est pas reprise : Sylloge ne compte que des tomes. Aucune progression n’est inventée.',
  })
  if (sawCompletedMangaProgress) warnings.push({
    code: 'progress-not-imported', path: 'my_read_volumes',
    message: 'Tomes lus non repris pour un manga terminé : Sylloge exige un total de tomes pour ce statut. Aucun total n’est inventé.',
  })
  return {
    ...effective, duplicateTitles, items: errors.length === 0 ? (items as Series[] | Book[]) : null, errors, warnings,
    ignoredColumns: [], totalItemCount: nodes.length, validItemCount: items.length,
  }
}

type LetterboxdArchiveRecord = {
  source: string
  line: number
  variant: ThirdPartyImportRecognition['variant']
  film: Film
  values: Record<string, string>
}

function previewLetterboxdArchive(
  sources: ThirdPartyImportSource[],
  recognized: ThirdPartyImportRecognition,
  targetLibrary: ThirdPartyImportLibrary,
  importedAt: string,
): ThirdPartyImportPreview {
  const errors: ImportValidationError[] = []
  const warnings: ThirdPartyImportWarning[] = []
  const sourceFiles: NonNullable<ThirdPartyImportPreview['sourceFiles']> = []
  const mapping: ThirdPartyImportRecognition['mapping'] = []
  const ignoredColumns: string[] = []
  const groups = new Map<string, LetterboxdArchiveRecord[]>()
  let sourceRowCount = 0
  const seenNames = new Set<string>()
  for (const source of sources) {
    const normalizedPath = source.name.replace(/\\/gu, '/').toLowerCase()
    if (normalizedPath.split('/').some((segment) => ['deleted', 'deleted-content', 'deleted_content'].includes(segment))) {
      warnings.push({ code: 'excluded-deleted-file', path: source.name, message: 'Contenu supprimé dans Letterboxd : ce fichier est exclu pour ne pas rétablir des fiches supprimées.' })
      continue
    }
    const detected = recognizeThirdPartyTextImport(source)
    const basename = archiveBasename(source.name)
    const supportedName = ['ratings.csv', 'watched.csv', 'watchlist.csv', 'diary.csv', 'reviews.csv'].includes(basename)
    if (detected?.service === 'goodreads') {
      errors.push({ path: source.name, message: 'Cette archive contient aussi un export Goodreads. Importez les services séparément pour ne pas omettre une bibliothèque.' })
      continue
    }
    if (supportedName && detected?.service !== 'letterboxd') {
      errors.push({ path: source.name, message: 'Ce fichier Letterboxd attendu est illisible ou ses colonnes ne correspondent pas. L’archive entière reste bloquée.' })
      continue
    }
    if (!supportedName) {
      warnings.push({ code: 'unsupported-archive-file', path: source.name, message: 'Ce fichier de l’archive n’est pas importé. Seuls ratings.csv, watched.csv, watchlist.csv, diary.csv et reviews.csv sont regroupés.' })
      continue
    }
    if (seenNames.has(basename)) {
      errors.push({ path: source.name, message: `Plusieurs fichiers ${basename} sont présents. Cette archive semble réunir plusieurs exports : choisissez une seule archive Letterboxd.` })
      continue
    }
    seenNames.add(basename)
    if (detected === null) continue
    const table = parseCsv(source.contents)
    sourceFiles.push({ name: source.name, variant: detected.variant, rowCount: table.rows.length })
    sourceRowCount += table.rows.length
    mapping.push(...detected.mapping.map((entry) => ({ ...entry, column: `${source.name} · ${entry.column}` })))
    if (table.rows.length === 0 && table.errors.length === 0) continue
    const preview = previewThirdPartyTextImport(source, targetLibrary, importedAt, { allowDuplicateHistory: true })
    if (preview === null) continue
    errors.push(...preview.errors.map((error) => ({ ...error, path: `${source.name} · ${error.path}` })))
    warnings.push(...preview.warnings)
    ignoredColumns.push(...preview.ignoredColumns.map((column) => `${source.name} · ${column}`))
    if (preview.items === null) continue
    const films = preview.items as Film[]
    table.rows.forEach((row, index) => {
      const values = Object.fromEntries(table.headers.map((header, cell) => [sourceHeaderKey(header), row.cells[cell] ?? '']))
      const film = films[index]
      const key = JSON.stringify([film.title.normalize('NFC').trim().toLowerCase(), values.year?.trim() ?? ''])
      const record = { source: source.name, line: row.line, variant: detected.variant, film, values }
      groups.set(key, [...(groups.get(key) ?? []), record])
    })
  }
  const items: Film[] = []
  for (const records of groups.values()) {
    const ratings = records.find((record) => archiveBasename(record.source) === 'ratings.csv')
    const watched = records.find((record) => archiveBasename(record.source) === 'watched.csv')
    const history = records.filter((record) => ['diary.csv', 'reviews.csv'].includes(archiveBasename(record.source)))
    const dated = [...history].filter((record) => record.film.watchedAt !== null)
      .sort((left, right) => left.film.watchedAt!.localeCompare(right.film.watchedAt!))
    const latest = dated.at(-1) ?? history.at(-1)
    const snapshots = records.filter((record) => !['diary.csv', 'reviews.csv'].includes(archiveBasename(record.source)))
    const filmUris = new Set(snapshots.map((record) => record.values['letterboxd uri']).filter(Boolean))
    const duplicateSnapshot = ['ratings.csv', 'watched.csv', 'watchlist.csv'].some((name) => snapshots.filter((record) => archiveBasename(record.source) === name).length > 1)
    const latestHistory = latest?.film.watchedAt
      ? history.filter((record) => record.film.watchedAt === latest.film.watchedAt)
      : history
    const ambiguousRating = ratings === undefined && new Set(latestHistory.map((record) => record.film.rating)).size > 1
    if (filmUris.size > 1 || duplicateSnapshot || ambiguousRating) errors.push({
      path: records.map((record) => `${record.source} · ligne ${record.line}`).join(', '),
      message: `Le film « ${records[0].film.title} » présente une identité ou des notes contradictoires. Aucun choix de ligne n’est fait automatiquement.`,
    })
    const base = ratings ?? watched ?? latest ?? records[0]
    const explicitDates = records.flatMap((record) => record.film.watchedAt === null ? [] : [record.film.watchedAt]).sort()
    const notes = [...new Set(records.flatMap((record) => record.film.personalNote === null ? [] : [record.film.personalNote]))]
    if (history.length > 0) {
      notes.push(`[Historique Letterboxd]\n${history.map((record) => [
        `${record.source} · ligne ${record.line}`,
        `Visionnage : ${record.film.watchedAt ?? 'date non renseignée'}`,
        `Note : ${record.film.rating === null ? 'sans note' : `${record.film.rating}/5`}`,
        ...(record.values.rewatch ? [`Rewatch : ${record.values.rewatch}`] : []),
        ...(record.values.tags ? [`Tags : ${record.values.tags}`] : []),
      ].join(' · ')).join('\n')}`)
    }
    items.push({
      ...base.film, id: `import-preview-archive-${items.length + 1}`,
      status: records.some((record) => record.film.status === 'terminé') ? 'terminé' : 'à découvrir',
      rating: ratings ? ratings.film.rating : latest?.film.rating ?? base.film.rating,
      watchedAt: explicitDates.at(-1) ?? null,
      personalNote: notes.length > 0 ? notes.join('\n\n') : null,
    })
  }
  const duplicateTitles = findDuplicateTitles({
    headers: ['title'], rows: items.map((item, index) => ({ cells: [item.title], line: index + 1 })), errors: [],
  }, 'title')
  errors.push(...duplicateTitles.map((duplicate) => ({
    path: 'Archive Letterboxd',
    message: `Plusieurs films différents portent le titre « ${duplicate.title} ». L’année de sortie n’étant pas importée depuis un tableau externe, conservez l’original et distinguez leurs titres dans une copie CSV avant l’import.`,
  })))
  if (items.length === 0 && errors.length === 0) errors.push({ path: 'Archive', message: 'Cette archive ne contient aucune fiche Letterboxd importable.' })
  if (sourceFiles.some((source) => ['diary.csv', 'reviews.csv'].includes(archiveBasename(source.name)))) warnings.push({
    code: 'archive-history-preserved', path: 'Archive Letterboxd',
    message: 'Une fiche par film : la note courante vient de ratings.csv lorsqu’il est présent, la dernière date de visionnage explicite est retenue, et les avis, dates et notes historiques du journal restent dans la note personnelle.',
  })
  return {
    ...recognized, mapping, sourceFiles, sourceRowCount,
    items: errors.length === 0 ? items : null, errors, warnings,
    ignoredColumns, duplicateTitles, totalItemCount: items.length, validItemCount: items.length,
  }
}

function archiveBasename(name: string): string {
  return name.replace(/\\/gu, '/').split('/').at(-1)?.toLowerCase() ?? ''
}

function sourceHeaderKey(value: string): string {
  const key = normalizeCsvHeader(value)
  return key === 'bookid' ? 'book id' : key
}

function sourceColumn(headers: string[], expected: string): string | null {
  return headers.find((header) => sourceHeaderKey(header) === sourceHeaderKey(expected)) ?? null
}

function findDuplicateTitles(table: CsvTable, titleColumn: string): ThirdPartyDuplicateTitle[] {
  const index = table.headers.findIndex((header) => sourceHeaderKey(header) === sourceHeaderKey(titleColumn))
  const groups = new Map<string, ThirdPartyDuplicateTitle>()
  for (const row of table.rows) {
    const title = row.cells[index] ?? ''
    const key = normalizeCsvHeader(title)
    if (!key) continue
    const group = groups.get(key) ?? { title, lines: [] }
    group.lines.push(row.line)
    groups.set(key, group)
  }
  return [...groups.values()].filter((group) => group.lines.length > 1)
}
