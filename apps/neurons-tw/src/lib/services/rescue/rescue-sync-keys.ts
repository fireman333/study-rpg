/**
 * Single-subject rescue — synced key family (single source of truth).
 *
 * The rescue plan / confidence / override state rides the existing R2 `neurons`
 * bundle meta path (add-neurons-rescue-r2-sync). This module is the ONE place
 * that mints the `rescue:v1:` keys, defines the membership matcher, and defines
 * the merge (LWW) pick functions — so `lib/sync/tables.ts` (the metaAdapter
 * filter), `lib/sync/backfill/rescue.ts` (the post-pass), `lib/sync/
 * account-guard.ts` (the wipe), and `rescue-store.ts` (the writer) all import
 * from here and can never drift. Pure — NO React / Dexie imports, so the sync
 * layer stays UI-free (mirrors how the prescription matcher is single-sourced
 * from the prescription service).
 *
 * Merge contract (per neurons-cloud-sync family requirement, contract (b)):
 *   - `rescue:v1:plan` — envelope `{ plan, updatedAt, }` LWW on `updatedAt`
 *     (latest-action-wins; explicit `plan: null` clears, no tombstone);
 *   - `rescue:v1:conf:{planCreatedAt}:{qid}` — `{ signal, at }` LWW on `at`;
 *   - `rescue:v1:ovr:{planCreatedAt}:{conceptId}` — `{ setAt, attemptsAtOverride }`
 *     LWW on `setAt`.
 * All ties broken by a deterministic total order over the canonically-serialized
 * value → the merge converges bidirectionally in any pull order (semilattice).
 *
 * Spec: neurons-single-subject-rescue "Rescue synced state SHALL ride the meta
 * sync path as a windowed rescue key family".
 */

import type { ConfidenceSignal } from './rescue-priority'
import type { OverrideState } from './rescue-stoploss'

// ── key namespace ────────────────────────────────────────────────────────────
/** Account-OWNED prefix — every rescue synced key lives under this. */
export const RESCUE_META_PREFIX = 'rescue:v1:'
/** LEGACY single plan-envelope key (pre-multi-subject). NOT synced by the
 *  matcher any more — v28 never snapshots it; it survives only as migration
 *  input: the device-local hydrate reads it from `db.meta`, and the one-time
 *  CLOUD legacy migration reads it from the RAW pulled bundle meta in the rescue
 *  backfill (bypassing this matcher, which would otherwise skip it). */
export const RESCUE_PLAN_KEY = 'rescue:v1:plan'
/** Per-family plan key prefix — one active plan per family (`rescue:v1:plan:{familyId}`). */
export const RESCUE_PLAN_KEY_PREFIX = 'rescue:v1:plan:'
/** Run-scoped confidence key prefix. */
export const RESCUE_CONF_KEY_PREFIX = 'rescue:v1:conf:'
/** Run-scoped override key prefix. */
export const RESCUE_OVR_KEY_PREFIX = 'rescue:v1:ovr:'

/** Per-family plan key mint. */
export function rescuePlanKey(familyId: string): string {
  return `${RESCUE_PLAN_KEY_PREFIX}${familyId}`
}
/** Confidence key — run-scoped AND family-scoped (`{planCreatedAt}:{familyId}:{questionId}`).
 *  The family segment guards against two coexisting plans sharing a `planCreatedAt`
 *  (a `Date.now()` mint) — a run-only scope could otherwise collide across subjects. */
export function rescueConfKey(planCreatedAt: number, familyId: string, questionId: string): string {
  return `${RESCUE_CONF_KEY_PREFIX}${planCreatedAt}:${familyId}:${questionId}`
}
/** Override key — run-scoped AND family-scoped (`{planCreatedAt}:{familyId}:{conceptId}`).
 *  The family segment is load-bearing: 68 conceptIds are shared across subjects,
 *  so without it two coexisting plans stop-lossing the same concept would collide. */
export function rescueOvrKey(planCreatedAt: number, familyId: string, conceptId: string): string {
  return `${RESCUE_OVR_KEY_PREFIX}${planCreatedAt}:${familyId}:${conceptId}`
}

// ── run-sync window (dogfood-tunable) ────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000
/** Trailing run-sync window: `conf:`/`ovr:` keys whose embedded `planCreatedAt`
 *  is older than this age out of the bundle (bounds growth; stale runs can never
 *  resurrect). Initial 14 days per design D3 (owner-locked open-Q #1). */
export const RESCUE_RUN_SYNC_WINDOW_MS = 14 * DAY_MS
/** Forward clock-skew tolerance (a peer's clock may be slightly ahead). */
export const RESCUE_RUN_SYNC_FORWARD_SKEW_MS = 1 * DAY_MS

/**
 * Whether a `rescue:v1:*` meta key participates in cross-device sync. Used by
 * BOTH the metaAdapter snapshot and its apply (via `isSyncedMetaKey`), so the
 * two directions never diverge. Membership:
 *   - `rescue:v1:plan:{familyId}` → always (one per active family);
 *   - `rescue:v1:conf:{planCreatedAt}:{familyId}:…` /
 *     `rescue:v1:ovr:{planCreatedAt}:{familyId}:…`
 *     → iff `planCreatedAt ∈ [now − 14d, now + 1d]`;
 *   - the LEGACY single `rescue:v1:plan` (no family segment) → NEVER (v28 does
 *     not snapshot it; a cloud legacy key is recovered by the backfill's
 *     raw-bundle migration read, not this matcher);
 *   - any other `rescue:v1:*` key (e.g. a telemetry key) → NEVER.
 */
export function isSyncedRescueKey(key: string, now: number = Date.now()): boolean {
  // Legacy single key is intentionally NOT synced (see doc + cloud migration).
  if (key === RESCUE_PLAN_KEY) return false
  if (key.startsWith(RESCUE_PLAN_KEY_PREFIX)) return true
  const prefix = key.startsWith(RESCUE_CONF_KEY_PREFIX)
    ? RESCUE_CONF_KEY_PREFIX
    : key.startsWith(RESCUE_OVR_KEY_PREFIX)
      ? RESCUE_OVR_KEY_PREFIX
      : null
  if (prefix === null) return false
  // Per-family shape guard: conf/ovr keys are `{createdAt}:{familyId}:{id}` — at
  // least 3 segments with a non-empty familyId. Reject the legacy v27 2-segment
  // shape `{createdAt}:{id}` (no family scope) so a pre-multi key is never
  // admitted; without the family segment it could collide across coexisting
  // subjects. (Codex/Fable review fix 1)
  const parts = key.slice(prefix.length).split(':')
  if (parts.length < 3 || parts[1] === '') return false
  const createdAt = parseRunCreatedAt(key, prefix)
  if (createdAt === null) return false
  return createdAt >= now - RESCUE_RUN_SYNC_WINDOW_MS && createdAt <= now + RESCUE_RUN_SYNC_FORWARD_SKEW_MS
}

/** Extract the embedded `planCreatedAt` epoch-ms (the FIRST segment) from a
 *  conf/ovr key `{createdAt}:{familyId}:{id}`. `null` if malformed. The first
 *  token is always the numeric createdAt, so parsing the leading token is
 *  unambiguous even though the key now carries a family segment after it. */
export function parseRunCreatedAt(key: string, prefix: string): number | null {
  const rest = key.slice(prefix.length) // '{createdAt}:{id}'
  const cut = rest.indexOf(':')
  if (cut < 0) return null
  const n = Number(rest.slice(0, cut))
  return Number.isFinite(n) ? n : null
}

// ── value shapes ─────────────────────────────────────────────────────────────
export interface RescuePlan {
  familyId: string
  /** YYYY-MM-DD. */
  examDate: string
  dailyMinutes: number
  createdAt: number
  lastStudiedAt: number
  /** epoch ms the diagnostic blitz completed for THIS plan (D6). Absent = not
   *  yet run → a fresh plan (new createdAt) naturally re-arms the blitz. */
  blitzDoneAt?: number
}

/** Timestamped plan envelope stored at `rescue:v1:plan`. `plan: null` = cleared
 *  (abandon / auto-archive) — an explicit LWW-null, never a tombstone. */
export interface PlanEnvelope {
  plan: RescuePlan | null
  updatedAt: number
}

/** Pre-reveal confidence record stored at a `conf:` key. */
export interface ConfRecord {
  signal: Exclude<ConfidenceSignal, undefined>
  /** epoch ms of the tap (LWW key). */
  at: number
}

/** Stop-loss override record stored at an `ovr:` key (same shape as OverrideState). */
export type OvrRecord = OverrideState

// ── parsers / validators ─────────────────────────────────────────────────────
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Strict RescuePlan validator (used to drop a malformed stored plan). */
function isValidPlan(p: unknown): p is RescuePlan {
  if (!p || typeof p !== 'object') return false
  const r = p as Record<string, unknown>
  if (typeof r.familyId !== 'string') return false
  if (typeof r.examDate !== 'string') return false
  if (!isFiniteNumber(r.dailyMinutes)) return false
  if (!isFiniteNumber(r.createdAt)) return false
  if (!isFiniteNumber(r.lastStudiedAt)) return false
  if (r.blitzDoneAt !== undefined && !isFiniteNumber(r.blitzDoneAt)) return false
  return true
}

export function parsePlanEnvelope(raw: string): PlanEnvelope | null {
  try {
    const e = JSON.parse(raw) as Record<string, unknown>
    if (!e || typeof e !== 'object') return null
    if (!isFiniteNumber(e.updatedAt)) return null
    if (e.plan === null) return { plan: null, updatedAt: e.updatedAt }
    if (!isValidPlan(e.plan)) return null
    return { plan: e.plan, updatedAt: e.updatedAt }
  } catch {
    return null
  }
}

/** Whether a raw `rescue:v1:plan` value is a well-formed envelope (drop-if-not). */
export function isValidPlanEnvelopeRaw(raw: unknown): boolean {
  return typeof raw === 'string' && parsePlanEnvelope(raw) !== null
}

export function parseConfRecord(raw: string): ConfRecord | null {
  try {
    const r = JSON.parse(raw) as Record<string, unknown>
    if (!r || typeof r !== 'object') return null
    if (r.signal !== 'sure' && r.signal !== 'guess') return null
    if (!isFiniteNumber(r.at)) return null
    return { signal: r.signal, at: r.at }
  } catch {
    return null
  }
}

export function parseOvrRecord(raw: string): OvrRecord | null {
  try {
    const r = JSON.parse(raw) as Record<string, unknown>
    if (!r || typeof r !== 'object') return null
    if (!isFiniteNumber(r.setAt)) return null
    if (!isFiniteNumber(r.attemptsAtOverride)) return null
    return { setAt: r.setAt, attemptsAtOverride: r.attemptsAtOverride }
  } catch {
    return null
  }
}

// ── deterministic tiebreak ───────────────────────────────────────────────────
/** Canonical (recursively key-sorted) JSON — a stable total order for ties, so
 *  the same-timestamp winner is identical on every device regardless of pull
 *  order or the raw string's key ordering / whitespace. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value))
}
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortDeep((value as Record<string, unknown>)[k])
    }
    return out
  }
  return value
}

// ── LWW pick functions (pure; return raw to persist, or null to keep local) ──
/**
 * Plan-envelope LWW on `updatedAt` (latest-action-wins). Explicit `plan: null`
 * envelopes participate exactly like non-null ones (a clear with a newer
 * `updatedAt` wins). Malformed incoming never wins; a valid incoming replaces a
 * malformed local. Ties broken by canonical order (larger wins) → bidirectional
 * convergence.
 */
export function pickPlanEnvelopeLWW(localRaw: string | undefined, incomingRaw: string): string | null {
  const incoming = parsePlanEnvelope(incomingRaw)
  if (!incoming) return null // malformed incoming → keep local
  if (localRaw === undefined) return incomingRaw
  const local = parsePlanEnvelope(localRaw)
  if (!local) return incomingRaw // malformed local → valid incoming wins
  if (incoming.updatedAt > local.updatedAt) return incomingRaw
  if (incoming.updatedAt < local.updatedAt) return null
  // tie → deterministic total order (larger canonical wins)
  return canonicalize(incoming) > canonicalize(local) ? incomingRaw : null
}

/** Confidence LWW on `at` (latest pre-reveal tap wins). */
export function pickConfLWW(localRaw: string | undefined, incomingRaw: string): string | null {
  return pickRecordLWW(localRaw, incomingRaw, parseConfRecord, (r) => r.at)
}

/** Override LWW on `setAt`. */
export function pickOvrLWW(localRaw: string | undefined, incomingRaw: string): string | null {
  return pickRecordLWW(localRaw, incomingRaw, parseOvrRecord, (r) => r.setAt)
}

function pickRecordLWW<T>(
  localRaw: string | undefined,
  incomingRaw: string,
  parse: (raw: string) => T | null,
  ts: (r: T) => number,
): string | null {
  const incoming = parse(incomingRaw)
  if (!incoming) return null
  if (localRaw === undefined) return incomingRaw
  const local = parse(localRaw)
  if (!local) return incomingRaw
  if (ts(incoming) > ts(local)) return incomingRaw
  if (ts(incoming) < ts(local)) return null
  return canonicalize(incoming) > canonicalize(local) ? incomingRaw : null
}
