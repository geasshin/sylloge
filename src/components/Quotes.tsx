import { t, translateMessage, formatNumber } from '../i18n/core.ts'
import { useEffect, useId, useRef, useState } from 'react'
import { PlusIcon, TrashIcon } from './icons.tsx'

function MoveIcon({ down = false }: { down?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={down ? 'M10 4v12m-5-5 5 5 5-5' : 'M10 16V4m-5 5 5-5 5 5'} /></svg>
}

/** Éditeur commun : les citations restent indépendantes du statut de lecture. */
export function QuotesEditor({ values, onChange, disabled = false, error, autoFocusLast = false }: {
  values: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
  error?: string
  /** Ouvre l’éditeur directement sur le dernier passage (arrivée depuis la fiche). */
  autoFocusLast?: boolean
}) {
  const id = useId()
  const section = useRef<HTMLElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  /** Index dont il faut rendre le focus au bouton de déplacement après rendu. */
  const [moveFocus, setMoveFocus] = useState<number | null>(null)
  useEffect(() => {
    if (focusIndex === null) return
    section.current?.querySelectorAll<HTMLTextAreaElement>('textarea')[focusIndex]?.focus()
    setFocusIndex(null)
  }, [focusIndex, values.length])
  // Le focus reste sur le geste en cours : au clavier, Entrée répète le
  // déplacement au lieu d’insérer un saut de ligne dans le champ voisin.
  useEffect(() => {
    if (moveFocus === null) return
    const item = section.current?.querySelectorAll<HTMLElement>('.quote-editor-item')[moveFocus]
    const button = item?.querySelector<HTMLButtonElement>('button.quote-move:not(:disabled)')
      ?? item?.querySelector<HTMLButtonElement>('button.quote-move')
    button?.focus()
    setMoveFocus(null)
  }, [moveFocus, values])
  useEffect(() => {
    if (!autoFocusLast) return
    const fields = section.current?.querySelectorAll<HTMLTextAreaElement>('textarea')
    fields?.[fields.length - 1]?.focus()
  }, [autoFocusLast])
  const move = (index: number, offset: number) => {
    const next = [...values]
    const target = index + offset
    if (target < 0 || target >= values.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
    setMoveFocus(target)
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
          <h2 id={`${id}-title`}>{t("Citations")}</h2>
          <p>{t("Les passages à garder, dans leur ordre de lecture.")}</p>
        </div>
        <button ref={addButton} className="secondary-button quote-add" type="button" disabled={disabled} onClick={() => { setFocusIndex(values.length); onChange([...values, '']) }}><PlusIcon />{t("Ajouter une citation")}</button>
      </div>
      {values.length === 0 && <p className="quote-editor-empty">{t("Un passage marquant, une phrase à retrouver… Ajouter une première citation.")}</p>}
      <div className="quote-editor-list">
        {values.map((body, index) => (
          <div className="quote-editor-item" key={index}>
            <div className="quote-editor-toolbar">
              <label htmlFor={`${id}-${index}`}>{t('Citation {number}', { number: formatNumber(index + 1) })}</label>
              <div className="quote-editor-actions">
                <button type="button" className="quote-action quote-move" aria-label={t("Déplacer la citation {number} vers le haut", { number: formatNumber(index + 1) })} disabled={disabled || index === 0} onClick={() => move(index, -1)}><MoveIcon /></button>
                <button type="button" className="quote-action quote-move" aria-label={t("Déplacer la citation {number} vers le bas", { number: formatNumber(index + 1) })} disabled={disabled || index === values.length - 1} onClick={() => move(index, 1)}><MoveIcon down /></button>
                <button type="button" className="quote-action quote-remove" aria-label={t("Retirer la citation {number}", { number: formatNumber(index + 1) })} disabled={disabled} onClick={() => remove(index)}><TrashIcon size={16} /></button>
              </div>
            </div>
            <textarea id={`${id}-${index}`} value={body} rows={3} placeholder={t("Saisir le passage…")} disabled={disabled} onChange={event => onChange(values.map((value, i) => i === index ? event.target.value : value))} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} autoCorrect="off" spellCheck={false} />
          </div>
        ))}
      </div>
      {error && <p className="field-error" id={`${id}-error`}>{translateMessage(error)}</p>}
    </section>
  )
}

/** Lecture ouverte, sous la fiche : aucune citation dissimulée dans un accordéon. */
export function QuotesSection({ quotes, onEdit }: {
  quotes: readonly { id: string; body: string }[]
  onEdit: (options?: { addQuote?: boolean }) => void
}) {
  const id = useId()
  return (
    <section className="quotes-section" aria-labelledby={`${id}-title`}>
      <div className="quote-editor-heading">
        <div>
          <h2 id={`${id}-title`}>{t("Citations")}</h2>
          <p>{quotes.length === 0 ? t('Aucune citation') : t(quotes.length === 1 ? '{count} citation personnelle' : '{count} citations personnelles', { count: formatNumber(quotes.length) })}</p>
        </div>
        {/* Sur une fiche vide, le bouton annonce une intention d’ajout : le
            formulaire s’ouvre alors sur un passage vide, prêt à la saisie. */}
        <button className="text-button" type="button" onClick={() => onEdit(quotes.length === 0 ? { addQuote: true } : undefined)}>{t(quotes.length ? 'Modifier les citations' : 'Ajouter une citation')}</button>
      </div>
      {quotes.length ? (
        <ol className="quotes-list">
          {quotes.map(quote => <li key={quote.id}><blockquote>{quote.body}</blockquote></li>)}
        </ol>
      ) : <p className="quote-editor-empty">{t("Les passages conservés dans cette œuvre apparaîtront ici.")}</p>}
    </section>
  )
}
