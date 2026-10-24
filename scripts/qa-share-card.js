// Carte à partager (qa-app.html : le harnais simule l'enregistrement natif et l'ouverture du navigateur).
//
// Gardes : deux formats aux tailles exactes (standard 1 080 × 1 350, story 1 080 × 1 920) ; le vrai logo (Σ)
// dessiné dans l'en-tête ; chaque réseau choisit son format ; « copier » met un vrai PNG dans le
// presse-papiers puis le service s'ouvre ; le repli (copie refusée) enregistre le fichier ; la story Instagram
// enregistre sans rien ouvrir ; les bibliothèques ajoutées ne sont pas proposées ; images refusées par le
// serveur = tuile de titre, export toujours possible ; demi-étoiles au pixel ; profil vide = message.
async page => {
  page.setDefaultTimeout(12000)
  const checks = []
  const errors = []
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|net::ERR|CORS|access control/i.test(message.text())) errors.push(message.text().slice(0, 200)) })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])

  const svg = label => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#c0392b"/><text x="200" y="300" font-size="40" fill="#fff" text-anchor="middle">${label}</text></svg>`
  let cors = true
  await page.route('https://picsum.photos/**', route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    // Playwright ajoute lui-même l'autorisation inter-sites à une réponse simulée qui n'en déclare pas :
    // pour simuler un serveur qui refuse, il faut déclarer une autre origine (le navigateur rejette l'image).
    headers: { 'access-control-allow-origin': cors ? '*' : 'https://autre-origine.invalid', 'cache-control': 'no-store' },
    body: svg('QA'),
  }))

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  const start = async (lang = 'fr', scenario = 'full') => {
    await page.goto(`http://127.0.0.1:5173/qa-app.html?scenario=${scenario}&lang=${lang}`)
    await page.evaluate(() => ['sylloge-theme', 'sylloge-sidebar-pinned'].forEach(key => localStorage.removeItem(key)))
    await page.goto(`http://127.0.0.1:5173/qa-app.html?scenario=${scenario}&lang=${lang}`)
    await page.getByRole('heading', { level: 1 }).first().waitFor()
  }
  const openTransfer = async (label = 'Importer et exporter', settings = 'Paramètres') => {
    const entry = page.locator('aside').getByRole('button', { name: label, exact: true })
    if (!(await entry.isVisible().catch(() => false))) await page.getByRole('button', { name: settings, exact: true }).click()
    await entry.click()
  }
  const dialog = () => page.getByRole('dialog', { name: 'Carte à partager' })
  const canvas = () => dialog().locator('canvas.share-card-canvas')
  const size = () => canvas().evaluate(el => [el.width, el.height])
  const format = name => dialog().getByRole('radio', { name })
  const heightIs = value => page.waitForFunction(expected => document.querySelector('canvas.share-card-canvas')?.height === expected, value)
  const pngInfo = bytes => page.evaluate(async raw => {
    const data = new Uint8Array(raw)
    const bitmap = await createImageBitmap(new Blob([data], { type: 'image/png' }))
    return { signature: Array.from(data.slice(0, 4)), width: bitmap.width, height: bitmap.height }
  }, bytes)
  const clipboardPng = () => page.evaluate(async () => {
    const [item] = await navigator.clipboard.read()
    const blob = await item.getType('image/png')
    const bitmap = await createImageBitmap(blob)
    return { types: item.types, width: bitmap.width, height: bitmap.height }
  })
  const saved = () => page.evaluate(() => window.__syllogeRecette.savedImages().length)
  const lastSaved = () => page.evaluate(() => { const all = window.__syllogeRecette.savedImages(); return all[all.length - 1] })
  const opened = () => page.evaluate(() => window.__syllogeRecette.opened())

  // ── 1. Ouverture depuis Réglages › Importer et exporter, format standard d'office ─────────────
  await start()
  await openTransfer()
  assert(await page.getByRole('heading', { name: 'Carte à partager', exact: true }).count() === 1, 'Réglages : un groupe « Carte à partager »')
  await page.getByRole('button', { name: 'Créer une carte', exact: true }).click()
  await dialog().waitFor()
  await canvas().waitFor()
  assert(JSON.stringify(await size()) === '[1080,1350]', `Standard d'office : 1 080 × 1 350 (${await size()})`)
  assert(await format(/Standard/).getAttribute('aria-checked') === 'true' && await format(/Story/).getAttribute('aria-checked') === 'false', 'Le format standard est coché')
  assert(await page.locator('#share-card-scope').inputValue() === 'profile', 'Portée par défaut : tout le profil')
  const options = await page.locator('#share-card-scope option').allInnerTexts()
  assert(JSON.stringify(options) === JSON.stringify(['Tout le profil', 'Films', 'Séries', 'Animation japonaise', 'Livres', 'Mangas', 'Jeux', 'Art']), `Portées : profil puis bibliothèques de base seulement (${options.join(', ')})`)
  assert(await dialog().getByText(/n’ont pas pu être chargées|n’a pas pu être chargée/).count() === 0, 'Images autorisées : aucun message d’image manquante')

  // Le vrai logo : la tuile Σ de l'application, pas l'ancien marque-page.
  const logoGap = await page.evaluate(async () => {
    const { default: logoUrl } = await import('/src/assets/sylloge-mark.png')
    const logo = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = logoUrl })
    const reference = document.createElement('canvas'); reference.width = 96; reference.height = 96
    const ref = reference.getContext('2d'); ref.fillStyle = '#161618'; ref.fillRect(0, 0, 96, 96); ref.drawImage(logo, 0, 0, 96, 96)
    const card = document.querySelector('canvas.share-card-canvas').getContext('2d').getImageData(72, 80, 96, 96).data
    const expected = ref.getImageData(0, 0, 96, 96).data
    let sum = 0
    for (let i = 0; i < card.length; i += 4) sum += Math.abs(card[i] - expected[i])
    return sum / (card.length / 4)
  })
  assert(logoGap < 6, `En-tête : le logo est la tuile Σ de l'application (écart moyen ${logoGap.toFixed(1)}/255)`)
  await page.screenshot({ path: '/Users/aurelientrouble/.hermes/profiles/promethee/cache/scratch/qa/share-1-dialog.png' })

  // ── 2. Changer de format redessine ; changer de contenu garde le format ───────────────────────
  await format(/Story/).click()
  await heightIs(1920)
  assert(JSON.stringify(await size()) === '[1080,1920]', 'Story : 1 080 × 1 920')
  await page.locator('#share-card-scope').selectOption('films')
  await heightIs(1920)
  assert(await format(/Story/).getAttribute('aria-checked') === 'true', 'Changer de contenu garde le format choisi')
  await format(/Standard/).click()
  await heightIs(1350)

  // ── 3. Enregistrer : un vrai PNG de la taille de l'aperçu ──────────────────────────────────────
  await dialog().getByRole('button', { name: 'Enregistrer l’image', exact: true }).click()
  await dialog().getByText(/Image enregistrée dans « sylloge-carte-recette\.png »/).waitFor()
  const png = await pngInfo(await lastSaved())
  assert(JSON.stringify(png.signature) === '[137,80,78,71]' && png.width === 1080 && png.height === 1350, `Enregistrement : PNG 1 080 × 1 350 (${png.width}×${png.height})`)

  // ── 4. Copier l'image : un vrai PNG dans le presse-papiers, sans fichier ──────────────────────
  const before = await saved()
  await dialog().getByRole('button', { name: 'Copier l’image', exact: true }).click()
  await dialog().getByText('Image copiée dans le presse-papiers.').waitFor()
  const clip = await clipboardPng()
  assert(clip.types.includes('image/png') && clip.width === 1080 && clip.height === 1350, `Copier : PNG 1 080 × 1 350 dans le presse-papiers (${clip.width}×${clip.height})`)
  assert(await saved() === before, 'Copier ne crée aucun fichier')

  // ── 5. Partager vers WhatsApp, X, Messenger : format standard, image copiée, service ouvert ───
  await format(/Story/).click()
  await heightIs(1920)
  await dialog().getByRole('button', { name: 'WhatsApp', exact: true }).click()
  await dialog().getByText(/Image copiée\. WhatsApp s’ouvre dans votre navigateur/).waitFor()
  assert(await format(/Standard/).getAttribute('aria-checked') === 'true', 'WhatsApp choisit le format standard (la story était cochée)')
  const whatsapp = await clipboardPng()
  assert(whatsapp.width === 1080 && whatsapp.height === 1350, 'WhatsApp : l’image copiée est au format standard')
  assert((await opened()).at(-1) === 'https://web.whatsapp.com/', 'WhatsApp : la page du service s’ouvre dans le navigateur du système')
  await dialog().getByRole('button', { name: 'X', exact: true }).click()
  await dialog().getByText(/Image copiée\. X s’ouvre/).waitFor()
  assert((await opened()).at(-1) === 'https://x.com/compose/post', 'X : la page de composition s’ouvre')
  await dialog().getByRole('button', { name: 'Messenger', exact: true }).click()
  await dialog().getByText(/Image copiée\. Messenger s’ouvre/).waitFor()
  assert((await opened()).at(-1) === 'https://www.messenger.com/', 'Messenger : la page du service s’ouvre')

  // ── 6. Story Instagram : format story, enregistrée, rien ne s'ouvre ───────────────────────────
  const openedBefore = (await opened()).length
  await dialog().getByRole('button', { name: 'Story Instagram', exact: true }).click()
  await dialog().getByText(/Image au format story enregistrée dans « sylloge-carte-recette\.png »/).waitFor()
  const story = await pngInfo(await lastSaved())
  assert(story.width === 1080 && story.height === 1920, `Story Instagram : PNG 1 080 × 1 920 (${story.width}×${story.height})`)
  assert(await format(/Story/).getAttribute('aria-checked') === 'true', 'Story Instagram coche le format story')
  assert((await dialog().innerText()).includes('depuis le téléphone'), 'Le message explique que la story se publie depuis le téléphone')
  assert((await opened()).length === openedBefore, 'Story Instagram n’ouvre aucune page')

  // ── 7. Copie refusée : le fichier est enregistré à la place, le service s'ouvre ────────────────
  await page.evaluate(() => { navigator.clipboard.write = () => Promise.reject(new Error('refusé')) })
  const savedBefore = await saved()
  await dialog().getByRole('button', { name: 'Messenger', exact: true }).click()
  await dialog().getByText(/La copie n’a pas fonctionné : l’image est enregistrée dans « sylloge-carte-recette\.png »/).waitFor()
  assert(await saved() === savedBefore + 1 && (await opened()).at(-1) === 'https://www.messenger.com/', 'Copie refusée : fichier enregistré et service ouvert')
  await dialog().getByRole('button', { name: 'Copier l’image', exact: true }).click()
  await dialog().getByText(/La copie n’a pas fonctionné dans cette fenêtre/).waitFor()
  assert(await saved() === savedBefore + 1, 'Copie seule refusée : aucun fichier créé en silence')
  await dialog().getByRole('button', { name: 'Fermer', exact: true }).click()
  assert(await dialog().count() === 0, 'La fenêtre se ferme')

  // ── 8. Images refusées par le serveur : repli sur les titres, export toujours possible ─────────
  cors = false
  await start()
  await openTransfer()
  await page.getByRole('button', { name: 'Créer une carte', exact: true }).click()
  await dialog().waitFor()
  await canvas().waitFor()
  await dialog().getByText(/images n’ont pas pu être chargées : leurs tuiles affichent le titre/).waitFor()
  await dialog().getByRole('button', { name: 'Enregistrer l’image', exact: true }).click()
  await dialog().getByText(/Image enregistrée dans/).waitFor()
  const fallback = await pngInfo(await lastSaved())
  assert(fallback.width === 1080 && JSON.stringify(fallback.signature) === '[137,80,78,71]', 'Sans autorisation : l’export en PNG reste possible (canevas non contaminé)')
  await dialog().getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 9. Depuis « Exporter » d'une bibliothèque : la portée suit le choix ─────────────────────────
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

  // ── 10. Demi-étoiles exactes sous les coups de cœur (dessin direct, sans images) ───────────────
  const stars = await page.evaluate(async () => {
    const { renderShareCard } = await import('/src/components/shareCardImage.ts')
    const { layoutShareCard } = await import('/src/domain/shareCardLayout.ts')
    const { SHARE_FORMATS } = await import('/src/domain/shareFormats.ts')
    const item = (id, rating) => ({ key: `films:${id}`, id, library: 'films', title: `Film ${id}`, creator: null, year: 2020, rating, isFavorite: true, done: true, doneAt: '2026-01-01', doneOn: '2026-01-01', imageUrl: null })
    const model = {
      scope: { kind: 'library', library: 'films' }, profileName: 'QA', heading: { kind: 'library', label: 'Films' },
      stats: { cells: [{ value: 3, label: 'films vus' }, { value: 3, label: 'vus en {year}', params: { year: '2026' } }, { value: 3, label: 'coups de cœur' }], perLibrary: null },
      titles: { favorites: 'Coups de cœur', recent: 'Derniers films vus' },
      sections: { favorites: [item('a', 5), item('b', 3.5), item('c', 1)], recent: [] }, isEmpty: false,
    }
    const { canvas } = await renderShareCard(model, SHARE_FORMATS.standard, { loadImage: async () => null, now: new Date('2026-10-24T10:00:00') })
    const tiles = layoutShareCard(model, SHARE_FORMATS.standard).blocks.find(block => block.section === 'favorites').tiles
    const context = canvas.getContext('2d')
    const bright = (x, y) => { const d = context.getImageData(Math.round(x), Math.round(y), 1, 1).data; return (d[0] + d[1] + d[2]) / 3 > 160 }
    const starsLeft = tile => tile.starsRect.x + (tile.starsRect.w - (5 * 26 + 4 * 4)) / 2
    const sample = (tile, index, half) => bright(starsLeft(tile) + index * 30 + (half === 'left' ? 8 : 18), tile.starsRect.y + tile.starsRect.h / 2 + 1)
    return {
      five: [0, 1, 2, 3, 4].map(index => sample(tiles[0], index, 'left') && sample(tiles[0], index, 'right')),
      threeHalf: [0, 1, 2, 3, 4].map(index => [sample(tiles[1], index, 'left'), sample(tiles[1], index, 'right')]),
      one: [0, 1, 2, 3, 4].map(index => [sample(tiles[2], index, 'left'), sample(tiles[2], index, 'right')]),
    }
  })
  assert(stars.five.every(Boolean), '5 étoiles : les cinq sont pleines')
  assert(JSON.stringify(stars.threeHalf) === JSON.stringify([[true, true], [true, true], [true, true], [true, false], [false, false]]), `3,5 étoiles : trois pleines, une demie, une vide (${JSON.stringify(stars.threeHalf)})`)
  assert(JSON.stringify(stars.one) === JSON.stringify([[true, true], [false, false], [false, false], [false, false], [false, false]]), '1 étoile : une pleine, quatre vides')

  // ── 11. Profil sans rien à montrer : un message, pas d'image vide ─────────────────────────────
  await start('fr', 'empty')
  await openTransfer()
  await page.getByRole('button', { name: 'Créer une carte', exact: true }).click()
  await dialog().getByText(/Pas encore de quoi composer une carte/).waitFor()
  for (const name of ['Enregistrer l’image', 'Copier l’image', 'WhatsApp', 'Story Instagram']) {
    assert(await dialog().getByRole('button', { name, exact: true }).isDisabled(), `Rien à montrer : « ${name} » est désactivé`)
  }
  assert(await canvas().count() === 0, 'Rien à montrer : aucun aperçu vide')
  await dialog().getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 12. Anglais ────────────────────────────────────────────────────────────────────────────────
  await start('en')
  await openTransfer('Import and export', 'Settings')
  await page.getByRole('button', { name: 'Create a card', exact: true }).click()
  const english = page.getByRole('dialog', { name: 'Share card' })
  await english.waitFor()
  await english.locator('canvas.share-card-canvas').waitFor()
  const englishText = await english.innerText()
  assert(/Card content/.test(englishText) && /Whole profile/.test(englishText) && /Image format/.test(englishText) && /Instagram and Facebook stories/.test(englishText) && /Copy the image/.test(englishText) && /Share to/.test(englishText) && /Save the image/.test(englishText), 'Anglais : fenêtre traduite')
  assert(!/Contenu de la carte|Enregistrer|Partager vers|Copier/.test(englishText), 'Anglais : aucun reste de français')
  await english.getByRole('button', { name: 'Close', exact: true }).click()

  // L'interception réseau survit dans la session : on la retire, et on remet l'état mémorisé à zéro.
  await page.unroute('https://picsum.photos/**')
  await page.evaluate(() => ['sylloge-theme', 'sylloge-sidebar-pinned', 'sylloge-language'].forEach(key => localStorage.removeItem(key)))
  await start('fr')
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
