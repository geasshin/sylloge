/**
 * Données factices de recette pour le harnais « app complète » (qa-app.html).
 *
 * Les titres, auteurs et années sont des faits publics ; notes, avis, statuts
 * et dates sont inventés. Aucune donnée personnelle réelle n'est utilisée.
 * Les visuels viennent de picsum.photos (photos libres, graine fixe) : ce ne
 * sont pas les vraies affiches, seulement des images au bon format.
 */

export const QA_PROFILE_ID = 'qa-profile'
export const QA_PROFILE_NAME = 'Aurélien'

const poster = (slug: string) => `https://picsum.photos/seed/sylloge-${slug}/400/600`
const landscape = (slug: string) => `https://picsum.photos/seed/sylloge-${slug}/900/650`
const portrait = (slug: string) => `https://picsum.photos/seed/sylloge-cast-${slug}/200/260`

/** Date ISO stable à `daysAgo` jours de la date de recette. */
const RECETTE_NOW = Date.parse('2026-10-16T10:00:00.000Z')
const at = (daysAgo: number) => new Date(RECETTE_NOW - daysAgo * 86_400_000).toISOString()
const day = (daysAgo: number) => at(daysAgo).slice(0, 10)

type Row = Record<string, string | number | null>

const slugify = (value: string) => value
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

// ─── Films ──────────────────────────────────────────────────────────────────

type FilmSeed = [title: string, director: string, year: number, status: string, rating: number | null, favorite: 0 | 1, addedDaysAgo: number, poster: boolean, note?: string, originalTitle?: string]

const FILMS: FilmSeed[] = [
  ['Anatomie d’une chute', 'Justine Triet', 2023, 'terminé', 4.5, 1, 2, true, 'La scène du procès en anglais, puis en français : tout le film tient dans ce glissement.'],
  ['Perfect Days', 'Wim Wenders', 2023, 'terminé', 5, 1, 5, true, 'Un film qui donne envie de regarder les arbres plus longtemps.'],
  ['La Zone d’intérêt', 'Jonathan Glazer', 2023, 'à découvrir', null, 0, 6, true],
  ['Past Lives', 'Celine Song', 2023, 'en attente', null, 0, 9, true],
  ['Les Feuilles mortes', 'Aki Kaurismäki', 2023, 'terminé', 4, 0, 12, true],
  ['Le Règne animal', 'Thomas Cailley', 2023, 'à découvrir', null, 0, 14, false],
  ['Decision to Leave', 'Park Chan-wook', 2022, 'terminé', 4, 0, 20, true, undefined, 'Heojil kyolshim'],
  ['Aftersun', 'Charlotte Wells', 2022, 'terminé', 5, 1, 26, true, 'Revu deux fois. La dernière danse sous la lumière stroboscopique.'],
  ['Tár', 'Todd Field', 2022, 'abandonné', 2.5, 0, 31, true],
  ['Retour à Séoul', 'Davy Chou', 2022, 'à découvrir', null, 0, 38, true],
  ['Drive My Car', 'Ryūsuke Hamaguchi', 2021, 'terminé', 4.5, 0, 45, true],
  ['Petite Maman', 'Céline Sciamma', 2021, 'terminé', 4, 0, 52, false],
  ['Portrait de la jeune fille en feu', 'Céline Sciamma', 2019, 'terminé', 5, 1, 60, true],
  ['Burning', 'Lee Chang-dong', 2018, 'en attente', null, 0, 75, true],
  ['Mulholland Drive', 'David Lynch', 2001, 'terminé', 4.5, 1, 90, true],
  ['Le Voyage de Chihiro', 'Hayao Miyazaki', 2001, 'terminé', 5, 1, 110, true, undefined, 'Sen to Chihiro no kamikakushi'],
  ['In the Mood for Love', 'Wong Kar-wai', 2000, 'terminé', 5, 1, 130, true],
  ['La Haine', 'Mathieu Kassovitz', 1995, 'terminé', 4, 0, 150, true],
  ['Chungking Express', 'Wong Kar-wai', 1994, 'à découvrir', null, 0, 170, true],
  ['Paris, Texas', 'Wim Wenders', 1984, 'terminé', 4.5, 0, 190, true],
  ['Stalker', 'Andreï Tarkovski', 1979, 'en attente', null, 0, 210, true],
  ['Le Charme discret de la bourgeoisie', 'Luis Buñuel', 1972, 'à découvrir', null, 0, 240, false],
  ['Les Parapluies de Cherbourg', 'Jacques Demy', 1964, 'terminé', 3.5, 0, 280, true],
  ['Le Mépris', 'Jean-Luc Godard', 1963, 'terminé', 4, 0, 320, true],
]

/** Films rattachés à une fiche TMDB factice (cache local simulé). */
const TMDB_FILMS = new Set(['Anatomie d’une chute', 'Perfect Days', 'Aftersun', 'In the Mood for Love', 'Mulholland Drive', 'Drive My Car'])

const SUMMARIES: Record<string, string> = {
  'Anatomie d’une chute': 'Sandra, écrivaine allemande, vit avec son mari et leur fils malvoyant dans un chalet isolé. Quand le mari est retrouvé mort au pied de la maison, une enquête s’ouvre pour mort suspecte.',
  'Perfect Days': 'Hirayama nettoie les toilettes publiques de Tokyo. Sa vie simple et réglée lui convient. Une série de rencontres inattendues révèle peu à peu son passé.',
  'Aftersun': 'Sophie se remémore les vacances passées en Turquie avec son père vingt ans plus tôt : des moments de joie partagée, de complicité, et de mélancolie.',
  'In the Mood for Love': 'Hong Kong, 1962. Deux voisins découvrent que leurs conjoints respectifs entretiennent une liaison. Ils se rapprochent, sans jamais céder.',
  'Mulholland Drive': 'Une jeune femme amnésique et une actrice en devenir tentent de démêler un mystère dans un Los Angeles nocturne et trompeur.',
  'Drive My Car': 'Un metteur en scène endeuillé accepte de monter Oncle Vania à Hiroshima. Une jeune chauffeuse silencieuse le conduit chaque jour.',
}

const CAST: Record<string, Array<[string, string]>> = {
  'Anatomie d’une chute': [['Sandra Hüller', 'Sandra'], ['Swann Arlaud', 'Vincent'], ['Milo Machado Graner', 'Daniel'], ['Antoine Reinartz', 'L’avocat général']],
  'Perfect Days': [['Kōji Yakusho', 'Hirayama'], ['Tokio Emoto', 'Takashi'], ['Arisa Nakano', 'Niko']],
  'Aftersun': [['Paul Mescal', 'Calum'], ['Frankie Corio', 'Sophie'], ['Celia Rowlson-Hall', 'Sophie adulte']],
  'In the Mood for Love': [['Tony Leung Chiu-wai', 'Chow Mo-wan'], ['Maggie Cheung', 'Su Li-zhen']],
  'Mulholland Drive': [['Naomi Watts', 'Betty Elms'], ['Laura Harring', 'Rita'], ['Justin Theroux', 'Adam Kesher']],
  'Drive My Car': [['Hidetoshi Nishijima', 'Yūsuke Kafuku'], ['Tōko Miura', 'Misaki Watari'], ['Reika Kirishima', 'Oto Kafuku']],
}

const RUNTIMES: Record<string, number> = {
  'Anatomie d’une chute': 151, 'Perfect Days': 123, 'Aftersun': 102, 'In the Mood for Love': 98, 'Mulholland Drive': 147, 'Drive My Car': 179,
}

export function seedFilms(): { films: Row[]; tmdbCache: Row[] } {
  const films: Row[] = []
  const tmdbCache: Row[] = []
  FILMS.forEach(([title, director, year, status, rating, favorite, addedDaysAgo, hasPoster, note, originalTitle], index) => {
    const id = `film-${slugify(title)}`
    const tmdb = TMDB_FILMS.has(title)
    const watched = status === 'terminé' || status === 'abandonné'
    films.push({
      id,
      profile_id: QA_PROFILE_ID,
      title,
      original_title: originalTitle ?? null,
      year,
      status,
      is_favorite: favorite,
      rating,
      watched_at: watched ? day(addedDaysAgo - 1 > 0 ? addedDaysAgo - 1 : 0) : null,
      personal_note: note ?? null,
      director,
      summary: SUMMARIES[title] ?? null,
      provider_name: tmdb ? 'tmdb' : null,
      provider_id: tmdb ? String(900_000 + index) : null,
      poster_url: hasPoster ? poster(slugify(title)) : null,
      created_at: at(addedDaysAgo),
      updated_at: at(Math.max(0, addedDaysAgo - 1)),
    })
    if (tmdb) {
      const presentation = {
        tmdbId: 900_000 + index,
        title,
        originalTitle: originalTitle ?? null,
        releaseDate: `${year}-05-17`,
        runtimeMinutes: RUNTIMES[title] ?? null,
        synopsis: SUMMARIES[title] ?? null,
        directors: [director],
        posterUrl: poster(slugify(title)),
        alternativePosterUrls: [poster(`${slugify(title)}-alt-1`), poster(`${slugify(title)}-alt-2`), poster(`${slugify(title)}-alt-3`)],
        cast: (CAST[title] ?? []).map(([name, character]) => ({ name, character, portraitUrl: portrait(slugify(name)) })),
      }
      tmdbCache.push({
        film_id: id,
        tmdb_id: 900_000 + index,
        language: 'fr-FR',
        payload_json: JSON.stringify(presentation),
        fetched_at: at(3).slice(0, 19) + 'Z',
        refresh_after: '2026-11-15T10:00:00Z',
        expires_at: '2027-04-16T10:00:00Z',
        selected_poster_url: null,
      })
    }
  })
  return { films, tmdbCache }
}

// ─── Séries ─────────────────────────────────────────────────────────────────

type SeriesSeed = [title: string, showrunner: string, category: 'série télé' | 'animation', status: string, rating: number | null, favorite: 0 | 1, seen: number | null, total: number | null, addedDaysAgo: number, poster: boolean, casting?: string]

const SERIES: SeriesSeed[] = [
  ['Severance', 'Dan Erickson', 'série télé', 'en cours', 4.5, 1, 1, 2, 3, true, 'Adam Scott, Britt Lower, Patricia Arquette'],
  ['The Bear', 'Christopher Storer', 'série télé', 'en cours', 4, 0, 2, 4, 8, true, 'Jeremy Allen White, Ayo Edebiri'],
  ['Arcane', 'Christian Linke, Alex Yee', 'animation', 'vue', 4.5, 1, 2, 2, 15, true],
  ['Le Bureau des légendes', 'Éric Rochant', 'série télé', 'vue', 5, 1, 5, 5, 40, true, 'Mathieu Kassovitz, Sara Giraudeau'],
  ['Succession', 'Jesse Armstrong', 'série télé', 'vue', 4.5, 0, 4, 4, 55, true],
  ['Fleabag', 'Phoebe Waller-Bridge', 'série télé', 'vue', 5, 1, 2, 2, 70, true],
  ['Twin Peaks', 'David Lynch, Mark Frost', 'série télé', 'en cours', 4, 0, 1, 3, 85, true],
  ['The Leftovers', 'Damon Lindelof', 'série télé', 'à voir', null, 0, null, 3, 100, true],
  ['Mad Men', 'Matthew Weiner', 'série télé', 'abandonnée', 3, 0, 3, 7, 140, false],
  ['Better Call Saul', 'Vince Gilligan, Peter Gould', 'série télé', 'à voir', null, 0, null, 6, 160, true],
  ['Cowboy Bebop', 'Shinichirō Watanabe', 'animation', 'vue', 4.5, 0, 1, 1, 200, true],
  ['Neon Genesis Evangelion', 'Hideaki Anno', 'animation', 'à voir', null, 0, null, 1, 230, false],
]

/** Une bibliothèque = une table : Séries et Animation japonaise sont séparées. */
export function seedSeries(): { series: Row[]; anime: Row[] } {
  const series: Row[] = []
  const anime: Row[] = []
  for (const [title, showrunner, category, status, rating, favorite, seen, total, addedDaysAgo, hasPoster, casting] of SERIES) {
    const row: Row = {
      id: `series-${slugify(title)}`,
      profile_id: QA_PROFILE_ID,
      title,
      showrunner,
      casting: casting ?? null,
      summary: null,
      status,
      rating,
      is_favorite: favorite,
      seasons_seen: seen,
      seasons_total: total,
      progress_updated_at: seen !== null ? at(addedDaysAgo) : null,
      started_at: status === 'à voir' ? null : day(addedDaysAgo + 10),
      poster_url: hasPoster ? poster(`series-${slugify(title)}`) : null,
      personal_note: null,
      created_at: at(addedDaysAgo),
      updated_at: at(Math.max(0, addedDaysAgo - 1)),
    }
    if (category === 'animation') anime.push(row)
    else series.push({ ...row, category })
  }
  return { series, anime }
}

// ─── Livres ─────────────────────────────────────────────────────────────────

type BookSeed = [title: string, author: string, year: number, category: 'livre' | 'manga' | 'comics', status: string, rating: number | null, favorite: 0 | 1, read: number | null, total: number | null, addedDaysAgo: number, cover: boolean, quotes?: string[]]

const BOOKS: BookSeed[] = [
  ['Les Années', 'Annie Ernaux', 2008, 'livre', 'lu', 5, 1, null, null, 4, true, ['Toutes les images disparaîtront.']],
  ['Klara et le Soleil', 'Kazuo Ishiguro', 2021, 'livre', 'en cours', null, 0, null, null, 7, true],
  ['La Horde du Contrevent', 'Alain Damasio', 2004, 'livre', 'lu', 4.5, 1, null, null, 18, true],
  ['L’Anomalie', 'Hervé Le Tellier', 2020, 'livre', 'lu', 3.5, 0, null, null, 33, false],
  ['Station Eleven', 'Emily St. John Mandel', 2014, 'livre', 'à lire', null, 0, null, null, 48, true],
  ['Mrs Dalloway', 'Virginia Woolf', 1925, 'livre', 'abandonné', 2, 0, null, null, 64, true],
  ['L’Écume des jours', 'Boris Vian', 1947, 'livre', 'lu', 4, 0, null, null, 120, true],
  ['Vernon Subutex 1', 'Virginie Despentes', 2015, 'livre', 'à lire', null, 0, null, null, 140, false],
  ['Monster', 'Naoki Urasawa', 1994, 'manga', 'en cours', 4.5, 1, 11, 18, 10, true],
  ['Vagabond', 'Takehiko Inoue', 1998, 'manga', 'en cours', 5, 1, 22, 37, 22, true],
  ['Pluto', 'Naoki Urasawa', 2003, 'manga', 'lu', 4.5, 0, 8, 8, 80, true],
  ['Frieren', 'Kanehito Yamada, Tsukasa Abe', 2020, 'manga', 'à lire', null, 0, 0, 13, 95, true],
  ['Watchmen', 'Alan Moore, Dave Gibbons', 1986, 'comics', 'lu', 5, 1, null, null, 150, true],
  ['Maus', 'Art Spiegelman', 1986, 'comics', 'lu', 5, 0, null, null, 175, true],
  ['Saga', 'Brian K. Vaughan, Fiona Staples', 2012, 'comics', 'en cours', 4, 0, 3, 11, 200, false],
]

/** Une bibliothèque = une table : Livres et Mangas sont séparés. */
export function seedBooks(): { books: Row[]; mangas: Row[]; quotes: Row[]; mangaQuotes: Row[] } {
  const books: Row[] = []
  const mangas: Row[] = []
  const quotes: Row[] = []
  const mangaQuotes: Row[] = []
  BOOKS.forEach(([title, author, year, category, status, rating, favorite, read, total, addedDaysAgo, hasCover, bookQuotes]) => {
    const id = `book-${slugify(title)}`
    const row: Row = {
      id,
      profile_id: QA_PROFILE_ID,
      title,
      author,
      year,
      summary: null,
      status,
      rating,
      is_favorite: favorite,
      volumes_read: read,
      volumes_total: total,
      progress_updated_at: read !== null ? at(addedDaysAgo) : null,
      started_at: status === 'à lire' ? null : day(addedDaysAgo + 5),
      cover_url: hasCover ? poster(`book-${slugify(title)}`) : null,
      personal_note: null,
      created_at: at(addedDaysAgo),
      updated_at: at(Math.max(0, addedDaysAgo - 1)),
    }
    const manga = category === 'manga'
    if (manga) mangas.push(row)
    else books.push({ ...row, category })
    ;(bookQuotes ?? []).forEach((body, position) => {
      if (manga) mangaQuotes.push({ id: `${id}-quote-${position}`, manga_id: id, body, position, created_at: at(addedDaysAgo) })
      else quotes.push({ id: `${id}-quote-${position}`, book_id: id, body, position, created_at: at(addedDaysAgo) })
    })
  })
  return { books, mangas, quotes, mangaQuotes }
}

// ─── Jeux ───────────────────────────────────────────────────────────────────

type GameSeed = [title: string, developer: string, platform: string, year: number, status: string, rating: number | null, favorite: 0 | 1, addedDaysAgo: number, cover: boolean]

const GAMES: GameSeed[] = [
  ['Outer Wilds', 'Mobius Digital', 'PC', 2019, 'joué', 5, 1, 11, true],
  ['Baldur’s Gate 3', 'Larian Studios', 'PC', 2023, 'en cours', 4.5, 0, 16, true],
  ['Hades', 'Supergiant Games', 'Switch', 2020, 'joué', 4.5, 1, 35, true],
  ['Disco Elysium', 'ZA/UM', 'PC', 2019, 'joué', 5, 1, 58, true],
  ['The Legend of Zelda: Tears of the Kingdom', 'Nintendo', 'Switch', 2023, 'en cours', null, 0, 72, true],
  ['Elden Ring', 'FromSoftware', 'PS5', 2022, 'abandonné', 3, 0, 98, true],
  ['Return of the Obra Dinn', 'Lucas Pope', 'PC', 2018, 'à jouer', null, 0, 125, false],
  ['Celeste', 'Maddy Makes Games', 'Switch', 2018, 'joué', 4, 0, 160, true],
  ['Hollow Knight', 'Team Cherry', 'Switch', 2017, 'à jouer', null, 0, 190, true],
  ['Final Fantasy VII', 'Square', 'PS1', 1997, 'regardé', null, 0, 260, false],
]

export function seedGames(): Row[] {
  return GAMES.map(([title, developer, platform, year, status, rating, favorite, addedDaysAgo, hasCover]) => ({
    id: `game-${slugify(title)}`,
    profile_id: QA_PROFILE_ID,
    title,
    developer,
    platform,
    year,
    status,
    rating,
    is_favorite: favorite,
    played_at: status === 'joué' ? day(addedDaysAgo - 1 > 0 ? addedDaysAgo - 1 : 0) : null,
    cover_url: hasCover ? poster(`game-${slugify(title)}`) : null,
    personal_note: null,
    created_at: at(addedDaysAgo),
    updated_at: at(Math.max(0, addedDaysAgo - 1)),
  }))
}

// ─── Art ────────────────────────────────────────────────────────────────────

type ArtworkSeed = [title: string, artist: string, year: number | null, form: string, location: string | null, status: string, favorite: 0 | 1, addedDaysAgo: number, image: boolean]

const ARTWORKS: ArtworkSeed[] = [
  ['Les Nymphéas', 'Claude Monet', 1926, 'peinture', 'Musée de l’Orangerie, Paris', 'découverte', 1, 13, true],
  ['Nighthawks', 'Edward Hopper', 1942, 'peinture', 'Art Institute of Chicago', 'découverte', 1, 27, true],
  ['Sous la vague au large de Kanagawa', 'Katsushika Hokusai', 1831, 'gravure', null, 'découverte', 0, 41, true],
  ['Derrière la gare Saint-Lazare', 'Henri Cartier-Bresson', 1932, 'photographie', null, 'découverte', 0, 66, true],
  ['Le Penseur', 'Auguste Rodin', 1904, 'sculpture', 'Musée Rodin, Paris', 'à découvrir', 0, 88, false],
  ['L’Homme de Vitruve', 'Léonard de Vinci', 1490, 'dessin', 'Gallerie dell’Accademia, Venise', 'à découvrir', 0, 105, true],
  ['Fontaine', 'Marcel Duchamp', 1917, 'art conceptuel', null, 'découverte', 0, 135, false],
  ['The Artist Is Present', 'Marina Abramović', 2010, 'performance', 'MoMA, New York', 'à découvrir', 0, 180, false],
  ['Le Pont Mirabeau', 'Guillaume Apollinaire', 1912, 'poésie', null, 'découverte', 1, 220, false],
]

export function seedArtworks(): Row[] {
  return ARTWORKS.map(([title, artist, year, form, location, status, favorite, addedDaysAgo, hasImage]) => ({
    id: `artwork-${slugify(title)}`,
    profile_id: QA_PROFILE_ID,
    title,
    artist,
    year,
    form,
    location,
    exhibition: null,
    status,
    is_favorite: favorite,
    discovered_at: status === 'découverte' ? day(addedDaysAgo) : null,
    image_url: hasImage ? landscape(`art-${slugify(title)}`) : null,
    personal_note: null,
    custom_fields: null,
    created_at: at(addedDaysAgo),
    updated_at: at(Math.max(0, addedDaysAgo - 1)),
  }))
}

export const QA_RECETTE_NOW = new Date(RECETTE_NOW).toISOString()
