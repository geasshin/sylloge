import assert from 'node:assert/strict'
import { createLibraryExport } from '../src/domain/libraryTransfer.ts'
import {
  createLibraryDocument,
  serializeLibraryDocument,
  validateLibraryDocument,
  SYLLOGE_LIBRARY_VERSION,
} from '../src/domain/libraryDocument.ts'
import {
  parseAnimeCollectionJson,
  parseBooksCollectionJson,
  parseFilmsCollectionJson,
  parseMangasCollectionJson,
  parseSeriesCollectionJson,
} from '../src/domain/collectionJsonImport.ts'
import {
  COLLECTION_CSV_CONTRACTS,
  createCollectionCsvExport,
} from '../src/domain/collectionCsvTransfer.ts'
import {
  prepareCollectionCsvImport,
  previewCollectionCsvImport,
} from '../src/domain/collectionCsvImport.ts'

const timestamp = '2026-01-02T12:00:00.000Z'
const exportedAt = '2026-01-02T13:00:00.000Z'
const profile = { id: 'qa-profile', name: 'Recette isolée', createdAt: timestamp, updatedAt: timestamp }

const series = (id, category, overrides = {}) => ({
  id,
  profileId: profile.id,
  title: `Titre ${id}`,
  showrunner: `Showrunner ${id}`,
  casting: 'Casting factice',
  summary: 'Résumé factice',
  category,
  status: 'en cours',
  rating: 4.5,
  isFavorite: true,
  seasonsSeen: 2,
  seasonsTotal: 4,
  progressUpdatedAt: timestamp,
  startedAt: '2026-01-01',
  posterUrl: 'https://example.test/affiche.jpg',
  personalNote: `Avis ${id}`,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
})

const book = (id, category, overrides = {}) => ({
  id,
  profileId: profile.id,
  title: `Titre ${id}`,
  author: `Auteur ${id}`,
  year: 2020,
  summary: 'Résumé factice',
  category,
  status: 'en cours',
  rating: 4,
  isFavorite: false,
  volumesRead: 3,
  volumesTotal: 5,
  progressUpdatedAt: timestamp,
  startedAt: '2026-01-01',
  coverUrl: 'https://example.test/couverture.jpg',
  personalNote: `Avis ${id}`,
  createdAt: timestamp,
  updatedAt: timestamp,
  quotes: [{ id: `quote-${id}`, bookId: id, body: `Citation ${id}`, position: 0, createdAt: timestamp }],
  ...overrides,
})

const film = {
  id: 'film-1',
  profileId: profile.id,
  title: 'Film de recette',
  originalTitle: null,
  year: 2024,
  status: 'terminé',
  isFavorite: true,
  rating: 4,
  watchedAt: '2026-01-01',
  personalNote: 'Avis film',
  director: 'Réalisatrice',
  summary: null,
  providerName: null,
  providerId: null,
  posterUrl: null,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const game = {
  id: 'game-1',
  profileId: profile.id,
  title: 'Jeu de recette',
  developer: 'Studio',
  platform: 'Dreamcast',
  year: 1999,
  status: 'joué',
  rating: 5,
  isFavorite: true,
  playedAt: '2026-01-01',
  coverUrl: null,
  personalNote: null,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const artwork = {
  id: 'artwork-1',
  profileId: profile.id,
  title: 'Œuvre de recette',
  artist: 'Artiste',
  year: 1889,
  form: 'peinture',
  location: 'Musée',
  exhibition: null,
  status: 'découverte',
  isFavorite: true,
  discoveredAt: '2026-01-01',
  imageUrl: null,
  personalNote: 'Avis œuvre',
  customFields: [{ name: 'Support', value: 'Toile' }, { name: 'Format', value: '100 × 80 cm' }],
  createdAt: timestamp,
  updatedAt: timestamp,
}

const tvSeries = series('series-1', 'série télé')
const animeSeries = series('anime-1', 'animation')
const livre = book('book-1', 'livre')
const comics = book('book-2', 'comics')
const manga = book('manga-1', 'manga')

const library = {
  profile,
  films: [film],
  series: [tvSeries, animeSeries],
  books: [livre, comics, manga],
  games: [game],
  artworks: [artwork],
}

const withoutTechnicalIds = ({ id, profileId, ...fields }) => fields
const stripBookQuotesIds = (entry) => ({
  ...withoutTechnicalIds(entry),
  quotes: entry.quotes.map(({ id, bookId, ...quote }) => quote),
})

// ——— Document v3 : sept sections, partition et comptes ———
const document = createLibraryDocument(library, exportedAt)
assert.equal(SYLLOGE_LIBRARY_VERSION, 3, 'La version courante du document est 3.')
assert.equal(document.version, 3, 'createLibraryDocument écrit toujours la version 3.')
assert.deepEqual(
  Object.keys(document).filter((key) => Array.isArray(document[key])),
  ['films', 'series', 'anime', 'books', 'mangas', 'games', 'artworks'],
  'Le document v3 expose exactement les sept sections, dans l’ordre du contrat.',
)
assert.deepEqual(document.series, [tvSeries], 'La section series ne garde que les séries télé.')
assert.deepEqual(document.anime, [animeSeries], 'La section anime reçoit les fiches animation.')
assert.deepEqual(document.books, [livre, comics], 'La section books garde livres et comics.')
assert.deepEqual(document.mangas, [manga], 'La section mangas reçoit les fiches manga.')
assert.deepEqual(document.artworks, [artwork], 'Les champs personnalisés de l’œuvre sont écrits dans le JSON.')

const serialized = serializeLibraryDocument(document)
const preview = validateLibraryDocument(serialized)
assert.equal(preview.errors.length, 0, `Un document v3 écrit par l’application doit se relire : ${JSON.stringify(preview.errors)}`)
assert.ok(preview.document, 'Le document v3 relu doit être exposé.')
assert.deepEqual(preview.counts, {
  films: 1, series: 1, anime: 1, books: 2, mangas: 1, games: 1, artworks: 1,
}, 'Les comptes couvrent les sept sections.')
assert.deepEqual(preview.document, document, 'L’aller-retour v3 conserve chaque champ, y compris les champs personnalisés.')

// ——— Lecture v2 : routage animation → anime et manga → mangas ———
const legacyV2 = {
  format: 'sylloge-library',
  version: 2,
  exportedAt,
  profile,
  films: [film],
  series: [tvSeries, animeSeries],
  books: [livre, comics, manga],
  games: [game],
  artworks: [artwork],
}
const v2Preview = validateLibraryDocument(`${JSON.stringify(legacyV2, null, 2)}\n`)
assert.equal(v2Preview.errors.length, 0, `Un document v2 reste lisible : ${JSON.stringify(v2Preview.errors)}`)
assert.equal(v2Preview.document?.version, 3, 'Un document v2 est exposé dans le modèle v3.')
assert.deepEqual(v2Preview.document?.series, [tvSeries], 'v2 : l’animation quitte la section series.')
assert.deepEqual(v2Preview.document?.anime, [animeSeries], 'v2 : l’animation est routée vers anime.')
assert.deepEqual(v2Preview.document?.books, [livre, comics], 'v2 : les mangas quittent la section books.')
assert.deepEqual(v2Preview.document?.mangas, [manga], 'v2 : les mangas sont routés vers mangas.')
assert.deepEqual(v2Preview.counts, {
  films: 1, series: 1, anime: 1, books: 2, mangas: 1, games: 1, artworks: 1,
}, 'v2 : les comptes sont exprimés dans les sept sections.')

// ——— Lecture v1 : export Films historique ———
const v1Export = createLibraryExport({ profile, films: [film] }, exportedAt)
const v1Preview = validateLibraryDocument(JSON.stringify(v1Export, null, 2))
assert.equal(v1Preview.errors.length, 0, `Un export Films v1 reste lisible : ${JSON.stringify(v1Preview.errors)}`)
assert.equal(v1Preview.document?.version, 3, 'Un export Films v1 est exposé dans le modèle v3.')
assert.deepEqual(v1Preview.document?.films, [film], 'v1 : les films sont conservés.')
for (const section of ['series', 'anime', 'books', 'mangas', 'games', 'artworks']) {
  assert.deepEqual(v1Preview.document?.[section], [], `v1 : la section ${section} est vide, jamais inventée.`)
}
assert.deepEqual(v1Preview.counts, {
  films: 1, series: 0, anime: 0, books: 0, mangas: 0, games: 0, artworks: 0,
}, 'v1 : les comptes restent exacts.')

// ——— Validation stricte des clés v3 ———
const strictCases = [
  ['section anime absente', (copy) => { delete copy.anime }, '$.anime'],
  ['clé racine inconnue', (copy) => { copy.animeExtra = [] }, '$.animeExtra'],
  ['section mangas non tableau', (copy) => { copy.mangas = {} }, '$.mangas'],
  ['catégorie animation dans series', (copy) => { copy.series[0].category = 'animation' }, '$.series[0].category'],
  ['catégorie série télé dans anime', (copy) => { copy.anime[0].category = 'série télé' }, '$.anime[0].category'],
  ['catégorie manga dans books', (copy) => { copy.books[0].category = 'manga' }, '$.books[0].category'],
  ['catégorie livre dans mangas', (copy) => { copy.mangas[0].category = 'livre' }, '$.mangas[0].category'],
  ['clé inconnue dans une fiche anime', (copy) => { copy.anime[0].audience = 'adulte' }, '$.anime[0].audience'],
  ['champ personnalisé sans nom', (copy) => { copy.artworks[0].customFields = [{ name: '', value: 'Toile' }] }, '$.artworks[0].customFields[0].name'],
]
for (const [label, mutate, path] of strictCases) {
  const copy = structuredClone(document)
  mutate(copy)
  const checked = validateLibraryDocument(JSON.stringify(copy))
  assert.equal(checked.document, null, `v3 : ${label} doit être refusé.`)
  assert.ok(checked.errors.some((error) => error.path === path), `v3 : ${label} doit signaler ${path}, reçu ${JSON.stringify(checked.errors)}`)
}
const withoutCustomFields = structuredClone(document)
delete withoutCustomFields.artworks[0].customFields
assert.equal(validateLibraryDocument(JSON.stringify(withoutCustomFields)).document, null, 'v3 : customFields est obligatoire sur une œuvre.')

// Un document v2 garde ses propres clés : une section v3 y est un champ inconnu.
const v2WithAnime = structuredClone(legacyV2)
v2WithAnime.anime = []
assert.equal(validateLibraryDocument(JSON.stringify(v2WithAnime)).document, null, 'v2 : une section anime est refusée comme clé inconnue.')

// ——— JSON unitaire par collection ———
assert.deepEqual(parseFilmsCollectionJson(serialized).items, [film], 'Films : l’import unitaire lit la section films.')
assert.deepEqual(parseSeriesCollectionJson(serialized).items, [tvSeries], 'Séries : seules les séries télé sont importées.')
assert.deepEqual(parseAnimeCollectionJson(serialized).items, [animeSeries], 'Anime : les fiches animation sont importées.')
assert.deepEqual(parseBooksCollectionJson(serialized).items, [livre, comics], 'Livres : les mangas ne sont pas importés dans Livres.')
assert.deepEqual(parseMangasCollectionJson(serialized).items, [manga], 'Mangas : les fiches manga sont importées.')
assert.deepEqual(parseAnimeCollectionJson(`${JSON.stringify(legacyV2)}\n`).items, [animeSeries], 'Anime : un fichier v2 est routé vers la section anime.')
assert.deepEqual(parseMangasCollectionJson(`${JSON.stringify(legacyV2)}\n`).items, [manga], 'Mangas : un fichier v2 est routé vers la section mangas.')
assert.equal(parseAnimeCollectionJson(JSON.stringify({ ...document, anime: [] })).items, null, 'Anime : une section vide reste refusée.')
assert.match(parseAnimeCollectionJson(JSON.stringify({ ...document, anime: [] })).error, /aucune animation/i)
assert.match(parseMangasCollectionJson(JSON.stringify({ ...document, mangas: [] })).error, /aucun manga/i)

// ——— CSV par bibliothèque : nouvelles sections et colonnes ———
assert.deepEqual(
  Object.keys(COLLECTION_CSV_CONTRACTS),
  ['series', 'anime', 'books', 'mangas', 'games', 'artworks'],
  'Les contrats CSV couvrent les six collections non-film.',
)
assert.ok(!COLLECTION_CSV_CONTRACTS.anime.entityHeaders.includes('anime_category'), 'Le CSV anime ne porte pas de colonne catégorie.')
assert.ok(!COLLECTION_CSV_CONTRACTS.mangas.entityHeaders.includes('manga_category'), 'Le CSV mangas ne porte pas de colonne catégorie.')
assert.ok(COLLECTION_CSV_CONTRACTS.anime.entityHeaders.includes('anime_progress_updated_at'), 'Le CSV anime conserve la progression.')
assert.ok(COLLECTION_CSV_CONTRACTS.mangas.entityHeaders.includes('manga_quotes_json'), 'Le CSV mangas conserve les citations.')
assert.equal(COLLECTION_CSV_CONTRACTS.anime.format, 'sylloge-anime-csv')
assert.equal(COLLECTION_CSV_CONTRACTS.mangas.format, 'sylloge-mangas-csv')

const csvLibrary = { ...library }
for (const [kind, expected, withoutIds] of [
  ['series', [tvSeries], withoutTechnicalIds],
  ['anime', [animeSeries], withoutTechnicalIds],
  ['books', [livre, comics], stripBookQuotesIds],
  ['mangas', [manga], stripBookQuotesIds],
]) {
  const exported = createCollectionCsvExport(csvLibrary, kind, exportedAt)
  assert.equal(exported.count, expected.length, `CSV ${kind} : le compte suit la section.`)
  const session = prepareCollectionCsvImport(kind, exported.contents)
  assert.equal(session.sourceKind, 'sylloge-csv-v1', `CSV ${kind} : le contrat Sylloge est reconnu.`)
  const imported = previewCollectionCsvImport(session, session.initialMapping)
  assert.equal(imported.errors.length, 0, `CSV ${kind} : ${JSON.stringify(imported.errors)}`)
  assert.deepEqual(imported.items?.map(withoutIds), expected.map(withoutIds), `CSV ${kind} : chaque champ représentable survit.`)
}
assert.equal(createCollectionCsvExport(csvLibrary, 'series', exportedAt).count, 1, 'Le CSV Séries exclut l’animation.')
assert.equal(createCollectionCsvExport(csvLibrary, 'books', exportedAt).count, 2, 'Le CSV Livres exclut les mangas.')
assert.equal(createCollectionCsvExport(csvLibrary, 'anime', exportedAt).count, 1, 'Le CSV Anime ne prend que la section anime.')
assert.equal(createCollectionCsvExport(csvLibrary, 'mangas', exportedAt).count, 1, 'Le CSV Mangas ne prend que la section mangas.')

// Une bibliothèque anime vide reste un CSV valide, sans œuvre inventée.
const emptyAnime = createCollectionCsvExport({ ...library, anime: [] }, 'anime', exportedAt)
assert.equal(emptyAnime.count, 0)
const emptySession = prepareCollectionCsvImport('anime', emptyAnime.contents)
const emptyPreview = previewCollectionCsvImport(emptySession, emptySession.initialMapping)
assert.equal(emptyPreview.errors.length, 0, `CSV anime vide : ${JSON.stringify(emptyPreview.errors)}`)
assert.deepEqual(emptyPreview.items, [], 'CSV anime vide : aucune fiche inventée.')

// Ancien modèle (sans sections explicites) : la partition se fait par catégorie.
const legacyShapedDocument = createLibraryDocument({ ...library, anime: undefined, mangas: undefined }, exportedAt)
assert.deepEqual(legacyShapedDocument.anime, [animeSeries], 'Sans section anime, la catégorie suffit à router.')
assert.deepEqual(legacyShapedDocument.mangas, [manga], 'Sans section mangas, la catégorie suffit à router.')
const legacyShapedAnimeCsv = createCollectionCsvExport({ ...library, anime: undefined, mangas: undefined }, 'anime', exportedAt)
assert.equal(legacyShapedAnimeCsv.count, 1, 'Le CSV anime dérive les fiches animation de series quand la section manque.')

console.log('Bibliothèques séparées : document v3, lecture v1/v2, JSON unitaire et CSV anime/mangas vérifiés sur fixtures.')
