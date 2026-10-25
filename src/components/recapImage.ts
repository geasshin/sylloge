// Récapitulatif de l'année : le dessin des visuels, sur canevas.
//
// Même langage que les cartes à partager : anthracite, Syne pour les grands nombres, logo Σ, aucun en-tête
// de réseau. Une couleur par bibliothèque (voir `LIBRARY_ACCENTS`) sert d'accent — filet, barre, point de
// frise, pastille — sans jamais colorer le fond : la décision du 16 octobre (monochrome anthracite) tient,
// les accents ne sont qu'une teinte sourde posée sur l'anthracite.
//
// Ce module ne décide de rien : la fenêtre lui donne les chiffres et les libellés déjà traduits, et il
// compose dans le format demandé. Les affiches passent par le même chargeur que les cartes
// (`loadShareCardImage`), donc par les octets rendus par Rust : aucune autorisation inter-sites n'est
// nécessaire pour exporter le PNG.

import { formatNumber } from '../i18n/core.ts'
import type { ShareItem, ShareLibraryKey } from '../domain/shareCard.ts'
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

/** Une teinte sourde par bibliothèque : elle marque, elle ne crie pas. */
export const LIBRARY_ACCENTS: Record<string, string> = {
  films: '#C4704C',
  series: '#5E8FBF',
  anime: '#C06189',
  books: '#A38F55',
  mangas: '#8670BE',
  games: '#569477',
  artworks: '#C9A24F',
}

const FALLBACK_ACCENT = '#8A8F98'

/** L'or des notes : il ne vient d'aucune bibliothèque, il marque la note la plus donnée. */
const NOTE_ACCENT = '#C9A24F'

/** La couleur d'une bibliothèque, y compris une bibliothèque ajoutée. */
export function accentOf(library: ShareLibraryKey | null): string {
  return (library && LIBRARY_ACCENTS[library]) || FALLBACK_ACCENT
}

export type RecapVisual = {
  step: RecapStep
  year: number
  profileName: string
  total: number
  average: number | null
  median: number | null
  favorites: number
  fiveStars: number
  ratedCount: number
  /** Les bibliothèques présentes, de la plus fournie à la moins fournie (déjà nommées). */
  libraries: Array<{ library: ShareLibraryKey; label: string; count: number }>
  /** Douze mois, initiale ou nom court, et leur nombre d'œuvres. */
  months: Array<{ label: string; count: number }>
  /** Dix notes, de 0,5 à 5, et leur nombre d'œuvres. */
  ratings: Array<{ label: string; count: number }>
  /** Sept jours, lundi à dimanche, et leur nombre d'œuvres. */
  weekdays: Array<{ label: string; count: number }>
  /** La meilleure de chaque bibliothèque, avec sa légende. */
  palmares: Array<{ library: ShareLibraryKey; label: string; item: ShareItem; caption: string; year: number | null }>
  /** Les affiches de l'étape (mieux notées ou découvertes), avec leur légende sous l'affiche. */
  posters: Array<{ item: ShareItem; caption: string | null }>
  /** La frise du temps long : un point par œuvre datée, avec sa bibliothèque. */
  span: {
    minYear: number
    maxYear: number
    medianYear: number
    decades: Array<{ label: string; count: number }>
    dominant: ShareLibraryKey
    oldestTitle: string
    newestTitle: string
  } | null
  /** Le jour de la semaine qui mène (1 = lundi … 7 = dimanche), pour ne souligner que lui. */
  bestWeekday: number | null
  labels: {
    kicker: string
    numbersTitle: string
    total: string
    average: string
    favorites: string
    comparison: string
    rhythmTitle: string
    rhythmDetail: string
    palmaresTitle: string
    topTitle: string
    notesTitle: string
    notesDetail: string
    median: string
    spanTitle: string
    spanDetail: string
    habitsTitle: string
    habitsDetail: string
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
  const items = [...visual.posters.map(entry => entry.item), ...visual.palmares.map(entry => entry.item)]
  const urls = [...new Set(items.map(item => item.imageUrl).filter((url): url is string => Boolean(url)))]
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

  // Fond : l'anthracite des cartes, avec une lueur discrète, teintée par la bibliothèque qui mène l'année.
  context.fillStyle = COLOR.base
  context.fillRect(0, 0, format.width, format.height)
  const glow = context.createRadialGradient(format.width * 0.15, top, 0, format.width * 0.15, top, format.width * 1.1)
  glow.addColorStop(0, 'rgba(96,98,108,0.28)')
  glow.addColorStop(1, 'rgba(96,98,108,0)')
  context.fillStyle = glow
  context.fillRect(0, 0, format.width, format.height)
  const lead = visual.libraries[0]?.library ?? null
  const wash = context.createRadialGradient(format.width * 0.9, format.height * 0.95, 0, format.width * 0.9, format.height * 0.95, format.width * 0.85)
  wash.addColorStop(0, hexAlpha(accentOf(lead), 0.16))
  wash.addColorStop(1, hexAlpha(accentOf(lead), 0))
  context.fillStyle = wash
  context.fillRect(0, 0, format.width, format.height)

  drawHeader(context, visual, format, top, logo)
  const afterYear = drawYear(context, visual, format, top)
  const bodyTop = drawStepTitle(context, visual, format, afterYear)
  drawBody(context, visual, format, bodyTop, bottom, images)
  drawFooter(context, visual, format, bottom)

  return { canvas, missingImages: urls.filter(url => images.get(url) === null) }
}

/** `#RRGGBB` plus une opacité, pour les lavis et les filets. */
function hexAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  if (value.length !== 6) return `rgba(138,143,152,${alpha})`
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
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

  // Filet de séparation, à la couleur de la bibliothèque qui mène l'année.
  const lead = visual.libraries[0]?.library ?? null
  context.strokeStyle = COLOR.hairline
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(MARGIN, y + 26.5)
  context.lineTo(format.width - MARGIN, y + 26.5)
  context.stroke()
  context.strokeStyle = hexAlpha(accentOf(lead), 0.9)
  context.lineWidth = 3
  context.beginPath()
  context.moveTo(MARGIN, y + 26.5)
  context.lineTo(MARGIN + 88, y + 26.5)
  context.stroke()
  return y + 60
}

function stepTitle(visual: RecapVisual): string {
  switch (visual.step) {
    case 'rhythm': return visual.labels.rhythmTitle
    case 'palmares': return visual.labels.palmaresTitle
    case 'top': return visual.labels.topTitle
    case 'notes': return visual.labels.notesTitle
    case 'span': return visual.labels.spanTitle
    case 'habits': return visual.labels.habitsTitle
    case 'discoveries': return visual.labels.discoveriesTitle
    default: return visual.labels.numbersTitle
  }
}

function drawStepTitle(context: CanvasRenderingContext2D, visual: RecapVisual, format: ShareFormat, y: number): number {
  const title = stepTitle(visual)
  setFont(context, 700, 40, DISPLAY_FONT)
  const lines = wrapLines(context, title, format.width - 2 * MARGIN, 2)
  const size = lines.length > 1 ? 34 : 40
  context.fillStyle = COLOR.text
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
  if (visual.total === 0) {
    context.fillStyle = COLOR.secondary
    setFont(context, 500, 24, UI_FONT)
    wrapLines(context, visual.labels.empty, width, 4).forEach((line, index) => context.fillText(line, MARGIN, bodyTop + 30 + index * 34))
    return
  }
  switch (visual.step) {
    case 'rhythm': return drawRhythm(context, visual, bodyTop, width, height)
    case 'palmares': return drawPalmares(context, visual, bodyTop, width, height, images)
    case 'notes': return drawNotes(context, visual, bodyTop, width, height)
    case 'span': return drawSpan(context, visual, bodyTop, width, height)
    case 'habits': return drawHabits(context, visual, bodyTop, width, height)
    case 'discoveries': return drawPosters(context, visual, bodyTop, width, height, images)
    case 'top': return drawPosters(context, visual, bodyTop, width, height, images)
    default: return drawNumbers(context, visual, bodyTop, width, height)
  }
}

function drawNumbers(context: CanvasRenderingContext2D, visual: RecapVisual, y: number, width: number, height: number) {
  const cells = [
    { value: formatNumber(visual.total), label: visual.labels.total },
    { value: visual.average === null ? '–' : formatNumber(visual.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), label: visual.labels.average, star: visual.average !== null },
    { value: formatNumber(visual.favorites), label: visual.labels.favorites },
  ]
  const cellW = width / 3
  const numberSize = Math.min(96, Math.floor(height * 0.22))
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

  // La comparaison avec l'année précédente, en une ligne discrète.
  if (visual.labels.comparison !== '') {
    context.fillStyle = COLOR.secondary
    setFont(context, 500, 20, UI_FONT)
    context.fillText(fitted(context, visual.labels.comparison, width, 500, 20, 15, UI_FONT), MARGIN, y + numberSize + 76)
  }

  // Répartition par bibliothèque : une pastille et un trait à la couleur de chacune.
  let cursor = y + numberSize + 116
  const max = Math.max(1, ...visual.libraries.map(entry => entry.count))
  const rowH = Math.min(46, Math.max(30, Math.floor((y + height - cursor - 16) / Math.max(1, Math.min(5, visual.libraries.length)))))
  for (const entry of visual.libraries.slice(0, 5)) {
    const accent = accentOf(entry.library)
    context.beginPath()
    context.arc(MARGIN + 5, cursor + 10, 5, 0, Math.PI * 2)
    context.fillStyle = accent
    context.fill()
    setFont(context, 500, 21, UI_FONT)
    context.fillStyle = COLOR.secondary
    context.fillText(fitted(context, entry.label, width * 0.3, 500, 21, 15, UI_FONT), MARGIN + 20, cursor + 17)
    const trackX = MARGIN + width * 0.42
    const trackW = width * 0.46
    context.fillStyle = 'rgba(255,255,255,0.08)'
    roundRect(context, { x: trackX, y: cursor + 3, w: trackW, h: 16 }, 8)
    context.fill()
    context.fillStyle = hexAlpha(accent, 0.85)
    roundRect(context, { x: trackX, y: cursor + 3, w: Math.max(12, Math.round(trackW * (entry.count / max))), h: 16 }, 8)
    context.fill()
    context.fillStyle = COLOR.text
    setFont(context, 600, 21, UI_FONT)
    context.textAlign = 'right'
    context.fillText(formatNumber(entry.count), MARGIN + width, cursor + 19)
    context.textAlign = 'left'
    cursor += rowH
  }
}

function drawRhythm(context: CanvasRenderingContext2D, visual: RecapVisual, y: number, width: number, height: number) {
  const detailH = 150
  const chartH = Math.min(520, Math.max(150, height - detailH))
  const slot = width / 12
  const barW = Math.max(18, Math.round(slot * 0.54))
  const max = Math.max(1, ...visual.months.map(month => month.count))
  const lead = accentOf(visual.libraries[0]?.library ?? null)
  const baseline = y + chartH
  visual.months.forEach((month, index) => {
    const barH = month.count === 0 ? 4 : Math.max(8, Math.round((month.count / max) * chartH))
    const x = MARGIN + index * slot + (slot - barW) / 2
    const busiest = month.count === max && month.count > 0
    context.fillStyle = busiest ? lead : 'rgba(237,237,239,0.26)'
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
  wrapLines(context, visual.labels.rhythmDetail, width, 2)
    .forEach((line, index) => context.fillText(line, MARGIN, baseline + 78 + index * 30))
}

function drawPalmares(
  context: CanvasRenderingContext2D,
  visual: RecapVisual,
  y: number,
  width: number,
  height: number,
  images: Map<string, CanvasImageSource | null>,
) {
  const rows = visual.palmares.slice(0, 7)
  if (rows.length === 0) return drawEmpty(context, visual, y, width)
  const gap = 14
  const rowH = Math.min(132, Math.floor((height - (rows.length - 1) * gap) / rows.length))
  const posterW = Math.round(rowH * 0.62)
  const posterH = Math.round(posterW * 1.5)

  rows.forEach((entry, index) => {
    const top = y + index * (rowH + gap)
    const accent = accentOf(entry.library)
    const rect = { x: MARGIN, y: top + Math.round((rowH - posterH) / 2), w: posterW, h: posterH }

    context.save()
    roundRect(context, rect, 8)
    context.clip()
    context.fillStyle = COLOR.surface
    context.fillRect(rect.x, rect.y, rect.w, rect.h)
    const image = entry.item.imageUrl ? images.get(entry.item.imageUrl) ?? null : null
    if (image) drawCover(context, image, rect)
    else {
      context.fillStyle = COLOR.secondary
      setFont(context, 700, Math.max(12, Math.round(posterW / 7)), DISPLAY_FONT)
      context.textAlign = 'center'
      wrapLines(context, entry.item.title.toLocaleUpperCase(), posterW - 12, 3)
        .forEach((line, lineIndex) => context.fillText(line, rect.x + rect.w / 2, rect.y + rect.h / 2 + lineIndex * 16))
      context.textAlign = 'left'
    }
    context.restore()

    // Filet vertical à la couleur de la bibliothèque.
    context.fillStyle = accent
    roundRect(context, { x: rect.x + rect.w + 22, y: top + 10, w: 3, h: rowH - 20 }, 1.5)
    context.fill()

    const textX = rect.x + rect.w + 40
    context.fillStyle = accent
    setFont(context, 700, 15, UI_FONT)
    drawTracked(context, entry.label.toLocaleUpperCase(), textX, top + 22, 15 * 0.14)
    context.fillStyle = COLOR.text
    setFont(context, 700, 26, DISPLAY_FONT)
    context.fillText(fitted(context, entry.item.title, width - (textX - MARGIN) - 90, 700, 26, 18, DISPLAY_FONT), textX, top + 56)
    context.fillStyle = COLOR.secondary
    setFont(context, 500, 18, UI_FONT)
    context.fillText(fitted(context, entry.caption, width - (textX - MARGIN) - 90, 500, 18, 14, UI_FONT), textX, top + 84)
    if (entry.year !== null) {
      context.fillStyle = COLOR.secondary
      setFont(context, 600, 24, UI_FONT)
      context.textAlign = 'right'
      context.fillText(String(entry.year), MARGIN + width, top + 58)
      context.textAlign = 'left'
    }
    if (entry.item.rating !== null) {
      const starSize = 15
      drawStars(context, { x: textX, y: top + 94, w: Math.min(width - (textX - MARGIN), 130), h: starSize }, entry.item.rating)
    }
  })
}

function drawNotes(context: CanvasRenderingContext2D, visual: RecapVisual, y: number, width: number, height: number) {
  const chartH = Math.min(230, Math.max(120, Math.floor(height * 0.42)))
  const slot = width / visual.ratings.length
  const barW = Math.max(14, Math.round(slot * 0.56))
  const max = Math.max(1, ...visual.ratings.map(bucket => bucket.count))
  const baseline = y + chartH
  const accent = NOTE_ACCENT
  visual.ratings.forEach((bucket, index) => {
    const barH = bucket.count === 0 ? 3 : Math.max(6, Math.round((bucket.count / max) * chartH))
    const x = MARGIN + index * slot + (slot - barW) / 2
    context.fillStyle = bucket.count === max && bucket.count > 0 ? accent : 'rgba(237,237,239,0.30)'
    roundRect(context, { x, y: baseline - barH, w: barW, h: barH }, Math.min(6, barW / 2))
    context.fill()
    if (index === 0 || index === 5 || index === 9) {
      context.fillStyle = COLOR.secondary
      setFont(context, 600, 16, UI_FONT)
      context.textAlign = 'center'
      context.fillText(bucket.label, x + barW / 2, baseline + 24)
    }
  })
  context.textAlign = 'left'

  // La moyenne en très grand, la médiane en dessous.
  let cursor = baseline + 82
  if (visual.average !== null) {
    const size = Math.min(78, Math.floor(height * 0.16))
    setFont(context, 700, size, DISPLAY_FONT)
    const value = formatNumber(visual.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    const valueWidth = context.measureText(value).width
    context.fillStyle = COLOR.text
    context.fillText(value, MARGIN, cursor + size * 0.8)
    drawStar(context, MARGIN + valueWidth + 12, cursor + size * 0.8 - size * 0.62, Math.round(size * 0.5), 1, COLOR.text)
    context.fillStyle = COLOR.secondary
    setFont(context, 500, 20, UI_FONT)
    context.fillText(fitted(context, visual.labels.average, width * 0.6, 500, 20, 15, UI_FONT), MARGIN, cursor + size * 0.8 + 32)
    cursor += size + 54
  }
  context.fillStyle = COLOR.secondary
  setFont(context, 500, 21, UI_FONT)
  wrapLines(context, visual.labels.notesDetail, width, 2)
    .forEach((line, index) => context.fillText(line, MARGIN, cursor + 22 + index * 30))
  if (visual.median !== null) {
    context.fillStyle = COLOR.secondary
    setFont(context, 500, 21, UI_FONT)
    context.fillText(visual.labels.median, MARGIN, cursor + 92)
  }
}

function drawSpan(context: CanvasRenderingContext2D, visual: RecapVisual, y: number, width: number, height: number) {
  const span = visual.span
  if (!span) return drawEmpty(context, visual, y, width)

  context.fillStyle = COLOR.secondary
  setFont(context, 500, 20, UI_FONT)
  context.fillText(fitted(context, visual.labels.spanDetail, width, 500, 20, 15, UI_FONT), MARGIN, y + 22)

  // Les décennies : des barres plutôt qu'une frise, qu'une seule œuvre de 1831 troue de bout en bout.
  const decades = span.decades.slice(0, 6)
  const max = Math.max(1, ...decades.map(entry => entry.count))
  let cursor = y + 62
  const rowH = Math.min(68, Math.max(28, Math.floor((height - 250) / Math.max(1, decades.length))))
  const accent = accentOf(span.dominant)
  for (const entry of decades) {
    context.fillStyle = COLOR.text
    setFont(context, 600, 19, UI_FONT)
    context.textAlign = 'right'
    context.fillText(entry.label, MARGIN + 84, cursor + 15)
    context.textAlign = 'left'
    const trackX = MARGIN + 100
    const trackW = width - 100 - 62
    context.fillStyle = 'rgba(255,255,255,0.07)'
    roundRect(context, { x: trackX, y: cursor + 2, w: trackW, h: 16 }, 8)
    context.fill()
    context.fillStyle = hexAlpha(accent, 0.85)
    roundRect(context, { x: trackX, y: cursor + 2, w: Math.max(10, Math.round(trackW * (entry.count / max))), h: 16 }, 8)
    context.fill()
    context.fillStyle = COLOR.text
    setFont(context, 600, 19, UI_FONT)
    context.textAlign = 'right'
    context.fillText(formatNumber(entry.count), MARGIN + width, cursor + 17)
    context.textAlign = 'left'
    cursor += rowH
  }

  // Les deux bornes, en bas : l'année en grand, le titre en dessous.
  const blockY = y + height - 96
  const bound = (x: number, year: number, title: string, align: 'left' | 'right') => {
    context.fillStyle = COLOR.text
    setFont(context, 700, 40, DISPLAY_FONT)
    context.textAlign = align
    context.fillText(String(year), align === 'left' ? x : x, blockY)
    context.fillStyle = COLOR.secondary
    setFont(context, 500, 18, UI_FONT)
    context.fillText(fitted(context, title, width / 2 - 24, 500, 18, 13, UI_FONT), x, blockY + 28)
    context.textAlign = 'left'
  }
  bound(MARGIN, span.minYear, span.oldestTitle, 'left')
  bound(MARGIN + width, span.maxYear, span.newestTitle, 'right')
}

function drawHabits(context: CanvasRenderingContext2D, visual: RecapVisual, y: number, width: number, height: number) {
  const detailH = 96
  const chartH = Math.min(400, Math.max(140, height - detailH))
  const slot = width / 7
  const barW = Math.max(26, Math.round(slot * 0.52))
  const max = Math.max(1, ...visual.weekdays.map(day => day.count))
  const accent = accentOf(visual.libraries[0]?.library ?? null)
  const baseline = y + chartH
  visual.weekdays.forEach((day, index) => {
    const barH = day.count === 0 ? 3 : Math.max(6, Math.round((day.count / max) * chartH))
    const x = MARGIN + index * slot + (slot - barW) / 2
    const best = visual.bestWeekday === index + 1
    context.fillStyle = best ? accent : 'rgba(237,237,239,0.26)'
    roundRect(context, { x, y: baseline - barH, w: barW, h: barH }, Math.min(9, barW / 2))
    context.fill()
    context.fillStyle = COLOR.secondary
    setFont(context, 600, 18, UI_FONT)
    context.textAlign = 'center'
    context.fillText(day.label, x + barW / 2, baseline + 28)
    context.textAlign = 'left'
  })

  context.fillStyle = COLOR.secondary
  setFont(context, 500, 21, UI_FONT)
  wrapLines(context, visual.labels.habitsDetail, width, 3)
    .forEach((line, index) => context.fillText(line, MARGIN, baseline + 78 + index * 30))
}

function drawEmpty(context: CanvasRenderingContext2D, visual: RecapVisual, y: number, width: number) {
  context.fillStyle = COLOR.secondary
  setFont(context, 500, 24, UI_FONT)
  wrapLines(context, visual.labels.empty, width, 4)
    .forEach((line, index) => context.fillText(line, MARGIN, y + 30 + index * 34))
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
  if (posters.length === 0) return drawEmpty(context, visual, y, width)
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
    context.strokeStyle = hexAlpha(accentOf(entry.item.library), 0.55)
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
