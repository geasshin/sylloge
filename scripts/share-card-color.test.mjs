// Cartes à partager : la lueur d'ambiance tirée des affiches. Une affiche très claire ne doit jamais
// éclaircir le fond au point de rendre les petits textes illisibles : la teinte est plafonnée, et le texte
// secondaire garde un contraste d'au moins 4,5:1 sur le pire fond possible.
import assert from 'node:assert/strict'
import test from 'node:test'
import { AMBIENT_ALPHA, AMBIENT_BASE, averageColor, ambientTint } from '../src/domain/shareCardColor.ts'

const luminance = ([r, g, b]) => {
  const lin = value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16))
const SECONDARY = hex('#B5B5BC')
const over = tint => AMBIENT_BASE.map((channel, i) => Math.round(channel * (1 - AMBIENT_ALPHA) + tint[i] * AMBIENT_ALPHA))

test('Couleur moyenne : moyenne des pixels opaques, les pixels transparents sont ignorés', () => {
  const data = [255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 0] // rouge, bleu, et un pixel transparent
  assert.deepEqual(averageColor(data), [128, 0, 128])
  assert.equal(averageColor([10, 10, 10, 0]), null, 'rien d’opaque : pas de couleur')
  assert.equal(averageColor([]), null)
})

test('La teinte d’ambiance garde la couleur dominante mais jamais plus de 150 sur un canal', () => {
  const red = ambientTint([230, 30, 30])
  assert.ok(red[0] > red[1] * 2 && red[0] > red[2] * 2, 'le rouge reste le canal dominant')
  for (const color of [[255, 255, 255], [255, 255, 0], [0, 255, 255], [250, 120, 10], [10, 10, 10]]) {
    assert.ok(Math.max(...ambientTint(color)) <= 150, `plafonné : ${color}`)
  }
  assert.deepEqual(ambientTint([128, 128, 128]).map(channel => channel <= 150), [true, true, true])
})

test('Pire cas : sur n’importe quelle couleur d’affiche, le texte secondaire garde un contraste d’au moins 4,5:1', () => {
  let worst = Infinity
  for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) {
    const ratio = contrast(SECONDARY, over(ambientTint([r, g, b])))
    worst = Math.min(worst, ratio)
    assert.ok(ratio >= 4.5, `contraste ${ratio.toFixed(2)} sur ${[r, g, b]}`)
  }
  assert.ok(worst >= 4.5)
})

test('Le texte principal garde plus de 7:1 sur le pire fond', () => {
  const primary = hex('#EDEDEF')
  for (const color of [[255, 255, 255], [255, 255, 0], [0, 255, 255]]) assert.ok(contrast(primary, over(ambientTint(color))) >= 7)
})
