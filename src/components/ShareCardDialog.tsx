import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../i18n/core.ts'
import { useLanguage } from '../i18n/react.ts'
import { libraryRepository, type CulturalLibrary } from '../data/libraryRepository.ts'
import { resolveFilmDisplayPoster } from '../data/tmdbService.ts'
import { saveShareImage } from '../data/nativePortability.ts'
import {
  buildShareCard,
  collectShareItems,
  shareScopes,
  withDisplayedImages,
  type ShareCardModel,
  type ShareLibraryKey,
  type ShareScope,
} from '../domain/shareCard.ts'
import { AccessibleDialog } from './AccessibleDialog.tsx'
import { canvasToPng, renderShareCard, shareCardFileName, type RenderedShareCard } from './shareCardImage.ts'

type Props = {
  profileId: string
  /** Bibliothèque à montrer d'emblée ; sans elle, la carte du profil entier. */
  initialLibrary?: ShareLibraryKey
  onClose: () => void
}

type Message = { kind: 'saved'; file: string } | { kind: 'cancelled' } | { kind: 'failed' }
type Preview =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'failed' }
  | { status: 'ready'; model: ShareCardModel; rendered: RenderedShareCard }

const PROFILE_VALUE = 'profile'

function messageText(message: Message): string {
  if (message.kind === 'saved') return t('Image enregistrée dans « {file} ».', { file: message.file })
  if (message.kind === 'cancelled') return t('Enregistrement annulé. Aucun fichier n’a été écrit.')
  return t('Impossible d’enregistrer l’image. Aucun fichier n’a été écrit.')
}

/**
 * Carte à partager : une image PNG qui résume une bibliothèque ou tout le profil (coups de cœur,
 * mieux notés, terminés récemment). Le dessin se fait sur la machine ; rien n'est envoyé en ligne.
 */
export function ShareCardDialog({ profileId, initialLibrary, onClose }: Props) {
  useLanguage()
  const [library, setLibrary] = useState<CulturalLibrary | null>(null)
  const [value, setValue] = useState<string>(initialLibrary ?? PROFILE_VALUE)
  const [preview, setPreview] = useState<Preview>({ status: 'loading' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    libraryRepository.loadLibrary(profileId).then(
      loaded => { if (alive) setLibrary(loaded) },
      error => { console.error('Impossible de lire la bibliothèque pour la carte.', error); if (alive) setPreview({ status: 'failed' }) },
    )
    return () => { alive = false }
  }, [profileId])

  const items = useMemo(() => (library ? collectShareItems(library) : []), [library])
  const choices = useMemo(() => (library ? shareScopes(library) : []), [library])
  const scope: ShareScope = value === PROFILE_VALUE ? { kind: 'profile' } : { kind: 'library', library: value as ShareLibraryKey }

  // Une même demande ne dessine qu'une fois ; une réponse tardive d'une portée abandonnée est ignorée.
  useEffect(() => {
    if (!library) return
    let alive = true
    setPreview({ status: 'loading' })
    setMessage(null)
    const base = buildShareCard(items, scope, library.profile.name)
    if (base.isEmpty) { setPreview({ status: 'empty' }); return () => { alive = false } }
    withDisplayedImages(base, entry => (entry.library === 'films' ? resolveFilmDisplayPoster(entry.id, entry.imageUrl) : Promise.resolve(entry.imageUrl)))
      .then(async model => ({ model, rendered: await renderShareCard(model) }))
      .then(({ model, rendered }) => { if (alive) setPreview({ status: 'ready', model, rendered }) })
      .catch(error => { console.error('Impossible de dessiner la carte.', error); if (alive) setPreview({ status: 'failed' }) })
    return () => { alive = false }
    // `scope` est dérivé de `value` : seul `value` déclenche un nouveau dessin.
  }, [library, items, value])

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

  const save = async () => {
    if (preview.status !== 'ready' || saving) return
    setSaving(true)
    setMessage(null)
    try {
      const png = await canvasToPng(preview.rendered.canvas)
      const saved = await saveShareImage(shareCardFileName(preview.model), png)
      setMessage(saved ? { kind: 'saved', file: saved } : { kind: 'cancelled' })
    } catch (error) {
      console.error('Impossible d’enregistrer la carte à partager.', error)
      setMessage({ kind: 'failed' })
    } finally {
      setSaving(false)
    }
  }

  const missing = preview.status === 'ready' ? preview.rendered.missingImages.length : 0

  return (
    <AccessibleDialog
      title={t('Carte à partager')}
      description={t('Une image PNG de vos coups de cœur, de vos mieux notés et de vos derniers terminés, à envoyer ou à publier. Rien n’est envoyé en ligne.')}
      closeDisabled={saving}
      onClose={onClose}
      size="lg"
    >
      <div className="assistant-content share-card-dialog">
        <div className="share-card-controls">
          <div className="field">
            <label htmlFor="share-card-scope">{t('Contenu de la carte')}</label>
            <select id="share-card-scope" value={value} disabled={!library || saving} onChange={event => setValue(event.target.value)}>
              <option value={PROFILE_VALUE}>{t('Tout le profil')}</option>
              {choices.flatMap(choice => (choice.kind === 'library' ? [<option key={choice.library} value={choice.library}>{t(choice.label)}</option>] : []))}
            </select>
          </div>
          {preview.status === 'loading' && <p role="status">{t('Composition de la carte…')}</p>}
          {preview.status === 'empty' && <p className="inline-report" role="status">{t('Pas encore de quoi composer une carte : ajoutez un coup de cœur, une note ou une œuvre terminée.')}</p>}
          {preview.status === 'failed' && <p className="inline-report error" role="alert">{t('La carte n’a pas pu être composée.')}</p>}
          {missing > 0 && <p className="inline-report" role="status">{missing === 1 ? t('1 image n’a pas pu être chargée : sa tuile affiche le titre.') : t('{count} images n’ont pas pu être chargées : leurs tuiles affichent le titre.', { count: missing })}</p>}
          {message && <p className={`inline-report${message.kind === 'failed' ? ' error' : ''}`} role={message.kind === 'failed' ? 'alert' : 'status'}>{messageText(message)}</p>}
          <div className="assistant-actions">
            <button className="primary-button" type="button" disabled={preview.status !== 'ready' || saving} onClick={() => void save()}>
              {saving ? t('Enregistrement…') : t('Enregistrer l’image')}
            </button>
            <button className="secondary-button" type="button" disabled={saving} onClick={onClose}>{t('Fermer')}</button>
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
