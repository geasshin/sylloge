import { formatNumber, t, tc, translateMessage } from '../i18n/core.ts'
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
  const mediumLabel = { series: 'Séries', anime: 'Animation japonaise', books: 'Livres', mangas: 'Mangas', games: 'Jeux', artworks: 'Art' }[kind]
  const groups = collectionCsvFieldGroups(kind)

  /** « Début de visionnage » est aussi un critère de vue : ici, un champ importé. */
  const fieldLabel = (source: string) => (
    source === 'Début de visionnage' || source === 'Début de lecture' ? tc('import', source) : t(source)
  )

  return (
    <div className="assistant-content">
      <ol className="assistant-steps" aria-label={t("Étapes de l’import CSV")}>
        {['Colonnes', 'Aperçu'].map((label, index) => {
          const current = step === 'mapping' ? 1 : 2
          return <li className={index + 1 === current ? 'active' : index + 1 < current ? 'complete' : ''} key={label}>{t(label)}</li>
        })}
      </ol>
      <div className="assistant-toolbar">
        <button className="secondary-button" type="button" onClick={onChooseAnother}>{t("Choisir un autre fichier")}</button>
      </div>

      {step === 'mapping' && (
        <section className="assistant-stage">
          <h3>{t("Faire correspondre les colonnes")}</h3>
          {groups.map((group) => {
            const isSecondary = group.id === 'editorial'
            return (
              <details className="mapping-group" key={group.id} open={!isSecondary}>
                <summary>
                  <span className="mapping-group-label">{t(group.label)}</span>
                  <small>{t(group.summary)}</small>
                </summary>
                <div className="mapping-rows">
                  {group.fields.map((fieldDefinition) => {
                    const destination = mapping[fieldDefinition.key] ?? null
                    return (
                      <div className="mapping-row" key={fieldDefinition.key}>
                        <div className="mapping-field-name">
                          <b>{fieldLabel(fieldDefinition.label)}</b>
                          {fieldDefinition.key === 'title' && <small>{t("Obligatoire")}</small>}
                        </div>
                        <label className="visually-hidden" htmlFor={`mapping-${fieldDefinition.key}`}>
                          {t("Colonne du fichier pour {field}", { field: fieldLabel(fieldDefinition.label) })}
                        </label>
                        <select
                          id={`mapping-${fieldDefinition.key}`}
                          className="mapping-select"
                          value={destination ?? ''}
                          onChange={(event) => setMapping((current) => setCollectionCsvSourceDestination(
                            current,
                            fieldDefinition.key,
                            event.target.value || null,
                          ))}
                        >
                          <option value="">{t("Ne pas importer")}</option>
                          {session.table.headers.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </details>
            )
          })}
          <div className="assistant-actions">
            <button className="primary-button" type="button" onClick={() => setStep('preview')}>{t("Vérifier l’aperçu")}</button>
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
        <div><p className="card-kicker">{t("Aperçu avant écriture")}</p><h3>{t("Import {medium}", { medium: t(mediumLabel) })}</h3></div>
        <span>{valid ? t(itemCount === 1 ? '{count} fiche prête' : '{count} fiches prêtes', { count: formatNumber(itemCount) }) : t('Import bloqué')}</span>
      </div>
      <dl className="transfer-summary compact films-import-summary">
        <div><dt>{t("Format")}</dt><dd>{t(preview.sourceKind === 'sylloge-csv-v1' ? 'CSV Sylloge v1' : 'CSV avec correspondances')}</dd></div>
        <div><dt>{t("Lignes lues")}</dt><dd>{formatNumber(preview.totalItemCount)}</dd></div>
        <div><dt>{t("Fiches prêtes")}</dt><dd>{formatNumber(preview.validItemCount)}</dd></div>
        <div><dt>{t("Blocages")}</dt><dd>{formatNumber(blockingErrors.length)}</dd></div>
      </dl>
      {preview.ignoredColumns.length > 0 && <p className="films-import-details"><b>{t("Colonnes non importées :")}</b> {preview.ignoredColumns.join(', ')}{t('. Les métadonnées éditoriales restent récupérables via la recherche assistée.')}</p>}
      {infos.length > 0 && (
        <details className="import-warnings" open={blockingErrors.length === 0}>
          <summary>{t(infos.length === 1 ? '{count} champ laissé vide — valeur non reconnue dans le fichier' : '{count} champs laissés vides — valeur non reconnue dans le fichier', { count: formatNumber(infos.length) })}</summary>
          <ol>{infos.map((info, index) => <li key={`${info.path}-${index}`}><code>{info.path.replace('.info', '')}</code> {translateMessage(info.message)}</li>)}</ol>
          <p>{t("Ces fiches seront importées sans ces champs, qui restent modifiables dans leur fiche.")}</p>
        </details>
      )}
      {valid && (
        <p className="import-contextual-hint">{t("L’étape suivante permet de comparer les doublons ou de remplacer cette bibliothèque. Une confirmation finale précède toute écriture.")}</p>
      )}
      {!valid ? (
        <div className="validation-errors" role="alert">
          <p>{t("Aucune donnée n’a été écrite. Corriger les correspondances ou le fichier avant de réessayer.")}</p>
          {preview.items === null && blockingErrors.length === 0 && <p>{t("Ce fichier ne contient aucune fiche importable.")}</p>}
          {blockingErrors.length > 0 && <ol>{blockingErrors.map((error, index) => <li key={`${error.path}-${index}`}><code>{error.path}</code> {translateMessage(error.message)}</li>)}</ol>}
        </div>
      ) : <div className="import-confirmation"><p>{t(itemCount === 1 ? '{count} fiche est prête à être comparée à la collection du profil courant. Aucune donnée n’a encore été écrite.' : '{count} fiches sont prêtes à être comparées à la collection du profil courant. Aucune donnée n’a encore été écrite.', { count: formatNumber(itemCount) })}</p></div>}
      <div className="assistant-actions">
        {preview.sourceKind !== 'sylloge-csv-v1' && <button className="secondary-button" type="button" onClick={onBack}>{t("Modifier")}</button>}
        <button className="primary-button" type="button" disabled={!valid} onClick={onContinue}>{t("Continuer")}</button>
      </div>
    </section>
  )
}
