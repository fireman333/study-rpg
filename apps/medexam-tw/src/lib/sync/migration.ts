// Migration / conflict detection helpers for sign-in resolution (M4 cloud sync).
//
// Decides which modal (if any) to show after sign-in. Persists user's choice
// per userId so we don't nag after a definitive answer.
//
// State machine (per design D7 + cloud-sync spec Req 7):
//
//   sign-in (authed)
//     ├─ choice already persisted → 'keep-separate' | 'resolved' (done, no modal)
//     ├─ local empty + cloud empty                → 'fresh-start' (start engine silently)
//     ├─ local empty + cloud has rows             → 'silent-pull' (start engine, kick pull)
//     ├─ local non-default + cloud empty          → 'migration-upload' (show MigrationUploadPrompt)
//     └─ local non-default + cloud has rows       → 'conflict-chooser' (show ConflictChooserModal)

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getDB,
  type LocalBackupRecord,
  type StudyRpgDB,
} from '@study-rpg/core'
import { ONE_STAGE_ADAPTERS } from './tables'

export type MigrationChoice =
  | 'keep-separate' // user opted out of sync for this account
  | 'uploaded' // user picked "Upload local progress"
  | 'cloud-chosen' // user picked "Use cloud overwrites local"
  | 'local-chosen' // user picked "Use local overwrites cloud"

export interface MigrationChoiceRecord {
  choice: MigrationChoice
  userId: string
  decidedAt: number
}

export type MigrationGateState =
  | 'pending' // computing
  | 'fresh-start' // both empty, engine can start silently
  | 'silent-pull' // local empty + cloud has rows, engine starts + pulls
  | 'migration-upload' // local non-default + cloud empty, show MigrationUploadPrompt
  | 'conflict-chooser' // both non-default, show ConflictChooserModal
  | 'keep-separate' // user previously chose to skip sync
  | 'resolved' // user previously picked Upload / Use-cloud / Use-local — proceed
  | 'paused' // user picked Decide later on conflict-chooser, sync paused

export interface GateSnapshot {
  state: MigrationGateState
  /** Max `_updatedAt` across cloud-synced local rows (ms), null if no rows. */
  localMaxUpdatedAt: number | null
  /** Max `updated_at` across cloud rows for this user (ms), null if no rows. */
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

/** Read user's previously-recorded migration choice (if any). */
export async function getMigrationChoice(
  db: StudyRpgDB,
  userId: string,
): Promise<MigrationChoiceRecord | null> {
  const row = await db.meta.get(choiceKey(userId))
  return (row?.value as MigrationChoiceRecord | undefined) ?? null
}

export async function setMigrationChoice(
  db: StudyRpgDB,
  userId: string,
  choice: MigrationChoice,
): Promise<void> {
  const record: MigrationChoiceRecord = { choice, userId, decidedAt: Date.now() }
  await db.meta.put({ key: choiceKey(userId), value: record })
}

/** Conflict-chooser "Decide later" persists a paused flag for this user. */
export async function isPausedForUser(db: StudyRpgDB, userId: string): Promise<boolean> {
  const row = await db.meta.get(pausedKey(userId))
  return Boolean(row?.value)
}

export async function setPausedForUser(
  db: StudyRpgDB,
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
 * beyond the `newPlayer('p1', ...)` defaults. False on a freshly-installed app.
 */
export async function hasNonDefaultLocalState(db: StudyRpgDB): Promise<boolean> {
  const player = await db.players.get('p1')
  if (player) {
    if ((player.xp ?? 0) > 0) return true
    if ((player.level ?? 1) > 1) return true
    if ((player.lootStats?.totalRolls ?? 0) > 0) return true
    if ((player.badges?.length ?? 0) > 0) return true
    if ((player.unlocks?.length ?? 0) > 0) return true
    if ((player.currentStreak ?? 0) > 0) return true
    if ((player.longestStreak ?? 0) > 0) return true
  }
  if ((await db.itemInstances.count()) > 0) return true
  if ((await db.srs.count()) > 0) return true
  if ((await db.attempts.count()) > 0) return true
  if (await db.mentorBacklog.get('mentorBacklog')) return true
  return false
}

/**
 * Check if Supabase has any rows owned by `userId` in any of the cloud-sync
 * tables. Returns true on the first hit (short-circuits). Network errors
 * propagate to the caller.
 */
export async function cloudHasAnyRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  for (const adapter of ONE_STAGE_ADAPTERS) {
    const { count, error } = await supabase
      .from(adapter.postgresTable)
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (error) throw error
    if ((count ?? 0) > 0) return true
  }
  return false
}

/** Max `_updatedAt` across cloud-synced Dexie rows (player + items + srs + mentor backlog). */
export async function getMaxLocalUpdatedAt(db: StudyRpgDB): Promise<number | null> {
  let max: number | null = null
  function bump(v: unknown): void {
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (max === null || v > max) max = v
    }
  }
  const player = (await db.players.get('p1')) as { _updatedAt?: number } | undefined
  bump(player?._updatedAt)
  await db.itemInstances.each((row) => bump((row as { _updatedAt?: number })._updatedAt))
  await db.srs.each((row) => bump((row as { _updatedAt?: number })._updatedAt))
  const mentor = (await db.mentorBacklog.get('mentorBacklog')) as
    | { _updatedAt?: number }
    | undefined
  bump(mentor?._updatedAt)
  return max
}

/** Max cloud `updated_at` (ms) for this user across all cloud-sync tables. */
export async function getMaxCloudUpdatedAt(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  let max: number | null = null
  for (const adapter of ONE_STAGE_ADAPTERS) {
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

/** Compute the gate state without side effects (other than the queries themselves). */
export async function computeGateState(
  supabase: SupabaseClient,
  userId: string,
): Promise<GateSnapshot> {
  const db = getDB()

  // Race-resistant guard (fix-sync-sign-in-lifecycle Bug 1, design.md D2):
  // await one Dexie read + brief settle delay so slow mobile cold-load
  // hydration doesn't misclassify as fresh-start. The 100ms settle is
  // calibrated from observed iPhone SE Dexie hydration timings (doubled
  // for safety). The useSync hook installs a 5s post-decision watcher
  // for the long tail where this still misses.
  await db.players.get('p1')
  await new Promise<void>((r) => setTimeout(r, 100))
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[sync.gate]', { phase: 'settle-end', userId })
  }

  // 1. Previously recorded explicit choices win.
  const choice = await getMigrationChoice(db, userId)
  if (choice) {
    if (choice.choice === 'keep-separate') {
      return { state: 'keep-separate', localMaxUpdatedAt: null, cloudMaxUpdatedAt: null }
    }
    // Upload / Use-cloud / Use-local already resolved — proceed normally.
    return { state: 'resolved', localMaxUpdatedAt: null, cloudMaxUpdatedAt: null }
  }

  // 2. "Decide later" pause overrides everything else until user re-decides.
  if (await isPausedForUser(db, userId)) {
    const [localMax, cloudMax] = await Promise.all([
      getMaxLocalUpdatedAt(db),
      getMaxCloudUpdatedAt(supabase, userId).catch(() => null),
    ])
    return { state: 'paused', localMaxUpdatedAt: localMax, cloudMaxUpdatedAt: cloudMax }
  }

  // 3. Fresh detection.
  const [hasLocal, hasCloud] = await Promise.all([
    hasNonDefaultLocalState(db),
    cloudHasAnyRows(supabase, userId),
  ])

  if (!hasLocal && !hasCloud) {
    return { state: 'fresh-start', localMaxUpdatedAt: null, cloudMaxUpdatedAt: null }
  }
  if (!hasLocal && hasCloud) {
    return { state: 'silent-pull', localMaxUpdatedAt: null, cloudMaxUpdatedAt: null }
  }
  // local non-default; need timestamps for the modal display
  const [localMax, cloudMax] = await Promise.all([
    getMaxLocalUpdatedAt(db),
    hasCloud ? getMaxCloudUpdatedAt(supabase, userId).catch(() => null) : Promise.resolve(null),
  ])
  if (hasLocal && !hasCloud) {
    return { state: 'migration-upload', localMaxUpdatedAt: localMax, cloudMaxUpdatedAt: null }
  }
  // both non-default
  return { state: 'conflict-chooser', localMaxUpdatedAt: localMax, cloudMaxUpdatedAt: cloudMax }
}

/**
 * Snapshot the cloud-synced Dexie tables into the `localBackup` table.
 * Returns the snapshot key. Called before "Use cloud overwrites local"
 * (and any other future destructive action).
 */
export async function snapshotLocalToBackup(
  db: StudyRpgDB,
  userId: string,
  reason: string,
): Promise<string> {
  const takenAt = Date.now()
  const key = `snapshot-${new Date(takenAt).toISOString()}`
  const [player, itemInstances, srsCards, mentorBacklog] = await Promise.all([
    db.players.get('p1').then((p) => p ?? null),
    db.itemInstances.toArray(),
    db.srs.toArray(),
    db.mentorBacklog.get('mentorBacklog').then((m) => m ?? null),
  ])
  const record: LocalBackupRecord = {
    key,
    takenAt,
    userId,
    reason,
    player: (player as LocalBackupRecord['player']) ?? null,
    itemInstances,
    srsCards,
    mentorBacklog: (mentorBacklog as LocalBackupRecord['mentorBacklog']) ?? null,
  }
  await db.localBackup.put(record)
  return key
}

/**
 * Wipe local cloud-synced tables (player + itemInstances + srs + mentorBacklog).
 * Called only after `snapshotLocalToBackup` succeeds, in service of "Use cloud
 * overwrites local". Other tables (attempts / bossRuns / mocks / drops) are
 * NOT touched — they are not cloud-mirrored, so deleting them would be data
 * loss not data replacement.
 */
export async function wipeLocalSyncedTables(db: StudyRpgDB): Promise<void> {
  await db.transaction(
    'rw',
    db.players,
    db.itemInstances,
    db.srs,
    db.mentorBacklog,
    async () => {
      await db.players.clear()
      await db.itemInstances.clear()
      await db.srs.clear()
      await db.mentorBacklog.clear()
    },
  )
}
