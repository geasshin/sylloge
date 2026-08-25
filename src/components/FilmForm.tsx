import { useEffect, useState, type FormEvent } from 'react'
import { FILM_STATUS_LABELS, type FilmStatus } from '../domain/film.ts'
import {
  EMPTY_FILM_FORM,
  filmToFormValues,
  localToday,
  validateFilmForm,
  type FilmFormErrors,
  type FilmFormValues,
  type FilmWriteInput,
} from '../domain/filmForm.ts'
import type { FilmMetadataProvenance } from '../domain/filmMetadataAssistance.ts'
import type { TmdbFilmPresentation } from '../data/tmdbService.ts'
import { Poster } from './Poster.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { StatusSegmented, StarRating, FavoriteHeart } from './VerdictControls.tsx'

/** Une URL d'affiche n'est prévisualisée que si elle est http(s) valide. */
function previewablePosterUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}
function formatFilmReleaseDate(value: string | null): string | null {
  if (!value) return null
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null
  if (!date || Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

/** Statuts proposés à la création : les trois qui ont du sens pour un film. */
const FORM_STATUSES: FilmStatus[] = ['à découvrir', 'terminé', 'abandonné']

type FilmFormProps = {
  film?: import('../domain/film.ts').Film
  initialValues?: FilmFormValues
  provenance?: FilmMetadataProvenance | null
  /** Présentation TMDB détaillée conservée pendant la création assistée. */
  tmdbPresentation?: TmdbFilmPresentation | null
  /** Cache TMDB de la fiche en édition : pré-remplit les champs éditoriaux. */
  tmdbCache?: import('../data/tmdbService.ts').CachedFilmTmdbPresentation | null
  /** Modification de l'affiche par URL depuis le crayon sur l'aperçu. */
  onPosterEdit?: (url: string | null) => Promise<void> | void
  /** Rendu en pop-up modale centrée au-dessus de la bibliothèque (fond flouté). */
  asDialog?: boolean
  /** Titre réduit dans une pop-up hôte qui gère déjà son propre en-tête. */
  compactHeading?: boolean
  /** Intégré à une pop-up hôte (0.6.9) : le formulaire vit dans la fenêtre,
      sans <main> pleine page ni barre de retour redondante. */
  embeddedInDialog?: boolean
  /** Accès au cache TMDB en édition (0.6.16) : présent → la fiche associée
      affiche son identité enrichie sans attendre une resaisie manuelle. */
  fetchTmdbCache?: (filmId: string) => Promise<import('../data/tmdbService.ts').CachedFilmTmdbPresentation | null>
  onCancel: () => void
  onSave: (input: FilmWriteInput, provenance: FilmMetadataProvenance | null) => Promise<void>
}

export function FilmForm({ film, initialValues, provenance = null, tmdbPresentation = null, tmdbCache = null, onPosterEdit, asDialog = false, compactHeading = false, embeddedInDialog = false, fetchTmdbCache, onCancel, onSave }: FilmFormProps) {
  const [values, setValues] = useState<FilmFormValues>(() => film ? filmToFormValues(film) : { ...(initialValues ?? EMPTY_FILM_FORM) })
  const [errors, setErrors] = useState<FilmFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [posterDialogOpen, setPosterDialogOpen] = useState(false)
  const today = localToday()
  // Création assistée : les champs éditoriaux sont déjà portés par la recherche,
  // ils restent dans les valeurs mais ne s'affichent plus comme formulaire.
  const assisted = !film && Boolean(initialValues?.title)
  const isAssociated = Boolean(film && (film.providerName || film.providerId))
  // 0.6.16 — identité enrichie en édition : le cache TMDB de la fiche est
  // chargé pour afficher durée, casting et réalisateurs sans resaisie.
  const [enrichment, setEnrichment] = useState<import('../data/tmdbService.ts').CachedFilmTmdbPresentation | null>(tmdbCache)
  useEffect(() => {
    let cancelled = false
    if (!film || !fetchTmdbCache) return
    fetchTmdbCache(film.id).then(
      (cache) => {
        if (!cancelled) setEnrichment(cache)
      },
      (error: unknown) => {
        console.error('Impossible de lire le cache TMDB en édition.', error)
        if (!cancelled) setEnrichment(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [film?.id, fetchTmdbCache])

  // Pré-remplissage éditorial depuis le cache TMDB sans toucher aux données personnelles.
  useEffect(() => {
    if (!tmdbCache) return
    const p = tmdbCache.presentation
    setValues((current) => ({
      ...current,
      originalTitle: current.originalTitle || p.originalTitle || '',
      year: current.year || (p.releaseDate ? String(Number(p.releaseDate.slice(0, 4))) : ''),
      director: current.director || p.directors.join(', '),
      summary: current.summary || p.synopsis || '',
    }))
    // Une seule fois à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // « À découvrir » : pas encore de verdict, on masque note, cœur, date et avis.
  const verdictVisible = values.status !== 'à découvrir'
  const previewTitle = values.title.trim() || 'Titre à renseigner'
  // 0.6.16 : en édition, l'affiche enrichie TMDB est montrée même si la
  // colonne locale est vide — on voit ce que la fiche a vraiment.
  const previewUrl = previewablePosterUrl(values.posterUrl)
    ?? (film ? enrichment?.selectedPosterUrl ?? null : null)

  // Une fiche historique « en attente » reste affichée et modifiable.
  const statusSegments: FilmStatus[] = FORM_STATUSES.includes(values.status)
    ? FORM_STATUSES
    : [...FORM_STATUSES, values.status]
  const ratingValue = values.rating === '' ? null : Number(values.rating)
  const providerPresentation = enrichment?.presentation ?? tmdbPresentation
  const providerBacked = Boolean(providerPresentation || provenance || isAssociated)
  const providerRelease = formatFilmReleaseDate(providerPresentation?.releaseDate ?? null)
    ?? (providerBacked && values.year ? values.year : null)
  const providerRuntime = providerPresentation?.runtimeMinutes
    ? `${Math.floor(providerPresentation.runtimeMinutes / 60)} h ${String(providerPresentation.runtimeMinutes % 60).padStart(2, '0')}`
    : null
  const providerDirectors = providerPresentation?.directors.length
    ? providerPresentation.directors.join(', ')
    : providerBacked ? values.director.trim() : ''
  const providerCast = providerPresentation?.cast.slice(0, 5).map((member) => member.name).filter(Boolean).join(', ') ?? ''
  const providerOriginalTitle = providerPresentation?.originalTitle?.trim()
    || (providerBacked ? values.originalTitle.trim() : '')
  const hasProviderFacts = providerBacked && Boolean(
    providerRelease || providerRuntime || providerDirectors || providerCast || providerOriginalTitle,
  )

  const update = <Key extends keyof FilmFormValues>(key: Key, value: FilmFormValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSaveError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = validateFilmForm(values)

    if (!result.success) {
      setErrors(result.errors)
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      await onSave(result.data, provenance)
    } catch (error) {
      console.error('Impossible d’enregistrer le film.', error)
      setSaveError('L’enregistrement a échoué. Vos changements restent dans le formulaire.')
      setSaving(false)
    }
  }

  // 0.6.18b — en pop-up, pas de titre : la fenêtre est explicite, un
  // « Film / Ajouter un film » empilé ne fait que doubler l'information.
  const heading = compactHeading || embeddedInDialog ? null : (
    <div className="editor-heading">
      <p className="eyebrow">Film</p>
      <h1 className="display-title">{film ? 'Modifier la fiche' : 'Ajouter un film'}</h1>
    </div>
  )

  const form = (
    <form className="film-form form-detail film-form-film" onSubmit={handleSubmit} noValidate>
      {/* Scène Film 0.6.21 : l’affiche porte le verdict, les informations
          fournisseur et l’avis restent dans la colonne de travail. */}
      <div className="form-side">
        <div className="form-poster-frame poster-container">
          <Poster
            title={previewTitle}
            src={previewUrl}
            className="form-poster-preview-lg"
            onEdit={onPosterEdit ? () => setPosterDialogOpen(true) : undefined}
          />
        </div>
        <div className={`film-poster-verdict ${verdictVisible ? 'is-visible' : 'is-empty'}`}>
          {verdictVisible && (
            <>
              <StarRating
                value={ratingValue}
                onChange={(next) => update('rating', next === null ? '' : String(next))}
              />
              <FavoriteHeart checked={values.isFavorite} onChange={(next) => update('isFavorite', next)} />
            </>
          )}
        </div>
      </div>

      <div className="form-body">
        <div className="form-body-scroll">
        <div className={`field field-title ${assisted ? 'field-title-read' : ''}`}>
          <input
            id="title"
            name="title"
            value={values.title}
            onChange={(event) => update('title', event.target.value)}
            aria-label="Titre du film"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? 'title-error' : undefined}
            autoFocus={!assisted}
          />
          {errors.title && <p className="field-error" id="title-error">{errors.title}</p>}
        </div>

        {/* Statut et date restent dans la colonne de travail. Le verdict visuel
            vit désormais sous l’affiche. */}
        <div className="verdict-block film-status-block">
          <div className="verdict-row">
            <StatusSegmented
              statuses={statusSegments}
              labels={FILM_STATUS_LABELS}
              value={values.status}
              onChange={(next) => update('status', next as FilmFormValues['status'])}
            />
          </div>
          {errors.status && <p className="field-error">{errors.status}</p>}

          {verdictVisible && (
            <>
              <div className="date-row">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                <input
                  id="watchedAt"
                  name="watchedAt"
                  type="date"
                  value={values.watchedAt || today}
                  onChange={(event) => update('watchedAt', event.target.value)}
                  aria-label="Date de visionnage"
                  aria-invalid={Boolean(errors.watchedAt)}
                />
              </div>
              {errors.watchedAt && <p className="field-error">{errors.watchedAt}</p>}
            </>
          )}
        </div>

        {hasProviderFacts && (
          <section className="film-provider-facts" aria-label="Informations du film">
            <header>
              <span>Informations du film</span>
              <small>TMDB</small>
            </header>
            <dl>
              {providerRelease && <div><dt>Sortie</dt><dd>{providerRelease}</dd></div>}
              {providerRuntime && <div><dt>Durée</dt><dd>{providerRuntime}</dd></div>}
              {providerDirectors && <div><dt>Réalisation</dt><dd>{providerDirectors}</dd></div>}
              {providerCast && <div><dt>Avec</dt><dd>{providerCast}</dd></div>}
              {providerOriginalTitle && providerOriginalTitle !== values.title.trim() && (
                <div><dt>Titre original</dt><dd>{providerOriginalTitle}</dd></div>
              )}
            </dl>
          </section>
        )}

        {/* L’avis occupe l’espace libre sous le verdict, dans la colonne droite.
            Le passage à Terminé ne crée plus une rangée sous l’affiche. */}
        {verdictVisible && (
          <div className="review-write review-inline">
            <textarea
              id="personalNote"
              name="personalNote"
              rows={5}
              placeholder="Qu’as-tu pensé de ce film ?"
              value={values.personalNote}
              onChange={(event) => update('personalNote', event.target.value)}
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        )}

        {/* Champs éditoriaux toujours visibles en modification (0.6.19) :
            plus de repli — on voit ce que la fiche contient, et une fiche
            non enrichie se complète ici sans rien déplier. */}
        {!assisted && (
          <div className="secondary-fields editorial-open">
            {isAssociated && (
              <p className="import-hint">Ces informations viennent de TMDB — complète-les seulement si tu le souhaites.</p>
            )}
            <div className="form-row">
              <div className="field">
                <label htmlFor="originalTitle">Titre original</label>
                <input id="originalTitle" value={values.originalTitle} onChange={(event) => update('originalTitle', event.target.value)} />
              </div>
              <div className="field field-year">
                <label htmlFor="year">Année</label>
                <input
                  id="year"
                  inputMode="numeric"
                  value={values.year}
                  onChange={(event) => update('year', event.target.value)}
                  aria-invalid={Boolean(errors.year)}
                  aria-describedby={errors.year ? 'year-error' : undefined}
                />
                {errors.year && <p className="field-error" id="year-error">{errors.year}</p>}
              </div>
            </div>
            <div className="field">
              <label htmlFor="director">Réalisation</label>
              <input id="director" value={values.director} onChange={(event) => update('director', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="summary">Résumé</label>
              <textarea
                id="summary"
                rows={3}
                value={values.summary}
                onChange={(event) => update('summary', event.target.value)}
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          </div>
        )}

        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        </div>

        <footer className="form-actions form-actions-docked">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Annuler</button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : film ? 'Enregistrer les modifications' : 'Ajouter le film'}
          </button>
        </footer>
      </div>
    </form>
  )

  const posterEditor = posterDialogOpen && (
    <PosterUrlDialog
      open
      title={previewTitle}
      label="Affiche"
      currentUrl={values.posterUrl}
      onClose={() => setPosterDialogOpen(false)}
      onSave={async (url) => {
        update('posterUrl', url ?? '')
        await onPosterEdit?.(url)
      }}
    />
  )

  if (asDialog) {
    return (
      <>
        <div className="dialog-backdrop-blur" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}>
          <div className="editor-dialog" role="dialog" aria-modal="true" aria-label={film ? 'Modifier la fiche' : 'Ajouter un film'}>
            <button className="poster-dialog-close editor-dialog-close" type="button" onClick={onCancel} disabled={saving} aria-label="Fermer">×</button>
            {heading}
            {form}
          </div>
        </div>
        {posterEditor}
      </>
    )
  }

  // Pop-up hôte (0.6.9) : en-tête compact et formulaire rendus directement
  // dans la fenêtre, sans <main> pleine page ni barre « ← Annuler » en double.
  if (embeddedInDialog) {
    return (
      <div className="editor-dialog-embedded">
        {heading}
        {form}
      </div>
    )
  }

  return (
    <main className="main editor-main">
      <header className="page-action-bar">
        <button className="back-button" type="button" onClick={onCancel}>← Annuler</button>
      </header>
      {heading}
      {form}
      {posterEditor}
    </main>
  )
}
