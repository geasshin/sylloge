import { useRef, useState, type ReactNode } from 'react'
import type { Artwork } from '../domain/artwork.ts'
import type { Book } from '../domain/book.ts'
import type { Film } from '../domain/film.ts'
import type { Game } from '../domain/game.ts'
import type { Series } from '../domain/series.ts'
import type {
  ArtworkDuplicate,
  DuplicateResolution,
  BookDuplicate,
  FilmDuplicate,
  GameDuplicate,
  SeriesDuplicate,
} from '../domain/importMerge.ts'
import {
  countModifiedDuplicateResolutions,
  filterDuplicatesByTitle,
} from '../domain/importMerge.ts'

/**
 * Parcours d'import unitaire dans une bibliothèque (jalon 0.4.4) :
 * choix du fichier (détection automatique), aperçu, choix Remplacer/Fusionner,
 * résolution individuelle des doublons, puis confirmation.
 */

export type CollectionImportStep = 'pick' | 'mode' | 'duplicates' | 'confirm' | 'done'

export type CollectionImportState<F, D> = {
  step: CollectionImportStep
  fileName: string | null
  importedCount: number
  duplicates: D[]
  resolutions: Map<string, DuplicateResolution>
  imported: F[]
  error: string | null
  report: string | null
}

type ModeChoiceProps = {
  mediumLabel: string
  importedCount: number
  existingCount: number
  onChoose: (mode: 'replace' | 'merge') => void
  onCancel: () => void
}

export function ImportModeChoice({ mediumLabel, importedCount, existingCount, onChoose, onCancel }: ModeChoiceProps) {
  return (
    <div className="assistant-content">
      <p className="assistant-introduction">
        {importedCount} {mediumLabel}{importedCount > 1 ? 's' : ''} détecté{importedCount > 1 ? 's' : ''} dans le fichier.
        Votre collection actuelle en contient {existingCount}. Choisissez comment les importer.
      </p>
      <div className="assistant-choice-grid">
        <button className="transfer-choice" type="button" onClick={() => onChoose('replace')}>
          <span className="card-kicker">Repartir de zéro</span>
          <b>Remplacer</b>
          <small>Vide votre collection actuelle de {mediumLabel}s et installe uniquement le fichier importé.</small>
        </button>
        <button className="transfer-choice" type="button" onClick={() => onChoose('merge')}>
          <span className="card-kicker">Conserver l’existant</span>
          <b>Fusionner</b>
          <small>Garde vos {mediumLabel}s actuels, ajoute les nouveautés et préserve vos notes et favoris.</small>
        </button>
      </div>
      <div className="assistant-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  )
}

type DuplicateItemProps<F> = {
  title: string
  existing: F
  imported: F
  resolution: DuplicateResolution
  onResolve: (resolution: DuplicateResolution) => void
  renderSummary: (item: F, origin: 'existing' | 'imported') => ReactNode
}

function DuplicateItem<F>({ title, existing, imported, resolution, onResolve, renderSummary }: DuplicateItemProps<F>) {
  return (
    <div className="duplicate-item">
      <p className="duplicate-title"><b>{title}</b></p>
      <div className="duplicate-choices" role="group" aria-label={`Choisir la fiche à conserver pour ${title}`}>
        <button
          className={`duplicate-choice ${resolution === 'keep-existing' ? 'selected' : ''}`}
          type="button"
          onClick={() => onResolve('keep-existing')}
          aria-pressed={resolution === 'keep-existing'}
        >
          <span className="card-kicker">Fiche actuelle</span>
          {renderSummary(existing, 'existing')}
        </button>
        <button
          className={`duplicate-choice ${resolution === 'keep-imported' ? 'selected' : ''}`}
          type="button"
          onClick={() => onResolve('keep-imported')}
          aria-pressed={resolution === 'keep-imported'}
        >
          <span className="card-kicker">Fiche importée</span>
          {renderSummary(imported, 'imported')}
        </button>
      </div>
    </div>
  )
}

type DuplicatesResolverProps<F, D extends { normalizedTitle: string; existing: F; imported: F }> = {
  duplicates: D[]
  resolutions: Map<string, DuplicateResolution>
  onResolve: (normalizedTitle: string, resolution: DuplicateResolution) => void
  onConfirm: () => void
  onBack: () => void
  renderSummary: (item: F, origin: 'existing' | 'imported') => ReactNode
}

export function DuplicatesResolver<F, D extends { normalizedTitle: string; existing: F; imported: F }>({
  duplicates,
  resolutions,
  onResolve,
  onConfirm,
  onBack,
  renderSummary,
}: DuplicatesResolverProps<F, D>) {
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState(false)
  const duplicatesListRef = useRef<HTMLDivElement>(null)
  const visibleDuplicates = filterDuplicatesByTitle(duplicates, search)
  const modifiedResolutionCount = countModifiedDuplicateResolutions(duplicates, resolutions)

  const confirm = () => {
    if (confirming) return
    setConfirming(true)
    onConfirm()
  }

  const clearSearch = () => {
    setSearch('')
    window.requestAnimationFrame(() => duplicatesListRef.current?.scrollIntoView({ block: 'start' }))
  }

  const actions = (
    <div className="duplicates-actions">
      <button className="secondary-button" type="button" onClick={onBack} disabled={confirming}>Retour</button>
      <button className="primary-button" type="button" onClick={confirm} disabled={confirming}>
        {confirming ? 'Fusion…' : 'Confirmer la fusion'}
      </button>
    </div>
  )

  return (
    <div className="assistant-content">
      <p className="assistant-introduction">
        {duplicates.length} {duplicates.length === 1 ? 'doublon détecté' : 'doublons détectés'} (même titre).
        Pour chacun, choisissez la fiche à conserver.
      </p>
      <div className="duplicates-header">
        <div className="duplicates-summary" role="status" aria-live="polite">
          <span><b>{duplicates.length}</b> total</span>
          <span><b>{visibleDuplicates.length}</b> visible{visibleDuplicates.length > 1 ? 's' : ''}</span>
          <span><b>{modifiedResolutionCount}</b> décision{modifiedResolutionCount > 1 ? 's' : ''} modifiée{modifiedResolutionCount > 1 ? 's' : ''}</span>
        </div>
        <div className="duplicates-search-row">
          <label className="duplicates-search">
            <span className="visually-hidden">Rechercher un doublon par titre</span>
            <input
              type="search"
              value={search}
              placeholder="Rechercher un titre"
              spellCheck={false}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button className="secondary-button" type="button" onClick={clearSearch} disabled={!search}>Effacer</button>
        </div>
        {actions}
      </div>
      <div className="duplicates-list" ref={duplicatesListRef} id="duplicates-list">
        {visibleDuplicates.length > 0 ? visibleDuplicates.map((duplicate) => (
          <DuplicateItem
            key={duplicate.normalizedTitle}
            title={duplicate.normalizedTitle}
            existing={duplicate.existing}
            imported={duplicate.imported}
            resolution={resolutions.get(duplicate.normalizedTitle) ?? 'keep-existing'}
            onResolve={(resolution) => onResolve(duplicate.normalizedTitle, resolution)}
            renderSummary={renderSummary}
          />
        )) : (
          <p className="duplicates-empty" role="status">Aucun doublon ne correspond à cette recherche.</p>
        )}
      </div>
      {actions}
    </div>
  )
}

// Helpers de résumé pour les deux médiums livrés -----------------------------

export function filmSummary(film: Film, origin: 'existing' | 'imported'): ReactNode {
  void origin
  const details = [film.director, film.year, film.status].filter((value) => value !== null && value !== '').join(' · ')
  return (
    <span className="duplicate-summary">
      <b>{film.title}</b>
      {details && <small>{details}</small>}
      {film.rating !== null && <small>Note : {film.rating}/5{film.isFavorite ? ' · favori' : ''}</small>}
    </span>
  )
}

export function seriesSummary(series: Series, origin: 'existing' | 'imported'): ReactNode {
  void origin
  const details = [series.showrunner, series.status].filter((value) => value !== null && value !== '').join(' · ')
  const seasons = series.seasonsSeen !== null && series.seasonsTotal !== null
    ? `${series.seasonsSeen}/${series.seasonsTotal} saisons`
    : null
  return (
    <span className="duplicate-summary">
      <b>{series.title}</b>
      {details && <small>{details}</small>}
      {seasons && <small>{seasons}</small>}
      {series.rating !== null && <small>Note : {series.rating}/5{series.isFavorite ? ' · favori' : ''}</small>}
    </span>
  )
}

export function bookSummary(book: Book, origin: 'existing' | 'imported'): ReactNode {
  void origin
  const details = [book.author, book.year, book.status].filter((value) => value !== null && value !== '').join(' · ')
  const volumes = book.volumesRead !== null && book.volumesTotal !== null
    ? `${book.volumesRead}/${book.volumesTotal} tomes`
    : null
  return (
    <span className="duplicate-summary">
      <b>{book.title}</b>
      {details && <small>{details}</small>}
      {volumes && <small>{volumes}</small>}
      {book.rating !== null && <small>Note : {book.rating}/5{book.isFavorite ? ' · favori' : ''}</small>}
      {book.quotes.length > 0 && <small>{book.quotes.length} citation{book.quotes.length > 1 ? 's' : ''}</small>}
    </span>
  )
}

export function gameSummary(game: Game, origin: 'existing' | 'imported'): ReactNode {
  void origin
  const details = [game.developer, game.platform, game.year, game.status]
    .filter((value) => value !== null && value !== '')
    .join(' · ')
  return (
    <span className="duplicate-summary">
      <b>{game.title}</b>
      {details && <small>{details}</small>}
      {game.rating !== null && <small>Note : {game.rating}/5{game.isFavorite ? ' · favori' : ''}</small>}
    </span>
  )
}

export function artworkSummary(artwork: Artwork, origin: 'existing' | 'imported'): ReactNode {
  void origin
  const details = [artwork.artist, artwork.form, artwork.location, artwork.status]
    .filter((value) => value !== null && value !== '')
    .join(' · ')
  return (
    <span className="duplicate-summary">
      <b>{artwork.title}</b>
      {details && <small>{details}</small>}
      {artwork.isFavorite && <small>Favori</small>}
    </span>
  )
}

export type { ArtworkDuplicate, BookDuplicate, FilmDuplicate, GameDuplicate, SeriesDuplicate }
