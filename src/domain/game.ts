export const GAME_STATUSES = ['à jouer', 'en cours', 'joué', 'abandonné', 'regardé'] as const

export type GameStatus = (typeof GAME_STATUSES)[number]

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  'à jouer': 'À jouer',
  'en cours': 'En cours',
  joué: 'Joué',
  abandonné: 'Abandonné',
  regardé: 'Regardé',
}

export const DEFAULT_GAME_PLATFORMS = [
  'PC',
  'PlayStation 5',
  'Xbox Series X|S',
  'Nintendo Switch',
  'PlayStation 4',
  'Xbox One',
  'Nintendo 3DS',
  'PlayStation 3',
  'Xbox 360',
  'Wii',
  'PlayStation 2',
  'GameCube',
  'Nintendo 64',
  'Super Nintendo',
  'Mega Drive',
  'Game Boy',
] as const

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
 * Les plateformes déjà saisies enrichissent les suggestions initiales sans
 * enfermer le formulaire dans une liste fermée.
 */
export function buildGamePlatformSuggestions(games: readonly Game[]): string[] {
  const suggestions: string[] = []
  const seen = new Set<string>()

  const add = (value: string) => {
    const trimmed = value.trim()
    const key = trimmed.toLocaleLowerCase('fr')
    if (!trimmed || seen.has(key)) return
    seen.add(key)
    suggestions.push(trimmed)
  }

  DEFAULT_GAME_PLATFORMS.forEach(add)
  games
    .flatMap((game) => game.platform ? [game.platform] : [])
    .sort((first, second) => first.localeCompare(second, 'fr', { sensitivity: 'base' }))
    .forEach(add)

  return suggestions
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
