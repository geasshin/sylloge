import { parseCsv, normalizeCsvHeader, type CsvRow, type CsvTable } from './csv.ts'
import {
  isRecognizableFavorite,
  normalizeEnumValue,
  normalizeImportCount,
  normalizeImportDate,
  normalizeImportFavorite,
  normalizeImportRating,
  normalizeImportStatus,
} from './importNormalization.ts'
import { COLLECTION_CSV_CONTRACTS, type CsvCollectionMedium } from './collectionCsvTransfer.ts'
import { validateLibraryDocument } from './libraryDocument.ts'
import { validateSeriesForm, type SeriesFormValues } from './seriesForm.ts'
import { validateBookForm, type BookFormValues } from './bookForm.ts'
import { validateGameForm, type GameFormValues } from './gameForm.ts'
import { validateArtworkForm, type ArtworkFormValues } from './artworkForm.ts'
import { ARTWORK_FORMS, type Artwork } from './artwork.ts'
import { BOOK_CATEGORIES, type Book, type BookQuote } from './book.ts'
import type { Game } from './game.ts'
import type { ImportValidationError } from './libraryTransfer.ts'
import { SERIES_CATEGORIES, type Series } from './series.ts'

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

/** Préfixe des colonnes propres à chaque section du contrat CSV Sylloge v1. */
const SYLLOGE_CSV_PREFIXES: Record<CollectionCsvImportKind, string> = {
  series: 'series',
  anime: 'anime',
  books: 'book',
  mangas: 'manga',
  games: 'game',
  artworks: 'artwork',
}

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
  anime: [
    // Pas de champ `category` : la bibliothèque Animation japonaise est le type.
    field('title', 'Titre', ['titre', 'title', 'name']),
    field('showrunner', 'Showrunner', ['showrunner', 'createur', 'créateur', 'creator']),
    field('casting', 'Casting', ['casting', 'cast', 'acteurs', 'actors']),
    field('summary', 'Résumé', ['resume', 'résumé', 'summary', 'description', 'synopsis']),
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
  mangas: [
    // Pas de champ `category` : la bibliothèque Mangas est le type.
    field('title', 'Titre', ['titre', 'title', 'name']),
    field('author', 'Auteur', ['auteur', 'author', 'autrice']),
    field('year', 'Année', ['annee', 'année', 'year', 'publication year']),
    field('summary', 'Résumé', ['resume', 'résumé', 'summary', 'description', 'synopsis']),
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

/** Groupes du mapping inversé : champs éditoriaux puis personnels, par médium. */
const FIELD_GROUPS: Array<{ id: string; label: string; summary: string; keys: Record<CollectionCsvImportKind, readonly string[]> }> = [
  {
    id: 'editorial',
    label: 'Éditorial',
    summary: 'titre et description de l’œuvre — optionnel, récupérable plus tard via la recherche assistée',
    keys: {
      series: ['title', 'showrunner', 'casting', 'summary', 'category', 'posterUrl'],
      anime: ['title', 'showrunner', 'casting', 'summary', 'posterUrl'],
      books: ['title', 'author', 'year', 'summary', 'category', 'coverUrl'],
      mangas: ['title', 'author', 'year', 'summary', 'coverUrl'],
      games: ['title', 'developer', 'platform', 'year', 'coverUrl'],
      artworks: ['title', 'artist', 'year', 'form', 'location', 'exhibition', 'imageUrl'],
    },
  },
  {
    id: 'personal',
    label: 'Personnel',
    summary: 'statut, note, coup de cœur, progression, dates et avis — l’essentiel de ton import',
    keys: {
      series: ['status', 'rating', 'isFavorite', 'seasonsSeen', 'seasonsTotal', 'startedAt', 'personalNote'],
      anime: ['status', 'rating', 'isFavorite', 'seasonsSeen', 'seasonsTotal', 'startedAt', 'personalNote'],
      books: ['status', 'rating', 'isFavorite', 'volumesRead', 'volumesTotal', 'startedAt', 'personalNote', 'quotes'],
      mangas: ['status', 'rating', 'isFavorite', 'volumesRead', 'volumesTotal', 'startedAt', 'personalNote', 'quotes'],
      games: ['status', 'rating', 'isFavorite', 'playedAt', 'personalNote'],
      artworks: ['status', 'isFavorite', 'discoveredAt', 'personalNote'],
    },
  },
]

export function collectionCsvFieldGroups(kind: CollectionCsvImportKind): Array<{ id: string; label: string; summary: string; fields: readonly CollectionCsvField[] }> {
  const all = FIELDS[kind]
  return FIELD_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    summary: group.summary,
    fields: group.keys[kind].map((key) => all.find((fieldDefinition) => fieldDefinition.key === key)).filter((fieldDefinition): fieldDefinition is CollectionCsvField => fieldDefinition !== undefined),
  }))
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
  fieldKey: string,
  column: string | null,
): CollectionCsvMapping {
  // Mapping inversé (0.6.2) : mapping[champSylloge] = nomDeColonne.
  // Affecte `column` au champ `fieldKey`, en retirant cette colonne de tout
  // autre champ qui la détenait (une colonne ne peut alimenter qu'un champ).
  const mapping: CollectionCsvMapping = { ...configuration }
  for (const [otherField, otherColumn] of Object.entries(mapping)) {
    if (otherColumn === column && otherField !== fieldKey) mapping[otherField] = null
  }
  mapping[fieldKey] = column
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
    // Les avertissements de normalisation (chemin `.info`) n'empêchent plus la
    // fiche d'entrer : seules les vraies erreurs restent bloquantes (0.6.3).
    const blocking = errors.slice(before).some((entry) => !entry.path.endsWith('.info'))
    if (item !== null && !blocking) items.push(item)
  }

  return {
    items: items.length > 0 ? items : null,
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
  const firstRow = session.table.rows[0]
  const metadata = firstRow ? sourceValues(session.kind, firstRow, indexByHeader) : null

  if (session.table.rows.length === 0) errors.push({ path: '$', message: 'Le CSV Sylloge ne contient aucune ligne de profil.' })
  for (const row of session.table.rows) {
    const source = sourceValues(session.kind, row, indexByHeader)
    if (metadata && COMMON_HEADERS.slice(2).some((header) => source[header] !== metadata[header])) {
      errors.push({ path: `Ligne ${row.line}`, message: 'Les métadonnées de profil et d’export doivent être identiques sur chaque ligne Sylloge.' })
    }
    if (source.format !== contract.format) {
      errors.push({ path: `Ligne ${row.line}.format`, message: `Le format attendu est « ${contract.format} ».` })
    }
    if (source.version !== '1') {
      errors.push({ path: `Ligne ${row.line}.version`, message: 'La version CSV attendue est 1.' })
    }
    if (isEmptySyllogeRow(session.kind, source)) {
      validateSyllogeRowDocument(session.kind, source, null, row.line, errors)
      continue
    }
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
  // Un export Sylloge n’est pas un formulaire : ne jamais rogner ses textes,
  // purger ses données personnelles ou normaliser silencieusement ses valeurs.
  const prefix = SYLLOGE_CSV_PREFIXES[kind]
  const item: Record<string, unknown> = {}
  const before = errors.length
  for (const header of COLLECTION_CSV_CONTRACTS[kind].entityHeaders) {
    const key = header.slice(prefix.length + 1).replace(/_([a-z])/gu, (_, character: string) => character.toUpperCase())
    const value = source[header]
    if (key === 'quotesJson') {
      try {
        const bodies: unknown = JSON.parse(value)
        if (!Array.isArray(bodies) || bodies.some((body) => typeof body !== 'string')) throw new Error('citations')
        item.quotes = bodies.map((body: string, position: number) => ({
          id: `import-preview-${line}-quote-${position}`, bookId: source[`${prefix}_id`], body, position,
          createdAt: source[`${prefix}_created_at`],
        }))
      } catch {
        errors.push({ path: `Ligne ${line}.${header}`, message: 'Un tableau JSON de textes de citations est attendu.' })
      }
    } else if (key === 'isFavorite') {
      if (value !== 'true' && value !== 'false') errors.push({ path: `Ligne ${line}.${header}`, message: 'Le favori Sylloge doit valoir true ou false.' })
      item[key] = value === 'true'
    } else if (/(?:_year|_rating|_seasons_seen|_seasons_total|_volumes_read|_volumes_total)$/u.test(header)) {
      if (value !== '' && (!/^-?\d+(?:\.\d+)?$/u.test(value) || !Number.isFinite(Number(value)))) {
        errors.push({ path: `Ligne ${line}.${header}`, message: 'Un nombre Sylloge valide est attendu.' })
      }
      item[key] = value === '' ? null : Number(value)
    } else {
      item[key] = value === '' ? null : value
    }
  }
  if (kind === 'anime') item.category = 'animation'
  if (kind === 'mangas') item.category = 'manga'
  // Aucun champ libre dans le contrat CSV v1, ni champ de forme : la ligne est
  // validée comme une œuvre v3, `normalizeArtwork` lui donne des détails vides.
  if (kind === 'artworks') item.customFields = []
  if (item.progressUpdatedAt !== undefined && item.progressUpdatedAt !== null && !isIsoUtc(String(item.progressUpdatedAt))) {
    errors.push({ path: `Ligne ${line}.${prefix}_progress_updated_at`, message: 'Un horodatage UTC ISO 8601 est attendu.' })
  }
  if (errors.length !== before) return null
  return validateSyllogeRowDocument(kind, source, item, line, errors)
}

function validateSyllogeRowDocument(
  kind: CollectionCsvImportKind,
  source: Record<string, string>,
  item: Record<string, unknown> | null,
  line: number,
  errors: ImportValidationError[],
): CollectionCsvItem | null {
  // Les anciens CSV Séries/Livres peuvent encore contenir leurs catégories
  // animation/manga : valider dans la section v3 correspondante sans les perdre.
  // Les comics ont leur propre bibliothèque depuis la migration 0021 : une
  // ligne Livres de catégorie « comics » est signalée, jamais ignorée en silence.
  if (kind === 'books' && item?.category === 'comics') {
    errors.push({ path: `Ligne ${line}.category`, message: 'Les comics ont désormais leur propre bibliothèque : restaurez-les depuis une sauvegarde JSON complète ou ajoutez-les dans Comics.' })
    return null
  }
  const section = kind === 'series' && item?.category === 'animation' ? 'anime'
    : kind === 'books' && item?.category === 'manga' ? 'mangas' : kind
  const preview = validateLibraryDocument(JSON.stringify({
    format: 'sylloge-library', version: 3, exportedAt: source.exported_at,
    profile: { id: source.profile_id, name: source.profile_name, createdAt: source.profile_created_at, updatedAt: source.profile_updated_at },
    films: [], series: [], anime: [], books: [], mangas: [], games: [], artworks: [],
    [section]: item === null ? [] : [item],
  }))
  errors.push(...preview.errors.map((error) => ({ ...error, path: `Ligne ${line}${error.path.replace(`$.${section}[0]`, '').replace(/^\$/u, '')}` })))
  return preview.document?.[section][0] ?? null
}

function parseGenericRow(
  kind: CollectionCsvImportKind,
  values: Record<string, string | null>,
  line: number,
  importedAt: string,
  errors: ImportValidationError[],
): CollectionCsvItem | null {
  const value = (key: string) => values[key] ?? ''
  // Normalisation tolérante (0.6.3) : les valeurs illisibles deviennent des
  // avertissements non bloquants, la fiche part avec le champ vide.
  const warnings: string[] = []
  const status = (medium: 'film' | 'série' | 'livre' | 'jeu' | 'art', fallback: string) => {
    const normalized = normalizeImportStatus(medium, value('status'))
    if (normalized.warning) warnings.push(`Statut ${normalized.warning}`)
    return normalized.value ?? fallback
  }
  const rating = () => {
    const normalized = normalizeImportRating(value('rating'))
    if (normalized.warning) warnings.push(normalized.warning)
    return normalized.value
  }
  const favorite = (): boolean => {
    const raw = value('isFavorite')
    if (!isRecognizableFavorite(raw)) warnings.push('Coup de cœur illisible — laissé vide.')
    return normalizeImportFavorite(raw)
  }
  const count = (key: string, label: string): string => {
    const normalized = normalizeImportCount(value(key), label)
    if (normalized.warning) warnings.push(normalized.warning)
    return normalized.value?.toString() ?? ''
  }
  const date = (key: string, label: string): string => {
    const normalized = normalizeImportDate(value(key), label)
    if (normalized.warning) warnings.push(normalized.warning)
    return normalized.value ?? ''
  }
  if (kind === 'series' || kind === 'anime') {
    const result = validateSeriesForm({
      title: value('title'), showrunner: value('showrunner'), casting: value('casting'), summary: value('summary'),
      category: (normalizeEnumValue(value('category'), SERIES_CATEGORIES).value
        ?? (kind === 'anime' ? 'animation' : 'série télé')) as SeriesFormValues['category'],
      status: status('série', 'à voir') as SeriesFormValues['status'],
      rating: rating()?.toString() ?? '',
      isFavorite: favorite(), seasonsSeen: count('seasonsSeen', 'Saisons vues :'), seasonsTotal: count('seasonsTotal', 'Saisons au total :'),
      startedAt: date('startedAt', 'Début de visionnage :'), posterUrl: value('posterUrl'), personalNote: value('personalNote'),
      // Le CSV Sylloge ne porte pas la période de diffusion (v8) : elle ne
      // voyage que par la sauvegarde JSON, comme la bannière 16:9.
      firstAirYear: '', lastAirYear: '',
    } satisfies SeriesFormValues)
    if (!result.success) return formFailure(line, result.errors, errors)
    for (const warning of warnings) errors.push({ path: `Ligne ${line}.info`, message: warning })
    return {
      id: `import-preview-${line}`, profileId: 'import-preview-profile', ...result.data,
      progressUpdatedAt: null, bannerUrl: null, createdAt: importedAt, updatedAt: importedAt,
    }
  }
  if (kind === 'books' || kind === 'mangas') {
    if (kind === 'books' && /^comics?$/iu.test(value('category').trim())) {
      warnings.push('Type « comics » : les comics ont leur propre bibliothèque ; cette fiche sera importée comme livre.')
    }
    const quotes = parseQuotes(value('quotes'), line, errors, importedAt)
    const result = validateBookForm({
      title: value('title'), author: value('author'), year: count('year', 'Année :'), summary: value('summary'),
      category: (normalizeEnumValue(value('category'), BOOK_CATEGORIES).value
        ?? (kind === 'mangas' ? 'manga' : 'livre')) as BookFormValues['category'],
      status: status('livre', 'à lire') as BookFormValues['status'],
      rating: rating()?.toString() ?? '',
      isFavorite: favorite(), volumesRead: count('volumesRead', 'Tomes lus :'), volumesTotal: count('volumesTotal', 'Tomes au total :'),
      startedAt: date('startedAt', 'Début de lecture :'), coverUrl: value('coverUrl'), personalNote: value('personalNote'), quotes: quotes.map((quote) => quote.body),
    } satisfies BookFormValues)
    if (!result.success) return formFailure(line, result.errors, errors)
    for (const warning of warnings) errors.push({ path: `Ligne ${line}.info`, message: warning })
    return {
      id: `import-preview-${line}`, profileId: 'import-preview-profile', ...result.data,
      progressUpdatedAt: null, createdAt: importedAt, updatedAt: importedAt,
      quotes: quotes.map((quote, position) => ({ ...quote, position })),
    }
  }
  if (kind === 'games') {
    const result = validateGameForm({
      title: value('title'), developer: value('developer'), platform: value('platform'), year: count('year', 'Année :'),
      status: status('jeu', 'à jouer') as GameFormValues['status'],
      rating: rating()?.toString() ?? '',
      isFavorite: favorite(),
      playedAt: date('playedAt', 'Date de jeu :'), coverUrl: value('coverUrl'), personalNote: value('personalNote'),
    } satisfies GameFormValues)
    if (!result.success) return formFailure(line, result.errors, errors)
    for (const warning of warnings) errors.push({ path: `Ligne ${line}.info`, message: warning })
    return {
      id: `import-preview-${line}`, profileId: 'import-preview-profile', ...result.data,
      bannerUrl: null, createdAt: importedAt, updatedAt: importedAt,
    }
  }
  const result = validateArtworkForm({
    title: value('title'), artist: value('artist'), year: count('year', 'Année :'),
    form: (normalizeEnumValue(value('form'), ARTWORK_FORMS).value ?? 'autre') as ArtworkFormValues['form'],
    location: value('location'), exhibition: value('exhibition'),
    isFavorite: favorite(),
    discoveredAt: date('discoveredAt', 'Date de découverte :'),
    imageUrl: value('imageUrl'), personalNote: value('personalNote'),
    // Les imports CSV historiques ne portent pas de champs personnalisés ;
    // une œuvre importée est découverte (0.6.17).
    status: 'découverte' as ArtworkFormValues['status'],
    customFields: [],
    details: {},
  } satisfies ArtworkFormValues)
  if (!result.success) return formFailure(line, result.errors, errors)
  for (const warning of warnings) errors.push({ path: `Ligne ${line}.info`, message: warning })
  return { id: `import-preview-${line}`, profileId: 'import-preview-profile', ...result.data, createdAt: importedAt, updatedAt: importedAt }
}

function parseQuotes(value: string, line: number, errors: ImportValidationError[], importedAt: string): BookQuote[] {
  if (!value.trim()) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.some((quote) => typeof quote !== 'string')) {
      errors.push({ path: `Ligne ${line}.citations.info`, message: 'Citations dans un format inattendu — laissées vides.' })
      return []
    }
    return parsed.filter((quote) => quote.trim()).map((body, position) => ({
      id: `import-preview-${line}-quote-${position}`, bookId: `import-preview-${line}`, body, position, createdAt: importedAt,
    }))
  } catch {
    // Citations libres (texte non JSON, ex. export Notion) : on garde le texte
    // brut comme une seule citation plutôt que de bloquer quoi que ce soit.
    errors.push({ path: `Ligne ${line}.citations.info`, message: 'Citations en texte libre — importées comme une citation unique.' })
    return [{ id: `import-preview-${line}-quote-0`, bookId: `import-preview-${line}`, body: value.trim(), position: 0, createdAt: importedAt }]
  }
}

function formFailure(line: number, formErrors: Record<string, string | undefined>, errors: ImportValidationError[]): null {
  for (const [field, message] of Object.entries(formErrors)) {
    if (message) errors.push({ path: `Ligne ${line}.${field}`, message })
  }
  return null
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
