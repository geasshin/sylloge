import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Fusionne une plateforme dans le manifeste `latest.json` du plugin updater de Tauri, ou le vérifie.
 *
 * Le manifeste publié est statique et partagé par toutes les plateformes : chaque release doit y ajouter
 * son entrée (`darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`). Sans entrée pour sa plateforme, le
 * client reçoit `TargetNotFound` et ne peut jamais se mettre à jour — d'où `--check`, qui refuse un
 * manifeste incomplet.
 *
 * Fusion :
 *   node scripts/merge-tauri-latest-json.mjs --manifest latest.json --version 0.6.11 \
 *     --notes-file notes.md --platform windows-x86_64 \
 *     --url https://github.com/geasshin/sylloge/releases/download/v0.6.11/Sylloge_0.6.11_x64-setup.exe \
 *     --signature-file Sylloge_0.6.11_x64-setup.exe.sig --output latest.json
 *
 * Vérification :
 *   node scripts/merge-tauri-latest-json.mjs --check latest.json --version 0.6.11 \
 *     --require darwin-aarch64 --require windows-x86_64
 */

const PLATFORM_PATTERN = /^(darwin|linux|windows)-(x86_64|aarch64|i686|armv7)$/
const TAG_PATTERN = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const REPOSITORY = 'geasshin/sylloge'

function parseArguments(argv) {
  const flags = new Map()
  const repeated = new Map()

  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (typeof name !== 'string' || !name.startsWith('--') || typeof value !== 'string' || value === '') {
      throw new Error('Arguments attendus sous la forme --nom valeur, sans valeur vide.')
    }
    if (name === '--require') {
      repeated.set(name, [...(repeated.get(name) ?? []), value])
      continue
    }
    if (name === '--check') {
      flags.set('--check', value)
      continue
    }
    if (flags.has(name)) throw new Error(`Argument répété : ${name}.`)
    flags.set(name, value)
  }

  const known = new Set(['--check', '--require', '--manifest', '--version', '--notes-file', '--platform', '--url', '--signature-file', '--alias', '--output'])
  for (const name of [...flags.keys(), ...repeated.keys()]) {
    if (!known.has(name)) throw new Error(`Argument inconnu : ${name}.`)
  }
  return { flags, requires: repeated.get('--require') ?? [] }
}

const { flags, requires } = parseArguments(process.argv.slice(2))

function readManifest(path) {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8'))
  } catch (error) {
    throw new Error(`Le manifeste ${path} est illisible : ${error.message}`)
  }
}

function validateSignature(signature, platform) {
  if (typeof signature !== 'string' || signature.trim() === '') {
    throw new Error(`La signature de ${platform} est vide : le client refuserait la mise à jour.`)
  }
  if (signature.length < 64) {
    throw new Error(`La signature de ${platform} est trop courte pour être une signature minisign.`)
  }
}

function validateUrl(url, platform, version) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`L’URL de ${platform} n’est pas une URL absolue.`)
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`L’URL de ${platform} doit être servie en HTTPS.`)
  }
  if (parsed.origin !== 'https://github.com') {
    throw new Error(`L’URL de ${platform} doit viser les releases publiques du projet.`)
  }
  const expected = new RegExp(`^/${REPOSITORY}/releases/download/v?${version.replace(/\./g, '\\.')}/[^/]+$`)
  if (!expected.test(decodeURIComponent(parsed.pathname))) {
    throw new Error(`L’URL de ${platform} doit pointer l’archive de la version ${version}.`)
  }
  if (parsed.search !== '') {
    throw new Error(`L’URL de ${platform} ne doit porter aucun paramètre.`)
  }
}

function check(manifest, version, requiredPlatforms) {
  if (manifest === null || typeof manifest !== 'object') throw new Error('Le manifeste doit être un objet JSON.')
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    throw new Error('Le manifeste doit porter une version Semantic Versioning.')
  }
  if (version !== undefined && manifest.version !== version) {
    throw new Error(`Le manifeste annonce ${manifest.version} alors que la release est ${version}.`)
  }
  if (typeof manifest.pub_date !== 'string' || Number.isNaN(Date.parse(manifest.pub_date))) {
    throw new Error('Le manifeste doit porter une date de publication exploitable.')
  }
  if (manifest.platforms === null || typeof manifest.platforms !== 'object' || Array.isArray(manifest.platforms)) {
    throw new Error('Le manifeste doit porter un objet platforms.')
  }
  const names = Object.keys(manifest.platforms)
  if (names.length === 0) throw new Error('Le manifeste ne publie aucune plateforme.')
  for (const name of names) {
    if (!PLATFORM_PATTERN.test(name)) throw new Error(`Plateforme inconnue dans le manifeste : ${name}.`)
    const entry = manifest.platforms[name]
    if (entry === null || typeof entry !== 'object') throw new Error(`Entrée invalide pour ${name}.`)
    validateSignature(entry.signature, name)
    validateUrl(entry.url, name, manifest.version)
  }
  const missing = requiredPlatforms.filter((platform) => !names.includes(platform))
  if (missing.length > 0) {
    throw new Error(
      `Le manifeste ne publie pas ${missing.join(', ')} : ces clients recevraient une erreur de plateforme `
      + 'et ne pourraient jamais se mettre à jour.',
    )
  }
  return names
}

if (flags.has('--check') && flags.has('--alias')) {
  throw new Error('--check et --alias ne se combinent pas : vérifier ne déclare aucune plateforme.')
}

if (flags.has('--check')) {
  const manifest = readManifest(flags.get('--check'))
  const published = check(manifest, flags.get('--version'), requires)
  process.stdout.write(`Manifeste valide : ${manifest.version} pour ${published.join(', ')}.\n`)
} else if (flags.has('--alias')) {
  // L'archive macOS est universelle : darwin-x86_64 et darwin-aarch64 pointent le même fichier et la
  // même signature. Déclarer l'alias explicitement évite un bloc de code non testé dans le workflow.
  const required = ['--manifest', '--version', '--alias', '--output']
  const absent = required.filter((name) => !flags.has(name))
  if (absent.length > 0) throw new Error(`Arguments manquants : ${absent.join(', ')}.`)

  const version = flags.get('--version').replace(/^v/, '')
  const [source, target] = flags.get('--alias').split(':')
  if (!PLATFORM_PATTERN.test(source ?? '') || !PLATFORM_PATTERN.test(target ?? '')) {
    throw new Error(`Alias invalide : ${flags.get('--alias')} (attendu source:cible, deux plateformes connues).`)
  }
  if (source === target) throw new Error('Un alias doit désigner deux plateformes différentes.')

  const manifest = readManifest(flags.get('--manifest'))
  if (manifest.version !== version) {
    throw new Error(`Le manifeste annonce ${manifest.version} alors que la release est ${version}.`)
  }
  const entry = manifest.platforms?.[source]
  if (!entry) throw new Error(`La plateforme ${source} est absente du manifeste : alias impossible.`)
  manifest.platforms[target] = { ...entry }
  check(manifest, version, [target])

  writeFileSync(resolve(flags.get('--output')), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  process.stdout.write(`${target} ajouté comme alias de ${source} (${Object.keys(manifest.platforms).join(', ')}).\n`)
} else {
  const required = ['--version', '--platform', '--url', '--signature-file', '--output']
  const absent = required.filter((name) => !flags.has(name))
  if (absent.length > 0) throw new Error(`Arguments manquants : ${absent.join(', ')}.`)

  const version = flags.get('--version').replace(/^v/, '')
  const platform = flags.get('--platform')
  const output = resolve(flags.get('--output'))
  if (!TAG_PATTERN.test(version)) throw new Error('La version doit être un numéro Semantic Versioning.')
  if (!PLATFORM_PATTERN.test(platform)) throw new Error(`Plateforme invalide : ${platform}.`)

  const signature = readFileSync(resolve(flags.get('--signature-file')), 'utf8').trim()
  validateSignature(signature, platform)

  const manifestPath = flags.get('--manifest')
  let manifest = manifestPath && manifestPath !== 'none' ? readManifest(manifestPath) : null
  if (manifest) {
    if (manifest.version !== version) {
      throw new Error(`Le manifeste existant annonce ${manifest.version} : refus de mélanger deux versions.`)
    }
  } else {
    const notes = flags.has('--notes-file') ? readFileSync(resolve(flags.get('--notes-file')), 'utf8').trim() : ''
    manifest = {
      version,
      notes: notes === '' ? 'Mise à jour de Sylloge.' : notes,
      pub_date: new Date().toISOString(),
      platforms: {},
    }
  }

  if (typeof manifest.pub_date !== 'string' || Number.isNaN(Date.parse(manifest.pub_date))) {
    manifest.pub_date = new Date().toISOString()
  }
  manifest.platforms[platform] = { signature, url: flags.get('--url') }
  check(manifest, version, [platform])

  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  process.stdout.write(`${platform} ajouté au manifeste ${output} (${Object.keys(manifest.platforms).join(', ')}).\n`)
}
