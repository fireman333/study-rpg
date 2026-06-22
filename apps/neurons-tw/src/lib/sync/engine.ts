// SyncEngine — wraps pushBundle/pullBundle with debounce + state machine.
//
// Pure R2 mode (no Supabase dual-write transitional phase per design D4).
// Caller registers onPullComplete to wire the triple-backfill hook (D5).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import type { NeuronsDB } from '../db'
import { pullBundle, pushBundle, type PullBundleResult } from './r2/engine-r2'

export type SyncState = 'idle' | 'pushing' | 'pulling' | 'paused' | 'error'

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

  async pushNow(): Promise<void> {
    if (this.state === 'paused') return
    if (!this.pending && this.state === 'pushing') return
    this.pending = false
    this.state = 'pushing'
    try {
      await pushBundle(this.supabase, this.db, this.user.id)
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
  }
}

export function createSyncEngine(opts: SyncEngineOpts): SyncEngine {
  return new SyncEngine(opts)
}
