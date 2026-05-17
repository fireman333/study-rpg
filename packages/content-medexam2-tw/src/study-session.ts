/**
 * Study session controller for the 二階 medexam2 content pack.
 *
 * Encapsulates the "reading mode" lifecycle (start / pause / resume / stop) plus
 * the two anti-cheat guards from `openspec/project.md` Failure Modes:
 *
 * 1. `document.visibilityState === 'hidden'` → auto-pause
 * 2. ≥ 90s without mousemove / keypress / touchstart / scroll → auto-pause
 *
 * Per design D9 + spec `hospital-study-session`, only an active session SHALL
 * cause the tick loop to accumulate revenue / reputation / totalStudyMinutes.
 * The controller does NOT touch counters itself — it only emits lifecycle
 * callbacks; the app's tick scheduler subscribes and schedules `setInterval`
 * accordingly.
 *
 * This is the one module in the content pack allowed to touch `document` /
 * `window` (per audit B-style decision: idle detection lives in content pack,
 * not the app, so future content packs can ship their own anti-cheat policy).
 *
 * Pure on `globalThis` shape — degrades to a no-op controller in SSR / Node /
 * test environments where `document` is undefined.
 */

export type StudySessionState = 'idle' | 'active' | 'paused'

export type StudySessionPauseReason = 'visibility-hidden' | 'idle-timeout' | 'manual'
export type StudySessionResumeReason = 'visibility-return' | 'interaction' | 'manual'

export interface StudySessionControllerOptions {
  /** Fired when the player explicitly starts a session. */
  onStart?: () => void
  /** Fired when the session auto-pauses or the player manually pauses. */
  onPause?: (reason: StudySessionPauseReason) => void
  /** Fired when the session resumes (from `paused` back to `active`). */
  onResume?: (reason: StudySessionResumeReason) => void
  /** Fired when the player explicitly stops the session (returns to idle). */
  onStop?: () => void
  /**
   * Idle-timeout threshold in milliseconds. Defaults to 90,000 (90s) per
   * design D9 / 一階 reading-timer parity. Tunable for testing.
   */
  idleTimeoutMs?: number
}

export interface StudySessionController {
  /** Current lifecycle state. */
  getState(): StudySessionState
  /** Player explicitly enters reading mode. No-op if already active. */
  start(): void
  /** Player explicitly pauses. No-op unless currently active. */
  pause(reason?: StudySessionPauseReason): void
  /** Resume from paused. No-op unless currently paused. */
  resume(reason?: StudySessionResumeReason): void
  /** Player explicitly exits reading mode (returns to idle). */
  stop(): void
  /**
   * Tear down all DOM listeners. Caller MUST invoke before discarding the
   * controller (e.g., React effect cleanup) to avoid leaking handlers.
   */
  dispose(): void
}

const DEFAULT_IDLE_TIMEOUT_MS = 90_000

const ACTIVITY_EVENTS: ReadonlyArray<keyof DocumentEventMap> = [
  'mousemove',
  'keydown',
  'touchstart',
  'scroll',
]

export function createStudySessionController(
  opts: StudySessionControllerOptions = {},
): StudySessionController {
  const idleTimeoutMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS

  let state: StudySessionState = 'idle'
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  // SSR / Node fallback — no document = no listeners, just lifecycle without anti-cheat.
  const hasDocument = typeof document !== 'undefined'

  function clearIdleTimer() {
    if (idleTimer !== null) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  function armIdleTimer() {
    clearIdleTimer()
    if (state !== 'active') return
    idleTimer = setTimeout(() => {
      if (state === 'active') pause('idle-timeout')
    }, idleTimeoutMs)
  }

  function onActivity() {
    if (state === 'active') armIdleTimer()
  }

  function onVisibilityChange() {
    if (!hasDocument) return
    if (document.visibilityState === 'hidden' && state === 'active') {
      pause('visibility-hidden')
    }
  }

  function attachListeners() {
    if (!hasDocument) return
    for (const evt of ACTIVITY_EVENTS) {
      document.addEventListener(evt, onActivity, { passive: true })
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  function detachListeners() {
    if (!hasDocument) return
    for (const evt of ACTIVITY_EVENTS) {
      document.removeEventListener(evt, onActivity)
    }
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  function start() {
    if (state === 'active') return
    state = 'active'
    attachListeners()
    armIdleTimer()
    opts.onStart?.()
  }

  function pause(reason: StudySessionPauseReason = 'manual') {
    if (state !== 'active') return
    state = 'paused'
    clearIdleTimer()
    opts.onPause?.(reason)
  }

  function resume(reason: StudySessionResumeReason = 'manual') {
    if (state !== 'paused') return
    state = 'active'
    armIdleTimer()
    opts.onResume?.(reason)
  }

  function stop() {
    if (state === 'idle') return
    state = 'idle'
    clearIdleTimer()
    detachListeners()
    opts.onStop?.()
  }

  function dispose() {
    clearIdleTimer()
    detachListeners()
    state = 'idle'
  }

  return {
    getState: () => state,
    start,
    pause,
    resume,
    stop,
    dispose,
  }
}
