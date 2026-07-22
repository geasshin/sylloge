import { useMemo, useState } from 'react'
import type { Artwork } from '../domain/artwork.ts'
import type { Book } from '../domain/book.ts'
import {
  collectionCsvDestinationForSource,
  collectionCsvFields,
  prepareCollectionCsvImport,
  previewCollectionCsvImport,
  setCollectionCsvSourceDestination,
  type CollectionCsvImportKind,
  type CollectionCsvItem,
  type CollectionCsvMapping,
  type CollectionCsvImportPreview,
} from '../domain/collectionCsvImport.ts'
import type { Game } from '../domain/game.ts'
import type { Series } from '../domain/series.ts'

type CollectionCsvImportFlowProps = {
  kind: CollectionCsvImportKind
  contents: string
  onReady: (items: Artwork[] | Book[] | Game[] | Series[]) => void
  onChooseAnother: () => void
}

export function CollectionCsvImportFlow({ kind, contents, onReady, onChooseAnother }: CollectionCsvImportFlowProps) {
  const session = useMemo(() => prepareCollectionCsvImport(kind, contents), [kind, contents])
  const [mapping, setMapping] = useState<CollectionCsvMapping>(session.initialMapping)
  const [step, setStep] = useState<'mapping' | 'preview'>(session.sourceKind === 'sylloge-csv-v1' ? 'preview' : 'mapping')
  const preview = previewCollectionCsvImport(session, mapping)
  const mediumLabel = { series: 'Séries', books: 'Livres', games: 'Jeux', artworks: 'Art' }[kind]

  return (
    <div className="assistant-content">
      <ol className="assistant-steps" aria-label="Étapes de l’import CSV">
        {['Mapping', 'Aperçu'].map((label, index) => {
          const current = step === 'mapping' ? 1 : 2
          return <li className={index + 1 === current ? 'active' : index + 1 < current ? 'complete' : ''} key={label}>{label}</li>
        })}
      </ol>
      <div className="assistant-toolbar">
        <button className="secondary-button" type="button" onClick={onChooseAnother}>Choisir un autre fichier</button>
      </div>

      {step === 'mapping' && (
        <section className="assistant-stage">
          <p className="card-kicker">Mapping</p>
          <h3>Choisir où importer chaque colonne</h3>
          <p className="films-import-details">Les colonnes non mappées restent visibles dans l’aperçu, mais ne créent aucune donnée inventée.</p>
          <div className="source-destination-mapping" aria-label="Mapping source vers Sylloge">
            <div className="source-destination-header" aria-hidden="true"><span>Détecté dans votre fichier</span><span>→</span><span>Importer dans Sylloge</span></div>
            {session.table.headers.map((header) => {
              const destination = collectionCsvDestinationForSource(mapping, header)
              return (
                <div className="source-destination-row" key={header}>
                  <div><b>{header}</b><small>Colonne du tableau sélectionné</small></div>
                  <span className="mapping-arrow" aria-hidden="true">→</span>
                  <label>
                    <span className="visually-hidden">Destination Sylloge de {header}</span>
                    <select
                      value={destination ?? ''}
                      onChange={(event) => setMapping((current) => setCollectionCsvSourceDestination(
                        current,
                        header,
                        event.target.value || null,
                      ))}
                    >
                      <option value="">Ne pas importer</option>
                      {collectionCsvFields(kind).map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                    </select>
                  </label>
                </div>
              )
            })}
          </div>
          <div className="assistant-actions">
            <button className="primary-button" type="button" onClick={() => setStep('preview')}>Vérifier l’aperçu</button>
          </div>
        </section>
      )}

      {step === 'preview' && (
        <CollectionCsvPreviewPanel
          mediumLabel={mediumLabel}
          preview={preview}
          onBack={() => setStep(session.sourceKind === 'sylloge-csv-v1' ? 'preview' : 'mapping')}
          onContinue={() => {
            if (preview.items !== null && preview.errors.length === 0 && preview.items.length > 0) onReady(preview.items as Artwork[] | Book[] | Game[] | Series[])
          }}
        />
      )}
    </div>
  )
}

function CollectionCsvPreviewPanel({
  mediumLabel,
  preview,
  onBack,
  onContinue,
}: {
  mediumLabel: string
  preview: CollectionCsvImportPreview
  onBack: () => void
  onContinue: () => void
}) {
  const valid = preview.items !== null && preview.errors.length === 0 && preview.items.length > 0
  const itemCount = preview.items?.length ?? 0
  return (
    <section className={`import-preview ${valid ? 'valid' : 'invalid'}`}>
      <div className="import-preview-heading">
        <div><p className="card-kicker">Aperçu avant écriture</p><h3>Import {mediumLabel}</h3></div>
        <span>{valid ? 'Valide' : 'Import bloqué'}</span>
      </div>
      <dl className="transfer-summary compact films-import-summary">
        <div><dt>Format</dt><dd>{preview.sourceKind === 'sylloge-csv-v1' ? 'CSV Sylloge v1' : 'CSV avec mapping'}</dd></div>
        <div><dt>Lignes lues</dt><dd>{preview.totalItemCount}</dd></div>
        <div><dt>Convertibles</dt><dd>{preview.validItemCount}</dd></div>
        <div><dt>Erreurs</dt><dd>{preview.errors.length}</dd></div>
      </dl>
      {preview.ignoredColumns.length > 0 && <p className="films-import-details"><b>Colonnes ignorées :</b> {preview.ignoredColumns.join(', ')}.</p>}
      {!valid ? (
        <div className="validation-errors" role="alert">
          <p>Aucune donnée n’a été écrite. Corrige le mapping ou le fichier avant de réessayer.</p>
          {preview.items?.length === 0 && preview.errors.length === 0 && <p>Ce fichier ne contient aucune fiche importable.</p>}
          {preview.errors.length > 0 && <ol>{preview.errors.map((error, index) => <li key={`${error.path}-${index}`}><code>{error.path}</code> {error.message}</li>)}</ol>}
        </div>
      ) : <div className="import-confirmation"><p>{itemCount} fiche{itemCount > 1 ? 's sont prêtes' : ' est prête'} à être comparée{itemCount > 1 ? 's' : ''} à la collection du profil courant. Aucune donnée n’a encore été écrite.</p></div>}
      <div className="assistant-actions">
        {preview.sourceKind !== 'sylloge-csv-v1' && <button className="secondary-button" type="button" onClick={onBack}>Modifier</button>}
        <button className="primary-button" type="button" disabled={!valid} onClick={onContinue}>Continuer vers Remplacer ou Fusionner</button>
      </div>
    </section>
  )
}
