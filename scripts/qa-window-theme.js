// Barre de titre native : elle suit le thème choisi dans Paramètres › Général (qa-app.html, aucune donnée réelle).
// La fenêtre est simulée : la recette lit les thèmes demandés à Tauri, elle ne prouve pas le rendu macOS / Windows.
async page => {
  page.setDefaultTimeout(8000)
  const checks = []
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.atrium-home').waitFor()
  const asked = () => page.evaluate(() => window.__syllogeRecette.windowThemes())
  const last = async () => (await asked()).at(-1)
  const pause = () => page.waitForTimeout(250)

  assert((await asked()).length >= 1 && await last() === null, 'Au démarrage en mode système : la fenêtre suit le système (null)')
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click()
  await page.locator('aside').getByRole('button', { name: 'Général', exact: true }).click()
  const choose = async label => { await page.getByRole('radio', { name: new RegExp(`^${label}`) }).first().click(); await pause() }

  await choose('Sombre')
  assert(await last() === 'dark' && await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'Sombre : la page et la barre de titre passent en sombre')
  await choose('Clair')
  assert(await last() === 'light' && await page.evaluate(() => document.documentElement.dataset.theme) === 'light', 'Clair : la page et la barre de titre passent en clair')
  await choose('Système')
  assert(await last() === null, 'Système : la barre de titre repasse au réglage du système')

  // Un thème mémorisé s'applique aussi à la fenêtre dès le lancement.
  await page.evaluate(() => localStorage.setItem('sylloge-theme', 'dark'))
  await page.reload()
  await page.locator('.atrium-home').waitFor()
  assert(await last() === 'dark', 'Thème sombre mémorisé : la fenêtre est sombre dès le lancement')
  assert((await page.evaluate(() => window.__syllogeRecette.unmocked())).every(cmd => !/window/.test(cmd)), 'Aucune commande de fenêtre non simulée')

  await page.evaluate(() => localStorage.clear())
  return JSON.stringify({ ok: true, checks: checks.length })
}
