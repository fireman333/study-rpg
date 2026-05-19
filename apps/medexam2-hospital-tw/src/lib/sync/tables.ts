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
  AffinityRow,
  BookmarkRow,
  DoctorRow,
  GachaStatsRow,
  GameCountersRow,
  HospitalDB,
  MasteryRow,
  MonotonicCountersRow,
  QuestionHistoryRow,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.rooms.bulkPut(blob.rooms.map(stamp) as any[])
      }
      if (blob.affinity && blob.affinity.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.affinity.bulkPut(blob.affinity.map(stamp) as any[])
      }
    },
  )
}

const HOSPITAL_STATE: TableAdapter = {
  postgresTable: 'hospital_state',
  shape: 'singleton',
  // Hook only on gameCounters — it gets touched every tick (every 5 sec while
  // study session active), which forces fresh push of the aggregated blob.
  // Writes to gachaStats / tickets / rooms / affinity propagate within ~5 sec
  // via the next gameCounters tick.
  dexieTable: 'gameCounters',
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
      const local = (await (db as HospitalDB).gameCounters.get(GAME_COUNTERS_ID)) as
        | WithUpdatedAt<GameCountersRow>
        | undefined
      const localMs = local?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
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

const HOSPITAL_QUESTION_HISTORY: TableAdapter = {
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
    if (!force) {
      const local = await (db as HospitalDB).questionHistory.get(pk)
      const localMs = (local as WithUpdatedAt<unknown> | undefined)?._updatedAt
      if (!cloudIsNewer(cloudRow.updated_at, localMs)) return false
    }
    const next = { ...data, _updatedAt: Date.parse(cloudRow.updated_at) }
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

export const HOSPITAL_ADAPTERS: readonly TableAdapter[] = [
  HOSPITAL_STATE,
  HOSPITAL_DOCTORS,
  HOSPITAL_MASTERY,
  HOSPITAL_QUESTION_HISTORY,
  QUESTION_BOOKMARKS,
  TARGETED_TICKETS,
  TARGETED_TICKET_HISTORY,
  HOSPITAL_MONOTONIC_COUNTERS,
]

export { cloudIsNewer }
