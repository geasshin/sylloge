// Exports vers les services (qa-app.html, données synthétiques) : le dialogue recomposé en deux
// groupes, et le fichier réellement produit pour chaque service, relu tel que le service le recevrait.
// Gardes : services proposés par bibliothèque (et pas les autres), en-tête exact, chaque ligne
// confrontée à la fiche dont elle vient, note convertie, identifiant TMDB présent quand la fiche est
// liée, bilan affiché, Jeux et Art sans « Exporter vers… », anglais, et preuve de mutation (un lien
// fournisseur ajouté change le fichier Simkl suivant).
async page => {
  page.setDefaultTimeout(15000)
  const checks = []
  const errors = []
  // `assert` consigne un point de contrôle ; `must` vérifie une ligne du fichier sans gonfler la liste.
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  const must = (ok, name) => { if (!ok) throw Error(name) }
  page.on('pageerror', error => errors.push(error.message))

  const BASE = 'http://127.0.0.1:5173/qa-app.html?scenario=full'
  const OUT = '/Users/aurelientrouble/.hermes/profiles/promethee/cache/scratch/exports'

  const parseCsv = text => {
    const out = []
    let row = []
    let cell = ''
    let quoted = false
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]
      if (quoted) {
        if (character === '"') {
          if (text[index + 1] === '"') { cell += '"'; index += 1 } else quoted = false
        } else cell += character
      } else if (character === '"') quoted = true
      else if (character === ',') { row.push(cell); cell = '' }
      else if (character === '\r') { /* CRLF */ }
      else if (character === '\n') { row.push(cell); out.push(row); row = []; cell = '' }
      else cell += character
    }
    if (cell !== '' || row.length > 0) { row.push(cell); out.push(row) }
    return out
  }
  const tableOf = contents => parseCsv(contents)
  const record = (header, row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? '']))

  const start = async (lang = 'fr', theme = 'light') => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE}&lang=${lang}`)
    await page.evaluate((value) => {
      ['sylloge-sidebar-pinned', 'sylloge-language'].forEach(key => localStorage.removeItem(key))
      localStorage.setItem('sylloge-theme', value)
    }, theme)
    await page.goto(`${BASE}&lang=${lang}`)
    await page.getByRole('heading', { level: 1 }).first().waitFor()
    await page.evaluate(() => {
      const invoke = window.__TAURI_INTERNALS__.invoke
      window.__exports = { saved: [] }
      window.__TAURI_INTERNALS__.invoke = async (cmd, args, ...rest) => {
        if (cmd === 'save_export_csv') {
          window.__exports.saved.push({ name: args.suggestedName, contents: args.contents })
          return args.suggestedName
        }
        return invoke(cmd, args, ...rest)
      }
    })
  }

  const openLibrary = async label => {
    await page.locator(`.sidebar button[aria-label="${label}"]`).click()
    await page.getByRole('heading', { level: 1, name: label }).waitFor()
  }
  const openExport = async label => {
    await openLibrary(label)
    await page.getByRole('button', { name: 'Exporter', exact: true }).first().click()
    return page.getByRole('dialog', { name: /Exporter/ })
  }
  const savedCount = () => page.evaluate(() => window.__exports.saved.length)
  const lastSaved = () => page.evaluate(() => window.__exports.saved[window.__exports.saved.length - 1])
  const exportWith = async (dialog, name, expectedFile) => {
    const before = await savedCount()
    await dialog.getByRole('button', { name }).click()
    await page.waitForFunction(count => window.__exports.saved.length === count, before + 1)
    const saved = await lastSaved()
    assert(new RegExp(`^sylloge-${expectedFile}-\\d{4}-\\d{2}-\\d{2}\\.csv$`).test(saved.name), `Nom de fichier ${expectedFile} (${saved.name})`)
    return tableOf(saved.contents)
  }
  const servicesOf = async dialog => dialog.locator('.export-service .export-format-option b').allInnerTexts()

  // ── Données attendues, lues dans la bibliothèque de recette ────────────────────────────────────
  await start()
  const library = await page.evaluate(async () => {
    const { libraryRepository } = await import('/src/data/libraryRepository.ts')
    const loaded = await libraryRepository.loadLibrary('qa-profile')
    const film = film => ({
      title: film.title, year: film.year, status: film.status, rating: film.rating, favorite: film.isFavorite,
      provider: film.providerName, providerId: film.providerId, watchedAt: film.watchedAt, note: film.personalNote,
    })
    const show = series => ({ id: series.id, title: series.title, status: series.status, rating: series.rating, favorite: series.isFavorite, seasonsSeen: series.seasonsSeen })
    const book = entry => ({ title: entry.title, author: entry.author, year: entry.year, status: entry.status, rating: entry.rating, favorite: entry.isFavorite, addedAt: entry.createdAt, note: entry.personalNote, quotes: entry.quotes.length })
    return {
      films: loaded.films.map(film),
      series: loaded.series.map(show),
      anime: loaded.anime.map(show),
      books: loaded.books.map(book),
      mangas: loaded.mangas.map(book),
    }
  })
  assert(library.films.length > 0 && library.series.length > 0 && library.anime.length > 0 && library.books.length > 0, `Jeu d’essai rempli (${library.films.length} films, ${library.series.length} séries, ${library.anime.length} animés, ${library.books.length} livres)`)
  const linkedFilms = library.films.filter(film => film.provider === 'tmdb' && /^\d+$/.test(film.providerId ?? ''))
  assert(linkedFilms.length > 0, 'Jeu d’essai : au moins un film associé à TMDB')

  // ── 1. Films : deux groupes, quatre services, liens officiels ──────────────────────────────────
  let dialog = await openExport('Films')
  assert(await dialog.getByRole('heading', { name: 'Sauvegarde complète' }).count() === 1, 'Films › groupe « Sauvegarde complète »')
  assert(await dialog.getByRole('heading', { name: 'Exporter vers un service' }).count() === 1, 'Films › groupe « Exporter vers un service »')
  assert(await dialog.getByRole('button', { name: /^JSON Sylloge/ }).count() === 1, 'Films › sauvegarde JSON toujours proposée')
  assert(await dialog.getByRole('button', { name: /^CSV/ }).count() === 1, 'Films › sauvegarde CSV toujours proposée')
  const filmServices = await servicesOf(dialog)
  assert(JSON.stringify(filmServices) === JSON.stringify(['Letterboxd · films vus', 'Letterboxd · liste à voir', 'SensCritique · films', 'Simkl · films']),
    `Films › quatre services, du plus utile au moins utile (${filmServices.join(' | ')})`)
  assert(await dialog.getByRole('button', { name: /StoryGraph|Hardcover|Simkl · séries/ }).count() === 0, 'Films › aucun service d’un autre médium')
  assert(await dialog.getByRole('link', { name: /Importer sur Letterboxd/ }).first().getAttribute('href') === 'https://letterboxd.com/import/', 'Films › lien d’import Letterboxd')
  assert(await dialog.getByRole('link', { name: /Importer sur SensCritique/ }).getAttribute('href') === 'https://www.senscritique.com/parametres/compte', 'Films › lien d’import SensCritique')
  assert(await dialog.getByRole('link', { name: /Importer sur Simkl/ }).getAttribute('href') === 'https://simkl.com/apps/import/csv', 'Films › lien d’import Simkl')
  assert(await dialog.getByRole('link', { name: /Importer sur Letterboxd/ }).first().getAttribute('target') === '_blank', 'Les liens sortants s’ouvrent hors de la fenêtre')
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 2. Films : Letterboxd, SensCritique, Simkl ─────────────────────────────────────────────────
  dialog = await openExport('Films')
  const letterboxd = await exportWith(dialog, /^Letterboxd · films vus/, 'letterboxd-vus')
  assert(letterboxd[0].join(',') === 'tmdbID,Title,Year,Directors,Rating,WatchedDate,Review', 'Films › en-tête Letterboxd inchangé')

  const sensCritique = await exportWith(dialog, /^SensCritique · films/, 'senscritique-films')
  assert(sensCritique[0].join(',') === 'universe,title,release_date,rating,is_wishlisted,is_recommended,is_done', 'SensCritique films › les sept colonnes officielles')
  assert(sensCritique.length - 1 === library.films.length, `SensCritique films › une ligne par film (${sensCritique.length - 1} = ${library.films.length})`)
  {
    const byTitle = new Map(library.films.map(film => [film.title, film]))
    const wanted = status => ({ 'terminé': 'true', 'à découvrir': 'false', 'en attente': 'false', 'abandonné': 'false' })[status]
    const wished = status => (status === 'à découvrir' ? 'true' : 'false')
    for (const row of sensCritique.slice(1)) {
      const film = byTitle.get(row[1])
      must(film, `SensCritique films › ligne inconnue (${row[1]})`)
      must(row[0] === 'movie', `SensCritique films › univers movie (${row[1]})`)
      must(row[2] === (film.year === null ? '' : String(film.year)), `SensCritique films › année (${row[1]})`)
      const expectedRating = film.rating === null ? '' : String(Math.round(film.rating * 2))
      must(row[3] === expectedRating, `SensCritique films › note entière /10 (${row[1]} : ${row[3]} attendu ${expectedRating})`)
      must(row[4] === wished(film.status), `SensCritique films › envie de voir (${row[1]})`)
      must(row[5] === (film.favorite ? 'true' : 'false'), `SensCritique films › coup de cœur (${row[1]})`)
      must(row[6] === wanted(film.status), `SensCritique films › vu (${row[1]})`)
    }
    checks.push('SensCritique films › chaque ligne confrontée à sa fiche (univers, année, note ×2, trois drapeaux)')
  }
  {
    const sample = sensCritique.slice(1).find(row => row[3] === '9') ?? sensCritique[1]
    const report = await dialog.getByRole('status').last().innerText()
    assert(report.includes('SensCritique') && report.includes('sylloge-senscritique-films'), 'SensCritique films › bilan avec le fichier écrit')
    assert(new RegExp(`Export SensCritique enregistré dans « sylloge-senscritique-films-\\d{4}-\\d{2}-\\d{2}\\.csv » · ${library.films.length} films`).test(report), `SensCritique films › bilan : nombre de films (${report.slice(0, 160)})`)
    assert(/Envies de voir : \d+/.test(report) && /Vus : \d+/.test(report), 'SensCritique films › bilan : envies de voir et vus')
    assert(/États que SensCritique ne sait pas exprimer[^:]*: \d+/.test(report), 'SensCritique films › bilan : états non exprimables comptés')
    checks.push(`SensCritique films › ligne vérifiée champ par champ (${sample.join(' | ')})`)
  }

  const simklFilms = await exportWith(dialog, /^Simkl · films/, 'simkl-films')
  assert(simklFilms[0].join(',') === 'simkl_id,TVDB_ID,TMDB,IMDB_ID,MAL_ID,Type,Title,Year,LastEpWatched,Watchlist,WatchedDate,Rating,Memo', 'Simkl films › en-tête d’import officiel')
  {
    const byTitle = new Map(library.films.map(film => [film.title, film]))
    const watchlist = { 'terminé': 'completed', 'à découvrir': 'plan to watch', 'en attente': 'on hold', 'abandonné': 'dropped' }
    for (const row of simklFilms.slice(1)) {
      const film = byTitle.get(row[6])
      must(film, `Simkl films › ligne inconnue (${row[6]})`)
      must(row[5] === 'movie', `Simkl films › Type movie (${film.title})`)
      const tmdb = film.provider === 'tmdb' && /^\d+$/.test(film.providerId ?? '') ? film.providerId : ''
      must(row[2] === tmdb, `Simkl films › TMDB de la fiche (${film.title} : ${row[2]} attendu ${tmdb})`)
      must(row[7] === String(film.year), `Simkl films › année (${film.title})`)
      must(row[8] === '', `Simkl films › LastEpWatched jamais écrit (${film.title})`)
      must(row[9] === watchlist[film.status], `Simkl films › statut (${film.title})`)
      const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(film.watchedAt ?? '')
      must(row[10] === (day ? `${day[3]}-${day[2]}-${day[1]}` : ''), `Simkl films › date JJ-MM-AAAA (${film.title} : ${row[10]})`)
      must(row[11] === (film.rating === null ? '' : String(Math.round(film.rating * 2))), `Simkl films › note /10 (${film.title})`)
      must(row[12] === (film.note ?? ''), `Simkl films › avis en Memo (${film.title})`)
    }
    checks.push('Simkl films › chaque ligne confrontée à sa fiche (Type, TMDB, année, statut, date, note, avis)')
    const withId = simklFilms.slice(1).filter(row => /^\d+$/.test(row[2])).length
    assert(withId === linkedFilms.length, `Simkl films › identifiant TMDB présent pour les fiches liées (${withId} = ${linkedFilms.length})`)
  }
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 3. Séries : SensCritique puis Simkl, sans année ni épisode ────────────────────────────────
  dialog = await openExport('Séries')
  const seriesServices = await servicesOf(dialog)
  assert(JSON.stringify(seriesServices) === JSON.stringify(['SensCritique · séries', 'Simkl · séries']), `Séries › deux services (${seriesServices.join(' | ')})`)
  assert(await dialog.getByRole('button', { name: /Letterboxd/ }).count() === 0, 'Séries › pas de Letterboxd')

  const sensCritiqueSeries = await exportWith(dialog, /^SensCritique · séries/, 'senscritique-series')
  assert(sensCritiqueSeries[0].join(',') === 'universe,title,release_date,rating,is_wishlisted,is_recommended,is_done', 'SensCritique séries › les sept colonnes officielles')
  assert(sensCritiqueSeries.length - 1 === library.series.length, `SensCritique séries › une ligne par série (${sensCritiqueSeries.length - 1})`)
  {
    const byTitle = new Map(library.series.map(series => [series.title, series]))
    for (const row of sensCritiqueSeries.slice(1)) {
      const series = byTitle.get(row[1])
      must(series, `SensCritique séries › ligne inconnue (${row[1]})`)
      must(row[0] === 'tvshow', `SensCritique séries › univers tvshow (${row[1]})`)
      must(row[2] === '', `SensCritique séries › aucune année inventée (${row[1]})`)
      must(row[4] === (series.status === 'à voir' ? 'true' : 'false'), `SensCritique séries › envie de voir (${row[1]})`)
      must(row[6] === (series.status === 'vue' ? 'true' : 'false'), `SensCritique séries › vu (${row[1]})`)
      must(row[3] === (series.rating === null ? '' : String(Math.round(series.rating * 2))), `SensCritique séries › note /10 (${row[1]})`)
    }
    checks.push('SensCritique séries › chaque ligne confrontée à sa fiche, année vide partout')
  }
  {
    const report = await dialog.getByRole('status').last().innerText()
    assert(new RegExp(`Sans année : ${library.series.length} séries`).test(report), `SensCritique séries › bilan : séries sans année (${report.slice(0, 200)})`)
  }

  const simklSeriesBefore = await exportWith(dialog, /^Simkl · séries/, 'simkl-series')
  assert(simklSeriesBefore[0].join(',') === 'simkl_id,TVDB_ID,TMDB,IMDB_ID,MAL_ID,Type,Title,Year,LastEpWatched,Watchlist,WatchedDate,Rating,Memo', 'Simkl séries › en-tête d’import officiel')
  {
    const byTitle = new Map(library.series.map(series => [series.title, series]))
    for (const row of simklSeriesBefore.slice(1)) {
      const series = byTitle.get(row[6])
      must(series, `Simkl séries › ligne inconnue (${row[6]})`)
      must(row[5] === 'tv', `Simkl séries › Type tv (${series.title})`)
      must(row[7] === '', `Simkl séries › année vide (${series.title})`)
      must(row[8] === '', `Simkl séries › LastEpWatched vide (${series.title})`)
      must(row[2] === '', `Simkl séries › aucun TMDB avant le lien fournisseur (${series.title})`)
    }
    checks.push('Simkl séries › chaque ligne confrontée à sa fiche, progression jamais écrite')
    const progress = library.series.filter(series => series.seasonsSeen !== null).length
    const report = await dialog.getByRole('status').last().innerText()
    assert(new RegExp(`Progression non transmise \\(saisons, jamais un numéro d’épisode\\) : ${progress}`).test(report), `Simkl séries › bilan : progression non transmise (${progress})`)
  }

  // ── 4. Preuve de mutation : un lien fournisseur ajouté remplit la colonne TMDB ────────────────
  {
    const before = await page.evaluate(() => window.__exports.saved.length)
    await page.evaluate(async () => {
      const { mediaRepository } = await import('/src/data/mediaRepository.ts')
      const { libraryRepository } = await import('/src/data/libraryRepository.ts')
      const loaded = await libraryRepository.loadLibrary('qa-profile')
      const severance = loaded.series.find(series => series.title === 'Severance')
      await mediaRepository.setMediaProviderLink({ profileId: 'qa-profile', medium: 'series', mediaId: severance.id, providerName: 'TMDB', providerId: '95396' })
    })
    await dialog.getByRole('button', { name: /^Simkl · séries/ }).click()
    await page.waitForFunction(count => window.__exports.saved.length === count, before + 1)
    const after = tableOf((await lastSaved()).contents)
    const severance = after.slice(1).find(row => row[6] === 'Severance')
    assert(severance && severance[2] === '95396', `Mutation : le lien fournisseur ajouté remplit TMDB (${severance?.[2]})`)
    const others = after.slice(1).filter(row => row[6] !== 'Severance')
    assert(others.every(row => row[2] === ''), 'Mutation : les séries sans lien restent sans identifiant')
    const report = await dialog.getByRole('status').last().innerText()
    assert(/Identifiants TMDB transmis : 1\./.test(report), `Mutation : le bilan compte l’identifiant (${report.slice(0, 160)})`)
    // Retour à l'état initial : la recette suivante repart d'une bibliothèque sans lien.
    await page.evaluate(async () => {
      const { mediaRepository } = await import('/src/data/mediaRepository.ts')
      const { libraryRepository } = await import('/src/data/libraryRepository.ts')
      const loaded = await libraryRepository.loadLibrary('qa-profile')
      const severance = loaded.series.find(series => series.title === 'Severance')
      const db = window.__syllogeRecette
      await db.execute(`DELETE FROM media_provider_links WHERE medium = 'series' AND media_id = '${severance.id}'`)
    })
  }
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 5. Animation japonaise : Simkl seul ───────────────────────────────────────────────────────
  dialog = await openExport('Animation japonaise')
  const animeServices = await servicesOf(dialog)
  assert(JSON.stringify(animeServices) === JSON.stringify(['Simkl · animés']), `Animation japonaise › Simkl seul (${animeServices.join(' | ')})`)
  assert(await dialog.getByRole('button', { name: /SensCritique|Letterboxd|StoryGraph/ }).count() === 0, 'Animation japonaise › ni SensCritique, ni Letterboxd, ni StoryGraph')
  const simklAnime = await exportWith(dialog, /^Simkl · animés/, 'simkl-anime')
  assert(simklAnime.length - 1 === library.anime.length, `Simkl animés › une ligne par animé (${simklAnime.length - 1})`)
  assert(simklAnime.slice(1).every(row => row[5] === 'anime'), 'Simkl animés › Type anime pour chaque ligne')
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 6. Livres : The StoryGraph (format Goodreads) puis Hardcover ─────────────────────────────
  dialog = await openExport('Livres')
  const bookServices = await servicesOf(dialog)
  assert(JSON.stringify(bookServices) === JSON.stringify(['Pour The StoryGraph (format Goodreads)', 'Hardcover']), `Livres › deux services, le format Goodreads annoncé (${bookServices.join(' | ')})`)
  assert(await dialog.getByRole('link', { name: /Importer sur The StoryGraph/ }).getAttribute('href') === 'https://app.thestorygraph.com/import-goodreads', 'Livres › lien d’import The StoryGraph')
  assert(await dialog.getByRole('link', { name: /Importer sur Hardcover/ }).getAttribute('href') === 'https://hardcover.app/account/imports', 'Livres › lien d’import Hardcover')

  const storyGraph = await exportWith(dialog, /^Pour The StoryGraph/, 'storygraph-livres')
  const goodreadsHeader = ['Book Id', 'Title', 'Author', 'Author l-f', 'Additional Authors', 'ISBN', 'ISBN13', 'My Rating', 'Average Rating', 'Publisher', 'Binding', 'Number of Pages', 'Year Published', 'Original Publication Year', 'Date Read', 'Date Added', 'Bookshelves', 'Bookshelves with positions', 'Exclusive Shelf', 'My Review', 'Spoiler', 'Private Notes', 'Read Count', 'Recommended For', 'Recommended By', 'Owned Copies', 'Original Purchase Date', 'Original Purchase Location', 'Condition', 'Condition Description', 'BCID']
  assert(storyGraph[0].length === 31 && storyGraph[0].join(',') === goodreadsHeader.join(','), `The StoryGraph › en-tête Goodreads de 31 colonnes (${storyGraph[0].length})`)
  assert(storyGraph.length - 1 === library.books.length, `The StoryGraph › une ligne par livre (${storyGraph.length - 1})`)
  {
    const byTitle = new Map(library.books.map(book => [book.title, book]))
    const shelves = { 'lu': 'read', 'en cours': 'currently-reading', 'à lire': 'to-read', 'abandonné': 'did-not-finish' }
    for (const row of storyGraph.slice(1)) {
      const book = record(storyGraph[0], row)
      const source = byTitle.get(book.Title)
      must(source, `The StoryGraph › livre inconnu (${book.Title})`)
      must(book.Author === (source.author ?? ''), `The StoryGraph › auteur (${book.Title})`)
      must(/^[0-5]$/.test(book['My Rating']), `The StoryGraph › note entière 0–5 (${book.Title} : ${book['My Rating']})`)
      must(book['My Rating'] === (source.rating === null ? '0' : String(Math.round(source.rating))), `The StoryGraph › note arrondie (${book.Title})`)
      must(/^\d{4}\/\d{2}\/\d{2}$/.test(book['Date Added']), `The StoryGraph › Date Added AAAA/MM/JJ (${book.Title} : ${book['Date Added']})`)
      must(book['Exclusive Shelf'] === shelves[source.status], `The StoryGraph › étagère (${book.Title})`)
      must(book['Read Count'] === (source.status === 'lu' ? '1' : '0'), `The StoryGraph › Read Count (${book.Title})`)
      must(book.ISBN === '' && book.ISBN13 === '', `The StoryGraph › ISBN vide, jamais inventé (${book.Title})`)
      must(book['Average Rating'] === '', `The StoryGraph › Average Rating vide, jamais la note personnelle (${book.Title})`)
    }
    checks.push('The StoryGraph › colonnes obligatoires garanties sur chaque ligne (titre, auteur, note, date, étagère, Read Count)')
  }
  {
    const report = await dialog.getByRole('status').last().innerText()
    assert(report.includes('Format Goodreads : The StoryGraph l’accepte, Goodreads le refuse'), `The StoryGraph › bilan : Goodreads refusé faute d’ISBN (${report.slice(0, 200)})`)
  }

  const hardcover = await exportWith(dialog, /^Hardcover/, 'hardcover-livres')
  const hardcoverHeader = ['Title', 'Author', 'Status', 'Privacy', 'Hardcover Book ID', 'Hardcover Edition ID', 'ISBN 10', 'ISBN 13', 'ASIN', 'Media', 'Country Code', 'Language Code', 'Binding', 'Pages', 'Duration in Seconds', 'Publish Date', 'Publisher', 'Genres', 'Moods', 'Tags', 'Content Warnings', 'Lists', 'Date Added', 'Date Started', 'Date Finished', 'Rating', 'Review', 'Review Contains Spoilers']
  assert(hardcover[0].join(',') === hardcoverHeader.join(','), 'Hardcover › en-tête du schéma custom documenté')
  {
    const byTitle = new Map(library.books.map(book => [book.title, book]))
    const statuses = { 'lu': 'Read', 'en cours': 'Currently Reading', 'à lire': 'Want to Read', 'abandonné': 'Did Not Finish Read' }
    for (const row of hardcover.slice(1)) {
      const entry = record(hardcover[0], row)
      const source = byTitle.get(entry.Title)
      must(source, `Hardcover › livre inconnu (${entry.Title})`)
      must(entry.Status === statuses[source.status], `Hardcover › statut (${entry.Title})`)
      must(entry.Rating === (source.rating === null ? '' : String(source.rating)), `Hardcover › note sans arrondi (${entry.Title} : ${entry.Rating})`)
      must(entry['ISBN 13'] === '' && entry.Media === 'Book', `Hardcover › ISBN vide, Media Book (${entry.Title})`)
      must(entry['Date Finished'] === '', `Hardcover › date de fin jamais inventée (${entry.Title})`)
      must(/^\d{4}-\d{2}-\d{2}$/.test(entry['Date Added']), `Hardcover › date ISO (${entry.Title})`)
    }
    checks.push('Hardcover › chaque ligne confrontée à sa fiche (statut, note, ISBN, dates, avis)')
  }
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 7. Mangas : The StoryGraph seul ──────────────────────────────────────────────────────────
  await page.evaluate(() => localStorage.removeItem('sylloge-theme'))
  await openLibrary('Mangas')
  await page.getByRole('button', { name: 'Exporter', exact: true }).first().click()
  dialog = page.getByRole('dialog', { name: /Exporter/ })
  const mangaServices = await servicesOf(dialog)
  assert(JSON.stringify(mangaServices) === JSON.stringify(['Pour The StoryGraph (format Goodreads)']), `Mangas › The StoryGraph seul (${mangaServices.join(' | ')})`)
  const storyGraphMangas = await exportWith(dialog, /^Pour The StoryGraph/, 'storygraph-mangas')
  assert(storyGraphMangas.length - 1 === library.mangas.length, `The StoryGraph mangas › une ligne par manga (${storyGraphMangas.length - 1})`)
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()

  // ── 8. Jeux et Art : sauvegarde complète seulement ───────────────────────────────────────────
  for (const libraryName of ['Jeux', 'Art']) {
    dialog = await openExport(libraryName)
    assert(await dialog.getByRole('heading', { name: 'Exporter vers un service' }).count() === 0, `${libraryName} › aucun groupe « Exporter vers un service »`)
    assert(await dialog.getByRole('link').count() === 0, `${libraryName} › aucun lien de service`)
    assert(await dialog.getByRole('button', { name: /^JSON Sylloge/ }).count() === 1, `${libraryName} › sauvegarde JSON disponible`)
    assert(await dialog.getByRole('button', { name: /^CSV/ }).count() === 1, `${libraryName} › sauvegarde CSV disponible`)
    await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()
  }

  // ── 9. Anglais ───────────────────────────────────────────────────────────────────────────────
  await start('en', 'light')
  await openLibrary('Films')
  await page.getByRole('button', { name: 'Export', exact: true }).first().click()
  let english = page.getByRole('dialog', { name: /Export/ })
  assert(await english.getByRole('heading', { name: 'Full backup' }).count() === 1, 'Anglais › groupe « Full backup »')
  assert(await english.getByRole('heading', { name: 'Export to a service' }).count() === 1, 'Anglais › groupe « Export to a service »')
  const englishServices = await servicesOf(english)
  assert(JSON.stringify(englishServices) === JSON.stringify(['Letterboxd · watched films', 'Letterboxd · watchlist', 'SensCritique · films', 'Simkl · films']), `Anglais › libellés traduits (${englishServices.join(' | ')})`)
  assert(await english.getByRole('link', { name: /Import on Letterboxd/ }).count() === 2, 'Anglais › liens d’import traduits')
  await english.getByRole('button', { name: 'Close', exact: true }).click()
  await openLibrary('Books')
  await page.getByRole('button', { name: 'Export', exact: true }).first().click()
  english = page.getByRole('dialog', { name: /Export/ })
  const englishBooks = await servicesOf(english)
  assert(JSON.stringify(englishBooks) === JSON.stringify(['For The StoryGraph (Goodreads format)', 'Hardcover']), `Anglais › livres (${englishBooks.join(' | ')})`)
  assert(await english.getByRole('link', { name: /Import on The StoryGraph/ }).count() === 1, 'Anglais › lien The StoryGraph')
  await english.getByRole('button', { name: 'Close', exact: true }).click()

  // ── 10. Captures 1440×900, clair et sombre ───────────────────────────────────────────────────
  for (const [libraryName, language, slug] of [['Films', 'fr', 'films'], ['Livres', 'fr', 'livres']]) {
    for (const theme of ['light', 'dark']) {
      await start(language, theme)
      await openLibrary(libraryName)
      await page.getByRole('button', { name: 'Exporter', exact: true }).first().click()
      const shot = page.getByRole('dialog', { name: /Exporter/ })
      await shot.getByRole('heading', { name: 'Exporter vers un service' }).waitFor()
      await page.screenshot({ path: `${OUT}/export-${slug}-${theme}.png` })
      checks.push(`Capture ${slug} ${theme}`)
      await shot.getByRole('button', { name: 'Fermer', exact: true }).click()
      await page.evaluate(() => localStorage.removeItem('sylloge-theme'))
    }
  }

  await page.evaluate(() => ['sylloge-theme', 'sylloge-language', 'sylloge-sidebar-pinned'].forEach(key => localStorage.removeItem(key)))
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
