import { useEffect, useState } from 'react'
import {
  updaterPreferencesService,
  type UpdaterPreferences,
} from '../data/updaterPreferences.ts'
import {
  tauriUpdaterService,
  updaterErrorMessage,
  type AvailableUpdate,
} from '../data/updaterService.ts'

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

    return () => {
      cancelled = true
    }
  }, [])

  const checkManually = async () => {
    if (!preferences) return

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
        Sylloge consulte le fichier de release signé publié sur GitHub. Une branche Git ne peut jamais être téléchargée ou installée comme mise à jour : l’archive doit porter la signature de la clé du projet.
      </p>

      {loadingPreferences ? (
        <p className="backup-state" role="status">Lecture des préférences de mise à jour…</p>
      ) : preferences ? (
        <>
          <div className="updater-preference">
            <div>
              <h3>Recherche automatique</h3>
              <p>Vérifier les releases GitHub signées à l’ouverture de Sylloge.</p>
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
            <button className="secondary-button" type="button" onClick={() => void checkManually()} disabled={checking || installing || savingIgnoredVersion}>
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
