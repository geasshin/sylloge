#!/usr/bin/env python3
"""Ré-application des adaptations 0.6.8 dans src/domain/savedViews.ts."""
from pathlib import Path

path = Path('/Users/aurelientrouble/Documents/Codex/bibliotheque-culturelle-v0-1/src/domain/savedViews.ts')
src = path.read_text(encoding='utf-8')

def rep(old: str, new: str, count_expected: int = 1):
    global src
    found = src.count(old)
    assert found == count_expected, f"attendu {count_expected}, trouvé {found} pour:\n{old[:120]}"
    src = src.replace(old, new)

rep(
    "import { normalizeLibraryFilters, type LibraryFilters } from './libraryFilters.ts'",
    "import { LIBRARY_STATUS_GROUPS, normalizeLibraryFilters, type LibraryFilters, type LibraryStatusGroup } from './libraryFilters.ts'",
)

rep(
    """function toOptionalDate(value: unknown): string | null {
  return typeof value === 'string' && DATE_PATTERN.test(value) ? value : null
}""",
    """function toOptionalDate(value: unknown): string | null {
  return typeof value === 'string' && DATE_PATTERN.test(value) ? value : null
}

/** Un groupe de statut inconnu retombe sur « aucun groupe ». */
function sanitizeStatusGroup(value: unknown): LibraryStatusGroup | null {
  return typeof value === 'string' && LIBRARY_STATUS_GROUPS.includes(value as LibraryStatusGroup)
    ? (value as LibraryStatusGroup)
    : null
}""",
)

rep(
    "  const filters: LibraryFilters = normalizeLibraryFilters({\n    status,\n    favoritesOnly:",
    "  const filters: LibraryFilters = normalizeLibraryFilters({\n    status,\n    statusGroup: sanitizeStatusGroup(rawFilters.statusGroup),\n    favoritesOnly:",
)

rep(
    """  const preset = builtin ?? fallback
  const rawFilters = (raw.filters ?? {}) as Record<string, unknown>
  return {
    sort: preset.sort,
    mediumFilter: raw.mediumFilter,
    filters: {
      ...preset.filters,
      ...rawFilters,
      // En v1, la vue Favoris portait la restriction : elle survit à la conversion.
      favoritesOnly: preset.filters.favoritesOnly || rawFilters.favoritesOnly === true,
    },
  }
}""",
    """  const preset = builtin ?? fallback
  // Une vue v1 « all » (inventaire complet) devient un préset neutre : elle
  // ne doit surtout pas hériter du filtre de la nouvelle vue par défaut.
  const neutral = builtin === undefined && raw.view === 'all'
  const rawFilters = (raw.filters ?? {}) as Record<string, unknown>
  return {
    sort: neutral ? { column: 'title', direction: 'asc' } : preset.sort,
    mediumFilter: raw.mediumFilter,
    filters: {
      ...(neutral ? { ...preset.filters, statusGroup: null } : preset.filters),
      ...rawFilters,
      // En v1, la vue Favoris portait la restriction : elle survit à la conversion.
      favoritesOnly: (!neutral && preset.filters.favoritesOnly) || rawFilters.favoritesOnly === true,
    },
  }
}""",
)

path.write_text(src, encoding='utf-8')
print(f"OK — savedViews.ts adapté ({len(src)} caractères)")
