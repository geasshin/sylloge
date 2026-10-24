// Cartes à partager : ce que la carte retient d'une bibliothèque ou de tout le profil.
// La sélection est une logique pure (aucun dessin) : coups de cœur, mieux notées, vues récemment,
// chiffres clés. Le dessin de l'image est testé à part, dans le navigateur.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { statusTone, isDoneStatus } from '../src/domain/statusTone.ts'
import { buildShareCard, collectShareItems, shareScopes, withDisplayedImages } from '../src/domain/shareCard.ts'

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
const LIMITS = { favorites: 4, recent: 4 }
const build = (items, scope, limits = LIMITS) => buildShareCard(items, scope, 'Aurélien', { limits, now: NOW })
const films = scope => ({ kind: 'library', library: 'films' })

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
  assert.equal(Object.hasOwn(card.sections, 'topRated'), false, 'plus de section « mieux notés »')
})

test('À note égale, le favori le plus récemment vu passe devant, puis l’ordre alphabétique', () => {
  const items = filmLibrary([
    film('z', { isFavorite: true, rating: 4, watchedAt: '2026-01-01', title: 'Zorro' }),
    film('a', { isFavorite: true, rating: 4, watchedAt: '2026-05-01', title: 'Alien' }),
    film('b', { isFavorite: true, rating: 4, watchedAt: '2026-05-01', title: 'Brazil' }),
  ])
  assert.deepEqual(build(items, films()).sections.favorites.map(entry => entry.id), ['a', 'b', 'z'])
})

test('Les favoris respectent le plafond du format ; ce qui reste ne fait pas doublon dans les terminés récemment', () => {
  const items = filmLibrary([
    ...Array.from({ length: 6 }, (_, i) => film(`f${i}`, { isFavorite: true, rating: 5 - i * 0.5, watchedAt: `2026-0${i + 1}-01` })),
    film('r1', { watchedAt: '2026-09-01' }), film('r2', { watchedAt: '2026-08-01' }), film('r3', { watchedAt: '2026-07-01' }), film('r4', { watchedAt: '2026-06-15' }), film('r5', { watchedAt: '2026-05-05' }),
  ])
  const card = build(items, films())
  assert.equal(card.sections.favorites.length, 4)
  assert.deepEqual(card.sections.favorites.map(entry => entry.id), ['f0', 'f1', 'f2', 'f3'])
  assert.deepEqual(card.sections.recent.map(entry => entry.id), ['r1', 'r2', 'r3', 'r4'], 'du plus récent au plus ancien, favoris exclus de la liste récente')
  const keys = [...card.sections.favorites, ...card.sections.recent].map(entry => entry.key)
  assert.equal(new Set(keys).size, keys.length, 'aucune œuvre en double')
})

test('Une envie (à voir, à lire) ne fait pas une carte ; un favori jamais terminé reste un coup de cœur', () => {
  const items = filmLibrary([film('a', { status: 'à découvrir' }), film('b', { status: 'à découvrir', isFavorite: true, rating: 4 })])
  const card = build(items, films())
  assert.deepEqual(card.sections.recent, [])
  assert.deepEqual(card.sections.favorites.map(entry => entry.id), ['b'])
})

test('Carte de bibliothèque : trois chiffres propres à la bibliothèque, ni fiches totales ni note moyenne', () => {
  const items = filmLibrary([
    film('a', { watchedAt: '2026-03-01', isFavorite: true, rating: 5 }),
    film('b', { watchedAt: '2025-12-31' }),
    film('c', { watchedAt: '2026-10-01' }),
    film('d', { status: 'à découvrir' }), film('e', { status: 'à découvrir' }),
    film('f', { status: 'terminé' }), // terminé sans date de visionnage : compte comme vu, mais pas « cette année »
  ])
  const { stats } = build(items, films())
  assert.deepEqual(stats.cells, [
    { value: 4, label: 'films vus' },
    { value: 2, label: 'vus en {year}', params: { year: '2026' } },
    { value: 1, label: 'coup de cœur' },
  ])
  assert.equal(stats.perLibrary, null)
  assert.equal(JSON.stringify(stats).includes('average'), false)
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
  assert.deepEqual(labels('films'), ['film vu', 'vus en {year}', 'coup de cœur'], '1 film : singulier ; 0 favori : singulier')
  assert.deepEqual(labels('series'), ['séries vues', 'vues en {year}', 'coup de cœur'])
  assert.deepEqual(labels('anime'), ['animation vue', 'vues en {year}', 'coup de cœur'])
  assert.deepEqual(labels('books'), ['livres lus', 'lus en {year}', 'coup de cœur'])
  assert.deepEqual(labels('mangas'), ['mangas lus', 'lus en {year}', 'coup de cœur'])
  assert.deepEqual(labels('games'), ['jeux terminés', 'terminés en {year}', 'coup de cœur'])
  assert.deepEqual(labels('artworks'), ['œuvres découvertes', 'découvertes en {year}', 'coup de cœur'])
  const titles = key => build(items, { kind: 'library', library: key }).titles.recent
  assert.equal(titles('films'), 'Derniers films vus')
  assert.equal(titles('series'), 'Dernières séries vues')
  assert.equal(titles('books'), 'Derniers livres lus')
  assert.equal(titles('games'), 'Derniers jeux terminés')
  assert.equal(titles('artworks'), 'Dernières œuvres découvertes')
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
    { value: 1, label: 'coup de cœur' },
  ])
  assert.deepEqual(card.stats.perLibrary, [
    { library: 'films', label: 'Films', count: 1 },
    { library: 'series', label: 'Séries', count: 1 },
    { library: 'books', label: 'Livres', count: 1 },
  ], 'les bibliothèques sans rien de terminé n’y figurent pas')
  assert.equal(card.titles.recent, 'Terminés récemment')
  assert.equal(card.heading.kind, 'profile')
})

test('Carte de profil : les coups de cœur viennent de toutes les bibliothèques, pas d’une seule', () => {
  const library = emptyLibrary()
  library.films = Array.from({ length: 6 }, (_, i) => film(`f${i}`, { isFavorite: true, rating: 5, watchedAt: `2026-0${i + 1}-01` }))
  library.series = [series('s1', { isFavorite: true, rating: 4 })]
  library.books = [book('b1', { isFavorite: true, rating: 3.5 })]
  library.games = [game('g1', { isFavorite: true, rating: 4.5 })]
  const card = build(collectShareItems(library), { kind: 'profile' }, { favorites: 4, recent: 3 })
  const libs = new Set(card.sections.favorites.map(entry => entry.library))
  assert.deepEqual([...libs].sort(), ['books', 'films', 'games', 'series'], 'un favori de chaque bibliothèque avant un deuxième film')
  const ratings = card.sections.favorites.map(entry => entry.rating)
  assert.deepEqual(ratings, [...ratings].sort((a, b) => b - a), 'et l’ordre final reste celui des notes')
})

test('Une bibliothèque sans rien d’accompli ni de favori donne une carte vide', () => {
  const empty = build(filmLibrary([film('a', { status: 'à découvrir' })]), films())
  assert.equal(empty.isEmpty, true)
  assert.equal(build([], { kind: 'profile' }).isEmpty, true)
  assert.equal(build(filmLibrary([film('a')]), films()).isEmpty, false)
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

test('Les bibliothèques ajoutées comptent dans la carte du profil entier', () => {
  const library = emptyLibrary()
  library.films = [film('f1', { watchedAt: '2026-01-01' })]
  library.customLibraries = [{ libraryId: 'music', position: 0, addedAt: '2026-01-01T00:00:00.000Z', entries: [custom('c1', { finishedAt: '2026-02-02', isFavorite: true, rating: 5 })] }]
  const card = build(collectShareItems(library), { kind: 'profile' })
  assert.equal(card.stats.cells[0].value, 2)
  assert.deepEqual(card.sections.favorites.map(entry => entry.key), ['music:c1'])
})

test('Les images affichées remplacent celles de la colonne locale, seulement pour les œuvres montrées', async () => {
  const items = filmLibrary([
    film('a', { isFavorite: true, rating: 5, posterUrl: 'https://local/a.jpg' }),
    film('b', { watchedAt: '2026-02-02', posterUrl: 'https://local/b.jpg' }),
    film('c', { status: 'à découvrir', posterUrl: 'https://local/c.jpg' }),
  ])
  const asked = []
  const card = await withDisplayedImages(build(items, films()), async entry => { asked.push(entry.id); return `https://shown/${entry.id}.jpg` })
  assert.deepEqual(asked.sort(), ['a', 'b'], 'l’œuvre non montrée n’est pas résolue')
  assert.equal(card.sections.favorites[0].imageUrl, 'https://shown/a.jpg')
  assert.equal(card.sections.recent[0].imageUrl, 'https://shown/b.jpg')
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
