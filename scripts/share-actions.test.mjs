// Copier une carte dans le presse-papiers. Le point délicat : le presse-papiers n'accepte l'écriture que
// dans le geste de la personne ; l'écriture doit donc être demandée tout de suite, avec une image encore
// « en cours de fabrication » (promesse), et non après avoir attendu le dessin.
//
// Décision d'Aurélien du 25 octobre 2026 : plus de partage direct vers un service. Il ne reste que la
// copie et l'enregistrement, tous deux testés ici.
import assert from 'node:assert/strict'
import test from 'node:test'
import { copyCard } from '../src/data/shareActions.ts'

const PNG = new Uint8Array([137, 80, 78, 71])

function deps(over = {}) {
  const calls = []
  return {
    calls,
    clipboard: { write: async items => { calls.push(['write', items.length]); if (over.copyFails) throw new Error('refusé') } },
    makeItem: promise => ({ promise }),
    ...over.replace,
  }
}

test('Copier l’image seule : réussite, échec franc (sans enregistrement silencieux)', async () => {
  const ok = deps()
  assert.deepEqual(await copyCard(async () => PNG, ok), { kind: 'copied' })
  assert.deepEqual(ok.calls, [['write', 1]])
  const refused = deps({ copyFails: true })
  assert.deepEqual(await copyCard(async () => PNG, refused), { kind: 'copy-failed' })
  assert.deepEqual(refused.calls.map(call => call[0]), ['write'], 'une copie seule ne crée jamais de fichier de son propre chef')
})

test('Pas de presse-papiers dans cette fenêtre : la copie est refusée, sans fichier', async () => {
  const d = deps({ replace: { clipboard: null } })
  assert.deepEqual(await copyCard(async () => PNG, d), { kind: 'copy-failed' })
  assert.deepEqual(d.calls, [])
})

test('L’écriture est demandée sans attendre le dessin (dans le geste du clic)', async () => {
  const d = deps()
  let release
  const render = () => new Promise(resolve => { release = () => resolve(PNG) })
  const pending = copyCard(render, d)
  assert.deepEqual(d.calls, [['write', 1]], 'écriture déjà demandée alors que l’image n’existe pas encore')
  release()
  await pending
})

test('Dessin impossible : échec franc, rien n’est écrit', async () => {
  const d = deps()
  const result = await copyCard(async () => { throw new Error('canevas') }, d)
  assert.deepEqual(result, { kind: 'failed' })
  assert.deepEqual(d.calls.map(call => call[0]), ['write'])
})
