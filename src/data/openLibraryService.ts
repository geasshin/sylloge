import { invoke } from '@tauri-apps/api/core'

/** Candidat Open Library borné, sans clé ni compte (jalon 0.4.27). */
export type OpenLibraryBookCandidate = {
  workKey: string
  title: string
  author: string | null
  firstPublishYear: number | null
  coverUrl: string | null
}

/** Présentation détaillée d'une œuvre pour le préremplissage du formulaire. */
export type OpenLibraryBookPresentation = {
  workKey: string
  title: string
  author: string | null
  firstPublishYear: number | null
  synopsis: string | null
  coverUrl: string | null
}

export function searchOpenLibraryBooks(query: string): Promise<OpenLibraryBookCandidate[]> {
  return invoke('search_openlibrary_books', { query })
}

export function previewOpenLibraryBook(candidate: OpenLibraryBookCandidate): Promise<OpenLibraryBookPresentation> {
  return invoke('preview_openlibrary_book', {
    workKey: candidate.workKey,
    title: candidate.title,
    author: candidate.author,
    firstPublishYear: candidate.firstPublishYear,
    coverUrl: candidate.coverUrl,
  })
}
