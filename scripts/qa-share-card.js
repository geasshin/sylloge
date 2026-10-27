// Carte à partager (qa-app.html : le harnais simule l'enregistrement natif et l'ouverture du navigateur).
//
// Gardes : l'entrée « Partager mes coups de cœur » sous le titre de chaque bibliothèque (jamais dans la
// rangée des actions), et « Partager mon profil » sur l'accueil ; la fenêtre pose des questions
// (coup de cœur principal, autres coups de cœur, chiffres à garder, format) et l'aperçu suit chaque
// réponse ; les affiches passent par la commande native qui rend leurs octets (le canevas n'a alors
// besoin d'aucune autorisation inter-sites) ; deux formats aux tailles exactes (standard 1 080 × 1 350,
// story 1 080 × 1 920) ; le vrai logo (Σ) dessiné dans l'en-tête ; chaque réseau choisit son format ;
// « copier » met un vrai PNG dans le presse-papiers puis le service s'ouvre ; le repli (copie refusée)
// enregistre le fichier ; la story Instagram enregistre sans rien ouvrir ; les bibliothèques ajoutées ne
// sont pas proposées ; images refusées par le serveur = tuile de titre, export toujours possible ;
// demi-étoiles au pixel ; aucun coup de cœur = message.
async page => {
  page.setDefaultTimeout(12000)
  const checks = []
  const errors = []
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|net::ERR|CORS|access control/i.test(message.text())) errors.push(message.text().slice(0, 200)) })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])

  // Chaque adresse d'image reçoit sa propre couleur : deux affiches différentes ne se confondent pas, ce qui
  // permet de prouver qu'un autre choix change bien l'image dessinée.
  const svg = (label, url) => {
    let hash = 0
    for (const char of url) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="hsl(${hash % 360} 55% 38%)"/><text x="200" y="300" font-size="40" fill="#fff" text-anchor="middle">${label}</text></svg>`
  }
  let cors = true
  await page.route('https://picsum.photos/**', route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    // Playwright ajoute lui-même l'autorisation inter-sites à une réponse simulée qui n'en déclare pas :
    // pour simuler un serveur qui refuse, il faut déclarer une autre origine (le navigateur rejette l'image).
    headers: { 'access-control-allow-origin': cors ? '*' : 'https://autre-origine.invalid', 'cache-control': 'no-store' },
    body: svg('QA', route.request().url()),
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
  const dialog = () => page.getByRole('dialog', { name: /Partager (mes coups de cœur|mon profil)/ })
  // La croix de l'en-tête ferme à toute étape ; le bouton « Fermer » n'existe qu'à la dernière.
  const closeDialog = () => dialog().getByRole('button', { name: 'Fermer l’assistant', exact: true }).click()
  const step = name => dialog().locator('.share-steps').getByRole('button', { name })
  const next = () => dialog().getByRole('button', { name: 'Continuer', exact: true }).click()
  // Empreinte de l'image affichée : change dès que la carte est redessinée avec une autre réponse.
  const fingerprint = () => page.evaluate(() => {
    const canvas = document.querySelector('canvas.share-card-canvas')
    if (!canvas) return 'aucune'
    const data = canvas.toDataURL()
    let hash = 0
    for (let index = 0; index < data.length; index += 61) hash = (hash * 31 + data.charCodeAt(index)) >>> 0
    return String(hash)
  })
  const redrawn = async (before, what) => { await page.waitForFunction(previous => {
    const canvas = document.querySelector('canvas.share-card-canvas')
    if (!canvas) return false
    const data = canvas.toDataURL()
    let hash = 0
    for (let index = 0; index < data.length; index += 61) hash = (hash * 31 + data.charCodeAt(index)) >>> 0
    return String(hash) !== previous
  }, before).catch(() => { throw Error(`L’aperçu ne s’est pas redessiné : ${what}`) }) }
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

  // ── 1. L'entrée est sur la page de la bibliothèque ; la fenêtre pose ses questions, l'aperçu les suit ──
  await start()
  await page.locator('nav').getByRole('button', { name: 'Films', exact: true }).click()
  // Le partage se lit sous le titre, à côté du décompte — jamais dans la rangée des actions.
  const libraryShare = () => page.locator('.library-subtitle').getByRole('button', { name: 'Partager mes coups de cœur', exact: true })
  assert(await libraryShare().count() === 1, 'Page Films : un lien « Partager mes coups de cœur » sous le titre')
  assert(await libraryShare().locator('svg').count() === 1, 'Page Films : le lien porte une icône de partage')
  assert(await page.locator('.library-header-actions').getByRole('button', { name: /Partager/ }).count() === 0, 'Page Films : le partage n’est pas un bouton de plus dans la rangée des actions')
  await libraryShare().click()
  await dialog().waitFor()
  await canvas().waitFor()
  assert(JSON.stringify(await size()) === '[1080,1350]', `Standard d'office : 1 080 × 1 350 (${await size()})`)
  assert(await page.locator('#share-card-scope').count() === 0, 'Depuis une bibliothèque, la portée est fixée : pas de choix de contenu')
  const stepNames = await dialog().locator('.share-steps button').allInnerTexts()
  assert(JSON.stringify(stepNames.map(name => name.replace(/\s+/g, ' ').trim())) === JSON.stringify(['1 Principal', '2 Autres', '3 Personnes', '4 Chiffres', '5 Partage']), `Cinq étapes pour Films : ${stepNames.join(' | ')}`)
  assert(await dialog().getByText(/n’ont pas pu être chargées|n’a pas pu être chargée/).count() === 0, 'Images autorisées : aucun message d’image manquante')
  assert(await dialog().locator('.share-card-preview').isVisible(), 'L’aperçu de la carte est visible pendant les questions')
  // Le dessin ne dépend plus de l'autorisation du serveur d'affiches : les octets viennent de la
  // commande native, et leur absence (étape 8) retombe sur le titre sans casser l'export.
  const fetchedImages = await page.evaluate(() => window.__syllogeRecette.fetchedImages())
  assert(fetchedImages.length >= 7, `Les affiches passent par la commande native (${fetchedImages.length} demandées)`)
  assert(fetchedImages.every(url => /^https:\/\/picsum\.photos\//.test(url)), `La commande reçoit les adresses des affiches (${fetchedImages[0]})`)

  // Le vrai logo, au rectangle exact choisi dans l'en-tête : tuile Σ, pas l'ancien marque-page.
  const logoGap = await page.evaluate(async () => {
    const { default: logoUrl } = await import('/src/assets/sylloge-mark.png')
    const logo = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = logoUrl })
    const reference = document.createElement('canvas'); reference.width = 60; reference.height = 60
    const ref = reference.getContext('2d'); ref.drawImage(logo, 0, 0, 60, 60)
    // Marge latérale 72 px ; le centre du logo est à 96 px au premier format.
    const card = document.querySelector('canvas.share-card-canvas').getContext('2d').getImageData(78, 72, 48, 48).data
    const expected = ref.getImageData(6, 6, 48, 48).data
    let sum = 0
    for (let i = 0; i < card.length; i += 4) sum += Math.abs(card[i] - expected[i])
    return sum / (card.length / 4)
  })
  assert(logoGap < 6, `En-tête : le logo est la tuile Σ de l'application (écart moyen ${logoGap.toFixed(1)}/255)`)

  // Étape 1 : l'œuvre principale. Changer d'élue redessine la carte et le nom affiché suit.
  const posters = dialog().locator('.share-picker input[name="share-hero"]')
  const favorites = await posters.count()
  assert(favorites >= 3, `Étape 1 : les coups de cœur de Films sont proposés (${favorites})`)
  const firstTitle = await posters.nth(0).getAttribute('aria-label')
  assert(await posters.nth(0).isChecked() && await dialog().getByText(`Mis en avant : ${firstTitle}`).count() === 1, `Étape 1 : le mieux noté est élu d'office (${firstTitle})`)
  const beforeHero = await fingerprint()
  const secondTitle = await posters.nth(2).getAttribute('aria-label')
  await dialog().locator('label.share-poster').nth(2).click()
  await dialog().getByText(`Mis en avant : ${secondTitle}`).waitFor()
  await redrawn(beforeHero, 'nouveau coup de cœur principal')
  assert(await posters.nth(2).isChecked() && !(await posters.nth(0).isChecked()), `Étape 1 : choisir « ${secondTitle} » le met en avant et retire l'ancienne élue`)
  await page.screenshot({ path: '/Users/aurelientrouble/.hermes/profiles/promethee/cache/scratch/qa/share-1-dialog.png' })

  // Étape 2 : les autres. L'ancien héros est devenu un voisin ; en décocher un redessine la carte.
  await next()
  await dialog().getByRole('heading', { name: 'Vos autres coups de cœur' }).waitFor()
  const others = dialog().locator('.share-picker input[name="share-others"]')
  assert(await others.count() === favorites - 1, `Étape 2 : tous les autres coups de cœur sauf l'élue (${await others.count()})`)
  assert(await dialog().getByText(`${favorites - 1} sur 6 choisis`).count() === 1, `Étape 2 : compteur « ${favorites - 1} sur 6 choisis »`)
  assert(await others.nth(0).getAttribute('aria-label') === firstTitle, 'Étape 2 : l’ancienne élue est restée parmi les voisins')
  const beforeOther = await fingerprint()
  await dialog().locator('label.share-poster').nth(0).click()
  await dialog().getByText(`${favorites - 2} sur 6 choisis`).waitFor()
  await redrawn(beforeOther, 'un voisin décoché')
  assert(!(await others.nth(0).isChecked()), 'Étape 2 : un voisin décoché disparaît de la carte')

  // Étape 3 : les personnes. Le réalisateur le plus vu et ses acteurs sont cochés d'office ; cinq au plus sur la carte.
  await next()
  await dialog().getByRole('heading', { name: 'Les personnes à mettre en avant' }).waitFor()
  await dialog().getByText('Recherche des acteurs et des réalisateurs…').waitFor({ state: 'hidden' })
  const personRows = dialog().locator('.share-person-option')
  const personNames = await personRows.locator('b').allInnerTexts()
  assert(personNames.slice(0, 3).join('|') === 'Céline Sciamma|Wim Wenders|Aki Kaurismäki', `Étape 3 : trois réalisateurs proposés, les plus vus d'abord (${personNames.slice(0, 3).join(' | ')})`)
  const checkedNames = await personRows.evaluateAll(rows => rows.filter(row => row.querySelector('input').checked).map(row => row.querySelector('b').textContent))
  assert(checkedNames.length === 4 && checkedNames[0] === 'Céline Sciamma', `Étape 3 : un réalisateur et trois acteurs cochés d'office (${checkedNames.join(', ')})`)
  assert(await dialog().getByText('4 sur 5 choisis').count() === 1, 'Étape 3 : compteur « 4 sur 5 choisis »')
  const sciammaCaption = await personRows.filter({ hasText: 'Céline Sciamma' }).locator('.share-person-text span').innerText()
  assert(sciammaCaption === 'Réalisateur · 2 films', `Étape 3 : la légende compte les films (${sciammaCaption})`)
  const wendersImage = await personRows.filter({ hasText: 'Wim Wenders' }).locator('img').getAttribute('src')
  assert(/sylloge-director-Wim/.test(wendersImage || ''), `Étape 3 : la photo du réalisateur vient de TMDB (${wendersImage})`)
  assert(await personRows.filter({ hasText: 'Céline Sciamma' }).locator('img').count() === 0, 'Étape 3 : sans film TMDB, pas de photo : les initiales')
  const beforePerson = await fingerprint()
  await personRows.filter({ hasText: 'Céline Sciamma' }).locator('input').uncheck()
  await redrawn(beforePerson, 'un réalisateur décoché')
  await personRows.filter({ hasText: 'Wim Wenders' }).locator('input').check()
  assert(await dialog().getByText('4 sur 5 choisis').count() === 1, 'Étape 3 : décocher puis cocher garde le compte')
  // Personnages : Entrée ajoute, doublon et vide ignorés, quarante signes, cinq au plus en tout.
  const characterInput = dialog().getByRole('textbox', { name: 'Ajouter un personnage' })
  const beforeCharacter = await fingerprint()
  await characterInput.fill('  Jo   March ')
  await characterInput.press('Enter')
  await redrawn(beforeCharacter, 'un personnage ajouté')
  assert(await dialog().locator('.share-character-list li').allInnerTexts().then(list => list.map(text => text.replace('×', '').trim()).join('|')) === 'Jo March', 'Personnages : espaces nettoyés')
  assert(await dialog().getByText('5 sur 5 choisis').count() === 1, 'Personnages : le compte monte à 5 sur 5')
  assert(await characterInput.isDisabled() && await personRows.evaluateAll(rows => rows.filter(row => !row.querySelector('input').checked).every(row => row.querySelector('input').disabled)), 'Cinq atteint : le champ et les propositions non cochées sont désactivés')
  await dialog().getByRole('button', { name: 'Retirer Jo March', exact: true }).click()
  assert(await characterInput.isEnabled(), 'Retirer un personnage libère une place')
  await personRows.filter({ hasText: 'Au casting' }).first().locator('input').uncheck()
  await characterInput.fill('jo march')
  await characterInput.press('Enter')
  await characterInput.fill('jo MARCH')
  await characterInput.press('Enter')
  assert(await dialog().locator('.share-character-list li').count() === 1, 'Personnages : un doublon (casse différente) est ignoré')
  await characterInput.fill('x'.repeat(60))
  assert(await dialog().getByRole('button', { name: 'Ajouter', exact: true }).isEnabled(), 'Personnages : « Ajouter » disponible avec un nom saisi')
  assert((await characterInput.inputValue()).length === 40, 'Personnages : le champ s’arrête à quarante signes')
  await characterInput.fill('')
  assert(await dialog().getByRole('button', { name: 'Ajouter', exact: true }).isDisabled(), 'Personnages : champ vide, « Ajouter » désactivé')
  while (await dialog().locator('.share-character-list li').count() > 0) await dialog().locator('.share-character-list button').first().click()

  // Étape 4 : les chiffres. Trois, chacun se retire.
  await next()
  await dialog().getByRole('heading', { name: 'Les chiffres sous les affiches' }).waitFor()
  const statBoxes = dialog().locator('.share-stat-option input')
  assert(await statBoxes.count() === 3, 'Étape 4 : trois chiffres à garder')
  const statText = (await dialog().locator('.share-stat-options').innerText()).replace(/\s+/g, ' ')
  assert(/15 films vus/.test(statText) && /14 vus en 2026/.test(statText) && /4,4 ★ note moyenne/.test(statText), `Étape 4 : valeurs et légendes réelles (${statText})`)
  assert(!/cœur/.test(statText), 'Étape 4 : le nombre de coups de cœur n’est plus proposé')
  const beforeStat = await fingerprint()
  await statBoxes.nth(2).uncheck()
  await redrawn(beforeStat, 'note moyenne retirée')
  const beforeNone = await fingerprint()
  await statBoxes.nth(0).uncheck()
  await statBoxes.nth(1).uncheck()
  await redrawn(beforeNone, 'tous les chiffres retirés')
  await page.waitForTimeout(800)
  await canvas().waitFor()
  assert(await canvas().count() === 1, 'Sans aucun chiffre, la carte se dessine quand même')
  await statBoxes.nth(0).check()
  await statBoxes.nth(1).check()
  await statBoxes.nth(2).check()

  // ── 2. Étape 5 : format et partage ; changer de format redessine ─────────────────────────────
  await next()
  await dialog().getByRole('heading', { name: 'Format et partage' }).waitFor()
  assert(await format(/Standard/).getAttribute('aria-checked') === 'true' && await format(/Story/).getAttribute('aria-checked') === 'false', 'Le format standard est coché')
  await format(/Story/).click()
  await heightIs(1920)
  assert(JSON.stringify(await size()) === '[1080,1920]', 'Story : 1 080 × 1 920')
  await step('Principal').click()
  await dialog().getByRole('heading', { name: 'Votre coup de cœur principal' }).waitFor()
  await step('Partage').click()
  assert(await format(/Story/).getAttribute('aria-checked') === 'true', 'Revenir en arrière garde le format choisi')
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
  // Le partage direct vers un service est retiré (25 octobre 2026) : aucun bouton de réseau, aucune page ouverte.
  assert(await dialog().locator('.share-destinations').count() === 0, 'Aucune section « Partager vers »')
  for (const name of ['WhatsApp', 'Messenger', 'X', 'Story Instagram']) {
    assert(await dialog().getByRole('button', { name, exact: true }).count() === 0, `Aucun bouton de réseau « ${name} »`)
  }
  assert((await opened()).length === 0, 'Aucune page de service ouverte')

  // ── 5. Copie refusée : on le dit, sans enregistrer de fichier en silence ──────────────────────
  await page.evaluate(() => { navigator.clipboard.write = () => Promise.reject(new Error('refusé')) })
  const savedBefore = await saved()
  await dialog().getByRole('button', { name: 'Copier l’image', exact: true }).click()
  await dialog().getByText(/La copie n’a pas fonctionné dans cette fenêtre/).waitFor()
  assert(await saved() === savedBefore, 'Copie seule refusée : aucun fichier créé en silence')
  // Le PNG story reste enregistrable après un refus de copie.
  await format(/Story/).click()
  await heightIs(1920)
  await dialog().getByRole('button', { name: 'Enregistrer l’image', exact: true }).click()
  await dialog().getByText(/Image enregistrée dans « sylloge-carte-recette\.png »/).waitFor()
  const story = await pngInfo(await lastSaved())
  assert(story.width === 1080 && story.height === 1920, `Story : PNG 1 080 × 1 920 (${story.width}×${story.height})`)
  assert(await format(/Story/).getAttribute('aria-checked') === 'true', 'La story reste le format choisi')
  await closeDialog()
  assert(await dialog().count() === 0, 'La fenêtre se ferme')

  // ── 8. Images refusées par le serveur : repli sur les titres, export toujours possible ─────────
  cors = false
  await start()
  await openTransfer()
  await page.getByRole('button', { name: 'Partager mon profil', exact: true }).click()
  await dialog().waitFor()
  await canvas().waitFor()
  await dialog().getByText(/images n’ont pas pu être chargées : leurs tuiles affichent le titre/).waitFor()
  await step('Partage').click()
  await dialog().getByRole('button', { name: 'Enregistrer l’image', exact: true }).click()
  await dialog().getByText(/Image enregistrée dans/).waitFor()
  const fallback = await pngInfo(await lastSaved())
  assert(fallback.width === 1080 && JSON.stringify(fallback.signature) === '[137,80,78,71]', 'Sans autorisation : l’export en PNG reste possible (canevas non contaminé)')
  await closeDialog()

  // ── 9. Depuis « Exporter » d'une bibliothèque : la portée suit le choix ─────────────────────────
  cors = true
  await start()
  await page.locator('nav').getByRole('button', { name: 'Films', exact: true }).click()
  await page.getByRole('button', { name: 'Exporter', exact: true }).first().click()
  const exportDialog = page.getByRole('dialog', { name: /Exporter/ })
  await exportDialog.getByRole('button', { name: /Image à partager/ }).click()
  await dialog().waitFor()
  assert(await page.locator('#share-card-scope').count() === 0 && await dialog().locator('.share-picker input[name="share-hero"]').count() === favorites, 'Export › Image à partager : la carte s’ouvre sur la bibliothèque courante (ses coups de cœur seulement)')
  assert(await page.getByRole('dialog', { name: /Exporter/ }).count() === 0, 'La fenêtre d’export est remplacée par celle de la carte')
  await closeDialog()
  await page.getByRole('button', { name: 'Exporter', exact: true }).first().click()
  await page.getByRole('dialog', { name: /Exporter/ }).getByRole('radio', { name: /Tout le profil/ }).check()
  await page.getByRole('dialog', { name: /Exporter/ }).getByRole('button', { name: /Image à partager/ }).click()
  await dialog().waitFor()
  assert(await page.locator('#share-card-scope').getAttribute('data-value') === 'profile', 'Export (tout le profil) › Image à partager : la carte s’ouvre sur le profil')
  await closeDialog()

  // ── 9 bis. Réglages : portée au choix ; sur le profil, le choix d'office mêle les bibliothèques ──
  await start()
  await openTransfer()
  assert(await page.getByRole('heading', { name: 'Partage', exact: true }).count() === 1, 'Réglages : un groupe « Partage »')
  await page.getByRole('button', { name: 'Partager mon profil', exact: true }).click()
  await dialog().waitFor()
  await canvas().waitFor()
  assert(await page.locator('#share-card-scope').getAttribute('data-value') === 'profile', 'Réglages : portée par défaut, tout le profil')
  // Liste déroulante Sylloge (27 octobre 2026) : on l’ouvre pour lire ses options, Échap ne ferme qu’elle.
  await page.locator('#share-card-scope').click()
  const options = await page.getByRole('listbox').locator('.select-option-label').allInnerTexts()
  await page.keyboard.press('Escape')
  await page.getByRole('listbox').waitFor({ state: 'detached' })
  assert(await dialog().count() === 1, 'Échap dans la liste de portée ne ferme pas la carte')
  assert(JSON.stringify(options) === JSON.stringify(['Tout le profil', 'Films', 'Séries', 'Animation japonaise', 'Livres', 'Mangas', 'Jeux', 'Art']), `Portées : profil puis bibliothèques de base seulement (${options.join(', ')})`)
  const profileFavorites = await dialog().locator('.share-picker input[name="share-hero"]').count()
  assert(profileFavorites > favorites, `Le profil propose les coups de cœur de toutes les bibliothèques (${profileFavorites} > ${favorites})`)
  await next()
  const fullBoxes = dialog().locator('.share-picker input[name="share-others"]')
  const expectedSelection = Math.min(10, profileFavorites)
  assert(await dialog().getByText(`${expectedSelection - 1} sur 9 choisis`).count() === 1, `Profil : ${expectedSelection} coups de cœur choisis d’office, plafond de dix`)
  const blocked = await fullBoxes.evaluateAll(list => list.filter(box => !box.checked && box.disabled).length)
  assert(blocked === profileFavorites - expectedSelection, `Plafond atteint : les ${profileFavorites - expectedSelection} autres sont désactivées (${blocked})`)
  const beforeFree = await fingerprint()
  await dialog().locator('label.share-poster[data-checked]').first().click()
  await dialog().getByText(`${expectedSelection - 2} sur 9 choisis`).waitFor()
  await redrawn(beforeFree, 'une place libérée sur le profil')
  assert(await fullBoxes.evaluateAll(list => list.filter(box => !box.checked && box.disabled).length) === 0, 'Une place libérée : les autres redeviennent choisissables')
  await closeDialog()

  // ── 10. Notes : étoiles exactes et chiffres composés sans chevauchement ────────────────────────
  const visualStats = await page.evaluate(async () => {
    const { renderShareCard } = await import('/src/components/shareCardImage.ts')
    const { layoutShareCard } = await import('/src/domain/shareCardLayout.ts')
    const { SHARE_FORMATS } = await import('/src/domain/shareFormats.ts')
    const item = (id, rating) => ({ key: `films:${id}`, id, library: 'films', title: `Film ${id}`, creator: null, year: 2020, rating, isFavorite: true, done: true, doneAt: '2026-01-01', doneOn: '2026-01-01', imageUrl: null })
    const model = {
      scope: { kind: 'library', library: 'films' }, profileName: 'QA', heading: { kind: 'library', label: 'Films' },
      stats: { cells: [{ value: 3, label: 'films vus' }, { value: 3, label: 'vus en {year}', params: { year: '2026' } }, { value: 4.5, label: 'note moyenne', format: 'rating' }], perLibrary: null },
      titles: { favorites: 'Coups de cœur' },
      sections: { favorites: [item('a', 5), item('b', 3.5), item('c', 1)] }, people: [], isEmpty: false,
    }
    const format = SHARE_FORMATS.standard
    const { canvas } = await renderShareCard(model, format, { loadImage: async () => null })
    const layout = layoutShareCard(model, format)
    const spread = layout.blocks.find(block => block.kind === 'spread')
    const context = canvas.getContext('2d')
    const bright = (x, y) => { const d = context.getImageData(Math.round(x), Math.round(y), 1, 1).data; return (d[0] + d[1] + d[2]) / 3 > 160 }
    const starsLeft = tile => {
      const size = tile.starsRect.h
      const gap = Math.round(size * 0.16)
      return tile.starsRect.x + (tile.starsRect.w - (5 * size + 4 * gap)) / 2
    }
    const sample = (tile, index, half) => {
      const size = tile.starsRect.h
      const gap = Math.round(size * 0.16)
      return bright(starsLeft(tile) + index * (size + gap) + (half === 'left' ? size * 0.28 : size * 0.72), tile.starsRect.y + size / 2 + 1)
    }
    const clusters = layout.blocks.find(block => block.kind === 'stats').cells.map(cell => {
      const x0 = Math.ceil(cell.x + 8)
      const x1 = Math.floor(cell.x + cell.w - 8)
      const y0 = Math.ceil(cell.y + 1)
      const y1 = Math.floor(cell.y + cell.h - 1)
      const data = context.getImageData(x0, y0, x1 - x0, y1 - y0).data
      const bg = [data[0], data[1], data[2]]
      const rows = []
      for (let y = 0; y < y1 - y0; y += 1) {
        let count = 0
        for (let x = 0; x < x1 - x0; x += 1) {
          const offset = (y * (x1 - x0) + x) * 4
          if (Math.abs(data[offset] - bg[0]) + Math.abs(data[offset + 1] - bg[1]) + Math.abs(data[offset + 2] - bg[2]) > 120) count += 1
        }
        if (count >= 2) rows.push(y + y0)
      }
      const groups = []
      for (const y of rows) {
        const last = groups.at(-1)
        if (!last || y - last.at(-1) > 2) groups.push([y])
        else last.push(y)
      }
      return groups.map(group => [group[0], group.at(-1)])
    })
    const tiles = [spread.hero, ...spread.tiles]
    return {
      five: [0, 1, 2, 3, 4].map(index => sample(tiles[0], index, 'left') && sample(tiles[0], index, 'right')),
      threeHalf: [0, 1, 2, 3, 4].map(index => [sample(tiles[1], index, 'left'), sample(tiles[1], index, 'right')]),
      one: [0, 1, 2, 3, 4].map(index => [sample(tiles[2], index, 'left'), sample(tiles[2], index, 'right')]),
      statTextRows: clusters,
    }
  })
  assert(visualStats.five.every(Boolean), '5 étoiles : les cinq sont pleines')
  assert(JSON.stringify(visualStats.threeHalf) === JSON.stringify([[true, true], [true, true], [true, true], [true, false], [false, false]]), `3,5 étoiles : trois pleines, une demie, une vide (${JSON.stringify(visualStats.threeHalf)})`)
  assert(JSON.stringify(visualStats.one) === JSON.stringify([[true, true], [false, false], [false, false], [false, false], [false, false]]), '1 étoile : une pleine, quatre vides')
  assert(visualStats.statTextRows.every(groups => groups.length === 2 && groups[1][0] - groups[0][1] >= 2), `Chaque chiffre et sa légende sont distincts, sans chevauchement (${JSON.stringify(visualStats.statTextRows)})`)

  // ── 10 bis. Rangée de personnes : portrait, nom (une ou deux lignes) et légende distincts, dans leur case ──
  const peopleRows = await page.evaluate(async () => {
    const { renderShareCard } = await import('/src/components/shareCardImage.ts')
    const { layoutShareCard } = await import('/src/domain/shareCardLayout.ts')
    const { SHARE_FORMATS } = await import('/src/domain/shareFormats.ts')
    const item = (id, rating) => ({ key: `films:${id}`, id, library: 'films', title: `Film ${id}`, creator: null, year: 2020, rating, isFavorite: true, done: true, doneAt: '2026-01-01', doneOn: '2026-01-01', imageUrl: null })
    const person = (role, name, count, key, params) => ({ id: `${role}:${name}`, role, name, count, portraitUrl: null, caption: { key, params } })
    const model = {
      scope: { kind: 'library', library: 'films' }, profileName: 'QA', heading: { kind: 'library', label: 'Films' },
      stats: { cells: [{ value: 3, label: 'films vus' }], perLibrary: null },
      titles: { favorites: 'Coups de cœur' }, sections: { favorites: [item('a', 5), item('b', 4)] }, isEmpty: false,
      people: [
        person('director', 'Céline Sciamma', 2, 'Réalisateur · {count} films', { count: '2' }),
        person('actor', 'Celia Rowlson-Hall', 1, 'Au casting · {count} film', { count: '1' }),
        person('actor', 'Jo', 4, 'Au casting · {count} films', { count: '4' }),
        person('character', 'Walter White', 0, 'Personnage préféré'),
        person('character', 'Éric Rohmer-Wang Kar-wai Jr.', 0, 'Personnage préféré'),
      ],
    }
    const format = SHARE_FORMATS.standard
    const { canvas } = await renderShareCard(model, format, { loadImage: async () => null })
    const layout = layoutShareCard(model, format)
    const context = canvas.getContext('2d')
    const block = layout.blocks.find(part => part.kind === 'people')
    return block.cells.map(cell => {
      const x0 = Math.ceil(cell.rect.x + 6)
      const x1 = Math.floor(cell.rect.x + cell.rect.w - 6)
      const y0 = Math.ceil(cell.portrait.y + cell.portrait.h + 2)
      const y1 = Math.floor(cell.rect.y + cell.rect.h)
      const data = context.getImageData(x0, y0, x1 - x0, y1 - y0).data
      const bg = [data[0], data[1], data[2]]
      const groups = []
      let current = null
      for (let y = 0; y < y1 - y0; y += 1) {
        let ink = 0
        for (let x = 0; x < x1 - x0; x += 1) {
          const offset = (y * (x1 - x0) + x) * 4
          if (Math.abs(data[offset] - bg[0]) + Math.abs(data[offset + 1] - bg[1]) + Math.abs(data[offset + 2] - bg[2]) > 120) ink += 1
        }
        if (ink >= 2) { if (current && y + y0 - current[1] <= 3) current[1] = y + y0; else { current = [y + y0, y + y0]; groups.push(current) } }
      }
      // L'encre doit rester dans la largeur de la case : on relève la colonne la plus à gauche et à droite.
      let minX = x1; let maxX = x0
      for (let y = 0; y < y1 - y0; y += 1) for (let x = 0; x < x1 - x0; x += 1) {
        const offset = (y * (x1 - x0) + x) * 4
        if (Math.abs(data[offset] - bg[0]) + Math.abs(data[offset + 1] - bg[1]) + Math.abs(data[offset + 2] - bg[2]) > 120) { minX = Math.min(minX, x + x0); maxX = Math.max(maxX, x + x0) }
      }
      return { name: cell.person.name, groups, bottom: cell.rect.y + cell.rect.h, inkLeft: minX - cell.rect.x, inkRight: cell.rect.x + cell.rect.w - maxX }
    })
  })
  assert(peopleRows.every(row => row.groups.length >= 2 && row.groups.length <= 3), `Personnes : un nom (une ou deux lignes) puis une légende dans chaque case (${JSON.stringify(peopleRows.map(row => row.groups.length))})`)
  assert(peopleRows.every(row => row.groups.every((group, index) => index === 0 || group[0] - row.groups[index - 1][1] >= 2)), 'Personnes : le nom et la légende ne se chevauchent pas')
  assert(peopleRows.every(row => row.groups.at(-1)[1] <= row.bottom), 'Personnes : tout reste dans la hauteur de la case')
  assert(peopleRows.every(row => row.inkLeft >= 0 && row.inkRight >= 0), `Personnes : aucun texte ne déborde de sa case (${JSON.stringify(peopleRows.map(row => [row.inkLeft, row.inkRight]))})`)
  const captionTops = peopleRows.map(row => row.groups.at(-1)[0])
  assert(Math.max(...captionTops) - Math.min(...captionTops) <= 2, `Personnes : toutes les légendes sont alignées sur la même ligne (${captionTops.join(', ')})`)

  // ── 10 ter. Chaque bibliothèque propose ce qui lui convient (décision du 24/10) ────────────────
  await start()
  const openLibraryCard = async label => {
    await page.locator('nav').getByRole('button', { name: label, exact: true }).click()
    await page.locator('.library-subtitle').getByRole('button', { name: 'Partager mes coups de cœur', exact: true }).click()
    await dialog().waitFor()
    await canvas().waitFor()
  }
  const stepTexts = async () => (await dialog().locator('.share-steps button').allInnerTexts()).map(text => text.replace(/\s+/g, ' ').trim().replace(/^\d /, ''))
  for (const [label, expectedCaption] of [['Livres', /^Auteur · \d+ livres?$/], ['Mangas', /^Auteur · \d+ mangas?$/], ['Jeux', /^Studio · \d+ jeux?$/]]) {
    await openLibraryCard(label)
    assert((await stepTexts()).includes('Personnes'), `${label} : une étape « Personnes »`)
    await dialog().locator('.share-steps').getByRole('button', { name: /Personnes/ }).click()
    await dialog().getByRole('heading', { name: 'Les personnes à mettre en avant' }).waitFor()
    const rows = dialog().locator('.share-person-option')
    assert(await rows.count() >= 1 && await rows.count() <= 3, `${label} : de une à trois propositions (${await rows.count()})`)
    assert(expectedCaption.test(await rows.first().locator('.share-person-text span').innerText()), `${label} : légende « ${await rows.first().locator('.share-person-text span').innerText()} »`)
    assert(await rows.first().locator('input').isChecked() && (await rows.evaluateAll(list => list.filter(row => row.querySelector('input').checked).length)) === 1, `${label} : le plus fréquent est coché d'office, lui seul`)
    assert(await rows.first().locator('img').count() === 0, `${label} : pas de photo d'auteur ou de studio, les initiales`)
    assert(await dialog().getByRole('textbox', { name: 'Ajouter un personnage' }).count() === 1, `${label} : les personnages se saisissent`)
    assert(await dialog().getByText(/Les acteurs viennent des films associés/).count() === 0, `${label} : pas de mention TMDB`)
    await closeDialog()
  }
  for (const label of ['Séries', 'Animation japonaise']) {
    await openLibraryCard(label)
    await dialog().locator('.share-steps').getByRole('button', { name: /Personnes/ }).click()
    await dialog().getByRole('heading', { name: 'Les personnes à mettre en avant' }).waitFor()
    assert(await dialog().locator('.share-person-option').count() === 0 && await dialog().getByRole('textbox', { name: 'Ajouter un personnage' }).count() === 1, `${label} : aucune personne proposée, seulement les personnages`)
    await closeDialog()
  }
  await openLibraryCard('Art')
  assert(!(await stepTexts()).includes('Personnes'), 'Art : pas d’étape « Personnes » (à décider plus tard)')
  await closeDialog()
  // ── Tout le profil : bouton sur l'accueil (onglet « Tout »), étape « Personnes » transversale, pastilles ──
  await start()
  const homeTab = label => page.getByRole('tab', { name: label, exact: true })
  await homeTab('Films').click()
  assert(await page.locator('.at-topbar').getByRole('button', { name: 'Partager mon profil', exact: true }).count() === 0, 'Accueil : pas de bouton sur l’onglet Films (chaque bibliothèque a le sien sur sa page)')
  await homeTab('Tout').click()
  const homeButton = page.locator('.at-topbar').getByRole('button', { name: 'Partager mon profil', exact: true })
  assert(await homeButton.count() === 1, 'Accueil : un bouton « Partager mon profil » sur l’onglet Tout')
  const topbarCenters = await page.locator('.at-topbar').evaluate(bar => [...bar.children].map(child => { const box = child.getBoundingClientRect(); return Math.round(box.top + box.height / 2) }))
  assert(Math.max(...topbarCenters) - Math.min(...topbarCenters) <= 2, `Accueil à 1440 px : onglets, bilan et bouton restent sur une seule ligne (${topbarCenters})`)
  await homeButton.click()
  await dialog().waitFor()
  // La fenêtre est hors de la barre d'accueil : elle n'en hérite ni « texte sur une ligne » ni son conteneur.
  assert(await dialog().evaluate(node => getComputedStyle(node).whiteSpace) === 'normal' && !(await dialog().evaluate(node => !!node.closest('.at-topbar'))), 'Accueil : la fenêtre est rendue hors de la barre (portail), le texte passe à la ligne')
  assert((await stepTexts()).join('|') === 'Principal|Autres|Personnes|Chiffres|Partage', `Profil : cinq étapes (${(await stepTexts()).join('|')})`)
  // Étape 1 : l'œuvre de chaque bibliothèque est nommée, seulement parmi les sept de base.
  const kinds = await dialog().locator('.share-poster-kind').allInnerTexts()
  assert(kinds.length > 0 && kinds.every(text => ['FILM', 'SÉRIE', 'ANIMATION', 'LIVRE', 'MANGA', 'JEU', 'ART'].includes(text)), `Profil, étape 1 : une pastille de bibliothèque sur chaque affiche (${[...new Set(kinds)].join(', ')})`)
  assert(!kinds.some(text => /COMICS|MUSIQUE/.test(text)), 'Profil : les coups de cœur ne viennent que des sept bibliothèques de base')
  await dialog().locator('.share-steps').getByRole('button', { name: /Personnes/ }).click()
  await dialog().getByText('Recherche des acteurs et des réalisateurs…').waitFor({ state: 'hidden' })
  const profileRows = dialog().locator('.share-person-option')
  const captions = await profileRows.locator('.share-person-text span').allInnerTexts()
  assert(captions.some(text => /^Réalisateur/.test(text)) && captions.some(text => /^Au casting/.test(text)) && captions.some(text => /^Auteur · \d+ livres?$/.test(text)) && captions.some(text => /^Auteur · \d+ mangas?$/.test(text)) && captions.some(text => /^Studio/.test(text)), `Profil : réalisateur, acteurs, auteurs de livres et de mangas, studio proposés (${captions.join(' | ')})`)
  const chosenCaptions = await profileRows.evaluateAll(rows => rows.filter(row => row.querySelector('input').checked).map(row => row.querySelector('.share-person-text span').textContent))
  assert(chosenCaptions.length === 5 && new Set(chosenCaptions.map(text => text.split(' · ')[0] + (/manga/.test(text) ? 'm' : ''))).size === 5, `Profil : cinq personnes cochées d’office, une par rôle et bibliothèque (${chosenCaptions.join(' | ')})`)
  assert(await dialog().getByText('5 sur 5 choisis').count() === 1 && await dialog().getByRole('textbox', { name: 'Ajouter un personnage' }).isDisabled(), 'Profil : plafond de cinq atteint, le champ des personnages attend')
  const beforeProfilePerson = await fingerprint()
  await profileRows.filter({ hasText: 'Au casting' }).first().locator('input').uncheck()
  await redrawn(beforeProfilePerson, 'un acteur décoché sur le profil')
  const profileCharacter = dialog().getByRole('textbox', { name: 'Ajouter un personnage' })
  const beforeProfileCharacter = await fingerprint()
  await profileCharacter.fill('Link')
  await profileCharacter.press('Enter')
  await redrawn(beforeProfileCharacter, 'un personnage ajouté sur le profil')
  await closeDialog()
  // Films : les acteurs ne viennent que des films associés à TMDB, et le dit.
  await start()
  await openLibraryCard('Films')
  await dialog().locator('.share-steps').getByRole('button', { name: /Personnes/ }).click()
  await dialog().getByText(/Les acteurs viennent des films associés à TMDB/).waitFor()
  await closeDialog()

  // ── 10 quater. Pastille de bibliothèque : dessinée sur le profil, absente sur une bibliothèque ──────
  const badgePixels = await page.evaluate(async () => {
    const { renderShareCard } = await import('/src/components/shareCardImage.ts')
    const { layoutShareCard } = await import('/src/domain/shareCardLayout.ts')
    const { SHARE_FORMATS } = await import('/src/domain/shareFormats.ts')
    const item = (id, library) => ({ key: `${library}:${id}`, id, library, title: `Œuvre ${id}`, creator: null, year: 2020, rating: 5, isFavorite: true, done: true, doneAt: '2026-01-01', doneOn: '2026-01-01', imageUrl: null })
    const model = scope => ({
      scope, profileName: 'QA', heading: scope.kind === 'profile' ? { kind: 'profile', name: 'QA' } : { kind: 'library', label: 'Films' },
      stats: { cells: [{ value: 3, label: 'films vus' }], perLibrary: null }, titles: { favorites: 'Coups de cœur' },
      sections: { favorites: [item('a', 'films'), item('b', 'books')] }, people: [], isEmpty: false,
    })
    const format = SHARE_FORMATS.standard
    const read = async scope => {
      const m = model(scope)
      const { canvas } = await renderShareCard(m, format, { loadImage: async () => null })
      const hero = layoutShareCard(m, format).blocks.find(block => block.kind === 'spread').hero.rect
      // Zone de la pastille : à 16 px du coin haut-gauche de l'affiche ; les affiches sans image sont identiques d'une carte à l'autre.
      const data = canvas.getContext('2d').getImageData(Math.round(hero.x + 16), Math.round(hero.y + 16), 90, 34).data
      let bright = 0
      for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) bright += 1
      return bright
    }
    return { profile: await read({ kind: 'profile' }), library: await read({ kind: 'library', library: 'films' }) }
  })
  assert(badgePixels.profile > 40 && badgePixels.library === 0, `Pastille : le texte clair n’existe que sur la carte du profil (${JSON.stringify(badgePixels)})`)

  // ── 11. Aucun coup de cœur : un message, pas d'image vide ni d'étapes ───────────────────────────
  await start('fr', 'empty')
  await openTransfer()
  await page.getByRole('button', { name: 'Partager mon profil', exact: true }).click()
  await dialog().getByText(/Pas encore de coup de cœur à mettre en avant/).waitFor()
  assert(await canvas().count() === 0, 'Aucun coup de cœur : aucun aperçu vide')
  for (const name of ['Enregistrer l’image', 'Copier l’image', 'WhatsApp', 'Story Instagram', 'Continuer']) {
    assert(await dialog().getByRole('button', { name, exact: true }).count() === 0, `Aucun coup de cœur : pas de bouton « ${name} » qui ne mènerait nulle part`)
  }
  await closeDialog()

  // ── 12. Anglais ────────────────────────────────────────────────────────────────────────────────
  await start('en')
  await page.locator('nav').getByRole('button', { name: 'Films', exact: true }).click()
  await page.getByRole('button', { name: 'Share my favourites', exact: true }).first().click()
  const english = page.getByRole('dialog', { name: 'Share my favourites' })
  await english.waitFor()
  await english.locator('canvas.share-card-canvas').waitFor()
  // innerText rend les titres en capitales (text-transform) : on compare sans tenir compte de la casse.
  const stepOne = await english.innerText()
  assert(/Your main favourite/i.test(stepOne) && /Featured:/i.test(stepOne) && /Main/.test(stepOne) && /Continue/.test(stepOne), 'Anglais : étape 1 traduite : ' + stepOne.replace(/\s+/g, ' ').slice(0, 300))
  await english.getByRole('button', { name: 'Continue', exact: true }).click()
  const stepOthers = await english.innerText()
  assert(/Your other favourites/i.test(stepOthers) && /of 6 chosen/.test(stepOthers), 'Anglais : étape 2 traduite')
  await english.getByRole('button', { name: 'Continue', exact: true }).click()
  assert(/The people to feature/i.test(await english.innerText()) && /Your favourite characters/i.test(await english.innerText()) && /Director · \d+ films?/.test(await english.innerText()) && /In the cast ·/.test(await english.innerText()) && /Looking up|Most frequent/i.test(await english.innerText()), 'Anglais : étape des personnes traduite (' + (await english.innerText()).replace(/\s+/g, ' ').slice(0, 260) + ')')
  await english.getByRole('button', { name: 'Continue', exact: true }).click()
  const stepStats = await english.innerText()
  assert(/The numbers under the posters/i.test(stepStats) && /average rating/.test(stepStats) && /films watched/.test(stepStats) && /watched in 2026/.test(stepStats), 'Anglais : étape 3 traduite')
  await english.getByRole('button', { name: 'Continue', exact: true }).click()
  const englishText = await english.innerText()
  assert(/Image format/i.test(englishText) && /Stories and status updates/.test(englishText) && /Copy the image/.test(englishText) && !/Share to/i.test(englishText) && /Save the image/.test(englishText), 'Anglais : étape 4 traduite')
  assert(!/Contenu de la carte|Enregistrer|Partager vers|Copier|Continuer|Précédent|coups de cœur/i.test(englishText), 'Anglais : aucun reste de français')
  await english.getByRole('button', { name: 'Close', exact: true }).click()

  // L'interception réseau survit dans la session : on la retire, et on remet l'état mémorisé à zéro.
  await page.unroute('https://picsum.photos/**')
  await page.evaluate(() => ['sylloge-theme', 'sylloge-sidebar-pinned', 'sylloge-language'].forEach(key => localStorage.removeItem(key)))
  await start('fr')
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
