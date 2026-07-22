import { useEffect, useState } from 'react'

type PosterProps = {
  title: string
  src: string | null
  className?: string
  label?: 'Affiche' | 'Couverture'
}

export function Poster({ title, src, className = '', label = 'Affiche' }: PosterProps) {
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setMissing(false)
  }, [src])

  const showFallback = !src || missing

  return (
    <div className={`poster ${className}`.trim()}>
      {showFallback ? (
        <div className="poster-fallback" role="img" aria-label={`${label} indisponible pour ${title}`}>
          <span>Sans {label.toLocaleLowerCase('fr')}</span>
          <b>{title}</b>
        </div>
      ) : (
        <img src={src} alt={`${label} de « ${title} »`} onError={() => setMissing(true)} />
      )}
    </div>
  )
}
