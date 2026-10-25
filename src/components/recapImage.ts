// Récapitulatif de l'année : le dessin des visuels, sur canevas.
//
// Même langage que les cartes à partager : anthracite, Syne pour les grands nombres, logo Σ, aucun en-tête
// de réseau. Ce module ne décide de rien : la fenêtre lui donne les chiffres et les libellés déjà traduits,
// et il compose dans le format demandé. Les affiches passent par le même chargeur que les cartes
// (`loadShareCardImage`), donc par les octets rendus par Rust : aucune autorisation inter-sites n'est
// nécessaire pour exporter le PNG.

import { formatNumber } from '../i18n/core.ts'
import type { ShareItem } from '../domain/shareCard.ts'
import type { ShareFormat } from '../domain/shareFormats.ts'
import type { RecapStep } from '../domain/yearRecap.ts'
import logoUrl from '../assets/sylloge-mark.png'
import type { ImageLoader } from './shareCardImage.ts'
import {
  COLOR, DISPLAY_FONT, UI_FONT, drawCover, drawStar, drawStars, drawTracked, fitted, fitSize, loadDisplayFont,
  roundRect, setFont, wrapLines,
} from './shareCardImage.ts'

const MARGIN = 72
const HEADER = 40
const FOOTER = 34

export type RecapVisual = {
  step: RecapStep
  year: number
  profileName: string
  total: number
  average: number | null
  favorites: number
  /** Les bibliothèques présentes, de la plus fournie à la moins fournie (déjà nommées). */
  libraries: Array<{ label: string; count: number }>
  /** Douze mois, initiale ou nom court, et leur nombre d'œuvres. */
  months: Array<{ label: string; count: number }>
  /** Les affiches de l'étape (mieux notées ou découvertes), avec leur légende sous l'affiche. */
  posters: Array<{ item: ShareItem; caption: string | null }>
  labels: {
    kicker: string
    numbersTitle: string
    total: string
    average: string
    favorites: string
    rhythmTitle: string
    rhythmDetail: string
    topTitle: string
    discoveriesTitle: string
    empty: string
  }
}

export type RenderedRecap = { canvas: HTMLCanvasElement; missingImages: string[] }

export async function renderRecapVisual(
  visual: RecapVisual,
  format: ShareFormat,
  options: { loadImage?: ImageLoader } = {},
): Promise<RenderedRecap> {
  const load = options.loadImage
  await loadDisplayFont()
  const urls = visual.posters.map(entry => entry.item.imageUrl).filter((url): url is string => Boolean(url))
  const images = new Map<string, CanvasImageSource | null>()
  const [logo] = await Promise.all([
    load ? load(logoUrl) : null,
    ...urls.map(async url => { if (load) images.set(url, await load(url)) }),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = format.width
  canvas.height = format.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Le canevas 2D n’est pas disponible.')
  context.textBaseline = 'alphabetic'

  const top = Math.max(MARGIN, format.safeTop)
  const bottom = format.height - Math.max(MARGIN, format.safeBottom)

  // Fond : l'anthracite des cartes, avec une lueur discrète en haut à gauche.
  context.fillStyle = COLOR.base
  context.fillRect(0, 0, format.width, format.height)
  const glow = context.createRadialGradient(format.width * 0.15, top, 0, format.width * 0.15, top, format.width * 1.1)
  glow.addColorStop(0, 'rgba(96,98,108,0.28)')
  glow.addColorStop(1, 'rgba(96,98,108,0)')
  context.fillStyle = glow
  context.fillRect(0, 0, format.width, format.height)

  drawHeader(context, visual, format, top, logo)
  const afterYear = drawYear(context, visual, format, top)
  const bodyTop = drawStepTitle(context, visual, format, afterYear)
  drawBody(context, visual, format, bodyTop, bottom, images)
  drawFooter(context, visual, format, bottom)

  return { canvas, missingImages: urls.filter(url => images.get(url) === null) }
}

function drawHeader(context: CanvasRenderingContext2D, visual: RecapVisual, format: ShareFormat, top: number, logo: CanvasImageSource | null) {
  const size = 34
  const rect = { x: MARGIN, y: top, w: size, h: size }
  if (logo) context.drawImage(logo, rect.x, rect.y, rect.w, rect.h)
  else {
    roundRect(context, rect, 8)
    context.fillStyle = '#1F1F22'
    context.fill()
  }
  context.fillStyle = COLOR.text
  setFont(context, 700, 22, DISPLAY_FONT)
  drawTracked(context, 'SYLLOGE', rect.x + rect.w + 14, top + size * 0.78, 22 * 0.18)

  if (visual.profileName.trim() !== '') {
    context.fillStyle = COLOR.secondary
    setFont(context, 600, 20, UI_FONT)
    const name = fitted(context, visual.profileName, format.width * 0.4, 600, 20, 15, UI_FONT)
    context.textAlign = 'right'
    context.fillText(name, format.width - MARGIN, top + size * 0.78)
    context.textAlign = 'left'
  }
}

/** Le surtitre et l'année en très grand ; rend l'ordonnée où la suite peut commencer. */
function drawYear(context: CanvasRenderingContext2D, visual: RecapVisual, format: ShareFormat, top: number): number {
  let y = top + HEADER + 44
  context.fillStyle = COLOR.secondary
  setFont(context, 700, 18, UI_FONT)
  drawTracked(context, visual.labels.kicker.toLocaleUpperCase(), MARGIN, y, 18 * 0.18)

  y += 12
  const year = String(visual.year)
  const yearSize = fitSize(context, year, format.width - 2 * MARGIN, 800, 200, 90, DISPLAY_FONT).size
  context.fillStyle = COLOR.text
  setFont(context, 800, yearSize, DISPLAY_FONT)
  const ascent = context.measureText(year).actualBoundingBoxAscent
  context.fillText(year, MARGIN, y + ascent)
  y += ascent

  // Filet de séparation, comme les cartes.
  context.strokeStyle = COLOR.hairline
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(MARGIN, y + 26.5)
  context.lineTo(format.width - MARGIN, y + 26.5)
  context.stroke()
  return y + 60
}

function drawStepTitle(context: CanvasRenderingContext2D, visual: RecapVisual, format: ShareFormat, y: number): number {
  const title = visual.step === 'top'
    ? visual.labels.topTitle
    : visual.step === 'discoveries'
      ? visual.labels.discoveriesTitle
      : visual.step === 'rhythm'
        ? visual.labels.rhythmTitle
        : visual.labels.numbersTitle
  context.fillStyle = COLOR.text
  setFont(context, 700, 40, DISPLAY_FONT)
  const lines = wrapLines(context, title, format.width - 2 * MARGIN, 2)
  const size = lines.length > 1 ? 34 : 40
  setFont(context, 700, size, DISPLAY_FONT)
  lines.forEach((line, index) => context.fillText(line, MARGIN, y + size + index * Math.round(size * 1.2)))
  return y + size + (lines.length - 1) * Math.round(size * 1.2) + 44
}

function drawBody(
  context: CanvasRenderingContext2D,
  visual: RecapVisual,
  format: ShareFormat,
  bodyTop: number,
  bottom: number,
  images: Map<string, CanvasImageSource | null>,
) {
  const width = format.width - 2 * MARGIN
  const height = bottom - FOOTER - bodyTop
  if (visual.step === 'numbers' && visual.total === 0) {
    context.fillStyle = COLOR.secondary
    setFont(context, 500, 24, UI_FONT)
    wrapLines(context, visual.labels.empty, width, 4).forEach((line, index) => context.fillText(line, MARGIN, bodyTop + 30 + index * 34))
    return
  }
  if (visual.step === 'numbers') return drawNumbers(context, visual, bodyTop, width, height)
  if (visual.step === 'rhythm') return drawRhythm(context, visual, bodyTop, width, height)
  return drawPosters(context, visual, bodyTop, width, height, images)
}

function drawNumbers(context: CanvasRenderingContext2D, visual: RecapVisual, y: number, width: number, height: number) {
  const cells = [
    { value: formatNumber(visual.total), label: visual.labels.total },
    { value: visual.average === null ? '–' : formatNumber(visual.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), label: visual.labels.average, star: visual.average !== null },
    { value: formatNumber(visual.favorites), label: visual.labels.favorites },
  ]
  const cellW = width / 3
  const numberSize = Math.min(96, Math.floor(height * 0.24))
  cells.forEach((cell, index) => {
    const x = MARGIN + index * cellW
    setFont(context, 700, numberSize, DISPLAY_FONT)
    const valueWidth = context.measureText(cell.value).width
    const starSize = cell.star ? Math.round(numberSize * 0.42) : 0
    const starGap = cell.star ? 12 : 0
    context.fillStyle = COLOR.text
    context.textAlign = 'left'
    const baseline = y + numberSize
    const groupX = x + (cellW - (valueWidth + starSize + starGap)) / 2
    context.fillText(cell.value, groupX, baseline)
    if (cell.star) drawStar(context, groupX + valueWidth + starGap, baseline - starSize * 0.82, starSize, 1, COLOR.text)
    context.fillStyle = COLOR.secondary
    setFont(context, 500, 20, UI_FONT)
    context.textAlign = 'center'
    context.fillText(fitted(context, cell.label, cellW - 24, 500, 20, 14, UI_FONT), x + cellW / 2, baseline + 38)
  })
  context.textAlign = 'left'

  // Répartition par bibliothèque : une part pleine, la valeur à droite.
  let cursor = y + numberSize + 96
  const max = Math.max(1, ...visual.libraries.map(entry => entry.count))
  for (const entry of visual.libraries.slice(0, 5)) {
    setFont(context, 500, 21, UI_FONT)
    context.fillStyle = COLOR.secondary
    context.fillText(fitted(context, entry.label, width * 0.34, 500, 21, 15, UI_FONT), MARGIN, cursor + 20)
    const trackX = MARGIN + width * 0.38
    const trackW = width * 0.5
    context.fillStyle = 'rgba(255,255,255,0.10)'
    roundRect(context, { x: trackX, y: cursor + 6, w: trackW, h: 18 }, 9)
    context.fill()
    context.fillStyle = 'rgba(237,237,239,0.82)'
    roundRect(context, { x: trackX, y: cursor + 6, w: Math.max(14, Math.round(trackW * (entry.count / max))), h: 18 }, 9)
    context.fill()
    context.fillStyle = COLOR.text
    setFont(context, 600, 21, UI_FONT)
    context.textAlign = 'right'
    context.fillText(formatNumber(entry.count), MARGIN + width, cursor + 22)
    context.textAlign = 'left'
    cursor += 44
  }
}

function drawRhythm(context: CanvasRenderingContext2D, visual: RecapVisual, y: number, width: number, height: number) {
  const chartH = Math.min(360, Math.max(180, height - 150))
  const slot = width / 12
  const barW = Math.max(18, Math.round(slot * 0.54))
  const max = Math.max(1, ...visual.months.map(month => month.count))
  const baseline = y + chartH
  visual.months.forEach((month, index) => {
    const barH = month.count === 0 ? 4 : Math.max(8, Math.round((month.count / max) * chartH))
    const x = MARGIN + index * slot + (slot - barW) / 2
    context.fillStyle = month.count === max && month.count > 0 ? 'rgba(237,237,239,0.92)' : 'rgba(237,237,239,0.28)'
    roundRect(context, { x, y: baseline - barH, w: barW, h: barH }, Math.min(8, barW / 2))
    context.fill()
    context.fillStyle = COLOR.secondary
    setFont(context, 600, 17, UI_FONT)
    context.textAlign = 'center'
    context.fillText(month.label, x + barW / 2, baseline + 26)
  })
  context.textAlign = 'left'

  context.fillStyle = COLOR.secondary
  setFont(context, 500, 22, UI_FONT)
  context.fillText(fitted(context, visual.labels.rhythmDetail, width, 500, 22, 16, UI_FONT), MARGIN, baseline + 82)
}

function drawPosters(
  context: CanvasRenderingContext2D,
  visual: RecapVisual,
  y: number,
  width: number,
  height: number,
  images: Map<string, CanvasImageSource | null>,
) {
  const posters = visual.posters
  if (posters.length === 0) {
    context.fillStyle = COLOR.secondary
    setFont(context, 500, 24, UI_FONT)
    context.fillText(visual.labels.empty, MARGIN, y + 30)
    return
  }
  const captionH = 56
  const gap = 20
  const count = posters.length
  // Une grille plutôt qu'une seule rangée : cinq affiches tiennent sur deux rangées beaucoup plus grandes.
  const cols = count <= 1 ? 1 : count <= 2 ? 2 : count === 4 ? 2 : 3
  const rows = Math.ceil(count / cols)
  const tileW = Math.min(
    Math.floor((width - (cols - 1) * gap) / cols),
    Math.floor((height - rows * captionH - (rows - 1) * gap) / rows / 1.5),
    380,
  )
  const tileH = Math.round(tileW * 1.5)
  const rowHeight = tileH + captionH
  const gridH = rows * rowHeight + (rows - 1) * gap
  const top = y + Math.max(0, Math.round((height - gridH) / 2))

  posters.forEach((entry, index) => {
    const row = Math.floor(index / cols)
    const inRow = index % cols
    const rowCount = Math.min(cols, count - row * cols)
    const rowW = rowCount * tileW + (rowCount - 1) * gap
    const x = MARGIN + Math.round((width - rowW) / 2) + inRow * (tileW + gap)
    const rect = { x, y: top + row * (rowHeight + gap), w: tileW, h: tileH }

    context.save()
    context.shadowColor = 'rgba(0,0,0,0.55)'
    context.shadowBlur = 26
    context.shadowOffsetY = 12
    roundRect(context, rect, 14)
    context.fillStyle = COLOR.surface
    context.fill()
    context.restore()

    context.save()
    roundRect(context, rect, 14)
    context.clip()
    context.fillStyle = COLOR.surface
    context.fillRect(rect.x, rect.y, rect.w, rect.h)
    const image = entry.item.imageUrl ? images.get(entry.item.imageUrl) ?? null : null
    if (image) drawCover(context, image, rect)
    else {
      context.fillStyle = COLOR.text
      const fallbackSize = Math.max(15, Math.round(tileW / 8))
      setFont(context, 700, fallbackSize, DISPLAY_FONT)
      context.textAlign = 'center'
      wrapLines(context, entry.item.title.toLocaleUpperCase(), tileW - 24, 5)
        .forEach((line, lineIndex) => context.fillText(line, rect.x + rect.w / 2, rect.y + rect.h / 2 + lineIndex * Math.round(fallbackSize * 1.25)))
      context.textAlign = 'left'
    }
    if (visual.step === 'top' && entry.item.rating !== null) {
      const starSize = Math.max(14, Math.round(tileW * 0.09))
      const area = { x: rect.x, y: rect.y + rect.h - starSize - 14, w: rect.w, h: starSize }
      const scrim = context.createLinearGradient(0, area.y - 20, 0, rect.y + rect.h)
      scrim.addColorStop(0, 'rgba(10,10,12,0)')
      scrim.addColorStop(1, 'rgba(10,10,12,0.82)')
      context.fillStyle = scrim
      context.fillRect(rect.x, area.y - 20, rect.w, rect.h - (area.y - rect.y) + 20)
      drawStars(context, area, entry.item.rating)
    }
    context.restore()

    roundRect(context, { x: rect.x + 0.5, y: rect.y + 0.5, w: rect.w - 1, h: rect.h - 1 }, 13.5)
    context.strokeStyle = COLOR.edge
    context.lineWidth = 1
    context.stroke()

    if (entry.caption) {
      context.fillStyle = COLOR.secondary
      setFont(context, 500, 20, UI_FONT)
      context.textAlign = 'center'
      context.fillText(fitted(context, entry.caption, tileW - 6, 500, 20, 15, UI_FONT), rect.x + rect.w / 2, rect.y + rect.h + 32)
      context.textAlign = 'left'
    }
  })
}

function drawFooter(context: CanvasRenderingContext2D, visual: RecapVisual, format: ShareFormat, bottom: number) {
  const name = visual.profileName.trim() === '' ? 'SYLLOGE' : `${visual.profileName} · ${visual.year}`
  context.fillStyle = COLOR.secondary
  setFont(context, 500, 18, UI_FONT)
  context.textAlign = 'right'
  context.fillText(name, format.width - MARGIN, bottom - 6)
  context.textAlign = 'left'
}
