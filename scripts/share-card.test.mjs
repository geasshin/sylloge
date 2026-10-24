// Cartes à partager : ce que la carte retient d'une bibliothèque ou de tout le profil.
// La sélection est une logique pure (aucun dessin) : coups de cœur choisis par la personne (le héros et ses
// voisins), chiffres clés. Le dessin de l'image est testé à part, dans le navigateur.
import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { statusTone, isDoneStatus } from '../src/domain/statusTone.ts'
import {
  buildShareCard, collectShareItems, defaultShareSelection, MAX_SHARE_FAVORITES, setShareHero, shareCandidates, shareLibraryKind, shareScopes, toggleShareOther, withDisplayedImages,
} from '../src/domain/shareCard.ts'

const base = { profileId: 'p', createdAt: '2026-01-01T00:00:00.000Z' }
const film = (id, over = {}) => ({ ...base, id, title: `Film ${id}`, originalTitle: null, year: 2020, status: 'terminé', isFavorite: false, rating: null, watchedAt: null, personalNote: null, director: null, summary: null, posterUrl: null, updatedAt: '2026-02-01T00:00:00.000Z', ...over })
const series = (id, over = {}) => ({ ...base, id, title: `Série ${id}`, showrunner: 'Créateur', status: 'vue', rating: null, isFavorite: false, progressUpdatedAt: null, startedAt: null, posterUrl: null, updatedAt: '2026-02-01T00:00:00.000Z', ...over })
const book = (id, over = {}) => ({ ...base, id, title: `Livre ${id}`, author: 'Autrice', year: 2019, status: 'lu', rating: null, isFavorite: false, progressUpdatedAt: null, startedAt: null, coverUrl: null, updatedAt: '2026-02-01T00:00:00.000Z', ...over })
const game = (id, over = {}) => ({ ...base, id, title: `Jeu ${id}`, developer: 'Studio', year: 2018, status: 'joué', rating: null, isFavorite: false, playedAt: null, coverUrl: null, updatedAt: '2026-02-01T00:00:00.000Z', ...over })
const artwork = (id, over = {}) => ({ ...base, id, title: `Œuvre ${id}`, artist: 'Artiste', year: 1900, status: 'découverte', isFavorite: false, discoveredAt: null, imageUrl: null, updatedAt: '2026-02-01T00:00:00.000Z', ...over })
const custom = (id, over = {}) => ({ ...base, id, title: `Disque ${id}`, creator: 'Groupe', year: 2001, status: 'terminé', rating: null, isFavorite: false, progressUpdatedAt: null, finishedAt: null, coverUrl: null, updatedAt: '2026-02-01T00:00:00.000Z', ...over })

const emptyLibrary = () => ({
  profile: { id: 'p', name: 'Aurélien', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  films: [], series: [], anime: [], books: [], mangas: [], games: [], artworks: [], customLibraries: [],
})

test('Une série « vue » est comptée comme accomplie', () => {
  assert.equal(statusTone('vue'), 'done')
  assert.equal(isDoneStatus('vue'), true)
  for (const done of ['terminé', 'lu', 'joué', 'découverte']) assert.equal(isDoneStatus(done), true, done)
  for (const notDone of ['à voir', 'en cours', 'abandonnée', 'abandonné', 'à découvrir', 'en attente', 'à lire']) assert.equal(isDoneStatus(notDone), false, notDone)
})

test('Toutes les bibliothèques sont aplaties avec leur image, leur créateur et leur date d’accomplissement', () => {
  const library = emptyLibrary()
  library.films = [film('f1', { posterUrl: 'https://image.tmdb.org/a.jpg', watchedAt: '2026-03-01', rating: 4.5, isFavorite: true })]
  library.series = [series('s1', { progressUpdatedAt: '2026-04-01T10:00:00.000Z', posterUrl: 'https://x/s.jpg' })]
  library.anime = [series('a1', { status: 'en cours' })]
  library.books = [book('b1', { coverUrl: 'https://x/b.jpg', startedAt: '2026-01-05' })]
  library.mangas = [book('m1')]
  library.games = [game('g1', { playedAt: '2026-05-05', coverUrl: 'https://x/g.jpg' })]
  library.artworks = [artwork('w1', { imageUrl: 'https://x/w.jpg', discoveredAt: '2026-06-06' })]
  library.customLibraries = [{ libraryId: 'music', position: 0, addedAt: '2026-01-01T00:00:00.000Z', entries: [custom('c1', { finishedAt: '2026-07-07', coverUrl: 'https://x/c.jpg', rating: 3 })] }]

  const items = collectShareItems(library)
  const byKey = Object.fromEntries(items.map(item => [item.key, item]))
  assert.equal(items.length, 8, 'un élément par fiche : sept bibliothèques de base et une ajoutée')
  assert.deepEqual(byKey['films:f1'], { key: 'films:f1', id: 'f1', library: 'films', title: 'Film f1', creator: null, year: 2020, rating: 4.5, isFavorite: true, done: true, doneAt: '2026-03-01', doneOn: '2026-03-01', imageUrl: 'https://image.tmdb.org/a.jpg' })
  assert.equal(byKey['series:s1'].creator, 'Créateur')
  assert.equal(byKey['series:s1'].doneAt, '2026-04-01T10:00:00.000Z')
  assert.equal(byKey['anime:a1'].done, false)
  assert.equal(byKey['books:b1'].doneAt, '2026-01-05', 'un livre sans date de progression retombe sur sa date de début')
  assert.equal(byKey['mangas:m1'].doneAt, '2026-02-01T00:00:00.000Z', 'sans date propre : la dernière modification')
  assert.equal(byKey['mangas:m1'].doneOn, null, 'mais pas de date « propre » : elle ne compte pas dans « cette année »')
  assert.equal(byKey['games:g1'].imageUrl, 'https://x/g.jpg')
  assert.equal(byKey['artworks:w1'].rating, null, 'l’Art n’a pas de note chiffrée')
  assert.equal(byKey['artworks:w1'].imageUrl, 'https://x/w.jpg')
  assert.equal(byKey['music:c1'].library, 'music')
  assert.equal(byKey['music:c1'].doneAt, '2026-07-07')
})

test('Un film non terminé n’est pas « accompli » et n’a pas de date d’accomplissement', () => {
  const library = emptyLibrary()
  library.films = [film('f1', { status: 'à découvrir', watchedAt: '2026-03-01' })]
  const [item] = collectShareItems(library)
  assert.equal(item.done, false)
  assert.equal(item.doneAt, null)
})

const sample = () => {
  const library = emptyLibrary()
  library.films = [
    film('f1', { isFavorite: true, rating: 5, watchedAt: '2026-03-01' }),
    film('f2', { isFavorite: true, rating: 4, watchedAt: '2026-09-01' }),
    film('f3', { isFavorite: true, rating: null, watchedAt: '2026-10-01' }),
    film('f4', { rating: 4.5, watchedAt: '2026-08-01' }),
    film('f5', { rating: 3.5, watchedAt: '2026-10-20' }),
    film('f6', { rating: 5, watchedAt: '2026-01-10' }),
    film('f7', { status: 'à découvrir' }),
  ]
  library.books = [book('b1', { rating: 4, progressUpdatedAt: '2026-10-22T08:00:00.000Z' })]
  return library
}


const NOW = new Date('2026-10-24T10:00:00')
const LIMITS = { favorites: 4 }
const build = (items, scope, extra = {}, limits = LIMITS) => buildShareCard(items, scope, 'Aurélien', { limits, now: NOW, ...extra })
const films = () => ({ kind: 'library', library: 'films' })

function filmLibrary(entries) {
  const library = emptyLibrary()
  library.films = entries
  return collectShareItems(library)
}

test('Coups de cœur : seulement les favoris, du mieux noté au moins bien noté ; une bonne note sans cœur n’y figure pas', () => {
  const items = filmLibrary([
    film('a', { isFavorite: true, rating: 3.5 }),
    film('b', { isFavorite: true, rating: 5 }),
    film('c', { isFavorite: true, rating: 4.5 }),
    film('d', { rating: 5 }),
    film('e', { isFavorite: true }),
  ])
  const card = build(items, films())
  assert.deepEqual(card.sections.favorites.map(entry => entry.id), ['b', 'c', 'a', 'e'], 'par note décroissante, sans note en dernier ; « d » (5 étoiles, sans cœur) absent')
  assert.deepEqual(Object.keys(card.sections), ['favorites'], 'plus de section « mieux notés » ni « derniers terminés »')
  assert.deepEqual(Object.keys(card.titles), ['favorites'])
})

test('À note égale, le favori le plus récemment vu passe devant, puis l’ordre alphabétique', () => {
  const items = filmLibrary([
    film('z', { isFavorite: true, rating: 4, watchedAt: '2026-01-01', title: 'Zorro' }),
    film('a', { isFavorite: true, rating: 4, watchedAt: '2026-05-01', title: 'Alien' }),
    film('b', { isFavorite: true, rating: 4, watchedAt: '2026-05-01', title: 'Brazil' }),
  ])
  assert.deepEqual(build(items, films()).sections.favorites.map(entry => entry.id), ['a', 'b', 'z'])
})

const sevenFavorites = () => filmLibrary([
  ...Array.from({ length: 9 }, (_, i) => film(`f${i}`, { isFavorite: true, rating: 5 - i * 0.5, watchedAt: `2026-0${i + 1}-01` })),
  film('seen', { rating: 5, watchedAt: '2026-09-01' }),
])

test('Sans choix, les favoris respectent le plafond du format ; aucune œuvre en double, aucun film vu sans cœur', () => {
  const card = build(sevenFavorites(), films())
  assert.deepEqual(card.sections.favorites.map(entry => entry.id), ['f0', 'f1', 'f2', 'f3'])
  const keys = card.sections.favorites.map(entry => entry.key)
  assert.equal(new Set(keys).size, keys.length)
  assert.equal(shareCandidates(sevenFavorites(), films()).length, 9, 'neuf favoris proposés au choix, pas le film vu sans cœur')
  assert.equal(MAX_SHARE_FAVORITES, 7)
})

test('Le choix de la personne : le héros d’abord, puis les voisins par note décroissante, quel que soit l’ordre des clics', () => {
  const items = sevenFavorites()
  const key = id => `films:${id}`
  const card = build(items, films(), { selection: [key('f5'), key('f3'), key('f0'), key('f7')] }, { favorites: 7 })
  assert.deepEqual(card.sections.favorites.map(entry => entry.id), ['f5', 'f0', 'f3', 'f7'], 'f5 (2,5 étoiles) reste le héros malgré sa note')
  assert.equal(card.isEmpty, false)
})

test('Le choix ignore ce qui n’est pas un coup de cœur de la portée, les doublons et ce qui dépasse le plafond', () => {
  const library = emptyLibrary()
  library.films = [film('a', { isFavorite: true, rating: 4 }), film('b', { rating: 5 })]
  library.books = [book('x', { isFavorite: true, rating: 5 })]
  const items = collectShareItems(library)
  const card = build(items, films(), { selection: ['films:b', 'books:x', 'films:inconnu', 'films:a', 'films:a'] })
  assert.deepEqual(card.sections.favorites.map(entry => entry.key), ['films:a'], 'ni le film sans cœur, ni le livre, ni une clé inconnue, ni de doublon')
  const many = sevenFavorites()
  const keys = shareCandidates(many, films()).map(entry => entry.key)
  assert.equal(build(many, films(), { selection: keys }, { favorites: 7 }).sections.favorites.length, 7, 'jamais plus de sept')
  assert.equal(build(many, films(), { selection: [] }).isEmpty, true, 'une sélection vide donne une carte vide')
})

test('setShareHero : le nouvel élu passe en tête, l’ancien héros devient un voisin ; toggleShareOther respecte le plafond', () => {
  assert.deepEqual(setShareHero(['a', 'b', 'c'], 'c'), ['c', 'a', 'b'])
  assert.deepEqual(setShareHero(['a', 'b'], 'z'), ['z', 'a', 'b'])
  assert.deepEqual(setShareHero(['a', 'b', 'c'], 'z', 3), ['z', 'a', 'b'], 'le dernier voisin cède sa place')
  assert.deepEqual(toggleShareOther(['a', 'b'], 'c'), ['a', 'b', 'c'])
  assert.deepEqual(toggleShareOther(['a', 'b', 'c'], 'b'), ['a', 'c'], 'un second clic retire')
  assert.deepEqual(toggleShareOther(['a', 'b'], 'a'), ['a', 'b'], 'le héros ne se retire pas en voisin')
  assert.deepEqual(toggleShareOther(['a', 'b', 'c'], 'd', 3), ['a', 'b', 'c'], 'plafond atteint : rien ne s’ajoute')
  assert.deepEqual(toggleShareOther([], 'a'), ['a'])
})

test('Choix d’office : le mieux noté en héros ; sur un profil, une bibliothèque de chaque avant un deuxième film', () => {
  const library = emptyLibrary()
  library.films = Array.from({ length: 5 }, (_, i) => film(`f${i}`, { isFavorite: true, rating: 5 }))
  library.series = [series('s1', { isFavorite: true, rating: 4 })]
  library.books = [book('b1', { isFavorite: true, rating: 3.5 })]
  const items = collectShareItems(library)
  const profile = { kind: 'profile' }
  const keys = defaultShareSelection(shareCandidates(items, profile), profile, 4)
  assert.equal(keys.length, 4)
  assert.deepEqual(new Set(keys.map(key => key.split(':')[0])), new Set(['films', 'series', 'books']))
  assert.deepEqual(defaultShareSelection(shareCandidates(items, films()), films(), 3), ['films:f0', 'films:f1', 'films:f2'])
})

test('Une envie (à voir, à lire) ne fait pas une carte ; un favori jamais terminé reste proposé', () => {
  const items = filmLibrary([film('a', { status: 'à découvrir' }), film('b', { status: 'à découvrir', isFavorite: true, rating: 4 })])
  const card = build(items, films())
  assert.deepEqual(card.sections.favorites.map(entry => entry.id), ['b'])
})

test('Chiffres : films vus, vus cette année, note moyenne ; jamais le nombre de fiches ni de coups de cœur', () => {
  const items = filmLibrary([
    film('a', { watchedAt: '2026-03-01', isFavorite: true, rating: 5 }),
    film('b', { watchedAt: '2025-12-31', rating: 4 }),
    film('c', { watchedAt: '2026-10-01', rating: 3.5 }),
    film('d', { status: 'à découvrir' }), film('e', { status: 'à découvrir' }),
    film('f', { status: 'terminé' }), // terminé sans date de visionnage : compte comme vu, mais pas « cette année »
  ])
  const { stats } = build(items, films())
  assert.deepEqual(stats.cells, [
    { value: 4, label: 'films vus' },
    { value: 2, label: 'vus en {year}', params: { year: '2026' } },
    { value: 4.2, label: 'note moyenne', format: 'rating' },
  ])
  assert.equal(stats.perLibrary, null)
})

test('Chaque chiffre se retire : les autres restent, et sans aucun chiffre la rangée disparaît', () => {
  const items = filmLibrary([film('a', { watchedAt: '2026-03-01', isFavorite: true, rating: 5 })])
  const labels = stats => build(items, films(), { stats }).stats.cells.map(cell => cell.label)
  assert.deepEqual(labels({ done: false, year: true, average: true }), ['vus en {year}', 'note moyenne'])
  assert.deepEqual(labels({ done: true, year: false, average: false }), ['film vu'])
  assert.deepEqual(labels({ done: false, year: false, average: false }), [])
})

test('Note moyenne : sur les œuvres terminées et notées seulement, arrondie au dixième ; sans note, la case disparaît', () => {
  const rated = filmLibrary([film('a', { rating: 4.5 }), film('b', { rating: 4 }), film('c', { rating: 3 }), film('d', { status: 'à découvrir', rating: 1 })])
  assert.equal(build(rated, films()).stats.cells.at(-1).value, 3.8, '(4,5 + 4 + 3) / 3 = 3,83 ; l’envie notée 1 ne compte pas')
  const unrated = filmLibrary([film('a'), film('b')])
  assert.equal(build(unrated, films()).stats.cells.length, 2)
  assert.ok(!build(unrated, films()).stats.cells.some(cell => cell.format === 'rating'))
  const art = emptyLibrary()
  art.artworks = [artwork('w1'), artwork('w2')]
  assert.equal(build(collectShareItems(art), { kind: 'library', library: 'artworks' }).stats.cells.length, 2, 'l’Art n’a pas de note : pas de moyenne')
})

test('Carte de profil : la note moyenne court sur toutes les bibliothèques notées', () => {
  const library = emptyLibrary()
  library.films = [film('f1', { rating: 5 })]
  library.books = [book('b1', { rating: 4 })]
  library.games = [game('g1', { rating: 3 })]
  const cells = build(collectShareItems(library), { kind: 'profile' }).stats.cells
  assert.deepEqual(cells.at(-1), { value: 4, label: 'note moyenne', format: 'rating' })
})

test('Les mots suivent la bibliothèque : films vus, séries vues, livres lus, jeux terminés… (0 et 1 au singulier)', () => {
  const library = emptyLibrary()
  library.films = [film('f')]
  library.series = [series('s', { status: 'vue' }), series('s2', { status: 'vue' })]
  library.anime = [series('a', { status: 'vue' })]
  library.books = [book('b'), book('b2')]
  library.mangas = [book('m'), book('m2')]
  library.games = [game('g'), game('g2')]
  library.artworks = [artwork('w'), artwork('w2')]
  const items = collectShareItems(library)
  const labels = key => build(items, { kind: 'library', library: key }).stats.cells.map(cell => cell.label)
  assert.deepEqual(labels('films'), ['film vu', 'vus en {year}'], '1 film : singulier')
  assert.deepEqual(labels('series'), ['séries vues', 'vues en {year}'])
  assert.deepEqual(labels('anime'), ['animation vue', 'vues en {year}'])
  assert.deepEqual(labels('books'), ['livres lus', 'lus en {year}'])
  assert.deepEqual(labels('mangas'), ['mangas lus', 'lus en {year}'])
  assert.deepEqual(labels('games'), ['jeux terminés', 'terminés en {year}'])
  assert.deepEqual(labels('artworks'), ['œuvres découvertes', 'découvertes en {year}'])
  assert.equal(build(items, { kind: 'library', library: 'films' }).titles.favorites, 'Coups de cœur')
})

test('Une carte de bibliothèque ne retient que cette bibliothèque', () => {
  const library = emptyLibrary()
  library.films = [film('f1', { isFavorite: true, rating: 4 })]
  library.books = [book('b1', { isFavorite: true, rating: 5 })]
  const card = build(collectShareItems(library), { kind: 'library', library: 'films' })
  assert.deepEqual(card.sections.favorites.map(entry => entry.key), ['films:f1'])
  assert.equal(card.heading.kind, 'library')
  assert.equal(card.heading.label, 'Films')
  assert.equal(card.stats.perLibrary, null, 'pas de ligne « Films 15 · Séries 3 » sur une carte de bibliothèque')
})

test('Carte de profil : chiffres généraux et nombre de terminés par bibliothèque (rien d’inutile)', () => {
  const library = emptyLibrary()
  library.films = [film('f1', { watchedAt: '2026-01-01', isFavorite: true }), film('f2', { status: 'à découvrir' })]
  library.series = [series('s1', { status: 'vue', progressUpdatedAt: '2026-03-03' })]
  library.books = [book('b1', { startedAt: '2025-02-02' }), book('b2', { status: 'à lire' })]
  library.games = [game('g1', { status: 'à jouer' })]
  const card = build(collectShareItems(library), { kind: 'profile' })
  assert.deepEqual(card.stats.cells, [
    { value: 3, label: 'œuvres terminées' },
    { value: 2, label: 'terminées en {year}', params: { year: '2026' } },
  ])
  assert.deepEqual(card.stats.perLibrary, [
    { library: 'films', label: 'Films', count: 1 },
    { library: 'series', label: 'Séries', count: 1 },
    { library: 'books', label: 'Livres', count: 1 },
  ], 'les bibliothèques sans rien de terminé n’y figurent pas')
  assert.equal(card.heading.kind, 'profile')
})

test('Une bibliothèque sans coup de cœur donne une carte vide, même avec des œuvres terminées', () => {
  const empty = build(filmLibrary([film('a', { status: 'à découvrir' })]), films())
  assert.equal(empty.isEmpty, true)
  assert.equal(build([], { kind: 'profile' }).isEmpty, true)
  assert.equal(build(filmLibrary([film('a')]), films()).isEmpty, true, 'un film vu sans cœur ne suffit pas à composer une carte')
  assert.equal(build(filmLibrary([film('a', { isFavorite: true })]), films()).isEmpty, false)
})

test('Le prénom du profil accompagne toute carte', () => {
  assert.equal(build([], { kind: 'profile' }).profileName, 'Aurélien')
  assert.equal(build([], films()).profileName, 'Aurélien')
})

test('Les choix de portée : le profil, puis les bibliothèques de base non vides seulement (pas les bibliothèques ajoutées)', () => {
  const library = emptyLibrary()
  library.films = [film('f1')]
  library.books = [book('b1')]
  library.customLibraries = [{ libraryId: 'music', position: 0, addedAt: '2026-01-01T00:00:00.000Z', entries: [custom('c1')] }]
  assert.deepEqual(shareScopes(library).map(choice => (choice.kind === 'profile' ? 'profil' : choice.library)), ['profil', 'films', 'books'])
})

test('Les bibliothèques ajoutées comptent dans les chiffres du profil, mais ses coups de cœur viennent des sept de base', () => {
  const library = emptyLibrary()
  library.films = [film('f1', { watchedAt: '2026-01-01', isFavorite: true, rating: 4 })]
  library.customLibraries = [{ libraryId: 'music', position: 0, addedAt: '2026-01-01T00:00:00.000Z', entries: [custom('c1', { finishedAt: '2026-02-02', isFavorite: true, rating: 5 })] }]
  const card = build(collectShareItems(library), { kind: 'profile' })
  assert.equal(card.stats.cells[0].value, 2, 'la musique compte parmi les œuvres terminées')
  assert.deepEqual(card.stats.perLibrary.map(entry => entry.library), ['films', 'music'])
  assert.deepEqual(card.sections.favorites.map(entry => entry.key), ['films:f1'], 'mais elle ne propose pas de coup de cœur : décision du 24/10, les sept de base')
  assert.deepEqual(shareCandidates(collectShareItems(library), { kind: 'profile' }).map(entry => entry.library), ['films'])
})

test('Pastille de bibliothèque : un nom au singulier pour chacune des sept, pour savoir d’où vient une œuvre du profil', () => {
  assert.deepEqual(['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks'].map(shareLibraryKind), ['Film', 'Série', 'Animation', 'Livre', 'Manga', 'Jeu', 'Art'])
  assert.equal(shareLibraryKind('music'), 'Musique', 'une bibliothèque ajoutée reprend son nom')
})

test('Profil : les personnes choisies sont reprises avec la légende de leur bibliothèque, dans l’ordre réalisateur → auteur → studio → personnage', () => {
  const library = emptyLibrary()
  library.films = [film('f1', { isFavorite: true, rating: 5 })]
  const person = (role, name, extra = {}) => ({ id: `${role}:${name}`, role, name, count: 2, portraitUrl: null, ...extra })
  const card = build(collectShareItems(library), { kind: 'profile' }, {
    people: [
      person('character', 'Jo March'),
      person('studio', 'Nintendo', { library: 'games' }),
      person('author', 'Ursula Le Guin', { library: 'books' }),
      person('author', 'Eiichiro Oda', { library: 'mangas' }),
      person('director', 'Greta Gerwig', { library: 'films' }),
    ],
  })
  assert.deepEqual(card.people.map(entry => [entry.name, entry.caption.key]), [
    ['Greta Gerwig', 'Réalisateur · {count} films'],
    ['Ursula Le Guin', 'Auteur · {count} livres'],
    ['Eiichiro Oda', 'Auteur · {count} mangas'],
    ['Nintendo', 'Studio · {count} jeux'],
    ['Jo March', 'Personnage préféré'],
  ])
})

test('Les images affichées remplacent celles de la colonne locale, seulement pour les œuvres montrées', async () => {
  const items = filmLibrary([
    film('a', { isFavorite: true, rating: 5, posterUrl: 'https://local/a.jpg' }),
    film('b', { watchedAt: '2026-02-02', posterUrl: 'https://local/b.jpg' }),
    film('c', { isFavorite: true, rating: 3, posterUrl: 'https://local/c.jpg' }),
  ])
  const asked = []
  const card = await withDisplayedImages(build(items, films(), { selection: ['films:a'] }), async entry => { asked.push(entry.id); return `https://shown/${entry.id}.jpg` })
  assert.deepEqual(asked, ['a'], 'ni l’œuvre vue sans cœur, ni le favori non choisi, ne sont résolus')
  assert.equal(card.sections.favorites[0].imageUrl, 'https://shown/a.jpg')
  const failed = await withDisplayedImages(build(items, films()), async () => { throw new Error('réseau') })
  assert.equal(failed.sections.favorites[0].imageUrl, 'https://local/a.jpg', 'en cas d’échec, l’image locale est conservée')
})

test('Le logo de la carte est la tuile Σ de l’application (celle du Dock et du site), jamais l’ancien marque-page', () => {
  const source = readFileSync(new URL('../src/components/shareCardImage.ts', import.meta.url), 'utf8')
  assert.match(source, /assets\/sylloge-mark\.png/)
  assert.doesNotMatch(source, /logo-sylloge\.png/, 'l’ancien logo « S » sur un marque-page')
  const png = readFileSync(new URL('../src/assets/sylloge-mark.png', import.meta.url))
  assert.deepEqual([...png.subarray(0, 4)], [137, 80, 78, 71])
  assert.equal(png.readUInt32BE(16), 256, 'largeur 256')
  assert.equal(png.readUInt32BE(20), 256, 'hauteur 256')
})

test('Plus aucune interface n’affiche l’ancien marque-page « S » : l’application, l’accueil et l’onglet du navigateur portent la tuile Σ', () => {
  const dir = new URL('../src/', import.meta.url)
  const stack = [dir]
  const offenders = []
  while (stack.length) {
    const current = stack.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), current)
      if (entry.isDirectory()) stack.push(url)
      else if (/\.(tsx?|css)$/.test(entry.name) && /logo-sylloge|favicon-sylloge|icon-1024/.test(readFileSync(url, 'utf8'))) offenders.push(entry.name)
    }
  }
  assert.deepEqual(offenders, [], 'ces fichiers importent encore un ancien logo')
  const favicon = readFileSync(new URL('../public/favicon.png', import.meta.url))
  assert.ok(favicon.length < 120_000, `favicon léger (${favicon.length} octets) : l’ancien pesait 574 Ko`)
  assert.ok(!existsSync(new URL('../src/assets/logo-sylloge.png', import.meta.url)), 'l’ancien logo n’est plus livré avec l’application')
})
