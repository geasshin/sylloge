import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detailImageUrl } from '../src/domain/imageQuality.ts'

// La fiche montre le visuel sur environ 380 px, soit 760 pixels réels sur un
// écran Retina : une affiche TMDB w500 ou une jaquette IGDB cover_big (264 px)
// y paraissent floues. La fiche demande la taille au-dessus ; la base ne change pas.

test('une affiche TMDB s’affiche en w780 dans la fiche', () => {
  assert.equal(detailImageUrl('https://image.tmdb.org/t/p/w500/a.jpg'), 'https://image.tmdb.org/t/p/w780/a.jpg')
  assert.equal(detailImageUrl('https://image.tmdb.org/t/p/w342/a.jpg'), 'https://image.tmdb.org/t/p/w780/a.jpg')
  assert.equal(detailImageUrl('https://image.tmdb.org/t/p/w780/a.jpg'), 'https://image.tmdb.org/t/p/w780/a.jpg')
  // Une taille déjà plus grande n’est jamais réduite.
  assert.equal(detailImageUrl('https://image.tmdb.org/t/p/original/a.jpg'), 'https://image.tmdb.org/t/p/original/a.jpg')
  assert.equal(detailImageUrl('https://image.tmdb.org/t/p/w1280/a.jpg'), 'https://image.tmdb.org/t/p/w1280/a.jpg')
})

test('une jaquette IGDB s’affiche en 720p dans la fiche', () => {
  assert.equal(detailImageUrl('https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg'), 'https://images.igdb.com/igdb/image/upload/t_720p/co1.jpg')
  assert.equal(detailImageUrl('https://images.igdb.com/igdb/image/upload/t_thumb/co1.jpg'), 'https://images.igdb.com/igdb/image/upload/t_720p/co1.jpg')
  assert.equal(detailImageUrl('https://images.igdb.com/igdb/image/upload/t_1080p/co1.jpg'), 'https://images.igdb.com/igdb/image/upload/t_1080p/co1.jpg')
})

test('une adresse personnelle n’est jamais réécrite', () => {
  for (const url of [
    'https://fr.web.img6.acsta.net/pictures/22/11/affiche.jpg',
    'https://covers.openlibrary.org/b/id/1-L.jpg',
    'https://example.test/t/p/w500/a.jpg',
    'http://image.tmdb.org/t/p/w500/a.jpg',
  ]) assert.equal(detailImageUrl(url), url)
  assert.equal(detailImageUrl(null), null)
})
