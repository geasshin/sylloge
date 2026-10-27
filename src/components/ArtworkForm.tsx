import { t, tc, translateMessage } from '../i18n/core.ts'
import { useState, type FormEvent } from 'react'
import {
  ARTWORK_FORMS,
  ARTWORK_FORM_LABELS,
  type Artwork,
  type ArtworkForm as ArtworkFormValue,
} from '../domain/artwork.ts'
import {
  ARTWORK_DETAIL_LIMITS,
  ARTWORK_FORM_PROFILES,
  artworkDetailFieldsFor,
  artworkShowsPlace,
  type ArtworkDetailField,
} from '../domain/artworkDetails.ts'
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
import { searchArtworkImages } from '../data/artImageSearch.ts'
import { FavoriteHeart } from './VerdictControls.tsx'
import { Select } from './Select.tsx'
import { ArtFormIcon } from './ArtFormIcon.tsx'

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
  const previewTitle = values.title.trim() || t("Titre à renseigner")
  const previewUrl = previewableImageUrl(values.imageUrl)

  // Crayon commun sur le visuel (0.6.11) : remplace l'ancien bouton inline.
  const posterEditor = usePosterEditor({
    title: previewTitle,
    label: 'Visuel',
    currentUrl: values.imageUrl,
    onSave: (url) => update('imageUrl', url ?? ''),
    // L'Art est la seule bibliothèque sans source d'images : on propose des œuvres libres de Commons.
    suggest: () => searchArtworkImages(values.title, values.artist),
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

  const updateDetail = (key: string, value: string) => {
    setValues((current) => ({ ...current, details: { ...current.details, [key]: value } }))
    setSaveError(null)
  }

  const profile = ARTWORK_FORM_PROFILES[values.form]
  const detailFields = artworkDetailFieldsFor(values.form, values.details)
  const shortFields = detailFields.filter((field) => field.kind === 'text')
  const longFields = detailFields.filter((field) => field.kind === 'poem')
  const showsPlace = artworkShowsPlace(values.form, values.location, values.exhibition)
  const formOptions = ARTWORK_FORMS.map((form) => ({
    value: form,
    label: t(ARTWORK_FORM_LABELS[form]),
    description: t(ARTWORK_FORM_PROFILES[form].hint),
    icon: <ArtFormIcon form={form} />,
  }))

  const detailInput = (field: ArtworkDetailField) => (
    <div className="field" key={field.key}>
      <label htmlFor={`artwork-detail-${field.key}`}>{tc('artworks', field.label)}</label>
      <input
        id={`artwork-detail-${field.key}`}
        value={values.details[field.key] ?? ''}
        maxLength={ARTWORK_DETAIL_LIMITS.text}
        placeholder={field.placeholder ? t(field.placeholder) : undefined}
        onChange={(event) => updateDetail(field.key, event.target.value)}
      />
    </div>
  )

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
      <h1 className="display-title">{artwork ? t("Modifier la fiche") : t("Ajouter une œuvre")}</h1>
      <p>{t("Seul le titre est obligatoire.")}</p>
    </div>
  )

  const form = (
    <form className="film-form form-detail form-medium-artwork" onSubmit={handleSubmit} noValidate>
      <div className="form-side form-side-with-verdict form-side-artwork">
        <div className="form-poster-frame">
          <Poster title={previewTitle} src={previewUrl} className="form-poster-preview-lg artwork-visual" label="Visuel" {...posterEditor.posterProps} />
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
              aria-label={tc('artworks', "Date de découverte")}
              aria-invalid={Boolean(errors.discoveredAt)}
            />
          </div>
          {errors.discoveredAt && <p className="field-error">{translateMessage(errors.discoveredAt)}</p>}
        </div>
      </div>

      <div className="form-body">
        <div className="form-body-scroll">
          <div className="field field-title">
            <label htmlFor="artwork-title">{t('Titre')} <span aria-hidden="true">*</span></label>
            <input
              id="artwork-title"
              name="title"
              value={values.title}
              onChange={(event) => update('title', event.target.value)}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'artwork-title-error' : undefined}
              autoFocus
            />
            {errors.title && <p className="field-error" id="artwork-title-error">{translateMessage(errors.title)}</p>}
          </div>

          {/* L’Art conserve sa composition éditoriale propre : catégorie,
              année, artiste, lieu et exposition. */}

          <div className="review-write review-inline">
            <textarea
              id="artwork-personalNote"
              name="personalNote"
              aria-label={t("Ressenti personnel")}
              rows={5}
              placeholder={t("Qu’as-tu ressenti face à cette œuvre ?")}
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
              <div className="field artwork-form-field">
                <label id="artwork-form-label" htmlFor="artwork-form">{t("Catégorie")}</label>
                <Select
                  id="artwork-form"
                  labelledBy="artwork-form-label"
                  className="art-form-select"
                  value={values.form}
                  options={formOptions}
                  columns={2}
                  onChange={(next) => update('form', next as ArtworkFormValue)}
                  invalid={Boolean(errors.form)}
                  describedBy={errors.form ? 'artwork-form-error' : undefined}
                />
                {errors.form && <p className="field-error" id="artwork-form-error">{translateMessage(errors.form)}</p>}
              </div>
              <div className="field field-year">
                <label htmlFor="artwork-year">{t("Année")}</label>
                <input
                  id="artwork-year"
                  inputMode="numeric"
                  value={values.year}
                  onChange={(event) => update('year', event.target.value)}
                  aria-invalid={Boolean(errors.year)}
                  aria-describedby={errors.year ? 'artwork-year-error' : undefined}
                />
                {errors.year && <p className="field-error" id="artwork-year-error">{translateMessage(errors.year)}</p>}
              </div>
            </div>
            <div className="field">
              {/* Le libellé suit la forme : Poète, Photographe ou Artiste. */}
              <label htmlFor="artwork-artist">{tc('artworks', profile.creatorLabel)}</label>
              <input id="artwork-artist" value={values.artist} onChange={(event) => update('artist', event.target.value)} />
            </div>
            {/* Champs propres à la forme (27 octobre 2026), deux par ligne ;
                ceux d’une autre forme restent visibles tant qu’ils portent une valeur. */}
            {shortFields.length > 0 && (
              <div className="artwork-detail-grid">
                {shortFields.map(detailInput)}
              </div>
            )}
            {longFields.map((field) => (
              <div className="field artwork-poem-field" key={field.key}>
                <label htmlFor={`artwork-detail-${field.key}`}>{tc('artworks', field.label)}</label>
                <textarea
                  id={`artwork-detail-${field.key}`}
                  className="artwork-poem-input"
                  rows={10}
                  value={values.details[field.key] ?? ''}
                  maxLength={ARTWORK_DETAIL_LIMITS.poem}
                  placeholder={field.placeholder ? t(field.placeholder) : undefined}
                  onChange={(event) => updateDetail(field.key, event.target.value)}
                  spellCheck={false}
                  autoCorrect="off"
                />
              </div>
            ))}
            {showsPlace && (
              <div className="form-row form-row-halves">
                <div className="field">
                  <label htmlFor="artwork-location">{t("Lieu")}</label>
                  <input id="artwork-location" value={values.location} onChange={(event) => update('location', event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="artwork-exhibition">{tc('artworks', profile.exhibitionLabel)}</label>
                  <input id="artwork-exhibition" value={values.exhibition} onChange={(event) => update('exhibition', event.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Champs personnalisés nom → valeur (0.6.12) : autant de lignes
              que nécessaire, une ligne sans nom est ignorée à l'enregistrement. */}
          <div className="custom-fields">
            {values.customFields.map((field, index) => (
              <div className="custom-field-row" key={index}>
                <input
                  value={field.name}
                  onChange={(event) => updateCustomField(index, 'name', event.target.value)}
                  placeholder={t("Nom du champ")}
                  aria-label={t("Nom du champ personnalisé {number}", { number: index + 1 })}
                />
                <span className="custom-field-arrow" aria-hidden="true">→</span>
                <input
                  value={field.value}
                  onChange={(event) => updateCustomField(index, 'value', event.target.value)}
                  placeholder={t("Valeur")}
                  aria-label={t("Valeur du champ personnalisé {number}", { number: index + 1 })}
                />
                <button
                  type="button"
                  className="custom-field-remove"
                  onClick={() => removeCustomField(index)}
                  aria-label={t("Supprimer le champ personnalisé {number}", { number: index + 1 })}
                  title={t("Supprimer ce champ")}
                >×</button>
              </div>
            ))}
            <button
              type="button"
              className="link-accent custom-fields-add"
              onClick={() => setValues((current) => ({ ...current, customFields: [...current.customFields, { name: '', value: '' }] }))}
            >
              {t('Ajouter un champ personnalisé')}
            </button>
          </div>

          {saveError && <p className="form-error" role="alert">{translateMessage(saveError)}</p>}
        </div>

        <footer className="form-actions form-actions-docked">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>{t("Annuler")}</button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? t("Enregistrement…") : artwork ? t("Enregistrer les modifications") : t("Ajouter l’œuvre")}
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
