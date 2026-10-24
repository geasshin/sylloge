// Anneau de focus des champs de formulaire (qa-app.html, données synthétiques).
// Défaut d'origine : l'anneau de 2 px dépassait de 1 px à l'extérieur du champ ; le conteneur défilant
// d'une fenêtre rognait ce débord (haut et gauche à 1 px, bas et droite à 2 px) et le contour avait l'air de
// travers. Garde : les quatre côtés mesurent la même épaisseur, sur les pixels réellement rendus, et la
// boîte du champ ne bouge pas au focus. Le titre « en lecture » ne décale plus son texte.
async page => {
  page.setDefaultTimeout(8000)
  const checks = []
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  // La mesure compte des pixels sombres sur fond clair : on part toujours du thème clair, quel que soit
  // l'état laissé par une autre recette (thème mémorisé).
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.evaluate(() => localStorage.removeItem('sylloge-theme'))
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  assert(await page.evaluate(() => (document.documentElement.dataset.theme || '') !== 'dark'), 'Départ en thème clair')
  await page.locator('nav').getByRole('button', { name: 'Films', exact: true }).click()
  await page.getByRole('button', { name: 'Ajouter un film', exact: true }).first().click()

  const box = locator => locator.evaluate(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(n => Math.round(n * 10) / 10) })

  // Épaisseur de trait sombre, côté par côté, mesurée sur la capture (échelle 1).
  const edges = async locator => {
    const [x, y, w, h] = await box(locator)
    const pad = 6
    const clip = { x: Math.max(0, x - pad), y: Math.max(0, y - pad), width: w + pad * 2, height: h + pad * 2 }
    const png = (await page.screenshot({ clip })).toString('base64')
    return page.evaluate(async ({ png, clip, x, y, w, h }) => {
      const image = new Image()
      image.src = 'data:image/png;base64,' + png
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width; canvas.height = image.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.drawImage(image, 0, 0)
      const scale = image.width / clip.width
      const dark = (px, py) => { const d = context.getImageData(Math.round(px * scale), Math.round(py * scale), 1, 1).data; return (d[0] + d[1] + d[2]) / 3 < 110 }
      const run = (points) => points.filter(([px, py]) => dark(px, py)).length
      const ox = x - clip.x, oy = y - clip.y
      const midX = ox + w / 2, midY = oy + h / 2
      const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
      return {
        haut: run(range(-5, 5).map(d => [midX, oy + d])),
        bas: run(range(-5, 5).map(d => [midX, oy + h - 1 + d])),
        gauche: run(range(-5, 5).map(d => [ox + d, midY])),
        droite: run(range(-5, 5).map(d => [ox + w - 1 + d, midY])),
      }
    }, { png, clip, x, y, w, h })
  }
  const settle = () => page.waitForTimeout(260)

  // ── 1. Champ de recherche de la fenêtre « Rechercher un film » ─────────────────────────────────
  const search = page.getByPlaceholder('Rechercher dans TMDB…')
  await search.waitFor()
  await settle()
  const searchEdges = await edges(search)
  assert(Object.values(searchEdges).every(n => n === 2), `Recherche TMDB : 2 px sur les quatre côtés (${JSON.stringify(searchEdges)})`)

  await page.getByRole('button', { name: 'Saisir manuellement', exact: true }).click()
  await page.getByText('Terminé', { exact: true }).first().click()
  await page.locator('.field-title input').waitFor()

  // ── 2. Titre et avis : épaisseur égale, boîte immobile ────────────────────────────────────────
  for (const [name, locator] of [['Titre', page.locator('.field-title input')], ['Avis', page.locator('textarea[aria-label="Critique personnelle"]')]]) {
    await page.locator('.form-poster-frame').first().click()
    await settle()
    const before = await box(locator)
    await locator.click()
    await settle()
    const after = await box(locator)
    assert(JSON.stringify(before) === JSON.stringify(after), `${name} : la boîte ne bouge pas au focus (${before} → ${after})`)
    const sides = await edges(locator)
    assert(Object.values(sides).every(n => n === 2), `${name} : 2 px sur les quatre côtés (${JSON.stringify(sides)})`)
    const shadow = await locator.evaluate(el => getComputedStyle(el).boxShadow)
    assert(/inset/.test(shadow), `${name} : l'anneau est dessiné dans la boîte (${shadow})`)
  }

  // ── 3. Titre « en lecture » (après une aide TMDB) : le texte ne saute plus au focus ─────────────
  const title = page.locator('.field-title input')
  const normalBox = await box(title)
  await page.locator('.field-title').first().evaluate(el => el.classList.add('field-title-read'))
  await page.locator('.form-poster-frame').first().click()
  await settle()
  const restBox = await box(title)
  const restPad = await title.evaluate(el => getComputedStyle(el).paddingLeft)
  await title.click()
  await settle()
  const focusBox = await box(title)
  const focusPad = await title.evaluate(el => getComputedStyle(el).paddingLeft)
  assert(JSON.stringify(restBox) === JSON.stringify(focusBox) && restPad === focusPad, `Titre en lecture : ni boîte ni marge intérieure ne changent (${restBox} / ${restPad} → ${focusBox} / ${focusPad})`)
  assert(JSON.stringify(normalBox) === JSON.stringify(focusBox), `Titre en lecture : même emprise que le champ ordinaire, sans débord à rogner (${normalBox} = ${focusBox})`)
  const sides = await edges(title)
  assert(Object.values(sides).every(n => n === 2), `Titre en lecture : 2 px sur les quatre côtés (${JSON.stringify(sides)})`)

  return JSON.stringify({ ok: true, checks: checks.length, list: checks })
}
