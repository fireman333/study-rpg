/**
 * Console-error ring buffer (add-neurons-bug-report).
 *
 * Captures the most recent runtime errors (`window.error` +
 * `unhandledrejection`) into a fixed-size ring so the bug-report snapshot can
 * attach them. Net-new for neurons-tw (mirrors the 二階 pattern documented in
 * docs/BUG_REPORTING.md). Install once at app startup; idempotent.
 */
import type { ConsoleErrorEntry } from '@study-rpg/core'

const RING_SIZE = 5

const ring: ConsoleErrorEntry[] = []
let installed = false

function push(entry: ConsoleErrorEntry): void {
  ring.push(entry)
  while (ring.length > RING_SIZE) ring.shift()
}

/** Test seam: record an entry directly (bypasses the window listeners, which
 *  aren't available in the node test env). Mirrors the listener push path. */
export function _recordConsoleError(entry: ConsoleErrorEntry): void {
  push(entry)
}

/** Max retained entries — exported for the ring-size test. */
export const CONSOLE_ERROR_RING_SIZE = RING_SIZE

/** Return the most recent ≤5 captured errors, oldest-first (newest inclusive). */
export function getRecentConsoleErrors(): ConsoleErrorEntry[] {
  return [...ring]
}

/** Clear the buffer (test helper). */
export function _resetConsoleErrorBuffer(): void {
  ring.length = 0
}

/**
 * Install the global error listeners. Safe to call multiple times (e.g. React
 * StrictMode double-mount) — only the first call wires listeners.
 */
export function installConsoleErrorCapture(): void {
  if (installed) return
  if (typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (e: ErrorEvent) => {
    push({
      message: e.message || String(e.error ?? 'unknown error'),
      source: e.filename || undefined,
      line: typeof e.lineno === 'number' ? e.lineno : undefined,
      timestamp: Date.now(),
    })
  })

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason
    const message =
      reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : `unhandledrejection: ${String(reason)}`
    push({ message, timestamp: Date.now() })
  })
}
