// Liens externes dans la fenêtre native (qa-app.html : le harnais simule le plugin d'ouverture et
// enregistre les adresses confiées au système). Défaut d'origine : en natif, un <a target="_blank">
// ne faisait rien (bouton « Ouvrir le site de Letterboxd », À propos, crédits TMDB et IGDB).
// Gardes : le clic part au système avec la bonne adresse, la fenêtre ne navigue pas, aucun onglet ne
// s'ouvre, et un lien interne n'est pas détourné.
async page => {
  page.setDefaultTimeout(8000)
  const checks = []
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const popups = []
  page.context().on('page', opened => popups.push(opened.url()))

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  const startUrl = page.url()
  const opened = () => page.evaluate(() => window.__syllogeRecette.opened())

  // ── 1. Aide d'import : bouton « Ouvrir le site de Letterboxd » ─────────────────────────────────
  await page.locator('nav').getByRole('button', { name: 'Films', exact: true }).click()
  await page.getByRole('button', { name: 'Importer', exact: true }).first().click()
  await page.getByRole('button', { name: /^Letterboxd/ }).click()
  const site = page.getByRole('link', { name: /Ouvrir le site de Letterboxd/ })
  await site.waitFor()
  const href = await site.getAttribute('href')
  assert(/^https:\/\/letterboxd\.com\//.test(href), `Le lien vise Letterboxd (${href})`)
  assert((await opened()).length === 0, 'Rien n’est ouvert avant le clic')
  await site.click()
  await page.waitForTimeout(200)
  const first = await opened()
  assert(first.length === 1 && first[0] === new URL(href).href, `Clic : l'adresse part au système (${first})`)
  assert(page.url() === startUrl, 'Clic : la fenêtre de l’application ne navigue pas')
  assert(popups.length === 0, 'Clic : aucun onglet ni fenêtre ne s’ouvre')

  // « Aide du service » : même mécanisme sur tous les liens de l'aide.
  const help = page.getByRole('link', { name: /Aide du service/ })
  if (await help.count() > 0) {
    const helpHref = await help.first().getAttribute('href')
    await help.first().click()
    await page.waitForTimeout(150)
    const list = await opened()
    assert(list[list.length - 1] === new URL(helpHref).href, `« Aide du service » part aussi au système (${helpHref})`)
  }
  await page.keyboard.press('Escape')

  // ── 2. À propos : dépôt, site, licence, sources des données ────────────────────────────────────
  const entry = page.locator('aside').getByRole('button', { name: 'À propos', exact: true })
  if (!(await entry.isVisible().catch(() => false))) await page.getByRole('button', { name: 'Paramètres', exact: true }).click()
  await entry.click()
  const links = page.locator('main a[href^="https://"]')
  await links.first().waitFor()
  const count = await links.count()
  assert(count >= 6, `À propos : ${count} liens externes présents`)
  const before = (await opened()).length
  const hrefs = []
  for (let index = 0; index < count; index += 1) {
    hrefs.push(await links.nth(index).getAttribute('href'))
    await links.nth(index).click()
  }
  await page.waitForTimeout(250)
  const after = await opened()
  assert(after.length - before === count, `À propos : les ${count} liens partent au système (${after.length - before})`)
  assert(JSON.stringify(after.slice(before)) === JSON.stringify(hrefs.map(h => new URL(h).href)), 'À propos : chaque lien part avec sa propre adresse')
  assert(page.url() === startUrl && popups.length === 0, 'À propos : ni navigation ni nouvelle fenêtre')

  // ── 3. Un lien interne n'est pas détourné ─────────────────────────────────────────────────────
  await page.evaluate(() => {
    const anchor = document.createElement('a')
    anchor.id = 'qa-internal'
    anchor.href = '#interne'
    anchor.textContent = 'interne'
    document.body.append(anchor)
  })
  const count0 = (await opened()).length
  await page.locator('#qa-internal').click()
  assert((await opened()).length === count0 && page.url().endsWith('#interne'), 'Lien interne : conserve son comportement, rien n’est ouvert')

  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
