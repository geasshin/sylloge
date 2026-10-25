import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

// L'annonce de mise à jour, rendue pour de vrai en français et en anglais, sans réseau ni pont natif.
const root = fileURLToPath(new URL('..', import.meta.url))
const scratch = process.env.TMPDIR ?? join(homedir(), '.hermes/profiles/promethee/cache/scratch')
const cacheDir = mkdtempSync(join(scratch, 'sylloge-update-notice-'))
const server = await createServer({
  root,
  configFile: false,
  envFile: false,
  cacheDir,
  plugins: [react()],
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
})
// Vite laisse parfois un processus écrire dans son dossier temporaire une fois
// `close()` revenu : un rmdir immédiat tombe alors sur ENOTEMPTY. On réessaie
// sans transformer un nettoyage en échec de la recette.
async function removeScratch(directory) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(directory, { recursive: true, force: true })
      return
    } catch (error) {
      if (error.code !== 'ENOTEMPTY' && error.code !== 'EBUSY') throw error
      await new Promise((resolve) => setTimeout(resolve, 60 * (attempt + 1)))
    }
  }
}

after(async () => {
  await server.close()
  await removeScratch(cacheDir)
})

const { UpdateNotice } = await server.ssrLoadModule('/src/components/UpdateNotice.tsx')
const i18n = await server.ssrLoadModule('/src/i18n/core.ts')
const noop = () => {}
const update = { version: '0.6.11', notes: 'Corrige les accents et la recherche.' }
const render = (props = {}) => renderToStaticMarkup(createElement(UpdateNotice, {
  update,
  installing: false,
  ignoring: false,
  error: null,
  onInstall: noop,
  onLater: noop,
  onIgnore: noop,
  ...props,
}))

test('En français, l’annonce nomme la version et propose installer, plus tard et ne plus proposer', () => {
  i18n.setLanguage('fr')
  const html = render()
  assert.match(html, /role="status"/)
  assert.match(html, /Mise à jour disponible/)
  assert.match(html, /Sylloge 0\.6\.11 est prête à être installée\./)
  assert.match(html, /Installer maintenant/)
  assert.match(html, /Plus tard/)
  assert.match(html, /Ne plus proposer cette version/)
  assert.match(html, /Notes de version/)
  assert.match(html, /Corrige les accents et la recherche\./)
})

test('En anglais, tout est traduit et la version reste une donnée', () => {
  i18n.setLanguage('en')
  const html = render()
  assert.match(html, /Update available/)
  assert.match(html, /Sylloge 0\.6\.11 is ready to install\./)
  assert.match(html, /Install now/)
  assert.match(html, /Later/)
  assert.match(html, /Don&#x27;t offer this version again/)
  assert.match(html, /Release notes/)
  assert.doesNotMatch(html, /Mise à jour disponible|Installer maintenant|Notes de version/)
})

test('L’annonce n’est pas une fenêtre : ni dialogue, ni voile, ni attrape-focus', () => {
  i18n.setLanguage('fr')
  const html = render()
  assert.doesNotMatch(html, /role="dialog"|aria-modal|autofocus/i)
  assert.match(html, /class="update-notice"/)
  // Trois actions explicites plus une fermeture immédiate : toutes de vrais boutons, atteignables au clavier.
  const buttons = html.match(/<button[^>]*>/g) ?? []
  assert.equal(buttons.length, 4)
  for (const button of buttons) assert.match(button, /type="button"/)
  assert.match(html, /aria-label="Fermer l’annonce de mise à jour"/)
})

test('Pendant l’installation, les actions sont neutralisées et le libellé le dit', () => {
  i18n.setLanguage('fr')
  const html = render({ installing: true })
  assert.match(html, /Installation…/)
  const disabled = html.match(/<button[^>]*disabled=""/g) ?? []
  assert.equal(disabled.length, 4)
})

test('Un échec s’affiche en alerte et se traduit, sans masquer l’annonce', () => {
  i18n.setLanguage('en')
  const html = render({ error: 'La vérification a échoué. Vérifiez la connexion puis réessayez.' })
  assert.match(html, /role="alert"/)
  assert.match(html, /The check failed\. Check the connection and try again\./)
  assert.match(html, /Update available/)
})

test('Sans notes de version, aucun bloc de notes n’est rendu', () => {
  i18n.setLanguage('fr')
  const html = render({ update: { version: '0.6.12', notes: null } })
  assert.doesNotMatch(html, /Notes de version/)
  assert.match(html, /Sylloge 0\.6\.12 est prête à être installée\./)
})

test('La règle d’annonce exige les quatre conditions, et rien de moins', async () => {
  const { shouldAnnounce } = await server.ssrLoadModule('/src/data/appUpdate.ts')
  const preferences = { automaticChecksEnabled: true, ignoredVersion: null }
  const found = { version: '0.6.11', notes: null }

  assert.equal(shouldAnnounce(preferences, found, null), true, 'version publiée, recherche active, rien d’ignoré')
  assert.equal(shouldAnnounce({ ...preferences, automaticChecksEnabled: false }, found, null), false, 'recherche automatique décochée : silence')
  assert.equal(shouldAnnounce({ ...preferences, ignoredVersion: '0.6.11' }, found, null), false, 'version ignorée : silence')
  assert.equal(shouldAnnounce(preferences, found, '0.6.11'), false, 'déjà annoncée : pas de rappel en boucle')
  assert.equal(shouldAnnounce(preferences, null, null), false, 'aucune version trouvée : rien à annoncer')
  assert.equal(shouldAnnounce({ ...preferences, ignoredVersion: '0.6.10' }, found, null), true, 'ignorer une autre version ne bloque pas celle-ci')
  assert.equal(shouldAnnounce(preferences, { version: '0.6.12', notes: null }, '0.6.11'), true, 'une version plus récente remplace l’annonce')
})
