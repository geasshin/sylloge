import type { CSSProperties } from 'react'
import type { Artwork } from '../domain/artwork.ts'
import { displayRatio, poemExcerpt } from '../domain/artworkDetails.ts'
import { t } from '../i18n/core.ts'
import { ArtFormIcon } from './ArtFormIcon.tsx'
import { Poster } from './Poster.tsx'
import { useImageRatio } from './useImageRatio.ts'

/**
 * Visuel d'une œuvre d'Art au format de son image (27 octobre 2026).
 *
 * Le cadre prend le format réel de l'image (`--ar`, borné) : un panorama
 * reste large, un dessin reste en hauteur. Le format se lit au chargement
 * de l'image (`useArtworkFrame`) ; la carte qui contient le visuel s'en sert
 * aussi pour sa largeur, d'où un seul hook par œuvre, tenu par le parent.
 */
export type ArtworkFrame = { ratio: number; onImageLoad: (image: HTMLImageElement) => void }

export function useArtworkFrame(artwork: Artwork): ArtworkFrame {
  const [measured, onImageLoad] = useImageRatio(artwork.imageUrl)
  return { ratio: displayRatio(measured, artwork.form), onImageLoad }
}

type ArtworkVisualProps = {
  artwork: Artwork
  frame: ArtworkFrame
  className?: string
  onEdit?: () => void
  /** Vers montrés sur la page d'un poème sans image (la fiche en montre plus). */
  excerptLines?: number
}

export function ArtworkVisual({ artwork, frame, className = '', onEdit, excerptLines = 8 }: ArtworkVisualProps) {
  const style = { '--ar': frame.ratio } as CSSProperties
  // Sans image, un poème montre ses premiers vers sur une page ; les autres
  // formes, leur pictogramme. Le crayon reste disponible pour poser un visuel.
  const poem = !artwork.imageUrl ? artwork.details.text : undefined
  const fallback = poem ? (
    <span className="artwork-poem-page-text" aria-hidden="true">
      {poemExcerpt(poem, excerptLines).map((line, index) => (
        line === '' ? <span className="artwork-poem-page-gap" key={index} /> : <span key={index}>{line}</span>
      ))}
    </span>
  ) : (
    <span className="artwork-visual-empty">
      <ArtFormIcon form={artwork.form} size={28} />
      <span>{t('Sans visuel')}</span>
    </span>
  )

  return (
    <Poster
      title={artwork.title}
      src={artwork.imageUrl}
      label="Visuel"
      className={`artwork-visual ${poem ? 'artwork-poem-page' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      style={style}
      onImageLoad={frame.onImageLoad}
      onEdit={onEdit}
      fallback={fallback}
    />
  )
}
