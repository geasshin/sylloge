// Export au format CSV Goodreads, pour The StoryGraph (et BookWyrm).
//
// The StoryGraph n'accepte qu'un seul format d'import en masse : le CSV d'export Goodreads, avec des
// en-têtes identiques au modèle. Source :
// https://thestorygraph.freshdesk.com/support/solutions/articles/79000146300-bulk-import-template
// Six colonnes obligatoires, garanties ici pour chaque ligne : Title, Author, My Rating (0 quand le
// livre n'est pas noté), Date Added (AAAA/MM/JJ), Exclusive Shelf, Read Count.
// Les 31 colonnes du modèle Goodreads sont écrites dans l'ordre officiel, même vides.
//
// Ce fichier ne s'importe PAS dans Goodreads : Goodreads exige un ISBN par livre (« Files with only
// titles and authors can't be imported »), et Sylloge n'en stocke aucun. L'interface le dit.
//
// Notes : Goodreads ne connaît que l'entier de 0 à 5. Une note Sylloge par demi-point est arrondie
// à l'entier le plus proche, les demi-points vers le haut (4,5 → 5, 3,5 → 4) ; le bilan compte les
// notes qui ont changé. Date Read et Author l-f restent vides : Sylloge ne date pas la fin de
// lecture et n'inverse pas les noms d'auteur avec fiabilité.

import type { Book } from './book.ts'
import { csvDocument, csvRow, dayOf, exportDay } from './serviceCsv.ts'

export const GOODREADS_HEADER = [
  'Book Id', 'Title', 'Author', 'Author l-f', 'Additional Authors', 'ISBN', 'ISBN13',
  'My Rating', 'Average Rating', 'Publisher', 'Binding', 'Number of Pages', 'Year Published',
  'Original Publication Year', 'Date Read', 'Date Added', 'Bookshelves', 'Bookshelves with positions',
  'Exclusive Shelf', 'My Review', 'Spoiler', 'Private Notes', 'Read Count', 'Recommended For',
  'Recommended By', 'Owned Copies', 'Original Purchase Date', 'Original Purchase Location',
  'Condition', 'Condition Description', 'BCID',
] as const

export type StoryGraphLibrary = 'books' | 'mangas'

/** Étagères exclusives du modèle Goodreads, `did-not-finish` compris (accepté par StoryGraph). */
export type StoryGraphShelf = 'read' | 'currently-reading' | 'to-read' | 'did-not-finish'

export type StoryGraphReport = {
  library: StoryGraphLibrary
  exported: number
  /** `My Rating` à 0 : le livre n'est pas noté. */
  unrated: number
  /** Notes arrondies à l'entier sur 5. */
  ratingsRounded: number
  withoutYear: number
  /** Date d'ajout illisible : cellule vide, StoryGraph l'exige pourtant. */
  withoutAddedDate: number
  /** Le modèle Goodreads n'a pas de colonne « coup de cœur ». */
  favoritesNotCarried: number
  /** Les citations de Sylloge n'ont pas de colonne dans ce format. */
  quotesNotCarried: number
  /** Avis écrits dans My Review. */
  withReview: number
  /** Aucun ISBN : Goodreads refuserait le fichier, StoryGraph non. */
  withoutIsbn: number
}

export type StoryGraphPlan = {
  fileName: string
  contents: string
  report: StoryGraphReport
}

const SHELVES: Record<Book['status'], StoryGraphShelf> = {
  lu: 'read',
  'en cours': 'currently-reading',
  'à lire': 'to-read',
  abandonné: 'did-not-finish',
}

/** Entier 0–5 ; 0 vaut « pas noté », comme l'exige le modèle. */
function goodreadsRating(value: number | null): { text: string; rounded: boolean } {
  if (value === null || !Number.isFinite(value) || value <= 0 || value > 5) return { text: '0', rounded: false }
  const rounded = Math.round(value)
  return { text: String(Math.min(5, Math.max(1, rounded))), rounded: Math.abs(value - rounded) > 1e-9 }
}

function slashDay(value: string | null | undefined): string | null {
  const day = dayOf(value)
  return day === null ? null : day.replace(/-/g, '/')
}

export function planStoryGraphExport(
  input: { library: StoryGraphLibrary; books: readonly Book[] },
  exportedAt: string,
): StoryGraphPlan {
  const books = [...input.books].sort((a, b) => a.title.localeCompare(b.title, 'fr'))
  const report: StoryGraphReport = {
    library: input.library,
    exported: books.length,
    unrated: 0,
    ratingsRounded: 0,
    withoutYear: 0,
    withoutAddedDate: 0,
    favoritesNotCarried: 0,
    quotesNotCarried: 0,
    withReview: 0,
    withoutIsbn: books.length,
  }

  const rows = books.map(book => {
    const rating = goodreadsRating(book.rating)
    const added = slashDay(book.createdAt)
    if (rating.text === '0') report.unrated += 1
    if (rating.rounded) report.ratingsRounded += 1
    if (book.year === null) report.withoutYear += 1
    if (added === null) report.withoutAddedDate += 1
    if (book.isFavorite) report.favoritesNotCarried += 1
    if (book.quotes.length > 0) report.quotesNotCarried += 1
    if (book.personalNote?.trim()) report.withReview += 1
    return csvRow([
      null, // Book Id : identifiant Goodreads, sans objet ici
      book.title,
      book.author,
      null, // Author l-f : inversion non fiable pour un nom composé ou plusieurs auteurs
      null, // Additional Authors
      null, // ISBN : absent de Sylloge
      null, // ISBN13 : absent de Sylloge
      rating.text,
      null, // Average Rating : moyenne communautaire, jamais une donnée personnelle
      null, // Publisher
      null, // Binding
      null, // Number of Pages
      book.year,
      null, // Original Publication Year : Sylloge ne distingue pas l'édition de l'œuvre
      null, // Date Read : Sylloge ne date pas la fin de lecture
      added,
      null, // Bookshelves (étiquettes)
      null, // Bookshelves with positions
      SHELVES[book.status],
      book.personalNote,
      null, // Spoiler
      null, // Private Notes
      book.status === 'lu' ? 1 : 0,
      null, // Recommended For
      null, // Recommended By
      null, // Owned Copies
      null, // Original Purchase Date
      null, // Original Purchase Location
      null, // Condition
      null, // Condition Description
      null, // BCID
    ])
  })

  return {
    fileName: `sylloge-storygraph-${input.library === 'mangas' ? 'mangas' : 'livres'}-${exportDay(exportedAt)}.csv`,
    contents: csvDocument(GOODREADS_HEADER, rows),
    report,
  }
}
