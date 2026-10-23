import { t, translateMessage } from '../i18n/core.ts'
import { useLanguage } from '../i18n/react.ts'
import type { AvailableUpdate } from '../data/updaterService.ts'

type UpdateNoticeProps = {
  update: AvailableUpdate
  installing: boolean
  ignoring: boolean
  error: string | null
  onInstall: () => void
  onLater: () => void
  onIgnore: () => void
}

/**
 * Annonce discrète d'une mise à jour disponible : une carte posée dans un coin, sans voile, sans vol de focus,
 * sans blocage de la navigation. Elle reste jusqu'à ce qu'on tranche — installer, plus tard (prochaine
 * ouverture), ou ne plus proposer cette version (réversible dans les réglages).
 */
export function UpdateNotice({ update, installing, ignoring, error, onInstall, onLater, onIgnore }: UpdateNoticeProps) {
  useLanguage()
  const busy = installing || ignoring

  return (
    <aside className="update-notice" role="status" aria-live="polite">
      <button
        className="update-notice-close"
        type="button"
        onClick={onLater}
        disabled={busy}
        aria-label={t('Fermer l’annonce de mise à jour')}
      >
        ×
      </button>
      <p className="update-notice-title">{t('Mise à jour disponible')}</p>
      <p className="update-notice-detail">{t('Sylloge {version} est prête à être installée.', { version: update.version })}</p>
      {update.notes && (
        <details className="update-notice-notes">
          <summary>{t('Notes de version')}</summary>
          <p>{update.notes}</p>
        </details>
      )}
      {error && <p className="inline-report error" role="alert">{translateMessage(error)}</p>}
      <div className="update-notice-actions">
        <button className="primary-button" type="button" onClick={onInstall} disabled={busy}>
          {installing ? t('Installation…') : t('Installer maintenant')}
        </button>
        <button className="secondary-button" type="button" onClick={onLater} disabled={busy}>
          {t('Plus tard')}
        </button>
        <button className="update-notice-dismiss" type="button" onClick={onIgnore} disabled={busy}>
          {ignoring ? t('Enregistrement…') : t('Ne plus proposer cette version')}
        </button>
      </div>
    </aside>
  )
}
