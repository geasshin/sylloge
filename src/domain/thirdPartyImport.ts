import { normalizeCsvHeader, parseCsv, type CsvTable } from './csv.ts'
import type { Film } from './film.ts'
import type { Book, BookStatus } from './book.ts'
import { EMPTY_BOOK_FORM, validateBookForm } from './bookForm.ts'
import { previewFilmCsvImport, type FilmImportMapping } from './filmCsvImport.ts'
import type { ImportValidationError } from './libraryTransfer.ts'

export type ThirdPartyImportLibrary = 'films' | 'series' | 'anime' | 'books' | 'mangas' | 'games' | 'artworks'
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
  service: 'letterboxd' | 'goodreads'
  variant: 'ratings' | 'diary' | 'watched' | 'watchlist' | 'ambiguous' | 'library' | 'archive'
  library: 'films' | 'books'
  label: string
  mapping: Array<{ field: string; column: string }>
}

/** Content signatures identify a service; a filename alone is never evidence. */
export function recognizeThirdPartyImport(input: ThirdPartyImportInput): ThirdPartyImportRecognition | null {
  const direct = directTextSource(input)
  if (direct !== null) return recognizeThirdPartyTextImport(direct)
  const sources = pickedCsvSources(input)
  if (sources.some((source) => recognizeThirdPartyTextImport(source)?.service === 'letterboxd')) {
    return { service: 'letterboxd', variant: 'archive', library: 'films', label: 'Letterboxd · archive Films', mapping: [] }
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
      service: 'goodreads', variant: 'library', library: 'books', label: 'Goodreads · bibliothèque',
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
      service: 'letterboxd', variant, library: 'films',
      label: variant === 'diary' ? 'Letterboxd · journal'
        : variant === 'ratings' ? 'Letterboxd · notes'
          : variant === 'watched' ? 'Letterboxd · films vus'
            : variant === 'watchlist' ? 'Letterboxd · à voir' : 'Letterboxd · liste à préciser',
      mapping: mapped([['title', 'Name'], ['rating', 'Rating'], ['watchedAt', 'Watched Date'], ['personalNote', 'Review']]),
    }
  }
  return null
}

export type ThirdPartyImportWarning = ImportValidationError & { code: string }
export type ThirdPartyDuplicateTitle = { title: string; lines: number[] }
export type ThirdPartyImportPreview = ThirdPartyImportRecognition & {
  duplicateTitles: ThirdPartyDuplicateTitle[]
  items: Film[] | Book[] | null
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
  if (targetLibrary !== recognized.library) return {
    ...recognized, items: null, warnings: [], ignoredColumns: table.headers, duplicateTitles: [],
    totalItemCount: table.rows.length, validItemCount: 0,
    errors: [{ path: source.name, message: `Cet export ${recognized.service === 'letterboxd' ? 'Letterboxd contient des Films. Ouvrez la bibliothèque Films' : 'Goodreads contient des Livres. Ouvrez la bibliothèque Livres'} pour l’importer.` }],
  }
  if (recognized.service === 'goodreads') return previewGoodreadsImport(source, table, recognized, importedAt)
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
  _source: ThirdPartyImportSource,
  table: CsvTable,
  recognized: ThirdPartyImportRecognition,
  importedAt: string,
): ThirdPartyImportPreview {
  const errors = [...table.errors]
  const items: Book[] = []
  const warnings: ThirdPartyImportWarning[] = []
  const statuses = new Map<string, BookStatus>([['read', 'lu'], ['currently-reading', 'en cours'], ['to-read', 'à lire']])
  const indexByHeader = new Map(table.headers.map((header, index) => [sourceHeaderKey(header), index]))
  for (const row of table.rows) {
    const get = (column: string) => row.cells[indexByHeader.get(sourceHeaderKey(column)) ?? -1] ?? ''
    const status = statuses.get(get('Exclusive Shelf').trim())
    const rating = get('My Rating').trim()
    const before = errors.length
    if (!status) errors.push({ path: `Ligne ${row.line}.Exclusive Shelf`, message: 'Statut Goodreads inconnu : read, currently-reading ou to-read est attendu.' })
    const review = get('My Review')
    const privateNotes = get('Private Notes')
    const personalNote = review && privateNotes ? `${review}\n\n[Notes privées Goodreads]\n${privateNotes}` : review || privateNotes
    if (rating !== '' && !/^[0-5]$/u.test(rating)) errors.push({
      path: `Ligne ${row.line}.My Rating`, message: 'Une note personnelle Goodreads doit être un entier de 1 à 5 ; 0 signifie sans note.',
    })
    if (status === 'à lire' && ((rating !== '' && rating !== '0') || personalNote !== '')) errors.push({
      path: `Ligne ${row.line}.Exclusive Shelf`,
      message: 'Ce livre à lire contient déjà une note ou un avis. Ce statut effacerait ces champs dans Sylloge : conservez le fichier original et corrigez le statut dans une copie CSV avant l’import.',
    })
    if (review && privateNotes) warnings.push({
      code: 'combined-notes', path: `Ligne ${row.line}.My Review, Private Notes`,
      message: 'L’avis et les notes privées sont conservés ensemble dans la note personnelle, séparés par « [Notes privées Goodreads] ».',
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
