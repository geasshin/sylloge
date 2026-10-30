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
const banner = (slug: string) => `https://picsum.photos/seed/sylloge-banner-${slug}/1600/900`
const portrait = (slug: string) => `https://picsum.photos/seed/sylloge-cast-${slug}/200/260`

/**
 * Fiches qui portent déjà une bannière 16:9 : une de chaque médium concerné,
 * pour que les captures et les recettes montrent le bandeau sans avoir à
 * l'ajouter. Aucune recette existante n'ouvre ces deux fiches.
 */
const FILMS_WITH_BANNER = new Set(['Portrait de la jeune fille en feu'])
const SERIES_WITH_BANNER = new Set(['Succession'])

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
  // Associé à TMDB mais sans affiche locale : l'affiche ne vit que dans le cache du fournisseur,
  // comme pour une fiche associée après coup. La fiche et son formulaire doivent la montrer.
  ['Drive My Car', 'Ryūsuke Hamaguchi', 2021, 'terminé', 4.5, 0, 45, false],
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

// ─── Récapitulatif de l'année : une année calibrée ──────────────────────────

/**
 * `count` films terminés, tous datés de l'année 2026, sans visuel ni note. La recette de la proposition
 * du récapitulatif s'en sert pour franchir — ou non — le seuil de vingt œuvres datées : dates fixes,
 * donc stables quelle que soit la date de la machine.
 */
export function seedRecapFilms(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => {
    const watched = new Date(Date.UTC(2026, 1, 1 + index)).toISOString().slice(0, 10)
    return {
      id: `film-recap-${index + 1}`,
      profile_id: QA_PROFILE_ID,
      title: `Film de recette ${index + 1}`,
      original_title: null,
      year: 2026,
      status: 'terminé',
      is_favorite: 0,
      rating: null,
      watched_at: watched,
      personal_note: null,
      director: 'Réalisation de recette',
      summary: null,
      provider_name: null,
      provider_id: null,
      poster_url: null,
      created_at: `${watched}T09:00:00.000Z`,
      updated_at: `${watched}T20:00:00.000Z`,
    }
  })
}

/**
 * Des films terminés sur une dizaine d'années, pour retrouver les récapitulatifs précédents dans les
 * réglages : huit années pleines (dont 2018, une seule œuvre, pour le singulier), l'année 2026 et une
 * année future que rien ne doit jamais afficher. Aucune année n'atteint le seuil de la proposition
 * automatique. Dates fixes, donc stables quelle que soit la date de la machine.
 */
export function seedRecapHistoryFilms(): Row[] {
  const YEARS: Array<[year: number, count: number]> = [
    [2018, 1], [2019, 2], [2020, 3], [2021, 4], [2022, 5], [2023, 6], [2024, 7], [2025, 8], [2026, 9], [2099, 2],
  ]
  return YEARS.flatMap(([year, count]) => Array.from({ length: count }, (_, index) => {
    const watched = `${year}-${String(index + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`
    return {
      id: `film-history-${year}-${index + 1}`,
      profile_id: QA_PROFILE_ID,
      title: `Film de ${year} · ${index + 1}`,
      original_title: null,
      year: Math.min(year - 10, 2026),
      status: 'terminé',
      is_favorite: 0,
      rating: null,
      watched_at: watched,
      personal_note: null,
      director: 'Réalisation de recette',
      summary: null,
      provider_name: null,
      provider_id: null,
      poster_url: null,
      created_at: `${watched}T09:00:00.000Z`,
      updated_at: `${watched}T20:00:00.000Z`,
    }
  }))
}

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
      banner_url: FILMS_WITH_BANNER.has(title) ? banner(`film-${slugify(title)}`) : null,
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
      banner_url: SERIES_WITH_BANNER.has(title) ? banner(`series-${slugify(title)}`) : null,
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

type BookSeed = [title: string, author: string, year: number, category: 'livre' | 'manga', status: string, rating: number | null, favorite: 0 | 1, read: number | null, total: number | null, addedDaysAgo: number, cover: boolean, quotes?: string[]]

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

type ArtworkSeed = [title: string, artist: string, year: number | null, form: string, location: string | null, status: string, favorite: 0 | 1, addedDaysAgo: number, image: string | null, details?: Record<string, string>]

/**
 * Formats d'image variés (27 octobre 2026) : la grille Art suit le format
 * réel de chaque visuel. `image` donne la taille du placeholder (« 900/650 »).
 */
const ARTWORKS: ArtworkSeed[] = [
  ['Les Nymphéas', 'Claude Monet', 1926, 'peinture', 'Musée de l’Orangerie, Paris', 'découverte', 1, 13, '1200/520', { technique: 'Huile sur toile', dimensions: '200 × 1 275 cm', movement: 'Impressionnisme' }],
  ['Nighthawks', 'Edward Hopper', 1942, 'peinture', 'Art Institute of Chicago', 'découverte', 1, 27, '900/490', { technique: 'Huile sur toile', dimensions: '84 × 152 cm' }],
  ['Sous la vague au large de Kanagawa', 'Katsushika Hokusai', 1831, 'gravure', null, 'découverte', 0, 41, '900/610', { technique: 'Gravure sur bois (nishiki-e)', dimensions: '25,7 × 37,9 cm' }],
  ['Derrière la gare Saint-Lazare', 'Henri Cartier-Bresson', 1932, 'photographie', null, 'découverte', 0, 66, '640/900', { process: 'Tirage gélatino-argentique' }],
  ['Le Penseur', 'Auguste Rodin', 1904, 'sculpture', 'Musée Rodin, Paris', 'à découvrir', 0, 88, null, { material: 'Bronze' }],
  ['L’Homme de Vitruve', 'Léonard de Vinci', 1490, 'dessin', 'Gallerie dell’Accademia, Venise', 'à découvrir', 0, 105, '700/960', { technique: 'Plume et encre sur papier', dimensions: '34,4 × 25,5 cm' }],
  ['Fontaine', 'Marcel Duchamp', 1917, 'art conceptuel', null, 'découverte', 0, 135, null, { medium: 'Ready-made' }],
  ['The Artist Is Present', 'Marina Abramović', 2010, 'performance', 'MoMA, New York', 'à découvrir', 0, 180, null, { duration: '736 heures' }],
  ['Le Pont Mirabeau', 'Guillaume Apollinaire', 1912, 'poésie', null, 'découverte', 1, 220, null, {
    collection: 'Alcools',
    text: [
      'Sous le pont Mirabeau coule la Seine',
      '        Et nos amours',
      '    Faut-il qu’il m’en souvienne',
      'La joie venait toujours après la peine',
      '',
      '        Vienne la nuit sonne l’heure',
      '        Les jours s’en vont je demeure',
      '',
      'Les mains dans les mains restons face à face',
      '        Tandis que sous',
      '    Le pont de nos bras passe',
      'Des éternels regards l’onde si lasse',
    ].join('\n'),
  }],
]

export function seedArtworks(): Row[] {
  return ARTWORKS.map(([title, artist, year, form, location, status, favorite, addedDaysAgo, image, details]) => ({
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
    image_url: image ? `https://picsum.photos/seed/sylloge-art-${slugify(title)}/${image}` : null,
    personal_note: null,
    custom_fields: null,
    details: JSON.stringify(details ?? {}),
    created_at: at(addedDaysAgo),
    updated_at: at(Math.max(0, addedDaysAgo - 1)),
  }))
}

// ─── Bibliothèques personnalisées (0021) ─────────────────────────────────────

type CustomSeed = [title: string, creator: string, year: number | null, status: string, rating: number | null, favorite: 0 | 1, current: number | null, total: number | null, addedDaysAgo: number, cover: boolean, details: Record<string, string>, quotes?: string[]]

/** Quatre bibliothèques ajoutées ; les quatre autres restent proposées. */
const CUSTOM_LIBRARIES: Array<[table: string, entries: CustomSeed[]]> = [
  ['comics', [
    ['Watchmen', 'Alan Moore', 1986, 'terminé', 5, 1, 12, 12, 150, true, { format: 'Comics', artist: 'Dave Gibbons', publisher: 'DC Comics' }, ['Qui garde les gardiens ?']],
    ['Maus', 'Art Spiegelman', 1986, 'terminé', 5, 0, 2, 2, 175, true, { format: 'Roman graphique', publisher: 'Pantheon' }],
    ['Saga', 'Brian K. Vaughan', 2012, 'en cours', 4, 0, 3, 11, 200, false, { format: 'Comics', artist: 'Fiona Staples', series: 'Saga', publisher: 'Image' }],
    ['Blacksad', 'Juan Díaz Canales', 2000, 'à découvrir', null, 0, null, 7, 30, true, { format: 'Bande dessinée', artist: 'Juanjo Guarnido', publisher: 'Dargaud' }],
  ]],
  ['music', [
    ['Kind of Blue', 'Miles Davis', 1959, 'terminé', 5, 1, null, null, 3, true, { format: 'Album', genre: 'Jazz modal', label: 'Columbia' }],
    ['Blonde', 'Frank Ocean', 2016, 'terminé', 4.5, 1, null, null, 9, true, { format: 'Album', genre: 'R&B', label: 'Boys Don’t Cry' }],
    ['Promises', 'Floating Points, Pharoah Sanders', 2021, 'en cours', null, 0, null, null, 15, true, { format: 'Album', genre: 'Jazz', label: 'Luaka Bop' }],
    ['Vespertine', 'Björk', 2001, 'à découvrir', null, 0, null, null, 40, false, { format: 'Album', label: 'One Little Indian' }],
  ]],
  ['shows', [
    ['Cyrano de Bergerac', 'Edmond Rostand', null, 'terminé', 4.5, 1, null, null, 21, true, { type: 'Théâtre', direction: 'Denis Podalydès', venue: 'Comédie-Française', city: 'Paris' }],
    ['Le Lac des cygnes', 'Ballet de l’Opéra de Paris', null, 'à découvrir', null, 0, null, null, 8, false, { type: 'Danse', venue: 'Opéra Bastille', city: 'Paris' }],
  ]],
  ['board_games', [
    ['Azul', 'Michael Kiesling', 2017, 'terminé', 4, 0, 14, null, 60, true, { type: 'Familial', publisher: 'Plan B Games', players: '2 à 4', duration: '40 min' }],
    ['Spirit Island', 'R. Eric Reuss', 2017, 'en cours', 4.5, 1, 6, null, 25, true, { type: 'Coopératif', publisher: 'Greater Than Games', players: '1 à 4', duration: '120 min' }],
  ]],
]

export function seedCustomLibraries(): { libraries: Row[]; entries: Array<[table: string, row: Row]>; quotes: Row[] } {
  const libraries: Row[] = []
  const entries: Array<[string, Row]> = []
  const quotes: Row[] = []
  CUSTOM_LIBRARIES.forEach(([table, seeds], position) => {
    libraries.push({ profile_id: QA_PROFILE_ID, library_id: table, position, added_at: at(220 - position) })
    seeds.forEach(([title, creator, year, status, rating, favorite, current, total, addedDaysAgo, hasCover, details, entryQuotes]) => {
      const id = `${table}-${slugify(title)}`
      const square = table === 'music' || table === 'board_games'
      entries.push([table, {
        id,
        profile_id: QA_PROFILE_ID,
        title,
        creator,
        year,
        status,
        rating,
        is_favorite: favorite,
        progress_current: current,
        progress_total: total,
        progress_updated_at: current !== null ? at(addedDaysAgo) : null,
        started_at: status === 'à découvrir' ? null : day(addedDaysAgo + 3),
        finished_at: status === 'terminé' ? day(addedDaysAgo) : null,
        cover_url: hasCover ? `https://picsum.photos/seed/sylloge-${id}/${square ? '600/600' : '400/600'}` : null,
        summary: null,
        personal_note: null,
        details: JSON.stringify(details),
        created_at: at(addedDaysAgo),
        updated_at: at(Math.max(0, addedDaysAgo - 1)),
      }])
      ;(entryQuotes ?? []).forEach((body, quotePosition) => {
        quotes.push({ id: `${id}-quote-${quotePosition}`, comic_id: id, body, position: quotePosition, created_at: at(addedDaysAgo) })
      })
    })
  })
  return { libraries, entries, quotes }
}

export const QA_RECETTE_NOW = new Date(RECETTE_NOW).toISOString()
