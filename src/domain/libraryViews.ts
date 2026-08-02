import { EMPTY_LIBRARY_FILTERS, mergeLibraryFilters, type LibraryFilters } from './libraryFilters.ts'

/**
 * Modèle unifié des vues de bibliothèque (jalon 0.4.23).
 *
 * Une vue est un seul concept : un préset { filtres, tri }. Les vues
 * intégrées (Tous, Récents, Favoris, Classement) et les vues enregistrées
 * par l'utilisateur relèvent exactement du même modèle — seule leur
 * provenance change. Les filtres et le tri choisis à la volée s'appliquent
 * par-dessus la vue active : dans Favoris, un filtre « avant 2019 » agit à
 * l'intérieur des favoris, et un tri explicite remplace celui du préset.
 */

export const LIBRARY_SORT_COLUMNS = ['title', 'recency', 'rating', 'year', 'personalDate', 'added'] as const

export type LibrarySortColumn = (typeof LIBRARY_SORT_COLUMNS)[number]

export type LibrarySortDirection = 'asc' | 'desc'

export type LibrarySort = {
  column: LibrarySortColumn
  direction: LibrarySortDirection
}

export const LIBRARY_SORT_COLUMN_LABELS: Record<LibrarySortColumn, string> = {
  title: 'Titre',
  recency: 'Récence',
  rating: 'Note',
  year: 'Année',
  personalDate: 'Date personnelle',
  added: 'Ajout',
}

export const LIBRARY_SORT_DIRECTION_LABELS: Record<LibrarySortDirection, string> = {
  asc: 'Croissant',
  desc: 'Décroissant',
}

export type LibraryViewDefinition = {
  /** Identifiant stable : clé intégrée ('all', 'recent'…) ou id de vue enregistrée. */
  id: string
  name: string
  filters: LibraryFilters
  sort: LibrarySort
  builtin: boolean
}

const ALL_VIEW: LibraryViewDefinition = {
  id: 'all',
  name: 'Tous',
  filters: EMPTY_LIBRARY_FILTERS,
  sort: { column: 'title', direction: 'asc' },
  builtin: true,
}

const RECENT_VIEW: LibraryViewDefinition = {
  id: 'recent',
  name: 'Récents',
  filters: EMPTY_LIBRARY_FILTERS,
  sort: { column: 'recency', direction: 'desc' },
  builtin: true,
}

const FAVORITES_VIEW: LibraryViewDefinition = {
  id: 'favorites',
  name: 'Favoris',
  filters: { ...EMPTY_LIBRARY_FILTERS, favoritesOnly: true },
  sort: { column: 'title', direction: 'asc' },
  builtin: true,
}

const RANKING_VIEW: LibraryViewDefinition = {
  id: 'ranking',
  name: 'Classement',
  filters: EMPTY_LIBRARY_FILTERS,
  sort: { column: 'rating', direction: 'desc' },
  builtin: true,
}

/** Vues intégrées d'un médium noté : Tous, Récents, Favoris, Classement. */
export const RATED_BUILTIN_VIEWS: readonly LibraryViewDefinition[] = [
  ALL_VIEW,
  RECENT_VIEW,
  FAVORITES_VIEW,
  RANKING_VIEW,
]

/** L'Art n'a pas de note : aucune vue intégrée ni tri ne repose sur la note. */
export const UNRATED_BUILTIN_VIEWS: readonly LibraryViewDefinition[] = [
  ALL_VIEW,
  RECENT_VIEW,
  FAVORITES_VIEW,
]

export function builtinViewsForMedium(rated: boolean): readonly LibraryViewDefinition[] {
  return rated ? RATED_BUILTIN_VIEWS : UNRATED_BUILTIN_VIEWS
}

export const DEFAULT_VIEW_ID = 'all'

/** Colonnes de tri réellement disponibles pour un médium. */
export type LibrarySortCapabilities = {
  rating: boolean
  year: boolean
}

export function sortColumnsForMedium(capabilities: LibrarySortCapabilities): readonly LibrarySortColumn[] {
  return LIBRARY_SORT_COLUMNS.filter((column) => {
    if (column === 'rating') return capabilities.rating
    if (column === 'year') return capabilities.year
    return true
  })
}

/**
 * Requête effective d'une bibliothèque : la vue active fournit les filtres de
 * base et le tri par défaut ; les filtres choisis à la volée s'y ajoutent et
 * un tri explicite le remplace.
 */
export type ResolvedLibraryQuery = {
  filters: LibraryFilters
  sort: LibrarySort
}

export function resolveLibraryQuery(
  view: LibraryViewDefinition,
  extraFilters: LibraryFilters,
  sortOverride: LibrarySort | null,
): ResolvedLibraryQuery {
  return {
    filters: mergeLibraryFilters(view.filters, extraFilters),
    sort: sortOverride ?? view.sort,
  }
}
