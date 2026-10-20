async (page) => {
  page.setDefaultTimeout(4500)
  await page.setViewportSize({ width: 1440, height: 900 })
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
  const all = async () => {
    await page.locator('.library-views .view-pill').filter({ hasText: /^Tous$/ }).click()
    await settle()
    // Changer de vue intégrée conserve les filtres à la volée ; le test veut
    // ici toute la bibliothèque, pas seulement la vue Tous encore filtrée.
    const reset = page.getByRole('button', { name: /^Réinitialiser la vue/ })
    if (await reset.count()) await reset.click()
    await settle()
  }
  const titles = () => page.locator('.film-grid .film-card-info b').allTextContents()
  const db = (sql) => page.evaluate((query) => window.__syllogeRecette.select(query), sql)
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
  await page.locator('.atrium-home').waitFor()
  const initial = await db('SELECT * FROM books ORDER BY title')
  const expectedBooks = initial.filter((entry) => entry.category !== 'manga').map((entry) => entry.title).sort()
  const expectedMangas = initial.filter((entry) => entry.category === 'manga').map((entry) => entry.title).sort()
  await page.evaluate(() => {
    const filters = { status: 'all', statusGroup: null, favoritesOnly: true, minRating: null, year: null, personalDateFrom: null, specificText: '', location: '', exhibition: '' }
    for (const [id, name, mediumFilter, version] of [
      ['legacy-manga', 'Ancienne vue manga', 'manga', 1],
      ['legacy-book', 'Ancienne vue livres', 'all', 2],
      ['legacy-comics', 'Anciens comics', 'comics', 2],
    ]) {
      const criteria = version === 1 ? { view: 'favorites', mediumFilter, filters } : { sort: { column: 'title', direction: 'asc' }, mediumFilter, filters }
      window.__syllogeRecette.execute('INSERT INTO saved_views (id, profile_id, medium, name, criteria_json, schema_version, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)', [id, 'qa-profile', 'books', name, JSON.stringify(criteria), version, '2026-01-01T12:00:00.000Z'])
    }
  })
  const legacyBefore = await db("SELECT * FROM saved_views WHERE id LIKE 'legacy-%' ORDER BY id")
  await go('Livres')
  await all()
  assert(JSON.stringify((await titles()).sort()) === JSON.stringify(expectedBooks), 'Livres doit contenir livres et comics, sans manga.')
  assert(await page.locator('.category-switch').count() === 0, 'La bascule Livre/Manga/Comics ne doit plus être présente.')
  assert(await page.getByRole('button', { name: 'Ancienne vue manga', exact: true }).count() === 0, 'Une ancienne vue manga fuit dans Livres.')
  await page.getByRole('button', { name: 'Anciens comics', exact: true }).click()
  await settle()
  const comicFavorites = initial.filter((entry) => entry.category === 'comics' && entry.title === 'Watchmen').map((entry) => entry.title)
  assert((await titles()).includes(comicFavorites[0]), 'L’ancienne vue Comics n’est plus consultable.')
  checks.push('partition Livres et anciens comics, anciennes vues conservées')
  await go('Mangas')
  await all()
  assert(JSON.stringify((await titles()).sort()) === JSON.stringify(expectedMangas), 'Mangas doit contenir uniquement les mangas.')
  assert(await page.getByRole('button', { name: 'Ancienne vue livres', exact: true }).count() === 0, 'Une vue Livres fuit dans Mangas.')
  await page.getByRole('button', { name: 'Ancienne vue manga', exact: true }).click()
  await settle()
  assert((await titles()).includes('Monster'), 'L’ancienne vue v1 Manga doit fonctionner.')
  const legacyAfter = await db("SELECT * FROM saved_views WHERE id LIKE 'legacy-%' ORDER BY id")
  assert(JSON.stringify(legacyAfter) === JSON.stringify(legacyBefore), 'Consulter une vue ancienne ne doit réécrire aucun champ SQLite.')
  assert(legacyAfter.every((view) => view.schema_version === (view.id === 'legacy-manga' ? 1 : 2)), 'Consulter les anciennes vues ne doit pas les migrer.')
  checks.push('partition Mangas et lecture des vues v1 sans réécriture')
  await all()
  await page.getByRole('searchbox', { name: 'Rechercher par titre, auteur ou résumé' }).fill('Monster')
  await settle()
  assert(JSON.stringify(await titles()) === JSON.stringify(['Monster']), 'La recherche Mangas ne répond pas correctement.')
  await go('Livres')
  assert(await page.getByRole('searchbox').inputValue() === '', 'La recherche Mangas a écrasé celle des Livres.')
  await go('Mangas')
  assert(await page.getByRole('searchbox').inputValue() === 'Monster', 'La recherche propre à Mangas n’est pas conservée.')
  await page.getByRole('searchbox').fill('')
  await settle()
  await page.getByRole('button', { name: 'Nouvelle vue', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nom de la nouvelle vue', exact: true }).fill('Vue mangas de recette')
  await page.getByRole('button', { name: 'Enregistrer la vue', exact: true }).click()
  await settle()
  const saved = await db("SELECT * FROM saved_views WHERE name='Vue mangas de recette'")
  assert(saved.length === 1 && saved[0].medium === 'books' && JSON.parse(saved[0].criteria_json).mediumFilter === 'manga', 'Une nouvelle vue Mangas doit conserver le schéma books v2 et son périmètre.')
  assert(await page.locator('.view-bar-pending').count() === 0, 'Une vue Mangas nouvellement enregistrée ne doit pas être sale.')
  await go('Livres')
  assert(await page.getByRole('button', { name: 'Vue mangas de recette', exact: true }).count() === 0, 'La nouvelle vue Mangas fuit dans Livres.')
  checks.push('recherches mémorisées séparément et création de vue Mangas au schéma v2')
  for (const [label, singular, category] of [['Livres', 'livre', 'livre'], ['Mangas', 'manga', 'manga']]) {
    await go(label)
    await page.getByRole('button', { name: `Ajouter un ${singular}`, exact: true }).click()
    await page.getByRole('button', { name: 'Saisir manuellement', exact: true }).click()
    assert(await page.getByRole('radiogroup', { name: 'Type de livre', exact: true }).count() === 0, 'Le type ne doit pas être demandé à la création contextualisée.')
    await page.locator('#book-title').fill(`Création ${singular} de recette`)
    await page.locator('.film-form button[type="submit"]').click()
    await page.getByRole('heading', { name: `Création ${singular} de recette`, exact: true }).waitFor()
    const created = await db(`SELECT category FROM books WHERE title='Création ${singular} de recette'`)
    assert(created.length === 1 && created[0].category === category, 'La création manuelle a perdu sa bibliothèque.')
    await page.getByRole('button', { name: `Retour aux ${label.toLowerCase()}`, exact: true }).click()
    await settle()
  }
  checks.push('création manuelle Livres et Mangas, sans sélection de type, retour correct')
  await go('Mangas')
  await all()
  await page.getByRole('button', { name: 'Ouvrir la fiche de Monster', exact: true }).click()
  await page.locator('.detail-actions').getByRole('button', { name: 'Modifier', exact: true }).click()
  await page.getByRole('radiogroup', { name: 'Type de livre', exact: true }).getByRole('radio', { name: 'Livre', exact: true }).click()
  await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await page.getByRole('button', { name: 'Retour aux livres', exact: true }).waitFor()
  const moved = await db("SELECT * FROM books WHERE title='Monster'")
  assert(moved.length === 1 && moved[0].category === 'livre' && moved[0].id === initial.find((entry) => entry.title === 'Monster').id, 'Corriger le type doit déplacer la même fiche sans duplication.')
  assert(moved[0].personal_note === initial.find((entry) => entry.title === 'Monster').personal_note, 'L’avis personnel a changé lors de la correction du type.')
  const originalMonster = initial.find((entry) => entry.title === 'Monster')
  for (const field of ['volumes_read', 'volumes_total', 'progress_updated_at', 'rating', 'is_favorite', 'started_at', 'created_at']) {
    assert(moved[0][field] === originalMonster[field], `La correction du type a perdu le champ ${field}.`)
  }
  await page.getByRole('button', { name: 'Retour aux livres', exact: true }).click()
  await all()
  assert((await titles()).includes('Monster'), 'La fiche corrigée manque dans Livres.')
  await go('Mangas')
  await all()
  assert(!(await titles()).includes('Monster'), 'La fiche corrigée reste dans Mangas.')
  checks.push('correction du type et déplacement sans duplication ni perte d’avis')
  await page.evaluate(() => {
    const original = window.__TAURI_INTERNALS__.invoke
    window.__qaExports = []
    window.__TAURI_INTERNALS__.invoke = async (command, args, options) => {
      if (command === 'save_export_json' || command === 'save_export_csv') {
        window.__qaExports.push({ command, ...args })
        return 'export-de-recette'
      }
      return original(command, args, options)
    }
  })
  for (const label of ['Mangas', 'Livres']) {
    await go(label)
    await page.getByRole('button', { name: 'Exporter', exact: true }).click()
    await page.getByRole('button', { name: /JSON Sylloge/ }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'Exporter', exact: true }).click()
    await page.getByRole('button', { name: /^CSV/ }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  const exports = await page.evaluate(() => window.__qaExports)
  assert(exports.length === 4, 'Quatre exports JSON/CSV doivent avoir été préparés, sans écrire sur disque.')
  for (const [index, scope] of [[0, 'manga'], [2, 'livre']]) {
    const document = JSON.parse(exports[index].contents)
    assert(document.format === 'sylloge-library' && document.version === 2, 'Le format JSON doit rester compatible.')
    assert(document.books.length > 0 && document.books.every((entry) => scope === 'manga' ? entry.category === 'manga' : entry.category !== 'manga'), 'L’export contient une œuvre de l’autre bibliothèque.')
    assert(document.films.length === 0 && document.series.length === 0 && document.games.length === 0 && document.artworks.length === 0, 'L’export unitaire contient un autre médium.')
    assert(exports[index + 1].contents.includes('sylloge-books-csv'), 'Le format CSV historique doit rester inchangé.')
  }
  checks.push('exports JSON et CSV limités à la bibliothèque ouverte, formats inchangés')
  await page.getByRole('button', { name: 'Importer', exact: true }).click()
  const importDialog = page.getByRole('dialog', { name: 'Importer Livres et Mangas', exact: true })
  assert((await importDialog.innerText()).includes('« Remplacer » remplace les deux bibliothèques, comics compris.'), 'Le périmètre commun du remplacement doit être annoncé avant tout import.')
  await page.keyboard.press('Escape')
  assert(await page.getByRole('button', { name: 'Importer', exact: true }).evaluate((el) => document.activeElement === el), 'Le focus ne revient pas au bouton Importer.')
  const after = await db('SELECT id FROM books')
  assert(after.length === initial.length + 2, 'Une consultation ou un export a modifié la collection.')
  assert(errors.length === 0, `Erreurs de page : ${errors.join('; ')}`)
  assert(consoleErrors.length === 0, `Erreurs console : ${consoleErrors.join('; ')}`)
  assert(unexpectedRequests.length === 0, 'Une requête externe non simulée a été tentée.')
  assert((await page.evaluate(() => window.__syllogeRecette.unmocked())).length === 0, 'Une commande native non simulée a été appelée.')
  checks.push('import commun explicite, annulation sans écriture et restauration du focus')
  return { passed: true, checks, pageErrors: errors, consoleErrors, unexpectedRequests, nativeFileWrites: 0 }
}
