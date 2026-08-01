/**
 * Vues de bibliothèque partagées par les cinq médiums (jalon 0.4.19).
 *
 * Chaque vue a le même sens partout où elle existe :
 * - `all` : collection complète, ordre canonique par titre ;
 * - `recent` : dernière progression métier quand elle existe (saisons, tomes),
 *   sinon dernière modification, décroissante ;
 * - `favorites` : coups de cœur uniquement ;
 * - `ranking` : note décroissante, les œuvres sans note en fin de liste.
 *
 * Les statuts terminaux (terminé, lu, joué, découvert) ne sont pas des vues :
 * ils relèvent des critères de filtre propres à chaque médium.
 */
export const LIBRARY_VIEWS = ['all', 'recent', 'favorites', 'ranking'] as const

export type LibraryView = (typeof LIBRARY_VIEWS)[number]

export const LIBRARY_VIEW_LABELS: Record<LibraryView, string> = {
  all: 'Tous',
  recent: 'Récents',
  favorites: 'Favoris',
  ranking: 'Classement',
}

/** Films, Séries, Livres et Jeux possèdent une note /5 : les quatre vues existent. */
export const RATED_LIBRARY_VIEWS: readonly LibraryView[] = LIBRARY_VIEWS

/** L'Art n'a pas de note : le classement par note n'existe jamais pour ce médium. */
export const UNRATED_LIBRARY_VIEWS: readonly LibraryView[] = ['all', 'recent', 'favorites']
