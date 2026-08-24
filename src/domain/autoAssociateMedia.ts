/**
 * Baguette magique multi-médiums (suite du jalon 0.6.6).
 *
 * Pour les Séries, Livres et Jeux, l'association met à jour les champs
 * éditoriaux de la fiche (visuel, année, créateur, résumé, saisons)
 * depuis le fournisseur assisté. Les données personnelles (statut, note,
 * coup de cœur, progression, avis, dates) ne sont jamais modifiées.
 * Art n'a pas de fournisseur : aucune association automatique.
 *
 * Ce module contient la logique pure (scoring, fusion) : les effets
 * (recherches réseau, écritures) sont injectés par l'appelant.
 */
import type { Series } from './series.ts'
import type { Book } from './book.ts'
import type { Game } from './game.ts'

export type AssociateOutcome = 'associated' | 'no-match'

export type AutoAssociateEditsResult = {
  associatedCount: number
  noMatchCount: number
}

/** Petit délai entre requêtes : on reste un client poli pour les API. */
export const REQUEST_DELAY_MS = 250

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Normalisation souple d'un titre pour la comparaison. */
function normalize(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Score titre + année entre une fiche locale et un candidat nommé/anné. */
export function scoreNamedCandidate(localTitle: string, localYear: number | null, candidateTitle: string, candidateYear: number | null): number {
  const local = normalize(localTitle)
  const candidate = normalize(candidateTitle)
  let best = 0
  if (candidate === local) best = 1
  else if (candidate.startsWith(local) || local.startsWith(candidate)) best = 0.85
  else if (candidate.includes(local) || local.includes(candidate)) best = 0.65
  if (localYear !== null && candidateYear === localYear && best > 0) best = Math.min(1, best + 0.25)
  else if (localYear !== null && candidateYear !== null && Math.abs(candidateYear - localYear) >= 2) best -= 0.2
  return best
}

/** Seuil minimal pour accepter une association automatique. */
export const MATCH_THRESHOLD = 0.8

/** Fusion présentation → fiche : seuls les champs éditoriaux changent. */
export function seriesWithPresentation(
  series: Series,
  presentation: { showrunners: string[]; cast: string[]; synopsis: string | null; seasonsTotal: number | null; posterUrl: string | null },
): Series {
  return {
    ...series,
    showrunner: presentation.showrunners.length > 0 ? presentation.showrunners.join(', ') : series.showrunner,
    casting: presentation.cast.length > 0 ? presentation.cast.join(', ') : series.casting,
    summary: presentation.synopsis ?? series.summary,
    seasonsTotal: presentation.seasonsTotal ?? series.seasonsTotal,
    posterUrl: presentation.posterUrl ?? series.posterUrl,
  }
}

export function bookWithPresentation(
  book: Book,
  presentation: { author: string | null; firstPublishYear: number | null; synopsis: string | null; coverUrl: string | null },
): Book {
  return {
    ...book,
    author: presentation.author ?? book.author,
    year: presentation.firstPublishYear ?? book.year,
    summary: presentation.synopsis ?? book.summary,
    coverUrl: presentation.coverUrl ?? book.coverUrl,
  }
}

export function gameWithPresentation(
  game: Game,
  presentation: { developer: string | null; releaseYear: number | null; coverUrl: string | null },
): Game {
  return {
    ...game,
    developer: presentation.developer ?? game.developer,
    year: presentation.releaseYear ?? game.year,
    coverUrl: presentation.coverUrl ?? game.coverUrl,
  }
}
