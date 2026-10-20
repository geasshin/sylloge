async (page) => {
  page.setDefaultTimeout(4500)
  await page.setViewportSize({ width: 1440, height: 900 })
  const checks = []
  const pageErrors = []
  const consoleErrors = []
  const unexpectedRequests = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (request.url().startsWith('http://127.0.0.1:5173/')) return route.continue()
    if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#4b5460"/><path d="M0 420L280 70L400 310V600H0" fill="#78838f"/><circle cx="90" cy="120" r="38" fill="#d7dce1"/></svg>' })
    unexpectedRequests.push(request.url())
    return route.abort()
  })
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const equal = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), message)
  const settle = async () => {
    await page.waitForFunction(() => !document.querySelector('.results-state[role="status"]'))
    await page.waitForTimeout(220)
  }
  const nav = (label) => page.locator(`.sidebar nav button[aria-label="${label}"]`)
  const go = async (label) => {
    await nav(label).click()
    await page.locator('.library-header h1').filter({ hasText: new RegExp(`^${label}$`) }).waitFor()
    await settle()
  }
  const all = async () => {
    await page.locator('.library-views .view-pill').filter({ hasText: /^Tous$/ }).click()
    await settle()
    const reset = page.getByRole('button', { name: /^Réinitialiser la vue/ })
    if (await reset.count()) await reset.click()
    await settle()
  }
  const db = (query) => page.evaluate((sql) => window.__syllogeRecette.select(sql), query)
  const focusCycle = async (dialog) => {
    const controls = dialog.locator('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')
    const visible = []
    for (let index = 0; index < await controls.count(); index++) {
      if (await controls.nth(index).isVisible()) visible.push(controls.nth(index))
    }
    assert(visible.length > 1, 'La fenêtre doit contenir des contrôles focalisables.')
    await visible.at(-1).focus()
    await page.keyboard.press('Tab')
    assert(await visible[0].evaluate((el) => document.activeElement === el), 'Tab sort de la fenêtre.')
    await page.keyboard.press('Shift+Tab')
    assert(await visible.at(-1).evaluate((el) => document.activeElement === el), 'Shift+Tab sort de la fenêtre.')
  }
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
  await page.locator('.atrium-home').waitFor()
  const initial = await db('SELECT * FROM books ORDER BY title')
  assert(await page.locator('.sidebar nav button').count() === 7, 'Six destinations et l’accueil sont requis, sans bibliothèque Comics.')
  for (const [label, medium] of [['Livres', 'livre'], ['Mangas', 'manga']]) {
    await page.getByRole('tab', { name: label, exact: true }).click()
    const expected = initial.filter((entry) => medium === 'manga' ? entry.category === 'manga' : entry.category !== 'manga')
    const cards = await page.locator('.at-work').evaluateAll((cards) => cards.map((card) => card.dataset.medium))
    assert(cards.length > 0 && cards.every((value) => value === medium), `${label} : une rangée contient un autre médium.`)
    equal(Number(await page.locator('.at-stats .at-stat b').first().textContent()), expected.filter((entry) => entry.status === 'lu').length, `${label} : le bilan n’est pas cloisonné.`)
    const text = await page.getByRole('tabpanel').innerText()
    for (const excluded of initial.filter((entry) => !expected.includes(entry))) assert(!text.includes(excluded.title), `${label} : ${excluded.title} fuit dans l’accueil.`)
  }
  const homeOpener = page.locator('.at-work[data-medium="manga"]').filter({ hasText: 'Monster' }).first()
  await homeOpener.click()
  await page.locator('.detail-actions').getByRole('button', { name: 'Modifier', exact: true }).click()
  await page.locator('#book-personalNote').fill('Avis factice à préserver après correction du type.')
  await page.getByRole('button', { name: 'Ajouter une citation', exact: true }).click()
  await page.getByRole('textbox', { name: 'Citation 1', exact: true }).fill('Citation factice à conserver.')
  await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await page.getByRole('button', { name: 'Retour à l’accueil', exact: true }).click()
  await settle()
  assert(await homeOpener.evaluate((el) => document.activeElement === el), 'Le retour de fiche ne rend pas le focus à la carte d’accueil.')
  await page.getByRole('tab', { name: 'Mangas', exact: true }).focus()
  await page.keyboard.press('ArrowLeft')
  assert(await page.getByRole('tab', { name: 'Livres', exact: true }).getAttribute('aria-selected') === 'true', 'Les flèches ignorent le nouvel onglet.')
  checks.push('six destinations ; accueil entier et bilan cloisonnés ; édition/retour accueil avec focus ; onglets au clavier')

  const original = (await db("SELECT * FROM books WHERE id='book-monster'"))[0]
  const originalQuotes = await db("SELECT body, position FROM book_quotes WHERE book_id='book-monster' ORDER BY position")
  for (const [category, label] of [['livre', 'Livre'], ['comics', 'Comics'], ['manga', 'Manga']]) {
    await go(category === 'livre' ? 'Mangas' : 'Livres')
    await all()
    const opener = page.getByRole('button', { name: 'Ouvrir la fiche de Monster', exact: true })
    await opener.click()
    await page.locator('.detail-actions').getByRole('button', { name: 'Modifier', exact: true }).click()
    await page.getByRole('radiogroup', { name: 'Type de livre', exact: true }).getByRole('radio', { name: label, exact: true }).click()
    equal(await page.getByRole('textbox', { name: 'Tomes lus', exact: true }).inputValue(), '11', 'Les compteurs conservés doivent rester visibles.')
    const intactCounters = await page.locator('.stepper-field').evaluateAll((fields) => fields.length === 2 && fields.every((field) => {
      const box = field.getBoundingClientRect()
      return [...field.querySelectorAll('.stepper, .stepper-input, .stepper-button')].every((control) => {
        const bounds = control.getBoundingClientRect()
        return bounds.left >= box.left - 1 && bounds.right <= box.right + 1 && bounds.width >= 28
      })
    }))
    assert(intactCounters, 'Les compteurs de progression ou leurs boutons sont coupés.')
    await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
    const row = (await db("SELECT * FROM books WHERE id='book-monster'"))[0]
    equal(row.category, category, 'La catégorie corrigée n’a pas persisté.')
    for (const field of Object.keys(original).filter((field) => !['category', 'updated_at'].includes(field))) equal(row[field], original[field], `Le changement de type a altéré ${field}.`)
    equal(await db("SELECT body, position FROM book_quotes WHERE book_id='book-monster' ORDER BY position"), originalQuotes, 'Le texte ou l’ordre des citations a changé.')
    await page.getByRole('button', { name: category === 'manga' ? 'Retour aux mangas' : 'Retour aux livres', exact: true }).click()
    await settle()
    equal((await db("SELECT id FROM books WHERE title='Monster'")).length, 1, 'Le changement de type a dupliqué la fiche.')
  }
  checks.push('cycle Manga → Livre → Comics → Manga : même ligne SQLite, notes, citations et progression conservées')

  for (const [label, singular, category] of [['Livres', 'livre', 'livre'], ['Mangas', 'manga', 'manga']]) {
    await go(label)
    await page.getByRole('button', { name: `Ajouter un ${singular}`, exact: true }).click()
    await page.getByRole('heading', { name: `Rechercher un ${singular}`, exact: true }).waitFor()
    await page.getByRole('searchbox', { name: `Titre du ${singular}`, exact: true }).fill(`Recherche ${singular} factice`)
    await page.locator('.tmdb-candidate-card').first().click()
    await page.locator('#book-title').waitFor()
    assert(await page.getByRole('radiogroup', { name: 'Type de livre', exact: true }).count() === 0, 'L’ajout assisté redemande le type.')
    await focusCycle(page.locator('.editor-dialog'))
    await page.locator('.film-form button[type="submit"]').click()
    await page.getByRole('heading', { name: `Recherche ${singular} factice`, exact: true }).waitFor()
    equal((await db(`SELECT category FROM books WHERE title='Recherche ${singular} factice'`)).map((entry) => entry.category), [category], 'L’ajout assisté a perdu son périmètre.')
    await page.getByRole('button', { name: `Retour aux ${label.toLowerCase()}`, exact: true }).click()
    await settle()
  }
  checks.push('Open Library simulé : création assistée Livres/Mangas, type invisible et catégorie contextuelle, Tab/Shift+Tab')

  await go('Mangas')
  await all()
  await page.getByRole('button', { name: /^Filtrer/ }).click()
  await page.waitForTimeout(220)
  await page.getByRole('checkbox', { name: 'Coups de cœur uniquement', exact: true }).check()
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()
  await page.getByRole('button', { name: /^Trier,/ }).click()
  await page.getByRole('menuitemradio', { name: 'Début de lecture', exact: true }).click()
  await page.keyboard.press('Escape')
  const mangaSort = await page.getByRole('button', { name: /^Trier,/ }).getAttribute('aria-label')
  await go('Livres')
  equal(await page.locator('.view-bar-badge').count(), 0, 'Un filtre Mangas a fui dans Livres.')
  assert((await page.getByRole('button', { name: /^Trier,/ }).getAttribute('aria-label')).includes('Titre'), 'Le tri Mangas a écrasé celui de Livres.')
  await go('Mangas')
  equal(await page.locator('.view-bar-badge').textContent(), '1', 'Le filtre propre à Mangas n’a pas été mémorisé.')
  equal(await page.getByRole('button', { name: /^Trier,/ }).getAttribute('aria-label'), mangaSort, 'Le tri propre à Mangas n’a pas été mémorisé.')
  await page.getByRole('button', { name: /^Réinitialiser la vue/ }).click()
  await settle()
  equal(await page.locator('.view-bar-pending').count(), 0, 'Réinitialiser a laissé une modification partielle du contexte.')
  checks.push('filtres et tri indépendants Livres/Mangas ; réinitialisation complète des setters groupés')

  // Unicité commune au repository, même si la vue n’est pas visible dans l’autre bibliothèque.
  await go('Mangas')
  await page.getByRole('button', { name: 'Nouvelle vue', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nom de la nouvelle vue', exact: true }).fill('Nom partagé de recette')
  await page.getByRole('button', { name: 'Enregistrer la vue', exact: true }).click()
  await settle()
  await go('Livres')
  await page.getByRole('button', { name: 'Nouvelle vue', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nom de la nouvelle vue', exact: true }).fill('Nom partagé de recette')
  await page.getByRole('button', { name: 'Enregistrer la vue', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'dans Livres ou dans Mangas' }).waitFor()
  equal((await db("SELECT id FROM saved_views WHERE name='Nom partagé de recette'")).length, 1, 'Un nom a été dupliqué entre Livres et Mangas.')
  await page.keyboard.press('Escape')
  checks.push('unicité des noms Livres/Mangas, erreur explicite et aucune vue dupliquée')

  // Exports capturés dans le pont simulé ; aucun fichier n’est créé.
  await page.evaluate(() => {
    const original = window.__TAURI_INTERNALS__.invoke
    window.__qaExports = []
    window.__qaImportWrites = []
    window.__TAURI_INTERNALS__.invoke = async (command, args, options) => {
      if (command === 'save_export_json' || command === 'save_export_csv') {
        window.__qaExports.push({ command, ...args })
        return 'export-de-recette'
      }
      if (command === 'pick_import_any' && window.__qaImport) return window.__qaImport
      if (window.__qaImport && (command.startsWith('import_') || command === 'plugin:sql|execute')) window.__qaImportWrites.push(command)
      return original(command, args, options)
    }
  })
  const beforeTransfer = await db('SELECT * FROM books ORDER BY id')
  for (const label of ['Livres', 'Mangas']) {
    await go(label)
    for (const name of [/JSON Sylloge/, /^CSV/]) {
      await page.getByRole('button', { name: 'Exporter', exact: true }).click()
      await page.getByRole('button', { name }).click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
    }
  }
  const exports = await page.evaluate(() => window.__qaExports)
  equal(exports.length, 4, 'Quatre exports JSON/CSV sont requis.')
  for (const [index, manga] of [[0, false], [2, true]]) {
    const expected = beforeTransfer.filter((entry) => (entry.category === 'manga') === manga).map((entry) => entry.title).sort()
    const json = JSON.parse(exports[index].contents)
    equal(json.books.map((entry) => entry.title).sort(), expected, 'Le JSON ne contient pas la partition complète attendue.')
    for (const medium of ['films', 'series', 'games', 'artworks']) equal(json[medium], [], 'Un autre médium fuit dans l’export.')
    const csvItems = await page.evaluate(async (contents) => {
      const { prepareCollectionCsvImport, previewCollectionCsvImport } = await import('/src/domain/collectionCsvImport.ts')
      const session = prepareCollectionCsvImport('books', contents)
      const preview = previewCollectionCsvImport(session, session.initialMapping)
      if (!preview.items) throw new Error(JSON.stringify(preview.errors))
      return preview.items
    }, exports[index + 1].contents)
    equal(csvItems.map((entry) => entry.title).sort(), expected, 'Le CSV ne contient pas la partition complète attendue.')
  }
  const document = { ...JSON.parse(exports[0].contents), books: [...JSON.parse(exports[0].contents).books, ...JSON.parse(exports[2].contents).books] }
  await page.evaluate((contents) => { window.__qaImport = { name: 'recette.json', kind: 'json', contents, csvCandidates: [], markdownPages: [], containerCandidates: [] } }, JSON.stringify(document))
  for (const label of ['Livres', 'Mangas']) {
    await go(label)
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Importer Livres et Mangas', exact: true })
    assert((await dialog.innerText()).includes('« Remplacer » remplace les deux bibliothèques, comics compris.'), 'Le remplacement commun n’est pas annoncé avant écriture.')
    await focusCycle(dialog)
    await dialog.getByRole('button', { name: 'Choisir un fichier', exact: true }).click()
    await dialog.getByRole('button', { name: /Repartir de zéro.*Remplacer/ }).waitFor()
    assert((await dialog.innerText()).includes(`en contient ${beforeTransfer.length}`), 'Le compteur de remplacement omet une partition ou les comics.')
    await dialog.getByRole('button', { name: 'Annuler', exact: true }).click()
    assert(await page.getByRole('button', { name: 'Importer', exact: true }).evaluate((el) => document.activeElement === el), 'Le focus ne revient pas à Importer.')
  }
  equal(await db('SELECT * FROM books ORDER BY id'), beforeTransfer, 'La préparation/annulation de transfert a altéré une donnée.')
  equal(await page.evaluate(() => window.__qaImportWrites), [], 'L’analyse/annulation de l’import a déclenché une écriture.')
  await page.evaluate(() => { window.__qaImport = null })
  checks.push('JSON/CSV complets et cloisonnés ; import mixte annoncé dans les deux bibliothèques ; analyse/annulation sans écriture')

  for (const [label, singular] of [['Livres', 'livre'], ['Mangas', 'manga']]) {
    await go(label)
    await all()
    const opener = page.getByRole('button', { name: `Ouvrir la fiche de Recherche ${singular} factice`, exact: true })
    await opener.click()
    const remove = page.getByRole('button', { name: `Supprimer ce ${singular}`, exact: true })
    await remove.click()
    await focusCycle(page.getByRole('alertdialog'))
    await page.keyboard.press('Escape')
    equal(await page.getByRole('alertdialog').count(), 0, 'Échap ne ferme pas la confirmation de suppression.')
    assert(await remove.evaluate((el) => document.activeElement === el), 'La suppression annulée perd son déclencheur.')
    await page.getByRole('button', { name: `Retour aux ${label.toLowerCase()}`, exact: true }).click()
    await settle()
    assert(await opener.evaluate((el) => document.activeElement === el), 'Le retour de fiche ne rend pas le focus à la carte.')
    await opener.click()
    await remove.click()
    await page.getByRole('button', { name: 'Supprimer définitivement', exact: true }).click()
    await page.locator('.library-header h1').filter({ hasText: new RegExp(`^${label}$`) }).waitFor()
    equal(await db(`SELECT id FROM books WHERE title='Recherche ${singular} factice'`), [], 'La fiche factice n’a pas été supprimée.')
  }
  equal((await db('SELECT id FROM books')).length, initial.length, 'Les deux créations/suppressions factices ne s’équilibrent pas.')
  checks.push('suppression Livres/Mangas : confirmation clavier, annulation avec focus, retour au bon contexte')
  equal(pageErrors, [], 'Une erreur de page a été émise.')
  equal(consoleErrors, [], 'Une erreur console a été émise.')
  equal(unexpectedRequests, [], 'Une requête externe non simulée a été tentée.')
  equal(await page.evaluate(() => window.__syllogeRecette.unmocked()), [], 'Un pont natif non simulé a été appelé.')
  return JSON.stringify({ passed: true, checks, pageErrors, consoleErrors, unexpectedRequests, unmocked: [], nativeFileWrites: 0 })
}
