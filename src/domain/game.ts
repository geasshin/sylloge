import { normalizeBannerPosition } from './bannerImages.ts'

// 0.6.11 : trois statuts seulement. « En cours » et « Regardé » disparaissent ;
// la migration 15 remappe les fiches existantes (« en cours » et « regardé »
// deviennent « joué »).
export const GAME_STATUSES = ['à jouer', 'joué', 'abandonné'] as const

export type GameStatus = (typeof GAME_STATUSES)[number]

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  'à jouer': 'À jouer',
  joué: 'Joué',
  abandonné: 'Abandonné',
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
  /** Bannière 16:9 (v7) : une adresse d'image, `null` quand aucune n'est choisie. */
  bannerUrl: string | null
  /** Recadrage vertical (v9, migration 0028) : pourcentage, `null` = centré. */
  bannerPosition: number | null
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
  buildGamePlatformFilters(games).forEach(add)

  return suggestions
}

/** Plateformes réellement présentes, triées et dédupliquées sans tenir compte de la casse. */
export function buildGamePlatformFilters(games: readonly Game[]): string[] {
  const platforms = new Map<string, string>()
  games.forEach((game) => {
    const value = game.platform?.trim()
    const key = value?.toLocaleLowerCase('fr')
    if (value && key && !platforms.has(key)) platforms.set(key, value)
  })
  return [...platforms.values()]
    .sort((first, second) => first.localeCompare(second, 'fr', { sensitivity: 'base' }))
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
    bannerUrl: emptyOptionalTextToNull(game.bannerUrl),
    bannerPosition: normalizeBannerPosition(game.bannerPosition),
    personalNote: emptyOptionalTextToNull(game.personalNote),
  }
}

function emptyOptionalTextToNull(value: string | null | undefined): string | null {
  return value === '' || value === undefined ? null : value
}
