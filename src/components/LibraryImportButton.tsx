import { useState } from 'react'
import type { Film } from '../domain/film.ts'
import type { Series } from '../domain/series.ts'
import { validateLibraryDocument } from '../domain/libraryDocument.ts'
import {
  planFilmMerge,
  planSeriesMerge,
  type DuplicateResolution,
  type FilmDuplicate,
  type SeriesDuplicate,
} from '../domain/importMerge.ts'
import {
  prepareFilmsImport,
  prepareSeriesImport,
  writeFilmsImport,
  writeSeriesImport,
  type ImportMode,
} from '../data/libraryTransferService.ts'
import { pickImportJson } from '../data/nativePortability.ts'
import { AccessibleDialog } from './Portability.tsx'
import { DuplicatesResolver, ImportModeChoice, filmSummary, seriesSummary } from './CollectionImportFlow.tsx'

type ImportStep = 'idle' | 'mode' | 'duplicates' | 'working' | 'done'

type BaseProps = {
  buttonLabel: string
  mediumLabel: string
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

export function LibraryImportButton(props: FilmsImportProps | SeriesImportProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<ImportStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [importedCount, setImportedCount] = useState(0)
  const [report, setReport] = useState<string | null>(null)

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

  const reset = () => {
    setStep('idle')
    setError(null)
    setFileName(null)
    setImportedCount(0)
    setReport(null)
    setFilmsImported([])
    setFilmDuplicates([])
    setFilmResolutions(new Map())
    setSeriesImported([])
    setSeriesDuplicates([])
    setSeriesResolutions(new Map())
  }

  const close = () => {
    if (step === 'working') return
    setOpen(false)
    reset()
  }

  const pickAndPrepare = async () => {
    setError(null)
    try {
      const picked = await pickImportJson()
      if (!picked) {
        setError('Sélection annulée. Aucune donnée n’a été écrite.')
        return
      }
      setFileName(picked.name)

      const preview = validateLibraryDocument(picked.contents)
      if (preview.document === null || preview.errors.length > 0) {
        setError(`Le fichier n’est pas un export Sylloge valide (${preview.errors.length} erreur${preview.errors.length > 1 ? 's' : ''}). Aucune donnée n’a été écrite.`)
        return
      }

      if (props.kind === 'films') {
        const imported = preview.document.films
        if (imported.length === 0) {
          setError('Ce fichier ne contient aucun film à importer.')
          return
        }
        setFilmsImported(imported)
        setImportedCount(imported.length)
      } else {
        const imported = preview.document.series
        if (imported.length === 0) {
          setError('Ce fichier ne contient aucune série à importer.')
          return
        }
        setSeriesImported(imported)
        setImportedCount(imported.length)
      }
      setStep('mode')
    } catch (cause) {
      console.error('Impossible de lire le fichier d’import.', cause)
      setError('Le fichier choisi n’a pas pu être lu. Aucune donnée n’a été écrite.')
    }
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
    } else {
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
    }
  }

  const confirmImport = async (
    mode: ImportMode,
    resolutions: Map<string, DuplicateResolution>,
    imported: Film[] | Series[],
  ) => {
    setStep('working')
    setError(null)
    try {
      if (props.kind === 'films') {
        const prepared = prepareFilmsImport(mode, props.existing, imported as Film[])
        const result = await writeFilmsImport(props.profileId, prepared, resolutions)
        setReport(`${result.inserted} film${result.inserted > 1 ? 's' : ''} ajouté${result.inserted > 1 ? 's' : ''}, ${result.updated} mis à jour${result.removed > 0 ? `, ${result.removed} remplacé${result.removed > 1 ? 's' : ''}` : ''}.`)
      } else {
        const prepared = prepareSeriesImport(mode, props.existing, imported as Series[])
        const result = await writeSeriesImport(props.profileId, prepared, resolutions)
        setReport(`${result.inserted} série${result.inserted > 1 ? 's' : ''} ajoutée${result.inserted > 1 ? 's' : ''}, ${result.updated} mise${result.updated > 1 ? 's' : ''} à jour${result.removed > 0 ? `, ${result.removed} remplacée${result.removed > 1 ? 's' : ''}` : ''}.`)
      }
      setStep('done')
      props.onDone()
    } catch (cause) {
      console.error('L’import dans le profil courant a échoué.', cause)
      setError('L’import a échoué. La transaction a été annulée et votre collection n’a pas été modifiée.')
      setStep('mode')
    }
  }

  return (
    <>
      <button className="secondary-button" type="button" onClick={() => { setOpen(true); reset(); void pickAndPrepare() }}>
        {props.buttonLabel}
      </button>
      {open && (
        <AccessibleDialog
          title={`Importer des ${props.mediumLabel}s`}
          description="Le fichier est analysé avant toute écriture."
          onClose={close}
          closeDisabled={step === 'working'}
        >
          {step === 'idle' && (
            <div className="assistant-content">
              <p className="assistant-introduction">Lecture du fichier…</p>
            </div>
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
