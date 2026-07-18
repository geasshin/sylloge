import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SqliteFilmsRepository, toFilm } from '../src/data/filmsRepository.ts'
import { BackupService } from '../src/data/backupService.ts'
import { confirmValidatedImport } from '../src/data/libraryTransferService.ts'
import { UpdaterPreferencesService } from '../src/data/updaterPreferences.ts'
import { TauriUpdaterService, isMissingReleaseManifestError } from '../src/data/updaterService.ts'
import { EMPTY_FILM_FORM, localToday, validateFilmForm } from '../src/domain/filmForm.ts'
import {
  createLibraryExport,
  serializeLibraryExport,
  validateLibraryImport,
} from '../src/domain/libraryTransfer.ts'
import {
  filmsCsvExportFileName,
  serializeFilmsCsvExport,
  SYLLOGE_FILMS_CSV_HEADER,
} from '../src/domain/csvFilmExport.ts'

const profileRow = {
  id: 'default',
  name: 'Default',
  created_at: '2026-07-17T10:00:00.000Z',
  updated_at: '2026-07-17T10:00:00.000Z',
}

const filmRow = {
  id: 'film-test',
  profile_id: 'default',
  title: 'Film de vérification',
  original_title: null,
  year: null,
  status: 'à découvrir',
  is_favorite: 0,
  rating: null,
  watched_at: null,
  personal_note: null,
  director: null,
  summary: null,
  provider_name: null,
  provider_id: null,
  poster_url: null,
  created_at: '2026-07-17T10:00:00.000Z',
  updated_at: '2026-07-17T10:00:00.000Z',
}

{
  const tauriConfig = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
  const capabilities = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8'))
  const cargoManifest = readFileSync('src-tauri/Cargo.toml', 'utf8')

  assert.equal(tauriConfig.bundle.createUpdaterArtifacts, true, 'Le bundle doit générer les artefacts d’updater')
  assert.equal(
    tauriConfig.plugins.updater.pubkey,
    'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFFQkI1NTZERjA5OTczRjEKUldUeGM1bndiVlc3cmxLL1JnbE1LM0w3V29taDVkQ0ZJSGE2SnJkelFzNnhONFluNU5EbjZwcmYK',
    'La clé publique d’updater doit être celle décidée pour Sylloge',
  )
  assert.deepEqual(
    tauriConfig.plugins.updater.endpoints,
    ['https://github.com/geasshin/sylloge/releases/latest/download/latest.json'],
    'L’updater doit consulter uniquement la release GitHub statique attendue',
  )
  assert.equal(tauriConfig.plugins.updater.dangerousInsecureTransportProtocol, false, 'Le transport HTTP non sécurisé doit rester interdit')
  assert.ok(capabilities.permissions.includes('updater:default'), 'La fenêtre principale doit pouvoir vérifier les updates')
  assert.ok(capabilities.permissions.includes('process:default'), 'La fenêtre principale doit pouvoir relancer l’application après installation')
  assert.match(cargoManifest, /^tauri-plugin-updater = "2"$/m, 'Le plugin updater Rust officiel doit être déclaré')
  assert.match(cargoManifest, /^tauri-plugin-process = "2"$/m, 'Le plugin process Rust officiel doit être déclaré')
}

{
  const directory = mkdtempSync(join(tmpdir(), 'sylloge-updater-manifest-'))
  const notesPath = join(directory, 'notes.md')
  const signaturePath = join(directory, 'Sylloge.app.tar.gz.sig')
  const outputPath = join(directory, 'latest.json')
  writeFileSync(notesPath, 'Notes de la fixture\n', 'utf8')
  writeFileSync(signaturePath, 'signature de fixture\n', 'utf8')

  try {
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL('./create-tauri-latest-json.mjs', import.meta.url)),
      '--version', '0.3.0',
      '--notes-file', notesPath,
      '--url', 'https://github.com/geasshin/sylloge/releases/download/v0.3.0/Sylloge.app.tar.gz',
      '--signature-file', signaturePath,
      '--target', 'darwin-aarch64',
      '--output', outputPath,
    ], { encoding: 'utf8' })
    assert.equal(result.status, 0, `Le générateur latest.json doit réussir : ${result.stderr}`)
    assert.deepEqual(JSON.parse(readFileSync(outputPath, 'utf8')), {
      version: '0.3.0',
      notes: 'Notes de la fixture',
      platforms: {
        'darwin-aarch64': {
          signature: 'signature de fixture',
          url: 'https://github.com/geasshin/sylloge/releases/download/v0.3.0/Sylloge.app.tar.gz',
        },
      },
    }, 'Le manifeste Tauri doit reprendre la signature .sig et une URL HTTPS de façon déterministe')

    for (const invalidVersion of ['01.3.1', '0.3.1-01', '0.3.1-preview..1']) {
      const invalidResult = spawnSync(process.execPath, [
        fileURLToPath(new URL('./create-tauri-latest-json.mjs', import.meta.url)),
        '--version', invalidVersion,
        '--notes-file', notesPath,
        '--url', 'https://github.com/geasshin/sylloge/releases/download/v0.3.0/Sylloge.app.tar.gz',
        '--signature-file', signaturePath,
        '--target', 'darwin-aarch64',
        '--output', outputPath,
      ], { encoding: 'utf8' })
      assert.notEqual(invalidResult.status, 0, `La version invalide ${invalidVersion} doit être refusée`)
      assert.match(invalidResult.stderr, /Semantic Versioning valide/, 'Le refus doit expliquer la contrainte SemVer')
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

{
  let automaticChecksEnabled = true
  let ignoredVersion = null
  const preferencesService = new UpdaterPreferencesService({
    async get() {
      return {
        automaticChecksEnabled,
        ignoredVersion,
        updatedAt: '2026-07-18T10:00:00.000Z',
      }
    },
    async setAutomaticChecksEnabled(value) {
      automaticChecksEnabled = value
      return this.get()
    },
    async setIgnoredVersion(value) {
      ignoredVersion = value
      return this.get()
    },
  })

  assert.equal((await preferencesService.get()).automaticChecksEnabled, true, 'La recherche automatique doit être activée par défaut')
  assert.equal((await preferencesService.setAutomaticChecksEnabled(false)).automaticChecksEnabled, false, 'Le réglage automatique doit être persistant côté bridge')
  assert.equal((await preferencesService.ignoreVersion('0.3.1')).ignoredVersion, '0.3.1', 'Une seule version doit pouvoir être ignorée')
  assert.equal((await preferencesService.restoreIgnoredVersion()).ignoredVersion, null, 'La version ignorée doit pouvoir être rétablie')
}

{
  let checkCount = 0
  let downloadCount = 0
  let relaunchCount = 0
  const updater = new TauriUpdaterService(
    async () => {
      checkCount += 1
      return {
        version: '0.3.1',
        body: 'Notes de release',
        async downloadAndInstall() {
          downloadCount += 1
        },
      }
    },
    async () => {
      relaunchCount += 1
    },
  )

  const update = await updater.check()
  assert.equal(checkCount, 1, 'La vérification doit appeler uniquement l’API check')
  assert.equal(downloadCount, 0, 'La vérification ne doit jamais télécharger une mise à jour')
  assert.equal(update?.version, '0.3.1', 'La version détectée doit être transmise à l’interface')
  if (update) await updater.downloadAndInstall(update)
  assert.equal(downloadCount, 1, 'Le téléchargement et l’installation exigent une action distincte')
  assert.equal(relaunchCount, 1, 'Le redémarrage intervient seulement après l’installation')
  assert.equal(
    isMissingReleaseManifestError(new Error('Could not fetch a valid release JSON from the remote')),
    true,
    'Un manifeste absent ou invalide doit être reconnu sans faux succès',
  )
  assert.equal(isMissingReleaseManifestError(new Error('HTTP status 404')), false, 'Un code HTTP isolé ne doit pas être interprété à tort')
  assert.equal(isMissingReleaseManifestError(new Error('network unavailable')), false, 'Une erreur réseau ne doit pas être présentée comme un manifeste absent')
}

{
  const calls = []
  const database = {
    async select(query, bindValues) {
      calls.push({ kind: 'select', query, bindValues })
      if (query.includes('FROM profiles')) return [profileRow]
      if (query.includes('FROM films')) return [filmRow]
      throw new Error('Requête inattendue dans la vérification')
    },
    async execute() {
      throw new Error('Aucune écriture attendue pendant la lecture')
    },
  }
  const repository = new SqliteFilmsRepository(async () => database)
  const library = await repository.loadDefaultLibrary()

  assert.deepEqual(library.profile, {
    id: 'default',
    name: 'Default',
    createdAt: profileRow.created_at,
    updatedAt: profileRow.updated_at,
  }, 'Le profil default doit être converti vers le domaine')
  assert.equal(library.films.length, 1, 'Le dépôt doit retourner les films lus depuis SQLite')
  assert.deepEqual(library.films[0], {
    id: 'film-test',
    profileId: 'default',
    title: 'Film de vérification',
    originalTitle: null,
    year: null,
    status: 'à découvrir',
    isFavorite: false,
    rating: null,
    watchedAt: null,
    personalNote: null,
    director: null,
    summary: null,
    providerName: null,
    providerId: null,
    posterUrl: null,
    createdAt: filmRow.created_at,
    updatedAt: filmRow.updated_at,
  }, 'Toutes les colonnes Film doivent être converties sans valeur inventée')
  assert.equal(calls.length, 2, 'Le dépôt doit charger le profil puis ses films')
  assert.deepEqual(calls[0].bindValues, ['default'], 'La lecture du profil doit être paramétrée')
  assert.deepEqual(calls[1].bindValues, ['default'], 'La lecture des films doit être limitée au profil default')
  assert.match(calls[1].query, /ORDER BY title COLLATE NOCASE/, 'Le résultat SQLite doit avoir un ordre stable')
}

{
  const database = {
    async select() { return [] },
    async execute() { return { rowsAffected: 0 } },
  }
  const repository = new SqliteFilmsRepository(async () => database)
  await assert.rejects(
    repository.loadDefaultLibrary(),
    /profil local default est introuvable/i,
    'L’absence du profil default doit devenir une erreur explicite',
  )
}

const completeTransferFilm = {
  id: 'source-film-id',
  profileId: 'default',
  title: 'Film isolé de vérification',
  originalTitle: 'Isolated verification film',
  year: 2026,
  status: 'terminé',
  isFavorite: true,
  rating: 4.5,
  watchedAt: '2026-07-17',
  personalNote: 'Texte de test temporaire.',
  director: 'Réalisation de test',
  summary: 'Résumé de test.',
  providerName: 'Fournisseur de test',
  providerId: 'provider-test-id',
  posterUrl: 'https://example.invalid/poster.jpg',
  createdAt: '2026-07-17T10:00:00.000Z',
  updatedAt: '2026-07-17T11:00:00.000Z',
}

const completeExport = createLibraryExport({
  profile: {
    id: 'default',
    name: 'Profil de test isolé',
    createdAt: '2026-07-17T09:00:00.000Z',
    updatedAt: '2026-07-17T11:00:00.000Z',
  },
  films: [completeTransferFilm],
}, '2026-07-17T12:00:00.000Z')

{
  const automaticSnapshots = []
  const manualSnapshots = []
  let automaticCallCount = 0
  const service = new BackupService({
    async getBackupSettings() {
      return {
        backupDirectory: '/dossier-de-test',
        lastAutomaticSnapshotDay: null,
      }
    },
    async pickBackupDirectory() {
      return null
    },
    async saveManualBackupSnapshot(profileId, contents) {
      manualSnapshots.push({ profileId, contents })
      return { fileName: 'sylloge-films-v1-default-manuel.json', retainedSnapshotCount: 2 }
    },
    async saveAutomaticBackupSnapshot(profileId, contents, automaticDay) {
      automaticSnapshots.push({ profileId, contents, automaticDay })
      automaticCallCount += 1
      return automaticCallCount === 1
        ? { outcome: 'saved', fileName: 'sylloge-films-v1-default-auto.json' }
        : { outcome: 'alreadySaved', fileName: null }
    },
  }, () => new Date(2026, 6, 17, 12, 0, 0))
  const library = { profile: completeExport.profile, films: completeExport.films }

  const automaticNotice = await service.tryAutomaticSnapshot(library)
  assert.equal(automaticNotice?.kind, 'success', 'Le premier snapshot automatique doit être annoncé après une mutation réussie')
  assert.equal(automaticSnapshots[0].automaticDay, '2026-07-17', 'Le service doit demander le jour local au moment du snapshot')
  const automaticPreview = validateLibraryImport(automaticSnapshots[0].contents)
  assert.equal(automaticPreview.document?.format, 'sylloge-films', 'Le snapshot automatique doit réutiliser le format JSON v1')
  assert.equal(automaticPreview.validFilmCount, 1, 'Le snapshot automatique doit être réimportable par le validateur existant')

  const secondAutomaticNotice = await service.tryAutomaticSnapshot(library)
  assert.equal(secondAutomaticNotice, null, 'Un résultat natif déjà sauvegardé ne doit pas annoncer un second snapshot automatique')
  const manualNotice = await service.saveManualSnapshot(library)
  assert.equal(manualNotice.kind, 'success', 'Le snapshot manuel doit rester disponible après le snapshot automatique')
  assert.equal(manualSnapshots.length, 1, 'La sauvegarde manuelle doit appeler sa commande native dédiée')
  assert.equal(
    validateLibraryImport(manualSnapshots[0].contents).validFilmCount,
    1,
    'Le snapshot manuel doit rester compatible avec l’import JSON existant',
  )
}

{
  const serialized = serializeLibraryExport(completeExport)
  const preview = validateLibraryImport(serialized)
  assert.equal(preview.document?.format, 'sylloge-films', 'L’export doit annoncer un format stable')
  assert.equal(preview.document?.version, 1, 'L’export doit être explicitement versionné')
  assert.equal(preview.validFilmCount, 1, 'Tous les champs V1 valides doivent être acceptés')
  assert.deepEqual(preview.document?.films[0], completeTransferFilm, 'La validation ne doit perdre aucun champ Film V1')
  assert.match(serialized, /\n  "format": "sylloge-films"/, 'Le JSON doit être indenté et lisible')
  assert.doesNotMatch(serialized, /secret|api[_-]?key|data:image|imageData/i, 'L’export ne doit contenir ni secret ni image téléchargée')
}

{
  const fixture = JSON.parse(readFileSync('fixtures/csv-films-v1/anonymized-library.json', 'utf8'))
  const expectedCsv = readFileSync('fixtures/csv-films-v1/expected-export.csv', 'utf8')
  const document = createLibraryExport(fixture, fixture.exportedAt)
  const csv = serializeFilmsCsvExport(document)

  const jsonPreview = validateLibraryImport(serializeLibraryExport(document))
  assert.deepEqual(
    jsonPreview.document,
    document,
    'La fixture CSV doit aussi rester strictement compatible avec le JSON v1 existant',
  )
  assert.equal(
    jsonPreview.document?.films[0]?.originalTitle,
    "'Café du matin",
    'Le JSON v1 doit conserver inchangée une valeur source qui commence déjà par une apostrophe',
  )
  assert.equal(
    csv.replace(/\r\n/g, '\n'),
    expectedCsv,
    'Le CSV doit suivre la fixture anonymisée avec un échappement stable des virgules, guillemets, retours à la ligne et préfixes de formule neutralisés de manière réversible',
  )
  assert.deepEqual(
    csv.split('\r\n')[0].split(','),
    [...SYLLOGE_FILMS_CSV_HEADER],
    'L’en-tête CSV doit être stable et complet',
  )
  assert.match(csv, /"'=Carnet, ""été"""/, 'Un texte de profil commençant par = doit être neutralisé dans une cellule CSV citée')
  assert.match(csv, /"'\+Café, ""matin"""/, 'Un titre commençant par + doit être neutralisé dans une cellule CSV citée')
  assert.match(csv, /,''Café du matin,2024,/, 'Une source commençant déjà par une apostrophe doit recevoir exactement une seconde apostrophe pour permettre un retrait unique au futur import')
  assert.match(csv, /"'-Première note\.\nDeuxième ligne, avec ""guillemets""\."/, 'Une note commençant par - doit être neutralisée dans une cellule CSV citée et multiligne')
  assert.match(csv, /"'\t@Résumé, déjà lu\."/, 'Un résumé commençant par une tabulation puis @ doit être neutralisé sans perdre la tabulation dans une cellule CSV citée')
  assert.match(csv, /Café/, 'Les caractères accentués doivent rester lisibles dans le CSV')
  assert.doesNotMatch(csv, /secret|api[_-]?key|data:image|imageData/i, 'Le CSV ne doit contenir ni secret ni image téléchargée')
  const csvBytes = new TextEncoder().encode(csv)
  assert.equal(csvBytes[0], 'f'.charCodeAt(0), 'Le CSV UTF-8 ne doit pas commencer par un BOM')
  assert.equal(
    new TextDecoder('utf-8', { fatal: true }).decode(csvBytes),
    csv,
    'Le CSV doit être encodable et décodable en UTF-8 sans altération',
  )
  assert.equal(filmsCsvExportFileName(document.exportedAt), 'sylloge-films-2026-07-18.csv', 'Le nom CSV doit être déterministe')

  const emptyDocument = createLibraryExport({
    profile: {
      id: 'profil-vide',
      name: 'Profil vide',
      createdAt: '2026-07-18T10:00:00.000Z',
      updatedAt: '2026-07-18T10:00:00.000Z',
    },
    films: [],
  }, '2026-07-18T10:05:00.000Z')
  const emptyRows = serializeFilmsCsvExport(emptyDocument).split('\r\n')
  const emptyFilmCells = emptyRows[1].split(',').slice(7)
  assert.equal(emptyRows.length, 3, 'Un profil vide doit avoir un en-tête, une ligne de profil et une fin de fichier')
  assert.equal(emptyRows[1].split(',').length, SYLLOGE_FILMS_CSV_HEADER.length, 'La ligne d’un profil vide doit conserver toutes les colonnes')
  assert.ok(emptyFilmCells.every((cell) => cell === ''), 'Un profil vide ne doit inventer aucun Film')
}

{
  let writeCount = 0
  const invalidPreview = validateLibraryImport('{"format":"sylloge-films",')
  await assert.rejects(
    confirmValidatedImport(invalidPreview, async () => {
      writeCount += 1
      return null
    }),
    /invalide/i,
    'Un JSON invalide doit être bloqué avant l’importeur',
  )
  assert.equal(writeCount, 0, 'Un JSON invalide ne doit déclencher aucune écriture')
  assert.equal(invalidPreview.validFilmCount, 0, 'Le rapport invalide doit annoncer zéro entrée valide')
  assert.match(invalidPreview.errors[0].message, /JSON valide/i, 'Le rapport doit expliquer l’erreur de syntaxe')
}

{
  const partiallyInvalid = structuredClone(completeExport)
  partiallyInvalid.films.push({
    ...completeTransferFilm,
    id: 'invalid-film-id',
    title: 'Entrée invalide',
    rating: 4.75,
  })
  const preview = validateLibraryImport(JSON.stringify(partiallyInvalid))
  assert.equal(preview.document, null, 'Une entrée invalide doit bloquer le document entier')
  assert.equal(preview.validFilmCount, 1, 'L’aperçu doit compter les entrées valides sans les écrire')
  assert.equal(preview.totalFilmCount, 2, 'L’aperçu doit compter toutes les entrées lues')
  assert.match(preview.errors[0].path, /films\[1\]\.rating/, 'Le rapport doit localiser le champ invalide')
}

{
  let importedPayload
  let idIndex = 0
  const generatedIds = ['new-profile-id', 'new-film-id']
  const database = {
    async select(query, bindValues) {
      assert.deepEqual(bindValues, ['new-profile-id'], 'La relecture doit cibler uniquement le nouveau profil')
      if (query.includes('FROM profiles')) {
        return [{
          id: importedPayload.profile.id,
          name: importedPayload.profile.name,
          created_at: importedPayload.profile.createdAt,
          updated_at: importedPayload.profile.updatedAt,
        }]
      }
      if (query.includes('FROM films')) {
        return importedPayload.films.map((film) => ({
          id: film.id,
          profile_id: film.profileId,
          title: film.title,
          original_title: film.originalTitle,
          year: film.year,
          status: film.status,
          is_favorite: film.isFavorite ? 1 : 0,
          rating: film.rating,
          watched_at: film.watchedAt,
          personal_note: film.personalNote,
          director: film.director,
          summary: film.summary,
          provider_name: film.providerName,
          provider_id: film.providerId,
          poster_url: film.posterUrl,
          created_at: film.createdAt,
          updated_at: film.updatedAt,
        }))
      }
      throw new Error('Lecture SQLite inattendue après import')
    },
    async execute() {
      throw new Error('La transaction d’import doit être déléguée au backend Rust')
    },
  }
  const repository = new SqliteFilmsRepository(
    async () => database,
    () => generatedIds[idIndex++],
    () => '2026-07-17T13:00:00.000Z',
    async (payload) => {
      importedPayload = payload
      return { profileId: payload.profile.id, filmCount: payload.films.length }
    },
  )
  const importedLibrary = await repository.importLibrary(completeExport)
  assert.equal(importedPayload.profile.id, 'new-profile-id', 'L’import doit créer un nouvel identifiant de profil')
  assert.equal(importedPayload.films[0].id, 'new-film-id', 'L’import doit recréer les identifiants Film pour éviter les conflits')
  assert.equal(importedPayload.films[0].profileId, 'new-profile-id', 'Chaque film doit cibler exclusivement le nouveau profil')
  assert.deepEqual(
    { ...importedPayload.films[0], id: completeTransferFilm.id, profileId: completeTransferFilm.profileId },
    completeTransferFilm,
    'Tous les autres champs V1 doivent être transmis sans perte à la transaction',
  )
  assert.equal(importedLibrary.profile.id, 'new-profile-id', 'Le nouveau profil doit être relu après la transaction')
  assert.equal(importedLibrary.films[0].providerId, 'provider-test-id', 'Les références fournisseur facultatives doivent survivre à l’import')
}

{
  const calls = []
  const database = {
    async select(query, bindValues) {
      calls.push({ query, bindValues })
      return [filmRow]
    },
    async execute() {
      throw new Error('Aucune écriture attendue pendant la consultation')
    },
  }
  const repository = new SqliteFilmsRepository(async () => database)

  const searched = await repository.searchFilms('default', { query: '  Chihiro  ', filter: 'all' })
  assert.equal(searched[0].id, filmRow.id, 'La recherche doit convertir les résultats SQLite')
  assert.match(calls[0].query, /title COLLATE NOCASE LIKE \$2/, 'La recherche doit interroger le titre dans SQLite')
  assert.match(calls[0].query, /original_title COLLATE NOCASE LIKE \$2/, 'La recherche doit interroger le titre original dans SQLite')
  assert.match(calls[0].query, /director COLLATE NOCASE LIKE \$2/, 'La recherche doit interroger la réalisation dans SQLite')
  assert.deepEqual(calls[0].bindValues, ['default', '%Chihiro%'], 'Le texte recherché doit être normalisé et paramétré')

  await repository.searchFilms('default', { query: '100%_film', filter: 'to-discover' })
  assert.deepEqual(calls[1].bindValues, ['default', '%100\\%\\_film%', 'à découvrir'], 'Les jokers LIKE doivent être échappés et le filtre paramétré')
  assert.match(calls[1].query, /status = \$3/, 'Le filtre à découvrir doit être exécuté dans SQLite')

  await repository.searchFilms('default', { query: '', filter: 'completed' })
  assert.deepEqual(calls[2].bindValues, ['default', 'terminé'], 'Le filtre terminés doit être paramétré dans SQLite')
  assert.match(calls[2].query, /status = \$2/, 'Le filtre terminés doit être exécuté dans SQLite')

  await repository.searchFilms('default', { query: '', filter: 'favorites' })
  assert.deepEqual(calls[3].bindValues, ['default'], 'Le filtre favoris doit rester limité au profil courant')
  assert.match(calls[3].query, /is_favorite = 1/, 'Le filtre favoris doit être exécuté dans SQLite')

  await repository.searchFilms('default', { query: '', filter: 'all' })
  assert.doesNotMatch(calls[4].query, /status =|is_favorite = 1/, 'Le filtre tous ne doit ajouter aucune restriction')

  const detail = await repository.getFilm('default', 'film-test')
  assert.equal(detail?.id, 'film-test', 'La fiche doit être relue depuis SQLite')
  assert.match(calls[5].query, /WHERE id = \$1 AND profile_id = \$2/, 'La fiche doit cibler le film et le profil courant')
  assert.deepEqual(calls[5].bindValues, ['film-test', 'default'], 'La lecture de fiche doit être paramétrée')
}

assert.throws(
  () => toFilm({ ...filmRow, status: 'inconnu' }),
  /Statut Film inconnu/,
  'Une valeur de statut inconnue ne doit pas entrer silencieusement dans le domaine',
)

{
  const minimal = validateFilmForm({ ...EMPTY_FILM_FORM, title: '  Un titre  ' })
  assert.equal(minimal.success, true, 'Le titre seul doit suffire à créer un film')
  if (minimal.success) {
    assert.deepEqual(minimal.data, {
      title: 'Un titre',
      originalTitle: null,
      year: null,
      status: 'à découvrir',
      isFavorite: false,
      rating: null,
      watchedAt: null,
      personalNote: null,
      director: null,
      summary: null,
      posterUrl: null,
    }, 'Les champs facultatifs vides doivent rester null sans donnée inventée')
  }

  const missingTitle = validateFilmForm({ ...EMPTY_FILM_FORM, title: '   ' })
  assert.equal(missingTitle.success, false, 'Un titre vide doit être refusé')
  if (!missingTitle.success) assert.match(missingTitle.errors.title, /obligatoire/i)

  for (let rating = 0.5; rating <= 5; rating += 0.5) {
    assert.equal(
      validateFilmForm({ ...EMPTY_FILM_FORM, title: 'Valide', rating: String(rating) }).success,
      true,
      `La note ${rating} doit être acceptée`,
    )
  }

  for (const rating of ['0', '0.25', '4.75', '5.5', 'abc']) {
    const result = validateFilmForm({ ...EMPTY_FILM_FORM, title: 'Invalide', rating })
    assert.equal(result.success, false, `La note ${rating} doit être refusée`)
    if (!result.success) assert.match(result.errors.rating, /demi-points/i)
  }

  const badStatus = validateFilmForm({ ...EMPTY_FILM_FORM, title: 'Statut', status: 'inconnu' })
  assert.equal(badStatus.success, false, 'Un statut hors liste doit être refusé')

  const badDate = validateFilmForm({ ...EMPTY_FILM_FORM, title: 'Date', watchedAt: '2026-02-30' })
  assert.equal(badDate.success, false, 'Une date inexistante doit être refusée')

  const badUrl = validateFilmForm({ ...EMPTY_FILM_FORM, title: 'URL', posterUrl: 'une-page-web' })
  assert.equal(badUrl.success, false, 'Une URL incomplète doit être refusée')

  const unreachablePoster = validateFilmForm({
    ...EMPTY_FILM_FORM,
    title: 'Affiche indisponible',
    posterUrl: 'https://example.invalid/poster.jpg',
  })
  assert.equal(unreachablePoster.success, true, 'Une URL HTTP valide doit être enregistrable sans tester le chargement de l’image')
  assert.equal(localToday(new Date(2026, 6, 17)), '2026-07-17', 'La proposition de date doit utiliser le jour local')
}

{
  const calls = []
  const database = {
    async select() { return [] },
    async execute(query, bindValues) {
      calls.push({ query, bindValues })
      return { rowsAffected: 1 }
    },
  }
  const input = {
    title: 'Le Voyage de Chihiro',
    originalTitle: 'Sen to Chihiro no kamikakushi',
    year: 2001,
    status: 'terminé',
    isFavorite: true,
    rating: 4.5,
    watchedAt: '2026-07-17',
    personalNote: 'À revoir.',
    director: 'Hayao Miyazaki',
    summary: null,
    posterUrl: 'https://example.invalid/poster.jpg',
  }
  const repository = new SqliteFilmsRepository(
    async () => database,
    () => 'film-uuid',
    () => '2026-07-17T12:34:56.000Z',
  )

  const created = await repository.createFilm('default', input)
  assert.equal(created.id, 'film-uuid', 'La création doit utiliser un identifiant stable')
  assert.equal(created.profileId, 'default', 'La création doit rester dans le profil courant')
  assert.equal(created.createdAt, '2026-07-17T12:34:56.000Z', 'La création doit stocker un horodatage UTC')
  assert.equal(created.providerName, null, 'La création manuelle ne doit inventer aucun fournisseur')
  assert.match(calls[0].query, /^INSERT INTO films/m, 'La création doit passer par le dépôt SQLite')
  assert.deepEqual(calls[0].bindValues.slice(0, 3), ['film-uuid', 'default', input.title], 'L’INSERT doit paramétrer identifiant, profil et titre')
  assert.equal(calls[0].bindValues[6], 1, 'Le favori doit être encodé explicitement pour SQLite')

  const updatedAt = await repository.updateFilm('default', 'film-uuid', { ...input, title: 'Titre modifié' })
  assert.equal(updatedAt, '2026-07-17T12:34:56.000Z', 'La modification doit produire un horodatage UTC')
  assert.match(calls[1].query, /^UPDATE films/m, 'La modification doit passer par le dépôt SQLite')
  assert.deepEqual(calls[1].bindValues.slice(-2), ['film-uuid', 'default'], 'La modification doit cibler le film et le profil courant')

  await repository.deleteFilm('default', 'film-uuid')
  assert.match(calls[2].query, /^DELETE FROM films/m, 'La suppression doit être définitive dans SQLite')
  assert.deepEqual(calls[2].bindValues, ['film-uuid', 'default'], 'La suppression doit cibler le film et le profil courant')
}

{
  const database = {
    async select() { return [] },
    async execute() { return { rowsAffected: 0 } },
  }
  const repository = new SqliteFilmsRepository(async () => database)
  await assert.rejects(
    repository.deleteFilm('default', 'absent'),
    /introuvable/i,
    'Une suppression sans ligne affectée ne doit pas être présentée comme réussie',
  )
}

const mainSource = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
const posterSource = readFileSync(new URL('../src/components/Poster.tsx', import.meta.url), 'utf8')
const formSource = readFileSync(new URL('../src/components/FilmForm.tsx', import.meta.url), 'utf8')
const detailSource = readFileSync(new URL('../src/components/FilmDetail.tsx', import.meta.url), 'utf8')
const portabilitySource = readFileSync(new URL('../src/components/Portability.tsx', import.meta.url), 'utf8')
const transferSource = readFileSync(new URL('../src/domain/libraryTransfer.ts', import.meta.url), 'utf8')
const csvTransferSource = readFileSync(new URL('../src/domain/csvFilmExport.ts', import.meta.url), 'utf8')
const nativePortabilityBridgeSource = readFileSync(new URL('../src/data/nativePortability.ts', import.meta.url), 'utf8')
const nativePortabilitySource = readFileSync(new URL('../src-tauri/src/portability.rs', import.meta.url), 'utf8')
const tauriLibrarySource = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8')
const repositorySource = readFileSync(new URL('../src/data/filmsRepository.ts', import.meta.url), 'utf8')
const migrationSource = readFileSync(new URL('../src-tauri/migrations/0001_create_profiles_and_films.sql', import.meta.url), 'utf8')
const defaultProfileMigration = readFileSync(new URL('../src-tauri/migrations/0002_create_default_profile.sql', import.meta.url), 'utf8')
const currentProfileMigration = readFileSync(new URL('../src-tauri/migrations/0003_track_current_profile.sql', import.meta.url), 'utf8')
const backupSettingsMigration = readFileSync(new URL('../src-tauri/migrations/0004_create_backup_settings.sql', import.meta.url), 'utf8')
const backupSnapshotsMigration = readFileSync(new URL('../src-tauri/migrations/0005_create_backup_snapshots.sql', import.meta.url), 'utf8')
const capabilitySource = readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

assert.doesNotMatch(mainSource, /\bSELECT\b|\bINSERT INTO films\b|\bUPDATE films\b|\bDELETE FROM films\b/i, 'Les composants React ne doivent contenir aucun SQL brut')
assert.match(mainSource, /createFilm/, 'La vue doit relier la création au dépôt SQLite')
assert.match(mainSource, /updateFilm/, 'La vue doit relier la modification au dépôt SQLite')
assert.match(mainSource, /deleteFilm/, 'La vue doit relier la suppression au dépôt SQLite')
assert.match(mainSource, /searchFilms/, 'La recherche et les filtres doivent appeler le dépôt SQLite')
assert.match(mainSource, /getFilm/, 'La fiche doit être relue depuis SQLite')
assert.match(mainSource, /libraryContext/, 'Le contexte de recherche et de filtre doit rester porté par la bibliothèque')
assert.match(mainSource, /libraryScrollPosition/, 'La position de consultation doit être restaurée au retour')
assert.match(posterSource, /!src \|\| missing/, 'Une affiche absente ou cassée doit utiliser le fallback')
assert.match(posterSource, /alt={`Affiche du film/, 'Une affiche chargée doit conserver un texte alternatif pertinent')
assert.match(stylesSource, /\.film-card-info b \{[^}]*overflow-wrap: anywhere;/s, 'Le titre d’une carte doit pouvoir couper une suite de caractères sans espace')
assert.match(stylesSource, /\.poster-fallback b \{[^}]*overflow-wrap: anywhere;/s, 'Le titre du fallback d’affiche doit pouvoir couper une suite de caractères sans espace')
assert.match(stylesSource, /\.reading-section p \{[^}]*overflow-wrap: anywhere;/s, 'Le texte personnel de détail doit pouvoir couper une suite de caractères sans espace')
assert.match(formSource, /Aperçu de l’affiche/, 'Le formulaire doit afficher un aperçu de poster_url')
assert.match(formSource, /<Poster title={previewTitle} src={previewUrl}/, 'L’aperçu du formulaire doit réutiliser le fallback typographique')
assert.match(formSource, /Utiliser aujourd’hui/, 'Le statut terminé doit proposer la date du jour sans la saisir automatiquement')
assert.match(formSource, /onCancel/, 'Le formulaire doit permettre une annulation avant toute écriture')
assert.match(detailSource, /Supprimer définitivement/, 'La suppression doit demander une confirmation explicite')
assert.match(repositorySource, /WHERE profile_id = \$1/, 'La lecture Films doit être paramétrée par profil')
assert.match(repositorySource, /WHERE id = \$13 AND profile_id = \$14/, 'La modification doit être limitée au film du profil courant')
assert.match(repositorySource, /WHERE id = \$1 AND profile_id = \$2/, 'La suppression doit être limitée au film du profil courant')
assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS profiles/, 'La migration doit créer les profils')
assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS films/, 'La migration doit créer les films')
assert.match(defaultProfileMigration, /ON CONFLICT\(id\) DO NOTHING/, 'Le profil default doit être initialisé sans écrasement')
assert.match(currentProfileMigration, /CREATE TABLE IF NOT EXISTS current_profile/, 'Le profil courant doit être persisté pour survivre à une relance')
assert.match(backupSettingsMigration, /CREATE TABLE IF NOT EXISTS backup_settings/, 'Les réglages de sauvegarde doivent être persistés localement')
assert.match(backupSettingsMigration, /profile_id TEXT PRIMARY KEY/, 'Le réglage de sauvegarde doit être isolé par profil')
assert.match(backupSettingsMigration, /last_automatic_snapshot_day TEXT/, 'Le dernier jour automatique doit être mémorisé sans être requis')
assert.match(backupSnapshotsMigration, /CREATE TABLE IF NOT EXISTS backup_snapshots/, 'Le registre d’appartenance des snapshots doit être persisté localement')
assert.match(backupSnapshotsMigration, /PRIMARY KEY \(profile_id, file_name\)/, 'Le registre doit lier chaque snapshot à son profil et son nom de fichier')
assert.match(transferSource, /SYLLOGE_EXPORT_VERSION = 1/, 'Le format JSON doit avoir une version explicite')
assert.match(csvTransferSource, /SYLLOGE_FILMS_CSV_VERSION = 1/, 'Le contrat CSV doit avoir une version explicite')
assert.match(csvTransferSource, /sylloge-films-csv/, 'Le CSV doit annoncer son format stable')
assert.match(portabilitySource, /Créer le nouveau profil et importer/, 'La confirmation d’import doit nommer explicitement la création du profil')
assert.match(portabilitySource, /Aucune donnée n’a été écrite/, 'Un aperçu invalide doit annoncer l’absence d’écriture')
assert.match(portabilitySource, /Exporter ce profil en CSV/, 'Les Paramètres doivent proposer un export CSV explicite')
assert.match(nativePortabilityBridgeSource, /invoke\('save_export_csv'/, 'Le frontend doit appeler le pont Tauri CSV dédié')
assert.match(tauriLibrarySource, /portability::save_export_csv/, 'La commande Tauri CSV doit être enregistrée')
assert.match(nativePortabilitySource, /pub async fn save_export_csv/, 'Le pont natif doit exposer une sauvegarde CSV')
assert.match(nativePortabilitySource, /"Export CSV Sylloge"/, 'Le dialogue natif CSV doit filtrer explicitement le format CSV')
assert.match(nativePortabilitySource, /\.begin\(\)/, 'L’import doit démarrer une transaction SQLite atomique côté Rust')
assert.match(nativePortabilitySource, /\.commit\(\)/, 'L’import doit valider explicitement la transaction SQLite')
assert.match(nativePortabilitySource, /write_snapshot_atomically/, 'Les snapshots doivent passer par une écriture atomique native')
assert.match(nativePortabilitySource, /SNAPSHOT_RETENTION_COUNT: usize = 30/, 'La rétention native doit être limitée à 30 snapshots')
assert.match(mainSource, /requestAutomaticBackup/, 'Chaque mutation réussie doit pouvoir tenter une sauvegarde automatique non bloquante')
assert.doesNotMatch(capabilitySource, /fs:allow|dialog:allow/, 'Le frontend ne doit recevoir aucune permission générale de fichier ou de dialogue')
assert.match(capabilitySource, /sql:allow-load/, 'Tauri doit autoriser le chargement SQLite')
assert.match(capabilitySource, /sql:allow-select/, 'Tauri doit autoriser les lectures SQLite')
assert.match(capabilitySource, /sql:allow-execute/, 'Tauri doit autoriser les écritures SQLite')

console.log('Vérification réussie : Films SQLite, JSON v1 strict et réimportable, CSV Films v1 UTF-8 échappé, pont natif CSV, import bloqué avant écriture si invalide, nouveau profil et transaction atomique.')
