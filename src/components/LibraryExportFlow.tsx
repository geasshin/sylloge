import { useState } from 'react'
import { libraryRepository } from '../data/libraryRepository.ts'
import { saveExportCsv, saveExportJson } from '../data/nativePortability.ts'
import { createCollectionCsvExport, type CsvCollectionMedium } from '../domain/collectionCsvTransfer.ts'
import {
  createLibraryDocument,
  libraryExportFileName,
  serializeLibraryDocument,
} from '../domain/libraryDocument.ts'
import type { CulturalLibrary } from '../data/libraryRepository.ts'
import type { BookLibraryKey } from '../domain/bookLibraries.ts'
import type { SeriesLibraryKey } from '../domain/seriesLibraries.ts'
import { AccessibleDialog } from './AccessibleDialog.tsx'

export type LibraryExportMedium = CsvCollectionMedium

const MEDIUM_LABELS: Record<LibraryExportMedium, string> = {
  films: 'Films',
  series: 'Séries',
  anime: 'Animation japonaise',
  books: 'Livres',
  mangas: 'Mangas',
  games: 'Jeux',
  artworks: 'Art',
}

type ExportFormat = 'json' | 'csv'

type LibraryExportFlowProps = {
  kind: LibraryExportMedium
  profileId: string
  bookLibrary?: BookLibraryKey
  seriesLibrary?: SeriesLibraryKey
}

function collectionOnly(library: CulturalLibrary, kind: LibraryExportMedium): CulturalLibrary {
  return {
    ...library,
    films: kind === 'films' ? library.films : [],
    series: kind === 'series' ? library.series : [],
    anime: kind === 'anime' ? library.anime : [],
    books: kind === 'books' ? library.books : [],
    mangas: kind === 'mangas' ? library.mangas : [],
    games: kind === 'games' ? library.games : [],
    artworks: kind === 'artworks' ? library.artworks : [],
  }
}

/** Une bibliothèque = une section du document : le type d'export suit la
    bibliothèque ouverte, jamais une catégorie à filtrer. */
function exportMedium(kind: LibraryExportMedium, bookLibrary?: BookLibraryKey, seriesLibrary?: SeriesLibraryKey): LibraryExportMedium {
  if (kind === 'books' && bookLibrary === 'mangas') return 'mangas'
  if (kind === 'series' && seriesLibrary === 'anime') return 'anime'
  return kind
}

/**
 * Export unitaire d'une bibliothèque (jalon 0.4.29) : un seul bouton
 * « Exporter » ouvre un dialogue qui liste les formats proposés — JSON
 * Sylloge (document complet versionné) ou CSV (tableur) — puis écrit le
 * fichier choisi. Aucune écriture n'a lieu avant le choix explicite.
 */
export function LibraryExportFlow({ kind, profileId, bookLibrary, seriesLibrary }: LibraryExportFlowProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<ExportFormat | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const medium = exportMedium(kind, bookLibrary, seriesLibrary)
  const mediumLabel = MEDIUM_LABELS[medium]

  const runExport = async (format: ExportFormat) => {
    if (saving !== null) return
    setSaving(format)
    setMessage(null)
    try {
      const loaded = await libraryRepository.loadLibrary(profileId)
      if (format === 'json') {
        const document = createLibraryDocument(collectionOnly(loaded, medium))
        const savedName = await saveExportJson(libraryExportFileName(document.exportedAt), serializeLibraryDocument(document))
        setMessage(savedName ? `Export JSON enregistré dans « ${savedName} ».` : 'Export annulé.')
      } else {
        const exported = createCollectionCsvExport(loaded, medium)
        const savedName = await saveExportCsv(exported.fileName, exported.contents)
        const countLabel = medium === 'anime'
          ? exported.count === 1 ? 'animation japonaise' : 'animations japonaises'
          : medium === 'mangas'
            ? exported.count === 1 ? 'manga' : 'mangas'
            : exported.count === 1 ? exported.mediumLabel : `${exported.mediumLabel}s`
        setMessage(savedName
          ? `Export CSV enregistré dans « ${savedName} » avec ${exported.count} ${countLabel}.`
          : 'Export CSV annulé. Aucun fichier n’a été écrit.')
      }
      setOpen(false)
    } catch (error) {
      console.error(`Impossible d’exporter ${mediumLabel}.`, error)
      setMessage('L’export a échoué. La bibliothèque locale n’a pas été modifiée.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <span className="transfer-action">
      <button className="secondary-button" type="button" onClick={() => setOpen(true)}>
        Exporter
      </button>
      {message && <span className="transfer-action-message" role="status">{message}</span>}
      {open && (
        <AccessibleDialog
          title={`Exporter ${mediumLabel}`}
          description="Choisir le format du fichier. La bibliothèque locale n’est pas modifiée."
          closeDisabled={saving !== null}
          onClose={() => setOpen(false)}
          size="md"
        >
          <div className="export-format-options">
            <button
              className="export-format-option"
              type="button"
              disabled={saving !== null}
              onClick={() => void runExport('json')}
            >
              <b>{saving === 'json' ? 'Export en cours…' : 'JSON Sylloge'}</b>
              <small>Document complet et versionné, réimportable dans Sylloge.</small>
            </button>
            <button
              className="export-format-option"
              type="button"
              disabled={saving !== null}
              onClick={() => void runExport('csv')}
            >
              <b>{saving === 'csv' ? 'Export en cours…' : 'CSV'}</b>
              <small>Table lisible dans un tableur, pensée pour être relue ailleurs.</small>
            </button>
          </div>
        </AccessibleDialog>
      )}
    </span>
  )
}
