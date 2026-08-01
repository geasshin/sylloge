import { ARTWORK_FORMS, ARTWORK_STATUSES } from './artwork.ts'
import { BOOK_CATEGORIES, BOOK_STATUSES } from './book.ts'
import { FILM_STATUSES } from './film.ts'
import { GAME_STATUSES } from './game.ts'
import { normalizeLibraryFilters, type LibraryFilters } from './libraryFilters.ts'
import { LIBRARY_VIEWS, type LibraryView } from './libraryViews.ts'
import { SERIES_CATEGORIES, SERIES_STATUSES } from './series.ts'

/**
 * Vues personnalisées enregistrées (jalon 0.4.21).
 *
 * Une vue enregistrée capture un couple filtres + tri : la vue active (qui
 * porte l'ordre), le filtre propre au médium (catégorie, plateforme ou forme)
 * et les critères avancés. La recherche textuelle libre reste éphémère et
 * n'est jamais enregistrée. Les vues sont isolées par profil et par médium,
 * et restent locales : elles n'entrent ni dans les snapshots ni dans les
 * exports (décision actée au brief).
 */
export const SAVED_VIEW_MEDIA = ['films', 'series', 'books', 'games', 'artworks'] as const

export type SavedViewMedium = (typeof SAVED_VIEW_MEDIA)[number]

export const SAVED_VIEW_SCHEMA_VERSION = 1

export const SAVED_VIEW_NAME_MAX_LENGTH = 80

export type SavedViewCriteria = {
  view: LibraryView
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

/** L'Art n'a pas de note : aucune vue enregistrée ne peut reposer sur le classement. */
export function assertSavedViewAllowed(medium: SavedViewMedium, criteria: SavedViewCriteria): void {
  if (medium === 'artworks' && criteria.view === 'ranking') {
    throw new Error('Une vue Classement n’existe pas pour l’Art, qui n’a pas de note.')
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

/**
 * Ramène un critère lu (JSON persisté, schéma éventuellement ancien ou
 * incomplet) dans le contrat courant du médium. Aucune donnée invalide ne
 * survit : statut inconnu, note hors borne ou critère sans colonne retombent
 * sur les valeurs neutres. C'est ce qui permet à une vue enregistrée de
 * rester applicable après une évolution du schéma.
 */
export function sanitizeSavedViewCriteria(medium: SavedViewMedium, raw: unknown): SavedViewCriteria {
  const source = (raw ?? {}) as Record<string, unknown>
  const rawFilters = (source.filters ?? {}) as Record<string, unknown>

  let view: LibraryView = LIBRARY_VIEWS.includes(source.view as LibraryView)
    ? (source.view as LibraryView)
    : 'all'
  if (medium === 'artworks' && view === 'ranking') {
    view = 'all'
  }

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

  return { view, mediumFilter, filters }
}

/** Sérialisation du schéma v1 : un document JSON borné, jamais de SQL. */
export function serializeSavedViewCriteria(criteria: SavedViewCriteria): string {
  return JSON.stringify({
    view: criteria.view,
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
