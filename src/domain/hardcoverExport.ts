// Export au format CSV personnalisé de Hardcover.
//
// Schéma officiel : https://hardcover.app/pages/custom-csv-import-format (import bêta, page
// https://hardcover.app/account/imports). Colonnes et règles :
//   Title     requis, titre complet sans le nom de série
//   Author    requis, plusieurs auteurs séparés par des virgules
//   Status    requis : None | Want to Read | Currently Reading | Read | Did Not Finish Read
//   ISBN 10, ISBN 13, ASIN, Hardcover Book ID, Hardcover Edition ID  facultatifs
//   Rating    0,5 à 5 par pas de 0,5
//   Date Added, Date Started, Date Finished   AAAA-MM-JJ (listes séparées par virgules pour les relectures)
//   Review (Markdown), Tags, Lists, Publisher, Pages, Publish Date, Media, Privacy…
//
// C'est le meilleur cas d'export livres : titre + auteur + statut suffisent, la note par demi-point
// passe telle quelle, les dates ISO aussi, et aucun ISBN n'est exigé. La colonne `Series` du schéma
// n'est pas écrite : Sylloge ne stocke pas de nom de série pour un livre, et l'en-tête transmis est
// celui du modèle publié, mot pour mot.
//
// Date Finished reste vide : Sylloge ne date pas la fin de lecture. Le bilan le dit.

import type { Book } from './book.ts'
import { csvDocument, csvRow, dayOf, exportDay } from './serviceCsv.ts'

export const HARDCOVER_HEADER = [
  'Title', 'Author', 'Status', 'Privacy', 'Hardcover Book ID', 'Hardcover Edition ID',
  'ISBN 10', 'ISBN 13', 'ASIN', 'Media', 'Country Code', 'Language Code', 'Binding', 'Pages',
  'Duration in Seconds', 'Publish Date', 'Publisher', 'Genres', 'Moods', 'Tags', 'Content Warnings',
  'Lists', 'Date Added', 'Date Started', 'Date Finished', 'Rating', 'Review', 'Review Contains Spoilers',
] as const

export type HardcoverStatus = 'Want to Read' | 'Currently Reading' | 'Read' | 'Did Not Finish Read'

export type HardcoverReport = {
  exported: number
  /** Notes transmises telles quelles (Hardcover accepte les demi-points). */
  withRating: number
  withoutRating: number
  /** Date de début illisible ou absente. */
  withoutStartDate: number
  /** Aucun ISBN : facultatif chez Hardcover, donc sans conséquence. */
  withoutIsbn: number
  /** Le schéma n'a pas de colonne « coup de cœur ». */
  favoritesNotCarried: number
  /** Les citations de Sylloge n'ont pas de colonne dans ce format. */
  quotesNotCarried: number
  /** Avis écrits dans Review. */
  withReview: number
}

export type HardcoverPlan = {
  fileName: string
  contents: string
  report: HardcoverReport
}

const STATUSES: Record<Book['status'], HardcoverStatus> = {
  'à lire': 'Want to Read',
  'en cours': 'Currently Reading',
  lu: 'Read',
  abandonné: 'Did Not Finish Read',
}

/** 0,5 à 5 par pas de 0,5 ; une valeur plus fine est ramenée au demi-point le plus proche. */
function hardcoverRating(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0 || value > 5) return ''
  return String(Math.round(value * 2) / 2)
}

export function planHardcoverExport(books: readonly Book[], exportedAt: string): HardcoverPlan {
  const ordered = [...books].sort((a, b) => a.title.localeCompare(b.title, 'fr'))
  const report: HardcoverReport = {
    exported: ordered.length,
    withRating: 0,
    withoutRating: 0,
    withoutStartDate: 0,
    withoutIsbn: ordered.length,
    favoritesNotCarried: 0,
    quotesNotCarried: 0,
    withReview: 0,
  }

  const rows = ordered.map(book => {
    const rating = hardcoverRating(book.rating)
    const started = dayOf(book.startedAt)
    if (rating === '') report.withoutRating += 1
    else report.withRating += 1
    if (started === null) report.withoutStartDate += 1
    if (book.isFavorite) report.favoritesNotCarried += 1
    if (book.quotes.length > 0) report.quotesNotCarried += 1
    if (book.personalNote?.trim()) report.withReview += 1
    return csvRow([
      book.title,
      book.author,
      STATUSES[book.status],
      null, // Privacy : la valeur par défaut du compte s'applique
      null, // Hardcover Book ID
      null, // Hardcover Edition ID
      null, // ISBN 10
      null, // ISBN 13
      null, // ASIN
      'Book',
      null, // Country Code
      null, // Language Code
      null, // Binding
      null, // Pages
      null, // Duration in Seconds
      null, // Publish Date
      null, // Publisher
      null, // Genres
      null, // Moods
      null, // Tags
      null, // Content Warnings
      null, // Lists
      dayOf(book.createdAt),
      started,
      null, // Date Finished : Sylloge ne date pas la fin de lecture
      rating,
      book.personalNote,
      null, // Review Contains Spoilers
    ])
  })

  return {
    fileName: `sylloge-hardcover-livres-${exportDay(exportedAt)}.csv`,
    contents: csvDocument(HARDCOVER_HEADER, rows),
    report,
  }
}
