import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const argumentNames = new Set(['--version', '--notes-file', '--url', '--signature-file', '--target', '--output'])
const argumentsByName = new Map()
const numericIdentifier = '(?:0|[1-9]\\d*)'
const alphaNumericIdentifier = '(?:\\d*[A-Za-z-][0-9A-Za-z-]*)'
const prereleaseIdentifier = `(?:${numericIdentifier}|${alphaNumericIdentifier})`
const semverPattern = new RegExp(
  `^v?${numericIdentifier}\\.${numericIdentifier}\\.${numericIdentifier}(?:-${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
)

for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index]
  const value = process.argv[index + 1]
  if (!argumentNames.has(name) || !value || argumentsByName.has(name)) {
    throw new Error('Arguments attendus : --version, --notes-file, --url, --signature-file, --target et --output.')
  }
  argumentsByName.set(name, value)
}

if (argumentsByName.size !== argumentNames.size) {
  throw new Error('Arguments attendus : --version, --notes-file, --url, --signature-file, --target et --output.')
}

const version = argumentsByName.get('--version')
const notesFile = argumentsByName.get('--notes-file')
const archiveUrl = argumentsByName.get('--url')
const signatureFile = argumentsByName.get('--signature-file')
const target = argumentsByName.get('--target')
const output = argumentsByName.get('--output')

if (!semverPattern.test(version)) {
  throw new Error('La version doit être un numéro Semantic Versioning valide.')
}

if (!/^(darwin|linux|windows)-(x86_64|aarch64|i686|armv7)$/.test(target)) {
  throw new Error('La cible doit suivre le format Tauri OS-ARCH, par exemple darwin-aarch64.')
}

let parsedUrl
try {
  parsedUrl = new URL(archiveUrl)
} catch {
  throw new Error('L’URL de l’archive est invalide.')
}
if (parsedUrl.protocol !== 'https:') {
  throw new Error('L’URL de l’archive doit utiliser HTTPS.')
}

const notesPath = resolve(notesFile)
const signaturePath = resolve(signatureFile)
const outputPath = resolve(output)
if (outputPath === notesPath || outputPath === signaturePath) {
  throw new Error('Le fichier de sortie doit être distinct des fichiers de notes et de signature.')
}

const notes = readFileSync(notesPath, 'utf8').trim()
const signature = readFileSync(signaturePath, 'utf8').trim()
if (!notes) throw new Error('Les notes de version sont vides.')
if (!signature) throw new Error('Le fichier .sig est vide.')

const manifest = {
  version,
  notes,
  platforms: {
    [target]: {
      signature,
      url: parsedUrl.toString(),
    },
  },
}

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
