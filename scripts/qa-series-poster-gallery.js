// Galerie d'affiches TMDB des fiches Séries et Animation japonaise (qa-app.html, SQLite en
// mémoire, images simulées : aucun réseau).
//
// Scénario `posters` : les sept bibliothèques des fixtures, plus un lien TMDB pour Severance
// (série) et Arcane (animé). La recette vérifie :
// - la galerie s'ouvre au crayon de l'affiche, avec les six affiches factices dans l'ordre du
//   natif, leurs vignettes `w342` et l'affiche actuelle de la fiche en tête ;
// - choisir la 3e écrit son adresse `w500` dans `series.poster_url` et change l'affiche de la
//   fiche ; « Valider » ferme ; rouvrir la galerie ne redemande rien (une demande par
//   identifiant) et garde la sélection ;
// - le même parcours sur un animé (`anime.poster_url`) ;
// - une série sans lien garde le dialogue d'adresse ;
// - un chargement en échec affiche le message et « Réessayer », qui relance la demande ;
// - une liste vide le dit et laisse la tuile « + » ;
// - en anglais, la fenêtre et ses libellés sont traduits.
//
// Ouvrir la session playwright-cli depuis le dossier scratch : aucune capture n'est écrite ici.
async page => {
  page.setDefaultTimeout(8000)
  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }

  // Deux hôtes d'images seulement : photos de fixtures et affiches TMDB factices. Chaque
  // réponse est un SVG à la taille demandée, donc aucun accès réseau.
  const svg = (width, height) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#3b4a5a"/></svg>`
  await page.route('https://picsum.photos/**', route => {
    const size = route.request().url().match(/\/(\d+)\/(\d+)(?:\?.*)?$/)
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'cache-control': 'no-store' },
      body: svg(size ? size[1] : '400', size ? size[2] : '600'),
    })
  })
  // La fiche demande w780 pour la netteté (`detailImageUrl`), les vignettes w342 et la
  // base garde w500 : les trois tailles sont servies, aucune requête ne part.
  await page.route('https://image.tmdb.org/**', route => {
    const match = /\/(w342|w500|w780)\/qa-poster-\d+\.jpg$/.exec(route.request().url())
    const sizes = { w342: [342, 513], w500: [500, 750], w780: [780, 1170] }
    const size = sizes[match?.[1]] ?? [500, 750]
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'cache-control': 'no-store' },
      body: svg(size[0], size[1]),
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
  const sql = (query, values = []) => page.evaluate(([q, v]) => window.__syllogeRecette.select(q, v), [query, values])
  const write = (query, values = []) => page.evaluate(([q, v]) => window.__syllogeRecette.execute(q, v), [query, values])
  const requests = () => page.evaluate(() => window.__syllogeRecette.posterRequests())
  const stored = async (table, id) => (await sql(`SELECT poster_url FROM ${table} WHERE id = $1`, [id]))[0]?.poster_url ?? null
  const detailSrc = () => page.locator('.detail-poster img').first().getAttribute('src')
  const dialog = (name = 'Choisir une affiche') => page.getByRole('dialog', { name })
  const addTile = () => dialog().locator('.poster-dialog-add')
  const candidateSelectors = () => dialog().locator('.poster-dialog-item:not(.poster-dialog-add) img')
  const qaPosterSrcs = async () => (await candidateSelectors().evaluateAll(nodes => nodes.map(node => node.getAttribute('src'))))
    .filter(src => src && src.includes('/qa-poster-'))
  const openGallery = async () => {
    await page.locator('.detail-poster .poster-edit-overlay').click()
    await dialog().waitFor()
  }
  // La fiche demande la grande taille au service (`detailImageUrl`, w780) ; la
  // base garde l'adresse w500 enregistrée.
  const choosePoster = async index => {
    await dialog().locator(`.poster-dialog-item img[src$="/w342/qa-poster-${index}.jpg"]`).click()
    await page.waitForFunction(
      expected => document.querySelector('.detail-poster img')?.getAttribute('src') === expected,
      `https://image.tmdb.org/t/p/w780/qa-poster-${index}.jpg`,
    )
  }
  const validate = async () => {
    await dialog().getByRole('button', { name: 'Valider', exact: true }).click()
    await dialog().waitFor({ state: 'hidden' })
  }
  const closeDialog = async () => {
    await page.keyboard.press('Escape')
    await dialog().waitFor({ state: 'hidden' })
  }
  const provider = async (medium, mediaId, providerId) => {
    await write(
      `INSERT INTO media_provider_links (profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['qa-profile', medium, mediaId, 'TMDB', providerId, '2026-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z'],
    )
  }

  try {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=posters&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()

  // ── 0. Le scénario porte bien un lien TMDB par bibliothèque ─────────────────────────────
  const links = await sql('SELECT medium, media_id FROM media_provider_links ORDER BY medium')
  assert(links.some(link => link.medium === 'series' && link.media_id === 'series-severance'), 'Fixture : Severance a un lien TMDB')
  assert(links.some(link => link.medium === 'anime' && link.media_id === 'series-arcane'), 'Fixture : Arcane a un lien TMDB')

  // ── 1. Série associée : galerie, ordre, sélection, écriture en base ──────────────────────
  await openLibrary('Séries')
  await openCard('Severance')
  const seededPoster = await detailSrc()
  assert(seededPoster.includes('sylloge-series-severance'), `Série : l’affiche de la fixture est en place (${seededPoster})`)
  await openGallery()
  assert(await dialog().getByRole('heading', { name: 'Choisir une affiche' }).count() === 1, 'Série : la galerie s’ouvre au crayon de l’affiche')
  await dialog().locator('.poster-dialog-item img[src$="/qa-poster-6.jpg"]').waitFor()
  const srcs = await qaPosterSrcs()
  assert(srcs.length === 6, `Série : six affiches factices (${srcs.length})`)
  assert(srcs.every((src, index) => src.endsWith(`/w342/qa-poster-${index + 1}.jpg`)), `Série : les vignettes suivent l’ordre du natif et la taille w342 (${srcs.join(' | ')})`)
  const currentTile = dialog().getByTitle('Affiche actuelle')
  assert(await currentTile.count() === 1, 'Série : l’affiche actuelle de la fiche a sa tuile en tête')
  assert((await currentTile.locator('img').getAttribute('src')).includes('sylloge-series-severance'), 'Série : la tuile de tête montre l’affiche actuelle')
  assert((await dialog().innerText()).includes('Affiches fournies par'), 'Série : l’attribution TMDB est affichée')

  // La tuile « + » ouvre le dialogue d'adresse, et le refermer rend la galerie.
  await addTile().click()
  const urlDialog = page.getByRole('dialog', { name: 'Modifier l’affiche' })
  await urlDialog.waitFor()
  assert(await urlDialog.getByLabel('Adresse de l’image').count() === 1, 'Série : la tuile « + » ouvre le lien personnel')
  await page.keyboard.press('Escape')
  await urlDialog.waitFor({ state: 'hidden' })
  assert(await dialog().isVisible(), 'Série : la galerie reste ouverte après le lien personnel')

  await choosePoster(3)
  assert(await stored('series', 'series-severance') === 'https://image.tmdb.org/t/p/w500/qa-poster-3.jpg', 'Série : la 3e affiche est écrite w500 dans series.poster_url')
  assert((await detailSrc()) === 'https://image.tmdb.org/t/p/w780/qa-poster-3.jpg', 'Série : l’affiche de la fiche affiche la taille choisie (w780 demandée pour la fiche)')
  assert(await dialog().locator('.poster-dialog-item[aria-pressed="true"] img[src$="/w342/qa-poster-3.jpg"]').count() === 1, 'Série : la vignette choisie porte la sélection')
  await validate()
  assert((await requests()).filter(request => request === 'series:95396').length === 1, 'Série : une seule demande pour la galerie')

  // Rouvrir la galerie ne redemande rien et retrouve la sélection.
  await openGallery()
  await dialog().locator('.poster-dialog-item img[src$="/qa-poster-3.jpg"]').waitFor()
  assert((await requests()).filter(request => request === 'series:95396').length === 1, 'Série : rouvrir ne relance pas la demande (une par identifiant)')
  assert(await dialog().locator('.poster-dialog-item[aria-pressed="true"] img[src$="/w342/qa-poster-3.jpg"]').count() === 1, 'Série : la sélection enregistrée est active à la réouverture')
  assert(await dialog().getByTitle('Affiche actuelle').count() === 0, 'Série : l’affiche choisie fait partie de la galerie, pas de tuile à part')
  await closeDialog()
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Séries', exact: true }).waitFor()
  await settle()

  // ── 2. Animé associé : même parcours, autre table ────────────────────────────────────────
  await openLibrary('Animation japonaise')
  await openCard('Arcane')
  await openGallery()
  await dialog().locator('.poster-dialog-item img[src$="/qa-poster-6.jpg"]').waitFor()
  assert((await qaPosterSrcs()).length === 6, 'Animé : six affiches factices')
  assert(await dialog().getByTitle('Affiche actuelle').count() === 1, 'Animé : l’affiche de la fiche est montrée en tête')
  await choosePoster(5)
  assert(await stored('anime', 'series-arcane') === 'https://image.tmdb.org/t/p/w500/qa-poster-5.jpg', 'Animé : la 5e affiche est écrite w500 dans anime.poster_url')
  assert((await detailSrc()) === 'https://image.tmdb.org/t/p/w780/qa-poster-5.jpg', 'Animé : l’affiche de la fiche change')
  await validate()
  assert((await requests()).filter(request => request === 'anime:94605').length === 1, 'Animé : une seule demande pour la galerie')
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Animation japonaise', exact: true }).waitFor()
  await settle()

  // ── 3. Série sans lien : le dialogue d'adresse reste le seul chemin ───────────────────────
  await openLibrary('Séries')
  await openCard('The Bear')
  await page.locator('.detail-poster .poster-edit-overlay').click()
  const addressDialog = page.getByRole('dialog', { name: 'Modifier l’affiche' })
  await addressDialog.waitFor()
  assert(await dialog().count() === 0, 'Sans lien : aucune galerie TMDB')
  assert(await addressDialog.getByLabel('Adresse de l’image').count() === 1, 'Sans lien : le dialogue d’adresse s’ouvre comme avant')
  await page.keyboard.press('Escape')
  await addressDialog.waitFor({ state: 'hidden' })
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Séries', exact: true }).waitFor()
  await settle()

  // ── 4. Échec de chargement : message et « Réessayer » qui relance ────────────────────────
  await provider('series', 'series-twin-peaks', 'introuvable')
  await openLibrary('Séries')
  await openCard('Twin Peaks')
  await openGallery()
  const alert = dialog().getByRole('alert')
  await alert.waitFor()
  assert((await alert.innerText()).includes('Les affiches officielles n’ont pas pu être chargées.'), 'Échec : le message est affiché')
  assert(await addTile().count() === 1, 'Échec : la tuile « + » reste disponible')
  const failed = (await requests()).filter(request => request === 'series:introuvable').length
  assert(failed === 1, `Échec : une première demande (${failed})`)
  await dialog().getByRole('button', { name: 'Réessayer', exact: true }).click()
  await page.waitForFunction(() => window.__syllogeRecette.posterRequests().filter(r => r === 'series:introuvable').length === 2)
  assert(await alert.isVisible(), 'Échec : « Réessayer » relance la demande et le message reste')
  await closeDialog()
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Séries', exact: true }).waitFor()
  await settle()

  // ── 5. Liste vide : elle le dit, la tuile « + » reste ────────────────────────────────────
  await provider('series', 'series-fleabag', '0')
  await openLibrary('Séries')
  await openCard('Fleabag')
  await openGallery()
  const empty = dialog().getByRole('status').filter({ hasText: 'Aucune affiche officielle pour cette série' })
  await empty.waitFor()
  assert(await addTile().count() === 1, 'Vide : la tuile « + » reste en tête')
  assert((await qaPosterSrcs()).length === 0, 'Vide : aucune affiche annoncée')
  await closeDialog()

  // ── 6. Anglais : fenêtre, états et libellés traduits ─────────────────────────────────────
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=posters&lang=en')
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await openLibrary('Series')
  await openCard('Severance')
  await page.locator('.detail-poster .poster-edit-overlay').click()
  const englishDialog = page.getByRole('dialog', { name: 'Choose a poster' })
  await englishDialog.waitFor()
  await englishDialog.locator('.poster-dialog-item img[src$="/qa-poster-6.jpg"]').waitFor()
  const englishText = await englishDialog.innerText()
  for (const copy of ['Posters provided by', 'Apply']) {
    assert(englishText.includes(copy), `Anglais : « ${copy} » est traduit (${englishText.slice(0, 120)})`)
  }
  assert(await englishDialog.getByRole('button', { name: 'Add a poster from a URL', exact: true }).count() === 1, 'Anglais : la tuile « + » est nommée « Add a poster from a URL »')
  assert(await englishDialog.getByTitle('Current poster').count() === 1, 'Anglais : la tuile de l’affiche actuelle est nommée')
  await page.keyboard.press('Escape')
  await englishDialog.waitFor({ state: 'hidden' })

  await page.unroute('https://picsum.photos/**')
  await page.unroute('https://image.tmdb.org/**')
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return { ok: true, count: checks.length, checks }
  } catch (error) {
    // Le dernier contrôle réussi et l'erreur, pour savoir où la recette s'arrête.
    return { ok: false, error: String(error), count: checks.length, passed: checks, pageErrors: errors }
  }
}
