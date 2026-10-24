import { useState } from 'react'
import { t } from '../i18n/core.ts'
import { MAX_SHARE_PEOPLE, personCaption, personInitials, type SharePerson } from '../domain/sharePeople.ts'
import type { ShareLibraryKey } from '../domain/shareCard.ts'

/** Un petit portrait rond : la photo, ou à défaut les initiales. Une photo qui ne charge pas retombe sur les initiales. */
function Avatar({ person, image }: { person: SharePerson; image: string | null }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="share-avatar" aria-hidden="true">
      <span>{personInitials(person.name)}</span>
      {image && !broken && <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />}
    </span>
  )
}

type Props = {
  library: ShareLibraryKey
  /** Les personnes proposées : réalisateurs, acteurs, auteurs ou studios les plus fréquents. */
  suggestions: SharePerson[]
  /** La recherche des acteurs et des réalisateurs n'est pas finie. */
  loading: boolean
  /** Les films dont on tire les acteurs : seuls ceux qui sont associés à TMDB en fournissent. */
  needsTmdbHint: boolean
  portraits: Record<string, string | null>
  chosenIds: string[]
  characters: string[]
  allowCharacters: boolean
  disabled: boolean
  onToggle: (id: string) => void
  onAddCharacter: (name: string) => void
  onRemoveCharacter: (name: string) => void
}

/** Étape « Personnes » : les plus présents à cocher, et les personnages préférés à saisir. Cinq au plus sur la carte. */
export function SharePeopleStep({ library, suggestions, loading, needsTmdbHint, portraits, chosenIds, characters, allowCharacters, disabled, onToggle, onAddCharacter, onRemoveCharacter }: Props) {
  const [draft, setDraft] = useState('')
  const total = chosenIds.length + characters.length
  const full = total >= MAX_SHARE_PEOPLE
  const add = () => {
    const name = draft.trim()
    if (name === '' || full) return
    onAddCharacter(name)
    setDraft('')
  }

  return (
    <section className="share-step-body" aria-labelledby="share-step-title">
      <h3 id="share-step-title">{t('Les personnes à mettre en avant')}</h3>
      <p className="field-hint">{t('Ceux qui reviennent le plus dans ce que vous avez terminé, et vos personnages préférés. Jusqu’à {max} sur la carte.', { max: MAX_SHARE_PEOPLE })}</p>

      {(suggestions.length > 0 || loading) && (
        <div className="share-people-group" role="group" aria-labelledby="share-people-suggestions">
          <span className="field-label" id="share-people-suggestions">{t('Les plus présents')}</span>
          {loading && <p role="status" className="share-picked">{t('Recherche des acteurs et des réalisateurs…')}</p>}
          {suggestions.map(person => {
            const checked = chosenIds.includes(person.id)
            const caption = personCaption(person, library)
            return (
              <label key={person.id} className="share-person-option" data-disabled={(!checked && full) || undefined}>
                <input type="checkbox" checked={checked} disabled={disabled || (!checked && full)} onChange={() => onToggle(person.id)} />
                <Avatar person={person} image={portraits[person.id] ?? person.portraitUrl} />
                <span className="share-person-text"><b>{person.name}</b><span>{t(caption.key, caption.params)}</span></span>
              </label>
            )
          })}
        </div>
      )}
      {!loading && suggestions.length === 0 && !allowCharacters && <p className="inline-report" role="status">{t('Aucune proposition pour l’instant : terminez quelques œuvres de cette bibliothèque.')}</p>}
      {needsTmdbHint && <p className="field-hint">{t('Les acteurs viennent des films associés à TMDB ; les autres films ne comptent que pour leur réalisateur.')}</p>}

      {allowCharacters && (
        <div className="share-people-group" role="group" aria-labelledby="share-people-characters">
          <span className="field-label" id="share-people-characters">{t('Vos personnages préférés')}</span>
          <div className="share-character-form">
            <input
              type="text"
              value={draft}
              maxLength={40}
              disabled={disabled || full}
              aria-label={t('Ajouter un personnage')}
              placeholder={t('Ajouter un personnage')}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add() } }}
            />
            <button className="secondary-button" type="button" disabled={disabled || full || draft.trim() === ''} onClick={add}>{t('Ajouter')}</button>
          </div>
          {characters.length > 0 && (
            <ul className="share-character-list">
              {characters.map(name => (
                <li key={name}>
                  <span>{name}</span>
                  <button type="button" disabled={disabled} aria-label={t('Retirer {name}', { name })} onClick={() => onRemoveCharacter(name)}>×</button>
                </li>
              ))}
            </ul>
          )}
          <small className="field-hint">{t('Un personnage de film, de série, de livre ou de jeu : sans image, il s’affiche avec ses initiales.')}</small>
        </div>
      )}
      <p className="share-picked" role="status">{t('{count} sur {max} choisis', { count: total, max: MAX_SHARE_PEOPLE })}</p>
    </section>
  )
}
