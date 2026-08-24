export const ARTWORK_FORMS = [
  'peinture',
  'sculpture',
  'photographie',
  'dessin',
  'poésie',
  'gravure',
  'performance',
  'art conceptuel',
  'autre',
] as const

export type ArtworkForm = (typeof ARTWORK_FORMS)[number]

export const ARTWORK_FORM_LABELS: Record<ArtworkForm, string> = {
  peinture: 'Peinture',
  sculpture: 'Sculpture',
  photographie: 'Photographie',
  dessin: 'Dessin',
  poésie: 'Poésie',
  gravure: 'Gravure',
  performance: 'Performance',
  'art conceptuel': 'Art conceptuel',
  autre: 'Autre',
}

export const ARTWORK_STATUSES = ['à découvrir', 'découverte'] as const

export type ArtworkStatus = (typeof ARTWORK_STATUSES)[number]

export const ARTWORK_STATUS_LABELS: Record<ArtworkStatus, string> = {
  'à découvrir': 'À découvrir',
  découverte: 'Découverte',
}

export type Artwork = {
  id: string
  profileId: string
  title: string
  artist: string | null
  year: number | null
  form: ArtworkForm
  location: string | null
  exhibition: string | null
  status: ArtworkStatus
  isFavorite: boolean
  discoveredAt: string | null
  imageUrl: string | null
  personalNote: string | null
  /** Champs libres « nom → valeur » (0.6.12), ordre de saisie conservé. */
  customFields: ArtworkCustomField[]
  createdAt: string
  updatedAt: string
}

/** Un champ personnalisé : nom obligatoire, valeur facultative. */
export type ArtworkCustomField = {
  name: string
  value: string
}

/**
 * Les formats d'import peuvent contenir des chaînes facultatives vides. La
 * donnée locale canonique les représente par null. Cette fonction ne retire
 * aucun caractère d'une chaîne non vide.
 */
export function normalizeArtwork(artwork: Artwork): Artwork {
  return {
    ...artwork,
    artist: emptyOptionalTextToNull(artwork.artist),
    location: emptyOptionalTextToNull(artwork.location),
    exhibition: emptyOptionalTextToNull(artwork.exhibition),
    discoveredAt: emptyOptionalTextToNull(artwork.discoveredAt),
    imageUrl: emptyOptionalTextToNull(artwork.imageUrl),
    personalNote: emptyOptionalTextToNull(artwork.personalNote),
  }
}

function emptyOptionalTextToNull(value: string | null): string | null {
  return value === '' ? null : value
}
