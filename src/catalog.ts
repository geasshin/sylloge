export type FilmStatus = 'À découvrir' | 'Terminé'
export type SeriesStatus = 'À découvrir' | 'Terminée' | 'En pause'
export type FilmFilter = 'Tout' | 'À découvrir' | 'Terminés' | 'Favoris'
export type SeriesFilter = 'Tout' | 'À découvrir' | 'Terminées' | 'En pause' | 'Favoris'
export type Page = 'home' | 'films' | 'series'

export type Rating = {
  score: number
  label: string
}

export type Film = {
  id: string
  title: string
  director?: string
  year?: number
  status: FilmStatus
  rating?: Rating
  favorite?: boolean
  watchedAt?: string
  summary?: string
  poster: string
}

export type Series = {
  id: string
  title: string
  creator?: string
  kind?: string
  status: SeriesStatus
  rating?: Rating
  favorite?: boolean
  completedAt?: string
  summary?: string
  poster: string
}

export type RecentItem =
  | { medium: 'Film'; date: string; item: Film }
  | { medium: 'Série'; date: string; item: Series }

// Échantillon réel issu des trackers Notion Movies_DB et Shows_DB, consulté le 17 juillet 2026.
// Les champs absents dans Notion restent volontairement absents ici : aucune durée, saison, pays
// ou note personnelle n'est inventé pour le prototype.
export const films: Film[] = [
  {
    id: 'paddington-au-perou',
    title: 'Paddington au Pérou',
    director: 'Dougal Wilson',
    year: 2024,
    status: 'Terminé',
    rating: { score: 7, label: 'Très bon' },
    watchedAt: '2026-01-09',
    summary: 'Alors que Paddington rend visite à sa tante Lucy, la famille Brown et notre ours préféré plongent dans un voyage inattendu à travers la forêt amazonienne et jusqu’aux sommets du Machu Picchu.',
    poster: '/posters/paddington-au-perou.jpg',
  },
  {
    id: 'drive',
    title: 'Drive',
    director: 'Nicolas Winding Refn',
    year: 2011,
    status: 'Terminé',
    rating: { score: 8, label: 'Excellent' },
    favorite: true,
    watchedAt: '2025-10-13',
    summary: 'Le jour, un cascadeur solitaire travaille pour le cinéma à Hollywood. La nuit, il conduit pour des truands selon son propre code de conduite.',
    poster: '/posters/drive.jpg',
  },
  {
    id: 'une-bataille-apres-lautre',
    title: 'Une bataille après l’autre',
    director: 'Paul Thomas Anderson',
    year: 2025,
    status: 'Terminé',
    rating: { score: 9, label: 'Chef-d’œuvre' },
    favorite: true,
    watchedAt: '2025-09-29',
    summary: 'Ancien révolutionnaire désabusé et paranoïaque, Bob vit en marge de la société avec sa fille Willa. Quand son ennemi juré refait surface, il doit affronter les conséquences de son passé.',
    poster: '/posters/une-bataille-apres-lautre.jpg',
  },
  {
    id: 'the-phoenician-scheme',
    title: 'The Phoenician Scheme',
    director: 'Wes Anderson',
    year: 2025,
    status: 'Terminé',
    rating: { score: 7, label: 'Très bon' },
    watchedAt: '2025-06-29',
    summary: 'En 1950, l’industriel Anatole Korda survit à une nouvelle tentative d’assassinat alors qu’il prépare un projet d’infrastructure aux enjeux vertigineux.',
    poster: '/posters/the-phoenician-scheme.jpg',
  },
  {
    id: 'pauvres-creatures',
    title: 'Pauvres Créatures',
    director: 'Yórgos Lánthimos',
    year: 2023,
    status: 'Terminé',
    rating: { score: 8, label: 'Excellent' },
    watchedAt: '2025-03-19',
    summary: 'Bella, ramenée à la vie par le docteur Godwin Baxter, découvre le monde et s’émancipe des préjugés de son époque.',
    poster: '/posters/pauvres-creatures.jpg',
  },
  {
    id: 'portrait-de-la-jeune-fille-en-feu',
    title: 'Portrait de la jeune fille en feu',
    director: 'Céline Sciamma',
    year: 2019,
    status: 'Terminé',
    rating: { score: 8, label: 'Excellent' },
    favorite: true,
    watchedAt: '2025-03-18',
    summary: 'En 1770, Marianne doit réaliser secrètement le portrait de mariage d’Héloïse, qui refuse de poser.',
    poster: '/posters/portrait-de-la-jeune-fille-en-feu.jpg',
  },
  {
    id: 'la-jeune-femme-a-laiguille',
    title: 'La Jeune femme à l’aiguille',
    director: 'Magnus von Horn',
    year: 2025,
    status: 'Terminé',
    rating: { score: 9, label: 'Chef-d’œuvre' },
    favorite: true,
    watchedAt: '2025-03-10',
    summary: 'À Copenhague en 1918, Karoline lutte pour survivre et rencontre Dagmar, qui dirige une agence d’adoption clandestine.',
    poster: '/posters/la-jeune-femme-a-laiguille.jpg',
  },
  {
    id: 'bugonia',
    title: 'Bugonia',
    status: 'À découvrir',
    poster: '/posters/bugonia.jpg',
  },
]

export const series: Series[] = [
  {
    id: 'empathie',
    title: 'Empathie',
    creator: 'Florence Longpré',
    kind: 'Série',
    status: 'Terminée',
    rating: { score: 6, label: 'Bon' },
    completedAt: '2025-10-22',
    summary: 'Suzanne, ancienne criminologue devenue psychiatre, arrive à l’Institut psychiatrique Mont-Royal et rencontre des patients qui ne laissent personne indifférent.',
    poster: '/posters/empathie.jpg',
  },
  {
    id: 'andor',
    title: 'Andor',
    creator: 'Tony Gilroy',
    kind: 'Série',
    status: 'À découvrir',
    summary: 'Une série prequel consacrée au personnage de Cassian Andor, apparu au cinéma dans Rogue One.',
    poster: '/posters/andor.jpg',
  },
  {
    id: 'blue-eye-samurai',
    title: 'Blue Eye Samurai',
    creator: 'Michael Green, Amber Noizumi',
    kind: 'Animation japonaise',
    status: 'En pause',
    rating: { score: 9, label: 'Chef-d’œuvre' },
    favorite: true,
    summary: 'Un maître d’armes métis vit sous une fausse identité et cherche à se venger dans le Japon de l’époque d’Edo.',
    poster: '/posters/blue-eye-samurai.jpg',
  },
  {
    id: 'fleabag',
    title: 'Fleabag',
    creator: 'Phoebe Waller-Bridge',
    kind: 'Série',
    status: 'Terminée',
    rating: { score: 8, label: 'Excellent' },
    favorite: true,
    summary: 'Le quotidien drôle et touchant de Fleabag, une femme à la répartie cinglante, en colère et assaillie par le deuil.',
    poster: '/posters/fleabag.jpg',
  },
  {
    id: 'shogun',
    title: 'Shōgun',
    creator: 'Justin Marks, Rachel Kondo',
    kind: 'Série',
    status: 'Terminée',
    rating: { score: 8, label: 'Excellent' },
    summary: 'Au Japon en 1600, John Blackthorne arrive au cœur d’une guerre civile où les destins de Toranaga et de sa traductrice Mariko se nouent.',
    poster: '/posters/shogun.jpg',
  },
  {
    id: 'bojack-horseman',
    title: 'BoJack Horseman',
    creator: 'Raphael Bob-Waksberg',
    kind: 'Série',
    status: 'Terminée',
    rating: { score: 9, label: 'Chef-d’œuvre' },
    favorite: true,
    summary: 'À Los Angeles, BoJack essaie tant bien que mal de raviver une gloire passée au milieu de ses amis et de son amertume.',
    poster: '/posters/bojack-horseman.jpg',
  },
  {
    id: 'severance',
    title: 'Severance',
    creator: 'Dan Erickson',
    kind: 'Série',
    status: 'En pause',
    rating: { score: 9, label: 'Chef-d’œuvre' },
    summary: 'Mark Scout travaille chez Lumon, où une opération sépare les souvenirs professionnels des souvenirs privés.',
    poster: '/posters/severance.jpg',
  },
  {
    id: 'dark',
    title: 'Dark',
    creator: 'Baran bo Odar, Jantje Friese',
    kind: 'Série',
    status: 'Terminée',
    rating: { score: 10, label: 'Perfection' },
    favorite: true,
    poster: '/posters/dark.jpg',
  },
]

export const recentlyLived = ([
  { medium: 'Film', date: '2026-01-09', item: films[0] },
  { medium: 'Film', date: '2025-10-13', item: films[1] },
  { medium: 'Série', date: '2025-10-22', item: series[0] },
  { medium: 'Film', date: '2025-09-29', item: films[2] },
] satisfies RecentItem[]).sort((a, b) => b.date.localeCompare(a.date))

export const filmFilters: FilmFilter[] = ['Tout', 'À découvrir', 'Terminés', 'Favoris']
export const seriesFilters: SeriesFilter[] = ['Tout', 'À découvrir', 'Terminées', 'En pause', 'Favoris']

export function formatDate(value?: string) {
  if (!value) return undefined
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr')
}

export function filterFilms(items: readonly Film[], query: string, filter: FilmFilter) {
  const normalizedQuery = normalize(query.trim())
  return items.filter((film) => {
    const matchesQuery = normalize(`${film.title} ${film.director ?? ''}`).includes(normalizedQuery)
    const matchesFilter = filter === 'Tout'
      || (filter === 'Favoris' ? Boolean(film.favorite) : filter === 'Terminés' ? film.status === 'Terminé' : film.status === 'À découvrir')
    return matchesQuery && matchesFilter
  })
}

export function filterSeries(items: readonly Series[], query: string, filter: SeriesFilter) {
  const normalizedQuery = normalize(query.trim())
  return items.filter((show) => {
    const matchesQuery = normalize(`${show.title} ${show.creator ?? ''}`).includes(normalizedQuery)
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
