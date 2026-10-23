/**
 * Affiche d'un film : une seule règle pour la fiche, le formulaire, l'accueil et les cartes.
 *
 * Trois sources existent : la colonne locale `films.poster_url` (ce que la personne a saisi ou
 * collé), l'affiche choisie dans la galerie TMDB (`selectedPosterUrl`) et l'affiche principale du
 * fournisseur. Ordre : un lien personnel, puis le choix de la galerie, puis l'affiche principale,
 * puis la colonne locale.
 *
 * Un lien est « personnel » quand il n'appartient pas au fournisseur : ni hébergé par
 * image.tmdb.org, ni connu du cache. Ce critère évite une colonne supplémentaire et laisse les
 * fiches existantes se comporter comme avant, puisque leur adresse locale est une affiche TMDB
 * recopiée à la création.
 */

export type FilmPosterCache = {
  selectedPosterUrl: string | null
  presentation: {
    posterUrl: string | null
    alternativePosterUrls: readonly string[]
  }
}

const PROVIDER_IMAGE_HOST = 'image.tmdb.org'

function httpHost(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.hostname.toLowerCase() : null
  } catch {
    return null
  }
}

/** Vrai pour une adresse http(s) que ni TMDB ni son cache ne reconnaissent. */
export function isCustomFilmPoster(storedUrl: string | null | undefined, cache: FilmPosterCache | null): boolean {
  if (!storedUrl) return false
  const host = httpHost(storedUrl)
  if (host === null || host === PROVIDER_IMAGE_HOST) return false
  if (cache) {
    const trimmed = storedUrl.trim()
    if (cache.selectedPosterUrl === trimmed || cache.presentation.posterUrl === trimmed) return false
    if (cache.presentation.alternativePosterUrls.includes(trimmed)) return false
  }
  return true
}

export function resolveFilmPoster(storedUrl: string | null | undefined, cache: FilmPosterCache | null): string | null {
  const stored = storedUrl && httpHost(storedUrl) !== null ? storedUrl.trim() : null
  if (isCustomFilmPoster(stored, cache)) return stored
  return cache?.selectedPosterUrl ?? cache?.presentation.posterUrl ?? stored
}
