import { useCallback, useEffect, useRef, useState } from 'react'
import {
  tauriUpdaterService,
  updaterErrorMessage,
  type AvailableUpdate,
} from './updaterService.ts'
import { updaterPreferencesService } from './updaterPreferences.ts'

/**
 * Délai après l'ouverture avant la première vérification : la fenêtre est déjà peinte, la personne voit son
 * accueil, et une éventuelle annonce ne retarde rien.
 */
const STARTUP_DELAY_MS = 1500

/** Une session peut rester ouverte des jours : sans revérification, elle n'apprendrait jamais rien. */
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * Décide si une version trouvée mérite une annonce. Quatre conditions, toutes nécessaires : la recherche
 * automatique est active, une version a été trouvée, elle n'est pas celle déjà ignorée, et elle n'est pas déjà
 * affichée. Fonction pure pour que la règle soit prouvée par test, sans navigateur ni réseau.
 */
export function shouldAnnounce(
  preferences: { automaticChecksEnabled: boolean; ignoredVersion: string | null },
  found: AvailableUpdate | null,
  displayedVersion: string | null,
): found is AvailableUpdate {
  return Boolean(found)
    && preferences.automaticChecksEnabled
    && found?.version !== preferences.ignoredVersion
    && found?.version !== displayedVersion
}

export type AppUpdateController = {
  update: AvailableUpdate | null
  installing: boolean
  ignoring: boolean
  error: string | null
  lastCheckedAt: Date | null
  install: () => void
  later: () => void
  ignore: () => void
}

/**
 * Vérifie les mises à jour sans jamais bloquer l'interface, et ne propose que ce qui peut être installé :
 * une version publiée, signée, plus récente, non ignorée, et seulement si la recherche automatique est active.
 * Un échec (hors ligne, dépôt indisponible) reste silencieux : c'est l'état normal d'un usage nomade.
 */
export function useAppUpdate(): AppUpdateController {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null)
  const [installing, setInstalling] = useState(false)
  const [ignoring, setIgnoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null)
  const currentVersion = useRef<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    let cancelled = false

    const verify = async () => {
      try {
        const preferences = await updaterPreferencesService.get()
        if (cancelled || !preferences.automaticChecksEnabled) return

        const found = await tauriUpdaterService.check()
        if (cancelled) return

        setLastCheckedAt(new Date())
        if (shouldAnnounce(preferences, found, currentVersion.current)) {
          currentVersion.current = found.version
          setUpdate(found)
        }
      } catch (verifyError) {
        // Hors ligne, dépôt indisponible, manifeste absent : rien à montrer, rien à décider.
        console.error('La recherche automatique des mises à jour a échoué.', verifyError)
      }
    }

    const startupTimer = window.setTimeout(() => void verify(), STARTUP_DELAY_MS)
    const recheckTimer = window.setInterval(() => void verify(), RECHECK_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearTimeout(startupTimer)
      window.clearInterval(recheckTimer)
    }
  }, [])

  const install = useCallback(() => {
    if (!update) return

    setInstalling(true)
    setError(null)
    void tauriUpdaterService.downloadAndInstall(update).catch((installError: unknown) => {
      setError(updaterErrorMessage(installError))
      setInstalling(false)
    })
  }, [update])

  // « Plus tard » ne vaut que pour la session : la proposition revient à la prochaine ouverture.
  const later = useCallback(() => {
    setUpdate(null)
    setError(null)
    currentVersion.current = null
  }, [])

  // « Ne plus proposer cette version » est enregistré en base, réversible depuis les réglages.
  const ignore = useCallback(() => {
    if (!update) return

    const version = update.version
    setIgnoring(true)
    setError(null)
    void updaterPreferencesService.ignoreVersion(version).then(
      () => {
        setIgnoring(false)
        setUpdate(null)
        currentVersion.current = null
      },
      (ignoreError: unknown) => {
        console.error('Impossible d’ignorer la version de mise à jour.', ignoreError)
        setIgnoring(false)
        setError('La version n’a pas été ignorée. Aucune installation n’a démarré.')
      },
    )
  }, [update])

  return { update, installing, ignoring, error, lastCheckedAt, install, later, ignore }
}
