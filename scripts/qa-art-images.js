// Visuels de l'Art : la recherche d'images libres depuis le dialogue de visuel.
// Aucun réseau : la requête de Commons et les vignettes sont servies par la recette, ce qui permet de
// vérifier le filtrage, le tri, la licence affichée, la pose de l'adresse, l'enregistrement et le repli
// quand rien ne sort. Ouvrir la session playwright-cli depuis le dossier scratch.
async page => {
  page.setDefaultTimeout(12000)
  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }

  const svg = (hue) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520"><rect width="800" height="520" fill="hsl(${hue} 30% 40%)"/></svg>`
  const thumb = name => `https://upload.wikimedia.org/wikipedia/commons/thumb/${name}/800px-${name}`
  const image = (name, license) => ({
    url: `https://upload.wikimedia.org/wikipedia/commons/${name}`,
    thumburl: thumb(name),
    descriptionurl: `https://commons.wikimedia.org/wiki/File:${name}`,
    mime: 'image/jpeg',
    width: 2400,
    height: 1600,
    extmetadata: license ? { LicenseShortName: { value: license } } : {},
  })
  const NIGHTHAWKS = 'Edward Hopper - Nighthawks.jpg'
  const MALICE = 'La nuit tombe sur le diner.jpg'
  const ANONYME = 'Tableau sans auteur connu.jpg'
  const withResults = {
    query: {
      pages: [
        { title: `File:${MALICE}`, imageinfo: [image(MALICE, 'CC BY-SA 4.0')] },
        { title: 'File:Plan de la salle.svg', imageinfo: [{ ...image('plan.svg', 'CC0'), mime: 'image/svg+xml' }] },
        { title: `File:${NIGHTHAWKS}`, imageinfo: [image(NIGHTHAWKS, 'Public domain')] },
        { title: 'File:Vignette trop petite.jpg', imageinfo: [{ ...image('petite.jpg', 'CC0'), width: 180, height: 120 }] },
        { title: `File:${ANONYME}`, imageinfo: [image(ANONYME, null)] },
      ],
    },
  }
  const empty = { query: { pages: [] } }

  let commonsReply = withResults
  let commonsCalls = 0
  await page.route('https://commons.wikimedia.org/**', route => {
    commonsCalls += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
      body: JSON.stringify(commonsReply),
    })
  })
  await page.route('https://upload.wikimedia.org/**', route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    body: svg(route.request().url().length % 360),
  }))

  // Le nom de la barre change avec la langue (« Navigation principale » / « Main navigation ») : on
  // prend la première navigation, celle des bibliothèques.
  const nav = () => page.getByRole('navigation').first()
  const sql = (query, values = []) => page.evaluate(([q, v]) => window.__syllogeRecette.select(q, v), [query, values])
  const settle = async () => {
    await page.mouse.move(900, 500)
    await page.locator('.sidebar-expanded').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(350)
  }
  const openLibrary = async library => {
    // La barre se replie en un rail sans libellés dès que la souris la quitte : on la survole pour la
    // déplier, puis on clique le bouton de la bibliothèque par son libellé accessible.
    const box = await nav().boundingBox()
    if (box) await page.mouse.move(box.x + Math.min(24, box.width / 2), box.y + Math.min(160, box.height / 3))
    await page.waitForTimeout(350)
    const spaced = nav().locator(`button[aria-label="${library}"]:visible`).first()
    if (await spaced.count() > 0) await spaced.click()
    else await page.getByRole('button', { name: library, exact: true }).first().click()
    await page.getByRole('heading', { level: 1, name: library }).waitFor()
    await settle()
    await page.getByRole('button', { name: 'Tous', exact: true }).first().click().catch(() => {})
    await page.waitForTimeout(350)
  }
  const card = async (title, selector = '.artwork-grid .film-card') => {
    const index = await page.evaluate(([grid, value]) => {
      const cards = [...document.querySelectorAll(grid)]
      return cards.findIndex(node => node.querySelector('.film-card-top b')?.textContent === value)
    }, [selector, title])
    if (index < 0) throw Error(`Carte « ${title} » absente`)
    return page.locator(selector).nth(index)
  }
  const openPoster = async (title, selector, dialogName = /^Modifier (l’affiche|la couverture|le visuel)/) => {
    await (await card(title, selector)).click()
    await page.locator('.detail-poster').first().waitFor()
    await page.waitForTimeout(400)
    await page.locator('.detail-poster .poster-edit-overlay').click()
    const dialog = page.getByRole('dialog', { name: dialogName })
    await dialog.waitFor()
    return dialog
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.evaluate(() => ['sylloge-theme', 'sylloge-sidebar-pinned', 'sylloge-language'].forEach(key => localStorage.removeItem(key)))
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()

  try {
    // ── 1. L'Art propose des images, filtrées et triées, avec leur licence ──────────────────────────
    await openLibrary('Art')
    const dialog = await openPoster('Nighthawks')
    const suggest = dialog.getByRole('button', { name: 'Proposer des images', exact: true })
    assert(await suggest.count() === 1, 'Le dialogue de visuel de l’Art offre « Proposer des images »')
    await suggest.click()
    const grid = dialog.locator('.poster-suggest-grid')
    await grid.waitFor()
    const cells = grid.locator('button')
    await cells.first().waitFor()
    assert(await cells.count() === 3, `Trois images utilisables sur les cinq reçues (${await cells.count()})`)
    assert(commonsCalls === 1, 'Une seule requête à Commons')
    const asked = await page.evaluate(() => window.__syllogeRecette.searchedArtworks())
    assert(JSON.stringify(asked) === JSON.stringify(['Nighthawks · Edward Hopper']), `La requête porte le titre et l’artiste : ${JSON.stringify(asked)}`)
    const labels = await cells.allInnerTexts()
    assert(JSON.stringify(labels) === JSON.stringify(['Public domain', 'CC BY-SA 4.0', 'Licence inconnue']), `Licences affichées, l’inconnue nommée : ${JSON.stringify(labels)}`)
    assert(await cells.nth(0).getAttribute('title') === NIGHTHAWKS, 'L’œuvre dont le nom porte l’artiste passe devant')

    // ── 2. Un clic pose l'adresse dans le champ, sans enregistrer ───────────────────────────────────
    const before = await sql('SELECT image_url AS value FROM artworks WHERE title = $1', ['Nighthawks'])
    await cells.nth(1).click()
    const field = dialog.getByLabel('Adresse de l’image')
    assert((await field.inputValue()) === thumb(MALICE), 'Le clic pose l’adresse de la vignette de 800 px')
    assert(await cells.nth(1).getAttribute('aria-pressed') === 'true', 'La proposition choisie est marquée')
    assert(JSON.stringify(await sql('SELECT image_url AS value FROM artworks WHERE title = $1', ['Nighthawks'])) === JSON.stringify(before), 'Rien n’est enregistré avant « Enregistrer »')

    // ── 3. Enregistrer écrit l'adresse dans la fiche et la grille la montre ─────────────────────────
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page.waitForTimeout(400)
    const stored = await sql('SELECT image_url AS value FROM artworks WHERE title = $1', ['Nighthawks'])
    assert(stored[0]?.value === thumb(MALICE), 'L’adresse de la vignette est écrite dans artworks.image_url')
    await page.locator('.detail-action-bar .back-button').first().click()
    await page.locator('.artwork-grid').waitFor()
    await page.waitForTimeout(400)
    assert(await (await card('Nighthawks')).locator('img').getAttribute('src') === thumb(MALICE), 'La grille de l’Art montre le visuel choisi')

    // ── 4. Aucun résultat : le dialogue le dit et laisse l'adresse libre ────────────────────────────
    commonsReply = empty
    const second = await openPoster('Nighthawks')
    await second.getByRole('button', { name: 'Proposer des images', exact: true }).click()
    await second.getByText('Aucune image trouvée. Vous pouvez coller une adresse.').waitFor()
    assert(await second.locator('.poster-suggest-grid').count() === 0, 'Aucune grille quand rien ne sort')
    await second.getByLabel('Adresse de l’image').fill('https://exemple.test/collee-a-la-main.jpg')
    assert(await second.getByRole('button', { name: 'Enregistrer', exact: true }).isEnabled(), 'Le champ reste utilisable')
    await second.getByRole('button', { name: 'Fermer', exact: true }).click().catch(async () => { await page.keyboard.press('Escape') })
    await second.waitFor({ state: 'hidden' })

    // ── 5. Une autre bibliothèque garde le dialogue d'adresse seul ──────────────────────────────────
    await openLibrary('Livres')
    const bookDialog = await openPoster('L’Anomalie', '.film-grid .film-card', /^Modifier la couverture/)
    assert(await bookDialog.getByRole('button', { name: 'Proposer des images', exact: true }).count() === 0, 'Un livre n’a pas la recherche d’images de l’Art')
    await page.keyboard.press('Escape')
    await bookDialog.waitFor({ state: 'hidden' })

    // ── 6. Anglais ──────────────────────────────────────────────────────────────────────────────────
    await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=en')
    await page.getByRole('heading', { level: 1 }).first().waitFor()
    await openLibrary('Art')
    // La recherche précédente n'avait rien trouvé : on remet une réponse garnie pour l'anglais.
    commonsReply = withResults
    const english = await openPoster('Nighthawks', '.artwork-grid .film-card', /^(Modifier|Edit)/)
    assert(await english.getByRole('button', { name: 'Suggest images', exact: true }).count() === 1, 'Anglais : « Suggest images »')
    await english.getByRole('button', { name: 'Suggest images', exact: true }).click()
    await english.locator('.poster-suggest-grid').waitFor()
    assert((await english.innerText()).includes('Free images from Wikimedia Commons'), 'Anglais : l’aide est traduite')
    await page.keyboard.press('Escape')
    await english.waitFor({ state: 'hidden' })

    await page.unroute('https://commons.wikimedia.org/**')
    await page.unroute('https://upload.wikimedia.org/**')
    assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)

  } catch (error) {
    await page.screenshot({ path: '/Users/aurelientrouble/.hermes/profiles/promethee/cache/scratch/qa/art-fail.png' })
    const state = await page.evaluate(() => ({ dialogs: [...document.querySelectorAll('[role="dialog"]')].length, view: document.querySelector('.artwork-grid') ? 'grille' : 'fiche', h1: document.querySelector('h1')?.textContent ?? null })).catch(() => null)
    return JSON.stringify({ ok: false, error: String(error).slice(0, 160), state, checks })
  }
  return JSON.stringify({ ok: true, checks: checks.length, list: checks })
}
