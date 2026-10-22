async (page) => {
  page.setDefaultTimeout(6000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const errors = []
  const consoleErrors = []
  const checks = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const settle = async () => {
    await page.waitForFunction(() => !document.querySelector('.results-state[role="status"]'))
    await page.waitForTimeout(180)
  }
  const db = (sql) => page.evaluate((query) => window.__syllogeRecette.select(query), sql)
  const openLibrary = async (label) => {
    await page.locator(`.sidebar nav[aria-label="Navigation principale"] button[aria-label="${label}"]`).click()
    await page.locator('.library-header h1').filter({ hasText: new RegExp(`^${label}$`) }).waitFor()
    const pill = page.locator('.library-views .view-pill').filter({ hasText: /^Tous$/ })
    if (await pill.count()) await pill.first().click()
    const reset = page.getByRole('button', { name: /^Réinitialiser la vue/ })
    if (await reset.count()) await reset.click()
    await settle()
  }
  const FIELDS = ['id', 'title', 'rating', 'volumes_read', 'volumes_total', 'status', 'created_at', 'personal_note']

  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
  await page.locator('.atrium-home').waitFor()
  const original = (await db('SELECT * FROM mangas WHERE title=\'Monster\''))[0]
  assert(original, 'La fiche Monster doit exister au départ dans Mangas.')
  const QUOTE = 'Citation à conserver lors du changement de bibliothèque.'

  // Une seule validation déplace la fiche et enregistre une citation neuve.
  await openLibrary('Mangas')
  await page.getByRole('button', { name: 'Ouvrir la fiche de Monster', exact: true }).click()
  await page.getByRole('button', { name: 'Ajouter une citation' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.getByRole('button', { name: 'Ajouter une citation', exact: true }).click()
  await dialog.locator('textarea[placeholder="Saisir le passage…"]').fill(QUOTE)
  await dialog.getByRole('radio', { name: 'Livre', exact: true }).click()
  await dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await settle()

  assert((await db('SELECT id FROM mangas WHERE title=\'Monster\'')).length === 0, 'La fiche doit quitter la table Mangas.')
  const moved = (await db('SELECT * FROM books WHERE title=\'Monster\''))[0]
  assert(moved, 'La fiche doit arriver dans la table Livres.')
  assert(moved.category === 'livre', 'La fiche déplacée doit porter la catégorie livre.')
  for (const field of FIELDS) {
    assert(moved[field] === original[field], `Le déplacement a perdu ou réécrit le champ ${field}.`)
  }
  const movedQuotes = await db(`SELECT body FROM book_quotes WHERE book_id='${moved.id}' ORDER BY position`)
  assert(movedQuotes.length === 1 && movedQuotes[0].body === QUOTE, 'La citation saisie pendant le déplacement est absente ou altérée.')
  assert((await db(`SELECT id FROM manga_quotes WHERE manga_id='${original.id}'`)).length === 0, 'Une citation est restée dans la table Mangas.')
  checks.push('déplacement Mangas → Livres : même identifiant, champs intacts, citation écrite une seule fois')

  // Retour : la fiche revient dans Mangas avec la même citation.
  await openLibrary('Livres')
  await page.getByRole('button', { name: 'Ouvrir la fiche de Monster', exact: true }).click()
  await page.locator('.detail-actions').getByRole('button', { name: 'Modifier', exact: true }).click()
  const back = page.getByRole('dialog')
  await back.waitFor()
  await back.getByRole('radio', { name: 'Manga', exact: true }).click()
  await back.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await back.waitFor({ state: 'hidden' })
  await settle()

  assert((await db('SELECT id FROM books WHERE title=\'Monster\'')).length === 0, 'La fiche doit quitter la table Livres.')
  const returned = (await db('SELECT * FROM mangas WHERE title=\'Monster\''))[0]
  assert(returned, 'La fiche doit revenir dans la table Mangas.')
  assert(returned.id === original.id, 'Le retour a changé l’identifiant de la fiche.')
  for (const field of FIELDS.filter((name) => name !== 'personal_note')) {
    assert(returned[field] === original[field], `Le retour a perdu ou réécrit le champ ${field}.`)
  }
  const returnedQuotes = await db(`SELECT body FROM manga_quotes WHERE manga_id='${returned.id}' ORDER BY position`)
  assert(returnedQuotes.length === 1 && returnedQuotes[0].body === QUOTE, 'La citation n’a pas suivi le retour dans Mangas.')
  assert((await db(`SELECT id FROM book_quotes WHERE book_id='${returned.id}'`)).length === 0, 'La citation est restée dans la table Livres.')
  checks.push('retour Livres → Mangas : identifiant, état et citation conservés, aucune copie résiduelle')

  assert(errors.length === 0, `Erreurs de page : ${errors.join('; ')}`)
  assert(consoleErrors.length === 0, `Erreurs console : ${consoleErrors.join('; ')}`)
  assert((await page.evaluate(() => window.__syllogeRecette.unmocked())).length === 0, 'Une commande native non simulée a été appelée.')
  checks.push('aucune erreur de page, de console ni commande native non simulée')
  return { passed: true, checks, pageErrors: errors, consoleErrors }
}
