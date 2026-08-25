import { useEffect, useState, type FormEvent } from 'react'
import { FILM_STATUS_LABELS, type FilmStatus } from '../domain/film.ts'
import {
  EMPTY_FILM_FORM,
  filmToFormValues,
  localToday,
  validateFilmForm,
  type FilmFormErrors,
  type FilmFormValues,
  type FilmWriteInput,
} from '../domain/filmForm.ts'
import type { FilmMetadataProvenance } from '../domain/filmMetadataAssistance.ts'

/** Une URL d'affiche n'est prévisualisée que si elle est http(s) valide. */
function previewablePosterUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}
import { Poster } from './Poster.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { StatusSegmented, StarRating, FavoriteHeart } from './VerdictControls.tsx'

/** Statuts proposés à la création : les trois qui ont du sens pour un film. */
const FORM_STATUSES: FilmStatus[] = ['à découvrir', 'terminé', 'abandonné']

type FilmFormProps = {
  film?: import('../domain/film.ts').Film
  initialValues?: FilmFormValues
  provenance?: FilmMetadataProvenance | null
  /** Cache TMDB de la fiche en édition : pré-remplit les champs éditoriaux. */
  tmdbCache?: import('../data/tmdbService.ts').CachedFilmTmdbPresentation | null
  /** Modification de l'affiche par URL depuis le crayon sur l'aperçu. */
  onPosterEdit?: (url: string | null) => Promise<void> | void
  /** Rendu en pop-up modale centrée au-dessus de la bibliothèque (fond flouté). */
  asDialog?: boolean
  /** Titre réduit dans une pop-up hôte qui gère déjà son propre en-tête. */
  compactHeading?: boolean
  /** Intégré à une pop-up hôte (0.6.9) : le formulaire vit dans la fenêtre,
      sans <main> pleine page ni barre de retour redondante. */
  embeddedInDialog?: boolean
  /** Accès au cache TMDB en édition (0.6.16) : présent → la fiche associée
      affiche son identité enrichie sans attendre une resaisie manuelle. */
  fetchTmdbCache?: (filmId: string) => Promise<import('../data/tmdbService.ts').CachedFilmTmdbPresentation | null>
  onCancel: () => void
  onSave: (input: FilmWriteInput, provenance: FilmMetadataProvenance | null) => Promise<void>
}

export function FilmForm({ film, initialValues, provenance = null, tmdbCache = null, onPosterEdit, asDialog = false, compactHeading = false, embeddedInDialog = false, fetchTmdbCache, onCancel, onSave }: FilmFormProps) {
  const [values, setValues] = useState<FilmFormValues>(() => film ? filmToFormValues(film) : { ...(initialValues ?? EMPTY_FILM_FORM) })
  const [errors, setErrors] = useState<FilmFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [posterDialogOpen, setPosterDialogOpen] = useState(false)
  const today = localToday()
  // Création assistée : les champs éditoriaux sont déjà portés par la recherche,
  // ils restent dans les valeurs mais ne s'affichent plus comme formulaire.
  const assisted = !film && Boolean(initialValues?.title)
  const isAssociated = Boolean(film && (film.providerName || film.providerId))
  // 0.6.16 : les champs éditoriaux sont ouverts par défaut en modification
  // (associé ou non) — on doit voir ce que la fiche contient. Le repli reste
  // disponible ; seule la création assistée les masque, déjà portés par la
  // recherche.
  const [showEditorial, setShowEditorial] = useState(!assisted)

  // 0.6.16 — identité enrichie en édition : le cache TMDB de la fiche est
  // chargé pour afficher durée, casting et réalisateurs sans resaisie.
  const [enrichment, setEnrichment] = useState<import('../data/tmdbService.ts').CachedFilmTmdbPresentation | null>(tmdbCache)
  useEffect(() => {
    let cancelled = false
    if (!film || !fetchTmdbCache) return
    fetchTmdbCache(film.id).then(
      (cache) => {
        if (!cancelled) setEnrichment(cache)
      },
      (error: unknown) => {
        console.error('Impossible de lire le cache TMDB en édition.', error)
        if (!cancelled) setEnrichment(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [film?.id, fetchTmdbCache])

  // Pré-remplissage éditorial depuis le cache TMDB sans toucher aux données personnelles.
  useEffect(() => {
    if (!tmdbCache) return
    const p = tmdbCache.presentation
    setValues((current) => ({
      ...current,
      originalTitle: current.originalTitle || p.originalTitle || '',
      year: current.year || (p.releaseDate ? String(Number(p.releaseDate.slice(0, 4))) : ''),
      director: current.director || p.directors.join(', '),
      summary: current.summary || p.synopsis || '',
    }))
    // Une seule fois à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // « À découvrir » : pas encore de verdict, on masque note, cœur, date et avis.
  const verdictVisible = values.status !== 'à découvrir'
  const previewTitle = values.title.trim() || 'Titre à renseigner'
  // 0.6.16 : en édition, l'affiche enrichie TMDB est montrée même si la
  // colonne locale est vide — on voit ce que la fiche a vraiment.
  const previewUrl = previewablePosterUrl(values.posterUrl)
    ?? (film ? enrichment?.selectedPosterUrl ?? null : null)

  // Une fiche historique « en attente » reste affichée et modifiable.
  const statusSegments: FilmStatus[] = FORM_STATUSES.includes(values.status)
    ? FORM_STATUSES
    : [...FORM_STATUSES, values.status]
  const ratingValue = values.rating === '' ? null : Number(values.rating)

  const update = <Key extends keyof FilmFormValues>(key: Key, value: FilmFormValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSaveError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = validateFilmForm(values)

    if (!result.success) {
      setErrors(result.errors)
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      await onSave(result.data, provenance)
    } catch (error) {
      console.error('Impossible d’enregistrer le film.', error)
      setSaveError('L’enregistrement a échoué. Vos changements restent dans le formulaire.')
      setSaving(false)
    }
  }

  const heading = compactHeading ? null : (
    <div className="editor-heading">
      <p className="eyebrow">Film</p>
      <h1 className="display-title">{film ? 'Modifier la fiche' : 'Ajouter un film'}</h1>
      <p>{assisted ? 'Ton film est reconnu : choisis juste ton verdict.' : 'Seul le titre est obligatoire.'}</p>
    </div>
  )

  const form = (
    <form className="film-form form-detail" onSubmit={handleSubmit} noValidate>
      {/* Colonne gauche : l'affiche choisie, avec crayon de modification */}
      <div className="form-side">
        <div className="form-poster-frame poster-container">
          <Poster
            title={previewTitle}
            src={previewUrl}
            className="form-poster-preview-lg"
            onEdit={onPosterEdit ? () => setPosterDialogOpen(true) : undefined}
          />
        </div>
        <p className="form-poster-caption">Aperçu de l’affiche</p>
      </div>

      <div className="form-body">
        <div className={`field field-title ${assisted ? 'field-title-read' : ''}`}>
          <label htmlFor="title">Titre <span aria-hidden="true">*</span></label>
          <input
            id="title"
            name="title"
            value={values.title}
            onChange={(event) => update('title', event.target.value)}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? 'title-error' : undefined}
            autoFocus={!assisted}
          />
          {errors.title && <p className="field-error" id="title-error">{errors.title}</p>}
        </div>

        {/* 0.6.16 — identité enrichie TMDB en édition : durée, réalisateurs et
            casting affichés tels que fournis ; ces données ne sont pas
            éditables ici, la correction manuelle passe par les champs
            éditoriaux du bloc « Informations sur le film ». */}
        {film && enrichment && (
          <div className="enrichment-panel">
            <p className="enrichment-source">
              Données enrichies via <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>
            </p>
            {(enrichment.presentation.runtimeMinutes || enrichment.presentation.directors.length > 0) && (
              <p className="enrichment-factline">
                {[
                  enrichment.presentation.releaseDate ? `Sortie ${enrichment.presentation.releaseDate.slice(0, 4)}` : null,
                  enrichment.presentation.runtimeMinutes ? `${Math.floor(enrichment.presentation.runtimeMinutes / 60)} h ${String(enrichment.presentation.runtimeMinutes % 60).padStart(2, '0')}` : null,
                  enrichment.presentation.directors.length > 0 ? enrichment.presentation.directors.join(', ') : null,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
            {enrichment.presentation.cast.length > 0 && (
              <p className="enrichment-cast">
                {enrichment.presentation.cast.slice(0, 5).map((member) => member.name).join(', ')}
                {enrichment.presentation.cast.length > 5 ? '…' : ''}
              </p>
            )}
          </div>
        )}

        {/* Le verdict personnel : statut, note, coup de cœur */}
        <div className="verdict-block">
          <div className="verdict-row">
            <StatusSegmented
              statuses={statusSegments}
              labels={FILM_STATUS_LABELS}
              value={values.status}
              onChange={(next) => update('status', next as FilmFormValues['status'])}
            />
            {verdictVisible && (
              <>
                <StarRating value={ratingValue} onChange={(next) => update('rating', next === null ? '' : String(next))} />
                <FavoriteHeart checked={values.isFavorite} onChange={(next) => update('isFavorite', next)} />
              </>
            )}
          </div>
          {errors.status && <p className="field-error">{errors.status}</p>}

          {verdictVisible && (
            <>
              <div className="date-row">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                <input
                  id="watchedAt"
                  name="watchedAt"
                  type="date"
                  value={values.watchedAt || today}
                  onChange={(event) => update('watchedAt', event.target.value)}
                  aria-label="Date de visionnage"
                  aria-invalid={Boolean(errors.watchedAt)}
                  />
                  </div>
              {errors.watchedAt && <p className="field-error">{errors.watchedAt}</p>}

              <div className="review-write">
                <textarea
                  id="personalNote"
                  name="personalNote"
                  rows={5}
                  placeholder="Qu’as-tu pensé de ce film ?"
                  value={values.personalNote}
                  onChange={(event) => update('personalNote', event.target.value)}
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </>
          )}
          {!verdictVisible && (
            <p className="verdict-hint">Passe le film en « Terminé » ou « Abandonné » pour ajouter ta note, ta date et ton avis.</p>
          )}
        </div>

        {/* Champs éditoriaux : cachés en création assistée, discrets sinon.
            Fermés par défaut ; pré-remplis quand la fiche est associée. */}
        {!assisted && (
          <details className="secondary-fields" open={showEditorial || undefined}>
            <summary onClick={(event) => { event.preventDefault(); setShowEditorial((value) => !value) }}>
              Informations sur le film{isAssociated ? ' · associé à TMDB' : ''}
            </summary>
            {showEditorial && (
              <div className="secondary-fields-content">
                {isAssociated && (
                  <p className="import-hint">Ces informations viennent de TMDB — complète-les seulement si tu le souhaites.</p>
                )}
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="originalTitle">Titre original</label>
                    <input id="originalTitle" value={values.originalTitle} onChange={(event) => update('originalTitle', event.target.value)} />
                  </div>
                  <div className="field field-year">
                    <label htmlFor="year">Année</label>
                    <input
                      id="year"
                      inputMode="numeric"
                      value={values.year}
                      onChange={(event) => update('year', event.target.value)}
                      aria-invalid={Boolean(errors.year)}
                      aria-describedby={errors.year ? 'year-error' : undefined}
                    />
                    {errors.year && <p className="field-error" id="year-error">{errors.year}</p>}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="director">Réalisation</label>
                  <input id="director" value={values.director} onChange={(event) => update('director', event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="summary">Résumé</label>
                  <textarea
                    id="summary"
                    rows={3}
                    value={values.summary}
                    onChange={(event) => update('summary', event.target.value)}
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
              </div>
            )}
          </details>
        )}

        {saveError && <p className="form-error" role="alert">{saveError}</p>}

        <footer className="form-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Annuler</button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : film ? 'Enregistrer les modifications' : 'Ajouter le film'}
          </button>
        </footer>
      </div>
    </form>
  )

  const posterEditor = posterDialogOpen && (
    <PosterUrlDialog
      open
      title={previewTitle}
      label="Affiche"
      currentUrl={values.posterUrl}
      onClose={() => setPosterDialogOpen(false)}
      onSave={async (url) => {
        update('posterUrl', url ?? '')
        await onPosterEdit?.(url)
      }}
    />
  )

  if (asDialog) {
    return (
      <>
        <div className="dialog-backdrop-blur" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}>
          <div className="editor-dialog" role="dialog" aria-modal="true" aria-label={film ? 'Modifier la fiche' : 'Ajouter un film'}>
            <button className="poster-dialog-close editor-dialog-close" type="button" onClick={onCancel} disabled={saving} aria-label="Fermer">×</button>
            {heading}
            {form}
          </div>
        </div>
        {posterEditor}
      </>
    )
  }

  // Pop-up hôte (0.6.9) : en-tête compact et formulaire rendus directement
  // dans la fenêtre, sans <main> pleine page ni barre « ← Annuler » en double.
  if (embeddedInDialog) {
    return (
      <div className="editor-dialog-embedded">
        {heading}
        {form}
      </div>
    )
  }

  return (
    <main className="main editor-main">
      <header className="page-action-bar">
        <button className="back-button" type="button" onClick={onCancel}>← Annuler</button>
      </header>
      {heading}
      {form}
      {posterEditor}
    </main>
  )
}
