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
  /** Intégré à une pop-up hôte (0.6.10) : le formulaire vit dans la fenêtre,
      sans <main> pleine page ni barre de retour redondante. */
  embeddedInDialog?: boolean
  onCancel: () => void
  onSave: (input: BookWriteInput) => Promise<void>
}

export function BookForm({ book, initialValues, embeddedInDialog = false, onCancel, onSave }: BookFormProps) {
  const [values, setValues] = useState<BookFormValues>(() => book
    ? bookToFormValues(book)
    : { ...EMPTY_BOOK_FORM, ...initialValues, quotes: initialValues?.quotes ?? [] })
  const [errors, setErrors] = useState<BookFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const today = localToday()
  // Création assistée : les champs éditoriaux sont déjà portés par la recherche.
  const assisted = !book && Boolean(initialValues?.title)
  const [showEditorial, setShowEditorial] = useState(!assisted)
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

  const heading = (
    <div className="editor-heading">
      <p className="eyebrow">Livre</p>
      <h1 className="display-title">{book ? 'Modifier la fiche' : 'Ajouter un livre'}</h1>
      <p>{assisted ? 'Ton livre est reconnu : choisis juste ton verdict.' : 'Seul le titre est obligatoire.'}</p>
    </div>
  )

  const form = (
    <form className="film-form form-detail" onSubmit={handleSubmit} noValidate>
      <div className="form-side">
        <div className="form-poster-frame">
          <Poster title={previewTitle} src={previewUrl} className="form-poster-preview-lg" label="Couverture" {...posterEditor.posterProps} />
        </div>
        <p className="form-poster-caption">Aperçu de la couverture</p>
      </div>

      <div className="form-body">
          <div className={`field field-title ${assisted ? 'field-title-read' : ''}`}>
            <label htmlFor="book-title">Titre <span aria-hidden="true">*</span></label>
            <input
              id="book-title"
              name="title"
              value={values.title}
              onChange={(event) => update('title', event.target.value)}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'book-title-error' : undefined}
              autoFocus={!assisted}
            />
            {errors.title && <p className="field-error" id="book-title-error">{errors.title}</p>}
          </div>

          {/* Le verdict personnel */}
          <div className="verdict-block">
            <div className="verdict-row">
              <StatusSegmented
                statuses={BOOK_STATUSES}
                labels={BOOK_STATUS_LABELS}
                value={values.status}
                onChange={(next) => update('status', next as BookFormValues['status'])}
              />
              {verdictVisible && (
                <>
                  <StarRating value={ratingValue} onChange={(next) => update('rating', next === null ? '' : String(next))} />
                  <FavoriteHeart checked={values.isFavorite} onChange={(next) => update('isFavorite', next)} />
                </>
              )}
            </div>

          {/* Type Livre / Manga / Comics : visible en permanence (0.6.11),
              y compris à l'ajout assisté. */}
          <div className="field category-inline">
            <label htmlFor="book-category">Type</label>
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
            {verdictVisible && errors.startedAt && <p className="field-error">{errors.startedAt}</p>}

            {verdictVisible ? (
              <div className="review-write">
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
            ) : (
              <p className="verdict-hint">Passe le livre en « En cours », « Lu » ou « Abandonné » pour ajouter ta note, ta date et ton avis.</p>
            )}

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
          </div>

          {/* Champs éditoriaux : cachés en création assistée */}
          {!assisted && (
            <details className="secondary-fields" open={showEditorial || undefined}>
              <summary onClick={(event) => { event.preventDefault(); setShowEditorial((value) => !value) }}>
                Informations sur le livre
              </summary>
              {showEditorial && (
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
            </details>
          )}

          {saveError && <p className="form-error" role="alert">{saveError}</p>}

          <footer className="form-actions">
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
