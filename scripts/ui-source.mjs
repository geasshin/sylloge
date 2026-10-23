import { readFileSync } from 'node:fs'

/**
 * Relit une source d'interface « comme avant la traduction ».
 *
 * `scripts/verify.mjs` vérifie la structure du code (nom accessible d'un bouton, accord d'un libellé, ordre
 * des éléments) en cherchant le texte français dans le source. Depuis l'interface bilingue, ce texte est écrit
 * `t('…')`. Cette lecture retire les appels `t()`, `tc()` et `translateMessage()` et rend le français tel
 * qu'il était écrit : les vérifications de structure restent valables, l'anglais est prouvé par les tests
 * `scripts/i18n-*.test.mjs`, qui rendent les vrais composants.
 *
 * - `{t('Accueil')}` devient `Accueil`, `aria-label={t('Fermer')}` devient `aria-label="Fermer"` ;
 * - ``t`Ouvrir ${titre}` `` devient ``` `Ouvrir ${titre}` ``` ;
 * - `t('{n} sur {m}', { n, m })` devient ``` `${n} sur ${m}` ``` ;
 * - `t(variable)`, `tc(contexte, 'Texte')` et `translateMessage(message)` gardent leur argument.
 */
export function withoutTranslation(input) {
  return transform(input.replace(/(?<![\w$.])t(?=`)/g, ''))
}

export function readUiSource(url) {
  return withoutTranslation(readFileSync(url, 'utf8'))
}

const CALL = /(?<![\w$.])(translateMessage|tc|t)\(/g

function skipQuoted(source, start) {
  const quote = source[start]
  for (let index = start + 1; index < source.length; index++) {
    if (source[index] === '\\') index++
    else if (source[index] === quote) return index
  }
  return source.length
}

function skipTemplate(source, start) {
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index]
    if (char === '\\') index++
    else if (char === '`') return index
    else if (char === '$' && source[index + 1] === '{') {
      const end = closing(source, index + 1)
      if (end < 0) return source.length
      index = end
    }
  }
  return source.length
}

/** Index of the bracket that closes the one at `start`, or -1. */
function closing(source, start) {
  let depth = 0
  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (char === '"' || char === "'") index = skipQuoted(source, index)
    else if (char === '`') index = skipTemplate(source, index)
    else if (char === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index)
      if (end < 0) return -1
      index = end
    } else if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2)
      if (end < 0) return -1
      index = end + 1
    } else if ('([{'.includes(char)) depth++
    else if (')]}'.includes(char)) {
      depth--
      if (depth === 0) return index
    }
  }
  return -1
}

/** Top-level comma separated parts of source[start, end). */
function splitTopLevel(source) {
  const parts = []
  let from = 0
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (char === '"' || char === "'") index = skipQuoted(source, index)
    else if (char === '`') index = skipTemplate(source, index)
    else if ('([{'.includes(char)) { const end = closing(source, index); if (end < 0) break; index = end }
    else if (char === ',') { parts.push(source.slice(from, index)); from = index + 1 }
  }
  const last = source.slice(from)
  if (last.trim() !== '') parts.push(last)
  return parts
}

const plainLiteral = (text) => /^(['"])(?:\\.|(?!\1)[^\\\n])*\1$/.test(text) || /^`(?:[^`\\$]|\\.|\$(?!\{))*`$/.test(text)

function namedValues(objectText) {
  const body = objectText.trim()
  if (!body.startsWith('{') || closing(body, 0) !== body.length - 1) return null
  const values = new Map()
  for (const part of splitTopLevel(body.slice(1, -1))) {
    const property = part.trim()
    if (property === '') continue
    const named = property.match(/^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/)
    if (named) values.set(named[1], named[2].trim())
    else if (/^[A-Za-z_$][\w$]*$/.test(property)) values.set(property, property)
    else return null
  }
  return values
}

function replacement(name, args) {
  if (name === 'translateMessage') return args[0]?.trim() ?? ''
  const rest = name === 'tc' ? args.slice(1) : args
  const source = rest[0]?.trim() ?? ''
  if (rest.length < 2 || !plainLiteral(source)) return source
  const values = namedValues(rest[1])
  if (values === null) return source
  const inner = source.slice(1, -1)
  if (!/\{[\w]+\}/.test(inner)) return source
  const template = inner.replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\{([\w]+)\}/g, (placeholder, key) => values.has(key) ? `\${${values.get(key)}}` : placeholder)
  return `\`${template}\``
}

function transform(input) {
  let output = ''
  let from = 0
  CALL.lastIndex = 0
  for (;;) {
    CALL.lastIndex = from
    const match = CALL.exec(input)
    if (!match) return output + input.slice(from)
    const open = match.index + match[0].length - 1
    const close = closing(input, open)
    if (close < 0) return output + input.slice(from)
    const args = splitTopLevel(input.slice(open + 1, close)).map(transform)
    let text = replacement(match[1], args)
    output += input.slice(from, match.index)
    from = close + 1
    // {t('Texte')} directement enfant JSX ou valeur d'attribut : retirer aussi les accolades.
    const beforeBrace = output.trimEnd()
    const following = input.slice(from).match(/^\s*\}/)
    const literal = plainLiteral(text) && !text.startsWith('`')
    if (literal && following && beforeBrace.endsWith('{')) {
      const braceIndex = beforeBrace.length - 1
      const unescaped = text.slice(1, -1).replace(/\\(['"])/g, '$1')
      const asAttribute = beforeBrace[braceIndex - 1] === '='
      output = output.slice(0, braceIndex) + (asAttribute ? JSON.stringify(unescaped) : unescaped)
      from += following[0].length
      continue
    }
    output += text
  }
}
