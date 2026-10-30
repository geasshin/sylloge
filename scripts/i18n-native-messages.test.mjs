import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, test } from 'node:test'
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks'
import messages from '../src/i18n/catalogs/native.ts'
import { english } from '../src/i18n/catalog.ts'
import { setLanguage, translateMessage } from '../src/i18n/core.ts'
import { saveExportJson } from '../src/data/nativePortability.ts'

afterEach(() => setLanguage('fr'))

const ROOT = new URL('../src-tauri/src/', import.meta.url)
const ISO = '2026-01-01T00:00:00.000Z'

/** Synthetic values: interpolation must stay opaque, including $& and newlines. */
const VALUES = ['$& "Élodie"\n2e ligne', 'C:\\dossier\\été\\rapport.csv', "l'erreur (SQLite) 42", 'Archive ZIP de test']

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/gu)].map((match) => match[1])
const fill = (template, values) => template.replace(/\{(\w+)\}/gu, (placeholder, name) => values[Number(name)] ?? placeholder)

function expectMessage(french, english) {
  setLanguage('fr')
  assert.equal(translateMessage(french), french, 'French must stay byte-identical')
  setLanguage('en')
  const translated = translateMessage(french)
  assert.notEqual(translated, french, `No catalogue entry matched: ${JSON.stringify(french)}`)
  assert.equal(translated, english, 'English translation expected')
}

/**
 * Extract French string literals from Rust, excluding #[cfg(test)] modules.
 * Constants interpolated by Rust at compile time are resolved so the key
 * matches the string that actually crosses the IPC boundary.
 */
function rustStrings(file, limit) {
  const source = readFileSync(new URL(file, ROOT), 'utf8')
  const lines = source.split('\n')
  const starts = []
  let offset = 0
  for (const line of lines) { starts.push(offset); offset += line.length + 1 }
  const lineOf = (index) => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if (starts[mid] <= index) low = mid
      else high = mid - 1
    }
    return low + 1
  }
  const tokens = []
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '"') continue
    let cursor = index + 1
    let text = ''
    let closed = false
    while (cursor < source.length) {
      const char = source[cursor]
      if (char === '\\') {
        const next = source[cursor + 1]
        if (next === '\n') {
          cursor += 2
          while (source[cursor] === ' ' || source[cursor] === '\t') cursor += 1
          continue
        }
        const map = { n: '\n', r: '\r', t: '\t', '\\': '\\', '"': '"', "'": "'", '0': '\0' }
        text += map[next] ?? next
        cursor += 2
        continue
      }
      if (char === '"') { closed = true; cursor += 1; break }
      text += char
      cursor += 1
    }
    if (closed) tokens.push({ line: lineOf(index), text })
    index = cursor - 1
  }
  return tokens.filter((token) => token.line <= limit)
}

const FILES = {
  'books.rs': 627,
  'custom_entries.rs': 341,
  'profiles.rs': 383,
  'updater_preferences.rs': 112,
  'tmdb/mod.rs': 375,
  'tmdb/cache.rs': 553,
  'tmdb/client.rs': 647,
  'igdb/mod.rs': 275,
  'openlibrary.rs': 289,
  'migration_backup.rs': 208,
  'portability.rs': 4708,
}

const CONSTANTS = {
  MAX_ZIP_CONTAINER_ENTRIES: '512',
  MAX_ZIP_PATH_COMPONENTS: '8',
  MAX_ZIP_NESTING_DEPTH: '4',
  MAX_PROFILES: '5',
}

/** Strings that never reach the screen: native dialog copy, stored values, logs, internal reasons. */
const NOT_DISPLAY = new Set([
  // Native dialog titles, filters and picker labels (handled by the OS dialog layer).
  'Choisir un fichier à importer',
  'Choisir un dossier à analyser',
  'Choisir un export Sylloge',
  'Choisir un CSV Films ou un ZIP compatible',
  'Choisir le dossier des futures sauvegardes Sylloge',
  'Choisir le dossier de sauvegarde Sylloge',
  'CSV ou ZIP compatible',
  'Exporter le profil Sylloge',
  'Export JSON Sylloge',
  'Export CSV Sylloge',
  'Choose a file to import',
  'Choose a folder to scan',
  'Choose a Sylloge export',
  'Choose a Films CSV or a compatible ZIP',
  'Choose the folder for future Sylloge backups',
  'Choose the Sylloge backup folder',
  'Compatible CSV or ZIP',
  'Import Sylloge (JSON, CSV, XML, ZIP)',
  'Sylloge import (JSON, CSV, XML, ZIP)',
  'Sylloge JSON export',
  'Sylloge CSV export',
  // Carte à partager : filtre et titre de la fenêtre d'enregistrement du PNG.
  'Image PNG à partager',
  'Enregistrer la carte à partager',
  'PNG image to share',
  'Save the share card',
  // Labels, stored values, folder names and logs.
  'L’archive ZIP',
  'Le dossier choisi',
  'Téléchargements',
  'Stockage en ligne',
  'série télé',
  'Jeux de société',
  'Documentaires et reportages',
  'à découvrir',
  'abandonné',
  'écriture dans une chaîne',
  'la mise à jour vérifiée est présente',
  'Library/Mobile Documents/com~apple~CloudDocs',
  'Copie avant migration : {0}',
  'Copie avant migration : {}',
  'VACUUM INTO $1',
  'PRAGMA integrity_check',
  // Reasons composed into « Le cache TMDB est invalide : {0}. ».
  'URL distante incorrecte',
  'contenu incohérent',
  'présentation non sérialisable',
  'aucune association TMDB à mettre à jour pour ce film',
  'durée incorrecte',
  'trop de réalisateurs',
  'réalisateur incorrect',
  'trop d’affiches alternatives',
  // Inner reasons composed into « La copie « … » ne peut pas être lue : {0} ».
  'le fichier a été remplacé pendant sa lecture.',
  'le chemin est un lien symbolique, qui n’est jamais suivi.',
  'le chemin ne désigne pas un fichier ordinaire.',
])

const OPENERS = /^(Impossible|Le |La |Les |L'|L’|Un |Une |Cette |Ce |Choisissez|Aucune|Base |Registre|Chemin|Copie|Dossier|Seuls)/u

function templateOf(text) {
  let resolved = text
  for (const [name, value] of Object.entries(CONSTANTS)) resolved = resolved.split(`{${name}}`).join(value)
  let index = 0
  return resolved.replace(/\{[^{}]*\}/gu, () => `{${index++}}`)
}

function extractedTemplates() {
  const found = new Map()
  for (const [file, limit] of Object.entries(FILES)) {
    for (const token of rustStrings(file, limit)) {
      const text = token.text
      const french = /[àâäéèêëîïôöùûüçœÀÉÈÊÎÔÙÇŒ’«»]/u.test(text) || OPENERS.test(text)
      if (!french) continue
      if (text.length < 12) continue
      if (/\b(SELECT|INSERT INTO|UPDATE |DELETE FROM|CREATE TABLE|ALTER TABLE)\b/u.test(text)) continue
      if (NOT_DISPLAY.has(text)) continue
      found.set(templateOf(text), `${file}:${token.line}`)
    }
  }
  return found
}

describe('Catalogue natif : couverture réelle du code Rust', () => {
  test('chaque message Rust affiché a sa clé exacte (placeholders compris)', () => {
    const extracted = extractedTemplates()
    const missing = [...extracted].filter(([template]) => !Object.hasOwn(english, template)).map(([template, where]) => `${where} ${JSON.stringify(template)}`)
    assert.deepEqual(missing, [], 'Messages Rust non catalogués')
    assert.ok(extracted.size >= 120, `Only ${extracted.size} Rust messages extracted`)
  })

  test('les constantes interpolées par Rust sont résolues en clair', () => {
    assert.ok(Object.hasOwn(messages, 'L’archive ZIP contient plus de 512 entrées.'))
    assert.ok(Object.hasOwn(messages, 'L’archive ZIP dépasse la limite de 8 segments de chemin.'))
    assert.ok(Object.hasOwn(messages, 'L’archive ZIP dépasse la limite de 4 archives ZIP imbriquées.'))
    assert.ok(Object.hasOwn(messages, "Le nombre maximal de 5 profils est atteint. Supprimez un profil avant d'en créer un autre."))
    assert.ok(Object.hasOwn(messages, 'Le document de sauvegarde dépasse la limite sûre de {0} Mio : aucune copie n’a été écrite, les copies existantes sont intactes.'))
    setLanguage('en')
    assert.equal(translateMessage('Le document de sauvegarde dépasse la limite sûre de 64 Mio : aucune copie n’a été écrite, les copies existantes sont intactes.'), 'The backup document exceeds the safe 64 MiB limit: no copy was written and existing copies are intact.')
  })

  test('les titres de dialogues natifs restent hors catalogue', () => {
    assert.ok(!Object.hasOwn(messages, 'Choisir un fichier à importer'))
    assert.ok(!Object.hasOwn(messages, 'Choisir un dossier à analyser'))
  })
})

describe('Catalogue natif : traduction des messages réels', () => {
  test('chaque clé se traduit avec ses valeurs intactes, et reste française en français', () => {
    let checked = 0
    for (const [source, translation] of Object.entries(messages)) {
      const names = placeholders(source)
      assert.deepEqual(placeholders(translation), names, `Placeholders differ: ${source}`)
      const values = VALUES.slice(0, names.length)
      const french = fill(source, values)
      const english = fill(translation, values)
      expectMessage(french, english)
      checked += 1
    }
    assert.ok(checked >= 150, `Only ${checked} native messages verified`)
  })

  test('les valeurs contenant $&, guillemets et retours à la ligne restent littérales', () => {
    expectMessage(
      'Impossible d’importer le film « $& "Élodie"\n2e ligne » : l\'erreur (SQLite)',
      'Could not import the film “$& "Élodie"\n2e ligne”: l\'erreur (SQLite)',
    )
    expectMessage(
      'Impossible de démarrer l’import Films : « Élodie » (42)',
      'Could not start the Films import: « Élodie » (42)',
    )
    expectMessage(
      'La copie « C:\\dossier\\été\\rapport.csv » ne peut pas être lue : le fichier a été remplacé pendant sa lecture.',
      'The copy “C:\\dossier\\été\\rapport.csv” cannot be read: the file was replaced while being read.',
    )
  })

  test('le gabarit le plus précis gagne pour une copie illisible', () => {
    expectMessage('La copie « sauvegarde.json » ne peut pas être lue : le fichier est introuvable.', 'The copy “sauvegarde.json” cannot be read: the file cannot be found.')
    expectMessage('La copie « sauvegarde.json » ne peut pas être lue : permission refusée', 'The copy “sauvegarde.json” cannot be read: permission refusée')
  })

  test('un message inconnu du catalogue reste inchangé en anglais', () => {
    setLanguage('en')
    const unknown = 'Un diagnostic natif inconnu.'
    assert.equal(translateMessage(unknown), unknown)
  })

  test('une erreur de démarrage de migration est traduite', () => {
    expectMessage('Dossier des copies avant migration impossible à créer : Permission denied (os error 13)', 'Could not create the pre-migration copies folder: Permission denied (os error 13)')
    expectMessage('Version du schéma illisible : no such table: schema_version', 'Unreadable schema version: no such table: schema_version')
  })

  test('les erreurs de profil et de livres gardent le titre capturé', () => {
    expectMessage('Le nom du profil ne peut pas être vide.', 'The profile name cannot be empty.')
    expectMessage('Impossible d’enregistrer le livre dans la bibliothèque Livres : UNIQUE constraint failed', 'Could not save the book in the Livres library: UNIQUE constraint failed')
    expectMessage('La fiche Comics « Watchmen » porte un statut inconnu : « perdu ».', 'The Comics entry “Watchmen” has an unknown status: “perdu”.')
    expectMessage('La bibliothèque Livres audio n’accepte pas de citations : la fiche « Titre » en contient.', 'The Livres audio library does not accept quotes: the entry “Titre” contains some.')
  })

  test('les erreurs de fournisseur sont traduites, statut capturé', () => {
    expectMessage('Le service de métadonnées a renvoyé une erreur (429).', 'The metadata service returned an error (429).')
    expectMessage('Le cache TMDB est invalide : contenu incohérent.', 'The TMDB cache is invalid: contenu incohérent.')
    expectMessage('Trop de recherches en peu de temps. Patientez une minute avant de réessayer.', 'Too many searches in a short time. Wait a minute before trying again.')
    expectMessage('Horloge système indisponible pour la sauvegarde : clock error', 'System clock unavailable for the backup: clock error')
  })
})

describe('Catalogue natif : frontière IPC', () => {
  test('une erreur renvoyée par Rust traverse invoke sans être modifiée', async () => {
    const previousWindow = globalThis.window
    globalThis.window = {}
    try {
      mockIPC((command) => {
        if (command === 'save_export_json') throw 'Impossible d’écrire l’export choisi : Permission denied (os error 13)'
        return null
      })
      await assert.rejects(() => saveExportJson('export.json', '{}'), (error) => {
        const message = typeof error === 'string' ? error : error.message
        expectMessage(message, 'Could not write the chosen export: Permission denied (os error 13)')
        return true
      })
    } finally {
      clearMocks()
      if (previousWindow === undefined) delete globalThis.window
      else globalThis.window = previousWindow
    }
  })
})

describe('Catalogue natif : intégrité', () => {
  test('aucune valeur vide, aucun placeholder orphelin', () => {
    assert.deepEqual(Object.entries(messages).filter(([, value]) => value.trim() === ''), [])
    assert.deepEqual(Object.entries(messages).filter(([source, value]) => placeholders(source).length !== placeholders(value).length), [])
  })

  test('le catalogue ne contient pas de code technique de mise à jour', () => {
    for (const code of ['UPDATER_MANIFEST_MISSING', 'UPDATER_CHECK_FAILED', 'UPDATER_INSTALL_FAILED']) {
      assert.ok(!Object.hasOwn(messages, code))
    }
  })
})
