import { useState } from 'react'
import {
  ARTWORK_FORM_LABELS,
  ARTWORK_STATUS_LABELS,
  type Artwork,
} from '../domain/artwork.ts'
import { ARTWORK_FORM_PROFILES, artworkDetailFieldsFor } from '../domain/artworkDetails.ts'
import { t, tc, formatDate, translateMessage } from '../i18n/core.ts'
import { ArtworkVisual, useArtworkFrame } from './ArtworkVisual.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { searchArtworkImages } from '../data/artImageSearch.ts'
import { StatusBadge } from './VerdictControls.tsx'
import { DetailDate, DetailLayout } from './DetailLayout.tsx'
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
  const frame = useArtworkFrame(artwork)
  const profile = ARTWORK_FORM_PROFILES[artwork.form]
  const detailFields = artworkDetailFieldsFor(artwork.form, artwork.details)
  const factFields = detailFields.filter((field) => field.kind === 'text' && artwork.details[field.key])
  const poem = artwork.details.text
  // Cartel de musée : une ligne par fait, l'étiquette devant la valeur. Une
  // œuvre sans aucun champ n'en a pas (le carnet prend alors la largeur).
  const cartelRows = [
    ...factFields.map((field) => (
      <div key={field.key}><dt>{tc('artworks', field.label)}</dt><dd>{artwork.details[field.key]}</dd></div>
    )),
    artwork.location ? <div key="location"><dt>{t("Lieu")}</dt><dd>{artwork.location}</dd></div> : null,
    artwork.exhibition ? <div key="exhibition"><dt>{tc('artworks', profile.exhibitionLabel)}</dt><dd>{artwork.exhibition}</dd></div> : null,
    // Champs personnalisés nom → valeur (0.6.12).
    ...artwork.customFields.map((field, index) => (
      <div key={`${field.name}-${index}`}><dt>{field.name}</dt><dd>{field.value}</dd></div>
    )),
  ].filter(Boolean)

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

      <DetailLayout
        visual={(
          <div className="poster-container detail-poster-wrap">
            {/* Le visuel garde le format de son image (27 octobre 2026). */}
            <ArtworkVisual artwork={artwork} frame={frame} className="detail-poster" excerptLines={16} onEdit={onImageEdit ? () => setPosterDialogOpen(true) : undefined} />
          </div>
        )}
        verdict={(
          <>
            <div className="detail-status">
              <StatusBadge status={artwork.status} labels={ARTWORK_STATUS_LABELS} />
            </div>
            {artwork.isFavorite && (
              <div className="detail-rate">
                <span className="heart-display on" aria-label={t("Coup de cœur")}>♥</span>
              </div>
            )}
          </>
        )}
        heading={(
          <>
            <p className="eyebrow">{t(ARTWORK_FORM_LABELS[artwork.form])}</p>
            <h1 className="display-title">{artwork.title}</h1>
            {(artwork.artist || artwork.year !== null) && (
              <p className="detail-factline">
                {[artwork.artist, artwork.year !== null ? String(artwork.year) : null].filter(Boolean).join(' · ')}
              </p>
            )}
          </>
        )}
        notebook={artwork.discoveredAt && (
          <DetailDate label={tc('artworks', "Date de découverte")} value={formatDate(artwork.discoveredAt, { dateStyle: 'long' })} />
        )}
        review={artwork.personalNote ? (
          <>
            <blockquote className="review-personal">{artwork.personalNote}</blockquote>
            <button className="link-accent review-edit-link" type="button" onClick={onEdit}>{t("Modifier")}</button>
          </>
        ) : (
          <p className="mine-empty">{t("Ton avis s’écrira ici.")}</p>
        )}
        appendices={poem && (
          /* Le poème se lit en entier, vers et strophes conservés. */
          <section className="quotes-section artwork-poem" aria-labelledby="artwork-poem-title">
            <h2 id="artwork-poem-title">{tc('artworks', 'Poème')}</h2>
            <blockquote className="artwork-poem-text">{poem}</blockquote>
          </section>
        )}
        art={{
          /* Cartel de musée : la technique et les dimensions d'abord, puis le
             lieu et l'exposition, puis les champs libres. Une œuvre sans aucun
             champ n'a pas de cartel : le carnet prend alors toute la largeur. */
          cartel: cartelRows.length > 0 ? cartelRows : null,
        }}
      />

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
