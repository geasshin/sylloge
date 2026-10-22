import { useCallback, useEffect, useRef, useState } from 'react'
import { backupService, type BackupNotice } from '../../data/backupService.ts'
import { listBackupSnapshots, readBackupSnapshot, type BackupSnapshotEntry } from '../../data/backupFiles.ts'
import type { FilmLibrary } from '../../data/filmsRepository.ts'
import { libraryRepository, type CulturalLibrary } from '../../data/libraryRepository.ts'
import { saveExportJson, type BackupSettings as NativeBackupSettings } from '../../data/nativePortability.ts'
import { BACKUP_RETENTION_SUMMARY, catalogBackupFiles, profileWorkCount, type PreparedBackup } from '../../domain/backupRestore.ts'
import { createLibraryDocument, libraryExportFileName, serializeLibraryDocument } from '../../domain/libraryDocument.ts'
import { RestoreProfileDialog } from '../RestoreProfileButton.tsx'
import { SettingsGroup, SettingsRow } from './SettingsLayout.tsx'

const formatDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { dateStyle: 'long' })
const formatMoment = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })

type Props = {
  library: FilmLibrary
  onRestored: (restored: CulturalLibrary) => void
}

export function BackupSettings({ library, onRestored }: Props) {
  const profileId = library.profile.id
  const [settings, setSettings] = useState<NativeBackupSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [copies, setCopies] = useState<BackupSnapshotEntry[] | null>(null)
  const [busy, setBusy] = useState<'choose' | 'save' | 'clear' | 'export' | 'read' | null>(null)
  const [notice, setNotice] = useState<BackupNotice | null>(null)
  const [restore, setRestore] = useState<{ initial: PreparedBackup | null } | null>(null)
  const action = useRef(false)

  const refreshCopies = useCallback(async () => {
    try {
      setCopies(await listBackupSnapshots(profileId))
    } catch (error) {
      console.error('Impossible de lister les copies de sauvegarde.', error)
      setCopies([])
    }
  }, [profileId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNotice(null)
    backupService.getSettings(profileId).then(
      (loaded) => { if (!cancelled) setSettings(loaded) },
      (error: unknown) => {
        console.error('Impossible de lire le réglage de sauvegarde.', error)
        if (!cancelled) {
          setSettings(null)
          setNotice({ kind: 'error', message: 'Le réglage de sauvegarde n’a pas pu être lu. Vos bibliothèques restent disponibles sur ce Mac.' })
        }
      },
    ).finally(() => { if (!cancelled) setLoading(false) })
    void refreshCopies()
    return () => { cancelled = true }
  }, [profileId, refreshCopies])

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<BackupNotice | null>) => {
    if (action.current) return
    action.current = true
    setBusy(kind)
    setNotice(null)
    try {
      const result = await task()
      // Le compte rendu reste dans la page : pas de second message flottant.
      if (result) setNotice(result)
    } finally {
      action.current = false
      setBusy(null)
    }
  }

  const chooseDirectory = () => run('choose', async () => {
    try {
      const chosen = await backupService.pickDirectory(profileId)
      if (!chosen) return { kind: 'success', message: 'Choix du dossier annulé. Le réglage précédent reste inchangé.' }
      setSettings(chosen)
      void refreshCopies()
      return { kind: 'success', message: 'Dossier enregistré. La copie du jour se crée à la prochaine modification ; « Sauvegarder maintenant » la crée tout de suite.' }
    } catch (error) {
      console.error('Impossible d’enregistrer le dossier de sauvegarde.', error)
      return { kind: 'error', message: 'Ce dossier ne peut pas recevoir les sauvegardes. Aucun réglage n’a été modifié.' }
    }
  })

  const saveNow = () => run('save', async () => {
    const result = await backupService.saveManualSnapshot(library)
    await refreshCopies()
    return result
  })

  const disable = () => run('clear', async () => {
    try {
      await backupService.clearSettings(profileId)
      setSettings(null)
      setCopies([])
      return { kind: 'success', message: 'Sauvegarde automatique désactivée. Les copies déjà écrites restent dans leur dossier.' }
    } catch (error) {
      console.error('Impossible de désactiver la sauvegarde automatique.', error)
      return { kind: 'error', message: 'La sauvegarde automatique n’a pas pu être désactivée. Le réglage précédent reste actif.' }
    }
  })

  const exportCopy = () => run('export', async () => {
    try {
      const full = await libraryRepository.loadLibrary(profileId)
      const document = createLibraryDocument(full)
      const savedName = await saveExportJson(libraryExportFileName(document.exportedAt), serializeLibraryDocument(document))
      return savedName
        ? { kind: 'success', message: `Copie enregistrée : « ${savedName} » · ${profileWorkCount(full)} fiches du profil « ${full.profile.name} ».` }
        : { kind: 'success', message: 'Export annulé. Aucun fichier n’a été écrit.' }
    } catch (error) {
      console.error('Impossible d’exporter la sauvegarde.', error)
      return { kind: 'error', message: 'L’export a échoué. Le profil n’a pas été modifié.' }
    }
  })

  const restoreCopy = (entry: BackupSnapshotEntry) => run('read', async () => {
    try {
      const contents = await readBackupSnapshot(profileId, entry.fileName)
      const catalog = catalogBackupFiles([{ name: entry.fileName, contents }])
      const prepared = catalog.valid[0]
      if (!prepared) return { kind: 'error', message: catalog.invalid[0]?.message ?? 'Cette copie n’est pas une sauvegarde Sylloge valide.' }
      setRestore({ initial: prepared })
      return null
    } catch (error) {
      console.error('Impossible de lire la copie de sauvegarde.', error)
      return { kind: 'error', message: 'Cette copie ne peut pas être lue. Elle a peut-être été déplacée ou supprimée.' }
    }
  })

  const working = busy !== null
  const configured = settings !== null
  const unavailable = configured && !settings.directoryAvailable

  return (
    <>
      <SettingsGroup
        id="backup-title"
        title="Sauvegarde automatique"
        description="Une copie JSON du profil : toutes ses bibliothèques, personnalisées comprises, avec notes, avis, dates et citations. Les réglages et vues enregistrées n’en font pas partie."
      >
        {loading ? (
          <SettingsRow label="Lecture du réglage…" />
        ) : (
          <>
            <SettingsRow
              label={configured ? (unavailable ? 'Dossier introuvable' : 'Active') : 'Inactive'}
              detail={configured
                ? <span className="settings-path" title={settings.backupDirectory}>{settings.backupDirectory}</span>
                : 'Choisir un dossier : local, iCloud Drive ou Google Drive présent sur ce Mac.'}
              tone={unavailable ? 'danger' : undefined}
            >
              <button className={configured ? 'secondary-button' : 'primary-button'} type="button" disabled={working} onClick={() => void chooseDirectory()}>
                {busy === 'choose' ? 'Choix du dossier…' : configured ? 'Changer de dossier' : 'Choisir un dossier'}
              </button>
            </SettingsRow>
            <SettingsRow
              label="Rythme"
              detail={configured && settings.lastAutomaticSnapshotDay ? `Dernière copie automatique : ${formatDay(settings.lastAutomaticSnapshotDay)}` : 'Aucune copie automatique pour l’instant.'}
            >
              <span className="settings-value">Chaque jour, à la première modification</span>
            </SettingsRow>
            <SettingsRow label="Conservation" detail={`${BACKUP_RETENTION_SUMMARY}. Les plus anciennes sont retirées automatiquement ; les fichiers que Sylloge n’a pas créés ne sont jamais touchés.`} />
            <SettingsRow label="Sauvegarder maintenant" detail="Crée une copie immédiatement, en plus de la copie quotidienne.">
              <button className="primary-button" type="button" disabled={!configured || unavailable || working} onClick={() => void saveNow()}>
                {busy === 'save' ? 'Sauvegarde…' : 'Sauvegarder maintenant'}
              </button>
            </SettingsRow>
            {configured && (
              <SettingsRow label="Désactiver la sauvegarde automatique" detail="Les copies existantes restent dans le dossier." tone="danger">
                <button className="secondary-button danger" type="button" disabled={working} onClick={() => void disable()}>
                  {busy === 'clear' ? 'Désactivation…' : 'Désactiver'}
                </button>
              </SettingsRow>
            )}
          </>
        )}
      </SettingsGroup>

      {notice && <p className={`inline-report settings-report ${notice.kind === 'error' ? 'error' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}</p>}

      {configured && (
        <SettingsGroup id="backup-copies-title" title="Copies de ce profil" description="Les copies créées par Sylloge dans le dossier choisi, de la plus récente à la plus ancienne.">
          {copies === null ? (
            <SettingsRow label="Lecture des copies…" />
          ) : copies.length === 0 ? (
            <SettingsRow label="Aucune copie pour l’instant" detail="La première se crée à la prochaine modification ou avec « Sauvegarder maintenant »." />
          ) : copies.map((entry) => (
            <SettingsRow key={entry.fileName} label={formatMoment(entry.createdAt)} detail={entry.available ? entry.fileName : `${entry.fileName} · fichier introuvable`}>
              <button className="secondary-button" type="button" disabled={working || !entry.available} onClick={() => void restoreCopy(entry)}>Restaurer…</button>
            </SettingsRow>
          ))}
        </SettingsGroup>
      )}

      <SettingsGroup id="backup-restore-title" title="Restaurer ou changer d’ordinateur" description="Le même fichier JSON sert à restaurer un profil et à l’emporter sur un autre Mac.">
        <SettingsRow label="Restaurer une sauvegarde" detail="Depuis un fichier, un dossier ou une recherche sur ce Mac. Un aperçu précède toute écriture.">
          <button className="secondary-button" type="button" disabled={working} onClick={() => setRestore({ initial: null })}>Restaurer une sauvegarde</button>
        </SettingsRow>
        <SettingsRow label="Exporter une copie" detail="Enregistrer le JSON du profil à l’endroit choisi : clé USB, autre dossier, partage.">
          <button className="secondary-button" type="button" disabled={working} onClick={() => void exportCopy()}>
            {busy === 'export' ? 'Écriture…' : 'Exporter une copie'}
          </button>
        </SettingsRow>
      </SettingsGroup>

      {restore && (
        <RestoreProfileDialog
          profile={library.profile}
          initial={restore.initial}
          onClose={(restored) => {
            setRestore(null)
            if (restored) onRestored(restored)
          }}
        />
      )}
    </>
  )
}
