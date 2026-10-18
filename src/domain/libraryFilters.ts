/**
 * Critères de filtre avancés des bibliothèques (jalon 0.4.20).
 *
 * Un même schéma borné décrit les critères combinables avec la recherche
 * textuelle et la vue active (qui porte l'ordre de tri). Chaque médium
 * n'expose que les champs réellement utiles de son modèle :
 * - statut : valeur exacte du médium, ou 'all' ;
 * - groupe de statut : intention abstraite ('pending' = à voir, 'inProgress'
 *   = en cours, 'consumed' = déjà vu/lu/joué) traduite en valeurs propres au
 *   médium par la couche SQL (jalon 0.6.8, vues intégrées sémantiques) ;
 * - favori : coups de cœur uniquement ;
 * - note minimale : médiums notés uniquement (jamais l'Art) ;
 * - année : année exacte de l'œuvre, quand la colonne existe ;
 * - date personnelle : visionnage, lecture, jeu ou découverte à partir du… ;
 * - texte spécifique : réalisation (Films), auteur (Livres) ou artiste (Art) ;
 * - lieu et exposition : Art uniquement.
 *
 * Les catégories Série/Livre, plateformes Jeux et formes Art restent des
 * filtres dédiés hors du panneau : interrupteur de catégories pour Séries et
 * Livres, panneau pour plateformes Jeux et formes Art.
 */
export type LibraryStatusGroup = 'pending' | 'inProgress' | 'consumed'

export const LIBRARY_STATUS_GROUPS: readonly LibraryStatusGroup[] = ['pending', 'inProgress', 'consumed']

export type LibraryFilters = {
  status: string | 'all'
  /** Groupe de statut abstrait porté par une vue intégrée ; null sinon. */
  statusGroup: LibraryStatusGroup | null
  favoritesOnly: boolean
  minRating: number | null
  year: number | null
  personalDateFrom: string | null
  specificText: string
  location: string
  exhibition: string
}

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  status: 'all',
  statusGroup: null,
  favoritesOnly: false,
  minRating: null,
  year: null,
  personalDateFrom: null,
  specificText: '',
  location: '',
  exhibition: '',
}

export function normalizeLibraryFilters(filters: Partial<LibraryFilters> | undefined): LibraryFilters {
  return { ...EMPTY_LIBRARY_FILTERS, ...filters }
}

export function countActiveFilters(filters: LibraryFilters): number {
  let count = 0
  if (filters.status !== 'all') count += 1
  // Test de vérité volontaire : tolère les objets construits sans la clé.
  if (filters.statusGroup) count += 1
  if (filters.favoritesOnly) count += 1
  if (filters.minRating !== null) count += 1
  if (filters.year !== null) count += 1
  if (filters.personalDateFrom !== null) count += 1
  if (filters.specificText.trim() !== '') count += 1
  if (filters.location.trim() !== '') count += 1
  if (filters.exhibition.trim() !== '') count += 1
  return count
}

export function hasActiveFilters(filters: LibraryFilters): boolean {
  return countActiveFilters(filters) > 0
}

/** Compteur accordé du bouton Filtrer : « 1 critère actif », « 2 critères actifs ». */
export function activeCriteriaLabel(count: number): string {
  return count > 1 ? `${count} critères actifs` : `${count} critère actif`
}

export type FilterChip = { key: keyof LibraryFilters; label: string }

/** Récapitulatif lisible des critères actifs, affiché au-dessus des résultats. */
export function describeActiveFilters(
  filters: LibraryFilters,
  vocabulary: {
    statusLabel: (status: string) => string
    personalDateLabel: string
    specificTextLabel: string
    statusGroupLabels?: Partial<Record<LibraryStatusGroup, string>>
  },
): FilterChip[] {
  const chips: FilterChip[] = []
  if (filters.status !== 'all') {
    chips.push({ key: 'status', label: `Statut : ${vocabulary.statusLabel(filters.status)}` })
  }
  if (filters.statusGroup !== null && filters.status === 'all') {
    const groupLabels: Record<LibraryStatusGroup, string> = {
      pending: 'À voir',
      inProgress: 'En cours',
      consumed: 'Déjà vu',
      ...(vocabulary.statusGroupLabels ?? {}),
    }
    chips.push({ key: 'statusGroup', label: groupLabels[filters.statusGroup] })
  }
  if (filters.favoritesOnly) {
    chips.push({ key: 'favoritesOnly', label: 'Coups de cœur' })
  }
  if (filters.minRating !== null) {
    chips.push({ key: 'minRating', label: `Note ≥ ${filters.minRating}` })
  }
  if (filters.year !== null) {
    chips.push({ key: 'year', label: `Année ${filters.year}` })
  }
  if (filters.personalDateFrom !== null) {
    chips.push({ key: 'personalDateFrom', label: `${vocabulary.personalDateLabel} dès le ${filters.personalDateFrom}` })
  }
  if (filters.specificText.trim() !== '') {
    chips.push({ key: 'specificText', label: `${vocabulary.specificTextLabel} : ${filters.specificText.trim()}` })
  }
  if (filters.location.trim() !== '') {
    chips.push({ key: 'location', label: `Lieu : ${filters.location.trim()}` })
  }
  if (filters.exhibition.trim() !== '') {
    chips.push({ key: 'exhibition', label: `Exposition : ${filters.exhibition.trim()}` })
  }
  return chips
}

/** Retire un seul critère identifié par sa puce, sans toucher aux autres. */
export function clearFilterChip(filters: LibraryFilters, key: keyof LibraryFilters): LibraryFilters {
  return { ...filters, [key]: EMPTY_LIBRARY_FILTERS[key] }
}

/**
 * Fusionne les filtres de base d'une vue avec les filtres choisis à la volée
 * (jalon 0.4.23) : chaque critère renseigné à la volée l'emporte sur la base,
 * et le favori se cumule — un filtre « favoris » ne peut pas annuler la vue
 * Favoris, il s'applique à l'intérieur d'elle. Le groupe de statut suit la
 * base de la vue sauf si un statut précis est choisi à la volée (le choix
 * précis raffine la vue, il ne la contredit pas).
 */
export function mergeLibraryFilters(base: LibraryFilters, extra: LibraryFilters): LibraryFilters {
  return {
    status: extra.status !== 'all' ? extra.status : base.status,
    statusGroup: extra.status !== 'all' ? null : base.statusGroup,
    favoritesOnly: base.favoritesOnly || extra.favoritesOnly,
    minRating: extra.minRating ?? base.minRating,
    year: extra.year ?? base.year,
    personalDateFrom: extra.personalDateFrom ?? base.personalDateFrom,
    specificText: extra.specificText.trim() !== '' ? extra.specificText : base.specificText,
    location: extra.location.trim() !== '' ? extra.location : base.location,
    exhibition: extra.exhibition.trim() !== '' ? extra.exhibition : base.exhibition,
  }
}
