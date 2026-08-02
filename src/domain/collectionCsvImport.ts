import { parseCsv, normalizeCsvHeader, type CsvRow, type CsvTable } from './csv.ts'
import { COLLECTION_CSV_CONTRACTS, type CsvCollectionMedium } from './collectionCsvTransfer.ts'
import { validateSeriesForm, type SeriesFormValues } from './seriesForm.ts'
import { validateBookForm, type BookFormValues } from './bookForm.ts'
import { validateGameForm, type GameFormValues } from './gameForm.ts'
import { validateArtworkForm, type ArtworkFormValues } from './artworkForm.ts'
import { ARTWORK_FORMS, ARTWORK_STATUSES, type Artwork } from './artwork.ts'
import { BOOK_CATEGORIES, BOOK_STATUSES, type Book, type BookQuote } from './book.ts'
import { GAME_STATUSES, type Game } from './game.ts'
import type { ImportValidationError } from './libraryTransfer.ts'
import { SERIES_CATEGORIES, SERIES_STATUSES, type Series } from './series.ts'

export type CollectionCsvImportKind = Exclude<CsvCollectionMedium, 'films'>
export type CollectionCsvItem = Artwork | Book | Game | Series
export type CollectionCsvMapping = Record<string, string | null>

export type CollectionCsvField = {
  key: string
  label: string
  aliases: string[]
}

export type CollectionCsvImportSession = {
  kind: CollectionCsvImportKind
  table: CsvTable
  sourceKind: 'sylloge-csv-v1' | 'csv'
  initialMapping: CollectionCsvMapping
}

export type CollectionCsvImportPreview<T extends CollectionCsvItem = CollectionCsvItem> = {
  items: T[] | null
  validItemCount: number
  totalItemCount: number
  errors: ImportValidationError[]
  sourceKind: CollectionCsvImportSession['sourceKind']
  mapping: Array<{ field: string; column: string }>
  ignoredColumns: string[]
}

const COMMON_HEADERS = [
  'format', 'version', 'exported_at', 'profile_id', 'profile_name', 'profile_created_at', 'profile_updated_at',
] as const

const FIELDS: Record<CollectionCsvImportKind, readonly CollectionCsvField[]> = {
  series: [
    field('title', 'Titre', ['titre', 'title', 'name']),
    field('showrunner', 'Showrunner', ['showrunner', 'createur', 'créateur', 'creator']),
    field('casting', 'Casting', ['casting', 'cast', 'acteurs', 'actors']),
    field('summary', 'Résumé', ['resume', 'résumé', 'summary', 'description', 'synopsis']),
    field('category', 'Catégorie', ['categorie', 'catégorie', 'category', 'type']),
    field('status', 'Statut', ['statut', 'status', 'state']),
    field('rating', 'Note', ['note', 'rating', 'score']),
    field('isFavorite', 'Coup de cœur', ['favori', 'favorite', 'coup de coeur', 'coup de cœur', 'heart']),
    field('seasonsSeen', 'Saisons vues', ['saisons vues', 'seasons seen', 'saisons vues total']),
    field('seasonsTotal', 'Saisons au total', ['saisons total', 'saisons au total', 'seasons total', 'total seasons']),
    field('startedAt', 'Début de visionnage', ['debut de visionnage', 'début de visionnage', 'started at', 'start date']),
    field('posterUrl', 'URL d’affiche', ['affiche', 'poster', 'poster url', 'image']),
    field('personalNote', 'Avis', ['avis', 'note personnelle', 'personal note', 'review', 'commentaire']),
  ],
  books: [
    field('title', 'Titre', ['titre', 'title', 'name']),
    field('author', 'Auteur', ['auteur', 'author', 'autrice']),
    field('year', 'Année', ['annee', 'année', 'year', 'publication year']),
    field('summary', 'Résumé', ['resume', 'résumé', 'summary', 'description', 'synopsis']),
    field('category', 'Catégorie', ['categorie', 'catégorie', 'category', 'type']),
    field('status', 'Statut', ['statut', 'status', 'state']),
    field('rating', 'Note', ['note', 'rating', 'score']),
    field('isFavorite', 'Coup de cœur', ['favori', 'favorite', 'coup de coeur', 'coup de cœur', 'heart']),
    field('volumesRead', 'Tomes lus', ['tomes lus', 'volumes read', 'volumes lus']),
    field('volumesTotal', 'Tomes au total', ['tomes total', 'tomes au total', 'volumes total', 'total volumes']),
    field('startedAt', 'Début de lecture', ['debut de lecture', 'début de lecture', 'started at', 'start date']),
    field('coverUrl', 'URL de couverture', ['couverture', 'cover', 'cover url', 'image']),
    field('personalNote', 'Avis', ['avis', 'note personnelle', 'personal note', 'review', 'commentaire']),
    field('quotes', 'Citations JSON', ['citations json', 'quotes json', 'citations', 'quotes']),
  ],
  games: [
    field('title', 'Titre', ['titre', 'title', 'name']),
    field('developer', 'Développeur', ['developpeur', 'développeur', 'developer', 'studio']),
    field('platform', 'Plateforme', ['plateforme', 'platform', 'console']),
    field('year', 'Année', ['annee', 'année', 'year', 'release year']),
    field('status', 'Statut', ['statut', 'status', 'state']),
    field('rating', 'Note', ['note', 'rating', 'score']),
    field('isFavorite', 'Coup de cœur', ['favori', 'favorite', 'coup de coeur', 'coup de cœur', 'heart']),
    field('playedAt', 'Date de jeu', ['date de jeu', 'played at', 'play date']),
    field('coverUrl', 'URL de couverture', ['couverture', 'cover', 'cover url', 'image']),
    field('personalNote', 'Avis', ['avis', 'note personnelle', 'personal note', 'review', 'commentaire']),
  ],
  artworks: [
    field('title', 'Titre', ['titre', 'title', 'name']),
    field('artist', 'Artiste', ['artiste', 'artist', 'auteur', 'author']),
    field('year', 'Année', ['annee', 'année', 'year']),
    field('form', 'Forme', ['forme', 'form', 'type']),
    field('location', 'Lieu', ['lieu', 'location', 'place']),
    field('exhibition', 'Exposition', ['exposition', 'exhibition', 'show']),
    field('status', 'Statut', ['statut', 'status', 'state']),
    field('isFavorite', 'Coup de cœur', ['favori', 'favorite', 'coup de coeur', 'coup de cœur', 'heart']),
    field('discoveredAt', 'Date de découverte', ['date de decouverte', 'date de découverte', 'discovered at', 'discovery date']),
    field('imageUrl', 'URL du visuel', ['visuel', 'image', 'image url', 'image_url']),
    field('personalNote', 'Avis', ['avis', 'note personnelle', 'personal note', 'review', 'commentaire']),
  ],
}

function field(key: string, label: string, aliases: string[]): CollectionCsvField {
  return { key, label, aliases: aliases.map(normalizeCsvHeader) }
}

export function collectionCsvFields(kind: CollectionCsvImportKind): readonly CollectionCsvField[] {
  return FIELDS[kind]
}

export function prepareCollectionCsvImport(kind: CollectionCsvImportKind, contents: string): CollectionCsvImportSession {
  const table = parseCsv(contents)
  const sourceKind = isSyllogeCollectionCsv(kind, table.headers) ? 'sylloge-csv-v1' : 'csv'
  return {
    kind,
    table,
    sourceKind,
    initialMapping: sourceKind === 'sylloge-csv-v1'
      ? {}
      : detectMapping(kind, table.headers),
  }
}

export function setCollectionCsvSourceDestination(
  configuration: CollectionCsvMapping,
  source: string,
  destination: string | null,
): CollectionCsvMapping {
  const mapping = { ...configuration }
  for (const [fieldKey, column] of Object.entries(mapping)) {
    if (column === source || fieldKey === destination) mapping[fieldKey] = null
  }
  if (destination !== null) mapping[destination] = source
  return mapping
}

export function collectionCsvDestinationForSource(configuration: CollectionCsvMapping, source: string): string | null {
  return Object.entries(configuration).find(([, column]) => column === source)?.[0] ?? null
}

export function previewCollectionCsvImport(
  session: CollectionCsvImportSession,
  configuration: CollectionCsvMapping | null,
  importedAt = new Date().toISOString(),
): CollectionCsvImportPreview {
  if (session.sourceKind === 'sylloge-csv-v1') return previewSyllogeCsv(session)
  if (configuration === null) return invalidPreview(session, '$', 'Le mapping CSV est introuvable.')

  const errors = [...session.table.errors, ...mappingErrors(session, configuration)]
  const titleColumn = configuration.title
  if (!titleColumn) errors.push({ path: 'Mapping', message: 'Le titre doit être mappé avant de pouvoir préparer l’import.' })
  const indexByHeader = new Map(session.table.headers.map((header, index) => [header, index]))
  const items: CollectionCsvItem[] = []

  for (const row of session.table.rows) {
    const before = errors.length
    const values = mappedValues(configuration, row, indexByHeader)
    const item = parseGenericRow(session.kind, values, row.line, importedAt, errors)
    if (item !== null && errors.length === before) items.push(item)
  }

  return {
    items: errors.length === 0 ? items : null,
    validItemCount: items.length,
    totalItemCount: session.table.rows.length,
    errors,
    sourceKind: 'csv',
    mapping: mappingEntries(session.kind, configuration),
    ignoredColumns: session.table.headers.filter((header) => !Object.values(configuration).includes(header)),
  }
}

function previewSyllogeCsv(session: CollectionCsvImportSession): CollectionCsvImportPreview {
  const errors = [...session.table.errors]
  const indexByHeader = new Map(session.table.headers.map((header, index) => [header, index]))
  const contract = COLLECTION_CSV_CONTRACTS[session.kind]
  const items: CollectionCsvItem[] = []

  if (session.table.rows.length === 0) errors.push({ path: '$', message: 'Le CSV Sylloge ne contient aucune ligne de profil.' })
  for (const row of session.table.rows) {
    const source = sourceValues(session.kind, row, indexByHeader)
    if (source.format !== contract.format) {
      errors.push({ path: `Ligne ${row.line}.format`, message: `Le format attendu est « ${contract.format} ».` })
    }
    if (source.version !== '1') {
      errors.push({ path: `Ligne ${row.line}.version`, message: 'La version CSV attendue est 1.' })
    }
    if (isEmptySyllogeRow(session.kind, source)) continue
    const before = errors.length
    const item = parseSyllogeRow(session.kind, source, row.line, errors)
    if (item !== null && errors.length === before) items.push(item)
  }

  return {
    items: errors.length === 0 ? items : null,
    validItemCount: items.length,
    totalItemCount: session.table.rows.length,
    errors,
    sourceKind: 'sylloge-csv-v1',
    mapping: [{ field: 'Format', column: `Contrat ${contract.format} v1 exact` }],
    ignoredColumns: [],
  }
}

function isSyllogeCollectionCsv(kind: CollectionCsvImportKind, headers: string[]): boolean {
  const expected = [...COMMON_HEADERS, ...COLLECTION_CSV_CONTRACTS[kind].entityHeaders]
  return headers.length === expected.length && headers.every((header, index) => header === expected[index])
}

function sourceValues(kind: CollectionCsvImportKind, row: CsvRow, indexByHeader: Map<string, number>): Record<string, string> {
  const values: Record<string, string> = {}
  const headers = [...COMMON_HEADERS, ...COLLECTION_CSV_CONTRACTS[kind].entityHeaders]
  for (const header of headers) {
    const value = row.cells[indexByHeader.get(header) ?? -1] ?? ''
    values[header] = isTextHeader(header) ? unprotectSpreadsheetText(value) : value
  }
  return values
}

function isTextHeader(header: string): boolean {
  return !/(?:_year|_rating|_is_favorite|_seasons_seen|_seasons_total|_volumes_read|_volumes_total)$/u.test(header)
}

function unprotectSpreadsheetText(value: string): string {
  return value.startsWith("'") ? value.slice(1) : value
}

function isEmptySyllogeRow(kind: CollectionCsvImportKind, source: Record<string, string>): boolean {
  return COLLECTION_CSV_CONTRACTS[kind].entityHeaders.every((header) => source[header] === '')
}

function parseSyllogeRow(
  kind: CollectionCsvImportKind,
  source: Record<string, string>,
  line: number,
  errors: ImportValidationError[],
): CollectionCsvItem | null {
  const prefix = kind === 'series' ? 'series' : kind === 'artworks' ? 'artwork' : kind.slice(0, -1)
  const values: Record<string, string | null> = {}
  for (const fieldDefinition of FIELDS[kind]) {
    const header = fieldDefinition.key === 'quotes'
      ? 'book_quotes_json'
      : `${prefix}_${snakeCase(fieldDefinition.key)}`
    values[fieldDefinition.key] = source[header] ?? null
  }

  const item = parseGenericRow(kind, values, line, source[`${prefix}_created_at`] || new Date().toISOString(), errors)
  if (item === null) return null

  const createdAt = source[`${prefix}_created_at`]
  const updatedAt = source[`${prefix}_updated_at`]
  if (!isIsoUtc(createdAt)) errors.push({ path: `Ligne ${line}.${prefix}_created_at`, message: 'Un horodatage UTC ISO 8601 est attendu.' })
  if (!isIsoUtc(updatedAt)) errors.push({ path: `Ligne ${line}.${prefix}_updated_at`, message: 'Un horodatage UTC ISO 8601 est attendu.' })
  if (kind === 'series') {
    const progressUpdatedAt = source.series_progress_updated_at
    if (progressUpdatedAt && !isIsoUtc(progressUpdatedAt)) errors.push({ path: `Ligne ${line}.series_progress_updated_at`, message: 'Un horodatage UTC ISO 8601 est attendu.' })
    return { ...item, createdAt, updatedAt, progressUpdatedAt: progressUpdatedAt || null } as Series
  }
  if (kind === 'books') {
    const progressUpdatedAt = source.book_progress_updated_at
    if (progressUpdatedAt && !isIsoUtc(progressUpdatedAt)) errors.push({ path: `Ligne ${line}.book_progress_updated_at`, message: 'Un horodatage UTC ISO 8601 est attendu.' })
    return { ...item, createdAt, updatedAt, progressUpdatedAt: progressUpdatedAt || null } as Book
  }
  return { ...item, createdAt, updatedAt } as Game | Artwork
}

function parseGenericRow(
  kind: CollectionCsvImportKind,
  values: Record<string, string | null>,
  line: number,
  importedAt: string,
  errors: ImportValidationError[],
): CollectionCsvItem | null {
  const value = (key: string) => values[key] ?? ''
  if (kind === 'series') {
    const result = validateSeriesForm({
      title: value('title'), showrunner: value('showrunner'), casting: value('casting'), summary: value('summary'),
      category: (canonicalEnum(value('category'), SERIES_CATEGORIES) ?? 'série télé') as SeriesFormValues['category'], status: (canonicalEnum(value('status'), SERIES_STATUSES) ?? 'à voir') as SeriesFormValues['status'], rating: value('rating'),
      isFavorite: parseFavorite(value('isFavorite'), line, errors), seasonsSeen: value('seasonsSeen'), seasonsTotal: value('seasonsTotal'),
      startedAt: value('startedAt'), posterUrl: value('posterUrl'), personalNote: value('personalNote'),
    } satisfies SeriesFormValues)
    if (!result.success) return formFailure(line, result.errors, errors)
    return { id: `import-preview-${line}`, profileId: 'import-preview-profile', ...result.data, progressUpdatedAt: null, createdAt: importedAt, updatedAt: importedAt }
  }
  if (kind === 'books') {
    const quotes = parseQuotes(value('quotes'), line, errors, importedAt)
    const result = validateBookForm({
      title: value('title'), author: value('author'), year: value('year'), summary: value('summary'),
      category: (canonicalEnum(value('category'), BOOK_CATEGORIES) ?? 'livre') as BookFormValues['category'], status: (canonicalEnum(value('status'), BOOK_STATUSES) ?? 'à lire') as BookFormValues['status'], rating: value('rating'),
      isFavorite: parseFavorite(value('isFavorite'), line, errors), volumesRead: value('volumesRead'), volumesTotal: value('volumesTotal'),
      startedAt: value('startedAt'), coverUrl: value('coverUrl'), personalNote: value('personalNote'), quotes: quotes.map((quote) => quote.body),
    } satisfies BookFormValues)
    if (!result.success) return formFailure(line, result.errors, errors)
    return {
      id: `import-preview-${line}`, profileId: 'import-preview-profile', ...result.data,
      progressUpdatedAt: null, createdAt: importedAt, updatedAt: importedAt,
      quotes: quotes.map((quote, position) => ({ ...quote, position })),
    }
  }
  if (kind === 'games') {
    const result = validateGameForm({
      title: value('title'), developer: value('developer'), platform: value('platform'), year: value('year'),
      status: (canonicalEnum(value('status'), GAME_STATUSES) ?? 'à jouer') as GameFormValues['status'], rating: value('rating'), isFavorite: parseFavorite(value('isFavorite'), line, errors),
      playedAt: value('playedAt'), coverUrl: value('coverUrl'), personalNote: value('personalNote'),
    } satisfies GameFormValues)
    if (!result.success) return formFailure(line, result.errors, errors)
    return { id: `import-preview-${line}`, profileId: 'import-preview-profile', ...result.data, createdAt: importedAt, updatedAt: importedAt }
  }
  const result = validateArtworkForm({
    title: value('title'), artist: value('artist'), year: value('year'), form: (canonicalEnum(value('form'), ARTWORK_FORMS) ?? 'autre') as ArtworkFormValues['form'],
    location: value('location'), exhibition: value('exhibition'), status: (canonicalEnum(value('status'), ARTWORK_STATUSES) ?? 'à découvrir') as ArtworkFormValues['status'],
    isFavorite: parseFavorite(value('isFavorite'), line, errors), discoveredAt: value('discoveredAt'),
    imageUrl: value('imageUrl'), personalNote: value('personalNote'),
  } satisfies ArtworkFormValues)
  if (!result.success) return formFailure(line, result.errors, errors)
  return { id: `import-preview-${line}`, profileId: 'import-preview-profile', ...result.data, createdAt: importedAt, updatedAt: importedAt }
}

function parseQuotes(value: string, line: number, errors: ImportValidationError[], importedAt: string): BookQuote[] {
  if (!value.trim()) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.some((quote) => typeof quote !== 'string')) {
      errors.push({ path: `Ligne ${line}.citations`, message: 'Les citations doivent être un tableau JSON de textes.' })
      return []
    }
    return parsed.filter((quote) => quote.trim()).map((body, position) => ({
      id: `import-preview-${line}-quote-${position}`, bookId: `import-preview-${line}`, body, position, createdAt: importedAt,
    }))
  } catch {
    errors.push({ path: `Ligne ${line}.citations`, message: 'Les citations doivent être un tableau JSON valide.' })
    return []
  }
}

function formFailure(line: number, formErrors: Record<string, string | undefined>, errors: ImportValidationError[]): null {
  for (const [field, message] of Object.entries(formErrors)) {
    if (message) errors.push({ path: `Ligne ${line}.${field}`, message })
  }
  return null
}

function parseFavorite(value: string, line: number, errors: ImportValidationError[]): boolean {
  const normalized = normalizeCsvHeader(value)
  if (!normalized) return false
  if (['true', 'yes', 'oui', '1'].includes(normalized)) return true
  if (['false', 'no', 'non', '0'].includes(normalized)) return false
  errors.push({ path: `Ligne ${line}.favori`, message: `La valeur favori « ${value} » doit valoir Yes, No, true, false, oui ou non.` })
  return false
}

function canonicalEnum(value: string, values: readonly string[]): string | null {
  if (!value.trim()) return null
  const normalized = normalizeCsvHeader(value)
  return values.find((candidate) => normalizeCsvHeader(candidate) === normalized) ?? value
}

function detectMapping(kind: CollectionCsvImportKind, headers: string[]): CollectionCsvMapping {
  const mapping: CollectionCsvMapping = {}
  const assigned = new Set<string>()
  for (const destination of FIELDS[kind]) {
    const column = headers.find((header) => !assigned.has(header) && destination.aliases.includes(normalizeCsvHeader(header))) ?? null
    mapping[destination.key] = column
    if (column !== null) assigned.add(column)
  }
  return mapping
}

function mappingErrors(session: CollectionCsvImportSession, mapping: CollectionCsvMapping): ImportValidationError[] {
  const errors: ImportValidationError[] = []
  const allowed = new Set(FIELDS[session.kind].map((fieldDefinition) => fieldDefinition.key))
  const sources = new Map<string, string>()
  for (const [destination, column] of Object.entries(mapping)) {
    if (!allowed.has(destination)) {
      errors.push({ path: `Mapping.${destination}`, message: 'Cette destination ne fait pas partie du contrat de cette collection.' })
      continue
    }
    if (column === null) continue
    if (!session.table.headers.includes(column)) {
      errors.push({ path: `Mapping.${destination}`, message: `La colonne « ${column} » n’existe pas dans le fichier.` })
      continue
    }
    const previous = sources.get(column)
    if (previous) {
      errors.push({ path: `Mapping.${destination}`, message: `La colonne « ${column} » est déjà envoyée vers « ${fieldLabel(session.kind, previous)} ».` })
      continue
    }
    sources.set(column, destination)
  }
  return errors
}

function mappedValues(mapping: CollectionCsvMapping, row: CsvRow, indexByHeader: Map<string, number>): Record<string, string | null> {
  return Object.fromEntries(Object.entries(mapping).map(([destination, column]) => [
    destination,
    column === null ? null : row.cells[indexByHeader.get(column) ?? -1] ?? '',
  ]))
}

function mappingEntries(kind: CollectionCsvImportKind, mapping: CollectionCsvMapping): Array<{ field: string; column: string }> {
  return Object.entries(mapping).flatMap(([destination, column]) => column === null ? [] : [{ field: fieldLabel(kind, destination), column }])
}

function fieldLabel(kind: CollectionCsvImportKind, key: string): string {
  return FIELDS[kind].find((fieldDefinition) => fieldDefinition.key === key)?.label ?? key
}

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => `_${character.toLowerCase()}`)
}

function isIsoUtc(value: string): boolean {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

function invalidPreview(session: CollectionCsvImportSession, path: string, message: string): CollectionCsvImportPreview {
  return {
    items: null,
    validItemCount: 0,
    totalItemCount: session.table.rows.length,
    errors: [...session.table.errors, { path, message }],
    sourceKind: session.sourceKind,
    mapping: [],
    ignoredColumns: [],
  }
}
