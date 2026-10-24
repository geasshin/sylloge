// Cartes à partager : la mise en page. Le calcul est pur (aucune mesure de texte, aucun dessin) :
// il place les blocs et les tuiles sur une toile de 1 080 px de large, dont la hauteur suit le contenu.
// Les invariants qui comptent pour une image qu'on publie : rien ne déborde, rien ne se chevauche,
// une section vide disparaît, et la même carte donne toujours la même mise en page.
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildShareCard, collectShareItems, SHARE_LIMITS } from '../src/domain/shareCard.ts'
import { layoutShareCard, SHARE_CARD } from '../src/domain/shareCardLayout.ts'

const base = { profileId: 'p', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' }
const film = (id, over = {}) => ({ ...base, id, title: `Film ${id}`, year: 2020, status: 'terminé', isFavorite: false, rating: null, watchedAt: null, posterUrl: null, ...over })
const book = (id, over = {}) => ({ ...base, id, title: `Livre ${id}`, author: 'A', year: 2019, status: 'lu', rating: null, isFavorite: false, progressUpdatedAt: null, startedAt: null, coverUrl: null, ...over })
const library = (over = {}) => ({
  profile: { id: 'p', name: 'Aurélien', createdAt: base.createdAt, updatedAt: base.updatedAt },
  films: [], series: [], anime: [], books: [], mangas: [], games: [], artworks: [], customLibraries: [], ...over,
})
const cardOf = (lib, scope = { kind: 'profile' }) => buildShareCard(collectShareItems(lib), scope, 'Aurélien')

const full = () => library({
  films: Array.from({ length: 8 }, (_, i) => film(`f${i}`, { isFavorite: i < 7, rating: 5 - (i % 3) * 0.5, watchedAt: `2026-0${(i % 9) + 1}-10` })),
  books: Array.from({ length: 12 }, (_, i) => book(`b${i}`, { rating: 4 + (i % 2) * 0.5, progressUpdatedAt: `2026-1${i % 3}-0${(i % 8) + 1}T00:00:00.000Z` })),
})

const rectIn = (rect, width, height) => rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= width && rect.y + rect.h <= height
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

test('Les blocs se suivent dans l’ordre voulu et la toile fait 1 080 px de large', () => {
  const layout = layoutShareCard(cardOf(full()))
  assert.equal(layout.width, SHARE_CARD.width)
  assert.equal(layout.width, 1080)
  assert.deepEqual(layout.blocks.map(block => block.kind === 'tiles' ? block.section : block.kind),
    ['header', 'stats', 'favorites', 'topRated', 'recent'], 'trois murs d’affiches, aucun pied de page')
})

test('Rien ne déborde de la toile et aucun bloc n’en chevauche un autre', () => {
  for (const lib of [full(), library({ films: [film('f1', { isFavorite: true, rating: 5 })] })]) {
    const layout = layoutShareCard(cardOf(lib))
    const rects = layout.blocks.map(block => block.rect)
    for (const rect of rects) assert.ok(rectIn(rect, layout.width, layout.height), `bloc dans la toile : ${JSON.stringify(rect)}`)
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) assert.ok(!overlap(rects[i], rects[j]), `blocs ${i} et ${j} séparés`)
    }
    for (const block of layout.blocks) {
      const inner = block.kind === 'tiles' ? block.tiles.flatMap(tile => (tile.starsRect ? [tile.rect, tile.starsRect] : [tile.rect]))
        : block.kind === 'stats' ? block.cells.map(cell => cell.rect) : []
      for (const rect of inner) {
        assert.ok(rectIn(rect, layout.width, layout.height), 'élément dans la toile')
        assert.ok(rect.x >= block.rect.x && rect.x + rect.w <= block.rect.x + block.rect.w && rect.y >= block.rect.y && rect.y + rect.h <= block.rect.y + block.rect.h, 'élément dans son bloc')
      }
      const rectsInside = inner
      for (let i = 0; i < rectsInside.length; i += 1) for (let j = i + 1; j < rectsInside.length; j += 1) assert.ok(!overlap(rectsInside[i], rectsInside[j]), 'éléments séparés')
    }
  }
})

test('Les marges latérales sont respectées', () => {
  const layout = layoutShareCard(cardOf(full()))
  for (const block of layout.blocks) {
    assert.ok(block.rect.x >= SHARE_CARD.margin && block.rect.x + block.rect.w <= layout.width - SHARE_CARD.margin, `marges : ${block.kind}`)
  }
})

test('Une section vide disparaît de la mise en page', () => {
  const onlyFavorites = layoutShareCard(cardOf(library({ films: [film('f1', { isFavorite: true })] })))
  assert.deepEqual(onlyFavorites.blocks.map(block => block.kind === 'tiles' ? block.section : block.kind), ['header', 'stats', 'favorites'])
})

test('Les affiches : cinq par rangée remplissent la largeur, plus grandes quand il y en a peu, hauteur 3:2', () => {
  const six = layoutShareCard(cardOf(full())).blocks.find(block => block.section === 'favorites')
  assert.equal(six.tiles.length, SHARE_LIMITS.favorites)
  assert.equal(SHARE_LIMITS.favorites, 5)
  const widths = new Set(six.tiles.map(tile => tile.rect.w))
  assert.equal(widths.size, 1, 'toutes les tuiles ont la même largeur')
  const [tileWidth] = widths
  const rowWidth = tileWidth * 5 + SHARE_CARD.gap * 4
  assert.ok(rowWidth <= SHARE_CARD.width - 2 * SHARE_CARD.margin && rowWidth >= SHARE_CARD.width - 2 * SHARE_CARD.margin - 8, `cinq affiches remplissent la largeur utile (${rowWidth})`)
  assert.equal(six.tiles[0].rect.h, Math.round(tileWidth * 1.5))
  assert.equal(new Set(six.tiles.map(tile => tile.rect.y)).size, 1, 'une seule rangée')

  const two = layoutShareCard(cardOf(library({ films: [film('a', { isFavorite: true }), film('b', { isFavorite: true })] }))).blocks.find(block => block.section === 'favorites')
  assert.ok(two.tiles[0].rect.w > tileWidth, 'deux tuiles sont plus grandes que six')
  assert.ok(two.tiles[0].rect.w <= SHARE_CARD.maxTileWidth, 'sans dépasser la largeur maximale')
  assert.equal(two.tiles[0].rect.x, SHARE_CARD.margin, 'alignées à gauche, sous l’intitulé')
})

test('Les mieux notés sont des affiches avec leurs étoiles dessous ; les autres sections n’en ont pas', () => {
  const layout = layoutShareCard(cardOf(full()))
  const top = layout.blocks.find(block => block.section === 'topRated')
  assert.equal(top.tiles.length, SHARE_LIMITS.topRated)
  for (const tile of top.tiles) {
    assert.ok(tile.starsRect, 'une rangée d’étoiles par affiche')
    assert.equal(tile.starsRect.x, tile.rect.x)
    assert.equal(tile.starsRect.w, tile.rect.w)
    assert.ok(tile.starsRect.y >= tile.rect.y + tile.rect.h, 'les étoiles sont sous l’affiche')
  }
  for (const section of ['favorites', 'recent']) {
    const block = layout.blocks.find(candidate => candidate.section === section)
    assert.ok(block.tiles.every(tile => tile.starsRect === null), `${section} : pas d’étoiles`)
  }
})

test('Aucun texte secondaire : la mise en page ne réserve ni ligne de créateur, ni date, ni pied de page', () => {
  const layout = layoutShareCard(cardOf(full()))
  assert.ok(!layout.blocks.some(block => block.kind === 'footer' || block.kind === 'list'))
  assert.equal(Object.hasOwn(SHARE_CARD, 'rowHeight'), false)
})

test('L’en-tête réserve la place du logo, à gauche', () => {
  const layout = layoutShareCard(cardOf(full()))
  const header = layout.blocks.find(block => block.kind === 'header')
  assert.ok(header.logo, 'un rectangle de logo')
  assert.equal(header.logo.x, header.rect.x)
  assert.ok(header.logo.y >= header.rect.y && header.logo.y + header.logo.h <= header.rect.y + header.rect.h, 'logo dans l’en-tête')
  assert.ok(header.textX >= header.logo.x + header.logo.w + 16, 'le texte démarre après le logo, avec de l’air')
  assert.ok(header.textX < header.rect.x + header.rect.w, 'le texte reste dans l’en-tête')
})

test('Chiffres clés : quatre cases avec une note moyenne, trois sans ; la répartition seulement pour un profil', () => {
  const withAverage = layoutShareCard(cardOf(full())).blocks.find(block => block.kind === 'stats')
  assert.deepEqual(withAverage.cells.map(cell => cell.key), ['total', 'done', 'favorites', 'average'])
  assert.ok(withAverage.libraries, 'profil à plusieurs bibliothèques : une ligne de répartition')

  const noRating = layoutShareCard(cardOf(library({ films: [film('f1', { isFavorite: true })] }))).blocks.find(block => block.kind === 'stats')
  assert.deepEqual(noRating.cells.map(cell => cell.key), ['total', 'done', 'favorites'])
  assert.equal(noRating.libraries, null, 'une seule bibliothèque : rien à répartir')

  const libraryCard = layoutShareCard(cardOf(full(), { kind: 'library', library: 'films' })).blocks.find(block => block.kind === 'stats')
  assert.equal(libraryCard.libraries, null, 'une carte de bibliothèque n’a pas de répartition')
})

test('La hauteur suit le contenu, avec un minimum, et la mise en page est déterministe', () => {
  const small = layoutShareCard(cardOf(library({ films: [film('f1', { isFavorite: true })] })))
  const large = layoutShareCard(cardOf(full()))
  assert.ok(small.height >= SHARE_CARD.minHeight, 'une carte courte garde une hauteur minimale')
  assert.ok(large.height > small.height, 'plus de contenu, plus de hauteur')
  assert.ok(large.height <= SHARE_CARD.maxHeight, `une carte pleine reste exportable (${large.height})`)
  assert.deepEqual(layoutShareCard(cardOf(full())), large)
})

test('Les images des œuvres montrées sont listées une fois chacune, pour le chargement', () => {
  const lib = library({ films: [film('a', { isFavorite: true, rating: 5, posterUrl: 'https://x/a.jpg' }), film('b', { isFavorite: true, rating: 4, posterUrl: 'https://x/b.jpg' }), film('c', { posterUrl: 'https://x/c.jpg' })] })
  const layout = layoutShareCard(cardOf(lib))
  assert.deepEqual(layout.imageUrls.sort(), ['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg'])
})
