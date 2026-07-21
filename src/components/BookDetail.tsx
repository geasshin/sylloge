import { useState } from 'react'
import {
  BOOK_CATEGORY_LABELS,
  BOOK_STATUS_LABELS,
  type Book,
} from '../domain/book.ts'
import { Poster } from './Poster.tsx'

function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
}

type BookDetailProps = {
  book: Book
  onBack: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
}

export function BookDetail({ book, onBack, onEdit, onDelete }: BookDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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
        <button className="back-button" type="button" onClick={onBack}>← Retour aux livres</button>
        <button className="secondary-button" type="button" onClick={onEdit}>Modifier</button>
      </header>

      <article className="film-detail">
        <div className="film-detail-visual">
          <div className="poster-container">
            <Poster title={book.title} src={book.coverUrl} className="detail-poster" />
          </div>
        </div>

        <div className="film-detail-content">
          <p className="eyebrow">{BOOK_CATEGORY_LABELS[book.category]}</p>
          <h1 className="display-title">{book.title}</h1>
          {book.author && <p className="detail-attribution">{book.author}</p>}
          {book.year !== null && <p className="detail-runtime">{book.year}</p>}

          <dl className="film-facts">
            <div>
              <dt>Statut</dt>
              <dd>{BOOK_STATUS_LABELS[book.status]}</dd>
            </div>
            {progress && (
              <div>
                <dt>Avancement</dt>
                <dd>{progress}</dd>
              </div>
            )}
            {book.isFavorite && (
              <div>
                <dt>Collection</dt>
                <dd>Favori</dd>
              </div>
            )}
            {book.rating !== null && (
              <div>
                <dt>Note</dt>
                <dd>{book.rating.toLocaleString('fr-FR')} / 5</dd>
              </div>
            )}
            {book.startedAt && (
              <div>
                <dt>Début de la lecture</dt>
                <dd>{formatCalendarDate(book.startedAt)}</dd>
              </div>
            )}
          </dl>

          {book.summary && (
            <section className="reading-section">
              <h2>Résumé</h2>
              <p>{book.summary}</p>
            </section>
          )}

          {book.personalNote && (
            <section className="reading-section personal-reading">
              <h2>Avis personnel</h2>
              <p>{book.personalNote}</p>
            </section>
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

          <section className="delete-section">
            {!confirmingDelete ? (
              <button className="delete-link" type="button" onClick={() => setConfirmingDelete(true)}>Supprimer ce livre</button>
            ) : (
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
            )}
          </section>
        </div>
      </article>
    </main>
  )
}
