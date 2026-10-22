// Bibliothèques personnalisées (qa-app.html, données synthétiques).
// Ouvrir la session playwright-cli depuis le dossier scratch : aucune capture n'est écrite ici.
async page => {
  page.setDefaultTimeout(8000)
  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  const nav = () => page.getByRole('navigation', { name: 'Navigation principale' })
  const sql = (query, values = []) => page.evaluate(([q, v]) => window.__syllogeRecette.select(q, v), [query, values])

  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
  await page.getByRole('heading', { level: 1 }).first().waitFor()

  // 1. Barre latérale : base, puis bibliothèques ajoutées, puis « + ».
  const labels = (await nav().locator('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))))
  const expected = ['Accueil', 'Films', 'Séries', 'Animation japonaise', 'Livres', 'Mangas', 'Jeux', 'Art', 'Comics', 'Musique', 'Spectacles', 'Jeux de société', 'Ajouter une bibliothèque']
  assert(JSON.stringify(labels) === JSON.stringify(expected), `Barre latérale : ${labels.join(', ')}`)
  const comicsInBooks = await sql("SELECT COUNT(*) AS n FROM books WHERE category = 'comics'")
  assert(Number(comicsInBooks[0].n) === 0, 'Livres ne contient aucun comics')

  // 2. Catalogue : huit modèles, quatre déjà ajoutés et désactivés.
  await nav().getByRole('button', { name: 'Ajouter une bibliothèque', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajouter une bibliothèque' })
  await dialog.waitFor()
  assert(await dialog.locator('.library-option').count() === 8, 'Catalogue : huit modèles')
  assert(await dialog.locator('.library-option:disabled').count() === 4, 'Catalogue : quatre bibliothèques déjà ajoutées')
  const groups = await dialog.locator('.library-catalog-group > h3').allInnerTexts()
  assert(groups.map(text => text.trim().toLowerCase()).join(',') === 'lecture,écoute,écran,scène,jeu', `Familles : ${groups.join(', ')}`)
  await dialog.getByRole('button', { name: 'Ajouter Podcasts', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Podcasts' }).waitFor()
  assert(await nav().getByRole('button', { name: 'Podcasts', exact: true }).getAttribute('aria-current') === 'page', 'Podcasts ajouté et ouvert')
  assert(await page.getByText('Votre bibliothèque Podcasts est vide.').isVisible(), 'Podcasts : état vide')

  // 3. Création d'une fiche : statut, progression, champ choix, créateur.
  await page.getByRole('button', { name: 'Ajouter un podcast', exact: true }).first().click()
  const form = page.getByRole('dialog', { name: 'Ajouter un podcast' })
  await form.getByLabel('Titre', { exact: true }).fill('Les Pieds sur terre')
  await form.getByRole('radio', { name: 'En cours', exact: true }).click()
  await form.getByLabel('Épisodes écoutés', { exact: true }).fill('12')
  await form.getByLabel('Total', { exact: true }).fill('40')
  await form.getByLabel('Animation', { exact: true }).fill('Sonia Kronlund')
  await form.locator('#custom-podcasts-detail-format').click()
  await page.getByRole('option', { name: 'Récit', exact: true }).click()
  await form.getByLabel('Plateforme', { exact: true }).fill('France Culture')
  await form.getByRole('button', { name: 'Ajouter un podcast', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Les Pieds sur terre' }).waitFor()
  const facts = await page.locator('.detail-facts').innerText()
  assert(/Sonia Kronlund/.test(facts) && /France Culture/.test(facts) && /12 \/ 40/.test(facts), 'Fiche : créateur, plateforme et progression affichés')
  const [stored] = await sql("SELECT status, progress_current, progress_total, creator, details FROM podcasts WHERE title = 'Les Pieds sur terre'")
  assert(stored.status === 'en cours' && stored.progress_current === 12 && stored.progress_total === 40 && JSON.parse(stored.details).format === 'Récit', 'Fiche : stockée dans la table podcasts')
  await page.getByRole('button', { name: 'Retour à Podcasts', exact: true }).click()
  assert(await page.locator('.custom-card').count() === 1, 'Podcasts : une carte')
  assert(/1 podcast/.test(await page.locator('.library-subtitle').innerText()), 'Podcasts : sous-titre')

  // 4. Comics : filtres de statut et de format, citations conservées.
  await nav().getByRole('button', { name: 'Comics', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Comics' }).waitFor()
  assert(await page.locator('.custom-card').count() === 4, 'Comics : quatre cartes')
  await page.getByRole('radio', { name: 'Lu', exact: true }).click()
  assert(await page.locator('.custom-card').count() === 2, 'Comics : filtre « Lu »')
  await page.locator('#custom-comics-kind').click()
  await page.getByRole('option', { name: 'Roman graphique', exact: true }).click()
  const titles = await page.locator('.custom-card .film-card-top > b').allInnerTexts()
  assert(titles.join() === 'Maus', `Comics : filtre « Roman graphique » (${titles.join()})`)
  await page.getByRole('radio', { name: 'Tous', exact: true }).click()
  await page.locator('#custom-comics-kind').click()
  await page.getByRole('option', { name: 'Format : tous', exact: true }).click()
  await page.getByRole('searchbox').fill('gibbons')
  assert(await page.locator('.custom-card').count() === 1, 'Comics : recherche dans les champs propres (dessin)')
  await page.getByRole('searchbox').fill('')
  await page.getByText('Watchmen', { exact: true }).click()
  await page.getByText('1 citation personnelle').click()
  assert(await page.getByText('Qui garde les gardiens ?').isVisible(), 'Comics : citation visible')

  // 5. Modification : la citation garde son identifiant.
  await page.getByRole('button', { name: 'Modifier', exact: true }).first().click()
  const edit = page.getByRole('dialog', { name: 'Modifier la fiche' })
  await edit.getByLabel('Série', { exact: true }).fill('Watchmen')
  await edit.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Watchmen' }).waitFor()
  const quotes = await sql("SELECT id, body FROM comic_quotes WHERE comic_id = 'comics-watchmen'")
  assert(quotes.length === 1 && quotes[0].id === 'comics-watchmen-quote-0', 'Comics : citation conservée avec son identifiant')
  const [watchmen] = await sql("SELECT details FROM comics WHERE id = 'comics-watchmen'")
  assert(JSON.parse(watchmen.details).series === 'Watchmen' && JSON.parse(watchmen.details).artist === 'Dave Gibbons', 'Comics : champs propres conservés et mis à jour')

  // 6. Sauvegarde JSON v4 : relue par le validateur, puis restaurée dans un profil neuf.
  const roundtrip = await page.evaluate(async () => {
    const { libraryRepository } = await import('/src/data/libraryRepository.ts')
    const { createLibraryDocument, serializeLibraryDocument, validateLibraryDocument } = await import('/src/domain/libraryDocument.ts')
    const library = await libraryRepository.loadLibrary('qa-profile')
    const preview = validateLibraryDocument(serializeLibraryDocument(createLibraryDocument(library, '2026-10-22T08:00:00.000Z')))
    if (!preview.document) return { errors: preview.errors }
    const restored = await libraryRepository.importLibraryDocument(preview.document)
    const summarize = (lib) => lib.customLibraries.map((custom) => ({
      id: custom.libraryId,
      entries: custom.entries.map((entry) => [entry.title, entry.status, entry.creator, entry.progressCurrent, entry.progressTotal, entry.rating, entry.isFavorite, entry.finishedAt, entry.coverUrl, JSON.stringify(entry.details), entry.quotes.map((quote) => quote.body).join('|')].join('¦')).sort(),
    }))
    return {
      version: preview.document.version,
      count: preview.counts.custom,
      before: summarize(library),
      after: summarize(restored),
      newProfile: restored.profile.id !== 'qa-profile',
    }
  })
  assert(!roundtrip.errors, `Sauvegarde : document valide ${JSON.stringify(roundtrip.errors ?? '')}`)
  assert(roundtrip.version === 4 && roundtrip.count === 13, `Sauvegarde : v4 et 13 fiches personnalisées (${roundtrip.count})`)
  assert(roundtrip.newProfile && JSON.stringify(roundtrip.before) === JSON.stringify(roundtrip.after), 'Restauration : bibliothèques, ordre et fiches identiques')

  // 7. Suppression d'une bibliothèque : tout disparaît, retour à l'accueil.
  await nav().getByRole('button', { name: 'Podcasts', exact: true }).click()
  await page.getByRole('button', { name: 'Supprimer la bibliothèque Podcasts', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Supprimer la bibliothèque Podcasts ?' })
  assert(/sa fiche/.test(await confirm.innerText()), 'Suppression : nombre de fiches annoncé')
  await confirm.getByRole('button', { name: 'Supprimer la bibliothèque et sa fiche', exact: true }).click()
  await nav().getByRole('button', { name: 'Podcasts', exact: true }).waitFor({ state: 'detached' })
  const left = await sql("SELECT (SELECT COUNT(*) FROM podcasts WHERE profile_id = 'qa-profile') AS rows, (SELECT COUNT(*) FROM profile_libraries WHERE profile_id = 'qa-profile' AND library_id = 'podcasts') AS enabled")
  assert(Number(left[0].rows) === 0 && Number(left[0].enabled) === 0, 'Suppression : fiches et activation retirées')

  assert(errors.length === 0, `Aucune erreur de page (${errors.join(' | ')})`)
  return JSON.stringify({ ok: true, checks })
}
