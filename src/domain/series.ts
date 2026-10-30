export const SERIES_CATEGORIES = ['série télé', 'animation'] as const

export type SeriesCategory = (typeof SERIES_CATEGORIES)[number]

export const SERIES_CATEGORY_LABELS: Record<SeriesCategory, string> = {
  'série télé': 'Série télé',
  animation: 'Animation',
}

export const SERIES_STATUSES = ['à voir', 'en cours', 'abandonnée', 'vue'] as const

export type SeriesStatus = (typeof SERIES_STATUSES)[number]

export const SERIES_STATUS_LABELS: Record<SeriesStatus, string> = {
  'à voir': 'À voir',
  'en cours': 'En cours',
  abandonnée: 'Abandonnée',
  vue: 'Vue',
}

export type Series = {
  id: string
  profileId: string
  title: string
  showrunner: string | null
  casting: string | null
  summary: string | null
  category: SeriesCategory
  status: SeriesStatus
  rating: number | null
  isFavorite: boolean
  seasonsSeen: number | null
  seasonsTotal: number | null
  progressUpdatedAt: string | null
  startedAt: string | null
  posterUrl: string | null
  /** Bannière 16:9 (v7) : une adresse d'image, `null` quand aucune n'est choisie. */
  bannerUrl: string | null
  /** Début de diffusion (v8) : l'année du premier épisode, `null` si inconnue. */
  firstAirYear: number | null
  /** Fin de diffusion (v8) : `null` tant que la série continue ou si inconnue. */
  lastAirYear: number | null
  personalNote: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Les formats d'import peuvent contenir des chaînes facultatives vides. La
 * donnée locale canonique les représente par null. Cette fonction ne retire
 * aucun caractère d'une chaîne non vide.
 */
export function normalizeSeries(series: Series): Series {
  return {
    ...series,
    showrunner: emptyOptionalTextToNull(series.showrunner),
    casting: emptyOptionalTextToNull(series.casting),
    summary: emptyOptionalTextToNull(series.summary),
    progressUpdatedAt: emptyOptionalTextToNull(series.progressUpdatedAt),
    startedAt: emptyOptionalTextToNull(series.startedAt),
    posterUrl: emptyOptionalTextToNull(series.posterUrl),
    bannerUrl: emptyOptionalTextToNull(series.bannerUrl),
    firstAirYear: series.firstAirYear ?? null,
    lastAirYear: series.lastAirYear ?? null,
    personalNote: emptyOptionalTextToNull(series.personalNote),
  }
}

function emptyOptionalTextToNull(value: string | null | undefined): string | null {
  return value === '' || value === undefined ? null : value
}

/** Tiret demi-cadratin : la période de diffusion se lit « 2017–2020 ». */
const AIR_PERIOD_DASH = '–'

/**
 * Période de diffusion d'une série, telle que la fiche l'affiche (30 octobre
 * 2026). Rien de connu : chaîne vide, donc rien à montrer. Début seul : la
 * série continue, « 2022– ». Une seule année : « 2017 ». Deux années
 * différentes : « 2017–2020 ». Une fin sans début n'a pas de sens : seule
 * l'année connue s'affiche. Une fin antérieure au début — donnée incohérente
 * qu'aucune saisie ne produit — se lit comme une fin inconnue plutôt que comme
 * un intervalle à l'envers.
 */
export function formatAirPeriod(firstAirYear: number | null, lastAirYear: number | null): string {
  if (firstAirYear === null) return lastAirYear === null ? '' : String(lastAirYear)
  if (lastAirYear === null || lastAirYear < firstAirYear) return `${firstAirYear}${AIR_PERIOD_DASH}`
  if (lastAirYear === firstAirYear) return String(firstAirYear)
  return `${firstAirYear}${AIR_PERIOD_DASH}${lastAirYear}`
}
