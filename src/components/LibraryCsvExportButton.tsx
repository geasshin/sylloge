import { useState } from 'react'
import { libraryRepository } from '../data/libraryRepository.ts'
import { saveExportCsv } from '../data/nativePortability.ts'
import { filmsCsvExportFileName, serializeFilmsCsvExport } from '../domain/csvFilmExport.ts'
import { createLibraryExport } from '../domain/libraryTransfer.ts'

type LibraryCsvExportButtonProps = {
  profileId: string
  buttonLabel?: string
}

export function LibraryCsvExportButton({ profileId, buttonLabel = 'Exporter CSV' }: LibraryCsvExportButtonProps) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const exportFilms = async () => {
    if (saving) return
    setSaving(true)
    setMessage(null)
    try {
      const library = await libraryRepository.loadLibrary(profileId)
      const document = createLibraryExport({ profile: library.profile, films: library.films })
      const savedName = await saveExportCsv(filmsCsvExportFileName(document.exportedAt), serializeFilmsCsvExport(document))
      setMessage(savedName
        ? `Export CSV enregistré dans « ${savedName} » avec ${document.films.length} ${document.films.length === 1 ? 'film' : 'films'}.`
        : 'Export CSV annulé. Aucun fichier n’a été écrit.')
    } catch (error) {
      console.error('Impossible d’exporter les Films en CSV.', error)
      setMessage('L’export CSV a échoué. La bibliothèque locale n’a pas été modifiée.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="transfer-action">
      <button className="secondary-button" type="button" disabled={saving} onClick={() => void exportFilms()}>
        {saving ? 'Export…' : buttonLabel}
      </button>
      {message && <span className="transfer-action-message" role="status">{message}</span>}
    </span>
  )
}
