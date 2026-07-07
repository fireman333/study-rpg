// TableAdapter — snapshot/apply per Dexie store for neurons-tw cloud sync.
//
// Each adapter encapsulates: (a) read entire store into a serializable array
// and (b) merge an incoming array back into the store with LWW semantics.
//
// Design: rather than per-row CloudRow indirection (medexam-tw pattern, which
// mirrors Supabase upsert_lww shape), neurons-tw uses direct Dexie row shapes
// in the bundle. Simpler — neurons-tw never had a Supabase data path.

import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import type { NeuronsDB, QuestionHistoryRow } from '../db'
import { PER_FAMILY_CELEBRATION_KEYS } from '../services/maze-celebration'
// Single source of the NG-0717 imprint key prefix (minted by the prescription
// service) — re-exported below as IMPRINT_SYNC_PREFIX so the sync filter can never
// drift from the key mint. prescription.ts imports nothing from lib/sync → no cycle.
import { IMPRINT_PREFIX } from '../services/prescription'

/**
 * Per-family maze economy keys (redesign-neurons-maze-rotjs-grid) — 11 families ×
 * { earned, settles } = 22 MONOTONIC counters (MAX-merge post-pass in
 * backfill/counters.ts converges them cross-device). Replaces the 8 retired
 * four-branch keys. Derived from FAMILY_IDS so the maze module + sync allowlist +
 * counter post-pass never drift.
 */
export const PER_FAMILY_MAZE_KEYS: string[] = FAMILY_IDS.flatMap((f) => [
  `maze:${f}:earned`,
  `maze:${f}:settles`,
])

/** Result of applying a single incoming row. */
export type ApplyOutcome = 'wrote' | 'skipped' | 'merged'

export interface TableAdapter<TName extends string = string> {
  /** Stable identifier used as the JSON key in the bundle. */
  name: TName
  /** Read every row currently in the store. Returned objects must be JSON-safe. */
  snapshot(db: NeuronsDB): Promise<unknown[]>
  /** Merge the incoming rows into the store with LWW resolution. */
  apply(db: NeuronsDB, rows: unknown[]): Promise<{ applied: number; skipped: number }>
}

// ---- LWW helpers ----------------------------------------------------------

function pickUpdatedAt(row: unknown): number | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.updatedAt === 'number') return r.updatedAt
  if (typeof r.updated_at === 'number') return r.updated_at
  if (typeof r.unlockedAt === 'number') return r.unlockedAt
  if (typeof r.rolledAt === 'number') return r.rolledAt
  return null
}

/**
 * LWW resolver: keep the row with the greater `updatedAt` (or equivalent
 * monotonic field). When neither side has a timestamp, prefer incoming
 * (incoming was authoritative at push time).
 */
function lwwPick<T>(local: T | undefined, incoming: T): T {
  if (local === undefined) return incoming
  const a = pickUpdatedAt(local)
  const b = pickUpdatedAt(incoming)
  if (a === null && b === null) return incoming
  if (a === null) return incoming
  if (b === null) return local
  return b >= a ? incoming : local
}

// ---- Synapses -------------------------------------------------------------

const synapsesAdapter: TableAdapter<'synapses'> = {
  name: 'synapses',
  async snapshot(db) {
    return await db.synapses.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.synapses, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const pairKey = row.pairKey
        if (typeof pairKey !== 'string') {
          skipped++
          continue
        }
        const local = await db.synapses.get(pairKey)
        // Synapses don't carry updatedAt; use lastCoFireDate as a proxy
        // (ISO date string, lexicographic compare = chronological).
        const localDate = (local as unknown as Record<string, unknown> | undefined)?.lastCoFireDate
        const incomingDate = row.lastCoFireDate
        if (
          local !== undefined &&
          typeof localDate === 'string' &&
          typeof incomingDate === 'string' &&
          localDate > incomingDate
        ) {
          skipped++
          continue
        }
        await db.synapses.put(incoming as never)
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Family accrual -------------------------------------------------------

const familyAccrualAdapter: TableAdapter<'familyAccrual'> = {
  name: 'familyAccrual',
  async snapshot(db) {
    return await db.familyAccrual.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.familyAccrual, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const familyId = (incoming as Record<string, unknown>).familyId
        if (typeof familyId !== 'string') {
          skipped++
          continue
        }
        const local = await db.familyAccrual.get(familyId)
        const localRec = local as unknown as Record<string, unknown> | undefined
        const incRec = incoming as Record<string, unknown>
        // AP + pullCount are both monotonic per family → MAX-merge each. The
        // higher-AP row supplies the non-counter fields (firedToday / dates), but
        // pullCount (the P0 pity clock) is ALWAYS MAX-merged independently.
        const localAp = typeof localRec?.ap === 'number' ? (localRec.ap as number) : -1
        const incomingAp = typeof incRec.ap === 'number' ? (incRec.ap as number) : -1
        const localPull = typeof localRec?.pullCount === 'number' ? (localRec.pullCount as number) : 0
        const incPull = typeof incRec.pullCount === 'number' ? (incRec.pullCount as number) : 0
        const mergedPull = Math.max(localPull, incPull)
        if (incomingAp < localAp) {
          // Keep local non-counter fields, but still MAX-merge pullCount.
          if (local && mergedPull !== localPull) {
            await db.familyAccrual.put({ ...(local as object), pullCount: mergedPull } as never)
            applied++
          } else {
            skipped++
          }
          continue
        }
        await db.familyAccrual.put({ ...(incoming as object), pullCount: mergedPull } as never)
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Family mastery -------------------------------------------------------

const familyMasteryAdapter: TableAdapter<'familyMastery'> = {
  name: 'familyMastery',
  async snapshot(db) {
    return await db.familyMastery.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.familyMastery, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const familyId = (incoming as Record<string, unknown>).familyId
        if (typeof familyId !== 'string') {
          skipped++
          continue
        }
        const local = await db.familyMastery.get(familyId)
        // Counters are monotonic — MAX-merge both correct and total.
        const localCorrect = ((local as unknown as Record<string, unknown> | undefined)?.correct ?? 0) as number
        const localTotal = ((local as unknown as Record<string, unknown> | undefined)?.total ?? 0) as number
        const incCorrect = ((incoming as Record<string, unknown>).correct ?? 0) as number
        const incTotal = ((incoming as Record<string, unknown>).total ?? 0) as number
        await db.familyMastery.put({
          familyId,
          correct: Math.max(localCorrect, incCorrect),
          total: Math.max(localTotal, incTotal),
        })
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Neuron variants ------------------------------------------------------

const neuronVariantsAdapter: TableAdapter<'neuronVariants'> = {
  name: 'neuronVariants',
  async snapshot(db) {
    return await db.neuronVariants.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.neuronVariants, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const familyId = row.familyId
        const slotIndex = row.slotIndex
        if (typeof familyId !== 'string' || typeof slotIndex !== 'number') {
          skipped++
          continue
        }
        const local = await db.neuronVariants.get([familyId, slotIndex])
        // Collection 2.0: row IDENTITY + content (rarity / displayName / spriteKey
        // / provenance) is immutable once minted, but `copies` mutates on dupe
        // pulls → MAX-merge carve-out (mirrors the everWrong / dmnEventLog
        // monotonic discipline). Keep local content; take MAX(copies) + earliest
        // rolledAt. DO NOT replace copies-MAX with LWW.
        if (local) {
          const localCopies = typeof local.copies === 'number' ? local.copies : 1
          const incCopies = typeof row.copies === 'number' ? (row.copies as number) : 1
          const mergedCopies = Math.max(localCopies, incCopies)
          const incRolledAt = typeof row.rolledAt === 'number' ? (row.rolledAt as number) : local.rolledAt
          const mergedRolledAt = Math.min(local.rolledAt, incRolledAt)
          if (mergedCopies !== localCopies || mergedRolledAt !== local.rolledAt) {
            await db.neuronVariants.put({ ...local, copies: mergedCopies, rolledAt: mergedRolledAt })
            applied++
          } else {
            skipped++
          }
          continue
        }
        await db.neuronVariants.put(incoming as never)
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Mock-exam variants ---------------------------------------------------

const mockExamVariantsAdapter: TableAdapter<'mockExamVariants'> = {
  name: 'mockExamVariants',
  async snapshot(db) {
    return await db.mockExamVariants.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.mockExamVariants, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const variantId = row.variantId
        if (typeof variantId !== 'string') {
          skipped++
          continue
        }
        const local = await db.mockExamVariants.get(variantId)
        // Mirror the neuronVariants discipline: row content (rarity/displayName/
        // spriteKey) immutable once minted; `copies` MAX-merge, `firstRolledAt`
        // MIN-merge, `lastRolledAt` MAX-merge. Ownership is monotonic (a row
        // never un-collects) and re-applying the same bundle is idempotent.
        if (local) {
          const localCopies = typeof local.copies === 'number' ? local.copies : 1
          const incCopies = typeof row.copies === 'number' ? (row.copies as number) : 1
          const mergedCopies = Math.max(localCopies, incCopies)
          const incFirst =
            typeof row.firstRolledAt === 'number' ? (row.firstRolledAt as number) : local.firstRolledAt
          const mergedFirst = Math.min(local.firstRolledAt, incFirst)
          const incLast =
            typeof row.lastRolledAt === 'number' ? (row.lastRolledAt as number) : local.lastRolledAt
          const mergedLast = Math.max(local.lastRolledAt, incLast)
          if (
            mergedCopies !== localCopies ||
            mergedFirst !== local.firstRolledAt ||
            mergedLast !== local.lastRolledAt
          ) {
            await db.mockExamVariants.put({
              ...local,
              copies: mergedCopies,
              firstRolledAt: mergedFirst,
              lastRolledAt: mergedLast,
            })
            applied++
          } else {
            skipped++
          }
          continue
        }
        await db.mockExamVariants.put(incoming as never)
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Achievements ---------------------------------------------------------

const achievementsAdapter: TableAdapter<'achievements'> = {
  name: 'achievements',
  async snapshot(db) {
    return await db.achievements.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.achievements, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const id = (incoming as Record<string, unknown>).id
        if (typeof id !== 'string') {
          skipped++
          continue
        }
        const local = await db.achievements.get(id)
        // Achievements are first-unlock immutable — keep the EARLIER unlockedAt
        // when both sides have a row.
        if (local) {
          const localAt = local.unlockedAt
          const incomingAt = (incoming as Record<string, unknown>).unlockedAt
          if (typeof incomingAt === 'number' && incomingAt < localAt) {
            await db.achievements.put({
              id,
              unlockedAt: incomingAt,
              // Mark notificationShown=true on cross-device pull so the toast
              // never re-fires for an already-unlocked achievement.
              notificationShown: true,
            })
            applied++
          } else {
            skipped++
          }
          continue
        }
        // First time seeing — write with notificationShown=true so silent
        // backfill discipline holds for cross-device pull.
        const row = incoming as Record<string, unknown>
        await db.achievements.put({
          id,
          unlockedAt: typeof row.unlockedAt === 'number' ? row.unlockedAt : Date.now(),
          notificationShown: true,
        })
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Leaderboard profile (single row keyed by user_id) ---------------------

const leaderboardProfileAdapter: TableAdapter<'leaderboardProfile'> = {
  name: 'leaderboardProfile',
  async snapshot(db) {
    return await db.leaderboardProfile.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.leaderboardProfile, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const userId = (incoming as Record<string, unknown>).user_id
        if (typeof userId !== 'string') {
          skipped++
          continue
        }
        const local = await db.leaderboardProfile.get(userId)
        // LWW on last_pushed_at (newest push wins).
        const localPushed = ((local as unknown as Record<string, unknown> | undefined)?.last_pushed_at ?? 0) as number
        const incomingPushed = ((incoming as Record<string, unknown>).last_pushed_at ?? 0) as number
        if (local && localPushed > incomingPushed) {
          skipped++
          continue
        }
        await db.leaderboardProfile.put(lwwPick(local, incoming) as never)
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Meta (key-value scratchpad) ------------------------------------------

/**
 * Allowlist of meta keys that participate in cross-device sync. Anything not
 * listed stays local-only. The list intentionally excludes ephemeral state
 * like `lastResetDate` and `currentQuizCorrectStreak` (LWW will set on push;
 * see backfill/counters.ts for MAX-merge counters that ride on this adapter).
 */
export const SYNCED_META_KEYS: ReadonlySet<string> = new Set([
  'maxQuizCorrectStreak',
  'totalStudyMinutes',
  'currentQuizCorrectStreak',
  // Expedition completion streak (rework-neurons-connectome-expedition-driven).
  // First-write-wins like currentQuizCorrectStreak; the lazy daily reset re-derives
  // the streak from expeditionLastCompleteDate, so a brief stale sync self-heals.
  // The per-day repair / wired-pair / conduction-cap accumulators are date-keyed
  // ephemeral meta (roll at midnight) and are intentionally NOT synced.
  'expeditionStreak',
  'expeditionLastCompleteDate',
  // DMN fate-card trigger counters (per add-neurons-dmn-fate-card spec).
  // The entitlement pool is a DERIVED projection of two monotonic counters
  // (fix-neurons-dmn-draw-entitlement-resurrection): `dmnGrantsTotal` (granted)
  // and `dmnLifetimeDrawsConsumed` (spent) MAX-merge in backfill/dmn-daily.ts,
  // and `dmnDrawsAvailable` is RE-DERIVED there = clamp(grants − consumes, ≥0).
  // It rides this allowlist as a persisted display value (so a reader sees it),
  // but it is NOT merged by the first-write-wins below — dmn-daily.ts overwrites.
  // Daily axis counters reset at midnight so brief sync of stale values is OK.
  'dmnDrawsAvailable',
  'dmnGrantsTotal',
  'dmnLifetimeDrawsConsumed',
  'dmnTimeAxisMinutesAccrued',
  'dmnTimeAxisDrawsConsumedToday',
  'dmnBehaviorAxisDrawsConsumedToday',
  'dmnLastDailyResetDate',
  // DMN dispatcher state (single-row flags).
  // ('dmnStreakShieldAvailable' removed — integrity; add-neurons-acceleration-system)
  'dmnHiddenRevealedArtworkIds',
  // Variant collection: representative-variant selection (per
  // add-neurons-variant-collection-view). Timestamped envelope; LWW enforced
  // by backfill/representatives.ts post-pass (NOT the first-write-wins below).
  'representativeVariants',
  // Active squad selection (per add-neurons-study-squad). Timestamped envelope
  // `{ members, updatedAt }`; LWW enforced by backfill/active-squad.ts post-pass
  // (NOT the first-write-wins below).
  'activeSquad',
  // Neural-energy pull currency (Collection 2.0). Two MONOTONIC counters; the
  // real merge is the MAX-merge post-pass in backfill/counters.ts (balance =
  // earned − spent). RETIRED by promote-maze-to-home (manual pull removed) but
  // kept here present-but-unused for reader tolerance / rollback safety.
  'neuralEnergyEarned',
  'neuralEnergySpent',
  // Maze per-FAMILY energy economy (redesign-neurons-maze-rotjs-grid). 11 families
  // × { earned faucet, settle/pull count } = 22 MONOTONIC counters; MAX-merge
  // post-pass in backfill/counters.ts converges them cross-device. Spread from
  // PER_FAMILY_MAZE_KEYS (single source). The 8 retired four-branch keys
  // (`maze:{da,5ht,gaba,glu}:{earned,settles}`) are dropped here — the v17 upgrade
  // clears them locally; a stray incoming key is simply not in this allowlist.
  ...PER_FAMILY_MAZE_KEYS,
  // Per-family first-pull (add-neurons-first-pull-path-rep). `firstPullFamilies`
  // is a JSON-array SET of familyIds already first-pulled; merged by MONOTONIC
  // UNION via the backfill/first-pull.ts post-pass (the metaAdapter below is
  // first-write-wins, insufficient for a growing set) so the first-pull stays
  // one-time across all devices. The retired 4-branch `firstPullDone` +
  // `maze:<branch>:starterFamily` keys are DROPPED (leave-and-ignore — a stray
  // incoming legacy key is simply not in this allowlist).
  'firstPullFamilies',
  // Per-family second-lap completion celebration markers
  // (add-neurons-loop-celebration-animations). 11 `mazeSecondLapCelebrated:<familyId>`
  // keys — synced one-shot guard so a family's 全腦點亮 completion celebration plays
  // at most once across sessions + devices. SET-ONCE → the metaAdapter's
  // first-write-wins below is sufficient (presence is all that matters; a
  // divergent stamp from two offline completions is harmless). NO backfill
  // post-pass needed. Derived from FAMILY_IDS (single source in the service).
  ...PER_FAMILY_CELEBRATION_KEYS,
])

/**
 * Synced meta key PREFIXES — for dynamic key families that cannot be enumerated in
 * SYNCED_META_KEYS. NG-0717 lineage imprints (add-neurons-imprint-keepsake-sync) are
 * write-once presence keys `${IMPRINT_PREFIX}<subjectId>:<date>`, so the metaAdapter's
 * first-write-wins over them is a UNION keepsake. The prefix is exact to the imprint
 * family — it does NOT match sibling `prescription:v1:*` keys such as
 * `prescription:v1:completed:*` or `prescription:v1:localSeed` (those stay local-only).
 * Only WRITE-ONCE presence keys may ride a synced prefix (first-write-wins = UNION);
 * a mutating/deletable value would be merged incorrectly.
 *
 * The value is imported from the prescription service (which mints the keys) so the
 * sync filter and the key mint share ONE source and can never drift.
 */
export const IMPRINT_SYNC_PREFIX = IMPRINT_PREFIX

/**
 * Whether a meta key participates in cross-device sync: the enumerated allowlist OR a
 * registered synced prefix. Used by BOTH the metaAdapter snapshot (which rows enter the
 * bundle) and its apply (which incoming rows are accepted), so the two directions can
 * never diverge.
 */
export function isSyncedMetaKey(key: string): boolean {
  return SYNCED_META_KEYS.has(key) || key.startsWith(IMPRINT_SYNC_PREFIX)
}

const metaAdapter: TableAdapter<'meta'> = {
  name: 'meta',
  async snapshot(db) {
    const all = await db.meta.toArray()
    return all.filter((r) => isSyncedMetaKey(r.key))
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.meta, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const key = row.key
        if (typeof key !== 'string' || !isSyncedMetaKey(key)) {
          skipped++
          continue
        }
        // Counter MAX-merge is handled by backfill/counters.ts AFTER this
        // adapter runs (per design D5). Here we just write incoming if local
        // is missing; otherwise leave local alone — the backfill step will
        // resolve the final value.
        const local = await db.meta.get(key)
        if (!local) {
          await db.meta.put(incoming as never)
          applied++
        } else {
          skipped++
        }
      }
    })
    return { applied, skipped }
  },
}

// ---- DMN fate cards (closed-cap, first-write-wins per cardId) -------------

const dmnCardsAdapter: TableAdapter<'dmnCards'> = {
  name: 'dmnCards',
  async snapshot(db) {
    return await db.dmnCards.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.dmnCards, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const cardId = (incoming as Record<string, unknown>).cardId
        if (typeof cardId !== 'string') {
          skipped++
          continue
        }
        const local = await db.dmnCards.get(cardId)
        // Closed-cap collection — first draw wins. Keep the EARLIER obtainedAt
        // if both sides have a row (parallels achievement first-unlock semantics).
        if (local) {
          const localAt = local.obtainedAt
          const incomingAt = (incoming as Record<string, unknown>).obtainedAt
          if (typeof incomingAt === 'number' && incomingAt < localAt) {
            await db.dmnCards.put(incoming as never)
            applied++
          } else {
            skipped++
          }
          continue
        }
        await db.dmnCards.put(incoming as never)
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- DMN event log (MONOTONIC-UNION merge — never overwrite "dispatched") -

const dmnEventLogAdapter: TableAdapter<'dmnEventLog'> = {
  name: 'dmnEventLog',
  async snapshot(db) {
    return await db.dmnEventLog.toArray()
  },
  async apply(db, rows) {
    // Critical: this adapter uses MONOTONIC-UNION merge (NOT LWW). Once any
    // device has logged a cardId as dispatched, that signal must propagate
    // across all devices and never be overwritten — otherwise a fresh-state
    // device would re-trigger the event when its bundle apply runs. Mirrors
    // 二階 add-bookmarks-filters-and-wrong-history-medexam2's `everWrong`
    // monotonic-OR discipline.
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.dmnEventLog, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const cardId = (incoming as Record<string, unknown>).cardId
        if (typeof cardId !== 'string') {
          skipped++
          continue
        }
        const local = await db.dmnEventLog.get(cardId)
        if (local) {
          // Already logged here — preserve EARLIER dispatchedAt (provenance
          // for first-dispatch instant).
          const localAt = local.dispatchedAt
          const incomingAt = (incoming as Record<string, unknown>).dispatchedAt
          if (typeof incomingAt === 'number' && incomingAt < localAt) {
            await db.dmnEventLog.put(incoming as never)
            applied++
          } else {
            skipped++
          }
          continue
        }
        // Union: incoming had it, we didn't — record without re-triggering
        // the side effect (dispatcher reads this log to short-circuit).
        await db.dmnEventLog.put(incoming as never)
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- DMN active buffs (LWW on expiresAt; filter expired after merge) -----

const dmnActiveBuffsAdapter: TableAdapter<'dmnActiveBuffs'> = {
  name: 'dmnActiveBuffs',
  async snapshot(db) {
    // Only sync non-expired rows — no point pushing stale buffs.
    const now = Date.now()
    const all = await db.dmnActiveBuffs.toArray()
    return all.filter((b) => b.expiresAt > now)
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    const now = Date.now()
    await db.transaction('rw', db.dmnActiveBuffs, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const expiresAt = row.expiresAt
        // Reject already-expired rows.
        if (typeof expiresAt !== 'number' || expiresAt <= now) {
          skipped++
          continue
        }
        // Match by sourceCardId — same source card cannot dispatch buff twice
        // (idempotent across devices via the event log; this adapter then
        // dedups the buff row itself).
        const sourceCardId = row.sourceCardId
        if (typeof sourceCardId !== 'string') {
          skipped++
          continue
        }
        const all = await db.dmnActiveBuffs.toArray()
        const existing = all.find((b) => b.sourceCardId === sourceCardId)
        if (existing) {
          skipped++
          continue
        }
        // Strip incoming.id — let Dexie auto-assign locally so we don't
        // collide with an existing auto-inc.
        const { id: _id, ...payload } = row
        await db.dmnActiveBuffs.add(payload as never)
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Question bookmarks (Dexie v7 — add-neurons-question-bookmarks) ----

const questionBookmarksAdapter: TableAdapter<'questionBookmarks'> = {
  name: 'questionBookmarks',
  async snapshot(db) {
    return await db.questionBookmarks.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.questionBookmarks, db.questionBookmarkTombstones, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const questionId = row.questionId
        if (typeof questionId !== 'string') {
          skipped++
          continue
        }
        const updatedAt = pickUpdatedAt(row)
        if (updatedAt === null) {
          skipped++
          continue
        }
        // Check tombstone: if local tombstone is newer than incoming bookmark,
        // the bookmark was deleted later — keep deleted (skip the incoming row).
        const tomb = await db.questionBookmarkTombstones.get(questionId)
        if (tomb && tomb.updatedAt > updatedAt) {
          skipped++
          continue
        }
        const existing = await db.questionBookmarks.get(questionId)
        if (existing && existing.updatedAt >= updatedAt) {
          skipped++
          continue
        }
        // Re-add un-deletes — clear stale tombstone since incoming bookmark
        // post-dates it.
        if (tomb && tomb.updatedAt <= updatedAt) {
          await db.questionBookmarkTombstones.delete(questionId)
        }
        await db.questionBookmarks.put(row as never)
        applied++
      }
    })
    return { applied, skipped }
  },
}

const questionBookmarkTombstonesAdapter: TableAdapter<'questionBookmarkTombstones'> = {
  name: 'questionBookmarkTombstones',
  async snapshot(db) {
    return await db.questionBookmarkTombstones.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.questionBookmarks, db.questionBookmarkTombstones, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const questionId = row.questionId
        if (typeof questionId !== 'string') {
          skipped++
          continue
        }
        const updatedAt = pickUpdatedAt(row)
        if (updatedAt === null) {
          skipped++
          continue
        }
        const existing = await db.questionBookmarkTombstones.get(questionId)
        if (existing && existing.updatedAt >= updatedAt) {
          skipped++
          continue
        }
        await db.questionBookmarkTombstones.put({ questionId, updatedAt })
        // Delete propagation: if incoming tombstone post-dates a local
        // bookmark, remove that local bookmark.
        const bookmark = await db.questionBookmarks.get(questionId)
        if (bookmark && bookmark.updatedAt < updatedAt) {
          await db.questionBookmarks.delete(questionId)
        }
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Question flags (Dexie v8 — add-neurons-srs-binary-modifiers) ----

const questionFlagsAdapter: TableAdapter<'questionFlags'> = {
  name: 'questionFlags',
  async snapshot(db) {
    return await db.questionFlags.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.questionFlags, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const questionId = row.questionId
        if (typeof questionId !== 'string') {
          skipped++
          continue
        }
        const updatedAt = pickUpdatedAt(row)
        if (updatedAt === null) {
          skipped++
          continue
        }
        const existing = await db.questionFlags.get(questionId)
        if (existing && existing.updatedAt >= updatedAt) {
          skipped++
          continue
        }
        // Four coexisting boolean flags (add-neurons-weakness-radar-and-error-repair):
        // easyMarked / guessedMarked / wrongAnswerMarked / insightMarked. Coerce
        // defensively — an older client omits the two error-cause fields entirely.
        // PRESERVE-ON-OMISSION: when the incoming row omits a field (not present in
        // its keys), keep the locally-set value rather than clearing it to false, so
        // a peer that never learned about a flag can't wipe it. Only an explicitly
        // present field overwrites. Additive — no R2 SCHEMA_VERSION bump.
        const pick = (key: string, prev: boolean | undefined): boolean =>
          key in row ? !!row[key] : (prev ?? false)
        await db.questionFlags.put({
          questionId,
          easyMarked: pick('easyMarked', existing?.easyMarked),
          guessedMarked: pick('guessedMarked', existing?.guessedMarked),
          wrongAnswerMarked: pick('wrongAnswerMarked', existing?.wrongAnswerMarked),
          insightMarked: pick('insightMarked', existing?.insightMarked),
          updatedAt,
        })
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Question history (Dexie v9 — add-neurons-wrong-questions-subtab) ----

/**
 * Pick the optional SRS schedule fields off a row (incoming JSON or a local row)
 * for the questionHistory merge. Per add-neurons-quiz-mode-chips-and-srs: these
 * ride the row under plain row-level LWW (the everWrong monotonic-OR carve-out is
 * unchanged). A v(prev) client omits them → absent (defaults to fresh on read).
 */
function pickSrsFields(
  src: Record<string, unknown> | QuestionHistoryRow | undefined,
): Partial<Pick<QuestionHistoryRow, 'interval' | 'easeFactor' | 'nextDueAt' | 'attempts' | 'correctCount'>> {
  if (!src) return {}
  const out: Record<string, unknown> = {}
  if (typeof src.interval === 'number') out.interval = src.interval
  if (typeof src.easeFactor === 'number') out.easeFactor = src.easeFactor
  if (typeof src.nextDueAt === 'number' || src.nextDueAt === null) out.nextDueAt = src.nextDueAt
  if (typeof src.attempts === 'number') out.attempts = src.attempts
  if (typeof src.correctCount === 'number') out.correctCount = src.correctCount
  return out
}

const questionHistoryAdapter: TableAdapter<'questionHistory'> = {
  name: 'questionHistory',
  async snapshot(db) {
    return await db.questionHistory.toArray()
  },
  async apply(db, rows) {
    // Critical: `everWrong` uses MONOTONIC-OR merge (NOT LWW). Once any device
    // records a question as ever-wrong, that signal must propagate and never be
    // cleared by a stale `correct` row — otherwise the 歷史曾錯 list would lose
    // entries on a cross-device race. Mirrors 二階 wrong-answer-list everWrong
    // discipline + neurons dmnEventLog monotonic-union. The other fields
    // (lastResult / family / lastAnsweredAt) resolve by LWW on the greater
    // lastAnsweredAt. DO NOT replace everWrong with plain LWW.
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.questionHistory, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const questionId = row.questionId
        if (typeof questionId !== 'string') {
          skipped++
          continue
        }
        const incLastAnsweredAt = typeof row.lastAnsweredAt === 'number' ? row.lastAnsweredAt : 0
        const incEverWrong = row.everWrong === true
        const incLastResult = row.lastResult === 'wrong' ? 'wrong' : 'correct'
        const incFamily = typeof row.family === 'string' ? row.family : ''
        const incUpdatedAt = typeof row.updatedAt === 'number' ? row.updatedAt : incLastAnsweredAt
        const local = await db.questionHistory.get(questionId)
        if (!local) {
          await db.questionHistory.put({
            questionId,
            family: incFamily,
            lastResult: incLastResult,
            everWrong: incEverWrong,
            lastAnsweredAt: incLastAnsweredAt,
            updatedAt: incUpdatedAt,
            // SRS schedule rides the row (v15+); a v<15 client omits these.
            ...pickSrsFields(row),
          })
          applied++
          continue
        }
        // incoming wins on ties (mirrors lwwPick `b >= a`).
        const incomingNewer = incLastAnsweredAt >= local.lastAnsweredAt
        // SRS fields follow row-level LWW. But a put() replaces the whole row, so
        // a newer-but-pre-v15 incoming (no SRS fields) must NOT wipe the local
        // schedule — only adopt incoming SRS when it actually carries fields.
        const incSrs = pickSrsFields(row)
        const localSrs = pickSrsFields(local)
        const srs = incomingNewer && Object.keys(incSrs).length > 0 ? incSrs : localSrs
        await db.questionHistory.put({
          questionId,
          family: incomingNewer && incFamily ? incFamily : local.family,
          lastResult: incomingNewer ? incLastResult : local.lastResult,
          everWrong: local.everWrong || incEverWrong, // monotonic-OR
          lastAnsweredAt: Math.max(local.lastAnsweredAt, incLastAnsweredAt),
          updatedAt: Math.max(local.updatedAt, incUpdatedAt),
          ...srs,
        })
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Neuron individuals (Dexie v13 — add-neurons-dupe-fusion) -------------

const neuronInstancesAdapter: TableAdapter<'neuronInstances'> = {
  name: 'neuronInstances',
  async snapshot(db) {
    // Snapshot ALL instances incl. consumed — consumed must propagate so a
    // promoted-away individual never resurrects on the other device.
    return await db.neuronInstances.toArray()
  },
  async apply(db, rows) {
    // Critical: UNION by instanceId (individuals are immutable) + `consumedAt`
    // resolves MONOTONIC-OR (once set on either side it stays set, keep the
    // EARLIER instant). A tier-promote soft-deletes by setting consumedAt; this
    // discipline guarantees a consumed individual never resurrects cross-device.
    // Mirrors dmnEventLog monotonic-union + questionHistory everWrong. DO NOT
    // replace with LWW.
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.neuronInstances, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const instanceId = row.instanceId
        if (typeof instanceId !== 'string') {
          skipped++
          continue
        }
        const incConsumedAt = typeof row.consumedAt === 'number' ? (row.consumedAt as number) : null
        const local = await db.neuronInstances.get(instanceId)
        if (!local) {
          await db.neuronInstances.put(incoming as never)
          applied++
          continue
        }
        // Both sides have it — resolve consumedAt monotonic-OR (earliest non-null).
        const localConsumed = local.consumedAt
        let mergedConsumed: number | null = localConsumed
        if (incConsumedAt !== null) {
          mergedConsumed = localConsumed === null ? incConsumedAt : Math.min(localConsumed, incConsumedAt)
        }
        if (mergedConsumed !== localConsumed) {
          await db.neuronInstances.put({ ...local, consumedAt: mergedConsumed })
          applied++
        } else {
          skipped++
        }
      }
    })
    return { applied, skipped }
  },
}

// ---- Instance nicknames (Dexie v14 — add-neurons-instance-rename) ---------

const instanceNicknamesAdapter: TableAdapter<'instanceNicknames'> = {
  name: 'instanceNicknames',
  async snapshot(db) {
    return await db.instanceNicknames.toArray()
  },
  async apply(db, rows) {
    // Per-row LWW on updatedAt (mirrors questionFlags). NOT monotonic — a
    // nickname is mutable + clearable; a cleared nickname is an empty-string
    // row with a fresh updatedAt (NOT a delete), which propagates under LWW.
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.instanceNicknames, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const instanceId = row.instanceId
        if (typeof instanceId !== 'string') {
          skipped++
          continue
        }
        const updatedAt = pickUpdatedAt(row)
        if (updatedAt === null) {
          skipped++
          continue
        }
        const existing = await db.instanceNicknames.get(instanceId)
        if (existing && existing.updatedAt >= updatedAt) {
          skipped++
          continue
        }
        await db.instanceNicknames.put({
          instanceId,
          nickname: typeof row.nickname === 'string' ? row.nickname : '',
          updatedAt,
        })
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Inventory (Dexie v16 — add-neurons-acceleration-system) --------------

const inventoryAdapter: TableAdapter<'inventory'> = {
  name: 'inventory',
  async snapshot(db) {
    return await db.inventory.toArray()
  },
  async apply(db, rows) {
    // Per-row LWW on updatedAt, keyed by `kind` (mirrors instanceNicknames).
    // Stock is mutable (deposit on draw / decrement on activate) so LWW, NOT
    // monotonic. Preserve-on-omission: an absent key leaves local stock intact.
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.inventory, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const kind = row.kind
        if (typeof kind !== 'string') {
          skipped++
          continue
        }
        const updatedAt = pickUpdatedAt(row)
        if (updatedAt === null) {
          skipped++
          continue
        }
        const existing = await db.inventory.get(kind as never)
        if (existing && existing.updatedAt >= updatedAt) {
          skipped++
          continue
        }
        await db.inventory.put({
          kind: kind as never,
          count: typeof row.count === 'number' && row.count >= 0 ? Math.floor(row.count) : 0,
          updatedAt,
        })
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Equipment (Dexie v16 — add-neurons-acceleration-system) ---------------

const equipmentAdapter: TableAdapter<'equipment'> = {
  name: 'equipment',
  async snapshot(db) {
    return await db.equipment.toArray()
  },
  async apply(db, rows) {
    // UNION by equipmentId, MONOTONIC on presence — owning a permanent never
    // un-owns (mirrors neuronInstances / dmnEventLog). On both-present keep the
    // EARLIER obtainedAt (provenance) + the later updatedAt; never delete.
    // DO NOT replace with LWW (a stale empty side must not un-own).
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.equipment, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const equipmentId = row.equipmentId
        if (typeof equipmentId !== 'string') {
          skipped++
          continue
        }
        const local = await db.equipment.get(equipmentId as never)
        if (!local) {
          await db.equipment.put(incoming as never)
          applied++
          continue
        }
        const incObtained = typeof row.obtainedAt === 'number' ? (row.obtainedAt as number) : local.obtainedAt
        const incUpdated = typeof row.updatedAt === 'number' ? (row.updatedAt as number) : 0
        const mergedObtained = Math.min(local.obtainedAt, incObtained)
        const mergedUpdated = Math.max(local.updatedAt ?? 0, incUpdated)
        if (mergedObtained !== local.obtainedAt || mergedUpdated !== (local.updatedAt ?? 0)) {
          await db.equipment.put({ ...local, obtainedAt: mergedObtained, updatedAt: mergedUpdated })
          applied++
        } else {
          skipped++
        }
      }
    })
    return { applied, skipped }
  },
}

// ---- Connector neurons (Dexie v18 — add-neurons-connector-neuron-family) ----

const connectorNeuronsAdapter: TableAdapter<'connectorNeurons'> = {
  name: 'connectorNeurons',
  async snapshot(db) {
    return await db.connectorNeurons.toArray()
  },
  async apply(db, rows) {
    // UNION by pairKey, MONOTONIC on presence — an unlocked connector never
    // un-unlocks (mirrors equipment / neuronInstances / dmnEventLog). On
    // both-present keep the EARLIER unlockedAt (provenance) + the later updatedAt;
    // never delete. DO NOT replace with LWW (a stale device that hasn't seen the
    // unlock must not remove it).
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.connectorNeurons, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const pairKey = row.pairKey
        if (typeof pairKey !== 'string') {
          skipped++
          continue
        }
        const local = await db.connectorNeurons.get(pairKey as never)
        if (!local) {
          await db.connectorNeurons.put(incoming as never)
          applied++
          continue
        }
        const incUnlocked = typeof row.unlockedAt === 'number' ? (row.unlockedAt as number) : local.unlockedAt
        const incUpdated = typeof row.updatedAt === 'number' ? (row.updatedAt as number) : 0
        const mergedUnlocked = Math.min(local.unlockedAt, incUnlocked)
        const mergedUpdated = Math.max(local.updatedAt ?? 0, incUpdated)
        if (mergedUnlocked !== local.unlockedAt || mergedUpdated !== (local.updatedAt ?? 0)) {
          await db.connectorNeurons.put({ ...local, unlockedAt: mergedUnlocked, updatedAt: mergedUpdated })
          applied++
        } else {
          skipped++
        }
      }
    })
    return { applied, skipped }
  },
}

// ---- Adapter registry -----------------------------------------------------

export const NEURONS_ADAPTERS: ReadonlyArray<TableAdapter> = [
  synapsesAdapter,
  familyAccrualAdapter,
  familyMasteryAdapter,
  neuronVariantsAdapter,
  achievementsAdapter,
  leaderboardProfileAdapter,
  metaAdapter,
  dmnCardsAdapter,
  dmnEventLogAdapter,
  dmnActiveBuffsAdapter,
  questionBookmarksAdapter,
  questionBookmarkTombstonesAdapter,
  questionFlagsAdapter,
  questionHistoryAdapter,
  neuronInstancesAdapter,
  instanceNicknamesAdapter,
  inventoryAdapter,
  equipmentAdapter,
  connectorNeuronsAdapter,
  mockExamVariantsAdapter,
]
