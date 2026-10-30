// Historique des récapitulatifs (qa-app.html). Gardes : la rangée principale garde l'année ouverte, la
// liste « Années précédentes » montre les bonnes années et les bons décomptes (comparés à un calcul SQL
// indépendant), « Voir » ouvre la fenêtre de cette année-là, aucune année en cours avant le 10 décembre
// ni aucune année future, un profil vide n'affiche pas de liste, l'anglais est complet, et la liste de
// huit années ne déborde ni en clair ni en sombre.
//
// Usage : playwright-cli -s=recap-histo run-code --filename=scripts/qa-recap-history.js   (`ok` doit valoir true)
// La date du harnais est fixée par `?recapOffer=AAAA-MM-JJ` ; `?recap=AAAA` force l'année principale.
async page => {
  page.setDefaultTimeout(15000)
  const checks = []
  const errors = []
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|net::ERR|CORS|access control/i.test(message.text())) errors.push(message.text().slice(0, 200)) })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  const BASE = 'http://127.0.0.1:5173/qa-app.html'
  const group = () => page.locator('section[aria-labelledby="transfer-recap-title"]')
  const heading = () => group().locator('h3.settings-subheading')
  const historyRows = () => group().locator('h3.settings-subheading ~ .settings-row')
  const mainRow = () => group().locator('.settings-row').first()

  const start = async (query, lang = 'fr') => {
    await page.goto(`${BASE}?${query}&lang=${lang}`)
    await page.evaluate(() => ['sylloge-theme', 'sylloge-sidebar-pinned', 'sylloge-language'].forEach(key => localStorage.removeItem(key)))
    await page.goto(`${BASE}?${query}&lang=${lang}`)
    await page.getByRole('heading', { level: 1 }).first().waitFor()
  }
  const openTransfer = async (lang = 'fr') => {
    const settings = lang === 'en' ? 'Settings' : 'Paramètres'
    const entry = lang === 'en' ? 'Import and export' : 'Importer et exporter'
    await page.getByRole('button', { name: settings, exact: true }).click()
    const target = page.locator('aside').getByRole('button', { name: entry, exact: true })
    if (!(await target.isVisible().catch(() => false))) await page.getByRole('button', { name: settings, exact: true }).click()
    await target.click()
    await group().waitFor()
  }

  /** Le calcul SQL indépendant : une ligne par année de visionnage, films terminés seulement. */
  const sqlYears = () => page.evaluate(() => window.__syllogeRecette.select(
    "SELECT substr(watched_at, 1, 4) AS year, COUNT(*) AS count FROM films WHERE profile_id = 'qa-profile' AND status = 'terminé' AND watched_at IS NOT NULL AND watched_at <> '' GROUP BY year ORDER BY year DESC",
  ).map(row => ({ year: Number(row.year), count: Number(row.count) })))

  /** Les rangées affichées, telles que lues à l'écran : année puis décompte. */
  const shownYears = async () => {
    const texts = await historyRows().allInnerTexts()
    return texts.map(text => {
      const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
      const match = /^(\d{4})$/.exec(lines[0] ?? '')
      const count = /^([\d\s\u202f]+)\s+(?:œuvre|œuvres|work|works)$/.exec(lines[1] ?? '')
      return { year: match ? Number(match[1]) : null, count: count ? Number(count[1].replace(/[\s\u202f]/g, '')) : null, text }
    })
  }
  const expectHistory = (sql, mainYear) => sql.filter(entry => entry.year < mainYear)

  // ── 1. Le 30 octobre 2026 : l'année en cours n'est pas ouverte, la liste s'arrête à 2024 ───────
  await start('scenario=recapHistory&recapOffer=2026-10-30')
  await openTransfer()
  assert(/Mon année 2025/.test(await mainRow().innerText()), 'Le 30 octobre, la rangée principale porte 2025')
  assert(await group().getByRole('button', { name: 'Voir mon année 2025', exact: true }).count() === 1, 'Le bouton principal dit la même année')
  assert(await heading().count() === 1 && /années précédentes/i.test(await heading().innerText()), 'Un sous-titre « Années précédentes » ouvre la liste')
  const octoberRows = await shownYears()
  assert(octoberRows.length === 7, `Sept années précédentes (2018 à 2024), pas plus (${octoberRows.length})`)
  assert(JSON.stringify(octoberRows.map(row => row.year)) === JSON.stringify([2024, 2023, 2022, 2021, 2020, 2019, 2018]), `De la plus récente à la plus ancienne (${octoberRows.map(row => row.year).join(', ')})`)
  const octoberSql = await sqlYears()
  const octoberExpected = expectHistory(octoberSql, 2025)
  assert(JSON.stringify(octoberRows.map(({ year, count }) => ({ year, count }))) === JSON.stringify(octoberExpected), `Les décomptes suivent le calcul SQL indépendant (${JSON.stringify(octoberExpected)})`)
  const octoberText = await group().innerText()
  assert(!/2026|2099/.test(octoberText), 'Ni l’année en cours avant le 10 décembre, ni une année future dans la liste')

  // ── 2. Année principale forcée à 2026 : huit années précédentes, le singulier et le pluriel ─────
  await start('scenario=recapHistory&recap=2026&recapOffer=2026-10-30')
  await openTransfer()
  assert(/Mon année 2026/.test(await mainRow().innerText()), '`?recap=2026` force la rangée principale à 2026')
  const rows = await shownYears()
  assert(rows.length === 8, `Huit années précédentes (2018 à 2025) : la liste reste lisible (${rows.length})`)
  assert(JSON.stringify(rows.map(({ year, count }) => ({ year, count }))) === JSON.stringify(expectHistory(await sqlYears(), 2026)), 'Chaque année affiche le décompte SQL de l’année')
  assert(rows.every(row => row.count !== null), 'Chaque rangée porte un décompte lisible')
  assert(/1 œuvre/.test(rows.find(row => row.year === 2018).text), '2018 : « 1 œuvre », au singulier')
  assert(/8 œuvres/.test(rows.find(row => row.year === 2025).text), '2025 : « 8 œuvres », au pluriel')

  // ── 3. « Voir » ouvre la fenêtre de cette année-là, pas celle de la rangée principale ───────────
  const open2023 = group().getByRole('button', { name: 'Voir mon année 2023', exact: true })
  assert(await open2023.count() === 1, 'La rangée 2023 porte un bouton « Voir » nommé par son année')
  await open2023.click()
  const dialog = page.getByRole('dialog', { name: 'Mon année 2023' })
  await dialog.waitFor()
  await dialog.locator('canvas.share-card-canvas').waitFor()
  assert(/6 œuvres datées de 2023/.test(await dialog.innerText()), 'La fenêtre ouverte est bien celle de 2023, avec ses six œuvres')
  await dialog.getByRole('button', { name: 'Fermer l’assistant', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })

  // ── 4. La liste ne déborde pas et reste atteignable, en clair puis en sombre ────────────────────
  for (const theme of ['light', 'dark']) {
    await page.goto(`${BASE}?scenario=recapHistory&recap=2026&recapOffer=2026-10-30&lang=fr`)
    await page.evaluate(value => localStorage.setItem('sylloge-theme', value), theme)
    await page.reload()
    await page.getByRole('heading', { level: 1 }).first().waitFor()
    await openTransfer()
    await page.evaluate(() => document.fonts.ready)
    const layout = await page.evaluate(() => {
      const section = document.querySelector('section[aria-labelledby="transfer-recap-title"]')
      const body = section.querySelector('.settings-group-body')
      const rows = [...section.querySelectorAll('h3.settings-subheading ~ .settings-row')]
      const main = document.querySelector('.portability-main')
      return {
        theme: document.documentElement.dataset.theme,
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        mainOverflow: main.scrollWidth - main.clientWidth,
        bodyOverflow: body.scrollWidth - body.clientWidth,
        rowsInside: rows.every(row => {
          const box = row.getBoundingClientRect()
          const button = row.querySelector('button').getBoundingClientRect()
          return box.left >= 0 && box.right <= innerWidth + 1 && button.right <= box.right + 1
        }),
        rows: rows.length,
        pageScrolls: main.scrollHeight > main.clientHeight + 1,
      }
    })
    assert(layout.theme === theme, `Capture ${theme} : thème réel`)
    assert(layout.horizontalOverflow <= 1 && layout.mainOverflow <= 1 && layout.bodyOverflow <= 1, `Capture ${theme} : aucun débordement horizontal (${layout.bodyOverflow} px)`)
    assert(layout.rowsInside, `Capture ${theme} : chaque bouton reste dans sa rangée`)
    assert(layout.rows === 8, `Capture ${theme} : les huit années sont présentes`)
    assert(layout.pageScrolls, `Capture ${theme} : la page défile, la liste n’est pas comprimée`)
    await group().evaluate(el => el.scrollIntoView({ block: 'center' }))
    await page.screenshot({ path: `recap-history/sylloge-recap-history-${theme}.png` })
  }
  await page.setViewportSize({ width: 1000, height: 760 })
  const narrow = await page.evaluate(() => {
    const section = document.querySelector('section[aria-labelledby="transfer-recap-title"]')
    const body = section.querySelector('.settings-group-body')
    return {
      bodyOverflow: body.scrollWidth - body.clientWidth,
      rows: section.querySelectorAll('h3.settings-subheading ~ .settings-row').length,
      buttonsInside: [...section.querySelectorAll('h3.settings-subheading ~ .settings-row')].every(row => {
        const box = row.getBoundingClientRect()
        const button = row.querySelector('button').getBoundingClientRect()
        return button.right <= box.right + 1 && box.right <= innerWidth + 1
      }),
    }
  })
  assert(narrow.bodyOverflow <= 1 && narrow.buttonsInside && narrow.rows === 8, `À 1000 px, la liste reste contenue (${narrow.bodyOverflow} px)`)
  await group().evaluate(el => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: 'recap-history/sylloge-recap-history-1000.png' })
  await page.setViewportSize({ width: 1440, height: 900 })

  // ── 5. Un profil vide : la rangée principale seulement, pas de liste vide ─────────────────────
  await start('scenario=empty&recap=2026&recapOffer=2026-10-30')
  await openTransfer()
  assert(await group().getByRole('button', { name: 'Voir mon année 2026', exact: true }).count() === 1, 'Profil vide : la rangée principale reste disponible')
  assert(await heading().count() === 0, 'Profil vide : aucun sous-titre « Années précédentes »')
  assert(await historyRows().count() === 0, 'Profil vide : aucune liste vide')

  // ── 6. Anglais : sous-titre, rangs, décomptes et bouton ───────────────────────────────────────
  await start('scenario=recapHistory&recap=2026&recapOffer=2026-10-30', 'en')
  await openTransfer('en')
  const english = await group().innerText()
  assert(/^year in review$/im.test(english), 'Anglais : le groupe est « Year in review »')
  assert(/Previous years/i.test(english), 'Anglais : le sous-titre est « Previous years »')
  assert(/My year 2026/.test(english) && /1 work/.test(english) && /8 works/.test(english), 'Anglais : l’année, le singulier et le pluriel sont traduits')
  assert(await group().getByRole('button', { name: 'See my 2023', exact: true }).count() === 1, 'Anglais : « Voir » devient « View », nommé par son année')
  assert(!/œuvres|Années précédentes|Voir mon année|Mon année/.test(english), 'Anglais : aucun reste de français dans la section')
  const englishYearRows = await shownYears()
  assert(englishYearRows.length === 8 && englishYearRows.every(row => row.count !== null), 'Anglais : les huit années restent lisibles')

  await page.evaluate(() => ['sylloge-theme', 'sylloge-sidebar-pinned', 'sylloge-language'].forEach(key => localStorage.removeItem(key)))
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
