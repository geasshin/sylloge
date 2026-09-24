import { deserializeSavedViewCriteria, type SavedView, type SavedViewCriteria, type SavedViewMedium } from '../domain/savedViews.ts'

/**
 * Harnais de recette navigateur uniquement : aucune base SQLite réelle n'est
 * ouverte. Le composant de production reste inchangé et les scénarios d'écriture
 * de vues enregistrées restent couverts par les tests du dépôt.
 */
const qaSavedViews: SavedView[] = [
  {
    id: 'saved-recent-long', profileId: 'qa-profile', medium: 'films', name: 'Vue enregistrée très longue',
    criteria: { filters: { status: 'all', statusGroup: 'consumed', favoritesOnly: true, minRating: 4, year: null, personalDateFrom: null, specificText: '', location: '', exhibition: '' }, sort: { column: 'rating', direction: 'desc' }, mediumFilter: 'all' },
    createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z',
  },
  {
    id: 'saved-2', profileId: 'qa-profile', medium: 'films', name: 'Nuits au cinéma',
    criteria: { filters: { status: 'all', statusGroup: 'consumed', favoritesOnly: false, minRating: null, year: null, personalDateFrom: null, specificText: '', location: '', exhibition: '' }, sort: { column: 'personalDate', direction: 'desc' }, mediumFilter: 'all' },
    createdAt: '2026-09-02T12:00:00.000Z', updatedAt: '2026-09-02T12:00:00.000Z',
  },
  {
    id: 'saved-3', profileId: 'qa-profile', medium: 'films', name: 'Avant 2010',
    criteria: { filters: { status: 'all', statusGroup: 'consumed', favoritesOnly: false, minRating: null, year: 2010, personalDateFrom: null, specificText: '', location: '', exhibition: '' }, sort: { column: 'title', direction: 'asc' }, mediumFilter: 'all' },
    createdAt: '2026-09-03T12:00:00.000Z', updatedAt: '2026-09-03T12:00:00.000Z',
  },
  {
    id: 'saved-4', profileId: 'qa-profile', medium: 'films', name: 'Coups de cœur',
    criteria: { filters: { status: 'all', statusGroup: 'consumed', favoritesOnly: true, minRating: null, year: null, personalDateFrom: null, specificText: '', location: '', exhibition: '' }, sort: { column: 'title', direction: 'asc' }, mediumFilter: 'all' },
    createdAt: '2026-09-04T12:00:00.000Z', updatedAt: '2026-09-04T12:00:00.000Z',
  },
]

function clone(value: string): SavedViewCriteria {
  return deserializeSavedViewCriteria('films', value)
}

export const savedViewsRepository = {
  async list(_profileId: string, medium: SavedViewMedium): Promise<SavedView[]> {
    return qaSavedViews.filter((view) => view.medium === medium).map((view) => ({ ...view, criteria: clone(JSON.stringify(view.criteria)) }))
  },
  async create(_profileId: string, medium: SavedViewMedium, name: string, criteria: SavedViewCriteria): Promise<SavedView> {
    const now = new Date().toISOString()
    return { id: `saved-${now}`, profileId: 'qa-profile', medium, name: name.trim(), criteria, createdAt: now, updatedAt: now }
  },
  async rename(_profileId: string, _id: string, _name: string): Promise<void> {},
  async remove(_profileId: string, _id: string): Promise<void> {},
}
