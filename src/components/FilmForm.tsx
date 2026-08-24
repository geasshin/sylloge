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
  onCancel: () => void
  onSave: (input: FilmWriteInput, provenance: FilmMetadataProvenance | null) => Promise<void>
}

export function FilmForm({ film, initialValues, provenance = null, tmdbCache = null, onPosterEdit, asDialog = false, onCancel, onSave }: FilmFormProps) {
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
  // Toggle « Informations sur le film » fermé par défaut ; pré-rempli si associé.
  const [showEditorial, setShowEditorial] = useState(!assisted && !(isAssociated || Boolean(tmdbCache)))

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
  const previewUrl = previewablePosterUrl(values.posterUrl)

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

  const heading = (
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
                  value={values.watchedAt}
                  onChange={(event) => update('watchedAt', event.target.value)}
                  aria-label="Date de visionnage"
                  aria-invalid={Boolean(errors.watchedAt)}
                />
                {values.watchedAt !== today && (
                  <button type="button" className="link-accent" onClick={() => update('watchedAt', today)}>
                    Utiliser aujourd’hui
                  </button>
                )}
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
