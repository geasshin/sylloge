// Recherche d'images pour une œuvre : le pont vers Rust.
//
// La fenêtre ne joint pas Commons elle-même (la politique de sécurité n'autorise que `connect-src
// 'self' ipc:`). Elle demande le JSON à `fetch_commons_search`, qui interroge une seule adresse, puis
// lit la réponse ici (`src/domain/artImageSearch.ts`). Aucune image n'est téléchargée ni copiée : seule
// l'adresse de la vignette est retenue dans la fiche.

import { invoke } from '@tauri-apps/api/core'
import { candidatesFromCommons, type ArtworkImageCandidate } from '../domain/artImageSearch.ts'

/**
 * Six propositions d'images libres pour « titre + artiste ». Rend une liste vide si Commons ne trouve
 * rien ou si la réponse est illisible : l'appelant décide quoi dire, jamais une erreur silencieuse.
 */
export async function searchArtworkImages(
  title: string,
  artist: string | null,
): Promise<ArtworkImageCandidate[]> {
  const cleanTitle = title.trim()
  if (!cleanTitle) return []
  const body = await invoke<string>('fetch_commons_search', {
    title: cleanTitle,
    artist: artist?.trim() ? artist.trim() : null,
  })
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    console.error('La réponse de Commons n’est pas du JSON lisible.')
    return []
  }
  return candidatesFromCommons(payload, artist)
}
