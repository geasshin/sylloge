import type { LibraryView } from '../domain/libraryViews.ts'

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
