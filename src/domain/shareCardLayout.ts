// Cartes à partager : la composition, en calcul pur.
//
// La toile a la taille exacte du format choisi (standard 1 080 × 1 350, story 1 080 × 1 920, voir
// shareFormats.ts). Ce module place des rectangles ; il ne mesure aucun texte et ne dessine rien. Le
// dessin (src/components/shareCardImage.ts) lit ces rectangles et y ajuste ses textes.
//
// La composition, de haut en bas :
//   - l'en-tête : logo et nom de l'app sur le même axe, nom du profil à droite ;
//   - le titre (bibliothèque ou profil), avec pour un profil la ligne « terminés par bibliothèque » ;
//   - les coups de cœur : l'œuvre mise en avant en grande affiche (le héros), et à sa droite les autres,
//     en grille sur toute la hauteur du héros ;
//   - les personnes mises en avant (réalisateur, acteurs, auteur, studio, personnages), en une rangée de
//     portraits ronds, quand il y en a ;
//   - les chiffres, sur une seule rangée sous les affiches.
// Le héros est aussi grand que la hauteur disponible le permet ; tout le reste s'y accorde.

import { favoritesLimit, type ShareCardModel, type ShareItem, type ShareLimits, type ShareScope } from './shareCard.ts'
import type { ShareCardPerson } from './sharePeople.ts'
import type { ShareFormat } from './shareFormats.ts'

export const SHARE_CARD = {
  /** Marges latérales ; la marge verticale est plus serrée pour laisser la place aux affiches. */
  margin: 72,
  marginY: 64,
  /** Espace entre deux affiches. */
  gap: 16,
  headerHeight: 64,
  /** Le logo est la tuile carrée de l'icône de l'application. */
  logoSize: 60,
  logoGap: 16,
  nameWidth: 360,
  titleHeight: 104,
  subtitleHeight: 30,
  subtitleGap: 6,
  /** Les chiffres : un nombre et sa légende par case, toutes les cases sur une seule rangée. */
  statsHeight: 104,
  /** Les personnes : un portrait rond, le nom dessous, puis la légende. Une case ne dépasse pas `personMaxWidth`. */
  peopleHeight: 170,
  portraitSize: 80,
  personMaxWidth: 240,
  /** Intitulé de la section : la ligne de texte, puis l'air avant les affiches. */
  labelHeight: 28,
  labelGap: 16,
  /** Air entre le héros et la grille de droite. */
  panelGap: 24,
  /** Écarts de base entre blocs : en-tête → titre, titre → coups de cœur, coups de cœur → chiffres. */
  gapHeader: 28,
  gapTitle: 32,
  gapSection: 36,
  maxExtraGap: 24,
  /**
   * Le héros ne dépasse pas cette hauteur. La grille de droite épouse la hauteur et la largeur de son
   * panneau : avec six voisins (2 × 3) comme avec les neuf de la carte du profil (3 × 3, décision du
   * 25 octobre 2026), tout s'aligne et les affiches restent au-dessus de 130 px.
   */
  heroMaxHeight: { standard: 820, story: 820 },
  /** Un coup de cœur seul à côté du héros ne le concurrence pas. */
  runnerUpMaxRatio: 0.8,
  tileRatio: 1.5,
  maxRunnerUpCols: 3,
  maxRunnerUpRows: 3,
  /** Plafond absolu de la carte : dix coups de cœur ; une bibliothèque s'arrête à sept (voir `favoritesLimit`). */
  maxFavorites: 10,
  /** Écart maximal entre deux colonnes d'affiches justifiées sur le panneau. */
  maxColumnGap: 60,
  /** Largeur minimale d'un voisin : en dessous, mieux vaut que le héros cède de la place (profil à dix). */
  minRunnerUpWidth: 130,
  /** Le héros ne descend jamais sous cette largeur, même pour loger neuf voisins. */
  minHeroWidth: 360,
  /** Sous cette largeur, une affiche ne porte pas d'étoiles : à 130 px, elles ne se lisent plus. */
  minStarWidth: 150,
  heroRadius: 20,
  tileRadius: 14,
} as const

export type Rect = { x: number; y: number; w: number; h: number }

export type LayoutTile = {
  rect: Rect
  item: ShareItem
  radius: number
  /** Rangée d'étoiles posée en bas de l'affiche, pour un coup de cœur noté. */
  starsRect: Rect | null
}

export type LayoutBlock =
  | { kind: 'header'; rect: Rect; logo: Rect; wordmark: { x: number; centerY: number }; name: Rect | null }
  | { kind: 'title'; rect: Rect; subtitle: Rect | null }
  | { kind: 'spread'; rect: Rect; labelRect: Rect; hero: LayoutTile; tiles: LayoutTile[] }
  /** Les personnes : une case par personne, côte à côte et centrées, avec son portrait rond. */
  | { kind: 'people'; rect: Rect; cells: LayoutPerson[] }
  /** Les chiffres : le dessin ajuste les textes dans ces cases, côte à côte. */
  | { kind: 'stats'; rect: Rect; cells: Rect[] }

export type LayoutPerson = {
  /** Toute la case : portrait, nom et légende se centrent sur son axe vertical. */
  rect: Rect
  person: ShareCardPerson
  /** Le carré du portrait, dessiné en rond. */
  portrait: Rect
}

export type ShareCardLayout = {
  width: number
  height: number
  blocks: LayoutBlock[]
  /** Adresses d'affiche à charger, une fois chacune, dans l'ordre d'apparition. */
  imageUrls: string[]
  /** Adresses de portrait à charger : à part, car un portrait manquant se remplace par des initiales sans rien dire. */
  portraitUrls: string[]
}

const contentWidth = (format: ShareFormat) => format.width - 2 * SHARE_CARD.margin
const tileHeight = (width: number) => Math.round(width * SHARE_CARD.tileRatio)

/** Ce que la carte demande à la sélection : exactement ce que la composition peut montrer. */
export function shareLimitsFor(_format: ShareFormat, scope: ShareScope): ShareLimits {
  return { favorites: favoritesLimit(scope) }
}

export type RunnerUpGrid = { cols: number; rows: number; tileW: number }

/** Répartit les personnes en cases égales (au plus `personMaxWidth`), la rangée entière centrée sur la largeur. */
export function layoutPeopleCells(rect: Rect, count: number): Rect[] {
  if (count <= 0) return []
  const cellW = Math.floor(Math.min(rect.w / count, SHARE_CARD.personMaxWidth))
  const startX = rect.x + Math.round((rect.w - cellW * count) / 2)
  return Array.from({ length: count }, (_, index) => ({ x: startX + index * cellW, y: rect.y, w: cellW, h: rect.h }))
}

/** Répartit les chiffres en cases égales sur une seule rangée. */
export function layoutStatCells(rect: Rect, count: number): Rect[] {
  if (count <= 0) return []
  const cellW = rect.w / count
  return Array.from({ length: count }, (_, index) => ({ x: rect.x + index * cellW, y: rect.y, w: cellW, h: rect.h }))
}

/**
 * Les autres coups de cœur à droite du héros : la plus grande affiche possible dans l'espace (largeur du
 * panneau, hauteur du héros), sur au plus trois colonnes et trois rangées. À taille égale, la grille la
 * plus petite l'emporte (moins de trous).
 */
export function arrangeRunnerUps(count: number, panelWidth: number, gridHeight: number, maxWidth = Number.POSITIVE_INFINITY): RunnerUpGrid {
  if (count <= 0) return { cols: 0, rows: 0, tileW: 0 }
  const { gap } = SHARE_CARD
  let best: RunnerUpGrid | null = null
  for (let rows = 1; rows <= SHARE_CARD.maxRunnerUpRows; rows += 1) {
    for (let cols = 1; cols <= SHARE_CARD.maxRunnerUpCols; cols += 1) {
      if (cols * rows < count) continue
      const tileW = Math.min(
        Math.floor((panelWidth - (cols - 1) * gap) / cols),
        Math.floor((gridHeight - (rows - 1) * gap) / rows / SHARE_CARD.tileRatio),
        Math.floor(maxWidth),
      )
      const better = !best
        || tileW > best.tileW
        || (tileW === best.tileW && (cols * rows < best.cols * best.rows || (cols * rows === best.cols * best.rows && cols < best.cols)))
      if (better) best = { cols, rows, tileW }
    }
  }
  return best as RunnerUpGrid
}

function starsFor(rect: Rect, item: ShareItem): Rect | null {
  // Une affiche trop étroite ne porte pas d'étoiles : cinq notes illisibles valent moins que rien.
  if (item.rating === null || rect.w < SHARE_CARD.minStarWidth) return null
  const size = Math.min(30, Math.max(12, Math.floor((rect.w - 24) / 5.8)))
  return { x: rect.x, y: rect.y + rect.h - size - 16, w: rect.w, h: size }
}

export function layoutShareCard(model: ShareCardModel, format: ShareFormat): ShareCardLayout {
  const { margin, gap } = SHARE_CARD
  const width = contentWidth(format)
  const top = Math.max(SHARE_CARD.marginY, format.safeTop)
  const bottom = format.height - Math.max(SHARE_CARD.marginY, format.safeBottom)

  const [heroItem, ...runnerUps] = model.sections.favorites.slice(0, SHARE_CARD.maxFavorites)
  const statCount = model.stats.cells.length
  const peopleCount = model.people.length

  const sectionLabel = SHARE_CARD.labelHeight + SHARE_CARD.labelGap
  const subtitle = model.scope.kind === 'profile' && (model.stats.perLibrary?.length ?? 0) >= 2
  const titleHeight = SHARE_CARD.titleHeight + (subtitle ? SHARE_CARD.subtitleGap + SHARE_CARD.subtitleHeight : 0)

  // La hauteur du héros : tout ce qui n'est pas lui est compté d'abord.
  const statsBlock = statCount > 0 ? SHARE_CARD.gapSection + SHARE_CARD.statsHeight : 0
  const peopleBlock = peopleCount > 0 ? SHARE_CARD.gapSection + SHARE_CARD.peopleHeight : 0
  const aboveSpread = SHARE_CARD.headerHeight + SHARE_CARD.gapHeader + titleHeight + SHARE_CARD.gapTitle
  const available = bottom - top - aboveSpread - statsBlock - peopleBlock
  const heroBound = heroItem ? Math.min(SHARE_CARD.heroMaxHeight[format.id], available - sectionLabel) : 0
  let heroW = heroItem ? Math.floor(heroBound / SHARE_CARD.tileRatio) : 0
  let heroH = heroItem ? tileHeight(heroW) : 0

  // Neuf voisins (la carte du profil à dix coups de cœur) : trois colonnes ne tiennent à taille lisible que
  // si le héros cède un peu de largeur. Il reste toujours au moins `minHeroWidth`.
  if (heroItem && runnerUps.length > 6) {
    while (heroW > SHARE_CARD.minHeroWidth) {
      const panel = width - heroW - SHARE_CARD.panelGap
      const grid = arrangeRunnerUps(runnerUps.length, panel, heroH, Math.floor(heroW * SHARE_CARD.runnerUpMaxRatio))
      if (grid.tileW >= SHARE_CARD.minRunnerUpWidth) break
      if (heroW <= SHARE_CARD.minHeroWidth) break
      heroW = Math.max(SHARE_CARD.minHeroWidth, heroW - 4)
      heroH = tileHeight(heroW)
    }
  }
  const spreadHeight = heroItem ? sectionLabel + heroH : 0

  // L'espace qui reste s'ajoute aux écarts (au plus 24 px chacun), le surplus centre le tout sous l'en-tête.
  const used = aboveSpread + spreadHeight + peopleBlock + statsBlock
  const slack = Math.max(0, bottom - top - used)
  const gapCount = 2 + (peopleCount > 0 ? 1 : 0) + (statCount > 0 ? 1 : 0)
  const extra = Math.min(SHARE_CARD.maxExtraGap, Math.floor(slack / gapCount))
  const lift = Math.floor((slack - extra * gapCount) / 2)

  const blocks: LayoutBlock[] = []
  const imageUrls: string[] = []
  const portraitUrls: string[] = []
  const remember = (item: ShareItem) => { if (item.imageUrl && !imageUrls.includes(item.imageUrl)) imageUrls.push(item.imageUrl) }
  let y = top

  // En-tête : logo et nom de l'app sur le même axe, nom du profil à droite (cartes de bibliothèque).
  const logo = { x: margin, y: y + Math.round((SHARE_CARD.headerHeight - SHARE_CARD.logoSize) / 2), w: SHARE_CARD.logoSize, h: SHARE_CARD.logoSize }
  blocks.push({
    kind: 'header',
    rect: { x: margin, y, w: width, h: SHARE_CARD.headerHeight },
    logo,
    wordmark: { x: logo.x + logo.w + SHARE_CARD.logoGap, centerY: logo.y + logo.h / 2 },
    name: model.scope.kind === 'library'
      ? { x: format.width - margin - SHARE_CARD.nameWidth, y: logo.y, w: SHARE_CARD.nameWidth, h: logo.h }
      : null,
  })
  y += SHARE_CARD.headerHeight + SHARE_CARD.gapHeader + extra + lift

  blocks.push({
    kind: 'title',
    rect: { x: margin, y, w: width, h: SHARE_CARD.titleHeight },
    subtitle: subtitle ? { x: margin, y: y + SHARE_CARD.titleHeight + SHARE_CARD.subtitleGap, w: width, h: SHARE_CARD.subtitleHeight } : null,
  })
  y += titleHeight + SHARE_CARD.gapTitle + extra

  // Les coups de cœur : le héros, puis les autres sur toute sa hauteur.
  if (heroItem) {
    const labelRect = { x: margin, y, w: width, h: SHARE_CARD.labelHeight }
    const heroY = y + sectionLabel
    const heroRect = { x: margin, y: heroY, w: heroW, h: heroH }
    const hero: LayoutTile = { rect: heroRect, item: heroItem, radius: SHARE_CARD.heroRadius, starsRect: starsFor(heroRect, heroItem) }
    remember(heroItem)

    const panelX = margin + heroW + SHARE_CARD.panelGap
    const panelW = width - heroW - SHARE_CARD.panelGap
    const grid = arrangeRunnerUps(runnerUps.length, panelW, heroH, Math.floor(heroW * SHARE_CARD.runnerUpMaxRatio))
    const tiles: LayoutTile[] = []
    if (runnerUps.length > 0) {
      const tileH = tileHeight(grid.tileW)
      const usedRows = Math.ceil(runnerUps.length / grid.cols)
      // La grille se centre sur la hauteur du héros quand elle ne la remplit pas.
      const gridTop = heroY + Math.round((heroH - (usedRows * tileH + (usedRows - 1) * gap)) / 2)
      for (let row = 0; row < usedRows; row += 1) {
        const items = runnerUps.slice(row * grid.cols, (row + 1) * grid.cols)
        // Les colonnes se justifient sur la largeur du panneau (écart plafonné) : le bord droit rejoint celui
        // des chiffres. Une rangée qui n'est pas pleine se centre, sur le même pas de colonnes.
        const rawGap = grid.cols > 1 ? (panelW - grid.cols * grid.tileW) / (grid.cols - 1) : 0
        const step = grid.cols > 1 ? grid.tileW + Math.min(SHARE_CARD.maxColumnGap, Math.max(gap, rawGap)) : 0
        const rowWidth = grid.tileW + (items.length - 1) * step
        const justified = grid.cols > 1 && items.length === grid.cols && rawGap <= SHARE_CARD.maxColumnGap
        const startX = justified ? panelX : panelX + Math.round((panelW - rowWidth) / 2)
        items.forEach((item, index) => {
          const rect = { x: startX + Math.round(index * step), y: gridTop + row * (tileH + gap), w: grid.tileW, h: tileH }
          tiles.push({ rect, item, radius: SHARE_CARD.tileRadius, starsRect: starsFor(rect, item) })
          remember(item)
        })
      }
    }
    blocks.push({ kind: 'spread', rect: { x: margin, y, w: width, h: spreadHeight }, labelRect, hero, tiles })
    y += spreadHeight
  }

  if (peopleCount > 0) {
    y += SHARE_CARD.gapSection + extra
    const rect = { x: margin, y, w: width, h: SHARE_CARD.peopleHeight }
    const cells: LayoutPerson[] = layoutPeopleCells(rect, peopleCount).map((cell, index) => {
      const person = model.people[index]
      if (person.portraitUrl && !portraitUrls.includes(person.portraitUrl)) portraitUrls.push(person.portraitUrl)
      const size = SHARE_CARD.portraitSize
      return { rect: cell, person, portrait: { x: cell.x + Math.round((cell.w - size) / 2), y: cell.y, w: size, h: size } }
    })
    blocks.push({ kind: 'people', rect, cells })
    y += SHARE_CARD.peopleHeight
  }

  if (statCount > 0) {
    y += SHARE_CARD.gapSection + extra
    const rect = { x: margin, y, w: width, h: SHARE_CARD.statsHeight }
    blocks.push({ kind: 'stats', rect, cells: layoutStatCells(rect, statCount) })
  }

  return { width: format.width, height: format.height, blocks, imageUrls, portraitUrls }
}
