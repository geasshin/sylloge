import { useEffect, useState, type FormEvent } from 'react'
import {
  updaterPreferencesService,
  type UpdaterPreferences,
} from '../data/updaterPreferences.ts'
import {
  tauriUpdaterService,
  updaterErrorMessage,
  type AvailableUpdate,
} from '../data/updaterService.ts'
import {
  updaterCredentialService,
  type PrivateUpdaterCredentialStatus,
} from '../data/updaterCredentials.ts'

type UpdaterSettingsProps = {
  availableUpdate: AvailableUpdate | null
  onUpdateAvailable: (update: AvailableUpdate) => void
  onUpdateHandled: () => void
}

type UpdaterMessage = {
  kind: 'info' | 'error'
  text: string
}

export function UpdaterSettings({
  availableUpdate,
  onUpdateAvailable,
  onUpdateHandled,
}: UpdaterSettingsProps) {
  const [preferences, setPreferences] = useState<UpdaterPreferences | null>(null)
  const [loadingPreferences, setLoadingPreferences] = useState(true)
  const [credentialStatus, setCredentialStatus] = useState<PrivateUpdaterCredentialStatus | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [savingCredential, setSavingCredential] = useState(false)
  const [checking, setChecking] = useState(false)
  const [savingAutomaticChecks, setSavingAutomaticChecks] = useState(false)
  const [savingIgnoredVersion, setSavingIgnoredVersion] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [message, setMessage] = useState<UpdaterMessage | null>(null)

  useEffect(() => {
    let cancelled = false

    updaterPreferencesService.get().then(
      (loadedPreferences) => {
        if (!cancelled) setPreferences(loadedPreferences)
      },
      (error: unknown) => {
        console.error('Impossible de lire les préférences de mise à jour.', error)
        if (!cancelled) {
          setMessage({
            kind: 'error',
            text: 'Les préférences de mise à jour n’ont pas pu être lues. Aucune installation n’a démarré.',
          })
        }
      },
    ).finally(() => {
      if (!cancelled) setLoadingPreferences(false)
    })

    updaterCredentialService.getStatus().then(
      (status) => {
        if (!cancelled) setCredentialStatus(status)
      },
      (error: unknown) => {
        if (!cancelled) {
          setMessage({ kind: 'error', text: updaterErrorMessage(error) })
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [])

  const checkManually = async () => {
    if (!preferences) return
    if (!credentialStatus?.configured) {
      setMessage({ kind: 'info', text: 'Enregistrez un jeton GitHub pour accéder aux releases privées.' })
      return
    }

    setChecking(true)
    setMessage(null)
    try {
      const update = await tauriUpdaterService.check()
      if (!update) {
        onUpdateHandled()
        setMessage({ kind: 'info', text: 'Sylloge est déjà à jour. Aucune installation n’a démarré.' })
      } else if (preferences.ignoredVersion === update.version) {
        onUpdateHandled()
        setMessage({
          kind: 'info',
          text: `La version ${update.version} est actuellement ignorée. Vous pouvez la rétablir ci-dessous.`,
        })
      } else {
        onUpdateAvailable(update)
      }
    } catch (error) {
      onUpdateHandled()
      setMessage({ kind: 'error', text: updaterErrorMessage(error) })
    } finally {
      setChecking(false)
    }
  }

  const savePrivateToken = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = tokenInput.trim()
    if (!token) return

    setSavingCredential(true)
    setMessage(null)
    try {
      const status = await updaterCredentialService.save(token)
      setCredentialStatus(status)
      setTokenInput('')
      setMessage({ kind: 'info', text: 'Le jeton est enregistré dans le Trousseau macOS. Recherchez les mises à jour pour vérifier son accès.' })
    } catch (error) {
      setMessage({ kind: 'error', text: updaterErrorMessage(error) })
    } finally {
      setSavingCredential(false)
    }
  }

  const removePrivateToken = async () => {
    setSavingCredential(true)
    setMessage(null)
    try {
      setCredentialStatus(await updaterCredentialService.remove())
      setTokenInput('')
      onUpdateHandled()
      setMessage({ kind: 'info', text: 'Le jeton a été supprimé du Trousseau macOS. Les mises à jour privées ne seront plus accessibles.' })
    } catch (error) {
      setMessage({ kind: 'error', text: updaterErrorMessage(error) })
    } finally {
      setSavingCredential(false)
    }
  }

  const changeAutomaticChecks = async (automaticChecksEnabled: boolean) => {
    if (!preferences) return

    setSavingAutomaticChecks(true)
    setMessage(null)
    try {
      setPreferences(await updaterPreferencesService.setAutomaticChecksEnabled(automaticChecksEnabled))
    } catch (error) {
      console.error('Impossible d’enregistrer la recherche automatique de mises à jour.', error)
      setMessage({
        kind: 'error',
        text: 'Le réglage de recherche automatique n’a pas été modifié.',
      })
    } finally {
      setSavingAutomaticChecks(false)
    }
  }

  const ignoreAvailableVersion = async () => {
    if (!availableUpdate) return

    setSavingIgnoredVersion(true)
    setMessage(null)
    try {
      setPreferences(await updaterPreferencesService.ignoreVersion(availableUpdate.version))
      onUpdateHandled()
      setMessage({ kind: 'info', text: `La version ${availableUpdate.version} sera ignorée. Les versions futures resteront proposées.` })
    } catch (error) {
      console.error('Impossible d’ignorer la version de mise à jour.', error)
      setMessage({ kind: 'error', text: 'La version n’a pas été ignorée. Aucune installation n’a démarré.' })
    } finally {
      setSavingIgnoredVersion(false)
    }
  }

  const restoreIgnoredVersion = async () => {
    if (!preferences?.ignoredVersion) return

    const restoredVersion = preferences.ignoredVersion
    setSavingIgnoredVersion(true)
    setMessage(null)
    try {
      setPreferences(await updaterPreferencesService.restoreIgnoredVersion())
      setMessage({
        kind: 'info',
        text: `La version ${restoredVersion} n’est plus ignorée. Recherchez les mises à jour pour la proposer de nouveau.`,
      })
    } catch (error) {
      console.error('Impossible de rétablir la version ignorée.', error)
      setMessage({ kind: 'error', text: 'La version ignorée n’a pas pu être rétablie.' })
    } finally {
      setSavingIgnoredVersion(false)
    }
  }

  const installAvailableUpdate = async () => {
    if (!availableUpdate) return

    setInstalling(true)
    setMessage(null)
    try {
      await tauriUpdaterService.downloadAndInstall(availableUpdate)
      setMessage({ kind: 'info', text: 'La mise à jour est installée. Sylloge redémarre.' })
    } catch (error) {
      setMessage({
        kind: 'error',
        text: updaterErrorMessage(error),
      })
    } finally {
      setInstalling(false)
    }
  }

  const deferAvailableUpdate = () => {
    if (!availableUpdate) return
    onUpdateHandled()
    setMessage({ kind: 'info', text: `La version ${availableUpdate.version} est reportée pour cette session.` })
  }

  return (
    <div className="portability-card updater-card">
      <p>
        Sylloge consulte uniquement le fichier de release GitHub signé. Une branche Git ne peut jamais être téléchargée ou installée comme mise à jour.
      </p>

      {loadingPreferences ? (
        <p className="backup-state" role="status">Lecture des préférences de mise à jour…</p>
      ) : preferences ? (
        <>
          <section className="updater-credentials" aria-labelledby="updater-credentials-title">
            <div>
              <h3 id="updater-credentials-title">Accès aux releases privées</h3>
              <p>
                Le dépôt Sylloge est privé. Créez un jeton GitHub à granularité fine, limité à <code>geasshin/sylloge</code>, avec l’autorisation <strong>Contents, lecture seule</strong>. Sylloge le conserve dans le Trousseau macOS et ne l’affiche plus après son enregistrement.
              </p>
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Créer un jeton GitHub</a>
            </div>
            {credentialStatus?.supported ? (
              <>
                <p className="updater-credential-state" role="status">
                  {credentialStatus.configured ? 'Un jeton est enregistré dans le Trousseau macOS.' : 'Aucun jeton n’est enregistré.'}
                </p>
                <form className="updater-token-form" onSubmit={(event) => void savePrivateToken(event)}>
                  <label htmlFor="updater-github-token">Jeton d’accès personnel GitHub</label>
                  <input
                    id="updater-github-token"
                    type="password"
                    autoComplete="new-password"
                    spellCheck={false}
                    value={tokenInput}
                    onChange={(event) => setTokenInput(event.target.value)}
                    placeholder={credentialStatus.configured ? 'Saisir un nouveau jeton pour le remplacer' : 'github_pat_…'}
                    disabled={savingCredential || checking || installing}
                  />
                  <div className="updater-actions">
                    <button className="primary-button" type="submit" disabled={!tokenInput.trim() || savingCredential || checking || installing}>
                      {savingCredential ? 'Enregistrement…' : credentialStatus.configured ? 'Remplacer le jeton' : 'Enregistrer le jeton'}
                    </button>
                    {credentialStatus.configured && (
                      <button className="secondary-button danger" type="button" onClick={() => void removePrivateToken()} disabled={savingCredential || checking || installing}>
                        Supprimer le jeton
                      </button>
                    )}
                  </div>
                </form>
              </>
            ) : credentialStatus ? (
              <p className="updater-credential-state">Le stockage sécurisé du jeton est disponible uniquement sur macOS.</p>
            ) : (
              <p className="updater-credential-state" role="status">Lecture du Trousseau macOS…</p>
            )}
          </section>

          <div className="updater-preference">
            <div>
              <h3>Recherche automatique</h3>
              <p>Vérifier les releases GitHub signées à l’ouverture de Sylloge, dès qu’un jeton est enregistré.</p>
            </div>
            <label className="updater-checkbox">
              <input
                type="checkbox"
                checked={preferences.automaticChecksEnabled}
                onChange={(event) => void changeAutomaticChecks(event.target.checked)}
                disabled={savingAutomaticChecks || checking || installing}
              />
              <span>Rechercher automatiquement</span>
            </label>
          </div>

          <div className="updater-actions">
            <button className="secondary-button" type="button" onClick={() => void checkManually()} disabled={checking || installing || savingIgnoredVersion || !credentialStatus?.configured}>
              {checking ? 'Vérification…' : 'Rechercher les mises à jour'}
            </button>
            {preferences.ignoredVersion && (
              <button className="secondary-button" type="button" onClick={() => void restoreIgnoredVersion()} disabled={savingIgnoredVersion || checking || installing}>
                {savingIgnoredVersion ? 'Rétablissement…' : `Rétablir ${preferences.ignoredVersion}`}
              </button>
            )}
          </div>

          {availableUpdate && (
            <section className="updater-available" aria-labelledby="available-update-title">
              <div>
                <p className="card-kicker">Release GitHub signée</p>
                <h3 id="available-update-title">Version {availableUpdate.version} disponible</h3>
              </div>
              {availableUpdate.notes && <p className="updater-notes">{availableUpdate.notes}</p>}
              <div className="updater-actions">
                <button className="primary-button" type="button" onClick={() => void installAvailableUpdate()} disabled={installing || savingIgnoredVersion}>
                  {installing ? 'Téléchargement et installation…' : 'Télécharger et installer'}
                </button>
                <button className="secondary-button" type="button" onClick={deferAvailableUpdate} disabled={installing || savingIgnoredVersion}>
                  Plus tard
                </button>
                <button className="secondary-button" type="button" onClick={() => void ignoreAvailableVersion()} disabled={installing || savingIgnoredVersion}>
                  {savingIgnoredVersion ? 'Enregistrement…' : 'Ignorer cette version'}
                </button>
              </div>
            </section>
          )}
        </>
      ) : null}

      {message && (
        <p className={`inline-report ${message.kind === 'error' ? 'error' : ''}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </div>
  )
}
