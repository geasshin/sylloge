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
import { usePosterEditor } from './usePosterEditor.tsx'
import { StatusSegmented, StarRating, FavoriteHeart } from './VerdictControls.tsx'
import { Stepper } from './Stepper.tsx'

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
  /** Intégré à une pop-up hôte (0.6.10) : le formulaire vit dans la fenêtre,
      sans <main> pleine page ni barre de retour redondante. */
  embeddedInDialog?: boolean
  onCancel: () => void
  onSave: (input: SeriesWriteInput) => Promise<void>
}

export function SeriesForm({ series, initialValues, embeddedInDialog = false, onCancel, onSave }: SeriesFormProps) {
  const [values, setValues] = useState<SeriesFormValues>(() => series ? seriesToFormValues(series) : { ...EMPTY_SERIES_FORM, ...initialValues })
  const [errors, setErrors] = useState<SeriesFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const today = localToday()
  // Création assistée : les champs éditoriaux sont déjà portés par la recherche.
  const assisted = !series && Boolean(initialValues?.title)
  const previewTitle = values.title.trim() || 'Titre à renseigner'
  const previewUrl = previewablePosterUrl(values.posterUrl)
  const progressVisible = values.status === 'en cours' || values.status === 'abandonnée' || values.status === 'vue'
  const ratingValue = values.rating === '' ? null : Number(values.rating)
  // « À voir » : pas encore de verdict, on masque note, cœur, dates et avis.
  const verdictVisible = values.status !== 'à voir'

  // Crayon commun sur l'affiche (0.6.11) : modification par URL, locale.
  const posterEditor = usePosterEditor({
    title: previewTitle,
    label: 'Affiche',
    currentUrl: values.posterUrl,
    onSave: (url) => update('posterUrl', url ?? ''),
  })

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

  const heading = embeddedInDialog ? null : (
    <div className="editor-heading">
      <p className="eyebrow">Série</p>
      <h1 className="display-title">{series ? 'Modifier la fiche' : 'Ajouter une série'}</h1>
    </div>
  )

  const form = (
    <form className="film-form form-detail" onSubmit={handleSubmit} noValidate>
      <div className="form-side">
        <div className="form-poster-frame">
          <Poster title={previewTitle} src={previewUrl} className="form-poster-preview-lg" {...posterEditor.posterProps} />
        </div>
      </div>

      <div className="form-body">
          <div className={`field field-title ${assisted ? 'field-title-read' : ''}`}>
            <input
              id="series-title"
              name="title"
              value={values.title}
              onChange={(event) => update('title', event.target.value)}
              aria-label="Titre de la série"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'series-title-error' : undefined}
              autoFocus={!assisted}
            />
            {errors.title && <p className="field-error" id="series-title-error">{errors.title}</p>}
          </div>

          {/* Catégorie Série / Animé : visible en permanence (0.6.11),
              au-dessus du verdict, dans le même gabarit segmenté. */}
          <div className="field category-inline">
            <label htmlFor="series-category">Type</label>
            <select
              id="series-category"
              name="category"
              value={values.category}
              onChange={(event) => update('category', event.target.value as SeriesFormValues['category'])}
            >
              {SERIES_CATEGORIES.map((category) => (
                <option value={category} key={category}>{SERIES_CATEGORY_LABELS[category]}</option>
              ))}
            </select>
          </div>

          {/* Le verdict personnel */}
          <div className="verdict-block">
            <div className="verdict-row">
              <StatusSegmented
                statuses={SERIES_STATUSES}
                labels={SERIES_STATUS_LABELS}
                value={values.status}
                onChange={(next) => update('status', next as SeriesFormValues['status'])}
              />
            </div>

            {verdictVisible && progressVisible && (
              <fieldset className="progress-fields verdict-progress">
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
                    readOnly
                    hint={assisted ? 'fourni par TMDB' : undefined}
                  />
                </div>
                {values.status === 'vue' && (
                  <p className="field-help">Série à jour : si une nouvelle saison sort, la série repassera en cours.</p>
                )}
              </fieldset>
            )}

            {verdictVisible && (
              <div className="date-row">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                <input
                  id="series-startedAt"
                  name="startedAt"
                  type="date"
                  value={values.startedAt || today}
                  onChange={(event) => update('startedAt', event.target.value)}
                  aria-label="Début du visionnage"
                  aria-invalid={Boolean(errors.startedAt)}
                />
              </div>
            )}
            {verdictVisible && errors.startedAt && <p className="field-error">{errors.startedAt}</p>}
            {verdictVisible && (
              <div className="poster-verdict verdict-inline">
                <StarRating value={ratingValue} onChange={(next) => update('rating', next === null ? '' : String(next))} />
                <FavoriteHeart checked={values.isFavorite} onChange={(next) => update('isFavorite', next)} />
              </div>
            )}
          </div>

          {/* L'avis pleine largeur (0.6.18b) : enfant direct de la grille. */}
          {verdictVisible && (
            <div className="review-write review-full">
              <textarea
                id="series-personalNote"
                name="personalNote"
                rows={5}
                placeholder="Qu’as-tu pensé de cette série ?"
                value={values.personalNote}
                onChange={(event) => update('personalNote', event.target.value)}
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          )}

          {/* Champs éditoriaux visibles sans toggle : la fiche reste directement
              modifiable, qu'elle soit enrichie ou non. */}
          {!assisted && (
            <div className="secondary-fields editorial-open">
              <div className="field">
                <label htmlFor="series-showrunner">Showrunner</label>
                <input id="series-showrunner" value={values.showrunner} onChange={(event) => update('showrunner', event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="series-casting">Casting</label>
                <textarea
                  id="series-casting"
                  rows={2}
                  value={values.casting}
                  onChange={(event) => update('casting', event.target.value)}
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <div className="field">
                <label htmlFor="series-summary">Résumé</label>
                <textarea
                  id="series-summary"
                  rows={3}
                  value={values.summary}
                  onChange={(event) => update('summary', event.target.value)}
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>
          )}

          {saveError && <p className="form-error" role="alert">{saveError}</p>}
      </div>

      {verdictVisible && (
        <div className="review-write review-full">
          <textarea
            id="series-personalNote"
            name="personalNote"
            rows={5}
            placeholder="Qu’as-tu pensé de cette série ?"
            value={values.personalNote}
            onChange={(event) => update('personalNote', event.target.value)}
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      )}

      <footer className="form-actions form-actions-full">
        <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Annuler</button>
        <button className="primary-button" type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : series ? 'Enregistrer les modifications' : 'Ajouter la série'}
        </button>
      </footer>
    </form>
  )

  // Pop-up hôte (0.6.10) : en-tête compact et formulaire rendus directement
  // dans la fenêtre, sans <main> pleine page ni barre « ← Annuler » en double.
  if (embeddedInDialog) {
    return (
      <div className="editor-dialog-embedded">
        {heading}
        {form}
        {posterEditor.posterDialog}
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
      {posterEditor.posterDialog}
    </main>
  )
}
