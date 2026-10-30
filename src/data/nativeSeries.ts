import { invoke } from '@tauri-apps/api/core'
import type { Series } from '../domain/series.ts'

/** Une bibliothèque = une table : Séries (`series`) et Animation japonaise (`anime`). */
export type NativeSeriesLibrary = 'series' | 'anime'

export type NativeSeriesMovePayload = {
  /** La fiche entière, valeurs déjà validées par le formulaire. */
  series: Series
  /** Table qui contient la fiche au moment de l'appel. */
  library: NativeSeriesLibrary
}

export type NativeSeriesMover = (payload: NativeSeriesMovePayload) => Promise<void>

export const moveSeriesLibraryAtomically: NativeSeriesMover = (payload) => (
  invoke('move_series_library', { payload })
)
