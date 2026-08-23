import { useState, type FormEvent } from 'react'
import {
  SERIES_CATEGORIES,
  SERIES_CATEGORY_LABELS,
  SERIES_STATUSES,
  SERIES_STATUS_LABELS,
  type Series,
} from '../domain/series.ts'
import {
  EMPTY_SERIES_FORM,
  resolveSeriesStatusForTotalChange,
  seriesToFormValues,
  validateSeriesForm,
  type SeriesFormErrors,
  type SeriesFormValues,
  type SeriesWriteInput,
} from '../domain/seriesForm.ts'
import { localToday } from '../domain/filmForm.ts'
import { Poster } from './Poster.tsx'
import { StatusSegmented, StarRating, FavoriteHeart } from './VerdictControls.tsx'
import { Stepper } from './Stepper.tsx'

const RATINGS = Array.from({ length: 10 }, (_, index) => (index + 1) / 2)

function previewablePosterUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

type SeriesFormProps = {
  series?: Series
  /** Valeurs préremplies par la recherche TMDB (création assistée, jalon 0.4.26). */
  initialValues?: SeriesFormValues
  onCancel: () => void
  onSave: (input: SeriesWriteInput) => Promise<void>
}

export function SeriesForm({ series, initialValues, onCancel, onSave }: SeriesFormProps) {
  const [values, setValues] = useState<SeriesFormValues>(() => series ? seriesToFormValues(series) : { ...EMPTY_SERIES_FORM, ...initialValues })
  const [errors, setErrors] = useState<SeriesFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const today = localToday()
  const hasSecondaryDetails = Boolean(
    series
      ? series.showrunner || series.casting || series.summary
      : initialValues && (initialValues.showrunner || initialValues.casting || initialValues.summary),
  )
  const previewTitle = values.title.trim() || 'Titre à renseigner'
  const previewUrl = previewablePosterUrl(values.posterUrl)
  const progressVisible = values.status === 'en cours' || values.status === 'abandonnée' || values.status === 'vue'

  const update = <Key extends keyof SeriesFormValues>(key: Key, value: SeriesFormValues[Key]) => {
    setValues((current) => {
      const next = { ...current, [key]: value }
      // Une nouvelle saison sortie fait repasser une série « vue » en cours.
      if (key === 'seasonsTotal' || key === 'seasonsSeen') {
        const seen = next.seasonsSeen.trim() === '' ? null : Number(next.seasonsSeen)
        const total = next.seasonsTotal.trim() === '' ? null : Number(next.seasonsTotal)
        next.status = resolveSeriesStatusForTotalChange(
          current.status,
          Number.isFinite(seen) ? seen : null,
          Number.isFinite(total) ? total : null,
        )
      }
      // Marquer « vue » aligne immédiatement les saisons vues sur le total connu.
      if (key === 'status' && value === 'vue' && current.seasonsTotal.trim() !== '') {
        next.seasonsSeen = current.seasonsTotal
      }
      return next
    })
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSaveError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = validateSeriesForm(values)

    if (!result.success) {
      setErrors(result.errors)
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      await onSave(result.data)
    } catch (error) {
      console.error('Impossible d’enregistrer la série.', error)
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
        <p className="eyebrow">Série</p>
        <h1 className="display-title">{series ? 'Modifier la fiche' : 'Ajouter une série'}</h1>
        <p>Seul le titre est obligatoire.</p>
      </div>

      <form className="film-form" onSubmit={handleSubmit} noValidate>
        <div className="field field-title">
          <label htmlFor="series-title">Titre <span aria-hidden="true">*</span></label>
          <input
            id="series-title"
            name="title"
            value={values.title}
            onChange={(event) => update('title', event.target.value)}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? 'series-title-error' : undefined}
            autoFocus
          />
          {errors.title && <p className="field-error" id="series-title-error">{errors.title}</p>}
        </div>

        <div className="form-row relationship-row">
          <div className="field">
            <label htmlFor="series-category">Catégorie</label>
            <select
              id="series-category"
              name="category"
              value={values.category}
              onChange={(event) => update('category', event.target.value as SeriesFormValues['category'])}
              aria-invalid={Boolean(errors.category)}
              aria-describedby={errors.category ? 'series-category-error' : undefined}
            >
              {SERIES_CATEGORIES.map((category) => (
                <option value={category} key={category}>{SERIES_CATEGORY_LABELS[category]}</option>
              ))}
            </select>
            {errors.category && <p className="field-error" id="series-category-error">{errors.category}</p>}
          </div>

          <div className="field">
            <StatusSegmented
              statuses={SERIES_STATUSES}
              labels={SERIES_STATUS_LABELS}
              value={values.status}
              onChange={(next) => update('status', next as SeriesFormValues['status'])}
            />
            {errors.status && <p className="field-error" id="series-status-error">{errors.status}</p>}
          </div>

          <div className="field">
            <StarRating
              value={values.rating === '' ? null : Number(values.rating)}
              onChange={(next) => update('rating', next === null ? '' : String(next))}
            />
            {errors.rating && <p className="field-error" id="series-rating-error">{errors.rating}</p>}
          </div>
        </div>

        <div className="favorite-heart-row">
          <FavoriteHeart checked={values.isFavorite} onChange={(next) => update('isFavorite', next)} />
          <span>Coup de cœur</span>
        </div>

        {progressVisible && (
          <fieldset className="progress-fields">
            <legend>Avancement</legend>
            <div className="form-row">
              <Stepper
                id="seasonsSeen"
                label="Saisons vues"
                value={values.seasonsSeen}
                onChange={(value) => update('seasonsSeen', value)}
                max={values.seasonsTotal.trim() === '' ? null : Number(values.seasonsTotal)}
                error={errors.seasonsSeen}
                describedBy={errors.seasonsSeen ? 'seasonsSeen-error' : undefined}
              />
              <Stepper
                id="seasonsTotal"
                label="Saisons au total"
                value={values.seasonsTotal}
                onChange={(value) => update('seasonsTotal', value)}
                error={errors.seasonsTotal}
                describedBy={errors.seasonsTotal ? 'seasonsTotal-error' : undefined}
              />
            </div>
            {values.status === 'vue' && (
              <p className="field-help">Une série vue est à jour : si une nouvelle saison sort, augmentez le total et elle repassera en cours.</p>
            )}
          </fieldset>
        )}

        <div className="field">
          <label htmlFor="series-startedAt">Début du visionnage</label>
          <input
            id="series-startedAt"
            name="startedAt"
            type="date"
            value={values.startedAt}
            onChange={(event) => update('startedAt', event.target.value)}
            aria-invalid={Boolean(errors.startedAt)}
            aria-describedby={errors.startedAt ? 'series-startedAt-error' : undefined}
          />
          {errors.startedAt && <p className="field-error" id="series-startedAt-error">{errors.startedAt}</p>}
          {progressVisible && !values.startedAt && (
            <div className="date-suggestion">
              <span>La date de début reste facultative.</span>
              <button type="button" onClick={() => update('startedAt', today)}>Utiliser aujourd’hui</button>
            </div>
          )}
        </div>

        <details className="secondary-fields" open={hasSecondaryDetails || undefined}>
          <summary>Informations sur la série</summary>
          <div className="secondary-fields-content">
            <div className="field">
              <label htmlFor="series-showrunner">Showrunner</label>
              <input id="series-showrunner" value={values.showrunner} onChange={(event) => update('showrunner', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="series-casting">Casting</label>
              <textarea id="series-casting" rows={2} value={values.casting} onChange={(event) => update('casting', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="series-summary">Résumé</label>
              <textarea id="series-summary" rows={3} value={values.summary} onChange={(event) => update('summary', event.target.value)} />
            </div>
          </div>
        </details>

        <div className="field">
          <label htmlFor="series-posterUrl">URL directe de l’affiche</label>
          <input
            id="series-posterUrl"
            name="posterUrl"
            type="url"
            inputMode="url"
            placeholder="https://…/affiche.jpg"
            value={values.posterUrl}
            onChange={(event) => update('posterUrl', event.target.value)}
            aria-invalid={Boolean(errors.posterUrl)}
            aria-describedby={`series-poster-help${errors.posterUrl ? ' series-poster-error' : ''}`}
          />
          <p className="field-help" id="series-poster-help">Une image indisponible n’empêchera pas l’enregistrement.</p>
          {errors.posterUrl && <p className="field-error" id="series-poster-error">{errors.posterUrl}</p>}
          <div className="poster-preview">
            <p>Aperçu de l’affiche</p>
            <Poster title={previewTitle} src={previewUrl} className="form-poster-preview" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="series-personalNote">Avis personnel</label>
          <textarea
            id="series-personalNote"
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
            {saving ? 'Enregistrement…' : series ? 'Enregistrer les modifications' : 'Ajouter la série'}
          </button>
        </footer>
      </form>
    </main>
  )
}
