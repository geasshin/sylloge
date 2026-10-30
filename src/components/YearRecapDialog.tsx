import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatNumber, getLocale, t } from '../i18n/core.ts'
import { useLanguage } from '../i18n/react.ts'
import { libraryRepository } from '../data/libraryRepository.ts'
import { saveShareImage } from '../data/nativePortability.ts'
import { loadShareCardImage } from '../data/shareImageSource.ts'
import { copyCard, type ShareDeps, type ShareResult } from '../data/shareActions.ts'
import { collectShareItems } from '../domain/shareCard.ts'
import { SHARE_FORMATS, SHARE_FORMAT_ORDER, type ShareFormatId } from '../domain/shareFormats.ts'
import { RECAP_STEPS, buildRecap, recapFileName, recapYearFor, type RecapModel, type RecapStep } from '../domain/yearRecap.ts'
import { AccessibleDialog } from './AccessibleDialog.tsx'
import { canvasToPng, type ImageLoader } from './shareCardImage.ts'
import { renderRecapVisual, type RecapVisual } from './recapImage.ts'

/**
 * Récapitulatif de l'année : quatre visuels à parcourir (les chiffres, le rythme, les mieux notées, les
 * découvertes), chacun exportable en standard 4:5 ou en story 9:16. Même fenêtre que les cartes : les
 * choix à gauche, l'aperçu à droite, et l'image dessinée sur la machine — rien n'est envoyé en ligne.
 */

const STEP_ORDER: readonly RecapStep[] = RECAP_STEPS

const STEP_LABELS: Record<RecapStep, string> = {
  numbers: 'Chiffres',
  rhythm: 'Rythme',
  palmares: 'Palmarès',
  top: 'Mieux notées',
  notes: 'Vos notes',
  span: 'Temps long',
  habits: 'Habitudes',
  discoveries: 'Découvertes',
}

const STEP_HINTS: Record<RecapStep, string> = {
  numbers: 'Le compte de l’année, votre note moyenne et la part de chaque bibliothèque.',
  rhythm: 'Le mois qui a compté, et les douze cases de l’année.',
  palmares: 'La meilleure œuvre de chaque bibliothèque, celle que vous avez le plus aimée.',
  top: 'Les œuvres que vous avez le mieux notées cette année-là.',
  notes: 'Comment vous avez noté : la répartition, la moyenne et la médiane.',
  span: 'Les années de sortie de ce que vous avez vu : votre année a voyagé.',
  habits: 'Le jour de la semaine qui vous ressemble, votre record et votre plus longue série.',
  discoveries: 'La première œuvre de chaque bibliothèque, dans l’ordre où elle est arrivée.',
}

const FORMAT_LABELS: Record<ShareFormatId, string> = { standard: 'Standard · 4:5', story: 'Story · 9:16' }

/** Les douze mois dans la langue active, abrégés, pour l'axe du rythme. */
function monthLabels(): string[] {
  const format = new Intl.DateTimeFormat(getLocale(), { month: 'short' })
  return Array.from({ length: 12 }, (_, index) => format.format(new Date(2026, index, 15)))
}

/** Les sept jours, du lundi au dimanche, en une lettre. */
function weekdayLabels(): string[] {
  const format = new Intl.DateTimeFormat(getLocale(), { weekday: 'narrow' })
  // Le 5 janvier 2026 est un lundi.
  return Array.from({ length: 7 }, (_, index) => format.format(new Date(2026, 0, 5 + index)))
}

/** Une note lisible : « 3 », « 3,5 », « 4,5 ». */
function ratingLabel(value: number): string {
  return formatNumber(value, { minimumFractionDigits: value % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 })
}

/** Une date courte dans la langue active (« 12 mars » / « 12 Mar »). */
function shortDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short' }).format(date)
}

/** Un jour de la semaine en toutes lettres, à partir d'un rang 1 = lundi … 7 = dimanche. */
function weekdayName(weekday: number): string {
  return new Intl.DateTimeFormat(getLocale(), { weekday: 'long' }).format(new Date(2026, 0, 4 + weekday))
}

function realDeps(): ShareDeps {
  const clipboard = typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined' ? navigator.clipboard : null
  return {
    clipboard: clipboard as ShareDeps['clipboard'],
    makeItem: png => new ClipboardItem({ 'image/png': png }),
  }
}

/** Ce que chaque étape montre : les chiffres, puis un visuel par étape, déjà traduits. */
export function recapVisual(recap: RecapModel, step: RecapStep, profileName: string): RecapVisual {
  const libraryNames: Record<string, string> = {
    films: t('Films'), series: t('Séries'), anime: t('Animation japonaise'), books: t('Livres'),
    mangas: t('Mangas'), games: t('Jeux'), artworks: t('Art'),
  }
  const nameOf = (library: string) => libraryNames[library] ?? library
  const posters = step === 'top'
    ? recap.topRated.map(item => ({ item, caption: item.rating === null ? null : `${ratingLabel(item.rating)} ★` }))
    : step === 'discoveries'
      ? recap.discoveries.map(item => ({ item, caption: [nameOf(item.library), shortDate(item.doneOn ?? item.doneAt)].filter(Boolean).join(' · ') }))
      : []
  const palmares = recap.palmares.map(entry => ({
    library: entry.library,
    label: nameOf(entry.library),
    item: entry.item,
    caption: entry.item.creator ?? '',
    year: entry.item.year,
  }))
  const delta = recap.total - recap.previousTotal
  const comparison = recap.previousTotal === 0
    ? ''
    : delta > 0
      ? t('{count} de plus qu’en {previous}', { count: formatNumber(delta), previous: String(recap.year - 1) })
      : delta < 0
        ? t('{count} de moins qu’en {previous}', { count: formatNumber(-delta), previous: String(recap.year - 1) })
        : t('Autant qu’en {previous}', { previous: String(recap.year - 1) })
  const habits: string[] = []
  if (recap.bestWeekday !== null) {
    const count = recap.weekdays[recap.bestWeekday - 1]?.count ?? 0
    habits.push(t('Le {weekday} revient le plus : {count} œuvres.', { weekday: weekdayName(recap.bestWeekday), count: formatNumber(count) }))
  }
  if (recap.bestDay && recap.bestDay.count > 1) {
    habits.push(t('Votre plus grosse journée : {count} œuvres, le {date}.', { count: formatNumber(recap.bestDay.count), date: shortDate(recap.bestDay.date).replace(/\.$/, '') }))
  }
  if (recap.streak && recap.streak.length > 1) {
    habits.push(t('Plus longue série : {count} jours d’affilée.', { count: formatNumber(recap.streak.length) }))
  }
  return {
    step,
    year: recap.year,
    profileName,
    total: recap.total,
    average: recap.averageRating,
    median: recap.medianRating,
    favorites: recap.favorites,
    fiveStars: recap.fiveStars,
    ratedCount: recap.ratedCount,
    libraries: recap.perLibrary.map(slice => ({ library: slice.library, label: nameOf(slice.library), count: slice.count })),
    months: recap.months.map(month => ({ label: monthLabels()[month.month - 1], count: month.count })),
    ratings: recap.ratings.map(bucket => ({ label: ratingLabel(bucket.value), count: bucket.count })),
    weekdays: recap.weekdays.map(day => ({ label: weekdayLabels()[day.weekday - 1], count: day.count })),
    palmares,
    posters,
    span: recap.span === null
      ? null
      : {
          minYear: recap.span.minYear,
          maxYear: recap.span.maxYear,
          medianYear: recap.span.medianYear,
          decades: recap.span.decades.map(entry => ({ label: String(entry.decade), count: entry.count })),
          dominant: recap.span.dominant,
          oldestTitle: recap.span.oldest.title,
          newestTitle: recap.span.newest.title,
        },
    bestWeekday: recap.bestWeekday,
    labels: {
      kicker: t('Votre année'),
      numbersTitle: t('Votre année en chiffres'),
      total: t('œuvres terminées'),
      average: t('note moyenne'),
      favorites: t('coups de cœur'),
      comparison,
      rhythmTitle: recap.busiest
        ? t('{month} a rythmé votre année', { month: new Intl.DateTimeFormat(getLocale(), { month: 'long' }).format(new Date(2026, recap.busiest.month - 1, 15)) })
        : t('Aucun mois ne se détache'),
      rhythmDetail: recap.busiest
        ? t('{count} œuvres ce mois-là', { count: formatNumber(recap.busiest.count) })
        : t('Aucune œuvre datée cette année-là.'),
      palmaresTitle: t('Votre palmarès'),
      topTitle: t('Vos mieux notées'),
      notesTitle: t('Comment vous notez'),
      notesDetail: recap.ratedCount === 0
        ? t('Aucune note cette année-là.')
        : t('{rated} œuvres notées, dont {five} à cinq étoiles.', { rated: formatNumber(recap.ratedCount), five: formatNumber(recap.fiveStars) }),
      median: recap.medianRating === null ? '' : t('Médiane : {value} étoiles', { value: ratingLabel(recap.medianRating) }),
      spanTitle: t('Le temps long'),
      spanDetail: recap.span === null
        ? t('Aucune œuvre datée cette année-là.')
        : t('{dated} œuvres vues, sorties de {min} à {max} · médiane {median}', {
            dated: formatNumber(recap.span.dated),
            min: String(recap.span.minYear),
            max: String(recap.span.maxYear),
            median: String(recap.span.medianYear),
          }),
      habitsTitle: t('Vos habitudes'),
      habitsDetail: habits.join(' '),
      discoveriesTitle: t('Vos découvertes'),
      empty: t('Rien de daté en {year} pour l’instant.', { year: String(recap.year) }),
    },
  }
}

export function YearRecapDialog({ profileId, year, onClose }: { profileId: string; year: number; onClose: () => void }) {
  useLanguage()
  const [recap, setRecap] = useState<RecapModel | null>(null)
  const [profileName, setProfileName] = useState('')
  const [step, setStep] = useState<RecapStep>('numbers')
  const [format, setFormat] = useState<ShareFormatId>('standard')
  const [preview, setPreview] = useState<{ step: RecapStep; canvas: HTMLCanvasElement } | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const host = useRef<HTMLDivElement>(null)
  const drawn = useRef(new Map<string, Promise<HTMLCanvasElement | null>>())

  useEffect(() => {
    let alive = true
    drawn.current.clear()
    libraryRepository.loadLibrary(profileId).then(
      loaded => {
        if (!alive) return
        setProfileName(loaded.profile.name)
        setRecap(buildRecap(collectShareItems(loaded), year))
      },
      error => { console.error('Impossible de lire la bibliothèque pour le récapitulatif.', error); if (alive) setFailed(true) },
    )
    return () => { alive = false }
  }, [profileId, year])

  const visualFor = useMemo(() => (current: RecapStep) => (recap ? recapVisual(recap, current, profileName) : null), [recap, profileName])

  /** Dessine (ou relit) le visuel d'une étape dans un format. */
  const draw = async (current: RecapStep, formatId: ShareFormatId): Promise<HTMLCanvasElement | null> => {
    const key = `${current}|${formatId}`
    const cached = drawn.current.get(key)
    if (cached) return cached
    const visual = visualFor(current)
    if (!visual) return null
    const pending = renderRecapVisual(visual, SHARE_FORMATS[formatId], { loadImage: loadShareCardImage })
      .then(rendered => rendered.canvas)
    drawn.current.set(key, pending)
    pending.catch(() => drawn.current.delete(key))
    return pending
  }

  useEffect(() => {
    let alive = true
    setMessage(null)
    draw(step, format)
      .then(canvas => { if (alive) setPreview(canvas ? { step, canvas } : null) })
      .catch(error => { console.error('Impossible de dessiner le récapitulatif.', error); if (alive) { setFailed(true); setPreview(null) } })
    return () => { alive = false }
    // Le dessin suit l'étape et le format ; `visualFor` change avec les données.
  }, [step, format, visualFor])

  useEffect(() => {
    const node = host.current
    if (!node) return
    if (preview) {
      const canvas = preview.canvas
      canvas.className = 'share-card-canvas'
      canvas.setAttribute('role', 'img')
      canvas.setAttribute('aria-label', t('Aperçu du récapitulatif'))
      node.replaceChildren(canvas)
    } else {
      node.replaceChildren()
    }
  }, [preview])

  const renderPng = (formatId: ShareFormatId) => async () => {
    const canvas = await draw(step, formatId)
    if (!canvas) throw new Error('Récapitulatif vide')
    return canvasToPng(canvas)
  }

  const run = async (action: () => Promise<string>) => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try { setMessage(await action()) } catch (error) {
      console.error('Impossible d’enregistrer ou de copier le récapitulatif.', error)
      setMessage(t('Impossible d’enregistrer l’image. Aucun fichier n’a été écrit.'))
    } finally { setBusy(false) }
  }

  const save = () => run(async () => {
    const saved = await saveShareImage(recapFileName(year, step, format), await renderPng(format)())
    return saved ? t('Image enregistrée dans « {file} ».', { file: saved }) : t('Enregistrement annulé. Aucun fichier n’a été écrit.')
  })

  const copy = () => run(async () => {
    const result: ShareResult = await copyCard(renderPng(format), realDeps())
    return result.kind === 'copied'
      ? t('Image copiée dans le presse-papiers.')
      : result.kind === 'copy-failed'
        ? t('La copie n’a pas fonctionné dans cette fenêtre. Utilisez « Enregistrer l’image ».')
        : t('La carte n’a pas pu être produite ou partagée.')
  })

  const index = STEP_ORDER.indexOf(step)
  const ready = preview !== null && !busy

  return (
    <AccessibleDialog
      title={t('Mon année {year}', { year: String(year) })}
      description={t('Votre année en huit visuels : les chiffres, le rythme, votre palmarès, vos mieux notées, vos notes, le temps long, vos habitudes et vos découvertes. Chaque visuel s’enregistre en standard 4:5 ou en story 9:16. Rien n’est envoyé en ligne.')}
      closeDisabled={busy}
      onClose={onClose}
      size="lg"
    >
      <div className="assistant-content share-card-dialog recap-dialog">
        <div className="share-card-controls">
          <ol className="share-steps" aria-label={t('Étapes du récapitulatif')}>
            {STEP_ORDER.map((id, position) => (
              <li key={id} aria-current={id === step ? 'step' : undefined} data-done={position < index || undefined}>
                <button type="button" disabled={busy || !recap} onClick={() => setStep(id)}>
                  <span className="share-step-number" aria-hidden="true">{position + 1}</span>
                  <span>{t(STEP_LABELS[id])}</span>
                </button>
              </li>
            ))}
          </ol>

          {recap === null && !failed && <p role="status">{t('Composition du récapitulatif…')}</p>}
          {failed && <p className="inline-report error" role="alert">{t('Le récapitulatif n’a pas pu être composé.')}</p>}

          {recap && (
            <section className="share-step-body" aria-labelledby="recap-step-title">
              <h3 id="recap-step-title">{t(STEP_LABELS[step])}</h3>
              <p className="field-hint">
                {t(STEP_HINTS[step])}
                {step === 'numbers' && ` ${t('{count} œuvres datées de {year}.', { count: formatNumber(recap.total), year: String(year) })}`}
              </p>
              <div className="field">
                <span className="field-label" id="recap-format-label">{t('Format de l’image')}</span>
                <div className="share-format-options" role="radiogroup" aria-labelledby="recap-format-label">
                  {SHARE_FORMAT_ORDER.map(id => (
                    <button key={id} type="button" role="radio" aria-checked={format === id} className="share-format-option" disabled={busy} onClick={() => setFormat(id)}>
                      <b>{t(FORMAT_LABELS[id])}</b>
                      <small>{id === 'standard' ? t('Messages, fils et publications') : t('Stories et statuts')}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="assistant-actions">
                <button className="primary-button" type="button" disabled={!ready} onClick={() => void save()}>{busy ? t('Enregistrement…') : t('Enregistrer l’image')}</button>
                <button className="secondary-button" type="button" disabled={!ready} onClick={() => void copy()}>{t('Copier l’image')}</button>
              </div>
              {message && <p className="inline-report" role="status">{message}</p>}
              <div className="assistant-actions share-nav">
                <button className="secondary-button" type="button" disabled={busy || index === 0} onClick={() => setStep(STEP_ORDER[index - 1])}>{t('Précédent')}</button>
                {index < STEP_ORDER.length - 1
                  ? <button className="primary-button" type="button" disabled={busy} onClick={() => setStep(STEP_ORDER[index + 1])}>{t('Continuer')}</button>
                  : <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{t('Fermer')}</button>}
              </div>
            </section>
          )}
        </div>
        <div className="share-card-preview" ref={host} aria-busy={preview === null} />
      </div>
    </AccessibleDialog>
  )
}

/** L'année montrée : la règle du 10 décembre, sauf `?recap=AAAA` dans le harnais de recette. */
export function launcherYear(search: string, now: Date = new Date()): number {
  const forced = new URLSearchParams(search).get('recap')
  return forced && /^\d{4}$/.test(forced) ? Number(forced) : recapYearFor(now)
}

/** Bouton qui ouvre le récapitulatif ; l'année vient de l'appelant, pour que le libellé et le bouton disent la même.
 *  `label` permet un libellé court (« Voir ») dans une liste d'années ; le nom accessible garde l'année. */
export function YearRecapLauncher({ profileId, year, label }: { profileId: string; year: number; label?: string }) {
  useLanguage()
  const [open, setOpen] = useState(false)
  const fullLabel = t('Voir mon année {year}', { year: String(year) })
  return (
    <>
      <button className="secondary-button" type="button" aria-label={fullLabel} onClick={() => setOpen(true)}>{label ?? fullLabel}</button>
      {open && createPortal(<YearRecapDialog profileId={profileId} year={year} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}
