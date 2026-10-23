import assert from 'node:assert/strict'
import test, { after, afterEach } from 'node:test'
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks'
import { getLanguage, setLanguage } from '../src/i18n/core.ts'
import {
  associateFilmWithTmdb, previewTmdbFilm, previewTmdbSeries, refreshFilmTmdbCache, searchTmdbFilms, searchTmdbSeries,
} from '../src/data/tmdbService.ts'

// Only mocked IPC and synthetic values: no network, no real database.
const previousWindow = globalThis.window
const previousLanguage = getLanguage()
globalThis.window = {}
afterEach(() => { clearMocks(); setLanguage(previousLanguage) })
after(() => {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
})

const calls = [
  ['search_tmdb_films', (language) => searchTmdbFilms('Perfect Days', language), { query: 'Perfect Days' }],
  ['preview_tmdb_film', (language) => previewTmdbFilm(976893, language), { tmdbId: 976893 }],
  ['search_tmdb_series', (language) => searchTmdbSeries('Severance', language), { query: 'Severance' }],
  ['preview_tmdb_series', (language) => previewTmdbSeries(95396, language), { tmdbId: 95396 }],
  ['associate_film_with_tmdb', (language) => associateFilmWithTmdb('film-synthetic', 976893, language), { filmId: 'film-synthetic', tmdbId: 976893 }],
  ['refresh_film_tmdb_cache', (language) => refreshFilmTmdbCache('film-synthetic', language), { filmId: 'film-synthetic' }],
]

for (const [command, call, payload] of calls) {
  test(`${command}: la langue de l’interface est la langue par défaut des métadonnées, une langue explicite l’emporte`, async () => {
    const seen = []
    mockIPC((name, value) => { seen.push([name, value]); return null })
    setLanguage('en')
    await call()
    assert.deepEqual(seen.at(-1), [command, { ...payload, language: 'en-GB' }])
    setLanguage('fr')
    await call()
    assert.deepEqual(seen.at(-1), [command, { ...payload, language: 'fr-FR' }])
    await call('de-DE')
    assert.deepEqual(seen.at(-1), [command, { ...payload, language: 'de-DE' }], 'un appelant qui précise la langue (cache existant, association automatique) garde sa valeur')
    assert.equal(seen.length, 3)
  })
}
