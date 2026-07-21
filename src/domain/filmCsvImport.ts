import { normalizeFilm, type Film, type FilmStatus } from './film.ts'
import {
  SYLLOGE_FILMS_CSV_FORMAT,
  SYLLOGE_FILMS_CSV_HEADER,
  SYLLOGE_FILMS_CSV_VERSION,
} from './csvFilmExport.ts'
import {
  SYLLOGE_EXPORT_FORMAT,
  SYLLOGE_EXPORT_VERSION,
  validateLibraryImport,
  type ImportPreview,
  type ImportValidationError,
  type SyllogeExportDocument,
} from './libraryTransfer.ts'

export const IMPORTABLE_FILM_FIELDS = [
  'title',
  'status',
  'rating',
  'watchedAt',
  'personalNote',
  'isFavorite',
] as const

export type ImportableFilmField = (typeof IMPORTABLE_FILM_FIELDS)[number]
export type RatingScale = 5 | 10

export type MarkdownPage = {
  name: string
  contents: string
}

export type FilmImportCsvCandidate = {
  id: string
  name: string
  contents: string
}

export type PickedFilmsImportFile = {
  name: string
  kind: 'csv' | 'notion'
  csvCandidates: FilmImportCsvCandidate[]
  markdownPages: MarkdownPage[]
}

export type FilmImportMapping = Record<ImportableFilmField, string | null>

export type FilmImportConfiguration = {
  profileName: string
  mapping: FilmImportMapping
  markdownNotes: boolean
  ratingScale: RatingScale | null
}

export const NOTION_MARKDOWN_NOTES_SOURCE = '__notion_markdown_notes__'
export type FilmImportSource = string | typeof NOTION_MARKDOWN_NOTES_SOURCE

export type FilmImportWarning = {
  path: string
  message: string
}

export type DetectedRatingScale = 'none' | 'ambiguous' | 'mixed' | RatingScale

export type FilmImportCandidateSummary = {
  id: string
  name: string
  label: string
  recognizedFields: ImportableFilmField[]
}

export type FilmImportSourceSelection = {
  candidates: FilmImportCandidateSummary[]
  defaultCandidateId: string | null
  selectionRequired: boolean
  automaticSelectionMessage: string | null
}

export type FilmsCsvImportPreview = ImportPreview & {
  sourceKind: 'sylloge-csv-v1' | 'csv' | 'notion'
  sourceLabel: string
  mapping: Array<{ field: string; column: string }>
  ignoredColumns: string[]
  warnings: FilmImportWarning[]
  detectedRatingScale: DetectedRatingScale
}

type CsvRow = {
  cells: string[]
  line: number
}

type CsvTable = {
  headers: string[]
  rows: CsvRow[]
  errors: ImportValidationError[]
}

type GenericFilmImportSession = {
  kind: 'generic'
  sourceKind: 'csv' | 'notion'
  sourceLabel: string
  notionDatabaseRoots: string[]
  headers: string[]
  table: CsvTable
  suggestedProfileName: string
  initialMapping: FilmImportMapping
}

type SyllogeFilmImportSession = {
  kind: 'sylloge'
  sourceLabel: string
  table: CsvTable
}

export type FilmImportSession = GenericFilmImportSession | SyllogeFilmImportSession

export const FILM_IMPORT_FIELD_LABELS: Record<ImportableFilmField, string> = {
  title: 'Titre',
  status: 'Statut',
  rating: 'Évaluation',
  watchedAt: 'Vu le',
  personalNote: 'Note personnelle',
  isFavorite: 'Coup de cœur',
}

const FIELD_ALIASES: Record<ImportableFilmField, string[]> = {
  title: ['titre', 'name', 'title'],
  status: ['statut', 'status', 'state'],
  rating: ['note', 'rating', 'score'],
  watchedAt: ['vu le', 'watched at', 'watch date', 'date watched', 'date de visionnage'],
  personalNote: ['notes', 'commentaire', 'commentaires', 'review', 'avis', 'personal note'],
  isFavorite: ['favori', 'favorite', 'coup de coeur', 'heart'],
}

const METADATA_SOURCE_ALIASES = [
  'titre original', 'original title', 'original name',
  'annee', 'annee de sortie', 'year', 'release year',
  'realisateur', 'director', 'directed by',
  'resume', 'summary', 'description', 'synopsis',
  'acteur', 'acteurs', 'actor', 'actors', 'casting',
  'affiche', 'poster', 'cover', 'image',
]

const FUTURE_FEATURE_SOURCE_ALIASES = [
  'cinema', 'theatre', 'theater', 'revisionnage', 'rewatch', 'revu',
]

const SYLLOGE_TEXT_HEADERS = new Set([
  'format', 'exported_at', 'profile_id', 'profile_name', 'profile_created_at', 'profile_updated_at',
  'film_id', 'film_profile_id', 'film_title', 'film_original_title', 'film_status',
  'film_personal_note', 'film_director', 'film_summary', 'film_provider_name',
  'film_provider_id', 'film_poster_url', 'film_created_at', 'film_updated_at',
])

export function inspectFilmCsvImportSource(source: PickedFilmsImportFile): FilmImportSourceSelection {
  const notionCandidates = source.kind === 'notion'
    ? retainNotionCompleteViews(source.csvCandidates)
    : source.csvCandidates
  const candidates = summarizeFilmImportCandidates(notionCandidates)
  const notionLogicalTableCount = source.kind === 'notion'
    ? new Set(source.csvCandidates.map((candidate) => notionLogicalTableKey(candidate.name))).size
    : 0
  const automaticNotionView = source.kind === 'notion' && candidates.length === 1
    ? source.csvCandidates.find((candidate) => candidate.id === candidates[0].id)
    : undefined
  if (automaticNotionView !== undefined && source.csvCandidates.length !== notionCandidates.length) {
    return {
      candidates,
      defaultCandidateId: automaticNotionView.id,
      selectionRequired: false,
      automaticSelectionMessage: `Notion a exporté deux vues de ${conciseFilmImportTableLabel(automaticNotionView.name)}. La vue complète est retenue automatiquement pour récupérer votre suivi personnel.`,
    }
  }

  if (source.kind === 'notion' && notionLogicalTableCount > 1) {
    return {
      candidates,
      defaultCandidateId: null,
      selectionRequired: true,
      automaticSelectionMessage: null,
    }
  }

  const suitableCandidates = candidates.filter((candidate) => (
    candidate.recognizedFields.includes('title') && candidate.recognizedFields.length >= 2
  ))
  const highestRecognizedFieldCount = Math.max(
    0,
    ...suitableCandidates.map((candidate) => candidate.recognizedFields.length),
  )
  const bestCandidates = suitableCandidates.filter((candidate) => (
    candidate.recognizedFields.length === highestRecognizedFieldCount
  ))
  const defaultCandidateId = candidates.length === 1
    ? candidates[0]?.id ?? null
    : bestCandidates.length === 1
      ? bestCandidates[0].id
      : null

  return {
    candidates,
    defaultCandidateId,
    selectionRequired: candidates.length > 1 && defaultCandidateId === null,
    automaticSelectionMessage: null,
  }
}

function retainNotionCompleteViews(candidates: FilmImportCsvCandidate[]): FilmImportCsvCandidate[] {
  const grouped = new Map<string, FilmImportCsvCandidate[]>()
  for (const candidate of candidates) {
    const key = notionLogicalTableKey(candidate.name)
    grouped.set(key, [...(grouped.get(key) ?? []), candidate])
  }

  return [...grouped.values()].flatMap((group) => {
    const completeCandidate = findNotionCompleteViewPair(group)
    return completeCandidate === null ? group : [completeCandidate]
  })
}

function findNotionCompleteViewPair(candidates: FilmImportCsvCandidate[]): FilmImportCsvCandidate | null {
  const group = candidates
  const completeCandidates = group.filter((candidate) => isNotionCompleteView(candidate.name))
  const standardCandidates = group.filter((candidate) => !isNotionCompleteView(candidate.name))
  return completeCandidates.length === 1 && standardCandidates.length === 1
    ? completeCandidates[0]
    : null
}

function summarizeFilmImportCandidates(candidates: FilmImportCsvCandidate[]): FilmImportCandidateSummary[] {
  const conciseLabels = candidates.map((candidate) => conciseFilmImportTableLabel(candidate.name))
  const duplicateCounts = new Map<string, number>()
  for (const label of conciseLabels) {
    duplicateCounts.set(label, (duplicateCounts.get(label) ?? 0) + 1)
  }

  return candidates.map((candidate, index) => ({
    id: candidate.id,
    name: candidate.name,
    label: duplicateCounts.get(conciseLabels[index]) === 1
      ? conciseLabels[index]
      : distinctFilmImportTableLabel(candidate.name, conciseLabels[index], index + 1),
    recognizedFields: recognizedFieldsForCandidate(candidate.contents),
  }))
}

function distinctFilmImportTableLabel(path: string, label: string, fallbackIndex: number): string {
  const segments = normalizeNotionPath(path).split('/').filter(Boolean)
  const parent = segments.length > 1 ? readableTableName(segments.at(-2) ?? '') : ''
  return parent && parent !== label ? `${parent} · ${label}` : `${label} (${fallbackIndex})`
}

function notionLogicalTableKey(path: string): string {
  const root = notionDatabaseRoot(path) ?? ''
  return `${normalizeNotionPath(root)}|${normalize(notionTableDirectoryName(notionPathName(path)))}`
}

function isNotionCompleteView(path: string): boolean {
  return /(?:[_\s-]+)(?:all|full)\.csv$/iu.test(notionPathName(path))
}

export function conciseFilmImportTableLabel(value: string): string {
  const lastPart = value.replace(/\\/gu, '/').split('/').filter(Boolean).at(-1) ?? value
  return lastPart
    .replace(/(?:^|[_\s-]+)(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{32})(?=\.csv$|[_\s-]|$)/giu, '')
    .replace(/_all(?=\.csv$)/iu, '')
    .replace(/\.csv$/iu, '') || 'Table CSV'
}

export function conciseFilmImportReportSource(
  source: PickedFilmsImportFile,
  selectedCandidateId: string | null,
): string {
  const format = source.kind === 'notion' ? 'Notion' : 'CSV'
  const candidate = source.csvCandidates.find((item) => item.id === selectedCandidateId)
  return `${format} · ${conciseFilmImportTableLabel(candidate?.name ?? '')}`
}

export function prepareFilmCsvImport(
  source: PickedFilmsImportFile,
  candidateId?: string,
): FilmImportSession {
  const selection = inspectFilmCsvImportSource(source)
  const selectedCandidateId = candidateId ?? selection.defaultCandidateId
  const candidate = source.csvCandidates.find((item) => item.id === selectedCandidateId)
  const candidateIsSelectable = selection.candidates.some((item) => item.id === selectedCandidateId)
  if (!candidate || !candidateIsSelectable) throw new Error('Choisissez une table CSV Notion avant de préparer son aperçu.')

  const table = parseCsv(candidate.contents)
  const sourceLabel = source.kind === 'notion' ? `Export Notion : ${candidate.name}` : 'CSV'

  if (isSyllogeCsvHeader(table.headers)) {
    return { kind: 'sylloge', sourceLabel: 'CSV Sylloge Films v1', table }
  }

  return {
    kind: 'generic',
    sourceKind: source.kind,
    sourceLabel,
    notionDatabaseRoots: source.kind === 'notion'
      ? notionDatabaseRoots(candidate.name, source.markdownPages)
      : [],
    headers: table.headers,
    table,
    suggestedProfileName: suggestedProfileName(candidate.name, source.kind),
    initialMapping: detectMapping(table.headers),
  }
}

export function initialFilmImportConfiguration(session: FilmImportSession): FilmImportConfiguration | null {
  if (session.kind === 'sylloge') return null

  return {
    profileName: session.suggestedProfileName,
    mapping: { ...session.initialMapping },
    markdownNotes: session.sourceKind === 'notion' && session.initialMapping.personalNote === null,
    ratingScale: initialRatingScale(session.table, session.initialMapping),
  }
}

export function filmImportDestinationForSource(
  configuration: FilmImportConfiguration,
  source: FilmImportSource,
): ImportableFilmField | null {
  if (source === NOTION_MARKDOWN_NOTES_SOURCE) {
    return configuration.markdownNotes ? 'personalNote' : null
  }

  if (filmImportSourceRestriction(source) !== null) return null
  const destination = IMPORTABLE_FILM_FIELDS.find((field) => configuration.mapping[field] === source) ?? null
  return isFilmImportRatingSource(source) && destination !== 'rating' ? null : destination
}

export function filmImportSourceRestriction(source: string): 'metadata' | 'future-feature' | null {
  const normalized = normalize(source)
  if (METADATA_SOURCE_ALIASES.includes(normalized)) return 'metadata'
  if (FUTURE_FEATURE_SOURCE_ALIASES.includes(normalized)) return 'future-feature'
  return null
}

export function isFilmImportRatingSource(source: string): boolean {
  return FIELD_ALIASES.rating.includes(normalize(source))
}

/**
 * L’interface présente le mapping dans le sens source vers destination, alors
 * que le modèle d’import conserve son contrat destination vers source. Cette
 * conversion garde les deux côtés uniques : déplacer une source libère son
 * ancienne destination et remplace proprement l’ancienne source de la
 * destination choisie.
 */
export function setFilmImportSourceDestination(
  configuration: FilmImportConfiguration,
  source: FilmImportSource,
  destination: ImportableFilmField | null,
): FilmImportConfiguration {
  const mapping = { ...configuration.mapping }
  let markdownNotes = configuration.markdownNotes

  if (source === NOTION_MARKDOWN_NOTES_SOURCE) {
    markdownNotes = false
  } else {
    for (const field of IMPORTABLE_FILM_FIELDS) {
      if (mapping[field] === source) mapping[field] = null
    }
  }

  if (source !== NOTION_MARKDOWN_NOTES_SOURCE && filmImportSourceRestriction(source) !== null) {
    return { ...configuration, mapping, markdownNotes }
  }
  if (destination === null) return { ...configuration, mapping, markdownNotes }

  if (source !== NOTION_MARKDOWN_NOTES_SOURCE && isFilmImportRatingSource(source) && destination !== 'rating') {
    return { ...configuration, mapping, markdownNotes }
  }

  if (source === NOTION_MARKDOWN_NOTES_SOURCE) {
    if (destination === 'personalNote') {
      mapping.personalNote = null
      markdownNotes = true
    }
    return { ...configuration, mapping, markdownNotes }
  }

  mapping[destination] = source
  if (destination === 'personalNote') markdownNotes = false
  return { ...configuration, mapping, markdownNotes }
}

export function previewFilmCsvImport(
  session: FilmImportSession,
  source: PickedFilmsImportFile,
  configuration: FilmImportConfiguration | null,
  importedAt = new Date().toISOString(),
): FilmsCsvImportPreview {
  if (session.kind === 'sylloge') return previewSyllogeCsv(session)
  if (configuration === null) {
    return invalidCsvPreview(session.sourceKind, session.sourceLabel, session.table.rows.length, '$', 'Le mapping CSV est introuvable.')
  }
  return previewGenericCsv(session, source.markdownPages, configuration, importedAt)
}

export function parseCsv(contents: string): CsvTable {
  const errors: ImportValidationError[] = []
  const rows: CsvRow[] = []
  const cells: string[] = []
  let cell = ''
  let quoted = false
  let quoteClosed = false
  let line = 1
  let rowLine = 1

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index]
    const next = contents[index + 1]

    if (quoted) {
      if (character === '"' && next === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
        quoteClosed = true
      } else {
        cell += character
        if (character === '\n') line += 1
      }
      continue
    }

    if (quoteClosed) {
      if (character === ',') {
        cells.push(cell)
        cell = ''
        quoteClosed = false
      } else if (character === '\r' || character === '\n') {
        if (character === '\r' && next === '\n') index += 1
        cells.push(cell)
        rows.push({ cells: [...cells], line: rowLine })
        cells.length = 0
        cell = ''
        quoteClosed = false
        line += 1
        rowLine = line
      } else {
        errors.push({
          path: `Ligne ${line}`,
          message: 'Une cellule CSV citée doit être suivie d’une virgule ou de la fin de ligne.',
        })
        cell += character
        quoteClosed = false
      }
    } else if (character === '"') {
      if (cell.length > 0) {
        errors.push({ path: `Ligne ${line}`, message: 'Un guillemet doit commencer au début d’une cellule CSV.' })
      }
      quoted = true
    } else if (character === ',') {
      cells.push(cell)
      cell = ''
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && next === '\n') index += 1
      cells.push(cell)
      rows.push({ cells: [...cells], line: rowLine })
      cells.length = 0
      cell = ''
      line += 1
      rowLine = line
    } else {
      cell += character
    }
  }

  if (quoted) errors.push({ path: `Ligne ${rowLine}`, message: 'Une cellule CSV citée n’est pas fermée.' })
  if (cell.length > 0 || cells.length > 0 || quoteClosed) {
    cells.push(cell)
    rows.push({ cells: [...cells], line: rowLine })
  }

  const headerRow = rows.shift()
  if (!headerRow) return { headers: [], rows: [], errors: [{ path: '$', message: 'Le CSV ne contient aucune ligne d’en-tête.' }] }
  const headers = headerRow.cells.map((header, index) => {
    const withoutBom = index === 0 ? header.replace(/^\uFEFF/u, '') : header
    return withoutBom.trim()
  })
  if (headers.some((header) => header.length === 0)) {
    errors.push({ path: `Ligne ${headerRow.line}`, message: 'Chaque colonne CSV doit avoir un en-tête non vide.' })
  }
  const headerNames = new Set<string>()
  for (const header of headers) {
    const key = normalize(header)
    if (headerNames.has(key)) errors.push({ path: `Ligne ${headerRow.line}`, message: `L’en-tête « ${header} » est présent plusieurs fois.` })
    headerNames.add(key)
  }
  for (const row of rows) {
    if (row.cells.length !== headers.length) {
      errors.push({
        path: `Ligne ${row.line}`,
        message: `Cette ligne contient ${row.cells.length} cellules alors que l’en-tête en définit ${headers.length}.`,
      })
    }
  }

  return { headers, rows, errors }
}

function previewSyllogeCsv(session: SyllogeFilmImportSession): FilmsCsvImportPreview {
  const errors = [...session.table.errors]
  const rows = session.table.rows
  const headerIndex = new Map(session.table.headers.map((header, index) => [header, index]))

  if (rows.length === 0) errors.push({ path: '$', message: 'Le CSV Sylloge ne contient aucune ligne de profil.' })
  const firstRow = rows[0]
  const first = firstRow ? syllogeRow(firstRow, headerIndex) : null
  if (!first) {
    return invalidCsvPreview('sylloge-csv-v1', session.sourceLabel, rows.length, '$', 'Le CSV Sylloge est incomplet.', errors)
  }

  const profile = {
    id: first.profileId,
    name: first.profileName,
    createdAt: first.profileCreatedAt,
    updatedAt: first.profileUpdatedAt,
  }
  const films: Film[] = []
  for (const row of rows) {
    const value = syllogeRow(row, headerIndex)
    if (!value) continue
    if (
      value.profileId !== profile.id
      || value.profileName !== profile.name
      || value.profileCreatedAt !== profile.createdAt
      || value.profileUpdatedAt !== profile.updatedAt
    ) {
      errors.push({ path: `Ligne ${row.line}`, message: 'Les métadonnées de profil doivent être identiques sur chaque ligne Sylloge.' })
    }
    if (value.format !== SYLLOGE_FILMS_CSV_FORMAT) {
      errors.push({ path: `Ligne ${row.line}.format`, message: `Le format attendu est « ${SYLLOGE_FILMS_CSV_FORMAT} ».` })
    }
    if (value.version !== String(SYLLOGE_FILMS_CSV_VERSION)) {
      errors.push({ path: `Ligne ${row.line}.version`, message: `La version CSV attendue est ${SYLLOGE_FILMS_CSV_VERSION}.` })
    }
    if (isEmptySyllogeFilm(value)) continue
    const year = parseSyllogeInteger(value.year, `Ligne ${row.line}.film_year`, errors)
    const rating = parseSyllogeDecimal(value.rating, `Ligne ${row.line}.film_rating`, errors)
    if (value.isFavorite !== 'true' && value.isFavorite !== 'false') {
      errors.push({ path: `Ligne ${row.line}.film_is_favorite`, message: 'Le favori Sylloge doit valoir true ou false.' })
    }
    films.push(normalizeFilm({
      id: value.filmId,
      profileId: value.filmProfileId,
      title: value.title,
      originalTitle: emptyToNull(value.originalTitle),
      year,
      status: value.status as FilmStatus,
      isFavorite: value.isFavorite === 'true',
      rating,
      watchedAt: emptyToNull(value.watchedAt),
      personalNote: emptyToNull(value.personalNote),
      director: emptyToNull(value.director),
      summary: emptyToNull(value.summary),
      providerName: emptyToNull(value.providerName),
      providerId: emptyToNull(value.providerId),
      posterUrl: emptyToNull(value.posterUrl),
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    }))
  }

  const document: SyllogeExportDocument = {
    format: SYLLOGE_EXPORT_FORMAT,
    version: SYLLOGE_EXPORT_VERSION,
    exportedAt: first.exportedAt,
    profile,
    films,
  }
  const validated = validateLibraryImport(JSON.stringify(document))
  return {
    ...validated,
    document: errors.length > 0 ? null : validated.document,
    errors: [...errors, ...validated.errors],
    sourceKind: 'sylloge-csv-v1',
    sourceLabel: session.sourceLabel,
    mapping: [{ field: 'Format', column: 'Contrat Sylloge CSV Films v1 exact' }],
    ignoredColumns: [],
    warnings: [],
    detectedRatingScale: 5,
  }
}

function previewGenericCsv(
  session: GenericFilmImportSession,
  markdownPages: MarkdownPage[],
  configuration: FilmImportConfiguration,
  importedAt: string,
): FilmsCsvImportPreview {
  const errors = [...session.table.errors]
  const warnings: FilmImportWarning[] = []
  const mapping = activeMapping(configuration.mapping)
  const indexByHeader = new Map(session.headers.map((header, index) => [header, index]))
  const titleColumn = configuration.mapping.title
  const ratingColumn = configuration.mapping.rating
  const ratingCells = ratingColumn
    ? session.table.rows.map((row) => row.cells[indexByHeader.get(ratingColumn) ?? -1] ?? '')
    : []
  const detectedRatingScale = detectRatingScale(ratingCells)

  if (!titleColumn) errors.push({ path: 'Mapping', message: 'Le titre doit être mappé avant de pouvoir préparer l’import.' })
  if (!configuration.profileName.trim()) errors.push({ path: 'Profil', message: 'Le profil courant doit avoir un nom explicite.' })
  errors.push(...mappingValidationErrors(session, configuration))
  if (detectedRatingScale === 'mixed') {
    errors.push({ path: 'Notes', message: 'Les notes indiquent à la fois /5 et /10. Corrigez les valeurs avant l’import.' })
  }
  if (detectedRatingScale === 'ambiguous' && configuration.ratingScale === null && ratingCells.some((cell) => cell.trim())) {
    errors.push({ path: 'Notes', message: 'L’échelle des notes est ambiguë. Choisissez explicitement /5 ou /10.' })
  }

  const rowsByNormalizedTitle = new Map<string, CsvRow[]>()
  if (titleColumn) {
    const index = indexByHeader.get(titleColumn)
    if (index !== undefined) {
      for (const row of session.table.rows) {
        const title = (row.cells[index] ?? '').trim()
        if (!title) continue
        const key = normalize(title)
        rowsByNormalizedTitle.set(key, [...(rowsByNormalizedTitle.get(key) ?? []), row])
      }
    }
  }
  const markdownNotes = configuration.markdownNotes
    ? collectNotionMarkdownNotes(
      markdownPages,
      session.notionDatabaseRoots,
      rowsByNormalizedTitle,
      warnings,
    )
    : new Map<CsvRow, string>()
  const films: Film[] = []
  let validFilmCount = 0

  for (const row of session.table.rows) {
    const beforeErrors = errors.length
    const value = mappedValues(row, configuration.mapping, indexByHeader)
    const title = requiredText(value.title, `Ligne ${row.line}.titre`, errors)
    const status = parseStatus(value.status, `Ligne ${row.line}.statut`, errors)
    const rating = parseRating(
      value.rating,
      configuration.ratingScale ?? (detectedRatingScale === 5 || detectedRatingScale === 10 ? detectedRatingScale : null),
      `Ligne ${row.line}.note`,
      errors,
    )
    const watchedAt = parseWatchedAt(value.watchedAt, `Ligne ${row.line}.date`, errors)
    const personalNote = configuration.markdownNotes
      ? markdownNotes.get(row) ?? null
      : optionalText(value.personalNote)
    const isFavorite = parseFavorite(value.isFavorite, `Ligne ${row.line}.coup de cœur`, errors)

    if (errors.length === beforeErrors && title !== null) {
      films.push(normalizeFilm({
        id: `import-preview-${row.line}`,
        profileId: 'import-preview-profile',
        title,
        originalTitle: null,
        status,
        year: null,
        isFavorite,
        rating,
        watchedAt,
        personalNote,
        director: null,
        summary: null,
        providerName: null,
        providerId: null,
        posterUrl: null,
        createdAt: importedAt,
        updatedAt: importedAt,
      }))
      validFilmCount += 1
    }
  }

  const document: SyllogeExportDocument = {
    format: SYLLOGE_EXPORT_FORMAT,
    version: SYLLOGE_EXPORT_VERSION,
    exportedAt: importedAt,
    profile: {
      id: 'import-preview-profile',
      name: configuration.profileName.trim(),
      createdAt: importedAt,
      updatedAt: importedAt,
    },
    films,
  }
  const validated = validateLibraryImport(JSON.stringify(document))
  const allErrors = [...errors, ...validated.errors]
  return {
    document: allErrors.length === 0 ? validated.document : null,
    validFilmCount: allErrors.length === 0 ? validated.validFilmCount : validFilmCount,
    totalFilmCount: session.table.rows.length,
    errors: allErrors,
    sourceKind: session.sourceKind,
    sourceLabel: session.sourceLabel,
    mapping: [
      ...mapping.map(({ field, column }) => ({ field: FILM_IMPORT_FIELD_LABELS[field], column })),
      ...(configuration.markdownNotes ? [{ field: FILM_IMPORT_FIELD_LABELS.personalNote, column: 'Pages Notion « Notes »' }] : []),
    ],
    ignoredColumns: ignoredColumns(session.headers, mapping),
    warnings,
    detectedRatingScale,
  }
}

function syllogeRow(row: CsvRow, indexByHeader: Map<string, number>) {
  const get = (header: string) => unprotectSyllogeText(
    row.cells[indexByHeader.get(header) ?? -1] ?? '',
    header,
  )
  return {
    format: get('format'),
    version: row.cells[indexByHeader.get('version') ?? -1] ?? '',
    exportedAt: get('exported_at'),
    profileId: get('profile_id'),
    profileName: get('profile_name'),
    profileCreatedAt: get('profile_created_at'),
    profileUpdatedAt: get('profile_updated_at'),
    filmId: get('film_id'),
    filmProfileId: get('film_profile_id'),
    title: get('film_title'),
    originalTitle: get('film_original_title'),
    year: row.cells[indexByHeader.get('film_year') ?? -1] ?? '',
    status: get('film_status'),
    isFavorite: row.cells[indexByHeader.get('film_is_favorite') ?? -1] ?? '',
    rating: row.cells[indexByHeader.get('film_rating') ?? -1] ?? '',
    watchedAt: get('film_watched_at'),
    personalNote: get('film_personal_note'),
    director: get('film_director'),
    summary: get('film_summary'),
    providerName: get('film_provider_name'),
    providerId: get('film_provider_id'),
    posterUrl: get('film_poster_url'),
    createdAt: get('film_created_at'),
    updatedAt: get('film_updated_at'),
  }
}

function isEmptySyllogeFilm(value: ReturnType<typeof syllogeRow>): boolean {
  return [
    value.filmId, value.filmProfileId, value.title, value.originalTitle, value.year, value.status,
    value.isFavorite, value.rating, value.watchedAt, value.personalNote, value.director, value.summary,
    value.providerName, value.providerId, value.posterUrl, value.createdAt, value.updatedAt,
  ].every((cell) => cell === '')
}

function unprotectSyllogeText(value: string, header: string): string {
  return SYLLOGE_TEXT_HEADERS.has(header) && value.startsWith("'") ? value.slice(1) : value
}

function detectMapping(headers: string[]): FilmImportMapping {
  const mapping = {} as FilmImportMapping
  const assignedColumns = new Set<string>()
  for (const field of IMPORTABLE_FILM_FIELDS) {
    const column = headers.find((header) => (
      !assignedColumns.has(header) && FIELD_ALIASES[field].includes(normalize(header))
    )) ?? null
    mapping[field] = column
    if (column !== null) assignedColumns.add(column)
  }
  return mapping
}

function recognizedFieldsForCandidate(contents: string): ImportableFilmField[] {
  const table = parseCsv(contents)
  if (table.errors.length > 0) return []
  if (isSyllogeCsvHeader(table.headers)) return [...IMPORTABLE_FILM_FIELDS]
  const mapping = detectMapping(table.headers)
  return IMPORTABLE_FILM_FIELDS.filter((field) => mapping[field] !== null)
}

function activeMapping(mapping: FilmImportMapping): Array<{ field: ImportableFilmField; column: string }> {
  return IMPORTABLE_FILM_FIELDS.flatMap((field) => mapping[field] ? [{ field, column: mapping[field] }] : [])
}

function mappingValidationErrors(
  session: GenericFilmImportSession,
  configuration: FilmImportConfiguration,
): ImportValidationError[] {
  const errors: ImportValidationError[] = []
  const sources = new Map<string, ImportableFilmField>()
  const manipulatedMapping = configuration.mapping as Record<string, unknown>

  for (const field of Object.keys(manipulatedMapping)) {
    if (!IMPORTABLE_FILM_FIELDS.includes(field as ImportableFilmField)) {
      errors.push({
        path: `Mapping.${field}`,
        message: 'Cette destination est une métadonnée Films et ne peut pas être importée depuis un CSV ou Notion générique.',
      })
    }
  }

  for (const field of IMPORTABLE_FILM_FIELDS) {
    const column = manipulatedMapping[field]
    if (column === null) continue
    if (typeof column !== 'string') {
      errors.push({ path: `Mapping.${field}`, message: 'La destination doit recevoir une colonne CSV ou rester vide.' })
      continue
    }
    if (!session.headers.includes(column)) {
      errors.push({ path: `Mapping.${field}`, message: `La colonne « ${column} » n’existe pas dans la table retenue.` })
      continue
    }
    const restriction = filmImportSourceRestriction(column)
    if (restriction !== null) {
      errors.push({
        path: `Mapping.${field}`,
        message: restriction === 'metadata'
          ? `La colonne « ${column} » est une métadonnée récupérée plus tard et ne peut pas être importée.`
          : `La colonne « ${column} » correspond à une fonctionnalité future et ne peut pas être importée.`,
      })
      continue
    }
    if (isFilmImportRatingSource(column) && field !== 'rating') {
      errors.push({
        path: `Mapping.${field}`,
        message: `La colonne « ${column} » est une évaluation chiffrée et peut seulement être envoyée vers « Évaluation » ou rester sur « Ne pas importer ».`,
      })
      continue
    }
    const previousField = sources.get(column)
    if (previousField) {
      errors.push({
        path: `Mapping.${field}`,
        message: `La colonne « ${column} » est déjà envoyée vers « ${FILM_IMPORT_FIELD_LABELS[previousField]} ». Une source ne peut avoir qu’une destination.`,
      })
      continue
    }
    sources.set(column, field)
  }

  if (configuration.markdownNotes && session.sourceKind !== 'notion') {
    errors.push({ path: 'Mapping.notesMarkdown', message: 'Les pages Markdown « Notes » sont disponibles uniquement pour un export Notion.' })
  }
  if (configuration.markdownNotes && configuration.mapping.personalNote !== null) {
    errors.push({
      path: 'Mapping.personalNote',
      message: '« Note personnelle » reçoit déjà une colonne CSV. Choisissez soit cette colonne, soit les pages Notion « Notes ».',
    })
  }

  return errors
}

function ignoredColumns(headers: string[], mapping: Array<{ field: ImportableFilmField; column: string }>): string[] {
  const active = new Set(mapping.map(({ column }) => column))
  const ignored = headers.filter((header) => !active.has(header))
  return [...ignored].sort((left, right) => {
    const leftKnown = filmImportSourceRestriction(left) !== null
    const rightKnown = filmImportSourceRestriction(right) !== null
    return Number(rightKnown) - Number(leftKnown)
  })
}

function mappedValues(
  row: CsvRow,
  mapping: FilmImportMapping,
  indexByHeader: Map<string, number>,
): Record<ImportableFilmField, string | null> {
  const values = {} as Record<ImportableFilmField, string | null>
  for (const field of IMPORTABLE_FILM_FIELDS) {
    const column = mapping[field]
    values[field] = column === null ? null : (row.cells[indexByHeader.get(column) ?? -1] ?? '')
  }
  return values
}

function collectNotionMarkdownNotes(
  pages: MarkdownPage[],
  selectedDatabaseRoots: string[],
  rowsByNormalizedTitle: Map<string, CsvRow[]>,
  warnings: FilmImportWarning[],
): Map<CsvRow, string> {
  if (selectedDatabaseRoots.length === 0) return new Map()
  const roots = new Set(selectedDatabaseRoots)

  const candidatePages = new Map<CsvRow, Array<{ name: string; note: string }>>()
  for (const page of pages) {
    if (![...roots].some((root) => isInNotionDatabaseRoot(page.name, root))) continue

    const note = markdownNote(page.contents)
    if (note === null) continue
    const title = markdownTitle(page.contents)
    if (title === null) {
      warnings.push({ path: page.name, message: 'La section « Notes : » est ignorée car la page Markdown n’a pas de titre principal.' })
      continue
    }
    const matches = rowsByNormalizedTitle.get(normalize(title)) ?? []
    if (matches.length !== 1) {
      warnings.push({
        path: page.name,
        message: matches.length === 0
          ? 'La section « Notes : » ne correspond à aucun Film CSV et n’a pas été importée.'
          : 'La section « Notes : » correspond à plusieurs Films CSV et n’a pas été importée.',
      })
      continue
    }
    const row = matches[0]
    candidatePages.set(row, [...(candidatePages.get(row) ?? []), { name: page.name, note }])
  }

  const notes = new Map<CsvRow, string>()
  for (const [row, candidates] of candidatePages) {
    if (candidates.length !== 1) {
      warnings.push({
        path: `Ligne ${row.line}`,
        message: 'Plusieurs pages Markdown correspondent à ce Film. Aucune note Markdown n’a été ajoutée.',
      })
      continue
    }
    notes.set(row, candidates[0].note)
  }
  return notes
}

function markdownTitle(contents: string): string | null {
  const match = /^#\s+(.+?)\s*$/mu.exec(contents)
  return match?.[1].trim() || null
}

function markdownNote(contents: string): string | null {
  const match = /^###\s+Notes\s*:\s*$\n?([\s\S]*?)(?=^#{1,3}\s|(?![\s\S]))/imu.exec(contents)
  const note = match?.[1].trim()
  if (!note || containsOnlyMarkdownStructure(note)) return null
  return note
}

function containsOnlyMarkdownStructure(value: string): boolean {
  return value.split(/\r?\n/u).every((line) => (
    line.trim() === ''
    || /^[ \t]{0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/u.test(line)
    || /^[ \t]{0,3}[-*+][ \t]*$/u.test(line)
  ))
}

function requiredText(value: string | null, path: string, errors: ImportValidationError[]): string | null {
  if (value === null || value.trim().length === 0) {
    errors.push({ path, message: 'Le titre est obligatoire.' })
    return null
  }
  return value
}

function optionalText(value: string | null): string | null {
  return value === '' ? null : value
}

function normalizedInputText(value: string | null): string | null {
  if (value === null) return null
  const text = value.trim()
  return text ? text : null
}

function parseStatus(value: string | null, path: string, errors: ImportValidationError[]): FilmStatus {
  const text = normalizedInputText(value)
  if (text === null) return 'à découvrir'
  const status = STATUS_ALIASES.get(normalize(text))
  if (status) return status
  errors.push({ path, message: `Le statut « ${text} » n’est pas reconnu.` })
  return 'à découvrir'
}

function parseFavorite(value: string | null, path: string, errors: ImportValidationError[]): boolean {
  const text = normalizedInputText(value)
  if (text === null) return false
  const normalized = normalize(text)
  if (['true', 'yes', 'oui', '1'].includes(normalized)) return true
  if (['false', 'no', 'non', '0'].includes(normalized)) return false
  errors.push({ path, message: `La valeur favori « ${text} » doit valoir Yes, No, true, false, oui ou non.` })
  return false
}

const STATUS_ALIASES = new Map<string, FilmStatus>([
  ['a decouvrir', 'à découvrir'],
  ['to watch', 'à découvrir'],
  ['watchlist', 'à découvrir'],
  ['a voir', 'à découvrir'],
  ['en attente', 'en attente'],
  ['pending', 'en attente'],
  ['termine', 'terminé'],
  ['watched', 'terminé'],
  ['seen', 'terminé'],
  ['viewed', 'terminé'],
  ['abandonne', 'abandonné'],
  ['abandoned', 'abandonné'],
])

function parseRating(
  value: string | null,
  scale: RatingScale | null,
  path: string,
  errors: ImportValidationError[],
): number | null {
  const text = normalizedInputText(value)
  if (text === null) return null
  const parsed = parseRatingValue(text)
  if (!parsed) {
    errors.push({ path, message: 'La note doit être numérique, éventuellement suivie de /5, /10, « sur 5 », « sur 10 » ou d’un libellé descriptif.' })
    return null
  }
  const effectiveScale = parsed.scale ?? scale
  if (effectiveScale === null) return null
  if (parsed.scale !== null && scale !== null && parsed.scale !== scale) {
    errors.push({ path, message: `Cette note indique /${parsed.scale}, contrairement à l’échelle choisie /${scale}.` })
    return null
  }
  const converted = effectiveScale === 10 ? parsed.value / 2 : parsed.value
  if (converted < 0.5 || converted > 5 || !Number.isInteger(converted * 2)) {
    errors.push({ path, message: `La note convertie depuis /${effectiveScale} doit aller de 0,5 à 5 par demi-points.` })
    return null
  }
  return converted
}

function parseRatingValue(value: string): { value: number; scale: RatingScale | null } | null {
  const match = /^(\d+(?:[.,]\d+)?)(?:\s*(?:\/|sur|out of)\s*(5|10))?(?:\s*(?:etoiles?|stars?|points?))?(?:\s*(?:\(\s*[\p{L}][\p{L}\p{N}\s'’.-]*\)|[\p{L}][\p{L}\p{N}\s'’.-]*))?$/iu.exec(value)
  if (!match) return null
  const number = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(number)) return null
  const scale = match[2] === undefined ? null : Number(match[2]) as RatingScale
  return { value: number, scale }
}

function detectRatingScale(cells: string[]): DetectedRatingScale {
  const values = cells
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
    .map((cell) => parseRatingValue(cell))

  if (values.length === 0) return 'none'
  if (values.some((value) => value === null)) return 'ambiguous'

  const parsedValues = values.filter((value): value is NonNullable<typeof value> => value !== null)
  const explicitScales = new Set(parsedValues.flatMap((value) => value.scale === null ? [] : [value.scale]))
  if (explicitScales.size > 1) return 'mixed'

  const hasValueAboveFive = parsedValues.some((value) => value.value > 5)
  const explicitScale = [...explicitScales][0] ?? null
  if (explicitScale === 10) return 10
  if (explicitScale === 5) return hasValueAboveFive ? 'ambiguous' : 5

  return hasValueAboveFive ? 10 : 'ambiguous'
}

function initialRatingScale(table: CsvTable, mapping: FilmImportMapping): RatingScale | null {
  const column = mapping.rating
  if (!column) return null
  const index = table.headers.indexOf(column)
  const detected = detectRatingScale(table.rows.map((row) => row.cells[index] ?? ''))
  return detected === 5 || detected === 10 ? detected : null
}

function parseWatchedAt(value: string | null, path: string, errors: ImportValidationError[]): string | null {
  const text = normalizedInputText(value)
  if (text === null) return null
  const numeric = parseNumericDate(text)
  if (numeric) return numeric
  const french = parseFrenchDate(text)
  if (french) return french
  errors.push({
    path,
    message: 'La date doit être ISO AAAA-MM-JJ, numérique non ambiguë ou une date française écrite.',
  })
  return null
}

function parseNumericDate(value: string): string | null {
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/u.exec(value)
  if (match) return calendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/u.exec(value)
  if (!match) return null
  const first = Number(match[1])
  const second = Number(match[2])
  const year = Number(match[3])
  if (first > 12 && second <= 12) return calendarDate(year, second, first)
  if (second > 12 && first <= 12) return calendarDate(year, first, second)
  return null
}

const FRENCH_MONTHS = new Map<string, number>([
  ['janvier', 1], ['janv', 1], ['fevrier', 2], ['fevr', 2], ['mars', 3], ['avril', 4],
  ['mai', 5], ['juin', 6], ['juillet', 7], ['aout', 8], ['septembre', 9], ['sept', 9],
  ['octobre', 10], ['oct', 10], ['novembre', 11], ['nov', 11], ['decembre', 12], ['dec', 12],
])

function parseFrenchDate(value: string): string | null {
  const match = /^(\d{1,2})(?:er)?\s+([\p{L}.]+)\s+(\d{4})$/iu.exec(value)
  if (!match) return null
  const month = FRENCH_MONTHS.get(normalize(match[2].replace(/\./gu, '')))
  return month ? calendarDate(Number(match[3]), month, Number(match[1])) : null
}

function calendarDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseSyllogeInteger(value: string, path: string, errors: ImportValidationError[]): number | null {
  if (value === '') return null
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    errors.push({ path, message: 'La valeur entière du CSV Sylloge est invalide.' })
    return null
  }
  return Number(value)
}

function parseSyllogeDecimal(value: string, path: string, errors: ImportValidationError[]): number | null {
  if (value === '') return null
  if (!/^(?:\d+|\d+\.\d+)$/u.test(value) || !Number.isFinite(Number(value))) {
    errors.push({ path, message: 'La valeur décimale du CSV Sylloge est invalide.' })
    return null
  }
  return Number(value)
}

function emptyToNull(value: string): string | null {
  return value === '' ? null : value
}

function isSyllogeCsvHeader(headers: string[]): boolean {
  return headers.length === SYLLOGE_FILMS_CSV_HEADER.length
    && headers.every((header, index) => header === SYLLOGE_FILMS_CSV_HEADER[index])
}

function suggestedProfileName(tableName: string, kind: 'csv' | 'notion'): string {
  const segments = tableName
    .replace(/\\/gu, '/')
    .split('/')
    .map((segment) => readableTableName(segment))
    .filter((segment) => segment.length > 0)
  const filmsTable = [...segments].reverse().find((segment) => /(^|\s)films?(\s|$)/iu.test(segment))
  const name = filmsTable ?? segments.at(-1) ?? 'Films'

  return kind === 'notion' ? name : `Import ${name}`
}

function readableTableName(value: string): string {
  return notionTableDirectoryName(value)
    .replace(/(?:\s+|[_-])(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/iu, '')
    .replace(/[_-]+/gu, ' ')
    .replace(/\bexport\b/giu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function notionTableDirectoryName(value: string): string {
  return value
    .replace(/\.csv$/iu, '')
    .replace(/(?:[_\s-]+)(?:all|full)$/iu, '')
    .trim()
}

function notionDatabaseRoots(path: string, pages: MarkdownPage[]): string[] {
  const csvRoot = notionDatabaseRoot(path)
  if (csvRoot === null) return []

  const tableDirectoryName = notionTableDirectoryName(notionPathName(path))
  if (!tableDirectoryName) return []

  const exactRoots = [`${csvRoot}/${tableDirectoryName}`]
  const parentDirectoryName = notionPathName(csvRoot)
  if (parentDirectoryName && normalize(parentDirectoryName) === normalize(tableDirectoryName)) {
    exactRoots.push(csvRoot)
  }
  const matchingExactRoots = exactRoots.filter((root) => (
    pages.some((page) => isInNotionDatabaseRoot(page.name, root))
  ))
  if (matchingExactRoots.length > 0) {
    return [...new Set(matchingExactRoots)]
  }

  const readableName = readableTableName(tableDirectoryName)
  const matchingFolders = notionDatabaseFolders(csvRoot, pages).filter((folder) => (
    readableTableName(folder) === readableName
  ))
  return matchingFolders.length === 1 ? [`${csvRoot}/${matchingFolders[0]}`] : []
}

function notionDatabaseRoot(path: string): string | null {
  const normalizedPath = normalizeNotionPath(path)
  const finalSeparator = normalizedPath.lastIndexOf('/')
  if (finalSeparator <= 0) return null
  return normalizedPath.slice(0, finalSeparator)
}

function notionPathName(path: string): string {
  const normalizedPath = normalizeNotionPath(path)
  const finalSeparator = normalizedPath.lastIndexOf('/')
  return finalSeparator === -1 ? normalizedPath : normalizedPath.slice(finalSeparator + 1)
}

function normalizeNotionPath(path: string): string {
  return path
    .replace(/\\/gu, '/')
    .replace(/\/{2,}/gu, '/')
    .replace(/^\/+|\/+$/gu, '')
}

function notionDatabaseFolders(csvRoot: string, pages: MarkdownPage[]): string[] {
  const prefix = `${normalizeNotionPath(csvRoot)}/`
  const folders = new Set<string>()
  for (const page of pages) {
    const path = normalizeNotionPath(page.name)
    if (!path.startsWith(prefix)) continue
    const firstSeparator = path.indexOf('/', prefix.length)
    if (firstSeparator === -1) continue
    folders.add(path.slice(prefix.length, firstSeparator))
  }
  return [...folders]
}

function isInNotionDatabaseRoot(path: string, root: string): boolean {
  return normalizeNotionPath(path).startsWith(`${normalizeNotionPath(root)}/`)
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
}

function invalidCsvPreview(
  sourceKind: FilmsCsvImportPreview['sourceKind'],
  sourceLabel: string,
  totalFilmCount: number,
  path: string,
  message: string,
  errors: ImportValidationError[] = [],
): FilmsCsvImportPreview {
  return {
    document: null,
    validFilmCount: 0,
    totalFilmCount,
    errors: [...errors, { path, message }],
    sourceKind,
    sourceLabel,
    mapping: [],
    ignoredColumns: [],
    warnings: [],
    detectedRatingScale: 'none',
  }
}
