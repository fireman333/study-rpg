/**
 * Reading-timer service — singleton state machine that accrues study minutes
 * while the user is in "reading" mode, with anti-cheat auto-pause on tab-hidden
 * + 90s idle.
 *
 * Wire-up:
 *   - Each game-minute (60 accumulated seconds) → fires Promise.all of:
 *     (a) increment meta['totalStudyMinutes'] (synced via SYNCED_META_KEYS)
 *     (b) accrue maze per-family energy (the reading energy faucet)
 *   NOTE: reading no longer grants DMN draws (add-neurons-expedition-rewards
 *   moved the DMN first axis to expedition clears). Reading still fuels maze
 *   energy + 累積閱讀.
 *
 * State machine: idle → reading → paused → reading → ... → idle
 *
 * Tick interval: 10s in dev / 60s in prod (smaller in dev for visible accrual).
 * Idle threshold: 90s without mousemove / keydown / touchstart.
 *
 * Not persisted: sub-minute accumulated time. Only the per-minute counter
 * (meta['totalStudyMinutes']) is persisted to Dexie + synced cross-device.
 */

import { db } from '../db'
import {
  accrueMazeEnergy,
  readMazeEnergyState,
  synapticConduction,
  READING_MINUTE_ENERGY,
} from '../maze/economy'

export type ReadingTimerStatus = 'idle' | 'reading' | 'paused'
export type ReadingTimerPauseReason = 'manual' | 'visibility' | 'idle' | null

export interface ReadingTimerState {
  status: ReadingTimerStatus
  pauseReason: ReadingTimerPauseReason
  /** Accumulated seconds in current session (resets on stop). */
  accumulatedSeconds: number
  /** Number of full minutes the side-effect has fired for in current session. */
  minutesFired: number
  /**
   * The subject family this reading session is accruing energy into — per-subject
   * reading (add-neurons-maze-zoom-and-focus). Set by `start`, preserved across
   * pause/resume, cleared on stop; one-subject-at-a-time (switching ends the prior
   * session). This is the single source of truth for the active reading subject.
   */
  readingFamilyId: string | null
}

const TICK_MS = import.meta.env.PROD ? 60_000 : 10_000
const IDLE_TIMEOUT_MS = 90_000

let state: ReadingTimerState = {
  status: 'idle',
  pauseReason: null,
  accumulatedSeconds: 0,
  minutesFired: 0,
  readingFamilyId: null,
}

const listeners = new Set<() => void>()
let tickInterval: ReturnType<typeof setInterval> | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
// Post-multiplier reading energy accrued in the current session (the synaptic-
// conduction batch, rework-neurons-connectome-expedition-driven). Conducted to wired
// neighbors at session end (stop / subject-switch). Reset on start / stop.
let sessionReadingEnergy = 0

/** Conduct one reading session's batched energy to the family's wired neighbors. */
async function conductReadingBatch(familyId: string, energy: number): Promise<void> {
  if (energy <= 0) return
  try {
    const flows = await synapticConduction(familyId, energy)
    if (flows.length === 0) return
    const { events } = await import('./connectome')
    for (const f of flows) events.emit('connectome.conductionPulse', f)
  } catch (err) {
    console.error('[conduction] reading-session conduction failed:', err)
  }
}

function emit(): void {
  for (const l of listeners) {
    try {
      l()
    } catch (err) {
      console.error('[reading-timer] listener error:', err)
    }
  }
}

function parseIntSafe(v: string | undefined): number {
  if (v === undefined) return 0
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : 0
}

async function incrementTotalStudyMinutes(): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    const cur = parseIntSafe((await db.meta.get('totalStudyMinutes'))?.value)
    await db.meta.put({
      key: 'totalStudyMinutes',
      value: String(cur + 1),
    })
  })
}

async function fireMinuteSideEffects(): Promise<void> {
  const fam = state.readingFamilyId
  try {
    if (fam) {
      // Capture the family's earned before/after so the post-multiplier reading
      // delta (the conduction batch) is accumulated exactly, excluding any incoming
      // conduction (which happens only at other batch points).
      const before = (await readMazeEnergyState(fam)).earned
      await Promise.all([
        incrementTotalStudyMinutes(), // global counter — drives achievements / leaderboard / card
        accrueMazeEnergy(fam, READING_MINUTE_ENERGY), // per-subject reading faucet
      ])
      const after = (await readMazeEnergyState(fam)).earned
      sessionReadingEnergy += Math.max(0, after - before)
    } else {
      await incrementTotalStudyMinutes()
    }
    console.info('[reading-timer] +1 minute accrued', fam ?? '(no family)')
  } catch (err) {
    console.error('[reading-timer] minute side-effect failed:', err)
  }
}

function onTick(): void {
  if (state.status !== 'reading') return
  state = {
    ...state,
    accumulatedSeconds: state.accumulatedSeconds + TICK_MS / 1000,
  }
  // Check minute-boundary crossing.
  const newMinutes = Math.floor(state.accumulatedSeconds / 60)
  if (newMinutes > state.minutesFired) {
    const crossings = newMinutes - state.minutesFired
    state = { ...state, minutesFired: newMinutes }
    // Fire side-effect once per crossing (typically just 1, but handle multi just in case)
    for (let i = 0; i < crossings; i++) {
      void fireMinuteSideEffects()
    }
  }
  emit()
}

function resetIdleTimer(): void {
  if (idleTimer !== null) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (state.status === 'reading') {
      pause('idle')
    }
  }, IDLE_TIMEOUT_MS)
}

function clearIdleTimer(): void {
  if (idleTimer !== null) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

function onActivity(): void {
  if (state.status === 'reading') {
    resetIdleTimer()
  }
}

function onVisibilityChange(): void {
  if (typeof document === 'undefined') return
  if (document.hidden && state.status === 'reading') {
    pause('visibility')
  }
  // Note: NO auto-resume on visibility return — explicit user action required.
}

let activityListenersAttached = false

function attachActivityListeners(): void {
  if (activityListenersAttached || typeof window === 'undefined') return
  window.addEventListener('mousemove', onActivity)
  window.addEventListener('keydown', onActivity)
  window.addEventListener('touchstart', onActivity)
  document.addEventListener('visibilitychange', onVisibilityChange)
  activityListenersAttached = true
}

function detachActivityListeners(): void {
  if (!activityListenersAttached || typeof window === 'undefined') return
  window.removeEventListener('mousemove', onActivity)
  window.removeEventListener('keydown', onActivity)
  window.removeEventListener('touchstart', onActivity)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  activityListenersAttached = false
}

function startTickInterval(): void {
  if (tickInterval !== null) return
  tickInterval = setInterval(onTick, TICK_MS)
}

function stopTickInterval(): void {
  if (tickInterval !== null) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}

export function start(familyId: string): void {
  // Already reading this exact subject → no-op (idempotent).
  if (state.status === 'reading' && state.readingFamilyId === familyId) return
  // Switching subject (one-at-a-time): end any prior session cleanly so the prior
  // family stops accruing, then begin a fresh session for the new subject. Conduct
  // the prior session's reading batch on switch (a switch IS a session end).
  const prevFam = state.readingFamilyId
  const prevBatch = sessionReadingEnergy
  sessionReadingEnergy = 0
  if (prevFam && prevFam !== familyId && prevBatch > 0) void conductReadingBatch(prevFam, prevBatch)
  stopTickInterval()
  clearIdleTimer()
  state = {
    status: 'reading',
    pauseReason: null,
    accumulatedSeconds: 0,
    minutesFired: 0,
    readingFamilyId: familyId,
  }
  attachActivityListeners()
  resetIdleTimer()
  startTickInterval()
  emit()
}

export function stop(): void {
  stopTickInterval()
  clearIdleTimer()
  detachActivityListeners()
  // Conduct this reading session's batched energy to wired neighbors (session end).
  const fam = state.readingFamilyId
  const batch = sessionReadingEnergy
  sessionReadingEnergy = 0
  state = {
    status: 'idle',
    pauseReason: null,
    accumulatedSeconds: 0,
    minutesFired: 0,
    readingFamilyId: null,
  }
  emit()
  if (fam && batch > 0) void conductReadingBatch(fam, batch)
}

export function pause(reason: Exclude<ReadingTimerPauseReason, null>): void {
  if (state.status !== 'reading') return
  stopTickInterval()
  clearIdleTimer()
  // Keep activity listeners attached so resume()-via-button works
  state = { ...state, status: 'paused', pauseReason: reason }
  emit()
}

/**
 * Resume from paused state. Distinct from start() in that it preserves
 * accumulatedSeconds and minutesFired from the prior session segment.
 */
export function resume(): void {
  if (state.status !== 'paused') return
  state = { ...state, status: 'reading', pauseReason: null }
  attachActivityListeners()
  resetIdleTimer()
  startTickInterval()
  emit()
}

export function getReadingTimerState(): ReadingTimerState {
  return state
}

/**
 * Subscribe to state changes. Returns unsubscribe function.
 */
export function onReadingTimerStateChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Test-only / DEV-only: reset internal state without invoking dependencies.
 * Used by Vitest tests; not exposed in prod UI.
 */
export function __resetForTests(): void {
  stopTickInterval()
  clearIdleTimer()
  detachActivityListeners()
  sessionReadingEnergy = 0
  state = {
    status: 'idle',
    pauseReason: null,
    accumulatedSeconds: 0,
    minutesFired: 0,
    readingFamilyId: null,
  }
  listeners.clear()
}

/**
 * Read current totalStudyMinutes from db.meta (used by UI display).
 */
export async function readTotalStudyMinutes(): Promise<number> {
  const row = await db.meta.get('totalStudyMinutes')
  return parseIntSafe(row?.value)
}
