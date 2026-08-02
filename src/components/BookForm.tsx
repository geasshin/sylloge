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
import { Poster } from './Poster.tsx'
import { Stepper } from './Stepper.tsx'

const RATINGS = Array.from({ length: 10 }, (_, index) => (index + 1) / 2)

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
  onCancel: () => void
  onSave: (input: BookWriteInput) => Promise<void>
}

export function BookForm({ book, initialValues, onCancel, onSave }: BookFormProps) {
  const [values, setValues] = useState<BookFormValues>(() => book
    ? bookToFormValues(book)
    : { ...EMPTY_BOOK_FORM, ...initialValues, quotes: initialValues?.quotes ?? [] })
  const [errors, setErrors] = useState<BookFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const today = localToday()
  const hasSecondaryDetails = Boolean(
    book
      ? book.author || book.year !== null || book.summary
      : initialValues && (initialValues.author || initialValues.year || initialValues.summary),
  )
  const previewTitle = values.title.trim() || 'Titre à renseigner'
  const previewUrl = previewableCoverUrl(values.coverUrl)
  const hasVolumes = values.category === 'manga' || values.category === 'comics'
  const progressVisible = hasVolumes && (values.status === 'en cours' || values.status === 'abandonné' || values.status === 'lu')

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

  return (
    <main className="main editor-main">
      <header className="page-action-bar">
        <button className="back-button" type="button" onClick={onCancel}>← Annuler</button>
      </header>

      <div className="editor-heading">
        <p className="eyebrow">Livre</p>
        <h1 className="display-title">{book ? 'Modifier la fiche' : 'Ajouter un livre'}</h1>
        <p>Seul le titre est obligatoire.</p>
      </div>

      <form className="film-form" onSubmit={handleSubmit} noValidate>
        <div className="field field-title">
          <label htmlFor="book-title">Titre <span aria-hidden="true">*</span></label>
          <input
            id="book-title"
            name="title"
            value={values.title}
            onChange={(event) => update('title', event.target.value)}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? 'book-title-error' : undefined}
            autoFocus
          />
          {errors.title && <p className="field-error" id="book-title-error">{errors.title}</p>}
        </div>

        <div className="form-row book-basics-row">
          <div className="field">
            <label htmlFor="book-category">Catégorie</label>
            <select
              id="book-category"
              name="category"
              value={values.category}
              onChange={(event) => update('category', event.target.value as BookFormValues['category'])}
              aria-invalid={Boolean(errors.category)}
              aria-describedby={errors.category ? 'book-category-error' : undefined}
            >
              {BOOK_CATEGORIES.map((category) => (
                <option value={category} key={category}>{BOOK_CATEGORY_LABELS[category]}</option>
              ))}
            </select>
            {errors.category && <p className="field-error" id="book-category-error">{errors.category}</p>}
          </div>

          <div className="field">
            <label htmlFor="book-status">Statut</label>
            <select
              id="book-status"
              name="status"
              value={values.status}
              onChange={(event) => update('status', event.target.value as BookFormValues['status'])}
              aria-invalid={Boolean(errors.status)}
              aria-describedby={errors.status ? 'book-status-error' : undefined}
            >
              {BOOK_STATUSES.map((status) => (
                <option value={status} key={status}>{BOOK_STATUS_LABELS[status]}</option>
              ))}
            </select>
            {errors.status && <p className="field-error" id="book-status-error">{errors.status}</p>}
          </div>

          <div className="field">
            <label htmlFor="book-rating">Note</label>
            <select
              id="book-rating"
              name="rating"
              value={values.rating}
              onChange={(event) => update('rating', event.target.value)}
              aria-invalid={Boolean(errors.rating)}
              aria-describedby={errors.rating ? 'book-rating-error' : undefined}
            >
              <option value="">Aucune note</option>
              {RATINGS.map((rating) => (
                <option value={rating} key={rating}>{rating.toLocaleString('fr-FR')} / 5</option>
              ))}
            </select>
            {errors.rating && <p className="field-error" id="book-rating-error">{errors.rating}</p>}
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

        {progressVisible && (
          <fieldset className="progress-fields">
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
              <p className="field-help">Une œuvre lue est à jour : si un nouveau tome paraît, augmentez le total et elle repassera en cours.</p>
            )}
          </fieldset>
        )}

        <div className="field">
          <label htmlFor="book-startedAt">Début de la lecture</label>
          <input
            id="book-startedAt"
            name="startedAt"
            type="date"
            value={values.startedAt}
            onChange={(event) => update('startedAt', event.target.value)}
            aria-invalid={Boolean(errors.startedAt)}
            aria-describedby={errors.startedAt ? 'book-startedAt-error' : undefined}
          />
          {errors.startedAt && <p className="field-error" id="book-startedAt-error">{errors.startedAt}</p>}
          {values.status !== 'à lire' && !values.startedAt && (
            <div className="date-suggestion">
              <span>La date de début reste facultative.</span>
              <button type="button" onClick={() => update('startedAt', today)}>Utiliser aujourd’hui</button>
            </div>
          )}
        </div>

        <details className="secondary-fields" open={hasSecondaryDetails || undefined}>
          <summary>Informations sur le livre</summary>
          <div className="secondary-fields-content">
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
              <textarea id="book-summary" rows={3} value={values.summary} onChange={(event) => update('summary', event.target.value)} />
            </div>
          </div>
        </details>

        <div className="field">
          <label htmlFor="book-coverUrl">URL directe de la couverture</label>
          <input
            id="book-coverUrl"
            name="coverUrl"
            type="url"
            inputMode="url"
            placeholder="https://…/couverture.jpg"
            value={values.coverUrl}
            onChange={(event) => update('coverUrl', event.target.value)}
            aria-invalid={Boolean(errors.coverUrl)}
            aria-describedby={`book-cover-help${errors.coverUrl ? ' book-cover-error' : ''}`}
          />
          <p className="field-help" id="book-cover-help">Une image indisponible n’empêchera pas l’enregistrement.</p>
          {errors.coverUrl && <p className="field-error" id="book-cover-error">{errors.coverUrl}</p>}
          <div className="poster-preview">
            <p>Aperçu de la couverture</p>
            <Poster title={previewTitle} src={previewUrl} className="form-poster-preview" label="Couverture" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="book-personalNote">Avis personnel</label>
          <textarea
            id="book-personalNote"
            name="personalNote"
            rows={5}
            value={values.personalNote}
            onChange={(event) => update('personalNote', event.target.value)}
          />
        </div>

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

        {saveError && <p className="form-error" role="alert">{saveError}</p>}

        <footer className="form-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Annuler</button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : book ? 'Enregistrer les modifications' : 'Ajouter le livre'}
          </button>
        </footer>
      </form>
    </main>
  )
}
