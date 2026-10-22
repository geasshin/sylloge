import { useState } from 'react'
import {
  CUSTOM_LIBRARY_GROUPS,
  CUSTOM_LIBRARY_IDS,
  CUSTOM_LIBRARY_TEMPLATES,
  type CustomLibraryId,
} from '../domain/customLibraries.ts'
import { AccessibleDialog } from './AccessibleDialog.tsx'
import { CustomLibraryIcon } from './CustomLibraryIcon.tsx'

type AddLibraryDialogProps = {
  enabled: readonly CustomLibraryId[]
  onClose: () => void
  /** Ajoute la bibliothèque au profil puis l’ouvre. */
  onAdd: (libraryId: CustomLibraryId) => Promise<void>
}

/**
 * Catalogue des bibliothèques prêtes à l’emploi, rangées par famille. Un clic
 * ajoute la bibliothèque au profil ; celles déjà ajoutées restent visibles,
 * marquées comme telles, pour que le catalogue garde la même forme.
 */
export function AddLibraryDialog({ enabled, onClose, onAdd }: AddLibraryDialogProps) {
  const [pending, setPending] = useState<CustomLibraryId | null>(null)
  const [error, setError] = useState<string | null>(null)

  const add = async (libraryId: CustomLibraryId) => {
    setPending(libraryId)
    setError(null)
    try {
      await onAdd(libraryId)
    } catch (cause) {
      console.error('Impossible d’ajouter la bibliothèque.', cause)
      setError('La bibliothèque n’a pas pu être ajoutée. Réessayez.')
      setPending(null)
    }
  }

  return (
    <AccessibleDialog
      title="Ajouter une bibliothèque"
      description="Des bibliothèques prêtes, avec leurs statuts, leur progression et leurs champs. Vous pourrez la supprimer à tout moment."
      closeDisabled={pending !== null}
      onClose={onClose}
      size="lg"
    >
      <div className="assistant-content library-catalog">
        {CUSTOM_LIBRARY_GROUPS.map((group) => {
          const ids = CUSTOM_LIBRARY_IDS.filter((id) => CUSTOM_LIBRARY_TEMPLATES[id].group === group)
          return (
            <section className="library-catalog-group" key={group} aria-labelledby={`library-catalog-${group}`}>
              <h3 id={`library-catalog-${group}`}>{group}</h3>
              <div className="library-catalog-grid">
                {ids.map((id) => {
                  const template = CUSTOM_LIBRARY_TEMPLATES[id]
                  const added = enabled.includes(id)
                  return (
                    <button
                      className={`library-option ${added ? 'is-added' : ''}`}
                      type="button"
                      key={id}
                      disabled={added || pending !== null}
                      aria-label={added ? `${template.longLabel} (déjà ajoutée)` : `Ajouter ${template.longLabel}`}
                      onClick={() => void add(id)}
                    >
                      <span className="library-option-icon" aria-hidden="true"><CustomLibraryIcon libraryId={id} size={20} /></span>
                      <span className="library-option-text">
                        <b>{template.longLabel}</b>
                        <small>{template.description}</small>
                      </span>
                      <span className="library-option-state" aria-hidden="true">
                        {added ? 'Ajoutée' : pending === id ? 'Ajout…' : 'Ajouter'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
        {error && <p className="validation-errors" role="alert">{error}</p>}
      </div>
    </AccessibleDialog>
  )
}
