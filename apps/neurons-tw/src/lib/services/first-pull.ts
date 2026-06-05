/**
 * First-pull (首抽) orchestrator — the one-time starter ritual.
 *
 * A new player taps an explicit 首抽 CTA once; this runs FOUR pulls (one per NT
 * branch DA/5HT/GABA/Glu), each targeting a uniformly-random family within the
 * branch via the existing `pullVariant` path (real P0–P5 rarity, real provenance).
 * Pure GIFT: it does NOT touch the per-family settle economy (`maze:<familyId>:settles` /
 * `earned`) and does NOT route through `reconcileSettles`. Each rolled family's
 * representative maze node lights via the persisted starter-family meta keys
 * (see lib/maze/graph `litNodesWithStarter`).
 *
 * Once-only across devices: gated on `meta['firstPullDone']` (monotonic-OR — the
 * sync metaAdapter is write-if-missing and we never write 'false', so it
 * converges to true everywhere). Gating reads the flag, NOT collection emptiness,
 * so clearing the collection does not re-enable first-pull.
 *
 * Reveal: the four pulls run in `{ silent: true }` mode (no per-pull reveal, no
 * inline achievement toast); the FirstPullModal shows ONE combined reveal and
 * calls `finalizeFirstPullAchievements` on dismiss (achievements still unlock +
 * persist — boot backfill is the safety net if the user navigates away).
 *
 * Capability spec: openspec/specs/neurons-first-pull/spec.md
 */

import type { ContentPack } from '@study-rpg/core'
import { FAMILIES_BY_BRANCH, NT_BRANCHES, type NtBranchId } from '@study-rpg/content-neurons-tw'
import { db } from '../db'
import { pullVariant, type PullResult } from './variant-gacha'
import { buildAchievementStats, triggerAchievementCheck } from './achievement'
import { FIRST_PULL_DONE_KEY, starterFamilyKey, STARTER_FAMILY_KEYS } from './first-pull-keys'

// Re-export the key constants so existing importers can keep using `first-pull`.
export { FIRST_PULL_DONE_KEY, starterFamilyKey, STARTER_FAMILY_KEYS }

type ResolveFamilyDisplayName = (familyId: string) => string
type AchievementStats = Awaited<ReturnType<typeof buildAchievementStats>>

export async function isFirstPullDone(): Promise<boolean> {
  return (await db.meta.get(FIRST_PULL_DONE_KEY))?.value === 'true'
}

/** The first-pull starter family recorded for a branch, or null if unset. */
export async function readStarterFamily(branch: NtBranchId): Promise<string | null> {
  return (await db.meta.get(starterFamilyKey(branch)))?.value ?? null
}

export interface FirstPullDraw {
  branch: NtBranchId
  familyId: string
  pull: PullResult
}

export interface FirstPullOutcome {
  draws: FirstPullDraw[]
  /** Achievement stats captured BEFORE the four pulls (for the deferred check). */
  prevStats: AchievementStats
}

/**
 * Run the one-time first-pull. Returns the four draws + the pre-pull achievement
 * stats, or `null` if first-pull was already done (idempotent guard). Does NOT
 * run the achievement check (call `finalizeFirstPullAchievements` after reveal).
 */
export async function runFirstPull(
  resolveFamilyDisplayName: ResolveFamilyDisplayName,
): Promise<FirstPullOutcome | null> {
  if (await isFirstPullDone()) return null

  const prevStats = await buildAchievementStats()
  const draws: FirstPullDraw[] = []

  for (const branch of NT_BRANCHES) {
    const fams = FAMILIES_BY_BRANCH[branch]
    if (fams.length === 0) continue
    const familyId = fams[Math.floor(Math.random() * fams.length)]
    const pull = await pullVariant(familyId, resolveFamilyDisplayName, { silent: true })
    draws.push({ branch, familyId, pull })
    // Light the rolled family's representative node (even on a dupe — the family
    // is still represented). Only record when the pull actually succeeded.
    if (pull.ok) {
      await db.meta.put({ key: starterFamilyKey(branch), value: familyId })
    }
  }

  // Mark done LAST — after all four pulls + starter-family writes land.
  await db.meta.put({ key: FIRST_PULL_DONE_KEY, value: 'true' })

  return { draws, prevStats }
}

/**
 * Run the single deferred achievement check after the combined reveal is
 * dismissed. Safe to skip (boot backfill catches any unlocks silently).
 */
export async function finalizeFirstPullAchievements(prevStats: AchievementStats): Promise<void> {
  try {
    await triggerAchievementCheck(prevStats)
  } catch (e) {
    console.warn('[first-pull] achievement finalize failed', e)
  }
}

// --- CTA → modal request bridge (lightweight emitter, mirrors masteryEvents) ---

type RequestListener = () => void
const requestListeners = new Set<RequestListener>()

/** Subscribe to first-pull CTA requests (FirstPullModal). Returns unsubscribe. */
export function onFirstPullRequest(listener: RequestListener): () => void {
  requestListeners.add(listener)
  return () => requestListeners.delete(listener)
}

/** Fired by the 首抽 CTA button(s) → the mounted FirstPullModal runs the ritual. */
export function requestFirstPull(): void {
  requestListeners.forEach((l) => {
    try {
      l()
    } catch (e) {
      console.error('[first-pull] request listener threw', e)
    }
  })
}

/** Convenience: a content-pack family-name resolver (mirrors useMaze). */
export function makeResolveName(pack: ContentPack): ResolveFamilyDisplayName {
  return (id: string) => pack.subjects.find((s) => s.id === id)?.displayName ?? id
}

/* DEV-only debug handle for manual smoke (mirrors __maze / __variantGacha). */
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __firstPull?: unknown }).__firstPull = {
    isDone: isFirstPullDone,
    /** Simulate the CTA click → the mounted FirstPullModal runs the ritual. */
    request: requestFirstPull,
    readStarter: (branch: NtBranchId) => readStarterFamily(branch),
    /** Re-arm first-pull (clears flag + starter-lit; does NOT clear collection). */
    reset: async () => {
      await db.meta.delete(FIRST_PULL_DONE_KEY)
      for (const k of STARTER_FAMILY_KEYS) await db.meta.delete(k)
      console.warn('[first-pull] DEV: reset firstPullDone + starterFamily keys')
    },
  }
}
