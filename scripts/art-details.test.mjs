// Champs propres aux formes d'art (27 octobre 2026) : catalogue, conservation
// au changement de forme, poème, format des visuels et portabilité v6.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ARTWORK_DETAIL_LIMITS,
  ARTWORK_FORM_PROFILES,
  artworkDetailFieldsFor,
  artworkShowsPlace,
  displayRatio,
  normalizeArtworkDetails,
  parseArtworkDetails,
  poemExcerpt,
  serializeArtworkDetails,
} from '../src/domain/artworkDetails.ts'
import { ARTWORK_FORMS } from '../src/domain/artwork.ts'
import { createLibraryDocument, validateLibraryDocument } from '../src/domain/libraryDocument.ts'
import { mergeArtworkKeepExisting } from '../src/domain/importMerge.ts'

const ISO = '2026-10-27T10:00:00.000Z'
const profile = { id: 'profil', name: 'Profil', createdAt: ISO, updatedAt: ISO }
const artwork = (over = {}) => ({
  id: 'art', profileId: 'profil', title: 'Le Pont Mirabeau', artist: 'Guillaume Apollinaire', year: 1912, form: 'poésie',
  location: null, exhibition: null, status: 'découverte', isFavorite: false, discoveredAt: null, imageUrl: null,
  personalNote: null, customFields: [], details: {}, createdAt: ISO, updatedAt: ISO, ...over,
})
const POEM = 'Sous le pont Mirabeau coule la Seine\n        Et nos amours\n\n        Vienne la nuit sonne l’heure'

test('Chaque forme d’art a un profil complet, des clés uniques et un format de repli plausible', () => {
  assert.deepEqual(Object.keys(ARTWORK_FORM_PROFILES).sort(), [...ARTWORK_FORMS].sort())
  for (const [form, profile] of Object.entries(ARTWORK_FORM_PROFILES)) {
    const keys = profile.fields.map((field) => field.key)
    assert.equal(new Set(keys).size, keys.length, `${form} : clés uniques`)
    assert.ok(profile.defaultRatio >= 0.6 && profile.defaultRatio <= 2.2, `${form} : format de repli dans les bornes`)
    assert.ok(profile.hint.length > 0 && profile.creatorLabel.length > 0, `${form} : description et libellé de l’auteur`)
  }
  assert.deepEqual(ARTWORK_FORM_PROFILES['poésie'].fields.map((field) => field.key), ['collection', 'translator', 'text'])
  assert.equal(ARTWORK_FORM_PROFILES['poésie'].creatorLabel, 'Poète')
  assert.equal(ARTWORK_FORM_PROFILES['poésie'].showsPlace, false, 'Un poème n’a ni lieu ni exposition')
  assert.equal(ARTWORK_FORM_PROFILES.performance.exhibitionLabel, 'Événement')
})

test('Le poème garde vers, retraits et strophes ; les champs courts sont rognés ; le vide tombe', () => {
  const details = normalizeArtworkDetails({
    text: '\r\n\r\n' + POEM.replace(/\n/g, '\r\n') + '   \r\n',
    collection: '  Alcools  ',
    technique: '   ',
    nombre: 3,
    '': 'sans clé',
  })
  assert.deepEqual(details, { text: POEM, collection: 'Alcools' })
  const long = normalizeArtworkDetails({ text: 'v'.repeat(ARTWORK_DETAIL_LIMITS.poem + 50), technique: 't'.repeat(400) })
  assert.equal(long.text.length, ARTWORK_DETAIL_LIMITS.poem)
  assert.equal(long.technique.length, ARTWORK_DETAIL_LIMITS.text)
  assert.deepEqual(normalizeArtworkDetails(null), {})
  assert.deepEqual(normalizeArtworkDetails(['a']), {})
})

test('La colonne JSON se relit avec tolérance et s’écrit toujours comme un objet', () => {
  assert.deepEqual(parseArtworkDetails('{"text":"Vers","technique":""}'), { text: 'Vers' })
  assert.deepEqual(parseArtworkDetails('pas du JSON'), {})
  assert.deepEqual(parseArtworkDetails(null), {})
  assert.deepEqual(parseArtworkDetails('[1,2]'), {})
  assert.equal(serializeArtworkDetails(undefined), '{}')
  assert.equal(serializeArtworkDetails({ collection: ' Alcools ' }), '{"collection":"Alcools"}')
})

test('Changer de forme ne cache aucune valeur : les champs remplis d’une autre forme restent affichés', () => {
  const keysFor = (form, details) => artworkDetailFieldsFor(form, details).map((field) => field.key)
  assert.deepEqual(keysFor('peinture', {}), ['technique', 'dimensions', 'movement'])
  assert.deepEqual(keysFor('peinture', { text: POEM, collection: '', inconnu: 'valeur' }), ['technique', 'dimensions', 'movement', 'text'],
    'Le poème rempli reste éditable ; un champ vide d’une autre forme et une clé inconnue ne s’affichent pas')
  assert.deepEqual(keysFor('poésie', { technique: 'Huile' }), ['collection', 'translator', 'text', 'technique'])
  assert.deepEqual(keysFor('autre', {}), [])
})

test('Lieu et Exposition : masqués pour un poème vide, visibles dès qu’ils portent une valeur', () => {
  assert.equal(artworkShowsPlace('poésie', null, null), false)
  assert.equal(artworkShowsPlace('poésie', '', '  '), false)
  assert.equal(artworkShowsPlace('poésie', 'Bibliothèque', null), true)
  assert.equal(artworkShowsPlace('poésie', null, 'Printemps des poètes'), true)
  assert.equal(artworkShowsPlace('sculpture', null, null), true)
})

test('L’extrait d’un poème garde ses strophes sans doubler les blancs ni finir sur un vide', () => {
  assert.deepEqual(poemExcerpt('\n\nUn\n\n\n\nDeux\nTrois\n\n'), ['Un', '', 'Deux', 'Trois'])
  assert.deepEqual(poemExcerpt('1\n2\n3\n4\n5', 3), ['1', '2', '3'])
  assert.deepEqual(poemExcerpt('Un\n\nDeux', 2), ['Un'], 'Un blanc en dernière position est retiré')
  assert.deepEqual(poemExcerpt('  retrait  '), ['  retrait'], 'Le retrait de tête est conservé')
})

test('Le format affiché suit l’image, borné, et retombe sur celui de la forme', () => {
  assert.equal(displayRatio(1.5, 'peinture'), 1.5)
  assert.equal(displayRatio(5, 'peinture'), 2.2, 'Un panorama extrême est borné')
  assert.equal(displayRatio(0.2, 'dessin'), 0.75, 'Une bande verticale est bornée (la signature tient sous une carte en portrait)')
  assert.equal(displayRatio(null, 'photographie'), 1.5)
  assert.equal(displayRatio(Number.NaN, 'poésie'), 0.75)
  assert.equal(displayRatio(0, 'sculpture'), 0.75)
})

test('Document v6 : les champs de forme voyagent ; v5 s’importe sans eux ; un format mal formé est refusé', () => {
  const library = { profile, films: [], series: [], books: [], games: [], artworks: [artwork({ details: { text: POEM, collection: 'Alcools' } })] }
  const current = createLibraryDocument(library, ISO)
  assert.equal(current.version, 8)
  const read = validateLibraryDocument(JSON.stringify(current))
  assert.deepEqual(read.errors, [])
  assert.deepEqual(read.document.artworks[0].details, { text: POEM, collection: 'Alcools' })

  const { details: _details, ...withoutDetails } = current.artworks[0]
  const v5 = validateLibraryDocument(JSON.stringify({ ...current, version: 5, artworks: [withoutDetails] }))
  assert.deepEqual(v5.errors, [])
  assert.deepEqual(v5.document.artworks[0].details, {}, 'Une œuvre v5 reçoit des détails vides')

  const v5WithDetails = validateLibraryDocument(JSON.stringify({ ...current, version: 5 }))
  assert.equal(v5WithDetails.document, null)
  assert.deepEqual(v5WithDetails.errors.map((error) => error.path), ['$.artworks[0].details'])

  const v6Without = validateLibraryDocument(JSON.stringify({ ...current, artworks: [withoutDetails] }))
  assert.deepEqual(v6Without.errors.map((error) => error.path), ['$.artworks[0].details'], 'En v6, les détails sont obligatoires (même vides)')

  const wrongValue = validateLibraryDocument(JSON.stringify({ ...current, artworks: [{ ...current.artworks[0], details: { text: 12 } }] }))
  assert.deepEqual(wrongValue.errors.map((error) => error.path), ['$.artworks[0].details.text'])
})

test('Fusion à l’import : un détail saisi n’est jamais remplacé, un détail absent est comblé', () => {
  const existing = artwork({ details: { collection: 'Alcools' } })
  const imported = artwork({ details: { collection: 'Autre recueil', text: POEM } })
  assert.deepEqual(mergeArtworkKeepExisting(existing, imported).details, { collection: 'Alcools', text: POEM })
})
