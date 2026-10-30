// Sérialisation CSV des exports vers un service tiers.
//
// Ces fichiers ne sont pas des exports Sylloge : ils doivent être relus par le service, mot pour
// mot. Deux conséquences, opposées à `csvFilmExport.ts` :
// - aucun préfixe de protection de tableur : un titre « '71 » ou « +1 » deviendrait « ''71 » et
//   ne correspondrait plus à l'œuvre chez le service ;
// - en-tête et valeurs vides restent des cellules vides, jamais des guillemets superflus.
// Fin de ligne CRLF, UTF-8 sans BOM, comme les fichiers d'import officiels.

export type CsvValue = string | number | null

export function csvCell(value: CsvValue): string {
  const text = value === null ? '' : String(value)
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function csvRow(values: readonly CsvValue[]): string {
  return values.map(csvCell).join(',')
}

/** En-tête + lignes déjà sérialisées. Aucune ligne : chaîne vide, donc aucun fichier. */
export function csvDocument(header: readonly string[], rows: readonly string[]): string {
  return rows.length === 0 ? '' : `${csvRow(header)}\r\n${rows.map(row => `${row}\r\n`).join('')}`
}

/** Jour d'un horodatage ISO ; `export` si la valeur est illisible (nom de fichier seulement). */
export function exportDay(exportedAt: string): string {
  return /^\d{4}-\d{2}-\d{2}/u.exec(exportedAt)?.[0] ?? 'export'
}

/** Jour calendaire valide extrait d'un horodatage, ou `null`. Aucun décalage de fuseau. */
export function dayOf(value: string | null | undefined): string | null {
  const day = /^(\d{4}-\d{2}-\d{2})/u.exec(value ?? '')?.[1]
  if (!day) return null
  const [year, month, date] = day.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, date))
  const valid = parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === date
  return valid ? day : null
}

/** Note Sylloge (0,5 à 5 par demi-point) convertie sur une échelle entière 1–10. */
export function ratingOutOfTen(value: number | null): { text: string; rounded: boolean } {
  if (value === null || !Number.isFinite(value) || value <= 0 || value > 5) return { text: '', rounded: false }
  const exact = value * 2
  const doubled = Math.round(exact)
  return { text: String(Math.min(10, Math.max(1, doubled))), rounded: Math.abs(exact - doubled) > 1e-9 }
}
