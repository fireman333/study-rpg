/**
 * 今日處方箋 (Daily Prescription) — a forgiving daily two-line quest that kills
 * decision-paralysis in the final exam sprint, plus the NG-0717 collectible
 * (an adult-born dentate granule cell) that matures by rolling completed days.
 *
 * Design: reduce cram anxiety, never add pressure/guilt. Progress is monotonic;
 * a missed day is neutral. ZERO Dexie schema / R2 sync change — all state lives
 * in the existing `meta` key-value table under the `prescription:v1:` namespace,
 * keyed by local ISO date, as write-once keys (absent → truthy, never deleted) so
 * derived `completedDayCount` is monotonic and cross-device LWW is safe.
 *
 * Capability spec: openspec/specs/neurons-daily-prescription/spec.md
 */

import type { Question } from '@study-rpg/core'
import { db, todayISO, type QuestionHistoryRow } from '../db'

/** Minimal family shape the service needs (satisfied by core's `Subject`). */
interface FamilyRef {
  id: string
  displayName: string
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

// Snapshot-size caps. These store the FULL eligible set, not just the first N:
// the fresh / expedition pools do NOT serve in snapshot order, so a small cap
// leaves most answered questions outside the snapshot and uncounted (caught in
// smoke — a served 111-year fresh Q missed a 104-ordered 60-cap). The corpus is
// bounded (~4600 Q total; a single family ≤ ~600), so a full snapshot is only a
// few KB of local meta. Caps are safety ceilings well above any real corpus.
const WRONG_SNAPSHOT_CAP = 8000
const BREADTH_SNAPSHOT_CAP = 2000

// ── Meta key builders (all local-only; NOT in SYNCED_META_KEYS) ─────────────
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
const COMPLETED_PREFIX = `${NS}:completed:`

// ── Types ───────────────────────────────────────────────────────────────────
export interface PrescriptionPlan {
  date: string
  createdAt: number
  seed: string
  wrongTarget: number
  breadthTarget: number
  breadthFamilyId: string | null
  breadthFamilyLabel: string | null
  /** Snapshot at plan creation — currently-wrong question ids (anti-cheat). */
  wrongEligibleQuestionIds: string[]
  /** Snapshot at plan creation — 盲區 family's unseen question ids. */
  breadthEligibleQuestionIds: string[]
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
 * pick the highest score; skip a family that was the 盲區 on BOTH of the previous
 * 2 days when an alternative exists; break ties deterministically by
 * hash(date + familyId + localSeed).
 */
export function selectBlindSpotFamily(
  candidates: readonly BlindSpotCandidate[],
  recentBlindSpotFamilyIds: readonly string[],
  date: string,
  localSeed: string,
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
    score: blindSpotScore(c.unseenCount, c.totalQuestions, c.outstandingWrongCount, c.uniqueAttempted),
    tie: stableHash(`${date}:${c.familyId}:${localSeed}`),
  }))
  scored.sort((a, b) => b.score - a.score || a.tie - b.tie)
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
  opts: { date: string; recentBlindSpotFamilyIds: readonly string[]; localSeed: string; now: number },
): PrescriptionPlan {
  const wrongIds = history.filter((h) => h.lastResult === 'wrong').map((h) => h.questionId)
  const answered = new Set(history.map((h) => h.questionId))

  const wrongTarget = computeWrongTarget(wrongIds.length, recentAccuracyPct(history))

  const attemptedByFamily = new Map<string, number>()
  const wrongByFamily = new Map<string, number>()
  for (const h of history) {
    attemptedByFamily.set(h.family, (attemptedByFamily.get(h.family) ?? 0) + 1)
    if (h.lastResult === 'wrong')
      wrongByFamily.set(h.family, (wrongByFamily.get(h.family) ?? 0) + 1)
  }
  const totalByFamily = new Map<string, number>()
  const unseenByFamily = new Map<string, string[]>()
  for (const q of pool) {
    totalByFamily.set(q.subject, (totalByFamily.get(q.subject) ?? 0) + 1)
    if (!answered.has(q.id)) {
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

  const blind = selectBlindSpotFamily(candidates, opts.recentBlindSpotFamilyIds, opts.date, opts.localSeed)
  const breadthTarget = computeBreadthTarget(wrongTarget)

  return {
    date: opts.date,
    createdAt: opts.now,
    seed: opts.localSeed,
    wrongTarget,
    breadthTarget,
    breadthFamilyId: blind?.familyId ?? null,
    breadthFamilyLabel: blind?.familyLabel ?? null,
    wrongEligibleQuestionIds: wrongIds.slice(0, WRONG_SNAPSHOT_CAP),
    breadthEligibleQuestionIds: (blind?.unseenQuestionIds ?? []).slice(0, BREADTH_SNAPSHOT_CAP),
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

  const [prev1, prev2, localSeed, history] = await Promise.all([
    metaGetJSON<PrescriptionPlan>(planKey(isoDaysAgo(date, 1))),
    metaGetJSON<PrescriptionPlan>(planKey(isoDaysAgo(date, 2))),
    getLocalSeed(),
    db.questionHistory.toArray(),
  ])
  const recent = [prev1?.breadthFamilyId, prev2?.breadthFamilyId].filter(
    (x): x is string => !!x,
  )
  const plan = buildPlan(pack.questions, history, pack.subjects, {
    date,
    recentBlindSpotFamilyIds: recent,
    localSeed,
    now,
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
 * Record a quiz answer against today's prescription. Idempotent + deduped:
 * - 訂正錯題 counts a snapshot-wrong question answered correctly (write-once).
 * - 開發盲區 counts a snapshot-unseen question in the 盲區 family on first answer,
 *   correct OR wrong (write-once).
 * When both lines reach target, writes the write-once completion + reward keys.
 * No-op when today's plan does not exist yet.
 */
export async function recordPrescriptionAnswer(
  questionId: string,
  family: string,
  isCorrect: boolean,
  now: number = Date.now(),
): Promise<void> {
  const date = todayISO()
  const plan = await metaGetJSON<PrescriptionPlan>(planKey(date))
  if (!plan) return

  if (isCorrect && plan.wrongEligibleQuestionIds.includes(questionId)) {
    const k = wrongKey(date, questionId)
    if (!(await metaExists(k))) await db.meta.put({ key: k, value: '1' })
  }
  if (
    plan.breadthFamilyId != null &&
    family === plan.breadthFamilyId &&
    plan.breadthEligibleQuestionIds.includes(questionId)
  ) {
    const k = breadthKey(date, questionId)
    if (!(await metaExists(k))) await db.meta.put({ key: k, value: '1' })
  }

  const [wrongDone, breadthDone] = await Promise.all([
    countWithPrefix(WRONG_PREFIX(date)),
    countWithPrefix(BREADTH_PREFIX(date)),
  ])
  if (wrongDone >= plan.wrongTarget && breadthDone >= plan.breadthTarget) {
    if (!(await metaExists(completedKey(date)))) {
      await db.meta.put({ key: completedKey(date), value: JSON.stringify({ completedAt: now }) })
    }
    if (!(await metaExists(rewardKey(date)))) {
      await db.meta.put({ key: rewardKey(date), value: JSON.stringify({ claimedAt: now }) })
    }
  }
}

/** Full reactive-friendly status snapshot (reads meta; plan must already exist). */
export async function getPrescriptionStatus(): Promise<PrescriptionStatus> {
  const date = todayISO()
  const [plan, wrongDone, breadthDone, completedDayCount] = await Promise.all([
    metaGetJSON<PrescriptionPlan>(planKey(date)),
    countWithPrefix(WRONG_PREFIX(date)),
    countWithPrefix(BREADTH_PREFIX(date)),
    getCompletedDayCount(),
  ])
  return deriveStatus(plan, wrongDone, breadthDone, completedDayCount)
}

/** Pure status derivation (exported for tests). */
export function deriveStatus(
  plan: PrescriptionPlan | null,
  wrongDone: number,
  breadthDone: number,
  completedDayCount: number,
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
