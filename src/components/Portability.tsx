import { useEffect, useState } from 'react'
import { backupService, type BackupNotice } from '../data/backupService.ts'
import {
  createLibraryExport,
  exportFileName,
  serializeLibraryExport,
  validateLibraryImport,
  type ImportPreview,
} from '../domain/libraryTransfer.ts'
import type { FilmLibrary, ProfileSummary } from '../data/filmsRepository.ts'
import { filmsRepository } from '../data/filmsRepository.ts'
import { confirmValidatedImport } from '../data/libraryTransferService.ts'
import { pickImportJson, saveExportJson, type BackupSettings } from '../data/nativePortability.ts'

type SelectedImport = {
  fileName: string
  preview: ImportPreview
}

type ImportReport = {
  fileName: string
  profileName: string
  filmCount: number
}

type PortabilityProps = {
  library: FilmLibrary
  profiles: ProfileSummary[]
  onBack: () => void
  onSwitchProfile: (profileId: string) => Promise<void>
  onImported: (library: FilmLibrary) => void
  onBackupNotice: (notice: BackupNotice) => void
}

export function Portability({
  library,
  profiles,
  onBack,
  onSwitchProfile,
  onImported,
  onBackupNotice,
}: PortabilityProps) {
  const [exportState, setExportState] = useState<'idle' | 'saving'>('idle')
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [choosingImport, setChoosingImport] = useState(false)
  const [selectedImport, setSelectedImport] = useState<SelectedImport | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [backupSettings, setBackupSettings] = useState<BackupSettings | null>(null)
  const [loadingBackupSettings, setLoadingBackupSettings] = useState(true)
  const [choosingBackupDirectory, setChoosingBackupDirectory] = useState(false)
  const [savingBackup, setSavingBackup] = useState(false)
  const [backupMessage, setBackupMessage] = useState<BackupNotice | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingBackupSettings(true)
    setBackupMessage(null)

    backupService.getSettings(library.profile.id).then(
      (settings) => {
        if (!cancelled) setBackupSettings(settings)
      },
      (error: unknown) => {
        console.error('Impossible de lire le réglage de sauvegarde.', error)
        if (!cancelled) {
          const notice: BackupNotice = {
            kind: 'error',
            message: 'Le réglage de sauvegarde n’a pas pu être lu. Les films restent disponibles dans SQLite.',
          }
          setBackupSettings(null)
          setBackupMessage(notice)
          onBackupNotice(notice)
        }
      },
    ).finally(() => {
      if (!cancelled) setLoadingBackupSettings(false)
    })

    return () => {
      cancelled = true
    }
  }, [library.profile.id, onBackupNotice])

  const exportProfile = async () => {
    setExportState('saving')
    setExportMessage(null)
    const document = createLibraryExport(library)

    try {
      const savedName = await saveExportJson(exportFileName(document.exportedAt), serializeLibraryExport(document))
      setExportMessage(savedName
        ? `Export enregistré dans « ${savedName} » avec ${document.films.length} ${document.films.length === 1 ? 'film' : 'films'}.`
        : 'Export annulé. Aucun fichier n’a été écrit.')
    } catch (error) {
      console.error('Impossible d’exporter le profil.', error)
      setExportMessage('L’export a échoué. La bibliothèque locale n’a pas été modifiée.')
    } finally {
      setExportState('idle')
    }
  }

  const chooseImport = async () => {
    setChoosingImport(true)
    setImportError(null)
    setReport(null)

    try {
      const picked = await pickImportJson()
      if (!picked) {
        setSelectedImport(null)
        setImportError('Sélection annulée. Aucune donnée n’a été écrite.')
        return
      }
      setSelectedImport({ fileName: picked.name, preview: validateLibraryImport(picked.contents) })
    } catch (error) {
      console.error('Impossible de lire le fichier d’import.', error)
      setSelectedImport(null)
      setImportError('Le fichier choisi n’a pas pu être lu. Aucune donnée n’a été écrite.')
    } finally {
      setChoosingImport(false)
    }
  }

  const confirmImport = async () => {
    if (!selectedImport) return

    setImporting(true)
    setImportError(null)
    try {
      const importedLibrary = await confirmValidatedImport(
        selectedImport.preview,
        (document) => filmsRepository.importLibrary(document),
      )
      onImported(importedLibrary)
      setReport({
        fileName: selectedImport.fileName,
        profileName: importedLibrary.profile.name,
        filmCount: importedLibrary.films.length,
      })
      setSelectedImport(null)
    } catch (error) {
      console.error('Impossible d’importer le document validé.', error)
      setImportError('L’import SQLite a échoué. La transaction a été annulée et aucun profil incomplet n’a été conservé.')
    } finally {
      setImporting(false)
    }
  }

  const switchProfile = async (profileId: string) => {
    if (profileId === library.profile.id) return
    setSwitchingProfileId(profileId)
    setProfileError(null)
    try {
      await onSwitchProfile(profileId)
    } catch (error) {
      console.error('Impossible d’ouvrir le profil choisi.', error)
      setProfileError('Le profil choisi n’a pas pu être ouvert.')
    } finally {
      setSwitchingProfileId(null)
    }
  }

  const chooseBackupDirectory = async () => {
    setChoosingBackupDirectory(true)
    setBackupMessage(null)
    try {
      const settings = await backupService.pickDirectory(library.profile.id)
      if (!settings) {
        setBackupMessage({ kind: 'success', message: 'Choix du dossier annulé. Les sauvegardes automatiques restent inchangées.' })
        return
      }
      const notice: BackupNotice = {
        kind: 'success',
        message: 'Dossier de sauvegarde enregistré pour ce profil. La prochaine modification pourra créer le snapshot automatique du jour.',
      }
      setBackupSettings(settings)
      setBackupMessage(notice)
      onBackupNotice(notice)
    } catch (error) {
      console.error('Impossible d’enregistrer le dossier de sauvegarde.', error)
      const notice: BackupNotice = {
        kind: 'error',
        message: 'Le dossier choisi ne peut pas être utilisé pour les sauvegardes. Aucun réglage n’a été modifié.',
      }
      setBackupMessage(notice)
      onBackupNotice(notice)
    } finally {
      setChoosingBackupDirectory(false)
    }
  }

  const saveManualBackup = async () => {
    setSavingBackup(true)
    setBackupMessage(null)
    const notice = await backupService.saveManualSnapshot(library)
    setBackupMessage(notice)
    onBackupNotice(notice)
    setSavingBackup(false)
  }

  return (
    <main className="main portability-main">
      <header className="page-action-bar">
        <button className="back-button" type="button" onClick={onBack}>← Retour aux films</button>
      </header>

      <div className="portability-heading">
        <p className="eyebrow">Données locales</p>
        <h1 className="display-title">Profils et JSON</h1>
        <p>Exportez le profil courant ou restaurez un export dans un nouveau profil séparé.</p>
      </div>

      <div className="portability-grid">
        <section className="portability-card" aria-labelledby="profiles-title">
          <div className="portability-card-heading">
            <div>
              <p className="card-kicker">Profils locaux</p>
              <h2 id="profiles-title">Profil courant</h2>
            </div>
            <span className="profile-badge">{library.profile.name}</span>
          </div>
          <div className="profile-list">
            {profiles.map((profile) => {
              const active = profile.id === library.profile.id
              return (
                <button
                  className={`profile-row ${active ? 'active' : ''}`}
                  type="button"
                  key={profile.id}
                  aria-current={active ? 'true' : undefined}
                  disabled={active || switchingProfileId !== null}
                  onClick={() => switchProfile(profile.id)}
                >
                  <span>
                    <b>{profile.name}</b>
                    <small>{profile.filmCount} {profile.filmCount === 1 ? 'film' : 'films'}</small>
                  </span>
                  <span>{active ? 'Ouvert' : switchingProfileId === profile.id ? 'Ouverture…' : 'Ouvrir'}</span>
                </button>
              )
            })}
          </div>
          {profileError && <p className="inline-report error" role="alert">{profileError}</p>}
        </section>

        <section className="portability-card" aria-labelledby="export-title">
          <div className="portability-card-heading">
            <div>
              <p className="card-kicker">JSON version 1</p>
              <h2 id="export-title">Exporter ce profil</h2>
            </div>
          </div>
          <p>L’export contient le profil et tous ses champs Films V1. Il ne télécharge aucune affiche et ne contient aucun secret.</p>
          <dl className="transfer-summary">
            <div><dt>Profil</dt><dd>{library.profile.name}</dd></div>
            <div><dt>Films</dt><dd>{library.films.length}</dd></div>
            <div><dt>Format</dt><dd>sylloge-films · v1</dd></div>
          </dl>
          <button className="primary-button" type="button" onClick={exportProfile} disabled={exportState === 'saving'}>
            {exportState === 'saving' ? 'Choix du fichier…' : 'Exporter en JSON'}
          </button>
          {exportMessage && <p className="inline-report" role="status">{exportMessage}</p>}
        </section>

        <section className="portability-card backup-card" aria-labelledby="backup-title">
          <div className="portability-card-heading">
            <div>
              <p className="card-kicker">Snapshots JSON v1</p>
              <h2 id="backup-title">Sauvegardes portables</h2>
            </div>
          </div>
          <p>
            Choisissez un dossier local. Il peut déjà être synchronisé par votre propre service, mais Sylloge ne copie jamais la base SQLite active.
          </p>

          {loadingBackupSettings ? (
            <p className="backup-state" role="status">Lecture du réglage local…</p>
          ) : backupSettings ? (
            <>
              <dl className="backup-summary">
                <div><dt>Dossier</dt><dd title={backupSettings.backupDirectory}>{backupSettings.backupDirectory}</dd></div>
                <div><dt>Automatique</dt><dd>{backupSettings.lastAutomaticSnapshotDay ?? 'Pas encore créé'}</dd></div>
                <div><dt>Conservation</dt><dd>30 snapshots par profil</dd></div>
              </dl>
              <p className="backup-policy">
                Un snapshot est tenté après le premier changement réussi de ce profil chaque jour local. « Sauvegarder maintenant » crée toujours un nouveau JSON.
              </p>
              <div className="backup-actions">
                <button className="primary-button" type="button" onClick={saveManualBackup} disabled={savingBackup || choosingBackupDirectory}>
                  {savingBackup ? 'Sauvegarde…' : 'Sauvegarder maintenant'}
                </button>
                <button className="secondary-button" type="button" onClick={chooseBackupDirectory} disabled={savingBackup || choosingBackupDirectory}>
                  {choosingBackupDirectory ? 'Choix du dossier…' : 'Changer de dossier'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="backup-state">Les sauvegardes automatiques sont inactives pour ce profil tant qu’aucun dossier local n’est choisi.</p>
              <button className="primary-button" type="button" onClick={chooseBackupDirectory} disabled={choosingBackupDirectory}>
                {choosingBackupDirectory ? 'Choix du dossier…' : 'Choisir un dossier de sauvegarde'}
              </button>
            </>
          )}
          {backupMessage && <p className={`inline-report ${backupMessage.kind === 'error' ? 'error' : ''}`} role={backupMessage.kind === 'error' ? 'alert' : 'status'}>{backupMessage.message}</p>}
        </section>

        <section className="portability-card import-card" aria-labelledby="import-title">
          <div className="portability-card-heading">
            <div>
              <p className="card-kicker">Import contrôlé</p>
              <h2 id="import-title">Importer dans un nouveau profil</h2>
            </div>
          </div>
          <p>Le fichier est lu et validé en entier avant toute écriture. Le profil courant n’est ni fusionné, ni écrasé.</p>
          <button className="secondary-button" type="button" onClick={chooseImport} disabled={choosingImport || importing}>
            {choosingImport ? 'Choix du fichier…' : 'Choisir un JSON Sylloge'}
          </button>

          {selectedImport && <ImportPreviewPanel selected={selectedImport} importing={importing} onConfirm={confirmImport} />}
          {importError && <p className="inline-report error" role="alert">{importError}</p>}
          {report && <ImportReportPanel report={report} />}
        </section>
      </div>
    </main>
  )
}

function ImportPreviewPanel({ selected, importing, onConfirm }: {
  selected: SelectedImport
  importing: boolean
  onConfirm: () => Promise<void>
}) {
  const { preview } = selected
  const valid = preview.document !== null

  return (
    <div className={`import-preview ${valid ? 'valid' : 'invalid'}`}>
      <div className="import-preview-heading">
        <div>
          <p className="card-kicker">Aperçu avant écriture</p>
          <h3>{selected.fileName}</h3>
        </div>
        <span>{valid ? 'Valide' : 'Import bloqué'}</span>
      </div>
      <dl className="transfer-summary compact">
        <div><dt>Entrées valides</dt><dd>{preview.validFilmCount}</dd></div>
        <div><dt>Entrées lues</dt><dd>{preview.totalFilmCount}</dd></div>
        <div><dt>Erreurs</dt><dd>{preview.errors.length}</dd></div>
      </dl>

      {preview.errors.length > 0 ? (
        <div className="validation-errors" role="alert">
          <p>Aucune donnée n’a été écrite. Corrigez le fichier avant de réessayer.</p>
          <ol>
            {preview.errors.map((error, index) => (
              <li key={`${error.path}-${index}`}><code>{error.path}</code> {error.message}</li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="import-confirmation">
          <p>
            Confirmez la création d’un nouveau profil « {preview.document?.profile.name} » avec {preview.validFilmCount}
            {' '}{preview.validFilmCount === 1 ? 'film' : 'films'}. Les identifiants locaux seront recréés pour éviter les conflits.
          </p>
          <button className="primary-button" type="button" disabled={importing} onClick={onConfirm}>
            {importing ? 'Import en cours…' : 'Créer le nouveau profil et importer'}
          </button>
        </div>
      )}
    </div>
  )
}

function ImportReportPanel({ report }: { report: ImportReport }) {
  return (
    <div className="import-report" role="status">
      <p className="card-kicker">Rapport final</p>
      <h3>Import terminé</h3>
      <ul>
        <li>Fichier lu : {report.fileName}</li>
        <li>Nouveau profil courant : {report.profileName}</li>
        <li>{report.filmCount} {report.filmCount === 1 ? 'film importé' : 'films importés'}</li>
        <li>Profil source laissé intact</li>
        <li>Identifiants locaux recréés, autres champs V1 conservés</li>
      </ul>
    </div>
  )
}
