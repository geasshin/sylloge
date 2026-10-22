import { invoke } from '@tauri-apps/api/core'
import type { CustomEntry, CustomLibraryId } from '../domain/customLibraries.ts'

/** Same camelCase shape as the custom-library domain, quote owner = entryId. */
export type NativeCustomEntryWritePayload = {
  libraryId: CustomLibraryId
  entry: CustomEntry
}

export type NativeCustomEntryWriter = (payload: NativeCustomEntryWritePayload) => Promise<void>
export type NativeCustomEntryDeleter = (profileId: string, libraryId: CustomLibraryId, entryId: string) => Promise<void>
export type NativeCustomLibraryRemover = (profileId: string, libraryId: CustomLibraryId) => Promise<void>

async function customCommand(command: string, args: Record<string, unknown>): Promise<void> {
  try {
    await invoke<void>(command, args)
  } catch (error) {
    // Tauri rejects Rust Result::Err(String) as a string. UI error boundaries
    // read Error.message: keep the native reason instead of a generic failure.
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export const createCustomEntryAtomically: NativeCustomEntryWriter = payload => (
  customCommand('create_custom_entry_atomically', { payload })
)

export const updateCustomEntryAtomically: NativeCustomEntryWriter = payload => (
  customCommand('update_custom_entry_atomically', { payload })
)

export const deleteCustomEntryAtomically: NativeCustomEntryDeleter = (profileId, libraryId, entryId) => (
  customCommand('delete_custom_entry_atomically', { profileId, libraryId, entryId })
)

export const removeCustomLibraryAtomically: NativeCustomLibraryRemover = (profileId, libraryId) => (
  customCommand('remove_custom_library_atomically', { profileId, libraryId })
)
