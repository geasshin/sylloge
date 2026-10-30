// Proposition du récapitulatif de l’année (qa-app.html). Gardes : la petite fenêtre qui s’ouvre après la
// première peinture le 12 décembre avec une vraie année, le seuil de vingt œuvres datées, la fenêtre du
// 10 décembre au 31 janvier, la mémoire par appareil, la fenêtre du bilan qu'elle ouvre, Échap, l'anglais
// et l'absence pendant le premier lancement.
//
// Usage : playwright-cli -s=recap --raw run-code --filename=scripts/qa-recap-offer.js   (`ok` doit valoir true)
// Le harnais simule la date par `?recapOffer=AAAA-MM-JJ` : la machine garde son horloge.
async page => {
  page.setDefaultTimeout(15000)
  const checks = []
  const errors = []
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name) }
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|net::ERR|CORS|access control/i.test(message.text())) errors.push(message.text().slice(0, 200)) })

  // Les visuels de la recette : une couleur par adresse, aucun appel externe (aucun visuel ne compte ici,
  // mais l'accueil en charge).
  await page.route('https://picsum.photos/**', route => {
    let hash = 0
    for (const char of route.request().url()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="hsl(${hash % 360} 50% 38%)"/></svg>`,
    })
  })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })

  const BASE = 'http://127.0.0.1:5173/qa-app.html'
  const KEY = 'sylloge-recap-offered:qa-profile'
  /** Le délai de la proposition est de 1,5 s : toute absence s'observe au-delà de 3 s. */
  const BEYOND_DELAY = 3200
  const offer = () => page.getByRole('dialog', { name: /Votre année \d{4} dans Sylloge|Your \d{4} in Sylloge/ })
  const recap = () => page.getByRole('dialog', { name: /Mon année \d{4}|My year \d{4}/ })

  /** Une visite neuve : la mémoire de la proposition est effacée au chargement, bien avant son délai. */
  const start = async (query, lang = 'fr') => {
    await page.goto(`${BASE}?${query}&lang=${lang}`)
    await page.evaluate(key => localStorage.removeItem(key), KEY)
    await page.getByRole('heading', { level: 1 }).first().waitFor()
  }
  /** Une visite qui garde la mémoire de l'appareil (rechargement dans la même session). */
  const reload = async (query, lang = 'fr') => {
    await page.goto(`${BASE}?${query}&lang=${lang}`)
    await page.getByRole('heading', { level: 1 }).first().waitFor()
  }
  /** Absence observée après le délai : une absence constatée trop tôt ne prouverait rien. */
  const absent = async (what) => {
    await page.waitForTimeout(BEYOND_DELAY)
    assert(await offer().count() === 0, `${what} : aucune proposition`)
  }

  // ── 1. Le 12 décembre, une année de 37 œuvres : la petite fenêtre s’ouvre d'elle-même ────────────
  await start('scenario=full&recapOffer=2026-12-12')
  await page.waitForTimeout(300)
  assert(await offer().count() === 0, 'La proposition ne s’ouvre pas dans la seconde qui suit la première peinture')
  await offer().waitFor()
  const text = await offer().innerText()
  assert(/Votre année 2026 dans Sylloge/i.test(text), 'Le titre nomme l’année : « Votre année 2026 dans Sylloge »')
  assert(/37 œuvres terminées en 2026 : votre récapitulatif est prêt\./.test(text), 'Le décompte est celui du récapitulatif (37 œuvres)')
  assert(/Il reste disponible dans Paramètres › Récapitulatif de l’année\./.test(text), 'La mention discrète renvoie aux Paramètres')
  assert(await offer().getByRole('button', { name: 'Voir mon récapitulatif', exact: true }).count() === 1, 'L’action principale est « Voir mon récapitulatif »')
  assert(await offer().getByRole('button', { name: 'Plus tard', exact: true }).count() === 1, 'L’action secondaire est « Plus tard »')
  assert(await page.evaluate(key => localStorage.getItem(key), KEY) === '2026', 'La mémoire de l’appareil est posée dès l’affichage')
  const box = await offer().boundingBox()
  const view = page.viewportSize()
  assert(box.width === 440 && Math.abs((view.width - box.width) / 2 - box.x) <= 1, `La fenêtre est compacte (${box.width} px) et centrée`)
  assert(box.y + box.height < view.height, 'La fenêtre tient en hauteur, sans déborder de la vue')

  // ── 2. « Plus tard » ferme, et la proposition ne revient pas dans la session ───────────────────
  await offer().getByRole('button', { name: 'Plus tard', exact: true }).click()
  await offer().waitFor({ state: 'detached' })
  assert(true, '« Plus tard » ferme la proposition')
  await page.waitForTimeout(BEYOND_DELAY)
  assert(await offer().count() === 0, 'Après « Plus tard », elle ne revient pas dans la même session')

  // ── 3. La mémoire tient au rechargement : une seule apparition par année et par appareil ──────
  await reload('scenario=full&recapOffer=2026-12-12')
  await absent('Mémoire déjà posée pour 2026')

  // ── 4. Le 9 décembre, l’année n'est pas ouverte : rien ────────────────────────────────────────
  await start('scenario=full&recapOffer=2026-12-09')
  await absent('Le 9 décembre 2026')

  // ── 5. Le 31 janvier, la fenêtre est encore ouverte ; le 1er février, elle est fermée ────────
  await start('scenario=full&recapOffer=2027-01-31')
  await offer().waitFor()
  assert(/Votre année 2026 dans Sylloge/i.test(await offer().innerText()), 'Le 31 janvier 2027, la proposition porte encore sur 2026')

  await start('scenario=full&recapOffer=2027-02-01')
  await absent('Le 1er février 2027')

  // ── 6. Le seuil : dix-neuf œuvres ne font pas une année, vingt en font une ───────────────────
  await start('scenario=recap&recapWorks=19&recapOffer=2026-12-12')
  await absent('Dix-neuf œuvres datées')

  await start('scenario=recap&recapWorks=20&recapOffer=2026-12-12')
  await offer().waitFor()
  assert(/20 œuvres terminées en 2026/.test(await offer().innerText()), 'Vingt œuvres datées suffisent : la proposition s’ouvre')

  // ── 7. « Voir mon récapitulatif » ouvre le bilan de la bonne année ───────────────────────────
  await start('scenario=full&recapOffer=2026-12-12')
  await offer().waitFor()
  await offer().getByRole('button', { name: 'Voir mon récapitulatif', exact: true }).click()
  await recap().waitFor()
  await recap().locator('canvas.share-card-canvas').waitFor()
  assert(/mon année 2026/i.test(await recap().innerText()), '« Voir mon récapitulatif » ouvre « Mon année 2026 »')
  assert(await offer().count() === 0, 'La proposition laisse la place au bilan')
  await page.keyboard.press('Escape')
  await recap().waitFor({ state: 'detached' })
  assert(true, 'Échap ferme le bilan')

  // ── 8. Échap ferme la proposition elle-même, sans ouvrir de bilan ────────────────────────────
  await start('scenario=full&recapOffer=2026-12-12')
  await offer().waitFor()
  await page.keyboard.press('Escape')
  await offer().waitFor({ state: 'detached' })
  assert(await recap().count() === 0, 'Échap ferme la proposition, sans ouvrir le bilan')

  // ── 9. Une autre fenêtre est ouverte : la proposition ne se pose pas par-dessus ─────────────
  await start('scenario=full&recapOffer=2026-12-12')
  await page.locator('aside').getByRole('button', { name: 'Films', exact: true }).click()
  await page.getByRole('button', { name: 'Ajouter un film', exact: true }).click()
  await page.waitForTimeout(BEYOND_DELAY)
  assert(await page.getByRole('dialog', { name: 'Ajouter un film' }).count() === 1, 'L’autre fenêtre reste ouverte pendant l’attente')
  assert(await offer().count() === 0, 'Une autre fenêtre est ouverte : la proposition ne s’ouvre pas par-dessus')
  assert(await page.evaluate(key => localStorage.getItem(key), KEY) === null, 'La proposition n’est pas consommée : elle reviendra à la prochaine ouverture')
  await page.keyboard.press('Escape')

  // ── 10. Une mise à jour disponible en même temps : chacune reste à sa place ──────────────────
  await start('scenario=full&recapOffer=2026-12-12&update=0.6.99')
  await offer().waitFor()
  await page.locator('.update-notice').waitFor()
  const layout = await page.evaluate(() => {
    const notice = document.querySelector('.update-notice').getBoundingClientRect()
    const dialog = document.querySelector('.transfer-dialog').getBoundingClientRect()
    return {
      right: Math.round(innerWidth - notice.right),
      bottom: Math.round(innerHeight - notice.bottom),
      overlapping: !(notice.right < dialog.left || notice.left > dialog.right || notice.bottom < dialog.top || notice.top > dialog.bottom),
      dialogs: document.querySelectorAll('[aria-modal="true"]').length,
    }
  })
  assert(layout.right === 24 && layout.bottom === 24, `L’annonce de mise à jour garde son coin (${layout.right} px, ${layout.bottom} px)`)
  assert(layout.overlapping === false, 'La proposition et l’annonce de mise à jour ne se recouvrent pas')
  assert(layout.dialogs === 1, 'Une seule fenêtre modale : l’annonce ne se transforme pas en dialogue')

  // ── 11. Anglais : la petite fenêtre est entièrement traduite ─────────────────────────────────
  await start('scenario=full&recapOffer=2026-12-12', 'en')
  await offer().waitFor()
  const english = await offer().innerText()
  assert(/Your 2026 in Sylloge/i.test(english), 'Anglais : le titre est traduit')
  assert(/37 works finished in 2026: your year in review is ready\./.test(english), 'Anglais : le décompte est traduit')
  assert(/It stays available in Settings › Year in review\./.test(english), 'Anglais : la mention des réglages est traduite')
  assert(await offer().getByRole('button', { name: 'See my year in review', exact: true }).count() === 1, 'Anglais : l’action principale est traduite')
  assert(await offer().getByRole('button', { name: 'Later', exact: true }).count() === 1, 'Anglais : « Plus tard » devient « Later »')
  assert(!/œuvres|Paramètres|Récapitulatif|Votre année|Voir mon|Plus tard/.test(english), 'Anglais : aucun reste de français')

  // ── 12. Au premier lancement, aucun profil : aucune proposition ─────────────────────────────
  await start('scenario=onboarding&recapOffer=2026-12-12')
  await absent('Premier lancement')

  await page.unroute('https://picsum.photos/**')
  await page.evaluate(key => localStorage.removeItem(key), KEY)
  assert(errors.length === 0, `Aucune erreur de page : ${errors.join(' | ')}`)
  return JSON.stringify({ ok: true, checks: checks.length, list: checks, errors })
}
