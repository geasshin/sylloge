// Recette des imports de services (IMDb, StoryGraph, Simkl, Hardcover, MyAnimeList).
// Vraie UI, fixtures synthétiques, base SQLite mémoire du harnais ; seul le
// sélecteur natif est simulé, les commandes import_* écrivent réellement en base.
// playwright-cli -s=imports run-code --filename=scripts/qa-imports-services.js
async page => {
  page.setDefaultTimeout(9000)
  const checks = []
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  const db = (query, values = []) => page.evaluate(([q, v]) => window.__syllogeRecette.select(q, v), [query, values])

  async function setup(library, fixture, options = {}) {
    const url = options.lang === 'en' ? 'http://127.0.0.1:5173/qa-app.html?scenario=full&lang=en' : 'http://127.0.0.1:5173/qa-app.html?scenario=full'
    await page.goto(url)
    await page.getByRole('button', { name: library, exact: true }).click()
    await page.evaluate(async ({ fixture, options }) => {
      const contents = await (await fetch(`/fixtures/imports/${fixture}`)).text()
      const name = options.name ?? fixture
      const candidate = { id: 'csv-0', name, kind: 'csv', contents }
      const picked = { name, kind: 'csv', contents: null, csvCandidates: [candidate], markdownPages: [], containerCandidates: [] }
      const invoke = window.__TAURI_INTERNALS__.invoke
      window.__serviceTest = { writes: [] }
      window.__TAURI_INTERNALS__.invoke = async (cmd, args, ...rest) => {
        if (cmd === 'pick_import_any') return picked
        if (cmd.startsWith('import_')) window.__serviceTest.writes.push(cmd)
        return invoke(cmd, args, ...rest)
      }
    }, { fixture, options })
    await page.getByRole('button', { name: options.lang === 'en' ? 'Import' : 'Importer', exact: true }).click()
    await page.getByRole('button', { name: options.lang === 'en' ? 'Choose a file' : 'Choisir un fichier', exact: true }).click()
  }

  async function dialogText() {
    return page.getByRole('dialog').innerText()
  }

  async function confirmAndRead(command, table, predicate) {
    await page.getByRole('button', { name: /^Fusionner/ }).click()
    const resolve = page.getByRole('button', { name: 'Valider ces choix', exact: true })
    if (await resolve.count()) await resolve.first().click()
    assert((await page.evaluate(() => window.__serviceTest.writes.length)) === 0, 'Aucune écriture avant la confirmation finale')
    await page.getByRole('button', { name: 'Importer les fiches', exact: true }).click()
    await page.getByRole('heading', { name: 'Import terminé', exact: true }).waitFor()
    const writes = await page.evaluate(() => window.__serviceTest.writes)
    assert(writes.length === 1 && writes[0] === command, `Une seule écriture vers ${command}`)
    return db(`SELECT * FROM ${table} WHERE ${predicate} ORDER BY title`)
  }

  // 1. IMDb dans Films : reconnaissance, avertissements, conversion, valeurs en base.
  await setup('Films', 'imdb-ratings.csv')
  assert(await page.getByRole('heading', { name: 'IMDb reconnu', exact: true }).isVisible(), 'IMDb : reconnaissance affichée')
  let text = await dialogText()
  assert(/bibliothèques prévues/iu.test(text) && text.includes('Séries'), 'IMDb : Films et Séries annoncés')
  assert(/correspondance des colonnes/iu.test(text), 'IMDb : correspondance des colonnes visible')
  assert(text.includes('1 série ignorée'), 'IMDb : série ignorée comptée')
  assert(text.includes('1 épisode ignoré'), 'IMDb : épisode ignoré compté')
  assert(text.includes('date de notation IMDb'), 'IMDb : date de notation expliquée')
  await page.getByRole('button', { name: 'Continuer', exact: true }).click()
  let films = await confirmAndRead('import_films_into_profile', 'films', "title LIKE 'Film fictif IMDb%' OR title = 'Téléfilm fictif IMDb'")
  assert(films.length === 2, 'IMDb Films : deux films écrits')
  const dawn = films.find((row) => row.title === 'Film fictif IMDb, l’aube')
  assert(dawn && dawn.rating === 4 && dawn.status === 'terminé' && dawn.watched_at === null, 'IMDb Films : note 8 → 4, terminé, date de notation non importée')
  assert(films.find((row) => row.title === 'Téléfilm fictif IMDb').rating === 3, 'IMDb Films : note 6 → 3')

  // 2. Le même fichier IMDb dans Séries : seules les séries, et valeurs en base.
  await setup('Séries', 'imdb-ratings.csv')
  assert(await page.getByRole('heading', { name: 'IMDb reconnu', exact: true }).isVisible(), 'IMDb Séries : reconnaissance affichée')
  assert((await dialogText()).includes('2 films ignorés'), 'IMDb Séries : films ignorés comptés')
  await page.getByRole('button', { name: 'Continuer', exact: true }).click()
  const seriesRows = await confirmAndRead('import_series_into_profile', 'series', "title = 'Série fictive IMDb'")
  assert(seriesRows.length === 1 && seriesRows[0].rating === 3.5 && seriesRows[0].status === 'vue' && seriesRows[0].category === 'série télé', 'IMDb Séries : note 7 → 3,5, vue, catégorie série télé')

  // 3. StoryGraph dans Livres, avec did-not-finish.
  await setup('Livres', 'storygraph-export.csv')
  assert(await page.getByRole('heading', { name: 'The StoryGraph reconnu', exact: true }).isVisible(), 'StoryGraph : reconnaissance affichée')
  let storyText = await dialogText()
  assert(storyText.includes('Livre fictif abandonné') && storyText.includes('abandonné'), 'StoryGraph : did-not-finish traduit en abandonné')
  await page.getByRole('button', { name: 'Continuer', exact: true }).click()
  const books = await confirmAndRead('import_books_into_profile', 'books', "title LIKE 'Livre fictif%' AND title NOT LIKE '%Simkl%'")
  assert(books.length === 4, 'StoryGraph : quatre livres écrits')
  assert(books.find((row) => row.title === 'Livre fictif abandonné').status === 'abandonné', 'StoryGraph : abandonné en base')
  assert(books.find((row) => row.title === 'Livre fictif StoryGraph, le départ').rating === 4, 'StoryGraph : note 4 en base')

  // 4. Simkl : un fichier mixte, une bibliothèque à la fois.
  await setup('Films', 'simkl-export.csv')
  assert(await page.getByRole('heading', { name: 'Simkl reconnu', exact: true }).isVisible(), 'Simkl Films : reconnaissance affichée')
  assert((await dialogText()).includes('2 séries ignorées'), 'Simkl Films : séries ignorées comptées')
  await page.getByRole('button', { name: 'Continuer', exact: true }).click()
  const simklFilms = await confirmAndRead('import_films_into_profile', 'films', "title LIKE '%Simkl%'")
  assert(simklFilms.length === 2, 'Simkl Films : deux films écrits')
  assert(simklFilms.find((row) => row.title === 'Film fictif Simkl').watched_at === '2024-03-06', 'Simkl Films : JJ-MM-AAAA converti en date ISO')
  assert(simklFilms.find((row) => row.title === 'Film fictif Simkl').rating === 4, 'Simkl Films : note 8 → 4')

  await setup('Séries', 'simkl-export.csv')
  assert((await dialogText()).includes('1 animation japonaise ignorée'), 'Simkl Séries : animation ignorée comptée')
  await page.getByRole('button', { name: 'Continuer', exact: true }).click()
  const simklSeries = await confirmAndRead('import_series_into_profile', 'series', "title LIKE '%Simkl%'")
  assert(simklSeries.length === 2, 'Simkl Séries : deux séries écrites')
  assert(simklSeries.find((row) => row.title === 'Série fictive Simkl').status === 'en cours', 'Simkl Séries : watching → en cours')
  assert(simklSeries.find((row) => row.title === 'Série fictive Simkl').rating === 3.5, 'Simkl Séries : note 7 → 3,5')

  await setup('Animation japonaise', 'simkl-export.csv')
  assert((await dialogText()).includes('« on hold » devient « en cours »'), 'Simkl Anime : mapping on hold expliqué')
  await page.getByRole('button', { name: 'Continuer', exact: true }).click()
  const simklAnime = await confirmAndRead('import_anime_into_profile', 'anime', "title = 'Animé fictif Simkl'")
  assert(simklAnime.length === 1 && simklAnime[0].status === 'en cours' && simklAnime[0].rating === 4.5, 'Simkl Anime : on hold → en cours, note 9 → 4,5')

  // 5. Hardcover dans Livres.
  await setup('Livres', 'hardcover-export.csv')
  assert(await page.getByRole('heading', { name: 'Hardcover reconnu', exact: true }).isVisible(), 'Hardcover : reconnaissance affichée')
  await page.getByRole('button', { name: 'Continuer', exact: true }).click()
  const hardcover = await confirmAndRead('import_books_into_profile', 'books', "title LIKE 'Livre fictif Hardcover%'")
  assert(hardcover.length === 4, 'Hardcover : quatre livres écrits')
  const hc = hardcover.find((row) => row.title === 'Livre fictif Hardcover, le départ')
  assert(hc && hc.rating === 4.5 && hc.status === 'lu' && hc.started_at === '2024-01-02' && hc.year === 2019, 'Hardcover : note, statut, début et année en base')

  // 6. MyAnimeList XML dans Animation japonaise puis Mangas.
  await setup('Animation japonaise', 'myanimelist-anime.xml')
  assert(await page.getByRole('heading', { name: 'MyAnimeList reconnu', exact: true }).isVisible(), 'MyAnimeList animé : reconnaissance affichée')
  assert((await dialogText()).includes('my_watched_episodes'), 'MyAnimeList animé : progression épisodes annoncée non reprise')
  await page.getByRole('button', { name: 'Continuer', exact: true }).click()
  const animeRows = await confirmAndRead('import_anime_into_profile', 'anime', "title LIKE 'Animé fictif%'")
  assert(animeRows.length === 5, 'MyAnimeList animé : cinq fiches écrites')
  const firstAnime = animeRows.find((row) => row.title === 'Animé fictif & compagnie')
  assert(firstAnime && firstAnime.rating === 4 && firstAnime.status === 'vue' && firstAnime.started_at === '2024-01-05', 'MyAnimeList animé : note 8 → 4, vue, date de début')
  assert(animeRows.find((row) => row.title === 'Animé fictif en pause').status === 'en cours', 'MyAnimeList animé : On-Hold → en cours')

  await setup('Mangas', 'myanimelist-manga.xml')
  assert(await page.getByRole('heading', { name: 'MyAnimeList reconnu', exact: true }).isVisible(), 'MyAnimeList manga : reconnaissance affichée')
  await page.getByRole('button', { name: 'Continuer', exact: true }).click()
  const mangaRows = await confirmAndRead('import_mangas_into_profile', 'mangas', "title LIKE 'Manga fictif%'")
  assert(mangaRows.length === 2, 'MyAnimeList manga : deux mangas écrits')
  assert(mangaRows.find((row) => row.title === 'Manga fictif en cours').volumes_read === 3, 'MyAnimeList manga : tomes lus en cours écrits')
  assert(mangaRows.find((row) => row.title === 'Manga fictif & compagnie').volumes_read === null, 'MyAnimeList manga : aucun total inventé pour un manga terminé')

  // 7. Fichiers valides déposés dans la mauvaise bibliothèque : blocage et conseil.
  for (const [library, fixture, expected] of [
    ['Livres', 'imdb-ratings.csv', 'Cet export IMDb contient des Films et des Séries'],
    ['Mangas', 'storygraph-export.csv', 'Cet export The StoryGraph contient des Livres. Ouvrez la bibliothèque Livres'],
    ['Films', 'hardcover-export.csv', 'Cet export Hardcover contient des Livres. Ouvrez la bibliothèque Livres'],
    ['Livres', 'simkl-export.csv', 'Cet export Simkl contient des Films, des Séries et de l’Animation japonaise'],
    ['Mangas', 'myanimelist-anime.xml', 'Cet export MyAnimeList contient de l’Animation japonaise'],
  ]) {
    await setup(library, fixture)
    const wrongText = await dialogText()
    assert(wrongText.includes('Import bloqué') && wrongText.includes(expected), `${fixture} dans ${library} : blocage avec le bon conseil`)
    assert(await page.getByRole('button', { name: 'Continuer', exact: true }).isDisabled(), `${fixture} dans ${library} : poursuite impossible`)
    assert((await page.evaluate(() => window.__serviceTest.writes.length)) === 0, `${fixture} dans ${library} : aucune écriture`)
  }

  // 8. Guides proposés par bibliothèque : un service n’apparaît que là où il alimente.
  const guideExpectations = [
    ['Films', ['Letterboxd', 'IMDb', 'Simkl', 'BetaSeries', 'TV Time'], ['The StoryGraph', 'Hardcover', 'MyAnimeList']],
    ['Séries', ['IMDb', 'Simkl', 'BetaSeries', 'TV Time'], ['Letterboxd', 'The StoryGraph', 'Hardcover', 'MyAnimeList']],
    ['Animation japonaise', ['Simkl', 'MyAnimeList'], ['IMDb', 'The StoryGraph', 'Hardcover', 'Grouvee']],
    ['Livres', ['Goodreads', 'The StoryGraph', 'Hardcover'], ['IMDb', 'Simkl', 'MyAnimeList', 'Grouvee']],
    ['Mangas', ['MyAnimeList'], ['Goodreads', 'The StoryGraph', 'Hardcover', 'IMDb']],
    ['Jeux', ['Notion'], ['Grouvee', 'IMDb', 'Goodreads']],
    ['Art', ['Notion'], ['IMDb', 'Goodreads', 'MyAnimeList']],
  ]
  for (const [library, expected, absent] of guideExpectations) {
    await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
    await page.getByRole('button', { name: library, exact: true }).click()
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    const choices = await page.locator('.import-source-option').allInnerTexts()
    for (const service of expected) assert(choices.some((choice) => choice.includes(service)), `${library} : guide ${service} proposé`)
    for (const service of absent) assert(!choices.some((choice) => choice.includes(service)), `${library} : guide ${service} absent`)
    if (library === 'Films' || library === 'Séries') {
      assert(choices.some((choice) => choice.includes('Service arrêté le 15 juillet 2026')), `${library} : TV Time marqué arrêté`)
    }
    await page.keyboard.press('Escape')
  }

  // 9. Interface anglaise sur le même parcours IMDb.
  await setup('Films', 'imdb-ratings.csv', { lang: 'en' })
  assert(await page.getByRole('heading', { name: 'IMDb recognised', exact: true }).isVisible(), 'Anglais : reconnaissance IMDb')
  const english = await dialogText()
  assert(english.includes('1 series ignored') && english.includes('1 episode ignored'), 'Anglais : lignes ignorées traduites')
  assert(/target libraries/iu.test(english), 'Anglais : bibliothèques traduites')
  assert(!/bibliothèques prévues/iu.test(english) && !english.includes('série ignorée'), 'Anglais : aucun libellé français résiduel')

  return { ok: true, count: checks.length, checks }
}
