import type { Book, BookCategory } from './book.ts'
import type { SavedView } from './savedViews.ts'

/** Deux bibliothèques d’interface, une table books et ses catégories inchangées. */
export type BookLibraryKey = 'books' | 'mangas'

export function bookLibraryForCategory(category: BookCategory): BookLibraryKey {
  return category === 'manga' ? 'mangas' : 'books'
}

/** Livres et Mangas ; les comics ont leur propre bibliothèque (migration 0021). */
export function booksForLibrary(books: Book[], library: BookLibraryKey): Book[] {
  return books.filter((book) => bookLibraryForCategory(book.category) === library)
}

/**
 * Catégories interrogées par une bibliothèque, éventuellement restreintes par
 * le filtre enregistré d’une vue. Le résultat n’est jamais vide : une liste
 * vide signifierait « toutes les catégories » pour SQLite et ferait apparaître
 * les mangas dans Livres (ou l’inverse). Un filtre étranger à la bibliothèque
 * retombe donc sur toutes ses catégories.
 */
export function bookLibraryCategories(library: BookLibraryKey, stored = 'all'): BookCategory[] {
  const categories: BookCategory[] = library === 'mangas' ? ['manga'] : ['livre']
  if (stored === 'all') return categories
  const selected = categories.filter((category) => stored.split(',').includes(category))
  return selected.length > 0 ? selected : categories
}

/**
 * Le schéma v2 stocke manga, livre ou all. Une ancienne vue restreinte à
 * « comics » retombe sur toutes les catégories de Livres.
 */
export function bookLibraryStoredFilter(library: BookLibraryKey, categories: readonly BookCategory[]): string {
  if (library === 'mangas') return 'manga'
  const own = bookLibraryCategories('books').filter((category) => categories.includes(category))
  return own.length === 0 || own.length === bookLibraryCategories('books').length ? 'all' : own.join(',')
}

/** Une ancienne vue manga rejoint Mangas ; les autres vues Livres sont préservées. */
export function bookViewBelongsToLibrary(view: SavedView, library: BookLibraryKey): boolean {
  return view.medium === 'books' && (view.criteria.mediumFilter === 'manga') === (library === 'mangas')
}
