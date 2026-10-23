import { getLanguage, setLanguage, type Language } from '../i18n/core.ts'
import {
  applyPreferences,
  buildExperience,
  collectPreferences,
  PREFERENCE_STORAGE_KEYS,
  restoreSavedViews,
  type ExperienceRestoreReport,
  type ExportedSavedView,
  type ProfileExperience,
  type SavedViewsRestorePort,
} from '../domain/profileExperience.ts'
import { SAVED_VIEW_MEDIA } from '../domain/savedViews.ts'
import { resolveTheme } from '../domain/theme.ts'
import { savedViewsRepository } from './savedViewsRepository.ts'

/**
 * Collecte et restauration de l'expérience d'un profil (document v5).
 *
 * Le domaine décide de ce qui voyage ; ce module ne fait que le brancher sur ce qui existe
 * ici : le dépôt SQLite des vues, le stockage local de l'interface et le thème.
 */

/** Lit les vues du profil et les préférences de cette machine, dans l'ordre du document. */
export async function collectProfileExperience(
  profileId: string,
  port: Pick<SavedViewsRestorePort, 'list'> = savedViewsRepository,
): Promise<ProfileExperience> {
  const views: ExportedSavedView[] = []
  for (const medium of SAVED_VIEW_MEDIA) {
    for (const view of await port.list(profileId, medium)) {
      views.push({ medium, name: view.name, criteria: view.criteria, createdAt: view.createdAt, updatedAt: view.updatedAt })
    }
  }
  const preferences = typeof localStorage === 'undefined'
    ? {}
    : collectPreferences((key) => localStorage.getItem(key))
  return buildExperience(views, preferences)
}

/**
 * Applique l'expérience d'un document restauré. Les préférences prennent effet tout de
 * suite (le thème par `data-theme`, la langue par son magasin) ; le prochain lancement les
 * relit de toute façon depuis le stockage local.
 */
export async function restoreProfileExperience(
  experience: ProfileExperience | null | undefined,
  profileId: string,
  port: SavedViewsRestorePort = savedViewsRepository,
): Promise<ExperienceRestoreReport> {
  const views = await restoreSavedViews(experience ?? null, profileId, port)

  let preferences: ExperienceRestoreReport['preferences'] = []
  if (experience && typeof localStorage !== 'undefined') {
    preferences = applyPreferences(experience.preferences, (key, value) => {
      localStorage.setItem(key, value)
      if (key === PREFERENCE_STORAGE_KEYS.language && (value === 'fr' || value === 'en') && value !== getLanguage()) {
        setLanguage(value as Language)
      }
      if (key === PREFERENCE_STORAGE_KEYS.theme && typeof document !== 'undefined') {
        document.documentElement.dataset.theme = value === 'system' ? resolveTheme('system') : value
      }
    })
  }

  if (views.skipped.length > 0) {
    console.warn(`Vues non restaurées : ${views.skipped.join(', ')}.`)
  }
  return { ...views, preferences }
}
