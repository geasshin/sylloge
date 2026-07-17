export type FilmStatus = 'À découvrir' | 'Terminé'
export type SeriesStatus = 'À découvrir' | 'En cours' | 'Terminée'
export type FilmFilter = 'Tout' | 'À découvrir' | 'Terminés' | 'Favoris'
export type SeriesFilter = 'Tout' | 'À découvrir' | 'En cours' | 'Terminées' | 'Favoris'
export type Page = 'home' | 'films' | 'series'

export type Film = {
  id: string
  title: string
  director: string
  year: number
  duration: string
  status: FilmStatus
  rating?: number
  favorite?: boolean
  watchedAt?: string
  note?: string
  country: string
  palette: string
  mark: string
  cover?: 'text'
}

export type Series = {
  id: string
  title: string
  creator: string
  years: string
  status: SeriesStatus
  seasonsSeen: number
  seasonsTotal?: number
  rating?: number
  favorite?: boolean
  lastWatchedAt?: string
  personalNote?: string
  summary: string
  country: string
  palette: string
  mark: string
}

export const films: Film[] = [
  { id: 'aftersun', title: 'Aftersun', director: 'Charlotte Wells', year: 2022, duration: '1 h 42', status: 'Terminé', rating: 4.5, favorite: true, watchedAt: '12 juillet 2026', country: 'Royaume-Uni', palette: 'sunset', mark: 'AF', note: "Je repense surtout à ce que le film laisse hors champ. La douceur des vacances devient peu à peu une manière d’approcher une absence, sans jamais la souligner. La dernière danse reste avec moi, comme un souvenir dont on ne sait plus très bien à qui il appartient." },
  { id: 'in-the-mood', title: 'In the Mood for Love', director: 'Wong Kar-wai', year: 2000, duration: '1 h 38', status: 'Terminé', rating: 5, favorite: true, watchedAt: '4 juillet 2026', country: 'Hong Kong', palette: 'red', mark: '花樣年華' },
  { id: 'perfect-days', title: 'Perfect Days', director: 'Wim Wenders', year: 2023, duration: '2 h 04', status: 'Terminé', rating: 4, watchedAt: '28 juin 2026', country: 'Japon', palette: 'sky', mark: '日々' },
  { id: 'the-zone', title: 'La Zone d’intérêt', director: 'Jonathan Glazer', year: 2023, duration: '1 h 45', status: 'Terminé', rating: 4.5, watchedAt: '17 juin 2026', country: 'Royaume-Uni', palette: 'garden', mark: 'TZ' },
  { id: 'past-lives', title: 'Past Lives', director: 'Celine Song', year: 2023, duration: '1 h 46', status: 'À découvrir', country: 'États-Unis', palette: 'lavender', mark: 'P', note: "À voir un soir où l’on a envie d’un film de conversations, de temps qui passe et de villes lointaines." },
  { id: 'drive-my-car', title: 'Drive My Car', director: 'Ryūsuke Hamaguchi', year: 2021, duration: '2 h 59', status: 'Terminé', rating: 4, watchedAt: '2 juin 2026', country: 'Japon', palette: 'car', mark: 'DM' },
  { id: 'anatomy', title: 'Anatomie d’une chute', director: 'Justine Triet', year: 2023, duration: '2 h 31', status: 'Terminé', rating: 4, watchedAt: '23 mai 2026', country: 'France', palette: 'snow', mark: 'A' },
  { id: 'portrait', title: 'Portrait de la jeune fille en feu', director: 'Céline Sciamma', year: 2019, duration: '2 h 02', status: 'Terminé', rating: 5, favorite: true, watchedAt: '11 mai 2026', country: 'France', palette: 'fire', mark: 'P' },
  { id: 'mishima', title: 'Mishima', director: 'Paul Schrader', year: 1985, duration: '2 h 00', status: 'À découvrir', country: 'États-Unis', palette: 'mishima', mark: 'M' },
  { id: 'decision', title: 'Decision to Leave', director: 'Park Chan-wook', year: 2022, duration: '2 h 19', status: 'Terminé', rating: 4.5, watchedAt: '27 avril 2026', country: 'Corée du Sud', palette: 'sea', mark: '헤' },
  { id: 'petite-maman', title: 'Petite maman', director: 'Céline Sciamma', year: 2021, duration: '1 h 12', status: 'Terminé', rating: 4.5, watchedAt: '9 avril 2026', country: 'France', palette: 'woods', mark: 'PM' },
  { id: 'dogtooth', title: 'Canine', director: 'Yórgos Lánthimos', year: 2009, duration: '1 h 37', status: 'À découvrir', country: 'Grèce', palette: 'textual', mark: 'ΚΥΝΟΔΟΝΤΑΣ', cover: 'text' },
  { id: 'paris-texas', title: 'Paris, Texas', director: 'Wim Wenders', year: 1984, duration: '2 h 25', status: 'Terminé', rating: 5, favorite: true, watchedAt: '28 mars 2026', country: 'Allemagne', palette: 'desert', mark: 'PT' },
  { id: 'memoria', title: 'Memoria', director: 'Apichatpong Weerasethakul', year: 2021, duration: '2 h 16', status: 'À découvrir', country: 'Colombie', palette: 'memoria', mark: 'M' },
]

export const series: Series[] = [
  { id: 'the-bear', title: 'The Bear', creator: 'Christopher Storer', years: '2022 à aujourd’hui', status: 'En cours', seasonsSeen: 3, seasonsTotal: 4, rating: 4.5, favorite: true, lastWatchedAt: '29 juin 2026', country: 'États-Unis', palette: 'kitchen', mark: '03', summary: 'Reprendre avant que les voix, le métal et le rythme de la cuisine ne s’éloignent trop.' },
  { id: 'severance', title: 'Severance', creator: 'Dan Erickson', years: '2022 à aujourd’hui', status: 'En cours', seasonsSeen: 1, seasonsTotal: 2, rating: 4.5, lastWatchedAt: '18 juin 2026', country: 'États-Unis', palette: 'corridor', mark: 'LUMON', summary: 'Une saison vue, et cette impression nette que chaque couloir en cache un autre.' },
  { id: 'fleabag', title: 'Fleabag', creator: 'Phoebe Waller-Bridge', years: '2016-2019', status: 'Terminée', seasonsSeen: 2, seasonsTotal: 2, rating: 5, favorite: true, lastWatchedAt: '5 juin 2026', country: 'Royaume-Uni', palette: 'stage', mark: 'FB', summary: 'Deux saisons brèves, précises, qui savent exactement quand détourner le regard.', personalNote: 'La drôlerie ne protège jamais complètement de ce qui arrive. Tout tient dans l’adresse au public, puis dans la façon délicate dont ce refuge finit par devenir inutile.' },
  { id: 'atlanta', title: 'Atlanta', creator: 'Donald Glover', years: '2016-2022', status: 'Terminée', seasonsSeen: 4, seasonsTotal: 4, rating: 4.5, lastWatchedAt: '22 mai 2026', country: 'États-Unis', palette: 'city', mark: 'ATL', summary: 'Une ville familière et impossible, traversée comme un rêve qui change ses propres règles.', personalNote: 'La série peut être drôle, inquiétante ou presque abstraite sans jamais perdre ses personnages. Elle laisse surtout une manière nouvelle de regarder les lieux ordinaires.' },
  { id: 'pachinko', title: 'Pachinko', creator: 'Soo Hugh', years: '2022 à aujourd’hui', status: 'En cours', seasonsSeen: 2, seasonsTotal: 2, rating: 4, lastWatchedAt: '8 mai 2026', country: 'Corée du Sud', palette: 'tide', mark: '波', summary: 'Deux saisons vues. Garder le fil des générations avant la suite.' },
  { id: 'twin-peaks', title: 'Twin Peaks', creator: 'Mark Frost et David Lynch', years: '1990-2017', status: 'Terminée', seasonsSeen: 3, seasonsTotal: 3, rating: 5, favorite: true, lastWatchedAt: '20 avril 2026', country: 'États-Unis', palette: 'lodge', mark: 'TP', summary: 'Une petite ville, trois saisons et des images qui continuent de revenir seules.', personalNote: 'Le feuilleton, le burlesque et la peur habitent le même lieu. Certaines scènes sont devenues moins des souvenirs que des pièces dans lesquelles on peut encore entrer.' },
  { id: 'the-leftovers', title: 'The Leftovers', creator: 'Damon Lindelof et Tom Perrotta', years: '2014-2017', status: 'Terminée', seasonsSeen: 3, seasonsTotal: 3, rating: 5, favorite: true, lastWatchedAt: '2 avril 2026', country: 'États-Unis', palette: 'weather', mark: '2%', summary: 'Une disparition impossible et tout ce que les vivants inventent pour continuer.', personalNote: 'La série accueille le doute au lieu de le résoudre. À la fin, ce qui compte n’est pas la réponse mais le choix fragile de croire une personne.' },
  { id: 'shogun', title: 'Shōgun', creator: 'Rachel Kondo et Justin Marks', years: '2024 à aujourd’hui', status: 'À découvrir', seasonsSeen: 0, seasonsTotal: 1, country: 'États-Unis', palette: 'ink', mark: '将軍', summary: 'À commencer pour la durée, les silences et la précision annoncée du monde.' },
  { id: 'i-may-destroy-you', title: 'I May Destroy You', creator: 'Michaela Coel', years: '2020', status: 'Terminée', seasonsSeen: 1, seasonsTotal: 1, rating: 4.5, lastWatchedAt: '11 mars 2026', country: 'Royaume-Uni', palette: 'night', mark: 'IMDY', summary: 'Une saison qui déplace sans cesse le point de vue et refuse les conclusions simples.', personalNote: 'La série reste mobile, libre, parfois inconfortable. Sa force vient de tout ce qu’elle autorise à être contradictoire dans une même expérience.' },
]

export const filmFilters: FilmFilter[] = ['Tout', 'À découvrir', 'Terminés', 'Favoris']
export const seriesFilters: SeriesFilter[] = ['Tout', 'À découvrir', 'En cours', 'Terminées', 'Favoris']

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr')
}

export function filterFilms(items: readonly Film[], query: string, filter: FilmFilter) {
  const normalizedQuery = normalize(query.trim())
  return items.filter((film) => {
    const matchesQuery = normalize(`${film.title} ${film.director}`).includes(normalizedQuery)
    const matchesFilter = filter === 'Tout'
      || (filter === 'Favoris' ? Boolean(film.favorite) : filter === 'Terminés' ? film.status === 'Terminé' : film.status === 'À découvrir')
    return matchesQuery && matchesFilter
  })
}

export function filterSeries(items: readonly Series[], query: string, filter: SeriesFilter) {
  const normalizedQuery = normalize(query.trim())
  return items.filter((show) => {
    const matchesQuery = normalize(`${show.title} ${show.creator}`).includes(normalizedQuery)
    const matchesFilter = filter === 'Tout'
      || (filter === 'Favoris' ? Boolean(show.favorite) : filter === 'Terminées' ? show.status === 'Terminée' : show.status === filter)
    return matchesQuery && matchesFilter
  })
}

export type AppRoute = { page: Page; selectedId: string | null }

export function routeFromHash(hash: string): AppRoute {
  const match = hash.match(/^#(films|series)(?:\/([^/?]+))?/)
  if (!match) return { page: 'home', selectedId: null }
  return { page: match[1] as 'films' | 'series', selectedId: match[2] ? decodeURIComponent(match[2]) : null }
}

export function libraryHash(page: Exclude<Page, 'home'>) {
  return `#${page}`
}

export function detailHash(page: Exclude<Page, 'home'>, id: string) {
  return `#${page}/${encodeURIComponent(id)}`
}
