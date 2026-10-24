// Cartes à partager : le dessin sur canevas.
//
// Ce module ne choisit rien : il lit la mise en page (src/domain/shareCardLayout.ts) et y dessine.
// Aucune dépendance : le canevas du navigateur suffit. Le thème est toujours l'anthracite sombre de
// l'application, quel que soit le thème choisi : la carte voyage hors de l'application et doit rester
// identique sur le fond clair ou sombre d'un réseau social.

import { formatDate, formatNumber, t } from '../i18n/core.ts'
import type { ShareCardModel, ShareItem } from '../domain/shareCard.ts'
import { layoutShareCard, type LayoutBlock, type Rect, type ShareCardLayout } from '../domain/shareCardLayout.ts'
import logoUrl from '../assets/logo-sylloge.png'

const COLOR = {
  canvas: '#161618',
  surface: '#232326',
  text: '#EDEDEF',
  secondary: '#B5B5BC',
  muted: '#A3A3AB',
  border: '#3A3A3F',
  hairline: '#303035',
} as const

const UI_FONT = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
const DISPLAY_FONT = `"Syne", ${UI_FONT}`

/** Rend l'image chargée, ou `null` si elle est introuvable, trop lente ou sans autorisation inter-sites. */
export type ImageLoader = (url: string) => Promise<CanvasImageSource | null>

const IMAGE_TIMEOUT_MS = 8000

/**
 * Charge une image pour le canevas. `crossOrigin` est indispensable : sans l'autorisation du serveur,
 * le canevas serait « contaminé » et l'export en PNG impossible. Une image refusée est écartée ici,
 * et sa tuile se rabat sur le titre.
 */
export const loadCardImage: ImageLoader = url => new Promise(resolve => {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.referrerPolicy = 'no-referrer'
  const timer = window.setTimeout(() => { image.src = ''; resolve(null) }, IMAGE_TIMEOUT_MS)
  image.onload = () => { window.clearTimeout(timer); resolve(image) }
  image.onerror = () => { window.clearTimeout(timer); resolve(null) }
  image.src = url
})

export type RenderedShareCard = {
  canvas: HTMLCanvasElement
  layout: ShareCardLayout
  /** Adresses dont l'image n'a pas pu servir (la tuile affiche alors le titre). */
  missingImages: string[]
}

export async function renderShareCard(
  model: ShareCardModel,
  options: { loadImage?: ImageLoader; now?: Date } = {},
): Promise<RenderedShareCard> {
  const load = options.loadImage ?? loadCardImage
  const now = options.now ?? new Date()
  const layout = layoutShareCard(model)

  await loadDisplayFont()
  const images = new Map<string, CanvasImageSource | null>()
  const [logo] = await Promise.all([
    load(logoUrl),
    ...layout.imageUrls.map(async url => { images.set(url, await load(url)) }),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Le canevas 2D n’est pas disponible.')
  context.textBaseline = 'alphabetic'
  context.fillStyle = COLOR.canvas
  context.fillRect(0, 0, layout.width, layout.height)

  for (const block of layout.blocks) drawBlock(context, block, model, images, logo, now)

  const missingImages = layout.imageUrls.filter(url => images.get(url) === null)
  return { canvas, layout, missingImages }
}

/** PNG de la carte, en octets. */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('L’image n’a pas pu être produite.')); return }
      blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)), reject)
    }, 'image/png')
  })
}

/** Nom de fichier proposé : ASCII seul, daté, sans accent ni espace. */
export function shareCardFileName(model: ShareCardModel, now: Date = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const scope = model.scope.kind === 'profile' ? 'profil' : model.scope.library
  return `sylloge-carte-${scope}-${day}.png`
}

async function loadDisplayFont(): Promise<void> {
  try {
    await document.fonts.load(`700 40px "Syne"`)
    await document.fonts.ready
  } catch {
    // La police de repli de l'application suffit : la carte reste lisible.
  }
}

// ── Dessin ──────────────────────────────────────────────────────────────────────────────────────

type Context = CanvasRenderingContext2D

function drawBlock(context: Context, block: LayoutBlock, model: ShareCardModel, images: Map<string, CanvasImageSource | null>, logo: CanvasImageSource | null, now: Date) {
  switch (block.kind) {
    case 'header': drawHeader(context, block, model, logo, now); break
    case 'stats': drawStats(context, block, model); break
    case 'tiles':
      drawSectionTitle(context, block.titleRect, SECTION_TITLES[block.section]())
      for (const tile of block.tiles) {
        drawTile(context, tile.rect, tile.item, tile.item.imageUrl ? images.get(tile.item.imageUrl) ?? null : null)
        if (tile.starsRect && tile.item.rating !== null) drawStars(context, tile.starsRect, tile.item.rating)
      }
      break
  }
}

const SECTION_TITLES = {
  favorites: () => t('Coups de cœur'),
  topRated: () => t('Mieux notés'),
  recent: () => t('Terminés récemment'),
} as const

/** Le logo a une grande marge transparente : on n'en dessine que le badge. */
const LOGO_CROP = { x: 330, y: 215, w: 600, h: 780 } as const

function drawHeader(context: Context, block: Extract<LayoutBlock, { kind: 'header' }>, model: ShareCardModel, logo: CanvasImageSource | null, now: Date) {
  const { rect, textX } = block
  const isProfile = model.heading.kind === 'profile'
  const label = isProfile ? 'SYLLOGE' : model.profileName.toUpperCase()
  const title = model.heading.kind === 'profile' ? model.heading.name : t(model.heading.label)
  const kicker = `${label}  ·  ${formatDate(now, { month: 'long', year: 'numeric' }).toUpperCase()}`
  const textWidth = rect.x + rect.w - textX

  if (logo) context.drawImage(logo, LOGO_CROP.x, LOGO_CROP.y, LOGO_CROP.w, LOGO_CROP.h, block.logo.x, block.logo.y, block.logo.w, block.logo.h)

  context.fillStyle = COLOR.muted
  setFont(context, 600, 22, UI_FONT)
  context.fillText(fitted(context, kicker, textWidth, 600, 22, 14, UI_FONT), textX, rect.y + 34)

  context.fillStyle = COLOR.text
  const titleFit = fitSize(context, title, textWidth, 700, 64, 32, DISPLAY_FONT)
  setFont(context, 700, titleFit.size, DISPLAY_FONT)
  context.fillText(titleFit.text, textX, rect.y + 34 + 18 + titleFit.size)
}

function drawStats(context: Context, block: Extract<LayoutBlock, { kind: 'stats' }>, model: ShareCardModel) {
  const values: Record<string, { value: string; label: string }> = {
    total: { value: formatNumber(model.stats.total), label: t('Fiches') },
    done: { value: formatNumber(model.stats.done), label: t('Terminées') },
    favorites: { value: formatNumber(model.stats.favorites), label: t('Favoris') },
    average: { value: model.stats.averageRating === null ? '—' : formatNumber(model.stats.averageRating, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), label: t('Note moyenne') },
  }
  for (const cell of block.cells) {
    roundRect(context, cell.rect, 14)
    context.fillStyle = COLOR.surface
    context.fill()
    context.strokeStyle = COLOR.border
    context.lineWidth = 1
    context.stroke()
    const { value, label } = values[cell.key]
    context.fillStyle = COLOR.text
    setFont(context, 700, 40, DISPLAY_FONT)
    context.fillText(value, cell.rect.x + 20, cell.rect.y + 52)
    context.fillStyle = COLOR.muted
    setFont(context, 400, 20, UI_FONT)
    context.fillText(fitted(context, label, cell.rect.w - 40, 400, 20, 13, UI_FONT), cell.rect.x + 20, cell.rect.y + 80)
  }
  if (block.libraries && model.stats.perLibrary) {
    const line = model.stats.perLibrary.map(entry => `${t(entry.label)} ${formatNumber(entry.count)}`).join('  ·  ')
    context.fillStyle = COLOR.secondary
    setFont(context, 400, 22, UI_FONT)
    const lines = wrapLines(context, line, block.libraries.w, 2)
    lines.forEach((text, index) => context.fillText(text, block.libraries!.x, block.libraries!.y + 24 + index * 30))
  }
}

function drawSectionTitle(context: Context, rect: Rect, label: string) {
  const text = label.toUpperCase()
  context.fillStyle = COLOR.secondary
  setFont(context, 700, 22, UI_FONT)
  context.fillText(text, rect.x, rect.y + 28)
  const width = context.measureText(text).width
  context.strokeStyle = COLOR.hairline
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(rect.x + width + 20, rect.y + 20)
  context.lineTo(rect.x + rect.w, rect.y + 20)
  context.stroke()
}

function drawTile(context: Context, rect: Rect, item: ShareItem, image: CanvasImageSource | null) {
  context.save()
  roundRect(context, rect, 12)
  context.clip()
  context.fillStyle = COLOR.surface
  context.fillRect(rect.x, rect.y, rect.w, rect.h)
  if (image) {
    drawCover(context, image, rect)
  } else {
    // Pas d'image : le titre tient lieu d'affiche, centré et lisible.
    context.fillStyle = COLOR.text
    setFont(context, 700, 20, UI_FONT)
    const lines = wrapLines(context, item.title, rect.w - 28, 6)
    const lineHeight = 26
    const top = rect.y + rect.h / 2 - (lines.length * lineHeight) / 2 + 20
    context.textAlign = 'center'
    lines.forEach((text, index) => context.fillText(text, rect.x + rect.w / 2, top + index * lineHeight))
    context.textAlign = 'left'
  }
  context.restore()
  roundRect(context, rect, 12)
  context.strokeStyle = COLOR.border
  context.lineWidth = 1
  context.stroke()
}

function drawCover(context: Context, image: CanvasImageSource, rect: Rect) {
  const source = image as { naturalWidth?: number; naturalHeight?: number; width: number; height: number }
  const width = source.naturalWidth ?? source.width
  const height = source.naturalHeight ?? source.height
  if (!width || !height) return
  const scale = Math.max(rect.w / width, rect.h / height)
  const drawWidth = width * scale
  const drawHeight = height * scale
  context.drawImage(image, rect.x + (rect.w - drawWidth) / 2, rect.y + (rect.h - drawHeight) / 2, drawWidth, drawHeight)
}

const STAR = { size: 26, gap: 4 } as const

/** Cinq étoiles, remplies à la demi-étoile, centrées sous l'affiche. */
function drawStars(context: Context, area: Rect, rating: number) {
  const width = 5 * STAR.size + 4 * STAR.gap
  const x = area.x + (area.w - width) / 2
  const y = area.y + (area.h - STAR.size) / 2
  for (let index = 0; index < 5; index += 1) {
    const left = x + index * (STAR.size + STAR.gap)
    const fill = Math.max(0, Math.min(1, rating - index))
    starPath(context, left, y, STAR.size)
    context.fillStyle = COLOR.border
    context.fill()
    if (fill > 0) {
      context.save()
      context.beginPath()
      context.rect(left, y, STAR.size * fill, STAR.size)
      context.clip()
      starPath(context, left, y, STAR.size)
      context.fillStyle = COLOR.text
      context.fill()
      context.restore()
    }
  }
}

function starPath(context: Context, left: number, top: number, size: number) {
  const cx = left + size / 2
  const cy = top + size / 2 + 1
  const outer = size / 2
  const inner = outer * 0.42
  context.beginPath()
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + (point * Math.PI) / 5
    const px = cx + radius * Math.cos(angle)
    const py = cy + radius * Math.sin(angle)
    if (point === 0) context.moveTo(px, py)
    else context.lineTo(px, py)
  }
  context.closePath()
}

// ── Utilitaires de texte ────────────────────────────────────────────────────────────────────────

function setFont(context: Context, weight: number, size: number, family: string) {
  context.font = `${weight} ${size}px ${family}`
}

function roundRect(context: Context, rect: Rect, radius: number) {
  context.beginPath()
  context.roundRect(rect.x, rect.y, rect.w, rect.h, radius)
}

/** Plus grande taille qui fait tenir le texte sur une ligne ; au-delà du minimum, il est écourté. */
function fitSize(context: Context, text: string, maxWidth: number, weight: number, start: number, min: number, family: string): { size: number; text: string } {
  for (let size = start; size >= min; size -= 2) {
    setFont(context, weight, size, family)
    if (context.measureText(text).width <= maxWidth) return { size, text }
  }
  setFont(context, weight, min, family)
  return { size: min, text: ellipsize(context, text, maxWidth) }
}

function fitted(context: Context, text: string, maxWidth: number, weight: number, start: number, min: number, family: string): string {
  const result = fitSize(context, text, maxWidth, weight, start, min, family)
  setFont(context, weight, result.size, family)
  return result.text
}

function ellipsize(context: Context, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && context.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

/** Découpe en lignes à la largeur donnée ; un mot plus large que la ligne est coupé par caractères. */
function wrapLines(context: Context, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  const push = (line: string) => { if (line) lines.push(line) }
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (context.measureText(candidate).width <= maxWidth) { current = candidate; continue }
    push(current)
    current = ''
    let rest = word
    while (context.measureText(rest).width > maxWidth && rest.length > 1) {
      let cut = rest.length - 1
      while (cut > 1 && context.measureText(rest.slice(0, cut)).width > maxWidth) cut -= 1
      push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    current = rest
  }
  push(current)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = ellipsize(context, `${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, maxWidth)
  return kept
}
