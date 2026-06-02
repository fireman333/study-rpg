/**
 * Achievement orchestrator for neurons-mode.
 *
 * Responsibilities:
 * - Build `NeuronsAchievementStats` from Dexie tables on demand
 * - Provide local `checkAchievementUnlocks` diff function (re-impl per
 *   spec Req — does NOT consume @study-rpg/core's 二階-typed function;
 *   see add-neurons-achievements/tasks.md §1.2 for rationale)
 * - `triggerAchievementCheck(prevStats)`: post-commit hook called by
 *   `connectome.ts` / `variant-gacha.ts` after their writes commit
 * - `backfillAchievementsFromCurrentStats()`: idempotent silent backfill
 *   (no toast / no reward dispatch); called at app boot
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import {
  NEURONS_ACHIEVEMENTS,
  VARIANT_COUNT_BY_FAMILY,
  type NeuronsAchievement,
  type NeuronsAchievementStats,
  type NeuronsPlayerSnapshot,
  type FamilyMasteryTier,
} from '@study-rpg/content-neurons-tw'

import { db, todayISO, type NeuronVariantRow } from '../db'
import { deriveMasteryTier } from '../mastery/mastery-tier'
import { dispatchReward } from './achievement-reward'
import { pushAchievementToast } from '../achievement-toast-queue'

// ─── Stat builder ───────────────────────────────────────────────────────────

const SAVE_CREATED_DATE_KEY = 'saveCreatedDate'

async function readMetaInt(key: string): Promise<number> {
  const row = await db.meta.get(key)
  if (!row) return 0
  const n = parseInt(row.value, 10)
  return Number.isFinite(n) ? n : 0
}

async function ensureSaveCreatedDate(): Promise<string> {
  const existing = await db.meta.get(SAVE_CREATED_DATE_KEY)
  if (existing?.value) return existing.value
  const today = todayISO()
  await db.meta.put({ key: SAVE_CREATED_DATE_KEY, value: today })
  return today
}

/** Compute fresh stats snapshot from Dexie tables. Read-only — no writes. */
export async function buildAchievementStats(): Promise<NeuronsAchievementStats> {
  const today = todayISO()
  const [accruals, synapses, mastery, variants, currentStreak, maxStreak, saveCreatedDate] =
    await Promise.all([
      db.familyAccrual.toArray(),
      db.synapses.toArray(),
      db.familyMastery.toArray(),
      db.neuronVariants.toArray(),
      readMetaInt('currentQuizCorrectStreak'),
      readMetaInt('maxQuizCorrectStreak'),
      ensureSaveCreatedDate(),
    ])

  // Quiz totals — derived from familyMastery (per-family correct / total)
  const totalQuestionsCorrect = mastery.reduce((sum, m) => sum + m.correct, 0)
  const totalQuestionsAnswered = mastery.reduce((sum, m) => sum + m.total, 0)
  const overallAccuracy = totalQuestionsAnswered > 0
    ? totalQuestionsCorrect / totalQuestionsAnswered
    : 0

  // Variant collection signals
  const variantCount = variants.length
  const variantsByFamily = new Map<string, NeuronVariantRow[]>()
  for (const v of variants) {
    const list = variantsByFamily.get(v.familyId) ?? []
    list.push(v)
    variantsByFamily.set(v.familyId, list)
  }
  // A family is complete when it owns every slot its catalog declares (pyramid
  // total — derived per family, not a hardcoded count; rework-neurons-variant-pyramid).
  let familyCompleteCount = 0
  for (const [familyId, list] of variantsByFamily.entries()) {
    const total = VARIANT_COUNT_BY_FAMILY[familyId] ?? 0
    if (total > 0 && list.length >= total) familyCompleteCount += 1
  }

  // Natural P1 = a P1 obtained without the soft-pity floor. Rarity is now an
  // explicit field (decoupled from slotIndex), so read it directly; `wasPityFloor`
  // is only ever set for P0, so every P1 is natural — but keep the guard explicit.
  const naturalP1Variants = variants.filter((v) => v.rarity === 'P1' && !v.wasPityFloor)
  const naturalP1VariantCount = naturalP1Variants.length
  const naturalP1DistinctFamilies = new Set(naturalP1Variants.map((v) => v.familyId)).size

  const variantPityFloorCount = variants.filter((v) => v.wasPityFloor).length

  const rarityDiversitySet = new Set(variants.map((v) => v.rarity))
  const variantRarityDiversity = rarityDiversitySet.size

  // AP signals
  const totalAP = accruals.reduce((sum, a) => sum + a.ap, 0)
  const maxFamilyAP = accruals.reduce((max, a) => Math.max(max, a.ap), 0)

  // Synapse signals
  const synapseFormedCount = synapses.length
  const synapseStrongCount = synapses.filter((s) => s.state === 'strong').length
  const synapseDormantCount = synapses.filter((s) => s.state === 'dormant').length
  const synapseWeakCount = synapses.filter((s) => s.state === 'weak').length

  // Current firedToday count (resets at midnight via daily reset job)
  const currentlyFiredFamilies = accruals.filter((a) => a.firedToday).length

  // Mastery tier per family
  const masteryTierByFamily: Record<string, FamilyMasteryTier> = {}
  for (const m of mastery) {
    masteryTierByFamily[m.familyId] = deriveMasteryTier(m.correct, m.total) as FamilyMasteryTier
  }
  const tierRankNum = (t: FamilyMasteryTier): number => {
    if (t === 'P1') return 1
    if (t === 'P2') return 2
    if (t === 'P3') return 3
    if (t === 'P4') return 4
    if (t === 'P5') return 5
    return 99
  }
  let familiesAtP5OrBetter = 0
  let familiesAtP4OrBetter = 0
  let familiesAtP3OrBetter = 0
  let familiesAtP2OrBetter = 0
  let familiesAtP1 = 0
  for (const tier of Object.values(masteryTierByFamily)) {
    const r = tierRankNum(tier)
    if (r <= 5) familiesAtP5OrBetter += 1
    if (r <= 4) familiesAtP4OrBetter += 1
    if (r <= 3) familiesAtP3OrBetter += 1
    if (r <= 2) familiesAtP2OrBetter += 1
    if (r <= 1) familiesAtP1 += 1
  }

  const isFirstSaveDay = saveCreatedDate === today
  const todayCorrectCount = accruals.reduce((sum, a) => sum + a.sameDayCorrect, 0)

  const totalStudyMinutes = await readMetaInt('totalStudyMinutes')

  return {
    totalStudyMinutes,
    totalQuestionsAnswered,
    totalQuestionsCorrect,
    overallAccuracy,
    currentQuizCorrectStreak: currentStreak,
    maxQuizCorrectStreak: maxStreak,
    variantCount,
    familyCompleteCount,
    naturalP1VariantCount,
    variantPityFloorCount,
    naturalP1DistinctFamilies,
    variantRarityDiversity,
    totalAP,
    maxFamilyAP,
    synapseFormedCount,
    synapseStrongCount,
    synapseDormantCount,
    synapseWeakCount,
    currentlyFiredFamilies,
    masteryTierByFamily,
    familiesAtP5OrBetter,
    familiesAtP4OrBetter,
    familiesAtP3OrBetter,
    familiesAtP2OrBetter,
    familiesAtP1,
    isFirstSaveDay,
    todayCorrectCount,
  }
}

/** Lightweight player snapshot — predicates don't read player fields today. */
function buildPlayerSnapshot(): NeuronsPlayerSnapshot {
  return {}
}

// ─── Diff-based unlock detection (local re-impl per spec Req 4) ────────────

/**
 * Returns achievements whose predicate transitions from false (prev) to true
 * (next). Already-unlocked predicates (both prev and next true) MUST NOT be
 * re-emitted. Mirror of core's 二階-typed `checkAchievementUnlocks`.
 */
export function checkAchievementUnlocks(
  prev: NeuronsPlayerSnapshot,
  prevStats: NeuronsAchievementStats,
  next: NeuronsPlayerSnapshot,
  nextStats: NeuronsAchievementStats,
  catalog: readonly NeuronsAchievement[],
): NeuronsAchievement[] {
  const out: NeuronsAchievement[] = []
  for (const a of catalog) {
    const before = a.predicate(prev, prevStats)
    const after = a.predicate(next, nextStats)
    if (!before && after) out.push(a)
  }
  return out
}

/** Returns all achievements currently satisfied (regardless of prev state). */
export function listUnlockedAchievements(
  player: NeuronsPlayerSnapshot,
  stats: NeuronsAchievementStats,
  catalog: readonly NeuronsAchievement[],
): NeuronsAchievement[] {
  return catalog.filter((a) => a.predicate(player, stats))
}

// ─── Orchestrator: post-commit trigger ─────────────────────────────────────

/**
 * Called by trigger hook sites (connectome / variant-gacha) AFTER their
 * Dexie writes commit. Captures fresh stats, runs diff, persists newly-
 * unlocked rows, dispatches rewards, queues toasts / modal.
 *
 * Wrap caller in try/catch — failure here MUST NOT break the originating
 * game action (per spec scenario).
 */
export async function triggerAchievementCheck(
  prevStats: NeuronsAchievementStats,
): Promise<void> {
  try {
    const nextStats = await buildAchievementStats()
    const player = buildPlayerSnapshot()
    const unlocked = checkAchievementUnlocks(player, prevStats, player, nextStats, NEURONS_ACHIEVEMENTS)
    if (unlocked.length === 0) return

    const now = Date.now()
    await db.achievements.bulkPut(
      unlocked.map((a) => ({ id: a.id, unlockedAt: now, notificationShown: false })),
    )

    for (const a of unlocked) {
      try {
        await dispatchReward(a)
      } catch (e) {
        console.warn('[achievement-reward] dispatch failed', a.id, e)
      }
      pushAchievementToast(a)
    }
  } catch (e) {
    console.warn('[achievement] triggerAchievementCheck failed', e)
  }
}

// ─── Backfill: idempotent silent population ────────────────────────────────

/**
 * App boot pass: write `achievements` rows for every catalog predicate that's
 * already true given current Dexie state, but has no row yet. Sets
 * `notificationShown: true` so no toast / modal queues. Reward dispatch is
 * SKIPPED (player conceptually "already earned" these — don't grant titles
 * silently; they unlock through gameplay path next time they cross threshold).
 *
 * Idempotent — second call finds 0 missing and short-circuits.
 *
 * Same function shape for future `add-neurons-deploy` `onPullComplete` hook
 * — caller is responsible for try/catch + logging.
 *
 * Returns count of rows written.
 */
export async function backfillAchievementsFromCurrentStats(): Promise<number> {
  try {
    const stats = await buildAchievementStats()
    const player = buildPlayerSnapshot()
    const unlockedNow = listUnlockedAchievements(player, stats, NEURONS_ACHIEVEMENTS)
    if (unlockedNow.length === 0) return 0

    const existingRows = await db.achievements.toArray()
    const existingIds = new Set(existingRows.map((r) => r.id))
    const missing = unlockedNow.filter((a) => !existingIds.has(a.id))
    if (missing.length === 0) return 0

    const now = Date.now()
    await db.achievements.bulkPut(
      missing.map((a) => ({ id: a.id, unlockedAt: now, notificationShown: true })),
    )
    console.log(
      `[achievement-backfill] populated ${missing.length} row(s):`,
      missing.map((a) => a.id),
    )
    return missing.length
  } catch (e) {
    console.warn('[achievement-backfill] failed', e)
    return 0
  }
}
