// Onboarding and settings transfer surfaces: real QA route, synthetic data only.
// Captures are written relative to the playwright-cli session's working directory.
// Open the session from the scratch directory first, so screenshots never land in the repository.
async page => {
  page.setDefaultTimeout(7000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const checks = []
  const results = []
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  const onboardingMetrics = (label, theme) => page.evaluate(({ label, theme }) => {
    const panel = document.querySelector('.onboarding-panel')
    const primary = document.querySelector('.onboarding-panel .primary-button')
    const box = primary?.getBoundingClientRect()
    return {
      label,
      theme: document.documentElement.dataset.theme,
      themeOk: document.documentElement.dataset.theme === theme,
      docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelOverflowX: panel.scrollWidth - panel.clientWidth,
      panelScrollsY: panel.scrollHeight > panel.clientHeight + 1,
      primaryText: primary?.textContent?.trim() ?? null,
      primaryFullyVisible: !!box && box.top >= 0 && box.bottom <= innerHeight,
      viewportHeight: innerHeight,
    }
  }, { label, theme })
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of [[1440, 900], [1000, 760]]) {
      const key = `${theme}-${width}`
      await page.setViewportSize({ width, height })
      await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=onboarding')
      await page.evaluate(value => localStorage.setItem('sylloge-theme', value), theme)
      await page.reload()
      await page.getByRole('textbox', { name: 'Pseudo ou prénom' }).fill('Camille')
      await page.screenshot({ path: `onb-profile-${key}.png` })
      results.push(await onboardingMetrics(`profile ${key}`, theme))
      await page.getByRole('button', { name: 'Continuer', exact: true }).click()
      await page.getByRole('radio', { name: /^Commencer à vide/ }).click()
      await page.screenshot({ path: `onb-library-${key}.png` })
      results.push(await onboardingMetrics(`library ${key}`, theme))
      await page.getByRole('radio', { name: /^Importer d’un autre service/ }).click()
      await page.screenshot({ path: `onb-service-${key}.png` })
      results.push(await onboardingMetrics(`service ${key}`, theme))
      await page.getByRole('radio', { name: /^Commencer à vide/ }).click()
      await page.getByRole('button', { name: 'Continuer', exact: true }).click()
      await page.getByRole('heading', { name: 'Protéger le profil', exact: true }).waitFor()
      await page.screenshot({ path: `onb-backup-${key}.png` })
      results.push(await onboardingMetrics(`backup ${key}`, theme))
      // Settings surface, same theme and viewport.
      await page.goto('http://127.0.0.1:5173/qa-app.html?scenario=full')
      await page.getByRole('button', { name: 'Paramètres', exact: true }).click()
      await page.locator('aside').getByRole('button', { name: 'Sauvegarde', exact: true }).click()
      await page.getByRole('button', { name: 'Restaurer une sauvegarde', exact: true }).waitFor()
      await page.screenshot({ path: `settings-transfer-${key}.png` })
      results.push(await page.evaluate(({ key, theme }) => {
        const main = document.querySelector('.portability-main')
        return {
          label: `settings ${key}`,
          themeOk: document.documentElement.dataset.theme === theme,
          docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          mainOverflowX: main.scrollWidth - main.clientWidth,
          restoreVisible: [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Restaurer une sauvegarde' && button.getBoundingClientRect().bottom <= innerHeight),
        }
      }, { key, theme }))
    }
  }
  assert(results.every(item => item.themeOk !== false), 'Thème réel vérifié sur chaque capture')
  assert(results.every(item => (item.docOverflowX ?? 0) <= 1 && (item.panelOverflowX ?? 0) <= 1 && (item.mainOverflowX ?? 0) <= 1), 'Aucun débordement horizontal')
  assert(errors.length === 0, 'Aucune exception JavaScript pendant les captures')
  return { ok: true, count: checks.length, checks, errors, results }
}
