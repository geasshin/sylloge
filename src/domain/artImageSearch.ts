// Recherche d'images libres pour une œuvre, auprès de Wikimedia Commons : la logique pure.
//
// Le réseau est ailleurs (`fetch_commons_search` côté Rust, simulé par le pont de recette) ; ici on
// écrit l'adresse de la recherche, puis on lit la réponse. Une seule implémentation du tri et du
// filtrage, testée en Node.
//
// Décisions du 25 octobre 2026 :
//   - Commons seul, sans clé ni quota ; The Met et l'Art Institute of Chicago plus tard si besoin ;
//   - requête `titre + artiste`, repli sur le titre seul — jamais la date, qui fait rater plus qu'elle n'aide ;
//   - six propositions au plus, chacune portant sa licence : on ne propose que ce qu'on peut montrer ;
//   - on retient l'adresse de la vignette de 800 px (stable, légère, servie par Wikimedia), pas
//     l'original — une œuvre en très haute définition pèserait des dizaines de mégaoctets.

/** Une image proposée pour une œuvre : son adresse, sa page, sa licence et sa taille. */
export type ArtworkImageCandidate = {
  /** Adresse de la vignette à retenir dans la fiche. */
  url: string
  /** Page du fichier sur Commons, pour retrouver l'auteur et la licence. */
  pageUrl: string
  /** Nom du fichier, sans le préfixe « File: ». */
  title: string
  /** Licence lisible (« Public domain », « CC BY-SA 4.0 »…) ; vide si Commons ne la donne pas. */
  license: string
  width: number
  height: number
}

/** L'adresse de l'API Commons ; la même constante que côté Rust. */
export const COMMONS_ENDPOINT = 'https://commons.wikimedia.org/w/api.php'

/** Six propositions : au-delà, la grille devient une planche de timbres. */
export const MAX_ARTWORK_IMAGES = 6

/** Largeur minimale de l'image d'origine : en dessous, le visuel serait flou dans la grille. */
const MIN_SOURCE_WIDTH = 400

/** Formats acceptés : ceux qu'une affiche supporte. Un SVG (schéma, logo) n'a rien à faire ici. */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * L'adresse de la recherche. `formatversion=2` rend `query.pages` sous forme de tableau, plus simple à
 * lire qu'un objet indexé par identifiant.
 */
export function commonsSearchUrl(title: string, artist: string | null): string {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: [title.trim(), (artist ?? '').trim()].filter(Boolean).join(' '),
    gsrnamespace: '6',
    gsrlimit: '12',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
    iiurlwidth: '800',
  })
  return `${COMMONS_ENDPOINT}?${params.toString()}`
}

type Unknown = Record<string, unknown>

const asObject = (value: unknown): Unknown | null => (typeof value === 'object' && value !== null ? value as Unknown : null)
const asString = (value: unknown): string => (typeof value === 'string' ? value : '')
const asNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

/** Le texte d'un champ `extmetadata` (Commons le rend sous la forme `{ value, source }`). */
function metadataValue(imageinfo: Unknown, key: string): string {
  const metadata = asObject(imageinfo.extmetadata)
  if (!metadata) return ''
  const entry = asObject(metadata[key])
  const raw = entry ? asString(entry.value) : asString(metadata[key])
  // Commons renvoie parfois du HTML léger (`<span>`, `<a>`), on ne garde que le texte.
  return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Forme comparable d'un nom : sans accent, sans casse, sans ponctuation. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Combien le nom de fichier évoque l'artiste : deux points par mot distinct retrouvé (« Courbet » dans
 * « Gustave Courbet - La vague »). Les mots trop courts (« de », « le », « van ») ne comptent pas.
 */
function artistScore(title: string, artist: string | null): number {
  const words = normalize(artist ?? '').split(' ').filter(word => word.length >= 4)
  if (words.length === 0) return 0
  const name = normalize(title)
  return words.filter(word => name.includes(word)).length * 2
}

/**
 * Les propositions d'une réponse de Commons, les plus pertinentes d'abord : les fichiers dont le nom
 * porte le nom de l'artiste remontent, l'ordre de la recherche tranche les égalités.
 */
export function candidatesFromCommons(
  payload: unknown,
  artist: string | null,
  limit: number = MAX_ARTWORK_IMAGES,
): ArtworkImageCandidate[] {
  const query = asObject(asObject(payload)?.query)
  const pages = query?.pages
  if (!Array.isArray(pages)) return []

  const kept: Array<{ candidate: ArtworkImageCandidate; score: number; order: number }> = []
  pages.forEach((page, order) => {
    const entry = asObject(page)
    if (!entry) return
    const imageinfo = Array.isArray(entry.imageinfo) ? asObject(entry.imageinfo[0]) : null
    if (!imageinfo) return
    const mime = asString(imageinfo.mime).toLowerCase()
    if (!ALLOWED_MIME.has(mime)) return
    const width = asNumber(imageinfo.width)
    const height = asNumber(imageinfo.height)
    if (width < MIN_SOURCE_WIDTH || height <= 0) return
    const url = asString(imageinfo.thumburl) || asString(imageinfo.url)
    if (!/^https?:\/\//i.test(url)) return
    const title = asString(entry.title).replace(/^File:/i, '').trim() || 'Sans nom'
    kept.push({
      candidate: {
        url,
        pageUrl: asString(imageinfo.descriptionurl),
        title,
        license: metadataValue(imageinfo, 'LicenseShortName'),
        width,
        height,
      },
      score: artistScore(title, artist),
      order,
    })
  })

  return kept
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, Math.max(0, limit))
    .map(entry => entry.candidate)
}
