/**
 * Images officielles proposées pour la bannière d'une fiche (films, séries,
 * animation japonaise, jeux).
 *
 * Une bannière est l'adresse d'une image paysage, jamais un fichier : la base
 * ne garde que le lien (`banner_url`), comme pour les affiches. Ce module est
 * pur — aucun accès réseau, aucune écriture — pour que le tri et le filtrage
 * s'éprouvent hors de l'application (`scripts/banner-images.test.mjs`).
 *
 * Les candidats viennent de la commande native `fetch_banner_candidates` :
 * décors TMDB (`/movie/{id}/images`, `/tv/{id}/images`) et visuels IGDB
 * (`artworks`, puis `screenshots`). Le natif construit les adresses et retire
 * ce qui n'est visiblement pas un bandeau ; ce module refait le contrôle de
 * forme (défense en profondeur), choisit l'ordre et borne la liste.
 */

/** Une image proposée pour la bannière d'une fiche. */
export type BannerImageCandidate = {
  /** Adresse de l'image en grand (TMDB w1280, IGDB t_1080p). */
  url: string
  /** Même image en petit, pour la vignette de la fenêtre de choix. */
  thumbnailUrl: string
  width: number | null
  height: number | null
  /** Langue du texte incrusté (`iso_639_1` TMDB) ; `null` quand l'image n'en porte pas. */
  language: string | null
  source: 'tmdb' | 'igdb'
}

/** Fenêtre de format d'un bandeau : du 16:10 au 2:1. */
export const BANNER_MIN_RATIO = 1.6
export const BANNER_MAX_RATIO = 2.0
/** En dessous, l'image est agrandie et perd en netteté sur un bandeau pleine largeur. */
export const BANNER_MIN_WIDTH = 1280
/** Au-delà, la fenêtre de choix devient une planche de vignettes illisible. */
export const BANNER_MAX_CANDIDATES = 24
/**
 * Un aperçu collé sous ce format est signalé : recadré en 16:9, il perd
 * l'essentiel de son cadre (une affiche 2:3, un carré).
 */
export const BANNER_CROP_WARNING_RATIO = 1.3

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'])
/** Tolérance sur 16:9 (1,777…) et 2:1, pour ne pas écarter une valeur arrondie par le fournisseur. */
const RATIO_EPSILON = 0.005

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** Extension du dernier segment du chemin, ou `null` quand il n'y en a pas. */
function pathExtension(url: URL): string | null {
  const last = url.pathname.split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : null
}

/**
 * Vrai pour une adresse https qui désigne une image et dont le format connu
 * tient dans la fenêtre d'un bandeau. Des dimensions absentes ne disqualifient
 * pas : elles seront jugées à l'affichage.
 */
export function isBannerCandidate(candidate: BannerImageCandidate): boolean {
  if (!candidate.url.trim() || !candidate.thumbnailUrl.trim()) return false
  if (!parseHttpsUrl(candidate.url) || !parseHttpsUrl(candidate.thumbnailUrl)) return false
  const extension = pathExtension(new URL(candidate.url.trim()))
  if (extension !== null && !IMAGE_EXTENSIONS.has(extension)) return false

  const { width, height } = candidate
  if (width === null || height === null) return true
  if (width <= 0 || height <= 0) return false
  if (width < BANNER_MIN_WIDTH) return false
  const ratio = width / height
  return ratio >= BANNER_MIN_RATIO - RATIO_EPSILON && ratio <= BANNER_MAX_RATIO + RATIO_EPSILON
}

/** Langue principale d'une étiquette (`fr-FR` et `fr` se comparent). */
function primaryLanguage(language: string | null): string {
  return (language ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? ''
}

/**
 * Rang d'une image : 0 sans texte (le meilleur fond pour un bandeau), 1 dans la
 * langue de l'interface, 2 les autres. Une image sans langue connue du
 * fournisseur est « sans texte » (`iso_639_1 == null` chez TMDB).
 */
function languageRank(candidate: BannerImageCandidate, interfaceLanguage: string): number {
  if (!candidate.language) return 0
  const wanted = primaryLanguage(interfaceLanguage)
  return wanted !== '' && primaryLanguage(candidate.language) === wanted ? 1 : 2
}

/**
 * Candidats prêts pour la fenêtre de choix : doublons retirés (la première
 * occurrence gagne), forme vérifiée, ordre « sans texte, puis la langue de
 * l'interface, puis le reste », largeur décroissante, et 24 au plus.
 */
export function orderBannerCandidates(
  candidates: readonly BannerImageCandidate[],
  interfaceLanguage: string,
  limit = BANNER_MAX_CANDIDATES,
): BannerImageCandidate[] {
  const seen = new Set<string>()
  const kept: BannerImageCandidate[] = []
  for (const candidate of candidates) {
    const key = candidate.url.trim()
    if (seen.has(key) || !isBannerCandidate(candidate)) continue
    seen.add(key)
    kept.push(candidate)
  }

  kept.sort((first, second) => {
    const rank = languageRank(first, interfaceLanguage) - languageRank(second, interfaceLanguage)
    if (rank !== 0) return rank
    const width = (second.width ?? 0) - (first.width ?? 0)
    if (width !== 0) return width
    return first.url.localeCompare(second.url)
  })

  return kept.slice(0, Math.max(0, limit))
}

/**
 * Vrai quand un aperçu collé est trop vertical pour un bandeau 16:9 : la
 * fenêtre le dit avant d'enregistrer, sans refuser l'adresse.
 */
export function bannerCropWarning(ratio: number | null): boolean {
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) return false
  return ratio < BANNER_CROP_WARNING_RATIO
}

/** Adresse de bannière bornée : une URL d'image peut être longue, pas sans fin. */
export const MAX_BANNER_URL_LENGTH = 2048

/**
 * Une bannière enregistrée est toujours une adresse `https://` : la fenêtre ne
 * joint aucun service, mais une fiche ne doit pas pouvoir pointer un schéma
 * local (`file:`, `data:`) ni une adresse démesurée. Vide → aucune bannière.
 */
export function normalizeBannerUrl(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/** Vrai pour une adresse `https://` d'au plus 2 048 caractères, sans espace. */
export function isBannerUrl(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > MAX_BANNER_URL_LENGTH) return false
  if (/\s/.test(trimmed)) return false
  try {
    return new URL(trimmed).protocol === 'https:'
  } catch {
    return false
  }
}
