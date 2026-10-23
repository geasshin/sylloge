import { normalizeArtwork, ARTWORK_FORMS, ARTWORK_STATUSES, type Artwork } from './artwork.ts'
import { normalizeBook, BOOK_CATEGORIES, BOOK_STATUSES, type Book, type BookQuote } from './book.ts'
import { FILM_STATUSES, normalizeFilm, type Film } from './film.ts'
import { normalizeGame, GAME_STATUSES, type Game } from './game.ts'
import type { Profile } from './profile.ts'
import { SYLLOGE_EXPORT_FORMAT, validateLibraryImport } from './libraryTransfer.ts'
import { normalizeSeries, SERIES_CATEGORIES, SERIES_STATUSES, type Series } from './series.ts'
import {
  CUSTOM_LIBRARY_TEMPLATES,
  CUSTOM_STATUSES,
  isCustomLibraryId,
  normalizeCustomEntry,
  type CustomEntry,
  type CustomLibrary,
  type CustomLibraryId,
  type CustomQuote,
  type CustomStatus,
} from './customLibraries.ts'
import { EXPERIENCE_VERSION, readExperience, type ProfileExperience } from './profileExperience.ts'

export const SYLLOGE_LIBRARY_FORMAT = 'sylloge-library' as const
/**
 * Version écrite par l’application. La v4 (22 octobre 2026) ajoute les
 * bibliothèques personnalisées, la v5 (23 octobre 2026) l’expérience du
 * profil — vues enregistrées et préférences d’affichage. Les versions 1 à 4
 * restent lisibles : un document v4 s’importe sans experience, comme avant.
 */
export const SYLLOGE_LIBRARY_VERSION = 5 as const
export const SYLLOGE_LIBRARY_LEGACY_VERSIONS = [1, 2, 3, 4] as const

type DocumentVersion = 1 | 2 | 3 | 4 | 5

export type SyllogeLibraryDocument = {
  format: typeof SYLLOGE_LIBRARY_FORMAT
  version: typeof SYLLOGE_LIBRARY_VERSION
  exportedAt: string
  profile: Profile
  films: Film[]
  series: Series[]
  anime: Series[]
  books: Book[]
  mangas: Book[]
  games: Game[]
  artworks: Artwork[]
  /** Bibliothèques personnalisées ajoutées au profil, fiches comprises (v4). */
  customLibraries: CustomLibrary[]
  /** Vues enregistrées et préférences d’affichage (v5). Absent d’un document v4. */
  experience?: ProfileExperience
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
  anime: number
  books: number
  mangas: number
  games: number
  artworks: number
  /** Total des fiches des bibliothèques personnalisées. */
  custom: number
}

export type ExportableLibrary = {
  profile: Profile
  films: Film[]
  series: Series[]
  books: Book[]
  games: Game[]
  artworks: Artwork[]
  /**
   * Sections explicites fournies par le dépôt. À défaut, la partition se fait
   * sur la catégorie de chaque fiche : animation → anime, manga → mangas.
   */
  anime?: Series[]
  mangas?: Book[]
  customLibraries?: CustomLibrary[]
}

export const SYLLOGE_LIBRARY_SECTIONS = ['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks'] as const

const ROOT_KEYS_V1 = ['format', 'version', 'exportedAt', 'profile', 'films'] as const
const ROOT_KEYS_V2 = [...ROOT_KEYS_V1, 'series', 'books', 'games', 'artworks'] as const
const ROOT_KEYS_V3 = [...ROOT_KEYS_V2, 'anime', 'mangas'] as const
const ROOT_KEYS_V4 = [...ROOT_KEYS_V3, 'customLibraries'] as const
const ROOT_KEYS_V5 = [...ROOT_KEYS_V4, 'experience'] as const
const CUSTOM_LIBRARY_KEYS = ['libraryId', 'position', 'addedAt', 'entries'] as const
const CUSTOM_ENTRY_KEYS = [
  'id',
  'profileId',
  'title',
  'creator',
  'year',
  'status',
  'rating',
  'isFavorite',
  'progressCurrent',
  'progressTotal',
  'progressUpdatedAt',
  'startedAt',
  'finishedAt',
  'coverUrl',
  'summary',
  'personalNote',
  'details',
  'quotes',
  'createdAt',
  'updatedAt',
] as const
const CUSTOM_QUOTE_KEYS = ['id', 'entryId', 'body', 'position', 'createdAt'] as const
/** Les documents v1 à v3 peuvent contenir des comics rangés dans Livres. */
const LEGACY_BOOK_CATEGORIES = [...BOOK_CATEGORIES, 'comics'] as const
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
  'customFields',
  'createdAt',
  'updatedAt',
] as const
const CUSTOM_FIELD_KEYS = ['name', 'value'] as const

export function createLibraryDocument(
  library: ExportableLibrary,
  exportedAt = new Date().toISOString(),
  experience?: ProfileExperience,
): SyllogeLibraryDocument {
  const series = splitSeries(library.series, library.anime)
  const books = splitBooks(library.books, library.mangas)
  return {
    format: SYLLOGE_LIBRARY_FORMAT,
    version: SYLLOGE_LIBRARY_VERSION,
    exportedAt,
    profile: { ...library.profile },
    films: library.films.map(normalizeFilm),
    series: series.series.map(normalizeSeries),
    anime: series.anime.map(normalizeSeries),
    books: books.books.map(normalizeBook),
    mangas: books.mangas.map(normalizeBook),
    games: library.games.map(normalizeGame),
    artworks: library.artworks.map(prepareArtwork),
    customLibraries: prepareCustomLibraries(library.customLibraries ?? []),
    // Toujours présent en v5 : un producteur qui ne collecte rien écrit un bloc vide, ce qui
    // se lit « ce document ne porte aucune expérience » et jamais « préférences perdues ».
    experience: experience ?? { version: EXPERIENCE_VERSION, savedViews: [], preferences: {} },
  }
}

/** Ordre d’ajout, fiches normalisées et clés stables, citations triées. */
function prepareCustomLibraries(libraries: CustomLibrary[]): CustomLibrary[] {
  return [...libraries]
    .sort((first, second) => first.position - second.position || first.addedAt.localeCompare(second.addedAt))
    .map((library) => ({
      libraryId: library.libraryId,
      position: library.position,
      addedAt: library.addedAt,
      entries: library.entries.map((entry) => {
        const normalized = normalizeCustomEntry(entry)
        return {
          id: normalized.id,
          profileId: normalized.profileId,
          title: normalized.title,
          creator: normalized.creator,
          year: normalized.year,
          status: normalized.status,
          rating: normalized.rating,
          isFavorite: normalized.isFavorite,
          progressCurrent: normalized.progressCurrent,
          progressTotal: normalized.progressTotal,
          progressUpdatedAt: normalized.progressUpdatedAt,
          startedAt: normalized.startedAt,
          finishedAt: normalized.finishedAt,
          coverUrl: normalized.coverUrl,
          summary: normalized.summary,
          personalNote: normalized.personalNote,
          details: { ...normalized.details },
          quotes: [...normalized.quotes]
            .sort((first, second) => first.position - second.position)
            .map((quote) => ({ id: quote.id, entryId: quote.entryId, body: quote.body, position: quote.position, createdAt: quote.createdAt })),
          createdAt: normalized.createdAt,
          updatedAt: normalized.updatedAt,
        }
      }),
    }))
}

/**
 * Accepte l’ancien modèle (une seule liste `series`) comme le nouveau (une
 * section par bibliothèque). Les doublons par identifiant sont résolus au
 * profit de la section explicite, jamais dupliqués dans deux sections.
 */
function splitSeries(entries: Series[], explicitAnime?: Series[]): { series: Series[]; anime: Series[] } {
  const series = new Map<string, Series>()
  const anime = new Map<string, Series>()
  for (const entry of entries ?? []) {
    if (entry.category === 'animation') anime.set(entry.id, { ...entry, category: 'animation' })
    else series.set(entry.id, entry)
  }
  for (const entry of explicitAnime ?? []) anime.set(entry.id, { ...entry, category: 'animation' })
  return { series: [...series.values()], anime: [...anime.values()] }
}

function splitBooks(entries: Book[], explicitMangas?: Book[]): { books: Book[]; mangas: Book[] } {
  const books = new Map<string, Book>()
  const mangas = new Map<string, Book>()
  for (const entry of entries) {
    if (entry.category === 'manga') mangas.set(entry.id, { ...entry, category: 'manga' })
    else if ((entry.category as string) !== 'comics') books.set(entry.id, entry)
  }
  for (const entry of explicitMangas ?? []) mangas.set(entry.id, { ...entry, category: 'manga' })
  return { books: [...books.values()], mangas: [...mangas.values()] }
}

/** Une œuvre exportée porte toujours ses champs personnalisés, même vides. */
function prepareArtwork(artwork: Artwork): Artwork {
  const normalized = normalizeArtwork(artwork)
  return {
    ...normalized,
    customFields: (normalized.customFields ?? []).map((field) => ({ name: field.name, value: field.value })),
  }
}

export function serializeLibraryDocument(document: SyllogeLibraryDocument): string {
  return `${JSON.stringify(createLibraryDocument(document, document.exportedAt, document.experience), null, 2)}\n`
}

export function libraryExportFileName(exportedAt: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(exportedAt)?.[0] ?? 'export'
  return `sylloge-sauvegarde-${day}.json`
}

export function validateLibraryDocument(contents: string): LibraryImportPreview {
  const emptyCounts = emptyCollectionCounts()
  let value: unknown

  try {
    value = JSON.parse(contents)
  } catch {
    return invalidDocument('$', 'Le fichier ne contient pas un JSON valide.', emptyCounts)
  }

  if (!isRecord(value)) {
    return invalidDocument('$', 'La racine du fichier doit être un objet JSON.', emptyCounts)
  }

  // Export Films historique (sylloge-films v1) : lu comme une bibliothèque
  // dont seule la section films est renseignée.
  if (value.format === SYLLOGE_EXPORT_FORMAT) return validateHistoricalFilmsDocument(contents)

  const errors: LibraryImportValidationError[] = []
  const version = libraryDocumentVersion(value.version)

  if (value.format !== SYLLOGE_LIBRARY_FORMAT) {
    addError(errors, '$.format', `Le format attendu est « ${SYLLOGE_LIBRARY_FORMAT} ».`)
  }

  if (version === null) {
    addError(
      errors,
      '$.version',
      isNewerDocumentVersion(value.version)
        ? 'Cette sauvegarde a été créée par une version plus récente de Sylloge. Mettre l’application à jour pour la restaurer.'
        : 'Les versions 1 à 5 du document sont prises en charge.',
    )
    return { document: null, counts: emptyCounts, errors }
  }

  validateExactKeys(value, rootKeysFor(version), '$', errors, version)
  validateIsoDate(value.exportedAt, '$.exportedAt', errors)

  const profile = validateProfile(value.profile, errors, version)
  const ids = new Set<string>()

  const films = validateCollection(
    value.films,
    '$.films',
    (filmValue, index) => validateFilm(filmValue, `$.films[${index}]`, version, profile?.id ?? null, ids, errors),
    errors,
  )
  const seriesItems = version === 1
    ? []
    : validateCollection(
      value.series,
      '$.series',
      (seriesValue, index) => validateSeries(seriesValue, `$.series[${index}]`, version, 'series', profile?.id ?? null, ids, errors),
      errors,
    )
  const bookItems = version === 1
    ? []
    : validateCollection(
      value.books,
      '$.books',
      (bookValue, index) => validateBook(bookValue, `$.books[${index}]`, version, 'books', profile?.id ?? null, ids, errors),
      errors,
    )
  const games = version === 1
    ? []
    : validateCollection(
      value.games,
      '$.games',
      (gameValue, index) => validateGame(gameValue, `$.games[${index}]`, version, profile?.id ?? null, ids, errors),
      errors,
    )
  const artworks = version === 1
    ? []
    : validateCollection(
      value.artworks,
      '$.artworks',
      (artworkValue, index) => validateArtwork(artworkValue, `$.artworks[${index}]`, version, profile?.id ?? null, ids, errors),
      errors,
    )

  // v1/v2 : les sections sont dérivées des catégories historiques. v3 : elles
  // sont explicites et chaque section n’accepte que sa propre catégorie.
  const anime = version >= 3
    ? validateCollection(
      value.anime,
      '$.anime',
      (seriesValue, index) => validateSeries(seriesValue, `$.anime[${index}]`, version, 'anime', profile?.id ?? null, ids, errors),
      errors,
    )
    : (seriesItems ?? []).filter((entry) => entry.category === 'animation')
  const mangas = version >= 3
    ? validateCollection(
      value.mangas,
      '$.mangas',
      (bookValue, index) => validateBook(bookValue, `$.mangas[${index}]`, version, 'mangas', profile?.id ?? null, ids, errors),
      errors,
    )
    : (bookItems ?? []).filter((entry) => entry.category === 'manga')
  const series = version >= 3 ? seriesItems : (seriesItems ?? []).filter((entry) => entry.category !== 'animation')
  // Comics : une bibliothèque à part depuis la v4. Les comics d’un document
  // plus ancien, rangés dans Livres, rejoignent la bibliothèque Comics.
  const legacyComics = version <= 3 ? (bookItems ?? []).filter((entry) => (entry.category as string) === 'comics') : []
  const books = (version >= 3 ? bookItems : (bookItems ?? []).filter((entry) => entry.category !== 'manga'))
    ?.filter((entry) => (entry.category as string) !== 'comics') ?? null
  const customLibraries = version >= 4
    ? validateCustomLibraries(value.customLibraries, profile?.id ?? null, ids, errors)
    : legacyComicsLibrary(legacyComics, typeof value.exportedAt === 'string' ? value.exportedAt : new Date(0).toISOString())

  // L’expérience est facultative : un bloc absent (v4) ou partiellement abîmé ne doit pas
  // empêcher la restauration des fiches. Ses défauts sont donc rapportés sans invalider.
  // Un document v5 peut omettre le bloc : un producteur qui ne connaît pas l'expérience du
  // profil reste valide, et la restauration des fiches n'en dépend jamais.
  const experienceRead = version >= 5 ? readExperience(value.experience) : { experience: null, errors: [], dropped: [] }
  for (const message of experienceRead.errors) addError(errors, '$.experience', message)

  const counts: LibraryCollectionCounts = {
    films: films?.length ?? 0,
    series: series?.length ?? 0,
    anime: anime?.length ?? 0,
    books: books?.length ?? 0,
    mangas: mangas?.length ?? 0,
    games: games?.length ?? 0,
    artworks: artworks?.length ?? 0,
    custom: (customLibraries ?? []).reduce((total, library) => total + library.entries.length, 0),
  }

  if (
    errors.length > 0
    || !profile
    || typeof value.exportedAt !== 'string'
    || !films
    || !series
    || !anime
    || !books
    || !mangas
    || !games
    || !artworks
    || !customLibraries
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
      anime,
      books,
      mangas,
      games,
      artworks,
      customLibraries,
      ...(experienceRead.experience ? { experience: experienceRead.experience } : {}),
    },
    counts,
    errors: [],
  }
}

function emptyCollectionCounts(): LibraryCollectionCounts {
  return { films: 0, series: 0, anime: 0, books: 0, mangas: 0, games: 0, artworks: 0, custom: 0 }
}

/** Un entier au-delà de la version comprise : le document vient d'une application plus récente. */
const isNewerDocumentVersion = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value > SYLLOGE_LIBRARY_VERSION

function libraryDocumentVersion(value: unknown): DocumentVersion | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null
}

function rootKeysFor(version: DocumentVersion): readonly string[] {
  if (version === 1) return ROOT_KEYS_V1
  if (version === 2) return ROOT_KEYS_V2
  if (version === 3) return ROOT_KEYS_V3
  if (version === 4) return ROOT_KEYS_V4
  return ROOT_KEYS_V5
}

const LEGACY_BOOK_STATUS_TO_CUSTOM: Record<string, CustomStatus> = {
  'à lire': 'à découvrir',
  'en cours': 'en cours',
  abandonné: 'abandonné',
  lu: 'terminé',
}

/** Comics d’un document v1 à v3 : même conversion que la migration 0021. */
function legacyComicsLibrary(comics: Book[], addedAt: string): CustomLibrary[] {
  if (comics.length === 0) return []
  return [{
    libraryId: 'comics',
    position: 0,
    addedAt,
    entries: comics.map((book) => ({
      id: book.id,
      profileId: book.profileId,
      title: book.title,
      creator: book.author,
      year: book.year,
      status: LEGACY_BOOK_STATUS_TO_CUSTOM[book.status] ?? 'à découvrir',
      rating: book.rating,
      isFavorite: book.isFavorite,
      progressCurrent: book.volumesRead,
      progressTotal: book.volumesTotal,
      progressUpdatedAt: book.progressUpdatedAt,
      startedAt: book.startedAt,
      finishedAt: null,
      coverUrl: book.coverUrl,
      summary: book.summary,
      personalNote: book.personalNote,
      details: {},
      quotes: book.quotes.map((quote) => ({ id: quote.id, entryId: book.id, body: quote.body, position: quote.position, createdAt: quote.createdAt })),
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    })),
  }]
}

function validateCustomLibraries(
  value: unknown,
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
): CustomLibrary[] | null {
  if (!Array.isArray(value)) {
    addError(errors, '$.customLibraries', 'Cette section doit être un tableau.')
    return null
  }
  const seen = new Set<string>()
  const libraries: CustomLibrary[] = []
  value.forEach((libraryValue, index) => {
    const path = `$.customLibraries[${index}]`
    if (!isRecord(libraryValue)) {
      addError(errors, path, 'Cette bibliothèque doit être un objet.')
      return
    }
    validateExactKeys(libraryValue, CUSTOM_LIBRARY_KEYS, path, errors, 4)
    const libraryId = libraryValue.libraryId
    if (!isCustomLibraryId(libraryId)) {
      addError(errors, `${path}.libraryId`, 'Cette bibliothèque personnalisée est inconnue.')
      return
    }
    if (seen.has(libraryId)) addError(errors, `${path}.libraryId`, 'Cette bibliothèque est présente plusieurs fois.')
    seen.add(libraryId)
    if (!Number.isInteger(libraryValue.position) || (libraryValue.position as number) < 0) {
      addError(errors, `${path}.position`, 'La position doit être un entier positif ou nul.')
    }
    validateIsoDate(libraryValue.addedAt, `${path}.addedAt`, errors)
    const entries = validateCollection(
      libraryValue.entries,
      `${path}.entries`,
      (entryValue, entryIndex) => validateCustomEntry(entryValue, `${path}.entries[${entryIndex}]`, libraryId, profileId, ids, errors),
      errors,
    )
    if (!entries || hasPathError(errors, path)) return
    libraries.push({ libraryId, position: libraryValue.position as number, addedAt: libraryValue.addedAt as string, entries })
  })
  return libraries
}

function validateCustomEntry(
  value: unknown,
  path: string,
  libraryId: CustomLibraryId,
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
): CustomEntry | null {
  const template = CUSTOM_LIBRARY_TEMPLATES[libraryId]
  if (!isRecord(value)) {
    addError(errors, path, `Cette entrée doit être un objet ${template.label}.`)
    return null
  }
  const identityValid = validateSharedIdentity(value, path, CUSTOM_ENTRY_KEYS, 4, profileId, ids, errors, template.label)
  validateOptionalString(value.creator, `${path}.creator`, errors)
  validateOptionalYear(value.year, `${path}.year`, errors)
  if (!(CUSTOM_STATUSES as readonly unknown[]).includes(value.status)) {
    addError(errors, `${path}.status`, `Le statut ${template.label} est inconnu.`)
  }
  validateRating(value.rating, `${path}.rating`, errors)
  if (typeof value.isFavorite !== 'boolean') {
    addError(errors, `${path}.isFavorite`, 'La valeur favori doit être un booléen.')
  }
  validateOptionalProgress(value.progressCurrent, `${path}.progressCurrent`, errors)
  validateOptionalProgress(value.progressTotal, `${path}.progressTotal`, errors)
  if (
    typeof value.progressCurrent === 'number'
    && typeof value.progressTotal === 'number'
    && value.progressCurrent > value.progressTotal
  ) {
    addError(errors, `${path}.progressCurrent`, 'La progression ne peut pas dépasser le total.')
  }
  for (const key of ['progressUpdatedAt', 'startedAt', 'finishedAt', 'coverUrl', 'summary', 'personalNote'] as const) {
    validateOptionalString(value[key], `${path}.${key}`, errors)
  }
  if (!isRecord(value.details)) {
    addError(errors, `${path}.details`, 'Les champs propres doivent être un objet.')
  } else {
    for (const [key, detail] of Object.entries(value.details)) {
      if (typeof detail !== 'string') addError(errors, `${path}.details.${key}`, 'Une valeur de champ propre doit être une chaîne.')
    }
  }
  const quotes: CustomQuote[] = []
  if (!Array.isArray(value.quotes)) {
    addError(errors, `${path}.quotes`, 'Les citations doivent être un tableau.')
  } else if (value.quotes.length > 0 && !template.quotes) {
    addError(errors, `${path}.quotes`, `La bibliothèque ${template.label} n’a pas de citations.`)
  } else {
    const quoteIds = new Set<string>()
    value.quotes.forEach((quote, quoteIndex) => {
      const quotePath = `${path}.quotes[${quoteIndex}]`
      if (!isRecord(quote)) {
        addError(errors, quotePath, 'Cette citation doit être un objet.')
        return
      }
      validateExactKeys(quote, CUSTOM_QUOTE_KEYS, quotePath, errors, 4)
      validateNonEmptyString(quote.id, `${quotePath}.id`, errors)
      if (typeof quote.id === 'string') {
        if (quoteIds.has(quote.id)) addError(errors, `${quotePath}.id`, 'Cet identifiant de citation est présent plusieurs fois.')
        quoteIds.add(quote.id)
      }
      if (quote.entryId !== value.id) addError(errors, `${quotePath}.entryId`, 'La citation ne correspond pas à sa fiche.')
      validateNonEmptyString(quote.body, `${quotePath}.body`, errors)
      if (!Number.isInteger(quote.position) || (quote.position as number) < 0) {
        addError(errors, `${quotePath}.position`, 'La position doit être un entier positif ou nul.')
      }
      validateIsoDate(quote.createdAt, `${quotePath}.createdAt`, errors)
      quotes.push(quote as CustomQuote)
    })
  }

  if (!identityValid || hasPathError(errors, path)) return null

  const entry = normalizeCustomEntry({ ...(value as unknown as CustomEntry), quotes })
  validateOptionalCalendarDate(entry.startedAt, `${path}.startedAt`, errors, 'La date de début')
  validateOptionalCalendarDate(entry.finishedAt, `${path}.finishedAt`, errors, 'La date de fin')
  validateOptionalHttpUrl(entry.coverUrl, `${path}.coverUrl`, errors, 'L’URL de couverture')
  if (hasPathError(errors, path)) return null
  return entry
}

/** Un export Films v1 reste réimportable et adopte le modèle à sept sections. */
function validateHistoricalFilmsDocument(contents: string): LibraryImportPreview {
  const historical = validateLibraryImport(contents)
  const counts = emptyCollectionCounts()
  counts.films = historical.document?.films.length ?? historical.validFilmCount
  if (historical.document === null) {
    return { document: null, counts, errors: historical.errors }
  }
  return {
    document: {
      format: SYLLOGE_LIBRARY_FORMAT,
      version: SYLLOGE_LIBRARY_VERSION,
      exportedAt: historical.document.exportedAt,
      profile: historical.document.profile,
      films: historical.document.films,
      series: [],
      anime: [],
      books: [],
      mangas: [],
      games: [],
      artworks: [],
      customLibraries: [],
    },
    counts,
    errors: [],
  }
}

function validateCollection<T>(
  value: unknown,
  path: string,
  validateItem: (item: unknown, index: number) => T | null,
  errors: LibraryImportValidationError[],
): T[] | null {
  const items: T[] = []
  if (!Array.isArray(value)) {
    addError(errors, path, 'Cette section doit être un tableau.')
    return null
  }
  value.forEach((item, index) => {
    const validated = validateItem(item, index)
    if (validated) items.push(validated)
  })
  return items
}

function validateProfile(
  value: unknown,
  errors: LibraryImportValidationError[],
  version: DocumentVersion,
): Profile | null {
  if (!isRecord(value)) {
    addError(errors, '$.profile', 'Le profil doit être un objet.')
    return null
  }

  validateExactKeys(value, PROFILE_KEYS, '$.profile', errors, version)
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
  version: DocumentVersion,
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
  itemLabel: string,
  optionalKeys: readonly string[] = [],
): boolean {
  validateExactKeys(value, expectedKeys, path, errors, version, optionalKeys)
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
  path: string,
  version: DocumentVersion,
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
): Film | null {
  if (!isRecord(value)) {
    addError(errors, path, 'Cette entrée doit être un objet Film.')
    return null
  }

  const identityValid = validateSharedIdentity(value, path, FILM_KEYS, version, profileId, ids, errors, 'Film')
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
  path: string,
  version: DocumentVersion,
  section: 'series' | 'anime',
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
): Series | null {
  if (!isRecord(value)) {
    addError(errors, path, 'Cette entrée doit être un objet Série.')
    return null
  }

  const identityValid = validateSharedIdentity(value, path, SERIES_KEYS, version, profileId, ids, errors, 'Série')
  validateOptionalString(value.showrunner, `${path}.showrunner`, errors)
  validateOptionalString(value.casting, `${path}.casting`, errors)
  validateOptionalString(value.summary, `${path}.summary`, errors)
  if (!(SERIES_CATEGORIES as readonly unknown[]).includes(value.category)) {
    addError(errors, `${path}.category`, 'La catégorie Série est inconnue.')
  } else if (version >= 3 && section === 'series' && value.category !== 'série télé') {
    addError(errors, `${path}.category`, 'La section Séries n’accepte que la catégorie « série télé ».')
  } else if (version >= 3 && section === 'anime' && value.category !== 'animation') {
    addError(errors, `${path}.category`, 'La section Animation japonaise n’accepte que la catégorie « animation ».')
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
  path: string,
  version: DocumentVersion,
  section: 'books' | 'mangas',
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
): Book | null {
  if (!isRecord(value)) {
    addError(errors, path, 'Cette entrée doit être un objet Livre.')
    return null
  }

  const identityValid = validateSharedIdentity(value, path, BOOK_KEYS, version, profileId, ids, errors, 'Livre')
  validateOptionalString(value.author, `${path}.author`, errors)
  validateOptionalYear(value.year, `${path}.year`, errors)
  validateOptionalString(value.summary, `${path}.summary`, errors)
  if (!((version <= 3 ? LEGACY_BOOK_CATEGORIES : BOOK_CATEGORIES) as readonly unknown[]).includes(value.category)) {
    addError(errors, `${path}.category`, version >= 4 && value.category === 'comics'
      ? 'Les comics ont leur propre bibliothèque : la section Livres ne les accepte pas.'
      : 'La catégorie Livre est inconnue.')
  } else if (version >= 3 && section === 'books' && value.category === 'manga') {
    addError(errors, `${path}.category`, 'La section Livres n’accepte pas la catégorie « manga ».')
  } else if (version >= 3 && section === 'mangas' && value.category !== 'manga') {
    addError(errors, `${path}.category`, 'La section Mangas n’accepte que la catégorie « manga ».')
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
      validateQuote(quote, book.id, `${path}.quotes[${quoteIndex}]`, version, quoteIds, errors)
    })
  }

  if (!identityValid || hasPathError(errors, path)) return null

  return book
}

function validateQuote(
  value: unknown,
  bookId: string,
  path: string,
  version: DocumentVersion,
  quoteIds: Set<string>,
  errors: LibraryImportValidationError[],
) {
  if (!isRecord(value)) {
    addError(errors, path, 'Cette citation doit être un objet.')
    return
  }
  validateExactKeys(value, QUOTE_KEYS, path, errors, version)
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
  path: string,
  version: DocumentVersion,
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
): Game | null {
  if (!isRecord(value)) {
    addError(errors, path, 'Cette entrée doit être un objet Jeu.')
    return null
  }

  const identityValid = validateSharedIdentity(value, path, GAME_KEYS, version, profileId, ids, errors, 'Jeu')
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
  path: string,
  version: DocumentVersion,
  profileId: string | null,
  ids: Set<string>,
  errors: LibraryImportValidationError[],
): Artwork | null {
  if (!isRecord(value)) {
    addError(errors, path, 'Cette entrée doit être un objet Œuvre d’art.')
    return null
  }

  // `customFields` est arrivé après la v2 : une œuvre v2 peut l’omettre, une
  // œuvre v3 ou v4 l’exige. Dans les deux cas, il est validé quand il est présent.
  const optionalKeys = version === 2 ? ['customFields'] as const : []
  const identityValid = validateSharedIdentity(
    value, path, ARTWORK_KEYS, version, profileId, ids, errors, 'Œuvre d’art', optionalKeys,
  )
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
  const customFields = validateCustomFields(value.customFields, `${path}.customFields`, errors)

  const artwork = normalizeArtwork({ ...(value as Artwork), customFields })
  validateOptionalCalendarDate(artwork.discoveredAt, `${path}.discoveredAt`, errors, 'La date de découverte')
  validateOptionalHttpUrl(artwork.imageUrl, `${path}.imageUrl`, errors, 'L’URL du visuel')

  if (!identityValid || hasPathError(errors, path)) return null

  return artwork
}

/** Aucun champ personnalisé n’est perdu : ordre, nom et valeur sont validés. */
function validateCustomFields(
  value: unknown,
  path: string,
  errors: LibraryImportValidationError[],
): Artwork['customFields'] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    addError(errors, path, 'Les champs personnalisés doivent être un tableau.')
    return []
  }
  return value.flatMap((field, index) => {
    const fieldPath = `${path}[${index}]`
    if (!isRecord(field)) {
      addError(errors, fieldPath, 'Ce champ personnalisé doit être un objet.')
      return []
    }
    validateExactKeys(field, CUSTOM_FIELD_KEYS, fieldPath, errors, 3)
    validateNonEmptyString(field.name, `${fieldPath}.name`, errors)
    if (typeof field.value !== 'string') {
      addError(errors, `${fieldPath}.value`, 'La valeur d’un champ personnalisé doit être une chaîne.')
    }
    return [{
      name: typeof field.name === 'string' ? field.name : '',
      value: typeof field.value === 'string' ? field.value : '',
    }]
  })
}

function hasPathError(errors: LibraryImportValidationError[], path: string): boolean {
  return errors.some((error) => error.path.startsWith(path))
}

function validateExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  path: string,
  errors: LibraryImportValidationError[],
  version: DocumentVersion,
  optionalKeys: readonly string[] = [],
) {
  const allowed = new Set([...expectedKeys, ...optionalKeys])
  for (const key of expectedKeys) {
    if (!(key in value)) addError(errors, `${path}.${key}`, `Ce champ est obligatoire dans la version ${version}.`)
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) addError(errors, `${path}.${key}`, `Ce champ n’appartient pas au format version ${version}.`)
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
