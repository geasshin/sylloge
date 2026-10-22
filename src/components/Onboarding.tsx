import { useEffect, useRef, useState } from 'react'
import { profilesRepository } from '../data/profilesRepository.ts'
import { libraryRepository, type CulturalLibrary } from '../data/libraryRepository.ts'
import { backupService } from '../data/backupService.ts'
import { pickBackupDestination, configureBackupDestination } from '../data/backupDestination.ts'
import type { BackupSettings } from '../data/nativePortability.ts'
import { createLibraryDocument } from '../domain/libraryDocument.ts'
import { createProfileFromPreparation } from '../domain/onboarding.ts'
import { BACKUP_RETENTION_SUMMARY, customLibrarySummary, emptyProfileSections, PROFILE_LIBRARIES, PROFILE_LIBRARY_LABELS, profileWorkCount, withPreparedCollection, type PreparedBackup, type PreparedCollection, type ProfileLibrary } from '../domain/backupRestore.ts'
import type { ThemePreference } from '../domain/theme.ts'
import { ProfileAvatarPicker } from './ProfileAvatar.tsx'
import { BackupRestorePicker } from './BackupRestorePicker.tsx'
import { LibraryImportButton } from './LibraryImportButton.tsx'
import logoSylloge from '../assets/logo-sylloge.png'

type Props = {
  themePreference: ThemePreference
  onThemePreferenceChange: (preference: ThemePreference) => void
  onProfileReady: (destination?: 'home' | 'transfer') => void
}
type Step = 'profile' | 'library' | 'backup'
type Start = 'empty' | 'backup' | 'collection'
const STEPS: Array<{ id: Step; label: string }> = [{ id: 'profile', label: 'Profil' }, { id: 'library', label: 'Bibliothèque' }, { id: 'backup', label: 'Sauvegardes' }]
const THEMES: Array<{ id: ThemePreference; label: string }> = [{ id: 'system', label: 'Système' }, { id: 'light', label: 'Clair' }, { id: 'dark', label: 'Sombre' }]

/** Un profil vide se décrit sans compteur ambigu. */
function worksPhrase(count: number): string {
  if (count === 0) return 'sans fiche pour l’instant'
  return count === 1 ? 'avec 1 fiche' : `avec ${count} fiches`
}

function profileReadyLine(library: CulturalLibrary): string {
  return `Profil « ${library.profile.name} » prêt, ${worksPhrase(profileWorkCount(library))}.`
}

function CollectionPreparation({ library, name, onPrepared }: { library: ProfileLibrary; name: string; onPrepared: (prepared: PreparedCollection) => void }) {
  const common = { profileId: 'onboarding-preview', profileName: name, existing: [], buttonLabel: 'Préparer un fichier', mediumLabel: PROFILE_LIBRARY_LABELS[library], onDone: () => {}, onPrepared }
  if (library === 'series' || library === 'anime') return <LibraryImportButton {...common} kind="series" seriesLibrary={library} />
  if (library === 'books' || library === 'mangas') return <LibraryImportButton {...common} kind="books" bookLibrary={library} />
  return <LibraryImportButton {...common} kind={library} />
}

/** No profile/data/settings writes before final creation. Parsing uses the same
 * components as the normal library imports. Failed first backups retain the
 * created profile and retries never repeat the import. */
export function Onboarding({ themePreference, onThemePreferenceChange, onProfileReady }: Props) {
  const [step, setStep] = useState<Step>('profile')
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [start, setStart] = useState<Start>('empty')
  const [backup, setBackup] = useState<PreparedBackup | null>(null)
  const [sections, setSections] = useState(emptyProfileSections)
  const [sources, setSources] = useState<Partial<Record<ProfileLibrary, string>>>({})
  const [selectedLibrary, setSelectedLibrary] = useState<ProfileLibrary>('films')
  const [destination, setDestination] = useState<BackupSettings | null>(null)
  const [skipBackup, setSkipBackup] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CulturalLibrary | null>(null)
  const [completion, setCompletion] = useState<string | null>(null)
  const writing = useRef(false)
  const createdRef = useRef<CulturalLibrary | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const preparedAt = useRef(new Date().toISOString())
  useEffect(() => { heading.current?.focus() }, [step, completion])

  const stagedDocument = createLibraryDocument({ profile: { id: 'onboarding-preview', name: name.trim(), createdAt: preparedAt.current, updatedAt: preparedAt.current }, ...sections }, preparedAt.current)
  const document = start === 'backup' ? backup?.document ?? null : start === 'collection' ? stagedDocument : null
  const ready = start === 'empty' || (start === 'backup' ? backup !== null : Object.keys(sources).length > 0)
  const go = (next: Step) => { setError(null); setStep(next) }
  const chooseDestination = async () => {
    if (choosing || busy) return
    setChoosing(true)
    setError(null)
    try {
      const selected = await pickBackupDestination()
      if (selected) { setDestination(selected); setSkipBackup(false) }
      else setError('Choix du dossier annulé. Aucun nouveau dossier n’a été enregistré.')
    } catch { setError('Le dossier ne peut pas être utilisé. Choisir un dossier local accessible en écriture.') }
    finally { setChoosing(false) }
  }
  const finish = async () => {
    if (writing.current || !ready || !name.trim() || (!destination && !skipBackup)) return
    writing.current = true
    setBusy(true)
    setError(null)
    try {
      let library = createdRef.current
      if (!library) {
        library = await createProfileFromPreparation({ name, avatarDataUrl: avatar, document }, {
          create: (profileName, options) => profilesRepository.create(profileName, options),
          load: id => libraryRepository.loadLibrary(id),
          importDocument: (profile, prepared) => libraryRepository.importLibraryDocumentIntoEmptyProfile(profile, prepared),
          remove: id => profilesRepository.delete(id),
          now: () => new Date().toISOString(),
        })
        createdRef.current = library
        setCreated(library)
      }
      if (destination) {
        await configureBackupDestination(library.profile.id, destination.backupDirectory)
        const notice = await backupService.saveManualSnapshot(library)
        if (notice.kind === 'error') { setError('Le profil est créé et ses données sont conservées. La première sauvegarde a échoué : réessayer ou choisir un autre dossier.'); return }
        setCompletion(`${profileReadyLine(library)} ${notice.message}`)
      } else setCompletion(`${profileReadyLine(library)} Aucune sauvegarde automatique configurée ; le dossier pourra être choisi dans les réglages.`)
    } catch (cause) {
      setError(createdRef.current ? 'Le profil est conservé. Le dossier n’a pas pu être configuré ; choisir un autre dossier ou réessayer.' : cause instanceof Error ? cause.message : 'La création du profil a échoué. Aucune restauration partielle n’a été conservée.')
    } finally { writing.current = false; setBusy(false) }
  }

  return <div className="onboarding-shell">
    <aside className="onboarding-aside" aria-label="Progression du premier lancement">
      <div><img className="onboarding-logo" src={logoSylloge} alt="" width={46} height={46} /><h1 className="display-title">Sylloge</h1><p>Une bibliothèque personnelle, locale et durable.</p></div>
      <ol className="onboarding-progress">{STEPS.map((entry, index) => <li key={entry.id} className={step === entry.id ? 'active' : STEPS.findIndex(x => x.id === step) > index ? 'complete' : ''} aria-current={step === entry.id ? 'step' : undefined}><span>{index + 1}</span>{entry.label}</li>)}</ol>
      <p className="onboarding-local-note">Sans compte Sylloge. Les sauvegardes peuvent rejoindre un dossier synchronisé choisi explicitement.</p>
    </aside>
    <section className="onboarding-panel">
      <div className="onboarding-step">
        {completion ? <>
          <h2 ref={heading} tabIndex={-1}>Le profil est prêt</h2>
          <p className="onboarding-step-intro" role="status">{completion}</p>
          <button className="primary-button" type="button" onClick={() => onProfileReady('home')}>Entrer dans Sylloge</button>
        </> : <>
          {step === 'profile' && <>
            <h2 ref={heading} tabIndex={-1}>Créer le profil</h2>
            <p className="onboarding-step-intro">Un nom pour retrouver les bibliothèques sur cet appareil. La photo reste facultative.</p>
            <div className="onboarding-identity-row"><ProfileAvatarPicker compact name={name || 'Sylloge'} avatarDataUrl={avatar} disabled={busy} onChange={setAvatar} onError={setError} /><label className="onboarding-name-field"><span>Pseudo ou prénom</span><input value={name} onChange={event => setName(event.target.value)} maxLength={60} autoComplete="nickname" placeholder="Par exemple Camille" /></label></div>
            <fieldset className="onboarding-theme-fieldset"><legend>Apparence</legend><div className="onboarding-theme-grid" role="radiogroup" aria-label="Thème de l’application">{THEMES.map(option => <button key={option.id} className={`onboarding-theme-choice ${themePreference === option.id ? 'active' : ''}`} type="button" role="radio" aria-checked={themePreference === option.id} onClick={() => onThemePreferenceChange(option.id)}><span className={`theme-preview theme-preview-${option.id}`} aria-hidden="true"><i /><i /><i /></span><b>{option.label}</b></button>)}</div></fieldset>
            <div className="onboarding-actions end"><button className="primary-button" type="button" disabled={!name.trim()} onClick={() => go('library')}>Continuer</button></div>
          </>}
          {step === 'library' && <>
            <h2 ref={heading} tabIndex={-1}>Démarrer la bibliothèque</h2>
            <p className="onboarding-step-intro">Préparer les données maintenant, puis confirmer la création du profil à la dernière étape.</p>
            <div className="onboarding-start-grid" role="radiogroup" aria-label="Point de départ">{([
              ['empty', 'Commencer à vide', 'Ajouter les premières œuvres après le démarrage.'],
              ['backup', 'Restaurer Sylloge', 'Reprendre un profil depuis sa sauvegarde JSON.'],
              ['collection', 'Importer d’un autre service', 'Guides, fichiers et aperçus avant la création du profil.'],
            ] as const).map(([id, label, detail]) => <button key={id} className={`onboarding-start-choice ${start === id ? 'active' : ''}`} type="button" role="radio" aria-checked={start === id} onClick={() => { setStart(id); setError(null) }}><span><b>{label}</b><small>{detail}</small></span></button>)}</div>
            {start === 'backup' && <BackupRestorePicker value={backup} onChange={setBackup} searchOnMount />}
            {start === 'collection' && <section className="onboarding-service-preparation">
              <label htmlFor="onboarding-library">Bibliothèque à préparer</label><select id="onboarding-library" className="mapping-select" value={selectedLibrary} onChange={event => setSelectedLibrary(event.target.value as ProfileLibrary)}>{PROFILE_LIBRARIES.map(key => <option key={key} value={key}>{PROFILE_LIBRARY_LABELS[key]}</option>)}</select>
              <CollectionPreparation key={selectedLibrary} library={selectedLibrary} name={name.trim()} onPrepared={prepared => { setSections(current => withPreparedCollection(current, prepared)); setSources(current => ({ ...current, [prepared.library]: prepared.fileName })) }} />
              {Object.keys(sources).length > 0 && <ul className="onboarding-prepared-files">{PROFILE_LIBRARIES.filter(key => sources[key]).map(key => <li key={key}><span><b>{PROFILE_LIBRARY_LABELS[key]}</b> · {sections[key].length} fiches · {sources[key]}</span><button className="text-button" type="button" onClick={() => { setSources(current => { const next = { ...current }; delete next[key]; return next }); setSections(current => withPreparedCollection(current, { library: key, items: [], fileName: '' })) }}>Retirer {PROFILE_LIBRARY_LABELS[key]}</button></li>)}</ul>}
              <p className="import-contextual-hint">Un fichier préparé par bibliothèque. Préparer un nouveau fichier pour la même bibliothèque remplace sa préparation précédente. Aucun profil ni aucune fiche n’est encore créé.</p>
            </section>}
            <div className="onboarding-actions"><button className="secondary-button" type="button" onClick={() => go('profile')}>Retour</button><button className="primary-button" type="button" disabled={!ready} onClick={() => go('backup')}>Continuer</button></div>
          </>}
          {step === 'backup' && <>
            <h2 ref={heading} tabIndex={-1}>{created ? 'Terminer la sauvegarde' : 'Protéger le profil'}</h2>
            <p className="onboarding-step-intro">{created ? 'Les données sont déjà dans le nouveau profil. Réessayer ne les réimporte pas.' : `Le profil « ${name.trim()} » sera créé ${worksPhrase(document ? profileWorkCount(document) : 0)}. Les autres profils restent inchangés.`}</p>
            {document && <dl className="onboarding-import-summary">{PROFILE_LIBRARIES.map(key => <div key={key}><dt>{PROFILE_LIBRARY_LABELS[key]}</dt><dd>{document[key].length}</dd></div>)}{customLibrarySummary(document).map(library => <div key={library.key}><dt>{library.label}</dt><dd>{library.count}</dd></div>)}</dl>}
            <h3>Dossier des futures sauvegardes</h3>
            <p>Un dossier local, iCloud Drive ou Google Drive accessible sur cet ordinateur. Sylloge écrit le JSON ; le service choisi assure sa synchronisation. Ces copies contiennent les notes et citations personnelles.</p>
            <button className="secondary-button" type="button" disabled={busy || choosing} onClick={() => void chooseDestination()}>{choosing ? 'Vérification du dossier…' : destination ? 'Changer de dossier' : 'Choisir un dossier de sauvegarde'}</button>
            {destination && <p className="onboarding-destination"><b>Destination vérifiée</b><span>{destination.backupDirectory}</span><small>Première copie créée après la confirmation finale, puis une copie par jour. Conservation : {BACKUP_RETENTION_SUMMARY}.</small></p>}
            {!destination && <label className="onboarding-skip-backup"><input type="checkbox" checked={skipBackup} disabled={busy || choosing} onChange={event => setSkipBackup(event.target.checked)} />Continuer sans sauvegarde automatique pour le moment</label>}
            <div className="onboarding-actions"><button className="secondary-button" type="button" disabled={busy || choosing || created !== null} onClick={() => go('library')}>Retour</button><button className="primary-button" type="button" disabled={busy || choosing || (!destination && !skipBackup)} onClick={() => void finish()}>{busy ? 'Préparation…' : created ? 'Réessayer la sauvegarde' : start === 'backup' ? 'Créer et restaurer le profil' : start === 'collection' ? 'Créer et importer les données' : 'Créer le profil'}</button></div>
            {created && <button className="text-button" type="button" disabled={busy || choosing} onClick={() => onProfileReady('home')}>Entrer dans Sylloge sans la première sauvegarde</button>}
          </>}
          {error && <p className="inline-report error onboarding-error" role="alert">{error}</p>}
        </>}
      </div>
    </section>
  </div>
}
