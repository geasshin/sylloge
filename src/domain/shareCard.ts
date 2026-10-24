// Cartes à partager : ce que la carte retient d'une bibliothèque ou de tout le profil.
//
// Logique pure, sans dessin ni accès aux données : on aplatit les bibliothèques en « éléments »
// comparables, puis on choisit ce qui mérite d'être montré. Le rendu de l'image est ailleurs
// (src/components/shareCardImage.ts) ; il ne décide de rien.
//
// Ce que la carte montre (décision du 24 octobre) :
//   - les coups de cœur : uniquement les favoris, du mieux noté au moins bien noté ;
//   - les derniers terminés : ce qui est accompli, du plus récent au plus ancien, hors coups de cœur ;
//   - trois chiffres qui parlent de ce qu'on a accompli (jamais le nombre de fiches ni les envies).
// Une bonne note sans cœur ne fait pas un coup de cœur : la carte met en avant les préférés, pas les
// mieux notés. Une envie (« à voir », « à lire ») ne compte nulle part.

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
  /** Date d'accomplissement si la fiche est accomplie (à défaut de date propre, la dernière modification). */
  doneAt: string | null
  /** Date d'accomplissement saisie par la personne : la seule qui prouve « cette année ». */
  doneOn: string | null
  imageUrl: string | null
}

export type ShareScope = { kind: 'profile' } | { kind: 'library'; library: ShareLibraryKey }

export type ShareScopeChoice = { kind: 'profile' } | { kind: 'library'; library: ShareLibraryKey; label: string }

/** Plafonds de ce que la carte montre : ils dépendent du format et de la portée (voir shareCardLayout). */
export type ShareLimits = { favorites: number; recent: number }

/** Un chiffre clé : la valeur et sa légende (clé française à traduire au rendu, avec ses paramètres). */
export type ShareStat = { value: number; label: string; params?: Record<string, string> }

export type ShareCardModel = {
  scope: ShareScope
  /** Prénom du profil : titre d'une carte de profil, signature d'une carte de bibliothèque. */
  profileName: string
  heading: { kind: 'profile'; name: string } | { kind: 'library'; label: string }
  stats: {
    /** Trois chiffres : accomplis, accomplis cette année, coups de cœur. */
    cells: ShareStat[]
    /** Accomplis par bibliothèque (non vides) ; absent pour une carte de bibliothèque. */
    perLibrary: Array<{ library: ShareLibraryKey; label: string; count: number }> | null
  }
  /** Titres des deux sections (clés françaises à traduire au rendu). */
  titles: { favorites: string; recent: string }
  sections: { favorites: ShareItem[]; recent: ShareItem[] }
  /** Rien à montrer : aucune œuvre accomplie ni favorite. */
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
    doneOn: done && own ? own : null,
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

/** Les portées proposées : le profil, puis chaque bibliothèque de base qui contient quelque chose. */
export function shareScopes(library: CulturalLibrary): ShareScopeChoice[] {
  const present = new Set(collectShareItems(library).map(entry => entry.library))
  const choices: ShareScopeChoice[] = [{ kind: 'profile' }]
  for (const key of BASE_ORDER) {
    if (present.has(key)) choices.push({ kind: 'library', library: key, label: BASE_SHARE_LABELS[key] })
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

type Words = { done: readonly [string, string]; year: string; recent: string }

/** Le vocabulaire de chaque bibliothèque : « films vus », « livres lus », « jeux terminés »… */
const WORDS: Record<BaseShareLibrary, Words> = {
  films: { done: ['film vu', 'films vus'], year: 'vus en {year}', recent: 'Derniers films vus' },
  series: { done: ['série vue', 'séries vues'], year: 'vues en {year}', recent: 'Dernières séries vues' },
  anime: { done: ['animation vue', 'animations vues'], year: 'vues en {year}', recent: 'Dernières animations vues' },
  books: { done: ['livre lu', 'livres lus'], year: 'lus en {year}', recent: 'Derniers livres lus' },
  mangas: { done: ['manga lu', 'mangas lus'], year: 'lus en {year}', recent: 'Derniers mangas lus' },
  games: { done: ['jeu terminé', 'jeux terminés'], year: 'terminés en {year}', recent: 'Derniers jeux terminés' },
  artworks: { done: ['œuvre découverte', 'œuvres découvertes'], year: 'découvertes en {year}', recent: 'Dernières œuvres découvertes' },
}
const GENERIC_WORDS: Words = { done: ['œuvre terminée', 'œuvres terminées'], year: 'terminées en {year}', recent: 'Terminés récemment' }
const FAVORITE_WORDS = ['coup de cœur', 'coups de cœur'] as const

/** Français : zéro et un restent au singulier. */
const plural = (count: number, [one, many]: readonly [string, string]) => (count > 1 ? many : one)

function wordsFor(scope: ShareScope): Words {
  return scope.kind === 'library' && scope.library in WORDS ? WORDS[scope.library as BaseShareLibrary] : GENERIC_WORDS
}

/** Un favori de chaque bibliothèque d'abord, puis un deuxième de chacune… : la carte du profil ne montre pas qu'un seul univers. */
function balanced(favorites: ShareItem[], limit: number): ShareItem[] {
  const groups = new Map<ShareLibraryKey, ShareItem[]>()
  for (const entry of favorites) groups.set(entry.library, [...(groups.get(entry.library) ?? []), entry])
  const queues = [...groups.entries()].sort(([a], [b]) => orderOf(a) - orderOf(b)).map(([, list]) => list)
  const picked: ShareItem[] = []
  for (let round = 0; picked.length < limit && queues.some(queue => queue.length > round); round += 1) {
    for (const queue of queues) if (queue[round] && picked.length < limit) picked.push(queue[round])
  }
  return picked
}

export type ShareBuildOptions = { limits: ShareLimits; now?: Date }

export function buildShareCard(items: readonly ShareItem[], scope: ShareScope, profileName: string, options: ShareBuildOptions): ShareCardModel {
  const inScope = scope.kind === 'profile' ? [...items] : items.filter(entry => entry.library === scope.library)
  const year = String((options.now ?? new Date()).getFullYear())
  const words = wordsFor(scope)

  const allFavorites = inScope.filter(entry => entry.isFavorite).sort(byRatingThenDate)
  const favorites = (scope.kind === 'profile' ? balanced(allFavorites, options.limits.favorites) : allFavorites.slice(0, options.limits.favorites)).sort(byRatingThenDate)
  const shown = new Set(favorites.map(entry => entry.key))

  const recent = inScope
    .filter(entry => !shown.has(entry.key) && entry.done)
    .sort(byDateThenRating)
    .slice(0, options.limits.recent)

  const done = inScope.filter(entry => entry.done)
  const doneThisYear = done.filter(entry => entry.doneOn?.slice(0, 4) === year).length

  let perLibrary: ShareCardModel['stats']['perLibrary'] = null
  if (scope.kind === 'profile') {
    const counts = new Map<ShareLibraryKey, number>()
    for (const entry of done) counts.set(entry.library, (counts.get(entry.library) ?? 0) + 1)
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
      cells: [
        { value: done.length, label: plural(done.length, words.done) },
        { value: doneThisYear, label: words.year, params: { year } },
        { value: allFavorites.length, label: plural(allFavorites.length, FAVORITE_WORDS) },
      ],
      perLibrary,
    },
    titles: { favorites: 'Coups de cœur', recent: words.recent },
    sections: { favorites, recent },
    isEmpty: favorites.length + recent.length === 0,
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
  const [favorites, recent] = await Promise.all([resolveAll(model.sections.favorites), resolveAll(model.sections.recent)])
  return { ...model, sections: { favorites, recent } }
}
