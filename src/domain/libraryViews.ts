import { EMPTY_LIBRARY_FILTERS, mergeLibraryFilters, type LibraryFilters } from './libraryFilters.ts'

/**
 * Modèle unifié des vues de bibliothèque (jalon 0.4.23).
 *
 * Une vue est un seul concept : un préset { filtres, tri }. Les vues
 * intégrées et les vues enregistrées par l'utilisateur relèvent exactement du
 * même modèle — seule leur provenance change. Les filtres et le tri choisis à
 * la volée s'appliquent par-dessus la vue active : dans Favoris, un filtre
 * « avant 2019 » agit à l'intérieur des favoris, et un tri explicite remplace
 * celui du préset.
 *
 * Les vues intégrées conservent des groupes de statut abstraits, traduits en
 * valeurs propres au médium par la couche SQL. Leur ordre de présentation est
 * commun : « Tous » ouvre la rangée, puis les vues propres au médium et le
 * socle sémantique. Cet ordre ne définit pas la vue d'ouverture de la
 * bibliothèque, qui reste la watchlist — sauf pour l'Art, qui ouvre sur
 * « Favori » puisque cette collection n'a ni statut ni progression.
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
  /** Identifiant stable : clé intégrée ('watchlist', 'recent'…) ou id de vue enregistrée. */
  id: string
  name: string
  filters: LibraryFilters
  sort: LibrarySort
  builtin: boolean
}

/**
 * Vue « à voir » (0.6.8) : tout ce qui n'a pas encore été consommé.
 * Le groupe de statut est traduit en valeurs propres au médium par la couche
 * SQL ; l'intitulé de la vue reste générique côté modèle.
 */
const WATCHLIST_VIEW: LibraryViewDefinition = {
  id: 'watchlist',
  name: 'À voir',
  filters: { ...EMPTY_LIBRARY_FILTERS, statusGroup: 'pending' },
  sort: { column: 'title', direction: 'asc' },
  builtin: true,
}

/** Vue « en cours » (0.6.8) : séries attendues, lectures et parties en cours. */
const IN_PROGRESS_VIEW: LibraryViewDefinition = {
  id: 'in-progress',
  name: 'En cours',
  filters: { ...EMPTY_LIBRARY_FILTERS, statusGroup: 'inProgress' },
  sort: { column: 'title', direction: 'asc' },
  builtin: true,
}

/**
 * Vue « Récents » (0.6.8, précisée) : uniquement ce qui a déjà été vu, lu ou
 * joué (abandonné compris), du plus récemment consommé au plus ancien.
 * 0.6.11 : libellé au singulier (« Récent »), elle devient la vue principale
 * des Films.
 */
const RECENT_VIEW: LibraryViewDefinition = {
  id: 'recent',
  name: 'Récent',
  filters: { ...EMPTY_LIBRARY_FILTERS, statusGroup: 'consumed' },
  sort: { column: 'recency', direction: 'desc' },
  builtin: true,
}

const FAVORITES_VIEW: LibraryViewDefinition = {
  id: 'favorites',
  name: 'Favori',
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

/**
 * Vue inventaire « Tous » : l'intégralité de la collection, sans filtre
 * métier. Elle ouvre toujours la rangée visible, sans être pour autant la vue
 * sélectionnée au démarrage d'une bibliothèque.
 */
export const ALL_VIEW: LibraryViewDefinition = {
  id: 'all',
  name: 'Tous',
  filters: EMPTY_LIBRARY_FILTERS,
  sort: { column: 'title', direction: 'asc' },
  builtin: true,
}

/** Films et Jeux : Tous, puis watchlist, Récent, Favori et Classement. */
export const RATED_BUILTIN_VIEWS: readonly LibraryViewDefinition[] = [
  ALL_VIEW,
  WATCHLIST_VIEW,
  RECENT_VIEW,
  FAVORITES_VIEW,
  RANKING_VIEW,
]

/** Séries et Livres : la vue En cours propre au médium reste entre la watchlist et le socle commun. */
export const PROGRESS_BUILTIN_VIEWS: readonly LibraryViewDefinition[] = [
  ALL_VIEW,
  WATCHLIST_VIEW,
  IN_PROGRESS_VIEW,
  RECENT_VIEW,
  FAVORITES_VIEW,
  RANKING_VIEW,
]

/**
 * L'Art n'a ni note, ni statut, ni progression : ni « En cours », ni
 * « Classement », ni watchlist sémantique. La rangée visible commence malgré
 * tout par « Tous », puis suit le socle « Récent » / « Favori ».
 */
export const UNRATED_BUILTIN_VIEWS: readonly LibraryViewDefinition[] = [
  ALL_VIEW,
  RECENT_VIEW,
  FAVORITES_VIEW,
]

/**
 * Intitulés par médium de la watchlist : « À voir » pour Films et Séries,
 * « À lire » pour Livres, « À jouer » pour Jeux, « À découvrir » pour l'Art.
 * Le préset sous-jacent est toujours le même.
 */
export const WATCHLIST_LABELS: Record<'films' | 'series' | 'books' | 'games' | 'artworks', string> = {
  films: 'À voir',
  series: 'À voir',
  books: 'À lire',
  games: 'À jouer',
  artworks: 'À découvrir',
}

/** Remplace l'intitulé générique de la watchlist par celui du médium. */
export function titledBuiltinViews(
  views: readonly LibraryViewDefinition[],
  medium: keyof typeof WATCHLIST_LABELS,
): readonly LibraryViewDefinition[] {
  return views.map((view) => view.id === 'watchlist' ? { ...view, name: WATCHLIST_LABELS[medium] } : view)
}

export function builtinViewsForMedium(rated: boolean): readonly LibraryViewDefinition[] {
  return rated ? RATED_BUILTIN_VIEWS : UNRATED_BUILTIN_VIEWS
}

/**
 * Identifiants de vue d'ouverture. Ils sont indépendants de l'ordre visible :
 * les quatre bibliothèques avec watchlist démarrent dessus, Art démarre sur
 * Favori. Conserver deux constantes évite qu'une réorganisation de la rangée
 * change silencieusement la vue sélectionnée.
 */
export const WATCHLIST_DEFAULT_VIEW_ID = 'watchlist'
export const ARTWORKS_DEFAULT_VIEW_ID = 'favorites'

/** Nom de la vue d'ouverture selon le médium. */
export function defaultViewIdForMedium(medium: keyof typeof WATCHLIST_LABELS): string {
  return medium === 'artworks' ? ARTWORKS_DEFAULT_VIEW_ID : WATCHLIST_DEFAULT_VIEW_ID
}

/** Retrouve la vue d'ouverture titrée d'un médium sans lui faire hériter de l'ordre visible. */
export function defaultBuiltinViewForMedium(
  views: readonly LibraryViewDefinition[],
  medium: keyof typeof WATCHLIST_LABELS,
): LibraryViewDefinition {
  return builtinViewById(titledBuiltinViews(views, medium), defaultViewIdForMedium(medium))
}

/** Retrouve une vue intégrée par identifiant, avec repli sur la première. */
export function builtinViewById(views: readonly LibraryViewDefinition[], id: string): LibraryViewDefinition {
  return views.find((view) => view.id === id) ?? views[0]
}

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
