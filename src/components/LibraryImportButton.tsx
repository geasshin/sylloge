import { useRef, useState } from 'react'
import type { Artwork } from '../domain/artwork.ts'
import type { Book } from '../domain/book.ts'
import type { Film } from '../domain/film.ts'
import type { Game } from '../domain/game.ts'
import type { Series } from '../domain/series.ts'
import {
  parseArtworksCollectionJson,
  parseBooksCollectionJson,
  parseFilmsCollectionJson,
  parseGamesCollectionJson,
  parseSeriesCollectionJson,
} from '../domain/collectionJsonImport.ts'
import type { PickedFilmsImportFile } from '../domain/filmCsvImport.ts'
import {
  planArtworkMerge,
  planBookMerge,
  planFilmMerge,
  planGameMerge,
  planSeriesMerge,
  type ArtworkDuplicate,
  type BookDuplicate,
  type DuplicateResolution,
  type FilmDuplicate,
  type GameDuplicate,
  type SeriesDuplicate,
} from '../domain/importMerge.ts'
import {
  prepareArtworksImport,
  prepareBooksImport,
  prepareFilmsImport,
  prepareGamesImport,
  prepareSeriesImport,
  writeArtworksImport,
  writeBooksImport,
  writeFilmsImport,
  writeGamesImport,
  writeSeriesImport,
  type ImportMode,
} from '../data/libraryTransferService.ts'
import {
  pickImportAny,
  type ImportContainerCandidate,
  type PickedAnyImportFile,
} from '../data/nativePortability.ts'
import { AccessibleDialog } from './AccessibleDialog.tsx'
import { ImportHint } from './ImportHint.tsx'
import {
  DuplicatesResolver,
  ImportModeChoice,
  artworkSummary,
  bookSummary,
  filmSummary,
  gameSummary,
  seriesSummary,
} from './CollectionImportFlow.tsx'
import { CollectionCsvImportFlow } from './CollectionCsvImportFlow.tsx'
import { FilmCsvImportFlow } from './FilmCsvImportFlow.tsx'

type ImportStep = 'choose-file' | 'container-source' | 'external-preview' | 'mode' | 'duplicates' | 'working' | 'done'

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

type GamesImportProps = BaseProps & {
  kind: 'games'
  profileId: string
  existing: Game[]
}

type ArtworksImportProps = BaseProps & {
  kind: 'artworks'
  profileId: string
  existing: Artwork[]
}

export function LibraryImportButton(props: FilmsImportProps | SeriesImportProps | BooksImportProps | GamesImportProps | ArtworksImportProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<ImportStep>('choose-file')
  const [choosingFile, setChoosingFile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [importedCount, setImportedCount] = useState(0)
  const [report, setReport] = useState<string | null>(null)
  /** Résumé final (0.6.4) : champs laissés vides et lignes ignorées, par œuvre. */
  const [finalSummary, setFinalSummary] = useState<{ skippedLines: string[]; emptyFields: Array<{ title: string; fields: string[] }> }>({ skippedLines: [], emptyFields: [] })
  const [externalFilmSource, setExternalFilmSource] = useState<PickedFilmsImportFile | null>(null)
  const [externalCollectionCsv, setExternalCollectionCsv] = useState<{
    kind: 'series' | 'books' | 'games' | 'artworks'
    contents: string
  } | null>(null)
  const [containerSource, setContainerSource] = useState<Extract<PickedAnyImportFile, { kind: 'container' }> | null>(null)
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

  const [gamesImported, setGamesImported] = useState<Game[]>([])
  const [gameDuplicates, setGameDuplicates] = useState<GameDuplicate[]>([])
  const [gameResolutions, setGameResolutions] = useState<Map<string, DuplicateResolution>>(new Map())
  const [gamesMode, setGamesMode] = useState<ImportMode>('merge')

  const [artworksImported, setArtworksImported] = useState<Artwork[]>([])
  const [artworkDuplicates, setArtworkDuplicates] = useState<ArtworkDuplicate[]>([])
  const [artworkResolutions, setArtworkResolutions] = useState<Map<string, DuplicateResolution>>(new Map())
  const [artworksMode, setArtworksMode] = useState<ImportMode>('merge')

  const reset = () => {
    setStep('choose-file')
    setChoosingFile(false)
    setError(null)
    setFileName(null)
    setImportedCount(0)
    setReport(null)
    setFinalSummary({ skippedLines: [], emptyFields: [] })
    setExternalFilmSource(null)
    setExternalCollectionCsv(null)
    setContainerSource(null)
    setFilmsImported([])
    setFilmDuplicates([])
    setFilmResolutions(new Map())
    setSeriesImported([])
    setSeriesDuplicates([])
    setSeriesResolutions(new Map())
    setBooksImported([])
    setBookDuplicates([])
    setBookResolutions(new Map())
    setGamesImported([])
    setGameDuplicates([])
    setGameResolutions(new Map())
    setArtworksImported([])
    setArtworkDuplicates([])
    setArtworkResolutions(new Map())
  }

  const close = () => {
    if (step === 'working') return
    setOpen(false)
    reset()
  }

  const prepareJson = (contents: string) => {
    const parsed = props.kind === 'films'
      ? parseFilmsCollectionJson(contents)
      : props.kind === 'series'
        ? parseSeriesCollectionJson(contents)
        : props.kind === 'books'
          ? parseBooksCollectionJson(contents)
          : props.kind === 'games'
            ? parseGamesCollectionJson(contents)
            : parseArtworksCollectionJson(contents)
    if (parsed.items === null) {
      setError(parsed.error)
      return
    }
    if (props.kind === 'films') setFilmsImported(parsed.items as Film[])
    else if (props.kind === 'series') setSeriesImported(parsed.items as Series[])
    else if (props.kind === 'books') setBooksImported(parsed.items as Book[])
    else if (props.kind === 'games') setGamesImported(parsed.items as Game[])
    else setArtworksImported(parsed.items as Artwork[])
    setImportedCount(parsed.items.length)
    setStep('mode')
  }

  const prepareContainerCandidate = (
    source: Extract<PickedAnyImportFile, { kind: 'container' }>,
    candidate: ImportContainerCandidate,
  ) => {
    setContainerSource(null)
    setFileName(`${source.name} · ${candidate.name}`)
    if (candidate.kind === 'json') {
      prepareJson(candidate.contents)
      return
    }
    if (props.kind === 'films') {
      setExternalFilmSource({
        name: source.name,
        kind: 'container',
        csvCandidates: [{ id: candidate.id, name: candidate.name, contents: candidate.contents }],
        markdownPages: source.markdownPages,
      })
    } else {
      setExternalCollectionCsv({ kind: props.kind, contents: candidate.contents })
    }
    setStep('external-preview')
  }

  const preparePicked = (picked: PickedAnyImportFile) => {
    setFileName(picked.name)
    if (picked.kind === 'container') {
      if (picked.containerCandidates.length === 1) {
        prepareContainerCandidate(picked, picked.containerCandidates[0])
      } else {
        setContainerSource(picked)
        setStep('container-source')
      }
      return
    }
    if (picked.kind === 'json') {
      prepareJson(picked.contents)
      return
    }
    if (props.kind === 'films') {
      setExternalFilmSource({
        name: picked.name,
        kind: picked.kind,
        csvCandidates: picked.csvCandidates,
        markdownPages: picked.markdownPages,
      })
      setStep('external-preview')
      return
    }
    if (picked.kind !== 'csv') {
      setError('Ce conteneur ne contient aucun CSV directement importable dans cette bibliothèque.')
      return
    }
    const contents = picked.csvCandidates[0]?.contents
    if (!contents) throw new Error('Le CSV sélectionné ne contient aucune table lisible.')
    setExternalCollectionCsv({ kind: props.kind, contents })
    setStep('external-preview')
  }

  const pickAndPrepare = async (pick: () => Promise<PickedAnyImportFile | null>) => {
    if (choosingFile) return
    setChoosingFile(true)
    setError(null)
    try {
      const picked = await pick()
      if (!picked) {
        setError('Sélection annulée. Aucune donnée n’a été écrite.')
        return
      }
      preparePicked(picked)
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

  const acceptExternalCollectionCsv = (items: Artwork[] | Book[] | Game[] | Series[]) => {
    if (props.kind === 'series') setSeriesImported(items as Series[])
    else if (props.kind === 'books') setBooksImported(items as Book[])
    else if (props.kind === 'games') setGamesImported(items as Game[])
    else if (props.kind === 'artworks') setArtworksImported(items as Artwork[])
    else return
    setImportedCount(items.length)
    setStep('mode')
  }

  /** Construit le résumé final depuis les avertissements du mapping CSV (0.6.4). */
  const buildFinalSummary = (
    items: Artwork[] | Book[] | Game[] | Series[],
    warnings: Array<{ path: string; message: string }>,
  ) => {
    const emptyFields: Array<{ title: string; fields: string[] }> = []
    for (const item of items) {
      const fields: string[] = []
      if ('rating' in item && item.rating === null) fields.push('note')
      if (!item.personalNote) fields.push('avis')
      if ('imageUrl' in item && !item.imageUrl) fields.push('visuel')
      if ('coverUrl' in item && !item.coverUrl) fields.push('couverture')
      if ('posterUrl' in item && !item.posterUrl) fields.push('affiche')
      if (fields.length > 0) emptyFields.push({ title: item.title, fields })
    }
    setFinalSummary({
      skippedLines: warnings
        .filter((warning) => !warning.path.endsWith('.info') && /titre/i.test(warning.message))
        .map((warning) => warning.path.replace(/\.[^.]+$/, '')),
      emptyFields,
    })
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
    } else if (props.kind === 'books') {
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
    } else if (props.kind === 'games') {
      setGamesMode(mode)
      if (mode === 'merge') {
        const plan = planGameMerge(props.existing, gamesImported)
        setGameDuplicates(plan.duplicates)
        setGameResolutions(new Map(plan.duplicates.map((duplicate) => [duplicate.normalizedTitle, 'keep-existing'])))
        setStep(plan.duplicates.length > 0 ? 'duplicates' : 'working')
        if (plan.duplicates.length === 0) void confirmImport('merge', new Map(), gamesImported)
      } else {
        void confirmImport('replace', new Map(), gamesImported)
      }
    } else {
      setArtworksMode(mode)
      if (mode === 'merge') {
        const plan = planArtworkMerge(props.existing, artworksImported)
        setArtworkDuplicates(plan.duplicates)
        setArtworkResolutions(new Map(plan.duplicates.map((duplicate) => [duplicate.normalizedTitle, 'keep-existing'])))
        setStep(plan.duplicates.length > 0 ? 'duplicates' : 'working')
        if (plan.duplicates.length === 0) void confirmImport('merge', new Map(), artworksImported)
      } else {
        void confirmImport('replace', new Map(), artworksImported)
      }
    }
  }

  const confirmImport = async (
    mode: ImportMode,
    resolutions: Map<string, DuplicateResolution>,
    imported: Artwork[] | Book[] | Film[] | Game[] | Series[],
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
      } else if (props.kind === 'books') {
        const prepared = prepareBooksImport(mode, props.existing, imported as Book[])
        const result = await writeBooksImport(props.profileId, prepared, resolutions)
        setReport(`${result.inserted} livre${result.inserted > 1 ? 's' : ''} ajouté${result.inserted > 1 ? 's' : ''}, ${result.updated} mis à jour${result.removed > 0 ? `, ${result.removed} remplacé${result.removed > 1 ? 's' : ''}` : ''}.`)
      } else if (props.kind === 'games') {
        const prepared = prepareGamesImport(mode, props.existing, imported as Game[])
        const result = await writeGamesImport(props.profileId, prepared, resolutions)
        setReport(`${result.inserted} jeu${result.inserted > 1 ? 'x' : ''} ajouté${result.inserted > 1 ? 's' : ''}, ${result.updated} mis à jour${result.removed > 0 ? `, ${result.removed} remplacé${result.removed > 1 ? 's' : ''}` : ''}.`)
      } else {
        const prepared = prepareArtworksImport(mode, props.existing, imported as Artwork[])
        const result = await writeArtworksImport(props.profileId, prepared, resolutions)
        setReport(`${result.inserted} œuvre${result.inserted > 1 ? 's' : ''} ajoutée${result.inserted > 1 ? 's' : ''}, ${result.updated} mise${result.updated > 1 ? 's' : ''} à jour${result.removed > 0 ? `, ${result.removed} remplacée${result.removed > 1 ? 's' : ''}` : ''}.`)
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
                <h3>Choisir une source à analyser</h3>
                {props.kind === 'films' ? (
                  <>
                    <p>Tu peux importer un JSON, un tableau CSV UTF-8 ou un ZIP compatible contenant des données Films.</p>
                    <ul className="import-format-list">
                      <li><b>JSON</b> — export Films historique ou bibliothèque à cinq collections</li>
                      <li><b>CSV</b> — export Sylloge ou tableau avec mapping explicite</li>
                      <li><b>ZIP</b> — conteneur compatible, sans décompression manuelle</li>
                    </ul>
                  </>
                ) : props.kind === 'series' ? (
                  <p>Tu peux importer un JSON identifié et versionné de Sylloge ou un tableau CSV UTF-8. Un CSV externe passe toujours par un mapping et un aperçu.</p>
                ) : props.kind === 'books' ? (
                  <p>Tu peux importer un JSON identifié et versionné de Sylloge, citations comprises, ou un tableau CSV UTF-8. Les citations CSV sont validées avant toute écriture.</p>
                ) : props.kind === 'games' ? (
                  <p>Tu peux importer un JSON identifié et versionné de Sylloge ou un tableau CSV UTF-8. La plateforme libre, la note et les données personnelles sont validées avant toute écriture.</p>
                ) : (
                  <p>Tu peux importer un JSON identifié et versionné de Sylloge ou un tableau CSV UTF-8, sans note chiffrée. Les champs libres de lieu et d’exposition sont conservés tels quels.</p>
                )}
                <div className="assistant-actions assistant-actions-single">
                  <button className="primary-button" type="button" disabled={choosingFile} onClick={() => void pickAndPrepare(pickImportAny)}>
                    {choosingFile ? 'Choix en cours…' : 'Choisir un fichier'}
                  </button>
                  <p className="import-hint">JSON, CSV, ou un ZIP qui en contient. Tout est analysé avant écriture — rien n’est modifié sans ton choix final.</p>
                </div>
                <ImportHint>
                  Export Notion, Excel ou autre application ? Choisis simplement le ZIP ou le CSV exporté :
                  Sylloge reconnaît les colonnes et te laisse vérifier chaque correspondance avant d’écrire quoi que ce soit.
                </ImportHint>
              </section>
            </div>
          )}
          {step === 'container-source' && containerSource !== null && (
            <div className="assistant-content">
              <section className="assistant-stage">
                <p className="card-kicker">Conteneur analysé</p>
                <h3>Choisir les données à prévisualiser</h3>
                <p>{containerSource.containerCandidates.length} candidat{containerSource.containerCandidates.length > 1 ? 's ont été détectés' : ' a été détecté'} dans <b>{containerSource.name}</b>. Le choix n’écrit encore aucune donnée.</p>
                <div className="assistant-choice-grid">
                  {containerSource.containerCandidates.map((candidate) => (
                    <button
                      className="transfer-choice"
                      key={candidate.id}
                      type="button"
                      onClick={() => prepareContainerCandidate(containerSource, candidate)}
                    >
                      <span className="card-kicker">{candidate.kind.toUpperCase()}</span>
                      <b>{candidate.name}</b>
                      <small>Prévisualiser et valider avant import</small>
                    </button>
                  ))}
                </div>
                <div className="assistant-actions">
                  <button className="secondary-button" type="button" onClick={() => { setContainerSource(null); setFileName(null); setStep('choose-file') }}>Choisir une autre source</button>
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
          {step === 'external-preview' && props.kind !== 'films' && externalCollectionCsv !== null && (
            <CollectionCsvImportFlow
              kind={externalCollectionCsv.kind}
              contents={externalCollectionCsv.contents}
              onReady={(items, warnings) => {
                buildFinalSummary(items, warnings)
                acceptExternalCollectionCsv(items)
              }}
              onChooseAnother={() => {
                setExternalCollectionCsv(null)
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
          {step === 'duplicates' && props.kind === 'games' && (
            <DuplicatesResolver
              duplicates={gameDuplicates}
              resolutions={gameResolutions}
              onResolve={(normalizedTitle, resolution) => {
                setGameResolutions((current) => new Map(current).set(normalizedTitle, resolution))
              }}
              onConfirm={() => void confirmImport(gamesMode, gameResolutions, gamesImported)}
              onBack={() => setStep('mode')}
              renderSummary={gameSummary}
            />
          )}
          {step === 'duplicates' && props.kind === 'artworks' && (
            <DuplicatesResolver
              duplicates={artworkDuplicates}
              resolutions={artworkResolutions}
              onResolve={(normalizedTitle, resolution) => {
                setArtworkResolutions((current) => new Map(current).set(normalizedTitle, resolution))
              }}
              onConfirm={() => void confirmImport(artworksMode, artworkResolutions, artworksImported)}
              onBack={() => setStep('mode')}
              renderSummary={artworkSummary}
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
                  {finalSummary.skippedLines.length > 0 && (
                    <li>
                      {finalSummary.skippedLines.length} ligne{finalSummary.skippedLines.length > 1 ? 's ignorées' : ' ignorée'} — sans titre, non créée{finalSummary.skippedLines.length > 1 ? 's' : ''} ({finalSummary.skippedLines.join(', ')})
                    </li>
                  )}
                  <li>Profil courant conservé</li>
                </ul>
                {finalSummary.emptyFields.length > 0 && (
                  <details className="final-summary-fields" open={finalSummary.emptyFields.length <= 12}>
                    <summary>
                      Champs laissés vides sur {finalSummary.emptyFields.length} fiche{finalSummary.emptyFields.length > 1 ? 's' : ''} — à compléter quand tu veux
                    </summary>
                    <ul className="final-summary-list">
                      {finalSummary.emptyFields.map((entry) => (
                        <li key={entry.title}>
                          <b>{entry.title}</b> — {entry.fields.join(', ')}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {finalSummary.emptyFields.length === 0 && finalSummary.skippedLines.length === 0 && (
                  <p className="import-hint">Toutes les données reconnues ont été importées.</p>
                )}
              </div>
              <div className="assistant-actions assistant-actions-single">
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
