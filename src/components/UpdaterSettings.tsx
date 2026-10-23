import { useEffect, useState } from 'react'
import { t, translateMessage } from '../i18n/core.ts'
import { useLanguage } from '../i18n/react.ts'
import {
  updaterPreferencesService,
  type UpdaterPreferences,
} from '../data/updaterPreferences.ts'
import {
  tauriUpdaterService,
  updaterErrorMessage,
  type AvailableUpdate,
} from '../data/updaterService.ts'
import { SettingsRow } from './settings/SettingsLayout.tsx'

/** Les comptes rendus viennent du composant, du service ou du natif : traduits à l’affichage. */
export const updaterMessageText = (message: string) => translateMessage(message)

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
  useLanguage()
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

  const busy = checking || installing || savingIgnoredVersion
  return (
    <>
      {loadingPreferences ? (
        <SettingsRow label={t('Lecture des préférences de mise à jour…')} />
      ) : preferences ? (
        <>
          <SettingsRow label={t('Rechercher automatiquement')} detail={t('À l’ouverture de Sylloge, vérifier si une nouvelle version signée est publiée.')}>
            <label className="settings-switch">
              <input
                type="checkbox"
                role="switch"
                checked={preferences.automaticChecksEnabled}
                onChange={(event) => void changeAutomaticChecks(event.target.checked)}
                disabled={savingAutomaticChecks || checking || installing}
              />
              <span className="visually-hidden">{t('Rechercher automatiquement les mises à jour')}</span>
            </label>
          </SettingsRow>
          <SettingsRow label={t('Vérifier maintenant')} detail={t('Seules les versions publiées et signées par le projet peuvent être installées.')}>
            <button className="secondary-button" type="button" onClick={() => void checkManually()} disabled={busy}>
              {checking ? t('Vérification…') : t('Rechercher les mises à jour')}
            </button>
          </SettingsRow>
          {preferences.ignoredVersion && (
            <SettingsRow label={t('Version {version} ignorée', { version: preferences.ignoredVersion })} detail={t('Elle ne sera plus proposée tant qu’elle reste ignorée.')}>
              <button className="secondary-button" type="button" onClick={() => void restoreIgnoredVersion()} disabled={busy}>
                {savingIgnoredVersion ? t('Rétablissement…') : t('Rétablir')}
              </button>
            </SettingsRow>
          )}
          {availableUpdate && (
            <SettingsRow label={t('Version {version} disponible', { version: availableUpdate.version })} detail={availableUpdate.notes || t('Nouvelle version signée.')}>
              <button className="primary-button" type="button" onClick={() => void installAvailableUpdate()} disabled={installing || savingIgnoredVersion}>
                {installing ? t('Installation…') : t('Installer')}
              </button>
              <button className="secondary-button" type="button" onClick={deferAvailableUpdate} disabled={installing || savingIgnoredVersion}>{t('Plus tard')}</button>
              <button className="secondary-button" type="button" onClick={() => void ignoreAvailableVersion()} disabled={installing || savingIgnoredVersion}>
                {savingIgnoredVersion ? t('Enregistrement…') : t('Ignorer')}
              </button>
            </SettingsRow>
          )}
        </>
      ) : (
        <SettingsRow label={t('Préférences de mise à jour indisponibles')} tone="danger" />
      )}
      {message && (
        <div className="settings-row">
          <p className={`inline-report settings-inline ${message.kind === 'error' ? 'error' : ''}`} role={message.kind === 'error' ? 'alert' : 'status'}>
            {updaterMessageText(message.text)}
          </p>
        </div>
      )}
    </>
  )
}
