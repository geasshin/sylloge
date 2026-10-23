import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { getLocale } from '../i18n/core.ts'

/**
 * Liste déroulante au style Sylloge (18 octobre 2026), à la place du menu
 * système : un bouton (aria-haspopup="listbox") ouvre une liste d'options
 * (role="listbox" / role="option" aria-selected).
 *
 * Clavier : flèches, Début, Fin, Page préc./suiv., Entrée ou Espace pour
 * choisir, Échap pour fermer en rendant le focus au bouton, Tab pour sortir,
 * saisie de lettres pour atteindre une option. Un clic à l'extérieur ferme.
 *
 * La liste reste dans le DOM du bouton (pas de portail) : les fenêtres et
 * panneaux qui la contiennent gardent leur gestion du focus et du clic
 * extérieur. Elle est positionnée en `fixed` à partir du bouton, puis
 * recalée sur sa position mesurée : elle échappe ainsi aux conteneurs qui
 * défilent, ne sort jamais de la fenêtre et s'ouvre vers le haut quand la
 * place manque en dessous.
 *
 * Le libellé visible appartient à l'appelant : il lui donne un id passé en
 * `labelledBy` (bouton et liste y sont associés par aria-labelledby).
 */
export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type SelectProps = {
  /** Identifiant du bouton ; la liste reçoit `${id}-listbox`. */
  id: string
  /** Identifiant du libellé visible associé. */
  labelledBy: string
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  /** Texte affiché quand la valeur ne correspond à aucune option. */
  placeholder?: string
  /** Nom de champ, pour un formulaire lu par FormData. */
  name?: string
  className?: string
}

/** Délai au-delà duquel une nouvelle lettre recommence la recherche. */
const TYPEAHEAD_DELAY = 500
/** Marge minimale entre la liste et les bords de la fenêtre. */
const VIEWPORT_MARGIN = 8
/** Écart entre le bouton et la liste. */
const ANCHOR_GAP = 4
/** Pas des touches Page préc. / Page suiv. */
const PAGE_STEP = 8

function comparable(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase(getLocale())
}

export function Select({
  id,
  labelledBy,
  value,
  options,
  onChange,
  disabled = false,
  invalid = false,
  describedBy,
  placeholder = '',
  name,
  className = '',
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typeahead = useRef({ text: '', at: 0 })
  const listboxId = `${id}-listbox`
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null
  const enabled = options.map((option, index) => (option.disabled ? -1 : index)).filter((index) => index >= 0)

  const openList = (initialIndex?: number) => {
    if (disabled || enabled.length === 0) return
    const start = initialIndex ?? (enabled.includes(selectedIndex) ? selectedIndex : enabled[0])
    setActiveIndex(start)
    setOpen(true)
  }

  const closeList = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  const choose = (index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    if (option.value !== value) onChange(option.value)
    closeList(true)
  }

  /** Option active la plus proche de `target`, dans le sens du déplacement. */
  const moveActive = (target: number, direction: 1 | -1) => {
    if (enabled.length === 0) return
    const clamped = Math.min(Math.max(target, 0), options.length - 1)
    const candidate = direction > 0
      ? enabled.find((index) => index >= clamped) ?? enabled[enabled.length - 1]
      : [...enabled].reverse().find((index) => index <= clamped) ?? enabled[0]
    setActiveIndex(candidate)
  }

  /**
   * Saisie de lettres : la première option qui commence par le texte tapé.
   * Une même lettre répétée passe d'une option à la suivante.
   */
  const findByTypeahead = (key: string, from: number): number => {
    const now = Date.now()
    const text = now - typeahead.current.at > TYPEAHEAD_DELAY ? key : typeahead.current.text + key
    typeahead.current = { text, at: now }
    const repeated = [...text].every((letter) => letter === text[0])
    const query = comparable(repeated ? text[0] : text)
    const origin = from < 0 ? 0 : from + (repeated ? 1 : 0)
    for (let step = 0; step < options.length; step += 1) {
      const index = (origin + step) % options.length
      const option = options[index]
      if (!option.disabled && comparable(option.label).startsWith(query)) return index
    }
    return -1
  }

  const isPrintable = (event: ReactKeyboardEvent) => event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey

  const onButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openList()
      return
    }
    if (isPrintable(event) && event.key !== ' ') {
      const match = findByTypeahead(event.key, selectedIndex)
      if (match >= 0) {
        event.preventDefault()
        openList(match)
      }
    }
  }

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveActive(activeIndex + 1, 1)
        return
      case 'ArrowUp':
        event.preventDefault()
        moveActive(activeIndex - 1, -1)
        return
      case 'Home':
        event.preventDefault()
        moveActive(0, 1)
        return
      case 'End':
        event.preventDefault()
        moveActive(options.length - 1, -1)
        return
      case 'PageDown':
        event.preventDefault()
        moveActive(activeIndex + PAGE_STEP, 1)
        return
      case 'PageUp':
        event.preventDefault()
        moveActive(activeIndex - PAGE_STEP, -1)
        return
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (activeIndex >= 0) choose(activeIndex)
        return
      case 'Escape':
        // Seule la liste se ferme : le panneau qui la contient reste ouvert.
        event.preventDefault()
        event.stopPropagation()
        closeList(true)
        return
      case 'Tab':
        setOpen(false)
        return
      default:
        if (isPrintable(event)) {
          const match = findByTypeahead(event.key, activeIndex)
          if (match >= 0) {
            event.preventDefault()
            setActiveIndex(match)
          }
        }
    }
  }

  // Ouverture : le focus passe à la liste, qui annonce l'option active.
  useEffect(() => {
    if (open) listRef.current?.focus({ preventScroll: true })
  }, [open])

  // Clic à l'extérieur : la liste se ferme sans voler le focus.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Position : sous le bouton, au-dessus si la place manque, toujours dans la
  // fenêtre. La position visée est appliquée puis corrigée de l'écart mesuré,
  // ce qui reste juste même sous un ancêtre qui crée son propre repère.
  const place = useCallback(() => {
    const button = buttonRef.current
    const list = listRef.current
    if (!button || !list) return
    const anchor = button.getBoundingClientRect()
    list.style.minWidth = `${Math.round(anchor.width)}px`
    const natural = list.scrollHeight + (list.offsetHeight - list.clientHeight)
    const below = window.innerHeight - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN
    const above = anchor.top - ANCHOR_GAP - VIEWPORT_MARGIN
    const openUp = natural > below && above > below
    const room = Math.max(0, Math.floor(openUp ? above : below))
    list.style.maxHeight = `${room}px`
    const height = Math.min(natural, room)
    const width = list.offsetWidth
    const top = openUp ? anchor.top - ANCHOR_GAP - height : anchor.bottom + ANCHOR_GAP
    const left = Math.min(Math.max(VIEWPORT_MARGIN, anchor.left), Math.max(VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN - width))
    list.dataset.placement = openUp ? 'top' : 'bottom'
    list.style.top = `${Math.round(top)}px`
    list.style.left = `${Math.round(left)}px`
    const measured = list.getBoundingClientRect()
    if (Math.abs(measured.top - top) > 0.5 || Math.abs(measured.left - left) > 0.5) {
      list.style.top = `${Math.round(2 * top - measured.top)}px`
      list.style.left = `${Math.round(2 * left - measured.left)}px`
    }
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    let frame = 0
    const schedule = (event: Event) => {
      // Le défilement interne de la liste ne la déplace pas.
      if (event.type === 'scroll' && event.target instanceof Node && listRef.current?.contains(event.target)) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(place)
    }
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
    }
  }, [open, place])

  // L'option active reste visible dans la liste, sans faire défiler la page.
  useLayoutEffect(() => {
    if (!open || activeIndex < 0) return
    const list = listRef.current
    const option = list?.children[activeIndex] as HTMLElement | undefined
    if (!list || !option) return
    const top = option.offsetTop
    const bottom = top + option.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
  }, [open, activeIndex])

  return (
    <div className={`select ${open ? 'is-open' : ''} ${className}`.trim()} ref={rootRef}>
      <button
        ref={buttonRef}
        id={id}
        className="select-trigger"
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-labelledby={`${labelledBy} ${id}`}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onClick={() => (open ? closeList(false) : openList())}
        onKeyDown={onButtonKeyDown}
      >
        <span className={`select-value ${selected ? '' : 'is-placeholder'}`}>{selected?.label ?? (placeholder || value)}</span>
        <svg className="select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {name !== undefined && <input type="hidden" name={name} value={value} />}
      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          className="select-listbox"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelledBy}
          aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          onKeyDown={onListKeyDown}
          onBlur={(event) => {
            if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false)
          }}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            return (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                className={`select-option ${index === activeIndex ? 'is-active' : ''}`}
                onPointerMove={() => { if (!option.disabled && index !== activeIndex) setActiveIndex(index) }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <svg className="select-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {isSelected && <polyline points="5 12.5 10 17.5 19 7" />}
                </svg>
                <span>{option.label}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
