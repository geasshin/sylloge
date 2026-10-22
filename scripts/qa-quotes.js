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
  assert(errors.length === 0, `Aucune erreur JS : ${errors.join('; ')}`)
  return JSON.stringify({ ok: true, checks })
}
