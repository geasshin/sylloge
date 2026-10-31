// Bannières 16:9 (qa-app.html?demo=banners, SQLite en mémoire, images simulées : aucun réseau).
// La page de démonstration monte useBannerEditor + DetailBanner sur quatre lignes de fixtures ;
// les écritures passent par les dépôts réels et sont relues dans films/series/anime/games.banner_url.
// Ouvrir la session playwright-cli depuis le dossier scratch : aucune capture n'est écrite ici.
async page => {
  page.setDefaultTimeout(8000)
  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 }
  try {

  // Images simulées : un SVG 16:9 partout, sauf l'adresse « vertical » (portrait) et
  // « broken » (chargement impossible, pour l'état sans bandeau).
  const image = (width, height, fill) => ({
    status: 200,
    contentType: 'image/svg+xml',
    headers: { 'cache-control': 'no-store' },
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${fill}"/></svg>`,
  })
  await page.route('https://picsum.photos/**', route => route.fulfill(image(1600, 900, '#3b4a5a')))
  await page.route('**/seed/**vertical/**', route => route.fulfill(image(600, 900, '#7a3b2e')))
  await page.route('**/seed/**broken/**', route => route.abort())

  const url = 'http://127.0.0.1:5173/qa-app.html?scenario=full&demo=banners&lang=fr'
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  await page.getByRole('heading', { level: 1, name: /Bannières 16:9/ }).waitFor()

  const sql = (query, values = []) => page.evaluate(([q, v]) => window.__syllogeRecette.select(q, v), [query, values])
  const stored = async (table, id) => (await sql(`SELECT banner_url FROM ${table} WHERE id = $1`, [id]))[0]?.banner_url ?? null
  const card = id => page.locator(`.banner-demo-card[data-entry="${id}"]`)
  const dialog = () => page.getByRole('dialog', { name: 'Choisir une bannière' })
  const openAdd = async id => {
    await card(id).getByRole('button', { name: 'Ajouter une bannière' }).click()
    await dialog().waitFor()
  }
  const openEdit = async id => {
    await card(id).locator('.detail-banner').hover()
    await card(id).locator('.banner-edit-overlay').click()
    await dialog().waitFor()
  }
  const save = async () => {
    await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await dialog().waitFor({ state: 'hidden' })
    await page.waitForTimeout(400)
  }

  // ── 1. Sans bannière : aucun bandeau, un bouton pour en ajouter une ───────────────────────
  const film = 'film-drive-my-car'
  assert(await stored('films', film) === null, 'Film (fixture) : aucune bannière en base')
  assert(await card(film).locator('.detail-banner').count() === 0, 'Sans bannière : aucun bandeau vide affiché')
  assert(await card(film).getByRole('button', { name: 'Ajouter une bannière' }).count() === 1, 'Sans bannière : le bouton d’ajout est proposé')

  // ── 2. Fenêtre : les candidats officiels sont filtrés et triés (sans texte d’abord) ───────
  await openAdd(film)
  await card(film).locator('.banner-dialog-item').first().waitFor()
  const thumbs = await card(film).locator('.banner-dialog-item img').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')))
  assert(thumbs.length === 3, `Fenêtre : portrait et très large écartés (${thumbs.length} vignettes)`)
  assert(thumbs[0].includes('textless'), 'Fenêtre : l’image sans texte passe en tête')
  assert(thumbs[1].includes('-fr/'), 'Fenêtre : puis la langue de l’interface')
  assert(await card(film).getByRole('button', { name: 'Bannière actuellement choisie' }).count() === 0, 'Fenêtre : aucune sélection au départ')
  assert(await stored('films', film) === null, 'Fenêtre : rien n’est écrit à l’ouverture')

  // ── 3. Choisir une vignette puis Enregistrer : le bandeau apparaît, la base est écrite ────
  const firstThumb = thumbs[0]
  await card(film).locator('.banner-dialog-item').first().click()
  assert(await card(film).locator('.banner-dialog-item.active').count() === 1, 'Fenêtre : la vignette cliquée est marquée')
  // La vignette est en 320 px : c'est l'adresse en grand, recopiée dans le champ, qui est enregistrée.
  const textless = await dialog().getByLabel('Adresse de l’image').inputValue()
  assert(textless.includes('textless') && textless.includes('/1920/1080'), 'Fenêtre : la vignette pose l’adresse en grand dans le champ')
  assert(firstThumb.includes('/320/180'), 'Fenêtre : la vignette reste légère')
  await save()
  assert(await stored('films', film) === textless, 'Film : l’adresse choisie est écrite dans films.banner_url')
  assert(await card(film).locator('.detail-banner img').getAttribute('src') === textless, 'Film : le bandeau affiche l’image choisie')
  const box = await card(film).locator('.detail-banner').boundingBox()
  // Format 3:1, jamais plus haut que 50vh (31 octobre 2026). Le bord à bord se
  // mesure dans une vraie fiche : scripts/qa-banners-fiches.js.
  assert(box.height <= Math.ceil(viewport.height * 0.5) + 1, `Bandeau : hauteur bornée à 50vh (${Math.round(box.height)} px)`)
  assert(box.height >= Math.floor(viewport.height * 0.5) - 1 || Math.abs(box.width / box.height - 3) < 0.02, `Bandeau : format 3:1 sous la borne (${(box.width / box.height).toFixed(2)})`)

  // ── 4. Fermer sans Enregistrer ne retient rien ────────────────────────────────────────────
  await openEdit(film)
  await card(film).locator('.banner-dialog-item').nth(1).click()
  await dialog().getByRole('button', { name: 'Fermer', exact: true }).click()
  await dialog().waitFor({ state: 'hidden' })
  assert(await stored('films', film) === textless, 'Fermer sans Enregistrer laisse la bannière précédente')

  // ── 5. Adresse collée : aperçu recadré, avertissement si l’image est trop verticale ──────
  await openEdit(film)
  const vertical = 'https://picsum.photos/seed/banner-vertical/600/900'
  await dialog().getByLabel('Adresse de l’image').fill(vertical)
  await card(film).locator('.banner-dialog-preview img').waitFor()
  await dialog().getByText('Cette image est plus haute que large').waitFor()
  assert(true, 'Adresse collée : aperçu 16:9 et avertissement pour une image verticale')
  const previewBox = await card(film).locator('.banner-dialog-preview').boundingBox()
  assert(Math.abs(previewBox.width / previewBox.height - 16 / 9) < 0.05, 'Aperçu : cadre 16:9 même pour une image verticale')
  await save()
  assert(await stored('films', film) === vertical, 'Film : l’adresse collée est écrite dans films.banner_url')
  assert(await card(film).locator('.detail-banner img').getAttribute('src') === vertical, 'Film : le bandeau suit l’adresse collée')

  // ── 6. Une adresse refusée n’écrit rien ───────────────────────────────────────────────────
  await openEdit(film)
  await dialog().getByLabel('Adresse de l’image').fill('http://picsum.photos/seed/banner-http/1600/900')
  assert(await dialog().getByText('Une bannière doit être l’adresse https d’une image.').count() === 1, 'Adresse http : refus annoncé avant Enregistrer')
  assert(await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled(), 'Adresse http : Enregistrer reste désactivé')
  await page.keyboard.press('Escape')
  await dialog().waitFor({ state: 'hidden' })
  assert(await stored('films', film) === vertical, 'Adresse refusée : la bannière précédente est intacte')

  // ── 6 bis. Bannière TMDB enregistrée en w1280 : affichée en définition d'origine ─────────
  await page.route('https://image.tmdb.org/**', route => route.fulfill(image(1920, 1080, '#2e3b4a')))
  const legacy = 'https://image.tmdb.org/t/p/w1280/ancienne.jpg'
  await openEdit(film)
  await dialog().getByLabel('Adresse de l’image').fill(legacy)
  await save()
  assert(await stored('films', film) === legacy, 'Ancienne bannière : la base garde l’adresse telle quelle')
  assert(await card(film).locator('.detail-banner img').getAttribute('src') === 'https://image.tmdb.org/t/p/original/ancienne.jpg', 'Ancienne bannière : affichée en original, jamais en w1280 étiré')
  await page.unroute('https://image.tmdb.org/**')

  // ── 7. Retirer la bannière ───────────────────────────────────────────────────────────────
  await openEdit(film)
  await dialog().getByRole('button', { name: 'Retirer la bannière' }).click()
  await save()
  assert(await stored('films', film) === null, 'Retirer : films.banner_url redevient nul')
  assert(await card(film).locator('.detail-banner').count() === 0, 'Retirer : le bandeau disparaît')
  assert(await card(film).getByRole('button', { name: 'Ajouter une bannière' }).count() === 1, 'Retirer : le bouton d’ajout revient')

  // ── 8. Séries, animation japonaise et jeux : même fenêtre, même écriture ─────────────────
  for (const [entry, table, label] of [
    ['series-severance', 'series', 'Série'],
    ['series-arcane', 'anime', 'Animation japonaise'],
    ['game-hades', 'games', 'Jeu'],
  ]) {
    await openAdd(entry)
    await card(entry).locator('.banner-dialog-item').first().waitFor()
    await card(entry).locator('.banner-dialog-item').first().click()
    const chosen = await dialog().getByLabel('Adresse de l’image').inputValue()
    await save()
    assert(await stored(table, entry) === chosen, `${label} : l’adresse choisie est écrite dans ${table}.banner_url`)
    assert(await card(entry).locator('.detail-banner img').getAttribute('src') === chosen, `${label} : le bandeau s’affiche`)
  }

  // ── 9. Fiche sans fournisseur : état explicite, aucune demande d’images ──────────────────
  const requestsBefore = JSON.stringify(await page.evaluate(() => window.__syllogeRecette.bannerRequests()))
  const bare = 'film-petite-maman'
  await openAdd(bare)
  await dialog().getByText('Aucune image officielle : cette fiche n’est associée à aucun fournisseur').waitFor()
  assert(await card(bare).locator('.banner-dialog-item').count() === 0, 'Sans identifiant : aucune vignette inventée')
  await dialog().getByLabel('Adresse de l’image').fill('https://picsum.photos/seed/banner-collee/1600/900')
  await save()
  assert(await stored('films', bare) === 'https://picsum.photos/seed/banner-collee/1600/900', 'Sans identifiant : l’adresse collée reste enregistrable')
  assert(JSON.stringify(await page.evaluate(() => window.__syllogeRecette.bannerRequests())) === requestsBefore, 'Sans identifiant : aucune demande d’images envoyée')

  // ── 10. Contrat de la commande simulée : refus sans identifiant, réponse vide pour « 0 » ─
  const refusal = await page.evaluate(() => {
    try {
      window.__syllogeRecette.bannerCandidates('film', '')
      return 'aucune erreur'
    } catch (error) {
      return String(error)
    }
  })
  assert(refusal.includes('identifiant du fournisseur est absent'), `Contrat : refus sans identifiant (${refusal})`)
  const empty = await page.evaluate(() => window.__syllogeRecette.bannerCandidates('game', '0'))
  assert(Array.from(empty).length === 0, 'Contrat : aucune image officielle pour un identifiant sans visuel')

  // ── 11. Image qui ne se charge pas : le bandeau disparaît proprement ─────────────────────
  const broken = 'https://picsum.photos/seed/banner-broken/1600/900'
  await openAdd(film)
  await dialog().getByLabel('Adresse de l’image').fill(broken)
  await dialog().getByText('Cette adresse ne semble pas mener à une image.').waitFor()
  await save()
  await page.waitForTimeout(800)
  assert(await stored('films', film) === broken, 'Image en échec : la base garde l’adresse')
  assert(await card(film).locator('.detail-banner').count() === 0, 'Image en échec : aucun cadre vide, le bandeau disparaît')
  const replace = card(film).getByRole('button', { name: 'Bannière introuvable · La remplacer' })
  assert(await replace.count() === 1, 'Image en échec : un bouton permet de la remplacer')
  await replace.click()
  await dialog().waitFor()
  assert(await dialog().isVisible(), 'Image en échec : le bouton rouvre la fenêtre de choix')
  await dialog().getByRole('button', { name: 'Retirer la bannière' }).click()
  await save()
  await page.waitForTimeout(400)
  assert(await stored('films', film) === null, 'Image en échec : la bannière morte peut être retirée')

  // ── 12. Anglais : la fenêtre et ses actions sont traduites ───────────────────────────────
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&demo=banners&lang=en')
  await page.getByRole('heading', { level: 1, name: /banners/i }).waitFor()
  // Nouvelle page, base refaite : la série n'a pas encore de bannière.
  await page.locator('.banner-demo-card[data-entry="series-severance"]').getByRole('button', { name: 'Add a banner' }).click()
  const english = page.getByRole('dialog', { name: 'Choose a banner' })
  await english.waitFor()
  const englishText = await english.innerText()
  for (const copy of ['A landscape image for', 'Image address', 'An https address is enough', 'Remove banner', 'Save']) {
    assert(englishText.includes(copy), `Anglais : « ${copy} » est traduit`)
  }
  assert(await english.getByLabel('Official images').count() === 1, 'Anglais : la galerie porte son nom accessible traduit')
  assert(await english.getByRole('button', { name: 'Choose this banner' }).count() === 3, 'Anglais : chaque vignette est nommée en anglais')
  await page.keyboard.press('Escape')

  await page.unroute('https://picsum.photos/**')
  await page.unroute('**/seed/**vertical/**')
  await page.unroute('**/seed/**broken/**')
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return { ok: true, count: checks.length, checks }
  } catch (error) {
    // Le dernier contrôle réussi et l'erreur, pour savoir où la recette s'arrête.
    return { ok: false, error: String(error), count: checks.length, passed: checks, pageErrors: errors }
  }
}
