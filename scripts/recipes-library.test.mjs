import assert from 'node:assert/strict'
import { test } from 'node:test'

/**
 * Recettes de cuisine : neuvième modèle de bibliothèque personnalisée (migration 0022).
 * Ces tests tiennent trois choses : le catalogue reste cohérent pour les neuf modèles, une
 * recette garde ses textes longs ligne pour ligne, et un document de sauvegarde la relit sans
 * rien perdre.
 */
const {
  CUSTOM_LIBRARY_IDS,
  CUSTOM_LIBRARY_GROUPS,
  CUSTOM_LIBRARY_TEMPLATES,
  CUSTOM_STATUSES,
  RECIPE_STATUSES,
  emptyCustomEntryForm,
  isStatusAllowedFor,
  validateCustomEntryForm,
  customEntryToFormValues,
  customEntryByline,
} = await import('../src/domain/customLibraries.ts')
const { createLibraryDocument, serializeLibraryDocument, validateLibraryDocument } = await import('../src/domain/libraryDocument.ts')

const timestamp = '2026-10-23T08:00:00.000Z'
const profile = { id: 'profil-recettes', name: 'Cuisinier', createdAt: timestamp, updatedAt: timestamp }
const emptyLibrary = { profile, films: [], series: [], anime: [], books: [], mangas: [], games: [], artworks: [] }

const INGREDIENTS = '200 g de farine\r\n100 g de beurre\n\n  3 œufs  \n=1 pincée de sel'
const STEPS = '1. Mélanger.\n2. Cuire 35 min à 180 °C.\n\n日本語 — dernier paragraphe'

const recipe = (overrides = {}) => ({
  id: 'recette-1',
  profileId: profile.id,
  title: 'Tarte aux pommes',
  creator: 'Grand-mère',
  year: null,
  status: 'maîtrisée',
  rating: 4.5,
  isFavorite: true,
  progressCurrent: null,
  progressTotal: null,
  progressUpdatedAt: null,
  startedAt: null,
  finishedAt: '2026-10-20',
  coverUrl: 'https://exemple.org/tarte.jpg',
  summary: null,
  personalNote: 'Moins de sucre la prochaine fois.',
  details: { dish: 'Dessert', servings: '6 personnes', prepTime: '25 min', cookTime: '40 min', ingredients: INGREDIENTS, steps: STEPS },
  quotes: [],
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
})

test('Le catalogue compte neuf modèles et les recettes en font partie', () => {
  assert.equal(CUSTOM_LIBRARY_IDS.length, 9)
  assert.ok(CUSTOM_LIBRARY_IDS.includes('recipes'))
  assert.deepEqual(Object.keys(CUSTOM_LIBRARY_TEMPLATES).sort(), [...CUSTOM_LIBRARY_IDS].sort())
})

test('Chaque modèle du catalogue est cohérent avec ce que la base accepte', () => {
  for (const id of CUSTOM_LIBRARY_IDS) {
    const template = CUSTOM_LIBRARY_TEMPLATES[id]
    assert.equal(template.id, id)
    assert.ok(CUSTOM_LIBRARY_GROUPS.includes(template.group), `${id} : famille « ${template.group} » inconnue du catalogue`)
    assert.ok(template.statuses.length > 0 && template.statuses.every((status) => isStatusAllowedFor(id, status)), `${id} : statuts`)
    for (const status of CUSTOM_STATUSES) assert.ok(template.statusLabels[status], `${id} : libellé du statut ${status}`)
    const keys = template.fields.map((field) => field.key)
    assert.equal(new Set(keys).size, keys.length, `${id} : clés de champs uniques`)
    if (template.kindField !== null) {
      const kind = template.fields.find((field) => field.key === template.kindField)
      assert.equal(kind?.kind, 'select', `${id} : le filtre principal est un champ à choix`)
    }
    for (const field of template.fields) {
      assert.ok(['text', 'select', 'textarea', 'list'].includes(field.kind), `${id}.${field.key} : type de champ`)
      if (field.kind === 'select') assert.ok(field.options && field.options.length > 0, `${id}.${field.key} : options`)
    }
  }
})

test('Le modèle Recettes propose ingrédients et préparation en listes', () => {
  const template = CUSTOM_LIBRARY_TEMPLATES.recipes
  assert.equal(template.label, 'Recettes')
  assert.equal(template.group, 'Cuisine')
  assert.ok(CUSTOM_LIBRARY_GROUPS.includes('Cuisine'))
  assert.equal(template.addLabel, 'Ajouter une recette')
  assert.equal(template.quotes, false)
  assert.equal(template.progress, null)
  assert.equal(template.kindField, 'dish')
  // Une recette n'a ni millésime ni résumé séparé : les temps, les listes et la source disent tout.
  assert.equal(template.showsYear, false)
  assert.equal(template.showsSummary, false)
  const byKey = Object.fromEntries(template.fields.map((field) => [field.key, field]))
  assert.equal(byKey.ingredients.kind, 'list')
  assert.equal(byKey.steps.kind, 'list')
  assert.equal(byKey.ingredients.label, 'Ingrédients')
  assert.equal(byKey.steps.label, 'Étapes')
  assert.equal(byKey.prepTime.label, 'Préparation')
  assert.equal(byKey.cookTime.label, 'Cuisson')
  // Le temps de Notion est un temps total : il va en préparation, pas dans un champ « Durée ».
  assert.equal(byKey.duration, undefined)
  for (const key of ['servings', 'prepTime', 'cookTime']) assert.equal(byKey[key].kind, 'text', key)
  // Le type de plat porte « Pain », pas un rayon « Pain et viennoiserie ».
  assert.ok(byKey.dish.options.includes('Pain'))
  assert.ok(!byKey.dish.options.includes('Pain et viennoiserie'))
  // Le texte libre d'une recette est un bloc de notes, pas un avis de lecture.
  assert.equal(template.noteLabel, 'Notes')
  assert.ok(template.notePlaceholder.length > 0)
  // Deux états : « Testée » doublonnait « Maîtrisée » (arbitrage du 25 octobre).
  assert.deepEqual(template.statuses, ['à découvrir', 'maîtrisée'])
  assert.deepEqual([...RECIPE_STATUSES], ['à découvrir', 'maîtrisée'])
  assert.deepEqual(
    [template.statusLabels['à découvrir'], template.statusLabels['maîtrisée']],
    ['À tester', 'Maîtrisée'],
  )
  // « Testée » et « Écartée » ne sont plus proposés ; leurs libellés restent lisibles
  // sur une fiche enregistrée avant le changement.
  assert.equal(template.statusLabels.terminé, 'Terminé')
  assert.equal(template.statusLabels.abandonné, 'Abandonné')
})

test('« maîtrisée » n’appartient qu’aux recettes', () => {
  assert.equal(isStatusAllowedFor('recipes', 'maîtrisée'), true)
  for (const id of CUSTOM_LIBRARY_IDS.filter((libraryId) => libraryId !== 'recipes')) {
    assert.equal(isStatusAllowedFor(id, 'maîtrisée'), false, id)
  }
  assert.equal(isStatusAllowedFor('comics', 'terminé'), true)
  assert.equal(isStatusAllowedFor('recipes', 'terminé'), false)
  assert.equal(isStatusAllowedFor('recipes', 'en cours'), false)
  assert.equal(isStatusAllowedFor('recipes', 'vinyles'), false)
})

test('Le formulaire garde les lignes d’une recette et ne retire que les marges extérieures', () => {
  const values = { ...customEntryToFormValues(recipe()) }
  values.details = { ...values.details, ingredients: `  \n${INGREDIENTS}\n  `, steps: `${STEPS}\n\n` }
  const result = validateCustomEntryForm('recipes', values)
  assert.equal(result.success, true, JSON.stringify(result.errors))
  assert.equal(result.data.details.ingredients, INGREDIENTS)
  assert.equal(result.data.details.steps, STEPS)
  assert.equal(result.data.coverUrl, 'https://exemple.org/tarte.jpg')
})

test('Un champ long laissé vide n’est pas enregistré', () => {
  const values = { ...emptyCustomEntryForm('recipes'), title: 'Pâtes au beurre' }
  values.details = { ingredients: '   \n  ', steps: '' }
  const result = validateCustomEntryForm('recipes', values)
  assert.equal(result.success, true)
  assert.deepEqual(result.data.details, {})
})

test('Une recette n’accepte pas le statut « en cours »', () => {
  const values = { ...emptyCustomEntryForm('recipes'), title: 'Pâtes', status: 'en cours' }
  const result = validateCustomEntryForm('recipes', values)
  assert.equal(result.success, false)
})

test('Une recette accepte « maîtrisée » comme état', () => {
  const values = { ...emptyCustomEntryForm('recipes'), title: 'Manakish', status: 'maîtrisée' }
  const result = validateCustomEntryForm('recipes', values)
  assert.equal(result.success, true, JSON.stringify(result.errors))
  if (result.success) assert.equal(result.data.status, 'maîtrisée')
})

test('Le sous-titre d’une recette suit le type de plat, la source et l’année', () => {
  assert.equal(customEntryByline('recipes', recipe({ year: null })), 'Dessert · Grand-mère')
  // Une fiche d'avant ce lot peut encore porter un millésime : il reste lisible.
  assert.equal(customEntryByline('recipes', recipe({ year: 2019 })), 'Dessert · Grand-mère · 2019')
})

test('Un document de sauvegarde v5 relit une recette octet pour octet', () => {
  const customLibraries = [{ libraryId: 'recipes', position: 0, addedAt: timestamp, entries: [recipe()] }]
  const document = createLibraryDocument({ ...emptyLibrary, customLibraries }, timestamp)
  const preview = validateLibraryDocument(serializeLibraryDocument(document))
  assert.deepEqual(preview.errors, [])
  assert.deepEqual(preview.document.customLibraries, customLibraries)
  assert.equal(preview.document.customLibraries[0].entries[0].details.ingredients, INGREDIENTS)
  assert.equal(preview.document.customLibraries[0].entries[0].details.steps, STEPS)
})

test('Un document refuse toujours une bibliothèque inconnue et une citation sur une recette', () => {
  const base = createLibraryDocument({ ...emptyLibrary, customLibraries: [{ libraryId: 'recipes', position: 0, addedAt: timestamp, entries: [recipe()] }] }, timestamp)
  const unknown = validateLibraryDocument(JSON.stringify({ ...base, customLibraries: [{ ...base.customLibraries[0], libraryId: 'cocktails' }] }))
  assert.equal(unknown.document, null)
  const quoted = recipe({ quotes: [{ id: 'q', entryId: 'recette-1', body: 'x', position: 0, createdAt: timestamp }] })
  const withQuote = validateLibraryDocument(JSON.stringify({ ...base, customLibraries: [{ ...base.customLibraries[0], entries: [quoted] }] }))
  assert.equal(withQuote.document, null)
})
