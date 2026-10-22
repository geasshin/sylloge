/** Les comics ont leur propre bibliothèque depuis le 22 octobre 2026. */
export const BOOK_CATEGORIES = ['livre', 'manga'] as const

export type BookCategory = (typeof BOOK_CATEGORIES)[number]

export const BOOK_CATEGORY_LABELS: Record<BookCategory, string> = {
  livre: 'Livre',
  manga: 'Manga',
}

export const BOOK_STATUSES = ['à lire', 'en cours', 'abandonné', 'lu'] as const

export type BookStatus = (typeof BOOK_STATUSES)[number]

export const BOOK_STATUS_LABELS: Record<BookStatus, string> = {
  'à lire': 'À lire',
  'en cours': 'En cours',
  abandonné: 'Abandonné',
  lu: 'Lu',
}

export type BookQuote = {
  id: string
  bookId: string
  body: string
  position: number
  createdAt: string
}

export type Book = {
  id: string
  profileId: string
  title: string
  author: string | null
  year: number | null
  summary: string | null
  category: BookCategory
  status: BookStatus
  rating: number | null
  isFavorite: boolean
  volumesRead: number | null
  volumesTotal: number | null
  progressUpdatedAt: string | null
  startedAt: string | null
  coverUrl: string | null
  personalNote: string | null
  createdAt: string
  updatedAt: string
  quotes: BookQuote[]
}

/** Conserver l'identité d'un passage inchangé, même réordonné ou présent deux fois. */
export function reconcileBookQuotes(
  bookId: string,
  bodies: readonly string[],
  createdAt: string,
  createId: () => string,
  previous: readonly BookQuote[] = [],
): BookQuote[] {
  const available = [...previous]
  return bodies.filter(body => body.trim() !== '').map((body, position) => {
    const index = available.findIndex(quote => quote.body === body)
    const reused = index >= 0 ? available.splice(index, 1)[0] : null
    return { id: reused?.id ?? createId(), bookId, body, position, createdAt: reused?.createdAt ?? createdAt }
  })
}

/**
 * Les formats d'import peuvent contenir des chaînes facultatives vides. La
 * donnée locale canonique les représente par null. Cette fonction ne retire
 * aucun caractère d'une chaîne non vide.
 */
export function normalizeBook(book: Book): Book {
  return {
    ...book,
    author: emptyOptionalTextToNull(book.author),
    summary: emptyOptionalTextToNull(book.summary),
    progressUpdatedAt: emptyOptionalTextToNull(book.progressUpdatedAt),
    startedAt: emptyOptionalTextToNull(book.startedAt),
    coverUrl: emptyOptionalTextToNull(book.coverUrl),
    personalNote: emptyOptionalTextToNull(book.personalNote),
    quotes: book.quotes.map((quote) => ({ ...quote })),
  }
}

function emptyOptionalTextToNull(value: string | null): string | null {
  return value === '' ? null : value
}
