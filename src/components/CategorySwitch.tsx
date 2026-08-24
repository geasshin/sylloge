import { SERIES_CATEGORIES } from '../domain/series.ts'
import { BOOK_CATEGORIES } from '../domain/book.ts'

/**
 * Interrupteur de catégories (0.6.8) : un seul bloc segmenté, plusieurs
 * sélections possibles — au moins une catégorie reste toujours active, donc
 * deux actives équivalent à « tout afficher ». Il pilote le filtre catégorie
 * existant : la sélection s'applique à toutes les vues et se combine avec
 * elles, exactement comme le filtre du panneau qu'il remplace pour Séries
 * et Livres.
 */
export function CategorySwitch({
  categories,
  value,
  onChange,
  labels,
}: {
  /** Valeurs de catégorie dans l'ordre d'affichage, 'all' exclu. */
  categories: readonly string[]
  /** Sélection courante : liste de catégories actives (jamais vide). */
  value: readonly string[]
  onChange: (next: string[]) => void
  /** Étiquettes courtes affichées sur chaque segment. */
  labels: Record<string, string>
}) {
  const toggle = (category: string) => {
    const active = value.includes(category)
    if (active && value.length === 1) return
    const next = active ? value.filter((entry) => entry !== category) : [...value, category]
    // Tout sélectionné = filtre neutre : même sémantique que « all ».
    const allSelected = categories.every((category_) => next.includes(category_))
    onChange(allSelected ? [] : next)
  }

  return (
    <div className="category-switch" role="group" aria-label="Choisir les catégories affichées">
      {categories.map((category) => {
        const pressed = value.includes(category)
        return (
          <button
            key={category}
            type="button"
            className={`category-switch-segment ${pressed ? 'active' : ''}`}
            aria-pressed={pressed}
            title={
              pressed
                ? `Masquer ${labels[category] ?? category}`
                : `Afficher ${labels[category] ?? category}`
            }
            onClick={() => toggle(category)}
          >
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

/** Interrupteur prêt à l'emploi pour les Livres : Livre | Manga | Comics. */
export function BookCategorySwitch({ selected, onSelectionChange }: {
  selected: readonly string[]
  onSelectionChange: (next: string[]) => void
}) {
  return (
    <CategorySwitch
      categories={[...BOOK_CATEGORIES]}
      value={selected}
      onChange={onSelectionChange}
      labels={{ livre: 'Livre', manga: 'Manga', comics: 'Comics' }}
    />
  )
}
