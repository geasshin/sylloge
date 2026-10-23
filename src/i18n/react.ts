import { useSyncExternalStore } from 'react'
import { getLanguage, setLanguage, subscribeLanguage, type Language } from './core.ts'

/** Rerender in place: language changes must never reset drafts or in-flight work. */
export function useLanguage(): [Language, typeof setLanguage] {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage)
  return [language, setLanguage]
}
