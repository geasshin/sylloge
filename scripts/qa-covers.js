// Couvertures et affiches par lien (qa-app.html, données synthétiques, images simulées : aucun réseau).
// Ouvrir la session playwright-cli depuis le dossier scratch : aucune capture n'est écrite ici.
// Défauts gardés : (1) la fiche associée à TMDB montrait « Sans affiche » dans le formulaire alors que
// la fiche détail l'affichait ; (2) le crayon du formulaire Film n'ouvrait rien (le dialogue n'était pas
// monté en mode intégré) ; (3) un lien collé dans la galerie était refusé par le cache TMDB.
async page => {
  page.setDefaultTimeout(8000)
  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  // Hermétique : les liens d'image de la recette visent picsum.photos, un service externe parfois très lent
  // (9 s, ou rien). Une image simulée suffit : la recette vérifie quelle image l'application choisit, pas le réseau.
  await page.route('https://picsum.photos/**', route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    headers: { 'cache-control': 'no-store' },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#7a3b2e"/></svg>',
  }))
  const nav = () => page.getByRole('navigation', { name: 'Navigation principale' })
  const sql = (query, values = []) => page.evaluate(([q, v]) => window.__syllogeRecette.select(q, v), [query, values])
  // La barre latérale se déplie sous le pointeur et intercepte les clics : on l'écarte et on attend qu'elle se replie.
  const settle = async () => {
    await page.mouse.move(900, 500)
    await page.locator('.sidebar-expanded').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
  }
  const link = seed => `https://picsum.photos/seed/qa-couverture-${seed}/400/600`
  const detailSrc = () => page.locator('.detail-poster img').first().getAttribute('src')
  const storedPoster = async title => (await sql('SELECT poster_url FROM films WHERE title = $1', [title]))[0]?.poster_url ?? null

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()

  const openFilm = async title => {
    await nav().getByRole('button', { name: 'Films', exact: true }).click()
    await page.getByRole('heading', { level: 1, name: 'Films' }).waitFor()
    await settle()
    // La bibliothèque peut s'ouvrir sur une vue filtrée : « Tous » montre toute la collection.
    await page.getByRole('button', { name: 'Tous', exact: true }).first().click()
    await page.waitForTimeout(400)
    await page.getByText(title, { exact: true }).first().click()
    await page.locator('.detail-poster').first().waitFor()
    await page.waitForTimeout(500)
  }
  const pasteIntoUrlDialog = async (url, dialogName = 'Modifier l’affiche') => {
    const dialog = page.getByRole('dialog', { name: dialogName })
    await dialog.waitFor()
    await dialog.getByLabel('Adresse de l’image').fill(url)
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
  }

  // ── 1. Film associé, sans affiche locale : le formulaire montre l'affiche TMDB (défaut 1) ──────────
  const tmdbOnly = 'Drive My Car'
  assert(await storedPoster(tmdbOnly) === null, `${tmdbOnly} : aucune affiche locale (fixture)`)
  await openFilm(tmdbOnly)
  assert((await detailSrc()).includes('sylloge-drive-my-car'), 'Fiche détail : affiche du fournisseur')
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().click()
  const editForm = page.locator('.editor-dialog-embedded')
  await editForm.waitFor()
  await page.waitForTimeout(500)
  assert(await editForm.locator('.form-poster-preview-lg .poster-fallback').count() === 0, 'Formulaire : pas de « Sans affiche » sur une fiche associée')
  assert((await editForm.locator('.form-poster-preview-lg img').getAttribute('src')).includes('sylloge-drive-my-car'), 'Formulaire : même affiche que la fiche détail')

  // ── 2. Le crayon du formulaire ouvre le dialogue et le lien s'enregistre avec la fiche (défaut 2) ──
  const first = link('drive-my-car')
  await editForm.locator('.form-poster-preview-lg .poster-edit-overlay').click()
  await pasteIntoUrlDialog(first)
  assert((await editForm.locator('.form-poster-preview-lg img').getAttribute('src')) === first, 'Formulaire : aperçu du lien collé')
  assert(await storedPoster(tmdbOnly) === null, 'Rien n’est écrit avant « Enregistrer »')
  await editForm.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await page.locator('.detail-poster').first().waitFor()
  await page.waitForTimeout(500)
  assert(await storedPoster(tmdbOnly) === first, 'Lien personnel enregistré dans films.poster_url')
  assert((await detailSrc()) === first, 'Fiche détail : le lien personnel passe devant l’affiche TMDB')
  assert((await sql('SELECT selected_poster_url FROM film_tmdb_cache WHERE film_id = $1', ['film-drive-my-car']))[0].selected_poster_url === null, 'Le cache TMDB n’a pas été touché')

  // ── 3. Annuler le formulaire annule aussi le lien ──────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().click()
  await editForm.waitFor()
  await editForm.locator('.form-poster-preview-lg .poster-edit-overlay').click()
  await pasteIntoUrlDialog(link('annule'))
  await editForm.getByRole('button', { name: 'Annuler', exact: true }).click()
  await editForm.waitFor({ state: 'hidden' })
  assert(await storedPoster(tmdbOnly) === first, 'Annuler le formulaire conserve le lien précédent')

  // ── 4. Fiche détail, film non associé : le crayon ouvre directement le dialogue d'adresse ─────────
  const bare = 'Petite Maman'
  await openFilm(bare)
  assert(await page.locator('.detail-poster .poster-fallback').count() === 1, `${bare} : « Sans affiche » au départ`)
  await page.locator('.detail-poster .poster-edit-overlay').click()
  assert(await page.getByRole('dialog', { name: 'Choisir une affiche' }).count() === 0, 'Film non associé : pas de galerie TMDB')
  const bareLink = link('petite-maman')
  await pasteIntoUrlDialog(bareLink)
  await page.waitForTimeout(400)
  assert((await detailSrc()) === bareLink, 'Fiche détail : lien affiché sans recharger')
  assert(await storedPoster(bare) === bareLink, 'Film non associé : lien dans films.poster_url')
  // Le retrait (champ vidé) rend « Sans affiche ».
  await page.locator('.detail-poster .poster-edit-overlay').click()
  await pasteIntoUrlDialog('')
  await page.waitForTimeout(400)
  assert(await storedPoster(bare) === null && await page.locator('.detail-poster .poster-fallback').count() === 1, 'Champ vidé : retour à « Sans affiche »')

  // ── 5. Film associé : la galerie accepte un lien, puis une affiche TMDB le remplace (défaut 3) ────
  const gallery = 'Aftersun'
  await openFilm(gallery)
  await page.locator('.detail-poster .poster-edit-overlay').click()
  const dialog = page.getByRole('dialog', { name: 'Choisir une affiche' })
  await dialog.waitFor()
  await dialog.getByRole('button', { name: 'Ajouter une affiche depuis une URL', exact: true }).click()
  const galleryLink = link('aftersun')
  await pasteIntoUrlDialog(galleryLink)
  await page.waitForTimeout(500)
  assert(await dialog.isVisible(), 'La galerie reste ouverte après le lien')
  assert((await dialog.getByRole('button', { name: 'Affiche actuellement choisie' }).locator('img').getAttribute('src')) === galleryLink, 'Galerie : le lien actif a sa tuile')
  assert((await detailSrc()) === galleryLink && await storedPoster(gallery) === galleryLink, 'Fiche : lien de la galerie affiché et enregistré')
  const alternative = (await dialog.locator('.poster-dialog-item:not(.poster-dialog-add):not(.active) img').first().getAttribute('src'))
  await dialog.locator('.poster-dialog-item:not(.poster-dialog-add):not(.active)').first().click()
  await page.waitForTimeout(600)
  assert((await detailSrc()) === alternative, 'Une affiche TMDB choisie remplace le lien personnel')
  assert(await storedPoster(gallery) === alternative, 'L’adresse de la fiche suit le choix de la galerie')
  await dialog.getByRole('button', { name: 'Affiche par défaut', exact: true }).click()
  await page.waitForTimeout(600)
  assert((await detailSrc()).includes('sylloge-aftersun') && await storedPoster(gallery) === null, 'Affiche par défaut : retour à l’affiche principale')
  await dialog.getByRole('button', { name: 'Valider', exact: true }).click().catch(() => {})

  // ── 6. Adresse invalide refusée avec un message ────────────────────────────────────────────────────
  await openFilm(bare)
  await page.locator('.detail-poster .poster-edit-overlay').click()
  const invalid = page.getByRole('dialog', { name: 'Modifier l’affiche' })
  await invalid.getByLabel('Adresse de l’image').fill('pas-une-adresse')
  await invalid.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  assert(await invalid.getByRole('alert').isVisible(), 'Adresse invalide : message visible')
  assert(await storedPoster(bare) === null, 'Adresse invalide : rien d’enregistré')
  await invalid.getByRole('button', { name: 'Fermer' }).click().catch(() => page.keyboard.press('Escape'))

  // ── 7. Toutes les autres bibliothèques : crayon du formulaire, lien enregistré, fiche à jour ─────────
  // Une fiche sans couverture pour chaque bibliothèque quand la fixture en fournit une ; sinon on remplace.
  const libraries = [
    ['Séries', 'Mad Men'],
    ['Animation japonaise', 'Neon Genesis Evangelion'],
    ['Livres', 'L’Anomalie'],
    ['Mangas', 'Monster'],
    ['Jeux', 'Return of the Obra Dinn'],
    ['Art', 'Nighthawks'],
    ['Comics', null],
  ]
  let n = 0
  for (const [library, fixedTitle] of libraries) {
    n += 1
    const url = link(`bibliotheque-${n}`)
    await nav().getByRole('button', { name: library, exact: true }).click()
    await page.getByRole('heading', { level: 1, name: library }).waitFor()
    await settle()
    await page.getByRole('button', { name: 'Tous', exact: true }).first().click().catch(() => {})
    await page.waitForTimeout(400)
    const title = fixedTitle ?? (await page.locator('.custom-card b').first().innerText())
    await page.getByText(title, { exact: true }).first().click()
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /^Modifier/ }).first().click()
    const form = page.locator('.editor-dialog-embedded, .editor-dialog, [role="dialog"]').first()
    await form.locator('.poster-edit-overlay').first().click()
    const urlDialog = page.getByRole('dialog', { name: /^Modifier (l’affiche|la couverture|le visuel)/ })
    await urlDialog.waitFor()
    await urlDialog.getByLabel('Adresse de l’image').fill(url)
    await urlDialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await urlDialog.waitFor({ state: 'hidden' })
    await form.getByRole('button', { name: /^(Enregistrer les modifications|Enregistrer)$/ }).last().click()
    await page.waitForTimeout(900)
    const shown = await page.locator('.detail-poster img, .detail-poster-wrap img, .poster img').first().getAttribute('src')
    assert(shown === url, `${library} : « ${title} » affiche le lien collé dans le formulaire`)
  }

  // ── 8. Aperçu du lien avant d'enregistrer ──────────────────────────────────────────────────────────
  await openFilm(bare)
  await page.locator('.detail-poster .poster-edit-overlay').click()
  const preview = page.getByRole('dialog', { name: 'Modifier l’affiche' })
  await preview.waitFor()
  assert(await preview.locator('.poster-url-preview').count() === 0, 'Aperçu : rien tant que le champ est vide')
  await preview.getByLabel('Adresse de l’image').fill(link('apercu'))
  await preview.locator('.poster-url-preview img').waitFor()
  assert((await preview.locator('.poster-url-preview img').getAttribute('src')) === link('apercu'), 'Aperçu : l’image du lien s’affiche avant l’enregistrement')
  await preview.getByLabel('Adresse de l’image').fill('https://adresse-introuvable.invalid/image.png')
  await preview.getByRole('status').filter({ hasText: 'ne semble pas mener à une image' }).waitFor({ timeout: 10000 })
  assert(true, 'Aperçu : message quand le lien ne mène pas à une image')
  assert(await storedPoster(bare) === null, 'Aperçu : rien n’est enregistré sans valider')
  await page.keyboard.press('Escape')

  await page.unroute('https://picsum.photos/**')
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
