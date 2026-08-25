import { useState } from 'react'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'

type PosterEditorOptions = {
  /** Titre de l'œuvre, pour les libellés accessibles du dialogue. */
  title: string
  label?: 'Affiche' | 'Couverture' | 'Visuel'
  /** URL actuelle du visuel : pré-remplit le dialogue à l'ouverture. */
  currentUrl?: string | null
  /** Reçoit l'URL validée (http/https) ou null si l'utilisateur a vidé le champ. */
  onSave: (url: string | null) => Promise<void> | void
}

/**
 * Comportement commun d'édition de visuel (0.6.11) : un seul mécanisme pour
 * l'affiche de film/série, la couverture de livre, la jaquette de jeu et le
 * visuel d'œuvre. Le crayon sur le visuel ouvre le même dialogue d'URL
 * partout ; les formulaires et les fiches branchent leurs champs.
 */
export function usePosterEditor({ title, label = 'Visuel', currentUrl = null, onSave }: PosterEditorOptions) {
  const [open, setOpen] = useState(false)

  const dialog = (
    <PosterUrlDialog
      open={open}
      title={title}
      label={label}
      currentUrl={currentUrl}
      onClose={() => setOpen(false)}
      onSave={async (url) => {
        await onSave(url)
      }}
    />
  )

  return {
    posterProps: { onEdit: () => setOpen(true) } as const,
    posterDialog: dialog,
  }
}
