// Mise en page des fiches (30 octobre 2026) — la « colonne pleine » partout.
//
// Une seule composition pour toutes les bibliothèques : colonne gauche de
// 380 px collante (visuel, statut, note, carnet), colonne de lecture à droite
// (œuvre, faits, résumé, avis, citations). L'Art met l'œuvre en majesté,
// centrée sous un mur neutre, puis un bloc d'informations centré (cartel de
// musée à gauche, carnet à droite). Une recette garde sa photo 4:3, ses
// ingrédients à gauche et ses étapes numérotées à droite.
//
// Vérifié ici, à 1440 × 900 puis à 1000 × 760 : deux colonnes (une seule sous
// 1000 px), statut et note visibles sans défiler, aucun débordement
// horizontal, libellés de faits sur une ligne, centrage de l'Art, thème
// sombre et anglais.
//
// Ouvrir la session playwright-cli depuis le dossier scratch : aucune capture
// n'est écrite ici. Les images picsum sont simulées à la taille demandée pour
// que le format d'une œuvre d'Art soit mesuré sans dépendre du réseau.
async page => {
  page.setDefaultTimeout(8000)
  await page.route('https://picsum.photos/**', route => {
    const size = route.request().url().match(/\/(\d+)\/(\d+)(?:\?.*)?$/)
    const width = size ? size[1] : '600'
    const height = size ? size[2] : '600'
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'cache-control': 'no-store' },
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#8a8a92"/></svg>`,
    })
  })

  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }

  const nav = () => page.getByRole('navigation').first()
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
    // Une bibliothèque peut s'ouvrir sur une vue filtrée (« À voir »), qui
    // cacherait la fiche choisie : on montre toutes les œuvres.
    await page.locator('.view-bar').first().waitFor({ state: 'visible' }).catch(() => {})
    const all = page.locator('.view-bar .view-pill', { hasText: /^(Tous|All)$/ }).first()
    if (await all.count() > 0) {
      await all.click()
      await page.waitForTimeout(300)
    }
  }
  const exact = text => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  const openCard = async title => {
    await page.locator('.film-card-top > b', { hasText: exact(title) }).first().click()
    await page.locator('.detail-poster').first().waitFor()
    await page.waitForTimeout(250)
  }

  /** Tout ce qu'une fiche doit tenir : colonnes, hauteurs, faits, Art. */
  const measure = () => page.evaluate(() => {
    const one = selector => document.querySelector(selector)
    const box = element => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        top: Math.round(rect.top), bottom: Math.round(rect.bottom),
        left: Math.round(rect.left), right: Math.round(rect.right),
        width: Math.round(rect.width), height: Math.round(rect.height),
      }
    }
    const boxOfRange = range => {
      const rect = range.getBoundingClientRect()
      return { left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }
    }
    /** Nombre de lignes occupées par le contenu d'un élément. */
    const lines = element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return range.getClientRects().length
    }
    const main = one('.detail-page-main')
    const layout = one('.detail-layout')
    const artTitle = one('.detail-art-head h1')
    const artTitleRange = artTitle ? document.createRange() : null
    if (artTitleRange) artTitleRange.selectNodeContents(artTitle)
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      theme: document.documentElement.dataset.theme ?? 'light',
      lang: document.documentElement.lang,
      surface: getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim(),
      columns: layout ? getComputedStyle(layout).gridTemplateColumns : '',
      overflow: main ? main.scrollWidth - main.clientWidth : 0,
      banners: document.querySelectorAll('.detail-banner').length,
      side: box(one('.detail-side')),
      body: box(one('.detail-body')),
      status: box(one('.detail-status')),
      rate: box(one('.detail-rate')),
      notebook: box(one('.detail-notebook')),
      facts: [...document.querySelectorAll('.detail-facts dt')].map(term => ({
        text: term.textContent?.trim() ?? '',
        lines: lines(term),
        clipped: term.scrollWidth > term.clientWidth + 1,
      })),
      denseRows: new Set([...document.querySelectorAll('.detail-facts-dense > div')]
        .map(row => Math.round(row.getBoundingClientRect().top))).size,
      stage: box(one('.detail-art-stage')),
      media: box(one('.detail-art-stage .detail-poster')),
      artBlock: box(one('.detail-art-block')),
      artTitle: artTitleRange ? boxOfRange(artTitleRange) : null,
      cartel: box(one('.detail-cartel')),
      artNotebook: box(one('.detail-art-notebook')),
      cartelLabels: document.querySelectorAll('.detail-cartel dt').length,
      steps: box(one('.detail-steps')),
      ingredients: box(one('.detail-recipe-ingredients')),
      // Groupe centré sous le visuel : statut, note, cœur, puis la date.
      poster: box(one('.detail-side .detail-visual .detail-poster')),
      verdictContent: (() => {
        const kids = [...(one('.detail-side .detail-verdict')?.children ?? [])].map(node => node.getBoundingClientRect())
        if (kids.length === 0) return null
        return { left: Math.min(...kids.map(r => r.left)), right: Math.max(...kids.map(r => r.right)) }
      })(),
      date: box(one('.detail-side .detail-notebook-date')),
      attribution: Boolean(one('.detail-attribution-line')),
      notebookLabel: /mon carnet|my notebook/i.test(one('.detail-side')?.innerText ?? ''),
      reviewLabel: one('.mine-label')?.innerText?.trim() ?? null,
      stageBackground: one('.detail-art-stage') ? getComputedStyle(one('.detail-art-stage')).backgroundColor : null,
      artImage: (() => {
        const img = one('.detail-art-stage .artwork-visual-image img')
        if (!img || !img.complete || img.naturalWidth === 0) return null
        const frame = img.parentElement.getBoundingClientRect()
        const rect = img.getBoundingClientRect()
        return {
          width: rect.width, height: rect.height, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
          frameWidth: frame.width, frameHeight: frame.height,
          frameBackground: getComputedStyle(img.parentElement).backgroundColor,
        }
      })(),
    }
  })

  const oneLineFacts = (info, label) => {
    const wrapped = info.facts.filter(fact => fact.lines > 1 || fact.clipped)
    assert(wrapped.length === 0, `${label} : chaque libellé de fait tient sur une ligne (${wrapped.map(fact => fact.text).join(', ') || 'aucun repli'})`)
  }

  /** La colonne pleine : deux colonnes, visuel et carnet à gauche. */
  const checkColumn = (info, label) => {
    assert(info.columns.trim().split(/\s+/).length === 2, `${label} : deux colonnes à 1440 px (${info.columns})`)
    assert(info.side !== null && info.side.width >= 300, `${label} : colonne gauche présente et large (${info.side?.width} px)`)
    assert(info.body !== null && info.side.right < info.body.left, `${label} : la colonne de lecture est à droite du visuel`)
    assert(info.status !== null && info.status.bottom <= info.viewport.height, `${label} : le statut est visible sans défiler (${info.status?.bottom} ≤ ${info.viewport.height})`)
    assert(info.rate !== null && info.rate.bottom <= info.viewport.height, `${label} : la note est visible sans défiler (${info.rate?.bottom} ≤ ${info.viewport.height})`)
    assert(info.notebook === null || info.notebook.bottom <= info.viewport.height, `${label} : la date est visible sans défiler`)
    const center = range => (range.left + range.right) / 2
    assert(info.poster !== null && info.verdictContent !== null && Math.abs(center(info.verdictContent) - center(info.poster)) < 3, `${label} : statut, note et cœur sont centrés sur le visuel (écart ${info.poster && info.verdictContent ? Math.abs(center(info.verdictContent) - center(info.poster)).toFixed(1) : '?'} px)`)
    assert(info.date === null || Math.abs(center(info.date) - center(info.poster)) < 3, `${label} : la date est centrée sur le visuel`)
    assert(!info.notebookLabel, `${label} : aucun libellé « Mon carnet »`)
    assert(!info.attribution, `${label} : aucune ligne « Présentation enrichie par » dans la fiche`)
    assert(info.overflow <= 1, `${label} : aucun débordement horizontal (${info.overflow} px)`)
    assert(info.banners === 0, `${label} : aucune bannière n'est inventée`)
    oneLineFacts(info, label)
  }

  /** L'Art : l'œuvre en majesté centrée, le bloc d'informations centré dessous. */
  const checkArt = (info, label) => {
    assert(info.stage !== null && info.media !== null, `${label} : l'œuvre occupe la scène`)
    const stageCenter = (info.stage.left + info.stage.right) / 2
    const mediaCenter = (info.media.left + info.media.right) / 2
    assert(Math.abs(mediaCenter - stageCenter) < 4, `${label} : l'œuvre est centrée (écart ${Math.abs(mediaCenter - stageCenter).toFixed(1)} px)`)
    const blockCenter = (info.artBlock.left + info.artBlock.right) / 2
    assert(Math.abs(blockCenter - stageCenter) < 4, `${label} : le bloc d'informations est centré sous l'œuvre (écart ${Math.abs(blockCenter - stageCenter).toFixed(1)} px)`)
    const titleCenter = (info.artTitle.left + info.artTitle.right) / 2
    assert(Math.abs(titleCenter - stageCenter) < 4, `${label} : le titre est centré (écart ${Math.abs(titleCenter - stageCenter).toFixed(1)} px)`)
    assert(info.media.height <= Math.round(info.viewport.height * 0.7) + 2, `${label} : l'œuvre tient dans 70 vh (${info.media.height} px)`)
    if (info.artImage) {
      const image = info.artImage
      assert(image.width <= image.naturalWidth + 0.5 && image.height <= image.naturalHeight + 0.5, `${label} : l'image n'est jamais agrandie au-delà de sa taille d'origine (${Math.round(image.width)} ≤ ${image.naturalWidth})`)
      assert(Math.abs(image.frameWidth - image.width) < 1.5 && Math.abs(image.frameHeight - image.height) < 1.5, `${label} : aucun cadre autour de l'image (${Math.round(image.frameWidth)}×${Math.round(image.frameHeight)} pour ${Math.round(image.width)}×${Math.round(image.height)})`)
      assert(Math.abs(image.width / image.height - image.naturalWidth / image.naturalHeight) < 0.02, `${label} : l'image garde son format exact`)
    }
    assert(info.cartel !== null && info.artNotebook !== null && info.cartel.right < info.artNotebook.left, `${label} : cartel à gauche, carnet à droite`)
    assert(info.cartelLabels >= 1, `${label} : le cartel nomme chaque valeur (${info.cartelLabels} étiquette(s))`)
    assert(info.artBlock.top >= info.stage.bottom, `${label} : le bloc d'informations vient sous l'œuvre, jamais à côté`)
    assert(info.status !== null && info.status.top >= info.artBlock.top, `${label} : statut et carnet sont dans le bloc, sous l'œuvre`)
    assert(info.overflow <= 1, `${label} : aucun débordement horizontal (${info.overflow} px)`)
    assert(info.banners === 0, `${label} : aucune bannière n'est inventée`)
    oneLineFacts(info, label)
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()

  // ── 1. Les six bibliothèques de base, à 1440 × 900 ─────────────────────────────────────────────
  const columns = [
    ['Films', 'Aftersun'],
    ['Séries', 'Severance'],
    ['Animation japonaise', 'Arcane'],
    ['Livres', 'Les Années'],
    ['Mangas', 'Monster'],
    ['Jeux', 'Outer Wilds'],
  ]
  for (const [library, title] of columns) {
    await openLibrary(library)
    await openCard(title)
    const info = await measure()
    checkColumn(info, `${library} (${title})`)
    assert(library === 'Films' ? info.date !== null : true, `${library} : la date de visionnage est affichée`)
    assert(info.reviewLabel === 'MON AVIS', `${library} : l'avis porte son libellé (${info.reviewLabel})`)
    await page.locator('.back-button').first().click()
    await page.getByRole('heading', { level: 1, name: library, exact: true }).waitFor()
    await settle()
  }

  // ── 2. Art : paysage, portrait, poème sans image ───────────────────────────────────────────────
  await openLibrary('Art')
  const artworks = [
    ['Les Nymphéas', 'Art paysage'],
    ['Derrière la gare Saint-Lazare', 'Art portrait'],
    ['Le Pont Mirabeau', 'Poème sans image'],
  ]
  for (const [title, label] of artworks) {
    await openCard(title)
    const info = await measure()
    checkArt(info, `${label} (${title})`)
    assert(info.artTitle !== null, `${label} : le surtitre, le titre et l'artiste sont sous l'œuvre`)
    await page.locator('.back-button').first().click()
    await page.getByRole('heading', { level: 1, name: 'Art', exact: true }).waitFor()
    await settle()
  }

  // ── 3. Recettes : bibliothèque ajoutée depuis le catalogue, puis sa fiche ──────────────────────
  await nav().hover()
  await nav().getByRole('button', { name: 'Ajouter une bibliothèque', exact: true }).click()
  const catalogue = page.getByRole('dialog', { name: 'Ajouter une bibliothèque' })
  await catalogue.waitFor()
  await catalogue.getByRole('button', { name: 'Ajouter Recettes de cuisine', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Recettes' }).waitFor()
  await settle()

  const INGREDIENTS = ['200 g de farine', '100 g de beurre', '4 pommes', '1 pincée de sel']
  const STEPS = ['Mélanger la farine et le beurre.', 'Étaler la pâte.', 'Garnir et cuire 35 min à 180 °C.']
  const PHOTO = 'https://picsum.photos/seed/qa-recette-fiche/800/600'
  await page.getByRole('button', { name: 'Ajouter une recette', exact: true }).first().click()
  const form = page.getByRole('dialog', { name: 'Ajouter une recette' })
  await form.waitFor()
  await form.getByLabel('Titre', { exact: true }).fill('Tarte aux pommes')
  await form.getByLabel('Source', { exact: true }).fill('Grand-mère')
  await form.getByRole('radio', { name: 'Maîtrisée', exact: true }).click()
  await form.locator('#custom-recipes-detail-dish').click()
  await page.getByRole('option', { name: 'Dessert', exact: true }).click()
  await form.getByLabel('Préparation', { exact: true }).fill('1 h 10')
  await form.getByLabel('Cuisson', { exact: true }).fill('40 min')
  await form.getByLabel('Portions', { exact: true }).fill('6 personnes')
  await form.getByLabel('Notes', { exact: true }).fill('Meilleure tiède, se congèle bien.')
  // Une note personnelle, pour que la vérification « la note est visible sans
  // défiler » porte sur une fiche qui en a une (le clavier va par demi-points).
  await form.getByLabel('Testée le', { exact: true }).fill('2026-10-20')
  await form.getByRole('slider', { name: 'Note sur 5' }).focus()
  for (let step = 0; step < 9; step += 1) await page.keyboard.press('ArrowRight')
  const typeList = async (firstInput, lines) => {
    await firstInput.click()
    for (let index = 0; index < lines.length; index += 1) {
      if (index > 0) await page.keyboard.press('Enter')
      await page.keyboard.type(lines[index])
    }
  }
  await typeList(form.getByLabel('Ingrédients', { exact: true }).first(), INGREDIENTS)
  await typeList(form.getByLabel('Étapes', { exact: true }).first(), STEPS)
  await form.locator('.poster-edit-overlay').first().click()
  const photoDialog = page.getByRole('dialog', { name: /^Modifier (la couverture|le visuel|l’affiche)/ })
  await photoDialog.getByLabel('Adresse de l’image').fill(PHOTO)
  await photoDialog.locator('.poster-url-preview img').waitFor()
  await photoDialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await photoDialog.waitFor({ state: 'hidden' })
  await form.getByRole('button', { name: 'Ajouter une recette', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Tarte aux pommes' }).waitFor()
  await page.waitForTimeout(400)

  const recipe = await measure()
  checkColumn(recipe, 'Recettes (Tarte aux pommes)')
  assert(recipe.ingredients !== null && recipe.ingredients.left < recipe.body.left, 'Recettes : les ingrédients vivent dans la colonne gauche')
  assert(recipe.steps !== null && recipe.steps.left >= recipe.body.left, 'Recettes : les étapes vivent dans la colonne de lecture')
  assert(recipe.ingredients.bottom <= recipe.viewport.height, `Recettes : les ingrédients sont visibles sans défiler (${recipe.ingredients?.bottom} ≤ ${recipe.viewport.height})`)
  assert(recipe.denseRows === 1, `Recettes : les faits tiennent sur une seule ligne dense (${recipe.denseRows} rangée(s))`)
  assert(recipe.reviewLabel === 'NOTES', 'Recettes : le texte libre s’appelle toujours « Notes »')
  await page.getByRole('button', { name: 'Retour à Recettes', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Recettes' }).waitFor()
  await settle()

  // ── 4. 1000 × 760 : une seule colonne, sans débordement ────────────────────────────────────────
  await page.setViewportSize({ width: 1000, height: 760 })
  // Rechargement : la fenêtre change de taille et la bibliothèque repart de
  // son état enregistré, comme à l'ouverture de l'application.
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await openLibrary('Films')
  await openCard('Aftersun')
  const narrow = await measure()
  assert(narrow.columns.trim().split(/\s+/).length === 1, `1000 px : une seule colonne (${narrow.columns})`)
  assert(narrow.side !== null && narrow.body !== null && narrow.body.top >= narrow.side.bottom - 1, '1000 px : le visuel puis le contenu, dans cet ordre')
  assert(narrow.status !== null && narrow.status.top >= narrow.side.top, '1000 px : le statut suit le visuel dans la même colonne')
  assert(narrow.overflow <= 1, `1000 px : aucun débordement horizontal (${narrow.overflow} px)`)
  oneLineFacts(narrow, '1000 px')
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Films', exact: true }).waitFor()
  await settle()

  // ── 5. Thème sombre : la fiche suit la surface du thème, l'Art n'a plus de mur ───────────────────
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => localStorage.setItem('sylloge-theme', 'dark'))
  await page.reload()
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await openLibrary('Art')
  await openCard('Les Nymphéas')
  const dark = await measure()
  assert(dark.theme === 'dark', `Thème sombre : <html data-theme> vaut « dark » (${dark.theme})`)
  assert(dark.surface === '#232326', `Thème sombre : la surface du thème est appliquée (${dark.surface})`)
  // Plus de mur ni de cadre autour de l'œuvre (30 octobre 2026) : l'image seule.
  assert(dark.stageBackground === 'rgba(0, 0, 0, 0)', `Thème sombre : aucun mur derrière l'œuvre (${dark.stageBackground})`)
  checkArt(dark, 'Art en thème sombre')
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Art', exact: true }).waitFor()
  await settle()
  await page.evaluate(() => localStorage.setItem('sylloge-theme', 'light'))

  // ── 6. Anglais : l'avis et le cartel sont traduits ──────────────────────────────────
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=en')
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await openLibrary('Films')
  await openCard('Aftersun')
  const english = await measure()
  assert(english.lang === 'en', `Anglais : <html lang> vaut « en » (${english.lang})`)
  assert(english.reviewLabel === 'MY REVIEW', `Anglais : « Mon avis » devient « My review » (${english.reviewLabel})`)
  checkColumn(english, 'Anglais (Aftersun)')
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Films', exact: true }).waitFor()
  await settle()
  await openLibrary('Art')
  await openCard('Les Nymphéas')
  const englishArt = await page.evaluate(() => [...document.querySelectorAll('.detail-cartel dt')].map(term => term.innerText?.trim() ?? ''))
  const cartelLabels = englishArt.map(term => term.toLowerCase())
  assert(cartelLabels.includes('location') && cartelLabels.includes('technique'), `Anglais : les étiquettes du cartel sont traduites (${englishArt.join(', ')})`)

  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  await page.unroute('https://picsum.photos/**')
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
