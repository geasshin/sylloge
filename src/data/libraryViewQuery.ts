import type { LibrarySort } from '../domain/libraryViews.ts'
import { normalizeLibraryFilters, type LibraryFilters, type LibraryStatusGroup } from '../domain/libraryFilters.ts'

/**
 * Traduction des groupes de statut abstraits (0.6.8) en valeurs concrètes de
 * chaque médium, colonnes documentées incluses. La liste blanche est partagée
 * par tous les médiums : une valeur qui n'existe pas chez un médium n'y
 * matche jamais aucune ligne, la clause reste donc exacte partout.
 */
export const STATUS_GROUP_COLUMNS: Record<LibraryStatusGroup, { column: string; values: string[] }> = {
  pending: {
    column: 'status',
    values: ['à découvrir', 'en attente', 'à voir', 'à lire', 'à jouer'],
  },
  inProgress: {
    column: 'status',
    values: ['en cours'],
  },
  consumed: {
    column: 'status',
    values: ['terminé', 'abandonné', 'vue', 'abandonnée', 'lu', 'joué', 'regardé', 'découverte'],
  },
}

/**
 * Colonnes réellement utilisables d'un médium pour le filtrage et le tri.
 * Une colonne absente signifie que le critère n'existe pas pour ce médium :
 * il n'est ni exposé ni appliqué.
 */
export type LibraryQueryColumns = {
  rating: boolean
  year: boolean
  personalDateColumn: string | null
  specificTextColumn: string | null
  locationColumn: string | null
  exhibitionColumn: string | null
  /** Colonne de progression métier (saisons, tomes) alimentant la récence. */
  progressColumn: string | null
}

/**
 * Traduction SQL documentée d'un tri de bibliothèque (jalon 0.4.23).
 *
 * - Titre : collation insensible à la casse, puis création pour stabilité ;
 * - Récence : progression métier horodatée si elle existe (saisons, tomes),
 *   sinon dernière modification ;
 * - Note : absences de note en fin de liste, quel que soit le sens ;
 * - Année et date personnelle : absences en fin de liste également ;
 * - Ajout : horodatage de création.
 *
 * Le tri est résolu en colonnes documentées, jamais par tri du tableau React
 * après lecture.
 */
export function librarySortOrderBy(sort: LibrarySort, columns: LibraryQueryColumns): string {
  const direction = sort.direction === 'desc' ? 'DESC' : 'ASC'
  const titleTie = 'title COLLATE NOCASE ASC'

  switch (sort.column) {
    case 'recency': {
      const recencyColumn = columns.progressColumn
        ? `COALESCE(${columns.progressColumn}, updated_at)`
        : 'updated_at'
      return `${recencyColumn} ${direction}, ${titleTie}`
    }
    case 'rating':
      return `rating IS NULL ASC, rating ${direction}, ${titleTie}`
    case 'year':
      return `year IS NULL ASC, year ${direction}, ${titleTie}`
    case 'personalDate': {
      const dateColumn = columns.personalDateColumn ?? 'updated_at'
      return `${dateColumn} IS NULL ASC, ${dateColumn} ${direction}, ${titleTie}`
    }
    case 'added':
      return `created_at ${direction}, ${titleTie}`
    case 'title':
      return `title COLLATE NOCASE ${direction}, created_at ASC`
  }
}

/**
 * Ajoute les critères de filtre à une requête en cours de construction. Toutes
 * les valeurs sont liées en paramètres, jamais interpolées ; les jokers LIKE
 * du texte libre sont échappés par l'appelant via escapeLikePattern.
 */
export function appendLibraryFilterClauses(
  rawFilters: Partial<LibraryFilters> | undefined,
  columns: LibraryQueryColumns,
  clauses: string[],
  bindValues: unknown[],
  escapeLike: (value: string) => string,
): void {
  const filters = normalizeLibraryFilters(rawFilters)

  // Groupe de statut d'une vue intégrée (0.6.8) : traduit en liste blanche
  // paramétrée. Un statut précis choisi à la volée reste prioritaire.
  if (filters.statusGroup !== null && filters.status === 'all') {
    const group = STATUS_GROUP_COLUMNS[filters.statusGroup]
    if (group.values.length > 0) {
      const placeholders = group.values.map((value) => {
        bindValues.push(value)
        return `$${bindValues.length}`
      })
      clauses.push(`${group.column} IN (${placeholders.join(', ')})`)
    }
  }

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
