import type { ConsoleErrorEntry } from '@study-rpg/core'

const BUFFER_SIZE = 5
const buffer: ConsoleErrorEntry[] = []
let initialised = false

function push(entry: ConsoleErrorEntry) {
  buffer.push(entry)
  if (buffer.length > BUFFER_SIZE) buffer.shift()
}

export function initConsoleErrorBuffer() {
  if (initialised) return
  initialised = true

  window.addEventListener('error', (e) => {
    push({
      message: e.message ?? String(e.error ?? 'unknown'),
      source: e.filename || undefined,
      line: e.lineno || undefined,
      timestamp: Date.now(),
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason =
      e.reason instanceof Error ? e.reason.message : String(e.reason ?? 'unknown')
    push({
      message: `Unhandled rejection: ${reason}`,
      timestamp: Date.now(),
    })
  })
}

export function getRecentConsoleErrors(): ConsoleErrorEntry[] {
  return [...buffer]
}
