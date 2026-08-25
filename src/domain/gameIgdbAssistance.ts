import type { IgdbGamePresentation } from '../data/igdbService.ts'
import { EMPTY_GAME_FORM, type GameFormValues } from './gameForm.ts'

/**
 * Préremplissage Jeux depuis IGDB : la présentation n'alimente que les champs
 * éditoriaux du formulaire — jamais le statut, la note, le coup de cœur ni la
 * plateforme, qui est un choix personnel (la plateforme où l'on joue n'est pas
 * une donnée du jeu).
 */
export function igdbPresentationToInitialValues(presentation: IgdbGamePresentation): GameFormValues {
  return {
    ...EMPTY_GAME_FORM,
    title: presentation.title,
    developer: presentation.developer ?? '',
    year: presentation.releaseYear !== null ? String(presentation.releaseYear) : '',
    coverUrl: presentation.coverUrl ?? '',
  }
}
