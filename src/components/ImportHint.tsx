/**
 * Encart contextuel d'aide à l'import (jalon 0.6.5) : une explication courte
 * affichée au moment utile de chaque étape. Réutilisable partout dans le
 * dialogue sans créer de page d'aide séparée. Sobre, sans emoji (charte
 * DESIGN.md — constat C2 de l'audit UX du 22/09/2026).
 */
export function ImportHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="import-contextual-hint">
      {children}
    </p>
  )
}
