/**
 * Recruitment gacha configuration for `medexam2-tw` content pack.
 *
 * All numeric values are locked here per design.md of `wire-recruitment-gacha`
 * change (2026-05-15). Subsequent dogfood-based tuning happens by editing this
 * single file in a follow-up change.
 *
 * Threshold values are derived from `Math.ceil(subject.totalQuestions × 0.05)`
 * against `subjects.json` as of `ingest-medexam2-tw-corpus` archive. They are
 * recorded as literals (not runtime-computed) so a corpus refresh does not
 * silently drift the gating values. The build script asserts that every
 * `subjectId` here exists in the built `subjects.json`.
 */

import type { GachaTier, PityRule, SubjectId } from '@study-rpg/core'

export type Rarity = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

export const RARITY_ORDER: Rarity[] = ['P5', 'P4', 'P3', 'P2', 'P1']

export const RARITY_LABELS: Record<Rarity, string> = {
  P1: '夯',
  P2: '頂級',
  P3: '人上人',
  P4: 'NPC',
  P5: '拉完了',
}

/** Hospital-hierarchy title used when generating a doctor's auto-default name
 *  `"<displayName> <title> #<seq>"`. Mirrors Taiwan med-center career ladder:
 *  P1 教授級 / P2 科主任 / P3 高年主治 / P4 年輕主治 / P5 住院醫師. */
export const DEFAULT_DOCTOR_TITLE_BY_RARITY: Record<Rarity, string> = {
  P1: '大P',
  P2: '主任',
  P3: 'Senior V',
  P4: 'Young V',
  P5: 'R',
}

/** Doctor powerMultiplier per rarity tier. Strictly monotonic; endpoints
 *  locked by hospital-management-mode spec. */
export const RARITY_POWER_MULTIPLIER: Record<Rarity, number> = {
  P1: 5.0,
  P2: 3.5,
  P3: 2.0,
  P4: 1.0,
  P5: 0.5,
}

/** Weight distribution per 100 rolls, mirrors the loot N/R/SR/SSR/UR balance. */
export const RECRUITMENT_WEIGHTS: GachaTier[] = [
  { id: 'P5', weight: 60 },
  { id: 'P4', weight: 25 },
  { id: 'P3', weight: 10 },
  { id: 'P2', weight: 4 },
  { id: 'P1', weight: 1 },
]

/** Pity guarantees: P3+ at 30 rolls, P2+ at 100 rolls. P1 has no pity. */
export const RECRUITMENT_PITY_RULES: PityRule[] = [
  { tier: 'P3', atRolls: 30 },
  { tier: 'P2', atRolls: 100 },
]

/** Starter pull (onboarding) weights — excludes P5, re-normalizes P4/P3/P2/P1
 *  from existing 25/10/4/1 ratio (P4 62.5% / P3 25% / P2 10% / P1 2.5%). */
export const STARTER_PULL_WEIGHTS: GachaTier[] = [
  { id: 'P4', weight: 25 },
  { id: 'P3', weight: 10 },
  { id: 'P2', weight: 4 },
  { id: 'P1', weight: 1 },
]

/** Per-subject affinity threshold to unlock that subject's recruitment banner.
 *  Locked literals — see header comment for derivation. */
export const RECRUITMENT_THRESHOLDS: Record<SubjectId, number> = {
  '內科': 66,
  '外科': 58,
  '小兒科': 36,
  '婦產科': 33,
  '精神科': 16,
  '復健科': 16,
  '神經內科': 15,
  '家醫科': 11,
  '皮膚科': 11,
  '麻醉科': 10,
  '骨科': 10,
  '耳鼻喉科': 10,
  '眼科': 10,
  '泌尿科': 9,
}

/** Initial ticket count when a save is first created. */
export const INITIAL_TICKETS = 10

/** Hard cap on ticket inventory. Daily-refresh grants are clamped to this. */
export const TICKET_CAP = 99

/** Milliseconds per UTC-equivalent day, used for `lastRefreshDay` arithmetic. */
export const MS_PER_DAY = 86_400_000

// ─── Quiz economy constants (add-quiz-economy-redesign) ─────────────────────
// TUNED 2026-05-18 — first dogfood pass; revisit after 1-2 weeks of telemetry.
// Anchored to 30-day full-clear math model (see add-quiz-economy-redesign/design.md).

/** Base revenue granted per correct quiz answer (before specialty × reading-buff multipliers). */
export const QUIZ_REVENUE_PER_CORRECT_BASE = 80

/** Base reputation granted per correct quiz answer (before specialty × reading-buff multipliers). */
export const QUIZ_REPUTATION_PER_CORRECT_BASE = 80

/** Fresh-correct count threshold that triggers +1 ticket grant. */
export const QUIZ_TICKET_GRANT_PER_N_CORRECT = 25

/** Ticket bonus on first-time banner unlock (per subject). */
export const BANNER_UNLOCK_TICKET_BONUS = 1

/** Lifetime cap on banner-first-unlock ticket bonuses (= number of subjects). */
export const BANNER_UNLOCK_TICKET_LIFETIME_CAP = 14

/** Multiplier applied to quiz revenue/reputation while a reading session is active. */
export const READING_SESSION_BUFF_MULTIPLIER = 1.5

/**
 * Multiplier applied to tick-loop idle accrual (revenue + reputation) — reduces
 * idle income to 30% of throughput so quiz is the primary reward path. Does NOT
 * affect salary drain (salary stays at full rate).
 */
export const READING_IDLE_RATE_REDUCTION = 0.3

// QUIZ_TIER_MULTIPLIER moved to clinic-tiers.ts (co-located with HospitalTier
// definition + TIER_UPGRADE_THRESHOLDS to avoid circular import).
