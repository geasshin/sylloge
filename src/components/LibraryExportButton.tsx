import { useState } from 'react'
import { libraryRepository } from '../data/libraryRepository.ts'
import { saveExportJson } from '../data/nativePortability.ts'
import {
  createLibraryDocument,
  libraryExportFileName,
  serializeLibraryDocument,
} from '../domain/libraryDocument.ts'
import type { CulturalLibrary } from '../data/libraryRepository.ts'

export type LibraryMedium = 'films' | 'series' | 'books' | 'games' | 'artworks'

const MEDIUM_LABELS: Record<LibraryMedium, string> = {
  films: 'Films',
  series: 'Séries',
  books: 'Livres',
  games: 'Jeux',
  artworks: 'Art',
}

type LibraryExportButtonProps = {
  kind: LibraryMedium
  profileId: string
  buttonLabel?: string
}

function collectionOnly(library: CulturalLibrary, kind: LibraryMedium): CulturalLibrary {
  return {
    ...library,
    films: kind === 'films' ? library.films : [],
    series: kind === 'series' ? library.series : [],
    books: kind === 'books' ? library.books : [],
    games: kind === 'games' ? library.games : [],
    artworks: kind === 'artworks' ? library.artworks : [],
  }
}

export function LibraryExportButton({ kind, profileId, buttonLabel = 'Exporter' }: LibraryExportButtonProps) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const mediumLabel = MEDIUM_LABELS[kind]

  const exportLibrary = async () => {
    if (saving) return
    setSaving(true)
    setMessage(null)
    try {
      const library = await libraryRepository.loadLibrary(profileId)
      const document = createLibraryDocument(collectionOnly(library, kind))
      const savedName = await saveExportJson(libraryExportFileName(document.exportedAt), serializeLibraryDocument(document))
      setMessage(savedName ? `Export JSON enregistré dans « ${savedName} ».` : 'Export annulé.')
    } catch (error) {
      console.error(`Impossible d’exporter ${mediumLabel}.`, error)
      setMessage('L’export a échoué. La bibliothèque locale n’a pas été modifiée.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="transfer-action">
      <button className="secondary-button" type="button" disabled={saving} onClick={() => void exportLibrary()}>
        {saving ? 'Export…' : buttonLabel}
      </button>
      {message && <span className="transfer-action-message" role="status">{message}</span>}
    </span>
  )
}
