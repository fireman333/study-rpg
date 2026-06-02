// Hospital (二階) table adapters: Dexie tables ↔ Postgres tables (M4 cloud sync).
//
// 6 cloud tables (extended by implement-targeted-fate-card-tickets):
//   - hospital_state            (singleton, collapses gameCounters + gachaStats + tickets + rooms + affinity)
//   - hospital_doctors          (collection, pk = id)
//   - hospital_mastery          (collection, pk = subject_id)
//   - hospital_question_history (collection, pk = question_id)
//   - question_bookmarks        (collection, pk = question_id)
//   - targeted_tickets          (collection, pk = id)
//   - targeted_ticket_history   (collection, composite pk = ticket_id + event)
//
// Engine is content-pack-agnostic post-Session A refactor — adapters cast the
// generic `Dexie` instance to `HospitalDB` for typed table access.

import type Dexie from 'dexie'
import type { CloudRow, RowPayload } from './types'
import type {
  AchievementRow,
  AffinityRow,
  BookmarkRow,
  DailyStudyLogRow,
  DoctorRow,
  GachaStatsRow,
  GameCountersRow,
  HospitalDB,
  LeaderboardProfileRow,
  MasteryRow,
  MonotonicCountersRow,
  QuestionHistoryRow,
  RetirementLogRow,
  RoomRow,
  TargetedTicketHistoryRow,
  TargetedTicketRow,
  TicketsRow,
} from '../../db/schema'

/** Local row written via Dexie has `_updatedAt: number` injected by hook. */
export type WithUpdatedAt<T> = T & { _updatedAt?: number }

/**
 * Adapter contract — same shape as 一階 (apps/medexam-tw/src/lib/sync/tables.ts).
 * Engine consumes this via the generic `Dexie` callback; each adapter body
 * casts to `HospitalDB` for typed table access.
 */
export interface TableAdapter {
  postgresTable: string
  shape: 'singleton' | 'collection'
  dexieTable: string
  /**
   * Additional Dexie tables that should fire dirty markers for this adapter's
   * `dexieTable` key. Used by multi-table singleton adapters whose `snapshot*`
   * methods aggregate rows from more than one local table into a single cloud
   * blob (e.g. `HOSPITAL_STATE` collapses 5 Dexie tables → 1 `hospital_state`
   * blob). The engine installs identical `creating` / `updating` / `deleting`
   * hooks on each entry; every hook marks dirty under the canonical
   * `dexieTable` key so `snapshotDirty()` sees a single marker per debounce
   * window. Leave unset for adapters whose snapshot reads only from
   * `dexieTable` (default empty).
   *
   * See change `fix-medexam2-room-write-sync-race` (2026-05-19) for the race
   * this closes: passenger-table writes (rooms / tickets / gachaStats /
   * affinity) previously waited for the next gameCounters tick to propagate.
   */
  extraDexieTables?: readonly string[]
  snapshotDirty(
    db: Dexie,
    dirtyPks: ReadonlySet<string>,
    userId: string,
    updatedAt: string,
    appVersion: string,
  ): Promise<RowPayload[]>
  snapshotAll(
    db: Dexie,
    userId: string,
    updatedAt: string,
    appVersion: string,
  ): Promise<RowPayload[]>
  applyToLocal(
    db: Dexie,
    cloudRow: CloudRow,
    opts?: { force?: boolean },
  ): Promise<boolean>
}

/** Singleton primary keys per 二階 schema convention. */
const GAME_COUNTERS_ID = 'singleton' as const
const GACHA_STATS_ID = 'global' as const
const TICKETS_ID = 'global' as const

/**
 * Aggregated hospital_state.data blob shape. All singleton-shaped tables plus
 * full rooms / affinity arrays.
 */
interface HospitalStateBlob {
  gameCounters: GameCountersRow | null
  gachaStats: GachaStatsRow | null
  tickets: TicketsRow | null
  rooms: RoomRow[]
  affinity: AffinityRow[]
}

function cloudIsNewer(cloudUpdatedAt: string, localMs: number | undefined): boolean {
  const cloudMs = Date.parse(cloudUpdatedAt)
  if (!Number.isFinite(cloudMs)) return false
  if (typeof localMs !== 'number') return true
  return cloudMs > localMs
}

async function readHospitalStateBlob(db: HospitalDB): Promise<HospitalStateBlob> {
  const [gameCounters, gachaStats, tickets, rooms, affinity] = await Promise.all([
    db.gameCounters.get(GAME_COUNTERS_ID).then((r) => r ?? null),
    db.gachaStats.get(GACHA_STATS_ID).then((r) => r ?? null),
    db.tickets.get(TICKETS_ID).then((r) => r ?? null),
    db.rooms.toArray(),
    db.affinity.toArray(),
  ])
  return { gameCounters, gachaStats, tickets, rooms, affinity }
}

/**
 * Local LWW comparison baseline for the collapsed `hospital_state` blob.
 *
 * Returns the MAX `_updatedAt` across ALL five contributing tables
 * (gameCounters / gachaStats / tickets singletons + every rooms / affinity
 * row), matching the push side's `max(rows.updated_at)` in
 * `buildBundleSnapshot`. Using only `gameCounters._updatedAt` here (the prior
 * behavior) under-counts passenger-only writes — a `tickets`-only grant (daily
 * refresh / banner-unlock bonus) that does NOT also touch gameCounters left the
 * baseline stale and let an older cloud blob (whose `updated_at` merely exceeds
 * the last gameCounters write) revert the freshly-granted ticket. Per
 * `fix-medexam2-ticket-cloud-clobber` cloud-sync delta.
 *
 * Returns `undefined` when no contributing row carries a numeric `_updatedAt`
 * (e.g. post account-switch wipe) so `cloudIsNewer` treats cloud as newer.
 */
async function readHospitalStateLocalMaxUpdatedAt(
  db: HospitalDB,
): Promise<number | undefined> {
  // Reuse readHospitalStateBlob so the five-table enumeration lives in ONE
  // place (also written by writeHospitalStateBlob + extraDexieTables); a 6th
  // passenger table only needs adding there. The blob types strip `_updatedAt`,
  // so read it via a WithUpdatedAt cast. (Distinct from migration.ts
  // getMaxLocalUpdatedAt, which scans 8 tables for the gate; this is scoped to
  // exactly the 5 collapsed blob tables.)
  const blob = await readHospitalStateBlob(db)
  const rows = [blob.gameCounters, blob.gachaStats, blob.tickets, ...blob.rooms, ...blob.affinity]
  let max: number | undefined
  for (const row of rows) {
    const ts = (row as WithUpdatedAt<object> | null)?._updatedAt
    if (typeof ts === 'number' && (max === undefined || ts > max)) max = ts
  }
  return max
}

async function writeHospitalStateBlob(
  db: HospitalDB,
  blob: HospitalStateBlob,
  cloudUpdatedAtMs: number,
): Promise<void> {
  // Stamp cloud's _updatedAt on each piece so future pulls compare correctly
  // without re-triggering push (echo prevention).
  const stamp = <T extends object>(row: T): T => ({
    ...row,
    _updatedAt: cloudUpdatedAtMs,
  } as T)
  await db.transaction(
    'rw',
    [db.gameCounters, db.gachaStats, db.tickets, db.rooms, db.affinity],
    async () => {
      if (blob.gameCounters) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.gameCounters.put(stamp(blob.gameCounters) as any)
      }
      if (blob.gachaStats) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.gachaStats.put(stamp(blob.gachaStats) as any)
      }
      if (blob.tickets) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.tickets.put(stamp(blob.tickets) as any)
      }
      if (blob.rooms && blob.rooms.length > 0) {
        // Defensive force-null per `fix-medexam2-doctor-room-pointer-drift`:
        // `Doctor.assignedRoom` is the single source of truth for assignment
        // post-v12; legacy cloud blobs may still carry non-null values that
        // would otherwise revive the dual-pointer drift on apply.
        const sanitized = blob.rooms.map((r) => ({ ...r, assignedDoctorId: null }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.rooms.bulkPut(sanitized.map(stamp) as any[])
      }
      if (blob.affinity && blob.affinity.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.affinity.bulkPut(blob.affinity.map(stamp) as any[])
      }
    },
  )
}

// Exported for adapter-level unit tests (mirrors HOSPITAL_QUESTION_HISTORY).
export const HOSPITAL_STATE: TableAdapter = {
  postgresTable: 'hospital_state',
  shape: 'singleton',
  // Canonical dirty-marker key for the aggregated blob. `gameCounters` is
  // touched every ~5 sec by the tick loop during active study sessions.
  dexieTable: 'gameCounters',
  // Per `fix-medexam2-room-write-sync-race` (2026-05-19): the engine also
  // installs hooks on these four passenger tables so any of their writes
  // (facility upgrade / fate-card consumption / recruit roll / affinity
  // increment) marks the blob dirty within the normal debounce window
  // instead of waiting for the next gameCounters tick. All hooks still
  // mark dirty under the canonical 'gameCounters' key.
  extraDexieTables: ['rooms', 'tickets', 'gachaStats', 'affinity'],
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const blob = await readHospitalStateBlob(db as HospitalDB)
    if (!blob.gameCounters) return []
    return [{ user_id: userId, updated_at: updatedAt, app_version: appVersion, data: blob }]
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const blob = await readHospitalStateBlob(db as HospitalDB)
    if (!blob.gameCounters && (!blob.rooms?.length) && (!blob.affinity?.length)) return []
    return [{ user_id: userId, updated_at: updatedAt, app_version: appVersion, data: blob }]
  },
  async applyToLocal(db, cloudRow, opts) {
    const blob = cloudRow.data as HospitalStateBlob | undefined
    if (!blob) return false
    const force = opts?.force ?? false
    const cloudMs = Date.parse(cloudRow.updated_at)
    if (!Number.isFinite(cloudMs)) return false
    if (!force) {
      // Compare against the MAX `_updatedAt` across all five collapsed tables,
      // not gameCounters alone — otherwise a passenger-only write (e.g. a
      // tickets daily-refresh / banner-unlock grant that doesn't touch
      // gameCounters) is reverted by an older cloud blob. Mirrors the push
      // side's max(rows.updated_at). Per fix-medexam2-ticket-cloud-clobber.
      const localMax = await readHospitalStateLocalMaxUpdatedAt(db as HospitalDB)
      if (!cloudIsNewer(cloudRow.updated_at, localMax)) return false
    }
    await writeHospitalStateBlob(db as HospitalDB, blob, cloudMs)
    return true
  },
}

const HOSPITAL_DOCTORS: TableAdapter = {
  postgresTable: 'hospital_doctors',
  shape: 'collection',
  dexieTable: 'doctors',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const rows: RowPayload[] = []
    for (const pk of dirtyPks) {
      const doc = await (db as HospitalDB).doctors.get(pk)
      if (!doc) continue
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        id: pk,
        data: doc,
      })
    }
    return rows
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const rows: RowPayload[] = []
    await (db as HospitalDB).doctors.each((doc) => {
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        id: (doc as DoctorRow).id,
        data: doc,
      })
    })
    return rows
  },
  async applyToLocal(db, cloudRow, opts) {
    const pk = cloudRow.id
    const data = cloudRow.data as WithUpdatedAt<Record<string, unknown>> | undefined
    if (!pk || !data) return false
    // Tombstone carve-out — FIRST STEP, honoured even when force=true.
    // Spec: cloud-sync "Row deletion in collection tables SHALL propagate via
    // tombstone-table mechanism" + hospital-finances "Retired doctor SHALL
    // stay retired across page refresh, sign-in cycles, and devices".
    //
    // Lookup uses .where('doctorId').equals(pk).first() — NOT .get(pk) —
    // because Dexie pk on retirementLog is auto-incr id (v2 additive design),
    // and doctorId is a non-unique secondary index. See
    // ~/.claude/imports/dexie_pk_change_pitfall.md for why pk was NOT changed.
    const tombstone = await (db as HospitalDB).retirementLog
      .where('doctorId').equals(pk).first()
    if (tombstone) {
      await (db as HospitalDB).doctors.delete(pk)
      return false
    }
    const force = opts?.force ?? false
    if (!force) {
      const local = await (db as HospitalDB).doctors.get(pk)
      const localMs = (local as WithUpdatedAt<unknown> | undefined)?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    const next = { ...data, _updatedAt: Date.parse(cloudRow.updated_at) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as HospitalDB).doctors.put(next as any)
    return true
  },
}

const HOSPITAL_MASTERY: TableAdapter = {
  postgresTable: 'hospital_mastery',
  shape: 'collection',
  dexieTable: 'mastery',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const rows: RowPayload[] = []
    for (const pk of dirtyPks) {
      const row = await (db as HospitalDB).mastery.get(pk)
      if (!row) continue
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        subject_id: pk,
        // mastery is flat (correct/total) per cloud-sync design tasks.md 2.2.2
        correct: row.correct,
        total: row.total,
      })
    }
    return rows
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const rows: RowPayload[] = []
    await (db as HospitalDB).mastery.each((row) => {
      const r = row as MasteryRow
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        subject_id: r.subjectId,
        correct: r.correct,
        total: r.total,
      })
    })
    return rows
  },
  async applyToLocal(db, cloudRow, opts) {
    const pk = cloudRow.subject_id
    if (!pk) return false
    const force = opts?.force ?? false
    if (!force) {
      const local = (await (db as HospitalDB).mastery.get(pk)) as
        | WithUpdatedAt<MasteryRow>
        | undefined
      const localMs = local?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    const next: WithUpdatedAt<MasteryRow> = {
      subjectId: pk,
      correct: cloudRow.correct ?? 0,
      total: cloudRow.total ?? 0,
      _updatedAt: Date.parse(cloudRow.updated_at),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as HospitalDB).mastery.put(next as any)
    return true
  },
}

export const HOSPITAL_QUESTION_HISTORY: TableAdapter = {
  postgresTable: 'hospital_question_history',
  shape: 'collection',
  dexieTable: 'questionHistory',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const rows: RowPayload[] = []
    for (const pk of dirtyPks) {
      const row = await (db as HospitalDB).questionHistory.get(pk)
      if (!row) continue
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        question_id: pk,
        data: row,
      })
    }
    return rows
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const rows: RowPayload[] = []
    await (db as HospitalDB).questionHistory.each((row) => {
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        question_id: (row as QuestionHistoryRow).questionId,
        data: row,
      })
    })
    return rows
  },
  async applyToLocal(db, cloudRow, opts) {
    const pk = cloudRow.question_id
    const data = cloudRow.data as WithUpdatedAt<Record<string, unknown>> | undefined
    if (!pk || !data) return false
    const force = opts?.force ?? false
    const local = await (db as HospitalDB).questionHistory.get(pk)

    // `everWrong` merge semantics changed by `tune-srs-binary-modifiers-and-intervals`
    // (2026-05-25):
    //
    // OLD (pre-2026-05-25): monotonic-OR — once any client wrote everWrong=true,
    // no later sync could clear it.
    //
    // NEW: row-level LWW via `lastAnsweredAt` (which is what `updated_at` tracks
    // for questionHistory rows). The 「太簡單」 opt-in button explicitly clears
    // `everWrong=false` AND bumps `lastAnsweredAt`, so the newer row wins and
    // the clear propagates cross-device.
    //
    // For graceful interop with pre-NEW clients that still ship monotonic-OR
    // payloads: when a cloud row arrives WITHOUT an explicit `everWrong` field
    // (older client writes omit the column entirely), we treat that as
    // "incoming makes no claim about everWrong" and preserve the local value —
    // this avoids stale clients silently revoking a fresh true.
    //
    // Reference: openspec/changes/archive/2026-05-25-tune-srs-binary-modifiers-and-intervals/
    //   specs/wrong-answer-list/spec.md
    const cloudHasEverWrong = 'everWrong' in (data as Record<string, unknown>)
    const cloudEverWrong = (data as { everWrong?: boolean }).everWrong === true
    const localEverWrong = (local as { everWrong?: boolean } | undefined)?.everWrong === true

    if (!force) {
      const localMs = (local as WithUpdatedAt<unknown> | undefined)?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) {
        // Cloud loses LWW. No write — local row stays as-is.
        return false
      }
    }
    // Cloud wins LWW. For `everWrong`: cloud's explicit value wins (including
    // false from an explicit 「太簡單」 clear); if cloud omits the field
    // (pre-NEW client payload), preserve local.
    const next = {
      ...data,
      _updatedAt: Date.parse(cloudRow.updated_at),
      everWrong: cloudHasEverWrong ? cloudEverWrong : localEverWrong,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as HospitalDB).questionHistory.put(next as any)
    return true
  },
}

const QUESTION_BOOKMARKS: TableAdapter = {
  postgresTable: 'question_bookmarks',
  shape: 'collection',
  dexieTable: 'bookmarks',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const rows: RowPayload[] = []
    for (const pk of dirtyPks) {
      const row = await (db as HospitalDB).bookmarks.get(pk)
      if (!row) continue
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        question_id: row.questionId,
        added_at: new Date(row.addedAt).toISOString(),
      })
    }
    return rows
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const rows: RowPayload[] = []
    await (db as HospitalDB).bookmarks.each((row) => {
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        question_id: (row as BookmarkRow).questionId,
        added_at: new Date((row as BookmarkRow).addedAt).toISOString(),
      })
    })
    return rows
  },
  async applyToLocal(db, cloudRow, opts) {
    const pk = cloudRow.question_id as string | undefined
    const addedAtIso = cloudRow.added_at as string | undefined
    if (!pk || !addedAtIso) return false
    const force = opts?.force ?? false
    if (!force) {
      const local = (await (db as HospitalDB).bookmarks.get(pk)) as
        | WithUpdatedAt<BookmarkRow>
        | undefined
      const localMs = local?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    const next: WithUpdatedAt<BookmarkRow> = {
      questionId: pk,
      addedAt: Date.parse(addedAtIso),
      _updatedAt: Date.parse(cloudRow.updated_at),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as HospitalDB).bookmarks.put(next as any)
    return true
  },
}

const TARGETED_TICKETS: TableAdapter = {
  postgresTable: 'targeted_tickets',
  shape: 'collection',
  dexieTable: 'targetedTickets',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const rows: RowPayload[] = []
    for (const pk of dirtyPks) {
      const row = await (db as HospitalDB).targetedTickets.get(pk)
      if (!row) continue
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        id: pk,
        data: row,
      })
    }
    return rows
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const rows: RowPayload[] = []
    await (db as HospitalDB).targetedTickets.each((row) => {
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        id: (row as TargetedTicketRow).id,
        data: row,
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
      const local = await (db as HospitalDB).targetedTickets.get(pk)
      const localMs = (local as WithUpdatedAt<unknown> | undefined)?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    const next = { ...data, _updatedAt: Date.parse(cloudRow.updated_at) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as HospitalDB).targetedTickets.put(next as any)
    return true
  },
}

const TARGETED_TICKET_HISTORY: TableAdapter = {
  postgresTable: 'targeted_ticket_history',
  shape: 'collection',
  dexieTable: 'targetedTicketHistory',
  // Local Dexie PK is auto-increment integer (++id); Postgres PK is composite
  // (ticket_id, event). Snapshot maps local row → cloud columns; applyToLocal
  // queries by (ticketId, event) since auto-id won't match across devices.
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const rows: RowPayload[] = []
    for (const pk of dirtyPks) {
      const localId = typeof pk === 'string' ? Number(pk) : pk
      const row = await (db as HospitalDB).targetedTicketHistory.get(localId as number)
      if (!row) continue
      const r = row as TargetedTicketHistoryRow
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        ticket_id: r.ticketId,
        event: r.event,
        data: row,
      })
    }
    return rows
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const rows: RowPayload[] = []
    await (db as HospitalDB).targetedTicketHistory.each((row) => {
      const r = row as TargetedTicketHistoryRow
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        ticket_id: r.ticketId,
        event: r.event,
        data: row,
      })
    })
    return rows
  },
  async applyToLocal(db, cloudRow, opts) {
    const ticketId = cloudRow.ticket_id as string | undefined
    const event = cloudRow.event as TargetedTicketHistoryRow['event'] | undefined
    const data = cloudRow.data as WithUpdatedAt<TargetedTicketHistoryRow> | undefined
    if (!ticketId || !event || !data) return false
    const force = opts?.force ?? false
    // Find existing row by composite (ticketId, event) — auto-id won't match.
    const existing = await (db as HospitalDB).targetedTicketHistory
      .where('ticketId').equals(ticketId)
      .filter((r) => (r as TargetedTicketHistoryRow).event === event)
      .first()
    if (!force && existing) {
      const localMs = (existing as WithUpdatedAt<unknown>)._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    const next: WithUpdatedAt<TargetedTicketHistoryRow> = {
      ...data,
      ticketId,
      event,
      _updatedAt: Date.parse(cloudRow.updated_at),
    }
    // Preserve existing auto-id if updating; otherwise let Dexie assign.
    if (existing && typeof (existing as TargetedTicketHistoryRow).id === 'number') {
      next.id = (existing as TargetedTicketHistoryRow).id
    } else {
      delete next.id
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as HospitalDB).targetedTicketHistory.put(next as any)
    return true
  },
}

/**
 * monotonicCounters singleton — brought into the cloud-sync surface by
 * add-monotonic-counters-to-sync (2026-05-19). Singleton shape identical
 * to HOSPITAL_STATE; opaque JSONB payload contains
 * {totalStudyMinutes, fateCardBadLuckPity, freshCorrectSinceLastTicket}.
 *
 * Fields are NOT strictly monotonic on cloud (LWW) — `fateCardBadLuckPity.*`
 * and `freshCorrectSinceLastTicket` legitimately decrease on pity/ticket
 * grants. `totalStudyMinutes` is the only truly monotonic field; per-field
 * MAX-merge was deferred (see change design.md Decision 3). Edge-case:
 * a device pushing an older value with newer `_updatedAt` can overwrite
 * a higher value on another device. Accept the trade-off until R2 ships
 * (replaces per-row LWW entirely).
 */
const HOSPITAL_MONOTONIC_COUNTERS: TableAdapter = {
  postgresTable: 'hospital_monotonic_counters',
  shape: 'singleton',
  dexieTable: 'monotonicCounters',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const row = await (db as HospitalDB).monotonicCounters.get('singleton')
    if (!row) return []
    return [{ user_id: userId, updated_at: updatedAt, app_version: appVersion, data: row }]
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const row = await (db as HospitalDB).monotonicCounters.get('singleton')
    if (!row) return []
    return [{ user_id: userId, updated_at: updatedAt, app_version: appVersion, data: row }]
  },
  async applyToLocal(db, cloudRow, opts) {
    const data = cloudRow.data as
      | WithUpdatedAt<MonotonicCountersRow>
      | undefined
    if (!data) return false
    const force = opts?.force ?? false
    const cloudMs = Date.parse(cloudRow.updated_at)
    if (!Number.isFinite(cloudMs)) return false
    if (!force) {
      const local = (await (db as HospitalDB).monotonicCounters.get('singleton')) as
        | WithUpdatedAt<MonotonicCountersRow>
        | undefined
      const localMs = local?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    // Preserve PK + stamp `_updatedAt` matching cloud row.
    const next = { ...data, id: 'singleton' as const, _updatedAt: cloudMs }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as HospitalDB).monotonicCounters.put(next as any)
    return true
  },
}

/**
 * leaderboardProfile singleton — added 2026-05-22 to close a migration scope
 * gap surfaced after med-study-rpg.com domain migration: opt-in state lived
 * only in Dexie, so cross-origin sign-in landed in an empty
 * `leaderboardProfile` table and re-prompted opt-in even when D1 already had
 * the user's row. Including it in the m2 bundle hydrates the opt-in state
 * cross-origin on first pull.
 *
 * Shape mirrors HOSPITAL_MONOTONIC_COUNTERS — singleton keyed by user_id,
 * entire row stored as opaque payload, LWW against `_updatedAt` Dexie hook
 * timestamp.
 */
const LEADERBOARD_PROFILE: TableAdapter = {
  postgresTable: 'leaderboard_profile',
  shape: 'singleton',
  dexieTable: 'leaderboardProfile',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const row = await (db as HospitalDB).leaderboardProfile.get(userId)
    if (!row) return []
    return [{ user_id: userId, updated_at: updatedAt, app_version: appVersion, data: row }]
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const row = await (db as HospitalDB).leaderboardProfile.get(userId)
    if (!row) return []
    return [{ user_id: userId, updated_at: updatedAt, app_version: appVersion, data: row }]
  },
  async applyToLocal(db, cloudRow, opts) {
    const data = cloudRow.data as WithUpdatedAt<LeaderboardProfileRow> | undefined
    if (!data) return false
    const force = opts?.force ?? false
    const cloudMs = Date.parse(cloudRow.updated_at)
    if (!Number.isFinite(cloudMs)) return false
    if (!force) {
      const local = (await (db as HospitalDB).leaderboardProfile.get(cloudRow.user_id)) as
        | WithUpdatedAt<LeaderboardProfileRow>
        | undefined
      const localMs = local?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    // Preserve user_id PK + stamp `_updatedAt` matching cloud row.
    const next = { ...data, user_id: cloudRow.user_id, _updatedAt: cloudMs }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as HospitalDB).leaderboardProfile.put(next as any)
    return true
  },
}

// ─── ACHIEVEMENTS adapter (v15, add-achievement-system) ─────────────────────
// Mirror LEADERBOARD_PROFILE precedent: R2-only, lives in M2_ADAPTERS only,
// NOT in HOSPITAL_ADAPTERS. No Supabase migration, no upsert_lww whitelist
// entry. Per achievement-system spec §"Achievement TableAdapter registered
// in M2_ADAPTERS only".
const ACHIEVEMENTS: TableAdapter = {
  postgresTable: 'achievements',
  shape: 'collection',
  dexieTable: 'achievements',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const rows: RowPayload[] = []
    for (const pk of dirtyPks) {
      const row = await (db as HospitalDB).achievements.get(pk)
      if (!row) continue
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        id: pk,
        data: row,
      })
    }
    return rows
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const rows: RowPayload[] = []
    await (db as HospitalDB).achievements.each((row) => {
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        id: (row as AchievementRow).id,
        data: row,
      })
    })
    return rows
  },
  async applyToLocal(db, cloudRow, opts) {
    const pk = cloudRow.id
    const data = cloudRow.data as WithUpdatedAt<AchievementRow> | undefined
    if (!pk || !data) return false
    const force = opts?.force ?? false
    if (!force) {
      const local = await (db as HospitalDB).achievements.get(pk)
      const localMs = (local as WithUpdatedAt<AchievementRow> | undefined)?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    // Cross-device pull: write data but DO NOT trigger unlock toast.
    // Toast is emitted only by local trigger hooks, never by sync apply.
    // Per achievement-system spec scenario "Cross-device pull does not
    // double-fire unlock toast".
    const next = { ...data, _updatedAt: Date.parse(cloudRow.updated_at) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as HospitalDB).achievements.put(next as any)
    return true
  },
}

// ─── DAILY_STUDY_LOG adapter (v18, tidy-tabs-add-study-stats-medexam2) ─────
// Mirror ACHIEVEMENTS precedent: R2-only, lives in M2_ADAPTERS only,
// NOT in HOSPITAL_ADAPTERS. No Supabase migration, no upsert_lww whitelist
// entry. Per `daily-study-log` spec §"R2 m2 bundle SHALL carry dailyStudyLog
// with row-level LWW merge".
//
// Conflict resolution: pure row-level LWW on cloud's `updated_at` timestamp
// vs Dexie hook's `_updatedAt`. The cumulative-per-day counter means
// cross-device same-day work loses some minutes on conflict (last writer
// wins) — accepted trade-off, vs the complexity of per-field monotonic-OR.
// No cross-version contamination risk (v2 clients don't write this key).
const DAILY_STUDY_LOG: TableAdapter = {
  postgresTable: 'daily_study_log',
  shape: 'collection',
  dexieTable: 'dailyStudyLog',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const rows: RowPayload[] = []
    for (const pk of dirtyPks) {
      const row = await (db as HospitalDB).dailyStudyLog.get(pk)
      if (!row) continue
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        id: pk,
        data: row,
      })
    }
    return rows
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const rows: RowPayload[] = []
    await (db as HospitalDB).dailyStudyLog.each((row) => {
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        id: (row as DailyStudyLogRow).date,
        data: row,
      })
    })
    return rows
  },
  async applyToLocal(db, cloudRow, opts) {
    const pk = cloudRow.id
    const data = cloudRow.data as WithUpdatedAt<DailyStudyLogRow> | undefined
    if (!pk || !data) return false
    const force = opts?.force ?? false
    if (!force) {
      const local = await (db as HospitalDB).dailyStudyLog.get(pk)
      const localMs = (local as WithUpdatedAt<DailyStudyLogRow> | undefined)?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    const next = { ...data, date: pk, _updatedAt: Date.parse(cloudRow.updated_at) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as HospitalDB).dailyStudyLog.put(next as any)
    return true
  },
}

/**
 * Retirement-log tombstone adapter — fix-doctor-retire-cloud-resurrection-v2.
 *
 * Cloud table `retirement_log` (Supabase pk = composite `(user_id, doctor_id)`).
 * Local Dexie table `retirementLog` (pk = auto-incr `id`; doctor_id is a plain
 * non-unique secondary index per v19 schema). Logical pk on the wire = doctorId.
 *
 * Pattern mirrors TARGETED_TICKET_HISTORY: snapshot* methods walk Dexie rows
 * and emit `doctor_id` at top level of RowPayload; applyToLocal looks up by
 * `.where('doctorId').equals(cloudRow.doctor_id).first()`, preserving the
 * Dexie auto-incr id on update or letting Dexie assign on insert.
 *
 * NEVER use `.get(pk)` against retirementLog — pk is auto-incr id, not
 * doctorId. v1 commit dac4eae changed pk to doctorId and was prod-reverted
 * because Dexie 4.x throws UpgradeError Not yet support for changing
 * primary key. See ~/.claude/imports/dexie_pk_change_pitfall.md.
 *
 * Registered in BOTH HOSPITAL_ADAPTERS (Supabase push) AND M2_ADAPTERS
 * (R2 m2 bundle), and in M2_ADAPTERS placed BEFORE HOSPITAL_DOCTORS so the
 * R2 apply order is retirementLog → doctors (carve-out check fires after
 * tombstone is in local).
 */
const RETIREMENT_LOG: TableAdapter = {
  postgresTable: 'retirement_log',
  shape: 'collection',
  dexieTable: 'retirementLog',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) {
    if (!dirtyPks.size) return []
    const rows: RowPayload[] = []
    for (const pk of dirtyPks) {
      // dirtyPks come from Dexie hooks keyed by physical pk (auto-incr id, stringified).
      const localId = typeof pk === 'string' ? Number(pk) : pk
      const row = await (db as HospitalDB).retirementLog.get(localId as number)
      if (!row) continue
      const r = row as RetirementLogRow
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        doctor_id: r.doctorId,
        data: {
          doctorId: r.doctorId,
          retiredAt: r.retiredAt,
          subjectId: r.subjectId,
          rarity: r.rarity,
          refund: r.refund,
        },
      })
    }
    return rows
  },
  async snapshotAll(db, userId, updatedAt, appVersion) {
    const rows: RowPayload[] = []
    await (db as HospitalDB).retirementLog.each((row) => {
      const r = row as RetirementLogRow
      rows.push({
        user_id: userId,
        updated_at: updatedAt,
        app_version: appVersion,
        doctor_id: r.doctorId,
        data: {
          doctorId: r.doctorId,
          retiredAt: r.retiredAt,
          subjectId: r.subjectId,
          rarity: r.rarity,
          refund: r.refund,
        },
      })
    })
    return rows
  },
  async applyToLocal(db, cloudRow, opts) {
    const doctorId = cloudRow.doctor_id
    const data = cloudRow.data as WithUpdatedAt<Partial<RetirementLogRow>> | undefined
    if (!doctorId || !data) return false
    const force = opts?.force ?? false
    // Secondary-index lookup — auto-incr local id will NOT match across devices.
    const existing = await (db as HospitalDB).retirementLog
      .where('doctorId').equals(doctorId).first()
    if (!force && existing) {
      const localMs = (existing as WithUpdatedAt<unknown>)._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    const next: WithUpdatedAt<RetirementLogRow> = {
      doctorId,
      retiredAt: typeof data.retiredAt === 'number' ? data.retiredAt : Date.now(),
      subjectId: typeof data.subjectId === 'string' ? data.subjectId : '',
      rarity: data.rarity as RetirementLogRow['rarity'],
      refund: typeof data.refund === 'number' ? data.refund : 0,
      _updatedAt: Date.parse(cloudRow.updated_at),
    }
    // Preserve existing auto-id if updating; otherwise let Dexie assign.
    if (existing && typeof (existing as RetirementLogRow).id === 'number') {
      next.id = (existing as RetirementLogRow).id
    } else {
      delete next.id
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as HospitalDB).retirementLog.put(next as any)
    return true
  },
}

export const HOSPITAL_ADAPTERS: readonly TableAdapter[] = [
  HOSPITAL_STATE,
  RETIREMENT_LOG,
  HOSPITAL_DOCTORS,
  HOSPITAL_MASTERY,
  HOSPITAL_QUESTION_HISTORY,
  QUESTION_BOOKMARKS,
  TARGETED_TICKETS,
  TARGETED_TICKET_HISTORY,
  HOSPITAL_MONOTONIC_COUNTERS,
  // LEADERBOARD_PROFILE intentionally NOT here. Supabase code paths
  // (migration.ts cloudHasAnyRows / getMaxCloudUpdatedAt + upsert_lww RPC
  // whitelist) iterate this union and would 404 against a `leaderboard_profile`
  // Postgres table that doesn't exist (the leaderboard backend is Cloudflare
  // D1, not Supabase). A 404 makes the migration evaluator misread cloud as
  // empty and fire a spurious conflict-chooser modal. LEADERBOARD_PROFILE
  // lives only in M2_ADAPTERS (passenger of the R2 m2 bundle).
  //
  // ACHIEVEMENTS intentionally NOT here either — same R2-only rationale.
  // See M2_ADAPTERS below.
]

/**
 * R2 bundle partition (Phase 2 of R2 cloud-sync migration).
 *
 * `M2_ADAPTERS` = hospital gameplay state (everything except bookmarks).
 *   → `users/<uid>/m2-snapshot.json.gz`
 *
 * `BOOKMARKS_ADAPTERS` = `question_bookmarks` only — cross-app surface that
 * backs the `/bookmarks` page; isolated so 一階 (Phase 2.D) can migrate it
 * independently of M2.
 *   → `users/<uid>/bookmarks.json.gz`
 *
 * Union equals `HOSPITAL_ADAPTERS`. Engine installs Dexie hooks across the
 * full union (single dirty-marker tracker); R2 push fans out by binding.
 */
export const M2_ADAPTERS: readonly TableAdapter[] = [
  HOSPITAL_STATE,
  // RETIREMENT_LOG MUST come before HOSPITAL_DOCTORS so R2 bundle apply order
  // is retirementLog → doctors (carve-out check fires after tombstone is in
  // local). Spec: cloud-sync "Apply ordering".
  RETIREMENT_LOG,
  HOSPITAL_DOCTORS,
  HOSPITAL_MASTERY,
  HOSPITAL_QUESTION_HISTORY,
  TARGETED_TICKETS,
  TARGETED_TICKET_HISTORY,
  HOSPITAL_MONOTONIC_COUNTERS,
  LEADERBOARD_PROFILE,
  ACHIEVEMENTS,
  DAILY_STUDY_LOG,
]

export const BOOKMARKS_ADAPTERS: readonly TableAdapter[] = [QUESTION_BOOKMARKS]

export { cloudIsNewer }
