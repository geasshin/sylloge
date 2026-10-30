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

// Middleware-only SSR: no listener, .env, personal database or provider requests.
const cacheDir = mkdtempSync(join(tmpdir(), 'sylloge-i18n-entries-'))
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, envFile: false,
  cacheDir, plugins: [{
    name: 'i18n-entries-detail-without-dom-bootstrap', enforce: 'pre',
    transform(code, id) {
      // Les fiches détail importent le glyphe `icon` du module racine : on coupe
      // uniquement son bootstrap DOM, qui n'a pas de sens en SSR.
      if (id.split('?')[0].endsWith('/src/main.tsx')) {
        const bootstrap = code.lastIndexOf('const rootElement =')
        assert.ok(bootstrap > 0, 'Le bootstrap DOM de main.tsx doit rester identifiable')
        return code.slice(0, bootstrap)
      }
    },
  }, react()], logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
})

// Les dialogues passent par useDialogFocus, qui lit document.activeElement au
// rendu : doubles minimaux, aucun effet (donc aucune écoute) ne s'exécute en SSR.
const previousDocument = globalThis.document
const previousHTMLElement = globalThis.HTMLElement
globalThis.HTMLElement = class HTMLElement {}
globalThis.document = { activeElement: null, documentElement: { lang: '' }, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} }
let core = null
try {
  core = await server.ssrLoadModule('/src/i18n/core.ts')
  const { setLanguage } = core
  setLanguage('en')
  const { FilmForm } = await server.ssrLoadModule('/src/components/FilmForm.tsx')
  await test('Le vrai formulaire Film affiche ses champs et actions en anglais', () => {
    const html = renderToStaticMarkup(createElement(FilmForm, { onSave: async () => {}, onCancel() {} }))
    assert.ok(html.includes('aria-label="Film title"'), 'Le champ titre doit être nommé en anglais')
    assert.ok(html.includes('Add a film'), 'Le titre du formulaire doit être traduit')
    assert.ok(html.includes('Cancel'), 'L’action annuler doit être traduite')
    assert.ok(!html.includes('Titre du film'), 'Le libellé français ne doit pas rester visible')
  })
  await test('Les contrôles partagés et les citations traduisent seulement leur interface', async () => {
    const { StatusSegmented, StarRating, FavoriteHeart } = await server.ssrLoadModule('/src/components/VerdictControls.tsx')
    const { QuotesEditor, QuotesSection } = await server.ssrLoadModule('/src/components/Quotes.tsx')
    const { Poster } = await server.ssrLoadModule('/src/components/Poster.tsx')
    const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
    const segmented = render(StatusSegmented, { statuses: ['en cours'], labels: { 'en cours': 'En cours' }, value: 'en cours', onChange() {} })
    assert.ok(segmented.includes('aria-label="Status"'), 'Nom accessible du groupe traduit')
    assert.ok(segmented.includes('In progress'), 'Le libellé contrôlé du statut est traduit')
    assert.ok(segmented.includes('aria-checked="true"'), 'La valeur métier française reste sélectionnée')
    const rating = render(StarRating, { value: 3.5, onChange() {} })
    assert.ok(rating.includes('aria-valuetext="3.5 out of 5"'), 'Note accessible localisée')
    assert.ok(rating.includes('3.5/5'), 'Nombre décimal localisé')
    assert.ok(render(FavoriteHeart, { checked: false, onChange() {} }).includes('aria-label="Favourite"'))
    const editor = render(QuotesEditor, { values: ['En cours'], onChange() {} })
    assert.ok(editor.includes('Add a quote'))
    assert.ok(editor.includes('aria-label="Move quote 1 up"'))
    assert.ok(editor.includes('>En cours</textarea>'), 'Le passage libre identique à une clé reste inchangé')
    const section = render(QuotesSection, { quotes: [{ id: 'q', body: 'En cours' }], onEdit() {} })
    assert.ok(section.includes('1 personal quote'))
    assert.ok(section.includes('<blockquote>En cours</blockquote>'))
    assert.ok(render(QuotesSection, { quotes: [], onEdit() {} }).includes('No quotes'))
    for (const [label, name] of [['Affiche', 'poster'], ['Couverture', 'cover'], ['Visuel', 'image']]) {
      const poster = render(Poster, { title: 'En cours', src: null, label, onEdit() {} })
      assert.ok(poster.includes(`No ${name}`), `État vide ${label} traduit`)
      assert.ok(poster.includes(`aria-label="Edit ${name} for “En cours”"`), `Action ${label} traduite avec titre intact`)
    }
  })
  await test('Les formulaires Livre, Manga, Série, Anime, Jeu et Art traduisent leurs labels sans traduire les saisies', async () => {
    const render = (Component, props) => renderToStaticMarkup(createElement(Component, { onSave: async () => {}, onCancel() {}, ...props }))
    const { BookForm } = await server.ssrLoadModule('/src/components/BookForm.tsx')
    const { SeriesForm } = await server.ssrLoadModule('/src/components/SeriesForm.tsx')
    const { GameForm } = await server.ssrLoadModule('/src/components/GameForm.tsx')
    const { ArtworkForm } = await server.ssrLoadModule('/src/components/ArtworkForm.tsx')
    const { EMPTY_BOOK_FORM } = await server.ssrLoadModule('/src/domain/bookForm.ts')
    const { EMPTY_SERIES_FORM } = await server.ssrLoadModule('/src/domain/seriesForm.ts')
    const { EMPTY_GAME_FORM } = await server.ssrLoadModule('/src/domain/gameForm.ts')
    for (const category of ['livre', 'manga']) {
      const values = { ...EMPTY_BOOK_FORM, category, status: 'en cours', title: 'En cours', author: 'En cours', summary: 'En cours', personalNote: 'En cours', quotes: ['En cours'], volumesRead: '1', volumesTotal: '3' }
      const before = structuredClone(values)
      const html = render(BookForm, { initialValues: values, creationCategory: category })
      assert.ok(html.includes(`aria-label="${category === 'livre' ? 'Book' : 'Manga'} title"`), category)
      assert.ok(html.includes('Volumes read') && html.includes('Total volumes'), 'Libellés des compteurs traduits')
      assert.ok(html.includes('>En cours</textarea>'), 'Avis, résumé et citations libres restent français')
      assert.ok(html.includes('value="En cours"'), 'Titre et auteur restent inchangés')
      assert.deepEqual(values, before)
    }
    for (const category of ['série télé', 'animation']) {
      const values = { ...EMPTY_SERIES_FORM, category, status: 'en cours', title: 'En cours', summary: 'En cours', personalNote: 'En cours', showrunner: 'En cours' }
      const html = render(SeriesForm, { initialValues: values, creationCategory: category })
      assert.ok(html.includes(`aria-label="${category === 'animation' ? 'Anime' : 'Series'} title"`), category)
      assert.ok(html.includes('Seasons watched') && html.includes('Total seasons'))
      assert.ok(html.includes('>En cours</textarea>'))
    }
    // Modification d'une fiche : le choix de bibliothèque Séries / Animation
    // japonaise est traduit, avec sa phrase d'aide.
    const editedSeries = {
      id: 'series-i18n', profileId: 'synthetic', title: 'En cours', showrunner: null, casting: null,
      summary: null, category: 'série télé', status: 'en cours', rating: null, isFavorite: false,
      seasonsSeen: 1, seasonsTotal: 2, progressUpdatedAt: null, startedAt: null, posterUrl: null,
      personalNote: null, createdAt: '2026-10-03', updatedAt: '2026-10-03',
    }
    const libraryChoice = render(SeriesForm, { series: editedSeries })
    assert.ok(libraryChoice.includes('aria-label="Entry library"'), 'Le groupe du choix de bibliothèque est nommé en anglais')
    assert.ok(libraryChoice.includes('>Series<') && libraryChoice.includes('>Anime<'), 'Les deux bibliothèques sont traduites')
    assert.ok(libraryChoice.includes('Anime: animated series produced in Japan.'), 'La phrase d’aide est traduite')
    assert.ok(!libraryChoice.includes('>Bibliothèque<'), 'Le libellé français du choix ne reste pas visible')
    const game = render(GameForm, { platformSuggestions: ['En cours'], initialValues: { ...EMPTY_GAME_FORM, title: 'En cours', platform: 'En cours', status: 'joué', personalNote: 'En cours' } })
    assert.ok(game.includes('aria-label="Game title"') && game.includes('Studio or developer'))
    assert.ok(game.includes('value="En cours"') && game.includes('>En cours</textarea>'))
    const artwork = { id: 'art', profileId: 'synthetic', title: 'En cours', artist: 'En cours', year: 2026, form: 'peinture', location: 'En cours', exhibition: 'En cours', status: 'découverte', isFavorite: false, discoveredAt: '2026-10-03', imageUrl: null, personalNote: 'En cours', customFields: [{ name: 'En cours', value: 'En cours' }], details: { technique: 'En cours' }, createdAt: '2026-10-03', updatedAt: '2026-10-03' }
    const art = render(ArtworkForm, { artwork })
    assert.ok(art.includes('Date discovered') && art.includes('Custom field 1 name'))
    // Liste déroulante Sylloge (27 octobre 2026) : la forme choisie s’affiche traduite, ses champs propres aussi.
    assert.ok(art.includes('aria-haspopup="listbox"') && art.includes('>Painting<'), 'Option traduite dans le bouton de la liste')
    assert.ok(art.includes('>Technique<') && art.includes('>Dimensions<') && art.includes('>Movement<'), 'Champs propres à la peinture traduits')
    assert.ok(art.includes('placeholder="Oil on canvas"'), 'Exemple de saisie traduit')
    assert.ok(art.includes('value="En cours"') && art.includes('>En cours</textarea>'))
  })
  await test('Les huit formulaires personnalisés traduisent les modèles et gardent les options et champs libres stockés', async () => {
    const { CustomEntryForm } = await server.ssrLoadModule('/src/components/CustomEntryForm.tsx')
    const { CUSTOM_LIBRARY_TEMPLATES } = await server.ssrLoadModule('/src/domain/customLibraries.ts')
    const labels = { comics: 'Script', magazines: 'Publisher or editorial team', audiobooks: 'Author', music: 'Artist', podcasts: 'Host', documentaries: 'Director', shows: 'Author, company or artist', board_games: 'Designers' }
    for (const [libraryId, expectedCreator] of Object.entries(labels)) {
      const entry = { id: 'synthetic', profileId: 'synthetic', title: 'En cours', creator: 'En cours', year: 2026, status: 'terminé', rating: 3.5, isFavorite: true, progressCurrent: 1, progressTotal: 3, finishedAt: '2026-10-03', coverUrl: null, summary: 'En cours', personalNote: 'En cours', details: {}, quotes: [], createdAt: '2026-10-03', updatedAt: '2026-10-03' }
      for (const field of CUSTOM_LIBRARY_TEMPLATES[libraryId].fields) entry.details[field.key] = field.kind === 'select' ? field.options[0] : 'En cours'
      if (libraryId === 'music') entry.details.format = 'Bande originale'
      if (libraryId === 'comics') entry.quotes = [{ id: 'quote', entryId: entry.id, body: 'En cours', position: 0, createdAt: '2026-10-03' }]
      const before = structuredClone(entry)
      const html = renderToStaticMarkup(createElement(CustomEntryForm, { libraryId, entry, onCancel() {}, onSave: async () => {} }))
      assert.ok(html.includes(expectedCreator), `${libraryId}: nom du champ créateur traduit`)
      assert.ok(html.includes('aria-label="Title"') && html.includes('Save changes'), libraryId)
      assert.ok(html.includes('>En cours</textarea>') && html.includes('value="En cours"'), `${libraryId}: texte libre intact`)
      if (libraryId === 'music') assert.ok(html.includes('Soundtrack'), 'Label du format traduit')
      assert.deepEqual(entry, before, `${libraryId}: valeurs métier inchangées`)
      const custom = { ...entry, details: { ...entry.details, [CUSTOM_LIBRARY_TEMPLATES[libraryId].kindField ?? 'genre']: 'En cours' } }
      const customHtml = renderToStaticMarkup(createElement(CustomEntryForm, { libraryId, entry: custom, onCancel() {}, onSave: async () => {} }))
      assert.ok(customHtml.includes('En cours'), 'Valeur importée inconnue préservée, même identique à une clé UI')
    }
  })
  await test('Les cinq fiches détail traduisent le gabarit, les libellés et les dates sans toucher aux données', async () => {
    const { FilmDetail } = await server.ssrLoadModule('/src/components/FilmDetail.tsx')
    const { SeriesDetail } = await server.ssrLoadModule('/src/components/SeriesDetail.tsx')
    const { BookDetail } = await server.ssrLoadModule('/src/components/BookDetail.tsx')
    const { GameDetail } = await server.ssrLoadModule('/src/components/GameDetail.tsx')
    const { ArtworkDetail } = await server.ssrLoadModule('/src/components/ArtworkDetail.tsx')
    const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
    const base = { onBack() {}, backLabel: 'Retour', onEdit() {}, onDelete: async () => {} }
    const stamp = { createdAt: '2026-10-03', updatedAt: '2026-10-03' }

    const film = { ...stamp, id: 'qa-film', profileId: 'qa', title: 'En cours', director: 'Réalisation', year: 2024, originalTitle: null, casting: null, summary: 'Résumé français', status: 'terminé', rating: 4.5, isFavorite: true, watchedAt: '2026-10-08', posterUrl: null, personalNote: null }
    const filmHtml = render(FilmDetail, { film, ...base })
    for (const copy of ['title="Edit entry"', '>Edit<', '>Director<', '>Release<', 'aria-label="4.5 out of 5"', '>4.5/5<', 'Watched on', '8 October 2026', 'Your review will appear here after watching.', 'Poster unavailable for En cours']) {
      assert.ok(filmHtml.includes(copy), `Film: ${copy}`)
    }
    assert.ok(filmHtml.includes('<h1 class="display-title">En cours</h1>'), 'Titre personnel intact')
    assert.ok(filmHtml.includes('<dd>Réalisation</dd>'), 'Le réalisateur saisi reste intact')

    const series = { ...stamp, id: 'qa-series', profileId: 'qa', title: 'En cours', showrunner: 'Auteur français', casting: null, summary: null, category: 'série télé', status: 'en cours', rating: null, isFavorite: false, seasonsSeen: 2, seasonsTotal: 4, startedAt: '2026-10-03', posterUrl: null, personalNote: 'Avis personnel' }
    const seriesHtml = render(SeriesDetail, { series, ...base })
    for (const copy of ['>TV series<', '2 of 4 seasons', 'Watching started', '3 October 2026', '>Progress<', 'title="Edit entry"', 'Avis personnel']) {
      assert.ok(seriesHtml.includes(copy), `Série: ${copy}`)
    }
    const anime = render(SeriesDetail, { series: { ...series, category: 'animation', seasonsSeen: 1 }, ...base })
    assert.ok(anime.includes('>Anime<'), 'La catégorie animation se lit Anime')
    assert.ok(anime.includes('1 of 4 seasons'), 'Pluriel singulier explicite')

    const book = { ...stamp, id: 'qa-book', profileId: 'qa', title: 'En cours', author: 'En cours', year: 2024, category: 'manga', status: 'lu', rating: null, isFavorite: false, volumesRead: 2, volumesTotal: 3, startedAt: '2026-10-03', coverUrl: null, summary: null, personalNote: null, quotes: [] }
    const bookHtml = render(BookDetail, { book, ...base })
    for (const copy of ['>Manga<', '2 of 3 volumes', '3 October 2026', '>Author<', '>Publication<', '>Progress<', '>Reading started<', 'No cover', 'No quotes']) {
      assert.ok(bookHtml.includes(copy), `Livre: ${copy}`)
    }

    const game = { ...stamp, id: 'qa-game', profileId: 'qa', title: 'En cours', developer: 'En cours', year: 2024, platform: 'En cours', status: 'joué', rating: null, isFavorite: false, playedAt: '2026-10-03', coverUrl: null, personalNote: 'Avis personnel' }
    const gameHtml = render(GameDetail, { game, ...base })
    for (const copy of ['>Developer<', '>Platform<', '>Release<', '>Played on<', '3 October 2026', 'Avis personnel']) {
      assert.ok(gameHtml.includes(copy), `Jeu: ${copy}`)
    }

    const artwork = { ...stamp, id: 'qa-art', profileId: 'qa', title: 'En cours', artist: 'En cours', year: 2024, form: 'peinture', location: 'En cours', exhibition: 'En cours', status: 'découverte', isFavorite: false, discoveredAt: '2026-10-03', imageUrl: null, personalNote: null, customFields: [{ name: 'Champ français', value: 'Coups de cœur' }], details: { technique: 'En cours' } }
    const artHtml = render(ArtworkDetail, { artwork, ...base })
    for (const copy of ['>Painting<', 'En cours · 2024', '>Location<', '>Exhibition<', '>Date discovered<', 'No image', 'Champ français', 'Coups de cœur', '>Technique<', '>En cours<']) {
      assert.ok(artHtml.includes(copy), `Art: ${copy}`)
    }
  })
  await test('La galerie d’affiches TMDB et le dialogue d’URL traduisent leurs libellés', async () => {
    const { TmdbPosterDialog } = await server.ssrLoadModule('/src/components/TmdbPosterDialog.tsx')
    const { PosterUrlDialog } = await server.ssrLoadModule('/src/components/PosterUrlDialog.tsx')
    const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
    const gallery = render(TmdbPosterDialog, { title: 'En cours', posters: ['https://example.test/affiche.jpg'], selectedUrl: null, saving: false, onSelect() {}, onClose() {} })
    for (const copy of ['>Choose a poster<', 'aria-label="Available posters"', 'aria-label="Add a poster from a URL"', '>Add<', 'aria-label="Poster currently selected"', 'Posters provided by', '>Apply<', 'aria-label="Close"']) {
      assert.ok(gallery.includes(copy), `Galerie: ${copy}`)
    }
    const dialog = render(PosterUrlDialog, { open: true, title: 'En cours', label: 'Couverture', currentUrl: null, onClose() {}, onSave() {} })
    for (const copy of ['Edit cover', 'Paste the address of an image for “En cours”.', 'Image address', 'Leave blank to restore the default cover.', '>Save<']) {
      assert.ok(dialog.includes(copy), `Dialogue: ${copy}`)
    }
    assert.ok(dialog.includes('placeholder="https://…"'), 'L’exemple d’URL reste un glyphe')
  })
} finally {
  core?.setLanguage('fr')
  globalThis.document = previousDocument
  globalThis.HTMLElement = previousHTMLElement
  await server.close()
  rmSync(cacheDir, { recursive: true, force: true })
}
