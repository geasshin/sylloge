import assert from 'node:assert/strict'
import { test } from 'node:test'

const core = await import('../src/i18n/core.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null
  throw error
})

test('La préférence explicite prime sur la première langue système prise en charge', () => {
  assert.equal(typeof core?.resolveLanguage, 'function', 'La résolution FR/EN doit être disponible')
  assert.equal(core.resolveLanguage('fr', ['en-GB']), 'fr')
  assert.equal(core.resolveLanguage('en', ['fr-CA']), 'en')
  assert.equal(core.resolveLanguage(null, ['de-DE', 'fr-CA', 'en-US']), 'fr')
  assert.equal(core.resolveLanguage(null, ['en-US', 'fr-FR']), 'en')
  assert.equal(core.resolveLanguage('corrupt', ['fr-CH']), 'fr')
  assert.equal(core.resolveLanguage(null, ['es-ES']), 'en')
})

test('La traduction interpole seulement les paramètres, jamais le contenu personnel', () => {
  assert.equal(typeof core?.t, 'function', 'Un catalogue explicite doit traduire les textes de l’interface')
  core.setLanguage('en')
  assert.equal(core.t('Enregistrer'), 'Save')
  assert.equal(core.t('Ouvrir la fiche de {title}', { title: 'En cours' }), 'Open details for En cours')
  assert.equal(core.t`Ouvrir la fiche de ${'En cours'}`, 'Open details for En cours')
  assert.equal(core.t('Un titre personnel hors catalogue'), 'Un titre personnel hors catalogue')
  core.setLanguage('fr')
  assert.equal(core.t('Enregistrer'), 'Enregistrer')
  assert.equal(core.t('Ouvrir la fiche de {title}', { title: '$& <script>' }), 'Ouvrir la fiche de $& <script>')
})

test('Les diagnostics déjà interpolés gardent le texte source et les paramètres intacts', () => {
  assert.equal(typeof core.translateMessage, 'function', 'Les diagnostics dynamiques doivent être traduits à la frontière UI')
  core.setLanguage('en')
  assert.equal(core.translateMessage('La colonne « En cours » n’existe pas dans le fichier.'), 'The column “En cours” does not exist in the file.')
  assert.equal(core.translateMessage('Le message du système non reconnu: En cours'), 'Le message du système non reconnu: En cours')
  core.setLanguage('fr')
})

test('Dates calendaires et nombres suivent la langue sans décaler un jour', () => {
  core.setLanguage('en')
  assert.equal(core.getLocale(), 'en-GB')
  assert.equal(core.formatDate('2026-10-23', { month: 'long', day: 'numeric' }), '23 October')
  assert.equal(core.formatNumber(1234.5), '1,234.5')
  core.setLanguage('fr')
  assert.equal(core.formatDate('2026-10-23', { month: 'long', day: 'numeric' }), '23 octobre')
  assert.equal(core.formatDate('invalid'), 'invalid')
})

test('Un contexte départage deux sens d’un même mot français et retombe sur la traduction simple', () => {
  assert.equal(typeof core.tc, 'function', 'Le contexte doit exister pour les mots à double sens')
  core.setLanguage('en')
  assert.equal(core.tc('comics', 'Dessin'), 'Artist')
  assert.equal(core.t('Dessin'), 'Drawing', 'Sans contexte, le sens courant reste celui de la forme d’art')
  assert.equal(core.tc('podcasts', 'Animation'), 'Host')
  assert.equal(core.tc('contexte inconnu', 'Enregistrer'), 'Save', 'Repli sur la traduction sans contexte')
  assert.equal(core.tc('comics', 'Texte français hors catalogue'), 'Texte français hors catalogue')
  assert.equal(core.tc('comics', 'Ouvrir la fiche de {title}', { title: 'Dessin' }), 'Open details for Dessin')
  core.setLanguage('fr')
  assert.equal(core.tc('comics', 'Dessin'), 'Dessin', 'Le français reste la langue source')
})

test('Les gabarits courts commençant par un mot fixe restent traduisibles sans avaler un message plus précis', () => {
  core.setLanguage('en')
  assert.equal(core.translateMessage('Ligne 12'), 'Line 12')
  assert.equal(core.translateMessage('Lignes 3, 5'), 'Lines 3, 5')
  assert.equal(core.translateMessage('{0} / {1}'), '{0} / {1}', 'Un gabarit sans mot fixe ne doit jamais correspondre')
  assert.equal(core.translateMessage('La colonne « Ligne 5 » n’existe pas dans le fichier.'), 'The column “Ligne 5” does not exist in the file.')
  core.setLanguage('fr')
})
