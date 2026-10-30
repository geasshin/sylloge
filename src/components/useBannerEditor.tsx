import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchBannerCandidates, type BannerCandidate, type BannerMedium } from '../data/bannerService.ts'
import { mediaRepository } from '../data/mediaRepository.ts'
import { BannerDialog } from './BannerDialog.tsx'

type BannerEditorOptions = {
  /** Titre de l'œuvre, pour les libellés accessibles. */
  title: string
  /** Médium de la fiche : décide du fournisseur et du chemin de la commande. */
  medium: BannerMedium
  /**
   * Identifiant TMDB (film, série, animé) ou IGDB (jeu) de la fiche associée.
   * `null` : la fenêtre le dit et laisse seulement coller une adresse.
   */
  providerId: string | null
  /** Bannière actuelle : pré-remplit la fenêtre à l'ouverture. */
  currentUrl?: string | null
  /** Reçoit l'adresse enregistrée, ou null quand la bannière est retirée. */
  onSave: (url: string | null) => Promise<void> | void
}

/**
 * Comportement commun de la bannière 16:9 d'une fiche, sur le modèle de
 * `usePosterEditor` : le bouton de la bannière ouvre une fenêtre qui charge les
 * images officielles du fournisseur, laisse coller une adresse et retirer la
 * bannière. Rien n'est écrit avant « Enregistrer ».
 *
 * Les images ne sont demandées qu'à l'ouverture, une fois par identifiant : une
 * fiche qu'on ne modifie pas ne fait aucun appel.
 */
export function useBannerEditor({ title, medium, providerId, currentUrl = null, onSave }: BannerEditorOptions) {
  const [open, setOpen] = useState(false)
  const [candidates, setCandidates] = useState<BannerCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedKey = useRef<string | null>(null)

  const provider = providerId?.trim() ?? ''

  const load = useCallback(async () => {
    const key = `${medium}:${provider}`
    if (loadedKey.current === key) return
    // La clé est posée avant l'attente : un second appel (ouverture de la
    // fenêtre et arrivée tardive de l'identifiant) ne double pas la demande.
    loadedKey.current = key
    setLoading(true)
    setError(null)
    try {
      const images = await fetchBannerCandidates(medium, provider)
      setCandidates(images)
    } catch (cause) {
      console.error('Le chargement des images officielles a échoué.', cause)
      setCandidates([])
      setError(cause instanceof Error ? cause.message : 'Le chargement des images officielles a échoué.')
      loadedKey.current = null
    } finally {
      setLoading(false)
    }
  }, [medium, provider])

  // Changer de fiche (autre identifiant) oublie les images de la précédente.
  useEffect(() => {
    loadedKey.current = null
    setCandidates([])
    setError(null)
  }, [medium, provider])

  // L'identifiant fournisseur peut arriver après l'ouverture de la fenêtre
  // (lecture de `media_provider_links`) : les images se chargent alors d'elles-mêmes.
  useEffect(() => {
    if (!open || provider === '') return
    if (loadedKey.current !== `${medium}:${provider}`) void load()
  }, [open, provider, medium, load])

  const openEditor = () => {
    setOpen(true)
    const key = `${medium}:${provider}`
    if (provider !== '' && loadedKey.current !== key) void load()
  }

  const dialog = (
    <BannerDialog
      open={open}
      title={title}
      medium={medium}
      providerAvailable={provider !== ''}
      candidates={candidates}
      loading={loading}
      loadError={error}
      currentUrl={currentUrl}
      onRetry={() => void load()}
      onClose={() => setOpen(false)}
      onSave={async (url) => {
        await onSave(url)
      }}
    />
  )

  return {
    /** À poser sur `DetailBanner` : le crayon de la bannière. */
    bannerProps: { onEdit: openEditor } as const,
    /** À poser sur le bouton d'ajout quand la fiche n'a pas de bannière. */
    addProps: { onClick: openEditor } as const,
    bannerDialog: dialog,
  }
}

/**
 * Identifiant du fournisseur d'une série, d'un animé ou d'un jeu, lu dans
 * `media_provider_links` — le film le porte dans sa propre colonne. `null`
 * quand la fiche n'est associée à rien ou à un autre fournisseur : la fenêtre
 * proposera alors seulement de coller une adresse.
 */
export function useBannerProviderId(
  profileId: string,
  medium: Exclude<BannerMedium, 'film'>,
  mediaId: string,
): string | null {
  const [providerId, setProviderId] = useState<string | null>(null)
  const linkMedium = medium === 'game' ? 'games' : medium
  const expectedProvider = medium === 'game' ? 'IGDB' : 'TMDB'

  useEffect(() => {
    let cancelled = false
    setProviderId(null)
    mediaRepository.getMediaProviderLink(profileId, linkMedium, mediaId).then(
      (link) => {
        if (!cancelled) setProviderId(link?.providerName === expectedProvider ? link.providerId : null)
      },
      (error: unknown) => {
        console.error('Impossible de lire le lien fournisseur de la fiche.', error)
        if (!cancelled) setProviderId(null)
      },
    )

    return () => {
      cancelled = true
    }
  }, [expectedProvider, linkMedium, mediaId, profileId])

  return providerId
}
