// Migration / conflict detection helpers for sign-in resolution (M4 — 二階 mirror).
//
// Mirrors apps/medexam-tw/src/lib/sync/migration.ts but operates on HospitalDB
// (gachaStats / tickets / doctors / mastery / questionHistory / etc.).
//
// State machine identical to 一階 (per design D7 + cloud-sync spec Req 7):
//
//   sign-in (authed)
//     ├─ choice already persisted → 'keep-separate' | 'resolved' (done, no modal)
//     ├─ local empty + cloud empty                → 'fresh-start'
//     ├─ local empty + cloud has rows             → 'silent-pull'
//     ├─ local non-default + cloud empty          → 'migration-upload'
//     └─ local non-default + cloud has rows       → 'conflict-chooser'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getHospitalDB,
  type HospitalDB,
  type HospitalLocalBackupRecord,
  type AffinityRow,
  type DoctorRow,
  type GachaStatsRow,
  type GameCountersRow,
  type MasteryRow,
  type QuestionHistoryRow,
  type RoomRow,
  type TicketsRow,
} from '../../db/schema'
import { HOSPITAL_ADAPTERS } from './tables'

export type MigrationChoice =
  | 'keep-separate'
  | 'uploaded'
  | 'cloud-chosen'
  | 'local-chosen'

export interface MigrationChoiceRecord {
  choice: MigrationChoice
  userId: string
  decidedAt: number
}

export type MigrationGateState =
  | 'pending'
  | 'fresh-start'
  | 'silent-pull'
  | 'migration-upload'
  | 'conflict-chooser'
  | 'keep-separate'
  | 'resolved'
  | 'paused'

export interface GateSnapshot {
  state: MigrationGateState
  localMaxUpdatedAt: number | null
  cloudMaxUpdatedAt: number | null
}

const CHOICE_KEY_PREFIX = 'migration_choice:'
const PAUSED_KEY_PREFIX = 'migration_paused:'

function choiceKey(userId: string): string {
  return CHOICE_KEY_PREFIX + userId
}

function pausedKey(userId: string): string {
  return PAUSED_KEY_PREFIX + userId
}

export async function getMigrationChoice(
  db: HospitalDB,
  userId: string,
): Promise<MigrationChoiceRecord | null> {
  const row = await db.meta.get(choiceKey(userId))
  return (row?.value as MigrationChoiceRecord | undefined) ?? null
}

export async function setMigrationChoice(
  db: HospitalDB,
  userId: string,
  choice: MigrationChoice,
): Promise<void> {
  const record: MigrationChoiceRecord = { choice, userId, decidedAt: Date.now() }
  await db.meta.put({ key: choiceKey(userId), value: record })
}

export async function isPausedForUser(db: HospitalDB, userId: string): Promise<boolean> {
  const row = await db.meta.get(pausedKey(userId))
  return Boolean(row?.value)
}

export async function setPausedForUser(
  db: HospitalDB,
  userId: string,
  paused: boolean,
): Promise<void> {
  if (paused) {
    await db.meta.put({ key: pausedKey(userId), value: { pausedAt: Date.now(), userId } })
  } else {
    await db.meta.delete(pausedKey(userId))
  }
}

/**
 * Heuristic: returns true if local IndexedDB shows any sign of real gameplay
 * beyond defaults. False on a freshly-installed app (with only the 2 P5
 * starter doctors seeded by ensureSeed).
 */
export async function hasNonDefaultHospitalState(db: HospitalDB): Promise<boolean> {
  const counters = await db.gameCounters.get('singleton')
  if (counters) {
    if ((counters.revenue ?? 0) > 0) return true
    if ((counters.reputation ?? 0) > 0) return true
    if (counters.tier && counters.tier !== '診所') return true
    if (counters.hasUsedStarterPull) return true
  }
  const gachaStats = await db.gachaStats.get('global')
  if (gachaStats && (gachaStats.totalRolls ?? 0) > 0) return true
  // 2 starter doctors seeded via ensureSeed; > 2 means user has rolled at least once
  if ((await db.doctors.count()) > 2) return true
  if ((await db.questionHistory.count()) > 0) return true
  // Any mastery row with correct/total > 0 means quiz activity
  let masteryActive = false
  await db.mastery.each((row) => {
    const r = row as MasteryRow
    if ((r.correct ?? 0) > 0 || (r.total ?? 0) > 0) masteryActive = true
  })
  if (masteryActive) return true
  // Any affinity row exists (affinity is recruitment-quiz progress)
  if ((await db.affinity.count()) > 0) {
    let affinityActive = false
    await db.affinity.each((row) => {
      const r = row as AffinityRow
      if ((r.correctCount ?? 0) > 0) affinityActive = true
    })
    if (affinityActive) return true
  }
  return false
}

export async function cloudHasAnyRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  for (const adapter of HOSPITAL_ADAPTERS) {
    const { count, error } = await supabase
      .from(adapter.postgresTable)
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (error) throw error
    if ((count ?? 0) > 0) return true
  }
  return false
}

export async function getMaxLocalUpdatedAt(db: HospitalDB): Promise<number | null> {
  let max: number | null = null
  function bump(v: unknown): void {
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (max === null || v > max) max = v
    }
  }
  const counters = (await db.gameCounters.get('singleton')) as
    | (GameCountersRow & { _updatedAt?: number })
    | undefined
  bump(counters?._updatedAt)
  const gachaStats = (await db.gachaStats.get('global')) as
    | (GachaStatsRow & { _updatedAt?: number })
    | undefined
  bump(gachaStats?._updatedAt)
  const tickets = (await db.tickets.get('global')) as
    | (TicketsRow & { _updatedAt?: number })
    | undefined
  bump(tickets?._updatedAt)
  await db.rooms.each((row) => bump((row as RoomRow & { _updatedAt?: number })._updatedAt))
  await db.affinity.each((row) =>
    bump((row as AffinityRow & { _updatedAt?: number })._updatedAt),
  )
  await db.doctors.each((row) => bump((row as DoctorRow & { _updatedAt?: number })._updatedAt))
  await db.mastery.each((row) => bump((row as MasteryRow & { _updatedAt?: number })._updatedAt))
  await db.questionHistory.each((row) =>
    bump((row as QuestionHistoryRow & { _updatedAt?: number })._updatedAt),
  )
  return max
}

export async function getMaxCloudUpdatedAt(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  let max: number | null = null
  for (const adapter of HOSPITAL_ADAPTERS) {
    const { data, error } = await supabase
      .from(adapter.postgresTable)
      .select('updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
    if (error) throw error
    const ts = data?.[0]?.updated_at as string | undefined
    if (ts) {
      const ms = Date.parse(ts)
      if (Number.isFinite(ms) && (max === null || ms > max)) max = ms
    }
  }
  return max
}

export async function computeGateState(
  supabase: SupabaseClient,
  userId: string,
): Promise<GateSnapshot> {
  const db = getHospitalDB()

  const choice = await getMigrationChoice(db, userId)
  if (choice) {
    if (choice.choice === 'keep-separate') {
      return { state: 'keep-separate', localMaxUpdatedAt: null, cloudMaxUpdatedAt: null }
    }
    return { state: 'resolved', localMaxUpdatedAt: null, cloudMaxUpdatedAt: null }
  }

  if (await isPausedForUser(db, userId)) {
    const [localMax, cloudMax] = await Promise.all([
      getMaxLocalUpdatedAt(db),
      getMaxCloudUpdatedAt(supabase, userId).catch(() => null),
    ])
    return { state: 'paused', localMaxUpdatedAt: localMax, cloudMaxUpdatedAt: cloudMax }
  }

  const [hasLocal, hasCloud] = await Promise.all([
    hasNonDefaultHospitalState(db),
    cloudHasAnyRows(supabase, userId),
  ])

  if (!hasLocal && !hasCloud) {
    return { state: 'fresh-start', localMaxUpdatedAt: null, cloudMaxUpdatedAt: null }
  }
  if (!hasLocal && hasCloud) {
    return { state: 'silent-pull', localMaxUpdatedAt: null, cloudMaxUpdatedAt: null }
  }
  const [localMax, cloudMax] = await Promise.all([
    getMaxLocalUpdatedAt(db),
    hasCloud ? getMaxCloudUpdatedAt(supabase, userId).catch(() => null) : Promise.resolve(null),
  ])
  if (hasLocal && !hasCloud) {
    return { state: 'migration-upload', localMaxUpdatedAt: localMax, cloudMaxUpdatedAt: null }
  }
  return { state: 'conflict-chooser', localMaxUpdatedAt: localMax, cloudMaxUpdatedAt: cloudMax }
}

/**
 * Snapshot all cloud-synced Dexie tables into the localBackup table. Called
 * before「Use cloud overwrites local」or any future destructive sign-in action.
 */
export async function snapshotLocalToBackup(
  db: HospitalDB,
  userId: string,
  reason: string,
): Promise<string> {
  const takenAt = Date.now()
  const key = `snapshot-${new Date(takenAt).toISOString()}`
  const [gameCounters, gachaStats, tickets, rooms, affinity, doctors, mastery, questionHistory] =
    await Promise.all([
      db.gameCounters.get('singleton').then((r) => r ?? null),
      db.gachaStats.get('global').then((r) => r ?? null),
      db.tickets.get('global').then((r) => r ?? null),
      db.rooms.toArray(),
      db.affinity.toArray(),
      db.doctors.toArray(),
      db.mastery.toArray(),
      db.questionHistory.toArray(),
    ])
  const record: HospitalLocalBackupRecord = {
    key,
    takenAt,
    userId,
    reason,
    hospitalState: {
      gameCounters,
      gachaStats,
      tickets,
      rooms,
      affinity,
    },
    doctors,
    mastery,
    questionHistory,
  }
  await db.localBackup.put(record)
  return key
}

/**
 * Wipe local cloud-synced tables. Called only after snapshotLocalToBackup
 * succeeds, in service of「Use cloud overwrites local」. Meta + localBackup
 * are NOT touched (they hold the user's migration prefs + the backup itself).
 */
export async function wipeLocalSyncedTables(db: HospitalDB): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.gameCounters,
      db.gachaStats,
      db.tickets,
      db.rooms,
      db.affinity,
      db.doctors,
      db.mastery,
      db.questionHistory,
    ],
    async () => {
      await db.gameCounters.clear()
      await db.gachaStats.clear()
      await db.tickets.clear()
      await db.rooms.clear()
      await db.affinity.clear()
      await db.doctors.clear()
      await db.mastery.clear()
      await db.questionHistory.clear()
    },
  )
}
