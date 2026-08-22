import { useState } from 'react'
import {
  ARTWORK_FORM_LABELS,
  ARTWORK_STATUS_LABELS,
  type Artwork,
} from '../domain/artwork.ts'
import { Poster } from './Poster.tsx'

function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
}

type ArtworkDetailProps = {
  artwork: Artwork
  onBack: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
}

export function ArtworkDetail({ artwork, onBack, onEdit, onDelete }: ArtworkDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const deleteArtwork = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch (error) {
      console.error('Impossible de supprimer l’œuvre.', error)
      setDeleteError('La suppression a échoué. L’œuvre est toujours dans la collection.')
      setDeleting(false)
    }
  }

  return (
    <main className="main detail-page-main">
      <header className="page-action-bar detail-action-bar">
        <button className="back-button" type="button" onClick={onBack}>← Retour à l’Art</button>
        <div className="detail-actions">
          <button className="secondary-button" type="button" onClick={onEdit}>Modifier</button>
          <div className="menu-wrap">
            <button
              className="icon-menu-button"
              type="button"
              aria-label="Plus d’actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              ⋯
            </button>
            {menuOpen && (
              <>
                <div className="menu-overlay" onClick={() => setMenuOpen(false)} />
                <div className="detail-menu" role="menu">
                  <button role="menuitem" type="button" className="danger-item" onClick={() => { setMenuOpen(false); setConfirmingDelete(true) }}>
                    Supprimer cette œuvre…
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <article className="detail-layout">
        <div className="detail-side">
          <div className="poster-container detail-poster-wrap">
            <Poster title={artwork.title} src={artwork.imageUrl} className="detail-poster" label="Visuel" />
          </div>
          <div className="detail-status" role="group" aria-label="Statut">
            {Object.entries(ARTWORK_STATUS_LABELS).map(([key, label]) => (
              <span key={key} className={`seg-pill-static ${key === artwork.status ? 'on' : ''}`}>{label}</span>
            ))}
          </div>
          {artwork.isFavorite && (
            <div className="detail-rate">
              <span className="heart-display on" aria-label="Coup de cœur">♥</span>
            </div>
          )}
        </div>

        <div className="detail-body">
          <p className="eyebrow">{ARTWORK_FORM_LABELS[artwork.form]}</p>
          <h1 className="display-title">{artwork.title}</h1>
          {(artwork.artist || artwork.year !== null) && (
            <p className="detail-factline">
              {[artwork.artist, artwork.year !== null ? String(artwork.year) : null].filter(Boolean).join(' · ')}
            </p>
          )}

          <dl className="detail-facts">
            {artwork.artist && (
              <div><dt>Artiste</dt><dd>{artwork.artist}</dd></div>
            )}
            {artwork.year !== null && (
              <div><dt>Année</dt><dd>{artwork.year}</dd></div>
            )}
            {artwork.location && (
              <div><dt>Lieu</dt><dd>{artwork.location}</dd></div>
            )}
            {artwork.exhibition && (
              <div><dt>Exposition</dt><dd>{artwork.exhibition}</dd></div>
            )}
            {artwork.discoveredAt && (
              <div><dt>Découverte</dt><dd>{formatCalendarDate(artwork.discoveredAt)}</dd></div>
            )}
          </dl>

          <section className="mine-block">
            {artwork.personalNote ? (
              <>
                <blockquote className="review-personal">{artwork.personalNote}</blockquote>
                <button className="link-accent review-edit-link" type="button" onClick={onEdit}>Modifier</button>
              </>
            ) : (
              <p className="mine-empty">Ton avis s’écrira ici.</p>
            )}
          </section>
        </div>
      </article>

      {confirmingDelete && (
        <div className="confirm-backdrop">
          <div className="delete-confirmation" role="alertdialog" aria-labelledby="artwork-delete-title" aria-describedby="artwork-delete-description">
            <h2 id="artwork-delete-title">Supprimer définitivement cette œuvre ?</h2>
            <p id="artwork-delete-description">« {artwork.title} » sera retirée de la collection sans possibilité de restauration.</p>
            {deleteError && <p className="field-error" role="alert">{deleteError}</p>}
            <div>
              <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Annuler</button>
              <button className="danger-button" type="button" onClick={deleteArtwork} disabled={deleting}>
                {deleting ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
