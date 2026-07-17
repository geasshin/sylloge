import assert from 'node:assert/strict'
import * as catalog from '../src/catalog.ts'

{
  const {
    detailHash,
    films,
    filterFilms,
    filterSeries,
    libraryHash,
    routeFromHash,
    series,
  } = catalog

  assert.equal(films.length, 14, 'La collection Films doit rester complète')
  assert.equal(series.length, 9, 'La collection Séries doit contenir neuf fiches')

  assert.deepEqual(filterFilms(films, 'Celine', 'Tout').map((film) => film.id), ['past-lives', 'portrait', 'petite-maman'], 'La recherche Films doit ignorer les accents')
  assert.equal(filterFilms(films, '', 'À découvrir').length, 4, 'Le filtre Films à découvrir doit fonctionner')
  assert.equal(filterFilms(films, '', 'Terminés').length, 10, 'Le filtre Films terminés doit fonctionner')
  assert.equal(filterFilms(films, '', 'Favoris').length, 4, 'Le filtre Films favoris doit fonctionner')

  assert.deepEqual(filterSeries(series, 'Michaela', 'Tout').map((show) => show.id), ['i-may-destroy-you'], 'La recherche Séries doit inclure la création')
  assert.equal(filterSeries(series, '', 'À découvrir').length, 1, 'Le filtre Séries à découvrir doit fonctionner')
  assert.equal(filterSeries(series, '', 'En cours').length, 3, 'Le filtre Séries en cours doit fonctionner')
  assert.equal(filterSeries(series, '', 'Terminées').length, 5, 'Le filtre Séries terminées doit fonctionner')
  assert.equal(filterSeries(series, '', 'Favoris').length, 4, 'Le filtre Séries favoris doit fonctionner')
  assert.ok(series.filter((show) => show.status === 'Terminée').every((show) => show.personalNote), 'Chaque série terminée doit avoir une note personnelle')

  const filmDetailRoute = routeFromHash(detailHash('films', 'aftersun'))
  assert.deepEqual(filmDetailRoute, { page: 'films', selectedId: 'aftersun' }, 'Une fiche Film doit pouvoir être ouverte')
  assert.deepEqual(routeFromHash(libraryHash('films')), { page: 'films', selectedId: null }, 'Le retour Films doit retrouver la bibliothèque')

  const seriesDetailRoute = routeFromHash(detailHash('series', 'the-bear'))
  assert.deepEqual(seriesDetailRoute, { page: 'series', selectedId: 'the-bear' }, 'Une fiche Série doit pouvoir être ouverte')
  assert.deepEqual(routeFromHash(libraryHash('series')), { page: 'series', selectedId: null }, 'Le retour Séries doit retrouver la bibliothèque')

  console.log('Vérification réussie : Films et Séries, recherche, filtres, ouverture et retour.')
}
