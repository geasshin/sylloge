import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { savedViewsRepository as sqliteSavedViewsRepository } from '../data/savedViewsRepository.ts'
import type { SavedView, SavedViewCriteria, SavedViewMedium } from '../domain/savedViews.ts'
import {
  EMPTY_LIBRARY_FILTERS,
  activeCriteriaLabel,
  countActiveFilters,
  type LibraryFilters,
} from '../domain/libraryFilters.ts'
import {
  LIBRARY_SORT_DIRECTION_LABELS,
  defaultBuiltinViewForMedium,
  defaultSortDirection,
  librarySortColumnLabel,
  sortColumnsForMedium,
  sortsEqual,
  type LibrarySort,
  type LibrarySortCapabilities,
  type LibrarySortColumn,
  type LibraryViewDefinition,
} from '../domain/libraryViews.ts'
import { Select } from './Select.tsx'

/**
 * Configuration bornée des critères de filtre d'une bibliothèque : chaque
 * médium n'expose que les champs réellement utiles de son modèle.
 */
export type LibraryFilterConfig = {
  /** Filtre propre au médium (catégorie, plateforme, forme) ; null pour Films. */
  mediumFilter: { label: string; options: Array<{ value: string; label: string }> } | null
  statusOptions: Array<{ value: string; label: string }>
  showRating: boolean
  showYear: boolean
  /** Nom de la date personnelle du médium : libellé du filtre et de la colonne de tri. */
  personalDateLabel: string | null
  specificTextField: { label: string; placeholder: string } | null
  showLocation: boolean
  showExhibition: boolean
}

/** « Mettre à jour la vue » reste facultatif : un dépôt sans écriture des critères propose seulement d'enregistrer. */
type SavedViewsRepositoryPort = Pick<typeof sqliteSavedViewsRepository, 'list' | 'create' | 'rename' | 'remove'>
  & Partial<Pick<typeof sqliteSavedViewsRepository, 'update'>>

type LibraryViewBarProps = {
  profileId: string
  medium: SavedViewMedium
  savedViewsRepository?: SavedViewsRepositoryPort
  builtinViews: readonly LibraryViewDefinition[]
  activeView: LibraryViewDefinition
  onViewChange: (view: LibraryViewDefinition) => void
  filterConfig: LibraryFilterConfig
  mediumFilterValue: string
  onMediumFilterChange: (value: string) => void
  extraFilters: LibraryFilters
  onExtraFiltersChange: (filters: LibraryFilters) => void
  sortCapabilities: LibrarySortCapabilities
  sortOverride: LibrarySort | null
  onSortOverrideChange: (sort: LibrarySort | null) => void
  currentCriteria: SavedViewCriteria
}

type OpenPopover = 'filters' | 'sort' | 'create' | 'view-menu' | null
type ViewMenuMode = 'menu' | 'rename' | 'confirm-delete'

/** Marge entre un panneau flottant et les bords de la fenêtre (= --space-2). */
const VIEWPORT_MARGIN = 8
/** Part de la largeur visible parcourue par une flèche de défilement. */
const SCROLL_STEP = 0.7

const svg = (children: ReactNode, size = 14) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const ICONS = {
  filter: svg(<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />),
  sort: svg(<path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 5v15" />),
  plus: svg(<path d="M12 5v14M5 12h14" />),
  more: svg(<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>, 16),
  check: svg(<polyline points="5 12.5 10 17.5 19 7" />),
  previous: svg(<polyline points="15 18 9 12 15 6" />),
  next: svg(<polyline points="9 18 15 12 9 6" />),
  rename: svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>),
  update: svg(<><path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" /></>),
  trash: svg(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>),
}

const directionIcon = (direction: LibrarySort['direction'], size = 12) => (
  direction === 'asc'
    ? svg(<><path d="M12 19V5" /><polyline points="6 11 12 5 18 11" /></>, size)
    : svg(<><path d="M12 5v14" /><polyline points="6 13 12 19 18 13" /></>, size)
)

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function byName(first: SavedView, second: SavedView): number {
  return first.name.localeCompare(second.name, 'fr', { sensitivity: 'base' })
}

/**
 * Barre de vues des bibliothèques (18 octobre 2026).
 *
 * À gauche, toutes les vues en pastilles distinctes, dans le langage du
 * contrôle segmenté de l'accueil : vues intégrées, fin séparateur, vues
 * enregistrées, puis « Nouvelle vue ». Aucune vue n'est cachée dans un menu :
 * si la place manque, la rangée défile (molette, trackpad, flèches) et la vue
 * active est toujours ramenée dans le champ. « Nouvelle vue » reste hors de la
 * zone qui défile : elle n'est jamais rognée par son bord. La vue enregistrée
 * active porte son propre menu (renommer, mettre à jour, supprimer).
 *
 * À droite, des actions libellées : « Filtrer » et son compteur, « Trier »
 * qui affiche le tri effectif ; quand les filtres ou le tri diffèrent de la
 * vue active, « Réinitialiser » et « Enregistrer » ou « Mettre à jour »
 * apparaissent devant elles. Les filtres et le tri choisis à la volée
 * s'appliquent par-dessus la vue active.
 */
export function LibraryViewBar({
  profileId,
  medium,
  savedViewsRepository: repository = sqliteSavedViewsRepository,
  builtinViews,
  activeView,
  onViewChange,
  filterConfig,
  mediumFilterValue,
  onMediumFilterChange,
  extraFilters,
  onExtraFiltersChange,
  sortCapabilities,
  sortOverride,
  onSortOverrideChange,
  currentCriteria,
}: LibraryViewBarProps) {
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [open, setOpen] = useState<OpenPopover>(null)
  const [menuMode, setMenuMode] = useState<ViewMenuMode>('menu')
  const [nameInput, setNameInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [edges, setEdges] = useState({ start: false, end: false })
  const [rovingKey, setRovingKey] = useState<string | null>(null)
  /** Origine de la nouvelle vue : bouton de la rangée ou « Enregistrer » des modifications. */
  const [createSource, setCreateSource] = useState<'row' | 'pending'>('row')
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const floatingRef = useRef<HTMLDivElement>(null)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  /** Élément qui a ouvert le panneau courant : le focus y revient à la fermeture. */
  const triggerRef = useRef<HTMLElement | null>(null)
  /** Vue à focaliser dès que sa pastille est rendue (création, renommage, suppression). */
  const pendingFocusRef = useRef<string | null>(null)

  const ids = {
    filters: `${medium}-view-bar-filters`,
    sort: `${medium}-view-bar-sort`,
    sortHint: `${medium}-view-bar-sort-hint`,
    create: `${medium}-view-bar-create`,
    createLabel: `${medium}-view-bar-create-label`,
    viewMenu: `${medium}-view-bar-view-menu`,
    deleteQuestion: `${medium}-view-bar-delete-question`,
  }

  useEffect(() => {
    let cancelled = false
    repository.list(profileId, medium).then(
      (loaded) => { if (!cancelled) setSavedViews(loaded) },
      (loadError: unknown) => {
        console.error('Impossible de charger les vues enregistrées.', loadError)
        if (!cancelled) setSavedViews([])
      },
    )
    return () => {
      cancelled = true
    }
  }, [profileId, medium, repository])

  const activeSavedView = activeView.builtin ? null : savedViews.find((view) => view.id === activeView.id) ?? null
  const panelFilterCount = countActiveFilters(extraFilters) + (mediumFilterValue !== 'all' ? 1 : 0)
  const baselineMediumFilter = activeSavedView ? activeSavedView.criteria.mediumFilter : 'all'
  // La vue active est « modifiée » dès qu'un filtre, un tri ou une forme,
  // catégorie ou plateforme s'écarte de sa définition.
  const dirty = countActiveFilters(extraFilters) > 0 || sortOverride !== null || currentCriteria.mediumFilter !== baselineMediumFilter
  const canUpdate = activeSavedView !== null && typeof repository.update === 'function'
  const sortColumns = sortColumnsForMedium(sortCapabilities)
  const effectiveSort = sortOverride ?? activeView.sort
  const columnLabel = (column: LibrarySortColumn) => librarySortColumnLabel(column, filterConfig.personalDateLabel)
  const sortDescription = (sort: LibrarySort) => `${columnLabel(sort.column)}, ${LIBRARY_SORT_DIRECTION_LABELS[sort.direction].toLocaleLowerCase('fr')}`

  // ——— Ouverture et fermeture des panneaux ———————————————————————————————

  const closePopover = useCallback((restoreFocus: boolean) => {
    setOpen(null)
    setMenuMode('menu')
    setError(null)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  const openPopover = (popover: Exclude<OpenPopover, null>, trigger: HTMLElement) => {
    if (open === popover && triggerRef.current === trigger) {
      closePopover(false)
      return
    }
    triggerRef.current = trigger
    if (popover === 'create') setCreateSource(trigger.dataset.source === 'pending' ? 'pending' : 'row')
    setError(null)
    setMenuMode('menu')
    setNameInput('')
    setOpen(popover)
  }

  useEffect(() => {
    if (open === null) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closePopover(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      // Une liste déroulante ouverte dans le panneau consomme sa propre Échap.
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const focusInside = rootRef.current?.contains(document.activeElement) ?? false
      closePopover(focusInside)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closePopover])

  // Menus (tri, vue enregistrée) : le focus entre sur l'élément coché ou le premier.
  useEffect(() => {
    if (open !== 'sort' && !(open === 'view-menu' && menuMode === 'menu')) return
    const container = open === 'sort' ? document.getElementById(ids.sort) : document.getElementById(ids.viewMenu)
    const target = container?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')
      ?? container?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')
    target?.focus()
    // Les identifiants ne dépendent que du médium.
  }, [open, menuMode, ids.sort, ids.viewMenu])

  // Panneaux ancrés à la rangée des vues (nouvelle vue, menu de la vue
  // enregistrée qui défile avec elle) : rendus hors de la zone de défilement
  // pour ne jamais être rognés, ils suivent leur bouton et restent dans la fenêtre.
  useLayoutEffect(() => {
    if (open !== 'create' && open !== 'view-menu') return
    const place = () => {
      const panel = floatingRef.current
      const root = rootRef.current
      const anchor = triggerRef.current
      if (!panel || !root || !anchor || !anchor.isConnected) return
      const anchorBox = anchor.getBoundingClientRect()
      const rootBox = root.getBoundingClientRect()
      const width = panel.offsetWidth
      // Aligné sur son bouton, sans dépasser le bord droit de la barre ni la fenêtre.
      const maxRight = Math.min(window.innerWidth - VIEWPORT_MARGIN, rootBox.right)
      const left = Math.min(Math.max(VIEWPORT_MARGIN, anchorBox.left), Math.max(VIEWPORT_MARGIN, maxRight - width))
      panel.style.left = `${Math.round(left - rootBox.left)}px`
      panel.style.top = `calc(${Math.round(anchorBox.bottom - rootBox.top)}px + var(--space-2))`
    }
    place()
    const scroller = scrollerRef.current
    scroller?.addEventListener('scroll', place, { passive: true })
    window.addEventListener('resize', place)
    return () => {
      scroller?.removeEventListener('scroll', place)
      window.removeEventListener('resize', place)
    }
  }, [open, menuMode])

  // ——— Rangée des vues : défilement, bords, vue active dans le champ ————————

  // Le seul arrêt de tabulation de la rangée revient à la vue active quand elle change.
  useEffect(() => {
    setRovingKey(null)
  }, [activeView.id])

  const updateEdges = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const start = scroller.scrollLeft > 1
    const end = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1
    setEdges((previous) => (previous.start === start && previous.end === end ? previous : { start, end }))
  }, [])

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    updateEdges()
    const observer = new ResizeObserver(updateEdges)
    observer.observe(scroller)
    if (trackRef.current) observer.observe(trackRef.current)
    scroller.addEventListener('scroll', updateEdges, { passive: true })
    // Molette verticale : elle fait défiler la rangée tant qu'il reste des
    // vues à montrer dans ce sens, puis rend la main à la page.
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      const max = scroller.scrollWidth - scroller.clientWidth
      if (max <= 0) return
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      const next = Math.min(max, Math.max(0, scroller.scrollLeft + delta))
      if (Math.abs(next - scroller.scrollLeft) < 0.5) return
      event.preventDefault()
      scroller.scrollLeft = next
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      scroller.removeEventListener('scroll', updateEdges)
      scroller.removeEventListener('wheel', onWheel)
    }
  }, [updateEdges])

  const scrollViews = (direction: 1 | -1) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollBy({ left: direction * scroller.clientWidth * SCROLL_STEP, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  // La vue active (enregistrée comprise) est toujours ramenée dans le champ.
  const revealActiveView = useCallback((behavior: ScrollBehavior): boolean => {
    const scroller = scrollerRef.current
    const pill = scroller?.querySelector<HTMLElement>(`[data-view-id="${CSS.escape(activeView.id)}"]`)
    if (!scroller || !pill) return false
    const scrollerBox = scroller.getBoundingClientRect()
    const pillBox = pill.getBoundingClientRect()
    // La marge garde la pastille hors du fondu ; une pastille plus large que
    // la rangée moins ses deux marges est centrée, entière autant que possible.
    const padding = Math.max(0, Math.min(
      parseFloat(getComputedStyle(scroller).scrollPaddingInlineStart) || 0,
      (scroller.clientWidth - pillBox.width) / 2,
    ))
    const start = pillBox.left - scrollerBox.left + scroller.scrollLeft
    const end = start + pillBox.width
    let target = scroller.scrollLeft
    if (start - padding < scroller.scrollLeft) target = start - padding
    else if (end + padding > scroller.scrollLeft + scroller.clientWidth) target = end + padding - scroller.clientWidth
    if (Math.abs(target - scroller.scrollLeft) > 0.5) {
      scroller.scrollTo({ left: Math.max(0, target), behavior })
    }
    return true
  }, [activeView.id])

  useLayoutEffect(() => {
    if (!revealActiveView(prefersReducedMotion() ? 'auto' : 'smooth')) return
    if (pendingFocusRef.current === activeView.id) {
      pendingFocusRef.current = null
      scrollerRef.current?.querySelector<HTMLElement>(`button[data-view-id="${CSS.escape(activeView.id)}"]`)?.focus({ preventScroll: true })
    }
  }, [activeView.id, savedViews, revealActiveView])

  // Une rangée qui rétrécit (actions de modification qui apparaissent, fenêtre
  // plus étroite) garde elle aussi la vue active dans le champ.
  const revealRef = useRef(revealActiveView)
  useEffect(() => {
    revealRef.current = revealActiveView
  }, [revealActiveView])
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    let width = scroller.clientWidth
    const observer = new ResizeObserver(() => {
      if (Math.abs(scroller.clientWidth - width) < 0.5) return
      width = scroller.clientWidth
      revealRef.current('auto')
    })
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  // ——— Actions sur les vues ——————————————————————————————————————————————

  const applySavedView = (view: SavedView) => {
    setOpen(null)
    // La vue enregistrée embarque son combo filtres + tri : rien ne s'y ajoute.
    onExtraFiltersChange({ ...EMPTY_LIBRARY_FILTERS })
    onSortOverrideChange(null)
    onMediumFilterChange(view.criteria.mediumFilter)
    onViewChange({ id: view.id, name: view.name, filters: view.criteria.filters, sort: view.criteria.sort, builtin: false })
  }

  /** Revient exactement à la définition de la vue active : filtres, tri, forme, catégorie ou plateforme. */
  const resetView = () => {
    setOpen(null)
    onExtraFiltersChange({ ...EMPTY_LIBRARY_FILTERS })
    onSortOverrideChange(null)
    onMediumFilterChange(baselineMediumFilter)
    filterButtonRef.current?.focus()
  }

  const saveNewView = async () => {
    setBusy(true)
    try {
      const created = await repository.create(profileId, medium, nameInput, currentCriteria)
      setSavedViews((existing) => [...existing, created].sort(byName))
      setOpen(null)
      setError(null)
      pendingFocusRef.current = created.id
      applySavedView(created)
      setAnnouncement(`Vue « ${created.name} » enregistrée.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'La vue n’a pas pu être enregistrée.')
    } finally {
      setBusy(false)
    }
  }

  const updateActiveView = async () => {
    if (!activeSavedView || !repository.update) return
    setBusy(true)
    try {
      const criteria = await repository.update(profileId, medium, activeSavedView.id, currentCriteria)
      const updated = { ...activeSavedView, criteria }
      setSavedViews((existing) => existing.map((entry) => (entry.id === updated.id ? updated : entry)))
      setOpen(null)
      setError(null)
      applySavedView(updated)
      filterButtonRef.current?.focus()
      setAnnouncement(`Vue « ${updated.name} » mise à jour.`)
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'La vue n’a pas pu être mise à jour.'
      setError(message)
      setAnnouncement(message)
    } finally {
      setBusy(false)
    }
  }

  const renameActiveView = async () => {
    if (!activeSavedView) return
    setBusy(true)
    try {
      await repository.rename(profileId, activeSavedView.id, nameInput)
      const trimmed = nameInput.trim().replace(/\s+/g, ' ')
      setSavedViews((existing) => existing
        .map((entry) => (entry.id === activeSavedView.id ? { ...entry, name: trimmed } : entry))
        .sort(byName))
      pendingFocusRef.current = activeSavedView.id
      onViewChange({ ...activeView, name: trimmed })
      setOpen(null)
      setMenuMode('menu')
      setError(null)
      setAnnouncement(`Vue renommée « ${trimmed} ».`)
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'La vue n’a pas pu être renommée.')
    } finally {
      setBusy(false)
    }
  }

  const deleteActiveView = async () => {
    if (!activeSavedView) return
    setBusy(true)
    try {
      await repository.remove(profileId, activeSavedView.id)
      setSavedViews((existing) => existing.filter((entry) => entry.id !== activeSavedView.id))
      setOpen(null)
      setMenuMode('menu')
      setError(null)
      const opening = defaultBuiltinViewForMedium(builtinViews, medium)
      pendingFocusRef.current = opening.id
      onViewChange(defaultBuiltinViewForMedium(builtinViews, medium))
      setAnnouncement(`Vue « ${activeSavedView.name} » supprimée.`)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'La vue n’a pas pu être supprimée.')
    } finally {
      setBusy(false)
    }
  }

  /** Tri en un clic : une autre colonne s'applique aussitôt, la colonne active s'inverse. */
  const chooseSortColumn = (column: LibrarySortColumn) => {
    const next: LibrarySort = effectiveSort.column === column
      ? { column, direction: effectiveSort.direction === 'asc' ? 'desc' : 'asc' }
      : { column, direction: defaultSortDirection(column) }
    onSortOverrideChange(sortsEqual(next, activeView.sort) ? null : next)
  }

  // ——— Clavier ———————————————————————————————————————————————————————————

  /** Rangée des vues : un seul arrêt de tabulation, les flèches parcourent les pastilles. */
  const onToolbarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
    const position = items.indexOf(document.activeElement as HTMLButtonElement)
    if (position < 0) return
    event.preventDefault()
    const target = event.key === 'Home'
      ? items[0]
      : event.key === 'End'
        ? items.at(-1)
        : items[(position + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]
    target?.focus()
  }

  /**
   * Menus : flèches haut et bas (en boucle), Début, Fin. Tab referme le menu
   * depuis son bouton : la tabulation continue comme si le focus y était resté.
   */
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      closePopover(true)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
    if (items.length === 0) return
    event.preventDefault()
    const position = items.indexOf(document.activeElement as HTMLElement)
    const target = event.key === 'Home'
      ? items[0]
      : event.key === 'End'
        ? items[items.length - 1]
        : items[(position + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]
    target.focus()
  }

  // ——— Rendu ————————————————————————————————————————————————————————————

  const toolbarKeys = [
    ...builtinViews.map((view) => view.id),
    ...savedViews.flatMap((view) => (view.id === activeSavedView?.id ? [view.id, `menu:${view.id}`] : [view.id])),
  ]
  const tabbableKey = rovingKey !== null && toolbarKeys.includes(rovingKey)
    ? rovingKey
    : toolbarKeys.includes(activeView.id) ? activeView.id : toolbarKeys[0]

  const renderViewButton = (view: LibraryViewDefinition, onActivate?: () => void) => {
    const isActive = activeView.id === view.id
    const pill = (
      <button
        className={`seg-pill-btn view-pill ${isActive ? 'on' : ''}`}
        type="button"
        aria-pressed={activeView.id === view.id}
        key={view.id}
        data-view-id={view.id}
        tabIndex={tabbableKey === view.id ? 0 : -1}
        onFocus={() => setRovingKey(view.id)}
        onClick={onActivate ?? (() => onViewChange(view))}
      >
        {view.name}
        {isActive && dirty && (
          <>
            <span className="view-pill-dot" aria-hidden="true" />
            <span className="visually-hidden"> (modifiée)</span>
          </>
        )}
      </button>
    )
    if (!isActive || view.builtin) return pill
    const menuKey = `menu:${view.id}`
    return (
      <span className="view-pill-group on" key={view.id} data-view-id={view.id}>
        {pill}
        <button
          className="view-pill-menu"
          type="button"
          tabIndex={tabbableKey === menuKey ? 0 : -1}
          onFocus={() => setRovingKey(menuKey)}
          aria-haspopup="menu"
          aria-expanded={open === 'view-menu'}
          aria-controls={open === 'view-menu' ? ids.viewMenu : undefined}
          aria-label={`Options de la vue « ${view.name} »`}
          onClick={(event) => openPopover('view-menu', event.currentTarget)}
        >
          {ICONS.more}
        </button>
      </span>
    )
  }

  // Panneau Filtres : les champs courts vont par deux ; un champ resté seul
  // occupe la ligne, comme les champs de texte libre.
  const shortFields: Array<{ key: string; node: (wide: boolean) => ReactNode }> = []
  if (filterConfig.mediumFilter !== null) {
    const mediumFilter = filterConfig.mediumFilter
    shortFields.push({
      key: 'medium',
      node: (wide) => (
        <div className={`field ${wide ? 'is-wide' : ''}`} key="medium">
          <label id={`${medium}-f-medium-label`} htmlFor={`${medium}-f-medium`}>{mediumFilter.label}</label>
          <Select id={`${medium}-f-medium`} labelledBy={`${medium}-f-medium-label`} value={mediumFilterValue} options={mediumFilter.options} onChange={onMediumFilterChange} />
        </div>
      ),
    })
  }
  shortFields.push({
    key: 'status',
    node: (wide) => (
      <div className={`field ${wide ? 'is-wide' : ''}`} key="status">
        <label id={`${medium}-f-status-label`} htmlFor={`${medium}-f-status`}>Statut</label>
        <Select
          id={`${medium}-f-status`}
          labelledBy={`${medium}-f-status-label`}
          value={extraFilters.status}
          options={[{ value: 'all', label: 'Tous' }, ...filterConfig.statusOptions]}
          onChange={(status) => onExtraFiltersChange({ ...extraFilters, status })}
        />
      </div>
    ),
  })
  if (filterConfig.showRating) {
    shortFields.push({
      key: 'rating',
      node: (wide) => (
        <div className={`field ${wide ? 'is-wide' : ''}`} key="rating">
          <label id={`${medium}-f-rating-label`} htmlFor={`${medium}-f-rating`}>Note minimale</label>
          <Select
            id={`${medium}-f-rating`}
            labelledBy={`${medium}-f-rating-label`}
            value={extraFilters.minRating === null ? '' : String(extraFilters.minRating)}
            options={[{ value: '', label: 'Toutes' }, ...[1, 2, 3, 4, 5].map((note) => ({ value: String(note), label: note === 5 ? '5' : `${note} et plus` }))]}
            onChange={(rating) => onExtraFiltersChange({ ...extraFilters, minRating: rating === '' ? null : Number(rating) })}
          />
        </div>
      ),
    })
  }
  if (filterConfig.showYear) {
    shortFields.push({
      key: 'year',
      node: (wide) => (
        <div className={`field ${wide ? 'is-wide' : ''}`} key="year">
          <label htmlFor={`${medium}-f-year`}>Année</label>
          <input
            id={`${medium}-f-year`}
            type="number"
            inputMode="numeric"
            placeholder="Toutes"
            value={extraFilters.year === null ? '' : extraFilters.year}
            onChange={(event) => {
              const raw = event.target.value
              const parsed = Number.parseInt(raw, 10)
              onExtraFiltersChange({ ...extraFilters, year: raw === '' || Number.isNaN(parsed) ? null : parsed })
            }}
          />
        </div>
      ),
    })
  }
  if (filterConfig.personalDateLabel !== null) {
    const personalDateLabel = filterConfig.personalDateLabel
    shortFields.push({
      key: 'date',
      node: (wide) => (
        <div className={`field ${wide ? 'is-wide' : ''}`} key="date">
          <label htmlFor={`${medium}-f-date`}>{personalDateLabel} à partir du</label>
          <input
            id={`${medium}-f-date`}
            type="date"
            value={extraFilters.personalDateFrom ?? ''}
            onChange={(event) => onExtraFiltersChange({ ...extraFilters, personalDateFrom: event.target.value === '' ? null : event.target.value })}
          />
        </div>
      ),
    })
  }

  const textField = (key: 'specificText' | 'location' | 'exhibition', id: string, label: string, placeholder: string, wide: boolean) => (
    <div className={`field ${wide ? 'is-wide' : ''}`} key={key}>
      <label htmlFor={`${medium}-${id}`}>{label}</label>
      <input
        id={`${medium}-${id}`}
        type="search"
        placeholder={placeholder}
        value={extraFilters[key]}
        onChange={(event) => onExtraFiltersChange({ ...extraFilters, [key]: event.target.value })}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  )

  const sortHint = 'Un second clic sur la colonne active inverse le sens.'

  return (
    <div className="view-bar" ref={rootRef}>
      <div className="view-bar-views">
        {/* Seules les pastilles défilent : fondu et flèches restent dans ce
            cadre, « Nouvelle vue » le suit sans jamais être rognée. */}
        <div className="view-bar-viewport" data-overflow-start={edges.start || undefined} data-overflow-end={edges.end || undefined}>
          <div className="view-bar-scroller" ref={scrollerRef}>
            <div className="seg-group-form library-views" role="toolbar" aria-label="Vues" ref={trackRef} onKeyDown={onToolbarKeyDown}>
              {builtinViews.map((view) => renderViewButton(view))}
              {savedViews.length > 0 && <span className="view-bar-separator" aria-hidden="true" />}
              {/* Une vue enregistrée s'applique avec sa forme, catégorie ou
                  plateforme et son tri, sans filtre à la volée resté par-dessus. */}
              {savedViews.map((view) => renderViewButton({ id: view.id, name: view.name, filters: view.criteria.filters, sort: view.criteria.sort, builtin: false }, () => applySavedView(view)))}
            </div>
          </div>
          {edges.start && (
            <span className="view-bar-edge view-bar-edge-start">
              <button className="view-bar-scroll" type="button" tabIndex={-1} aria-label="Faire défiler les vues vers la gauche" onClick={() => scrollViews(-1)}>
                {ICONS.previous}
              </button>
            </span>
          )}
          {edges.end && (
            <span className="view-bar-edge view-bar-edge-end">
              <button className="view-bar-scroll" type="button" tabIndex={-1} aria-label="Faire défiler les vues vers la droite" onClick={() => scrollViews(1)}>
                {ICONS.next}
              </button>
            </span>
          )}
        </div>
        {/* Hors de la zone qui défile : toujours entière. Quand la ligne est
            étroite, seul le « + » reste visible, nommé par son infobulle. */}
        <button
          className="text-button view-bar-new"
          type="button"
          data-source="row"
          aria-label="Nouvelle vue"
          data-tooltip="Nouvelle vue"
          aria-haspopup="dialog"
          aria-expanded={open === 'create' && createSource === 'row'}
          aria-controls={open === 'create' && createSource === 'row' ? ids.create : undefined}
          onClick={(event) => openPopover('create', event.currentTarget)}
        >
          {ICONS.plus}
          <span className="view-bar-new-label">Nouvelle vue</span>
        </button>
      </div>

      <div className="view-bar-actions">
        {dirty && (
          <div className="view-bar-pending" role="group" aria-label={`Vue « ${activeView.name} » modifiée`}>
            <button className="text-button view-bar-text-action" type="button" aria-label={`Réinitialiser la vue « ${activeView.name} »`} onClick={resetView}>
              Réinitialiser
            </button>
            {canUpdate && activeSavedView ? (
              <button className="text-button view-bar-text-action is-strong" type="button" disabled={busy} aria-label={`Mettre à jour la vue « ${activeSavedView.name} »`} onClick={() => void updateActiveView()}>
                Mettre à jour
              </button>
            ) : (
              <button
                className="text-button view-bar-text-action is-strong"
                type="button"
                data-source="pending"
                aria-label="Enregistrer comme vue"
                aria-haspopup="dialog"
                aria-expanded={open === 'create' && createSource === 'pending'}
                aria-controls={open === 'create' && createSource === 'pending' ? ids.create : undefined}
                onClick={(event) => openPopover('create', event.currentTarget)}
              >
                Enregistrer
              </button>
            )}
          </div>
        )}

        <div className="view-bar-popover-anchor">
          <button
            ref={filterButtonRef}
            className={`secondary-button view-bar-action ${open === 'filters' ? 'is-open' : ''}`}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open === 'filters'}
            aria-controls={open === 'filters' ? ids.filters : undefined}
            aria-label={panelFilterCount > 0 ? `Filtrer, ${activeCriteriaLabel(panelFilterCount)}` : 'Filtrer'}
            onClick={(event) => openPopover('filters', event.currentTarget)}
          >
            {ICONS.filter}
            <span>Filtrer</span>
            {panelFilterCount > 0 && <span className="view-bar-badge" aria-hidden="true">{panelFilterCount}</span>}
          </button>
          {open === 'filters' && (
            <div className="view-bar-popover view-bar-filters" id={ids.filters} role="dialog" aria-label="Filtres">
              <div className="filter-panel-grid">
                {shortFields.map((field, index) => field.node(index === shortFields.length - 1 && shortFields.length % 2 === 1))}
                {filterConfig.specificTextField !== null && textField('specificText', 'f-text', filterConfig.specificTextField.label, filterConfig.specificTextField.placeholder, true)}
                {filterConfig.showLocation && textField('location', 'f-location', 'Lieu', 'Musée, ville…', !filterConfig.showExhibition)}
                {filterConfig.showExhibition && textField('exhibition', 'f-exhibition', 'Exposition', 'Nom de l’exposition', !filterConfig.showLocation)}
                <label className="check-field filter-panel-favorite is-wide">
                  <input
                    type="checkbox"
                    checked={extraFilters.favoritesOnly}
                    onChange={(event) => onExtraFiltersChange({ ...extraFilters, favoritesOnly: event.target.checked })}
                  />
                  Coups de cœur uniquement
                </label>
              </div>

              <div className="filter-panel-actions">
                <button
                  className="text-button view-bar-compact"
                  type="button"
                  disabled={panelFilterCount === 0}
                  onClick={() => {
                    onExtraFiltersChange({ ...EMPTY_LIBRARY_FILTERS })
                    onMediumFilterChange('all')
                  }}
                >
                  Réinitialiser
                </button>
                <button className="secondary-button view-bar-compact" type="button" onClick={() => closePopover(true)}>
                  Fermer
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="view-bar-popover-anchor">
          <button
            className={`secondary-button view-bar-action view-bar-sort ${open === 'sort' ? 'is-open' : ''}`}
            type="button"
            aria-haspopup="menu"
            aria-expanded={open === 'sort'}
            aria-controls={open === 'sort' ? ids.sort : undefined}
            aria-label={`Trier, actuellement : ${sortDescription(effectiveSort)}`}
            onClick={(event) => openPopover('sort', event.currentTarget)}
          >
            {ICONS.sort}
            <span>{columnLabel(effectiveSort.column)}</span>
            <span className="view-bar-sort-direction">{directionIcon(effectiveSort.direction)}</span>
          </button>
          {open === 'sort' && (
            <div className="view-bar-popover view-bar-sort-popover">
              <div className="view-bar-menu" id={ids.sort} role="menu" aria-label="Tri" aria-describedby={ids.sortHint} onKeyDown={onMenuKeyDown}>
                {sortColumns.map((column) => {
                  const checked = effectiveSort.column === column
                  return (
                    <button
                      key={column}
                      className="view-bar-menu-item"
                      type="button"
                      role="menuitemradio"
                      aria-checked={checked}
                      onClick={() => chooseSortColumn(column)}
                    >
                      <span className="view-bar-menu-check">{checked && ICONS.check}</span>
                      <span className="view-bar-menu-label">{columnLabel(column)}</span>
                      {checked && (
                        <>
                          <span className="view-bar-menu-trailing">{directionIcon(effectiveSort.direction)}</span>
                          <span className="visually-hidden">, {LIBRARY_SORT_DIRECTION_LABELS[effectiveSort.direction].toLocaleLowerCase('fr')}</span>
                        </>
                      )}
                    </button>
                  )
                })}
                <div className="view-bar-menu-separator" role="separator" />
                <button
                  className="view-bar-menu-item"
                  type="button"
                  role="menuitem"
                  aria-disabled={sortOverride === null}
                  onClick={() => { if (sortOverride !== null) onSortOverrideChange(null) }}
                >
                  <span className="view-bar-menu-check" />
                  <span className="view-bar-menu-label">Tri de la vue</span>
                  <span className="view-bar-menu-detail">{sortDescription(activeView.sort)}</span>
                </button>
              </div>
              <p className="view-bar-menu-hint" id={ids.sortHint}>{sortHint}</p>
            </div>
          )}
        </div>
      </div>

      {open === 'create' && (
        <div className="view-bar-popover view-bar-floating view-bar-create" ref={floatingRef} id={ids.create} role="dialog" aria-labelledby={ids.createLabel}>
          <form
            className="view-bar-form"
            onSubmit={(event) => {
              event.preventDefault()
              void saveNewView()
            }}
          >
            <label className="view-bar-form-label" id={ids.createLabel} htmlFor={`${medium}-save-name`}>Nom de la nouvelle vue</label>
            <input
              id={`${medium}-save-name`}
              className="view-bar-form-input"
              value={nameInput}
              maxLength={80}
              placeholder="Par exemple : Mes classiques"
              onChange={(event) => setNameInput(event.target.value)}
              autoFocus
            />
            <p className="view-bar-form-hint">La vue reprend les filtres en cours et le tri « {sortDescription(effectiveSort)} ».</p>
            {error && <p className="saved-views-error" role="alert">{error}</p>}
            <div className="view-bar-popover-footer">
              <button className="text-button view-bar-compact" type="button" onClick={() => closePopover(true)}>Annuler</button>
              <button className="primary-button view-bar-compact" type="submit" disabled={busy || nameInput.trim() === ''}>Enregistrer la vue</button>
            </div>
          </form>
        </div>
      )}

      {open === 'view-menu' && activeSavedView && (
        <div className="view-bar-popover view-bar-floating view-bar-view-menu" ref={floatingRef}>
          {menuMode === 'menu' && (
            <div className="view-bar-menu" id={ids.viewMenu} role="menu" aria-label={`Vue « ${activeSavedView.name} »`} onKeyDown={onMenuKeyDown}>
              <button
                className="view-bar-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setNameInput(activeSavedView.name)
                  setError(null)
                  setMenuMode('rename')
                }}
              >
                <span className="view-bar-menu-check">{ICONS.rename}</span>
                <span className="view-bar-menu-label">Renommer…</span>
              </button>
              {canUpdate && (
                <button
                  className="view-bar-menu-item"
                  type="button"
                  role="menuitem"
                  aria-disabled={!dirty || busy}
                  onClick={() => { if (dirty && !busy) void updateActiveView() }}
                >
                  <span className="view-bar-menu-check">{ICONS.update}</span>
                  <span className="view-bar-menu-label">Mettre à jour la vue</span>
                  {!dirty && <span className="view-bar-menu-detail">Aucune modification</span>}
                </button>
              )}
              <div className="view-bar-menu-separator" role="separator" />
              <button
                className="view-bar-menu-item is-danger"
                type="button"
                role="menuitem"
                onClick={() => {
                  setError(null)
                  setMenuMode('confirm-delete')
                }}
              >
                <span className="view-bar-menu-check">{ICONS.trash}</span>
                <span className="view-bar-menu-label">Supprimer…</span>
              </button>
            </div>
          )}
          {menuMode === 'menu' && error && <p className="saved-views-error" role="alert">{error}</p>}

          {menuMode === 'rename' && (
            <form
              className="view-bar-form"
              onSubmit={(event) => {
                event.preventDefault()
                void renameActiveView()
              }}
            >
              <label className="view-bar-form-label" htmlFor={`${medium}-rename-input`}>Nouveau nom de la vue</label>
              <input
                id={`${medium}-rename-input`}
                className="view-bar-form-input"
                value={nameInput}
                maxLength={80}
                onChange={(event) => setNameInput(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                autoFocus
              />
              {error && <p className="saved-views-error" role="alert">{error}</p>}
              <div className="view-bar-popover-footer">
                <button className="text-button view-bar-compact" type="button" onClick={() => closePopover(true)}>Annuler</button>
                <button className="primary-button view-bar-compact" type="submit" disabled={busy || nameInput.trim() === ''}>Renommer</button>
              </div>
            </form>
          )}

          {menuMode === 'confirm-delete' && (
            <div className="view-bar-form" role="group" aria-labelledby={ids.deleteQuestion}>
              <p className="view-bar-form-label" id={ids.deleteQuestion}>Supprimer la vue « {activeSavedView.name} » ?</p>
              <p className="view-bar-form-hint">Seule la vue disparaît : aucune œuvre n’est supprimée.</p>
              {error && <p className="saved-views-error" role="alert">{error}</p>}
              <div className="view-bar-popover-footer">
                <button className="text-button view-bar-compact" type="button" onClick={() => closePopover(true)}>Annuler</button>
                <button className="danger-button view-bar-compact" type="button" disabled={busy} onClick={() => void deleteActiveView()} autoFocus>
                  Confirmer la suppression
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && open === null && <p className="saved-views-error view-bar-error" role="alert">{error}</p>}
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </div>
  )
}
