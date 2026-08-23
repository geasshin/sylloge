import { useMemo, useState } from 'react'
import type { Artwork } from '../domain/artwork.ts'
import type { Book } from '../domain/book.ts'
import {
  collectionCsvFieldGroups,
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
  onReady: (items: Artwork[] | Book[] | Game[] | Series[], warnings: Array<{ path: string; message: string }>) => void
  onChooseAnother: () => void
}

export function CollectionCsvImportFlow({ kind, contents, onReady, onChooseAnother }: CollectionCsvImportFlowProps) {
  const session = useMemo(() => prepareCollectionCsvImport(kind, contents), [kind, contents])
  const [mapping, setMapping] = useState<CollectionCsvMapping>(session.initialMapping)
  const [step, setStep] = useState<'mapping' | 'preview'>(session.sourceKind === 'sylloge-csv-v1' ? 'preview' : 'mapping')
  const preview = previewCollectionCsvImport(session, mapping)
  const mediumLabel = { series: 'Séries', books: 'Livres', games: 'Jeux', artworks: 'Art' }[kind]
  const groups = collectionCsvFieldGroups(kind)
  const mappedColumns = new Set(Object.values(mapping).filter((column): column is string => column !== null))
  const unmappedColumns = session.table.headers.filter((header) => !mappedColumns.has(header))

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
          <h3>Choisir la colonne de ton fichier pour chaque champ Sylloge</h3>
          <p className="films-import-details">
            Pour chaque champ ci-dessous, sélectionne la colonne de ton fichier qui doit le remplir.
            Laisse « Ne pas importer » quand rien ne correspond — c’est le réglage par défaut.
          </p>
          <p className="import-contextual-hint">
            <span aria-hidden="true">💡</span>
            Sylloge pré-sélectionne déjà les colonnes qu’il reconnaît (titre, statut, note…).
            Vérifie simplement les lignes marquées, puis continue.
          </p>
          {groups.map((group) => (
            <fieldset className="mapping-group" key={group.id}>
              <legend>{group.label}</legend>
              <p className="mapping-group-description">{group.description}</p>
              <div className="mapping-rows">
                {group.fields.map((fieldDefinition) => {
                  const destination = mapping[fieldDefinition.key] ?? null
                  return (
                    <div className="mapping-row" key={fieldDefinition.key}>
                      <div className="mapping-field-name">
                        <b>{fieldDefinition.label}</b>
                        {fieldDefinition.key === 'title' && <small>Obligatoire</small>}
                      </div>
                      <label className="visually-hidden" htmlFor={`mapping-${fieldDefinition.key}`}>
                        Colonne du fichier pour {fieldDefinition.label}
                      </label>
                      <select
                        id={`mapping-${fieldDefinition.key}`}
                        className="mapping-select"
                        value={destination ?? ''}
                        onChange={(event) => setMapping((current) => setCollectionCsvSourceDestination(
                          current,
                          event.target.value === '' ? destination ?? '' : event.target.value,
                          event.target.value || null,
                        ))}
                      >
                        <option value="">Ne pas importer</option>
                        {session.table.headers.map((header) => (
                          <option
                            key={header}
                            value={header}
                            disabled={mappedColumns.has(header) && header !== destination}
                          >
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </fieldset>
          ))}
          {unmappedColumns.length > 0 && (
            <details className="unmapped-columns">
              <summary>{unmappedColumns.length} colonne{unmappedColumns.length > 1 ? 's' : ''} de ton fichier ne sera{unmappedColumns.length > 1 ? 'ont' : ''} pas importée{unmappedColumns.length > 1 ? 's' : ''}</summary>
              <p>
                {unmappedColumns.join(' · ')}. Ce n’est pas perdu : les métadonnées éditoriales
                (résumés, affiches, casting…) peuvent être complétées plus tard dans Sylloge via la recherche assistée.
              </p>
            </details>
          )}
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
            if (preview.items !== null && preview.items.length > 0) {
              onReady(preview.items as Artwork[] | Book[] | Game[] | Series[], preview.errors)
            }
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
  const blockingErrors = preview.errors.filter((error) => !error.path.endsWith('.info'))
  const infos = preview.errors.filter((error) => error.path.endsWith('.info'))
  const valid = preview.items !== null && preview.items.length > 0 && blockingErrors.length === 0
  const itemCount = preview.items?.length ?? 0
  return (
    <section className={`import-preview ${valid ? 'valid' : 'invalid'}`}>
      <div className="import-preview-heading">
        <div><p className="card-kicker">Aperçu avant écriture</p><h3>Import {mediumLabel}</h3></div>
        <span>{valid ? `${itemCount} fiche${itemCount > 1 ? 's prêtes' : ' prête'}` : 'Import bloqué'}</span>
      </div>
      <dl className="transfer-summary compact films-import-summary">
        <div><dt>Format</dt><dd>{preview.sourceKind === 'sylloge-csv-v1' ? 'CSV Sylloge v1' : 'CSV avec mapping'}</dd></div>
        <div><dt>Lignes lues</dt><dd>{preview.totalItemCount}</dd></div>
        <div><dt>Fiches prêtes</dt><dd>{preview.validItemCount}</dd></div>
        <div><dt>Blocages</dt><dd>{blockingErrors.length}</dd></div>
      </dl>
      {preview.ignoredColumns.length > 0 && <p className="films-import-details"><b>Colonnes non importées :</b> {preview.ignoredColumns.join(', ')}. Les métadonnées éditoriales restent récupérables via la recherche assistée.</p>}
      {infos.length > 0 && (
        <details className="import-warnings" open={blockingErrors.length === 0}>
          <summary>{infos.length} champ{infos.length > 1 ? 's' : ''} laissé{infos.length > 1 ? 's' : ''} vide{infos.length > 1 ? 's' : ''} — valeur non reconnue dans ton fichier</summary>
          <ol>{infos.map((info, index) => <li key={`${info.path}-${index}`}><code>{info.path.replace('.info', '')}</code> {info.message}</li>)}</ol>
          <p>Ces fiches sont importées sans ces champs. Tu pourras les compléter plus tard, fiche par fiche.</p>
        </details>
      )}
      {valid && (
        <p className="import-contextual-hint">
          <span aria-hidden="true">💡</span>
          L’étape suivante te propose Remplacer ou Fusionner. Rien n’est encore écrit : tu pourras relire le résumé complet après l’import.
        </p>
      )}
      {!valid ? (
        <div className="validation-errors" role="alert">
          <p>Aucune donnée n’a été écrite. Corrige le mapping ou le fichier avant de réessayer.</p>
          {preview.items === null && blockingErrors.length === 0 && <p>Ce fichier ne contient aucune fiche importable.</p>}
          {blockingErrors.length > 0 && <ol>{blockingErrors.map((error, index) => <li key={`${error.path}-${index}`}><code>{error.path}</code> {error.message}</li>)}</ol>}
        </div>
      ) : <div className="import-confirmation"><p>{itemCount} fiche{itemCount > 1 ? 's sont prêtes' : ' est prête'} à être comparée{itemCount > 1 ? 's' : ''} à la collection du profil courant. Aucune donnée n’a encore été écrite.</p></div>}
      <div className="assistant-actions">
        {preview.sourceKind !== 'sylloge-csv-v1' && <button className="secondary-button" type="button" onClick={onBack}>Modifier</button>}
        <button className="primary-button" type="button" disabled={!valid} onClick={onContinue}>Continuer vers Remplacer ou Fusionner</button>
      </div>
    </section>
  )
}
