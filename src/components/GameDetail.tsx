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
  const [menuOpen, setMenuOpen] = useState(false)

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
                    Supprimer ce jeu…
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
            <Poster title={game.title} src={game.coverUrl} className="detail-poster" label="Couverture" />
          </div>
          <div className="detail-status" role="group" aria-label="Statut">
            {Object.entries(GAME_STATUS_LABELS).map(([key, label]) => (
              <span key={key} className={`seg-pill-static ${key === game.status ? 'on' : ''}`}>{label}</span>
            ))}
          </div>
          {(game.rating !== null || game.isFavorite) && (
            <div className="detail-rate">
              {game.rating !== null && (
                <>
                  <span className="stars-display" aria-label={`Note ${game.rating} sur 5`}>
                    {'★'.repeat(Math.round(game.rating))}
                    <span className="stars-off">{'★'.repeat(5 - Math.round(game.rating))}</span>
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
    </main>
  )
}
