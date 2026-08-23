import { useState, type FormEvent } from 'react'
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
import { Poster } from './Poster.tsx'
import { StatusSegmented, StarRating, FavoriteHeart } from './VerdictControls.tsx'

/** Statuts proposés à la création : les trois qui ont du sens pour un film. */
const FORM_STATUSES: FilmStatus[] = ['à découvrir', 'terminé', 'abandonné']

function previewablePosterUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

type FilmFormProps = {
  film?: import('../domain/film.ts').Film
  initialValues?: FilmFormValues
  provenance?: FilmMetadataProvenance | null
  onCancel: () => void
  onSave: (input: FilmWriteInput, provenance: FilmMetadataProvenance | null) => Promise<void>
}

export function FilmForm({ film, initialValues, provenance = null, onCancel, onSave }: FilmFormProps) {
  const [values, setValues] = useState<FilmFormValues>(() => film ? filmToFormValues(film) : { ...(initialValues ?? EMPTY_FILM_FORM) })
  const [errors, setErrors] = useState<FilmFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const today = localToday()
  // Création assistée : les champs éditoriaux sont déjà portés par la recherche,
  // ils restent dans les valeurs mais ne s'affichent plus comme formulaire.
  const assisted = !film && Boolean(initialValues?.title)
  const [showEditorial, setShowEditorial] = useState(!assisted)
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

  return (
    <main className="main editor-main">
      <header className="page-action-bar">
        <button className="back-button" type="button" onClick={onCancel}>← Annuler</button>
      </header>

      <div className="editor-heading">
        <p className="eyebrow">Film</p>
        <h1 className="display-title">{film ? 'Modifier la fiche' : 'Ajouter un film'}</h1>
        <p>{assisted ? 'Ton film est reconnu : choisis juste ton verdict.' : 'Seul le titre est obligatoire.'}</p>
      </div>

      <form className="film-form form-detail" onSubmit={handleSubmit} noValidate>
        {/* Colonne gauche : l'affiche choisie, comme sur la fiche */}
        <div className="form-side">
          <div className="form-poster-frame">
            <Poster title={previewTitle} src={previewUrl} className="form-poster-preview-lg" />
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
              <StarRating value={ratingValue} onChange={(next) => update('rating', next === null ? '' : String(next))} />
              <FavoriteHeart checked={values.isFavorite} onChange={(next) => update('isFavorite', next)} />
            </div>
            {errors.status && <p className="field-error">{errors.status}</p>}

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
              />
            </div>
          </div>

          {/* Champs éditoriaux : cachés en création assistée, discrets sinon */}
          {!assisted && (
            <details className="secondary-fields" open={showEditorial || undefined}>
              <summary onClick={(event) => { event.preventDefault(); setShowEditorial((value) => !value) }}>
                Informations sur le film
              </summary>
              {showEditorial && (
                <div className="secondary-fields-content">
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
                    <textarea id="summary" rows={3} value={values.summary} onChange={(event) => update('summary', event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="posterUrl">URL directe de l’affiche</label>
                    <input
                      id="posterUrl"
                      type="url"
                      inputMode="url"
                      placeholder="https://…/affiche.jpg"
                      value={values.posterUrl}
                      onChange={(event) => update('posterUrl', event.target.value)}
                      aria-invalid={Boolean(errors.posterUrl)}
                      aria-describedby={`poster-help${errors.posterUrl ? ' poster-error' : ''}`}
                    />
                    <p className="field-help" id="poster-help">Une image indisponible n’empêchera pas l’enregistrement.</p>
                    {errors.posterUrl && <p className="field-error" id="poster-error">{errors.posterUrl}</p>}
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
    </main>
  )
}
