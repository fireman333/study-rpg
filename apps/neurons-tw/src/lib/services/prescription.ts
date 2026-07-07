/**
 * 今日處方箋 (Daily Prescription) — a forgiving daily two-line quest that kills
 * decision-paralysis in the final exam sprint, plus the NG-0717 collectible
 * (an adult-born dentate granule cell) that matures by rolling completed days.
 *
 * Design: reduce cram anxiety, never add pressure/guilt. Progress is monotonic;
 * a missed day is neutral. NO Dexie schema change — all state lives in the existing
 * `meta` key-value table under the `prescription:v1:` namespace, keyed by local ISO
 * date, as write-once keys (absent → truthy, never deleted) so derived counters are
 * monotonic and cross-device merges are safe. The daily-quest keys SYNC cross-device
 * as a date-windowed table (add-neurons-prescription-tiers-and-sync): `plan` / `wrong`
 * / `breadth` / `cramRescue` / `wire` / `tierClaim` within today ±1 local day,
 * `completed` / `reward` for ALL dates; `lightsOut` / `localSeed` stay LOCAL-ONLY
 * (deletable / device-ritual keys violate the write-once contract). Membership is
 * single-sourced here via `isSyncedPrescriptionKey` (consumed by lib/sync/tables.ts).
 * The NG-0717 lineage-imprint keys (`${IMPRINT_PREFIX}<subj>:<date>`) keep riding
 * their own prefix (add-neurons-imprint-keepsake-sync). The plan family converges
 * cross-device by an earliest-createdAt-wins MIN-LWW post-pass
 * (lib/sync/backfill/prescription-plan.ts); every other synced family is write-once
 * presence → first-write-wins = UNION.
 *
 * Tier ladder (add-neurons-prescription-tiers-and-sync): a same-day 4-tier ladder
 * (T1 基礎處方 / T2 追加固化 / T3 形成連結 / T4 深度出征) whose objectives are FROZEN
 * into the plan at generation. The current tier is DERIVED (never a stored mutable
 * field — no new merge type); the DISPLAYED tier adds a claim-floor
 * (`max(derivedTier, highestClaimedTier)`) so it is same-day monotonic. Energy
 * rewards are claim-gated flat writes into the existing `maze:<familyId>:earned`
 * MAX-merge counter — NEVER a scalar LWW value.
 *
 * Capability spec: openspec/specs/neurons-daily-prescription/spec.md
 */

import type { Question } from '@study-rpg/core'
import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import { db, todayISO, type QuestionHistoryRow } from '../db'
import { earnedKey } from '../maze/economy'
import { ALL_YEARS, effectiveYearSet, getYearFilter } from './year-filter'
import { filterPoolByYear } from './quiz-pool'

/** Minimal family shape the service needs (satisfied by core's `Subject`). */
interface FamilyRef {
  id: string
  displayName: string
}

/** Per-question binary flags the plan builder reads (from `questionFlags`). */
interface QuestionFlagInfo {
  easyMarked: boolean
  guessedMarked: boolean
}

// ── Exam-cycle constant (dogfood: bump per exam cycle) ──────────────────────
/** National 一階 exam date this cycle. Used only for ambient countdown chrome —
 *  NEVER gates progress (per spec Decision 5). */
export const EXAM_DATE_ISO = '2026-07-17'

/** NG-0717 maturation milestones (completed-day counts). Dogfood-tunable. */
export const NG0717_MILESTONES = [1, 3, 6, 10] as const
/** Completed days for full maturity (stage 4) + permanent keepsake. */
export const NG0717_FULL_MATURITY = 10
/** Keepsake date stamp shown on the full-maturity NG-0717. */
export const NG0717_KEEPSAKE_STAMP = '2026.07.17'

/** Hard cap on total daily questions (both lines combined). */
export const DAILY_TOTAL_CAP = 12

/** 考前救援 bonus target — cram-practice questions today (correct OR wrong). Dogfood-tunable. */
export const CRAM_RESCUE_TARGET = 1

// Snapshot-size caps. These store the FULL eligible set, not just the first N:
// the fresh / expedition pools do NOT serve in snapshot order, so a small cap
// leaves most answered questions outside the snapshot and uncounted (caught in
// smoke — a served 111-year fresh Q missed a 104-ordered 60-cap). The corpus is
// bounded (~4600 Q total; a single family ≤ ~600), so a full snapshot is only a
// few KB of local meta. Caps are safety ceilings well above any real corpus.
const WRONG_SNAPSHOT_CAP = 8000
const BREADTH_SNAPSHOT_CAP = 2000

// ── Meta key builders ───────────────────────────────────────────────────────
// The daily-quest keys below SYNC cross-device via `isSyncedPrescriptionKey` (the
// single-sourced matcher exported at the bottom of this block; lib/sync/tables.ts
// imports it, so the key mint and the sync filter can never drift). `lightsOut` /
// `localSeed` are the LOCAL-ONLY exceptions (deletable / device-ritual keys). The
// NG-0717 lineage imprints ride their OWN prefix (IMPRINT_PREFIX) — see
// add-neurons-imprint-keepsake-sync.
const NS = 'prescription:v1'
const planKey = (date: string) => `${NS}:plan:${date}`
const wrongKey = (date: string, qid: string) => `${NS}:wrong:${date}:${qid}`
const breadthKey = (date: string, qid: string) => `${NS}:breadth:${date}:${qid}`
const completedKey = (date: string) => `${NS}:completed:${date}`
const rewardKey = (date: string) => `${NS}:reward:${date}`
const lightsOutKey = (date: string) => `${NS}:lightsOut:${date}`
const LOCAL_SEED_KEY = `${NS}:localSeed`
const WRONG_PREFIX = (date: string) => `${NS}:wrong:${date}:`
const BREADTH_PREFIX = (date: string) => `${NS}:breadth:${date}:`
// 考前救援 bonus (add-neurons-cram-rescue-and-card-actions) — write-once per date+qid
// when answering from the cram practice entry (correct OR wrong). SYNCED (write-once
// UNION, date-windowed) since add-neurons-prescription-tiers-and-sync so the 救援
// display AND the T2 cram-fallback counting agree across devices; subsumed by
// PRESCRIPTION_META_PREFIX so account-reset/switch wipes it with the rest.
const cramRescueKey = (date: string, qid: string) => `${NS}:cramRescue:${date}:${qid}`
const CRAM_RESCUE_PREFIX = (date: string) => `${NS}:cramRescue:${date}:`
const COMPLETED_PREFIX = `${NS}:completed:`
// Form-synapse objective (add-neurons-prescription-tiers-and-sync): write-once
// per (date, pairKey) → per-pair-per-day dedup for free. Written by the boot-time
// listener in prescription-wire.ts off the existing expedition co-repair emitter.
const wireKey = (date: string, pairKey: string) => `${NS}:wire:${date}:${pairKey}`
const WIRE_PREFIX = (date: string) => `${NS}:wire:${date}:`
// Tier claim markers (T2–T4) — write-once `{claimedAt, energy, familyId}`. T1's
// marker is the pre-existing `reward:{date}` key (now carrying the +10 grant).
const tierClaimKey = (date: string, tier: 2 | 3 | 4) => `${NS}:tierClaim:${date}:${tier}`
/** `plan:{date}` key prefix — consumed by the MIN-LWW backfill post-pass. */
export const PRESCRIPTION_PLAN_KEY_PREFIX = `${NS}:plan:`
/**
 * NG-0717 lineage-imprint synced prefix — the SINGLE SOURCE of truth for the imprint
 * key family. `lib/sync/tables.ts` imports this to build its synced-key membership,
 * so the sync filter and the key mint can never drift (a rename here moves both).
 * Keys are write-once per (subject, date). Subject ids carry no colon and dates are
 * `YYYY-MM-DD`, so the suffix splits cleanly into id + date.
 */
export const IMPRINT_PREFIX = `${NS}:ng0717:imprint:`
const imprintKey = (subjectId: string, date: string) => `${IMPRINT_PREFIX}${subjectId}:${date}`

/**
 * The ENTIRE daily-prescription meta namespace (`prescription:v1:*`). Account-switch and
 * in-place reset wipe this whole prefix: every daily-quest key (plan / wrong / breadth /
 * completed / reward / cramRescue / wire / tierClaim / lightsOut / localSeed) AND the
 * NG-0717 imprint keepsake sub-prefix are account-OWNED, not device-local —
 * `completed:<date>` keys drive this account's NG-0717 maturation stage, the tier claims
 * and progress keys are its daily-quest state, and the imprint keys are its keepsake, so
 * they must not leak into the next account (the "混血 NG-0717" bug). `IMPRINT_PREFIX` is a
 * sub-prefix of this, so wiping this SUBSUMES the imprint-only delete. Device-local UI
 * prefs live OUTSIDE this prefix (e.g. `prescription:homeCollapsed`) and survive the wipe.
 * Single source: account-guard imports this so the wipe prefix can never drift from the
 * key mint. (fix-neurons-account-switch-prescription-wipe)
 */
export const PRESCRIPTION_META_PREFIX = `${NS}:`

// ── Synced-key matcher (single source — consumed by lib/sync/tables.ts) ──────

/** Families synced within a today-±1-local-day window (bounds bundle growth,
 *  tolerates midnight/timezone skew). */
const DATE_WINDOWED_FAMILIES: ReadonlySet<string> = new Set([
  'plan',
  'wrong',
  'breadth',
  'cramRescue',
  'wire',
  'tierClaim',
])
/** Families synced for ALL dates (full history: `completedDayCount` + NG-0717
 *  maturation derive from every completed day). */
const ALL_DATES_FAMILIES: ReadonlySet<string> = new Set(['completed', 'reward'])

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Whether a `prescription:v1:*` meta key participates in cross-device sync
 * (add-neurons-prescription-tiers-and-sync). Mirrors the IMPRINT_PREFIX
 * single-sourcing: `lib/sync/tables.ts` imports this as a clause of
 * `isSyncedMetaKey`, so BOTH the metaAdapter snapshot AND its apply use the same
 * test and the mint/filter can never drift.
 *
 * - `plan:` / `wrong:` / `breadth:` / `cramRescue:` / `wire:` / `tierClaim:`
 *   match within today ±1 local day.
 * - `completed:` / `reward:` match ALL dates.
 * - `lightsOut:` / `localSeed` NEVER match (deletable / device-ritual keys).
 * - `ng0717:imprint:` keys are NOT matched here — they ride their own prefix
 *   (IMPRINT_PREFIX) in isSyncedMetaKey.
 */
export function isSyncedPrescriptionKey(key: string, today: string = todayISO()): boolean {
  if (!key.startsWith(PRESCRIPTION_META_PREFIX)) return false
  const rest = key.slice(PRESCRIPTION_META_PREFIX.length) // '<family>:<suffix>' | 'localSeed'
  const cut = rest.indexOf(':')
  if (cut < 0) return false // 'localSeed' — no family separator → local-only
  const family = rest.slice(0, cut)
  const suffix = rest.slice(cut + 1) // '{date}' or '{date}:{qid|pairKey|tier}'
  const date = suffix.slice(0, 10)
  if (!ISO_DATE_RE.test(date)) return false
  if (ALL_DATES_FAMILIES.has(family)) return true
  if (!DATE_WINDOWED_FAMILIES.has(family)) return false // lightsOut / ng0717 / unknown
  return date === today || date === isoDaysAgo(today, 1) || date === isoDaysAgo(today, -1)
}

// ── Tier ladder constants (dogfood-tunable) ──────────────────────────────────
// T2 ≈ 3 extra corrections; T3 target 1 synapse; T4 ≈ 12 cumulative corrections
// AND 2 synapses; flat energy 10/15/20/25 (Σ = 70/day). All game-design defaults,
// re-tunable from dogfood telemetry without schema impact (targets freeze per-plan).
export const TIER_T2_EXTRA_DEFAULT = 3
export const TIER_T3_TARGET_DEFAULT = 1
export const TIER_T4_CORRECTIONS_DEFAULT = 12
export const TIER_T4_SYNAPSES_DEFAULT = 2
/** Flat conduction-energy grant per tier (claim-gated; NEVER multiplied). */
export const TIER_ENERGY: Readonly<Record<1 | 2 | 3 | 4, number>> = {
  1: 10,
  2: 15,
  3: 20,
  4: 25,
}

/** T2 counting substrate, frozen along the fallback chain at plan generation. */
export type TierT2Kind = 'wrongOverflow' | 'breadth' | 'cram'

/** Frozen tier-spec fields (all optional — a legacy plan without them renders no
 *  tier panel; derivation returns tier-absent). */
export interface TierSpec {
  t2Kind?: TierT2Kind
  t2Extra?: number
  t3Kind?: 'synapse'
  t3Target?: number
  t4Kind?: 'deep'
  t4Target?: { corrections: number; synapses: number }
}

// ── Types ───────────────────────────────────────────────────────────────────
export interface PrescriptionPlan extends TierSpec {
  date: string
  createdAt: number
  seed: string
  wrongTarget: number
  breadthTarget: number
  breadthFamilyId: string | null
  breadthFamilyLabel: string | null
  /**
   * Snapshot at plan creation — the repair pool: currently-wrong ∪ guessed-correct,
   * minus too-easy (anti-cheat: correcting only these advances the line).
   */
  wrongEligibleQuestionIds: string[]
  /** Snapshot at plan creation — 開發新連結 family's unseen question ids. */
  breadthEligibleQuestionIds: string[]
  /** Frozen effective exam-year scope; `null` = all years (legacy plans omit it). */
  yearScope: number[] | null
}

/** Per-rung derived progress for the tier panel. */
export interface TierRungStatus {
  target: number
  done: number
  complete: boolean
}

/**
 * Derived tier-ladder state (add-neurons-prescription-tiers-and-sync). PURE
 * projection of the (winner) plan's frozen tier spec + UNION'd progress keys —
 * the tier is NEVER a stored mutable field. `displayTier` adds the claim-floor
 * (`max(derivedTier, highestClaimedTier)`) so the shown tier is same-day
 * monotonic even after a divergent plan loses the cross-device MIN-LWW merge.
 */
export interface TierLadderStatus {
  derivedTier: number
  highestClaimedTier: number
  displayTier: number
  t2: (TierRungStatus & { kind: TierT2Kind }) | null
  t3: TierRungStatus | null
  t4: { corrections: TierRungStatus; synapses: TierRungStatus; complete: boolean } | null
}

/** Extra progress inputs `deriveTier` needs beyond the two T1 lines. */
export interface TierProgressInputs {
  /** Count of `cramRescue:{date}:*` keys today (T2 cram-fallback units). */
  cramRescueCount: number
  /** Count of distinct `wire:{date}:*` keys today (T3/T4 synapse objective). */
  wireCount: number
  /** `reward:{date}` present (T1's claim marker). */
  t1Claimed: boolean
  /** Tiers with a `tierClaim:{date}:{t}` marker present (local or pulled). */
  claimedTiers: ReadonlySet<number>
}

export interface PrescriptionStatus {
  plan: PrescriptionPlan | null
  wrongDone: number
  breadthDone: number
  wrongComplete: boolean
  breadthComplete: boolean
  dayComplete: boolean
  /** Which line the single CTA should route to next; null when both done. */
  nextTarget: 'wrong' | 'breadth' | null
  /** Rolling count of days ever completed (monotonic). */
  completedDayCount: number
  /** NG-0717 stage derived from completedDayCount (0–4). */
  ng0717Stage: number
  /** True once NG-0717 reaches full maturity (permanent keepsake). */
  keepsakeUnlocked: boolean
  /** 考前救援 optional bonus done today (≥ CRAM_RESCUE_TARGET cram-practice answers). */
  cramRescueDone: boolean
  /** Derived tier-ladder state; null when the plan has no frozen tier spec. */
  tier: TierLadderStatus | null
}

/**
 * NG-0717 lineage imprint — a per-subject dendritic bud grown on the mascot each
 * time that subject is the completed day's 開發新連結 family. This is a DERIVED view;
 * the source of truth is write-once `${IMPRINT_PREFIX}<subjectId>:<date>` meta keys
 * (one per completion day for that subject), so `touches` is monotonic and the stage
 * never downgrades. These keys sync cross-device as a keepsake (via the prefix; merged
 * first-write-wins UNION over write-once presence keys — add-neurons-imprint-keepsake-sync).
 */
export interface Ng0717Imprint {
  subjectId: string
  firstUnlockedDate: string
  lastTouchedDate: string
  touches: number
}

/** Imprint stage thresholds (dogfood-tunable). */
export const IMPRINT_WARM_TOUCHES = 2
export const IMPRINT_MYELINATED_TOUCHES = 3

export type ImprintStage = 'absent' | 'sprout' | 'warm' | 'myelinated'

/** Qualitative imprint stage derived purely from touch count (monotonic). */
export function imprintStage(touches: number): ImprintStage {
  if (touches >= IMPRINT_MYELINATED_TOUCHES) return 'myelinated'
  if (touches >= IMPRINT_WARM_TOUCHES) return 'warm'
  if (touches >= 1) return 'sprout'
  return 'absent'
}

// ── Pure helpers (exported for unit tests) ──────────────────────────────────

/** NG-0717 stage (0–4) derived purely from the rolling completed-day count. */
export function ng0717Stage(completedDayCount: number): number {
  if (completedDayCount >= NG0717_MILESTONES[3]) return 4
  if (completedDayCount >= NG0717_MILESTONES[2]) return 3
  if (completedDayCount >= NG0717_MILESTONES[1]) return 2
  if (completedDayCount >= NG0717_MILESTONES[0]) return 1
  return 0
}

/**
 * Recent-N accuracy as a percentage (0–100) from history rows, using each
 * question's latest result ordered by `lastAnsweredAt`. Returns null when there
 * are too few rows to judge (no penalty applied in that case).
 */
export function recentAccuracyPct(
  history: readonly QuestionHistoryRow[],
  n = 20,
): number | null {
  const recent = [...history]
    .filter((h) => typeof h.lastAnsweredAt === 'number')
    .sort((a, b) => b.lastAnsweredAt - a.lastAnsweredAt)
    .slice(0, n)
  if (recent.length === 0) return null
  const correct = recent.filter((h) => h.lastResult === 'correct').length
  return (correct / recent.length) * 100
}

/**
 * 訂正錯題 target N. Scales to the wrong-pool size; low recent accuracy lowers
 * the cap so the prescription never becomes a second exam.
 */
export function computeWrongTarget(
  wrongPoolSize: number,
  recentAccPct: number | null,
): number {
  if (wrongPoolSize <= 0) return 0
  let base: number
  if (wrongPoolSize <= 3) base = wrongPoolSize
  else if (wrongPoolSize <= 20) base = 4
  else if (wrongPoolSize <= 80) base = 5
  else base = 6
  if (recentAccPct != null) {
    if (recentAccPct < 50) base = Math.min(base, 3)
    else if (recentAccPct < 65) base = Math.min(base, 4)
  }
  return base
}

/** 開發盲區 target M, complementary to N so the daily total never exceeds 12. */
export function computeBreadthTarget(wrongTarget: number): number {
  if (wrongTarget <= 0) return 10
  if (wrongTarget <= 4) return 8
  if (wrongTarget === 5) return 7
  return 6
}

/**
 * Freeze the day's tier spec from the SAME frozen snapshots the plan is built
 * from (add-neurons-prescription-tiers-and-sync). PURE. Objectives auto-shrink
 * with a frozen fallback chain so a plan can NEVER freeze an unachievable tier
 * (no「今天不可能達成」dead state):
 *
 * - T2 chain: wrong-snapshot overflow beyond T1's target → (exhausted) breadth
 *   pool overflow → (exhausted) cram practice at a DOUBLED target (counted via
 *   the `cramRescue:{date}:{qid}` keys — cram is unbounded, so ×2 keeps it
 *   non-trivial).
 * - T3/T4 (synapse objectives) are frozen ABSENT when the frozen wrong pool is
 *   empty: the anti-farm gate requires a settlement's counted repairs to
 *   intersect `wrongEligibleQuestionIds`, so with an empty frozen pool no wire
 *   key could ever be minted — freezing a synapse target that day WOULD be a
 *   dead state. The ladder simply caps at T2 (mirrors legacy tier-absent
 *   tolerance).
 * - T4's correction target shrinks to what the frozen pools make achievable:
 *   at most every frozen wrong (write-once per qid) plus the T2 fallback units
 *   when the chain engaged.
 */
export function deriveTierSpec(input: {
  wrongTarget: number
  wrongEligibleCount: number
  breadthTarget: number
  breadthEligibleCount: number
}): TierSpec {
  const wrongOverflow = Math.max(0, input.wrongEligibleCount - input.wrongTarget)
  const breadthOverflow = Math.max(0, input.breadthEligibleCount - input.breadthTarget)
  let t2Kind: TierT2Kind
  let t2Extra: number
  if (wrongOverflow > 0) {
    t2Kind = 'wrongOverflow'
    t2Extra = Math.min(TIER_T2_EXTRA_DEFAULT, wrongOverflow)
  } else if (breadthOverflow > 0) {
    t2Kind = 'breadth'
    t2Extra = Math.min(TIER_T2_EXTRA_DEFAULT, breadthOverflow)
  } else {
    t2Kind = 'cram'
    t2Extra = TIER_T2_EXTRA_DEFAULT * 2 // cram fallback DOUBLES the target
  }
  if (input.wrongEligibleCount === 0) {
    // Synapse objectives unachievable (anti-farm needs pre-today wrongs) → absent.
    return { t2Kind, t2Extra }
  }
  // T4 corrections stream = today's wrong keys (≤ frozen pool size) plus the T2
  // fallback units when the chain engaged (wrongOverflow units are themselves
  // wrong keys — already inside wrongEligibleCount, no double count).
  const fallbackUnits = t2Kind === 'wrongOverflow' ? 0 : t2Extra
  const corrections = Math.min(
    TIER_T4_CORRECTIONS_DEFAULT,
    input.wrongEligibleCount + fallbackUnits,
  )
  return {
    t2Kind,
    t2Extra,
    t3Kind: 'synapse',
    t3Target: TIER_T3_TARGET_DEFAULT,
    t4Kind: 'deep',
    t4Target: { corrections, synapses: TIER_T4_SYNAPSES_DEFAULT },
  }
}

/** Progress inputs for `deriveTier` (the two T1 lines + the tier substrates). */
export interface TierProgress extends TierProgressInputs {
  wrongDone: number
  breadthDone: number
}

/**
 * Derive the tier ladder from the (winner) plan's frozen spec + UNION'd progress
 * key counts. PURE — recomputed on read, never stored (design D1). Returns null
 * when the plan carries no tier spec (legacy plan → tier panel hidden).
 *
 * `derivedTier` is strictly ladder-ordered (tier k requires tiers 1..k complete;
 * an absent rung caps the ladder below it). `displayTier` adds the claim-floor:
 * write-once claims are same-day monotonic, so the player never sees a tier they
 * celebrated get taken back — even when a divergent losing plan makes
 * `derivedTier` drop after the MIN-LWW converges.
 */
export function deriveTier(
  plan: PrescriptionPlan | null,
  p: TierProgress,
): TierLadderStatus | null {
  if (!plan) return null
  if (plan.t2Kind == null && plan.t3Kind == null && plan.t4Kind == null) return null

  const t1Complete = p.wrongDone >= plan.wrongTarget && p.breadthDone >= plan.breadthTarget

  // T2 units along the frozen counting substrate.
  let t2: (TierRungStatus & { kind: TierT2Kind }) | null = null
  let t2UnitsDone = 0
  if (plan.t2Kind != null && plan.t2Extra != null) {
    t2UnitsDone =
      plan.t2Kind === 'wrongOverflow'
        ? Math.max(0, p.wrongDone - plan.wrongTarget)
        : plan.t2Kind === 'breadth'
          ? Math.max(0, p.breadthDone - plan.breadthTarget)
          : p.cramRescueCount
    t2 = {
      kind: plan.t2Kind,
      target: plan.t2Extra,
      done: t2UnitsDone,
      complete: t2UnitsDone >= plan.t2Extra,
    }
  }

  const t3: TierRungStatus | null =
    plan.t3Kind != null && plan.t3Target != null
      ? { target: plan.t3Target, done: p.wireCount, complete: p.wireCount >= plan.t3Target }
      : null

  let t4: TierLadderStatus['t4'] = null
  if (plan.t4Kind != null && plan.t4Target != null) {
    // Same unit stream T1+T2 count: today's wrong keys, plus T2 fallback units
    // (capped at t2Extra so unbounded cram can't alone power T4) when engaged.
    const fallbackDone =
      plan.t2Kind != null && plan.t2Kind !== 'wrongOverflow' && plan.t2Extra != null
        ? Math.min(t2UnitsDone, plan.t2Extra)
        : 0
    const corrDone = p.wrongDone + fallbackDone
    const corrections: TierRungStatus = {
      target: plan.t4Target.corrections,
      done: corrDone,
      complete: corrDone >= plan.t4Target.corrections,
    }
    const synapses: TierRungStatus = {
      target: plan.t4Target.synapses,
      done: p.wireCount,
      complete: p.wireCount >= plan.t4Target.synapses,
    }
    // T4 requires BOTH conditions.
    t4 = { corrections, synapses, complete: corrections.complete && synapses.complete }
  }

  let derivedTier = 0
  if (t1Complete) derivedTier = 1
  if (derivedTier === 1 && t2?.complete) derivedTier = 2
  if (derivedTier === 2 && t3?.complete) derivedTier = 3
  if (derivedTier === 3 && t4?.complete) derivedTier = 4

  const highestClaimedTier = p.claimedTiers.has(4)
    ? 4
    : p.claimedTiers.has(3)
      ? 3
      : p.claimedTiers.has(2)
        ? 2
        : p.t1Claimed
          ? 1
          : 0

  return {
    derivedTier,
    highestClaimedTier,
    displayTier: Math.max(derivedTier, highestClaimedTier),
    t2,
    t3,
    t4,
  }
}

/**
 * Deterministic energy-grant family for a date — hashed from the DATE ALONE
 * (add-neurons-prescription-tiers-and-sync fix for the divergent-family
 * double-pay). It deliberately does NOT use the plan's `breadthFamilyId` or
 * `seed`: those diverge between two offline devices' plans for the same date
 * BEFORE the earliest-wins plan merge converges, so granting to the plan's
 * family would let the same tier pay into two different families' `earned`
 * counters (both survive MAX-merge). Hashing the date alone makes every device
 * grant a given date's tier energy to the SAME family, so a cross-device
 * double-claim MAX-collapses to ~one grant instead of stacking. (Forgiving
 * model: the grant may still be absorbed on a less-active device — accepted —
 * but it can never double-pay.) The chosen family is stable per date, not tied
 * to the day's developed family. Assumes `FAMILY_IDS` order/length is a stable
 * canonical invariant (it is — the maze `earned` keys are coupled to it); a
 * change to it would be a breaking schema event handled separately.
 */
export function grantFamilyForDate(date: string): string {
  return FAMILY_IDS[stableHash(date) % FAMILY_IDS.length]
}

/**
 * Earliest-createdAt-wins MIN-LWW picker for divergent `plan:{date}` values
 * (design D5). Returns the raw string to persist, or null to keep local as-is.
 * MIN over the totally-ordered `(createdAt, seed)` pair is a semilattice →
 * pull-order-independent, bidirectionally convergent. A malformed/unparsable
 * INCOMING plan keeps local; a malformed LOCAL yields to a valid incoming.
 */
export function pickPlanMinLWW(localRaw: string | undefined, incomingRaw: string): string | null {
  const incoming = parsePlanEnvelope(incomingRaw)
  if (!incoming) return null // malformed incoming → keep local
  if (localRaw === undefined) return incomingRaw
  const local = parsePlanEnvelope(localRaw)
  if (!local) return incomingRaw
  if (incoming.createdAt < local.createdAt) return incomingRaw
  if (incoming.createdAt === local.createdAt && incoming.seed < local.seed) return incomingRaw
  return null
}

function parsePlanEnvelope(raw: string): { createdAt: number; seed: string } | null {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>
    if (!p || typeof p !== 'object') return null
    if (typeof p.createdAt !== 'number' || !Number.isFinite(p.createdAt)) return null
    if (typeof p.seed !== 'string') return null
    return { createdAt: p.createdAt, seed: p.seed }
  } catch {
    return null
  }
}

/**
 * Whether a raw `plan:{date}` meta value is a well-formed plan envelope
 * (add-neurons-prescription-tiers-and-sync fix). The generic meta apply is
 * first-write-wins, so it can install a MALFORMED incoming plan when the local
 * device had none for that date (pickPlanMinLWW then keeps that local garbage).
 * The plan MIN-LWW post-pass uses this to DROP any in-window plan key whose
 * stored value is malformed, so the reader regenerates a fresh valid plan
 * instead of choking on it.
 */
export function isValidPlanRaw(raw: unknown): boolean {
  return typeof raw === 'string' && parsePlanEnvelope(raw) !== null
}

/** Coverage-weighted blind-spot score. Higher = better 盲區 candidate. */
export function blindSpotScore(
  unseenCount: number,
  totalQuestions: number,
  outstandingWrongCount: number,
  uniqueAttempted: number,
): number {
  const coverageGap = totalQuestions > 0 ? unseenCount / totalQuestions : 0
  const weakness = outstandingWrongCount / Math.max(uniqueAttempted, 8)
  return 0.75 * coverageGap + 0.25 * Math.min(1, weakness * 3)
}

/** Deterministic 32-bit string hash (djb2) for stable tie-breaks. */
export function stableHash(input: string): number {
  let h = 5381
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0
  return h >>> 0
}

export interface BlindSpotCandidate {
  familyId: string
  familyLabel: string
  unseenCount: number
  totalQuestions: number
  outstandingWrongCount: number
  uniqueAttempted: number
  unseenQuestionIds: string[]
}

/**
 * Choose the day's 盲區 family: only families with unseen questions are eligible;
 * skip a family that was the 盲區 on BOTH of the previous 2 days when an
 * alternative exists; then apply an INVISIBLE NG-0717-imprint coverage bias so buds
 * spread methodically across subjects — families with no imprint yet win first, then
 * the least-recently-covered one rotates in; the coverage score orders within a tier;
 * ties break deterministically by hash(date + familyId + localSeed).
 *
 * The bias is expressed purely through `lastTouched`: a never-imprinted family maps
 * to `''`, which sorts before any real `YYYY-MM-DD`, so it is preferred; among
 * imprinted families the oldest date sorts first. An empty map (no imprints, e.g. a
 * new player) makes every `lastTouched` `''` → the sort reduces to pure score
 * (backward-compatible).
 */
export function selectBlindSpotFamily(
  candidates: readonly BlindSpotCandidate[],
  recentBlindSpotFamilyIds: readonly string[],
  date: string,
  localSeed: string,
  imprintLastTouchedByFamily: ReadonlyMap<string, string> = new Map(),
): BlindSpotCandidate | null {
  const eligible = candidates.filter((c) => c.unseenCount > 0)
  if (eligible.length === 0) return null
  const repeated2 =
    recentBlindSpotFamilyIds.length >= 2 &&
    recentBlindSpotFamilyIds[0] === recentBlindSpotFamilyIds[1]
      ? recentBlindSpotFamilyIds[0]
      : null
  // Prefer non-repeated families when a repeated family would otherwise win.
  const preferred =
    repeated2 && eligible.some((c) => c.familyId !== repeated2)
      ? eligible.filter((c) => c.familyId !== repeated2)
      : eligible
  const scored = preferred.map((c) => ({
    c,
    lastTouched: imprintLastTouchedByFamily.get(c.familyId) ?? '',
    score: blindSpotScore(c.unseenCount, c.totalQuestions, c.outstandingWrongCount, c.uniqueAttempted),
    tie: stableHash(`${date}:${c.familyId}:${localSeed}`),
  }))
  scored.sort(
    (a, b) => a.lastTouched.localeCompare(b.lastTouched) || b.score - a.score || a.tie - b.tie,
  )
  return scored[0].c
}

/**
 * Build a full day plan from live data. PURE (no I/O) — the impure layer snapshots
 * meta and persists the result.
 */
export function buildPlan(
  pool: readonly Question[],
  history: readonly QuestionHistoryRow[],
  subjects: readonly FamilyRef[],
  opts: {
    date: string
    recentBlindSpotFamilyIds: readonly string[]
    localSeed: string
    now: number
    /** Per-question flags (easy / guessed). Empty map = no flags. */
    flagsByQuestion: ReadonlyMap<string, QuestionFlagInfo>
    /** Effective exam-year set (from `effectiveYearSet`); all-years = no-op scope. */
    yearSet: ReadonlySet<number>
    /**
     * Per-family NG-0717 imprint `lastTouchedDate` (familyId → ISO date). Absent =
     * never imprinted. Drives the invisible coverage-rotation bias in
     * `selectBlindSpotFamily`. Empty map = pure score (backward-compatible).
     */
    imprintLastTouchedByFamily?: ReadonlyMap<string, string>
  },
): PrescriptionPlan {
  const { flagsByQuestion, yearSet } = opts
  const isAllYears = yearSet.size >= ALL_YEARS.length
  // Scope the pool once via the shared year predicate (quiz-pool.ts). History /
  // flag ids carry no year of their own, so their scope membership is simply
  // "is this id in the scoped pool". scopedIds is null iff all years (no-op).
  const scopedPool = isAllYears ? pool : filterPoolByYear(pool, yearSet)
  const scopedIds = isAllYears ? null : new Set(scopedPool.map((q) => q.id))
  const idInScope = (id: string): boolean => scopedIds == null || scopedIds.has(id)

  // ── Repair pool = (currently-wrong ∪ guessed-correct) − too-easy ──
  const easySet = new Set<string>()
  const guessedSet = new Set<string>()
  for (const [qid, f] of flagsByQuestion) {
    if (f.easyMarked) easySet.add(qid)
    if (f.guessedMarked) guessedSet.add(qid)
  }
  const repairAll = new Set<string>()
  for (const h of history) if (h.lastResult === 'wrong') repairAll.add(h.questionId)
  for (const qid of guessedSet) repairAll.add(qid)
  for (const qid of easySet) repairAll.delete(qid)
  // Scoped-first: draw from within the year scope; fall back to all-years repair
  // only when the scoped repair pool is empty (older wrongs/guesses stay real).
  const repairScoped = [...repairAll].filter(idInScope)
  const repairIds = repairScoped.length > 0 ? repairScoped : [...repairAll]

  const wrongTarget = computeWrongTarget(repairIds.length, recentAccuracyPct(history))

  // ── Blind-spot / unseen pool (year-scoped; excludes ✨ easy) ──
  const answered = new Set(history.map((h) => h.questionId))
  const attemptedByFamily = new Map<string, number>()
  const wrongByFamily = new Map<string, number>()
  for (const h of history) {
    if (!idInScope(h.questionId)) continue
    attemptedByFamily.set(h.family, (attemptedByFamily.get(h.family) ?? 0) + 1)
    if (h.lastResult === 'wrong')
      wrongByFamily.set(h.family, (wrongByFamily.get(h.family) ?? 0) + 1)
  }
  const totalByFamily = new Map<string, number>()
  const unseenByFamily = new Map<string, string[]>()
  for (const q of scopedPool) {
    totalByFamily.set(q.subject, (totalByFamily.get(q.subject) ?? 0) + 1)
    if (!answered.has(q.id) && !easySet.has(q.id)) {
      const arr = unseenByFamily.get(q.subject) ?? []
      arr.push(q.id)
      unseenByFamily.set(q.subject, arr)
    }
  }

  const candidates: BlindSpotCandidate[] = subjects.map((s) => ({
    familyId: s.id,
    familyLabel: s.displayName,
    unseenCount: (unseenByFamily.get(s.id) ?? []).length,
    totalQuestions: totalByFamily.get(s.id) ?? 0,
    outstandingWrongCount: wrongByFamily.get(s.id) ?? 0,
    uniqueAttempted: attemptedByFamily.get(s.id) ?? 0,
    unseenQuestionIds: unseenByFamily.get(s.id) ?? [],
  }))

  const blind = selectBlindSpotFamily(
    candidates,
    opts.recentBlindSpotFamilyIds,
    opts.date,
    opts.localSeed,
    opts.imprintLastTouchedByFamily ?? new Map(),
  )
  // No eligible new-connection family (e.g. all in-scope questions seen) → target 0
  // so the line reads as satisfied and the CTA never routes to a null family.
  const breadthTarget = blind ? computeBreadthTarget(wrongTarget) : 0

  const yearScope = isAllYears ? null : [...yearSet].sort((a, b) => b - a)

  const wrongEligibleQuestionIds = repairIds.slice(0, WRONG_SNAPSHOT_CAP)
  const breadthEligibleQuestionIds = (blind?.unseenQuestionIds ?? []).slice(
    0,
    BREADTH_SNAPSHOT_CAP,
  )
  // Freeze the day's tier spec from the SAME frozen snapshots (tier ladder,
  // add-neurons-prescription-tiers-and-sync). Rides the plan; converges with it.
  const tierSpec = deriveTierSpec({
    wrongTarget,
    wrongEligibleCount: wrongEligibleQuestionIds.length,
    breadthTarget,
    breadthEligibleCount: breadthEligibleQuestionIds.length,
  })

  return {
    date: opts.date,
    createdAt: opts.now,
    seed: opts.localSeed,
    wrongTarget,
    breadthTarget,
    breadthFamilyId: blind?.familyId ?? null,
    breadthFamilyLabel: blind?.familyLabel ?? null,
    wrongEligibleQuestionIds,
    breadthEligibleQuestionIds,
    yearScope,
    ...tierSpec,
  }
}

/** Days remaining until the exam (may be negative once the exam has passed). */
export function daysUntilExam(todayIso: string, examIso = EXAM_DATE_ISO): number {
  const ms = Date.parse(`${examIso}T00:00:00`) - Date.parse(`${todayIso}T00:00:00`)
  return Math.round(ms / 86_400_000)
}

// ── Impure layer (meta I/O) ─────────────────────────────────────────────────

async function metaGetJSON<T>(key: string): Promise<T | null> {
  const row = await db.meta.get(key)
  if (!row) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

async function metaExists(key: string): Promise<boolean> {
  return (await db.meta.get(key)) != null
}

/** Stable device-local seed for deterministic blind-spot tie-breaks. */
async function getLocalSeed(): Promise<string> {
  const existing = await db.meta.get(LOCAL_SEED_KEY)
  if (existing?.value) return existing.value
  const seed = Array.from({ length: 4 }, () => Math.floor(Math.random() * 0xffff).toString(16)).join('')
  await db.meta.put({ key: LOCAL_SEED_KEY, value: seed })
  return seed
}

function isoDaysAgo(dateIso: string, n: number): string {
  const d = new Date(`${dateIso}T00:00:00`)
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

/**
 * Read today's frozen plan, or build + persist it on first access of the day.
 * Safe to call from an effect (writes at most one plan key per day).
 *
 * History is read from Dexie directly (the authoritative persisted state) rather
 * than from a passed-in React array — the `useQuestionHistory` liveQuery starts
 * empty and fills async, so building from a prop at first mount could freeze an
 * existing player's plan with N=0. IndexedDB is already persisted at mount.
 */
export async function getOrCreateTodayPlan(
  pack: { questions: readonly Question[]; subjects: readonly FamilyRef[] },
  now: number = Date.now(),
): Promise<PrescriptionPlan> {
  const date = todayISO()
  const existing = await metaGetJSON<PrescriptionPlan>(planKey(date))
  if (existing) return existing

  const [prev1, prev2, localSeed, history, flagRows, persistedYears, imprints] = await Promise.all([
    metaGetJSON<PrescriptionPlan>(planKey(isoDaysAgo(date, 1))),
    metaGetJSON<PrescriptionPlan>(planKey(isoDaysAgo(date, 2))),
    getLocalSeed(),
    db.questionHistory.toArray(),
    db.questionFlags.toArray(),
    getYearFilter(),
    getImprints(),
  ])
  const recent = [prev1?.breadthFamilyId, prev2?.breadthFamilyId].filter(
    (x): x is string => !!x,
  )
  const flagsByQuestion = new Map<string, QuestionFlagInfo>()
  for (const f of flagRows)
    flagsByQuestion.set(f.questionId, { easyMarked: f.easyMarked, guessedMarked: f.guessedMarked })
  // Invisible coverage-rotation bias: feed each already-grown family's lastTouchedDate
  // so selectBlindSpotFamily prefers not-yet / least-recently-covered subjects.
  const imprintLastTouchedByFamily = new Map(imprints.map((im) => [im.subjectId, im.lastTouchedDate]))
  const plan = buildPlan(pack.questions, history, pack.subjects, {
    date,
    recentBlindSpotFamilyIds: recent,
    localSeed,
    now,
    flagsByQuestion,
    yearSet: effectiveYearSet(persistedYears),
    imprintLastTouchedByFamily,
  })
  // Freeze: only write if still absent (StrictMode / double-mount safe).
  await db.transaction('rw', db.meta, async () => {
    if (!(await metaExists(planKey(date)))) {
      await db.meta.put({ key: planKey(date), value: JSON.stringify(plan) })
    }
  })
  return (await metaGetJSON<PrescriptionPlan>(planKey(date))) ?? plan
}

async function countWithPrefix(prefix: string): Promise<number> {
  return db.meta.where('key').startsWith(prefix).count()
}

/** Rolling count of days ever completed (monotonic; drives NG-0717 stage). */
export async function getCompletedDayCount(): Promise<number> {
  return countWithPrefix(COMPLETED_PREFIX)
}

/**
 * All grown NG-0717 lineage imprints, derived from the write-once per-(subject,date)
 * keys. Returns ONLY families with ≥1 imprint (absent subjects are never
 * materialised — the UI renders no gap/placeholder for them). Ordered
 * earliest-unlocked first, then by subjectId, for stable rendering.
 */
export async function getImprints(): Promise<Ng0717Imprint[]> {
  const rows = await db.meta.where('key').startsWith(IMPRINT_PREFIX).toArray()
  const datesBySubject = new Map<string, string[]>()
  for (const r of rows) {
    const suffix = r.key.slice(IMPRINT_PREFIX.length) // "<subjectId>:<date>"
    const cut = suffix.lastIndexOf(':')
    if (cut < 0) continue
    const subjectId = suffix.slice(0, cut)
    const date = suffix.slice(cut + 1)
    const arr = datesBySubject.get(subjectId) ?? []
    arr.push(date)
    datesBySubject.set(subjectId, arr)
  }
  const imprints: Ng0717Imprint[] = []
  for (const [subjectId, dates] of datesBySubject) {
    dates.sort()
    imprints.push({
      subjectId,
      firstUnlockedDate: dates[0],
      lastTouchedDate: dates[dates.length - 1],
      touches: dates.length,
    })
  }
  imprints.sort(
    (a, b) =>
      a.firstUnlockedDate.localeCompare(b.firstUnlockedDate) ||
      a.subjectId.localeCompare(b.subjectId),
  )
  return imprints
}

// ── Tier claims + energy grants (add-neurons-prescription-tiers-and-sync) ────

/** A tier newly claimed by THIS device's own transition (drives the toast). */
export interface TierCrossing {
  tier: 1 | 2 | 3 | 4
  energy: number
  familyId: string
}

/**
 * Claim one tier if its write-once marker is absent, granting the flat energy
 * ATOMICALLY within the same Dexie tx as the claim (design D3). The claim key is
 * written ONLY if absent, and the `earned` grant fires in the SAME tx ONLY when
 * THIS tx performed the absent→present transition — so a crash can never leave a
 * claim without its energy. ⚠️ LOAD-BEARING IDEMPOTENCY POINT (pull-replay
 * safety): a claim arriving via cross-device sync is written by the metaAdapter
 * — NOT through this helper — so it marks the tier claimed (claim-floor) WITHOUT
 * re-granting locally; the granted energy already rides the MAX-merged `earned`
 * counter.
 */
async function claimTierIfAbsent(
  date: string,
  tier: 1 | 2 | 3 | 4,
  now: number,
): Promise<TierCrossing | null> {
  const key = tier === 1 ? rewardKey(date) : tierClaimKey(date, tier)
  // Date-derived + shared across devices (see grantFamilyForDate): required so a
  // cross-device double-claim collapses under MAX-merge instead of paying two
  // different families (the plan's own family/seed diverge before convergence).
  const familyId = grantFamilyForDate(date)
  const energy = TIER_ENERGY[tier]
  let claimedNow = false
  // ATOMIC claim + grant (add-neurons-prescription-tiers-and-sync fix): the FLAT
  // grant into the MAX-merge `earned` counter happens INSIDE the same tx as the
  // claim write, so a crash can never leave a claim marker without its energy
  // (nor energy without a claim). Direct `earned + energy` — NOT
  // `accrueMazeEnergy` — so no streak/mastery/acceleration/speed multiplier ever
  // scales a tier reward. Because the family is date-derived + shared, two
  // offline devices crossing the same tier write the same flat amount into the
  // SAME family counter → MAX-merge collapses to ~one grant (forgiving-by-design).
  await db.transaction('rw', db.meta, async () => {
    if (await metaExists(key)) return
    await db.meta.put({ key, value: JSON.stringify({ claimedAt: now, energy, familyId }) })
    const k = earnedKey(familyId)
    const cur = Number((await db.meta.get(k))?.value ?? '0') || 0
    await db.meta.put({ key: k, value: String(cur + energy) })
    claimedNow = true
  })
  if (!claimedNow) return null
  return { tier, energy, familyId }
}

/**
 * Recompute the derived tier from today's plan + progress keys and claim any
 * newly-crossed tier (T1's marker = `reward:{date}`, carrying the +10 grant;
 * T2–T4 = `tierClaim:{date}:{t}`). Hooked at the prescription-crediting tail,
 * the cram record point, and the synapse-wire listener, so crossings credit at
 * the moment they happen from any entry point. Returns the tiers THIS call
 * newly claimed (for the verdict-moment toast). No-op without a plan.
 */
export async function recomputeAndClaimTiers(now: number = Date.now()): Promise<TierCrossing[]> {
  const date = todayISO()
  const plan = await metaGetJSON<PrescriptionPlan>(planKey(date))
  if (!plan) return []
  const [wrongDone, breadthDone, cramRescueCount, wireCount, t1Claimed, c2, c3, c4] =
    await Promise.all([
      countWithPrefix(WRONG_PREFIX(date)),
      countWithPrefix(BREADTH_PREFIX(date)),
      countWithPrefix(CRAM_RESCUE_PREFIX(date)),
      countWithPrefix(WIRE_PREFIX(date)),
      metaExists(rewardKey(date)),
      metaExists(tierClaimKey(date, 2)),
      metaExists(tierClaimKey(date, 3)),
      metaExists(tierClaimKey(date, 4)),
    ])
  const claimedTiers = new Set<number>()
  if (c2) claimedTiers.add(2)
  if (c3) claimedTiers.add(3)
  if (c4) claimedTiers.add(4)
  const ladder = deriveTier(plan, {
    wrongDone,
    breadthDone,
    cramRescueCount,
    wireCount,
    t1Claimed,
    claimedTiers,
  })
  const t1Complete = wrongDone >= plan.wrongTarget && breadthDone >= plan.breadthTarget

  const crossings: TierCrossing[] = []
  // T1's claim is independent of the tier spec (legacy plans still earn the +10
  // at completion); T2–T4 claims follow the derived ladder.
  if (t1Complete && !t1Claimed) {
    const c = await claimTierIfAbsent(date, 1, now)
    if (c) crossings.push(c)
  }
  const derived = ladder?.derivedTier ?? 0
  for (const tier of [2, 3, 4] as const) {
    if (tier > derived || claimedTiers.has(tier)) continue
    const c = await claimTierIfAbsent(date, tier, now)
    if (c) crossings.push(c)
  }
  return crossings
}

/**
 * Record a synapse wire key for today (write-once per (date, pairKey) → the
 * same pair forming then strengthening counts once per day) and recompute the
 * tier ladder. Called by the boot-time listener (prescription-wire.ts) AFTER
 * its anti-farm arming check; exported for tests.
 */
export async function recordSynapseWire(
  pairKey: string,
  now: number = Date.now(),
): Promise<TierCrossing[]> {
  const date = todayISO()
  const k = wireKey(date, pairKey)
  if (!(await metaExists(k))) await db.meta.put({ key: k, value: '1' })
  return recomputeAndClaimTiers(now)
}

/**
 * Anti-farm basis check (design D6, implemented as the settlement-hook
 * intersection — the CHOSEN mechanism): a settlement's counted repairs qualify
 * for tier-countable synapse credit only when they intersect today's plan's
 * frozen `wrongEligibleQuestionIds` — a pre-today wrong set by construction —
 * so deliberately failing fresh questions today and immediately repairing them
 * can never mint wire-key credit. Checked at the settlement hook point
 * (OverviewPage's `creditConnectomeFromExpedition` call site) where the flipped
 * question ids are known; the payload-poor synapse listener only sees the
 * armed/disarmed result. (The `everWrong`-before-today gate was the fallback —
 * not needed since the flipped ids are available at the hook point.)
 */
export async function hasPreTodayWrongBasis(
  repairedQuestionIds: readonly string[],
): Promise<boolean> {
  if (repairedQuestionIds.length === 0) return false
  const plan = await metaGetJSON<PrescriptionPlan>(planKey(todayISO()))
  if (!plan) return false
  const frozen = new Set(plan.wrongEligibleQuestionIds)
  return repairedQuestionIds.some((id) => frozen.has(id))
}

/**
 * Record a quiz answer against today's prescription. Idempotent + deduped:
 * - 訂正錯題 counts a snapshot-wrong question answered correctly (write-once).
 * - 開發盲區 counts a snapshot-unseen question in the 盲區 family on first answer,
 *   correct OR wrong (write-once).
 * When both lines reach target, writes the write-once completion key; the tier
 * recompute at the tail claims T1's reward (+10 grant) and any further crossed
 * tier. No-op when today's plan does not exist yet.
 */
export async function recordPrescriptionAnswer(
  questionId: string,
  family: string,
  isCorrect: boolean,
  now: number = Date.now(),
): Promise<{
  repairConsolidated: boolean
  breadthConsolidated: boolean
  justCompleted: boolean
  tierCrossings: TierCrossing[]
}> {
  const date = todayISO()
  const plan = await metaGetJSON<PrescriptionPlan>(planKey(date))
  if (!plan)
    return {
      repairConsolidated: false,
      breadthConsolidated: false,
      justCompleted: false,
      tierCrossings: [],
    }

  // Each flag is true only when THIS answer newly credits the matching line — a snapshot
  // repair question consolidated (first correct today), a breadth-family question first
  // answered today, or this being the answer that completes both lines. Fired from ANY
  // entry point (答題 / 出征 / 模考 / 考前猜題 practice): a deliberate exception to the
  // practice-inert contract, scoped to prescription crediting only.
  let repairConsolidated = false
  let breadthConsolidated = false
  let justCompleted = false
  if (isCorrect && plan.wrongEligibleQuestionIds.includes(questionId)) {
    const k = wrongKey(date, questionId)
    if (!(await metaExists(k))) {
      await db.meta.put({ key: k, value: '1' })
      repairConsolidated = true
    }
  }
  if (
    plan.breadthFamilyId != null &&
    family === plan.breadthFamilyId &&
    plan.breadthEligibleQuestionIds.includes(questionId)
  ) {
    const k = breadthKey(date, questionId)
    if (!(await metaExists(k))) {
      await db.meta.put({ key: k, value: '1' })
      breadthConsolidated = true
    }
  }

  const [wrongDone, breadthDone] = await Promise.all([
    countWithPrefix(WRONG_PREFIX(date)),
    countWithPrefix(BREADTH_PREFIX(date)),
  ])
  if (wrongDone >= plan.wrongTarget && breadthDone >= plan.breadthTarget) {
    // Celebration-once (design D9): `justCompleted` is true ONLY on the LOCAL
    // absent→present transition of `completed:{date}` — a device that learns of
    // completion via a pulled bundle never sees it, so the 「今日處方箋完成」note
    // + NG-0717 stage-up presentation play once per (account, day), on the
    // first-completing device. The reward key is claimed (with its +10 grant)
    // by the tier recompute at the tail below.
    if (!(await metaExists(completedKey(date)))) {
      await db.meta.put({ key: completedKey(date), value: JSON.stringify({ completedAt: now }) })
      justCompleted = true
    }
    // NG-0717 lineage imprint: grow/advance today's 開發新連結 family (write-once per
    // (subject, date); touches derive from the prefix count). breadthFamilyId null →
    // no imprint this day. The repair line never grows an imprint (it advances only
    // NG-0717's rolling-day maturation).
    if (plan.breadthFamilyId != null) {
      const ik = imprintKey(plan.breadthFamilyId, date)
      if (!(await metaExists(ik))) await db.meta.put({ key: ik, value: '1' })
    }
  }
  // Tier-crossing hook (a): after the progress writes, recompute the derived
  // tier and claim any newly-crossed tier — surfaced at the verdict moment.
  const tierCrossings = await recomputeAndClaimTiers(now)
  return { repairConsolidated, breadthConsolidated, justCompleted, tierCrossings }
}

/**
 * Read-only snapshot of today's plan's eligible question ids (repair ∪ breadth),
 * or `null` when today has no plan yet. Deliberately does NOT create a plan (unlike
 * `getOrCreateTodayPlan`) — used by /cram to prioritize snapshot questions into the
 * practice pool so the prescription-crediting payoff is reliably reachable, without
 * materializing the plan as a side effect of merely opening /cram. No-plan → null →
 * caller falls back to normal shuffle (zero behavior change).
 */
export async function getTodayPlanSnapshotIds(): Promise<Set<string> | null> {
  const plan = await metaGetJSON<PrescriptionPlan>(planKey(todayISO()))
  if (!plan) return null
  return new Set([...plan.wrongEligibleQuestionIds, ...plan.breadthEligibleQuestionIds])
}

/**
 * Record a cram-practice answer toward today's 考前救援 bonus (write-once per
 * date+question; correct OR wrong). SYNCED (write-once UNION, date-windowed);
 * wiped with the prescription prefix. The key write is a no-op after the first
 * answer for a given question today; the tail recompute is tier-crossing hook
 * (b) — cram units count when T2 froze in cram-fallback mode (and toward T4's
 * fallback stream), so a cram answer can cross a tier at the verdict moment.
 */
export async function recordCramRescueAnswer(
  questionId: string,
  now: number = Date.now(),
): Promise<{ tierCrossings: TierCrossing[] }> {
  const k = cramRescueKey(todayISO(), questionId)
  if (!(await metaExists(k))) await db.meta.put({ key: k, value: '1' })
  return { tierCrossings: await recomputeAndClaimTiers(now) }
}

/** Full reactive-friendly status snapshot (reads meta; plan must already exist). */
export async function getPrescriptionStatus(): Promise<PrescriptionStatus> {
  const date = todayISO()
  const [
    plan,
    wrongDone,
    breadthDone,
    completedDayCount,
    cramRescueCount,
    wireCount,
    t1Claimed,
    c2,
    c3,
    c4,
  ] = await Promise.all([
    metaGetJSON<PrescriptionPlan>(planKey(date)),
    countWithPrefix(WRONG_PREFIX(date)),
    countWithPrefix(BREADTH_PREFIX(date)),
    getCompletedDayCount(),
    countWithPrefix(CRAM_RESCUE_PREFIX(date)),
    countWithPrefix(WIRE_PREFIX(date)),
    metaExists(rewardKey(date)),
    metaExists(tierClaimKey(date, 2)),
    metaExists(tierClaimKey(date, 3)),
    metaExists(tierClaimKey(date, 4)),
  ])
  const claimedTiers = new Set<number>()
  if (c2) claimedTiers.add(2)
  if (c3) claimedTiers.add(3)
  if (c4) claimedTiers.add(4)
  return deriveStatus(plan, wrongDone, breadthDone, completedDayCount, cramRescueCount >= CRAM_RESCUE_TARGET, {
    cramRescueCount,
    wireCount,
    t1Claimed,
    claimedTiers,
  })
}

/** Pure status derivation (exported for tests). */
export function deriveStatus(
  plan: PrescriptionPlan | null,
  wrongDone: number,
  breadthDone: number,
  completedDayCount: number,
  cramRescueDone = false,
  tierInputs?: TierProgressInputs,
): PrescriptionStatus {
  const wrongComplete = plan ? wrongDone >= plan.wrongTarget : false
  const breadthComplete = plan ? breadthDone >= plan.breadthTarget : false
  const dayComplete = !!plan && wrongComplete && breadthComplete
  const nextTarget: 'wrong' | 'breadth' | null = !plan
    ? null
    : !wrongComplete
      ? 'wrong'
      : !breadthComplete
        ? 'breadth'
        : null
  const tier = deriveTier(plan, {
    wrongDone,
    breadthDone,
    cramRescueCount: tierInputs?.cramRescueCount ?? 0,
    wireCount: tierInputs?.wireCount ?? 0,
    t1Claimed: tierInputs?.t1Claimed ?? false,
    claimedTiers: tierInputs?.claimedTiers ?? new Set(),
  })
  return {
    plan,
    wrongDone,
    breadthDone,
    wrongComplete,
    breadthComplete,
    dayComplete,
    nextTarget,
    completedDayCount,
    ng0717Stage: ng0717Stage(completedDayCount),
    keepsakeUnlocked: completedDayCount >= NG0717_FULL_MATURITY,
    cramRescueDone,
    tier,
  }
}

// ── Lights-out (熄燈儀式) — local-only, clears at midnight ────────────────────

export async function isLightsOutToday(): Promise<boolean> {
  return metaExists(lightsOutKey(todayISO()))
}

export async function setLightsOutToday(now: number = Date.now()): Promise<void> {
  const k = lightsOutKey(todayISO())
  if (!(await metaExists(k))) await db.meta.put({ key: k, value: JSON.stringify({ at: now }) })
}

/** Undo today's lights-out (「還是想再讀一下」). */
export async function clearLightsOutToday(): Promise<void> {
  await db.meta.delete(lightsOutKey(todayISO()))
}
