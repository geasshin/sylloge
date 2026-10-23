import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

// Real TSX, no HTTP listener, no .env, no database or provider requests.
const cacheDir = mkdtempSync(join(tmpdir(), 'sylloge-i18n-views-'))
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, envFile: false,
  cacheDir, plugins: [react()], logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
})

try {
  const core = await server.ssrLoadModule('/src/i18n/core.ts')
  const { LibraryViewBar } = await server.ssrLoadModule('/src/components/LibraryViewBar.tsx')
  const { PROGRESS_BUILTIN_VIEWS } = await server.ssrLoadModule('/src/domain/libraryViews.ts')
  const { EMPTY_LIBRARY_FILTERS } = await server.ssrLoadModule('/src/domain/libraryFilters.ts')
  const noop = () => {}
  const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
  const barProps = (overrides = {}) => ({
    profileId: 'i18n-synthetic', medium: 'series', builtinViews: PROGRESS_BUILTIN_VIEWS,
    activeView: PROGRESS_BUILTIN_VIEWS[0], onViewChange: noop,
    filterConfig: { mediumFilter: null, statusOptions: [{ value: 'en cours', label: 'En cours' }],
      showRating: true, showYear: false, personalDateLabel: 'Début de visionnage',
      specificTextField: null, showLocation: false, showExhibition: false },
    mediumFilterValue: 'all', onMediumFilterChange: noop, extraFilters: { ...EMPTY_LIBRARY_FILTERS },
    onExtraFiltersChange: noop, sortCapabilities: { rating: true, year: false },
    sortOverride: null, onSortOverrideChange: noop,
    currentCriteria: { sort: PROGRESS_BUILTIN_VIEWS[0].sort, mediumFilter: 'all', filters: { ...EMPTY_LIBRARY_FILTERS } },
    // Effects do not run in SSR: repository methods must never be reached.
    savedViewsRepository: new Proxy({}, { get() { throw new Error('SSR must not access the repository') } }),
    ...overrides,
  })

  await test('Les vues intégrées et les actions/ARIA de la vraie barre se traduisent en anglais', () => {
    core.setLanguage?.('en')
    const html = render(LibraryViewBar, barProps({ extraFilters: { ...EMPTY_LIBRARY_FILTERS, favoritesOnly: true } }))
    assert.match(html, /role="toolbar" aria-label="Views"/)
    for (const label of ['All', 'To watch', 'In progress', 'Recent', 'This year', 'Favourite', 'Ranking', 'New view', 'Filter']) {
      assert.ok(html.includes(`>${label}<`), `Missing English UI: ${label}`)
    }
    assert.match(html, /aria-label="Filter, 1 active criterion"/)
    assert.match(html, /aria-label="Sort, currently: Title, ascending"/)
    assert.match(html, /aria-label="Reset the “All” view"/)
    assert.doesNotMatch(html, />Tous<|>Filtrer<|>En cours<|>Nouvelle vue</)
  })

  await test('Une vue personnelle nommée Tous ou En cours conserve son nom et ses ARIA', () => {
    core.setLanguage?.('en')
    for (const name of ['Tous', 'En cours']) {
      const personal = Object.freeze({ ...PROGRESS_BUILTIN_VIEWS[0], id: `personal-${name}`, name, builtin: false })
      // The same renderViewButton handles definitions from both provenance paths.
      // SSR supplies the custom definition directly because it does not run list effects.
      const html = render(LibraryViewBar, barProps({ builtinViews: [PROGRESS_BUILTIN_VIEWS[0], personal], activeView: personal,
        extraFilters: { ...EMPTY_LIBRARY_FILTERS, favoritesOnly: true } }))
      assert.ok(html.includes(`>${name}<`), `Custom name was translated: ${name}`)
      assert.ok(html.includes(`aria-label="Options for the “${name}” view"`))
      assert.ok(html.includes(`aria-label="Reset the “${name}” view"`))
      assert.equal(personal.name, name)
    }
  })
  await test('Les catégories et compteurs traduisent leur UI sans modifier les valeurs ou les libellés utilisateur', async () => {
    core.setLanguage('en')
    const { SeriesCategorySwitch, BookCategorySwitch, CategorySwitch } = await server.ssrLoadModule('/src/components/CategorySwitch.tsx')
    const { Stepper } = await server.ssrLoadModule('/src/components/Stepper.tsx')
    const { Select } = await server.ssrLoadModule('/src/components/Select.tsx')
    const series = render(SeriesCategorySwitch, { selected: [], onSelectionChange: noop })
    assert.match(series, /aria-label="Displayed categories"/)
    assert.match(series, /title="Hide TV series"/)
    assert.match(series, />TV series<\/button>/)
    assert.match(render(BookCategorySwitch, { selected: ['manga'], onSelectionChange: noop }), /title="Show Book"/)
    const custom = render(CategorySwitch, { categories: ['custom'], value: [], onChange: noop, labels: { custom: 'Tous' } })
    assert.match(custom, /title="Hide Tous"/)
    assert.match(custom, />Tous<\/button>/)
    const stepper = render(Stepper, { id: 'seasonsSeen', label: 'Saisons vues', value: '2', max: 2, onChange: noop })
    assert.match(stepper, /<label for="seasonsSeen">Seasons watched<\/label>/)
    assert.match(stepper, /aria-label="Subtract 1 from Seasons watched"/)
    assert.match(stepper, /disabled="" aria-label="Add 1 to Seasons watched"/)
    assert.match(stepper, /name="seasonsSeen"[^>]*value="2"/)
    const readonly = render(Stepper, { id: 'total', label: 'Tomes au total', value: '1200', readOnly: true, hint: 'Fourni par TMDB' })
    assert.match(readonly, />1,200<small>Provided by TMDB<\/small>/)
    const options = Object.freeze([Object.freeze({ value: 'en cours', label: core.t('En cours') })])
    const select = render(Select, { id: 'status', labelledBy: 'status-label', value: 'en cours', name: 'status', options, onChange: noop })
    assert.match(select, />In progress<\/span>/)
    assert.match(select, /type="hidden" name="status" value="en cours"/)
    assert.equal(options[0].value, 'en cours')
    assert.match(render(Select, { id: 'custom', labelledBy: 'custom-label', value: 'Tous', options: [{ value: 'Tous', label: 'Tous' }], onChange: noop }), />Tous<\/span>/)
  })
  await test('Les quatre recherches fournisseur rendent leur UI anglaise et préservent le titre de la fiche', async () => {
    core.setLanguage('en')
    const fixture = Object.freeze({ id: 'synthetic', title: 'Tous', posterUrl: null, coverUrl: null })
    const paths = [
      ['TmdbSearchFlow', { film: fixture, pendingCandidateId: 7 }, 'Search for a film', 'Film title', 'TMDB search'],
      ['SeriesTmdbSearchFlow', { existing: fixture, pendingCandidateId: 7 }, 'Search for TV series', 'TV series title', 'TMDB TV search'],
      ['BookOpenLibrarySearchFlow', { existing: fixture, pendingCandidateKey: '/works/synthetic' }, 'Search for a book', 'Book title', 'Open Library search'],
      ['GameIgdbSearchFlow', { existing: fixture, pendingCandidateId: 7 }, 'Search for a game', 'Game title', 'IGDB search'],
    ]
    for (const [name, existing, heading, label, aria] of paths) {
      const { [name]: Component } = await server.ssrLoadModule(`/src/components/${name}.tsx`)
      const callbacks = { onSelectCandidate: noop, onManual: noop, onCancel: noop }
      const create = render(Component, callbacks)
      assert.ok(create.includes(`>${heading}</h1>`), `English heading missing: ${name}`)
      assert.ok(create.includes(`>${label}</label>`), `English label missing: ${name}`)
      assert.ok(create.includes(`aria-label="${aria}"`))
      assert.match(create, />Enter manually<\/button>/)
      assert.match(create, /Suggestions update as you type\./)
      const context = render(Component, { ...callbacks, ...existing })
      assert.match(context, />Edit association<\/h1>/)
      assert.match(context, />Current entry<\/p>/)
      assert.match(context, /value="Tous"/)
      assert.match(context, />Tous<\/h2>/)
      assert.match(context, /for “Tous”\./)
      assert.match(context, /role="status">Preparing (?:the entry|the update)…<\/div>/)
      assert.equal(fixture.title, 'Tous')
      const compact = render(Component, { ...callbacks, ...existing, compact: true })
      assert.doesNotMatch(compact, /<main|page-action-bar/)
      assert.match(compact, />Back to entry<\/button>/)
    }
    const { SeriesTmdbSearchFlow } = await server.ssrLoadModule('/src/components/SeriesTmdbSearchFlow.tsx')
    const { BookOpenLibrarySearchFlow } = await server.ssrLoadModule('/src/components/BookOpenLibrarySearchFlow.tsx')
    assert.match(render(SeriesTmdbSearchFlow, { mediumLabel: 'animation japonaise', onSelectCandidate: noop, onManual: noop, onCancel: noop }), />Search for anime<\/h1>/)
    assert.match(render(BookOpenLibrarySearchFlow, { mediumLabel: 'manga', onSelectCandidate: noop, onManual: noop, onCancel: noop }), />Search for a manga<\/h1>/)
  })

  await test('Les nouvelles recherches TMDB et la navigation du Select suivent la locale active', () => {
    for (const [file, service] of [['TmdbSearchFlow', 'searchTmdbFilms'], ['SeriesTmdbSearchFlow', 'searchTmdbSeries']]) {
      const source = readFileSync(new URL(`../src/components/${file}.tsx`, import.meta.url), 'utf8')
      assert.ok(source.includes(`${service}(trimmed, getLocale())`), `${file} must pass the current locale for future requests`)
      assert.doesNotMatch(source, /['"]fr-FR['"]|['"]en-GB['"]/)
      // Changing UI language must not restart an existing provider query.
      assert.match(source, /\}, \[query\]\)/)
    }
    const select = readFileSync(new URL('../src/components/Select.tsx', import.meta.url), 'utf8')
    assert.match(select, /toLocaleLowerCase\(getLocale\(\)\)/)
  })
  await test('Les diagnostics déjà interpolés sont traduits à la frontière sans traduire leur nom de vue', async () => {
    core.setLanguage('en')
    const { GameIgdbSearchFlow } = await server.ssrLoadModule('/src/components/GameIgdbSearchFlow.tsx')
    const diagnostic = 'Vue « Tous » enregistrée.'
    const html = render(GameIgdbSearchFlow, { selectionError: diagnostic, onSelectCandidate: noop, onManual: noop, onCancel: noop })
    assert.match(html, /role="alert"><p>“Tous” view saved\.<\/p>/)
    assert.equal(diagnostic, 'Vue « Tous » enregistrée.')
  })
} finally {
  await server.close()
  rmSync(cacheDir, { recursive: true, force: true })
}
