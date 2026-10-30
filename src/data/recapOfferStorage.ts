/**
 * Mémoire de la proposition du récapitulatif de l'année : par profil et par appareil, dans
 * `localStorage`, comme la langue et les ratios d'Art. Rien n'entre dans le document de profil,
 * donc aucune migration et rien à sauvegarder.
 *
 * Décision d'Aurélien du 30 octobre 2026 : la petite fenêtre ne s'ouvre qu'une fois par année ;
 * mémoire posée dès qu'elle s'affiche, quelle que soit la réponse (« Voir » ou « Plus tard »).
 */
const STORAGE_PREFIX = 'sylloge-recap-offered:'

/** La clé de cet appareil pour un profil. */
export function recapOfferStorageKey(profileId: string): string {
  return `${STORAGE_PREFIX}${profileId}`
}

/** L'année déjà proposée pour ce profil sur cet appareil, ou `null` (rien, valeur illisible, stockage refusé). */
export function readRecapOfferedYear(profileId: string): number | null {
  try {
    const stored = window.localStorage.getItem(recapOfferStorageKey(profileId))
    const year = stored === null ? Number.NaN : Number(stored.trim())
    return Number.isInteger(year) && year > 0 ? year : null
  } catch {
    return null
  }
}

/** Note l'année proposée dès que la fenêtre est affichée. Un stockage refusé ne casse rien : elle reviendra. */
export function rememberRecapOfferedYear(profileId: string, year: number): void {
  try {
    window.localStorage.setItem(recapOfferStorageKey(profileId), String(year))
  } catch {
    /* Stockage refusé (navigation privée) : la proposition reviendra à la prochaine ouverture. */
  }
}
