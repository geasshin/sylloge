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
    error: 'Le fichier n’est pas un export Sylloge valide (JSON Films v1 ou bibliothèque v2). Aucune donnée n’a été écrite.',
  }
}

export function parseSeriesCollectionJson(contents: string): CollectionJsonImportResult<Series> {
  const preview = validateLibraryDocument(contents)
  if (preview.document === null) {
    return {
      items: null,
      error: 'Le fichier n’est pas une bibliothèque Sylloge v2 valide. Aucune donnée n’a été écrite.',
    }
  }

  return preview.document.series.length > 0
    ? { items: preview.document.series, error: null }
    : { items: null, error: 'Ce fichier Sylloge ne contient aucune série à importer.' }
}

export function parseBooksCollectionJson(contents: string): CollectionJsonImportResult<Book> {
  const preview = validateLibraryDocument(contents)
  if (preview.document === null) {
    return {
      items: null,
      error: 'Le fichier n’est pas une bibliothèque Sylloge v2 valide. Aucune donnée n’a été écrite.',
    }
  }

  return preview.document.books.length > 0
    ? { items: preview.document.books, error: null }
    : { items: null, error: 'Ce fichier Sylloge ne contient aucun livre à importer.' }
}

export function parseGamesCollectionJson(contents: string): CollectionJsonImportResult<Game> {
  const preview = validateLibraryDocument(contents)
  if (preview.document === null) {
    return {
      items: null,
      error: 'Le fichier n’est pas une bibliothèque Sylloge v2 valide. Aucune donnée n’a été écrite.',
    }
  }

  return preview.document.games.length > 0
    ? { items: preview.document.games, error: null }
    : { items: null, error: 'Ce fichier Sylloge ne contient aucun jeu à importer.' }
}

export function parseArtworksCollectionJson(contents: string): CollectionJsonImportResult<Artwork> {
  const preview = validateLibraryDocument(contents)
  if (preview.document === null) {
    return {
      items: null,
      error: 'Le fichier n’est pas une bibliothèque Sylloge v2 valide. Aucune donnée n’a été écrite.',
    }
  }

  return preview.document.artworks.length > 0
    ? { items: preview.document.artworks, error: null }
    : { items: null, error: 'Ce fichier Sylloge ne contient aucune œuvre d’art à importer.' }
}
