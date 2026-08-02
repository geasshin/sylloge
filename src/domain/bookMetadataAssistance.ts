import type { OpenLibraryBookPresentation } from '../data/openLibraryService.ts'
import { EMPTY_BOOK_FORM, type BookFormValues } from './bookForm.ts'

/**
 * Préremplissage Livres depuis Open Library (jalon 0.4.27) : la présentation
 * n'alimente que les champs éditoriaux du formulaire — jamais le statut, la
 * note, le coup de cœur, les tomes ni les citations, qui restent des données
 * personnelles. La catégorie (Livre, Manga, Comics) reste un choix humain.
 */
export function bookPresentationToInitialValues(presentation: OpenLibraryBookPresentation): BookFormValues {
  return {
    ...EMPTY_BOOK_FORM,
    title: presentation.title,
    author: presentation.author ?? '',
    year: presentation.firstPublishYear !== null ? String(presentation.firstPublishYear) : '',
    summary: presentation.synopsis ?? '',
    coverUrl: presentation.coverUrl ?? '',
    quotes: [],
  }
}
