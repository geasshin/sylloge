import { invoke } from '@tauri-apps/api/core'
import { getLocale } from '../i18n/core.ts'
import { orderBannerCandidates, type BannerImageCandidate } from '../domain/bannerImages.ts'

/**
 * Fiche dont on cherche la bannière. Le médium décide du fournisseur : films,
 * séries et animés lisent les décors TMDB ; les jeux lisent les visuels IGDB.
 * Le nom est celui du contrat de la commande native (`fetch_banner_candidates`).
 */
export type BannerMedium = 'film' | 'series' | 'anime' | 'game'

export type BannerCandidate = BannerImageCandidate

/**
 * Images officielles d'une fiche, déjà filtrées et ordonnées pour la fenêtre de
 * choix : sans texte d'abord, puis la langue de l'interface, puis le reste,
 * 24 au plus (`orderBannerCandidates`).
 *
 * La fenêtre ne joint aucun service : tout passe par Rust, qui interroge le
 * relais du projet (`connect-src 'self' ipc:`).
 */
export async function fetchBannerCandidates(
  medium: BannerMedium,
  providerId: string,
  language: string = getLocale(),
): Promise<BannerCandidate[]> {
  const raw = await invoke<BannerImageCandidate[]>('fetch_banner_candidates', {
    medium,
    providerId,
  })
  return orderBannerCandidates(Array.isArray(raw) ? raw : [], language)
}
