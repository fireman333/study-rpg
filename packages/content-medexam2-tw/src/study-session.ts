/**
 * Study session controller for the 二階 medexam2 content pack.
 *
 * Encapsulates the "reading mode" lifecycle (start / pause / resume / stop)
 * as a Pomodoro-style player-controlled timer. Two automatic behaviors:
 *
 * 1. `document.visibilityState === 'hidden'` → auto-pause (so the player
 *    doesn't accumulate revenue while reading another tab for reference).
 * 2. `document.visibilityState === 'visible'` after a visibility-hidden
 *    pause → auto-resume (saves a manual click on tab return).
 *
 * Manual pauses (`pause('manual')`) survive visibility cycles and require an
 * explicit `resume()` from the UI — the controller tracks `lastPauseReason`
 * to enforce this contract.
 *
 * No idle / inactivity-based pause. The session is expected to run unattended
 * while the player reads a paper textbook; the rate cap from `reading-loop`
 * (`MAX_ATTRIBUTE_PER_MINUTE = 1`) bounds the anti-cheat upside.
 *
 * Per design D9 + spec `hospital-study-session`, only an active session SHALL
 * cause the tick loop to accumulate revenue / reputation / totalStudyMinutes.
 * The controller does NOT touch counters itself — it only emits lifecycle
 * callbacks; the app's tick scheduler subscribes and schedules `setInterval`
 * accordingly.
 *
 * This is the one module in the content pack allowed to touch `document` /
 * `window` (per audit B-style decision: visibility detection lives in content
 * pack, not the app, so future content packs can ship their own policy).
 *
 * Pure on `globalThis` shape — degrades to a no-op controller in SSR / Node /
 * test environments where `document` is undefined.
 */

export type StudySessionState = 'idle' | 'active' | 'paused'

export type StudySessionPauseReason = 'visibility-hidden' | 'manual'
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

export function createStudySessionController(
  opts: StudySessionControllerOptions = {},
): StudySessionController {
  let state: StudySessionState = 'idle'
  let lastPauseReason: StudySessionPauseReason | null = null

  // SSR / Node fallback — no document = no listeners, just lifecycle without anti-cheat.
  const hasDocument = typeof document !== 'undefined'

  function onVisibilityChange() {
    if (!hasDocument) return
    if (document.visibilityState === 'hidden' && state === 'active') {
      pause('visibility-hidden')
      return
    }
    if (
      document.visibilityState === 'visible' &&
      state === 'paused' &&
      lastPauseReason === 'visibility-hidden'
    ) {
      resume('visibility-return')
    }
  }

  function attachListeners() {
    if (!hasDocument) return
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  function detachListeners() {
    if (!hasDocument) return
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  function start() {
    if (state === 'active') return
    state = 'active'
    lastPauseReason = null
    attachListeners()
    opts.onStart?.()
  }

  function pause(reason: StudySessionPauseReason = 'manual') {
    if (state !== 'active') return
    state = 'paused'
    lastPauseReason = reason
    opts.onPause?.(reason)
  }

  function resume(reason: StudySessionResumeReason = 'manual') {
    if (state !== 'paused') return
    state = 'active'
    lastPauseReason = null
    opts.onResume?.(reason)
  }

  function stop() {
    if (state === 'idle') return
    state = 'idle'
    lastPauseReason = null
    detachListeners()
    opts.onStop?.()
  }

  function dispose() {
    detachListeners()
    state = 'idle'
    lastPauseReason = null
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
