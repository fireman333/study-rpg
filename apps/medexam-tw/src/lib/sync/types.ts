// Sync engine types (M4 cloud sync).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { StudyRpgDB } from '@study-rpg/core'

export type SyncStatus =
  | 'disabled'      // env vars missing or feature flag off
  | 'unauthed'      // no Supabase session
  | 'idle'          // authed, no pending work
  | 'pushing'       // batch upload in flight
  | 'pulling'       // pull-on-focus in flight
  | 'offline'       // network error; queue holds pending pushes
  | 'error'         // last operation failed (non-network)

export interface SyncEngine {
  /** Start engine: install hooks, listen for visibility, kick off first pull. Idempotent. */
  start(userId: string): void
  /** Stop engine: remove hooks, cancel timers, reject pending pushes. */
  stop(): void
  /** Force a push of all dirty rows now (bypass debounce). */
  pushNow(): Promise<void>
  /** Force a pull from cloud now. */
  pullNow(): Promise<void>
  /** Current status snapshot. */
  getStatus(): SyncStatus
  /** Last successful push wall-clock ms. */
  lastPushAt(): number | null
  /** Last successful pull wall-clock ms. */
  lastPullAt(): number | null
}

export interface CreateSyncEngineOptions {
  supabase: SupabaseClient
  db: StudyRpgDB
  /** Debounce window for batched push, ms. Default 3000. */
  debounceMs?: number
  /** Sent as app_version on every row push (for forward-compat per design D5). */
  appVersion?: string
  /** Optional error sink — defaults to console.error. */
  onError?: (err: unknown, ctx: string) => void
}

/** Marker for a dirty Dexie row pending push. */
export interface DirtyMarker {
  dexieTable: string
  pk: string
}

/** Row payload sent to upsert_lww RPC. */
export interface RowPayload {
  user_id: string
  updated_at: string  // ISO string
  app_version: string
  // collection-table additional pk columns:
  question_id?: string
  id?: string
  subject_id?: string
  // payloads:
  data?: unknown
  correct?: number
  total?: number
}

/** Cloud row received from pull. */
export interface CloudRow {
  user_id: string
  updated_at: string
  app_version: string | null
  data?: unknown
  question_id?: string
  id?: string
  subject_id?: string
  correct?: number
  total?: number
}
