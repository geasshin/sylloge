/**
 * Ligne de statut d'une fiche (31 octobre 2026, retour d'Aurélien) : le statut
 * et la date personnelle forment une seule phrase sous les étoiles, au lieu
 * d'une pastille « Terminé » et d'une légende « Vu le … » qui se répètent.
 *
 * - une date de fin (film vu, jeu joué, œuvre découverte, fiche terminée) se
 *   lit avec le statut atteint : « Terminé le 29 novembre 2024 » ;
 * - une date de début (série, livre) : « En cours depuis le 27 août 2026 »,
 *   ou « Vue · commencée le 27 août 2026 » une fois la série finie ;
 * - un statut qui ne correspond pas à la date (« À découvrir » avec une date
 *   de visionnage) garde le libellé de la date : rien n'est sous-entendu à tort.
 *
 * La fonction rend un gabarit de traduction et ses paramètres : l'interface le
 * passe à `t()`, les tests Node le lisent sans dépendre de la langue.
 */

export type VerdictDateMode =
  /** La date est celle où le statut a été atteint. */
  | 'reached'
  /** La date est un début ; le statut « en cours » se lit « depuis le ». */
  | 'started-f'
  | 'started-m'

export type VerdictLine = { template: string; params: Record<string, string> }

export function verdictLine(input: {
  /** Libellé du statut, déjà traduit. */
  status: string
  /** Date déjà formatée, ou `null`. */
  date: string | null
  mode: VerdictDateMode
  /** Le statut actuel est-il celui que la date marque (fin atteinte, ou en cours pour un début) ? */
  matches: boolean
  /** Libellé de la date (« Vu le », « Dernière partie »), déjà traduit, pour un statut qui ne correspond pas. */
  dateLabel: string
}): VerdictLine {
  const { status, date, mode, matches, dateLabel } = input
  if (!date) return { template: '{status}', params: { status } }
  if (mode === 'reached') {
    return matches
      ? { template: '{status} le {date}', params: { status, date } }
      : { template: '{status} · {dateLabel} {date}', params: { status, dateLabel, date } }
  }
  if (matches) return { template: 'En cours depuis le {date}', params: { date } }
  return mode === 'started-f'
    ? { template: '{status} · commencée le {date}', params: { status, date } }
    : { template: '{status} · commencé le {date}', params: { status, date } }
}
