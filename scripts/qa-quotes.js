// Vraie UI, base SQLite mémoire et fixtures synthétiques. Lancer depuis le scratch.
async page => {
  page.setDefaultTimeout(7000)
  const checks = [], errors = []
  const assert = (ok, label) => { if (!ok) throw Error(label); checks.push(label) }
  page.on('pageerror', e => errors.push(e.message))
  const dir = '/Users/aurelientrouble/.hermes/profiles/promethee/cache/scratch/quotes-qa'
  const select = (q, v = []) => page.evaluate(([q, v]) => window.__syllogeRecette.select(q, v), [q, v])
  const cases = [
    ['Livres', 'livre', 'books', 'book_quotes', 'book_id'],
    ['Mangas', 'manga', 'mangas', 'manga_quotes', 'manga_id'],
    ['Comics', 'comic', 'comics', 'comic_quotes', 'comic_id'],
  ]
  for (const [width, height] of [[1440, 900], [1000, 760]]) {
    await page.setViewportSize({ width, height })
    for (const theme of ['light', 'dark']) {
      await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
      await page.evaluate(t => localStorage.setItem('sylloge-theme', t), theme)
      await page.reload()
      const nav = page.getByRole('navigation', { name: 'Navigation principale' })
      await nav.waitFor()
      for (const [label, noun, table, quoteTable, owner] of cases) {
        const tag = `${width}/${theme}/${label}`, title = `Recette citations ${label}`
        await nav.getByRole('button', { name: label, exact: true }).click()
        await page.getByRole('button', { name: `Ajouter un ${noun}`, exact: true }).first().click()
        if (table !== 'comics') await page.getByRole('button', { name: 'Saisir manuellement', exact: true }).click()
        const form = page.getByRole('dialog').last()
        await form.getByLabel(table === 'comics' ? 'Titre' : `Titre du ${noun}`, { exact: true }).fill(title)
        await form.getByRole('button', { name: 'Ajouter une citation', exact: true }).click()
        await form.getByLabel('Citation 1', { exact: true }).fill('  « Le temps est un chemin. »\nDeuxième ligne — 夜  ')
        await form.getByRole('button', { name: 'Ajouter une citation', exact: true }).click()
        await form.getByLabel('Citation 2', { exact: true }).fill('Le même ciel nous rassemble.')
        await form.getByRole('button', { name: 'Déplacer la citation 2 vers le haut', exact: true }).click()
        assert((await form.getByLabel('Citation 1', { exact: true }).inputValue()) === 'Le même ciel nous rassemble.', `${tag} : ordre modifiable`)
        await form.getByRole('button', { name: 'Ajouter une citation', exact: true }).click() // brouillon vide ignoré
        if (label === 'Livres') await page.screenshot({ path: `${dir}/${width}-${theme}-editor.png` })
        await form.getByRole('button', { name: table === 'comics' ? 'Ajouter un comic' : `Ajouter le ${noun}`, exact: true }).click()
        await form.waitFor({ state: 'hidden' })
        await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor()
        const section = page.locator('.quotes-section')
        await section.scrollIntoViewIfNeeded()
        assert(await section.getByText('Le même ciel nous rassemble.', { exact: true }).isVisible(), `${tag} : citations ouvertes dans la fiche`)
        const [entry] = await select(`SELECT id, status FROM ${table} WHERE title = $1`, [title])
        let quotes = await select(`SELECT id, body, position, created_at FROM ${quoteTable} WHERE ${owner} = $1 ORDER BY position`, [entry.id])
        assert(quotes.length === 2 && quotes[1].body.startsWith('  «') && quotes[1].body.endsWith('夜  '), `${tag} : texte exact et brouillon vide ignoré`)
        const before = JSON.stringify(quotes)
        assert(entry.status === (table === 'comics' ? 'à découvrir' : 'à lire'), `${tag} : citations disponibles sans changer le statut`)
        if (label === 'Livres') await page.screenshot({ path: `${dir}/${width}-${theme}-detail.png` })
        await section.getByRole('button', { name: 'Modifier les citations', exact: true }).click()
        const edit = page.getByRole('dialog', { name: 'Modifier la fiche' })
        // Sauvegarder sans modifier les citations ne renouvelle pas leur identité.
        await edit.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
        await form.waitFor({ state: 'hidden' })
        await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor()
        quotes = await select(`SELECT id, body, position, created_at FROM ${quoteTable} WHERE ${owner} = $1 ORDER BY position`, [entry.id])
        assert(JSON.stringify(quotes) === before, `${tag} : identité et dates conservées après édition`)
        await page.locator('.quotes-section').getByRole('button', { name: 'Modifier les citations', exact: true }).click()
        await edit.getByRole('button', { name: 'Retirer la citation 1', exact: true }).click()
        await edit.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
        await form.waitFor({ state: 'hidden' })
        await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor()
        const after = await select(`SELECT id, body FROM ${quoteTable} WHERE ${owner} = $1`, [entry.id])
        assert(after.length === 1 && after[0].id === quotes[1].id, `${tag} : suppression ciblée sans recréer les autres citations`)
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag} : aucun débordement horizontal`)
      }
      const result = await page.evaluate(async () => {
        const { libraryRepository } = await import('/src/data/libraryRepository.ts')
        const { createLibraryDocument, serializeLibraryDocument, validateLibraryDocument } = await import('/src/domain/libraryDocument.ts')
        const original = await libraryRepository.loadLibrary('qa-profile')
        const doc = validateLibraryDocument(serializeLibraryDocument(createLibraryDocument(original)))
        if (!doc.document) return { ok: false, errors: doc.errors }
        const restored = await libraryRepository.importLibraryDocument(doc.document)
        const bodies = lib => [
          ...lib.books.map(b => [b.title, b.quotes.map(q => q.body)]),
          ...lib.mangas.map(b => [b.title, b.quotes.map(q => q.body)]),
          ...lib.customLibraries.filter(c => c.libraryId === 'comics').flatMap(c => c.entries.map(b => [b.title, b.quotes.map(q => q.body)])),
        ].sort((a, b) => a[0].localeCompare(b[0]))
        return { ok: JSON.stringify(bodies(original)) === JSON.stringify(bodies(restored)) }
      })
      assert(result.ok, `${width}/${theme} : sauvegarde et restauration des trois bibliothèques`)
    }
  }
  // Cas limites, une seule fois : fiche sans citation, déplacement au clavier,
  // suppression de la dernière citation et retour à l’état vide.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
  const mainNav = page.getByRole('navigation', { name: 'Navigation principale' })
  await mainNav.waitFor()
  await mainNav.getByRole('button', { name: 'Livres', exact: true }).click()
  await page.getByRole('button', { name: 'Ajouter un livre', exact: true }).first().click()
  await page.getByRole('button', { name: 'Saisir manuellement', exact: true }).click()
  const emptyForm = page.getByRole('dialog').last()
  const emptyTitle = 'Recette sans citation'
  await emptyForm.getByLabel('Titre du livre', { exact: true }).fill(emptyTitle)
  await emptyForm.getByRole('button', { name: 'Ajouter le livre', exact: true }).click()
  await emptyForm.waitFor({ state: 'hidden' })
  await page.getByRole('heading', { name: emptyTitle, exact: true, level: 1 }).waitFor()
  const emptySection = page.locator('.quotes-section')
  await emptySection.scrollIntoViewIfNeeded()
  assert(await emptySection.getByText('Les passages conservés dans cette œuvre apparaîtront ici.').isVisible(), 'fiche sans citation : état vide explicite')
  assert(await emptySection.getByText('Aucune citation', { exact: true }).isVisible(), 'fiche sans citation : compteur au singulier juste')
  await emptySection.getByRole('button', { name: 'Ajouter une citation', exact: true }).click()
  const ctaForm = page.getByRole('dialog', { name: 'Modifier la fiche' })
  await ctaForm.waitFor()
  // Le CTA de la fiche vide ouvre l’éditeur sur un passage déjà créé et focalisé :
  // une seule action mène à la saisie, sans second clic dans le formulaire.
  const draftField = ctaForm.getByLabel('Citation 1', { exact: true })
  await draftField.waitFor()
  const draftFocus = await page.evaluate(() => ({
    placeholder: document.activeElement?.getAttribute('placeholder') ?? null,
    insideDialog: Boolean(document.activeElement?.closest('[role="dialog"]')),
  }))
  assert(draftFocus.placeholder === 'Saisir le passage…' && draftFocus.insideDialog, 'CTA de la fiche vide : le passage créé reçoit le focus')
  await draftField.fill('Premier passage, déplacé ensuite au clavier.')
  await ctaForm.getByRole('button', { name: 'Ajouter une citation', exact: true }).click()
  await ctaForm.getByLabel('Citation 2', { exact: true }).fill('Second passage.')
  // Déplacement au clavier : le focus reste sur le geste, donc Entrée répète le
  // déplacement au lieu d’insérer un saut de ligne dans un champ voisin.
  const upButton = ctaForm.getByRole('button', { name: 'Déplacer la citation 2 vers le haut', exact: true })
  await upButton.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
  const afterMove = await page.evaluate(() => ({
    label: document.activeElement?.getAttribute('aria-label') ?? null,
    isField: document.activeElement?.tagName === 'TEXTAREA',
  }))
  assert(!afterMove.isField && Boolean(afterMove.label?.startsWith('Déplacer la citation')), 'déplacement au clavier : le focus reste sur le bouton de déplacement')
  assert((await ctaForm.getByLabel('Citation 1', { exact: true }).inputValue()) === 'Second passage.', 'déplacement au clavier : ordre appliqué')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
  assert((await ctaForm.getByLabel('Citation 1', { exact: true }).inputValue()) === 'Premier passage, déplacé ensuite au clavier.', 'déplacement au clavier : Entrée répète le geste')
  await ctaForm.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await ctaForm.waitFor({ state: 'hidden' })
  const [emptyEntry] = await select('SELECT id FROM books WHERE title = $1', [emptyTitle])
  let ctaQuotes = await select('SELECT id, body, position FROM book_quotes WHERE book_id = $1 ORDER BY position', [emptyEntry.id])
  assert(ctaQuotes.length === 2 && ctaQuotes[0].body === 'Premier passage, déplacé ensuite au clavier.', 'déplacement au clavier : positions écrites dans l’ordre')
  // Supprimer la dernière citation ramène la fiche à son état vide, sans ligne résiduelle.
  await page.locator('.quotes-section').getByRole('button', { name: 'Modifier les citations', exact: true }).click()
  const lastForm = page.getByRole('dialog', { name: 'Modifier la fiche' })
  await lastForm.waitFor()
  await lastForm.getByRole('button', { name: 'Retirer la citation 2', exact: true }).click()
  await lastForm.getByRole('button', { name: 'Retirer la citation 1', exact: true }).click()
  await page.waitForTimeout(150)
  const focusAfterRemoval = await page.evaluate(() => ({
    text: document.activeElement?.textContent?.trim() ?? null,
    insideDialog: Boolean(document.activeElement?.closest('[role="dialog"]')),
  }))
  assert(focusAfterRemoval.text === 'Ajouter une citation' && focusAfterRemoval.insideDialog, 'suppression de la dernière citation : le focus reste dans la fenêtre, sur le bouton d’ajout')
  await lastForm.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await lastForm.waitFor({ state: 'hidden' })
  ctaQuotes = await select('SELECT id FROM book_quotes WHERE book_id = $1', [emptyEntry.id])
  assert(ctaQuotes.length === 0, 'suppression de la dernière citation : aucune ligne résiduelle')
  await page.locator('.quotes-section').scrollIntoViewIfNeeded()
  assert(await page.locator('.quotes-section').getByText('Les passages conservés dans cette œuvre apparaîtront ici.').isVisible(), 'suppression de la dernière citation : retour à l’état vide')
  // Même intention d’ajout pour une bibliothèque personnalisée : le code du
  // comic passe par CustomLibraryScreen, pas par BookDetail.
  await mainNav.getByRole('button', { name: 'Comics', exact: true }).click()
  const comicTitle = 'Recette sans citation comics'
  await page.getByRole('button', { name: 'Ajouter un comic', exact: true }).first().click()
  const comicCreate = page.getByRole('dialog').last()
  await comicCreate.getByLabel('Titre', { exact: true }).fill(comicTitle)
  await comicCreate.getByRole('button', { name: 'Ajouter un comic', exact: true }).click()
  await comicCreate.waitFor({ state: 'hidden' })
  await page.getByRole('heading', { name: comicTitle, exact: true, level: 1 }).waitFor()
  const comicSection = page.locator('.quotes-section')
  await comicSection.scrollIntoViewIfNeeded()
  assert(await comicSection.getByText('Aucune citation', { exact: true }).isVisible(), 'comic sans citation : compteur au singulier juste')
  await comicSection.getByRole('button', { name: 'Ajouter une citation', exact: true }).click()
  const comicEdit = page.getByRole('dialog')
  await comicEdit.waitFor()
  const comicDraft = comicEdit.getByLabel('Citation 1', { exact: true })
  await comicDraft.waitFor()
  const comicFocus = await page.evaluate(() => ({
    placeholder: document.activeElement?.getAttribute('placeholder') ?? null,
    inside: Boolean(document.activeElement?.closest('[role="dialog"]')),
  }))
  assert(comicFocus.placeholder === 'Saisir le passage…' && comicFocus.inside, 'CTA d’un comic vide : le passage créé reçoit le focus')
  await comicEdit.getByRole('button', { name: 'Annuler', exact: true }).click()
  await comicEdit.waitFor({ state: 'hidden' })
  assert(errors.length === 0, `Aucune erreur JS : ${errors.join('; ')}`)
  return JSON.stringify({ ok: true, checks })
}
