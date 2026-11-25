/**
 * Ajustement des portions d'une recette (25 novembre 2026).
 *
 * Les ingrédients restent un texte libre, une ligne par ingrédient : rien n'est
 * réécrit dans la fiche. À l'affichage, la première quantité de chaque ligne est
 * multipliée par le rapport des portions ; le reste de la ligne ne bouge pas.
 * Une ligne sans quantité (« Sel, poivre », « Pour la garniture : ») reste
 * telle quelle. Les nombres entre parenthèses (« 1 sachet (7 g) ») décrivent le
 * produit acheté, pas la quantité à peser, et restent donc intacts.
 */

export type RecipeServings = {
  /** Nombre de portions de la recette de base. */
  count: number
  /** Ce qui suit le nombre (« personnes », « manakish ») ; vide si le champ ne porte qu'un nombre. */
  unit: string
}

const RANGE_CONNECTOR = /^\s*(à|a|ou|-|–|—)\s*/u

const FRACTION_GLYPHS: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
}
const GLYPHS = Object.keys(FRACTION_GLYPHS).join('')

/** Une quantité en tête de ligne : décimale, fraction, ou nombre entier suivi d'une fraction. */
const LEADING_QUANTITY = new RegExp(
  `^(\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d+(?:[.,]\\d+)?\\s*[${GLYPHS}]|[${GLYPHS}]|\\d+(?:[.,]\\d+)?)`,
  'u',
)

const SERVINGS_RANGE = /^\s*(?:pour\s+)?(\d+(?:[.,]\d+)?)\s*(?:à|a|-|–|ou)\s*\d+(?:[.,]\d+)?\s*(.*)$/iu
const SERVINGS = /^\s*(?:pour\s+)?(\d+(?:[.,]\d+)?)\s*(.*)$/iu

function toNumber(text: string): number {
  return Number(text.replace(',', '.'))
}

/**
 * Nombre de portions lu dans le champ libre « Portions ».
 * « 6 personnes », « 8 manakish », « Pour 2 à 3 personnes » ; null sans nombre.
 */
export function parseServings(value: string | null | undefined): RecipeServings | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text === '') return null
  const range = SERVINGS_RANGE.exec(text)
  if (range) {
    const count = toNumber(range[1])
    return count > 0 ? { count, unit: range[2].trim() } : null
  }
  const match = SERVINGS.exec(text)
  if (!match) return null
  const count = toNumber(match[1])
  if (!(count > 0)) return null
  return { count, unit: match[2].trim() }
}

function numberFromToken(token: string): number | null {
  const value = token.trim()
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/u.exec(value)
  if (mixed) {
    const denominator = Number(mixed[3])
    return denominator === 0 ? null : Number(mixed[1]) + Number(mixed[2]) / denominator
  }
  const fraction = /^(\d+)\s*\/\s*(\d+)$/u.exec(value)
  if (fraction) {
    const denominator = Number(fraction[2])
    return denominator === 0 ? null : Number(fraction[1]) / denominator
  }
  const wholeAndGlyph = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*[${GLYPHS}]$`, 'u').exec(value)
  if (wholeAndGlyph) {
    const glyph = value.slice(wholeAndGlyph[1].length).trim()
    return toNumber(wholeAndGlyph[1]) + FRACTION_GLYPHS[glyph]
  }
  if (value.length === 1 && value in FRACTION_GLYPHS) return FRACTION_GLYPHS[value]
  if (/^\d+(?:[.,]\d+)?$/u.test(value)) return toNumber(value)
  return null
}

type FoundQuantity = { value: number; end: number }

function takeLeadingQuantity(line: string, offset: number): FoundQuantity | null {
  const match = LEADING_QUANTITY.exec(line.slice(offset))
  if (!match) return null
  const value = numberFromToken(match[1])
  if (value === null) return null
  return { value, end: offset + match[1].length }
}

const FRACTION_FORMATS: { value: number; glyph: string }[] = [
  { value: 0.125, glyph: '⅛' },
  { value: 0.25, glyph: '¼' },
  { value: 1 / 3, glyph: '⅓' },
  { value: 0.375, glyph: '⅜' },
  { value: 0.5, glyph: '½' },
  { value: 0.625, glyph: '⅝' },
  { value: 2 / 3, glyph: '⅔' },
  { value: 0.75, glyph: '¾' },
  { value: 0.875, glyph: '⅞' },
]

/** Une masse ou un volume se pèse : 3,3 g se lit mieux que 3 ¼ g. */
const MEASURED_UNIT = /^(?:g|kg|mg|ml|cl|dl|l)\b/iu

function unitOf(tail: string): string {
  const match = /^\s*([\p{L}.]+)/u.exec(tail)
  return match ? match[1] : ''
}

/**
 * Écrit une quantité multipliée sans fausse précision : ⅓ plutôt que 0,33,
 * 3,6 plutôt que 3,642857 ; en grammes ou millilitres, une décimale plutôt
 * qu'une fraction de cuisine. Les ingrédients sont un texte français, la
 * virgule décimale est donc la règle, quelle que soit la langue de l'interface.
 */
export function formatQuantity(value: number, unit = ''): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  const measured = MEASURED_UNIT.test(unit.trim())
  const nearestInteger = Math.round(value)
  if (Math.abs(value - nearestInteger) < 0.01) return String(nearestInteger)
  const whole = Math.floor(value)
  const remainder = value - whole
  // Les fractions se lisent bien pour de petites quantités (½ c. à café,
  // 1 ⅓ pomme) ; au-delà de 10, une balance affiche des grammes entiers.
  const fraction = !measured && value < 10
    ? FRACTION_FORMATS.find((candidate) => Math.abs(candidate.value - remainder) <= 0.01)
    : undefined
  if (fraction) return whole === 0 ? fraction.glyph : `${whole} ${fraction.glyph}`
  const decimals = value < 1 && !measured ? 2 : value < 100 ? 1 : 0
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded))
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(rounded)
}

function scaleLine(line: string, ratio: number): string {
  const first = takeLeadingQuantity(line, 0)
  if (!first) return line
  const connector = RANGE_CONNECTOR.exec(line.slice(first.end))
  if (connector) {
    const second = takeLeadingQuantity(line, first.end + connector[0].length)
    if (second) {
      const tail = line.slice(second.end)
      const unit = unitOf(tail)
      return `${formatQuantity(first.value * ratio, unit)}${connector[0]}${formatQuantity(second.value * ratio, unit)}${tail}`
    }
  }
  const tail = line.slice(first.end)
  return `${formatQuantity(first.value * ratio, unitOf(tail))}${tail}`
}

/**
 * Lignes d'ingrédients ajustées de `from` portions à `to` portions.
 * À portions égales, les lignes sont rendues telles quelles, sans reformatage.
 */
export function scaleIngredients(lines: readonly string[], from: number, to: number): string[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0 || from === to) return [...lines]
  const ratio = to / from
  return lines.map((line) => scaleLine(line, ratio))
}
