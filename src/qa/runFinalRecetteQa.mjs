#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const qaBase = process.env.QA_BASE ?? 'http://127.0.0.1:5192/qa-integration.html'
const cdp = process.env.QA_CDP ?? 'http://127.0.0.1:9230'
const outDir = path.resolve('docs/qa')
fs.mkdirSync(outDir, { recursive: true })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const getJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.json()
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.nextId = 0
    this.pending = new Map()
    this.events = []
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)))
        else pending.resolve(message.result)
      } else {
        this.events.push(message)
      }
    })
  }
  async send(method, params = {}) {
    await this.ready
    const id = ++this.nextId
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }
  close() { this.ws.close() }
}

const tabs = await getJson(`${cdp}/json/list`)
const page = tabs.find((entry) => entry.type === 'page')
if (!page) throw new Error('Aucune page Chrome disponible')
const client = new Cdp(page.webSocketDebuggerUrl)
await client.send('Page.enable')
await client.send('Runtime.enable')
await client.send('Log.enable')

const evaluate = async (expression) => {
  const response = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
  return response.result.value
}

const inspect = () => evaluate(`(() => {
  const visible = (el) => {
    if (!el) return false
    const style = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0
  }
  const textNodes = [...document.querySelectorAll('body *')].filter((el) => visible(el) && el.children.length === 0 && (el.textContent || '').trim())
  const clippedText = textNodes.filter((el) => {
    const style = getComputedStyle(el)
    return ((el.scrollHeight > el.clientHeight + 1 && style.overflowY !== 'visible') || (el.scrollWidth > el.clientWidth + 1 && style.overflowX !== 'visible')) && !el.classList.contains('visually-hidden')
  }).map((el) => ({ tag: el.tagName, cls: String(el.className), text: (el.textContent || '').trim().slice(0, 120), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }))
  const controls = [...document.querySelectorAll('button, a[href], input, select, textarea')].filter(visible).map((el) => ({ tag: el.tagName, text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim(), rect: el.getBoundingClientRect().toJSON() }))
  const smallControls = controls.filter((item) => item.rect.width < 30 || item.rect.height < 30)
  const unlabeledControls = controls.filter((item) => !item.text && !item.rect.width && !item.rect.height)
  const main = document.querySelector('.home-main, .qa-library')
  const activeView = document.querySelector('.library-views .filter.active')?.textContent?.trim() || null
  return {
    title: document.title,
    host: location.host,
    h1: document.querySelector('h1')?.textContent?.trim() || '',
    theme: document.documentElement.dataset.theme || 'light',
    viewport: { width: innerWidth, height: innerHeight },
    document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > innerWidth },
    main: main ? { rect: main.getBoundingClientRect().toJSON(), clientWidth: main.clientWidth, scrollWidth: main.scrollWidth, clientHeight: main.clientHeight, scrollHeight: main.scrollHeight, overflowX: main.scrollWidth > main.clientWidth + 1, overflowY: main.scrollHeight > main.clientHeight + 1 } : null,
    clippedText,
    smallControls: smallControls.slice(0, 30),
    smallControlCount: smallControls.length,
    unlabeledControls,
    activeView,
    nav: {
      sidebar: visible(document.querySelector('.sidebar')),
      appBar: visible(document.querySelector('.mobile-app-bar')),
      bottom: visible(document.querySelector('.mobile-bottom-nav')),
      drawer: visible(document.querySelector('.mobile-drawer')),
    },
    lanes: [...document.querySelectorAll('.at-lane')].map((el) => ({ label: el.getAttribute('aria-label'), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, scrollable: el.scrollWidth > el.clientWidth + 1, tabIndex: el.tabIndex })),
    controls: controls.length,
  }
})()`)

const clickSelector = async (selector) => {
  const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true })()`)
  if (!ok) throw new Error(`Sélecteur introuvable: ${selector}`)
  await sleep(250)
}

const screenshot = async (name) => {
  const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(path.join(outDir, name), Buffer.from(shot.data, 'base64'))
}

const navToScreen = async (screen) => {
  const map = { home: 'Ma bibliothèque', films: 'Films', series: 'Séries', books: 'Livres', games: 'Jeux', artworks: 'Art' }
  await clickSelector(`[data-qa-screen="${screen}"]`)
  const expected = map[screen]
  await sleep(500)
  const h1 = await evaluate(`document.querySelector('h1')?.textContent?.trim() || ''`)
  if (expected && h1 !== expected) throw new Error(`Écran ${screen}: h1 attendu ${expected}, reçu ${h1}`)
}

const results = []
for (const viewport of [
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 768, height: 1024, mobile: true },
  { name: 'desktop', width: 1440, height: 1000, mobile: false },
]) {
  await client.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile })
  await client.send('Page.navigate', { url: qaBase })
  await sleep(1600)
  const identity = await evaluate(`({ title: document.title, host: location.host, h1: document.querySelector('h1')?.textContent?.trim() || '' })`)
  if (identity.title !== 'Sylloge — recette intégration' || identity.h1 !== 'Ma bibliothèque') throw new Error(`Identité de page incorrecte: ${JSON.stringify(identity)}`)

  for (const screen of ['home', 'films', 'series', 'books', 'games', 'artworks']) {
    await navToScreen(screen)
    const data = await inspect()
    results.push({ viewport: viewport.name, screen, ...data })
    if (screen === 'home' || (viewport.name === 'desktop' && screen === 'films')) await screenshot(`sylloge-final-${viewport.name}-${screen}-${viewport.width}x${viewport.height}.png`)
  }

  if (viewport.name === 'mobile') {
    await clickSelector('[data-qa-screen="home"]')
    await clickSelector('[aria-label="Ouvrir le menu"]')
    await sleep(250)
    const drawer = await inspect()
    results.push({ viewport: viewport.name, screen: 'drawer', ...drawer })
    await screenshot('sylloge-final-mobile-drawer-390x844.png')
    const trap = await evaluate(`(() => {
      const drawer = document.querySelector('.mobile-drawer')
      if (!drawer) return { open: false }
      const focusable = [...drawer.querySelectorAll('button:not([disabled])')]
      return { open: true, activeLabel: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() || '', count: focusable.length, bodyOverflow: document.body.style.overflow }
    })()`)
    results.push({ viewport: viewport.name, screen: 'drawer-focus', identity: { title: 'Sylloge — recette intégration', host: '127.0.0.1:5192', h1: 'Ma bibliothèque' }, drawer: trap, interactions: { escapeCloses: false } })
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await sleep(250)
    const closed = await evaluate(`!document.querySelector('.mobile-drawer')`)
    results.push({ viewport: viewport.name, screen: 'drawer-escape', identity: { title: 'Sylloge — recette intégration', host: '127.0.0.1:5192', h1: 'Ma bibliothèque' }, interactions: { escapeCloses: closed } })
  }

  if (viewport.name === 'desktop') {
    await navToScreen('films')
    const interaction = { before: await evaluate(`document.querySelector('.library-views .filter.active')?.textContent?.trim() || ''`) }
    await clickSelector('[data-view-id="recent"]')
    interaction.after = await evaluate(`document.querySelector('.library-views .filter.active')?.textContent?.trim() || ''`)
    await clickSelector('[aria-label="Filtrer"]')
    interaction.filterDialog = await evaluate(`document.querySelector('[role="dialog"][aria-label="Filtres"]')?.getAttribute('aria-label') || null`)
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await sleep(200)
    interaction.escapeCloses = await evaluate(`!document.querySelector('[role="dialog"][aria-label="Filtres"]')`)
    await clickSelector('[aria-label="Trier"]')
    interaction.sortDialog = await evaluate(`document.querySelector('[role="dialog"][aria-label="Tri"]')?.getAttribute('aria-label') || null`)
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    results.push({ viewport: viewport.name, screen: 'interactions', identity: { title: 'Sylloge — recette intégration', host: '127.0.0.1:5192', h1: 'Films' }, interactions: interaction })

    await clickSelector('.sidebar-settings-link')
    await sleep(250)
    const dark = await inspect()
    await screenshot('sylloge-final-desktop-dark-1440x1000.png')
    results.push({ viewport: viewport.name, screen: 'dark', ...dark })
  }
}

const consoleErrors = client.events.filter((event) => event.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(event.params.type)).map((event) => ({ type: event.params.type, text: event.params.args?.map((arg) => arg.value ?? arg.description).join(' ') }))
const logErrors = client.events.filter((event) => event.method === 'Log.entryAdded' && ['error', 'warning'].includes(event.params.entry.level)).map((event) => ({ type: event.params.entry.level, text: event.params.entry.text }))
const exceptions = client.events.filter((event) => event.method === 'Runtime.exceptionThrown').map((event) => event.params.exceptionDetails?.text || 'exception')
const failures = results.filter((result) => result.document?.overflow || result.main?.overflowX || result.clippedText?.length || result.unlabeledControls?.length)
const report = { base: qaBase, results, failures, consoleErrors, logErrors, exceptions, generatedAt: new Date().toISOString() }
fs.writeFileSync(path.join(outDir, 'sylloge-final-recette-qa-2026-09-24.json'), JSON.stringify(report, null, 2) + '\n')
client.close()
console.log(JSON.stringify({ results: results.length, failures: failures.length, consoleErrors: consoleErrors.length, logErrors: logErrors.length, exceptions: exceptions.length, report: path.join(outDir, 'sylloge-final-recette-qa-2026-09-24.json') }, null, 2))
if (failures.length || consoleErrors.length || logErrors.length || exceptions.length) process.exitCode = 1
