// Cartes des bibliothèques : le visuel modifié depuis une fiche arrive dans la grille, et la
// ligne de faits montre signature, note (ou année) et état sur trois lignes serrées.
// Défauts du 25 octobre 2026 : (1) un visuel changé sur la fiche restait l'ancien dans la grille —
// la grille lit sa propre requête SQL, que l'écriture de la fiche n'invalidait pas ; (2) le titre
// réservait deux lignes et laissait un vide avant la signature ; (3) note, coup de cœur, signature
// et année ne se voyaient pas sur la carte.
// Images simulées : aucun réseau. Ouvrir la session playwright-cli depuis le dossier scratch.
async page => {
  page.setDefaultTimeout(8000)
  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  await page.route('https://picsum.photos/**', route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    headers: { 'cache-control': 'no-store' },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#41506b"/></svg>',
  }))
  const nav = () => page.getByRole('navigation', { name: 'Navigation principale' })
  const sql = (query, values = []) => page.evaluate(([q, v]) => window.__syllogeRecette.select(q, v), [query, values])
  const settle = async () => {
    await page.mouse.move(900, 500)
    await page.locator('.sidebar-expanded').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(400)
  }
  const link = seed => `https://picsum.photos/seed/qa-carte-${seed}/400/600`
  const gridOf = library => page.locator(library === 'Art' ? '.artwork-grid' : '.film-grid').first()
  const openLibrary = async library => {
    await nav().getByRole('button', { name: library, exact: true }).click()
    await page.getByRole('heading', { level: 1, name: library }).waitFor()
    await settle()
    // La bibliothèque peut s'ouvrir sur la vue watchlist : « Tous » montre toute la collection.
    await page.getByRole('button', { name: 'Tous', exact: true }).first().click().catch(() => {})
    await page.waitForTimeout(450)
    await gridOf(library).waitFor()
  }
  const cardIndex = (library, title) => page.evaluate(([grid, value]) => {
    const cards = [...document.querySelectorAll(grid)]
    return cards.findIndex(card => card.querySelector('.film-card-top b')?.textContent === value)
  }, [library === 'Art' ? '.artwork-grid .film-card' : '.film-grid .film-card', title])
  const card = async (library, title) => {
    const index = await cardIndex(library, title)
    if (index < 0) throw Error(`Carte « ${title} » absente de ${library}`)
    return page.locator(library === 'Art' ? '.artwork-grid .film-card' : '.film-grid .film-card').nth(index)
  }
  const facts = async (library, title) => {
    const target = await card(library, title)
    return target.evaluate(node => {
      const titleNode = node.querySelector('.film-card-top b')
      const meta = node.querySelector('.film-card-meta')
      // Le vide perçu est celui entre la dernière ligne réellement dessinée du
      // titre et la ligne de faits : la boîte du titre peut garder de la place
      // réservée que l'œil voit comme un trou.
      const lastTextBottom = (() => {
        if (!titleNode) return null
        const range = document.createRange()
        range.selectNodeContents(titleNode)
        const rects = [...range.getClientRects()]
        return rects.length > 0 ? rects[rects.length - 1].bottom : null
      })()
      return {
        signature: node.querySelector('.film-card-meta small')?.textContent ?? null,
        rating: (node.querySelector('.card-rating')?.textContent ?? '').replace(/\s+/g, ''),
        ratingLabel: node.querySelector('.card-rating')?.getAttribute('aria-label') ?? null,
        year: node.querySelector('.card-year')?.textContent ?? null,
        status: node.querySelector('.status-line')?.textContent ?? null,
        favorite: node.querySelector('.film-card-top i') !== null,
        gapTitleToMeta: lastTextBottom !== null && meta
          ? Math.round((meta.getBoundingClientRect().top - lastTextBottom) * 10) / 10
          : null,
        overflow: meta ? meta.scrollWidth - meta.clientWidth : null,
      }
    })
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('http://127.0.0.1:5174/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()

  // ── 1. Le visuel changé sur la fiche arrive dans la grille, bibliothèque par bibliothèque ────────
  const visualCases = [
    ['Séries', 'Mad Men', 'series', 'poster_url', 'series'],
    ['Animation japonaise', 'Neon Genesis Evangelion', 'anime', 'poster_url', 'anime'],
    ['Livres', 'L’Anomalie', 'books', 'cover_url', 'books'],
    ['Mangas', 'Monster', 'mangas', 'cover_url', 'mangas'],
    ['Jeux', 'Return of the Obra Dinn', 'games', 'cover_url', 'games'],
    ['Art', 'Nighthawks', 'artworks', 'image_url', 'art'],
  ]
  for (const [library, title, table, column, seed] of visualCases) {
    const url = link(seed)
    await openLibrary(library)
    await (await card(library, title)).click()
    await page.locator('.detail-poster').first().waitFor()
    await page.waitForTimeout(500)
    await page.locator('.detail-poster .poster-edit-overlay').click()
    const dialog = page.getByRole('dialog', { name: /^Modifier (l’affiche|la couverture|le visuel)/ })
    await dialog.waitFor()
    await dialog.getByLabel('Adresse de l’image').fill(url)
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page.waitForTimeout(500)
    await page.locator('.detail-action-bar .back-button').first().click()
    await gridOf(library).waitFor()
    await page.waitForTimeout(400)
    const shown = await (await card(library, title)).locator('img').getAttribute('src')
    assert(shown === url, `${library} : la grille montre le visuel enregistré depuis la fiche`)
    assert((await sql(`SELECT ${column} AS value FROM ${table} WHERE title = $1`, [title]))[0]?.value === url, `${library} : le visuel est écrit dans ${table}.${column}`)
  }

  // ── 2. Ligne de faits : signature, note (ou année), coup de cœur et état ────────────────────────
  // Film vu et noté : réalisateur et année à gauche, note à droite, coup de cœur à côté du titre.
  await openLibrary('Films')
  const rated = await facts('Films', 'Anatomie d’une chute')
  assert(rated.signature === 'Justine Triet · 2023', `Films : réalisation et année en signature (${rated.signature})`)
  assert(rated.rating === '★4,5', `Films : note affichée sur la carte (${rated.rating})`)
  assert(rated.ratingLabel === '4,5 sur 5', `Films : la note est nommée pour les lecteurs d’écran (${rated.ratingLabel})`)
  assert(rated.year === null, 'Films : l’année ne double pas la note')
  assert(rated.status === 'Terminé', `Films : état affiché (${rated.status})`)
  assert(rated.favorite === true, 'Films : coup de cœur visible')
  assert(rated.gapTitleToMeta !== null && rated.gapTitleToMeta <= 8, `Films : aucun vide sous le titre (${rated.gapTitleToMeta} px)`)
  assert(rated.overflow === 0, 'Films : la ligne de faits ne déborde pas')
  // Film pas encore vu : pas de note, l'année prend sa place.
  const watchlist = await facts('Films', 'La Zone d’intérêt')
  assert(watchlist.signature === 'Jonathan Glazer', `Films : signature seule sans note (${watchlist.signature})`)
  assert(watchlist.rating === '' && watchlist.year === '2023', `Films : l’année remplace la note (${watchlist.year})`)
  assert(watchlist.status === 'À découvrir', `Films : état de watchlist (${watchlist.status})`)
  assert(watchlist.favorite === false, 'Films : pas de coup de cœur inventé')

  // Séries : showrunner, note, progression dans la pastille. Le médium n'a pas d'année : rien à droite sans note.
  await openLibrary('Séries')
  const series = await facts('Séries', 'Severance')
  assert(series.signature === 'Dan Erickson', `Séries : showrunner en signature (${series.signature})`)
  assert(series.rating === '★4,5', `Séries : note affichée (${series.rating})`)
  assert(series.status === 'En cours · 1 / 2 saisons', `Séries : état et progression (${series.status})`)
  assert(series.favorite === true, 'Séries : coup de cœur visible')
  assert(series.gapTitleToMeta !== null && series.gapTitleToMeta <= 8, `Séries : aucun vide sous le titre (${series.gapTitleToMeta} px)`)
  const seriesWatchlist = await facts('Séries', 'The Leftovers')
  assert(seriesWatchlist.rating === '' && seriesWatchlist.year === null, 'Séries : « À voir » sans note ni année (le médium n’a pas d’année)')
  assert(seriesWatchlist.status === 'À voir', `Séries : état « À voir » (${seriesWatchlist.status})`)

  // Livres : auteur et année en signature quand la note existe, année seule sinon.
  await openLibrary('Livres')
  const book = await facts('Livres', 'Les Années')
  assert(book.signature === 'Annie Ernaux · 2008', `Livres : auteur et année en signature (${book.signature})`)
  assert(book.rating === '★5', `Livres : note affichée (${book.rating})`)
  assert(book.status === 'Lu', `Livres : état affiché (${book.status})`)
  const unread = await facts('Livres', 'Station Eleven')
  assert(unread.signature === 'Emily St. John Mandel' && unread.year === '2014', `Livres : année à droite pour un livre non lu (${unread.signature} / ${unread.year})`)

  // Mangas : progression en tomes.
  await openLibrary('Mangas')
  const manga = await facts('Mangas', 'Monster')
  assert(manga.signature === 'Naoki Urasawa · 1994', `Mangas : auteur et année (${manga.signature})`)
  assert(manga.status === 'En cours · 11 / 18 tomes', `Mangas : progression en tomes (${manga.status})`)

  // Jeux : plateforme puis développeur.
  await openLibrary('Jeux')
  const game = await facts('Jeux', 'Outer Wilds')
  assert(game.signature === 'PC · Mobius Digital · 2019', `Jeux : plateforme et développeur (${game.signature})`)
  assert(game.rating === '★5', `Jeux : note affichée (${game.rating})`)
  const unplayed = await facts('Jeux', 'Return of the Obra Dinn')
  assert(unplayed.signature === 'PC · Lucas Pope' && unplayed.year === '2018', `Jeux : année à droite pour un jeu pas encore joué (${unplayed.signature} / ${unplayed.year})`)

  // Art : pas de note dans le médium, forme et artiste, année toujours à droite.
  await openLibrary('Art')
  const artwork = await facts('Art', 'Nighthawks')
  assert(artwork.signature === 'Peinture · Edward Hopper', `Art : forme et artiste (${artwork.signature})`)
  assert(artwork.rating === '' && artwork.year === '1942', `Art : année à droite, jamais de note (${artwork.year})`)
  assert(artwork.status === 'Découverte', `Art : état affiché (${artwork.status})`)

  await page.unroute('https://picsum.photos/**')
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, checks: checks.length, list: checks })
}
