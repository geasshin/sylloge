import assert from 'node:assert/strict'
import test, { after, mock } from 'node:test'
import Database from '@tauri-apps/plugin-sql'
import { BackupService } from '../src/data/backupService.ts'
import { libraryRepository } from '../src/data/libraryRepository.ts'
import { validateLibraryDocument } from '../src/domain/libraryDocument.ts'

const databaseLoad = mock.method(Database, 'load', () => assert.fail('Ouverture de la base réelle interdite dans ces tests'))
after(() => {
  assert.equal(databaseLoad.mock.callCount(), 0)
  databaseLoad.mock.restore()
})

const timestamp = '2026-10-22T08:00:00.000Z'
const text = '\t=Note,\r\n"accentuée 日本語"  '
const profile = { id: 'backup-fixture', name: 'Profil synthétique', createdAt: timestamp, updatedAt: timestamp }
const sections = ['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks']
const identity = (id) => ({ id, profileId: profile.id, title: `Titre ${id}`, createdAt: timestamp, updatedAt: timestamp })
const series = (id, category = 'série télé') => ({
  ...identity(id), showrunner: text, casting: text, summary: text, category,
  status: 'à voir', rating: 0.5, isFavorite: true, seasonsSeen: 0, seasonsTotal: 12,
  progressUpdatedAt: timestamp, startedAt: '2026-10-01', posterUrl: 'https://example.invalid/series.jpg', personalNote: text,
})
const book = (id, category = 'livre') => ({
  ...identity(id), author: text, year: 2024, summary: text, category, status: 'à lire',
  rating: 4.5, isFavorite: true, volumesRead: 0, volumesTotal: 12, progressUpdatedAt: timestamp,
  startedAt: '2026-10-01', coverUrl: 'https://example.invalid/book.jpg', personalNote: text,
  quotes: [
    { id: `${id}-quote-2`, bookId: id, body: `${text}seconde  `, position: 2, createdAt: timestamp },
    { id: `${id}-quote-1`, bookId: id, body: text, position: 1, createdAt: timestamp },
  ],
})
function custom(id, details, quotes = []) {
  return {
    ...identity(id), creator: text, year: 2024, status: 'en cours', rating: 3.5, isFavorite: true,
    progressCurrent: 3, progressTotal: 11, progressUpdatedAt: timestamp, startedAt: '2026-10-01', finishedAt: null,
    coverUrl: 'https://example.invalid/custom.jpg', summary: text, personalNote: text, details, quotes,
  }
}
const library = {
  profile,
  films: [{ ...identity('film'), originalTitle: text, year: 2024, status: 'en attente', isFavorite: true,
    rating: 4.5, watchedAt: '2026-10-01', personalNote: text, director: text, summary: text,
    providerName: 'Source synthétique', providerId: 'fixture-42', posterUrl: 'https://example.invalid/film.jpg' }],
  series: [series('series')], anime: [series('anime', 'animation')],
  books: [book('book')], mangas: [book('manga', 'manga')],
  games: [{ ...identity('game'), developer: text, platform: text, year: 2024, status: 'à jouer',
    rating: 0.5, isFavorite: true, playedAt: '2026-10-01', coverUrl: 'https://example.invalid/game.jpg', personalNote: text }],
  artworks: [{ ...identity('artwork'), artist: text, year: 2024, form: 'peinture', location: text,
    exhibition: text, status: 'à découvrir', isFavorite: true, discoveredAt: '2026-10-01',
    imageUrl: 'https://example.invalid/art.jpg', personalNote: text, customFields: [{ name: 'Technique', value: text }] }],
  // Bibliothèques personnalisées (v4) : une avec citations, une avec champs propres.
  customLibraries: [
    { libraryId: 'comics', position: 0, addedAt: timestamp, entries: [custom('comic', { format: 'Bande dessinée', artist: text }, [
      { id: 'comic-quote-0', entryId: 'comic', body: text, position: 0, createdAt: timestamp },
      { id: 'comic-quote-1', entryId: 'comic', body: `${text}seconde  `, position: 1, createdAt: timestamp },
    ])] },
    { libraryId: 'music', position: 1, addedAt: timestamp, entries: [custom('album', { format: 'Album', label: text })] },
  ],
}

// Le pont injecté ne touche ni au disque ni à Tauri. Aucune ouverture du dépôt
// réel : les chargeurs renvoient des fixtures en mémoire, y compris le test
// du chargeur par défaut, qui remplace explicitement loadLibrary du dépôt.
function harness({ loadLibrary = async () => structuredClone(library), now = () => new Date(timestamp), ...overrides } = {}) {
  const calls = []
  const native = {
    async getBackupSettings(profileId) { calls.push({ kind: 'get', profileId }); return null },
    async pickBackupDirectory(profileId) { calls.push({ kind: 'pick', profileId }); return null },
    async clearBackupSettings(profileId) { calls.push({ kind: 'clear', profileId }) },
    async saveManualBackupSnapshot(profileId, contents) {
      calls.push({ kind: 'manual', profileId, contents })
      return { fileName: 'fixture-manual.json', retainedSnapshotCount: 2 }
    },
    async saveAutomaticBackupSnapshot(profileId, contents, automaticDay) {
      calls.push({ kind: 'automatic', profileId, contents, automaticDay })
      return { outcome: 'saved', fileName: 'fixture-automatic.json' }
    },
    ...overrides,
  }
  const service = new BackupService(native, now, async (profileId) => {
    calls.push({ kind: 'load', profileId })
    return loadLibrary(profileId)
  })
  return { service, calls, native }
}

function assertSevenSections(contents, expected = library, exportedAt = timestamp) {
  const document = JSON.parse(contents)
  assert.equal(document.format, 'sylloge-library')
  assert.equal(document.version, 4)
  assert.equal(document.exportedAt, exportedAt)
  assert.deepEqual(document.profile, expected.profile)
  assert.deepEqual(Object.keys(document).sort(), ['format', 'version', 'exportedAt', 'profile', ...sections, 'customLibraries'].sort())
  for (const section of sections) assert.deepEqual(document[section], expected[section], section)
  assert.deepEqual(document.customLibraries, expected.customLibraries ?? [], 'customLibraries')
  const preview = validateLibraryDocument(contents)
  assert.deepEqual(preview.errors, [])
  assert.deepEqual(preview.document, document)
  return document
}

test('le snapshot JSON v4 sérialise et compte les sept bibliothèques, les bibliothèques personnalisées, notes et citations exactes', async () => {
  const source = structuredClone(library)
  const { service, calls } = harness({ loadLibrary: async () => source })
  const before = structuredClone(source)
  // Inspection du résultat de préparation : worksCount n'est pas exposé par
  // l'API publique. La méthode privée TS reste accessible après strip-types.
  const snapshot = await service.createSnapshot({ profile, films: [] }, new Date(timestamp))
  assertSevenSections(snapshot.contents)
  assert.equal(snapshot.worksCount, 9)
  assert.deepEqual(calls, [{ kind: 'load', profileId: profile.id }])
  assert.deepEqual(source, before)
})

test('la sauvegarde manuelle retourne une notice d’échec si le chargement échoue, sans écriture', async (t) => {
  const error = new Error('Lecture synthétique impossible')
  const log = t.mock.method(console, 'error', () => {})
  const { service, calls } = harness({ loadLibrary: async () => { throw error } })
  const notice = await service.saveManualSnapshot({ profile, films: [] })
  assert.equal(notice.kind, 'error')
  assert.match(notice.message, /sauvegarde JSON manuelle a échoué/u)
  assert.doesNotMatch(notice.message, /créée|enregistré :|Lecture synthétique/u)
  assert.deepEqual(calls, [{ kind: 'load', profileId: profile.id }])
  assert.equal(log.mock.callCount(), 1)
  assert.equal(log.mock.calls[0].arguments[1], error)
})

test('la sauvegarde automatique retourne une notice d’échec si le chargement échoue, sans écriture', async (t) => {
  const error = new Error('Lecture synthétique impossible')
  const log = t.mock.method(console, 'error', () => {})
  const { service, calls } = harness({ loadLibrary: async () => { throw error } })
  const notice = await service.tryAutomaticSnapshot({ profile, films: [] })
  assert.equal(notice?.kind, 'error')
  assert.match(notice.message, /sauvegarde automatique JSON a échoué/u)
  assert.doesNotMatch(notice.message, /créée|Lecture synthétique/u)
  assert.deepEqual(calls, [{ kind: 'load', profileId: profile.id }])
  assert.equal(log.mock.callCount(), 1)
  assert.equal(log.mock.calls[0].arguments[1], error)
})

const operations = [
  ['manuelle', 'saveManualSnapshot', 'saveManualBackupSnapshot'],
  ['automatique', 'tryAutomaticSnapshot', 'saveAutomaticBackupSnapshot'],
]

for (const [label, method, writer] of operations) {
  for (const section of ['anime', 'mangas']) {
    test(`échec natif ${label} : un profil avec uniquement ${section} compte bien une donnée`, async (t) => {
      const only = {
        profile: { ...profile },
        ...Object.fromEntries(sections.map((key) => [key, key === section ? structuredClone(library[key]) : []])),
      }
      const error = new Error('Écriture synthétique refusée')
      const log = t.mock.method(console, 'error', () => {})
      const write = t.mock.fn(async (profileId, contents) => {
        assert.equal(profileId, profile.id)
        assertSevenSections(contents, only)
        throw error
      })
      const { service } = harness({ loadLibrary: async () => only, [writer]: write })
      const notice = await service[method]({ profile, films: library.films })
      assert.equal(notice?.kind, 'error')
      assert.match(notice.message, /a échoué\. La donnée déjà enregistrée reste dans SQLite\./u)
      assert.equal(write.mock.callCount(), 1)
      assert.equal(log.mock.calls[0].arguments[1], error)
    })
  }
}

const emptyLibrary = () => ({ profile: { ...profile }, ...Object.fromEntries(sections.map((section) => [section, []])) })

test('un profil vide produit sept tableaux vides et un compte nul', async () => {
  const empty = emptyLibrary()
  const { service } = harness({ loadLibrary: async () => empty })
  const snapshot = await service.createSnapshot({ profile, films: [] }, new Date(timestamp))
  assertSevenSections(snapshot.contents, empty)
  assert.equal(snapshot.worksCount, 0)
})

test('un chargeur historique à cinq listes reste compatible et répartit animation et manga sans perte', async () => {
  const { anime, mangas, ...legacy } = structuredClone(library)
  legacy.series.push(...anime)
  legacy.books.push(...mangas)
  const { service } = harness({ loadLibrary: async () => legacy })
  const snapshot = await service.createSnapshot({ profile, films: [] }, new Date(timestamp))
  assertSevenSections(snapshot.contents)
  assert.equal(snapshot.worksCount, 9)
})

test('le chargeur par défaut transmet les sept bibliothèques du dépôt sans ouvrir de base réelle', async (t) => {
  const load = t.mock.method(libraryRepository, 'loadLibrary', async () => structuredClone(library))
  const { native, calls } = harness()
  const service = new BackupService(native, () => new Date(timestamp))
  const notice = await service.saveManualSnapshot({ profile, films: [] })
  assert.equal(notice.kind, 'success')
  assert.equal(load.mock.callCount(), 1)
  assert.deepEqual(load.mock.calls[0].arguments, [profile.id])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].kind, 'manual')
  assertSevenSections(calls[0].contents)
})

for (const [label, method, writer] of operations) {
  test(`sauvegarde ${label} : relecture des sept bibliothèques et succès seulement après l’écriture native`, async (t) => {
    const entered = Promise.withResolvers()
    const completed = Promise.withResolvers()
    const now = new Date(2026, 9, 22, 0, 5, 0)
    const clock = t.mock.fn(() => now)
    const { service, calls } = harness({
      now: clock,
      [writer]: async (...args) => { entered.resolve(args); return completed.promise },
    })
    let settled = false
    const pending = service[method]({ profile, films: [] }).then((notice) => { settled = true; return notice })
    const [profileId, contents, automaticDay] = await entered.promise
    assert.equal(settled, false, 'Une écriture en attente ne doit pas déjà annoncer une copie créée')
    assert.equal(profileId, profile.id)
    assertSevenSections(contents, library, now.toISOString())
    assert.equal(clock.mock.callCount(), 1)
    assert.deepEqual(calls, [{ kind: 'load', profileId: profile.id }])
    if (method === 'tryAutomaticSnapshot') assert.equal(automaticDay, '2026-10-22')
    else assert.equal(automaticDay, undefined)
    completed.resolve(method === 'tryAutomaticSnapshot'
      ? { outcome: 'saved', fileName: 'fixture-confirmed.json' }
      : { fileName: 'fixture-confirmed.json', retainedSnapshotCount: 1 })
    const notice = await pending
    assert.equal(notice?.kind, 'success')
    assert.match(notice.message, /fixture-confirmed\.json/u)
    if (method === 'saveManualSnapshot') assert.match(notice.message, /1 copie conservée pour ce profil/u)
  })

  for (const error of [new Error('Destination synthétique non accessible'), 'Échec natif synthétique']) {
    test(`sauvegarde ${label} : un rejet natif ${typeof error} n’annonce jamais de succès ni de nouvelle tentative`, async (t) => {
      const log = t.mock.method(console, 'error', () => {})
      const write = t.mock.fn(async () => { throw error })
      const { service, calls } = harness({ [writer]: write })
      const notice = await service[method]({ profile, films: [] })
      assert.equal(notice?.kind, 'error')
      assert.match(notice.message, /a échoué\. Les données déjà enregistrées restent dans SQLite\./u)
      assert.doesNotMatch(notice.message, /créée|enregistré :/u)
      assert.equal(write.mock.callCount(), 1)
      assert.equal(write.mock.calls[0].arguments[0], profile.id)
      assertSevenSections(write.mock.calls[0].arguments[1])
      assert.deepEqual(calls, [{ kind: 'load', profileId: profile.id }])
      assert.equal(log.mock.callCount(), 1)
      assert.equal(log.mock.calls[0].arguments[1], error)
    })
  }

  test(`sauvegarde ${label} : une erreur de sérialisation devient une notice, sans écriture partielle`, async (t) => {
    const source = structuredClone(library)
    source.mangas[0].quotes[0].body = 1n // Provoque réellement le rejet de JSON.stringify, après la lecture.
    const log = t.mock.method(console, 'error', () => {})
    const { service, calls } = harness({ loadLibrary: async () => source })
    const notice = await service[method]({ profile, films: [] })
    assert.equal(notice?.kind, 'error')
    assert.match(notice.message, /a échoué/u)
    assert.deepEqual(calls, [{ kind: 'load', profileId: profile.id }])
    assert.equal(log.mock.callCount(), 1)
    assert.ok(log.mock.calls[0].arguments[1] instanceof TypeError)
    assert.match(log.mock.calls[0].arguments[1].message, /BigInt/u)
    assert.equal(source.mangas[0].quotes[0].body, 1n)
  })

  test(`sauvegarde ${label} : une horloge défaillante est rapportée avant toute lecture ou écriture`, async (t) => {
    const error = new Error('Horloge synthétique indisponible')
    const log = t.mock.method(console, 'error', () => {})
    const { service, calls } = harness({ now: () => { throw error } })
    const notice = await service[method]({ profile, films: [] })
    assert.equal(notice?.kind, 'error')
    assert.match(notice.message, /a échoué/u)
    assert.deepEqual(calls, [])
    assert.equal(log.mock.callCount(), 1)
    assert.equal(log.mock.calls[0].arguments[1], error)
  })

  test(`sauvegarde ${label} : une date invalide ne produit aucune écriture ni rejet non géré`, async (t) => {
    const log = t.mock.method(console, 'error', () => {})
    const { service, calls } = harness({ now: () => new Date('invalid') })
    const notice = await service[method]({ profile, films: [] })
    assert.equal(notice?.kind, 'error')
    assert.deepEqual(calls, [{ kind: 'load', profileId: profile.id }])
    assert.equal(log.mock.callCount(), 1)
    assert.ok(log.mock.calls[0].arguments[1] instanceof RangeError)
  })
}

for (const outcome of ['alreadySaved', 'notConfigured']) {
  test(`automatique ${outcome} : aucune notice de copie créée, aucun changement de réglages`, async (t) => {
    const log = t.mock.method(console, 'error', () => {})
    const write = t.mock.fn(async () => ({ outcome, fileName: null }))
    const { service, calls } = harness({ saveAutomaticBackupSnapshot: write })
    assert.equal(await service.tryAutomaticSnapshot({ profile, films: [] }), null)
    assert.deepEqual(calls, [{ kind: 'load', profileId: profile.id }])
    assert.equal(write.mock.callCount(), 1)
    assertSevenSections(write.mock.calls[0].arguments[1])
    assert.equal(log.mock.callCount(), 0)
  })
}

const settings = { backupDirectory: '/destination-synthetique', lastAutomaticSnapshotDay: '2026-10-21', directoryAvailable: true }

for (const current of [null, settings]) {
  test(`annuler le choix du dossier préserve ${current ? 'le réglage existant' : 'l’absence de réglage'} sans charger ni sauvegarder`, async (t) => {
    const get = t.mock.fn(async () => current)
    const { service, calls } = harness({ getBackupSettings: get })
    assert.equal(await service.getSettings(profile.id), current)
    assert.equal(await service.pickDirectory(profile.id), null)
    assert.equal(await service.getSettings(profile.id), current)
    assert.deepEqual(calls, [{ kind: 'pick', profileId: profile.id }])
    assert.deepEqual(get.mock.calls.map((call) => call.arguments), [[profile.id], [profile.id]])
  })
}

test('choisir puis oublier un dossier transmet les callbacks existants sans créer implicitement une première copie', async (t) => {
  const pick = t.mock.fn(async () => settings)
  const { service, calls } = harness({ pickBackupDirectory: pick })
  assert.equal(await service.pickDirectory(profile.id), settings)
  assert.deepEqual(pick.mock.calls[0].arguments, [profile.id])
  await service.clearSettings(profile.id)
  assert.deepEqual(calls, [{ kind: 'clear', profileId: profile.id }])
})

test('un échec du choix de dossier remonte sans sauvegarde ni effacement des réglages', async () => {
  const error = new Error('Dossier synthétique non accessible')
  const { service, calls } = harness({ pickBackupDirectory: async () => { throw error } })
  await assert.rejects(service.pickDirectory(profile.id), (caught) => caught === error)
  assert.deepEqual(calls, [])
})

test('la première copie explicite après finalisation relit le profil importé et rapporte un échec sans le déclarer protégé', async (t) => {
  let finalized = false
  const error = new Error('Échec de la première copie synthétique')
  const log = t.mock.method(console, 'error', () => {})
  const write = t.mock.fn(async () => { throw error })
  const { service, calls } = harness({
    pickBackupDirectory: async () => settings,
    loadLibrary: async () => { assert.equal(finalized, true); return structuredClone(library) },
    saveManualBackupSnapshot: write,
  })
  assert.equal(await service.pickDirectory(profile.id), settings)
  assert.deepEqual(calls, [])
  assert.equal(write.mock.callCount(), 0)
  // C'est au parcours appelant d'attendre la finalisation réussie du profil et
  // de l'import avant d'appeler saveManualSnapshot, pas au choix du dossier.
  finalized = true
  const notice = await service.saveManualSnapshot({ profile, films: [] })
  assert.equal(notice.kind, 'error')
  assert.match(notice.message, /a échoué/u)
  assert.doesNotMatch(notice.message, /créée|enregistré :|protégé/u)
  assert.deepEqual(calls, [{ kind: 'load', profileId: profile.id }])
  assert.equal(write.mock.callCount(), 1)
  assertSevenSections(write.mock.calls[0].arguments[1])
  assert.equal(log.mock.calls[0].arguments[1], error)
})
