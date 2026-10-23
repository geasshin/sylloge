import { formatNumber, t, translateMessage } from '../i18n/core.ts'
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

/** Genre français seulement : il choisit la forme du message, jamais une donnée. */
const IMPORT_MEDIUM_GRAMMAR = {
  films: { gender: 'masculine' },
  series: { gender: 'feminine' },
  books: { gender: 'masculine' },
  games: { gender: 'masculine' },
  artworks: { gender: 'feminine' },
} as const

/** Pluriel du libellé de bibliothèque : deux formes sources, choisies par le compte. */
const LIBRARY_PLURALS: Record<string, string> = {
  Films: 'films',
  Séries: 'séries',
  'Animation japonaise': 'animations japonaises',
  Livres: 'livres',
  Mangas: 'mangas',
  Jeux: 'jeux',
  Art: 'œuvres',
}

/** Champs laissés vides au bilan : clés françaises traduites au rendu. */
const EMPTY_FIELD_LABELS: Record<string, string> = {
  note: 'note',
  avis: 'avis',
  visuel: 'visuel',
  couverture: 'couverture',
  affiche: 'affiche',
}

/** Formes verbales du bilan d'import, une clé explicite par nombre. */
const IMPORT_RESULT_WORDS = {
  films: { added: ['{count} film ajouté', '{count} films ajoutés'], updated: ['{count} mis à jour', '{count} mis à jour'], removed: ['{count} remplacé', '{count} remplacés'] },
  series: { added: ['{count} série ajoutée', '{count} séries ajoutées'], updated: ['{count} mise à jour', '{count} mises à jour'], removed: ['{count} remplacée', '{count} remplacées'] },
  books: { added: ['{count} livre ajouté', '{count} livres ajoutés'], updated: ['{count} mis à jour', '{count} mis à jour'], removed: ['{count} remplacé', '{count} remplacés'] },
  games: { added: ['{count} jeu ajouté', '{count} jeux ajoutés'], updated: ['{count} mis à jour', '{count} mis à jour'], removed: ['{count} remplacé', '{count} remplacés'] },
  artworks: { added: ['{count} œuvre ajoutée', '{count} œuvres ajoutées'], updated: ['{count} mise à jour', '{count} mises à jour'], removed: ['{count} remplacée', '{count} remplacées'] },
} as const

type ImportKind = keyof typeof IMPORT_RESULT_WORDS

/** Bilan d'écriture : trois propositions assemblées, jamais un pluriel fabriqué. */
export function importReportText(kind: ImportKind, result: { inserted: number; updated: number; removed: number }): string {
  const words = IMPORT_RESULT_WORDS[kind]
  const parts = [t(result.inserted === 1 ? words.added[0] : words.added[1], { count: formatNumber(result.inserted) })]
  parts.push(t(result.updated === 1 ? words.updated[0] : words.updated[1], { count: formatNumber(result.updated) }))
  if (result.removed > 0) parts.push(t(result.removed === 1 ? words.removed[0] : words.removed[1], { count: formatNumber(result.removed) }))
  return `${parts.join(', ')}.`
}

/** Une erreur d'import est soit un message du domaine, soit une copie du composant. */
type ImportError = { kind: 'domain'; message: string } | { kind: 'copy'; source: string }

function importErrorText(error: ImportError): string {
  return error.kind === 'domain' ? translateMessage(error.message) : t(error.source)
}

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
  const [error, setError] = useState<ImportError | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [importedCount, setImportedCount] = useState(0)
  /** Bilan d'écriture gardé sous forme de nombres : traduit au rendu. */
  const [report, setReport] = useState<{ kind: ImportKind; result: { inserted: number; updated: number; removed: number } } | null>(null)
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
      setError({ kind: 'domain', message: parsed.error })
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
      setError({ kind: 'copy', source: 'Ce conteneur ne contient aucun CSV directement importable dans cette bibliothèque.' })
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
        setError({ kind: 'copy', source: 'Sélection annulée. Aucune donnée n’a été écrite.' })
        return
      }
      preparePicked(picked)
    } catch (cause) {
      console.error('Impossible de lire le fichier d’import.', cause)
      setError({ kind: 'copy', source: 'Le fichier choisi n’a pas pu être lu. Aucune donnée n’a été écrite.' })
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
        setReport({ kind: 'films', result })
      } else if (props.kind === 'series') {
        const prepared = prepareSeriesImport(mode, props.existing, imported as Series[])
        const result = await writeSeriesImport(props.profileId, prepared, resolutions, undefined, undefined, props.kind === 'series' ? props.seriesLibrary ?? 'series' : 'series')
        setReport({ kind: 'series', result })
      } else if (props.kind === 'books') {
        const prepared = prepareBooksImport(mode, props.existing, imported as Book[])
        const result = await writeBooksImport(props.profileId, prepared, resolutions, undefined, undefined, props.kind === 'books' ? props.bookLibrary ?? 'books' : 'books')
        setReport({ kind: 'books', result })
      } else if (props.kind === 'games') {
        const prepared = prepareGamesImport(mode, props.existing, imported as Game[])
        const result = await writeGamesImport(props.profileId, prepared, resolutions)
        setReport({ kind: 'games', result })
      } else {
        const prepared = prepareArtworksImport(mode, props.existing, imported as Artwork[])
        const result = await writeArtworksImport(props.profileId, prepared, resolutions)
        setReport({ kind: 'artworks', result })
      }
      refreshOnClose.current = true
      setStep('done')
    } catch (cause) {
      console.error('L’import dans le profil courant a échoué.', cause)
      setError({ kind: 'copy', source: 'L’import a échoué. La transaction a été annulée ; la bibliothèque est inchangée.' })
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
          title={t('Importer · {library}', { library: t(libraryLabel) })}
          description={props.onPrepared
            ? t('Préparer {library} pour « {profile} ». Aucune écriture avant la création finale du profil.', { library: t(libraryLabel), profile: props.profileName })
            : t('Profil « {profile} » · {library}. Aucune écriture avant confirmation.', { profile: props.profileName, library: t(libraryLabel) })}
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
            <ContainerSourcePanel
              source={containerSource}
              onPick={(candidate) => prepareContainerCandidate(containerSource, candidate)}
              onChooseAnother={() => { setContainerSource(null); setFileName(null); setStep('choose-file') }}
            />
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
              mediumPluralLabel={LIBRARY_PLURALS[libraryLabel] ?? libraryLabel}
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
            <ImportConfirmPanel
              libraryLabel={libraryLabel}
              profileName={props.profileName}
              fileName={fileName}
              importedCount={pendingImport.imported.length}
              additions={pendingImport.additions}
              updates={pendingImport.updates}
              removals={pendingImport.removals}
              mode={pendingImport.mode}
              existingCount={props.existing.length}
              replaceAcknowledged={replaceAcknowledged}
              onAcknowledge={setReplaceAcknowledged}
              onBack={() => setStep('mode')}
              onConfirm={() => void confirmImport(pendingImport.mode, pendingImport.resolutions, pendingImport.imported)}
            />
          )}
          {step === 'working' && (
            <div className="assistant-content">
              <p className="assistant-introduction">{t("Import en cours…")}</p>
            </div>
          )}
          {step === 'done' && (
            <ImportDonePanel
              fileName={fileName}
              report={report}
              finalSummary={finalSummary}
              thirdPartyService={thirdParty === null ? null : thirdParty.preview.service}
              thirdPartyWarningCount={thirdParty?.preview.warnings.length ?? 0}
              onClose={close}
            />
          )}
          {error && <ImportErrorAlert error={error} />}
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
        <h3 id="import-json-review-title">{t('Aperçu de {medium}', { medium: t(mediumLabel) })}</h3>
        <dl className="assistant-source-summary">
          <div><dt>{t("Fichier sélectionné")}</dt><dd title={fileName ?? undefined}>{fileName ?? t('Nom du fichier inconnu')}</dd></div>
          <div><dt>{t("Fiches reconnues")}</dt><dd>{formatNumber(items.length)}</dd></div>
        </dl>
        <p className="import-json-review-label">{t("Titres détectés")}</p>
        <ol
          className="import-title-preview"
          aria-label={t('Titres détectés · {medium}', { medium: t(mediumLabel) })}
        >
          {items.slice(0, 5).map((item, index) => (
            <li key={index + ':' + item.title}>{item.title}</li>
          ))}
        </ol>
        {remainingCount > 0 && (
          <p className="import-title-preview-note">
            {t(remainingCount === 1
              ? 'Les 5 premiers titres sont affichés. Une autre fiche n’est pas listée.'
              : 'Les 5 premiers titres sont affichés. {count} autres fiches ne sont pas listées.', { count: formatNumber(remainingCount) })}
          </p>
        )}
        <p className="import-contextual-hint">
          {t("Rien n’est encore écrit. Continuer pour comparer les fiches ou remplacer cette bibliothèque.")}
        </p>
        <div className="assistant-actions">
          <button className="secondary-button" type="button" onClick={onChooseAnother}>{t("Choisir un autre fichier")}</button>
          <button className="primary-button" type="button" onClick={onContinue}>{t("Continuer")}</button>
        </div>
      </section>
    </div>
  )
}

/** Étape « plusieurs tables dans le conteneur » : choix pur, aucune écriture. */
function ContainerSourcePanel({
  source,
  onPick,
  onChooseAnother,
}: {
  source: Extract<PickedAnyImportFile, { kind: 'container' }>
  onPick: (candidate: ImportContainerCandidate) => void
  onChooseAnother: () => void
}) {
  const count = source.containerCandidates.length
  return (
    <div className="assistant-content">
      <section className="assistant-stage">
        <h3>{t("Choisir les données à prévisualiser")}</h3>
        <p>
          {t(count === 1 ? '{count} candidat a été détecté dans' : '{count} candidats ont été détectés dans', { count: formatNumber(count) })}{' '}
          <b>{source.name}</b>
          {t('. Le choix n’écrit encore aucune donnée.')}
        </p>
        <div className="assistant-choice-grid">
          {source.containerCandidates.map((candidate) => (
            <button
              className="transfer-choice"
              key={candidate.id}
              type="button"
              onClick={() => onPick(candidate)}
            >
              <span className="card-kicker">{candidate.kind.toUpperCase()}</span>
              <b>{candidate.name}</b>
              <small>{t("Prévisualiser et valider avant import")}</small>
            </button>
          ))}
        </div>
        <div className="assistant-actions">
          <button className="secondary-button" type="button" onClick={onChooseAnother}>{t("Choisir une autre source")}</button>
        </div>
      </section>
    </div>
  )
}

/** Récapitulatif final avant écriture : les nombres viennent du plan de fusion. */
function ImportConfirmPanel({
  libraryLabel,
  profileName,
  fileName,
  importedCount,
  additions,
  updates,
  removals,
  mode,
  existingCount,
  replaceAcknowledged,
  onAcknowledge,
  onBack,
  onConfirm,
}: {
  libraryLabel: string
  profileName: string
  fileName: string | null
  importedCount: number
  additions: number
  updates: number
  removals: number
  mode: ImportMode
  existingCount: number
  replaceAcknowledged: boolean
  onAcknowledge: (acknowledged: boolean) => void
  onBack: () => void
  onConfirm: () => void
}) {
  return (
    <div className="assistant-content">
      <section className="import-final-review" aria-labelledby="import-final-title">
        <h3 id="import-final-title">{t("Confirmer l’import")}</h3>
        <dl className="assistant-source-summary">
          <div><dt>{t("Destination")}</dt><dd>{t(libraryLabel)} · {profileName}</dd></div>
          <div><dt>{t("Fichier")}</dt><dd>{fileName}</dd></div>
          <div><dt>{t("Fiches analysées")}</dt><dd>{formatNumber(importedCount)}</dd></div>
          <div><dt>{t("Ajouts")}</dt><dd>{formatNumber(additions)}</dd></div>
          <div><dt>{t("Mises à jour")}</dt><dd>{formatNumber(updates)}</dd></div>
          <div><dt>{t("Suppressions")}</dt><dd>{formatNumber(removals)}</dd></div>
          <div><dt>{t("Mode")}</dt><dd>{t(mode === 'replace' ? 'Remplacer cette bibliothèque' : 'Fusionner avec l’existant')}</dd></div>
        </dl>
        <p>{t("Les autres bibliothèques et les autres profils restent inchangés. L’écriture est réalisée en une transaction.")}</p>
        {mode === 'replace' ? (
          <label className="import-replace-consent">
            <input type="checkbox" checked={replaceAcknowledged} onChange={event => onAcknowledge(event.target.checked)} />
            <span>{t(existingCount === 1
              ? 'Remplacer la fiche de {library} par celle du fichier. La fiche actuelle, ses avis et ses citations seront retirés. Conserver un export JSON avant cette opération.'
              : 'Remplacer les {count} fiches de {library} par celles du fichier. Les fiches actuelles, leurs avis et leurs citations seront retirés. Conserver un export JSON avant cette opération.', { count: formatNumber(existingCount), library: t(libraryLabel) })}</span>
          </label>
        ) : <p className="import-contextual-hint">{t("Les nouveautés seront ajoutées. Pour les doublons, les choix de conservation précédents seront appliqués ; les informations personnelles existantes restent prioritaires par défaut.")}</p>}
        <div className="assistant-actions">
          <button className="secondary-button" type="button" onClick={onBack}>{t("Retour")}</button>
          <button className={mode === 'replace' ? 'primary-button danger' : 'primary-button'} type="button"
            disabled={mode === 'replace' && !replaceAcknowledged}
            onClick={onConfirm}>
            {t(mode === 'replace' ? 'Confirmer le remplacement' : 'Importer les fiches')}
          </button>
        </div>
      </section>
    </div>
  )
}

type ImportFinalSummary = { skippedLines: string[]; emptyFields: Array<{ title: string; fields: string[] }> }

/** Bilan de fin d'import : les rapports du domaine y arrivent déjà interpolés. */
function ImportDonePanel({
  fileName,
  report,
  finalSummary,
  thirdPartyService,
  thirdPartyWarningCount,
  onClose,
}: {
  fileName: string | null
  report: { kind: ImportKind; result: { inserted: number; updated: number; removed: number } } | null
  finalSummary: ImportFinalSummary
  thirdPartyService: 'letterboxd' | 'goodreads' | null
  thirdPartyWarningCount: number
  onClose: () => void
}) {
  const skippedCount = finalSummary.skippedLines.length
  const emptyCount = finalSummary.emptyFields.length
  return (
    <div className="assistant-content">
      <div className="import-report" role="status">
        <h3>{t("Import terminé")}</h3>
        <ul>
          {fileName && <li>{t('Fichier lu : {file}', { file: fileName })}</li>}
          {report && <li>{importReportText(report.kind, report.result)}</li>}
          {skippedCount > 0 && (
            <li>
              {t(skippedCount === 1
                ? '{count} ligne ignorée — sans titre, non créée ({lines})'
                : '{count} lignes ignorées — sans titre, non créées ({lines})', {
                count: formatNumber(skippedCount),
                lines: finalSummary.skippedLines.map(translateMessage).join(', '),
              })}
            </li>
          )}
          <li>{t("Profil courant conservé")}</li>
          {thirdPartyService !== null && <li>{t(thirdPartyWarningCount === 1
            ? '{service} : {count} avertissement présenté avant import ; le fichier original est à conserver pour les colonnes exclues.'
            : '{service} : {count} avertissements présentés avant import ; le fichier original est à conserver pour les colonnes exclues.', {
            service: thirdPartyService === 'letterboxd' ? 'Letterboxd' : 'Goodreads',
            count: formatNumber(thirdPartyWarningCount),
          })}</li>}
        </ul>
        {emptyCount > 0 && (
          <details className="final-summary-fields" open={emptyCount <= 12}>
            <summary>
              {t(emptyCount === 1
                ? 'Champs laissés vides sur {count} fiche — à compléter ultérieurement'
                : 'Champs laissés vides sur {count} fiches — à compléter ultérieurement', { count: formatNumber(emptyCount) })}
            </summary>
            <ul className="final-summary-list">
              {finalSummary.emptyFields.map((entry) => (
                <li key={entry.title}>
                  <b>{entry.title}</b> — {entry.fields.map((field) => t(EMPTY_FIELD_LABELS[field] ?? field)).join(', ')}
                </li>
              ))}
            </ul>
          </details>
        )}
        {emptyCount === 0 && skippedCount === 0 && (
          <p className="import-hint">{t("Toutes les données reconnues ont été importées.")}</p>
        )}
      </div>
      <div className="assistant-actions assistant-actions-single">
        <button className="primary-button" type="button" onClick={onClose}>{t("Fermer")}</button>
      </div>
    </div>
  )
}

/** Erreur d'étape : copie du composant ou message du domaine, traduits au rendu. */
function ImportErrorAlert({ error }: { error: ImportError }) {
  return <p className="inline-report error" role="alert">{importErrorText(error)}</p>
}
