import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { backupService, type BackupNotice } from '../data/backupService.ts'
import {
  createLibraryExport,
  exportFileName,
  serializeLibraryExport,
  validateLibraryImport,
  type ImportPreview,
} from '../domain/libraryTransfer.ts'
import { filmsCsvExportFileName, serializeFilmsCsvExport } from '../domain/csvFilmExport.ts'
import {
  FILM_IMPORT_FIELD_LABELS,
  IMPORTABLE_FILM_FIELDS,
  NOTION_MARKDOWN_NOTES_SOURCE,
  conciseFilmImportReportSource,
  filmImportDestinationForSource,
  isFilmImportRatingSource,
  filmImportSourceRestriction,
  initialFilmImportConfiguration,
  inspectFilmCsvImportSource,
  prepareFilmCsvImport,
  previewFilmCsvImport,
  setFilmImportSourceDestination,
  type FilmImportConfiguration,
  type ImportableFilmField,
  type FilmImportSource,
  type FilmImportSourceSelection,
  type FilmImportSession,
  type FilmsCsvImportPreview,
} from '../domain/filmCsvImport.ts'
import type { FilmLibrary, ProfileSummary } from '../data/filmsRepository.ts'
import { filmsRepository } from '../data/filmsRepository.ts'
import { confirmValidatedImport } from '../data/libraryTransferService.ts'
import {
  pickImportJson,
  pickImportFilmsCsvOrNotion,
  saveExportCsv,
  saveExportJson,
  type BackupSettings,
  type PickedFilmsImportFile,
} from '../data/nativePortability.ts'
import { UpdaterSettings } from './UpdaterSettings.tsx'
import type { AvailableUpdate } from '../data/updaterService.ts'

type SelectedImport = {
  fileName: string
  preview: ImportPreview
}

type ImportReport = {
  fileName: string
  profileName: string
  filmCount: number
}

type ActiveImport = 'json' | 'films'
type TransferDialog = 'import' | 'export'
type ImportKind = ActiveImport | null
type FilmsImportStep = 'source' | 'mapping' | 'preview'

export type PortabilitySection = 'profiles' | 'transfer' | 'backups' | 'application' | 'about'

type SelectedFilmsImport = {
  source: PickedFilmsImportFile
  sourceSelection: FilmImportSourceSelection
  selectedCandidateId: string | null
  session: FilmImportSession | null
  configuration: FilmImportConfiguration | null
  preview: FilmsCsvImportPreview | null
}

type PortabilityProps = {
  section: PortabilitySection
  library: FilmLibrary
  profiles: ProfileSummary[]
  onSwitchProfile: (profileId: string) => Promise<void>
  onImported: (library: FilmLibrary) => void
  onBackupNotice: (notice: BackupNotice) => void
  availableUpdate: AvailableUpdate | null
  onUpdateAvailable: (update: AvailableUpdate) => void
  onUpdateHandled: () => void
}

export function Portability({
  section,
  library,
  profiles,
  onSwitchProfile,
  onImported,
  onBackupNotice,
  availableUpdate,
  onUpdateAvailable,
  onUpdateHandled,
}: PortabilityProps) {
  const [exportState, setExportState] = useState<'idle' | 'saving'>('idle')
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [csvExportState, setCsvExportState] = useState<'idle' | 'saving'>('idle')
  const [csvExportMessage, setCsvExportMessage] = useState<string | null>(null)
  const [choosingImport, setChoosingImport] = useState(false)
  const [selectedImport, setSelectedImport] = useState<SelectedImport | null>(null)
  const [activeImport, setActiveImport] = useState<ActiveImport | null>(null)
  const activeImportRef = useRef<ActiveImport | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [choosingFilmsImport, setChoosingFilmsImport] = useState(false)
  const [selectedFilmsImport, setSelectedFilmsImport] = useState<SelectedFilmsImport | null>(null)
  const [filmsImportError, setFilmsImportError] = useState<string | null>(null)
  const [filmsImportReport, setFilmsImportReport] = useState<ImportReport | null>(null)
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [backupSettings, setBackupSettings] = useState<BackupSettings | null>(null)
  const [loadingBackupSettings, setLoadingBackupSettings] = useState(true)
  const [choosingBackupDirectory, setChoosingBackupDirectory] = useState(false)
  const [savingBackup, setSavingBackup] = useState(false)
  const [backupMessage, setBackupMessage] = useState<BackupNotice | null>(null)
  const [installedVersion, setInstalledVersion] = useState<string | null>(null)
  const [transferDialog, setTransferDialog] = useState<TransferDialog | null>(null)
  const [importKind, setImportKind] = useState<ImportKind>(null)
  const [filmsImportStep, setFilmsImportStep] = useState<FilmsImportStep>('source')
  const [exportKind, setExportKind] = useState<'json' | 'csv' | null>(null)
  const importing = activeImport === 'json'
  const importingFilms = activeImport === 'films'
  const importInProgress = activeImport !== null

  const beginImport = (kind: ActiveImport) => {
    if (activeImportRef.current !== null) return false
    activeImportRef.current = kind
    setActiveImport(kind)
    return true
  }

  const finishImport = () => {
    activeImportRef.current = null
    setActiveImport(null)
  }

  useEffect(() => {
    let cancelled = false

    getVersion().then(
      (version) => {
        if (!cancelled) setInstalledVersion(version)
      },
      (error: unknown) => {
        console.error('Impossible de lire la version installée depuis Tauri.', error)
        if (!cancelled) setInstalledVersion(null)
      },
    )

    return () => {
      cancelled = true
    }
  }, [])

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

  const exportProfileCsv = async () => {
    setCsvExportState('saving')
    setCsvExportMessage(null)
    const document = createLibraryExport(library)

    try {
      const savedName = await saveExportCsv(
        filmsCsvExportFileName(document.exportedAt),
        serializeFilmsCsvExport(document),
      )
      setCsvExportMessage(savedName
        ? `Export CSV enregistré dans « ${savedName} » avec ${document.films.length} ${document.films.length === 1 ? 'film' : 'films'}.`
        : 'Export CSV annulé. Aucun fichier n’a été écrit.')
    } catch (error) {
      console.error('Impossible d’exporter le profil en CSV.', error)
      setCsvExportMessage('L’export CSV a échoué. La bibliothèque locale n’a pas été modifiée.')
    } finally {
      setCsvExportState('idle')
    }
  }

  const chooseImport = async () => {
    if (activeImportRef.current !== null) return
    setImportKind('json')
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
    if (!selectedImport || !beginImport('json')) return

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
      finishImport()
    }
  }

  const chooseFilmsImport = async () => {
    if (activeImportRef.current !== null) return
    setImportKind('films')
    setFilmsImportStep('source')
    setChoosingFilmsImport(true)
    setFilmsImportError(null)
    setFilmsImportReport(null)

    try {
      const source = await pickImportFilmsCsvOrNotion()
      if (!source) {
        setSelectedFilmsImport(null)
        setFilmsImportError('Sélection annulée. Aucune donnée n’a été écrite.')
        return
      }
      const sourceSelection = inspectFilmCsvImportSource(source)
      const selectedCandidateId = sourceSelection.defaultCandidateId
      const session = selectedCandidateId ? prepareFilmCsvImport(source, selectedCandidateId) : null
      const configuration = session ? initialFilmImportConfiguration(session) : null
      setSelectedFilmsImport({
        source,
        sourceSelection,
        selectedCandidateId,
        session,
        configuration,
        preview: session ? previewFilmCsvImport(session, source, configuration) : null,
      })
    } catch (error) {
      console.error('Impossible de lire le CSV ou l’archive Notion.', error)
      setSelectedFilmsImport(null)
      setFilmsImportError('Le fichier choisi n’a pas pu être lu ou dépasse les limites sûres. Aucune donnée n’a été écrite.')
    } finally {
      setChoosingFilmsImport(false)
    }
  }

  const updateFilmsImportConfiguration = (update: (configuration: FilmImportConfiguration) => FilmImportConfiguration) => {
    setSelectedFilmsImport((selected) => {
      if (!selected?.configuration || !selected.session) return selected
      const configuration = update(selected.configuration)
      return {
        ...selected,
        configuration,
        preview: previewFilmCsvImport(selected.session, selected.source, configuration),
      }
    })
  }

  const selectFilmsImportCandidate = (candidateId: string | null) => {
    setSelectedFilmsImport((selected) => {
      if (!selected) return selected
      if (candidateId === null) {
        return {
          ...selected,
          selectedCandidateId: null,
          session: null,
          configuration: null,
          preview: null,
        }
      }
      const session = prepareFilmCsvImport(selected.source, candidateId)
      const configuration = initialFilmImportConfiguration(session)
      return {
        ...selected,
        selectedCandidateId: candidateId,
        session,
        configuration,
        preview: previewFilmCsvImport(session, selected.source, configuration),
      }
    })
  }

  const confirmFilmsImport = async () => {
    if (!selectedFilmsImport?.preview || !beginImport('films')) return

    setFilmsImportError(null)
    try {
      const importedLibrary = await confirmValidatedImport(
        selectedFilmsImport.preview,
        (document) => filmsRepository.importLibrary(document),
      )
      onImported(importedLibrary)
      setFilmsImportReport({
        fileName: conciseFilmImportReportSource(
          selectedFilmsImport.source,
          selectedFilmsImport.selectedCandidateId,
        ),
        profileName: importedLibrary.profile.name,
        filmCount: importedLibrary.films.length,
      })
      setSelectedFilmsImport(null)
    } catch (error) {
      console.error('Impossible d’importer les Films CSV ou Notion validés.', error)
      setFilmsImportError('L’import SQLite a échoué. La transaction a été annulée et aucun profil incomplet n’a été conservé.')
    } finally {
      finishImport()
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

  const openTransferDialog = (dialog: TransferDialog) => {
    setTransferDialog(dialog)
    if (dialog === 'import') {
      setImportKind(null)
      setFilmsImportStep('source')
    } else {
      setExportKind(null)
    }
  }

  const closeTransferDialog = () => {
    if (importInProgress) return
    setTransferDialog(null)
    setImportKind(null)
    setExportKind(null)
    setSelectedImport(null)
    setSelectedFilmsImport(null)
    setImportError(null)
    setFilmsImportError(null)
    setReport(null)
    setFilmsImportReport(null)
    setFilmsImportStep('source')
  }

  const resetImportChoice = () => {
    if (importInProgress) return
    setImportKind(null)
    setSelectedImport(null)
    setSelectedFilmsImport(null)
    setImportError(null)
    setFilmsImportError(null)
    setReport(null)
    setFilmsImportReport(null)
    setFilmsImportStep('source')
  }

  return (
    <>
      <main className="main portability-main">
        <div className="portability-heading">
          <p className="eyebrow">Réglages locaux</p>
          <h1 className="display-title">Paramètres</h1>
        </div>

        {section === 'profiles' && (
          <section className="settings-page" aria-labelledby="profiles-title">
            <div className="settings-section-heading">
              <p className="card-kicker">Bibliothèque locale</p>
              <h2 id="profiles-title">Profils</h2>
              <p>Ouvrez un profil existant. Le profil courant reste toujours indiqué.</p>
            </div>
            <div className="portability-card profile-card">
              <div className="portability-card-heading">
                <div><p className="card-kicker">Profil actif</p><h3>Profil courant</h3></div>
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
                      <span><b>{profile.name}</b><small>{profile.filmCount} {profile.filmCount === 1 ? 'film' : 'films'}</small></span>
                      <span>{active ? 'Ouvert' : switchingProfileId === profile.id ? 'Ouverture…' : 'Ouvrir'}</span>
                    </button>
                  )
                })}
              </div>
              {profileError && <p className="inline-report error" role="alert">{profileError}</p>}
            </div>
          </section>
        )}

        {section === 'transfer' && (
          <section className="settings-page" aria-labelledby="transfer-title">
            <div className="settings-section-heading">
              <p className="card-kicker">Formats portables</p>
              <h2 id="transfer-title">Importer et exporter</h2>
              <p>Choisissez une intention. Chaque parcours se poursuit dans son propre espace de travail et le profil ouvert reste intact avant confirmation.</p>
            </div>
            <div className="transfer-choice-grid" role="group" aria-label="Choisir une action de portabilité">
              <button className="transfer-choice" type="button" onClick={() => openTransferDialog('import')}>
                <span className="card-kicker">Ajouter une bibliothèque</span>
                <b>Importer</b>
                <small>Bibliothèque Sylloge complète JSON ou bibliothèque Films externe CSV/Notion.</small>
              </button>
              <button className="transfer-choice" type="button" onClick={() => openTransferDialog('export')}>
                <span className="card-kicker">Conserver une copie</span>
                <b>Exporter</b>
                <small>Sauvegarde Sylloge JSON ou tableau Films CSV.</small>
              </button>
            </div>
          </section>
        )}

        {section === 'backups' && (
          <section className="settings-page" aria-labelledby="backup-title">
            <div className="settings-section-heading">
              <p className="card-kicker">Copies automatiques</p>
              <h2 id="backup-title">Sauvegardes</h2>
              <p>Les sauvegardes automatiques restent séparées des imports et exports. Elles ne copient jamais la base SQLite active.</p>
            </div>
            <section className="portability-card backup-card">
              <div className="portability-card-heading"><div><p className="card-kicker">Dossier local</p><h3>Sauvegardes automatiques</h3></div></div>
              <p>Choisissez un dossier local. Il peut déjà être synchronisé par votre propre service, mais Sylloge ne copie jamais la base SQLite active.</p>
              {loadingBackupSettings ? (
                <p className="backup-state" role="status">Lecture du réglage local…</p>
              ) : backupSettings ? (
                <>
                  <dl className="backup-summary">
                    <div><dt>Dossier</dt><dd title={backupSettings.backupDirectory}>{backupSettings.backupDirectory}</dd></div>
                    <div><dt>Automatique</dt><dd>{backupSettings.lastAutomaticSnapshotDay ?? 'Pas encore créé'}</dd></div>
                    <div><dt>Conservation</dt><dd>30 snapshots par profil</dd></div>
                  </dl>
                  <p className="backup-policy">Un snapshot est tenté après le premier changement réussi de ce profil chaque jour local. « Sauvegarder maintenant » crée toujours un nouveau JSON.</p>
                  <div className="backup-actions">
                    <button className="primary-button" type="button" onClick={saveManualBackup} disabled={savingBackup || choosingBackupDirectory}>{savingBackup ? 'Sauvegarde…' : 'Sauvegarder maintenant'}</button>
                    <button className="secondary-button" type="button" onClick={chooseBackupDirectory} disabled={savingBackup || choosingBackupDirectory}>{choosingBackupDirectory ? 'Choix du dossier…' : 'Changer de dossier'}</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="backup-state">Les sauvegardes automatiques sont inactives pour ce profil tant qu’aucun dossier local n’est choisi.</p>
                  <button className="primary-button" type="button" onClick={chooseBackupDirectory} disabled={choosingBackupDirectory}>{choosingBackupDirectory ? 'Choix du dossier…' : 'Choisir un dossier de sauvegarde'}</button>
                </>
              )}
              {backupMessage && <p className={`inline-report ${backupMessage.kind === 'error' ? 'error' : ''}`} role={backupMessage.kind === 'error' ? 'alert' : 'status'}>{backupMessage.message}</p>}
            </section>
          </section>
        )}

        {section === 'application' && (
          <section className="settings-page settings-information" aria-labelledby="application-title">
            <div className="settings-section-heading"><p className="card-kicker">Fonctionnement local</p><h2 id="application-title">Application</h2></div>
            <UpdaterSettings availableUpdate={availableUpdate} onUpdateAvailable={onUpdateAvailable} onUpdateHandled={onUpdateHandled} />
            <dl className="settings-facts"><div><dt>Données</dt><dd>La bibliothèque reste enregistrée localement dans SQLite.</dd></div></dl>
          </section>
        )}

        {section === 'about' && (
          <section className="settings-page settings-information" aria-labelledby="about-title">
            <div className="settings-section-heading"><p className="card-kicker">Sylloge</p><h2 id="about-title">À propos</h2></div>
            <dl className="settings-facts">
              <div><dt>Application</dt><dd>Sylloge</dd></div>
              <div><dt>Version installée</dt><dd>{installedVersion ?? 'Indisponible'}</dd></div>
              <div><dt>Collection disponible</dt><dd>Films</dd></div>
            </dl>
          </section>
        )}
      </main>

      {transferDialog === 'import' && (
        <AccessibleDialog title="Importer une bibliothèque" description="Choisissez un format, vérifiez les données et confirmez avant toute écriture." onClose={closeTransferDialog} closeDisabled={importInProgress}>
          <ImportAssistant
            kind={importKind}
            selectedImport={selectedImport}
            selectedFilmsImport={selectedFilmsImport}
            importing={importing}
            importingFilms={importingFilms}
            disabled={importInProgress}
            choosingImport={choosingImport}
            choosingFilmsImport={choosingFilmsImport}
            importError={importError}
            filmsImportError={filmsImportError}
            report={report}
            filmsImportReport={filmsImportReport}
            filmsImportStep={filmsImportStep}
            onChooseJson={chooseImport}
            onChooseFilms={chooseFilmsImport}
            onReset={resetImportChoice}
            onCandidateChange={selectFilmsImportCandidate}
            onConfigurationChange={updateFilmsImportConfiguration}
            onStepChange={setFilmsImportStep}
            onConfirmJson={confirmImport}
            onConfirmFilms={confirmFilmsImport}
          />
        </AccessibleDialog>
      )}

      {transferDialog === 'export' && (
        <AccessibleDialog title="Exporter la bibliothèque" description="Choisissez un format avant de créer une copie lisible de votre bibliothèque locale." onClose={closeTransferDialog} closeDisabled={exportState === 'saving' || csvExportState === 'saving'}>
          <ExportAssistant
            library={library}
            kind={exportKind}
            exportState={exportState}
            csvExportState={csvExportState}
            exportMessage={exportMessage}
            csvExportMessage={csvExportMessage}
            onKindChange={setExportKind}
            onExportJson={exportProfile}
            onExportCsv={exportProfileCsv}
          />
        </AccessibleDialog>
      )}
    </>
  )
}

function ImportPreviewPanel({ selected, importing, disabled, onConfirm }: {
  selected: SelectedImport
  importing: boolean
  disabled: boolean
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
          <button className="primary-button" type="button" disabled={disabled} onClick={onConfirm}>
            {importing ? 'Import en cours…' : disabled ? 'Un autre import est en cours…' : 'Créer le nouveau profil et importer'}
          </button>
        </div>
      )}
    </div>
  )
}

function AccessibleDialog({
  title,
  description,
  closeDisabled,
  onClose,
  children,
}: {
  title: string
  description: string
  closeDisabled: boolean
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    return () => returnFocusRef.current?.focus()
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const focusableElements = () => [...dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )]
    const keepFocusInDialog = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!closeDisabled) onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = focusableElements()
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const activeElement = document.activeElement
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!dialog.contains(activeElement) || activeElement === dialog || !focusable.includes(activeElement as HTMLElement)) {
        event.preventDefault()
        const destination = event.shiftKey ? last : first
        destination.focus()
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', keepFocusInDialog, true)
    if (closeDisabled && focusableElements().length === 0) dialog.focus()
    return () => document.removeEventListener('keydown', keepFocusInDialog, true)
  }, [closeDisabled, onClose])

  return (
    <div className="transfer-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !closeDisabled) onClose()
    }}>
      <div className="transfer-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title" aria-describedby="transfer-dialog-description" tabIndex={-1}>
        <header className="transfer-dialog-header">
          <div><p className="card-kicker">Assistant local</p><h2 id="transfer-dialog-title">{title}</h2><p id="transfer-dialog-description">{description}</p></div>
          <button className="dialog-close" ref={closeButtonRef} type="button" disabled={closeDisabled} onClick={onClose} aria-label="Fermer l’assistant">Fermer</button>
        </header>
        {children}
      </div>
    </div>
  )
}

function ImportAssistant({
  kind,
  selectedImport,
  selectedFilmsImport,
  importing,
  importingFilms,
  disabled,
  choosingImport,
  choosingFilmsImport,
  importError,
  filmsImportError,
  report,
  filmsImportReport,
  filmsImportStep,
  onChooseJson,
  onChooseFilms,
  onReset,
  onCandidateChange,
  onConfigurationChange,
  onStepChange,
  onConfirmJson,
  onConfirmFilms,
}: {
  kind: ImportKind
  selectedImport: SelectedImport | null
  selectedFilmsImport: SelectedFilmsImport | null
  importing: boolean
  importingFilms: boolean
  disabled: boolean
  choosingImport: boolean
  choosingFilmsImport: boolean
  importError: string | null
  filmsImportError: string | null
  report: ImportReport | null
  filmsImportReport: ImportReport | null
  filmsImportStep: FilmsImportStep
  onChooseJson: () => Promise<void>
  onChooseFilms: () => Promise<void>
  onReset: () => void
  onCandidateChange: (candidateId: string | null) => void
  onConfigurationChange: (update: (configuration: FilmImportConfiguration) => FilmImportConfiguration) => void
  onStepChange: (step: FilmsImportStep) => void
  onConfirmJson: () => Promise<void>
  onConfirmFilms: () => Promise<void>
}) {
  if (kind === null) {
    return (
      <div className="assistant-content">
        <AssistantSteps active="format" />
        <p className="assistant-introduction">Choisissez ce que vous souhaitez importer. Aucun profil ne sera créé avant votre confirmation finale.</p>
        <div className="assistant-choice-grid">
          <button className="transfer-choice" type="button" onClick={onChooseJson} disabled={choosingImport || disabled}>
            <span className="card-kicker">Bibliothèque Sylloge complète JSON</span>
            <b>Restaurer une sauvegarde</b>
            <small>Une bibliothèque Sylloge complète sera relue, vérifiée puis ajoutée dans un nouveau profil.</small>
          </button>
          <button className="transfer-choice" type="button" onClick={onChooseFilms} disabled={choosingFilmsImport || disabled}>
            <span className="card-kicker">Bibliothèque Films externe CSV/Notion</span>
            <b>Importer des Films</b>
            <small>Un tableau CSV ou un export Notion sera mappé avant la création d’un nouveau profil.</small>
          </button>
        </div>
      </div>
    )
  }

  if (kind === 'json') {
    return (
      <div className="assistant-content">
        <AssistantSteps active={selectedImport || report ? 'preview' : 'file'} />
        <div className="assistant-toolbar"><button className="secondary-button" type="button" onClick={onReset} disabled={disabled}>Choisir un autre format</button></div>
        {!selectedImport && !report && (
          <section className="assistant-stage">
            <p className="card-kicker">Bibliothèque Sylloge complète JSON</p>
            <h3>Choisir une sauvegarde Sylloge</h3>
            <p>Le fichier sera vérifié localement. Le profil ouvert ne sera jamais remplacé ou fusionné.</p>
            <button className="primary-button" type="button" onClick={onChooseJson} disabled={choosingImport || disabled}>{choosingImport ? 'Choix du fichier…' : 'Choisir le fichier JSON'}</button>
          </section>
        )}
        {selectedImport && <ImportPreviewPanel selected={selectedImport} importing={importing} disabled={disabled} onConfirm={onConfirmJson} />}
        {importError && <p className="inline-report error" role="alert">{importError}</p>}
        {report && <ImportReportPanel report={report} />}
      </div>
    )
  }

  return (
    <div className="assistant-content">
      <AssistantSteps active={filmsImportStep} />
      <div className="assistant-toolbar"><button className="secondary-button" type="button" onClick={onReset} disabled={disabled}>Choisir un autre format</button></div>
      {!selectedFilmsImport && !filmsImportReport && (
        <section className="assistant-stage">
          <p className="card-kicker">Bibliothèque Films externe CSV/Notion</p>
          <h3>Choisir un CSV ou un export Notion</h3>
          <p>Les colonnes seront affichées, y compris celles qui ne seront pas importées. Rien n’est écrit à cette étape.</p>
          <button className="primary-button" type="button" onClick={onChooseFilms} disabled={choosingFilmsImport || disabled}>{choosingFilmsImport ? 'Choix du fichier…' : 'Choisir le fichier'}</button>
        </section>
      )}
      {selectedFilmsImport && !filmsImportReport && (
        <FilmsImportAssistant
          selected={selectedFilmsImport}
          importing={importingFilms}
          disabled={disabled}
          step={filmsImportStep}
          onCandidateChange={onCandidateChange}
          onConfigurationChange={onConfigurationChange}
          onStepChange={onStepChange}
          onConfirm={onConfirmFilms}
        />
      )}
      {filmsImportError && <p className="inline-report error" role="alert">{filmsImportError}</p>}
      {filmsImportReport && <ImportReportPanel report={filmsImportReport} />}
    </div>
  )
}

function AssistantSteps({ active }: { active: 'format' | 'file' | FilmsImportStep }) {
  const current = active === 'format' ? 1 : active === 'file' || active === 'source' ? 2 : active === 'mapping' ? 3 : 4
  return (
    <ol className="assistant-steps" aria-label="Étapes de l’assistant">
      {['Format', 'Source', 'Mapping', 'Aperçu'].map((label, index) => <li className={index + 1 === current ? 'active' : index + 1 < current ? 'complete' : ''} key={label}>{label}</li>)}
    </ol>
  )
}

function FilmsImportAssistant({
  selected,
  importing,
  disabled,
  step,
  onCandidateChange,
  onConfigurationChange,
  onStepChange,
  onConfirm,
}: {
  selected: SelectedFilmsImport
  importing: boolean
  disabled: boolean
  step: FilmsImportStep
  onCandidateChange: (candidateId: string | null) => void
  onConfigurationChange: (update: (configuration: FilmImportConfiguration) => FilmImportConfiguration) => void
  onStepChange: (step: FilmsImportStep) => void
  onConfirm: () => Promise<void>
}) {
  const { configuration, preview, session, source, sourceSelection, selectedCandidateId } = selected
  const valid = preview !== null && preview.document !== null && preview.errors.length === 0
  const nextStep = session?.kind === 'generic' ? 'mapping' : 'preview'

  if (step === 'source') {
    return (
      <section className="assistant-stage">
        <p className="card-kicker">Source</p>
        <h3>Fichier et table retenue</h3>
        <dl className="assistant-source-summary">
          <div><dt>Fichier</dt><dd>{source.kind === 'notion' ? 'Archive Notion sélectionnée' : 'Fichier CSV sélectionné'}</dd></div>
          <div><dt>Table</dt><dd>{selectedCandidateId ? sourceSelection.candidates.find((candidate) => candidate.id === selectedCandidateId)?.label ?? 'À choisir' : 'À choisir'}</dd></div>
        </dl>
        {sourceSelection.selectionRequired && (
          <label className="films-import-profile-name">
            <span>Table à importer</span>
            <select value={selectedCandidateId ?? ''} disabled={disabled} onChange={(event) => onCandidateChange(event.target.value || null)}>
              <option value="">Choisir une table</option>
              {sourceSelection.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
            </select>
          </label>
        )}
        <p className="films-import-details">{sourceSelection.automaticSelectionMessage ?? (sourceSelection.selectionRequired ? 'Cette archive contient plusieurs tables. Choisissez celle à prévisualiser avant de continuer.' : 'La table disponible est retenue pour préparer votre import.')}</p>
        <div className="assistant-actions"><button className="primary-button" type="button" disabled={!session || disabled} onClick={() => onStepChange(nextStep)}>{session?.kind === 'generic' ? 'Régler le mapping' : 'Voir l’aperçu'}</button></div>
      </section>
    )
  }

  if (step === 'mapping' && session?.kind === 'generic' && configuration && preview) {
    return (
      <section className="assistant-stage">
        <p className="card-kicker">Mapping</p>
        <h3>Choisir où importer chaque colonne</h3>
        <p className="films-import-details">Seules vos données de suivi sont importées. Les métadonnées du film seront complétées plus tard.</p>
        <label className="films-import-profile-name">
          <span>Nouveau profil</span>
          <input type="text" value={configuration.profileName} disabled={disabled} onChange={(event) => onConfigurationChange((current) => ({ ...current, profileName: event.target.value }))} />
        </label>
        <SourceToDestinationMapping configuration={configuration} session={session} source={source} preview={preview} disabled={disabled} onConfigurationChange={onConfigurationChange} />
        <div className="assistant-actions">
          <button className="secondary-button" type="button" disabled={disabled} onClick={() => onStepChange('source')}>Retour à la source</button>
          <button className="primary-button" type="button" disabled={disabled} onClick={() => onStepChange('preview')}>Vérifier l’aperçu</button>
        </div>
      </section>
    )
  }

  return (
    <section className={`import-preview ${valid ? 'valid' : 'invalid'}`}>
      <div className="import-preview-heading"><div><p className="card-kicker">Aperçu avant écriture</p><h3>Import Films</h3></div><span>{valid ? 'Valide' : 'Import bloqué'}</span></div>
      {preview ? <FilmsImportPreviewSummary preview={preview} importing={importing} disabled={disabled} onConfirm={onConfirm} /> : <p className="inline-report error" role="alert">La table doit être choisie avant de pouvoir créer un aperçu.</p>}
      <div className="assistant-actions"><button className="secondary-button" type="button" disabled={disabled} onClick={() => onStepChange(session?.kind === 'generic' ? 'mapping' : 'source')}>Modifier</button></div>
    </section>
  )
}

function SourceToDestinationMapping({
  configuration,
  session,
  source,
  preview,
  disabled,
  onConfigurationChange,
}: {
  configuration: FilmImportConfiguration
  session: Extract<FilmImportSession, { kind: 'generic' }>
  source: SelectedFilmsImport['source']
  preview: FilmsCsvImportPreview
  disabled: boolean
  onConfigurationChange: (update: (configuration: FilmImportConfiguration) => FilmImportConfiguration) => void
}) {
  const sources: Array<{ source: FilmImportSource; label: string; detail: string }> = session.headers.map((header) => {
    const restriction = filmImportSourceRestriction(header)
    return {
      source: header,
      label: header,
      detail: restriction === 'metadata'
        ? 'Métadonnée récupérée plus tard, non importée'
        : restriction === 'future-feature'
          ? 'Fonctionnalité future, non importée'
          : 'Colonne du tableau sélectionné',
    }
  })
  if (source.kind === 'notion' && source.markdownPages.length > 0) {
    sources.push({ source: NOTION_MARKDOWN_NOTES_SOURCE, label: 'Pages Notion « Notes »', detail: 'Contenu texte associé, distinct d’une évaluation chiffrée' })
  }
  const detectedScaleLabel = {
    none: 'Aucune évaluation détectée',
    ambiguous: 'Échelle ambiguë',
    mixed: 'Échelles mélangées',
    5: '/5 détectée',
    10: '/10 détectée',
  }[preview.detectedRatingScale]

  return (
    <div className="source-destination-mapping" aria-label="Mapping source vers Sylloge">
      <div className="source-destination-header" aria-hidden="true"><span>Détecté dans votre fichier</span><span>→</span><span>Importer dans Sylloge</span></div>
      {sources.map(({ source: sourceValue, label, detail }) => {
        const destination = filmImportDestinationForSource(configuration, sourceValue)
        const isMarkdownNotes = sourceValue === NOTION_MARKDOWN_NOTES_SOURCE
        const isRatingSource = !isMarkdownNotes && isFilmImportRatingSource(sourceValue)
        const fixedNotImported = !isMarkdownNotes && filmImportSourceRestriction(sourceValue) !== null
        const availableDestinations: readonly ImportableFilmField[] = isMarkdownNotes
          ? ['personalNote']
          : isRatingSource
            ? ['rating']
            : IMPORTABLE_FILM_FIELDS
        return (
          <div className="source-destination-row" key={sourceValue}>
            <div><b>{label}</b><small>{detail}</small></div>
            <span className="mapping-arrow" aria-hidden="true">→</span>
            <label>
              <span className="visually-hidden">Destination Sylloge de {label}</span>
              <select value={fixedNotImported ? '' : destination ?? ''} disabled={disabled || fixedNotImported} onChange={(event) => onConfigurationChange((current) => setFilmImportSourceDestination(
                current,
                sourceValue,
                event.target.value === '' ? null : event.target.value as ImportableFilmField,
              ))}>
                <option value="">Ne pas importer</option>
                {availableDestinations.map((field) => <option key={field} value={field}>{FILM_IMPORT_FIELD_LABELS[field]}</option>)}
              </select>
            </label>
          </div>
        )
      })}
      {configuration.mapping.rating && preview.detectedRatingScale !== 'none' && (
        <label className="films-import-rating-scale">
          <span>Évaluation : {detectedScaleLabel}</span>
          <select value={configuration.ratingScale ?? ''} disabled={disabled} onChange={(event) => onConfigurationChange((current) => ({ ...current, ratingScale: event.target.value === '5' || event.target.value === '10' ? Number(event.target.value) as 5 | 10 : null }))}>
            <option value="">Choisir l’échelle</option><option value="5">/5</option><option value="10">/10</option>
          </select>
        </label>
      )}
      {preview.detectedRatingScale === 10 && <p className="films-import-details"><b>Conversion proposée :</b> les évaluations /10 seront normalisées vers l’échelle Sylloge /5 par demi-points.</p>}
    </div>
  )
}

function FilmsImportPreviewSummary({ preview, importing, disabled, onConfirm }: { preview: FilmsCsvImportPreview; importing: boolean; disabled: boolean; onConfirm: () => Promise<void> }) {
  const valid = preview.document !== null && preview.errors.length === 0
  return (
    <>
      <dl className="transfer-summary compact films-import-summary">
        <div><dt>Format</dt><dd>{preview.sourceKind === 'notion' ? 'Bibliothèque Films Notion' : preview.sourceKind === 'csv' ? 'Bibliothèque Films CSV' : 'Bibliothèque Films Sylloge CSV'}</dd></div><div><dt>Lignes lues</dt><dd>{preview.totalFilmCount}</dd></div><div><dt>Convertibles</dt><dd>{preview.validFilmCount}</dd></div><div><dt>Erreurs</dt><dd>{preview.errors.length}</dd></div>
      </dl>
      {preview.ignoredColumns.length > 0 && <p className="films-import-details"><b>Colonnes visibles mais ignorées :</b> {preview.ignoredColumns.join(', ')}. Elles restent sur « Ne pas importer » et ne sont pas remplacées par une autre donnée.</p>}
      {preview.warnings.length > 0 && <div className="films-import-warnings" role="status"><p>Éléments non associés</p><ul>{preview.warnings.map((warning, index) => <li key={`${warning.path}-${index}`}><code>{warning.path}</code> {warning.message}</li>)}</ul></div>}
      {preview.errors.length > 0 ? (
        <div className="validation-errors" role="alert"><p>Aucune donnée n’a été écrite. Corrigez le mapping ou le fichier avant de réessayer.</p><ol>{preview.errors.map((error, index) => <li key={`${error.path}-${index}`}><code>{error.path}</code> {error.message}</li>)}</ol></div>
      ) : (
        <div className="import-confirmation"><p>Confirmez la création d’un nouveau profil « {preview.document?.profile.name} » avec {preview.validFilmCount} {preview.validFilmCount === 1 ? 'film' : 'films'}. Le profil ouvert reste intact et aucune donnée n’a été écrite avant cette confirmation.</p><button className="primary-button" type="button" disabled={disabled || !valid} onClick={onConfirm}>{importing ? 'Import en cours…' : disabled ? 'Un autre import est en cours…' : 'Créer le nouveau profil et importer'}</button></div>
      )}
    </>
  )
}

function ExportAssistant({ library, kind, exportState, csvExportState, exportMessage, csvExportMessage, onKindChange, onExportJson, onExportCsv }: {
  library: FilmLibrary
  kind: 'json' | 'csv' | null
  exportState: 'idle' | 'saving'
  csvExportState: 'idle' | 'saving'
  exportMessage: string | null
  csvExportMessage: string | null
  onKindChange: (kind: 'json' | 'csv' | null) => void
  onExportJson: () => Promise<void>
  onExportCsv: () => Promise<void>
}) {
  if (kind === null) {
    return <div className="assistant-content"><AssistantSteps active="format" /><p className="assistant-introduction">Choisissez le format de votre copie locale.</p><div className="assistant-choice-grid"><button className="transfer-choice" type="button" onClick={() => onKindChange('json')}><span className="card-kicker">Sauvegarde Sylloge JSON</span><b>Bibliothèque complète</b><small>Une copie lisible de la bibliothèque Sylloge complète, à restaurer plus tard dans un nouveau profil.</small></button><button className="transfer-choice" type="button" onClick={() => onKindChange('csv')}><span className="card-kicker">Tableau Films CSV</span><b>Ouvrir dans un tableur</b><small>Un tableau Films sans téléchargement d’affiches ni ajout de données.</small></button></div></div>
  }
  const isJson = kind === 'json'
  const saving = isJson ? exportState === 'saving' : csvExportState === 'saving'
  const message = isJson ? exportMessage : csvExportMessage
  const title = isJson ? 'Sauvegarde Sylloge JSON' : 'Tableau Films CSV'
  const action = isJson ? onExportJson : onExportCsv
  return (
    <div className="assistant-content"><AssistantSteps active="preview" /><section className="assistant-stage"><p className="card-kicker">{title}</p><h3>Vérifier avant l’export</h3><dl className="transfer-summary"><div><dt>Profil</dt><dd>{library.profile.name}</dd></div><div><dt>Films</dt><dd>{library.films.length}</dd></div><div><dt>Destination</dt><dd>{isJson ? 'Bibliothèque Sylloge complète' : 'Tableau Films'}</dd></div></dl><p>{isJson ? 'Le choix de l’emplacement ouvrira ensuite la confirmation d’enregistrement.' : 'Le choix de l’emplacement ouvrira ensuite la confirmation d’enregistrement du tableau.'}</p><div className="assistant-actions"><button className="secondary-button" type="button" disabled={saving} onClick={() => onKindChange(null)}>Changer de format</button><button className="primary-button" type="button" disabled={saving} onClick={action}>{saving ? 'Choix du fichier…' : 'Choisir l’emplacement et exporter'}</button></div>{message && <p className="inline-report" role="status">{message}</p>}</section></div>
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
