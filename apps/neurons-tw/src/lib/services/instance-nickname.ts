/**
 * Per-instance custom nickname service (add-neurons-instance-rename).
 *
 * Persists nicknames in Dexie v14 `instanceNicknames` table, keyed by the
 * device-stable `instanceId`. Sync = per-row LWW on `updatedAt` (mirrors
 * questionFlags; NOT monotonic — a nickname is mutable + clearable). Clearing
 * writes an empty string + a fresh `updatedAt` (NOT a row delete), so the clear
 * propagates cross-device under LWW without a delete-vs-LWW resurrection.
 *
 * Spec: openspec/specs/neuron-instance-rename/spec.md
 */

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db } from '../db'

/** Trim + cap on input. Private nicknames — no uniqueness / NFKC / filtering. */
export const NICKNAME_MAX_LEN = 16

/**
 * Assign / change / clear an individual's nickname. An empty (after-trim) value
 * clears it — stored as '' + fresh updatedAt (not deleted) so the clear syncs.
 * Best-effort: failures are surfaced to the console channel but never thrown
 * (renaming must not break the collection UI).
 */
export async function setInstanceNickname(instanceId: string, raw: string): Promise<void> {
  try {
    if (!instanceId) return
    const nickname = raw.trim().slice(0, NICKNAME_MAX_LEN)
    await db.instanceNicknames.put({ instanceId, nickname, updatedAt: Date.now() })
  } catch (err) {
    console.error(`[instance-nickname] setInstanceNickname failed for ${instanceId}:`, err)
  }
}

/**
 * Reactive hook — returns a Map of `instanceId → nickname` for all individuals
 * with a NON-EMPTY nickname (empty-string rows = cleared, treated as absent).
 */
export function useInstanceNicknames(): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(() => new Map())
  useEffect(() => {
    const sub = liveQuery(() => db.instanceNicknames.toArray()).subscribe({
      next: (rows) => {
        const next = new Map<string, string>()
        for (const r of rows) {
          if (r.nickname && r.nickname.length > 0) next.set(r.instanceId, r.nickname)
        }
        setMap(next)
      },
      error: () => setMap(new Map()),
    })
    return () => sub.unsubscribe()
  }, [])
  return map
}

/* DEV-only debug handle for manual smoke tests. */
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __instanceNickname?: unknown }).__instanceNickname = {
    set: setInstanceNickname,
    list: () => db.instanceNicknames.toArray(),
  }
}
