// Cartes à partager : ce que la carte retient d'une bibliothèque ou de tout le profil.
//
// Logique pure, sans dessin ni accès aux données : on aplatit les bibliothèques en « éléments »
// comparables, puis on choisit ce qui mérite d'être montré. Le rendu de l'image est ailleurs
// (src/components/shareCardImage.ts) ; il ne décide de rien.
//
// Règles de sélection, dans cet ordre, sans qu'une œuvre apparaisse deux fois :
//   1. coups de cœur : les favoris, mieux notés en tête ;
//   2. mieux notées : 4 étoiles et plus, hors coups de cœur ;
//   3. vues récemment : ce qui est accompli, du plus récent au plus ancien, hors le reste.
// Une envie (« à voir », « à lire ») ne fait pas une carte : elle ne compte que dans les chiffres.

import type { CulturalLibrary } from '../data/libraryRepository.ts'
import { CUSTOM_LIBRARY_TEMPLATES, type CustomLibraryId } from './customLibraries.ts'
import { isDoneStatus } from './statusTone.ts'

export type BaseShareLibrary = 'films' | 'series' | 'anime' | 'books' | 'mangas' | 'games' | 'artworks'
export type ShareLibraryKey = BaseShareLibrary | CustomLibraryId

/** Noms français des bibliothèques : traduits au rendu, jamais stockés. */
export const BASE_SHARE_LABELS: Record<BaseShareLibrary, string> = {
  films: 'Films',
  series: 'Séries',
  anime: 'Animation japonaise',
  books: 'Livres',
  mangas: 'Mangas',
  games: 'Jeux',
  artworks: 'Art',
}

const BASE_ORDER: readonly BaseShareLibrary[] = ['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks']

/** Plafonds par section : la carte reste lisible, quelle que soit la taille de la bibliothèque. */
export const SHARE_LIMITS = { favorites: 6, topRated: 5, recent: 6 } as const

/** Une note de 4 étoiles ou plus fait une « mieux notée ». */
export const TOP_RATING_THRESHOLD = 4

export type ShareItem = {
  /** `bibliothèque:identifiant`, unique dans tout le profil. */
  key: string
  id: string
  library: ShareLibraryKey
  title: string
  creator: string | null
  year: number | null
  /** 0,5 à 5 par demi-étoile ; absent pour l'Art, qui n'a pas de note chiffrée. */
  rating: number | null
  isFavorite: boolean
  done: boolean
  /** Date d'accomplissement si la fiche est accomplie, sinon null. */
  doneAt: string | null
  imageUrl: string | null
}

export type ShareScope = { kind: 'profile' } | { kind: 'library'; library: ShareLibraryKey }

export type ShareScopeChoice = { kind: 'profile' } | { kind: 'library'; library: ShareLibraryKey; label: string }

export type ShareCardModel = {
  scope: ShareScope
  /** Prénom du profil : titre d'une carte de profil, signature d'une carte de bibliothèque. */
  profileName: string
  heading: { kind: 'profile'; name: string } | { kind: 'library'; label: string }
  stats: {
    total: number
    done: number
    favorites: number
    averageRating: number | null
    /** Répartition par bibliothèque non vide ; absente pour une carte de bibliothèque. */
    perLibrary: Array<{ library: ShareLibraryKey; label: string; count: number }> | null
  }
  sections: { favorites: ShareItem[]; topRated: ShareItem[]; recent: ShareItem[] }
  /** Rien à montrer : aucune œuvre accomplie, notée ou favorite. */
  isEmpty: boolean
}

export function shareLibraryLabel(library: ShareLibraryKey): string {
  return library in BASE_SHARE_LABELS
    ? BASE_SHARE_LABELS[library as BaseShareLibrary]
    : CUSTOM_LIBRARY_TEMPLATES[library as CustomLibraryId].label
}

type Common = {
  id: string
  title: string
  year?: number | null
  status: string
  isFavorite: boolean
  rating?: number | null
  updatedAt: string
}

function item(
  library: ShareLibraryKey,
  entry: Common,
  creator: string | null | undefined,
  imageUrl: string | null | undefined,
  ownDate: (string | null | undefined)[],
): ShareItem {
  const done = isDoneStatus(entry.status)
  const own = ownDate.find(value => typeof value === 'string' && value.trim() !== '')
  return {
    key: `${library}:${entry.id}`,
    id: entry.id,
    library,
    title: entry.title,
    creator: creator?.trim() ? creator.trim() : null,
    year: entry.year ?? null,
    rating: entry.rating ?? null,
    isFavorite: entry.isFavorite,
    done,
    doneAt: done ? own ?? entry.updatedAt : null,
    imageUrl: imageUrl?.trim() ? imageUrl.trim() : null,
  }
}

/** Aplatit toutes les bibliothèques d'un profil en éléments comparables. */
export function collectShareItems(library: CulturalLibrary): ShareItem[] {
  const items: ShareItem[] = []
  for (const film of library.films) items.push(item('films', film, null, film.posterUrl, [film.watchedAt]))
  for (const series of library.series) items.push(item('series', series, series.showrunner, series.posterUrl, [series.progressUpdatedAt, series.startedAt]))
  for (const series of library.anime) items.push(item('anime', series, series.showrunner, series.posterUrl, [series.progressUpdatedAt, series.startedAt]))
  for (const book of library.books) items.push(item('books', book, book.author, book.coverUrl, [book.progressUpdatedAt, book.startedAt]))
  for (const book of library.mangas) items.push(item('mangas', book, book.author, book.coverUrl, [book.progressUpdatedAt, book.startedAt]))
  for (const game of library.games) items.push(item('games', game, game.developer, game.coverUrl, [game.playedAt]))
  for (const artwork of library.artworks) items.push(item('artworks', { ...artwork, rating: null }, artwork.artist, artwork.imageUrl, [artwork.discoveredAt]))
  for (const custom of library.customLibraries) {
    for (const entry of custom.entries) {
      items.push(item(custom.libraryId, entry, entry.creator, entry.coverUrl, [entry.finishedAt, entry.progressUpdatedAt]))
    }
  }
  return items
}

/** Les portées proposées : le profil, puis chaque bibliothèque qui contient quelque chose. */
export function shareScopes(library: CulturalLibrary): ShareScopeChoice[] {
  const present = new Set(collectShareItems(library).map(entry => entry.library))
  const choices: ShareScopeChoice[] = [{ kind: 'profile' }]
  for (const key of BASE_ORDER) {
    if (present.has(key)) choices.push({ kind: 'library', library: key, label: BASE_SHARE_LABELS[key] })
  }
  for (const custom of [...library.customLibraries].sort((a, b) => a.position - b.position)) {
    if (present.has(custom.libraryId)) {
      choices.push({ kind: 'library', library: custom.libraryId, label: CUSTOM_LIBRARY_TEMPLATES[custom.libraryId].label })
    }
  }
  return choices
}

const byTitle = (a: ShareItem, b: ShareItem) => a.title.localeCompare(b.title, 'fr') || a.key.localeCompare(b.key)
/** Plus grand d'abord ; l'absence de valeur passe en dernier. */
const descending = (a: string | number | null, b: string | number | null): number => {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a < b ? 1 : -1
}

const byRatingThenDate = (a: ShareItem, b: ShareItem) =>
  descending(a.rating, b.rating) || descending(a.doneAt, b.doneAt) || byTitle(a, b)
const byDateThenRating = (a: ShareItem, b: ShareItem) =>
  descending(a.doneAt, b.doneAt) || descending(a.rating, b.rating) || byTitle(a, b)

function average(values: number[]): number | null {
  if (values.length === 0) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.round(mean * 10) / 10
}

export function buildShareCard(items: readonly ShareItem[], scope: ShareScope, profileName: string): ShareCardModel {
  const inScope = scope.kind === 'profile' ? [...items] : items.filter(entry => entry.library === scope.library)

  const favorites = inScope.filter(entry => entry.isFavorite).sort(byRatingThenDate).slice(0, SHARE_LIMITS.favorites)
  const shown = new Set(favorites.map(entry => entry.key))

  const topRated = inScope
    .filter(entry => !shown.has(entry.key) && entry.rating !== null && entry.rating >= TOP_RATING_THRESHOLD)
    .sort(byRatingThenDate)
    .slice(0, SHARE_LIMITS.topRated)
  for (const entry of topRated) shown.add(entry.key)

  const recent = inScope
    .filter(entry => !shown.has(entry.key) && entry.done)
    .sort(byDateThenRating)
    .slice(0, SHARE_LIMITS.recent)

  let perLibrary: ShareCardModel['stats']['perLibrary'] = null
  if (scope.kind === 'profile') {
    const counts = new Map<ShareLibraryKey, number>()
    for (const entry of inScope) counts.set(entry.library, (counts.get(entry.library) ?? 0) + 1)
    perLibrary = [...counts.entries()]
      .map(([library, count]) => ({ library, label: shareLibraryLabel(library), count }))
      .sort((a, b) => orderOf(a.library) - orderOf(b.library))
  }

  return {
    scope,
    profileName,
    heading: scope.kind === 'profile'
      ? { kind: 'profile', name: profileName }
      : { kind: 'library', label: shareLibraryLabel(scope.library) },
    stats: {
      total: inScope.length,
      done: inScope.filter(entry => entry.done).length,
      favorites: inScope.filter(entry => entry.isFavorite).length,
      averageRating: average(inScope.flatMap(entry => (entry.rating === null ? [] : [entry.rating]))),
      perLibrary,
    },
    sections: { favorites, topRated, recent },
    isEmpty: favorites.length + topRated.length + recent.length === 0,
  }
}

function orderOf(library: ShareLibraryKey): number {
  const base = BASE_ORDER.indexOf(library as BaseShareLibrary)
  return base >= 0 ? base : BASE_ORDER.length + Object.keys(CUSTOM_LIBRARY_TEMPLATES).indexOf(library)
}

/**
 * Remplace l'image de chaque œuvre montrée par celle que l'application affiche, quand une règle plus
 * fine que la colonne locale existe (les films : lien personnel, choix de galerie, affiche TMDB).
 * Seules les œuvres retenues sont résolues, jamais toute la bibliothèque.
 */
export async function withDisplayedImages(
  model: ShareCardModel,
  resolve: (item: ShareItem) => Promise<string | null>,
): Promise<ShareCardModel> {
  const resolveAll = (items: ShareItem[]) => Promise.all(items.map(async entry => {
    const imageUrl = await resolve(entry).catch(() => entry.imageUrl)
    return imageUrl === entry.imageUrl ? entry : { ...entry, imageUrl }
  }))
  const [favorites, topRated, recent] = await Promise.all([
    resolveAll(model.sections.favorites),
    resolveAll(model.sections.topRated),
    resolveAll(model.sections.recent),
  ])
  return { ...model, sections: { favorites, topRated, recent } }
}
