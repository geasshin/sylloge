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
  /** Adresse de l'image en grand (TMDB original, IGDB t_1080p). */
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

/** Taille d'une image TMDB dans son adresse : `w1280`, `w780`… ou `original`. */
const TMDB_SIZED_IMAGE = /^(https:\/\/image\.tmdb\.org\/t\/p\/)w\d+\//

/**
 * Adresse à afficher pour une bannière : une image TMDB l'est toujours dans sa
 * définition d'origine (1 920 px ou plus). Les bannières choisies avant le
 * 30 octobre 2026 pointent `w1280`, que le bandeau étire sur un écran Retina :
 * elles paraissaient floues. La base n'est pas réécrite ; seule la lecture
 * change. Une adresse personnelle ou IGDB passe telle quelle.
 */
export function bannerDisplayUrl(url: string): string {
  return url.replace(TMDB_SIZED_IMAGE, '$1original/')
}

/** Deux adresses désignent-elles la même image, quelle que soit la taille TMDB ? */
export function sameBannerImage(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false
  return bannerDisplayUrl(a) === bannerDisplayUrl(b)
}

/**
 * Recadrage vertical d'une bannière (31 octobre 2026, migration 0028).
 *
 * Le bandeau est en 3:1 et l'image en 16:9 : `object-fit: cover` remplit la
 * largeur et cache environ 40 % de la hauteur. `object-position: 50% <p>%` dit
 * quelle bande reste visible — 0 montre le haut de l'image, 50 le centre
 * (défaut, `null` en base), 100 le bas. Ces calculs sont purs pour s'éprouver
 * hors de l'application (`scripts/banner-images.test.mjs`).
 */
export const BANNER_POSITION_DEFAULT = 50
/** Pas du clavier : 2 % par flèche, 10 % avec Maj. */
export const BANNER_POSITION_STEP = 2
export const BANNER_POSITION_STEP_LARGE = 10

/** Ramène un pourcentage de recadrage entre 0 et 100, arrondi à l'entier. */
export function clampBannerPosition(value: number): number {
  if (!Number.isFinite(value)) return BANNER_POSITION_DEFAULT
  return Math.min(100, Math.max(0, Math.round(value)))
}

/**
 * Position lue en base ou dans un document : `null` (ou absente) vaut centré,
 * une valeur reçue est ramenée dans les bornes. Import et lecture SQLite
 * passent par ici pour qu'une fiche ne porte jamais un pourcentage absurde.
 */
export function normalizeBannerPosition(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return clampBannerPosition(value)
}

/**
 * Position venue d'un geste ou d'un document : un pourcentage arrondi entre 0
 * et 100, ou `null` pour le centrage. Une valeur hors bornes est refusée par
 * une erreur lisible plutôt que corrigée en silence — le dépôt et l'import
 * partagent ainsi la même règle que la contrainte CHECK de la migration 0028.
 */
export function parseBannerPosition(value: number | null): number | null {
  if (value === null) return null
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('La position de la bannière doit être nulle ou un entier de 0 à 100.')
  }
  return Math.round(value)
}

/**
 * Hauteur réellement cachée de l'image dans le bandeau : `cover` la rend à la
 * largeur du cadre, donc `largeur × hauteurNaturelle / largeurNaturelle`, moins
 * la hauteur du cadre. Zéro quand l'image n'est pas plus haute que le bandeau.
 */
export function hiddenBannerPixels(
  frameWidth: number,
  frameHeight: number,
  naturalWidth: number | null,
  naturalHeight: number | null,
): number {
  if (!naturalWidth || !naturalHeight || frameWidth <= 0 || frameHeight <= 0) return 0
  return Math.max(0, (frameWidth * naturalHeight) / naturalWidth - frameHeight)
}

/**
 * Position après un glissement vertical : `deltaPx` positif = doigt vers le
 * bas, qui montre davantage le haut de l'image et fait donc baisser le
 * pourcentage. `hiddenPx` est la hauteur réellement cachée de l'image rendue
 * (hauteur rendue − hauteur du bandeau) ; sans hauteur cachée, rien ne bouge.
 */
export function bannerPositionAfterDrag(start: number, deltaPx: number, hiddenPx: number): number {
  if (!Number.isFinite(deltaPx) || !Number.isFinite(hiddenPx) || hiddenPx <= 0) {
    return clampBannerPosition(start)
  }
  return clampBannerPosition(start - (deltaPx / hiddenPx) * 100)
}
