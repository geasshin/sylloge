import { ARTWORK_FORMS, ARTWORK_STATUSES } from './artwork.ts'
import { BOOK_CATEGORIES, BOOK_STATUSES } from './book.ts'
import { FILM_STATUSES } from './film.ts'
import { GAME_STATUSES } from './game.ts'
import { normalizeLibraryFilters, type LibraryFilters } from './libraryFilters.ts'
import {
  LIBRARY_SORT_COLUMNS,
  RATED_BUILTIN_VIEWS,
  UNRATED_BUILTIN_VIEWS,
  type LibrarySort,
  type LibraryViewDefinition,
} from './libraryViews.ts'
import { SERIES_CATEGORIES, SERIES_STATUSES } from './series.ts'

/**
 * Vues personnalisées enregistrées (jalons 0.4.21 puis 0.4.23).
 *
 * Depuis le modèle unifié, une vue enregistrée capture le même préset que les
 * vues intégrées : { filtres, tri }, plus le filtre propre au médium
 * (catégorie, plateforme ou forme). La recherche textuelle libre reste
 * éphémère et n'est jamais enregistrée. Les vues sont isolées par profil et
 * par médium, et restent locales : elles n'entrent ni dans les snapshots ni
 * dans les exports (décision actée au brief 0.4.21).
 *
 * Les critères écrits au schéma v1 (0.4.21 : { view, mediumFilter, filters })
 * sont convertis à la lecture en préset v2, sans réécriture en base.
 */
export const SAVED_VIEW_MEDIA = ['films', 'series', 'books', 'games', 'artworks'] as const

export type SavedViewMedium = (typeof SAVED_VIEW_MEDIA)[number]

export const SAVED_VIEW_SCHEMA_VERSION = 2

export const SAVED_VIEW_NAME_MAX_LENGTH = 80

export type SavedViewCriteria = {
  sort: LibrarySort
  mediumFilter: string
  filters: LibraryFilters
}

export type SavedView = {
  id: string
  profileId: string
  medium: SavedViewMedium
  name: string
  criteria: SavedViewCriteria
  createdAt: string
  updatedAt: string
}

const MEDIUM_STATUSES: Record<SavedViewMedium, readonly string[]> = {
  films: FILM_STATUSES,
  series: SERIES_STATUSES,
  books: BOOK_STATUSES,
  games: GAME_STATUSES,
  artworks: ARTWORK_STATUSES,
}

const MEDIUM_FILTERS: Record<SavedViewMedium, readonly string[]> = {
  films: ['all'],
  series: ['all', ...SERIES_CATEGORIES],
  books: ['all', ...BOOK_CATEGORIES],
  games: [],
  artworks: ['all', ...ARTWORK_FORMS],
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Un nom exploitable est non vide après nettoyage et reste borné. */
export function validateSavedViewName(name: string): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (trimmed === '') {
    return { ok: false, error: 'Le nom de la vue ne peut pas être vide.' }
  }
  if (trimmed.length > SAVED_VIEW_NAME_MAX_LENGTH) {
    return { ok: false, error: `Le nom de la vue ne peut pas dépasser ${SAVED_VIEW_NAME_MAX_LENGTH} caractères.` }
  }
  return { ok: true, name: trimmed }
}

/** L'Art n'a pas de note : aucune vue enregistrée ne peut reposer sur un tri par note. */
export function assertSavedViewAllowed(medium: SavedViewMedium, criteria: SavedViewCriteria): void {
  if (medium === 'artworks' && criteria.sort.column === 'rating') {
    throw new Error('Une vue triée par note n’existe pas pour l’Art, qui n’a pas de note.')
  }
}

function toOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toOptionalYear(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function toOptionalRating(value: unknown): number | null {
  return typeof value === 'number' && value >= 0.5 && value <= 5 ? value : null
}

function toOptionalDate(value: unknown): string | null {
  return typeof value === 'string' && DATE_PATTERN.test(value) ? value : null
}

function sanitizeSort(medium: SavedViewMedium, raw: unknown, fallback: LibrarySort): LibrarySort {
  const source = (raw ?? {}) as Record<string, unknown>
  const column = LIBRARY_SORT_COLUMNS.includes(source.column as LibrarySort['column'])
    ? (source.column as LibrarySort['column'])
    : fallback.column
  const direction = source.direction === 'asc' ? 'asc' : source.direction === 'desc' ? 'desc' : fallback.direction

  const rated = medium !== 'artworks'
  const hasYear = medium !== 'series'
  if ((column === 'rating' && !rated) || (column === 'year' && !hasYear)) {
    return fallback
  }
  return { column, direction }
}

/**
 * Conversion du schéma v1 (0.4.21) : { view, mediumFilter, filters } où view
 * était une clé intégrée. Le préset intégré correspondant fournit le tri et
 * les filtres de base, fusionnés avec les filtres persistés.
 */
function fromV1Criteria(medium: SavedViewMedium, raw: Record<string, unknown>): Record<string, unknown> {
  const builtin = [...RATED_BUILTIN_VIEWS, ...UNRATED_BUILTIN_VIEWS].find(
    (view) => view.id === raw.view,
  )
  const fallback: LibraryViewDefinition = medium === 'artworks'
    ? UNRATED_BUILTIN_VIEWS[0]
    : RATED_BUILTIN_VIEWS[0]
  const preset = builtin ?? fallback
  const rawFilters = (raw.filters ?? {}) as Record<string, unknown>
  return {
    sort: preset.sort,
    mediumFilter: raw.mediumFilter,
    filters: {
      ...preset.filters,
      ...rawFilters,
      // En v1, la vue Favoris portait la restriction : elle survit à la conversion.
      favoritesOnly: preset.filters.favoritesOnly || rawFilters.favoritesOnly === true,
    },
  }
}

/**
 * Ramène un critère lu (JSON persisté, schéma v1 ou v2, éventuellement
 * incomplet) dans le contrat courant du médium. Aucune donnée invalide ne
 * survit : statut inconnu, note hors borne, tri interdit ou critère sans
 * colonne retombent sur les valeurs neutres. C'est ce qui permet à une vue
 * enregistrée de rester applicable après une évolution du schéma.
 */
export function sanitizeSavedViewCriteria(medium: SavedViewMedium, raw: unknown): SavedViewCriteria {
  let source = (raw ?? {}) as Record<string, unknown>
  if ('view' in source && !('sort' in source)) {
    source = fromV1Criteria(medium, source)
  }
  const rawFilters = (source.filters ?? {}) as Record<string, unknown>
  const fallbackSort: LibrarySort = { column: 'title', direction: 'asc' }

  const statuses = MEDIUM_STATUSES[medium]
  const rawStatus = toOptionalString(rawFilters.status)
  const status = rawStatus === 'all' || statuses.includes(rawStatus) ? rawStatus : 'all'

  const rawMediumFilter = toOptionalString(source.mediumFilter)
  const allowedMediumFilters = MEDIUM_FILTERS[medium]
  const mediumFilter =
    medium === 'games'
      ? rawMediumFilter || 'all'
      : allowedMediumFilters.includes(rawMediumFilter)
        ? rawMediumFilter
        : 'all'

  const filters: LibraryFilters = normalizeLibraryFilters({
    status,
    favoritesOnly: rawFilters.favoritesOnly === true,
    minRating: medium === 'artworks' ? null : toOptionalRating(rawFilters.minRating),
    year: medium === 'series' ? null : toOptionalYear(rawFilters.year),
    personalDateFrom: toOptionalDate(rawFilters.personalDateFrom),
    specificText: toOptionalString(rawFilters.specificText),
    location: medium === 'artworks' ? toOptionalString(rawFilters.location) : '',
    exhibition: medium === 'artworks' ? toOptionalString(rawFilters.exhibition) : '',
  })

  return { sort: sanitizeSort(medium, source.sort, fallbackSort), mediumFilter, filters }
}

/** Sérialisation du schéma v2 : un document JSON borné, jamais de SQL. */
export function serializeSavedViewCriteria(criteria: SavedViewCriteria): string {
  return JSON.stringify({
    sort: criteria.sort,
    mediumFilter: criteria.mediumFilter,
    filters: criteria.filters,
  })
}

/** Lecture tolérante : un JSON corrompu retombe sur le critère neutre du médium. */
export function deserializeSavedViewCriteria(medium: SavedViewMedium, json: string): SavedViewCriteria {
  try {
    return sanitizeSavedViewCriteria(medium, JSON.parse(json))
  } catch {
    return sanitizeSavedViewCriteria(medium, null)
  }
}
