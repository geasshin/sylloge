import { t, tc, translateMessage } from '../i18n/core.ts'
import { useState, type FormEvent } from 'react'
import {
  CUSTOM_LIBRARY_TEMPLATES,
  customEntryToFormValues,
  emptyCustomEntryForm,
  validateCustomEntryForm,
  type CustomEntry,
  type CustomEntryFormErrors,
  type CustomEntryFormValues,
  type CustomEntryWriteInput,
  type CustomLibraryId,
} from '../domain/customLibraries.ts'
import { Poster, type PosterLabel } from './Poster.tsx'
import { Select } from './Select.tsx'
import { QuotesEditor } from './Quotes.tsx'
import { usePosterEditor } from './usePosterEditor.tsx'
import { FavoriteHeart, StarRating, StatusSegmented } from './VerdictControls.tsx'

export function customCoverLabel(libraryId: CustomLibraryId): PosterLabel {
  return libraryId === 'documentaries' || libraryId === 'shows' ? 'Affiche' : 'Couverture'
}

function previewableUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

type CustomEntryFormProps = {
  libraryId: CustomLibraryId
  entry?: CustomEntry
  /** Arrivée depuis « Ajouter une citation » : ouvre un passage vide et le focalise. */
  initialQuoteDraft?: boolean
  onCancel: () => void
  onSave: (input: CustomEntryWriteInput) => Promise<void>
}

/**
 * Formulaire commun aux bibliothèques personnalisées, composé d’après le
 * modèle : statuts proposés, progression, date, champs propres et citations.
 * Même gabarit que les autres médiums (visuel et verdict à gauche).
 */
export function CustomEntryForm({ libraryId, entry, initialQuoteDraft = false, onCancel, onSave }: CustomEntryFormProps) {
  const template = CUSTOM_LIBRARY_TEMPLATES[libraryId]
  const [values, setValues] = useState<CustomEntryFormValues>(() => {
    const base = entry ? customEntryToFormValues(entry) : emptyCustomEntryForm(libraryId)
    return initialQuoteDraft ? { ...base, quotes: [...base.quotes, ''] } : base
  })
  const [errors, setErrors] = useState<CustomEntryFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const coverLabel = customCoverLabel(libraryId)
  const previewTitle = values.title.trim() || t("Titre à renseigner")
  const ratingValue = values.rating === '' ? null : Number(values.rating)
  const started = values.status !== 'à découvrir'
  const progressVisible = template.progress !== null && started
  const dateVisible = values.status === 'terminé' || values.status === 'abandonné'
  const idPrefix = `custom-${libraryId}`

  const posterEditor = usePosterEditor({
    title: previewTitle,
    label: coverLabel,
    currentUrl: values.coverUrl,
    onSave: (url) => update('coverUrl', url ?? ''),
  })

  function update<Key extends keyof CustomEntryFormValues>(key: Key, value: CustomEntryFormValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSaveError(null)
  }

  const updateDetail = (key: string, value: string) => {
    setValues((current) => ({ ...current, details: { ...current.details, [key]: value } }))
    setSaveError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = validateCustomEntryForm(libraryId, values)
    if (!result.success) {
      setErrors(result.errors)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(result.data)
    } catch (error) {
      console.error('Impossible d’enregistrer la fiche.', error)
      setSaveError('L’enregistrement a échoué. Vos changements restent dans le formulaire.')
      setSaving(false)
    }
  }

  return (
    <div className="editor-dialog-embedded">
      <form className={`film-form form-detail form-medium-custom ${template.coverShape === 'square' ? 'form-cover-square' : ''}`} onSubmit={handleSubmit} noValidate>
        <div className="form-side form-side-with-verdict">
          <div className="form-poster-frame">
            <Poster
              title={previewTitle}
              src={previewableUrl(values.coverUrl)}
              className={`form-poster-preview-lg ${template.coverShape === 'square' ? 'poster-square' : ''}`}
              label={coverLabel}
              {...posterEditor.posterProps}
            />
          </div>
          <div className={`form-poster-verdict ${started ? 'is-visible' : 'is-empty'}`}>
            {started && (
              <>
                <StarRating value={ratingValue} onChange={(next) => update('rating', next === null ? '' : String(next))} />
                <FavoriteHeart checked={values.isFavorite} onChange={(next) => update('isFavorite', next)} />
              </>
            )}
          </div>
        </div>

        <div className="form-body">
          <div className="form-body-scroll">
            <div className="field field-title">
              <input
                id={`${idPrefix}-title`}
                name="title"
                value={values.title}
                onChange={(event) => update('title', event.target.value)}
                aria-label={t("Titre")}
                placeholder={t("Titre")}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? `${idPrefix}-title-error` : undefined}
                autoFocus={!initialQuoteDraft}
              />
              {errors.title && <p className="field-error" id={`${idPrefix}-title-error`}>{translateMessage(errors.title)}</p>}
            </div>

            <div className="verdict-block medium-status-block">
              <div className="verdict-row status-date-row">
                <StatusSegmented
                  statuses={template.statuses}
                  labels={template.statusLabels}
                  value={values.status}
                  onChange={(next) => update('status', next as CustomEntryFormValues['status'])}
                />
                {dateVisible && (
                  <div className="date-row">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                    <input
                      id={`${idPrefix}-finishedAt`}
                      type="date"
                      value={values.finishedAt}
                      onChange={(event) => update('finishedAt', event.target.value)}
                      aria-label={tc(libraryId, template.dateLabel)}
                      title={tc(libraryId, template.dateLabel)}
                      aria-invalid={Boolean(errors.finishedAt)}
                    />
                  </div>
                )}
              </div>
              {errors.finishedAt && <p className="field-error">{translateMessage(errors.finishedAt)}</p>}
            </div>

            {progressVisible && template.progress && (
              <div className="form-row form-row-halves custom-progress">
                <div className="field">
                  <label htmlFor={`${idPrefix}-progressCurrent`}>{tc(libraryId, template.progress.label)}</label>
                  <input
                    id={`${idPrefix}-progressCurrent`}
                    inputMode="numeric"
                    value={values.progressCurrent}
                    onChange={(event) => update('progressCurrent', event.target.value)}
                    aria-invalid={Boolean(errors.progressCurrent)}
                  />
                  {errors.progressCurrent && <p className="field-error">{translateMessage(errors.progressCurrent)}</p>}
                </div>
                {template.progress.hasTotal && (
                  <div className="field">
                    <label htmlFor={`${idPrefix}-progressTotal`}>{t("Total")}</label>
                    <input
                      id={`${idPrefix}-progressTotal`}
                      inputMode="numeric"
                      value={values.progressTotal}
                      onChange={(event) => update('progressTotal', event.target.value)}
                      aria-invalid={Boolean(errors.progressTotal)}
                    />
                    {errors.progressTotal && <p className="field-error">{translateMessage(errors.progressTotal)}</p>}
                  </div>
                )}
              </div>
            )}

            {started && (
              <div className="review-write review-inline">
                <textarea
                  id={`${idPrefix}-personalNote`}
                  aria-label={t("Avis personnel")}
                  rows={5}
                  placeholder={tc(libraryId, template.notePlaceholder)}
                  value={values.personalNote}
                  onChange={(event) => update('personalNote', event.target.value)}
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            )}

            <div className="secondary-fields editorial-open">
              <div className="form-row">
                <div className="field">
                  <label htmlFor={`${idPrefix}-creator`}>{tc(libraryId, libraryId === 'podcasts' ? 'Animation du podcast' : template.creatorLabel)}</label>
                  <input id={`${idPrefix}-creator`} value={values.creator} onChange={(event) => update('creator', event.target.value)} />
                </div>
                <div className="field field-year">
                  <label htmlFor={`${idPrefix}-year`}>{t("Année")}</label>
                  <input
                    id={`${idPrefix}-year`}
                    inputMode="numeric"
                    value={values.year}
                    onChange={(event) => update('year', event.target.value)}
                    aria-invalid={Boolean(errors.year)}
                  />
                  {errors.year && <p className="field-error">{translateMessage(errors.year)}</p>}
                </div>
              </div>
              <div className="custom-detail-fields">
                {template.fields.map((field) => {
                  const fieldId = `${idPrefix}-detail-${field.key}`
                  const value = values.details[field.key] ?? ''
                  return (
                    <div className={field.kind === 'textarea' ? 'field field-long' : 'field'} key={field.key}>
                      <label id={`${fieldId}-label`} htmlFor={fieldId}>{tc(libraryId, field.label)}</label>
                      {field.kind === 'textarea' ? (
                        <textarea
                          id={fieldId}
                          rows={field.key === 'ingredients' ? 6 : 8}
                          value={value}
                          placeholder={field.placeholder ? tc(libraryId, field.placeholder) : undefined}
                          onChange={(event) => updateDetail(field.key, event.target.value)}
                        />
                      ) : field.kind === 'select' && field.options ? (
                        <Select
                          id={fieldId}
                          labelledBy={`${fieldId}-label`}
                          value={value}
                          placeholder={t("À préciser")}
                          options={[
                            { value: '', label: t('À préciser') },
                            ...field.options.map((option) => ({ value: option, label: tc(libraryId, option) })),
                            // Une valeur importée hors catalogue reste sélectionnée.
                            ...(value && !field.options.includes(value) ? [{ value, label: value }] : []),
                          ]}
                          onChange={(next) => updateDetail(field.key, next)}
                        />
                      ) : (
                        <input id={fieldId} value={value} placeholder={field.placeholder ? tc(libraryId, field.placeholder) : undefined} onChange={(event) => updateDetail(field.key, event.target.value)} />
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="field">
                <label htmlFor={`${idPrefix}-summary`}>{t("Résumé")}</label>
                <textarea id={`${idPrefix}-summary`} rows={3} value={values.summary} onChange={(event) => update('summary', event.target.value)} />
              </div>
            </div>

            {template.quotes && <QuotesEditor values={values.quotes} onChange={quotes => update('quotes', quotes)} disabled={saving} autoFocusLast={initialQuoteDraft} />}

            {errors.coverUrl && <p className="form-error" role="alert">{translateMessage(errors.coverUrl)}</p>}
            {saveError && <p className="form-error" role="alert">{translateMessage(saveError)}</p>}
          </div>

          <footer className="form-actions form-actions-docked">
            <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>{t("Annuler")}</button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? t("Enregistrement…") : entry ? t("Enregistrer les modifications") : tc(libraryId, template.addLabel)}
            </button>
          </footer>
        </div>
      </form>
      {posterEditor.posterDialog}
    </div>
  )
}
