import { useEffect, useRef, useState } from 'react'
import { pickImportContainer, pickImportJson } from '../data/nativePortability.ts'
import { findBackupCandidates } from '../data/backupFiles.ts'
import { catalogBackupFiles, customLibrarySummary, PROFILE_LIBRARIES, PROFILE_LIBRARY_LABELS, profileWorkCount, type PreparedBackup } from '../domain/backupRestore.ts'

type Catalog = ReturnType<typeof catalogBackupFiles>
type Props = {
  value: PreparedBackup | null
  onChange: (value: PreparedBackup | null) => void
  disabled?: boolean
  /** Lance la recherche bornée dès l’affichage (premier lancement). */
  searchOnMount?: boolean
}

const formatDate = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })

export function BackupSummary({ value }: { value: PreparedBackup }) {
  return <section className="backup-preview" aria-label="Contenu de la sauvegarde">
    <p><b>{value.fileName}</b> · profil « {value.document.profile.name} » · {formatDate(value.document.exportedAt)}{value.location ? ` · ${value.location}` : ''}</p>
    <dl className="onboarding-import-summary">
      {PROFILE_LIBRARIES.map(library => <div key={library}><dt>{PROFILE_LIBRARY_LABELS[library]}</dt><dd>{value.document[library].length}</dd></div>)}
      {customLibrarySummary(value.document).map(library => <div key={library.key}><dt>{library.label}</dt><dd>{library.count}</dd></div>)}
    </dl>
    <p>{profileWorkCount(value.document)} fiches dans ce profil. Les réglages et vues enregistrées ne font pas partie de ce format. Les autres profils seront conservés.</p>
  </section>
}

/** Shared by first run and settings. Only reads and prepares a JSON document. */
export function BackupRestorePicker({ value, onChange, disabled = false, searchOnMount = false }: Props) {
  const [busy, setBusy] = useState(false)
  const reading = useRef(false)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [found, setFound] = useState<{ catalog: Catalog; unreadable: string[] } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (task: () => Promise<void>) => {
    if (reading.current || disabled) return
    reading.current = true
    setBusy(true)
    setError(null)
    setMessage(null)
    try { await task() } catch {
      setError('Lecture impossible. Choisir un fichier JSON Sylloge ou un dossier local accessible. Aucune donnée n’a été écrite.')
    } finally { reading.current = false; setBusy(false) }
  }

  const search = () => run(async () => {
    setCatalog(null)
    onChange(null)
    const result = await findBackupCandidates()
    const files = result.candidates.map(candidate => ({ name: candidate.fileName, contents: candidate.contents, location: candidate.location }))
    const nextCatalog = catalogBackupFiles(files)
    setFound({ catalog: nextCatalog, unreadable: result.unreadableLocations })
    if (nextCatalog.valid.length === 0) setMessage('Aucune sauvegarde Sylloge trouvée dans iCloud Drive, Google Drive, Documents, Bureau ou Téléchargements. Choisir le fichier ou le dossier manuellement.')
  })

  const choose = (folder: boolean) => run(async () => {
    setCatalog(null)
    onChange(null)
    if (folder) {
      const picked = await pickImportContainer()
      if (!picked) { setMessage('Sélection annulée. Aucune donnée n’a été écrite.'); return }
      const files = picked.kind === 'container' ? picked.containerCandidates.filter(candidate => candidate.kind === 'json') : []
      const result = catalogBackupFiles(files)
      setCatalog(result)
      setMessage(result.valid.length > 0 ? 'Choisir explicitement la copie à restaurer. Aucune copie n’est sélectionnée automatiquement.' : 'Aucune sauvegarde Sylloge JSON valide dans ce dossier.')
    } else {
      const picked = await pickImportJson()
      if (!picked) { setMessage('Sélection annulée. Aucune donnée n’a été écrite.'); return }
      const result = catalogBackupFiles([picked])
      if (result.valid.length > 0) onChange(result.valid[0])
      else setError(result.invalid[0]?.message ?? 'Le fichier n’est pas une sauvegarde Sylloge valide.')
    }
  })

  const searchedOnce = useRef(false)
  useEffect(() => {
    if (!searchOnMount || searchedOnce.current) return
    searchedOnce.current = true
    void search()
    // La recherche ne se relance ensuite qu’à la demande.
  }, [searchOnMount])

  const newest = found?.catalog.valid[0] ?? null
  const others = found?.catalog.valid.slice(1) ?? []

  return <div className="backup-restore-picker">
    <div className="backup-picker-actions">
      <button className="secondary-button" type="button" disabled={busy || disabled} onClick={() => void search()}>{found ? 'Relancer la recherche' : 'Rechercher sur ce Mac'}</button>
      <button className="secondary-button" type="button" disabled={busy || disabled} onClick={() => void choose(false)}>Choisir un fichier JSON</button>
      <button className="secondary-button" type="button" disabled={busy || disabled} onClick={() => void choose(true)}>Parcourir un dossier de sauvegardes</button>
    </div>
    <p className="backup-search-note">La recherche lit seulement les fichiers « sylloge-… .json » d’iCloud Drive, Google Drive, Dropbox, OneDrive, Documents, Bureau et Téléchargements. macOS peut demander l’autorisation d’y accéder.</p>
    {busy && <p role="status">Lecture et vérification des sauvegardes…</p>}
    {message && <p role="status">{message}</p>}
    {error && <p className="inline-report error" role="alert">{error}</p>}
    {found && found.unreadable.length > 0 && <p className="inline-report" role="status">Accès non autorisé : {found.unreadable.join(', ')}. Si la sauvegarde s’y trouve, la choisir manuellement.</p>}
    {newest && <section className="backup-found" aria-label="Sauvegarde la plus récente trouvée">
      <div className="backup-found-copy">
        <b>Sauvegarde la plus récente trouvée</b>
        <span>{formatDate(newest.document.exportedAt)} · profil « {newest.document.profile.name} » · {profileWorkCount(newest.document)} fiches</span>
        <small>{newest.location ? `${newest.location} · ` : ''}{newest.fileName}</small>
      </div>
      <button className={value === newest ? 'secondary-button' : 'primary-button'} type="button" disabled={busy || disabled || value === newest} onClick={() => onChange(newest)}>{value === newest ? 'Sélectionnée' : 'Utiliser cette sauvegarde'}</button>
    </section>}
    {newest && <p className="backup-search-note">Une copie plus récente ailleurs, par exemple sur une clé USB ? La choisir avec « Choisir un fichier JSON ».</p>}
    {others.length > 0 && <details className="import-guide-limits">
      <summary>Autres sauvegardes trouvées · {others.length}</summary>
      <fieldset className="backup-catalog" disabled={disabled || busy}>
        <legend className="visually-hidden">Autres sauvegardes trouvées</legend>
        {others.map((entry, index) => <label key={index}>
          <input type="radio" name="backup-found" checked={value === entry} onChange={() => onChange(entry)} />
          <span><b>{formatDate(entry.document.exportedAt)}</b><small>{entry.document.profile.name} · {profileWorkCount(entry.document)} fiches · {entry.location ? `${entry.location} · ` : ''}{entry.fileName}</small></span>
        </label>)}
      </fieldset>
    </details>}
    {catalog && catalog.valid.length > 0 && <fieldset className="backup-catalog" disabled={disabled || busy}>
      <legend>Copies valides · {catalog.valid.length}</legend>
      {catalog.valid.map((entry, index) => <label key={index}>
        <input type="radio" name="backup-candidate" checked={value === entry} onChange={() => onChange(entry)} />
        <span><b>{entry.fileName}</b><small>{formatDate(entry.document.exportedAt)} · {entry.document.profile.name} · {profileWorkCount(entry.document)} fiches</small></span>
      </label>)}
    </fieldset>}
    {catalog && catalog.invalid.length > 0 && <details className="import-guide-limits"><summary>Fichiers JSON non restaurables · {catalog.invalid.length}</summary><ul>{catalog.invalid.map((entry, index) => <li key={index}>{entry.fileName} — {entry.message}</li>)}</ul></details>}
    {value && <BackupSummary value={value} />}
  </div>
}
