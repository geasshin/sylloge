// Famille visuelle d'un statut : accompli, en cours, abandonné ou en attente.
//
// Partagée par le badge des fiches, la pastille des cartes et les cartes à partager (qui ne retiennent
// que ce qui est accompli). Les statuts sont ceux des bibliothèques : film « terminé », série « vue »,
// livre « lu », jeu « joué », art « découverte », recette « maîtrisée ».

export type StatusTone = 'done' | 'active' | 'dropped' | 'todo'

const TONE_DONE = new Set(['terminé', 'vu', 'vue', 'lu', 'joué', 'découverte', 'maîtrisée'])
const TONE_DROPPED = new Set(['abandonné', 'abandonnée'])
const TONE_ACTIVE = new Set(['en cours'])

export function statusTone(status: string): StatusTone {
  if (TONE_DROPPED.has(status)) return 'dropped'
  if (TONE_DONE.has(status)) return 'done'
  if (TONE_ACTIVE.has(status)) return 'active'
  return 'todo'
}

export function isDoneStatus(status: string): boolean {
  return statusTone(status) === 'done'
}
