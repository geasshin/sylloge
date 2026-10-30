import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n/core.ts'
import type { BannerCandidate, BannerMedium } from '../data/bannerService.ts'
import { isBannerUrl, normalizeBannerUrl, bannerCropWarning } from '../domain/bannerImages.ts'
import { useDialogFocus } from './FocusDialog.tsx'
import { useImageRatio } from './useImageRatio.ts'

const PROVIDER_LABELS = {
  tmdb: 'TMDB',
  igdb: 'IGDB',
} as const

/** Adresse http(s) à prévisualiser, sinon null. */
function previewableUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

type BannerDialogProps = {
  open: boolean
  title: string
  /** `film`, `series`, `anime` ou `game` : decide du fournisseur cité en pied. */
  medium: BannerMedium
  /** `false` quand la fiche n'a aucun identifiant fournisseur : pas d'images officielles. */
  providerAvailable: boolean
  candidates: BannerCandidate[]
  loading: boolean
  loadError: string | null
  currentUrl: string | null
  onRetry: () => void
  onClose: () => void
  /** Reçoit l'adresse choisie, ou null pour retirer la bannière. */
  onSave: (url: string | null) => Promise<void> | void
}

/**
 * Fenêtre de choix d'une bannière 16:9 : galerie de visuels officiels,
 * adresse collée (avec aperçu recadré et avertissement si l'image est trop
 * verticale) et retrait. Rien n'est retenu avant « Enregistrer » : la
 * sélection ne vit que dans cette fenêtre, et fermer l'abandonne.
 */
export function BannerDialog({ open, ...props }: BannerDialogProps) {
  // Le contenu n'est monté qu'ouvert : le clavier de la fenêtre (Échap, Tab) est
  // posé au montage, et rien n'est retenu d'une ouverture à l'autre.
  if (!open) return null
  return <BannerDialogContent {...props} open={open} />
}

function BannerDialogContent({
  title,
  medium,
  providerAvailable,
  candidates,
  loading,
  loadError,
  currentUrl,
  onRetry,
  onClose,
  onSave,
}: BannerDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // La valeur du champ est la seule source : cliquer une vignette l'y recopie.
  const [value, setValue] = useState(currentUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unreachable, setUnreachable] = useState<string | null>(null)
  useDialogFocus(dialogRef, onClose, saving)

  useEffect(() => {
    setValue(currentUrl ?? '')
    setError(null)
    setUnreachable(null)
  }, [currentUrl])

  const previewUrl = previewableUrl(value)
  const [previewRatio, onPreviewLoad] = useImageRatio(previewUrl)
  const tooVertical = previewUrl !== null && unreachable !== previewUrl && bannerCropWarning(previewRatio)
  const chosen = normalizeBannerUrl(value)
  const invalid = chosen !== null && !isBannerUrl(chosen)

  const provider = medium === 'game' ? PROVIDER_LABELS.igdb : PROVIDER_LABELS.tmdb

  const save = async () => {
    const trimmed = normalizeBannerUrl(value)
    if (trimmed !== null && !isBannerUrl(trimmed)) {
      setError('Une bannière doit être l’adresse https d’une image.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(trimmed)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('L’enregistrement a échoué.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="transfer-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="transfer-dialog dialog-lg banner-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="banner-dialog-title"
        aria-describedby="banner-dialog-description"
        tabIndex={-1}
      >
        <header className="transfer-dialog-header">
          <div>
            <h2 id="banner-dialog-title">{t('Choisir une bannière')}</h2>
            <p id="banner-dialog-description">{t('Une image paysage pour « {title} ».', { title })}</p>
          </div>
          <button className="dialog-close" type="button" disabled={saving} onClick={onClose} aria-label={t('Fermer')}>
            ×
          </button>
        </header>

        <div className="banner-dialog-body">
          <section className="banner-dialog-gallery" aria-label={t('Images officielles')}>
            {!providerAvailable ? (
              <p className="banner-dialog-note" role="status">
                {t('Aucune image officielle : cette fiche n’est associée à aucun fournisseur. Vous pouvez coller l’adresse d’une image.')}
              </p>
            ) : loading ? (
              <p className="banner-dialog-note" role="status">{t('Chargement des images officielles…')}</p>
            ) : loadError ? (
              <div className="banner-dialog-note" role="alert">
                <p>{t('Les images officielles n’ont pas pu être chargées.')}</p>
                <button className="secondary-button" type="button" onClick={onRetry} disabled={saving}>
                  {t('Réessayer')}
                </button>
              </div>
            ) : candidates.length === 0 ? (
              <p className="banner-dialog-note" role="status">
                {t('Aucune image officielle au format bannière. Vous pouvez coller l’adresse d’une image.')}
              </p>
            ) : (
              <ul className="banner-dialog-grid">
                {candidates.map((candidate) => {
                  const active = chosen === candidate.url
                  return (
                    <li key={candidate.url}>
                      <button
                        className={`banner-dialog-item ${active ? 'active' : ''}`}
                        type="button"
                        aria-pressed={active}
                        aria-label={active ? t('Bannière actuellement choisie') : t('Choisir cette bannière')}
                        title={candidate.language ? t('Image avec du texte en {language}', { language: candidate.language }) : t('Image sans texte')}
                        disabled={saving}
                        onClick={() => { setValue(candidate.url); setUnreachable(null); setError(null) }}
                      >
                        <img src={candidate.thumbnailUrl} alt="" loading="lazy" />
                        {active && <span className="banner-dialog-check" aria-hidden="true">✓</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="banner-dialog-address">
            <label className="field">
              <span>{t('Adresse de l’image')}</span>
              <input
                type="url"
                value={value}
                placeholder="https://…"
                onChange={(event) => { setValue(event.target.value); setError(null); setUnreachable(null) }}
                disabled={saving}
              />
            </label>
            <p className="import-hint">{t('Une adresse https suffit : rien n’est téléchargé dans Sylloge.')}</p>

            {previewUrl && (
              <div className="banner-dialog-preview" data-state={unreachable === previewUrl ? 'unreachable' : 'ready'}>
                {unreachable === previewUrl ? (
                  <p role="status">{t('Cette adresse ne semble pas mener à une image.')}</p>
                ) : (
                  <img src={previewUrl} alt="" onError={() => setUnreachable(previewUrl)} onLoad={(event) => onPreviewLoad(event.currentTarget)} />
                )}
              </div>
            )}
            {tooVertical && (
              <p className="banner-dialog-warning" role="status">
                {t('Cette image est plus haute que large : recadrée en 16:9, elle perdra une grande partie de son cadre.')}
              </p>
            )}
            {invalid && (
              <p className="validation-errors" role="alert">
                {t('Une bannière doit être l’adresse https d’une image.')}
              </p>
            )}
          </section>
        </div>

        <footer className="banner-dialog-footer">
          <p className="poster-dialog-attribution">
            {providerAvailable && (
              <>
                {t('Images fournies par')}{' '}
                <a
                  href={medium === 'game' ? 'https://www.igdb.com' : 'https://www.themoviedb.org'}
                  target="_blank"
                  rel="noreferrer"
                >
                  {provider}
                </a>
                .
              </>
            )}
          </p>
          <div className="poster-dialog-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => { setValue(''); setUnreachable(null); setError(null) }}
              disabled={saving || normalizeBannerUrl(value) === null}
            >
              {t('Retirer la bannière')}
            </button>
            <button className="primary-button" type="button" onClick={() => void save()} disabled={saving || invalid}>
              {saving ? t('Enregistrement…') : t('Enregistrer')}
            </button>
          </div>
        </footer>

        {error && <p className="validation-errors banner-dialog-error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
