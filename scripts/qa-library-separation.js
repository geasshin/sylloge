async (page) => {
  page.setDefaultTimeout(5000)
  const assertions = [], measurements = [], errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const check = (ok, name, context = {}) => {
    assertions.push({ name, ...context, passed: Boolean(ok) })
    if (!ok) throw new Error(`${name}: ${JSON.stringify(context)}`)
  }
  await page.route('**/*', (route) => {
    if (route.request().url().startsWith('http://127.0.0.1:5173/')) return route.continue()
    if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#515760"/><path d="M0 420L280 70L400 310V600H0" fill="#a1a6ae"/></svg>' })
    errors.push(route.request().url())
    return route.abort()
  })
  const sql = (query) => page.evaluate((q) => window.__syllogeRecette.select(q), query)
  const snapshot = async () => ({ series: await sql('SELECT * FROM series ORDER BY id'), books: await sql('SELECT * FROM books ORDER BY id'), quotes: await sql('SELECT * FROM book_quotes ORDER BY id'), links: await sql('SELECT * FROM media_provider_links ORDER BY media_id') })
  const nav = (label) => page.locator('.sidebar nav').getByRole('button', { name: label, exact: true })
  const settle = async () => { await page.waitForFunction(() => !document.querySelector('.results-state[role="status"]')); await page.waitForTimeout(220) }
  const open = async (label, all = true) => {
    await nav(label).click()
    await page.locator('.library-header h1').filter({ hasText: new RegExp(`^${label}$`) }).waitFor()
    if (all) await page.locator('.library-views').getByRole('button', { name: 'Tous', exact: true }).click()
    await settle()
  }
  const titles = () => page.locator('.film-grid .film-card-top > b').allTextContents().then((v) => v.sort())
  // Une bibliothèque = une table : plus aucune catégorie ne filtre une autre.
  const cases = [
    ['Séries', 'series', 'anime'],
    ['Animation japonaise', 'anime', 'series'],
    ['Livres', 'books', 'mangas'],
    ['Mangas', 'mangas', 'books'],
  ]
  for (const theme of ['light', 'dark']) {
    await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
    await page.locator('.atrium-home').waitFor()
    await page.evaluate((t) => localStorage.setItem('sylloge-theme', t), theme)
    await page.reload()
    await page.locator('.atrium-home').waitFor()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    check(await page.evaluate(() => document.documentElement.dataset.theme) === theme, 'thème-appliqué', { theme })
    const before = await snapshot()
    await page.evaluate(() => {
      window.__splitExports = []
      const invoke = window.__TAURI_INTERNALS__.invoke
      window.__TAURI_INTERNALS__.invoke = (cmd, args, options) => {
        if (cmd === 'save_export_json' || cmd === 'save_export_csv') { window.__splitExports.push({ cmd, args }); return Promise.resolve(args.suggestedName) }
        return invoke(cmd, args, options)
      }
    })
    for (const [label, table, otherTable] of cases) {
      const expected = (await sql(`SELECT title FROM ${table}`)).map((r) => r.title).sort()
      await open(label)
      check(JSON.stringify(await titles()) === JSON.stringify(expected), 'partition-exacte-anciennes-fiches', { theme, label, expected })
      check(Number(await nav(label).locator('.nav-count').textContent()) === expected.length, 'compteur-propre', { label })
      check(await page.locator('.category-switch').count() === 0, 'aucune-bascule-catégorie', { label })
      for (const [width, height] of [[1440, 900], [1000, 760]]) {
        await page.setViewportSize({ width, height })
        for (const expanded of [false, true]) {
          if ((await page.locator('.sidebar-toggle').getAttribute('aria-pressed') === 'true') !== expanded) await page.locator('.sidebar-toggle').click()
          // Le survol déploie la barre : on sort la souris et on attend l'état
          // stabilisé, sinon la mesure porte sur une transition.
          await page.mouse.move(900, 700)
          await page.waitForFunction((want) => document.querySelector('.sidebar').classList.contains(want ? 'sidebar-expanded' : 'sidebar-rail'), expanded)
          await settle()
          const metrics = await page.evaluate((isExpanded) => {
            const h = document.querySelector('.library-header h1').getBoundingClientRect()
            const buttons = [...document.querySelectorAll('.library-header-actions button')].filter((b) => b.checkVisibility())
            const n = document.querySelector('.sidebar button[aria-label="Animation japonaise"]')
            const side = document.querySelector('.sidebar')
            const label = n.querySelector('.nav-item-label')
            // Replié, le libellé est volontairement hors du rail (rogné, invisible) :
            // on vérifie alors que le rail lui-même ne déborde pas, et que les noms
            // sont entièrement visibles seulement quand la barre est déployée.
            const labelClipped = label ? label.getBoundingClientRect().right > n.getBoundingClientRect().right + 1 : false
            return { overflow: document.documentElement.scrollWidth - innerWidth, headingInside: h.left >= 0 && h.right <= innerWidth, actionsInside: buttons.every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && b.scrollWidth <= b.clientWidth + 1 }), sidebarFits: side.scrollWidth <= side.clientWidth + 1, labelsFullyVisible: !isExpanded || !labelClipped }
          }, expanded)
          measurements.push({ theme, label, width, expanded, ...metrics })
          check(metrics.overflow <= 1 && metrics.headingInside && metrics.actionsInside && metrics.sidebarFits && metrics.labelsFullyVisible, 'libellés-entiers-sans-débordement', { theme, label, width, expanded, metrics })
          if (expanded) check(await nav('Animation japonaise').locator('.nav-item-text svg').evaluate((e) => e.getBoundingClientRect().width) >= 17.9, 'icône-animation-non-comprimée', { theme, width })
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.getByRole('button', { name: 'Exporter', exact: true }).click()
      await page.getByRole('button', { name: /JSON Sylloge/ }).click()
      const exported = await page.evaluate(() => JSON.parse(window.__splitExports.at(-1).args.contents))
      check(exported[table].length === expected.length && exported[table].every((e) => expected.includes(e.title)), 'export-json-borné', { label })
      check(['films', 'series', 'books', 'games', 'artworks'].filter((k) => k !== table).every((k) => exported[k].length === 0), 'export-autres-collections-vides', { label })
      // L'export laisse le dialogue ouvert pour enchaîner un autre format.
      await page.getByRole('dialog').getByRole('button', { name: 'Fermer', exact: true }).click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      await page.getByRole('button', { name: 'Exporter', exact: true }).click()
      await page.getByRole('button', { name: /^CSV/ }).click()
      const csv = await page.evaluate(() => window.__splitExports.at(-1).args.contents)
      const excluded = (await sql(`SELECT title FROM ${otherTable}`)).map((r) => r.title)
      check(expected.every((t) => csv.includes(t)) && excluded.every((t) => !csv.includes(t)), 'export-csv-borné', { label })
      await page.getByRole('dialog').getByRole('button', { name: 'Fermer', exact: true }).click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      await page.getByRole('button', { name: 'Importer', exact: true }).click()
      check((await page.getByRole('dialog').textContent()).includes(`Importer · ${label}`), 'import-avertissement-partagé', { label })
      await page.keyboard.press('Escape')
      check(await page.getByRole('button', { name: 'Importer', exact: true }).evaluate((b) => b === document.activeElement), 'retour-focus-import', { label })
      await page.getByRole('button', { name: 'Nouvelle vue', exact: true }).click()
      await page.getByRole('textbox', { name: 'Nom de la nouvelle vue', exact: true }).fill(`QA ${label}`)
      await page.getByRole('button', { name: 'Enregistrer la vue', exact: true }).click()
      await settle()
      check(await page.locator('.library-views').getByRole('button', { name: `QA ${label}`, exact: true }).count() === 1, 'vue-enregistrée-propre', { label })
    }
    check(JSON.stringify(await snapshot()) === JSON.stringify(before), 'classement-sans-réécriture-des-fiches', { theme })
    await open('Séries')
    check(await page.locator('.library-views').getByRole('button', { name: 'QA Animation japonaise', exact: true }).count() === 0, 'vues-animation-absentes-séries')
    await open('Animation japonaise')
    check(await page.locator('.library-views').getByRole('button', { name: 'QA Séries', exact: true }).count() === 0, 'vues-séries-absentes-animation')
    await page.getByRole('searchbox').fill('Cowboy')
    await settle()
    check(JSON.stringify(await titles()) === JSON.stringify(['Cowboy Bebop']), 'recherche-animation')
    await open('Séries')
    check(await page.getByRole('searchbox').inputValue() === '', 'recherche-séries-indépendante')
    await open('Animation japonaise', false)
    check(await page.getByRole('searchbox').inputValue() === 'Cowboy', 'recherche-animation-mémorisée')
    await page.getByRole('searchbox').fill('')
    await settle()
    await page.screenshot({ path: `/Users/aurelientrouble/.hermes/profiles/promethee/cache/scratch/sylloge-animation-${theme}.png` })
    await nav('Accueil').click()
    await page.getByRole('tab', { name: 'Animation japonaise', exact: true }).click()
    check(await page.locator('#at-tab-anime').getAttribute('aria-selected') === 'true', 'onglet-animation')
    check((await page.locator('.at-work-title').allTextContents()).every((t) => !['Severance', 'The Bear', 'Monster'].includes(t)), 'accueil-animation-séparé')
    check((await page.locator('.at-stats').textContent()).includes('2 animations vues'), 'bilan-animation-distinct')
    for (const [width, height] of [[1440, 900], [1000, 760]]) {
      await page.setViewportSize({ width, height })
      await settle()
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'accueil-sans-débordement', { theme, width })
    }
    await page.screenshot({ path: `/Users/aurelientrouble/.hermes/profiles/promethee/cache/scratch/sylloge-animation-home-${theme}.png` })
    check((await page.evaluate(() => window.__syllogeRecette.unmocked())).length === 0, 'aucune-commande-inconnue')
  }
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
  await page.locator('.atrium-home').waitFor()
  const beforeMove = (await sql("SELECT * FROM anime WHERE title = 'Arcane'"))[0]
  await open('Animation japonaise')
  await page.getByRole('button', { name: 'Ouvrir la fiche de Arcane', exact: true }).click()
  await page.getByRole('button', { name: 'Modifier', exact: true }).click()
  await page.getByRole('radio', { name: 'Série télé', exact: true }).click()
  await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await page.getByRole('button', { name: 'Retour aux séries', exact: true }).waitFor()
  const afterMove = (await sql("SELECT * FROM series WHERE title = 'Arcane'"))[0]
  const preserved = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !['category', 'updated_at'].includes(k)))
  check(afterMove.category === 'série télé' && JSON.stringify(preserved(beforeMove)) === JSON.stringify(preserved(afterMove)), 'correction-type-préserve-identité-verdict-progression-dates-avis')
  await page.getByRole('button', { name: 'Retour aux séries', exact: true }).click()
  await page.locator('.library-views').getByRole('button', { name: 'Tous', exact: true }).click()
  await settle()
  check((await titles()).includes('Arcane'), 'correction-visible-destination')
  await open('Animation japonaise')
  check(!(await titles()).includes('Arcane'), 'correction-absente-source')
  await page.getByRole('button', { name: 'Ajouter un animé', exact: true }).click()
  await page.getByRole('button', { name: 'Saisir manuellement', exact: true }).click()
  await page.locator('#series-title').fill('Animation créée en recette')
  check(await page.getByRole('radiogroup', { name: 'Type de série', exact: true }).count() === 0, 'création-sans-bascule')
  await page.getByRole('button', { name: 'Ajouter l’animation japonaise', exact: true }).click()
  await page.getByRole('button', { name: 'Retour à l’animation japonaise', exact: true }).waitFor()
  check((await sql("SELECT COUNT(*) AS n FROM anime WHERE title = 'Animation créée en recette'"))[0].n === 1, 'création-manuelle-dans-la-table-anime')
  check((await sql("SELECT COUNT(*) AS n FROM series WHERE title = 'Animation créée en recette'"))[0].n === 0, 'création-manuelle-absente-de-series')
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=empty')
  await page.locator('.atrium-home').waitFor()
  await open('Animation japonaise', false)
  check((await page.locator('main').textContent()).includes('La bibliothèque Animation japonaise est vide.'), 'état-vide-animation')
  check(errors.length === 0, 'aucune-erreur-page-réseau', { errors })
  // L'interception reste active dans la session : on la retire pour ne pas fausser les recettes suivantes
  // (une adresse volontairement introuvable serait servie comme une image).
  await page.unroute('**/*')
  return JSON.stringify({ passed: true, assertions: assertions.length, measurements, errors })
}
