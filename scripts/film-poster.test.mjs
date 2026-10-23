import assert from 'node:assert/strict'
import { test } from 'node:test'

/**
 * Affiche d'un film : un seul calcul pour la fiche, le formulaire, l'accueil et les cartes.
 * Règle : un lien collé par la personne (ni une affiche TMDB, ni connu du cache) l'emporte ;
 * sinon l'affiche choisie dans la galerie, puis l'affiche principale du fournisseur, puis la
 * colonne locale.
 */
const { resolveFilmPoster, isCustomFilmPoster } = await import('../src/domain/filmPoster.ts')

const TMDB_MAIN = 'https://image.tmdb.org/t/p/w500/principale.jpg'
const TMDB_ALT = 'https://image.tmdb.org/t/p/w500/alternative.jpg'
const CUSTOM = 'https://exemple.org/mon-affiche.png'

const cache = (overrides = {}) => ({
  selectedPosterUrl: null,
  presentation: { posterUrl: TMDB_MAIN, alternativePosterUrls: [TMDB_ALT] },
  ...overrides,
})

test('Sans association, la colonne locale fait foi', () => {
  assert.equal(resolveFilmPoster(CUSTOM, null), CUSTOM)
  assert.equal(resolveFilmPoster(null, null), null)
})

test('Une fiche associée sans affiche locale montre l’affiche du fournisseur', () => {
  // Le défaut signalé : la fiche détail la montrait, le formulaire affichait « Sans affiche ».
  assert.equal(resolveFilmPoster(null, cache()), TMDB_MAIN)
  assert.equal(resolveFilmPoster('', cache()), TMDB_MAIN)
})

test('L’affiche choisie dans la galerie passe devant la principale', () => {
  assert.equal(resolveFilmPoster(TMDB_MAIN, cache({ selectedPosterUrl: TMDB_ALT })), TMDB_ALT)
  assert.equal(resolveFilmPoster(null, cache({ selectedPosterUrl: TMDB_ALT })), TMDB_ALT)
})

test('Un lien personnel passe devant l’affiche du fournisseur et la galerie', () => {
  assert.equal(resolveFilmPoster(CUSTOM, cache()), CUSTOM)
  assert.equal(resolveFilmPoster(CUSTOM, cache({ selectedPosterUrl: TMDB_ALT })), CUSTOM)
})

test('Une affiche TMDB oubliée par le cache n’est pas prise pour un lien personnel', () => {
  // Le cache se rafraîchit et sa liste d’alternatives bouge : l’adresse enregistrée à la
  // création ne doit pas écraser un choix fait depuis dans la galerie.
  const forgotten = 'https://image.tmdb.org/t/p/w500/ancienne.jpg'
  assert.equal(isCustomFilmPoster(forgotten, cache()), false)
  assert.equal(resolveFilmPoster(forgotten, cache({ selectedPosterUrl: TMDB_ALT })), TMDB_ALT)
})

test('Ce que le cache connaît déjà n’est jamais un lien personnel', () => {
  // Le harnais et d’éventuels miroirs servent des affiches hors image.tmdb.org.
  const mirrored = 'https://miroir.example/affiche.jpg'
  const known = cache({ presentation: { posterUrl: mirrored, alternativePosterUrls: [] } })
  assert.equal(isCustomFilmPoster(mirrored, known), false)
})

test('Une valeur qui n’est pas une adresse http(s) n’est pas un lien personnel', () => {
  assert.equal(isCustomFilmPoster('pas une adresse', cache()), false)
  assert.equal(isCustomFilmPoster('javascript:alert(1)', cache()), false)
  assert.equal(resolveFilmPoster('pas une adresse', cache()), TMDB_MAIN)
})

test('Association sans aucune affiche : on retombe sur la colonne locale', () => {
  const bare = cache({ presentation: { posterUrl: null, alternativePosterUrls: [] } })
  assert.equal(resolveFilmPoster(null, bare), null)
  assert.equal(resolveFilmPoster(CUSTOM, bare), CUSTOM)
})
