/**
 * L'image d'une affiche pour la carte à partager.
 *
 * Le canevas exige une image « propre » : chargée avec `crossOrigin`, sinon le dessin contamine le
 * canevas et l'export PNG échoue. Or les serveurs d'affiches ne garantissent pas cette autorisation —
 * `image.tmdb.org` ne la renvoie plus depuis son changement de CDN (constaté le 25 octobre 2026). La
 * fenêtre demande donc les octets à Rust (`fetch_remote_image`) et dessine un blob de même origine,
 * toujours exportable. Si la commande n'existe pas (recette dans un navigateur) ou refuse, on retente
 * le chargement direct : c'est le repli qui existait avant, et une image refusée retombe sur le titre.
 */

import { invoke } from '@tauri-apps/api/core'
import { loadCardImage, type ImageLoader } from '../components/shareCardImage.ts'

/** Assez pour une carte et ses portraits ; au-delà, la plus ancienne entrée est oubliée. */
const CACHE_LIMIT = 64
const loaded = new Map<string, Promise<CanvasImageSource | null>>()

async function imageFromBytes(bytes: ArrayBuffer | Uint8Array | number[]): Promise<CanvasImageSource | null> {
  // Une copie dans un tampon neuf : `Blob` n'accepte que des vues adossées à un `ArrayBuffer` simple.
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes as ArrayLike<number>)
  const blob = new Blob([view])
  const objectUrl = URL.createObjectURL(blob)
  try {
    // `loadCardImage` pose `crossOrigin` : sur un blob de même origine, il ne demande rien à personne.
    return await loadCardImage(objectUrl)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Charge une affiche pour le canevas. Le résultat est mémorisé : changer un choix redessine la carte
 * sans retélécharger les mêmes images.
 */
export const loadShareCardImage: ImageLoader = url => {
  const cached = loaded.get(url)
  if (cached) return cached
  const pending = (async () => {
    try {
      const raw = await invoke<ArrayBuffer | number[]>('fetch_remote_image', { url })
      const image = await imageFromBytes(raw)
      if (image) return image
    } catch {
      // Commande absente ou image refusée côté Rust : on retente par la fenêtre.
    }
    return loadCardImage(url)
  })()
  if (loaded.size >= CACHE_LIMIT) {
    const oldest = loaded.keys().next().value
    if (oldest !== undefined) loaded.delete(oldest)
  }
  loaded.set(url, pending)
  return pending
}
