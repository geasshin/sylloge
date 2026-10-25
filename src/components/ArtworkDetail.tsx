import { useState } from 'react'
import {
  ARTWORK_FORM_LABELS,
  ARTWORK_STATUS_LABELS,
  type Artwork,
} from '../domain/artwork.ts'
import { t, tc, formatDate, translateMessage } from '../i18n/core.ts'
import { Poster } from './Poster.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { searchArtworkImages } from '../data/artImageSearch.ts'
import { StatusBadge } from './VerdictControls.tsx'
import { icon } from '../main.tsx'

type ArtworkDetailProps = {
  artwork: Artwork
  onBack: () => void
  backLabel: string
  onEdit: () => void
  /** Modification du visuel par URL depuis le crayon. */
  onImageEdit?: (url: string | null) => Promise<void> | void
  onDelete: () => Promise<void>
}

export function ArtworkDetail({ artwork, onBack, backLabel, onEdit, onImageEdit, onDelete }: ArtworkDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [posterDialogOpen, setPosterDialogOpen] = useState(false)

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
        <button className="back-button back-button-icon" type="button" onClick={onBack} aria-label={backLabel}>{icon('arrow-left')}</button>
        {/* L'Art n'a aucun fournisseur d'association : pas de baguette ici, règle du domaine. */}
        <div className="detail-actions">
          <button className="icon-action-button" type="button" onClick={onEdit} title={t("Modifier la fiche")}>
            {icon('pencil')}
            <span>{t("Modifier")}</span>
          </button>
          <button
            className="icon-action-button icon-action-danger"
            type="button"
            onClick={() => setConfirmingDelete(true)}
            title={t("Supprimer cette œuvre")}
          >
            {icon('trash')}
          </button>
        </div>
      </header>

      <article className="detail-layout">
        <div className="detail-side">
          <div className="poster-container detail-poster-wrap">
            <Poster title={artwork.title} src={artwork.imageUrl} className="detail-poster artwork-visual" label="Visuel" onEdit={onImageEdit ? () => setPosterDialogOpen(true) : undefined} />
          </div>
          <div className="detail-status">
            <StatusBadge status={artwork.status} labels={ARTWORK_STATUS_LABELS} />
          </div>
          {artwork.isFavorite && (
            <div className="detail-rate">
              <span className="heart-display on" aria-label={t("Coup de cœur")}>♥</span>
            </div>
          )}
        </div>

        <div className="detail-body">
          <p className="eyebrow">{t(ARTWORK_FORM_LABELS[artwork.form])}</p>
          <h1 className="display-title">{artwork.title}</h1>
          {(artwork.artist || artwork.year !== null) && (
            <p className="detail-factline">
              {[artwork.artist, artwork.year !== null ? String(artwork.year) : null].filter(Boolean).join(' · ')}
            </p>
          )}

          <dl className="detail-facts">
            {artwork.artist && (
              <div><dt>{t("Artiste")}</dt><dd>{artwork.artist}</dd></div>
            )}
            {artwork.year !== null && (
              <div><dt>{t("Année")}</dt><dd>{artwork.year}</dd></div>
            )}
            {artwork.location && (
              <div><dt>{t("Lieu")}</dt><dd>{artwork.location}</dd></div>
            )}
            {artwork.exhibition && (
              <div><dt>{t("Exposition")}</dt><dd>{artwork.exhibition}</dd></div>
            )}
            {artwork.discoveredAt && (
              <div><dt>{tc('artworks', "Date de découverte")}</dt><dd>{formatDate(artwork.discoveredAt, { dateStyle: 'long' })}</dd></div>
            )}
            {/* Champs personnalisés nom → valeur (0.6.12). */}
            {artwork.customFields.map((field, index) => (
              <div key={`${field.name}-${index}`}><dt>{field.name}</dt><dd>{field.value}</dd></div>
            ))}
          </dl>

          <section className="mine-block">
            {artwork.personalNote ? (
              <>
                <blockquote className="review-personal">{artwork.personalNote}</blockquote>
                <button className="link-accent review-edit-link" type="button" onClick={onEdit}>{t("Modifier")}</button>
              </>
            ) : (
              <p className="mine-empty">{t("Ton avis s’écrira ici.")}</p>
            )}
          </section>
        </div>
      </article>

      {confirmingDelete && (
        <div className="confirm-backdrop">
          <div className="delete-confirmation" role="alertdialog" aria-labelledby="artwork-delete-title" aria-describedby="artwork-delete-description">
            <h2 id="artwork-delete-title">{t("Supprimer définitivement cette œuvre ?")}</h2>
            <p id="artwork-delete-description">{t('« {title} » sera retirée de la collection sans possibilité de restauration.', { title: artwork.title })}</p>
            {deleteError && <p className="field-error" role="alert">{translateMessage(deleteError)}</p>}
            <div>
              <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>{t("Annuler")}</button>
              <button className="danger-button" type="button" onClick={deleteArtwork} disabled={deleting}>
                {deleting ? t('Suppression…') : t("Supprimer définitivement")}
              </button>
            </div>
          </div>
        </div>
      )}
      <PosterUrlDialog
        open={posterDialogOpen}
        title={artwork.title}
        label="Visuel"
        currentUrl={artwork.imageUrl}
        onClose={() => setPosterDialogOpen(false)}
        onSave={(url) => onImageEdit?.(url)}
        suggest={() => searchArtworkImages(artwork.title, artwork.artist)}
      />
    </main>
  )
}
