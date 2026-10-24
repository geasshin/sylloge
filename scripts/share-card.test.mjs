// Cartes à partager : ce que la carte retient d'une bibliothèque ou de tout le profil.
// La sélection est une logique pure (aucun dessin) : coups de cœur, mieux notées, vues récemment,
// chiffres clés. Le dessin de l'image est testé à part, dans le navigateur.
import assert from 'node:assert/strict'
import test from 'node:test'
import { statusTone, isDoneStatus } from '../src/domain/statusTone.ts'
import { buildShareCard, collectShareItems, shareScopes, SHARE_LIMITS, withDisplayedImages } from '../src/domain/shareCard.ts'

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
  assert.deepEqual(byKey['films:f1'], { key: 'films:f1', id: 'f1', library: 'films', title: 'Film f1', creator: null, year: 2020, rating: 4.5, isFavorite: true, done: true, doneAt: '2026-03-01', imageUrl: 'https://image.tmdb.org/a.jpg' })
  assert.equal(byKey['series:s1'].creator, 'Créateur')
  assert.equal(byKey['series:s1'].doneAt, '2026-04-01T10:00:00.000Z')
  assert.equal(byKey['anime:a1'].done, false)
  assert.equal(byKey['books:b1'].doneAt, '2026-01-05', 'un livre sans date de progression retombe sur sa date de début')
  assert.equal(byKey['mangas:m1'].doneAt, '2026-02-01T00:00:00.000Z', 'sans date propre : la dernière modification')
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

test('Coups de cœur d’abord (mieux notés en tête), puis mieux notés restants, puis vus récemment — sans doublon', () => {
  const card = buildShareCard(collectShareItems(sample()), { kind: 'profile' }, 'Aurélien')
  const keys = section => card.sections[section].map(item => item.key)

  assert.deepEqual(keys('favorites'), ['films:f1', 'films:f2', 'films:f3'], 'favoris : note décroissante, sans note en dernier')
  assert.deepEqual(keys('topRated'), ['films:f6', 'films:f4', 'books:b1'], '≥ 4 étoiles, hors favoris : note puis récence')
  assert.deepEqual(keys('recent'), ['films:f5'], 'accomplis récents, hors ce qui est déjà montré')
  const all = [...keys('favorites'), ...keys('topRated'), ...keys('recent')]
  assert.equal(new Set(all).size, all.length, 'aucune œuvre n’apparaît deux fois')
  assert.ok(!all.includes('films:f7'), 'un film à découvrir n’apparaît pas')
})

test('Les sections respectent leurs plafonds et se complètent par ordre de récence', () => {
  const library = emptyLibrary()
  library.films = Array.from({ length: 14 }, (_, index) => film(`f${String(index).padStart(2, '0')}`, { isFavorite: true, rating: 5, watchedAt: `2026-0${(index % 9) + 1}-01` }))
  library.series = Array.from({ length: 12 }, (_, index) => series(`s${String(index).padStart(2, '0')}`, { rating: 4.5 }))
  library.games = Array.from({ length: 12 }, (_, index) => game(`g${String(index).padStart(2, '0')}`, { playedAt: `2026-1${index % 3}-0${(index % 8) + 1}` }))
  const card = buildShareCard(collectShareItems(library), { kind: 'profile' }, 'Aurélien')
  assert.equal(card.sections.favorites.length, SHARE_LIMITS.favorites)
  assert.equal(card.sections.topRated.length, SHARE_LIMITS.topRated)
  assert.equal(card.sections.recent.length, SHARE_LIMITS.recent)
  const recent = card.sections.recent.map(item => item.doneAt)
  assert.deepEqual(recent, [...recent].sort().reverse(), 'vus récemment : du plus récent au plus ancien')
})

test('Une carte de bibliothèque ne retient que cette bibliothèque', () => {
  const card = buildShareCard(collectShareItems(sample()), { kind: 'library', library: 'books' }, 'Aurélien')
  assert.deepEqual(card.heading, { kind: 'library', label: 'Livres' })
  assert.deepEqual(card.sections.favorites, [])
  assert.deepEqual(card.sections.topRated.map(item => item.key), ['books:b1'])
  assert.equal(card.stats.total, 1)
  assert.equal(card.stats.perLibrary, null)
})

test('Chiffres clés : fiches, accomplies, favoris, note moyenne, répartition par bibliothèque', () => {
  const card = buildShareCard(collectShareItems(sample()), { kind: 'profile' }, 'Aurélien')
  assert.deepEqual(card.heading, { kind: 'profile', name: 'Aurélien' })
  assert.equal(card.stats.total, 8)
  assert.equal(card.stats.done, 7)
  assert.equal(card.stats.favorites, 3)
  assert.equal(card.stats.averageRating, 4.3, 'moyenne de 5, 4, 4,5, 3,5, 5 et 4 (26 / 6 = 4,33) sur les fiches notées, arrondie au dixième')
  assert.deepEqual(card.stats.perLibrary, [{ library: 'films', label: 'Films', count: 7 }, { library: 'books', label: 'Livres', count: 1 }])
})

test('Sans aucune note, la moyenne est absente et non zéro', () => {
  const library = emptyLibrary()
  library.films = [film('f1')]
  const card = buildShareCard(collectShareItems(library), { kind: 'profile' }, 'A')
  assert.equal(card.stats.averageRating, null)
})

test('Une bibliothèque vide ou sans rien à montrer donne une carte vide', () => {
  const empty = buildShareCard([], { kind: 'profile' }, 'A')
  assert.equal(empty.isEmpty, true)
  const library = emptyLibrary()
  library.films = [film('f1', { status: 'à découvrir' })]
  const onlyTodo = buildShareCard(collectShareItems(library), { kind: 'profile' }, 'A')
  assert.equal(onlyTodo.isEmpty, true, 'une envie de film ne fait pas une carte')
  assert.equal(onlyTodo.stats.total, 1)
})

test('Départage stable : à note et date égales, l’ordre alphabétique décide', () => {
  const library = emptyLibrary()
  library.films = [film('b', { title: 'Zorro', isFavorite: true, rating: 5, watchedAt: '2026-01-01' }), film('a', { title: 'Alien', isFavorite: true, rating: 5, watchedAt: '2026-01-01' })]
  const card = buildShareCard(collectShareItems(library), { kind: 'profile' }, 'A')
  assert.deepEqual(card.sections.favorites.map(item => item.title), ['Alien', 'Zorro'])
})

test('Les choix de portée : le profil, puis seulement les bibliothèques qui contiennent quelque chose', () => {
  const library = sample()
  library.customLibraries = [
    { libraryId: 'music', position: 0, addedAt: '2026-01-01T00:00:00.000Z', entries: [custom('c1')] },
    { libraryId: 'comics', position: 1, addedAt: '2026-01-01T00:00:00.000Z', entries: [] },
  ]
  const scopes = shareScopes(library)
  assert.deepEqual(scopes.map(scope => scope.kind === 'profile' ? 'profil' : scope.library), ['profil', 'films', 'books', 'music'])
  assert.equal(scopes[3].label, 'Musique')
})

test('Le prénom du profil accompagne toute carte, de profil comme de bibliothèque', () => {
  assert.equal(buildShareCard([], { kind: 'profile' }, 'Aurélien').profileName, 'Aurélien')
  assert.equal(buildShareCard([], { kind: 'library', library: 'films' }, 'Aurélien').profileName, 'Aurélien')
})

test('Les images affichées remplacent celles de la colonne locale, seulement pour les œuvres montrées', async () => {
  const library = emptyLibrary()
  library.films = [film('f1', { isFavorite: true, rating: 5, posterUrl: 'https://local/ancienne.jpg' }), film('f2', { isFavorite: true, rating: 4, posterUrl: 'https://local/f2.jpg' })]
  library.books = [book('b1', { isFavorite: true, rating: 3, coverUrl: 'https://x/b.jpg' })]
  const card = buildShareCard(collectShareItems(library), { kind: 'profile' }, 'A')
  const asked = []
  const resolved = await withDisplayedImages(card, async entry => {
    asked.push(entry.key)
    if (entry.key === 'films:f1') return 'https://image.tmdb.org/choisie.jpg'
    if (entry.key === 'films:f2') throw new Error('cache illisible')
    return entry.imageUrl
  })
  assert.deepEqual(asked.sort(), ['books:b1', 'films:f1', 'films:f2'])
  const byKey = Object.fromEntries(resolved.sections.favorites.map(entry => [entry.key, entry.imageUrl]))
  assert.equal(byKey['films:f1'], 'https://image.tmdb.org/choisie.jpg', 'l’affiche affichée gagne')
  assert.equal(byKey['films:f2'], 'https://local/f2.jpg', 'une lecture impossible garde l’image locale')
  assert.equal(byKey['books:b1'], 'https://x/b.jpg')
  assert.equal(card.sections.favorites[0].imageUrl, 'https://local/ancienne.jpg', 'le modèle d’origine n’est pas modifié')
  assert.equal(resolved.stats, card.stats)
})
