// Récapitulatif de l'année (qa-app.html). Gardes : l'entrée dans les réglages, la règle du 10 décembre,
// quatre étapes qui redessinent chacune leur visuel, deux formats aux tailles exactes, un PNG enregistré
// dont le nom dit l'étape et le format, une année vide qui le dit sans casser, et l'anglais.
async page => {
  page.setDefaultTimeout(15000)
  const checks = []
  const errors = []
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|net::ERR|CORS|access control/i.test(message.text())) errors.push(message.text().slice(0, 200)) })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])

  // Chaque adresse d'image a sa couleur : deux étapes différentes ne se ressemblent pas.
  await page.route('https://picsum.photos/**', route => {
    let hash = 0
    for (const char of route.request().url()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="hsl(${hash % 360} 50% 38%)"/></svg>`,
    })
  })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  const start = async (lang = 'fr', recap = '2026') => {
    const suffix = recap === '' ? '' : `&recap=${recap}`
    await page.goto(`http://127.0.0.1:5173/qa-app.html?scenario=full&lang=${lang}${suffix}`)
    await page.evaluate(() => ['sylloge-theme', 'sylloge-sidebar-pinned', 'sylloge-language'].forEach(key => localStorage.removeItem(key)))
    await page.goto(`http://127.0.0.1:5173/qa-app.html?scenario=full&lang=${lang}${suffix}`)
    await page.getByRole('heading', { level: 1 }).first().waitFor()
  }
  const openTransfer = async () => {
    await page.getByRole('button', { name: 'Paramètres', exact: true }).click()
    const entry = page.locator('aside').getByRole('button', { name: 'Importer et exporter', exact: true })
    if (!(await entry.isVisible().catch(() => false))) await page.getByRole('button', { name: 'Paramètres', exact: true }).click()
    await entry.click()
  }
  const dialog = () => page.getByRole('dialog', { name: /Mon année \d{4}|My year \d{4}/ })
  const canvas = () => dialog().locator('canvas.share-card-canvas')
  const step = name => dialog().locator('.share-steps').getByRole('button', { name })
  const fingerprint = () => page.evaluate(() => {
    const el = document.querySelector('canvas.share-card-canvas')
    if (!el) return 'aucune'
    const data = el.toDataURL()
    let hash = 0
    for (let index = 0; index < data.length; index += 61) hash = (hash * 31 + data.charCodeAt(index)) >>> 0
    return String(hash)
  })
  const redrawn = async (before, what) => {
    await page.waitForFunction(previous => {
      const el = document.querySelector('canvas.share-card-canvas')
      if (!el) return false
      const data = el.toDataURL()
      let hash = 0
      for (let index = 0; index < data.length; index += 61) hash = (hash * 31 + data.charCodeAt(index)) >>> 0
      return String(hash) !== previous
    }, before).catch(() => { throw Error(`Le visuel ne s'est pas redessiné : ${what}`) })
  }
  const lastSaved = () => page.evaluate(() => { const all = window.__syllogeRecette.savedImages(); return all[all.length - 1] })
  const pngInfo = bytes => page.evaluate(async raw => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(raw)], { type: 'image/png' }))
    return { signature: Array.from(new Uint8Array(raw).slice(0, 4)), width: bitmap.width, height: bitmap.height }
  }, bytes)

  // ── 1. L'entrée est dans les réglages, et la règle du 10 décembre donne l'année 2025 en octobre ──
  await start('fr', '')
  await openTransfer()
  assert(await page.getByRole('heading', { name: 'Récapitulatif de l’année', exact: true }).count() === 1, 'Réglages : un groupe « Récapitulatif de l’année »')
  assert(await page.getByRole('button', { name: 'Voir mon année 2025', exact: true }).count() === 1, 'Le 25 octobre 2026, le bouton propose l’année précédente (2025)')

  await start('fr', '2026')
  await openTransfer()
  // Une seule source pour l'année : le libellé de la ligne et le bouton ne peuvent pas se contredire.
  const settingsText = await page.locator('main').innerText()
  assert(/Mon année 2026/.test(settingsText) && !/Mon année 2025/.test(settingsText), 'Réglages : la ligne nomme la même année que le bouton')
  const forced = page.getByRole('button', { name: 'Voir mon année 2026', exact: true })
  assert(await forced.count() === 1, 'Le harnais force 2026 par `?recap`')
  await forced.click()
  await dialog().waitFor()
  await canvas().waitFor()
  assert((await dialog().getByText('MON ANNÉE 2026').count()) === 1 || /MON ANNÉE 2026/i.test(await dialog().innerText()), 'La fenêtre s’intitule « Mon année 2026 »')
  const stepNames = (await dialog().locator('.share-steps button').allInnerTexts()).map(text => text.replace(/\s+/g, ' ').trim())
  assert(JSON.stringify(stepNames) === JSON.stringify(['1 Chiffres', '2 Rythme', '3 Palmarès', '4 Mieux notées', '5 Vos notes', '6 Temps long', '7 Habitudes', '8 Découvertes']), `Huit étapes : ${stepNames.join(' | ')}`)
  const size = await canvas().evaluate(el => [el.width, el.height])
  assert(JSON.stringify(size) === '[1080,1350]', `Standard 4:5 : 1 080 × 1 350 (${size})`)
  assert(/37 œuvres datées de 2026/.test(await dialog().innerText()), 'Étape 1 : le décompte des œuvres datées')

  // ── 2. Chaque étape redessine son visuel ────────────────────────────────────────────────────────
  const seen = []
  let previous = await fingerprint()
  seen.push(previous)
  for (const name of ['Rythme', 'Palmarès', 'Mieux notées', 'Vos notes', 'Temps long', 'Habitudes', 'Découvertes']) {
    await step(new RegExp(name)).click()
    await redrawn(previous, name.toLowerCase())
    previous = await fingerprint()
    seen.push(previous)
  }
  assert(new Set(seen).size === 8, 'Les huit visuels sont différents')

  // ── 3. Enregistrement : un vrai PNG, et un nom qui dit l'année, l'étape et le format ────────────
  await dialog().getByRole('button', { name: 'Enregistrer l’image', exact: true }).click()
  await dialog().getByText(/Image enregistrée dans « sylloge-carte-recette\.png »/).waitFor()
  const png = await pngInfo(await lastSaved())
  assert(JSON.stringify(png.signature) === '[137,80,78,71]' && png.width === 1080 && png.height === 1350, `Enregistrement : PNG 1 080 × 1 350 (${png.width}×${png.height})`)

  // ── 4. La story : 1 080 × 1 920, et le nom suit le format ──────────────────────────────────────
  await dialog().getByRole('radio', { name: /Story/ }).click()
  await page.waitForFunction(() => document.querySelector('canvas.share-card-canvas')?.height === 1920)
  assert(JSON.stringify(await canvas().evaluate(el => [el.width, el.height])) === '[1080,1920]', 'Story : 1 080 × 1 920')
  await dialog().getByRole('button', { name: 'Copier l’image', exact: true }).click()
  await dialog().getByText('Image copiée dans le presse-papiers.').waitFor()
  const clip = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read()
    const blob = await item.getType('image/png')
    const bitmap = await createImageBitmap(blob)
    return { types: item.types, width: bitmap.width, height: bitmap.height }
  })
  assert(clip.types.includes('image/png') && clip.width === 1080 && clip.height === 1920, `Copier la story : PNG 1 080 × 1 920 (${clip.width}×${clip.height})`)
  await dialog().getByRole('button', { name: 'Fermer l’assistant', exact: true }).click()
  assert(await dialog().count() === 0, 'La fenêtre se ferme')

  // ── 5. Une année sans rien de daté : le visuel le dit, l'application ne casse pas ──────────────
  await start('fr', '2019')
  await openTransfer()
  await page.getByRole('button', { name: 'Voir mon année 2019', exact: true }).click()
  await dialog().waitFor()
  await canvas().waitFor()
  assert(/0 œuvres datées de 2019/.test(await dialog().innerText()), 'Année vide : le décompte est à zéro')
  await dialog().getByRole('button', { name: 'Enregistrer l’image', exact: true }).click()
  await dialog().getByText(/Image enregistrée dans « sylloge-carte-recette\.png »/).waitFor()
  const empty = await pngInfo(await lastSaved())
  assert(empty.width === 1080 && empty.height === 1350, 'Année vide : l’image s’enregistre quand même')
  await dialog().getByRole('button', { name: 'Fermer l’assistant', exact: true }).click()

  // ── 6. Anglais ────────────────────────────────────────────────────────────────────────────────
  await start('en', '2026')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const englishEntry = page.locator('aside').getByRole('button', { name: 'Import and export', exact: true })
  if (!(await englishEntry.isVisible().catch(() => false))) await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await englishEntry.click()
  await page.getByRole('button', { name: 'See my 2026', exact: true }).click()
  const english = page.getByRole('dialog', { name: 'My year 2026' })
  await english.waitFor()
  await english.locator('canvas.share-card-canvas').waitFor()
  const englishText = await english.innerText()
  const englishSteps = ['Numbers', 'Pace', 'Highlights', 'Highest rated', 'Your ratings', 'Long haul', 'Habits', 'Discoveries']
  assert(/Your year in eight visuals/i.test(englishText) && englishSteps.every(name => englishText.includes(name)), `Anglais : les huit étapes et la description sont traduites (${englishSteps.filter(name => !englishText.includes(name)).join(', ') || 'toutes'})`)
  assert(!/Chiffres|Rythme|Palmarès|Habitudes|Découvertes|œuvres|Enregistrer|Précédent/.test(englishText), 'Anglais : aucun reste de français')
  await page.keyboard.press('Escape')
  await english.waitFor({ state: 'hidden' })
  assert(true, 'Anglais : Échap ferme la fenêtre')

  await page.unroute('https://picsum.photos/**')
  await page.evaluate(() => ['sylloge-theme', 'sylloge-sidebar-pinned', 'sylloge-language'].forEach(key => localStorage.removeItem(key)))
  await start('fr')
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
