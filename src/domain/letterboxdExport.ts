// Export au format d'import de Letterboxd (CSV).
//
// Format officiel : https://letterboxd.com/about/importing-data/ — colonnes tmdbID, Title, Year, Directors,
// Rating (0,5 à 5), WatchedDate (AAAA-MM-JJ), Review. Deux imports distincts chez Letterboxd : les films
// vus (journal, avec note, date et avis) et la liste « à voir » (watchlist). Un film associé à TMDB est
// reconnu à coup sûr par son identifiant ; les autres le sont par titre, année et réalisateur.
//
// Sérialiseur dédié : celui des exports CSV de Sylloge préfixe d'une apostrophe les titres qui commencent
// par « = + - @ ' » (protection des tableurs), ce qui corromprait « '71 » ou « +1 » dans Letterboxd.

import type { Film } from './film.ts'

/** Limite de Letterboxd : 1 Mo par fichier. Marge laissée pour la dernière ligne. */
export const LETTERBOXD_MAX_BYTES = 950_000

export type LetterboxdKind = 'watched' | 'watchlist'

export type LetterboxdReport = {
  exported: number
  withTmdbId: number
  /** Reconnus par titre, année et réalisateur seulement : correspondance probable, non garantie. */
  matchedByTitleOnly: number
  /** Vus sans date exploitable : marqués vus, mais sans entrée dans le journal. */
  withoutDate: number
  withoutYear: number
  /** Letterboxd n'a pas de colonne « favori » dans son import. */
  favoritesNotCarried: number
  /** Films d'un autre statut que celui du fichier. */
  skippedOtherStatus: number
}

export type LetterboxdPlan = {
  parts: Array<{ fileName: string; contents: string; count: number }>
  report: LetterboxdReport
}

const WATCHED_HEADER = ['tmdbID', 'Title', 'Year', 'Directors', 'Rating', 'WatchedDate', 'Review'] as const
const WATCHLIST_HEADER = ['tmdbID', 'Title', 'Year', 'Directors'] as const

const STATUS_FOR: Record<LetterboxdKind, string> = { watched: 'terminé', watchlist: 'à découvrir' }

function cell(value: string | number | null): string {
  const text = value === null ? '' : String(value)
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function row(values: ReadonlyArray<string | number | null>): string {
  return values.map(cell).join(',')
}

function tmdbId(film: Film): string | null {
  return film.providerName === 'tmdb' && film.providerId !== null && /^\d+$/u.test(film.providerId) ? film.providerId : null
}

function isValidDay(day: string): boolean {
  const [year, month, date] = day.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, date))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === date
}

function watchedDay(film: Film): string | null {
  const day = /^(\d{4}-\d{2}-\d{2})/u.exec(film.watchedAt ?? '')?.[1]
  return day && isValidDay(day) ? day : null
}

function validRating(film: Film): string | null {
  const value = film.rating
  if (value === null || !Number.isFinite(value) || value < 0.5 || value > 5 || value * 2 !== Math.round(value * 2)) return null
  return String(value)
}

/** L'avis est du HTML chez Letterboxd : on échappe pour que « A & B <3 » reste lisible tel quel. */
function review(film: Film): string | null {
  const note = film.personalNote?.trim()
  if (!note) return null
  return note.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fileName(kind: LetterboxdKind, exportedAt: string, part: number, total: number): string {
  const day = /^\d{4}-\d{2}-\d{2}/u.exec(exportedAt)?.[0] ?? 'export'
  const base = `sylloge-letterboxd-${kind === 'watched' ? 'vus' : 'a-voir'}-${day}`
  return total > 1 ? `${base}-${part}.csv` : `${base}.csv`
}

export function planLetterboxdExport(films: readonly Film[], kind: LetterboxdKind, exportedAt: string): LetterboxdPlan {
  const status = STATUS_FOR[kind]
  const selected = films.filter(film => film.status === status)
  const report: LetterboxdReport = {
    exported: selected.length,
    withTmdbId: 0,
    matchedByTitleOnly: 0,
    withoutDate: 0,
    withoutYear: 0,
    favoritesNotCarried: 0,
    skippedOtherStatus: films.length - selected.length,
  }

  // Par date de visionnage, puis par titre ; sans date en dernier. La liste à voir est alphabétique.
  const ordered = [...selected].sort((a, b) => {
    if (kind === 'watched') {
      const da = watchedDay(a)
      const db = watchedDay(b)
      if (da !== db) return da === null ? 1 : db === null ? -1 : da < db ? -1 : 1
    }
    return a.title.localeCompare(b.title, 'fr') || a.id.localeCompare(b.id)
  })

  const header = kind === 'watched' ? WATCHED_HEADER : WATCHLIST_HEADER
  const rows = ordered.map(film => {
    const id = tmdbId(film)
    if (id) report.withTmdbId += 1
    else report.matchedByTitleOnly += 1
    if (film.year === null) report.withoutYear += 1
    if (film.isFavorite) report.favoritesNotCarried += 1
    const common = [id, film.title, film.year, film.director?.trim() || null]
    if (kind === 'watchlist') return row(common)
    const day = watchedDay(film)
    if (day === null) report.withoutDate += 1
    return row([...common, validRating(film), day, review(film)])
  })

  if (rows.length === 0) return { parts: [], report }

  // Coupe en parties sous la limite de taille ; l'en-tête est répété dans chacune.
  const encoder = new TextEncoder()
  const headerLine = `${row(header)}\r\n`
  const chunks: string[][] = [[]]
  let size = encoder.encode(headerLine).length
  for (const line of rows) {
    const lineSize = encoder.encode(`${line}\r\n`).length
    if (size + lineSize > LETTERBOXD_MAX_BYTES && chunks[chunks.length - 1].length > 0) {
      chunks.push([])
      size = encoder.encode(headerLine).length
    }
    chunks[chunks.length - 1].push(line)
    size += lineSize
  }

  return {
    parts: chunks.map((lines, index) => ({
      fileName: fileName(kind, exportedAt, index + 1, chunks.length),
      contents: `${headerLine}${lines.map(line => `${line}\r\n`).join('')}`,
      count: lines.length,
    })),
    report,
  }
}
