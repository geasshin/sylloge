import assert from 'node:assert/strict'
import test, { after, mock } from 'node:test'
import Database from '@tauri-apps/plugin-sql'
import { SqliteCustomLibraryRepository } from '../src/data/customLibraryRepository.ts'
import { CUSTOM_LIBRARY_IDS } from '../src/domain/customLibraries.ts'

const realDatabase = mock.method(Database, 'load', () => assert.fail('Real database access forbidden'))
after(() => { assert.equal(realDatabase.mock.callCount(), 0); realDatabase.mock.restore() })
const createdAt = '2026-01-01T00:00:00.000Z'
const updatedAt = '2026-10-22T10:00:00.000Z'
const text = '\t=Exact, \"日本語\"\r\n  '
const input = (overrides = {}) => ({
  title: 'Synthetic entry', creator: text, year: 1986, status: 'à découvrir', rating: 4.5, isFavorite: true,
  progressCurrent: null, progressTotal: null, finishedAt: null, coverUrl: null,
  summary: text, personalNote: text, details: { importedUnknown: text }, quotes: [text, 'Second'], ...overrides,
})
const entry = (overrides = {}) => ({
  ...input(), id: 'entry-1', profileId: 'reader', createdAt, updatedAt: createdAt,
  progressUpdatedAt: createdAt, startedAt: '2026-01-01',
  quotes: [
    { id: 'quote-1', entryId: 'entry-1', body: text, position: 0, createdAt },
    { id: 'quote-2', entryId: 'entry-1', body: text, position: 1, createdAt: '2026-02-01T00:00:00.000Z' },
    { id: 'quote-3', entryId: 'entry-1', body: 'Second', position: 2, createdAt },
  ], ...overrides,
})
const snake = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'quotes').map(([key, field]) => [
  key.replace(/[A-Z]/gu, character => `_${character.toLowerCase()}`),
  key === 'details' ? JSON.stringify(field) : key === 'isFavorite' ? Number(field) : field,
]))
function harness(initial = null, overrides = {}) {
  let persisted = initial ? structuredClone(initial) : null
  let nextId = 0
  let clock = updatedAt
  const calls = []
  const database = {
    async select(query, values = []) {
      calls.push({ kind: 'read', query, values })
      if (!persisted) return []
      if (query.includes('FROM comic_quotes')) return values[0] === persisted.profileId
        ? persisted.quotes.map(quote => ({ id: quote.id, comic_id: quote.entryId, body: quote.body, position: quote.position, created_at: quote.createdAt })) : []
      return values[0] === persisted.id && values[1] === persisted.profileId ? [snake(persisted)] : []
    },
    async execute() { assert.fail('Entry/quote writes must not use the SQL plugin outside the native transaction') },
  }
  const create = overrides.create ?? (async payload => {
    calls.push({ kind: 'create', payload: structuredClone(payload) })
    persisted = { ...structuredClone(payload.entry), title: 'Committed entry re-read' }
    // Native commands return void, never a CustomEntry object.
  })
  const update = overrides.update ?? (async payload => {
    calls.push({ kind: 'update', payload: structuredClone(payload) })
    persisted = structuredClone(payload.entry)
  })
  const removeEntry = overrides.delete ?? (async (...args) => { calls.push({ kind: 'delete', args }); persisted = null })
  const removeLibrary = overrides.remove ?? (async (...args) => { calls.push({ kind: 'remove', args }); persisted = null })
  const repository = new SqliteCustomLibraryRepository(async () => database, () => `generated-${++nextId}`, () => clock,
    create, update, removeEntry, removeLibrary)
  return { repository, calls, tick(value) { clock = value } }
}

test('create delegates one full domain payload to native, awaits void, then re-reads committed rows', async () => {
  const { repository, calls } = harness()
  const saved = await repository.create('reader', 'comics', input({ status: 'en cours', progressCurrent: 0 }))
  assert.equal(calls[0].kind, 'create')
  const payload = calls[0].payload
  assert.deepEqual(Object.keys(payload).sort(), ['entry', 'libraryId'])
  assert.equal(payload.libraryId, 'comics')
  assert.equal(payload.entry.profileId, 'reader')
  assert.equal(payload.entry.progressUpdatedAt, updatedAt)
  assert.equal(payload.entry.startedAt, '2026-10-22')
  assert.equal(payload.entry.personalNote, text)
  assert.deepEqual(payload.entry.quotes, [
    { id: 'generated-2', entryId: 'generated-1', body: text, position: 0, createdAt: updatedAt },
    { id: 'generated-3', entryId: 'generated-1', body: 'Second', position: 1, createdAt: updatedAt },
  ])
  assert.equal(saved.title, 'Committed entry re-read')
  assert.equal(calls.filter(call => call.kind === 'create').length, 1)
})

test('update reuses IDs and creation dates for exact repeated bodies, ordering and unknown details', async () => {
  const current = entry()
  const { repository, calls } = harness(current)
  const saved = await repository.update('reader', 'comics', current.id, input({ quotes: ['Second', text, text, '  New quote  '] }))
  const payload = calls.find(call => call.kind === 'update').payload
  assert.equal(payload.entry.createdAt, createdAt)
  assert.equal(payload.entry.startedAt, current.startedAt)
  assert.equal(payload.entry.progressUpdatedAt, current.progressUpdatedAt)
  assert.deepEqual(payload.entry.details, current.details)
  assert.deepEqual(saved.quotes.slice(0, 3), [
    { ...current.quotes[2], position: 0 }, { ...current.quotes[0], position: 1 }, { ...current.quotes[1], position: 2 },
  ])
  assert.equal(saved.quotes[3].body, '  New quote  ')
  assert.equal(saved.quotes[3].createdAt, updatedAt)
  assert.equal(saved.updatedAt, updatedAt)
})

test('native write failures reject unchanged and skip post-commit re-read', async () => {
  const failure = new Error('Synthetic late SQL insert failure')
  const created = harness(null, { create: async () => { throw failure } })
  await assert.rejects(created.repository.create('reader', 'comics', input()), error => error === failure)
  assert.equal(created.calls.length, 0)
  const updated = harness(entry(), { update: async () => { throw failure } })
  await assert.rejects(updated.repository.update('reader', 'comics', 'entry-1', input()), error => error === failure)
  assert.equal(updated.calls.length, 2, 'only the initial entry and quote reads')
})

for (const libraryId of CUSTOM_LIBRARY_IDS) {
  test(`${libraryId}: keep all model payload fields and progress/status transitions`, async () => {
    const current = entry({ quotes: libraryId === 'comics' ? entry().quotes : [] })
    const { repository, calls } = harness(current)
    await repository.update('reader', libraryId, current.id, input({ status: 'abandonné', progressCurrent: 0, progressTotal: 10, quotes: libraryId === 'comics' ? [text] : [] }))
    const payload = calls.find(call => call.kind === 'update').payload
    assert.equal(payload.libraryId, libraryId)
    assert.equal(payload.entry.status, 'abandonné')
    assert.equal(payload.entry.progressCurrent, 0)
    assert.equal(payload.entry.progressTotal, 10)
    assert.equal(payload.entry.progressUpdatedAt, updatedAt)
    assert.equal(payload.entry.rating, 4.5)
    assert.equal(payload.entry.isFavorite, true)
    assert.equal(payload.entry.creator, text)
    assert.equal(payload.entry.summary, text)
    assert.equal(payload.entry.personalNote, text)
    assert.deepEqual(payload.entry.details, { importedUnknown: text })
  })
}

test('caller profile mismatch rejects before native update; deletion/removal stay scoped', async () => {
  const { repository, calls } = harness(entry())
  await assert.rejects(repository.update('neighbor', 'comics', 'entry-1', input()), /profil courant/u)
  assert.equal(calls.some(call => call.kind === 'update'), false)
  await repository.delete('reader', 'comics', 'entry-1')
  await repository.remove('reader', 'comics')
  assert.deepEqual(calls.filter(call => ['delete', 'remove'].includes(call.kind)), [
    { kind: 'delete', args: ['reader', 'comics', 'entry-1'] },
    { kind: 'remove', args: ['reader', 'comics'] },
  ])
})

test('no repository read runs until the native transaction has committed', async () => {
  let commit
  let persisted = null
  const reads = []
  const gate = new Promise(resolve => { commit = resolve })
  const database = {
    async select(query) { reads.push(query); return persisted ? [snake(persisted)] : [] },
    async execute() { assert.fail('No direct SQL write') },
  }
  const repository = new SqliteCustomLibraryRepository(async () => database, () => 'entry-1', () => updatedAt,
    async payload => { await gate; persisted = structuredClone(payload.entry) })
  const pending = repository.create('reader', 'music', input({ quotes: [] }))
  await Promise.resolve()
  assert.equal(reads.length, 0)
  commit()
  const saved = await pending
  assert.equal(saved.id, 'entry-1')
  assert.equal(reads.length, 1)
})

test('a successful void native command still requires the committed entry to be re-readable', async () => {
  const { repository } = harness(null, { create: async () => {} })
  // Le message doit dire que l’écriture a eu lieu ET qu’il faut recharger,
  // sinon l’utilisateur recrée la fiche et produit un doublon.
  await assert.rejects(repository.create('reader', 'music', input({ quotes: [] })), /enregistrée.*relue.*rechargez[^.]*doublon/u)
})

test('three existing constructor dependencies remain compatible for reads', async () => {
  const repository = new SqliteCustomLibraryRepository(async () => ({ select: async () => [], execute: async () => assert.fail('no write') }), () => 'id', () => updatedAt)
  assert.equal(await repository.get('reader', 'music', 'missing'), null)
})
