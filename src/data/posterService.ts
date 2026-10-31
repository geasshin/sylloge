import { invoke } from '@tauri-apps/api/core'

/**
 * Fiche dont on cherche les affiches. Seules les séries et les animés passent
 * par cette commande : un film garde le cache TMDB et ses quatre alternatives
 * (`alternativePosterUrls`), les autres médiums n'ont pas de galerie.
 */
export type PosterMedium = 'series' | 'anime'

/** Une affiche officielle : l'adresse en grand (`w500`) et sa vignette (`w342`). */
export type PosterCandidate = {
  url: string
  thumbnailUrl: string
  /** Langue du texte incrusté ; `null` quand l'affiche n'en porte pas. */
  language: string | null
}

/**
 * Affiches officielles d'une série ou d'un animé, déjà filtrées, dédoublonnées
 * et ordonnées par le natif (`src-tauri/src/posters.rs`) : français, sans
 * texte, anglais, puis le reste ; 40 au plus.
 *
 * La fenêtre ne joint aucun service : tout passe par Rust, qui interroge le
 * relais du projet (`connect-src 'self' ipc:`).
 */
export async function fetchPosterCandidates(
  medium: PosterMedium,
  providerId: string,
): Promise<PosterCandidate[]> {
  const raw = await invoke<PosterCandidate[]>('fetch_poster_candidates', {
    medium,
    providerId,
  })
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (candidate): candidate is PosterCandidate =>
      typeof candidate?.url === 'string'
      && candidate.url !== ''
      && typeof candidate.thumbnailUrl === 'string'
      && candidate.thumbnailUrl !== '',
  )
}
