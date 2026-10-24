// Ouverture des liens externes : dans la fenêtre native, un <a target="_blank"> ne fait rien.
// Le clic doit être confié au système (navigateur par défaut) ; dans un navigateur ordinaire, le
// comportement natif du lien reste intact.
import assert from 'node:assert/strict'
import test from 'node:test'
import { externalLinkTarget, handleExternalLinkClick } from '../src/data/externalLinks.ts'

test('Seules les adresses https absolues sont confiées au système', () => {
  assert.equal(externalLinkTarget('https://letterboxd.com/settings/data/'), 'https://letterboxd.com/settings/data/')
  assert.equal(externalLinkTarget('https://www.themoviedb.org'), 'https://www.themoviedb.org/')
  assert.equal(externalLinkTarget('  https://openlibrary.org '), 'https://openlibrary.org/')
  for (const refused of [null, '', '#section', '/relatif', 'http://exemple.fr', 'mailto:a@b.fr', 'tel:+33123456789', 'file:///etc/passwd',
    'javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://exemple.fr', 'https://', 'https:exemple.fr', 'https://exemple.fr/a b']) {
    assert.equal(externalLinkTarget(refused), null, `refusé : ${refused}`)
  }
})

function click(href, { button = 0, defaultPrevented = false, modifiers = {} } = {}) {
  const prevented = { value: false }
  const anchor = href === undefined ? null : { getAttribute: name => (name === 'href' ? href : null) }
  const event = {
    button, defaultPrevented, ...modifiers,
    target: { closest: selector => (selector === 'a[href]' ? anchor : null) },
    preventDefault: () => { prevented.value = true },
  }
  return { event, prevented }
}

test('Natif : le clic sur un lien https est détourné vers le système', async () => {
  const opened = []
  const { event, prevented } = click('https://letterboxd.com/settings/data/')
  const handled = handleExternalLinkClick(event, { isNative: () => true, open: async url => { opened.push(url) } })
  assert.equal(handled, true)
  assert.equal(prevented.value, true, 'la navigation de la fenêtre est empêchée')
  await Promise.resolve()
  assert.deepEqual(opened, ['https://letterboxd.com/settings/data/'])
})

test('Navigateur ordinaire : le lien garde son comportement natif', () => {
  const opened = []
  const { event, prevented } = click('https://letterboxd.com/')
  assert.equal(handleExternalLinkClick(event, { isNative: () => false, open: async url => { opened.push(url) } }), false)
  assert.equal(prevented.value, false)
  assert.deepEqual(opened, [])
})

test('Les clics qui ne sont pas un lien externe ne sont pas touchés', () => {
  const deps = { isNative: () => true, open: async () => { throw new Error('ne doit pas être appelé') } }
  for (const [label, scenario] of [
    ['hors lien', click(undefined)],
    ['ancre interne', click('#parametres')],
    ['http non chiffré', click('http://exemple.fr')],
    ['mailto', click('mailto:a@b.fr')],
    ['clic droit', click('https://exemple.fr', { button: 2 })],
    ['déjà traité par un autre gestionnaire', click('https://exemple.fr', { defaultPrevented: true })],
  ]) {
    assert.equal(handleExternalLinkClick(scenario.event, deps), false, label)
    assert.equal(scenario.prevented.value, false, label)
  }
})

test('Un échec d’ouverture est signalé sans casser la page', async () => {
  const failures = []
  const { event } = click('https://exemple.fr/')
  handleExternalLinkClick(event, {
    isNative: () => true,
    open: async () => { throw new Error('refusé par la portée') },
    onError: (url, error) => failures.push([url, String(error.message)]),
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(failures, [['https://exemple.fr/', 'refusé par la portée']])
})
