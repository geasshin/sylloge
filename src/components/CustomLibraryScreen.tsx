import { useEffect, useMemo, useState } from 'react'
import { formatDate, formatNumber, getLanguage, getLocale, t, tc, translateMessage } from '../i18n/core.ts'
import { QuotesSection } from './Quotes.tsx'
import {
  CUSTOM_LIBRARY_TEMPLATES,
  type CustomEntry,
  type CustomEntryWriteInput,
  type CustomLibraryId,
  type CustomFieldDefinition,
  type CustomStatus,
} from '../domain/customLibraries.ts'
import { customLibraryRepository } from '../data/customLibraryRepository.ts'
import { AccessibleDialog } from './AccessibleDialog.tsx'
import { CustomEntryForm, customCoverLabel } from './CustomEntryForm.tsx'
import { FocusDialog } from './FocusDialog.tsx'
import { Poster } from './Poster.tsx'
import { PosterUrlDialog } from './PosterUrlDialog.tsx'
import { Select } from './Select.tsx'
import { StatusBadge, statusTone } from './VerdictControls.tsx'
import { SearchIcon, ArrowLeftIcon, PencilIcon, TrashIcon } from './icons.tsx'

type CustomSort = 'title' | 'recent' | 'rating' | 'year'

const SORT_OPTIONS: ReadonlyArray<{ value: CustomSort; label: string }> = [
  { value: 'title', label: 'Titre' },
  { value: 'recent', label: 'Ajout récent' },
  { value: 'rating', label: 'Note' },
  { value: 'year', label: 'Année' },
]

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; entries: CustomEntry[] }
  | { status: 'error' }

type FormState = { mode: 'create' } | { mode: 'edit'; entry: CustomEntry; quoteDraft?: boolean } | null

type CustomLibraryScreenProps = {
  libraryId: CustomLibraryId
  profileId: string
  profileName: string
  /** Fiche ouverte, portée par la vue de l’application (retour arrière). */
  entryId: string | null
  onOpenEntry: (entryId: string | null) => void
  /** Après chaque écriture : comptes de la barre latérale et sauvegarde. */
  onChanged: () => void
  /** Après suppression de la bibliothèque. */
  onRemoved: () => void
}

function formatCalendarDate(value: string): string {
  return formatDate(value, { dateStyle: 'long' })
}

function normalizedText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase(getLocale())
}

// Only catalogue choices are translated; free-form and imported values stay opaque.
// A label from the library template takes its library context: « Dessin » is a
// drawing in general, but the illustrator credit in Comics.
function displayFieldValue(libraryId: CustomLibraryId, field: CustomFieldDefinition | undefined, value: string): string {
  return field?.kind === 'select' && field.options?.includes(value) ? tc(libraryId, value) : value
}

function progressText(entry: CustomEntry): string | null {
  if (entry.progressCurrent === null && entry.progressTotal === null) return null
  if (entry.progressTotal === null) return formatNumber(entry.progressCurrent ?? 0)
  return `${formatNumber(entry.progressCurrent ?? 0)} / ${formatNumber(entry.progressTotal)}`
}

function sortEntries(entries: CustomEntry[], sort: CustomSort): CustomEntry[] {
  const byTitle = (first: CustomEntry, second: CustomEntry) => first.title.localeCompare(second.title, getLocale(), { sensitivity: 'base' })
  const sorted = [...entries]
  if (sort === 'recent') sorted.sort((first, second) => second.createdAt.localeCompare(first.createdAt) || byTitle(first, second))
  else if (sort === 'rating') sorted.sort((first, second) => (second.rating ?? -1) - (first.rating ?? -1) || byTitle(first, second))
  else if (sort === 'year') sorted.sort((first, second) => (second.year ?? -Infinity) - (first.year ?? -Infinity) || byTitle(first, second))
  else sorted.sort(byTitle)
  return sorted
}

/**
 * Écran d’une bibliothèque personnalisée : liste, fiche et formulaire. Il lit
 * et écrit sa propre table ; l’application ne garde que la fiche ouverte.
 */
export function CustomLibraryScreen({ libraryId, profileId, profileName, entryId, onOpenEntry, onChanged, onRemoved }: CustomLibraryScreenProps) {
  const template = CUSTOM_LIBRARY_TEMPLATES[libraryId]
  const language = getLanguage()
  /** Template copy keeps its library context (« Dessin » = Illustrator in Comics). */
  const label = (source: string) => tc(libraryId, source)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<CustomStatus | 'all'>('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [sort, setSort] = useState<CustomSort>('title')
  const [form, setForm] = useState<FormState>(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    customLibraryRepository.list(profileId, libraryId).then(
      (entries) => { if (!cancelled) setState({ status: 'ready', entries }) },
      (error: unknown) => {
        console.error('Impossible de lire la bibliothèque depuis SQLite.', error)
        if (!cancelled) setState({ status: 'error' })
      },
    )
    return () => { cancelled = true }
  }, [attempt, libraryId, profileId])

  const entries = state.status === 'ready' ? state.entries : []
  const kindField = template.kindField ? template.fields.find((field) => field.key === template.kindField) ?? null : null
  const kindOptions = useMemo(() => {
    if (!kindField) return []
    const present = new Set(entries.map((entry) => entry.details[kindField.key]).filter((value): value is string => Boolean(value)))
    const ordered = [...(kindField.options ?? []).filter((option) => present.has(option)), ...[...present].filter((value) => !(kindField.options ?? []).includes(value))]
    return ordered
  }, [entries, kindField])

  const visible = useMemo(() => {
    const needle = normalizedText(query.trim())
    const filtered = entries.filter((entry) => {
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false
      if (kindField && kindFilter !== 'all' && entry.details[kindField.key] !== kindFilter) return false
      if (!needle) return true
      const haystack = [entry.title, entry.creator ?? '', ...Object.values(entry.details)].join(' ')
      return normalizedText(haystack).includes(needle)
    })
    return sortEntries(filtered, sort)
  }, [entries, kindField, kindFilter, language, query, sort, statusFilter])

  const isFiltered = query.trim() !== '' || statusFilter !== 'all' || kindFilter !== 'all'
  const favorites = entries.filter((entry) => entry.isFavorite).length
  const noun = new Intl.PluralRules(getLocale()).select(entries.length) === 'one' ? template.singular : template.plural
  const countLabel = `${formatNumber(entries.length)} ${t(noun)}`
  const subtitle = favorites > 0
    ? t(favorites === 1 ? '{countLabel} dont {count} coup de cœur' : '{countLabel} dont {count} coups de cœur', { countLabel, count: formatNumber(favorites) })
    : countLabel
  const openEntry = entryId ? entries.find((entry) => entry.id === entryId) ?? null : null

  const replaceEntry = (updated: CustomEntry) => {
    setState((current) => current.status === 'ready'
      ? { status: 'ready', entries: current.entries.some((entry) => entry.id === updated.id) ? current.entries.map((entry) => entry.id === updated.id ? updated : entry) : [...current.entries, updated] }
      : current)
  }

  const save = async (input: CustomEntryWriteInput) => {
    if (!form) return
    const saved = form.mode === 'edit'
      ? await customLibraryRepository.update(profileId, libraryId, form.entry.id, input)
      : await customLibraryRepository.create(profileId, libraryId, input)
    replaceEntry(saved)
    setForm(null)
    onChanged()
    onOpenEntry(saved.id)
  }

  const removeEntry = async (entry: CustomEntry) => {
    await customLibraryRepository.delete(profileId, libraryId, entry.id)
    setState((current) => current.status === 'ready' ? { status: 'ready', entries: current.entries.filter((candidate) => candidate.id !== entry.id) } : current)
    onChanged()
    onOpenEntry(null)
  }

  const formDialog = form && (
    <div className="dialog-backdrop-blur" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setForm(null) }}>
      <FocusDialog
        className="editor-dialog dialog-add-flow"
        onClose={() => setForm(null)}
        aria-label={form.mode === 'edit' ? t('Modifier la fiche') : label(template.addLabel)}
      >
        <button className="poster-dialog-close editor-dialog-close" type="button" onClick={() => setForm(null)} aria-label={t('Fermer')}>×</button>
        <CustomEntryForm
          libraryId={libraryId}
          entry={form.mode === 'edit' ? form.entry : undefined}
          initialQuoteDraft={form.mode === 'edit' && form.quoteDraft === true}
          onCancel={() => setForm(null)}
          onSave={save}
        />
      </FocusDialog>
    </div>
  )

  if (entryId) {
    return (
      <>
        {openEntry ? (
          <CustomEntryDetail
            libraryId={libraryId}
            entry={openEntry}
            onBack={() => onOpenEntry(null)}
            onEdit={(options) => setForm({ mode: 'edit', entry: openEntry, quoteDraft: options?.addQuote === true })}
            onCoverEdit={async (url) => {
              await customLibraryRepository.setCover(profileId, libraryId, openEntry.id, url)
              replaceEntry({ ...openEntry, coverUrl: url })
              onChanged()
            }}
            onDelete={() => removeEntry(openEntry)}
          />
        ) : (
          <main className="main detail-page-main">
            <header className="page-action-bar detail-action-bar">
              <button className="back-button back-button-icon" type="button" onClick={() => onOpenEntry(null)} aria-label={t('Retour à {library}', { library: label(template.label) })}><ArrowLeftIcon /></button>
            </header>
            <div className={`library-state ${state.status === 'loading' ? '' : 'error-state'}`} role={state.status === 'loading' ? 'status' : 'alert'}>
              <h2>{t(state.status === 'loading' ? 'Chargement de la fiche' : 'Cette fiche ne peut pas être ouverte.')}</h2>
            </div>
          </main>
        )}
        {formDialog}
      </>
    )
  }

  return (
    <main className={`main library-main custom-library-main custom-library-${template.coverShape}`} aria-label={t('Bibliothèque {library} du profil {profile}', { library: label(template.label), profile: profileName })}>
      <header className="library-header">
        <div>
          <h1 className="display-title">{label(template.label)}</h1>
          <p className="library-subtitle">{state.status === 'ready' ? subtitle : '\u00a0'}</p>
        </div>
        <div className="library-header-actions">
          <button className="icon-action-button icon-action-danger" type="button" onClick={() => setRemoving(true)} title={t('Supprimer la bibliothèque {library}', { library: label(template.label) })} aria-label={t('Supprimer la bibliothèque {library}', { library: label(template.label) })}>
            <TrashIcon />
          </button>
          <button className="primary-button" type="button" onClick={() => setForm({ mode: 'create' })}>{label(template.addLabel)}</button>
        </div>
      </header>

      <div className="library-tools custom-library-tools">
        <label className="search">
          <SearchIcon />
          <span className="visually-hidden">{t('Rechercher dans {library}', { library: label(template.label) })}</span>
          <input type="search" value={query} placeholder={t('Titre, {creator}…', { creator: label(template.creatorLabel).toLocaleLowerCase(getLocale()) })} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="seg-group-form library-views custom-status-filter" role="radiogroup" aria-label={t('Statut')}>
          {(['all', ...template.statuses] as const).map((status) => (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={statusFilter === status}
              className={`seg-pill-btn ${statusFilter === status ? 'on' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {t(status === 'all' ? 'Tous' : template.statusLabels[status])}
            </button>
          ))}
        </div>
        <div className="custom-library-selects">
          {kindField && kindOptions.length > 0 && (
            <div className="custom-select">
              <span className="visually-hidden" id={`custom-${libraryId}-kind-label`}>{label(kindField.label)}</span>
              <Select
                id={`custom-${libraryId}-kind`}
                labelledBy={`custom-${libraryId}-kind-label`}
                value={kindFilter}
                options={[{ value: 'all', label: t('{field} : tous', { field: label(kindField.label) }) }, ...kindOptions.map((option) => ({ value: option, label: kindField.options?.includes(option) ? label(option) : option }))]}
                onChange={setKindFilter}
              />
            </div>
          )}
          <div className="custom-select">
            <span className="visually-hidden" id={`custom-${libraryId}-sort-label`}>{t('Trier')}</span>
            <Select
              id={`custom-${libraryId}-sort`}
              labelledBy={`custom-${libraryId}-sort-label`}
              value={sort}
              options={SORT_OPTIONS.map((option) => ({ value: option.value, label: t('Tri : {sort}', { sort: t(option.label).toLocaleLowerCase(getLocale()) }) }))}
              onChange={(next) => setSort(next as CustomSort)}
            />
          </div>
        </div>
      </div>

      {state.status === 'loading' ? (
        <div className="results-state" role="status">{t('Lecture de la bibliothèque…')}</div>
      ) : state.status === 'error' ? (
        <div className="results-state error-state" role="alert">
          <h2>{t('La bibliothèque n’a pas pu être lue.')}</h2>
          <p>{t('Vos fiches restent enregistrées. Réessayez pour les relire depuis SQLite.')}</p>
          <button className="state-action" type="button" onClick={() => setAttempt((value) => value + 1)}>{t('Réessayer')}</button>
        </div>
      ) : entries.length === 0 ? (
        <div className="library-state empty-library">
          <h2>{t('Votre bibliothèque {library} est vide.', { library: label(template.label) })}</h2>
          <p>{t('Ajoutez une première fiche ; seul le titre est obligatoire.')}</p>
          <button className="primary-button empty-action" type="button" onClick={() => setForm({ mode: 'create' })}>{label(template.addLabel)}</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="results-state empty-results">
          <h2>{t('Aucune fiche ne correspond.')}</h2>
          <p>{t('Modifiez la recherche ou revenez à toute la bibliothèque.')}</p>
          {isFiltered && (
            <button className="state-action" type="button" onClick={() => { setQuery(''); setStatusFilter('all'); setKindFilter('all') }}>
              {t('Afficher toute la bibliothèque')}
            </button>
          )}
        </div>
      ) : (
        <div className="film-grid custom-grid" aria-busy="false">
          {visible.map((entry) => (
            <CustomEntryCard libraryId={libraryId} entry={entry} key={entry.id} onOpen={() => onOpenEntry(entry.id)} />
          ))}
        </div>
      )}

      {formDialog}
      {removing && (
        <RemoveLibraryDialog
          libraryId={libraryId}
          entryCount={entries.length}
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            await customLibraryRepository.remove(profileId, libraryId)
            setRemoving(false)
            onRemoved()
          }}
        />
      )}
    </main>
  )
}

function CustomEntryCard({ libraryId, entry, onOpen }: { libraryId: CustomLibraryId; entry: CustomEntry; onOpen: () => void }) {
  const template = CUSTOM_LIBRARY_TEMPLATES[libraryId]
  const kindField = template.fields.find((field) => field.key === template.kindField)
  const kind = template.kindField ? entry.details[template.kindField] : undefined
  const byline = [kind ? displayFieldValue(libraryId, kindField, kind) : null, entry.creator, entry.year !== null ? formatNumber(entry.year, { useGrouping: false }) : null].filter(Boolean).join(' · ')
  const progress = template.progress && entry.status !== 'à découvrir' ? progressText(entry) : null
  return (
    <button className="film-card custom-card" type="button" onClick={onOpen} aria-label={t('Ouvrir la fiche de {title}', { title: entry.title })}>
      <Poster title={entry.title} src={entry.coverUrl} label={customCoverLabel(libraryId)} className={template.coverShape === 'square' ? 'poster-square' : ''} />
      <span className="film-card-info">
        <span className="film-card-top">
          <b>{entry.title}</b>
          {entry.isFavorite && <i aria-label={t('Favori')}>♥</i>}
        </span>
        {byline && <small>{byline}</small>}
        <span className={`status-line tone-${statusTone(entry.status)}`}>
          {t(template.statusLabels[entry.status])}
          {progress ? ` · ${progress}` : ''}
        </span>
      </span>
    </button>
  )
}

function CustomEntryDetail({ libraryId, entry, onBack, onEdit, onCoverEdit, onDelete }: {
  libraryId: CustomLibraryId
  entry: CustomEntry
  onBack: () => void
  onEdit: (options?: { addQuote?: boolean }) => void
  onCoverEdit: (url: string | null) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const template = CUSTOM_LIBRARY_TEMPLATES[libraryId]
  /** Template copy keeps its library context in English; French is unchanged. */
  const label = (source: string) => tc(libraryId, source)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [posterDialogOpen, setPosterDialogOpen] = useState(false)
  const kind = template.kindField ? entry.details[template.kindField] : undefined
  const progress = progressText(entry)
  const extraDetails = Object.entries(entry.details).filter(([key]) => !template.fields.some((field) => field.key === key))

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch (error) {
      console.error('Impossible de supprimer la fiche.', error)
      setDeleteError('La suppression a échoué. La fiche est toujours dans la bibliothèque.')
      setDeleting(false)
    }
  }

  return (
    <main className="main detail-page-main">
      <header className="page-action-bar detail-action-bar">
        <button className="back-button back-button-icon" type="button" onClick={onBack} aria-label={t('Retour à {library}', { library: label(template.label) })}><ArrowLeftIcon /></button>
        <div className="detail-actions">
          <button className="icon-action-button" type="button" onClick={() => onEdit()} title={t('Modifier la fiche')}>
            <PencilIcon />
            <span>{t('Modifier')}</span>
          </button>
          <button className="icon-action-button icon-action-danger" type="button" onClick={() => setConfirmingDelete(true)} title={t('Supprimer {entry}', { entry: label(template.thisLabel) })}>
            <TrashIcon />
          </button>
        </div>
      </header>

      <article className="detail-layout">
        <div className="detail-side">
          <div className="poster-container detail-poster-wrap">
            <Poster
              title={entry.title}
              src={entry.coverUrl}
              className={`detail-poster ${template.coverShape === 'square' ? 'poster-square' : ''}`}
              label={customCoverLabel(libraryId)}
              onEdit={() => setPosterDialogOpen(true)}
            />
          </div>
          <div className="detail-status">
            <StatusBadge status={entry.status} labels={Object.fromEntries(Object.entries(template.statusLabels).map(([status, label]) => [status, t(label)]))} />
          </div>
          {(entry.rating !== null || entry.isFavorite) && (
            <div className="detail-rate">
              {entry.rating !== null && (
                <>
                  <span className="stars-display" aria-label={t('Note {rating} sur 5', { rating: formatNumber(entry.rating) })}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      const fill = Math.max(0, Math.min(1, (entry.rating ?? 0) - star + 1))
                      return (
                        <span key={star} className={`star-slot ${fill > 0 ? 'filled' : ''}`}>
                          <span className="star-glyph" aria-hidden="true">★</span>
                          <span className="star-fill" style={{ width: `${fill * 100}%` }} aria-hidden="true">★</span>
                        </span>
                      )
                    })}
                  </span>
                  <span className="rate-value">{formatNumber(entry.rating)}/5</span>
                </>
              )}
              {entry.isFavorite && <span className="heart-display on" aria-label={t('Coup de cœur')}>♥</span>}
            </div>
          )}
        </div>

        <div className="detail-body">
          <p className="eyebrow">{kind ? displayFieldValue(libraryId, template.fields.find((field) => field.key === template.kindField), kind) : label(template.label)}</p>
          <h1 className="display-title">{entry.title}</h1>
          {(entry.creator || entry.year !== null) && (
            <p className="detail-factline">{[entry.creator, entry.year !== null ? formatNumber(entry.year, { useGrouping: false }) : null].filter(Boolean).join(' · ')}</p>
          )}

          <dl className="detail-facts">
            {entry.creator && <div><dt>{label(template.creatorLabel)}</dt><dd>{entry.creator}</dd></div>}
            {entry.year !== null && <div><dt>{t('Année')}</dt><dd>{formatNumber(entry.year as number, { useGrouping: false })}</dd></div>}
            {template.fields.filter((field) => field.key !== template.kindField && entry.details[field.key]).map((field) => (
              <div key={field.key}><dt>{label(field.label)}</dt><dd>{displayFieldValue(libraryId, field, entry.details[field.key])}</dd></div>
            ))}
            {extraDetails.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
            {template.progress && progress && <div><dt>{label(template.progress.label)}</dt><dd>{progress}</dd></div>}
            {entry.finishedAt && <div><dt>{label(template.dateLabel)}</dt><dd>{formatCalendarDate(entry.finishedAt)}</dd></div>}
          </dl>

          {entry.summary && (
            <div className="synopsis-block">
              <p>{entry.summary}</p>
            </div>
          )}

          <section className="mine-block">
            {entry.personalNote ? (
              <>
                <blockquote className="review-personal">{entry.personalNote}</blockquote>
                <button className="link-accent review-edit-link" type="button" onClick={() => onEdit()}>{t('Modifier')}</button>
              </>
            ) : (
              <p className="mine-empty">{t('Ton avis s’écrira ici.')}</p>
            )}

          </section>
          {template.quotes && <QuotesSection quotes={entry.quotes} onEdit={onEdit} />}
        </div>
      </article>

      {confirmingDelete && (
        <div className="confirm-backdrop">
          <div className="delete-confirmation" role="alertdialog" aria-labelledby="custom-delete-title" aria-describedby="custom-delete-description">
            <h2 id="custom-delete-title">{t('Supprimer définitivement {entry} ?', { entry: label(template.thisLabel) })}</h2>
            <p id="custom-delete-description">{t('« {title} » sera retiré de la bibliothèque {library} sans possibilité de restauration.', { title: entry.title, library: label(template.label) })}</p>
            {deleteError && <p className="field-error" role="alert">{translateMessage(deleteError)}</p>}
            <div>
              <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>{t('Annuler')}</button>
              <button className="danger-button" type="button" onClick={() => void confirmDelete()} disabled={deleting}>
                {t(deleting ? 'Suppression…' : 'Supprimer définitivement')}
              </button>
            </div>
          </div>
        </div>
      )}
      <PosterUrlDialog
        open={posterDialogOpen}
        title={entry.title}
        label={customCoverLabel(libraryId)}
        currentUrl={entry.coverUrl}
        onClose={() => setPosterDialogOpen(false)}
        onSave={onCoverEdit}
      />
    </main>
  )
}

function RemoveLibraryDialog({ libraryId, entryCount, onClose, onConfirm }: {
  libraryId: CustomLibraryId
  entryCount: number
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const template = CUSTOM_LIBRARY_TEMPLATES[libraryId]
  /** Template copy keeps its library context in English; French is unchanged. */
  const label = (source: string) => tc(libraryId, source)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const entriesLabel = entryCount === 1 ? t('sa fiche') : t('ses {count} fiches', { count: formatNumber(entryCount) })

  const confirm = async () => {
    setPending(true)
    setError(null)
    try {
      await onConfirm()
    } catch (cause) {
      console.error('Impossible de supprimer la bibliothèque.', cause)
      setError('La suppression a échoué. La bibliothèque est toujours là ; réessayez.')
      setPending(false)
    }
  }

  return (
    <AccessibleDialog
      title={t('Supprimer la bibliothèque {library} ?', { library: label(template.label) })}
      description={entryCount === 0
        ? t('Elle disparaîtra de la barre latérale. Vous pourrez l’ajouter de nouveau plus tard.')
        : t('La bibliothèque et {entries} seront supprimées définitivement de ce profil. Les sauvegardes JSON déjà écrites ne sont pas modifiées.', { entries: entriesLabel })}
      closeDisabled={pending}
      onClose={onClose}
      size="sm"
    >
      <div className="assistant-content">
        {error && <p className="validation-errors" role="alert">{translateMessage(error)}</p>}
        <div className="assistant-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={pending}>{t('Annuler')}</button>
          <button className="danger-button" type="button" onClick={() => void confirm()} disabled={pending}>
            {pending ? t('Suppression…') : entryCount === 0 ? t('Supprimer la bibliothèque') : t('Supprimer la bibliothèque et {entries}', { entries: entriesLabel })}
          </button>
        </div>
      </div>
    </AccessibleDialog>
  )
}
