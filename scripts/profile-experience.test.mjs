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

// ── Version plus récente que celle que l'application comprend ─────────────────────────────────────
const NEWER = 'Cette sauvegarde a été créée par une version plus récente de Sylloge. Mettre l’application à jour pour la restaurer.'
const GENERIC = 'Les versions 1 à 5 du document sont prises en charge.'
const withVersion = version => JSON.stringify({ ...createLibraryDocument(library), version })
const versionMessages = version => validateLibraryDocument(withVersion(version)).errors.map(error => error.message)

test('Une sauvegarde d’une version future demande de mettre l’application à jour', () => {
  for (const version of [SYLLOGE_LIBRARY_VERSION + 1, 6, 12]) {
    assert.deepEqual(versionMessages(version), [NEWER], `version ${version}`)
  }
})

test('Une version absurde garde le message général, pas une invitation à mettre à jour', () => {
  for (const version of [0, -1, 2.5, '5', null, 'six']) {
    assert.deepEqual(versionMessages(version), [GENERIC], `version ${JSON.stringify(version)}`)
  }
})

// ── Bilan de restauration affiché à l'écran ───────────────────────────────────────────────────────
const { experienceReportText } = await import('../src/components/restoreReport.ts')
const { setLanguage } = await import('../src/i18n/core.ts')
const report = (over = {}) => ({ created: 0, renamed: [], skipped: [], preferences: [], ...over })

test('Le bilan : rien à dire quand rien n’a été restauré', () => {
  setLanguage('fr')
  assert.equal(experienceReportText(null), null)
  assert.equal(experienceReportText(report()), null)
})

test('Le bilan dit ce qui a été restauré, renommé et écarté, au singulier comme au pluriel', () => {
  setLanguage('fr')
  assert.equal(
    experienceReportText(report({ created: 3, renamed: ['À voir (2)'], skipped: ['Vue cassée', 'Autre'], preferences: ['theme', 'language'] })),
    'Vues enregistrées et préférences : 3 vues restaurées · 1 renommée (nom déjà pris) · 2 ignorées · 2 préférences appliquées.',
  )
  assert.equal(
    experienceReportText(report({ created: 1, preferences: ['theme'] })),
    'Vues enregistrées et préférences : 1 vue restaurée · 1 préférence appliquée.',
  )
})

test('Le bilan en anglais', () => {
  setLanguage('en')
  try {
    assert.equal(
      experienceReportText(report({ created: 3, renamed: ['x'], skipped: ['y'], preferences: ['theme'] })),
      'Saved views and preferences: 3 views restored · 1 renamed (name already taken) · 1 skipped · 1 preference applied.',
    )
    assert.match(experienceReportText('failed'), /^Your entries are restored\. /)
  } finally { setLanguage('fr') }
})

test('Le bilan signale un échec sans prétendre que la restauration entière a échoué', () => {
  setLanguage('fr')
  const text = experienceReportText('failed')
  assert.match(text, /^Les fiches sont restaurées\./)
  assert.match(text, /n’ont pas pu l’être/)
})

// ── Aperçu avant restauration ─────────────────────────────────────────────────────────────────────
const { experiencePreviewText } = await import('../src/components/restoreReport.ts')
const exp = (views, prefs) => ({
  version: EXPERIENCE_VERSION,
  savedViews: Array.from({ length: views }, (_, i) => view(`Vue ${i}`)),
  preferences: Object.fromEntries(Array.from({ length: prefs }, (_, i) => [`p${i}`, 'x'])),
})

test('L’aperçu annonce les vues et préférences que le document emporte', () => {
  setLanguage('fr')
  assert.equal(experiencePreviewText(exp(3, 2)), 'Elle contient aussi 3 vues enregistrées et 2 préférences d’affichage. Tout est restauré avec les fiches.')
  assert.equal(experiencePreviewText(exp(1, 0)), 'Elle contient aussi 1 vue enregistrée. Tout est restauré avec les fiches.')
  assert.equal(experiencePreviewText(exp(0, 1)), 'Elle contient aussi 1 préférence d’affichage. Tout est restauré avec les fiches.')
})

test('L’aperçu d’un document sans vues ni préférences (v4 ou v5 vide) le dit franchement', () => {
  setLanguage('fr')
  const none = 'Elle ne contient ni vue enregistrée ni préférence d’affichage.'
  assert.equal(experiencePreviewText(undefined), none)
  assert.equal(experiencePreviewText(null), none)
  assert.equal(experiencePreviewText(exp(0, 0)), none)
})

test('L’aperçu en anglais', () => {
  setLanguage('en')
  try {
    assert.equal(experiencePreviewText(exp(2, 1)), 'It also contains 2 saved views and 1 display preference. Everything is restored along with your entries.')
    assert.equal(experiencePreviewText(undefined), 'It contains no saved views or display preferences.')
  } finally { setLanguage('fr') }
})

// ── Le dépôt réapplique l'expérience dans CHAQUE chemin de restauration ───────────────────────────
// Régression : `importLibraryDocumentIntoEmptyProfile` (premier lancement et fenêtre de
// restauration) n'appelait pas la restauration des vues et des préférences ; seul l'import
// « profil neuf » le faisait.
const { SqliteLibraryRepository } = await import('../src/data/libraryRepository.ts')

const emptyCounts = (profileId) => ({
  profileId, filmCount: 0, seriesCount: 0, animeCount: 0, bookCount: 0, mangaCount: 0, gameCount: 0, artworkCount: 0,
  customLibraryCount: 0, customEntryCount: 0,
})

function repositoryWith(restore) {
  const repository = new SqliteLibraryRepository(
    async () => { throw new Error('Aucune lecture attendue avant le rechargement final') },
    () => 'id',
    () => '2026-10-24T10:00:00.000Z',
    async payload => emptyCounts(payload.profile.id),
    { listSeries: async () => [], listBooks: async () => [], listGames: async () => [], listArtworks: async () => [] },
    async payload => emptyCounts(payload.profile.id),
    null,
    restore,
  )
  repository.loadLibrary = async profileId => ({ ...library, profile: { ...profile, id: profileId } })
  return repository
}

test('Restaurer dans un profil vide réapplique les vues et les préférences, et le dit une fois', async () => {
  const experience = buildExperience([view('À revoir')], { theme: 'dark' })
  const doc = createLibraryDocument(library, undefined, experience)
  const calls = []
  const report = { created: 1, renamed: [], skipped: [], preferences: ['theme'] }
  const repository = repositoryWith(async (received, profileId) => { calls.push({ received, profileId }); return report })

  await repository.importLibraryDocumentIntoEmptyProfile({ ...profile, id: 'vide' }, doc)

  assert.equal(calls.length, 1, 'une seule restauration de l’expérience')
  assert.equal(calls[0].profileId, 'vide', 'sur le profil restauré')
  assert.deepEqual(calls[0].received, experience, 'avec le bloc du document')
  assert.deepEqual(repository.takeExperienceOutcome(), report, 'le bilan est disponible')
  assert.equal(repository.takeExperienceOutcome(), null, 'et rendu une seule fois')
})

test('Si l’expérience ne peut pas être restaurée, les fiches le sont quand même et le bilan le dit', async () => {
  const doc = createLibraryDocument(library, undefined, buildExperience([view('À revoir')], {}))
  const repository = repositoryWith(async () => { throw new Error('base verrouillée') })
  const restored = await repository.importLibraryDocumentIntoEmptyProfile({ ...profile, id: 'vide' }, doc)

  assert.equal(restored.profile.id, 'vide', 'la restauration des fiches n’échoue pas')
  assert.equal(repository.takeExperienceOutcome(), 'failed')
  assert.equal(repository.takeExperienceOutcome(), null)
})

test('Un profil restauré sans restaurateur branché ne produit aucun bilan', async () => {
  const repository = repositoryWith(null)
  await repository.importLibraryDocumentIntoEmptyProfile({ ...profile, id: 'vide' }, createLibraryDocument(library))
  assert.equal(repository.takeExperienceOutcome(), null)
})

