import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../i18n/core.ts'
import { useLanguage } from '../i18n/react.ts'
import { libraryRepository, type CulturalLibrary } from '../data/libraryRepository.ts'
import { resolveFilmDisplayPoster } from '../data/tmdbService.ts'
import { saveShareImage } from '../data/nativePortability.ts'
import { openExternalUrl } from '../data/externalLinks.ts'
import { copyCard, shareToDestination, type ShareDeps, type ShareResult } from '../data/shareActions.ts'
import {
  buildShareCard,
  collectShareItems,
  shareScopes,
  withDisplayedImages,
  type ShareCardModel,
  type ShareLibraryKey,
  type ShareScope,
} from '../domain/shareCard.ts'
import { shareLimitsFor } from '../domain/shareCardLayout.ts'
import { SHARE_DESTINATIONS, SHARE_FORMATS, SHARE_FORMAT_ORDER, type ShareDestination, type ShareFormatId } from '../domain/shareFormats.ts'
import { AccessibleDialog } from './AccessibleDialog.tsx'
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

/**
 * Carte à partager : une image PNG qui résume une bibliothèque ou tout le profil (coups de cœur et
 * derniers terminés), au format standard ou story, à enregistrer, copier ou envoyer vers un service.
 * Le dessin se fait sur la machine ; rien n'est envoyé en ligne.
 */
export function ShareCardDialog({ profileId, initialLibrary, onClose }: Props) {
  useLanguage()
  const [library, setLibrary] = useState<CulturalLibrary | null>(null)
  const [value, setValue] = useState<string>(initialLibrary ?? PROFILE_VALUE)
  const [format, setFormat] = useState<ShareFormatId>('standard')
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
  const scope: ShareScope = value === PROFILE_VALUE ? { kind: 'profile' } : { kind: 'library', library: value as ShareLibraryKey }

  /** Dessine la carte de la portée courante dans le format demandé ; `null` quand il n'y a rien à montrer. */
  const draw = (formatId: ShareFormatId): Promise<Drawn | null> => {
    const key = `${value}|${formatId}`
    const cached = drawn.current.get(key)
    if (cached) return cached
    const shareFormat = SHARE_FORMATS[formatId]
    const base = buildShareCard(items, scope, library?.profile.name ?? '', { limits: shareLimitsFor(shareFormat, scope) })
    const pending: Promise<Drawn | null> = base.isEmpty
      ? Promise.resolve(null)
      : withDisplayedImages(base, entry => (entry.library === 'films' ? resolveFilmDisplayPoster(entry.id, entry.imageUrl) : Promise.resolve(entry.imageUrl)))
        .then(async model => ({ model, rendered: await renderShareCard(model, shareFormat) }))
    pending.catch(() => drawn.current.delete(key))
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
    // `scope` est dérivé de `value` : seuls `value` et `format` déclenchent un nouveau dessin.
  }, [library, items, value, format])

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

  return (
    <AccessibleDialog
      title={t('Carte à partager')}
      description={t('Une image PNG de vos coups de cœur et de vos derniers terminés, à envoyer ou à publier. Rien n’est envoyé en ligne.')}
      closeDisabled={busy}
      onClose={onClose}
      size="lg"
    >
      <div className="assistant-content share-card-dialog">
        <div className="share-card-controls">
          <div className="field">
            <label htmlFor="share-card-scope">{t('Contenu de la carte')}</label>
            <select id="share-card-scope" value={value} disabled={!library || busy} onChange={event => setValue(event.target.value)}>
              <option value={PROFILE_VALUE}>{t('Tout le profil')}</option>
              {choices.flatMap(choice => (choice.kind === 'library' ? [<option key={choice.library} value={choice.library}>{t(choice.label)}</option>] : []))}
            </select>
          </div>

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

          {preview.status === 'loading' && <p role="status">{t('Composition de la carte…')}</p>}
          {preview.status === 'empty' && <p className="inline-report" role="status">{t('Pas encore de quoi composer une carte : ajoutez un coup de cœur ou une œuvre terminée.')}</p>}
          {preview.status === 'failed' && <p className="inline-report error" role="alert">{t('La carte n’a pas pu être composée.')}</p>}
          {missing > 0 && <p className="inline-report" role="status">{missing === 1 ? t('1 image n’a pas pu être chargée : sa tuile affiche le titre.') : t('{count} images n’ont pas pu être chargées : leurs tuiles affichent le titre.', { count: missing })}</p>}
          {message && <p className={`inline-report${isFailure(message) ? ' error' : ''}`} role={isFailure(message) ? 'alert' : 'status'}>{messageText(message)}</p>}

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

          <div className="assistant-actions">
            <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{t('Fermer')}</button>
          </div>
        </div>
        <div className="share-card-preview" ref={host} aria-busy={preview.status === 'loading'} />
      </div>
    </AccessibleDialog>
  )
}

/** Bouton qui ouvre la fenêtre : réglages, et toute page qui propose la carte sans passer par l'export. */
export function ShareCardLauncher({ profileId, initialLibrary }: { profileId: string; initialLibrary?: ShareLibraryKey }) {
  useLanguage()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="secondary-button" type="button" onClick={() => setOpen(true)}>{t('Créer une carte')}</button>
      {open && <ShareCardDialog profileId={profileId} initialLibrary={initialLibrary} onClose={() => setOpen(false)} />}
    </>
  )
}
