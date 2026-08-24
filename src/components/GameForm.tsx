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
  // Création assistée : les champs éditoriaux sont déjà portés par la recherche.
  const assisted = !game && Boolean(initialValues?.title)
  const [showEditorial, setShowEditorial] = useState(!assisted)
  const previewTitle = values.title.trim() || 'Titre à renseigner'
  const previewUrl = previewableCoverUrl(values.coverUrl)
  const ratingValue = values.rating === '' ? null : Number(values.rating)
  // « À jouer » : pas encore de verdict, on masque note, cœur, date et avis.
  const verdictVisible = values.status !== 'à jouer'

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
        <p>{assisted ? 'Ton jeu est reconnu : choisis juste ton verdict.' : 'Seul le titre est obligatoire.'}</p>
      </div>

      <form className="film-form form-detail" onSubmit={handleSubmit} noValidate>
        <div className="form-side">
          <div className="form-poster-frame">
            <Poster title={previewTitle} src={previewUrl} className="form-poster-preview-lg" label="Couverture" />
          </div>
          <p className="form-poster-caption">Aperçu de la couverture</p>
        </div>

        <div className="form-body">
          <div className={`field field-title ${assisted ? 'field-title-read' : ''}`}>
            <label htmlFor="game-title">Titre <span aria-hidden="true">*</span></label>
            <input
              id="game-title"
              name="title"
              value={values.title}
              onChange={(event) => update('title', event.target.value)}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'game-title-error' : undefined}
              autoFocus={!assisted}
            />
            {errors.title && <p className="field-error" id="game-title-error">{errors.title}</p>}
          </div>

          {/* Le verdict personnel */}
          <div className="verdict-block">
            <div className="verdict-row">
              <StatusSegmented
                statuses={GAME_STATUSES}
                labels={GAME_STATUS_LABELS}
                value={values.status}
                onChange={(next) => update('status', next as GameFormValues['status'])}
              />
              {verdictVisible && (
                <>
                  <StarRating value={ratingValue} onChange={(next) => update('rating', next === null ? '' : String(next))} />
                  <FavoriteHeart checked={values.isFavorite} onChange={(next) => update('isFavorite', next)} />
                </>
              )}
            </div>

            {verdictVisible && (
              <>
                <div className="date-row">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                  <input
                    id="game-playedAt"
                    name="playedAt"
                    type="date"
                    value={values.playedAt || today}
                    onChange={(event) => update('playedAt', event.target.value)}
                    aria-label={values.status === 'regardé' ? 'Date du visionnage' : 'Date de jeu'}
                    aria-invalid={Boolean(errors.playedAt)}
                  />
                </div>
                {errors.playedAt && <p className="field-error">{errors.playedAt}</p>}

                <div className="review-write">
                  <textarea
                    id="game-personalNote"
                    name="personalNote"
                    rows={5}
                    placeholder="Qu’as-tu pensé de ce jeu ?"
                    value={values.personalNote}
                    onChange={(event) => update('personalNote', event.target.value)}
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
              </>
            )}
            {!verdictVisible && (
              <p className="verdict-hint">Passe le jeu en « En cours », « Joué » ou « Regardé » pour ajouter ta note, ta date et ton avis.</p>
            )}
          </div>

          {/* Champs éditoriaux : cachés en création assistée */}
          {!assisted && (
            <details className="secondary-fields" open={showEditorial || undefined}>
              <summary onClick={(event) => { event.preventDefault(); setShowEditorial((value) => !value) }}>
                Informations sur le jeu
              </summary>
              {showEditorial && (
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
              )}
            </details>
          )}

          {saveError && <p className="form-error" role="alert">{saveError}</p>}

          <footer className="form-actions">
            <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Annuler</button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Enregistrement…' : game ? 'Enregistrer les modifications' : 'Ajouter le jeu'}
            </button>
          </footer>
        </div>
      </form>
    </main>
  )
}
