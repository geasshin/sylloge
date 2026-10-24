import { formatNumber, t } from '../i18n/core.ts'
import { useState } from 'react'
import { libraryRepository } from '../data/libraryRepository.ts'
import { saveExportCsv, saveExportJson } from '../data/nativePortability.ts'
import { createCollectionCsvExport, type CsvCollectionMedium } from '../domain/collectionCsvTransfer.ts'
import {
  createLibraryDocument,
  libraryExportFileName,
  serializeLibraryDocument,
} from '../domain/libraryDocument.ts'
import type { CulturalLibrary } from '../data/libraryRepository.ts'
import type { BookLibraryKey } from '../domain/bookLibraries.ts'
import type { SeriesLibraryKey } from '../domain/seriesLibraries.ts'
import { AccessibleDialog } from './AccessibleDialog.tsx'
import { ShareCardDialog } from './ShareCardDialog.tsx'
import type { ShareLibraryKey } from '../domain/shareCard.ts'
import { planLetterboxdExport, type LetterboxdKind, type LetterboxdReport } from '../domain/letterboxdExport.ts'

export type LibraryExportMedium = CsvCollectionMedium

/** Noms français de bibliothèque : traduits au rendu, jamais stockés. */
const MEDIUM_LABELS: Record<LibraryExportMedium, string> = {
  films: 'Films',
  series: 'Séries',
  anime: 'Animation japonaise',
  books: 'Livres',
  mangas: 'Mangas',
  games: 'Jeux',
  artworks: 'Art',
}

/** Deux clés explicites par médium : le français ne fabrique aucun pluriel. */
const MEDIUM_NOUNS: Record<LibraryExportMedium, readonly [string, string]> = {
  films: ['film', 'films'],
  series: ['série', 'séries'],
  anime: ['animation japonaise', 'animations japonaises'],
  books: ['livre', 'livres'],
  mangas: ['manga', 'mangas'],
  games: ['jeu', 'jeux'],
  artworks: ['œuvre', 'œuvres'],
}

type ExportFormat = 'json' | 'csv'
type ExportScope = 'collection' | 'profile'

type LibraryExportFlowProps = {
  kind: LibraryExportMedium
  profileId: string
  bookLibrary?: BookLibraryKey
  seriesLibrary?: SeriesLibraryKey
  /** Ajoute, à côté d'« Exporter », le bouton qui ouvre la création d'une carte à partager de cette bibliothèque. */
  shareCard?: boolean
}

/** Message du bilan : une description traduite au rendu, jamais une phrase figée. */
export type ExportMessage =
  | { kind: 'saved-json'; file: string; count: number; scope: ExportScope; medium: LibraryExportMedium }
  | { kind: 'saved-csv'; file: string; count: number; medium: LibraryExportMedium }
  | { kind: 'cancelled'; format: ExportFormat }
  | { kind: 'saved-letterboxd'; files: string[]; count: number; report: LetterboxdReport; kindOf: LetterboxdKind; remaining: number }
  | { kind: 'nothing-letterboxd'; kindOf: LetterboxdKind }
  | { kind: 'failed' }

export function exportMessageText(message: ExportMessage): string {
  if (message.kind === 'saved-json') {
    const scope = message.scope === 'profile' ? t('tout le profil') : t(MEDIUM_LABELS[message.medium])
    return t(message.count === 1
      ? 'Export JSON enregistré dans « {file} » · {count} fiche · {scope}.'
      : 'Export JSON enregistré dans « {file} » · {count} fiches · {scope}.', {
      file: message.file,
      count: formatNumber(message.count),
      scope,
    })
  }
  if (message.kind === 'saved-csv') {
    return t('Export CSV enregistré dans « {file} » avec {count} {medium}.', {
      file: message.file,
      count: formatNumber(message.count),
      medium: t(message.count === 1 ? MEDIUM_NOUNS[message.medium][0] : MEDIUM_NOUNS[message.medium][1]),
    })
  }
  if (message.kind === 'nothing-letterboxd') {
    return t(message.kindOf === 'watched' ? 'Aucun film terminé à exporter pour Letterboxd.' : 'Aucun film à découvrir à exporter pour Letterboxd.')
  }
  if (message.kind === 'saved-letterboxd') {
    const files = message.files.map(file => `« ${file} »`).join(', ')
    const parts = [t(message.count === 1 ? 'Export Letterboxd enregistré dans {files} · {count} film.' : 'Export Letterboxd enregistré dans {files} · {count} films.', { files, count: formatNumber(message.count) })]
    const { report } = message
    if (report.matchedByTitleOnly > 0) parts.push(t('Reconnus par titre seulement (correspondance non garantie) : {count}.', { count: formatNumber(report.matchedByTitleOnly) }))
    if (message.kindOf === 'watched' && report.withoutDate > 0) parts.push(t('Sans date de visionnage (marqués vus, sans entrée de journal) : {count}.', { count: formatNumber(report.withoutDate) }))
    if (report.favoritesNotCarried > 0) parts.push(t('Favoris non transmis (Letterboxd n’a pas de colonne favori) : {count}.', { count: formatNumber(report.favoritesNotCarried) }))
    if (report.skippedOtherStatus > 0) parts.push(t('Films d’un autre statut, non inclus : {count}.', { count: formatNumber(report.skippedOtherStatus) }))
    if (message.remaining > 0) parts.push(t('Export interrompu : il reste {count} fichier à enregistrer, relancer l’export pour le recréer.', { count: formatNumber(message.remaining) }))
    return parts.join(' ')
  }
  if (message.kind === 'cancelled') {
    return t(message.format === 'json' ? 'Export annulé. Aucun fichier n’a été écrit.' : 'Export CSV annulé. Aucun fichier n’a été écrit.')
  }
  return t('L’export a échoué. La bibliothèque locale n’a pas été modifiée.')
}

function collectionOnly(library: CulturalLibrary, kind: LibraryExportMedium): CulturalLibrary {
  return {
    ...library,
    films: kind === 'films' ? library.films : [],
    series: kind === 'series' ? library.series : [],
    anime: kind === 'anime' ? library.anime : [],
    books: kind === 'books' ? library.books : [],
    mangas: kind === 'mangas' ? library.mangas : [],
    games: kind === 'games' ? library.games : [],
    artworks: kind === 'artworks' ? library.artworks : [],
    // Une bibliothèque de base exportée seule n'emporte aucune bibliothèque personnalisée.
    customLibraries: [],
  }
}

/** Une bibliothèque = une section du document : le type d'export suit la
    bibliothèque ouverte, jamais une catégorie à filtrer. */
function exportMedium(kind: LibraryExportMedium, bookLibrary?: BookLibraryKey, seriesLibrary?: SeriesLibraryKey): LibraryExportMedium {
  if (kind === 'books' && bookLibrary === 'mangas') return 'mangas'
  if (kind === 'series' && seriesLibrary === 'anime') return 'anime'
  return kind
}

function countExported(library: CulturalLibrary, medium: LibraryExportMedium, scope: ExportScope): number {
  if (scope === 'collection') return library[medium].length
  return library.films.length + library.series.length + library.anime.length + library.books.length
    + library.mangas.length + library.games.length + library.artworks.length
}

/**
 * Nom de fichier et contenu du contrat d'export : calculés ici une seule fois,
 * identiques dans toutes les langues (aucun libellé traduit n'y entre).
 */
export function planLibraryExport(
  format: ExportFormat,
  scope: ExportScope,
  medium: LibraryExportMedium,
  library: CulturalLibrary,
  exportedAt: string = new Date().toISOString(),
): { suggestedName: string; contents: string } {
  if (format === 'json') {
    const document = createLibraryDocument(scope === 'profile' ? library : collectionOnly(library, medium), exportedAt)
    const suggestedName = scope === 'profile'
      ? libraryExportFileName(document.exportedAt)
      : libraryExportFileName(document.exportedAt).replace('sylloge-sauvegarde-', `sylloge-${medium}-`)
    return { suggestedName, contents: serializeLibraryDocument(document) }
  }
  const exported = createCollectionCsvExport(library, medium, exportedAt)
  return { suggestedName: exported.fileName, contents: exported.contents }
}

/**
 * Export unitaire d'une bibliothèque (jalon 0.4.29) : un seul bouton
 * « Exporter » ouvre un dialogue qui liste les formats proposés — JSON
 * Sylloge (document complet versionné) ou CSV (tableur) — puis écrit le
 * fichier choisi. Aucune écriture n'a lieu avant le choix explicite.
 */
export function LibraryExportFlow({ kind, profileId, bookLibrary, seriesLibrary, shareCard = false }: LibraryExportFlowProps) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<ExportScope>('collection')
  const [saving, setSaving] = useState<ExportFormat | null>(null)
  const [message, setMessage] = useState<ExportMessage | null>(null)
  // Quand la carte est ouverte, la bibliothèque qu'elle montre d'emblée (aucune : tout le profil).
  const [shareOpen, setShareOpen] = useState<{ library: ShareLibraryKey | undefined } | null>(null)
  const medium = exportMedium(kind, bookLibrary, seriesLibrary)
  const mediumLabel = MEDIUM_LABELS[medium]

  const runLetterboxd = async (letterboxdKind: LetterboxdKind) => {
    if (saving !== null) return
    setSaving('csv')
    setMessage(null)
    try {
      const loaded = await libraryRepository.loadLibrary(profileId)
      const plan = planLetterboxdExport(loaded.films, letterboxdKind, new Date().toISOString())
      if (plan.parts.length === 0) { setMessage({ kind: 'nothing-letterboxd', kindOf: letterboxdKind }); return }
      const files: string[] = []
      let count = 0
      for (const part of plan.parts) {
        const savedName = await saveExportCsv(part.fileName, part.contents)
        if (savedName === null) break
        files.push(savedName)
        count += part.count
      }
      setMessage(files.length === 0
        ? { kind: 'cancelled', format: 'csv' }
        : { kind: 'saved-letterboxd', files, count, report: plan.report, kindOf: letterboxdKind, remaining: plan.parts.length - files.length })
    } catch (error) {
      console.error('Impossible d’exporter pour Letterboxd.', error)
      setMessage({ kind: 'failed' })
    } finally {
      setSaving(null)
    }
  }

  const runExport = async (format: ExportFormat) => {
    if (saving !== null) return
    setSaving(format)
    setMessage(null)
    try {
      const loaded = await libraryRepository.loadLibrary(profileId)
      const plan = planLibraryExport(format, scope, medium, loaded)
      const savedName = format === 'json'
        ? await saveExportJson(plan.suggestedName, plan.contents)
        : await saveExportCsv(plan.suggestedName, plan.contents)
      // Le bilan reste lisible dans la fenêtre, y compris en cas d’annulation.
      setMessage(savedName
        ? format === 'json'
          ? { kind: 'saved-json', file: savedName, count: countExported(loaded, medium, scope), scope, medium }
          : { kind: 'saved-csv', file: savedName, count: countExported(loaded, medium, 'collection'), medium }
        : { kind: 'cancelled', format })
    } catch (error) {
      console.error(`Impossible d’exporter ${mediumLabel}.`, error)
      setMessage({ kind: 'failed' })
    } finally {
      setSaving(null)
    }
  }

  return (
    <span className="transfer-action">
      {shareCard && <button className="secondary-button" type="button" onClick={() => setShareOpen({ library: medium })}>{t("Créer une carte")}</button>}
      <button className="secondary-button" type="button" onClick={() => { setScope('collection'); setMessage(null); setOpen(true) }}>
        {t("Exporter")}
      </button>
      {message && !open && <span className="transfer-action-message" role="status">{exportMessageText(message)}</span>}
      {open && (
        <AccessibleDialog
          title={scope === 'profile' ? t('Exporter tout le profil') : t('Exporter {medium}', { medium: t(mediumLabel) })}
          description={t("Choisir le format du fichier. La bibliothèque locale n’est pas modifiée.")}
          closeDisabled={saving !== null}
          onClose={() => setOpen(false)}
          size="md"
        >
          <ExportDialogContent
            mediumLabel={mediumLabel}
            scope={scope}
            saving={saving}
            message={message === null ? null : exportMessageText(message)}
            onScope={setScope}
            onExport={(format) => void runExport(format)}
            onShareCard={() => { setOpen(false); setShareOpen({ library: scope === 'profile' ? undefined : medium }) }}
            onLetterboxd={medium === 'films' ? kind => void runLetterboxd(kind) : undefined}
            onClose={() => setOpen(false)}
          />
        </AccessibleDialog>
      )}
      {shareOpen && <ShareCardDialog profileId={profileId} initialLibrary={shareOpen.library} onClose={() => setShareOpen(null)} />}
    </span>
  )
}

/** Contenu du dialogue, isolé du portail pour être rendu et testé seul. */
export function ExportDialogContent({
  mediumLabel,
  scope,
  saving,
  message,
  onScope,
  onExport,
  onShareCard,
  onLetterboxd,
  onClose,
}: {
  mediumLabel: string
  scope: ExportScope
  saving: ExportFormat | null
  message: string | null
  onScope: (scope: ExportScope) => void
  onExport: (format: ExportFormat) => void
  /** Ouvre la carte à partager ; sans elle, l'option n'est pas proposée. */
  onShareCard?: () => void
  /** Export au format d'import de Letterboxd ; réservé aux films. */
  onLetterboxd?: (kind: LetterboxdKind) => void
  onClose: () => void
}) {
  return (
    <div className="assistant-content export-review">
      <fieldset className="transfer-scope">
        <legend>{t("Contenu à exporter")}</legend>
        <label><input type="radio" name="export-scope" checked={scope === 'collection'} disabled={saving !== null} onChange={() => onScope('collection')} />{t('{medium} uniquement', { medium: t(mediumLabel) })}</label>
        <label><input type="radio" name="export-scope" checked={scope === 'profile'} disabled={saving !== null} onChange={() => onScope('profile')} />{t("Tout le profil · toutes ses bibliothèques")}</label>
      </fieldset>
      <p className="import-contextual-hint">{t("JSON pour conserver une copie réimportable ; CSV pour travailler dans un tableur. Aucun envoi en ligne, aucune modification des fiches.")}</p>
      <div className="export-format-options">
        <button
          className="export-format-option"
          type="button"
          disabled={saving !== null}
          onClick={() => onExport('json')}
        >
          <b>{saving === 'json' ? t('Export en cours…') : 'JSON Sylloge'}</b>
          <small>{t("Copie réimportable des données personnelles : notes, avis, dates, favoris, progression et citations. Les caches fournisseurs et les réglages de l’application sont exclus.")}</small>
        </button>
        {scope === 'collection' && <button
          className="export-format-option"
          type="button"
          disabled={saving !== null}
          onClick={() => onExport('csv')}
        >
          <b>{saving === 'csv' ? t('Export en cours…') : 'CSV'}</b>
          <small>{t("Colonnes UTF-8 pour un tableur. Les citations restent des cellules JSON ; les champs libres d’Art et les identifiants de citations ne sont pas inclus. Privilégier JSON pour une copie fidèle.")}</small>
        </button>}
        {onLetterboxd && scope === 'collection' && <>
          <button className="export-format-option" type="button" disabled={saving !== null} onClick={() => onLetterboxd('watched')}>
            <b>{t('Letterboxd · films vus')}</b>
            <small>{t('CSV au format d’import de Letterboxd : films terminés avec note, date de visionnage et avis. À importer sur letterboxd.com/import.')}</small>
          </button>
          <button className="export-format-option" type="button" disabled={saving !== null} onClick={() => onLetterboxd('watchlist')}>
            <b>{t('Letterboxd · liste à voir')}</b>
            <small>{t('CSV au format d’import de Letterboxd : films à découvrir, pour la liste « à voir » de Letterboxd. Un fichier distinct, importé séparément.')}</small>
          </button>
        </>}
        {onShareCard && <button
          className="export-format-option"
          type="button"
          disabled={saving !== null}
          onClick={onShareCard}
        >
          <b>{t('Carte à partager')}</b>
          <small>{t('Image PNG à envoyer ou à publier : les coups de cœur que vous choisissez, avec vos chiffres. Ce n’est pas une copie des données.')}</small>
        </button>}
      </div>
      {message && <p className="inline-report" role="status">{message}</p>}
      <div className="assistant-actions"><button className="secondary-button" type="button" disabled={saving !== null} onClick={onClose}>{t("Fermer")}</button></div>
    </div>
  )
}
