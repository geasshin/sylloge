import { useMemo, useState } from 'react'
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
      <ol className="assistant-steps" aria-label="Étapes de l’import CSV ou ZIP">
        {['Source', 'Mapping', 'Aperçu'].map((label, index) => {
          const current = step === 'source' ? 1 : step === 'mapping' ? 2 : 3
          return <li className={index + 1 === current ? 'active' : index + 1 < current ? 'complete' : ''} key={label}>{label}</li>
        })}
      </ol>
      <div className="assistant-toolbar">
        <button className="secondary-button" type="button" onClick={onChooseAnother}>Choisir un autre fichier</button>
      </div>

      {step === 'source' && (
        <section className="assistant-stage">
          <p className="card-kicker">Source détectée</p>
          <h3>{source.kind === 'notion' ? 'Archive ZIP compatible' : source.kind === 'container' ? 'Conteneur local' : 'Fichier CSV'}</h3>
          <dl className="assistant-source-summary">
            <div><dt>Fichier</dt><dd>{source.name}</dd></div>
            <div>
              <dt>Table</dt>
              <dd>{selectedCandidateId
                ? sourceSelection.candidates.find((candidate) => candidate.id === selectedCandidateId)?.label ?? 'À choisir'
                : 'À choisir'}</dd>
            </div>
          </dl>
          {sourceSelection.selectionRequired && (
            <label className="films-import-profile-name">
              <span>Table à importer</span>
              <select value={selectedCandidateId ?? ''} onChange={(event) => selectCandidate(event.target.value || null)}>
                <option value="">Choisir une table</option>
                {sourceSelection.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
              </select>
            </label>
          )}
          <p className="films-import-details">
            {sourceSelection.automaticSelectionMessage
              ?? (sourceSelection.selectionRequired
                ? 'Cette archive contient plusieurs tables. Choisissez celle à prévisualiser avant de continuer.'
                : 'La table disponible est retenue pour préparer l’import dans le profil courant.')}
          </p>
          <div className="assistant-actions">
            <button className="primary-button" type="button" disabled={prepared === null} onClick={() => setStep(nextStep)}>
              {prepared?.session.kind === 'generic' ? 'Régler le mapping' : 'Voir l’aperçu'}
            </button>
          </div>
        </section>
      )}

      {step === 'mapping' && prepared?.session.kind === 'generic' && prepared.configuration !== null && (
        <section className="assistant-stage">
          <p className="card-kicker">Mapping</p>
          <h3>Choisir où importer chaque colonne</h3>
          <p className="films-import-details">Seules vos données de suivi sont importées. Les métadonnées du film restent exclues et pourront être complétées plus tard.</p>
          <SourceToDestinationMapping
            configuration={prepared.configuration}
            session={prepared.session}
            source={source}
            preview={prepared.preview}
            onConfigurationChange={updateConfiguration}
          />
          <div className="assistant-actions">
            <button className="secondary-button" type="button" onClick={() => setStep('source')}>Retour à la source</button>
            <button className="primary-button" type="button" onClick={() => setStep('preview')}>Vérifier l’aperçu</button>
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
      detail: restriction === 'metadata'
        ? 'Métadonnée récupérée plus tard, non importée'
        : restriction === 'future-feature'
          ? 'Fonctionnalité future, non importée'
          : 'Colonne du tableau sélectionné',
    }
  })
  if (source.kind === 'notion' && source.markdownPages.length > 0) {
    sources.push({
      source: NOTION_MARKDOWN_NOTES_SOURCE,
      label: 'Pages de notes associées',
      detail: 'Contenu texte associé, distinct d’une évaluation chiffrée',
    })
  }

  const detectedScaleLabel = {
    none: 'Aucune évaluation détectée',
    ambiguous: 'Échelle ambiguë',
    mixed: 'Échelles mélangées',
    5: '/5 détectée',
    10: '/10 détectée',
  }[preview.detectedRatingScale]

  return (
    <div className="source-destination-mapping" aria-label="Mapping source vers Sylloge">
      <div className="source-destination-header" aria-hidden="true"><span>Détecté dans votre fichier</span><span>→</span><span>Importer dans Sylloge</span></div>
      {sources.map(({ source: sourceValue, label, detail }) => {
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
            <label>
              <span className="visually-hidden">Destination Sylloge de {label}</span>
              <select
                value={fixedNotImported ? '' : destination ?? ''}
                disabled={fixedNotImported}
                onChange={(event) => onConfigurationChange((current) => setFilmImportSourceDestination(
                  current,
                  sourceValue,
                  event.target.value === '' ? null : event.target.value as ImportableFilmField,
                ))}
              >
                <option value="">Ne pas importer</option>
                {availableDestinations.map((field) => <option key={field} value={field}>{FILM_IMPORT_FIELD_LABELS[field]}</option>)}
              </select>
            </label>
          </div>
        )
      })}
      {configuration.mapping.rating && preview.detectedRatingScale !== 'none' && (
        <label className="films-import-rating-scale">
          <span>Évaluation : {detectedScaleLabel}</span>
          <select
            value={configuration.ratingScale ?? ''}
            onChange={(event) => onConfigurationChange((current) => ({
              ...current,
              ratingScale: event.target.value === '5' || event.target.value === '10'
                ? Number(event.target.value) as 5 | 10
                : null,
            }))}
          >
            <option value="">Choisir l’échelle</option>
            <option value="5">/5</option>
            <option value="10">/10</option>
          </select>
        </label>
      )}
      {preview.detectedRatingScale === 10 && (
        <p className="films-import-details"><b>Conversion proposée :</b> les évaluations /10 seront normalisées vers l’échelle Sylloge /5 par demi-points.</p>
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
        <div><p className="card-kicker">Aperçu avant écriture</p><h3>Import Films</h3></div>
        <span>{valid ? 'Valide' : 'Import bloqué'}</span>
      </div>
      <dl className="transfer-summary compact films-import-summary">
        <div><dt>Format</dt><dd>{preview.sourceKind === 'notion' ? 'Archive ZIP compatible' : preview.sourceKind === 'container' ? 'Conteneur local' : preview.sourceKind === 'csv' ? 'Bibliothèque Films CSV' : 'Bibliothèque Films Sylloge CSV'}</dd></div>
        <div><dt>Lignes lues</dt><dd>{preview.totalFilmCount}</dd></div>
        <div><dt>Convertibles</dt><dd>{preview.validFilmCount}</dd></div>
        <div><dt>Erreurs</dt><dd>{preview.errors.length}</dd></div>
      </dl>
      {preview.ignoredColumns.length > 0 && (
        <p className="films-import-details"><b>Colonnes visibles mais ignorées :</b> {preview.ignoredColumns.join(', ')}. Elles ne seront remplacées par aucune donnée inventée.</p>
      )}
      {preview.warnings.length > 0 && (
        <div className="films-import-warnings" role="status">
          <p>Éléments non associés</p>
          <ul>{preview.warnings.map((warning, index) => <li key={`${warning.path}-${index}`}><code>{warning.path}</code> {warning.message}</li>)}</ul>
        </div>
      )}
      {!valid ? (
        <div className="validation-errors" role="alert">
          <p>Aucune donnée n’a été écrite. Corrigez le mapping ou le fichier avant de réessayer.</p>
          {films.length === 0 && preview.errors.length === 0 && <p>Ce fichier ne contient aucun film importable.</p>}
          {preview.errors.length > 0 && (
            <ol>{preview.errors.map((error, index) => <li key={`${error.path}-${index}`}><code>{error.path}</code> {error.message}</li>)}</ol>
          )}
        </div>
      ) : (
        <div className="import-confirmation">
          <p>{films.length} {films.length === 1 ? 'film est prêt' : 'films sont prêts'} à être comparé{films.length === 1 ? '' : 's'} à la collection du profil courant. Aucune donnée n’a encore été écrite.</p>
        </div>
      )}
      <div className="assistant-actions">
        <button className="secondary-button" type="button" onClick={onBack}>Modifier</button>
        <button className="primary-button" type="button" disabled={!valid} onClick={onContinue}>Continuer vers Remplacer ou Fusionner</button>
      </div>
    </section>
  )
}
