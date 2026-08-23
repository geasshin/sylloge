import { invoke } from '@tauri-apps/api/core'

/** Service Jeux IGDB (couvertures verticales), même contrat que le service RAWG. */

export type IgdbGameCandidate = {
  gameId: number
  title: string
  releaseYear: number | null
  coverUrl: string | null
}

export type IgdbGamePresentation = {
  gameId: number
  title: string
  developer: string | null
  releaseYear: number | null
  coverUrl: string | null
}

export function searchIgdbGames(query: string): Promise<IgdbGameCandidate[]> {
  return invoke('search_igdb_games', { query })
}

export function previewIgdbGame(
  gameId: number,
  title: string,
  releaseYear: number | null,
  coverUrl: string | null,
): Promise<IgdbGamePresentation> {
  return invoke('preview_igdb_game', { gameId, title, releaseYear, coverUrl })
}
