import { useState } from 'react'
import {
  GAME_STATUS_LABELS,
  type Game,
} from '../domain/game.ts'
import { Poster } from './Poster.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { StatusBadge } from './VerdictControls.tsx'
import { icon } from '../main.tsx'

function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(year, month - 1, day))
}

type GameDetailProps = {
  game: Game
  onBack: () => void
  backLabel: string
  onEdit: () => void
  /** Modification de la couverture par URL depuis le crayon. */
  onCoverEdit?: (url: string | null) => Promise<void> | void
  /** Ouverture de la pop-up d'association IGDB (même parcours que les films). */
  onAssociate?: () => void
  onDelete: () => Promise<void>
}

export function GameDetail({ game, onBack, backLabel, onEdit, onCoverEdit, onAssociate, onDelete }: GameDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [posterDialogOpen, setPosterDialogOpen] = useState(false)

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
        <button className="back-button" type="button" onClick={onBack}>{backLabel}</button>
        <div className="detail-actions">
          <button className="icon-action-button" type="button" onClick={onEdit} title="Modifier la fiche">
            {icon('pencil')}
            <span>Modifier</span>
          </button>
          {onAssociate && (
            <button className="icon-action-button" type="button" onClick={onAssociate} title="Associer à IGDB (recherche assistée)">
              {icon('wand')}
              <span>Associer</span>
            </button>
          )}
          <button
            className="icon-action-button icon-action-danger"
            type="button"
            onClick={() => setConfirmingDelete(true)}
            title="Supprimer ce jeu"
          >
            {icon('trash')}
            <span>Supprimer</span>
          </button>
        </div>
      </header>

      <article className="detail-layout">
        <div className="detail-side">
          <div className="poster-container detail-poster-wrap">
            <Poster title={game.title} src={game.coverUrl} className="detail-poster" label="Couverture" onEdit={onCoverEdit ? () => setPosterDialogOpen(true) : undefined} />
          </div>
          <div className="detail-status">
            <StatusBadge status={game.status} labels={GAME_STATUS_LABELS} />
          </div>
          {(game.rating !== null || game.isFavorite) && (
            <div className="detail-rate">
              {game.rating !== null && (
                <>
                  <span className="stars-display" aria-label={`Note ${game.rating} sur 5`}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      const fill = Math.max(0, Math.min(1, game.rating! - star + 1))
                      return (
                        <span key={star} className={`star-slot ${fill > 0 ? 'filled' : ''}`}>
                          <span className="star-glyph" aria-hidden="true">★</span>
                          <span className="star-fill" style={{ width: `${fill * 100}%` }} aria-hidden="true">★</span>
                        </span>
                      )
                    })}
                  </span>
                  <span className="rate-value">{game.rating.toLocaleString('fr-FR')}/5</span>
                </>
              )}
              {game.isFavorite && <span className="heart-display on" aria-label="Coup de cœur">♥</span>}
            </div>
          )}
        </div>

        <div className="detail-body">
          <p className="eyebrow">Jeu vidéo</p>
          <h1 className="display-title">{game.title}</h1>
          {(game.developer || game.year !== null || game.platform) && (
            <p className="detail-factline">
              {[game.developer, game.year !== null ? String(game.year) : null, game.platform].filter(Boolean).join(' · ')}
            </p>
          )}

          <dl className="detail-facts">
            {game.developer && (
              <div><dt>Développeur</dt><dd>{game.developer}</dd></div>
            )}
            {game.platform && (
              <div><dt>Plateforme</dt><dd>{game.platform}</dd></div>
            )}
            {game.year !== null && (
              <div><dt>Sortie</dt><dd>{game.year}</dd></div>
            )}
            {game.playedAt && (
              <div><dt>{game.status === 'regardé' ? 'Visionnage' : 'Partie'}</dt><dd>{formatCalendarDate(game.playedAt)}</dd></div>
            )}
          </dl>

          <section className="mine-block">
            {game.personalNote ? (
              <>
                <blockquote className="review-personal">{game.personalNote}</blockquote>
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
        </div>
      )}
      <PosterUrlDialog
        open={posterDialogOpen}
        title={game.title}
        label="Couverture"
        currentUrl={game.coverUrl}
        onClose={() => setPosterDialogOpen(false)}
        onSave={(url) => onCoverEdit?.(url)}
      />
    </main>
  )
}
