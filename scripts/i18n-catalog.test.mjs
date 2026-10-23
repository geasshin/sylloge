import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))
const { catalogs, english } = await import('../src/i18n/catalog.ts')
const CONTEXT_SEPARATOR = '\u0004'

const sourceFiles = []
const scan = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) { if (entry.name !== 'catalogs') scan(path) }
    else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) sourceFiles.push(path)
  }
}
scan(join(root, 'src'))

const unescapeLiteral = (text, quote) => text.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, code) => {
  if (code[0] === 'u' && code.length === 5) return String.fromCharCode(parseInt(code.slice(1), 16))
  if (code[0] === 'x' && code.length === 3) return String.fromCharCode(parseInt(code.slice(1), 16))
  return ({ n: '\n', t: '\t', r: '\r', '0': '\0' })[code] ?? code
}).replaceAll(`\\${quote}`, quote)

/** Literal keys of t('…'), tc('contexte', '…') and t`… ${x} …` in the application sources. */
function usedKeys() {
  const used = []
  const STRING = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"`
  const TEMPLATE = '`((?:[^`\\\\$]|\\\\.|\\$(?!\\{))*)`'
  const call = new RegExp(String.raw`(?<![\w$.])t\(\s*(?:` + STRING + '|' + TEMPLATE + ')', 'g')
  const contextual = new RegExp(String.raw`(?<![\w$.])tc\(\s*(?:` + STRING + String.raw`)\s*,\s*(?:` + STRING + '|' + TEMPLATE + ')', 'g')
  const tagged = /(?<![\w$.])t`((?:[^`\\]|\\.)*)`/g
  for (const file of sourceFiles) {
    const text = readFileSync(file, 'utf8')
    const at = (index) => `${relative(root, file)}:${text.slice(0, index).split('\n').length}`
    for (const match of text.matchAll(call)) {
      const [single, double, template] = [match[1], match[2], match[3]]
      const key = single !== undefined ? unescapeLiteral(single, "'") : double !== undefined ? unescapeLiteral(double, '"') : unescapeLiteral(template, '`')
      used.push({ key, at: at(match.index) })
    }
    for (const match of text.matchAll(contextual)) {
      const context = match[1] ?? match[2]
      const [single, double, template] = [match[3], match[4], match[5]]
      const key = single !== undefined ? unescapeLiteral(single, "'") : double !== undefined ? unescapeLiteral(double, '"') : unescapeLiteral(template, '`')
      used.push({ key, context: unescapeLiteral(context, "'"), at: at(match.index) })
    }
    for (const match of text.matchAll(tagged)) {
      let index = 0
      const key = unescapeLiteral(match[1].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, () => `{${index++}}`), '`')
      used.push({ key, at: at(match.index) })
    }
  }
  return used
}

const placeholders = (text) => [...text.matchAll(/\{([\w]+)\}/g)].map((match) => match[1]).sort().join(',')

test('Chaque texte passé à t() ou tc() a une traduction anglaise au catalogue', () => {
  const missing = usedKeys().filter(({ key, context }) => {
    if (!/[A-Za-zÀ-ÿ]{2}/.test(key)) return false
    return !(context ? Object.hasOwn(english, `${context}${CONTEXT_SEPARATOR}${key}`) || Object.hasOwn(english, key) : Object.hasOwn(english, key))
  })
  assert.deepEqual(missing.map(({ key, context, at }) => `${at}  ${context ? `[${context}] ` : ''}${JSON.stringify(key)}`), [], `${missing.length} clé(s) sans traduction`)
})

test('Source et traduction portent les mêmes placeholders, et aucune traduction n’est vide', () => {
  const problems = []
  for (const [name, entries] of Object.entries(catalogs)) {
    for (const [key, value] of Object.entries(entries)) {
      const source = key.includes(CONTEXT_SEPARATOR) ? key.split(CONTEXT_SEPARATOR)[1] : key
      if (typeof value !== 'string' || value.trim() === '') problems.push(`${name}: traduction vide pour ${JSON.stringify(key)}`)
      else if (placeholders(source) !== placeholders(value)) problems.push(`${name}: placeholders différents ${JSON.stringify(key)} → ${JSON.stringify(value)}`)
    }
  }
  assert.deepEqual(problems, [])
})

test('Deux catalogues ne donnent jamais deux traductions différentes à la même phrase', () => {
  const seen = new Map()
  const conflicts = []
  for (const [name, entries] of Object.entries(catalogs)) {
    for (const [key, value] of Object.entries(entries)) {
      const previous = seen.get(key)
      if (previous && previous.value !== value) conflicts.push(`${JSON.stringify(key.replace(CONTEXT_SEPARATOR, ' ⟨ctx⟩ '))} → ${previous.name}: ${JSON.stringify(previous.value)} | ${name}: ${JSON.stringify(value)}`)
      else if (!previous) seen.set(key, { name, value })
    }
  }
  assert.deepEqual(conflicts, [], 'Un mot à double sens se départage avec tc(contexte, texte), pas avec deux traductions')
})

test('Une clé contextuelle a un contexte et une source non vides', () => {
  const malformed = Object.keys(english).filter((key) => key.includes(CONTEXT_SEPARATOR)).filter((key) => {
    const [context, source, ...rest] = key.split(CONTEXT_SEPARATOR)
    return !context || !source || rest.length > 0
  })
  assert.deepEqual(malformed, [])
})

test('L’extraction des clés trouve réellement les appels t(), tc() et t`…` (garde contre un faux vert)', () => {
  const used = usedKeys()
  assert.ok(used.length > 600, `seulement ${used.length} clés extraites : l’expression régulière est cassée ?`)
  assert.ok(used.some(({ key, at }) => key === 'Fermer l’assistant' && at.startsWith('src/components/AccessibleDialog.tsx')), 'appel t(\'…\') non vu')
  assert.ok(used.some(({ key }) => key === 'Ouvrir la fiche de {0}'), 'gabarit étiqueté t`…` non vu')
})
