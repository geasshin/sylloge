import { useState } from 'react'
import { IMPORT_GUIDES } from '../domain/importGuides.ts'

const SOURCE_FORMAT_LABELS: Record<string, string> = {
  letterboxd: 'CSV ou ZIP', goodreads: 'CSV', notion: 'CSV ou ZIP',
  myanimelist: 'XML · non pris en charge', betaseries: 'CSV à vérifier', 'tv-time': 'Ancienne archive à vérifier',
}

type Library = 'films' | 'series' | 'anime' | 'books' | 'mangas' | 'games' | 'artworks'

type Props = {
  library: Library
  busy: boolean
  onPick: () => void
}

/** Le service aide à obtenir le fichier ; il ne force jamais sa reconnaissance. */
export function ImportSourceChooser({ library, busy, onPick }: Props) {
  const [source, setSource] = useState('sylloge')
  const guides = IMPORT_GUIDES.filter(guide => guide.libraries.includes(library))
  const guide = guides.find(item => item.id === source)
  return (
    <section className="import-source-chooser" aria-labelledby="import-source-title">
      <h3 id="import-source-title">D’où vient le fichier ?</h3>
      <p>Un guide pour obtenir l’export, puis une vérification locale avant import.</p>
      <div className="import-source-layout">
        <div className="import-source-list" role="group" aria-label="Origine du fichier">
          <button type="button" className="import-source-option" aria-pressed={source === 'sylloge'} onClick={() => setSource('sylloge')}>Sylloge <small>JSON ou CSV</small></button>
          {guides.map(item => <button key={item.id} type="button" className="import-source-option" aria-pressed={source === item.id} onClick={() => setSource(item.id)}>{item.name}<small>{SOURCE_FORMAT_LABELS[item.id] ?? item.format}</small></button>)}
          <button type="button" className="import-source-option" aria-pressed={source === 'other'} onClick={() => setSource('other')}>Autre fichier<small>CSV ou archive ZIP</small></button>
        </div>
        <div className="import-source-guide" aria-live="polite">
          {guide ? <>
            <h4>Depuis {guide.name}</h4>
            <a className="secondary-button" href={guide.exportUrl} target="_blank" rel="noreferrer">Ouvrir le site de {guide.name} ↗</a>
            <ol className="import-guide-steps">{guide.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
            <p><b>Données reprises.</b> {guide.preserved}</p>
            <details className="import-guide-limits"><summary>Limites et données non reprises</summary><p>{guide.limitations}</p></details>
            <p className="import-guide-reference"><a href={guide.sourceUrl} target="_blank" rel="noreferrer">Aide du service ↗</a> · {guide.verification === 'official' ? 'Documentation consultée' : 'Vérification partielle'} le {guide.verifiedAt}</p>
          </> : source === 'sylloge' ? <>
            <h4>Retrouver une collection Sylloge</h4>
            <ol className="import-guide-steps">
              <li>Dans l’installation d’origine, ouvrir « Exporter » dans la bibliothèque souhaitée.</li>
              <li>Choisir JSON Sylloge pour conserver une copie réimportable. Le CSV Sylloge est également reconnu.</li>
              <li>Sélectionner le fichier ici, relire l’aperçu puis choisir Fusionner ou Remplacer.</li>
            </ol>
            <p>Un export de tout le profil est accepté : seule la section correspondant à la bibliothèque ouverte sera importée ici.</p>
          </> : <>
            <h4>Depuis un tableur ou un autre service</h4>
            <ol className="import-guide-steps">
              <li>Exporter les données au format CSV UTF-8. Une première ligne doit donner le nom des colonnes ; le titre est indispensable.</li>
              <li>Conserver le fichier original. Pour Notion, choisir « Markdown et CSV » et joindre l’archive ZIP.</li>
              <li>Vérifier chaque correspondance de colonne, l’échelle des notes et l’aperçu. Un champ non reconnu reste signalé, jamais deviné en silence.</li>
            </ol>
            <p className="import-contextual-hint">Un PDF, une capture d’écran ou un fichier Excel .xlsx ne constitue pas un tableau importable. Depuis Excel, enregistrer une copie en CSV UTF-8.</p>
          </>}
        </div>
      </div>
      <footer className="import-source-footer">
        <p>Le fichier est déjà disponible ? Passer directement à son analyse. Aucun identifiant de service n’est demandé par Sylloge.</p>
        <button className="primary-button" type="button" disabled={busy} onClick={onPick}>{busy ? 'Lecture du fichier…' : 'Choisir un fichier'}</button>
      </footer>
    </section>
  )
}
