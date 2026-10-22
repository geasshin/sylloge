import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

// Exercise the real TSX without an HTTP listener, provider calls or a database.
const cacheDir = mkdtempSync(join(tmpdir(), 'sylloge-anime-home-'))
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  envFile: false,
  cacheDir,
  plugins: [react()],
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
})

try {
  const { Home } = await server.ssrLoadModule('/src/components/AtriumHome.tsx')
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-08`
  const statuses = ['vue', 'en cours', 'à voir', 'abandonnée']
  const seriesCollection = ['série télé', 'animation'].flatMap((category, categoryIndex) => statuses.map((status, index) => Object.freeze({
    id: `${categoryIndex}-${index}`, profileId: 'qa-memory', title: `${categoryIndex ? 'Animation' : 'Télé'} ${status}`,
    showrunner: 'Crédit de recette', casting: null, summary: null, category, status,
    rating: status === 'vue' ? 4 : null, isFavorite: status === 'vue',
    seasonsSeen: status === 'en cours' ? 2 : null, seasonsTotal: status === 'en cours' ? 4 : null,
    progressUpdatedAt: status === 'à voir' ? null : `${today}T12:00:00`, startedAt: today,
    posterUrl: null, personalNote: null, createdAt: `${today}T09:00:00`, updatedAt: `${today}T12:00:00`,
  })))
  // An existing non-Japanese animation must also move: category alone partitions.
  const westernAnimation = Object.freeze({ ...seriesCollection[4], id: 'western-animation', title: 'Animation occidentale existante' })
  seriesCollection.push(westernAnimation)
  Object.freeze(seriesCollection)
  const opened = []
  const props = {
    library: { films: [] }, seriesCollection, bookCollection: [], gameCollection: [], artworkCollection: [],
    onOpen: () => {}, onOpenSeries: (entry) => opened.push(entry), onOpenBook: () => {}, onOpenGame: () => {}, onOpenArtwork: () => {},
  }
  let storedTab = 'tout'
  globalThis.window = {
    localStorage: { getItem: () => storedTab },
    matchMedia: () => ({ matches: true }),
  }
  globalThis.document = { hidden: false }
  const renderHome = (slug, overrides = {}) => {
    storedTab = slug
    return renderToStaticMarkup(createElement(Home, { ...props, ...overrides }))
  }
  const section = (html, id) => html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`))?.[0] ?? ''
  const cards = (html) => [...html.matchAll(/class="at-work" data-medium="([^"]+)"/g)].map((match) => match[1])

  await test('Home partitions every series by its existing category without cloning or mutating records', () => {
    const before = JSON.stringify(seriesCollection)
    const entries = Home(props).props.allEntries
    assert.equal(entries.filter((entry) => entry.medium === 'animation').length, 5, 'Every animation record belongs to Animation japonaise')
    assert.equal(entries.filter((entry) => entry.medium === 'série').length, 4, 'Séries excludes every animation')
    assert.equal(entries.length, seriesCollection.length, 'Tout is the same union')
    assert.equal(new Set(entries.map((entry) => entry.key)).size, entries.length, 'Tout contains no duplicate keys')
    for (const source of seriesCollection) {
      const entry = entries.find((candidate) => candidate.key === `series-${source.id}`)
      assert.ok(entry, `Existing series identity remains stable: ${source.id}`)
      assert.equal(entry.medium, source.category === 'animation' ? 'animation' : 'série')
      entry.onOpen()
      assert.equal(opened.at(-1), source, 'Both destinations retain the original onOpenSeries callback and record')
    }
    assert.equal(JSON.stringify(seriesCollection), before, 'No stored value is changed by display partitioning')
  })

  await test('The persisted anime tab filters the hero, every lane, progress, statistics and activity', () => {
    const html = renderHome('anime')
    assert.match(html, /id="at-tab-anime"[^>]*aria-selected="true"/, 'The anime slug restores its distinct accessible tab')
    assert.match(html, /role="tabpanel"[^>]*aria-labelledby="at-tab-anime"/)
    assert.match(html, /aria-label="Bilan de l’onglet Animation japonaise"[^>]*><p class="at-stat"><b>2<\/b> <span>animations vues<\/span>/)
    assert.match(html, /<b>2<\/b> <span>ce mois-ci<\/span>/)
    assert.doesNotMatch(html, /Télé (?:vue|en cours|à voir|abandonnée)/, 'Séries never leaks into the anime tab')
    for (const id of ['at-favorites', 'at-progress', 'at-queue', 'at-recent', 'at-additions', 'at-pick']) {
      const lane = section(html, id)
      assert.ok(lane, `The real ${id} lane is available for animation`)
      assert.ok(cards(lane).length > 0, `${id} contains animation cards`)
      assert.ok(cards(lane).every((medium) => medium === 'animation'), `${id} contains only animation`)
    }
    assert.deepEqual(cards(section(html, 'at-favorites')), ['animation', 'animation'])
    assert.deepEqual(cards(section(html, 'at-progress')), ['animation'])
    assert.match(section(html, 'at-progress'), /Saison 2 sur 4/)
    assert.deepEqual(cards(section(html, 'at-queue')), ['animation'])
    assert.deepEqual(cards(section(html, 'at-recent')), ['animation', 'animation'])
    assert.equal(cards(section(html, 'at-additions')).length, 5)
    assert.equal(cards(section(html, 'at-pick')).length, 5)
    assert.match(html, /Affiche indisponible pour Animation en cours/, 'Animation keeps the series poster vocabulary')
    assert.match(html, /Animation japonaise · Crédit de recette/, 'The hero has a distinct medium label and existing contributor')
    assert.match(html, /class="at-cal-dots"[^>]*><i data-medium="animation"/)
    assert.match(html, /class="at-month-summary">2 animations vues en /)
    assert.match(html, /class="at-month-link"[^>]*>Animation vue<\/button>/)
    assert.match(html, /class="at-month-link"[^>]*>Animation occidentale existante<\/button>/, 'All pre-existing animation is included without origin inference')

    const television = renderHome('series')
    assert.doesNotMatch(television, /Animation (?:vue|en cours|à voir|abandonnée|occidentale)/)
    assert.deepEqual(cards(section(television, 'at-additions')), ['série', 'série', 'série', 'série'])
    assert.match(television, /<b>1<\/b> <span>série vue<\/span>/)
    assert.match(television, /class="at-month-summary">1 série vue en /)

    const all = renderHome('tout')
    const additions = section(all, 'at-additions')
    assert.equal(cards(additions).length, 9, 'Tout retains all nine original records exactly once in the additions lane')
    assert.equal(cards(additions).filter((medium) => medium === 'animation').length, 5)
    assert.equal(cards(additions).filter((medium) => medium === 'série').length, 4)
    for (const entry of seriesCollection) {
      assert.equal(additions.split(`aria-label="Ouvrir la fiche de ${entry.title},`).length - 1, 1, `One card for ${entry.id}`)
    }
    assert.match(all, /<b>3<\/b> <span>œuvres terminées<\/span>/)
    assert.match(all, /class="at-cal-dots"[^>]*><i data-medium="série"[^>]*><\/i><i data-medium="animation"/)
  })

  await test('Empty animation and Séries tabs remain distinct, and Tout names seven libraries', () => {
    const emptyAnimation = renderHome('anime', { seriesCollection: seriesCollection.filter((entry) => entry.category === 'série télé') })
    assert.match(emptyAnimation, /Aucune animation pour le moment : celles de la bibliothèque Animation japonaise apparaîtront ici\./)
    assert.match(emptyAnimation, /<b>0<\/b> <span>animation vue<\/span>/)
    assert.doesNotMatch(emptyAnimation, /class="at-hero"/)
    const emptySeries = renderHome('series', { seriesCollection: seriesCollection.filter((entry) => entry.category === 'animation') })
    assert.match(emptySeries, /Aucune série pour le moment/)
    assert.doesNotMatch(emptySeries, /class="at-hero"/)
    assert.match(renderHome('tout', { seriesCollection: [] }), /celles des sept bibliothèques apparaîtront ici/)
  })

  await test('Animation japonaise has its own monochrome line icon, distinct from Séries and Mangas', async () => {
    const icons = await server.ssrLoadModule('/src/components/icons.tsx')
    assert.equal(typeof icons.AnimeIcon, 'function', 'AnimeIcon is exported for the real application navigation')
    const icon = renderToStaticMarkup(createElement(icons.AnimeIcon))
    assert.match(icon, /width="17" height="17" viewBox="0 0 20 20" aria-hidden="true"/)
    assert.match(icon, /fill="none" stroke="currentColor" stroke-width="1.25"/)
    assert.match(icon, /<rect[^>]*x="3" y="6.5"/, 'Le cellulo avant reste identifiable')
    const filled = renderToStaticMarkup(createElement(icons.AnimeIcon, { filled: true }))
    assert.notEqual(filled, icon, 'La destination active emploie le dessin plein')
    assert.match(filled, /fill-rule="evenodd"/, 'Le signe de lecture reste découpé dans le cellulo plein')
    assert.notEqual(icon, renderToStaticMarkup(createElement(icons.SeriesIcon)))
    assert.notEqual(icon, renderToStaticMarkup(createElement(icons.MangaIcon)))
    assert.match(renderToStaticMarkup(createElement(icons.AnimeIcon, { size: 24 })), /width="24" height="24"/)
  })

  await test('The legacy mobile shell accepts anime as its own destination and uses the matching icon', async () => {
    const { MobileAppShell } = await server.ssrLoadModule('/src/components/MobileAppShell.tsx')
    const { AnimeIcon, ArtIcon } = await server.ssrLoadModule('/src/components/icons.tsx')
    const html = renderToStaticMarkup(createElement(MobileAppShell, {
      activeItem: 'anime', onHome() {}, onLibrary() {}, onSeries() {}, onAnime() {},
      onBooks() {}, onMangas() {}, onGames() {}, onArtworks() {}, onSettings() {},
      currentProfileName: null, currentProfileAvatar: null,
    }))
    const active = html.match(/<button class="mobile-bottom-item active"[\s\S]*?<\/button>/)?.[0]
    assert.ok(active, 'Animation japonaise has its own active quick-navigation destination')
    assert.match(active, /aria-current="page"/)
    assert.match(active, /<span>Animation japonaise<\/span>/)
    assert.ok(active.includes(renderToStaticMarkup(createElement(AnimeIcon))))
    const art = html.match(/<button class="mobile-bottom-item "[^>]*aria-label="Art"[\s\S]*?<\/button>/)?.[0]
    assert.ok(art?.includes(renderToStaticMarkup(createElement(ArtIcon))), 'Art keeps its own icon when a library is inserted before it')
  })
} finally {
  await server.close()
  rmSync(cacheDir, { recursive: true, force: true })
}
