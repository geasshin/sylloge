// Cartes à partager : les formats d'image.
//
// Deux formats suffisent, parce que les réseaux se rangent en deux familles :
//   - standard, 1 080 × 1 350 (4:5) : messages, WhatsApp, Messenger, X, fil Instagram ;
//   - story, 1 080 × 1 920 (9:16) : stories Instagram et Facebook, statuts WhatsApp, Reels.
// Une story est recouverte par l'interface du réseau (nom en haut, champ de réponse en bas) : le
// contenu reste dans la zone sûre.
//
// Aucune destination n'est codée ici : décision d'Aurélien du 25 octobre 2026, le partage direct vers un
// service est retiré. On enregistre ou on copie l'image, et on l'envoie soi-même.

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
