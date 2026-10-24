import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatNumber, t } from '../i18n/core.ts'
import { useLanguage } from '../i18n/react.ts'
import { libraryRepository, type CulturalLibrary } from '../data/libraryRepository.ts'
import { resolveFilmDisplayPoster } from '../data/tmdbService.ts'
import { saveShareImage } from '../data/nativePortability.ts'
import { loadDirectorPortraits, loadFilmCredits } from '../data/sharePeopleSource.ts'
import { loadShareCardImage } from '../data/shareImageSource.ts'
import { openExternalUrl } from '../data/externalLinks.ts'
import { copyCard, shareToDestination, type ShareDeps, type ShareResult } from '../data/shareActions.ts'
import {
  ALL_SHARE_STATS,
  buildShareCard,
  collectShareItems,
  defaultShareSelection,
  MAX_SHARE_FAVORITES,
  setShareHero,
  shareCandidates,
  shareLibraryKind,
  shareScopes,
  toggleShareOther,
  withDisplayedImages,
  type ShareCardModel,
  type ShareItem,
  type ShareLibraryKey,
  type ShareScope,
  type ShareStatsChoice,
} from '../domain/shareCard.ts'
import { shareLimitsFor } from '../domain/shareCardLayout.ts'
import {
  defaultPeopleIds, normalizeCharacters, orderPeople, peopleOptionsFor, rankCreators, rankFilmPeople, rankProfileCreators, type SharePerson,
} from '../domain/sharePeople.ts'
import { SHARE_DESTINATIONS, SHARE_FORMATS, SHARE_FORMAT_ORDER, type ShareDestination, type ShareFormatId } from '../domain/shareFormats.ts'
import { AccessibleDialog } from './AccessibleDialog.tsx'
import { ShareIcon } from './icons.tsx'
import { SharePeopleStep } from './SharePeopleStep.tsx'
import { canvasToPng, renderShareCard, shareCardFileName, type RenderedShareCard } from './shareCardImage.ts'

type Props = {
  profileId: string
  /** Bibliothèque à montrer d'emblée ; sans elle, la carte du profil entier. */
  initialLibrary?: ShareLibraryKey
  onClose: () => void
}

type Message = { kind: 'saved'; file: string } | { kind: 'cancelled' } | { kind: 'failed' } | { kind: 'share'; result: ShareResult }
type Drawn = { model: ShareCardModel; rendered: RenderedShareCard }
type Preview =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'failed' }
  | ({ status: 'ready' } & Drawn)

const PROFILE_VALUE = 'profile'

/** Les étapes de la fenêtre : on choisit l'œuvre principale, les autres, les chiffres, puis on partage. */
type StepId = 'hero' | 'others' | 'people' | 'stats' | 'share'
const STEP_LABELS: Record<StepId, string> = { hero: 'Principal', others: 'Autres', people: 'Personnes', stats: 'Chiffres', share: 'Partage' }

const FORMAT_COPY: Record<ShareFormatId, { name: string; ratio: string; hint: string }> = {
  standard: { name: 'Standard', ratio: '4:5', hint: 'Messages, WhatsApp, Messenger, X' },
  story: { name: 'Story', ratio: '9:16', hint: 'Stories Instagram et Facebook' },
}

function shareMessageText(result: ShareResult): string {
  switch (result.kind) {
    case 'copied-opened': return t('Image copiée. {destination} s’ouvre dans votre navigateur : collez-la avec ⌘V (Ctrl+V sous Windows).', { destination: result.destination })
    case 'copied-open-failed': return t('Image copiée, mais {destination} n’a pas pu s’ouvrir. Ouvrez-le vous-même et collez l’image.', { destination: result.destination })
    case 'copy-failed-saved': return t('La copie n’a pas fonctionné : l’image est enregistrée dans « {file} ». Glissez-la dans {destination}, qui s’ouvre dans votre navigateur.', { file: result.file, destination: result.destination })
    case 'saved-for-instagram': return t('Image au format story enregistrée dans « {file} ». Les stories Instagram se publient depuis le téléphone : envoyez-lui l’image (AirDrop, Photos iCloud, e-mail), puis ajoutez-la à votre story.', { file: result.file })
    case 'copied': return t('Image copiée dans le presse-papiers.')
    case 'copy-failed': return t('La copie n’a pas fonctionné dans cette fenêtre. Utilisez « Enregistrer l’image ».')
    case 'cancelled': return t('Enregistrement annulé. Aucun fichier n’a été écrit.')
    case 'failed': return t('La carte n’a pas pu être produite ou partagée.')
  }
}

function messageText(message: Message): string {
  if (message.kind === 'share') return shareMessageText(message.result)
  if (message.kind === 'saved') return t('Image enregistrée dans « {file} ».', { file: message.file })
  if (message.kind === 'cancelled') return t('Enregistrement annulé. Aucun fichier n’a été écrit.')
  return t('Impossible d’enregistrer l’image. Aucun fichier n’a été écrit.')
}

const isFailure = (message: Message) => message.kind === 'failed' || (message.kind === 'share' && (message.result.kind === 'failed' || message.result.kind === 'copy-failed'))

/** Les moyens réels : presse-papiers de la fenêtre, ouverture dans le navigateur du système, enregistrement natif. */
function realDeps(): ShareDeps {
  const clipboard = typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined' ? navigator.clipboard : null
  return {
    clipboard: clipboard as ShareDeps['clipboard'],
    makeItem: png => new ClipboardItem({ 'image/png': png }),
    open: openExternalUrl,
    save: saveShareImage,
  }
}

/** Une pastille d'affiche à cocher : l'œuvre, sa note, et un repli sur le titre si l'image manque. */
function PosterChoice({ item, image, type, name, checked, disabled, showKind = false, onChange }: {
  item: ShareItem
  image: string | null
  type: 'radio' | 'checkbox'
  name: string
  checked: boolean
  disabled?: boolean
  /** Sur le profil : la bibliothèque de l'œuvre, puisque la grille les mélange. */
  showKind?: boolean
  onChange: () => void
}) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [image])
  return (
    <label className="share-poster" data-checked={checked || undefined} data-disabled={disabled || undefined} title={showKind ? `${item.title} · ${t(shareLibraryKind(item.library))}` : item.title}>
      <input className="visually-hidden" type={type} name={name} checked={checked} disabled={disabled} onChange={onChange} aria-label={item.title} />
      <span className="share-poster-frame">
        <span className="share-poster-title" aria-hidden="true">{item.title}</span>
        {image && !broken && <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />}
        {showKind && <span className="share-poster-kind" aria-hidden="true">{t(shareLibraryKind(item.library))}</span>}
        {checked && <span className="share-poster-mark" aria-hidden="true">{type === 'radio' ? '★' : '✓'}</span>}
      </span>
      {item.rating !== null && <span className="share-poster-rating" aria-hidden="true">{formatNumber(item.rating, { minimumFractionDigits: 0, maximumFractionDigits: 1 })} ★</span>}
    </label>
  )
}

/**
 * Carte à partager : une image PNG qui met en avant les coups de cœur d'une bibliothèque ou de tout le
 * profil. La personne répond à quelques questions (l'œuvre principale, les autres, les chiffres à garder),
 * voit la carte se composer en direct, puis l'enregistre, la copie ou l'envoie vers un service, au format
 * standard ou story. Le dessin se fait sur la machine ; rien n'est envoyé en ligne.
 */
export function ShareCardDialog({ profileId, initialLibrary, onClose }: Props) {
  useLanguage()
  const [library, setLibrary] = useState<CulturalLibrary | null>(null)
  const [value, setValue] = useState<string>(initialLibrary ?? PROFILE_VALUE)
  const [format, setFormat] = useState<ShareFormatId>('standard')
  const [selection, setSelection] = useState<string[]>([])
  const [statsChoice, setStatsChoice] = useState<ShareStatsChoice>(ALL_SHARE_STATS)
  // Les personnes : propositions calculées (réalisateur, acteurs, auteur, studio), cases cochées, personnages saisis.
  const [suggestions, setSuggestions] = useState<SharePerson[]>([])
  const [loadingPeople, setLoadingPeople] = useState(false)
  const [missingTmdb, setMissingTmdb] = useState(false)
  const [portraits, setPortraits] = useState<Record<string, string | null>>({})
  const [chosenIds, setChosenIds] = useState<string[]>([])
  const [characters, setCharacters] = useState<string[]>([])
  const [step, setStep] = useState<StepId>('hero')
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({})
  const [preview, setPreview] = useState<Preview>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const host = useRef<HTMLDivElement>(null)
  // Une carte déjà dessinée n'est pas redessinée (aperçu puis partage vers le même format).
  const drawn = useRef(new Map<string, Promise<Drawn | null>>())

  useEffect(() => {
    let alive = true
    drawn.current.clear()
    libraryRepository.loadLibrary(profileId).then(
      loaded => { if (alive) setLibrary(loaded) },
      error => { console.error('Impossible de lire la bibliothèque pour la carte.', error); if (alive) setPreview({ status: 'failed' }) },
    )
    return () => { alive = false }
  }, [profileId])

  const items = useMemo(() => (library ? collectShareItems(library) : []), [library])
  const choices = useMemo(() => (library ? shareScopes(library) : []), [library])
  const scope = useMemo<ShareScope>(() => (value === PROFILE_VALUE ? { kind: 'profile' } : { kind: 'library', library: value as ShareLibraryKey }), [value])
  const candidates = useMemo(() => shareCandidates(items, scope), [items, scope])
  const candidateByKey = useMemo(() => new Map(candidates.map(entry => [entry.key, entry])), [candidates])

  // Le choix d'office se recompose quand la portée change : le mieux noté en tête, puis ses voisins.
  useEffect(() => { setSelection(defaultShareSelection(candidates, scope)) }, [candidates, scope])

  // Les affiches des pastilles suivent la règle de l'application (lien personnel, galerie, TMDB) pour les films.
  useEffect(() => {
    let alive = true
    setThumbs(Object.fromEntries(candidates.map(entry => [entry.key, entry.imageUrl])))
    Promise.all(candidates.map(async entry => [entry.key, entry.library === 'films' ? await resolveFilmDisplayPoster(entry.id, entry.imageUrl).catch(() => entry.imageUrl) : entry.imageUrl] as const))
      .then(entries => { if (alive) setThumbs(Object.fromEntries(entries)) })
    return () => { alive = false }
  }, [candidates])

  // Les propositions de personnes suivent la portée : tout se recompose quand elle change.
  const peopleOptions = useMemo(() => peopleOptionsFor(scope), [scope])
  useEffect(() => {
    let alive = true
    setSuggestions([])
    setChosenIds([])
    setCharacters([])
    setPortraits({})
    setMissingTmdb(false)
    const spread = scope.kind === 'profile'
    const apply = (list: SharePerson[]) => { if (alive) { setSuggestions(list); setChosenIds(defaultPeopleIds(list, spread)) } }
    if (items.length === 0) { setLoadingPeople(false); return () => { alive = false } }
    // Auteurs et studios se lisent sur les fiches, sans attente ; sur le profil, ils suivent le réalisateur et les acteurs.
    const creatorRole = peopleOptions.roles.includes('studio') ? 'studio' : peopleOptions.roles.includes('author') ? 'author' : null
    const creators = spread ? rankProfileCreators(items) : creatorRole && scope.kind === 'library' ? rankCreators(items, scope, creatorRole) : []
    if (peopleOptions.roles.includes('director')) {
      setLoadingPeople(true)
      loadFilmCredits(items.filter(entry => entry.library === 'films' && entry.done))
        .then(credits => {
          if (!alive) return
          const ranked = rankFilmPeople(credits)
          // Sur le profil, deux réalisateurs et trois acteurs suffisent : les autres bibliothèques ont aussi leur place.
          const directors = spread ? ranked.directors.slice(0, 2) : ranked.directors
          const actors = spread ? ranked.actors.slice(0, 3) : ranked.actors
          setMissingTmdb(credits.some(entry => entry.tmdbId === null))
          apply([...directors, ...actors, ...creators])
          setLoadingPeople(false)
          // Les photos des réalisateurs demandent TMDB : elles arrivent après, la carte se redessine alors.
          void loadDirectorPortraits(directors).then(found => { if (alive) setPortraits(found) })
        })
        .catch(error => {
          console.error('Impossible de lire les acteurs et les réalisateurs.', error)
          if (alive) { apply(creators); setLoadingPeople(false) }
        })
    } else {
      setLoadingPeople(false)
      apply(creators)
    }
    return () => { alive = false }
  }, [items, scope, peopleOptions])

  /** Les personnes que la carte montre : les cases cochées avec leur photo, puis les personnages saisis. */
  const cardPeople = useMemo(() => orderPeople([
    ...suggestions.filter(person => chosenIds.includes(person.id)).map(person => ({ ...person, portraitUrl: portraits[person.id] ?? person.portraitUrl })),
    ...normalizeCharacters(characters),
  ]), [suggestions, chosenIds, portraits, characters])
  const peopleKey = cardPeople.map(person => `${person.id}|${person.portraitUrl ?? ''}`).join(',')

  const hasPeopleStep = peopleOptions.roles.length > 0 || peopleOptions.characters
  const steps = useMemo<StepId[]>(() => [
    'hero',
    ...(candidates.length > 1 ? ['others' as const] : []),
    ...(hasPeopleStep ? ['people' as const] : []),
    'stats',
    'share',
  ], [candidates.length, hasPeopleStep])
  const stepIndex = Math.max(0, steps.indexOf(step))
  useEffect(() => { if (!steps.includes(step)) setStep('hero') }, [steps, step])

  const selectionKey = selection.join(',')
  const statsKey = `${statsChoice.done ? 1 : 0}${statsChoice.year ? 1 : 0}${statsChoice.average ? 1 : 0}`

  /** Dessine la carte de la portée courante dans le format demandé ; `null` quand il n'y a rien à montrer. */
  const draw = (formatId: ShareFormatId): Promise<Drawn | null> => {
    const key = `${value}|${formatId}|${selectionKey}|${statsKey}|${peopleKey}`
    const cached = drawn.current.get(key)
    if (cached) return cached
    const shareFormat = SHARE_FORMATS[formatId]
    const base = buildShareCard(items, scope, library?.profile.name ?? '', { limits: shareLimitsFor(shareFormat, scope), selection, stats: statsChoice, people: cardPeople })
    const pending: Promise<Drawn | null> = base.isEmpty
      ? Promise.resolve(null)
      : withDisplayedImages(base, entry => (entry.library === 'films' ? resolveFilmDisplayPoster(entry.id, entry.imageUrl) : Promise.resolve(entry.imageUrl)))
        .then(async model => ({ model, rendered: await renderShareCard(model, shareFormat, { loadImage: loadShareCardImage }) }))
    pending.catch(() => drawn.current.delete(key))
    if (drawn.current.size >= 6) drawn.current.clear()
    drawn.current.set(key, pending)
    return pending
  }

  useEffect(() => {
    if (!library) return
    let alive = true
    setPreview({ status: 'loading' })
    setMessage(null)
    draw(format)
      .then(result => { if (alive) setPreview(result ? { status: 'ready', ...result } : { status: 'empty' }) })
      .catch(error => { console.error('Impossible de dessiner la carte.', error); if (alive) setPreview({ status: 'failed' }) })
    return () => { alive = false }
    // `scope` est dérivé de `value` : seuls la portée, le format, le choix et les chiffres déclenchent un nouveau dessin.
  }, [library, items, value, format, selectionKey, statsKey, peopleKey])

  useEffect(() => {
    const node = host.current
    if (!node) return
    if (preview.status === 'ready') {
      const { canvas } = preview.rendered
      canvas.className = 'share-card-canvas'
      canvas.setAttribute('role', 'img')
      canvas.setAttribute('aria-label', t('Aperçu de la carte à partager'))
      node.replaceChildren(canvas)
    } else {
      node.replaceChildren()
    }
  }, [preview])

  /** PNG de la carte au format demandé, prêt à être copié ou enregistré. */
  const renderPng = (formatId: ShareFormatId) => async () => {
    const result = await draw(formatId)
    if (!result) throw new Error('Carte vide')
    return canvasToPng(result.rendered.canvas)
  }
  const fileNameFor = (formatId: ShareFormatId) => shareCardFileName(scope, formatId)

  const run = async (action: () => Promise<Message>) => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try { setMessage(await action()) } catch (error) {
      console.error('Impossible de partager la carte.', error)
      setMessage({ kind: 'failed' })
    } finally { setBusy(false) }
  }

  // Les gestes (clic) appellent le presse-papiers sans rien attendre avant : voir shareActions.ts.
  const save = () => run(async () => {
    const saved = await saveShareImage(fileNameFor(format), await renderPng(format)())
    return saved ? { kind: 'saved', file: saved } : { kind: 'cancelled' }
  })
  const copy = () => run(async () => ({ kind: 'share', result: await copyCard(renderPng(format), realDeps()) }))
  const share = (destination: ShareDestination) => {
    setFormat(destination.format)
    return run(async () => ({ kind: 'share', result: await shareToDestination(destination, renderPng(destination.format), realDeps(), fileNameFor(destination.format)) }))
  }

  const missing = preview.status === 'ready' ? preview.rendered.missingImages.length : 0
  const ready = preview.status === 'ready' && !busy
  const heroItem = candidateByKey.get(selection[0] ?? '') ?? null
  const otherCount = Math.max(0, selection.length - 1)
  const maxOthers = MAX_SHARE_FAVORITES - 1
  const thumb = (entry: ShareItem) => thumbs[entry.key] ?? entry.imageUrl

  // Les chiffres proposés, avec leurs valeurs : une carte complète les calcule toutes, le choix les filtre ensuite.
  const allStats = useMemo(() => buildShareCard(items, scope, '', { limits: { favorites: MAX_SHARE_FAVORITES }, stats: ALL_SHARE_STATS }).stats.cells, [items, scope])
  const statChoices: Array<{ id: keyof ShareStatsChoice; label: string; value: string; available: boolean }> = [
    { id: 'done', ...describeStat(allStats.find(cell => cell.format !== 'rating' && !cell.params), 'done') },
    { id: 'year', ...describeStat(allStats.find(cell => cell.params?.year), 'year') },
    { id: 'average', ...describeStat(allStats.find(cell => cell.format === 'rating'), 'average') },
  ]

  const goTo = (offset: number) => setStep(steps[Math.min(steps.length - 1, Math.max(0, stepIndex + offset))])

  const nothingToShow = library !== null && candidates.length === 0

  return (
    <AccessibleDialog
      title={scope.kind === 'profile' ? t('Partager mon profil') : t('Partager mes coups de cœur')}
      description={t('Choisissez les coups de cœur à mettre en avant : une image PNG à envoyer ou à publier. Rien n’est envoyé en ligne.')}
      closeDisabled={busy}
      onClose={onClose}
      size="lg"
    >
      <div className="assistant-content share-card-dialog">
        <div className="share-card-controls">
          {nothingToShow ? (
            <>
              <p className="inline-report" role="status">{t('Pas encore de coup de cœur à mettre en avant : marquez une œuvre comme coup de cœur depuis sa fiche, puis revenez créer votre carte.')}</p>
              <div className="assistant-actions">
                <button className="secondary-button" type="button" onClick={onClose}>{t('Fermer')}</button>
              </div>
            </>
          ) : (
            <>
              <ol className="share-steps" aria-label={t('Étapes')}>
                {steps.map((id, index) => (
                  <li key={id} aria-current={id === step ? 'step' : undefined} data-done={index < stepIndex || undefined}>
                    <button type="button" disabled={busy || !library} onClick={() => setStep(id)}>
                      <span className="share-step-number" aria-hidden="true">{index + 1}</span>
                      <span>{t(STEP_LABELS[id])}</span>
                    </button>
                  </li>
                ))}
              </ol>

              {step === 'hero' && (
                <section className="share-step-body" aria-labelledby="share-step-title">
                  <h3 id="share-step-title">{t('Votre coup de cœur principal')}</h3>
                  <p className="field-hint">{t('C’est l’affiche en grand sur la carte.')}</p>
                  {!initialLibrary && choices.length > 1 && (
                    <div className="field">
                      <label htmlFor="share-card-scope">{t('Contenu de la carte')}</label>
                      <select id="share-card-scope" value={value} disabled={!library || busy} onChange={event => setValue(event.target.value)}>
                        <option value={PROFILE_VALUE}>{t('Tout le profil')}</option>
                        {choices.flatMap(choice => (choice.kind === 'library' ? [<option key={choice.library} value={choice.library}>{t(choice.label)}</option>] : []))}
                      </select>
                    </div>
                  )}
                  <div className="share-picker" role="radiogroup" aria-labelledby="share-step-title">
                    {candidates.map(entry => (
                      <PosterChoice key={entry.key} item={entry} image={thumb(entry)} type="radio" name="share-hero" checked={entry.key === selection[0]} disabled={busy} showKind={scope.kind === 'profile'} onChange={() => setSelection(current => setShareHero(current, entry.key))} />
                    ))}
                  </div>
                  {heroItem && <p className="share-picked" role="status">{t('Mis en avant : {title}', { title: heroItem.title })}</p>}
                </section>
              )}

              {step === 'others' && (
                <section className="share-step-body" aria-labelledby="share-step-title">
                  <h3 id="share-step-title">{t('Vos autres coups de cœur')}</h3>
                  <p className="field-hint">{t('Jusqu’à {count} autres, à côté de l’affiche principale.', { count: maxOthers })}</p>
                  <div className="share-picker" role="group" aria-labelledby="share-step-title">
                    {candidates.filter(entry => entry.key !== selection[0]).map(entry => {
                      const checked = selection.includes(entry.key)
                      return (
                        <PosterChoice key={entry.key} item={entry} image={thumb(entry)} type="checkbox" name="share-others" checked={checked} disabled={busy || (!checked && otherCount >= maxOthers)} showKind={scope.kind === 'profile'} onChange={() => setSelection(current => toggleShareOther(current, entry.key))} />
                      )
                    })}
                  </div>
                  <p className="share-picked" role="status">{t('{count} sur {max} choisis', { count: otherCount, max: maxOthers })}</p>
                </section>
              )}

              {step === 'people' && (
                <SharePeopleStep
                  library={scope.kind === 'library' ? scope.library : 'books'}
                  suggestions={suggestions}
                  loading={loadingPeople}
                  needsTmdbHint={peopleOptions.roles.includes('actor') && missingTmdb}
                  portraits={portraits}
                  chosenIds={chosenIds}
                  characters={normalizeCharacters(characters).map(person => person.name)}
                  allowCharacters={peopleOptions.characters}
                  disabled={busy}
                  onToggle={id => setChosenIds(current => (current.includes(id) ? current.filter(other => other !== id) : [...current, id]))}
                  onAddCharacter={name => setCharacters(current => normalizeCharacters([...current, name]).map(person => person.name))}
                  onRemoveCharacter={name => setCharacters(current => current.filter(other => other !== name))}
                />
              )}

              {step === 'stats' && (
                <section className="share-step-body" aria-labelledby="share-step-title">
                  <h3 id="share-step-title">{t('Les chiffres sous les affiches')}</h3>
                  <p className="field-hint">{t('Gardez ceux qui vous parlent.')}</p>
                  <div className="share-stat-options">
                    {statChoices.map(choice => (
                      <label key={choice.id} className="share-stat-option" data-disabled={!choice.available || undefined}>
                        <input type="checkbox" checked={choice.available && statsChoice[choice.id]} disabled={busy || !choice.available} onChange={event => setStatsChoice(current => ({ ...current, [choice.id]: event.target.checked }))} />
                        <b>{choice.value}</b>
                        <span>{choice.label}</span>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {step === 'share' && (
                <section className="share-step-body" aria-labelledby="share-step-title">
                  <h3 id="share-step-title">{t('Format et partage')}</h3>
                  <div className="field">
                    <span className="field-label" id="share-card-format-label">{t('Format de l’image')}</span>
                    <div className="share-format-options" role="radiogroup" aria-labelledby="share-card-format-label">
                      {SHARE_FORMAT_ORDER.map(id => (
                        <button key={id} type="button" role="radio" aria-checked={format === id} className="share-format-option" disabled={busy} onClick={() => setFormat(id)}>
                          <b>{t(FORMAT_COPY[id].name)} · {FORMAT_COPY[id].ratio}</b>
                          <small>{t(FORMAT_COPY[id].hint)}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="assistant-actions">
                    <button className="primary-button" type="button" disabled={!ready} onClick={() => void save()}>
                      {busy ? t('Enregistrement…') : t('Enregistrer l’image')}
                    </button>
                    <button className="secondary-button" type="button" disabled={!ready} onClick={() => void copy()}>{t('Copier l’image')}</button>
                  </div>
                  <div className="field share-destinations">
                    <span className="field-label" id="share-card-destinations-label">{t('Partager vers')}</span>
                    <div className="share-destination-buttons" role="group" aria-labelledby="share-card-destinations-label">
                      {SHARE_DESTINATIONS.map(destination => (
                        <button key={destination.id} className="secondary-button" type="button" disabled={!library || busy || preview.status === 'empty'} onClick={() => void share(destination)}>
                          {destination.name}
                        </button>
                      ))}
                    </div>
                    <small className="field-hint">{t('Choisit le bon format, copie l’image et ouvre le service : il ne reste qu’à la coller.')}</small>
                  </div>
                </section>
              )}

              {preview.status === 'loading' && <p role="status">{t('Composition de la carte…')}</p>}
              {preview.status === 'failed' && <p className="inline-report error" role="alert">{t('La carte n’a pas pu être composée.')}</p>}
              {missing > 0 && <p className="inline-report" role="status">{missing === 1 ? t('1 image n’a pas pu être chargée : sa tuile affiche le titre.') : t('{count} images n’ont pas pu être chargées : leurs tuiles affichent le titre.', { count: missing })}</p>}
              {message && <p className={`inline-report${isFailure(message) ? ' error' : ''}`} role={isFailure(message) ? 'alert' : 'status'}>{messageText(message)}</p>}

              <div className="assistant-actions share-nav">
                <button className="secondary-button" type="button" disabled={busy || stepIndex === 0} onClick={() => goTo(-1)}>{t('Précédent')}</button>
                {stepIndex < steps.length - 1
                  ? <button className="primary-button" type="button" disabled={busy || !library} onClick={() => goTo(1)}>{t('Continuer')}</button>
                  : <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{t('Fermer')}</button>}
              </div>
            </>
          )}
        </div>
        {!nothingToShow && <div className="share-card-preview" ref={host} aria-busy={preview.status === 'loading'} />}
      </div>
    </AccessibleDialog>
  )
}

/** Valeur et légende d'un chiffre proposé à l'étape « Chiffres » ; la note moyenne manque quand rien n'est noté. */
function describeStat(cell: ShareCardModel['stats']['cells'][number] | undefined, id: keyof ShareStatsChoice): { label: string; value: string; available: boolean } {
  if (!cell) return { label: t('Aucune note pour l’instant'), value: '–', available: false }
  const value = cell.format === 'rating'
    ? `${formatNumber(cell.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ★`
    : formatNumber(cell.value)
  return { label: t(id === 'average' ? 'note moyenne' : cell.label, cell.params), value, available: true }
}

/** Bouton qui ouvre la fenêtre : réglages, et toute page qui propose la carte sans passer par l'export. */
export function ShareCardLauncher({ profileId, initialLibrary, className = 'secondary-button', withIcon = false }: { profileId: string; initialLibrary?: ShareLibraryKey; className?: string; withIcon?: boolean }) {
  useLanguage()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={className} type="button" onClick={() => setOpen(true)}>
        {withIcon && <ShareIcon />}
        {initialLibrary ? t('Partager mes coups de cœur') : t('Partager mon profil')}
      </button>
      {/* Hors de l'arbre du bouton : sinon la fenêtre hérite des styles de la barre qui l'accueille (texte sur une ligne, conteneur). */}
      {open && createPortal(<ShareCardDialog profileId={profileId} initialLibrary={initialLibrary} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

/**
 * L'entrée de la carte sur la page d'une bibliothèque : un lien discret sous le titre, à côté du
 * décompte, et non un bouton de plus dans la rangée des actions (ajouter, importer, exporter).
 */
export function ShareCardLink({ profileId, library }: { profileId: string; library: ShareLibraryKey }) {
  useLanguage()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="share-card-link" type="button" onClick={() => setOpen(true)}>
        <ShareIcon />
        <span>{t('Partager mes coups de cœur')}</span>
      </button>
      {open && createPortal(<ShareCardDialog profileId={profileId} initialLibrary={library} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}
