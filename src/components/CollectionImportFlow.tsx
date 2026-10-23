import { formatNumber, t } from '../i18n/core.ts'
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
  mediumPluralLabel: string
  mediumGender: 'feminine' | 'masculine'
  importedCount: number
  existingCount: number
  onChoose: (mode: 'replace' | 'merge') => void
  onCancel: () => void
}

export function ImportModeChoice({ mediumLabel, mediumPluralLabel, mediumGender, importedCount, existingCount, onChoose, onCancel }: ModeChoiceProps) {
  const detectedWord = mediumGender === 'feminine'
    ? importedCount === 1 ? '{count} {medium} détectée dans le fichier.' : '{count} {medium} détectées dans le fichier.'
    : importedCount === 1 ? '{count} {medium} détecté dans le fichier.' : '{count} {medium} détectés dans le fichier.'

  return (
    <div className="assistant-content">
      <p className="assistant-introduction">
        {t(detectedWord, { count: formatNumber(importedCount), medium: t(importedCount === 1 ? mediumLabel : mediumPluralLabel) })}{' '}
        {t('La bibliothèque actuelle en contient {count}. Choisir comment les réunir.', { count: formatNumber(existingCount) })}
      </p>
      <div className="assistant-choice-grid">
        <button className="transfer-choice" type="button" onClick={() => onChoose('merge')}>
          <b>{t("Fusionner")}</b>
          <small>{t("Ajouter les nouveautés, comparer les doublons et préserver par défaut les notes, avis, dates et favoris déjà présents. Recommandé pour compléter la bibliothèque.")}</small>
        </button>
        <button className="transfer-choice" type="button" onClick={() => onChoose('replace')}>
          <b>{t("Remplacer")}</b>
          <small>{t("Retirer les fiches de cette bibliothèque et les remplacer par celles du fichier. Une confirmation supplémentaire sera demandée.")}</small>
        </button>
      </div>
      <p className="import-contextual-hint">{t("Aucune écriture à cette étape. Les doublons seront comparés avant le résumé final.")}</p>
      <div className="assistant-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>{t("Annuler")}</button>
      </div>
    </div>
  )
}

type DuplicateItemProps<F extends { title: string }> = {
  title: string
  existing: F
  imported: F
  resolution: DuplicateResolution
  onResolve: (resolution: DuplicateResolution) => void
  renderSummary: (item: F, origin: 'existing' | 'imported') => ReactNode
}

function DuplicateItem<F extends { title: string }>({ title, existing, imported, resolution, onResolve, renderSummary }: DuplicateItemProps<F>) {
  return (
    <div className="duplicate-item">
      <p className="duplicate-title"><b>{title}</b></p>
      <div className="duplicate-choices" role="group" aria-label={t("Choisir la fiche à conserver pour {title}", { title })}>
        <button
          className={`duplicate-choice ${resolution === 'keep-existing' ? 'selected' : ''}`}
          type="button"
          onClick={() => onResolve('keep-existing')}
          aria-pressed={resolution === 'keep-existing'}
        >
          <b>{t("Fiche actuelle")}</b>
          {renderSummary(existing, 'existing')}
          {'personalNote' in existing && typeof existing.personalNote === 'string' && <small className="duplicate-personal-note">{existing.personalNote}</small>}
        </button>
        <button
          className={`duplicate-choice ${resolution === 'keep-imported' ? 'selected' : ''}`}
          type="button"
          onClick={() => onResolve('keep-imported')}
          aria-pressed={resolution === 'keep-imported'}
        >
          <b>{t("Fiche importée")}</b>
          {renderSummary(imported, 'imported')}
          {'personalNote' in imported && typeof imported.personalNote === 'string' && <small className="duplicate-personal-note">{imported.personalNote}</small>}
        </button>
      </div>
      <button className="secondary-button duplicate-keep-both" type="button" aria-pressed={resolution === 'keep-both'} onClick={() => onResolve('keep-both')}>{t("Conserver les deux fiches")}</button>
    </div>
  )
}

type DuplicatesResolverProps<F extends { title: string }, D extends { normalizedTitle: string; existing: F; imported: F }> = {
  duplicates: D[]
  resolutions: Map<string, DuplicateResolution>
  onResolve: (normalizedTitle: string, resolution: DuplicateResolution) => void
  onConfirm: () => void
  onBack: () => void
  renderSummary: (item: F, origin: 'existing' | 'imported') => ReactNode
}

export function DuplicatesResolver<F extends { title: string }, D extends { normalizedTitle: string; existing: F; imported: F }>({
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
      <button className="secondary-button" type="button" onClick={onBack} disabled={confirming}>{t("Retour")}</button>
      <button className="primary-button" type="button" onClick={confirm} disabled={confirming}>
        {t(confirming ? 'Validation…' : 'Valider ces choix')}
      </button>
    </div>
  )

  return (
    <div className="assistant-content">
      <p className="assistant-introduction">
        {t(duplicates.length === 1 ? '{count} rapprochement proposé au titre normalisé.' : '{count} rapprochements proposés au titre normalisé.', { count: formatNumber(duplicates.length) })}{' '}
        {t('Un même titre peut désigner deux œuvres différentes : comparer les dates et les auteurs, puis conserver une fiche ou les deux. Les informations personnelles existantes sont prioritaires par défaut.')}
      </p>
      <div className="duplicates-header">
        <div className="duplicates-summary" role="status" aria-live="polite">
          <span><b>{duplicates.length}</b>{t("total")}</span>
          <span><b>{formatNumber(visibleDuplicates.length)}</b> {t(visibleDuplicates.length > 1 ? "visibles" : "visible")}</span>
          <span><b>{formatNumber(modifiedResolutionCount)}</b> {t(modifiedResolutionCount === 1 ? "décision modifiée" : "décisions modifiées")}</span>
        </div>
        <div className="duplicates-search-row">
          <label className="duplicates-search">
            <span className="visually-hidden">{t("Rechercher un doublon par titre")}</span>
            <input
              type="search"
              value={search}
              placeholder={t("Rechercher un titre")}
              spellCheck={false}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button className="secondary-button" type="button" onClick={clearSearch} disabled={!search}>{t("Effacer")}</button>
        </div>
        {actions}
      </div>
      <div className="duplicates-list" ref={duplicatesListRef} id="duplicates-list">
        {visibleDuplicates.length > 0 ? visibleDuplicates.map((duplicate) => (
          <DuplicateItem
            key={duplicate.normalizedTitle}
            title={duplicate.existing.title}
            existing={duplicate.existing}
            imported={duplicate.imported}
            resolution={resolutions.get(duplicate.normalizedTitle) ?? 'keep-existing'}
            onResolve={(resolution) => onResolve(duplicate.normalizedTitle, resolution)}
            renderSummary={renderSummary}
          />
        )) : (
          <p className="duplicates-empty" role="status">{t("Aucun doublon ne correspond à cette recherche.")}</p>
        )}
      </div>
      {actions}
    </div>
  )
}

// Helpers de résumé pour les deux médiums livrés -----------------------------

export function filmSummary(film: Film, origin: 'existing' | 'imported'): ReactNode {
  void origin
  const details = [film.director, film.year, t(film.status)].filter((value) => value !== null && value !== '').join(' · ')
  return (
    <span className="duplicate-summary">
      <b>{film.title}</b>
      {details && <small>{details}</small>}
      {film.rating !== null && <small>{t('Note : {rating}/5', { rating: formatNumber(film.rating) })}{film.isFavorite ? t(' · favori') : ''}</small>}
    </span>
  )
}

export function seriesSummary(series: Series, origin: 'existing' | 'imported'): ReactNode {
  void origin
  const details = [series.showrunner, t(series.status)].filter((value) => value !== null && value !== '').join(' · ')
  const seasons = series.seasonsSeen !== null && series.seasonsTotal !== null
    ? t('{seen}/{total} saisons', { seen: formatNumber(series.seasonsSeen), total: formatNumber(series.seasonsTotal) })
    : null
  return (
    <span className="duplicate-summary">
      <b>{series.title}</b>
      {details && <small>{details}</small>}
      {seasons && <small>{seasons}</small>}
      {series.rating !== null && <small>{t('Note : {rating}/5', { rating: formatNumber(series.rating) })}{series.isFavorite ? t(' · favori') : ''}</small>}
    </span>
  )
}

export function bookSummary(book: Book, origin: 'existing' | 'imported'): ReactNode {
  void origin
  const details = [book.author, book.year, t(book.status)].filter((value) => value !== null && value !== '').join(' · ')
  const volumes = book.volumesRead !== null && book.volumesTotal !== null
    ? t('{read}/{total} tomes', { read: formatNumber(book.volumesRead), total: formatNumber(book.volumesTotal) })
    : null
  return (
    <span className="duplicate-summary">
      <b>{book.title}</b>
      {details && <small>{details}</small>}
      {volumes && <small>{volumes}</small>}
      {book.rating !== null && <small>{t('Note : {rating}/5', { rating: formatNumber(book.rating) })}{book.isFavorite ? t(' · favori') : ''}</small>}
      {book.quotes.length > 0 && <small>{t(book.quotes.length === 1 ? '{count} citation' : '{count} citations', { count: formatNumber(book.quotes.length) })}</small>}
    </span>
  )
}

export function gameSummary(game: Game, origin: 'existing' | 'imported'): ReactNode {
  void origin
  const details = [game.developer, game.platform, game.year, t(game.status)]
    .filter((value) => value !== null && value !== '')
    .join(' · ')
  return (
    <span className="duplicate-summary">
      <b>{game.title}</b>
      {details && <small>{details}</small>}
      {game.rating !== null && <small>{t('Note : {rating}/5', { rating: formatNumber(game.rating) })}{game.isFavorite ? t(' · favori') : ''}</small>}
    </span>
  )
}

export function artworkSummary(artwork: Artwork, origin: 'existing' | 'imported'): ReactNode {
  void origin
  const details = [artwork.artist, artwork.form, artwork.location, t(artwork.status)]
    .filter((value) => value !== null && value !== '')
    .join(' · ')
  return (
    <span className="duplicate-summary">
      <b>{artwork.title}</b>
      {details && <small>{details}</small>}
      {artwork.isFavorite && <small>{t("Favori")}</small>}
    </span>
  )
}

export type { ArtworkDuplicate, BookDuplicate, FilmDuplicate, GameDuplicate, SeriesDuplicate }
