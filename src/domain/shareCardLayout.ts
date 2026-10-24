// Cartes à partager : la mise en page, en calcul pur.
//
// La toile a la taille exacte du format choisi (standard 1 080 × 1 350, story 1 080 × 1 920, voir
// shareFormats.ts). Ce module place des rectangles ; il ne mesure aucun texte et ne dessine rien. Le
// dessin (src/components/shareCardImage.ts) lit ces rectangles et y ajuste ses textes.
//
// La carte : en-tête (logo et titre), trois chiffres, les coups de cœur, puis les derniers terminés.
// Les affiches sont aussi grandes que la place le permet (260 px au plus, 150 px au moins) : on cherche
// la plus grande largeur pour laquelle tout tient dans la zone sûre du format.

import type { ShareCardModel, ShareItem, ShareLimits, ShareScope } from './shareCard.ts'
import type { ShareFormat } from './shareFormats.ts'

export const SHARE_CARD = {
  margin: 72,
  /** Espace entre deux affiches ou deux cases. */
  gap: 16,
  /** Espace de base entre deux blocs ; l'espace qui reste dans le format s'y ajoute, jusqu'à `maxExtraGap`. */
  blockGap: 32,
  maxExtraGap: 40,
  headerHeight: 112,
  /** Le logo est la tuile carrée de l'icône de l'application. */
  logoSize: 96,
  logoGap: 28,
  statHeight: 96,
  librariesHeight: 36,
  sectionTitleHeight: 40,
  sectionTitleGap: 16,
  /** Étoiles sous un coup de cœur noté. */
  starsGap: 12,
  starsHeight: 28,
  minTileWidth: 150,
  maxTileWidth: 260,
  tileRatio: 1.5,
} as const

export type Rect = { x: number; y: number; w: number; h: number }
export type TileSection = 'favorites' | 'recent'

export type LayoutTile = { rect: Rect; item: ShareItem; /** Rangée d'étoiles sous l'affiche, pour un coup de cœur noté. */ starsRect: Rect | null }

export type LayoutBlock =
  | { kind: 'header'; rect: Rect; logo: Rect; /** Abscisse du texte, à droite du logo. */ textX: number }
  | { kind: 'stats'; rect: Rect; cells: Array<{ rect: Rect }>; libraries: Rect | null }
  | { kind: 'tiles'; section: TileSection; rect: Rect; titleRect: Rect; tiles: LayoutTile[] }

export type ShareCardLayout = {
  width: number
  height: number
  blocks: LayoutBlock[]
  /** Adresses d'image à charger, une fois chacune, dans l'ordre d'apparition. */
  imageUrls: string[]
}

const contentWidth = (format: ShareFormat) => format.width - 2 * SHARE_CARD.margin

/** Affiches par rangée et rangées permises, selon le format et la portée. */
function grid(format: ShareFormat, scope: ShareScope) {
  const profile = scope.kind === 'profile'
  if (format.id === 'story') return { perRow: profile ? 4 : 3, favoriteRows: 2, recentRows: 1 }
  return { perRow: profile ? 5 : 4, favoriteRows: 1, recentRows: 1 }
}

/** Ce que la carte demande à la sélection : exactement ce que la mise en page peut montrer. */
export function shareLimitsFor(format: ShareFormat, scope: ShareScope): ShareLimits {
  const { perRow, favoriteRows, recentRows } = grid(format, scope)
  return { favorites: perRow * favoriteRows, recent: perRow * recentRows }
}

type SectionPlan = {
  section: TileSection
  rows: ShareItem[][]
  fitWidth: number
  /** Une rangée a des étoiles dès qu'un de ses éléments est noté. */
  stars: boolean[]
}

function planSection(section: TileSection, all: ShareItem[], perRow: number, maxRows: number, width: number): SectionPlan | null {
  const items = all.slice(0, perRow * maxRows)
  if (items.length === 0) return null
  const rows: ShareItem[][] = []
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow))
  const across = Math.min(items.length, perRow)
  const fitWidth = Math.floor((width - (across - 1) * SHARE_CARD.gap) / across)
  return { section, rows, fitWidth, stars: rows.map(row => section === 'favorites' && row.some(item => item.rating !== null)) }
}

const sectionHeight = (plan: SectionPlan, tileWidth: number) => {
  const tileHeight = Math.round(tileWidth * SHARE_CARD.tileRatio)
  const starsHeight = SHARE_CARD.starsGap + SHARE_CARD.starsHeight
  return SHARE_CARD.sectionTitleHeight + SHARE_CARD.sectionTitleGap
    + plan.rows.reduce((sum, _, index) => sum + tileHeight + (plan.stars[index] ? starsHeight : 0), 0)
    + (plan.rows.length - 1) * SHARE_CARD.gap
}

export function layoutShareCard(model: ShareCardModel, format: ShareFormat): ShareCardLayout {
  const { margin, gap } = SHARE_CARD
  const width = contentWidth(format)
  const { perRow, favoriteRows, recentRows } = grid(format, model.scope)
  const top = Math.max(margin, format.safeTop)
  const bottom = format.height - Math.max(margin, format.safeBottom)

  const plans = [
    planSection('favorites', model.sections.favorites, perRow, favoriteRows, width),
    planSection('recent', model.sections.recent, perRow, recentRows, width),
  ].filter((plan): plan is SectionPlan => plan !== null)

  const showLibraries = model.scope.kind === 'profile' && (model.stats.perLibrary?.length ?? 0) >= 2
  const statsHeight = SHARE_CARD.statHeight + (showLibraries ? gap + SHARE_CARD.librariesHeight : 0)
  const blockCount = 2 + plans.length
  const fixed = SHARE_CARD.headerHeight + statsHeight + (blockCount - 1) * SHARE_CARD.blockGap

  // La plus grande largeur d'affiche pour laquelle tout tient. Sous le minimum on s'y tient quand même
  // (le test des plafonds échoue alors : la sélection en demande trop pour ce format).
  let cap: number = SHARE_CARD.maxTileWidth
  const widthOf = (plan: SectionPlan, limit: number) => Math.min(plan.fitWidth, limit)
  const heightAt = (limit: number) => fixed + plans.reduce((sum, plan) => sum + sectionHeight(plan, widthOf(plan, limit)), 0)
  while (cap > 100 && heightAt(cap) > bottom - top) cap -= 1

  // Ce qui reste dans le format est réparti entre les blocs, sans excès.
  const extraGap = Math.min(SHARE_CARD.maxExtraGap, Math.max(0, Math.floor((bottom - top - heightAt(cap)) / (blockCount - 1))))
  const blockGap = SHARE_CARD.blockGap + extraGap

  const blocks: LayoutBlock[] = []
  const imageUrls: string[] = []
  let y = top

  const logo = { x: margin, y: y + Math.round((SHARE_CARD.headerHeight - SHARE_CARD.logoSize) / 2), w: SHARE_CARD.logoSize, h: SHARE_CARD.logoSize }
  blocks.push({ kind: 'header', rect: { x: margin, y, w: width, h: SHARE_CARD.headerHeight }, logo, textX: margin + SHARE_CARD.logoSize + SHARE_CARD.logoGap })
  y += SHARE_CARD.headerHeight + blockGap

  const cellWidth = Math.floor((width - 2 * gap) / 3)
  const cells = [0, 1, 2].map(index => ({ rect: { x: margin + index * (cellWidth + gap), y, w: cellWidth, h: SHARE_CARD.statHeight } }))
  blocks.push({
    kind: 'stats',
    rect: { x: margin, y, w: width, h: statsHeight },
    cells,
    libraries: showLibraries ? { x: margin, y: y + SHARE_CARD.statHeight + gap, w: width, h: SHARE_CARD.librariesHeight } : null,
  })
  y += statsHeight + blockGap

  for (const plan of plans) {
    const tileWidth = widthOf(plan, cap)
    const tileHeight = Math.round(tileWidth * SHARE_CARD.tileRatio)
    const height = sectionHeight(plan, tileWidth)
    const titleRect = { x: margin, y, w: width, h: SHARE_CARD.sectionTitleHeight }
    let rowY = y + SHARE_CARD.sectionTitleHeight + SHARE_CARD.sectionTitleGap
    const tiles: LayoutTile[] = []
    plan.rows.forEach((row, rowIndex) => {
      // Une rangée qui n'est pas pleine reste centrée dans la largeur.
      const rowWidth = row.length * tileWidth + (row.length - 1) * gap
      const startX = margin + Math.round((width - rowWidth) / 2)
      row.forEach((item, index) => {
        const rect = { x: startX + index * (tileWidth + gap), y: rowY, w: tileWidth, h: tileHeight }
        const starsRect = plan.stars[rowIndex] && item.rating !== null
          ? { x: rect.x, y: rowY + tileHeight + SHARE_CARD.starsGap, w: tileWidth, h: SHARE_CARD.starsHeight }
          : null
        tiles.push({ rect, item, starsRect })
        if (item.imageUrl && !imageUrls.includes(item.imageUrl)) imageUrls.push(item.imageUrl)
      })
      rowY += tileHeight + (plan.stars[rowIndex] ? SHARE_CARD.starsGap + SHARE_CARD.starsHeight : 0) + gap
    })
    blocks.push({ kind: 'tiles', section: plan.section, rect: { x: margin, y, w: width, h: height }, titleRect, tiles })
    y += height + blockGap
  }

  return { width: format.width, height: format.height, blocks, imageUrls }
}
