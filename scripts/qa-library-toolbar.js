async (page) => {
  page.setDefaultTimeout(4500)
  const measurements = []
  const assertions = []
  const errors = []
  const unexpectedRequests = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (request.url().startsWith('http://127.0.0.1:5173/')) return route.continue()
    if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#4b5460"/><path d="M0 420L280 70L400 310V600H0" fill="#78838f"/><circle cx="90" cy="120" r="38" fill="#d7dce1"/></svg>' })
    unexpectedRequests.push(request.url())
    return route.abort()
  })
  const assert = (condition, name, context) => {
    assertions.push({ name, ...context, passed: Boolean(condition) })
  }
  const settle = async () => {
    await page.waitForFunction(() => !document.querySelector('.results-state[role="status"]'))
    await page.waitForTimeout(220)
  }
  const libraries = [['Films', 'films'], ['Séries', 'series'], ['Animation japonaise', 'series'], ['Livres', 'books'], ['Mangas', 'books'], ['Jeux', 'games'], ['Art', 'artworks']]
  for (const theme of ['light', 'dark']) {
    await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
    await page.locator('.atrium-home').waitFor()
    await page.evaluate((theme) => localStorage.setItem('sylloge-theme', theme), theme)
    await page.reload()
    await page.locator('.atrium-home').waitFor()
    const palette = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, canvas: getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim().toLowerCase(), surface: getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim().toLowerCase() }))
    assert(palette.theme === theme && palette.canvas === (theme === 'light' ? '#f6f6f7' : '#161618') && palette.surface === (theme === 'light' ? '#ffffff' : '#232326'), 'palette-réellement-appliquée', { theme, palette })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const [library, medium] of libraries) {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.locator(`.sidebar nav button[aria-label="${library}"]`).click()
      await page.locator('.library-header h1').filter({ hasText: new RegExp(`^${library}$`) }).waitFor()
      await settle()
      // Plusieurs vues sont réellement créées : on ne mesure pas une barre vide.
      for (let index = 0; index < 4; index++) {
        await page.getByRole('button', { name: 'Nouvelle vue', exact: true }).click()
        await page.getByRole('textbox', { name: 'Nom de la nouvelle vue', exact: true }).fill(`QA ${library[0]} ${index}`)
        await page.getByRole('button', { name: 'Enregistrer la vue', exact: true }).click()
        await settle()
      }
      for (const dirty of [false, true]) {
        if (dirty) {
          await page.getByRole('button', { name: /^Filtrer/ }).click()
          await page.waitForTimeout(220)
          await page.locator(`#${medium}-f-status`).click()
          const list = page.getByRole('listbox')
          await page.waitForTimeout(180)
          const alignment = await page.locator(`#${medium}-f-status`).evaluate((trigger) => {
            const list = document.querySelector('[role="listbox"]')
            const a = trigger.getBoundingClientRect()
            const b = list.getBoundingClientRect()
            return { gap: b.top - a.bottom, inside: b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, transition: getComputedStyle(list).transitionDuration }
          })
          assert(alignment.inside && Math.abs(alignment.gap - 4) <= 1 && alignment.transition === '0s', 'liste-ancrée-au-champ-et-dans-la-fenêtre-en-mouvement-réduit', { library, theme, alignment })
          await list.getByRole('option').nth(1).click()
          await page.getByRole('checkbox', { name: 'Coups de cœur uniquement', exact: true }).check()
          await page.getByRole('button', { name: 'Fermer', exact: true }).click()
          await page.getByRole('button', { name: /^Trier,/ }).click()
          const longest = await page.getByRole('menuitemradio').evaluateAll((items) => {
            const widths = items.map((item, index) => {
              const label = item.querySelector('.view-bar-menu-label')
              const range = document.createRange()
              range.selectNodeContents(label)
              return { index, label: label.textContent, width: range.getBoundingClientRect().width }
            })
            return widths.sort((a, b) => b.width - a.width)[0]
          })
          await page.getByRole('menuitemradio').nth(longest.index).click()
          await page.keyboard.press('Escape')
          await settle()
          assert(await page.locator('.view-bar-pending').count() === 1 && await page.getByRole('button', { name: /^Mettre à jour la vue/ }).count() === 1 && await page.locator('.view-bar-badge').count() === 1, 'pire-état-réellement-affiché', { library, theme, longestSort: longest.label })
        }
        for (const [width, height] of [[1440, 900], [1000, 760]]) {
          await page.setViewportSize({ width, height })
          for (const sidebar of ['rail', 'menu']) {
            const toggle = page.locator('.sidebar-toggle')
            const expanded = await toggle.getAttribute('aria-pressed') === 'true'
            if (expanded !== (sidebar === 'menu')) await toggle.click()
            await settle()
            await page.evaluate(() => window.scrollTo(0, 0))
            const metrics = await page.evaluate(() => {
              const box = (element) => {
                const b = element.getBoundingClientRect()
                return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }
              }
              const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1
              const tools = document.querySelector('.library-tools')
              const toolBox = box(tools)
              const viewBar = box(document.querySelector('.view-bar'))
              const scroller = document.querySelector('.view-bar-scroller')
              const scrollerBox = box(scroller)
              const active = document.querySelector('.view-pill-group.on') ?? document.querySelector('.view-pill.on')
              const activeBox = box(active)
              const newButton = document.querySelector('.view-bar-new')
              const actions = [...document.querySelectorAll('.library-header-actions button, .view-bar-actions button, .view-bar-new')].filter((el) => el.checkVisibility())
              const toolRows = new Set([...tools.children].map((element) => Math.round(box(element).top)))
              const barRows = new Set([...document.querySelector('.view-bar').children].filter((el) => el.matches('.view-bar-views, .view-bar-actions')).map((el) => Math.round(box(el).top)))
              return {
                scrollY, toolWidth: toolBox.width, toolRows: toolRows.size, viewBarRows: barRows.size,
                scrollerWidth: scrollerBox.width, activeWidth: activeBox.width, activeContained: inside(activeBox, scrollerBox),
                newOutsideScroller: !scroller.contains(newButton), newVisible: inside(box(newButton), toolBox) && box(newButton).right <= innerWidth,
                actionsIntact: actions.every((element) => { const b = box(element); const range = document.createRange(); range.selectNodeContents(element); return b.left >= 0 && b.right <= innerWidth + 1 && range.getBoundingClientRect().width <= b.width + 1 && element.clientHeight >= 28 }),
                actionsWithinBar: [...document.querySelectorAll('.view-bar-actions button')].every((el) => inside(box(el), viewBar)),
                pageOverflow: document.documentElement.scrollWidth - innerWidth,
                toolsOverflow: tools.scrollWidth - tools.clientWidth,
                searchRadius: getComputedStyle(document.querySelector('.library-tools > .search')).borderRadius,
                headerLabels: [...document.querySelectorAll('.library-header-actions > button, .library-header-actions > span > button')].map((el) => el.textContent.trim()),
                singleRovingStop: document.querySelectorAll('.library-views button[tabindex="0"]').length === 1,
              }
            })
            const context = { library, theme, width, height, sidebar, dirty }
            measurements.push({ ...context, ...metrics })
            assert(metrics.scrollerWidth >= 179.5, 'vues-au-moins-180px', { ...context, actual: metrics.scrollerWidth })
            assert(metrics.newOutsideScroller && metrics.newVisible, 'nouvelle-vue-hors-scroller-et-entière', context)
            assert(metrics.pageOverflow <= 1 && metrics.toolsOverflow <= 1, 'aucun-débordement-horizontal', { ...context, page: metrics.pageOverflow, tools: metrics.toolsOverflow })
            assert(metrics.actionsIntact && metrics.actionsWithinBar, 'actions-intactes-et-dans-la-barre', context)
            assert(metrics.activeContained || metrics.activeWidth > metrics.scrollerWidth, 'vue-active-visible-quand-elle-tient', { ...context, active: metrics.activeWidth, available: metrics.scrollerWidth })
            assert(metrics.singleRovingStop, 'un-seul-arrêt-de-tabulation-des-vues', context)
            if (width === 1440 && sidebar === 'rail') assert(metrics.toolRows === 1 && metrics.viewBarRows === 1, 'une-ligne-à-1440-rail', { ...context, toolRows: metrics.toolRows, barRows: metrics.viewBarRows })
            const addLabel = { Films: 'Ajouter un film', Séries: 'Ajouter une série', 'Animation japonaise': 'Ajouter une animation japonaise', Livres: 'Ajouter un livre', Mangas: 'Ajouter un manga', Jeux: 'Ajouter un jeu', Art: 'Ajouter une œuvre' }[library]
            assert(metrics.headerLabels.join('|') === `${library === 'Art' ? '' : 'Tout associer|'}Importer|Exporter|${addLabel}`, 'ordre-des-actions-en-tête', { ...context, labels: metrics.headerLabels })
          }
        }
      }
      // Une vue modifiée se réinitialise réellement, sans laisser de filtre caché.
      await page.getByRole('button', { name: /^Réinitialiser la vue/ }).click()
      await settle()
      assert(await page.locator('.view-bar-pending').count() === 0 && await page.locator('.view-bar-badge').count() === 0, 'réinitialisation-complète-de-la-vue-sale', { library, theme })
    }
    assert((await page.evaluate(() => window.__syllogeRecette.unmocked())).length === 0, 'aucune-commande-native-non-simulée', { theme })
  }
  assert(errors.length === 0, 'aucune-erreur-console-ou-page', { errors })
  assert(unexpectedRequests.length === 0, 'aucune-requête-externe-non-simulée', { unexpectedRequests })
  const failures = assertions.filter((assertion) => !assertion.passed)
  return JSON.stringify({ passed: failures.length === 0, cases: measurements.length, assertions: assertions.length, failures, errors, unexpectedRequests, measurements })
}
