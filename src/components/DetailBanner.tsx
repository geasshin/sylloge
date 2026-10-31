import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../i18n/core.ts'
import {
  BANNER_POSITION_DEFAULT,
  BANNER_POSITION_STEP,
  BANNER_POSITION_STEP_LARGE,
  bannerDisplayUrl,
  bannerPositionAfterDrag,
  clampBannerPosition,
  hiddenBannerPixels,
} from '../domain/bannerImages.ts'

/**
 * Bandeau 3:1 d'une fiche (films, séries, animation japonaise, jeux).
 *
 * Une bannière est l'adresse d'une image, jamais un fichier : ce composant ne
 * fait que l'afficher, recadrée en 3:1 sur toute la largeur et bornée en
 * hauteur. Sans bannière (`bannerUrl` vide) il ne rend rien du tout — il
 * n'existe pas de bannière par défaut. Une image qui ne se charge pas
 * disparaît aussi, sans cadre vide : il ne reste qu'un bouton discret pour la
 * remplacer.
 *
 * Le bouton « Modifier la bannière » vit dans le coin du bandeau, au même
 * gabarit que le crayon des affiches ; pour en AJOUTER une, la fiche pose
 * `BannerAddButton` là où cela a du sens. Le bouton « Recadrer », à sa gauche,
 * n'apparaît que sur une fiche modifiable et quand l'image a une hauteur
 * cachée : glisser verticalement choisit alors la bande visible (31 octobre
 * 2026, migration 0028).
 */

type DetailBannerProps = {
  title: string
  bannerUrl: string | null
  /**
   * Recadrage vertical enregistré : pourcentage d'`object-position`, `null`
   * (ou absent) pour le centrage par défaut.
   */
  bannerPosition?: number | null
  /** Présent → un bouton crayon apparaît dans le coin du bandeau. */
  onEdit?: () => void
  /** Présent (avec `onEdit`) → le geste « Recadrer » est proposé. */
  onReposition?: (position: number) => Promise<void> | void
  className?: string
}

export function DetailBanner({
  title,
  bannerUrl,
  bannerPosition = null,
  onEdit,
  onReposition,
  className = '',
}: DetailBannerProps) {
  const [missing, setMissing] = useState(false)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  const [cropping, setCropping] = useState(false)
  const [draft, setDraft] = useState(BANNER_POSITION_DEFAULT)
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cropError, setCropError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ pointerId: number; startY: number; startPosition: number; hiddenPx: number } | null>(null)

  const measure = useCallback(() => {
    const node = containerRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setFrame((current) => (
      Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5
        ? current
        : { width: rect.width, height: rect.height }
    ))
  }, [])

  useEffect(() => {
    setMissing(false)
    setNatural(null)
    setCropping(false)
  }, [bannerUrl])

  // Le clavier pilote le recadrage dès l'entrée dans le geste.
  useEffect(() => {
    if (!cropping) return
    const node = containerRef.current?.querySelector<HTMLElement>('.banner-crop-surface')
    node?.focus()
  }, [cropping])

  // La hauteur cachée dépend de la taille du bandeau : elle se remesure quand
  // la fenêtre change, pas seulement au chargement de l'image.
  useEffect(() => {
    if (!bannerUrl) return
    measure()
    const node = containerRef.current
    if (!node || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [bannerUrl, measure])

  // Hauteur de l'image rendue moins celle du bandeau : ce que `cover` cache.
  const hiddenPx = hiddenBannerPixels(frame.width, frame.height, natural?.width ?? null, natural?.height ?? null)
  const canCrop = Boolean(onEdit && onReposition) && hiddenPx > 0.5

  const savedPosition = clampBannerPosition(bannerPosition ?? BANNER_POSITION_DEFAULT)
  const shownPosition = cropping ? draft : savedPosition

  const startCropping = () => {
    setDraft(savedPosition)
    setCropError(null)
    setCropping(true)
  }

  const cancelCropping = () => {
    dragRef.current = null
    setDragging(false)
    setDraft(savedPosition)
    setCropError(null)
    setCropping(false)
  }

  const confirmCropping = async () => {
    if (!onReposition || saving) return
    setSaving(true)
    setCropError(null)
    try {
      await onReposition(clampBannerPosition(draft))
      setCropping(false)
    } catch (error) {
      console.error('Le recadrage de la bannière n’a pas pu être enregistré.', error)
      setCropError(t('Le recadrage n’a pas pu être enregistré.'))
    } finally {
      setSaving(false)
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropping || saving) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // Le glissement part de la position affichée : un second geste repart de là.
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startPosition: draft, hiddenPx }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.currentTarget.focus()
    event.preventDefault()
    setDragging(true)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setDraft(bannerPositionAfterDrag(drag.startPosition, event.clientY - drag.startY, drag.hiddenPx))
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!cropping) return
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelCropping()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      void confirmCropping()
      return
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    // Flèche haut = montrer le haut de l'image (pourcentage plus petit), comme
    // un glissement vers le bas ; Maj amplifie le pas.
    const step = event.shiftKey ? BANNER_POSITION_STEP_LARGE : BANNER_POSITION_STEP
    const direction = event.key === 'ArrowUp' ? -1 : 1
    setDraft((current) => clampBannerPosition(current + direction * step))
  }

  if (!bannerUrl) return null
  // Image introuvable (lien mort, hébergeur en panne) : pas de cadre vide, mais la
  // personne doit pouvoir la remplacer, sinon la fiche ne propose plus aucun geste.
  if (missing) {
    return onEdit ? (
      <div className={`detail-banner-missing ${className}`.trim()}>
        <button type="button" className="banner-add-button" onClick={onEdit}>
          <PencilGlyph />
          <span>{t('Bannière introuvable · La remplacer')}</span>
        </button>
      </div>
    ) : null
  }

  return (
    <div
      ref={containerRef}
      className={`detail-banner ${onEdit ? 'detail-banner-editable' : ''} ${cropping ? 'detail-banner-cropping' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
    >
      <img
        src={bannerDisplayUrl(bannerUrl)}
        alt={t('Bannière de « {title} »', { title })}
        loading="lazy"
        decoding="async"
        style={{ objectPosition: `50% ${shownPosition}%` }}
        onLoad={(event) => {
          const image = event.currentTarget
          setNatural({ width: image.naturalWidth, height: image.naturalHeight })
          measure()
        }}
        onError={() => {
          setMissing(true)
          setCropping(false)
        }}
      />
      {cropping && (
        <div
          className={`banner-crop-surface ${dragging ? 'banner-crop-surface-dragging' : ''}`.trim()}
          role="slider"
          tabIndex={0}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={draft}
          aria-label={t('Position de la bannière')}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={handleKeyDown}
        />
      )}
      {cropping ? (
        <div className="banner-crop-actions">
          <p className="banner-crop-hint">{t('Faites glisser l’image')}</p>
          <div className="banner-crop-buttons">
            <button type="button" className="secondary-button" onClick={cancelCropping} disabled={saving}>
              {t('Annuler')}
            </button>
            <button type="button" className="primary-button" onClick={() => void confirmCropping()} disabled={saving}>
              {t('Valider')}
            </button>
          </div>
          {cropError && <p className="banner-crop-error" role="alert">{cropError}</p>}
        </div>
      ) : (
        <>
          {canCrop && (
            <button
              type="button"
              className="banner-reposition-overlay"
              onClick={startCropping}
              aria-label={t('Recadrer la bannière de « {title} »', { title })}
              title={t('Recadrer la bannière')}
            >
              <MoveGlyph />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              className="banner-edit-overlay"
              onClick={onEdit}
              aria-label={t('Modifier la bannière de « {title} »', { title })}
              title={t('Modifier la bannière')}
            >
              <PencilGlyph />
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** Bouton discret pour poser une première bannière : la fiche décide où. */
export function BannerAddButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" className={`banner-add-button ${className}`.trim()} onClick={onClick}>
      <PencilGlyph />
      <span>{t('Ajouter une bannière')}</span>
    </button>
  )
}

/** Même crayon que l'affiche (`Poster.tsx`), pour un gabarit identique. */
function PencilGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

/** Flèches haut et bas sur un axe : le geste de recadrage vertical. */
function MoveGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v18" />
      <path d="m8 7 4-4 4 4" />
      <path d="m8 17 4 4 4-4" />
    </svg>
  )
}
