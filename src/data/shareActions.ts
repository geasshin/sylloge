// Partager une carte : copier l'image dans le presse-papiers puis ouvrir le service, ou l'enregistrer.
//
// Pourquoi « copier puis ouvrir » : une application de bureau ne peut pas déposer une image dans un
// message WhatsApp, Messenger ou X ; leurs pages web n'acceptent qu'un texte ou une adresse, et les
// stories Instagram ne se créent que depuis le téléphone. Le chemin fiable : l'image part dans le
// presse-papiers, le service s'ouvre dans le navigateur, on colle.
//
// Le presse-papiers n'accepte l'écriture que dans le geste de la personne (le clic) : l'écriture est
// demandée tout de suite avec une image encore en cours de fabrication (une promesse), pas après le dessin.

import type { ShareDestination } from '../domain/shareFormats.ts'

export type ClipboardLike = { write: (items: never[]) => Promise<void> }

export type ShareDeps = {
  /** Le presse-papiers de la fenêtre, ou null s'il n'existe pas. */
  clipboard: ClipboardLike | null
  /** Fabrique l'élément de presse-papiers à partir d'une image en cours de fabrication. */
  makeItem: (png: Promise<Blob>) => unknown
  /** Ouvre une page dans le navigateur du système. */
  open: (url: string) => Promise<void>
  /** Enregistre l'image (fenêtre native) ; rend le nom enregistré, ou null si la personne annule. */
  save: (fileName: string, png: Uint8Array) => Promise<string | null>
}

export type ShareResult =
  | { kind: 'copied-opened'; destination: string }
  | { kind: 'copied-open-failed'; destination: string }
  | { kind: 'copy-failed-saved'; file: string; destination: string }
  | { kind: 'saved-for-instagram'; file: string }
  | { kind: 'copied' }
  | { kind: 'copy-failed' }
  | { kind: 'cancelled' }
  | { kind: 'failed' }

/** Demande l'écriture tout de suite ; rend une promesse qui dit si elle a réussi. */
function startCopy(render: Promise<Uint8Array>, deps: ShareDeps): Promise<boolean> {
  if (!deps.clipboard) return Promise.resolve(false)
  try {
    const blob = render.then(bytes => new Blob([bytes as BlobPart], { type: 'image/png' }))
    blob.catch(() => undefined) // l'échec du dessin est rapporté par l'appelant, pas ici
    return deps.clipboard.write([deps.makeItem(blob)] as never[]).then(() => true, () => false)
  } catch {
    return Promise.resolve(false)
  }
}

export async function copyCard(render: () => Promise<Uint8Array>, deps: ShareDeps): Promise<ShareResult> {
  const png = render()
  png.catch(() => undefined)
  const copying = startCopy(png, deps)
  try { await png } catch { return { kind: 'failed' } }
  return (await copying) ? { kind: 'copied' } : { kind: 'copy-failed' }
}

export async function shareToDestination(
  destination: ShareDestination,
  render: () => Promise<Uint8Array>,
  deps: ShareDeps,
  fileName: string,
): Promise<ShareResult> {
  const png = render()
  png.catch(() => undefined)

  // Pas de page pour publier (story Instagram) : on enregistre, on n'ouvre rien.
  if (destination.url === null) {
    let bytes: Uint8Array
    try { bytes = await png } catch { return { kind: 'failed' } }
    try {
      const saved = await deps.save(fileName, bytes)
      return saved === null ? { kind: 'cancelled' } : { kind: 'saved-for-instagram', file: saved }
    } catch {
      return { kind: 'failed' }
    }
  }

  const copying = startCopy(png, deps)
  let bytes: Uint8Array
  try { bytes = await png } catch { return { kind: 'failed' } }

  if (await copying) {
    try {
      await deps.open(destination.url)
      return { kind: 'copied-opened', destination: destination.name }
    } catch {
      return { kind: 'copied-open-failed', destination: destination.name }
    }
  }

  // Copie impossible : le fichier tient lieu d'image, et la page s'ouvre pour qu'on y glisse le fichier.
  try {
    const saved = await deps.save(fileName, bytes)
    if (saved === null) return { kind: 'cancelled' }
    await deps.open(destination.url).catch(() => undefined)
    return { kind: 'copy-failed-saved', file: saved, destination: destination.name }
  } catch {
    return { kind: 'failed' }
  }
}
