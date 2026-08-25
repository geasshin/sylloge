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
  filmMetadataResultToFormInitialValues,
  searchFilmMetadata,
  unconfiguredFilmMetadataSource,
} from '../src/domain/filmMetadataAssistance.ts'
import {
  createLibraryExport,
  serializeLibraryExport,
  validateLibraryImport,
} from '../src/domain/libraryTransfer.ts'
import { createLibraryDocument, serializeLibraryDocument, validateLibraryDocument } from '../src/domain/libraryDocument.ts'
import {
  parseArtworksCollectionJson,
  parseBooksCollectionJson,
  parseFilmsCollectionJson,
  parseGamesCollectionJson,
  parseSeriesCollectionJson,
} from '../src/domain/collectionJsonImport.ts'
import {
  filmsCsvExportFileName,
  serializeFilmsCsvExport,
  SYLLOGE_FILMS_CSV_HEADER,
} from '../src/domain/csvFilmExport.ts'
import { createCollectionCsvExport } from '../src/domain/collectionCsvTransfer.ts'
import {
  prepareCollectionCsvImport,
  previewCollectionCsvImport,
  setCollectionCsvSourceDestination,
} from '../src/domain/collectionCsvImport.ts'
import {
  NOTION_MARKDOWN_NOTES_SOURCE,
  conciseFilmImportReportSource,
  initialFilmImportConfiguration,
  inspectFilmCsvImportSource,
  parseCsv,
  prepareFilmCsvImport,
  previewFilmCsvImport,
  setFilmImportSourceDestination,
} from '../src/domain/filmCsvImport.ts'

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

function csvCandidate(contents, name = 'table.csv', id = 'csv-0') {
  return { id, name, contents }
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
  const clearedProfiles = []
  let automaticCallCount = 0
  const service = new BackupService({
    async getBackupSettings() {
      return {
        backupDirectory: '/dossier-de-test',
        lastAutomaticSnapshotDay: null,
        directoryAvailable: true,
      }
    },
    async pickBackupDirectory() {
      return null
    },
    async clearBackupSettings(profileId) {
      clearedProfiles.push(profileId)
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
  }, () => new Date(2026, 6, 17, 12, 0, 0), async () => ({
    profile: completeExport.profile,
    films: completeExport.films,
    series: [],
    books: [],
    games: [],
    artworks: [],
  }))
  const library = { profile: completeExport.profile, films: completeExport.films }

  const automaticNotice = await service.tryAutomaticSnapshot(library)
  assert.equal(automaticNotice?.kind, 'success', 'Le premier snapshot automatique doit être annoncé après une mutation réussie')
  assert.equal(automaticSnapshots[0].automaticDay, '2026-07-17', 'Le service doit demander le jour local au moment du snapshot')
  const automaticPreview = validateLibraryDocument(automaticSnapshots[0].contents)
  assert.equal(automaticPreview.document?.format, 'sylloge-library', 'Le snapshot automatique doit utiliser le format JSON v2 (jalon 0.4.4)')
  assert.equal(automaticPreview.counts.films, 1, 'Le snapshot automatique doit contenir le film du profil')

  const secondAutomaticNotice = await service.tryAutomaticSnapshot(library)
  assert.equal(secondAutomaticNotice, null, 'Un résultat natif déjà sauvegardé ne doit pas annoncer un second snapshot automatique')
  const manualNotice = await service.saveManualSnapshot(library)
  assert.equal(manualNotice.kind, 'success', 'Le snapshot manuel doit rester disponible après le snapshot automatique')
  assert.equal(manualSnapshots.length, 1, 'La sauvegarde manuelle doit appeler sa commande native dédiée')
  await service.clearSettings(library.profile.id)
  assert.deepEqual(clearedProfiles, ['default'], 'Désactiver les snapshots doit oublier le réglage du profil courant')
  assert.equal(
    validateLibraryDocument(manualSnapshots[0].contents).counts.films,
    1,
    'Le snapshot manuel doit rester compatible avec l’import global v2',
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
  const historicalDocument = structuredClone(completeExport)
  Object.assign(historicalDocument.films[0], {
    originalTitle: '',
    watchedAt: '',
    personalNote: 'Texte  historique  préservé.',
    director: '',
    summary: '',
    providerName: 'Source historique',
    providerId: '',
    posterUrl: '',
  })

  const jsonPreview = validateLibraryImport(JSON.stringify(historicalDocument))
  assert.equal(jsonPreview.errors.length, 0, 'Un JSON v1 historique avec des chaînes facultatives vides doit rester réimportable')
  assert.deepEqual(
    jsonPreview.document?.films[0],
    {
      ...completeTransferFilm,
      originalTitle: null,
      watchedAt: null,
      personalNote: 'Texte  historique  préservé.',
      director: null,
      summary: null,
      providerName: null,
      providerId: null,
      posterUrl: null,
    },
    'Le JSON v1 historique doit devenir canonique sans tronquer un texte ni inventer une provenance',
  )
  const canonicalJson = serializeLibraryExport(historicalDocument)
  assert.match(canonicalJson, /"providerName": null/, 'La réexportation JSON doit écrire une provenance partielle normalisée')
  assert.match(canonicalJson, /Texte  historique  préservé/, 'La réexportation JSON doit garder les espaces internes du texte')

  const historicalCsv = serializeFilmsCsvExport(completeExport)
    .replace('Fournisseur de test,provider-test-id', 'Fournisseur de test,')
  const csvSource = {
    name: 'sylloge-historique.csv',
    kind: 'csv',
    csvCandidates: [csvCandidate(historicalCsv, 'sylloge-historique.csv')],
    markdownPages: [],
  }
  const csvSession = prepareFilmCsvImport(csvSource)
  const csvPreview = previewFilmCsvImport(
    csvSession,
    csvSource,
    initialFilmImportConfiguration(csvSession),
  )
  assert.equal(csvPreview.errors.length, 0, 'Un CSV Sylloge v1 historique avec provenance partielle doit rester réimportable')
  assert.deepEqual(
    [csvPreview.document?.films[0].providerName, csvPreview.document?.films[0].providerId],
    [null, null],
    'Le CSV Sylloge doit effacer une provenance partielle en paire sans compléter la donnée',
  )
  const canonicalCsv = serializeFilmsCsvExport(csvPreview.document)
  const canonicalCsvSource = { ...csvSource, csvCandidates: [csvCandidate(canonicalCsv, 'sylloge-canonique.csv')] }
  const canonicalCsvSession = prepareFilmCsvImport(canonicalCsvSource)
  const canonicalCsvPreview = previewFilmCsvImport(
    canonicalCsvSession,
    canonicalCsvSource,
    initialFilmImportConfiguration(canonicalCsvSession),
  )
  assert.deepEqual(
    canonicalCsvPreview.document,
    csvPreview.document,
    'Un CSV canonique réexporté doit se réimporter sans autre transformation',
  )
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
  assert.match(csv, /,''Café du matin,2024,/, 'Une source commençant déjà par une apostrophe doit recevoir exactement une seconde apostrophe pour permettre un retrait unique lors de l’import contrôlé')
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

  const session = prepareFilmCsvImport({
    name: 'sylloge-films.csv',
    kind: 'csv',
    csvCandidates: [csvCandidate(csv, 'sylloge-films.csv')],
    markdownPages: [],
  })
  const csvImportPreview = previewFilmCsvImport(session, {
    name: 'sylloge-films.csv',
    kind: 'csv',
    csvCandidates: [csvCandidate(csv, 'sylloge-films.csv')],
    markdownPages: [],
  }, initialFilmImportConfiguration(session), fixture.exportedAt)
  assert.deepEqual(
    csvImportPreview.document,
    document,
    'Le CSV Sylloge v1 doit reconstituer le document Films v1 exact, y compris les apostrophes de protection tableur retirées une seule fois',
  )
  assert.deepEqual(
    [csvImportPreview.document?.films[0].providerName, csvImportPreview.document?.films[0].providerId],
    ['Catalogue local', 'source-ete-42'],
    'La fixture Sylloge doit conserver une provenance complète comme paire atomique',
  )
}

{
  const multiMediumLibrary = {
    profile: completeExport.profile,
    films: [completeTransferFilm],
    series: [{
      id: 'series-1', profileId: 'default', title: '+Série, « test »', showrunner: 'Créatrice', casting: 'A, B',
      summary: 'Une ligne\nDeuxième ligne', category: 'animation', status: 'en cours', rating: 4.5,
      isFavorite: true, seasonsSeen: 2, seasonsTotal: 3, progressUpdatedAt: '2026-07-18T10:00:00.000Z',
      startedAt: '2026-07-17', posterUrl: null, personalNote: 'Note série',
      createdAt: '2026-07-17T10:00:00.000Z', updatedAt: '2026-07-18T10:00:00.000Z',
    }],
    books: [{
      id: 'book-1', profileId: 'default', title: 'Livre « test »', author: 'Autrice', year: 2025,
      summary: null, category: 'manga', status: 'en cours', rating: 4, isFavorite: false,
      volumesRead: 3, volumesTotal: 5, progressUpdatedAt: '2026-07-18T10:00:00.000Z',
      startedAt: '2026-07-16', coverUrl: null, personalNote: 'Avis, avec virgule',
      createdAt: '2026-07-16T10:00:00.000Z', updatedAt: '2026-07-18T10:00:00.000Z',
      quotes: [
        { id: 'quote-2', bookId: 'book-1', body: 'Seconde citation', position: 2, createdAt: '2026-07-18T10:00:00.000Z' },
        { id: 'quote-1', bookId: 'book-1', body: '=Première citation\navec retour', position: 1, createdAt: '2026-07-17T10:00:00.000Z' },
      ],
    }],
    games: [{
      id: 'game-1', profileId: 'default', title: 'Jeu test', developer: 'Studio', platform: 'PC', year: 2024,
      status: 'joué', rating: 5, isFavorite: true, playedAt: '2026-07-15', coverUrl: null,
      personalNote: '@Note de jeu', createdAt: '2026-07-15T10:00:00.000Z', updatedAt: '2026-07-18T10:00:00.000Z',
    }],
    artworks: [{
      id: 'art-1', profileId: 'default', title: 'Œuvre test', artist: 'Artiste', year: 2020,
      form: 'photographie', location: 'Paris', exhibition: 'Exposition', status: 'découverte',
      isFavorite: true, discoveredAt: '2026-07-14', imageUrl: null, personalNote: 'Texte « libre »',
      createdAt: '2026-07-14T10:00:00.000Z', updatedAt: '2026-07-18T10:00:00.000Z',
    }],
  }
  const exportedAt = '2026-07-18T12:00:00.000Z'
  const expectedFormats = {
    films: 'sylloge-films-csv', series: 'sylloge-series-csv', books: 'sylloge-books-csv',
    games: 'sylloge-games-csv', artworks: 'sylloge-artworks-csv',
  }

  for (const kind of ['films', 'series', 'books', 'games', 'artworks']) {
    const exported = createCollectionCsvExport(multiMediumLibrary, kind, exportedAt)
    const parsed = parseCsv(exported.contents)
    assert.deepEqual(parsed.errors, [], `Le CSV ${kind} doit être syntaxiquement lisible`)
    assert.equal(parsed.rows.length, 1, `Le CSV ${kind} doit contenir une ligne de collection`)
    assert.equal(parsed.rows[0].cells[0], expectedFormats[kind], `Le CSV ${kind} doit avoir son format versionné`)
    assert.equal(parsed.rows[0].cells[1], '1', `Le CSV ${kind} doit annoncer sa version`)
    assert.equal(new TextEncoder().encode(exported.contents)[0], 'f'.charCodeAt(0), `Le CSV ${kind} reste UTF-8 sans BOM`)
    assert.match(exported.contents, /\r\n$/u, `Le CSV ${kind} doit finir avec CRLF`)
  }

  const series = createCollectionCsvExport(multiMediumLibrary, 'series', exportedAt)
  const parsedSeries = parseCsv(series.contents)
  assert.equal(parsedSeries.headers.includes('series_seasons_seen'), true, 'Le CSV Séries doit séparer saisons vues et total')
  assert.equal(parsedSeries.rows[0].cells[9], "'+Série, « test »", 'Les titres Série commençant par + doivent être neutralisés pour les tableurs')
  assert.equal(series.fileName, 'sylloge-series-2026-07-18.csv', 'Le nom Série doit être déterministe')

  const books = createCollectionCsvExport(multiMediumLibrary, 'books', exportedAt)
  const parsedBooks = parseCsv(books.contents)
  const quotesIndex = parsedBooks.headers.indexOf('book_quotes_json')
  assert.deepEqual(
    JSON.parse(parsedBooks.rows[0].cells[quotesIndex]),
    ['=Première citation\navec retour', 'Seconde citation'],
    'Le CSV Livres doit conserver les citations dans leur ordre, avec leurs retours à la ligne',
  )

  const games = createCollectionCsvExport(multiMediumLibrary, 'games', exportedAt)
  const parsedGames = parseCsv(games.contents)
  assert.equal(parsedGames.rows[0].cells[18], "'@Note de jeu", 'Les notes Jeu à risque doivent être neutralisées pour les tableurs')
  assert.equal(parsedGames.headers.includes('game_platform'), true, 'La plateforme libre doit rester une colonne Jeu dédiée')

  const artworks = createCollectionCsvExport(multiMediumLibrary, 'artworks', exportedAt)
  const parsedArtworks = parseCsv(artworks.contents)
  assert.equal(parsedArtworks.headers.includes('artwork_rating'), false, 'Le CSV Art ne doit pas inventer de note')
  assert.equal(parsedArtworks.headers.includes('artwork_location'), true, 'Le CSV Art doit conserver le lieu libre')

  const emptyGames = createCollectionCsvExport({ ...multiMediumLibrary, games: [] }, 'games', exportedAt)
  const parsedEmptyGames = parseCsv(emptyGames.contents)
  assert.equal(parsedEmptyGames.rows.length, 1, 'Une collection CSV vide doit conserver sa ligne de profil')
  assert.ok(parsedEmptyGames.rows[0].cells.slice(7).every((cell) => cell === ''), 'Une collection CSV vide ne doit inventer aucune fiche')

  for (const kind of ['series', 'books', 'games', 'artworks']) {
    const exported = createCollectionCsvExport(multiMediumLibrary, kind, exportedAt)
    const session = prepareCollectionCsvImport(kind, exported.contents)
    const preview = previewCollectionCsvImport(session, session.initialMapping, exportedAt)
    assert.equal(preview.errors.length, 0, `Le CSV Sylloge ${kind} doit être réimportable sans erreur`)
    assert.equal(preview.items?.length, 1, `Le CSV Sylloge ${kind} doit reconstituer sa fiche`)
  }

  const reimportedSeries = previewCollectionCsvImport(
    prepareCollectionCsvImport('series', series.contents),
    {},
    exportedAt,
  ).items?.[0]
  assert.deepEqual(
    {
      title: reimportedSeries?.title,
      category: reimportedSeries?.category,
      status: reimportedSeries?.status,
      seasonsSeen: reimportedSeries?.seasonsSeen,
      seasonsTotal: reimportedSeries?.seasonsTotal,
      progressUpdatedAt: reimportedSeries?.progressUpdatedAt,
      personalNote: reimportedSeries?.personalNote,
    },
    {
      title: multiMediumLibrary.series[0].title,
      category: multiMediumLibrary.series[0].category,
      status: multiMediumLibrary.series[0].status,
      seasonsSeen: multiMediumLibrary.series[0].seasonsSeen,
      seasonsTotal: multiMediumLibrary.series[0].seasonsTotal,
      progressUpdatedAt: multiMediumLibrary.series[0].progressUpdatedAt,
      personalNote: multiMediumLibrary.series[0].personalNote,
    },
    'La réimportation Série doit préserver les champs CSV représentables',
  )
  const reimportedBook = previewCollectionCsvImport(
    prepareCollectionCsvImport('books', books.contents),
    {},
    exportedAt,
  ).items?.[0]
  assert.deepEqual(
    reimportedBook?.quotes.map((quote) => quote.body),
    ['=Première citation\navec retour', 'Seconde citation'],
    'La réimportation Livre doit restaurer les citations CSV dans leur ordre',
  )
  const reimportedGame = previewCollectionCsvImport(
    prepareCollectionCsvImport('games', games.contents),
    {},
    exportedAt,
  ).items?.[0]
  assert.deepEqual(
    [reimportedGame?.platform, reimportedGame?.rating, reimportedGame?.personalNote],
    ['PC', 5, '@Note de jeu'],
    'La réimportation Jeu doit préserver la plateforme libre et les données personnelles',
  )
  const reimportedArtwork = previewCollectionCsvImport(
    prepareCollectionCsvImport('artworks', artworks.contents),
    {},
    exportedAt,
  ).items?.[0]
  assert.deepEqual(
    [reimportedArtwork?.form, reimportedArtwork?.location, reimportedArtwork?.exhibition, reimportedArtwork?.personalNote],
    ['photographie', 'Paris', 'Exposition', 'Texte « libre »'],
    'La réimportation Art doit préserver les champs libres sans inventer de note',
  )

  const externalSeries = prepareCollectionCsvImport('series', 'Nom,État,Préféré\nSérie externe,Vue,oui\n')
  let externalMapping = externalSeries.initialMapping
  externalMapping = setCollectionCsvSourceDestination(externalMapping, 'title', 'Nom')
  externalMapping = setCollectionCsvSourceDestination(externalMapping, 'status', 'État')
  externalMapping = setCollectionCsvSourceDestination(externalMapping, 'isFavorite', 'Préféré')
  const externalPreview = previewCollectionCsvImport(externalSeries, externalMapping, exportedAt)
  assert.deepEqual(
    [externalPreview.items?.[0]?.title, externalPreview.items?.[0]?.status, externalPreview.items?.[0]?.isFavorite],
    ['Série externe', 'vue', true],
    'Un CSV externe avec des en-têtes différents doit passer par un mapping explicite',
  )

  const invalidGames = prepareCollectionCsvImport('games', 'Nom,Statut\nJeu valide,Joué\n,En cours\n')
  const invalidMapping = setCollectionCsvSourceDestination(invalidGames.initialMapping, 'title', 'Nom')
  const invalidPreview = previewCollectionCsvImport(invalidGames, invalidMapping, exportedAt)
  assert.equal(invalidPreview.items?.length, 1, 'La ligne sans titre n’est pas créée, mais l’import entier ne bloque plus (0.6.3)')
  assert.deepEqual(
    [invalidPreview.items?.[0]?.title, invalidPreview.items?.[0]?.status, invalidPreview.items?.[0]?.rating],
    ['Jeu valide', 'joué', null],
    'La fiche valide est importée avec sa normalisation (statut « Joué » → « joué », note absente)',
  )
  assert.equal(invalidPreview.validItemCount, 1, 'Le compteur reflète les fiches réellement prêtes')
  assert.ok(invalidPreview.errors.some((error) => /titre est obligatoire/i.test(error.message)), 'La ligne CSV invalide signale son titre manquant comme blocage de fiche')
}

{
  const validQuotedTable = parseCsv('Titre,Note personnelle\n"Le café, ""après"" minuit","Première ligne\nDeuxième ligne"\n')
  assert.deepEqual(validQuotedTable.errors, [], 'Les cellules CSV citées, échappées et multiligne doivent rester valides')
  assert.deepEqual(
    validQuotedTable.rows[0]?.cells,
    ['Le café, "après" minuit', 'Première ligne\nDeuxième ligne'],
    'Les cellules CSV citées valides doivent conserver virgules, guillemets échappés et retours à la ligne',
  )

  const explicitlyEmptyQuotedTable = parseCsv('Titre\n""')
  assert.deepEqual(
    explicitlyEmptyQuotedTable.rows,
    [{ cells: [''], line: 2 }],
    'Une dernière ligne CSV explicitement vide et citée doit rester une ligne du tableau',
  )
  const explicitlyEmptyQuotedSource = {
    name: 'titre-vide-cite.csv',
    kind: 'csv',
    csvCandidates: [csvCandidate('Titre\n""', 'titre-vide-cite.csv')],
    markdownPages: [],
  }
  const explicitlyEmptyQuotedSession = prepareFilmCsvImport(explicitlyEmptyQuotedSource)
  const explicitlyEmptyQuotedConfiguration = initialFilmImportConfiguration(explicitlyEmptyQuotedSession)
  const explicitlyEmptyQuotedPreview = previewFilmCsvImport(
    explicitlyEmptyQuotedSession,
    explicitlyEmptyQuotedSource,
    explicitlyEmptyQuotedConfiguration,
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(explicitlyEmptyQuotedPreview.totalFilmCount, 1, 'La ligne CSV citée vide doit être comptée dans l’aperçu')
  assert.equal(explicitlyEmptyQuotedPreview.document, null, 'Une ligne CSV citée sans titre ne doit pas créer un profil vide valide')
  assert.ok(
    explicitlyEmptyQuotedPreview.errors.some((error) => /titre est obligatoire/i.test(error.message)),
    'Une ligne CSV citée sans titre doit être refusée explicitement dans l’aperçu',
  )

  const malformedQuotedTable = parseCsv('Titre,Note\n"A"tail,4\n')
  assert.ok(
    malformedQuotedTable.errors.some((error) => /doit être suivie d’une virgule ou de la fin de ligne/i.test(error.message)),
    'Une donnée après la fermeture d’une cellule CSV citée doit être refusée',
  )

  const malformedQuotedSource = {
    name: 'cellule-citee-invalide.csv',
    kind: 'csv',
    csvCandidates: [csvCandidate('Titre,Note\n"A"tail,4\n', 'cellule-citee-invalide.csv')],
    markdownPages: [],
  }
  const malformedQuotedSession = prepareFilmCsvImport(malformedQuotedSource)
  const malformedQuotedPreview = previewFilmCsvImport(
    malformedQuotedSession,
    malformedQuotedSource,
    initialFilmImportConfiguration(malformedQuotedSession),
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(malformedQuotedPreview.document, null, 'Un CSV contenant « "A"tail » doit rester bloqué avant toute écriture')


  const csvContents = readFileSync('fixtures/import-films-csv-notion/generic-films.csv', 'utf8')
  const source = { name: 'films-generiques.csv', kind: 'csv', csvCandidates: [csvCandidate(csvContents, 'films-generiques.csv')], markdownPages: [] }
  const session = prepareFilmCsvImport(source)
  assert.equal(session.kind, 'generic', 'Un CSV sans contrat Sylloge doit ouvrir le parcours de mapping générique')
  const configuration = initialFilmImportConfiguration(session)
  assert.ok(configuration, 'Le CSV générique doit préremplir une configuration modifiable')
  if (!configuration) throw new Error('Configuration générique absente')
  assert.equal(configuration.mapping.title, 'Title', 'Les alias Title et Name doivent préremplir le titre')
  assert.equal(configuration.mapping.watchedAt, 'Date watched', 'Les alias anglais de date doivent être détectés')
  assert.equal(configuration.ratingScale, 10, 'Une échelle /10 explicitement présente doit être détectée')

  const preview = previewFilmCsvImport(session, source, configuration, '2026-07-18T10:00:00.000Z')
  assert.equal(preview.document?.films.length, 2, 'Le CSV générique échappé et multiligne doit produire ses deux Films')
  assert.equal(preview.document?.films[0].title, 'Le café, après minuit', 'Le titre CSV cité doit conserver sa virgule')
  assert.equal(preview.document?.films[0].rating, 4, 'Une note 8/10 doit être convertie visiblement en 4/5')
  assert.equal(preview.document?.films[0].watchedAt, '2024-07-18', 'Une date française écrite doit être normalisée')
  assert.equal(preview.document?.films[0].personalNote, 'Première ligne\nDeuxième ligne', 'Une cellule CSV multiligne doit conserver la note personnelle')
  assert.equal(preview.document?.films[0].isFavorite, true, 'Une colonne Favorite doit devenir un coup de cœur')
  assert.equal(preview.document?.films[1].isFavorite, false, 'Une valeur Non doit devenir un coup de cœur désactivé')
  assert.equal(preview.document?.films[0].originalTitle, null, 'Un titre original générique doit rester hors import')
  assert.equal(preview.document?.films[0].year, null, 'Une année générique doit rester hors import')
  assert.equal(preview.document?.films[0].director, null, 'Un réalisateur générique doit rester hors import')
  assert.equal(preview.document?.films[0].summary, null, 'Un résumé générique doit rester hors import')
  assert.deepEqual(
    [preview.document?.films[0].providerName, preview.document?.films[0].providerId],
    [null, null],
    'Le CSV générique ne doit jamais créer de provenance éditoriale',
  )
  assert.equal(preview.document?.films[0].posterUrl, null, 'Une affiche temporaire ne doit jamais être conservée à l’import')
  assert.ok(preview.ignoredColumns.includes('Actors'), 'Les colonnes sans destination doivent être visibles dans le rapport')
  assert.ok(preview.ignoredColumns.includes('Poster'), 'Les affiches externes doivent être signalées comme ignorées')

  const metadataSource = {
    name: 'metadonnees.csv',
    kind: 'csv',
    csvCandidates: [csvCandidate('Titre,Année de sortie,Réalisateur,Résumé,Acteurs,Affiche,Cinéma,Revisionnage\nFilm daté,1977,Nom,Texte,Distribution,https://example.invalid/poster.jpg,Oui,Non\n', 'metadonnees.csv')],
    markdownPages: [],
  }
  const metadataSession = prepareFilmCsvImport(metadataSource)
  const metadataConfiguration = initialFilmImportConfiguration(metadataSession)
  if (!metadataConfiguration) throw new Error('Configuration des métadonnées absente')
  const metadataPreview = previewFilmCsvImport(
    metadataSession,
    metadataSource,
    metadataConfiguration,
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(metadataPreview.document?.films[0].year, null, 'Année de sortie doit rester une métadonnée non importée')
  assert.deepEqual(
    metadataPreview.ignoredColumns.filter((column) => ['Année de sortie', 'Réalisateur', 'Résumé', 'Acteurs', 'Affiche', 'Cinéma', 'Revisionnage'].includes(column)),
    ['Année de sortie', 'Réalisateur', 'Résumé', 'Acteurs', 'Affiche', 'Cinéma', 'Revisionnage'],
    'Les sources de métadonnées et de fonctionnalités futures doivent rester ignorées',
  )

  const manipulatedMetadataPreview = previewFilmCsvImport(metadataSession, metadataSource, {
    ...metadataConfiguration,
    mapping: { ...metadataConfiguration.mapping, originalTitle: 'Année de sortie' },
  }, '2026-07-18T10:00:00.000Z')
  assert.equal(manipulatedMetadataPreview.document, null, 'Une destination metadata ajoutée hors interface doit être bloquée')
  assert.ok(manipulatedMetadataPreview.errors.some((error) => /métadonnée Films/i.test(error.message)), 'Le blocage d’une destination metadata doit être explicite')

  const manipulatedSourcePreview = previewFilmCsvImport(metadataSession, metadataSource, {
    ...metadataConfiguration,
    mapping: { ...metadataConfiguration.mapping, isFavorite: 'Cinéma' },
  }, '2026-07-18T10:00:00.000Z')
  assert.equal(manipulatedSourcePreview.document, null, 'Une source Cinéma ajoutée hors interface doit être bloquée')
  assert.ok(manipulatedSourcePreview.errors.some((error) => /fonctionnalité future/i.test(error.message)), 'Le blocage d’une source future doit être explicite')

  const unknownStatusSource = {
    name: 'statut-invalide.csv',
    kind: 'csv',
    csvCandidates: [csvCandidate('Titre,Statut\nFilm test,À relire\n', 'statut-invalide.csv')],
    markdownPages: [],
  }
  const unknownStatusSession = prepareFilmCsvImport(unknownStatusSource)
  const unknownStatusConfiguration = initialFilmImportConfiguration(unknownStatusSession)
  const unknownStatusPreview = previewFilmCsvImport(unknownStatusSession, unknownStatusSource, unknownStatusConfiguration, '2026-07-18T10:00:00.000Z')
  assert.equal(unknownStatusPreview.document, null, 'Un statut non reconnu doit bloquer l’import avant toute écriture')
  assert.match(unknownStatusPreview.errors[0].message, /pas reconnu/i, 'Le statut refusé doit être expliqué localement')

  const ambiguousRatingSource = {
    name: 'notes-ambigues.csv',
    kind: 'csv',
    csvCandidates: [csvCandidate('Titre,Note,Vu le\nFilm test,8,04/05/2024\n', 'notes-ambigues.csv')],
    markdownPages: [],
  }
  const ambiguousRatingSession = prepareFilmCsvImport(ambiguousRatingSource)
  const ambiguousRatingConfiguration = initialFilmImportConfiguration(ambiguousRatingSession)
  if (!ambiguousRatingConfiguration) throw new Error('Configuration de note supérieure à 5 absente')
  assert.equal(ambiguousRatingConfiguration.ratingScale, 10, 'Une note syntaxiquement valide supérieure à 5 doit déduire /10')
  const ambiguousRatingPreview = previewFilmCsvImport(ambiguousRatingSession, ambiguousRatingSource, ambiguousRatingConfiguration, '2026-07-18T10:00:00.000Z')
  assert.equal(ambiguousRatingPreview.document, null, 'Une date ambiguë ne doit jamais être décidée silencieusement')
  assert.equal(ambiguousRatingPreview.errors.some((error) => /échelle/i.test(error.message)), false, 'Une note supérieure à 5 prouvée ne doit pas être faussement signalée ambiguë')
  assert.ok(ambiguousRatingPreview.errors.some((error) => /date/i.test(error.path)), 'La date numérique ambiguë doit être localisée')
  const explicitRatingPreview = previewFilmCsvImport(ambiguousRatingSession, ambiguousRatingSource, {
    ...ambiguousRatingConfiguration,
    ratingScale: 10,
  }, '2026-07-18T10:00:00.000Z')
  assert.equal(explicitRatingPreview.document, null, 'Le choix d’échelle ne doit pas masquer une date ambiguë')

  const descriptiveRatingSource = {
    name: 'notes-notion-descriptives.csv',
    kind: 'csv',
    csvCandidates: [csvCandidate('Titre,Note\nFilm excellent,8 (Excellent)\nFilm très bon,7 (Très bon)\n', 'notes-notion-descriptives.csv')],
    markdownPages: [],
  }
  const descriptiveRatingSession = prepareFilmCsvImport(descriptiveRatingSource)
  const descriptiveRatingConfiguration = initialFilmImportConfiguration(descriptiveRatingSession)
  assert.ok(descriptiveRatingConfiguration, 'Les notes descriptives doivent ouvrir une configuration générique')
  if (!descriptiveRatingConfiguration) throw new Error('Configuration de notes descriptives absente')
  assert.equal(descriptiveRatingConfiguration.ratingScale, 10, 'Des notes descriptives toutes valides avec une valeur supérieure à 5 doivent déduire /10')
  const descriptiveRatingPreview = previewFilmCsvImport(
    descriptiveRatingSession,
    descriptiveRatingSource,
    descriptiveRatingConfiguration,
    '2026-07-18T10:00:00.000Z',
  )
  assert.deepEqual(
    descriptiveRatingPreview.document?.films.map((film) => film.rating),
    [4, 3.5],
    'Une note descriptive /10 déduite doit être convertie en demi-notes /5 sans choix supplémentaire',
  )
  const descriptiveRatingOnTenPreview = previewFilmCsvImport(
    descriptiveRatingSession,
    descriptiveRatingSource,
    { ...descriptiveRatingConfiguration, ratingScale: 10 },
    '2026-07-18T10:00:00.000Z',
  )
  assert.deepEqual(
    descriptiveRatingOnTenPreview.document?.films.map((film) => film.rating),
    [4, 3.5],
    'Les valeurs 8 (Excellent) et 7 (Très bon) doivent être converties strictement en demi-notes /5 après choix /10',
  )

  const dualScaleDescriptiveSource = {
    name: 'note-descriptive-ambigue.csv',
    kind: 'csv',
    csvCandidates: [csvCandidate('Titre,Note\nFilm précis,4 (Bien)\n', 'note-descriptive-ambigue.csv')],
    markdownPages: [],
  }
  const dualScaleDescriptiveSession = prepareFilmCsvImport(dualScaleDescriptiveSource)
  const dualScaleDescriptiveConfiguration = initialFilmImportConfiguration(dualScaleDescriptiveSession)
  if (!dualScaleDescriptiveConfiguration) throw new Error('Configuration de note descriptive ambiguë absente')
  assert.equal(dualScaleDescriptiveConfiguration.ratingScale, null, 'Des notes limitées à 0-5 sans échelle explicite doivent rester ambiguës')
  const ratingOnFive = previewFilmCsvImport(
    dualScaleDescriptiveSession,
    dualScaleDescriptiveSource,
    { ...dualScaleDescriptiveConfiguration, ratingScale: 5 },
    '2026-07-18T10:00:00.000Z',
  )
  const ratingOnTen = previewFilmCsvImport(
    dualScaleDescriptiveSession,
    dualScaleDescriptiveSource,
    { ...dualScaleDescriptiveConfiguration, ratingScale: 10 },
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(ratingOnFive.document?.films[0].rating, 4, 'Le choix explicite /5 doit être conservé pour une note descriptive ambiguë')
  assert.equal(ratingOnTen.document?.films[0].rating, 2, 'Le choix explicite /10 doit être conservé pour une note descriptive ambiguë')

  const nonHalfDescriptiveSource = {
    name: 'note-descriptive-invalide.csv',
    kind: 'csv',
    csvCandidates: [csvCandidate('Titre,Note\nFilm impossible,"7,5 (Très bon)"\n', 'note-descriptive-invalide.csv')],
    markdownPages: [],
  }
  const nonHalfDescriptiveSession = prepareFilmCsvImport(nonHalfDescriptiveSource)
  const nonHalfDescriptiveConfiguration = initialFilmImportConfiguration(nonHalfDescriptiveSession)
  if (!nonHalfDescriptiveConfiguration) throw new Error('Configuration de note descriptive invalide absente')
  const nonHalfDescriptivePreview = previewFilmCsvImport(
    nonHalfDescriptiveSession,
    nonHalfDescriptiveSource,
    { ...nonHalfDescriptiveConfiguration, ratingScale: 10 },
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(nonHalfDescriptivePreview.document, null, 'Une note descriptive convertie hors demi-points doit bloquer l’import')
  assert.ok(nonHalfDescriptivePreview.errors.some((error) => /demi-points/i.test(error.message)), 'Le refus des notes descriptives hors demi-points doit être expliqué')

  const invalidRatingColumnSource = {
    name: 'notes-incompletes.csv',
    kind: 'csv',
    csvCandidates: [csvCandidate('Titre,Note\nFilm valide,8 (Très bon)\nFilm invalide,pas une note\n', 'notes-incompletes.csv')],
    markdownPages: [],
  }
  const invalidRatingColumnSession = prepareFilmCsvImport(invalidRatingColumnSource)
  const invalidRatingColumnConfiguration = initialFilmImportConfiguration(invalidRatingColumnSession)
  if (!invalidRatingColumnConfiguration) throw new Error('Configuration de colonne de notes invalide absente')
  assert.equal(invalidRatingColumnConfiguration.ratingScale, null, 'Une seule note non syntaxique doit empêcher la déduction automatique de /10')
  const invalidRatingColumnPreview = previewFilmCsvImport(
    invalidRatingColumnSession,
    invalidRatingColumnSource,
    invalidRatingColumnConfiguration,
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(invalidRatingColumnPreview.document, null, 'Une colonne de notes non valide doit rester bloquée avant écriture')
  assert.ok(invalidRatingColumnPreview.errors.some((error) => /échelle/i.test(error.message)), 'Une colonne qui ne prouve pas son échelle doit demander un choix humain')

  const contradictoryRatingSource = {
    name: 'notes-contradictoires.csv',
    kind: 'csv',
    csvCandidates: [csvCandidate('Titre,Note\nFilm ambigu,8 (Très bon)\nFilm explicite,4/5\n', 'notes-contradictoires.csv')],
    markdownPages: [],
  }
  const contradictoryRatingSession = prepareFilmCsvImport(contradictoryRatingSource)
  const contradictoryRatingConfiguration = initialFilmImportConfiguration(contradictoryRatingSession)
  if (!contradictoryRatingConfiguration) throw new Error('Configuration de notes contradictoires absente')
  assert.equal(contradictoryRatingConfiguration.ratingScale, null, 'Une échelle /5 explicite contradictoire doit empêcher la déduction /10')

  const qaNotionRows = Array.from(
    { length: 401 },
    (_, index) => `Film QA ${index + 1},Watched,8 (Très bon),Yes`,
  ).join('\n')
  const qaNotionSource = {
    name: 'Export-Notion-93e75f21-8bf4-4ff4-a90c-0b8249f6a521.zip',
    kind: 'notion',
    csvCandidates: [csvCandidate(
      `Name,Status,Note,Coup de coeur\n${qaNotionRows}\n`,
      'Export Notion/Films 93e75f21-8bf4-4ff4-a90c-0b8249f6a521/Films 93e75f21-8bf4-4ff4-a90c-0b8249f6a521.csv',
    )],
    markdownPages: [],
  }
  const qaNotionSession = prepareFilmCsvImport(qaNotionSource)
  const qaNotionConfiguration = initialFilmImportConfiguration(qaNotionSession)
  if (!qaNotionConfiguration) throw new Error('Configuration Notion de QA absente')
  assert.equal(qaNotionConfiguration.profileName, 'Films', 'Le profil Notion proposé doit retirer le suffixe UUID technique de la table')
  assert.equal(qaNotionConfiguration.mapping.title, 'Name', 'La colonne Name doit être proposée une seule fois pour le titre')
  assert.equal(qaNotionConfiguration.mapping.rating, 'Note', 'La colonne Note doit être proposée pour la notation')
  assert.equal(qaNotionConfiguration.mapping.personalNote, null, 'Une colonne Note de notation ne doit jamais devenir une note personnelle')
  assert.equal(qaNotionConfiguration.mapping.isFavorite, 'Coup de coeur', 'Coup de coeur doit alimenter le suivi favori')
  const assignedQaColumns = Object.values(qaNotionConfiguration.mapping).filter((column) => column !== null)
  assert.equal(new Set(assignedQaColumns).size, assignedQaColumns.length, 'La détection automatique ne doit réutiliser aucune colonne')
  assert.equal(qaNotionConfiguration.ratingScale, 10, 'Les 401 notes Notion descriptives supérieures à 5 doivent déduire /10')
  const qaNotionPreview = previewFilmCsvImport(
    qaNotionSession,
    qaNotionSource,
    qaNotionConfiguration,
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(qaNotionPreview.errors.length, 0, 'Les 401 Films Notion convertibles ne doivent produire aucune erreur')
  assert.equal(qaNotionPreview.validFilmCount, 401, 'Les 401 Films Notion de QA doivent être convertibles')
  assert.equal(
    qaNotionPreview.document?.films.every((film) => film.rating === 4 && film.personalNote === null && film.isFavorite && film.year === null),
    true,
    'Les notes Notion doivent être converties en /5, avec favori et sans métadonnée éditoriale',
  )

  const reassignedQaConfiguration = setFilmImportSourceDestination(qaNotionConfiguration, 'Note', 'personalNote')
  assert.equal(reassignedQaConfiguration.mapping.rating, null, 'Déplacer une colonne source doit libérer son ancienne destination')
  assert.equal(reassignedQaConfiguration.mapping.personalNote, null, 'Une colonne de notation ne doit jamais devenir une note personnelle')
  const reassignedQaColumns = Object.values(reassignedQaConfiguration.mapping).filter((column) => column !== null)
  assert.equal(new Set(reassignedQaColumns).size, reassignedQaColumns.length, 'Le déplacement d’une source ne doit créer aucun doublon interne')

  const manipulatedRatingAsPersonalPreview = previewFilmCsvImport(
    qaNotionSession,
    qaNotionSource,
    {
      ...qaNotionConfiguration,
      mapping: { ...qaNotionConfiguration.mapping, rating: null, personalNote: 'Note' },
    },
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(
    manipulatedRatingAsPersonalPreview.document,
    null,
    'Un Note=8 manipulé vers Note personnelle avec une évaluation nulle doit rester bloqué avant toute écriture',
  )
  assert.ok(
    manipulatedRatingAsPersonalPreview.errors.some((error) => /évaluation chiffrée.*Évaluation.*Ne pas importer/i.test(error.message)),
    'Le domaine doit expliquer qu’une colonne de notation ne peut pas devenir une note personnelle',
  )

  const duplicateQaPreview = previewFilmCsvImport(
    qaNotionSession,
    qaNotionSource,
    {
      ...qaNotionConfiguration,
      markdownNotes: false,
      mapping: { ...qaNotionConfiguration.mapping, personalNote: 'Status' },
    },
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(duplicateQaPreview.document, null, 'Un mapping dupliqué construit hors interface doit rester bloqué par le domaine')
  assert.ok(
    duplicateQaPreview.errors.some((error) => /une source ne peut avoir qu’une destination/i.test(error.message)),
    'Le domaine doit expliquer le doublon de mapping avant toute écriture',
  )

  let writeCount = 0
  await assert.rejects(
    confirmValidatedImport(unknownStatusPreview, async () => {
      writeCount += 1
      return null
    }),
    /invalide/i,
    'Un CSV invalide doit rester bloqué avant l’importeur SQLite',
  )
  assert.equal(writeCount, 0, 'Le CSV invalide ne doit créer ni profil ni Film')
}

{
  const csvContents = readFileSync('fixtures/import-films-csv-notion/notion-films.csv', 'utf8')
  const markdownContents = readFileSync('fixtures/import-films-csv-notion/Le Passage.md', 'utf8')
  const emptyNotesMarkdownContents = readFileSync('fixtures/import-films-csv-notion/Notes vides avec séparateurs.md', 'utf8')
  const source = {
    name: 'notion-export.zip',
    kind: 'notion',
    csvCandidates: [csvCandidate(csvContents, 'Export/Films/Films.csv')],
    markdownPages: [{ name: 'Export/Films/Le Passage.md', contents: markdownContents }],
  }
  const session = prepareFilmCsvImport(source)
  const configuration = initialFilmImportConfiguration(session)
  const preview = previewFilmCsvImport(session, source, configuration, '2026-07-18T10:00:00.000Z')
  assert.equal(preview.document?.films[0].status, 'à découvrir', 'Le statut Notion To Watch doit être converti vers le statut Films V1')
  assert.equal(configuration?.mapping.isFavorite, 'Coup de coeur', 'Coup de coeur doit être prérempli vers le favori')
  assert.equal(preview.document?.films[0].isFavorite, true, 'La valeur Notion Yes doit devenir un favori')
  assert.equal(preview.document?.films[0].director, null, 'Le réalisateur Notion doit rester une métadonnée non importée')
  assert.equal(preview.document?.films[0].summary, null, 'Le résumé Notion doit rester une métadonnée non importée')
  assert.deepEqual(
    [preview.document?.films[0].providerName, preview.document?.films[0].providerId, preview.document?.films[0].posterUrl],
    [null, null, null],
    'Notion ne doit importer ni provenance ni couverture temporaire',
  )
  assert.equal(preview.document?.films[0].personalNote, 'Note CSV', 'Une colonne CSV déjà mappée vers Note personnelle doit rester la seule source de cette destination')
  assert.equal(configuration?.markdownNotes, false, 'Les pages Notion Notes restent ignorées par défaut quand une colonne texte occupe déjà Note personnelle')
  if (!configuration) throw new Error('Configuration Notion absente')
  const markdownNotesConfiguration = setFilmImportSourceDestination(configuration, NOTION_MARKDOWN_NOTES_SOURCE, 'personalNote')
  const markdownNotesPreview = previewFilmCsvImport(session, source, markdownNotesConfiguration, '2026-07-18T10:00:00.000Z')
  assert.equal(markdownNotesPreview.document?.films[0].personalNote, 'Note Markdown associée.', 'Les pages Notion Notes peuvent alimenter explicitement Note personnelle sans être confondues avec l’évaluation')
  assert.equal(preview.warnings.length, 0, 'Une page Markdown Notion associée de façon unique ne doit pas produire d’avertissement')

  const emptyNotesSource = {
    ...source,
    markdownPages: [{ name: 'Export/Films/Notes vides avec séparateurs.md', contents: emptyNotesMarkdownContents }],
  }
  const emptyNotesSession = prepareFilmCsvImport(emptyNotesSource)
  const emptyNotesConfiguration = initialFilmImportConfiguration(emptyNotesSession)
  if (!emptyNotesConfiguration) throw new Error('Configuration des Notes vides absente')
  const emptyNotesPreview = previewFilmCsvImport(
    emptyNotesSession,
    emptyNotesSource,
    setFilmImportSourceDestination(emptyNotesConfiguration, NOTION_MARKDOWN_NOTES_SOURCE, 'personalNote'),
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(
    emptyNotesPreview.document?.films[0].personalNote,
    null,
    'Une section Notes ne contenant que des règles horizontales et des puces vides Markdown ne doit pas créer de note personnelle',
  )
  assert.equal(emptyNotesPreview.warnings.length, 0, 'Une section Notes vide ne doit pas produire d’avertissement')

  const listNoteSource = {
    ...source,
    markdownPages: [{
      name: 'Export/Films/Notes avec texte.md',
      contents: '# Le Passage\n\n### Notes :\n\n- Première puce.\n* Deuxième puce.\n+ Troisième puce.\n\n### Informations\n\nFixture synthétique.\n',
    }],
  }
  const listNoteSession = prepareFilmCsvImport(listNoteSource)
  const listNoteConfiguration = initialFilmImportConfiguration(listNoteSession)
  if (!listNoteConfiguration) throw new Error('Configuration de la liste Notes absente')
  const listNotePreview = previewFilmCsvImport(
    listNoteSession,
    listNoteSource,
    setFilmImportSourceDestination(listNoteConfiguration, NOTION_MARKDOWN_NOTES_SOURCE, 'personalNote'),
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(
    listNotePreview.document?.films[0].personalNote,
    '- Première puce.\n* Deuxième puce.\n+ Troisième puce.',
    'Une puce Markdown suivie de texte doit rester une note personnelle',
  )
  assert.equal(listNotePreview.warnings.length, 0, 'Une note Markdown listée associée de façon unique ne doit pas produire d’avertissement')

  const ambiguousSource = {
    ...source,
    csvCandidates: [csvCandidate('Name\nLe Passage\nLe Passage\n', 'Export/Films/Films.csv')],
    markdownPages: [
      { name: 'Export/Films/Le Passage.md', contents: markdownContents },
      { name: 'Export/Films/Inconnu.md', contents: '# Inconnu\n\n### Notes :\n\nSans Film CSV.\n' },
    ],
  }
  const ambiguousSession = prepareFilmCsvImport(ambiguousSource)
  const ambiguousPreview = previewFilmCsvImport(
    ambiguousSession,
    ambiguousSource,
    initialFilmImportConfiguration(ambiguousSession),
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(ambiguousPreview.document?.films.length, 2, 'Une ambiguïté Markdown ne doit pas empêcher l’import des lignes CSV valides')
  assert.equal(ambiguousPreview.document?.films[0].personalNote, null, 'Une note Markdown ambiguë ne doit jamais être attachée au mauvais Film')
  assert.equal(ambiguousPreview.warnings.length, 2, 'Les notes Markdown ambiguës ou sans Film doivent rester visibles dans le rapport')
}

{
  const fixtureDirectory = 'fixtures/import-films-csv-notion/notion-roots'
  const sharedTitle = 'Titre partagé'
  const tableCsv = readFileSync(`${fixtureDirectory}/sibling-view/Table.csv`, 'utf8')
  const tableAllCsv = readFileSync(`${fixtureDirectory}/sibling-view/Table_all.csv`, 'utf8')
  const tableAllNote = readFileSync(`${fixtureDirectory}/sibling-view/Table/Page.md`, 'utf8')
  const unrelatedTableAllNote = readFileSync(`${fixtureDirectory}/sibling-view/Table 11111111111111111111111111111111/Page.md`, 'utf8')
  const tableAllSource = {
    name: 'notion-table-all.zip',
    kind: 'notion',
    csvCandidates: [
      csvCandidate(tableCsv, 'Export/Table.csv', 'table'),
      csvCandidate(tableAllCsv, 'Export/Table_all.csv', 'table-all'),
    ],
    markdownPages: [
      { name: 'Export/Table/Page.md', contents: tableAllNote },
      { name: 'Export/Table 11111111111111111111111111111111/Page.md', contents: unrelatedTableAllNote },
    ],
  }
  const tableAllSelection = inspectFilmCsvImportSource(tableAllSource)
  assert.equal(tableAllSelection.defaultCandidateId, 'table-all', 'Table_all.csv doit être retenue parmi les deux vues Notion')
  assert.equal(tableAllSelection.selectionRequired, false, 'Table.csv et Table_all.csv ne doivent pas être proposées comme deux bases')
  assert.match(tableAllSelection.automaticSelectionMessage ?? '', /vue complète est retenue automatiquement/i, 'La vue complète retenue doit être expliquée sans jargon')
  const tableAllSession = prepareFilmCsvImport(tableAllSource)
  const tableAllConfiguration = initialFilmImportConfiguration(tableAllSession)
  if (!tableAllConfiguration) throw new Error('Configuration de Table_all.csv absente')
  assert.equal(tableAllConfiguration.profileName, 'Table', 'Le suffixe de vue _all doit être retiré du nom de profil')
  assert.deepEqual(tableAllConfiguration.mapping, {
    title: 'Name',
    status: 'Status',
    rating: 'Note',
    watchedAt: 'Vu le',
    personalNote: null,
    isFavorite: 'Coup de coeur',
  }, 'La vue complète doit préremplir seulement les données personnelles de suivi')
  assert.equal(tableAllConfiguration.markdownNotes, true, 'Les pages Notion Notes doivent préremplir la note personnelle lorsqu’aucune colonne ne la remplace')
  const tableAllPreview = previewFilmCsvImport(
    tableAllSession,
    tableAllSource,
    tableAllConfiguration,
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(tableAllPreview.document?.films[0].title, sharedTitle, 'La fixture Table_all doit lire le Film synthétique attendu')
  assert.equal(tableAllPreview.document?.films[0].rating, 4, 'La vue complète doit conserver l’évaluation /10 convertie')
  assert.equal(tableAllPreview.document?.films[0].isFavorite, false, 'La valeur No de Notion doit devenir un favori désactivé')
  assert.equal(tableAllPreview.document?.films[0].year, null, 'Les métadonnées de la vue complète doivent rester null')
  assert.equal(tableAllPreview.document?.films[0].personalNote, 'Note depuis Table_all.', 'Table_all.csv doit associer les pages du dossier Table dérivé')
  assert.doesNotMatch(tableAllPreview.document?.films[0].personalNote ?? '', /autre table/u, 'Une table distincte portant le même titre doit rester exclue')

  const nestedTableCsv = readFileSync(`${fixtureDirectory}/table-folder/Table/Table.csv`, 'utf8')
  const nestedTableNote = readFileSync(`${fixtureDirectory}/table-folder/Table/Page.md`, 'utf8')
  const unrelatedNestedTableNote = readFileSync(`${fixtureDirectory}/table-folder/Table 11111111111111111111111111111111/Page.md`, 'utf8')
  const nestedTableSource = {
    name: 'notion-table-folder.zip',
    kind: 'notion',
    csvCandidates: [csvCandidate(nestedTableCsv, 'Export/Table/Table.csv')],
    markdownPages: [
      { name: 'Export/Table/Page.md', contents: nestedTableNote },
      { name: 'Export/Table 11111111111111111111111111111111/Page.md', contents: unrelatedNestedTableNote },
    ],
  }
  const nestedTableSession = prepareFilmCsvImport(nestedTableSource)
  const nestedTableConfiguration = initialFilmImportConfiguration(nestedTableSession)
  if (!nestedTableConfiguration) throw new Error('Configuration de Table/Table.csv absente')
  const nestedTablePreview = previewFilmCsvImport(
    nestedTableSession,
    nestedTableSource,
    nestedTableConfiguration,
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(nestedTablePreview.document?.films[0].personalNote, 'Note depuis Table/Table.csv.', 'Le repli au parent est permis seulement lorsque son nom est celui de la table')
  assert.doesNotMatch(nestedTablePreview.document?.films[0].personalNote ?? '', /autre table/u, 'Le repli Table/Table.csv ne doit jamais inclure une autre table homonyme')

  const uniqueTechnicalFolderSource = {
    ...tableAllSource,
    csvCandidates: [csvCandidate(tableAllCsv, 'Export/Table 22222222222222222222222222222222_all.csv')],
    markdownPages: [{ name: 'Export/Table 33333333333333333333333333333333/Page.md', contents: tableAllNote }],
  }
  const uniqueTechnicalFolderSession = prepareFilmCsvImport(uniqueTechnicalFolderSource)
  const uniqueTechnicalFolderConfiguration = initialFilmImportConfiguration(uniqueTechnicalFolderSession)
  if (!uniqueTechnicalFolderConfiguration) throw new Error('Configuration de la vue Notion avec UUID absente')
  const uniqueTechnicalFolderPreview = previewFilmCsvImport(
    uniqueTechnicalFolderSession,
    uniqueTechnicalFolderSource,
    uniqueTechnicalFolderConfiguration,
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(uniqueTechnicalFolderPreview.document?.films[0].personalNote, 'Note depuis Table_all.', 'Un unique dossier portant le nom humain de la table doit compléter la vue CSV même si son UUID diffère')

  const ambiguousTechnicalFolderSource = {
    ...uniqueTechnicalFolderSource,
    markdownPages: [
      { name: 'Export/Table 33333333333333333333333333333333/Page.md', contents: tableAllNote },
      { name: 'Export/Table 44444444444444444444444444444444/Page.md', contents: unrelatedTableAllNote },
    ],
  }
  const ambiguousTechnicalFolderSession = prepareFilmCsvImport(ambiguousTechnicalFolderSource)
  const ambiguousTechnicalFolderPreview = previewFilmCsvImport(
    ambiguousTechnicalFolderSession,
    ambiguousTechnicalFolderSource,
    initialFilmImportConfiguration(ambiguousTechnicalFolderSession),
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(ambiguousTechnicalFolderPreview.document?.films[0].personalNote, null, 'Deux dossiers de base portant le même nom humain doivent rester ambigus et ne pas importer de note')

  for (const viewSuffix of ['all', 'full']) {
    const profileNameSource = {
      name: `notion-${viewSuffix}.zip`,
      kind: 'notion',
      csvCandidates: [csvCandidate('Name,Status\nFilm synthétique,Watched\n', `Export/Movies_DB 0123456789abcdef0123456789abcdef_${viewSuffix}.csv`)],
      markdownPages: [],
    }
    const profileNameSession = prepareFilmCsvImport(profileNameSource)
    assert.equal(
      initialFilmImportConfiguration(profileNameSession)?.profileName,
      'Movies DB',
      `Le suffixe _${viewSuffix} doit être retiré avant l’UUID du profil Notion`,
    )
  }
}

{
  const fixtureDirectory = 'fixtures/import-films-csv-notion/multi-tables'
  const filmsCsv = readFileSync(`${fixtureDirectory}/Films 93e75f21-8bf4-4ff4-a90c-0b8249f6a521/Films 93e75f21-8bf4-4ff4-a90c-0b8249f6a521.csv`, 'utf8')
  const filmsMarkdown = readFileSync(`${fixtureDirectory}/Films 93e75f21-8bf4-4ff4-a90c-0b8249f6a521/Le Passage 11223344556677889900aabbccddeeff.md`, 'utf8')
  const seriesCsv = readFileSync(`${fixtureDirectory}/Séries 6f5e4d3c-2b1a-4098-8877-665544332211/Séries 6f5e4d3c-2b1a-4098-8877-665544332211.csv`, 'utf8')
  const seriesMarkdown = readFileSync(`${fixtureDirectory}/Séries 6f5e4d3c-2b1a-4098-8877-665544332211/Le Passage ffeeddccbbaa00998877665544332211.md`, 'utf8')
  const filmsRoot = 'Export Notion/Films 93e75f21-8bf4-4ff4-a90c-0b8249f6a521'
  const seriesRoot = 'Export Notion/Séries 6f5e4d3c-2b1a-4098-8877-665544332211'
  const source = {
    name: 'notion-plusieurs-tables.zip',
    kind: 'notion',
    csvCandidates: [
      csvCandidate(filmsCsv, `${filmsRoot}/Films 93e75f21-8bf4-4ff4-a90c-0b8249f6a521.csv`, 'films'),
      csvCandidate(seriesCsv, `${seriesRoot}/Séries 6f5e4d3c-2b1a-4098-8877-665544332211.csv`, 'series'),
    ],
    markdownPages: [
      { name: `${filmsRoot}/Le Passage 11223344556677889900aabbccddeeff.md`, contents: filmsMarkdown },
      { name: `${seriesRoot}/Le Passage ffeeddccbbaa00998877665544332211.md`, contents: seriesMarkdown },
    ],
  }
  const filmsSession = prepareFilmCsvImport(source, 'films')
  const filmsConfiguration = initialFilmImportConfiguration(filmsSession)
  if (!filmsConfiguration) throw new Error('Configuration de la table Films multi-tables absente')
  const filmsPreview = previewFilmCsvImport(
    filmsSession,
    source,
    setFilmImportSourceDestination(filmsConfiguration, NOTION_MARKDOWN_NOTES_SOURCE, 'personalNote'),
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(
    filmsPreview.document?.films[0].personalNote,
    'Note Markdown Films.',
    'Une page Markdown du même dossier doit alimenter uniquement le CSV Films sélectionné',
  )
  assert.doesNotMatch(
    filmsPreview.document?.films[0].personalNote ?? '',
    /Séries/u,
    'Une page de l’autre table portant le même titre ne doit jamais être importée dans Films',
  )

  const seriesSession = prepareFilmCsvImport(source, 'series')
  const seriesConfiguration = initialFilmImportConfiguration(seriesSession)
  if (!seriesConfiguration) throw new Error('Configuration de la table Séries multi-tables absente')
  const seriesPreview = previewFilmCsvImport(
    seriesSession,
    source,
    setFilmImportSourceDestination(seriesConfiguration, NOTION_MARKDOWN_NOTES_SOURCE, 'personalNote'),
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(
    seriesPreview.document?.films[0].personalNote,
    'Note Markdown Séries.',
    'Le changement de CSV sélectionné doit rattacher uniquement les pages de sa propre racine',
  )

  const nestedArchiveSource = {
    ...source,
    csvCandidates: [csvCandidate(filmsCsv, `Export Notion part 1.zip!/${filmsRoot}/Films 93e75f21-8bf4-4ff4-a90c-0b8249f6a521.csv`, 'films')],
    markdownPages: [{ name: `Export Notion part 1.zip!/${filmsRoot}/Le Passage 11223344556677889900aabbccddeeff.md`, contents: filmsMarkdown }],
  }
  const nestedArchiveSession = prepareFilmCsvImport(nestedArchiveSource)
  const nestedArchiveConfiguration = initialFilmImportConfiguration(nestedArchiveSession)
  if (!nestedArchiveConfiguration) throw new Error('Configuration de l’archive Notion imbriquée absente')
  const nestedArchivePreview = previewFilmCsvImport(
    nestedArchiveSession,
    nestedArchiveSource,
    setFilmImportSourceDestination(nestedArchiveConfiguration, NOTION_MARKDOWN_NOTES_SOURCE, 'personalNote'),
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(
    nestedArchivePreview.document?.films[0].personalNote,
    'Note Markdown Films.',
    'Une racine incluant archive.zip!/ doit associer les CSV et Markdown du même dossier imbriqué',
  )

  const indeterminateRootSource = {
    ...source,
    csvCandidates: [csvCandidate(filmsCsv, 'Films.csv', 'films')],
    markdownPages: [{ name: 'Le Passage.md', contents: filmsMarkdown }],
  }
  const indeterminateRootSession = prepareFilmCsvImport(indeterminateRootSource)
  const indeterminateRootConfiguration = initialFilmImportConfiguration(indeterminateRootSession)
  if (!indeterminateRootConfiguration) throw new Error('Configuration de la racine Notion indéterminée absente')
  const indeterminateRootPreview = previewFilmCsvImport(
    indeterminateRootSession,
    indeterminateRootSource,
    setFilmImportSourceDestination(indeterminateRootConfiguration, NOTION_MARKDOWN_NOTES_SOURCE, 'personalNote'),
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(
    indeterminateRootPreview.document?.films[0].personalNote,
    null,
    'Sans racine de base de données identifiable, aucune page Markdown ne doit être associée par hasard',
  )
}

{
  const pairedTablesSource = {
    name: 'notion-deux-paires-de-vues.zip',
    kind: 'notion',
    csvCandidates: [
      csvCandidate('Name,Status\nVue Films,Watched\n', 'Export Notion/Films/Films.csv', 'films'),
      csvCandidate('Name,Status,Rating\nVue complète Films,Watched,8\n', 'Export Notion/Films/Films_all.csv', 'films-all'),
      csvCandidate('Name,Status\nVue Séries,Watched\n', 'Export Notion/Séries/Séries.csv', 'series'),
      csvCandidate('Name,Status,Rating\nVue complète Séries,Watched,9\n', 'Export Notion/Séries/Séries_all.csv', 'series-all'),
    ],
    markdownPages: [],
  }
  const pairedTablesSelection = inspectFilmCsvImportSource(pairedTablesSource)
  assert.deepEqual(
    pairedTablesSelection.candidates.map((candidate) => candidate.id),
    ['films-all', 'series-all'],
    'Deux tables Notion ayant chacune une paire standard/_all ne doivent proposer que leurs vues complètes',
  )
  assert.deepEqual(
    pairedTablesSelection.candidates.map((candidate) => candidate.label),
    ['Films', 'Séries'],
    'Le sélecteur doit présenter des libellés courts et distincts pour les vues complètes restantes',
  )
  assert.equal(pairedTablesSelection.defaultCandidateId, null, 'Aucune vue incomplète ne peut être choisie par défaut lorsque plusieurs tables restent')
  assert.equal(pairedTablesSelection.selectionRequired, true, 'Deux vues complètes de tables distinctes doivent demander un choix visible')
  assert.throws(
    () => prepareFilmCsvImport(pairedTablesSource, 'films'),
    /Choisissez une table CSV Notion/i,
    'Une vue standard écartée du sélecteur ne doit plus pouvoir préparer un aperçu',
  )

  const multiTableSource = {
    name: 'notion-plusieurs-tables.zip',
    kind: 'notion',
    csvCandidates: [
      csvCandidate('Name,Status\nVue d’ensemble,Watched\n', 'Export Notion/Films/Films.csv', 'films-overview'),
      csvCandidate('Name,Status,Rating,Vu le,Notes,Director\nLe Passage,Watched,8 (Excellent),18 juillet 2024,Note CSV,Maël Test\n', 'Export Notion/Films/Films_all.csv', 'films-all'),
    ],
    markdownPages: [],
  }
  const selection = inspectFilmCsvImportSource(multiTableSource)
  assert.equal(selection.defaultCandidateId, 'films-all', 'La vue complète Notion doit être sélectionnée automatiquement')
  assert.equal(selection.selectionRequired, false, 'Deux vues de la même table ne doivent pas afficher de choix')
  assert.match(selection.automaticSelectionMessage ?? '', /Notion a exporté deux vues de Films/i, 'Le regroupement des vues Notion doit être expliqué clairement')
  const session = prepareFilmCsvImport(multiTableSource)
  const configuration = initialFilmImportConfiguration(session)
  if (!configuration) throw new Error('Configuration de la meilleure table Notion absente')
  const preview = previewFilmCsvImport(
    session,
    multiTableSource,
    { ...configuration, ratingScale: 10 },
    '2026-07-18T10:00:00.000Z',
  )
  assert.equal(preview.sourceLabel, 'Export Notion : Export Notion/Films/Films_all.csv', 'L’aperçu doit indiquer la table Notion sélectionnée')
  assert.equal(preview.document?.films[0].rating, 4, 'La table _all.csv sélectionnée doit accepter sa note descriptive')
  const reportSource = conciseFilmImportReportSource({
    kind: 'notion',
    csvCandidates: [csvCandidate('', 'Export Notion/Films/Films 93e75f21-8bf4-4ff4-a90c-0b8249f6a521.csv', 'films-all')],
    markdownPages: [],
  }, 'films-all')
  assert.equal(reportSource, 'Notion · Films', 'Le rapport doit indiquer le format et la table Notion réellement importée')
  assert.doesNotMatch(reportSource, /Export Notion|\.csv|93e75f21/u, 'Le rapport ne doit pas exposer de chemin ou d’identifiant technique')
  assert.equal(
    conciseFilmImportReportSource({
      kind: 'notion',
      csvCandidates: [csvCandidate('', '93e75f21-8bf4-4ff4-a90c-0b8249f6a521.csv', 'opaque-table')],
      markdownPages: [],
    }, 'opaque-table'),
    'Notion · Table CSV',
    'Une table dont le nom ne contient qu’un UUID ne doit pas exposer cet identifiant technique',
  )

  const tiedTableSource = {
    ...multiTableSource,
    csvCandidates: [
      csvCandidate('Name,Status\nPremière,Watched\n', 'Export Notion/Base A.csv', 'base-a'),
      csvCandidate('Title,State\nDeuxième,Viewed\n', 'Export Notion/Base B.csv', 'base-b'),
    ],
  }
  const tiedSelection = inspectFilmCsvImportSource(tiedTableSource)
  assert.equal(tiedSelection.defaultCandidateId, null, 'Des tables ex aequo ne doivent jamais être sélectionnées silencieusement')
  assert.equal(tiedSelection.selectionRequired, true, 'Des tables ex aequo doivent demander un choix visible')
  assert.throws(
    () => prepareFilmCsvImport(tiedTableSource),
    /Choisissez une table CSV Notion/i,
    'Un aperçu ne doit pas deviner une table lorsque le mapping est ex aequo',
  )

  const insufficientTableSource = {
    ...multiTableSource,
    csvCandidates: [
      csvCandidate('Name\nPremière\n', 'Export Notion/Notes.csv', 'notes'),
      csvCandidate('Title\nDeuxième\n', 'Export Notion/Archives.csv', 'archives'),
    ],
  }
  const insufficientSelection = inspectFilmCsvImportSource(insufficientTableSource)
  assert.equal(insufficientSelection.defaultCandidateId, null, 'Un mapping Films insuffisant ne doit pas déclencher de choix implicite')
  assert.equal(insufficientSelection.selectionRequired, true, 'Un mapping Films insuffisant doit demander un choix visible')
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

  const searched = await repository.searchFilms('default', { query: '  Chihiro  ', sort: { column: 'title', direction: 'asc' } })
  assert.equal(searched[0].id, filmRow.id, 'La recherche doit convertir les résultats SQLite')
  assert.match(calls[0].query, /title COLLATE NOCASE LIKE \$2/, 'La recherche doit interroger le titre dans SQLite')
  assert.match(calls[0].query, /original_title COLLATE NOCASE LIKE \$2/, 'La recherche doit interroger le titre original dans SQLite')
  assert.match(calls[0].query, /director COLLATE NOCASE LIKE \$2/, 'La recherche doit interroger la réalisation dans SQLite')
  assert.deepEqual(calls[0].bindValues, ['default', '%Chihiro%'], 'Le texte recherché doit être normalisé et paramétré')

  await repository.searchFilms('default', {
    query: '100%_film',
    sort: { column: 'title', direction: 'asc' },
    filters: { status: 'all', favoritesOnly: true, minRating: null, year: null, personalDateFrom: null, specificText: '', location: '', exhibition: '' },
  })
  assert.deepEqual(calls[1].bindValues, ['default', '%100\\%\\_film%'], 'Les jokers LIKE doivent être échappés et le filtre paramétré')
  assert.match(calls[1].query, /is_favorite = 1/, 'Le filtre favoris doit être exécuté dans SQLite')

  await repository.searchFilms('default', { query: '', sort: { column: 'recency', direction: 'desc' } })
  assert.match(calls[2].query, /ORDER BY updated_at DESC, title COLLATE NOCASE ASC/, 'Le tri récent doit suivre la dernière modification dans SQLite')

  await repository.searchFilms('default', { query: '', sort: { column: 'rating', direction: 'desc' } })
  assert.match(calls[3].query, /ORDER BY rating IS NULL ASC, rating DESC, title COLLATE NOCASE ASC/, 'Le tri par note doit être décroissant, absences en fin')

  await repository.searchFilms('default', { query: '', sort: { column: 'title', direction: 'asc' } })
  assert.doesNotMatch(calls[4].query, /is_favorite = 1/, 'Une recherche sans filtre ne doit ajouter aucune restriction')
  assert.match(calls[4].query, /ORDER BY title COLLATE NOCASE ASC, created_at ASC/, 'Le tri par titre doit conserver l’ordre canonique')

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

assert.deepEqual(
  toFilm({
    ...filmRow,
    original_title: '',
    personal_note: 'Texte  SQLite  préservé.',
    provider_name: 'Source SQLite',
    provider_id: '',
  }),
  {
    ...toFilm(filmRow),
    originalTitle: null,
    personalNote: 'Texte  SQLite  préservé.',
    providerName: null,
    providerId: null,
  },
  'Une lecture SQLite historique doit présenter la forme canonique avant même la migration native',
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
      validateFilmForm({ ...EMPTY_FILM_FORM, title: 'Valide', status: 'terminé', rating: String(rating) }).success,
      true,
      `La note ${rating} doit être acceptée`,
    )
  }

  for (const rating of ['0', '0.25', '4.75', '5.5', 'abc']) {
    const result = validateFilmForm({ ...EMPTY_FILM_FORM, title: 'Invalide', status: 'terminé', rating })
    assert.equal(result.success, false, `La note ${rating} doit être refusée`)
    if (!result.success) assert.match(result.errors.rating, /demi-points/i)
  }

  // 0.6.13 : une fiche watchlist ne porte jamais de verdict personnel.
  const purged = validateFilmForm({
    ...EMPTY_FILM_FORM,
    title: 'Retour en watchlist',
    status: 'à découvrir',
    rating: '4',
    isFavorite: true,
    watchedAt: '2026-08-24',
    personalNote: 'Avis rédigé avant le retour en à découvrir',
  })
  assert.equal(purged.success, true, 'La fiche watchlist purgée doit rester valide')
  if (purged.success) {
    assert.equal(purged.data.rating, null, 'La note est purgée au retour en « à découvrir »')
    assert.equal(purged.data.isFavorite, false, 'Le coup de cœur est purgé')
    assert.equal(purged.data.watchedAt, null, 'La date de visionnage est purgée')
    assert.equal(purged.data.personalNote, null, "L'avis est purgé")
  }
  const kept = validateFilmForm({ ...EMPTY_FILM_FORM, title: 'Vu', status: 'terminé', rating: '4', isFavorite: true, personalNote: 'Gardé' })
  if (kept.success) {
    assert.equal(kept.data.rating, 4, 'Un statut consommé conserve sa note')
    assert.equal(kept.data.isFavorite, true, 'Un statut consommé conserve son coup de cœur')
    assert.equal(kept.data.personalNote, 'Gardé', 'Un statut consommé conserve son avis')
  }

  const badStatus = validateFilmForm({ ...EMPTY_FILM_FORM, title: 'Statut', status: 'inconnu' })
  assert.equal(badStatus.success, false, 'Un statut hors liste doit être refusé')

  const badDate = validateFilmForm({ ...EMPTY_FILM_FORM, title: 'Date', status: 'terminé', watchedAt: '2026-02-30' })
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
  const unavailable = await searchFilmMetadata(unconfiguredFilmMetadataSource, { text: 'Recherche sans source' })
  assert.deepEqual(
    unavailable,
    { kind: 'unavailable', reason: 'not-configured' },
    'La source par défaut doit annoncer explicitement son absence de configuration',
  )

  const inaccessible = await searchFilmMetadata(
    {
      async search() {
        throw new Error('Réseau inaccessible')
      },
    },
    { text: 'Recherche interrompue' },
  )
  assert.deepEqual(
    inaccessible,
    { kind: 'unavailable', reason: 'network-unavailable' },
    'Une source qui ne peut pas être jointe doit rester un état récupérable',
  )

  const incompleteResult = {
    title: 'Résultat incomplet de test',
    originalTitle: null,
    year: null,
    director: null,
    summary: null,
    posterUrl: null,
    providerName: 'Source de test',
    providerId: null,
  }
  const response = await searchFilmMetadata(
    {
      async search() {
        return { kind: 'results', results: [incompleteResult] }
      },
    },
    { text: 'Résultat incomplet de test' },
  )
  assert.equal(response.kind, 'results', 'Le contrat doit pouvoir représenter une liste de résultats pour une sélection humaine')
  if (response.kind !== 'results') throw new Error('La liste de résultats de test est absente.')

  const selected = filmMetadataResultToFormInitialValues(response.results[0])
  assert.deepEqual(
    selected.values,
    {
      ...EMPTY_FILM_FORM,
      title: 'Résultat incomplet de test',
    },
    'Un résultat incomplet doit préremplir seulement les métadonnées disponibles sans inventer de valeur',
  )
  assert.equal(selected.provenance, null, 'Une provenance partielle ne doit pas être conservée')
  assert.equal(selected.values.status, EMPTY_FILM_FORM.status, 'Le statut doit garder la valeur de création manuelle')
  assert.equal(selected.values.isFavorite, EMPTY_FILM_FORM.isFavorite, 'Le favori doit rester sous contrôle de la personne')
  assert.equal(selected.values.rating, EMPTY_FILM_FORM.rating, 'La note doit garder la valeur de création manuelle')
  assert.equal(selected.values.watchedAt, EMPTY_FILM_FORM.watchedAt, 'La date de visionnage doit garder la valeur de création manuelle')
  assert.equal(selected.values.personalNote, EMPTY_FILM_FORM.personalNote, 'Le texte personnel doit garder la valeur de création manuelle')

  const selectedWithProvenance = filmMetadataResultToFormInitialValues({
    ...incompleteResult,
    providerId: 'test-provider-id',
  })
  assert.deepEqual(
    selectedWithProvenance.provenance,
    { providerName: 'Source de test', providerId: 'test-provider-id' },
    'Une provenance complète doit rester une paire atomique',
  )
  assert.equal(
    filmMetadataResultToFormInitialValues({
      ...incompleteResult,
      providerName: null,
      providerId: 'test-provider-id',
    }).provenance,
    null,
    'Un identifiant fournisseur seul ne doit pas devenir une provenance partielle',
  )

  const abandonedSelection = filmMetadataResultToFormInitialValues(response.results[0])
  assert.equal(abandonedSelection.values.title, 'Résultat incomplet de test', 'Une sélection abandonnée doit seulement préparer le formulaire')
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
  assert.equal(created.providerId, null, 'La création manuelle ne doit inventer aucun identifiant fournisseur')
  assert.match(calls[0].query, /^INSERT INTO films/m, 'La création doit passer par le dépôt SQLite')
  assert.deepEqual(calls[0].bindValues.slice(0, 3), ['film-uuid', 'default', input.title], 'L’INSERT doit paramétrer identifiant, profil et titre')
  assert.equal(calls[0].bindValues[6], 1, 'Le favori doit être encodé explicitement pour SQLite')
  assert.deepEqual(calls[0].bindValues.slice(12, 14), [null, null], 'La création manuelle doit écrire les deux champs de provenance à null')

  const assistedCreated = await repository.createFilm(
    'default',
    { ...input, title: 'Film assisté de test' },
    { providerName: 'Source de test', providerId: 'test-provider-id' },
  )
  assert.deepEqual(
    [assistedCreated.providerName, assistedCreated.providerId],
    ['Source de test', 'test-provider-id'],
    'La création issue d’une sélection future doit conserver la paire de provenance',
  )
  assert.deepEqual(
    calls[1].bindValues.slice(12, 14),
    ['Source de test', 'test-provider-id'],
    'L’INSERT SQLite doit écrire les deux valeurs de provenance ensemble',
  )

  const canonicalCreated = await repository.createFilm(
    'default',
    {
      ...input,
      title: 'Film canonique de test',
      originalTitle: '',
      watchedAt: '',
      personalNote: 'Texte  local  préservé.',
      director: '',
      summary: '',
      posterUrl: '',
    },
    { providerName: 'Source incomplète', providerId: '' },
  )
  assert.deepEqual(
    {
      originalTitle: canonicalCreated.originalTitle,
      watchedAt: canonicalCreated.watchedAt,
      personalNote: canonicalCreated.personalNote,
      director: canonicalCreated.director,
      summary: canonicalCreated.summary,
      posterUrl: canonicalCreated.posterUrl,
      providerName: canonicalCreated.providerName,
      providerId: canonicalCreated.providerId,
    },
    {
      originalTitle: null,
      watchedAt: null,
      personalNote: 'Texte  local  préservé.',
      director: null,
      summary: null,
      posterUrl: null,
      providerName: null,
      providerId: null,
    },
    'Les écritures locales doivent devenir canoniques sans retirer les espaces internes',
  )
  assert.deepEqual(
    calls[2].bindValues.slice(3, 15),
    [null, input.year, input.status, 1, input.rating, null, 'Texte  local  préservé.', null, null, null, null, null],
    'L’INSERT SQLite local doit recevoir seulement les valeurs canoniques, y compris false ou zéro lorsqu’ils sont fournis',
  )

  const updatedAt = await repository.updateFilm('default', 'film-uuid', { ...input, title: 'Titre modifié' })
  assert.equal(updatedAt, '2026-07-17T12:34:56.000Z', 'La modification doit produire un horodatage UTC')
  assert.match(calls[3].query, /^UPDATE films/m, 'La modification doit passer par le dépôt SQLite')
  assert.doesNotMatch(calls[3].query, /provider_name|provider_id/, 'La modification manuelle ne doit pas effacer la provenance existante')
  assert.deepEqual(calls[3].bindValues.slice(-2), ['film-uuid', 'default'], 'La modification doit cibler le film et le profil courant')

  await repository.deleteFilm('default', 'film-uuid')
  assert.match(calls[4].query, /^DELETE FROM films/m, 'La suppression doit être définitive dans SQLite')
  assert.deepEqual(calls[4].bindValues, ['film-uuid', 'default'], 'La suppression doit cibler le film et le profil courant')
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
const accessibleDialogSource = readFileSync(new URL('../src/components/AccessibleDialog.tsx', import.meta.url), 'utf8')
const libraryExportFlowSource = readFileSync(new URL('../src/components/LibraryExportFlow.tsx', import.meta.url), 'utf8')
const transferSource = readFileSync(new URL('../src/domain/libraryTransfer.ts', import.meta.url), 'utf8')
const csvTransferSource = readFileSync(new URL('../src/domain/csvFilmExport.ts', import.meta.url), 'utf8')
const csvImportSource = readFileSync(new URL('../src/domain/filmCsvImport.ts', import.meta.url), 'utf8')
const backupServiceSource = readFileSync(new URL('../src/data/backupService.ts', import.meta.url), 'utf8')
const nativePortabilityBridgeSource = readFileSync(new URL('../src/data/nativePortability.ts', import.meta.url), 'utf8')
const nativePortabilitySource = readFileSync(new URL('../src-tauri/src/portability.rs', import.meta.url), 'utf8')
const libraryImportButtonSource = readFileSync(new URL('../src/components/LibraryImportButton.tsx', import.meta.url), 'utf8')
const filmCsvImportFlowSource = readFileSync(new URL('../src/components/FilmCsvImportFlow.tsx', import.meta.url), 'utf8')
// Le code de production de portability.rs s'arrête avant `mod tests` : les tests
// d'intégration manipulent volontairement le cache TMDB pour prouver son exclusion,
// ils ne doivent donc pas être soumis à la garde d'exclusion des sources portables.
const nativePortabilityProductionSource = nativePortabilitySource.split('\nmod tests {')[0]
const tauriLibrarySource = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8')
const tmdbModuleSource = readFileSync(new URL('../src-tauri/src/tmdb/mod.rs', import.meta.url), 'utf8')
const tmdbCacheSource = readFileSync(new URL('../src-tauri/src/tmdb/cache.rs', import.meta.url), 'utf8')
const tmdbClientSource = readFileSync(new URL('../src-tauri/src/tmdb/client.rs', import.meta.url), 'utf8')
const tmdbSecretsSource = readFileSync(new URL('../src-tauri/src/tmdb/secrets.rs', import.meta.url), 'utf8')
const tmdbEmbeddedKeySource = readFileSync(new URL('../src-tauri/src/tmdb/embedded_key.rs', import.meta.url), 'utf8')
const repositorySource = readFileSync(new URL('../src/data/filmsRepository.ts', import.meta.url), 'utf8')
const metadataAssistanceSource = readFileSync(new URL('../src/domain/filmMetadataAssistance.ts', import.meta.url), 'utf8')
const migrationSource = readFileSync(new URL('../src-tauri/migrations/0001_create_profiles_and_films.sql', import.meta.url), 'utf8')
const normalizationMigration = readFileSync(new URL('../src-tauri/migrations/0007_normalize_film_optional_data.sql', import.meta.url), 'utf8')
const tmdbCacheMigration = readFileSync(new URL('../src-tauri/migrations/0008_create_film_tmdb_cache.sql', import.meta.url), 'utf8')
const tmdbCacheMigration9 = readFileSync(new URL('../src-tauri/migrations/0009_add_selected_poster_url.sql', import.meta.url), 'utf8')
const tmdbServiceSource = readFileSync(new URL('../src/data/tmdbService.ts', import.meta.url), 'utf8')
const tmdbSearchFlowSource = readFileSync(new URL('../src/components/TmdbSearchFlow.tsx', import.meta.url), 'utf8')
const posterDialogSource = readFileSync(new URL('../src/components/TmdbPosterDialog.tsx', import.meta.url), 'utf8')
const databaseMigrationSource = readFileSync(new URL('../src-tauri/src/database.rs', import.meta.url), 'utf8')
const defaultProfileMigration = readFileSync(new URL('../src-tauri/migrations/0002_create_default_profile.sql', import.meta.url), 'utf8')
const currentProfileMigration = readFileSync(new URL('../src-tauri/migrations/0003_track_current_profile.sql', import.meta.url), 'utf8')
const backupSettingsMigration = readFileSync(new URL('../src-tauri/migrations/0004_create_backup_settings.sql', import.meta.url), 'utf8')
const backupSnapshotsMigration = readFileSync(new URL('../src-tauri/migrations/0005_create_backup_snapshots.sql', import.meta.url), 'utf8')
const capabilitySource = readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const importContainersContractSource = readFileSync(new URL('../docs/CONTRAT_CONTENEURS_IMPORT_V1.md', import.meta.url), 'utf8')

assert.doesNotMatch(mainSource, /\bSELECT\b|\bINSERT INTO films\b|\bUPDATE films\b|\bDELETE FROM films\b/i, 'Les composants React ne doivent contenir aucun SQL brut')
assert.match(mainSource, /createFilm/, 'La vue doit relier la création au dépôt SQLite')
assert.match(mainSource, /updateFilm/, 'La vue doit relier la modification au dépôt SQLite')
assert.match(mainSource, /deleteFilm/, 'La vue doit relier la suppression au dépôt SQLite')
assert.match(mainSource, /searchFilms/, 'La recherche et les filtres doivent appeler le dépôt SQLite')
assert.match(mainSource, /getFilm/, 'La fiche doit être relue depuis SQLite')
assert.match(mainSource, /libraryContext/, 'Le contexte de recherche et de filtre doit rester porté par la bibliothèque')
assert.match(mainSource, /libraryScrollPosition/, 'La position de consultation doit être restaurée au retour')
assert.match(posterSource, /!src \|\| missing/, 'Une affiche absente ou cassée doit utiliser le fallback')
assert.match(posterSource, /alt={`\$\{label\} de/, 'Un visuel chargé doit conserver un texte alternatif pertinent pour son médium')
assert.match(stylesSource, /\.home-entry-info b \{[^}]*overflow-wrap: anywhere;/s, 'Le titre d’une carte d’accueil doit pouvoir couper une suite de caractères sans espace')
assert.match(stylesSource, /\.poster-fallback b \{[^}]*overflow-wrap: anywhere;/s, 'Le titre du fallback d’affiche doit pouvoir couper une suite de caractères sans espace')
assert.match(stylesSource, /\.reading-section p \{[^}]*overflow-wrap: anywhere;/s, 'Le texte personnel de détail doit pouvoir couper une suite de caractères sans espace')
assert.match(stylesSource, /\.profile-card > \.primary-button \{[^}]*margin-top:/s, 'Le bouton de création de profil doit rester séparé de la dernière ligne')
assert.match(stylesSource, /\.search input:focus \{[^}]*outline: none;/s, 'Le champ de recherche doit déléguer son focus visuel au conteneur')
assert.match(stylesSource, /\.search:has\(input:focus-visible\)/, 'Le conteneur de recherche doit conserver un indicateur de focus clavier sobre')
assert.match(portabilitySource, /Oublier ce dossier/, 'Les réglages doivent permettre de désactiver le dossier de snapshots')
assert.match(portabilitySource, /directoryAvailable/, 'Un dossier supprimé hors de l’application doit être signalé')
assert.match(nativePortabilityBridgeSource, /invoke\('clear_backup_settings'/, 'Le frontend doit appeler la commande native de désactivation des snapshots')
assert.match(nativePortabilitySource, /pub async fn clear_backup_settings/, 'Le backend doit exposer la désactivation des snapshots')
assert.match(tauriLibrarySource, /portability::clear_backup_settings/, 'La commande de désactivation des snapshots doit être enregistrée dans Tauri')
assert.match(formSource, /<Poster\s+title=\{previewTitle\}\s+src=\{previewUrl\}/s, 'L’aperçu du formulaire doit réutiliser le fallback typographique')
assert.match(formSource, /values\.watchedAt \|\| today/, 'La date de visionnage est préremplie avec la date du jour (0.6.0 : plus de bouton « Utiliser aujourd’hui »)')
assert.match(formSource, /onCancel/, 'Le formulaire doit permettre une annulation avant toute écriture')
assert.match(formSource, /initialValues/, 'Le formulaire doit accepter des valeurs initiales éditables')
assert.match(formSource, /onSave\(result\.data, provenance\)/, 'Le formulaire doit transmettre la provenance interne seulement à la validation finale')
assert.match(tmdbSearchFlowSource, /Saisir manuellement/, 'La recherche TMDB doit proposer une issue vers la saisie manuelle')
assert.match(tmdbSearchFlowSource, /Rechercher un film/, 'L’ajout de Film doit ouvrir la recherche TMDB directe')
assert.match(mainSource, /TmdbSearchFlow/, 'Le parcours assisté doit utiliser le flux de recherche TMDB')
// Jalon 0.4.25 : sélection directe, sans écran de confirmation intermédiaire.
assert.doesNotMatch(mainSource, /tmdb-confirm|TmdbAssociationConfirm/, 'Aucun écran de confirmation ne doit se placer entre le résultat et le formulaire')
assert.match(mainSource, /previewTmdbFilm\(candidate\.tmdbId\)/, 'Le clic sur un résultat doit préremplir directement le formulaire')
assert.match(mainSource, /await associateFilmWithTmdb\(film\.id, candidate\.tmdbId\)/, 'Le clic sur un résultat doit associer directement une fiche existante')
assert.match(mainSource, /pendingId: null,\s*error: 'La sélection a échoué/, 'Un échec de sélection doit être annoncé sans quitter la recherche')
assert.match(tmdbServiceSource, /previewTmdbFilm/, 'Le frontend doit pouvoir prévisualiser une présentation TMDB sans film local')
assert.match(tmdbModuleSource, /pub async fn preview_tmdb_film/, 'Le backend doit exposer la prévisualisation TMDB sans film_id')
assert.match(tauriLibrarySource, /tmdb::preview_tmdb_film/, 'La commande de prévisualisation TMDB doit être enregistrée')
assert.match(metadataAssistanceSource, /tmdbPresentationToFilmMetadataResult/, 'La présentation TMDB doit être mappée vers les champs éditoriaux locaux')
assert.match(mainSource, /initialValues=\{view\.initialValues\}/, 'Le formulaire doit recevoir les valeurs détaillées choisies dans TMDB')
assert.match(mainSource, /associateFilmWithTmdb\(film\.id, Number\(provenance\.providerId\)\)/, 'La création assistée doit associer le cache après la création locale')
assert.match(mainSource, /Le film a bien été créé, mais TMDB n’a pas pu être associé/, 'Un échec TMDB après création doit être explicite et récupérable')
assert.match(detailSource, /tmdbNotice/, 'La fiche doit afficher l’échec d’association sans perdre la fiche locale')
assert.doesNotMatch(metadataAssistanceSource, /\bfetch\s*\(/, 'Le contrat de métadonnées ne doit lancer aucune requête réseau')
assert.doesNotMatch(metadataAssistanceSource, /filmsRepository|createFilm|INSERT INTO films/, 'Une sélection ou un abandon ne doit écrire aucune donnée SQLite')
assert.doesNotMatch(metadataAssistanceSource, /providerName: 'Source de test'/, 'Les doubles de test ne doivent pas devenir du contenu de production')
assert.match(detailSource, /Supprimer définitivement/, 'La suppression doit demander une confirmation explicite')
assert.match(repositorySource, /WHERE profile_id = \$1/, 'La lecture Films doit être paramétrée par profil')
assert.match(repositorySource, /WHERE id = \$13 AND profile_id = \$14/, 'La modification doit être limitée au film du profil courant')
assert.match(repositorySource, /WHERE id = \$1 AND profile_id = \$2/, 'La suppression doit être limitée au film du profil courant')
assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS profiles/, 'La migration doit créer les profils')
assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS films/, 'La migration doit créer les films')
assert.match(normalizationMigration, /UPDATE films/, 'La migration de canonisation doit rester limitée aux Films historiques')
assert.match(normalizationMigration, /NULLIF\(original_title, ''\)/, 'La migration doit convertir les chaînes facultatives vides sans toucher les textes non vides')
assert.match(normalizationMigration, /provider_name = CASE/, 'La migration doit traiter la provenance comme une paire atomique')
assert.match(databaseMigrationSource, /version: 7/, 'La migration de canonisation doit rester séquentielle')
assert.match(databaseMigrationSource, /version: 8/, 'La migration de cache TMDB doit suivre les migrations existantes')
assert.match(tmdbCacheMigration, /CREATE TABLE film_tmdb_cache/, 'Le cache TMDB doit vivre dans une table séparée')
assert.match(tmdbCacheMigration, /REFERENCES films\(id\) ON DELETE CASCADE/, 'La suppression d’un Film doit supprimer son cache TMDB')
assert.match(tmdbCacheMigration, /film_tmdb_cache_refresh_idx/, 'Le cache TMDB doit indexer son échéance de rafraîchissement')
assert.doesNotMatch(tmdbCacheMigration, /ALTER TABLE films|provider_name|provider_id/, 'Le cache TMDB ne doit modifier ni films ni sa provenance portable')
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
assert.match(csvImportSource, /ImportableFilmField/, 'Le mapping CSV doit rester limité aux champs Films V1 explicitement stockables')
assert.match(csvImportSource, /L’échelle des notes est ambiguë/, 'Une note sans échelle doit être bloquée au lieu d’être supposée')
assert.match(csvImportSource, /Markdown/, 'Les notes Notion doivent être associées de manière visible et déterministe')
assert.match(libraryImportButtonSource, /Formats acceptés/, 'Le bouton Importer doit ouvrir une explication avant le sélecteur natif')
assert.match(libraryImportButtonSource, /JSON[\s\S]*CSV[\s\S]*ZIP compatible/, 'L’assistant Films doit annoncer les trois formats réellement acceptés')
assert.match(libraryImportButtonSource, /setOpen\(true\)/, 'Le premier clic doit ouvrir le dialogue d’import')
assert.doesNotMatch(libraryImportButtonSource, /setOpen\(true\)[^}]*pickAndPrepare/s, 'Le premier clic ne doit pas ouvrir immédiatement le sélecteur de fichiers')
assert.match(libraryImportButtonSource, /writingRef\.current/, 'Un double déclenchement ne doit jamais lancer deux écritures concurrentes')
assert.match(filmCsvImportFlowSource, /Table à importer/, 'Le choix d’une table Notion doit rester visible avant l’aperçu')
assert.match(filmCsvImportFlowSource, /Aucune donnée n’a été écrite/, 'Un aperçu invalide doit annoncer l’absence d’écriture')
assert.doesNotMatch(filmCsvImportFlowSource, /Nouveau profil|Créer le nouveau profil/, 'L’import CSV ou Notion ne doit plus créer de profil')
assert.match(portabilitySource, /Importer et exporter/, 'Les Paramètres doivent regrouper imports et exports dans un hub dédié')
assert.match(accessibleDialogSource, /role="dialog"/, 'Les assistants de portabilité doivent être des dialogues accessibles')
assert.match(filmCsvImportFlowSource, /Détecté dans votre fichier/, 'Le mapping doit présenter les colonnes dans le sens source vers destination')
assert.match(filmCsvImportFlowSource, /Importer dans Sylloge/, 'Le mapping doit nommer explicitement la destination Sylloge')
assert.match(filmCsvImportFlowSource, /Seules vos données de suivi sont importées/, 'Le mapping doit expliquer le périmètre personnel de l’import')
assert.match(filmCsvImportFlowSource, /Métadonnée récupérée plus tard, non importée/, 'Les sources metadata doivent être clairement exclues dans le mapping')
assert.match(filmCsvImportFlowSource, /Fonctionnalité future, non importée/, 'Les sources de fonctionnalités futures doivent être clairement exclues dans le mapping')
assert.doesNotMatch(filmCsvImportFlowSource, /champs Films reconnus/, 'Le sélecteur Notion ne doit jamais afficher un compteur de champs reconnus')
assert.match(filmCsvImportFlowSource, /Pages de notes associées/, 'Les pages de notes historiques doivent apparaître comme une source texte distincte')
assert.match(filmCsvImportFlowSource, /Évaluation/, 'La destination numérique doit être distinguée de Note personnelle')
assert.match(accessibleDialogSource, /document\.addEventListener\('keydown', keepFocusInDialog, true\)/, 'Le dialogue doit intercepter le clavier même lorsque le focus a quitté un contrôle')
assert.match(accessibleDialogSource, /if \(focusable\.length === 0\) \{\s+event\.preventDefault\(\)\s+dialog\.focus\(\)/s, 'Tab doit rester dans le dialogue même lorsqu’aucun contrôle ne reste actif')
assert.match(accessibleDialogSource, /if \(event\.key === 'Escape'\) \{\s+event\.preventDefault\(\)\s+if \(!closeDisabled\) onClose\(\)/s, 'Escape doit rester sans effet pendant une écriture en cours')
assert.match(portabilitySource, /Sauvegarde Sylloge/, 'L’export global doit être nommé Sauvegarde Sylloge dans les Paramètres')
assert.match(portabilitySource, /fullLibrary/, 'Le hub de portabilité doit charger les cinq collections pour ses actions par médium')
// Jalon 0.4.29 : un seul bouton Exporter par médium, dialogue de formats JSON/CSV.
assert.match(mainSource, /LibraryExportFlow kind="films"/, 'La bibliothèque Films doit utiliser le flux d’export unifié')
assert.match(mainSource, /LibraryExportFlow kind="series"/, 'La bibliothèque Séries doit utiliser le flux d’export unifié')
assert.match(mainSource, /LibraryExportFlow kind="books"/, 'La bibliothèque Livres doit utiliser le flux d’export unifié')
assert.match(mainSource, /LibraryExportFlow kind="games"/, 'La bibliothèque Jeux doit utiliser le flux d’export unifié')
assert.match(mainSource, /LibraryExportFlow kind="artworks"/, 'La bibliothèque Art doit utiliser le flux d’export unifié')
assert.match(portabilitySource, /LibraryExportFlow/, 'Le hub de portabilité doit réutiliser le même flux d’export unifié')
assert.doesNotMatch(mainSource, /LibraryExportButton|LibraryCsvExportButton/, 'Les anciens boutons d’export séparés doivent avoir disparu')
assert.match(libraryExportFlowSource, /createLibraryDocument/, 'L’export JSON par médium doit produire le document versionné commun')
assert.match(libraryExportFlowSource, /saveExportCsv/, 'L’export CSV par médium doit appeler le service CSV natif')
assert.match(libraryExportFlowSource, /JSON Sylloge/, 'Le dialogue doit proposer le format JSON Sylloge')
assert.match(libraryExportFlowSource, /<AccessibleDialog/, 'Le choix du format doit passer par le dialogue accessible')
assert.match(libraryExportFlowSource, /runExport/, 'Aucune écriture ne doit avoir lieu avant le choix explicite du format')
assert.doesNotMatch(mainSource, /scrollIntoView\(\{ block: 'start' \}\)/, 'Les entrées de la sidebar Paramètres ne doivent plus faire défiler des ancres')
assert.match(mainSource, /SETTINGS_NAVIGATION/, 'La sidebar doit disposer de sa navigation locale de réglages')
assert.match(mainSource, /Importer et exporter/, 'La navigation locale doit inclure le hub Importer et exporter')
assert.match(mainSource, /Retour à la bibliothèque/, 'Les Paramètres doivent toujours proposer un retour explicite à la bibliothèque')
assert.match(mainSource, /section={settingsSection}/, 'La navigation interne doit afficher la rubrique demandée sans conserver les autres pages')
assert.match(nativePortabilityBridgeSource, /invoke\('save_export_csv'/, 'Le frontend doit appeler le pont Tauri CSV dédié')
assert.match(nativePortabilityBridgeSource, /invoke\('pick_import_any'/, 'Le frontend doit appeler le sélecteur unifié JSON, CSV ou ZIP')
assert.match(tauriLibrarySource, /portability::save_export_csv/, 'La commande Tauri CSV doit être enregistrée')
assert.match(tauriLibrarySource, /portability::pick_import_any/, 'La commande Tauri d’import unifié doit être enregistrée')
assert.match(nativePortabilitySource, /\["json", "csv", "zip"\]/, 'Le sélecteur unifié doit accepter JSON, CSV et ZIP')
assert.match(nativePortabilitySource, /pub async fn save_export_csv/, 'Le pont natif doit exposer une sauvegarde CSV')
assert.match(nativePortabilitySource, /"Export CSV Sylloge"/, 'Le dialogue natif CSV doit filtrer explicitement le format CSV')
assert.match(nativePortabilitySource, /MAX_ZIP_CONTAINER_ENTRIES/, 'Le lecteur ZIP doit limiter le nombre d’entrées')
assert.match(nativePortabilitySource, /MAX_ZIP_PATH_COMPONENTS/, 'Le lecteur ZIP doit limiter les segments de chemin')
assert.match(nativePortabilitySource, /MAX_ZIP_NESTING_DEPTH/, 'Le lecteur ZIP doit limiter la profondeur des archives imbriquées')
assert.match(nativePortabilitySource, /MAX_ZIP_UNCOMPRESSED_BYTES/, 'Le lecteur ZIP doit limiter la taille décompressée')
assert.match(nativePortabilitySource, /MAX_ZIP_ENTRY_BYTES/, 'Le lecteur ZIP doit limiter chaque entrée pertinente')
assert.match(nativePortabilitySource, /file\.encrypted\(\)/, 'Le lecteur ZIP doit refuser explicitement les entrées chiffrées')
assert.match(nativePortabilitySource, /file\.is_symlink\(\)/, 'Le lecteur ZIP doit refuser les liens symboliques')
assert.match(nativePortabilitySource, /Component::ParentDir/, 'Le lecteur ZIP doit refuser toute traversée de répertoire')
assert.match(nativePortabilitySource, /has_windows_volume_prefix/, 'Le lecteur ZIP doit refuser les préfixes de volume Windows quel que soit l’OS hôte')
assert.match(nativePortabilitySource, /notion_zip_reader_rejects_unsafe_encrypted_and_symbolic_link_entries/, 'Un test natif doit couvrir les chemins non sûrs, le chiffrement et les liens symboliques')
assert.match(nativePortabilitySource, /extract_notion_zip/, 'Le ZIP Film historique doit être lu en mémoire sans extraction durable')
assert.match(importContainersContractSource, /16 Mio[\s\S]*32 Mio[\s\S]*512/, 'Le contrat de conteneur doit documenter les limites de taille, décompression et entrées')
assert.match(importContainersContractSource, /Remplacer \/ Fusionner/, 'Le contrat doit conserver le pipeline d’import atomique existant')
assert.match(importContainersContractSource, /jalon `0\.4\.18`/, 'Le contrat doit réserver le sélecteur de dossier au jalon suivant')
assert.match(nativePortabilitySource, /\.begin\(\)/, 'L’import doit démarrer une transaction SQLite atomique côté Rust')
assert.match(nativePortabilitySource, /\.commit\(\)/, 'L’import doit valider explicitement la transaction SQLite')
assert.match(nativePortabilitySource, /write_snapshot_atomically/, 'Les snapshots doivent passer par une écriture atomique native')
assert.match(nativePortabilitySource, /SNAPSHOT_RETENTION_COUNT: usize = 30/, 'La rétention native doit être limitée à 30 snapshots')
for (const portableSource of [transferSource, csvTransferSource, backupServiceSource, nativePortabilityProductionSource]) {
  assert.doesNotMatch(portableSource, /film_tmdb_cache|payload_json|refresh_after|expires_at|CachedFilmTmdbPresentationDto/, 'Le cache TMDB doit rester inaccessible aux exports et snapshots portables (code de production)')
}
assert.match(nativePortabilitySource, /export_query_never_surfaces_tmdb_cache_data/, 'Un test d’intégration doit prouver qu’un export ne remonte jamais le cache TMDB')
assert.match(nativePortabilitySource, /historical_v1_export_reimports_on_migrated_database/, 'Un test d’intégration doit prouver le réimport d’un export v1 historique sur base migrée TMDB')
assert.match(tmdbClientSource, /deny_unknown_fields/, 'Le payload de cache doit refuser les champs TMDB bruts supplémentaires')
assert.match(tmdbCacheSource, /REFRESH_AFTER_DAYS: i64 = 80/, 'Le cache TMDB doit devenir renouvelable à 80 jours')
assert.match(tmdbCacheSource, /EXPIRES_AFTER_DAYS: i64 = 180/, 'Le cache TMDB doit rester strictement expirant à 180 jours')
assert.match(tmdbCacheSource, /ON CONFLICT\(film_id\) DO UPDATE SET/, 'Le cache doit être remplacé par une seule opération SQLite')
assert.match(tmdbCacheSource, /expires_at <= strftime/, 'La lecture et la purge doivent supprimer le cache à son échéance')
assert.match(tmdbEmbeddedKeySource, /SEED: \[u8; 8\]/, 'La clé embarquée doit utiliser une graine multi-octets')
assert.match(tmdbEmbeddedKeySource, /mask_byte/, 'La clé embarquée doit utiliser un keystream par position')
assert.doesNotMatch(tmdbEmbeddedKeySource, /XOR_MASK/, 'Le XOR mono-octet ne doit plus être le schéma d\'obfuscation')
assert.doesNotMatch(tmdbEmbeddedKeySource, /api\.themoviedb\.org|Bearer/, "La clé embarquée ne doit pas contenir l'URL API en clair")
assert.match(tmdbEmbeddedKeySource, /KEY_PARTS/, 'La clé embarquée doit rester en fragments obfusqués, jamais en clair')
assert.match(tmdbModuleSource, /embedded_key::embedded_api_key/, 'La clé TMDB doit être lue depuis le module embarqué')
assert.doesNotMatch(tmdbModuleSource, /platform_secret_store|SecretService/, 'Le Trousseau ne doit plus être utilisé pour la clé TMDB')
assert.match(tmdbClientSource, /reqwest|api\.themoviedb\.org/, 'Le jalon C doit contenir le client HTTP TMDB réel')
assert.match(tmdbClientSource, /Authorization/, 'Le client TMDB doit utiliser l\'en-tête Authorization')
assert.match(tmdbClientSource, /trait TmdbClient/, 'Le client TMDB doit rester injectable pour les tests')
assert.match(tmdbModuleSource, /embedded_key/, 'La clé TMDB doit être embarquée dans le code')
assert.match(tmdbModuleSource, /pub async fn get_film_tmdb_cache/, 'La lecture bornée du cache TMDB doit être disponible')
assert.match(tmdbModuleSource, /pub async fn purge_expired_tmdb_cache/, 'La purge du cache TMDB doit être disponible')
assert.match(tmdbModuleSource, /pub fn schedule_expired_cache_purge/, 'La purge du cache TMDB doit être programmée au démarrage')
assert.match(tmdbModuleSource, /pub fn schedule_due_cache_refresh/, 'Le renouvellement automatique des caches dus doit être programmé au démarrage')
assert.match(tmdbModuleSource, /list_due_for_refresh/, 'Le renouvellement doit cibler uniquement les caches dus et non expirés')
assert.match(tmdbModuleSource, /tauri::async_runtime::spawn/, 'La purge de démarrage du cache TMDB ne doit pas bloquer l’interface')
assert.match(tmdbModuleSource, /pub async fn set_film_tmdb_poster/, 'Le choix d\'affiche persisté doit être exposé via une commande Tauri')
assert.match(tmdbModuleSource, /set_selected_poster/, 'Le choix d\'affiche doit être écrit dans le cache TMDB')
assert.match(tmdbCacheSource, /selected_poster_url = CASE/, 'Le rafraîchissement doit préserver l\'affiche choisie et la réinitialiser à la réassociation')
assert.match(tmdbCacheMigration9, /ALTER TABLE film_tmdb_cache\s+ADD COLUMN selected_poster_url/, 'La migration 9 doit ajouter la colonne d\'affiche choisie')
assert.match(tauriLibrarySource, /tmdb::set_film_tmdb_poster/, 'La commande de choix d\'affiche doit être enregistrée')
assert.match(tmdbServiceSource, /setFilmTmdbPoster/, 'La façade TypeScript doit exposer le choix d\'affiche')
assert.match(detailSource, /TmdbPosterDialog/, 'La fiche détail doit ouvrir la modale de sélection d\'affiche')
assert.match(posterDialogSource, /role="dialog"/, 'La sélection d\'affiche doit être une vraie modale accessible')
assert.match(posterDialogSource, /aria-modal="true"/, 'La modale d\'affiche doit déclarer son caractère modal')
assert.doesNotMatch(detailSource, /poster-gallery-popover/, 'L\'ancien pseudo-popover d\'affiche ne doit plus être utilisé')
assert.match(tauriLibrarySource, /tmdb::schedule_due_cache_refresh\(app\.handle\(\)\.clone\(\)\)/, 'Le démarrage Tauri doit programmer le renouvellement automatique après l’initialisation des plugins')
assert.match(tauriLibrarySource, /tmdb::get_film_tmdb_cache/, 'La commande Tauri de lecture cache TMDB doit être enregistrée')
assert.match(tauriLibrarySource, /tmdb::purge_expired_tmdb_cache/, 'La commande Tauri de purge TMDB doit être enregistrée')
assert.match(tauriLibrarySource, /tmdb::schedule_expired_cache_purge\(app\.handle\(\)\.clone\(\)\)/, 'Le démarrage Tauri doit programmer la purge après l’initialisation des plugins')

// Garde anti-commit : la clé embarquée ne doit jamais être trackée par Git.
{
  const tracked = spawnSync('git', ['ls-files', '--', 'src-tauri/src/tmdb/embedded_key.rs'], { encoding: 'utf8' })
  assert.equal(tracked.stdout.trim(), '', 'La clé embarquée ne doit jamais être trackée par Git')
  const ignored = spawnSync('git', ['check-ignore', 'src-tauri/src/tmdb/embedded_key.rs'], { encoding: 'utf8' })
  assert.equal(ignored.status, 0, 'La clé embarquée doit rester couverte par .gitignore')
  const gitignoreSource = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8')
  assert.match(gitignoreSource, /src-tauri\/src\/tmdb\/embedded_key\.rs/, 'La .gitignore doit ignorer explicitement la clé embarquée')
}
assert.match(mainSource, /requestAutomaticBackup/, 'Chaque mutation réussie doit pouvoir tenter une sauvegarde automatique non bloquante')
assert.doesNotMatch(capabilitySource, /fs:allow|dialog:allow/, 'Le frontend ne doit recevoir aucune permission générale de fichier ou de dialogue')
assert.match(capabilitySource, /sql:allow-load/, 'Tauri doit autoriser le chargement SQLite')
assert.match(capabilitySource, /sql:allow-select/, 'Tauri doit autoriser les lectures SQLite')
assert.match(capabilitySource, /sql:allow-execute/, 'Tauri doit autoriser les écritures SQLite')

// Jalon 0.4.2 — socle multi-médiums : migration, document v2, repository et import atomique.
const mediaMigration10 = readFileSync(new URL('../src-tauri/migrations/0010_create_cultural_media.sql', import.meta.url), 'utf8')
const libraryDocumentSource = readFileSync(new URL('../src/domain/libraryDocument.ts', import.meta.url), 'utf8')
const mediaRepositorySource = readFileSync(new URL('../src/data/mediaRepository.ts', import.meta.url), 'utf8')
const libraryRepositorySource = readFileSync(new URL('../src/data/libraryRepository.ts', import.meta.url), 'utf8')

assert.match(databaseMigrationSource, /0010_create_cultural_media\.sql/, 'La migration 10 doit être enregistrée dans database.rs')
assert.match(mediaMigration10, /CREATE TABLE IF NOT EXISTS series/, 'La migration 10 doit créer la table series')
assert.match(mediaMigration10, /CREATE TABLE IF NOT EXISTS books/, 'La migration 10 doit créer la table books')
assert.match(mediaMigration10, /CREATE TABLE IF NOT EXISTS book_quotes/, 'La migration 10 doit créer la table book_quotes')
assert.match(mediaMigration10, /CREATE TABLE IF NOT EXISTS games/, 'La migration 10 doit créer la table games')
assert.match(mediaMigration10, /CREATE TABLE IF NOT EXISTS artworks/, 'La migration 10 doit créer la table artworks')
assert.match(mediaMigration10, /'série télé', 'animation'/, 'La catégorie Série doit distinguer série télé et animation')
assert.match(mediaMigration10, /'livre', 'manga', 'comics'/, 'La catégorie Livre doit distinguer livre, manga et comics')
assert.match(mediaMigration10, /'à jouer', 'en cours', 'joué', 'abandonné', 'regardé'/, 'Les statuts Jeu doivent inclure regardé (let’s play)')
assert.doesNotMatch(mediaMigration10.match(/CREATE TABLE IF NOT EXISTS artworks \(([\s\S]*?)\n\);/)?.[1] ?? '', /rating/, 'La table artworks ne doit pas porter de note')
assert.match(mediaMigration10, /progress_updated_at/, 'Séries et Livres doivent porter l’horodatage interne de progression')
assert.match(mediaMigration10, /ON DELETE CASCADE/, 'Les citations doivent suivre la suppression de leur livre')
assert.match(nativePortabilitySource, /import_library_document_atomically/, 'Le pont natif doit exposer l’import atomique du document v2')
assert.match(nativePortabilitySource, /import_library_document_into_empty_profile/, 'Le pont natif doit exposer la restauration globale dans le profil courant vide')
assert.match(nativePortabilitySource, /L’import global est réservé à un profil vide/, 'Le backend doit revérifier atomiquement que le profil courant est vide')
assert.match(nativePortabilitySource, /INSERT INTO series/, 'L’import v2 doit écrire les séries')
assert.match(nativePortabilitySource, /INSERT INTO book_quotes/, 'L’import v2 doit écrire les citations')
assert.match(nativePortabilitySource, /INSERT INTO games/, 'L’import v2 doit écrire les jeux')
assert.match(nativePortabilitySource, /INSERT INTO artworks/, 'L’import v2 doit écrire les œuvres')
assert.match(tauriLibrarySource, /portability::import_library_document_atomically/, 'La commande Tauri d’import v2 doit être enregistrée')
assert.match(tauriLibrarySource, /portability::import_library_document_into_empty_profile/, 'La commande Tauri de restauration dans le profil courant doit être enregistrée')
assert.match(nativePortabilityBridgeSource, /invoke\('import_library_document_atomically'/, 'Le frontend doit appeler le pont Tauri d’import v2')
assert.match(nativePortabilityBridgeSource, /invoke\('import_library_document_into_empty_profile'/, 'Le frontend doit appeler le pont d’import global dans le profil courant vide')
assert.match(libraryDocumentSource, /'sylloge-library'/, 'Le format v2 doit être explicitement nommé sylloge-library')
assert.match(mediaRepositorySource, /resolveProgressTimestamp/, 'Le repository doit gérer l’horodatage interne de progression')
assert.doesNotMatch(libraryDocumentSource, /film_tmdb_cache|payload_json/, 'Le document v2 ne doit jamais exposer le cache TMDB')

{
  const {
    createLibraryDocument,
    serializeLibraryDocument,
    validateLibraryDocument,
  } = await import('../src/domain/libraryDocument.ts')

  const library = {
    profile: {
      id: 'profile-v2',
      name: 'Bibliothèque complète',
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:00:00.000Z',
    },
    films: [{
      id: 'film-v2',
      profileId: 'profile-v2',
      title: 'Film v2',
      originalTitle: null,
      year: 2024,
      status: 'terminé',
      isFavorite: true,
      rating: 4.5,
      watchedAt: '2026-07-01',
      personalNote: null,
      director: 'Réalisatrice',
      summary: null,
      providerName: null,
      providerId: null,
      posterUrl: null,
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:00:00.000Z',
    }],
    series: [{
      id: 'series-v2',
      profileId: 'profile-v2',
      title: 'Série v2',
      showrunner: 'Showrunner',
      casting: 'Casting',
      summary: null,
      category: 'animation',
      status: 'en cours',
      rating: 4,
      isFavorite: false,
      seasonsSeen: 3,
      seasonsTotal: 8,
      progressUpdatedAt: '2026-07-19T09:00:00.000Z',
      startedAt: '2024-05-01',
      posterUrl: null,
      personalNote: null,
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:00:00.000Z',
    }],
    books: [{
      id: 'book-v2',
      profileId: 'profile-v2',
      title: 'Manga v2',
      author: 'Mangaka',
      year: 2020,
      summary: null,
      category: 'manga',
      status: 'en cours',
      rating: null,
      isFavorite: true,
      volumesRead: 10,
      volumesTotal: 30,
      progressUpdatedAt: '2026-07-19T09:00:00.000Z',
      startedAt: '2023-01-01',
      coverUrl: null,
      personalNote: null,
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:00:00.000Z',
      quotes: [{
        id: 'quote-v2',
        bookId: 'book-v2',
        body: 'Citation mémorable',
        position: 0,
        createdAt: '2026-07-19T10:00:00.000Z',
      }],
    }],
    games: [{
      id: 'game-v2',
      profileId: 'profile-v2',
      title: 'Jeu v2',
      developer: 'Studio',
      platform: 'Dreamcast',
      year: 2001,
      status: 'joué',
      rating: 3.5,
      isFavorite: false,
      playedAt: '2026-02-01',
      coverUrl: null,
      personalNote: null,
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:00:00.000Z',
    }],
    artworks: [{
      id: 'artwork-v2',
      profileId: 'profile-v2',
      title: 'Œuvre v2',
      artist: 'Artiste',
      year: 1889,
      form: 'peinture',
      location: 'Musée d’Orsay',
      exhibition: null,
      status: 'découverte',
      isFavorite: true,
      discoveredAt: '2026-06-15',
      imageUrl: null,
      personalNote: 'Vu en famille',
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:00:00.000Z',
    }],
  }

  const document = createLibraryDocument(library, '2026-07-19T12:00:00.000Z')
  assert.equal(document.format, 'sylloge-library', 'Le document doit porter le format v2')
  assert.equal(document.version, 2, 'Le document doit porter la version 2')

  const serialized = serializeLibraryDocument(document)
  const preview = validateLibraryDocument(serialized)
  assert.equal(preview.errors.length, 0, `Un aller-retour v2 doit être valide : ${JSON.stringify(preview.errors)}`)
  assert.deepEqual(preview.counts, { films: 1, series: 1, books: 1, games: 1, artworks: 1 }, 'Les compteurs doivent refléter chaque collection')
  assert.equal(preview.document?.series[0]?.category, 'animation', 'La catégorie Série doit survivre à l’aller-retour')
  assert.equal(preview.document?.books[0]?.quotes[0]?.body, 'Citation mémorable', 'Les citations doivent survivre à l’aller-retour')
  assert.equal(preview.document?.games[0]?.platform, 'Dreamcast', 'La plateforme libre doit survivre à l’aller-retour')
  assert.equal(parseFilmsCollectionJson(serialized).items?.[0]?.title, 'Film v2', 'L’import unitaire Films doit accepter un document v2')
  assert.equal(parseSeriesCollectionJson(serialized).items?.[0]?.title, 'Série v2', 'L’import unitaire Séries doit accepter un document v2')
  assert.equal(parseBooksCollectionJson(serialized).items?.[0]?.quotes[0]?.body, 'Citation mémorable', 'L’import unitaire Livres doit conserver les citations du document v2')

  const v1Document = JSON.stringify({
    format: 'sylloge-films',
    version: 1,
    exportedAt: '2026-07-19T12:00:00.000Z',
    profile: library.profile,
    films: library.films,
  })
  const v1Preview = validateLibraryDocument(v1Document)
  assert.equal(v1Preview.document, null, 'Un document v1 doit être refusé par le validateur v2')
  assert.equal(parseFilmsCollectionJson(v1Document).items?.[0]?.title, 'Film v2', 'L’import unitaire Films doit rester compatible avec un JSON Films v1')
  assert.equal(parseSeriesCollectionJson(v1Document).items, null, 'Un JSON Films v1 ne doit jamais être interprété comme un import Séries')
  assert.equal(parseBooksCollectionJson(v1Document).items, null, 'Un JSON Films v1 ne doit jamais être interprété comme un import Livres')

  const invalidSeries = JSON.parse(serialized)
  invalidSeries.series[0].seasonsSeen = 12
  const invalidPreview = validateLibraryDocument(JSON.stringify(invalidSeries))
  assert.equal(invalidPreview.document, null, 'Une progression incohérente doit bloquer le document')
  assert.ok(invalidPreview.errors.some((error) => error.path.includes('seasonsSeen')), 'L’erreur doit cibler la progression invalide')

  const duplicateId = JSON.parse(serialized)
  duplicateId.games[0].id = duplicateId.films[0].id
  const duplicatePreview = validateLibraryDocument(JSON.stringify(duplicateId))
  assert.equal(duplicatePreview.document, null, 'Un identifiant partagé entre médiums doit bloquer le document')
}

{
  const { SqliteMediaRepository } = await import('../src/data/mediaRepository.ts')

  const seriesRow = {
    id: 'series-1',
    profile_id: 'default',
    title: 'Série stockée',
    showrunner: null,
    casting: null,
    summary: null,
    category: 'série télé',
    status: 'en cours',
    rating: null,
    is_favorite: 0,
    seasons_seen: 2,
    seasons_total: 5,
    progress_updated_at: '2026-07-18T10:00:00.000Z',
    started_at: '2024-01-01',
    poster_url: null,
    personal_note: null,
    created_at: '2026-07-18T10:00:00.000Z',
    updated_at: '2026-07-18T10:00:00.000Z',
  }

  const database = {
    series: [seriesRow],
    books: [],
    quotes: [],
    async select(query, bindValues) {
      if (query.includes('FROM series')) {
        if (query.includes('WHERE id = $1')) return this.series.filter((row) => row.id === bindValues[0])
        return [...this.series]
      }
      if (query.includes('FROM book_quotes')) return [...this.quotes]
      if (query.includes('FROM books')) return [...this.books]
      throw new Error(`Requête inattendue dans la vérification : ${query}`)
    },
    async execute(query, bindValues) {
      if (query.includes('UPDATE series')) {
        const updatedAt = bindValues[14]
        const progressUpdatedAt = bindValues[10]
        const row = this.series.find((value) => value.id === bindValues[15])
        if (!row) return { rowsAffected: 0 }
        row.seasons_seen = bindValues[8]
        row.progress_updated_at = progressUpdatedAt
        row.updated_at = updatedAt
        return { rowsAffected: 1 }
      }
      throw new Error(`Écriture inattendue dans la vérification : ${query}`)
    },
  }

  let clock = 0
  const repository = new SqliteMediaRepository(
    async () => database,
    () => `generated-${clock}`,
    () => `2026-07-19T12:00:0${clock}.000Z`,
  )

  const loaded = await repository.getSeries('default', 'series-1')
  assert.equal(loaded?.category, 'série télé', 'Le repository doit mapper la catégorie Série')
  assert.equal(loaded?.progressUpdatedAt, '2026-07-18T10:00:00.000Z', 'L’horodatage de progression doit être lu')

  clock = 1
  await repository.updateSeries('default', 'series-1', {
    title: loaded.title,
    showrunner: loaded.showrunner,
    casting: loaded.casting,
    summary: loaded.summary,
    category: loaded.category,
    status: loaded.status,
    rating: loaded.rating,
    isFavorite: loaded.isFavorite,
    seasonsSeen: 2,
    seasonsTotal: loaded.seasonsTotal,
    startedAt: loaded.startedAt,
    posterUrl: loaded.posterUrl,
    personalNote: loaded.personalNote,
  })
  assert.equal(database.series[0].progress_updated_at, '2026-07-18T10:00:00.000Z', 'Une modification sans progression ne doit pas rafraîchir l’horodatage interne')

  clock = 2
  await repository.updateSeries('default', 'series-1', {
    title: loaded.title,
    showrunner: loaded.showrunner,
    casting: loaded.casting,
    summary: loaded.summary,
    category: loaded.category,
    status: loaded.status,
    rating: loaded.rating,
    isFavorite: loaded.isFavorite,
    seasonsSeen: 3,
    seasonsTotal: loaded.seasonsTotal,
    startedAt: loaded.startedAt,
    posterUrl: loaded.posterUrl,
    personalNote: loaded.personalNote,
  })
  assert.equal(database.series[0].progress_updated_at, '2026-07-19T12:00:02.000Z', 'Une saison supplémentaire doit rafraîchir l’horodatage interne de progression')
}

{
  const { SqliteLibraryRepository } = await import('../src/data/libraryRepository.ts')

  const document = {
    format: 'sylloge-library',
    version: 2,
    exportedAt: '2026-07-19T12:00:00.000Z',
    profile: {
      id: 'legacy-profile',
      name: 'Import complet',
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:00:00.000Z',
    },
    films: [],
    series: [],
    books: [{
      id: 'legacy-book',
      profileId: 'legacy-profile',
      title: 'Livre importé',
      author: null,
      year: null,
      summary: null,
      category: 'livre',
      status: 'lu',
      rating: 5,
      isFavorite: true,
      volumesRead: null,
      volumesTotal: null,
      progressUpdatedAt: null,
      startedAt: '2025-03-01',
      coverUrl: null,
      personalNote: null,
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:00:00.000Z',
      quotes: [
        { id: 'legacy-quote-1', bookId: 'legacy-book', body: 'Première citation', position: 0, createdAt: '2026-07-19T10:00:00.000Z' },
        { id: 'legacy-quote-2', bookId: 'legacy-book', body: 'Seconde citation', position: 1, createdAt: '2026-07-19T10:00:00.000Z' },
      ],
    }],
    games: [],
    artworks: [],
  }

  let capturedPayload = null
  let idSequence = 0
  const repository = new SqliteLibraryRepository(
    async () => {
      throw new Error('Aucune lecture attendue avant le rechargement final')
    },
    () => `fresh-${idSequence++}`,
    () => '2026-07-19T12:30:00.000Z',
    async (payload) => {
      capturedPayload = payload
      return {
        profileId: payload.profile.id,
        filmCount: payload.films.length,
        seriesCount: payload.series.length,
        bookCount: payload.books.length,
        gameCount: payload.games.length,
        artworkCount: payload.artworks.length,
      }
    },
  )

  repository.loadLibrary = async (profileId) => {
    assert.equal(profileId, capturedPayload.profile.id, 'Le rechargement doit cibler le nouveau profil')
    return {
      profile: capturedPayload.profile,
      films: capturedPayload.films,
      series: capturedPayload.series,
      books: capturedPayload.books,
      games: capturedPayload.games,
      artworks: capturedPayload.artworks,
    }
  }

  const imported = await repository.importLibraryDocument(document)
  assert.notEqual(capturedPayload.profile.id, 'legacy-profile', 'L’import doit créer un profil neuf')
  assert.equal(capturedPayload.books[0].profileId, capturedPayload.profile.id, 'Chaque élément doit cibler le nouveau profil')
  assert.notEqual(capturedPayload.books[0].id, 'legacy-book', 'Les identifiants doivent être régénérés')
  assert.equal(capturedPayload.books[0].quotes.length, 2, 'Les citations doivent être importées avec leur livre')
  for (const quote of capturedPayload.books[0].quotes) {
    assert.equal(quote.bookId, capturedPayload.books[0].id, 'Chaque citation doit être rattachée au livre régénéré')
    assert.notEqual(quote.id.startsWith('legacy-'), true, 'Les identifiants de citation doivent être régénérés')
  }
  assert.equal(imported.books[0].title, 'Livre importé', 'L’import doit recharger la bibliothèque créée')
}

assert.match(libraryRepositorySource, /importLibraryDocumentAtomically/, 'Le repository de bibliothèque doit passer par l’import atomique natif')
assert.match(libraryRepositorySource, /createId\(\)/, 'L’import v2 doit régénérer les identifiants dans le nouveau profil')

// Jalon 0.4.3 — Séries : saisie manuelle, compteur de saisons et bascule Vue ↔ En cours.
const seriesFormDomainSource = readFileSync(new URL('../src/domain/seriesForm.ts', import.meta.url), 'utf8')
const seriesFormSource = readFileSync(new URL('../src/components/SeriesForm.tsx', import.meta.url), 'utf8')
const seriesDetailSource = readFileSync(new URL('../src/components/SeriesDetail.tsx', import.meta.url), 'utf8')
const stepperSource = readFileSync(new URL('../src/components/Stepper.tsx', import.meta.url), 'utf8')
const mainSource043 = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')

assert.match(seriesFormDomainSource, /resolveSeriesStatusForTotalChange/, 'La bascule Vue → En cours à nouvelle saison doit vivre dans le domaine')
assert.match(seriesFormDomainSource, /values\.status === 'vue' && seasonsTotal !== null/, 'Marquer « vue » doit aligner les saisons vues sur le total')
assert.match(seriesFormSource, /resolveSeriesStatusForTotalChange/, 'Le formulaire doit appliquer la bascule à la modification du total')
assert.match(seriesFormSource, /next\.seasonsSeen = current\.seasonsTotal/, 'Marquer « vue » doit préremplir les saisons vues')
assert.match(seriesFormSource, /<Stepper/, 'Le compteur de saisons doit utiliser les boutons +/−, pas un champ numérique brut')
assert.match(stepperSource, /aria-label=\{`Ajouter 1 à \$\{label\}`\}/, 'Le bouton + doit rester accessible')
assert.match(stepperSource, /aria-label=\{`Retirer 1 à \$\{label\}`\}/, 'Le bouton − doit rester accessible')
assert.match(seriesDetailSource, /saison/, 'La fiche doit afficher l’avancement en saisons')
assert.match(mainSource043, /icon\('series'\)\} Séries/, 'La sidebar doit proposer l’entrée Séries')
assert.match(mainSource043, /label: 'Catégorie'/, 'La bibliothèque Séries doit offrir le filtre par catégorie')
assert.match(mainSource043, /searchSeries/, 'La recherche Séries doit reposer sur le repository')
assert.match(mediaRepositorySource, /searchSeries/, 'Le repository doit exposer la recherche Séries')
assert.match(mediaRepositorySource, /librarySortOrderBy\(criteria\.sort, SERIES_QUERY_COLUMNS\)/, 'Le tri Séries doit reposer sur les colonnes documentées du médium')

{
  const {
    EMPTY_SERIES_FORM,
    resolveSeriesStatusForTotalChange,
    validateSeriesForm,
  } = await import('../src/domain/seriesForm.ts')

  const base = { ...EMPTY_SERIES_FORM, title: 'Série de test' }

  const minimal = validateSeriesForm(base)
  assert.equal(minimal.success, true, 'Un titre seul doit suffire à enregistrer une série')

  const noTitle = validateSeriesForm({ ...base, title: '   ' })
  assert.equal(noTitle.success, false, 'Le titre reste obligatoire')

  const markedSeen = validateSeriesForm({ ...base, status: 'vue', seasonsTotal: '8' })
  assert.equal(markedSeen.success, true)
  assert.equal(markedSeen.data.seasonsSeen, 8, 'Marquer « vue » doit aligner les saisons vues sur le total')

  const seenWithoutTotal = validateSeriesForm({ ...base, status: 'vue', seasonsSeen: '3' })
  assert.equal(seenWithoutTotal.success, false, 'Marquer « vue » sans total connu doit être expliqué')

  const overflow = validateSeriesForm({ ...base, status: 'en cours', seasonsSeen: '9', seasonsTotal: '8' })
  assert.equal(overflow.success, false, 'Les saisons vues ne peuvent pas dépasser le total')
  assert.ok(overflow.errors.seasonsSeen, 'L’erreur doit cibler les saisons vues')

  assert.equal(
    resolveSeriesStatusForTotalChange('vue', 8, 8),
    'vue',
    'Une série à jour reste vue',
  )
  assert.equal(
    resolveSeriesStatusForTotalChange('vue', 8, 9),
    'en cours',
    'Une nouvelle saison fait repasser une série vue en cours',
  )
  assert.equal(
    resolveSeriesStatusForTotalChange('en cours', 3, 9),
    'en cours',
    'Une série en cours ne change pas de statut à nouvelle saison',
  )

  const badRating = validateSeriesForm({ ...base, status: 'en cours', rating: '4.3' })
  assert.equal(badRating.success, false, 'La note doit rester par demi-points')

  const badPoster = validateSeriesForm({ ...base, posterUrl: 'ftp://affiche.jpg' })
  assert.equal(badPoster.success, false, 'L’affiche doit rester une URL http(s)')

  // 0.6.13 : retour en « à voir » = purge du verdict personnel.
  const purgedSeries = validateSeriesForm({
    ...base,
    status: 'à voir',
    rating: '4',
    isFavorite: true,
    seasonsSeen: '3',
    seasonsTotal: '8',
    startedAt: '2026-08-01',
    personalNote: 'Avis à purger',
  })
  assert.equal(purgedSeries.success, true, 'La série watchlist purgée doit rester valide')
  if (purgedSeries.success) {
    assert.equal(purgedSeries.data.rating, null, 'La note est purgée en « à voir »')
    assert.equal(purgedSeries.data.isFavorite, false, 'Le coup de cœur est purgé')
    assert.equal(purgedSeries.data.seasonsSeen, null, 'La progression est purgée')
    assert.equal(purgedSeries.data.startedAt, null, 'La date de début est purgée')
    assert.equal(purgedSeries.data.personalNote, null, "L'avis est purgé")
  }
}

{
  const { SqliteMediaRepository } = await import('../src/data/mediaRepository.ts')

  const calls = []
  const database = {
    async select(query, bindValues) {
      calls.push({ query, bindValues })
      return []
    },
    async execute() {
      throw new Error('Aucune écriture attendue pendant la recherche')
    },
  }
  const repository = new SqliteMediaRepository(async () => database)

  await repository.searchSeries('default', { query: '', category: 'all', sort: { column: 'title', direction: 'asc' } })
  const globalQuery = calls.at(-1).query
  assert.ok(!globalQuery.includes('category = $'), 'La recherche globale ne doit pas filtrer par catégorie')
  assert.match(globalQuery, /ORDER BY title COLLATE NOCASE ASC, created_at ASC/, 'Le tri par titre doit être canonique')

  await repository.searchSeries('default', { query: '', category: 'all', sort: { column: 'recency', direction: 'desc' } })
  assert.match(calls.at(-1).query, /COALESCE\(progress_updated_at, updated_at\) DESC/, 'Le tri récent doit suivre la progression interne')

  await repository.searchSeries('default', { query: '', category: 'animation', sort: { column: 'title', direction: 'asc' } })
  const animationQuery = calls.at(-1)
  assert.match(animationQuery.query, /category = \$\d+/, 'Le filtre animation doit filtrer la catégorie')
  assert.deepEqual(animationQuery.bindValues, ['default', 'animation'], 'Le filtre animation doit lier la catégorie demandée')

  await repository.searchSeries('default', { query: 'lupin', category: 'série télé', sort: { column: 'title', direction: 'asc' } })
  const searchCall = calls.at(-1)
  assert.match(searchCall.query, /showrunner COLLATE NOCASE LIKE/, 'La recherche doit couvrir le showrunner')
  assert.match(searchCall.query, /casting COLLATE NOCASE LIKE/, 'La recherche doit couvrir le casting')
  assert.deepEqual(searchCall.bindValues, ['default', '%lupin%', 'série télé'], 'La recherche doit lier requête et catégorie')
}

// Jalon 0.4.5 — Livres : saisie manuelle, tomes et citations personnelles.
const bookFormDomainSource = readFileSync(new URL('../src/domain/bookForm.ts', import.meta.url), 'utf8')
const bookFormSource = readFileSync(new URL('../src/components/BookForm.tsx', import.meta.url), 'utf8')
const bookDetailSource = readFileSync(new URL('../src/components/BookDetail.tsx', import.meta.url), 'utf8')
const mainSource045 = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
const nativeBooksSource = readFileSync(new URL('../src/data/nativeBooks.ts', import.meta.url), 'utf8')
const rustBooksSource = readFileSync(new URL('../src-tauri/src/books.rs', import.meta.url), 'utf8')

assert.match(bookFormDomainSource, /resolveBookStatusForTotalChange/, 'La bascule Lu → En cours à nouveau tome doit vivre dans le domaine')
assert.match(bookFormSource, /<Stepper/, 'Le compteur de tomes Manga et Comics doit utiliser les boutons +/−')
assert.match(bookFormSource, /Ajouter une citation/, 'Le formulaire doit permettre plusieurs citations personnelles')
assert.match(bookDetailSource, /<details className="quotes-section"/, 'La fiche doit afficher les citations dans un espace escamotable')
assert.match(mainSource045, /icon\('book'\)\} Livres/, 'La sidebar doit proposer l’entrée Livres')
assert.match(mainSource045, /mediaRepository\.listBooks/, 'La collection Livres doit être relue depuis SQLite')
assert.match(nativeBooksSource, /create_book_atomically/, 'La création Livre et ses citations doit passer par une commande native atomique')
assert.match(nativeBooksSource, /update_book_atomically/, 'La modification Livre et ses citations doit passer par une commande native atomique')
assert.match(nativeBooksSource, /delete_book_atomically/, 'La suppression Livre et ses citations doit passer par une commande native atomique')
assert.match(rustBooksSource, /pool\s*\.begin\(\)/, 'Les écritures Livres doivent ouvrir une transaction SQLite native')
assert.match(rustBooksSource, /create_book_and_quotes_is_atomic/, 'Une preuve Rust doit couvrir le rollback de création')
assert.match(rustBooksSource, /update_book_and_quotes_is_atomic/, 'Une preuve Rust doit couvrir le rollback de modification')

{
  const {
    EMPTY_BOOK_FORM,
    resolveBookStatusForTotalChange,
    validateBookForm,
  } = await import('../src/domain/bookForm.ts')

  const base = { ...EMPTY_BOOK_FORM, title: 'Livre de test' }
  const minimal = validateBookForm(base)
  assert.equal(minimal.success, true, 'Un titre seul doit suffire à enregistrer un livre')

  const noTitle = validateBookForm({ ...base, title: '   ' })
  assert.equal(noTitle.success, false, 'Le titre reste obligatoire')

  const completedManga = validateBookForm({
    ...base,
    category: 'manga',
    status: 'lu',
    volumesTotal: '12',
  })
  assert.equal(completedManga.success, true)
  assert.equal(completedManga.data.volumesRead, 12, 'Marquer un manga « lu » doit aligner les tomes lus sur le total')

  const overflow = validateBookForm({
    ...base,
    category: 'comics',
    status: 'en cours',
    volumesRead: '13',
    volumesTotal: '12',
  })
  assert.equal(overflow.success, false, 'Les tomes lus ne peuvent pas dépasser le total')
  assert.ok(overflow.errors.volumesRead, 'L’erreur doit cibler les tomes lus')

  const simpleBook = validateBookForm({
    ...base,
    category: 'livre',
    volumesRead: '2',
    volumesTotal: '3',
  })
  assert.equal(simpleBook.success, true)
  assert.equal(simpleBook.data.volumesRead, null, 'Un livre simple ne doit pas persister un compteur de tomes masqué')
  assert.equal(simpleBook.data.volumesTotal, null, 'Un livre simple ne doit pas persister un total de tomes masqué')

  assert.equal(resolveBookStatusForTotalChange('lu', 12, 13), 'en cours', 'Un nouveau tome fait repasser une œuvre lue en cours')
  assert.equal(resolveBookStatusForTotalChange('lu', 12, 12), 'lu', 'Une œuvre à jour reste lue')

  const quotes = validateBookForm({
    ...base,
    quotes: ['  Première citation  ', '   ', 'Seconde citation'],
  })
  assert.equal(quotes.success, true)
  assert.deepEqual(quotes.data.quotes, ['Première citation', 'Seconde citation'], 'Les citations doivent être ordonnées, nettoyées et les lignes vides ignorées')

  const badRating = validateBookForm({ ...base, status: 'lu', rating: '4.3' })
  assert.equal(badRating.success, false, 'La note doit rester par demi-points')

  const badCover = validateBookForm({ ...base, coverUrl: 'file:///couverture.jpg' })
  assert.equal(badCover.success, false, 'La couverture doit rester une URL http(s)')

  // 0.6.13 : retour en « à lire » = purge du verdict personnel.
  const purgedBook = validateBookForm({
    ...base,
    status: 'à lire',
    category: 'manga',
    volumesTotal: '12',
    rating: '4',
    isFavorite: true,
    volumesRead: '5',
    startedAt: '2026-08-01',
    personalNote: 'Avis à purger',
  })
  assert.equal(purgedBook.success, true, 'Le livre watchlist purgé doit rester valide')
  if (purgedBook.success) {
    assert.equal(purgedBook.data.rating, null, 'La note est purgée en « à lire »')
    assert.equal(purgedBook.data.isFavorite, false, 'Le coup de cœur est purgé')
    assert.equal(purgedBook.data.volumesRead, null, 'La progression est purgée')
    assert.equal(purgedBook.data.startedAt, null, 'La date de début est purgée')
    assert.equal(purgedBook.data.personalNote, null, "L'avis est purgé")
  }
}

// Jalon 0.4.6 — Livres : recherche, vues et portabilité dédiée.
{
  const { planBookMerge, resolveBookMerge } = await import('../src/domain/importMerge.ts')
  const timestamp = '2026-07-22T10:00:00.000Z'
  const existingBook = {
    id: 'book-local',
    profileId: 'default',
    title: "L'Étranger",
    author: null,
    year: null,
    summary: null,
    category: 'livre',
    status: 'lu',
    rating: 5,
    isFavorite: true,
    volumesRead: null,
    volumesTotal: null,
    progressUpdatedAt: null,
    startedAt: '2026-07-01',
    coverUrl: null,
    personalNote: 'Avis personnel très long — ligne 1.\nLigne 2 conservée avec ses accents.',
    createdAt: timestamp,
    updatedAt: timestamp,
    quotes: [{ id: 'quote-local', bookId: 'book-local', body: 'Citation locale préférée.', position: 0, createdAt: timestamp }],
  }
  const importedBook = {
    ...existingBook,
    id: 'book-imported',
    profileId: 'source-profile',
    title: "l'etranger",
    author: 'Albert Camus',
    year: 1942,
    summary: 'Résumé éditorial — caractères préservés.',
    status: 'à lire',
    rating: null,
    isFavorite: false,
    startedAt: null,
    coverUrl: 'https://example.invalid/couverture-étranger.jpg',
    personalNote: null,
    quotes: [{ id: 'quote-imported', bookId: 'book-imported', body: 'Citation importée.', position: 0, createdAt: timestamp }],
  }

  const plan = planBookMerge([existingBook], [importedBook])
  assert.equal(plan.duplicates.length, 1, 'La fusion Livres doit détecter les doublons sans tenir compte de la casse ni des accents')
  const keepExisting = resolveBookMerge([], plan, new Map([["l'etranger", 'keep-existing']]), timestamp).updates[0]
  assert.equal(keepExisting.author, 'Albert Camus', 'L’import doit compléter un auteur local vide')
  assert.equal(keepExisting.summary, importedBook.summary, 'L’import doit compléter un résumé local vide sans altérer ses caractères')
  assert.equal(keepExisting.rating, 5, 'La note personnelle locale doit rester prioritaire')
  assert.equal(keepExisting.personalNote, existingBook.personalNote, 'L’avis long local doit rester prioritaire')
  assert.deepEqual(keepExisting.quotes, existingBook.quotes, 'Les citations locales doivent rester prioritaires si la fiche locale est conservée')

  const keepImported = resolveBookMerge([], plan, new Map([["l'etranger", 'keep-imported']]), timestamp).updates[0]
  assert.equal(keepImported.id, 'book-local', 'Conserver la fiche importée doit préserver l’identité SQLite locale')
  assert.equal(keepImported.quotes[0].bookId, 'book-local', 'Les citations importées doivent être rattachées à l’identité locale conservée')

  const dedicatedDocument = createLibraryDocument({
    profile: {
      id: 'default',
      name: 'Profil Livres',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    films: [],
    series: [],
    books: [existingBook],
    games: [],
    artworks: [],
  }, timestamp)
  const dedicatedPreview = validateLibraryDocument(serializeLibraryDocument(dedicatedDocument))
  assert.deepEqual(dedicatedPreview.document?.books[0], existingBook, 'L’export JSON Livre dédié doit préserver accents, retours à la ligne, avis et citations')

  const calls = []
  const bookRow = {
    id: 'book-search',
    profile_id: 'default',
    title: 'Poésie à Montréal',
    author: 'Élodie Test',
    year: 2026,
    summary: 'Résumé local',
    category: 'livre',
    status: 'lu',
    rating: 4.5,
    is_favorite: 1,
    volumes_read: null,
    volumes_total: null,
    progress_updated_at: timestamp,
    started_at: '2026-07-01',
    cover_url: null,
    personal_note: 'Note longue',
    created_at: timestamp,
    updated_at: timestamp,
  }
  const repository = new (await import('../src/data/mediaRepository.ts')).SqliteMediaRepository(async () => ({
    async select(query, bindValues) {
      calls.push({ query, bindValues })
      if (query.includes('FROM book_quotes')) {
        return [{ id: 'quote-search', book_id: 'book-search', body: 'Vers préservé', position: 0, created_at: timestamp }]
      }
      if (query.includes('FROM books')) return [bookRow]
      throw new Error(`Requête inattendue : ${query}`)
    },
    async execute() {
      throw new Error('Aucune écriture attendue pendant la recherche Livres')
    },
  }))
  const searched = await repository.searchBooks('default', { query: '  Élodie  ', category: 'livre', sort: { column: 'recency', direction: 'desc' } })
  assert.equal(searched[0].quotes[0].body, 'Vers préservé', 'La recherche doit restituer les citations de la fiche trouvée')
  assert.match(calls[0].query, /author COLLATE NOCASE LIKE/, 'La recherche Livres doit couvrir l’auteur')
  assert.match(calls[0].query, /summary COLLATE NOCASE LIKE/, 'La recherche Livres doit couvrir le résumé')
  assert.match(calls[0].query, /COALESCE\(progress_updated_at, updated_at\) DESC/, 'La vue Livres récente doit suivre la progression interne')
  assert.deepEqual(calls[0].bindValues, ['default', '%Élodie%', 'livre'], 'La recherche et la catégorie doivent être paramétrées')

  const snapshots = []
  const backup = new BackupService({
    async getBackupSettings() { return null },
    async pickBackupDirectory() { return null },
    async clearBackupSettings() {},
    async saveManualBackupSnapshot() { throw new Error('Snapshot manuel non attendu') },
    async saveAutomaticBackupSnapshot(profileId, contents, automaticDay) {
      snapshots.push({ profileId, contents, automaticDay })
      return { outcome: 'saved', fileName: 'snapshot-livres.json' }
    },
  }, () => new Date(2026, 6, 22, 12, 0, 0), async () => ({
    profile: dedicatedDocument.profile,
    films: [],
    series: [],
    books: [existingBook],
    games: [],
    artworks: [],
  }))
  await backup.tryAutomaticSnapshot({ profile: dedicatedDocument.profile, films: [] })
  assert.deepEqual(
    validateLibraryDocument(snapshots[0].contents).document?.books[0],
    existingBook,
    'Le snapshot global doit inclure fidèlement les Livres et leurs citations',
  )
}

assert.match(mainSource045, /BOOK_CATEGORIES\.map/, 'La bibliothèque Livres doit offrir le filtre Livre, Manga et Comics')
assert.match(mainSource045, /searchBooks/, 'La recherche Livres doit reposer sur le repository SQLite')
assert.match(mainSource045, /kind="books"/, 'La bibliothèque Livres doit proposer son import unitaire')
assert.match(mainSource045, /LibraryExportFlow kind="books"/, 'La bibliothèque Livres doit proposer son export dédié')
assert.match(mediaRepositorySource, /async searchBooks/, 'Le repository doit exposer la recherche Livres')
assert.match(libraryImportButtonSource, /parseBooksCollectionJson/, 'L’assistant Livres doit valider le document JSON v2 avant écriture')
assert.match(nativePortabilityBridgeSource, /invoke\('import_books_into_profile'/, 'Le frontend doit appeler le pont Tauri d’import Livres')
assert.match(nativePortabilitySource, /pub async fn import_books_into_profile/, 'Le backend doit exposer l’import Livres atomique')
assert.match(nativePortabilitySource, /books_collection_import_is_atomic_with_quotes/, 'Une preuve Rust doit couvrir le rollback d’un import Livres avec citations')
assert.match(tauriLibrarySource, /portability::import_books_into_profile/, 'La commande Tauri d’import Livres doit être enregistrée')
assert.match(posterSource, /label = 'Affiche'/, 'Le fallback visuel doit accepter un libellé propre au médium')
assert.match(mainSource045, /label="Couverture"/, 'Les cartes Livres doivent annoncer une couverture, pas une affiche de film')

// Jalon 0.4.7 — Jeux : verticale bornée, plateforme libre et CRUD local.
const gameDomainSource = readFileSync(new URL('../src/domain/game.ts', import.meta.url), 'utf8')
const gameFormSource = readFileSync(new URL('../src/components/GameForm.tsx', import.meta.url), 'utf8')
const gameDetailSource = readFileSync(new URL('../src/components/GameDetail.tsx', import.meta.url), 'utf8')
const mainSource047 = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')

assert.match(mainSource047, /icon\('game'\)\} Jeux/, 'La sidebar doit proposer l’entrée Jeux')
assert.match(mainSource047, /mediaRepository\.listGames/, 'La collection Jeux doit être relue depuis SQLite')
assert.match(mainSource047, /mediaRepository\.createGame/, 'La création Jeu doit écrire dans le repository SQLite')
assert.match(mainSource047, /mediaRepository\.updateGame/, 'La modification Jeu doit écrire dans le repository SQLite')
assert.match(mainSource047, /mediaRepository\.deleteGame/, 'La suppression Jeu doit écrire dans le repository SQLite')
assert.match(gameDomainSource, /DEFAULT_GAME_PLATFORMS/, 'Le domaine doit proposer un socle sobre de plateformes')
assert.match(gameFormSource, /list="game-platform-suggestions"/, 'La plateforme doit rester une saisie libre enrichie de suggestions')
assert.match(gameDetailSource, /GAME_STATUS_LABELS/, 'La fiche Jeu doit afficher les statuts propres à la verticale')
assert.doesNotMatch(gameFormSource, /temps de jeu|sessions? de jeu/i, 'Le formulaire Jeux ne doit introduire aucun tracker de temps ou de sessions')

{
  const { EMPTY_GAME_FORM, validateGameForm } = await import('../src/domain/gameForm.ts')
  const { buildGamePlatformFilters, buildGamePlatformSuggestions } = await import('../src/domain/game.ts')

  const minimal = validateGameForm({ ...EMPTY_GAME_FORM, title: '  Jeu minimal  ' })
  assert.equal(minimal.success, true, 'Un titre seul doit suffire à enregistrer un jeu')
  assert.deepEqual(minimal.data, {
    title: 'Jeu minimal',
    developer: null,
    platform: null,
    year: null,
    status: 'à jouer',
    rating: null,
    isFavorite: false,
    playedAt: null,
    coverUrl: null,
    personalNote: null,
  }, 'Les champs Jeu facultatifs vides doivent rester null sans donnée inventée')

  const complete = validateGameForm({
    ...EMPTY_GAME_FORM,
    title: 'Jeu complet',
    developer: '  Studio local  ',
    platform: '  Steam Deck  ',
    year: '2026',
    status: 'joué',
    rating: '4.5',
    isFavorite: true,
    playedAt: '2026-07-22',
    coverUrl: 'https://example.invalid/jeu.jpg',
    personalNote: '  Avis personnel  ',
  })
  assert.equal(complete.success, true, 'Tous les champs Jeu contractuels valides doivent être acceptés')
  assert.equal(complete.data.platform, 'Steam Deck', 'La plateforme libre doit être normalisée sans être remplacée')
  assert.equal(complete.data.status, 'joué', 'Le statut Joué couvre le suivi réel du jeu')

  for (const values of [
    { title: '   ' },
    { title: 'Statut', status: 'inconnu' },
    { title: 'Année', year: '0' },
    { title: 'Note', status: 'joué', rating: '4.3' },
    { title: 'Date', status: 'joué', playedAt: '2026-02-30' },
    { title: 'Couverture', coverUrl: 'file:///jeu.jpg' },
  ]) {
    assert.equal(
      validateGameForm({ ...EMPTY_GAME_FORM, ...values }).success,
      false,
      `Le formulaire Jeu doit refuser la saisie invalide ${JSON.stringify(values)}`,
    )
  }

  // 0.6.13 : retour en « à jouer » = purge du verdict personnel.
  const purgedGame = validateGameForm({
    ...EMPTY_GAME_FORM,
    title: 'Retour en watchlist',
    status: 'à jouer',
    rating: '4',
    isFavorite: true,
    playedAt: '2026-08-24',
    personalNote: 'Avis à purger',
  })
  assert.equal(purgedGame.success, true, 'Le jeu watchlist purgé doit rester valide')
  if (purgedGame.success) {
    assert.equal(purgedGame.data.rating, null, 'La note est purgée en « à jouer »')
    assert.equal(purgedGame.data.isFavorite, false, 'Le coup de cœur est purgé')
    assert.equal(purgedGame.data.playedAt, null, 'La date de partie est purgée')
    assert.equal(purgedGame.data.personalNote, null, "L'avis est purgé")
  }

  const suggestions = buildGamePlatformSuggestions([
    { platform: 'Steam Deck' },
    { platform: ' pc ' },
  ])
  assert.ok(suggestions.includes('PC'), 'PC doit faire partie des suggestions initiales')
  assert.ok(suggestions.includes('Steam Deck'), 'Une plateforme libre déjà enregistrée doit devenir une suggestion')
  assert.equal(suggestions.filter((platform) => platform.toLocaleLowerCase('fr') === 'pc').length, 1, 'Les suggestions doivent éviter les doublons de casse')
  assert.deepEqual(
    buildGamePlatformFilters([{ platform: 'Steam Deck' }, { platform: 'steam deck' }, { platform: null }]),
    ['Steam Deck'],
    'Les filtres doivent proposer seulement les plateformes réellement présentes, sans doublon de casse',
  )
}

{
  const { SqliteMediaRepository } = await import('../src/data/mediaRepository.ts')
  const timestamp = '2026-07-22T14:00:00.000Z'
  const gameRow = {
    id: 'game-local',
    profile_id: 'default',
    title: 'Jeu SQLite',
    developer: 'Studio local',
    platform: 'PC',
    year: 2026,
    status: 'en cours',
    rating: 4.5,
    is_favorite: 1,
    played_at: '2026-07-22',
    cover_url: null,
    personal_note: 'Avis local',
    created_at: timestamp,
    updated_at: timestamp,
  }
  const calls = []
  const database = {
    async select(query, bindValues) {
      calls.push({ kind: 'select', query, bindValues })
      return [gameRow]
    },
    async execute(query, bindValues) {
      calls.push({ kind: 'execute', query, bindValues })
      return { rowsAffected: 1 }
    },
  }
  const repository = new SqliteMediaRepository(
    async () => database,
    () => 'game-created',
    () => timestamp,
  )

  const listed = await repository.listGames('default')
  assert.equal(listed[0].platform, 'PC', 'La collection Jeux doit convertir les colonnes SQLite sans perte')
  assert.deepEqual(calls.at(-1).bindValues, ['default'], 'La collection Jeux doit rester limitée au profil courant')

  const input = {
    title: 'Jeu créé',
    developer: null,
    platform: 'Steam Deck',
    year: 2026,
    status: 'joué',
    rating: 5,
    isFavorite: true,
    playedAt: '2026-07-22',
    coverUrl: null,
    personalNote: 'Terminé localement',
  }
  const created = await repository.createGame('default', input)
  assert.equal(created.id, 'game-created', 'La création Jeu doit générer une identité locale')
  const insert = calls.at(-1)
  assert.match(insert.query, /INSERT INTO games/, 'La création doit cibler la table games')
  assert.equal(insert.bindValues[1], 'default', 'La création doit cibler le profil courant')
  assert.equal(insert.bindValues[4], 'Steam Deck', 'La plateforme libre doit être persistée telle que validée')

  const updatedAt = await repository.updateGame('default', 'game-local', { ...input, status: 'abandonné' })
  assert.equal(updatedAt, timestamp, 'La modification doit restituer son horodatage local')
  const update = calls.at(-1)
  assert.match(update.query, /WHERE id = \$12 AND profile_id = \$13/, 'La modification doit cibler le jeu et son profil')
  assert.deepEqual(update.bindValues.slice(-2), ['game-local', 'default'], 'La modification doit rester isolée au profil courant')

  await repository.deleteGame('default', 'game-local')
  const deletion = calls.at(-1)
  assert.match(deletion.query, /DELETE FROM games/, 'La suppression doit cibler la table games')
  assert.deepEqual(deletion.bindValues, ['game-local', 'default'], 'La suppression doit cibler le jeu et son profil')
}

// Jalon 0.4.8 — Art : verticale sans note, contexte libre et CRUD local.
const artworkDomainSource = readFileSync(new URL('../src/domain/artwork.ts', import.meta.url), 'utf8')
const artworkFormSource = readFileSync(new URL('../src/components/ArtworkForm.tsx', import.meta.url), 'utf8')
const artworkDetailSource = readFileSync(new URL('../src/components/ArtworkDetail.tsx', import.meta.url), 'utf8')
const mainSource048 = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')

assert.match(mainSource048, /icon\('art'\)\} Art/, 'La sidebar doit proposer l’entrée Art')
assert.match(mainSource048, /mediaRepository\.listArtworks/, 'La collection Art doit être relue depuis SQLite')
assert.match(mainSource048, /mediaRepository\.createArtwork/, 'La création d’œuvre doit écrire dans le repository SQLite')
assert.match(mainSource048, /mediaRepository\.updateArtwork/, 'La modification d’œuvre doit écrire dans le repository SQLite')
assert.match(mainSource048, /mediaRepository\.deleteArtwork/, 'La suppression d’œuvre doit écrire dans le repository SQLite')
assert.match(artworkDomainSource, /ARTWORK_FORMS/, 'Le domaine doit borner les formes d’art décidées')
assert.match(artworkFormSource, /artwork-location/, 'Le formulaire doit accepter un lieu libre facultatif')
assert.match(artworkFormSource, /artwork-exhibition/, 'Le formulaire doit accepter une exposition libre facultative')
assert.match(artworkDetailSource, /ARTWORK_FORM_LABELS/, 'La fiche doit afficher la forme propre à l’œuvre')
assert.doesNotMatch(artworkFormSource, /\brating\b/, 'Le formulaire Art ne doit proposer aucune note chiffrée')
assert.doesNotMatch(artworkDetailSource, /\brating\b/, 'La fiche Art ne doit afficher aucune note chiffrée')

{
  const { EMPTY_ARTWORK_FORM, validateArtworkForm } = await import('../src/domain/artworkForm.ts')

  const minimal = validateArtworkForm({ ...EMPTY_ARTWORK_FORM, title: '  Œuvre minimale  ' })
  assert.equal(minimal.success, true, 'Un titre seul doit suffire à enregistrer une œuvre')
  assert.deepEqual(minimal.data, {
    title: 'Œuvre minimale',
    artist: null,
    year: null,
    form: 'autre',
    location: null,
    exhibition: null,
    status: 'découverte',
    isFavorite: false,
    discoveredAt: null,
    imageUrl: null,
    personalNote: null,
    customFields: [],
  }, 'Une œuvre ajoutée est découverte, les champs facultatifs vides restent null')

  // 0.6.12 : les champs personnalisés nom → valeur sont normalisés (trim,
  // bornes), une ligne sans nom est jetée.
  const withFields = validateArtworkForm({
    ...EMPTY_ARTWORK_FORM,
    title: 'Œuvre documentée',
    customFields: [
      { name: '  Exposition  ', value: '  Musée d’Orsay  ' },
      { name: '   ', value: 'sans nom, ignoré' },
      { name: 'Provenance', value: '' },
    ],
  })
  assert.equal(withFields.success, true, 'Les champs personnalisés valides doivent être acceptés')
  assert.deepEqual(
    withFields.data.customFields,
    [{ name: 'Exposition', value: 'Musée d’Orsay' }, { name: 'Provenance', value: '' }],
    'Un champ sans nom est ignoré, nom et valeur sont normalisés',
  )

  const complete = validateArtworkForm({
    ...EMPTY_ARTWORK_FORM,
    title: 'Photographie complète',
    artist: '  Artiste locale  ',
    year: '2026',
    form: 'photographie',
    location: '  Galerie municipale  ',
    exhibition: '  Lumières d’été  ',
    status: 'découverte',
    isFavorite: true,
    discoveredAt: '2026-07-22',
    imageUrl: 'https://example.invalid/oeuvre.jpg',
    personalNote: '  Avis personnel  ',
  })
  assert.equal(complete.success, true, 'Tous les champs Art contractuels valides doivent être acceptés')
  assert.equal(complete.data.form, 'photographie', 'La forme sélectionnée doit être conservée')
  assert.equal(complete.data.location, 'Galerie municipale', 'Le lieu libre doit être normalisé sans relation inventée')
  assert.equal(complete.data.exhibition, 'Lumières d’été', 'L’exposition libre doit être normalisée sans relation inventée')

  for (const values of [
    { title: '   ' },
    { title: 'Forme', form: 'installation' },
    { title: 'Statut', status: 'en cours' },
    { title: 'Année', year: '0' },
    { title: 'Date', discoveredAt: '2026-02-30' },
    { title: 'Visuel', imageUrl: 'file:///oeuvre.jpg' },
  ]) {
    assert.equal(
      validateArtworkForm({ ...EMPTY_ARTWORK_FORM, ...values }).success,
      false,
      `Le formulaire Art doit refuser la saisie invalide ${JSON.stringify(values)}`,
    )
  }
}

{
  const { SqliteMediaRepository } = await import('../src/data/mediaRepository.ts')
  const timestamp = '2026-07-22T15:00:00.000Z'
  const artworkRow = {
    id: 'artwork-local',
    profile_id: 'default',
    title: 'Œuvre SQLite',
    artist: 'Artiste locale',
    year: 2026,
    form: 'performance',
    location: 'Lieu local',
    exhibition: 'Exposition locale',
    status: 'découverte',
    is_favorite: 1,
    discovered_at: '2026-07-22',
    image_url: null,
    personal_note: 'Avis local',
    created_at: timestamp,
    updated_at: timestamp,
  }
  const calls = []
  const database = {
    async select(query, bindValues) {
      calls.push({ kind: 'select', query, bindValues })
      return [artworkRow]
    },
    async execute(query, bindValues) {
      calls.push({ kind: 'execute', query, bindValues })
      return { rowsAffected: 1 }
    },
  }
  const repository = new SqliteMediaRepository(
    async () => database,
    () => 'artwork-created',
    () => timestamp,
  )

  const listed = await repository.listArtworks('default')
  assert.equal(listed[0].form, 'performance', 'La collection Art doit convertir les colonnes SQLite sans perte')
  assert.deepEqual(calls.at(-1).bindValues, ['default'], 'La collection Art doit rester limitée au profil courant')

  const input = {
    title: 'Œuvre créée',
    artist: 'Artiste',
    year: 2026,
    form: 'poésie',
    location: 'Bibliothèque',
    exhibition: null,
    status: 'découverte',
    isFavorite: true,
    discoveredAt: '2026-07-22',
    imageUrl: null,
    personalNote: 'Découverte localement',
  }
  const created = await repository.createArtwork('default', input)
  assert.equal(created.id, 'artwork-created', 'La création Art doit générer une identité locale')
  const insert = calls.at(-1)
  assert.match(insert.query, /INSERT INTO artworks/, 'La création doit cibler la table artworks')
  assert.equal(insert.bindValues[1], 'default', 'La création doit cibler le profil courant')
  assert.equal(insert.bindValues[5], 'poésie', 'La forme d’art doit être persistée telle que validée')

  const updatedAt = await repository.updateArtwork('default', 'artwork-local', { ...input, status: 'à découvrir' })
  assert.equal(updatedAt, timestamp, 'La modification doit restituer son horodatage local')
  const update = calls.at(-1)
  assert.match(update.query, /WHERE id = \$14 AND profile_id = \$15/, 'La modification doit cibler l’œuvre et son profil (custom_fields ajouté en 0.6.12)')
  assert.deepEqual(update.bindValues.slice(-2), ['artwork-local', 'default'], 'La modification doit rester isolée au profil courant')

  await repository.deleteArtwork('default', 'artwork-local')
  const deletion = calls.at(-1)
  assert.match(deletion.query, /DELETE FROM artworks/, 'La suppression doit cibler la table artworks')
  assert.deepEqual(deletion.bindValues, ['artwork-local', 'default'], 'La suppression doit cibler l’œuvre et son profil')
}

// Jalon 0.4.9 — cohérence Jeux/Art : recherche, filtres, portabilité et snapshots.
{
  const timestamp = '2026-07-22T16:00:00.000Z'
  const profile = {
    id: 'default',
    name: 'Profil mixte',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const existingGame = {
    id: 'game-local',
    profileId: 'default',
    title: 'Café Racer',
    developer: null,
    platform: null,
    year: null,
    status: 'joué',
    rating: 5,
    isFavorite: true,
    playedAt: '2026-07-22',
    coverUrl: null,
    personalNote: 'Avis local\npréservé.',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const importedGame = {
    ...existingGame,
    id: 'game-imported',
    profileId: 'source',
    title: 'cafe racer',
    developer: 'Studio Éclair',
    platform: 'Steam Deck',
    year: 2026,
    status: 'à jouer',
    rating: null,
    isFavorite: false,
    playedAt: null,
    personalNote: null,
  }
  const existingArtwork = {
    id: 'artwork-local',
    profileId: 'default',
    title: 'Été bleu',
    artist: null,
    year: null,
    form: 'photographie',
    location: null,
    exhibition: null,
    status: 'découverte',
    isFavorite: true,
    discoveredAt: '2026-07-22',
    imageUrl: null,
    personalNote: 'Souvenir personnel\nmultiligne.',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const importedArtwork = {
    ...existingArtwork,
    id: 'artwork-imported',
    profileId: 'source',
    title: 'ete bleu',
    artist: 'Anaïs Lumière',
    year: 2025,
    form: 'peinture',
    location: 'Montréal',
    exhibition: 'Lumières d’été',
    status: 'à découvrir',
    isFavorite: false,
    discoveredAt: null,
    personalNote: null,
  }

  const {
    planArtworkMerge,
    planGameMerge,
    resolveArtworkMerge,
    resolveGameMerge,
  } = await import('../src/domain/importMerge.ts')
  const gamePlan = planGameMerge([existingGame], [importedGame])
  const artworkPlan = planArtworkMerge([existingArtwork], [importedArtwork])
  assert.equal(gamePlan.duplicates.length, 1, 'La fusion Jeux doit détecter un titre sans tenir compte des accents')
  assert.equal(artworkPlan.duplicates.length, 1, 'La fusion Art doit détecter un titre sans tenir compte des accents')
  const mergedGame = resolveGameMerge([], gamePlan, new Map([['cafe racer', 'keep-existing']]), timestamp).updates[0]
  const mergedArtwork = resolveArtworkMerge([], artworkPlan, new Map([['ete bleu', 'keep-existing']]), timestamp).updates[0]
  assert.equal(mergedGame.platform, 'Steam Deck', 'La fusion Jeux doit compléter une plateforme locale vide')
  assert.equal(mergedGame.rating, 5, 'La fusion Jeux doit préserver la note personnelle locale')
  assert.equal(mergedGame.personalNote, existingGame.personalNote, 'La fusion Jeux doit préserver l’avis local')
  assert.equal(mergedArtwork.artist, 'Anaïs Lumière', 'La fusion Art doit compléter un artiste local vide')
  assert.equal(mergedArtwork.location, 'Montréal', 'La fusion Art doit compléter un lieu local vide')
  assert.equal(mergedArtwork.personalNote, existingArtwork.personalNote, 'La fusion Art doit préserver l’avis local')

  const dedicatedDocument = createLibraryDocument({
    profile,
    films: [],
    series: [],
    books: [],
    games: [existingGame],
    artworks: [existingArtwork],
  }, timestamp)
  const serialized = serializeLibraryDocument(dedicatedDocument)
  assert.deepEqual(parseGamesCollectionJson(serialized).items?.[0], existingGame, 'L’import Jeux dédié doit préserver les caractères et notes longues')
  assert.deepEqual(parseArtworksCollectionJson(serialized).items?.[0], existingArtwork, 'L’import Art dédié doit préserver les caractères et notes longues')

  const calls = []
  const repository = new (await import('../src/data/mediaRepository.ts')).SqliteMediaRepository(async () => ({
    async select(query, bindValues) {
      calls.push({ query, bindValues })
      if (query.includes('FROM games')) return [{
        id: existingGame.id,
        profile_id: existingGame.profileId,
        title: existingGame.title,
        developer: existingGame.developer,
        platform: 'Steam Deck',
        year: existingGame.year,
        status: existingGame.status,
        rating: existingGame.rating,
        is_favorite: 1,
        played_at: existingGame.playedAt,
        cover_url: existingGame.coverUrl,
        personal_note: existingGame.personalNote,
        created_at: timestamp,
        updated_at: timestamp,
      }]
      if (query.includes('FROM artworks')) return [{
        id: existingArtwork.id,
        profile_id: existingArtwork.profileId,
        title: existingArtwork.title,
        artist: 'Anaïs Lumière',
        year: existingArtwork.year,
        form: existingArtwork.form,
        location: 'Montréal',
        exhibition: existingArtwork.exhibition,
        status: existingArtwork.status,
        is_favorite: 1,
        discovered_at: existingArtwork.discoveredAt,
        image_url: existingArtwork.imageUrl,
        personal_note: existingArtwork.personalNote,
        created_at: timestamp,
        updated_at: timestamp,
      }]
      throw new Error(`Requête inattendue : ${query}`)
    },
    async execute() { throw new Error('Aucune écriture attendue pendant la recherche') },
  }))
  await repository.searchGames('default', { query: '  Éclair  ', platform: 'Steam Deck', sort: { column: 'title', direction: 'asc' } })
  await repository.searchArtworks('default', { query: '  Montréal  ', form: 'photographie', sort: { column: 'title', direction: 'asc' } })
  assert.match(calls[0].query, /developer COLLATE NOCASE LIKE/, 'La recherche Jeux doit couvrir le studio')
  assert.match(calls[0].query, /platform COLLATE NOCASE LIKE/, 'La recherche Jeux doit couvrir la plateforme')
  assert.deepEqual(calls[0].bindValues, ['default', '%Éclair%', 'Steam Deck'], 'Le filtre de plateforme doit être paramétré')
  assert.match(calls[1].query, /location COLLATE NOCASE LIKE/, 'La recherche Art doit couvrir le lieu')
  assert.match(calls[1].query, /exhibition COLLATE NOCASE LIKE/, 'La recherche Art doit couvrir l’exposition')
  assert.deepEqual(calls[1].bindValues, ['default', '%Montréal%', 'photographie'], 'Le filtre de forme doit être paramétré')

  const snapshots = []
  const backup = new BackupService({
    async getBackupSettings() { return null },
    async pickBackupDirectory() { return null },
    async clearBackupSettings() {},
    async saveManualBackupSnapshot() { throw new Error('Snapshot manuel non attendu') },
    async saveAutomaticBackupSnapshot(profileId, contents, automaticDay) {
      snapshots.push({ profileId, contents, automaticDay })
      return { outcome: 'saved', fileName: 'snapshot-mixte.json' }
    },
  }, () => new Date(2026, 6, 22, 16, 0, 0), async () => ({
    profile,
    films: [],
    series: [],
    books: [],
    games: [existingGame],
    artworks: [existingArtwork],
  }))
  await backup.tryAutomaticSnapshot({ profile, films: [] })
  const snapshotDocument = validateLibraryDocument(snapshots[0].contents).document
  assert.deepEqual(snapshotDocument?.games[0], existingGame, 'Le snapshot global doit inclure fidèlement les Jeux')
  assert.deepEqual(snapshotDocument?.artworks[0], existingArtwork, 'Le snapshot global doit inclure fidèlement l’Art')
}

// Jalon 0.4.11 — résolveur de doublons praticable à grande échelle.
{
  const { countModifiedDuplicateResolutions, filterDuplicatesByTitle } = await import('../src/domain/importMerge.ts')
  const duplicates = Array.from({ length: 401 }, (_, index) => ({
    normalizedTitle: `film qa ${index + 1}`,
  }))
  const resolutions = new Map([
    ['film qa 17', 'keep-imported'],
    ['film qa 319', 'keep-imported'],
  ])

  assert.equal(filterDuplicatesByTitle(duplicates, 'Film QA 400').length, 1, 'La recherche locale doit filtrer une liste de 401 doublons par titre')
  assert.equal(filterDuplicatesByTitle(duplicates, 'film qa').length, 401, 'Une recherche commune doit conserver tous les doublons correspondants')
  assert.equal(filterDuplicatesByTitle(duplicates, '').length, 401, 'Effacer la recherche doit restaurer toute la liste sans modifier son ordre')
  assert.equal(countModifiedDuplicateResolutions(duplicates, resolutions), 2, 'Les décisions prises sur des doublons masqués restent comptées')
  assert.equal(resolutions.get('film qa 17'), 'keep-imported', 'Le choix d’un doublon doit survivre à un filtrage ultérieur')
}

assert.match(mainSource047, /searchGames/, 'La bibliothèque Jeux doit rechercher dans SQLite')
assert.match(mainSource047, /kind="games"/, 'La bibliothèque Jeux doit proposer son import unitaire')
assert.match(mainSource047, /LibraryExportFlow kind="games"/, 'La bibliothèque Jeux doit proposer son export dédié')
assert.match(mainSource048, /searchArtworks/, 'La bibliothèque Art doit rechercher dans SQLite')
assert.match(mainSource048, /kind="artworks"/, 'La bibliothèque Art doit proposer son import unitaire')
assert.match(mainSource048, /LibraryExportFlow kind="artworks"/, 'La bibliothèque Art doit proposer son export dédié')
assert.match(nativePortabilityBridgeSource, /invoke\('import_games_into_profile'/, 'Le frontend doit appeler le pont Tauri d’import Jeux')
assert.match(nativePortabilityBridgeSource, /invoke\('import_artworks_into_profile'/, 'Le frontend doit appeler le pont Tauri d’import Art')
assert.match(nativePortabilitySource, /games_and_artworks_collection_imports_are_atomic/, 'Une preuve Rust doit couvrir le rollback des imports Jeux et Art')
assert.match(tauriLibrarySource, /portability::import_games_into_profile/, 'La commande Tauri Jeux doit être enregistrée')
assert.match(tauriLibrarySource, /portability::import_artworks_into_profile/, 'La commande Tauri Art doit être enregistrée')

assert.doesNotMatch(mainSource047, /create-choice|FilmCreationChoice/, 'La création Film ne doit plus passer par un écran de choix intermédiaire')
// 0.6.0 : l'ajout de film s'ouvre en pop-up modale (addFlow) au-dessus de la bibliothèque
assert.match(mainSource, /onCreate=\{\(\) => setAddFlow\(\{ medium: 'film', step: 'search' \}\)\}/, 'Ajouter un film doit ouvrir la pop-up de recherche TMDB au-dessus de la bibliothèque')
assert.match(tmdbSearchFlowSource, /setTimeout\(\(\) =>/, 'La recherche TMDB doit être temporisée pendant la saisie')
assert.match(tmdbSearchFlowSource, /useState\(\(\) => film\?\.title \?\? ''\)/, 'Une association existante doit préremplir la recherche avec son titre')
assert.match(tmdbSearchFlowSource, /className="tmdb-film-context"/, 'La recherche TMDB doit conserver la fiche existante comme contexte visuel')
assert.match(tmdbSearchFlowSource, /autoCorrect="off"/, 'La recherche TMDB doit désactiver l’autocorrection')
assert.match(tmdbSearchFlowSource, /spellCheck=\{false\}/, 'La recherche TMDB doit désactiver la correction orthographique')
assert.match(mainSource047, /autoCorrect="off"[\s\S]*spellCheck=\{false\}/, 'La recherche locale Films doit désactiver les corrections automatiques')

// Jalons 0.4.19 puis 0.4.23 — vues intégrées et modèle unifié : préset { filtres, tri }.
const libraryViewQuerySource = readFileSync(new URL('../src/data/libraryViewQuery.ts', import.meta.url), 'utf8')
const mainSource0419 = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')

{
  const { RATED_BUILTIN_VIEWS, UNRATED_BUILTIN_VIEWS, resolveLibraryQuery, sortColumnsForMedium } = await import('../src/domain/libraryViews.ts')
  const { librarySortOrderBy } = await import('../src/data/libraryViewQuery.ts')
  const { EMPTY_LIBRARY_FILTERS, mergeLibraryFilters } = await import('../src/domain/libraryFilters.ts')

  // Jalon 0.6.11 : « all » revient en fin de rangée ; Films ouvrent sur Récent,
  // l'Art sur Favori. Les vues restent des présets du même modèle unifié.
  assert.deepEqual(RATED_BUILTIN_VIEWS.map((view) => view.id), ['recent', 'watchlist', 'favorites', 'ranking', 'all'], 'Les médiums notés proposent les cinq vues intégrées, Récent en tête')
  assert.deepEqual(UNRATED_BUILTIN_VIEWS.map((view) => view.id), ['favorites', 'recent', 'all'], 'L’Art ouvre sur Favori, sans classement par note ni watchlist')
  assert.ok(RATED_BUILTIN_VIEWS.every((view) => view.builtin), 'Les vues de base sont des présets intégrés du même modèle')

  const watchlist = RATED_BUILTIN_VIEWS.find((view) => view.id === 'watchlist')
  assert.equal(watchlist.filters.statusGroup, 'pending', 'La vue d’entrée filtre sur le groupe « à voir »')
  const recent = RATED_BUILTIN_VIEWS.find((view) => view.id === 'recent')
  assert.equal(recent.filters.statusGroup, 'consumed', 'La vue Récents n’affiche que du déjà consommé (0.6.8)')
  assert.deepEqual(recent.sort, { column: 'recency', direction: 'desc' }, 'La vue Récents trie par récence décroissante')

  const favorites = RATED_BUILTIN_VIEWS.find((view) => view.id === 'favorites')
  assert.equal(favorites.filters.favoritesOnly, true, 'La vue Favoris est un préset filtré sur les coups de cœur')
  assert.deepEqual(favorites.sort, { column: 'title', direction: 'asc' }, 'La vue Favoris trie par titre')
  assert.deepEqual(RATED_BUILTIN_VIEWS.find((view) => view.id === 'ranking').sort, { column: 'rating', direction: 'desc' }, 'La vue Classement trie par note décroissante')

  assert.equal(librarySortOrderBy({ column: 'title', direction: 'asc' }, { progressColumn: null }), 'title COLLATE NOCASE ASC, created_at ASC', 'Le tri par titre doit être canonique')
  assert.equal(librarySortOrderBy({ column: 'title', direction: 'desc' }, { progressColumn: null }), 'title COLLATE NOCASE DESC, created_at ASC', 'Le tri par titre doit accepter le sens décroissant')
  assert.equal(librarySortOrderBy({ column: 'recency', direction: 'desc' }, { progressColumn: null }), 'updated_at DESC, title COLLATE NOCASE ASC', 'La récence sans progression suit la dernière modification')
  assert.equal(
    librarySortOrderBy({ column: 'recency', direction: 'desc' }, { progressColumn: 'progress_updated_at' }),
    'COALESCE(progress_updated_at, updated_at) DESC, title COLLATE NOCASE ASC',
    'La récence privilégie la progression métier horodatée quand elle existe',
  )
  assert.equal(librarySortOrderBy({ column: 'rating', direction: 'desc' }, { progressColumn: null }), 'rating IS NULL ASC, rating DESC, title COLLATE NOCASE ASC', 'Le tri par note est décroissant, absences en fin')
  assert.equal(librarySortOrderBy({ column: 'year', direction: 'asc' }, { progressColumn: null }), 'year IS NULL ASC, year ASC, title COLLATE NOCASE ASC', 'Le tri par année place les absences en fin')
  assert.equal(librarySortOrderBy({ column: 'personalDate', direction: 'desc' }, { progressColumn: null, personalDateColumn: 'watched_at' }), 'watched_at IS NULL ASC, watched_at DESC, title COLLATE NOCASE ASC', 'Le tri par date personnelle vise la colonne du médium')
  assert.equal(librarySortOrderBy({ column: 'added', direction: 'desc' }, { progressColumn: null }), 'created_at DESC, title COLLATE NOCASE ASC', 'Le tri par ajout suit la création')

  assert.deepEqual(sortColumnsForMedium({ rating: true, year: true }), ['title', 'recency', 'rating', 'year', 'personalDate', 'added'], 'Un médium noté avec année expose toutes les colonnes de tri')
  assert.ok(!sortColumnsForMedium({ rating: false, year: true }).includes('rating'), 'L’Art n’expose jamais un tri par note')
  assert.ok(!sortColumnsForMedium({ rating: true, year: false }).includes('year'), 'Les Séries n’exposent pas de tri par année')

  const merged = mergeLibraryFilters(favorites.filters, { ...EMPTY_LIBRARY_FILTERS, year: 2018 })
  assert.equal(merged.favoritesOnly, true, 'Un filtre à la volée ne peut pas annuler le filtre de la vue Favoris')
  assert.equal(merged.year, 2018, 'Le filtre à la volée s’ajoute à celui de la vue active')

  const resolved = resolveLibraryQuery(favorites, { ...EMPTY_LIBRARY_FILTERS, year: 2018 }, { column: 'year', direction: 'desc' })
  assert.equal(resolved.filters.favoritesOnly && resolved.filters.year === 2018, true, 'La requête effective combine vue et filtres à la volée')
  assert.deepEqual(resolved.sort, { column: 'year', direction: 'desc' }, 'Un tri explicite remplace celui du préset')
  assert.deepEqual(resolveLibraryQuery(favorites, EMPTY_LIBRARY_FILTERS, null).sort, favorites.sort, 'Sans tri explicite, le tri du préset s’applique')
}

assert.equal((mainSource0419.match(/<LibraryViewBar/g) ?? []).length, 5, 'Les cinq bibliothèques doivent partager la même rangée de vues unifiée')
assert.doesNotMatch(mainSource0419, /FILM_FILTERS|FilmFilter/, 'Les anciens filtres Films par statut ne doivent plus piloter la bibliothèque')
assert.match(libraryViewQuerySource, /rating IS NULL ASC/, 'L’ordre du classement doit être résolu en colonnes documentées, pas en tri React')

// Jalon 0.6.8 — vues intégrées sémantiques, interrupteur de catégories, gutter de scrollbar.
{
  const { PROGRESS_BUILTIN_VIEWS, DEFAULT_VIEW_ID, builtinViewById } = await import('../src/domain/libraryViews.ts')
  const { appendLibraryFilterClauses } = await import('../src/data/libraryViewQuery.ts')

  assert.deepEqual(PROGRESS_BUILTIN_VIEWS.map((view) => view.id), ['watchlist', 'in-progress', 'recent', 'favorites', 'ranking', 'all'], 'Séries et Livres : progression, socle commun et vue Tous (0.6.8 + 0.6.11)')

  const clauses = []
  const binds = []
  appendLibraryFilterClauses(
    { status: 'all', statusGroup: 'consumed', favoritesOnly: false, minRating: null, year: null, personalDateFrom: null, specificText: '', location: '', exhibition: '' },
    { rating: true, year: true, personalDateColumn: null, specificTextColumn: null, locationColumn: null, exhibitionColumn: null, progressColumn: null },
    clauses,
    binds,
    (value) => value,
  )
  assert.ok(clauses.some((clause) => clause.startsWith('status IN (')), 'Le groupe « consommé » doit se traduire en liste blanche paramétrée')
  assert.ok(binds.includes('terminé') && binds.includes('vue') && binds.includes('lu'), 'La traduction couvre les statuts consommés de tous les médiums')
  assert.ok(!clauses.some((clause) => clause.startsWith('status =')), 'Un groupe actif ne doit pas coexister avec un statut exact')

  assert.equal(DEFAULT_VIEW_ID, 'watchlist', 'Chaque bibliothèque s’ouvre sur sa watchlist (0.6.8)')
  assert.equal(builtinViewById(PROGRESS_BUILTIN_VIEWS, 'in-progress').name, 'En cours', 'La vue En cours existe pour Séries et Livres')

  const mainSource068 = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const stylesSource068 = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const categorySwitchSource068 = readFileSync(new URL('../src/components/CategorySwitch.tsx', import.meta.url), 'utf8')
  assert.match(mainSource068, /<SeriesCategorySwitch/, 'Séries doit exposer l’interrupteur Télé|Animation')
  assert.match(mainSource068, /<BookCategorySwitch/, 'Livres doit exposer l’interrupteur Livre|Manga|Comics')
  assert.match(mainSource068, /category: seriesContext\.category, filters: resolved\.filters/, 'La sélection de catégories pilote directement la recherche Séries')
  assert.match(mainSource068, /category: bookContext\.category, filters: resolved\.filters/, 'La sélection de catégories pilote directement la recherche Livres')
  assert.match(mainSource068, /titledBuiltinViews\(PROGRESS_BUILTIN_VIEWS, 'books'\)/, 'Livres doit titrer sa watchlist « À lire »')
  assert.match(mainSource068, /titledBuiltinViews\(RATED_BUILTIN_VIEWS, 'games'\)/, 'Jeux doit titrer sa watchlist « À jouer »')
  assert.doesNotMatch(mainSource068, /builtinViews=\{RATED_BUILTIN_VIEWS\}|builtinViews=\{UNRATED_BUILTIN_VIEWS\}/, 'Aucune bibliothèque ne doit recevoir d’intitulés non titrés')
  assert.match(categorySwitchSource068, /role="group"/, 'L’interrupteur annonce un groupe multi-sélection')
  assert.match(categorySwitchSource068, /aria-pressed=/, 'Chaque segment expose son état coché')
  assert.match(categorySwitchSource068, /effective\.length === 1\) return/, 'L’interrupteur garde toujours au moins une catégorie active')
  const mediaRepositorySource068 = readFileSync(new URL('../src/data/mediaRepository.ts', import.meta.url), 'utf8')
  assert.match(mediaRepositorySource068, /category IN \(/, 'Le dépôt doit filtrer les sélections de catégories multiples en SQL paramétré')
  assert.match(mainSource068, /categoriesToStored\(context\.category/, 'La vue enregistrée doit stocker la sélection partielle sans perte')
  assert.match(stylesSource068, /\.category-switch-segment/, 'L’interrupteur doit suivre la charte maison')
  assert.match(stylesSource068, /scrollbar-gutter: stable/, 'La place de la barre de défilement doit rester réservée (correctif du saut Favoris)')
}

// Jalon 0.4.20 — filtres avancés combinables ; jalon 0.4.24 — popovers Filtre/Tri de la rangée unifiée.
const libraryViewBarSource = readFileSync(new URL('../src/components/LibraryViewBar.tsx', import.meta.url), 'utf8')

{
  const {
    EMPTY_LIBRARY_FILTERS,
    clearFilterChip,
    countActiveFilters,
    describeActiveFilters,
  } = await import('../src/domain/libraryFilters.ts')
  const { appendLibraryFilterClauses } = await import('../src/data/libraryViewQuery.ts')
  const escapeLike = (value) => value.replace(/[\\%_]/g, (match) => `\\${match}`)

  assert.equal(countActiveFilters(EMPTY_LIBRARY_FILTERS), 0, 'Aucun critère ne doit être actif à l’état initial')

  const combined = {
    status: 'terminé',
    favoritesOnly: true,
    minRating: 4,
    year: 2001,
    personalDateFrom: '2026-01-01',
    specificText: 'Miyazaki',
    location: '',
    exhibition: '',
  }
  assert.equal(countActiveFilters(combined), 6, 'Chaque critère renseigné doit compter')

  const chips = describeActiveFilters(combined, {
    statusLabel: (status) => `libellé ${status}`,
    personalDateLabel: 'Visionnage',
    specificTextLabel: 'Réalisation',
  })
  assert.equal(chips.length, 6, 'Chaque critère actif doit produire une puce')
  assert.ok(chips.some((chip) => chip.label === 'Note ≥ 4'), 'La note minimale doit être lisible dans les puces')

  const cleared = clearFilterChip(combined, 'minRating')
  assert.equal(cleared.minRating, null, 'Retirer une puce ne doit effacer que son critère')
  assert.equal(cleared.status, 'terminé', 'Retirer une puce doit préserver les autres critères')

  const clauses = []
  const bindValues = []
  appendLibraryFilterClauses(combined, {
    rating: true,
    year: true,
    personalDateColumn: 'watched_at',
    specificTextColumn: 'director',
    locationColumn: null,
    exhibitionColumn: null,
  }, clauses, bindValues, escapeLike)
  assert.deepEqual(bindValues, ['terminé', 4, 2001, '2026-01-01', '%Miyazaki%'], 'Tous les critères doivent être liés en paramètres')
  assert.ok(clauses.every((clause) => !clause.includes('Miyazaki') && !clause.includes('2001')), 'Aucune valeur ne doit être interpolée dans le SQL')
  assert.ok(clauses.some((clause) => clause.startsWith('rating >=')), 'La note minimale doit filtrer la colonne rating')
  assert.ok(clauses.some((clause) => clause.startsWith('watched_at >=')), 'La date personnelle doit filtrer la colonne dédiée')

  const seriesClauses = []
  const seriesBinds = []
  appendLibraryFilterClauses({ year: 1999, minRating: null, status: 'all', favoritesOnly: false, personalDateFrom: null, specificText: '', location: '', exhibition: '' }, {
    rating: true,
    year: false,
    personalDateColumn: 'started_at',
    specificTextColumn: null,
    locationColumn: null,
    exhibitionColumn: null,
  }, seriesClauses, seriesBinds, escapeLike)
  assert.equal(seriesBinds.length, 0, 'Un médium sans colonne année ne doit jamais appliquer ce critère')

  const artClauses = []
  const artBinds = []
  appendLibraryFilterClauses({ ...EMPTY_LIBRARY_FILTERS, minRating: 5, location: 'Orsay', exhibition: 'Impres_sion' }, {
    rating: false,
    year: true,
    personalDateColumn: 'discovered_at',
    specificTextColumn: 'artist',
    locationColumn: 'location',
    exhibitionColumn: 'exhibition',
  }, artClauses, artBinds, escapeLike)
  assert.ok(!artClauses.some((clause) => clause.startsWith('rating')), 'L’Art ne doit jamais filtrer par note')
  assert.deepEqual(artBinds, ['%Orsay%', '%Impres\\_sion%'], 'Les jokers LIKE des critères texte doivent être échappés')
}

{
  const calls = []
  const database = {
    async select(query, bindValues) {
      calls.push({ query, bindValues })
      return []
    },
    async execute() {
      throw new Error('Aucune écriture attendue pendant la recherche filtrée')
    },
  }
  const { SqliteFilmsRepository } = await import('../src/data/filmsRepository.ts')
  const { SqliteMediaRepository } = await import('../src/data/mediaRepository.ts')
  const filmsRepository = new SqliteFilmsRepository(async () => database)
  const mediaRepository = new SqliteMediaRepository(async () => database)

  await filmsRepository.searchFilms('default', {
    query: 'chihiro',
    sort: { column: 'rating', direction: 'desc' },
    filters: { status: 'terminé', favoritesOnly: false, minRating: 4, year: null, personalDateFrom: null, specificText: '', location: '', exhibition: '' },
  })
  const filmCall = calls.at(-1)
  assert.deepEqual(filmCall.bindValues, ['default', '%chihiro%', 'terminé', 4], 'Texte, statut et note doivent se combiner dans une seule requête liée')
  assert.match(filmCall.query, /ORDER BY rating IS NULL ASC, rating DESC/, 'Le tri actif doit se conserver pendant le filtrage')

  await mediaRepository.searchArtworks('default', {
    query: '',
    form: 'peinture',
    sort: { column: 'title', direction: 'asc' },
    filters: { status: 'all', favoritesOnly: true, minRating: null, year: null, personalDateFrom: null, specificText: '', location: 'Orsay', exhibition: '' },
  })
  const artworkCall = calls.at(-1)
  assert.deepEqual(artworkCall.bindValues, ['default', 'peinture', '%Orsay%'], 'Forme, favoris et lieu doivent se combiner pour l’Art')
  assert.match(artworkCall.query, /is_favorite = 1/, 'Le filtre favoris doit rester actif pendant le filtrage Art')
}

assert.match(libraryViewBarSource, /Réinitialiser/, 'Le popover Filtre doit proposer une remise à zéro explicite')
assert.match(libraryViewBarSource, /aria-label="Filtres"/, 'Le popover Filtre doit rester accessible')
assert.match(libraryViewBarSource, /aria-label="Tri"/, 'Le popover Tri doit rester accessible')
assert.match(libraryViewBarSource, /view-bar-badge/, 'Les critères actifs doivent être comptés sur l’icône Filtre')
assert.match(libraryViewBarSource, /role="dialog"/, 'Filtre et Tri doivent s’ouvrir dans des popovers, pas des panneaux permanents')
assert.match(mainSource0419, /EMPTY_LIBRARY_FILTERS, sortOverride: null \}\)/, 'Réinitialiser doit ramener à un état clairement défini')

// Jalons 0.4.21 puis 0.4.23 — vues personnalisées enregistrées, locales et isolées, modèle unifié.
const savedViewsMigrationSource = readFileSync(new URL('../src-tauri/migrations/0012_create_saved_views.sql', import.meta.url), 'utf8')
const savedViewsMigration13Source = readFileSync(new URL('../src-tauri/migrations/0013_saved_views_unified_criteria.sql', import.meta.url), 'utf8')
const rustDatabaseSource = readFileSync(new URL('../src-tauri/src/database.rs', import.meta.url), 'utf8')
const libraryDocumentSource0421 = readFileSync(new URL('../src/domain/libraryDocument.ts', import.meta.url), 'utf8')
const rustPortabilitySource0421 = readFileSync(new URL('../src-tauri/src/portability.rs', import.meta.url), 'utf8')

assert.match(savedViewsMigrationSource, /UNIQUE \(profile_id, medium, name\)/, 'Le nom d’une vue doit être unique par profil et médium')
assert.match(savedViewsMigrationSource, /schema_version INTEGER/, 'Le schéma des critères doit être versionné')
assert.match(savedViewsMigration13Source, /DROP TABLE saved_views/, 'La migration 13 doit supprimer l’ancienne table pour retirer la colonne view')
assert.match(savedViewsMigration13Source, /SELECT id, profile_id, medium, name, criteria_json/, 'La migration 13 doit préserver les vues déjà enregistrées')
assert.doesNotMatch(savedViewsMigration13Source, /INSERT INTO saved_views_new \([^)]*view/, 'La migration 13 ne doit pas conserver la colonne view')
assert.match(rustDatabaseSource, /0012_create_saved_views\.sql/, 'La migration 12 doit être enregistrée')
assert.match(rustDatabaseSource, /0013_saved_views_unified_criteria\.sql/, 'La migration 13 doit être enregistrée')
assert.doesNotMatch(libraryDocumentSource0421, /saved_views/, 'Les vues enregistrées ne doivent pas entrer dans le document d’export (décision : local uniquement)')
assert.doesNotMatch(rustPortabilitySource0421, /saved_views/, 'Les vues enregistrées ne doivent pas entrer dans les snapshots ni la portabilité native')

{
  const {
    assertSavedViewAllowed,
    deserializeSavedViewCriteria,
    sanitizeSavedViewCriteria,
    serializeSavedViewCriteria,
    validateSavedViewName,
  } = await import('../src/domain/savedViews.ts')

  assert.equal(validateSavedViewName('   ').ok, false, 'Un nom vide doit être refusé')
  assert.equal(validateSavedViewName('x'.repeat(81)).ok, false, 'Un nom trop long doit être refusé')
  const normalized = validateSavedViewName('  Mes   films  2026  ')
  assert.deepEqual(normalized, { ok: true, name: 'Mes films 2026' }, 'Le nom doit être nettoyé et borné')

  assert.throws(
    () => assertSavedViewAllowed('artworks', { sort: { column: 'rating', direction: 'desc' }, mediumFilter: 'all', filters: { status: 'all', favoritesOnly: false, minRating: null, year: null, personalDateFrom: null, specificText: '', location: '', exhibition: '' } }),
    /note/,
    'Une vue triée par note ne doit jamais être enregistrée pour l’Art',
  )

  const drifted = sanitizeSavedViewCriteria('books', {
    sort: { column: 'inexistante', direction: 'sideways' },
    mediumFilter: 'poche',
    filters: { status: 'relu', favoritesOnly: true, minRating: 99, year: 2020.5, personalDateFrom: 'hier', specificText: 42 },
  })
  assert.deepEqual(drifted.sort, { column: 'title', direction: 'asc' }, 'Un tri inconnu après évolution du schéma doit retomber sur le titre')
  assert.equal(drifted.mediumFilter, 'all', 'Une catégorie Livre inconnue doit retomber sur le filtre neutre')
  assert.equal(drifted.filters.status, 'all', 'Un statut inconnu doit retomber sur le filtre neutre')
  assert.equal(drifted.filters.minRating, null, 'Une note hors borne doit être abandonnée')
  assert.equal(drifted.filters.year, null, 'Une année non entière doit être abandonnée')
  assert.equal(drifted.filters.personalDateFrom, null, 'Une date invalide doit être abandonnée')
  assert.equal(drifted.filters.specificText, '', 'Un texte non chaîne doit être abandonné')
  assert.equal(drifted.filters.favoritesOnly, true, 'Les critères valides doivent survivre à la réparation')

  const artRanking = sanitizeSavedViewCriteria('artworks', { sort: { column: 'rating', direction: 'desc' }, mediumFilter: 'all', filters: {} })
  assert.deepEqual(artRanking.sort, { column: 'title', direction: 'asc' }, 'Un tri par note persisté pour l’Art doit être réparé à la lecture')

  const corrupted = deserializeSavedViewCriteria('films', '{pas du json')
  assert.deepEqual(corrupted.sort, { column: 'title', direction: 'asc' }, 'Un JSON corrompu doit retomber sur le critère neutre')

  const gameView = sanitizeSavedViewCriteria('games', { sort: { column: 'recency', direction: 'desc' }, mediumFilter: 'Steam Deck', filters: {} })
  assert.equal(gameView.mediumFilter, 'Steam Deck', 'La plateforme Jeu saisie librement doit être conservée')

  const v1Legacy = sanitizeSavedViewCriteria('films', {
    view: 'favorites',
    mediumFilter: 'all',
    filters: { status: 'terminé', favoritesOnly: false, minRating: 4, year: null, personalDateFrom: null, specificText: '', location: '', exhibition: '' },
  })
  assert.equal(v1Legacy.filters.favoritesOnly, true, 'Un critère v1 Favoris doit être converti en préset filtré')
  assert.deepEqual(v1Legacy.sort, { column: 'title', direction: 'asc' }, 'Un critère v1 Favoris hérite du tri du préset intégré')
  assert.equal(v1Legacy.filters.minRating, 4, 'Un critère v1 conserve ses filtres valides lors de la conversion')

  const roundTrip = deserializeSavedViewCriteria('series', serializeSavedViewCriteria({
    sort: { column: 'recency', direction: 'desc' },
    mediumFilter: 'animation',
    filters: { status: 'en cours', favoritesOnly: false, minRating: 4, year: null, personalDateFrom: '2026-02-01', specificText: '', location: '', exhibition: '' },
  }))
  assert.deepEqual(roundTrip.sort, { column: 'recency', direction: 'desc' }, 'Le tri de la vue doit survivre à la sérialisation')
  assert.equal(roundTrip.mediumFilter, 'animation', 'Le filtre de catégorie doit survivre à la sérialisation')
  assert.equal(roundTrip.filters.minRating, 4, 'Les critères avancés doivent survivre à la sérialisation')
}

{
  const rows = []
  const calls = []
  const database = {
    async select(query, bindValues) {
      calls.push({ query, bindValues })
      return rows
        .filter((row) => row.profile_id === bindValues[0] && row.medium === bindValues[1])
        .map((row) => ({ ...row }))
    },
    async execute(query, bindValues) {
      if (query.startsWith('INSERT')) {
        if (rows.some((row) => row.profile_id === bindValues[1] && row.medium === bindValues[2] && row.name === bindValues[3])) {
          throw new Error('UNIQUE constraint failed: saved_views.profile_id, saved_views.medium, saved_views.name')
        }
        rows.push({
          id: bindValues[0], profile_id: bindValues[1], medium: bindValues[2], name: bindValues[3],
          criteria_json: bindValues[4], created_at: bindValues[6], updated_at: bindValues[7],
        })
        return { rowsAffected: 1 }
      }
      if (query.startsWith('UPDATE')) {
        const row = rows.find((entry) => entry.id === bindValues[2] && entry.profile_id === bindValues[3])
        if (!row) return { rowsAffected: 0 }
        if (rows.some((entry) => entry !== row && entry.profile_id === row.profile_id && entry.medium === row.medium && entry.name === bindValues[0])) {
          throw new Error('UNIQUE constraint failed: saved_views.profile_id, saved_views.medium, saved_views.name')
        }
        row.name = bindValues[0]
        row.updated_at = bindValues[1]
        return { rowsAffected: 1 }
      }
      if (query.startsWith('DELETE')) {
        const index = rows.findIndex((entry) => entry.id === bindValues[0] && entry.profile_id === bindValues[1])
        if (index === -1) return { rowsAffected: 0 }
        rows.splice(index, 1)
        return { rowsAffected: 1 }
      }
      throw new Error(`Requête inattendue : ${query}`)
    },
  }
  const { SqliteSavedViewsRepository } = await import('../src/data/savedViewsRepository.ts')
  let idCounter = 0
  const repository = new SqliteSavedViewsRepository(async () => database, () => `vue-${++idCounter}`, () => '2026-08-01T10:00:00.000Z')
  const criteria = {
    sort: { column: 'rating', direction: 'desc' },
    mediumFilter: 'all',
    filters: { status: 'terminé', favoritesOnly: false, minRating: 4, year: null, personalDateFrom: null, specificText: '', location: '', exhibition: '' },
  }

  const created = await repository.create('profil-a', 'films', '  Mes préférés  ', criteria)
  assert.equal(created.name, 'Mes préférés', 'Le nom doit être nettoyé avant écriture')
  assert.match(rows[0].criteria_json, /"column":"rating"/, 'Le critère doit être persisté')
  assert.ok(!rows[0].criteria_json.includes('WHERE'), 'Aucune chaîne SQL ne doit être persistée dans les critères')

  await repository.create('profil-b', 'films', 'Mes préférés', criteria)
  assert.equal(rows.length, 2, 'Le même nom doit être possible dans un autre profil')

  await assert.rejects(
    () => repository.create('profil-a', 'films', 'Mes préférés', criteria),
    /porte déjà ce nom/,
    'Un doublon de nom dans le même profil et médium doit produire une erreur explicite',
  )

  await assert.rejects(
    () => repository.create('profil-a', 'films', '   ', criteria),
    /ne peut pas être vide/,
    'Un nom vide doit être refusé avant écriture',
  )

  const artView = await repository.create('profil-a', 'artworks', 'Rétrospective', { ...criteria, mediumFilter: 'peinture' })
  assert.deepEqual(artView.criteria.sort, { column: 'title', direction: 'asc' }, 'Un tri par note demandé pour l’Art doit être réparé avant écriture')
  assert.equal(artView.criteria.filters.minRating, null, 'Le critère de note doit être absent pour l’Art')

  const filmsViewsA = await repository.list('profil-a', 'films')
  assert.equal(filmsViewsA.length, 1, 'La liste doit être isolée par profil')
  assert.match(calls.at(-1).query, /WHERE profile_id = \$1 AND medium = \$2/, 'La liste doit cibler explicitement profil et médium')
  assert.equal(filmsViewsA[0].criteria.filters.status, 'terminé', 'Le critère relu doit être réparé et fidèle')

  rows[0].criteria_json = '{corrompu'
  const repaired = await repository.list('profil-a', 'films')
  assert.deepEqual(repaired[0].criteria.sort, { column: 'title', direction: 'asc' }, 'Un critère corrompu en base doit retomber sur le critère neutre sans casser la liste')

  await repository.rename('profil-a', created.id, 'Soirées cinéma')
  assert.equal(rows.find((row) => row.id === created.id).name, 'Soirées cinéma', 'Le renommage doit mettre à jour le nom')
  await assert.rejects(
    () => repository.rename('profil-a', 'vue-inconnue', 'Test'),
    /introuvable/,
    'Renommer une vue d’un autre profil doit échouer explicitement',
  )

  await repository.remove('profil-a', created.id)
  assert.equal(rows.filter((row) => row.profile_id === 'profil-a' && row.medium === 'films').length, 0, 'La suppression doit retirer la vue du profil')
  await assert.rejects(
    () => repository.remove('profil-a', created.id),
    /introuvable/,
    'Supprimer une vue absente du profil doit échouer explicitement',
  )
}

assert.match(libraryViewBarSource, /Confirmer la suppression/, 'La suppression d’une vue doit demander une confirmation explicite')
assert.match(libraryViewBarSource, /Enregistrer comme vue/, 'La rangée doit permettre d’enregistrer le combo courant comme vue')
assert.match(libraryViewBarSource, /INLINE_SAVED_VIEWS/, 'Le débordement des vues enregistrées doit rester borné dans la rangée')

// Jalon 0.4.26 — Séries assistées TMDB, même parcours direct que Films.
const seriesMetadataAssistanceSource = readFileSync(new URL('../src/domain/seriesMetadataAssistance.ts', import.meta.url), 'utf8')
const seriesTmdbSearchFlowSource = readFileSync(new URL('../src/components/SeriesTmdbSearchFlow.tsx', import.meta.url), 'utf8')
const seriesFormComponentSource = readFileSync(new URL('../src/components/SeriesForm.tsx', import.meta.url), 'utf8')
const tmdbClientSource0426 = readFileSync(new URL('../src-tauri/src/tmdb/client.rs', import.meta.url), 'utf8')
const tauriLibrarySource0426 = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8')

assert.match(tmdbClientSource0426, /"\/search\/tv"/, 'La recherche Séries doit viser l’endpoint TV de TMDB')
assert.match(tmdbClientSource0426, /\/tv\/\{tmdb_id\}\/credits/, 'La présentation TV doit lire les crédits (endpoint léger, sans timeout)')
assert.match(tmdbClientSource0426, /number_of_seasons/, 'Le total de saisons connu doit être lu depuis TMDB')
assert.match(tmdbClientSource0426, /validate_series_presentation/, 'La présentation TV doit être validée et bornée')
assert.match(tmdbClientSource0426, /series_fake_client_returns_bounded_presentation/, 'Une preuve Rust doit couvrir la présentation TV bornée')
assert.match(tauriLibrarySource0426, /tmdb::search_tmdb_series/, 'La commande de recherche Séries doit être enregistrée')
assert.match(tauriLibrarySource0426, /tmdb::preview_tmdb_series/, 'La commande de prévisualisation Séries doit être enregistrée')
assert.match(tmdbServiceSource, /invoke\('search_tmdb_series'/, 'Le frontend doit appeler la recherche Séries')
assert.match(tmdbServiceSource, /invoke\('preview_tmdb_series'/, 'Le frontend doit appeler la prévisualisation Séries')
assert.doesNotMatch(seriesMetadataAssistanceSource, /status:|rating:|isFavorite:/, 'Le préremplissage Séries ne doit toucher ni statut, ni note, ni favori')
assert.match(seriesFormComponentSource, /\.\.\.EMPTY_SERIES_FORM, \.\.\.initialValues/, 'Le formulaire Séries doit accepter des valeurs préremplies')
assert.match(mainSource047, /selectTmdbSeriesCandidate/, 'Le clic sur un résultat Séries doit préremplir directement le formulaire')
assert.match(mainSource047, /seriesPresentationToInitialValues/, 'Le clic sur un résultat Séries doit préremplir directement le formulaire')
assert.match(seriesTmdbSearchFlowSource, /setTimeout\(\(\) =>/, 'La recherche Séries doit être temporisée pendant la saisie')
assert.match(seriesTmdbSearchFlowSource, /Saisir manuellement/, 'La recherche Séries doit proposer une issue manuelle')
assert.match(seriesTmdbSearchFlowSource, /autoCorrect="off"/, 'La recherche Séries doit désactiver l’autocorrection')

{
  const { seriesPresentationToInitialValues } = await import('../src/domain/seriesMetadataAssistance.ts')
  const initial = seriesPresentationToInitialValues({
    tmdbId: 1399,
    title: 'Game of Thrones',
    originalTitle: 'Game of Thrones',
    firstAirYear: 2011,
    synopsis: 'Des intrigues de pouvoir à Westeros.',
    showrunners: ['David Benioff', 'D. B. Weiss'],
    cast: ['Emilia Clarke', 'Peter Dinklage'],
    seasonsTotal: 8,
    posterUrl: 'https://image.tmdb.org/t/p/w500/got.jpg',
  })
  assert.equal(initial.title, 'Game of Thrones', 'Le titre doit être prérempli')
  assert.equal(initial.showrunner, 'David Benioff, D. B. Weiss', 'Les showrunners doivent être joints lisiblement')
  assert.equal(initial.casting, 'Emilia Clarke, Peter Dinklage', 'Le casting doit être joint lisiblement')
  assert.equal(initial.seasonsTotal, '8', 'Le total de saisons connu doit être proposé')
  assert.equal(initial.posterUrl, 'https://image.tmdb.org/t/p/w500/got.jpg', 'L’affiche doit être préremplie')
  assert.equal(initial.status, 'à voir', 'Le statut personnel doit rester au neutre')
  assert.equal(initial.rating, '', 'La note personnelle ne doit jamais être préremplie')
  assert.equal(initial.seasonsSeen, '', 'Les saisons vues ne doivent jamais être préremplies')
}

// Jalon 0.4.27 — Livres assistés Open Library, sans clé ni compte.
const openLibraryServiceSource = readFileSync(new URL('../src/data/openLibraryService.ts', import.meta.url), 'utf8')
const bookMetadataAssistanceSource = readFileSync(new URL('../src/domain/bookMetadataAssistance.ts', import.meta.url), 'utf8')
const bookOpenLibraryFlowSource = readFileSync(new URL('../src/components/BookOpenLibrarySearchFlow.tsx', import.meta.url), 'utf8')
const bookFormComponentSource = readFileSync(new URL('../src/components/BookForm.tsx', import.meta.url), 'utf8')
const openLibraryRustSource = readFileSync(new URL('../src-tauri/src/openlibrary.rs', import.meta.url), 'utf8')

assert.match(openLibraryRustSource, /https:\/\/openlibrary\.org/, 'Le client Livres doit viser Open Library')
assert.match(openLibraryRustSource, /user_agent/, 'Le client Livres doit s’identifier par un User-Agent (etiquette Open Library)')
assert.match(openLibraryRustSource, /lang", "fr/, 'La recherche Livres doit privilégier les éditions francophones')
assert.match(openLibraryRustSource, /covers\.openlibrary\.org/, 'Les couvertures doivent venir du service dédié')
assert.doesNotMatch(openLibraryRustSource, /api_key|apikey|Authorization/, 'Open Library ne doit exiger ni clé ni secret')
assert.match(openLibraryRustSource, /work_key\.starts_with\("\/works\/"\)/, 'La clé d’œuvre doit être bornée avant tout appel de détail')
assert.match(openLibraryRustSource, /authors_are_bounded_and_joined/, 'Une preuve Rust doit borner et joindre les auteurs')
assert.match(tauriLibrarySource0426, /openlibrary::search_openlibrary_books/, 'La commande de recherche Livres doit être enregistrée')
assert.match(tauriLibrarySource0426, /openlibrary::preview_openlibrary_book/, 'La commande de prévisualisation Livres doit être enregistrée')
assert.match(openLibraryServiceSource, /invoke\('search_openlibrary_books'/, 'Le frontend doit appeler la recherche Livres')
assert.doesNotMatch(bookMetadataAssistanceSource, /status:|rating:|isFavorite:|volumesRead/, 'Le préremplissage Livres ne doit toucher ni statut, ni note, ni favori, ni tomes lus')
assert.match(bookFormComponentSource, /\.\.\.EMPTY_BOOK_FORM, \.\.\.initialValues/, 'Le formulaire Livres doit accepter des valeurs préremplies')
assert.match(mainSource047, /bookPresentationToInitialValues/, 'Le clic sur un résultat Livres doit préremplir directement le formulaire')
assert.match(bookOpenLibraryFlowSource, /setTimeout\(\(\) =>/, 'La recherche Livres doit être temporisée pendant la saisie')
assert.match(bookOpenLibraryFlowSource, /Saisir manuellement/, 'La recherche Livres doit proposer une issue manuelle')

{
  const { bookPresentationToInitialValues } = await import('../src/domain/bookMetadataAssistance.ts')
  const initial = bookPresentationToInitialValues({
    workKey: '/works/OL82563W',
    title: 'L’Étranger',
    author: 'Albert Camus',
    firstPublishYear: 1942,
    synopsis: 'Meursault assiste à l’enterrement de sa mère.',
    coverUrl: 'https://covers.openlibrary.org/b/id/12345-L.jpg',
  })
  assert.equal(initial.title, 'L’Étranger', 'Le titre doit être prérempli')
  assert.equal(initial.author, 'Albert Camus', 'L’auteur doit être prérempli')
  assert.equal(initial.year, '1942', 'L’année doit être préremplie')
  assert.equal(initial.coverUrl, 'https://covers.openlibrary.org/b/id/12345-L.jpg', 'La couverture doit être préremplie')
  assert.equal(initial.status, 'à lire', 'Le statut personnel doit rester au neutre')
  assert.equal(initial.rating, '', 'La note personnelle ne doit jamais être préremplie')
  assert.deepEqual(initial.quotes, [], 'Les citations personnelles ne doivent jamais être préremplies')
}

// Jalon 0.4.28 puis IGDB — Jeux assistés, identifiants embarqués obfusqués hors dépôt.
const gameFormComponentSource = readFileSync(new URL('../src/components/GameForm.tsx', import.meta.url), 'utf8')
const gitignoreSource = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8')

assert.match(gameFormComponentSource, /\.\.\.EMPTY_GAME_FORM, \.\.\.initialValues/, 'Le formulaire Jeux doit accepter des valeurs préremplies')

// Jalon IGDB : couvertures verticales pour les Jeux, jeton Twitch renouvelé côté backend.
const igdbRustSource = readFileSync(new URL('../src-tauri/src/igdb/mod.rs', import.meta.url), 'utf8')
const igdbServiceSource = readFileSync(new URL('../src/data/igdbService.ts', import.meta.url), 'utf8')
const gitignoreSourceIgdb = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8')
const gameIgdbAssistanceSource = readFileSync(new URL('../src/domain/gameIgdbAssistance.ts', import.meta.url), 'utf8')

assert.match(igdbRustSource, /https:\/\/id\.twitch\.tv\/oauth2\/token/, 'IGDB doit obtenir son jeton via Twitch OAuth client credentials')
assert.match(igdbRustSource, /TOKEN_CACHE/, 'Le jeton IGDB doit être mis en cache et renouvelé avant expiration')
assert.match(igdbRustSource, /embedded_client_id::embedded_api_key/, 'Le Client ID IGDB doit être embarqué obfusqué hors dépôt')
assert.match(igdbRustSource, /embedded_client_secret::embedded_api_key/, 'Le Client Secret IGDB doit être embarqué obfusqué hors dépôt')
assert.match(gitignoreSourceIgdb, /src-tauri\/src\/igdb\/embedded_client_id\.rs/, 'Le Client ID IGDB doit être exclu du dépôt')
assert.match(gitignoreSourceIgdb, /src-tauri\/src\/igdb\/embedded_client_secret\.rs/, 'Le Client Secret IGDB doit être exclu du dépôt')
assert.doesNotMatch(igdbRustSource, /println!|eprintln!|dbg!/, 'Les identifiants IGDB ne doivent jamais passer par un log')
assert.match(igdbRustSource, /t_cover_big/, 'Les couvertures IGDB doivent être servies verticales (cover_big)')
assert.match(igdbServiceSource, /invoke\('search_igdb_games'/, 'Le frontend doit appeler la recherche IGDB')
assert.match(gameIgdbAssistanceSource, /igdbPresentationToInitialValues/, 'Le préremplissage IGDB doit exister')
assert.doesNotMatch(gameIgdbAssistanceSource, /status:|rating:|isFavorite:|platform/, 'Le préremplissage IGDB ne doit toucher ni statut, ni note, ni favori, ni plateforme')
assert.match(mainSource047, /igdbPresentationToInitialValues/, 'Le clic sur un résultat Jeux doit préremplir directement le formulaire')

{
  const { igdbPresentationToInitialValues } = await import('../src/domain/gameIgdbAssistance.ts')
  const initial = igdbPresentationToInitialValues({
    gameId: 237895,
    title: 'The Legend of Zelda: Breath of the Wild',
    developer: 'Nintendo EPD',
    releaseYear: 2017,
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co67oa.jpg',
  })
  assert.equal(initial.title, 'The Legend of Zelda: Breath of the Wild', 'Le titre doit être prérempli')
  assert.equal(initial.developer, 'Nintendo EPD', 'Le développeur doit être prérempli')
  assert.equal(initial.year, '2017', 'L’année doit être préremplie')
  assert.equal(initial.platform, '', 'La plateforme reste un choix personnel, jamais préremplie')
  assert.equal(initial.status, 'à jouer', 'Le statut personnel doit rester au neutre')
  assert.equal(initial.rating, '', 'La note personnelle ne doit jamais être préremplie')
}

// 0.6.7 — Uniformisation des fiches : Modifier / Associer / Supprimer partout,
// pop-up d'association directe identique au parcours Films (Séries, Livres, Jeux).
const mainSource067 = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
const appStylesSource067 = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const gameIgdbSearchFlowSource067 = readFileSync(new URL('../src/components/GameIgdbSearchFlow.tsx', import.meta.url), 'utf8')

for (const [source, label] of [[seriesDetailSource, 'Séries'], [bookDetailSource, 'Livres'], [gameDetailSource, 'Jeux'], [artworkDetailSource, 'Art']]) {
  assert.match(source, /icon-action-button/, `${label} : la fiche doit utiliser les boutons icône du modèle Film`)
  assert.match(source, /icon-action-danger/, `${label} : la suppression doit porter la teinte danger explicite`)
  assert.doesNotMatch(source, /menu-wrap|detail-menu/, `${label} : plus de menu ⋯, trois actions explicites à la place`)
}
assert.match(seriesDetailSource, /onAssociate/, 'La fiche Série doit exposer le bouton Associer')
assert.match(bookDetailSource, /onAssociate/, 'La fiche Livre doit exposer le bouton Associer')
assert.match(gameDetailSource, /onAssociate/, 'La fiche Jeu doit exposer le bouton Associer')
assert.doesNotMatch(artworkDetailSource, /icon\('wand'\)/, 'L’Art n’a aucun fournisseur d’association : pas de baguette sur sa fiche')
assert.match(artworkDetailSource, /backLabel/, 'La fiche Art suit le même contrat de retour que les autres fiches')

for (const [source, label] of [
  [seriesTmdbSearchFlowSource, 'Séries'],
  [bookOpenLibraryFlowSource, 'Livres'],
  [gameIgdbSearchFlowSource067, 'Jeux'],
]) {
  assert.match(source, /compact/, `${label} : le flow doit offrir le rendu compact en pop-up`)
  assert.match(source, /existing/, `${label} : le flow doit accepter une fiche existante comme contexte`)
  assert.match(source, /Modifier l’association/, `${label} : le titre doit annoncer la modification d’association`)
}

assert.match(mainSource067, /type AssociateTarget/, 'La cible d’association directe doit être typée par médium')
assert.match(mainSource067, /selectAssociateSeries/, 'Le clic sur un résultat Séries doit mettre à jour la fiche ouverte')
assert.match(mainSource067, /selectAssociateBook/, 'Le clic sur un résultat Livres doit mettre à jour la fiche ouverte')
assert.match(mainSource067, /selectAssociateGame/, 'Le clic sur un résultat Jeux doit mettre à jour la fiche ouverte')
assert.match(mainSource067, /dialog-associate/, 'L’association Série/Livre/Jeu doit s’ouvrir dans la même pop-up floutée que les films')
assert.match(mainSource067, /existing=\{\{ title: series\.title, posterUrl: series\.posterUrl \}\}/, 'La pop-up Séries préremplit la recherche avec le titre de la fiche')
assert.match(mainSource067, /seriesWithPresentation\(series, presentation\)/, 'La mise à jour Séries passe par la fusion éditoriale partagée')
assert.match(mainSource067, /bookWithPresentation\(book,/, 'La mise à jour Livres passe par la fusion éditoriale partagée')
assert.match(mainSource067, /gameWithPresentation\(game,/, 'La mise à jour Jeux passe par la fusion éditoriale partagée')
assert.match(appStylesSource067, /\.editor-dialog\.dialog-associate/, 'La pop-up d’association doit suivre le gabarit compact maison')

{
  const { seriesWithPresentation, bookWithPresentation, gameWithPresentation } = await import('../src/domain/autoAssociateMedia.ts')
  const series = { status: 'en cours', rating: 4, isFavorite: true, seasonsSeen: 3, showrunner: null, summary: null }
  const mergedSeries = seriesWithPresentation(series, { showrunners: ['S. Knight'], cast: [], synopsis: null, seasonsTotal: 8, posterUrl: 'https://x/p.jpg' })
  assert.equal(mergedSeries.status, 'en cours', 'L’association ne touche jamais le statut personnel')
  assert.equal(mergedSeries.rating, 4, 'L’association ne touche jamais la note personnelle')
  assert.equal(mergedSeries.isFavorite, true, 'L’association ne touche jamais le coup de cœur')
  assert.equal(mergedSeries.seasonsSeen, 3, 'L’association ne touche jamais la progression personnelle')
  assert.equal(mergedSeries.showrunner, 'S. Knight', 'Le champ éditorial vide est enrichi')
  assert.equal(mergedSeries.summary, null, 'Un résumé absent côté fournisseur ne remplace pas la valeur existante')
  const book = { status: 'à lire', rating: null, quotes: [{ body: 'citation' }] }
  const mergedBook = bookWithPresentation(book, { author: 'A. Christie', firstPublishYear: 1939, synopsis: 'Dix petits indiens.', coverUrl: 'https://x/c.jpg' })
  assert.deepEqual(mergedBook.quotes, [{ body: 'citation' }], 'Les citations personnelles traversent la réassociation intactes')
  assert.equal(mergedBook.status, 'à lire', 'L’association ne touche jamais le statut personnel')
}

// Jalon 0.6.9 — pop-up d'ajout de film : recherche à trois colonnes défilante,
// formulaire intégré à la fenêtre sans faux <main> pleine page.
{
  const mainSource069 = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const formSource069 = readFileSync(new URL('../src/components/FilmForm.tsx', import.meta.url), 'utf8')
  const appStylesSource069 = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(mainSource069, /embeddedInDialog/, 'Le formulaire d’ajout doit être intégré à la pop-up hôte (plus de faux <main> pleine page)')
  assert.doesNotMatch(mainSource069, /<FilmForm\s+compactHeading/, 'Le rendu pop-up ne passe plus par compactHeading')
  assert.match(formSource069, /embeddedInDialog\?: boolean/, 'Le formulaire expose le mode intégré à la pop-up')
  assert.match(formSource069, /className="editor-dialog-embedded"/, 'Le mode intégré rend le formulaire directement dans la fenêtre')
  assert.match(appStylesSource069, /\.tmdb-search-compact \.tmdb-candidates-grid[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/, 'La recherche en pop-up affiche trois résultats par ligne')
  assert.match(appStylesSource069, /\.tmdb-search-compact \.tmdb-candidates-grid[\s\S]*?scrollbar-gutter: stable/, 'La grille de suggestions réserve la place de la barre de défilement')
}

// Jalon 0.6.10 — pop-up d'ajout des cinq médiums : même parcours en deux étapes
// (recherche fournisseur → formulaire intégré) que les films.
{
  const mainSource0610 = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const formLabels0610 = ['Films', 'Séries', 'Livres', 'Jeux', 'Art']
  const formSources0610 = [
    readFileSync(new URL('../src/components/FilmForm.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/components/SeriesForm.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/components/BookForm.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/components/GameForm.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/components/ArtworkForm.tsx', import.meta.url), 'utf8'),
  ]
  assert.match(mainSource0610, /medium: 'série', step: 'search' \}/, 'Le bouton Ajouter une série doit ouvrir la pop-up de recherche TMDB')
  assert.match(mainSource0610, /medium: 'livre', step: 'search' \}/, 'Le bouton Ajouter un livre doit ouvrir la pop-up de recherche Open Library')
  assert.match(mainSource0610, /medium: 'jeu', step: 'search' \}/, 'Le bouton Ajouter un jeu doit ouvrir la pop-up de recherche IGDB')
  assert.match(mainSource0610, /medium: 'artwork', step: 'form'/, 'L’Art, sans fournisseur par règle du domaine, ouvre la pop-up directement au stade formulaire')
  assert.match(mainSource0610, /<SeriesTmdbSearchFlow\s+compact/, 'La recherche Séries doit vivre dans la pop-up, sans page pleine page')
  assert.match(mainSource0610, /<BookOpenLibrarySearchFlow\s+compact/, 'La recherche Livres doit vivre dans la pop-up, sans page pleine page')
  assert.match(mainSource0610, /<GameIgdbSearchFlow\s+compact/, 'La recherche Jeux doit vivre dans la pop-up, sans page pleine page')
  assert.doesNotMatch(mainSource0610, /name: '(series-create|series-tmdb-search|book-create|book-ol-search|game-create|game-igdb-search|artwork-create)'/, 'Les anciennes pages d’ajout assistée doivent disparaître au profit de la pop-up unique')
  for (const [index, source] of formSources0610.entries()) {
    assert.match(source, /embeddedInDialog\?: boolean/, `${formLabels0610[index]} : le formulaire doit exposer le mode intégré à la pop-up`)
    assert.match(source, /className="editor-dialog-embedded"/, `${formLabels0610[index]} : le mode intégré rend le formulaire directement dans la fenêtre hôte`)
  }
}

// Jalon 0.6.11 — normalisation des bibliothèques : vues Tous/Récent/Favori,
// statuts Jeux réduits à trois états, crayon de visuel commun aux cinq médiums.
{
  const mainSource0611 = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const gameDomainSource0611 = readFileSync(new URL('../src/domain/game.ts', import.meta.url), 'utf8')
  const migration14Source = readFileSync(new URL('../src-tauri/migrations/0014_normalize_game_statuses.sql', import.meta.url), 'utf8')
  const databaseSource0611 = readFileSync(new URL('../src-tauri/src/database.rs', import.meta.url), 'utf8')
  assert.match(mainSource0611, /__reactRoot/, 'Le montage React doit réutiliser la racine existante : plus de double rendu au HMR invalidé')
  assert.doesNotMatch(mainSource0611, /export const MEDIUM_DOT_COLORS/, 'main.tsx ne doit exporter aucune constante non-composant (Fast Refresh)')
  assert.match(mainSource0611, /\{icon\('panel'\)\} Barre latérale/, 'La bascule de sidebar garde son icône en mode développé')
  assert.match(gameDomainSource0611, /\['à jouer', 'joué', 'abandonné'\]/, 'Les statuts Jeux se limitent à À jouer / Joué / Abandonné')
  assert.match(migration14Source, /SET status = 'joué'/, 'La migration 14 remappe « en cours » et « regardé » vers « joué »')
  assert.match(databaseSource0611, /version: 14/, 'La migration 14 est enregistrée séquentiellement')
  const detailSources0611 = ['FilmDetail', 'SeriesDetail', 'BookDetail', 'GameDetail', 'ArtworkDetail'].map(
    (name) => readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), 'utf8'),
  )
  for (const [index, source] of detailSources0611.entries()) {
    assert.doesNotMatch(source, /<span>Supprimer<\/span>/, `Fiche ${index + 1}/5 : la suppression est une poubelle seule`)
  }
  assert.doesNotMatch(detailSources0611[0], />Rafraîchir</, 'La fiche Film n’expose plus de bouton Rafraîchir')
}

console.log('Vérification réussie : Films SQLite canoniques, métadonnées assistées sans source ni réseau, cache TMDB Rust isolé et non portable, JSON et CSV v1 historiques réimportables, CSV et Notion mappés et prévisualisés, ZIP natif borné et imports bloqués avant toute écriture invalide. Socle multi-médiums 0.4.2 : migration 10, document sylloge-library v2, repository des quatre médiums, progression horodatée et import atomique régénérant les identifiants. Séries 0.4.3 : saisie manuelle complète, compteur de saisons +/−, bascule Vue ↔ En cours, vues globale/télé/animation triées par progression interne. Profils et portabilité 0.4.4 : import unifié JSON/CSV/ZIP Notion, remplacer/fusionner dans le profil courant, restauration globale atomique réservée à un profil vide. Livres 0.4.5 : saisie manuelle, tomes Manga/Comics et citations personnelles ordonnées. Livres 0.4.6 : recherche locale, vues Livre/Manga/Comics, import/export JSON v2 et snapshots fidèles avec citations. Jeux 0.4.7 et Art 0.4.8 : CRUD local contractuel. Cohérence 0.4.9 : recherche et filtres Jeux/Art, imports/exports JSON dédiés, fusion atomique et snapshots mixtes fidèles. Déblocage QA 0.4.10 : espacement des profils, focus de recherche sobre et snapshots désactivables sans suppression des fichiers existants. Résolution de doublons 0.4.11 : recherche, compteurs, choix persistants pendant le filtrage et confirmation protégée. Parcours Film 0.4.13 : recherche TMDB temporisée, issue manuelle, contexte d’association et champs sans autocorrection. CSV 0.4.15–0.4.16 : contrats unitaires, réimport des quatre collections, mapping externe explicite et blocage atomique avant toute écriture invalide. Vues 0.4.19 : Tous, Récents, Favoris et Classement cohérents sur les cinq médiums, ordres résolus en colonnes SQL documentées, Art sans classement par note. Filtres 0.4.20 : panneau partagé borné par médium, critères combinés en paramètres liés, puces actives et réinitialisation explicite. Vues enregistrées 0.4.21 : migration 12, couples filtres + tri nommés isolés par profil et médium, critères versionnés et réparés à la lecture, jamais de SQL persisté ni de portabilité. Modèle unifié 0.4.23 : une vue est un préset filtres + tri, intégrée ou enregistrée ; tri explicite borné par médium, migration 13 sans colonne view, critères v1 convertis à la lecture. Rangée 0.4.24 : vues intégrées et enregistrées dans une même ligne à débordement borné, popovers Filtre et Tri à la volée, combo enregistrable comme vue. Création 0.4.25 : le clic sur un résultat préremplit directement le formulaire ou associe la fiche existante, sans écran intermédiaire. Séries 0.4.26 : recherche TMDB TV temporisée, préremplissage éditorial borné (showrunner, casting, saisons connues, affiche), données personnelles jamais préremplies, sans cache ni écriture avant validation. Livres 0.4.27 : recherche Open Library sans clé ni compte, User-Agent identifié, préférence francophone, préremplissage éditorial borné (auteur, année, couverture, résumé quand il existe). Jeux 0.4.28 : recherche RAWG avec clé embarquée obfusquée hors dépôt, jamais loguée, préremplissage éditorial borné (développeur, année, cover), plateforme et données personnelles jamais préremplies, attribution visible. Transferts 0.4.29 : un seul bouton Exporter par médium, dialogue accessible de formats JSON/CSV, aucune écriture avant choix explicite, export global nommé Sauvegarde Sylloge. Uniformisation 0.6.7 : les fiches Séries, Livres, Jeux et Art reprennent les trois boutons explicites du modèle Film, plus aucun menu caché ; l’association directe s’ouvre dans la même pop-up floutée avec recherche préremplie, fusion éditoriale bornée et données personnelles intactes ; l’Art reste sans fournisseur par règle du domaine.')
