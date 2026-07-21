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
import { validateLibraryDocument } from '../src/domain/libraryDocument.ts'
import { parseFilmsCollectionJson, parseSeriesCollectionJson } from '../src/domain/collectionJsonImport.ts'
import {
  filmsCsvExportFileName,
  serializeFilmsCsvExport,
  SYLLOGE_FILMS_CSV_HEADER,
} from '../src/domain/csvFilmExport.ts'
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
const posterDialogSource = readFileSync(new URL('../src/components/TmdbPosterDialog.tsx', import.meta.url), 'utf8')
const databaseMigrationSource = readFileSync(new URL('../src-tauri/src/database.rs', import.meta.url), 'utf8')
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
assert.match(formSource, /initialValues/, 'Le formulaire doit accepter des valeurs initiales éditables')
assert.match(formSource, /onSave\(result\.data, provenance\)/, 'Le formulaire doit transmettre la provenance interne seulement à la validation finale')
assert.match(mainSource, /Saisie manuelle/, 'L’ajout de Film doit proposer la saisie manuelle')
assert.match(mainSource, /Enrichissement assisté/, 'L’ajout de Film doit proposer l’enrichissement assisté')
assert.match(mainSource, /TmdbSearchFlow/, 'Le parcours assisté doit utiliser le flux de recherche TMDB')
assert.match(mainSource, /TmdbAssociationConfirm/, 'Le parcours assisté doit confirmer l\'association avant écriture')
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
assert.match(libraryImportButtonSource, /JSON[\s\S]*CSV[\s\S]*ZIP Notion/, 'L’assistant Films doit annoncer les trois formats réellement acceptés')
assert.match(libraryImportButtonSource, /setOpen\(true\)/, 'Le premier clic doit ouvrir le dialogue d’import')
assert.doesNotMatch(libraryImportButtonSource, /setOpen\(true\)[^}]*pickAndPrepare/s, 'Le premier clic ne doit pas ouvrir immédiatement le sélecteur de fichiers')
assert.match(libraryImportButtonSource, /writingRef\.current/, 'Un double déclenchement ne doit jamais lancer deux écritures concurrentes')
assert.match(filmCsvImportFlowSource, /Table à importer/, 'Le choix d’une table Notion doit rester visible avant l’aperçu')
assert.match(filmCsvImportFlowSource, /Aucune donnée n’a été écrite/, 'Un aperçu invalide doit annoncer l’absence d’écriture')
assert.doesNotMatch(filmCsvImportFlowSource, /Nouveau profil|Créer le nouveau profil/, 'L’import CSV ou Notion ne doit plus créer de profil')
assert.match(portabilitySource, /Importer et exporter/, 'Les Paramètres doivent regrouper imports et exports dans un hub dédié')
assert.match(portabilitySource, /role="dialog"/, 'Les assistants de portabilité doivent être des dialogues accessibles')
assert.match(filmCsvImportFlowSource, /Détecté dans votre fichier/, 'Le mapping doit présenter les colonnes dans le sens source vers destination')
assert.match(filmCsvImportFlowSource, /Importer dans Sylloge/, 'Le mapping doit nommer explicitement la destination Sylloge')
assert.match(filmCsvImportFlowSource, /Seules vos données de suivi sont importées/, 'Le mapping doit expliquer le périmètre personnel de l’import')
assert.match(filmCsvImportFlowSource, /Métadonnée récupérée plus tard, non importée/, 'Les sources metadata doivent être clairement exclues dans le mapping')
assert.match(filmCsvImportFlowSource, /Fonctionnalité future, non importée/, 'Les sources de fonctionnalités futures doivent être clairement exclues dans le mapping')
assert.doesNotMatch(filmCsvImportFlowSource, /champs Films reconnus/, 'Le sélecteur Notion ne doit jamais afficher un compteur de champs reconnus')
assert.match(filmCsvImportFlowSource, /Pages Notion « Notes »/, 'Les pages Notes Notion doivent apparaître comme une source texte distincte')
assert.match(filmCsvImportFlowSource, /Évaluation/, 'La destination numérique doit être distinguée de Note personnelle')
assert.match(portabilitySource, /document\.addEventListener\('keydown', keepFocusInDialog, true\)/, 'Le dialogue doit intercepter le clavier même lorsque le focus a quitté un contrôle')
assert.match(portabilitySource, /if \(focusable\.length === 0\) \{\s+event\.preventDefault\(\)\s+dialog\.focus\(\)/s, 'Tab doit rester dans le dialogue même lorsqu’aucun contrôle ne reste actif')
assert.match(portabilitySource, /if \(event\.key === 'Escape'\) \{\s+event\.preventDefault\(\)\s+if \(!closeDisabled\) onClose\(\)/s, 'Escape doit rester sans effet pendant une écriture en cours')
assert.match(portabilitySource, /Exporter la bibliothèque complète/, 'L’export doit proposer une sauvegarde complète Sylloge')
assert.match(portabilitySource, /Exporter les Films en CSV/, 'L’export doit proposer un tableau Films explicite pour tableur')
assert.doesNotMatch(mainSource, /scrollIntoView\(\{ block: 'start' \}\)/, 'Les entrées de la sidebar Paramètres ne doivent plus faire défiler des ancres')
assert.match(mainSource, /SETTINGS_NAVIGATION/, 'La sidebar doit disposer de sa navigation locale de réglages')
assert.match(mainSource, /Importer et exporter/, 'La navigation locale doit inclure le hub Importer et exporter')
assert.match(mainSource, /Retour à la bibliothèque/, 'Les Paramètres doivent toujours proposer un retour explicite à la bibliothèque')
assert.match(mainSource, /section={settingsSection}/, 'La navigation interne doit afficher la rubrique demandée sans conserver les autres pages')
assert.match(nativePortabilityBridgeSource, /invoke\('save_export_csv'/, 'Le frontend doit appeler le pont Tauri CSV dédié')
assert.match(nativePortabilityBridgeSource, /invoke\('pick_import_any'/, 'Le frontend doit appeler le sélecteur unifié JSON, CSV ou Notion')
assert.match(tauriLibrarySource, /portability::save_export_csv/, 'La commande Tauri CSV doit être enregistrée')
assert.match(tauriLibrarySource, /portability::pick_import_any/, 'La commande Tauri d’import unifié doit être enregistrée')
assert.match(nativePortabilitySource, /\["json", "csv", "zip"\]/, 'Le sélecteur unifié doit accepter JSON, CSV et ZIP Notion')
assert.match(nativePortabilitySource, /pub async fn save_export_csv/, 'Le pont natif doit exposer une sauvegarde CSV')
assert.match(nativePortabilitySource, /"Export CSV Sylloge"/, 'Le dialogue natif CSV doit filtrer explicitement le format CSV')
assert.match(nativePortabilitySource, /MAX_NOTION_ZIP_ENTRIES/, 'Le lecteur ZIP Notion doit limiter le nombre d’entrées')
assert.match(nativePortabilitySource, /MAX_NOTION_ZIP_PATH_DEPTH/, 'Le lecteur ZIP Notion doit limiter la profondeur des dossiers')
assert.match(nativePortabilitySource, /MAX_NOTION_ZIP_NESTING_DEPTH/, 'Le lecteur ZIP Notion doit limiter la profondeur des archives imbriquées')
assert.match(nativePortabilitySource, /MAX_NOTION_ZIP_UNCOMPRESSED_BYTES/, 'Le lecteur ZIP Notion doit limiter la taille décompressée')
assert.match(nativePortabilitySource, /extract_notion_zip/, 'Le ZIP Notion doit être lu en mémoire sans extraction durable')
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
      status: 'regardé',
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
assert.match(mainSource043, /SERIES_CATEGORY_FILTERS/, 'La bibliothèque Séries doit offrir les vues globale, télé et animation')
assert.match(mainSource043, /searchSeries/, 'La recherche Séries doit reposer sur le repository')
assert.match(mediaRepositorySource, /searchSeries/, 'Le repository doit exposer la recherche Séries')
assert.match(mediaRepositorySource, /COALESCE\(progress_updated_at, updated_at\) DESC/, 'La vue récente Séries doit reposer sur l’horodatage interne de progression')

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

  const badRating = validateSeriesForm({ ...base, rating: '4.3' })
  assert.equal(badRating.success, false, 'La note doit rester par demi-points')

  const badPoster = validateSeriesForm({ ...base, posterUrl: 'ftp://affiche.jpg' })
  assert.equal(badPoster.success, false, 'L’affiche doit rester une URL http(s)')
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

  await repository.searchSeries('default', { query: '', category: 'all' })
  const globalQuery = calls.at(-1).query
  assert.ok(!globalQuery.includes('category = $'), 'La vue globale ne doit pas filtrer par catégorie')
  assert.match(globalQuery, /COALESCE\(progress_updated_at, updated_at\) DESC/, 'La vue récente doit trier par progression interne')

  await repository.searchSeries('default', { query: '', category: 'animation' })
  const animationQuery = calls.at(-1)
  assert.match(animationQuery.query, /category = \$\d+/, 'La vue animation doit filtrer la catégorie')
  assert.deepEqual(animationQuery.bindValues, ['default', 'animation'], 'Le filtre animation doit lier la catégorie demandée')

  await repository.searchSeries('default', { query: 'lupin', category: 'série télé' })
  const searchCall = calls.at(-1)
  assert.match(searchCall.query, /showrunner COLLATE NOCASE LIKE/, 'La recherche doit couvrir le showrunner')
  assert.match(searchCall.query, /casting COLLATE NOCASE LIKE/, 'La recherche doit couvrir le casting')
  assert.deepEqual(searchCall.bindValues, ['default', '%lupin%', 'série télé'], 'La recherche doit lier requête et catégorie')
}

console.log('Vérification réussie : Films SQLite canoniques, métadonnées assistées sans source ni réseau, cache TMDB Rust isolé et non portable, JSON et CSV v1 historiques réimportables, CSV et Notion mappés et prévisualisés, ZIP natif borné et imports bloqués avant toute écriture invalide. Socle multi-médiums 0.4.2 : migration 10, document sylloge-library v2, repository des quatre médiums, progression horodatée et import atomique régénérant les identifiants. Séries 0.4.3 : saisie manuelle complète, compteur de saisons +/−, bascule Vue ↔ En cours, vues globale/télé/animation triées par progression interne. Profils et portabilité 0.4.4 : import unifié JSON/CSV/ZIP Notion, remplacer/fusionner dans le profil courant, restauration globale atomique réservée à un profil vide.')
