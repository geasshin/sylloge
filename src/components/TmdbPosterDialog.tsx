import { useRef, useState } from 'react'
import { t } from '../i18n/core.ts'
import { useDialogFocus } from './FocusDialog.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'

type TmdbPosterDialogProps = {
  title: string
  posters: string[]
  selectedUrl: string | null
  saving: boolean
  onSelect: (url: string | null) => void
  /**
   * Lien collé par la personne. Il ne fait pas partie des affiches du fournisseur : l'envoyer à
   * `onSelect` le ferait refuser par le cache TMDB, qui ne connaît que ses propres affiches.
   */
  onCustom?: (url: string | null) => Promise<void> | void
  onClose: () => void
}

/**
 * Galerie d'affiches du fournisseur + tuile « Ajouter une affiche ».
 * - Sélection immédiate au clic, puis « Valider » pour clôturer.
 * - La tuile à plus ouvre le dialogue d'URL (affiche personnalisée).
 */
export function TmdbPosterDialog({
  title,
  posters,
  selectedUrl,
  saving,
  onSelect,
  onCustom,
  onClose,
}: TmdbPosterDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [customUrl, setCustomUrl] = useState<string | null>(null)

  useDialogFocus(dialogRef, onClose, saving || addOpen)

  const currentUrl = customUrl ?? selectedUrl ?? posters[0] ?? null
  // Le lien personnel n'est pas dans la liste du fournisseur : sans tuile, le choix actif serait invisible.
  const customTile = currentUrl !== null && !posters.includes(currentUrl) ? currentUrl : null

  return (
    <>
      <div
        className="poster-dialog-backdrop"
        onClick={() => { if (!saving) onClose() }}
        role="presentation"
      >
        <div
          ref={dialogRef}
          className="poster-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="poster-dialog-title"
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="poster-dialog-header">
            <h2 id="poster-dialog-title">{t('Choisir une affiche')}</h2>
            <button
              className="poster-dialog-close"
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label={t("Fermer")}
            >
              ×
            </button>
          </header>

          <p className="poster-dialog-film">{title}</p>

          <div className="poster-dialog-grid" role="group" aria-label={t("Affiches disponibles")}>
            {/* Tuile « Ajouter une affiche » : toujours en tête de liste */}
            <button
              className="poster-dialog-item poster-dialog-add"
              type="button"
              onClick={() => setAddOpen(true)}
              disabled={saving}
              aria-label={t("Ajouter une affiche depuis une URL")}
              title={t("Ajouter une affiche depuis une URL")}
            >
              <span aria-hidden="true" className="poster-dialog-add-plus">+</span>
              <small>{t("Ajouter")}</small>
            </button>
            {customTile && (
              <button
                className="poster-dialog-item active"
                type="button"
                aria-pressed="true"
                aria-label={t('Affiche actuellement choisie')}
                disabled={saving}
              >
                <img src={customTile} alt="" loading="lazy" />
                <span className="poster-dialog-check" aria-hidden="true">✓</span>
              </button>
            )}
            {posters.map((url) => (
              <button
                key={url}
                className={`poster-dialog-item ${currentUrl === url ? 'active' : ''}`}
                type="button"
                onClick={() => onSelect(url)}
                disabled={saving}
                aria-pressed={currentUrl === url}
                aria-label={currentUrl === url ? t('Affiche actuellement choisie') : t('Choisir cette affiche')}
              >
                <img src={url} alt="" loading="lazy" />
                {currentUrl === url && <span className="poster-dialog-check" aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>

          <footer className="poster-dialog-footer">
            <p className="poster-dialog-attribution">
              {t("Affiches fournies par")}{' '}
              <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>.
            </p>
            <div className="poster-dialog-actions">
              {(selectedUrl !== null || customUrl !== null) && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => { setCustomUrl(null); onSelect(null) }}
                  disabled={saving}
                  title={t("Revenir à l'affiche principale du fournisseur")}
                >
                  {t("Affiche par défaut")}
                </button>
              )}
              {/* Valider applique la sélection courante puis ferme */}
              <button
                className="primary-button"
                type="button"
                disabled={saving || currentUrl === null}
                onClick={() => { if (customUrl && !onCustom) onSelect(customUrl); onClose() }}
              >
                {saving ? t("Enregistrement…") : t("Valider")}
              </button>
            </div>
          </footer>
        </div>
      </div>
      {addOpen && (
        <PosterUrlDialog
          open
          title={title}
          label="Affiche"
          currentUrl={currentUrl}
          onClose={() => setAddOpen(false)}
          onSave={async (url) => {
            setCustomUrl(url)
            if (onCustom) await onCustom(url)
            else if (url) onSelect(url)
          }}
        />
      )}
    </>
  )
}
