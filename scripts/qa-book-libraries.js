async (page) => {
  page.setDefaultTimeout(6000)
  await page.setViewportSize({ width: 1440, height: 900 })
  // Les transitions de vue déplacent le bouton retour : on les neutralise pour
  // des clics déterministes.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = []
  const consoleErrors = []
  const unexpectedRequests = []
  const checks = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (request.url().startsWith('http://127.0.0.1:5173/')) return route.continue()
    if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#4b5460"/><path d="M0 420L280 70L400 310V600H0" fill="#78838f"/><circle cx="90" cy="120" r="38" fill="#d7dce1"/></svg>' })
    unexpectedRequests.push(request.url())
    return route.abort()
  })
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const settle = async () => {
    await page.waitForFunction(() => !document.querySelector('.results-state[role="status"]'))
    await page.waitForTimeout(180)
  }
  const go = async (label) => {
    await page.locator(`.sidebar nav[aria-label="Navigation principale"] button[aria-label="${label}"]`).click()
    await page.locator('.library-header h1').filter({ hasText: new RegExp(`^${label}$`) }).waitFor()
    await settle()
  }
  // La vue « Tous » peut rester filtrée : on réinitialise pour comparer à la table.
  const all = async () => {
    const pill = page.locator('.library-views .view-pill').filter({ hasText: /^Tous$/ })
    if (await pill.count()) await pill.first().click()
    const reset = page.getByRole('button', { name: /^Réinitialiser la vue/ })
    if (await reset.count()) await reset.click()
    await settle()
  }
  const titles = () => page.locator('.film-grid .film-card-info b').allTextContents()
  const db = (sql) => page.evaluate((query) => window.__syllogeRecette.select(query), sql)
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
  await page.locator('.atrium-home').waitFor()
  const booksBefore = await db('SELECT id, title FROM books ORDER BY title')
  const mangasBefore = await db('SELECT id, title FROM mangas ORDER BY title')
  const comicsBefore = await db('SELECT id, title FROM comics ORDER BY title')

  // Chaque bibliothèque est une table : aucune œuvre de l'autre ne doit apparaître.
  await go('Livres')
  await all()
  assert(JSON.stringify((await titles()).sort()) === JSON.stringify(booksBefore.map((entry) => entry.title).sort()), 'Livres doit contenir exactement les livres, sans manga ni comic.')
  assert(await page.locator('.category-switch').count() === 0, 'La bascule Livre/Manga/Comics ne doit plus être présente.')
  assert((await titles()).every((title) => !mangasBefore.some((entry) => entry.title === title)), 'Un manga fuit dans Livres.')
  await go('Mangas')
  await all()
  assert(JSON.stringify((await titles()).sort()) === JSON.stringify(mangasBefore.map((entry) => entry.title).sort()), 'Mangas doit contenir exactement les mangas, sans livre.')
  await go('Comics')
  await all()
  assert(JSON.stringify((await titles()).sort()) === JSON.stringify(comicsBefore.map((entry) => entry.title).sort()), 'Comics doit contenir exactement les comics.')
  checks.push('une table par bibliothèque : Livres, Mangas et Comics ne se mélangent pas')

  // La recherche est mémorisée par bibliothèque, pas partagée.
  await go('Mangas')
  await all()
  const mangasSearch = page.getByRole('searchbox').first()
  await mangasSearch.fill('Monster')
  await settle()
  assert(JSON.stringify(await titles()) === JSON.stringify(['Monster']), 'La recherche Mangas ne répond pas correctement.')
  await go('Livres')
  assert(await page.getByRole('searchbox').first().inputValue() === '', 'La recherche Mangas a écrasé celle des Livres.')
  await go('Mangas')
  assert(await page.getByRole('searchbox').first().inputValue() === 'Monster', 'La recherche propre à Mangas n’est pas conservée.')
  await page.getByRole('searchbox').first().fill('')
  await settle()
  checks.push('recherches mémorisées séparément par bibliothèque')

  // Une vue enregistrée dans une bibliothèque ne doit pas apparaître dans l'autre.
  await page.getByRole('button', { name: 'Nouvelle vue', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nom de la nouvelle vue', exact: true }).fill('Vue mangas de recette')
  await page.getByRole('button', { name: 'Enregistrer la vue', exact: true }).click()
  await settle()
  assert(await page.getByRole('button', { name: 'Vue mangas de recette', exact: true }).count() === 1, 'La vue Mangas n’apparaît pas dans sa bibliothèque.')
  assert(await page.locator('.view-bar-pending').count() === 0, 'Une vue nouvellement enregistrée ne doit pas être sale.')
  await go('Livres')
  assert(await page.getByRole('button', { name: 'Vue mangas de recette', exact: true }).count() === 0, 'La vue Mangas fuit dans Livres.')
  assert((await db("SELECT name FROM saved_views WHERE name='Vue mangas de recette'")).length === 1, 'La vue Mangas doit être enregistrée une seule fois.')
  checks.push('vues enregistrées cloisonnées par bibliothèque')

  // La création manuelle contextualisée écrit dans la bonne table.
  for (const [label, singular, table, expectedCategory] of [
    ['Livres', 'livre', 'books', 'livre'],
    ['Mangas', 'manga', 'mangas', null],
  ]) {
    await go(label)
    await all()
    await page.getByRole('button', { name: `Ajouter un ${singular}`, exact: true }).click()
    await page.getByRole('button', { name: 'Saisir manuellement', exact: true }).click()
    assert(await page.getByRole('radiogroup', { name: 'Type de livre', exact: true }).count() === 0, 'Le type ne doit pas être demandé à la création contextualisée.')
    await page.locator('#book-title').fill(`Création ${singular} de recette`)
    await page.locator('.film-form button[type="submit"]').click()
    await page.getByRole('heading', { name: `Création ${singular} de recette`, exact: true }).waitFor()
    const created = await db(`SELECT * FROM ${table} WHERE title='Création ${singular} de recette'`)
    assert(created.length === 1, `La création manuelle n’a pas atterri dans ${table}.`)
    if (expectedCategory) assert(created[0].category === expectedCategory, 'La fiche Livres a perdu sa catégorie.')
    const elsewhere = table === 'books' ? 'mangas' : 'books'
    assert((await db(`SELECT title FROM ${elsewhere} WHERE title='Création ${singular} de recette'`)).length === 0, 'La création manuelle fuit dans l’autre table.')
    await page.getByRole('button', { name: `Retour aux ${label.toLowerCase()}`, exact: true }).click()
    await settle()
  }
  checks.push('création manuelle Livres et Mangas dans la bonne table, sans sélection de type')

  // L’import annonce son périmètre : une seule bibliothèque, aucune écriture avant confirmation.
  await go('Livres')
  await page.getByRole('button', { name: 'Importer', exact: true }).click()
  const importDialog = page.getByRole('dialog')
  await importDialog.first().waitFor()
  const importText = await importDialog.first().innerText()
  assert(importText.includes('IMPORTER · LIVRES'), 'Le dialogue d’import doit annoncer la bibliothèque Livres.')
  assert(importText.includes('Aucune écriture avant confirmation'), 'L’absence d’écriture avant confirmation n’est pas annoncée.')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  assert(await page.getByRole('button', { name: 'Importer', exact: true }).evaluate((el) => document.activeElement === el), 'Le focus ne revient pas au bouton Importer.')
  const booksAfter = await db('SELECT id FROM books')
  const mangasAfter = await db('SELECT id FROM mangas')
  assert(booksAfter.length === booksBefore.length + 1, 'Une consultation a modifié la table Livres au-delà de la création de recette.')
  assert(mangasAfter.length === mangasBefore.length + 1, 'Une consultation a modifié la table Mangas au-delà de la création de recette.')
  assert(errors.length === 0, `Erreurs de page : ${errors.join('; ')}`)
  assert(consoleErrors.length === 0, `Erreurs console : ${consoleErrors.join('; ')}`)
  assert(unexpectedRequests.length === 0, 'Une requête externe non simulée a été tentée.')
  assert((await page.evaluate(() => window.__syllogeRecette.unmocked())).length === 0, 'Une commande native non simulée a été appelée.')
  checks.push('import au périmètre explicite, annulation sans écriture et restauration du focus')
  return { passed: true, checks, pageErrors: errors, consoleErrors, unexpectedRequests, nativeFileWrites: 0 }
}
