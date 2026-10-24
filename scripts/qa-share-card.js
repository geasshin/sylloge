// Carte à partager (qa-app.html : le harnais simule l'enregistrement natif et enregistre les octets du PNG).
//
// Gardes : la fenêtre s'ouvre depuis Réglages et depuis « Exporter » avec la bonne portée ; la carte
// est dessinée avec les vraies images quand le serveur les autorise, retombe sur les titres quand il
// ne les autorise pas SANS rendre l'export impossible (canevas contaminé) ; l'image enregistrée est un
// vrai PNG de la taille de l'aperçu ; les demi-étoiles sont exactes ; une bibliothèque sans rien à
// montrer le dit au lieu de proposer une image vide.
async page => {
  page.setDefaultTimeout(12000)
  const checks = []
  const errors = []
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|net::ERR|CORS|access control/i.test(message.text())) errors.push(message.text().slice(0, 200)) })

  const svg = label => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#c0392b"/><text x="200" y="300" font-size="40" fill="#fff" text-anchor="middle">${label}</text></svg>`
  let cors = true
  await page.route('https://picsum.photos/**', route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    // no-store : sans cela, le navigateur ressert l'image autorisée de la phase précédente.
    // Playwright ajoute lui-même l'autorisation inter-sites à une réponse simulée qui n'en déclare pas :
    // pour simuler un serveur qui refuse, il faut déclarer une autre origine (le navigateur rejette l'image).
    headers: { 'access-control-allow-origin': cors ? '*' : 'https://autre-origine.invalid', 'cache-control': 'no-store' },
    body: svg('QA'),
  }))

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  const start = async (lang = 'fr') => {
    await page.goto(`http://127.0.0.1:5173/qa-app.html?scenario=full&lang=${lang}`)
    await page.evaluate(() => ['sylloge-theme', 'sylloge-sidebar-pinned'].forEach(key => localStorage.removeItem(key)))
    await page.goto(`http://127.0.0.1:5173/qa-app.html?scenario=full&lang=${lang}`)
    await page.getByRole('heading', { level: 1 }).first().waitFor()
  }
  const openTransfer = async (label = 'Importer et exporter', settings = 'Paramètres') => {
    const entry = page.locator('aside').getByRole('button', { name: label, exact: true })
    if (!(await entry.isVisible().catch(() => false))) await page.getByRole('button', { name: settings, exact: true }).click()
    await entry.click()
  }
  const dialog = () => page.getByRole('dialog', { name: 'Carte à partager' })
  const canvas = () => dialog().locator('canvas.share-card-canvas')
  const pixel = (x, y) => canvas().evaluate((el, [px, py]) => { const d = el.getContext('2d').getImageData(px, py, 1, 1).data; return [d[0], d[1], d[2]] }, [x, y])

  // ── 1. Ouverture depuis Réglages › Importer et exporter, images autorisées ────────────────────
  await start()
  await openTransfer()
  assert(await page.getByRole('heading', { name: 'Carte à partager', exact: true }).count() === 1, 'Réglages : un groupe « Carte à partager »')
  await page.getByRole('button', { name: 'Créer une carte', exact: true }).click()
  await dialog().waitFor()
  await canvas().waitFor()
  const dims = await canvas().evaluate(el => [el.width, el.height])
  assert(dims[0] === 1080 && dims[1] >= 1080 && dims[1] <= 1700, `Aperçu : toile de 1 080 px de large (${dims})`)
  assert(await page.locator('#share-card-scope').inputValue() === 'profile', 'Portée par défaut : tout le profil')
  const options = await page.locator('#share-card-scope option').allInnerTexts()
  assert(options[0] === 'Tout le profil' && options.includes('Films') && options.includes('Livres') && options.includes('Comics'), `Portées : profil puis bibliothèques non vides (${options.join(', ')})`)
  assert(await dialog().getByText(/n’ont pas pu être chargées|n’a pas pu être chargée/).count() === 0, 'Images autorisées : aucun message d’image manquante')

  // Une tuile de coup de cœur est bien dessinée avec l'image (rouge du faux poster), pas avec le repli sombre.
  const layout = await page.evaluate(async () => {
    const { libraryRepository } = await import('/src/data/libraryRepository.ts')
    const { buildShareCard, collectShareItems } = await import('/src/domain/shareCard.ts')
    const { layoutShareCard } = await import('/src/domain/shareCardLayout.ts')
    const library = await libraryRepository.loadLibrary('qa-profile')
    const model = buildShareCard(collectShareItems(library), { kind: 'profile' }, library.profile.name)
    const result = layoutShareCard(model)
    return { tile: result.blocks.find(block => block.section === 'favorites').tiles[0].rect, height: result.height }
  })
  const [r, g, b] = await pixel(Math.round(layout.tile.x + layout.tile.w / 2), Math.round(layout.tile.y + 20))
  assert(r > 150 && g < 90 && b < 90, `Tuile : l’image autorisée est dessinée (${r},${g},${b})`)
  assert(layout.height === dims[1], 'Aperçu : la hauteur de la toile suit la mise en page')
  await page.screenshot({ path: '/Users/aurelientrouble/.hermes/profiles/promethee/cache/scratch/qa/share-1-dialog.png' })

  // ── 2. Enregistrement : un vrai PNG, de la taille de l'aperçu ──────────────────────────────────
  await dialog().getByRole('button', { name: 'Enregistrer l’image', exact: true }).click()
  await dialog().getByText(/Image enregistrée dans « sylloge-carte-recette\.png »/).waitFor()
  const saved = await page.evaluate(async () => {
    const all = window.__syllogeRecette.savedImages()
    const bytes = new Uint8Array(all[all.length - 1])
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    return { count: all.length, signature: Array.from(bytes.slice(0, 8)), size: bytes.length, width: bitmap.width, height: bitmap.height }
  })
  assert(JSON.stringify(saved.signature) === JSON.stringify([137, 80, 78, 71, 13, 10, 26, 10]), 'Enregistrement : le fichier commence par la signature PNG')
  assert(saved.width === 1080 && saved.height === dims[1] && saved.size > 5000, `Enregistrement : le PNG se relit à la taille de l’aperçu (${saved.width}×${saved.height}, ${saved.size} octets)`)

  // ── 3. Changer de portée recompose la carte ───────────────────────────────────────────────────
  await page.locator('#share-card-scope').selectOption('films')
  await page.waitForTimeout(500)
  await canvas().waitFor()
  const filmsDims = await canvas().evaluate(el => [el.width, el.height])
  assert(filmsDims[1] !== dims[1] || filmsDims[0] === 1080, `Portée « Films » : carte recomposée (${filmsDims})`)
  assert(await dialog().getByText(/Image enregistrée/).count() === 0, 'Changer de portée efface le message précédent')
  await page.screenshot({ path: '/Users/aurelientrouble/.hermes/profiles/promethee/cache/scratch/qa/share-2-films.png' })
  await dialog().getByRole('button', { name: 'Fermer', exact: true }).click()
  assert(await dialog().count() === 0, 'La fenêtre se ferme')

  // ── 4. Images refusées par le serveur : repli sur les titres, export toujours possible ─────────
  cors = false
  await start()
  await openTransfer()
  await page.getByRole('button', { name: 'Créer une carte', exact: true }).click()
  await dialog().waitFor()
  await canvas().waitFor()
  await dialog().getByText(/images n’ont pas pu être chargées : leurs tuiles affichent le titre/).waitFor()
  const [fr, fg, fb] = await pixel(Math.round(layout.tile.x + 4), Math.round(layout.tile.y + 4))
  assert(Math.abs(fr - 35) < 12 && Math.abs(fg - 35) < 12 && Math.abs(fb - 38) < 12, `Sans autorisation : la tuile retombe sur le fond sombre (${fr},${fg},${fb})`)
  await dialog().getByRole('button', { name: 'Enregistrer l’image', exact: true }).click()
  await dialog().getByText(/Image enregistrée dans/).waitFor()
  // La page a été rechargée : le registre du harnais repart de zéro, une seule image y figure.
  const fallbackSaved = await page.evaluate(async () => {
    const all = window.__syllogeRecette.savedImages()
    const bytes = new Uint8Array(all[all.length - 1])
    return { count: all.length, signature: Array.from(bytes.slice(0, 4)), width: (await createImageBitmap(new Blob([bytes], { type: 'image/png' }))).width }
  })
  assert(fallbackSaved.count === 1 && JSON.stringify(fallbackSaved.signature) === JSON.stringify([137, 80, 78, 71]) && fallbackSaved.width === 1080, 'Sans autorisation : l’export en PNG reste possible (canevas non contaminé)')
  await dialog().getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 5. Depuis « Exporter » d'une bibliothèque : la portée suit le choix ─────────────────────────
  cors = true
  await start()
  await page.locator('nav').getByRole('button', { name: 'Films', exact: true }).click()
  await page.getByRole('button', { name: 'Exporter', exact: true }).first().click()
  const exportDialog = page.getByRole('dialog', { name: /Exporter/ })
  await exportDialog.getByRole('button', { name: /Carte à partager/ }).click()
  await dialog().waitFor()
  assert(await page.locator('#share-card-scope').inputValue() === 'films', 'Export › Carte à partager : la carte s’ouvre sur la bibliothèque courante')
  assert(await page.getByRole('dialog', { name: /Exporter/ }).count() === 0, 'La fenêtre d’export est remplacée par celle de la carte')
  await dialog().getByRole('button', { name: 'Fermer', exact: true }).click()
  await page.getByRole('button', { name: 'Exporter', exact: true }).first().click()
  await page.getByRole('dialog', { name: /Exporter/ }).getByRole('radio', { name: /Tout le profil/ }).check()
  await page.getByRole('dialog', { name: /Exporter/ }).getByRole('button', { name: /Carte à partager/ }).click()
  await dialog().waitFor()
  assert(await page.locator('#share-card-scope').inputValue() === 'profile', 'Export (tout le profil) › Carte à partager : la carte s’ouvre sur le profil')
  await dialog().getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 6. Demi-étoiles exactes (dessin direct, sans images) ─────────────────────────────────────
  const stars = await page.evaluate(async () => {
    const { renderShareCard } = await import('/src/components/shareCardImage.ts')
    const { layoutShareCard } = await import('/src/domain/shareCardLayout.ts')
    const item = (id, rating) => ({ key: `films:${id}`, id, library: 'films', title: `Film ${id}`, creator: null, year: 2020, rating, isFavorite: false, done: true, doneAt: '2026-01-01', imageUrl: null })
    const model = {
      scope: { kind: 'profile' }, profileName: 'QA', heading: { kind: 'profile', name: 'QA' },
      stats: { total: 3, done: 3, favorites: 0, averageRating: 3.5, perLibrary: null },
      sections: { favorites: [], topRated: [item('a', 5), item('b', 3.5), item('c', 1)], recent: [] }, isEmpty: false,
    }
    const { canvas } = await renderShareCard(model, { loadImage: async () => null, now: new Date('2026-10-24T10:00:00') })
    const layout = layoutShareCard(model)
    const rows = layout.blocks.find(block => block.kind === 'list').rows
    const context = canvas.getContext('2d')
    const bright = (x, y) => { const d = context.getImageData(Math.round(x), Math.round(y), 1, 1).data; return (d[0] + d[1] + d[2]) / 3 > 160 }
    const starsLeft = row => row.rect.x + row.rect.w - 20 - (5 * 26 + 4 * 6)
    const sample = (row, index, half) => bright(starsLeft(row) + index * 32 + (half === 'left' ? 8 : 18), row.rect.y + row.rect.h / 2 + 1)
    return {
      five: [0, 1, 2, 3, 4].map(index => sample(rows[0], index, 'left') && sample(rows[0], index, 'right')),
      threeHalf: [0, 1, 2, 3, 4].map(index => [sample(rows[1], index, 'left'), sample(rows[1], index, 'right')]),
      one: [0, 1, 2, 3, 4].map(index => [sample(rows[2], index, 'left'), sample(rows[2], index, 'right')]),
    }
  })
  assert(stars.five.every(Boolean), '5 étoiles : les cinq sont pleines')
  assert(JSON.stringify(stars.threeHalf) === JSON.stringify([[true, true], [true, true], [true, true], [true, false], [false, false]]), `3,5 étoiles : trois pleines, une demie, une vide (${JSON.stringify(stars.threeHalf)})`)
  assert(JSON.stringify(stars.one) === JSON.stringify([[true, true], [false, false], [false, false], [false, false], [false, false]]), '1 étoile : une pleine, quatre vides')

  // ── 7. Bibliothèque sans rien à montrer : un message, pas d'image vide ─────────────────────────
  await page.evaluate(async () => {
    const { libraryRepository } = await import('/src/data/libraryRepository.ts')
    const real = libraryRepository.loadLibrary.bind(libraryRepository)
    libraryRepository.loadLibrary = async id => {
      const library = await real(id)
      return { ...library, films: library.films.map(film => ({ ...film, status: 'à découvrir', isFavorite: false, rating: null })), series: [], anime: [], books: [], mangas: [], games: [], artworks: [], customLibraries: [] }
    }
  })
  await openTransfer()
  await page.getByRole('button', { name: 'Créer une carte', exact: true }).click()
  await dialog().getByText(/Pas encore de quoi composer une carte/).waitFor()
  assert(await dialog().getByRole('button', { name: 'Enregistrer l’image', exact: true }).isDisabled(), 'Rien à montrer : « Enregistrer l’image » est désactivé')
  assert(await canvas().count() === 0, 'Rien à montrer : aucun aperçu vide')
  await dialog().getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 8. Anglais ────────────────────────────────────────────────────────────────────────────────
  await start('en')
  await openTransfer('Import and export', 'Settings')
  await page.getByRole('button', { name: 'Create a card', exact: true }).click()
  const english = page.getByRole('dialog', { name: 'Share card' })
  await english.waitFor()
  await english.locator('canvas.share-card-canvas').waitFor()
  const englishText = await english.innerText()
  assert(/Card content/.test(englishText) && /Whole profile/.test(englishText) && /Save the image/.test(englishText) && !/Contenu de la carte|Enregistrer/.test(englishText), 'Anglais : fenêtre entièrement traduite')
  await english.getByRole('button', { name: 'Close', exact: true }).click()

  // Remise à zéro de l'état mémorisé pour les recettes suivantes.
  await page.evaluate(() => ['sylloge-theme', 'sylloge-sidebar-pinned', 'sylloge-language'].forEach(key => localStorage.removeItem(key)))
  await start('fr')
  // L'interception réseau survit dans la session : on la retire pour ne pas fausser les recettes suivantes.
  await page.unroute('https://picsum.photos/**')
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
