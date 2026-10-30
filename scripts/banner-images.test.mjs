import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BANNER_MAX_CANDIDATES,
  bannerCropWarning,
  isBannerCandidate,
  isBannerUrl,
  normalizeBannerUrl,
  orderBannerCandidates,
} from '../src/domain/bannerImages.ts'

/** @param {Record<string, unknown> & { url: string }} overrides */
const candidate = (overrides) => ({
  thumbnailUrl: overrides.url.replace('/w1280/', '/w780/'),
  width: 1920,
  height: 1080,
  language: null,
  source: 'tmdb',
  ...overrides,
})

const urls = (candidates) => candidates.map((entry) => entry.url)

test('Une bannière garde les images paysage au format proche de 16:9', () => {
  assert.equal(isBannerCandidate(candidate({ url: 'https://image.tmdb.org/t/p/w1280/a.jpg' })), true, '16:9 passe')
  assert.equal(isBannerCandidate(candidate({ url: 'https://x/b.jpg', width: 1920, height: 1038 })), true, '1,85 passe')
  assert.equal(isBannerCandidate(candidate({ url: 'https://x/c.jpg', width: 1600, height: 1000 })), true, '1,6 passe')
  assert.equal(isBannerCandidate(candidate({ url: 'https://x/d.jpg', width: 2000, height: 1000 })), true, '2,0 passe')
})

test('Une bannière écarte le portrait, le carré, le très large et le trop petit', () => {
  assert.equal(isBannerCandidate(candidate({ url: 'https://x/poster.jpg', width: 1000, height: 1500 })), false, 'portrait')
  assert.equal(isBannerCandidate(candidate({ url: 'https://x/square.jpg', width: 1080, height: 1080 })), false, 'carré')
  assert.equal(isBannerCandidate(candidate({ url: 'https://x/wide.jpg', width: 2400, height: 1000 })), false, '2,4 trop large')
  assert.equal(isBannerCandidate(candidate({ url: 'https://x/small.jpg', width: 780, height: 439 })), false, 'largeur < 1280')
  assert.equal(isBannerCandidate(candidate({ url: 'https://x/unknown.jpg', width: null, height: null })), true, 'sans dimensions connues, gardé')
})

test('Une bannière refuse une adresse qui n’est pas https ou pas une image', () => {
  assert.equal(isBannerCandidate(candidate({ url: 'http://image.tmdb.org/t/p/w1280/a.jpg' })), false, 'http refusé')
  assert.equal(isBannerCandidate(candidate({ url: 'javascript:alert(1)' })), false, 'schéma refusé')
  assert.equal(isBannerCandidate(candidate({ url: '' })), false, 'adresse vide')
  assert.equal(isBannerCandidate(candidate({ url: 'https://x/a.txt' })), false, 'extension non image')
  assert.equal(isBannerCandidate(candidate({ url: 'https://x/photo.jpeg' })), true, 'jpeg accepté')
  assert.equal(isBannerCandidate(candidate({ url: 'https://x/a.jpg', thumbnailUrl: '' })), false, 'vignette absente')
})

test('Une bannière classe sans texte d’abord, puis la langue de l’interface, puis le reste', () => {
  const ordered = orderBannerCandidates([
    candidate({ url: 'https://x/other.jpg', language: 'ja', width: 3840, height: 2160 }),
    candidate({ url: 'https://x/fr-small.jpg', language: 'fr', width: 1280, height: 720 }),
    candidate({ url: 'https://x/textless.jpg', language: null, width: 1920 }),
    candidate({ url: 'https://x/fr-big.jpg', language: 'fr-FR', width: 3000, height: 1600 }),
  ], 'fr')

  assert.deepEqual(urls(ordered), [
    'https://x/textless.jpg',
    'https://x/fr-big.jpg',
    'https://x/fr-small.jpg',
    'https://x/other.jpg',
  ], 'aucun texte, puis la langue, puis le reste ; la largeur départage')
})

test('Une bannière sans langue d’interface garde l’ordre largeur, puis adresse', () => {
  const ordered = orderBannerCandidates([
    candidate({ url: 'https://x/b.jpg', language: 'fr', width: 1920 }),
    candidate({ url: 'https://x/a.jpg', language: 'en', width: 1920 }),
    candidate({ url: 'https://x/c.jpg', language: 'fr', width: 2560, height: 1440 }),
  ], '')
  assert.deepEqual(urls(ordered), ['https://x/c.jpg', 'https://x/a.jpg', 'https://x/b.jpg'])
})

test('Une bannière ne dépasse pas 24 candidats et ne répète pas une adresse', () => {
  // 1280 à 1319 de large sur 800 de haut : tous dans la fenêtre 1,6–2,0.
  const many = Array.from({ length: 40 }, (_, index) => candidate({
    url: `https://x/${String(index).padStart(2, '0')}.jpg`,
    width: 1280 + index,
    height: 800,
  }))
  assert.equal(orderBannerCandidates(many, 'fr').length, BANNER_MAX_CANDIDATES, 'au plus 24')

  const ordered = orderBannerCandidates([
    candidate({ url: 'https://x/00.jpg', width: 1280, height: 800 }),
    candidate({ url: 'https://x/00.jpg', width: 4000, height: 2500 }),
    candidate({ url: 'https://x/01.jpg', width: 1300, height: 800 }),
  ], 'fr')
  assert.deepEqual(urls(ordered), ['https://x/01.jpg', 'https://x/00.jpg'], 'aucune adresse en double')
  assert.equal(ordered[1].width, 1280, 'la déduplication garde l’entrée d’origine, pas la plus large')
})

test('Un aperçu collé prévient quand l’image est trop verticale', () => {
  assert.equal(bannerCropWarning(2 / 3), true, 'une affiche 2:3 est trop verticale')
  assert.equal(bannerCropWarning(1), true, 'un carré est trop vertical pour un bandeau 16:9')
  assert.equal(bannerCropWarning(1.2), true, '1,2 reste trop étroit')
  assert.equal(bannerCropWarning(1.6), false, '1,6 passe')
  assert.equal(bannerCropWarning(16 / 9), false, '16:9 passe')
  assert.equal(bannerCropWarning(null), false, 'format inconnu : aucun avertissement')
})

test('Une adresse de bannière est https, bornée, et vide vaut aucune bannière', () => {
  assert.equal(normalizeBannerUrl('  https://image.tmdb.org/t/p/w1280/a.jpg  '), 'https://image.tmdb.org/t/p/w1280/a.jpg')
  assert.equal(normalizeBannerUrl('   '), null, 'vide → aucune bannière')
  assert.equal(normalizeBannerUrl(null), null)
  assert.equal(isBannerUrl('https://image.tmdb.org/t/p/w1280/a.jpg'), true)
  assert.equal(isBannerUrl('http://image.tmdb.org/t/p/w1280/a.jpg'), false, 'http refusé')
  assert.equal(isBannerUrl('file:///Users/moi/image.jpg'), false, 'fichier local refusé')
  assert.equal(isBannerUrl('data:image/png;base64,AAAA'), false, 'données inline refusées')
  assert.equal(isBannerUrl('https://x/a b.jpg'), false, 'espace refusé')
  assert.equal(isBannerUrl(`https://x/${'a'.repeat(2100)}.jpg`), false, 'adresse démesurée refusée')
})
