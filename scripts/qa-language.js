// Langue de l'interface (qa-app.html, données synthétiques, aucune donnée réelle) :
// détection de navigator.languages, choix dans Paramètres › Général, mémorisation, changement sans rechargement,
// premier écran sans perte de saisie, aucune erreur console. Serveur Vite attendu sur 5173.
// Usage : playwright-cli -s=<session> --raw run-code --filename=scripts/qa-language.js   (résultat JSON, `ok` doit valoir true)
async (page) => {
  const BASE = 'http://127.0.0.1:5173/qa-app.html'
  const browser = page.context().browser()
  const assertions = []
  const failures = []
  const check = (condition, label, detail) => { (condition ? assertions : failures).push(detail === undefined ? label : `${label} :: ${JSON.stringify(detail)}`) }

  const open = async (query, languages) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    if (languages) {
      await context.addInitScript((list) => {
        Object.defineProperty(navigator, 'languages', { configurable: true, get: () => list })
        Object.defineProperty(navigator, 'language', { configurable: true, get: () => list[0] })
      }, languages)
    }
    const errors = []
    const tab = await context.newPage()
    tab.setDefaultTimeout(9000)
    tab.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    tab.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
    await tab.goto(`${BASE}?${query}`, { waitUntil: 'domcontentloaded' })
    await tab.waitForTimeout(1500)
    return { context, tab, errors }
  }
  const stored = (tab) => tab.evaluate(() => localStorage.getItem('sylloge-language'))
  const htmlLang = (tab) => tab.evaluate(() => document.documentElement.lang)
  const nav = (tab) => tab.getByRole('navigation', { name: /^(Navigation principale|Main navigation)$/ })
  const homeLabel = async (tab) => {
    const button = nav(tab).getByRole('button', { name: /^(Accueil|Home)$/ })
    await button.waitFor()
    return (await button.getAttribute('aria-label')) || (await button.textContent()).trim()
  }

  // 1. Détection : la première langue prise en charge de la liste l'emporte, et rien n'est mémorisé.
  for (const [languages, expected, label] of [
    [['fr-CA', 'en-US'], 'fr', 'Accueil'],
    [['en-US', 'fr-FR'], 'en', 'Home'],
    [['de-DE'], 'en', 'Home'],
    [['ja-JP', 'fr-FR'], 'fr', 'Accueil'],
  ]) {
    const { context, tab, errors } = await open('scenario=full&lang=auto', languages)
    check(await homeLabel(tab) === label, `détection ${JSON.stringify(languages)} : « ${label} »`)
    check(await htmlLang(tab) === expected, `détection ${JSON.stringify(languages)} : <html lang=${expected}>`, await htmlLang(tab))
    check(await stored(tab) === null, `détection ${JSON.stringify(languages)} : rien de mémorisé`)
    check(errors.length === 0, `détection ${JSON.stringify(languages)} : aucune erreur console`, errors)
    await context.close()
  }

  // 2. Le harnais reste en français par défaut (les scripts qa-*.js sont écrits en français), sans toucher à un choix mémorisé.
  {
    const { context, tab } = await open('scenario=full', ['en-US'])
    check(await homeLabel(tab) === 'Accueil', 'harnais : français par défaut malgré un navigateur anglais')
    await context.close()
  }

  // 3. Choix dans Paramètres › Général : immédiat, sans rechargement, mémorisé, conservé au rechargement.
  {
    const { context, tab, errors } = await open('scenario=full&lang=en', ['fr-FR'])
    check(await homeLabel(tab) === 'Home', '?lang=en impose l’anglais')
    await tab.evaluate(() => { window.__sansRechargement = 'présent' })
    await tab.getByRole('button', { name: 'Settings', exact: true }).click()
    await tab.getByRole('button', { name: 'General', exact: true }).click()
    const select = tab.getByRole('combobox', { name: /^Application language$/ })
    await select.waitFor()
    check(await select.inputValue() === 'en', 'le sélecteur affiche English')
    const options = await select.locator('option').allTextContents()
    check(JSON.stringify(options) === JSON.stringify(['Français', 'English']), 'options écrites dans leur propre langue', options)
    await select.selectOption('fr')
    await tab.getByRole('heading', { level: 2, name: 'Langue', exact: true }).waitFor()
    check(await tab.getByRole('heading', { level: 2, name: 'Langue', exact: true }).count() === 1, 'la page Général est en français')
    check(await htmlLang(tab) === 'fr', '<html lang> passe à fr')
    check(await stored(tab) === 'fr', 'choix explicite mémorisé')
    check(await tab.evaluate(() => window.__sansRechargement) === 'présent', 'aucun rechargement de la page')
    const frenchSelect = tab.getByRole('combobox', { name: /^Langue de l’application$/ })
    check(await frenchSelect.inputValue() === 'fr', 'le même sélecteur, nommé en français')
    // Rechargement sans ?lang : c'est le cas réel d'un redémarrage (le choix mémorisé doit gagner).
    await tab.goto(`${BASE}?scenario=full`, { waitUntil: 'domcontentloaded' })
    await tab.waitForTimeout(1200)
    check(await htmlLang(tab) === 'fr', 'le choix survit au rechargement malgré l’absence de ?lang', await htmlLang(tab))
    check(await stored(tab) === 'fr', 'la préférence reste mémorisée après rechargement', await stored(tab))
    check(errors.length === 0, 'choix de langue : aucune erreur console', errors)
    await context.close()
  }

  // 4. Premier lancement : sélecteur avant le profil, saisie conservée au changement de langue.
  {
    const { context, tab, errors } = await open('scenario=onboarding&lang=en', ['en-US'])
    const select = tab.getByRole('combobox', { name: /^Application language$/ })
    await select.waitFor()
    const name = tab.getByRole('textbox').first()
    await name.waitFor({ state: 'visible' })
    await name.fill('Camille')
    const continueButton = tab.getByRole('button', { name: /^Continue$/ })
    check(await continueButton.isEnabled(), 'Continue activé avec un nom')
    await select.selectOption('fr')
    await tab.getByRole('heading', { name: 'Créer le profil' }).waitFor()
    check(await tab.getByRole('textbox').first().inputValue() === 'Camille', 'le nom saisi est conservé après le changement de langue')
    check(await tab.getByRole('button', { name: 'Continuer', exact: true }).isEnabled(), 'Continuer reste actif')
    await tab.getByRole('combobox', { name: /^Langue de l’application$/ }).selectOption('en')
    await tab.getByRole('heading', { name: 'Create profile' }).waitFor()
    check(await tab.getByRole('textbox').first().inputValue() === 'Camille', 'le nom saisi survit à un second changement')
    check(errors.length === 0, 'premier lancement : aucune erreur console', errors)
    await context.close()
  }

  return JSON.stringify({ ok: failures.length === 0, assertions: assertions.length, failures })
}
