import assert from 'node:assert/strict'
import { bookLibraryCategories, bookLibraryForCategory, bookLibraryStoredFilter, booksForLibrary, bookViewBelongsToLibrary } from '../src/domain/bookLibraries.ts'
import { EMPTY_LIBRARY_FILTERS } from '../src/domain/libraryFilters.ts'
import { sanitizeSavedViewCriteria, SAVED_VIEW_SCHEMA_VERSION } from '../src/domain/savedViews.ts'
import { createLibraryDocument, serializeLibraryDocument, validateLibraryDocument } from '../src/domain/libraryDocument.ts'
import { createCollectionCsvExport } from '../src/domain/collectionCsvTransfer.ts'
import { parseBooksCollectionJson, parseMangasCollectionJson } from '../src/domain/collectionJsonImport.ts'
import { prepareCollectionCsvImport, previewCollectionCsvImport } from '../src/domain/collectionCsvImport.ts'
import { bookToFormValues, validateBookForm } from '../src/domain/bookForm.ts'

const timestamp = '2026-01-02T12:00:00.000Z'
const profile = { id: 'qa-profile', name: 'Recette isolée', createdAt: timestamp, updatedAt: timestamp }
const book = (category) => ({
  id: `qa-${category}`, profileId: profile.id, title: `Recette ${category}`, category,
  author: null, year: null, summary: null, status: 'lu', rating: 4, isFavorite: true,
  volumesRead: category === 'manga' ? 2 : null, volumesTotal: category === 'manga' ? 2 : null,
  progressUpdatedAt: null, startedAt: '2026-01-02', coverUrl: null, personalNote: 'Avis factice',
  createdAt: timestamp, updatedAt: timestamp,
  quotes: [{ id: `quote-${category}`, bookId: `qa-${category}`, body: 'Citation de recette.', position: 0, createdAt: timestamp }],
})
const books = ['livre', 'manga'].map(book)
// Le type ne modifie que la partition, jamais le verdict ou l'avancement.
// Ces valeurs traversent la même validation que le formulaire et le CSV.
for (const source of ['livre', 'manga']) {
  for (const target of ['livre', 'manga']) {
    const original = { ...book(source), status: 'en cours', volumesRead: 11, volumesTotal: 18 }
    const validated = validateBookForm({ ...bookToFormValues(original), category: target })
    assert.ok(validated.success, `${source} → ${target} : correction valide`)
    for (const field of ['title', 'author', 'year', 'summary', 'status', 'rating', 'isFavorite', 'volumesRead', 'volumesTotal', 'startedAt', 'coverUrl', 'personalNote']) {
      assert.equal(validated.data[field], original[field], `${source} → ${target} : ${field} conservé`)
    }
    assert.deepEqual(validated.data.quotes, original.quotes.map((quote) => quote.body))
    assert.equal(validated.data.category, target)
    for (const invalid of [{ volumesRead: '-1' }, { volumesTotal: '1.5' }, { volumesRead: '19' }]) {
      assert.equal(validateBookForm({ ...bookToFormValues(original), category: target, ...invalid }).success, false, `${target} : les compteurs conservés restent validés`)
    }
  }
}
// Les comics ont leur propre bibliothèque (migration 0021) : le formulaire
// Livres refuse désormais cette catégorie au lieu de l'enregistrer dans books.
assert.equal(validateBookForm({ ...bookToFormValues(book('livre')), category: 'comics' }).success, false, 'Livres refuse la catégorie comics')
books.push({ ...book('livre'), id: 'qa-corrected', title: 'Ancien manga corrigé', status: 'en cours', volumesRead: 11, volumesTotal: 18, quotes: [{ ...book('livre').quotes[0], id: 'quote-corrected', bookId: 'qa-corrected' }] })
const library = { profile, films: [], series: [], books, games: [], artworks: [] }
const before = JSON.stringify(library)
assert.equal(bookLibraryForCategory('manga'), 'mangas')
assert.deepEqual(booksForLibrary(books, 'books').map((entry) => entry.category), ['livre', 'livre'])
assert.deepEqual(booksForLibrary(books, 'mangas').map((entry) => entry.category), ['manga'])
assert.deepEqual(bookLibraryCategories('books'), ['livre'])
assert.deepEqual(bookLibraryCategories('mangas'), ['manga'])
assert.deepEqual(bookLibraryCategories('books', 'comics'), ['livre'], 'Une ancienne vue Comics retombe sur Livres')
// Une liste vide serait lue par SQLite comme « toutes les catégories » : un
// filtre étranger retombe sur les catégories de la bibliothèque, jamais sur [].
assert.deepEqual(bookLibraryCategories('books', 'manga'), ['livre'], 'Une ancienne sélection Manga ne doit pas ouvrir les mangas dans Livres')
assert.deepEqual(bookLibraryCategories('mangas', 'livre'), ['manga'], 'Une ancienne sélection Livre ne doit pas ouvrir les livres dans Mangas')
assert.deepEqual(bookLibraryCategories('books', 'inconnue'), ['livre'], 'Une valeur inconnue retombe sur toute la bibliothèque')
assert.equal(bookLibraryStoredFilter('books', ['livre']), 'all')
assert.equal(bookLibraryStoredFilter('books', []), 'all', 'Aucune catégorie ne s’enregistre comme un filtre vide')
assert.equal(bookLibraryStoredFilter('books', ['manga']), 'all', 'Livres n’enregistre jamais la catégorie Manga')
assert.equal(bookLibraryStoredFilter('mangas', ['manga']), 'manga')

// La requête SQLite réelle de chaque bibliothèque porte toujours une clause de
// catégorie paramétrée : aucune combinaison ne fait fuiter l’autre partition.
{
  const { SqliteMediaRepository } = await import('../src/data/mediaRepository.ts')
  const calls = []
  const repository = new SqliteMediaRepository(async () => ({
    async select(query, bindValues) {
      calls.push({ query, bindValues })
      return []
    },
    async execute() {
      throw new Error('Aucune écriture attendue pendant une recherche Livres ou Mangas')
    },
  }))
  for (const [library, stored] of [['books', 'all'], ['books', 'livre'], ['books', 'comics'], ['books', 'manga'], ['mangas', 'all'], ['mangas', 'manga'], ['mangas', 'livre'], ['mangas', 'comics']]) {
    calls.length = 0
    await repository.searchBooks(profile.id, { query: '', category: bookLibraryCategories(library, stored), filters: EMPTY_LIBRARY_FILTERS, sort: { column: 'title', direction: 'asc' } })
    assert.equal(calls.length, 1, `${library}/${stored} : une seule lecture SQLite`)
    assert.match(calls[0].query, /\bcategory (?:= \$\d+|IN \()/, `${library}/${stored} : la requête doit restreindre les catégories`)
    const categories = calls[0].bindValues.filter((value) => ['livre', 'manga', 'comics'].includes(value))
    if (library === 'mangas') assert.deepEqual(categories, ['manga'], `${library}/${stored} : Mangas ne lit que les mangas`)
    else assert.ok(categories.length > 0 && !categories.includes('manga'), `${library}/${stored} : Livres ne lit jamais les mangas`)
  }
}
assert.equal(SAVED_VIEW_SCHEMA_VERSION, 2, 'Aucune migration des vues enregistrées')
for (const version of [1, 2]) {
  for (const mediumFilter of ['all', 'livre', 'manga', 'comics']) {
    const criteria = sanitizeSavedViewCriteria('books', version === 1
      ? { view: 'favorites', mediumFilter, filters: EMPTY_LIBRARY_FILTERS }
      : { sort: { column: 'rating', direction: 'desc' }, mediumFilter, filters: { ...EMPTY_LIBRARY_FILTERS, favoritesOnly: true } })
    const saved = { id: `view-${version}-${mediumFilter}`, profileId: profile.id, medium: 'books', name: 'Vue de recette', criteria, createdAt: timestamp, updatedAt: timestamp }
    // Une ancienne vue Comics se relit comme toute la bibliothèque Livres.
    assert.equal(criteria.mediumFilter, mediumFilter === 'comics' ? 'all' : mediumFilter)
    assert.equal(criteria.filters.favoritesOnly, true)
    assert.equal(bookViewBelongsToLibrary(saved, 'mangas'), mediumFilter === 'manga')
    assert.equal(bookViewBelongsToLibrary(saved, 'books'), mediumFilter !== 'manga')
    assert.deepEqual(sanitizeSavedViewCriteria('books', JSON.parse(JSON.stringify(criteria))), criteria)
  }
}
for (const scope of ['books', 'mangas']) {
  const scoped = { ...library, books: booksForLibrary(books, scope) }
  const kind = scope === 'mangas' ? 'mangas' : 'books'
  const json = serializeLibraryDocument(createLibraryDocument(scoped))
  const validated = validateLibraryDocument(json)
  assert.ok(validated.document, JSON.stringify(validated.errors))
  assert.equal(validated.document.version, 8)
  const imported = kind === 'mangas' ? parseMangasCollectionJson(json) : parseBooksCollectionJson(json)
  assert.ok(imported.items, imported.error)
  assert.deepEqual(imported.items.map((entry) => entry.category), scoped.books.map((entry) => entry.category))
  assert.equal(imported.items[0].quotes[0].body, 'Citation de recette.')
  if (scope === 'books') {
    const corrected = imported.items.find((entry) => entry.id === 'qa-corrected')
    assert.equal(corrected.volumesRead, 11, 'JSON : l’avancement du Livre corrigé est conservé')
    assert.equal(corrected.volumesTotal, 18)
  }
  const csv = createCollectionCsvExport(scoped, kind)
  assert.equal(csv.count, scoped.books.length)
  const session = prepareCollectionCsvImport(kind, csv.contents)
  const preview = previewCollectionCsvImport(session, session.initialMapping)
  assert.ok(preview.items, JSON.stringify(preview.errors))
  assert.deepEqual(preview.items.map((entry) => entry.category), scoped.books.map((entry) => entry.category))
  assert.equal(preview.items[0].quotes[0].body, 'Citation de recette.')
  if (scope === 'books') {
    const corrected = preview.items.find((entry) => entry.title === 'Ancien manga corrigé')
    assert.equal(corrected.volumesRead, 11, 'CSV : l’avancement du Livre corrigé est conservé')
    assert.equal(corrected.volumesTotal, 18)
  }
}
assert.equal(JSON.stringify(library), before, 'Consulter ou exporter une partition ne modifie aucune donnée')
console.log('Livres/Mangas : partitions, refus des comics, vues v1/v2 et aller-retour JSON/CSV vérifiés sur fixtures.')
