// Recettes de cuisine (qa-app.html, données synthétiques, aucune image téléchargée).
// Ouvrir la session playwright-cli depuis le dossier scratch : aucune capture n'est écrite ici.
// Gardes : la bibliothèque s'ajoute depuis le catalogue (neuf modèles, famille « Cuisine »), les
// ingrédients et la préparation gardent chaque ligne (lignes vides comprises) du formulaire à la
// base puis à la fiche, la photo est un lien affiché sans téléchargement, et « En cours » n'est
// pas proposé pour une recette.
async page => {
  page.setDefaultTimeout(8000)
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

  const INGREDIENTS = '200 g de farine\n100 g de beurre\n\nPour la garniture :\n4 pommes\n1 pincée de sel'
  const STEPS = '1. Mélanger la farine et le beurre.\n2. Étaler la pâte.\n\n3. Garnir et cuire 35 min à 180 °C.'
  const PHOTO = 'https://picsum.photos/seed/qa-recette-tarte/600/600'

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

  // ── 2. Création : textes longs, photo par lien, statut « Testée » ──────────────────────────────────
  await page.getByRole('button', { name: 'Ajouter une recette', exact: true }).first().click()
  const form = page.getByRole('dialog', { name: 'Ajouter une recette' })
  await form.waitFor()
  assert(await form.getByRole('radio', { name: 'En cours', exact: true }).count() === 0, 'Formulaire : pas de statut « En cours » pour une recette')
  assert(await form.getByRole('radio').count() === 3, 'Formulaire : trois statuts')
  await form.getByLabel('Titre', { exact: true }).fill('Tarte aux pommes')
  await form.getByLabel('Source', { exact: true }).fill('Grand-mère')
  await form.getByRole('radio', { name: 'Testée', exact: true }).click()
  await form.locator('#custom-recipes-detail-dish').click()
  await page.getByRole('option', { name: 'Dessert', exact: true }).click()
  await form.getByLabel('Portions', { exact: true }).fill('6 personnes')
  await form.getByLabel('Préparation', { exact: true }).fill('25 min')
  await form.getByLabel('Cuisson', { exact: true }).fill('40 min')
  await form.getByLabel('Ingrédients', { exact: true }).fill(INGREDIENTS)
  await form.getByLabel('Étapes', { exact: true }).fill(STEPS)
  await form.locator('.poster-edit-overlay').first().click()
  const photoDialog = page.getByRole('dialog', { name: /^Modifier (la couverture|le visuel|l’affiche)/ })
  await photoDialog.getByLabel('Adresse de l’image').fill(PHOTO)
  await photoDialog.locator('.poster-url-preview img').waitFor()
  await photoDialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await photoDialog.waitFor({ state: 'hidden' })
  await form.getByRole('button', { name: 'Ajouter une recette', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Tarte aux pommes' }).waitFor()

  // ── 3. Fiche : chaque ligne relue, photo affichée, base conforme ───────────────────────────────────
  const longText = async field => page.locator(`.detail-long-text[data-field="${field}"] p`).evaluate(node => node.textContent)
  assert(await longText('ingredients') === INGREDIENTS, 'Fiche : ingrédients identiques, lignes vides comprises')
  assert(await longText('steps') === STEPS, 'Fiche : étapes identiques, lignes vides comprises')
  assert(/white-space:\s*pre-wrap/.test(await page.locator('.detail-long-text p').first().evaluate(node => `white-space:${getComputedStyle(node).whiteSpace}`)), 'Fiche : les retours à la ligne sont affichés')
  const facts = await page.locator('.detail-facts').innerText()
  assert(/Grand-mère/.test(facts) && /6 personnes/.test(facts) && /25 min/.test(facts) && /40 min/.test(facts), 'Fiche : source, portions et temps affichés')
  assert(!/Ingrédients/.test(facts) && !/Étapes/.test(facts), 'Fiche : les textes longs ne sont pas des faits d’une ligne')
  assert((await page.locator('.detail-poster img').first().getAttribute('src')) === PHOTO, 'Fiche : photo affichée depuis son lien')
  const [stored] = await sql("SELECT status, cover_url, creator, details FROM recipes WHERE title = 'Tarte aux pommes'")
  const details = JSON.parse(stored.details)
  assert(stored.status === 'terminé' && stored.cover_url === PHOTO && stored.creator === 'Grand-mère', 'Base : statut, photo (lien seul) et source')
  assert(details.ingredients === INGREDIENTS && details.steps === STEPS && details.dish === 'Dessert' && details.prepTime === '25 min', 'Base : textes longs stockés à l’identique dans details')

  // ── 4. Modification : le formulaire se rouvre rempli, une ligne modifiée suffit ────────────────────
  await page.getByRole('button', { name: /^Modifier/ }).first().click()
  const edit = page.locator('.editor-dialog-embedded, .editor-dialog, [role="dialog"]').first()
  await edit.getByLabel('Ingrédients', { exact: true }).waitFor()
  assert(await edit.getByLabel('Ingrédients', { exact: true }).inputValue() === INGREDIENTS, 'Modification : ingrédients relus dans le champ')
  assert(await edit.getByLabel('Étapes', { exact: true }).inputValue() === STEPS, 'Modification : étapes relues dans le champ')
  const EDITED = INGREDIENTS.replace('4 pommes', '5 pommes')
  await edit.getByLabel('Ingrédients', { exact: true }).fill(EDITED)
  await edit.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Tarte aux pommes' }).waitFor()
  await page.waitForTimeout(500)
  assert(await longText('ingredients') === EDITED, 'Modification : la fiche montre la ligne modifiée')
  assert(JSON.parse((await sql("SELECT details FROM recipes WHERE title = 'Tarte aux pommes'"))[0].details).steps === STEPS, 'Modification : la préparation n’a pas bougé')

  // ── 5. Bibliothèque : filtres de statut, photo manquante, seconde recette ──────────────────────────
  await page.getByRole('button', { name: 'Retour à Recettes', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Recettes' }).waitFor()
  await page.getByRole('button', { name: 'Ajouter une recette', exact: true }).first().click()
  const second = page.getByRole('dialog', { name: 'Ajouter une recette' })
  await second.getByLabel('Titre', { exact: true }).fill('Soupe de potimarron')
  await second.getByLabel('Ingrédients', { exact: true }).fill('1 potimarron\n1 oignon')
  await second.getByRole('button', { name: 'Ajouter une recette', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Soupe de potimarron' }).waitFor()
  assert(await page.locator('.detail-poster .poster-fallback').count() === 1, 'Recette sans photo : repli lisible')
  assert((await sql("SELECT status FROM recipes WHERE title = 'Soupe de potimarron'"))[0].status === 'à découvrir', 'Statut par défaut : « À essayer » (à découvrir)')
  await page.getByRole('button', { name: 'Retour à Recettes', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Recettes' }).waitFor()
  await settle()
  const chips = await page.locator('.custom-library-tools [role="radio"], .view-bar button').allInnerTexts()
  assert(chips.some(text => /À essayer/.test(text)) && chips.some(text => /Testée/.test(text)), `Filtres : « À essayer » et « Testée » proposés (${chips.join(' | ')})`)
  assert(!chips.some(text => /En cours/.test(text)), 'Filtres : pas de « En cours »')
  assert(/2 recettes/.test(await page.locator('.library-subtitle').innerText()), 'Sous-titre : 2 recettes')
  assert(await page.locator('.custom-card').count() === 2, 'Deux cartes')

  // ── 6. Suppression confirmée ───────────────────────────────────────────────────────────────────────
  await page.getByText('Soupe de potimarron', { exact: true }).first().click()
  await page.getByRole('button', { name: 'Supprimer cette recette', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer définitivement', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Recettes' }).waitFor()
  assert((await sql("SELECT COUNT(*) AS n FROM recipes"))[0].n === 1, 'Suppression : une seule recette reste')

  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
