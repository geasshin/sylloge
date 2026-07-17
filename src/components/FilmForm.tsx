import { useState, type FormEvent } from 'react'
import { FILM_STATUSES, FILM_STATUS_LABELS, type Film } from '../domain/film.ts'
import {
  EMPTY_FILM_FORM,
  filmToFormValues,
  localToday,
  validateFilmForm,
  type FilmFormErrors,
  type FilmFormValues,
  type FilmWriteInput,
} from '../domain/filmForm.ts'
import { Poster } from './Poster.tsx'

const RATINGS = Array.from({ length: 10 }, (_, index) => (index + 1) / 2)

function previewablePosterUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

type FilmFormProps = {
  film?: Film
  onCancel: () => void
  onSave: (input: FilmWriteInput) => Promise<void>
}

export function FilmForm({ film, onCancel, onSave }: FilmFormProps) {
  const [values, setValues] = useState<FilmFormValues>(() => film ? filmToFormValues(film) : { ...EMPTY_FILM_FORM })
  const [errors, setErrors] = useState<FilmFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const today = localToday()
  const hasSecondaryDetails = Boolean(film && (film.originalTitle || film.director || film.year || film.summary))
  const previewTitle = values.title.trim() || 'Titre à renseigner'
  const previewUrl = previewablePosterUrl(values.posterUrl)

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
      await onSave(result.data)
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
        <p>Seul le titre est obligatoire.</p>
      </div>

      <form className="film-form" onSubmit={handleSubmit} noValidate>
        <div className="field field-title">
          <label htmlFor="title">Titre <span aria-hidden="true">*</span></label>
          <input
            id="title"
            name="title"
            value={values.title}
            onChange={(event) => update('title', event.target.value)}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? 'title-error' : undefined}
            autoFocus
          />
          {errors.title && <p className="field-error" id="title-error">{errors.title}</p>}
        </div>

        <div className="form-row relationship-row">
          <div className="field">
            <label htmlFor="status">Statut</label>
            <select
              id="status"
              name="status"
              value={values.status}
              onChange={(event) => update('status', event.target.value as FilmFormValues['status'])}
              aria-invalid={Boolean(errors.status)}
              aria-describedby={errors.status ? 'status-error' : undefined}
            >
              {FILM_STATUSES.map((status) => <option value={status} key={status}>{FILM_STATUS_LABELS[status]}</option>)}
            </select>
            {errors.status && <p className="field-error" id="status-error">{errors.status}</p>}
          </div>

          <div className="field">
            <label htmlFor="rating">Note</label>
            <select
              id="rating"
              name="rating"
              value={values.rating}
              onChange={(event) => update('rating', event.target.value)}
              aria-invalid={Boolean(errors.rating)}
              aria-describedby={errors.rating ? 'rating-error' : undefined}
            >
              <option value="">Aucune note</option>
              {RATINGS.map((rating) => <option value={rating} key={rating}>{rating.toLocaleString('fr-FR')} / 5</option>)}
            </select>
            {errors.rating && <p className="field-error" id="rating-error">{errors.rating}</p>}
          </div>
        </div>

        <label className="favorite-control">
          <input
            type="checkbox"
            checked={values.isFavorite}
            onChange={(event) => update('isFavorite', event.target.checked)}
          />
          <span>Ajouter aux favoris</span>
        </label>

        <div className="field">
          <label htmlFor="watchedAt">Date de visionnage</label>
          <input
            id="watchedAt"
            name="watchedAt"
            type="date"
            value={values.watchedAt}
            onChange={(event) => update('watchedAt', event.target.value)}
            aria-invalid={Boolean(errors.watchedAt)}
            aria-describedby={errors.watchedAt ? 'watchedAt-error' : undefined}
          />
          {errors.watchedAt && <p className="field-error" id="watchedAt-error">{errors.watchedAt}</p>}
          {values.status === 'terminé' && !values.watchedAt && (
            <div className="date-suggestion">
              <span>Film terminé. La date reste facultative.</span>
              <button type="button" onClick={() => update('watchedAt', today)}>Utiliser aujourd’hui</button>
            </div>
          )}
        </div>

        <details className="secondary-fields" open={hasSecondaryDetails || undefined}>
          <summary>Informations sur le film</summary>
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
          </div>
        </details>

        <div className="field">
          <label htmlFor="posterUrl">URL directe de l’affiche</label>
          <input
            id="posterUrl"
            name="posterUrl"
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
          <div className="poster-preview">
            <p>Aperçu de l’affiche</p>
            <Poster title={previewTitle} src={previewUrl} className="form-poster-preview" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="personalNote">Texte personnel</label>
          <textarea
            id="personalNote"
            name="personalNote"
            rows={5}
            value={values.personalNote}
            onChange={(event) => update('personalNote', event.target.value)}
          />
        </div>

        {saveError && <p className="form-error" role="alert">{saveError}</p>}

        <footer className="form-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Annuler</button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : film ? 'Enregistrer les modifications' : 'Ajouter le film'}
          </button>
        </footer>
      </form>
    </main>
  )
}
