// Recadrage vertical des bannières (qa-app.html, SQLite en mémoire, images simulées : aucun réseau).
//
// Dans le harnais `scenario=full` : une fiche Film portant une bannière l'affiche
// centrée (`object-position: 50% 50%`, migration 0028) ; le bouton « Recadrer »
// ouvre le geste, glisser vers le bas montre le haut de l'image et fait baisser
// le pourcentage, « Annuler » restaure la position initiale, « Valider » écrit
// films.banner_position. La valeur relue en base revient sur la fiche rouverte.
// Le clavier (flèches, Maj, Échap) se vérifie sur le curseur ; changer d'image
// remet la position à NULL ; une série porte déjà un recadrage enregistré (20)
// et se recadre à son tour. Aucune image réelle : picsum est servi en SVG local,
// puis l'interception est retirée.
//
// Ouvrir la session playwright-cli depuis le dossier scratch : aucune capture n'est écrite ici.
async page => {
  page.setDefaultTimeout(8000)
  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }

  // Toute image picsum est servie en SVG à la taille demandée : le format réel
  // du bandeau se mesure comme en vrai, sans réseau.
  await page.route('https://picsum.photos/**', route => {
    const size = route.request().url().match(/\/(\d+)\/(\d+)(?:\?.*)?$/)
    const width = size ? size[1] : '1600'
    const height = size ? size[2] : '900'
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'cache-control': 'no-store' },
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#3b4a5a"/></svg>`,
    })
  })

  const nav = () => page.getByRole('navigation').first()
  const exact = text => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  const settle = async () => {
    await page.mouse.move(980, 520)
    await page.locator('.sidebar-expanded').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(250)
  }
  const openLibrary = async label => {
    await nav().hover()
    await nav().locator(`button[aria-label="${label}"]:visible`).first().click()
    await page.getByRole('heading', { level: 1, name: label, exact: true }).waitFor()
    await settle()
    await page.locator('.view-bar').first().waitFor({ state: 'visible' }).catch(() => {})
    const all = page.locator('.view-bar .view-pill', { hasText: /^(Tous|All)$/ }).first()
    if (await all.count() > 0) { await all.click(); await page.waitForTimeout(250) }
  }
  const openCard = async title => {
    await page.locator('.film-card-top > b', { hasText: exact(title) }).first().click()
    await page.locator('.detail-poster').first().waitFor()
    await page.waitForTimeout(350)
  }
  const backToGrid = async label => {
    await page.locator('.back-button').first().click()
    await page.getByRole('heading', { level: 1, name: label, exact: true }).waitFor()
    await settle()
  }
  const sql = (query, values = []) => page.evaluate(([q, v]) => window.__syllogeRecette.select(q, v), [query, values])
  const stored = async (table, id) => (await sql(`SELECT banner_position FROM ${table} WHERE id = $1`, [id]))[0]?.banner_position ?? null
  const banner = () => page.locator('.detail-banner').first()
  const imagePosition = () => banner().locator('img').evaluate(node => node.style.objectPosition)
  const repositionButton = () => banner().locator('.banner-reposition-overlay')
  const surface = () => page.locator('.banner-crop-surface').first()
  const actions = () => page.locator('.banner-crop-actions').first()
  const sliderValue = () => surface().getAttribute('aria-valuenow')

  /** Entre dans le geste, glisse de `deltaPx` (positif vers le bas), rend la valeur lue. */
  const drag = async (deltaPx) => {
    await repositionButton().click()
    await surface().waitFor()
    const box = await surface().boundingBox()
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2 - 40
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + deltaPx, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(120)
    return Number(await sliderValue())
  }

  try {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()

  // ── 1. Film : bannière centrée par défaut, geste proposé ────────────────────────────────
  await openLibrary('Films')
  await openCard('Portrait de la jeune fille en feu')
  await repositionButton().waitFor()
  assert(await banner().count() === 1, 'Film : la bannière est affichée')
  assert(await imagePosition() === '50% 50%', `Film : une position NULL affiche le centre (${await imagePosition()})`)
  assert(await stored('films', 'film-portrait-de-la-jeune-fille-en-feu') === null, 'Film : aucune position en base au départ')
  const label = await repositionButton().getAttribute('aria-label')
  assert(label === 'Recadrer la bannière de « Portrait de la jeune fille en feu »', `Film : le bouton de recadrage est nommé (${label})`)
  assert((await repositionButton().getAttribute('title')) === 'Recadrer la bannière', 'Film : le bouton porte son libellé d’aide')
  assert(await banner().locator('.banner-edit-overlay').count() === 1 && await banner().locator('.banner-reposition-overlay').count() === 1, 'Film : recadrer et modifier cohabitent dans le bandeau')

  // ── 2. Entrer dans le geste : curseur, consigne, boutons ───────────────────────────────
  await repositionButton().click()
  await surface().waitFor()
  assert((await surface().getAttribute('role')) === 'slider', 'Recadrage : la surface porte le rôle de curseur')
  assert((await surface().getAttribute('aria-orientation')) === 'vertical', 'Recadrage : le curseur est vertical')
  assert((await surface().getAttribute('aria-valuemin')) === '0' && (await surface().getAttribute('aria-valuemax')) === '100', 'Recadrage : les bornes 0–100 sont annoncées')
  assert(Number(await sliderValue()) === 50, `Recadrage : la valeur de départ est le centre (${await sliderValue()})`)
  assert((await surface().getAttribute('aria-label')) === 'Position de la bannière', 'Recadrage : le curseur est nommé')
  assert((await actions().innerText()).includes('Faites glisser l’image'), 'Recadrage : la consigne est affichée')
  assert(await actions().getByRole('button', { name: 'Annuler', exact: true }).count() === 1, 'Recadrage : le bouton Annuler est là')
  assert(await actions().getByRole('button', { name: 'Valider', exact: true }).count() === 1, 'Recadrage : le bouton Valider est là')
  assert(await page.evaluate(() => getComputedStyle(document.querySelector('.banner-crop-surface')).cursor) === 'grab', 'Recadrage : le curseur est « grab »')

  const dragged = await (async () => {
    const box = await surface().boundingBox()
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2 - 40
    await page.mouse.move(x, y)
    await page.mouse.down()
    assert(await page.evaluate(() => getComputedStyle(document.querySelector('.banner-crop-surface')).cursor) === 'grabbing', 'Recadrage : le curseur devient « grabbing » pendant le glissement')
    await page.mouse.move(x, y + 60, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(120)
    return Number(await sliderValue())
  })()
  assert(dragged < 50, `Glisser vers le bas montre le haut de l’image (${dragged} < 50)`)
  const expectedDrop = await page.evaluate(() => {
    const frame = document.querySelector('.detail-banner').getBoundingClientRect()
    const img = document.querySelector('.detail-banner img')
    const hidden = (frame.width * img.naturalHeight) / img.naturalWidth - frame.height
    return hidden > 0 ? (60 / hidden) * 100 : 0
  })
  assert(Math.abs((50 - dragged) - expectedDrop) <= 2, `Le déplacement suit la hauteur cachée (${dragged} pour −${expectedDrop.toFixed(1)} attendu)`)
  assert(await stored('films', 'film-portrait-de-la-jeune-fille-en-feu') === null, 'Rien n’est enregistré avant « Valider »')

  // ── 3. Annuler restaure la position initiale ───────────────────────────────────────────
  await actions().getByRole('button', { name: 'Annuler', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.banner-crop-surface').length === 0)
  assert(await imagePosition() === '50% 50%', `Annuler : le bandeau revient au centre (${await imagePosition()})`)
  assert(await stored('films', 'film-portrait-de-la-jeune-fille-en-feu') === null, 'Annuler : rien n’est écrit en base')

  // ── 4. Valider écrit la position, la fiche rouverte la relit ───────────────────────────
  const saved = await drag(60)
  await actions().getByRole('button', { name: 'Valider', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.banner-crop-surface').length === 0)
  await page.waitForTimeout(400)
  const persisted = await stored('films', 'film-portrait-de-la-jeune-fille-en-feu')
  assert(persisted === saved, `Valider : la position est écrite dans films.banner_position (${persisted} / ${saved})`)
  assert(await imagePosition() === `50% ${saved}%`, `Valider : le bandeau garde le recadrage (${await imagePosition()})`)
  await backToGrid('Films')
  await openCard('Portrait de la jeune fille en feu')
  assert(await imagePosition() === `50% ${saved}%`, `Fiche rouverte : la position vient de SQLite (${await imagePosition()})`)
  assert(await repositionButton().count() === 1, 'Fiche rouverte : le geste reste proposé')

  // ── 5. Clavier : flèches, Maj, Échap ───────────────────────────────────────────────────
  await repositionButton().click()
  await surface().waitFor()
  assert(await page.evaluate(() => document.activeElement?.classList.contains('banner-crop-surface') ?? false), 'Clavier : la surface prend le focus en entrant dans le geste')
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(80)
  const afterUp = Number(await sliderValue())
  assert(afterUp === Math.max(0, saved - 2), `Clavier : la flèche haut baisse de 2 (${saved} → ${afterUp})`)
  await page.keyboard.press('Shift+ArrowDown')
  await page.waitForTimeout(80)
  const afterShift = Number(await sliderValue())
  assert(afterShift === Math.min(100, afterUp + 10), `Clavier : Maj + flèche bas monte de 10 (${afterUp} → ${afterShift})`)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.querySelectorAll('.banner-crop-surface').length === 0)
  assert(await imagePosition() === `50% ${saved}%`, 'Clavier : Échap annule et restaure la position enregistrée')
  assert(await stored('films', 'film-portrait-de-la-jeune-fille-en-feu') === saved, 'Clavier : Échap n’écrit rien')

  // ── 6. Changer d’image remet la position à NULL ────────────────────────────────────────
  await banner().locator('.banner-edit-overlay').last().click()
  const dialog = page.getByRole('dialog', { name: 'Choisir une bannière' })
  await dialog.waitFor()
  const address = dialog.getByLabel('Adresse de l’image')
  await address.fill('https://picsum.photos/seed/recadrage/1920/1080')
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForTimeout(500)
  assert(await stored('films', 'film-portrait-de-la-jeune-fille-en-feu') === null, 'Nouvelle image : banner_position repasse à NULL')
  assert(await imagePosition() === '50% 50%', `Nouvelle image : le bandeau repart centré (${await imagePosition()})`)
  await backToGrid('Films')

  // ── 7. Série : un recadrage enregistré est honoré, puis modifié ────────────────────────
  await openLibrary('Séries')
  await openCard('Succession')
  await repositionButton().waitFor()
  assert(await imagePosition() === '50% 20%', `Série : la position enregistrée (20) est appliquée (${await imagePosition()})`)
  assert(await stored('series', 'series-succession') === 20, 'Série : la fixture porte bien 20 en base')
  const seriesSaved = await drag(-40)
  assert(seriesSaved > 20, `Série : glisser vers le haut augmente la position (${seriesSaved} > 20)`)
  await actions().getByRole('button', { name: 'Valider', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.banner-crop-surface').length === 0)
  await page.waitForTimeout(400)
  assert(await stored('series', 'series-succession') === seriesSaved, `Série : la position est écrite dans series.banner_position (${await stored('series', 'series-succession')})`)
  assert(await imagePosition() === `50% ${seriesSaved}%`, `Série : le bandeau garde le recadrage (${await imagePosition()})`)
  await backToGrid('Séries')
  await openCard('Succession')
  assert(await imagePosition() === `50% ${seriesSaved}%`, `Série rouverte : le recadrage est conservé (${await imagePosition()})`)

  // ── 8. La fixture 16:9 garde bien une hauteur cachée dans un bandeau 3:1 ───────────────
  const hidden = await page.evaluate(() => {
    const img = document.querySelector('.detail-banner img')
    const frame = document.querySelector('.detail-banner').getBoundingClientRect()
    return img.naturalWidth > 0 ? (frame.width * img.naturalHeight) / img.naturalWidth - frame.height : 0
  })
  assert(hidden > 0.5, `La fixture 16:9 garde une hauteur cachée dans un bandeau 3:1 (${Math.round(hidden)} px)`)

  await page.unroute('https://picsum.photos/**')
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return { ok: true, count: checks.length, checks }
  } catch (error) {
    return { ok: false, error: String(error), count: checks.length, passed: checks, pageErrors: errors }
  }
}
