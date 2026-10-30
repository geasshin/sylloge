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
  const write = (sql) => page.evaluate((query) => window.__syllogeRecette.execute(query), sql)
  const openLibrary = async (label) => {
    await page.locator(`.sidebar nav[aria-label="Navigation principale"] button[aria-label="${label}"]`).click()
    await page.locator('.library-header h1').filter({ hasText: new RegExp(`^${label}$`) }).waitFor()
    const pill = page.locator('.library-views .view-pill').filter({ hasText: /^Tous$/ })
    if (await pill.count()) await pill.first().click()
    const reset = page.getByRole('button', { name: /^Réinitialiser la vue/ })
    if (await reset.count()) await reset.click()
    await settle()
  }
  const FIELDS = ['id', 'title', 'showrunner', 'casting', 'summary', 'rating', 'is_favorite',
    'seasons_seen', 'seasons_total', 'progress_updated_at', 'started_at', 'poster_url', 'personal_note', 'created_at']
  const control = () => checks.length

  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.locator('.atrium-home').waitFor()
  const original = (await db('SELECT * FROM series WHERE title=\'Severance\''))[0]
  assert(original, 'La fiche Severance doit exister au départ dans Séries.')
  const NOTE = 'Note personnelle à conserver pendant le déplacement.'
  // Le lien fournisseur existe avant le déplacement : la recette vérifie qu’il
  // suit la fiche, sans contacter de service externe. L’avis personnel est
  // saisi dans le formulaire, comme le ferait la personne.
  await write("INSERT INTO media_provider_links (profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at) SELECT profile_id, 'series', id, 'TMDB', '95396', '2026-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z' FROM series WHERE id = '" + original.id + "'")
  const fixture = original

  // ─── Séries → Animation japonaise ─────────────────────────────────────────
  await openLibrary('Séries')
  await page.getByRole('button', { name: 'Ouvrir la fiche de Severance', exact: true }).click()
  await page.locator('.detail-actions').getByRole('button', { name: 'Modifier', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  const libraryGroup = dialog.getByRole('radiogroup', { name: 'Bibliothèque de la fiche' })
  assert(await libraryGroup.count() === 1, 'Le formulaire de modification doit proposer le choix de bibliothèque.')
  assert(await dialog.getByText('Animation japonaise : les séries animées produites au Japon.').count() === 1, 'La phrase d’aide du choix doit être visible.')
  await dialog.locator('textarea#series-personalNote').fill(NOTE)
  await dialog.getByRole('radio', { name: 'Animation japonaise', exact: true }).click()
  await dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await settle()

  assert((await db(`SELECT id FROM series WHERE id = '${original.id}'`)).length === 0, 'La fiche doit quitter la table series.')
  const moved = (await db(`SELECT * FROM anime WHERE id = '${original.id}'`))[0]
  assert(moved, 'La fiche doit arriver dans la table anime avec le même identifiant.')
  for (const field of FIELDS.filter((name) => name !== 'personal_note' && name !== 'updated_at')) {
    assert(moved[field] === fixture[field], `Le déplacement a perdu ou réécrit le champ ${field}.`)
  }
  assert(moved.personal_note === NOTE, 'L’avis personnel saisi doit suivre la fiche.')
  assert(moved.updated_at !== fixture.updated_at, 'La modification doit rafraîchir updated_at.')
  assert((await db("SELECT COUNT(*) AS n FROM pragma_table_info('anime') WHERE name = 'category'"))[0].n === 0, 'La table anime ne porte pas de catégorie.')
  const links = await db(`SELECT medium, provider_name, provider_id FROM media_provider_links WHERE media_id = '${original.id}'`)
  assert(links.length === 1 && links[0].medium === 'anime' && links[0].provider_id === '95396', 'Le lien TMDB doit suivre la fiche vers Animation japonaise.')
  checks.push(`déplacement Séries → Animation japonaise : même identifiant, ${FIELDS.length} champs conservés, lien TMDB suivi`)

  // La fiche s’ouvre dans sa nouvelle bibliothèque, et les deux grilles sont à jour.
  await page.getByRole('button', { name: 'Retour à l’animation japonaise' }).first().waitFor()
  await page.getByRole('button', { name: 'Retour à l’animation japonaise' }).first().click()
  await settle()
  // La vue d’ouverture est la watchlist : on affiche « Tous » pour voir la fiche déplacée.
  await openLibrary('Animation japonaise')
  assert(await page.getByRole('button', { name: 'Ouvrir la fiche de Severance', exact: true }).count() === 1, 'La carte doit être visible dans la grille Animation japonaise sans rechargement.')
  checks.push('la fiche s’ouvre dans sa nouvelle bibliothèque et la grille Animation japonaise la montre déjà')

  await openLibrary('Séries')
  assert(await page.getByRole('button', { name: 'Ouvrir la fiche de Severance', exact: true }).count() === 0, 'La carte ne doit plus apparaître dans la grille Séries.')
  checks.push('la grille Séries ne montre plus la fiche déplacée')

  // ─── Animation japonaise → Séries (retour) ────────────────────────────────
  await openLibrary('Animation japonaise')
  await page.getByRole('button', { name: 'Ouvrir la fiche de Severance', exact: true }).click()
  await page.locator('.detail-actions').getByRole('button', { name: 'Modifier', exact: true }).click()
  const back = page.getByRole('dialog')
  await back.waitFor()
  assert(await back.getByRole('radio', { name: 'Animation japonaise', exact: true }).getAttribute('aria-checked') === 'true', 'Le choix doit refléter la bibliothèque actuelle de la fiche.')
  await back.getByRole('radio', { name: 'Séries', exact: true }).click()
  await back.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await back.waitFor({ state: 'hidden' })
  await settle()

  assert((await db(`SELECT id FROM anime WHERE id = '${original.id}'`)).length === 0, 'La fiche doit quitter la table anime.')
  const returned = (await db(`SELECT * FROM series WHERE id = '${original.id}'`))[0]
  assert(returned, 'La fiche doit revenir dans la table series.')
  assert(returned.category === 'série télé', 'La fiche revenue dans Séries doit porter la catégorie série télé.')
  for (const field of FIELDS.filter((name) => name !== 'personal_note' && name !== 'updated_at')) {
    assert(returned[field] === fixture[field], `Le retour a perdu ou réécrit le champ ${field}.`)
  }
  assert(returned.personal_note === NOTE, 'L’avis personnel doit revenir intact dans Séries.')
  const returnedLinks = await db(`SELECT medium, provider_name, provider_id FROM media_provider_links WHERE media_id = '${original.id}'`)
  assert(returnedLinks.length === 1 && returnedLinks[0].medium === 'series' && returnedLinks[0].provider_id === '95396', 'Le lien TMDB doit revenir dans Séries avec la fiche.')
  assert(await page.getByRole('button', { name: 'Retour aux séries' }).count() === 1, 'Le retour doit nommer la bibliothèque Séries.')
  await page.getByRole('button', { name: 'Retour aux séries' }).first().click()
  await settle()
  await openLibrary('Séries')
  assert(await page.getByRole('button', { name: 'Ouvrir la fiche de Severance', exact: true }).count() === 1, 'La carte doit être visible dans la grille Séries après le retour.')
  checks.push(`retour Animation japonaise → Séries : identifiant, ${FIELDS.length} champs et lien TMDB conservés, catégorie rétablie`)

  await openLibrary('Animation japonaise')
  assert(await page.getByRole('button', { name: 'Ouvrir la fiche de Severance', exact: true }).count() === 0, 'Aucune copie ne doit rester visible dans Animation japonaise.')
  assert((await db(`SELECT COUNT(*) AS n FROM series WHERE id = '${original.id}'`))[0].n === 1, 'Une seule ligne doit porter la fiche.')
  assert((await db(`SELECT COUNT(*) AS n FROM anime WHERE id = '${original.id}'`))[0].n === 0, 'Aucune copie résiduelle ne doit rester dans anime.')
  checks.push('aucune copie résiduelle : une seule ligne porte la fiche après les deux déplacements')

  // ─── Interface anglaise : les nouveaux textes sont traduits ────────────────
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=en')
  await page.locator('.atrium-home').waitFor()
  await page.locator('.sidebar nav[aria-label="Main navigation"] button[aria-label="Series"]').click()
  await page.locator('.library-header h1').filter({ hasText: /^Series$/ }).waitFor()
  const englishPill = page.locator('.library-views .view-pill').filter({ hasText: /^All$/ })
  if (await englishPill.count()) await englishPill.first().click()
  await settle()
  await page.getByRole('button', { name: 'Open details for The Bear', exact: true }).click()
  await page.locator('.detail-actions').getByRole('button', { name: 'Edit', exact: true }).click()
  const englishDialog = page.getByRole('dialog')
  await englishDialog.waitFor()
  const englishGroup = englishDialog.getByRole('radiogroup', { name: 'Entry library' })
  assert(await englishGroup.count() === 1, 'Le choix de bibliothèque doit être nommé en anglais.')
  assert(await englishDialog.getByRole('radio', { name: 'Series', exact: true }).count() === 1, 'Le libellé « Series » doit être traduit.')
  assert(await englishDialog.getByRole('radio', { name: 'Anime', exact: true }).count() === 1, 'Le libellé « Anime » doit être traduit.')
  assert(await englishDialog.getByText('Anime: animated series produced in Japan.').count() === 1, 'La phrase d’aide doit être traduite.')
  const englishText = await englishDialog.innerText()
  assert(!/Bibliothèque de la fiche|Animation japonaise : les séries animées/.test(englishText), 'Aucun texte français du choix ne doit rester en interface anglaise.')
  await englishDialog.locator('.editor-dialog-close').click()
  checks.push('interface anglaise : choix « Series / Anime » et phrase d’aide traduits, aucun reste français')

  assert(errors.length === 0, `Erreurs de page : ${errors.join('; ')}`)
  assert(consoleErrors.length === 0, `Erreurs console : ${consoleErrors.join('; ')}`)
  assert((await page.evaluate(() => window.__syllogeRecette.unmocked())).length === 0, 'Une commande native non simulée a été appelée.')
  checks.push('aucune erreur de page, de console ni commande native non simulée')
  return { passed: true, controls: control(), checks, pageErrors: errors, consoleErrors }
}
