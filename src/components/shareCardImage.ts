// Cartes à partager : le dessin sur canevas.
//
// Ce module ne choisit rien : il lit la composition (src/domain/shareCardLayout.ts) et y dessine. Aucune
// dépendance : le canevas du navigateur suffit. Le thème est toujours l'anthracite sombre de l'application,
// quel que soit le thème choisi : la carte voyage hors de l'application et doit rester identique sur le
// fond clair ou sombre d'un réseau social. La couleur vient des affiches : une lueur douce, tirée de leurs
// couleurs dominantes, éclaire le fond (voir shareCardColor.ts, qui en garantit le contraste).

import { formatNumber, t } from '../i18n/core.ts'
import { shareLibraryKind, type ShareCardModel, type ShareItem, type ShareScope } from '../domain/shareCard.ts'
import { AMBIENT_ALPHA, AMBIENT_BASE, ambientTint, averageColor, type Rgb } from '../domain/shareCardColor.ts'
import { layoutShareCard, type LayoutBlock, type LayoutPerson, type LayoutTile, type Rect, type ShareCardLayout } from '../domain/shareCardLayout.ts'
import { personInitials } from '../domain/sharePeople.ts'
import type { ShareFormat, ShareFormatId } from '../domain/shareFormats.ts'
// Le vrai logo : la tuile Σ de l'icône de l'application (celle du Dock et du site), recadrée sur la tuile.
import logoUrl from '../assets/sylloge-mark.png'

export const COLOR = {
  base: `rgb(${AMBIENT_BASE.join(',')})`,
  surface: '#232326',
  text: '#EDEDEF',
  secondary: '#B5B5BC',
  hairline: 'rgba(255,255,255,0.14)',
  edge: 'rgba(255,255,255,0.16)',
} as const

export const UI_FONT = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
export const DISPLAY_FONT = `"Syne", ${UI_FONT}`

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
  format: ShareFormat,
  options: { loadImage?: ImageLoader } = {},
): Promise<RenderedShareCard> {
  const load = options.loadImage ?? loadCardImage
  const layout = layoutShareCard(model, format)

  await loadDisplayFont()
  const images = new Map<string, CanvasImageSource | null>()
  const portraits = new Map<string, CanvasImageSource | null>()
  const [logo] = await Promise.all([
    load(logoUrl),
    ...layout.imageUrls.map(async url => { images.set(url, await load(url)) }),
    ...layout.portraitUrls.map(async url => { portraits.set(url, await load(url)) }),
  ])
  const imageOf = (item: ShareItem) => (item.imageUrl ? images.get(item.imageUrl) ?? null : null)
  const portraitOf = (url: string | null) => (url ? portraits.get(url) ?? null : null)

  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Le canevas 2D n’est pas disponible.')
  context.textBaseline = 'alphabetic'

  drawBackground(context, layout, layout.blocks.flatMap(block => blockImages(block, imageOf)))
  for (const block of layout.blocks) drawBlock(context, block, model, imageOf, portraitOf, logo)

  const missingImages = layout.imageUrls.filter(url => images.get(url) === null)
  return { canvas, layout, missingImages }
}

/** Les images qui éclairent le fond : le héros d'abord, puis un autre coup de cœur. */
function blockImages(block: LayoutBlock, imageOf: (item: ShareItem) => CanvasImageSource | null): CanvasImageSource[] {
  const pick = (tile: LayoutTile | undefined | null) => {
    const image = tile ? imageOf(tile.item) : null
    return image ? [image] : []
  }
  if (block.kind === 'spread') return [...pick(block.hero), ...pick(block.tiles[Math.min(1, block.tiles.length - 1)])]
  return []
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
export function shareCardFileName(scope: ShareScope, format: ShareFormatId, now: Date = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const name = scope.kind === 'profile' ? 'profil' : scope.library
  return `sylloge-carte-${name}-${format}-${day}.png`
}

export async function loadDisplayFont(): Promise<void> {
  try {
    await Promise.all([document.fonts.load('700 40px "Syne"'), document.fonts.load('800 40px "Syne"')])
    await document.fonts.ready
  } catch {
    // La police de repli de l'application suffit : la carte reste lisible.
  }
}

// ── Fond ────────────────────────────────────────────────────────────────────────────────────────

type Context = CanvasRenderingContext2D

/** Couleur dominante d'une image, lue sur une copie minuscule ; `null` si le canevas refuse la lecture. */
function dominantColor(image: CanvasImageSource): Rgb | null {
  try {
    const probe = document.createElement('canvas')
    probe.width = 12
    probe.height = 18
    const probeContext = probe.getContext('2d')
    if (!probeContext) return null
    probeContext.drawImage(image, 0, 0, 12, 18)
    return averageColor(probeContext.getImageData(0, 0, 12, 18).data)
  } catch {
    return null
  }
}

function drawBackground(context: Context, layout: ShareCardLayout, images: CanvasImageSource[]) {
  const { width, height } = layout
  context.fillStyle = COLOR.base
  context.fillRect(0, 0, width, height)

  const colors = images.map(dominantColor).filter((color): color is Rgb => color !== null).map(ambientTint)
  // Sans affiche exploitable, une lueur neutre évite un aplat sans vie.
  const palette: Rgb[] = colors.length > 0 ? colors : [[96, 98, 108]]
  const glows = [
    { x: 0.1, y: 0.06, radius: 0.95, color: palette[0] },
    { x: 1.02, y: 0.52, radius: 0.85, color: palette[1] ?? palette[0] },
    { x: 0.15, y: 1.0, radius: 0.95, color: palette[2] ?? palette[1] ?? palette[0] },
  ]
  for (const glow of glows) {
    const cx = glow.x * width
    const cy = glow.y * height
    const radius = glow.radius * width
    const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius)
    const [r, g, b] = glow.color
    gradient.addColorStop(0, `rgba(${r},${g},${b},${AMBIENT_ALPHA})`)
    gradient.addColorStop(0.55, `rgba(${r},${g},${b},${AMBIENT_ALPHA * 0.35})`)
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)
  }
}

// ── Blocs ───────────────────────────────────────────────────────────────────────────────────────

function drawBlock(context: Context, block: LayoutBlock, model: ShareCardModel, imageOf: (item: ShareItem) => CanvasImageSource | null, portraitOf: (url: string | null) => CanvasImageSource | null, logo: CanvasImageSource | null) {
  switch (block.kind) {
    case 'header': drawHeader(context, block, model, logo); break
    case 'title': drawTitle(context, block, model); break
    case 'spread':
      drawSectionLabel(context, block.labelRect, t(model.titles.favorites))
      // Sur le profil, les œuvres viennent de bibliothèques différentes : une pastille dit laquelle.
      for (const tile of [block.hero, ...block.tiles]) drawTile(context, tile, imageOf(tile.item), true, model.scope.kind === 'profile')
      break
    case 'people': drawPeople(context, block, portraitOf); break
    case 'stats': drawStats(context, block, model); break
  }
}

/** Ligne de base qui centre visuellement un texte en capitales sur un axe horizontal. */
export function centeredBaseline(context: Context, text: string, centerY: number): number {
  return centerY + context.measureText(text).actualBoundingBoxAscent / 2
}

function drawHeader(context: Context, block: Extract<LayoutBlock, { kind: 'header' }>, model: ShareCardModel, logo: CanvasImageSource | null) {
  const { logo: logoRect, wordmark } = block

  // Le logo, avec une ombre douce qui le détache du fond.
  context.save()
  context.shadowColor = 'rgba(0,0,0,0.45)'
  context.shadowBlur = 18
  context.shadowOffsetY = 6
  if (logo) context.drawImage(logo, logoRect.x, logoRect.y, logoRect.w, logoRect.h)
  else drawLogoFallback(context, logoRect)
  context.restore()

  // Le nom de l'app : Syne en capitales espacées, comme sur le site.
  context.fillStyle = COLOR.text
  setFont(context, 700, 26, DISPLAY_FONT)
  drawTracked(context, 'SYLLOGE', wordmark.x, centeredBaseline(context, 'SYLLOGE', wordmark.centerY), 26 * 0.18)

  // Le nom du profil, à droite sur le même axe.
  if (block.name && model.profileName.trim() !== '') {
    context.fillStyle = COLOR.secondary
    setFont(context, 600, 24, UI_FONT)
    const name = fitted(context, model.profileName, block.name.w, 600, 24, 16, UI_FONT)
    context.textAlign = 'right'
    context.fillText(name, block.name.x + block.name.w, centeredBaseline(context, name, block.name.y + block.name.h / 2))
    context.textAlign = 'left'
  }
}

/** Si l'image du logo ne se charge pas (elle est dans l'application, c'est improbable) : le Σ, dessiné. */
function drawLogoFallback(context: Context, rect: Rect) {
  roundRect(context, rect, rect.w * 0.24)
  context.fillStyle = '#1F1F22'
  context.fill()
  context.fillStyle = '#F2F2F5'
  setFont(context, 700, rect.h * 0.6, DISPLAY_FONT)
  context.textAlign = 'center'
  context.fillText('Σ', rect.x + rect.w / 2, rect.y + rect.h * 0.7)
  context.textAlign = 'left'
}

function drawTitle(context: Context, block: Extract<LayoutBlock, { kind: 'title' }>, model: ShareCardModel) {
  const title = (model.heading.kind === 'profile' ? model.heading.name : t(model.heading.label)).toLocaleUpperCase()
  context.fillStyle = COLOR.text
  const fit = fitSize(context, title, block.rect.w, 800, 96, 44, DISPLAY_FONT)
  setFont(context, 800, fit.size, DISPLAY_FONT)
  context.fillText(fit.text, block.rect.x, block.rect.y + block.rect.h - 10)

  // Profil : les œuvres terminées par bibliothèque, sur une seule ligne ; les plus petites passent d'abord.
  if (block.subtitle && model.stats.perLibrary) {
    context.fillStyle = COLOR.secondary
    setFont(context, 400, 22, UI_FONT)
    const entries = [...model.stats.perLibrary]
    const text = (list: typeof entries) => list.map(entry => `${t(entry.label)} ${formatNumber(entry.count)}`).join('  ·  ')
    while (entries.length > 2 && context.measureText(text(entries)).width > block.subtitle.w) {
      let smallest = 0
      entries.forEach((entry, index) => { if (entry.count <= entries[smallest].count) smallest = index })
      entries.splice(smallest, 1)
    }
    context.fillText(fitted(context, text(entries), block.subtitle.w, 400, 22, 16, UI_FONT), block.subtitle.x, block.subtitle.y + 22)
  }
}

/**
 * Les personnes d'une rangée : mêmes tailles de nom et de légende pour toutes. Un nom long passe sur deux lignes
 * plutôt que de rétrécir (un nom de 14 px ne se lit pas sur un téléphone) ; la légende, elle, tient sur une ligne.
 */
function drawPeople(context: Context, block: Extract<LayoutBlock, { kind: 'people' }>, portraitOf: (url: string | null) => CanvasImageSource | null) {
  const maxWidth = block.cells[0] ? block.cells[0].rect.w - 20 : 0
  const captions = block.cells.map(cell => t(cell.person.caption.key, cell.person.caption.params))
  const captionSize = Math.min(...captions.map(text => fitSize(context, text, maxWidth, 500, 16, 12, UI_FONT).size))

  let nameSize = 20
  let names = block.cells.map(cell => [cell.person.name])
  for (; nameSize >= 15; nameSize -= 1) {
    setFont(context, 700, nameSize, DISPLAY_FONT)
    names = block.cells.map(cell => wrapLines(context, cell.person.name, maxWidth, 3))
    if (names.every(lines => lines.length <= 2 && lines.every(line => context.measureText(line).width <= maxWidth))) break
  }
  nameSize = Math.max(15, nameSize)
  setFont(context, 700, nameSize, DISPLAY_FONT)
  names = names.map((lines, index) => (lines.length <= 2 ? lines : wrapLines(context, block.cells[index].person.name, maxWidth, 2)))
  const lineCount = Math.max(...names.map(lines => lines.length))

  block.cells.forEach((cell, index) => drawPerson(context, cell, portraitOf(cell.person.portraitUrl), { names: names[index], caption: captions[index] }, { name: nameSize, caption: captionSize, lineCount }))
}

/**
 * Une personne : portrait rond (la photo, ou à défaut les initiales sur un disque), son nom, puis sa légende.
 * Le nom et la légende rétrécissent jusqu'à tenir dans la case ; un portrait manquant ne se signale pas.
 */
function drawPerson(context: Context, cell: LayoutPerson, photo: CanvasImageSource | null, text: { names: string[]; caption: string }, sizes: { name: number; caption: number; lineCount: number }) {
  const { rect, portrait, person } = cell
  const center = { x: portrait.x + portrait.w / 2, y: portrait.y + portrait.h / 2 }
  const radius = portrait.w / 2

  // Une ombre douce détache le portrait du fond, comme les affiches.
  context.save()
  context.shadowColor = 'rgba(0,0,0,0.5)'
  context.shadowBlur = 20
  context.shadowOffsetY = 8
  context.beginPath()
  context.arc(center.x, center.y, radius, 0, Math.PI * 2)
  context.fillStyle = COLOR.surface
  context.fill()
  context.restore()

  context.save()
  context.beginPath()
  context.arc(center.x, center.y, radius, 0, Math.PI * 2)
  context.clip()
  if (photo) {
    // Un portrait est plus haut que large : on cadre sur le haut, là où se trouve le visage.
    const source = photo as { naturalWidth?: number; naturalHeight?: number; width: number; height: number }
    const width = source.naturalWidth ?? source.width
    const height = source.naturalHeight ?? source.height
    if (width && height) {
      const scale = Math.max(portrait.w / width, portrait.h / height)
      const drawWidth = width * scale
      const drawHeight = height * scale
      context.drawImage(photo, portrait.x + (portrait.w - drawWidth) / 2, portrait.y, drawWidth, drawHeight)
    }
  } else {
    const gradient = context.createLinearGradient(portrait.x, portrait.y, portrait.x + portrait.w, portrait.y + portrait.h)
    gradient.addColorStop(0, '#34343A')
    gradient.addColorStop(1, '#1D1D20')
    context.fillStyle = gradient
    context.fillRect(portrait.x, portrait.y, portrait.w, portrait.h)
    context.fillStyle = COLOR.text
    setFont(context, 700, Math.round(portrait.h * 0.36), DISPLAY_FONT)
    context.textAlign = 'center'
    const initials = personInitials(person.name)
    context.fillText(initials, center.x, center.y + context.measureText(initials).actualBoundingBoxAscent / 2)
    context.textAlign = 'left'
  }
  context.restore()
  context.beginPath()
  context.arc(center.x, center.y, radius - 0.5, 0, Math.PI * 2)
  context.strokeStyle = COLOR.edge
  context.lineWidth = 1
  context.stroke()

  // Le nom (une ou deux lignes), puis la légende : centrés sur l'axe de la case. La légende se pose sous la plus
  // longue des lignes de nom de la rangée, pour que toutes les légendes soient alignées.
  const lineHeight = Math.round(sizes.name * 1.2)
  const firstBaseline = portrait.y + portrait.h + 12 + sizes.name
  context.textAlign = 'center'
  context.fillStyle = COLOR.text
  setFont(context, 700, sizes.name, DISPLAY_FONT)
  text.names.forEach((line, row) => context.fillText(line, center.x, firstBaseline + row * lineHeight))
  context.fillStyle = COLOR.secondary
  setFont(context, 500, sizes.caption, UI_FONT)
  const caption = ellipsize(context, text.caption, rect.w - 20)
  context.fillText(caption, center.x, firstBaseline + (sizes.lineCount - 1) * lineHeight + 8 + sizes.caption)
  context.textAlign = 'left'
}

/**
 * Les chiffres sous les affiches : une rangée, sans boîtes. Valeurs en Syne, légendes dessous, une fine
 * cloison entre deux cases. Toutes les cases partagent les mêmes tailles : jamais une légende écrasée
 * à côté d'une autre.
 */
function drawStats(context: Context, stats: { rect: Rect; cells: Rect[] }, model: ShareCardModel) {
  const entries = model.stats.cells
  if (entries.length === 0) return
  const values = entries.map(stat => (stat.format === 'rating'
    ? formatNumber(stat.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : formatNumber(stat.value)))
  const labels = entries.map(stat => t(stat.label, stat.params))
  const hasStar = entries.map(stat => stat.format === 'rating')
  const maxLabelWidth = Math.min(...stats.cells.map(cell => cell.w - 40))
  let labelSize = 20
  while (labelSize > 14) {
    setFont(context, 500, labelSize, UI_FONT)
    if (labels.every(label => context.measureText(label).width <= maxLabelWidth)) break
    labelSize -= 1
  }
  const numberSize = Math.max(34, Math.min(56, Math.floor(stats.rect.h * 0.52)))
  const numberAscent = Math.round(numberSize * 0.68)
  const labelAscent = Math.round(labelSize * 0.74)
  const LABEL_GAP = 16

  for (let index = 0; index < entries.length; index += 1) {
    const cell = stats.cells[index]
    setFont(context, 700, numberSize, DISPLAY_FONT)
    const valueWidth = context.measureText(values[index]).width
    const starSize = hasStar[index] ? Math.round(numberSize * 0.5) : 0
    const starGap = hasStar[index] ? 10 : 0
    const groupX = cell.x + (cell.w - (valueWidth + starSize + starGap)) / 2
    // Chiffre + légende forment un bloc centré verticalement dans la case.
    const top = cell.y + Math.round((cell.h - (numberAscent + LABEL_GAP + labelAscent)) / 2)
    const numberBaseline = top + numberAscent

    context.fillStyle = COLOR.text
    context.textAlign = 'left'
    context.fillText(values[index], groupX, numberBaseline)
    if (hasStar[index]) drawStar(context, groupX + valueWidth + starGap, numberBaseline - numberAscent, starSize, 1, COLOR.text)

    context.fillStyle = COLOR.secondary
    setFont(context, 500, labelSize, UI_FONT)
    context.textAlign = 'center'
    const label = fitted(context, labels[index], cell.w - 32, 500, labelSize, 14, UI_FONT)
    context.fillText(label, cell.x + cell.w / 2, numberBaseline + LABEL_GAP + labelAscent)
  }
  context.textAlign = 'left'

  // Cloisons : un filet horizontal au-dessus de la rangée, un filet vertical entre deux cases.
  context.strokeStyle = COLOR.hairline
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(stats.rect.x, stats.rect.y + 0.5)
  context.lineTo(stats.rect.x + stats.rect.w, stats.rect.y + 0.5)
  for (let index = 1; index < stats.cells.length; index += 1) {
    const x = Math.round(stats.cells[index].x) + 0.5
    context.moveTo(x, stats.rect.y + 14)
    context.lineTo(x, stats.rect.y + stats.rect.h - 14)
  }
  context.stroke()
}

/** Intitulé de section : capitales espacées, puis un filet qui rejoint la marge droite. */
function drawSectionLabel(context: Context, rect: Rect, label: string) {
  const text = label.toLocaleUpperCase()
  context.fillStyle = COLOR.secondary
  setFont(context, 700, 20, UI_FONT)
  const baseline = rect.y + rect.h - 4
  const width = drawTracked(context, text, rect.x, baseline, 20 * 0.16)
  context.strokeStyle = COLOR.hairline
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(rect.x + width + 20, rect.y + rect.h - 11.5)
  context.lineTo(rect.x + rect.w, rect.y + rect.h - 11.5)
  context.stroke()
}

// ── Affiches ────────────────────────────────────────────────────────────────────────────────────

function drawTile(context: Context, tile: LayoutTile, image: CanvasImageSource | null, raised: boolean, withKind: boolean) {
  const { rect, radius } = tile

  // Une ombre portée détache l'affiche du fond : décalée vers le bas, large et douce.
  if (raised) {
    context.save()
    context.shadowColor = 'rgba(0,0,0,0.55)'
    context.shadowBlur = rect.w > 300 ? 44 : 26
    context.shadowOffsetY = rect.w > 300 ? 22 : 12
    roundRect(context, rect, radius)
    context.fillStyle = COLOR.surface
    context.fill()
    context.restore()
  }

  context.save()
  roundRect(context, rect, radius)
  context.clip()
  context.fillStyle = COLOR.surface
  context.fillRect(rect.x, rect.y, rect.w, rect.h)
  if (image) drawCover(context, image, rect)
  else drawPosterFallback(context, rect, tile.item.title)

  // Les étoiles se posent en bas de l'affiche, sur un voile qui les rend lisibles sur n'importe quelle image.
  if (tile.starsRect && tile.item.rating !== null) {
    const scrimHeight = tile.starsRect.h + 16 + Math.round(rect.h * 0.12)
    const scrim = context.createLinearGradient(0, rect.y + rect.h - scrimHeight, 0, rect.y + rect.h)
    scrim.addColorStop(0, 'rgba(10,10,12,0)')
    scrim.addColorStop(1, 'rgba(10,10,12,0.82)')
    context.fillStyle = scrim
    context.fillRect(rect.x, rect.y + rect.h - scrimHeight, rect.w, scrimHeight)
    drawStars(context, tile.starsRect, tile.item.rating)
  }
  if (withKind) drawKindBadge(context, rect, t(shareLibraryKind(tile.item.library)))
  context.restore()

  roundRect(context, { x: rect.x + 0.5, y: rect.y + 0.5, w: rect.w - 1, h: rect.h - 1 }, Math.max(0, radius - 0.5))
  context.strokeStyle = COLOR.edge
  context.lineWidth = 1
  context.stroke()
}

/** La pastille de bibliothèque, en haut à gauche de l'affiche : capitales espacées sur un verre sombre, lisible sur toute image. */
function drawKindBadge(context: Context, rect: Rect, label: string) {
  const size = rect.w > 300 ? 17 : 13
  const tracking = size * 0.12
  const padX = Math.round(size * 0.75)
  const height = Math.round(size * 1.95)
  const inset = rect.w > 300 ? 16 : 10
  setFont(context, 700, size, UI_FONT)
  const text = label.toLocaleUpperCase()
  const textWidth = Array.from(text).reduce((sum, letter) => sum + context.measureText(letter).width + tracking, -tracking)
  const pill = { x: rect.x + inset, y: rect.y + inset, w: Math.min(rect.w - inset * 2, Math.round(textWidth + padX * 2)), h: height }
  roundRect(context, pill, height / 2)
  context.fillStyle = 'rgba(14,14,16,0.72)'
  context.fill()
  context.strokeStyle = 'rgba(255,255,255,0.16)'
  context.lineWidth = 1
  context.stroke()
  context.fillStyle = COLOR.text
  drawTracked(context, text, pill.x + padX, centeredBaseline(context, text, pill.y + pill.h / 2), tracking)
}

/** Pas d'image : un fond dégradé et le titre en grand, qui tient lieu d'affiche. */
function drawPosterFallback(context: Context, rect: Rect, title: string) {
  const gradient = context.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h)
  gradient.addColorStop(0, '#2C2C31')
  gradient.addColorStop(1, '#1B1B1E')
  context.fillStyle = gradient
  context.fillRect(rect.x, rect.y, rect.w, rect.h)
  const size = Math.max(16, Math.min(34, Math.round(rect.w / 9)))
  context.fillStyle = COLOR.text
  setFont(context, 700, size, DISPLAY_FONT)
  const lineHeight = Math.round(size * 1.25)
  const lines = wrapLines(context, title.toLocaleUpperCase(), rect.w - 32, 6)
  const top = rect.y + rect.h / 2 - (lines.length * lineHeight) / 2 + size
  context.textAlign = 'center'
  lines.forEach((text, index) => context.fillText(text, rect.x + rect.w / 2, top + index * lineHeight))
  context.textAlign = 'left'
}

export function drawCover(context: Context, image: CanvasImageSource, rect: Rect) {
  const source = image as { naturalWidth?: number; naturalHeight?: number; width: number; height: number }
  const width = source.naturalWidth ?? source.width
  const height = source.naturalHeight ?? source.height
  if (!width || !height) return
  const scale = Math.max(rect.w / width, rect.h / height)
  const drawWidth = width * scale
  const drawHeight = height * scale
  context.drawImage(image, rect.x + (rect.w - drawWidth) / 2, rect.y + (rect.h - drawHeight) / 2, drawWidth, drawHeight)
}

/** Cinq étoiles remplies à la demi-étoile, centrées dans la zone. */
export function drawStars(context: Context, area: Rect, rating: number) {
  const size = area.h
  const gap = Math.round(size * 0.16)
  const width = 5 * size + 4 * gap
  const x = area.x + (area.w - width) / 2
  for (let index = 0; index < 5; index += 1) {
    drawStar(context, x + index * (size + gap), area.y, size, Math.max(0, Math.min(1, rating - index)), COLOR.text)
  }
}

/** Une étoile de côté `size`, remplie sur la fraction `fill` de sa largeur (0,5 = demi-étoile). */
export function drawStar(context: Context, left: number, top: number, size: number, fill: number, color: string) {
  starPath(context, left, top, size)
  context.fillStyle = 'rgba(255,255,255,0.28)'
  context.fill()
  if (fill <= 0) return
  context.save()
  context.beginPath()
  context.rect(left, top, size * fill, size)
  context.clip()
  starPath(context, left, top, size)
  context.fillStyle = color
  context.fill()
  context.restore()
}

function starPath(context: Context, left: number, top: number, size: number) {
  const cx = left + size / 2
  const cy = top + size / 2 + size * 0.04
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

export function setFont(context: Context, weight: number, size: number, family: string) {
  context.font = `${weight} ${size}px ${family}`
}

export function roundRect(context: Context, rect: Rect, radius: number) {
  context.beginPath()
  context.roundRect(rect.x, rect.y, rect.w, rect.h, radius)
}

/**
 * Texte en capitales espacées, lettre à lettre : `letterSpacing` du canevas n'existe pas dans tous les
 * moteurs web. Rend la largeur dessinée (sans l'espacement qui suit la dernière lettre).
 */
export function drawTracked(context: Context, text: string, x: number, y: number, tracking: number): number {
  let cursor = x
  for (const char of text) {
    context.fillText(char, cursor, y)
    cursor += context.measureText(char).width + tracking
  }
  return cursor - x - tracking
}

/** Plus grande taille qui fait tenir le texte sur une ligne ; au-delà du minimum, il est écourté. */
export function fitSize(context: Context, text: string, maxWidth: number, weight: number, start: number, min: number, family: string): { size: number; text: string } {
  for (let size = start; size >= min; size -= 2) {
    setFont(context, weight, size, family)
    if (context.measureText(text).width <= maxWidth) return { size, text }
  }
  setFont(context, weight, min, family)
  return { size: min, text: ellipsize(context, text, maxWidth) }
}

export function fitted(context: Context, text: string, maxWidth: number, weight: number, start: number, min: number, family: string): string {
  const result = fitSize(context, text, maxWidth, weight, start, min, family)
  setFont(context, weight, result.size, family)
  return result.text
}

export function ellipsize(context: Context, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && context.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

/** Découpe en lignes à la largeur donnée ; un mot plus large que la ligne est coupé par caractères. */
export function wrapLines(context: Context, text: string, maxWidth: number, maxLines: number): string[] {
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
