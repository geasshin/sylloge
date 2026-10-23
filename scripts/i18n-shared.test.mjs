import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const cacheDir = mkdtempSync(join(tmpdir(), 'sylloge-i18n-shared-'))
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, envFile: false, cacheDir, plugins: [react()], logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false, watch: null } })
const previousDocument = globalThis.document
const previousElement = globalThis.HTMLElement
try {
  globalThis.document = { activeElement: null, documentElement: { lang: 'fr' } }
  globalThis.HTMLElement = class {}
  const { setLanguage } = await server.ssrLoadModule('/src/i18n/core.ts')
  const { AccessibleDialog } = await server.ssrLoadModule('/src/components/AccessibleDialog.tsx')
  await test('La fermeture des assistants est annoncée en anglais sans traduire leur contenu', () => {
    setLanguage('en')
    const html = renderToStaticMarkup(createElement(AccessibleDialog, { title: 'En cours', description: 'Citation personnelle en français', closeDisabled: false, onClose() {} }, 'Tous'))
    assert.match(html, /aria-label="Close assistant"/)
    assert.match(html, />En cours<\/h2>/)
    assert.match(html, /Citation personnelle en français/)
    assert.match(html, />Tous<\/div>/)
  })
} finally {
  globalThis.document = previousDocument
  globalThis.HTMLElement = previousElement
  await server.close()
  rmSync(cacheDir, { recursive: true, force: true })
}
