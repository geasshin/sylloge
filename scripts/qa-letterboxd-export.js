// Export Letterboxd (qa-app.html, données synthétiques) : le fichier réellement produit par l'interface,
// relu tel que Letterboxd le recevrait. Gardes : en-tête officiel, seuls les films terminés dans le fichier
// « vus », seuls les films à découvrir dans « à voir », identifiants TMDB transmis, bilan honnête de ce qui
// n'a pas pu partir, annulation sans fichier, et option réservée aux films.
async page => {
  page.setDefaultTimeout(10000)
  const checks = []
  const errors = []
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  page.on('pageerror', error => errors.push(error.message))

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  const start = async (cancel = false) => {
    await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
    await page.evaluate(() => ['sylloge-theme', 'sylloge-sidebar-pinned'].forEach(key => localStorage.removeItem(key)))
    await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
    await page.getByRole('heading', { level: 1 }).first().waitFor()
    await page.evaluate(cancelled => {
      const invoke = window.__TAURI_INTERNALS__.invoke
      window.__lbx = { saved: [] }
      window.__TAURI_INTERNALS__.invoke = async (cmd, args, ...rest) => {
        if (cmd === 'save_export_csv') {
          if (cancelled) return null
          window.__lbx.saved.push({ name: args.suggestedName, contents: args.contents })
          return args.suggestedName
        }
        return invoke(cmd, args, ...rest)
      }
    }, cancel)
  }
  const openExport = async library => {
    await page.locator('nav').getByRole('button', { name: library, exact: true }).click()
    await page.getByRole('heading', { level: 1, name: library }).waitFor()
    await page.getByRole('button', { name: 'Exporter', exact: true }).first().click()
    return page.getByRole('dialog', { name: /Exporter/ })
  }
  const parse = contents => contents.split('\r\n').filter(Boolean)

  await start()
  const library = await page.evaluate(async () => {
    const { libraryRepository } = await import('/src/data/libraryRepository.ts')
    const loaded = await libraryRepository.loadLibrary('qa-profile')
    const count = status => loaded.films.filter(film => film.status === status).length
    return {
      done: count('terminé'), todo: count('à découvrir'), other: loaded.films.length - count('terminé') - count('à découvrir'),
      tmdb: loaded.films.filter(film => film.status === 'terminé' && film.providerName === 'tmdb' && /^\d+$/.test(film.providerId ?? '')).length,
      favorites: loaded.films.filter(film => film.status === 'terminé' && film.isFavorite).length,
    }
  })
  assert(library.done > 0 && library.todo > 0 && library.other > 0, `Jeu d'essai : films terminés, à découvrir et autres (${JSON.stringify(library)})`)

  // ── 1. Films vus ─────────────────────────────────────────────────────────────────────────────────
  const dialog = await openExport('Films')
  assert(await dialog.getByRole('button', { name: /Letterboxd · films vus/ }).count() === 1 && await dialog.getByRole('button', { name: /Letterboxd · liste à voir/ }).count() === 1, 'Films › Exporter : les deux options Letterboxd')
  await dialog.getByRole('button', { name: /Letterboxd · films vus/ }).click()
  await dialog.getByText(/Export Letterboxd enregistré dans/).waitFor()
  const watched = await page.evaluate(() => window.__lbx.saved)
  assert(watched.length === 1 && /^sylloge-letterboxd-vus-\d{4}-\d{2}-\d{2}\.csv$/.test(watched[0].name), `Nom du fichier (${watched[0]?.name})`)
  const rows = parse(watched[0].contents)
  assert(rows[0] === 'tmdbID,Title,Year,Directors,Rating,WatchedDate,Review', 'En-tête officiel de Letterboxd')
  assert(rows.length - 1 === library.done, `Une ligne par film terminé (${rows.length - 1} = ${library.done})`)
  const withId = rows.slice(1).filter(row => /^\d+,/.test(row)).length
  assert(withId === library.tmdb, `Identifiants TMDB transmis pour les films associés (${withId} = ${library.tmdb})`)
  assert(rows.slice(1).every(row => !/^'/.test(row)), 'Aucun préfixe de protection de tableur')
  const report = await dialog.getByRole('status').last().innerText()
  assert(/Reconnus par titre seulement/.test(report) || withId === library.done, `Bilan : les films reconnus par titre seulement sont signalés (${report.slice(0, 120)})`)
  assert(library.favorites === 0 || /Favoris non transmis \(Letterboxd n’a pas de colonne favori\) : \d+/.test(report), 'Bilan : les favoris non transmis sont signalés')
  assert(new RegExp(`Films d’un autre statut, non inclus : ${library.todo + library.other}`).test(report), 'Bilan : les films d’un autre statut sont comptés')
  await page.screenshot({ path: '/Users/aurelientrouble/.hermes/profiles/promethee/cache/scratch/qa/lbx-1-dialog.png' })

  // ── 2. Liste à voir ──────────────────────────────────────────────────────────────────────────────
  await dialog.getByRole('button', { name: /Letterboxd · liste à voir/ }).click()
  await page.waitForFunction(() => window.__lbx.saved.length === 2)
  const watchlist = await page.evaluate(() => window.__lbx.saved[1])
  const wl = parse(watchlist.contents)
  assert(/^sylloge-letterboxd-a-voir-/.test(watchlist.name) && wl[0] === 'tmdbID,Title,Year,Directors', 'Liste à voir : fichier et en-tête distincts')
  assert(wl.length - 1 === library.todo, `Liste à voir : un film par ligne (${wl.length - 1} = ${library.todo})`)
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 3. Annulation : rien d'écrit, message clair ──────────────────────────────────────────────────
  await start(true)
  const cancelDialog = await openExport('Films')
  await cancelDialog.getByRole('button', { name: /Letterboxd · films vus/ }).click()
  await cancelDialog.getByText(/Export CSV annulé\. Aucun fichier n’a été écrit\./).waitFor()
  assert(await page.evaluate(() => window.__lbx.saved.length) === 0, 'Annulation : aucun fichier écrit')
  await cancelDialog.getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 4. Option réservée aux films ─────────────────────────────────────────────────────────────────
  await start()
  for (const other of ['Livres', 'Jeux']) {
    const otherDialog = await openExport(other)
    assert(await otherDialog.getByRole('button', { name: /Letterboxd/ }).count() === 0, `${other} › Exporter : pas d’option Letterboxd`)
    await otherDialog.getByRole('button', { name: 'Fermer', exact: true }).click()
  }
  const profileDialog = await openExport('Films')
  await profileDialog.getByRole('radio', { name: /Tout le profil/ }).check()
  assert(await profileDialog.getByRole('button', { name: /Letterboxd/ }).count() === 0, 'Tout le profil : pas d’option Letterboxd (un fichier de films seulement)')
  await profileDialog.getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 5. Anglais ───────────────────────────────────────────────────────────────────────────────────
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=en')
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.locator('nav').getByRole('button', { name: 'Films', exact: true }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).first().click()
  const english = page.getByRole('dialog', { name: /Export/ })
  assert(await english.getByRole('button', { name: /Letterboxd · watched films/ }).count() === 1 && await english.getByRole('button', { name: /Letterboxd · watchlist/ }).count() === 1, 'Anglais : options traduites')
  await english.getByRole('button', { name: 'Close', exact: true }).click()

  await page.evaluate(() => ['sylloge-theme', 'sylloge-language', 'sylloge-sidebar-pinned'].forEach(key => localStorage.removeItem(key)))
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
