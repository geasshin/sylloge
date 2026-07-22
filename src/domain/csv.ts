import type { ImportValidationError } from './libraryTransfer.ts'

export type CsvRow = {
  cells: string[]
  line: number
}

export type CsvTable = {
  headers: string[]
  rows: CsvRow[]
  errors: ImportValidationError[]
}

/**
 * Parse un tableau CSV UTF-8 séparé par des virgules. Le parseur conserve les
 * lignes physiques pour rapporter les erreurs avant toute écriture SQLite.
 */
export function parseCsv(contents: string): CsvTable {
  const errors: ImportValidationError[] = []
  const rows: CsvRow[] = []
  const cells: string[] = []
  let cell = ''
  let quoted = false
  let quoteClosed = false
  let line = 1
  let rowLine = 1

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index]
    const next = contents[index + 1]

    if (quoted) {
      if (character === '"' && next === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
        quoteClosed = true
      } else {
        cell += character
        if (character === '\n') line += 1
      }
      continue
    }

    if (quoteClosed) {
      if (character === ',') {
        cells.push(cell)
        cell = ''
        quoteClosed = false
      } else if (character === '\r' || character === '\n') {
        if (character === '\r' && next === '\n') index += 1
        cells.push(cell)
        rows.push({ cells: [...cells], line: rowLine })
        cells.length = 0
        cell = ''
        quoteClosed = false
        line += 1
        rowLine = line
      } else {
        errors.push({
          path: `Ligne ${line}`,
          message: 'Une cellule CSV citée doit être suivie d’une virgule ou de la fin de ligne.',
        })
        cell += character
        quoteClosed = false
      }
    } else if (character === '"') {
      if (cell.length > 0) {
        errors.push({ path: `Ligne ${line}`, message: 'Un guillemet doit commencer au début d’une cellule CSV.' })
      }
      quoted = true
    } else if (character === ',') {
      cells.push(cell)
      cell = ''
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && next === '\n') index += 1
      cells.push(cell)
      rows.push({ cells: [...cells], line: rowLine })
      cells.length = 0
      cell = ''
      line += 1
      rowLine = line
    } else {
      cell += character
    }
  }

  if (quoted) errors.push({ path: `Ligne ${rowLine}`, message: 'Une cellule CSV citée n’est pas fermée.' })
  if (cell.length > 0 || cells.length > 0 || quoteClosed) {
    cells.push(cell)
    rows.push({ cells: [...cells], line: rowLine })
  }

  const headerRow = rows.shift()
  if (!headerRow) return { headers: [], rows: [], errors: [{ path: '$', message: 'Le CSV ne contient aucune ligne d’en-tête.' }] }
  const headers = headerRow.cells.map((header, index) => {
    const withoutBom = index === 0 ? header.replace(/^\uFEFF/u, '') : header
    return withoutBom.trim()
  })
  if (headers.some((header) => header.length === 0)) {
    errors.push({ path: `Ligne ${headerRow.line}`, message: 'Chaque colonne CSV doit avoir un en-tête non vide.' })
  }
  const headerNames = new Set<string>()
  for (const header of headers) {
    const key = normalizeCsvHeader(header)
    if (headerNames.has(key)) errors.push({ path: `Ligne ${headerRow.line}`, message: `L’en-tête « ${header} » est présent plusieurs fois.` })
    headerNames.add(key)
  }
  for (const row of rows) {
    if (row.cells.length !== headers.length) {
      errors.push({
        path: `Ligne ${row.line}`,
        message: `Cette ligne contient ${row.cells.length} cellules alors que l’en-tête en définit ${headers.length}.`,
      })
    }
  }

  return { headers, rows, errors }
}

export function normalizeCsvHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
}
