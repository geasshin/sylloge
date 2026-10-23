import { useRef, useState } from 'react'
import { formatNumber, t, translateMessage } from '../i18n/core.ts'
import { useLanguage } from '../i18n/react.ts'
import type { Profile } from '../domain/profile.ts'
import type { CulturalLibrary } from '../data/libraryRepository.ts'
import { libraryRepository } from '../data/libraryRepository.ts'
import { profilesRepository } from '../data/profilesRepository.ts'
import { createProfileFromPreparation } from '../domain/onboarding.ts'
import { profileWorkCount, type PreparedBackup } from '../domain/backupRestore.ts'
import { BackupRestorePicker, BackupSummary } from './BackupRestorePicker.tsx'
import { AccessibleDialog } from './AccessibleDialog.tsx'

type DialogProps = {
  profile: Profile
  /** Copie déjà lue (liste des copies du profil) : aperçu direct, sans sélecteur. */
  initial?: PreparedBackup | null
  onClose: (restored: CulturalLibrary | null) => void
}

/** Erreur du composant, du domaine ou du natif : traduite au seul point d’affichage. */
export const restoreErrorText = (message: string) => translateMessage(message)

const defaultName = (backup: PreparedBackup) => t('{name} · copie', { name: backup.document.profile.name.slice(0, 48) })
const summaryLine = (count: number) => count === 1
  ? t('{count} fiche dans ses bibliothèques. Les autres profils ont été conservés.', { count: formatNumber(count) })
  : t('{count} fiches dans ses bibliothèques. Les autres profils ont été conservés.', { count: formatNumber(count) })

/** Restauration d’un profil entier : aperçu, destination explicite, confirmation, écriture atomique. */
export function RestoreProfileDialog({ profile, initial = null, onClose }: DialogProps) {
  useLanguage()
  const [selected, setSelected] = useState<PreparedBackup | null>(initial)
  const [target, setTarget] = useState<'new' | 'empty'>('new')
  const [name, setName] = useState(initial ? defaultName(initial) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CulturalLibrary | null>(null)
  const writing = useRef(false)
  const close = () => {
    if (writing.current) return
    onClose(result)
  }
  const confirm = async () => {
    if (!selected || writing.current || (target === 'new' && !name.trim())) return
    writing.current = true
    setBusy(true)
    setError(null)
    try {
      if (target === 'new') {
        const restored = await createProfileFromPreparation({ name, avatarDataUrl: null, document: selected.document }, {
          create: (profileName, options) => profilesRepository.create(profileName, options),
          load: id => libraryRepository.loadLibrary(id),
          importDocument: (destination, document) => libraryRepository.importLibraryDocumentIntoEmptyProfile(destination, document),
          remove: id => profilesRepository.delete(id),
          now: () => new Date().toISOString(),
        })
        setResult(restored)
      } else {
        const current = await libraryRepository.loadLibrary(profile.id)
        if (profileWorkCount(current) > 0) {
          setError('Le profil courant contient des fiches. Choisir un nouveau profil pour conserver les données existantes.')
          return
        }
        setResult(await libraryRepository.importLibraryDocumentIntoEmptyProfile(profile, selected.document))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La restauration a échoué. Aucune restauration partielle n’a été conservée ; vérifier le fichier et réessayer.')
    } finally { writing.current = false; setBusy(false) }
  }
  return <AccessibleDialog title={t('Restaurer un profil Sylloge')} description={t('Même fichier JSON que les sauvegardes manuelles et automatiques. Aucun remplacement implicite.')} onClose={close} closeDisabled={busy}>
    <div className="assistant-content">
      {result ? <>
        <h3>{t('Profil restauré')}</h3><p role="status">{t('« {name} » · {summary}', { name: result.profile.name, summary: summaryLine(profileWorkCount(result)) })}</p>
        <p>{t('Le dossier des futures sauvegardes se règle dans Paramètres › Sauvegarde, une fois le profil restauré ouvert.')}</p>
        <div className="assistant-actions"><button className="primary-button" type="button" onClick={close}>{t('Ouvrir le profil restauré')}</button></div>
      </> : <>
        {initial ? <BackupSummary value={initial} /> : <BackupRestorePicker disabled={busy} value={selected} onChange={value => { setSelected(value); setError(null); if (value) setName(defaultName(value)) }} />}
        {selected && <>
          <fieldset className="transfer-scope" disabled={busy}><legend>{t('Destination de la restauration')}</legend>
            <label><input type="radio" name="restore-target" checked={target === 'new'} onChange={() => setTarget('new')} />{t('Créer un nouveau profil')}</label>
            <label><input type="radio" name="restore-target" checked={target === 'empty'} onChange={() => setTarget('empty')} />{t('Profil courant « {name} », uniquement s’il est vide', { name: profile.name })}</label>
          </fieldset>
          {target === 'new' && <label className="onboarding-name-field"><span>{t('Nom du profil restauré')}</span><input maxLength={60} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>}
          <p>{t('Aucune fiche existante ne sera supprimée. La restauration de toutes les bibliothèques est atomique.')}</p>
        </>}
        <div className="assistant-actions"><button className="secondary-button" type="button" disabled={busy} onClick={close}>{t('Annuler')}</button><button className="primary-button" type="button" disabled={busy || !selected || (target === 'new' && !name.trim())} onClick={() => void confirm()}>{busy ? t('Restauration…') : t('Confirmer la restauration')}</button></div>
        {error && <p className="inline-report error" role="alert">{restoreErrorText(error)}</p>}
      </>}
    </div>
  </AccessibleDialog>
}

export function RestoreProfileButton({ profile, onRestored, label }: { profile: Profile; onRestored: (library: CulturalLibrary) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <button className="secondary-button" type="button" onClick={() => setOpen(true)}>{label ?? t('Restaurer une sauvegarde')}</button>
    {open && <RestoreProfileDialog profile={profile} onClose={restored => { setOpen(false); if (restored) onRestored(restored) }} />}
  </>
}
