import type { TmdbSeriesPresentation } from '../data/tmdbService.ts'
import { EMPTY_SERIES_FORM, type SeriesFormValues } from './seriesForm.ts'

/**
 * Préremplissage Séries depuis TMDB (jalon 0.4.26) : la présentation TV
 * n'alimente que les champs éditoriaux du formulaire — jamais le statut, la
 * note, le coup de cœur ni les saisons vues, qui restent des données
 * personnelles. Le total de saisons connu est proposé, modifiable, et la
 * période de diffusion arrive avec ses deux années (30 octobre 2026).
 */
export function seriesPresentationToInitialValues(presentation: TmdbSeriesPresentation): SeriesFormValues {
  return {
    ...EMPTY_SERIES_FORM,
    title: presentation.title,
    showrunner: presentation.showrunners.join(', '),
    casting: presentation.cast.join(', '),
    summary: presentation.synopsis ?? '',
    seasonsTotal: presentation.seasonsTotal !== null ? String(presentation.seasonsTotal) : '',
    posterUrl: presentation.posterUrl ?? '',
    firstAirYear: presentation.firstAirYear !== null ? String(presentation.firstAirYear) : '',
    lastAirYear: presentation.lastAirYear !== null ? String(presentation.lastAirYear) : '',
  }
}
