/**
 * Normalisation tolérante des valeurs importées (jalon 0.6.3).
 *
 * Principe : une valeur issue d'un fichier externe ne doit presque jamais
 * bloquer un import. Chaque parseur tente de comprendre la valeur (casse,
 * accents, pluriels, échelles, formats de dates multiples) ; s'il n'y arrive
 * pas, il renvoie null et la fiche part avec le champ vide, signalée dans le
 * résumé final. Seul l'absence de titre reste bloquante — elle est gérée en
 * amont, dans les validateurs de formulaires.
 */

export type Normalized<T> = { value: T | null; warning: string | null }

const stripAccents = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Clé de comparaison : minuscule, sans accents, espaces réduits. */
export const normalizeLoose = (value: string): string =>
  stripAccents(value).toLowerCase().trim().replace(/\s+/g, ' ')

/* ---------------------------------- Statuts --------------------------------- */

type StatusSynonyms = Record<string, readonly [string, ...string[]]>

const STATUS_SYNONYMS: Record<string, StatusSynonyms> = {
  film: {
    'à découvrir': ['a decouvrir', 'decouvrir', 'to watch', 'watchlist', 'planned'],
    'en attente': ['en attente', 'attente', 'on hold', 'paused', 'pending'],
    'terminé': ['termine', 'terminés', 'terminée', 'terminées', 'vu', 'vue', 'vus', 'completed', 'complete', 'done', 'finished', 'watched', 'seen'],
    'abandonné': ['abandonne', 'abandonnés', 'abandonnée', 'abandonnées', 'dropped', 'abandoned', 'stopped'],
  },
  série: {
    'à voir': ['a voir', 'voir', 'to watch', 'watchlist', 'planned'],
    // « En cours » couvre aussi la mise de côté temporaire (« On Hold »),
    // conformément au contrat produit des Séries qui n'a pas de statut « en attente ».
    'en cours': ['en cours', 'cours', 'encours', 'in progress', 'watching', 'ongoing', 'started', 'current', 'on hold', 'onhold', 'hold', 'paused', 'pending', 'waiting'],
    'vue': ['vue', 'vues', 'vu', 'terminé', 'terminée', 'completed', 'complete', 'done', 'finished', 'watched', 'seen'],
    'abandonnée': ['abandonnee', 'abandonnée', 'abandonné', 'abandonnes', 'dropped', 'abandoned', 'stopped'],
  },
  livre: {
    'à lire': ['a lire', 'lire', 'to read', 'readlist', 'planned'],
    'en cours': ['en cours', 'cours', 'encours', 'in progress', 'reading', 'reading now', 'currently reading', 'started'],
    'lu': ['lu', 'lus', 'lue', 'lues', 'terminé', 'terminée', 'read', 'finished', 'done', 'completed'],
    'abandonné': ['abandonne', 'abandonnés', 'abandonnée', 'abandonnées', 'dropped', 'abandoned', 'stopped'],
  },
  jeu: {
    'à jouer': ['a jouer', 'jouer', 'to play', 'backlog', 'planned'],
    'en cours': ['en cours', 'cours', 'encours', 'in progress', 'playing', 'playing now', 'started', 'current'],
    'joué': ['joue', 'joués', 'jouée', 'jouées', 'fini', 'terminé', 'played', 'finished', 'beaten', 'completed', 'done'],
    'regardé': ['regarde', 'regardé', 'regardés', 'watched let s play', "watched (let's play)", 'watched lets play', 'let s play', "let's play", 'lets play', 'let us play', 'stream', 'twitch', 'youtube', 'watched as let s play'],
    'abandonné': ['abandonne', 'abandonnés', 'abandonnée', 'abandonnées', 'dropped', 'abandoned', 'stopped'],
  },
  art: {
    'à découvrir': ['a decouvrir', 'decouvrir', 'to see', 'wishlist', 'planned'],
    'découverte': ['decouverte', 'découvertes', 'decouvert', 'discovered', 'seen', 'visited', 'done'],
  },
}

/**
 * Résout un statut externe vers le statut canonique du médium.
 * Accepte la valeur canonique elle-même (casse/accents/pluriels inclus).
 */
export function normalizeImportStatus(medium: keyof typeof STATUS_SYNONYMS, value: string | null): Normalized<string> {
  const raw = (value ?? '').trim()
  if (!raw) return { value: null, warning: null }
  const key = normalizeLoose(raw)
  for (const [canonical, synonyms] of Object.entries(STATUS_SYNONYMS[medium])) {
    if (key === normalizeLoose(canonical) || synonyms.some((synonym) => key === synonym)) {
      return { value: canonical, warning: null }
    }
  }
  return { value: null, warning: `« ${raw} » n’est pas un statut reconnu — champ laissé vide.` }
}

/* ------------------------------- Catégories --------------------------------- */

/** Correspondance souple sur les listes canoniques (catégories, formes…). */
export function normalizeEnumValue(value: string | null, canonicals: readonly string[]): Normalized<string> {
  const raw = (value ?? '').trim()
  if (!raw) return { value: null, warning: null }
  const key = normalizeLoose(raw)
  const exact = canonicals.find((candidate) => normalizeLoose(candidate) === key)
  if (exact) return { value: exact, warning: null }
  const partial = canonicals.find((candidate) => normalizeLoose(candidate).includes(key))
  if (partial) return { value: partial, warning: null }
  return { value: null, warning: `« ${raw} » ne correspond à aucune valeur connue — champ laissé vide.` }
}

/* ---------------------------------- Notes ----------------------------------- */

/**
 * Note /5 par demi-points. Sources acceptées : « 4 », « 4,5 », « 4/5 »,
 * « 8/10 » (conversion), « ★★★★☆ », « 80 % ». Hors bornes ou illisible → null.
 */
export function normalizeImportRating(value: string | null): Normalized<number> {
  const raw = (value ?? '').trim()
  if (!raw) return { value: null, warning: null }

  // Étoiles pleines ou vides : « ★★★★ » ou « ★★★★☆ ».
  const stars = (raw.match(/★/g) ?? []).length + ((raw.match(/✩|☆/g) ?? []).length ? 0.5 : 0)
  if (stars > 0 && /^[\s★☆]+$/.test(raw)) {
    const rounded = Math.round(stars * 2) / 2
    return clampRating(rounded)
  }

  // Pourcentage : « 80 % ».
  const percentMatch = /^(\d{1,3})\s?%$/.exec(raw)
  if (percentMatch) return clampRating(Number(percentMatch[1]) / 20)

  // Fraction : « 8/10 », « 4/5 », « 17/20 ».
  const fractionMatch = /^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/.exec(raw)
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1].replace(',', '.'))
    const denominator = Number(fractionMatch[2].replace(',', '.'))
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0 || numerator < 0) {
      return { value: null, warning: `Note « ${raw} » illisible — champ laissé vide.` }
    }
    return clampRating((numerator / denominator) * 5)
  }

  // Nombre suivi d'une annotation : « 9 (Chef d'œuvre) », « 7 - Très bon ».
  // Une valeur annotée provient d'une échelle /10 explicite (Notion…) :
  // toujours divisée par 2, même si elle est ≤ 5 (« 5 (Moyen) » = 2,5/5).
  const annotated = /^(\d+(?:[.,]\d+)?)\b[\s(:\-–—]/.exec(normalizeLoose(raw))
  if (annotated) {
    const parsed = Number(annotated[1])
    if (parsed > 5 && parsed <= 10) return clampRating(parsed / 2)
    if (parsed >= 1 && parsed <= 5) return clampRating(parsed / 2)
    return clampRating(parsed)
  }

  // Nombre simple : « 4 » ou « 4,5 ». Échelle /10 devinée si > 5.
  const numberMatch = /^(\d+(?:[.,]\d+)?)$/.exec(normalizeLoose(raw))
  if (numberMatch) {
    const parsed = Number(numberMatch[1])
    if (parsed > 5 && parsed <= 10) return clampRating(parsed / 2)
    return clampRating(parsed)
  }

  // Titre tronqué : espace finale retirée par le parseur CSV en amont.
  return { value: null, warning: `Note « ${raw} » illisible — champ laissé vide.` }
}

function clampRating(rating: number): Normalized<number> {
  if (!Number.isFinite(rating) || rating <= 0) {
    return { value: null, warning: 'Note hors bornes — champ laissé vide.' }
  }
  const clamped = Math.min(5, Math.round(rating * 2) / 2)
  return { value: clamped, warning: null }
}

/* ------------------------------- Coup de cœur -------------------------------- */

const TRUTHY_FAVORITES = new Set(['true', 'yes', 'oui', 'ouïe', '1', 'x', '✓', '✔', 'v', 'y', 'favori', 'favoris', 'favorite', 'coeur', 'cœur', 'coup de coeur', 'coup de cœur', 'star', '★'])
const FALSY_FAVORITES = new Set(['false', 'no', 'non', '0', '', '-', 'vide'])

export function normalizeImportFavorite(value: string | null): boolean {
  const normalized = normalizeLoose(value ?? '')
  return TRUTHY_FAVORITES.has(normalized)
}

export function isRecognizableFavorite(value: string | null): boolean {
  const normalized = normalizeLoose(value ?? '')
  return TRUTHY_FAVORITES.has(normalized) || FALSY_FAVORITES.has(normalized)
}

/* ---------------------------------- Dates ------------------------------------ */

/**
 * Dates multi-formats vers ISO jj-mm-aaaa : ISO, FR « 23/08/2026 » ou
 * « 23.08.2026 », formats Notion longs (« August 23, 2026 », « 23 août 2026 »).
 * Illisible → null.
 */
export function normalizeImportDate(value: string | null): Normalized<string> {
  const raw = (value ?? '').trim()
  if (!raw) return { value: null, warning: null }

  // Déjà ISO (éventuellement avec heure Notion).
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (isoMatch) return { value: isoMatch[0], warning: null }

  // Format FR : 23/08/2026, 23.08.26, 23-08-2026.
  const frMatch = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(raw)
  if (frMatch) {
    const day = Number(frMatch[1])
    const month = Number(frMatch[2])
    let year = Number(frMatch[3])
    if (year < 100) year += year < 70 ? 2000 : 1900
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return { value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, warning: null }
    }
    return { value: null, warning: `Date « ${raw} » invalide — champ laissé vide.` }
  }

  // Formats textuels : « 23 août 2026 », « August 23, 2026 », « 23 August 2026 ».
  const textual = parseTextualDate(raw)
  if (textual) return { value: textual, warning: null }

  return { value: null, warning: `Date « ${raw} » illisible — champ laissé vide.` }
}

const FR_MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12,
}
const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
}

function parseTextualDate(raw: string): string | null {
  const normalized = normalizeLoose(raw)

  // « 23 août 2026 »
  const frMatch = /^(\d{1,2}) ([a-z]+) (\d{4})$/.exec(normalized)
  if (frMatch && frMatch[2] in FR_MONTHS) {
    const day = Number(frMatch[1])
    const month = FR_MONTHS[frMatch[2]]
    return `${frMatch[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // « august 23 2026 » ou « august 23, 2026 »
  const enMatch = /^([a-z]+) (\d{1,2}),? (\d{4})$/.exec(normalized)
  if (enMatch && enMatch[1] in EN_MONTHS) {
    const day = Number(enMatch[2])
    const month = EN_MONTHS[enMatch[1]]
    return `${enMatch[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return null
}

/* --------------------------------- Compteurs ---------------------------------- */

/** Entier positif ou nul tolérant : « 12 », « 12 saisons », « S01E02 » non. */
export function normalizeImportCount(value: string | null): Normalized<number> {
  const raw = (value ?? '').trim()
  if (!raw) return { value: null, warning: null }
  const match = /^(\d+)/.exec(normalizeLoose(raw))
  if (match) return { value: Number(match[1]), warning: null }
  return { value: null, warning: `Compteur « ${raw} » illisible — champ laissé vide.` }
}
