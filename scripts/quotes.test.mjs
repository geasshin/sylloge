import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const cacheDir = mkdtempSync(join(tmpdir(), 'sylloge-quotes-'))
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, envFile: false,
  cacheDir, plugins: [react()], logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
})
try {
  const { BookForm } = await server.ssrLoadModule('/src/components/BookForm.tsx')
  await test('Citations accessibles dès la création, même dans un livre ou manga à lire', () => {
    for (const category of ['livre', 'manga']) {
      const html = renderToStaticMarkup(createElement(BookForm, { creationCategory: category, onSave: async () => {}, onCancel() {} }))
      assert.match(html, /Ajouter une citation/, category)
      assert.match(html, /Citations/, category)
    }
  })
  await test('Une édition conserve identifiants et dates des citations inchangées, doublons et ordre compris', async () => {
    const { reconcileBookQuotes } = await server.ssrLoadModule('/src/domain/book.ts')
    assert.equal(typeof reconcileBookQuotes, 'function', 'Réconciliation explicite des citations de lecture')
    const previous = [
      { id: 'q1', bookId: 'b', body: '  Étoiles\n\t夜  ', position: 0, createdAt: '2020-01-01' },
      { id: 'q2', bookId: 'b', body: 'identique', position: 1, createdAt: '2020-01-02' },
      { id: 'q3', bookId: 'b', body: 'identique', position: 2, createdAt: '2020-01-03' },
    ]
    const before = structuredClone(previous)
    let nextId = 0
    const result = reconcileBookQuotes('b', ['identique', '  Étoiles\n\t夜  ', 'identique', '\t', 'nouveau'], '2026-10-22', () => `new-${++nextId}`, previous)
    assert.deepEqual(result.map(q => q.id), ['q2', 'q1', 'q3', 'new-1'])
    assert.deepEqual(result.map(q => q.position), [0, 1, 2, 3])
    assert.equal(result[1].body, previous[0].body)
    assert.equal(result[0].createdAt, '2020-01-02')
    assert.deepEqual(previous, before, 'Pas de mutation des citations existantes')
  })
  await test('Valider une fiche conserve le texte exact des passages, quel que soit le statut', async () => {
    const { EMPTY_BOOK_FORM, validateBookForm } = await server.ssrLoadModule('/src/domain/bookForm.ts')
    const { emptyCustomEntryForm, validateCustomEntryForm } = await server.ssrLoadModule('/src/domain/customLibraries.ts')
    const body = '\t« Un passage »\n夜  '
    const book = validateBookForm({ ...EMPTY_BOOK_FORM, title: 'Recette', quotes: [body, '  '] })
    assert.equal(book.success, true)
    assert.deepEqual(book.data.quotes, [body])
    const comic = validateCustomEntryForm('comics', { ...emptyCustomEntryForm('comics'), title: 'Recette', quotes: [body, '  '] })
    assert.equal(comic.success, true)
    assert.deepEqual(comic.data.quotes, [body])
  })
} finally {
  await server.close()
  rmSync(cacheDir, { recursive: true, force: true })
}
