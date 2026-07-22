import { useState } from 'react'
import { libraryRepository } from '../data/libraryRepository.ts'
import { saveExportCsv } from '../data/nativePortability.ts'
import { createCollectionCsvExport, type CsvCollectionMedium } from '../domain/collectionCsvTransfer.ts'

type LibraryCsvExportButtonProps = {
  kind: CsvCollectionMedium
  profileId: string
  buttonLabel?: string
}

export function LibraryCsvExportButton({ kind, profileId, buttonLabel = 'Exporter CSV' }: LibraryCsvExportButtonProps) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const exportCollection = async () => {
    if (saving) return
    setSaving(true)
    setMessage(null)
    try {
      const library = await libraryRepository.loadLibrary(profileId)
      const exported = createCollectionCsvExport(library, kind)
      const savedName = await saveExportCsv(exported.fileName, exported.contents)
      setMessage(savedName
        ? `Export CSV enregistré dans « ${savedName} » avec ${exported.count} ${exported.count === 1 ? exported.mediumLabel : `${exported.mediumLabel}s`}.`
        : 'Export CSV annulé. Aucun fichier n’a été écrit.')
    } catch (error) {
      console.error(`Impossible d’exporter ${kind} en CSV.`, error)
      setMessage('L’export CSV a échoué. La bibliothèque locale n’a pas été modifiée.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="transfer-action">
      <button className="secondary-button" type="button" disabled={saving} onClick={() => void exportCollection()}>
        {saving ? 'Export…' : buttonLabel}
      </button>
      {message && <span className="transfer-action-message" role="status">{message}</span>}
    </span>
  )
}
