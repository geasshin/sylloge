import assert from 'node:assert/strict'
import { test } from 'node:test'

/**
 * Les avertissements d'import sont montrés tels quels à la personne. Trois défauts de composition s'étaient
 * glissés dans l'import CSV des collections : « Note Note « x » illisible… », « Saisons Compteur « x »… » et
 * « Début de visionnage Date « x »… ». Chacun empilait le préfixe de l'appelant sur un gabarit déjà préfixé.
 */
const { prepareCollectionCsvImport, previewCollectionCsvImport } = await import('../src/domain/collectionCsvImport.ts')

const messages = (csv) => {
  const session = prepareCollectionCsvImport('series', csv)
  // Le second argument est le mapping retenu : sans lui, aucune colonne n'est lue.
  const result = previewCollectionCsvImport(session, session.initialMapping)
  return result.errors.map((error) => error.message)
}

const csvWith = (rating, seasonsTotal, startedAt) => [
  'titre,statut,note,saisons au total,début de visionnage',
  `Severance,terminé,${rating},${seasonsTotal},${startedAt}`,
].join('\n')

test('Une note illisible n’est annoncée qu’une fois', () => {
  const warnings = messages(csvWith('carrément', '2', '2026-10-01'))
  const note = warnings.filter((warning) => /Note/.test(warning))
  assert.equal(note.length, 1, JSON.stringify(warnings))
  assert.equal(note[0], 'Note « carrément » illisible — champ laissé vide.')
})

test('Un compteur illisible nomme son champ au lieu d’empiler son gabarit', () => {
  const warnings = messages(csvWith('4', 'beaucoup', '2026-10-01'))
  const count = warnings.filter((warning) => /illisible/.test(warning))
  assert.equal(count.length, 1, JSON.stringify(warnings))
  assert.equal(count[0], 'Saisons au total « beaucoup » illisible — champ laissé vide.')
  assert.doesNotMatch(count[0], /Compteur/)
})

test('Une date illisible nomme son champ, sans empiler le mot Date', () => {
  const warnings = messages(csvWith('4', '2', 'un jour'))
  const date = warnings.filter((warning) => /illisible/.test(warning))
  assert.equal(date.length, 1, JSON.stringify(warnings))
  assert.equal(date[0], 'Début de visionnage « un jour » illisible — champ laissé vide.')
  assert.doesNotMatch(date[0], /Date/)
})
