import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks'
import {
  createCustomEntryAtomically, updateCustomEntryAtomically,
  deleteCustomEntryAtomically, removeCustomLibraryAtomically,
} from '../src/data/nativeCustomEntries.ts'

const previousWindow = globalThis.window
globalThis.window = {}
after(() => { clearMocks(); if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow })
const payload = { libraryId: 'comics', entry: { id: 'fixture', profileId: 'reader', quotes: [] } }
const commands = [
  [createCustomEntryAtomically, [payload], 'create_custom_entry_atomically', { payload }],
  [updateCustomEntryAtomically, [payload], 'update_custom_entry_atomically', { payload }],
  [deleteCustomEntryAtomically, ['reader', 'comics', 'fixture'], 'delete_custom_entry_atomically', { profileId: 'reader', libraryId: 'comics', entryId: 'fixture' }],
  [removeCustomLibraryAtomically, ['reader', 'comics'], 'remove_custom_library_atomically', { profileId: 'reader', libraryId: 'comics' }],
]
for (const [call, args, command, expected] of commands) {
  test(`${command}: exact IPC names and camelCase args; native result may be void`, async () => {
    const calls = []
    mockIPC((name, value) => { calls.push([name, value]) })
    assert.equal(await call(...args), undefined)
    assert.deepEqual(calls, [[command, expected]])
  })
  test(`${command}: native string errors become Error objects for form/detail error boundaries`, async () => {
    mockIPC(() => { throw 'Synthetic late SQLite failure' })
    await assert.rejects(call(...args), error => error instanceof Error && error.message === 'Synthetic late SQLite failure')
  })
}
