// Sync engine types (M4 cloud sync).

import type { SupabaseClient } from '@supabase/supabase-js'
import type Dexie from 'dexie'
import type { TableAdapter } from './tables'

export type SyncStatus =
  | 'disabled'      // env vars missing or feature flag off
  | 'unauthed'      // no Supabase session
  | 'idle'          // authed, no pending work
  | 'pushing'       // batch upload in flight
  | 'pulling'       // pull-on-focus in flight
  | 'offline'       // network error; queue holds pending pushes
  | 'error'         // last operation failed (non-network)
  | 'paused'        // user picked "Decide later" on conflict chooser

export interface SyncEngine {
  /** Start engine: install hooks, listen for visibility, kick off first pull. Idempotent. */
  start(userId: string): void
  /** Stop engine: remove hooks, cancel timers, reject pending pushes. */
  stop(): void
  /** Force a push of all dirty rows now (bypass debounce). */
  pushNow(): Promise<void>
  /** Force a pull from cloud now. */
  pullNow(): Promise<void>
  /**
   * Bulk push every cloud-synced local row to cloud, regardless of dirty
   * markers. Used by "Upload local progress" and "Use local overwrites cloud"
   * paths in the sign-in migration flow. `updatedAt` defaults to now() —
   * caller can pass an ISO string to override (LWW guarantees local wins
   * if newer).
   */
  pushAllNow(updatedAt?: string): Promise<void>
  /**
   * Bulk pull every cloud row for this user from the dawn of time
   * (ignores the incremental cursor). Used by "Use cloud overwrites local".
   * Local-side LWW is suppressed via `force=true` to guarantee replace.
   */
  pullAllNow(opts?: { force?: boolean }): Promise<void>
  /** Pause both push and pull (sign-in conflict chooser "Decide later"). */
  pause(): void
  /** Resume from `pause`. Triggers an immediate pull. */
  resume(): void
  /** Current status snapshot. */
  getStatus(): SyncStatus
  /** Last successful push wall-clock ms. */
  lastPushAt(): number | null
  /** Last successful pull wall-clock ms. */
  lastPullAt(): number | null
}

export interface CreateSyncEngineOptions {
  supabase: SupabaseClient
  /**
   * Dexie database instance. Adapter callbacks cast this to their concrete
   * DB subclass (e.g. `StudyRpgDB` / `HospitalDB`). Engine itself stays
   * content-pack-agnostic (per design D4 of add-cloud-sync).
   */
  db: Dexie
  /**
   * Table adapters describing which Dexie tables sync to which Postgres tables.
   * Injected per app: 一階 passes `ONE_STAGE_ADAPTERS`, 二階 passes
   * `HOSPITAL_ADAPTERS`. Engine has no hardcoded knowledge of which set is used.
   */
  adapters: ReadonlyArray<TableAdapter>
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
  ticket_id?: string  // targeted_ticket_history composite pk (with event)
  event?: 'obtained' | 'assigned' | 'consumed'  // targeted_ticket_history composite pk
  // payloads:
  data?: unknown
  correct?: number
  total?: number
  added_at?: string  // ISO string (question_bookmarks only — immutable display sort key)
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
  ticket_id?: string  // targeted_ticket_history
  event?: 'obtained' | 'assigned' | 'consumed'  // targeted_ticket_history
  correct?: number
  total?: number
  added_at?: string  // ISO string (question_bookmarks only)
}
