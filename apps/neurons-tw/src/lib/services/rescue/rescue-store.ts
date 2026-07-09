/**
 * Multi-subject rescue — R2-synced store (rides the `meta` kv, zero Dexie bump).
 *
 * Holds the rescue mode's mutable state: PER-FAMILY plan envelopes, pre-reveal
 * confidence taps, and stop-loss override flags all persist in the Dexie `meta`
 * table under the `rescue:v1:` namespace and sync cross-device via the existing
 * R2 `neurons` bundle (add-neurons-multi-subject-rescue). Multiple plans coexist,
 * at most one per family, each under `rescue:v1:plan:{familyId}`. Only telemetry
 * stays device-local (localStorage, append-only). A rescue sprint is exactly
 *「這個帳號、這幾天」，最常在 iPhone / iPad 交替使用 — so the plan shells + confidence +
 * overrides must follow the account, not the device.
 *
 * Architecture (design D10):
 *   - `db.meta` is the SYNCED authority; a `db.meta.put` fires the Dexie push
 *     hook (`meta` is in NEURONS_ADAPTERS) → schedulePush → R2.
 *   - An in-memory mirror (`envelopes: Map<familyId, PlanEnvelope>`) is the
 *     SYNCHRONOUS read source for the `useSyncExternalStore` facade; every
 *     mutation updates it optimistically then write-throughs to `db.meta`.
 *   - A localStorage cache of the envelope MAP gives a zero-flash synchronous
 *     boot (the phase decision reads `getActivePlan(familyId)` before Dexie loads).
 *   - A Dexie `liveQuery` reconciles the mirror + cache from `db.meta` on any
 *     cross-tab write or cross-device pull, then notifies listeners.
 *
 * Merge semantics live in `rescue-sync-keys.ts` (LWW pickers) + `backfill/
 * rescue.ts` (post-pass, iterating every incoming `rescue:v1:plan:*` key); this
 * store only mints keys + writes.
 *
 * Spec: neurons-single-subject-rescue "Rescue plans SHALL sync per-family as
 * coexisting latest-action-wins LWW envelopes, lifecycle-managed".
 */

import { useSyncExternalStore } from 'react'
import { liveQuery, type Subscription } from 'dexie'
import { db } from '../../db'
import { shouldArchiveRescue } from './rescue-lifecycle'
import { resolvePendingBlitzFlush, type PendingBlitzDone } from './rescue-blitz-defer'
import type { ConfidenceSignal } from './rescue-priority'
import type { OverrideState } from './rescue-stoploss'
import {
  RESCUE_META_PREFIX,
  RESCUE_PLAN_KEY,
  RESCUE_PLAN_KEY_PREFIX,
  RESCUE_CONF_KEY_PREFIX,
  RESCUE_OVR_KEY_PREFIX,
  rescuePlanKey,
  rescueConfKey,
  rescueOvrKey,
  parsePlanEnvelope,
  parseConfRecord,
  parseOvrRecord,
  type RescuePlan,
  type PlanEnvelope,
} from './rescue-sync-keys'

export type { RescuePlan } from './rescue-sync-keys'
export {
  RESCUE_META_PREFIX,
  RESCUE_PLAN_KEY,
  rescuePlanKey,
  rescueConfKey,
  rescueOvrKey,
  isSyncedRescueKey,
} from './rescue-sync-keys'

/** localStorage cache of the per-family envelope MAP — zero-flash synchronous
 *  boot only; `db.meta` remains the synced authority. */
const ENVS_CACHE_KEY = 'neurons:rescue:envs:v1'
/** LEGACY single-envelope cache (pre-multi-subject) — read once as a back-compat
 *  warm so an upgrading user mid-rescue doesn't flash an empty scene for one boot. */
const LEGACY_ENV_CACHE_KEY = 'neurons:rescue:env:v1'
/** Device-local telemetry (append-only, exportable; NOT synced). */
const TELEMETRY_KEY = 'neurons:rescue:telemetry:v1'
/** One-time migration marker — survives account wipe so the legacy shell is
 *  never re-seeded into a switched-in account (resurrection guard). */
const MIGRATED_KEY = 'neurons:rescue:migrated'
/** Legacy device-local blob (pre-sync) — read once by the migration, then kept
 *  as a read-only rollback fallback (owner-locked open-Q #5). */
const LEGACY_KEY = 'neurons:rescue:v1'
const LEGACY_BLITZ_KEY = 'neurons:rescue:blitzDone'
/** Device-local set of plan `createdAt`s this device has ACKNOWLEDGED — either by
 *  starting the plan here or by having seen the "continued from another device"
 *  reconcile note. A pulled active plan whose createdAt is absent here surfaces
 *  the one-time note (device-local hint, never synced). */
const KNOWN_PLANS_KEY = 'neurons:rescue:known'
/** Cap telemetry so localStorage never grows unbounded; keeps the most recent. */
const TELEMETRY_CAP = 4000

export interface RescueTelemetryEvent {
  /** epoch ms. */
  t: number
  kind: string
  [extra: string]: unknown
}

export interface RescueState {
  /** All ACTIVE (non-null) plans, one per family, sorted by `createdAt` asc. */
  plans: RescuePlan[]
  /** familyId → (questionId → pre-reveal confidence tap) for that family's ACTIVE run. */
  confidenceByFamily: Record<string, Record<string, ConfidenceSignal>>
  /** familyId → (conceptId → stop-loss override) for that family's ACTIVE run. */
  overridesByFamily: Record<string, Record<string, OverrideState>>
  telemetry: RescueTelemetryEvent[]
}

const EMPTY: RescueState = { plans: [], confidenceByFamily: {}, overridesByFamily: {}, telemetry: [] }

// ── in-memory mirror (synchronous read source) ───────────────────────────────
/** familyId → plan envelope (may hold an explicit-null plan for a cleared family). */
const envelopes = new Map<string, PlanEnvelope>()
/** full conf/ovr meta key → raw JSON value (all runs; readers scope by active plan). */
const confRows = new Map<string, string>()
const ovrRows = new Map<string, string>()

const listeners = new Set<() => void>()
/** Cached facade snapshot — stable reference between mutations for useSyncExternalStore. */
let snapshot: RescueState = EMPTY

/** Strictly-increasing `createdAt` mint (same-device +1ms de-dup): two plans
 *  started in the same millisecond never share a run scope (design D1). */
let lastMintedCreatedAt = 0
function mintCreatedAt(): number {
  let now = Date.now()
  if (now <= lastMintedCreatedAt) now = lastMintedCreatedAt + 1
  lastMintedCreatedAt = now
  return now
}

// ── localStorage helpers (fail-open) ─────────────────────────────────────────
/** Read the per-family envelope cache; back-compat warm from the legacy single
 *  cache when the plural one is absent (one-boot upgrade grace). */
function readEnvCache(): Map<string, PlanEnvelope> {
  const out = new Map<string, PlanEnvelope>()
  try {
    const raw = localStorage.getItem(ENVS_CACHE_KEY)
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, unknown>
      if (obj && typeof obj === 'object') {
        for (const [familyId, envValue] of Object.entries(obj)) {
          const env = parsePlanEnvelope(typeof envValue === 'string' ? envValue : JSON.stringify(envValue))
          if (env) out.set(familyId, env)
        }
      }
      return out
    }
    const legacyRaw = localStorage.getItem(LEGACY_ENV_CACHE_KEY)
    const legacyEnv = legacyRaw ? parsePlanEnvelope(legacyRaw) : null
    if (legacyEnv?.plan?.familyId) out.set(legacyEnv.plan.familyId, legacyEnv)
  } catch {
    /* private mode — cache simply doesn't warm the next boot */
  }
  return out
}
function writeEnvCache(): void {
  try {
    const obj: Record<string, PlanEnvelope> = {}
    for (const [familyId, env] of envelopes) obj[familyId] = env
    localStorage.setItem(ENVS_CACHE_KEY, JSON.stringify(obj))
  } catch {
    /* private mode — cache simply doesn't warm the next boot */
  }
}
function readTelemetry(): RescueTelemetryEvent[] {
  try {
    const raw = localStorage.getItem(TELEMETRY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RescueTelemetryEvent[]) : []
  } catch {
    return []
  }
}
function writeTelemetry(events: RescueTelemetryEvent[]): void {
  try {
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(events))
  } catch {
    /* private mode — telemetry doesn't persist across reloads */
  }
}

// ── reconcile-note bookkeeping (device-local hint; NOT synced) ───────────────
function readKnownPlans(): Set<number> {
  try {
    const raw = localStorage.getItem(KNOWN_PLANS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? (arr as number[]) : [])
  } catch {
    return new Set()
  }
}
function addKnownPlan(createdAt: number): void {
  try {
    const set = readKnownPlans()
    if (set.has(createdAt)) return
    set.add(createdAt)
    // Keep bounded — a handful of recent runs is all that matters.
    localStorage.setItem(KNOWN_PLANS_KEY, JSON.stringify([...set].slice(-20)))
  } catch {
    /* fail-open — worst case the note shows once more */
  }
}
/** Whether the active plan (`createdAt`) arrived from another device and its
 *  one-time "continued here" note has not yet been shown on this device. */
export function shouldShowReconcileNote(createdAt: number): boolean {
  return !readKnownPlans().has(createdAt)
}
/** Mark the active plan as acknowledged on this device (suppresses the note). */
export function markPlanKnown(createdAt: number): void {
  addKnownPlan(createdAt)
}

// ── snapshot recompute + notify ──────────────────────────────────────────────
function computeSnapshot(): RescueState {
  const plans: RescuePlan[] = []
  const confidenceByFamily: Record<string, Record<string, ConfidenceSignal>> = {}
  const overridesByFamily: Record<string, Record<string, OverrideState>> = {}
  for (const [familyId, env] of envelopes) {
    const plan = env.plan
    if (!plan) continue
    plans.push(plan)
    // The prefix is minted through the SAME key function so it can never drift
    // from the writer (empty id → the trailing-colon prefix).
    const confPrefix = rescueConfKey(plan.createdAt, familyId, '')
    const conf: Record<string, ConfidenceSignal> = {}
    for (const [key, raw] of confRows) {
      if (!key.startsWith(confPrefix)) continue
      const rec = parseConfRecord(raw)
      if (rec) conf[key.slice(confPrefix.length)] = rec.signal
    }
    confidenceByFamily[familyId] = conf
    const ovrPrefix = rescueOvrKey(plan.createdAt, familyId, '')
    const ovr: Record<string, OverrideState> = {}
    for (const [key, raw] of ovrRows) {
      if (!key.startsWith(ovrPrefix)) continue
      const rec = parseOvrRecord(raw)
      if (rec) ovr[key.slice(ovrPrefix.length)] = { setAt: rec.setAt, attemptsAtOverride: rec.attemptsAtOverride }
    }
    overridesByFamily[familyId] = ovr
  }
  plans.sort((a, b) => a.createdAt - b.createdAt)
  return { plans, confidenceByFamily, overridesByFamily, telemetry: readTelemetry() }
}
function notify(): void {
  snapshot = computeSnapshot()
  listeners.forEach((fn) => fn())
}

// ── write-through to db.meta (best-effort; mirror already updated) ───────────
function putMeta(key: string, value: string): void {
  void db.meta.put({ key, value }).catch((err) => {
    console.error('[rescue] meta write failed', key, err)
  })
}
/** Write a family's whole envelope (mirror + cache + db.meta) and notify. */
function writeEnvelope(familyId: string, env: PlanEnvelope): void {
  envelopes.set(familyId, env)
  writeEnvCache()
  putMeta(rescuePlanKey(familyId), JSON.stringify(env))
  notify()
}

// ── reads ────────────────────────────────────────────────────────────────────
export function getRescueState(): RescueState {
  return snapshot
}
/** The ACTIVE plan for one family (null if none / cleared). */
export function getActivePlan(familyId: string): RescuePlan | null {
  return envelopes.get(familyId)?.plan ?? null
}
/** All ACTIVE plans (stable ref between changes). */
export function getActivePlans(): RescuePlan[] {
  return snapshot.plans
}
export function getConfidence(familyId: string, questionId: string): ConfidenceSignal {
  const plan = getActivePlan(familyId)
  if (!plan) return undefined
  const raw = confRows.get(rescueConfKey(plan.createdAt, familyId, questionId))
  return raw ? (parseConfRecord(raw)?.signal ?? undefined) : undefined
}
export function getOverride(familyId: string, conceptId: string): OverrideState | undefined {
  const plan = getActivePlan(familyId)
  if (!plan) return undefined
  const raw = ovrRows.get(rescueOvrKey(plan.createdAt, familyId, conceptId))
  const rec = raw ? parseOvrRecord(raw) : null
  return rec ? { setAt: rec.setAt, attemptsAtOverride: rec.attemptsAtOverride } : undefined
}

// ── lifecycle ────────────────────────────────────────────────────────────────
export interface StartRescueInput {
  familyId: string
  examDate: string
  dailyMinutes: number
}
export type StartRescueResult = { ok: true; plan: RescuePlan; resumed?: boolean }

/**
 * Start a rescue plan for a family. Multiple families coexist independently
 * (design D1) — starting B while A is active does NOT replace A. A SAME-family
 * live plan with no explicit `replace` → CONTINUE the existing run (`resumed:
 * true`, zero writes): minting a fresh `createdAt` would be a silent restart
 * whose later `updatedAt` LWW-wins over the cloud run, wiping its blitz marker +
 * run-scoped confidence/overrides for that family. Only an explicit `replace`
 * (deliberate reset) mints a new run. A new run mints a strictly-increasing
 * `createdAt` (same-device +1ms de-dup) which re-scopes that family's
 * confidence/override reads — the previous run's keys are simply ignored.
 *
 * The coexistence cap (soft-3 / hard-5) is enforced at the UI setup layer, not
 * here (the store still resumes / edits an EXISTING family unconditionally).
 */
export function startRescue(input: StartRescueInput, opts?: { replace?: boolean }): StartRescueResult {
  const current = getActivePlan(input.familyId)
  if (current && !opts?.replace) {
    return { ok: true, plan: current, resumed: true }
  }
  const now = mintCreatedAt()
  const plan: RescuePlan = {
    familyId: input.familyId,
    examDate: input.examDate,
    dailyMinutes: input.dailyMinutes,
    createdAt: now,
    lastStudiedAt: now,
  }
  // A locally-started plan is "known" — its reconcile note never fires here.
  addKnownPlan(now)
  writeEnvelope(input.familyId, { plan, updatedAt: now })
  return { ok: true, plan }
}

/**
 * Edit an active plan's exam date / daily-minutes in place (same run — the
 * `createdAt` and run-scoped confidence/overrides are preserved). Rewrites that
 * family's envelope with a fresh `updatedAt` so the edit propagates cross-device.
 */
export function editRescuePlan(
  familyId: string,
  patch: { examDate?: string; dailyMinutes?: number },
): void {
  const plan = getActivePlan(familyId)
  if (!plan) return
  const now = Date.now()
  const next: RescuePlan = {
    ...plan,
    ...(patch.examDate !== undefined ? { examDate: patch.examDate } : {}),
    ...(patch.dailyMinutes !== undefined ? { dailyMinutes: patch.dailyMinutes } : {}),
  }
  writeEnvelope(familyId, { plan: next, updatedAt: now })
}

/** Abandon one family's active plan — writes an explicit `plan: null` envelope
 *  (LWW-null, propagates the clear to every device) for THAT family only. */
export function abandonRescue(familyId: string): void {
  if (!getActivePlan(familyId)) return
  writeEnvelope(familyId, { plan: null, updatedAt: Date.now() })
}

/**
 * Auto-archive EVERY plan whose `examDate + 1 day` has been reached (design D7:
 * iterate all plans, archive each at its own exam date; missing one lets an
 * expired plan linger, over-eager clearing wipes a sibling). Returns whether it
 * archived any.
 */
export function archiveIfDue(todayISO: string): boolean {
  const due: string[] = []
  for (const [familyId, env] of envelopes) {
    if (env.plan && shouldArchiveRescue(env.plan.examDate, todayISO)) due.push(familyId)
  }
  for (const familyId of due) writeEnvelope(familyId, { plan: null, updatedAt: Date.now() })
  return due.length > 0
}

export function touchLastStudied(familyId: string, now: number = Date.now()): void {
  const plan = getActivePlan(familyId)
  if (!plan) return
  writeEnvelope(familyId, { plan: { ...plan, lastStudiedAt: now }, updatedAt: now })
}

// ── per-run mutations ─────────────────────────────────────────────────────────
/**
 * Record a pre-reveal confidence tap under an EXPLICIT run scope (`planCreatedAt`)
 * captured when the answering session opened — NOT resolved at write time. If the
 * family's plan was sync-replaced (new createdAt) or abandoned (null) mid-session,
 * the tap no-ops rather than landing under the wrong run (Codex/Fable review fix 2).
 */
export function recordConfidence(
  familyId: string,
  planCreatedAt: number,
  questionId: string,
  signal: ConfidenceSignal,
): void {
  const plan = getActivePlan(familyId)
  if (!plan || plan.createdAt !== planCreatedAt || signal === undefined) return
  const key = rescueConfKey(planCreatedAt, familyId, questionId)
  const value = JSON.stringify({ signal, at: Date.now() })
  confRows.set(key, value)
  putMeta(key, value)
  notify()
}

export function setOverride(familyId: string, conceptId: string, override: OverrideState): void {
  const plan = getActivePlan(familyId)
  if (!plan) return
  const key = rescueOvrKey(plan.createdAt, familyId, conceptId)
  const value = JSON.stringify({ setAt: override.setAt, attemptsAtOverride: override.attemptsAtOverride })
  ovrRows.set(key, value)
  putMeta(key, value)
  notify()
}

// ── telemetry (thin, append-only, exportable; device-local, NOT synced) ──────
export function appendTelemetry(event: { kind: string; t?: number; [extra: string]: unknown }): void {
  const ev: RescueTelemetryEvent = { ...event, t: event.t ?? Date.now() }
  const telemetry = [...readTelemetry(), ev].slice(-TELEMETRY_CAP)
  writeTelemetry(telemetry)
  // NO notify() — telemetry is not on the reactive facade (nothing renders it;
  // exportTelemetry reads localStorage directly). Notifying here would rebuild
  // confidence/overrides refs and re-trigger the scene's heavy queue useMemo on
  // every event. useRescueState().telemetry refreshes on the next real change.
}
export function exportTelemetry(): string {
  return JSON.stringify(readTelemetry(), null, 2)
}

// ── diagnostic-blitz "ran once" marker (rides the plan envelope; cross-device) ─
// The blitz runs at most once PER PLAN across all devices (design D6). A second
// device pulling a plan whose `blitzDoneAt` is set rebuilds its queue from the
// synced questionHistory + confidence instead of re-running the diagnostic.
// Replacing a plan (new createdAt, blitzDoneAt absent) naturally re-arms it.
export function markBlitzDone(familyId: string, planCreatedAt: number): void {
  const plan = getActivePlan(familyId)
  if (!plan || plan.createdAt !== planCreatedAt) return
  const now = Date.now()
  writeEnvelope(familyId, { plan: { ...plan, blitzDoneAt: now }, updatedAt: now })
}
export function isBlitzDone(familyId: string, planCreatedAt: number): boolean {
  const plan = getActivePlan(familyId)
  return !!plan && plan.createdAt === planCreatedAt && plan.blitzDoneAt != null
}

// ── deferred lifecycle writes (startup-pull gate) ────────────────────────────
// A blitz completion / study-touch that fires while the startup force-pull is
// still in flight (`startupSyncPending`) must be DEFERRED, not dropped — a
// dropped `blitzDoneAt` makes a second device re-run the diagnostic. This state
// is MODULE-LEVEL (not a RescueScene component ref) so it survives the scene
// unmounting before the pull lands; `flushPendingRescueLifecycle` is invoked
// both by the sync layer on startup-pull settlement (survives unmount) and by
// the scene's `startupSyncPending → false` effect (covers the status-poll lag).
// (Codex/Fable review fix 3)
let pendingBlitzDone: PendingBlitzDone | null = null
const pendingTouch = new Set<string>()

/** Defer a blitz completion until the startup pull lands (latest one wins per boot). */
export function deferBlitzDone(familyId: string, planCreatedAt: number): void {
  pendingBlitzDone = { familyId, createdAt: planCreatedAt }
}
/** Defer a study-touch (lastStudiedAt bump) until the startup pull lands. */
export function deferTouchLastStudied(familyId: string): void {
  pendingTouch.add(familyId)
}
/** Whether any lifecycle write is currently deferred (test/inspection helper). */
export function hasPendingRescueLifecycle(): boolean {
  return pendingBlitzDone !== null || pendingTouch.size > 0
}
/**
 * Flush every deferred lifecycle write now that the startup pull has settled.
 * Idempotent — a no-op when nothing is pending. The blitz flush reuses
 * `resolvePendingBlitzFlush`'s replaced/abandoned guard (a stale createdAt must
 * not resurrect a dead run's marker); a touch flushes only onto a still-active plan.
 */
export function flushPendingRescueLifecycle(): void {
  const blitz = pendingBlitzDone
  pendingBlitzDone = null
  if (blitz) {
    const flush = resolvePendingBlitzFlush(blitz, false, getActivePlan(blitz.familyId))
    if (flush) {
      markBlitzDone(flush.familyId, flush.createdAt)
      touchLastStudied(flush.familyId)
    }
  }
  const touches = [...pendingTouch]
  pendingTouch.clear()
  for (const familyId of touches) {
    if (getActivePlan(familyId)) touchLastStudied(familyId)
  }
}

// ── hydration: mirror ← db.meta + liveQuery reconcile + one-time migration ────
let hydrateStarted = false
let hydrated = false
let liveSub: Subscription | null = null
/** Set when the one-time migration seeded synced meta rows. The boot-time
 *  migration can run BEFORE the sync engine attaches its Dexie push hooks, so
 *  those `db.meta.put`s may never fire schedulePush — the engine mount consumes
 *  this flag and schedules an explicit push (review quick-fix: migrated plans
 *  must not linger local until the next unrelated write). */
let migrationPushPending = false

/** Whether the initial mirror load from `db.meta` has completed (fail-open: also
 *  true after a failed load so the scene is never permanently gated). Before
 *  this, `getActivePlan()` may be a stale env-cache warm-boot or empty. */
export function isRescueHydrated(): boolean {
  return hydrated
}

/** Live-reactive hydration flag (see isRescueHydrated). */
export function useRescueHydrated(): boolean {
  return useSyncExternalStore(subscribeRescue, isRescueHydrated, () => false)
}

/** One-shot consumer for the migration's pending-push signal (see
 *  migrationPushPending). Called by the sync-engine mount after it attaches the
 *  Dexie push hooks; returns true at most once per seeded migration. */
export function consumeRescueMigrationPush(): boolean {
  const pending = migrationPushPending
  migrationPushPending = false
  return pending
}

/** Load the mirror from a batch of `rescue:v1:*` meta rows (authoritative).
 *  Only per-family plan keys (`rescue:v1:plan:{familyId}`) feed `envelopes`; the
 *  legacy single `rescue:v1:plan` (no family segment) is ignored — it is handled
 *  by the one-time migration, never loaded as an active plan. */
function loadFromRows(rows: Array<{ key: string; value: string }>): void {
  envelopes.clear()
  confRows.clear()
  ovrRows.clear()
  for (const row of rows) {
    if (row.key.startsWith(RESCUE_PLAN_KEY_PREFIX)) {
      const env = parsePlanEnvelope(row.value)
      if (env) envelopes.set(row.key.slice(RESCUE_PLAN_KEY_PREFIX.length), env)
    } else if (row.key.startsWith(RESCUE_CONF_KEY_PREFIX)) {
      confRows.set(row.key, row.value)
    } else if (row.key.startsWith(RESCUE_OVR_KEY_PREFIX)) {
      ovrRows.set(row.key, row.value)
    }
  }
  writeEnvCache()
}

/**
 * One-time migration of the legacy SINGLE-plan state into the per-family keys
 * (design D9 + multi-subject migration). Two legacy sources:
 *   (a) a `db.meta` legacy `rescue:v1:plan` row (written by a pre-multi build on
 *       THIS device) → migrated into `rescue:v1:plan:{plan.familyId}`, then the
 *       legacy row is deleted (v28 never snapshots it);
 *   (b) the device-local `neurons:rescue:v1` blob (pre-sync) → seeded into the
 *       per-family key + run-scoped conf/ovr keys.
 * A legacy `plan: null` envelope (no familyId) is DISCARDED — it is never used to
 * clear a per-family plan. Per family, the seed only writes when that family has
 * no envelope yet (so a newer cloud/local plan is never clobbered). Conservative
 * timestamp: `updatedAt` / `at` seed from `plan.lastStudiedAt` so any genuinely
 * newer cloud action wins over the migrated shell. Idempotent — a device-local
 * marker prevents re-seeding (so an account-switch wipe can never resurrect the
 * outgoing account's shell). Runs BEFORE the first push (whole-snapshot vacuum
 * guard). The legacy blob is KEPT as a read-only rollback fallback.
 */
export async function migrateRescueLocalState(): Promise<void> {
  let alreadyMigrated = false
  try {
    alreadyMigrated = localStorage.getItem(MIGRATED_KEY) === '1'
  } catch {
    /* fail-open: treat as not migrated; the per-family guards below still hold */
  }
  if (alreadyMigrated) return
  // Mark FIRST so a mid-migration crash / re-entrancy never re-seeds.
  try {
    localStorage.setItem(MIGRATED_KEY, '1')
  } catch {
    /* fail-open */
  }

  let legacy: {
    plan?: RescuePlan | null
    confidence?: Record<string, ConfidenceSignal>
    overrides?: Record<string, OverrideState>
    telemetry?: RescueTelemetryEvent[]
  } | null = null
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    legacy = raw ? JSON.parse(raw) : null
  } catch {
    legacy = null
  }
  // Migrate telemetry into its own key first (device-local, not synced — happens
  // regardless of whether a plan shell is seeded or discarded below).
  if (legacy?.telemetry && Array.isArray(legacy.telemetry) && readTelemetry().length === 0) {
    writeTelemetry(legacy.telemetry.slice(-TELEMETRY_CAP))
  }

  let seededAny = false

  // (a) db.meta legacy single key → per-family (this device's own pre-multi plan).
  try {
    const legacyRow = await db.meta.get(RESCUE_PLAN_KEY)
    if (legacyRow) {
      const env = parsePlanEnvelope(legacyRow.value)
      if (env?.plan && typeof env.plan.familyId === 'string') {
        const famKey = rescuePlanKey(env.plan.familyId)
        const existingFam = await db.meta.get(famKey)
        if (!existingFam) {
          await db.meta.put({ key: famKey, value: JSON.stringify(env) })
          seededAny = true
        }
      }
      // Discard the legacy single row (a `plan: null` legacy or a migrated one):
      // v28 never snapshots it, and it must never clear a per-family plan.
      await db.meta.delete(RESCUE_PLAN_KEY)
    }
  } catch (err) {
    console.error('[rescue] db.meta legacy migration failed', err)
  }

  // (b) localStorage legacy blob → per-family (only when that family has no
  // envelope yet; conservative seed timestamp so a newer cloud plan wins).
  const plan = legacy?.plan
  if (plan && typeof plan.createdAt === 'number' && typeof plan.familyId === 'string') {
    const famKey = rescuePlanKey(plan.familyId)
    const existingFam = await db.meta.get(famKey)
    if (!existingFam) {
      const seedAt = typeof plan.lastStudiedAt === 'number' ? plan.lastStudiedAt : plan.createdAt
      let blitzDoneAt: number | undefined
      try {
        if (localStorage.getItem(LEGACY_BLITZ_KEY) === String(plan.createdAt)) blitzDoneAt = seedAt
      } catch {
        /* ignore */
      }
      const migratedPlan: RescuePlan = {
        familyId: plan.familyId,
        examDate: plan.examDate,
        dailyMinutes: plan.dailyMinutes,
        createdAt: plan.createdAt,
        lastStudiedAt: plan.lastStudiedAt ?? plan.createdAt,
        ...(blitzDoneAt !== undefined ? { blitzDoneAt } : {}),
      }
      await db.meta.put({ key: famKey, value: JSON.stringify({ plan: migratedPlan, updatedAt: seedAt }) })
      for (const [qid, signal] of Object.entries(legacy?.confidence ?? {})) {
        if (signal !== 'sure' && signal !== 'guess') continue
        await db.meta.put({
          key: rescueConfKey(plan.createdAt, plan.familyId, qid),
          value: JSON.stringify({ signal, at: seedAt }),
        })
      }
      for (const [cid, ov] of Object.entries(legacy?.overrides ?? {})) {
        if (!ov || typeof ov.setAt !== 'number') continue
        await db.meta.put({
          key: rescueOvrKey(plan.createdAt, plan.familyId, cid),
          value: JSON.stringify({ setAt: ov.setAt, attemptsAtOverride: ov.attemptsAtOverride ?? 0 }),
        })
      }
      seededAny = true
    }
  }

  // Rows were seeded — flag the engine mount to schedule an explicit push (the
  // puts above may predate the Dexie push hooks; see consumeRescueMigrationPush).
  if (seededAny) migrationPushPending = true
}

/**
 * Boot hydration — runs the one-time migration, loads the mirror from db.meta,
 * then subscribes a liveQuery that reconciles the mirror + cache on any
 * cross-tab write or cross-device pull. Idempotent (StrictMode-safe).
 */
export async function ensureRescueHydrated(): Promise<void> {
  if (hydrateStarted) return
  hydrateStarted = true
  // Warm the mirror synchronously from the localStorage envelope cache so the
  // first render already has the plans (zero-flash) before the async load lands.
  const cached = readEnvCache()
  if (cached.size > 0) {
    envelopes.clear()
    for (const [familyId, env] of cached) envelopes.set(familyId, env)
    snapshot = computeSnapshot()
  }
  try {
    await migrateRescueLocalState()
  } catch (err) {
    console.error('[rescue] migration failed', err)
  }
  try {
    const rows = await db.meta.where('key').startsWith(RESCUE_META_PREFIX).toArray()
    loadFromRows(rows as Array<{ key: string; value: string }>)
  } catch (err) {
    console.error('[rescue] hydrate load failed', err)
  } finally {
    // Fail-open: flip hydrated even when the load failed so the setup CTA is
    // never permanently stuck on「同步中…」(the env-cache warm boot still holds).
    hydrated = true
    notify()
  }
  try {
    liveSub = liveQuery(() => db.meta.where('key').startsWith(RESCUE_META_PREFIX).toArray()).subscribe({
      next: (rows) => {
        loadFromRows(rows as Array<{ key: string; value: string }>)
        notify()
      },
      error: (err) => console.error('[rescue] liveQuery error', err),
    })
  } catch (err) {
    console.error('[rescue] liveQuery subscribe failed', err)
  }
}

/**
 * Clear the device-local plan-envelope cache (account-switch wipe helper). Does
 * NOT touch the migration marker (device-level — must survive so the switched-in
 * account never re-seeds the legacy shell) nor telemetry (device-local, out of
 * the account-wipe scope per spec). The Dexie `rescue:v1:*` rows are deleted by
 * clearLocalSyncedData; the liveQuery reconcile then empties the mirror.
 */
export function clearRescueLocalCache(): void {
  try {
    localStorage.removeItem(ENVS_CACHE_KEY)
    localStorage.removeItem(LEGACY_ENV_CACHE_KEY)
  } catch {
    /* ignore */
  }
}

// ── subscriptions ─────────────────────────────────────────────────────────────
export function subscribeRescue(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Live-reactive active plan for ONE family (re-renders on any same-tab /
 *  cross-device rescue change). */
export function useRescuePlan(familyId: string): RescuePlan | null {
  return useSyncExternalStore(
    subscribeRescue,
    () => getActivePlan(familyId),
    () => null,
  )
}

/** Live-reactive list of ALL active plans (stable ref between changes). */
export function useRescuePlans(): RescuePlan[] {
  return useSyncExternalStore(
    subscribeRescue,
    () => snapshot.plans,
    () => EMPTY.plans,
  )
}

/** Live-reactive full rescue state (plans + per-family confidence/overrides + telemetry). */
export function useRescueState(): RescueState {
  return useSyncExternalStore(subscribeRescue, getRescueState, () => EMPTY)
}

/** Test hook: clear the in-memory mirror + localStorage + db.meta rescue keys. */
export async function __resetRescueStoreForTests(): Promise<void> {
  hydrateStarted = false
  hydrated = false
  migrationPushPending = false
  lastMintedCreatedAt = 0
  pendingBlitzDone = null
  pendingTouch.clear()
  if (liveSub) {
    liveSub.unsubscribe()
    liveSub = null
  }
  envelopes.clear()
  confRows.clear()
  ovrRows.clear()
  snapshot = EMPTY
  try {
    localStorage.removeItem(ENVS_CACHE_KEY)
    localStorage.removeItem(LEGACY_ENV_CACHE_KEY)
    localStorage.removeItem(TELEMETRY_KEY)
    localStorage.removeItem(MIGRATED_KEY)
    localStorage.removeItem(LEGACY_KEY)
    localStorage.removeItem(LEGACY_BLITZ_KEY)
    localStorage.removeItem(KNOWN_PLANS_KEY)
  } catch {
    /* ignore */
  }
  try {
    await db.meta.where('key').startsWith(RESCUE_META_PREFIX).delete()
  } catch {
    /* db may be unavailable in a pure-unit context */
  }
}
