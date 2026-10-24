// Cartes à partager : la mise en page en calcul pur. Deux formats (standard 4:5, story 9:16), deux portées
// (une bibliothèque, tout le profil). Invariants : rien ne déborde, rien ne se chevauche, la zone sûre d'une
// story est respectée, les affiches restent assez grandes pour se lire, une section vide disparaît.
import assert from 'node:assert/strict'
import test from 'node:test'
import { SHARE_FORMATS, SHARE_DESTINATIONS } from '../src/domain/shareFormats.ts'
import { layoutShareCard, shareLimitsFor, SHARE_CARD } from '../src/domain/shareCardLayout.ts'
import { buildShareCard } from '../src/domain/shareCard.ts'

const NOW = new Date('2026-10-24T10:00:00')
let n = 0
const entry = (library, over = {}) => { n += 1; return { key: `${library}:${n}`, id: String(n), library, title: `Titre ${n}`, creator: null, year: 2020, rating: 4, isFavorite: false, done: true, doneAt: '2026-01-01', doneOn: '2026-01-01', imageUrl: `https://img/${n}.jpg`, ...over } }
const many = (library, count, over = {}) => Array.from({ length: count }, (_, i) => entry(library, { rating: 5 - (i % 8) * 0.5, ...over }))

function items(scope) {
  if (scope.kind === 'library') return [...many(scope.library, 12, { isFavorite: true }), ...many(scope.library, 12)]
  return ['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks'].flatMap(library => [...many(library, 3, { isFavorite: true }), ...many(library, 3)])
}
const card = (scope, format) => buildShareCard(items(scope), scope, 'Aurélien', { limits: shareLimitsFor(format, scope), now: NOW })
const layoutOf = (scope, format) => layoutShareCard(card(scope, format), format)
const SCOPES = [{ kind: 'library', library: 'films' }, { kind: 'profile' }]
const FORMATS = Object.values(SHARE_FORMATS)

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const rectsOf = layout => layout.blocks.flatMap(block => block.kind === 'tiles'
  ? block.tiles.flatMap(tile => (tile.starsRect ? [tile.rect, tile.starsRect] : [tile.rect]))
  : block.kind === 'stats' ? [...block.cells.map(cell => cell.rect), ...(block.libraries ? [block.libraries] : [])]
    : [block.logo])

test('Deux formats : standard 1 080 × 1 350 et story 1 080 × 1 920, la toile a exactement leur taille', () => {
  assert.deepEqual([SHARE_FORMATS.standard.width, SHARE_FORMATS.standard.height], [1080, 1350])
  assert.deepEqual([SHARE_FORMATS.story.width, SHARE_FORMATS.story.height], [1080, 1920])
  for (const format of FORMATS) for (const scope of SCOPES) {
    const layout = layoutOf(scope, format)
    assert.deepEqual([layout.width, layout.height], [format.width, format.height])
  }
})

test('Chaque réseau demande son format : story pour Instagram, standard pour les messages et X', () => {
  const byId = Object.fromEntries(SHARE_DESTINATIONS.map(destination => [destination.id, destination]))
  assert.equal(byId['instagram-story'].format, 'story')
  assert.equal(byId.whatsapp.format, 'standard')
  assert.equal(byId.messenger.format, 'standard')
  assert.equal(byId.x.format, 'standard', 'X et les messages partagent le même format')
  assert.equal(byId['instagram-story'].url, null, 'pas de page web pour publier une story')
  for (const destination of SHARE_DESTINATIONS) if (destination.url) assert.match(destination.url, /^https:\/\//)
})

test('Les blocs : en-tête, chiffres, coups de cœur, puis terminés récemment — rien d’autre', () => {
  for (const format of FORMATS) for (const scope of SCOPES) {
    const kinds = layoutOf(scope, format).blocks.map(block => (block.kind === 'tiles' ? block.section : block.kind))
    assert.deepEqual(kinds, ['header', 'stats', 'favorites', 'recent'])
  }
})

test('Rien ne déborde de la toile ni de la marge, et rien ne se chevauche', () => {
  for (const format of FORMATS) for (const scope of SCOPES) {
    const layout = layoutOf(scope, format)
    const rects = rectsOf(layout)
    for (const rect of rects) {
      assert.ok(rect.x >= SHARE_CARD.margin && rect.x + rect.w <= format.width - SHARE_CARD.margin, `${format.id}/${scope.kind} : marges latérales`)
      assert.ok(rect.y >= Math.max(SHARE_CARD.margin, format.safeTop) && rect.y + rect.h <= format.height - Math.max(SHARE_CARD.margin, format.safeBottom), `${format.id}/${scope.kind} : zone sûre (${JSON.stringify(rect)})`)
    }
    for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) assert.ok(!overlap(rects[i], rects[j]), `${format.id}/${scope.kind} : chevauchement ${i}/${j}`)
  }
})

test('Les affiches restent assez grandes pour se lire (150 px au moins) et ne dépassent pas 260 px', () => {
  for (const format of FORMATS) for (const scope of SCOPES) {
    for (const block of layoutOf(scope, format).blocks) if (block.kind === 'tiles') for (const tile of block.tiles) {
      assert.ok(tile.rect.w >= 150 && tile.rect.w <= 260, `${format.id}/${scope.kind} : largeur ${tile.rect.w}`)
      assert.equal(tile.rect.h, Math.round(tile.rect.w * SHARE_CARD.tileRatio), 'ratio 2:3')
    }
  }
})

test('Plafonds : la carte ne demande que ce que la mise en page peut montrer', () => {
  assert.deepEqual(shareLimitsFor(SHARE_FORMATS.standard, { kind: 'library', library: 'films' }), { favorites: 4, recent: 4 })
  assert.deepEqual(shareLimitsFor(SHARE_FORMATS.standard, { kind: 'profile' }), { favorites: 5, recent: 5 })
  assert.deepEqual(shareLimitsFor(SHARE_FORMATS.story, { kind: 'library', library: 'films' }), { favorites: 6, recent: 3 })
  assert.deepEqual(shareLimitsFor(SHARE_FORMATS.story, { kind: 'profile' }), { favorites: 8, recent: 4 })
  for (const format of FORMATS) for (const scope of SCOPES) {
    const layout = layoutOf(scope, format)
    const limits = shareLimitsFor(format, scope)
    const count = section => layout.blocks.find(block => block.section === section).tiles.length
    assert.equal(count('favorites'), limits.favorites, `${format.id}/${scope.kind} : tous les coups de cœur demandés tiennent`)
    assert.equal(count('recent'), limits.recent, `${format.id}/${scope.kind} : tous les terminés demandés tiennent`)
  }
})

test('Une story compte deux rangées de coups de cœur ; le format standard une seule', () => {
  const rowsOf = layout => new Set(layout.blocks.find(block => block.section === 'favorites').tiles.map(tile => tile.rect.y)).size
  assert.equal(rowsOf(layoutOf(SCOPES[0], SHARE_FORMATS.standard)), 1)
  assert.equal(rowsOf(layoutOf(SCOPES[0], SHARE_FORMATS.story)), 2)
  assert.equal(rowsOf(layoutOf(SCOPES[1], SHARE_FORMATS.story)), 2)
})

test('Les étoiles sont sous chaque coup de cœur noté, jamais sous les terminés récemment', () => {
  const layout = layoutOf(SCOPES[0], SHARE_FORMATS.standard)
  const favorites = layout.blocks.find(block => block.section === 'favorites')
  for (const tile of favorites.tiles) {
    assert.ok(tile.starsRect, 'étoiles présentes')
    assert.equal(tile.starsRect.x, tile.rect.x)
    assert.equal(tile.starsRect.w, tile.rect.w)
    assert.ok(tile.starsRect.y >= tile.rect.y + tile.rect.h, 'sous l’affiche')
  }
  assert.ok(layout.blocks.find(block => block.section === 'recent').tiles.every(tile => tile.starsRect === null))
})

test('Sans note (l’Art), pas d’étoiles ni de place réservée pour elles', () => {
  const art = [...many('artworks', 4, { isFavorite: true, rating: null }), ...many('artworks', 4, { rating: null })]
  const scope = { kind: 'library', library: 'artworks' }
  const model = buildShareCard(art, scope, 'Aurélien', { limits: shareLimitsFor(SHARE_FORMATS.standard, scope), now: NOW })
  const layout = layoutShareCard(model, SHARE_FORMATS.standard)
  assert.ok(layout.blocks.find(block => block.section === 'favorites').tiles.every(tile => tile.starsRect === null))
})

test('Une section vide disparaît de la mise en page', () => {
  const only = many('films', 3, { isFavorite: true, done: false, doneAt: null, doneOn: null })
  const scope = { kind: 'library', library: 'films' }
  const model = buildShareCard(only, scope, 'Aurélien', { limits: shareLimitsFor(SHARE_FORMATS.standard, scope), now: NOW })
  assert.deepEqual(layoutShareCard(model, SHARE_FORMATS.standard).blocks.map(block => (block.kind === 'tiles' ? block.section : block.kind)), ['header', 'stats', 'favorites'])
})

test('Moins d’affiches que de places : elles restent au centre de la largeur, sans dépasser 260 px', () => {
  const few = many('films', 2, { isFavorite: true })
  const scope = { kind: 'library', library: 'films' }
  const model = buildShareCard(few, scope, 'Aurélien', { limits: shareLimitsFor(SHARE_FORMATS.standard, scope), now: NOW })
  const tiles = layoutShareCard(model, SHARE_FORMATS.standard).blocks.find(block => block.section === 'favorites').tiles
  assert.equal(tiles.length, 2)
  const left = tiles[0].rect.x
  const right = SHARE_FORMATS.standard.width - (tiles[1].rect.x + tiles[1].rect.w)
  assert.ok(Math.abs(left - right) <= 1, `rangée centrée (${left} / ${right})`)
})

test('L’en-tête : le vrai logo à gauche, le texte à sa droite', () => {
  for (const format of FORMATS) {
    const header = layoutOf(SCOPES[1], format).blocks.find(block => block.kind === 'header')
    assert.equal(header.logo.x, SHARE_CARD.margin)
    assert.equal(header.logo.w, header.logo.h, 'la tuile du logo est carrée')
    assert.ok(header.textX >= header.logo.x + header.logo.w + 16)
  }
})

test('Chiffres : trois cases ; la ligne par bibliothèque n’existe que pour un profil avec au moins deux bibliothèques', () => {
  const stats = layout => layout.blocks.find(block => block.kind === 'stats')
  assert.equal(stats(layoutOf(SCOPES[0], SHARE_FORMATS.standard)).cells.length, 3)
  assert.equal(stats(layoutOf(SCOPES[0], SHARE_FORMATS.standard)).libraries, null)
  assert.ok(stats(layoutOf(SCOPES[1], SHARE_FORMATS.standard)).libraries)
  const mono = buildShareCard(many('films', 3), { kind: 'profile' }, 'A', { limits: shareLimitsFor(SHARE_FORMATS.standard, { kind: 'profile' }), now: NOW })
  assert.equal(stats(layoutShareCard(mono, SHARE_FORMATS.standard)).libraries, null)
})

test('Les adresses d’image sont listées une fois chacune, dans l’ordre d’apparition', () => {
  const layout = layoutOf(SCOPES[0], SHARE_FORMATS.story)
  assert.equal(new Set(layout.imageUrls).size, layout.imageUrls.length)
  assert.equal(layout.imageUrls.length, 9)
})

test('Mise en page déterministe : mêmes entrées, même résultat', () => {
  for (const format of FORMATS) {
    const model = card(SCOPES[1], format)
    assert.deepEqual(layoutShareCard(model, format), layoutShareCard(model, format))
  }
})
