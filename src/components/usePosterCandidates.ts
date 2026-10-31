import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchPosterCandidates,
  type PosterCandidate,
  type PosterMedium,
} from '../data/posterService.ts'

/**
 * Affiches officielles d'une série ou d'un animé, chargées à l'ouverture de la
 * galerie seulement, une fois par identifiant fournisseur : une fiche qu'on ne
 * modifie pas ne fait aucun appel.
 *
 * Le natif trie déjà la liste (`src-tauri/src/posters.rs`) ; ce hook ne garde
 * que l'état de la demande — chargement, échec, relance.
 */
export function usePosterCandidates(
  medium: PosterMedium,
  providerId: string | null,
  open: boolean,
) {
  const [candidates, setCandidates] = useState<PosterCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedKey = useRef<string | null>(null)
  // Numéro de la demande en cours : une réponse tardive d'une autre fiche ne
  // remplace ni la liste ni l'erreur de celle qui est ouverte.
  const requestId = useRef(0)

  const provider = providerId?.trim() ?? ''
  const key = `${medium}:${provider}`

  const load = useCallback(async () => {
    if (provider === '') return
    // La clé est posée avant l'attente : deux ouvertures rapprochées ne
    // doublent pas la demande.
    loadedKey.current = key
    requestId.current += 1
    const request = requestId.current
    const current = () => requestId.current === request
    setLoading(true)
    setError(null)
    try {
      const images = await fetchPosterCandidates(medium, provider)
      if (current()) setCandidates(images)
    } catch (cause) {
      console.error('Le chargement des affiches officielles a échoué.', cause)
      if (current()) {
        setCandidates([])
        setError(cause instanceof Error ? cause.message : 'Le chargement des affiches officielles a échoué.')
        // Un échec ne condamne pas la fiche : « Réessayer » relancera la demande.
        if (loadedKey.current === key) loadedKey.current = null
      }
    } finally {
      if (current()) setLoading(false)
    }
  }, [key, medium, provider])

  // Changer de fiche (autre identifiant) oublie les affiches de la précédente.
  useEffect(() => {
    loadedKey.current = null
    setCandidates([])
    setError(null)
    setLoading(false)
  }, [medium, provider])

  // L'identifiant peut arriver après l'ouverture (lecture de `media_provider_links`) :
  // les affiches se chargent alors d'elles-mêmes.
  useEffect(() => {
    if (!open || provider === '') return
    if (loadedKey.current !== key) void load()
  }, [open, provider, key, load])

  const retry = useCallback(() => {
    loadedKey.current = null
    void load()
  }, [load])

  return { candidates, loading, error, retry }
}
