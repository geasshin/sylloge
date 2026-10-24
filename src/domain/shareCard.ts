// Cartes à partager : ce que la carte retient d'une bibliothèque ou de tout le profil.
//
// Logique pure, sans dessin ni accès aux données : on aplatit les bibliothèques en « éléments »
// comparables, puis on choisit ce qui mérite d'être montré. Le rendu de l'image est ailleurs
// (src/components/shareCardImage.ts) ; il ne décide de rien.
//
// Ce que la carte montre (décisions du 24 octobre) :
//   - les coups de cœur, et eux seuls : uniquement des favoris. La personne choisit l'œuvre mise en avant
//     (le « héros ») et jusqu'à six autres ; sans choix, le mieux noté mène et les mieux notés suivent ;
//   - sous les affiches, des chiffres sur ce qu'on a accompli : accomplis, accomplis cette année, note
//     moyenne (jamais le nombre de fiches, ni les envies, ni le nombre de coups de cœur) ; chacun se retire.
// Une bonne note sans cœur ne fait pas un coup de cœur. Une envie (« à voir », « à lire ») ne compte nulle part.
// Plus de « derniers terminés » : voir ce qu'on a vu récemment n'apporte rien à qui reçoit la carte.

import type { CulturalLibrary } from '../data/libraryRepository.ts'
import { CUSTOM_LIBRARY_TEMPLATES, type CustomLibraryId } from './customLibraries.ts'
import { MAX_SHARE_PEOPLE, orderPeople, peopleOptionsFor, personCaption, type SharePerson, type ShareCardPerson } from './sharePeople.ts'
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

/** Plafond de ce que la carte montre (voir shareCardLayout) : le héros et ses voisins. */
export type ShareLimits = { favorites: number }

/** Les chiffres que la personne garde sur sa carte ; tous sont montrés tant qu'elle n'en retire pas. */
export type ShareStatsChoice = { done: boolean; year: boolean; average: boolean }
export const ALL_SHARE_STATS: ShareStatsChoice = { done: true, year: true, average: true }

/** Un chiffre clé : la valeur et sa légende (clé française à traduire au rendu, avec ses paramètres). */
export type ShareStat = { value: number; label: string; params?: Record<string, string>; /** `rating` : une note sur 5, affichée avec une décimale. */ format?: 'rating' }

export type ShareCardModel = {
  scope: ShareScope
  /** Prénom du profil : titre d'une carte de profil, signature d'une carte de bibliothèque. */
  profileName: string
  heading: { kind: 'profile'; name: string } | { kind: 'library'; label: string }
  stats: {
    /** Accomplis, accomplis cette année, puis la note moyenne s'il y a au moins une note ; selon le choix. */
    cells: ShareStat[]
    /** Accomplis par bibliothèque (non vides) ; absent pour une carte de bibliothèque. */
    perLibrary: Array<{ library: ShareLibraryKey; label: string; count: number }> | null
  }
  /** Titre de la section (clé française à traduire au rendu). */
  titles: { favorites: string }
  /** Le héros en premier, puis les autres coups de cœur choisis. */
  sections: { favorites: ShareItem[] }
  /** Les personnes mises en avant sous les affiches (réalisateur, acteurs, auteur, studio, personnages) ; souvent aucune. */
  people: ShareCardPerson[]
  /** Rien à montrer : aucun coup de cœur. */
  isEmpty: boolean
}

/** Le nom au singulier d'une bibliothèque, pour la pastille d'une œuvre sur la carte du profil (clé française, traduite au rendu). */
const BASE_SHARE_KINDS: Record<BaseShareLibrary, string> = {
  films: 'Film', series: 'Série', anime: 'Animation', books: 'Livre', mangas: 'Manga', games: 'Jeu', artworks: 'Art',
}
export function shareLibraryKind(library: ShareLibraryKey): string {
  return library in BASE_SHARE_KINDS ? BASE_SHARE_KINDS[library as BaseShareLibrary] : shareLibraryLabel(library)
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
  for (const film of library.films) items.push(item('films', film, film.director, film.posterUrl, [film.watchedAt]))
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

type Words = { done: readonly [string, string]; year: string }

/** Le vocabulaire de chaque bibliothèque : « films vus », « livres lus », « jeux terminés »… */
const WORDS: Record<BaseShareLibrary, Words> = {
  films: { done: ['film vu', 'films vus'], year: 'vus en {year}' },
  series: { done: ['série vue', 'séries vues'], year: 'vues en {year}' },
  anime: { done: ['animation vue', 'animations vues'], year: 'vues en {year}' },
  books: { done: ['livre lu', 'livres lus'], year: 'lus en {year}' },
  mangas: { done: ['manga lu', 'mangas lus'], year: 'lus en {year}' },
  games: { done: ['jeu terminé', 'jeux terminés'], year: 'terminés en {year}' },
  artworks: { done: ['œuvre découverte', 'œuvres découvertes'], year: 'découvertes en {year}' },
}
const GENERIC_WORDS: Words = { done: ['œuvre terminée', 'œuvres terminées'], year: 'terminées en {year}' }

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

/** Le héros et ses voisins : au plus sept coups de cœur sur une carte. */
export const MAX_SHARE_FAVORITES = 7

/** Les coups de cœur proposables dans la portée, du mieux noté au moins bien noté. */
export function shareCandidates(items: readonly ShareItem[], scope: ShareScope): ShareItem[] {
  // Le profil pioche dans les sept bibliothèques de base ; celles qu'on ajoute comptent dans les chiffres, pas ici.
  const inScope = scope.kind === 'profile' ? items.filter(entry => BASE_ORDER.includes(entry.library as BaseShareLibrary)) : items.filter(entry => entry.library === scope.library)
  return inScope.filter(entry => entry.isFavorite).sort(byRatingThenDate)
}

/**
 * Le choix d'office : le mieux noté en héros, puis les suivants. Pour le profil, un favori de chaque
 * bibliothèque d'abord, puis un deuxième de chacune : la carte ne montre pas qu'un seul univers.
 */
export function defaultShareSelection(candidates: readonly ShareItem[], scope: ShareScope, max = MAX_SHARE_FAVORITES): string[] {
  const picked = scope.kind === 'profile' ? balanced([...candidates], max) : candidates.slice(0, max)
  return picked.sort(byRatingThenDate).map(entry => entry.key)
}

/** Fait d'une œuvre le héros : l'ancien héros devient un voisin, et le dernier voisin cède sa place s'il le faut. */
export function setShareHero(selection: readonly string[], key: string, max = MAX_SHARE_FAVORITES): string[] {
  return [key, ...selection.filter(other => other !== key)].slice(0, max)
}

/** Ajoute ou retire un voisin du héros ; le héros ne se retire pas ici, et la sélection ne dépasse pas `max`. */
export function toggleShareOther(selection: readonly string[], key: string, max = MAX_SHARE_FAVORITES): string[] {
  if (selection.length > 0 && selection[0] === key) return [...selection]
  if (selection.includes(key)) return selection.filter(other => other !== key)
  return selection.length >= max ? [...selection] : [...selection, key]
}

export type ShareBuildOptions = {
  limits: ShareLimits
  now?: Date
  /** Les œuvres choisies par la personne, le héros en premier ; absente : le choix d'office. */
  selection?: readonly string[]
  /** Les chiffres gardés ; absent : tous. */
  stats?: ShareStatsChoice
  /** Les personnes choisies ; absent : aucune. Seules celles que la bibliothèque propose sont reprises. */
  people?: readonly SharePerson[]
}

export function buildShareCard(items: readonly ShareItem[], scope: ShareScope, profileName: string, options: ShareBuildOptions): ShareCardModel {
  const inScope = scope.kind === 'profile' ? [...items] : items.filter(entry => entry.library === scope.library)
  const year = String((options.now ?? new Date()).getFullYear())
  const words = wordsFor(scope)
  const keep = options.stats ?? ALL_SHARE_STATS

  const candidates = shareCandidates(items, scope)
  const wanted = options.selection ?? defaultShareSelection(candidates, scope, options.limits.favorites)
  // Seuls les coups de cœur de la portée sont retenus, sans doublon, dans la limite du format.
  const byKey = new Map(candidates.map(entry => [entry.key, entry]))
  const chosen = [...new Set(wanted)].flatMap(key => (byKey.has(key) ? [byKey.get(key) as ShareItem] : [])).slice(0, options.limits.favorites)
  // Le héros reste en tête ; les voisins suivent par note décroissante, quel que soit l'ordre des clics.
  const [hero, ...others] = chosen
  const favorites = hero ? [hero, ...others.sort(byRatingThenDate)] : []

  const done = inScope.filter(entry => entry.done)
  const doneThisYear = done.filter(entry => entry.doneOn?.slice(0, 4) === year).length
  // La moyenne ne porte que sur ce qui est terminé et noté : une envie notée n'a pas encore été vécue.
  const ratings = done.flatMap(entry => (entry.rating === null ? [] : [entry.rating]))
  const averageRating = ratings.length === 0 ? null : Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10

  let perLibrary: ShareCardModel['stats']['perLibrary'] = null
  if (scope.kind === 'profile') {
    const counts = new Map<ShareLibraryKey, number>()
    for (const entry of done) counts.set(entry.library, (counts.get(entry.library) ?? 0) + 1)
    perLibrary = [...counts.entries()]
      .map(([library, count]) => ({ library, label: shareLibraryLabel(library), count }))
      .sort((a, b) => orderOf(a.library) - orderOf(b.library))
  }

  // Seules les personnes que la portée propose sont reprises (rien sur l'art). Sur le profil, la légende suit la
  // bibliothèque de chaque personne ; sur une bibliothèque, c'est la sienne.
  const offered = peopleOptionsFor(scope)
  const people = orderPeople((options.people ?? []).filter(person => (person.role === 'character' ? offered.characters : offered.roles.includes(person.role))))
    .slice(0, MAX_SHARE_PEOPLE)
    .map(person => ({ ...person, caption: personCaption(person, scope.kind === 'library' ? scope.library : 'books') }))

  const cells: ShareStat[] = []
  if (keep.done) cells.push({ value: done.length, label: plural(done.length, words.done) })
  if (keep.year) cells.push({ value: doneThisYear, label: words.year, params: { year } })
  if (keep.average && averageRating !== null) cells.push({ value: averageRating, label: 'note moyenne', format: 'rating' })

  return {
    scope,
    profileName,
    heading: scope.kind === 'profile'
      ? { kind: 'profile', name: profileName }
      : { kind: 'library', label: shareLibraryLabel(scope.library) },
    stats: { cells, perLibrary },
    titles: { favorites: 'Coups de cœur' },
    sections: { favorites },
    people,
    isEmpty: favorites.length === 0,
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
  const favorites = await Promise.all(model.sections.favorites.map(async entry => {
    const imageUrl = await resolve(entry).catch(() => entry.imageUrl)
    return imageUrl === entry.imageUrl ? entry : { ...entry, imageUrl }
  }))
  return { ...model, sections: { favorites } }
}
