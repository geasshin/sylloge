// Recette « période de diffusion » des séries et animés (30 octobre 2026).
// Sous le titre : « créateurs · 2017–2020 », « · 2022– » pour une série en
// cours, une seule année quand elle tient dans un an ; jamais répétée dans la
// grille. Le formulaire refuse une fin avant le début et enregistre les deux
// années en base. Aucun service externe : le seed porte les années.
async (page) => {
  page.setDefaultTimeout(6000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const errors = []
  const checks = []
  page.on('pageerror', (error) => errors.push(error.message))
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
  const openFiche = async (library, title) => {
    await openLibrary(library)
    await page.getByRole('button', { name: `Ouvrir la fiche de ${title}`, exact: true }).click()
    await page.locator('.detail-factline').first().waitFor()
  }
  const factline = () => page.locator('.detail-factline').first().innerText()
  const facts = () => page.locator('.detail-facts').first().innerText()
  const back = async () => { await page.locator('.back-button').first().click(); await settle() }

  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.locator('.atrium-home').waitFor()

  // ── 1. Série terminée : « créateurs · 2017–2020 », rien dans la grille ──────────
  await openFiche('Séries', 'Le Bureau des légendes')
  assert(await factline() === 'Éric Rochant · 2017–2020', `Série terminée : ligne sous le titre (${await factline()})`)
  assert(!/2017|2020/.test(await facts()), 'Série terminée : la période n’est pas répétée dans la grille')
  checks.push('Série terminée : « Éric Rochant · 2017–2020 » sous le titre, absente de la grille')
  await back()

  // ── 2. Série en cours : « 2022– » ─────────────────────────────────────────────
  await openFiche('Séries', 'Severance')
  assert(await factline() === 'Dan Erickson · 2022–', `Série en cours : ligne sous le titre (${await factline()})`)
  checks.push('Série en cours : « Dan Erickson · 2022– »')
  await back()

  // ── 3. Animé sur une seule année : « 1998 » ───────────────────────────────────
  await openFiche('Animation japonaise', 'Cowboy Bebop')
  assert(await factline() === 'Shinichirō Watanabe · 1998', `Animé d’une année : ligne sous le titre (${await factline()})`)
  checks.push('Animé sur une seule année : « Shinichirō Watanabe · 1998 »')
  await back()

  // ── 4. Formulaire : fin avant début refusée, puis période enregistrée ─────────
  await openFiche('Séries', 'Le Bureau des légendes')
  await page.locator('.detail-actions').getByRole('button', { name: 'Modifier', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  assert(await dialog.locator('#series-firstAirYear').inputValue() === '2017', 'Formulaire : début prérempli (2017)')
  assert(await dialog.locator('#series-lastAirYear').inputValue() === '2020', 'Formulaire : fin préremplie (2020)')
  await dialog.locator('#series-lastAirYear').fill('2010')
  await dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await dialog.locator('#series-lastAirYear-error').waitFor()
  assert((await dialog.locator('#series-lastAirYear-error').innerText()).includes('La fin de diffusion ne peut pas précéder le début.'), 'Formulaire : une fin avant le début est refusée')
  checks.push('Formulaire : une fin avant le début est refusée avec un message')
  await dialog.locator('#series-lastAirYear').fill('2018')
  await dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await settle()
  const row = (await db("SELECT first_air_year, last_air_year FROM series WHERE title = 'Le Bureau des légendes'"))[0]
  assert(row.first_air_year === 2017 && row.last_air_year === 2018, `Formulaire : années en base (${row.first_air_year}, ${row.last_air_year})`)
  assert(await factline() === 'Éric Rochant · 2017–2018', `Formulaire : la fiche montre la nouvelle période (${await factline()})`)
  checks.push('Formulaire : 2017–2018 enregistré en base et affiché aussitôt')

  // ── 5. Vider la fin : la série redevient « en cours » ─────────────────────────
  await page.locator('.detail-actions').getByRole('button', { name: 'Modifier', exact: true }).click()
  await dialog.waitFor()
  await dialog.locator('#series-lastAirYear').fill('')
  await dialog.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await settle()
  const cleared = (await db("SELECT last_air_year FROM series WHERE title = 'Le Bureau des légendes'"))[0]
  assert(cleared.last_air_year === null, 'Fin vidée : NULL en base')
  assert(await factline() === 'Éric Rochant · 2017–', `Fin vidée : « 2017– » (${await factline()})`)
  checks.push('Fin vidée : NULL en base, « 2017– » affiché')

  // ── 6. Anglais : même ligne, aucune chaîne française ajoutée ──────────────────
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=en')
  await page.locator('.atrium-home').waitFor()
  const nav = page.locator('.sidebar nav').first()
  await nav.hover()
  await nav.locator('button[aria-label="Series"]').first().click()
  await page.locator('.library-header h1').filter({ hasText: /^Series$/ }).waitFor()
  await settle()
  const all = page.locator('.library-views .view-pill').filter({ hasText: /^All$/ })
  if (await all.count()) await all.first().click()
  await settle()
  await page.locator('.film-card-top > b', { hasText: /^Severance$/ }).first().click()
  await page.locator('.detail-factline').first().waitFor()
  assert(await factline() === 'Dan Erickson · 2022–', `Anglais : ligne sous le titre (${await factline()})`)
  await page.locator('.detail-actions').getByRole('button', { name: 'Edit', exact: true }).click()
  await dialog.waitFor()
  assert(await dialog.getByText('Broadcast period', { exact: true }).count() === 1, 'Anglais : « Broadcast period »')
  assert(await dialog.getByText('Leave the end empty if the series is still running.', { exact: true }).count() === 1, 'Anglais : aide traduite')
  checks.push('Anglais : période affichée, formulaire traduit')

  assert(errors.length === 0, `Erreurs de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, count: checks.length, checks })
}
