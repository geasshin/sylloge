import type { Series, SeriesCategory } from './series.ts'
import type { SavedView } from './savedViews.ts'

/** Deux bibliothèques d’interface, une table series et ses catégories inchangées. */
export type SeriesLibraryKey = 'series' | 'anime'

/** Toutes les anciennes fiches animation rejoignent Animation japonaise. */
export function seriesLibraryForCategory(category: SeriesCategory): SeriesLibraryKey {
  return category === 'animation' ? 'anime' : 'series'
}

export function seriesForLibrary(series: Series[], library: SeriesLibraryKey): Series[] {
  return series.filter((entry) => seriesLibraryForCategory(entry.category) === library)
}

/**
 * Une liste vide signifierait « toutes les catégories » pour SQLite. Un filtre
 * étranger retombe donc sur la catégorie de la bibliothèque, jamais sur [].
 */
export function seriesLibraryCategories(library: SeriesLibraryKey, stored = 'all'): SeriesCategory[] {
  const categories: SeriesCategory[] = library === 'anime' ? ['animation'] : ['série télé']
  if (stored === 'all') return categories
  const selected = categories.filter((category) => stored.split(',').includes(category))
  return selected.length > 0 ? selected : categories
}

/** Le schéma v2 sait déjà stocker animation, série télé ou all : pas de migration. */
export function seriesLibraryStoredFilter(library: SeriesLibraryKey, categories: readonly SeriesCategory[]): string {
  if (library === 'anime') return 'animation'
  const own = seriesLibraryCategories('series').filter((category) => categories.includes(category))
  return own.length === 0 || own.length === seriesLibraryCategories('series').length ? 'all' : own.join(',')
}

/** Une ancienne vue animation rejoint Animation japonaise ; les autres restent dans Séries. */
export function seriesViewBelongsToLibrary(view: SavedView, library: SeriesLibraryKey): boolean {
  return view.medium === 'series' && (view.criteria.mediumFilter === 'animation') === (library === 'anime')
}
