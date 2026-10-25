import { useState } from 'react'
import type { ArtworkImageCandidate } from '../domain/artImageSearch.ts'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'

type PosterEditorOptions = {
  /** Titre de l'œuvre, pour les libellés accessibles du dialogue. */
  title: string
  label?: 'Affiche' | 'Couverture' | 'Visuel'
  /** URL actuelle du visuel : pré-remplit le dialogue à l'ouverture. */
  currentUrl?: string | null
  /** Reçoit l'URL validée (http/https) ou null si l'utilisateur a vidé le champ. */
  onSave: (url: string | null) => Promise<void> | void
  /** Propose des images (Art : Commons) ; absent, le dialogue se limite à l'adresse collée. */
  suggest?: () => Promise<ArtworkImageCandidate[]>
}

/**
 * Comportement commun d'édition de visuel (0.6.11) : un seul mécanisme pour
 * l'affiche de film/série, la couverture de livre, la jaquette de jeu et le
 * visuel d'œuvre. Le crayon sur le visuel ouvre le même dialogue d'URL
 * partout ; les formulaires et les fiches branchent leurs champs.
 */
export function usePosterEditor({ title, label = 'Visuel', currentUrl = null, onSave, suggest }: PosterEditorOptions) {
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
      suggest={suggest}
    />
  )

  return {
    posterProps: { onEdit: () => setOpen(true) } as const,
    posterDialog: dialog,
  }
}
