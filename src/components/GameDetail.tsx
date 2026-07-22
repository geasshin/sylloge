import { useState } from 'react'
import {
  GAME_STATUS_LABELS,
  type Game,
} from '../domain/game.ts'
import { Poster } from './Poster.tsx'

function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
}

type GameDetailProps = {
  game: Game
  onBack: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
}

export function GameDetail({ game, onBack, onEdit, onDelete }: GameDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const deleteGame = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch (error) {
      console.error('Impossible de supprimer le jeu.', error)
      setDeleteError('La suppression a échoué. Le jeu est toujours dans la collection.')
      setDeleting(false)
    }
  }

  return (
    <main className="main detail-page-main">
      <header className="page-action-bar detail-action-bar">
        <button className="back-button" type="button" onClick={onBack}>← Retour aux jeux</button>
        <button className="secondary-button" type="button" onClick={onEdit}>Modifier</button>
      </header>

      <article className="film-detail">
        <div className="film-detail-visual">
          <div className="poster-container">
            <Poster title={game.title} src={game.coverUrl} className="detail-poster" label="Couverture" />
          </div>
        </div>

        <div className="film-detail-content">
          <p className="eyebrow">Jeu vidéo</p>
          <h1 className="display-title">{game.title}</h1>
          {game.developer && <p className="detail-attribution">{game.developer}</p>}
          {game.year !== null && <p className="detail-runtime">{game.year}</p>}

          <dl className="film-facts">
            <div>
              <dt>Statut</dt>
              <dd>{GAME_STATUS_LABELS[game.status]}</dd>
            </div>
            {game.platform && (
              <div>
                <dt>Plateforme</dt>
                <dd>{game.platform}</dd>
              </div>
            )}
            {game.isFavorite && (
              <div>
                <dt>Collection</dt>
                <dd>Favori</dd>
              </div>
            )}
            {game.rating !== null && (
              <div>
                <dt>Note</dt>
                <dd>{game.rating.toLocaleString('fr-FR')} / 5</dd>
              </div>
            )}
            {game.playedAt && (
              <div>
                <dt>{game.status === 'regardé' ? 'Date du visionnage' : 'Date de jeu'}</dt>
                <dd>{formatCalendarDate(game.playedAt)}</dd>
              </div>
            )}
          </dl>

          {game.personalNote && (
            <section className="reading-section personal-reading">
              <h2>Avis personnel</h2>
              <p>{game.personalNote}</p>
            </section>
          )}

          <section className="delete-section">
            {!confirmingDelete ? (
              <button className="delete-link" type="button" onClick={() => setConfirmingDelete(true)}>Supprimer ce jeu</button>
            ) : (
              <div className="delete-confirmation" role="alertdialog" aria-labelledby="game-delete-title" aria-describedby="game-delete-description">
                <h2 id="game-delete-title">Supprimer définitivement ce jeu ?</h2>
                <p id="game-delete-description">« {game.title} » sera retiré de la collection sans possibilité de restauration.</p>
                {deleteError && <p className="field-error" role="alert">{deleteError}</p>}
                <div>
                  <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Annuler</button>
                  <button className="danger-button" type="button" onClick={deleteGame} disabled={deleting}>
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
