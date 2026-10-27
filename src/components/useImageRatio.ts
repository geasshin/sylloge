import { useCallback, useEffect, useState } from 'react'

/**
 * Format réel (largeur / hauteur) d'un visuel d'Art, mesuré au chargement de
 * l'image puis gardé en mémoire et sur l'appareil (27 octobre 2026).
 *
 * La grille Art compose ses rangées sur le format de chaque image. Sans
 * cache, chaque lancement recalerait la grille à mesure que les images
 * arrivent ; avec lui, une image déjà vue garde sa place dès le premier
 * rendu. Le cache ne contient que des adresses et des nombres : rien du
 * profil, hors sauvegarde, borné à `MAX_ENTRIES` adresses.
 */
const STORAGE_KEY = 'sylloge-art-ratios'
const MAX_ENTRIES = 600

let memory: Map<string, number> | null = null

function load(): Map<string, number> {
  if (memory) return memory
  memory = new Map()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number' && entry[1] > 0) {
          memory.set(entry[0], entry[1])
        }
      }
    }
  } catch {
    // Stockage refusé ou illisible : le cache reste en mémoire.
  }
  return memory
}

function persist(cache: Map<string, number>) {
  try {
    const entries = [...cache.entries()].slice(-MAX_ENTRIES)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Quota ou stockage refusé : sans conséquence, la mesure sera refaite.
  }
}

export function cachedImageRatio(url: string | null | undefined): number | null {
  if (!url) return null
  return load().get(url) ?? null
}

export function rememberImageRatio(url: string, ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) return
  const cache = load()
  const rounded = Math.round(ratio * 1000) / 1000
  if (cache.get(url) === rounded) return
  cache.delete(url)
  cache.set(url, rounded)
  persist(cache)
}

/** Format connu de l'image et fonction à brancher sur son chargement. */
export function useImageRatio(url: string | null | undefined): [number | null, (image: HTMLImageElement) => void] {
  const [ratio, setRatio] = useState<number | null>(() => cachedImageRatio(url))

  useEffect(() => {
    setRatio(cachedImageRatio(url))
  }, [url])

  const onLoad = useCallback((image: HTMLImageElement) => {
    if (!url || image.naturalWidth === 0 || image.naturalHeight === 0) return
    const measured = image.naturalWidth / image.naturalHeight
    rememberImageRatio(url, measured)
    setRatio(Math.round(measured * 1000) / 1000)
  }, [url])

  return [ratio, onLoad]
}
