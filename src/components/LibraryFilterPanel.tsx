import { useState } from 'react'
import {
  clearFilterChip,
  countActiveFilters,
  describeActiveFilters,
  EMPTY_LIBRARY_FILTERS,
  type LibraryFilters,
} from '../domain/libraryFilters.ts'

/**
 * Configuration bornée du panneau de filtres d'une bibliothèque (jalon
 * 0.4.20) : chaque médium n'expose que les critères de son modèle.
 */
export type LibraryFilterPanelConfig = {
  statusOptions: Array<{ value: string; label: string }>
  showRating: boolean
  showYear: boolean
  /** Libellé de la date personnelle (ex. « Visionnage ») ; null si absente. */
  personalDateLabel: string | null
  /** Champ texte spécifique (réalisation, auteur, artiste) ; null si absent. */
  specificTextField: { label: string; placeholder: string } | null
  showLocation: boolean
  showExhibition: boolean
}

type LibraryFilterPanelProps = {
  filters: LibraryFilters | undefined
  config: LibraryFilterPanelConfig
  idPrefix: string
  onChange: (filters: LibraryFilters) => void
}

/**
 * Panneau de filtres avancés partagé par les cinq bibliothèques. Les critères
 * se combinent avec la recherche textuelle et la vue active ; les puces
 * récapitulent les critères appliqués et « Réinitialiser » ramène à l'état
 * clairement défini EMPTY_LIBRARY_FILTERS.
 */
export function LibraryFilterPanel({ filters, config, idPrefix, onChange }: LibraryFilterPanelProps) {
  const [open, setOpen] = useState(false)
  const current = { ...EMPTY_LIBRARY_FILTERS, ...filters }
  const activeCount = countActiveFilters(current)

  const statusLabel = (status: string) =>
    config.statusOptions.find((option) => option.value === status)?.label ?? status
  const chips = describeActiveFilters(current, {
    statusLabel,
    personalDateLabel: config.personalDateLabel ?? '',
    specificTextLabel: config.specificTextField?.label ?? '',
  })

  const update = (patch: Partial<LibraryFilters>) => onChange({ ...current, ...patch })

  return (
    <div className="filter-panel">
      <button
        className={`filter-panel-toggle ${activeCount > 0 ? 'active' : ''}`}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Filtres{activeCount > 0 ? ` (${activeCount})` : ''}
      </button>

      {open && (
        <div className="filter-panel-body">
          <div className="filter-panel-grid">
            <div className="field">
              <label htmlFor={`${idPrefix}-status`}>Statut</label>
              <select
                id={`${idPrefix}-status`}
                value={current.status}
                onChange={(event) => update({ status: event.target.value })}
              >
                <option value="all">Tous</option>
                {config.statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {config.showRating && (
              <div className="field">
                <label htmlFor={`${idPrefix}-rating`}>Note minimale</label>
                <select
                  id={`${idPrefix}-rating`}
                  value={current.minRating === null ? '' : String(current.minRating)}
                  onChange={(event) => update({ minRating: event.target.value === '' ? null : Number(event.target.value) })}
                >
                  <option value="">Toutes</option>
                  {[1, 2, 3, 4, 5].map((note) => (
                    <option key={note} value={note}>{note} et plus</option>
                  ))}
                </select>
              </div>
            )}

            {config.showYear && (
              <div className="field">
                <label htmlFor={`${idPrefix}-year`}>Année</label>
                <input
                  id={`${idPrefix}-year`}
                  type="number"
                  inputMode="numeric"
                  placeholder="Toutes"
                  value={current.year === null ? '' : current.year}
                  onChange={(event) => {
                    const raw = event.target.value
                    const parsed = Number.parseInt(raw, 10)
                    update({ year: raw === '' || Number.isNaN(parsed) ? null : parsed })
                  }}
                />
              </div>
            )}

            {config.personalDateLabel !== null && (
              <div className="field">
                <label htmlFor={`${idPrefix}-personal-date`}>{config.personalDateLabel} à partir du</label>
                <input
                  id={`${idPrefix}-personal-date`}
                  type="date"
                  value={current.personalDateFrom ?? ''}
                  onChange={(event) => update({ personalDateFrom: event.target.value === '' ? null : event.target.value })}
                />
              </div>
            )}

            {config.specificTextField !== null && (
              <div className="field">
                <label htmlFor={`${idPrefix}-specific`}>{config.specificTextField.label}</label>
                <input
                  id={`${idPrefix}-specific`}
                  type="search"
                  placeholder={config.specificTextField.placeholder}
                  value={current.specificText}
                  onChange={(event) => update({ specificText: event.target.value })}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            )}

            {config.showLocation && (
              <div className="field">
                <label htmlFor={`${idPrefix}-location`}>Lieu</label>
                <input
                  id={`${idPrefix}-location`}
                  type="search"
                  placeholder="Musée, ville…"
                  value={current.location}
                  onChange={(event) => update({ location: event.target.value })}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            )}

            {config.showExhibition && (
              <div className="field">
                <label htmlFor={`${idPrefix}-exhibition`}>Exposition</label>
                <input
                  id={`${idPrefix}-exhibition`}
                  type="search"
                  placeholder="Nom de l'exposition"
                  value={current.exhibition}
                  onChange={(event) => update({ exhibition: event.target.value })}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            )}

            <label className="filter-panel-favorite">
              <input
                type="checkbox"
                checked={current.favoritesOnly}
                onChange={(event) => update({ favoritesOnly: event.target.checked })}
              />
              Coups de cœur uniquement
            </label>
          </div>

          <div className="filter-panel-actions">
            <button
              className="state-action"
              type="button"
              disabled={activeCount === 0}
              onClick={() => onChange({ ...EMPTY_LIBRARY_FILTERS })}
            >
              Réinitialiser
            </button>
          </div>
        </div>
      )}

      {chips.length > 0 && (
        <ul className="filter-chips" aria-label="Critères actifs">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                className="filter-chip"
                type="button"
                aria-label={`Retirer le critère ${chip.label}`}
                onClick={() => onChange(clearFilterChip(current, chip.key))}
              >
                {chip.label} ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
