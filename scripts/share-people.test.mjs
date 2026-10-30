// Cartes à partager : les personnes mises en avant sous les affiches (réalisateur et acteurs les plus vus,
// auteur le plus lu, studio le plus joué). Logique pure : le calcul se fait sur les fiches et sur la
// distribution déjà conservée dans le cache TMDB, rien n'est lu ni écrit ici.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultPeopleIds, MAX_SHARE_PEOPLE, orderPeople, peopleOptionsFor, personCaption, personInitials, rankCreators, rankFilmPeople, rankProfileCreators, splitDirectors,
} from '../src/domain/sharePeople.ts'
import { buildShareCard } from '../src/domain/shareCard.ts'

const NOW = new Date('2026-10-24T10:00:00')
let n = 0
const item = (library, over = {}) => { n += 1; return { key: `${library}:${n}`, id: String(n), library, title: `Titre ${n}`, creator: null, year: 2020, rating: 4, isFavorite: false, done: true, doneAt: '2026-01-01', doneOn: '2026-01-01', imageUrl: null, ...over } }
const film = (tmdbId, directors, cast) => ({ tmdbId, directors, cast: cast.map(entry => (typeof entry === 'string' ? { name: entry, portraitUrl: null } : entry)) })

test('Acteurs et réalisateurs : un point par film, classés par nombre de films, puis par nom', () => {
  const { directors, actors } = rankFilmPeople([
    film(1, ['Greta Gerwig'], ['Saoirse Ronan', 'Timothée Chalamet', 'Saoirse Ronan']),
    film(2, ['greta gerwig '], ['saoirse ronan', 'Florence Pugh']),
    film(3, ['Denis Villeneuve'], ['Timothée Chalamet', 'Zendaya']),
    film(4, ['Denis Villeneuve'], ['Zendaya', 'Florence Pugh']),
    film(5, ['Greta Gerwig', 'Noah Baumbach'], ['Florence Pugh']),
  ])
  assert.deepEqual(directors.map(entry => [entry.name, entry.count]), [['Greta Gerwig', 3], ['Denis Villeneuve', 2], ['Noah Baumbach', 1]])
  assert.deepEqual(actors.map(entry => [entry.name, entry.count]), [['Florence Pugh', 3], ['Saoirse Ronan', 2], ['Timothée Chalamet', 2], ['Zendaya', 2]], 'doublon dans un même film ignoré ; égalité : ordre alphabétique')
  assert.ok(directors.every(entry => entry.role === 'director') && actors.every(entry => entry.role === 'actor'))
  assert.equal(new Set([...directors, ...actors].map(entry => entry.id)).size, directors.length + actors.length, 'identifiants distincts')
})

test('Le nom affiché est celui de la première fiche ; la photo, la première qui existe ; le film source sert à retrouver la photo d’un réalisateur', () => {
  const { directors, actors } = rankFilmPeople([
    film(7, ['Agnès Varda'], [{ name: 'Sandrine Bonnaire', portraitUrl: null }]),
    film(8, ['agnès varda'], [{ name: 'Sandrine Bonnaire', portraitUrl: 'https://image.tmdb.org/t/p/w185/sb.jpg' }]),
  ])
  assert.equal(directors[0].name, 'Agnès Varda')
  assert.equal(directors[0].sourceTmdbId, 7, 'un film où figure ce réalisateur')
  assert.equal(directors[0].portraitUrl, null, 'pas de photo connue pour un réalisateur : elle se demande à TMDB')
  assert.equal(actors[0].portraitUrl, 'https://image.tmdb.org/t/p/w185/sb.jpg')
})

test('Un film sans fiche TMDB compte pour son réalisateur, pas pour ses acteurs ; le film source vient d’un film associé', () => {
  const { directors, actors } = rankFilmPeople([
    film(null, ['Chantal Akerman'], []),
    film(31, ['Chantal Akerman'], ['Delphine Seyrig']),
    film(null, ['Chantal Akerman'], []),
  ])
  assert.deepEqual(directors.map(entry => [entry.name, entry.count, entry.sourceTmdbId]), [['Chantal Akerman', 3, 31]])
  assert.deepEqual(actors.map(entry => [entry.name, entry.count]), [['Delphine Seyrig', 1]])
  assert.equal(rankFilmPeople([film(null, ['Sans Photo'], [])]).directors[0].sourceTmdbId, undefined, 'aucun film associé : pas de photo à demander')
})

test('Réalisateurs d’une fiche : plusieurs noms séparés par une virgule, espaces nettoyés, champ vide ignoré', () => {
  assert.deepEqual(splitDirectors('Daniel Kwan,  Daniel Scheinert '), ['Daniel Kwan', 'Daniel Scheinert'])
  assert.deepEqual(splitDirectors('Wim Wenders'), ['Wim Wenders'])
  assert.deepEqual(splitDirectors(null), [])
  assert.deepEqual(splitDirectors(' , '), [])
})

test('Limites : trois réalisateurs et six acteurs proposés au plus', () => {
  const films = Array.from({ length: 8 }, (_, i) => film(i + 1, [`Réalisateur ${i}`], [`Acteur ${i}`, `Acteur ${i + 1}`]))
  const { directors, actors } = rankFilmPeople(films)
  assert.equal(directors.length, 3)
  assert.equal(actors.length, 6)
  assert.deepEqual(rankFilmPeople([]), { directors: [], actors: [] })
})

test('Auteur le plus lu, studio le plus joué : seulement les œuvres terminées de la bibliothèque, sans tenir compte de la casse', () => {
  const books = { kind: 'library', library: 'books' }
  const items = [
    item('books', { creator: 'Haruki Murakami' }), item('books', { creator: 'haruki murakami' }), item('books', { creator: 'Annie Ernaux' }),
    item('books', { creator: 'Annie Ernaux', done: false }), item('books', { creator: 'Annie Ernaux', done: false }),
    item('books', { creator: null }), item('mangas', { creator: 'Haruki Murakami' }), item('books', { creator: 'Albert Camus' }),
  ]
  const authors = rankCreators(items, books, 'author')
  assert.deepEqual(authors.map(entry => [entry.name, entry.count, entry.role]), [['Haruki Murakami', 2, 'author'], ['Albert Camus', 1, 'author'], ['Annie Ernaux', 1, 'author']], 'les envies et les autres bibliothèques ne comptent pas')
  assert.equal(authors[0].portraitUrl, null)
  const games = rankCreators([item('games', { creator: 'FromSoftware' }), item('games', { creator: 'FromSoftware' }), item('games', { creator: 'Supergiant' })], { kind: 'library', library: 'games' }, 'studio')
  assert.deepEqual(games.map(entry => [entry.name, entry.count, entry.role]), [['FromSoftware', 2, 'studio'], ['Supergiant', 1, 'studio']])
  assert.equal(rankCreators(Array.from({ length: 6 }, (_, i) => item('books', { creator: `Auteur ${i}` })), books, 'author').length, 3, 'trois propositions au plus')
  assert.deepEqual(rankCreators(items, { kind: 'profile' }, 'author'), [], 'rien pour tout le profil')
})

test('Ce que chaque bibliothèque propose : réalisateur et acteurs, auteur, studio ; rien pour les séries, l’animation et l’art', () => {
  const options = key => peopleOptionsFor(key === 'profile' ? { kind: 'profile' } : { kind: 'library', library: key })
  assert.deepEqual(options('films'), ['director', 'actor'])
  assert.deepEqual(options('series'), [], 'aucune personne à proposer : pas d’étape « Personnes »')
  assert.deepEqual(options('anime'), [])
  assert.deepEqual(options('books'), ['author'])
  assert.deepEqual(options('mangas'), ['author'])
  assert.deepEqual(options('games'), ['studio'])
  assert.deepEqual(options('artworks'), [])
})

test('Choix d’office : le réalisateur le plus vu, ses trois acteurs, l’auteur ou le studio le plus fréquent', () => {
  const ranked = rankFilmPeople([
    film(1, ['A', 'B'], ['a1', 'a2', 'a3', 'a4', 'a5']), film(2, ['A'], ['a1', 'a2', 'a3', 'a4']), film(3, ['B'], ['a1', 'a2', 'a3']),
  ])
  const ids = defaultPeopleIds([...ranked.directors, ...ranked.actors])
  const names = [...ranked.directors, ...ranked.actors].filter(entry => ids.includes(entry.id)).map(entry => entry.name)
  assert.deepEqual(names, ['A', 'a1', 'a2', 'a3'], 'un réalisateur et trois acteurs')
  const authors = rankCreators([item('books', { creator: 'X' }), item('books', { creator: 'Y' })], { kind: 'library', library: 'books' }, 'author')
  assert.equal(defaultPeopleIds(authors).length, 1)
  assert.deepEqual(defaultPeopleIds([]), [])
})

test('Ordre sur la carte : réalisateur, acteurs, auteur ou studio ; au plus cinq', () => {
  const person = (role, name) => ({ id: `${role}:${name}`, role, name, count: 1, portraitUrl: null })
  const ordered = orderPeople([person('studio', 'S1'), person('actor', 'A1'), person('director', 'D1'), person('actor', 'A2'), person('author', 'B1'), person('actor', 'A3')])
  assert.deepEqual(ordered.map(entry => entry.name), ['D1', 'A1', 'A2', 'A3', 'B1'], 'cinq au plus, dans l’ordre des rôles')
})

test('Légendes : le rôle et le nombre, au singulier ou au pluriel, avec le vocabulaire de la bibliothèque', () => {
  const cap = (role, count, library) => personCaption({ id: 'x', role, name: 'N', count, portraitUrl: null }, library)
  assert.deepEqual(cap('director', 7, 'films'), { key: 'Réalisateur · {count} films', params: { count: '7' } })
  assert.deepEqual(cap('director', 1, 'films'), { key: 'Réalisateur · {count} film', params: { count: '1' } })
  assert.deepEqual(cap('actor', 5, 'films'), { key: 'Au casting · {count} films', params: { count: '5' } })
  assert.deepEqual(cap('author', 6, 'books'), { key: 'Auteur · {count} livres', params: { count: '6' } })
  assert.deepEqual(cap('author', 1, 'mangas'), { key: 'Auteur · {count} manga', params: { count: '1' } })
  assert.deepEqual(cap('author', 4, 'mangas'), { key: 'Auteur · {count} mangas', params: { count: '4' } })
  assert.deepEqual(cap('studio', 3, 'games'), { key: 'Studio · {count} jeux', params: { count: '3' } })
})

test('Initiales : les deux premières lettres significatives, majuscules, accents conservés', () => {
  assert.equal(personInitials('Haruki Murakami'), 'HM')
  assert.equal(personInitials('éric rohmer'), 'ÉR')
  assert.equal(personInitials('FromSoftware'), 'F')
  assert.equal(personInitials('  '), '?')
  assert.equal(personInitials('Jean-Pierre Jeunet'), 'JJ')
})

test('Sur la carte : les personnes choisies sont reprises avec leur légende ; sans choix, aucune', () => {
  const items = [item('books', { creator: 'Annie Ernaux', isFavorite: true, rating: 5 })]
  const scope = { kind: 'library', library: 'books' }
  const author = { id: 'author:annie ernaux', role: 'author', name: 'Annie Ernaux', count: 3, portraitUrl: null }
  const card = buildShareCard(items, scope, 'A', { limits: { favorites: 7 }, now: NOW, people: [author] })
  assert.equal(card.people.length, 1)
  assert.equal(card.people[0].name, 'Annie Ernaux')
  assert.deepEqual(card.people[0].caption, { key: 'Auteur · {count} livres', params: { count: '3' } })
  assert.deepEqual(buildShareCard(items, scope, 'A', { limits: { favorites: 7 }, now: NOW }).people, [])
  const six = Array.from({ length: 6 }, (_, i) => ({ id: `actor:${i}`, role: 'actor', name: `P${i}`, count: 2, portraitUrl: null }))
  assert.equal(buildShareCard([item('films', { isFavorite: true })], { kind: 'library', library: 'films' }, 'A', { limits: { favorites: 7 }, now: NOW, people: six }).people.length, MAX_SHARE_PEOPLE, 'cinq au plus')
  const art = buildShareCard([item('artworks', { isFavorite: true })], { kind: 'library', library: 'artworks' }, 'A', { limits: { favorites: 7 }, now: NOW, people: [author] })
  assert.deepEqual(art.people, [], 'l’art ne propose aucune personne')
  const series = buildShareCard([item('series', { isFavorite: true })], { kind: 'library', library: 'series' }, 'A', { limits: { favorites: 7 }, now: NOW, people: [author] })
  assert.deepEqual(series.people, [], 'les séries ne proposent aucune personne')
})

const PROFILE = { kind: 'profile' }

test('Profil : tout est proposé (réalisateur, acteurs, auteur, studio)', () => {
  assert.deepEqual(peopleOptionsFor(PROFILE), ['director', 'actor', 'author', 'studio'])
})

test('Profil : auteurs des livres et des mangas, studios des jeux, chacun classé dans sa bibliothèque, avec un identifiant distinct', () => {
  const items = [
    item('books', { creator: 'Ursula Le Guin' }), item('books', { creator: 'Ursula Le Guin' }), item('books', { creator: 'Annie Ernaux' }), item('books', { creator: 'Un autre' }),
    item('mangas', { creator: 'Ursula Le Guin' }), item('mangas', { creator: 'Eiichiro Oda' }),
    item('games', { creator: 'Nintendo' }), item('games', { creator: 'Nintendo' }), item('games', { creator: 'FromSoftware' }),
    item('films', { creator: 'Un réalisateur : ni auteur ni studio' }), item('books', { creator: 'Jamais lu', done: false }),
  ]
  const ranked = rankProfileCreators(items)
  assert.deepEqual(ranked.map(entry => [entry.role, entry.library, entry.name, entry.count]), [
    ['author', 'books', 'Ursula Le Guin', 2], ['author', 'books', 'Annie Ernaux', 1],
    ['author', 'mangas', 'Eiichiro Oda', 1], ['author', 'mangas', 'Ursula Le Guin', 1],
    ['studio', 'games', 'Nintendo', 2], ['studio', 'games', 'FromSoftware', 1],
  ], 'deux au plus par bibliothèque, œuvres terminées seulement')
  assert.equal(new Set(ranked.map(entry => entry.id)).size, ranked.length, 'la même autrice en livre et en manga reste deux personnes à cocher')
})

test('Profil : d’office, une personne par rôle et bibliothèque (réalisateur, auteurs, studio, puis un acteur), cinq au plus', () => {
  const person = (role, name, library) => ({ id: `${role}:${name}@${library}`, role, name, count: 3, portraitUrl: null, library })
  const all = [
    person('director', 'D1', 'films'), person('director', 'D2', 'films'),
    person('actor', 'A1', 'films'), person('actor', 'A2', 'films'), person('actor', 'A3', 'films'),
    person('author', 'L1', 'books'), person('author', 'L2', 'books'),
    person('author', 'M1', 'mangas'),
    person('studio', 'S1', 'games'), person('studio', 'S2', 'games'),
  ]
  const ids = defaultPeopleIds(all, true)
  assert.deepEqual(ids.map(id => id.split(':')[1].split('@')[0]), ['D1', 'A1', 'L1', 'M1', 'S1'])
  assert.equal(ids.length, MAX_SHARE_PEOPLE)
  assert.deepEqual(defaultPeopleIds(all.filter(entry => entry.library === 'books'), true).length, 1, 'une seule bibliothèque : un seul auteur')
  assert.deepEqual(defaultPeopleIds(all.filter(entry => entry.role !== 'studio' && entry.role !== 'author'), false).length, 4, 'une bibliothèque seule : inchangé (un réalisateur, trois acteurs)')
})

test('Légende : la bibliothèque de la personne prime sur celle de la carte (un auteur de manga reste un auteur de manga sur le profil)', () => {
  assert.equal(personCaption({ id: 'a', role: 'author', name: 'Oda', count: 2, portraitUrl: null, library: 'mangas' }, 'books').key, 'Auteur · {count} mangas')
  assert.equal(personCaption({ id: 'a', role: 'author', name: 'Oda', count: 2, portraitUrl: null }, 'mangas').key, 'Auteur · {count} mangas')
})
