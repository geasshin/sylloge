import { useRef, useState } from 'react'

const MAX_SOURCE_BYTES = 8 * 1024 * 1024
const AVATAR_SIZE = 256
const MAX_AVATAR_DATA_URL_LENGTH = 400_000
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function profileInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase('fr') ?? 'S'
}

export async function normalizeProfileAvatar(file: File): Promise<string> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error('Choisis une image JPEG, PNG ou WebP.')
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('La photo source ne peut pas dépasser 8 Mo.')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image()
      candidate.onload = () => resolve(candidate)
      candidate.onerror = () => reject(new Error('Cette image ne peut pas être lue.'))
      candidate.src = objectUrl
    })
    if (image.naturalWidth < 32 || image.naturalHeight < 32) {
      throw new Error('Choisis une image d’au moins 32 × 32 pixels.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('La photo ne peut pas être préparée sur cet appareil.')

    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
    const sourceX = (image.naturalWidth - sourceSize) / 2
    const sourceY = (image.naturalHeight - sourceSize) / 2
    context.fillStyle = '#F2EFE9'
    context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    )

    const dataUrl = canvas.toDataURL('image/jpeg', 0.84)
    if (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
      throw new Error('La photo préparée reste trop volumineuse. Choisis une image plus simple.')
    }
    return dataUrl
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function ProfileAvatar({
  name,
  avatarDataUrl,
  className = '',
}: {
  name: string
  avatarDataUrl: string | null
  className?: string
}) {
  return (
    <span className={`profile-avatar ${className}`.trim()} aria-hidden="true">
      {avatarDataUrl
        ? <img src={avatarDataUrl} alt="" />
        : <span>{profileInitial(name)}</span>}
    </span>
  )
}

export function ProfileAvatarPicker({
  name,
  avatarDataUrl,
  disabled = false,
  onChange,
  onError,
  compact = false,
}: {
  name: string
  avatarDataUrl: string | null
  disabled?: boolean
  onChange: (value: string | null) => void
  onError: (message: string | null) => void
  compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preparing, setPreparing] = useState(false)

  const selectFile = async (file: File | undefined) => {
    if (!file || preparing) return
    setPreparing(true)
    onError(null)
    try {
      onChange(await normalizeProfileAvatar(file))
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'La photo n’a pas pu être préparée.')
    } finally {
      setPreparing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={`profile-avatar-picker ${compact ? 'compact' : ''}`}>
      <ProfileAvatar name={name} avatarDataUrl={avatarDataUrl} />
      <div className="profile-avatar-picker-actions">
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || preparing}
          onChange={(event) => void selectFile(event.target.files?.[0])}
        />
        <button
          className="secondary-button"
          type="button"
          disabled={disabled || preparing}
          onClick={() => inputRef.current?.click()}
        >
          {preparing ? 'Préparation…' : avatarDataUrl ? 'Changer la photo' : 'Choisir une photo'}
        </button>
        {avatarDataUrl && (
          <button
            className="text-button"
            type="button"
            disabled={disabled || preparing}
            onClick={() => {
              onError(null)
              onChange(null)
            }}
          >
            Retirer
          </button>
        )}
      </div>
    </div>
  )
}
