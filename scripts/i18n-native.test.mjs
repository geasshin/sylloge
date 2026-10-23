import assert from 'node:assert/strict'
import test, { after, afterEach } from 'node:test'
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks'
import { getLanguage, setLanguage } from '../src/i18n/core.ts'
import {
  pickImportAny, pickImportContainer, pickImportJson, pickImportFilmsCsvOrNotion,
  saveExportJson, saveExportCsv, pickBackupDirectory,
} from '../src/data/nativePortability.ts'
import { pickBackupDestination } from '../src/data/backupDestination.ts'

// Only mocked IPC and synthetic values; no dialog, filesystem or real database.
const previousWindow = globalThis.window
const previousLanguage = getLanguage()
globalThis.window = {}
afterEach(() => { clearMocks(); setLanguage(previousLanguage) })
after(() => {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
})

const contents = '\t=Exact, "日本語"\r\n  '
const json = { name: 'fixture.json', contents }
const container = { name: 'fixture', kind: 'container', contents: null, csvCandidates: [], markdownPages: [], containerCandidates: [] }
const films = { name: 'fixture.csv', kind: 'csv', csvCandidates: [{ id: 'csv-0', name: 'fixture.csv', contents }], markdownPages: [] }
const settings = { backupDirectory: '/synthetic/日本語 backups', lastAutomaticSnapshotDay: null, directoryAvailable: true }
const profileId = 'profile-synthetic'
const suggestedName = '../Exact_日本語.json'
const dialogs = [
  [pickImportAny, [], 'pick_import_any', {}, container],
  [pickImportContainer, [], 'pick_import_container', {}, container],
  [pickImportJson, [], 'pick_import_json', {}, json],
  [pickImportFilmsCsvOrNotion, [], 'pick_import_films_csv_or_notion', {}, films],
  [saveExportJson, [suggestedName, contents], 'save_export_json', { suggestedName, contents }, 'fixture.json'],
  [saveExportCsv, ['Exact_日本語.csv', contents], 'save_export_csv', { suggestedName: 'Exact_日本語.csv', contents }, 'fixture.csv'],
  [pickBackupDirectory, [profileId], 'pick_backup_directory', { profileId }, settings],
  [pickBackupDestination, [], 'pick_backup_destination', {}, settings],
]

for (const [call, args, command, payload, result] of dialogs) {
  test(`${command}: forwards the current FR/EN choice and exact existing arguments`, async () => {
    const calls = []
    mockIPC((name, value) => { calls.push([name, value]); return result })
    for (const language of ['fr', 'en', 'fr']) {
      setLanguage(language)
      assert.strictEqual(await call(...args), result)
      assert.deepEqual(calls.at(-1), [command, { ...payload, language }])
    }
    assert.equal(calls.length, 3, 'one invocation per dialog, without extra storage/configuration calls')
  })
}
