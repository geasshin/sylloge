import type { ReactNode } from 'react'
import { t } from '../i18n/core.ts'

/**
 * La composition commune des fiches (décision d'Aurélien, 30 octobre 2026).
 *
 * Toutes les bibliothèques — Films, Séries, Animation japonaise, Livres,
 * Mangas, Jeux, Art et les bibliothèques ajoutées dont Recettes — partagent
 * cette page : une colonne de 380 px collante à gauche (le visuel puis le
 * carnet personnel) et la colonne de lecture à droite. Les écrans décrivent
 * leur contenu en blocs, jamais leur disposition :
 *
 * - `visual`   le visuel de l'œuvre (affiche, couverture, image) ;
 * - `verdict`  statut, note, cœur ;
 * - `heading`  surtitre, titre, ligne de faits ;
 * - `facts`    grille de faits (et son état d'association) ;
 * - `synopsis` résumé ;
 * - `notebook` dates personnelles, lien fournisseur ;
 * - `review`   avis personnel ;
 * - `appendices` citations ou poème.
 *
 * Deux compositions particulières, décidées le même jour :
 * - Art : l'œuvre en majesté, centrée, sur un mur neutre, puis un bloc centré
 *   de 880 px — surtitre, titre et « artiste · année » centrés, cartel de
 *   musée à gauche, carnet à droite ;
 * - Recettes : photo 4:3, statut et ingrédients dans la colonne gauche, étapes
 *   numérotées en grand et notes en encadré dans la colonne de lecture.
 *
 * `banner` est un emplacement facultatif rendu en tête de fiche, pleine
 * largeur, au-dessus des colonnes : absent, il ne rend rien.
 */
export type DetailLayoutProps = {
  banner?: ReactNode
  visual: ReactNode
  verdict: ReactNode
  heading: ReactNode
  notebook?: ReactNode
  facts?: ReactNode
  synopsis?: ReactNode
  review?: ReactNode
  /** « Mon avis » par défaut ; une recette garde son libellé de modèle (« Notes »). */
  reviewLabel?: ReactNode
  appendices?: ReactNode
  /** Recettes : ingrédients à gauche, étapes à droite. */
  recipe?: { ingredients?: ReactNode; steps?: ReactNode } | null
  /** Art : le cartel de musée, à côté du carnet. */
  art?: { cartel: ReactNode } | null
}

const NOTEBOOK_LABEL = 'Mon carnet'
const REVIEW_LABEL = 'Mon avis'

/** Date personnelle du carnet : libellé puis valeur, sur une ligne. */
export function DetailDate({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <p className="detail-notebook-date">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
      <span>{label}</span>{' '}
      <b>{value}</b>
    </p>
  )
}

function Notebook({ children }: { children: ReactNode }) {
  return (
    <div className="detail-notebook">
      <p className="detail-label">{t(NOTEBOOK_LABEL)}</p>
      {children}
    </div>
  )
}

function Review({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <section className="detail-review">
      <h3 className="mine-label">{label ?? t(REVIEW_LABEL)}</h3>
      {children}
    </section>
  )
}

export function DetailLayout({
  banner,
  visual,
  verdict,
  heading,
  notebook,
  facts,
  synopsis,
  review,
  reviewLabel,
  appendices,
  recipe = null,
  art = null,
}: DetailLayoutProps) {
  if (art) {
    const withBanner = Boolean(banner)
    return (
      <article className={`detail-layout detail-art${withBanner ? ' detail-layout-bannered' : ''}`}>
        {banner && <div className="detail-banner-slot">{banner}</div>}
        <div className="detail-art-stage">{visual}</div>
        <div className="detail-art-block">
          <header className="detail-art-head">{heading}</header>
          <div className={`detail-art-columns${art.cartel ? '' : ' detail-art-columns-plain'}`}>
            {art.cartel && <dl className="detail-facts detail-cartel">{art.cartel}</dl>}
            <aside className="detail-art-notebook">
              <div className="detail-verdict">{verdict}</div>
              {notebook && <Notebook>{notebook}</Notebook>}
              {review && <Review label={reviewLabel}>{review}</Review>}
            </aside>
          </div>
          {appendices && <div className="detail-art-appendix">{appendices}</div>}
        </div>
      </article>
    )
  }

  const isRecipe = recipe !== null
  return (
    <article className={`detail-layout${isRecipe ? ' detail-recipe' : ''}${banner ? ' detail-layout-bannered' : ''}`}>
      {banner && <div className="detail-banner-slot">{banner}</div>}
      <div className="detail-side">
        <div className="detail-visual">{visual}</div>
        <div className="detail-verdict">{verdict}</div>
        {recipe?.ingredients}
        {notebook && <Notebook>{notebook}</Notebook>}
      </div>
      <div className="detail-body">
        {heading}
        {facts}
        {synopsis}
        {recipe?.steps}
        {review && <Review label={reviewLabel}>{review}</Review>}
        {appendices}
      </div>
    </article>
  )
}
