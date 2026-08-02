import { invoke } from '@tauri-apps/api/core'

/** Candidat RAWG borné (jalon 0.4.28). La clé vit côté backend, jamais ici. */
export type RawgGameCandidate = {
  gameId: number
  title: string
  releaseYear: number | null
  coverUrl: string | null
}

/** Présentation détaillée d'un jeu pour le préremplissage du formulaire. */
export type RawgGamePresentation = {
  gameId: number
  title: string
  developer: string | null
  releaseYear: number | null
  coverUrl: string | null
}

export function searchRawgGames(query: string): Promise<RawgGameCandidate[]> {
  return invoke('search_rawg_games', { query })
}

export function previewRawgGame(candidate: RawgGameCandidate): Promise<RawgGamePresentation> {
  return invoke('preview_rawg_game', {
    gameId: candidate.gameId,
    title: candidate.title,
    releaseYear: candidate.releaseYear,
    coverUrl: candidate.coverUrl,
  })
}
