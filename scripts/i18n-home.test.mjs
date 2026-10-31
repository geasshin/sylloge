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

// Real TSX, no HTTP listener, .env, provider requests or personal database.
const scratch = process.env.TMPDIR ?? tmpdir()
const cacheDir = mkdtempSync(join(scratch, 'sylloge-i18n-home-'))
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  envFile: false,
  cacheDir,
  plugins: [react(), {
    name: 'i18n-home-private-component-tests',
    transform(code, id) {
      const file = id.split('?')[0]
      if (file.endsWith('/src/components/CustomLibraryScreen.tsx')) {
        return `${code}\nexport { CustomEntryCard, CustomEntryDetail, RemoveLibraryDialog };`
      }
      if (file.endsWith('/src/components/MobileAppShell.tsx')) {
        // The navigation drawer opens from a click, which static rendering cannot send.
        const closed = 'useState(false)'
        if (!code.includes(closed)) throw new Error('MobileAppShell no longer starts with useState(false): update this harness')
        return code.replace(closed, 'useState(globalThis.__syllogeDrawerOpen === true)')
      }
    },
  }],
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
})
const previousWindow = globalThis.window
const previousDocument = globalThis.document
const previousHTMLElement = globalThis.HTMLElement
globalThis.HTMLElement = class HTMLElement {}
const storage = new Map([['sylloge-home-tab', 'tout']])
let reducedMotion = true
globalThis.window = {
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  matchMedia: () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {}, removeEventListener() {},
}
globalThis.document = { hidden: false, documentElement: { lang: '' } }

// Declared outside the block so the cleanup in `finally` can reach it.
let core = null
try {
  // During RED the absent core must not hide the actual French-only UI failure.
  core = await server.ssrLoadModule('/src/i18n/core.ts').catch((error) => {
    if (/Failed to load url .*\/src\/i18n\/core\.ts/.test(error.message)) return null
    throw error
  })
  const { Home } = await server.ssrLoadModule('/src/components/AtriumHome.tsx')
  const now = new Date()
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-08`
  const film = Object.freeze({
    id: 'qa-film', profileId: 'qa-memory', title: 'Pioche du jour', director: 'Réalisation', year: 2024,
    casting: null, summary: 'Résumé français à conserver.', status: 'terminé', rating: 4.5, isFavorite: true,
    watchedAt: day, posterUrl: null, personalNote: 'Derniers ajouts', createdAt: `${day}T09:00:00`, updatedAt: `${day}T12:00:00`,
  })
  const series = Object.freeze({
    id: 'qa-series', profileId: 'qa-memory', title: 'Série en français', showrunner: 'Auteur français',
    casting: null, summary: 'Résumé intact', category: 'série télé', status: 'en cours', rating: null,
    isFavorite: false, seasonsSeen: 2, seasonsTotal: 4, progressUpdatedAt: `${day}T12:00:00`, startedAt: day,
    posterUrl: null, personalNote: null, createdAt: `${day}T09:00:00`, updatedAt: `${day}T12:00:00`,
  })
  const homeProps = {
    library: { profile: { id: 'qa-memory', name: 'Mémoire' }, films: [film] }, seriesCollection: [series], bookCollection: [], gameCollection: [], artworkCollection: [],
    onOpen() {}, onOpenSeries() {}, onOpenBook() {}, onOpenGame() {}, onOpenArtwork() {},
  }
  const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))

  await test('English home translates UI, progress, calendar, numbers and ARIA without translating French user content', () => {
    core?.setLanguage('en')
    const before = JSON.stringify(homeProps)
    const html = render(Home, homeProps)
    assert.ok(html.includes('aria-label="Home"'), 'The home landmark must be English')
    assert.ok(html.includes('>Share my profile</button>'), 'The profile card button is English on the All tab')
    for (const copy of ['Featured', 'Favourites', 'In progress', 'Recent additions', 'Daily picks', 'Activity', 'Season 2 of 4', 'Previous month', 'Next month', '4.5 out of 5']) {
      assert.ok(html.includes(copy), `English copy is rendered: ${copy}`)
    }
    const month = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(now)
    assert.ok(html.includes(`<h3>${month}</h3>`), 'The displayed calendar month follows the active locale')
    assert.match(html, /class="at-cal-weekdays"[^>]*><span>M<\/span><span>T<\/span><span>W<\/span><span>T<\/span><span>F<\/span><span>S<\/span><span>S<\/span>/)
    assert.ok(html.includes('<h3 class="at-slide-title">Pioche du jour</h3>'), 'A title identical to a UI translation key remains French')
    assert.ok(html.includes('« Derniers ajouts »'), 'A personal note identical to a UI key remains French')
    assert.ok(html.includes('Film · 2024 · Réalisation'), 'The user-entered creator is not translated')
    assert.ok(html.includes('Open details for Pioche du jour'), 'ARIA translates the wrapper, never the title')
    assert.equal(JSON.stringify(homeProps), before, 'Rendering never rewrites stored records or French statuses')
  })

  await test('All nine custom-library models have English names, descriptions, non-empty labels and unchanged French domain values', async () => {
    core?.setLanguage('en')
    const { AddLibraryDialog } = await server.ssrLoadModule('/src/components/AddLibraryDialog.tsx')
    const custom = await server.ssrLoadModule('/src/components/CustomLibraryScreen.tsx')
    const { CUSTOM_LIBRARY_IDS, CUSTOM_LIBRARY_TEMPLATES } = await server.ssrLoadModule('/src/domain/customLibraries.ts')
    const before = JSON.stringify(CUSTOM_LIBRARY_TEMPLATES)
    const catalogue = render(AddLibraryDialog, { enabled: ['comics'], onClose() {}, async onAdd() {} })
    assert.ok(catalogue.includes('Add a library'), 'The real library catalogue opens in English')
    const names = ['Comics', 'Magazines', 'Audiobooks', 'Music', 'Podcasts', 'Documentaries and reports', 'Performances', 'Board games', 'Cooking recipes']
    const descriptions = [
      'Comics, graphic novels and bandes dessinées, series by series.',
      'Journals and magazines, by issue or across subscriptions.',
      'Novels and essays read aloud, with narration and duration.',
      'Albums, EPs and singles, with artist, genre and label.',
      'Audio programmes and series, episode by episode.',
      'Documentary films, documentary series and reports.',
      'Theatre, dance, opera, comedy, circus and concerts.',
      'Board, card and party games, one session at a time.',
      'Cooking recipes: ingredients, method, timings, photo and notes on how they turned out.',
    ]
    for (const [index, id] of CUSTOM_LIBRARY_IDS.entries()) {
      assert.ok(catalogue.includes(`<b>${names[index]}</b>`), `${id} has its English catalogue name`)
      assert.ok(catalogue.includes(descriptions[index]), `${id} has its English description`)
      const template = CUSTOM_LIBRARY_TEMPLATES[id]
      const screen = render(custom.CustomLibraryScreen, {
        libraryId: id, profileId: 'qa-memory', profileName: 'Musique', entryId: null,
        onOpenEntry() {}, onChanged() {}, onRemoved() {},
      })
      assert.ok(screen.includes('Loading library…'), `${id} has an English loading state`)
      assert.ok(screen.includes(core.t(template.label)), `${id} has its translated heading`)
      assert.ok(screen.includes('for profile Musique'), 'Profile names matching UI keys remain French')
      assert.doesNotMatch(screen, /(?:aria-label|placeholder)=""/, `${id} has no empty accessible label`)
      for (const status of template.statuses) {
        assert.ok(screen.includes(`>${core.t(template.statusLabels[status])}</button>`), `${id}: ${status} renders a non-empty label`)
      }
    }
    assert.ok(catalogue.includes('Comics (already added)'))
    assert.equal(JSON.stringify(CUSTOM_LIBRARY_TEMPLATES), before, 'The source catalogue, statuses and stored option values remain French')
  })

  await test('Custom entry details translate UI, dates, rating and progress while preserving French user fields', async () => {
    core?.setLanguage('en')
    const custom = await server.ssrLoadModule('/src/components/CustomLibraryScreen.tsx')
    const entry = Object.freeze({
      id: 'qa-comic', profileId: 'qa-memory', title: 'Musique', creator: 'Réalisation', year: 2024,
      status: 'terminé', rating: 4.5, isFavorite: true, progressCurrent: 1234, progressTotal: 2345,
      progressUpdatedAt: `${day}T12:00:00`, startedAt: day, finishedAt: '2024-03-08', coverUrl: null,
      summary: 'Derniers ajouts', personalNote: 'Pioche du jour',
      details: Object.freeze({ format: 'Roman graphique', series: 'Série', artist: 'Artiste', publisher: 'Éditeur', 'Champ français': 'Coups de cœur' }),
      quotes: [], createdAt: `${day}T09:00:00`, updatedAt: `${day}T12:00:00`,
    })
    const before = JSON.stringify(entry)
    const html = render(custom.CustomEntryDetail, { libraryId: 'comics', entry, onBack() {}, onEdit() {}, async onCoverEdit() {}, async onDelete() {} })
    for (const copy of ['Back to Comics', 'Edit entry', 'Volumes read', ' on 8 March 2024', '1,234 / 2,345']) {
      assert.ok(html.includes(copy), `English detail copy is rendered: ${copy}`)
    }
    for (const raw of ['<h1 class="display-title">Musique</h1>', '<dd>Réalisation</dd>', '<dd>2024</dd>', '<dd>Série</dd>', '<dd>Artiste</dd>', '<dd>Éditeur</dd>', '<dt>Champ français</dt><dd>Coups de cœur</dd>', '<p>Derniers ajouts</p>', 'class="review-personal">Pioche du jour</blockquote>']) {
      assert.ok(html.includes(raw), `User-authored French remains untouched: ${raw}`)
    }
    const card = render(custom.CustomEntryCard, { libraryId: 'comics', entry, onOpen() {} })
    assert.ok(card.includes('Open details for Musique'))
    assert.ok(card.includes('Read · 1,234 / 2,345'))
    const removal = render(custom.RemoveLibraryDialog, { libraryId: 'comics', entryCount: 1234, onClose() {}, async onConfirm() {} })
    assert.ok(removal.includes('Delete library and its 1,234 entries'))
    assert.equal(JSON.stringify(entry), before, 'Display formatting never mutates status, counts, dates or custom fields')
  })

  await test('Per-library contexts disambiguate shared French labels without touching stored keys', async () => {
    core?.setLanguage('en')
    const custom = await server.ssrLoadModule('/src/components/CustomLibraryScreen.tsx')
    const entry = (overrides) => Object.freeze({
      id: 'qa-context', profileId: 'qa-memory', title: 'Titre intact', creator: 'Nom intact', year: 2020,
      status: 'terminé', rating: null, isFavorite: false, progressCurrent: null, progressTotal: null,
      progressUpdatedAt: null, startedAt: null, finishedAt: null, coverUrl: null,
      summary: null, personalNote: null, details: Object.freeze({}), quotes: [],
      createdAt: `${day}T09:00:00`, updatedAt: `${day}T12:00:00`, ...overrides,
    })
    const comic = entry({ details: Object.freeze({ artist: 'Craig Thompson' }) })
    const comicHtml = render(custom.CustomEntryDetail, { libraryId: 'comics', entry: comic, onBack() {}, onEdit() {}, async onCoverEdit() {}, async onDelete() {} })
    // shared.ts: 'comics\u0004Dessin' => 'Artist', not the generic 'Drawing'.
    assert.ok(comicHtml.includes('<dt>Artist</dt>'), 'The comics illustrator credit is not a drawing')
    assert.ok(comicHtml.includes('<dd>Craig Thompson</dd>'))
    const podcast = entry({ creator: 'Autrice intacte', details: Object.freeze({ format: 'Interview', theme: 'Technologie' }) })
    const podcastHtml = render(custom.CustomEntryDetail, { libraryId: 'podcasts', entry: podcast, onBack() {}, onEdit() {}, async onCoverEdit() {}, async onDelete() {} })
    // shared.ts: 'podcasts\u0004Animation' => 'Host', not the art form. Since
    // 31 October 2026 the host is a row of the facts grid, never under the title.
    assert.ok(podcastHtml.includes('<dt>Host</dt><dd>Autrice intacte</dd>'), 'The host stays intact in the facts, labelled Host')
    assert.ok(!podcastHtml.includes('detail-factline'), 'No line under the title any more')
    const { CustomEntryForm } = await server.ssrLoadModule('/src/components/CustomEntryForm.tsx')
    const podcastForm = render(CustomEntryForm, { libraryId: 'podcasts', entry: podcast, onCancel() {}, onSave: async () => {} })
    assert.ok(podcastForm.includes('Host'), 'The podcast host credit is not the animation medium')
    assert.ok(!podcastForm.includes('>Animation<'), 'The art-form label never names the podcast host')
    assert.ok(podcastHtml.includes('<dt>Theme</dt>'), 'Catalog field labels are translated')
    assert.ok(podcastHtml.includes('class="eyebrow">Interview</p>'), 'The catalogue option stays an English option')

    core?.setLanguage('fr')
    const french = render(custom.CustomEntryDetail, { libraryId: 'comics', entry: comic, onBack() {}, onEdit() {}, async onCoverEdit() {}, async onDelete() {} })
    assert.ok(french.includes('<dt>Dessin</dt>'), 'French keeps the source label')
    assert.ok(french.includes('class="eyebrow">Comics</p>'), 'French keeps the source library name')
    core?.setLanguage('en')
  })

  await test('Mobile navigation translates the header, drawer and quick bar while the profile name stays as entered', async () => {
    const { MobileAppShell } = await server.ssrLoadModule('/src/components/MobileAppShell.tsx')
    const props = {
      activeItem: 'home', onHome() {}, onLibrary() {}, onSeries() {}, onAnime() {}, onBooks() {}, onMangas() {},
      onGames() {}, onArtworks() {}, onSettings() {}, currentProfileName: 'Musique', currentProfileAvatar: null,
    }
    const count = (html, needle) => html.split(needle).length - 1
    globalThis.__syllogeDrawerOpen = true
    try {
      core?.setLanguage('en')
      const english = render(MobileAppShell, props)
      for (const copy of [
        'aria-label="Mobile header"', 'aria-label="Open menu"', '<span>Menu</span>', 'aria-label="Back to Home"',
        'aria-label="Open settings"', 'aria-label="Main navigation"', '<span>Local library</span>', 'aria-label="Close menu"',
        'aria-label="Destinations"', '<span>Settings</span>', 'aria-label="Quick navigation"', '<span>Sylloge</span>',
        '<span>Musique</span>',
      ]) assert.ok(english.includes(copy), `English mobile copy is rendered: ${copy}`)
      // The drawer lists the eight destinations; the quick bar repeats the first five and Art.
      for (const [label, occurrences] of [['Home', 2], ['Films', 2], ['Series', 2], ['Anime', 2], ['Books', 2], ['Manga', 1], ['Games', 1], ['Art', 2]]) {
        assert.equal(count(english, `<span>${label}</span>`), occurrences, `${label} is shown ${occurrences} time(s)`)
      }
      assert.ok(english.includes('aria-label="Art"'), 'The Art shortcut keeps an accessible name')
      assert.doesNotMatch(english, /Accueil|Séries|Livres|Mangas|Jeux|Paramètres|Ouvrir|Fermer|Revenir|Bibliothèque|rapide|principale|En-tête/, 'No French UI copy is left')

      core?.setLanguage('fr')
      const french = render(MobileAppShell, props)
      for (const copy of [
        'aria-label="En-tête mobile"', 'aria-label="Ouvrir le menu"', '<span>Menu</span>', 'aria-label="Revenir à l’accueil"',
        'aria-label="Ouvrir les paramètres"', 'aria-label="Navigation principale"', '<span>Bibliothèque locale</span>',
        'aria-label="Fermer le menu"', 'aria-label="Destinations"', '<span>Paramètres</span>', 'aria-label="Navigation rapide"',
        '<span>Accueil</span>', '<span>Animation japonaise</span>', '<span>Séries</span>',
      ]) assert.ok(french.includes(copy), `French mobile copy is unchanged: ${copy}`)
    } finally {
      delete globalThis.__syllogeDrawerOpen
    }
  })
} finally {
  core?.setLanguage('fr')
  globalThis.window = previousWindow
  globalThis.document = previousDocument
  globalThis.HTMLElement = previousHTMLElement
  await server.close()
  rmSync(cacheDir, { recursive: true, force: true })
}
