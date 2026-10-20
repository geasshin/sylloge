import { invoke } from '@tauri-apps/api/core'
import type { Book } from '../domain/book.ts'

/** Une bibliothèque = une table : Livres (`books`) et Mangas (`mangas`). */
export type NativeBookLibrary = 'books' | 'mangas'

export type NativeBookWritePayload = {
  book: Omit<Book, 'quotes'>
  quotes: Book['quotes']
  library: NativeBookLibrary
}

export type NativeBookWriter = (payload: NativeBookWritePayload) => Promise<void>
export type NativeBookDeleter = (profileId: string, bookId: string, library: NativeBookLibrary) => Promise<void>

export const createBookAtomically: NativeBookWriter = (payload) => (
  invoke('create_book_atomically', { payload })
)

export const updateBookAtomically: NativeBookWriter = (payload) => (
  invoke('update_book_atomically', { payload })
)

export const deleteBookAtomically: NativeBookDeleter = (profileId, bookId, library) => (
  invoke('delete_book_atomically', { profileId, bookId, library })
)
