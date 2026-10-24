// Cartes à partager : les formats d'image et les destinations.
//
// Deux formats suffisent, parce que les réseaux se rangent en deux familles :
//   - standard, 1 080 × 1 350 (4:5) : messages, WhatsApp, Messenger, X, fil Instagram ;
//   - story, 1 080 × 1 920 (9:16) : stories Instagram et Facebook, statuts WhatsApp, Reels.
// Une story est recouverte par l'interface du réseau (nom en haut, champ de réponse en bas) : le
// contenu reste dans la zone sûre.

export type ShareFormatId = 'standard' | 'story'

export type ShareFormat = {
  id: ShareFormatId
  width: number
  height: number
  /** Hauteur du haut que l'interface du réseau recouvre : rien d'important n'y est dessiné. */
  safeTop: number
  safeBottom: number
}

export const SHARE_FORMATS: Record<ShareFormatId, ShareFormat> = {
  standard: { id: 'standard', width: 1080, height: 1350, safeTop: 0, safeBottom: 0 },
  story: { id: 'story', width: 1080, height: 1920, safeTop: 250, safeBottom: 340 },
}

export const SHARE_FORMAT_ORDER: readonly ShareFormatId[] = ['standard', 'story']

export type ShareDestinationId = 'whatsapp' | 'messenger' | 'x' | 'instagram-story'

export type ShareDestination = {
  id: ShareDestinationId
  /** Nom de marque : jamais traduit. */
  name: string
  /** Le format que ce réseau demande : choisi d'office quand on clique. */
  format: ShareFormatId
  /**
   * Page du service à ouvrir après avoir copié l'image, ou `null` quand le service ne permet pas de
   * publier depuis un ordinateur (une story Instagram ne se crée que depuis l'application mobile).
   */
  url: string | null
}

export const SHARE_DESTINATIONS: readonly ShareDestination[] = [
  { id: 'whatsapp', name: 'WhatsApp', format: 'standard', url: 'https://web.whatsapp.com/' },
  { id: 'messenger', name: 'Messenger', format: 'standard', url: 'https://www.messenger.com/' },
  { id: 'x', name: 'X', format: 'standard', url: 'https://x.com/compose/post' },
  { id: 'instagram-story', name: 'Story Instagram', format: 'story', url: null },
]
