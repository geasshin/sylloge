import { useEffect, useState } from 'react'
import { AccessibleDialog } from './AccessibleDialog.tsx'
import { posterLabelAfterA, posterLabelWithArticle, type PosterLabel } from './Poster.tsx'

/**
 * Dialogue de modification du visuel d'une fiche par URL.
 * Utilisé depuis le crayon posé sur l'affiche/couverture/visuel des fiches.
 */
export function PosterUrlDialog({
  open,
  title,
  label,
  currentUrl,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  label: PosterLabel
  currentUrl: string | null
  onClose: () => void
  /** Reçoit l'URL saisie, ou null si l'utilisateur a vidé le champ. */
  onSave: (url: string | null) => Promise<void> | void
}) {
  const [value, setValue] = useState(currentUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValue(currentUrl ?? '')
      setError(null)
    }
  }, [open, currentUrl])

  if (!open) return null

  const submit = async () => {
    const trimmed = value.trim()
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      setError('L’adresse doit commencer par http:// ou https://')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(trimmed || null)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'L’enregistrement a échoué.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AccessibleDialog
      title={`Modifier ${posterLabelWithArticle(label)}`}
      description={`Coller l’adresse d’une image pour « ${title} ».`}
      closeDisabled={saving}
      onClose={onClose}
      size="md"
    >
      <div className="assistant-content poster-url-dialog">
        <label className="field">
          <span>Adresse de l’image</span>
          <input
            type="url"
            value={value}
            placeholder="https://…"
            onChange={(event) => setValue(event.target.value)}
            autoFocus
          />
        </label>
        <p className="import-hint">Le lien d’une image trouvée sur le web suffit. Laisser vide pour revenir {posterLabelAfterA(label)} par défaut.</p>
        {error && <p className="validation-errors" role="alert">{error}</p>}
        <div className="assistant-actions assistant-actions-single">
          <button className="primary-button" type="button" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </AccessibleDialog>
  )
}
