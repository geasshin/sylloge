import { formatNumber, t, translateMessage } from '../i18n/core.ts'
import { useMemo, useState } from 'react'
import { Select } from './Select.tsx'
import type { Film } from '../domain/film.ts'
import {
  FILM_IMPORT_FIELD_LABELS,
  IMPORTABLE_FILM_FIELDS,
  NOTION_MARKDOWN_NOTES_SOURCE,
  filmImportDestinationForSource,
  filmImportSourceRestriction,
  initialFilmImportConfiguration,
  inspectFilmCsvImportSource,
  isFilmImportRatingSource,
  prepareFilmCsvImport,
  previewFilmCsvImport,
  setFilmImportSourceDestination,
  type FilmImportConfiguration,
  type FilmImportSession,
  type FilmImportSource,
  type FilmsCsvImportPreview,
  type ImportableFilmField,
  type PickedFilmsImportFile,
} from '../domain/filmCsvImport.ts'

type FilmCsvImportStep = 'source' | 'mapping' | 'preview'

/** French source labels; translated at render so a language change repaints. */
const IMPORT_STEPS = ['Source', 'Colonnes', 'Aperçu'] as const

const SOURCE_KIND_LABELS = {
  notion: 'Archive ZIP compatible',
  container: 'Conteneur local',
  csv: 'Fichier CSV',
} as const

const PREVIEW_SOURCE_LABELS = {
  notion: 'Archive ZIP compatible',
  container: 'Conteneur local',
  csv: 'Bibliothèque Films CSV',
  'sylloge-csv-v1': 'Bibliothèque Films Sylloge CSV',
} as const

type PreparedFilmCsvImport = {
  session: FilmImportSession
  configuration: FilmImportConfiguration | null
  preview: FilmsCsvImportPreview
}

type FilmCsvImportFlowProps = {
  source: PickedFilmsImportFile
  currentProfileName: string
  onReady: (films: Film[]) => void
  onChooseAnother: () => void
}

function prepareSelection(
  source: PickedFilmsImportFile,
  candidateId: string | null,
  currentProfileName: string,
): PreparedFilmCsvImport | null {
  if (candidateId === null) return null
  const session = prepareFilmCsvImport(source, candidateId)
  const initial = initialFilmImportConfiguration(session)
  const configuration = initial === null ? null : { ...initial, profileName: currentProfileName }
  return {
    session,
    configuration,
    preview: previewFilmCsvImport(session, source, configuration),
  }
}

export function FilmCsvImportFlow({
  source,
  currentProfileName,
  onReady,
  onChooseAnother,
}: FilmCsvImportFlowProps) {
  const sourceSelection = useMemo(() => inspectFilmCsvImportSource(source), [source])
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(sourceSelection.defaultCandidateId)
  const [prepared, setPrepared] = useState<PreparedFilmCsvImport | null>(() => (
    prepareSelection(source, sourceSelection.defaultCandidateId, currentProfileName)
  ))
  const [step, setStep] = useState<FilmCsvImportStep>('source')

  const selectCandidate = (candidateId: string | null) => {
    setSelectedCandidateId(candidateId)
    setPrepared(prepareSelection(source, candidateId, currentProfileName))
  }

  const updateConfiguration = (update: (configuration: FilmImportConfiguration) => FilmImportConfiguration) => {
    setPrepared((current) => {
      if (current === null || current.configuration === null) return current
      const configuration = update(current.configuration)
      return {
        ...current,
        configuration,
        preview: previewFilmCsvImport(current.session, source, configuration),
      }
    })
  }

  const nextStep = prepared?.session.kind === 'generic' ? 'mapping' : 'preview'

  return (
    <div className="assistant-content">
      <ol className="assistant-steps" aria-label={t("Étapes de l’import CSV ou ZIP")}>
        {IMPORT_STEPS.map((label, index) => {
          const current = step === 'source' ? 1 : step === 'mapping' ? 2 : 3
          return <li className={index + 1 === current ? 'active' : index + 1 < current ? 'complete' : ''} key={label}>{t(label)}</li>
        })}
      </ol>
      <div className="assistant-toolbar">
        <button className="secondary-button" type="button" onClick={onChooseAnother}>{t("Choisir un autre fichier")}</button>
      </div>

      {step === 'source' && (
        <section className="assistant-stage">
          <p className="card-kicker">{t("Source détectée")}</p>
          <h3>{t(SOURCE_KIND_LABELS[source.kind])}</h3>
          <dl className="assistant-source-summary">
            <div><dt>{t("Fichier")}</dt><dd>{source.name}</dd></div>
            <div>
              <dt>{t("Table")}</dt>
              <dd>{selectedCandidateId
                ? sourceSelection.candidates.find((candidate) => candidate.id === selectedCandidateId)?.label ?? t('À choisir')
                : t('À choisir')}</dd>
            </div>
          </dl>
          {sourceSelection.selectionRequired && (
            <div className="films-import-profile-name">
              <span id="films-import-table-label">{t("Table à importer")}</span>
              <Select
                id="films-import-table"
                labelledBy="films-import-table-label"
                value={selectedCandidateId ?? ''}
                onChange={(next) => selectCandidate(next || null)}
                options={[
                  { value: '', label: t("Choisir une table") },
                  ...sourceSelection.candidates.map((candidate) => ({ value: candidate.id, label: candidate.label })),
                ]}
              />
            </div>
          )}
          <p className="films-import-details">
            {sourceSelection.automaticSelectionMessage
              ? translateMessage(sourceSelection.automaticSelectionMessage)
              : t(sourceSelection.selectionRequired
                ? 'Cette archive contient plusieurs tables. Choisissez celle à prévisualiser avant de continuer.'
                : 'La table disponible est retenue pour préparer l’import dans le profil courant.')}
          </p>
          <div className="assistant-actions">
            <button className="primary-button" type="button" disabled={prepared === null} onClick={() => setStep(nextStep)}>
              {t(prepared?.session.kind === 'generic' ? 'Vérifier les colonnes' : 'Voir l’aperçu')}
            </button>
          </div>
        </section>
      )}

      {step === 'mapping' && prepared?.session.kind === 'generic' && prepared.configuration !== null && (
        <section className="assistant-stage">
          <h3>{t("Choisir où importer chaque colonne")}</h3>
          <p className="films-import-details">{t("Seules vos données de suivi sont importées. Les métadonnées du film restent exclues et pourront être complétées plus tard.")}</p>
          <SourceToDestinationMapping
            configuration={prepared.configuration}
            session={prepared.session}
            source={source}
            preview={prepared.preview}
            onConfigurationChange={updateConfiguration}
          />
          <div className="assistant-actions">
            <button className="secondary-button" type="button" onClick={() => setStep('source')}>{t("Retour à la source")}</button>
            <button className="primary-button" type="button" onClick={() => setStep('preview')}>{t("Vérifier l’aperçu")}</button>
          </div>
        </section>
      )}

      {step === 'preview' && prepared !== null && (
        <FilmCsvImportPreviewPanel
          preview={prepared.preview}
          onBack={() => setStep(prepared.session.kind === 'generic' ? 'mapping' : 'source')}
          onContinue={() => {
            const films = prepared.preview.document?.films ?? []
            if (prepared.preview.errors.length === 0 && films.length > 0) onReady(films)
          }}
        />
      )}
    </div>
  )
}

function SourceToDestinationMapping({
  configuration,
  session,
  source,
  preview,
  onConfigurationChange,
}: {
  configuration: FilmImportConfiguration
  session: Extract<FilmImportSession, { kind: 'generic' }>
  source: PickedFilmsImportFile
  preview: FilmsCsvImportPreview
  onConfigurationChange: (update: (configuration: FilmImportConfiguration) => FilmImportConfiguration) => void
}) {
  const sources: Array<{ source: FilmImportSource; label: string; detail: string }> = session.headers.map((header) => {
    const restriction = filmImportSourceRestriction(header)
    return {
      source: header,
      label: header,
      detail: t(restriction === 'metadata'
        ? 'Métadonnée récupérée plus tard, non importée'
        : restriction === 'future-feature'
          ? 'Fonctionnalité future, non importée'
          : 'Colonne du tableau sélectionné'),
    }
  })
  if (source.kind === 'notion' && source.markdownPages.length > 0) {
    sources.push({
      source: NOTION_MARKDOWN_NOTES_SOURCE,
      label: t('Pages de notes associées'),
      detail: t('Contenu texte associé, distinct d’une évaluation chiffrée'),
    })
  }

  const detectedScaleLabel = t({
    none: 'Aucune évaluation détectée',
    ambiguous: 'Échelle ambiguë',
    mixed: 'Échelles mélangées',
    5: '/5 détectée',
    10: '/10 détectée',
  }[preview.detectedRatingScale])

  return (
    <div className="source-destination-mapping" aria-label={t('Mapping source vers Sylloge')}>
      <div className="source-destination-header" aria-hidden="true"><span>{t("Détecté dans votre fichier")}</span><span>→</span><span>{t("Importer dans Sylloge")}</span></div>
      {sources.map(({ source: sourceValue, label, detail }, sourceIndex) => {
        const destination = filmImportDestinationForSource(configuration, sourceValue)
        const isMarkdownNotes = sourceValue === NOTION_MARKDOWN_NOTES_SOURCE
        const isRatingSource = !isMarkdownNotes && isFilmImportRatingSource(sourceValue)
        const fixedNotImported = !isMarkdownNotes && filmImportSourceRestriction(sourceValue) !== null
        const availableDestinations: readonly ImportableFilmField[] = isMarkdownNotes
          ? ['personalNote']
          : isRatingSource
            ? ['rating']
            : IMPORTABLE_FILM_FIELDS
        return (
          <div className="source-destination-row" key={sourceValue}>
            <div><b>{label}</b><small>{detail}</small></div>
            <span className="mapping-arrow" aria-hidden="true">→</span>
            <div>
              <Select
                id={`film-import-destination-${sourceIndex}`}
                ariaLabel={t('Destination Sylloge de {column}', { column: label })}
                value={fixedNotImported ? '' : destination ?? ''}
                disabled={fixedNotImported}
                onChange={(next) => onConfigurationChange((current) => setFilmImportSourceDestination(
                  current,
                  sourceValue,
                  next === '' ? null : next as ImportableFilmField,
                ))}
                options={[
                  { value: '', label: t("Ne pas importer") },
                  ...availableDestinations.map((field) => ({ value: field, label: t(FILM_IMPORT_FIELD_LABELS[field]) })),
                ]}
              />
            </div>
          </div>
        )
      })}
      {configuration.mapping.rating && preview.detectedRatingScale !== 'none' && (
        <div className="films-import-rating-scale">
          <span id="films-import-rating-scale-label">{t('Évaluation : {scale}', { scale: detectedScaleLabel })}</span>
          <Select
            id="films-import-rating-scale"
            labelledBy="films-import-rating-scale-label"
            value={configuration.ratingScale === null || configuration.ratingScale === undefined ? '' : String(configuration.ratingScale)}
            onChange={(next) => onConfigurationChange((current) => ({
              ...current,
              ratingScale: next === '5' || next === '10' ? Number(next) as 5 | 10 : null,
            }))}
            options={[
              { value: '', label: t("Choisir l’échelle") },
              { value: '5', label: '/5' },
              { value: '10', label: '/10' },
            ]}
          />
        </div>
      )}
      {preview.detectedRatingScale === 10 && (
        <p className="films-import-details"><b>{t("Conversion proposée :")}</b> {t("les évaluations /10 seront normalisées vers l’échelle Sylloge /5 par demi-points.")}</p>
      )}
    </div>
  )
}

function FilmCsvImportPreviewPanel({
  preview,
  onBack,
  onContinue,
}: {
  preview: FilmsCsvImportPreview
  onBack: () => void
  onContinue: () => void
}) {
  const films = preview.document?.films ?? []
  const valid = preview.document !== null && preview.errors.length === 0 && films.length > 0

  return (
    <section className={`import-preview ${valid ? 'valid' : 'invalid'}`}>
      <div className="import-preview-heading">
        <div><p className="card-kicker">{t("Aperçu avant écriture")}</p><h3>{t('Import {medium}', { medium: t('Films') })}</h3></div>
        <span>{valid ? t('Valide') : t('Import bloqué')}</span>
      </div>
      <dl className="transfer-summary compact films-import-summary">
        <div><dt>{t("Format")}</dt><dd>{t(PREVIEW_SOURCE_LABELS[preview.sourceKind])}</dd></div>
        <div><dt>{t("Lignes lues")}</dt><dd>{formatNumber(preview.totalFilmCount)}</dd></div>
        <div><dt>{t("Convertibles")}</dt><dd>{formatNumber(preview.validFilmCount)}</dd></div>
        <div><dt>{t("Erreurs")}</dt><dd>{formatNumber(preview.errors.length)}</dd></div>
      </dl>
      {preview.ignoredColumns.length > 0 && (
        <p className="films-import-details"><b>{t("Colonnes visibles mais ignorées :")}</b> {preview.ignoredColumns.join(', ')}{t('. Elles ne seront remplacées par aucune donnée inventée.')}</p>
      )}
      {preview.warnings.length > 0 && (
        <div className="films-import-warnings" role="status">
          <p>{t("Éléments non associés")}</p>
          <ul>{preview.warnings.map((warning, index) => <li key={`${warning.path}-${index}`}><code>{translateMessage(warning.path)}</code> {translateMessage(warning.message)}</li>)}</ul>
        </div>
      )}
      {!valid ? (
        <div className="validation-errors" role="alert">
          <p>{t("Aucune donnée n’a été écrite. Corriger les correspondances ou le fichier avant de réessayer.")}</p>
          {films.length === 0 && preview.errors.length === 0 && <p>{t("Ce fichier ne contient aucun film importable.")}</p>}
          {preview.errors.length > 0 && (
            <ol>{preview.errors.map((error, index) => <li key={`${error.path}-${index}`}><code>{translateMessage(error.path)}</code> {translateMessage(error.message)}</li>)}</ol>
          )}
        </div>
      ) : (
        <div className="import-confirmation">
          <p>{t(films.length === 1
            ? '{count} film est prêt à être comparé à la collection du profil courant. Aucune donnée n’a encore été écrite.'
            : '{count} films sont prêts à être comparés à la collection du profil courant. Aucune donnée n’a encore été écrite.', { count: formatNumber(films.length) })}</p>
        </div>
      )}
      <div className="assistant-actions">
        <button className="secondary-button" type="button" onClick={onBack}>{t("Modifier")}</button>
        <button className="primary-button" type="button" disabled={!valid} onClick={onContinue}>{t("Continuer")}</button>
      </div>
    </section>
  )
}
