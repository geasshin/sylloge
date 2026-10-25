import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../i18n/core.ts'

type Props = { children: ReactNode }
type State = { failed: boolean }

/**
 * Dernier filet de sécurité de l'interface : une exception de rendu ne doit
 * pas laisser une fenêtre blanche sans issue. Les données restent dans SQLite ;
 * le bouton recharge seulement la vue.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erreur de rendu non récupérée.', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="main home-main">
        <div className="library-state error-state" role="alert">
          <p className="state-kicker">{t('Affichage interrompu')}</p>
          <h2>{t('Une erreur inattendue a interrompu l’affichage.')}</h2>
          <p>{t('Les données enregistrées restent dans SQLite. Recharger l’application pour reprendre.')}</p>
          <div className="state-actions">
            <button className="state-action" type="button" onClick={() => window.location.reload()}>
              {t('Recharger l’application')}
            </button>
          </div>
        </div>
      </main>
    )
  }
}
