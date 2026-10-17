import { useEffect, useRef, type ComponentPropsWithoutRef, type RefObject } from 'react'

/** Clavier commun aux fenêtres, y compris aux fenêtres imbriquées.
 * Le déclencheur est mémorisé avant que l'autofocus d'un enfant ne le remplace. */
export function useDialogFocus(
  dialogRef: RefObject<HTMLDivElement | null>,
  onClose: () => void,
  closeDisabled = false,
) {
  const returnFocusRef = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const callbacksRef = useRef({ onClose, closeDisabled })
  callbacksRef.current = { onClose, closeDisabled }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const isTopDialog = () => [...document.querySelectorAll('[aria-modal="true"]')].at(-1) === dialog
    const focusableElements = () => [...dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
    const frame = window.requestAnimationFrame(() => {
      if (isTopDialog() && !dialog.contains(document.activeElement)) {
        ;(focusableElements()[0] ?? dialog).focus({ preventScroll: true })
      }
    })
    const keepFocusInDialog = (event: KeyboardEvent) => {
      if (!isTopDialog()) return
      const { onClose } = callbacksRef.current
      const closeDisabled = callbacksRef.current.closeDisabled || Boolean(dialog.querySelector('button[type="submit"]:disabled'))
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!closeDisabled) onClose()
        event.stopPropagation()
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
      if (!focusable.includes(activeElement as HTMLElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keepFocusInDialog, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', keepFocusInDialog, true)
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true })
    }
  }, [dialogRef])
}

type FocusDialogProps = ComponentPropsWithoutRef<'div'> & {
  onClose: () => void
  closeDisabled?: boolean
}

/** N'ajoute pas de conteneur : préserve la grille et les styles du dialogue hôte. */
export function FocusDialog({ onClose, closeDisabled = false, ...props }: FocusDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(dialogRef, onClose, closeDisabled)
  return <div role="dialog" aria-modal="true" tabIndex={-1} {...props} ref={dialogRef} />
}
