import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

// In-memory SSR only: no shared listener, .env file, native command or personal data.
const scratch = process.env.TMPDIR ?? tmpdir()
assert.ok(scratch, 'An isolated scratch directory must be supplied through TMPDIR')
const cacheDir = await mkdtemp(resolve(scratch, 'sylloge-i18n-transfers-'))
const server = await createServer({
  configFile: false,
  envFile: false,
  root: resolve(import.meta.dirname, '..'),
  cacheDir,
  plugins: [react(), {
    // Expose the existing private rendering boundaries only in this SSR test
    // module. No hook, parser, record or callback implementation is replaced.
    name: 'transfer-ssr-test-exports',
    enforce: 'pre',
    transform(source, id) {
      const exports = {
        'CollectionCsvImportFlow.tsx': ['CollectionCsvPreviewPanel'],
        'FilmCsvImportFlow.tsx': ['FilmCsvImportPreviewPanel', 'SourceToDestinationMapping', 'IMPORT_STEPS', 'SOURCE_KIND_LABELS', 'PREVIEW_SOURCE_LABELS'],
        'LibraryExportFlow.tsx': ['MEDIUM_LABELS', 'MEDIUM_NOUNS'],
        'LibraryImportButton.tsx': ['JsonImportPreview', 'ContainerSourcePanel', 'ImportConfirmPanel', 'ImportDonePanel', 'ImportErrorAlert', 'LIBRARY_PLURALS', 'IMPORT_RESULT_WORDS', 'EMPTY_FIELD_LABELS'],
        'ThirdPartyImportReview.tsx': ['FIELD_LABELS'],
      }[id.split('/').at(-1)]
      return exports ? `${source}\nexport { ${exports.join(', ')} }` : null
    },
  }],
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
})

try {
  const { ImportSourceChooser } = await server.ssrLoadModule('/src/components/ImportSourceChooser.tsx')
  const { setLanguage, t } = await server.ssrLoadModule('/src/i18n/core.ts')
  setLanguage('en')

  await test('Le choix de source et son aide Sylloge sont rendus en anglais', () => {
    const html = renderToStaticMarkup(createElement(ImportSourceChooser, {
      library: 'films', busy: false, onPick() {},
    }))
    assert.match(html, /Where is the file from\?/)
    assert.match(html, /aria-label="File source"/)
    assert.match(html, /Choose a file/)
    assert.match(html, /only the section for the open library will be imported here/)
    assert.doesNotMatch(html, /D’où vient le fichier|Choisir un fichier/)
  })

  await test('Fusion et résolution des doublons traduisent les actions et pluriels, jamais les titres ni avis', async () => {
    const { ImportModeChoice, DuplicatesResolver, filmSummary, bookSummary } = await server.ssrLoadModule('/src/components/CollectionImportFlow.tsx')
    for (const count of [0, 1, 2]) {
      const mode = renderToStaticMarkup(createElement(ImportModeChoice, {
        mediumLabel: 'film', mediumPluralLabel: 'films', mediumGender: 'masculine',
        importedCount: count, existingCount: 3, onChoose() {}, onCancel() {},
      }))
      assert.match(mode, new RegExp(`${count} film${count === 1 ? '' : 's'} detected in the file`))
      assert.match(mode, /Merge/)
      assert.match(mode, /Replace/)
      assert.match(mode, /No data is written at this step/)
    }
    const film = Object.freeze({ title: 'Choisir un fichier', director: 'Réalisateur FR', year: 2026, status: 'terminé', rating: 4.5, isFavorite: true, personalNote: 'Importer une bibliothèque' })
    const duplicates = [{ normalizedTitle: 'choisir un fichier', existing: film, imported: film }]
    const html = renderToStaticMarkup(createElement(DuplicatesResolver, {
      duplicates, resolutions: new Map(), onResolve() {}, onConfirm() {}, onBack() {}, renderSummary: filmSummary,
    }))
    assert.match(html, /1 suggested match by normalised title/)
    assert.match(html, /aria-label="Choose which entry to keep for Choisir un fichier"/)
    assert.match(html, /Keep both entries/)
    assert.match(html, /placeholder="Search for a title"/)
    assert.match(html, /Choisir un fichier/)
    assert.match(html, /Importer une bibliothèque/)
    assert.match(html, /Réalisateur FR/)
    assert.match(html, /Completed/)
    assert.match(html, /Rating: 4.5\/5 · favourite/)
    assert.equal(film.status, 'terminé')
    for (const count of [1, 2]) {
      const book = { title: 'Titre à conserver', author: 'Auteur', year: null, status: 'lu', rating: null, quotes: Array.from({ length: count }, () => ({ text: 'Texte libre' })), volumesRead: 1, volumesTotal: 2 }
      const summary = renderToStaticMarkup(bookSummary(book, 'imported'))
      assert.match(summary, new RegExp(`${count} quote${count === 1 ? '' : 's'}`))
      assert.match(summary, /1\/2 volumes/)
    }
  })

  await test('Les CSV des six collections traduisent les champs Sylloge sans traduire les colonnes du fichier', async () => {
    const { CollectionCsvImportFlow, CollectionCsvPreviewPanel } = await server.ssrLoadModule('/src/components/CollectionCsvImportFlow.tsx')
    for (const kind of ['series', 'anime', 'books', 'mangas', 'games', 'artworks']) {
      const html = renderToStaticMarkup(createElement(CollectionCsvImportFlow, {
        kind, contents: 'Titre,Note,Colonne libre\nTitre français,4,Texte libre', onReady() {}, onChooseAnother() {},
      }))
      assert.match(html, /aria-label="CSV import steps"/)
      assert.match(html, /Match the columns/)
      assert.match(html, /<b>Title<\/b>/)
      // Liste déroulante Sylloge (27 octobre 2026) : fermée, elle ne montre que
      // la colonne choisie, telle qu’écrite dans le fichier.
      assert.match(html, /data-value="Titre"><span class="select-value">Titre<\/span>/)
      assert.match(html, /Do not import/)
      if (kind === 'series' || kind === 'anime') assert.match(html, /<b>Viewing start date<\/b>/)
      if (kind === 'books' || kind === 'mangas') assert.match(html, /<b>Reading start date<\/b>/)
      assert.doesNotMatch(html, /Début de (visionnage|lecture)/)
    }
    for (const count of [1, 2]) {
      const items = Array.from({ length: count }, (_, id) => ({ title: `Titre ${id}` }))
      const html = renderToStaticMarkup(createElement(CollectionCsvPreviewPanel, {
        mediumLabel: 'Livres',
        preview: { items, errors: [], ignoredColumns: ['Colonne libre'], totalItemCount: count, validItemCount: count, sourceKind: 'csv' },
        onBack() {}, onContinue() {},
      }))
      assert.match(html, /Books import/)
      assert.match(html, new RegExp(`${count} entr${count === 1 ? 'y' : 'ies'} ready`))
      assert.match(html, /Colonne libre/)
      assert.match(html, /No data has been written yet/)
    }
  })

  await test('Les six guides tiers ont tous leurs formats, étapes et limites traduits sans altérer les sources', async () => {
    const { IMPORT_GUIDES } = await server.ssrLoadModule('/src/domain/importGuides.ts')
    const before = JSON.stringify(IMPORT_GUIDES)
    for (const guide of IMPORT_GUIDES) {
      for (const source of [guide.format, ...guide.steps, guide.preserved, guide.limitations]) {
        assert.notEqual(t(source), source, `Traduction manquante : ${guide.id} · ${source}`)
      }
    }
    assert.match(t(IMPORT_GUIDES.find(guide => guide.id === 'myanimelist').limitations), /not.*directly importable/)
    assert.equal(JSON.stringify(IMPORT_GUIDES), before)
  })

  await test('Le parcours CSV des films traduit son interface et garde les colonnes du fichier', async () => {
    const { FilmCsvImportFlow, SourceToDestinationMapping } = await server.ssrLoadModule('/src/components/FilmCsvImportFlow.tsx')
    const source = {
      name: 'letterboxd.csv',
      kind: 'csv',
      csvCandidates: [{ id: 'c1', name: 'letterboxd.csv', contents: 'Titre,Réalisateur,Note\nFilm français,Réalisateur FR,4' }],
      markdownPages: [],
    }
    const flow = renderToStaticMarkup(createElement(FilmCsvImportFlow, {
      source, currentProfileName: 'Profil FR', onReady() {}, onChooseAnother() {},
    }))
    assert.match(flow, /aria-label="CSV or ZIP import steps"/)
    assert.match(flow, /Detected source/)
    assert.match(flow, /<dt>File<\/dt>/)
    assert.match(flow, /<dt>Table<\/dt>/)
    assert.match(flow, /Check the columns/)
    assert.doesNotMatch(flow, /Source détectée|Choisir un autre fichier|Vérifier les colonnes/)

    const mapping = renderToStaticMarkup(createElement(SourceToDestinationMapping, {
      source,
      session: { kind: 'generic', headers: ['Titre', 'Réalisateur', 'Note'] },
      configuration: {
        profileName: 'Profil FR',
        mapping: { title: 'Titre', status: null, rating: 'Note', watchedAt: null, personalNote: null, isFavorite: null },
        markdownNotes: false,
        ratingScale: null,
      },
      preview: { detectedRatingScale: 'none' },
      onConfigurationChange() {},
    }))
    assert.match(mapping, /aria-label="Source-to-Sylloge mapping"/)
    assert.match(mapping, /Detected in your file/)
    assert.match(mapping, /Import into Sylloge/)
    assert.match(mapping, /Metadata retrieved later, not imported/)
    assert.match(mapping, /Column of the selected table/)
    assert.match(mapping, /Sylloge destination for Titre/)
    assert.match(mapping, /data-value="title"><span class="select-value">Title<\/span>/)
    assert.match(mapping, /Do not import/)
    assert.match(mapping, /Réalisateur/)
    assert.doesNotMatch(mapping, /Ne pas importer|Destination Sylloge de|Détecté dans votre fichier/)
  })

  await test('Les aperçus d’import films affichent les rapports du domaine déjà interpolés', async () => {
    const { FilmCsvImportPreviewPanel } = await server.ssrLoadModule('/src/components/FilmCsvImportFlow.tsx')
    const blocked = renderToStaticMarkup(createElement(FilmCsvImportPreviewPanel, {
      preview: {
        sourceKind: 'csv', sourceLabel: 'letterboxd.csv',
        document: { films: [{ title: 'Remplacer' }] },
        errors: [{ path: 'Ligne 12', message: 'Le titre est obligatoire.' }],
        warnings: [{ path: 'Ligne 9', message: 'Le titre est obligatoire.' }],
        ignoredColumns: ['Colonne libre'], mapping: [], totalFilmCount: 12, validFilmCount: 0,
        detectedRatingScale: 'none',
      },
      onBack() {}, onContinue() {},
    }))
    assert.match(blocked, /Films import/)
    assert.match(blocked, /Films library CSV/)
    assert.match(blocked, /<dt>Rows read<\/dt><dd>12<\/dd>/)
    assert.match(blocked, /<dt>Convertible<\/dt><dd>0<\/dd>/)
    assert.match(blocked, /<dt>Errors<\/dt><dd>1<\/dd>/)
    assert.match(blocked, /Import blocked/)
    assert.match(blocked, /Unmatched items/)
    assert.match(blocked, /Visible but ignored columns:/)
    assert.match(blocked, /Colonne libre/)
    assert.match(blocked, /No invented data will replace them\./)
    assert.match(blocked, /Line 9/)
    assert.match(blocked, /Line 12/)
    assert.match(blocked, /A title is required\./)
    assert.match(blocked, /No data has been written\. Correct the column matches or the file before trying again\./)
    assert.doesNotMatch(blocked, /Ligne 12|Aucune donnée|Import bloqué|Éléments non associés/)

    for (const count of [1, 2]) {
      const valid = renderToStaticMarkup(createElement(FilmCsvImportPreviewPanel, {
        preview: {
          sourceKind: 'sylloge-csv-v1', sourceLabel: 'films.csv',
          document: { films: Array.from({ length: count }, (_, index) => ({ title: `Titre ${index}` })) },
          errors: [], warnings: [], ignoredColumns: [], mapping: [], totalFilmCount: count, validFilmCount: count,
          detectedRatingScale: 5,
        },
        onBack() {}, onContinue() {},
      }))
      assert.match(valid, /Valide|Valid/)
      assert.match(valid, /Sylloge Films CSV library/)
      assert.match(valid, new RegExp(`${count} films? (is|are) ready to be compared with the current profile’s collection`))
      assert.doesNotMatch(valid, /aucune donnée|Aucune donnée/)
    }
  })

  await test('Le service tiers traduit ses rapports sans toucher titres, avis ni colonnes', async () => {
    const { ThirdPartyImportReview } = await server.ssrLoadModule('/src/components/ThirdPartyImportReview.tsx')
    const items = [
      { title: 'Remplacer', status: 'terminé', rating: null, personalNote: 'Mon avis à moi' },
      ...Array.from({ length: 5 }, (_, index) => ({ title: `Titre ${index}`, status: 'en cours', rating: 4.5, personalNote: null })),
    ]
    const basePreview = {
      service: 'letterboxd', variant: 'ambiguous', library: 'films', label: 'Letterboxd',
      mapping: [{ field: 'rating', column: 'Ma colonne de notes' }],
      duplicateTitles: [], items,
      ignoredColumns: ['Colonne exclue'], totalItemCount: 6, validItemCount: 5,
      sourceRowCount: 6, sourceFiles: [{ name: 'watched.csv', variant: 'watched', rowCount: 6 }],
    }
    const blocked = renderToStaticMarkup(createElement(ThirdPartyImportReview, {
      fileName: 'letterboxd-watched.csv',
      needsListChoice: true,
      preview: {
        ...basePreview,
        errors: [{ path: 'Ligne 4', message: 'Le titre est obligatoire.' }],
        warnings: [],
      },
      onListChoice() {}, onContinue() {}, onChooseAnother() {},
    }))
    assert.match(blocked, /Letterboxd recognised/)
    assert.match(blocked, /aria-label="Letterboxd list type"/)
    assert.match(blocked, /This file was renamed: which list is it\?/)
    assert.match(blocked, /Watched films/)
    assert.match(blocked, /Watchlist/)
    assert.match(blocked, /Target library/)
    assert.match(blocked, /Entries prepared/)
    assert.match(blocked, /5 of 6/)
    assert.match(blocked, /6 rows in 1 files/)
    assert.match(blocked, /Import blocked\. No data has been written\./)
    assert.match(blocked, /Line 4/)
    assert.match(blocked, /A title is required\./)
    assert.match(blocked, /Column matches · 1/)
    assert.match(blocked, /Ma colonne de notes/)
    assert.match(blocked, /Rating out of 5/)
    assert.match(blocked, /Excluded columns:/)
    assert.match(blocked, /Colonne exclue/)
    assert.match(blocked, /The original file stays unchanged/)
    assert.doesNotMatch(blocked, /reconnu|Import bloqué|aucune dans les tables|sans note|Sample of prepared entries/)
    assert.doesNotMatch(blocked, /Ligne 4/)

    const ready = renderToStaticMarkup(createElement(ThirdPartyImportReview, {
      fileName: 'letterboxd-watched.csv',
      needsListChoice: false,
      preview: {
        ...basePreview,
        errors: [],
        warnings: [{ path: 'Ligne 5', message: 'Le titre est obligatoire.' }],
      },
      onListChoice() {}, onContinue() {}, onChooseAnother() {},
    }))
    assert.match(ready, /Points to check · 1/)
    assert.match(ready, /Line 5/)
    assert.match(ready, /Sample of prepared entries/)
    assert.match(ready, /Remplacer/)
    assert.match(ready, /Mon avis à moi/)
    assert.match(ready, /Completed/)
    assert.match(ready, /unrated/)
    assert.match(ready, /Sample limited to the first five entries out of 6\./)
    assert.match(ready, /<b>Titre 0<\/b><span>In progress/)
    assert.doesNotMatch(ready, /Import blocked|terminé|en cours|sans note/)
    assert.equal(items[0].status, 'terminé')
    assert.equal(items[0].personalNote, 'Mon avis à moi')

    const noColumns = renderToStaticMarkup(createElement(ThirdPartyImportReview, {
      fileName: 'goodreads_library_export.csv',
      needsListChoice: false,
      preview: {
        service: 'goodreads', variant: 'library', library: 'books', label: 'Goodreads',
        mapping: [], duplicateTitles: [], items: null, errors: [], warnings: [], ignoredColumns: [],
        totalItemCount: 0, validItemCount: 0,
      },
      onListChoice() {}, onContinue() {}, onChooseAnother() {},
    }))
    assert.match(noColumns, /Goodreads recognised/)
    assert.match(noColumns, /none in the recognised tables\./)
    assert.match(noColumns, /Books/)
    assert.doesNotMatch(noColumns, /Letterboxd list type|Sample of prepared entries/)
  })

  await test('L’export garde noms et contenus identiques quelle que soit la langue', async () => {
    const { planLibraryExport, exportMessageText, ExportDialogContent } = await server.ssrLoadModule('/src/components/LibraryExportFlow.tsx')
    const { createCollectionCsvExport } = await server.ssrLoadModule('/src/domain/collectionCsvTransfer.ts')
    const { createLibraryDocument, serializeLibraryDocument } = await server.ssrLoadModule('/src/domain/libraryDocument.ts')
    const fixedAt = '2026-10-23T10:00:00.000Z'
    const loaded = {
      profile: { id: 'profil-1', name: 'Profil FR', createdAt: fixedAt, updatedAt: fixedAt },
      films: [{
        id: 'f1', profileId: 'profil-1', title: 'Remplacer', originalTitle: null, director: null, year: null,
        status: 'terminé', rating: 4.5, isFavorite: true, personalNote: 'Avis personnel FR', posterUrl: null,
        summary: null, providerName: null, providerId: null, createdAt: fixedAt, updatedAt: fixedAt,
      }],
      series: [], anime: [], books: [], mangas: [], games: [], artworks: [], customLibraries: [],
    }
    const jsonEn = planLibraryExport('json', 'collection', 'films', loaded, fixedAt)
    const csvEn = planLibraryExport('csv', 'collection', 'films', loaded, fixedAt)
    const profileEn = planLibraryExport('json', 'profile', 'films', loaded, fixedAt)
    setLanguage('fr')
    try {
      assert.deepEqual(planLibraryExport('json', 'collection', 'films', loaded, fixedAt), jsonEn)
      assert.deepEqual(planLibraryExport('csv', 'collection', 'films', loaded, fixedAt), csvEn)
      assert.deepEqual(planLibraryExport('json', 'profile', 'films', loaded, fixedAt), profileEn)
    } finally {
      setLanguage('en')
    }
    assert.equal(jsonEn.suggestedName, 'sylloge-films-2026-10-23.json')
    assert.equal(profileEn.suggestedName, 'sylloge-sauvegarde-2026-10-23.json')
    assert.equal(jsonEn.contents, serializeLibraryDocument(createLibraryDocument({ ...loaded, customLibraries: [] }, fixedAt)))
    assert.match(jsonEn.contents, /"title": "Remplacer"/)
    assert.match(jsonEn.contents, /"personalNote": "Avis personnel FR"/)
    assert.equal(csvEn.contents, createCollectionCsvExport(loaded, 'films', fixedAt).contents)
    assert.equal(csvEn.suggestedName, createCollectionCsvExport(loaded, 'films', fixedAt).fileName)
    assert.doesNotMatch(csvEn.contents, /Films ajoutés|exporté/)

    const panel = renderToStaticMarkup(createElement(ExportDialogContent, {
      mediumLabel: 'Séries', scope: 'collection', saving: null, message: null,
      onScope() {}, onExport() {}, onClose() {},
    }))
    assert.match(panel, /Content to export/)
    assert.match(panel, /Series only/)
    assert.match(panel, /Whole profile · all its libraries/)
    assert.match(panel, /JSON Sylloge/)
    assert.match(panel, /<b>CSV<\/b>/)
    assert.match(panel, /Close/)
    assert.doesNotMatch(panel, /Contenu à exporter|uniquement|Fermer/)

    const profilePanel = renderToStaticMarkup(createElement(ExportDialogContent, {
      mediumLabel: 'Séries', scope: 'profile', saving: 'json',
      message: exportMessageText({ kind: 'saved-json', file: 'sylloge-sauvegarde-2026-10-23.json', count: 12, scope: 'profile', medium: 'series' }),
      onScope() {}, onExport() {}, onClose() {},
    }))
    assert.match(profilePanel, /Exporting…/)
    assert.match(profilePanel, /JSON export saved to “sylloge-sauvegarde-2026-10-23\.json” · 12 entries · whole profile\./)
    assert.doesNotMatch(profilePanel, /<b>CSV<\/b>/, 'Le CSV seul n’est pas proposé pour tout le profil')

    assert.equal(exportMessageText({ kind: 'saved-json', file: 'sylloge-films-2026-10-23.json', count: 1, scope: 'collection', medium: 'films' }),
      'JSON export saved to “sylloge-films-2026-10-23.json” · 1 entry · Films.')
    // « série » est aussi une clé partagée (vue « TV series ») : les deux
    // lectures anglaises restent acceptables tant que le pluriel est explicite.
    assert.match(exportMessageText({ kind: 'saved-csv', file: 'sylloge-series-2026-10-23.csv', count: 1, medium: 'series' }),
      /^CSV export saved to “sylloge-series-2026-10-23\.csv” with 1 (?:TV )?series\.$/)
    assert.equal(exportMessageText({ kind: 'saved-csv', file: 'sylloge-mangas-2026-10-23.csv', count: 3, medium: 'mangas' }),
      'CSV export saved to “sylloge-mangas-2026-10-23.csv” with 3 manga.')
    assert.equal(exportMessageText({ kind: 'cancelled', format: 'json' }), 'Export cancelled. No file was written.')
    assert.equal(exportMessageText({ kind: 'cancelled', format: 'csv' }), 'CSV export cancelled. No file was written.')
    assert.equal(exportMessageText({ kind: 'failed' }), 'The export failed. The local library was not modified.')
  })

  await test('Le dialogue d’import JSON, la confirmation et le bilan traduisent leurs libellés', async () => {
    const {
      JsonImportPreview, ContainerSourcePanel, ImportConfirmPanel, ImportDonePanel, ImportErrorAlert, importReportText, LibraryImportButton,
    } = await server.ssrLoadModule('/src/components/LibraryImportButton.tsx')

    const closed = renderToStaticMarkup(createElement(LibraryImportButton, {
      kind: 'films', buttonLabel: 'Import', mediumLabel: 'film', profileName: 'Profil FR',
      profileId: 'p1', existing: [], onDone() {},
    }))
    assert.equal(closed, '<button class="secondary-button" type="button">Import</button>')
    for (const count of [6, 7]) {
      const html = renderToStaticMarkup(createElement(JsonImportPreview, {
        kind: 'films', mediumLabel: 'Films', fileName: 'sylloge-films.json',
        items: [{ title: 'Remplacer' }, { title: 'Fusionner' }, ...Array.from({ length: count - 2 }, (_, index) => ({ title: `Titre ${index}` }))],
        onChooseAnother() {}, onContinue() {},
      }))
      assert.match(html, /Films preview/)
      assert.match(html, /Selected file/)
      assert.match(html, /sylloge-films\.json/)
      assert.match(html, /Entries recognised/)
      assert.match(html, /Detected titles/)
      assert.match(html, /aria-label="Detected titles · Films"/)
      assert.match(html, /<li>Remplacer<\/li>/)
      assert.match(html, /<li>Fusionner<\/li>/)
      assert.ok(html.includes(count === 6 ? 'One more entry is not listed.' : '2 more entries are not listed.'))
      assert.match(html, /Nothing is written yet\. Continue to compare entries or replace this library\./)
      assert.doesNotMatch(html, /Aperçu de|Titres détectés|Rien n’est encore écrit/)
    }
    assert.match(renderToStaticMarkup(createElement(JsonImportPreview, {
      kind: 'films', mediumLabel: 'Films', fileName: null, items: [], onChooseAnother() {}, onContinue() {},
    })), /Unknown file name/)

    const container = renderToStaticMarkup(createElement(ContainerSourcePanel, {
      source: {
        name: 'notion.zip', kind: 'container', contents: null, markdownPages: [],
        containerCandidates: [
          { id: 'a', name: 'Films.csv', kind: 'csv', contents: 'Titre\nFilm FR' },
          { id: 'b', name: 'Séries.csv', kind: 'csv', contents: 'Titre\nSérie FR' },
        ],
      },
      onPick() {}, onChooseAnother() {},
    }))
    assert.match(container, /Choose the data to preview/)
    assert.match(container, /2 candidates were found in <b>notion\.zip<\/b>\. Choosing still writes no data\./)
    assert.match(container, /<b>Films\.csv<\/b>/)
    assert.match(container, /Séries\.csv/)
    assert.match(container, /Preview and confirm before import/)
    assert.match(container, /Choose another source/)
    assert.doesNotMatch(container, /candidats|Choisir une autre source/)

    for (const mode of ['merge', 'replace']) {
      const html = renderToStaticMarkup(createElement(ImportConfirmPanel, {
        libraryLabel: 'Films', profileName: 'Profil FR', fileName: 'sylloge-films.json',
        importedCount: 12, additions: 4, updates: 8, removals: mode === 'replace' ? 12 : 0,
        mode, existingCount: 12, replaceAcknowledged: false,
        onAcknowledge() {}, onBack() {}, onConfirm() {},
      }))
      assert.match(html, /Confirm the import/)
      assert.match(html, /<dt>Destination<\/dt><dd>Films · Profil FR<\/dd>/)
      assert.match(html, /Entries analysed/)
      assert.match(html, /<dt>Additions<\/dt><dd>4<\/dd>/)
      assert.match(html, /<dt>Updates<\/dt><dd>8<\/dd>/)
      assert.match(html, /<dt>Removals<\/dt>/)
      assert.match(html, /<dt>Mode<\/dt>/)
      assert.match(html, /Other libraries and other profiles stay unchanged\. The write is one transaction\./)
      if (mode === 'replace') {
        assert.match(html, /Replace the 12 Films entries with those in the file\./)
        assert.match(html, /Confirm the replacement/)
        assert.match(html, /disabled=""/)
      } else {
        assert.match(html, /Merge with existing data/)
        assert.match(html, /Import the entries/)
        assert.match(html, /Existing personal information still takes priority by default|existing personal information still takes priority by default/)
      }
      assert.doesNotMatch(html, /Confirmer l’import|Fusionner avec l’existant|Remplacer les/)
    }

    const done = renderToStaticMarkup(createElement(ImportDonePanel, {
      fileName: 'sylloge-films.json',
      report: { kind: 'films', result: { inserted: 3, updated: 1, removed: 0 } },
      finalSummary: { skippedLines: ['Ligne 12'], emptyFields: [{ title: 'Remplacer', fields: ['note', 'avis'] }] },
      thirdPartyService: 'letterboxd', thirdPartyWarningCount: 1, onClose() {},
    }))
    assert.match(done, /Import complete/)
    assert.match(done, /File read: sylloge-films\.json/)
    assert.match(done, /3 films added, 1 updated\./)
    assert.match(done, /1 row skipped — no title, not created \(Line 12\)/)
    assert.match(done, /Current profile kept/)
    assert.match(done, /Letterboxd: 1 warning shown before import/)
    assert.match(done, /Fields left empty on 1 entry — to complete later/)
    assert.match(done, /Remplacer/)
    assert.match(done, /— rating, review/)
    assert.doesNotMatch(done, /Import terminé|ligne ignorée|Champs laissés vides|Fichier lu/)

    const emptyDone = renderToStaticMarkup(createElement(ImportDonePanel, {
      fileName: null, report: { kind: 'artworks', result: { inserted: 1, updated: 2, removed: 1 } },
      finalSummary: { skippedLines: [], emptyFields: [] }, thirdPartyService: null, thirdPartyWarningCount: 0, onClose() {},
    }))
    assert.match(emptyDone, /All recognised data has been imported\./)
    assert.match(emptyDone, /1 work added, 2 updated, 1 replaced\./)

    assert.match(renderToStaticMarkup(createElement(ImportErrorAlert, { error: { kind: 'domain', message: 'Le titre est obligatoire.' } })), /role="alert">A title is required\./)
    assert.match(renderToStaticMarkup(createElement(ImportErrorAlert, { error: { kind: 'copy', source: 'Sélection annulée. Aucune donnée n’a été écrite.' } })), /Selection cancelled\. No data has been written\./)
    assert.equal(importReportText('series', { inserted: 1, updated: 2, removed: 1 }), '1 series added, 2 updated, 1 replaced.')
    assert.equal(importReportText('books', { inserted: 2, updated: 3, removed: 0 }), '2 books added, 3 updated.')
    assert.equal(importReportText('games', { inserted: 1, updated: 1, removed: 0 }), '1 game added, 1 updated.')
  })

  await test('Chaque clé construite dynamiquement existe au catalogue', async () => {
    const film = await server.ssrLoadModule('/src/components/FilmCsvImportFlow.tsx')
    const exportFlow = await server.ssrLoadModule('/src/components/LibraryExportFlow.tsx')
    const importButton = await server.ssrLoadModule('/src/components/LibraryImportButton.tsx')
    const thirdParty = await server.ssrLoadModule('/src/components/ThirdPartyImportReview.tsx')
    const { FILM_IMPORT_FIELD_LABELS } = await server.ssrLoadModule('/src/domain/filmCsvImport.ts')
    const { english } = await server.ssrLoadModule('/src/i18n/catalog.ts')
    const groups = {
      'étapes Films': film.IMPORT_STEPS,
      'sources Films': Object.values(film.SOURCE_KIND_LABELS),
      'formats Films': Object.values(film.PREVIEW_SOURCE_LABELS),
      'champs Films': Object.values(FILM_IMPORT_FIELD_LABELS),
      'bibliothèques export': Object.values(exportFlow.MEDIUM_LABELS),
      'noms export': Object.values(exportFlow.MEDIUM_NOUNS).flat(),
      'pluriels de bibliothèque': Object.values(importButton.LIBRARY_PLURALS),
      'bilan d’import': Object.values(importButton.IMPORT_RESULT_WORDS).flatMap(words => Object.values(words).flat()),
      'champs vides': Object.values(importButton.EMPTY_FIELD_LABELS),
      'champs tiers': Object.values(thirdParty.FIELD_LABELS),
    }
    for (const [name, sources] of Object.entries(groups)) {
      for (const source of sources) {
        assert.ok(Object.hasOwn(english, source), `Clé dynamique absente du catalogue (${name}) : ${source}`)
      }
    }
    for (const [label, plural] of Object.entries(importButton.LIBRARY_PLURALS)) {
      assert.ok(Object.hasOwn(english, label), `Libellé de bibliothèque absent du catalogue : ${label}`)
      assert.ok(Object.hasOwn(english, plural), `Pluriel de bibliothèque absent du catalogue : ${plural}`)
    }
    assert.deepEqual(Object.values(importButton.LIBRARY_PLURALS), ['films', 'séries', 'animations japonaises', 'livres', 'mangas', 'jeux', 'œuvres'])
  })
} finally {
  await server.close()
  await rm(cacheDir, { recursive: true, force: true })
}
