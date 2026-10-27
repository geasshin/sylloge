import type { ArtworkForm } from './artwork.ts'

/**
 * Champs propres à chaque forme d'art (27 octobre 2026).
 *
 * Une peinture se décrit par sa technique et ses dimensions, une gravure par
 * son tirage, un poème par son texte et le recueil dont il vient. Ces champs
 * vivent dans la colonne JSON `details` de la table `artworks` (migration
 * 0025), sur le modèle des bibliothèques personnalisées : un objet
 * « clé → texte », sans structure figée côté base.
 *
 * Règle de conservation : changer la forme d'une œuvre ne détruit rien. Un
 * champ qui n'appartient pas à la nouvelle forme reste enregistré et reste
 * affiché tant qu'il porte une valeur ; il ne disparaît qu'une fois vidé.
 * La même règle vaut pour Lieu et Exposition, masqués pour un poème vide.
 *
 * Les libellés restent en français ici et passent par `t()` au rendu.
 */

export type ArtworkDetails = Record<string, string>

export type ArtworkDetailKey =
  | 'text'
  | 'collection'
  | 'translator'
  | 'technique'
  | 'material'
  | 'dimensions'
  | 'movement'
  | 'series'
  | 'process'
  | 'edition'
  | 'duration'
  | 'medium'

export type ArtworkDetailField = {
  key: ArtworkDetailKey
  label: string
  /** `poem` : texte long, mise en page conservée (vers, strophes). */
  kind: 'text' | 'poem'
  placeholder?: string
}

export type ArtworkFormProfile = {
  /** Libellé du champ « artiste » pour cette forme. */
  creatorLabel: string
  /** Lieu et Exposition ont-ils un sens pour cette forme ? */
  showsPlace: boolean
  /** Libellé du champ Exposition (une performance a lieu lors d'un événement). */
  exhibitionLabel: string
  /** Courte description affichée dans le choix de la catégorie. */
  hint: string
  /** Format du cadre tant qu'aucune image n'a donné le sien (largeur / hauteur). */
  defaultRatio: number
  fields: readonly ArtworkDetailField[]
}

const TECHNIQUE = (placeholder: string): ArtworkDetailField => ({ key: 'technique', label: 'Technique', kind: 'text', placeholder })
const DIMENSIONS: ArtworkDetailField = { key: 'dimensions', label: 'Dimensions', kind: 'text', placeholder: '73 × 92 cm' }
const MOVEMENT = (placeholder: string): ArtworkDetailField => ({ key: 'movement', label: 'Mouvement', kind: 'text', placeholder })

export const ARTWORK_FORM_PROFILES: Record<ArtworkForm, ArtworkFormProfile> = {
  peinture: {
    creatorLabel: 'Artiste',
    showsPlace: true,
    exhibitionLabel: 'Exposition',
    hint: 'Huile, acrylique, aquarelle…',
    defaultRatio: 4 / 5,
    fields: [TECHNIQUE('Huile sur toile'), DIMENSIONS, MOVEMENT('Impressionnisme')],
  },
  sculpture: {
    creatorLabel: 'Artiste',
    showsPlace: true,
    exhibitionLabel: 'Exposition',
    hint: 'Ronde-bosse, bas-relief, installation…',
    defaultRatio: 3 / 4,
    fields: [
      { key: 'material', label: 'Matériau', kind: 'text', placeholder: 'Bronze, marbre, bois…' },
      { ...DIMENSIONS, placeholder: '180 × 98 × 145 cm' },
      MOVEMENT('Art moderne'),
    ],
  },
  photographie: {
    creatorLabel: 'Photographe',
    showsPlace: true,
    exhibitionLabel: 'Exposition',
    hint: 'Tirage, reportage, série…',
    defaultRatio: 3 / 2,
    fields: [
      { key: 'series', label: 'Série', kind: 'text', placeholder: 'Images à la sauvette' },
      { key: 'process', label: 'Procédé', kind: 'text', placeholder: 'Tirage argentique, numérique…' },
    ],
  },
  dessin: {
    creatorLabel: 'Artiste',
    showsPlace: true,
    exhibitionLabel: 'Exposition',
    hint: 'Fusain, encre, sanguine…',
    defaultRatio: 3 / 4,
    fields: [TECHNIQUE('Plume et encre sur papier'), { ...DIMENSIONS, placeholder: '34 × 24 cm' }],
  },
  poésie: {
    creatorLabel: 'Poète',
    showsPlace: false,
    exhibitionLabel: 'Exposition',
    hint: 'Le texte, le recueil, la traduction',
    defaultRatio: 3 / 4,
    fields: [
      { key: 'collection', label: 'Recueil', kind: 'text', placeholder: 'Alcools' },
      { key: 'translator', label: 'Traduction', kind: 'text', placeholder: 'Traduit par…' },
      { key: 'text', label: 'Poème', kind: 'poem', placeholder: 'Recopiez le poème, vers par vers.' },
    ],
  },
  gravure: {
    creatorLabel: 'Artiste',
    showsPlace: true,
    exhibitionLabel: 'Exposition',
    hint: 'Estampe, eau-forte, xylographie…',
    defaultRatio: 4 / 3,
    fields: [
      TECHNIQUE('Gravure sur bois'),
      { ...DIMENSIONS, placeholder: '25 × 37 cm' },
      { key: 'edition', label: 'Tirage', kind: 'text', placeholder: 'Épreuve 12/50' },
    ],
  },
  performance: {
    creatorLabel: 'Artiste',
    showsPlace: true,
    exhibitionLabel: 'Événement',
    hint: 'Une action, un lieu, une durée',
    defaultRatio: 3 / 2,
    fields: [{ key: 'duration', label: 'Durée', kind: 'text', placeholder: '736 heures' }],
  },
  'art conceptuel': {
    creatorLabel: 'Artiste',
    showsPlace: true,
    exhibitionLabel: 'Exposition',
    hint: 'Idée, protocole, ready-made…',
    defaultRatio: 1,
    fields: [{ key: 'medium', label: 'Médium', kind: 'text', placeholder: 'Installation, texte, vidéo…' }],
  },
  autre: {
    creatorLabel: 'Artiste',
    showsPlace: true,
    exhibitionLabel: 'Exposition',
    hint: 'Tout ce qui ne rentre pas ailleurs',
    defaultRatio: 4 / 5,
    fields: [],
  },
}

/** Toutes les définitions connues, une par clé (la première rencontrée). */
const KNOWN_FIELDS: ReadonlyMap<string, ArtworkDetailField> = (() => {
  const known = new Map<string, ArtworkDetailField>()
  for (const profile of Object.values(ARTWORK_FORM_PROFILES)) {
    for (const field of profile.fields) if (!known.has(field.key)) known.set(field.key, field)
  }
  return known
})()

/** Bornes de saisie : un poème peut être long, une technique non. */
export const ARTWORK_DETAIL_LIMITS = { poem: 20_000, text: 300 } as const

/**
 * Champs à montrer pour une forme : les siens, puis ceux d'une autre forme
 * qui portent encore une valeur (rien ne devient invisible après un
 * changement de catégorie). Une clé inconnue de ce catalogue — venue d'un
 * import plus récent — n'est jamais montrée comme champ éditable, mais reste
 * enregistrée telle quelle.
 */
export function artworkDetailFieldsFor(form: ArtworkForm, details: ArtworkDetails): ArtworkDetailField[] {
  const own = ARTWORK_FORM_PROFILES[form].fields
  const ownKeys = new Set<string>(own.map((field) => field.key))
  const carried: ArtworkDetailField[] = []
  for (const [key, value] of Object.entries(details)) {
    if (ownKeys.has(key) || value.trim() === '') continue
    const field = KNOWN_FIELDS.get(key)
    if (field && !carried.some((entry) => entry.key === key)) carried.push(field)
  }
  return [...own, ...carried]
}

/** Lieu et Exposition : visibles quand la forme s'y prête ou qu'ils portent déjà une valeur. */
export function artworkShowsPlace(form: ArtworkForm, location: string | null | undefined, exhibition: string | null | undefined): boolean {
  return ARTWORK_FORM_PROFILES[form].showsPlace || Boolean(location?.trim()) || Boolean(exhibition?.trim())
}

/**
 * Forme canonique d'un objet de détails : chaînes seulement, valeurs vides
 * retirées, bornes appliquées. Les fins de ligne sont unifiées et les
 * espaces de fin de texte retirés ; l'intérieur d'un poème (retraits,
 * lignes vides entre strophes) est conservé tel quel.
 */
export function normalizeArtworkDetails(raw: unknown): ArtworkDetails {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const details: ArtworkDetails = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string' || key.trim() === '') continue
    const isPoem = KNOWN_FIELDS.get(key)?.kind === 'poem'
    const unified = value.replace(/\r\n?/gu, '\n')
    const cleaned = isPoem ? unified.replace(/^\n+|\s+$/gu, '') : unified.trim()
    if (cleaned === '') continue
    details[key] = cleaned.slice(0, isPoem ? ARTWORK_DETAIL_LIMITS.poem : ARTWORK_DETAIL_LIMITS.text)
  }
  return details
}

/** Lecture tolérante de la colonne JSON : un contenu illisible donne un objet vide. */
export function parseArtworkDetails(raw: string | null | undefined): ArtworkDetails {
  if (!raw) return {}
  try {
    return normalizeArtworkDetails(JSON.parse(raw))
  } catch {
    return {}
  }
}

/** Écriture : toujours un objet JSON (contrainte CHECK de la colonne). */
export function serializeArtworkDetails(details: ArtworkDetails | null | undefined): string {
  return JSON.stringify(normalizeArtworkDetails(details ?? {}))
}

/** Premières lignes d'un poème pour la carte sans visuel (strophes comprises). */
export function poemExcerpt(text: string, maxLines = 8): string[] {
  const lines = text.replace(/\r\n?/gu, '\n').split('\n').map((line) => line.trimEnd())
  while (lines.length > 0 && lines[0] === '') lines.shift()
  const excerpt: string[] = []
  for (const line of lines) {
    if (excerpt.length >= maxLines) break
    if (line === '' && (excerpt.length === 0 || excerpt[excerpt.length - 1] === '')) continue
    excerpt.push(line)
  }
  while (excerpt.length > 0 && excerpt[excerpt.length - 1] === '') excerpt.pop()
  return excerpt
}

/**
 * Format d'affichage d'un visuel dans la grille éditoriale : le format réel
 * de l'image, borné pour qu'un panorama ou une bande verticale ne déforme
 * pas la rangée (l'image reste entière, centrée dans son cadre).
 */
export const ARTWORK_RATIO_BOUNDS = { min: 0.75, max: 2.2 } as const

export function displayRatio(ratio: number | null | undefined, form: ArtworkForm): number {
  const base = typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? ratio : ARTWORK_FORM_PROFILES[form].defaultRatio
  return Math.min(ARTWORK_RATIO_BOUNDS.max, Math.max(ARTWORK_RATIO_BOUNDS.min, Math.round(base * 1000) / 1000))
}
