// Cartes à partager : les personnes mises en avant sous les affiches.
//
// Selon la bibliothèque : le réalisateur et les acteurs les plus vus (films), l'auteur le plus lu (livres,
// mangas), le studio le plus joué (jeux). Rien ne se saisit à la main : seules les fiches proposent.
// Logique pure : elle compte sur des données déjà lues (fiches, distribution du cache TMDB) et ne lit ni
// n'écrit rien. Les noms de personnes sont des données personnelles ou fournisseur : jamais traduits.
import type { ShareItem, ShareLibraryKey, ShareScope } from './shareCard.ts'

export type PersonRole = 'director' | 'actor' | 'author' | 'studio'

export type SharePerson = {
  /** `rôle:nom normalisé`, unique pour une personne et un rôle. */
  id: string
  role: PersonRole
  name: string
  /** Nombre d'œuvres terminées où la personne figure. */
  count: number
  /** Photo fournie par TMDB (acteurs, réalisateurs) ; absente : la carte dessine les initiales. */
  portraitUrl: string | null
  /** La bibliothèque dont vient la personne : seulement sur la carte du profil, où elle fixe la légende (livre ou manga). */
  library?: ShareLibraryKey
  /** Un film TMDB où figure un réalisateur : de quoi retrouver sa photo, que le cache local ne garde pas. */
  sourceTmdbId?: number
}

/** Une personne telle que la carte la montre : sa légende est une clé française à traduire au rendu. */
export type ShareCardPerson = SharePerson & { caption: { key: string; params?: Record<string, string> } }

/** Au plus cinq personnes sur une rangée : au-delà, les noms ne tiendraient plus à une taille lisible. */
export const MAX_SHARE_PEOPLE = 5

const MAX_DIRECTORS = 3
const MAX_ACTORS = 6
const MAX_CREATORS = 3
const ROLE_ORDER: readonly PersonRole[] = ['director', 'actor', 'author', 'studio']
/** Combien de propositions sont cochées d'office, par rôle. */
const DEFAULT_PER_ROLE: Record<PersonRole, number> = { director: 1, actor: 3, author: 1, studio: 1 }

const collapse = (name: string) => name.trim().replace(/\s+/g, ' ')
const keyOf = (name: string) => collapse(name).toLocaleLowerCase('fr')
const byCountThenName = (a: SharePerson, b: SharePerson) => b.count - a.count || a.name.localeCompare(b.name, 'fr')

/** Ce que chaque bibliothèque propose, dans l'ordre où la carte les montre ; aucune ne demande de saisie. */
export function peopleOptionsFor(scope: ShareScope): PersonRole[] {
  // Le profil réunit tout : un réalisateur, des auteurs, un studio.
  if (scope.kind === 'profile') return ['director', 'actor', 'author', 'studio']
  switch (scope.library) {
    case 'films': return ['director', 'actor']
    case 'books':
    case 'mangas': return ['author']
    case 'games': return ['studio']
    default: return []
  }
}

export type FilmCredits = {
  /** Identifiant TMDB du film s'il est associé à une fiche TMDB ; sans lui, pas de distribution ni de photo. */
  tmdbId: number | null
  directors: readonly string[]
  cast: ReadonlyArray<{ name: string; portraitUrl: string | null }>
}

type Tally = { person: SharePerson }

function tally(entries: Map<string, Tally>, role: PersonRole, name: string, portraitUrl: string | null, tmdbId: number | null | undefined) {
  const clean = collapse(name)
  if (clean === '') return
  const key = `${role}:${keyOf(clean)}`
  const known = entries.get(key)
  if (known) {
    known.person.count += 1
    if (known.person.portraitUrl === null && portraitUrl) known.person.portraitUrl = portraitUrl
    if (known.person.sourceTmdbId === undefined && typeof tmdbId === 'number') known.person.sourceTmdbId = tmdbId
    return
  }
  entries.set(key, { person: { id: key, role, name: clean, count: 1, portraitUrl, ...(typeof tmdbId === 'number' ? { sourceTmdbId: tmdbId } : {}) } })
}

/**
 * Réalisateurs et acteurs des films terminés, classés par nombre de films. Un film ne compte qu'une fois pour une
 * même personne. Les réalisateurs viennent de toutes les fiches ; les acteurs, de la distribution du cache TMDB
 * (les vingt premiers rôles des films associés) : un film sans fiche TMDB ne compte que pour son réalisateur.
 */
export function rankFilmPeople(films: readonly FilmCredits[]): { directors: SharePerson[]; actors: SharePerson[] } {
  const directors = new Map<string, Tally>()
  const actors = new Map<string, Tally>()
  for (const film of films) {
    const seenDirectors = new Set<string>()
    for (const name of film.directors) {
      const key = keyOf(name)
      if (seenDirectors.has(key)) continue
      seenDirectors.add(key)
      tally(directors, 'director', name, null, film.tmdbId)
    }
    const seenActors = new Set<string>()
    for (const member of film.cast) {
      const key = keyOf(member.name)
      if (seenActors.has(key)) continue
      seenActors.add(key)
      tally(actors, 'actor', member.name, member.portraitUrl, undefined)
    }
  }
  const sorted = (map: Map<string, Tally>, limit: number) => [...map.values()].map(entry => entry.person).sort(byCountThenName).slice(0, limit)
  return { directors: sorted(directors, MAX_DIRECTORS), actors: sorted(actors, MAX_ACTORS) }
}

/** Les réalisateurs d'une fiche : le champ est libre, plusieurs noms se séparent par une virgule. */
export function splitDirectors(field: string | null | undefined): string[] {
  return (field ?? '').split(',').map(collapse).filter(Boolean)
}

/** Auteurs ou studios des œuvres terminées de la bibliothèque, du plus fréquent au moins fréquent (aucune photo). */
export function rankCreators(items: readonly ShareItem[], scope: ShareScope, role: 'author' | 'studio'): SharePerson[] {
  if (scope.kind !== 'library') return []
  const entries = new Map<string, Tally>()
  for (const entry of items) {
    if (entry.library !== scope.library || !entry.done || !entry.creator) continue
    tally(entries, role, entry.creator, null, undefined)
  }
  return [...entries.values()].map(entry => entry.person).sort(byCountThenName).slice(0, MAX_CREATORS)
}

/** Deux auteurs ou studios au plus par bibliothèque sur le profil : chaque univers a sa place, aucun ne prend toute la rangée. */
const PROFILE_PER_LIBRARY = 2
const PROFILE_CREATOR_LIBRARIES = [['books', 'author'], ['mangas', 'author'], ['games', 'studio']] as const

/** Auteurs des livres et des mangas, studios des jeux, pour la carte du profil : chacun classé dans sa bibliothèque. */
export function rankProfileCreators(items: readonly ShareItem[]): SharePerson[] {
  return PROFILE_CREATOR_LIBRARIES.flatMap(([library, role]) =>
    rankCreators(items, { kind: 'library', library }, role)
      .slice(0, PROFILE_PER_LIBRARY)
      // Une même personne peut écrire un livre et un manga : l'identifiant suit la bibliothèque.
      .map(person => ({ ...person, id: `${person.id}@${library}`, library })))
}

/**
 * Les propositions cochées d'office. Une bibliothèque : le réalisateur le plus vu, ses trois acteurs, l'auteur ou le studio le
 * plus fréquent. Le profil (`spread`) : une personne par rôle et par bibliothèque (réalisateur, un acteur, auteur des livres,
 * auteur des mangas, studio), cinq au plus.
 */
export function defaultPeopleIds(candidates: readonly SharePerson[], spread = false): string[] {
  if (spread) {
    const groups = new Set<string>()
    const ids: string[] = []
    for (const person of candidates) {
      const group = `${person.role}|${person.library ?? ''}`
      if (groups.has(group) || ids.length >= MAX_SHARE_PEOPLE) continue
      groups.add(group)
      ids.push(person.id)
    }
    return ids
  }
  const taken: Record<PersonRole, number> = { director: 0, actor: 0, author: 0, studio: 0 }
  const ids: string[] = []
  for (const person of candidates) {
    if (taken[person.role] >= DEFAULT_PER_ROLE[person.role]) continue
    taken[person.role] += 1
    ids.push(person.id)
  }
  return ids
}

/** L'ordre sur la carte : réalisateur, acteurs, auteur ou studio ; cinq au plus. */
export function orderPeople(people: readonly SharePerson[]): SharePerson[] {
  return people
    .map((person, index) => ({ person, index }))
    .sort((a, b) => ROLE_ORDER.indexOf(a.person.role) - ROLE_ORDER.indexOf(b.person.role) || a.index - b.index)
    .map(entry => entry.person)
    .slice(0, MAX_SHARE_PEOPLE)
}

const COUNT_CAPTIONS = {
  director: { one: 'Réalisateur · {count} film', many: 'Réalisateur · {count} films' },
  actor: { one: 'Au casting · {count} film', many: 'Au casting · {count} films' },
  book: { one: 'Auteur · {count} livre', many: 'Auteur · {count} livres' },
  manga: { one: 'Auteur · {count} manga', many: 'Auteur · {count} mangas' },
  studio: { one: 'Studio · {count} jeu', many: 'Studio · {count} jeux' },
} as const

/** La légende d'une personne : son rôle et son nombre d'œuvres (clé française, traduite au rendu). */
export function personCaption(person: SharePerson, fallbackLibrary: ShareLibraryKey): ShareCardPerson['caption'] {
  const library = person.library ?? fallbackLibrary
  const words = person.role === 'director' ? COUNT_CAPTIONS.director
    : person.role === 'actor' ? COUNT_CAPTIONS.actor
      : person.role === 'studio' ? COUNT_CAPTIONS.studio
        : library === 'mangas' ? COUNT_CAPTIONS.manga : COUNT_CAPTIONS.book
  return { key: person.count > 1 ? words.many : words.one, params: { count: String(person.count) } }
}

/** Les initiales dessinées à défaut de photo : première lettre du premier et du dernier mot. */
export function personInitials(name: string): string {
  const words = collapse(name).split(' ').filter(Boolean)
  if (words.length === 0) return '?'
  const first = (word: string) => (Array.from(word)[0] ?? '').toLocaleUpperCase('fr')
  return words.length === 1 ? first(words[0]) : first(words[0]) + first(words[words.length - 1])
}
