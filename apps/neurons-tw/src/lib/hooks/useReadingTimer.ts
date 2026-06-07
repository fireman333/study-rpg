import { useSyncExternalStore } from 'react'
import {
  getReadingTimerState,
  onReadingTimerStateChange,
  start,
  stop,
  resume,
  type ReadingTimerState,
} from '../services/reading-timer'

export interface UseReadingTimerResult extends ReadingTimerState {
  /** Whole minutes accumulated in current session (floor of accumulatedSeconds / 60). */
  currentMinute: number
  /** Start (or switch to) a per-subject reading session for the given family. */
  start: (familyId: string) => void
  stop: () => void
  resume: () => void
}

export function useReadingTimer(): UseReadingTimerResult {
  const state = useSyncExternalStore(
    onReadingTimerStateChange,
    getReadingTimerState,
    getReadingTimerState,
  )

  return {
    ...state,
    currentMinute: Math.floor(state.accumulatedSeconds / 60),
    start,
    stop,
    resume,
  }
}
