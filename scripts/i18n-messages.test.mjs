import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import messages from '../src/i18n/catalogs/messages.ts'
import { setLanguage, translateMessage } from '../src/i18n/core.ts'
import { parseCsv } from '../src/domain/csv.ts'
import {
  createLibraryDocument,
  serializeLibraryDocument,
  validateLibraryDocument,
  SYLLOGE_LIBRARY_FORMAT,
} from '../src/domain/libraryDocument.ts'
import { validateLibraryImport, SYLLOGE_EXPORT_FORMAT } from '../src/domain/libraryTransfer.ts'
import {
  parseAnimeCollectionJson,
  parseArtworksCollectionJson,
  parseBooksCollectionJson,
  parseFilmsCollectionJson,
  parseGamesCollectionJson,
  parseMangasCollectionJson,
  parseSeriesCollectionJson,
} from '../src/domain/collectionJsonImport.ts'
import {
  normalizeImportCount,
  normalizeImportDate,
  normalizeImportRating,
  normalizeImportStatus,
} from '../src/domain/importNormalization.ts'
import { previewThirdPartyImport } from '../src/domain/thirdPartyImport.ts'
import { inspectFilmCsvImportSource, prepareFilmCsvImport, previewFilmCsvImport } from '../src/domain/filmCsvImport.ts'
import { SYLLOGE_FILMS_CSV_HEADER } from '../src/domain/csvFilmExport.ts'
import {
  prepareCollectionCsvImport,
  previewCollectionCsvImport,
} from '../src/domain/collectionCsvImport.ts'
import { BACKUP_RETENTION_SUMMARY, catalogBackupFiles } from '../src/domain/backupRestore.ts'
import { COLLECTION_CSV_CONTRACTS } from '../src/domain/collectionCsvTransfer.ts'
import { BackupService } from '../src/data/backupService.ts'
import { updaterErrorMessage } from '../src/data/updaterService.ts'
import { createProfileFromPreparation } from '../src/domain/onboarding.ts'
import { assertSavedViewAllowed } from '../src/domain/savedViews.ts'
import { SqliteLibraryRepository } from '../src/data/libraryRepository.ts'
import { confirmValidatedImport } from '../src/data/libraryTransferService.ts'
import { normalizeFilm } from '../src/domain/film.ts'

afterEach(() => setLanguage('fr'))

const seen = new Map()

/** The real French message must be catalogued exactly (key or template), and return unchanged in French. */
function expectMessage(french, english) {
  assert.equal(typeof french, 'string')
  assert.ok(!/\uFFFD/u.test(french), `Corrupted fixture: ${french}`)
  setLanguage('fr')
  assert.equal(translateMessage(french), french, 'French must stay byte-identical')
  setLanguage('en')
  const translated = translateMessage(french)
  assert.notEqual(translated, french, `No catalogue entry matched: ${JSON.stringify(french)}`)
  assert.equal(translated, english, 'English translation expected')
  seen.set(french, english)
}

function expectIn(list, french, english) {
  const found = list.find((entry) => entry.message === french || entry === french)
  assert.ok(found, `Message not produced: ${JSON.stringify(french)}\nGot: ${JSON.stringify(list.map((entry) => entry.message ?? entry), null, 2)}`)
  expectMessage(french, english)
}

const ISO = '2026-01-01T00:00:00.000Z'
const SYLLOGE_FILMS_CSV_TITLE = SYLLOGE_FILMS_CSV_HEADER.join(',')
const profile = { id: 'profil-1', name: 'Profil', createdAt: ISO, updatedAt: ISO }
const emptyLibrary = () => ({ profile, films: [], series: [], books: [], games: [], artworks: [] })
const validDocument = () => serializeLibraryDocument(createLibraryDocument(emptyLibrary(), ISO))

describe('Messages du domaine : parseur CSV', () => {
  test('les erreurs de syntaxe CSV atteignent l’écran', () => {
    const quoted = parseCsv('"a"x\n1')
    expectIn(quoted.errors, 'Une cellule CSV citée doit être suivie d’une virgule ou de la fin de ligne.', 'A quoted CSV cell must be followed by a comma or the end of the line.')
    const midCell = parseCsv('ab"cd\n1')
    expectIn(midCell.errors, 'Un guillemet doit commencer au début d’une cellule CSV.', 'A quote must start at the beginning of a CSV cell.')
    const unclosed = parseCsv('"abc\n1')
    expectIn(unclosed.errors, 'Une cellule CSV citée n’est pas fermée.', 'A quoted CSV cell is not closed.')
    expectIn(parseCsv('').errors, 'Le CSV ne contient aucune ligne d’en-tête.', 'The CSV has no header row.')
    expectIn(parseCsv(',a\n1,2').errors, 'Chaque colonne CSV doit avoir un en-tête non vide.', 'Every CSV column must have a non-empty header.')
  })

  test('un en-tête en double garde la valeur capturée intacte, y compris $& et les guillemets', () => {
    const table = parseCsv('"$& “Été”","$& “Été”"\n1,2')
    expectIn(table.errors, 'L’en-tête « $& “Été” » est présent plusieurs fois.', 'The header “$& “Été”” appears more than once.')
    const multiline = parseCsv('"a\nb","a\nb"\n1,2')
    expectIn(multiline.errors, 'L’en-tête « a\nb » est présent plusieurs fois.', 'The header “a\nb” appears more than once.')
  })

  test('le nombre de cellules est comparé à l’en-tête', () => {
    const table = parseCsv('A,B,C\n1,2')
    expectIn(table.errors, 'Cette ligne contient 2 cellules alors que l’en-tête en définit 3.', 'This row has 2 cells while the header defines 3.')
  })
})

describe('Messages du domaine : import JSON historique', () => {
  test('les erreurs de contrat sont traduites sans toucher aux données', () => {
    expectIn(validateLibraryImport('pas du json').errors, 'Le fichier ne contient pas un JSON valide.', 'The file does not contain valid JSON.')
    expectIn(validateLibraryImport('[]').errors, 'La racine du fichier doit être un objet JSON.', 'The file root must be a JSON object.')
    const document = (overrides) => JSON.stringify({
      format: SYLLOGE_EXPORT_FORMAT, version: 1, exportedAt: ISO, profile: { id: 'p1', name: 'Profil', createdAt: ISO, updatedAt: ISO }, films: [], ...overrides,
    })
    expectIn(validateLibraryImport(document({ format: 'autre' })).errors, 'Le format attendu est « sylloge-films ».', 'The expected format is “sylloge-films”.')
    expectIn(validateLibraryImport(document({ version: 9 })).errors, 'Seule la version 1 est prise en charge.', 'Only version 1 is supported.')
    expectIn(validateLibraryImport(document({ films: 'non' })).errors, 'La liste des films doit être un tableau.', 'The films list must be an array.')
    expectIn(validateLibraryImport(document({ profile: 'non' })).errors, 'Le profil doit être un objet.', 'The profile must be an object.')
    expectIn(validateLibraryImport(document({ films: ['non'] })).errors, 'Cette entrée doit être un objet Film.', 'This entry must be a film object.')
    const film = (overrides) => ({
      id: 'f1', profileId: 'p1', title: 'Titre', originalTitle: null, year: null, status: 'à découvrir',
      isFavorite: false, rating: null, watchedAt: null, personalNote: null, director: null, summary: null,
      providerName: null, providerId: null, posterUrl: null, createdAt: ISO, updatedAt: ISO, ...overrides,
    })
    expectIn(validateLibraryImport(document({ films: [film({ id: 'dup' }), film({ id: 'dup' })] })).errors, 'Cet identifiant Film est présent plusieurs fois.', 'This film identifier appears more than once.')
    expectIn(validateLibraryImport(document({ films: [film({ profileId: 'autre' })] })).errors, 'Le film ne correspond pas au profil exporté.', 'The film does not match the exported profile.')
    expectIn(validateLibraryImport(document({ films: [film({ year: -2 })] })).errors, 'L’année doit être nulle ou un entier positif.', 'The year must be null or a positive whole number.')
    expectIn(validateLibraryImport(document({ films: [film({ status: 'inconnu' })] })).errors, 'Le statut Film est inconnu.', 'The film status is unknown.')
    expectIn(validateLibraryImport(document({ films: [film({ isFavorite: 'oui' })] })).errors, 'La valeur favori doit être un booléen.', 'The favourite value must be a boolean.')
    expectIn(validateLibraryImport(document({ films: [film({ rating: 9 })] })).errors, 'La note doit être nulle ou aller de 0,5 à 5 par demi-points.', 'The rating must be null or between 0.5 and 5 in half-point steps.')
    expectIn(validateLibraryImport(document({ films: [film({ watchedAt: '2026-13-01' })] })).errors, 'La date de visionnage doit être nulle ou au format AAAA-MM-JJ.', 'The watch date must be null or in YYYY-MM-DD format.')
    expectIn(validateLibraryImport(document({ films: [film({ posterUrl: 'ftp://x' })] })).errors, 'L’URL d’affiche doit être nulle ou commencer par http:// ou https://.', 'The poster URL must be null or start with http:// or https://.')
    const { title, ...withoutTitle } = film({})
    expectIn(validateLibraryImport(document({ films: [withoutTitle] })).errors, 'Ce champ est obligatoire dans la version 1.', 'This field is required in version 1.')
    expectIn(validateLibraryImport(document({ films: [film({ extra: 1 })] })).errors, 'Ce champ n’appartient pas au format version 1.', 'This field does not belong to format version 1.')
    expectIn(validateLibraryImport(document({ films: [film({ title: '' })] })).errors, 'Une chaîne de caractères non vide est attendue.', 'A non-empty string is expected.')
    expectIn(validateLibraryImport(document({ films: [film({ director: 2 })] })).errors, 'Une chaîne de caractères ou null est attendue.', 'A string or null is expected.')
    expectIn(validateLibraryImport(document({ exports: 1 })).errors, 'Ce champ n’appartient pas au format version 1.', 'This field does not belong to format version 1.')
    expectIn(validateLibraryImport(document({ exportedAt: '2026-01-01' })).errors, 'Un horodatage UTC ISO 8601 est attendu.', 'An ISO 8601 UTC timestamp is expected.')
  })
})

describe('Messages du domaine : document de bibliothèque v1–v4', () => {
  const errorsOf = (value) => validateLibraryDocument(JSON.stringify(value)).errors
  const document = (overrides) => ({ ...createLibraryDocument(emptyLibrary(), ISO), ...overrides })

  test('racine, format et version', () => {
    expectIn(validateLibraryDocument('pas du json').errors, 'Le fichier ne contient pas un JSON valide.', 'The file does not contain valid JSON.')
    expectIn(validateLibraryDocument('[]').errors, 'La racine du fichier doit être un objet JSON.', 'The file root must be a JSON object.')
    expectIn(errorsOf(document({ format: 'autre' })), 'Le format attendu est « sylloge-library ».', 'The expected format is “sylloge-library”.')
    expectIn(errorsOf(document({ version: 9 })), 'Les versions 1 à 4 du document sont prises en charge.', 'Document versions 1 to 4 are supported.')
  })

  test('sections, bibliothèques personnalisées et entrées', () => {
    expectIn(errorsOf(document({ films: 'non' })), 'Cette section doit être un tableau.', 'This section must be an array.')
    expectIn(errorsOf(document({ profile: 'non' })), 'Le profil doit être un objet.', 'The profile must be an object.')
    expectIn(errorsOf(document({ films: ['non'] })), 'Cette entrée doit être un objet Film.', 'This entry must be a film object.')
    expectIn(errorsOf(document({ films: [{ id: 'x' }] })), 'Une chaîne de caractères non vide est attendue.', 'A non-empty string is expected.')
    expectIn(errorsOf(document({ customLibraries: 'non' })), 'Cette section doit être un tableau.', 'This section must be an array.')
    expectIn(errorsOf(document({ customLibraries: ['non'] })), 'Cette bibliothèque doit être un objet.', 'This library must be an object.')
    expectIn(errorsOf(document({ customLibraries: [{ libraryId: 'inconnue', position: 0, addedAt: ISO, entries: [] }] })), 'Cette bibliothèque personnalisée est inconnue.', 'This custom library is unknown.')
    expectIn(errorsOf(document({ customLibraries: [
      { libraryId: 'comics', position: 0, addedAt: ISO, entries: [] },
      { libraryId: 'comics', position: 1, addedAt: ISO, entries: [] },
    ] })), 'Cette bibliothèque est présente plusieurs fois.', 'This library appears more than once.')
    expectIn(errorsOf(document({ customLibraries: [{ libraryId: 'comics', position: -1, addedAt: ISO, entries: [] }] })), 'La position doit être un entier positif ou nul.', 'The position must be a non-negative whole number.')
  })

  test('fiches Série, Livre, Jeu et Œuvre d’art', () => {
    const film = (overrides) => ({ ...createLibraryDocument({ ...emptyLibrary(), films: [normalizeFilm({ id: 'f1', profileId: 'profil-1', title: 'Titre' })] }, ISO).films[0], ...overrides })
    expectIn(errorsOf(document({ films: [film({ rating: 6 })] })), 'La note doit être nulle ou aller de 0,5 à 5 par demi-points.', 'The rating must be null or between 0.5 and 5 in half-point steps.')
    expectIn(errorsOf(document({ films: [film({ year: 0 })] })), 'L’année doit être nulle ou un entier positif.', 'The year must be null or a positive whole number.')
    const series = { id: 's1', profileId: 'profil-1', title: 'Série', showrunner: null, casting: null, summary: null, category: 'animation', status: 'à voir', rating: null, isFavorite: false, seasonsSeen: null, seasonsTotal: null, progressUpdatedAt: null, startedAt: null, posterUrl: null, personalNote: null, createdAt: ISO, updatedAt: ISO }
    expectIn(errorsOf(document({ series: [series] })), 'La section Séries n’accepte que la catégorie « série télé ».', 'The Series section only accepts the “série télé” category.')
    expectIn(errorsOf(document({ anime: [{ ...series, category: 'série télé' }] })), 'La section Animation japonaise n’accepte que la catégorie « animation ».', 'The Anime section only accepts the “animation” category.')
    expectIn(errorsOf(document({ series: [{ ...series, category: 'série télé', status: 'inconnu' }] })), 'Le statut Série est inconnu.', 'The series status is unknown.')
    expectIn(errorsOf(document({ series: [{ ...series, category: 'série télé', seasonsSeen: 2, seasonsTotal: 1 }] })), 'Les saisons vues ne peuvent pas dépasser le total de saisons.', 'Watched seasons cannot exceed the total number of seasons.')
    const book = { id: 'b1', profileId: 'profil-1', title: 'Livre', author: null, year: null, summary: null, category: 'livre', status: 'à lire', rating: null, isFavorite: false, volumesRead: null, volumesTotal: null, progressUpdatedAt: null, startedAt: null, coverUrl: null, personalNote: null, quotes: [], createdAt: ISO, updatedAt: ISO }
    expectIn(errorsOf(document({ books: [{ ...book, category: 'comics' }] })), 'Les comics ont leur propre bibliothèque : la section Livres ne les accepte pas.', 'Comics have their own library: the Books section does not accept them.')
    expectIn(errorsOf(document({ books: [{ ...book, category: 'manga' }] })), 'La section Livres n’accepte pas la catégorie « manga ».', 'The Books section does not accept the “manga” category.')
    expectIn(errorsOf(document({ mangas: [{ ...book, category: 'livre' }] })), 'La section Mangas n’accepte que la catégorie « manga ».', 'The Manga section only accepts the “manga” category.')
    expectIn(errorsOf(document({ mangas: [{ ...book, category: 'manga', status: 'inconnu' }] })), 'Le statut Livre est inconnu.', 'The book status is unknown.')
    expectIn(errorsOf(document({ mangas: [{ ...book, category: 'manga', volumesRead: 4, volumesTotal: 2 }] })), 'Les tomes lus ne peuvent pas dépasser le total de tomes.', 'Read volumes cannot exceed the total number of volumes.')
    const game = { id: 'g1', profileId: 'profil-1', title: 'Jeu', developer: null, platform: null, year: null, status: 'à jouer', rating: null, isFavorite: false, playedAt: null, coverUrl: null, personalNote: null, createdAt: ISO, updatedAt: ISO }
    expectIn(errorsOf(document({ games: [{ ...game, status: 'inconnu' }] })), 'Le statut Jeu est inconnu.', 'The game status is unknown.')
    const artwork = { id: 'a1', profileId: 'profil-1', title: 'Œuvre', artist: null, year: null, form: 'peinture', location: null, exhibition: null, status: 'découverte', isFavorite: false, discoveredAt: null, imageUrl: null, personalNote: null, customFields: [], createdAt: ISO, updatedAt: ISO }
    expectIn(errorsOf(document({ artworks: [{ ...artwork, form: 'inconnue' }] })), 'La forme d’art est inconnue.', 'The art form is unknown.')
    expectIn(errorsOf(document({ artworks: [{ ...artwork, status: 'inconnu' }] })), 'Le statut Œuvre d’art est inconnu.', 'The artwork status is unknown.')
    expectIn(errorsOf(document({ artworks: [{ ...artwork, customFields: 'non' }] })), 'Les champs personnalisés doivent être un tableau.', 'Custom fields must be an array.')
    expectIn(errorsOf(document({ artworks: [{ ...artwork, customFields: ['non'] }] })), 'Ce champ personnalisé doit être un objet.', 'This custom field must be an object.')
  })

  test('les messages de date et d’URL portent le libellé exact du champ', () => {
    const film = { ...createLibraryDocument({ ...emptyLibrary(), films: [normalizeFilm({ id: 'f1', profileId: 'profil-1', title: 'Titre' })] }, ISO).films[0], watchedAt: '2026-13-01' }
    expectIn(errorsOf(document({ films: [film] })), 'La date de visionnage doit être nulle ou au format AAAA-MM-JJ.', 'The watch date must be null or in YYYY-MM-DD format.')
    expectIn(errorsOf(document({ films: [{ ...film, watchedAt: null, posterUrl: 'ftp://x' }] })), 'L’URL d’affiche doit être nulle ou commencer par http:// ou https://.', 'The poster URL must be null or start with http:// or https://.')
    const series = { id: 's1', profileId: 'profil-1', title: 'Série', showrunner: null, casting: null, summary: null, category: 'série télé', status: 'à voir', rating: null, isFavorite: false, seasonsSeen: null, seasonsTotal: null, progressUpdatedAt: null, startedAt: '2026-13-01', posterUrl: null, personalNote: null, createdAt: ISO, updatedAt: ISO }
    expectIn(errorsOf(document({ series: [series] })), 'La date de début de visionnage doit être nulle ou au format AAAA-MM-JJ.', 'The watch start date must be null or in YYYY-MM-DD format.')
    const book = { id: 'b1', profileId: 'profil-1', title: 'Livre', author: null, year: null, summary: null, category: 'livre', status: 'à lire', rating: null, isFavorite: false, volumesRead: null, volumesTotal: null, progressUpdatedAt: null, startedAt: '2026-13-01', coverUrl: 'ftp://x', personalNote: null, quotes: [], createdAt: ISO, updatedAt: ISO }
    expectIn(errorsOf(document({ books: [book] })), 'La date de début de lecture doit être nulle ou au format AAAA-MM-JJ.', 'The reading start date must be null or in YYYY-MM-DD format.')
    expectIn(errorsOf(document({ books: [book] })), 'L’URL de couverture doit être nulle ou commencer par http:// ou https://.', 'The cover URL must be null or start with http:// or https://.')
    const game = { id: 'g1', profileId: 'profil-1', title: 'Jeu', developer: null, platform: null, year: null, status: 'à jouer', rating: null, isFavorite: false, playedAt: '2026-13-01', coverUrl: null, personalNote: null, createdAt: ISO, updatedAt: ISO }
    expectIn(errorsOf(document({ games: [game] })), 'La date de jeu doit être nulle ou au format AAAA-MM-JJ.', 'The play date must be null or in YYYY-MM-DD format.')
    const artwork = { id: 'a1', profileId: 'profil-1', title: 'Œuvre', artist: null, year: null, form: 'peinture', location: null, exhibition: null, status: 'découverte', isFavorite: false, discoveredAt: '2026-13-01', imageUrl: 'ftp://x', personalNote: null, customFields: [], createdAt: ISO, updatedAt: ISO }
    expectIn(errorsOf(document({ artworks: [artwork] })), 'La date de découverte doit être nulle ou au format AAAA-MM-JJ.', 'The discovery date must be null or in YYYY-MM-DD format.')
    expectIn(errorsOf(document({ artworks: [artwork] })), 'L’URL du visuel doit être nulle ou commencer par http:// ou https://.', 'The image URL must be null or start with http:// or https://.')
  })

  test('les versions contrôlent les clés exactes', () => {
    const v3 = { ...createLibraryDocument(emptyLibrary(), ISO), version: 3 }
    delete v3.customLibraries
    expectIn(validateLibraryDocument(JSON.stringify({ ...v3, films: [{ id: 'f1', profileId: 'profil-1', title: 'Titre', inconnu: 1 }] })).errors, 'Ce champ n’appartient pas au format version 3.', 'This field does not belong to format version 3.')
    expectIn(validateLibraryDocument(JSON.stringify({ ...v3, films: [{ id: 'f1', profileId: 'profil-1', title: 'Titre' }] })).errors, 'Ce champ est obligatoire dans la version 3.', 'This field is required in version 3.')
  })
})

describe('Messages du domaine : import JSON par collection', () => {
  test('chaque bibliothèque vide explique ce qui manque', () => {
    const text = validDocument()
    expectIn([{ message: parseFilmsCollectionJson(text).error }], 'Ce fichier Sylloge ne contient aucun film à importer.', 'This Sylloge file contains no films to import.')
    expectIn([{ message: parseSeriesCollectionJson(text).error }], 'Ce fichier Sylloge ne contient aucune série à importer.', 'This Sylloge file contains no series to import.')
    expectIn([{ message: parseAnimeCollectionJson(text).error }], 'Ce fichier Sylloge ne contient aucune animation japonaise à importer.', 'This Sylloge file contains no anime to import.')
    expectIn([{ message: parseBooksCollectionJson(text).error }], 'Ce fichier Sylloge ne contient aucun livre à importer.', 'This Sylloge file contains no books to import.')
    expectIn([{ message: parseMangasCollectionJson(text).error }], 'Ce fichier Sylloge ne contient aucun manga à importer.', 'This Sylloge file contains no manga to import.')
    expectIn([{ message: parseGamesCollectionJson(text).error }], 'Ce fichier Sylloge ne contient aucun jeu à importer.', 'This Sylloge file contains no games to import.')
    expectIn([{ message: parseArtworksCollectionJson(text).error }], 'Ce fichier Sylloge ne contient aucune œuvre d’art à importer.', 'This Sylloge file contains no artworks to import.')
  })

  test('fichier invalide, export historique et comics séparés', () => {
    expectIn([{ message: parseSeriesCollectionJson('{}').error }], 'Le fichier n’est pas une bibliothèque Sylloge (versions 1 à 4) valide. Aucune donnée n’a été écrite.', 'The file is not a valid Sylloge library (versions 1 to 4). No data has been written.')
    expectIn([{ message: parseFilmsCollectionJson('pas du json').error }], 'Le fichier n’est pas un export Sylloge valide (JSON Films v1 ou bibliothèque v3). Aucune donnée n’a été écrite.', 'The file is not a valid Sylloge export (Films JSON v1 or library v3). No data has been written.')
    const comicsEntry = { id: 'e1', profileId: 'profil-1', title: 'Comic', creator: null, year: null, status: 'à découvrir', rating: null, isFavorite: false, progressCurrent: null, progressTotal: null, progressUpdatedAt: null, startedAt: null, finishedAt: null, coverUrl: null, summary: null, personalNote: null, details: {}, quotes: [], createdAt: ISO, updatedAt: ISO, discoveredAt: null, imageUrl: null }
    const withComics = serializeLibraryDocument(createLibraryDocument({
      ...emptyLibrary(), customLibraries: [{ libraryId: 'comics', position: 0, addedAt: ISO, entries: [comicsEntry] }],
    }, ISO))
    expectIn([{ message: parseBooksCollectionJson(withComics).error }], 'Ce fichier ne contient aucun livre. Ses comics ont leur propre bibliothèque : restaurez la sauvegarde complète pour les retrouver.', 'This file contains no books. Its comics have their own library: restore the full backup to recover them.')
  })
})

describe('Messages du domaine : normalisation tolérante', () => {
  test('chaque valeur illisible devient un avertissement traduit', () => {
    expectIn([{ message: normalizeImportStatus('film', 'peut-être').warning }], '« peut-être » n’est pas un statut reconnu — champ laissé vide.', '“peut-être” is not a recognised status — field left empty.')
    expectIn([{ message: normalizeImportRating('excellent').warning }], 'Note « excellent » illisible — champ laissé vide.', 'Unreadable rating “excellent” — field left empty.')
    expectIn([{ message: normalizeImportRating('0').warning }], 'Note hors bornes — champ laissé vide.', 'Rating out of range — field left empty.')
    expectIn([{ message: normalizeImportDate('32/13/2026').warning }], 'Date « 32/13/2026 » invalide — champ laissé vide.', 'Invalid date “32/13/2026” — field left empty.')
    expectIn([{ message: normalizeImportDate('bientôt').warning }], 'Date « bientôt » illisible — champ laissé vide.', 'Unreadable date “bientôt” — field left empty.')
    expectIn([{ message: normalizeImportCount('douze').warning }], 'Compteur « douze » illisible — champ laissé vide.', 'Unreadable count “douze” — field left empty.')
  })
})

describe('Messages du domaine : import CSV de collection', () => {
  test('mapping absent et titre non mappé', () => {
    const session = prepareCollectionCsvImport('series', 'Titre,Statut\nSérie,vu\n')
    expectIn(previewCollectionCsvImport(session, null).errors, 'Le mapping CSV est introuvable.', 'The CSV mapping is missing.')
    expectIn(previewCollectionCsvImport(session, { title: null, status: 'Statut' }).errors, 'Le titre doit être mappé avant de pouvoir préparer l’import.', 'The title must be mapped before the import can be prepared.')
  })

  test('avertissements composés avec le libellé du champ', () => {
    const session = prepareCollectionCsvImport('series', 'Titre,Statut,Saisons vues\nSérie,peut-être,douze\n')
    const errors = previewCollectionCsvImport(session, { title: 'Titre', status: 'Statut', seasonsSeen: 'Saisons vues' }).errors
    expectIn(errors, 'Statut « peut-être » n’est pas un statut reconnu — champ laissé vide.', 'Status “peut-être” is not a recognised status — field left empty.')
    expectIn(errors, 'Saisons vues : Compteur « douze » illisible — champ laissé vide.', 'Seasons watched: unreadable count “douze” — field left empty.')
    const dates = prepareCollectionCsvImport('books', 'Titre,Début de lecture\nLivre,32/13/2026\n')
    expectIn(previewCollectionCsvImport(dates, { title: 'Titre', startedAt: 'Début de lecture' }).errors, 'Début de lecture : Date « 32/13/2026 » invalide — champ laissé vide.', 'Reading start: invalid date “32/13/2026” — field left empty.')
    const games = prepareCollectionCsvImport('games', 'Titre,Année\nJeu,douze\n')
    expectIn(previewCollectionCsvImport(games, { title: 'Titre', year: 'Année' }).errors, 'Année : Compteur « douze » illisible — champ laissé vide.', 'Year: unreadable count “douze” — field left empty.')
  })

  test('contrat CSV Sylloge : format, version, JSON, favori et nombre', () => {
    const entity = COLLECTION_CSV_CONTRACTS.series.entityHeaders
    const header = [...['format', 'version', 'exported_at', 'profile_id', 'profile_name', 'profile_created_at', 'profile_updated_at'], ...entity].join(',')
    const values = Array(7 + entity.length).fill('')
    Object.assign(values, { 0: 'sylloge-series-csv', 1: '1', 2: ISO, 3: 'p1', 4: 'Profil', 5: ISO, 6: ISO, 7: 's1', 8: 'p1', 9: 'Titre', 13: 'série télé', 14: 'vu', 16: 'non', 17: '2', 18: '1' })
    const row = (overrides = {}) => Object.assign([...values], overrides).join(',')
    const preview = (line) => previewCollectionCsvImport(prepareCollectionCsvImport('series', `${header}\n${line}\n`), {})
    expectIn(preview(row({ 1: '2' })).errors, 'La version CSV attendue est 1.', 'The expected CSV version is 1.')
    expectIn(preview(row({ 0: 'autre' })).errors, 'Le format attendu est « sylloge-series-csv ».', 'The expected format is “sylloge-series-csv”.')
    expectIn(preview(row({ 16: 'peut-être' })).errors, 'Le favori Sylloge doit valoir true ou false.', 'The Sylloge favourite value must be true or false.')
    expectIn(preview(row({ 17: 'deux' })).errors, 'Un nombre Sylloge valide est attendu.', 'A valid Sylloge number is expected.')
    expectIn(previewCollectionCsvImport(prepareCollectionCsvImport('series', header), {}).errors, 'Le CSV Sylloge ne contient aucune ligne de profil.', 'The Sylloge CSV contains no profile row.')
    expectIn(previewCollectionCsvImport(prepareCollectionCsvImport('series', `${header}\n${row()}\n${row({ 3: 'p2' })}\n`), {}).errors, 'Les métadonnées de profil et d’export doivent être identiques sur chaque ligne Sylloge.', 'Profile and export metadata must be identical on every Sylloge row.')
  })

  test('mapping : destination inconnue et colonne déjà utilisée', () => {
    const session = prepareCollectionCsvImport('series', 'Titre,Statut\nSérie,vu\n')
    expectIn(previewCollectionCsvImport(session, { title: 'Titre', statut: 'Statut' }).errors, 'Cette destination ne fait pas partie du contrat de cette collection.', 'This destination is not part of this collection’s contract.')
    expectIn(previewCollectionCsvImport(session, { title: 'Titre', status: 'Titre' }).errors, 'La colonne « Titre » est déjà envoyée vers « Titre ».', 'The column “Titre” is already mapped to “Titre”.')
  })

  test('type comics et citations inhabituelles', () => {
    const books = prepareCollectionCsvImport('books', 'Titre,Catégorie,Citations\nLivre,comics,"pas du json"\n')
    const errors = previewCollectionCsvImport(books, { title: 'Titre', category: 'Catégorie', quotes: 'Citations' }).errors
    expectIn(errors, 'Type « comics » : les comics ont leur propre bibliothèque ; cette fiche sera importée comme livre.', '“comics” type: comics have their own library; this entry will be imported as a book.')
    expectIn(errors, 'Citations en texte libre — importées comme une citation unique.', 'Plain-text quotes — imported as a single quote.')
    const unexpected = previewCollectionCsvImport(prepareCollectionCsvImport('books', 'Titre,Citations\nLivre,"[1,2]"\n'), { title: 'Titre', quotes: 'Citations' }).errors
    expectIn(unexpected, 'Citations dans un format inattendu — laissées vides.', 'Quotes in an unexpected format — left empty.')
  })
})

describe('Messages du domaine : import tiers Letterboxd et Goodreads', () => {
  const goodreads = (rows) => [
    'Book Id,Title,Author,My Rating,Exclusive Shelf,Year Published,My Review,Private Notes',
    ...rows,
  ].join('\n')

  test('Goodreads : statut, note et doublons', () => {
    const preview = previewThirdPartyImport({ name: 'library.csv', contents: goodreads([
      '1,Livre A,Autrice,4,read,2020,,',
      '2,Livre B,Autrice,12,currently-reading,2021,Mon avis,"note"',
      '3,Livre C,Autrice,,reading,2019,,',
      '4,Livre A,Autrice,,to-read,2019,,',
    ]) }, 'books', ISO)
    expectIn(preview.errors, 'Statut Goodreads inconnu : read, currently-reading ou to-read est attendu.', 'Unknown Goodreads status: read, currently-reading or to-read is expected.')
    expectIn(preview.errors, 'Une note personnelle Goodreads doit être un entier de 1 à 5 ; 0 signifie sans note.', 'A Goodreads personal rating must be a whole number from 1 to 5; 0 means unrated.')
    expectIn(preview.errors, 'Le titre « Livre A » apparaît plusieurs fois. Résolvez ce doublon dans le fichier source avant l’import.', 'The title “Livre A” appears more than once. Resolve this duplicate in the source file before importing.')
    expectIn(preview.warnings, 'L’avis et les notes privées sont conservés ensemble dans la note personnelle, séparés par « [Notes privées Goodreads] ».', 'The review and private notes are kept together in the personal note, separated by “[Notes privées Goodreads]”.')
    expectIn(preview.warnings, 'Colonnes non importées : Book Id. Read Count n’est pas un nombre de tomes. Le fichier source reste inchangé.', 'Columns not imported: Book Id. Read Count is not a volume count. The source file stays unchanged.')
    expectIn(preview.warnings, 'Date Read est une fin de lecture, Date Added un ajout Goodreads. Sylloge ne possède qu’une date de début de lecture : ces dates ne sont pas importées et aucun début n’est inventé.', 'Date Read is a reading end date and Date Added a Goodreads addition date. Sylloge has only a reading start date: these dates are not imported and no start date is invented.')
  })

  test('Goodreads : livre à lire déjà noté et mauvais service', () => {
    const preview = previewThirdPartyImport({ name: 'library.csv', contents: goodreads([
      '1,Livre A,Autrice,4,to-read,2020,,"note"',
    ]) }, 'books', ISO)
    expectIn(preview.errors, 'Ce livre à lire contient déjà une note ou un avis. Ce statut effacerait ces champs dans Sylloge : conservez le fichier original et corrigez le statut dans une copie CSV avant l’import.', 'This to-read book already has a rating or a review. That status would erase those fields in Sylloge: keep the original file and correct the status in a CSV copy before importing.')
    const wrong = previewThirdPartyImport({ name: 'library.csv', contents: goodreads(['1,Livre A,Autrice,4,read,2020,,']) }, 'films', ISO)
    expectIn(wrong.errors, 'Cet export Goodreads contient des Livres. Ouvrez la bibliothèque Livres pour l’importer.', 'This Goodreads export contains books. Open the Books library to import it.')
  })

  test('Letterboxd : doublons, nom contradictoire et colonnes ignorées', () => {
    const contents = ['Date,Name,Year,Letterboxd URI,Rating,Review', '2026-01-01,Film A,2020,uri-a,4,', '2026-01-02,Film A,2020,uri-b,5,'].join('\n')
    const preview = previewThirdPartyImport({ name: 'ratings.csv', contents }, 'films', ISO)
    expectIn(preview.errors, 'Le titre « Film A » apparaît plusieurs fois. Résolvez ce doublon dans le fichier source ; aucun historique de revisionnage ne peut être fusionné automatiquement.', 'The title “Film A” appears more than once. Resolve this duplicate in the source file; no rewatch history can be merged automatically.')
    expectIn(preview.warnings, '« Date » est la date d’activité Letterboxd, pas la date de visionnage. Aucune date de visionnage n’est inventée.', '“Date” is the Letterboxd activity date, not the watch date. No watch date is invented.')
    expectIn(preview.warnings, 'Colonnes non importées : Date, Year, Letterboxd URI. Le fichier source reste inchangé.', 'Columns not imported: Date, Year, Letterboxd URI. The source file stays unchanged.')
    const conflicting = previewThirdPartyImport({ name: 'watchlist.csv', contents }, 'films', ISO)
    expectIn(conflicting.errors, 'Le nom du fichier Letterboxd et ses colonnes sont contradictoires. Vérifiez le fichier ou son nom avant l’import.', 'The Letterboxd filename and its columns contradict each other. Check the file or its name before importing.')
    const wrong = previewThirdPartyImport({ name: 'ratings.csv', contents }, 'books', ISO)
    expectIn(wrong.errors, 'Cet export Letterboxd contient des Films. Ouvrez la bibliothèque Films pour l’importer.', 'This Letterboxd export contains films. Open the Films library to import it.')
  })

  test('Letterboxd : archive ambiguë, fichiers exclus et archive vide', () => {
    const ambiguous = ['Date,Name,Year,Letterboxd URI', '2026-01-01,Film A,2020,uri-a'].join('\n')
    const contents = ['Date,Name,Year,Letterboxd URI,Rating', '2026-01-01,Film B,2021,uri-b,4'].join('\n')
    expectIn(previewThirdPartyImport({ name: 'export.csv', contents: ambiguous }, 'films', ISO).errors, 'Les colonnes sont communes à watched.csv et watchlist.csv. Choisissez explicitement la liste de films vus ou la liste à voir.', 'The columns are shared by watched.csv and watchlist.csv. Choose explicitly the watched list or the watchlist.')
    const archive = {
      name: 'letterboxd.zip', kind: 'container', contents: null, markdownPages: [], csvCandidates: [],
      containerCandidates: [
        { id: '1', name: 'ratings.csv', contents, kind: 'csv' },
        { id: '2', name: 'deleted/ratings.csv', contents: ambiguous, kind: 'csv' },
        { id: '3', name: 'autre.csv', contents: ambiguous, kind: 'csv' },
      ],
    }
    const preview = previewThirdPartyImport(archive, 'films', ISO)
    expectIn(preview.warnings, 'Contenu supprimé dans Letterboxd : ce fichier est exclu pour ne pas rétablir des fiches supprimées.', 'Deleted content in Letterboxd: this file is excluded so deleted entries are not restored.')
    expectIn(preview.warnings, 'Ce fichier de l’archive n’est pas importé. Seuls ratings.csv, watched.csv, watchlist.csv, diary.csv et reviews.csv sont regroupés.', 'This archive file is not imported. Only ratings.csv, watched.csv, watchlist.csv, diary.csv and reviews.csv are combined.')
    const duplicated = previewThirdPartyImport({
      name: 'letterboxd.zip', kind: 'container', contents: null, markdownPages: [], csvCandidates: [],
      containerCandidates: [
        { id: '1', name: 'ratings.csv', contents, kind: 'csv' },
        { id: '2', name: 'ratings.csv', contents, kind: 'csv' },
      ],
    }, 'films', ISO)
    expectIn(duplicated.errors, 'Plusieurs fichiers ratings.csv sont présents. Cette archive semble réunir plusieurs exports : choisissez une seule archive Letterboxd.', 'Several ratings.csv files are present. This archive seems to combine several exports: choose a single Letterboxd archive.')
    const contradictory = previewThirdPartyImport({ name: 'letterboxd.zip', kind: 'container', contents: null, markdownPages: [], csvCandidates: [], containerCandidates: [{ id: '1', name: 'ratings.csv', kind: 'csv', contents: ['Date,Name,Year,Letterboxd URI,Rating', '2026-01-01,Film A,2020,uri-a,4', '2026-01-02,Film A,2020,uri-b,5'].join('\n') }] }, 'films', ISO)
    expectIn(contradictory.errors, 'Le film « Film A » présente une identité ou des notes contradictoires. Aucun choix de ligne n’est fait automatiquement.', 'The film “Film A” has conflicting identity or ratings. No row is chosen automatically.')
  })

  test('taille, encodage et horodatage', () => {
    const header = 'Date,Name,Year,Letterboxd URI'
    expectIn(previewThirdPartyImport({ name: 'a.csv', contents: `${header}\n2026-01-01,Film\u0000A,2020,uri` }, 'films', ISO).errors, 'Le fichier contient un caractère NUL : vérifiez son encodage UTF-8 avant l’import.', 'The file contains a NUL character: check its UTF-8 encoding before importing.')
    const oversized = `${header}\n2026-01-01,${'a'.repeat(16 * 1024 * 1024)},2020,uri`
    expectIn(previewThirdPartyImport({ name: 'a.csv', contents: oversized }, 'films', ISO).errors, 'Ce fichier texte dépasse la limite sûre de 16 Mio.', 'This text file exceeds the safe 16 MiB limit.')
    expectIn(previewThirdPartyImport({ name: 'a.csv', contents: header }, 'films', '2026-01-01').errors, 'L’horodatage de préparation doit être UTC ISO 8601.', 'The preparation timestamp must be ISO 8601 UTC.')
    expectIn(previewThirdPartyImport({ name: 'a.csv', contents: header }, 'films', ISO).errors, 'Cet export ne contient aucune fiche. Un fichier vide ne peut pas remplacer une bibliothèque.', 'This export contains no entries. An empty file cannot replace a library.')
  })
})

describe('Messages du domaine : import CSV Films', () => {
  const source = (contents, markdownPages = []) => ({ name: 'films.csv', kind: 'csv', csvCandidates: [{ id: 'csv-0', name: 'films.csv', contents }], markdownPages })
  const only = (overrides) => ({ title: null, status: null, rating: null, watchedAt: null, personalNote: null, isFavorite: null, ...overrides })
  const configuration = (overrides = {}) => ({ profileName: 'Profil', mapping: only({ title: 'Titre' }), markdownNotes: false, ratingScale: 5, ...overrides })
  const preview = (contents, config = configuration(), markdownPages = []) => previewFilmCsvImport(prepareFilmCsvImport(source(contents, markdownPages)), source(contents, markdownPages), config, ISO)

  test('mapping absent, titre non mappé et profil sans nom', () => {
    expectIn(preview('Titre\nFilm\n', null).errors, 'Le mapping CSV est introuvable.', 'The CSV mapping is missing.')
    expectIn(preview('Titre\nFilm\n', configuration({ mapping: only({}) })).errors, 'Le titre doit être mappé avant de pouvoir préparer l’import.', 'The title must be mapped before the import can be prepared.')
    expectIn(preview('Titre\nFilm\n', configuration({ profileName: '  ' })).errors, 'Le profil courant doit avoir un nom explicite.', 'The current profile needs an explicit name.')
  })

  test('échelles de notes', () => {
    const mixed = 'Titre,Note\nFilm,4/5\nAutre,8/10\n'
    expectIn(preview(mixed, configuration({ mapping: only({ title: 'Titre', rating: 'Note' }) })).errors, 'Les notes indiquent à la fois /5 et /10. Corrigez les valeurs avant l’import.', 'Ratings mix /5 and /10. Correct the values before importing.')
    const ambiguous = 'Titre,Note\nFilm,4\nAutre,5\n'
    expectIn(preview(ambiguous, configuration({ mapping: only({ title: 'Titre', rating: 'Note' }), ratingScale: null })).errors, 'L’échelle des notes est ambiguë. Choisissez explicitement /5 ou /10.', 'The rating scale is ambiguous. Choose /5 or /10 explicitly.')
  })

  test('colonnes : métadonnées, fonctionnalité future, évaluation et doublon', () => {
    const contents = 'Titre,Titre original,Revisionnage,Note\nFilm,Original,non,4\n'
    expectIn(preview(contents, configuration({ mapping: only({ title: 'Titre original' }) })).errors, 'La colonne « Titre original » est une métadonnée récupérée plus tard et ne peut pas être importée.', 'The column “Titre original” is metadata fetched later and cannot be imported.')
    expectIn(preview(contents, configuration({ mapping: only({ title: 'Revisionnage' }) })).errors, 'La colonne « Revisionnage » correspond à une fonctionnalité future et ne peut pas être importée.', 'The column “Revisionnage” belongs to a future feature and cannot be imported.')
    expectIn(preview(contents, configuration({ mapping: only({ title: 'Titre', personalNote: 'Note' }) })).errors, 'La colonne « Note » est une évaluation chiffrée et peut seulement être envoyée vers « Évaluation » ou rester sur « Ne pas importer ».', 'The column “Note” is a numeric rating and can only be mapped to “Rating” or stay on “Do not import”.')
    expectIn(preview(contents, configuration({ mapping: only({ title: 'Titre', status: 'Titre' }) })).errors, 'La colonne « Titre » est déjà envoyée vers « Titre ». Une source ne peut avoir qu’une destination.', 'The column “Titre” is already mapped to “Titre”. A source can have only one destination.')
    expectIn(preview(contents, configuration({ mapping: only({ title: 'Absente' }) })).errors, 'La colonne « Absente » n’existe pas dans la table retenue.', 'The column “Absente” does not exist in the selected table.')
    expectIn(preview(contents, configuration({ mapping: only({ title: 'Titre', originalTitle: 'Titre original' }) })).errors, 'Cette destination est une métadonnée Films et ne peut pas être importée depuis un CSV ou Notion générique.', 'This destination is Films metadata and cannot be imported from a generic CSV or Notion export.')
    expectIn(preview(contents, configuration({ mapping: only({ title: 3 }) })).errors, 'La destination doit recevoir une colonne CSV ou rester vide.', 'The destination must receive a CSV column or stay empty.')
  })

  test('notes Markdown et notes personnelles', () => {
    const contents = 'Titre,Notes\nFilm,Note\n'
    expectIn(preview(contents, configuration({ markdownNotes: true })).errors, 'Les pages Markdown « Notes » sont disponibles uniquement pour un export Notion.', 'Markdown “Notes” pages are available only for a Notion export.')
    expectIn(preview(contents, configuration({ markdownNotes: true, mapping: only({ title: 'Titre', personalNote: 'Notes' }) })).errors, '« Note personnelle » reçoit déjà une colonne CSV. Choisissez soit cette colonne, soit les pages Notion « Notes ».', '“Personal note” already receives a CSV column. Choose either that column or the Notion “Notes” pages.')
    const notion = { name: 'export.zip', kind: 'notion', csvCandidates: [{ id: 'csv-0', name: 'Export/Films.csv', contents }], markdownPages: [{ name: 'Export/Films/sans titre.md', contents: '### Notes :\n\nUne note.' }] }
    const session = prepareFilmCsvImport(notion)
    const result = previewFilmCsvImport(session, notion, configuration({ markdownNotes: true }), ISO)
    expectIn(result.warnings, 'La section « Notes : » est ignorée car la page Markdown n’a pas de titre principal.', 'The “Notes:” section is ignored because the Markdown page has no main heading.')
  })

  test('valeurs de lignes : statut, favori, note et date', () => {
    const contents = 'Titre,Statut,Favori,Note,Vu le\nFilm,peut-être,peut-être,excellent,32/13/2026\n'
    const result = preview(contents, configuration({ mapping: only({ title: 'Titre', status: 'Statut', rating: 'Note', watchedAt: 'Vu le', isFavorite: 'Favori' }) }))
    expectIn(result.errors, 'Le statut « peut-être » n’est pas reconnu.', 'The status “peut-être” is not recognised.')
    expectIn(result.errors, 'La valeur favori « peut-être » doit valoir Yes, No, true, false, oui ou non.', 'The favourite value “peut-être” must be Yes, No, true, false, oui or non.')
    expectIn(result.errors, 'La note doit être numérique, éventuellement suivie de /5, /10, « sur 5 », « sur 10 » ou d’un libellé descriptif.', 'The rating must be numeric, optionally followed by /5, /10, “out of 5”, “out of 10” or a descriptive label.')
    expectIn(result.errors, 'La date doit être ISO AAAA-MM-JJ, numérique non ambiguë ou une date française écrite.', 'The date must be ISO YYYY-MM-DD, unambiguous numeric or a written French date.')
    expectIn(preview('Titre,Note\nFilm,8/10\n', configuration({ mapping: only({ title: 'Titre', rating: 'Note' }) })).errors, 'Cette note indique /10, contrairement à l’échelle choisie /5.', 'This rating is on a /10 scale, unlike the chosen /5 scale.')
    expectIn(preview('Titre,Note\nFilm,0/10\n', configuration({ mapping: only({ title: 'Titre', rating: 'Note' }), ratingScale: 10 })).errors, 'La note convertie depuis /10 doit aller de 0,5 à 5 par demi-points.', 'The rating converted from /10 must run from 0.5 to 5 in half-point steps.')
  })

  test('contrat CSV Sylloge Films', () => {
    const values = Array(SYLLOGE_FILMS_CSV_HEADER.length).fill('')
    Object.assign(values, { 0: 'sylloge-films-csv', 1: '1', 2: ISO, 3: 'p1', 4: 'Profil', 5: ISO, 6: ISO, 7: 'f1', 8: 'p1', 9: 'Titre', 11: '2020', 12: 'terminé', 13: 'true', 15: '2026-01-01', 22: ISO, 23: ISO })
    const row = (overrides = {}) => Object.assign([...values], overrides).join(',')
    expectIn(preview(`${SYLLOGE_FILMS_CSV_TITLE}\n${row({ 13: 'peut-être' })}\n`).errors, 'Le favori Sylloge doit valoir true ou false.', 'The Sylloge favourite value must be true or false.')
    expectIn(preview(`${SYLLOGE_FILMS_CSV_TITLE}\n${row({ 11: 'vingt' })}\n`).errors, 'La valeur entière du CSV Sylloge est invalide.', 'The Sylloge CSV integer value is invalid.')
    expectIn(preview(`${SYLLOGE_FILMS_CSV_TITLE}\n${row({ 14: '4.5.6' })}\n`).errors, 'La valeur décimale du CSV Sylloge est invalide.', 'The Sylloge CSV decimal value is invalid.')
    expectIn(preview(`${SYLLOGE_FILMS_CSV_TITLE}\n${row({ 12: 'peut-être' })}\n`).errors, 'Le statut Film est inconnu.', 'The film status is unknown.')
    expectIn(preview(SYLLOGE_FILMS_CSV_TITLE).errors, 'Le CSV Sylloge est incomplet.', 'The Sylloge CSV is incomplete.')
    expectIn(preview(`${SYLLOGE_FILMS_CSV_TITLE}\n${row()}\n${row({ 4: 'Autre profil' })}\n`).errors, 'Les métadonnées de profil doivent être identiques sur chaque ligne Sylloge.', 'Profile metadata must be identical on every Sylloge row.')
    expectIn(preview(`${SYLLOGE_FILMS_CSV_TITLE}\n${row({ 8: 'p2' })}\n`).errors, 'Le film ne correspond pas au profil exporté.', 'The film does not match the exported profile.')
  })

  test('aperçu Notion automatique', () => {
    const first = { id: 'a', name: 'Export/Films.csv', contents: 'Titre\nFilm\n' }
    const second = { id: 'b', name: 'Export/Films_all.csv', contents: 'Titre\nFilm\n' }
    const source = { name: 'export.zip', kind: 'notion', csvCandidates: [first, second], markdownPages: [] }
    const selection = inspectFilmCsvImportSource(source)
    expectMessage(selection.automaticSelectionMessage, 'Notion exported two views of Films. The complete view is selected automatically so personal tracking is kept.')
  })
})

describe('Messages du domaine : sauvegardes, mises à jour et profils', () => {
  test('notices de sauvegarde avec pluriel réel', async () => {
    const film = normalizeFilm({ id: 'f1', profileId: 'profil-1', title: 'Titre' })
    const bridge = (retainedSnapshotCount, fail = false) => ({
      getBackupSettings: async () => null,
      pickBackupDirectory: async () => null,
      clearBackupSettings: async () => {},
      saveManualBackupSnapshot: async () => {
        if (fail) throw new Error('échec')
        return { fileName: 'sauvegarde.json', retainedSnapshotCount }
      },
      saveAutomaticBackupSnapshot: async () => {
        if (fail) throw new Error('échec')
        return { outcome: 'saved', fileName: 'auto.json' }
      },
    })
    const loadLibrary = async () => ({ profile, films: [film], series: [], books: [], games: [], artworks: [] })
    const one = await new BackupService(bridge(1), () => new Date(ISO), loadLibrary).saveManualSnapshot({ profile, films: [film] })
    expectMessage(one.message, 'JSON backup saved: sauvegarde.json. 1 copy kept for this profile.')
    const many = await new BackupService(bridge(3), () => new Date(ISO), loadLibrary).saveManualSnapshot({ profile, films: [film] })
    expectMessage(many.message, 'JSON backup saved: sauvegarde.json. 3 copies kept for this profile.')
    const failed = await new BackupService(bridge(1, true), () => new Date(ISO), loadLibrary).saveManualSnapshot({ profile, films: [film] })
    expectMessage(failed.message, 'The manual JSON backup failed. The data already saved remains in SQLite.')
    const automatic = await new BackupService(bridge(1), () => new Date(ISO), loadLibrary).tryAutomaticSnapshot({ profile, films: [film] })
    expectMessage(automatic.message, 'Automatic JSON backup created for “Profil”: auto.json.')
    const automaticFailure = await new BackupService(bridge(1, true), () => new Date(ISO), loadLibrary).tryAutomaticSnapshot({ profile, films: [film] })
    expectMessage(automaticFailure.message, 'The automatic JSON backup failed. The data already saved remains in SQLite.')
    expectMessage(BACKUP_RETENTION_SUMMARY, '3 recent copies, then one a week for 4 weeks and one a month for 6 months')
  })

  test('sauvegarde invalide et erreurs de mise à jour', () => {
    expectIn(catalogBackupFiles([{ name: 'x.json', contents: 'pas du json' }]).invalid, 'Le fichier ne contient pas un JSON valide.', 'The file does not contain valid JSON.')
    expectMessage(updaterErrorMessage('UPDATER_MANIFEST_MISSING'), 'The latest release does not contain latest.json. The publication of this version is incomplete.')
    expectMessage(updaterErrorMessage('UPDATER_MANIFEST_INVALID'), 'GitHub responds, but Sylloge finds no usable version in latest.json. The release manifest must be checked.')
    expectMessage(updaterErrorMessage('UPDATER_REQUEST_SETUP_FAILED'), 'The update request could not be prepared. Check the repository configuration.')
    expectMessage(updaterErrorMessage('UPDATER_CHECK_FAILED'), 'The check failed. Check the connection and try again.')
    expectMessage(updaterErrorMessage('UPDATER_INSTALL_FAILED'), 'The download or installation failed. The current version stays open.')
    expectMessage(updaterErrorMessage('UPDATER_UPDATE_EXPIRED'), 'This update is no longer available. Search for it again.')
    expectMessage(updaterErrorMessage('UPDATER_UPDATE_CHANGED'), 'The release changed since the check. Search for updates again.')
    expectMessage(updaterErrorMessage('UPDATER_STATE_UNAVAILABLE'), 'The update state is unavailable. Restart Sylloge and try again.')
    expectMessage(updaterErrorMessage('AUTRE'), 'The update failed. Check the connection and try again.')
  })

  test('onboarding, vues enregistrées et dépôts', async () => {
    const deps = {
      create: async () => 'p2',
      load: async () => ({ profile: { id: 'p2', name: 'Nouveau', createdAt: ISO, updatedAt: ISO } }),
      importDocument: async () => ({ profile: { id: 'p2', name: 'Nouveau', createdAt: ISO, updatedAt: ISO } }),
      remove: async () => {},
      now: () => ISO,
    }
    await assert.rejects(() => createProfileFromPreparation({ name: '  ', avatarDataUrl: null, document: null }, deps), (error) => {
      expectMessage(error.message, 'A profile name is required.')
      return true
    })
    const failing = { ...deps, importDocument: async () => { throw new Error('boom') }, remove: async () => { throw new Error('nettoyage') } }
    await assert.rejects(() => createProfileFromPreparation({ name: 'Nouveau', avatarDataUrl: null, document: { format: SYLLOGE_LIBRARY_FORMAT } }, failing), (error) => {
      expectMessage(error.message, 'Restoring failed and the new profile could not be cleaned up. Do not start the creation again before checking this profile in Settings.')
      return true
    })
    assert.throws(() => assertSavedViewAllowed('artworks', { sort: { column: 'rating' } }), (error) => {
      expectMessage(error.message, 'A view sorted by rating does not exist for Art, which has no rating.')
      return true
    })
    await assert.rejects(() => confirmValidatedImport({ document: null, errors: [] }, async () => 'jamais'), (error) => {
      expectMessage(error.message, 'An invalid import cannot trigger any write.')
      return true
    })
    const repository = new SqliteLibraryRepository(
      async () => ({ select: async () => [], execute: async () => ({ rowsAffected: 0 }) }),
      () => 'id',
      () => ISO,
      async () => ({ profileId: 'p', filmCount: 0, seriesCount: 0, animeCount: 0, bookCount: 0, mangaCount: 0, gameCount: 0, artworkCount: 0 }),
      { listSeries: async () => [], listBooks: async () => [], listGames: async () => [], listArtworks: async () => [] },
      async () => ({ profileId: 'p', filmCount: 0, seriesCount: 0, animeCount: 0, bookCount: 0, mangaCount: 0, gameCount: 0, artworkCount: 0 }),
      null,
    )
    await assert.rejects(() => repository.loadLibrary('profil-absent'), (error) => {
      expectMessage(error.message, 'The local profile profil-absent cannot be found.')
      return true
    })
  })
})

describe('Catalogue de messages : intégrité', () => {
  test('le catalogue ne traduit aucune valeur stockée ni aucun en-tête de contrat', () => {
    const stored = ['à découvrir', 'en attente', 'terminé', 'abandonné', 'à voir', 'en cours', 'vue', 'à lire', 'lu', 'à jouer', 'joué', 'découverte', 'série télé', 'animation', 'livre', 'manga', 'comics', 'terminés']
    const headers = ['format', 'version', 'exported_at', 'profile_id', 'film_title', 'film_status', 'series_id', 'book_id', 'game_id', 'artwork_id', 'film_is_favorite']
    for (const value of [...stored, ...headers]) assert.ok(!Object.hasOwn(messages, value), `Stored value translated as a message: ${value}`)
    setLanguage('en')
    for (const value of ['sylloge-films-csv', 'film_title', '2026-01-01T00:00:00.000Z', 'Livre A', '/Users/été/export.csv']) {
      assert.equal(translateMessage(value), value, 'Data values must reach the screen unchanged')
    }
  })

  test('les placeholders sont identiques entre source et traduction', () => {
    const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/gu)].map((match) => match[1]).sort().join(',')
    const mismatched = Object.entries(messages)
      .filter(([source, translation]) => placeholders(source) !== placeholders(translation))
      .map(([source]) => source)
    assert.deepEqual(mismatched, [])
  })

  test('aucune traduction vide et aucune clé en double dans les valeurs', () => {
    assert.deepEqual(Object.entries(messages).filter(([, translation]) => translation.trim() === ''), [])
  })

  test('au moins 60 messages réels ont été vérifiés', () => {
    assert.ok(seen.size >= 60, `Only ${seen.size} real messages exercised`)
  })
})
