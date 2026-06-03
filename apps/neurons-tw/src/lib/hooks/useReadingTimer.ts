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
  start: () => void
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
