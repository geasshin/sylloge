import { useRef, useState } from 'react'
import type { Artwork } from '../domain/artwork.ts'
import type { Book } from '../domain/book.ts'
import type { Film } from '../domain/film.ts'
import type { PreparedCollection } from '../domain/backupRestore.ts'
import type { Game } from '../domain/game.ts'
import type { Series } from '../domain/series.ts'
import {
  parseAnimeCollectionJson,
  parseArtworksCollectionJson,
  parseBooksCollectionJson,
  parseFilmsCollectionJson,
  parseGamesCollectionJson,
  parseMangasCollectionJson,
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
import { ImportSourceChooser } from './ImportSourceChooser.tsx'
import { ThirdPartyImportReview } from './ThirdPartyImportReview.tsx'
import { previewThirdPartyImport, recognizeThirdPartyImport, type ThirdPartyImportPreview } from '../domain/thirdPartyImport.ts'

type ImportStep = 'third-party-preview' | 'choose-file' | 'container-source' | 'external-preview' | 'json-preview' | 'mode' | 'duplicates' | 'confirm' | 'working' | 'done'

const IMPORT_MEDIUM_GRAMMAR = {
  films: { pluralLabel: 'films', gender: 'masculine' },
  series: { pluralLabel: 'séries', gender: 'feminine' },
  books: { pluralLabel: 'livres', gender: 'masculine' },
  games: { pluralLabel: 'jeux', gender: 'masculine' },
  artworks: { pluralLabel: 'œuvres', gender: 'feminine' },
} as const

type BaseProps = {
  buttonLabel: string
  mediumLabel: string
  profileName: string
  onDone: () => void
  /** First-run preparation reuses every parser/preview without native writes. */
  onPrepared?: (prepared: PreparedCollection) => void
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
  /** Bibliothèque ouverte : l'import écrit dans sa propre table. */
  seriesLibrary?: 'series' | 'anime'
}

type BooksImportProps = BaseProps & {
  kind: 'books'
  profileId: string
  existing: Book[]
  /** Bibliothèque ouverte : l'import écrit dans sa propre table. */
  bookLibrary?: 'books' | 'mangas'
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
  const libraryLabel = props.kind === 'series' ? (props.seriesLibrary === 'anime' ? 'Animation japonaise' : 'Séries')
    : props.kind === 'books' ? (props.bookLibrary === 'mangas' ? 'Mangas' : 'Livres')
      : props.kind === 'films' ? 'Films' : props.kind === 'games' ? 'Jeux' : 'Art'
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<ImportStep>('choose-file')
  const [choosingFile, setChoosingFile] = useState(false)
  const [thirdParty, setThirdParty] = useState<{ source: PickedAnyImportFile; preview: ThirdPartyImportPreview } | null>(null)
  const targetLibrary = props.kind === 'series' ? props.seriesLibrary ?? 'series' : props.kind === 'books' ? props.bookLibrary ?? 'books' : props.kind
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [importedCount, setImportedCount] = useState(0)
  const [report, setReport] = useState<string | null>(null)
  /** Résumé final (0.6.4) : champs laissés vides et lignes ignorées, par œuvre. */
  const [finalSummary, setFinalSummary] = useState<{ skippedLines: string[]; emptyFields: Array<{ title: string; fields: string[] }> }>({ skippedLines: [], emptyFields: [] })
  const [externalFilmSource, setExternalFilmSource] = useState<PickedFilmsImportFile | null>(null)
  const [externalCollectionCsv, setExternalCollectionCsv] = useState<{
    kind: 'series' | 'anime' | 'books' | 'mangas' | 'games' | 'artworks'
    contents: string
  } | null>(null)
  const [containerSource, setContainerSource] = useState<Extract<PickedAnyImportFile, { kind: 'container' }> | null>(null)
  const writingRef = useRef(false)
  // Recharger après fermeture du bilan : le rechargement du parent démonte
  // sinon l’assistant avant que le rapport final puisse être lu.
  const refreshOnClose = useRef(false)
  const [pendingImport, setPendingImport] = useState<{mode: ImportMode; resolutions: Map<string, DuplicateResolution>; imported: Film[] | Series[] | Book[] | Game[] | Artwork[]; additions: number; updates: number; removals: number} | null>(null)
  const [replaceAcknowledged, setReplaceAcknowledged] = useState(false)

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
    setThirdParty(null)
    setError(null)
    setFileName(null)
    setImportedCount(0)
    setReport(null)
    setFinalSummary({ skippedLines: [], emptyFields: [] })
    setExternalFilmSource(null)
    setExternalCollectionCsv(null)
    setContainerSource(null)
    setPendingImport(null)
    setReplaceAcknowledged(false)
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
    if (refreshOnClose.current) {
      refreshOnClose.current = false
      props.onDone()
    }
  }

  const prepareJson = (contents: string) => {
    const parsed = props.kind === 'films'
      ? parseFilmsCollectionJson(contents)
      : props.kind === 'series'
        ? (props.seriesLibrary === 'anime' ? parseAnimeCollectionJson(contents) : parseSeriesCollectionJson(contents))
        : props.kind === 'books'
          ? (props.bookLibrary === 'mangas' ? parseMangasCollectionJson(contents) : parseBooksCollectionJson(contents))
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
    setStep('json-preview')
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
      setExternalCollectionCsv({ kind: props.kind === 'series' ? props.seriesLibrary ?? 'series' : props.kind === 'books' ? props.bookLibrary ?? 'books' : props.kind, contents: candidate.contents })
    }
    setStep('external-preview')
  }

  const preparePicked = (picked: PickedAnyImportFile) => {
    setFileName(picked.name)
    // Reconnaître l’archive entière avant de sélectionner un CSV : notes,
    // journal et liste à voir peuvent décrire les mêmes films.
    // Un export Sylloge JSON n’est jamais soumis aux signatures de services.
    const preview = picked.kind === 'json' ? null : previewThirdPartyImport(picked, targetLibrary)
    if (preview !== null) {
      setThirdParty({ source: picked, preview })
      setStep('third-party-preview')
      return
    }
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
    setExternalCollectionCsv({ kind: props.kind === 'series' ? props.seriesLibrary ?? 'series' : props.kind === 'books' ? props.bookLibrary ?? 'books' : props.kind, contents })
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

  const finishPreparation = (items: PreparedCollection['items']) => {
    if (!props.onPrepared) return false
    props.onPrepared({ library: targetLibrary, fileName: fileName ?? 'Fichier préparé', items })
    setOpen(false)
    reset()
    return true
  }

  const acceptExternalFilms = (films: Film[]) => {
    if (finishPreparation(films)) return
    setFilmsImported(films)
    setImportedCount(films.length)
    setStep('mode')
  }

  const acceptExternalCollectionCsv = (items: Artwork[] | Book[] | Game[] | Series[]) => {
    if (finishPreparation(items)) return
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

  const requestConfirmation = (mode: ImportMode, resolutions: Map<string, DuplicateResolution>, imported: Film[] | Series[] | Book[] | Game[] | Artwork[]) => {
    const plan = mode === 'replace' ? null
      : props.kind === 'films' ? planFilmMerge(props.existing, imported as Film[])
        : props.kind === 'series' ? planSeriesMerge(props.existing, imported as Series[])
          : props.kind === 'books' ? planBookMerge(props.existing, imported as Book[])
            : props.kind === 'games' ? planGameMerge(props.existing, imported as Game[])
              : planArtworkMerge(props.existing, imported as Artwork[])
    const keptBoth = plan?.duplicates.filter(item => resolutions.get(item.normalizedTitle) === 'keep-both').length ?? 0
    setPendingImport({ mode, resolutions: new Map(resolutions), imported,
      additions: plan ? plan.additions.length + keptBoth : imported.length,
      updates: plan ? plan.duplicates.length - keptBoth : 0,
      removals: mode === 'replace' ? props.existing.length : 0,
    })
    setReplaceAcknowledged(false)
    setStep('confirm')
  }

  const chooseMode = (mode: ImportMode) => {
    if (props.kind === 'films') {
      setFilmsMode(mode)
      if (mode === 'merge') {
        const plan = planFilmMerge(props.existing, filmsImported)
        setFilmDuplicates(plan.duplicates)
        setFilmResolutions(new Map(plan.duplicates.map((duplicate) => [duplicate.normalizedTitle, 'keep-existing'])))
        setStep(plan.duplicates.length > 0 ? 'duplicates' : 'confirm')
        if (plan.duplicates.length === 0) requestConfirmation('merge', new Map(), filmsImported)
      } else {
        requestConfirmation('replace', new Map(), filmsImported)
      }
    } else if (props.kind === 'series') {
      setSeriesMode(mode)
      if (mode === 'merge') {
        const plan = planSeriesMerge(props.existing, seriesImported)
        setSeriesDuplicates(plan.duplicates)
        setSeriesResolutions(new Map(plan.duplicates.map((duplicate) => [duplicate.normalizedTitle, 'keep-existing'])))
        setStep(plan.duplicates.length > 0 ? 'duplicates' : 'confirm')
        if (plan.duplicates.length === 0) requestConfirmation('merge', new Map(), seriesImported)
      } else {
        requestConfirmation('replace', new Map(), seriesImported)
      }
    } else if (props.kind === 'books') {
      setBooksMode(mode)
      if (mode === 'merge') {
        const plan = planBookMerge(props.existing, booksImported)
        setBookDuplicates(plan.duplicates)
        setBookResolutions(new Map(plan.duplicates.map((duplicate) => [duplicate.normalizedTitle, 'keep-existing'])))
        setStep(plan.duplicates.length > 0 ? 'duplicates' : 'confirm')
        if (plan.duplicates.length === 0) requestConfirmation('merge', new Map(), booksImported)
      } else {
        requestConfirmation('replace', new Map(), booksImported)
      }
    } else if (props.kind === 'games') {
      setGamesMode(mode)
      if (mode === 'merge') {
        const plan = planGameMerge(props.existing, gamesImported)
        setGameDuplicates(plan.duplicates)
        setGameResolutions(new Map(plan.duplicates.map((duplicate) => [duplicate.normalizedTitle, 'keep-existing'])))
        setStep(plan.duplicates.length > 0 ? 'duplicates' : 'confirm')
        if (plan.duplicates.length === 0) requestConfirmation('merge', new Map(), gamesImported)
      } else {
        requestConfirmation('replace', new Map(), gamesImported)
      }
    } else {
      setArtworksMode(mode)
      if (mode === 'merge') {
        const plan = planArtworkMerge(props.existing, artworksImported)
        setArtworkDuplicates(plan.duplicates)
        setArtworkResolutions(new Map(plan.duplicates.map((duplicate) => [duplicate.normalizedTitle, 'keep-existing'])))
        setStep(plan.duplicates.length > 0 ? 'duplicates' : 'confirm')
        if (plan.duplicates.length === 0) requestConfirmation('merge', new Map(), artworksImported)
      } else {
        requestConfirmation('replace', new Map(), artworksImported)
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
        const result = await writeSeriesImport(props.profileId, prepared, resolutions, undefined, undefined, props.kind === 'series' ? props.seriesLibrary ?? 'series' : 'series')
        setReport(`${result.inserted} série${result.inserted > 1 ? 's' : ''} ajoutée${result.inserted > 1 ? 's' : ''}, ${result.updated} mise${result.updated > 1 ? 's' : ''} à jour${result.removed > 0 ? `, ${result.removed} remplacée${result.removed > 1 ? 's' : ''}` : ''}.`)
      } else if (props.kind === 'books') {
        const prepared = prepareBooksImport(mode, props.existing, imported as Book[])
        const result = await writeBooksImport(props.profileId, prepared, resolutions, undefined, undefined, props.kind === 'books' ? props.bookLibrary ?? 'books' : 'books')
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
      refreshOnClose.current = true
      setStep('done')
    } catch (cause) {
      console.error('L’import dans le profil courant a échoué.', cause)
      setError('L’import a échoué. La transaction a été annulée ; la bibliothèque est inchangée.')
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
          title={`Importer · ${libraryLabel}`}
          description={props.onPrepared ? `Préparer ${libraryLabel} pour « ${props.profileName} ». Aucune écriture avant la création finale du profil.` : `Profil « ${props.profileName} » · ${libraryLabel}. Aucune écriture avant confirmation.`}
          onClose={close}
          closeDisabled={step === 'working' || choosingFile}
        >
          {step === 'choose-file' && (
            <div className="assistant-content">
              <ImportSourceChooser
                library={props.kind === 'series' ? props.seriesLibrary ?? 'series' : props.kind === 'books' ? props.bookLibrary ?? 'books' : props.kind}
                busy={choosingFile}
                onPick={() => void pickAndPrepare(pickImportAny)}
              />
            </div>
          )}
          {step === 'third-party-preview' && thirdParty && (
            <ThirdPartyImportReview
              preview={thirdParty.preview}
              fileName={fileName}
              needsListChoice={recognizeThirdPartyImport(thirdParty.source)?.variant === 'ambiguous'}
              onChooseAnother={reset}
              onListChoice={letterboxdList => {
                const preview = previewThirdPartyImport(thirdParty.source, targetLibrary, undefined, { letterboxdList })
                if (preview) setThirdParty({ ...thirdParty, preview })
              }}
              onContinue={() => {
                const { items, errors } = thirdParty.preview
                if (!items || errors.length > 0) return
                if (props.kind === 'films') acceptExternalFilms(items as Film[])
                else if (props.kind === 'books') {
                  buildFinalSummary(items as Book[], [])
                  acceptExternalCollectionCsv(items as Book[])
                }
              }}
            />
          )}
          {step === 'container-source' && containerSource !== null && (
            <div className="assistant-content">
              <section className="assistant-stage">
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
          {step === 'json-preview' && (
            <JsonImportPreview
              kind={props.kind}
              fileName={fileName}
              mediumLabel={libraryLabel}
              items={props.kind === 'films' ? filmsImported : props.kind === 'series' ? seriesImported : props.kind === 'books' ? booksImported : props.kind === 'games' ? gamesImported : artworksImported}
              onChooseAnother={reset}
              onContinue={() => {
                const items = props.kind === 'films' ? filmsImported : props.kind === 'series' ? seriesImported : props.kind === 'books' ? booksImported : props.kind === 'games' ? gamesImported : artworksImported
                if (!finishPreparation(items)) setStep('mode')
              }}
            />
          )}
          {step === 'mode' && (
            <ImportModeChoice
              mediumLabel={props.mediumLabel}
              mediumPluralLabel={libraryLabel.toLocaleLowerCase('fr')}
              mediumGender={IMPORT_MEDIUM_GRAMMAR[props.kind].gender}
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
              onConfirm={() => requestConfirmation(filmsMode, filmResolutions, filmsImported)}
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
              onConfirm={() => requestConfirmation(seriesMode, seriesResolutions, seriesImported)}
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
              onConfirm={() => requestConfirmation(booksMode, bookResolutions, booksImported)}
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
              onConfirm={() => requestConfirmation(gamesMode, gameResolutions, gamesImported)}
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
              onConfirm={() => requestConfirmation(artworksMode, artworkResolutions, artworksImported)}
              onBack={() => setStep('mode')}
              renderSummary={artworkSummary}
            />
          )}
          {step === 'confirm' && pendingImport && (
            <div className="assistant-content">
              <section className="import-final-review" aria-labelledby="import-final-title">
                <h3 id="import-final-title">Confirmer l’import</h3>
                <dl className="assistant-source-summary">
                  <div><dt>Destination</dt><dd>{libraryLabel} · {props.profileName}</dd></div>
                  <div><dt>Fichier</dt><dd>{fileName}</dd></div>
                  <div><dt>Fiches analysées</dt><dd>{pendingImport.imported.length}</dd></div>
                  <div><dt>Ajouts</dt><dd>{pendingImport.additions}</dd></div>
                  <div><dt>Mises à jour</dt><dd>{pendingImport.updates}</dd></div>
                  <div><dt>Suppressions</dt><dd>{pendingImport.removals}</dd></div>
                  <div><dt>Mode</dt><dd>{pendingImport.mode === 'replace' ? 'Remplacer cette bibliothèque' : 'Fusionner avec l’existant'}</dd></div>
                </dl>
                <p>Les autres bibliothèques et les autres profils restent inchangés. L’écriture est réalisée en une transaction.</p>
                {pendingImport.mode === 'replace' ? (
                  <label className="import-replace-consent">
                    <input type="checkbox" checked={replaceAcknowledged} onChange={event => setReplaceAcknowledged(event.target.checked)} />
                    <span>Remplacer les {props.existing.length} fiches de {libraryLabel} par celles du fichier. Les fiches actuelles, leurs avis et leurs citations seront retirés. Conserver un export JSON avant cette opération.</span>
                  </label>
                ) : <p className="import-contextual-hint">Les nouveautés seront ajoutées. Pour les doublons, les choix de conservation précédents seront appliqués ; les informations personnelles existantes restent prioritaires par défaut.</p>}
                <div className="assistant-actions">
                  <button className="secondary-button" type="button" onClick={() => setStep('mode')}>Retour</button>
                  <button className={pendingImport.mode === 'replace' ? 'primary-button danger' : 'primary-button'} type="button"
                    disabled={pendingImport.mode === 'replace' && !replaceAcknowledged}
                    onClick={() => void confirmImport(pendingImport.mode, pendingImport.resolutions, pendingImport.imported)}>
                    {pendingImport.mode === 'replace' ? 'Confirmer le remplacement' : 'Importer les fiches'}
                  </button>
                </div>
              </section>
            </div>
          )}
          {step === 'working' && (
            <div className="assistant-content">
              <p className="assistant-introduction">Import en cours…</p>
            </div>
          )}
          {step === 'done' && (
            <div className="assistant-content">
              <div className="import-report" role="status">
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
                  {thirdParty && <li>{thirdParty.preview.service === 'letterboxd' ? 'Letterboxd' : 'Goodreads'} : {thirdParty.preview.warnings.length} avertissements présentés avant import ; le fichier original est à conserver pour les colonnes exclues.</li>}
                </ul>
                {finalSummary.emptyFields.length > 0 && (
                  <details className="final-summary-fields" open={finalSummary.emptyFields.length <= 12}>
                    <summary>
                      Champs laissés vides sur {finalSummary.emptyFields.length} fiche{finalSummary.emptyFields.length > 1 ? 's' : ''} — à compléter ultérieurement
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

type JsonImportPreviewProps = {
  kind: 'films' | 'series' | 'books' | 'games' | 'artworks'
  mediumLabel: string
  fileName: string | null
  items: Array<{ title: string }>
  onChooseAnother: () => void
  onContinue: () => void
}

function JsonImportPreview({ mediumLabel, fileName, items, onChooseAnother, onContinue }: JsonImportPreviewProps) {
  const remainingCount = Math.max(0, items.length - 5)

  return (
    <div className="assistant-content import-json-review-content">
      <section className="assistant-stage import-json-review" aria-labelledby="import-json-review-title">
        <h3 id="import-json-review-title">Aperçu de {mediumLabel}</h3>
        <dl className="assistant-source-summary">
          <div><dt>Fichier sélectionné</dt><dd title={fileName ?? undefined}>{fileName ?? 'Nom du fichier inconnu'}</dd></div>
          <div><dt>Fiches reconnues</dt><dd>{items.length}</dd></div>
        </dl>
        <p className="import-json-review-label">Titres détectés</p>
        <ol
          className="import-title-preview"
          aria-label={`Titres détectés · ${mediumLabel}`}
        >
          {items.slice(0, 5).map((item, index) => (
            <li key={index + ':' + item.title}>{item.title}</li>
          ))}
        </ol>
        {remainingCount > 0 && (
          <p className="import-title-preview-note">
            Les 5 premiers titres sont affichés. {remainingCount === 1 ? 'Une autre fiche n’est pas listée.' : `${remainingCount} autres fiches ne sont pas listées.`}
          </p>
        )}
        <p className="import-contextual-hint">
          Rien n’est encore écrit. Continuer pour comparer les fiches ou remplacer cette bibliothèque.
        </p>
        <div className="assistant-actions">
          <button className="secondary-button" type="button" onClick={onChooseAnother}>Choisir un autre fichier</button>
          <button className="primary-button" type="button" onClick={onContinue}>Continuer</button>
        </div>
      </section>
    </div>
  )
}
