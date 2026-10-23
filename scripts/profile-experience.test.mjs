import assert from 'node:assert/strict'
import { test } from 'node:test'

/**
 * Expérience d'un profil (document v5) : les vues enregistrées et les préférences d'affichage
 * voyagent avec les fiches. Ces tests tiennent trois choses : un document v4 reste lisible,
 * une préférence abîmée ne fait pas perdre la collection, et deux vues du même nom ne
 * s'écrasent jamais silencieusement.
 */
const {
  buildExperience,
  collectPreferences,
  applyPreferences,
  readExperience,
  restoreSavedViews,
  EXPERIENCE_VERSION,
  PREFERENCE_STORAGE_KEYS,
} = await import('../src/domain/profileExperience.ts')
const { createLibraryDocument, serializeLibraryDocument, validateLibraryDocument, SYLLOGE_LIBRARY_VERSION } =
  await import('../src/domain/libraryDocument.ts')

const profile = { id: 'profil-1', name: 'Recette', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
const library = { profile, films: [], series: [], anime: [], books: [], mangas: [], games: [], artworks: [] }

const view = (name, medium = 'films') => ({
  medium,
  name,
  criteria: { sort: { column: 'title', direction: 'asc' }, mediumFilter: 'all', filters: {} },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
})

const fakeStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial))
  return {
    read: (key) => values.get(key) ?? null,
    write: (key, value) => values.set(key, value),
    values,
  }
}

test('Le document v5 porte l’expérience et la relit intacte', () => {
  const experience = buildExperience([view('À voir en 2026'), view('Court', 'series')], { theme: 'dark', language: 'en' })
  const document = createLibraryDocument(library, '2026-10-23T10:00:00.000Z', experience)
  assert.equal(document.version, SYLLOGE_LIBRARY_VERSION)
  assert.equal(document.experience.savedViews.length, 2)

  const preview = validateLibraryDocument(serializeLibraryDocument(document))
  assert.deepEqual(preview.errors, [])
  assert.equal(preview.document.experience.version, EXPERIENCE_VERSION)
  assert.deepEqual(preview.document.experience.preferences, { theme: 'dark', language: 'en' })
  // Ordre du document : par bibliothèque, puis par nom — déterminé une fois, pas par l’insertion.
  assert.deepEqual(preview.document.experience.savedViews.map((entry) => `${entry.medium}/${entry.name}`), ['films/À voir en 2026', 'series/Court'])
})

test('Un document v4 sans experience reste lisible', () => {
  const v5 = createLibraryDocument(library, '2026-10-23T10:00:00.000Z', buildExperience([view('Ancienne')], {}))
  const asV4 = JSON.parse(serializeLibraryDocument(v5))
  asV4.version = 4
  delete asV4.experience

  const preview = validateLibraryDocument(`${JSON.stringify(asV4)}\n`)
  assert.deepEqual(preview.errors, [])
  assert.equal(preview.document.experience, undefined)
})

test('Une préférence ou une vue abîmée est écartée sans perdre le document', () => {
  const document = JSON.parse(serializeLibraryDocument(
    createLibraryDocument(library, '2026-10-23T10:00:00.000Z', buildExperience([view('Gardée')], { theme: 'dark' })),
  ))
  document.experience.preferences.theme = 'fluo'
  document.experience.preferences.inconnue = 'x'
  document.experience.savedViews.push({ medium: 'podcasts', name: 'Inconnue' })
  document.experience.savedViews.push({ medium: 'films', name: '   ' })

  const preview = validateLibraryDocument(`${JSON.stringify(document)}\n`)
  assert.deepEqual(preview.errors, [])
  assert.deepEqual(preview.document.experience.preferences, {})
  assert.deepEqual(preview.document.experience.savedViews.map((entry) => entry.name), ['Gardée'])
})

test('Un bloc experience illisible invalide le document, avec le chemin', () => {
  const document = JSON.parse(serializeLibraryDocument(createLibraryDocument(library, '2026-10-23T10:00:00.000Z', buildExperience([], {}))))
  document.experience = 'pas un objet'

  const preview = validateLibraryDocument(`${JSON.stringify(document)}\n`)
  assert.equal(preview.document, null)
  assert.equal(preview.errors[0].path, '$.experience')
  assert.match(preview.errors[0].message, /doit être un objet/)
})

test('Les préférences se lisent et s’appliquent par leurs clés de stockage', () => {
  const storage = fakeStorage({ [PREFERENCE_STORAGE_KEYS.theme]: 'dark', [PREFERENCE_STORAGE_KEYS.language]: 'de' })
  const collected = collectPreferences(storage.read)
  assert.deepEqual(collected, { theme: 'dark' }, 'une langue inconnue n’est pas recopiée')

  const target = fakeStorage()
  const applied = applyPreferences({ theme: 'light', language: 'en', homeAutoplay: 'peut-être' }, target.write)
  assert.deepEqual(applied, ['theme', 'language'])
  assert.equal(target.values.get(PREFERENCE_STORAGE_KEYS.theme), 'light')
  assert.equal(target.values.get(PREFERENCE_STORAGE_KEYS.language), 'en')
  assert.equal(target.values.has(PREFERENCE_STORAGE_KEYS.homeAutoplay), false)
})

test('Une vue dont le nom est pris est renommée, puis comptée', async () => {
  const experience = readExperience({ version: 1, savedViews: [view('Favoris 2026')], preferences: {} }).experience
  const created = []
  const port = {
    list: async () => [],
    create: async (_profileId, medium, name) => {
      if (created.includes(name)) throw new Error('UNIQUE constraint failed')
      created.push(name)
      return { id: name, profileId: 'profil-2', medium, name, criteria: {}, createdAt: '', updatedAt: '' }
    },
  }
  const report = await restoreSavedViews(experience, 'profil-2', port)
  assert.equal(report.created, 1)
  assert.deepEqual(report.renamed, [])
  assert.deepEqual(created, ['Favoris 2026'])

  created.push('Favoris 2026')
  const second = await restoreSavedViews(experience, 'profil-2', port)
  assert.equal(second.created, 1)
  assert.deepEqual(second.renamed, ['Favoris 2026 → Favoris 2026 (2)'])
})

test('Une vue impossible à créer est rapportée, jamais perdue en silence', async () => {
  const experience = readExperience({ version: 1, savedViews: [view('Cassée')], preferences: {} }).experience
  const report = await restoreSavedViews(experience, 'profil-2', {
    list: async () => [],
    create: async () => { throw new Error('disque plein') },
  })
  assert.equal(report.created, 0)
  assert.deepEqual(report.skipped, ['Cassée'])
})
