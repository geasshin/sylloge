import assert from 'node:assert/strict'
import { test } from 'node:test'

/**
 * Ajustement des portions d'une recette (25 novembre 2026). Le calcul est pur :
 * on ne touche jamais au texte enregistré, on ne réécrit que la première
 * quantité de chaque ligne. Ces tests tiennent les cas d'une vraie fiche de
 * cuisine : décimaux à virgule, fractions, fourchettes, unités collées.
 */
const { formatQuantity, parseServings, scaleIngredients } = await import('../src/domain/recipeScaling.ts')

test('Les portions se lisent dans un champ libre', () => {
  assert.deepEqual(parseServings('6 personnes'), { count: 6, unit: 'personnes' })
  assert.deepEqual(parseServings('8 manakish'), { count: 8, unit: 'manakish' })
  assert.deepEqual(parseServings('Pour 4 personnes'), { count: 4, unit: 'personnes' })
  assert.deepEqual(parseServings('2 à 3 personnes'), { count: 2, unit: 'personnes' })
  assert.deepEqual(parseServings('12'), { count: 12, unit: '' })
  assert.equal(parseServings(''), null)
  assert.equal(parseServings(undefined), null)
  assert.equal(parseServings('une grande plaque'), null)
})

test('Une quantité multipliée s’écrit sans fausse précision', () => {
  assert.equal(formatQuantity(0.3333333333), '⅓')
  assert.equal(formatQuantity(0.5), '½')
  assert.equal(formatQuantity(0.25), '¼')
  assert.equal(formatQuantity(1.3333333333), '1 ⅓')
  assert.equal(formatQuantity(1.5), '1 ½')
  assert.equal(formatQuantity(2), '2')
  assert.equal(formatQuantity(3.6428571429), '3,6')
  assert.equal(formatQuantity(5.1), '5,1')
  assert.equal(formatQuantity(153), '153')
  assert.equal(formatQuantity(0.04), '0,04')
  // En grammes ou millilitres, une balance affiche des décimales, pas des fractions.
  assert.equal(formatQuantity(3.3333333333, 'g'), '3,3')
  assert.equal(formatQuantity(3.75, 'g'), '3,8')
  assert.equal(formatQuantity(103.3333333333, 'ml'), '103')
})

test('Une masse ou un volume ajusté reste pesable', () => {
  assert.deepEqual(scaleIngredients(['5 g de sel', '5 g de sucre', '155 ml d’eau'], 6, 4), [
    '3,3 g de sel',
    '3,3 g de sucre',
    '103 ml d’eau',
  ])
})

test('La recette de manakish suit le rapport des portions sans dériver', () => {
  const lines = [
    '350 g de farine T55 ou T65',
    '210 ml d’eau tiède',
    '8 g de levure boulangère sèche',
    '7 g de sel',
    '7 g de sucre',
    '20 ml d’huile d’olive',
    '5 c. à soupe de zaatar',
    '5 c. à soupe d’huile d’olive pour la garniture',
    'Sel, poivre',
    'Pour la garniture :',
  ]
  assert.deepEqual(scaleIngredients(lines, 350, 255), [
    '255 g de farine T55 ou T65',
    '153 ml d’eau tiède',
    '5,8 g de levure boulangère sèche',
    '5,1 g de sel',
    '5,1 g de sucre',
    '14,6 ml d’huile d’olive',
    '3,6 c. à soupe de zaatar',
    '3,6 c. à soupe d’huile d’olive pour la garniture',
    'Sel, poivre',
    'Pour la garniture :',
  ])
})

test('Les fractions et les fourchettes restent lisibles', () => {
  assert.equal(scaleIngredients(['½ c. à café de sel'], 4, 8)[0], '1 c. à café de sel')
  assert.equal(scaleIngredients(['1 ½ c. à soupe d’huile'], 4, 8)[0], '3 c. à soupe d’huile')
  assert.equal(scaleIngredients(['2 ½ pommes'], 4, 2)[0], '1 ¼ pommes')
  assert.equal(scaleIngredients(['1 à 2 gousses d’ail'], 4, 8)[0], '2 à 4 gousses d’ail')
  assert.equal(scaleIngredients(['2-3 pommes'], 4, 8)[0], '4-6 pommes')
  assert.equal(scaleIngredients(['1 / 2 c. à café de sel'], 4, 8)[0], '1 c. à café de sel')
})

test('Ce qui n’est pas une quantité en tête de ligne ne bouge pas', () => {
  const lines = ['Pour la garniture :', 'Sel, poivre', '1 sachet de levure (7 g)', 'Huile d’olive']
  assert.deepEqual(scaleIngredients(lines, 4, 2), [
    'Pour la garniture :',
    'Sel, poivre',
    '½ sachet de levure (7 g)',
    'Huile d’olive',
  ])
})

test('À portions égales ou sans base valide, les lignes sont rendues telles quelles', () => {
  const lines = ['350 g de farine', '1/2 c. à café de sel']
  assert.deepEqual(scaleIngredients(lines, 4, 4), lines)
  assert.deepEqual(scaleIngredients(lines, 0, 4), lines)
  assert.deepEqual(scaleIngredients(lines, 4, 0), lines)
  assert.deepEqual(scaleIngredients(lines, Number.NaN, 4), lines)
})

test('Le calcul ne modifie pas le tableau reçu', () => {
  const lines = ['350 g de farine', 'Sel']
  const copy = [...lines]
  scaleIngredients(lines, 8, 6)
  assert.deepEqual(lines, copy)
})
