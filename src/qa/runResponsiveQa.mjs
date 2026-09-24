#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const qaBase = process.env.QA_BASE ?? 'http://127.0.0.1:5192/qa-integration.html'
const cdp = process.env.QA_CDP ?? 'http://127.0.0.1:9229'
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
const page = tabs.find((entry) => entry.type === 'page' && entry.url === 'about:blank') ?? tabs.find((entry) => entry.type === 'page')
if (!page) throw new Error('Aucune page Chrome disponible')
const client = new Cdp(page.webSocketDebuggerUrl)
await client.send('Page.enable')
await client.send('Runtime.enable')
await client.send('Log.enable')

const inspect = async () => {
  const response = await client.send('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `(() => {
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
      }).map((el) => ({ tag: el.tagName, cls: String(el.className), text: (el.textContent || '').trim().slice(0, 100), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }))
      const smallButtons = [...document.querySelectorAll('button')].filter(visible).map((el) => ({ text: (el.textContent || '').trim(), rect: el.getBoundingClientRect().toJSON() })).filter((item) => item.rect.width < 44 || item.rect.height < 44)
      const shell = {
        appBar: visible(document.querySelector('.mobile-app-bar')),
        bottom: visible(document.querySelector('.mobile-bottom-nav')),
        sidebar: visible(document.querySelector('.sidebar')),
        h1: document.querySelector('h1')?.textContent?.trim() || '',
        title: document.title,
        host: location.host,
      }
      const main = document.querySelector('.home-main, .library-main, .detail-page-main, .portability-main')
      return { viewport: innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > innerWidth, clippedText, smallButtons: smallButtons.slice(0, 20), smallButtonCount: smallButtons.length, links: [...document.querySelectorAll('a')].filter(visible).length, shell, mainRect: main?.getBoundingClientRect().toJSON() ?? null, textLength: document.body.innerText.length }
    })()`,
  })
  return response.result.value
}

const results = []
for (const viewport of [{ width: 390, height: 844, name: 'mobile' }, { width: 768, height: 1024, name: 'tablet' }, { width: 1440, height: 1000, name: 'desktop' }]) {
  await client.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 820 })
  await client.send('Page.navigate', { url: qaBase })
  await sleep(2200)
  const data = await inspect()
  results.push({ name: viewport.name, ...data })
  const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(path.join(outDir, `sylloge-responsive-${viewport.name}-${viewport.width}x${viewport.height}.png`), Buffer.from(shot.data, 'base64'))
}
const consoleErrors = client.events.filter((event) => event.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(event.params.type)).map((event) => ({ type: event.params.type, text: event.params.args?.map((arg) => arg.value ?? arg.description).join(' ') }))
const exceptions = client.events.filter((event) => event.method === 'Runtime.exceptionThrown').map((event) => event.params.exceptionDetails?.text || 'exception')
const report = { base: qaBase, results, consoleErrors, exceptions, generatedAt: new Date().toISOString() }
fs.writeFileSync(path.join(outDir, 'sylloge-responsive-qa-2026-09-24.json'), JSON.stringify(report, null, 2) + '\n')
client.close()
console.log(JSON.stringify(report, null, 2))
if (report.results.some((result) => result.overflow || result.clippedText.length) || consoleErrors.length || exceptions.length) process.exitCode = 1
