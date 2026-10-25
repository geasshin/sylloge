import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'

/**
 * Le manifeste `latest.json` est partagé par toutes les plateformes. Un manifeste qui n'annonce pas la
 * plateforme du client provoque `TargetNotFound` chez tauri-plugin-updater : ce client ne peut plus jamais
 * se mettre à jour, et l'erreur ressemble à une panne réseau. Ces tests verrouillent la fusion et le refus.
 */
const root = fileURLToPath(new URL('..', import.meta.url))
const script = join(root, 'scripts/merge-tauri-latest-json.mjs')
const scratch = process.env.TMPDIR ?? tmpdir()
const work = mkdtempSync(join(scratch, 'sylloge-manifest-'))
after(() => rmSync(work, { recursive: true, force: true }))

const signature = (label) => `${'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkK'.repeat(2)}${label}`
const darwinUrl = 'https://github.com/geasshin/sylloge/releases/download/v0.6.11/Sylloge.app.tar.gz'
const windowsUrl = 'https://github.com/geasshin/sylloge/releases/download/v0.6.11/Sylloge_0.6.11_x64-setup.exe'

const file = (name, contents) => {
  const path = join(work, name)
  writeFileSync(path, contents, 'utf8')
  return path
}
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
const manifestOf = (path) => JSON.parse(readFileSync(path, 'utf8'))

const mergeDarwin = () => {
  const sig = file('darwin.sig', signature('darwin'))
  const notes = file('notes.md', 'Notes de la version 0.6.11.\n')
  const output = join(work, 'latest.json')
  const result = run('--version', '0.6.11', '--notes-file', notes, '--platform', 'darwin-aarch64', '--url', darwinUrl, '--signature-file', sig, '--output', output)
  assert.equal(result.status, 0, result.stderr)
  return output
}

test('Une première fusion crée un manifeste complet pour sa plateforme', () => {
  const output = mergeDarwin()
  const manifest = manifestOf(output)
  assert.equal(manifest.version, '0.6.11')
  assert.match(manifest.notes, /Notes de la version/)
  assert.match(manifest.pub_date, /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(Object.keys(manifest.platforms), ['darwin-aarch64'])
  assert.equal(manifest.platforms['darwin-aarch64'].url, darwinUrl)
})

test('La fusion Windows conserve macOS : c’est exactement ce qui manquait', () => {
  const darwinManifest = mergeDarwin()
  const sig = file('windows.sig', signature('windows'))
  const result = run('--manifest', darwinManifest, '--version', '0.6.11', '--platform', 'windows-x86_64', '--url', windowsUrl, '--signature-file', sig, '--output', darwinManifest)
  assert.equal(result.status, 0, result.stderr)

  const manifest = manifestOf(darwinManifest)
  assert.deepEqual(Object.keys(manifest.platforms).sort(), ['darwin-aarch64', 'windows-x86_64'])
  assert.equal(manifest.platforms['windows-x86_64'].url, windowsUrl)

  const check = run('--check', darwinManifest, '--version', '0.6.11', '--require', 'darwin-aarch64', '--require', 'windows-x86_64')
  assert.equal(check.status, 0, check.stderr)
  assert.match(check.stdout, /Manifeste valide : 0\.6\.11 pour darwin-aarch64, windows-x86_64/)
})

test('Un manifeste sans la plateforme du client est refusé, avec le motif explicite', () => {
  const darwinOnly = mergeDarwin()
  const check = run('--check', darwinOnly, '--version', '0.6.11', '--require', 'windows-x86_64')
  assert.notEqual(check.status, 0)
  assert.match(check.stderr, /ne publie pas windows-x86_64/)
  assert.match(check.stderr, /ne pourraient jamais se mettre à jour/)
})

test('Refus de mélanger deux versions dans un même manifeste', () => {
  const darwinManifest = mergeDarwin()
  const sig = file('windows.sig', signature('windows'))
  const result = run('--manifest', darwinManifest, '--version', '0.6.12', '--platform', 'windows-x86_64', '--url', 'https://github.com/geasshin/sylloge/releases/download/v0.6.12/Sylloge_0.6.12_x64-setup.exe', '--signature-file', sig, '--output', darwinManifest)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /refus de mélanger deux versions/)
})

test('Une signature vide, une URL en clair ou une autre version sont refusées', () => {
  const emptySignature = file('empty.sig', '   \n')
  const notes = file('notes.md', 'Notes.\n')
  const empty = run('--version', '0.6.11', '--notes-file', notes, '--platform', 'windows-x86_64', '--url', windowsUrl, '--signature-file', emptySignature, '--output', join(work, 'x.json'))
  assert.notEqual(empty.status, 0)
  assert.match(empty.stderr, /signature de windows-x86_64 est vide/)

  const sig = file('ok.sig', signature('ok'))
  const insecure = run('--version', '0.6.11', '--notes-file', notes, '--platform', 'windows-x86_64', '--url', 'http://github.com/geasshin/sylloge/releases/download/v0.6.11/a.exe', '--signature-file', sig, '--output', join(work, 'y.json'))
  assert.notEqual(insecure.status, 0)
  assert.match(insecure.stderr, /HTTPS/)

  const wrongVersion = run('--version', '0.6.11', '--notes-file', notes, '--platform', 'windows-x86_64', '--url', 'https://github.com/geasshin/sylloge/releases/download/v0.6.10/a.exe', '--signature-file', sig, '--output', join(work, 'z.json'))
  assert.notEqual(wrongVersion.status, 0)
  assert.match(wrongVersion.stderr, /doit pointer l’archive de la version 0\.6\.11/)
})

test('Fusionner deux fois la même plateforme reste idempotent', () => {
  const darwinManifest = mergeDarwin()
  const sig = file('windows.sig', signature('windows'))
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = run('--manifest', darwinManifest, '--version', '0.6.11', '--platform', 'windows-x86_64', '--url', windowsUrl, '--signature-file', sig, '--output', darwinManifest)
    assert.equal(result.status, 0, result.stderr)
  }
  const manifest = manifestOf(darwinManifest)
  assert.deepEqual(Object.keys(manifest.platforms).sort(), ['darwin-aarch64', 'windows-x86_64'])
})

test('La séquence réelle de la release publie les trois cibles', () => {
  // Ce que fait le job `publish` : un manifeste vierge, l'entrée macOS, l'alias x86_64 de
  // l'archive universelle, puis la cible Windows. Une seule release, un seul manifeste.
  const notes = file('release-notes.md', 'Corrections et interface bilingue.\n')
  const darwinSig = file('Sylloge.app.tar.gz.sig', signature('darwin'))
  const manifest = join(work, 'sequence-latest.json')

  const created = run('--manifest', 'none', '--version', '0.6.11', '--notes-file', notes,
    '--platform', 'darwin-aarch64', '--url', darwinUrl, '--signature-file', darwinSig, '--output', manifest)
  assert.equal(created.status, 0, created.stderr)
  assert.match(manifestOf(manifest).pub_date, /^\d{4}-\d{2}-\d{2}T/, 'le manifeste est daté')

  const aliased = run('--manifest', manifest, '--version', '0.6.11',
    '--alias', 'darwin-aarch64:darwin-x86_64', '--output', manifest)
  assert.equal(aliased.status, 0, aliased.stderr)
  assert.deepEqual(manifestOf(manifest).platforms['darwin-x86_64'], manifestOf(manifest).platforms['darwin-aarch64'])

  const windowsSig = file('Sylloge_0.6.11_x64-setup.exe.sig', signature('windows'))
  const merged = run('--manifest', manifest, '--version', '0.6.11', '--platform', 'windows-x86_64',
    '--url', windowsUrl, '--signature-file', windowsSig, '--output', manifest)
  assert.equal(merged.status, 0, merged.stderr)

  const final = run('--check', manifest, '--version', '0.6.11',
    '--require', 'darwin-aarch64', '--require', 'darwin-x86_64', '--require', 'windows-x86_64')
  assert.equal(final.status, 0, final.stderr)
  assert.match(final.stdout, /Manifeste valide : 0\.6\.11/)

  const published = manifestOf(manifest)
  assert.equal(published.platforms['windows-x86_64'].url, windowsUrl)
  assert.equal(published.platforms['darwin-x86_64'].url, darwinUrl, 'l’alias ne touche pas aux autres cibles')
})

test('Un alias refuse une source absente, un couple identique et le mode vérification', () => {
  const manifest = mergeDarwin()

  const absent = run('--manifest', manifest, '--version', '0.6.11',
    '--alias', 'windows-x86_64:windows-aarch64', '--output', manifest)
  assert.notEqual(absent.status, 0)
  assert.match(absent.stderr, /windows-x86_64 est absente du manifeste/)

  const same = run('--manifest', manifest, '--version', '0.6.11',
    '--alias', 'darwin-aarch64:darwin-aarch64', '--output', manifest)
  assert.notEqual(same.status, 0)
  assert.match(same.stderr, /deux plateformes différentes/)

  const both = run('--check', manifest, '--alias', 'darwin-aarch64:darwin-x86_64', '--version', '0.6.11')
  assert.notEqual(both.status, 0)
  assert.match(both.stderr, /ne se combinent pas/)
})
