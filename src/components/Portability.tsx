import { useEffect, useRef, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { backupService, type BackupNotice } from '../data/backupService.ts'
import { validateLibraryImport, type ImportPreview } from '../domain/libraryTransfer.ts'
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
import type { FilmLibrary } from '../data/filmsRepository.ts'
import { filmsRepository } from '../data/filmsRepository.ts'
import { profilesRepository, type ProfileSummary } from '../data/profilesRepository.ts'
import { confirmValidatedImport } from '../data/libraryTransferService.ts'
import { libraryRepository, type CulturalLibrary } from '../data/libraryRepository.ts'
import {
  createLibraryDocument,
  libraryExportFileName,
  serializeLibraryDocument,
  validateLibraryDocument,
} from '../domain/libraryDocument.ts'
import {
  pickImportJson,
  pickImportFilmsCsvOrNotion,
  saveExportJson,
  type BackupSettings,
  type PickedFilmsImportFile,
} from '../data/nativePortability.ts'
import { UpdaterSettings } from './UpdaterSettings.tsx'
import { AccessibleDialog } from './AccessibleDialog.tsx'
import { LibraryExportButton } from './LibraryExportButton.tsx'
import { LibraryCsvExportButton } from './LibraryCsvExportButton.tsx'
import { LibraryImportButton } from './LibraryImportButton.tsx'
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
  onProfilesChanged: () => void
  onProfileDeleted: (deletedProfileId: string) => void
  onLibraryChanged: () => void
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
  onProfilesChanged,
  onProfileDeleted,
  onLibraryChanged,
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
  const [clearingBackupSettings, setClearingBackupSettings] = useState(false)
  const [backupMessage, setBackupMessage] = useState<BackupNotice | null>(null)
  const [installedVersion, setInstalledVersion] = useState<string | null>(null)
  const [transferDialog, setTransferDialog] = useState<TransferDialog | null>(null)
  const [importKind, setImportKind] = useState<ImportKind>(null)
  const [filmsImportStep, setFilmsImportStep] = useState<FilmsImportStep>('source')
  const [exportKind, setExportKind] = useState<'json' | 'csv' | null>(null)
  const [fullLibrary, setFullLibrary] = useState<CulturalLibrary | null>(null)
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
            message: 'Le réglage de sauvegarde n’a pas pu être lu. Les cinq collections restent disponibles dans SQLite.',
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

  useEffect(() => {
    let cancelled = false
    libraryRepository.loadLibrary(library.profile.id).then(
      (loaded) => {
        if (!cancelled) setFullLibrary(loaded)
      },
      (error: unknown) => {
        console.error('Impossible de lire les collections pour les actions de portabilité.', error)
        if (!cancelled) setFullLibrary(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [library.profile.id])


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

  const forgetBackupDirectory = async () => {
    if (clearingBackupSettings) return
    setClearingBackupSettings(true)
    setBackupMessage(null)
    try {
      await backupService.clearSettings(library.profile.id)
      const notice: BackupNotice = {
        kind: 'success',
        message: 'Snapshots désactivés pour ce profil. Les fichiers déjà présents dans l’ancien dossier sont conservés.',
      }
      setBackupSettings(null)
      setBackupMessage(notice)
      onBackupNotice(notice)
    } catch (error) {
      console.error('Impossible de désactiver les snapshots.', error)
      const notice: BackupNotice = {
        kind: 'error',
        message: 'Le dossier n’a pas pu être oublié. Le réglage précédent reste actif.',
      }
      setBackupMessage(notice)
      onBackupNotice(notice)
    } finally {
      setClearingBackupSettings(false)
    }
  }

  return (
    <>
      <main className="main portability-main">
        <div className="portability-heading">
          <p className="eyebrow">Réglages locaux</p>
          <h1 className="display-title">Paramètres</h1>
        </div>

        {section === 'profiles' && (
          <ProfilesSection
            library={library}
            profiles={profiles}
            switchingProfileId={switchingProfileId}
            profileError={profileError}
            onSwitchProfile={switchProfile}
            onProfilesChanged={onProfilesChanged}
            onProfileDeleted={onProfileDeleted}
          />
        )}

        {section === 'transfer' && (
          <GlobalTransferSection
            library={library}
            fullLibrary={fullLibrary}
            onImported={onImported}
            onProfilesChanged={onProfilesChanged}
            onLibraryChanged={onLibraryChanged}
          />
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
                    <div><dt>État</dt><dd>{backupSettings.directoryAvailable ? 'Disponible' : 'Dossier introuvable'}</dd></div>
                    <div><dt>Automatique</dt><dd>{backupSettings.lastAutomaticSnapshotDay ?? 'Pas encore créé'}</dd></div>
                    <div><dt>Conservation</dt><dd>30 snapshots par profil</dd></div>
                  </dl>
                  {!backupSettings.directoryAvailable && (
                    <p className="inline-report error" role="alert">Ce dossier n’existe plus ou n’est plus accessible. Choisis un autre dossier ou oublie ce réglage.</p>
                  )}
                  <p className="backup-policy">Un snapshot est tenté après le premier changement réussi de ce profil chaque jour local. « Sauvegarder maintenant » crée toujours un nouveau JSON.</p>
                  <div className="backup-actions">
                    <button className="primary-button" type="button" onClick={saveManualBackup} disabled={!backupSettings.directoryAvailable || savingBackup || choosingBackupDirectory || clearingBackupSettings}>{savingBackup ? 'Sauvegarde…' : 'Sauvegarder maintenant'}</button>
                    <button className="secondary-button" type="button" onClick={chooseBackupDirectory} disabled={savingBackup || choosingBackupDirectory || clearingBackupSettings}>{choosingBackupDirectory ? 'Choix du dossier…' : 'Changer de dossier'}</button>
                    <button className="secondary-button danger" type="button" onClick={() => void forgetBackupDirectory()} disabled={savingBackup || choosingBackupDirectory || clearingBackupSettings}>{clearingBackupSettings ? 'Désactivation…' : 'Oublier ce dossier'}</button>
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
            <dl className="settings-facts">
              <div><dt>Données</dt><dd>La bibliothèque reste enregistrée localement dans SQLite.</dd></div>
              <div><dt>Métadonnées Films</dt><dd>Enrichissement TMDB intégré et activé, sans clé à configurer. Les présentations sont mises en cache localement et renouvelées automatiquement ; elles ne sont jamais exportées avec vos données personnelles.</dd></div>
            </dl>
          </section>
        )}

        {section === 'about' && (
          <section className="settings-page settings-information" aria-labelledby="about-title">
            <div className="settings-section-heading"><p className="card-kicker">Sylloge</p><h2 id="about-title">À propos</h2></div>
            <dl className="settings-facts">
              <div><dt>Application</dt><dd>Sylloge</dd></div>
              <div><dt>Version installée</dt><dd>{installedVersion ?? 'Indisponible'}</dd></div>
              <div><dt>Collections disponibles</dt><dd>Films, Séries, Livres, Jeux et Art</dd></div>
              <div><dt>Métadonnées Films</dt><dd>Ce produit utilise l’API TMDB sans être approuvé ni certifié par TMDB. <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">themoviedb.org</a></dd></div>
            </dl>
          </section>
        )}
      </main>

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
            <span className="card-kicker">Bibliothèque Films externe CSV/ZIP</span>
            <b>Importer des Films</b>
            <small>Un tableau CSV ou une archive ZIP compatible sera mappé avant la création d’un nouveau profil.</small>
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
          <p className="card-kicker">Bibliothèque Films externe CSV/ZIP</p>
          <h3>Choisir un CSV ou une archive ZIP</h3>
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
          <div><dt>Fichier</dt><dd>{source.kind === 'notion' ? 'Archive ZIP compatible sélectionnée' : 'Fichier CSV sélectionné'}</dd></div>
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
    sources.push({ source: NOTION_MARKDOWN_NOTES_SOURCE, label: 'Pages de notes associées', detail: 'Contenu texte associé, distinct d’une évaluation chiffrée' })
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
        <div><dt>Format</dt><dd>{preview.sourceKind === 'notion' ? 'Archive ZIP compatible' : preview.sourceKind === 'csv' ? 'Bibliothèque Films CSV' : 'Bibliothèque Films Sylloge CSV'}</dd></div><div><dt>Lignes lues</dt><dd>{preview.totalFilmCount}</dd></div><div><dt>Convertibles</dt><dd>{preview.validFilmCount}</dd></div><div><dt>Erreurs</dt><dd>{preview.errors.length}</dd></div>
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

// ---------------------------------------------------------------------------
// Jalon 0.4.4 — gestion des profils (créer, renommer, supprimer, ouvrir)
// ---------------------------------------------------------------------------

function profileWorksSummary(profile: ProfileSummary): string {
  const parts: string[] = []
  if (profile.filmCount > 0) parts.push(`${profile.filmCount} ${profile.filmCount === 1 ? 'film' : 'films'}`)
  if (profile.seriesCount > 0) parts.push(`${profile.seriesCount} ${profile.seriesCount === 1 ? 'série' : 'séries'}`)
  if (profile.bookCount > 0) parts.push(`${profile.bookCount} ${profile.bookCount === 1 ? 'livre' : 'livres'}`)
  if (profile.gameCount > 0) parts.push(`${profile.gameCount} ${profile.gameCount === 1 ? 'jeu' : 'jeux'}`)
  if (profile.artworkCount > 0) parts.push(`${profile.artworkCount} ${profile.artworkCount === 1 ? 'œuvre' : 'œuvres'}`)
  return parts.length > 0 ? parts.join(' · ') : 'Bibliothèque vide'
}

function profileTotalWorks(profile: ProfileSummary): number {
  return profile.filmCount + profile.seriesCount + profile.bookCount + profile.gameCount + profile.artworkCount
}

type ProfilesSectionProps = {
  library: FilmLibrary
  profiles: ProfileSummary[]
  switchingProfileId: string | null
  profileError: string | null
  onSwitchProfile: (profileId: string) => Promise<void>
  onProfilesChanged: () => void
  onProfileDeleted: (deletedProfileId: string) => void
}

function ProfilesSection({
  library,
  profiles,
  switchingProfileId,
  profileError,
  onSwitchProfile,
  onProfilesChanged,
  onProfileDeleted,
}: ProfilesSectionProps) {
  const [creating, setCreating] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingProfile, setDeletingProfile] = useState<ProfileSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const atProfileLimit = profiles.length >= 5

  const submitCreate = async () => {
    const name = newProfileName.trim()
    if (!name || busy) return
    setBusy(true)
    setError(null)
    try {
      await profilesRepository.create(name)
      setNewProfileName('')
      setCreating(false)
      onProfilesChanged()
    } catch (cause) {
      console.error('Impossible de créer le profil.', cause)
      setError(cause instanceof Error ? cause.message : 'Le profil n’a pas pu être créé.')
    } finally {
      setBusy(false)
    }
  }

  const submitRename = async (profileId: string) => {
    const name = renameValue.trim()
    if (!name || busy) return
    setBusy(true)
    setError(null)
    try {
      await profilesRepository.rename(profileId, name)
      setRenamingId(null)
      onProfilesChanged()
    } catch (cause) {
      console.error('Impossible de renommer le profil.', cause)
      setError(cause instanceof Error ? cause.message : 'Le profil n’a pas pu être renommé.')
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!deletingProfile || busy) return
    setBusy(true)
    setError(null)
    try {
      await profilesRepository.delete(deletingProfile.id)
      const deletedId = deletingProfile.id
      setDeletingProfile(null)
      onProfilesChanged()
      onProfileDeleted(deletedId)
    } catch (cause) {
      console.error('Impossible de supprimer le profil.', cause)
      setError(cause instanceof Error ? cause.message : 'Le profil n’a pas pu être supprimé.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-page" aria-labelledby="profiles-title">
      <div className="settings-section-heading">
        <p className="card-kicker">Bibliothèque locale</p>
        <h2 id="profiles-title">Profils</h2>
        <p>Un profil regroupe les cinq collections d’une même personne sur cet appareil. Ouvrez, créez, renommez ou supprimez un profil.</p>
      </div>
      <div className="portability-card profile-card">
        <div className="portability-card-heading">
          <div><p className="card-kicker">Profil actif</p><h3>Profil courant</h3></div>
          <span className="profile-badge">{library.profile.name}</span>
        </div>
        <div className="profile-list">
          {profiles.map((profile) => {
            const active = profile.id === library.profile.id
            const renaming = renamingId === profile.id
            return (
              <div className={`profile-row ${active ? 'active' : ''}`} key={profile.id}>
                {renaming ? (
                  <form
                    className="profile-rename-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void submitRename(profile.id)
                    }}
                  >
                    <label>
                      <span className="visually-hidden">Nouveau nom du profil</span>
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        maxLength={60}
                        autoFocus
                      />
                    </label>
                    <button className="primary-button" type="submit" disabled={busy || !renameValue.trim()}>Renommer</button>
                    <button className="secondary-button" type="button" disabled={busy} onClick={() => setRenamingId(null)}>Annuler</button>
                  </form>
                ) : (
                  <>
                    <span className="profile-row-identity">
                      <b>{profile.name}</b>
                      <small>{profileWorksSummary(profile)}</small>
                    </span>
                    <span className="profile-row-actions">
                      {active ? (
                        <span className="profile-active-label">Ouvert</span>
                      ) : (
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={busy || switchingProfileId !== null}
                          onClick={() => void onSwitchProfile(profile.id)}
                        >
                          {switchingProfileId === profile.id ? 'Ouverture…' : 'Ouvrir'}
                        </button>
                      )}
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setRenamingId(profile.id)
                          setRenameValue(profile.name)
                        }}
                      >
                        Renommer
                      </button>
                      <button
                        className="secondary-button danger"
                        type="button"
                        disabled={busy}
                        onClick={() => setDeletingProfile(profile)}
                      >
                        Supprimer
                      </button>
                    </span>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {creating ? (
          <form
            className="profile-create-form"
            onSubmit={(event) => {
              event.preventDefault()
              void submitCreate()
            }}
          >
            <label>
              <span className="visually-hidden">Nom du nouveau profil</span>
              <input
                type="text"
                value={newProfileName}
                onChange={(event) => setNewProfileName(event.target.value)}
                placeholder="Nom du profil"
                maxLength={60}
                autoFocus
              />
            </label>
            <button className="primary-button" type="submit" disabled={busy || !newProfileName.trim()}>Créer le profil</button>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => { setCreating(false); setNewProfileName('') }}>Annuler</button>
          </form>
        ) : (
          <button
            className="primary-button"
            type="button"
            disabled={busy || atProfileLimit}
            onClick={() => setCreating(true)}
          >
            Créer un profil
          </button>
        )}
        {atProfileLimit && !creating && (
          <p className="profile-limit-note">Le nombre maximal de 5 profils est atteint. Supprimez un profil pour en créer un autre.</p>
        )}

        {(error ?? profileError) && <p className="inline-report error" role="alert">{error ?? profileError}</p>}
      </div>

      {deletingProfile && (
        <AccessibleDialog
          title={`Supprimer le profil « ${deletingProfile.name} »`}
          description="Cette suppression est définitive."
          onClose={() => setDeletingProfile(null)}
          closeDisabled={busy}
        >
          <div className="assistant-content">
            <section className="assistant-stage">
              <p className="card-kicker">Confirmation requise</p>
              <h3>Supprimer définitivement ce profil ?</h3>
              <p>
                {profileTotalWorks(deletingProfile) > 0
                  ? `Ce profil contient ${profileWorksSummary(deletingProfile)}. Toutes ces fiches seront définitivement supprimées.`
                  : 'Ce profil ne contient aucune fiche.'}
                {deletingProfile.id === library.profile.id && (
                  <> Ce profil est actuellement ouvert : après suppression, Sylloge retournera à l’écran de premier lancement.</>
                )}
              </p>
              <div className="assistant-actions">
                <button className="secondary-button" type="button" disabled={busy} onClick={() => setDeletingProfile(null)}>Annuler</button>
                <button className="primary-button danger" type="button" disabled={busy} onClick={() => void confirmDelete()}>
                  {busy ? 'Suppression…' : 'Supprimer définitivement'}
                </button>
              </div>
            </section>
          </div>
        </AccessibleDialog>
      )}
    </section>
  )
}


// ---------------------------------------------------------------------------
// Jalon 0.4.4 — export/import global « format Sylloge » (5 collections)
// ---------------------------------------------------------------------------

type GlobalTransferSectionProps = {
  library: FilmLibrary
  fullLibrary: CulturalLibrary | null
  onImported: (library: FilmLibrary) => void
  onProfilesChanged: () => void
  onLibraryChanged: () => void
}

function GlobalTransferSection({ library, fullLibrary, onImported, onProfilesChanged, onLibraryChanged }: GlobalTransferSectionProps) {
  const [exportState, setExportState] = useState<'idle' | 'saving'>('idle')
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const exportGlobal = async () => {
    setExportState('saving')
    setExportMessage(null)
    try {
      const full = await libraryRepository.loadLibrary(library.profile.id)
      const document = createLibraryDocument(full)
      const savedName = await saveExportJson(
        libraryExportFileName(document.exportedAt),
        serializeLibraryDocument(document),
      )
      setExportMessage(savedName
        ? `Export JSON enregistré dans « ${savedName} » (${full.films.length} films, ${full.series.length} séries, ${full.books.length} livres, ${full.games.length} jeux, ${full.artworks.length} œuvres).`
        : 'Export annulé. Aucun fichier n’a été écrit.')
    } catch (error) {
      console.error('Impossible d’exporter la bibliothèque complète.', error)
      setExportMessage('L’export JSON a échoué. La bibliothèque locale n’a pas été modifiée.')
    } finally {
      setExportState('idle')
    }
  }

  const importGlobal = async () => {
    if (importing) return
    setImporting(true)
    setImportError(null)
    setImportMessage(null)
    try {
      const picked = await pickImportJson()
      if (!picked) {
        setImportMessage('Sélection annulée. Aucune donnée n’a été écrite.')
        return
      }

      // Détecte v2 (5 collections) puis v1 (Films historique).
      const previewV2 = validateLibraryDocument(picked.contents)
      if (previewV2.document !== null) {
        const full = await libraryRepository.loadLibrary(library.profile.id)
        const totalWorks = full.films.length + full.series.length + full.books.length + full.games.length + full.artworks.length
        if (totalWorks > 0) {
          setImportError('Ce JSON réunit les cinq collections et ne peut être importé que dans un profil vide. Créez un profil ou videz le profil courant avant de recommencer.')
          return
        }
        const imported = await libraryRepository.importLibraryDocumentIntoEmptyProfile(
          library.profile,
          previewV2.document,
        )
        onProfilesChanged()
        onImported({ profile: imported.profile, films: imported.films })
        setImportMessage(`Bibliothèque restaurée dans le profil courant « ${imported.profile.name} » : ${imported.films.length} films, ${imported.series.length} séries, ${imported.books.length} livres, ${imported.games.length} jeux, ${imported.artworks.length} œuvres.`)
        return
      }

      const previewV1 = validateLibraryImport(picked.contents)
      if (previewV1.document !== null) {
        const full = await libraryRepository.loadLibrary(library.profile.id)
        const totalWorks = full.films.length + full.series.length + full.books.length + full.games.length + full.artworks.length
        if (totalWorks > 0) {
          setImportError('Ce JSON réunit les cinq collections et ne peut être importé que dans un profil vide. Créez un profil ou videz le profil courant avant de recommencer.')
          return
        }
        const compatibleDocument = createLibraryDocument({
          profile: library.profile,
          films: previewV1.document.films,
          series: [],
          books: [],
          games: [],
          artworks: [],
        })
        const imported = await libraryRepository.importLibraryDocumentIntoEmptyProfile(
          library.profile,
          compatibleDocument,
        )
        onProfilesChanged()
        onImported({ profile: imported.profile, films: imported.films })
        setImportMessage(`Bibliothèque restaurée dans le profil courant « ${imported.profile.name} » : ${imported.films.length} ${imported.films.length === 1 ? 'film' : 'films'}.`)
        return
      }

      setImportError('Le fichier choisi n’est pas un JSON Sylloge valide (v1 ou v2). Aucune donnée n’a été écrite.')
    } catch (error) {
      console.error('L’import global a échoué.', error)
      setImportError('L’import a échoué. La transaction a été annulée et aucune bibliothèque incomplète n’a été conservée.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <section className="settings-page" aria-labelledby="transfer-title">
      <div className="settings-section-heading">
        <p className="card-kicker">Formats portables</p>
        <h2 id="transfer-title">Importer et exporter</h2>
        <p>Choisis une action locale. JSON déplace une collection ou les cinq collections ; CSV sert aux échanges tabulaires d’un médium ; Snapshots créent des copies JSON datées.</p>
      </div>

      <div className="portability-card">
        <div className="portability-card-heading">
          <div><p className="card-kicker">JSON</p><h3>Les cinq collections</h3></div>
        </div>
        <p>Ce fichier réunit Films, Séries, Livres, Jeux et Art dans le schéma JSON identifié et versionné de Sylloge. Il sert à déplacer toute la bibliothèque vers un profil vide.</p>
        <div className="backup-actions">
          <button className="primary-button" type="button" disabled={exportState === 'saving'} onClick={() => void exportGlobal()}>
            {exportState === 'saving' ? 'Export…' : 'Exporter JSON'}
          </button>
          <button className="secondary-button" type="button" disabled={importing} onClick={() => void importGlobal()}>
            {importing ? 'Lecture…' : 'Importer JSON'}
          </button>
        </div>
        {exportMessage && <p className="inline-report" role="status">{exportMessage}</p>}
        {importMessage && <p className="inline-report" role="status">{importMessage}</p>}
        {importError && <p className="inline-report error" role="alert">{importError}</p>}
      </div>

      <div className="portability-card">
        <div className="portability-card-heading">
          <div><p className="card-kicker">Collections</p><h3>Actions par médium</h3></div>
        </div>
        <p>Chaque bibliothèque reprend les mêmes actions que son écran : importer ou exporter son JSON. Le CSV reste proposé pour Films jusqu’à l’ouverture de son contrat multi-médiums.</p>
        {fullLibrary === null ? (
          <p className="backup-state" role="status">Lecture des collections locales…</p>
        ) : (
          <div className="transfer-media-grid">
            <section className="transfer-media-card" aria-labelledby="transfer-films-title">
              <h4 id="transfer-films-title">Films</h4>
              <p>JSON et CSV</p>
              <div className="backup-actions">
                <LibraryImportButton kind="films" buttonLabel="Importer" mediumLabel="film" profileId={fullLibrary.profile.id} profileName={fullLibrary.profile.name} existing={fullLibrary.films} onDone={onLibraryChanged} />
                <LibraryExportButton kind="films" profileId={fullLibrary.profile.id} />
                <LibraryCsvExportButton profileId={fullLibrary.profile.id} />
              </div>
            </section>
            <section className="transfer-media-card" aria-labelledby="transfer-series-title">
              <h4 id="transfer-series-title">Séries</h4>
              <p>JSON</p>
              <div className="backup-actions">
                <LibraryImportButton kind="series" buttonLabel="Importer" mediumLabel="série" profileId={fullLibrary.profile.id} profileName={fullLibrary.profile.name} existing={fullLibrary.series} onDone={onLibraryChanged} />
                <LibraryExportButton kind="series" profileId={fullLibrary.profile.id} />
              </div>
            </section>
            <section className="transfer-media-card" aria-labelledby="transfer-books-title">
              <h4 id="transfer-books-title">Livres</h4>
              <p>JSON, citations comprises</p>
              <div className="backup-actions">
                <LibraryImportButton kind="books" buttonLabel="Importer" mediumLabel="livre" profileId={fullLibrary.profile.id} profileName={fullLibrary.profile.name} existing={fullLibrary.books} onDone={onLibraryChanged} />
                <LibraryExportButton kind="books" profileId={fullLibrary.profile.id} />
              </div>
            </section>
            <section className="transfer-media-card" aria-labelledby="transfer-games-title">
              <h4 id="transfer-games-title">Jeux</h4>
              <p>JSON</p>
              <div className="backup-actions">
                <LibraryImportButton kind="games" buttonLabel="Importer" mediumLabel="jeu" profileId={fullLibrary.profile.id} profileName={fullLibrary.profile.name} existing={fullLibrary.games} onDone={onLibraryChanged} />
                <LibraryExportButton kind="games" profileId={fullLibrary.profile.id} />
              </div>
            </section>
            <section className="transfer-media-card" aria-labelledby="transfer-art-title">
              <h4 id="transfer-art-title">Art</h4>
              <p>JSON, sans note chiffrée</p>
              <div className="backup-actions">
                <LibraryImportButton kind="artworks" buttonLabel="Importer" mediumLabel="œuvre" profileId={fullLibrary.profile.id} profileName={fullLibrary.profile.name} existing={fullLibrary.artworks} onDone={onLibraryChanged} />
                <LibraryExportButton kind="artworks" profileId={fullLibrary.profile.id} />
              </div>
            </section>
          </div>
        )}
      </div>
    </section>
  )
}
