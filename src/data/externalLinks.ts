// Ouverture des liens externes.
//
// Dans la fenêtre Tauri, un <a href="https://…" target="_blank"> ne fait rien : la vue web ne peut pas
// ouvrir de fenêtre et ne doit pas naviguer hors de l'application. Le clic est donc confié au système
// (navigateur par défaut) par le plugin d'ouverture. Dans un navigateur ordinaire (harnais de recette,
// aperçu), le lien garde son comportement natif.
//
// Un seul écouteur au niveau du document couvre tous les liens actuels et à venir (aides d'import,
// À propos, crédits TMDB et IGDB…) : aucun composant n'a à y penser.

/** L'adresse à ouvrir, ou `null` : seules les adresses `https://` absolues sortent de l'application. */
export function externalLinkTarget(href: string | null | undefined): string | null {
  if (typeof href !== 'string') return null
  const trimmed = href.trim()
  if (!trimmed.startsWith('https://') || /\s/.test(trimmed)) return null
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' && url.hostname !== '' ? url.href : null
  } catch {
    return null
  }
}

type AnchorLike = { getAttribute: (name: string) => string | null }

type ClickLike = {
  button: number
  defaultPrevented: boolean
  target: unknown
  preventDefault: () => void
}

export type ExternalLinkDeps = {
  isNative: () => boolean
  open: (url: string) => Promise<void>
  onError?: (url: string, error: unknown) => void
}

/**
 * Détourne le clic vers le système si c'est un lien https dans la fenêtre native.
 * Rend `true` quand le clic a été pris en charge.
 */
export function handleExternalLinkClick(event: ClickLike, deps: ExternalLinkDeps): boolean {
  if (event.defaultPrevented || event.button !== 0) return false
  const anchor = (event.target as { closest?: (selector: string) => AnchorLike | null } | null)?.closest?.('a[href]')
  const url = anchor ? externalLinkTarget(anchor.getAttribute('href')) : null
  if (!url || !deps.isNative()) return false
  event.preventDefault()
  Promise.resolve()
    .then(() => deps.open(url))
    .catch(error => deps.onError?.(url, error))
  return true
}

const nativeDeps: ExternalLinkDeps = {
  isNative: () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
  open: async url => {
    // Importé à l'usage : le navigateur de recette et les tests n'ont pas à charger le plugin.
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  },
  onError: (url, error) => console.error('[liens] ouverture impossible :', url, error),
}

/**
 * Ouvre une adresse https dans le navigateur du système (ou un nouvel onglet hors fenêtre native).
 * Pour les boutons qui ouvrent un service : un lien `<a>` passe par `installExternalLinks`.
 */
export async function openExternalUrl(href: string): Promise<void> {
  const url = externalLinkTarget(href)
  if (!url) throw new Error(`Adresse refusée : ${href}`)
  if (nativeDeps.isNative()) await nativeDeps.open(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}

/** À appeler une fois au démarrage ; sans effet si déjà installé (rechargement à chaud). */
export function installExternalLinks(root: Document = document): void {
  const marker = 'externalLinks'
  if (root.documentElement.dataset[marker] === 'on') return
  root.documentElement.dataset[marker] = 'on'
  root.addEventListener('click', event => { handleExternalLinkClick(event, nativeDeps) })
}
