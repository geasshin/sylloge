import { useEffect, useId, useRef, useState } from 'react'
import { PlusIcon, TrashIcon } from './icons.tsx'

function MoveIcon({ down = false }: { down?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={down ? 'M10 4v12m-5-5 5 5 5-5' : 'M10 16V4m-5 5 5-5 5 5'} /></svg>
}

/** Éditeur commun : les citations restent indépendantes du statut de lecture. */
export function QuotesEditor({ values, onChange, disabled = false, error }: {
  values: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
  error?: string
}) {
  const id = useId()
  const section = useRef<HTMLElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  useEffect(() => {
    if (focusIndex === null) return
    section.current?.querySelectorAll<HTMLTextAreaElement>('textarea')[focusIndex]?.focus()
    setFocusIndex(null)
  }, [focusIndex, values.length])
  const move = (index: number, offset: number) => {
    const next = [...values]
    const target = index + offset
    if (target < 0 || target >= values.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
    setFocusIndex(target)
  }
  // Retirer la dernière citation ne doit pas laisser le focus hors de la
  // fenêtre : il revient au bouton d’ajout, qui reste la seule cible utile.
  const remove = (index: number) => {
    const next = values.filter((_, position) => position !== index)
    onChange(next)
    if (next.length === 0) addButton.current?.focus()
    else setFocusIndex(Math.max(0, index - 1))
  }
  return (
    <section className="quote-editor" aria-labelledby={`${id}-title`} ref={section}>
      <div className="quote-editor-heading">
        <div>
          <h2 id={`${id}-title`}>Citations</h2>
          <p>Les passages à garder, dans leur ordre de lecture.</p>
        </div>
        <button ref={addButton} className="secondary-button quote-add" type="button" disabled={disabled} onClick={() => { setFocusIndex(values.length); onChange([...values, '']) }}><PlusIcon />Ajouter une citation</button>
      </div>
      {values.length === 0 && <p className="quote-editor-empty">Un passage marquant, une phrase à retrouver… Ajouter une première citation.</p>}
      <div className="quote-editor-list">
        {values.map((body, index) => (
          <div className="quote-editor-item" key={index}>
            <div className="quote-editor-toolbar">
              <label htmlFor={`${id}-${index}`}>Citation {index + 1}</label>
              <div className="quote-editor-actions">
                <button type="button" className="quote-action" aria-label={`Déplacer la citation ${index + 1} vers le haut`} disabled={disabled || index === 0} onClick={() => move(index, -1)}><MoveIcon /></button>
                <button type="button" className="quote-action" aria-label={`Déplacer la citation ${index + 1} vers le bas`} disabled={disabled || index === values.length - 1} onClick={() => move(index, 1)}><MoveIcon down /></button>
                <button type="button" className="quote-action quote-remove" aria-label={`Retirer la citation ${index + 1}`} disabled={disabled} onClick={() => remove(index)}><TrashIcon size={16} /></button>
              </div>
            </div>
            <textarea id={`${id}-${index}`} value={body} rows={3} placeholder="Saisir le passage…" disabled={disabled} onChange={event => onChange(values.map((value, i) => i === index ? event.target.value : value))} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} autoCorrect="off" spellCheck={false} />
          </div>
        ))}
      </div>
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </section>
  )
}

/** Lecture ouverte, sous la fiche : aucune citation dissimulée dans un accordéon. */
export function QuotesSection({ quotes, onEdit }: {
  quotes: readonly { id: string; body: string }[]
  onEdit: () => void
}) {
  const id = useId()
  return (
    <section className="quotes-section" aria-labelledby={`${id}-title`}>
      <div className="quote-editor-heading">
        <div><h2 id={`${id}-title`}>Citations</h2><p>{quotes.length} {quotes.length === 1 ? 'citation personnelle' : 'citations personnelles'}</p></div>
        <button className="text-button" type="button" onClick={onEdit}>{quotes.length ? 'Modifier les citations' : 'Ajouter une citation'}</button>
      </div>
      {quotes.length ? (
        <ol className="quotes-list">
          {quotes.map(quote => <li key={quote.id}><blockquote>{quote.body}</blockquote></li>)}
        </ol>
      ) : <p className="quote-editor-empty">Les passages conservés dans cette œuvre apparaîtront ici.</p>}
    </section>
  )
}
