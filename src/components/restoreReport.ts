import { formatNumber, t } from '../i18n/core.ts'
import type { ExperienceOutcome, ProfileExperience } from '../domain/profileExperience.ts'

/**
 * Bilan, en une phrase, de ce que la restauration a fait des vues enregistrées et des
 * préférences d'affichage. `null` quand il n'y a rien à dire : un document sans ce bloc
 * (versions 1 à 4) ou un bloc vide ne doit pas produire de phrase creuse.
 */

const plural = (count: number, one: string, many: string) =>
  t(count === 1 ? one : many, { count: formatNumber(count) })

export function experienceReportText(outcome: ExperienceOutcome): string | null {
  if (outcome === null) return null
  if (outcome === 'failed') {
    return t('Les fiches sont restaurées. Les vues enregistrées et les préférences n’ont pas pu l’être.')
  }
  const parts: string[] = []
  if (outcome.created > 0) parts.push(plural(outcome.created, '{count} vue restaurée', '{count} vues restaurées'))
  if (outcome.renamed.length > 0) parts.push(plural(outcome.renamed.length, '{count} renommée (nom déjà pris)', '{count} renommées (nom déjà pris)'))
  if (outcome.skipped.length > 0) parts.push(plural(outcome.skipped.length, '{count} ignorée', '{count} ignorées'))
  if (outcome.preferences.length > 0) parts.push(plural(outcome.preferences.length, '{count} préférence appliquée', '{count} préférences appliquées'))
  if (parts.length === 0) return null
  return t('Vues enregistrées et préférences : {parts}.', { parts: parts.join(' · ') })
}

/**
 * Ce qu'une sauvegarde emporte en plus des fiches, annoncé avant la restauration. Un document
 * sans ce bloc (versions 1 à 4) ou avec un bloc vide ne promet rien.
 */
export function experiencePreviewText(experience: ProfileExperience | null | undefined): string {
  const views = experience?.savedViews.length ?? 0
  const preferences = experience ? Object.keys(experience.preferences).length : 0
  const parts: string[] = []
  if (views > 0) parts.push(plural(views, '{count} vue enregistrée', '{count} vues enregistrées'))
  if (preferences > 0) parts.push(plural(preferences, '{count} préférence d’affichage', '{count} préférences d’affichage'))
  if (parts.length === 0) return t('Elle ne contient ni vue enregistrée ni préférence d’affichage.')
  return t('Elle contient aussi {parts}. Tout est restauré avec les fiches.', { parts: parts.join(t(' et ')) })
}
