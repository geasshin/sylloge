import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import * as catalog from '../src/catalog.ts'

{
  const {
    detailHash,
    films,
    filterFilms,
    filterSeries,
    libraryHash,
    recentlyLived,
    routeFromHash,
    series,
  } = catalog

  assert.equal(films.length, 8, 'La collection Films doit contenir les huit fiches réelles')
  assert.equal(series.length, 8, 'La collection Séries doit contenir les huit fiches réelles')

  assert.deepEqual(filterFilms(films, 'Celine', 'Tout').map((film) => film.id), ['portrait-de-la-jeune-fille-en-feu'], 'La recherche Films doit ignorer les accents')
  assert.equal(filterFilms(films, '', 'À découvrir').length, 1, 'Le filtre Films à découvrir doit fonctionner')
  assert.equal(filterFilms(films, '', 'Terminés').length, 7, 'Le filtre Films terminés doit fonctionner')
  assert.equal(filterFilms(films, '', 'Favoris').length, 4, 'Le filtre Films favoris doit fonctionner')

  assert.deepEqual(filterSeries(series, 'Phoebe', 'Tout').map((show) => show.id), ['fleabag'], 'La recherche Séries doit inclure la création')
  assert.equal(filterSeries(series, '', 'À découvrir').length, 1, 'Le filtre Séries à découvrir doit fonctionner')
  assert.equal(filterSeries(series, '', 'Terminées').length, 5, 'Le filtre Séries terminées doit fonctionner')
  assert.equal(filterSeries(series, '', 'En pause').length, 2, 'Le filtre Séries en pause doit fonctionner')
  assert.equal(filterSeries(series, '', 'Favoris').length, 4, 'Le filtre Séries favoris doit fonctionner')

  assert.deepEqual(recentlyLived.map(({ medium, item }) => `${medium}:${item.id}`), [
    'Film:paddington-au-perou',
    'Série:empathie',
    'Film:drive',
    'Film:une-bataille-apres-lautre',
  ], 'Les éléments récents doivent rester mixtes et triés par date réelle')

  const severance = series.find((show) => show.id === 'severance')
  assert.equal(severance?.status, 'En pause', 'Severance doit alimenter le module À reprendre')

  const bugonia = films.find((film) => film.id === 'bugonia')
  assert.ok(bugonia, 'Bugonia doit être présente')
  assert.equal(bugonia.director, undefined, 'Bugonia ne doit pas recevoir de réalisateur fictif')
  assert.equal(bugonia.year, undefined, 'Bugonia ne doit pas recevoir d’année fictive')
  assert.equal(bugonia.rating, undefined, 'Bugonia ne doit pas recevoir de note fictive')
  assert.equal(bugonia.watchedAt, undefined, 'Bugonia ne doit pas recevoir de date fictive')
  assert.equal(bugonia.summary, undefined, 'Bugonia ne doit pas recevoir de résumé fictif')

  const allItems = [...films, ...series]
  assert.ok(allItems.every((item) => item.poster.startsWith('/posters/')), 'Chaque fiche doit référencer une affiche locale')
  assert.ok(allItems.every((item) => existsSync(new URL(`../public${item.poster}`, import.meta.url))), 'Chaque chemin d’affiche doit pointer vers un fichier fourni')
  assert.ok(allItems.every((item) => !item.rating || item.rating.score <= 10), 'Les notes doivent rester sur 10')
  assert.ok(allItems.every((item) => !('duration' in item) && !('country' in item) && !('seasonsSeen' in item) && !('years' in item)), 'Les anciennes métadonnées fictives ne doivent pas revenir')

  const filmDetailRoute = routeFromHash(detailHash('films', 'bugonia'))
  assert.deepEqual(filmDetailRoute, { page: 'films', selectedId: 'bugonia' }, 'Une fiche Film doit pouvoir être ouverte')
  assert.deepEqual(routeFromHash(libraryHash('films')), { page: 'films', selectedId: null }, 'Le retour Films doit retrouver la bibliothèque')

  const seriesDetailRoute = routeFromHash(detailHash('series', 'severance'))
  assert.deepEqual(seriesDetailRoute, { page: 'series', selectedId: 'severance' }, 'Une fiche Série doit pouvoir être ouverte')
  assert.deepEqual(routeFromHash(libraryHash('series')), { page: 'series', selectedId: null }, 'Le retour Séries doit retrouver la bibliothèque')

  console.log('Vérification réussie : contenu réel, affiches, recherche, filtres, ouverture et retour.')
}
