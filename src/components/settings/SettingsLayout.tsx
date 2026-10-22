import type { ReactNode } from 'react'

/** Groupe de réglages : un titre, une phrase utile, puis des rangées. */
export function SettingsGroup({ id, title, description, aside, children }: {
  id: string
  title: string
  description?: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="settings-group" aria-labelledby={id}>
      <header className="settings-group-heading">
        <div>
          <h2 id={id}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {aside}
      </header>
      <div className="settings-group-body">{children}</div>
    </section>
  )
}

/** Rangée : libellé et précision à gauche, commande à droite. */
export function SettingsRow({ label, detail, children, tone, leading }: {
  label: ReactNode
  detail?: ReactNode
  children?: ReactNode
  tone?: 'danger'
  leading?: ReactNode
}) {
  return (
    <div className={`settings-row${tone ? ` settings-row-${tone}` : ''}`}>
      {leading}
      <div className="settings-row-copy">
        <b>{label}</b>
        {detail && <small>{detail}</small>}
      </div>
      {children && <div className="settings-row-control">{children}</div>}
    </div>
  )
}
