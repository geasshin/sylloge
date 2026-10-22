import type { Book } from './book.ts'
import type { Film } from './film.ts'
import type { Game } from './game.ts'
import type { Series } from './series.ts'
import type { Artwork } from './artwork.ts'
import { validateLibraryDocument } from './libraryDocument.ts'
import { validateLibraryImport } from './libraryTransfer.ts'

export type CollectionJsonImportResult<T> =
  | { items: T[]; error: null }
  | { items: null; error: string }

const INVALID_LIBRARY = 'Le fichier n’est pas une bibliothèque Sylloge (versions 1 à 4) valide. Aucune donnée n’a été écrite.'

export function parseFilmsCollectionJson(contents: string): CollectionJsonImportResult<Film> {
  const libraryPreview = validateLibraryDocument(contents)
  if (libraryPreview.document !== null) {
    return libraryPreview.document.films.length > 0
      ? { items: libraryPreview.document.films, error: null }
      : { items: null, error: 'Ce fichier Sylloge ne contient aucun film à importer.' }
  }

  const historicalPreview = validateLibraryImport(contents)
  if (historicalPreview.document !== null) {
    return historicalPreview.document.films.length > 0
      ? { items: historicalPreview.document.films, error: null }
      : { items: null, error: 'Ce fichier Sylloge ne contient aucun film à importer.' }
  }

  return {
    items: null,
    error: 'Le fichier n’est pas un export Sylloge valide (JSON Films v1 ou bibliothèque v3). Aucune donnée n’a été écrite.',
  }
}

/** Import unitaire de la bibliothèque Séries : les fiches animation sont exclues. */
export function parseSeriesCollectionJson(contents: string): CollectionJsonImportResult<Series> {
  const preview = validateLibraryDocument(contents)
  if (preview.document === null) {
    return { items: null, error: INVALID_LIBRARY }
  }

  return preview.document.series.length > 0
    ? { items: preview.document.series, error: null }
    : { items: null, error: 'Ce fichier Sylloge ne contient aucune série à importer.' }
}

/** Import unitaire de la bibliothèque Animation japonaise. */
export function parseAnimeCollectionJson(contents: string): CollectionJsonImportResult<Series> {
  const preview = validateLibraryDocument(contents)
  if (preview.document === null) {
    return { items: null, error: INVALID_LIBRARY }
  }

  return preview.document.anime.length > 0
    ? { items: preview.document.anime, error: null }
    : { items: null, error: 'Ce fichier Sylloge ne contient aucune animation japonaise à importer.' }
}

/** Import unitaire de la bibliothèque Livres : les mangas sont exclus. */
export function parseBooksCollectionJson(contents: string): CollectionJsonImportResult<Book> {
  const preview = validateLibraryDocument(contents)
  if (preview.document === null) {
    return { items: null, error: INVALID_LIBRARY }
  }

  // Des comics rangés dans Livres par un ancien document rejoignent la
  // bibliothèque Comics : l'import Livres ne les écrit pas et le dit.
  const comics = preview.document.customLibraries.find((library) => library.libraryId === 'comics')?.entries.length ?? 0
  if (preview.document.books.length > 0) return { items: preview.document.books, error: null }
  return {
    items: null,
    error: comics > 0
      ? 'Ce fichier ne contient aucun livre. Ses comics ont leur propre bibliothèque : restaurez la sauvegarde complète pour les retrouver.'
      : 'Ce fichier Sylloge ne contient aucun livre à importer.',
  }
}

/** Import unitaire de la bibliothèque Mangas. */
export function parseMangasCollectionJson(contents: string): CollectionJsonImportResult<Book> {
  const preview = validateLibraryDocument(contents)
  if (preview.document === null) {
    return { items: null, error: INVALID_LIBRARY }
  }

  return preview.document.mangas.length > 0
    ? { items: preview.document.mangas, error: null }
    : { items: null, error: 'Ce fichier Sylloge ne contient aucun manga à importer.' }
}

export function parseGamesCollectionJson(contents: string): CollectionJsonImportResult<Game> {
  const preview = validateLibraryDocument(contents)
  if (preview.document === null) {
    return { items: null, error: INVALID_LIBRARY }
  }

  return preview.document.games.length > 0
    ? { items: preview.document.games, error: null }
    : { items: null, error: 'Ce fichier Sylloge ne contient aucun jeu à importer.' }
}

export function parseArtworksCollectionJson(contents: string): CollectionJsonImportResult<Artwork> {
  const preview = validateLibraryDocument(contents)
  if (preview.document === null) {
    return { items: null, error: INVALID_LIBRARY }
  }

  return preview.document.artworks.length > 0
    ? { items: preview.document.artworks, error: null }
    : { items: null, error: 'Ce fichier Sylloge ne contient aucune œuvre d’art à importer.' }
}
