import Database from '@tauri-apps/plugin-sql'

export const DATABASE_URL = 'sqlite:sylloge.db' as const
export const DEFAULT_PROFILE_ID = 'default' as const

let databasePromise: Promise<Database> | undefined

export function loadSyllogeDatabase(): Promise<Database> {
  databasePromise ??= Database.load(DATABASE_URL).catch((error: unknown) => {
    databasePromise = undefined
    throw error
  })
  return databasePromise
}
