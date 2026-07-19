import { useState } from 'react'
import {
  associateFilmWithTmdb,
  type TmdbSearchCandidate,
} from '../data/tmdbService.ts'
import type { Film } from '../domain/film.ts'
import { Poster } from './Poster.tsx'

type TmdbAssociationConfirmProps = {
  film: Film | null // null = création assistée (préremplissage), Film = association à fiche existante
  candidate: TmdbSearchCandidate
  onConfirm: (result: { tmdbId: number; title: string }) => void
  onBack: () => void
  onCancel: () => void
}

export function TmdbAssociationConfirm({
  film,
  candidate,
  onConfirm,
  onBack,
  onCancel,
}: TmdbAssociationConfirmProps) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setConfirming(true)
    setError(null)
    try {
      if (film) {
        // Association à une fiche existante : écriture du cache TMDB
        await associateFilmWithTmdb(film.id, candidate.tmdbId)
      }
      // En création assistée, on ne fait que retourner le candidat pour préremplissage
      onConfirm({ tmdbId: candidate.tmdbId, title: candidate.title })
    } catch (err) {
      console.error('L\'association TMDB a échoué.', err)
      setError('L\'association a échoué. Vérifiez votre clé TMDB et votre connexion, puis réessayez.')
      setConfirming(false)
    }
  }

  return (
    <main className="main editor-main" aria-label="Confirmer l'association TMDB">
      <header className="page-action-bar">
        <button className="back-button" type="button" onClick={onBack}>← Retour aux résultats</button>
      </header>

      <div className="editor-heading">
        <p className="eyebrow">Film</p>
        <h1 className="display-title">Confirmer l'association</h1>
        <p>
          {film
            ? `Associer « ${film.title} » à cette fiche TMDB ?`
            : 'Préremplir le formulaire avec ces métadonnées ?'}
        </p>
      </div>

      <section className="tmdb-association-preview" aria-labelledby="tmdb-preview-title">
        <h2 id="tmdb-preview-title" className="visually-hidden">Aperçu de la correspondance TMDB</h2>
        <div className="tmdb-preview-card">
          <Poster
            title={candidate.title}
            src={candidate.posterUrl}
            className="tmdb-preview-poster"
          />
          <div className="tmdb-preview-info">
            <b>{candidate.title}</b>
            {candidate.originalTitle && candidate.originalTitle !== candidate.title && (
              <small>Titre original : {candidate.originalTitle}</small>
            )}
            {candidate.releaseYear && <small>Année : {candidate.releaseYear}</small>}
            {candidate.synopsis && (
              <p className="tmdb-preview-synopsis">{candidate.synopsis}</p>
            )}
          </div>
        </div>

        {error && (
          <p className="inline-report error" role="alert">{error}</p>
        )}

        <div className="form-actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
          >
            {confirming
              ? 'Association…'
              : film
                ? 'Associer à TMDB'
                : 'Préremplir le formulaire'}
          </button>
          <button className="secondary-button" type="button" onClick={onBack} disabled={confirming}>
            Choisir un autre film
          </button>
          <button className="secondary-button" type="button" onClick={onCancel} disabled={confirming}>
            Annuler
          </button>
        </div>
      </section>
    </main>
  )
}
