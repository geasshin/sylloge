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
        <button className="secondary-button" type="button" onClick={onEdit}>Modifier</button>
      </header>

      <article className="film-detail">
        <div className="film-detail-visual">
          <div className="poster-container">
            <Poster title={artwork.title} src={artwork.imageUrl} className="detail-poster" label="Visuel" />
          </div>
        </div>

        <div className="film-detail-content">
          <p className="eyebrow">{ARTWORK_FORM_LABELS[artwork.form]}</p>
          <h1 className="display-title">{artwork.title}</h1>
          {artwork.artist && <p className="detail-attribution">{artwork.artist}</p>}
          {artwork.year !== null && <p className="detail-runtime">{artwork.year}</p>}

          <dl className="film-facts">
            <div>
              <dt>Statut</dt>
              <dd>{ARTWORK_STATUS_LABELS[artwork.status]}</dd>
            </div>
            <div>
              <dt>Forme</dt>
              <dd>{ARTWORK_FORM_LABELS[artwork.form]}</dd>
            </div>
            {artwork.location && (
              <div>
                <dt>Lieu</dt>
                <dd>{artwork.location}</dd>
              </div>
            )}
            {artwork.exhibition && (
              <div>
                <dt>Exposition</dt>
                <dd>{artwork.exhibition}</dd>
              </div>
            )}
            {artwork.isFavorite && (
              <div>
                <dt>Collection</dt>
                <dd>Favori</dd>
              </div>
            )}
            {artwork.discoveredAt && (
              <div>
                <dt>Date de découverte</dt>
                <dd>{formatCalendarDate(artwork.discoveredAt)}</dd>
              </div>
            )}
          </dl>

          {artwork.personalNote && (
            <section className="reading-section personal-reading">
              <h2>Avis personnel</h2>
              <p>{artwork.personalNote}</p>
            </section>
          )}

          <section className="delete-section">
            {!confirmingDelete ? (
              <button className="delete-link" type="button" onClick={() => setConfirmingDelete(true)}>Supprimer cette œuvre</button>
            ) : (
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
            )}
          </section>
        </div>
      </article>
    </main>
  )
}
