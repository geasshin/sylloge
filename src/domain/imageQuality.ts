/**
 * Taille d'image demandée par la fiche (30 octobre 2026).
 *
 * La colonne de la fiche montre le visuel sur environ 380 px, soit 760 pixels
 * réels sur un écran Retina. Une affiche TMDB `w500` ou une jaquette IGDB
 * `cover_big` (264 px) y sont agrandies et paraissent floues. La fiche demande
 * donc la taille au-dessus chez le même service ; la base garde l'adresse
 * enregistrée, la grille garde la petite taille (plus légère). Une adresse
 * personnelle, ou déjà assez grande, passe telle quelle.
 */

/** TMDB : tailles d'affiche plus petites que w780. */
const TMDB_SMALL_POSTER = /^(https:\/\/image\.tmdb\.org\/t\/p\/)w(?:92|154|185|300|342|500)\//
/** IGDB : tailles plus petites que 720p. */
const IGDB_SMALL_IMAGE = /^(https:\/\/images\.igdb\.com\/igdb\/image\/upload\/)t_(?:micro|thumb|cover_small|cover_big|logo_med|screenshot_med)\//

export function detailImageUrl(url: string | null): string | null {
  if (url === null) return null
  if (TMDB_SMALL_POSTER.test(url)) return url.replace(TMDB_SMALL_POSTER, '$1w780/')
  if (IGDB_SMALL_IMAGE.test(url)) return url.replace(IGDB_SMALL_IMAGE, '$1t_720p/')
  return url
}
