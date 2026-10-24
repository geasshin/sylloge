// Paramètres recomposés + sauvegarde + recherche de sauvegardes (qa-app.html, données synthétiques).
// Ouvrir la session playwright-cli depuis le dossier scratch : aucune capture n'est écrite ici.
async page => {
  page.setDefaultTimeout(8000)
  const checks = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  const nav = label => page.locator('aside').getByRole('button', { name: label, exact: true })
  // Ce script vérifie des valeurs par défaut : il repart d'un stockage local
  // vierge, sinon une recette précédente dans la même session fausse les réglages.
  const openSettings = async () => {
    await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.locator('.atrium-home').waitFor()
    await page.getByRole('button', { name: 'Paramètres', exact: true }).click()
  }

  // 1. Navigation : ordre et libellés.
  await openSettings()
  const labels = await page.locator('aside nav button, aside [aria-current], aside .nav-item').allInnerTexts()
  const order = ['Profils', 'Sauvegarde', 'Importer et exporter', 'Général', 'À propos']
  const seen = order.map(label => labels.findIndex(text => text.trim() === label))
  assert(seen.every(index => index >= 0) && seen.every((value, i) => i === 0 || value > seen[i - 1]), 'Navigation : Profils, Sauvegarde, Importer et exporter, Général, À propos')

  // 2. Profils : compteurs des sept bibliothèques, suppression d'un profil contenant anime et mangas.
  await nav('Profils').click()
  const summary = await page.locator('.settings-row').first().innerText()
  assert(/animé/.test(summary) && /manga/.test(summary), 'Profils : le résumé compte Animation japonaise et Mangas')
  const seeded = await page.evaluate(() => {
    const db = window.__syllogeRecette
    const now = new Date().toISOString()
    db.execute("INSERT INTO profiles (id, name, created_at, updated_at) VALUES ('qa-anime', 'Profil anime', $1, $1)", [now])
    db.execute("INSERT INTO anime (id, profile_id, title, created_at, updated_at) VALUES ('qa-anime-1', 'qa-anime', 'Frieren', $1, $1)", [now])
    db.execute("INSERT INTO mangas (id, profile_id, title, created_at, updated_at) VALUES ('qa-manga-1', 'qa-anime', 'Vagabond', $1, $1)", [now])
    db.execute("INSERT INTO manga_quotes (id, manga_id, body, position) VALUES ('qa-quote-1', 'qa-manga-1', 'Citation', 0)")
    return db.select("SELECT COUNT(*) AS n FROM anime WHERE profile_id = 'qa-anime'")[0].n
  })
  assert(Number(seeded) === 1, 'Fixture : profil ne contenant que de l’animation et des mangas')
  // La liste des profils se relit après une création : en créer un via l’interface.
  await page.getByRole('button', { name: 'Créer un profil', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nom du nouveau profil' }).fill('Profil de test')
  await page.getByRole('button', { name: 'Créer le profil', exact: true }).click()
  assert(/Bibliothèque vide/.test(await page.locator('.settings-row', { hasText: 'Profil de test' }).innerText()), 'Profils : création depuis les Paramètres')
  const row = page.locator('.settings-row', { hasText: 'Profil anime' })
  assert(/1 animé · 1 manga/.test(await row.innerText()), 'Profils : un profil anime/manga n’est pas présenté comme vide')
  await row.getByRole('button', { name: 'Supprimer', exact: true }).click()
  const dialogText = await page.getByRole('dialog').innerText()
  assert(/1 animé · 1 manga/.test(dialogText) && !/ne contient aucune fiche/.test(dialogText), 'Suppression : la confirmation annonce les fiches anime et manga')
  await page.getByRole('button', { name: 'Supprimer définitivement', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  const left = await page.evaluate(() => window.__syllogeRecette.select("SELECT (SELECT COUNT(*) FROM anime WHERE profile_id = 'qa-anime') + (SELECT COUNT(*) FROM mangas WHERE profile_id = 'qa-anime') + (SELECT COUNT(*) FROM manga_quotes WHERE manga_id = 'qa-manga-1') + (SELECT COUNT(*) FROM profiles WHERE id = 'qa-anime') AS n")[0].n)
  assert(Number(left) === 0, 'Suppression : profil, animation, mangas et citations retirés')

  // 3. Sauvegarde : inactive, choix du dossier, sauvegarde immédiate, liste des copies, restauration d'une copie.
  await nav('Sauvegarde').click()
  assert(await page.getByRole('button', { name: 'Sauvegarder maintenant', exact: true }).isDisabled(), 'Sauvegarde inactive : pas de sauvegarde manuelle sans dossier')
  await page.getByRole('button', { name: 'Choisir un dossier', exact: true }).click()
  await page.getByText('/recette/Sauvegardes Sylloge').first().waitFor()
  assert(await page.getByText('Aucune copie pour l’instant').count() === 1, 'Choisir un dossier ne crée aucune copie implicite')
  assert(await page.getByText(/3 copies récentes, puis une par semaine sur 4 semaines et une par mois sur 6 mois/).count() === 1, 'Conservation affichée : 3 récentes, 4 hebdomadaires, 6 mensuelles')
  await page.getByRole('button', { name: 'Sauvegarder maintenant', exact: true }).click()
  await page.getByRole('button', { name: 'Restaurer…', exact: true }).first().waitFor()
  const copies = await page.getByRole('button', { name: 'Restaurer…', exact: true }).count()
  assert(copies === 1, 'Sauvegarder maintenant : la copie apparaît dans la liste du profil')
  const writesBefore = await page.evaluate(() => window.__syllogeRecette.select('SELECT COUNT(*) AS n FROM profiles')[0].n)
  await page.getByRole('button', { name: 'Restaurer…', exact: true }).first().click()
  await page.getByRole('region', { name: 'Contenu de la sauvegarde' }).waitFor()
  assert(Number(await page.evaluate(() => window.__syllogeRecette.select('SELECT COUNT(*) AS n FROM profiles')[0].n)) === Number(writesBefore), 'Ouvrir une copie : aperçu sans écriture')
  await page.getByRole('textbox', { name: 'Nom du profil restauré' }).fill('Copie restaurée depuis la liste')
  await page.getByRole('button', { name: 'Confirmer la restauration', exact: true }).click()
  await page.getByRole('heading', { name: 'Profil restauré', exact: true }).waitFor()
  const restored = await page.evaluate(() => {
    const db = window.__syllogeRecette
    const target = db.select("SELECT id FROM profiles WHERE name = 'Copie restaurée depuis la liste'")[0]
    const keys = ['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks']
    const count = id => keys.map(key => Number(db.select(`SELECT COUNT(*) AS n FROM ${key} WHERE profile_id = $1`, [id])[0].n))
    return { restored: count(target.id), source: count('qa-profile') }
  })
  assert(JSON.stringify(restored.restored) === JSON.stringify(restored.source), 'Restaurer une copie listée : les sept bibliothèques sont identiques à la source')
  await page.getByRole('button', { name: 'Ouvrir le profil restauré', exact: true }).click()

  // 4. Recherche de sauvegardes : la plus récente est proposée, jamais sélectionnée d'office.
  await openSettings()
  await nav('Sauvegarde').click()
  const source = await page.evaluate(async () => {
    const { libraryRepository } = await import('/src/data/libraryRepository.ts')
    const { createLibraryDocument, serializeLibraryDocument } = await import('/src/domain/libraryDocument.ts')
    const library = await libraryRepository.loadLibrary('qa-profile')
    const recent = createLibraryDocument(library, '2026-10-21T08:00:00.000Z')
    const old = createLibraryDocument(library, '2026-09-01T08:00:00.000Z')
    const invoke = window.__TAURI_INTERNALS__.invoke
    window.__searchTest = { writes: 0 }
    window.__TAURI_INTERNALS__.invoke = async (cmd, args, ...rest) => {
      if (cmd === 'find_backup_candidates') return {
        candidates: [
          { fileName: 'sylloge-sauvegarde-2026-09-01.json', location: 'Documents', modifiedAt: 2, contents: serializeLibraryDocument(old) },
          { fileName: 'sylloge-sauvegarde-2026-10-21.json', location: 'iCloud Drive › Sylloge', modifiedAt: 1, contents: serializeLibraryDocument(recent) },
          { fileName: 'sylloge-notes.json', location: 'Bureau', modifiedAt: 3, contents: '{"pas":"une sauvegarde"}' },
        ],
        unreadableLocations: ['Téléchargements'],
      }
      if (['create_profile', 'import_library_document_into_empty_profile'].includes(cmd)) window.__searchTest.writes += 1
      return invoke(cmd, args, ...rest)
    }
    return true
  })
  assert(source, 'Recherche simulée installée')
  await page.getByRole('button', { name: 'Restaurer une sauvegarde', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Rechercher sur ce Mac', exact: true }).click()
  const found = page.getByRole('region', { name: 'Sauvegarde la plus récente trouvée' })
  await found.waitFor()
  const foundText = await found.innerText()
  assert(/21 octobre 2026/.test(foundText) && /iCloud Drive › Sylloge/.test(foundText), 'Recherche : la plus récente selon la date interne (pas la date du fichier) est proposée avec son emplacement')
  assert(await page.getByRole('button', { name: 'Confirmer la restauration', exact: true }).isDisabled(), 'Recherche : aucune sauvegarde sélectionnée d’office')
  assert(/Téléchargements/.test(await page.getByRole('dialog').innerText()), 'Recherche : les emplacements refusés par macOS sont signalés')
  assert(await page.getByText('Autres sauvegardes trouvées · 1').count() === 1, 'Recherche : le JSON non Sylloge est écarté, l’ancienne copie reste disponible')
  await found.getByRole('button', { name: 'Utiliser cette sauvegarde', exact: true }).click()
  assert(await page.getByRole('button', { name: 'Confirmer la restauration', exact: true }).isEnabled(), 'Recherche : sélection explicite puis confirmation possible')
  assert(await page.evaluate(() => window.__searchTest.writes) === 0, 'Recherche et sélection : aucune écriture avant confirmation')
  await page.keyboard.press('Escape')

  // 5. Général : défilement automatique de la une, persistant.
  await nav('Général').click()
  const toggle = page.getByRole('switch', { name: 'Défilement automatique de « À la une »' })
  assert(await toggle.isChecked(), 'Général : défilement automatique activé par défaut')
  await toggle.click()
  assert(await page.evaluate(() => localStorage.getItem('sylloge-home-autoplay')) === 'off', 'Général : préférence enregistrée sur cet appareil')
  await page.getByRole('button', { name: 'Retour à la bibliothèque' }).click().catch(() => {})
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
  await page.locator('.atrium-home').waitFor()
  // La une se construit après migration et chargement des bibliothèques.
  await page.getByRole('button', { name: 'Œuvre suivante' }).waitFor({ timeout: 20000 })
  assert(await page.getByRole('button', { name: 'Mettre en pause le défilement' }).count() === 0, 'Accueil : sans défilement automatique, pas de bouton pause, flèches conservées')
  await page.evaluate(() => localStorage.removeItem('sylloge-home-autoplay'))

  // 6. Importer et exporter : une rangée par bibliothèque, actions présentes.
  await openSettings()
  await nav('Importer et exporter').click()
  for (const library of ['Films', 'Séries', 'Animation japonaise', 'Livres', 'Mangas', 'Jeux', 'Art']) {
    const libraryRow = page.locator('.settings-row', { has: page.locator('b', { hasText: new RegExp(`^${library}$`) }) })
    assert(await libraryRow.getByRole('button', { name: /^Importer/ }).count() === 1 && await libraryRow.getByRole('button', { name: /^Exporter/ }).count() === 1, `Importer et exporter : ${library} a ses deux actions`)
  }
  // Le profil entier se sauvegarde, se restaure et s'exporte depuis Sauvegarde : plus de rangée qui ne fait que renvoyer.
  assert(await page.getByRole('button', { name: 'Ouvrir Sauvegarde', exact: true }).count() === 0 && await page.getByRole('heading', { name: 'Tout le profil', exact: true }).count() === 0, 'Importer et exporter : aucune rangée « Tout le profil » qui ne fait que renvoyer vers Sauvegarde')
  assert(await page.getByRole('heading', { name: 'Par bibliothèque', exact: true }).count() === 1, 'Importer et exporter : seul le groupe « Par bibliothèque » reste')
  await nav('Sauvegarde').click()
  assert(await page.getByRole('heading', { level: 1, name: 'Sauvegarde' }).count() === 1, 'Sauvegarde : reste atteignable depuis la navigation des réglages')

  // 7. Premier lancement : choisir « Restaurer Sylloge » lance la recherche et propose la plus récente.
  const recentDocument = await page.evaluate(async () => {
    const { libraryRepository } = await import('/src/data/libraryRepository.ts')
    const { createLibraryDocument, serializeLibraryDocument } = await import('/src/domain/libraryDocument.ts')
    return serializeLibraryDocument(createLibraryDocument(await libraryRepository.loadLibrary('qa-profile'), '2026-10-21T08:00:00.000Z'))
  })
  await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=onboarding')
  await page.getByRole('textbox', { name: 'Pseudo ou prénom' }).waitFor()
  await page.evaluate((contents) => {
    const invoke = window.__TAURI_INTERNALS__.invoke
    window.__onboardingSearch = 0
    window.__TAURI_INTERNALS__.invoke = async (cmd, args, ...rest) => {
      if (cmd === 'find_backup_candidates') {
        window.__onboardingSearch += 1
        return { candidates: [{ fileName: 'sylloge-sauvegarde-2026-10-21-08h00-x.json', location: 'iCloud Drive › Sylloge', modifiedAt: 1, contents }], unreadableLocations: [] }
      }
      return invoke(cmd, args, ...rest)
    }
  }, recentDocument)
  await page.getByRole('textbox', { name: 'Pseudo ou prénom' }).fill('Nouveau Mac')
  await page.getByRole('button', { name: 'Continuer', exact: true }).click()
  assert(await page.evaluate(() => window.__onboardingSearch) === 0, 'Premier lancement : aucune recherche avant d’avoir choisi la restauration')
  await page.getByRole('radio', { name: /^Restaurer Sylloge/ }).click()
  await page.getByRole('region', { name: 'Sauvegarde la plus récente trouvée' }).waitFor()
  assert(await page.evaluate(() => window.__onboardingSearch) === 1, 'Premier lancement : recherche lancée une fois au choix de la restauration')
  assert(await page.getByRole('button', { name: 'Continuer', exact: true }).isDisabled(), 'Premier lancement : la sauvegarde trouvée attend un choix explicite')
  await page.getByRole('button', { name: 'Utiliser cette sauvegarde', exact: true }).click()
  assert(await page.getByRole('button', { name: 'Continuer', exact: true }).isEnabled(), 'Premier lancement : sauvegarde trouvée retenue après clic')

  assert(errors.length === 0, 'Aucune exception JavaScript')
  return JSON.stringify({ ok: true, count: checks.length, checks, errors })
}
