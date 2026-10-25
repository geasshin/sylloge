// Copier une carte dans le presse-papiers.
//
// Le presse-papiers n'accepte l'écriture que dans le geste de la personne (le clic) : l'écriture est
// demandée tout de suite avec une image encore en cours de fabrication (une promesse), pas après le dessin.
//
// Décision d'Aurélien du 25 octobre 2026 : le partage direct vers WhatsApp, Messenger, X ou une story
// Instagram est retiré. Une application de bureau ne peut pas déposer une image dans un message ; ces
// boutons ne faisaient qu'ouvrir une page où il fallait encore coller. Restent l'enregistrement du PNG et
// la copie : à la personne de l'envoyer où elle veut.

export type ClipboardLike = { write: (items: never[]) => Promise<void> }

export type ShareDeps = {
  /** Le presse-papiers de la fenêtre, ou null s'il n'existe pas. */
  clipboard: ClipboardLike | null
  /** Fabrique l'élément de presse-papiers à partir d'une image en cours de fabrication. */
  makeItem: (png: Promise<Blob>) => unknown
}

export type ShareResult =
  | { kind: 'copied' }
  | { kind: 'copy-failed' }
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
