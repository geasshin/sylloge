import { english } from './catalog.ts'

export type Language = 'fr' | 'en'
export const LANGUAGE_STORAGE_KEY = 'sylloge-language'

/** The first supported system language wins; an explicit choice always wins. */
export function resolveLanguage(saved: string | null | undefined, preferred: readonly string[]): Language {
  if (saved === 'fr' || saved === 'en') return saved
  for (const locale of preferred) {
    const language = locale.toLowerCase().split(/[-_]/)[0]
    if (language === 'fr' || language === 'en') return language
  }
  return 'en'
}

function initialLanguage(): Language {
  // Server-side fixtures retain the historical French default, independently
  // of Node's host locale. Detection belongs to the user's webview.
  if (typeof window === 'undefined') return 'fr'
  let saved: string | null = null
  try { saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY) } catch { /* optional storage */ }
  return resolveLanguage(saved, navigator.languages?.length ? navigator.languages : [navigator.language])
}

let language = initialLanguage()
const listeners = new Set<() => void>()

export function getLanguage(): Language { return language }
export function getLocale(): 'fr-FR' | 'en-GB' { return language === 'fr' ? 'fr-FR' : 'en-GB' }

function syncDocument(): void {
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = language
}

function changeLanguage(next: Language): void {
  if (next === language) { syncDocument(); return }
  language = next
  syncDocument()
  listeners.forEach(listener => listener())
}

export function setLanguage(next: Language): void {
  if (next !== 'fr' && next !== 'en') return
  try { if (typeof window !== 'undefined') window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next) } catch { /* session choice still works */ }
  changeLanguage(next)
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

syncDocument()
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) changeLanguage(initialLanguage())
  })
}

type Parameters = Record<string, string | number | null | undefined>

function interpolate(template: string, parameters: Parameters): string {
  return template.replace(/\{([\w]+)\}/g, (placeholder, name: string) => Object.hasOwn(parameters, name) ? String(parameters[name] ?? '') : placeholder)
}

/** Translate only explicitly marked application copy; parameters are opaque. */
export function t(source: string, parameters?: Parameters): string
export function t(source: TemplateStringsArray, ...values: Array<string | number | null | undefined>): string
export function t(source: string | TemplateStringsArray, ...values: Array<string | number | null | undefined | Parameters>): string {
  const tagged = typeof source !== 'string'
  const key = tagged ? source.reduce((text, part, index) => text + (index ? `{${index - 1}}` : '') + part, '') : source
  const parameters = (tagged ? Object.fromEntries(values.map((value, index) => [index, value])) : values[0] ?? {}) as Parameters
  return interpolate(language === 'en' && Object.hasOwn(english, key) ? english[key] : key, parameters)
}

/** gettext-style separator between a context and its French source in a catalogue key. */
export const CONTEXT_SEPARATOR = '\u0004'

/**
 * Same French word, another English meaning (« Dessin » : a drawing, or a comics credit).
 * The catalogue key is `${context}\u0004${source}`; without that entry the plain
 * translation of the source applies, and French always returns the source.
 */
export function tc(context: string, source: string, parameters: Parameters = {}): string {
  if (language !== 'en') return interpolate(source, parameters)
  const key = `${context}${CONTEXT_SEPARATOR}${source}`
  const translated = Object.hasOwn(english, key) ? english[key] : Object.hasOwn(english, source) ? english[source] : source
  return interpolate(translated, parameters)
}

/** Known legacy diagnostics arrive already interpolated from parsers/native IPC.
 * Match a complete catalogue template only, never replace words inside values.
 * A template needs fixed words (six characters or more) so « {0} / {1} » can never match. */
const diagnosticTemplates = Object.entries(english).flatMap(([source, translation]) => {
  if (source.includes(CONTEXT_SEPARATOR)) return []
  const parts = source.split(/\{([\w]+)\}/g)
  if (parts.length < 3 || parts.filter((_, index) => index % 2 === 0).join('').length < 6) return []
  const names: string[] = []
  const pattern = parts.map((part, index) => {
    if (index % 2) { names.push(part); return '([\\s\\S]*?)' }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('')
  return [{ matcher: new RegExp(`^${pattern}$`), names, translation, specificity: source.length - names.length * 3 }]
}).sort((left, right) => right.specificity - left.specificity)

export function translateMessage(source: string): string {
  if (language !== 'en' || Object.hasOwn(english, source)) return t(source)
  if (source.length > 10_000) return source
  for (const { matcher, names, translation } of diagnosticTemplates) {
    const match = matcher.exec(source)
    if (!match) continue
    const parameters: Record<string, string> = {}
    let consistent = true
    names.forEach((name, index) => {
      if (Object.hasOwn(parameters, name) && parameters[name] !== match[index + 1]) consistent = false
      parameters[name] = match[index + 1]
    })
    if (consistent) return translation.replace(/\{([\w]+)\}/g, (placeholder, name: string) => parameters[name] ?? placeholder)
  }
  return source
}

/** Date-only values are local calendar dates, never midnight UTC instants. */
export function formatDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(getLocale(), options).format(date)
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getLocale(), options).format(value)
}
