import { useRef, useState } from 'react'
import type { Book } from '../domain/book.ts'
import type { Film } from '../domain/film.ts'
import type { Series } from '../domain/series.ts'
import { parseBooksCollectionJson, parseFilmsCollectionJson, parseSeriesCollectionJson } from '../domain/collectionJsonImport.ts'
import type { PickedFilmsImportFile } from '../domain/filmCsvImport.ts'
import {
  planBookMerge,
  planFilmMerge,
  planSeriesMerge,
  type BookDuplicate,
  type DuplicateResolution,
  type FilmDuplicate,
  type SeriesDuplicate,
} from '../domain/importMerge.ts'
import {
  prepareBooksImport,
  prepareFilmsImport,
  prepareSeriesImport,
  writeBooksImport,
  writeFilmsImport,
  writeSeriesImport,
  type ImportMode,
} from '../data/libraryTransferService.ts'
import { pickImportAny, pickImportJson } from '../data/nativePortability.ts'
import { AccessibleDialog } from './Portability.tsx'
import { DuplicatesResolver, ImportModeChoice, bookSummary, filmSummary, seriesSummary } from './CollectionImportFlow.tsx'
import { FilmCsvImportFlow } from './FilmCsvImportFlow.tsx'

type ImportStep = 'choose-file' | 'external-preview' | 'mode' | 'duplicates' | 'working' | 'done'

type BaseProps = {
  buttonLabel: string
  mediumLabel: string
  profileName: string
  onDone: () => void
}

type FilmsImportProps = BaseProps & {
  kind: 'films'
  profileId: string
  existing: Film[]
}

type SeriesImportProps = BaseProps & {
  kind: 'series'
  profileId: string
  existing: Series[]
}

type BooksImportProps = BaseProps & {
  kind: 'books'
  profileId: string
  existing: Book[]
}

export function LibraryImportButton(props: FilmsImportProps | SeriesImportProps | BooksImportProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<ImportStep>('choose-file')
  const [choosingFile, setChoosingFile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [importedCount, setImportedCount] = useState(0)
  const [report, setReport] = useState<string | null>(null)
  const [externalFilmSource, setExternalFilmSource] = useState<PickedFilmsImportFile | null>(null)
  const writingRef = useRef(false)

  // Films state
  const [filmsImported, setFilmsImported] = useState<Film[]>([])
  const [filmDuplicates, setFilmDuplicates] = useState<FilmDuplicate[]>([])
  const [filmResolutions, setFilmResolutions] = useState<Map<string, DuplicateResolution>>(new Map())
  const [filmsMode, setFilmsMode] = useState<ImportMode>('merge')

  // Series state
  const [seriesImported, setSeriesImported] = useState<Series[]>([])
  const [seriesDuplicates, setSeriesDuplicates] = useState<SeriesDuplicate[]>([])
  const [seriesResolutions, setSeriesResolutions] = useState<Map<string, DuplicateResolution>>(new Map())
  const [seriesMode, setSeriesMode] = useState<ImportMode>('merge')

  // Books state
  const [booksImported, setBooksImported] = useState<Book[]>([])
  const [bookDuplicates, setBookDuplicates] = useState<BookDuplicate[]>([])
  const [bookResolutions, setBookResolutions] = useState<Map<string, DuplicateResolution>>(new Map())
  const [booksMode, setBooksMode] = useState<ImportMode>('merge')

  const reset = () => {
    setStep('choose-file')
    setChoosingFile(false)
    setError(null)
    setFileName(null)
    setImportedCount(0)
    setReport(null)
    setExternalFilmSource(null)
    setFilmsImported([])
    setFilmDuplicates([])
    setFilmResolutions(new Map())
    setSeriesImported([])
    setSeriesDuplicates([])
    setSeriesResolutions(new Map())
    setBooksImported([])
    setBookDuplicates([])
    setBookResolutions(new Map())
  }

  const close = () => {
    if (step === 'working') return
    setOpen(false)
    reset()
  }

  const pickAndPrepare = async () => {
    if (choosingFile) return
    setChoosingFile(true)
    setError(null)
    try {
      if (props.kind === 'films') {
        const picked = await pickImportAny()
        if (!picked) {
          setError('Sélection annulée. Aucune donnée n’a été écrite.')
          return
        }
        setFileName(picked.name)
        if (picked.kind !== 'json') {
          setExternalFilmSource({
            name: picked.name,
            kind: picked.kind,
            csvCandidates: picked.csvCandidates,
            markdownPages: picked.markdownPages,
          })
          setStep('external-preview')
          return
        }
        const parsed = parseFilmsCollectionJson(picked.contents)
        if (parsed.items === null) {
          setError(parsed.error)
          return
        }
        setFilmsImported(parsed.items)
        setImportedCount(parsed.items.length)
      } else if (props.kind === 'series') {
        const picked = await pickImportJson()
        if (!picked) {
          setError('Sélection annulée. Aucune donnée n’a été écrite.')
          return
        }
        setFileName(picked.name)
        const parsed = parseSeriesCollectionJson(picked.contents)
        if (parsed.items === null) {
          setError(parsed.error)
          return
        }
        setSeriesImported(parsed.items)
        setImportedCount(parsed.items.length)
      } else {
        const picked = await pickImportJson()
        if (!picked) {
          setError('Sélection annulée. Aucune donnée n’a été écrite.')
          return
        }
        setFileName(picked.name)
        const parsed = parseBooksCollectionJson(picked.contents)
        if (parsed.items === null) {
          setError(parsed.error)
          return
        }
        setBooksImported(parsed.items)
        setImportedCount(parsed.items.length)
      }
      setStep('mode')
    } catch (cause) {
      console.error('Impossible de lire le fichier d’import.', cause)
      setError('Le fichier choisi n’a pas pu être lu. Aucune donnée n’a été écrite.')
    } finally {
      setChoosingFile(false)
    }
  }

  const acceptExternalFilms = (films: Film[]) => {
    setFilmsImported(films)
    setImportedCount(films.length)
    setStep('mode')
  }

  const chooseMode = (mode: ImportMode) => {
    if (props.kind === 'films') {
      setFilmsMode(mode)
      if (mode === 'merge') {
        const plan = planFilmMerge(props.existing, filmsImported)
        setFilmDuplicates(plan.duplicates)
        setFilmResolutions(new Map(plan.duplicates.map((duplicate) => [duplicate.normalizedTitle, 'keep-existing'])))
        setStep(plan.duplicates.length > 0 ? 'duplicates' : 'working')
        if (plan.duplicates.length === 0) void confirmImport('merge', new Map(), filmsImported)
      } else {
        void confirmImport('replace', new Map(), filmsImported)
      }
    } else if (props.kind === 'series') {
      setSeriesMode(mode)
      if (mode === 'merge') {
        const plan = planSeriesMerge(props.existing, seriesImported)
        setSeriesDuplicates(plan.duplicates)
        setSeriesResolutions(new Map(plan.duplicates.map((duplicate) => [duplicate.normalizedTitle, 'keep-existing'])))
        setStep(plan.duplicates.length > 0 ? 'duplicates' : 'working')
        if (plan.duplicates.length === 0) void confirmImport('merge', new Map(), seriesImported)
      } else {
        void confirmImport('replace', new Map(), seriesImported)
      }
    } else {
      setBooksMode(mode)
      if (mode === 'merge') {
        const plan = planBookMerge(props.existing, booksImported)
        setBookDuplicates(plan.duplicates)
        setBookResolutions(new Map(plan.duplicates.map((duplicate) => [duplicate.normalizedTitle, 'keep-existing'])))
        setStep(plan.duplicates.length > 0 ? 'duplicates' : 'working')
        if (plan.duplicates.length === 0) void confirmImport('merge', new Map(), booksImported)
      } else {
        void confirmImport('replace', new Map(), booksImported)
      }
    }
  }

  const confirmImport = async (
    mode: ImportMode,
    resolutions: Map<string, DuplicateResolution>,
    imported: Book[] | Film[] | Series[],
  ) => {
    if (writingRef.current) return
    writingRef.current = true
    setStep('working')
    setError(null)
    try {
      if (props.kind === 'films') {
        const prepared = prepareFilmsImport(mode, props.existing, imported as Film[])
        const result = await writeFilmsImport(props.profileId, prepared, resolutions)
        setReport(`${result.inserted} film${result.inserted > 1 ? 's' : ''} ajouté${result.inserted > 1 ? 's' : ''}, ${result.updated} mis à jour${result.removed > 0 ? `, ${result.removed} remplacé${result.removed > 1 ? 's' : ''}` : ''}.`)
      } else if (props.kind === 'series') {
        const prepared = prepareSeriesImport(mode, props.existing, imported as Series[])
        const result = await writeSeriesImport(props.profileId, prepared, resolutions)
        setReport(`${result.inserted} série${result.inserted > 1 ? 's' : ''} ajoutée${result.inserted > 1 ? 's' : ''}, ${result.updated} mise${result.updated > 1 ? 's' : ''} à jour${result.removed > 0 ? `, ${result.removed} remplacée${result.removed > 1 ? 's' : ''}` : ''}.`)
      } else {
        const prepared = prepareBooksImport(mode, props.existing, imported as Book[])
        const result = await writeBooksImport(props.profileId, prepared, resolutions)
        setReport(`${result.inserted} livre${result.inserted > 1 ? 's' : ''} ajouté${result.inserted > 1 ? 's' : ''}, ${result.updated} mis à jour${result.removed > 0 ? `, ${result.removed} remplacé${result.removed > 1 ? 's' : ''}` : ''}.`)
      }
      setStep('done')
      props.onDone()
    } catch (cause) {
      console.error('L’import dans le profil courant a échoué.', cause)
      setError('L’import a échoué. La transaction a été annulée et votre collection n’a pas été modifiée.')
      setStep('mode')
    } finally {
      writingRef.current = false
    }
  }

  return (
    <>
      <button className="secondary-button" type="button" onClick={() => { reset(); setOpen(true) }}>
        {props.buttonLabel}
      </button>
      {open && (
        <AccessibleDialog
          title={`Importer des ${props.mediumLabel}s`}
          description="Choisissez d’abord le format. Le fichier sera ensuite analysé avant toute écriture."
          onClose={close}
          closeDisabled={step === 'working' || choosingFile}
        >
          {step === 'choose-file' && (
            <div className="assistant-content">
              <section className="assistant-stage">
                <p className="card-kicker">Formats acceptés</p>
                <h3>Choisir un fichier à analyser</h3>
                {props.kind === 'films' ? (
                  <>
                    <p>Tu peux importer un export Sylloge JSON, un tableau CSV UTF-8 ou un export Notion ZIP contenant sa table CSV et ses pages Markdown.</p>
                    <ul className="import-format-list">
                      <li><b>JSON</b> — export Films historique ou bibliothèque Sylloge complète</li>
                      <li><b>CSV</b> — export Sylloge ou tableau avec mapping explicite</li>
                      <li><b>ZIP Notion</b> — archive exportée par Notion, sans décompression manuelle</li>
                    </ul>
                  </>
                ) : props.kind === 'series' ? (
                  <p>Les Séries utilisent actuellement le format Sylloge JSON v2. Les imports CSV et Notion restent propres aux Films tant qu’aucun contrat Série n’est défini.</p>
                ) : (
                  <p>Les Livres utilisent le format Sylloge JSON v2, citations comprises. Les imports CSV et Notion restent propres aux Films tant qu’aucun contrat Livre n’est défini.</p>
                )}
                <p>Aucune donnée ne sera écrite avant l’aperçu puis ton choix Remplacer ou Fusionner.</p>
                <div className="assistant-actions">
                  <button className="secondary-button" type="button" onClick={close}>Annuler</button>
                  <button className="primary-button" type="button" disabled={choosingFile} onClick={() => void pickAndPrepare()}>
                    {choosingFile ? 'Choix du fichier…' : 'Choisir un fichier'}
                  </button>
                </div>
              </section>
            </div>
          )}
          {step === 'external-preview' && props.kind === 'films' && externalFilmSource !== null && (
            <FilmCsvImportFlow
              source={externalFilmSource}
              currentProfileName={props.profileName}
              onReady={acceptExternalFilms}
              onChooseAnother={() => {
                setExternalFilmSource(null)
                setFileName(null)
                setStep('choose-file')
                setError(null)
              }}
            />
          )}
          {step === 'mode' && (
            <ImportModeChoice
              mediumLabel={props.mediumLabel}
              importedCount={importedCount}
              existingCount={props.existing.length}
              onChoose={chooseMode}
              onCancel={close}
            />
          )}
          {step === 'duplicates' && props.kind === 'films' && (
            <DuplicatesResolver
              duplicates={filmDuplicates}
              resolutions={filmResolutions}
              onResolve={(normalizedTitle, resolution) => {
                setFilmResolutions((current) => new Map(current).set(normalizedTitle, resolution))
              }}
              onConfirm={() => void confirmImport(filmsMode, filmResolutions, filmsImported)}
              onBack={() => setStep('mode')}
              renderSummary={filmSummary}
            />
          )}
          {step === 'duplicates' && props.kind === 'series' && (
            <DuplicatesResolver
              duplicates={seriesDuplicates}
              resolutions={seriesResolutions}
              onResolve={(normalizedTitle, resolution) => {
                setSeriesResolutions((current) => new Map(current).set(normalizedTitle, resolution))
              }}
              onConfirm={() => void confirmImport(seriesMode, seriesResolutions, seriesImported)}
              onBack={() => setStep('mode')}
              renderSummary={seriesSummary}
            />
          )}
          {step === 'duplicates' && props.kind === 'books' && (
            <DuplicatesResolver
              duplicates={bookDuplicates}
              resolutions={bookResolutions}
              onResolve={(normalizedTitle, resolution) => {
                setBookResolutions((current) => new Map(current).set(normalizedTitle, resolution))
              }}
              onConfirm={() => void confirmImport(booksMode, bookResolutions, booksImported)}
              onBack={() => setStep('mode')}
              renderSummary={bookSummary}
            />
          )}
          {step === 'working' && (
            <div className="assistant-content">
              <p className="assistant-introduction">Import en cours…</p>
            </div>
          )}
          {step === 'done' && (
            <div className="assistant-content">
              <div className="import-report" role="status">
                <p className="card-kicker">Rapport final</p>
                <h3>Import terminé</h3>
                <ul>
                  {fileName && <li>Fichier lu : {fileName}</li>}
                  {report && <li>{report}</li>}
                  <li>Profil courant conservé</li>
                </ul>
              </div>
              <div className="assistant-actions">
                <button className="primary-button" type="button" onClick={close}>Fermer</button>
              </div>
            </div>
          )}
          {error && <p className="inline-report error" role="alert">{error}</p>}
        </AccessibleDialog>
      )}
    </>
  )
}
