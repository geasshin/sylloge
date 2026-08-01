import { useEffect, useState } from 'react'
import { savedViewsRepository } from '../data/savedViewsRepository.ts'
import type { SavedView, SavedViewCriteria, SavedViewMedium } from '../domain/savedViews.ts'

type SavedViewsBarProps = {
  profileId: string
  medium: SavedViewMedium
  current: SavedViewCriteria
  onApply: (criteria: SavedViewCriteria) => void
}

type EditorMode =
  | { kind: 'closed' }
  | { kind: 'saving' }
  | { kind: 'renaming'; view: SavedView }

/**
 * Barre des vues enregistrées d'une bibliothèque (jalon 0.4.21) : rappeler,
 * nommer, renommer et supprimer un couple filtres + tri. Les vues sont
 * isolées par profil et par médium ; la suppression demande une confirmation
 * explicite en deux temps.
 */
export function SavedViewsBar({ profileId, medium, current, onApply }: SavedViewsBarProps) {
  const [views, setViews] = useState<SavedView[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [editor, setEditor] = useState<EditorMode>({ kind: 'closed' })
  const [nameInput, setNameInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSelectedId('')
    setEditor({ kind: 'closed' })
    setError(null)
    savedViewsRepository.list(profileId, medium).then(
      (loaded) => { if (!cancelled) setViews(loaded) },
      (loadError: unknown) => {
        console.error('Impossible de charger les vues enregistrées.', loadError)
        if (!cancelled) setViews([])
      },
    )
    return () => {
      cancelled = true
    }
  }, [profileId, medium])

  const selectedView = views.find((view) => view.id === selectedId) ?? null

  const openEditor = (mode: EditorMode) => {
    setError(null)
    setConfirmingDelete(false)
    setEditor(mode)
    setNameInput(mode.kind === 'renaming' ? mode.view.name : '')
  }

  const save = async () => {
    try {
      const created = await savedViewsRepository.create(profileId, medium, nameInput, current)
      setViews((existing) => [...existing, created].sort((first, second) => first.name.localeCompare(second.name, 'fr', { sensitivity: 'base' })))
      setSelectedId(created.id)
      setEditor({ kind: 'closed' })
      setError(null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'La vue n’a pas pu être enregistrée.')
    }
  }

  const rename = async (view: SavedView) => {
    try {
      await savedViewsRepository.rename(profileId, view.id, nameInput)
      const trimmed = nameInput.trim().replace(/\s+/g, ' ')
      setViews((existing) => existing
        .map((entry) => (entry.id === view.id ? { ...entry, name: trimmed } : entry))
        .sort((first, second) => first.name.localeCompare(second.name, 'fr', { sensitivity: 'base' })))
      setEditor({ kind: 'closed' })
      setError(null)
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'La vue n’a pas pu être renommée.')
    }
  }

  const remove = async (view: SavedView) => {
    try {
      await savedViewsRepository.remove(profileId, view.id)
      setViews((existing) => existing.filter((entry) => entry.id !== view.id))
      setSelectedId('')
      setConfirmingDelete(false)
      setError(null)
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'La vue n’a pas pu être supprimée.')
    }
  }

  return (
    <div className="saved-views" aria-label="Vues enregistrées">
      <label className="saved-views-picker">
        <span className="visually-hidden">Rappeler une vue enregistrée</span>
        <select
          value={selectedId}
          onChange={(event) => {
            const id = event.target.value
            setSelectedId(id)
            setConfirmingDelete(false)
            const view = views.find((entry) => entry.id === id)
            if (view) onApply(view.criteria)
          }}
        >
          <option value="">Vues enregistrées…</option>
          {views.map((view) => (
            <option key={view.id} value={view.id}>{view.name}</option>
          ))}
        </select>
      </label>

      {editor.kind === 'closed' && (
        <div className="saved-views-actions">
          <button className="filter-panel-toggle" type="button" onClick={() => openEditor({ kind: 'saving' })}>
            Enregistrer la vue
          </button>
          {selectedView && (
            <>
              <button className="filter-panel-toggle" type="button" onClick={() => openEditor({ kind: 'renaming', view: selectedView })}>
                Renommer
              </button>
              {confirmingDelete ? (
                <>
                  <button className="filter-panel-toggle danger-action" type="button" onClick={() => remove(selectedView)}>
                    Confirmer la suppression
                  </button>
                  <button className="filter-panel-toggle" type="button" onClick={() => setConfirmingDelete(false)}>
                    Annuler
                  </button>
                </>
              ) : (
                <button className="filter-panel-toggle" type="button" onClick={() => setConfirmingDelete(true)}>
                  Supprimer
                </button>
              )}
            </>
          )}
        </div>
      )}

      {editor.kind !== 'closed' && (
        <form
          className="saved-views-editor"
          onSubmit={(event) => {
            event.preventDefault()
            if (editor.kind === 'saving') void save()
            else void rename(editor.view)
          }}
        >
          <label className="visually-hidden" htmlFor={`saved-view-name-${medium}`}>
            {editor.kind === 'saving' ? 'Nom de la nouvelle vue' : 'Nouveau nom de la vue'}
          </label>
          <input
            id={`saved-view-name-${medium}`}
            value={nameInput}
            placeholder={editor.kind === 'saving' ? 'Nom de la vue' : 'Nouveau nom'}
            onChange={(event) => setNameInput(event.target.value)}
            autoFocus
          />
          <button className="filter-panel-toggle" type="submit">Valider</button>
          <button className="filter-panel-toggle" type="button" onClick={() => openEditor({ kind: 'closed' })}>Annuler</button>
        </form>
      )}

      {error && <p className="saved-views-error" role="alert">{error}</p>}
    </div>
  )
}
