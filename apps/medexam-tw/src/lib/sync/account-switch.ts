// Account-switch infrastructure (fix-sync-sign-in-lifecycle Bug 2).
//
// When a different Google account signs into the same browser, we need to
// detect the mismatch BEFORE the existing migration / conflict gate runs —
// otherwise old-account data gets mis-classified as a conflict candidate and
// the user might unintentionally overwrite or merge across accounts.
//
// This module owns three responsibilities:
//   1. Persist the last-signed-in user id in db.meta (singleton key)
//   2. Read it back at sign-in time so useSync can compare against current
//   3. Wipe local sync state + migration-choice meta keys when user picks
//      「清空本地」 in the AccountSwitchPrompt
//
// IMPORTANT: this differs from the existing wipeLocalSyncedTables() in
// migration.ts — that one is invoked by the "Use cloud overwrites local"
// conflict-chooser path and intentionally preserves db.meta (the user's
// migration preference). Here, after a different account signs in we WANT
// to forget the previous user's migration choice as well, otherwise the
// resolved/keep-separate flag would persist across accounts.

import { getDB, type StudyRpgDB } from '@study-rpg/core'

const LAST_SIGNED_IN_KEY = 'last_signed_in_user_id'
const MIGRATION_CHOICE_PREFIX = 'migration_choice:'
const MIGRATION_PAUSED_PREFIX = 'migration_paused:'

export async function getLastSignedInUserId(db: StudyRpgDB = getDB()): Promise<string | null> {
  const row = await db.meta.get(LAST_SIGNED_IN_KEY)
  const v = row?.value
  return typeof v === 'string' ? v : null
}

export async function setLastSignedInUserId(
  db: StudyRpgDB,
  userId: string,
): Promise<void> {
  await db.meta.put({ key: LAST_SIGNED_IN_KEY, value: userId })
}

/**
 * Remove every migration-choice / paused meta key currently in db.meta.
 * Walks all rows (small table — at most a handful of keys per user) and
 * deletes anything matching the two known prefixes. Idempotent.
 */
export async function clearMigrationMetaKeys(db: StudyRpgDB): Promise<void> {
  const all = await db.meta.toArray()
  const toDelete: string[] = []
  for (const row of all) {
    if (
      row.key.startsWith(MIGRATION_CHOICE_PREFIX) ||
      row.key.startsWith(MIGRATION_PAUSED_PREFIX)
    ) {
      toDelete.push(row.key)
    }
  }
  if (toDelete.length === 0) return
  await db.meta.bulkDelete(toDelete)
}

/**
 * Clear ALL cloud-synced Dexie tables (player, items, srs, mentor backlog)
 * AND migration-choice meta keys. Used by the AccountSwitchPrompt 「清空本地」
 * path so the new account starts gameplay state from a clean slate.
 *
 * Does NOT touch:
 *   - last_signed_in_user_id (caller sets that to the new userId)
 *   - localBackup (preserved for safety; user can manually inspect if needed)
 *   - non-cloud-synced tables (attempts / drops / bossRuns / mockAttempts /
 *     readSessions) — those are local-only history that doesn't cross
 *     accounts in any meaningful way; clearing them would be extra data loss
 *     without solving anything
 */
export async function clearLocalSyncTables(db: StudyRpgDB): Promise<void> {
  await db.transaction(
    'rw',
    [db.players, db.itemInstances, db.srs, db.mentorBacklog, db.meta],
    async () => {
      await db.players.clear()
      await db.itemInstances.clear()
      await db.srs.clear()
      await db.mentorBacklog.clear()
      // Inline meta cleanup so the entire wipe is one transaction.
      const all = await db.meta.toArray()
      const toDelete = all
        .filter(
          (r) =>
            r.key.startsWith(MIGRATION_CHOICE_PREFIX) ||
            r.key.startsWith(MIGRATION_PAUSED_PREFIX),
        )
        .map((r) => r.key)
      if (toDelete.length) await db.meta.bulkDelete(toDelete)
    },
  )
}
