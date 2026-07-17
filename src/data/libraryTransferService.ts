import type { ImportPreview, SyllogeExportDocument } from '../domain/libraryTransfer.ts'

export type ConfirmedImporter<Result> = (document: SyllogeExportDocument) => Promise<Result>

export function confirmValidatedImport<Result>(
  preview: ImportPreview,
  importer: ConfirmedImporter<Result>,
): Promise<Result> {
  if (preview.document === null || preview.errors.length > 0) {
    return Promise.reject(new Error('Un import invalide ne peut déclencher aucune écriture.'))
  }

  return importer(preview.document)
}
