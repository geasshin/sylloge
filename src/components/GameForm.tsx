import { useState, type FormEvent } from 'react'
import {
  GAME_STATUSES,
  GAME_STATUS_LABELS,
  type Game,
} from '../domain/game.ts'
import {
  EMPTY_GAME_FORM,
  gameToFormValues,
  validateGameForm,
  type GameFormErrors,
  type GameFormValues,
  type GameWriteInput,
} from '../domain/gameForm.ts'
import { localToday } from '../domain/filmForm.ts'
import { Poster } from './Poster.tsx'
import { StatusSegmented, StarRating, FavoriteHeart } from './VerdictControls.tsx'

const RATINGS = Array.from({ length: 10 }, (_, index) => (index + 1) / 2)

function previewableCoverUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

type GameFormProps = {
  game?: Game
  /** Valeurs préremplies par la recherche RAWG (création assistée, jalon 0.4.28). */
  initialValues?: GameFormValues
  platformSuggestions: readonly string[]
  onCancel: () => void
  onSave: (input: GameWriteInput) => Promise<void>
}

export function GameForm({ game, initialValues, platformSuggestions, onCancel, onSave }: GameFormProps) {
  const [values, setValues] = useState<GameFormValues>(() => game ? gameToFormValues(game) : { ...EMPTY_GAME_FORM, ...initialValues })
  const [errors, setErrors] = useState<GameFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const today = localToday()
  const hasSecondaryDetails = Boolean(
    game
      ? game.developer || game.platform || game.year !== null
      : initialValues && (initialValues.developer || initialValues.year),
  )
  const previewTitle = values.title.trim() || 'Titre à renseigner'
  const previewUrl = previewableCoverUrl(values.coverUrl)

  const update = <Key extends keyof GameFormValues>(key: Key, value: GameFormValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSaveError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = validateGameForm(values)

    if (!result.success) {
      setErrors(result.errors)
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      await onSave(result.data)
    } catch (error) {
      console.error('Impossible d’enregistrer le jeu.', error)
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
        <p className="eyebrow">Jeu vidéo</p>
        <h1 className="display-title">{game ? 'Modifier la fiche' : 'Ajouter un jeu'}</h1>
        <p>Seul le titre est obligatoire.</p>
      </div>

      <form className="film-form" onSubmit={handleSubmit} noValidate>
        <div className="field field-title">
          <label htmlFor="game-title">Titre <span aria-hidden="true">*</span></label>
          <input
            id="game-title"
            name="title"
            value={values.title}
            onChange={(event) => update('title', event.target.value)}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? 'game-title-error' : undefined}
            autoFocus
          />
          {errors.title && <p className="field-error" id="game-title-error">{errors.title}</p>}
        </div>

        <div className="form-row relationship-row">
          <div className="field">
            <StatusSegmented
              statuses={GAME_STATUSES}
              labels={GAME_STATUS_LABELS}
              value={values.status}
              onChange={(next) => update('status', next as GameFormValues['status'])}
            />
            {errors.status && <p className="field-error" id="game-status-error">{errors.status}</p>}
          </div>

          <div className="field">
            <StarRating
              value={values.rating === '' ? null : Number(values.rating)}
              onChange={(next) => update('rating', next === null ? '' : String(next))}
            />
            {errors.rating && <p className="field-error" id="game-rating-error">{errors.rating}</p>}
          </div>
        </div>

        <div className="favorite-heart-row">
          <FavoriteHeart checked={values.isFavorite} onChange={(next) => update('isFavorite', next)} />
          <span>Coup de cœur</span>
        </div>

        <div className="field">
          <label htmlFor="game-playedAt">Date de jeu ou de visionnage</label>
          <input
            id="game-playedAt"
            name="playedAt"
            type="date"
            value={values.playedAt}
            onChange={(event) => update('playedAt', event.target.value)}
            aria-invalid={Boolean(errors.playedAt)}
            aria-describedby={errors.playedAt ? 'game-playedAt-error' : undefined}
          />
          {errors.playedAt && <p className="field-error" id="game-playedAt-error">{errors.playedAt}</p>}
          {values.status !== 'à jouer' && !values.playedAt && (
            <div className="date-suggestion">
              <span>La date reste facultative.</span>
              <button type="button" onClick={() => update('playedAt', today)}>Utiliser aujourd’hui</button>
            </div>
          )}
        </div>

        <details className="secondary-fields" open={hasSecondaryDetails || undefined}>
          <summary>Informations sur le jeu</summary>
          <div className="secondary-fields-content">
            <div className="field">
              <label htmlFor="game-developer">Studio ou développeur</label>
              <input id="game-developer" value={values.developer} onChange={(event) => update('developer', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="game-platform">Plateforme</label>
              <input
                id="game-platform"
                list="game-platform-suggestions"
                value={values.platform}
                onChange={(event) => update('platform', event.target.value)}
                aria-describedby="game-platform-help"
              />
              <datalist id="game-platform-suggestions">
                {platformSuggestions.map((platform) => <option value={platform} key={platform} />)}
              </datalist>
              <p className="field-help" id="game-platform-help">Choisissez une suggestion ou saisissez librement une autre plateforme.</p>
            </div>
            <div className="field">
              <label htmlFor="game-year">Année de sortie</label>
              <input
                id="game-year"
                inputMode="numeric"
                value={values.year}
                onChange={(event) => update('year', event.target.value)}
                aria-invalid={Boolean(errors.year)}
                aria-describedby={errors.year ? 'game-year-error' : undefined}
              />
              {errors.year && <p className="field-error" id="game-year-error">{errors.year}</p>}
            </div>
          </div>
        </details>

        <div className="field">
          <label htmlFor="game-coverUrl">URL directe de la couverture</label>
          <input
            id="game-coverUrl"
            name="coverUrl"
            type="url"
            inputMode="url"
            placeholder="https://…/couverture.jpg"
            value={values.coverUrl}
            onChange={(event) => update('coverUrl', event.target.value)}
            aria-invalid={Boolean(errors.coverUrl)}
            aria-describedby={`game-cover-help${errors.coverUrl ? ' game-cover-error' : ''}`}
          />
          <p className="field-help" id="game-cover-help">Une image indisponible n’empêchera pas l’enregistrement.</p>
          {errors.coverUrl && <p className="field-error" id="game-cover-error">{errors.coverUrl}</p>}
          <div className="poster-preview">
            <p>Aperçu de la couverture</p>
            <Poster title={previewTitle} src={previewUrl} className="form-poster-preview" label="Couverture" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="game-personalNote">Avis personnel</label>
          <textarea
            id="game-personalNote"
            name="personalNote"
            rows={5}
            value={values.personalNote}
            onChange={(event) => update('personalNote', event.target.value)}
          />
        </div>

        {saveError && <p className="form-error" role="alert">{saveError}</p>}

        <footer className="form-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Annuler</button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : game ? 'Enregistrer les modifications' : 'Ajouter le jeu'}
          </button>
        </footer>
      </form>
    </main>
  )
}
