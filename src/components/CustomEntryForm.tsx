import { t, tc, translateMessage } from '../i18n/core.ts'
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
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

/** Lignes d'un champ `list` : une ligne vide reste une ligne à remplir, jamais rien. */
function listItems(value: string): string[] {
  const items = value === '' ? [''] : value.split('\n')
  return items
}

/**
 * Éditeur en liste d'un texte multiligne : un ingrédient ou une étape par
 * ligne. Entrée ouvre la ligne suivante, Retour arrière sur une ligne vide la
 * retire, et un collage de plusieurs lignes les répartit. La valeur reste le
 * texte multiligne déjà stocké : ni le schéma ni les sauvegardes ne changent.
 */
function ListField({
  id,
  label,
  value,
  placeholder,
  ordered,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder?: string
  ordered: boolean
  onChange: (next: string) => void
}) {
  const items = listItems(value)
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const pendingFocus = useRef<number | null>(null)

  useEffect(() => {
    const index = pendingFocus.current
    if (index === null) return
    pendingFocus.current = null
    const input = inputs.current[index]
    input?.focus()
    input?.setSelectionRange(input.value.length, input.value.length)
  })

  const commit = (next: string[], focusIndex?: number) => {
    if (focusIndex !== undefined) pendingFocus.current = focusIndex
    onChange(next.join('\n'))
  }

  const setItem = (index: number, text: string) => {
    const next = [...items]
    next[index] = text
    commit(next)
  }

  const insertAfter = (index: number, lines: string[] = ['']) => {
    const next = [...items]
    next.splice(index + 1, 0, ...lines)
    commit(next, index + 1)
  }

  const removeAt = (index: number) => {
    if (items.length === 1) {
      onChange('')
      return
    }
    const next = [...items]
    next.splice(index, 1)
    commit(next, Math.max(0, index - 1))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      insertAfter(index)
      return
    }
    if (event.key === 'Backspace' && items[index] === '' && items.length > 1) {
      event.preventDefault()
      removeAt(index)
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>, index: number) => {
    const text = event.clipboardData.getData('text/plain')
    const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line !== '')
    if (lines.length < 2) return
    event.preventDefault()
    const next = [...items]
    next.splice(index, 1, ...lines)
    commit(next, index + lines.length - 1)
  }

  return (
    <ol className={`list-field ${ordered ? 'is-ordered' : 'is-bulleted'}`}>
      {items.map((item, index) => (
        <li className="list-field-row" key={index}>
          <span className="list-field-marker" aria-hidden="true">{ordered ? index + 1 : '•'}</span>
          <input
            ref={(element) => { inputs.current[index] = element }}
            id={index === 0 ? id : `${id}-${index}`}
            aria-label={label}
            value={item}
            placeholder={index === items.length - 1 ? placeholder : undefined}
            autoComplete="off"
            onChange={(event) => setItem(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onPaste={(event) => handlePaste(event, index)}
          />
        </li>
      ))}
    </ol>
  )
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
  // L'avis conclut une lecture, une écoute, une partie. Les notes d'une recette, elles,
  // existent dès la fiche créée : elles arrivent même avec l'import.
  const noteVisible = started || template.noteLabel !== undefined
  // La date de fin suit les états qui concluent : terminé, abandonné, et maîtrisée
  // pour les recettes (c'est le jour où la recette a été faite et retenue).
  const dateVisible = values.status === 'terminé' || values.status === 'abandonné' || values.status === 'maîtrisée'
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

            {noteVisible && (
              <div className="review-write review-inline">
                <textarea
                  id={`${idPrefix}-personalNote`}
                  aria-label={t(template.noteLabel ?? "Avis personnel")}
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
              <div className={`form-row ${template.showsYear !== false ? '' : 'form-row-single'}`}>
                <div className="field">
                  <label htmlFor={`${idPrefix}-creator`}>{tc(libraryId, libraryId === 'podcasts' ? 'Animation du podcast' : template.creatorLabel)}</label>
                  <input id={`${idPrefix}-creator`} value={values.creator} onChange={(event) => update('creator', event.target.value)} />
                </div>
                {template.showsYear !== false && (
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
                )}
              </div>
              <div className="custom-detail-fields">
                {template.fields.map((field) => {
                  const fieldId = `${idPrefix}-detail-${field.key}`
                  const value = values.details[field.key] ?? ''
                  const label = tc(libraryId, field.label)
                  const placeholder = field.placeholder ? tc(libraryId, field.placeholder) : undefined
                  return (
                    <div className={field.kind === 'textarea' || field.kind === 'list' ? 'field field-long' : 'field'} key={field.key}>
                      <label id={`${fieldId}-label`} htmlFor={fieldId}>{label}</label>
                      {field.kind === 'list' ? (
                        <ListField
                          id={fieldId}
                          label={label}
                          value={value}
                          placeholder={placeholder}
                          ordered={field.key === 'steps'}
                          onChange={(next) => updateDetail(field.key, next)}
                        />
                      ) : field.kind === 'textarea' ? (
                        <textarea
                          id={fieldId}
                          rows={field.key === 'ingredients' ? 6 : 8}
                          value={value}
                          placeholder={placeholder}
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
                        <input id={fieldId} value={value} placeholder={placeholder} onChange={(event) => updateDetail(field.key, event.target.value)} />
                      )}
                    </div>
                  )
                })}
              </div>
              {template.showsSummary !== false && (
                <div className="field">
                  <label htmlFor={`${idPrefix}-summary`}>{t("Résumé")}</label>
                  <textarea id={`${idPrefix}-summary`} rows={3} value={values.summary} onChange={(event) => update('summary', event.target.value)} />
                </div>
              )}
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
