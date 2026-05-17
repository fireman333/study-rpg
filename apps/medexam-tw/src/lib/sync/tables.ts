// Table adapters: Dexie tables ↔ Postgres tables (M4 cloud sync).
//
// Each adapter knows how to snapshot a Dexie row into a payload for upsert_lww
// RPC, and how to apply a cloud row back into Dexie. Adapters are 一階 (medexam-tw)
// specific; 二階 (medexam2-hospital-tw) will need its own adapter set.
//
// TableAdapter callbacks receive a generic `Dexie` instance (per design D4 of
// add-cloud-sync — engine stays content-pack-agnostic). Each adapter body casts
// to `StudyRpgDB` for typed table access.

import type Dexie from 'dexie'
import type { StudyRpgDB } from '@study-rpg/core'
import type { CloudRow, RowPayload } from './types'

/** Player primary key in Dexie (singleton convention). */
const PLAYER_ID = 'p1'

/** Local row written via Dexie has `_updatedAt: number` injected by hook. */
export type WithUpdatedAt<T> = T & { _updatedAt?: number }

export interface TableAdapter {
  /** Postgres table name (also Postgres-side identifier for upsert_lww). */
  postgresTable: string
  /** Singleton (one row per user) or per-row collection. */
  shape: 'singleton' | 'collection'
  /** Dexie table identifier (for Dexie.table hook subscription). */
  dexieTable: string
  /**
   * Snapshot all dirty rows for push.
   * @param db Dexie instance (adapter casts to its concrete DB subclass internally)
   * @param dirtyPks Set of primary keys flagged dirty since last push
   * @param userId Supabase auth.uid()
   * @param updatedAt ISO timestamp to stamp on push
   * @param appVersion forward-compat version marker
   */
  snapshotDirty(
    db: Dexie,
    dirtyPks: ReadonlySet<string>,
    userId: string,
    updatedAt: string,
    appVersion: string,
  ): Promise<RowPayload[]>
  /**
   * Snapshot ALL local rows for bulk push (regardless of dirty markers).
   * Used by "Upload local progress" and "Use local overwrites cloud" paths.
   */
  snapshotAll(
    db: Dexie,
    userId: string,
    updatedAt: string,
    appVersion: string,
  ): Promise<RowPayload[]>
  /**
   * Apply a cloud row to local Dexie. By default LWW: only writes if cloud is
   * newer than local. Pass `force: true` to bypass LWW (for "Use cloud
   * overwrites local" path). Returns true if write happened.
   */
  applyToLocal(
    db: Dexie,
    cloudRow: CloudRow,
    opts?: { force?: boolean },
  ): Promise<boolean>
}

/** Compare cloud `updated_at` (ISO) to local `_updatedAt` (ms). */
function cloudIsNewer(cloudUpdatedAt: string, localMs: number | undefined): boolean {
  const cloudMs = Date.parse(cloudUpdatedAt)
  if (!Number.isFinite(cloudMs)) return false
  if (typeof localMs !== 'number') return true // no local → cloud wins
  return cloudMs > localMs
}

const PLAYER_STATE: TableAdapter = {
  postgresTable: 'player_state',
  shape: 'singleton',
  dexieTable: 'players',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const player = await (db as StudyRpgDB).players.get(PLAYER_ID)
    if (!player) return []
    return [{ user_id: userId, updated_at: updatedAt, app_version: appVersion, data: player }]
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const player = await (db as StudyRpgDB).players.get(PLAYER_ID)
    if (!player) return []
    return [{ user_id: userId, updated_at: updatedAt, app_version: appVersion, data: player }]
  },
  async applyToLocal(db, cloudRow, opts) {
    const data = cloudRow.data as WithUpdatedAt<Record<string, unknown>> | undefined
    if (!data) return false
    const force = opts?.force ?? false
    if (!force) {
      const local = await (db as StudyRpgDB).players.get(PLAYER_ID)
      const localMs = (local as WithUpdatedAt<unknown> | undefined)?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    // Stamp cloud's _updatedAt so future pulls compare correctly without re-triggering push.
    const next = { ...data, _updatedAt: Date.parse(cloudRow.updated_at) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as StudyRpgDB).players.put(next as any)
    return true
  },
}

const SRS_CARDS: TableAdapter = {
  postgresTable: 'srs_cards',
  shape: 'collection',
  dexieTable: 'srs',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const rows: RowPayload[] = []
    for (const pk of dirtyPks) {
      const card = await (db as StudyRpgDB).srs.get(pk)
      if (!card) continue
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        question_id: pk,
        data: card,
      })
    }
    return rows
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const rows: RowPayload[] = []
    await (db as StudyRpgDB).srs.each((card) => {
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        question_id: (card as { questionId: string }).questionId,
        data: card,
      })
    })
    return rows
  },
  async applyToLocal(db, cloudRow, opts) {
    const pk = cloudRow.question_id
    const data = cloudRow.data as WithUpdatedAt<Record<string, unknown>> | undefined
    if (!pk || !data) return false
    const force = opts?.force ?? false
    if (!force) {
      const local = await (db as StudyRpgDB).srs.get(pk)
      const localMs = (local as WithUpdatedAt<unknown> | undefined)?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    const next = { ...data, _updatedAt: Date.parse(cloudRow.updated_at) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as StudyRpgDB).srs.put(next as any)
    return true
  },
}

const ITEM_INSTANCES: TableAdapter = {
  postgresTable: 'item_instances',
  shape: 'collection',
  dexieTable: 'itemInstances',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const rows: RowPayload[] = []
    for (const pk of dirtyPks) {
      const item = await (db as StudyRpgDB).itemInstances.get(pk)
      if (!item) continue
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        id: pk,
        data: item,
      })
    }
    return rows
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const rows: RowPayload[] = []
    await (db as StudyRpgDB).itemInstances.each((item) => {
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        id: (item as { id: string }).id,
        data: item,
      })
    })
    return rows
  },
  async applyToLocal(db, cloudRow, opts) {
    const pk = cloudRow.id
    const data = cloudRow.data as WithUpdatedAt<Record<string, unknown>> | undefined
    if (!pk || !data) return false
    const force = opts?.force ?? false
    if (!force) {
      const local = await (db as StudyRpgDB).itemInstances.get(pk)
      const localMs = (local as WithUpdatedAt<unknown> | undefined)?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    const next = { ...data, _updatedAt: Date.parse(cloudRow.updated_at) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as StudyRpgDB).itemInstances.put(next as any)
    return true
  },
}

const MENTOR_BACKLOG: TableAdapter = {
  postgresTable: 'mentor_backlog',
  shape: 'singleton',
  dexieTable: 'mentorBacklog',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const row = await (db as StudyRpgDB).mentorBacklog.get('mentorBacklog')
    if (!row) return []
    return [{ user_id: userId, updated_at: updatedAt, app_version: appVersion, data: row }]
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const row = await (db as StudyRpgDB).mentorBacklog.get('mentorBacklog')
    if (!row) return []
    return [{ user_id: userId, updated_at: updatedAt, app_version: appVersion, data: row }]
  },
  async applyToLocal(db, cloudRow, opts) {
    const data = cloudRow.data as WithUpdatedAt<Record<string, unknown>> | undefined
    if (!data) return false
    const force = opts?.force ?? false
    if (!force) {
      const local = await (db as StudyRpgDB).mentorBacklog.get('mentorBacklog')
      const localMs = (local as WithUpdatedAt<unknown> | undefined)?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    const next = { ...data, _updatedAt: Date.parse(cloudRow.updated_at), key: 'mentorBacklog' as const }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as StudyRpgDB).mentorBacklog.put(next as any)
    return true
  },
}

export const ONE_STAGE_ADAPTERS: readonly TableAdapter[] = [
  PLAYER_STATE,
  SRS_CARDS,
  ITEM_INSTANCES,
  MENTOR_BACKLOG,
]

export { cloudIsNewer }
