// Services qui acceptent un import de fichier, par bibliothèque.
//
// Source unique des libellés, des lignes d'aide et des pages d'import : la matrice vérifiée du
// 30 octobre 2026 (docs/EXPORTS_SERVICES.md). L'ordre est celui de l'utilité pour la bibliothèque
// ouverte, jamais l'ordre alphabétique.
//
// Un service n'apparaît que si son format est documenté et que Sylloge possède les données qu'il
// demande : Jeux et Art n'ont aucun import de fichier chez les services relevés, et les bibliothèques
// qui n'ont pas de service gardent seulement la sauvegarde complète.

import type { CsvCollectionMedium } from './collectionCsvTransfer.ts'

export type ExportServiceId =
  | 'letterboxd'
  | 'letterboxd-watchlist'
  | 'senscritique'
  | 'simkl'
  | 'storygraph'
  | 'hardcover'

export type ExportService = {
  id: ExportServiceId
  /** Nom du service, identique dans les deux langues : jamais traduit. */
  name: string
  /** Libellé du bouton, traduit au rendu. */
  label: string
  /** Ce que le fichier contient, ce qu'il ne contient pas, et où l'importer. */
  help: string
  /** Page d'import officielle du service. */
  importUrl: string
  linkLabel: string
}

const LETTERBOXD_IMPORT = 'https://letterboxd.com/import/'

/** Noms de service : des marques, identiques dans les deux langues, jamais passées par t(). */
export const SERVICE_NAMES: Record<ExportServiceId, string> = {
  letterboxd: 'Letterboxd',
  'letterboxd-watchlist': 'Letterboxd',
  senscritique: 'SensCritique',
  simkl: 'Simkl',
  storygraph: 'The StoryGraph',
  hardcover: 'Hardcover',
}

export function exportServicesFor(medium: CsvCollectionMedium): ExportService[] {
  if (medium === 'films') {
    return [
      {
        id: 'letterboxd',
        name: SERVICE_NAMES.letterboxd,
        label: 'Letterboxd · films vus',
        help: 'Films terminés avec note, date de visionnage et avis, au format d’import Letterboxd. Ce fichier s’importe aussi dans Trakt, qui accepte un export Letterboxd.',
        importUrl: LETTERBOXD_IMPORT,
        linkLabel: 'Importer sur Letterboxd ↗',
      },
      {
        id: 'letterboxd-watchlist',
        name: SERVICE_NAMES.letterboxd,
        label: 'Letterboxd · liste à voir',
        help: 'Films à découvrir, dans un second fichier : la liste « à voir » de Letterboxd s’importe séparément des films vus.',
        importUrl: LETTERBOXD_IMPORT,
        linkLabel: 'Importer sur Letterboxd ↗',
      },
      {
        id: 'senscritique',
        name: SERVICE_NAMES.senscritique,
        label: 'SensCritique · films',
        help: 'Sept colonnes officielles : titre, année, note entière sur 10, envie de voir, coup de cœur, vu. Aucun identifiant : SensCritique apparie sur le titre et l’année.',
        importUrl: 'https://www.senscritique.com/parametres/compte',
        linkLabel: 'Importer sur SensCritique ↗',
      },
      {
        id: 'simkl',
        name: SERVICE_NAMES.simkl,
        label: 'Simkl · films',
        help: 'CSV d’import Simkl : Type movie, identifiant TMDB, statut, note sur 10, date de visionnage et avis.',
        importUrl: 'https://simkl.com/apps/import/csv',
        linkLabel: 'Importer sur Simkl ↗',
      },
    ]
  }

  if (medium === 'series') {
    return [
      {
        id: 'senscritique',
        name: SERVICE_NAMES.senscritique,
        label: 'SensCritique · séries',
        help: 'Sept colonnes officielles : titre, note entière sur 10, envie de voir, coup de cœur, vu. Aucune année : une série n’en a pas dans Sylloge, l’appariement se fait sur le titre.',
        importUrl: 'https://www.senscritique.com/parametres/compte',
        linkLabel: 'Importer sur SensCritique ↗',
      },
      {
        id: 'simkl',
        name: SERVICE_NAMES.simkl,
        label: 'Simkl · séries',
        help: 'CSV d’import Simkl : Type tv, identifiant TMDB, statut, note sur 10 et avis. Le dernier épisode vu reste vide : Sylloge compte des saisons.',
        importUrl: 'https://simkl.com/apps/import/csv',
        linkLabel: 'Importer sur Simkl ↗',
      },
    ]
  }

  if (medium === 'anime') {
    return [
      {
        id: 'simkl',
        name: SERVICE_NAMES.simkl,
        label: 'Simkl · animés',
        help: 'CSV d’import Simkl : Type anime, identifiant TMDB, statut, note sur 10 et avis. Le dernier épisode vu reste vide : Sylloge compte des saisons.',
        importUrl: 'https://simkl.com/apps/import/csv',
        linkLabel: 'Importer sur Simkl ↗',
      },
    ]
  }

  if (medium === 'books') {
    return [
      {
        id: 'storygraph',
        name: SERVICE_NAMES.storygraph,
        label: 'Pour The StoryGraph (format Goodreads)',
        help: 'CSV à l’en-tête Goodreads de 31 colonnes, seul format que The StoryGraph importe. Goodreads lui-même refuse ce fichier : il exige un ISBN par livre, et Sylloge n’en stocke aucun.',
        importUrl: 'https://app.thestorygraph.com/import-goodreads',
        linkLabel: 'Importer sur The StoryGraph ↗',
      },
      {
        id: 'hardcover',
        name: SERVICE_NAMES.hardcover,
        label: 'Hardcover',
        help: 'CSV d’import Hardcover : titre, auteur, statut, note par demi-point, dates et avis. Aucun ISBN exigé ; la date de fin de lecture n’est pas transmise.',
        importUrl: 'https://hardcover.app/account/imports',
        linkLabel: 'Importer sur Hardcover ↗',
      },
    ]
  }

  if (medium === 'mangas') {
    return [
      {
        id: 'storygraph',
        name: SERVICE_NAMES.storygraph,
        label: 'Pour The StoryGraph (format Goodreads)',
        help: 'CSV à l’en-tête Goodreads de 31 colonnes, seul format que The StoryGraph importe. Les tomes lus ne sont pas transmis : ce format ne porte aucune progression.',
        importUrl: 'https://app.thestorygraph.com/import-goodreads',
        linkLabel: 'Importer sur The StoryGraph ↗',
      },
    ]
  }

  return []
}
