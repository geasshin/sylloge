// Récapitulatif de l'année : calcul pur. Vérifie qu'aucun événement n'est inventé (une œuvre sans date
// ne compte pas), que les agrégats suivent les dates et les notes, et que l'ouverture du 10 décembre est
// une règle, pas une convenance.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RECAP_MIN_ITEMS, RECAP_STEPS, buildRecap, nextRecapYear, recapFileName, recapHistoryYears, recapIsOpen, recapItems, recapNow,
  recapOfferFor, recapYearFor, weekdayOfDate, yearOfDate,
} from '../src/domain/yearRecap.ts'

let n = 0
const entry = (library, over = {}) => {
  n += 1
  return {
    key: `${library}:${n}`, id: String(n), library, title: `Titre ${n}`, creator: null, year: 2020,
    rating: null, isFavorite: false, done: true, doneAt: '2026-01-01', doneOn: '2026-01-01',
    imageUrl: `https://img/${n}.jpg`, ...over,
  }
}

test('Une date se lit en AAAA-MM-JJ, avec ou sans heure, et rien d’autre ne passe', () => {
  assert.equal(yearOfDate('2026-03-14'), 2026)
  assert.equal(yearOfDate('2026-03-14T10:22:00.000Z'), 2026)
  assert.equal(yearOfDate(' 2019-12-31 '), 2019)
  assert.equal(yearOfDate(null), null)
  assert.equal(yearOfDate(''), null)
  assert.equal(yearOfDate('14/03/2026'), null)
  assert.equal(yearOfDate('2026-13-01'), null)
})

test('Seules les œuvres accomplies, datées de l’année et des sept bibliothèques de base comptent', () => {
  const items = [
    entry('films', { doneOn: '2026-02-01' }),
    entry('books', { doneOn: null, doneAt: '2026-05-05T12:00:00Z' }),
    entry('films', { doneOn: '2025-12-31' }),
    entry('series', { done: false, doneOn: '2026-03-03' }),
    entry('music', { doneOn: '2026-04-04' }),
  ]
  assert.deepEqual(recapItems(items, 2026).map(item => item.title), ['Titre 1', 'Titre 2'])
})

test('Le récapitulatif agrège l’année : total, bibliothèques, moyenne, favoris, mieux notées, découvertes', () => {
  const items = [
    entry('films', { title: 'f1', doneOn: '2026-01-03', rating: 5, isFavorite: true, creator: 'Aki Kaurismäki' }),
    entry('films', { title: 'f2', doneOn: '2026-02-10', rating: 4, creator: 'Aki Kaurismäki' }),
    entry('films', { title: 'f3', doneOn: '2026-03-01', rating: 2 }),
    entry('books', { title: 'b1', doneOn: '2026-02-01', rating: 4.5, isFavorite: true, creator: 'Ursula K. Le Guin' }),
    entry('books', { title: 'b2', doneOn: '2026-06-01', rating: null, creator: 'Ursula K. Le Guin' }),
    entry('games', { title: 'g1', doneOn: '2026-07-01', rating: 5, creator: 'Larian Studios' }),
    entry('anime', { title: 'a1', doneOn: '2026-07-02', rating: null }),
  ]
  const recap = buildRecap(items, 2026)
  assert.equal(recap.total, 7)
  assert.deepEqual(recap.perLibrary, [
    { library: 'films', count: 3 },
    { library: 'books', count: 2 },
    { library: 'anime', count: 1 },
    { library: 'games', count: 1 },
  ])
  assert.equal(recap.leading, 'films')
  assert.equal(recap.ratedCount, 5)
  assert.equal(recap.averageRating, 4.1, 'moyenne au dixième : (5 + 4 + 2 + 4,5 + 5) / 5')
  assert.equal(recap.favorites, 2)
  assert.deepEqual(recap.topRated.map(item => item.title), ['g1', 'f1', 'b1', 'f2'], 'note, puis date la plus récente')
  assert.deepEqual(recap.discoveries.map(item => item.library), ['films', 'books', 'games', 'anime'], 'la première de chaque bibliothèque, dans l’ordre des dates')
  assert.deepEqual(recap.creators.map(creator => [creator.name, creator.count]), [['Aki Kaurismäki', 2], ['Ursula K. Le Guin', 2], ['Larian Studios', 1]])
  assert.equal(recap.busiest.month, 2, 'février : deux œuvres, et le plus tôt en cas d’égalité avec juillet')
  assert.equal(recap.busiest.count, 2)
  assert.equal(recap.first.title, 'f1')
  assert.equal(recap.last.title, 'a1')
  assert.equal(recap.isEmpty, false)
})

test('Les mieux notées s’arrêtent à six, et une note sous quatre étoiles n’y entre pas', () => {
  const items = Array.from({ length: 8 }, (_, index) => entry('films', { doneOn: `2026-0${(index % 8) + 1}-10`, rating: index === 7 ? 3 : 5 }))
  const recap = buildRecap(items, 2026)
  assert.equal(recap.topRated.length, 6)
  assert.ok(recap.topRated.every(item => (item.rating ?? 0) >= 4))
})

test('Les découvertes s’arrêtent à cinq bibliothèques et suivent l’ordre des dates', () => {
  const items = ['books', 'films', 'games', 'mangas', 'series', 'anime'].map((library, index) => entry(library, { doneOn: `2026-0${index + 2}-01` }))
  const recap = buildRecap(items, 2026)
  assert.equal(recap.discoveries.length, 5)
  assert.deepEqual(recap.discoveries.map(item => item.library), ['books', 'films', 'games', 'mangas', 'series'])
})

test('Les œuvres sorties cette année et déjà vues sont repérées, cinq au plus', () => {
  const items = [
    entry('films', { title: 'sorti 2026', doneOn: '2026-04-01', year: 2026 }),
    entry('films', { title: 'sorti 1999', doneOn: '2026-04-02', year: 1999 }),
    entry('books', { title: 'sorti 2026 aussi', doneOn: '2026-04-03', year: 2026 }),
  ]
  assert.deepEqual(buildRecap(items, 2026).releasedThisYear.map(item => item.title), ['sorti 2026', 'sorti 2026 aussi'])
})

test('Une année sans rien de daté : récapitulatif vide, sans erreur ni division par zéro', () => {
  const recap = buildRecap([entry('films', { doneOn: '2025-01-01' })], 2026)
  assert.equal(recap.isEmpty, true)
  assert.equal(recap.total, 0)
  assert.equal(recap.averageRating, null)
  assert.equal(recap.busiest, null)
  assert.equal(recap.leading, null)
  assert.deepEqual(recap.perLibrary, [])
  assert.equal(recap.first, null)
  assert.equal(recap.last, null)
})

test('Le récapitulatif ouvre le 10 décembre : avant, l’année proposée est la précédente', () => {
  assert.equal(recapYearFor(new Date('2026-01-15T10:00:00')), 2025)
  assert.equal(recapYearFor(new Date('2026-12-09T23:59:00')), 2025)
  assert.equal(recapYearFor(new Date('2026-12-10T00:01:00')), 2026)
  assert.equal(recapYearFor(new Date('2027-03-01T10:00:00')), 2026)
  assert.equal(recapIsOpen(2026, new Date('2026-12-10T12:00:00')), true)
  assert.equal(recapIsOpen(2026, new Date('2026-12-09T12:00:00')), false)
})

test('Les flèches du récapitulatif ne proposent pas le futur', () => {
  assert.equal(nextRecapYear(2026, new Date('2026-12-20T10:00:00')), null)
  assert.equal(nextRecapYear(2025, new Date('2026-12-20T10:00:00')), 2026)
  assert.equal(nextRecapYear(2025, new Date('2026-10-25T10:00:00')), null)
})

test('Le nom du fichier dit l’année, l’étape et le format, sans accent ni espace', () => {
  const day = new Date('2026-12-14T10:00:00')
  assert.equal(recapFileName(2026, 'numbers', 'standard', day), 'sylloge-recap-2026-numbers-standard-2026-12-14.png')
  assert.equal(recapFileName(2026, 'discoveries', 'story', day), 'sylloge-recap-2026-discoveries-story-2026-12-14.png')
  assert.match(recapFileName(2025, 'top', 'standard', new Date('2026-01-02T10:00:00')), /-2026-01-02\.png$/)
})

test('Huit étapes, dans l’ordre de lecture', () => {
  assert.deepEqual([...RECAP_STEPS], ['numbers', 'rhythm', 'palmares', 'top', 'notes', 'span', 'habits', 'discoveries'])
})

test('Le palmarès retient une œuvre par bibliothèque : le coup de cœur, puis la note, puis la date', () => {
  const items = [
    entry('films', { title: 'noté 5', doneOn: '2026-01-01', rating: 5 }),
    entry('films', { title: 'coup de cœur noté 3', doneOn: '2026-01-02', rating: 3, isFavorite: true }),
    entry('books', { title: 'seule', doneOn: '2026-02-01', rating: null }),
    entry('games', { title: 'plus récent', doneOn: '2026-03-02', rating: 4 }),
    entry('games', { title: 'plus ancien', doneOn: '2026-03-01', rating: 4 }),
    entry('music', { title: 'hors base', doneOn: '2026-03-03', rating: 5 }),
  ]
  const palmares = buildRecap(items, 2026).palmares
  assert.deepEqual(palmares.map(entry => [entry.library, entry.item.title]), [
    ['films', 'coup de cœur noté 3'],
    ['books', 'seule'],
    ['games', 'plus récent'],
  ], 'une œuvre par bibliothèque, dans l’ordre des bibliothèques')
})

test('Les notes : dix cases de 0,5 à 5, la médiane et le compte des cinq étoiles', () => {
  const items = [
    entry('films', { rating: 5, doneOn: '2026-01-01' }),
    entry('films', { rating: 5, doneOn: '2026-01-02' }),
    entry('films', { rating: 4, doneOn: '2026-01-03' }),
    entry('films', { rating: 0.5, doneOn: '2026-01-04' }),
    entry('films', { rating: null, doneOn: '2026-01-05' }),
  ]
  const recap = buildRecap(items, 2026)
  assert.equal(recap.ratings.length, 10)
  assert.deepEqual(recap.ratings.map(bucket => bucket.value), [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5])
  assert.equal(recap.ratings[0].count, 1, 'une œuvre à 0,5')
  assert.equal(recap.ratings[7].count, 1, 'une œuvre à 4')
  assert.equal(recap.ratings[9].count, 2, 'deux œuvres à 5')
  assert.equal(recap.fiveStars, 2)
  assert.equal(recap.medianRating, 4.5, 'médiane de 0,5 ; 4 ; 5 ; 5')
  assert.equal(recap.averageRating, 3.6)
})

test('Les jours : le jour de la semaine, la journée record et la plus longue série', () => {
  assert.equal(weekdayOfDate('2026-01-05'), 1, 'un lundi')
  assert.equal(weekdayOfDate('2026-01-11'), 7, 'un dimanche')
  assert.equal(weekdayOfDate('n’importe quoi'), null)
  const items = [
    entry('films', { doneOn: '2026-03-02' }),
    entry('films', { doneOn: '2026-03-02' }),
    entry('films', { doneOn: '2026-03-02' }),
    entry('books', { doneOn: '2026-03-03' }),
    entry('books', { doneOn: '2026-03-04' }),
    entry('games', { doneOn: '2026-03-09' }),
  ]
  const recap = buildRecap(items, 2026)
  assert.deepEqual(recap.weekdays.map(day => day.count), [4, 1, 1, 0, 0, 0, 0], 'lundi à dimanche : 2, 3 et 9 mars sont des lundis')
  assert.equal(recap.bestWeekday, 1)
  assert.deepEqual(recap.bestDay, { date: '2026-03-02', count: 3 })
  assert.deepEqual(recap.streak, { length: 3, from: '2026-03-02', to: '2026-03-04' })
})

test('Le temps long : les bornes des années de sortie, la médiane et un point par œuvre', () => {
  const items = [
    entry('films', { title: 'muet', year: 1927, doneOn: '2026-01-01' }),
    entry('books', { title: 'moderne', year: 2026, doneOn: '2026-02-01' }),
    entry('games', { title: 'milieu', year: 1998, doneOn: '2026-03-01' }),
    entry('mangas', { title: 'sans année', year: null, doneOn: '2026-04-01' }),
  ]
  const span = buildRecap(items, 2026).span
  assert.equal(span.minYear, 1927)
  assert.equal(span.maxYear, 2026)
  assert.equal(span.medianYear, 1998)
  assert.equal(span.dated, 3)
  assert.equal(span.oldest.title, 'muet')
  assert.equal(span.newest.title, 'moderne')
  assert.deepEqual(span.dots, [
    { year: 1927, library: 'films' },
    { year: 1998, library: 'games' },
    { year: 2026, library: 'books' },
  ])
  assert.equal(buildRecap([entry('films', { year: null })], 2026).span, null)
})

test('La comparaison compte l’année précédente, et le créateur ne revient qu’à partir de deux œuvres', () => {
  const items = [
    entry('films', { creator: 'Solo', doneOn: '2026-01-01' }),
    entry('films', { creator: 'Fidèle', doneOn: '2026-01-02' }),
    entry('films', { creator: 'Fidèle', doneOn: '2026-01-03' }),
    entry('films', { creator: 'Avant', doneOn: '2025-05-05' }),
    entry('films', { creator: 'Avant', doneOn: '2025-06-05' }),
  ]
  const recap = buildRecap(items, 2026)
  assert.equal(recap.previousTotal, 2)
  assert.equal(recap.topCreator.name, 'Fidèle')
  assert.equal(recap.topCreator.count, 2, 'le même auteur, deux fois dans la même bibliothèque')
  const lonely = buildRecap([entry('films', { creator: 'Solo' })], 2026)
  assert.equal(lonely.topCreator, null, 'un créateur vu une seule fois ne fait pas un palmarès')
  assert.equal(lonely.previousTotal, 0)
})

test('Le temps long compte les décennies, de la plus récente à la plus ancienne, et la bibliothèque dominante', () => {
  const items = [
    entry('films', { year: 1927, doneOn: '2026-01-01' }),
    entry('films', { year: 1929, doneOn: '2026-01-02' }),
    entry('games', { year: 1998, doneOn: '2026-02-01' }),
    entry('books', { year: 2026, doneOn: '2026-03-01' }),
  ]
  const span = buildRecap(items, 2026).span
  assert.deepEqual(span.decades, [{ decade: 2020, count: 1 }, { decade: 1990, count: 1 }, { decade: 1920, count: 2 }])
  assert.equal(span.dominant, 'films')
})


// ─── Proposition automatique (décembre-janvier) ───────────────────────────────

/** `count` films terminés, tous datés de février 2026 : de quoi franchir le seuil. */
const many = (count, over = {}) => Array.from({ length: count }, (_, index) =>
  entry('films', { doneOn: `2026-02-${String((index % 28) + 1).padStart(2, '0')}`, ...over }))

test('La proposition attend vingt œuvres datées de l’année, pas dix-neuf', () => {
  const now = new Date('2026-12-12T12:00:00')
  assert.equal(RECAP_MIN_ITEMS, 20)
  assert.equal(recapOfferFor({ items: many(19), now, lastOfferedYear: null }), null)
  assert.equal(recapOfferFor({ items: many(20), now, lastOfferedYear: null }), 2026)
  assert.equal(recapOfferFor({ items: many(24), now, lastOfferedYear: null }), 2026)
})

test('La proposition vit du 10 décembre au 31 janvier : ni avant, ni après', () => {
  const items = many(20)
  assert.equal(recapOfferFor({ items, now: new Date('2026-12-09T23:59:00'), lastOfferedYear: null }), null)
  assert.equal(recapOfferFor({ items, now: new Date('2026-12-10T00:00:00'), lastOfferedYear: null }), 2026)
  assert.equal(recapOfferFor({ items, now: new Date('2026-12-31T23:00:00'), lastOfferedYear: null }), 2026)
  assert.equal(recapOfferFor({ items, now: new Date('2027-01-01T09:00:00'), lastOfferedYear: null }), 2026)
  assert.equal(recapOfferFor({ items, now: new Date('2027-01-31T23:59:00'), lastOfferedYear: null }), 2026)
  assert.equal(recapOfferFor({ items, now: new Date('2027-02-01T00:00:00'), lastOfferedYear: null }), null)
  assert.equal(recapOfferFor({ items, now: new Date('2027-03-15T12:00:00'), lastOfferedYear: null }), null)
})

test('En janvier, la proposition porte sur l’année qui vient de s’achever', () => {
  const items = many(20)
  assert.equal(recapOfferFor({ items, now: new Date('2027-01-04T10:00:00'), lastOfferedYear: null }), 2026)
  // Vingt œuvres datées de la nouvelle année ne font pas encore un bilan.
  assert.equal(recapOfferFor({ items: items.map(item => ({ ...item, doneOn: '2027-01-02' })), now: new Date('2027-01-04T10:00:00'), lastOfferedYear: null }), null)
})

test('Une proposition déjà faite pour l’année ne revient pas ; une autre année reste possible', () => {
  const items = many(20)
  const now = new Date('2026-12-12T12:00:00')
  assert.equal(recapOfferFor({ items, now, lastOfferedYear: 2026 }), null)
  assert.equal(recapOfferFor({ items, now, lastOfferedYear: 2025 }), 2026)
  assert.equal(recapOfferFor({ items: many(20), now, lastOfferedYear: null }), 2026)
})

test('Le seuil compte exactement ce que compte le récapitulatif, et rien d’autre', () => {
  const now = new Date('2026-12-12T12:00:00')
  // Vingt œuvres d'une autre année ne font pas une année.
  assert.equal(recapOfferFor({ items: many(20).map(item => ({ ...item, doneOn: '2025-03-03' })), now, lastOfferedYear: null }), null)
  // Ni une œuvre non terminée, ni une bibliothèque ajoutée.
  const partly = [
    ...many(18),
    entry('films', { doneAt: '2026-04-04', doneOn: null }),
    entry('music', { doneOn: '2026-04-05' }),
    entry('films', { done: false, doneOn: '2026-04-06' }),
  ]
  assert.equal(recapItems(partly, 2026).length, 19, 'le récapitulatif compte bien dix-neuf œuvres')
  assert.equal(recapOfferFor({ items: partly, now, lastOfferedYear: null }), null)
  const enough = [...partly, entry('books', { doneOn: '2026-04-07' })]
  assert.equal(recapItems(enough, 2026).length, 20)
  assert.equal(recapOfferFor({ items: enough, now, lastOfferedYear: null }), 2026)
})

test('Sans rien de daté dans l’année, aucune proposition', () => {
  assert.equal(recapOfferFor({ items: [], now: new Date('2026-12-12T12:00:00'), lastOfferedYear: null }), null)
  assert.equal(recapOfferFor({ items: [entry('films', { done: false, doneOn: null })], now: new Date('2026-12-12T12:00:00'), lastOfferedYear: null }), null)
})


// ─── Historique des années récapitulées ───────────────────────────────────────

test('L’historique liste les années ouvertes qui ont au moins une œuvre datée, de la plus récente à la plus ancienne', () => {
  const items = [
    entry('films', { doneOn: '2025-03-01' }),
    entry('books', { doneOn: '2026-02-01T10:00:00Z' }),
    entry('games', { doneOn: '2024-07-01' }),
    entry('films', { doneOn: '2025-08-01' }),
    entry('mangas', { doneOn: '2023-01-01' }),
  ]
  assert.deepEqual(recapHistoryYears(items, new Date('2026-10-30T10:00:00')), [
    { year: 2025, count: 2 },
    { year: 2024, count: 1 },
    { year: 2023, count: 1 },
  ], '2026 n’est pas encore ouvert le 30 octobre, 2022 est vide')
})

test('L’historique ne montre jamais l’année en cours avant le 10 décembre, ni une année future', () => {
  const items = [
    entry('films', { doneOn: '2026-02-01' }),
    entry('films', { doneOn: '2099-05-05' }),
    entry('books', { doneOn: '2025-05-05' }),
  ]
  assert.deepEqual(recapHistoryYears(items, new Date('2026-12-09T23:59:00')), [{ year: 2025, count: 1 }])
  assert.deepEqual(recapHistoryYears(items, new Date('2026-12-10T00:00:00')), [
    { year: 2026, count: 1 },
    { year: 2025, count: 1 },
  ], 'le 10 décembre ouvre 2026 ; 2099 reste hors de la liste')
})

test('L’historique ignore les œuvres sans date, non terminées et hors des sept bibliothèques de base', () => {
  const items = [
    entry('films', { doneOn: null, doneAt: null }),
    entry('films', { done: false, doneOn: '2024-04-04' }),
    entry('music', { doneOn: '2024-04-05' }),
    entry('books', { doneOn: 'n’importe quoi' }),
    entry('series', { doneOn: '2024-06-06' }),
  ]
  assert.deepEqual(recapHistoryYears(items, new Date('2026-10-30T10:00:00')), [{ year: 2024, count: 1 }])
  assert.deepEqual(recapHistoryYears([], new Date('2026-10-30T10:00:00')), [], 'un profil vide n’a pas d’historique')
})

test('Le décompte de l’historique est exactement celui du récapitulatif de l’année', () => {
  const items = [
    entry('films', { doneOn: '2022-01-01' }),
    entry('films', { doneOn: '2022-12-31T23:30:00Z' }),
    entry('books', { doneOn: '2021-06-01' }),
    entry('films', { doneOn: '2023-01-01' }),
  ]
  const now = new Date('2026-10-30T10:00:00')
  for (const { year, count } of recapHistoryYears(items, now)) {
    assert.equal(count, recapItems(items, year).length, `l’année ${year} compte comme le récapitulatif`)
  }
})

test('La date simulée du harnais se lit par `?recapOffer=AAAA-MM-JJ`, sinon la date réelle', () => {
  const forced = recapNow('?scenario=full&recapOffer=2026-12-12')
  assert.deepEqual([forced.getFullYear(), forced.getMonth(), forced.getDate()], [2026, 11, 12])
  const fallback = new Date('2026-10-30T10:00:00')
  assert.equal(recapNow('?scenario=full', fallback).getTime(), fallback.getTime())
  assert.equal(recapNow('?recapOffer=2026-13-40', fallback).getTime(), fallback.getTime(), 'une date invalide ne force rien')
})
