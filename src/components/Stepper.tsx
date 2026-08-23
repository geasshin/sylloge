type StepperProps = {
  id: string
  label: string
  value: string
  onChange?: (value: string) => void
  min?: number
  max?: number | null
  error?: string
  describedBy?: string
  /** Affichage lecture seule : la valeur est fournie (ex. total de saisons TMDB). */
  readOnly?: boolean
  /** Note affichée sous le compteur en lecture seule. */
  hint?: string
}

/**
 * Compteur numérique sobre piloté par boutons − / + : la saisie directe reste
 * possible, mais l'ajout d'une saison ou d'un tome se fait d'un geste, sans
 * champ numérique brut.
 */
export function Stepper({ id, label, value, onChange, min = 0, max = null, error, describedBy, readOnly = false, hint }: StepperProps) {
  const numericValue = value.trim() === '' ? null : Number(value)
  const current = numericValue !== null && Number.isFinite(numericValue) ? numericValue : null
  const canDecrease = current !== null && current > min
  const canIncrease = max === null || current === null || current < max

  const step = (delta: number) => {
    const base = current ?? (delta > 0 ? min - 1 : min + 1)
    const next = base + delta
    if (next < min) return
    if (max !== null && next > max) return
    onChange?.(String(next))
  }

  if (readOnly) {
    return (
      <div className="field stepper-field">
        <span className="stepper-readonly-label">{label}</span>
        <p className="stepper-readonly-value">
          {current !== null ? current : '—'}
          {hint && <small>{hint}</small>}
        </p>
      </div>
    )
  }

  return (
    <div className="field stepper-field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button
          type="button"
          className="stepper-button"
          onClick={() => step(-1)}
          disabled={!canDecrease}
          aria-label={`Retirer 1 à ${label}`}
        >
          −
        </button>
        <input
          id={id}
          name={id}
          inputMode="numeric"
          className="stepper-input"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className="stepper-button"
          onClick={() => step(1)}
          disabled={!canIncrease}
          aria-label={`Ajouter 1 à ${label}`}
        >
          +
        </button>
      </div>
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  )
}
