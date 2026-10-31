import { useState } from 'react'
import {
  GAME_STATUS_LABELS,
  type Game,
} from '../domain/game.ts'
import { t, tc, formatDate, formatNumber, translateMessage } from '../i18n/core.ts'
import { Poster } from './Poster.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { DetailVerdict } from './VerdictControls.tsx'
import { DetailLayout } from './DetailLayout.tsx'
import { verdictLine } from '../domain/verdictLine.ts'
import { BannerAddButton, DetailBanner } from './DetailBanner.tsx'
import { useBannerEditor, useBannerProviderId } from './useBannerEditor.tsx'
import { icon } from '../main.tsx'

type GameDetailProps = {
  game: Game
  onBack: () => void
  backLabel: string
  onEdit: () => void
  /** Modification de la couverture par URL depuis le crayon. */
  onCoverEdit?: (url: string | null) => Promise<void> | void
  /** Ouverture de la pop-up d'association IGDB (même parcours que les films). */
  onAssociate?: () => void
  /** Enregistre (ou retire, avec null) la bannière 16:9 de la fiche. */
  onBannerChange?: (url: string | null) => Promise<void> | void
  onDelete: () => Promise<void>
}

export function GameDetail({ game, onBack, backLabel, onEdit, onCoverEdit, onAssociate, onBannerChange, onDelete }: GameDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [posterDialogOpen, setPosterDialogOpen] = useState(false)
  const bannerProviderId = useBannerProviderId(game.profileId, 'game', game.id)
  const bannerEditor = useBannerEditor({
    title: game.title,
    medium: 'game',
    providerId: bannerProviderId,
    currentUrl: game.bannerUrl,
    onSave: (url) => onBannerChange?.(url),
  })

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
        <button className="back-button back-button-icon" type="button" onClick={onBack} aria-label={backLabel}>{icon('arrow-left')}</button>
        <div className="detail-actions">
          <button className="icon-action-button" type="button" onClick={onEdit} title={t("Modifier la fiche")}>
            {icon('pencil')}
            <span>{t("Modifier")}</span>
          </button>
          {onAssociate && (
            <button className="icon-action-button" type="button" onClick={onAssociate} title={t("Associer à IGDB (recherche assistée)")}>
              {icon('wand')}
              <span>{t("Associer")}</span>
            </button>
          )}
          {!game.bannerUrl && onBannerChange && <BannerAddButton {...bannerEditor.addProps} />}
          <button
            className="icon-action-button icon-action-danger"
            type="button"
            onClick={() => setConfirmingDelete(true)}
            title={t("Supprimer ce jeu")}
          >
            {icon('trash')}
          </button>
        </div>
      </header>

      <DetailLayout
        banner={game.bannerUrl ? (
          <DetailBanner
            title={game.title}
            bannerUrl={game.bannerUrl}
            {...(onBannerChange ? bannerEditor.bannerProps : {})}
          />
        ) : undefined}
        visual={(
          <div className="poster-container detail-poster-wrap">
            <Poster title={game.title} src={game.coverUrl} className="detail-poster" sharp label="Couverture" onEdit={onCoverEdit ? () => setPosterDialogOpen(true) : undefined} />
          </div>
        )}
        verdict={(
          <DetailVerdict
            rating={game.rating}
            favorite={game.isFavorite}
            status={game.status}
            line={verdictLine({
              status: t(GAME_STATUS_LABELS[game.status]),
              date: game.playedAt ? formatDate(game.playedAt, { dateStyle: 'long' }) : null,
              mode: 'reached',
              matches: game.status === 'joué' || game.status === 'abandonné',
              dateLabel: tc('games', "Partie"),
            })}
          />
        )}
        heading={(
          <>
            <h1 className="display-title">{game.title}</h1>
          </>
        )}
        facts={(
          <dl className="detail-facts">
            {game.developer && (
              <div><dt>{t("Studio")}</dt><dd>{game.developer}</dd></div>
            )}
            {game.year !== null && (
              <div><dt>{t("Année")}</dt><dd>{String(game.year)}</dd></div>
            )}
            {game.platform && (
              <div><dt>{t("Plateforme")}</dt><dd>{game.platform}</dd></div>
            )}
          </dl>
        )}
        review={game.personalNote ? (
          <>
            <blockquote className="review-personal">{game.personalNote}</blockquote>
            <button className="link-accent review-edit-link" type="button" onClick={onEdit}>{t("Modifier")}</button>
          </>
        ) : (
          <p className="mine-empty">{t("Ton avis s’écrira ici.")}</p>
        )}
      />

      {confirmingDelete && (
        <div className="confirm-backdrop">
          <div className="delete-confirmation" role="alertdialog" aria-labelledby="game-delete-title" aria-describedby="game-delete-description">
            <h2 id="game-delete-title">{t("Supprimer définitivement ce jeu ?")}</h2>
            <p id="game-delete-description">{t('« {title} » sera retiré de la collection sans possibilité de restauration.', { title: game.title })}</p>
            {deleteError && <p className="field-error" role="alert">{translateMessage(deleteError)}</p>}
            <div>
              <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>{t("Annuler")}</button>
              <button className="danger-button" type="button" onClick={deleteGame} disabled={deleting}>
                {deleting ? t('Suppression…') : t("Supprimer définitivement")}
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
      {bannerEditor.bannerDialog}
    </main>
  )
}
