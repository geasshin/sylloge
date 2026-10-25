// Recherche d'images de l'Art : la logique pure (adresse de la requête, tri, filtrage), testée sans réseau.
import assert from 'node:assert/strict'
import test from 'node:test'
import { candidatesFromCommons, commonsSearchUrl, MAX_ARTWORK_IMAGES } from '../src/domain/artImageSearch.ts'

/** Une réponse de Commons comme la rend `formatversion=2` : `query.pages` est un tableau. */
const payload = (pages) => ({ query: { pages } })

const page = (title, over = {}) => ({
  title,
  imageinfo: [{
    url: 'https://upload.wikimedia.org/original.jpg',
    thumburl: `https://upload.wikimedia.org/800px-${encodeURIComponent(title.replace(/^File:/, ''))}`,
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:X',
    mime: 'image/jpeg',
    width: 2400,
    height: 1600,
    extmetadata: { LicenseShortName: { value: 'Public domain' } },
    ...over,
  }],
})

test('L’adresse de la recherche vise les fichiers de Commons, avec le titre et l’artiste', () => {
  const url = new URL(commonsSearchUrl('Les Nymphéas', 'Claude Monet'))
  assert.equal(url.origin + url.pathname, 'https://commons.wikimedia.org/w/api.php')
  assert.equal(url.searchParams.get('gsrnamespace'), '6', 'les fichiers, pas les articles')
  assert.equal(url.searchParams.get('gsrsearch'), 'Les Nymphéas Claude Monet')
  assert.equal(url.searchParams.get('formatversion'), '2')
  assert.equal(url.searchParams.get('iiurlwidth'), '800')
  assert.equal(url.searchParams.get('iiprop'), 'url|extmetadata|size|mime')
})

test('Sans artiste, la requête se limite au titre, sans espace parasite', () => {
  assert.equal(new URL(commonsSearchUrl('  Guernica  ', null)).searchParams.get('gsrsearch'), 'Guernica')
  assert.equal(new URL(commonsSearchUrl('Guernica', '   ')).searchParams.get('gsrsearch'), 'Guernica')
})

test('Les propositions gardent les images utilisables et écartent les schémas et les trop petites', () => {
  const candidates = candidatesFromCommons(payload([
    page('File:Gustave Courbet - La vague.jpg'),
    page('File:Plan de la galerie.svg', { mime: 'image/svg+xml' }),
    page('File:Vignette minuscule.jpg', { width: 200, height: 130 }),
    page('File:Photographie sans licence.jpg', { extmetadata: {} }),
  ]), 'Gustave Courbet')
  assert.deepEqual(candidates.map(candidate => candidate.title), [
    'Gustave Courbet - La vague.jpg',
    'Photographie sans licence.jpg',
  ])
  assert.equal(candidates[0].license, 'Public domain')
  assert.equal(candidates[1].license, '', 'une licence absente reste vide, elle n’est pas inventée')
  assert.ok(candidates.every(candidate => candidate.url.startsWith('https://upload.wikimedia.org/800px-')))
})

test('Le nom de l’artiste fait remonter ses œuvres, l’ordre de la recherche tranche le reste', () => {
  const candidates = candidatesFromCommons(payload([
    page('File:Une autre vague.jpg'),
    page('File:Gustave Courbet - La Vague No 6.jpg'),
    page('File:La vague (1869).jpg'),
  ]), 'Gustave Courbet', 3)
  assert.deepEqual(candidates.map(candidate => candidate.title), [
    'Gustave Courbet - La Vague No 6.jpg',
    'Une autre vague.jpg',
    'La vague (1869).jpg',
  ], 'le fichier qui porte le nom de l’artiste passe devant, les autres gardent leur ordre')
})

test('Six propositions au plus, et une réponse illisible ne casse rien', () => {
  const many = payload(Array.from({ length: 10 }, (_, index) => page(`File:Œuvre ${index}.jpg`)))
  assert.equal(candidatesFromCommons(many, null).length, MAX_ARTWORK_IMAGES)
  assert.deepEqual(candidatesFromCommons(null, 'Monet'), [])
  assert.deepEqual(candidatesFromCommons({}, 'Monet'), [])
  assert.deepEqual(candidatesFromCommons({ query: { pages: 'non' } }, 'Monet'), [])
  assert.deepEqual(candidatesFromCommons(payload([{ title: 'File:Sans imageinfo.jpg' }]), 'Monet'), [])
})
