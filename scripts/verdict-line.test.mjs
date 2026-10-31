import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verdictLine } from '../src/domain/verdictLine.ts'

const render = ({ template, params }) => template.replace(/\{(\w+)\}/g, (_, key) => params[key])

test('sans date, seul le statut reste', () => {
  assert.equal(render(verdictLine({ status: 'À découvrir', date: null, mode: 'reached', matches: false, dateLabel: 'Vu le' })), 'À découvrir')
})

test('une date de fin se lit avec le statut atteint', () => {
  assert.equal(render(verdictLine({ status: 'Terminé', date: '29 novembre 2024', mode: 'reached', matches: true, dateLabel: 'Vu le' })), 'Terminé le 29 novembre 2024')
  assert.equal(render(verdictLine({ status: 'Joué', date: '3 octobre 2026', mode: 'reached', matches: true, dateLabel: 'Partie' })), 'Joué le 3 octobre 2026')
})

test('un statut qui ne correspond pas à la date garde le libellé de la date', () => {
  assert.equal(render(verdictLine({ status: 'À découvrir', date: '29 novembre 2024', mode: 'reached', matches: false, dateLabel: 'Vu le' })), 'À découvrir · Vu le 29 novembre 2024')
})

test('une date de début : « en cours depuis », puis « commencée le »', () => {
  assert.equal(render(verdictLine({ status: 'En cours', date: '27 août 2026', mode: 'started-f', matches: true, dateLabel: '' })), 'En cours depuis le 27 août 2026')
  assert.equal(render(verdictLine({ status: 'Vue', date: '27 août 2026', mode: 'started-f', matches: false, dateLabel: '' })), 'Vue · commencée le 27 août 2026')
  assert.equal(render(verdictLine({ status: 'Lu', date: '2 mars 2025', mode: 'started-m', matches: false, dateLabel: '' })), 'Lu · commencé le 2 mars 2025')
})
