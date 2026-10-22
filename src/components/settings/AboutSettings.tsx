import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { SettingsGroup, SettingsRow } from './SettingsLayout.tsx'

const REPOSITORY_URL = 'https://github.com/geasshin/sylloge'
const SITE_URL = 'https://sylloge.vercel.app'

export function AboutSettings() {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    getVersion().then(
      (value) => { if (!cancelled) setVersion(value) },
      (error: unknown) => {
        console.error('Impossible de lire la version installée.', error)
        if (!cancelled) setVersion(null)
      },
    )
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <SettingsGroup id="about-title" title="Sylloge" description="Bibliothèque culturelle personnelle : Films, Séries, Animation japonaise, Livres, Mangas, Jeux et Art.">
        <SettingsRow label="Version installée"><span className="settings-value">{version ?? 'Indisponible'}</span></SettingsRow>
        <SettingsRow label="Licence" detail="Gratuit et open source. Le code peut être lu, modifié et redistribué.">
          <a className="secondary-button" href={`${REPOSITORY_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT ↗</a>
        </SettingsRow>
        <SettingsRow label="Code source" detail="github.com/geasshin/sylloge">
          <a className="secondary-button" href={REPOSITORY_URL} target="_blank" rel="noreferrer">Ouvrir ↗</a>
        </SettingsRow>
        <SettingsRow label="Site et téléchargements" detail="sylloge.vercel.app">
          <a className="secondary-button" href={SITE_URL} target="_blank" rel="noreferrer">Ouvrir ↗</a>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup id="about-data-title" title="Données" description="Aucun compte. Les bibliothèques restent sur ce Mac.">
        <SettingsRow label="Bibliothèques" detail="Enregistrées dans la base interne de l’application, sur ce Mac. Pour les copier ailleurs : Paramètres › Sauvegarde." />
        <SettingsRow label="Mises à jour de la base" detail="Avant qu’une nouvelle version modifie la structure de la base, Sylloge en garde une copie interne. Les trois dernières sont conservées." />
        <SettingsRow label="Recherches de métadonnées" detail="TMDB (Films, Séries, Animation japonaise) et IGDB (Jeux) passent par le relais Sylloge, qui garde les clés d’accès ; Open Library (Livres, Mangas) est interrogé directement. Seuls les titres recherchés ou associés quittent ce Mac ; notes, avis et citations n’en sortent jamais." />
      </SettingsGroup>

      <SettingsGroup id="about-credits-title" title="Sources des métadonnées">
        <SettingsRow label="TMDB" detail="Ce produit utilise l’API TMDB sans être approuvé ni certifié par TMDB.">
          <a className="secondary-button" href="https://www.themoviedb.org" target="_blank" rel="noreferrer">themoviedb.org ↗</a>
        </SettingsRow>
        <SettingsRow label="IGDB" detail="Données de jeux vidéo, service opéré par Twitch.">
          <a className="secondary-button" href="https://www.igdb.com" target="_blank" rel="noreferrer">igdb.com ↗</a>
        </SettingsRow>
        <SettingsRow label="Open Library" detail="Catalogue ouvert de l’Internet Archive, pour les livres et mangas.">
          <a className="secondary-button" href="https://openlibrary.org" target="_blank" rel="noreferrer">openlibrary.org ↗</a>
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}
