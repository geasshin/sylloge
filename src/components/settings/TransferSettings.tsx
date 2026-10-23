import { useEffect, useState } from 'react'
import { formatNumber, t } from '../../i18n/core.ts'
import { useLanguage } from '../../i18n/react.ts'
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

export function TransferSettings({ library, onLibraryChanged, onOpenBackups }: Props) {
  useLanguage()
  const [full, setFull] = useState<CulturalLibrary | null>(null)
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const fiches = (count: number) => count === 1
    ? t('{count} fiche', { count: formatNumber(count) })
    : t('{count} fiches', { count: formatNumber(count) })

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
        title={t('Par bibliothèque')}
        description={t('Importer depuis Letterboxd, Goodreads, Notion, un tableur ou un JSON Sylloge ; exporter en JSON ou CSV. Chaque import montre un aperçu et demande une confirmation.')}
      >
        {failed ? (
          <SettingsRow label={t('Bibliothèques illisibles')} detail={t('Les bibliothèques n’ont pas pu être lues. Revenir plus tard sur cette page.')} tone="danger" />
        ) : full === null ? (
          <SettingsRow label={t('Lecture des bibliothèques…')} />
        ) : (
          <>
            <SettingsRow label={t('Films')} detail={`${fiches(full.films.length)} · ${t('Letterboxd, Notion, tableur, JSON')}`}>
              <LibraryImportButton kind="films" buttonLabel={t('Importer')} mediumLabel="film" profileId={full.profile.id} profileName={full.profile.name} existing={full.films} onDone={changed} />
              <LibraryExportFlow kind="films" profileId={full.profile.id} />
            </SettingsRow>
            <SettingsRow label={t('Séries')} detail={`${fiches(full.series.length)} · ${t('Notion, tableur, JSON')}`}>
              <LibraryImportButton kind="series" buttonLabel={t('Importer')} mediumLabel="série" profileId={full.profile.id} profileName={full.profile.name} existing={full.series} onDone={changed} />
              <LibraryExportFlow kind="series" profileId={full.profile.id} />
            </SettingsRow>
            <SettingsRow label={t('Animation japonaise')} detail={`${fiches(full.anime.length)} · ${t('Notion, tableur, JSON')}`}>
              <LibraryImportButton kind="series" seriesLibrary="anime" buttonLabel={t('Importer')} mediumLabel="animation japonaise" profileId={full.profile.id} profileName={full.profile.name} existing={full.anime} onDone={changed} />
              <LibraryExportFlow kind="anime" profileId={full.profile.id} />
            </SettingsRow>
            <SettingsRow label={t('Livres')} detail={`${fiches(full.books.length)} · ${t('Goodreads, Notion, tableur, JSON · citations comprises')}`}>
              <LibraryImportButton kind="books" buttonLabel={t('Importer')} mediumLabel="livre" profileId={full.profile.id} profileName={full.profile.name} existing={full.books} onDone={changed} />
              <LibraryExportFlow kind="books" profileId={full.profile.id} />
            </SettingsRow>
            <SettingsRow label={t('Mangas')} detail={`${fiches(full.mangas.length)} · ${t('Notion, tableur, JSON · citations comprises')}`}>
              <LibraryImportButton kind="books" bookLibrary="mangas" buttonLabel={t('Importer')} mediumLabel="manga" profileId={full.profile.id} profileName={full.profile.name} existing={full.mangas} onDone={changed} />
              <LibraryExportFlow kind="mangas" profileId={full.profile.id} />
            </SettingsRow>
            <SettingsRow label={t('Jeux')} detail={`${fiches(full.games.length)} · ${t('Notion, tableur, JSON')}`}>
              <LibraryImportButton kind="games" buttonLabel={t('Importer')} mediumLabel="jeu" profileId={full.profile.id} profileName={full.profile.name} existing={full.games} onDone={changed} />
              <LibraryExportFlow kind="games" profileId={full.profile.id} />
            </SettingsRow>
            <SettingsRow label={t('Art')} detail={`${fiches(full.artworks.length)} · ${t('Notion, tableur, JSON · sans note chiffrée')}`}>
              <LibraryImportButton kind="artworks" buttonLabel={t('Importer')} mediumLabel="œuvre" profileId={full.profile.id} profileName={full.profile.name} existing={full.artworks} onDone={changed} />
              <LibraryExportFlow kind="artworks" profileId={full.profile.id} />
            </SettingsRow>
          </>
        )}
      </SettingsGroup>

      <SettingsGroup id="transfer-profile-title" title={t('Tout le profil')} description={t('Pour sauvegarder, restaurer ou changer d’ordinateur, un seul fichier JSON réunit toutes les bibliothèques du profil.')}>
        <SettingsRow label={t('Sauvegarde et restauration')} detail={t('Sauvegarde automatique, copies du profil, restauration et export d’une copie.')}>
          {onOpenBackups && <button className="secondary-button" type="button" onClick={onOpenBackups}>{t('Ouvrir Sauvegarde')}</button>}
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}
