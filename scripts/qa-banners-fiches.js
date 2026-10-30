// Bannières 16:9 dans les vraies fiches (qa-app.html, SQLite en mémoire, images simulées : aucun réseau).
//
// Dans le harnais `scenario=full` : une fiche Film, Série, Animation japonaise et Jeu
// sans bannière montre le bouton « Ajouter une bannière » dans sa barre d'actions ;
// la fenêtre choisit une image officielle simulée ; l'enregistrement écrit la colonne
// (films.banner_url, series.banner_url, anime.banner_url, games.banner_url), affiche le
// bandeau en tête et met la collection à jour ; le retrait rend le bouton. Livre et Art
// n'ont aucun bouton. Les fixtures portent déjà une bannière (Film et Série), pour le
// rendu et le crayon. Vérifie aussi la composition (bandeau au-dessus des colonnes,
// colonne gauche non collante, aucun débordement à 1000 × 760), le thème sombre et
// l'anglais.
//
// Ouvrir la session playwright-cli depuis le dossier scratch : aucune capture n'est
// écrite ici.
async page => {
  page.setDefaultTimeout(8000)
  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }

  // Toute image picsum est servie en SVG à la taille demandée : aucun réseau,
  // et le format du bandeau se mesure comme en vrai.
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
  const sql = (query, values = []) => page.evaluate(([q, v]) => window.__syllogeRecette.select(q, v), [query, values])
  const write = (query, values = []) => page.evaluate(([q, v]) => window.__syllogeRecette.execute(q, v), [query, values])
  const stored = async (table, id) => (await sql(`SELECT banner_url FROM ${table} WHERE id = $1`, [id]))[0]?.banner_url ?? null
  const addButton = () => page.locator('.detail-actions').getByRole('button', { name: 'Ajouter une bannière', exact: true })
  const banner = () => page.locator('.detail-banner').first()
  const dialog = () => page.getByRole('dialog', { name: 'Choisir une bannière' })
  const bannerSrc = () => banner().locator('img').getAttribute('src')
  const actionBarOnOneLine = async () => {
    const width = page.viewportSize()?.width ?? 1440
    const boxes = await page.locator('.detail-actions > *').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect()
      return { top: Math.round(rect.top), right: Math.round(rect.right) }
    }))
    return boxes.length > 0
      && new Set(boxes.map(box => box.top)).size === 1
      && boxes.every(box => box.right <= width)
  }
  const save = async () => {
    await dialog().getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await dialog().waitFor({ state: 'hidden' })
    await page.waitForTimeout(500)
  }
  const provider = async (medium, mediaId, providerName, providerId) => {
    await write(
      `INSERT INTO media_provider_links (profile_id, medium, media_id, provider_name, provider_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['qa-profile', medium, mediaId, providerName, providerId, '2026-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z'],
    )
  }

  /** Le parcours complet d'un médium : ajout, écriture, affichage, retrait. */
  const cycle = async ({ label, library, title, table, id }) => {
    await openLibrary(library)
    await openCard(title)
    assert(await banner().count() === 0, `${label} : aucune bannière au départ`)
    assert(await addButton().count() === 1, `${label} : « Ajouter une bannière » est dans la barre d’actions`)
    assert(await page.locator('.detail-actions .icon-action-button').count() >= 2, `${label} : le bouton d’ajout côtoie Modifier et Associer`)
    assert(await actionBarOnOneLine(), `${label} : la barre d’actions reste sur une ligne`)

    await addButton().click()
    await dialog().waitFor()
    await page.locator('.banner-dialog-item').first().waitFor()
    const thumbs = await page.locator('.banner-dialog-item img').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')))
    assert(thumbs.length === 3, `${label} : trois images officielles simulées après filtrage (${thumbs.length})`)
    assert(thumbs[0].includes('textless'), `${label} : l’image sans texte passe en tête`)
    await page.locator('.banner-dialog-item').first().click()
    const chosen = await dialog().getByLabel('Adresse de l’image').inputValue()
    assert(chosen.includes('1920/1080'), `${label} : la vignette pose l’adresse en grand dans le champ`)
    await save()

    await banner().locator('img').waitFor()
    assert(await bannerSrc() === chosen, `${label} : le bandeau affiche l’image choisie`)
    assert(await stored(table, id) === chosen, `${label} : l’adresse est écrite dans ${table}.banner_url`)
    assert(await banner().locator('.banner-edit-overlay').count() === 1, `${label} : le crayon « Modifier la bannière » est dans le bandeau`)
    assert(await addButton().count() === 0, `${label} : le bouton d’ajout disparaît quand une bannière existe`)

    // Le bandeau occupe la première rangée, au-dessus des deux colonnes.
    const geometry = await page.evaluate(() => {
      const box = selector => {
        const element = document.querySelector(selector)
        if (!element) return null
        const rect = element.getBoundingClientRect()
        return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width) }
      }
      return { layout: box('.detail-layout'), banner: box('.detail-banner'), side: box('.detail-side') }
    })
    assert(geometry.layout !== null && geometry.banner !== null && geometry.side !== null, `${label} : la fiche, son bandeau et sa colonne existent`)
    assert(geometry.banner.top <= geometry.layout.top + 2, `${label} : le bandeau ouvre la fiche (${geometry.banner.top} / ${geometry.layout.top})`)
    assert(geometry.banner.bottom <= geometry.side.top + 1, `${label} : les colonnes commencent sous le bandeau (${geometry.banner.bottom} / ${geometry.side.top})`)
    assert(await page.evaluate(() => getComputedStyle(document.querySelector('.detail-side')).position) === 'static', `${label} : la colonne gauche ne chevauche pas le bandeau`)

    // Retour à la grille : la fiche est toujours là, et rouverte elle garde son bandeau
    // (collection en mémoire et requête de bibliothèque à jour).
    await page.locator('.back-button').first().click()
    await page.getByRole('heading', { level: 1, name: library, exact: true }).waitFor()
    await settle()
    assert(await page.locator('.film-card-top > b', { hasText: exact(title) }).count() === 1, `${label} : la fiche reste dans la grille`)
    await openCard(title)
    assert(await banner().count() === 1, `${label} : la fiche rouverte montre son bandeau`)
    assert(await bannerSrc() === chosen, `${label} : la fiche rouverte garde l’adresse enregistrée`)

    // Retrait : le bandeau disparaît, le bouton revient, la colonne est nulle en base.
    await banner().hover()
    await banner().locator('.banner-edit-overlay').click()
    await dialog().waitFor()
    await dialog().getByRole('button', { name: 'Retirer la bannière' }).click()
    await save()
    await page.waitForFunction(() => document.querySelectorAll('.detail-banner').length === 0)
    assert(await stored(table, id) === null, `${label} : le retrait remet ${table}.banner_url à nul`)
    assert(await addButton().count() === 1, `${label} : « Ajouter une bannière » revient après le retrait`)
    assert(await page.locator('.detail-layout').first().evaluate(node => node.classList.contains('detail-layout-bannered')) === false, `${label} : la composition reprend sans bandeau`)

    await page.locator('.back-button').first().click()
    await page.getByRole('heading', { level: 1, name: library, exact: true }).waitFor()
    await settle()
  }

  try {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()

  // Les identifiants fournisseur manquent aux fixtures Séries/Animés/Jeux : la
  // recette les pose en base, comme une fiche associée avant d'ouvrir sa bannière.
  await provider('series', 'series-succession', 'TMDB', '1399')
  await provider('series', 'series-fleabag', 'TMDB', '30991')
  await provider('anime', 'series-cowboy-bebop', 'TMDB', '30991')
  await provider('games', 'game-celeste', 'IGDB', '1942')

  // ── 1. Les fixtures déjà pourvues : bandeau et crayon, aucun bouton d'ajout ──────────────
  await openLibrary('Films')
  await openCard('Portrait de la jeune fille en feu')
  assert(await banner().count() === 1, 'Fixture Film : la bannière est affichée d’emblée')
  assert((await stored('films', 'film-portrait-de-la-jeune-fille-en-feu'))?.includes('picsum.photos'), 'Fixture Film : l’adresse est en base')
  assert(await addButton().count() === 0, 'Fixture Film : aucun bouton d’ajout quand la bannière existe')
  const seededEdit = await banner().locator('.banner-edit-overlay').getAttribute('aria-label')
  assert(seededEdit.includes('Modifier la bannière de « Portrait de la jeune fille en feu »'), `Fixture Film : le crayon est nommé (${seededEdit})`)
  const seededHeight = await page.evaluate(() => document.querySelector('.detail-banner')?.getBoundingClientRect().height ?? 0)
  assert(seededHeight <= Math.ceil(900 * 0.32) + 1, `Fixture Film : hauteur du bandeau bornée à 32 vh (${Math.round(seededHeight)} px)`)
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Films', exact: true }).waitFor()
  await settle()

  await openLibrary('Séries')
  await openCard('Succession')
  assert(await banner().count() === 1, 'Fixture Série : la bannière est affichée d’emblée')
  assert(await addButton().count() === 0, 'Fixture Série : aucun bouton d’ajout')
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Séries', exact: true }).waitFor()
  await settle()

  // ── 2. Le parcours complet dans une fiche Film, Série, Animé et Jeu ─────────────────────
  await cycle({ label: 'Film', library: 'Films', title: 'Perfect Days', table: 'films', id: 'film-perfect-days' })
  await cycle({ label: 'Série', library: 'Séries', title: 'Fleabag', table: 'series', id: 'series-fleabag' })
  await cycle({ label: 'Animé', library: 'Animation japonaise', title: 'Cowboy Bebop', table: 'anime', id: 'series-cowboy-bebop' })
  await cycle({ label: 'Jeu', library: 'Jeux', title: 'Celeste', table: 'games', id: 'game-celeste' })

  // ── 3. Livre et Art : ni bandeau, ni bouton ─────────────────────────────────────────────
  await openLibrary('Livres')
  await openCard('Les Années')
  assert(await addButton().count() === 0, 'Livre : aucun bouton « Ajouter une bannière »')
  assert(await banner().count() === 0, 'Livre : aucun bandeau')
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Livres', exact: true }).waitFor()
  await settle()

  await openLibrary('Art')
  await openCard('Nighthawks')
  assert(await addButton().count() === 0, 'Art : aucun bouton « Ajouter une bannière »')
  assert(await banner().count() === 0, 'Art : aucun bandeau')
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Art', exact: true }).waitFor()
  await settle()

  // ── 4. Défilement : le statut et la note restent atteignables sous le bandeau ───────────
  await openLibrary('Films')
  await openCard('Portrait de la jeune fille en feu')
  const aboveFold = await page.evaluate(() => {
    const bottom = selector => document.querySelector(selector)?.getBoundingClientRect().bottom ?? Infinity
    return { status: bottom('.detail-status'), rate: bottom('.detail-rate'), notebook: bottom('.detail-notebook'), viewport: window.innerHeight }
  })
  assert(aboveFold.status <= aboveFold.viewport, `1440 px avec bannière : le statut reste visible sans défiler (${aboveFold.status} ≤ ${aboveFold.viewport})`)
  assert(aboveFold.rate <= aboveFold.viewport, `1440 px avec bannière : la note reste visible sans défiler (${aboveFold.rate} ≤ ${aboveFold.viewport})`)
  await page.evaluate(() => window.scrollTo(0, 260))
  await page.waitForTimeout(250)
  const scrolled = await page.evaluate(() => {
    const banner = document.querySelector('.detail-banner')?.getBoundingClientRect()
    const side = document.querySelector('.detail-side')?.getBoundingClientRect()
    const status = document.querySelector('.detail-status')?.getBoundingClientRect()
    const rate = document.querySelector('.detail-rate')?.getBoundingClientRect()
    return { banner: banner && { top: banner.top, bottom: banner.bottom }, side: side && { top: side.top }, status: status && { top: status.top, bottom: status.bottom }, rate: rate && { bottom: rate.bottom } }
  })
  assert(scrolled.side.top >= scrolled.banner.bottom, `Défilement : la colonne gauche reste sous le bandeau (${scrolled.side.top} ≥ ${scrolled.banner.bottom})`)
  const statusReachable = await page.evaluate(async () => {
    document.querySelector('.detail-status')?.scrollIntoView({ block: 'center' })
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const rect = document.querySelector('.detail-status')?.getBoundingClientRect()
    return rect ? rect.top >= 0 && rect.bottom <= window.innerHeight : false
  })
  assert(statusReachable, 'Défilement : le statut reste atteignable')
  const rateReachable = await page.evaluate(async () => {
    document.querySelector('.detail-rate')?.scrollIntoView({ block: 'center' })
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const rect = document.querySelector('.detail-rate')?.getBoundingClientRect()
    return rect ? rect.top >= 0 && rect.bottom <= window.innerHeight : false
  })
  assert(rateReachable, 'Défilement : la note reste atteignable')
  const wideOverflow = await page.evaluate(() => {
    const main = document.querySelector('.detail-page-main')
    return main ? main.scrollWidth - main.clientWidth : 0
  })
  assert(wideOverflow <= 1, `1440 px : aucun débordement horizontal (${wideOverflow} px)`)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Films', exact: true }).waitFor()
  await settle()

  // ── 5. 1000 × 760 : bandeau et bouton sans débordement, actions sur une ligne ───────────
  await page.setViewportSize({ width: 1000, height: 760 })
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await openLibrary('Films')
  await openCard('Perfect Days')
  assert(await addButton().count() === 1, '1000 px : le bouton d’ajout reste visible sans bannière')
  assert(await actionBarOnOneLine(), '1000 px : Modifier, Associer et Ajouter une bannière tiennent sur une ligne')
  const narrowNoBanner = await page.evaluate(() => {
    const main = document.querySelector('.detail-page-main')
    return main ? main.scrollWidth - main.clientWidth : 0
  })
  assert(narrowNoBanner <= 1, `1000 px : aucun débordement avec le bouton (${narrowNoBanner} px)`)
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Films', exact: true }).waitFor()
  await settle()

  await openCard('Portrait de la jeune fille en feu')
  const narrow = await page.evaluate(() => {
    const main = document.querySelector('.detail-page-main')
    const banner = document.querySelector('.detail-banner')?.getBoundingClientRect()
    const columns = getComputedStyle(document.querySelector('.detail-layout')).gridTemplateColumns
    return { overflow: main ? main.scrollWidth - main.clientWidth : 0, bannerWidth: banner?.width ?? 0, columns }
  })
  assert(narrow.columns.trim().split(/\s+/).length === 1, `1000 px : une seule colonne avec bannière (${narrow.columns})`)
  assert(narrow.bannerWidth <= 1000, `1000 px : le bandeau tient dans la fenêtre (${Math.round(narrow.bannerWidth)} px)`)
  assert(narrow.overflow <= 1, `1000 px : aucun débordement avec bannière (${narrow.overflow} px)`)
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Films', exact: true }).waitFor()
  await settle()

  // ── 6. Thème sombre : le bandeau garde son cadre et la surface du thème ─────────────────
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => localStorage.setItem('sylloge-theme', 'dark'))
  await page.reload()
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await openLibrary('Films')
  await openCard('Portrait de la jeune fille en feu')
  const dark = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme ?? 'light',
    surface: getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim(),
    banner: document.querySelector('.detail-banner') !== null,
  }))
  assert(dark.theme === 'dark', `Thème sombre : <html data-theme> vaut « dark » (${dark.theme})`)
  assert(dark.surface === '#232326', `Thème sombre : la surface du thème est appliquée (${dark.surface})`)
  assert(dark.banner, 'Thème sombre : le bandeau reste affiché')
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Films', exact: true }).waitFor()
  await settle()
  await page.evaluate(() => localStorage.setItem('sylloge-theme', 'light'))

  // ── 7. Anglais : bouton, fenêtre et crayon sont traduits ────────────────────────────────
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=en')
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await openLibrary('Films')
  await openCard('Perfect Days')
  const englishAdd = page.locator('.detail-actions').getByRole('button', { name: 'Add a banner', exact: true })
  assert(await englishAdd.count() === 1, 'Anglais : « Add a banner » remplace « Ajouter une bannière »')
  await englishAdd.click()
  const englishDialog = page.getByRole('dialog', { name: 'Choose a banner' })
  await englishDialog.waitFor()
  const englishText = await englishDialog.innerText()
  for (const copy of ['A landscape image for', 'Image address', 'Remove banner', 'Save']) {
    assert(englishText.includes(copy), `Anglais : « ${copy} » est traduit dans la fenêtre`)
  }
  await page.keyboard.press('Escape')
  await page.locator('.back-button').first().click()
  await page.getByRole('heading', { level: 1, name: 'Films', exact: true }).waitFor()
  await settle()
  await openCard('Portrait de la jeune fille en feu')
  const englishEdit = await banner().locator('.banner-edit-overlay').getAttribute('aria-label')
  assert(englishEdit === 'Edit the banner for “Portrait de la jeune fille en feu”', `Anglais : le crayon du bandeau est nommé (${englishEdit})`)

  await page.unroute('https://picsum.photos/**')
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return { ok: true, count: checks.length, checks }
  } catch (error) {
    // Le dernier contrôle réussi et l'erreur, pour savoir où la recette s'arrête.
    return { ok: false, error: String(error), count: checks.length, passed: checks, pageErrors: errors }
  }
}
