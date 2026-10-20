import { useRef, type ReactNode } from 'react'
import { useDialogFocus } from './FocusDialog.tsx'

type AccessibleDialogProps = {
  title: string
  description: string
  closeDisabled: boolean
  onClose: () => void
  /** Largeur du gabarit commun des fenêtres : sm 440, md 640, lg 880 px. */
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

export function AccessibleDialog({
  title,
  description,
  closeDisabled,
  onClose,
  size = 'lg',
  children,
}: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(dialogRef, onClose, closeDisabled)

  return (
    <div className="transfer-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !closeDisabled) onClose()
    }}>
      <div className={`transfer-dialog dialog-${size}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title" aria-describedby="transfer-dialog-description" tabIndex={-1}>
        <header className="transfer-dialog-header">
          <div><h2 id="transfer-dialog-title">{title}</h2><p id="transfer-dialog-description">{description}</p></div>
          <button className="dialog-close" type="button" disabled={closeDisabled} onClick={onClose} aria-label="Fermer l’assistant">×</button>
        </header>
        {children}
      </div>
    </div>
  )
}
