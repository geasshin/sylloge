import { useEffect, useRef } from 'react'

type TmdbPosterDialogProps = {
  title: string
  posters: string[]
  selectedUrl: string | null
  saving: boolean
  onSelect: (url: string | null) => void
  onClose: () => void
}

export function TmdbPosterDialog({
  title,
  posters,
  selectedUrl,
  saving,
  onSelect,
  onClose,
}: TmdbPosterDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, saving])

  const currentUrl = selectedUrl ?? posters[0] ?? null

  return (
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
        onClick={(event) => event.stopPropagation()}
      >
        <header className="poster-dialog-header">
          <div>
            <p className="card-kicker">Métadonnées TMDB</p>
            <h2 id="poster-dialog-title">Choisir une affiche</h2>
          </div>
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
            {selectedUrl !== null && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => onSelect(null)}
                disabled={saving}
              >
                Affiche principale
              </button>
            )}
            <button className="primary-button" type="button" onClick={onClose} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Terminé'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
