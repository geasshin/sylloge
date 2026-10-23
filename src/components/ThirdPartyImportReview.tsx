import type { ThirdPartyImportPreview } from '../domain/thirdPartyImport.ts'
import { formatNumber, t, translateMessage } from '../i18n/core.ts'

/** French field names; each is translated at render, never stored. */
const FIELD_LABELS: Record<string, string> = {
  title: 'Titre', author: 'Auteur', year: 'Année', status: 'Statut', rating: 'Note sur 5',
  personalNote: 'Avis personnel', watchedAt: 'Date de visionnage',
}

type Props = {
  preview: ThirdPartyImportPreview
  fileName: string | null
  needsListChoice: boolean
  onListChoice: (list: 'watched' | 'watchlist') => void
  onContinue: () => void
  onChooseAnother: () => void
}

export function ThirdPartyImportReview({ preview, fileName, needsListChoice, onListChoice, onContinue, onChooseAnother }: Props) {
  const service = preview.service === 'letterboxd' ? 'Letterboxd' : 'Goodreads'
  const ready = preview.items !== null && preview.errors.length === 0
  return (
    <div className="assistant-content third-party-review">
      <h3>{t('{service} reconnu', { service })}</h3>
      <dl className="assistant-source-summary">
        <div><dt>{t("Fichier")}</dt><dd>{fileName}</dd></div>
        <div><dt>{t("Bibliothèque prévue")}</dt><dd>{t(preview.library === 'films' ? 'Films' : 'Livres')}</dd></div>
        <div><dt>{t("Fiches préparées")}</dt><dd>{t('{valid} sur {total}', { valid: formatNumber(preview.validItemCount), total: formatNumber(preview.totalItemCount) })}</dd></div>
        {preview.sourceRowCount !== undefined && <div><dt>{t("Lignes regroupées")}</dt><dd>{t('{rows} lignes dans {files} fichiers', { rows: formatNumber(preview.sourceRowCount), files: formatNumber(preview.sourceFiles?.length ?? 0) })}</dd></div>}
      </dl>
      {needsListChoice && <fieldset className="transfer-scope" aria-label={t("Type de liste Letterboxd")}>
        <legend>{t("Ce fichier a été renommé : de quelle liste s’agit-il ?")}</legend>
        <label><input type="radio" name="letterboxd-list" checked={preview.variant === 'watched'} onChange={() => onListChoice('watched')} />{t("Films vus")}</label>
        <label><input type="radio" name="letterboxd-list" checked={preview.variant === 'watchlist'} onChange={() => onListChoice('watchlist')} />{t("Liste à voir")}</label>
      </fieldset>}
      {preview.errors.length > 0 && <div className="inline-report error" role="alert">
        <b>{t("Import bloqué. Aucune donnée n’a été écrite.")}</b>
        <ul>{preview.errors.map((error, index) => <li key={index}>{translateMessage(error.path)} — {translateMessage(error.message)}</li>)}</ul>
      </div>}
      {preview.mapping.length > 0 && <details className="import-guide-limits">
        <summary>{t('Correspondance des colonnes · {count}', { count: formatNumber(preview.mapping.length) })}</summary>
        <dl className="assistant-source-summary">{preview.mapping.map((mapping, index) => <div key={index}><dt>{mapping.column}</dt><dd>{FIELD_LABELS[mapping.field] ? t(FIELD_LABELS[mapping.field]) : mapping.field}</dd></div>)}</dl>
      </details>}
      <p><b>{t("Colonnes non importées :")}</b> {preview.ignoredColumns.length > 0 ? preview.ignoredColumns.join(', ') : t('aucune dans les tables reconnues.')}</p>
      {preview.warnings.length > 0 && <details className="import-guide-limits" open>
        <summary>{t('Points à vérifier · {count}', { count: formatNumber(preview.warnings.length) })}</summary>
        <ul>{preview.warnings.map((warning, index) => <li key={index}>{translateMessage(warning.path)} — {translateMessage(warning.message)}</li>)}</ul>
      </details>}
      {ready && <>
        <h4>{t("Extrait des fiches préparées")}</h4>
        <ul className="third-party-sample">{preview.items!.slice(0, 5).map((item, index) => <li key={index}>
          <b>{item.title}</b><span>{t(item.status)} · {item.rating === null ? t('sans note') : `${formatNumber(item.rating)}/5`}</span>
          {item.personalNote && <p>{item.personalNote}</p>}
        </li>)}</ul>
        {preview.items!.length > 5 && <p>{t('Extrait limité aux cinq premières fiches sur {count}.', { count: formatNumber(preview.items!.length) })}</p>}
      </>}
      <p className="import-contextual-hint">{t("Le fichier original reste inchangé. La fusion et le remplacement se choisissent à l’étape suivante, avant une confirmation finale.")}</p>
      <div className="assistant-actions">
        <button className="secondary-button" type="button" onClick={onChooseAnother}>{t("Choisir un autre fichier")}</button>
        <button className="primary-button" type="button" disabled={!ready} onClick={onContinue}>{t("Continuer")}</button>
      </div>
    </div>
  )
}
