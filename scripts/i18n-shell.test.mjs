import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

// Vraies surfaces TSX, sans écoute HTTP, .env, base personnelle ni pont natif.
const root = fileURLToPath(new URL('..', import.meta.url))
const scratch = process.env.TMPDIR ?? join(homedir(), '.hermes/profiles/promethee/cache/scratch')
const cacheDir = mkdtempSync(join(scratch, 'sylloge-i18n-shell-'))
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
const noop = () => {}
const render = (Component, props = {}) => renderToStaticMarkup(createElement(Component, props))
const generalProps = { themePreference: 'system', onThemePreferenceChange: noop, availableUpdate: null, onUpdateAvailable: noop, onUpdateHandled: noop }

try {
  const { GeneralSettings } = await server.ssrLoadModule('/src/components/settings/GeneralSettings.tsx')
  await test('Les réglages Généraux proposent Français et English avec un libellé accessible', () => {
    const html = render(GeneralSettings, generalProps)
    assert.match(html, /Langue/)
    assert.match(html, /Français/)
    assert.match(html, /English/)
    assert.match(html, /<select[^>]+aria-label="Langue de l’application"/)
  })
  const i18n = await server.ssrLoadModule('/src/i18n/core.ts')
  const { Onboarding } = await server.ssrLoadModule('/src/components/Onboarding.tsx')
  await test('Le premier écran propose le choix de langue avant la création d’un profil', () => {
    i18n.setLanguage('en')
    const html = render(Onboarding, { themePreference: 'system', onThemePreferenceChange: noop, onProfileReady: noop })
    assert.match(html, /<select[^>]+aria-label="Application language"/)
    assert.match(html, /<option[^>]*value="en"[^>]*selected=""[^>]*>English<\/option>/)
    assert.match(html, /value=""/)
    i18n.setLanguage('fr')
  })
  await test('Les réglages Généraux traduisent aussi les choix de thème et leurs noms accessibles', () => {
    i18n.setLanguage('en')
    const html = render(GeneralSettings, generalProps)
    assert.match(html, />Appearance<\/h2>/)
    assert.match(html, /aria-label="Application theme"/)
    assert.match(html, />System<\/b>/)
    assert.match(html, />Light<\/b>/)
    assert.match(html, />Dark<\/b>/)
    assert.match(html, /Updates/)
    assert.doesNotMatch(html, /Apparence|Système|Clair|Sombre|Mises à jour|Défilement automatique/)
    i18n.setLanguage('fr')
    assert.match(render(GeneralSettings, generalProps), /Apparence/)
  })
  await test('Le texte du premier lancement et ses repères accessibles suivent la langue', () => {
    i18n.setLanguage('en')
    const html = render(Onboarding, { themePreference: 'dark', onThemePreferenceChange: noop, onProfileReady: noop })
    assert.match(html, />Create profile<\/h2>/)
    assert.match(html, /aria-label="First launch progress"/)
    assert.match(html, /placeholder="For example, Camille"/)
    assert.match(html, />Continue<\/button>/)
    assert.doesNotMatch(html, /Créer le profil|Sans compte|Sauvegardes|Pseudo|Thème de l’application|Par exemple/)
    i18n.setLanguage('fr')
  })
  const { Portability, SETTINGS_SECTIONS } = await server.ssrLoadModule('/src/components/Portability.tsx')
  const profile = Object.freeze({ id: 'qa-shell', name: 'Général — Été 日本語', avatarDataUrl: null, createdAt: '2026-10-22T12:00:00.000Z', updatedAt: '2026-10-22T12:00:00.000Z' })
  const library = Object.freeze({ profile, films: [] })
  const portabilityProps = { ...generalProps, library, profiles: [profile], onSwitchProfile: async () => {}, onImported: noop, onBackupNotice: noop, onProfilesChanged: noop, onProfileDeleted: noop, onLibraryChanged: noop }
  await test('Le shell des réglages traduit les métadonnées au rendu, sans toucher au nom du profil', () => {
    i18n.setLanguage('en')
    assert.match(render(Portability, { ...portabilityProps, section: 'application' }), /<h1[^>]*>General<\/h1>/)
    const backup = render(Portability, { ...portabilityProps, section: 'backups' })
    assert.match(backup, /aria-label="Affected profile"/)
    assert.ok(backup.includes(profile.name))
    assert.equal(SETTINGS_SECTIONS.find(entry => entry.id === 'application').label, 'Général', 'Les métadonnées sources restent françaises, non figées dans la langue de chargement')
    i18n.setLanguage('fr')
    assert.match(render(Portability, { ...portabilityProps, section: 'application' }), /<h1[^>]*>Général<\/h1>/)
  })
  const { ProfilesSettings, profileWorksSummary, profileTotalWorks } = await server.ssrLoadModule('/src/components/settings/ProfilesSettings.tsx')
  await test('Les profils ont des compteurs complets et des états vides traduits, sans modifier les données', () => {
    const populated = Object.freeze({ ...profile, filmCount: 1, seriesCount: 2, animeCount: 1, bookCount: 2, mangaCount: 1, gameCount: 2, artworkCount: 1, customCount: 2 })
    const snapshot = JSON.stringify(populated)
    i18n.setLanguage('en')
    assert.equal(profileWorksSummary(profile), 'Empty library')
    assert.equal(profileWorksSummary(populated), '1 film · 2 series · 1 anime · 2 books · 1 manga · 2 games · 1 work of art · 2 custom entries')
    assert.equal(profileTotalWorks(populated), 12)
    const html = render(ProfilesSettings, { ...portabilityProps, profiles: [populated] })
    assert.match(html, /Profiles on this Mac/)
    assert.match(html, /1 of 5/)
    assert.match(html, />Rename<\/button>/)
    assert.ok(html.includes(profile.name))
    assert.equal(JSON.stringify(populated), snapshot)
    i18n.setLanguage('fr')
    assert.match(profileWorksSummary(populated), /2 séries/)
  })
  const { AboutSettings } = await server.ssrLoadModule('/src/components/settings/AboutSettings.tsx')
  await test('À propos traduit informations et états indisponibles, sans modifier les liens de référence', () => {
    i18n.setLanguage('en')
    const html = render(AboutSettings)
    assert.match(html, /Installed version/)
    assert.match(html, /Unavailable/)
    assert.match(html, /Metadata sources/)
    assert.match(html, /No account\. The libraries stay on this Mac\./)
    assert.doesNotMatch(html, /Données|Code source|Recherches de métadonnées|Ouvrir|Indisponible/)
    assert.match(html, /https:\/\/github\.com\/geasshin\/sylloge\/blob\/main\/LICENSE/)
    // Phrase exigée mot pour mot par les conditions d’usage de TMDB.
    assert.ok(html.includes('This product uses the TMDB API but is not endorsed or certified by TMDB.'))
    i18n.setLanguage('fr')
    assert.match(render(AboutSettings), /Version installée/)
  })

  const { BackupSettings, formatBackupDay, formatBackupMoment, backupNoticeText } = await server.ssrLoadModule('/src/components/settings/BackupSettings.tsx')
  const { TransferSettings } = await server.ssrLoadModule('/src/components/settings/TransferSettings.tsx')
  const { BackupSummary, pickerMessageText } = await server.ssrLoadModule('/src/components/BackupRestorePicker.tsx')
  const { RestoreProfileDialog, restoreErrorText } = await server.ssrLoadModule('/src/components/RestoreProfileButton.tsx')
  const { UpdaterSettings, updaterMessageText } = await server.ssrLoadModule('/src/components/UpdaterSettings.tsx')
  const { BACKUP_RETENTION_SUMMARY } = await server.ssrLoadModule('/src/domain/backupRestore.ts')

  await test('Sauvegarde traduit ses groupes, ses actions et ses dates sans changer de format', () => {
    i18n.setLanguage('en')
    try {
      const html = render(BackupSettings, { library, onRestored: noop })
      assert.match(html, />Automatic backup<\/h2>/)
      assert.match(html, /Reading setting…/)
      assert.match(html, /Take your data elsewhere or keep a copy/)
      assert.match(html, /Get a profile back/)
      assert.match(html, />Restore a backup<\/button>/)
      assert.doesNotMatch(html, /Frequency|Every day, at the first change|Restore or move to another computer/)
      assert.match(html, />Export a copy<\/button>/)
      assert.doesNotMatch(html, /Sauvegarde automatique|Restaurer une sauvegarde|Exporter une copie|Écriture/)
      // La conservation compose le résumé du domaine dans une phrase du composant.
      assert.match(
        i18n.t('{retention}. Les plus anciennes sont retirées automatiquement ; les fichiers que Sylloge n’a pas créés ne sont jamais touchés.', { retention: backupNoticeText(BACKUP_RETENTION_SUMMARY) }),
        /^3 recent copies, then one (a|per) week for 4 weeks and one (a|per) month for 6 months\. The oldest are removed automatically; files Sylloge did not create are never touched\.$/,
      )
      assert.match(formatBackupDay('2026-10-24'), /24 October 2026/)
      const moment = formatBackupMoment('2026-10-24T12:00:00.000Z')
      assert.match(moment, /24 October 2026/)
      assert.match(moment, /\d{2}:\d{2}/)
    } finally { i18n.setLanguage('fr') }
    const html = render(BackupSettings, { library, onRestored: noop })
    assert.match(html, />Sauvegarde automatique<\/h2>/)
    assert.match(html, />Restaurer une sauvegarde<\/button>/)
    assert.match(formatBackupDay('2026-10-24'), /24 octobre 2026/)
    assert.equal(formatBackupDay('2026-10-24'), new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(2026, 9, 24)))
  })

  await test('Transferts traduit les bibliothèques, les sources et le renvoi vers Sauvegarde', () => {
    i18n.setLanguage('en')
    try {
      const html = render(TransferSettings, { library, onLibraryChanged: noop, onOpenBackups: noop })
      assert.match(html, />By library<\/h2>/)
      assert.match(html, /Reading libraries…/)
      assert.match(html, />Whole profile<\/h2>/)
      assert.match(html, />Open Backup<\/button>/)
      assert.doesNotMatch(html, /Par bibliothèque|Lecture des bibliothèques|Tout le profil|Ouvrir Sauvegarde/)
    } finally { i18n.setLanguage('fr') }
    const html = render(TransferSettings, { library, onLibraryChanged: noop, onOpenBackups: noop })
    assert.match(html, />Par bibliothèque<\/h2>/)
    assert.match(html, />Tout le profil<\/h2>/)
  })

  await test('L’aperçu d’une sauvegarde suit la langue, y compris les dates, les compteurs et les noms propres', () => {
    const backupDocument = Object.freeze({
      format: 'sylloge-library',
      version: 4,
      exportedAt: '2026-10-24T12:00:00.000Z',
      profile: Object.freeze({ id: 'qa-restore', name: 'Camille 日本語', avatarDataUrl: null, createdAt: '2026-10-20T12:00:00.000Z', updatedAt: '2026-10-20T12:00:00.000Z' }),
      films: Object.freeze([{}, {}]), series: Object.freeze([]), anime: Object.freeze([]), books: Object.freeze([]),
      mangas: Object.freeze([]), games: Object.freeze([]), artworks: Object.freeze([]),
      customLibraries: Object.freeze([Object.freeze({ libraryId: 'comics', entries: Object.freeze([{}, {}, {}]) })]),
    })
    const prepared = Object.freeze({ fileName: 'sylloge-2026-10-24.json', document: backupDocument })
    const snapshot = JSON.stringify(prepared)
    i18n.setLanguage('en')
    try {
      const html = render(BackupSummary, { value: prepared })
      assert.match(html, /aria-label="Backup contents"/)
      assert.match(html, /profile “Camille 日本語”/)
      assert.match(html, /24 October 2026/)
      assert.match(html, /5 entries in this profile\. Other profiles will be kept\./)
      assert.match(html, /It contains no saved views or display preferences\./)
      assert.doesNotMatch(html, /not part of this format/)
      assert.match(html, />Comics<\/dt>/)
      assert.doesNotMatch(html, /Contenu de la sauvegarde|profil «|fiches dans ce profil|24 octobre/)
    } finally { i18n.setLanguage('fr') }
    const html = render(BackupSummary, { value: prepared })
    assert.match(html, /aria-label="Contenu de la sauvegarde"/)
    assert.match(html, /profil « Camille 日本語 »/)
    assert.match(html, /5 fiches dans ce profil\./)
    assert.match(html, /Elle ne contient ni vue enregistrée ni préférence d’affichage\./)
    assert.equal(JSON.stringify(prepared), snapshot, 'La sauvegarde affichée reste intacte')
  })

  await test('La restauration d’un profil traduit son dialogue, sa destination et son nom proposé', () => {
    const prepared = Object.freeze({
      fileName: 'sylloge-2026-10-24.json',
      document: Object.freeze({
        format: 'sylloge-library', version: 4, exportedAt: '2026-10-24T12:00:00.000Z',
        profile: Object.freeze({ id: 'qa-restore', name: 'Camille 日本語', avatarDataUrl: null, createdAt: '2026-10-20T12:00:00.000Z', updatedAt: '2026-10-20T12:00:00.000Z' }),
        films: Object.freeze([{}, {}]), series: Object.freeze([]), anime: Object.freeze([]), books: Object.freeze([]),
        mangas: Object.freeze([]), games: Object.freeze([]), artworks: Object.freeze([]), customLibraries: Object.freeze([]),
      }),
    })
    // Double minimal : la boîte de dialogue lit document.activeElement au rendu.
    globalThis.HTMLElement = class HTMLElement {}
    globalThis.document = { activeElement: null }
    i18n.setLanguage('en')
    try {
      const html = render(RestoreProfileDialog, { profile, initial: prepared, onClose: noop })
      assert.match(html, /Restore a Sylloge profile/)
      assert.match(html, />Restore destination<\/legend>/)
      assert.match(html, />Create a new profile<\/label>/)
      assert.ok(html.includes(`Current profile “${profile.name}”, only if empty`))
      assert.match(html, /Restored profile name/)
      assert.match(html, /value="Camille 日本語 · copy"/)
      assert.match(html, />Confirm restoration<\/button>/)
      assert.match(html, /No existing entry will be deleted\./)
      assert.doesNotMatch(html, /Destination de la restauration|Créer un nouveau profil|Confirmer la restauration|Nom du profil restauré/)
    } finally { i18n.setLanguage('fr') }
    try {
      const html = render(RestoreProfileDialog, { profile, initial: prepared, onClose: noop })
      assert.match(html, /value="Camille 日本語 · copie"/)
      assert.match(html, />Confirmer la restauration<\/button>/)
    } finally {
      delete globalThis.document
      delete globalThis.HTMLElement
    }
  })

  await test('Les messages déjà composés sont traduits à l’affichage, jamais dans les données', () => {
    i18n.setLanguage('en')
    try {
      assert.equal(backupNoticeText('Choix du dossier annulé. Le réglage précédent reste inchangé.'), 'Folder selection cancelled. The previous setting is unchanged.')
      assert.equal(updaterMessageText('La version 1.4.0 est reportée pour cette session.'), 'Version 1.4.0 is postponed for this session.')
      assert.equal(updaterMessageText('Sylloge est déjà à jour. Aucune installation n’a démarré.'), 'Sylloge is already up to date. No installation started.')
      assert.equal(pickerMessageText('Le fichier n’est pas une sauvegarde Sylloge valide.'), 'This file is not a valid Sylloge backup.')
      // Gabarits du domaine (src/i18n/catalogs/messages.ts) traversant la même frontière.
      assert.equal(pickerMessageText('Sauvegarde Sylloge invalide.'), 'Invalid Sylloge backup.')
      assert.equal(updaterMessageText('La vérification a échoué. Vérifiez la connexion puis réessayez.'), 'The check failed. Check the connection and try again.')
      assert.equal(restoreErrorText('La restauration a échoué. Aucune restauration partielle n’a été conservée ; vérifier le fichier et réessayer.'), 'The restoration failed. No partial restoration was kept; check the file and try again.')
      assert.equal(updaterMessageText('EBUSY: resource busy or locked'), 'EBUSY: resource busy or locked', 'Un diagnostic inconnu reste intact')
      // Gabarit du domaine pour la conservation : la valeur reste celle du domaine.
      assert.match(backupNoticeText(BACKUP_RETENTION_SUMMARY), /^3 recent copies, then one (a|per) week for 4 weeks and one (a|per) month for 6 months$/)
      const html = render(UpdaterSettings, { availableUpdate: null, onUpdateAvailable: noop, onUpdateHandled: noop })
      assert.match(html, /Reading update preferences…/)
      assert.doesNotMatch(html, /Préférences de mise à jour|Lecture des préférences/)
    } finally { i18n.setLanguage('fr') }
    assert.equal(backupNoticeText('Choix du dossier annulé. Le réglage précédent reste inchangé.'), 'Choix du dossier annulé. Le réglage précédent reste inchangé.')
    assert.equal(pickerMessageText('EBUSY: resource busy or locked'), 'EBUSY: resource busy or locked')
  })

  const { LanguageSelect } = await server.ssrLoadModule('/src/i18n/LanguageSelect.tsx')
  await test('Le sélecteur de langue reste un contrôle natif étiqueté, et la langue ne recrée pas le formulaire', () => {
    i18n.setLanguage('en')
    try {
      const html = render(LanguageSelect)
      assert.match(html, /^<select[^>]*aria-label="Application language"/)
      assert.match(html, /aria-label="Application language"/)
      assert.doesNotMatch(html, /tabindex="-1"|aria-hidden="true"|disabled/)
      const french = html.match(/<option[^>]*value="fr"[^>]*>Français<\/option>/)
      const english = html.match(/<option[^>]*value="en"[^>]*>English<\/option>/)
      assert.ok(french && english, 'Les deux langues restent proposées, dans leur propre langue')
      assert.match(english[0], /lang="en"/)
      assert.match(english[0], /selected=""/)
      assert.match(french[0], /lang="fr"/)
      assert.doesNotMatch(french[0], /selected=""/)
    } finally { i18n.setLanguage('fr') }
    const french = render(LanguageSelect)
    const selected = french.match(/<option[^>]*value="fr"[^>]*>Français<\/option>/)[0]
    assert.match(selected, /selected=""/)
    // Même arbre, même champ : seul le texte change d’une langue à l’autre.
    const nameField = html => html.match(/<input[^>]*autoComplete="nickname"[^>]*\/>/)[0].replace(/ placeholder="[^"]*"/, '')
    i18n.setLanguage('en')
    const englishForm = render(Onboarding, { themePreference: 'system', onThemePreferenceChange: noop, onProfileReady: noop })
    i18n.setLanguage('fr')
    const frenchForm = render(Onboarding, { themePreference: 'system', onThemePreferenceChange: noop, onProfileReady: noop })
    assert.equal(nameField(englishForm), nameField(frenchForm), 'Le champ de nom garde la même identité et ses attributs')
    assert.equal((englishForm.match(/onboarding-name-field/g) ?? []).length, 1)
    assert.doesNotMatch(nameField(frenchForm), /English|Application language/)
  })
} finally {
  await server.close()
  rmSync(cacheDir, { recursive: true, force: true })
}
