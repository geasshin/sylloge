export const GAME_STATUSES = ['à jouer', 'en cours', 'joué', 'abandonné', 'regardé'] as const

export type GameStatus = (typeof GAME_STATUSES)[number]

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  'à jouer': 'À jouer',
  'en cours': 'En cours',
  joué: 'Joué',
  abandonné: 'Abandonné',
  regardé: 'Regardé',
}

export type Game = {
  id: string
  profileId: string
  title: string
  developer: string | null
  platform: string | null
  year: number | null
  status: GameStatus
  rating: number | null
  isFavorite: boolean
  playedAt: string | null
  coverUrl: string | null
  personalNote: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Les formats d'import peuvent contenir des chaînes facultatives vides. La
 * donnée locale canonique les représente par null. Cette fonction ne retire
 * aucun caractère d'une chaîne non vide.
 */
export function normalizeGame(game: Game): Game {
  return {
    ...game,
    developer: emptyOptionalTextToNull(game.developer),
    platform: emptyOptionalTextToNull(game.platform),
    playedAt: emptyOptionalTextToNull(game.playedAt),
    coverUrl: emptyOptionalTextToNull(game.coverUrl),
    personalNote: emptyOptionalTextToNull(game.personalNote),
  }
}

function emptyOptionalTextToNull(value: string | null): string | null {
  return value === '' ? null : value
}
