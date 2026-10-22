/**
 * Bibliothèques personnalisées (décision du 22 octobre 2026).
 *
 * Huit modèles prêts qu’un profil ajoute à ses sept bibliothèques de base.
 * Chaque modèle a sa propre table SQLite (migration 0021), de structure
 * commune ; ses champs propres vivent dans `details` (texte → texte). Le
 * catalogue ci-dessous décrit tout ce qui varie d’un modèle à l’autre :
 * libellés, statuts proposés, progression, champs et filtre principal.
 */

export const CUSTOM_LIBRARY_IDS = [
  'comics',
  'magazines',
  'audiobooks',
  'music',
  'podcasts',
  'documentaries',
  'shows',
  'board_games',
] as const

export type CustomLibraryId = (typeof CUSTOM_LIBRARY_IDS)[number]

/** Statuts stockés, communs aux huit tables. */
export const CUSTOM_STATUSES = ['à découvrir', 'en cours', 'terminé', 'abandonné'] as const

export type CustomStatus = (typeof CUSTOM_STATUSES)[number]

export type CustomFieldDefinition = {
  key: string
  label: string
  kind: 'text' | 'select'
  options?: readonly string[]
  placeholder?: string
}

export type CustomLibraryGroup = 'Lecture' | 'Écoute' | 'Écran' | 'Scène' | 'Jeu'

export type CustomLibraryTemplate = {
  id: CustomLibraryId
  /** Nom de la bibliothèque (barre latérale, titre). */
  label: string
  /** Nom complet quand il diffère (fenêtre d’ajout). */
  longLabel: string
  group: CustomLibraryGroup
  description: string
  singular: string
  plural: string
  /** « Ajouter un comic », « Ajouter un album »… */
  addLabel: string
  /** « Ce comic », « Cet album »… */
  thisLabel: string
  statuses: readonly CustomStatus[]
  statusLabels: Record<CustomStatus, string>
  creatorLabel: string
  progress: { label: string; hasTotal: boolean } | null
  /** Libellé de la date de fin (`finished_at`). */
  dateLabel: string
  /** Champ « choix » servant de filtre principal dans la bibliothèque. */
  kindField: string | null
  fields: readonly CustomFieldDefinition[]
  quotes: boolean
  coverShape: 'portrait' | 'square'
  notePlaceholder: string
}

const READING_LABELS: Record<CustomStatus, string> = {
  'à découvrir': 'À lire',
  'en cours': 'En cours',
  terminé: 'Lu',
  abandonné: 'Abandonné',
}

const LISTENING_LABELS: Record<CustomStatus, string> = {
  'à découvrir': 'À écouter',
  'en cours': 'En cours',
  terminé: 'Écouté',
  abandonné: 'Abandonné',
}

const WATCHING_LABELS: Record<CustomStatus, string> = {
  'à découvrir': 'À voir',
  'en cours': 'En cours',
  terminé: 'Vu',
  abandonné: 'Abandonné',
}

export const CUSTOM_LIBRARY_TEMPLATES: Record<CustomLibraryId, CustomLibraryTemplate> = {
  comics: {
    id: 'comics',
    label: 'Comics',
    longLabel: 'Comics',
    group: 'Lecture',
    description: 'Comics, bandes dessinées et romans graphiques, série par série.',
    singular: 'comic',
    plural: 'comics',
    addLabel: 'Ajouter un comic',
    thisLabel: 'ce comic',
    statuses: CUSTOM_STATUSES,
    statusLabels: READING_LABELS,
    creatorLabel: 'Scénario',
    progress: { label: 'Tomes lus', hasTotal: true },
    dateLabel: 'Fini le',
    kindField: 'format',
    fields: [
      { key: 'format', label: 'Format', kind: 'select', options: ['Comics', 'Bande dessinée', 'Roman graphique', 'Webtoon'] },
      { key: 'series', label: 'Série', kind: 'text' },
      { key: 'artist', label: 'Dessin', kind: 'text' },
      { key: 'publisher', label: 'Éditeur', kind: 'text', placeholder: 'Marvel, Dupuis, Urban…' },
    ],
    quotes: true,
    coverShape: 'portrait',
    notePlaceholder: 'Qu’as-tu pensé de cette lecture ?',
  },
  magazines: {
    id: 'magazines',
    label: 'Magazines',
    longLabel: 'Magazines',
    group: 'Lecture',
    description: 'Revues et magazines, au numéro ou au fil des abonnements.',
    singular: 'magazine',
    plural: 'magazines',
    addLabel: 'Ajouter un magazine',
    thisLabel: 'ce magazine',
    statuses: CUSTOM_STATUSES,
    statusLabels: READING_LABELS,
    creatorLabel: 'Éditeur ou rédaction',
    progress: { label: 'Numéros lus', hasTotal: false },
    dateLabel: 'Lu le',
    kindField: 'periodicity',
    fields: [
      { key: 'periodicity', label: 'Périodicité', kind: 'select', options: ['Hebdomadaire', 'Mensuel', 'Bimestriel', 'Trimestriel', 'Hors-série', 'Autre'] },
      { key: 'issue', label: 'Numéro', kind: 'text', placeholder: 'n° 412' },
      { key: 'theme', label: 'Thème', kind: 'text' },
      { key: 'articles', label: 'Articles marquants', kind: 'text' },
    ],
    quotes: false,
    coverShape: 'portrait',
    notePlaceholder: 'Qu’as-tu retenu de ta lecture ?',
  },
  audiobooks: {
    id: 'audiobooks',
    label: 'Livres audio',
    longLabel: 'Livres audio',
    group: 'Écoute',
    description: 'Romans et essais lus à voix haute, avec narration et durée.',
    singular: 'livre audio',
    plural: 'livres audio',
    addLabel: 'Ajouter un livre audio',
    thisLabel: 'ce livre audio',
    statuses: CUSTOM_STATUSES,
    statusLabels: LISTENING_LABELS,
    creatorLabel: 'Auteur',
    progress: { label: 'Chapitres écoutés', hasTotal: true },
    dateLabel: 'Écouté le',
    kindField: null,
    fields: [
      { key: 'narrator', label: 'Narration', kind: 'text' },
      { key: 'platform', label: 'Plateforme', kind: 'text', placeholder: 'Audible, Storytel…' },
      { key: 'duration', label: 'Durée', kind: 'text', placeholder: '12 h 30' },
    ],
    quotes: false,
    coverShape: 'square',
    notePlaceholder: 'Qu’as-tu pensé de cette écoute ?',
  },
  music: {
    id: 'music',
    label: 'Musique',
    longLabel: 'Musique',
    group: 'Écoute',
    description: 'Albums, EP et singles, avec artiste, genre et label.',
    singular: 'album',
    plural: 'albums',
    addLabel: 'Ajouter un album',
    thisLabel: 'cet album',
    statuses: ['à découvrir', 'en cours', 'terminé'],
    statusLabels: { ...LISTENING_LABELS, 'en cours': 'En écoute' },
    creatorLabel: 'Artiste',
    progress: null,
    dateLabel: 'Écouté le',
    kindField: 'format',
    fields: [
      { key: 'format', label: 'Format', kind: 'select', options: ['Album', 'EP', 'Single', 'Compilation', 'Live', 'Bande originale'] },
      { key: 'genre', label: 'Genre', kind: 'text' },
      { key: 'label', label: 'Label', kind: 'text' },
    ],
    quotes: false,
    coverShape: 'square',
    notePlaceholder: 'Qu’as-tu ressenti à l’écoute ?',
  },
  podcasts: {
    id: 'podcasts',
    label: 'Podcasts',
    longLabel: 'Podcasts',
    group: 'Écoute',
    description: 'Émissions et séries audio, épisode par épisode.',
    singular: 'podcast',
    plural: 'podcasts',
    addLabel: 'Ajouter un podcast',
    thisLabel: 'ce podcast',
    statuses: CUSTOM_STATUSES,
    statusLabels: LISTENING_LABELS,
    creatorLabel: 'Animation',
    progress: { label: 'Épisodes écoutés', hasTotal: true },
    dateLabel: 'Fini le',
    kindField: 'format',
    fields: [
      { key: 'format', label: 'Format', kind: 'select', options: ['Interview', 'Récit', 'Débat', 'Fiction audio', 'Chronique', 'Autre'] },
      { key: 'platform', label: 'Plateforme', kind: 'text' },
      { key: 'theme', label: 'Thème', kind: 'text' },
    ],
    quotes: false,
    coverShape: 'square',
    notePlaceholder: 'Qu’as-tu pensé de ce podcast ?',
  },
  documentaries: {
    id: 'documentaries',
    label: 'Documentaires',
    longLabel: 'Documentaires et reportages',
    group: 'Écran',
    description: 'Films documentaires, séries documentaires et reportages.',
    singular: 'documentaire',
    plural: 'documentaires',
    addLabel: 'Ajouter un documentaire',
    thisLabel: 'ce documentaire',
    statuses: CUSTOM_STATUSES,
    statusLabels: WATCHING_LABELS,
    creatorLabel: 'Réalisation',
    progress: { label: 'Épisodes vus', hasTotal: true },
    dateLabel: 'Vu le',
    kindField: 'format',
    fields: [
      { key: 'format', label: 'Format', kind: 'select', options: ['Film documentaire', 'Série documentaire', 'Reportage', 'Docu-fiction'] },
      { key: 'broadcaster', label: 'Diffuseur', kind: 'text', placeholder: 'Arte, France 5…' },
      { key: 'subject', label: 'Sujet', kind: 'text' },
    ],
    quotes: false,
    coverShape: 'portrait',
    notePlaceholder: 'Qu’as-tu appris ou ressenti ?',
  },
  shows: {
    id: 'shows',
    label: 'Spectacles',
    longLabel: 'Spectacles',
    group: 'Scène',
    description: 'Théâtre, danse, opéra, humour, cirque et concerts.',
    singular: 'spectacle',
    plural: 'spectacles',
    addLabel: 'Ajouter un spectacle',
    thisLabel: 'ce spectacle',
    statuses: ['à découvrir', 'terminé'],
    statusLabels: WATCHING_LABELS,
    creatorLabel: 'Auteur, compagnie ou artiste',
    progress: null,
    dateLabel: 'Vu le',
    kindField: 'type',
    fields: [
      { key: 'type', label: 'Type', kind: 'select', options: ['Théâtre', 'Danse', 'Opéra', 'Comédie musicale', 'Humour', 'Cirque', 'Concert', 'Autre'] },
      { key: 'direction', label: 'Mise en scène', kind: 'text' },
      { key: 'cast', label: 'Distribution', kind: 'text' },
      { key: 'venue', label: 'Salle', kind: 'text' },
      { key: 'city', label: 'Ville', kind: 'text' },
    ],
    quotes: false,
    coverShape: 'portrait',
    notePlaceholder: 'Qu’as-tu pensé de la représentation ?',
  },
  board_games: {
    id: 'board_games',
    label: 'Jeux de société',
    longLabel: 'Jeux de société',
    group: 'Jeu',
    description: 'Jeux de plateau, de cartes et d’ambiance, partie après partie.',
    singular: 'jeu de société',
    plural: 'jeux de société',
    addLabel: 'Ajouter un jeu de société',
    thisLabel: 'ce jeu de société',
    statuses: ['à découvrir', 'en cours', 'terminé', 'abandonné'],
    statusLabels: { 'à découvrir': 'À essayer', 'en cours': 'En cours', terminé: 'Joué', abandonné: 'Délaissé' },
    creatorLabel: 'Auteurs',
    progress: { label: 'Parties jouées', hasTotal: false },
    dateLabel: 'Dernière partie',
    kindField: 'type',
    fields: [
      { key: 'type', label: 'Type', kind: 'select', options: ['Stratégie', 'Familial', 'Ambiance', 'Coopératif', 'Enquête', 'Cartes', 'Autre'] },
      { key: 'publisher', label: 'Éditeur', kind: 'text' },
      { key: 'players', label: 'Joueurs', kind: 'text', placeholder: '2 à 4' },
      { key: 'duration', label: 'Durée', kind: 'text', placeholder: '45 min' },
      { key: 'age', label: 'Âge', kind: 'text', placeholder: '10 ans et +' },
    ],
    quotes: false,
    coverShape: 'square',
    notePlaceholder: 'Qu’as-tu pensé de ce jeu ?',
  },
}

export const CUSTOM_LIBRARY_GROUPS: readonly CustomLibraryGroup[] = ['Lecture', 'Écoute', 'Écran', 'Scène', 'Jeu']

export function isCustomLibraryId(value: unknown): value is CustomLibraryId {
  return typeof value === 'string' && (CUSTOM_LIBRARY_IDS as readonly string[]).includes(value)
}

export function isCustomStatus(value: unknown): value is CustomStatus {
  return typeof value === 'string' && (CUSTOM_STATUSES as readonly string[]).includes(value)
}

export type CustomQuote = {
  id: string
  entryId: string
  body: string
  position: number
  createdAt: string
}

export type CustomEntry = {
  id: string
  profileId: string
  title: string
  creator: string | null
  year: number | null
  status: CustomStatus
  rating: number | null
  isFavorite: boolean
  progressCurrent: number | null
  progressTotal: number | null
  progressUpdatedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  coverUrl: string | null
  summary: string | null
  personalNote: string | null
  /** Champs propres au modèle : clé du catalogue → valeur saisie. */
  details: Record<string, string>
  quotes: CustomQuote[]
  createdAt: string
  updatedAt: string
}

/** Une bibliothèque ajoutée à un profil, avec ses fiches. */
export type CustomLibrary = {
  libraryId: CustomLibraryId
  position: number
  addedAt: string
  entries: CustomEntry[]
}

/** Bibliothèque ajoutée, sans ses fiches (barre latérale). */
export type EnabledCustomLibrary = {
  libraryId: CustomLibraryId
  position: number
  addedAt: string
  count: number
}

export function customStatusLabel(libraryId: CustomLibraryId, status: CustomStatus): string {
  return CUSTOM_LIBRARY_TEMPLATES[libraryId].statusLabels[status]
}

/** Chaînes facultatives vides → null ; champs propres vides retirés. */
export function normalizeCustomEntry(entry: CustomEntry): CustomEntry {
  const details: Record<string, string> = {}
  for (const [key, value] of Object.entries(entry.details ?? {})) {
    if (typeof value === 'string' && value !== '') details[key] = value
  }
  return {
    ...entry,
    creator: emptyToNull(entry.creator),
    progressUpdatedAt: emptyToNull(entry.progressUpdatedAt),
    startedAt: emptyToNull(entry.startedAt),
    finishedAt: emptyToNull(entry.finishedAt),
    coverUrl: emptyToNull(entry.coverUrl),
    summary: emptyToNull(entry.summary),
    personalNote: emptyToNull(entry.personalNote),
    details,
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  return value === '' || value === undefined ? null : value
}

/** Libellé court d’une fiche : format · créateur · année. */
export function customEntryByline(libraryId: CustomLibraryId, entry: CustomEntry): string {
  const template = CUSTOM_LIBRARY_TEMPLATES[libraryId]
  const kind = template.kindField ? entry.details[template.kindField] : undefined
  return [kind, entry.creator, entry.year !== null ? String(entry.year) : null]
    .filter((value): value is string => Boolean(value))
    .join(' · ')
}

// ─── Formulaire ────────────────────────────────────────────────────────────

export type CustomEntryFormValues = {
  title: string
  creator: string
  year: string
  status: CustomStatus
  rating: string
  isFavorite: boolean
  progressCurrent: string
  progressTotal: string
  finishedAt: string
  coverUrl: string
  summary: string
  personalNote: string
  details: Record<string, string>
  quotes: string[]
}

export type CustomEntryWriteInput = Omit<CustomEntry, 'id' | 'profileId' | 'createdAt' | 'updatedAt' | 'quotes' | 'progressUpdatedAt' | 'startedAt'> & {
  quotes: string[]
}

export type CustomEntryFormErrors = Partial<Record<'title' | 'year' | 'rating' | 'progressCurrent' | 'progressTotal' | 'finishedAt' | 'coverUrl' | 'quotes', string>>

export function emptyCustomEntryForm(libraryId: CustomLibraryId): CustomEntryFormValues {
  const template = CUSTOM_LIBRARY_TEMPLATES[libraryId]
  return {
    title: '',
    creator: '',
    year: '',
    status: template.statuses[0],
    rating: '',
    isFavorite: false,
    progressCurrent: '',
    progressTotal: '',
    finishedAt: '',
    coverUrl: '',
    summary: '',
    personalNote: '',
    details: {},
    quotes: [],
  }
}

export function customEntryToFormValues(entry: CustomEntry): CustomEntryFormValues {
  return {
    title: entry.title,
    creator: entry.creator ?? '',
    year: entry.year === null ? '' : String(entry.year),
    status: entry.status,
    rating: entry.rating === null ? '' : String(entry.rating),
    isFavorite: entry.isFavorite,
    progressCurrent: entry.progressCurrent === null ? '' : String(entry.progressCurrent),
    progressTotal: entry.progressTotal === null ? '' : String(entry.progressTotal),
    finishedAt: entry.finishedAt ?? '',
    coverUrl: entry.coverUrl ?? '',
    summary: entry.summary ?? '',
    personalNote: entry.personalNote ?? '',
    details: { ...entry.details },
    quotes: [...entry.quotes].sort((first, second) => first.position - second.position).map((quote) => quote.body),
  }
}

export type CustomEntryValidation =
  | { success: true; data: CustomEntryWriteInput }
  | { success: false; errors: CustomEntryFormErrors }

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/u

export function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function optionalCount(value: string): number | null | 'invalid' {
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (!/^\d{1,6}$/u.test(trimmed)) return 'invalid'
  return Number(trimmed)
}

export function validateCustomEntryForm(libraryId: CustomLibraryId, values: CustomEntryFormValues): CustomEntryValidation {
  const template = CUSTOM_LIBRARY_TEMPLATES[libraryId]
  const errors: CustomEntryFormErrors = {}
  const title = values.title.trim()
  if (!title) errors.title = 'Le titre est obligatoire.'

  let year: number | null = null
  if (values.year.trim()) {
    if (!/^\d{4}$/u.test(values.year.trim())) errors.year = 'Indiquez une année sur quatre chiffres.'
    else year = Number(values.year.trim())
  }

  let rating: number | null = null
  if (values.rating !== '') {
    const parsed = Number(values.rating)
    if (!Number.isFinite(parsed) || parsed < 0.5 || parsed > 5 || parsed * 2 !== Math.round(parsed * 2)) errors.rating = 'La note va de 0,5 à 5.'
    else rating = parsed
  }

  let progressCurrent: number | null = null
  let progressTotal: number | null = null
  if (template.progress) {
    const current = optionalCount(values.progressCurrent)
    const total = template.progress.hasTotal ? optionalCount(values.progressTotal) : null
    if (current === 'invalid') errors.progressCurrent = 'Indiquez un nombre entier.'
    else progressCurrent = current
    if (total === 'invalid') errors.progressTotal = 'Indiquez un nombre entier.'
    else progressTotal = total
    if (progressCurrent !== null && progressTotal !== null && progressCurrent > progressTotal) {
      errors.progressCurrent = 'La progression dépasse le total.'
    }
  }

  const finishedAt = values.finishedAt.trim()
  if (finishedAt && !isCalendarDate(finishedAt)) errors.finishedAt = 'Date invalide.'

  const coverUrl = values.coverUrl.trim()
  if (coverUrl && !isHttpUrl(coverUrl)) errors.coverUrl = 'Indiquez une adresse web commençant par http ou https.'

  const quotes = template.quotes ? values.quotes.filter((quote) => quote.trim() !== '') : []

  if (!template.statuses.includes(values.status)) errors.title ??= 'Statut indisponible pour cette bibliothèque.'

  if (Object.keys(errors).length > 0) return { success: false, errors }

  const details: Record<string, string> = {}
  for (const field of template.fields) {
    const value = (values.details[field.key] ?? '').trim()
    if (value) details[field.key] = value
  }
  // Une valeur d’un champ inconnu du catalogue (document importé) est conservée.
  for (const [key, value] of Object.entries(values.details)) {
    if (!template.fields.some((field) => field.key === key) && value !== '') details[key] = value
  }

  return {
    success: true,
    data: {
      title,
      creator: values.creator.trim() || null,
      year,
      status: values.status,
      rating,
      isFavorite: values.isFavorite,
      progressCurrent,
      progressTotal,
      finishedAt: finishedAt || null,
      coverUrl: coverUrl || null,
      summary: values.summary.trim() || null,
      personalNote: values.personalNote === '' ? null : values.personalNote,
      details,
      quotes,
    },
  }
}
