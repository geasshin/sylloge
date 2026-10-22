import { useEffect, useState } from 'react'
import type { FilmLibrary } from '../../data/filmsRepository.ts'
import { libraryRepository, type CulturalLibrary } from '../../data/libraryRepository.ts'
import { LibraryExportFlow } from '../LibraryExportFlow.tsx'
import { LibraryImportButton } from '../LibraryImportButton.tsx'
import { SettingsGroup, SettingsRow } from './SettingsLayout.tsx'

type Props = {
  library: FilmLibrary
  onLibraryChanged: () => void
  onOpenBackups?: () => void
}

const fiches = (count: number) => `${count} ${count === 1 ? 'fiche' : 'fiches'}`

export function TransferSettings({ library, onLibraryChanged, onOpenBackups }: Props) {
  const [full, setFull] = useState<CulturalLibrary | null>(null)
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    libraryRepository.loadLibrary(library.profile.id).then(
      (loaded) => { if (!cancelled) setFull(loaded) },
      (error: unknown) => {
        console.error('Impossible de lire les bibliothèques pour les transferts.', error)
        if (!cancelled) { setFull(null); setFailed(true) }
      },
    )
    return () => { cancelled = true }
  }, [library.profile.id, revision])

  const changed = () => {
    setRevision((value) => value + 1)
    onLibraryChanged()
  }

  return (
    <>
      <SettingsGroup
        id="transfer-title"
        title="Par bibliothèque"
        description="Importer depuis Letterboxd, Goodreads, Notion, un tableur ou un JSON Sylloge ; exporter en JSON ou CSV. Chaque import montre un aperçu et demande une confirmation."
      >
        {failed ? (
          <SettingsRow label="Bibliothèques illisibles" detail="Les bibliothèques n’ont pas pu être lues. Revenir plus tard sur cette page." tone="danger" />
        ) : full === null ? (
          <SettingsRow label="Lecture des bibliothèques…" />
        ) : (
          <>
            <SettingsRow label="Films" detail={`${fiches(full.films.length)} · Letterboxd, Notion, tableur, JSON`}>
              <LibraryImportButton kind="films" buttonLabel="Importer" mediumLabel="film" profileId={full.profile.id} profileName={full.profile.name} existing={full.films} onDone={changed} />
              <LibraryExportFlow kind="films" profileId={full.profile.id} />
            </SettingsRow>
            <SettingsRow label="Séries" detail={`${fiches(full.series.length)} · Notion, tableur, JSON`}>
              <LibraryImportButton kind="series" buttonLabel="Importer" mediumLabel="série" profileId={full.profile.id} profileName={full.profile.name} existing={full.series} onDone={changed} />
              <LibraryExportFlow kind="series" profileId={full.profile.id} />
            </SettingsRow>
            <SettingsRow label="Animation japonaise" detail={`${fiches(full.anime.length)} · Notion, tableur, JSON`}>
              <LibraryImportButton kind="series" seriesLibrary="anime" buttonLabel="Importer" mediumLabel="animation japonaise" profileId={full.profile.id} profileName={full.profile.name} existing={full.anime} onDone={changed} />
              <LibraryExportFlow kind="anime" profileId={full.profile.id} />
            </SettingsRow>
            <SettingsRow label="Livres" detail={`${fiches(full.books.length)} · Goodreads, Notion, tableur, JSON · citations comprises`}>
              <LibraryImportButton kind="books" buttonLabel="Importer" mediumLabel="livre" profileId={full.profile.id} profileName={full.profile.name} existing={full.books} onDone={changed} />
              <LibraryExportFlow kind="books" profileId={full.profile.id} />
            </SettingsRow>
            <SettingsRow label="Mangas" detail={`${fiches(full.mangas.length)} · Notion, tableur, JSON · citations comprises`}>
              <LibraryImportButton kind="books" bookLibrary="mangas" buttonLabel="Importer" mediumLabel="manga" profileId={full.profile.id} profileName={full.profile.name} existing={full.mangas} onDone={changed} />
              <LibraryExportFlow kind="mangas" profileId={full.profile.id} />
            </SettingsRow>
            <SettingsRow label="Jeux" detail={`${fiches(full.games.length)} · Notion, tableur, JSON`}>
              <LibraryImportButton kind="games" buttonLabel="Importer" mediumLabel="jeu" profileId={full.profile.id} profileName={full.profile.name} existing={full.games} onDone={changed} />
              <LibraryExportFlow kind="games" profileId={full.profile.id} />
            </SettingsRow>
            <SettingsRow label="Art" detail={`${fiches(full.artworks.length)} · Notion, tableur, JSON · sans note chiffrée`}>
              <LibraryImportButton kind="artworks" buttonLabel="Importer" mediumLabel="œuvre" profileId={full.profile.id} profileName={full.profile.name} existing={full.artworks} onDone={changed} />
              <LibraryExportFlow kind="artworks" profileId={full.profile.id} />
            </SettingsRow>
          </>
        )}
      </SettingsGroup>

      <SettingsGroup id="transfer-profile-title" title="Tout le profil" description="Pour sauvegarder, restaurer ou changer d’ordinateur, un seul fichier JSON réunit toutes les bibliothèques du profil.">
        <SettingsRow label="Sauvegarde et restauration" detail="Sauvegarde automatique, copies du profil, restauration et export d’une copie.">
          {onOpenBackups && <button className="secondary-button" type="button" onClick={onOpenBackups}>Ouvrir Sauvegarde</button>}
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}
