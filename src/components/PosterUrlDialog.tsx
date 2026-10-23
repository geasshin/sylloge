import { useEffect, useState } from 'react'
import { t, translateMessage } from '../i18n/core.ts'
import { AccessibleDialog } from './AccessibleDialog.tsx'
import { posterResetHint, posterEditTitle, type PosterLabel } from './Poster.tsx'

/** Adresse http(s) valide à prévisualiser, sinon null. */
function previewableUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

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
  // `unreachable` mémorise l'adresse dont le chargement a échoué : changer d'adresse efface l'alerte.
  const [unreachable, setUnreachable] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValue(currentUrl ?? '')
      setError(null)
      setUnreachable(null)
    }
  }, [open, currentUrl])

  if (!open) return null

  // L'image est seulement affichée depuis son adresse : rien n'est téléchargé ni copié dans Sylloge.
  const previewUrl = previewableUrl(value)

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
      title={posterEditTitle(label)}
      description={t('Coller l’adresse d’une image pour « {title} ».', { title })}
      closeDisabled={saving}
      onClose={onClose}
      size="md"
    >
      <div className="assistant-content poster-url-dialog">
        <label className="field">
          <span>{t("Adresse de l’image")}</span>
          <input
            type="url"
            value={value}
            placeholder="https://…"
            onChange={(event) => setValue(event.target.value)}
            autoFocus
          />
        </label>
        {previewUrl && (
          <div className="poster-url-preview" data-state={unreachable === previewUrl ? 'unreachable' : 'ready'}>
            {unreachable === previewUrl ? (
              <p role="status">{t('Cette adresse ne semble pas mener à une image.')}</p>
            ) : (
              <img src={previewUrl} alt="" onError={() => setUnreachable(previewUrl)} />
            )}
          </div>
        )}
        <p className="import-hint">{posterResetHint(label)}</p>
        {error && <p className="validation-errors" role="alert">{translateMessage(error)}</p>}
        <div className="assistant-actions assistant-actions-single">
          <button className="primary-button" type="button" disabled={saving} onClick={() => void submit()}>
            {saving ? t("Enregistrement…") : t("Enregistrer")}
          </button>
        </div>
      </div>
    </AccessibleDialog>
  )
}
