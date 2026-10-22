import { SERIES_CATEGORIES } from '../domain/series.ts'
import { BOOK_CATEGORIES } from '../domain/book.ts'

/**
 * Interrupteur de catégories (0.6.8) : un seul bloc segmenté, plusieurs
 * sélections possibles — au moins une catégorie reste toujours active, donc
 * toutes actives équivaut à « tout afficher ». Il pilote le filtre catégorie
 * existant : la sélection s'applique à toutes les vues et se combine avec
 * elles. Chaque segment porte une coche quand il est actif : l'état se lit
 * d'un coup d'œil, sans ambiguïté avec un groupe de boutons exclusifs.
 */
export function CategorySwitch({
  categories,
  value,
  onChange,
  labels,
}: {
  /** Valeurs de catégorie dans l'ordre d'affichage, 'all' exclu. */
  categories: readonly string[]
  /** Sélection courante : catégories actives ; liste vide = toutes. */
  value: readonly string[]
  onChange: (next: string[]) => void
  /** Étiquettes courtes affichées sur chaque segment. */
  labels: Record<string, string>
}) {
  const effective = value.length === 0 ? categories : value
  const toggle = (category: string) => {
    const active = effective.includes(category)
    if (active && effective.length === 1) return
    const next = active ? effective.filter((entry) => entry !== category) : [...effective, category]
    // Tout sélectionné = filtre neutre : même sémantique que « all ».
    const allSelected = categories.every((entry) => next.includes(entry))
    onChange(allSelected ? [] : next)
  }

  return (
    <div className="category-switch" role="group" aria-label="Catégories affichées">
      {categories.map((category) => {
        const pressed = effective.includes(category)
        return (
          <button
            key={category}
            type="button"
            className={`category-switch-segment ${pressed ? 'active' : ''}`}
            aria-pressed={pressed}
            title={pressed ? `Masquer ${labels[category] ?? category}` : `Afficher ${labels[category] ?? category}`}
            onClick={() => toggle(category)}
          >
            <span className={`category-switch-check ${pressed ? 'on' : ''}`} aria-hidden="true">✓</span>
            {labels[category] ?? category}
          </button>
        )
      })}
    </div>
  )
}

/** Interrupteur prêt à l'emploi pour les Séries : Télé | Animation. */
export function SeriesCategorySwitch({ selected, onSelectionChange }: {
  selected: readonly string[]
  onSelectionChange: (next: string[]) => void
}) {
  return (
    <CategorySwitch
      categories={[...SERIES_CATEGORIES]}
      value={selected}
      onChange={onSelectionChange}
      labels={{ 'série télé': 'Série', animation: 'Animation' }}
    />
  )
}

/** Interrupteur prêt à l'emploi pour les Livres : Livre | Manga. */
export function BookCategorySwitch({ selected, onSelectionChange }: {
  selected: readonly string[]
  onSelectionChange: (next: string[]) => void
}) {
  return (
    <CategorySwitch
      categories={[...BOOK_CATEGORIES]}
      value={selected}
      onChange={onSelectionChange}
      labels={{ livre: 'Livre', manga: 'Manga' }}
    />
  )
}
