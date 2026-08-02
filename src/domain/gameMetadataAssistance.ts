import type { RawgGamePresentation } from '../data/rawgService.ts'
import { EMPTY_GAME_FORM, type GameFormValues } from './gameForm.ts'

/**
 * Préremplissage Jeux depuis RAWG (jalon 0.4.28) : la présentation n'alimente
 * que les champs éditoriaux du formulaire — jamais le statut, la note, le
 * coup de cœur ni la plateforme, qui est un choix personnel (la plateforme
 * RAWG liste les supports du jeu, pas celle où on y joue).
 */
export function gamePresentationToInitialValues(presentation: RawgGamePresentation): GameFormValues {
  return {
    ...EMPTY_GAME_FORM,
    title: presentation.title,
    developer: presentation.developer ?? '',
    year: presentation.releaseYear !== null ? String(presentation.releaseYear) : '',
    coverUrl: presentation.coverUrl ?? '',
  }
}
