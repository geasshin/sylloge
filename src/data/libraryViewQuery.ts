import type { LibraryView } from '../domain/libraryViews.ts'
import { normalizeLibraryFilters, type LibraryFilters } from '../domain/libraryFilters.ts'

/**
 * Traduction SQL documentée des vues de bibliothèque (jalon 0.4.19).
 *
 * - Tous : `title COLLATE NOCASE ASC, created_at ASC` — ordre canonique stable ;
 * - Récents : dernière progression métier (`progress_updated_at` pour Séries et
 *   Livres) si elle existe, sinon `updated_at`, décroissant, puis titre ;
 * - Favoris : restriction `is_favorite = 1`, même ordre que Tous ;
 * - Classement : `rating` décroissant, les absences de note après les notes,
 *   puis titre — ordre stable.
 *
 * Les vues sont résolues en colonnes documentées, jamais par tri du tableau
 * React après lecture.
 */
export function libraryViewOrderBy(view: LibraryView, options: { progressColumn?: string } = {}): string {
  switch (view) {
    case 'recent': {
      const recencyColumn = options.progressColumn
        ? `COALESCE(${options.progressColumn}, updated_at)`
        : 'updated_at'
      return `${recencyColumn} DESC, title COLLATE NOCASE ASC`
    }
    case 'ranking':
      return 'rating IS NULL ASC, rating DESC, title COLLATE NOCASE ASC'
    case 'all':
    case 'favorites':
      return 'title COLLATE NOCASE ASC, created_at ASC'
  }
}

/** Restriction WHERE ajoutée par la vue, ou null quand la vue ne filtre pas. */
export function libraryViewWhereClause(view: LibraryView): string | null {
  return view === 'favorites' ? 'is_favorite = 1' : null
}

/**
 * Colonnes réellement filtrables d'un médium (jalon 0.4.20). Une colonne
 * absente signifie que le critère n'existe pas pour ce médium : il n'est ni
 * exposé ni appliqué.
 */
export type LibraryFilterColumns = {
  rating: boolean
  year: boolean
  personalDateColumn: string | null
  specificTextColumn: string | null
  locationColumn: string | null
  exhibitionColumn: string | null
}

/**
 * Ajoute les critères avancés à une requête en cours de construction. Toutes
 * les valeurs sont liées en paramètres, jamais interpolées ; les jokers LIKE
 * du texte libre sont échappés par l'appelant via escapeLikePattern.
 */
export function appendLibraryFilterClauses(
  rawFilters: Partial<LibraryFilters> | undefined,
  columns: LibraryFilterColumns,
  clauses: string[],
  bindValues: unknown[],
  escapeLike: (value: string) => string,
): void {
  const filters = normalizeLibraryFilters(rawFilters)

  if (filters.status !== 'all') {
    bindValues.push(filters.status)
    clauses.push(`status = $${bindValues.length}`)
  }

  if (filters.favoritesOnly) {
    clauses.push('is_favorite = 1')
  }

  if (columns.rating && filters.minRating !== null) {
    bindValues.push(filters.minRating)
    clauses.push(`rating >= $${bindValues.length}`)
  }

  if (columns.year && filters.year !== null) {
    bindValues.push(filters.year)
    clauses.push(`year = $${bindValues.length}`)
  }

  if (columns.personalDateColumn && filters.personalDateFrom !== null) {
    bindValues.push(filters.personalDateFrom)
    clauses.push(`${columns.personalDateColumn} >= $${bindValues.length}`)
  }

  if (columns.specificTextColumn && filters.specificText.trim() !== '') {
    bindValues.push(`%${escapeLike(filters.specificText.trim())}%`)
    clauses.push(`${columns.specificTextColumn} COLLATE NOCASE LIKE $${bindValues.length} ESCAPE '\\'`)
  }

  if (columns.locationColumn && filters.location.trim() !== '') {
    bindValues.push(`%${escapeLike(filters.location.trim())}%`)
    clauses.push(`${columns.locationColumn} COLLATE NOCASE LIKE $${bindValues.length} ESCAPE '\\'`)
  }

  if (columns.exhibitionColumn && filters.exhibition.trim() !== '') {
    bindValues.push(`%${escapeLike(filters.exhibition.trim())}%`)
    clauses.push(`${columns.exhibitionColumn} COLLATE NOCASE LIKE $${bindValues.length} ESCAPE '\\'`)
  }
}
