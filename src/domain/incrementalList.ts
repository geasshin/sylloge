/** Pas d'affichage progressif : 200 cartes, puis 200 de plus à l'approche du bas. */
export const INCREMENTAL_PAGE_SIZE = 200

/** Nombre de cartes montées au premier rendu d'une liste. */
export function initialIncrementalCount(total: number, pageSize = INCREMENTAL_PAGE_SIZE): number {
  const safeTotal = Math.max(0, Math.trunc(total))
  const safePage = Math.max(1, Math.trunc(pageSize))
  return Math.min(safeTotal, safePage)
}

/** Nombre suivant après un chargement : jamais au-delà du total, jamais en arrière. */
export function nextIncrementalCount(
  current: number,
  total: number,
  pageSize = INCREMENTAL_PAGE_SIZE,
): number {
  const safeTotal = Math.max(0, Math.trunc(total))
  const safePage = Math.max(1, Math.trunc(pageSize))
  if (safeTotal <= safePage) return safeTotal
  const safeCurrent = Math.max(safePage, Math.trunc(current))
  return Math.min(safeCurrent + safePage, safeTotal)
}

/** Une liste courte est rendue d'un coup ; l'observateur ne sert qu'au-delà d'une page. */
export function shouldUseIncremental(total: number, pageSize = INCREMENTAL_PAGE_SIZE): boolean {
  return Math.max(0, Math.trunc(total)) > Math.max(1, Math.trunc(pageSize))
}
