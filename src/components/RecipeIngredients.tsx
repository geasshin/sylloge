import type { ReactNode } from 'react'
import { formatNumber, t } from '../i18n/core.ts'
import { scaleIngredients } from '../domain/recipeScaling.ts'

/**
 * Ingrédients d'une recette, ajustables au nombre de portions (25 novembre 2026).
 *
 * Le nombre de portions de la fiche est la base ; les boutons − et + changent
 * le nombre affiché et les quantités, dans cette vue seulement. Rien n'est
 * enregistré : rouvrir la fiche retrouve les proportions d'origine. Sans
 * nombre lisible dans « Portions », l'ajustement part d'une base de 4 et le dit
 * — la plupart des recettes importées n'ont pas ce champ, et on préfère un
 * réglage utilisable tôt à un réglage absent.
 *
 * La valeur courante vit dans la fiche (`CustomEntryDetail`) : le fait
 * « Portions » et les quantités restent ainsi d'accord.
 */
export function RecipeIngredients({ title, lines, servings, baseCount, count, unit, assumed, onChange, onReset }: {
  title: ReactNode
  lines: readonly string[]
  servings: string | undefined
  baseCount: number
  count: number
  unit: string
  assumed: boolean
  onChange: (count: number) => void
  onReset: () => void
}) {
  const changed = count !== baseCount
  const shown = changed ? scaleIngredients(lines, baseCount, count) : lines
  const list = (
    <ul className="detail-list">
      {shown.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
    </ul>
  )

  return (
    <section className="detail-long-text detail-recipe-ingredients" data-field="ingredients">
      <div className="recipe-ingredients-head">
        <h2>{title}</h2>
        <div className="recipe-servings" role="group" aria-label={t('Ajuster les portions')}>
          <button
            type="button"
            className="stepper-button recipe-servings-button"
            onClick={() => onChange(Math.max(1, count - 1))}
            disabled={count <= 1}
            aria-label={t('Retirer une portion')}
          >
            −
          </button>
          <output className="recipe-servings-count" aria-live="polite">{formatNumber(count)}</output>
          <button
            type="button"
            className="stepper-button recipe-servings-button"
            onClick={() => onChange(count + 1)}
            aria-label={t('Ajouter une portion')}
          >
            +
          </button>
          {unit ? <span className="recipe-servings-unit">{unit}</span> : null}
        </div>
      </div>
      {(assumed || changed) && (
        <p className="recipe-servings-note">
          <span>
            {assumed
              ? t('Portions non indiquées dans la recette : base par défaut de {count}', { count: formatNumber(baseCount) })
              : t('Portions de base : {servings}', { servings: servings ?? `${baseCount} ${unit}` })}
          </span>
          {changed && (
            <button type="button" className="link-accent" onClick={onReset}>{t('Réinitialiser')}</button>
          )}
        </p>
      )}
      {list}
    </section>
  )
}
