import test from 'node:test'
import assert from 'node:assert/strict'
import {
  initialIncrementalCount,
  nextIncrementalCount,
  shouldUseIncremental,
} from '../src/domain/incrementalList.ts'

test('une petite liste est rendue en entier', () => {
  assert.equal(initialIncrementalCount(12), 12)
  assert.equal(shouldUseIncremental(12), false)
  assert.equal(nextIncrementalCount(12, 12), 12)
})

test('une liste dépasse une page commence à 200', () => {
  assert.equal(initialIncrementalCount(5_000), 200)
  assert.equal(shouldUseIncremental(5_000), true)
  assert.equal(nextIncrementalCount(200, 5_000), 400)
  assert.equal(nextIncrementalCount(4_900, 5_000), 5_000)
})

test('le compteur ne dépasse jamais le total et ne recule pas', () => {
  assert.equal(nextIncrementalCount(5_000, 5_000), 5_000)
  assert.equal(nextIncrementalCount(200, 500), 400)
  assert.equal(nextIncrementalCount(200, 250), 250)
})

test('les valeurs négatives ou fractionnaires restent sûres', () => {
  assert.equal(initialIncrementalCount(-4), 0)
  assert.equal(initialIncrementalCount(500, 0), 1)
})
