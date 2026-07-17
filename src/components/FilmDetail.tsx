import { useState } from 'react'
import type { Film, FilmStatus } from '../domain/film.ts'
import { Poster } from './Poster.tsx'

const STATUS_LABELS: Record<FilmStatus, string> = {
  'à découvrir': 'À découvrir',
  'en attente': 'En attente',
  'terminé': 'Terminé',
  'abandonné': 'Abandonné',
}

function formatWatchedDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
}

type FilmDetailProps = {
  film: Film
  onBack: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
}

export function FilmDetail({ film, onBack, onEdit, onDelete }: FilmDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const attribution = [film.director, film.year].filter((value) => value !== null).join(' · ')

  const deleteFilm = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch (error) {
      console.error('Impossible de supprimer le film.', error)
      setDeleteError('La suppression a échoué. Le film est toujours dans la collection.')
      setDeleting(false)
    }
  }

  return (
    <main className="main detail-page-main">
      <header className="page-action-bar detail-action-bar">
        <button className="back-button" type="button" onClick={onBack}>← Retour aux films</button>
        <button className="secondary-button" type="button" onClick={onEdit}>Modifier</button>
      </header>

      <article className="film-detail">
        <div className="film-detail-visual">
          <Poster title={film.title} src={film.posterUrl} className="detail-poster" />
        </div>

        <div className="film-detail-content">
          <p className="eyebrow">Film</p>
          <h1 className="display-title">{film.title}</h1>
          {film.originalTitle && <p className="original-title">{film.originalTitle}</p>}
          {attribution && <p className="detail-attribution">{attribution}</p>}

          <dl className="film-facts">
            <div>
              <dt>Statut</dt>
              <dd>{STATUS_LABELS[film.status]}</dd>
            </div>
            {film.isFavorite && (
              <div>
                <dt>Collection</dt>
                <dd>Favori</dd>
              </div>
            )}
            {film.rating !== null && (
              <div>
                <dt>Note</dt>
                <dd>{film.rating.toLocaleString('fr-FR')} / 5</dd>
              </div>
            )}
            {film.watchedAt && (
              <div>
                <dt>Visionnage</dt>
                <dd>{formatWatchedDate(film.watchedAt)}</dd>
              </div>
            )}
          </dl>

          {film.summary && (
            <section className="reading-section">
              <h2>Résumé</h2>
              <p>{film.summary}</p>
            </section>
          )}

          {film.personalNote && (
            <section className="reading-section personal-reading">
              <h2>Texte personnel</h2>
              <p>{film.personalNote}</p>
            </section>
          )}

          <section className="delete-section">
            {!confirmingDelete ? (
              <button className="delete-link" type="button" onClick={() => setConfirmingDelete(true)}>Supprimer ce film</button>
            ) : (
              <div className="delete-confirmation" role="alertdialog" aria-labelledby="delete-title" aria-describedby="delete-description">
                <h2 id="delete-title">Supprimer définitivement ce film ?</h2>
                <p id="delete-description">« {film.title} » sera retiré de la collection sans possibilité de restauration.</p>
                {deleteError && <p className="field-error" role="alert">{deleteError}</p>}
                <div>
                  <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Annuler</button>
                  <button className="danger-button" type="button" onClick={deleteFilm} disabled={deleting}>
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
