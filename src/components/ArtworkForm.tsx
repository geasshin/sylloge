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
import { usePosterEditor } from './usePosterEditor.tsx'
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
  /** Intégré à une pop-up hôte (0.6.10) : le formulaire vit dans la fenêtre,
      sans <main> pleine page ni barre de retour redondante. */
  embeddedInDialog?: boolean
  onCancel: () => void
  onSave: (input: ArtworkWriteInput) => Promise<void>
}

export function ArtworkForm({ artwork, embeddedInDialog = false, onCancel, onSave }: ArtworkFormProps) {
  const [values, setValues] = useState<ArtworkFormValues>(() => artwork ? artworkToFormValues(artwork) : { ...EMPTY_ARTWORK_FORM })
  const [errors, setErrors] = useState<ArtworkFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const today = localToday()
  const previewTitle = values.title.trim() || 'Titre à renseigner'
  const previewUrl = previewableImageUrl(values.imageUrl)

  // Crayon commun sur le visuel (0.6.11) : remplace l'ancien bouton inline.
  const posterEditor = usePosterEditor({
    title: previewTitle,
    label: 'Visuel',
    currentUrl: values.imageUrl,
    onSave: (url) => update('imageUrl', url ?? ''),
  })

  const update = <Key extends keyof ArtworkFormValues>(key: Key, value: ArtworkFormValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSaveError(null)
  }

  const updateCustomField = (index: number, key: 'name' | 'value', value: string) => {
    setValues((current) => ({
      ...current,
      customFields: current.customFields.map((field, position) =>
        position === index ? { ...field, [key]: value } : field,
      ),
    }))
    setSaveError(null)
  }

  const removeCustomField = (index: number) => {
    setValues((current) => ({
      ...current,
      customFields: current.customFields.filter((_, position) => position !== index),
    }))
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

  const heading = embeddedInDialog ? null : (
    <div className="editor-heading">
      <p className="eyebrow">Art</p>
      <h1 className="display-title">{artwork ? 'Modifier la fiche' : 'Ajouter une œuvre'}</h1>
      <p>Seul le titre est obligatoire.</p>
    </div>
  )

  const form = (
    <form className="film-form form-detail form-medium-artwork" onSubmit={handleSubmit} noValidate>
      <div className="form-side form-side-with-verdict form-side-artwork">
        <div className="form-poster-frame">
          <Poster title={previewTitle} src={previewUrl} className="form-poster-preview-lg" label="Visuel" {...posterEditor.posterProps} />
        </div>
        <div className="form-poster-verdict artwork-poster-verdict">
          <FavoriteHeart checked={values.isFavorite} onChange={(next) => update('isFavorite', next)} />
          <div className="date-row">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <input
              id="artwork-discoveredAt"
              name="discoveredAt"
              type="date"
              value={values.discoveredAt || today}
              onChange={(event) => update('discoveredAt', event.target.value)}
              aria-label="Date de découverte"
              aria-invalid={Boolean(errors.discoveredAt)}
            />
          </div>
          {errors.discoveredAt && <p className="field-error">{errors.discoveredAt}</p>}
        </div>
      </div>

      <div className="form-body">
        <div className="form-body-scroll">
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

          {/* L’Art conserve sa composition éditoriale propre : catégorie,
              année, artiste, lieu et exposition. */}

          <div className="review-write review-inline">
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

          {/* Informations principales toujours visibles : pas de toggle dans la
              pop-up, même logique que les autres médiums. */}
          <div className="secondary-fields editorial-open">
            <div className="form-row">
              <div className="field">
                <label htmlFor="artwork-form">Catégorie</label>
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
            </div>
            <div className="field">
              <label htmlFor="artwork-artist">Artiste</label>
              <input id="artwork-artist" value={values.artist} onChange={(event) => update('artist', event.target.value)} />
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="artwork-location">Lieu</label>
                <input id="artwork-location" value={values.location} onChange={(event) => update('location', event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="artwork-exhibition">Exposition</label>
                <input id="artwork-exhibition" value={values.exhibition} onChange={(event) => update('exhibition', event.target.value)} />
              </div>
            </div>
          </div>

          {/* Champs personnalisés nom → valeur (0.6.12) : autant de lignes
              que nécessaire, une ligne sans nom est ignorée à l'enregistrement. */}
          <div className="custom-fields">
            {values.customFields.map((field, index) => (
              <div className="custom-field-row" key={index}>
                <input
                  value={field.name}
                  onChange={(event) => updateCustomField(index, 'name', event.target.value)}
                  placeholder="Nom du champ"
                  aria-label={`Nom du champ personnalisé ${index + 1}`}
                />
                <span className="custom-field-arrow" aria-hidden="true">→</span>
                <input
                  value={field.value}
                  onChange={(event) => updateCustomField(index, 'value', event.target.value)}
                  placeholder="Valeur"
                  aria-label={`Valeur du champ personnalisé ${index + 1}`}
                />
                <button
                  type="button"
                  className="custom-field-remove"
                  onClick={() => removeCustomField(index)}
                  aria-label={`Supprimer le champ personnalisé ${index + 1}`}
                  title="Supprimer ce champ"
                >×</button>
              </div>
            ))}
            <button
              type="button"
              className="link-accent custom-fields-add"
              onClick={() => setValues((current) => ({ ...current, customFields: [...current.customFields, { name: '', value: '' }] }))}
            >
              Ajouter un champ personnalisé
            </button>
          </div>

          {saveError && <p className="form-error" role="alert">{saveError}</p>}
        </div>

        <footer className="form-actions form-actions-docked">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Annuler</button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : artwork ? 'Enregistrer les modifications' : 'Ajouter l’œuvre'}
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
