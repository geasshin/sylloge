import { useState } from 'react'
import { QuotesSection } from './Quotes.tsx'
import {
  BOOK_CATEGORY_LABELS,
  BOOK_STATUS_LABELS,
  type Book,
} from '../domain/book.ts'
import { t, formatDate, formatNumber, translateMessage } from '../i18n/core.ts'
import { Poster } from './Poster.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { FocusDialog } from './FocusDialog.tsx'
import { DetailVerdict } from './VerdictControls.tsx'
import { DetailLayout } from './DetailLayout.tsx'
import { verdictLine } from '../domain/verdictLine.ts'
import { icon } from '../main.tsx'

type BookDetailProps = {
  book: Book
  onBack: () => void
  backLabel: string
  onEdit: (options?: { addQuote?: boolean }) => void
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
      ? t(book.volumesRead === 1 ? '{count} tome sur {total}' : '{count} tomes sur {total}', { count: book.volumesRead, total: book.volumesTotal })
      : t(book.volumesRead === 1 ? '{count} tome lu' : '{count} tomes lus', { count: book.volumesRead })
    : null

  const deleteBook = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch (error) {
      console.error(`Impossible de supprimer le ${book.category === 'manga' ? 'manga' : 'livre'}.`, error)
      setDeleteError(book.category === 'manga' ? 'La suppression a échoué. Le manga est toujours dans la collection.' : 'La suppression a échoué. Le livre est toujours dans la collection.')
      setDeleting(false)
    }
  }

  return (
    <main className="main detail-page-main">
      <header className="page-action-bar detail-action-bar">
        <button className="back-button back-button-icon" type="button" onClick={onBack} aria-label={backLabel}>{icon('arrow-left')}</button>
        <div className="detail-actions">
          <button className="icon-action-button" type="button" onClick={() => onEdit()} title={t("Modifier la fiche")}>
            {icon('pencil')}
            <span>{t("Modifier")}</span>
          </button>
          {onAssociate && (
            <button className="icon-action-button" type="button" onClick={onAssociate} title={t("Associer à Open Library (recherche assistée)")}>
              {icon('wand')}
              <span>{t("Associer")}</span>
            </button>
          )}
          <button
            className="icon-action-button icon-action-danger"
            type="button"
            onClick={() => setConfirmingDelete(true)}
            title={t(book.category === 'manga' ? "Supprimer ce manga" : "Supprimer ce livre")}
          >
            {icon('trash')}
          </button>
        </div>
      </header>

      <DetailLayout
        visual={(
          <div className="poster-container detail-poster-wrap">
            <Poster title={book.title} src={book.coverUrl} className="detail-poster" sharp label="Couverture" onEdit={onCoverEdit ? () => setPosterDialogOpen(true) : undefined} />
          </div>
        )}
        verdict={(
          <DetailVerdict
            rating={book.rating}
            favorite={book.isFavorite}
            status={book.status}
            line={verdictLine({
              status: t(BOOK_STATUS_LABELS[book.status]),
              date: book.startedAt ? formatDate(book.startedAt, { dateStyle: 'long' }) : null,
              mode: 'started-m',
              matches: book.status === 'en cours',
              dateLabel: t("Début de la lecture"),
            })}
          />
        )}
        heading={(
          <>
            <p className="eyebrow">{t(BOOK_CATEGORY_LABELS[book.category])}</p>
            <h1 className="display-title">{book.title}</h1>
          </>
        )}
        facts={(
          <dl className="detail-facts">
            {book.author && (
              <div><dt>{t("Auteur")}</dt><dd>{book.author}</dd></div>
            )}
            {book.year !== null && (
              <div><dt>{t("Année")}</dt><dd>{String(book.year)}</dd></div>
            )}
            {progress && (
              <div><dt>{t("Avancement")}</dt><dd>{progress}</dd></div>
            )}
          </dl>
        )}
        synopsis={book.summary && (
          <div className="synopsis-block">
            <p>{book.summary}</p>
          </div>
        )}
        review={book.personalNote ? (
          <>
            <blockquote className="review-personal">{book.personalNote}</blockquote>
            <button className="link-accent review-edit-link" type="button" onClick={() => onEdit()}>{t("Modifier l’avis")}</button>
          </>
        ) : (
          <p className="mine-empty">{t("Ton avis s’écrira ici.")}</p>
        )}
        appendices={<QuotesSection quotes={book.quotes} onEdit={onEdit} />}
      />

      {confirmingDelete && (
        <div className="confirm-backdrop">
          <FocusDialog className="delete-confirmation" role="alertdialog" aria-labelledby="book-delete-title" aria-describedby="book-delete-description" onClose={() => setConfirmingDelete(false)} closeDisabled={deleting}>
            <h2 id="book-delete-title">{t(book.category === 'manga' ? "Supprimer définitivement ce manga ?" : "Supprimer définitivement ce livre ?")}</h2>
            <p id="book-delete-description">{t('« {title} » et ses citations seront retirés de la collection sans possibilité de restauration.', { title: book.title })}</p>
            {deleteError && <p className="field-error" role="alert">{translateMessage(deleteError)}</p>}
            <div>
              <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>{t("Annuler")}</button>
              <button className="danger-button" type="button" onClick={deleteBook} disabled={deleting}>
                {deleting ? t('Suppression…') : t("Supprimer définitivement")}
              </button>
            </div>
          </FocusDialog>
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
