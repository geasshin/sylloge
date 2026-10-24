// Partager une carte : copier l'image puis ouvrir le service, ou l'enregistrer quand le service ne permet
// pas de publier depuis un ordinateur. Le point délicat : le presse-papiers n'accepte l'écriture que dans
// le geste de la personne ; l'écriture doit donc être demandée tout de suite, avec une image encore « en
// cours de fabrication » (promesse), et non après avoir attendu le dessin.
import assert from 'node:assert/strict'
import test from 'node:test'
import { copyCard, shareToDestination } from '../src/data/shareActions.ts'
import { SHARE_DESTINATIONS } from '../src/domain/shareFormats.ts'

const destination = id => SHARE_DESTINATIONS.find(entry => entry.id === id)
const PNG = new Uint8Array([137, 80, 78, 71])

function deps(over = {}) {
  const calls = []
  return {
    calls,
    clipboard: { write: async items => { calls.push(['write', items.length]); if (over.copyFails) throw new Error('refusé') } },
    makeItem: promise => ({ promise }),
    open: async url => { calls.push(['open', url]); if (over.openFails) throw new Error('introuvable') },
    save: async (name, png) => { calls.push(['save', name, png.length]); return over.cancelSave ? null : name },
    ...over.replace,
  }
}

test('L’écriture dans le presse-papiers est demandée sans attendre le dessin (dans le geste du clic)', async () => {
  const d = deps()
  let release
  const render = () => new Promise(resolve => { release = () => resolve(PNG) })
  const pending = shareToDestination(destination('whatsapp'), render, d, 'cette-carte.png')
  assert.deepEqual(d.calls, [['write', 1]], 'écriture déjà demandée alors que l’image n’existe pas encore')
  release()
  await pending
})

test('Copie réussie : le service s’ouvre ensuite', async () => {
  const d = deps()
  const result = await shareToDestination(destination('whatsapp'), async () => PNG, d, 'carte.png')
  assert.deepEqual(result, { kind: 'copied-opened', destination: 'WhatsApp' })
  assert.deepEqual(d.calls, [['write', 1], ['open', 'https://web.whatsapp.com/']])
})

test('Chaque service ouvre sa page', async () => {
  const opened = []
  for (const id of ['whatsapp', 'messenger', 'x']) {
    const d = deps()
    await shareToDestination(destination(id), async () => PNG, d, 'carte.png')
    opened.push(d.calls.find(call => call[0] === 'open')[1])
  }
  assert.deepEqual(opened, ['https://web.whatsapp.com/', 'https://www.messenger.com/', 'https://x.com/compose/post'])
})

test('Copie refusée : l’image est enregistrée à la place, et le service s’ouvre pour y glisser le fichier', async () => {
  const d = deps({ copyFails: true })
  const result = await shareToDestination(destination('messenger'), async () => PNG, d, 'carte.png')
  assert.deepEqual(result, { kind: 'copy-failed-saved', file: 'carte.png', destination: 'Messenger' })
  assert.deepEqual(d.calls.map(call => call[0]), ['write', 'save', 'open'])
})

test('Copie refusée puis enregistrement annulé : rien n’est écrit, rien ne s’ouvre', async () => {
  const d = deps({ copyFails: true, cancelSave: true })
  const result = await shareToDestination(destination('x'), async () => PNG, d, 'carte.png')
  assert.deepEqual(result, { kind: 'cancelled' })
  assert.deepEqual(d.calls.map(call => call[0]), ['write', 'save'])
})

test('Pas de presse-papiers dans cette fenêtre : même repli que pour une copie refusée', async () => {
  const d = deps({ replace: { clipboard: null } })
  const result = await shareToDestination(destination('x'), async () => PNG, d, 'carte.png')
  assert.equal(result.kind, 'copy-failed-saved')
})

test('Copie réussie mais service injoignable : on le dit, l’image reste copiée', async () => {
  const d = deps({ openFails: true })
  const result = await shareToDestination(destination('x'), async () => PNG, d, 'carte.png')
  assert.deepEqual(result, { kind: 'copied-open-failed', destination: 'X' })
})

test('Story Instagram : une story ne se publie que depuis le téléphone, l’image est enregistrée (sans presse-papiers ni page web)', async () => {
  const d = deps()
  const result = await shareToDestination(destination('instagram-story'), async () => PNG, d, 'story.png')
  assert.deepEqual(result, { kind: 'saved-for-instagram', file: 'story.png' })
  assert.deepEqual(d.calls, [['save', 'story.png', 4]])
})

test('Story Instagram, enregistrement annulé', async () => {
  const d = deps({ cancelSave: true })
  assert.deepEqual(await shareToDestination(destination('instagram-story'), async () => PNG, d, 'story.png'), { kind: 'cancelled' })
})

test('Dessin impossible : échec franc, rien n’est ouvert ni écrit', async () => {
  const d = deps()
  const result = await shareToDestination(destination('whatsapp'), async () => { throw new Error('canevas') }, d, 'carte.png')
  assert.deepEqual(result, { kind: 'failed' })
  assert.ok(!d.calls.some(call => call[0] === 'open' || call[0] === 'save'))
})

test('Copier l’image seule : réussite, échec franc (sans enregistrement silencieux)', async () => {
  const ok = deps()
  assert.deepEqual(await copyCard(async () => PNG, ok), { kind: 'copied' })
  assert.deepEqual(ok.calls, [['write', 1]])
  const refused = deps({ copyFails: true })
  assert.deepEqual(await copyCard(async () => PNG, refused), { kind: 'copy-failed' })
  assert.deepEqual(refused.calls.map(call => call[0]), ['write'], 'une copie seule ne crée jamais de fichier de son propre chef')
})
