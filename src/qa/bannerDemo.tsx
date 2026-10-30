/**
 * Démonstration isolée de la bannière 16:9 (recette navigateur seulement).
 *
 * Les fiches réelles ne branchent pas encore `DetailBanner` : cette page monte
 * le couple `useBannerEditor` + `DetailBanner` sur quatre lignes des fixtures
 * (film, série, animé, jeu) et enregistre par les dépôts réels, dans la base
 * SQLite en mémoire du harnais. `window.__syllogeRecette` relit ensuite
 * `films.banner_url`, `series.banner_url`, `anime.banner_url` et
 * `games.banner_url` : la recette prouve l'écriture, pas seulement l'affichage.
 *
 * Aucune commande native n'est appelée par la page elle-même : les images
 * officielles viennent de `fetch_banner_candidates`, simulée par `appBridge.ts`.
 */
import '../styles.css'
import { useEffect, useState } from 'react'
import { t } from '../i18n/core.ts'
import { createRoot } from 'react-dom/client'
import { filmsRepository } from '../data/filmsRepository.ts'
import { mediaRepository } from '../data/mediaRepository.ts'
import type { BannerMedium } from '../data/bannerService.ts'
import { BannerAddButton, DetailBanner } from '../components/DetailBanner.tsx'
import { useBannerEditor } from '../components/useBannerEditor.tsx'
import { QA_PROFILE_ID } from './appSeed.ts'

type DemoRow = {
  medium: BannerMedium
  /** Table du médium, pour les lectures directes de la recette. */
  table: 'films' | 'series' | 'anime' | 'games'
  id: string
  title: string
  /** Identifiant fournisseur factice : la vraie fiche le lit du cache ou du lien. */
  providerId: string
  /** `false` : la ligne n'a pas d'identifiant, pour éprouver l'état « aucune image officielle ». */
  providerAvailable?: boolean
}

const ROWS: DemoRow[] = [
  { medium: 'film', table: 'films', id: 'film-drive-my-car', title: 'Drive My Car', providerId: '900005' },
  { medium: 'series', table: 'series', id: 'series-severance', title: 'Severance', providerId: '4242' },
  { medium: 'anime', table: 'anime', id: 'series-arcane', title: 'Arcane', providerId: '4243' },
  { medium: 'game', table: 'games', id: 'game-hades', title: 'Hades', providerId: '5555' },
  { medium: 'film', table: 'films', id: 'film-petite-maman', title: 'Petite Maman', providerId: '', providerAvailable: false },
]

async function loadBanner(row: DemoRow): Promise<string | null> {
  if (row.table === 'films') {
    const film = await filmsRepository.getFilm(QA_PROFILE_ID, row.id)
    return film?.bannerUrl ?? null
  }
  if (row.table === 'games') {
    const game = await mediaRepository.getGame(QA_PROFILE_ID, row.id)
    return game?.bannerUrl ?? null
  }
  const series = await mediaRepository.getSeries(QA_PROFILE_ID, row.id, row.table)
  return series?.bannerUrl ?? null
}

async function saveBanner(row: DemoRow, url: string | null): Promise<void> {
  if (row.table === 'films') {
    await filmsRepository.updateFilmBanner(QA_PROFILE_ID, row.id, url)
    return
  }
  if (row.table === 'games') {
    await mediaRepository.setGameBanner(QA_PROFILE_ID, row.id, url)
    return
  }
  await mediaRepository.setSeriesBanner(QA_PROFILE_ID, row.id, url, row.table)
}

function BannerDemoCard({ row }: { row: DemoRow }) {
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const editor = useBannerEditor({
    title: row.title,
    medium: row.medium,
    providerId: row.providerAvailable === false ? null : row.providerId,
    currentUrl: bannerUrl,
    onSave: async (url) => {
      await saveBanner(row, url)
      setBannerUrl(await loadBanner(row))
    },
  })

  useEffect(() => {
    let alive = true
    void loadBanner(row).then((value) => {
      if (alive) {
        setBannerUrl(value)
        setLoaded(true)
      }
    })
    return () => {
      alive = false
    }
  }, [row])

  return (
    <section className="banner-demo-card" data-medium={row.medium} data-entry={row.id} data-loaded={loaded ? 'true' : 'false'}>
      <header>
        <h2>{row.title}</h2>
        <span>{row.medium}</span>
        <code>{row.providerAvailable === false ? 'sans fournisseur' : row.providerId}</code>
      </header>
      <DetailBanner title={row.title} bannerUrl={bannerUrl} {...editor.bannerProps} />
      <div className="banner-demo-actions">
        {bannerUrl === null && <BannerAddButton {...editor.addProps} />}
        {bannerUrl !== null && (
          <button type="button" className="secondary-button" onClick={editor.bannerProps.onEdit}>
            Modifier la bannière
          </button>
        )}
      </div>
      {editor.bannerDialog}
    </section>
  )
}

export function mountBannerDemo() {
  const container = document.createElement('main')
  container.className = 'banner-demo'
  document.body.append(container)
  createRoot(container).render(
    <>
      <h1>{t('Bannières 16:9 — démonstration')}</h1>
      <div className="banner-demo-list">
        {ROWS.map((row) => <BannerDemoCard key={`${row.table}:${row.id}`} row={row} />)}
      </div>
    </>,
  )
}
