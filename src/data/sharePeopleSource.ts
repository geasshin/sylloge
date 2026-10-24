// Cartes à partager : ce qu'il faut lire hors de la fiche pour proposer des acteurs et des réalisateurs avec leur photo.
//
// La distribution vit dans le cache TMDB de chaque film associé (aucun appel réseau). Seul le portrait d'un
// réalisateur demande TMDB, et seulement pour ceux qu'on propose.
import { fetchTmdbDirectorPortrait, getFilmTmdbCache } from './tmdbService.ts'
import { splitDirectors, type FilmCredits, type SharePerson } from '../domain/sharePeople.ts'
import type { ShareItem } from '../domain/shareCard.ts'

const CHUNK = 16

/**
 * Les crédits de chaque film terminé : réalisateurs de la fiche, et, s'il est associé à TMDB, distribution et
 * identifiant. Une lecture impossible (film sans fiche TMDB, cache absent) laisse simplement le film sans acteurs.
 */
export async function loadFilmCredits(films: readonly ShareItem[]): Promise<FilmCredits[]> {
  const credits: FilmCredits[] = []
  for (let start = 0; start < films.length; start += CHUNK) {
    const chunk = films.slice(start, start + CHUNK)
    const read = await Promise.all(chunk.map(async film => {
      const cached = await getFilmTmdbCache(film.id).catch(() => null)
      const directors = splitDirectors(film.creator)
      return {
        tmdbId: cached?.presentation.tmdbId ?? null,
        directors: directors.length > 0 ? directors : (cached?.presentation.directors ?? []),
        cast: (cached?.presentation.cast ?? []).map(member => ({ name: member.name, portraitUrl: member.portraitUrl })),
      } satisfies FilmCredits
    }))
    credits.push(...read)
  }
  return credits
}

/** Les photos des réalisateurs proposés, par identifiant ; une photo introuvable reste `null` (la carte dessine les initiales). */
export async function loadDirectorPortraits(directors: readonly SharePerson[]): Promise<Record<string, string | null>> {
  const entries = await Promise.all(directors.map(async person => {
    if (person.sourceTmdbId === undefined) return [person.id, null] as const
    const url = await fetchTmdbDirectorPortrait(person.sourceTmdbId, person.name).catch(() => null)
    return [person.id, url] as const
  }))
  return Object.fromEntries(entries)
}
