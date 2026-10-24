import { useEffect, useRef, useState } from 'react'
import { formatDate, formatNumber, t, translateMessage } from '../i18n/core.ts'
import { useLanguage } from '../i18n/react.ts'
import { pickImportJson } from '../data/nativePortability.ts'
import { findBackupCandidates } from '../data/backupFiles.ts'
import { experiencePreviewText } from './restoreReport.ts'
import { catalogBackupFiles, customLibrarySummary, PROFILE_LIBRARIES, PROFILE_LIBRARY_LABELS, profileWorkCount, type PreparedBackup } from '../domain/backupRestore.ts'

type Catalog = ReturnType<typeof catalogBackupFiles>
type Props = {
  value: PreparedBackup | null
  onChange: (value: PreparedBackup | null) => void
  disabled?: boolean
  /** Lance la recherche bornée dès l’affichage (premier lancement). */
  searchOnMount?: boolean
}

/** Nom du profil et compte de fiches : fragments réutilisés sur chaque ligne de copie. */
const profileLabel = (name: string) => t('profil « {name} »', { name })
/** Messages du sélecteur et diagnostics de lecture : traduits au seul point d’affichage. */
export const pickerMessageText = (message: string) => translateMessage(message)

const dateLabel = (iso: string) => formatDate(iso, { dateStyle: 'long', timeStyle: 'short' })
const worksLabel = (count: number) => count === 1
  ? t('{count} fiche', { count: formatNumber(count) })
  : t('{count} fiches', { count: formatNumber(count) })

export function BackupSummary({ value }: { value: PreparedBackup }) {
  useLanguage()
  const works = profileWorkCount(value.document)
  return <section className="backup-preview" aria-label={t('Contenu de la sauvegarde')}>
    <p><b>{value.fileName}</b> · {profileLabel(value.document.profile.name)} · {dateLabel(value.document.exportedAt)}{value.location ? ` · ${value.location}` : ''}</p>
    <dl className="onboarding-import-summary">
      {PROFILE_LIBRARIES.map(library => <div key={library}><dt>{t(PROFILE_LIBRARY_LABELS[library])}</dt><dd>{formatNumber(value.document[library].length)}</dd></div>)}
      {customLibrarySummary(value.document).map(library => <div key={library.key}><dt>{t(library.label)}</dt><dd>{formatNumber(library.count)}</dd></div>)}
    </dl>
    <p>{works === 1
      ? t('{count} fiche dans ce profil. Les autres profils seront conservés.', { count: formatNumber(works) })
      : t('{count} fiches dans ce profil. Les autres profils seront conservés.', { count: formatNumber(works) })}</p>
    <p>{experiencePreviewText(value.document.experience)}</p>
  </section>
}

/** Shared by first run and settings. Only reads and prepares a JSON document. */
export function BackupRestorePicker({ value, onChange, disabled = false, searchOnMount = false }: Props) {
  useLanguage()
  const [busy, setBusy] = useState(false)
  const reading = useRef(false)
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
      setError('Lecture impossible. Choisir un fichier JSON Sylloge accessible. Aucune donnée n’a été écrite.')
    } finally { reading.current = false; setBusy(false) }
  }

  const search = () => run(async () => {
    onChange(null)
    const result = await findBackupCandidates()
    const files = result.candidates.map(candidate => ({ name: candidate.fileName, contents: candidate.contents, location: candidate.location }))
    const nextCatalog = catalogBackupFiles(files)
    setFound({ catalog: nextCatalog, unreadable: result.unreadableLocations })
    if (nextCatalog.valid.length === 0) setMessage('Aucune sauvegarde Sylloge trouvée dans iCloud Drive, Google Drive, Documents, Bureau ou Téléchargements. Choisir le fichier manuellement.')
  })

  const chooseFile = () => run(async () => {
    onChange(null)
    const picked = await pickImportJson()
    if (!picked) { setMessage('Sélection annulée. Aucune donnée n’a été écrite.'); return }
    const result = catalogBackupFiles([picked])
    if (result.valid.length > 0) onChange(result.valid[0])
    else setError(result.invalid[0]?.message ?? 'Le fichier n’est pas une sauvegarde Sylloge valide.')
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
      <button className={found ? 'secondary-button' : 'primary-button'} type="button" disabled={busy || disabled} onClick={() => void search()}>{found ? t('Relancer la recherche') : t('Rechercher sur ce Mac')}</button>
      <button className="secondary-button" type="button" disabled={busy || disabled} onClick={() => void chooseFile()}>{t('Choisir un fichier JSON')}</button>
    </div>
    <p className="backup-search-note">{t('La recherche lit seulement les fichiers « sylloge-… .json » d’iCloud Drive, Google Drive, Dropbox, OneDrive, Documents, Bureau et Téléchargements. macOS peut demander l’autorisation d’y accéder.')} {t('Sauvegarde sur une clé USB ou dans un autre dossier : choisir directement son fichier JSON.')}</p>
    {busy && <p role="status">{t('Lecture et vérification des sauvegardes…')}</p>}
    {message && <p role="status">{pickerMessageText(message)}</p>}
    {error && <p className="inline-report error" role="alert">{pickerMessageText(error)}</p>}
    {found && found.unreadable.length > 0 && <p className="inline-report" role="status">{t('Accès non autorisé : {locations}. Si la sauvegarde s’y trouve, la choisir manuellement.', { locations: found.unreadable.join(', ') })}</p>}
    {newest && <section className="backup-found" aria-label={t('Sauvegarde la plus récente trouvée')}>
      <div className="backup-found-copy">
        <b>{t('Sauvegarde la plus récente trouvée')}</b>
        <span>{dateLabel(newest.document.exportedAt)} · {profileLabel(newest.document.profile.name)} · {worksLabel(profileWorkCount(newest.document))}</span>
        <small>{newest.location ? `${newest.location} · ` : ''}{newest.fileName}</small>
      </div>
      <button className={value === newest ? 'secondary-button' : 'primary-button'} type="button" disabled={busy || disabled || value === newest} onClick={() => onChange(newest)}>{value === newest ? t('Sélectionnée') : t('Utiliser cette sauvegarde')}</button>
    </section>}
    {others.length > 0 && <details className="import-guide-limits">
      <summary>{t('Autres sauvegardes trouvées · {count}', { count: formatNumber(others.length) })}</summary>
      <fieldset className="backup-catalog" disabled={disabled || busy}>
        <legend className="visually-hidden">{t('Autres sauvegardes trouvées')}</legend>
        {others.map((entry, index) => <label key={index}>
          <input type="radio" name="backup-found" checked={value === entry} onChange={() => onChange(entry)} />
          <span><b>{dateLabel(entry.document.exportedAt)}</b><small>{entry.document.profile.name} · {worksLabel(profileWorkCount(entry.document))} · {entry.location ? `${entry.location} · ` : ''}{entry.fileName}</small></span>
        </label>)}
      </fieldset>
    </details>}
    {value && <BackupSummary value={value} />}
  </div>
}
