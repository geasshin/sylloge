#!/usr/bin/env python3
"""Ré-application atomique du câblage vues 0.6.8 dans src/main.tsx."""
from pathlib import Path

path = Path('/Users/aurelientrouble/Documents/Codex/bibliotheque-culturelle-v0-1/src/main.tsx')
src = path.read_text(encoding='utf-8')
original = src

def rep(old: str, new: str, count_expected: int = 1):
    global src
    found = src.count(old)
    assert found == count_expected, f"attendu {count_expected}, trouvé {found} pour:\n{old[:120]}"
    src = src.replace(old, new)

# R1 — import CategorySwitch
rep(
    "import { LibraryViewBar, type LibraryFilterConfig } from './components/LibraryViewBar.tsx'\n",
    "import { LibraryViewBar, type LibraryFilterConfig } from './components/LibraryViewBar.tsx'\nimport { BookCategorySwitch, SeriesCategorySwitch } from './components/CategorySwitch.tsx'\n",
)

# R2 — imports libraryViews
rep(
    "  RATED_BUILTIN_VIEWS,\n  UNRATED_BUILTIN_VIEWS,\n",
    "  RATED_BUILTIN_VIEWS,\n  UNRATED_BUILTIN_VIEWS,\n  PROGRESS_BUILTIN_VIEWS,\n  DEFAULT_VIEW_ID,\n  builtinViewById,\n  titledBuiltinViews,\n",
)

# R3 — types de contexte catégories en listes
rep(
    "  sortOverride: LibrarySort | null\n  category: SeriesCategory | 'all'\n}",
    "  sortOverride: LibrarySort | null\n  /** Catégories affichées ; liste vide = toutes (équivalent « all »). */\n  category: SeriesCategory[]\n}",
)
rep(
    "  sortOverride: LibrarySort | null\n  category: BookCategory | 'all'\n}",
    "  sortOverride: LibrarySort | null\n  /** Catégories affichées ; liste vide = toutes (équivalent « all »). */\n  category: BookCategory[]\n}",
)

# R4 — constantes et helpers après LibraryContext
rep(
    "type LibraryContext = {\n  query: string\n  view: LibraryViewDefinition\n  extraFilters: LibraryFilters\n  sortOverride: LibrarySort | null\n}\n",
    """type LibraryContext = {
  query: string
  view: LibraryViewDefinition
  extraFilters: LibraryFilters
  sortOverride: LibrarySort | null
}

const ALL_SERIES_CATEGORIES = SERIES_CATEGORIES as readonly SeriesCategory[]
const ALL_BOOK_CATEGORIES = BOOK_CATEGORIES as readonly BookCategory[]

/** Liste de catégories → valeur du filtre dépôt (vide = toutes). */
function categoriesToFilter(categories: readonly string[]): string {
  return categories.length === 0 ? 'all' : categories[0]
}

/** Valeur « all » ou catégorie unique → liste pour l'interrupteur. */
function filterToCategories(value: string): string[] {
  return value === 'all' ? [] : [value]
}

/** Libellé lisible des catégories actives d'une bibliothèque, null si toutes. */
function categoriesLabel(categories: readonly string[], labels: Record<string, string>): string | null {
  if (categories.length === 0) return null
  const names = categories.map((category) => labels[category] ?? category)
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}
""",
)

# R5..R9 — isUnfiltered
rep(
    "const isUnfiltered = context.query.trim() === '' && context.view.id === 'all'",
    "const isUnfiltered = context.query.trim() === '' && context.view.id === DEFAULT_VIEW_ID",
)
rep(
    "const isUnfiltered = context.query.trim() === '' && context.platform === 'all' && context.view.id === 'all'",
    "const isUnfiltered = context.query.trim() === '' && context.platform === 'all' && context.view.id === DEFAULT_VIEW_ID",
)
rep(
    "const isUnfiltered = context.query.trim() === '' && context.form === 'all' && context.view.id === 'all'",
    "const isUnfiltered = context.query.trim() === '' && context.form === 'all' && context.view.id === DEFAULT_VIEW_ID",
)
rep(
    "}: SeriesLibraryProps) {\n  const isUnfiltered = context.query.trim() === '' && context.category === 'all' && context.view.id === 'all'",
    "}: SeriesLibraryProps) {\n  const isUnfiltered = context.query.trim() === '' && context.category.length === ALL_SERIES_CATEGORIES.length && context.view.id === DEFAULT_VIEW_ID",
)
rep(
    "}: BooksLibraryProps) {\n  const isUnfiltered = context.query.trim() === '' && context.category === 'all' && context.view.id === 'all'",
    "}: BooksLibraryProps) {\n  const isUnfiltered = context.query.trim() === '' && context.category.length === ALL_BOOK_CATEGORIES.length && context.view.id === DEFAULT_VIEW_ID",
)

# R10 — bloc outils Séries
rep(
    """            <LibraryViewBar
              profileId={profileId}
              medium="series"
              builtinViews={RATED_BUILTIN_VIEWS}
              activeView={context.view}
              onViewChange={(view) => onContextChange({ ...context, view })}
              filterConfig={SERIES_FILTER_PANEL_CONFIG}
              mediumFilterValue={context.category}
              onMediumFilterChange={(category) => onContextChange({ ...context, category: category as SeriesCategory | 'all' })}
              extraFilters={context.extraFilters}
              onExtraFiltersChange={(extraFilters) => onContextChange({ ...context, extraFilters })}
              sortCapabilities={{ rating: true, year: false }}
              sortOverride={context.sortOverride}
              onSortOverrideChange={(sortOverride) => onContextChange({ ...context, sortOverride })}
              currentCriteria={{ sort: resolved.sort, mediumFilter: context.category, filters: resolved.filters }}
            />""",
    """            <SeriesCategorySwitch
              selected={context.category.length > 0 ? context.category : [...ALL_SERIES_CATEGORIES]}
              onSelectionChange={(selected) => onContextChange({ ...context, category: selected as SeriesCategory[] })}
            />
            <LibraryViewBar
              profileId={profileId}
              medium="series"
              builtinViews={titledBuiltinViews(PROGRESS_BUILTIN_VIEWS, 'series')}
              activeView={context.view}
              onViewChange={(view) => onContextChange({ ...context, view })}
              filterConfig={{ ...SERIES_FILTER_PANEL_CONFIG, mediumFilter: null }}
              mediumFilterValue="all"
              onMediumFilterChange={() => {}}
              extraFilters={context.extraFilters}
              onExtraFiltersChange={(extraFilters) => onContextChange({ ...context, extraFilters })}
              sortCapabilities={{ rating: true, year: false }}
              sortOverride={context.sortOverride}
              onSortOverrideChange={(sortOverride) => onContextChange({ ...context, sortOverride })}
              currentCriteria={{ sort: resolved.sort, mediumFilter: categoriesToFilter(context.category), filters: resolved.filters }}
            />""",
)

# R11 — bloc outils Livres
rep(
    """            <LibraryViewBar
              profileId={profileId}
              medium="books"
              builtinViews={RATED_BUILTIN_VIEWS}
              activeView={context.view}
              onViewChange={(view) => onContextChange({ ...context, view })}
              filterConfig={BOOK_FILTER_PANEL_CONFIG}
              mediumFilterValue={context.category}
              onMediumFilterChange={(category) => onContextChange({ ...context, category: category as BookCategory | 'all' })}
              extraFilters={context.extraFilters}
              onExtraFiltersChange={(extraFilters) => onContextChange({ ...context, extraFilters })}
              sortCapabilities={{ rating: true, year: true }}
              sortOverride={context.sortOverride}
              onSortOverrideChange={(sortOverride) => onContextChange({ ...context, sortOverride })}
              currentCriteria={{ sort: resolved.sort, mediumFilter: context.category, filters: resolved.filters }}
            />""",
    """            <BookCategorySwitch
              selected={context.category.length > 0 ? context.category : [...ALL_BOOK_CATEGORIES]}
              onSelectionChange={(selected) => onContextChange({ ...context, category: selected as BookCategory[] })}
            />
            <LibraryViewBar
              profileId={profileId}
              medium="books"
              builtinViews={titledBuiltinViews(PROGRESS_BUILTIN_VIEWS, 'books')}
              activeView={context.view}
              onViewChange={(view) => onContextChange({ ...context, view })}
              filterConfig={{ ...BOOK_FILTER_PANEL_CONFIG, mediumFilter: null }}
              mediumFilterValue="all"
              onMediumFilterChange={() => {}}
              extraFilters={context.extraFilters}
              onExtraFiltersChange={(extraFilters) => onContextChange({ ...context, extraFilters })}
              sortCapabilities={{ rating: true, year: true }}
              sortOverride={context.sortOverride}
              onSortOverrideChange={(sortOverride) => onContextChange({ ...context, sortOverride })}
              currentCriteria={{ sort: resolved.sort, mediumFilter: categoriesToFilter(context.category), filters: resolved.filters }}
            />""",
)

# R12..R14 — vues titrées Films / Jeux / Art
rep('              medium="films"\n              builtinViews={RATED_BUILTIN_VIEWS}',
    '              medium="films"\n              builtinViews={titledBuiltinViews(RATED_BUILTIN_VIEWS, \'films\')}')
rep('              medium="games"\n              builtinViews={RATED_BUILTIN_VIEWS}',
    '              medium="games"\n              builtinViews={titledBuiltinViews(RATED_BUILTIN_VIEWS, \'games\')}')
rep('              medium="artworks"\n              builtinViews={UNRATED_BUILTIN_VIEWS}',
    '              medium="artworks"\n              builtinViews={titledBuiltinViews(UNRATED_BUILTIN_VIEWS, \'artworks\')}')

# R15 — boutons « Afficher tout » : vue par défaut + catégories
rep(
    "onClick={() => onContextChange({ query: '', view: RATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}",
    "onClick={() => onContextChange({ query: '', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}",
)
rep(
    "onClick={() => onContextChange({ query: '', platform: 'all', view: RATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}",
    "onClick={() => onContextChange({ query: '', platform: 'all', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}",
)
rep(
    "onClick={() => onContextChange({ query: '', form: 'all', view: UNRATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}",
    "onClick={() => onContextChange({ query: '', form: 'all', view: builtinViewById(UNRATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}",
)
rep(
    "onClick={() => onContextChange({ query: '', category: 'all', view: RATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}\n              >\n                Afficher toutes les séries",
    "onClick={() => onContextChange({ query: '', category: [...ALL_SERIES_CATEGORIES], view: builtinViewById(PROGRESS_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}\n              >\n                Afficher toutes les séries",
)
rep(
    "onClick={() => onContextChange({ query: '', category: 'all', view: RATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}\n              >\n                Afficher tous les livres",
    "onClick={() => onContextChange({ query: '', category: [...ALL_BOOK_CATEGORIES], view: builtinViewById(PROGRESS_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })}\n              >\n                Afficher tous les livres",
)

# R16 — états initiaux des cinq contextes
rep(
    "useState<LibraryContext>({ query: '', view: RATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })",
    "useState<LibraryContext>({ query: '', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })",
)
rep(
    "useState<SeriesLibraryContext>({ query: '', category: 'all', view: RATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })",
    "useState<SeriesLibraryContext>({ query: '', category: [...ALL_SERIES_CATEGORIES], view: builtinViewById(PROGRESS_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })",
)
rep(
    "useState<BookLibraryContext>({ query: '', category: 'all', view: RATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })",
    "useState<BookLibraryContext>({ query: '', category: [...ALL_BOOK_CATEGORIES], view: builtinViewById(PROGRESS_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })",
)
rep(
    "useState<GameLibraryContext>({ query: '', platform: 'all', view: RATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })",
    "useState<GameLibraryContext>({ query: '', platform: 'all', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })",
)
rep(
    "useState<ArtworkLibraryContext>({ query: '', form: 'all', view: UNRATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })",
    "useState<ArtworkLibraryContext>({ query: '', form: 'all', view: builtinViewById(UNRATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })",
)

# R17 — resets changement/import de profil (2 blocs identiques)
old_reset = """          setLibraryContext({ query: '', view: RATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setSeriesContext({ query: '', category: 'all', view: RATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setBookContext({ query: '', category: 'all', view: RATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setGameContext({ query: '', platform: 'all', view: RATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setArtworkContext({ query: '', form: 'all', view: UNRATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })"""
new_reset = """          setLibraryContext({ query: '', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setSeriesContext({ query: '', category: [...ALL_SERIES_CATEGORIES], view: builtinViewById(PROGRESS_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setBookContext({ query: '', category: [...ALL_BOOK_CATEGORIES], view: builtinViewById(PROGRESS_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setGameContext({ query: '', platform: 'all', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })
          setArtworkContext({ query: '', form: 'all', view: builtinViewById(UNRATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })"""
rep(old_reset, new_reset, 1)

# Second site de réinitialisation (import) : ligne Films isolée.
rep(
    "setLibraryContext({ query: '', view: RATED_BUILTIN_VIEWS[0], extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })",
    "setLibraryContext({ query: '', view: builtinViewById(RATED_BUILTIN_VIEWS, DEFAULT_VIEW_ID), extraFilters: EMPTY_LIBRARY_FILTERS, sortOverride: null })",
    1,
)

# R18 — effets de recherche : conversion liste → filtre dépôt
rep(
    "category: seriesContext.category, filters: resolved.filters",
    "category: categoriesToFilter(seriesContext.category) as SeriesCategory | 'all', filters: resolved.filters",
)
rep(
    "category: bookContext.category, filters: resolved.filters",
    "category: categoriesToFilter(bookContext.category) as BookCategory | 'all', filters: resolved.filters",
)

path.write_text(src, encoding='utf-8')
print(f"OK — {len(original)} -> {len(src)} caractères, {src.count('CategorySwitch')} références CategorySwitch")
