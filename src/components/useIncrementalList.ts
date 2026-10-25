import { useEffect, useRef, useState } from 'react'
import {
  INCREMENTAL_PAGE_SIZE,
  nextIncrementalCount,
} from '../domain/incrementalList.ts'

/**
 * Mémoire des cartes déjà chargées, par vue et par recherche. Elle permet de
 * retrouver la même profondeur de défilement au retour d'une fiche, sans
 * remonter en haut de la grille.
 */
const countMemory = new Map<string, number>()

/**
 * Rend les listes longues par paquets de 200, sans bouton : un sentinel après
 * la grille déclenche le paquet suivant quand il approche du bas. Les listes
 * de 200 fiches ou moins sont rendues d'un coup, sans observateur.
 */
export function useIncrementalList<T>(
  items: T[],
  memoryKey: string,
  pageSize = INCREMENTAL_PAGE_SIZE,
) {
  const [count, setCount] = useState(() => {
    const remembered = countMemory.get(memoryKey) ?? pageSize
    return Math.min(items.length, Math.max(pageSize, remembered))
  })
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const hasMore = count < items.length

  // Nouvelle recherche, nouveau tri ou nouvelle vue : on repart de la première page.
  useEffect(() => {
    const remembered = countMemory.get(memoryKey) ?? pageSize
    setCount(Math.min(items.length, Math.max(pageSize, remembered)))
  }, [items, memoryKey, pageSize])

  // Le retour depuis une fiche remonte ce composant : on garde sa profondeur.
  useEffect(() => {
    if (countMemory.size > 200) countMemory.clear()
    countMemory.set(memoryKey, count)
  }, [count, memoryKey])

  useEffect(() => {
    if (!hasMore) return
    const node = sentinelRef.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      // WebView ancienne : on préfère tout afficher plutôt que bloquer la liste.
      setCount(items.length)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setCount((current) => nextIncrementalCount(current, items.length, pageSize))
        }
      },
      { rootMargin: '800px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [count, hasMore, items.length, pageSize])

  return {
    visibleItems: items.slice(0, count),
    sentinelRef,
    hasMore,
    shown: count,
    total: items.length,
  }
}
