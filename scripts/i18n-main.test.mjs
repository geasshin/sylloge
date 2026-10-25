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

// Vraies fonctions TSX. Seul le bootstrap DOM final est retiré du module de test.
// Aucun port HTTP, .env, fournisseur ou accès à une base personnelle.
const scratch = process.env.TMPDIR ?? tmpdir()
const cacheDir = mkdtempSync(join(scratch, 'sylloge-i18n-main-'))
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, envFile: false,
  cacheDir, logLevel: 'error', appType: 'custom',
  plugins: [{
    name: 'main-private-components-without-dom-bootstrap', enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0].endsWith('/src/main.tsx')) {
        const bootstrap = code.lastIndexOf('const rootElement =')
        assert.ok(bootstrap > 0, 'Le vrai bootstrap doit être identifié explicitement')
        return `${code.slice(0, bootstrap)}\nexport { App, Sidebar, LoadingState, ErrorState, EmptyLibrary, FilmsLibrary, SeriesLibrary, BooksLibrary, GamesLibrary, ArtworksLibrary, FilmCard, SeriesCard, BookCard, GameCard, ArtworkCard, AutoAssociateDialog, AutoAssociateEditsDialog, SqliteFilmDetail, librarySubtitle, bookBackLabel, seriesBackLabel };`
      }
    },
  }, react()],
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
})
const noop = () => {}
const render = (Component, props = {}) => renderToStaticMarkup(createElement(Component, props))
const sidebarProps = {
  expanded: false, onToggleExpanded: noop, count: 3, seriesCount: 2, animeCount: 1,
  bookCount: 4, mangaCount: 2, gameCount: 1, artworkCount: 2,
  customLibraries: [], activeCustomLibrary: null, onCustomLibrary: noop, onAddLibrary: noop,
  currentProfileName: 'Paramètres', currentProfileAvatar: null, activeItem: 'home',
  onHome: noop, onLibrary: noop, onSeries: noop, onAnime: noop, onBooks: noop,
  onMangas: noop, onGames: noop, onArtworks: noop, onSettings: noop,
  settingsSection: 'profiles', onSettingsSection: noop, onReturnToLibrary: noop,
}

try {
  const core = await server.ssrLoadModule('/src/i18n/core.ts')
  const main = await server.ssrLoadModule('/src/main.tsx')
  await test('La navigation principale se traduit au rendu sans traduire le nom du profil', () => {
    core.setLanguage('en')
    const english = render(main.Sidebar, sidebarProps)
    for (const label of ['Main navigation', 'Home', 'Libraries', 'Films', 'Series', 'Anime', 'Books', 'Manga', 'Games', 'Art', 'Settings', 'Add a library', 'Keep sidebar open']) {
      assert.ok(english.includes(label), `Libellé anglais absent : ${label}`)
    }
    assert.ok(english.includes('<span>Paramètres</span>'), 'Le nom personnel reste intact même s’il correspond à une clé')
    core.setLanguage('fr')
    const french = render(main.Sidebar, sidebarProps)
    assert.match(french, /aria-label="Navigation principale"/)
    assert.match(french, /aria-label="Garder la barre latérale ouverte"/)
  })

  const views = await server.ssrLoadModule('/src/domain/libraryViews.ts')
  const { EMPTY_LIBRARY_FILTERS } = await server.ssrLoadModule('/src/domain/libraryFilters.ts')
  const collectionProps = (medium, overrides = {}) => ({
    profileId: 'qa-memory', profileName: 'Paramètres', collection: [], allSeries: [], allBooks: [],
    context: { query: '', category: medium === 'anime' ? ['animation'] : medium === 'series' ? ['série télé'] : medium === 'mangas' ? ['manga'] : ['livre'],
      form: 'all', platform: 'all', view: views.defaultBuiltinViewForMedium(medium === 'artworks' ? views.UNRATED_BUILTIN_VIEWS : ['series', 'anime', 'books', 'mangas'].includes(medium) ? views.PROGRESS_BUILTIN_VIEWS : views.RATED_BUILTIN_VIEWS, ['anime'].includes(medium) ? 'series' : medium === 'mangas' ? 'books' : medium),
      extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null },
    searchState: { status: 'ready', films: [], series: [], books: [], games: [], artworks: [] },
    onContextChange: noop, onRetrySearch: noop, onCreate: noop, onOpen: noop, onLibraryChanged: noop,
    library: medium === 'films' ? { profile: { id: 'qa-memory', name: 'Paramètres' }, films: [] } : medium,
    ...overrides,
  })
  await test('Les sept bibliothèques affichent leurs en-têtes, recherches et états vides en anglais', () => {
    core.setLanguage('en')
    const cases = [
      ['films', main.FilmsLibrary, 'Films', 'Add a film', 'Title, original title or director'],
      ['series', main.SeriesLibrary, 'Series', 'Add a series', 'Title, showrunner or cast'],
      ['anime', main.SeriesLibrary, 'Anime', 'Add an anime', 'Title, showrunner or cast'],
      ['books', main.BooksLibrary, 'Books', 'Add a book', 'Title, author or synopsis'],
      ['mangas', main.BooksLibrary, 'Manga', 'Add a manga', 'Title, author or synopsis'],
      ['games', main.GamesLibrary, 'Games', 'Add a game', 'Title, studio or platform'],
      ['artworks', main.ArtworksLibrary, 'Art', 'Add an artwork', 'Title, artist, location or exhibition'],
    ]
    for (const [medium, Component, title, add, placeholder] of cases) {
      const html = render(Component, collectionProps(medium))
      for (const copy of [`<h1 class="display-title">${title}</h1>`, add, `placeholder="${placeholder}"`, 'is empty.']) {
        assert.ok(html.includes(copy), `${medium} : absent ${copy}`)
      }
      assert.ok(html.includes('Paramètres'), 'Le profil reste inchangé')
      assert.doesNotMatch(html, />Tout associer<|>Importer<|>Ajouter un|Rechercher par titre/)
    }
  })
  await test('Les cartes traduisent seulement statut, catégorie, progression et nom accessible', () => {
    core.setLanguage('en')
    const base = Object.freeze({ id: 'qa-entry', title: 'Favori', director: 'Réalisation', author: 'Auteur', showrunner: 'En cours', developer: 'Ajouter', artist: 'Artiste', year: 2024,
      posterUrl: null, coverUrl: null, imageUrl: null, isFavorite: true, platform: 'Toutes', summary: 'Résumé intact', personalNote: 'Avis intact',
      seasonsSeen: 1, seasonsTotal: 2, volumesRead: 2, volumesTotal: 3 })
    const cases = [
      [main.FilmCard, 'film', { ...base, status: 'terminé' }, 'Completed'],
      [main.SeriesCard, 'series', { ...base, status: 'en cours', category: 'animation' }, '1 / 2 seasons'],
      [main.BookCard, 'book', { ...base, status: 'à lire', category: 'livre' }, '2 / 3 volumes'],
      [main.GameCard, 'game', { ...base, status: 'joué' }, 'Played'],
      [main.ArtworkCard, 'artwork', { ...base, status: 'découverte', form: 'peinture' }, 'Painting'],
    ]
    for (const [Component, prop, record] of cases) Object.freeze(record)
    for (const [Component, prop, record, translated] of cases) {
      const before = JSON.stringify(record)
      const html = render(Component, { [prop]: record, onOpen: noop })
      assert.ok(html.includes('aria-label="Open details for Favori"'))
      assert.ok(html.includes('<b>Favori</b>'))
      assert.ok(html.includes(translated), translated)
      assert.equal(JSON.stringify(record), before)
    }
    assert.equal(main.librarySubtitle([{ isFavorite: true }, { isFavorite: false }], 'film', 'films'), '2 films including 1 favourite')
    assert.equal(main.librarySubtitle([], 'manga', 'mangas'), '0 manga')
  })

  const pendingFilm = { id: 'qa-pending', title: 'Sans lien', director: null, year: null, posterUrl: null, isFavorite: false, status: 'à voir', providerId: null, providerName: null }
  // Doubles minimaux : AccessibleDialog mémorise le déclencheur au rendu, sans DOM en SSR.
  globalThis.document = { activeElement: null, documentElement: {}, body: { style: {} }, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} }
  globalThis.HTMLElement = class {}
  await test('La boîte de dialogue « Tout associer » des films se traduit au rendu', () => {
    core.setLanguage('en')
    const html = render(main.AutoAssociateDialog, { open: true, onClose: noop, films: [pendingFilm], onDone: noop })
    for (const copy of [
      'Link every unlinked entry using TMDB?',
      'Automatic entry search on TMDB',
      '1 entry is not linked yet.',
      'Sylloge will search each title and keep the closest match (title and year).',
      'Ratings, reviews and statuses are never changed.',
      'Entries already linked are left untouched, and any link can be fixed entry by entry if the match is wrong.',
      'No', 'Yes, start',
    ]) assert.ok(html.includes(copy), `Copie anglaise absente : ${copy}`)
    core.setLanguage('fr')
    const french = render(main.AutoAssociateDialog, { open: true, onClose: noop, films: [pendingFilm], onDone: noop })
    assert.match(french, /Associer toutes les fiches non associées via TMDB \?/)
    assert.match(french, /1 fiche n’est pas encore associée\./)
  })

  await test('La boîte de dialogue des champs éditoriaux se traduit au rendu', () => {
    core.setLanguage('en')
    const html = render(main.AutoAssociateEditsDialog, {
      open: true, onClose: noop, providerLabel: 'Open Library', pendingCount: 2,
      confirmText: 'Standardise all books using Open Library?',
      run: async () => ({ associatedCount: 0, noMatchCount: 0 }), onDone: noop,
    })
    for (const copy of [
      'Standardise all books using Open Library?',
      'Automatic search on Open Library',
      'Sylloge will search each title on Open Library and keep the closest match.',
      'Only editorial fields are updated (image, synopsis, year, creator): statuses, ratings, favourites and reviews stay exactly as they are.',
      'Images come from the official provider: same format, same look across the whole library.',
      'An entry without a confident match stays unchanged.',
      'No', 'Yes, start',
    ]) assert.ok(html.includes(copy), `Copie anglaise absente : ${copy}`)
  })

  await test('Les phases de progression et de bilan gardent leurs accords et leurs valeurs', () => {
    core.setLanguage('en')
    assert.equal(core.t('Association en cours…'), 'Linking in progress…')
    assert.equal(core.t('Progression de l’association'), 'Linking progress')
    assert.equal(core.t('Arrêter'), 'Stop')
    assert.equal(core.t('Association terminée'), 'Linking complete')
    assert.equal(core.t('sur {total} fiche traitée.', { total: '1' }), 'of 1 entry processed.')
    assert.equal(core.t('sur {total} fiches traitées.', { total: '4' }), 'of 4 entries processed.')
    assert.equal(core.t('{count} fiche associée', { count: '1' }), '1 entry linked')
    assert.equal(core.t('{count} fiches associées', { count: '3' }), '3 entries linked')
    assert.equal(core.t('{count} fiche enrichie', { count: '1' }), '1 entry enriched')
    assert.equal(core.t('{count} fiches enrichies', { count: '3' }), '3 entries enriched')
    assert.equal(core.t('{count} sans correspondance assez sûre', { count: '2' }), '2 without a confident match')
    assert.equal(core.t('{count} sans correspondance assez sûre — inchangée', { count: '1' }), '1 without a confident match — unchanged')
    assert.equal(core.t('{count} sans correspondance assez sûre — inchangées', { count: '2' }), '2 without a confident match — unchanged')
    assert.equal(core.t('Opération arrêtée avant la fin — relance « {action} » pour continuer.', { action: 'Link all' }), 'Stopped before the end — run “Link all” again to continue.')
    core.setLanguage('fr')
    assert.equal(core.t('sur {total} fiche traitée.', { total: '1' }), 'sur 1 fiche traitée.')
  })

  await test('Une fiche ouverte hors bibliothèque affiche ses états en anglais', () => {
    core.setLanguage('en')
    const html = render(main.SqliteFilmDetail, {
      profileId: 'qa-memory', filmId: 'qa-film', detailRevision: '', onBack: noop,
      backLabel: 'Back to films', onEdit: noop, onDelete: async () => {}, onAssociateTmdb: noop,
    })
    for (const copy of ['Local entry', 'Loading film', 'Reading the entry saved in SQLite.', 'aria-label="Back to films"']) {
      assert.ok(html.includes(copy), `État anglais absent : ${copy}`)
    }
    assert.equal(main.bookBackLabel('home'), 'Back to home')
    assert.equal(main.bookBackLabel('mangas'), 'Back to manga')
    assert.equal(main.bookBackLabel('books'), 'Back to books')
    assert.equal(main.seriesBackLabel('home'), 'Back to home')
    assert.equal(main.seriesBackLabel('anime'), 'Back to anime')
    assert.equal(main.seriesBackLabel('series'), 'Back to series')
    core.setLanguage('fr')
    assert.equal(main.seriesBackLabel('anime'), 'Retour à l’animation japonaise')
  })
} finally {
  await server.close()
  rmSync(cacheDir, { recursive: true, force: true })
}
