// Cartes à partager : la composition en calcul pur. Une affiche « héros » (l'œuvre mise en avant), à sa
// droite les autres coups de cœur sur toute sa hauteur, en dessous une rangée de chiffres.
// Invariants vérifiés pour chaque format et chaque portée : la toile a la taille exacte, rien ne déborde,
// rien ne se chevauche, la zone sûre d'une story est respectée, les affiches restent lisibles.
import assert from 'node:assert/strict'
import test from 'node:test'
import { SHARE_FORMATS } from '../src/domain/shareFormats.ts'
import { arrangeRunnerUps, layoutPeopleCells, layoutStatCells, layoutShareCard, shareLimitsFor, SHARE_CARD } from '../src/domain/shareCardLayout.ts'
import { buildShareCard } from '../src/domain/shareCard.ts'

const NOW = new Date('2026-10-24T10:00:00')
let n = 0
const entry = (library, over = {}) => { n += 1; return { key: `${library}:${n}`, id: String(n), library, title: `Titre ${n}`, creator: null, year: 2020, rating: 4, isFavorite: false, done: true, doneAt: '2026-01-01', doneOn: '2026-01-01', imageUrl: `https://img/${n}.jpg`, ...over } }
const many = (library, count, over = {}) => Array.from({ length: count }, (_, i) => entry(library, { rating: 5 - (i % 8) * 0.5, ...over }))

const LIBRARY = { kind: 'library', library: 'films' }
const PROFILE = { kind: 'profile' }
const SCOPES = [LIBRARY, PROFILE]
const FORMATS = Object.values(SHARE_FORMATS)

function full(scope) {
  if (scope.kind === 'library') return [...many(scope.library, 12, { isFavorite: true }), ...many(scope.library, 12)]
  return ['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks'].flatMap(library => [...many(library, 3, { isFavorite: true }), ...many(library, 3)])
}
const modelOf = (items, scope, format, extra = {}) => buildShareCard(items, scope, 'Aurélien', { limits: shareLimitsFor(format, scope), now: NOW, ...extra })
const layoutOf = (scope, format, items = full(scope), extra = {}) => layoutShareCard(modelOf(items, scope, format, extra), format)

const block = (layout, kind) => layout.blocks.find(candidate => candidate.kind === kind)
const spreadOf = layout => block(layout, 'spread')
const statsOf = layout => block(layout, 'stats')
const peopleOf = layout => block(layout, 'people')
const tilesOf = layout => [spreadOf(layout)?.hero, ...(spreadOf(layout)?.tiles ?? [])].filter(Boolean)

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
function allRects(layout) {
  const rects = []
  for (const part of layout.blocks) {
    if (part.kind === 'header') rects.push(part.logo, ...(part.name ? [part.name] : []))
    if (part.kind === 'title') rects.push(part.rect, ...(part.subtitle ? [part.subtitle] : []))
    if (part.kind === 'spread') rects.push(part.labelRect, ...tilesOf({ blocks: [part] }).map(tile => tile.rect))
    if (part.kind === 'stats') rects.push(...part.cells)
    if (part.kind === 'people') rects.push(...part.cells.map(cell => cell.rect))
  }
  return rects
}
const inSafeArea = (rect, format) => rect.x >= SHARE_CARD.margin && rect.x + rect.w <= format.width - SHARE_CARD.margin
  && rect.y >= Math.max(SHARE_CARD.marginY, format.safeTop) && rect.y + rect.h <= format.height - Math.max(SHARE_CARD.marginY, format.safeBottom)

test('Deux formats : standard 1 080 × 1 350 et story 1 080 × 1 920, la toile a exactement leur taille', () => {
  assert.deepEqual([SHARE_FORMATS.standard.width, SHARE_FORMATS.standard.height], [1080, 1350])
  assert.deepEqual([SHARE_FORMATS.story.width, SHARE_FORMATS.story.height], [1080, 1920])
  for (const format of FORMATS) for (const scope of SCOPES) {
    const layout = layoutOf(scope, format)
    assert.deepEqual([layout.width, layout.height], [format.width, format.height])
  }
})

test('Deux formats, aucune destination codée : le partage direct vers un service est retiré (25 octobre 2026)', () => {
  assert.deepEqual(Object.keys(SHARE_FORMATS).sort(), ['standard', 'story'])
  assert.equal(SHARE_FORMATS.story.safeTop, 250)
  assert.equal(SHARE_FORMATS.story.safeBottom, 340)
})

test('Les blocs, dans l’ordre : en-tête, titre, coups de cœur, chiffres (plus de « derniers terminés »)', () => {
  for (const format of FORMATS) for (const scope of SCOPES) {
    assert.deepEqual(layoutOf(scope, format).blocks.map(part => part.kind), ['header', 'title', 'spread', 'stats'])
  }
})

test('Rien ne déborde des marges ni de la zone sûre, rien ne se chevauche', () => {
  for (const format of FORMATS) for (const scope of SCOPES) {
    const rects = allRects(layoutOf(scope, format))
    for (const rect of rects) assert.ok(inSafeArea(rect, format), `${format.id}/${scope.kind} : hors limites ${JSON.stringify(rect)}`)
    for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) assert.ok(!overlap(rects[i], rects[j]), `${format.id}/${scope.kind} : chevauchement ${JSON.stringify(rects[i])} / ${JSON.stringify(rects[j])}`)
  }
})

test('Le héros est l’œuvre choisie en premier et il domine : au moins 400 px de large, plus grand que toute autre affiche', () => {
  for (const format of FORMATS) for (const scope of SCOPES) {
    const layout = layoutOf(scope, format)
    const { hero, tiles } = spreadOf(layout)
    assert.equal(hero.item.rating, 5)
    assert.ok(hero.rect.w >= 400, `${format.id}/${scope.kind} : héros ${hero.rect.w} px`)
    for (const other of tiles) assert.ok(other.rect.w < hero.rect.w)
    assert.equal(hero.rect.x, SHARE_CARD.margin, 'le héros s’aligne sur la marge gauche, comme le logo')
  }
})

test('Le héros est celui que la personne a choisi, même s’il n’est pas le mieux noté', () => {
  const items = full(LIBRARY)
  const picked = items.filter(item => item.isFavorite)[4]
  const layout = layoutOf(LIBRARY, SHARE_FORMATS.standard, items, { selection: [picked.key, items[0].key, items[1].key] })
  assert.equal(spreadOf(layout).hero.item.key, picked.key)
  assert.equal(spreadOf(layout).tiles.length, 2)
})

test('Toutes les affiches sont en 2:3 et restent lisibles (au moins 130 px avec dix coups de cœur)', () => {
  for (const format of FORMATS) for (const scope of SCOPES) {
    const layout = layoutOf(scope, format)
    for (const tile of tilesOf(layout)) assert.equal(tile.rect.h, Math.round(tile.rect.w * SHARE_CARD.tileRatio), 'ratio 2:3')
    for (const tile of spreadOf(layout).tiles) assert.ok(tile.rect.w >= 130, `${format.id}/${scope.kind} : coup de cœur ${tile.rect.w} px`)
  }
})

test('Plafond : dix coups de cœur sur le profil, sept dans une bibliothèque (25 octobre 2026)', () => {
  for (const format of FORMATS) {
    assert.deepEqual(shareLimitsFor(format, PROFILE), { favorites: 10 })
    assert.deepEqual(shareLimitsFor(format, LIBRARY), { favorites: 7 })
  }
  for (const format of FORMATS) {
    assert.equal(1 + spreadOf(layoutOf(PROFILE, format)).tiles.length, 10, `${format.id} : les dix du profil tiennent`)
    assert.equal(1 + spreadOf(layoutOf(LIBRARY, format)).tiles.length, 7, `${format.id} : les sept de la bibliothèque tiennent`)
  }
})

test('Profil : les neuf voisins forment trois colonnes sur trois rangées, dans la bande du héros', () => {
  for (const format of FORMATS) {
    const { hero, tiles } = spreadOf(layoutOf(PROFILE, format))
    assert.equal(tiles.length, 9, `${format.id} : neuf voisins`)
    assert.equal(new Set(tiles.map(tile => tile.rect.x)).size, 3, `${format.id} : trois colonnes`)
    assert.equal(new Set(tiles.map(tile => tile.rect.y)).size, 3, `${format.id} : trois rangées`)
    const top = Math.min(...tiles.map(tile => tile.rect.y))
    const bottom = Math.max(...tiles.map(tile => tile.rect.y + tile.rect.h))
    assert.ok(top >= hero.rect.y - 8 && bottom <= hero.rect.y + hero.rect.h + 8, `${format.id} : dans la bande du héros (${top}-${bottom} / ${hero.rect.y}-${hero.rect.y + hero.rect.h})`)
    assert.ok(Math.abs((top + bottom) / 2 - (hero.rect.y + hero.rect.h / 2)) <= 8, `${format.id} : grille centrée sur le héros`)
    assert.ok(tiles.every(tile => tile.rect.x >= hero.rect.x + hero.rect.w), `${format.id} : à droite du héros`)
  }
})

test('Bibliothèque : les six voisins occupent toute la hauteur du héros à sa droite', () => {
  for (const format of FORMATS) {
    const scope = LIBRARY
    const { hero, tiles } = spreadOf(layoutOf(scope, format))
    const top = Math.min(...tiles.map(tile => tile.rect.y))
    const bottom = Math.max(...tiles.map(tile => tile.rect.y + tile.rect.h))
    assert.ok(tiles.every(tile => tile.rect.x >= hero.rect.x + hero.rect.w + SHARE_CARD.panelGap), 'à droite du héros')
    assert.ok(Math.abs(top - hero.rect.y) <= 8 && Math.abs(bottom - (hero.rect.y + hero.rect.h)) <= 8, `${format.id}/${scope.kind} : grille ${top}-${bottom} pour un héros ${hero.rect.y}-${hero.rect.y + hero.rect.h}`)
  }
})

test('Les chiffres tiennent sur une seule rangée sous les affiches, de marge à marge', () => {
  for (const format of FORMATS) for (const scope of SCOPES) {
    const layout = layoutOf(scope, format)
    const { rect, cells } = statsOf(layout)
    const { hero, tiles } = spreadOf(layout)
    assert.equal(cells.length, 3)
    assert.equal(new Set(cells.map(cell => cell.y)).size, 1, 'une seule rangée')
    assert.equal(rect.h, SHARE_CARD.statsHeight)
    assert.equal(rect.x, SHARE_CARD.margin)
    assert.equal(rect.x + rect.w, format.width - SHARE_CARD.margin, 'jusqu’à la marge droite')
    const lowest = Math.max(hero.rect.y + hero.rect.h, ...tiles.map(tile => tile.rect.y + tile.rect.h))
    assert.ok(rect.y >= lowest + 24, `${format.id}/${scope.kind} : sous les affiches`)
  }
})

test('layoutStatCells : cases égales côte à côte, sans trou ni chevauchement', () => {
  const rect = { x: 72, y: 900, w: 936, h: 104 }
  for (const count of [1, 2, 3]) {
    const cells = layoutStatCells(rect, count)
    assert.equal(cells.length, count)
    assert.ok(cells.every(cell => cell.w === rect.w / count && cell.y === rect.y && cell.h === rect.h))
    assert.equal(cells[0].x, rect.x)
    assert.equal(cells.at(-1).x + cells.at(-1).w, rect.x + rect.w)
  }
  assert.deepEqual(layoutStatCells(rect, 0), [])
})

test('Chiffres retirés : la rangée se réduit, et sans aucun chiffre le bloc disparaît', () => {
  const one = layoutOf(LIBRARY, SHARE_FORMATS.standard, full(LIBRARY), { stats: { done: true, year: false, average: false } })
  assert.equal(statsOf(one).cells.length, 1)
  const none = layoutOf(LIBRARY, SHARE_FORMATS.standard, full(LIBRARY), { stats: { done: false, year: false, average: false } })
  assert.equal(statsOf(none), undefined)
  assert.deepEqual(none.blocks.map(part => part.kind), ['header', 'title', 'spread'])
  const rects = allRects(none)
  for (const rect of rects) assert.ok(inSafeArea(rect, SHARE_FORMATS.standard))
})

test('Les étoiles se posent en bas de l’affiche, pour les coups de cœur notés et assez larges', () => {
  for (const format of FORMATS) {
    const { hero, tiles } = spreadOf(layoutOf(LIBRARY, format))
    for (const tile of [hero, ...tiles]) {
      assert.ok(tile.starsRect, 'étoiles présentes')
      assert.ok(tile.starsRect.x >= tile.rect.x && tile.starsRect.x + tile.starsRect.w <= tile.rect.x + tile.rect.w, 'dans l’affiche')
      assert.ok(tile.starsRect.y + tile.starsRect.h <= tile.rect.y + tile.rect.h, 'dans l’affiche')
      assert.ok(tile.starsRect.y > tile.rect.y + tile.rect.h / 2, 'en bas')
    }
  }
})

test('Sans note (l’Art), aucune étoile', () => {
  const art = [...many('artworks', 8, { isFavorite: true, rating: null }), ...many('artworks', 6, { rating: null })]
  const scope = { kind: 'library', library: 'artworks' }
  const layout = layoutOf(scope, SHARE_FORMATS.standard, art)
  assert.ok(tilesOf(layout).every(tile => tile.starsRect === null))
})

test('L’en-tête : le logo (tuile carrée) et le nom de l’app sur le même axe horizontal, le nom du profil à droite', () => {
  for (const format of FORMATS) for (const scope of SCOPES) {
    const header = block(layoutOf(scope, format), 'header')
    assert.equal(header.logo.x, SHARE_CARD.margin)
    assert.equal(header.logo.w, header.logo.h)
    assert.equal(header.wordmark.centerY, header.logo.y + header.logo.h / 2, 'le nom de l’app est centré sur le logo')
    assert.ok(header.wordmark.x >= header.logo.x + header.logo.w + 12)
    if (scope.kind === 'library') {
      assert.ok(header.name, 'le nom du profil accompagne une carte de bibliothèque')
      assert.equal(header.name.x + header.name.w, format.width - SHARE_CARD.margin, 'aligné sur la marge droite')
      assert.equal(header.name.y + header.name.h / 2, header.logo.y + header.logo.h / 2, 'même axe que le logo')
    } else {
      assert.equal(header.name, null, 'la carte du profil a déjà son nom en titre')
    }
  }
})

test('Le titre : la carte d’une bibliothèque n’a jamais de ligne par bibliothèque ; celle du profil en a une s’il y en a plusieurs', () => {
  for (const format of FORMATS) {
    assert.equal(block(layoutOf(LIBRARY, format), 'title').subtitle, null, 'rien qui parle des séries sur une carte de films')
    const profileTitle = block(layoutOf(PROFILE, format), 'title')
    assert.ok(profileTitle.subtitle)
    assert.equal(profileTitle.subtitle.x, SHARE_CARD.margin)
  }
  const mono = layoutOf(PROFILE, SHARE_FORMATS.standard, many('films', 6, { isFavorite: true }))
  assert.equal(block(mono, 'title').subtitle, null, 'une seule bibliothèque : rien à répartir')
})

test('Les autres coups de cœur sont centrés dans le panneau à droite du héros (même air de chaque côté, à un pixel près)', () => {
  for (const format of FORMATS) for (const scope of SCOPES) {
    const { hero, tiles } = spreadOf(layoutOf(scope, format))
    const panelLeft = hero.rect.x + hero.rect.w + SHARE_CARD.panelGap
    const panelRight = format.width - SHARE_CARD.margin
    const left = Math.min(...tiles.map(tile => tile.rect.x)) - panelLeft
    const right = panelRight - Math.max(...tiles.map(tile => tile.rect.x + tile.rect.w))
    assert.ok(left >= 0 && right >= 0, `${format.id}/${scope.kind} : dans le panneau`)
    assert.ok(Math.abs(left - right) <= 1, `${format.id}/${scope.kind} : air à gauche ${left}, à droite ${right}`)
  }
})

test('arrangeRunnerUps : la plus grande affiche possible, rangées centrées, jamais plus de trois colonnes ni de trois rangées', () => {
  assert.deepEqual(pick(arrangeRunnerUps(0, 512, 476)), { cols: 0, rows: 0, tileW: 0 })
  const six = arrangeRunnerUps(6, 440, 700)
  assert.equal(six.cols * six.rows >= 6, true)
  assert.ok(six.cols <= 3 && six.rows <= 3)
  assert.deepEqual(pick(arrangeRunnerUps(6, 440, 700)), { cols: 2, rows: 3, tileW: 148 })
  assert.deepEqual(pick(arrangeRunnerUps(3, 512, 476)), { cols: 3, rows: 1, tileW: 160 })
  assert.deepEqual(pick(arrangeRunnerUps(2, 512, 476)), { cols: 2, rows: 1, tileW: 248 })
  const one = arrangeRunnerUps(1, 512, 476)
  assert.equal(one.cols * one.rows, 1)
  assert.ok(one.tileW <= 320, 'une affiche seule ne rivalise pas avec le héros')
})
function pick({ cols, rows, tileW }) { return { cols, rows, tileW } }

test('Peu de coups de cœur : la composition reste valide de 1 au plafond de la portée', () => {
  for (const format of FORMATS) for (const scope of SCOPES) for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const items = many(scope.kind === 'library' ? scope.library : 'films', count, { isFavorite: true })
    const layout = layoutOf(scope, format, items)
    const label = `${format.id}/${scope.kind}/${count} favoris`
    const rects = allRects(layout)
    for (const rect of rects) assert.ok(inSafeArea(rect, format), `${label} : dans les limites ${JSON.stringify(rect)}`)
    for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) assert.ok(!overlap(rects[i], rects[j]), `${label} : chevauchement`)
    const limit = scope.kind === 'profile' ? 10 : 7
    assert.equal(1 + spreadOf(layout).tiles.length, Math.min(count, limit), `${label} : les favoris montrés suivent le plafond`)
    assert.ok(spreadOf(layout).hero.rect.w >= 400, `${label} : héros ≥ 400 px`)
  }
})

test('Un seul coup de cœur : le héros seul, sans grille vide à côté', () => {
  const layout = layoutOf(LIBRARY, SHARE_FORMATS.standard, many('films', 1, { isFavorite: true }))
  assert.equal(spreadOf(layout).tiles.length, 0)
  assert.ok(statsOf(layout))
})

test('Aucun coup de cœur : ni affiche ni section, seulement l’en-tête, le titre et les chiffres', () => {
  const layout = layoutOf(LIBRARY, SHARE_FORMATS.standard, many('films', 6))
  assert.equal(spreadOf(layout), undefined)
  assert.deepEqual(layout.blocks.map(part => part.kind), ['header', 'title', 'stats'])
})

test('Les adresses d’image sont listées une fois chacune : le héros d’abord, puis les autres coups de cœur', () => {
  const layout = layoutOf(LIBRARY, SHARE_FORMATS.story)
  assert.equal(new Set(layout.imageUrls).size, layout.imageUrls.length)
  assert.equal(layout.imageUrls.length, 7, 'sept coups de cœur sur une carte de bibliothèque')
  assert.equal(layout.imageUrls[0], spreadOf(layout).hero.item.imageUrl)
})

test('Mise en page déterministe : mêmes entrées, même résultat', () => {
  for (const format of FORMATS) {
    const model = modelOf(full(PROFILE), PROFILE, format)
    assert.deepEqual(layoutShareCard(model, format), layoutShareCard(model, format))
  }
})

const person = (role, name, over = {}) => ({ id: `${role}:${name}`, role, name, count: 3, portraitUrl: null, ...over })
const FILM_PEOPLE = [
  person('director', 'Greta Gerwig', { portraitUrl: 'https://image.tmdb.org/t/p/w185/gg.jpg' }),
  person('actor', 'Saoirse Ronan', { portraitUrl: 'https://image.tmdb.org/t/p/w185/sr.jpg' }),
  person('actor', 'Florence Pugh', { portraitUrl: 'https://image.tmdb.org/t/p/w185/fp.jpg' }),
  person('actor', 'Timothée Chalamet', { portraitUrl: null }),
  person('actor', 'Zendaya', { portraitUrl: null }),
]

test('Les personnes : une rangée entre les coups de cœur et les chiffres, absente quand il n’y en a pas', () => {
  for (const format of FORMATS) {
    assert.deepEqual(layoutOf(LIBRARY, format, full(LIBRARY), { people: FILM_PEOPLE }).blocks.map(part => part.kind), ['header', 'title', 'spread', 'people', 'stats'])
    assert.deepEqual(layoutOf(LIBRARY, format).blocks.map(part => part.kind), ['header', 'title', 'spread', 'stats'], 'sans personnes, la composition d’avant')
    assert.deepEqual(layoutOf(PROFILE, format, full(PROFILE), { people: FILM_PEOPLE }).blocks.map(part => part.kind), ['header', 'title', 'spread', 'people', 'stats'], 'le profil aussi, avec la ligne des bibliothèques sous son nom')
    assert.deepEqual(layoutOf(PROFILE, format, full(PROFILE)).blocks.map(part => part.kind), ['header', 'title', 'spread', 'stats'])
  }
})

test('Profil : cinq personnes tiennent aussi, sans chevauchement ni sortie de la zone sûre, avec des affiches lisibles', () => {
  for (const format of FORMATS) {
    const layout = layoutOf(PROFILE, format, full(PROFILE), { people: FILM_PEOPLE })
    const rects = allRects(layout)
    for (const rect of rects) assert.ok(inSafeArea(rect, format), `${format.id} : hors limites ${JSON.stringify(rect)}`)
    for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) assert.ok(!overlap(rects[i], rects[j]), `${format.id} : chevauchement`)
    const { hero, tiles } = spreadOf(layout)
    // Le profil porte en plus la ligne de ses bibliothèques sous son nom : le héros cède un peu de largeur.
    assert.ok(hero.rect.w >= 360 && tiles.every(tile => tile.rect.w >= 110), `${format.id} : affiches lisibles (${hero.rect.w}, ${tiles.map(tile => tile.rect.w)})`)
  }
})

test('Les personnes : de 1 à 5, tout reste dans la zone sûre, sans chevauchement, et les affiches restent lisibles', () => {
  for (const format of FORMATS) for (const count of [1, 2, 3, 4, 5]) {
    const layout = layoutOf(LIBRARY, format, full(LIBRARY), { people: FILM_PEOPLE.slice(0, count) })
    const label = `${format.id}/${count} personnes`
    const rects = allRects(layout)
    for (const rect of rects) assert.ok(inSafeArea(rect, format), `${label} : hors limites ${JSON.stringify(rect)}`)
    for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) assert.ok(!overlap(rects[i], rects[j]), `${label} : chevauchement`)
    const { hero, tiles } = spreadOf(layout)
    assert.ok(hero.rect.w >= 400, `${label} : héros ${hero.rect.w} px`)
    for (const tile of tiles) assert.ok(tile.rect.w >= 110, `${label} : voisin ${tile.rect.w} px`)
    assert.equal(1 + tiles.length, 7, `${label} : les sept coups de cœur tiennent encore`)
  }
})

test('Les personnes : cases égales d’au plus 240 px, rangée centrée, portrait carré centré dans sa case, sous les affiches et au-dessus des chiffres', () => {
  for (const format of FORMATS) for (const count of [1, 2, 4, 5]) {
    const layout = layoutOf(LIBRARY, format, full(LIBRARY), { people: FILM_PEOPLE.slice(0, count) })
    const { rect, cells } = peopleOf(layout)
    assert.equal(cells.length, count)
    assert.ok(cells.every(cell => cell.rect.w === cells[0].rect.w && cell.rect.w <= SHARE_CARD.personMaxWidth && cell.rect.y === rect.y))
    const left = cells[0].rect.x - rect.x
    const right = rect.x + rect.w - (cells.at(-1).rect.x + cells.at(-1).rect.w)
    assert.ok(Math.abs(left - right) <= 1, `${format.id}/${count} : rangée centrée (${left} / ${right})`)
    for (const cell of cells) {
      assert.equal(cell.portrait.w, cell.portrait.h)
      assert.ok(Math.abs((cell.portrait.x + cell.portrait.w / 2) - (cell.rect.x + cell.rect.w / 2)) <= 1, 'portrait centré')
      assert.ok(cell.portrait.y >= cell.rect.y && cell.portrait.y + cell.portrait.h <= cell.rect.y + cell.rect.h)
    }
    const { hero, tiles } = spreadOf(layout)
    const lowest = Math.max(hero.rect.y + hero.rect.h, ...tiles.map(tile => tile.rect.y + tile.rect.h))
    assert.ok(rect.y >= lowest + 24, 'sous les affiches')
    assert.ok(statsOf(layout).rect.y >= rect.y + rect.h + 24, 'au-dessus des chiffres')
  }
  assert.deepEqual(layoutPeopleCells({ x: 72, y: 0, w: 936, h: 148 }, 1).map(cell => [cell.x, cell.w]), [[72 + 348, 240]], 'une seule personne : au centre')
  assert.deepEqual(layoutPeopleCells({ x: 72, y: 0, w: 936, h: 148 }, 0), [])
})

test('Les portraits à charger sont listés une fois chacun, à part des affiches', () => {
  const layout = layoutOf(LIBRARY, SHARE_FORMATS.standard, full(LIBRARY), { people: [...FILM_PEOPLE, person('actor', 'Doublon', { portraitUrl: 'https://image.tmdb.org/t/p/w185/gg.jpg' })] })
  assert.deepEqual(layout.portraitUrls, ['https://image.tmdb.org/t/p/w185/gg.jpg', 'https://image.tmdb.org/t/p/w185/sr.jpg', 'https://image.tmdb.org/t/p/w185/fp.jpg'])
  assert.ok(layout.imageUrls.every(url => !layout.portraitUrls.includes(url)))
  assert.deepEqual(layoutOf(LIBRARY, SHARE_FORMATS.standard).portraitUrls, [])
})
