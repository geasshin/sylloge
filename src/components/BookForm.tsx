import { useState, type FormEvent } from 'react'
import {
  BOOK_CATEGORIES,
  BOOK_CATEGORY_LABELS,
  BOOK_STATUSES,
  BOOK_STATUS_LABELS,
  type Book,
} from '../domain/book.ts'
import {
  EMPTY_BOOK_FORM,
  bookToFormValues,
  resolveBookStatusForTotalChange,
  validateBookForm,
  type BookFormErrors,
  type BookFormValues,
  type BookWriteInput,
} from '../domain/bookForm.ts'
import { localToday } from '../domain/filmForm.ts'
import type { MediaProviderReference } from '../data/mediaRepository.ts'
import { Poster } from './Poster.tsx'
import { usePosterEditor } from './usePosterEditor.tsx'
import { StatusSegmented, StarRating, FavoriteHeart } from './VerdictControls.tsx'
import { Stepper } from './Stepper.tsx'

function previewableCoverUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

type BookFormProps = {
  book?: Book
  /** Valeurs préremplies par la recherche Open Library (création assistée, jalon 0.4.27). */
  initialValues?: BookFormValues
  providerLink?: MediaProviderReference | null
  /** Intégré à une pop-up hôte (0.6.10) : le formulaire vit dans la fenêtre,
      sans <main> pleine page ni barre de retour redondante. */
  embeddedInDialog?: boolean
  onCancel: () => void
  onSave: (input: BookWriteInput) => Promise<void>
}

export function BookForm({ book, initialValues, providerLink = null, embeddedInDialog = false, onCancel, onSave }: BookFormProps) {
  const [values, setValues] = useState<BookFormValues>(() => book
    ? bookToFormValues(book)
    : { ...EMPTY_BOOK_FORM, ...initialValues, quotes: initialValues?.quotes ?? [] })
  const [errors, setErrors] = useState<BookFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const today = localToday()
  // Une fiche liée à Open Library conserve une présentation éditoriale en lecture.
  const assisted = providerLink !== null
  const previewTitle = values.title.trim() || 'Titre à renseigner'
  const previewUrl = previewableCoverUrl(values.coverUrl)
  const hasVolumes = values.category === 'manga' || values.category === 'comics'
  const progressVisible = hasVolumes && (values.status === 'en cours' || values.status === 'abandonné' || values.status === 'lu')
  const ratingValue = values.rating === '' ? null : Number(values.rating)
  // « À lire » : pas encore de verdict, on masque note, cœur, dates et avis.
  const verdictVisible = values.status !== 'à lire'

  // Crayon commun sur la couverture (0.6.11) : modification par URL, locale.
  const posterEditor = usePosterEditor({
    title: previewTitle,
    label: 'Couverture',
    currentUrl: values.coverUrl,
    onSave: (url) => update('coverUrl', url ?? ''),
  })

  const update = <Key extends Exclude<keyof BookFormValues, 'quotes'>>(
    key: Key,
    value: BookFormValues[Key],
  ) => {
    setValues((current) => {
      const next = { ...current, [key]: value }

      if (key === 'category' && value === 'livre') {
        next.volumesRead = ''
        next.volumesTotal = ''
      }

      if (key === 'volumesTotal' || key === 'volumesRead') {
        const read = next.volumesRead.trim() === '' ? null : Number(next.volumesRead)
        const total = next.volumesTotal.trim() === '' ? null : Number(next.volumesTotal)
        next.status = resolveBookStatusForTotalChange(
          current.status,
          Number.isFinite(read) ? read : null,
          Number.isFinite(total) ? total : null,
        )
      }

      if (key === 'status' && value === 'lu' && current.volumesTotal.trim() !== '') {
        next.volumesRead = current.volumesTotal
      }

      if (key === 'status' && value === 'à lire') {
        next.rating = ''
        next.isFavorite = false
        next.volumesRead = ''
        next.startedAt = ''
        next.personalNote = ''
      }

      return next
    })
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSaveError(null)
  }

  const updateQuote = (index: number, body: string) => {
    setValues((current) => ({
      ...current,
      quotes: current.quotes.map((quote, quoteIndex) => quoteIndex === index ? body : quote),
    }))
    setErrors((current) => ({ ...current, quotes: undefined }))
    setSaveError(null)
  }

  const addQuote = () => {
    setValues((current) => ({ ...current, quotes: [...current.quotes, ''] }))
  }

  const removeQuote = (index: number) => {
    setValues((current) => ({
      ...current,
      quotes: current.quotes.filter((_, quoteIndex) => quoteIndex !== index),
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = validateBookForm(values)

    if (!result.success) {
      setErrors(result.errors)
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      await onSave(result.data)
    } catch (error) {
      console.error('Impossible d’enregistrer le livre.', error)
      setSaveError('L’enregistrement a échoué. Vos changements restent dans le formulaire.')
      setSaving(false)
    }
  }

  const heading = embeddedInDialog ? null : (
    <div className="editor-heading">
      <p className="eyebrow">Livre</p>
      <h1 className="display-title">{book ? 'Modifier la fiche' : 'Ajouter un livre'}</h1>
    </div>
  )

  const form = (
    <form className="film-form form-detail form-medium-book" onSubmit={handleSubmit} noValidate>
      <div className="form-side form-side-with-verdict">
        <div className="form-poster-frame">
          <Poster title={previewTitle} src={previewUrl} className="form-poster-preview-lg" label="Couverture" {...posterEditor.posterProps} />
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
              id="book-title"
              name="title"
              value={values.title}
              onChange={(event) => update('title', event.target.value)}
              aria-label="Titre du livre"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'book-title-error' : undefined}
              autoFocus={!assisted}
            />
            {errors.title && <p className="field-error" id="book-title-error">{errors.title}</p>}
          </div>

          <div className="field category-segmented">
            <span className="field-label">Type</span>
            <StatusSegmented
              statuses={BOOK_CATEGORIES}
              labels={BOOK_CATEGORY_LABELS}
              value={values.category}
              onChange={(next) => update('category', next as BookFormValues['category'])}
              ariaLabel="Type de livre"
            />
            {errors.category && <p className="field-error" id="book-category-error">{errors.category}</p>}
          </div>

          {/* Le verdict personnel */}
          <div className="verdict-block medium-status-block">
            <div className="verdict-row status-date-row">
              <StatusSegmented
                statuses={BOOK_STATUSES}
                labels={BOOK_STATUS_LABELS}
                value={values.status}
                onChange={(next) => update('status', next as BookFormValues['status'])}
              />
              {verdictVisible && (
                <div className="date-row">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                  <input
                    id="book-startedAt"
                    name="startedAt"
                    type="date"
                    value={values.startedAt || today}
                    onChange={(event) => update('startedAt', event.target.value)}
                    aria-label="Début de la lecture"
                    aria-invalid={Boolean(errors.startedAt)}
                  />
                </div>
              )}
            </div>
            {errors.status && <p className="field-error">{errors.status}</p>}
            {verdictVisible && errors.startedAt && <p className="field-error">{errors.startedAt}</p>}

            {verdictVisible && progressVisible && (
              <fieldset className="progress-fields verdict-progress">
                <legend>Avancement</legend>
                <div className="form-row">
                  <Stepper
                    id="volumesRead"
                    label="Tomes lus"
                    value={values.volumesRead}
                    onChange={(value) => update('volumesRead', value)}
                    max={values.volumesTotal.trim() === '' ? null : Number(values.volumesTotal)}
                    error={errors.volumesRead}
                    describedBy={errors.volumesRead ? 'volumesRead-error' : undefined}
                  />
                  <Stepper
                    id="volumesTotal"
                    label="Tomes au total"
                    value={values.volumesTotal}
                    onChange={(value) => update('volumesTotal', value)}
                    error={errors.volumesTotal}
                    describedBy={errors.volumesTotal ? 'volumesTotal-error' : undefined}
                  />
                </div>
                {values.status === 'lu' && (
                  <p className="field-help">Œuvre à jour : si un nouveau tome paraît, augmentez le total et elle repassera en cours.</p>
                )}
              </fieldset>
            )}
          </div>

          {providerLink && (
            <section className="provider-information-card" aria-label="Informations sur le livre fournies par Open Library">
              <div className="provider-information-heading">
                <strong>Informations sur le livre</strong>
                <small>Données : {providerLink.providerName}</small>
              </div>
              <dl className="provider-information-list">
                {values.author.trim() && <div><dt>Auteur ou autrice</dt><dd>{values.author}</dd></div>}
                {values.year.trim() && <div><dt>Parution</dt><dd>{values.year}</dd></div>}
                {values.summary.trim() && <div className="provider-information-summary"><dt>Résumé</dt><dd>{values.summary}</dd></div>}
              </dl>
            </section>
          )}

          {verdictVisible && (
            <div className="review-write review-inline">
              <textarea
                id="book-personalNote"
                name="personalNote"
                rows={5}
                placeholder="Qu’as-tu pensé de ce livre ?"
                value={values.personalNote}
                onChange={(event) => update('personalNote', event.target.value)}
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          )}

          {verdictVisible && (
            <section className="quote-editor" aria-labelledby="quote-editor-title">
            <div className="quote-editor-heading">
              <div>
                <h2 id="quote-editor-title">Citations personnelles</h2>
                <p>Conservez les passages que vous souhaitez retrouver sur cette fiche.</p>
              </div>
              <button className="secondary-button" type="button" onClick={addQuote}>Ajouter une citation</button>
            </div>
            {values.quotes.length === 0 ? (
              <p className="quote-editor-empty">Aucune citation ajoutée.</p>
            ) : (
              <div className="quote-editor-list">
                {values.quotes.map((quote, index) => (
                  <div className="quote-editor-item" key={index}>
                    <div className="field">
                      <label htmlFor={`book-quote-${index}`}>Citation {index + 1}</label>
                      <textarea
                        id={`book-quote-${index}`}
                        rows={3}
                        value={quote}
                        onChange={(event) => updateQuote(index, event.target.value)}
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </div>
                    <button className="delete-link" type="button" onClick={() => removeQuote(index)}>
                      Retirer cette citation
                    </button>
                  </div>
                ))}
              </div>
            )}
            {errors.quotes && <p className="field-error">{errors.quotes}</p>}
            </section>
          )}

          {/* Champs éditoriaux visibles sans toggle. */}
          {!assisted && (
            <div className="secondary-fields editorial-open">
              <div className="field">
                <label htmlFor="book-author">Auteur ou autrice</label>
                <input id="book-author" value={values.author} onChange={(event) => update('author', event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="book-year">Année de parution</label>
                <input
                  id="book-year"
                  inputMode="numeric"
                  value={values.year}
                  onChange={(event) => update('year', event.target.value)}
                  aria-invalid={Boolean(errors.year)}
                  aria-describedby={errors.year ? 'book-year-error' : undefined}
                />
                {errors.year && <p className="field-error" id="book-year-error">{errors.year}</p>}
              </div>
              <div className="field">
                <label htmlFor="book-summary">Résumé</label>
                <textarea
                  id="book-summary"
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

        <footer className="form-actions form-actions-docked">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Annuler</button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : book ? 'Enregistrer les modifications' : 'Ajouter le livre'}
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
        <button className="back-button" type="button" onClick={onCancel}>← Annuler</button>
      </header>
      {heading}
      {form}
      {posterEditor.posterDialog}
    </main>
  )
}
