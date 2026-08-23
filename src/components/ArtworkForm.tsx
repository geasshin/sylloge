import { useState, type FormEvent } from 'react'
import {
  ARTWORK_FORMS,
  ARTWORK_FORM_LABELS,
  ARTWORK_STATUSES,
  ARTWORK_STATUS_LABELS,
  type Artwork,
} from '../domain/artwork.ts'
import {
  EMPTY_ARTWORK_FORM,
  artworkToFormValues,
  validateArtworkForm,
  type ArtworkFormErrors,
  type ArtworkFormValues,
  type ArtworkWriteInput,
} from '../domain/artworkForm.ts'
import { localToday } from '../domain/filmForm.ts'
import { Poster } from './Poster.tsx'
import { StatusSegmented, FavoriteHeart } from './VerdictControls.tsx'

function previewableImageUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

type ArtworkFormProps = {
  artwork?: Artwork
  onCancel: () => void
  onSave: (input: ArtworkWriteInput) => Promise<void>
}

export function ArtworkForm({ artwork, onCancel, onSave }: ArtworkFormProps) {
  const [values, setValues] = useState<ArtworkFormValues>(() => artwork ? artworkToFormValues(artwork) : { ...EMPTY_ARTWORK_FORM })
  const [errors, setErrors] = useState<ArtworkFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const today = localToday()
  const previewTitle = values.title.trim() || 'Titre à renseigner'
  const previewUrl = previewableImageUrl(values.imageUrl)

  const update = <Key extends keyof ArtworkFormValues>(key: Key, value: ArtworkFormValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSaveError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = validateArtworkForm(values)

    if (!result.success) {
      setErrors(result.errors)
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      await onSave(result.data)
    } catch (error) {
      console.error('Impossible d’enregistrer l’œuvre.', error)
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
        <p className="eyebrow">Art</p>
        <h1 className="display-title">{artwork ? 'Modifier la fiche' : 'Ajouter une œuvre'}</h1>
        <p>Seul le titre est obligatoire.</p>
      </div>

      <form className="film-form form-detail" onSubmit={handleSubmit} noValidate>
        <div className="form-side">
          <div className="form-poster-frame">
            <Poster title={previewTitle} src={previewUrl} className="form-poster-preview-lg" label="Visuel" />
          </div>
          <p className="form-poster-caption">Aperçu du visuel</p>
        </div>

        <div className="form-body">
          <div className="field field-title">
            <label htmlFor="artwork-title">Titre <span aria-hidden="true">*</span></label>
            <input
              id="artwork-title"
              name="title"
              value={values.title}
              onChange={(event) => update('title', event.target.value)}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'artwork-title-error' : undefined}
              autoFocus
            />
            {errors.title && <p className="field-error" id="artwork-title-error">{errors.title}</p>}
          </div>

          {/* Le verdict personnel : pas de note pour l'Art */}
          <div className="verdict-block">
            <div className="verdict-row">
              <StatusSegmented
                statuses={ARTWORK_STATUSES}
                labels={ARTWORK_STATUS_LABELS}
                value={values.status}
                onChange={(next) => update('status', next as ArtworkFormValues['status'])}
              />
              <FavoriteHeart checked={values.isFavorite} onChange={(next) => update('isFavorite', next)} />
            </div>

            <div className="date-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              <input
                id="artwork-discoveredAt"
                name="discoveredAt"
                type="date"
                value={values.discoveredAt}
                onChange={(event) => update('discoveredAt', event.target.value)}
                aria-label="Date de découverte"
                aria-invalid={Boolean(errors.discoveredAt)}
              />
              {values.status === 'découverte' && values.discoveredAt !== today && (
                <button type="button" className="link-accent" onClick={() => update('discoveredAt', today)}>
                  Utiliser aujourd’hui
                </button>
              )}
            </div>
            {errors.discoveredAt && <p className="field-error">{errors.discoveredAt}</p>}

            <div className="review-write">
              <textarea
                id="artwork-personalNote"
                name="personalNote"
                rows={5}
                placeholder="Qu’as-tu ressenti face à cette œuvre ?"
                value={values.personalNote}
                onChange={(event) => update('personalNote', event.target.value)}
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Visuel de l'œuvre : accessible sans fournisseur */}
          <div className="field">
            <label htmlFor="artwork-imageUrl">Visuel de l’œuvre (URL d’une image)</label>
            <input
              id="artwork-imageUrl"
              type="url"
              inputMode="url"
              placeholder="https://…/oeuvre.jpg"
              value={values.imageUrl}
              onChange={(event) => update('imageUrl', event.target.value)}
              aria-invalid={Boolean(errors.imageUrl)}
              aria-describedby={`artwork-image-help${errors.imageUrl ? ' artwork-image-error' : ''}`}
            />
            <p className="field-help" id="artwork-image-help">Colle l’adresse d’une image de l’œuvre ; elle apparaît à gauche. Une image indisponible n’empêchera pas l’enregistrement.</p>
            {errors.imageUrl && <p className="field-error" id="artwork-image-error">{errors.imageUrl}</p>}
          </div>

          {/* Champs éditoriaux : repliés par défaut */}
          <details className="secondary-fields" open={Boolean(artwork) || undefined}>
            <summary>Contexte de l’œuvre</summary>
            <div className="secondary-fields-content">
              <div className="form-row">
                <div className="field">
                  <label htmlFor="artwork-form">Forme</label>
                  <select
                    id="artwork-form"
                    name="form"
                    value={values.form}
                    onChange={(event) => update('form', event.target.value as ArtworkFormValues['form'])}
                    aria-invalid={Boolean(errors.form)}
                    aria-describedby={errors.form ? 'artwork-form-error' : undefined}
                  >
                    {ARTWORK_FORMS.map((form) => (
                      <option value={form} key={form}>{ARTWORK_FORM_LABELS[form]}</option>
                    ))}
                  </select>
                  {errors.form && <p className="field-error" id="artwork-form-error">{errors.form}</p>}
                </div>
                <div className="field">
                  <label htmlFor="artwork-artist">Artiste</label>
                  <input id="artwork-artist" value={values.artist} onChange={(event) => update('artist', event.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="field field-year">
                  <label htmlFor="artwork-year">Année</label>
                  <input
                    id="artwork-year"
                    inputMode="numeric"
                    value={values.year}
                    onChange={(event) => update('year', event.target.value)}
                    aria-invalid={Boolean(errors.year)}
                    aria-describedby={errors.year ? 'artwork-year-error' : undefined}
                  />
                  {errors.year && <p className="field-error" id="artwork-year-error">{errors.year}</p>}
                </div>
                <div className="field">
                  <label htmlFor="artwork-location">Lieu</label>
                  <input id="artwork-location" value={values.location} onChange={(event) => update('location', event.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="artwork-exhibition">Exposition</label>
                <input id="artwork-exhibition" value={values.exhibition} onChange={(event) => update('exhibition', event.target.value)} />
              </div>
            </div>
          </details>

          {saveError && <p className="form-error" role="alert">{saveError}</p>}

          <footer className="form-actions">
            <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Annuler</button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Enregistrement…' : artwork ? 'Enregistrer les modifications' : 'Ajouter l’œuvre'}
            </button>
          </footer>
        </div>
      </form>
    </main>
  )
}
