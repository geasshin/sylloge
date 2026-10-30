import { formatNumber, t } from '../i18n/core.ts'
import { useState } from 'react'
import { libraryRepository } from '../data/libraryRepository.ts'
import { mediaRepository } from '../data/mediaRepository.ts'
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
import { planSensCritiqueExport, type SensCritiqueReport } from '../domain/sensCritiqueExport.ts'
import { planSimklExport, type SimklReport } from '../domain/simklExport.ts'
import { planStoryGraphExport, type StoryGraphReport } from '../domain/storyGraphExport.ts'
import { planHardcoverExport, type HardcoverReport } from '../domain/hardcoverExport.ts'
import { exportServicesFor, SERVICE_NAMES, type ExportService, type ExportServiceId } from '../domain/exportServices.ts'

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
/** Écriture en cours : un format de sauvegarde ou un service. */
type Saving = ExportFormat | ExportServiceId | null

type LibraryExportFlowProps = {
  kind: LibraryExportMedium
  profileId: string
  bookLibrary?: BookLibraryKey
  seriesLibrary?: SeriesLibraryKey
}

/** Résultat d'un service, avec son type : le bilan est écrit sans deviner les champs. */
export type ServiceReport =
  | { service: 'senscritique'; report: SensCritiqueReport }
  | { service: 'simkl'; report: SimklReport }
  | { service: 'storygraph'; report: StoryGraphReport }
  | { service: 'hardcover'; report: HardcoverReport }

/** Message du bilan : une description traduite au rendu, jamais une phrase figée. */
export type ExportMessage =
  | { kind: 'saved-json'; file: string; count: number; scope: ExportScope; medium: LibraryExportMedium }
  | { kind: 'saved-csv'; file: string; count: number; medium: LibraryExportMedium }
  | { kind: 'cancelled'; format: ExportFormat }
  | { kind: 'saved-letterboxd'; files: string[]; count: number; report: LetterboxdReport; kindOf: LetterboxdKind; remaining: number }
  | { kind: 'nothing-letterboxd'; kindOf: LetterboxdKind }
  | { kind: 'saved-service'; files: string[]; payload: ServiceReport; remaining: number }
  | { kind: 'nothing-service'; service: ExportServiceId }
  | { kind: 'failed' }

function quotedFiles(files: readonly string[]): string {
  return files.map(file => `« ${file} »`).join(', ')
}

function mediumNoun(medium: LibraryExportMedium, count: number): string {
  return t(count === 1 ? MEDIUM_NOUNS[medium][0] : MEDIUM_NOUNS[medium][1])
}

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
      medium: mediumNoun(message.medium, message.count),
    })
  }
  if (message.kind === 'nothing-letterboxd') {
    return t(message.kindOf === 'watched' ? 'Aucun film terminé à exporter pour Letterboxd.' : 'Aucun film à découvrir à exporter pour Letterboxd.')
  }
  if (message.kind === 'saved-letterboxd') {
    const parts = [t(message.count === 1 ? 'Export Letterboxd enregistré dans {files} · {count} film.' : 'Export Letterboxd enregistré dans {files} · {count} films.', { files: quotedFiles(message.files), count: formatNumber(message.count) })]
    const { report } = message
    if (report.matchedByTitleOnly > 0) parts.push(t('Reconnus par titre seulement (correspondance non garantie) : {count}.', { count: formatNumber(report.matchedByTitleOnly) }))
    if (message.kindOf === 'watched' && report.withoutDate > 0) parts.push(t('Sans date de visionnage (marqués vus, sans entrée de journal) : {count}.', { count: formatNumber(report.withoutDate) }))
    if (report.favoritesNotCarried > 0) parts.push(t('Favoris non transmis (Letterboxd n’a pas de colonne favori) : {count}.', { count: formatNumber(report.favoritesNotCarried) }))
    if (report.skippedOtherStatus > 0) parts.push(t('Films d’un autre statut, non inclus : {count}.', { count: formatNumber(report.skippedOtherStatus) }))
    if (message.remaining > 0) parts.push(t('Export interrompu : il reste {count} fichier à enregistrer, relancer l’export pour le recréer.', { count: formatNumber(message.remaining) }))
    return parts.join(' ')
  }
  if (message.kind === 'nothing-service') {
    return t('Aucune œuvre à exporter pour {service}.', { service: SERVICE_NAMES[message.service] })
  }
  if (message.kind === 'saved-service') {
    const { payload, files } = message
    const count = payload.report.exported
    const medium: LibraryExportMedium = payload.service === 'senscritique'
      ? (payload.report.universe === 'movie' ? 'films' : 'series')
      : payload.service === 'simkl'
        ? payload.report.medium
        : payload.service === 'hardcover'
          ? 'books'
          : (payload.report.library === 'books' ? 'books' : 'mangas')
    const parts = [t('Export {service} enregistré dans {files} · {count} {medium}.', {
      service: SERVICE_NAMES[payload.service],
      files: quotedFiles(files),
      count: formatNumber(count),
      medium: mediumNoun(medium, count),
    })]
    if (message.remaining > 0) parts.push(t('Export interrompu : il reste {count} fichier à enregistrer, relancer l’export pour le recréer.', { count: formatNumber(message.remaining) }))
    if (payload.service === 'senscritique') {
      const { report } = payload
      if (report.wishlisted > 0) parts.push(t('Envies de voir : {count}.', { count: formatNumber(report.wishlisted) }))
      if (report.recommended > 0) parts.push(t('Coups de cœur : {count}.', { count: formatNumber(report.recommended) }))
      if (report.done > 0) parts.push(t('Vus : {count}.', { count: formatNumber(report.done) }))
      if (report.withoutRating > 0) parts.push(t('Sans note (cellule vide, jamais 0) : {count}.', { count: formatNumber(report.withoutRating) }))
      if (report.withoutYear > 0) parts.push(t(report.universe === 'tvshow'
        ? 'Sans année : {count} séries, que Sylloge ne date pas.'
        : 'Sans année : {count} films.', { count: formatNumber(report.withoutYear) }))
      if (report.statusNotExpressed > 0) parts.push(t('États que SensCritique ne sait pas exprimer (en attente, abandonné, en cours) : {count}, exportés sans indicateur.', { count: formatNumber(report.statusNotExpressed) }))
      if (report.ratingsRounded > 0) parts.push(t('Notes arrondies avant conversion sur 10 : {count}.', { count: formatNumber(report.ratingsRounded) }))
    }
    if (payload.service === 'simkl') {
      const { report } = payload
      if (report.withTmdbId > 0) parts.push(t('Identifiants TMDB transmis : {count}.', { count: formatNumber(report.withTmdbId) }))
      const withoutId = report.exported - report.withTmdbId
      if (withoutId > 0) parts.push(t('Sans identifiant TMDB (reconnus par leur titre) : {count}.', { count: formatNumber(withoutId) }))
      if (report.withoutYear > 0) parts.push(t('Sans année : {count} séries, que Sylloge ne date pas.', { count: formatNumber(report.withoutYear) }))
      if (report.withoutWatchedDate > 0) parts.push(t('Sans date de visionnage : {count}.', { count: formatNumber(report.withoutWatchedDate) }))
      if (report.withoutRating > 0) parts.push(t('Sans note (cellule vide, jamais 0) : {count}.', { count: formatNumber(report.withoutRating) }))
      if (report.progressNotWritten > 0) parts.push(t('Progression non transmise (saisons, jamais un numéro d’épisode) : {count}.', { count: formatNumber(report.progressNotWritten) }))
      if (report.ratingsRounded > 0) parts.push(t('Notes arrondies avant conversion sur 10 : {count}.', { count: formatNumber(report.ratingsRounded) }))
    }
    if (payload.service === 'storygraph') {
      const { report } = payload
      parts.push(t('Format Goodreads : The StoryGraph l’accepte, Goodreads le refuse (ISBN exigé pour chaque livre, et Sylloge n’en stocke aucun).'))
      if (report.unrated > 0) parts.push(t('Sans note (0 dans My Rating) : {count}.', { count: formatNumber(report.unrated) }))
      if (report.ratingsRounded > 0) parts.push(t('Notes arrondies à l’entier sur 5 : {count}.', { count: formatNumber(report.ratingsRounded) }))
      if (report.favoritesNotCarried > 0) parts.push(t('Coups de cœur non transmis (pas de colonne favori) : {count}.', { count: formatNumber(report.favoritesNotCarried) }))
      if (report.quotesNotCarried > 0) parts.push(t('Citations non transmises (pas de colonne citation) : {count}.', { count: formatNumber(report.quotesNotCarried) }))
      if (report.withoutAddedDate > 0) parts.push(t('Sans date d’ajout, que The StoryGraph exige : {count}.', { count: formatNumber(report.withoutAddedDate) }))
    }
    if (payload.service === 'hardcover') {
      const { report } = payload
      if (report.withRating > 0) parts.push(t('Notes transmises sans arrondi (Hardcover accepte les demi-points) : {count}.', { count: formatNumber(report.withRating) }))
      if (report.withoutRating > 0) parts.push(t('Sans note : {count}.', { count: formatNumber(report.withoutRating) }))
      if (report.withoutStartDate > 0) parts.push(t('Sans date de début de lecture : {count}.', { count: formatNumber(report.withoutStartDate) }))
      if (report.favoritesNotCarried > 0) parts.push(t('Coups de cœur non transmis (pas de colonne favori) : {count}.', { count: formatNumber(report.favoritesNotCarried) }))
      if (report.quotesNotCarried > 0) parts.push(t('Citations non transmises (pas de colonne citation) : {count}.', { count: formatNumber(report.quotesNotCarried) }))
    }
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
 * Export unitaire d'une bibliothèque : un seul bouton « Exporter » ouvre un
 * dialogue en deux groupes — sauvegarde complète (JSON Sylloge, CSV) et
 * « Exporter vers… » (un fichier au format d'import exact de chaque service
 * proposé pour la bibliothèque ouverte). Aucune écriture n'a lieu avant le
 * choix explicite.
 */
export function LibraryExportFlow({ kind, profileId, bookLibrary, seriesLibrary }: LibraryExportFlowProps) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<ExportScope>('collection')
  const [saving, setSaving] = useState<Saving>(null)
  const [message, setMessage] = useState<ExportMessage | null>(null)
  // Quand la carte est ouverte, la bibliothèque qu'elle montre d'emblée (aucune : tout le profil).
  const [shareOpen, setShareOpen] = useState<{ library: ShareLibraryKey | undefined } | null>(null)
  const medium = exportMedium(kind, bookLibrary, seriesLibrary)
  const mediumLabel = MEDIUM_LABELS[medium]
  const services = exportServicesFor(medium)

  const runLetterboxd = async (letterboxdKind: LetterboxdKind) => {
    if (saving !== null) return
    setSaving(letterboxdKind === 'watched' ? 'letterboxd' : 'letterboxd-watchlist')
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

  /** Liens fournisseurs du médium : l'identifiant TMDB des séries et des animés vit là. */
  const providerLinks = async (target: 'series' | 'anime') => {
    const links = new Map<string, { providerName: string; providerId: string }>()
    for (const link of await mediaRepository.listMediaProviderLinks(profileId, target)) {
      links.set(link.mediaId, { providerName: link.providerName, providerId: link.providerId })
    }
    return links
  }

  const runService = async (service: ExportServiceId) => {
    if (saving !== null) return
    if (service === 'letterboxd') { await runLetterboxd('watched'); return }
    if (service === 'letterboxd-watchlist') { await runLetterboxd('watchlist'); return }
    setSaving(service)
    setMessage(null)
    try {
      const loaded = await libraryRepository.loadLibrary(profileId)
      const exportedAt = new Date().toISOString()
      const built = await (async (): Promise<{ fileName: string; contents: string; payload: ServiceReport }> => {
        if (service === 'senscritique') {
          const plan = medium === 'films'
            ? planSensCritiqueExport({ universe: 'movie', films: loaded.films }, exportedAt)
            : planSensCritiqueExport({ universe: 'tvshow', series: loaded.series }, exportedAt)
          return { fileName: plan.fileName, contents: plan.contents, payload: { service: 'senscritique', report: plan.report } }
        }
        if (service === 'simkl') {
          const plan = medium === 'films'
            ? planSimklExport({ medium: 'films', films: loaded.films }, exportedAt)
            : medium === 'series'
              ? planSimklExport({ medium: 'series', series: loaded.series, providerLinks: await providerLinks('series') }, exportedAt)
              : planSimklExport({ medium: 'anime', anime: loaded.anime, providerLinks: await providerLinks('anime') }, exportedAt)
          return { fileName: plan.fileName, contents: plan.contents, payload: { service: 'simkl', report: plan.report } }
        }
        if (service === 'storygraph') {
          const library = medium === 'mangas' ? 'mangas' as const : 'books' as const
          const plan = planStoryGraphExport({ library, books: library === 'mangas' ? loaded.mangas : loaded.books }, exportedAt)
          return { fileName: plan.fileName, contents: plan.contents, payload: { service: 'storygraph', report: plan.report } }
        }
        const plan = planHardcoverExport(loaded.books, exportedAt)
        return { fileName: plan.fileName, contents: plan.contents, payload: { service: 'hardcover', report: plan.report } }
      })()
      if (built.contents === '') { setMessage({ kind: 'nothing-service', service }); return }
      const savedName = await saveExportCsv(built.fileName, built.contents)
      setMessage(savedName === null
        ? { kind: 'cancelled', format: 'csv' }
        : { kind: 'saved-service', files: [savedName], payload: built.payload, remaining: 0 })
    } catch (error) {
      console.error(`Impossible d’exporter pour ${SERVICE_NAMES[service]}.`, error)
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
        >
          <ExportDialogContent
            mediumLabel={mediumLabel}
            scope={scope}
            saving={saving}
            message={message === null ? null : exportMessageText(message)}
            services={services}
            onScope={setScope}
            onExport={(format) => void runExport(format)}
            onService={(service) => void runService(service)}
            onShareCard={() => { setOpen(false); setShareOpen({ library: scope === 'profile' ? undefined : medium }) }}
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
  services = [],
  onScope,
  onExport,
  onService,
  onShareCard,
  onClose,
}: {
  mediumLabel: string
  scope: ExportScope
  saving: Saving
  message: string | null
  /** Services proposés pour la bibliothèque ouverte : aucun pour Jeux et Art. */
  services?: ExportService[]
  onScope: (scope: ExportScope) => void
  onExport: (format: ExportFormat) => void
  /** Écrit le fichier au format d'import du service choisi. */
  onService?: (service: ExportServiceId) => void
  /** Ouvre la carte à partager ; sans elle, l'option n'est pas proposée. */
  onShareCard?: () => void
  onClose: () => void
}) {
  const busy = saving !== null
  return (
    <div className="assistant-content export-review">
      <fieldset className="transfer-scope">
        <legend>{t("Contenu à exporter")}</legend>
        <label><input type="radio" name="export-scope" checked={scope === 'collection'} disabled={busy} onChange={() => onScope('collection')} />{t('{medium} uniquement', { medium: t(mediumLabel) })}</label>
        <label><input type="radio" name="export-scope" checked={scope === 'profile'} disabled={busy} onChange={() => onScope('profile')} />{t("Tout le profil · toutes ses bibliothèques")}</label>
      </fieldset>

      <section className="export-group">
        <h3 className="card-kicker export-group-title">{t('Sauvegarde complète')}</h3>
        <p className="import-contextual-hint">{t("JSON pour réimporter, CSV pour un tableur. Aucun envoi en ligne, aucune fiche modifiée.")}</p>
        <div className="export-format-options">
          <button
            className="export-format-option"
            type="button"
            disabled={busy}
            onClick={() => onExport('json')}
          >
            <b>{saving === 'json' ? t('Export en cours…') : 'JSON Sylloge'}</b>
            <small>{t("Copie réimportable des données personnelles : notes, avis, dates, favoris, progression et citations. Les caches fournisseurs et les réglages de l’application sont exclus.")}</small>
          </button>
          {scope === 'collection' && <button
            className="export-format-option"
            type="button"
            disabled={busy}
            onClick={() => onExport('csv')}
          >
            <b>{saving === 'csv' ? t('Export en cours…') : 'CSV'}</b>
            <small>{t("Colonnes UTF-8 pour un tableur. Les citations restent des cellules JSON ; les champs libres d’Art et les identifiants de citations ne sont pas inclus. Privilégier JSON pour une copie fidèle.")}</small>
          </button>}
        </div>
      </section>

      {services.length > 0 && scope === 'collection' && onService && (
        <section className="export-group">
          <h3 className="card-kicker export-group-title">{t('Exporter vers un service')}</h3>
          <p className="import-contextual-hint">{t("Un fichier par service, au format d’import exact. Rien n’est envoyé en ligne.")}</p>
          <ul className="export-service-list">
            {services.map(service => (
              <li className="export-service" key={service.id}>
                <button
                  className="export-format-option"
                  type="button"
                  disabled={busy}
                  onClick={() => onService(service.id)}
                >
                  <b>{saving === service.id ? t('Export en cours…') : t(service.label)}</b>
                  <small>{t(service.help)}</small>
                </button>
                <a className="export-service-link" href={service.importUrl} target="_blank" rel="noreferrer">{t(service.linkLabel)}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {onShareCard && (
        <div className="export-share-actions">
          <button
            className="export-format-option"
            type="button"
            disabled={busy}
            onClick={onShareCard}
          >
            <b>{t('Image à partager')}</b>
            <small>{t('Image PNG à envoyer ou à publier : les coups de cœur que vous choisissez, avec vos chiffres. Ce n’est pas une copie des données.')}</small>
          </button>
        </div>
      )}

      {message && <p className="inline-report" role="status">{message}</p>}
      <div className="assistant-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{t("Fermer")}</button></div>
    </div>
  )
}
