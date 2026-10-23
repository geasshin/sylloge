import {
  deserializeSavedViewCriteria,
  SAVED_VIEW_MEDIA,
  serializeSavedViewCriteria,
  validateSavedViewName,
  type SavedView,
  type SavedViewCriteria,
  type SavedViewMedium,
} from './savedViews.ts'

/**
 * Expérience d'un profil : ce qui accompagne les fiches quand on change de machine ou qu'on
 * restaure une sauvegarde (document v5).
 *
 * Jusqu'à la v4, un export ne portait que les fiches et les bibliothèques : les vues
 * enregistrées et les préférences d'interface restaient sur la machine d'origine — choix du
 * brief 0.4.21, renversé par l'objectif « portabilité intégrale de l'expérience ».
 *
 * Ce qui voyage : les vues enregistrées du profil et les préférences d'affichage.
 * Ce qui reste sur la machine, volontairement : le dossier de sauvegarde (chemin absolu de
 * cette machine), la liste des copies, le cache de métadonnées, la version ignorée du
 * vérificateur de mise à jour et l'état des fenêtres. Les importer reproduirait ici un
 * réglage qui ne désigne rien.
 */

export const EXPERIENCE_VERSION = 1

/** Clés de préférence admises, avec la valeur qu'elles peuvent prendre. */
export const PORTABLE_PREFERENCES = {
  theme: ['system', 'light', 'dark'],
  language: ['fr', 'en'],
  homeAutoplay: ['on', 'off'],
  sidebarPinned: ['true', 'false'],
} as const

export type PortablePreferenceKey = keyof typeof PORTABLE_PREFERENCES
export type PortablePreferences = Partial<Record<PortablePreferenceKey, string>>

/** Clé de stockage locale de chaque préférence (l'interface les lit à ces noms). */
export const PREFERENCE_STORAGE_KEYS: Record<PortablePreferenceKey, string> = {
  theme: 'sylloge-theme',
  language: 'sylloge-language',
  homeAutoplay: 'sylloge-home-autoplay',
  sidebarPinned: 'sylloge-sidebar-pinned',
}

export const PORTABLE_PREFERENCE_KEYS = Object.keys(PORTABLE_PREFERENCES) as PortablePreferenceKey[]

/** Une vue telle qu'elle voyage : ses critères sont relus par le sanitizeur du domaine. */
export type ExportedSavedView = {
  medium: SavedViewMedium
  name: string
  criteria: SavedViewCriteria
  createdAt: string
  updatedAt: string
}

export type ProfileExperience = {
  version: number
  savedViews: ExportedSavedView[]
  preferences: PortablePreferences
}

export type PreferenceReader = (key: string) => string | null
export type PreferenceWriter = (key: string, value: string) => void

/** Lit les préférences d'affichage ; une valeur inconnue est ignorée plutôt que recopiée. */
export function collectPreferences(read: PreferenceReader): PortablePreferences {
  const preferences: PortablePreferences = {}
  for (const key of PORTABLE_PREFERENCE_KEYS) {
    const value = read(PREFERENCE_STORAGE_KEYS[key])
    if (value !== null && (PORTABLE_PREFERENCES[key] as readonly string[]).includes(value)) {
      preferences[key] = value
    }
  }
  return preferences
}

/** Écrit les préférences portées par un document. Rend les clés réellement appliquées. */
export function applyPreferences(preferences: PortablePreferences, write: PreferenceWriter): PortablePreferenceKey[] {
  const applied: PortablePreferenceKey[] = []
  for (const key of PORTABLE_PREFERENCE_KEYS) {
    const value = preferences[key]
    if (value === undefined || !(PORTABLE_PREFERENCES[key] as readonly string[]).includes(value)) continue
    write(PREFERENCE_STORAGE_KEYS[key], value)
    applied.push(key)
  }
  return applied
}

/** Ce que le dépôt de vues doit savoir faire pour restaurer : rien de plus. */
export type SavedViewsRestorePort = {
  list(profileId: string, medium: SavedViewMedium): Promise<SavedView[]>
  create(profileId: string, medium: SavedViewMedium, name: string, criteria: SavedViewCriteria): Promise<SavedView>
}

export type ExperienceRestoreReport = {
  created: number
  renamed: string[]
  skipped: string[]
  preferences: PortablePreferenceKey[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Relit le bloc `experience` d'un document. Un bloc absent (v4) ou illisible n'empêche pas la
 * restauration des fiches : on rend `null` et les raisons, l'appelant décide d'informer.
 */
export function readExperience(value: unknown): { experience: ProfileExperience | null; errors: string[]; dropped: string[] } {
  // `errors` rend le document invalide (bloc illisible) ; `dropped` ne liste que ce qui a été
  // écarté sans conséquence pour les fiches : une préférence inconnue ne doit pas faire perdre
  // une collection.
  const errors: string[] = []
  const dropped: string[] = []
  if (value === undefined || value === null) return { experience: null, errors, dropped }
  if (!isRecord(value)) return { experience: null, errors: ['Le bloc experience doit être un objet.'], dropped }

  const version = typeof value.version === 'number' && Number.isInteger(value.version) ? value.version : EXPERIENCE_VERSION
  if (version > EXPERIENCE_VERSION) {
    errors.push(`Le bloc experience annonce la version ${version}, plus récente que ${EXPERIENCE_VERSION}.`)
    return { experience: null, errors, dropped }
  }

  const preferences: PortablePreferences = {}
  if (value.preferences !== undefined && value.preferences !== null) {
    if (!isRecord(value.preferences)) dropped.push('experience.preferences')
    else {
      for (const key of PORTABLE_PREFERENCE_KEYS) {
        const candidate = value.preferences[key]
        if (candidate === undefined) continue
        if (typeof candidate !== 'string' || !(PORTABLE_PREFERENCES[key] as readonly string[]).includes(candidate)) {
          dropped.push(`experience.preferences.${key}`)
          continue
        }
        preferences[key] = candidate
      }
    }
  }

  const savedViews: ExportedSavedView[] = []
  if (value.savedViews !== undefined && value.savedViews !== null) {
    if (!Array.isArray(value.savedViews)) dropped.push('experience.savedViews')
    else {
      value.savedViews.forEach((candidate, index) => {
        const path = `experience.savedViews[${index}]`
        if (!isRecord(candidate)) {
          dropped.push(path)
          return
        }
        const medium = candidate.medium
        if (typeof medium !== 'string' || !(SAVED_VIEW_MEDIA as readonly string[]).includes(medium)) {
          dropped.push(`${path}.medium`)
          return
        }
        const name = validateSavedViewName(typeof candidate.name === 'string' ? candidate.name : '')
        if (!name.ok) {
          dropped.push(`${path}.name`)
          return
        }
        // Les critères passent par le sanitizeur du domaine : un document ancien ou abîmé
        // donne une vue valide par défaut, jamais une vue qui casse la bibliothèque.
        const criteria = deserializeSavedViewCriteria(medium as SavedViewMedium, JSON.stringify(candidate.criteria ?? null))
        savedViews.push({
          medium: medium as SavedViewMedium,
          name: name.name,
          criteria,
          createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
          updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
        })
      })
    }
  }

  return { experience: { version: EXPERIENCE_VERSION, savedViews, preferences }, errors, dropped }
}

/** Construit le bloc voyageant à partir des vues du profil et des préférences déjà lues. */
export function buildExperience(savedViews: ExportedSavedView[], preferences: PortablePreferences): ProfileExperience {
  const clean: PortablePreferences = {}
  for (const key of PORTABLE_PREFERENCE_KEYS) {
    const value = preferences[key]
    if (value !== undefined && (PORTABLE_PREFERENCES[key] as readonly string[]).includes(value)) clean[key] = value
  }
  return {
    version: EXPERIENCE_VERSION,
    savedViews: [...savedViews]
      .sort((first, second) => first.medium.localeCompare(second.medium) || first.name.localeCompare(second.name))
      .map((view) => ({
        medium: view.medium,
        name: view.name,
        criteria: deserializeSavedViewCriteria(view.medium, serializeSavedViewCriteria(view.criteria)),
        createdAt: view.createdAt,
        updatedAt: view.updatedAt,
      })),
    preferences: clean,
  }
}

const duplicateName = (name: string, attempt: number) => {
  const suffix = ` (${attempt})`
  return `${name.slice(0, Math.max(0, 80 - suffix.length)).trimEnd()}${suffix}`
}

/**
 * Recrée les vues d'un profil restauré. Un nom déjà pris reçoit un suffixe plutôt que d'être
 * perdu ou d'écraser une vue existante ; une création refusée est rapportée, jamais masquée.
 */
export async function restoreSavedViews(
  experience: ProfileExperience | null,
  profileId: string,
  port: SavedViewsRestorePort,
): Promise<{ created: number; renamed: string[]; skipped: string[] }> {
  const report = { created: 0, renamed: [] as string[], skipped: [] as string[] }
  if (!experience) return report

  for (const view of experience.savedViews) {
    let attempt = 1
    let inserted = false
    while (attempt <= 5 && !inserted) {
      const name = attempt === 1 ? view.name : duplicateName(view.name, attempt)
      try {
        await port.create(profileId, view.medium, name, view.criteria)
        report.created += 1
        if (attempt > 1) report.renamed.push(`${view.name} → ${name}`)
        inserted = true
      } catch {
        attempt += 1
      }
    }
    if (!inserted) report.skipped.push(view.name)
  }
  return report
}

/** Message lisible d'un bilan de restauration, sans jargon de base de données. */
export function experienceRestoreMessage(report: ExperienceRestoreReport): string {
  const parts: string[] = []
  if (report.created > 0) parts.push(`${report.created} vue${report.created > 1 ? 's' : ''} restaurée${report.created > 1 ? 's' : ''}`)
  if (report.renamed.length > 0) parts.push(`${report.renamed.length} renommée${report.renamed.length > 1 ? 's' : ''} (nom déjà pris)`)
  if (report.skipped.length > 0) parts.push(`${report.skipped.length} ignorée${report.skipped.length > 1 ? 's' : ''}`)
  if (report.preferences.length > 0) parts.push(`${report.preferences.length} préférence${report.preferences.length > 1 ? 's' : ''} appliquée${report.preferences.length > 1 ? 's' : ''}`)
  return parts.join(' · ')
}
