import { useEffect, useState } from 'react'

type PosterProps = {
  title: string
  src: string | null
  className?: string
}

export function Poster({ title, src, className = '' }: PosterProps) {
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setMissing(false)
  }, [src])

  const showFallback = !src || missing

  return (
    <div className={`poster ${className}`.trim()}>
      {showFallback ? (
        <div className="poster-fallback" role="img" aria-label={`Affiche indisponible pour ${title}`}>
          <span>Sans affiche</span>
          <b>{title}</b>
        </div>
      ) : (
        <img src={src} alt={`Affiche du film « ${title} »`} onError={() => setMissing(true)} />
      )}
    </div>
  )
}
