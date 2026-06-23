// SyncEngine — wraps pushBundle/pullBundle with debounce + state machine.
//
// Pure R2 mode (no Supabase dual-write transitional phase per design D4).
// Caller registers onPullComplete to wire the triple-backfill hook (D5).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import type { NeuronsDB } from '../db'
import { pullBundle, pushBundleSerialized, type PullBundleResult } from './r2/engine-r2'

export type SyncState = 'idle' | 'pushing' | 'pulling' | 'paused' | 'error'

// S3 (port-neurons-r2-single-flight-push): the FIRST push after cold start waits
// (bounded) for the startup force-pull to warm the ETag cache. 8s guard so a
// hung pull never blocks pushes permanently.
const STARTUP_PULL_AWAIT_MS = 8000

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export interface SyncStatus {
  state: SyncState
  lastPushAt: number | null
  lastPullAt: number | null
  lastError: string | null
}

export interface SyncEngineOpts {
  supabase: SupabaseClient
  db: NeuronsDB
  user: User
  debounceMs?: number
  onPullComplete?: (result: PullBundleResult) => void | Promise<void>
  onPushComplete?: () => void | Promise<void>
}

export class SyncEngine {
  private readonly supabase: SupabaseClient
  private readonly db: NeuronsDB
  private readonly user: User
  private readonly debounceMs: number
  private readonly onPullComplete?: (result: PullBundleResult) => void | Promise<void>
  private readonly onPushComplete?: () => void | Promise<void>

  private state: SyncState = 'idle'
  private lastPushAt: number | null = null
  private lastPullAt: number | null = null
  private lastError: string | null = null
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private pending = false
  // Retained cold-start force-pull promise (S3). The first push awaits it
  // (bounded) before its PUT; nulled after so only the first push waits.
  private startupForcePull: Promise<void> | null = null

  constructor(opts: SyncEngineOpts) {
    this.supabase = opts.supabase
    this.db = opts.db
    this.user = opts.user
    this.debounceMs = opts.debounceMs ?? 3000
    this.onPullComplete = opts.onPullComplete
    this.onPushComplete = opts.onPushComplete
  }

  getStatus(): SyncStatus {
    return {
      state: this.state,
      lastPushAt: this.lastPushAt,
      lastPullAt: this.lastPullAt,
      lastError: this.lastError,
    }
  }

  getUserId(): string {
    return this.user.id
  }

  schedulePush(): void {
    if (this.state === 'paused') return
    this.pending = true
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(() => {
      void this.pushNow()
    }, this.debounceMs)
  }

  /**
   * Kick the cold-start force-pull and retain it so the FIRST push can await it
   * (bounded) — S3. Warms the ETag cache before the first push so it sends
   * `If-Match` instead of the guaranteed empty-cache `If-None-Match:*` cold-start
   * 412. Assigns synchronously (before any await) so a Dexie-hook-triggered first
   * push always observes a non-null promise. Never rejects (a failed warm-up must
   * not break pushes; `pullNow` records its own error / state).
   */
  beginStartupForcePull(): void {
    this.startupForcePull = this.pullNow({ force: true }).catch(() => {})
  }

  async pushNow(): Promise<void> {
    if (this.state === 'paused') return
    if (!this.pending && this.state === 'pushing') return
    this.pending = false

    // S3: the FIRST push after cold start waits for the startup force-pull to
    // warm the ETag cache. Awaited BEFORE the lock (inside pushBundleSerialized)
    // so a tab never holds the lock while waiting on a pull; bounded by a
    // timeout; only the first push waits (startupForcePull is nulled after).
    if (this.startupForcePull) {
      await Promise.race([this.startupForcePull, sleep(STARTUP_PULL_AWAIT_MS)])
      this.startupForcePull = null
    }

    this.state = 'pushing'
    try {
      // S1/S2: serialize the R2 push per user across same-tab overlaps AND
      // concurrent tabs, using the freshest persisted ETag.
      await pushBundleSerialized(this.supabase, this.db, this.user.id)
      this.lastPushAt = Date.now()
      this.state = 'idle'
      this.lastError = null
      try {
        await this.onPushComplete?.()
      } catch (err) {
        console.warn('[sync] onPushComplete failed', err)
      }
    } catch (err) {
      this.lastError = (err as { message?: string })?.message ?? 'unknown'
      this.state = 'error'
      console.warn('[sync] push failed', err)
    }
  }

  async pullNow(opts?: { force?: boolean }): Promise<void> {
    if (this.state === 'paused') return
    this.state = 'pulling'
    try {
      const result = await pullBundle(this.supabase, this.db, this.user.id, {
        conditional: !opts?.force,
        force: opts?.force,
      })
      this.lastPullAt = Date.now()
      this.state = 'idle'
      this.lastError = null

      // Only fire the backfill hook when something actually changed locally
      // (applied !== null && not notModified && not blobMissing).
      if (result.applied && !result.notModified && !result.blobMissing) {
        try {
          await this.onPullComplete?.(result)
        } catch (err) {
          console.warn('[sync] onPullComplete failed', err)
        }
      }
    } catch (err) {
      this.lastError = (err as { message?: string })?.message ?? 'unknown'
      this.state = 'error'
      console.warn('[sync] pull failed', err)
    }
  }

  pause(): void {
    this.state = 'paused'
    if (this.pushTimer) {
      clearTimeout(this.pushTimer)
      this.pushTimer = null
    }
  }

  resume(): void {
    if (this.state === 'paused') this.state = 'idle'
  }

  dispose(): void {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer)
      this.pushTimer = null
    }
    this.startupForcePull = null
  }
}

export function createSyncEngine(opts: SyncEngineOpts): SyncEngine {
  return new SyncEngine(opts)
}
