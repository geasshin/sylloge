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
  disabled: boolean
  onToggle: (id: string) => void
}

/** Étape « Personnes » : les plus présents à cocher. Cinq au plus sur la carte. */
export function SharePeopleStep({ library, suggestions, loading, needsTmdbHint, portraits, chosenIds, disabled, onToggle }: Props) {
  const full = chosenIds.length >= MAX_SHARE_PEOPLE

  return (
    <section className="share-step-body" aria-labelledby="share-step-title">
      <h3 id="share-step-title">{t('Les personnes à mettre en avant')}</h3>
      <p className="field-hint">{t('Ceux qui reviennent le plus dans ce que vous avez terminé. Jusqu’à {max} sur la carte.', { max: MAX_SHARE_PEOPLE })}</p>

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
      {!loading && suggestions.length === 0 && <p className="inline-report" role="status">{t('Aucune proposition pour l’instant : terminez quelques œuvres de cette bibliothèque.')}</p>}
      {needsTmdbHint && <p className="field-hint">{t('Les acteurs viennent des films associés à TMDB ; les autres films ne comptent que pour leur réalisateur.')}</p>}
      <p className="share-picked" role="status">{t('{count} sur {max} choisis', { count: chosenIds.length, max: MAX_SHARE_PEOPLE })}</p>
    </section>
  )
}
