import { useRef, useState } from 'react'
import { useDialogFocus } from './FocusDialog.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'

type TmdbPosterDialogProps = {
  title: string
  posters: string[]
  selectedUrl: string | null
  saving: boolean
  onSelect: (url: string | null) => void
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
  onClose,
}: TmdbPosterDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [customUrl, setCustomUrl] = useState<string | null>(null)

  useDialogFocus(dialogRef, onClose, saving || addOpen)

  const currentUrl = customUrl ?? selectedUrl ?? posters[0] ?? null

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
            <h2 id="poster-dialog-title">Choisir une affiche</h2>
            <button
              className="poster-dialog-close"
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label="Fermer"
            >
              ×
            </button>
          </header>

          <p className="poster-dialog-film">{title}</p>

          <div className="poster-dialog-grid" role="group" aria-label="Affiches disponibles">
            {/* Tuile « Ajouter une affiche » : toujours en tête de liste */}
            <button
              className="poster-dialog-item poster-dialog-add"
              type="button"
              onClick={() => setAddOpen(true)}
              disabled={saving}
              aria-label="Ajouter une affiche depuis une URL"
              title="Ajouter une affiche depuis une URL"
            >
              <span aria-hidden="true" className="poster-dialog-add-plus">+</span>
              <small>Ajouter</small>
            </button>
            {posters.map((url) => (
              <button
                key={url}
                className={`poster-dialog-item ${currentUrl === url ? 'active' : ''}`}
                type="button"
                onClick={() => onSelect(url)}
                disabled={saving}
                aria-pressed={currentUrl === url}
                aria-label={currentUrl === url ? 'Affiche actuellement choisie' : 'Choisir cette affiche'}
              >
                <img src={url} alt="" loading="lazy" />
                {currentUrl === url && <span className="poster-dialog-check" aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>

          <footer className="poster-dialog-footer">
            <p className="poster-dialog-attribution">
              Affiches fournies par{' '}
              <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>.
            </p>
            <div className="poster-dialog-actions">
              {(selectedUrl !== null || customUrl !== null) && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => { setCustomUrl(null); onSelect(null) }}
                  disabled={saving}
                  title="Revenir à l'affiche principale du fournisseur"
                >
                  Affiche par défaut
                </button>
              )}
              {/* Valider applique la sélection courante puis ferme */}
              <button
                className="primary-button"
                type="button"
                disabled={saving || currentUrl === null}
                onClick={() => { if (customUrl) onSelect(customUrl); onClose() }}
              >
                {saving ? 'Enregistrement…' : 'Valider'}
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
          onSave={(url) => {
            setCustomUrl(url)
            if (url) onSelect(url)
          }}
        />
      )}
    </>
  )
}
