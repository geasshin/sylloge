// Cartes à partager : la mise en page, en calcul pur.
//
// Toile de 1 080 px de large (la largeur d'une image de réseau social) dont la hauteur suit le contenu.
// Ce module place des rectangles ; il ne mesure aucun texte et ne dessine rien. Le dessin
// (src/components/shareCardImage.ts) lit ces rectangles et y ajuste ses textes.

import type { ShareCardModel, ShareItem } from './shareCard.ts'

export const SHARE_CARD = {
  width: 1080,
  margin: 72,
  /** Espace entre deux tuiles, deux cases ou deux lignes de liste. */
  gap: 16,
  /** Espace entre deux blocs. */
  blockGap: 32,
  headerHeight: 176,
  statHeight: 96,
  librariesHeight: 56,
  sectionTitleHeight: 40,
  sectionTitleGap: 16,
  rowHeight: 64,
  rowGap: 8,
  footerHeight: 64,
  bottomMargin: 48,
  maxTilesPerRow: 6,
  /** Une tuile n'excède pas cette largeur : quelques œuvres ne deviennent pas d'immenses affiches. */
  maxTileWidth: 173,
  tileRatio: 1.5,
  minHeight: 1080,
  maxHeight: 1700,
} as const

export type Rect = { x: number; y: number; w: number; h: number }

export type StatKey = 'total' | 'done' | 'favorites' | 'average'
export type TileSection = 'favorites' | 'recent'

export type LayoutBlock =
  | { kind: 'header'; rect: Rect }
  | { kind: 'stats'; rect: Rect; cells: Array<{ key: StatKey; rect: Rect }>; libraries: Rect | null }
  | { kind: 'tiles'; section: TileSection; rect: Rect; titleRect: Rect; tiles: Array<{ rect: Rect; item: ShareItem }> }
  | { kind: 'list'; section: 'topRated'; rect: Rect; titleRect: Rect; rows: Array<{ rect: Rect; item: ShareItem; rank: number }> }
  | { kind: 'footer'; rect: Rect }

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

  blocks.push({ kind: 'header', rect: { x: margin, y, w: contentWidth, h: SHARE_CARD.headerHeight } })
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
    const titleRect = { x: margin, y, w: contentWidth, h: SHARE_CARD.sectionTitleHeight }
    const tilesY = y + SHARE_CARD.sectionTitleHeight + SHARE_CARD.sectionTitleGap
    const tiles = items.slice(0, count).map((item, index) => ({ item, rect: { x: margin + index * (tileWidth + gap), y: tilesY, w: tileWidth, h: tileHeight } }))
    for (const { item } of tiles) if (item.imageUrl && !imageUrls.includes(item.imageUrl)) imageUrls.push(item.imageUrl)
    const height = SHARE_CARD.sectionTitleHeight + SHARE_CARD.sectionTitleGap + tileHeight
    blocks.push({ kind: 'tiles', section, rect: { x: margin, y, w: contentWidth, h: height }, titleRect, tiles })
    y += height + blockGap
  }

  addTiles('favorites', model.sections.favorites)

  if (model.sections.topRated.length > 0) {
    const titleRect = { x: margin, y, w: contentWidth, h: SHARE_CARD.sectionTitleHeight }
    const rowsY = y + SHARE_CARD.sectionTitleHeight + SHARE_CARD.sectionTitleGap
    const rows = model.sections.topRated.map((item, index) => ({
      item,
      rank: index + 1,
      rect: { x: margin, y: rowsY + index * (SHARE_CARD.rowHeight + SHARE_CARD.rowGap), w: contentWidth, h: SHARE_CARD.rowHeight },
    }))
    const height = SHARE_CARD.sectionTitleHeight + SHARE_CARD.sectionTitleGap + rows.length * SHARE_CARD.rowHeight + (rows.length - 1) * SHARE_CARD.rowGap
    blocks.push({ kind: 'list', section: 'topRated', rect: { x: margin, y, w: contentWidth, h: height }, titleRect, rows })
    y += height + blockGap
  }

  addTiles('recent', model.sections.recent)

  blocks.push({ kind: 'footer', rect: { x: margin, y, w: contentWidth, h: SHARE_CARD.footerHeight } })
  y += SHARE_CARD.footerHeight + SHARE_CARD.bottomMargin

  return { width: SHARE_CARD.width, height: Math.max(SHARE_CARD.minHeight, y), blocks, imageUrls }
}
