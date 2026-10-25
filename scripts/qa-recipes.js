// Recettes de cuisine (qa-app.html, données synthétiques, aucune image téléchargée).
// Ouvrir la session playwright-cli depuis le dossier scratch : aucune capture n'est écrite ici.
// Gardes : la bibliothèque s'ajoute depuis le catalogue (neuf modèles, famille « Cuisine »), les
// ingrédients et les étapes s'éditent en listes (Entrée ouvre la ligne suivante, Retour arrière la
// retire), chaque ligne est relue de la base à la fiche, les vues par état et par type de plat
// filtrent la grille, la photo est un lien affiché sans téléchargement, et « En cours » comme
// « Écartée » ne sont pas proposés pour une recette.
async page => {
  page.setDefaultTimeout(8000)
  // Hermétique : les photos de la recette visent picsum.photos, un service externe parfois très lent.
  await page.route('https://picsum.photos/**', route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    headers: { 'cache-control': 'no-store' },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#7a3b2e"/></svg>',
  }))
  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  const nav = () => page.getByRole('navigation', { name: 'Navigation principale' })
  const sql = (query, values = []) => page.evaluate(([q, v]) => window.__syllogeRecette.select(q, v), [query, values])
  const settle = async () => {
    await page.mouse.move(900, 500)
    await page.locator('.sidebar-expanded').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
  }

  const INGREDIENTS = ['200 g de farine', '100 g de beurre', 'Pour la garniture :', '4 pommes', '1 pincée de sel']
  const EDITED = ['200 g de farine', '100 g de beurre', 'Pour la garniture :', '5 pommes', '1 pincée de sel']
  const STEPS = ['Mélanger la farine et le beurre.', 'Étaler la pâte.', 'Garnir et cuire 35 min à 180 °C.']
  const PHOTO = 'https://picsum.photos/seed/qa-recette-tarte/600/600'

  /** Saisie au clavier d'un champ `list` : une ligne, Entrée, la suivante. */
  const typeList = async (firstInput, lines) => {
    await firstInput.click()
    for (let index = 0; index < lines.length; index += 1) {
      if (index > 0) await page.keyboard.press('Enter')
      await page.keyboard.type(lines[index])
    }
  }
  const listValue = async (scope, label) => (await scope.getByLabel(label, { exact: true }).evaluateAll(nodes => nodes.map(node => node.value))).join('\n')
  const shownList = async field => (await page.locator(`.detail-long-text[data-field="${field}"] li`).allInnerTexts()).map(text => text.trim()).join('\n')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()

  // ── 1. Catalogue : neuf modèles, une famille « Cuisine » ───────────────────────────────────────────
  await nav().getByRole('button', { name: 'Ajouter une bibliothèque', exact: true }).click()
  const catalogue = page.getByRole('dialog', { name: 'Ajouter une bibliothèque' })
  await catalogue.waitFor()
  assert(await catalogue.locator('.library-option').count() === 9, 'Catalogue : neuf modèles')
  const groups = (await catalogue.locator('.library-catalog-group > h3').allInnerTexts()).map(text => text.trim().toLowerCase())
  assert(groups.join(',') === 'lecture,écoute,écran,scène,jeu,cuisine', `Familles : ${groups.join(', ')}`)
  assert(await catalogue.locator('.library-option:disabled').count() === 4, 'Catalogue : les quatre bibliothèques déjà ajoutées restent désactivées')
  await catalogue.getByRole('button', { name: 'Ajouter Recettes de cuisine', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Recettes' }).waitFor()
  assert((await sql("SELECT library_id FROM profile_libraries WHERE library_id = 'recipes'")).length === 1, 'La bibliothèque est enregistrée dans profile_libraries')
  assert(await nav().getByRole('button', { name: 'Recettes', exact: true }).getAttribute('aria-current') === 'page', 'Recettes : ajoutée et ouverte')
  assert(await nav().getByRole('button', { name: 'Recettes', exact: true }).locator('svg').count() >= 1, 'Recettes : pictogramme dans la barre latérale')

  // ── 2. Création : listes, photo par lien, ni année ni résumé ──────────────────────────────────────
  await page.getByRole('button', { name: 'Ajouter une recette', exact: true }).first().click()
  const form = page.getByRole('dialog', { name: 'Ajouter une recette' })
  await form.waitFor()
  assert(await form.getByRole('radio', { name: 'En cours', exact: true }).count() === 0, 'Formulaire : pas de statut « En cours » pour une recette')
  assert(await form.getByRole('radio', { name: 'Écartée', exact: true }).count() === 0, 'Formulaire : pas de statut « Écartée »')
  assert(await form.getByRole('radio').count() === 2, 'Formulaire : deux statuts, À tester et Maîtrisée')
  assert(await form.locator('#custom-recipes-year').count() === 0, 'Formulaire : pas d’année pour une recette')
  assert(await form.locator('#custom-recipes-summary').count() === 0, 'Formulaire : pas de résumé pour une recette')
  await form.getByLabel('Titre', { exact: true }).fill('Tarte aux pommes')
  await form.getByLabel('Source', { exact: true }).fill('Grand-mère')
  await form.getByRole('radio', { name: 'Maîtrisée', exact: true }).click()
  await form.locator('#custom-recipes-detail-dish').click()
  await page.getByRole('option', { name: 'Dessert', exact: true }).click()
  await form.getByLabel('Préparation', { exact: true }).fill('1 h 10')
  await form.getByLabel('Cuisson', { exact: true }).fill('40 min')
  await form.getByLabel('Portions', { exact: true }).fill('6 personnes')
  // Le temps de Notion est total : il part en préparation, sans champ « Durée » séparé.
  assert(await form.getByLabel('Durée', { exact: true }).count() === 0, 'Formulaire : pas de champ « Durée » en double')
  // Les notes d'une recette existent dès la création, sans attendre un verdict.
  const notes = form.getByLabel('Notes', { exact: true })
  assert(await notes.count() === 1, 'Formulaire : bloc « Notes » pour une recette neuve')
  await notes.fill('Meilleure tiède, se congèle bien.')
  await typeList(form.getByLabel('Ingrédients', { exact: true }).first(), INGREDIENTS)
  await typeList(form.getByLabel('Étapes', { exact: true }).first(), STEPS)
  assert(await form.getByLabel('Ingrédients', { exact: true }).count() === INGREDIENTS.length, 'Formulaire : une ligne par ingrédient')
  assert(await form.getByLabel('Étapes', { exact: true }).count() === STEPS.length, 'Formulaire : une ligne par étape')
  // Retour arrière sur la ligne vide ouverte par Entrée : elle disparaît.
  await form.getByLabel('Étapes', { exact: true }).last().click()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Backspace')
  assert(await form.getByLabel('Étapes', { exact: true }).count() === STEPS.length, 'Formulaire : Retour arrière retire la ligne vide')
  await form.locator('.poster-edit-overlay').first().click()
  const photoDialog = page.getByRole('dialog', { name: /^Modifier (la couverture|le visuel|l’affiche)/ })
  await photoDialog.getByLabel('Adresse de l’image').fill(PHOTO)
  await photoDialog.locator('.poster-url-preview img').waitFor()
  await photoDialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await photoDialog.waitFor({ state: 'hidden' })
  await form.getByRole('button', { name: 'Ajouter une recette', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Tarte aux pommes' }).waitFor()

  // ── 3. Fiche : listes relues ligne par ligne, photo affichée, base conforme ────────────────────────
  assert(await shownList('ingredients') === INGREDIENTS.join('\n'), 'Fiche : ingrédients lus comme une liste')
  assert(await shownList('steps') === STEPS.join('\n'), 'Fiche : étapes lues comme une liste numérotée')
  assert(await page.locator('.detail-long-text[data-field="steps"] ol').count() === 1, 'Fiche : les étapes sont ordonnées')
  assert(await page.locator('.detail-long-text[data-field="ingredients"] ul').count() === 1, 'Fiche : les ingrédients sont à puces')
  const facts = await page.locator('.detail-facts').innerText()
  assert(/Grand-mère/.test(facts) && /6 personnes/.test(facts) && /1 h 10/.test(facts) && /40 min/.test(facts), 'Fiche : source, portions, préparation et cuisson affichés')
  assert(!/Année/.test(facts), 'Fiche : pas d’année pour une recette')
  assert(!/Durée/.test(facts), 'Fiche : pas de « Durée » en double, le temps est en préparation')
  assert(!/Ingrédients/.test(facts) && !/Étapes/.test(facts), 'Fiche : les listes ne sont pas des faits d’une ligne')
  assert((await page.locator('.mine-label').innerText()).trim() === 'NOTES', 'Fiche : le texte libre s’appelle « Notes »')
  assert((await page.locator('.review-personal').innerText()).includes('Meilleure tiède'), 'Fiche : les notes saisies sont relues')
  assert((await page.locator('.detail-poster img').first().getAttribute('src')) === PHOTO, 'Fiche : photo affichée depuis son lien')
  const [stored] = await sql("SELECT status, cover_url, creator, details FROM recipes WHERE title = 'Tarte aux pommes'")
  const details = JSON.parse(stored.details)
  assert(stored.status === 'maîtrisée' && stored.cover_url === PHOTO && stored.creator === 'Grand-mère', 'Base : statut, photo (lien seul) et source')
  assert(details.ingredients === INGREDIENTS.join('\n') && details.steps === STEPS.join('\n'), 'Base : une ligne par ingrédient et par étape')
  assert(details.dish === 'Dessert' && details.prepTime === '1 h 10' && details.cookTime === '40 min', 'Base : type de plat, préparation et cuisson')
  assert(!('duration' in details), 'Base : aucun champ « Durée » hérité')

  // ── 4. Modification : le formulaire se rouvre rempli, une ligne modifiée suffit ────────────────────
  await page.getByRole('button', { name: /^Modifier/ }).first().click()
  const edit = page.locator('.editor-dialog-embedded, .editor-dialog, [role="dialog"]').first()
  await edit.getByLabel('Ingrédients', { exact: true }).first().waitFor()
  assert(await listValue(edit, 'Ingrédients') === INGREDIENTS.join('\n'), 'Modification : ingrédients relus ligne par ligne')
  assert(await listValue(edit, 'Étapes') === STEPS.join('\n'), 'Modification : étapes relues ligne par ligne')
  await edit.getByLabel('Ingrédients', { exact: true }).nth(3).fill('5 pommes')
  await edit.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Tarte aux pommes' }).waitFor()
  await page.waitForTimeout(500)
  assert(await shownList('ingredients') === EDITED.join('\n'), 'Modification : la fiche montre la ligne modifiée')
  assert(JSON.parse((await sql("SELECT details FROM recipes WHERE title = 'Tarte aux pommes'"))[0].details).steps === STEPS.join('\n'), 'Modification : la préparation n’a pas bougé')

  // ── 5. Bibliothèque : vues par état et par type de plat, seconde recette ───────────────────────────
  await page.getByRole('button', { name: 'Retour à Recettes', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Recettes' }).waitFor()
  await page.getByRole('button', { name: 'Ajouter une recette', exact: true }).first().click()
  const second = page.getByRole('dialog', { name: 'Ajouter une recette' })
  await second.getByLabel('Titre', { exact: true }).fill('Soupe de potimarron')
  await typeList(second.getByLabel('Ingrédients', { exact: true }).first(), ['1 potimarron', '1 oignon'])
  await second.getByRole('button', { name: 'Ajouter une recette', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Soupe de potimarron' }).waitFor()
  assert(await page.locator('.detail-poster .poster-fallback').count() === 1, 'Recette sans photo : repli lisible')
  assert((await sql("SELECT status FROM recipes WHERE title = 'Soupe de potimarron'"))[0].status === 'à découvrir', 'Statut par défaut : « À tester » (à découvrir)')
  await page.getByRole('button', { name: 'Retour à Recettes', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Recettes' }).waitFor()
  await settle()
  const chips = (await page.locator('.custom-view-track .seg-pill-btn').allInnerTexts()).map(text => text.trim())
  assert(chips.slice(0, 3).join('|') === 'Tous|À tester|Maîtrisée', `Filtres : vues d’état (${chips.join(' | ')})`)
  assert(chips.includes('Dessert'), 'Filtres : une vue par type de plat présent')
  assert(!chips.some(text => /En cours|Écartée|Testée/.test(text)), 'Filtres : ni « En cours », ni « Écartée », ni « Testée »')
  assert(/2 recettes/.test(await page.locator('.library-subtitle').innerText()), 'Sous-titre : 2 recettes')
  assert(await page.locator('.custom-card').count() === 2, 'Deux cartes')

  await page.getByRole('radio', { name: 'Maîtrisée', exact: true }).click()
  await page.waitForTimeout(300)
  assert(await page.locator('.custom-card').count() === 1, 'Vue « Maîtrisée » : la tarte seulement')
  await page.getByRole('radio', { name: 'À tester', exact: true }).click()
  await page.waitForTimeout(300)
  assert(await page.locator('.custom-card').count() === 1, 'Vue « À tester » : la soupe seulement')
  await page.getByRole('radio', { name: 'Tous', exact: true }).click()
  await page.waitForTimeout(300)
  await page.locator('.custom-kind-filter').getByRole('button', { name: 'Dessert', exact: true }).click()
  await page.waitForTimeout(300)
  assert(await page.locator('.custom-card').count() === 1, 'Vue « Dessert » : une seule recette')
  await page.locator('.custom-kind-filter').getByRole('button', { name: 'Dessert', exact: true }).click()
  await page.waitForTimeout(300)
  assert(await page.locator('.custom-card').count() === 2, 'La vue de type de plat se referme au second clic')

  // ── 6. Suppression confirmée ───────────────────────────────────────────────────────────────────────
  await page.getByText('Soupe de potimarron', { exact: true }).first().click()
  await page.getByRole('button', { name: 'Supprimer cette recette', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer définitivement', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Recettes' }).waitFor()
  assert((await sql("SELECT COUNT(*) AS n FROM recipes"))[0].n === 1, 'Suppression : une seule recette reste')

  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  await page.unroute('https://picsum.photos/**')
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
