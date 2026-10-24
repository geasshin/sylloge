// Cartes à partager : la mise en page, en calcul pur.
//
// Toile de 1 080 px de large (la largeur d'une image de réseau social) dont la hauteur suit le contenu.
// Ce module place des rectangles ; il ne mesure aucun texte et ne dessine rien. Le dessin
// (src/components/shareCardImage.ts) lit ces rectangles et y ajuste ses textes.
//
// La carte est un mur d'affiches : trois rangées de cinq au plus (coups de cœur, mieux notés avec leurs
// étoiles, terminés récemment). Aucun studio, aucune date, aucun pied de page.

import type { ShareCardModel, ShareItem } from './shareCard.ts'

export const SHARE_CARD = {
  width: 1080,
  margin: 72,
  /** Espace entre deux affiches ou deux cases. */
  gap: 16,
  /** Espace entre deux blocs. */
  blockGap: 32,
  headerHeight: 128,
  logoWidth: 80,
  logoHeight: 104,
  /** Air entre le logo et le texte de l'en-tête. */
  logoGap: 28,
  statHeight: 96,
  librariesHeight: 56,
  sectionTitleHeight: 40,
  sectionTitleGap: 16,
  /** Étoiles sous une affiche des « mieux notés ». */
  starsGap: 12,
  starsHeight: 28,
  bottomMargin: 56,
  maxTilesPerRow: 5,
  /** Une affiche n'excède pas cette largeur : quelques œuvres ne deviennent pas d'immenses affiches. */
  maxTileWidth: 220,
  tileRatio: 1.5,
  minHeight: 1080,
  maxHeight: 1700,
} as const

export type Rect = { x: number; y: number; w: number; h: number }

export type StatKey = 'total' | 'done' | 'favorites' | 'average'
export type TileSection = 'favorites' | 'topRated' | 'recent'

export type LayoutTile = { rect: Rect; item: ShareItem; /** Rangée d'étoiles sous l'affiche, pour les mieux notés seulement. */ starsRect: Rect | null }

export type LayoutBlock =
  | { kind: 'header'; rect: Rect; logo: Rect; /** Abscisse du texte, à droite du logo. */ textX: number }
  | { kind: 'stats'; rect: Rect; cells: Array<{ key: StatKey; rect: Rect }>; libraries: Rect | null }
  | { kind: 'tiles'; section: TileSection; rect: Rect; titleRect: Rect; tiles: LayoutTile[] }

export type ShareCardLayout = {
  width: number
  height: number
  blocks: LayoutBlock[]
  /** Adresses d'image à charger, une fois chacune, dans l'ordre d'apparition. */
  imageUrls: string[]
}

const contentWidth = SHARE_CARD.width - 2 * SHARE_CARD.margin

export function layoutShareCard(model: ShareCardModel): ShareCardLayout {
  const { margin, gap, blockGap } = SHARE_CARD
  const blocks: LayoutBlock[] = []
  let y = margin

  const logo = { x: margin, y: y + Math.round((SHARE_CARD.headerHeight - SHARE_CARD.logoHeight) / 2), w: SHARE_CARD.logoWidth, h: SHARE_CARD.logoHeight }
  blocks.push({ kind: 'header', rect: { x: margin, y, w: contentWidth, h: SHARE_CARD.headerHeight }, logo, textX: margin + SHARE_CARD.logoWidth + SHARE_CARD.logoGap })
  y += SHARE_CARD.headerHeight + blockGap

  // Chiffres clés : la note moyenne n'a de case que s'il y a au moins une note.
  const keys: StatKey[] = model.stats.averageRating === null ? ['total', 'done', 'favorites'] : ['total', 'done', 'favorites', 'average']
  const cellWidth = Math.floor((contentWidth - (keys.length - 1) * gap) / keys.length)
  const cells = keys.map((key, index) => ({ key, rect: { x: margin + index * (cellWidth + gap), y, w: cellWidth, h: SHARE_CARD.statHeight } }))
  const showLibraries = model.stats.perLibrary !== null && model.stats.perLibrary.length >= 2
  const statsHeight = SHARE_CARD.statHeight + (showLibraries ? gap + SHARE_CARD.librariesHeight : 0)
  blocks.push({
    kind: 'stats',
    rect: { x: margin, y, w: contentWidth, h: statsHeight },
    cells,
    libraries: showLibraries ? { x: margin, y: y + SHARE_CARD.statHeight + gap, w: contentWidth, h: SHARE_CARD.librariesHeight } : null,
  })
  y += statsHeight + blockGap

  const imageUrls: string[] = []
  const addTiles = (section: TileSection, items: ShareItem[]) => {
    if (items.length === 0) return
    const count = Math.min(items.length, SHARE_CARD.maxTilesPerRow)
    const tileWidth = Math.min(SHARE_CARD.maxTileWidth, Math.floor((contentWidth - (count - 1) * gap) / count))
    const tileHeight = Math.round(tileWidth * SHARE_CARD.tileRatio)
    const withStars = section === 'topRated'
    const titleRect = { x: margin, y, w: contentWidth, h: SHARE_CARD.sectionTitleHeight }
    const tilesY = y + SHARE_CARD.sectionTitleHeight + SHARE_CARD.sectionTitleGap
    const tiles: LayoutTile[] = items.slice(0, count).map((item, index) => {
      const rect = { x: margin + index * (tileWidth + gap), y: tilesY, w: tileWidth, h: tileHeight }
      return { item, rect, starsRect: withStars ? { x: rect.x, y: tilesY + tileHeight + SHARE_CARD.starsGap, w: tileWidth, h: SHARE_CARD.starsHeight } : null }
    })
    for (const { item } of tiles) if (item.imageUrl && !imageUrls.includes(item.imageUrl)) imageUrls.push(item.imageUrl)
    const height = SHARE_CARD.sectionTitleHeight + SHARE_CARD.sectionTitleGap + tileHeight + (withStars ? SHARE_CARD.starsGap + SHARE_CARD.starsHeight : 0)
    blocks.push({ kind: 'tiles', section, rect: { x: margin, y, w: contentWidth, h: height }, titleRect, tiles })
    y += height + blockGap
  }

  addTiles('favorites', model.sections.favorites)
  addTiles('topRated', model.sections.topRated)
  addTiles('recent', model.sections.recent)

  // Le dernier bloc est déjà suivi d'un espace de bloc : on le remplace par la marge basse.
  y += SHARE_CARD.bottomMargin - blockGap

  return { width: SHARE_CARD.width, height: Math.max(SHARE_CARD.minHeight, y), blocks, imageUrls }
}
