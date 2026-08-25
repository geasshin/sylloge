import { useState } from 'react'
import {
  BOOK_CATEGORY_LABELS,
  BOOK_STATUS_LABELS,
  type Book,
} from '../domain/book.ts'
import { Poster } from './Poster.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { StatusBadge } from './VerdictControls.tsx'
import { icon } from '../main.tsx'

function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
}

type BookDetailProps = {
  book: Book
  onBack: () => void
  backLabel: string
  onEdit: () => void
  /** Modification de la couverture par URL depuis le crayon. */
  onCoverEdit?: (url: string | null) => Promise<void> | void
  /** Ouverture de la pop-up d'association Open Library (même parcours que les films). */
  onAssociate?: () => void
  onDelete: () => Promise<void>
}

export function BookDetail({ book, onBack, backLabel, onEdit, onCoverEdit, onAssociate, onDelete }: BookDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [posterDialogOpen, setPosterDialogOpen] = useState(false)

  const progress = book.volumesRead !== null
    ? book.volumesTotal !== null
      ? `${book.volumesRead} tome${book.volumesRead > 1 ? 's' : ''} sur ${book.volumesTotal}`
      : `${book.volumesRead} tome${book.volumesRead > 1 ? 's' : ''} lu${book.volumesRead > 1 ? 's' : ''}`
    : null

  const deleteBook = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch (error) {
      console.error('Impossible de supprimer le livre.', error)
      setDeleteError('La suppression a échoué. Le livre est toujours dans la collection.')
      setDeleting(false)
    }
  }

  return (
    <main className="main detail-page-main">
      <header className="page-action-bar detail-action-bar">
        <button className="back-button" type="button" onClick={onBack}>{backLabel}</button>
        <div className="detail-actions">
          <button className="icon-action-button" type="button" onClick={onEdit} title="Modifier la fiche">
            {icon('pencil')}
            <span>Modifier</span>
          </button>
          {onAssociate && (
            <button className="icon-action-button" type="button" onClick={onAssociate} title="Associer à Open Library (recherche assistée)">
              {icon('wand')}
              <span>Associer</span>
            </button>
          )}
          <button
            className="icon-action-button icon-action-danger"
            type="button"
            onClick={() => setConfirmingDelete(true)}
            title="Supprimer ce livre"
          >
            {icon('trash')}
          </button>
        </div>
      </header>

      <article className="detail-layout">
        <div className="detail-side">
          <div className="poster-container detail-poster-wrap">
            <Poster title={book.title} src={book.coverUrl} className="detail-poster" label="Couverture" onEdit={onCoverEdit ? () => setPosterDialogOpen(true) : undefined} />
          </div>
          <div className="detail-status">
            <StatusBadge status={book.status} labels={BOOK_STATUS_LABELS} />
          </div>
          {(book.rating !== null || book.isFavorite) && (
            <div className="detail-rate">
              {book.rating !== null && (
                <>
                  <span className="stars-display" aria-label={`Note ${book.rating} sur 5`}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      const fill = Math.max(0, Math.min(1, book.rating! - star + 1))
                      return (
                        <span key={star} className={`star-slot ${fill > 0 ? 'filled' : ''}`}>
                          <span className="star-glyph" aria-hidden="true">★</span>
                          <span className="star-fill" style={{ width: `${fill * 100}%` }} aria-hidden="true">★</span>
                        </span>
                      )
                    })}
                  </span>
                  <span className="rate-value">{book.rating.toLocaleString('fr-FR')}/5</span>
                </>
              )}
              {book.isFavorite && <span className="heart-display on" aria-label="Coup de cœur">♥</span>}
            </div>
          )}
        </div>

        <div className="detail-body">
          <p className="eyebrow">{BOOK_CATEGORY_LABELS[book.category]}</p>
          <h1 className="display-title">{book.title}</h1>
          {(book.author || book.year !== null || progress || book.startedAt) && (
            <p className="detail-factline">
              {[
                book.author,
                book.year !== null ? String(book.year) : null,
                progress,
                book.startedAt ? `lecture débutée le ${formatCalendarDate(book.startedAt)}` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}

          <dl className="detail-facts">
            {book.author && (
              <div><dt>Auteur</dt><dd>{book.author}</dd></div>
            )}
            {book.year !== null && (
              <div><dt>Parution</dt><dd>{book.year}</dd></div>
            )}
            {progress && (
              <div><dt>Avancement</dt><dd>{progress}</dd></div>
            )}
            {book.startedAt && (
              <div><dt>Début de la lecture</dt><dd>{formatCalendarDate(book.startedAt)}</dd></div>
            )}
          </dl>

          {book.summary && (
            <div className="synopsis-block">
              <p>{book.summary}</p>
            </div>
          )}

          <section className="mine-block">
            {book.personalNote && (
              <blockquote className="review-personal">{book.personalNote}</blockquote>
            )}
            {book.quotes.length > 0 && (
              <details className="quotes-section">
                <summary>
                  {book.quotes.length} {book.quotes.length === 1 ? 'citation personnelle' : 'citations personnelles'}
                </summary>
                <ol className="quotes-list">
                  {book.quotes.map((quote) => (
                    <li key={quote.id}>
                      <blockquote>{quote.body}</blockquote>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            <button className="link-accent review-edit-link" type="button" onClick={onEdit}>Modifier</button>
          </section>
        </div>
      </article>

      {confirmingDelete && (
        <div className="confirm-backdrop">
          <div className="delete-confirmation" role="alertdialog" aria-labelledby="book-delete-title" aria-describedby="book-delete-description">
            <h2 id="book-delete-title">Supprimer définitivement ce livre ?</h2>
            <p id="book-delete-description">« {book.title} » et ses citations seront retirés de la collection sans possibilité de restauration.</p>
            {deleteError && <p className="field-error" role="alert">{deleteError}</p>}
            <div>
              <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Annuler</button>
              <button className="danger-button" type="button" onClick={deleteBook} disabled={deleting}>
                {deleting ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
      <PosterUrlDialog
        open={posterDialogOpen}
        title={book.title}
        label="Couverture"
        currentUrl={book.coverUrl}
        onClose={() => setPosterDialogOpen(false)}
        onSave={(url) => onCoverEdit?.(url)}
      />
    </main>
  )
}
