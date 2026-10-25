import { useEffect, useState } from 'react'
import { t, translateMessage } from '../i18n/core.ts'
import type { ArtworkImageCandidate } from '../domain/artImageSearch.ts'
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
  suggest,
}: {
  open: boolean
  title: string
  label: PosterLabel
  currentUrl: string | null
  onClose: () => void
  /** Reçoit l'URL saisie, ou null si l'utilisateur a vidé le champ. */
  onSave: (url: string | null) => Promise<void> | void
  /**
   * Propose des images pour cette œuvre (Art : Wikimedia Commons). Absent, le dialogue reste celui d'une
   * adresse à coller — un film, une série ou un jeu gardent leur propre source.
   */
  suggest?: () => Promise<ArtworkImageCandidate[]>
}) {
  const [value, setValue] = useState(currentUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // `unreachable` mémorise l'adresse dont le chargement a échoué : changer d'adresse efface l'alerte.
  const [unreachable, setUnreachable] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [candidates, setCandidates] = useState<ArtworkImageCandidate[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValue(currentUrl ?? '')
      setError(null)
      setUnreachable(null)
      setSearched(false)
      setCandidates([])
      setSearchError(null)
    }
  }, [open, currentUrl])

  if (!open) return null

  // L'image est seulement affichée depuis son adresse : rien n'est téléchargé ni copié dans Sylloge.
  const previewUrl = previewableUrl(value)

  const search = async () => {
    if (!suggest || searching) return
    setSearching(true)
    setSearchError(null)
    try {
      setCandidates(await suggest())
      setSearched(true)
    } catch (cause) {
      console.error('La recherche d’images a échoué.', cause)
      setCandidates([])
      setSearched(true)
      setSearchError(cause instanceof Error ? cause.message : 'La recherche d’images a échoué.')
    } finally {
      setSearching(false)
    }
  }

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
        {suggest && (
          <div className="poster-suggest">
            <div className="poster-suggest-head">
              <button className="secondary-button" type="button" disabled={searching || saving} onClick={() => void search()}>
                {searching ? t('Recherche d’images…') : t('Proposer des images')}
              </button>
              <p className="import-hint">{t('Images libres de Wikimedia Commons : cliquez pour poser l’adresse, puis Enregistrer.')}</p>
            </div>
            {searchError && <p className="validation-errors" role="alert">{translateMessage(searchError)}</p>}
            {searched && !searchError && candidates.length === 0 && (
              <p className="inline-report" role="status">{t('Aucune image trouvée. Vous pouvez coller une adresse.')}</p>
            )}
            {candidates.length > 0 && (
              <ul className="poster-suggest-grid" aria-label={t('Images proposées')}>
                {candidates.map(candidate => (
                  <li key={candidate.url}>
                    <button
                      type="button"
                      aria-pressed={value.trim() === candidate.url}
                      title={candidate.title}
                      onClick={() => { setValue(candidate.url); setUnreachable(null) }}
                    >
                      <img src={candidate.url} alt="" loading="lazy" />
                      <span>{candidate.license || t('Licence inconnue')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
