import { useEffect, useRef, type ReactNode } from 'react'

type AccessibleDialogProps = {
  title: string
  description: string
  closeDisabled: boolean
  onClose: () => void
  children: ReactNode
}

export function AccessibleDialog({
  title,
  description,
  closeDisabled,
  onClose,
  children,
}: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    return () => returnFocusRef.current?.focus()
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const focusableElements = () => [...dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )]
    const keepFocusInDialog = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!closeDisabled) onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = focusableElements()
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const activeElement = document.activeElement
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!dialog.contains(activeElement) || activeElement === dialog || !focusable.includes(activeElement as HTMLElement)) {
        event.preventDefault()
        const destination = event.shiftKey ? last : first
        destination.focus()
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', keepFocusInDialog, true)
    if (closeDisabled && focusableElements().length === 0) dialog.focus()
    return () => document.removeEventListener('keydown', keepFocusInDialog, true)
  }, [closeDisabled, onClose])

  return (
    <div className="transfer-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !closeDisabled) onClose()
    }}>
      <div className="transfer-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title" aria-describedby="transfer-dialog-description" tabIndex={-1}>
        <header className="transfer-dialog-header">
          <div><p className="card-kicker">Assistant local</p><h2 id="transfer-dialog-title">{title}</h2><p id="transfer-dialog-description">{description}</p></div>
          <button className="dialog-close" ref={closeButtonRef} type="button" disabled={closeDisabled} onClick={onClose} aria-label="Fermer l’assistant">Fermer</button>
        </header>
        {children}
      </div>
    </div>
  )
}
