import { useState } from 'react'
import type { FilmLibrary } from '../../data/filmsRepository.ts'
import { profilesRepository, type ProfileSummary } from '../../data/profilesRepository.ts'
import { AccessibleDialog } from '../AccessibleDialog.tsx'
import { ProfileAvatar, ProfileAvatarPicker } from '../ProfileAvatar.tsx'
import { SettingsGroup, SettingsRow } from './SettingsLayout.tsx'

const MAX_PROFILES = 5

const COUNT_LABELS: Array<[keyof ProfileSummary, string, string]> = [
  ['filmCount', 'film', 'films'],
  ['seriesCount', 'série', 'séries'],
  ['animeCount', 'animé', 'animés'],
  ['bookCount', 'livre', 'livres'],
  ['mangaCount', 'manga', 'mangas'],
  ['gameCount', 'jeu', 'jeux'],
  ['artworkCount', 'œuvre d’art', 'œuvres d’art'],
  ['customCount', 'fiche personnalisée', 'fiches personnalisées'],
]

export function profileTotalWorks(profile: ProfileSummary): number {
  return COUNT_LABELS.reduce((sum, [key]) => sum + Number(profile[key] ?? 0), 0)
}

export function profileWorksSummary(profile: ProfileSummary): string {
  const parts = COUNT_LABELS.flatMap(([key, singular, plural]) => {
    const value = Number(profile[key] ?? 0)
    return value > 0 ? [`${value} ${value === 1 ? singular : plural}`] : []
  })
  return parts.length > 0 ? parts.join(' · ') : 'Bibliothèque vide'
}

type Props = {
  library: FilmLibrary
  profiles: ProfileSummary[]
  onSwitchProfile: (profileId: string) => Promise<void>
  onProfilesChanged: () => void
  onProfileDeleted: (deletedProfileId: string) => void
}

export function ProfilesSettings({ library, profiles, onSwitchProfile, onProfilesChanged, onProfileDeleted }: Props) {
  const [creating, setCreating] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [editingAvatarProfile, setEditingAvatarProfile] = useState<ProfileSummary | null>(null)
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [deletingProfile, setDeletingProfile] = useState<ProfileSummary | null>(null)
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const atProfileLimit = profiles.length >= MAX_PROFILES

  const run = async (task: () => Promise<void>, failure: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (cause) {
      console.error(failure, cause)
      setError(cause instanceof Error ? cause.message : failure)
    } finally {
      setBusy(false)
    }
  }

  const switchProfile = async (profileId: string) => {
    if (profileId === library.profile.id || switchingProfileId) return
    setSwitchingProfileId(profileId)
    setError(null)
    try {
      await onSwitchProfile(profileId)
    } catch (cause) {
      console.error('Impossible d’ouvrir le profil choisi.', cause)
      setError('Le profil choisi n’a pas pu être ouvert.')
    } finally {
      setSwitchingProfileId(null)
    }
  }

  const submitCreate = () => run(async () => {
    const name = newProfileName.trim()
    if (!name) return
    await profilesRepository.create(name)
    setNewProfileName('')
    setCreating(false)
    onProfilesChanged()
  }, 'Le profil n’a pas pu être créé.')

  const submitRename = (profileId: string) => run(async () => {
    const name = renameValue.trim()
    if (!name) return
    await profilesRepository.rename(profileId, name)
    setRenamingId(null)
    onProfilesChanged()
  }, 'Le profil n’a pas pu être renommé.')

  const submitAvatar = async () => {
    if (!editingAvatarProfile || busy) return
    setBusy(true)
    setAvatarError(null)
    try {
      await profilesRepository.update(editingAvatarProfile.id, editingAvatarProfile.name, avatarDraft)
      setEditingAvatarProfile(null)
      onProfilesChanged()
    } catch (cause) {
      console.error('Impossible de modifier la photo du profil.', cause)
      setAvatarError(cause instanceof Error ? cause.message : 'La photo du profil n’a pas pu être enregistrée.')
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = () => run(async () => {
    if (!deletingProfile) return
    const deletedId = deletingProfile.id
    await profilesRepository.delete(deletedId)
    setDeletingProfile(null)
    onProfilesChanged()
    onProfileDeleted(deletedId)
  }, 'Le profil n’a pas pu être supprimé.')

  const sorted = [...profiles].sort((left, right) => Number(right.id === library.profile.id) - Number(left.id === library.profile.id))

  return (
    <>
      <SettingsGroup
        id="profiles-title"
        title="Profils sur ce Mac"
        description="Chaque profil a ses propres bibliothèques, vues et sauvegardes. Un seul est ouvert à la fois."
        aside={<span className="settings-count">{profiles.length} sur {MAX_PROFILES}</span>}
      >
        {sorted.map((profile) => {
          const active = profile.id === library.profile.id
          if (renamingId === profile.id) {
            return (
              <div className="settings-row" key={profile.id}>
                <form className="profile-rename-form" onSubmit={(event) => { event.preventDefault(); void submitRename(profile.id) }}>
                  <label>
                    <span className="visually-hidden">Nouveau nom du profil</span>
                    <input type="text" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={60} autoFocus />
                  </label>
                  <button className="primary-button" type="submit" disabled={busy || !renameValue.trim()}>Renommer</button>
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => setRenamingId(null)}>Annuler</button>
                </form>
              </div>
            )
          }
          return (
            <SettingsRow
              key={profile.id}
              leading={<ProfileAvatar name={profile.name} avatarDataUrl={profile.avatarDataUrl} className="small" />}
              label={<>{profile.name}{active && <span className="settings-tag">Ouvert</span>}</>}
              detail={profileWorksSummary(profile)}
            >
              {!active && (
                <button className="secondary-button" type="button" disabled={busy || switchingProfileId !== null} onClick={() => void switchProfile(profile.id)}>
                  {switchingProfileId === profile.id ? 'Ouverture…' : 'Ouvrir'}
                </button>
              )}
              <button className="secondary-button" type="button" disabled={busy} onClick={() => { setEditingAvatarProfile(profile); setAvatarDraft(profile.avatarDataUrl); setAvatarError(null) }}>Photo</button>
              <button className="secondary-button" type="button" disabled={busy} onClick={() => { setRenamingId(profile.id); setRenameValue(profile.name) }}>Renommer</button>
              <button className="secondary-button danger" type="button" disabled={busy} onClick={() => setDeletingProfile(profile)}>Supprimer</button>
            </SettingsRow>
          )
        })}
        {creating ? (
          <div className="settings-row">
            <form className="profile-create-form" onSubmit={(event) => { event.preventDefault(); void submitCreate() }}>
              <label>
                <span className="visually-hidden">Nom du nouveau profil</span>
                <input type="text" value={newProfileName} onChange={(event) => setNewProfileName(event.target.value)} placeholder="Nom du profil" maxLength={60} autoFocus />
              </label>
              <button className="primary-button" type="submit" disabled={busy || !newProfileName.trim()}>Créer le profil</button>
              <button className="secondary-button" type="button" disabled={busy} onClick={() => { setCreating(false); setNewProfileName('') }}>Annuler</button>
            </form>
          </div>
        ) : (
          <SettingsRow
            label="Nouveau profil"
            detail={atProfileLimit ? `Le nombre maximal de ${MAX_PROFILES} profils est atteint. Supprimer un profil pour en créer un autre.` : 'Un profil vide, sans toucher aux autres.'}
          >
            <button className="secondary-button" type="button" disabled={busy || atProfileLimit} onClick={() => setCreating(true)}>Créer un profil</button>
          </SettingsRow>
        )}
      </SettingsGroup>

      {error && <p className="inline-report error settings-report" role="alert">{error}</p>}

      {editingAvatarProfile && (
        <AccessibleDialog
          title={`Photo du profil « ${editingAvatarProfile.name} »`}
          description="La photo est recadrée au carré et enregistrée uniquement sur cet appareil."
          onClose={() => setEditingAvatarProfile(null)}
          closeDisabled={busy}
          size="md"
        >
          <div className="assistant-content">
            <section className="assistant-stage profile-avatar-dialog">
              <p>JPEG, PNG ou WebP. Sylloge prépare une copie légère de 256 px et ne modifie pas le fichier original.</p>
              <ProfileAvatarPicker name={editingAvatarProfile.name} avatarDataUrl={avatarDraft} disabled={busy} onChange={setAvatarDraft} onError={setAvatarError} />
              {avatarError && <p className="inline-report error" role="alert">{avatarError}</p>}
              <div className="assistant-actions">
                <button className="secondary-button" type="button" disabled={busy} onClick={() => setEditingAvatarProfile(null)}>Annuler</button>
                <button className="primary-button" type="button" disabled={busy} onClick={() => void submitAvatar()}>{busy ? 'Enregistrement…' : 'Enregistrer la photo'}</button>
              </div>
            </section>
          </div>
        </AccessibleDialog>
      )}

      {deletingProfile && (
        <AccessibleDialog
          title={`Supprimer le profil « ${deletingProfile.name} »`}
          description="Cette suppression est définitive."
          onClose={() => setDeletingProfile(null)}
          closeDisabled={busy}
          size="sm"
        >
          <div className="assistant-content">
            <section className="assistant-stage">
              <h3>Supprimer définitivement ce profil ?</h3>
              <p>
                {profileTotalWorks(deletingProfile) > 0
                  ? `Ce profil contient ${profileWorksSummary(deletingProfile)}. Toutes ces fiches seront définitivement supprimées, ainsi que ses vues enregistrées. Les fichiers de sauvegarde déjà écrits restent dans leur dossier.`
                  : 'Ce profil ne contient aucune fiche.'}
                {deletingProfile.id === library.profile.id && <> Ce profil est actuellement ouvert : après suppression, Sylloge retournera à l’écran de premier lancement.</>}
              </p>
              {error && <p className="inline-report error" role="alert">{error}</p>}
              <div className="assistant-actions">
                <button className="secondary-button" type="button" disabled={busy} onClick={() => setDeletingProfile(null)}>Annuler</button>
                <button className="primary-button danger" type="button" disabled={busy} onClick={() => void confirmDelete()}>{busy ? 'Suppression…' : 'Supprimer définitivement'}</button>
              </div>
            </section>
          </div>
        </AccessibleDialog>
      )}
    </>
  )
}
