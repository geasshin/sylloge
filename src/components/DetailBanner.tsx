import { useEffect, useState } from 'react'
import { t } from '../i18n/core.ts'
import { bannerDisplayUrl } from '../domain/bannerImages.ts'

/**
 * Bandeau 16:9 d'une fiche (films, séries, animation japonaise, jeux).
 *
 * Une bannière est l'adresse d'une image, jamais un fichier : ce composant ne
 * fait que l'afficher, recadrée en 21:9 sur toute la largeur et bornée en
 * hauteur. Sans bannière (`bannerUrl` vide) il ne rend rien du tout — il
 * n'existe pas de bannière par défaut. Une image qui ne se charge pas
 * disparaît aussi, sans cadre vide : il ne reste qu'un bouton discret pour la
 * remplacer.
 *
 * Le bouton « Modifier la bannière » vit dans le coin du bandeau, au même
 * gabarit que le crayon des affiches ; pour en AJOUTER une, la fiche pose
 * `BannerAddButton` là où cela a du sens.
 */

type DetailBannerProps = {
  title: string
  bannerUrl: string | null
  /** Présent → un bouton crayon apparaît dans le coin du bandeau. */
  onEdit?: () => void
  className?: string
}

export function DetailBanner({ title, bannerUrl, onEdit, className = '' }: DetailBannerProps) {
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setMissing(false)
  }, [bannerUrl])

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
    <div className={`detail-banner ${onEdit ? 'detail-banner-editable' : ''} ${className}`.replace(/\s+/g, ' ').trim()}>
      <img
        src={bannerDisplayUrl(bannerUrl)}
        alt={t('Bannière de « {title} »', { title })}
        loading="lazy"
        decoding="async"
        onError={() => setMissing(true)}
      />
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
