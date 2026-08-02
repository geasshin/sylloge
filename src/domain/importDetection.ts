/**
 * Détection automatique du type d'un fichier d'import (jalon 0.4.4).
 *
 * Un seul bouton « Importer » par bibliothèque : l'utilisateur choisit un
 * fichier et l'application reconnaît elle-même le format, sans lui demander
 * de le préciser.
 *
 * Formats reconnus :
 * - document de bibliothèque complète `sylloge-library` v2 (5 collections) ;
 * - export Films historique `sylloge-films` v1 ;
 * - CSV Films (contrat Sylloge) ;
 * - archive ZIP d'export Notion (détectée côté natif par l'extension).
 */

export type DetectedImportFormat =
  | 'sylloge-library'
  | 'sylloge-films-v1'
  | 'films-csv'
  | 'notion-zip'
  | 'unknown'

export type ImportFileProbe = {
  name: string
  contents: string | null
}

const KNOWN_JSON_FORMATS: Record<string, DetectedImportFormat> = {
  'sylloge-library': 'sylloge-library',
  'sylloge-films': 'sylloge-films-v1',
}

/**
 * Détecte le format d'un fichier choisi par l'utilisateur.
 *
 * `contents` est null pour les fichiers binaires (zip) dont seul le nom et
 * l'extension sont disponibles côté interface ; la détection repose alors
 * uniquement sur l'extension.
 */
export function detectImportFormat(probe: ImportFileProbe): DetectedImportFormat {
  const extension = probe.name.split('.').pop()?.toLocaleLowerCase('fr') ?? ''

  if (extension === 'zip') {
    return 'notion-zip'
  }

  if (extension === 'csv') {
    return 'films-csv'
  }

  if (extension === 'json' && probe.contents !== null) {
    return detectJsonFormat(probe.contents)
  }

  return 'unknown'
}

function detectJsonFormat(contents: string): DetectedImportFormat {
  let value: unknown
  try {
    value = JSON.parse(contents)
  } catch {
    return 'unknown'
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'unknown'
  }

  const format = (value as Record<string, unknown>).format
  if (typeof format !== 'string') {
    return 'unknown'
  }

  return KNOWN_JSON_FORMATS[format] ?? 'unknown'
}

export const IMPORT_FORMAT_LABELS: Record<DetectedImportFormat, string> = {
  'sylloge-library': 'Bibliothèque Sylloge complète (5 collections)',
  'sylloge-films-v1': 'Export Films Sylloge (format historique)',
  'films-csv': 'Tableur Films (CSV)',
  'notion-zip': 'Export Notion (archive ZIP)',
  unknown: 'Format non reconnu',
}
