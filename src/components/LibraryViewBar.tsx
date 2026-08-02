import { useEffect, useRef, useState } from 'react'
import { savedViewsRepository } from '../data/savedViewsRepository.ts'
import type { SavedView, SavedViewCriteria, SavedViewMedium } from '../domain/savedViews.ts'
import {
  EMPTY_LIBRARY_FILTERS,
  countActiveFilters,
  type LibraryFilters,
} from '../domain/libraryFilters.ts'
import {
  LIBRARY_SORT_COLUMN_LABELS,
  LIBRARY_SORT_DIRECTION_LABELS,
  sortColumnsForMedium,
  type LibrarySort,
  type LibrarySortCapabilities,
  type LibraryViewDefinition,
} from '../domain/libraryViews.ts'

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
  personalDateLabel: string | null
  specificTextField: { label: string; placeholder: string } | null
  showLocation: boolean
  showExhibition: boolean
}

type LibraryViewBarProps = {
  profileId: string
  medium: SavedViewMedium
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

type OpenPopover = 'filters' | 'sort' | 'save' | 'more' | null

/** Nombre de vues enregistrées affichées directement dans la rangée ; le reste va au débordement. */
const INLINE_SAVED_VIEWS = 3

const ICONS = {
  filter: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  ),
  sort: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 5v15" />
    </svg>
  ),
  bookmark: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ),
}

/**
 * Rangée de vues unifiée (jalon 0.4.24) : vues intégrées et vues enregistrées
 * dans une même ligne, débordement discret, puis les icônes Filtre, Tri et
 * « Enregistrer comme vue » ouvrant chacune un popover. Le filtre et le tri
 * choisis à la volée s'appliquent par-dessus la vue active.
 */
export function LibraryViewBar({
  profileId,
  medium,
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
  const [nameInput, setNameInput] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    savedViewsRepository.list(profileId, medium).then(
      (loaded) => { if (!cancelled) setSavedViews(loaded) },
      (loadError: unknown) => {
        console.error('Impossible de charger les vues enregistrées.', loadError)
        if (!cancelled) setSavedViews([])
      },
    )
    return () => {
      cancelled = true
    }
  }, [profileId, medium])

  useEffect(() => {
    if (open === null) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(null)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const activeFilterCount = countActiveFilters(extraFilters) + (mediumFilterValue !== 'all' ? 1 : 0)
  const inlineSaved = savedViews.slice(0, INLINE_SAVED_VIEWS)
  const overflowSaved = savedViews.slice(INLINE_SAVED_VIEWS)
  const sortColumns = sortColumnsForMedium(sortCapabilities)
  const activeSavedView = activeView.builtin ? null : savedViews.find((view) => view.id === activeView.id) ?? null

  const toggle = (popover: Exclude<OpenPopover, null>) => {
    setError(null)
    setRenaming(false)
    setConfirmingDelete(false)
    setNameInput('')
    setOpen((current) => (current === popover ? null : popover))
  }

  const applySavedView = (view: SavedView) => {
    setOpen(null)
    // La vue enregistrée embarque son combo filtres + tri : rien ne s'y ajoute.
    onExtraFiltersChange({ ...EMPTY_LIBRARY_FILTERS })
    onSortOverrideChange(null)
    onMediumFilterChange(view.criteria.mediumFilter)
    onViewChange({ id: view.id, name: view.name, filters: view.criteria.filters, sort: view.criteria.sort, builtin: false })
  }

  const saveNewView = async () => {
    try {
      const created = await savedViewsRepository.create(profileId, medium, nameInput, currentCriteria)
      setSavedViews((existing) => [...existing, created].sort((first, second) => first.name.localeCompare(second.name, 'fr', { sensitivity: 'base' })))
      setOpen(null)
      setError(null)
      applySavedView(created)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'La vue n’a pas pu être enregistrée.')
    }
  }

  const renameActiveView = async () => {
    if (!activeSavedView) return
    try {
      await savedViewsRepository.rename(profileId, activeSavedView.id, nameInput)
      const trimmed = nameInput.trim().replace(/\s+/g, ' ')
      setSavedViews((existing) => existing
        .map((entry) => (entry.id === activeSavedView.id ? { ...entry, name: trimmed } : entry))
        .sort((first, second) => first.name.localeCompare(second.name, 'fr', { sensitivity: 'base' })))
      onViewChange({ ...activeView, name: trimmed })
      setRenaming(false)
      setOpen(null)
      setError(null)
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'La vue n’a pas pu être renommée.')
    }
  }

  const deleteActiveView = async () => {
    if (!activeSavedView) return
    try {
      await savedViewsRepository.remove(profileId, activeSavedView.id)
      setSavedViews((existing) => existing.filter((entry) => entry.id !== activeSavedView.id))
      setConfirmingDelete(false)
      setOpen(null)
      setError(null)
      onViewChange(builtinViews[0])
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'La vue n’a pas pu être supprimée.')
    }
  }

  const renderViewButton = (view: LibraryViewDefinition) => (
    <button
      className={`filter ${activeView.id === view.id ? 'active' : ''}`}
      type="button"
      aria-pressed={activeView.id === view.id}
      key={view.id}
      onClick={() => onViewChange(view)}
    >
      {view.name}
    </button>
  )

  return (
    <div className="view-bar" ref={rootRef}>
      <div className="filters library-views" role="group" aria-label="Choisir la vue">
        {builtinViews.map(renderViewButton)}
        {inlineSaved.map((view) => renderViewButton({ id: view.id, name: view.name, filters: view.criteria.filters, sort: view.criteria.sort, builtin: false }))}
        {overflowSaved.length > 0 && (
          <div className="view-bar-popover-anchor">
            <button
              className={`filter view-bar-more ${open === 'more' ? 'active' : ''}`}
              type="button"
              aria-expanded={open === 'more'}
              aria-label={`${overflowSaved.length} vues enregistrées supplémentaires`}
              onClick={() => toggle('more')}
            >
              +{overflowSaved.length}
            </button>
            {open === 'more' && (
              <div className="view-bar-popover view-bar-overflow" role="dialog" aria-label="Vues enregistrées supplémentaires">
                {overflowSaved.map((view) => (
                  <button
                    className="view-bar-overflow-item"
                    type="button"
                    key={view.id}
                    onClick={() => applySavedView(view)}
                  >
                    {view.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="view-bar-actions">
        <div className="view-bar-popover-anchor">
          <button
            className={`view-bar-icon ${open === 'filters' ? 'active' : ''} ${activeFilterCount > 0 ? 'engaged' : ''}`}
            type="button"
            aria-expanded={open === 'filters'}
            aria-label={activeFilterCount > 0 ? `Filtrer, ${activeFilterCount} critères actifs` : 'Filtrer'}
            onClick={() => toggle('filters')}
          >
            {ICONS.filter}
            {activeFilterCount > 0 && <span className="view-bar-badge">{activeFilterCount}</span>}
          </button>
          {open === 'filters' && (
            <div className="view-bar-popover" role="dialog" aria-label="Filtres">
              <div className="filter-panel-grid">
                {filterConfig.mediumFilter !== null && (
                  <div className="field">
                    <label htmlFor={`${medium}-f-medium`}>{filterConfig.mediumFilter.label}</label>
                    <select
                      id={`${medium}-f-medium`}
                      value={mediumFilterValue}
                      onChange={(event) => onMediumFilterChange(event.target.value)}
                    >
                      {filterConfig.mediumFilter.options.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="field">
                  <label htmlFor={`${medium}-f-status`}>Statut</label>
                  <select
                    id={`${medium}-f-status`}
                    value={extraFilters.status}
                    onChange={(event) => onExtraFiltersChange({ ...extraFilters, status: event.target.value })}
                  >
                    <option value="all">Tous</option>
                    {filterConfig.statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                {filterConfig.showRating && (
                  <div className="field">
                    <label htmlFor={`${medium}-f-rating`}>Note minimale</label>
                    <select
                      id={`${medium}-f-rating`}
                      value={extraFilters.minRating === null ? '' : String(extraFilters.minRating)}
                      onChange={(event) => onExtraFiltersChange({ ...extraFilters, minRating: event.target.value === '' ? null : Number(event.target.value) })}
                    >
                      <option value="">Toutes</option>
                      {[1, 2, 3, 4, 5].map((note) => (
                        <option key={note} value={note}>{note} et plus</option>
                      ))}
                    </select>
                  </div>
                )}

                {filterConfig.showYear && (
                  <div className="field">
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
                )}

                {filterConfig.personalDateLabel !== null && (
                  <div className="field">
                    <label htmlFor={`${medium}-f-date`}>{filterConfig.personalDateLabel} à partir du</label>
                    <input
                      id={`${medium}-f-date`}
                      type="date"
                      value={extraFilters.personalDateFrom ?? ''}
                      onChange={(event) => onExtraFiltersChange({ ...extraFilters, personalDateFrom: event.target.value === '' ? null : event.target.value })}
                    />
                  </div>
                )}

                {filterConfig.specificTextField !== null && (
                  <div className="field">
                    <label htmlFor={`${medium}-f-text`}>{filterConfig.specificTextField.label}</label>
                    <input
                      id={`${medium}-f-text`}
                      type="search"
                      placeholder={filterConfig.specificTextField.placeholder}
                      value={extraFilters.specificText}
                      onChange={(event) => onExtraFiltersChange({ ...extraFilters, specificText: event.target.value })}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                )}

                {filterConfig.showLocation && (
                  <div className="field">
                    <label htmlFor={`${medium}-f-location`}>Lieu</label>
                    <input
                      id={`${medium}-f-location`}
                      type="search"
                      placeholder="Musée, ville…"
                      value={extraFilters.location}
                      onChange={(event) => onExtraFiltersChange({ ...extraFilters, location: event.target.value })}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                )}

                {filterConfig.showExhibition && (
                  <div className="field">
                    <label htmlFor={`${medium}-f-exhibition`}>Exposition</label>
                    <input
                      id={`${medium}-f-exhibition`}
                      type="search"
                      placeholder="Nom de l'exposition"
                      value={extraFilters.exhibition}
                      onChange={(event) => onExtraFiltersChange({ ...extraFilters, exhibition: event.target.value })}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                )}

                <label className="filter-panel-favorite">
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
                  className="state-action"
                  type="button"
                  disabled={activeFilterCount === 0}
                  onClick={() => {
                    onExtraFiltersChange({ ...EMPTY_LIBRARY_FILTERS })
                    onMediumFilterChange('all')
                  }}
                >
                  Réinitialiser
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="view-bar-popover-anchor">
          <button
            className={`view-bar-icon ${open === 'sort' ? 'active' : ''} ${sortOverride !== null ? 'engaged' : ''}`}
            type="button"
            aria-expanded={open === 'sort'}
            aria-label={sortOverride !== null ? `Trier, ${LIBRARY_SORT_COLUMN_LABELS[sortOverride.column]} ${LIBRARY_SORT_DIRECTION_LABELS[sortOverride.direction].toLocaleLowerCase('fr')}` : 'Trier'}
            onClick={() => toggle('sort')}
          >
            {ICONS.sort}
          </button>
          {open === 'sort' && (
            <div className="view-bar-popover" role="dialog" aria-label="Tri">
              <div className="field">
                <label htmlFor={`${medium}-s-column`}>Trier par</label>
                <select
                  id={`${medium}-s-column`}
                  value={sortOverride?.column ?? ''}
                  onChange={(event) => {
                    const column = event.target.value as LibrarySort['column'] | ''
                    if (column === '') {
                      onSortOverrideChange(null)
                    } else {
                      onSortOverrideChange({ column, direction: sortOverride?.direction ?? (column === 'title' || column === 'year' ? 'asc' : 'desc') })
                    }
                  }}
                >
                  <option value="">Tri de la vue « {activeView.name} »</option>
                  {sortColumns.map((column) => (
                    <option key={column} value={column}>{LIBRARY_SORT_COLUMN_LABELS[column]}</option>
                  ))}
                </select>
              </div>

              {sortOverride !== null && (
                <div className="view-bar-direction" role="group" aria-label="Sens du tri">
                  {(['asc', 'desc'] as const).map((direction) => (
                    <button
                      key={direction}
                      className={`filter ${sortOverride.direction === direction ? 'active' : ''}`}
                      type="button"
                      aria-pressed={sortOverride.direction === direction}
                      onClick={() => onSortOverrideChange({ ...sortOverride, direction })}
                    >
                      {LIBRARY_SORT_DIRECTION_LABELS[direction]}
                    </button>
                  ))}
                </div>
              )}

              <div className="filter-panel-actions">
                <button
                  className="state-action"
                  type="button"
                  disabled={sortOverride === null}
                  onClick={() => onSortOverrideChange(null)}
                >
                  Tri de la vue
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="view-bar-popover-anchor">
          <button
            className={`view-bar-icon ${open === 'save' ? 'active' : ''} ${activeSavedView ? 'engaged' : ''}`}
            type="button"
            aria-expanded={open === 'save'}
            aria-label={activeSavedView ? `Gérer la vue « ${activeSavedView.name} »` : 'Enregistrer comme vue'}
            onClick={() => toggle('save')}
          >
            {ICONS.bookmark}
          </button>
          {open === 'save' && (
            <div className="view-bar-popover" role="dialog" aria-label="Enregistrer comme vue">
              {!renaming && (
                <form
                  className="saved-views-editor"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void saveNewView()
                  }}
                >
                  <label className="visually-hidden" htmlFor={`${medium}-save-name`}>Nom de la nouvelle vue</label>
                  <input
                    id={`${medium}-save-name`}
                    value={nameInput}
                    placeholder="Enregistrer comme vue…"
                    onChange={(event) => setNameInput(event.target.value)}
                    autoFocus
                  />
                  <button className="filter-panel-toggle" type="submit">Valider</button>
                </form>
              )}

              {activeSavedView && !renaming && (
                <div className="saved-views-actions">
                  <button
                    className="filter-panel-toggle"
                    type="button"
                    onClick={() => {
                      setRenaming(true)
                      setNameInput(activeSavedView.name)
                    }}
                  >
                    Renommer « {activeSavedView.name} »
                  </button>
                  {confirmingDelete ? (
                    <button className="filter-panel-toggle danger-action" type="button" onClick={() => void deleteActiveView()}>
                      Confirmer la suppression
                    </button>
                  ) : (
                    <button className="filter-panel-toggle" type="button" onClick={() => setConfirmingDelete(true)}>
                      Supprimer
                    </button>
                  )}
                </div>
              )}

              {activeSavedView && renaming && (
                <form
                  className="saved-views-editor"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void renameActiveView()
                  }}
                >
                  <label className="visually-hidden" htmlFor={`${medium}-rename-input`}>Nouveau nom de la vue</label>
                  <input
                    id={`${medium}-rename-input`}
                    value={nameInput}
                    onChange={(event) => setNameInput(event.target.value)}
                    autoFocus
                  />
                  <button className="filter-panel-toggle" type="submit">Valider</button>
                  <button className="filter-panel-toggle" type="button" onClick={() => setRenaming(false)}>Annuler</button>
                </form>
              )}

              {error && <p className="saved-views-error" role="alert">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
