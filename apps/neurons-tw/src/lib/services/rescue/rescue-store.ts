/**
 * Single-subject rescue — R2-synced store (rides the `meta` kv, zero Dexie bump).
 *
 * Holds the rescue mode's mutable state: the active plan envelope, pre-reveal
 * confidence taps, and stop-loss override flags all persist in the Dexie `meta`
 * table under the `rescue:v1:` namespace and sync cross-device via the existing
 * R2 `neurons` bundle (add-neurons-rescue-r2-sync). Only telemetry stays
 * device-local (localStorage, append-only). A rescue sprint is exactly「這個帳號、
 * 這幾天」，最常在 iPhone / iPad 交替使用 — so the plan shell + confidence + overrides
 * must follow the account, not the device.
 *
 * Architecture (design D10):
 *   - `db.meta` is the SYNCED authority; a `db.meta.put` fires the Dexie push
 *     hook (`meta` is in NEURONS_ADAPTERS) → schedulePush → R2.
 *   - An in-memory mirror is the SYNCHRONOUS read source for the
 *     `useSyncExternalStore` facade; every mutation updates it optimistically
 *     then write-throughs to `db.meta`.
 *   - A localStorage cache of the plan envelope gives a zero-flash synchronous
 *     boot (the phase decision reads `getActivePlan()` before Dexie loads).
 *   - A Dexie `liveQuery` reconciles the mirror + cache from `db.meta` on any
 *     cross-tab write or cross-device pull, then notifies listeners.
 *
 * Merge semantics live in `rescue-sync-keys.ts` (LWW pickers) + `backfill/
 * rescue.ts` (post-pass); this store only mints keys + writes.
 *
 * Spec: neurons-single-subject-rescue "SHALL sync via R2 ... lifecycle-managed".
 */

import { useSyncExternalStore } from 'react'
import { liveQuery, type Subscription } from 'dexie'
import { db } from '../../db'
import { shouldArchiveRescue } from './rescue-lifecycle'
import type { ConfidenceSignal } from './rescue-priority'
import type { OverrideState } from './rescue-stoploss'
import {
  RESCUE_META_PREFIX,
  RESCUE_PLAN_KEY,
  RESCUE_CONF_KEY_PREFIX,
  RESCUE_OVR_KEY_PREFIX,
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
  rescueConfKey,
  rescueOvrKey,
  isSyncedRescueKey,
} from './rescue-sync-keys'

/** localStorage cache of the plan envelope — zero-flash synchronous boot only;
 *  `db.meta` remains the synced authority. */
const ENV_CACHE_KEY = 'neurons:rescue:env:v1'
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
  plan: RescuePlan | null
  /** questionId → pre-reveal confidence tap for the ACTIVE run. */
  confidence: Record<string, ConfidenceSignal>
  /** conceptId → stop-loss override for the ACTIVE run. */
  overrides: Record<string, OverrideState>
  telemetry: RescueTelemetryEvent[]
}

const EMPTY: RescueState = { plan: null, confidence: {}, overrides: {}, telemetry: [] }

// ── in-memory mirror (synchronous read source) ───────────────────────────────
let envelope: PlanEnvelope | null = null
/** full conf/ovr meta key → raw JSON value (all runs; readers scope by active plan). */
const confRows = new Map<string, string>()
const ovrRows = new Map<string, string>()

const listeners = new Set<() => void>()
/** Cached facade snapshot — stable reference between mutations for useSyncExternalStore. */
let snapshot: RescueState = EMPTY

// ── localStorage helpers (fail-open) ─────────────────────────────────────────
function readEnvCache(): PlanEnvelope | null {
  try {
    const raw = localStorage.getItem(ENV_CACHE_KEY)
    return raw ? parsePlanEnvelope(raw) : null
  } catch {
    return null
  }
}
function writeEnvCache(env: PlanEnvelope | null): void {
  try {
    if (env) localStorage.setItem(ENV_CACHE_KEY, JSON.stringify(env))
    else localStorage.removeItem(ENV_CACHE_KEY)
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
  const plan = envelope?.plan ?? null
  const confidence: Record<string, ConfidenceSignal> = {}
  const overrides: Record<string, OverrideState> = {}
  if (plan) {
    const confPrefix = `${RESCUE_CONF_KEY_PREFIX}${plan.createdAt}:`
    for (const [key, raw] of confRows) {
      if (!key.startsWith(confPrefix)) continue
      const rec = parseConfRecord(raw)
      if (rec) confidence[key.slice(confPrefix.length)] = rec.signal
    }
    const ovrPrefix = `${RESCUE_OVR_KEY_PREFIX}${plan.createdAt}:`
    for (const [key, raw] of ovrRows) {
      if (!key.startsWith(ovrPrefix)) continue
      const rec = parseOvrRecord(raw)
      if (rec) overrides[key.slice(ovrPrefix.length)] = { setAt: rec.setAt, attemptsAtOverride: rec.attemptsAtOverride }
    }
  }
  return { plan, confidence, overrides, telemetry: readTelemetry() }
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
function writeEnvelope(env: PlanEnvelope): void {
  envelope = env
  writeEnvCache(env)
  putMeta(RESCUE_PLAN_KEY, JSON.stringify(env))
  notify()
}

// ── reads ────────────────────────────────────────────────────────────────────
export function getRescueState(): RescueState {
  return snapshot
}
export function getActivePlan(): RescuePlan | null {
  return envelope?.plan ?? null
}
export function getConfidence(questionId: string): ConfidenceSignal {
  const plan = getActivePlan()
  if (!plan) return undefined
  const raw = confRows.get(rescueConfKey(plan.createdAt, questionId))
  return raw ? (parseConfRecord(raw)?.signal ?? undefined) : undefined
}
export function getOverride(conceptId: string): OverrideState | undefined {
  const plan = getActivePlan()
  if (!plan) return undefined
  const raw = ovrRows.get(rescueOvrKey(plan.createdAt, conceptId))
  const rec = raw ? parseOvrRecord(raw) : null
  return rec ? { setAt: rec.setAt, attemptsAtOverride: rec.attemptsAtOverride } : undefined
}

// ── lifecycle ────────────────────────────────────────────────────────────────
export interface StartRescueInput {
  familyId: string
  examDate: string
  dailyMinutes: number
}
export type StartRescueResult =
  | { ok: true; plan: RescuePlan; resumed?: boolean }
  | { ok: false; needsConfirm: true; current: RescuePlan }

/**
 * Start (or replace) a rescue plan. One-at-a-time ACCOUNT-WIDE: if a DIFFERENT
 * family already has an active plan (possibly created on another device) and
 * `replace` is not set, returns `needsConfirm` so the UI can prompt. Starting a
 * new plan mints a fresh `createdAt` which re-scopes all confidence / override
 * reads — the previous run's keys are simply ignored (no delete writes).
 *
 * SAME family with a live plan and no explicit `replace` → CONTINUE the existing
 * run (`resumed: true`, zero writes). Minting a fresh `createdAt` here would be a
 * silent restart: the new envelope's later `updatedAt` LWW-wins over the cloud
 * run, wiping its blitz marker + run-scoped confidence/overrides account-wide
 * (the exact cross-device takeover window review-B1 closed). Only an explicit
 * replace (換科 confirm / deliberate reset) mints a new run.
 */
export function startRescue(input: StartRescueInput, opts?: { replace?: boolean }): StartRescueResult {
  const current = getActivePlan()
  if (current && !opts?.replace) {
    if (current.familyId !== input.familyId) {
      return { ok: false, needsConfirm: true, current }
    }
    return { ok: true, plan: current, resumed: true }
  }
  const now = Date.now()
  const plan: RescuePlan = { ...input, createdAt: now, lastStudiedAt: now }
  // A locally-started plan is "known" — its reconcile note never fires here.
  addKnownPlan(now)
  writeEnvelope({ plan, updatedAt: now })
  return { ok: true, plan }
}

/** Abandon the active plan — writes an explicit `plan: null` envelope (LWW-null,
 *  propagates the clear to every device). Reverts absorption via the plan-null signal. */
export function abandonRescue(): void {
  if (!getActivePlan()) return
  writeEnvelope({ plan: null, updatedAt: Date.now() })
}

/** Auto-archive if `examDate + 1 day` has been reached. Returns whether it archived. */
export function archiveIfDue(todayISO: string): boolean {
  const plan = getActivePlan()
  if (plan && shouldArchiveRescue(plan.examDate, todayISO)) {
    writeEnvelope({ plan: null, updatedAt: Date.now() })
    return true
  }
  return false
}

export function touchLastStudied(now: number = Date.now()): void {
  const plan = getActivePlan()
  if (!plan) return
  writeEnvelope({ plan: { ...plan, lastStudiedAt: now }, updatedAt: now })
}

// ── per-run mutations ─────────────────────────────────────────────────────────
export function recordConfidence(questionId: string, signal: ConfidenceSignal): void {
  const plan = getActivePlan()
  if (!plan || signal === undefined) return
  const key = rescueConfKey(plan.createdAt, questionId)
  const value = JSON.stringify({ signal, at: Date.now() })
  confRows.set(key, value)
  putMeta(key, value)
  notify()
}

export function setOverride(conceptId: string, override: OverrideState): void {
  const plan = getActivePlan()
  if (!plan) return
  const key = rescueOvrKey(plan.createdAt, conceptId)
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
export function markBlitzDone(planCreatedAt: number): void {
  const plan = getActivePlan()
  if (!plan || plan.createdAt !== planCreatedAt) return
  const now = Date.now()
  writeEnvelope({ plan: { ...plan, blitzDoneAt: now }, updatedAt: now })
}
export function isBlitzDone(planCreatedAt: number): boolean {
  const plan = getActivePlan()
  return !!plan && plan.createdAt === planCreatedAt && plan.blitzDoneAt != null
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

/** Load the mirror from a batch of `rescue:v1:*` meta rows (authoritative). */
function loadFromRows(rows: Array<{ key: string; value: string }>): void {
  envelope = null
  confRows.clear()
  ovrRows.clear()
  for (const row of rows) {
    if (row.key === RESCUE_PLAN_KEY) {
      envelope = parsePlanEnvelope(row.value)
    } else if (row.key.startsWith(RESCUE_CONF_KEY_PREFIX)) {
      confRows.set(row.key, row.value)
    } else if (row.key.startsWith(RESCUE_OVR_KEY_PREFIX)) {
      ovrRows.set(row.key, row.value)
    }
  }
  writeEnvCache(envelope)
}

/**
 * One-time migration of the legacy device-local blob (`neurons:rescue:v1`) into
 * the synced meta keys (design D9). Conservative timestamp: seeds `updatedAt` /
 * `at` from `plan.lastStudiedAt` so any genuinely newer cloud action wins over
 * the migrated shell. Idempotent — a device-local marker prevents re-seeding
 * (so an account-switch wipe can never resurrect the outgoing account's shell).
 * The legacy blob is KEPT as a read-only rollback fallback (owner open-Q #5).
 */
export async function migrateRescueLocalState(): Promise<void> {
  let alreadyMigrated = false
  try {
    alreadyMigrated = localStorage.getItem(MIGRATED_KEY) === '1'
  } catch {
    /* fail-open: treat as not migrated; the db-envelope guard below still holds */
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
  // regardless of whether the plan shell is seeded or discarded below).
  if (legacy?.telemetry && Array.isArray(legacy.telemetry) && readTelemetry().length === 0) {
    writeTelemetry(legacy.telemetry.slice(-TELEMETRY_CAP))
  }

  // If the cloud already holds a plan envelope (pulled before migration), discard
  // the local shell — answers never depended on it.
  const existing = await db.meta.get(RESCUE_PLAN_KEY)
  if (existing) return

  const plan = legacy?.plan
  if (!plan || typeof plan.createdAt !== 'number') return

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
  await db.meta.put({ key: RESCUE_PLAN_KEY, value: JSON.stringify({ plan: migratedPlan, updatedAt: seedAt }) })
  for (const [qid, signal] of Object.entries(legacy?.confidence ?? {})) {
    if (signal !== 'sure' && signal !== 'guess') continue
    await db.meta.put({ key: rescueConfKey(plan.createdAt, qid), value: JSON.stringify({ signal, at: seedAt }) })
  }
  for (const [cid, ov] of Object.entries(legacy?.overrides ?? {})) {
    if (!ov || typeof ov.setAt !== 'number') continue
    await db.meta.put({
      key: rescueOvrKey(plan.createdAt, cid),
      value: JSON.stringify({ setAt: ov.setAt, attemptsAtOverride: ov.attemptsAtOverride ?? 0 }),
    })
  }
  // Rows were seeded — flag the engine mount to schedule an explicit push (the
  // puts above may predate the Dexie push hooks; see consumeRescueMigrationPush).
  migrationPushPending = true
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
  // first render already has the plan (zero-flash) before the async load lands.
  const cached = readEnvCache()
  if (cached) {
    envelope = cached
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
    localStorage.removeItem(ENV_CACHE_KEY)
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

/** Live-reactive active plan (re-renders on any same-tab / cross-device rescue change). */
export function useRescuePlan(): RescuePlan | null {
  return useSyncExternalStore(
    subscribeRescue,
    () => snapshot.plan,
    () => null,
  )
}

/** Live-reactive full rescue state (plan + confidence + overrides + telemetry). */
export function useRescueState(): RescueState {
  return useSyncExternalStore(subscribeRescue, getRescueState, () => EMPTY)
}

/** Test hook: clear the in-memory mirror + localStorage + db.meta rescue keys. */
export async function __resetRescueStoreForTests(): Promise<void> {
  hydrateStarted = false
  hydrated = false
  migrationPushPending = false
  if (liveSub) {
    liveSub.unsubscribe()
    liveSub = null
  }
  envelope = null
  confRows.clear()
  ovrRows.clear()
  snapshot = EMPTY
  try {
    localStorage.removeItem(ENV_CACHE_KEY)
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
