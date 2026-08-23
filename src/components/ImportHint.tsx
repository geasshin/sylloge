/**
 * Encart contextuel d'aide à l'import (jalon 0.6.5) : une explication courte
 * affichée au moment utile de chaque étape. Réutilisable partout dans le
 * dialogue sans créer de page d'aide séparée.
 */
export function ImportHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="import-contextual-hint">
      <span aria-hidden="true">💡</span>
      {children}
    </p>
  )
}
