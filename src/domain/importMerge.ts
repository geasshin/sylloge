import type { Book } from './book.ts'
import type { Film } from './film.ts'
import type { Series } from './series.ts'

/**
 * Détection de doublons et fusion intelligente pour les imports unitaires
 * dans le profil courant (jalon 0.4.4).
 *
 * Règles actées avec Aurélien le 20 juillet 2026 :
 * - un doublon est détecté au titre normalisé (casse, accents, espaces) ;
 * - pour chaque doublon, l'utilisateur choisit individuellement la fiche à
 *   conserver (existante ou importée) ;
 * - la fusion préserve les données personnelles de l'existant (statut, note,
 *   avis, coup de cœur, progression, dates d'usage) et l'importé ne comble
 *   que les champs descriptifs vides.
 */

export type DuplicateResolution = 'keep-existing' | 'keep-imported'

export type FilmDuplicate = {
  normalizedTitle: string
  existing: Film
  imported: Film
}

export type SeriesDuplicate = {
  normalizedTitle: string
  existing: Series
  imported: Series
}

export type BookDuplicate = {
  normalizedTitle: string
  existing: Book
  imported: Book
}

export type FilmMergePlan = {
  additions: Film[]
  duplicates: FilmDuplicate[]
}

export type SeriesMergePlan = {
  additions: Series[]
  duplicates: SeriesDuplicate[]
}

export type BookMergePlan = {
  additions: Book[]
  duplicates: BookDuplicate[]
}

/** Normalisation de titre : casse, diacritiques et espaces insensibles. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstNonEmpty<T>(existing: T, imported: T): T {
  if (existing === null || existing === '') return imported
  return existing
}

function fillEmptyFields<F extends object, K extends keyof F>(existing: F, imported: F, keys: readonly K[]): F {
  const merged = { ...existing }
  for (const key of keys) {
    merged[key] = firstNonEmpty(existing[key], imported[key])
  }
  return merged
}

const FILM_MERGEABLE_KEYS = [
  'originalTitle',
  'year',
  'director',
  'summary',
  'providerName',
  'providerId',
  'posterUrl',
] as const satisfies readonly (keyof Film)[]

const SERIES_MERGEABLE_KEYS = [
  'showrunner',
  'casting',
  'summary',
  'posterUrl',
] as const satisfies readonly (keyof Series)[]

const BOOK_MERGEABLE_KEYS = [
  'author',
  'year',
  'summary',
  'coverUrl',
] as const satisfies readonly (keyof Book)[]

/**
 * Fusion intelligente d'une fiche Film : l'existant garde son identité et
 * toutes ses données personnelles ; l'importé ne comble que les champs
 * descriptifs vides.
 */
export function mergeFilmKeepExisting(existing: Film, imported: Film): Film {
  return fillEmptyFields(existing, imported, FILM_MERGEABLE_KEYS)
}

/** Fusion intelligente d'une fiche Série, même règle que les Films. */
export function mergeSeriesKeepExisting(existing: Series, imported: Series): Series {
  return fillEmptyFields(existing, imported, SERIES_MERGEABLE_KEYS)
}

/** Les données personnelles et citations locales restent prioritaires. */
export function mergeBookKeepExisting(existing: Book, imported: Book): Book {
  return fillEmptyFields(existing, imported, BOOK_MERGEABLE_KEYS)
}

/** Prépare le plan de fusion Films : nouveautés d'un côté, doublons de l'autre. */
export function planFilmMerge(existing: Film[], imported: Film[]): FilmMergePlan {
  const existingByTitle = new Map(existing.map((film) => [normalizeTitle(film.title), film]))
  const additions: Film[] = []
  const duplicates: FilmDuplicate[] = []

  for (const film of imported) {
    const normalizedTitle = normalizeTitle(film.title)
    const match = existingByTitle.get(normalizedTitle)
    if (match) {
      duplicates.push({ normalizedTitle, existing: match, imported: film })
    } else {
      additions.push(film)
    }
  }

  return { additions, duplicates }
}

/** Prépare le plan de fusion Séries. */
export function planSeriesMerge(existing: Series[], imported: Series[]): SeriesMergePlan {
  const existingByTitle = new Map(existing.map((series) => [normalizeTitle(series.title), series]))
  const additions: Series[] = []
  const duplicates: SeriesDuplicate[] = []

  for (const series of imported) {
    const normalizedTitle = normalizeTitle(series.title)
    const match = existingByTitle.get(normalizedTitle)
    if (match) {
      duplicates.push({ normalizedTitle, existing: match, imported: series })
    } else {
      additions.push(series)
    }
  }

  return { additions, duplicates }
}

/** Prépare le plan de fusion Livres. */
export function planBookMerge(existing: Book[], imported: Book[]): BookMergePlan {
  const existingByTitle = new Map(existing.map((book) => [normalizeTitle(book.title), book]))
  const additions: Book[] = []
  const duplicates: BookDuplicate[] = []

  for (const book of imported) {
    const normalizedTitle = normalizeTitle(book.title)
    const match = existingByTitle.get(normalizedTitle)
    if (match) {
      duplicates.push({ normalizedTitle, existing: match, imported: book })
    } else {
      additions.push(book)
    }
  }

  return { additions, duplicates }
}

/**
 * Résout un plan de fusion Films avec les choix de l'utilisateur.
 * - `keep-existing` : la fiche existante est enrichie des champs vides ;
 * - `keep-imported` : la fiche importée remplace l'existante (identité locale
 *   conservée pour éviter de casser les références).
 *
 * Le résultat contient les fiches à insérer et les fiches à mettre à jour.
 */
export type MergeWritePlan<F> = {
  inserts: F[]
  updates: F[]
  deletes: F[]
}

export function resolveFilmMerge(
  existing: Film[],
  plan: FilmMergePlan,
  resolutions: Map<string, DuplicateResolution>,
  now: string,
): MergeWritePlan<Film> {
  const inserts: Film[] = plan.additions.map((film) => ({ ...film, updatedAt: now }))
  const updates: Film[] = []
  const deletes: Film[] = []

  for (const duplicate of plan.duplicates) {
    const resolution = resolutions.get(duplicate.normalizedTitle) ?? 'keep-existing'
    if (resolution === 'keep-imported') {
      updates.push({
        ...duplicate.imported,
        id: duplicate.existing.id,
        profileId: duplicate.existing.profileId,
        createdAt: duplicate.existing.createdAt,
        updatedAt: now,
      })
    } else {
      updates.push({ ...mergeFilmKeepExisting(duplicate.existing, duplicate.imported), updatedAt: now })
    }
  }

  void existing
  return { inserts, updates, deletes }
}

/** Résout un plan de fusion Séries avec les choix de l'utilisateur. */
export function resolveSeriesMerge(
  existing: Series[],
  plan: SeriesMergePlan,
  resolutions: Map<string, DuplicateResolution>,
  now: string,
): MergeWritePlan<Series> {
  const inserts: Series[] = plan.additions.map((series) => ({ ...series, updatedAt: now }))
  const updates: Series[] = []
  const deletes: Series[] = []

  for (const duplicate of plan.duplicates) {
    const resolution = resolutions.get(duplicate.normalizedTitle) ?? 'keep-existing'
    if (resolution === 'keep-imported') {
      updates.push({
        ...duplicate.imported,
        id: duplicate.existing.id,
        profileId: duplicate.existing.profileId,
        createdAt: duplicate.existing.createdAt,
        updatedAt: now,
      })
    } else {
      updates.push({ ...mergeSeriesKeepExisting(duplicate.existing, duplicate.imported), updatedAt: now })
    }
  }

  void existing
  return { inserts, updates, deletes }
}

/** Résout un plan de fusion Livres, citations comprises. */
export function resolveBookMerge(
  existing: Book[],
  plan: BookMergePlan,
  resolutions: Map<string, DuplicateResolution>,
  now: string,
): MergeWritePlan<Book> {
  const inserts = plan.additions.map((book) => ({ ...book, updatedAt: now }))
  const updates: Book[] = []
  const deletes: Book[] = []

  for (const duplicate of plan.duplicates) {
    const resolution = resolutions.get(duplicate.normalizedTitle) ?? 'keep-existing'
    if (resolution === 'keep-imported') {
      updates.push({
        ...duplicate.imported,
        id: duplicate.existing.id,
        profileId: duplicate.existing.profileId,
        createdAt: duplicate.existing.createdAt,
        updatedAt: now,
        quotes: duplicate.imported.quotes.map((quote) => ({
          ...quote,
          bookId: duplicate.existing.id,
        })),
      })
    } else {
      updates.push({ ...mergeBookKeepExisting(duplicate.existing, duplicate.imported), updatedAt: now })
    }
  }

  void existing
  return { inserts, updates, deletes }
}
