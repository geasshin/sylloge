import { t, tc, translateMessage } from '../i18n/core.ts'
import { useState, type FormEvent } from 'react'
import {
  SERIES_CATEGORIES,
  SERIES_CATEGORY_LABELS,
  SERIES_STATUSES,
  SERIES_STATUS_LABELS,
  type Series,
  type SeriesCategory,
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
import type { MediaProviderReference } from '../data/mediaRepository.ts'
import { Poster } from './Poster.tsx'
import { usePosterEditor } from './usePosterEditor.tsx'
import { StatusSegmented, StarRating, FavoriteHeart } from './VerdictControls.tsx'
import { Stepper } from './Stepper.tsx'

const CATEGORY_LABELS = { ...SERIES_CATEGORY_LABELS, animation: 'Animation japonaise' }

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
  creationCategory?: SeriesCategory
  /** Valeurs préremplies par la recherche TMDB (création assistée, jalon 0.4.26). */
  initialValues?: SeriesFormValues
  providerLink?: MediaProviderReference | null
  /** Intégré à une pop-up hôte (0.6.10) : le formulaire vit dans la fenêtre,
      sans <main> pleine page ni barre de retour redondante. */
  embeddedInDialog?: boolean
  onCancel: () => void
  onSave: (input: SeriesWriteInput) => Promise<void>
}

export function SeriesForm({ series, creationCategory, initialValues, providerLink = null, embeddedInDialog = false, onCancel, onSave }: SeriesFormProps) {
  const [values, setValues] = useState<SeriesFormValues>(() => series
    ? seriesToFormValues(series)
    : { ...EMPTY_SERIES_FORM, ...initialValues, category: creationCategory ?? initialValues?.category ?? EMPTY_SERIES_FORM.category })
  const [errors, setErrors] = useState<SeriesFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const today = localToday()
  // Une fiche liée à TMDB conserve une présentation éditoriale en lecture.
  const assisted = providerLink !== null
  const previewTitle = values.title.trim() || t("Titre à renseigner")
  const previewUrl = previewablePosterUrl(values.posterUrl)
  const animation = values.category === 'animation'
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
      if (key === 'status' && value === 'à voir') {
        next.rating = ''
        next.isFavorite = false
        next.seasonsSeen = ''
        next.startedAt = ''
        next.personalNote = ''
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
      <h1 className="display-title">{series ? t("Modifier la fiche") : animation ? t("Ajouter un animé") : t("Ajouter une série")}</h1>
    </div>
  )

  const form = (
    <form className="film-form form-detail form-medium-series" onSubmit={handleSubmit} noValidate>
      <div className="form-side form-side-with-verdict">
        <div className="form-poster-frame">
          <Poster title={previewTitle} src={previewUrl} className="form-poster-preview-lg" {...posterEditor.posterProps} />
        </div>
        <div className={`form-poster-verdict ${verdictVisible ? 'is-visible' : 'is-empty'}`}>
          {verdictVisible && (
            <>
              <StarRating value={ratingValue} onChange={(next) => update('rating', next === null ? '' : String(next))} />
              <FavoriteHeart checked={values.isFavorite} onChange={(next) => update('isFavorite', next)} />
            </>
          )}
        </div>
      </div>

      <div className="form-body">
        <div className="form-body-scroll">
          <div className={`field field-title ${assisted ? 'field-title-read' : ''}`}>
            <input
              id="series-title"
              name="title"
              value={values.title}
              onChange={(event) => update('title', event.target.value)}
              aria-label={animation ? t("Titre de l’animation japonaise") : tc('series', "Titre de la série")}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'series-title-error' : undefined}
              autoFocus={!assisted}
            />
            {errors.title && <p className="field-error" id="series-title-error">{translateMessage(errors.title)}</p>}
          </div>

          {(series || !creationCategory) && <div className="field category-segmented">
            <span className="field-label">{t("Type")}</span>
            <StatusSegmented
              statuses={SERIES_CATEGORIES}
              labels={CATEGORY_LABELS}
              value={values.category}
              onChange={(next) => update('category', next as SeriesFormValues['category'])}
              ariaLabel={t("Type de série")}
            />
            {errors.category && <p className="field-error" id="series-category-error">{translateMessage(errors.category)}</p>}
          </div>}

          {/* Le verdict personnel */}
          <div className="verdict-block medium-status-block">
            <div className="verdict-row status-date-row">
              <StatusSegmented
                statuses={SERIES_STATUSES}
                labels={SERIES_STATUS_LABELS}
                value={values.status}
                onChange={(next) => update('status', next as SeriesFormValues['status'])}
              />
              {verdictVisible && (
                <div className="date-row">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                  <input
                    id="series-startedAt"
                    name="startedAt"
                    type="date"
                    value={values.startedAt || today}
                    onChange={(event) => update('startedAt', event.target.value)}
                    aria-label={t("Début du visionnage")}
                    aria-invalid={Boolean(errors.startedAt)}
                  />
                </div>
              )}
            </div>
            {errors.status && <p className="field-error">{translateMessage(errors.status)}</p>}
            {verdictVisible && errors.startedAt && <p className="field-error">{translateMessage(errors.startedAt)}</p>}
          </div>

          {providerLink && (
            <section className="provider-information-card" aria-label={t("Informations sur la série fournies par TMDB")}>
              <div className="provider-information-heading">
                <strong>{t("Informations sur la série")}</strong>
                <small>{t('Données : {provider}', { provider: providerLink.providerName })}</small>
              </div>
              <dl className="provider-information-list">
                {values.showrunner.trim() && <div><dt>{t("Showrunner")}</dt><dd>{values.showrunner}</dd></div>}
                {values.casting.trim() && <div><dt>{t("Casting")}</dt><dd>{values.casting}</dd></div>}
                {values.summary.trim() && <div className="provider-information-summary"><dt>{t("Résumé")}</dt><dd>{values.summary}</dd></div>}
              </dl>
            </section>
          )}

          {/* La progression factuelle précède la conclusion personnelle. */}
          {verdictVisible && progressVisible && (
            <fieldset className="progress-fields verdict-progress">
              <div className="form-row">
                <Stepper
                  id="seasonsSeen"
                  label={t("Saisons vues")}
                  value={values.seasonsSeen}
                  onChange={(value) => update('seasonsSeen', value)}
                  max={values.seasonsTotal.trim() === '' ? null : Number(values.seasonsTotal)}
                  error={errors.seasonsSeen ? translateMessage(errors.seasonsSeen) : undefined}
                  describedBy={errors.seasonsSeen ? 'seasonsSeen-error' : undefined}
                />
                <Stepper
                  id="seasonsTotal"
                  label={t("Saisons au total")}
                  value={values.seasonsTotal}
                  readOnly
                  hint={assisted ? t("fourni par TMDB") : undefined}
                />
              </div>
              {values.status === 'vue' && (
                <p className="field-help">{t("Série à jour : si une nouvelle saison sort, la série repassera en cours.")}</p>
              )}
            </fieldset>
          )}

          {/* L’avis conclut la fiche Série, après la progression. */}
          {verdictVisible && (
            <div className="review-write review-inline">
              <textarea
                id="series-personalNote"
                name="personalNote"
                aria-label={t("Critique personnelle")}
                rows={5}
                placeholder={t(animation ? 'Avis sur cette animation japonaise…' : 'Qu’as-tu pensé de cette série ?')}
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
                <label htmlFor="series-showrunner">{t("Showrunner")}</label>
                <input id="series-showrunner" value={values.showrunner} onChange={(event) => update('showrunner', event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="series-casting">{t("Casting")}</label>
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
                <label htmlFor="series-summary">{t("Résumé")}</label>
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

          {saveError && <p className="form-error" role="alert">{translateMessage(saveError)}</p>}
        </div>

        <footer className="form-actions form-actions-docked">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>{t("Annuler")}</button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? t("Enregistrement…") : series ? t("Enregistrer les modifications") : animation ? t("Ajouter l’animation japonaise") : t("Ajouter la série")}
          </button>
        </footer>
      </div>
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
        <button className="back-button" type="button" onClick={onCancel}>{t("← Annuler")}</button>
      </header>
      {heading}
      {form}
      {posterEditor.posterDialog}
    </main>
  )
}
