// Art éditorial (27 octobre 2026) : grille aux formats des images, champs propres à chaque forme,
// poème, liste déroulante des catégories. Aucun réseau : les visuels sont servis par la recette, aux
// formats annoncés dans leur adresse (…/largeur/hauteur). Ouvrir la session playwright-cli depuis le
// dossier scratch.
async page => {
  page.setDefaultTimeout(12000)
  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }

  // picsum.photos/seed/<graine>/<l>/<h> : une image SVG au même format, sans dépendre du réseau.
  await page.route('https://picsum.photos/**', route => {
    const [width, height] = route.request().url().split('/').slice(-2).map(Number)
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'cache-control': 'no-store' },
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="hsl(${(width + height) % 360} 25% 45%)"/></svg>`,
    })
  })

  const nav = () => page.getByRole('navigation').first()
  const sql = (query, values = []) => page.evaluate(([q, v]) => window.__syllogeRecette.select(q, v), [query, values])
  const settle = async () => {
    await page.mouse.move(900, 500)
    await page.locator('.sidebar-expanded').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(350)
  }
  const openArt = async (label = 'Art') => {
    const box = await nav().boundingBox()
    if (box) await page.mouse.move(box.x + Math.min(24, box.width / 2), box.y + Math.min(160, box.height / 3))
    await page.waitForTimeout(350)
    await nav().locator(`button[aria-label="${label}"]:visible`).first().click()
    await page.getByRole('heading', { level: 1, name: label }).waitFor()
    await settle()
    await page.waitForFunction(() => [...document.querySelectorAll('.artwork-grid img')].every(img => img.complete))
    await page.waitForTimeout(300)
  }
  const grid = () => page.evaluate(() => {
    const cards = [...document.querySelectorAll('.artwork-grid > .artwork-card')]
    const rows = new Map()
    const container = document.querySelector('.artwork-grid').getBoundingClientRect()
    for (const card of cards) {
      const box = card.getBoundingClientRect()
      const poster = card.querySelector('.poster').getBoundingClientRect()
      const img = card.querySelector('img')
      const key = Math.round(box.top)
      if (!rows.has(key)) rows.set(key, [])
      rows.get(key).push({
        title: card.querySelector('.film-card-top b')?.textContent,
        left: box.left, right: box.right, height: poster.height, ratio: poster.width / poster.height,
        natural: img && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null,
        clipped: (() => { const small = card.querySelector('.film-card-info small'); return small ? small.scrollHeight > small.clientHeight + 1 : false })(),
      })
    }
    return { rows: [...rows.values()], containerLeft: container.left, containerRight: container.right, overflow: document.documentElement.scrollWidth - innerWidth }
  })
  const openCard = async title => {
    await page.locator('.artwork-grid .film-card-top b', { hasText: title }).first().click()
    await page.locator('.detail-poster').first().waitFor()
    await page.waitForTimeout(300)
  }
  const openForm = async () => {
    await page.locator('.library-header-actions .primary-button').click()
    await page.locator('#artwork-title').waitFor()
    await page.waitForTimeout(300)
  }
  const chooseForm = async label => {
    await page.locator('#artwork-form').click()
    await page.getByRole('listbox').waitFor()
    await page.getByRole('option', { name: new RegExp(`^${label}`) }).click()
    await page.getByRole('listbox').waitFor({ state: 'detached' })
  }
  const formLabels = () => page.evaluate(() => [...document.querySelectorAll('.form-medium-artwork .secondary-fields label')].map(label => label.textContent))

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.evaluate(() => ['sylloge-theme', 'sylloge-sidebar-pinned', 'sylloge-language', 'sylloge-art-ratios'].forEach(key => localStorage.removeItem(key)))
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()

  try {
    // ── 1. Grille éditoriale : chaque visuel au format de son image, rangées justifiées ─────────────
    for (const [width, height] of [[1440, 900], [1000, 760]]) {
      await page.setViewportSize({ width, height })
      await openArt()
      const measured = await grid()
      assert(measured.overflow <= 0, `${width} px : aucun débordement horizontal`)
      for (const row of measured.rows) {
        const heights = row.map(card => card.height)
        assert(Math.max(...heights) - Math.min(...heights) <= 1, `${width} px : visuels d’une rangée à la même hauteur (${heights.map(Math.round).join(', ')})`)
      }
      for (const row of measured.rows.slice(0, -1)) {
        assert(Math.abs(row[0].left - measured.containerLeft) <= 1 && Math.abs(row.at(-1).right - measured.containerRight) <= 1.5, `${width} px : une rangée pleine occupe toute la largeur`)
      }
      const last = measured.rows.at(-1)
      assert(last.at(-1).right <= measured.containerRight + 1, `${width} px : la dernière rangée ne déborde pas`)
      const withImage = measured.rows.flat().filter(card => card.natural)
      assert(withImage.length === 5, `${width} px : cinq visuels chargés`)
      for (const card of withImage) {
        const expected = Math.min(2.2, Math.max(0.75, card.natural))
        assert(Math.abs(card.ratio - expected) < 0.02, `${width} px : « ${card.title} » au format de son image (${card.ratio.toFixed(2)} pour ${card.natural.toFixed(2)})`)
      }
      const widths = withImage.map(card => card.ratio)
      assert(Math.max(...widths) / Math.min(...widths) > 2, `${width} px : les cartes n’ont plus toutes le même format`)
      assert(measured.rows.flat().every(card => !card.clipped), `${width} px : aucune signature coupée sous une carte`)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await openArt()
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sylloge-art-ratios') ?? '[]').length)
    assert(stored === 5, 'Les formats mesurés sont gardés sur l’appareil (cinq adresses)')
    const poemPage = page.locator('.artwork-grid .artwork-card', { hasText: 'Le Pont Mirabeau' }).locator('.artwork-poem-page-text')
    assert((await poemPage.innerText()).startsWith('Sous le pont Mirabeau coule la Seine'), 'Un poème sans visuel montre ses premiers vers')
    const placeholder = page.locator('.artwork-grid .artwork-card', { hasText: 'Le Penseur' }).locator('.artwork-visual-empty svg')
    assert(await placeholder.count() === 1, 'Une œuvre sans visuel montre le pictogramme de sa forme')

    // ── 2. Liste des catégories : tuiles, pictogrammes, descriptions, clavier en deux colonnes ──────
    await openForm()
    const trigger = page.locator('#artwork-form')
    assert(await trigger.getAttribute('data-value') === 'autre', 'Une nouvelle œuvre commence en « Autre »')
    await trigger.click()
    const listbox = page.getByRole('listbox')
    await listbox.waitFor()
    assert(await listbox.getByRole('option').count() === 9, 'Les neuf formes d’art sont proposées')
    assert(await listbox.locator('.select-option-icon svg').count() === 9, 'Chaque forme a son pictogramme')
    assert((await listbox.getByRole('option', { name: /^Poésie/ }).innerText()).includes('Le texte, le recueil, la traduction'), 'Chaque forme a sa description')
    const columns = await listbox.evaluate(list => new Set([...list.children].map(option => Math.round(option.getBoundingClientRect().left))).size)
    assert(columns === 2, 'La liste est présentée sur deux colonnes')
    const box = await listbox.boundingBox()
    assert(box.y >= 0 && box.y + box.height <= 900 && box.x >= 0 && box.x + box.width <= 1440, 'La liste reste dans la fenêtre')
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowDown')
    assert((await listbox.locator('.select-option.is-active .select-option-label').innerText()) === 'Photographie', 'Flèche bas : rangée suivante (deux options plus loin)')
    await page.keyboard.press('ArrowRight')
    assert((await listbox.locator('.select-option.is-active .select-option-label').innerText()) === 'Dessin', 'Flèche droite : option suivante')
    await page.keyboard.press('Escape')
    await listbox.waitFor({ state: 'detached' })
    assert(await page.evaluate(() => document.activeElement?.id) === 'artwork-form', 'Échap ferme la liste seule et rend le focus au bouton')
    assert(await page.getByRole('dialog').count() === 1, 'La fenêtre d’ajout reste ouverte après Échap dans la liste')

    // ── 3. Poésie : texte, recueil, traduction ; ni lieu ni exposition ─────────────────────────────
    await page.locator('#artwork-title').fill('Demain, dès l’aube')
    await chooseForm('Poésie')
    assert(JSON.stringify(await formLabels()) === JSON.stringify(['Catégorie', 'Année', 'Poète', 'Recueil', 'Traduction', 'Poème']), 'Poésie : Poète, Recueil, Traduction, Poème — sans Lieu ni Exposition')
    const poem = 'Demain, dès l’aube, à l’heure où blanchit la campagne,\n    Je partirai. Vois-tu, je sais que tu m’attends.\n\nJ’irai par la forêt, j’irai par la montagne.'
    await page.locator('#artwork-artist').fill('Victor Hugo')
    await page.locator('#artwork-detail-collection').fill('Les Contemplations')
    await page.locator('#artwork-detail-text').fill(poem)
    // Changer de forme ne perd rien : le poème reste visible et éditable en Peinture.
    await chooseForm('Peinture')
    const paintingLabels = await formLabels()
    assert(['Technique', 'Dimensions', 'Mouvement', 'Recueil', 'Poème', 'Lieu', 'Exposition'].every(label => paintingLabels.includes(label)), 'Peinture : ses champs, plus le recueil et le poème déjà saisis, plus Lieu et Exposition')
    assert(await page.locator('#artwork-detail-text').inputValue() === poem, 'Le poème saisi survit au changement de forme')
    await chooseForm('Poésie')
    assert(!(await formLabels()).includes('Lieu'), 'Retour en Poésie : Lieu et Exposition disparaissent de nouveau (vides)')
    await page.getByRole('button', { name: 'Ajouter l’œuvre' }).click()
    await page.locator('.detail-poster').first().waitFor()
    await page.waitForTimeout(300)
    const [row] = await sql("SELECT form, artist, details FROM artworks WHERE title = 'Demain, dès l’aube'")
    assert(row?.form === 'poésie' && row.artist === 'Victor Hugo', 'L’œuvre est enregistrée en Poésie')
    assert(JSON.stringify(JSON.parse(row.details)) === JSON.stringify({ collection: 'Les Contemplations', text: poem }), 'Le poème et le recueil sont enregistrés dans details, vers et retraits compris')

    // ── 4. Fiche : faits de la forme et poème en entier ────────────────────────────────────────────
    const facts = await page.locator('.detail-facts').innerText()
    // Depuis le 30 octobre 2026, l'artiste et l'année sont la ligne centrée
    // sous le titre ; le cartel garde les champs de la forme.
    const artHeading = await page.locator('.detail-art-head').innerText()
    assert(artHeading.includes('Victor Hugo'), 'La fiche nomme le poète')
    assert(facts.includes('Les Contemplations'), 'La fiche montre le recueil')
    const fullPoem = await page.locator('.artwork-poem-text').innerText()
    assert(fullPoem === poem, 'La fiche montre le poème entier, vers et strophes conservés')
    assert(await page.locator('.detail-poster .poster-edit-overlay').count() === 1, 'Le crayon du visuel reste disponible sur la page du poème')
    const searchable = await sql("SELECT COUNT(*) AS n FROM artworks WHERE EXISTS (SELECT 1 FROM json_each(artworks.details) WHERE CAST(json_each.value AS TEXT) LIKE '%blanchit%')")
    assert(Number(searchable[0].n) === 1, 'Le texte du poème est lisible par la recherche SQL')
    await page.locator('.back-button').first().click()
    await page.getByRole('heading', { level: 1, name: 'Art' }).waitFor()
    await settle()
    await page.locator('.library-tools input[type="search"]').fill('blanchit')
    await page.waitForTimeout(600)
    const found = await page.locator('.artwork-grid .film-card-top b').allInnerTexts()
    assert(found.length === 1 && found[0] === 'Demain, dès l’aube', 'La recherche de la bibliothèque trouve un vers du poème')
    await page.locator('.library-tools input[type="search"]').fill('')
    await page.waitForTimeout(400)

    // ── 5. Une œuvre existante : ses champs propres, et Lieu gardé quand il porte une valeur ────────
    await openCard('Les Nymphéas')
    await page.getByRole('button', { name: 'Modifier', exact: true }).first().click()
    await page.locator('#artwork-detail-technique').waitFor()
    assert(await page.locator('#artwork-detail-technique').inputValue() === 'Huile sur toile', 'Peinture : la technique enregistrée est relue')
    await chooseForm('Poésie')
    assert(await page.locator('#artwork-location').inputValue() === 'Musée de l’Orangerie, Paris', 'Un lieu déjà saisi reste visible et éditable en Poésie')
    await page.getByRole('button', { name: 'Annuler', exact: true }).click()
    await page.waitForTimeout(400)

    // ── 6. Anglais : libellés, descriptions et exemples traduits ───────────────────────────────────
    await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=en')
    await page.getByRole('heading', { level: 1 }).first().waitFor()
    await openArt()
    await openForm()
    await page.locator('#artwork-form').click()
    assert((await page.getByRole('option', { name: /^Painting/ }).innerText()).includes('Oil, acrylic, watercolour…'), 'Anglais : la description de la forme est traduite')
    await page.getByRole('option', { name: /^Poetry/ }).click()
    const english = await formLabels()
    assert(['Poet', 'Collection', 'Translation', 'Poem'].every(label => english.includes(label)), 'Anglais : Poet, Collection, Translation, Poem')
    assert(await page.locator('#artwork-detail-translator').getAttribute('placeholder') === 'Translated by…', 'Anglais : l’exemple de saisie est traduit')
    await page.keyboard.press('Escape')

    await page.unroute('https://picsum.photos/**')
    assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  } catch (error) {
    await page.unroute('https://picsum.photos/**').catch(() => {})
    await page.screenshot({ path: '/Users/aurelientrouble/.hermes/profiles/promethee/cache/scratch/qa/art-editorial-fail.png' }).catch(() => {})
    return JSON.stringify({ ok: false, error: String(error).slice(0, 240), checks })
  }
  return JSON.stringify({ ok: true, checks: checks.length, list: checks })
}
