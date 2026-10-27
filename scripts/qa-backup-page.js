// Paramètres › Sauvegarde recomposée, sélecteur de restauration et bilan des vues (qa-app.html,
// données synthétiques). Gardes : plus de ligne « Rythme » qui n'offre rien à régler, un conseil
// de dossier synchronisé, un seul bouton principal dans le sélecteur, un aperçu qui annonce ce que
// le document emporte, un bilan affiché après restauration (vues créées, renommées, préférences),
// et un message clair pour une sauvegarde d'une version future.
async page => {
  page.setDefaultTimeout(8000)
  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  const text = locator => locator.innerText()
  // L'application rouvre la dernière vue : la navigation ne suppose aucun état de départ.
  const openBackup = async (settingsLabel = 'Paramètres', backupLabel = 'Sauvegarde') => {
    const entry = page.locator('aside').getByRole('button', { name: backupLabel, exact: true })
    if (!(await entry.isVisible().catch(() => false))) await page.getByRole('button', { name: settingsLabel, exact: true }).click()
    await entry.click()
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await openBackup()
  await page.getByRole('heading', { name: 'Sauvegarde automatique', exact: true }).waitFor()
  await page.waitForTimeout(400)

  // ── 1. Page non configurée ────────────────────────────────────────────────────────────────────
  let body = await text(page.locator('main'))
  assert(!/Rythme/.test(body), 'Plus de ligne « Rythme »')
  assert(!/Restaurer ou changer d’ordinateur/.test(body), 'Ancien titre « Restaurer ou changer d’ordinateur » disparu')
  assert(/dossier synchronisé \(iCloud Drive, Google Drive…\)/.test(body) && /dossier « Sylloge »/.test(body), 'Conseil : dossier synchronisé et création du dossier « Sylloge »')
  assert(await page.getByRole('heading', { name: 'Reprendre ses données ou en garder une copie', exact: true }).count() === 1, 'Groupe « Reprendre ses données ou en garder une copie »')
  assert(await page.getByRole('heading', { name: 'Copies de ce profil', exact: true }).count() === 0, 'Pas de liste de copies tant qu’aucun dossier n’est choisi')
  assert(await page.getByText('Retrouver un profil', { exact: true }).count() === 1, 'Ligne « Retrouver un profil »')

  // ── 2. Dossier choisi : le rythme se lit dans « Sauvegarder maintenant » ───────────────────────
  await page.getByRole('button', { name: 'Choisir un dossier', exact: true }).click()
  await page.getByRole('heading', { name: 'Copies de ce profil', exact: true }).waitFor()
  body = await text(page.locator('main'))
  assert(/Une copie automatique est aussi créée chaque jour, à la première modification\./.test(body), '« Sauvegarder maintenant » dit le rythme quotidien')
  assert(/Aucune copie automatique pour l’instant\./.test(body), 'Dernière copie automatique : aucune pour l’instant')
  assert(/Rien à faire ici en temps normal/.test(body), 'Copies : explique que « Restaurer… » n’est pas à faire en temps normal')
  assert(await page.locator('.settings-row', { hasText: 'Rythme' }).count() === 0, 'Aucune ligne Rythme')

  // ── 3. Le sélecteur : « Rechercher » en principal, « Choisir un fichier JSON » visible à côté ──────
  await page.getByRole('button', { name: 'Restaurer une sauvegarde', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  const primary = await dialog.locator('.backup-picker-actions .primary-button').allInnerTexts()
  assert(primary.length === 1 && primary[0] === 'Rechercher sur ce Mac', 'Sélecteur : un seul bouton principal, « Rechercher sur ce Mac »')
  const actions = await dialog.locator('.backup-picker-actions button').allInnerTexts()
  assert(JSON.stringify(actions) === JSON.stringify(['Rechercher sur ce Mac', 'Choisir un fichier JSON']), `Sélecteur : exactement deux actions, côte à côte (${actions})`)
  assert(await dialog.locator('.backup-picker-actions .secondary-button', { hasText: 'Choisir un fichier JSON' }).count() === 1, '« Choisir un fichier JSON » est un vrai bouton, plus un lien discret')
  assert(await dialog.getByRole('button', { name: /Parcourir un dossier/ }).count() === 0, 'Plus de bouton « Parcourir un dossier de sauvegardes »')
  assert(/clé USB ou dans un autre dossier : choisir directement son fichier JSON/.test(await text(dialog.locator('.backup-search-note'))), 'Note : une clé USB ou un autre dossier passe par « Choisir un fichier JSON »')
  const sameRow = await dialog.locator('.backup-picker-actions button').evaluateAll(b => new Set(b.map(x => Math.round(x.getBoundingClientRect().top))).size === 1)
  assert(sameRow, 'Les deux boutons sont sur une seule ligne')
  await page.screenshot({ path: 'qa/bk-1-picker.png' })

  // ── 4. Un document courant (v5 et plus) qui emporte deux vues et deux préférences ────────────────────────────────
  await page.evaluate(async () => {
    const { libraryRepository } = await import('/src/data/libraryRepository.ts')
    const { createLibraryDocument, serializeLibraryDocument } = await import('/src/domain/libraryDocument.ts')
    const { buildExperience } = await import('/src/domain/profileExperience.ts')
    const library = await libraryRepository.loadLibrary('qa-profile')
    const criteria = { sort: { column: 'title', direction: 'asc' }, mediumFilter: 'all', filters: {} }
    const at = '2026-10-01T00:00:00.000Z'
    const views = [
      { medium: 'films', name: 'À revoir', criteria, createdAt: at, updatedAt: at },
      { medium: 'films', name: 'À revoir', criteria, createdAt: at, updatedAt: at },
    ]
    const withExperience = serializeLibraryDocument(createLibraryDocument(library, undefined, buildExperience(views, { theme: 'dark', homeAutoplay: 'off' })))
    // Version courante : 6 (champs de forme d’art, 27 octobre 2026) ; « plus récente » = 7.
    const newer = JSON.stringify({ ...JSON.parse(withExperience), version: 7 })
    // Un vrai v4 n’a ni expérience ni champs de forme sur ses œuvres.
    const v4 = (() => { const d = JSON.parse(withExperience); d.version = 4; delete d.experience; d.artworks = d.artworks.map(({ details: _details, ...artwork }) => artwork); return JSON.stringify(d) })()
    const invoke = window.__TAURI_INTERNALS__.invoke
    window.__bk = { next: withExperience, withExperience, newer, v4 }
    window.__TAURI_INTERNALS__.invoke = async (cmd, args, ...rest) => {
      if (cmd === 'pick_import_json') return { name: 'sylloge-test.json', contents: window.__bk.next }
      return invoke(cmd, args, ...rest)
    }
  })
  await dialog.getByRole('button', { name: 'Choisir un fichier JSON', exact: true }).click()
  await dialog.locator('.backup-preview').waitFor()
  const preview = await text(dialog.locator('.backup-preview'))
  assert(/Elle contient aussi 2 vues enregistrées et 2 préférences d’affichage\. Tout est restauré avec les fiches\./.test(preview), `Aperçu : annonce 2 vues et 2 préférences (${preview.split('\n').slice(-2).join(' | ')})`)
  assert(!/ne font pas partie de ce format/.test(preview), 'Aperçu : plus de phrase périmée')
  await page.screenshot({ path: 'qa/bk-2-preview.png' })

  await dialog.getByRole('textbox', { name: 'Nom du profil restauré' }).fill('Profil avec vues')
  await dialog.getByRole('button', { name: 'Confirmer la restauration', exact: true }).click()
  await dialog.getByRole('heading', { name: 'Profil restauré', exact: true }).waitFor()
  const report = await text(dialog)
  assert(/Vues enregistrées et préférences : 2 vues restaurées · 1 renommée \(nom déjà pris\) · 2 préférences appliquées\./.test(report), `Bilan affiché après restauration (${report.split('\n').filter(l => /Vues enregistrées/.test(l)).join('')})`)
  await page.screenshot({ path: 'qa/bk-3-bilan.png' })
  const stored = await page.evaluate(() => {
    const select = window.__syllogeRecette.select
    const target = select("SELECT id FROM profiles WHERE name = 'Profil avec vues'")[0]
    return select('SELECT name FROM saved_views WHERE profile_id = $1 ORDER BY name', [target.id]).map(row => row.name)
  })
  assert(JSON.stringify(stored) === JSON.stringify(['À revoir', 'À revoir (2)']), `Base : les deux vues existent, le doublon est suffixé (${stored})`)
  await dialog.getByRole('button', { name: 'Ouvrir le profil restauré', exact: true }).click()

  // ── 5. Un document v4 : aucune phrase de bilan inventée ───────────────────────────────────────
  await page.evaluate(() => { window.__bk.next = window.__bk.v4 })
  await openBackup()
  await page.getByRole('button', { name: 'Restaurer une sauvegarde', exact: true }).click()
  const second = page.getByRole('dialog')
  await second.getByRole('button', { name: 'Choisir un fichier JSON', exact: true }).click()
  await second.locator('.backup-preview').waitFor()
  assert(/Elle ne contient ni vue enregistrée ni préférence d’affichage\./.test(await text(second.locator('.backup-preview'))), 'Aperçu v4 : dit franchement qu’il n’y a ni vues ni préférences')
  await second.getByRole('textbox', { name: 'Nom du profil restauré' }).fill('Profil ancien format')
  await second.getByRole('button', { name: 'Confirmer la restauration', exact: true }).click()
  await second.getByRole('heading', { name: 'Profil restauré', exact: true }).waitFor()
  assert(!/Vues enregistrées et préférences :/.test(await text(second)), 'Restauration v4 : aucune phrase de bilan')
  await second.getByRole('button', { name: 'Ouvrir le profil restauré', exact: true }).click()

  // ── 6. Une sauvegarde d'une version future ─────────────────────────────────────────────────────
  await page.evaluate(() => { window.__bk.next = window.__bk.newer })
  await openBackup()
  await page.getByRole('button', { name: 'Restaurer une sauvegarde', exact: true }).click()
  const third = page.getByRole('dialog')
  await third.getByRole('button', { name: 'Choisir un fichier JSON', exact: true }).click()
  await third.getByRole('alert').waitFor()
  assert(/Cette sauvegarde a été créée par une version plus récente de Sylloge\. Mettre l’application à jour pour la restaurer\./.test(await text(third.getByRole('alert'))), 'Version future : message qui demande de mettre à jour')
  assert(await third.getByRole('button', { name: 'Confirmer la restauration', exact: true }).isDisabled(), 'Version future : aucune confirmation possible')
  await page.keyboard.press('Escape')

  // ── 7. Anglais ──────────────────────────────────────────────────────────────────────────────────
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=en')
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await openBackup('Settings', 'Backup')
  await page.getByRole('heading', { name: 'Automatic backup', exact: true }).waitFor()
  await page.waitForTimeout(400)
  const english = await text(page.locator('main'))
  assert(/Preferably choose a synced folder \(iCloud Drive, Google Drive…\)/.test(english), 'EN : conseil de dossier synchronisé')
  assert(/Take your data elsewhere or keep a copy/i.test(english) && !/Rythme|Fréquence|Restaurer/.test(english), 'EN : titres traduits, aucun résidu français')
  await page.screenshot({ path: 'qa/bk-4-en.png' })

  // Langue, thème et barre épinglée sont mémorisés (le document v5 restauré applique un thème sombre) :
  // on remet l'état de départ pour ne pas fausser la recette suivante.
  await page.evaluate(() => ['sylloge-theme', 'sylloge-sidebar-pinned', 'sylloge-language'].forEach(key => localStorage.removeItem(key)))
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full&lang=fr')
  await page.getByRole('heading', { level: 1 }).first().waitFor()

  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
